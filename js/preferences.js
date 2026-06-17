// js/preferences.js
import { KEYS, load, save } from './storage.js'
import { getParCategorie } from './data/ingredients.js'

export function getProfil(qui) {
  return load(qui === 'dylan' ? KEYS.profilDylan : KEYS.profilFemme, {})
}

export function setPreference(qui, ingredientId, niveau) {
  const key    = qui === 'dylan' ? KEYS.profilDylan : KEYS.profilFemme
  const profil = load(key, {})
  profil[ingredientId] = niveau
  save(key, profil)
}

export function getProfilFiltre(qui, niveau) {
  return Object.entries(getProfil(qui))
    .filter(([, v]) => v === niveau)
    .map(([id]) => id)
}

export function getANoter(qui, categorie) {
  const profil = getProfil(qui)
  return getParCategorie(categorie).filter(i => !profil[i.id])
}

export function getProgression(qui, categorie) {
  const total = getParCategorie(categorie).length
  if (total === 0) return 1
  const profil = getProfil(qui)
  return getParCategorie(categorie).filter(i => profil[i.id]).length / total
}
