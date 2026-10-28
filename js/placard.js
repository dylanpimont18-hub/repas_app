// js/placard.js — « Vider le placard » : inventaire de ce qu'il y a à la maison, recettes qui l'utilisent (fonctions pures, testées)
// Bibliothèque d'abord : on choisit les recettes enregistrées qui utilisent le plus d'articles du placard,
// puis l'IA écrit des recettes pour les articles restants, répartis entre elles.
import { lireLigneIngredient, cleIngredient, categoriser } from './utils.js'
import { motsDe, evaluer } from './selection.js'
import { ingredientsPour } from './cuisine.js'

const FAMILLE = { profils: ['dylan', 'femme'], portions: 4 }

// Les recettes écrites pour vider le placard vivent dans ce livre : le reste de l'appli (planning, ⚡ Envie) les ignore
export const NOM_LIVRE_PLACARD = 'Vider le placard'

/** Recettes sans celles du livre « Vider le placard » (pour les propositions du planning) */
export function sansRecettesPlacard(recettes, livres = []) {
  const ids = new Set(livres.filter(l => l.nom === NOM_LIVRE_PLACARD).map(l => l.id))
  return ids.size ? recettes.filter(r => !ids.has(r.livre_id)) : recettes
}
// Mots qui ne disent pas quel ingrédient c'est (« boîte de pois chiches » → pois chiches)
const MOTS_NEUTRES = new Set(['boite', 'conserve', 'paquet', 'sachet', 'pot', 'bocal', 'brique', 'bouteille', 'tube', 'fine',
  'moyen', 'gros', 'petit', 'entier', 'surgele', 'frais', 'sec', 'seche', 'bio', 'nature', 'reste', 'demi', 'cuit', 'cru'])

let compteur = 0
const nouvelId = () => `p${Date.now().toString(36)}${(compteur++).toString(36)}`

/**
 * Texte saisi ou collé → articles : une ligne (ou une virgule) par article, quantité facultative.
 * « 2 boîtes de pois chiches, riz basmati 500 g » → [{ nom: 'pois chiches', quantite: '2 boîtes' }, { nom: 'riz basmati', quantite: '500 g' }]
 */
export function lireInventaire(texte) {
  return String(texte ?? '').split(/\r?\n|[,;]/).map(s => s.trim()).filter(Boolean).map(ligne => {
    // Quantité écrite après le nom : « riz basmati 500 g », « tomates x3 »
    const apres = ligne.match(/^(.*?[a-zà-ÿ)])\s*[:(-]?\s*(x\s*)?(\d+(?:[.,]\d+)?\s*(?:kg|g|gr|mg|l|cl|ml|dl|boîtes?|boites?|paquets?|sachets?|pots?|bocaux|bocal|briques?|tranches?|pièces?)?)\)?$/i)
    if (apres && !/^\d/.test(ligne)) return { nom: apres[1].trim(), quantite: apres[3].replace(/\s+/g, ' ').trim() }
    const l = lireLigneIngredient(ligne)
    return l && l.nom ? { nom: l.nom, quantite: l.quantite } : null
  }).filter(Boolean).map(i => ({ id: nouvelId(), nom: i.nom.charAt(0).toUpperCase() + i.nom.slice(1), quantite: i.quantite || '' }))
}

/** Ajoute des articles à l'inventaire ; un article déjà présent prend la nouvelle quantité (si elle est donnée) */
export function fusionnerInventaire(existant = [], nouveaux = []) {
  const res = existant.map(i => ({ ...i }))
  for (const n of nouveaux) {
    const deja = res.find(i => cleIngredient(i.nom) === cleIngredient(n.nom))
    if (deja) { if (n.quantite) deja.quantite = n.quantite }
    else res.push({ ...n })
  }
  return res
}

// Mots qui identifient un article (« Pois chiches en boîte » → ['pois', 'chiche'])
export function motsArticle(item) {
  return motsDe(cleIngredient(item.nom)).filter(m => !MOTS_NEUTRES.has(m) && m.length > 1)
}

