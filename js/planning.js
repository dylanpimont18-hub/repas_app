// js/planning.js
import { KEYS, load, save } from './storage.js'

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

export function getPlanning(semaineKey) {
  const all = load(KEYS.planning, {})
  if (!all[semaineKey]) {
    all[semaineKey] = {}
    JOURS.forEach(j => { all[semaineKey][j] = { midi: null, soir: null } })
  }
  return all[semaineKey]
}

export function assignerRepas(semaineKey, jour, moment, recetteId, portions) {
  const all = load(KEYS.planning, {})
  if (!all[semaineKey]) all[semaineKey] = {}
  if (!all[semaineKey][jour]) all[semaineKey][jour] = { midi: null, soir: null }
  all[semaineKey][jour][moment] = recetteId ? { id: recetteId, portions } : null
  save(KEYS.planning, all)
}

export function supprimerRepas(semaineKey, jour, moment) {
  assignerRepas(semaineKey, jour, moment, null, null)
}

export function importerSemaineIA(semaineKey, semaineIA, addRecetteFn) {
  const all = load(KEYS.planning, {})
  all[semaineKey] = {}
  Object.entries(semaineIA).forEach(([jour, repas]) => {
    all[semaineKey][jour] = {}
    Object.entries(repas).forEach(([moment, recette]) => {
      if (recette) {
        const id = addRecetteFn(recette)
        all[semaineKey][jour][moment] = { id, portions: recette.portions || 2 }
      } else {
        all[semaineKey][jour][moment] = null
      }
    })
  })
  save(KEYS.planning, all)
}

export function getJoursAvecRepas(semaineKey) {
  const planning = getPlanning(semaineKey)
  return JOURS.flatMap(jour =>
    MOMENTS.filter(m => planning[jour]?.[m]?.id).map(m => ({ jour, moment: m, ...planning[jour][m] }))
  )
}
