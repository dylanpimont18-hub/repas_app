// js/cuisine.js — Préparation d'une session de cuisine (fonctions pures, testées sous Node)
import { combinerQuantites } from './utils.js'

const tempsTotal = r => (r.temps_prep || 0) + (r.temps_cuisson || 0)

/**
 * Plats à cuisiner pour des créneaux : une entrée par recette, portions additionnées
 * (un plat du dimanche mangé lundi soir et mardi midi se cuisine en une fois).
 * Les plats sortis du congélo et les restes ne se cuisinent pas.
 * Ordre conseillé : la cuisson la plus longue d'abord, pour lancer le four ou la mijoteuse en premier.
 * @returns [{ recette, portions, repas: [creneau] }]
 */
export function platsACuisiner(creneaux, occupation, recettesMap) {
  const parRecette = new Map()
  for (const c of creneaux) {
    const occ = occupation[c.cle]
    const recette = occ && !['reserve', 'reste'].includes(occ.source) ? recettesMap[occ.id] : null
    if (!recette) continue
    if (!parRecette.has(recette.id)) parRecette.set(recette.id, { recette, portions: 0, repas: [] })
    const p = parRecette.get(recette.id)
    p.portions += occ.portions || c.portions || 0
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
