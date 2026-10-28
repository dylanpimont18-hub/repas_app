// js/utils.js — Fonctions pures, sans dépendance navigateur ni Supabase (testables avec node --test)

// Échappe une valeur avant insertion dans du HTML
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Clé ISO de semaine : "2026-W43"
export function getSemaineKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// Regroupe des appels successifs en un seul (ex : rafales d'événements temps réel)
export function debounce(fn, ms = 250) {
  let t = null
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}

// ── Quantités de la liste de courses ─────────────────────────────────
const sansAccents = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe')
const singulier = m => (m.length > 3 ? m.replace(/(s|x)$/, '') : m)

// Mots qui ne changent pas l'article à acheter
const QUALIFICATIFS = /\b(surgel[ée]e?s?|en boite|en conserve|boite|egoutt[ée]e?s?|frais|fraiche|fraiches|hach[ée]e?s?|rap[ée]e?s?|emiett[ée]e?s?|coup[ée]e?s?|moyens?|moyennes?|petites?|gros|grosses?|halal|bio|nature)\b/g

// Clé de regroupement : « Pommes de terre », « pomme de terre (coupées en cubes) » → « pomme de terre »
export function cleIngredient(nom) {
  return sansAccents(nom).replace(/\([^)]*\)/g, ' ').replace(QUALIFICATIFS, ' ')
    .replace(/[^a-z0-9' -]/g, ' ').split(/\s+/).filter(Boolean).map(singulier).join(' ').trim()
}

// Nom affiché : sans la note entre parenthèses, première lettre en majuscule
export function nomIngredient(nom) {
  const n = String(nom ?? '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  return n.charAt(0).toUpperCase() + n.slice(1)
}

// Unités équivalentes ramenées à une seule écriture
const UNITES = [
  [/^(c\.?\s*(a|à)\s*caf[ée]|c\.?\s*c\.?|cuill[eè]res?\s*(a|à)\s*caf[ée]|cc)$/i, 'c.c.'],
  [/^(c\.?\s*(a|à)\s*soupe|c\.?\s*s\.?|cuill[eè]res?\s*(a|à)\s*soupe|cs)$/i, 'c.s.'],
  [/^(g|gr|grammes?)$/i, 'g'], [/^(kg|kilos?|kilogrammes?)$/i, 'kg'],
  [/^(ml|millilitres?)$/i, 'ml'], [/^(cl|centilitres?)$/i, 'cl'], [/^(l|litres?)$/i, 'l'],
]
function normaliserUnite(brute, nom) {
  let u = String(brute ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  u = u.replace(/^(de |d')/, '').trim()
  for (const [re, std] of UNITES) if (re.test(u)) return std
  if (!u) return ''
  // « 3 carottes », « 1,5 citron » : l'unité est l'ingrédient lui-même → des pièces
  const premier = cleIngredient(u).split(' ')[0]
  if (premier && cleIngredient(nom).split(' ').includes(premier)) return ''
  return u.split(' ').map((m, i) => (i === 0 ? singulier(m) : m)).join(' ')
}

// « 1/2 », « 1 1/2 », « ½ », « 1,5 » → nombre (et le reste du texte)
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }
export function lireQuantite(valeur) {
  const v = String(valeur ?? '').trim().replace(/[½¼¾⅓⅔]/g, f => ` ${FRACTIONS[f]} `).replace(/\s+/g, ' ').trim()
  let m = v.match(/^(\d+) (\d+)\s*\/\s*(\d+)\s*(.*)$/)
  if (m) return { n: +m[1] + m[2] / m[3], reste: m[4] }
  m = v.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/)
  if (m) return { n: m[1] / m[2], reste: m[3] }
  m = v.match(/^(\d+(?:[.,]\d+)?)(?: (0\.\d+))?\s*(.*)$/)
  if (m) return { n: parseFloat(m[1].replace(',', '.')) + (m[2] ? parseFloat(m[2]) : 0), reste: m[3] }
  return null
}

// ── Ligne d'ingrédient saisie ou collée ──────────────────────────────
// Unités reconnues après la quantité (« 2 c.s. », « 1 pincée », « 400 g ») ; le reste est le nom de l'ingrédient
const UNITE_LIGNE = /^(kg|g|gr|grammes?|mg|ml|cl|dl|l|litres?|c\.? ?[àa] ?s(?:oupe)?\.?|c\.? ?[àa] ?c(?:af[ée])?\.?|c\.s\.?|c\.c\.?|cs|cc|cuill[eè]res? [àa] (?:soupe|caf[ée])|pinc[ée]es?|gousses?|tranches?|bottes?|bo[iî]tes?|sachets?|filets?|brins?|feuilles?|poign[ée]es?|pots?|verres?|tasses?|bols?|morceaux?|pav[ée]s?|branches?|t[eê]tes?|zestes?|traits?|cubes?|briques?)(?=\s|$)/i

/**
 * « 400 g Tomates » → { quantite: '400 g', nom: 'Tomates' } ; « 1 pincée de sel » → { quantite: '1 pincée', nom: 'sel' } ;
 * « Sel » → { quantite: '', nom: 'Sel' }
 */
export function lireLigneIngredient(ligne) {
  let reste = String(ligne ?? '').replace(/^[-•*]\s*/, '').replace(/\s+/g, ' ').trim()
  if (!reste) return null
  const nombre = reste.match(/^((?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½¼¾⅓⅔])(?:\s*(?:à|-)\s*\d+(?:[.,]\d+)?)?(?:\s+\d+\s*\/\s*\d+|\s*[½¼¾⅓⅔])?)\s*(.*)$/)
  if (!nombre) return { quantite: '', nom: reste }
  let quantite = nombre[1].replace(/\s+/g, ' ').trim()
  reste = nombre[2]
  const unite = reste.match(UNITE_LIGNE)
  if (unite) { quantite += ` ${unite[1]}`; reste = reste.slice(unite[0].length).trim() }
  reste = reste.replace(/^(de |d')/i, '').trim()
  return reste ? { quantite, nom: reste } : { quantite: '', nom: quantite }
}

// Unités que l'ancien formulaire séparait de la quantité (« 400 » + « g Tomates ») ; pas « noix de coco » ni « filets de poulet »
const UNITE_COUPEE = /^(kg|g|gr|mg|ml|cl|dl|l|c\.s\.?|c\.c\.?|cs|cc|c\. ?[àa] ?(?:s|c)\.?|cuill[eè]res?|pinc[ée]es?)\s/i

/**
 * Répare un ingrédient abîmé par l'ancien formulaire d'édition (quantité coupée au premier espace) :
 * { quantite: '400', nom: 'g Tomates' } → { quantite: '400 g', nom: 'Tomates' } ; { quantite: 'Sel', nom: '' } → { quantite: '', nom: 'Sel' }
 */
export function reparerIngredient(i) {
  const quantite = String(i?.quantite ?? '').trim(), nom = String(i?.nom ?? '').trim()
  if (!nom) return quantite ? lireLigneIngredient(quantite) : { quantite: '', nom: '' }
  if (/^[\d.,/½¼¾⅓⅔ -]+$/.test(quantite) && UNITE_COUPEE.test(nom)) {
    const r = lireLigneIngredient(`${quantite} ${nom}`)
    if (r && r.nom) return r
  }
  return { quantite, nom }
}

// [{ valeur: '200 g', facteur: 1.5 }, …] → '300 g + 1 c.s.' (ajusté aux portions et additionné par unité)
export function combinerQuantites(quantites, nom = '') {
  const parUnite = new Map()
  const autres   = new Set()
  for (const { valeur, facteur = 1 } of quantites) {
    const q = lireQuantite(valeur)
    if (!q) { const t = String(valeur ?? '').replace(/\([^)]*\)/g, '').trim(); if (t) autres.add(t.toLowerCase()); continue }
    const unite = normaliserUnite(q.reste, nom)
    parUnite.set(unite, (parUnite.get(unite) || 0) + q.n * facteur)
  }
  // Pièces et cuillères : arrondi au demi supérieur / à l'unité ; grammes et ml : à l'unité ; le reste : 1 décimale
  const arrondir = (n, u) => {
    const v = !u ? Math.max(1, Math.ceil(n - 0.05))
      : /^(g|ml|cl)$/.test(u) ? Math.round(n)
      : /^(c\.c\.|c\.s\.|pinc[ée]e|poign[ée]e|botte|gousse|tranche|pav[ée])/.test(u) ? Math.max(0.5, Math.ceil(n * 2 - 0.1) / 2)
      : Math.round(n * 10) / 10
    return String(v).replace('.', ',')
  }
  const pluriel = (u, n) => (n > 1 && /^(pinc[ée]e|poign[ée]e|botte|gousse|tranche|pav[ée]|boite|sachet|feuille|brin)$/.test(u) ? `${u}s` : u)
  // Grandes quantités : 1900 g → 1,9 kg ; 1500 ml → 1,5 l
  for (const [petite, grande] of [['g', 'kg'], ['ml', 'l']]) {
    const n = parUnite.get(petite)
    if (n >= 1000) { parUnite.delete(petite); parUnite.set(grande, (parUnite.get(grande) || 0) + n / 1000) }
  }
  const numeriques = [...parUnite].map(([u, n]) => {
    const v = arrondir(n, u)
    return `${v}${u ? ' ' + pluriel(u, parseFloat(v.replace(',', '.'))) : ''}`
  })
  return [...numeriques, ...autres].join(' + ')
}

// ── Répartition des courses du cycle : 🛒 samedi magasin / 🚗 mercredi drive ──
// lignes : [{ partie: 'samedi' | 'mercredi', nom, quantite, facteur }]
// Un ingrédient utilisé dans les deux parties va dans la première (samedi) avec la quantité totale.
// → { samedi: { rayon: [{ nom, quantites }] }, mercredi: { ... } }
export function repartirCourses(lignes) {
  const agregat = new Map()
  for (const l of lignes) {
    const k = cleIngredient(l.nom)
    if (!k) continue
    if (!agregat.has(k)) agregat.set(k, { nom: nomIngredient(l.nom), quantites: [], parties: new Set() })
    const a = agregat.get(k)
    a.quantites.push({ valeur: l.quantite, facteur: l.facteur ?? 1 })
    a.parties.add(l.partie)
  }
  const res = { samedi: {}, mercredi: {} }
  for (const a of agregat.values()) {
    const partie = a.parties.has('samedi') ? 'samedi' : 'mercredi'
    const rayon  = categoriser(a.nom)
    ;(res[partie][rayon] ||= []).push({ nom: a.nom, quantites: a.quantites })
  }
  return res
}

// ── Catégories de supermarché ────────────────────────────────────────
const CAT_MAP = {
  'Fruits & Légumes': ['tomate','courgette','aubergine','poivron','oignon','ail','carotte',
    'salade','champignon','avocat','citron','orange','pomme','banane','mangue','herbe',
    'persil','basilic','menthe','coriandre','légume','fruit','céleri','poireau','brocoli',
    'épinard','betterave','fenouil','asperge','potiron','navet','chou','endive','artichaut',
    'concombre','radis','petits pois','haricots verts','maïs','pomme de terre','patate'],
  'Viandes & Poissons': ['poulet','agneau','bœuf','boeuf','veau','dinde','canard','lapin',
    'saumon','cabillaud','thon','sardine','crevette','maquereau','merlan','sole','dorade',
    'calamar','moule','lotte','merguez','kefta','escalope'],
  'Féculents': ['riz','pâtes','pates','semoule','boulgour','quinoa','lentille',
    'pois chiche','haricot blanc','haricot rouge','farine','nouille','pain pita'],
  'Laitiers & Œufs': ['œuf','oeuf','lait','crème','beurre','fromage','yaourt',
    'feta','mozzarella','ricotta','coco'],
  'Épicerie & Condiments': ['huile','vinaigre','sauce','moutarde','miel','concentré',
    'bouillon','tahini','sel','poivre','cumin','paprika','curcuma','cannelle','curry',
    'harissa','ras-el-hanout','sumac','safran','cardamome','laurier','aneth',
    'romarin','thym','origan','gingembre','piment','herbes de provence'],
}

// Articles ajoutés à la main → rangés dans leur partie et leur rayon, sauf s'ils sont déjà dans la liste
// libres : [{ id, nom, partie }] ; modifie et renvoie `parties`
export function ajouterArticlesLibres(parties, libres) {
  const presents = new Set(Object.values(parties).flatMap(rayons => Object.values(rayons).flat()).map(i => cleIngredient(i.nom)))
  for (const l of libres) {
    const cle = cleIngredient(l.nom)
    if (!cle || presents.has(cle)) continue
    presents.add(cle)
    ;((parties[l.partie] ||= {})[categoriser(l.nom)] ||= []).push({ nom: nomIngredient(l.nom), quantites: [], libreId: l.id })
  }
  return parties
}

// Sépare les articles « toujours au placard » (sel, huile, épices…) : placard = [cleIngredient]
// → { parties: sans ces articles, auPlacard: [item] }
export function separerPlacard(parties, placard = []) {
  const set = new Set(placard)
  const auPlacard = []
  const res = {}
  for (const [partie, rayons] of Object.entries(parties)) {
    res[partie] = {}
    for (const [rayon, items] of Object.entries(rayons)) {
      const gardes = items.filter(i => {
        if (!i.libreId && set.has(cleIngredient(i.nom))) { auPlacard.push(i); return false }
        return true
      })
      if (gardes.length) res[partie][rayon] = gardes
    }
  }
  return { parties: res, auPlacard: auPlacard.sort((a, b) => a.nom.localeCompare(b.nom)) }
}

export function categoriser(nom) {
  const n = nom.toLowerCase()
  // Épices en poudre / moulues avant les herbes fraîches du même nom (coriandre, gingembre…)
  if (/(^|[^a-z])(poudre|moulue?|s[ée]ch[ée]e?s?)([^a-z]|$)/.test(n) && !/tomates? s[ée]ch/.test(n)) return 'Épicerie & Condiments'
  for (const [cat, mots] of Object.entries(CAT_MAP)) {
    if (mots.some(m => n.includes(m))) return cat
  }
  return 'Divers'
}

// ── Validation végétarienne post-génération IA ───────────────────────
const MOTS_VIANDE_POISSON = [
  'poulet','dinde','bœuf','boeuf','agneau','veau','porc','canard','lapin','mouton',
  'saumon','thon','cabillaud','merlan','tilapia','sardine','maquereau','crevette',
  'moule','homard','crabe','calmar','seiche','dorade','sole','truite',
  'lardons','jambon','saucisse','merguez','chipolata','steak','escalope',
  'blanc de poulet','entrecôte',
]
// Mots courts testés en mot entier pour éviter les faux positifs ("bar" dans "barquette", "lieu" dans "milieu")
const MOTS_ENTIERS = ['bar', 'lieu', 'cuisse', 'aile', 'côte']

export function validerVegetarien(recette) {
  if (recette.vegetarien === false) return false
  const texte = [
    recette.nom,
    ...(recette.ingredients || []).map(i => `${i.nom} ${i.quantite}`),
  ].join(' ').toLowerCase()
  if (MOTS_VIANDE_POISSON.some(mot => texte.includes(mot))) return false
  return !MOTS_ENTIERS.some(mot => new RegExp(`(^|[^\\p{L}])${mot}([^\\p{L}]|$)`, 'u').test(texte))
}
