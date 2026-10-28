// js/placard.js — « Vider le placard » : inventaire de ce qu'il y a à la maison, recettes qui l'utilisent (fonctions pures, testées)
// Bibliothèque d'abord : on choisit les recettes enregistrées qui utilisent le plus d'articles du placard,
// puis l'IA écrit des recettes pour les articles restants, répartis entre elles.
import { lireLigneIngredient, cleIngredient, categoriser, lireQuantite } from './utils.js'
import { motsDe, evaluer } from './selection.js'
import { normaliser, contientInterdit } from './filtres.js'
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
  'moyen', 'gros', 'petit', 'entier', 'surgele', 'frais', 'sec', 'seche', 'bio', 'nature', 'reste', 'demi', 'cuit', 'cru',
  'barquette', 'tablette', 'rouleau', 'piece'])

let compteur = 0
const nouvelId = () => `p${Date.now().toString(36)}${(compteur++).toString(36)}`

// ── Saisie ───────────────────────────────────────────────────────────
// Conditionnement retiré du nom (« paquet de farine » → farine) et gardé dans la quantité
const CONDITIONNEMENT = /^(paquets?|sachets?|bo[iî]tes?|pots?|bocal|bocaux|briques?|bouteilles?|barquettes?|tablettes?|conserves?|rouleaux?)\s+(de |d')/i
const MAJ = s => s.charAt(0).toUpperCase() + s.slice(1)

// Une ligne (un article) → { nom, quantite }
function lireArticle(brut) {
  let ligne = brut.replace(/^[-•*]\s*/, '').trim()
  // « 2x lait de coco », « 2 x lait de coco », « ×2 »
  let mult = ''
  const avant = ligne.match(/^(\d+)\s*[x×]\s+(.+)$/i)
  if (avant) { mult = avant[1]; ligne = avant[2] }
  const apresX = ligne.match(/^(.+?)\s*[x×]\s*(\d+)$/i)
  if (apresX) { mult = apresX[2]; ligne = apresX[1] }
  let nom, quantite
  if (/^[\d½¼¾⅓⅔]/.test(ligne)) {
    // Quantité devant : « 1/2 paquet de farine », « 4 steaks hachés »
    const l = lireLigneIngredient(ligne)
    if (!l) return null
    nom = l.nom; quantite = l.quantite
  } else {
    // Quantité derrière : « riz basmati 500 g », « lait 1,5 L », « pâtes 3 paquets de 500 g », « Thon - 3 boîtes », « farine (1 kg) »
    const m = ligne.match(/^(.*?[a-zà-ÿœ'")])\s*[-:(]?\s+(\d[\d.,/]*\s*.*?)\)?$/i) || ligne.match(/^(.*?[a-zà-ÿœ)])\s*\((\d.*)\)$/i)
    if (m && !/^\d/.test(m[1])) { nom = m[1]; quantite = m[2].replace(/\s+/g, ' ').trim() }
    else { nom = ligne; quantite = '' }
  }
  nom = nom.replace(/^(de |d')/i, '').trim()
  const cond = nom.match(CONDITIONNEMENT)
  if (cond) {
    nom = nom.slice(cond[0].length).trim()
    quantite = quantite ? `${quantite} ${cond[1]}`.replace(/^(\S+) (\S+) \2$/, '$1 $2') : cond[1]
  }
  if (mult) quantite = quantite ? `${mult} × ${quantite}` : mult
  if (!nom || /^\d/.test(nom)) return null
  return { nom: MAJ(nom), quantite: quantite || '' }
}

/**
 * Texte saisi ou collé → articles : une ligne, une virgule, un point-virgule ou « et » entre deux articles ; quantité facultative,
 * devant ou derrière. La virgule décimale (« 1,5 L ») ne coupe pas ; « épices : cumin, paprika » donne cumin et paprika.
 * « 2 boîtes de pois chiches, riz basmati 500 g » → [{ nom: 'Pois chiches', quantite: '2 boîtes' }, { nom: 'Riz basmati', quantite: '500 g' }]
 */
export function lireInventaire(texte, { noms = [] } = {}) {
  const canon = canoniser(noms)
  return String(texte ?? '')
    .replace(/(\d),(\d)/g, '$1\u0001$2')                      // virgule décimale protégée
    .split(/\r?\n|[,;]|\s+et\s+/i)
    .map(s => s.replace(/\u0001/g, ',').replace(/^[^:\d]{2,25}:\s*(?=\S)/, '').trim())   // « Épices : cumin » → cumin
    .filter(Boolean).map(lireArticle).filter(Boolean)
    .map(i => ({ id: nouvelId(), nom: canon(i.nom), quantite: i.quantite }))
}

// Nom de la base d'ingrédients quand il désigne le même article (« tomates pelées » reste tel quel, « Pois chiche » → « Pois chiches »)
// Un nom ambigu (« Thon (boîte) » et « Thon frais » pour « thon ») est laissé tel que saisi
function canoniser(noms) {
  if (!noms.length) return n => n
  const parCle = new Map()
  for (const n of noms) { const k = cleIngredient(n); parCle.set(k, parCle.has(k) ? null : n) }
  return n => parCle.get(cleIngredient(n)) || n
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

/**
 * Fusion à trois (deux téléphones qui modifient l'inventaire en même temps) : on applique au serveur
 * les changements faits ici depuis `base` (ajouts, suppressions, quantités, « à finir vite »).
 */
export function fusionnerModifications(base = [], local = [], serveur = []) {
  const idsBase = new Set(base.map(i => i.id)), idsLocal = new Set(local.map(i => i.id))
  const parIdBase = new Map(base.map(i => [i.id, i]))
  const supprimes = new Set([...idsBase].filter(id => !idsLocal.has(id)))
  const res = serveur.filter(i => !supprimes.has(i.id)).map(i => {
    const l = local.find(x => x.id === i.id), b = parIdBase.get(i.id)
    if (!l || !b) return i
    // Champ modifié ici depuis la base → notre valeur ; sinon celle du serveur
    const champ = k => (JSON.stringify(l[k]) !== JSON.stringify(b[k]) ? l[k] : i[k])
    return { ...i, nom: champ('nom'), quantite: champ('quantite'), vite: champ('vite') }
  })
  const ajoutes = local.filter(i => !idsBase.has(i.id) && !res.some(x => x.id === i.id))
  return fusionnerInventaire(res, ajoutes)
}

// ── Correspondance article ↔ ingrédient ─────────────────────────────
// Mots qui identifient un article (« Pois chiches en boîte » → ['poi', 'chiche'])
export function motsArticle(item) {
  return motsDe(cleIngredient(item.nom)).filter(m => !MOTS_NEUTRES.has(m) && m.length > 1)
}

// Noms composés dont le premier mot seul désigne un autre produit (« lait » ≠ « lait de coco », « pâtes » ≠ « pâte feuilletée »)
const TETES_COMPOSEES = new Set(['lait', 'sauce', 'creme', 'huile', 'pate', 'pomme', 'fromage', 'sucre', 'vinaigre', 'jus',
  'poudre', 'concentre', 'bouillon', 'pain', 'haricot', 'petit', 'feuille', 'fond', 'sirop', 'fecule', 'farine', 'coulis'])

// Même produit sous deux noms : l'article est aussi reconnu sous l'autre nom
const SYNONYMES = [
  ['steak hache', 'viande hachee'], ['viande hachee', 'steak hache'], ['creme fraiche', 'creme'], ['creme liquide', 'creme'],
  ['emmental', 'fromage rape'], ['gruyere', 'fromage rape'], ['fromage rape', 'emmental'], ['coulis de tomate', 'sauce tomate'],
  ['passata', 'sauce tomate'], ['tomate concassee', 'tomate'], ['tomate pelee', 'tomate'], ['pois casse', 'pois casses'],
  ['spaghetti', 'pates'], ['penne', 'pates'], ['coquillette', 'pates'], ['tagliatelle', 'pates'], ['fusilli', 'pates'],
]
// Nom normalisé au singulier, mot à mot (« Steaks hachés » → « steak hache »)
const singulierMots = t => ` ${normaliser(t).split(' ').map(m => (m.length > 3 ? m.replace(/(s|x)$/, '') : m)).join(' ')} `
function variantesArticle(item) {
  const nom = singulierMots(item.nom)
  const variantes = [motsArticle(item)]
  for (const [a, b] of SYNONYMES) if (nom.includes(singulierMots(a))) variantes.push(motsArticle({ nom: b }))
  return variantes.filter(v => v.length)
}

// Mots de chaque ingrédient de la recette (et de ses composants), dans l'ordre
function motsIngredients(recette) {
  const c = recette.composants || {}
  return [...(recette.ingredients || []).map(i => i.nom), c.base, c.proteine, ...(c.legumes || [])]
    .filter(Boolean).map(n => motsArticle({ nom: n })).filter(m => m.length)
}

// Article (mots a) et ingrédient (mots i) désignent-ils le même produit ?
function correspond(a, i) {
  const A = new Set(a), I = new Set(i)
  // Article contenu dans l'ingrédient (« pois chiches » ↔ « pois chiches cuits », « riz » ↔ « riz basmati ») :
  // l'ingrédient doit commencer par un mot de l'article (pas « vinaigre de riz », « bouillon de poulet »)…
  if (a.every(x => I.has(x)) && A.has(i[0])) {
    // … et ne pas être un nom composé plus long (« pâtes » ≠ « pâte feuilletée », « sucre » ≠ « sucre glace »)
    return !(i.length > a.length && TETES_COMPOSEES.has(i[0]))
  }
  // Ingrédient contenu dans l'article (« tomates » ↔ « tomates pelées ») : l'article doit commencer par un mot de l'ingrédient
  // (pas « concentré de tomate »), et l'ingrédient ne doit pas être une tête de nom composé (« lait » ≠ « lait de coco »)
  if (i.every(x => A.has(x)) && I.has(a[0])) {
    return !(i.length < a.length && TETES_COMPOSEES.has(i[0]))
  }
  return false
}

/**
 * La recette utilise-t-elle cet article ? (« Riz » ↔ « riz basmati », « Pois chiches » ↔ « pois chiches en boîte » ;
 * pas « riz » ↔ « vinaigre de riz » ni « pâtes » ↔ « pâte feuilletée » ; synonymes : steak haché ↔ viande hachée)
 */
export function utilise(recette, item, ingredients = motsIngredients(recette)) {
  return variantesArticle(item).some(a => ingredients.some(i => correspond(a, i)))
}

// Ingrédient de la recette qui correspond à l'article
function ingredientDe(recette, item) {
  const variantes = variantesArticle(item)
  return (recette.ingredients || []).find(ing => {
    const i = motsArticle({ nom: ing.nom })
    return i.length && variantes.some(a => correspond(a, i))
  }) || null
}

// ── Articles exclus (halal, goûts) ───────────────────────────────────
/**
 * Un article qu'aucune recette du foyer n'utilisera : pas halal, ou « Je n'aime pas » d'un adulte
 * (sauf légume que la femme n'aime pas : il reste utilisable s'il est caché).
 * @returns null | { raison: 'pas halal' | "Dylan n'aime pas" | "Ma femme n'aime pas" }
 */
export function statutArticle(item, indexPrefs = []) {
  if (contientInterdit({ nom: '', ingredients: [{ nom: item.nom }] })) return { raison: 'pas halal' }
  const mots = new Set(motsArticle(item))
  for (const p of indexPrefs) {
    if (!p.mots.length || !p.mots.every(m => mots.has(m))) continue
    if (p.niveaux.dylan === 'j_aime_pas') return { raison: 'Dylan n\'aime pas' }
    if (p.niveaux.femme === 'j_aime_pas' && p.categorie !== 'legumes') return { raison: 'Ma femme n\'aime pas' }
  }
  return null
}

// ── Quantités ────────────────────────────────────────────────────────
const UNITES_BASE = [[/^(kg|kilos?)$/i, 'g', 1000], [/^(g|gr|grammes?)$/i, 'g', 1], [/^mg$/i, 'g', 0.001],
  [/^(l|litres?)$/i, 'ml', 1000], [/^dl$/i, 'ml', 100], [/^cl$/i, 'ml', 10], [/^ml$/i, 'ml', 1]]

/** « 1,5 kg » → { n: 1500, unite: 'g' } ; « 2 boîtes » → { n: 2, unite: 'boite' } ; « 3 » → { n: 3, unite: '' } ; illisible → null */
export function quantiteEnBase(texte) {
  const t = String(texte ?? '').replace(/^(\d+)\s*×\s*/, (_, k) => `${k} `)
  const mult = String(texte ?? '').match(/^(\d+)\s*×\s*(\d.*)$/)
  if (mult) { const q = quantiteEnBase(mult[2]); return q ? { n: q.n * Number(mult[1]), unite: q.unite } : null }
  const q = lireQuantite(t)
  if (!q || !(q.n > 0)) return null
  const u = q.reste.replace(/\([^)]*\)/g, '').trim().split(/\s+/)[0] || ''
  for (const [re, base, f] of UNITES_BASE) if (re.test(u)) return { n: q.n * f, unite: base }
  // Pièces (« 3 », « 3 œufs ») ou conditionnement (« 2 boîtes ») : comparables entre eux seulement
  const cle = cleIngredient(u)
  return { n: q.n, unite: /^(boite|conserve|paquet|sachet|pot|bocal|brique|bouteille|barquette|tablette)/.test(cle) ? cle.replace(/s$/, '') : '' }
}

/** { n, unite } → texte lisible (« 1,2 kg », « 350 g », « 2 boîtes ») */
export function texteQuantite({ n, unite }) {
  const v = x => String(Math.round(x * 10) / 10).replace('.', ',')
  if (unite === 'g') return n >= 1000 ? `${v(n / 1000)} kg` : `${Math.round(n)} g`
  if (unite === 'ml') return n >= 1000 ? `${v(n / 1000)} l` : n >= 10 ? `${v(n / 10)} cl` : `${Math.round(n)} ml`
  return `${v(n)}${unite ? ` ${unite}${n > 1 ? 's' : ''}` : ''}`
}

/** Quantité de l'article qu'une recette demande pour `portions` personnes ({ n, unite } ou null si inconnue) */
export function besoinArticle(recette, item, portions) {
  const ing = ingredientDe(recette, item)
  if (!ing) return null
  const [ajuste] = ingredientsPour({ ...recette, ingredients: [ing] }, portions || recette.portions || 4)
  return quantiteEnBase(ajuste?.quantite)
}

/**
 * Quels articles du placard les recettes utilisent. Avec `portions`, les quantités comptent : un article dont il reste
 * plus de 20 % (unités comparables) est « en partie utilisé » et reste à placer avec ce qui reste.
 * @returns { parRecette: { id: [itemIds] }, utilises: Set(itemIds), partiels: Map(id → { reste, besoin }), restants: [items] }
 */
export function couverture(inventaire, recettes, { portions = null } = {}) {
  const parRecette = {}, utilises = new Set(), besoins = new Map()
  for (const r of recettes) {
    const mots = motsIngredients(r)
    parRecette[r.id] = inventaire.filter(i => utilise(r, i, mots)).map(i => i.id)
    for (const id of parRecette[r.id]) {
      utilises.add(id)
      if (!portions) continue
      const b = besoinArticle(r, inventaire.find(i => i.id === id), portions)
      const cumul = besoins.get(id)
      // Une quantité inconnue rend le total inconnu (on considère alors l'article comme utilisé)
      besoins.set(id, cumul === null || b === null ? null : cumul && cumul.unite === b.unite ? { n: cumul.n + b.n, unite: b.unite } : cumul ? null : b)
    }
  }
  const partiels = new Map()
  if (portions) {
    for (const [id, besoin] of besoins) {
      const item = inventaire.find(i => i.id === id)
      const stock = quantiteEnBase(item.quantite)
      if (!besoin || !stock || stock.unite !== besoin.unite) continue
      const reste = stock.n - besoin.n
      if (reste > stock.n * 0.2) partiels.set(id, { reste: texteQuantite({ n: reste, unite: stock.unite }), besoin: texteQuantite(besoin) })
    }
  }
  const restants = inventaire.filter(i => !utilises.has(i.id) || partiels.has(i.id))
    .map(i => (partiels.has(i.id) ? { ...i, quantite: partiels.get(i.id).reste } : i))
  return { parRecette, utilises, partiels, restants }
}

// ── Choix dans la bibliothèque ───────────────────────────────────────
// Base d'un plat (féculent, protéine, légume, laitier…) par opposition aux épices et condiments, qui complètent
export const estBase = item => categoriser(item.nom) !== 'Épicerie & Condiments'
export const nbBases = items => { const n = items.filter(estBase).length; return n || items.length }
// Poids d'un article : à finir vite compte double
const poids = item => (item.vite ? 2 : 1)

/**
 * Bibliothèque d'abord : recettes enregistrées qui vident le plus le placard (choix glouton : à chaque tour,
 * celle qui utilise le plus d'articles pas encore couverts, « à finir vite » comptant double), compatibles halal et goûts.
 * Seconde passe : une recette qui utilise un seul article de base restant (pas juste une épice) est aussi prise.
 * @returns [{ recette, articles: [itemIds] }]
 */
export function choisirDansBibliotheque(inventaire, recettes, { indexPrefs = [], filtres = [], max = 20, minimum = 2 } = {}) {
  const ctx = { indexPrefs, filtres, historique: {}, style: '' }
  const parId = new Map(inventaire.map(i => [i.id, i]))
  const candidates = recettes
    .filter(r => evaluer(r, FAMILLE, ctx) !== null)
    .map(r => { const mots = motsIngredients(r); return { recette: r, articles: inventaire.filter(i => utilise(r, i, mots)).map(i => i.id) } })
    .filter(x => x.articles.length)
  const restants = new Set(inventaire.map(i => i.id))
  const choisies = []
  const tour = (seuil, accepter = () => true) => {
    while (choisies.length < max && restants.size) {
      let meilleure = null, score = 0
      for (const c of candidates) {
        if (choisies.includes(c)) continue
        const encore = c.articles.filter(id => restants.has(id))
        if (encore.length < Math.min(seuil, restants.size) || !accepter(encore)) continue
        const s = encore.reduce((t, id) => t + poids(parId.get(id)), 0)
        if (s > score) { meilleure = c; score = s }
      }
      if (!meilleure) break
      choisies.push(meilleure)
      meilleure.articles.forEach(id => restants.delete(id))
    }
  }
  tour(minimum)
  tour(1, encore => encore.some(id => estBase(parId.get(id))))
  return choisies.map(c => ({ recette: c.recette, articles: c.articles }))
}

// ── Recettes IA : plusieurs vrais plats, jamais une recette fourre-tout ──
// Au plus 4 articles de base par recette (≈ 3 visés), plus 2 épices ou condiments au plus ; au plus 15 recettes par passage
export const ARTICLES_PAR_RECETTE = 3
export const MAX_ARTICLES_PAR_RECETTE = 4
export const MAX_COMPLEMENTS_PAR_RECETTE = 2
export const MAX_RECETTES_IA = 15

/** Nombre de recettes IA conseillé pour `n` articles de base restants (≈ 3 par recette) */
export function nbRecettesConseille(n, parRecette = ARTICLES_PAR_RECETTE) {
  if (!n) return 0
  return Math.min(MAX_RECETTES_IA, Math.max(1, Math.ceil(n / parRecette)))
}

/** Nombre minimal de recettes pour qu'aucune n'ait plus de 4 articles de base */
export function nbRecettesMinimum(n) {
  if (!n) return 0
  return Math.min(MAX_RECETTES_IA, Math.ceil(n / MAX_ARTICLES_PAR_RECETTE))
}

/**
 * Répartit les articles restants entre `nb` recettes. Chaque recette reçoit d'abord des articles de base de rayons
 * variés (féculent, protéine, légume…), « à finir vite » en premier, 4 au plus ; puis 2 épices ou condiments au plus
 * en complément. S'il n'y a que des épices, elles servent de base. Le surplus attend le passage suivant.
 * @returns [[items], …]
 */
export function repartirArticles(items, nb) {
  if (!nb || !items.length) return []
  const ordre = ['Féculents', 'Viandes & Poissons', 'Fruits & Légumes', 'Laitiers & Œufs', 'Divers', 'Épicerie & Condiments']
  const tri = (a, b) => (b.vite ? 1 : 0) - (a.vite ? 1 : 0) || ordre.indexOf(categoriser(a.nom)) - ordre.indexOf(categoriser(b.nom))
  let bases = items.filter(estBase), complements = items.filter(i => !estBase(i))
  if (!bases.length) { bases = complements; complements = [] }
  bases = [...bases].sort(tri)
  complements = [...complements].sort(tri)
  const groupes = Array.from({ length: Math.min(nb, bases.length, MAX_RECETTES_IA) }, () => [])
  bases.slice(0, groupes.length * MAX_ARTICLES_PAR_RECETTE).forEach((item, k) => groupes[k % groupes.length].push(item))
  complements.slice(0, groupes.length * MAX_COMPLEMENTS_PAR_RECETTE).forEach((item, k) => groupes[k % groupes.length].push(item))
  return groupes
}

/**
 * Une recette IA met-elle trop du placard dans un seul plat ? (articles de base du placard utilisés au-delà
 * des siens + 2 ; les épices ne comptent pas). Sert à écarter une recette fourre-tout si l'IA n'a pas suivi la consigne.
 */
export function recetteFourreTout(recette, inventaire, attribues = []) {
  const bases = inventaire.filter(estBase)
  const utilises = bases.filter(i => utilise(recette, i)).length
  return utilises > Math.max(MAX_ARTICLES_PAR_RECETTE, attribues.filter(estBase).length) + 2
}

// ── Après cuisson, ordre conseillé ───────────────────────────────────
/**
 * Une recette cuisinée pour `portions` personnes : ses articles sortent du placard, ou leur quantité baisse quand on peut
 * la calculer (500 g − 300 g = 200 g). Un article dont la quantité est inconnue reste s'il sert encore à une autre recette retenue.
 * @returns { inventaire, retires: [noms], diminues: [{ nom, quantite }] }
 */
export function apresCuisson(inventaire, recette, portions, autresRecettes = []) {
  const retires = [], diminues = []
  const res = []
  for (const item of inventaire) {
    if (!utilise(recette, item)) { res.push(item); continue }
    const stock = quantiteEnBase(item.quantite), besoin = besoinArticle(recette, item, portions)
    if (stock && besoin && stock.unite === besoin.unite) {
      const reste = stock.n - besoin.n
      if (reste > stock.n * 0.1) { const q = texteQuantite({ n: reste, unite: stock.unite }); diminues.push({ nom: item.nom, quantite: q }); res.push({ ...item, quantite: q }); continue }
      retires.push(item.nom); continue
    }
    if (autresRecettes.some(r => r.id !== recette.id && utilise(r, item))) { res.push(item); continue }
    retires.push(item.nom)
  }
  return { inventaire: res, retires, diminues }
}

// Rayons des produits qui se gardent le moins
const FRAIS = ['Viandes & Poissons', 'Fruits & Légumes', 'Laitiers & Œufs']

/**
 * Ordre conseillé des recettes retenues : d'abord celles qui utilisent des articles « à finir vite », puis des produits frais.
 * @returns recettes triées ; `prioritaires` : ids des recettes à cuisiner en premier
 */
export function ordreConseille(recettes, inventaire) {
  const { parRecette } = couverture(inventaire, recettes)
  const parId = new Map(inventaire.map(i => [i.id, i]))
  const score = r => (parRecette[r.id] || []).reduce((s, id) => { const i = parId.get(id); return s + (i?.vite ? 10 : 0) + (FRAIS.includes(categoriser(i?.nom || '')) ? 1 : 0) }, 0)
  const tries = [...recettes].map((r, k) => ({ r, s: score(r), k })).sort((a, b) => b.s - a.s || a.k - b.k)
  return { recettes: tries.map(x => x.r), prioritaires: new Set(tries.filter(x => x.s >= 10).map(x => x.r.id)) }
}

/** « 2 boîtes de pois chiches » pour le prompt et l'affichage */
export const libelleArticle = i => `${i.quantite ? `${i.nom} (${i.quantite})` : i.nom}${i.vite ? ' — à finir vite' : ''}`

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
    ? inventaire.map(i => `- [${utilises.has(i.id) ? 'x' : ' '}] ${md(i.nom)}${i.quantite ? ` — ${md(i.quantite)}` : ''}${i.vite ? ' _(à finir vite)_' : ''}`).join('\n')
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
