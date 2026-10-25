// js/recettes.js
import { dbGetRecettes, dbGetRecetteById, dbGetRecettesByIds, dbUpsertRecette, dbDeleteRecette } from './db.js'

export async function getRecettes(filtres = {}) {
  return filtrerRecettes(await dbGetRecettes(), filtres)
}

// Filtres de la bibliothèque : végé, rapide, recherche, livre
export function filtrerRecettes(r, filtres = {}) {
  if (filtres.vegetarien) r = r.filter(x => x.vegetarien)
  if (filtres.maxMinutes) r = r.filter(x => (x.temps_prep + x.temps_cuisson) <= filtres.maxMinutes)
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
