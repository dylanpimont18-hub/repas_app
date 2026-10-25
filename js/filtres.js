// js/filtres.js — Vocabulaire des tags, sélecteurs et détections (viande, poisson, féculents, halal) — fonctions pures

// Vocabulaire fermé des tags de recette (l'IA doit choisir dedans)
export const TAGS = ['healthy', 'réconfortant', 'bouillon', 'gras', 'rapide', 'léger', 'économique']

export function normaliser(s) {
  return String(s ?? '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}

// Vrai si `mot` apparaît comme mot entier (pluriel en s/x toléré) dans un texte déjà normalisé
export function contientMot(texteNormalise, mot) {
  const m = normaliser(mot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!m) return false
  return new RegExp(`(^|[^a-z])${m}(s|x)?([^a-z]|$)`).test(texteNormalise)
}

function contientUn(texte, mots) { return mots.some(m => contientMot(texte, m)) }

const VIANDES = ['poulet','dinde','boeuf','agneau','veau','canard','lapin','mouton','merguez','kefta','steak',
  'escalope','viande','entrecote','gigot','poitrine de','cuisse de poulet','pilon','volaille','cordon bleu','nugget']
const POISSONS = ['saumon','thon','cabillaud','merlan','tilapia','sardine','maquereau','crevette','moule','homard',
  'crabe','calamar','calmar','seiche','dorade','bar','sole','truite','lieu','colin','poisson','fruits de mer',
  'gambas','surimi','anchois','lotte','haddock','saint-jacques']
const FECULENTS = ['riz','pates','spaghetti','tagliatelle','penne','macaroni','lasagne','nouille','semoule','couscous',
  'boulgour','quinoa','pomme de terre','patate','frite','pain','tortilla','wrap','gnocchi','polenta','ble','orge',
  'vermicelle','ravioli','pita','naan','galette']
// Halal strict : porc et alcool, y compris dérivés courants
const INTERDITS = ['porc','lard','lardon','jambon','bacon','chorizo','saucisson','pancetta','coppa','rillette',
  'gelatine','saindoux','andouille','boudin','vin','biere','rhum','cognac','calvados','kirsch','marsala',
  'porto','cidre','whisky','vodka','liqueur','mirin','sake','champagne','alcool']

// Texte normalisé décrivant ce que contient la recette (nom + composants + ingrédients)
export function texteRecette(r) {
  const c = r.composants || {}
  return normaliser([
    r.nom, c.base, c.principal, c.proteine, ...(c.legumes || []),
    ...(r.ingredients || []).map(i => i.nom),
  ].filter(Boolean).join(' | '))
}

export const contientViande   = r => contientUn(texteRecette(r), VIANDES)
export const contientPoisson  = r => contientUn(texteRecette(r), POISSONS)
// Le vinaigre de vin / de cidre n'est pas considéré comme de l'alcool
export const contientInterdit = r => contientUn(
  texteRecette(r).replace(/vinaigre (de )?(vin|cidre)( (blanc|rouge|rose))?/g, 'vinaigre'), INTERDITS)
export function contientFeculent(r) {
  if (r.composants?.base) return true
  return contientUn(texteRecette(r), FECULENTS)
}

const aTag = (r, t) => (r.tags || []).map(normaliser).includes(normaliser(t))
const tempsTotal = r => (r.temps_prep || 0) + (r.temps_cuisson || 0)

// Sélecteurs proposés partout (remplissage du cycle, ↻, envie du soir)
export const FILTRES = [
  { id: 'healthy',       label: 'Healthy',        test: r => aTag(r, 'healthy') || aTag(r, 'léger'),
    consigne: 'Recettes healthy : légères, riches en légumes, peu de matières grasses' },
  { id: 'sansViande',    label: 'Sans viande',    test: r => !contientViande(r),
    consigne: 'SANS VIANDE (poisson et fruits de mer autorisés)' },
  { id: 'sansPoisson',   label: 'Sans poisson',   test: r => !contientPoisson(r),
    consigne: 'SANS POISSON ni fruits de mer' },
  { id: 'vegetarien',    label: 'Végétarien',     test: r => r.vegetarien !== false && !contientViande(r) && !contientPoisson(r),
    consigne: 'VÉGÉTARIEN STRICT : aucune viande, aucun poisson, aucun fruit de mer ; champ "vegetarien" = true' },
  { id: 'sansFeculents', label: 'Sans féculents', test: r => !contientFeculent(r),
    consigne: 'SANS FÉCULENTS : ni riz, ni pâtes, ni pommes de terre, ni pain, ni semoule ; composants.base = null' },
  { id: 'rapide',        label: 'Rapide',          test: r => tempsTotal(r) > 0 && tempsTotal(r) <= 30,
    consigne: 'Rapide : préparation + cuisson ≤ 30 min' },
  { id: 'budget',        label: 'Budget',         test: r => aTag(r, 'économique'),
    consigne: 'Budget serré : ingrédients simples et économiques' },
  { id: 'reconfortant',  label: 'Réconfortant',   test: r => aTag(r, 'réconfortant'),
    consigne: 'Plat réconfortant, chaud, généreux' },
  { id: 'bouillon',      label: 'Bouillon / soupe', test: r => aTag(r, 'bouillon'),
    consigne: 'Bouillon, soupe ou plat en sauce bouillon (ramen, chorba, pho, pot-au-feu…)' },
  { id: 'gras',          label: 'Plutôt gras',    test: r => aTag(r, 'gras'),
    consigne: 'Plat plutôt gras et gourmand, assumé' },
]

// Deux familles : les contraintes s'appliquent à tous les repas, les envies à quelques repas seulement
export const ENVIES = ['bouillon', 'reconfortant', 'gras', 'healthy']
export const estEnvie = id => ENVIES.includes(id)

export function passeFiltres(recette, filtresActifs = []) {
  return filtresActifs.every(id => FILTRES.find(f => f.id === id)?.test(recette) ?? true)
}

export function consignesFiltres(filtresActifs = []) {
  return filtresActifs.map(id => FILTRES.find(f => f.id === id)?.consigne).filter(Boolean)
}

// Correspondance libre avec le champ « style » (asiatique, maghrébin…)
const SYNONYMES_STYLE = {
  asiatique:  ['japonais','japonaise','chinois','chinoise','thai','thailandais','vietnamien','coreen','coreenne','indien','indienne','asiatique','wok','curry','ramen','pho','teriyaki','soja'],
  maghrebin:  ['marocain','marocaine','algerien','algerienne','tunisien','tunisienne','maghrebin','maghrebine','tajine','couscous','chorba','harira','ras el hanout','ras-el-hanout','harissa'],
  italien:    ['italien','italienne','pates','risotto','pizza','lasagne','pesto'],
  mexicain:   ['mexicain','mexicaine','tacos','burrito','chili','fajita','tex-mex'],
  libanais:   ['libanais','libanaise','orient','oriental','orientale','falafel','houmous','taboule','shawarma'],
  francais:   ['francais','francaise','gratin','blanquette','pot-au-feu','hachis','quiche'],
}

export function scoreStyle(recette, style) {
  const s = normaliser(style)
  if (!s) return 0
  const texte = normaliser([recette.nom, recette.cuisine, recette.description, ...(recette.tags || []), texteRecette(recette)].join(' '))
  const mots = s.split(/[\s,;]+/).filter(m => m.length > 2)
  let score = 0
  for (const mot of mots) {
    const famille = Object.entries(SYNONYMES_STYLE).find(([k, syn]) => contientMot(k, mot) || syn.some(x => normaliser(x) === mot))
    const candidats = famille ? [famille[0], ...famille[1]] : [mot]
    if (candidats.some(c => contientMot(texte, c) || texte.includes(normaliser(c)))) score++
  }
  return score
}
