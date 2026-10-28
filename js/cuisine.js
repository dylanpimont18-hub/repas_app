// js/cuisine.js — Préparation d'une session de cuisine (fonctions pures, testées sous Node)
import { combinerQuantites } from './utils.js'

const tempsTotal = r => (r.temps_prep || 0) + (r.temps_cuisson || 0)

/**
 * Plats à cuisiner pour des créneaux : une entrée par recette, portions additionnées
 * (un plat du dimanche mangé lundi soir et mardi midi se cuisine en une fois).
 * Les plats sortis du congélo ne se cuisinent pas. Un midi « reste » reprend le plat d'un soir de la même session :
 * ses portions s'ajoutent à ce plat (cuisiné en plus grande quantité, comme dans la liste de courses : 4 + 1 = 5).
 * Ordre conseillé : la cuisson la plus longue d'abord, pour lancer le four ou la mijoteuse en premier.
 * @returns [{ recette, portions, repas: [creneau] }]
 */
export function platsACuisiner(creneaux, occupation, recettesMap) {
  const parRecette = new Map()
  const restes = []
  for (const c of creneaux) {
    const occ = occupation[c.cle]
    if (!occ || occ.source === 'reserve') continue
    if (occ.source === 'reste') { restes.push(c); continue }
    const recette = recettesMap[occ.id]
    if (!recette) continue
    if (!parRecette.has(recette.id)) parRecette.set(recette.id, { recette, portions: 0, repas: [] })
    const p = parRecette.get(recette.id)
    p.portions += occ.portions || c.portions || 0
    p.repas.push(c)
  }
  // Restes : seulement si le plat d'origine est cuisiné dans cette même session
  for (const c of restes) {
    const p = parRecette.get(occupation[c.cle].id)
    if (!p) continue
    p.portions += occupation[c.cle].portions || c.portions || 0
    p.repas.push(c)
  }
  return [...parRecette.values()]
    .sort((a, b) => (b.recette.temps_cuisson || 0) - (a.recette.temps_cuisson || 0) || tempsTotal(b.recette) - tempsTotal(a.recette))
}

// Ingrédients ajustés au nombre de portions à cuisiner : [{ nom, quantite }]
export function ingredientsPour(recette, portions) {
  const facteur = portions && recette.portions ? portions / recette.portions : 1
  return (recette.ingredients || []).map(i => ({
    nom: i.nom,
    quantite: facteur === 1 ? String(i.quantite ?? '') : combinerQuantites([{ valeur: i.quantite, facteur }], i.nom) || String(i.quantite ?? ''),
  }))
}

/**
 * Durées citées dans une étape, pour proposer un minuteur : « Laisser mijoter 25 min » → [{ secondes: 1500, texte: '25 min' }].
 * Fourchettes (« 30 à 40 min ») : la plus longue. Heures et minutes combinées (« 1 h 30 ») acceptées.
 */
export function dureesDansEtape(texte) {
  const res = []
  const re = /(\d+(?:[.,]\d+)?)(?:\s*(?:à|-|–)\s*(\d+(?:[.,]\d+)?))?\s*(h(?:eures?)?|min(?:utes?)?\.?|mn|s(?:ec(?:ondes?)?)?)(?:\s*(\d{1,2})(?!\s*(?:min|s)))?(?![a-zà-ü])/gi
  for (const m of String(texte ?? '').matchAll(re)) {
    const n = parseFloat((m[2] || m[1]).replace(',', '.'))
    const u = m[3].toLowerCase()
    let secondes = u.startsWith('h') ? n * 3600 : u.startsWith('s') ? n : n * 60
    if (u.startsWith('h') && m[4]) secondes += Number(m[4]) * 60
    if (secondes >= 30 && secondes <= 24 * 3600) res.push({ secondes: Math.round(secondes), texte: m[0].trim() })
  }
  return res
}

/**
 * La recette pour un autre nombre de personnes : ingrédients pondérés (« 400 g » pour 4 → « 600 g » pour 6).
 * Les quantités sans nombre (« selon goût ») restent telles quelles.
 */
export function recetteAuxPortions(recette, portions) {
  const p = Math.max(1, Math.round(Number(portions) || recette.portions || 1))
  if (!recette.portions || p === recette.portions) return { ...recette, portions: p }
  return { ...recette, portions: p, ingredients: ingredientsPour(recette, p) }
}
