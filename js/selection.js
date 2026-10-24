// js/selection.js — Choix des recettes dans la bibliothèque, sans IA (fonctions pures, testées sous Node)
import { normaliser, passeFiltres, contientInterdit, scoreStyle } from './filtres.js'
import { categoriser } from './utils.js'
import { soirAssocie } from './cycle.js'

const JOUR_MS        = 86400000
const ROTATION_JOURS = 21    // une recette ne revient pas avant 3 semaines
const POIDS = { adore: 3, aime: 1, reutilisation: 1.5, anciennete: 0.5, ancienneteMax: 8,
                jamaisMangee: 3, proteineRepetee: -3, cuisineRepetee: -2, style: 4, conservationInconnue: -1 }
const CATS_FRAICHES = ['Fruits & Légumes', 'Viandes & Poissons', 'Laitiers & Œufs']

// ── Correspondance ingrédient noté ↔ recette, mot à mot ───────────────
// « Poulet (cuisse) » → [poulet, cuisse] : trouvé dans « Cuisses de poulet » mais pas dans « Poulet (filet) »
const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'en', 'd', 'l', 'et', 'un', 'une'])
const singulier = m => (m.length > 3 ? m.replace(/(s|x)$/, '') : m)

export function motsDe(texte) {
  return normaliser(String(texte ?? '').replace(/[()]/g, ' '))
    .split(/[^a-z0-9]+/).filter(m => m && !MOTS_VIDES.has(m)).map(singulier)
}

export function motsRecette(r) {
  const c = r.composants || {}
  return new Set(motsDe([r.nom, c.base, c.principal, c.proteine, ...(c.legumes || []),
    ...(r.ingredients || []).map(i => i.nom)].filter(Boolean).join(' ')))
}

const correspond = (mots, motsTexte) => mots.length > 0 && mots.every(m => motsTexte.has(m))

// Index des préférences : [{ motif, mots, categorie, niveaux: { dylan, femme } }] à partir des ingrédients notés
export function construireIndexPrefs(ingredients, prefs) {
  return ingredients
    .map(i => ({
      motif: normaliser(i.nom),
      mots: motsDe(i.nom),
      categorie: i.categorie,
      niveaux: { dylan: prefs.dylan?.[i.id] || null, femme: prefs.femme?.[i.id] || null },
    }))
    .filter(p => p.mots.length && (p.niveaux.dylan || p.niveaux.femme))
}

// Légumes « Je n'aime pas » de la femme : candidats à cacher plutôt qu'exclus
export function legumesACacher(indexPrefs) {
  return indexPrefs.filter(p => p.categorie === 'legumes' && p.niveaux.femme === 'j_aime_pas').map(p => p.motif)
}


function estCache(recette, pref) {
  return (recette.legumes_caches || []).some(l => correspond(pref.mots, new Set(motsDe(l.legume))))
}

// Protéine principale : champ structuré, sinon déduite des ingrédients (anciennes recettes)
const PROTEINES = ['poulet', 'boeuf', 'dinde', 'agneau', 'veau', 'kefta', 'merguez', 'saumon', 'thon', 'cabillaud',
  'crevette', 'poisson', 'oeuf', 'pois chiche', 'lentille', 'haricot', 'tofu']
export function proteinePrincipale(r) {
  if (r.composants?.proteine) return normaliser(r.composants.proteine).split(' ')[0]
  const mots = motsRecette(r)
  return PROTEINES.find(p => motsDe(p).every(m => mots.has(m))) || null
}

// Ingrédients frais d'une recette (pour le bonus de réutilisation)
export function ingredientsFrais(recette) {
  return new Set((recette.ingredients || [])
    .filter(i => CATS_FRAICHES.includes(categoriser(i.nom || '')))
    .map(i => normaliser(i.nom).replace(/s$/, '')))
}

