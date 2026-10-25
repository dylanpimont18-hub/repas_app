// js/propositions.js — Relie l'algorithme de sélection (selection.js) aux données Supabase du cycle
import { chargerCycle, chargerHistorique, enregistrerCreneaux, viderCreneaux, importerRecettesIA } from './planning.js'
import { getRecettes, addRecette } from './recettes.js'
import { getProfil } from './preferences.js'
import { getAllIngredients } from './custom-ingredients.js'
import { dbGetReserve, dbAddReserve, dbDeleteReserve } from './db.js'
import { construireIndexPrefs, nouveauContexte, candidats, remplirCycle, decalerEnCascade, repartirEnvies } from './selection.js'
import { genererPourCreneaux, genererUneRecette } from './ai.js'

const CLE_FILTRES = 'repas_filtres_cycle'

// Sélecteurs mémorisés sur l'appareil (remplissage et ↻)
export function lireFiltres() {
  try { return { filtres: [], style: '', envies: [], ...JSON.parse(localStorage.getItem(CLE_FILTRES) || '{}') } }
  catch { return { filtres: [], style: '', envies: [] } }
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
// (avec l'envie qui leur était destinée, pour que l'IA la respecte)
export async function remplirDepuisBibliotheque(d, cles, { filtres = [], style = '', envies = [] } = {}) {
  const plan = Object.fromEntries(Object.entries(d.occupation).map(([cle, o]) => [cle, d.recettesMap[o.id]]).filter(([, r]) => r))
  const { propositions, vides, envieDe } = remplirCycle({
    creneaux: d.creneaux, aRemplir: cles, plan, recettes: d.recettes, reserve: d.reserve, envies,
    indexPrefs: d.indexPrefs, filtres, style, historique: d.historique, debut: d.samedi.getTime(),
  })
  await enregistrerCreneaux(propositions.map(p => ({ creneau: d.parCle[p.cle], recetteId: p.recette.id, source: p.source })))
  await Promise.all(propositions.filter(p => p.reserveId).map(p => dbDeleteReserve(p.reserveId)))
  return { nbProposes: propositions.length, vides: vides.map(cle => ({ ...d.parCle[cle], envies: envieDe[cle] || [] })) }
}

// Complète des créneaux par l'IA (lots en parallèle), enregistre recettes + planning dès qu'un lot arrive.
// Si les créneaux ne portent pas encore leurs envies (génération directe), on les répartit ici.
export async function completerParIA(d, creneaux, { filtres = [], style = '', envies = [] } = {}, onProgress = null, onLot = null) {
  if (creneaux.some(c => !Array.isArray(c.envies))) {
    const envieDe = repartirEnvies(creneaux, envies)
    creneaux = creneaux.map(c => ({ ...c, envies: envieDe[c.cle] || [] }))
  }
  const cles = creneaux.map(c => c.cle)
  const { resultats, rejets, erreurs } = await genererPourCreneaux({ creneaux, filtres, style, ...contexteIA(d, cles) }, onProgress,
    async (lot) => { await importerRecettesIA(lot); await onLot?.(lot) })
  return { nbCrees: resultats.length, nbDemandes: creneaux.length, rejets, erreurs }
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

// Intervertit deux repas (ou déplace vers un créneau vide) ; les portions restent celles de chaque créneau
export async function echanger(d, cleA, cleB) {
  if (cleA === cleB) return
  const a = d.occupation[cleA], b = d.occupation[cleB]
  const source = o => (o.source === 'reste' ? 'manuel' : o.source)
  const ecrire = [], vider = []
  if (a) ecrire.push({ creneau: d.parCle[cleB], recetteId: a.id, source: source(a) }); else vider.push(d.parCle[cleB])
  if (b) ecrire.push({ creneau: d.parCle[cleA], recetteId: b.id, source: source(b) }); else vider.push(d.parCle[cleA])
  if (ecrire.length) await enregistrerCreneaux(ecrire)
  if (vider.length) await viderCreneaux(vider)
}
