// js/ai.js
import { getProfilFiltre } from './preferences.js'
import { getById }         from './data/ingredients.js'

const VIERZON = { lat: 47.22, lon: 2.07 }

// ── Météo ────────────────────────────────────────────────────────────
export async function getMeteo() {
  try {
    const url  = `https://api.openweathermap.org/data/2.5/forecast?lat=${VIERZON.lat}&lon=${VIERZON.lon}&appid=${CONFIG.OPENWEATHER_API_KEY}&units=metric&lang=fr`
    const res  = await fetch(url)
    const data = await res.json()
    if (data.cod !== '200') throw new Error(data.message)
    const temps = data.list.slice(0, 40).map(i => i.main.temp)
    const avg   = Math.round(temps.reduce((a, b) => a + b, 0) / temps.length)
    return { avgTemp: avg, description: data.list[0]?.weather[0]?.description || '', saison: getSaison() }
  } catch (e) {
    console.warn('Météo indisponible, valeurs par défaut', e)
    return { avgTemp: 20, description: 'inconnu', saison: getSaison() }
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
  const adore = (await getProfilFiltre(qui, 'j_adore')).map(id => getById(id)?.nom).filter(Boolean)
  const aime  = (await getProfilFiltre(qui, 'j_aime')).map(id => getById(id)?.nom).filter(Boolean)
  const naime = (await getProfilFiltre(qui, 'j_aime_pas')).map(id => getById(id)?.nom).filter(Boolean)
  return [
    `Profil ${qui === 'dylan' ? 'Dylan' : 'Sa femme'} :`,
    adore.length ? `  - Adore : ${adore.join(', ')}` : '',
    aime.length  ? `  - Aime bien : ${aime.join(', ')}` : '',
    naime.length ? `  - N'aime PAS (exclure absolument) : ${naime.join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

async function buildPromptSemaine({ pourQui, meteo, contraintes }) {
  const profilsDylan = await buildProfilTexte('dylan')
  const profilsFemme = pourQui === 'deux' ? await buildProfilTexte('femme') : ''
  const opts = [
    contraintes.vegetarien ? '- VÉGÉTARIEN STRICT : AUCUNE viande (poulet, bœuf, agneau, dinde, etc.), AUCUN poisson, AUCUN fruit de mer dans aucun des 14 repas. Uniquement : légumes, légumineuses, céréales, œufs, produits laitiers. Le champ "vegetarien" de chaque recette doit être true.' : '',
    contraintes.rapide     ? '- Rapide : tous les plats < 30 min au total'          : '',
    contraintes.budget     ? '- Budget serré : ingrédients simples et économiques'  : '',
  ].filter(Boolean).join('\n') || '- Aucune contrainte particulière'

  return `Tu es un chef cuisinier expert en planification anti-gaspi. Génère un planning de repas pour 7 jours (midi + soir = 14 repas).

CONTRAINTES ABSOLUES (ne jamais violer — même niveau d'importance) :
- Halal strict : ZÉRO porc, ZÉRO alcool, ni aucun dérivé
- ${pourQui === 'deux' ? 'Respecter les préférences des DEUX profils' : 'Respecter les préférences de Dylan uniquement'}
${contraintes.vegetarien ? '- VÉGÉTARIEN ABSOLU : aucune viande ni poisson dans aucun des 14 repas, sans exception' : ''}

MÉTÉO — Vierzon, France :
- Saison : ${meteo.saison} · Température moyenne : ${meteo.avgTemp}°C (${meteo.description})
- Adapte les plats : légers et frais si > 22°C, chauds et réconfortants si < 10°C

PRÉFÉRENCES :
${profilsDylan}
${profilsFemme}

CONTRAINTES UTILISATEUR SÉLECTIONNÉES (toutes absolues) :
${opts}

STRATÉGIE ANTI-GASPI (obligatoire — c'est la priorité de planification) :
Étape 1 — Choisis d'abord un PANIER DE LA SEMAINE de 18 à 22 ingrédients frais/protéines.
Étape 2 — Construis les 14 repas UNIQUEMENT à partir de ce panier, de façon que :
  - Chaque ingrédient frais (légume, viande, poisson) apparaisse dans AU MOINS 2 repas différents
  - Les ingrédients achetés en grande quantité (ex : une botte de carottes, un sachet de lentilles) soient intégralement utilisés sur la semaine
  - Zéro ingrédient acheté pour un seul plat
  - Les féculents, épices et condiments peuvent être partagés librement entre les jours
Varie les modes de cuisson et les saveurs pour que les mêmes ingrédients ne donnent pas des plats répétitifs.

Réponds UNIQUEMENT avec du JSON valide (sans markdown, sans backtick, sans explication) :
{
  "panier": ["string", ...],
  "semaine": {
    "lundi":    { "midi": <recette>, "soir": <recette> },
    "mardi":    { "midi": <recette>, "soir": <recette> },
    "mercredi": { "midi": <recette>, "soir": <recette> },
    "jeudi":    { "midi": <recette>, "soir": <recette> },
    "vendredi": { "midi": <recette>, "soir": <recette> },
    "samedi":   { "midi": <recette>, "soir": <recette> },
    "dimanche": { "midi": <recette>, "soir": <recette> }
  }
}

Chaque <recette> :
{
  "nom": "string",
  "vegetarien": boolean,
  "temps_prep": number,
  "temps_cuisson": number,
  "portions": number,
  "ingredients": [{ "nom": "string", "quantite": "string" }],
  "etapes": ["string"],
  "nutrition": { "calories": number, "proteines": number, "glucides": number, "lipides": number }
}`
}

async function buildPromptDernierMinute({ pourQui, ingredientsDispos, contraintes }) {
  const profilsDylan = await buildProfilTexte('dylan')
  const profilsFemme = pourQui === 'deux' ? await buildProfilTexte('femme') : ''
  const dispos = ingredientsDispos.length
    ? `Ingrédients déjà achetés cette semaine (à privilégier) : ${ingredientsDispos.join(', ')}`
    : ''

  return `Génère UNE seule recette rapide (≤ 30 min) en halal strict (zéro porc, zéro alcool).
${pourQui === 'deux' ? 'Pour 2 personnes.' : 'Pour 1 personne.'}
${dispos}
${contraintes.vegetarien ? 'VÉGÉTARIEN STRICT ET ABSOLU : aucune viande (poulet, bœuf, agneau, dinde, etc.), aucun poisson, aucun fruit de mer. Uniquement légumes, légumineuses, céréales, œufs, produits laitiers. Le champ "vegetarien" doit être true.' : ''}
${contraintes.consignes  ? `Instructions personnalisées (priorité absolue, respecter impérativement) : "${contraintes.consignes}"` : ''}
${profilsDylan}
${profilsFemme}

Réponds UNIQUEMENT avec du JSON valide :
{
  "nom": "string",
  "vegetarien": boolean,
  "temps_prep": number,
  "temps_cuisson": number,
  "portions": number,
  "ingredients": [{ "nom": "string", "quantite": "string" }],
  "etapes": ["string"],
  "nutrition": { "calories": number, "proteines": number, "glucides": number, "lipides": number }
}`
}

// ── Clé API (config.js ou localStorage) ─────────────────────────────
export function getApiKey() {
  const fromConfig = typeof CONFIG !== 'undefined' ? CONFIG.CLAUDE_API_KEY : null
  if (fromConfig && fromConfig.startsWith('sk-ant') && !fromConfig.includes('ta-clé')) return fromConfig
  const stored = localStorage.getItem('repas_claude_key')
  if (stored && stored.startsWith('sk-ant')) return stored
  return null
}

export function saveApiKey(key) {
  localStorage.setItem('repas_claude_key', key.trim())
}

// ── Appel Claude API (streaming) ─────────────────────────────────────
async function callClaude(prompt, onChunk = null) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('CLE_MANQUANTE')

  let res
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    throw new Error('Pas de connexion internet ou serveur inaccessible.')
  }

  if (!res.ok) {
    await res.text().catch(() => '')
    if (res.status === 401) throw new Error('Clé API invalide ou expirée. Mets-la à jour dans ⚙️ Paramètres.')
    if (res.status === 429) throw new Error('Limite de requêtes atteinte — réessaie dans quelques minutes.')
    if (res.status === 529 || res.status === 500) throw new Error('Serveur Claude temporairement indisponible — réessaie dans quelques instants.')
    throw new Error(`Erreur Claude ${res.status}.`)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', fullText = '', stopReason = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6)
      if (raw === '[DONE]') continue
      try {
        const evt = JSON.parse(raw)
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          fullText += evt.delta.text
          if (onChunk) onChunk(fullText)
        }
        if (evt.type === 'message_delta') stopReason = evt.delta?.stop_reason
      } catch { /* ligne SSE invalide, ignorer */ }
    }
  }

  if (stopReason === 'max_tokens') throw new Error('Réponse IA tronquée — réessaie avec moins de créneaux.')
  return fullText
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Aucun JSON dans la réponse IA')
  return JSON.parse(match[0])
}

async function buildPromptCreneaux({ slots, pourQui, meteo, contraintes }) {
  const profilsDylan = await buildProfilTexte('dylan')
  const profilsFemme = pourQui === 'deux' ? await buildProfilTexte('femme') : ''
  const n = slots.length
  const opts = [
    contraintes.vegetarien              ? `- VÉGÉTARIEN STRICT : AUCUNE viande (poulet, bœuf, agneau, dinde, etc.), AUCUN poisson, AUCUN fruit de mer dans aucun des ${n} repas. Uniquement : légumes, légumineuses, céréales, œufs, produits laitiers. Le champ "vegetarien" de chaque recette doit être true.` : '',
    contraintes.rapide                  ? '- Rapide : tous les plats < 30 min au total'                                                                       : '',
    contraintes.budget                  ? '- Budget serré : ingrédients simples et économiques'                                                               : '',
    contraintes.sansViande              ? '- SANS VIANDE : aucune viande dans aucun repas (poisson et fruits de mer autorisés)'  : '',
    contraintes.sansPoisson             ? '- SANS POISSON : aucun poisson ni fruit de mer dans aucun repas (viande autorisée)'    : '',
    contraintes.consignes               ? `- Consignes personnalisées (priorité haute, respecter impérativement) :\n  "${contraintes.consignes}"`             : '',
  ].filter(Boolean).join('\n') || '- Aucune contrainte particulière'

  const slotsLabel = slots.map(s => `${s.jour} ${s.moment}`).join(', ')

  return `Tu es un chef cuisinier expert en planification anti-gaspi. Génère exactement ${n} repas pour les créneaux suivants : ${slotsLabel}.

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
${profilsDylan}
${profilsFemme}

CONTRAINTES UTILISATEUR SÉLECTIONNÉES (toutes absolues) :
${opts}

STRATÉGIE ANTI-GASPI (obligatoire) :
Étape 1 — Choisis d'abord un PANIER de 6 à 14 ingrédients frais/protéines adaptés au nombre de repas.
Étape 2 — Construis les ${n} repas UNIQUEMENT à partir de ce panier, de façon que :
  - Chaque ingrédient frais apparaisse dans AU MOINS 2 repas différents si possible
  - Zéro ingrédient acheté pour un seul plat (sauf ingrédients de base)
  - Varie les modes de cuisson et les saveurs pour éviter la répétition

Réponds UNIQUEMENT avec du JSON valide (sans markdown, sans backtick, sans explication) :
{
  "panier": ["string", ...],
  "repas": [
    { "jour": "lundi", "moment": "midi", "recette": <recette> },
    ...
  ]
}

Chaque <recette> :
{
  "nom": "string",
  "vegetarien": boolean,
  "temps_prep": number,
  "temps_cuisson": number,
  "portions": number,
  "ingredients": [{ "nom": "string", "quantite": "string" }],
  "etapes": ["string"],
  "nutrition": { "calories": number, "proteines": number, "glucides": number, "lipides": number }
}`
}

// ── Validation post-génération ───────────────────────────────────────
const MOTS_VIANDE_POISSON = [
  'poulet','dinde','bœuf','boeuf','agneau','veau','porc','canard','lapin','mouton',
  'saumon','thon','cabillaud','merlan','tilapia','sardine','maquereau','crevette',
  'moule','homard','crabe','calmar','seiche','dorade','bar','sole','truite','lieu',
  'lardons','jambon','saucisse','merguez','chipolata','steak','escalope','filet de',
  'blanc de poulet','cuisse','aile','côte','entrecôte','rôti',
]

function validerVegetarien(recette) {
  if (recette.vegetarien === false) return false
  const texte = [
    recette.nom,
    ...(recette.ingredients || []).map(i => `${i.nom} ${i.quantite}`),
    ...(recette.etapes || []),
  ].join(' ').toLowerCase()
  return !MOTS_VIANDE_POISSON.some(mot => texte.includes(mot))
}

function verifierContraintes(recettes, contraintes) {
  if (!contraintes.vegetarien) return
  const violations = recettes.filter(r => !validerVegetarien(r)).map(r => r.nom)
  if (violations.length > 0) {
    throw new Error(`L'IA a ignoré la contrainte végétarienne dans : ${violations.join(', ')}. Réessaie.`)
  }
}

// ── API publique ─────────────────────────────────────────────────────
export async function genererSemaine({ pourQui, meteo, contraintes }) {
  const data = parseJSON(await callClaude(await buildPromptSemaine({ pourQui, meteo, contraintes })))
  const toutesRecettes = Object.values(data.semaine || {}).flatMap(j => Object.values(j))
  verifierContraintes(toutesRecettes, contraintes)
  return data
}

export async function genererCreneaux({ slots, pourQui, meteo, contraintes }, onProgress = null) {
  const total  = slots.length
  const onChunk = onProgress
    ? text => onProgress((text.match(/"nom":\s*"/g) || []).length, total)
    : null
  const data = parseJSON(await callClaude(await buildPromptCreneaux({ slots, pourQui, meteo, contraintes }), onChunk))
  verifierContraintes((data.repas || []).map(r => r.recette), contraintes)
  return data
}

export async function genererDerniereMinute({ pourQui, ingredientsDispos = [], contraintes = {} }) {
  const recette = parseJSON(await callClaude(await buildPromptDernierMinute({ pourQui, ingredientsDispos, contraintes })))
  verifierContraintes([recette], contraintes)
  return recette
}