// Évalue une recette pour un créneau : null si exclue, sinon un score (plus haut = mieux)
export function evaluer(recette, creneau, ctx) {
  if (!recette?.nom) return null
  if (contientInterdit(recette)) return null
  if (!passeFiltres(recette, ctx.filtres)) return null

  // Session de cuisine : la recette doit tenir jusqu'au jour du repas
  let score = 0
  if (creneau.enSession && creneau.joursConservation > 0) {
    if (recette.conservation_jours == null) score += POIDS.conservationInconnue
    else if (recette.conservation_jours < creneau.joursConservation) return null
  }

  // Rotation : pas mangée dans les 3 dernières semaines avant le cycle
  const derniere = ctx.historique?.[recette.id]
  if (derniere && ctx.debut && (ctx.debut - derniere) < ROTATION_JOURS * JOUR_MS) return null

  // Préférences des profils qui mangent à ce créneau
  const mots = motsRecette(recette)
  const trouvees = (ctx.indexPrefs || []).filter(p => correspond(p.mots, mots))
  for (const profil of creneau.profils) {
    const notees = trouvees.filter(p => p.niveaux[profil])
    for (const p of notees) {
      const n = p.niveaux[profil]
      if (n === 'j_aime_pas') {
        // Une note plus précise l'emporte : « Dinde » détestée mais « Escalope de dinde » adorée
        const plusPrecise = notees.some(q => q !== p && q.niveaux[profil] !== 'j_aime_pas'
          && q.mots.length > p.mots.length && p.mots.every(m => q.mots.includes(m)))
        const cachable = profil === 'femme' && p.categorie === 'legumes' && estCache(recette, p)
        if (!plusPrecise && !cachable) return null
      }
      if (n === 'j_adore') score += POIDS.adore
      if (n === 'j_aime')  score += POIDS.aime
    }
  }

  // Ancienneté : plus c'est loin, mieux c'est
  score += derniere
    ? Math.min((ctx.debut - derniere) / (7 * JOUR_MS), POIDS.ancienneteMax) * POIDS.anciennete
    : POIDS.jamaisMangee

  // Réutilisation des ingrédients frais déjà prévus dans le cycle (anti-gaspi)
  if (ctx.ingredientsChoisis?.size) {
    for (const i of ingredientsFrais(recette)) if (ctx.ingredientsChoisis.has(i)) score += POIDS.reutilisation
  }

  // Variété : pas trois fois la même protéine ou la même cuisine
  const prot = proteinePrincipale(recette)
  if (prot && (ctx.proteines?.get(prot) || 0) >= 2) score += POIDS.proteineRepetee
  const cuis = normaliser(recette.cuisine)
  if (cuis && (ctx.cuisines?.get(cuis) || 0) >= 2) score += POIDS.cuisineRepetee

  score += scoreStyle(recette, ctx.style) * POIDS.style
  return score
}

// Contexte mutable de remplissage : ce qui est déjà choisi dans le cycle
export function nouveauContexte({ indexPrefs, filtres = [], style = '', historique = {}, debut, dejaChoisies = [] }) {
  const ctx = { indexPrefs, filtres, style, historique, debut,
    utilisees: new Set(), ingredientsChoisis: new Set(), proteines: new Map(), cuisines: new Map() }
  dejaChoisies.forEach(r => noterChoix(ctx, r))
  return ctx
}

export function noterChoix(ctx, recette) {
  if (!recette) return
  ctx.utilisees.add(recette.id)
  ingredientsFrais(recette).forEach(i => ctx.ingredientsChoisis.add(i))
  const prot = proteinePrincipale(recette)
  if (prot) ctx.proteines.set(prot, (ctx.proteines.get(prot) || 0) + 1)
  const cuis = normaliser(recette.cuisine)
  if (cuis) ctx.cuisines.set(cuis, (ctx.cuisines.get(cuis) || 0) + 1)
}

// Recettes candidates pour un créneau, triées par score décroissant
export function candidats(recettes, creneau, ctx, { exclure = [] } = {}) {
  return recettes
    .filter(r => !ctx.utilisees.has(r.id) && !exclure.includes(r.id))
    .map(r => ({ recette: r, score: evaluer(r, creneau, ctx) }))
    .filter(x => x.score !== null)
    .sort((a, b) => b.score - a.score)
}

/**
 * Remplit les créneaux demandés du cycle.
 * @param creneaux      tous les créneaux du cycle (cycle.js)
 * @param aRemplir      clés des créneaux à remplir
 * @param plan          { cle: recette } pour les créneaux déjà occupés (non remplacés)
 * @param reserve       [{ id, recette, portions }] plats du congélo, prioritaires
 * @returns { propositions: [{ cle, recette, source, reserveId? }], vides: [cle] }
 */
