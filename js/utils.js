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
// [{ valeur: '200 g', facteur: 1.5 }, { valeur: '100g', facteur: 1 }] → '400 g'
// Les quantités numériques de même unité sont ajustées aux portions puis additionnées ;
// le reste ("1 pincée", "selon goût") est conservé tel quel.
export function combinerQuantites(quantites) {
  const parUnite = new Map()
  const autres   = []
  for (const { valeur, facteur = 1 } of quantites) {
    const m = String(valeur ?? '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/)
    if (!m) { if (valeur) autres.push(String(valeur).trim()); continue }
    const unite = m[2].trim()
    parUnite.set(unite, (parUnite.get(unite) || 0) + parseFloat(m[1].replace(',', '.')) * facteur)
  }
  // Pièces (« 3 carottes ») : arrondi au supérieur ; grammes / millilitres : à l'unité ; le reste : 1 décimale
  const arrondir = (n, unite) => {
    const u = unite.toLowerCase()
    const v = !u ? Math.ceil(n - 0.05)
      : /^(g|gr|ml|cl)(?![a-z])/.test(u) ? Math.round(n)
      : Math.round(n * 10) / 10
    return String(v).replace('.', ',')
  }
  const numeriques = [...parUnite].map(([unite, n]) => `${arrondir(n, unite)}${unite ? ' ' + unite : ''}`)
  return [...numeriques, ...autres].join(' + ')
}

// ── Répartition des courses du cycle : 🛒 samedi magasin / 🚗 mercredi drive ──
// lignes : [{ partie: 'samedi' | 'mercredi', nom, quantite, facteur }]
// Un ingrédient utilisé dans les deux parties va dans la première (samedi) avec la quantité totale.
// → { samedi: { rayon: [{ nom, quantites }] }, mercredi: { ... } }
export function repartirCourses(lignes) {
  const agregat = new Map()
  for (const l of lignes) {
    const k = String(l.nom || '').toLowerCase().trim()
    if (!k) continue
    if (!agregat.has(k)) agregat.set(k, { nom: l.nom.trim(), quantites: [], parties: new Set() })
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

export function categoriser(nom) {
  const n = nom.toLowerCase()
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
