// js/ai.js — Génération IA (Mammouth AI via l'Edge Function Supabase "ai") + météo + prompts
import { getProfil }           from './preferences.js'
import { getAllIngredients }   from './custom-ingredients.js'
import { dbAppelFonctionIA }   from './db.js'
import { validerVegetarien }   from './utils.js'

// ── Météo (clé OpenWeatherMap côté serveur) ──────────────────────────
export async function getMeteo() {
  try {
    const res  = await dbAppelFonctionIA({ action: 'meteo' })
    const data = await res.json()
    if (!res.ok || data.cod !== '200') throw new Error(data.error || data.message)
    const temps = data.list.slice(0, 40).map(i => i.main.temp)
    const avg   = Math.round(temps.reduce((a, b) => a + b, 0) / temps.length)
    return { avgTemp: avg, description: data.list[0]?.weather[0]?.description || '', saison: getSaison() }
  } catch (e) {
    console.warn('Météo indisponible, valeurs par défaut', e)
    return { avgTemp: 15, description: 'inconnu', saison: getSaison() }
  }
}

export function getSaison() {
  const m = new Date().getMonth() + 1
  if (m >= 3 && m <= 5)  return 'printemps'
  if (m >= 6 && m <= 8)  return 'été'
  if (m >= 9 && m <= 11) return 'automne'
  return 'hiver'
}