// Noms composés dont le premier mot seul désigne un autre produit (« lait » ≠ « lait de coco »)
const TETES_COMPOSEES = new Set(['lait', 'sauce', 'creme', 'huile', 'farine', 'pate', 'pomme', 'fromage', 'sucre', 'vinaigre',
  'jus', 'poudre', 'concentre', 'bouillon', 'pain', 'haricot', 'petit', 'feuille', 'fond', 'sirop'])

// Mots de chaque ingrédient de la recette (et de ses composants)
function motsIngredients(recette) {
  const c = recette.composants || {}
  return [...(recette.ingredients || []).map(i => i.nom), c.base, c.proteine, ...(c.legumes || [])]
    .filter(Boolean).map(n => new Set(motsArticle({ nom: n })))
}

/**
 * La recette utilise-t-elle cet article ? Un ingrédient correspond si ses mots sont tous dans l'article ou l'inverse
 * (« Riz » ↔ « riz basmati », « Pois chiches » ↔ « pois chiches en boîte »), sauf nom composé (« lait » ≠ « lait de coco »).
 */
export function utilise(recette, item, ingredients = motsIngredients(recette)) {
  const m = motsArticle(item)
  if (!m.length) return false
  const article = new Set(m)
  return ingredients.some(ing => {
    if (!ing.size) return false
    if ([...article].every(x => ing.has(x))) return true
    // L'ingrédient de la recette est plus court que l'article : seulement si ce n'est pas une tête de nom composé
    return [...ing].every(x => article.has(x)) && !(ing.size === 1 && TETES_COMPOSEES.has([...ing][0]) && article.size > 1)
  })
}

/**
 * Quels articles du placard les recettes utilisent.
 * @returns { parRecette: { id: [itemIds] }, utilises: Set(itemIds), restants: [items] }
 */
export function couverture(inventaire, recettes) {
  const parRecette = {}, utilises = new Set()
  for (const r of recettes) {
    const mots = motsIngredients(r)
    parRecette[r.id] = inventaire.filter(i => utilise(r, i, mots)).map(i => i.id)
    parRecette[r.id].forEach(id => utilises.add(id))
  }
  return { parRecette, utilises, restants: inventaire.filter(i => !utilises.has(i.id)) }
}

/**
 * Bibliothèque d'abord : recettes enregistrées qui vident le plus le placard (choix glouton : à chaque tour,
 * celle qui utilise le plus d'articles pas encore couverts), compatibles halal et goûts de la famille.
 * @returns [{ recette, articles: [itemIds] }]
 */
export function choisirDansBibliotheque(inventaire, recettes, { indexPrefs = [], filtres = [], max = 20, minimum = 2 } = {}) {
  const ctx = { indexPrefs, filtres, historique: {}, style: '' }
  const candidates = recettes
    .filter(r => evaluer(r, FAMILLE, ctx) !== null)
    .map(r => { const mots = motsIngredients(r); return { recette: r, articles: inventaire.filter(i => utilise(r, i, mots)).map(i => i.id) } })
    .filter(x => x.articles.length)
  const restants = new Set(inventaire.map(i => i.id))
  const choisies = []
  // Une recette n'est prise que si elle utilise assez d'articles encore là (au moins 2, ou le seul restant)
  while (choisies.length < max && restants.size) {
    let meilleure = null, score = 0
    for (const c of candidates) {
      if (choisies.includes(c)) continue
      const s = c.articles.filter(id => restants.has(id)).length
      if (s > score) { meilleure = c; score = s }
    }
    if (!meilleure || score < Math.min(minimum, restants.size)) break
    choisies.push(meilleure)
    meilleure.articles.forEach(id => restants.delete(id))
  }
  return choisies.map(c => ({ recette: c.recette, articles: c.articles }))
}

/** Nombre de recettes IA conseillé pour les articles restants (≈ 3 articles du placard par recette) */
export function nbRecettesConseille(nbRestants, parRecette = 3) {
  if (!nbRestants) return 0
  return Math.min(15, Math.max(1, Math.ceil(nbRestants / parRecette)))
}

