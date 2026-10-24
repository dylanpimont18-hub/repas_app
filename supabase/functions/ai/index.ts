// supabase/functions/ai/index.ts — Proxy IA (Mammouth AI) + météo, clés gardées côté serveur
// Secrets requis : MAMMOUTH_API_KEY, OPENWEATHER_API_KEY (SUPABASE_URL / SUPABASE_ANON_KEY sont fournis automatiquement)
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODELE    = 'claude-sonnet-5-5'
const MAX_TOKENS = 16000
const VIERZON   = { lat: 47.22, lon: 2.07 }

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

  if (action === 'meteo') {
    const cle = Deno.env.get('OPENWEATHER_API_KEY')
    if (!cle) return json({ error: 'CLE_METEO_MANQUANTE' }, 503)
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${VIERZON.lat}&lon=${VIERZON.lon}&appid=${cle}&units=metric&lang=fr`
    const res = await fetch(url)
    return json(await res.json(), res.status)
  }

  if (action === 'chat') {
    if (typeof prompt !== 'string' || !prompt || prompt.length > 50000) return json({ error: 'Prompt invalide' }, 400)
    const cle = Deno.env.get('MAMMOUTH_API_KEY')
    if (!cle) return json({ error: 'CLE_MANQUANTE' }, 503)

    const amont = await fetch('https://api.mammouth.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: MAX_TOKENS,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!amont.ok) {
      console.error('Mammouth', amont.status, await amont.text().catch(() => ''))
      return json({ error: 'ERREUR_IA' }, amont.status)
    }
    // Relais du flux SSE tel quel vers le navigateur
    return new Response(amont.body, {
      headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  return json({ error: 'Action inconnue' }, 400)
})
