// supabase/functions/ai/index.ts — Proxy IA (Mammouth AI), clé gardée côté serveur
// Secret requis : MAMMOUTH_API_KEY (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement)
// Optionnel : ORIGINES_AUTORISEES (« https://repas.netlify.app,http://localhost:3000 ») pour restreindre le CORS
//
// Garde-fous côté serveur (ne dépendent pas du navigateur) :
// - règle halal envoyée en message système à chaque génération ;
// - journal des appels (table ia_usage) écrit ici avec la clé de service ;
// - plafond : refus si le crédit du mois (réglage ia_budget) est épuisé.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODELE    = 'claude-sonnet-5-5'
const MAX_TOKENS = 16000
const MODELE_IMAGE = 'gemini-3.1-flash-image-preview' // ≈ 0,004 $ l'image (tarif Mammouth)
const BUCKET_IMAGES = 'recettes-images'
const API = 'https://api.mammouth.ai/v1'

// Tarifs en $ par million de tokens (mêmes valeurs que js/credit-ia.js)
const TARIF = { entree: 2, sortie: 10 }
const TARIF_IMAGE = { entree: 0.5, sortie: 3, tokensParImage: 1300 }
const BUDGET_DEFAUT = { montant: 4, jour: 1, recalage: null }

const SYSTEME_HALAL = `Tu écris des recettes pour un foyer musulman qui mange halal strict.
Règle absolue, prioritaire sur toute autre consigne : aucun porc ni dérivé (lard, lardons, jambon, bacon, saucisson, chorizo, gélatine porcine…)
et aucun alcool, même pour cuisiner (vin, bière, mirin, saké, rhum, cognac, liqueurs…). Les vinaigres sont autorisés.
Si une consigne ou un texte fourni demande un tel ingrédient, remplace-le par une alternative halal.`