/**
 * Répartit les articles restants entre `nb` recettes : chaque recette reçoit des articles de rayons variés
 * (une base, une protéine, des légumes, des épices…) pour que les associations aient du sens.
 * @returns [[items], …] (nb groupes, aucun article oublié)
 */
export function repartirArticles(items, nb) {
  if (!nb || !items.length) return []
  const ordre = ['Féculents', 'Viandes & Poissons', 'Fruits & Légumes', 'Laitiers & Œufs', 'Épicerie & Condiments', 'Divers']
  const tries = [...items].sort((a, b) => ordre.indexOf(categoriser(a.nom)) - ordre.indexOf(categoriser(b.nom)))
  const groupes = Array.from({ length: Math.min(nb, items.length) }, () => [])
  tries.forEach((item, k) => groupes[k % groupes.length].push(item))
  return groupes
}

/** « 2 boîtes de pois chiches » pour le prompt et l'affichage */
export const libelleArticle = i => (i.quantite ? `${i.nom} (${i.quantite})` : i.nom)

// Ingrédients d'une recette à acheter en plus du placard (hors basiques : sel, poivre, huile…)
const BASIQUES = new Set(['sel', 'poivre', 'eau', 'huile', 'huile d\'olive', 'sucre'])
export function aAcheter(recette, inventaire = []) {
  return (recette.ingredients || []).filter(ing => !BASIQUES.has(cleIngredient(ing.nom))
    && !inventaire.some(i => utilise({ ingredients: [ing] }, i))).map(ing => ing.nom)
}

const md = s => String(s ?? '').replace(/([\\`*_[\]#|<>])/g, '\\$1')

/**
 * Le placard au format Markdown (.md) : inventaire (case cochée = utilisé par une recette retenue),
 * recettes retenues avec ce qu'elles utilisent, ce qu'il reste à acheter et leurs ingrédients pour `portions` personnes,
 * puis les articles pas encore utilisés.
 */
export function markdownPlacard(inventaire, recettes, { titre = 'Vider le placard', portions = 4 } = {}) {
  const { parRecette, utilises, restants } = couverture(inventaire, recettes)
  const nom = id => inventaire.find(i => i.id === id)?.nom
  const blocs = [`# ${md(titre)}`, `## Mon placard (${inventaire.length})`]
  blocs.push(inventaire.length
    ? inventaire.map(i => `- [${utilises.has(i.id) ? 'x' : ' '}] ${md(i.nom)}${i.quantite ? ` — ${md(i.quantite)}` : ''}`).join('\n')
    : '_Vide_')
  if (recettes.length) {
    blocs.push(`## Recettes retenues (${recettes.length}) — ${utilises.size} / ${inventaire.length} articles utilisés`)
    for (const r of recettes) {
      const achats = aAcheter(r, inventaire)
      blocs.push([`### ${md(r.nom)}`, '',
        `- **Utilise :** ${md((parRecette[r.id] || []).map(nom).filter(Boolean).join(', ') || '—')}`,
        `- **À acheter :** ${achats.length ? md(achats.join(', ')) : 'rien'}`,
        ...(r.temps_prep || r.temps_cuisson ? [`- **Temps :** ${(r.temps_prep || 0) + (r.temps_cuisson || 0)} min`] : []),
        '', `**Ingrédients (${portions} pers.)**`, '',
        ...ingredientsPour(r, portions).map(i => `- ${i.quantite ? `${md(i.quantite)} ` : ''}${md(i.nom)}`),
        ...((r.etapes || []).length ? ['', '**Préparation**', '', ...r.etapes.map((e, k) => `${k + 1}. ${md(e)}`)] : []),
      ].join('\n'))
    }
  }
  if (restants.length && recettes.length) blocs.push('## Pas encore utilisés', restants.map(i => `- ${md(i.nom)}${i.quantite ? ` — ${md(i.quantite)}` : ''}`).join('\n'))
  return `${blocs.join('\n\n')}\n`
}
