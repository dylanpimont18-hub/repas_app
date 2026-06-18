// js/planning.js
import { dbGetPlanning, dbUpsertPlanning } from './db.js'

export const JOURS   = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
export const MOMENTS = ['midi','soir']

export function getSemaineKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export async function getPlanning(semaineKey) {
  return await dbGetPlanning(semaineKey)
}

export async function assignerRepas(semaineKey, jour, moment, recetteId, portions) {
  await dbUpsertPlanning(semaineKey, jour, moment, recetteId, portions)
}

export async function supprimerRepas(semaineKey, jour, moment) {
  await dbUpsertPlanning(semaineKey, jour, moment, null, null)
}

export async function importerSemaineIA(semaineKey, semaineIA, addRecetteFn) {
  for (const [jour, repas] of Object.entries(semaineIA)) {
    for (const [moment, recette] of Object.entries(repas)) {
      if (recette) {
        const id = await addRecetteFn(recette)
        await dbUpsertPlanning(semaineKey, jour, moment, id, recette.portions || 2)
      } else {
        await dbUpsertPlanning(semaineKey, jour, moment, null, null)
      }
    }
  }
}

export async function importerCreneaux(semaineKey, repas, addRecetteFn) {
  for (const { jour, moment, recette } of repas) {
    if (recette) {
      const id = await addRecetteFn(recette)
      await dbUpsertPlanning(semaineKey, jour, moment, id, recette.portions || 2)
    }
  }
}

export async function getJoursAvecRepas(semaineKey) {
  const planning = await dbGetPlanning(semaineKey)
  return JOURS.flatMap(jour =>
    MOMENTS.filter(m => planning[jour]?.[m]?.id).map(m => ({ jour, moment: m, ...planning[jour][m] }))
  )
}
