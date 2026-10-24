// js/custom-ingredients.js — Ingrédients personnalisés, partagés via Supabase (table ingredients_custom)
import { INGREDIENTS, getParCategorie } from './data/ingredients.js'
import { dbGetCustomIngredients, dbAddCustomIngredients, dbDeleteCustomIngredient } from './db.js'

const ANCIENNE_CLE_LOCALE = 'repas_custom_ingredients'

let cache = null

// Migration unique : envoie vers Supabase les ingrédients créés quand ils étaient en localStorage
async function migrerDepuisLocalStorage() {
  let anciens = []
  try { anciens = JSON.parse(localStorage.getItem(ANCIENNE_CLE_LOCALE) || '[]') } catch { /* ignoré */ }
  if (!anciens.length) return
  await dbAddCustomIngredients(anciens)
  localStorage.removeItem(ANCIENNE_CLE_LOCALE)
}

export async function getCustomIngredients() {
  if (!cache) {
    await migrerDepuisLocalStorage().catch(e => console.warn('Migration ingrédients perso échouée', e))
    cache = await dbGetCustomIngredients()
  }
  return cache
}

// À appeler quand un autre membre du foyer a modifié la liste (temps réel)
export function invaliderCustomIngredients() { cache = null }

export async function addCustomIngredient({ nom, categorie, emoji }) {
  const slug = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  const ing  = { id: 'custom_' + slug + '_' + Date.now(), nom: nom.trim(), categorie, emoji: emoji.trim() || '🍽️', custom: true }
  await dbAddCustomIngredients([ing])
  if (cache) cache.push(ing)
  return ing
}

export async function removeCustomIngredient(id) {
  await dbDeleteCustomIngredient(id)
  if (cache) cache = cache.filter(i => i.id !== id)
}

export async function getAllParCategorie(categorieId) {
  return [
    ...getParCategorie(categorieId),
    ...(await getCustomIngredients()).filter(i => i.categorie === categorieId),
  ]
}

export async function getAllIngredients() {
  return [...INGREDIENTS, ...(await getCustomIngredients())]
}

export async function getIngredientParId(id) {
  return (await getAllIngredients()).find(i => i.id === id) || null
}