export function remplirCycle({ creneaux, aRemplir, plan = {}, recettes, reserve = [], ...options }) {
  const cibles = new Set(aRemplir)
  const ctx = nouveauContexte({ ...options, dejaChoisies: Object.entries(plan).filter(([k]) => !cibles.has(k)).map(([, r]) => r) })
  const choisi = { ...Object.fromEntries(Object.entries(plan).filter(([k]) => !cibles.has(k))) }
  const propositions = []
  const parCle = Object.fromEntries(creneaux.map(c => [c.cle, c]))
  const ordre  = creneaux.filter(c => cibles.has(c.cle))

  const affecter = (c, recette, source, extra = {}) => {
    choisi[c.cle] = recette
    noterChoix(ctx, recette)
    propositions.push({ cle: c.cle, recette, source, ...extra })
  }

  // 1. Réserve congélo d'abord (aucune cuisine, aucune course), sur les créneaux sur place compatibles
  const reserveDispo = [...reserve]
  for (const c of ordre) {
    if (choisi[c.cle] || c.enSession) continue
    const i = reserveDispo.findIndex(x => x.portions >= c.portions && evaluer(x.recette, c, { ...ctx, historique: {} }) !== null)
    if (i >= 0) { const [x] = reserveDispo.splice(i, 1); affecter(c, x.recette, 'reserve', { reserveId: x.id }) }
  }

  // 2. Repas familiaux (grandes portions) d'abord, puis les petits midis
  const grands = ordre.filter(c => !choisi[c.cle] && !(c.moment === 'midi' && c.enSession && soirAssocie(creneaux, c)))
  for (const c of grands) {
    const [meilleur] = candidats(recettes, c, ctx)
    if (meilleur) affecter(c, meilleur.recette, 'biblio')
  }

  // 3. Midis cuisinés en session : reprendre le plat d'un soir de la même session (cuisiné en plus grande quantité)
  for (const c of ordre) {
    if (choisi[c.cle]) continue
    const soir = soirAssocie(creneaux, c)
    const plat = soir && choisi[soir.cle]
    const dejaRepris = plat && propositions.some(p => p.source === 'reste' && p.recette.id === plat.id)
    if (plat && !dejaRepris && evaluer(plat, c, { ...ctx, historique: {} }) !== null) {
      choisi[c.cle] = plat
      propositions.push({ cle: c.cle, recette: plat, source: 'reste' })
      continue
    }
    const [meilleur] = candidats(recettes, c, ctx)
    if (meilleur) affecter(c, meilleur.recette, 'biblio')
  }

  const vides = ordre.filter(c => !choisi[c.cle]).map(c => c.cle)
  return { propositions, vides, parCle }
}

/**
 * Décalage en cascade pour « Envie ce soir » → « Décaler au repas suivant ».
 * Chaque plat déplacé prend le prochain créneau d'au moins autant de portions ; celui qui sort du cycle part en réserve.
 * @param creneaux  créneaux ordonnés du cycle
 * @param plan      { cle: { recetteId, source } }
 * @returns { changements: [{ cle, recetteId, source }], sortant: { recetteId, portions } | null }
 */
export function decalerEnCascade(creneaux, plan, cleCible, nouveau) {
  const idx = creneaux.findIndex(c => c.cle === cleCible)
  const changements = [{ cle: cleCible, recetteId: nouveau.recetteId, source: nouveau.source }]
  let porte = plan[cleCible] ? { ...plan[cleCible], portions: creneaux[idx].portions } : null
  let i = idx
  while (porte) {
    const j = creneaux.findIndex((c, k) => k > i && c.portions >= porte.portions)
    if (j < 0) return { changements, sortant: { recetteId: porte.recetteId, portions: porte.portions } }
    const suivant = plan[creneaux[j].cle]
    changements.push({ cle: creneaux[j].cle, recetteId: porte.recetteId, source: porte.source })
    porte = suivant ? { ...suivant, portions: creneaux[j].portions } : null
    i = j
  }
  return { changements, sortant: null }
}
