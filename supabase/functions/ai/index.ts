// supabase/functions/ai/index.ts — Proxy IA (Mammouth AI), clé gardée côté serveur
// Secret requis : MAMMOUTH_API_KEY (SUPABASE_URL / SUPABASE_ANON_KEY sont fournis automatiquement)
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODELE    = 'claude-sonnet-5-5'
const MAX_TOKENS = 16000

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

  const { action, prompt } = await req.json().catch(() => ({}))

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
      texte ||= await amont.text().catch(() => '')
      console.error('Mammouth', amont.status, texte)
      // Le message de Mammouth aide à expliquer l'erreur (crédit épuisé, modèle inconnu…) ; jamais la clé
      let detail = texte
      try { const j = JSON.parse(texte); detail = j.error?.message || j.message || j.detail || texte } catch { /* texte brut */ }
      return json({ error: 'ERREUR_IA', amont: amont.status, detail: String(detail).slice(0, 300) }, amont.status)
    }
    // Relais du flux SSE tel quel vers le navigateur
    return new Response(amont.body, {
      headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  return json({ error: 'Action inconnue' }, 400)
})
