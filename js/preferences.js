// js/preferences.js — Préférences par profil, avec cache mémoire (une requête par page)
import { dbGetToutesPreferences, dbSetPreference } from './db.js'
import { getAllParCategorie, getAllIngredients } from './custom-ingredients.js'

let cache = null

function profilNom(qui) { return qui === 'dylan' ? 'dylan' : 'femme' }

async function getToutes() {
  if (!cache) cache = dbGetToutesPreferences()
  try { return await cache } catch (e) { cache = null; throw e }
}

// À appeler quand l'autre membre du foyer a noté des ingrédients (temps réel)
export function invaliderPreferences() { cache = null }

export async function getProfil(qui) {
  return (await getToutes())[profilNom(qui)]
}

export async function setPreference(qui, ingredientId, niveau) {
  await dbSetPreference(profilNom(qui), ingredientId, niveau)
  const profil = await getProfil(qui)
  if (niveau === null) delete profil[ingredientId]
  else profil[ingredientId] = niveau
}

export async function getANoter(qui, categorie) {
  const [profil, all] = await Promise.all([getProfil(qui), getAllParCategorie(categorie)])
  return all.filter(i => !profil[i.id])
}

// { faits, total } pour la catégorie
export async function getProgression(qui, categorie) {
  const [profil, all] = await Promise.all([getProfil(qui), getAllParCategorie(categorie)])
  return { faits: all.filter(i => profil[i.id]).length, total: all.length }
}

export async function getTotalANoter(qui) {
  const [profil, all] = await Promise.all([getProfil(qui), getAllIngredients()])
  return all.filter(i => !profil[i.id]).length
}
