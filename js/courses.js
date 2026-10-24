// js/courses.js
import { getPlanning, JOURS, MOMENTS } from './planning.js'
import { getRecettesByIds }            from './recettes.js'
import { categoriser }                 from './utils.js'
import { dbGetCoursesEtat, dbToggleCourse, dbResetCourses } from './db.js'

export async function genererListeCourses(semaineKey) {
  const planning = await getPlanning(semaineKey)
  const agregat  = {}

  // Collecter tous les slots remplis
  const slots = []
  JOURS.forEach(jour => MOMENTS.forEach(moment => {
    const slot = planning[jour]?.[moment]
    if (slot?.id) slots.push({ ...slot, jour, moment })
  }))

  // Une seule requête pour toutes les recettes de la semaine
  const recettes = await getRecettesByIds(slots.map(s => s.id))

  slots.forEach(slot => {
    const recette = recettes[slot.id]
    if (!recette) return
    const facteur = (slot.portions || 2) / (recette.portions || 2)
    ;(recette.ingredients || []).forEach(ing => {
      const k = ing.nom.toLowerCase().trim()
      if (!k) return
      if (!agregat[k]) agregat[k] = { nom: ing.nom, quantites: [], categorie: categoriser(ing.nom) }
      agregat[k].quantites.push({ valeur: ing.quantite, facteur })
    })
  })

  const groupes = {}
  Object.values(agregat).forEach(ing => {
    if (!groupes[ing.categorie]) groupes[ing.categorie] = []
    groupes[ing.categorie].push({ nom: ing.nom, quantites: ing.quantites })
  })
  return groupes
}

// État des cases à cocher — synchronisé via Supabase (temps réel multi-appareils)
export async function getEtatCourses(semaineKey) { return dbGetCoursesEtat(semaineKey) }
export async function toggleCourse(semaineKey, nom, checked) { return dbToggleCourse(semaineKey, nom, checked) }
export async function resetCourses(semaineKey) { return dbResetCourses(semaineKey) }
