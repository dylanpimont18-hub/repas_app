// js/recettes.js
import { dbGetRecettes, dbGetRecetteById, dbUpsertRecette, dbDeleteRecette } from './db.js'

export async function getRecettes(filtres = {}) {
  let r = await dbGetRecettes()
  if (filtres.vegetarien) r = r.filter(x => x.vegetarien)
  if (filtres.maxMinutes) r = r.filter(x => (x.temps_prep + x.temps_cuisson) <= filtres.maxMinutes)
  return r
}

export async function getRecetteById(id) {
  return await dbGetRecetteById(id)
}

export async function addRecette(recette) {
  return await dbUpsertRecette(recette)
}

export async function deleteRecette(id) {
  await dbDeleteRecette(id)
}
