// js/preferences.js
import { dbGetProfil, dbSetPreference } from './db.js'
import { getAllParCategorie, getAllIngredients } from './custom-ingredients.js'

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
  return getAllParCategorie(categorie).filter(i => !profil[i.id])
}

export async function getProgression(qui, categorie) {
  const all   = getAllParCategorie(categorie)
  const total = all.length
  if (total === 0) return 1
  const profil = await getProfil(qui)
  return all.filter(i => profil[i.id]).length / total
}

export async function getTotalANoter(qui) {
  const profil = await getProfil(qui)
  return getAllIngredients().filter(i => !profil[i.id]).length
}
