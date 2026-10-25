// js/recettes.js
import { dbGetRecettes, dbGetRecetteById, dbGetRecettesByIds, dbUpsertRecette, dbDeleteRecette } from './db.js'

export async function getRecettes(filtres = {}) {
  return filtrerRecettes(await dbGetRecettes(), filtres)
}

// Périmètre affiché : recherche par nom, livre (les autres filtres : js/filtres-recettes.js)
export function filtrerRecettes(r, filtres = {}) {
  if (filtres.recherche)  r = r.filter(x => x.nom.toLowerCase().includes(filtres.recherche.toLowerCase()))
  if (filtres.livre)      r = r.filter(x => x.livre_id === filtres.livre)
  return r
}

export async function getRecetteById(id) {
  return await dbGetRecetteById(id)
}

// { id: recette } en une seule requête
export async function getRecettesByIds(ids) {
  return await dbGetRecettesByIds(ids)
}

export async function addRecette(recette) {
  return await dbUpsertRecette(recette)
}

export async function deleteRecette(id) {
  await dbDeleteRecette(id)
}
