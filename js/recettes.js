// js/recettes.js
import { KEYS, load, save } from './storage.js'

function genId() {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function getRecettes(filtres = {}) {
  let r = load(KEYS.recettes, [])
  if (filtres.vegetarien)  r = r.filter(x => x.vegetarien)
  if (filtres.maxMinutes)  r = r.filter(x => (x.temps_prep + x.temps_cuisson) <= filtres.maxMinutes)
  return r
}

export function getRecetteById(id) {
  return load(KEYS.recettes, []).find(r => r.id === id) || null
}

export function addRecette(recette) {
  const recettes = load(KEYS.recettes, [])
  const id       = recette.id || genId()
  const idx      = recettes.findIndex(r => r.id === id)
  const entry    = { ...recette, id, date: recette.date || new Date().toISOString() }
  if (idx >= 0) recettes[idx] = entry; else recettes.push(entry)
  save(KEYS.recettes, recettes)
  return id
}

export function deleteRecette(id) {
  save(KEYS.recettes, load(KEYS.recettes, []).filter(r => r.id !== id))
}
