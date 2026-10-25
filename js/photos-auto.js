// js/photos-auto.js — Photos automatiques des nouvelles recettes IA (réglage partagé) + file d'attente en arrière-plan
import { dbGetReglage, dbSetReglage, dbSetImageRecette } from './db.js'
import { genererImageRecette } from './ai.js'

const CLE = 'photos_auto'
// Erreurs qui touchent toutes les photos suivantes : inutile d'insister
export const ERREURS_BLOQUANTES = ['CREDIT_EPUISE', 'CLE_INVALIDE', 'CLE_MANQUANTE', 'SESSION', 'FOYER']

let actif = null // cache du réglage (une lecture par page)

export async function photosAutoActives() {
  if (actif === null) actif = !!(await dbGetReglage(CLE).catch(() => null))?.actif
  return actif
}

export async function setPhotosAuto(valeur) {
  await dbSetReglage(CLE, { actif: !!valeur })
  actif = !!valeur
}

export function invaliderPhotosAuto() { actif = null }

// Une photo à la fois, sans bloquer la page ; une erreur bloquante vide la file
const file = []
let enCours = false

async function traiter() {
  enCours = true
  while (file.length) {
    const r = file.shift()
    try {
      await dbSetImageRecette(r.id, await genererImageRecette(r))
    } catch (e) {
      console.warn('Photo automatique', r.nom, e.info?.code || e.message)
      if (ERREURS_BLOQUANTES.includes(e.info?.code)) file.length = 0
    }
  }
  enCours = false
}

/** À appeler après la création de recettes par l'IA : [{ id, nom, ingredients, … }] */
export async function apresCreation(recettes) {
  const avecId = recettes.filter(r => r?.id && !r.image_url)
  if (!avecId.length || !(await photosAutoActives())) return
  file.push(...avecId)
  if (!enCours) traiter()
}

export const photosEnAttente = () => file.length + (enCours ? 1 : 0)
