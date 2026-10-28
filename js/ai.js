// js/ai.js — Génération IA (Mammouth AI via l'Edge Function Supabase "ai") + prompts
import { getProfil }           from './preferences.js'
import { getAllIngredients }   from './custom-ingredients.js'
import { dbAppelFonctionIA, dbAjouterUsageIA } from './db.js'
import { validerVegetarien }   from './utils.js'
import { TAGS, consignesFiltres, contientInterdit, passeFiltres } from './filtres.js'
import { labelCreneau, dateCourte } from './cycle.js'
import { TAILLE_LOT, coutImage, coutTokens, estimerTokens, decouperLots, codeErreurHttp, expliquerErreur, extraireRepasComplets } from './credit-ia.js'

// Saison courante (produits de saison)
export function getSaison() {
  const m = new Date().getMonth() + 1
  if (m >= 3 && m <= 5)  return 'printemps'
  if (m >= 6 && m <= 8)  return 'été'
  if (m >= 9 && m <= 11) return 'automne'
  return 'hiver'
}

// ── Préférences pour le prompt ───────────────────────────────────────
async function preferencesTexte() {
  const [dylan, femme, ingredients] = await Promise.all([getProfil('dylan'), getProfil('femme'), getAllIngredients()])
  const parId = Object.fromEntries(ingredients.map(i => [i.id, i]))
  const liste = (profil, niveau, filtre = () => true) => Object.entries(profil)
    .filter(([id, v]) => v === niveau && parId[id] && filtre(parId[id])).map(([id]) => parId[id].nom)
  const estLegume = i => i.categorie === 'legumes'

  const legumesACacher = liste(femme, 'j_aime_pas', estLegume)
  const lignes = [
    'DYLAN :',
    `  - Adore : ${liste(dylan, 'j_adore').join(', ') || '—'}`,
    `  - Aime bien : ${liste(dylan, 'j_aime').join(', ') || '—'}`,
    `  - N'aime PAS (exclure absolument dès que Dylan mange) : ${liste(dylan, 'j_aime_pas').join(', ') || '—'}`,
    'SA FEMME :',
    `  - Adore : ${liste(femme, 'j_adore').join(', ') || '—'}`,
    `  - Aime bien : ${liste(femme, 'j_aime').join(', ') || '—'}`,
    `  - N'aime PAS (exclure absolument dès qu'elle mange) : ${liste(femme, 'j_aime_pas', i => !estLegume(i)).join(', ') || '—'}`,
    `  - Légumes qu'elle n'aime pas mais qu'on veut lui faire manger CACHÉS : ${legumesACacher.join(', ') || '—'}`,
  ]
  return { texte: lignes.join('\n'), legumesACacher }
}

const FORMAT_RECETTE = `{
  "nom": "string",
  "description": "2 à 3 phrases : le plat et comment le préparer dans les grandes lignes",
  "cuisine": "string courte (japonaise, marocaine, française…)",
  "composants": { "base": "féculent ou null", "principal": "string", "proteine": "string ou null", "legumes": ["string"] },
  "ingredients": [{ "nom": "string", "quantite": "string (pour le nombre de portions indiqué)" }],
  "legumes_caches": [{ "legume": "string", "astuce": "comment le rendre invisible au goût et à l'œil" }],
  "tags": ["parmi : ${TAGS.join(', ')}"],
  "conservation_jours": number,
  "portions": number,
  "temps_prep": number,
  "temps_cuisson": number,
  "vegetarien": boolean,
  "nutrition": { "calories": number, "proteines": number, "glucides": number, "lipides": number }
}`

function decrireCreneau(c, i) {
  const qui = c.profils.length > 1 ? 'toute la famille (Dylan, sa femme, 2 enfants qui mangent comme les adultes) — préférences des DEUX adultes' : 'sa femme seule — uniquement SES préférences'
  const cuisson = c.enSession
    ? `cuisiné à l'avance le ${c.cuisineLe}, mangé ${c.joursConservation} jour(s) après → conservation_jours ≥ ${c.joursConservation}`
    : 'cuisiné le jour même'
  const envie = c.envies?.length ? ` · ENVIE pour ce repas uniquement : ${consignesFiltres(c.envies).join(' ; ')}` : ''
  return `- "c${i + 1}" : ${labelCreneau(c)} ${dateCourte(c.date)} · ${c.portions} portion(s) · ${qui} · ${cuisson}${envie}`
}

