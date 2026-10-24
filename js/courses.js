// js/courses.js — Liste de courses du cycle : 🛒 samedi magasin + 🚗 mercredi drive
import { chargerCycle }     from './planning.js'
import { getRecettesByIds } from './recettes.js'
import { repartirCourses }  from './utils.js'
import { dbGetCoursesEtat, dbToggleCourse, dbResetCourses } from './db.js'

// → { samedi: { rayon: [{ nom, quantites }] }, mercredi: { ... } }
export async function genererListeCycle(samedi) {
  const { creneaux, occupation } = await chargerCycle(samedi)
  // Les plats sortis du congélo ne demandent aucune course
  const remplis  = creneaux.filter(c => occupation[c.cle] && occupation[c.cle].source !== 'reserve')
  const recettes = await getRecettesByIds(remplis.map(c => occupation[c.cle].id))

  const lignes = []
  for (const c of remplis) {
    const occ = occupation[c.cle]
    const recette = recettes[occ.id]
    if (!recette) continue
    const facteur = (occ.portions || c.portions) / (recette.portions || 4)
    for (const ing of recette.ingredients || []) {
      lignes.push({ partie: c.partie, nom: ing.nom, quantite: ing.quantite, facteur })
    }
  }
  return repartirCourses(lignes)
}

// État des cases à cocher — synchronisé via Supabase (temps réel multi-appareils)
export async function getEtatCourses(cle) { return dbGetCoursesEtat(cle) }
export async function toggleCourse(cle, nom, checked) { return dbToggleCourse(cle, nom, checked) }
export async function resetCourses(cle) { return dbResetCourses(cle) }
