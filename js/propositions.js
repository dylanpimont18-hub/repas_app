// js/propositions.js — Relie l'algorithme de sélection (selection.js) aux données Supabase du cycle
import { chargerCycle, chargerHistorique, enregistrerCreneaux, importerRecettesIA } from './planning.js'
import { getRecettes, addRecette } from './recettes.js'
import { getProfil } from './preferences.js'
import { getAllIngredients } from './custom-ingredients.js'
import { dbGetReserve, dbAddReserve, dbDeleteReserve } from './db.js'
import { construireIndexPrefs, nouveauContexte, candidats, remplirCycle, decalerEnCascade } from './selection.js'
import { genererPourCreneaux, genererUneRecette } from './ai.js'

const CLE_FILTRES = 'repas_filtres_cycle'

// Sélecteurs mémorisés sur l'appareil (remplissage et ↻)
export function lireFiltres() {
  try { return { filtres: [], style: '', ...JSON.parse(localStorage.getItem(CLE_FILTRES) || '{}') } }
  catch { return { filtres: [], style: '' } }
}
export function memoriserFiltres(f) {
  try { localStorage.setItem(CLE_FILTRES, JSON.stringify(f)) } catch { /* navigation privée */ }
}

// Tout ce qu'il faut pour proposer des plats sur un cycle
export async function chargerDonnees(samedi) {
  const [cycle, recettes, reserveBrute, historique, dylan, femme, ingredients] = await Promise.all([
    chargerCycle(samedi), getRecettes(), dbGetReserve(), chargerHistorique(samedi),
    getProfil('dylan'), getProfil('femme'), getAllIngredients(),
  ])
  const recettesMap = Object.fromEntries(recettes.map(r => [r.id, r]))
  return {
    samedi, ...cycle, recettes, recettesMap, historique,
    reserve:    reserveBrute.filter(x => x.recette).map(x => ({ id: x.id, recette: x.recette, portions: x.portions })),
    indexPrefs: construireIndexPrefs(ingredients, { dylan, femme }),
    parCle:     Object.fromEntries(cycle.creneaux.map(c => [c.cle, c])),
  }
}

// Recettes déjà prévues dans le cycle (hors créneaux exclus)
function recettesPrevues(d, exclureCles = []) {
  return Object.entries(d.occupation)
    .filter(([cle]) => !exclureCles.includes(cle))
    .map(([, o]) => d.recettesMap[o.id]).filter(Boolean)
}

export function contexte(d, { filtres = [], style = '', exclureCles = [] } = {}) {
  return nouveauContexte({ indexPrefs: d.indexPrefs, filtres, style, historique: d.historique,
    debut: d.samedi.getTime(), dejaChoisies: recettesPrevues(d, exclureCles) })
}

// Noms d'ingrédients déjà prévus (pour que l'IA les réutilise)
export function ingredientsPrevus(d, exclureCles = []) {
  return [...new Set(recettesPrevues(d, exclureCles).flatMap(r => (r.ingredients || []).map(i => i.nom)))].slice(0, 60)
}

function contexteIA(d, exclureCles) {
  return { ingredientsAReutiliser: ingredientsPrevus(d, exclureCles), nomsExistants: d.recettes.map(r => r.nom) }
}

// Meilleurs candidats bibliothèque pour un créneau
export function proposerPourCreneau(d, creneau, options = {}, n = 3) {
  const actuel = d.occupation[creneau.cle]?.id
  const ctx = contexte(d, { ...options, exclureCles: [creneau.cle] })
  return candidats(d.recettes, creneau, ctx, { exclure: actuel ? [actuel] : [] }).slice(0, n).map(x => x.recette)
}

// Remplit les créneaux demandés depuis la bibliothèque et enregistre ; renvoie les créneaux restés vides
export async function remplirDepuisBibliotheque(d, cles, { filtres = [], style = '' } = {}) {
  const plan = Object.fromEntries(Object.entries(d.occupation).map(([cle, o]) => [cle, d.recettesMap[o.id]]).filter(([, r]) => r))
  const { propositions, vides } = remplirCycle({
    creneaux: d.creneaux, aRemplir: cles, plan, recettes: d.recettes, reserve: d.reserve,
    indexPrefs: d.indexPrefs, filtres, style, historique: d.historique, debut: d.samedi.getTime(),
  })
  await enregistrerCreneaux(propositions.map(p => ({ creneau: d.parCle[p.cle], recetteId: p.recette.id, source: p.source })))
  await Promise.all(propositions.filter(p => p.reserveId).map(p => dbDeleteReserve(p.reserveId)))
  return { nbProposes: propositions.length, vides: vides.map(cle => d.parCle[cle]) }
}

// Complète des créneaux par l'IA (un seul appel), enregistre recettes + planning
export async function completerParIA(d, creneaux, { filtres = [], style = '' } = {}, onProgress = null) {
  const cles = creneaux.map(c => c.cle)
  const { resultats, rejets } = await genererPourCreneaux({ creneaux, filtres, style, ...contexteIA(d, cles) }, onProgress)
  await importerRecettesIA(resultats)
  return { nbCrees: resultats.length, rejets }
}

// Une idée IA pour un créneau (enregistrée en bibliothèque, pas encore placée)
export async function ideeIA(d, creneau, options = {}) {
  const recette = await genererUneRecette({ creneau, ...options, ...contexteIA(d, [creneau.cle]) })
  const id = await addRecette(recette)
  return { ...recette, id }
}

// Place une recette sur un créneau, en gérant le plat déjà prévu : 'remplacer' | 'congelo' | 'decaler'
// Renvoie l'aperçu des changements (sans rien écrire si `simuler`)
export async function placer(d, creneau, recetteId, source, mode = 'remplacer', simuler = false) {
  const actuel = d.occupation[creneau.cle]
  let changements = [{ cle: creneau.cle, recetteId, source }]
  let versReserve = null
  if (actuel && mode === 'congelo') versReserve = { recetteId: actuel.id, portions: creneau.portions }
  if (actuel && mode === 'decaler') {
    const suite = d.creneaux.slice(d.creneaux.indexOf(creneau))
    const plan = Object.fromEntries(Object.entries(d.occupation).map(([cle, o]) => [cle, { recetteId: o.id, source: o.source }]))
    const r = decalerEnCascade(suite, plan, creneau.cle, { recetteId, source })
    changements = r.changements
    versReserve = r.sortant
  }
  if (!simuler) {
    await enregistrerCreneaux(changements.map(c => ({ creneau: d.parCle[c.cle], recetteId: c.recetteId, source: c.source })))
    if (versReserve) await dbAddReserve(versReserve.recetteId, versReserve.portions)
  }
  return { changements, versReserve }
}