// ── Prompt helpers ───────────────────────────────────────────────────
async function buildProfilTexte(qui) {
  const [profil, ingredients] = await Promise.all([getProfil(qui), getAllIngredients()])
  const noms = Object.fromEntries(ingredients.map(i => [i.id, i.nom]))
  const parNiveau = niveau => Object.entries(profil)
    .filter(([, v]) => v === niveau).map(([id]) => noms[id]).filter(Boolean)
  const adore = parNiveau('j_adore'), aime = parNiveau('j_aime'), naime = parNiveau('j_aime_pas')
  return [
    `Profil ${qui === 'dylan' ? 'Dylan' : 'Sa femme'} :`,
    adore.length ? `  - Adore : ${adore.join(', ')}` : '',
    aime.length  ? `  - Aime bien : ${aime.join(', ')}` : '',
    naime.length ? `  - N'aime PAS (exclure absolument) : ${naime.join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

async function buildProfils(pourQui) {
  const [dylan, femme] = await Promise.all([
    buildProfilTexte('dylan'),
    pourQui === 'deux' ? buildProfilTexte('femme') : '',
  ])
  return `${dylan}\n${femme}`
}

const FORMAT_RECETTE = `{
  "nom": "string",
  "vegetarien": boolean,
  "temps_prep": number,
  "temps_cuisson": number,
  "portions": number,
  "ingredients": [{ "nom": "string", "quantite": "string" }],
  "etapes": ["string"],
  "nutrition": { "calories": number, "proteines": number, "glucides": number, "lipides": number }
}`

async function buildPromptDernierMinute({ pourQui, ingredientsDispos, contraintes }) {
  const dispos = ingredientsDispos.length
    ? `Ingrédients déjà achetés cette semaine (à privilégier) : ${ingredientsDispos.join(', ')}`
    : ''

  return `Génère UNE seule recette rapide (≤ 30 min) en halal strict (zéro porc, zéro alcool).
${pourQui === 'deux' ? 'Pour 2 personnes.' : 'Pour 1 personne.'}
${dispos}
${contraintes.vegetarien ? 'VÉGÉTARIEN STRICT ET ABSOLU : aucune viande (poulet, bœuf, agneau, dinde, etc.), aucun poisson, aucun fruit de mer. Uniquement légumes, légumineuses, céréales, œufs, produits laitiers. Le champ "vegetarien" doit être true.' : ''}
${contraintes.consignes  ? `Instructions personnalisées (priorité absolue, respecter impérativement) : "${contraintes.consignes}"` : ''}
${await buildProfils(pourQui)}

Réponds UNIQUEMENT avec du JSON valide :
${FORMAT_RECETTE}`
}

async function buildPromptCreneaux({ slots, pourQui, meteo, contraintes }) {
  const n = slots.length
  const deuxSemaines = slots.some(s => s.semaine === 2)

  const opts = [
    contraintes.vegetarien  ? `- VÉGÉTARIEN STRICT : AUCUNE viande (poulet, bœuf, agneau, dinde, etc.), AUCUN poisson, AUCUN fruit de mer dans aucun des ${n} repas. Uniquement : légumes, légumineuses, céréales, œufs, produits laitiers. Le champ "vegetarien" de chaque recette doit être true.` : '',
    contraintes.rapide      ? '- Rapide : tous les plats < 30 min au total' : '',
    contraintes.budget      ? '- Budget serré : ingrédients simples et économiques' : '',
    contraintes.sansViande  ? '- SANS VIANDE : aucune viande dans aucun repas (poisson et fruits de mer autorisés)' : '',
    contraintes.sansPoisson ? '- SANS POISSON : aucun poisson ni fruit de mer dans aucun repas (viande autorisée)' : '',
    contraintes.consignes   ? `- Consignes personnalisées (priorité haute, respecter impérativement) :\n  "${contraintes.consignes}"` : '',
  ].filter(Boolean).join('\n') || '- Aucune contrainte particulière'

  // Format créneaux : 1 semaine ou 2 semaines
  let slotsSection
  if (deuxSemaines) {
    const s1 = slots.filter(s => s.semaine === 1).map(s => `${s.jour} ${s.moment}`).join(', ')
    const s2 = slots.filter(s => s.semaine === 2).map(s => `${s.jour} ${s.moment}`).join(', ')
    slotsSection = `répartis sur 2 semaines consécutives :\nSEMAINE 1 : ${s1}\nSEMAINE 2 : ${s2}`
  } else {
    slotsSection = `pour les créneaux : ${slots.map(s => `${s.jour} ${s.moment}`).join(', ')}`
  }

  const panierTaille = deuxSemaines ? '14 à 22' : '6 à 14'

  return `Tu es un chef cuisinier expert en planification anti-gaspi. Génère exactement ${n} repas ${slotsSection}.

CONTRAINTES ABSOLUES (ne jamais violer — même niveau d'importance) :
- Halal strict : ZÉRO porc, ZÉRO alcool, ni aucun dérivé
- ${pourQui === 'deux' ? 'Respecter les préférences des DEUX profils' : 'Respecter les préférences de Dylan uniquement'}
${contraintes.vegetarien ? `- VÉGÉTARIEN ABSOLU : aucune viande ni poisson dans aucun des ${n} repas, sans exception` : ''}
${contraintes.sansViande ? `- SANS VIANDE ABSOLU : aucune viande dans aucun des ${n} repas, sans exception` : ''}
${contraintes.sansPoisson ? `- SANS POISSON ABSOLU : aucun poisson ni fruit de mer dans aucun des ${n} repas, sans exception` : ''}

MÉTÉO — Vierzon, France :
- Saison : ${meteo.saison} · Température moyenne : ${meteo.avgTemp}°C (${meteo.description})
- Adapte les plats : légers et frais si > 22°C, chauds et réconfortants si < 10°C

PRÉFÉRENCES :
${await buildProfils(pourQui)}

CONTRAINTES UTILISATEUR SÉLECTIONNÉES (toutes absolues) :
${opts}
${deuxSemaines ? `
RÈGLE DE VARIÉTÉ INTER-SEMAINES (obligatoire) :
- Aucun plat identique ou très similaire entre la semaine 1 et la semaine 2
- Aucune protéine principale (ex : poulet, saumon, lentilles…) répétée plus de 2 fois sur les ${n} repas au total
- Varier les cuisines et origines : française, marocaine, asiatique, méditerranéenne, etc.
- Varier les modes de cuisson : mijoté, sauté, grillé, four, vapeur, cru
` : ''}
STRATÉGIE ANTI-GASPI (obligatoire) :
Étape 1 — Choisis d'abord un PANIER de ${panierTaille} ingrédients frais/protéines adaptés au nombre de repas.
Étape 2 — Construis les ${n} repas UNIQUEMENT à partir de ce panier :
  - Chaque ingrédient frais apparaît dans AU MOINS 2 repas différents
  - Zéro ingrédient acheté pour un seul plat (sauf ingrédients de base)
  - Modes de cuisson et saveurs variés pour éviter la répétition

Réponds UNIQUEMENT avec du JSON valide (sans markdown, sans backtick, sans explication) :
{
  "panier": ["string", ...],
  "repas": [
    { ${deuxSemaines ? '"semaine": 1, ' : ''}"jour": "lundi", "moment": "midi", "recette": <recette> },
    ...
  ]
}

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

function verifierContraintes(recettes, contraintes) {
  if (!contraintes.vegetarien) return
  const violations = recettes.filter(r => !validerVegetarien(r)).map(r => r.nom)
  if (violations.length > 0) {
    throw new Error(`L'IA a ignoré la contrainte végétarienne dans : ${violations.join(', ')}. Réessaie.`)
  }
}

// ── API publique ─────────────────────────────────────────────────────
export async function genererCreneaux({ slots, pourQui, meteo, contraintes }, onProgress = null) {
  const total  = slots.length
  // Compte les recettes déjà reçues (et non les "nom" des ingrédients)
  const onChunk = onProgress
    ? text => onProgress(Math.max(0, (text.match(/"recette"\s*:/g) || []).length - 1), total)
    : null
  const data = parseJSON(await callIA(await buildPromptCreneaux({ slots, pourQui, meteo, contraintes }), onChunk))
  verifierContraintes((data.repas || []).map(r => r.recette).filter(Boolean), contraintes)
  return data
}

export async function genererDerniereMinute({ pourQui, ingredientsDispos = [], contraintes = {} }) {
  const recette = parseJSON(await callIA(await buildPromptDernierMinute({ pourQui, ingredientsDispos, contraintes })))
  verifierContraintes([recette], contraintes)
  return recette
}
