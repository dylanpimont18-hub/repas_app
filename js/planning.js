// js/planning.js
import { dbGetPlanning, dbUpsertPlanning, dbUpsertPlanningLot, dbUpsertRecettes } from './db.js'
import { getSemaineKey } from './utils.js'

export { getSemaineKey }
export const JOURS   = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
export const MOMENTS = ['midi','soir']

export async function getPlanning(semaineKey) {
  return await dbGetPlanning(semaineKey)
}

export async function assignerRepas(semaineKey, jour, moment, recetteId, portions) {
  await dbUpsertPlanning(semaineKey, jour, moment, recetteId, portions)
}

export async function supprimerRepas(semaineKey, jour, moment) {
  await dbUpsertPlanning(semaineKey, jour, moment, null, null)
}

// Import des repas générés par l'IA : 2 requêtes au total (recettes puis planning)
// semaineKeys = { 1: 'YYYY-W01', 2: 'YYYY-W02' } — la semaine 1 sert par défaut
export async function importerCreneaux(repas, semaineKeys) {
  const valides = repas.filter(r => r.recette && JOURS.includes(r.jour) && MOMENTS.includes(r.moment))
  const ids = await dbUpsertRecettes(valides.map(r => r.recette))
  await dbUpsertPlanningLot(valides.map((r, i) => ({
    semaine_key: semaineKeys[r.semaine] || semaineKeys[1],
    jour:        r.jour,
    moment:      r.moment,
    recette_id:  ids[i],
    portions:    r.recette.portions || 2,
  })))
}

export async function getJoursAvecRepas(semaineKey) {
  const planning = await dbGetPlanning(semaineKey)
  return JOURS.flatMap(jour =>
    MOMENTS.filter(m => planning[jour]?.[m]?.id).map(m => ({ jour, moment: m, ...planning[jour][m] }))
  )
}

// Ids des recettes présentes dans un planning
export function idsDuPlanning(planning) {
  return JOURS.flatMap(j => MOMENTS.map(m => planning[j]?.[m]?.id)).filter(Boolean)
}
