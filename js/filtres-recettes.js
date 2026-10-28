// js/filtres-recettes.js — Filtres de la bibliothèque déduits des recettes (pur, testé)
// Un filtre n'existe que si au moins une recette affichée y correspond.
import { normaliser, contientMot, contientViande, contientPoisson, texteRecette } from './filtres.js'
import { motsDe, motsRecette } from './selection.js'

const majuscule = s => s.charAt(0).toUpperCase() + s.slice(1)
const tempsTotal = r => (r.temps_prep || 0) + (r.temps_cuisson || 0)

// Protéine principale lisible : mot-clé cherché d'abord dans composants.proteine, sinon dans toute la recette
const PROTEINES = [
  ['poulet', 'Poulet'], ['volaille', 'Poulet'], ['dinde', 'Dinde'], ['boeuf', 'Bœuf'], ['steak', 'Bœuf'],
  ['agneau', 'Agneau'], ['mouton', 'Agneau'], ['veau', 'Veau'], ['kefta', 'Viande hachée'], ['viande hachee', 'Viande hachée'],
  ['merguez', 'Merguez'], ['saumon', 'Saumon'], ['thon', 'Thon'], ['cabillaud', 'Poisson blanc'], ['colin', 'Poisson blanc'],
  ['lieu', 'Poisson blanc'], ['merlan', 'Poisson blanc'], ['crevette', 'Crevettes'], ['gambas', 'Crevettes'],
  ['poisson', 'Poisson'], ['oeuf', 'Œufs'], ['pois chiche', 'Pois chiches'], ['lentille', 'Lentilles'],
  ['haricot rouge', 'Haricots'], ['tofu', 'Tofu'], ['fromage', 'Fromage'],
]
export function proteineAffichee(r) {
  const cible = r.composants?.proteine ? normaliser(r.composants.proteine) : texteRecette(r)
  return PROTEINES.find(([mot]) => contientMot(cible, mot))?.[1] || null
}

// Groupes de filtres : `valeurs(r)` → valeurs portées par la recette ; `unique` → un seul choix à la fois
export const GROUPES = [
  { id: 'regime', label: 'Régime',
    valeurs: r => [r.vegetarien && 'vegetarien', contientViande(r) && 'viande', contientPoisson(r) && 'poisson'],
    libelle: v => ({ vegetarien: 'Végétarien', viande: 'Viande', poisson: 'Poisson' })[v] },
  { id: 'temps', label: 'Temps total', unique: true,
    valeurs: r => { const t = tempsTotal(r); return t > 0 ? [t <= 20 && '20', t <= 30 && '30', t <= 45 && '45'] : [] },
    libelle: v => `≤ ${v} min`, ordre: v => Number(v) },
  { id: 'proteine', label: 'Protéine', valeurs: r => [proteineAffichee(r)], libelle: v => v },
  { id: 'cuisine', label: 'Cuisine', valeurs: r => [r.cuisine && normaliser(r.cuisine)], libelle: majuscule },
  { id: 'style', label: 'Style', valeurs: r => (r.tags || []).map(t => String(t).toLowerCase()), libelle: majuscule },
  { id: 'pratique', label: 'Pratique',
    valeurs: r => [r.legumes_caches?.length > 0 && 'caches', (r.conservation_jours ?? 0) >= 3 && 'garde',
      (r.ingredients || []).length > 0 && (r.ingredients || []).length <= 6 && 'peu'],
    libelle: v => ({ caches: 'Légumes cachés', garde: 'Se garde 3 j et +', peu: '6 ingrédients max' })[v] },
]

function valeursDe(groupe, r) {
  return new Set(groupe.valeurs(r).filter(Boolean))
}

/** Groupes non vides : [{ id, label, unique, options: [{ valeur, label, n }] }], options triées */
export function filtresDisponibles(recettes) {
  return GROUPES.map(g => {
    const compte = new Map()
    for (const r of recettes) for (const v of valeursDe(g, r)) compte.set(v, (compte.get(v) || 0) + 1)
    const options = [...compte].map(([valeur, n]) => ({ valeur, label: g.libelle(valeur), n }))
      .sort(g.ordre ? (a, b) => g.ordre(a.valeur) - g.ordre(b.valeur) : (a, b) => b.n - a.n || a.label.localeCompare(b.label))
    return { id: g.id, label: g.label, unique: !!g.unique, options }
  }).filter(g => g.options.length)
}

/** `selection` = { groupe: [valeurs] } : ET entre groupes, OU dans un même groupe */
export function appliquerFiltres(recettes, selection = {}) {
  const actifs = GROUPES.filter(g => selection[g.id]?.length)
  if (!actifs.length) return recettes
  return recettes.filter(r => actifs.every(g => {
    const vals = valeursDe(g, r)
    return selection[g.id].some(v => vals.has(v))
  }))
}

// Retire de la sélection les filtres qui n'existent plus (autre livre, recherche…)
export function nettoyerSelection(selection, disponibles) {
  const propre = {}
  for (const g of disponibles) {
    const ok = (selection[g.id] || []).filter(v => g.options.some(o => o.valeur === v))
    if (ok.length) propre[g.id] = ok
  }
  return propre
}

// Ajoute / retire une valeur (groupe à choix unique : remplace)
export function basculer(selection, groupe, valeur, unique = false) {
  const actuel = selection[groupe] || []
  const suivant = actuel.includes(valeur) ? actuel.filter(v => v !== valeur) : unique ? [valeur] : [...actuel, valeur]
  const copie = { ...selection, [groupe]: suivant }
  if (!suivant.length) delete copie[groupe]
  return copie
}

export const nbActifs = selection => Object.values(selection).reduce((s, v) => s + v.length, 0)

// Ingrédients saisis (« poulet », « carottes »…) : la recette doit tous les contenir (ET).
// Un ingrédient de plusieurs mots (« pois chiche ») doit avoir tous ses mots dans la recette.
export function filtrerParIngredients(recettes, ingredients = []) {
  const items = ingredients.map(motsDe).filter(mots => mots.length)
  if (!items.length) return recettes
  return recettes.filter(r => {
    const mots = motsRecette(r)
    return items.every(item => item.every(m => mots.has(m)))
  })
}

// « poulet, carottes et riz » → ['poulet', 'carottes', 'riz'] (sans doublon avec `deja`)
export function ajouterIngredients(deja, texte) {
  const vus = new Set(deja.map(i => motsDe(i).join(' ')))
  const nouveaux = []
  for (const brut of String(texte ?? '').split(/[,;+\n]|\bet\b/)) {
    const nom = brut.trim()
    const cle = motsDe(nom).join(' ')
    if (!cle || vus.has(cle)) continue
    vus.add(cle)
    nouveaux.push(nom)
  }
  return [...deja, ...nouveaux]
}
