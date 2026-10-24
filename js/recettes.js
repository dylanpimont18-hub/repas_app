// js/recettes.js
import { dbGetRecettes, dbGetRecetteById, dbGetRecettesByIds, dbUpsertRecette, dbDeleteRecette } from './db.js'

export async function getRecettes(filtres = {}) {
  let r = await dbGetRecettes()
  if (filtres.vegetarien) r = r.filter(x => x.vegetarien)
  if (filtres.maxMinutes) r = r.filter(x => (x.temps_prep + x.temps_cuisson) <= filtres.maxMinutes)
  if (filtres.recherche)  r = r.filter(x => x.nom.toLowerCase().includes(filtres.recherche.toLowerCase()))
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
