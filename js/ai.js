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
    contraintes.vegetarien ? '- Végétarien : tous les plats sans viande ni poisson' : '',
    contraintes.rapide     ? '- Rapide : tous les plats < 30 min au total'          : '',
    contraintes.budget     ? '- Budget serré : ingrédients simples et économiques'  : '',
  ].filter(Boolean).join('\n') || '- Aucune contrainte particulière'

  return `Tu es un chef cuisinier expert en planification anti-gaspi. Génère un planning de repas pour 7 jours (midi + soir = 14 repas).

CONTRAINTES ABSOLUES (ne jamais violer) :
- Halal strict : ZÉRO porc, ZÉRO alcool, ni aucun dérivé
- ${pourQui === 'deux' ? 'Respecter les préférences des DEUX profils' : 'Respecter les préférences de Dylan uniquement'}

MÉTÉO — Vierzon, France :
- Saison : ${meteo.saison} · Température moyenne : ${meteo.avgTemp}°C (${meteo.description})
- Adapte les plats : légers et frais si > 22°C, chauds et réconfortants si < 10°C

PRÉFÉRENCES :
${profilsDylan}
${profilsFemme}

CONTRAINTES OPTIONNELLES :
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
${contraintes.vegetarien ? 'Végétarien uniquement.' : ''}
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

// ── Appel Claude API ─────────────────────────────────────────────────
async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CONFIG.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`)
  return (await res.json()).content[0].text
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
    contraintes.vegetarien              ? '- Végétarien : tous les plats sans viande ni poisson'                                                              : '',
    contraintes.rapide                  ? '- Rapide : tous les plats < 30 min au total'                                                                       : '',
    contraintes.budget                  ? '- Budget serré : ingrédients simples et économiques'                                                               : '',
    contraintes.sansViande > 0          ? `- Exactement ${contraintes.sansViande} repas sur ${n} SANS aucune viande (poisson et fruits de mer autorisés)`     : '',
    contraintes.sansPoisson > 0         ? `- Exactement ${contraintes.sansPoisson} repas sur ${n} SANS aucun poisson ni fruit de mer (viande autorisée)`      : '',
  ].filter(Boolean).join('\n') || '- Aucune contrainte particulière'

  const slotsLabel = slots.map(s => `${s.jour} ${s.moment}`).join(', ')
  const n = slots.length

  return `Tu es un chef cuisinier expert en planification anti-gaspi. Génère exactement ${n} repas pour les créneaux suivants : ${slotsLabel}.

CONTRAINTES ABSOLUES (ne jamais violer) :
- Halal strict : ZÉRO porc, ZÉRO alcool, ni aucun dérivé
- ${pourQui === 'deux' ? 'Respecter les préférences des DEUX profils' : 'Respecter les préférences de Dylan uniquement'}

MÉTÉO — Vierzon, France :
- Saison : ${meteo.saison} · Température moyenne : ${meteo.avgTemp}°C (${meteo.description})
- Adapte les plats : légers et frais si > 22°C, chauds et réconfortants si < 10°C

PRÉFÉRENCES :
${profilsDylan}
${profilsFemme}

CONTRAINTES OPTIONNELLES :
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

// ── API publique ─────────────────────────────────────────────────────
export async function genererSemaine({ pourQui, meteo, contraintes }) {
  return parseJSON(await callClaude(await buildPromptSemaine({ pourQui, meteo, contraintes })))
}

export async function genererCreneaux({ slots, pourQui, meteo, contraintes }) {
  return parseJSON(await callClaude(await buildPromptCreneaux({ slots, pourQui, meteo, contraintes })))
}

export async function genererDerniereMinute({ pourQui, ingredientsDispos = [], contraintes = {} }) {
  return parseJSON(await callClaude(await buildPromptDernierMinute({ pourQui, ingredientsDispos, contraintes })))
}
