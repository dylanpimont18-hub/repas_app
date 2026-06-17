// js/preferences.js
import { dbGetProfil, dbSetPreference } from './db.js'
import { getParCategorie }              from './data/ingredients.js'

export async function getProfil(qui) {
  return await dbGetProfil(qui === 'dylan' ? 'dylan' : 'femme')
}

export async function setPreference(qui, ingredientId, niveau) {
  await dbSetPreference(qui === 'dylan' ? 'dylan' : 'femme', ingredientId, niveau)
}

export async function getProfilFiltre(qui, niveau) {
  const profil = await getProfil(qui)
  return Object.entries(profil).filter(([, v]) => v === niveau).map(([id]) => id)
}

export async function getANoter(qui, categorie) {
  const profil = await getProfil(qui)
  return getParCategorie(categorie).filter(i => !profil[i.id])
}

export async function getProgression(qui, categorie) {
  const total = getParCategorie(categorie).length
  if (total === 0) return 1
  const profil = await getProfil(qui)
  return getParCategorie(categorie).filter(i => profil[i.id]).length / total
}
