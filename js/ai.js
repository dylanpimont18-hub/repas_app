// js/ai.js — Génération IA (Mammouth AI via l'Edge Function Supabase "ai") + prompts
import { getProfil }           from './preferences.js'
import { getAllIngredients }   from './custom-ingredients.js'
import { dbAppelFonctionIA }   from './db.js'
import { validerVegetarien }   from './utils.js'
import { TAGS, consignesFiltres, contientInterdit, passeFiltres } from './filtres.js'
import { labelCreneau, dateCourte } from './cycle.js'

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

async function buildPrompt({ creneaux, filtres = [], style = '', ingredientsAReutiliser = [], nomsExistants = [], envie = false }) {
  const prefs = await preferencesTexte()
  const consignes = consignesFiltres(filtres)
  return `Tu es un chef cuisinier familial expert en anti-gaspi. Propose ${creneaux.length === 1 ? 'UNE recette' : `${creneaux.length} recettes différentes`} pour ces repas :
${creneaux.map(decrireCreneau).join('\n')}

CONTRAINTES ABSOLUES :
- Halal strict : ZÉRO porc, ZÉRO alcool (vin, bière, mirin, saké…), ni aucun dérivé (lardons, gélatine porcine…)
- Les ingrédients "N'aime PAS" du ou des profils concernés n'apparaissent JAMAIS
- Un légume de la liste "CACHÉS" peut être utilisé (c'est même souhaité) SEULEMENT s'il est rendu invisible ; décris alors l'astuce dans "legumes_caches"
- Les quantités des ingrédients correspondent au nombre de portions du créneau
- Une ENVIE indiquée sur un repas ne concerne QUE ce repas : les autres repas ne doivent pas en être
${consignes.length ? consignes.map(c => `- ${c}`).join('\n') : ''}
${style ? `- Style demandé (prioritaire) : "${style}"` : ''}
${envie ? '- C\'est une envie ponctuelle du moment : fais plaisir, un plat qui donne envie tout de suite' : ''}

PRÉFÉRENCES :
${prefs.texte}

SAISON : ${getSaison()} — privilégie les produits de saison.

ANTI-GASPI :
${ingredientsAReutiliser.length ? `- Ingrédients déjà achetés pour d'autres repas du cycle, à RÉUTILISER en priorité : ${ingredientsAReutiliser.join(', ')}` : ''}
- Entre les recettes proposées, partage un maximum d'ingrédients frais (légumes, protéines, herbes)
- Varie quand même les cuisines et les modes de cuisson

${nomsExistants.length ? `Recettes déjà dans la bibliothèque, à NE PAS reproposer : ${nomsExistants.slice(0, 120).join(', ')}` : ''}

"tags" : uniquement des valeurs parmi ${TAGS.join(', ')}.

Réponds UNIQUEMENT avec du JSON valide (sans markdown, sans backtick, sans explication) :
{ "repas": [ { "id": "c1", "recette": <recette> }, ... ] }

Chaque <recette> :
${FORMAT_RECETTE}`
}

// ── Appel IA (streaming SSE au format OpenAI, relayé par l'Edge Function) ──
async function callIA(prompt, onChunk = null) {
  let res
  try {
    res = await dbAppelFonctionIA({ action: 'chat', prompt })
  } catch (e) {
    throw new Error(e.message?.includes('Session') ? e.message : 'Pas de connexion internet ou serveur inaccessible.')
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    if (detail.error === 'CLE_MANQUANTE') throw new Error('Clé Mammouth AI pas encore configurée sur le serveur.')
    if (res.status === 401) throw new Error('Session expirée ou clé Mammouth invalide — reconnecte-toi ou vérifie la clé.')
    if (res.status === 403) throw new Error('Ce compte n\'est pas membre du foyer.')
    if (res.status === 429) throw new Error('Limite de requêtes atteinte — réessaie dans quelques minutes.')
    if (res.status >= 500) throw new Error('Serveur IA temporairement indisponible — réessaie dans quelques instants.')
    throw new Error(`Erreur IA ${res.status}.`)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', fullText = '', finishReason = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (!raw || raw === '[DONE]') continue
      try {
        const choice = JSON.parse(raw).choices?.[0]
        const delta  = choice?.delta?.content
        if (delta) {
          fullText += delta
          if (onChunk) onChunk(fullText)
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason
      } catch { /* ligne SSE invalide, ignorer */ }
    }
  }

  if (finishReason === 'length') throw new Error('Réponse IA tronquée — réessaie avec moins de créneaux.')
  return fullText
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Aucun JSON dans la réponse IA')
  try { return JSON.parse(match[0]) } catch { throw new Error('Réponse IA illisible — réessaie.') }
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

/**
 * Génère une recette par créneau.
 * @returns { resultats: [{ creneau, recette }], rejets: [noms] }
 */
export async function genererPourCreneaux({ creneaux, filtres = [], style = '', ingredientsAReutiliser = [], nomsExistants = [], envie = false }, onProgress = null) {
  if (!creneaux.length) return { resultats: [], rejets: [] }
  const total = creneaux.length
  const onChunk = onProgress
    ? text => onProgress(Math.max(0, (text.match(/"recette"\s*:/g) || []).length - 1), total)
    : null
  const prompt = await buildPrompt({ creneaux, filtres, style, ingredientsAReutiliser, nomsExistants, envie })
  const data = parseJSON(await callIA(prompt, onChunk))
  const lignes = (data.repas || []).map(x => {
    const i = parseInt(String(x.id || '').replace(/\D/g, ''), 10) - 1
    const creneau = creneaux[i]
    return creneau && x.recette ? { creneau, recette: nettoyerRecette(x.recette, creneau.portions) } : null
  }).filter(Boolean)
  const { ok, rejets } = verifier(lignes, filtres)
  return { resultats: ok, rejets }
}

// Une seule recette pour un créneau (↻ quand la bibliothèque est épuisée, ou envie du soir)
export async function genererUneRecette({ creneau, ...options }) {
  const { resultats, rejets } = await genererPourCreneaux({ creneaux: [creneau], ...options })
  if (!resultats.length) throw new Error(rejets.length ? `Recette refusée (contraintes non respectées) : ${rejets.join(', ')}. Réessaie.` : 'Aucune recette reçue — réessaie.')
  return resultats[0].recette
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
  const data = parseJSON(await callIA(prompt))
  const parId = Object.fromEntries(recettes.map(r => [r.id, r]))
  return (data.recettes || []).filter(x => parId[x.id]).map(x => {
    const n = nettoyerRecette({ ...parId[x.id], ...x }, parId[x.id].portions || 4)
    return { ...parId[x.id], description: n.description, cuisine: n.cuisine, composants: n.composants,
             legumes_caches: n.legumes_caches, tags: n.tags, conservation_jours: n.conservation_jours }
  })
}
