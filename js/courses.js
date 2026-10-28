// js/courses.js — Liste de courses du cycle : 🛒 samedi magasin + 🚗 mercredi drive
import { chargerCycle }     from './planning.js'
import { getRecettesByIds } from './recettes.js'
import { repartirCourses, ajouterArticlesLibres, separerPlacard, cleIngredient } from './utils.js'
import { dbGetCoursesEtat, dbToggleCourse, dbResetCourses, dbGetCoursesLibres, dbAddCourseLibre,
         dbDeleteCourseLibre, dbGetReglage, dbSetReglage } from './db.js'

// Liste complète du cycle : recettes + articles ajoutés à la main, moins ce qui est toujours au placard
// → { parties: { samedi: { rayon: [item] }, mercredi: {…} }, auPlacard: [item] } ; item = { nom, quantites, libreId? }
export async function listeCourses(samedi, cleCycle) {
  const [parties, libres, placard] = await Promise.all([genererListeCycle(samedi), dbGetCoursesLibres(cleCycle), getPlacard()])
  return separerPlacard(ajouterArticlesLibres(parties, libres), placard)
}

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

// Articles ajoutés à la main (pain, lessive…)
export async function ajouterArticle(cle, nom, partie) { return dbAddCourseLibre(cle, nom.trim(), partie) }
export async function supprimerArticle(id) { return dbDeleteCourseLibre(id) }

// « Toujours au placard » : réglage partagé du foyer, liste de clés d'ingrédients
export async function getPlacard() {
  const v = await dbGetReglage('placard').catch(() => null)
  return Array.isArray(v) ? v : []
}
export async function basculerPlacard(nom, auPlacard) {
  const cle = cleIngredient(nom)
  const actuel = await getPlacard()
  const suivant = auPlacard ? [...new Set([...actuel, cle])] : actuel.filter(c => c !== cle)
  await dbSetReglage('placard', suivant)
}