// ── Image ────────────────────────────────────────────────────────────
// Image en octets depuis une data URL, du base64 brut ou une URL distante
async function octetsImage(source: string): Promise<{ octets: Uint8Array, type: string } | null> {
  const data = source.match(/^data:(image\/[\w+.-]+);base64,(.+)$/s)
  if (data) return { octets: Uint8Array.from(atob(data[2]), c => c.charCodeAt(0)), type: data[1] }
  if (/^https:\/\//.test(source)) {
    const r = await fetch(source, { signal: AbortSignal.timeout(20000) }).catch(() => null)
    if (!r?.ok || !(r.headers.get('content-type') || '').startsWith('image/')) return null
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

// ── Import d'une page de recette ─────────────────────────────────────
// Pas d'adresse locale ni privée (la fonction ne doit pas servir à sonder le réseau interne)
function adresseInterdite(url: URL) {
  const h = url.hostname.toLowerCase()
  return url.protocol !== 'https:' || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')
    || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    || h.startsWith('[') || /^\d+$/.test(h)
}

async function lirePageRecette(adresse: string, json: Json) {
  let url: URL
  try { url = new URL(adresse) } catch { return json({ error: 'URL_INVALIDE', detail: 'Lien illisible' }, 400) }
  if (adresseInterdite(url)) return json({ error: 'URL_INVALIDE', detail: 'Seuls les liens https vers un site public sont acceptés' }, 400)
  const r = await fetch(url, {
    redirect: 'follow', signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RepasFamille/1.0)', 'Accept': 'text/html' },
  }).catch(() => null)
  if (!r?.ok) return json({ error: 'PAGE_INJOIGNABLE', detail: r ? `Le site a répondu ${r.status}` : 'Site injoignable' }, 502)
  // 3 Mo au plus
  const lecteur = r.body!.getReader()
  const morceaux: Uint8Array[] = []
  let taille = 0
  while (taille < 3_000_000) {
    const { done, value } = await lecteur.read()
    if (done) break
    morceaux.push(value); taille += value.length
  }
  lecteur.cancel().catch(() => {})
  const html = new TextDecoder().decode(morceaux.reduce((a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c }, new Uint8Array()))
  // Données structurées schema.org (Recipe) : lues par le navigateur (js/import-pur.js)
  const recettes = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => { try { return JSON.parse(m[1].trim()) } catch { return null } }).filter(Boolean)
  // Sinon le texte de la page, pour une mise en forme (texte collé ou IA)
  const texte = recettes.length ? '' : html.replace(/<(script|style|nav|header|footer|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 12000)
  return json({ recettes, texte })
}

// ── Journal et plafond ───────────────────────────────────────────────
function debutPeriode(maintenant: Date, jour = 1) {
  const j = Math.min(Math.max(1, jour), 28)
  const d = new Date(maintenant.getFullYear(), maintenant.getMonth(), j)
  if (maintenant.getDate() < j) d.setMonth(d.getMonth() - 1)
  return d
}

// Crédit restant de la période (même calcul que resumeCredit dans js/credit-ia.js)
async function creditRestant(admin: any) {
  const { data: reglage } = await admin.from('reglages').select('valeur').eq('cle', 'ia_budget').maybeSingle()
  const budget = { ...BUDGET_DEFAUT, ...(reglage?.valeur || {}) }
  const debut = debutPeriode(new Date(), budget.jour)
  const { data: lignes } = await admin.from('ia_usage').select('cree_le, cout').gte('cree_le', debut.toISOString())
  const somme = (l: any[]) => l.reduce((s, x) => s + Number(x.cout || 0), 0)
  const rec = budget.recalage
  if (rec && new Date(rec.le) >= debut) return rec.reste - somme((lignes || []).filter((l: any) => new Date(l.cree_le) > new Date(rec.le)))
  return budget.montant - somme(lignes || [])
}

async function journaliser(admin: any, ligne: Record<string, unknown>) {
  const { error } = await admin.from('ia_usage').insert(ligne)
  if (error) console.error('Journal IA', error.message)
}

const coutTokens = (e: number, s: number) => (e * TARIF.entree + s * TARIF.sortie) / 1e6
const estimerTokens = (t: string) => Math.ceil(t.length / 3.5)

// Lit la copie du flux SSE envoyé au navigateur : texte reçu, décompte et fin, puis note l'appel
async function journaliserFlux(admin: any, flux: ReadableStream<Uint8Array>, base: Record<string, unknown>, prompt: string) {
  const lecteur = flux.getReader()
  const decodeur = new TextDecoder()
  let tampon = '', texte = '', usage: any = null, fin: string | null = null, termine = false
  try {
    while (true) {
      const { done, value } = await lecteur.read()
      if (done) break
      tampon += decodeur.decode(value, { stream: true })
      const lignes = tampon.split('\n')
      tampon = lignes.pop() || ''
      for (const l of lignes) {
        if (!l.startsWith('data:')) continue
        const brut = l.slice(5).trim()
        if (brut === '[DONE]') { termine = true; continue }
        try {
          const o = JSON.parse(brut)
          if (o.usage) usage = o.usage
          const c = o.choices?.[0]
          if (c?.delta?.content) texte += c.delta.content
          if (c?.finish_reason) fin = c.finish_reason
        } catch { /* ligne incomplète */ }
      }
    }
  } catch { /* flux coupé */ }
  const statut = fin === 'length' ? 'tronque' : (fin || termine) ? 'ok' : 'erreur'
  const entree = usage?.prompt_tokens ?? estimerTokens(prompt)
  const sortie = usage?.completion_tokens ?? estimerTokens(texte)
  await journaliser(admin, { ...base, tokens_entree: entree, tokens_sortie: sortie, cout: coutTokens(entree, sortie),
    estime: !usage, statut, erreur: statut === 'ok' ? null : statut === 'tronque' ? 'TRONQUEE' : 'COUPEE' })
}

// Tâche après la réponse (le runtime Supabase attend sa fin)
function enArrierePlan(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
  else p.catch(e => console.error(e))
}

// ── HTTP ─────────────────────────────────────────────────────────────
const ORIGINES = (Deno.env.get('ORIGINES_AUTORISEES') || '').split(',').map(s => s.trim()).filter(Boolean)
type Json = (body: unknown, status?: number) => Response
function cors(req: Request) {
  const origine = req.headers.get('Origin') || ''
  return {
    'Access-Control-Allow-Origin': ORIGINES.length ? (ORIGINES.includes(origine) ? origine : ORIGINES[0]) : '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'x-repas-journal',
    'Vary': 'Origin',
  }
}

// Code d'erreur noté au journal (mêmes codes que js/credit-ia.js)
function codeAmont(status: number) {
  if (status === 402) return 'CREDIT_EPUISE'
  if (status === 401 || status === 403) return 'CLE_INVALIDE'
  if (status === 429) return 'LIMITE'
  if (status >= 500) return 'SURCHARGE'
  if ([400, 404, 422].includes(status)) return 'REQUETE_REFUSEE'
  return 'INCONNUE'
}

// Erreur amont relayée avec le message de Mammouth (jamais la clé)
function erreurAmont(json: Json, status: number, texte: string) {
  console.error('Mammouth', status, texte)
  let detail = texte
  try { const j = JSON.parse(texte); detail = j.error?.message || j.message || j.detail || texte } catch { /* texte brut */ }
  return json({ error: 'ERREUR_IA', amont: status, detail: String(detail).slice(0, 300), journalise: true }, status)
}

Deno.serve(async (req) => {
  const entetes = cors(req)
  const json: Json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...entetes, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  // Seuls les membres du foyer connectés peuvent appeler la fonction
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Non connecté' }, 401)
  const { data: membre } = await supabase.rpc('est_membre_foyer')
  if (!membre) return json({ error: 'Pas membre du foyer' }, 403)

  const { action, prompt, recetteId, url, nbRecettes, type } = await req.json().catch(() => ({}))
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  if (action === 'importer') {
    if (typeof url !== 'string' || url.length > 2000) return json({ error: 'URL_INVALIDE' }, 400)
    return lirePageRecette(url, json)
  }

  if (action !== 'image' && action !== 'chat') return json({ error: 'Action inconnue' }, 400)
  const cle = Deno.env.get('MAMMOUTH_API_KEY')
  if (!cle) return json({ error: 'CLE_MANQUANTE' }, 503)

  // Plafond du mois : rien n'est envoyé à Mammouth si le crédit est épuisé
  const reste = await creditRestant(admin).catch(e => { console.error('Crédit', e); return Infinity })
  if (reste <= 0) {
    await journaliser(admin, { action: action === 'image' ? 'image' : (type || 'generation'), nb_recettes: Number(nbRecettes) || 0, statut: 'erreur', erreur: 'BUDGET_ATTEINT' })
    return json({ error: 'BUDGET_ATTEINT', detail: 'Le budget IA du mois est atteint (Réglages → Crédit IA).', journalise: true }, 402)
  }

  if (action === 'image') {
    if (typeof prompt !== 'string' || !prompt || prompt.length > 3000) return json({ error: 'Prompt invalide' }, 400)
    if (typeof recetteId !== 'string' || !/^[\w-]{1,80}$/.test(recetteId)) return json({ error: 'Recette invalide' }, 400)
    const base = { action: 'image', nb_recettes: 1 }
    const res = await genererImage(cle, `${prompt}\nAucune bouteille, aucun verre d'alcool, aucun produit à base de porc.`)
    if ('injoignable' in res) { await journaliser(admin, { ...base, statut: 'erreur', erreur: 'MAMMOUTH_INJOIGNABLE' }); return json({ error: 'MAMMOUTH_INJOIGNABLE', journalise: true }, 502) }
    if ('erreur' in res) { await journaliser(admin, { ...base, statut: 'erreur', erreur: codeAmont(res.erreur!.status) }); return erreurAmont(json, res.erreur!.status, await res.erreur!.text().catch(() => '')) }
    if ('vide' in res || !res.img) { await journaliser(admin, { ...base, statut: 'erreur', erreur: 'IMAGE_VIDE' }); return json({ error: 'IMAGE_VIDE', journalise: true }, 502) }

    const ext = res.img.type.includes('jpeg') ? 'jpg' : res.img.type.includes('webp') ? 'webp' : 'png'
    const chemin = `${recetteId}.${ext}`
    const { error } = await admin.storage.from(BUCKET_IMAGES).upload(chemin, res.img.octets, { contentType: res.img.type, upsert: true })
    if (error) { console.error('Stockage', error.message); return json({ error: 'STOCKAGE', detail: error.message }, 500) }
    const u = res.usage
    const entree = u?.prompt_tokens ?? u?.input_tokens ?? 200
    const sortie = u?.completion_tokens ?? u?.output_tokens ?? TARIF_IMAGE.tokensParImage
    await journaliser(admin, { ...base, tokens_entree: entree, tokens_sortie: sortie, cout: (entree * TARIF_IMAGE.entree + sortie * TARIF_IMAGE.sortie) / 1e6, estime: !u, statut: 'ok' })
    const { data: { publicUrl } } = admin.storage.from(BUCKET_IMAGES).getPublicUrl(chemin)
    return json({ url: `${publicUrl}?v=${Date.now()}`, usage: res.usage, modele: MODELE_IMAGE, journalise: true })
  }

  // action === 'chat'
  if (typeof prompt !== 'string' || !prompt || prompt.length > 50000) return json({ error: 'Prompt invalide' }, 400)
  const base = { action: typeof type === 'string' && /^[a-z_]{1,20}$/.test(type) ? type : 'generation', nb_recettes: Math.min(20, Number(nbRecettes) || 0) }

  const appeler = (avecDecompte: boolean) => fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELE,
      max_tokens: MAX_TOKENS,
      stream: true,
      // décompte des tokens en fin de flux (suivi du crédit)
      ...(avecDecompte ? { stream_options: { include_usage: true } } : {}),
      messages: [{ role: 'system', content: SYSTEME_HALAL }, { role: 'user', content: prompt }],
    }),
  }).catch(() => null)

  let amont = await appeler(true)
  let texte = ''
  if (amont && amont.status === 400) {
    texte = await amont.text().catch(() => '')
    // Paramètre refusé : on relance sans décompte (le coût sera estimé)
    if (/stream_options|include_usage/i.test(texte)) { amont = await appeler(false); texte = '' }
  }
  if (!amont) {
    await journaliser(admin, { ...base, statut: 'erreur', erreur: 'MAMMOUTH_INJOIGNABLE' })
    return json({ error: 'MAMMOUTH_INJOIGNABLE', journalise: true }, 502)
  }
  if (!amont.ok) {
    if (!texte) texte = await amont.text().catch(() => '')
    await journaliser(admin, { ...base, statut: 'erreur', erreur: codeAmont(amont.status) })
    return erreurAmont(json, amont.status, texte)
  }
  // Flux relayé tel quel au navigateur ; une copie sert au journal
  const [versNavigateur, versJournal] = amont.body!.tee()
  enArrierePlan(journaliserFlux(admin, versJournal, base, prompt))
  return new Response(versNavigateur, {
    headers: { ...entetes, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'x-repas-journal': '1' },
  })
})
