// js/custom-ingredients.js — gestion des ingrédients personnalisés (localStorage)
import { INGREDIENTS, getParCategorie } from './data/ingredients.js'

const KEY = 'repas_custom_ingredients'

export function getCustomIngredients() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function addCustomIngredient({ nom, categorie, emoji }) {
  const slug = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  const id   = 'custom_' + slug + '_' + Date.now()
  const ing  = { id, nom: nom.trim(), categorie, emoji: emoji.trim() || '🍽️', custom: true }
  const list = getCustomIngredients()
  list.push(ing)
  localStorage.setItem(KEY, JSON.stringify(list))
  return ing
}

export function removeCustomIngredient(id) {
  const list = getCustomIngredients().filter(i => i.id !== id)
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function getAllParCategorie(categorieId) {
  return [
    ...getParCategorie(categorieId),
    ...getCustomIngredients().filter(i => i.categorie === categorieId),
  ]
}

export function getAllIngredients() {
  return [...INGREDIENTS, ...getCustomIngredients()]
}
