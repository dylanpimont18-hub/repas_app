// supabase/functions/ai/index.ts — Proxy IA (Mammouth AI), clé gardée côté serveur
// Secret requis : MAMMOUTH_API_KEY (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement)
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODELE    = 'claude-sonnet-5-5'
const MAX_TOKENS = 16000
const MODELE_IMAGE = 'gemini-3.1-flash-image-preview' // ≈ 0,004 $ l'image (tarif Mammouth)
const BUCKET_IMAGES = 'recettes-images'
const API = 'https://api.mammouth.ai/v1'

// Image en octets depuis une data URL, du base64 brut ou une URL distante
async function octetsImage(source: string): Promise<{ octets: Uint8Array, type: string } | null> {
  const data = source.match(/^data:(image\/[\w+.-]+);base64,(.+)$/s)
  if (data) return { octets: Uint8Array.from(atob(data[2]), c => c.charCodeAt(0)), type: data[1] }
  if (/^https?:\/\//.test(source)) {
    const r = await fetch(source).catch(() => null)
    if (!r?.ok) return null
    return { octets: new Uint8Array(await r.arrayBuffer()), type: r.headers.get('content-type') || 'image/png' }
  }
  if (/^[A-Za-z0-9+/=\s]{100,}$/.test(source)) return { octets: Uint8Array.from(atob(source.replace(/\s/g, '')), c => c.charCodeAt(0)), type: 'image/png' }
  return null
}

// Cherche une image dans une réponse chat (formats OpenRouter/LiteLLM : message.images, parties image_url, data URL dans le texte)
function imageDansChat(j: any): string | null {
  const msg = j?.choices?.[0]?.message
  if (!msg) return null
  const img = msg.images?.[0]
  if (img) return img.image_url?.url || img.url || img.b64_json || null
  if (Array.isArray(msg.content)) {
    const part = msg.content.find((p: any) => p.type === 'image_url' || p.type === 'output_image' || p.type === 'image')
    if (part) return part.image_url?.url || part.url || part.b64_json || part.data || null
  }
  return String(msg.content || '').match(/data:image\/[\w+.-]+;base64,[A-Za-z0-9+/=]+/)?.[0] || null
}

// Génère l'image : endpoint images d'abord, sinon chat avec sortie image (selon ce que Mammouth expose pour le modèle)
async function genererImage(cle: string, prompt: string) {
  const entetes = { 'Authorization': `Bearer ${cle}`, 'Content-Type': 'application/json' }
  let r = await fetch(`${API}/images/generations`, {
    method: 'POST', headers: entetes, body: JSON.stringify({ model: MODELE_IMAGE, prompt, n: 1 }),
  }).catch(() => null)
  if (r?.ok) {
    const j = await r.json()
    const d = j.data?.[0]
    const source = d?.b64_json || d?.url
    const img = source ? await octetsImage(source) : null
    if (img) return { img, usage: j.usage ?? null }
  } else if (r && ![400, 404, 405, 422].includes(r.status)) {
    return { erreur: r }
  }
  r = await fetch(`${API}/chat/completions`, {
    method: 'POST', headers: entetes,
    body: JSON.stringify({ model: MODELE_IMAGE, modalities: ['image', 'text'], messages: [{ role: 'user', content: prompt }] }),
  }).catch(() => null)
  if (!r) return { injoignable: true }
  if (!r.ok) return { erreur: r }
  const j = await r.json()
  const source = imageDansChat(j)
  const img = source ? await octetsImage(source) : null
  return img ? { img, usage: j.usage ?? null } : { vide: true }
}

// Erreur amont relayée avec le message de Mammouth (jamais la clé)
async function erreurAmont(amont: Response) {
  const texte = await amont.text().catch(() => '')
  console.error('Mammouth', amont.status, texte)
  let detail = texte
  try { const j = JSON.parse(texte); detail = j.error?.message || j.message || j.detail || texte } catch { /* texte brut */ }
  return json({ error: 'ERREUR_IA', amont: amont.status, detail: String(detail).slice(0, 300) }, amont.status)
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  // Seuls les membres du foyer connectés peuvent appeler la fonction
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Non connecté' }, 401)
  const { data: membre } = await supabase.rpc('est_membre_foyer')
  if (!membre) return json({ error: 'Pas membre du foyer' }, 403)

  const { action, prompt, recetteId } = await req.json().catch(() => ({}))

  if (action === 'image') {
    if (typeof prompt !== 'string' || !prompt || prompt.length > 3000) return json({ error: 'Prompt invalide' }, 400)
    if (typeof recetteId !== 'string' || !/^[\w-]{1,80}$/.test(recetteId)) return json({ error: 'Recette invalide' }, 400)
    const cle = Deno.env.get('MAMMOUTH_API_KEY')
    if (!cle) return json({ error: 'CLE_MANQUANTE' }, 503)

    const res = await genererImage(cle, prompt)
    if ('injoignable' in res) return json({ error: 'MAMMOUTH_INJOIGNABLE' }, 502)
    if ('erreur' in res) return erreurAmont(res.erreur!)
    if ('vide' in res || !res.img) return json({ error: 'IMAGE_VIDE' }, 502)

    // Enregistrement (clé de service : l'appelant est déjà vérifié membre du foyer)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const ext = res.img.type.includes('jpeg') ? 'jpg' : res.img.type.includes('webp') ? 'webp' : 'png'
    const chemin = `${recetteId}.${ext}`
    const { error } = await admin.storage.from(BUCKET_IMAGES).upload(chemin, res.img.octets, { contentType: res.img.type, upsert: true })
    if (error) { console.error('Stockage', error.message); return json({ error: 'STOCKAGE', detail: error.message }, 500) }
    const { data: { publicUrl } } = admin.storage.from(BUCKET_IMAGES).getPublicUrl(chemin)
    return json({ url: `${publicUrl}?v=${Date.now()}`, usage: res.usage, modele: MODELE_IMAGE })
  }

  if (action === 'chat') {
    if (typeof prompt !== 'string' || !prompt || prompt.length > 50000) return json({ error: 'Prompt invalide' }, 400)
    const cle = Deno.env.get('MAMMOUTH_API_KEY')
    if (!cle) return json({ error: 'CLE_MANQUANTE' }, 503)

    const appeler = (avecDecompte: boolean) => fetch('https://api.mammouth.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: MAX_TOKENS,
        stream: true,
        // décompte des tokens en fin de flux (suivi du crédit)
        ...(avecDecompte ? { stream_options: { include_usage: true } } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
    }).catch(() => null)

    let amont = await appeler(true)
    let texte = ''
    if (amont && amont.status === 400) {
      texte = await amont.text().catch(() => '')
      // Paramètre refusé : on relance sans décompte (le coût sera estimé côté navigateur)
      if (/stream_options|include_usage/i.test(texte)) { amont = await appeler(false); texte = '' }
    }
    if (!amont) return json({ error: 'MAMMOUTH_INJOIGNABLE' }, 502)
    if (!amont.ok) {
      if (texte) { // corps déjà lu (400 examiné plus haut)
        console.error('Mammouth', amont.status, texte)
        let detail = texte
        try { const j = JSON.parse(texte); detail = j.error?.message || j.message || j.detail || texte } catch { /* texte brut */ }
        return json({ error: 'ERREUR_IA', amont: amont.status, detail: String(detail).slice(0, 300) }, amont.status)
      }
      return erreurAmont(amont)
    }
    // Relais du flux SSE tel quel vers le navigateur
    return new Response(amont.body, {
      headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  return json({ error: 'Action inconnue' }, 400)
})