async function buildPrompt({ creneaux, filtres = [], style = '', ingredientsAReutiliser = [], nomsExistants = [], envie = false, avecIngredients = '', variantes = false }) {
  const prefs = await preferencesTexte()
  const consignes = consignesFiltres(filtres)
  const intro = variantes && creneaux.length > 1
    ? `Propose ${creneaux.length} idées de recettes AU CHOIX pour un même repas (une seule sera cuisinée) :
${decrireCreneau(creneaux[0], 0)}
Réponds avec ${creneaux.length} entrées, ids "c1" à "c${creneaux.length}", chacune pour ce même repas.
Les idées doivent être TRÈS DIFFÉRENTES entre elles : protéine, cuisine du monde et mode de cuisson différents (ignore la consigne de partage d'ingrédients entre recettes).`
    : `Propose ${creneaux.length === 1 ? 'UNE recette' : `${creneaux.length} recettes différentes`} pour ces repas :
${creneaux.map(decrireCreneau).join('\n')}`
  return `Tu es un chef cuisinier familial expert en anti-gaspi. ${intro}

CONTRAINTES ABSOLUES :
- Halal strict : ZÉRO porc, ZÉRO alcool (vin, bière, mirin, saké…), ni aucun dérivé (lardons, gélatine porcine…)
- Les ingrédients "N'aime PAS" du ou des profils concernés n'apparaissent JAMAIS
- Un légume de la liste "CACHÉS" peut être utilisé (c'est même souhaité) SEULEMENT s'il est rendu invisible ; décris alors l'astuce dans "legumes_caches"
- Les quantités des ingrédients correspondent au nombre de portions du créneau
- Une ENVIE indiquée sur un repas ne concerne QUE ce repas : les autres repas ne doivent pas en être
${consignes.length ? consignes.map(c => `- ${c}`).join('\n') : ''}
${style ? `- Style demandé (prioritaire) : "${style}"` : ''}
${envie ? '- C\'est une envie ponctuelle du moment : fais plaisir, un plat qui donne envie tout de suite' : ''}
${avecIngredients ? `
CE QU'IL Y A À LA MAISON (prioritaire) : « ${avecIngredients} »
- La recette est construite AUTOUR de ces ingrédients et les utilise tous si c'est cohérent
- S'il s'agit de restes déjà cuisinés (ex. bœuf bourguignon, poulet rôti, riz cuit), transforme-les en un plat nouveau (effiloché, hachis, wrap, gratin, croquettes, sauté…) sans les recuire inutilement, et rappelle-le dans les étapes
- Complète avec le moins possible d'ingrédients à acheter, de préférence du placard
- Ces ingrédients restent soumis aux contraintes halal et aux goûts (ignore ceux qui seraient interdits)
` : ''}
PRÉFÉRENCES :
${prefs.texte}

SAISON : ${getSaison()} — privilégie les produits de saison.

LISTE DE COURSES COURTE (priorité forte) :
- Minimise le nombre d'INGRÉDIENTS DIFFÉRENTS sur l'ensemble des recettes : mieux vaut 3 recettes qui partagent 6 ingrédients que 3 recettes qui en utilisent 18 différents
- Au plus 10 ingrédients par recette (sel, poivre, huile et eau ne comptent pas)
- Mêmes épices, même féculent, mêmes légumes déclinés de plusieurs façons

ANTI-GASPI :
${ingredientsAReutiliser.length ? `- Ingrédients déjà achetés pour d'autres repas du cycle, à RÉUTILISER en priorité : ${ingredientsAReutiliser.join(', ')}` : ''}
- Entre les recettes proposées, partage un maximum d'ingrédients frais (légumes, protéines, herbes)
- Varie quand même les cuisines et les modes de cuisson

${nomsExistants.length ? `Recettes déjà dans la bibliothèque, à NE PAS reproposer : ${nomsExistants.slice(0, 120).join(', ')}` : ''}

"tags" : uniquement des valeurs parmi ${TAGS.join(', ')}.

Réponds UNIQUEMENT avec du JSON valide (sans markdown, sans backtick, sans explication) :
{ "repas": [ { "id": "c1", "recette": <recette> }, ... ] }

Chaque <recette> :
${FORMAT_RECETTE_ETAPES}`
}

// Toujours une vraie recette à suivre (planning, envie, livre) : étapes détaillées
const FORMAT_RECETTE_ETAPES = FORMAT_RECETTE.replace('  "tags"',
  '  "etapes": ["étape précise et complète (températures, temps, réglages de l\'appareil)"],\n  "tags"')

async function buildPromptLivre({ livre, nb, portions, filtres = [], style = '', piste = '', nomsExistants = [] }) {
  const prefs = await preferencesTexte()
  const consignes = consignesFiltres(filtres)
  return `Tu es un chef cuisinier familial. Crée ${nb === 1 ? 'UNE recette' : `${nb} recettes différentes`} pour le livre de recettes « ${livre.nom} ».
${livre.consigne ? `\nRÈGLE DU LIVRE (prioritaire, à respecter strictement dans chaque recette) : ${livre.consigne}\n` : ''}
Pour toute la famille (Dylan, sa femme, 2 enfants qui mangent comme les adultes) — préférences des DEUX adultes. ${portions} portion(s) par recette.

CONTRAINTES ABSOLUES :
- Halal strict : ZÉRO porc, ZÉRO alcool (vin, bière, mirin, saké…), ni aucun dérivé (lardons, gélatine porcine…)
- Les ingrédients "N'aime PAS" de Dylan ou de sa femme n'apparaissent JAMAIS
- Un légume de la liste "CACHÉS" peut être utilisé SEULEMENT s'il est rendu invisible ; décris alors l'astuce dans "legumes_caches"
- Les quantités des ingrédients correspondent à ${portions} portion(s)
${consignes.length ? consignes.map(c => `- ${c}`).join('\n') : ''}
${style ? `- Idée ou précision demandée (prioritaire) : "${style}"` : ''}

PRÉFÉRENCES :
${prefs.texte}

SAISON : ${getSaison()} — privilégie les produits de saison quand c'est possible.

QUALITÉ DU LIVRE :
- Des recettes variées entre elles (protéines, cuisines, textures), qui donnent envie
${piste ? `- D'autres recettes du livre sont écrites en même temps : pour éviter les doublons, privilégie ici la ${piste} (si c'est compatible avec la règle du livre et l'idée demandée)` : ''}
- Au plus 10 ingrédients par recette (sel, poivre, huile et eau ne comptent pas), faciles à trouver en supermarché
- Étapes numérotables, précises et complètes : un débutant doit réussir la recette sans autre aide

${nomsExistants.length ? `Recettes qui existent déjà, à NE PAS reproposer (ni variante trop proche) : ${nomsExistants.slice(0, 150).join(', ')}` : ''}

"tags" : uniquement des valeurs parmi ${TAGS.join(', ')}.

Réponds UNIQUEMENT avec du JSON valide (sans markdown, sans backtick, sans explication) :
{ "repas": [ { "id": "c1", "recette": <recette> }, ... ] }

Chaque <recette> :
${FORMAT_RECETTE_ETAPES}`
}

// ── Appel IA (streaming SSE au format OpenAI, relayé par l'Edge Function) ──
const PARALLELE = 3 // lots envoyés en même temps

// Erreur expliquée : `info` = { code, titre, explication, conseil, detail } pour l'affichage
export class ErreurIA extends Error {
  constructor(code, detail = '') {
    const info = expliquerErreur(code, detail)
    super(`${info.titre} — ${info.explication} ${info.conseil}`)
    this.info = info
  }
}

// Le journal ne doit jamais faire échouer une génération
async function journaliser(ligne) {
  try { await dbAjouterUsageIA(ligne) } catch (e) { console.warn('Journal IA', e.message) }
}

// Renvoie { texte, fin } avec fin = 'ok' | 'TRONQUEE' | 'COUPEE' ; chaque appel est noté dans ia_usage
async function callIA(prompt, { action = 'generation', nbRecettes = 0, onChunk = null } = {}) {
  const base = { action, nb_recettes: nbRecettes }
  let res
  try {
    res = await dbAppelFonctionIA({ action: 'chat', prompt })
  } catch (e) {
    throw new ErreurIA(e.message?.includes('Session') ? 'SESSION' : 'RESEAU')
  }

  if (!res.ok) {
    const corps = await res.json().catch(() => ({}))
    const code = codeErreurHttp(res.status, corps)
    await journaliser({ ...base, statut: 'erreur', erreur: code }) // refusé avant génération : rien de facturé
    throw new ErreurIA(code, corps.detail)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', fullText = '', finishReason = null, usage = null, termine = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (raw === '[DONE]') { termine = true; continue }
        if (!raw) continue
        try {
          const obj    = JSON.parse(raw)
          const choice = obj.choices?.[0]
          const delta  = choice?.delta?.content
          if (obj.usage) usage = obj.usage
          if (delta) {
            fullText += delta
            if (onChunk) onChunk(fullText)
          }
          if (choice?.finish_reason) finishReason = choice.finish_reason
        } catch { /* ligne SSE invalide, ignorer */ }
      }
    }
  } catch { /* flux coupé : traité comme une réponse interrompue */ }

  const fin = finishReason === 'length' ? 'TRONQUEE' : (finishReason || termine) ? 'ok' : 'COUPEE'
  const entree = usage?.prompt_tokens ?? estimerTokens(prompt)
  const sortie = usage?.completion_tokens ?? estimerTokens(fullText)
  await journaliser({
    ...base, tokens_entree: entree, tokens_sortie: sortie, cout: coutTokens(entree, sortie), estime: !usage,
    statut: fin === 'ok' ? 'ok' : fin === 'TRONQUEE' ? 'tronque' : 'erreur', erreur: fin === 'ok' ? null : fin,
  })
  return { texte: fullText, fin }
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new ErreurIA('ILLISIBLE')
  try { return JSON.parse(match[0]) } catch { throw new ErreurIA('ILLISIBLE') }
}

// Réponse complète → JSON ; réponse tronquée ou coupée → les repas entièrement reçus
function lireRepas({ texte, fin }) {
  if (fin === 'ok') return parseJSON(texte).repas || []
  const repas = extraireRepasComplets(texte)
  if (!repas.length) throw new ErreurIA(fin)
  return repas
}

// Exécute `tache` sur chaque élément, `n` à la fois
async function enParallele(liste, n, tache) {
  let suivant = 0
  const travailleur = async () => { while (suivant < liste.length) { const i = suivant++; await tache(liste[i], i) } }
  await Promise.all(Array.from({ length: Math.min(n, liste.length) }, travailleur))
}

// Nettoie une recette IA : champs attendus, tags du vocabulaire, nombres valides
function nettoyerRecette(r, portionsParDefaut) {
  const nombre = (v, def = 0) => Number.isFinite(Number(v)) ? Number(v) : def
  return {
    nom:                String(r.nom || '').trim(),
    description:        r.description ? String(r.description) : null,
    cuisine:            r.cuisine ? String(r.cuisine).toLowerCase() : null,
    composants: {
      base:      r.composants?.base || null,
      principal: r.composants?.principal || null,
      proteine:  r.composants?.proteine || null,
      legumes:   Array.isArray(r.composants?.legumes) ? r.composants.legumes : [],
    },
    ingredients:        (r.ingredients || []).filter(i => i?.nom).map(i => ({ nom: String(i.nom), quantite: String(i.quantite ?? '') })),
    legumes_caches:     (r.legumes_caches || []).filter(l => l?.legume && l?.astuce),
    tags:               (r.tags || []).map(t => String(t).toLowerCase()).filter(t => TAGS.includes(t)),
    conservation_jours: nombre(r.conservation_jours, 2),
    portions:           nombre(r.portions, portionsParDefaut) || portionsParDefaut,
    temps_prep:         nombre(r.temps_prep),
    temps_cuisson:      nombre(r.temps_cuisson),
    vegetarien:         !!r.vegetarien,
    etapes:             Array.isArray(r.etapes) ? r.etapes : [],
    nutrition:          r.nutrition || null,
  }
}

// Vérifie halal + sélecteurs ; renvoie les recettes conformes et les noms rejetés
function verifier(recettes, filtres) {
  const ok = [], rejets = []
  for (const x of recettes) {
    const r = x.recette
    const conforme = r.nom && !contientInterdit(r) && passeFiltres(r, filtres.filter(f => !['healthy','budget','reconfortant','bouillon','gras'].includes(f)))
      && (!filtres.includes('vegetarien') || validerVegetarien(r))
    ;(conforme ? ok : rejets).push(x)
  }
  return { ok, rejets: rejets.map(x => x.recette.nom || '?') }
}

// ── API publique ─────────────────────────────────────────────────────

// Un lot = un appel IA ; `items[i]` (créneau ou place dans le livre, avec `portions`) ↔ id "c{i+1}"
async function genererLot(items, construirePrompt, filtres, onRecues, k = 0) {
  const prompt = await construirePrompt(items, k)
  const onChunk = text => onRecues(Math.max(0, (text.match(/"recette"\s*:/g) || []).length - 1))
  const reponse = await callIA(prompt, { nbRecettes: items.length, onChunk })
  const lignes = lireRepas(reponse).map(x => {
    const i = parseInt(String(x.id || '').replace(/\D/g, ''), 10) - 1
    const creneau = items[i]
    return creneau && x.recette ? { creneau, recette: nettoyerRecette(x.recette, creneau.portions) } : null
  }).filter(Boolean)
  return { ...verifier(lignes, filtres), alerte: reponse.fin === 'ok' ? null : expliquerErreur(reponse.fin) }
}

/**
 * Génère une recette par item, par lots de TAILLE_LOT (`parallele` lots à la fois).
 * `onLot(resultats)` est appelé dès qu'un lot arrive (enregistrement au fil de l'eau).
 * Lève une ErreurIA seulement si aucun lot n'a abouti.
 * @returns { resultats: [{ creneau, recette }], rejets: [noms], erreurs: [info] }
 */
async function genererEnLots(items, { construirePrompt, filtres = [], parallele = PARALLELE }, onProgress, onLot) {
  if (!items.length) return { resultats: [], rejets: [], erreurs: [] }
  const lots = decouperLots(items)
  const recues = lots.map(() => 0)
  const signaler = () => onProgress?.(recues.reduce((a, b) => a + b, 0), items.length)
  const vus = new Set()
  const resultats = [], rejets = [], erreurs = []

  await enParallele(lots, parallele, async (lot, k) => {
    try {
      const { ok, rejets: refusees, alerte } = await genererLot(lot, construirePrompt, filtres, n => { recues[k] = Math.min(n, lot.length); signaler() }, k)
      // Les lots parallèles ne se voient pas : on écarte un plat déjà proposé par un autre lot
      const nouveaux = ok.filter(x => {
        const cle = x.recette.nom.toLowerCase()
        if (vus.has(cle)) { refusees.push(`${x.recette.nom} (en double)`); return false }
        vus.add(cle)
        return true
      })
      rejets.push(...refusees)
      if (alerte) erreurs.push(alerte)
      if (onLot && nouveaux.length) await onLot(nouveaux)
      resultats.push(...nouveaux)
    } catch (e) {
      erreurs.push(e.info || expliquerErreur('INCONNUE', e.message))
    }
    recues[k] = lot.length
    signaler()
  })

  if (!resultats.length && erreurs.length) throw new ErreurIA(erreurs[0].code, erreurs[0].detail)
  return { resultats, rejets, erreurs }
}

// Une recette par créneau du planning, lots en parallèle
export async function genererPourCreneaux({ creneaux, filtres = [], style = '', ingredientsAReutiliser = [], nomsExistants = [], envie = false, avecIngredients = '', variantes = false }, onProgress = null, onLot = null) {
  const options = { filtres, style, ingredientsAReutiliser, nomsExistants, envie, avecIngredients, variantes }
  return genererEnLots(creneaux, { construirePrompt: lot => buildPrompt({ creneaux: lot, ...options }), filtres }, onProgress, onLot)
}

// Pistes de variété : les lots envoyés en même temps ne se voient pas, chacun part d'une cuisine différente
const PISTES_LIVRE = [
  'cuisine française et européenne',
  'cuisine méditerranéenne, maghrébine ou orientale',
  'cuisine asiatique',
  'cuisine américaine, mexicaine ou d\'ailleurs',
]

/**
 * `nb` recettes pour un livre (consigne du livre prioritaire), pour toute la famille.
 * 3 lots à la fois, chacun avec sa piste de cuisine ; les lots suivants connaissent les plats déjà créés.
 */
export async function genererPourLivre({ livre, nb, portions = 4, filtres = [], style = '', nomsExistants = [] }, onProgress = null, onLot = null) {
  const items = Array.from({ length: nb }, () => ({ portions }))
  const crees = []
  const r = await genererEnLots(items, {
    construirePrompt: (lot, k) => buildPromptLivre({ livre, nb: lot.length, portions, filtres, style,
      piste: nb > TAILLE_LOT ? PISTES_LIVRE[k % PISTES_LIVRE.length] : '', nomsExistants: [...crees, ...nomsExistants] }),
    filtres,
  }, onProgress, async (lot) => {
    crees.push(...lot.map(x => x.recette.nom))
    await onLot?.(lot)
  })
  return r
}

// ── Photo d'une recette ──────────────────────────────────────────────
function promptImage(r) {
  const ingredients = (r.ingredients || []).slice(0, 8).map(i => i.nom).filter(Boolean).join(', ')
  return `Photographie culinaire réaliste et appétissante du plat « ${r.nom} »${r.cuisine ? ` (cuisine ${r.cuisine})` : ''}.
${r.description ? `${r.description}\n` : ''}${ingredients ? `Ingrédients visibles : ${ingredients}.\n` : ''}Plat servi dans une assiette familiale, vue légèrement en plongée, lumière naturelle douce, table en bois clair, faible profondeur de champ.
Aucun texte, aucune écriture, aucun logo, aucune personne, aucune boisson alcoolisée.`
}

/** Génère la photo d'une recette (stockée par l'Edge Function) ; renvoie son URL publique. Journalisée dans ia_usage. */
export async function genererImageRecette(recette) {
  let res
  try {
    res = await dbAppelFonctionIA({ action: 'image', prompt: promptImage(recette), recetteId: recette.id })
  } catch (e) {
    throw new ErreurIA(e.message?.includes('Session') ? 'SESSION' : 'RESEAU')
  }
  const corps = await res.json().catch(() => ({}))
  if (!res.ok || !corps.url) {
    const code = res.ok ? 'IMAGE_VIDE' : codeErreurHttp(res.status, corps)
    await journaliser({ action: 'image', nb_recettes: 1, statut: 'erreur', erreur: code })
    throw new ErreurIA(code, corps.detail)
  }
  const { entree, sortie, cout, estime } = coutImage(corps.usage)
  await journaliser({ action: 'image', nb_recettes: 1, tokens_entree: entree, tokens_sortie: sortie, cout, estime, statut: 'ok' })
  return corps.url
}

// Une seule recette pour un créneau (↻ quand la bibliothèque est épuisée, ou envie du soir)
export async function genererUneRecette({ creneau, ...options }) {
  const { resultats, rejets } = await genererPourCreneaux({ creneaux: [creneau], ...options })
  if (!resultats.length) throw rejets.length ? new ErreurIA('REFUSEE', rejets.join(', ')) : new ErreurIA('ILLISIBLE')
  return resultats[0].recette
}

// Plusieurs idées au choix pour un même créneau (⚡ Envie) ; rien n'est enregistré ici
export async function genererIdees({ creneau, nb = 3, ...options }) {
  const creneaux = Array.from({ length: nb }, () => creneau)
  const { resultats, rejets } = await genererPourCreneaux({ creneaux, ...options, variantes: nb > 1 })
  if (!resultats.length) throw rejets.length ? new ErreurIA('REFUSEE', rejets.join(', ')) : new ErreurIA('ILLISIBLE')
  return resultats.map(x => x.recette)
}

// Étapes d'une recette qui n'en a pas (anciennes recettes du planning) ; ne change ni le nom ni les ingrédients
export async function genererEtapes(recette) {
  const prompt = `Écris les étapes de préparation de cette recette familiale, pour ${recette.portions || 4} portion(s).
Recette : ${JSON.stringify({ nom: recette.nom, description: recette.description, ingredients: recette.ingredients,
    legumes_caches: recette.legumes_caches, temps_prep: recette.temps_prep, temps_cuisson: recette.temps_cuisson })}

RÈGLES :
- Utilise UNIQUEMENT les ingrédients listés (sel, poivre, huile et eau autorisés) ; halal strict : ni porc ni alcool
- Si "legumes_caches" est rempli, applique chaque astuce dans les étapes
- Étapes précises et complètes (températures, temps, ustensiles) : un débutant doit réussir sans autre aide
- 4 à 10 étapes, une action principale par étape

Réponds UNIQUEMENT avec du JSON valide (sans markdown) : { "etapes": ["string"] }`
  const reponse = await callIA(prompt, { action: 'etapes', nbRecettes: 1 })
  if (reponse.fin !== 'ok') throw new ErreurIA(reponse.fin)
  const etapes = parseJSON(reponse.texte)?.etapes
  if (!Array.isArray(etapes) || !etapes.length) throw new ErreurIA('ILLISIBLE')
  return etapes.map(e => String(e).trim()).filter(Boolean)
}

// Convertit d'anciennes recettes au nouveau format (description, composants, tags, conservation, légumes cachés)
export async function convertirRecettes(recettes) {
  const prefs = await preferencesTexte()
  const prompt = `Voici des recettes existantes. Pour chacune, complète les champs structurés SANS changer le nom ni les ingrédients.
Légumes à cacher pour la femme (propose une astuce si la recette en contient) : ${prefs.legumesACacher.join(', ') || '—'}
"tags" uniquement parmi : ${TAGS.join(', ')}.

Recettes :
${recettes.map(r => JSON.stringify({ id: r.id, nom: r.nom, ingredients: r.ingredients, etapes: (r.etapes || []).slice(0, 6) })).join('\n')}

Réponds UNIQUEMENT avec du JSON valide :
{ "recettes": [ { "id": "string", "description": "2 à 3 phrases", "cuisine": "string", "composants": { "base": "string ou null", "principal": "string", "proteine": "string ou null", "legumes": ["string"] }, "legumes_caches": [{ "legume": "string", "astuce": "string" }], "tags": ["string"], "conservation_jours": number } ] }`
  const reponse = await callIA(prompt, { action: 'conversion', nbRecettes: recettes.length })
  if (reponse.fin !== 'ok') throw new ErreurIA(reponse.fin)
  const data = parseJSON(reponse.texte)
  const parId = Object.fromEntries(recettes.map(r => [r.id, r]))
  return (data.recettes || []).filter(x => parId[x.id]).map(x => {
    const n = nettoyerRecette({ ...parId[x.id], ...x }, parId[x.id].portions || 4)
    return { ...parId[x.id], description: n.description, cuisine: n.cuisine, composants: n.composants,
             legumes_caches: n.legumes_caches, tags: n.tags, conservation_jours: n.conservation_jours }
  })
}
