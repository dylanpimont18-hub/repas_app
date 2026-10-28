// tests/e2e/parcours.mjs — Parcours réels dans Chromium, Supabase simulé en mémoire (aucun réseau, aucune clé)
// Lancer : node tests/e2e/parcours.mjs   (Playwright doit être installé : npx playwright install chromium)
// Hors de `node --test tests/*.test.mjs` exprès : il faut un navigateur.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'
import assert from 'node:assert/strict'
import { debutCycle, creneauxDuCycle } from '../../js/cycle.js'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const RACINE = new URL('../../', import.meta.url).pathname
const SUPABASE = 'https://test.supabase.co'

// ── Serveur statique (config.js simulé) ─────────────────────────────
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' }
const serveur = createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (chemin === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' })
    return res.end(`const CONFIG = { SUPABASE_URL: '${SUPABASE}', SUPABASE_ANON_KEY: 'cle-publique-test' }`)
  }
  try {
    const fichier = normalize(join(RACINE, chemin === '/' ? 'index.html' : chemin))
    if (!fichier.startsWith(RACINE)) throw new Error('hors racine')
    res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] || 'application/octet-stream' })
    res.end(await readFile(fichier))
  } catch { res.writeHead(404); res.end() }
})
await new Promise(r => serveur.listen(0, r))
const BASE = `http://localhost:${serveur.address().port}`

// ── Base simulée ─────────────────────────────────────────────────────
const samedi = debutCycle()
const C = creneauxDuCycle(samedi)
const cle = (j, m) => C.find(c => c.jour === j && c.moment === m)
const ligne = (c, recette_id, portions = c.portions, source = 'biblio') => ({ semaine_key: c.semaineKey, jour: c.jour, moment: c.moment, recette_id, portions, source, avis: null })
const recette = (id, nom, ingredients, extra = {}) => ({ id, nom, portions: 4, temps_prep: 15, temps_cuisson: 30, vegetarien: false, ingredients,
  etapes: ['Préparer les légumes.', 'Cuire 25 min à feu doux.'], nutrition: null, date: new Date().toISOString(), conservation_jours: 3,
  composants: null, tags: [], legumes_caches: [], description: null, cuisine: 'française', avis: null, image_url: null, livre_id: null, ...extra })

const tables = {
  recettes: [
    recette('r1', 'Curry de poulet', [{ nom: 'Poulet', quantite: '600 g' }, { nom: 'Lait de coco', quantite: '40 cl' }, { nom: 'Riz', quantite: '300 g' }]),
    recette('r2', 'Gratin de pâtes', [{ nom: 'Pâtes', quantite: '400 g' }, { nom: 'Tomates', quantite: '4' }]),
    recette('r3', 'Soupe de lentilles', [{ nom: 'Lentilles corail', quantite: '250 g' }, { nom: 'Carottes', quantite: '3' }], { tags: ['bouillon'] }),
    recette('r4', 'Tajine d\'agneau', [{ nom: 'Agneau', quantite: '800 g' }, { nom: 'Carottes', quantite: '4' }], { temps_cuisson: 90 }),
    // Recette abîmée par l'ancien formulaire
    recette('r5', 'Salade composée', [{ quantite: '400', nom: 'g Tomates' }, { quantite: '2', nom: 'c.s. huile d\'olive' }]),
  ],
  planning: [
    ligne(cle('samedi', 'soir'), 'r1'),
    ligne(cle('dimanche', 'soir'), 'r2'),
    ligne(cle('lundi', 'soir'), 'r4'),
    ligne(cle('mardi', 'midi'), 'r4', 1, 'reste'),
    ligne(cle('mercredi', 'soir'), 'r3'),
  ],
  preferences: [], courses_etat: [], courses_libres: [], reglages: [], reserve: [], livres: [], ia_usage: [], ingredients_custom: [],
  foyer_membres: [{ user_id: 'u1', profil_nom: 'femme' }],
}
const requetes = []   // { methode, table }

// Filtres PostgREST simples : col=eq.x, col=in.(a,b)
function filtrer(lignes, params) {
  return lignes.filter(l => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict', 'columns'].includes(k)) return true
    const valeur = String(l[k] ?? '')
    if (v.startsWith('eq.')) return valeur === v.slice(3)
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')).includes(valeur)
    if (v.startsWith('gte.')) return valeur >= v.slice(4)
    return true
  }))
}
const CLES = { planning: ['semaine_key', 'jour', 'moment'], courses_etat: ['semaine_key', 'ingredient_nom'], reglages: ['cle'],
  preferences: ['profil_nom', 'ingredient_id'], recettes: ['id'], livres: ['id'], reserve: ['id'], courses_libres: ['id'], ingredients_custom: ['id'] }

// IA simulée (comme Mammouth en flux SSE) : une recette par ligne « - "cN" : articles » du prompt « Vider le placard »
let appelsIA = 0
async function iaSimulee(route) {
  const corps = JSON.parse(route.request().postData() || '{}')
  if (corps.action !== 'chat') return route.fulfill({ status: 503, json: { error: 'CLE_MANQUANTE' } })
  appelsIA++
  const lignes = [...String(corps.prompt).matchAll(/^- "c(\d+)" : (.+)$/gm)]
  const repas = lignes.map(([, n, articles]) => ({ id: `c${n}`, recette: {
    nom: `Plat du placard ${appelsIA}-${n}`, description: 'Recette anti-gaspi.', cuisine: 'française',
    ingredients: [...articles.split(', ').map(a => ({ nom: a.replace(/ \(.*\)$/, ''), quantite: '200 g' })), { nom: 'Oignon', quantite: '1' }],
    etapes: ['Tout mélanger.', 'Cuire 20 min.'], tags: ['économique'], conservation_jours: 3, portions: 4, temps_prep: 10, temps_cuisson: 20,
    vegetarien: false, legumes_caches: [], composants: { base: null, principal: 'plat', proteine: null, legumes: [] } } }))
  const texte = JSON.stringify({ repas })
  const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: texte } }] })}\n\n`
    + `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 2000, completion_tokens: 1500 } })}\n\ndata: [DONE]\n\n`
  return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream', 'x-repas-journal': '1', 'Access-Control-Expose-Headers': 'x-repas-journal' }, body: sse })
}

async function supabaseSimule(route) {
  const req = route.request()
  const url = new URL(req.url())
  if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ status: 200, json: { id: 'u1', email: 'test@exemple.fr' } })
  if (url.pathname.startsWith('/functions/v1/')) return iaSimulee(route)
  const table = url.pathname.replace('/rest/v1/', '')
  const lignes = tables[table] ||= []
  const methode = req.method()
  requetes.push({ methode, table })
  const objet = (req.headers().accept || '').includes('vnd.pgrst.object')
  if (methode === 'GET') {
    let res = filtrer(lignes, url.searchParams)
    // Jointure réserve → recette
    if (table === 'reserve') res = res.map(r => ({ ...r, recette: tables.recettes.find(x => x.id === r.recette_id) || null }))
    if (objet) return res.length === 1 ? route.fulfill({ json: res[0] }) : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return route.fulfill({ json: res })
  }
  if (methode === 'DELETE') {
    const a = filtrer(lignes, url.searchParams)
    tables[table] = lignes.filter(l => !a.includes(l))
    return route.fulfill({ status: 204, body: '' })
  }
  const corps = JSON.parse(req.postData() || '[]')
  const liste = Array.isArray(corps) ? corps : [corps]
  if (methode === 'PATCH') {
    filtrer(lignes, url.searchParams).forEach(l => Object.assign(l, corps))
    return route.fulfill({ status: 204, body: '' })
  }
  // POST : insert ou upsert
  const cles = CLES[table] || ['id']
  const ecrites = liste.map(n => {
    const ex = lignes.find(l => cles.every(k => n[k] !== undefined && String(l[k]) === String(n[k])))
    if (ex) return Object.assign(ex, n)
    const neuf = { id: n.id || `gen-${Math.random().toString(36).slice(2, 8)}`, ...n }
    lignes.push(neuf); return neuf
  })
  return route.fulfill({ status: 201, json: objet ? ecrites[0] : ecrites })
}

// ── Navigateur ───────────────────────────────────────────────────────
const navigateur = await chromium.launch()
const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'fr-FR',
  serviceWorkers: 'block' })  // le cache hors ligne fausserait le comptage des requêtes
await contexte.route(`${SUPABASE}/**`, supabaseSimule)
await contexte.routeWebSocket(/realtime/, ws => ws.close()).catch(() => {})
// Session déjà ouverte (supabase-js la lit dans localStorage)
await contexte.addInitScript(() => {
  localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: 'jeton', refresh_token: 'r', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', email: 'test@exemple.fr', aud: 'authenticated' } }))
})
const page = await contexte.newPage()
const erreurs = []
page.on('pageerror', e => erreurs.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error' && !/WebSocket|realtime|Failed to load resource/i.test(m.text())) erreurs.push(`console: ${m.text()}`) })

let ok = 0
const CAPTURES = process.env.CAPTURES  // dossier : une capture d'écran par étape
async function etape(nom, fn) {
  try {
    await fn(); ok++; console.log(`✔ ${nom}`)
    if (CAPTURES) await page.screenshot({ path: join(CAPTURES, `${String(ok).padStart(2, '0')}.png`) })
  }
  catch (e) { console.log(`✘ ${nom}\n   ${e.message.split('\n').slice(0, 4).join('\n   ')}`); process.exitCode = 1 }
}
const attendreReseau = () => page.waitForLoadState('networkidle')

await etape('Accueil : prochain repas et session, sans erreur', async () => {
  requetes.length = 0
  await page.goto(`${BASE}/index.html`)
  await page.waitForSelector('.apercu-jour')
  await attendreReseau()
  const n = requetes.filter(r => r.methode === 'GET').length
  assert.ok(n <= 6, `${n} requêtes de lecture à l'accueil (attendu ≤ 6)`)
  assert.ok(await page.locator('.bottom-nav').isVisible())
})

await etape('Planning : un tap ↻ ne recharge pas tout le cycle', async () => {
  await page.goto(`${BASE}/planning.html`)
  await page.waitForSelector('.slot-nom')
  await attendreReseau()
  requetes.length = 0
  const c = cle('samedi', 'soir').cle
  const avant = await page.locator(`[data-ouvrir="${c}"]`).textContent()
  await page.locator(`[data-action="suivant"][data-cle="${c}"]`).click()
  await page.waitForFunction(([k, a]) => document.querySelector(`[data-ouvrir="${k}"]`)?.textContent !== a, [c, avant])
  await attendreReseau()
  const lectures = requetes.filter(r => r.methode === 'GET').length
  assert.equal(lectures, 0, `${lectures} lecture(s) après ↻`)
  assert.equal(requetes.filter(r => r.methode === 'POST' && r.table === 'planning').length, 1)
})

await etape('Planning : portions par la fenêtre − / + (plus de prompt), focus rendu', async () => {
  const c = cle('dimanche', 'soir').cle
  await page.locator(`[data-action="portions"][data-cle="${c}"]`).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: 'Un de plus' }).click()
  await page.getByRole('button', { name: 'Valider' }).click()
  await page.waitForFunction(k => document.querySelector(`[data-action="portions"][data-cle="${k}"]`)?.textContent.includes('5'), c)
  assert.equal(tables.planning.find(l => `${l.semaine_key}|${l.jour}|${l.moment}` === c).portions, 5)
})

await etape('Planning : un créneau vide s\'ouvre au clavier, Échap ferme la fenêtre', async () => {
  const vide = page.locator('.slot-vide').first()
  await vide.focus()
  await page.keyboard.press('Enter')
  await page.locator('#modalRecetteSelect:not(.hidden)').waitFor()
  assert.equal(await page.locator('#modalRecetteSelect .modal').getAttribute('role'), 'dialog')
  await page.waitForTimeout(100)
  await page.keyboard.press('Escape')
  await page.locator('#modalRecetteSelect.hidden').waitFor({ state: 'attached' })
})

await etape('Mode cuisine de la session du dimanche : 5 parts du tajine (reste du mardi midi compris)', async () => {
  const bouton = page.locator('.btn-cuisiner').filter({ hasText: 'Cuisiner' })
  const titres = await page.locator('.cycle-groupe-session .btn-cuisiner').count()
  assert.ok(titres > 0, 'pas de bouton Cuisiner de session')
  await page.locator('.cycle-groupe-session .btn-cuisiner').first().click()
  await page.locator('#modeCuisine').waitFor()
  const texte = await page.locator('#modeCuisine').textContent()
  assert.match(texte, /Tajine/)
  assert.match(texte, /5 portion/)
  // Minuteur proposé par l'étape « Cuire 25 min »
  await page.getByRole('button', { name: /Suivante/ }).click()
  await page.getByRole('button', { name: /Minuteur 25 min/ }).click()
  await page.locator('.barre-minuteurs .minuteur').waitFor()
  await page.getByRole('button', { name: /Arrêter le minuteur/ }).click()
  await page.keyboard.press('Escape')
  await page.locator('#modeCuisine').waitFor({ state: 'detached' })
  void bouton
})

await etape('Recettes : 6 personnes → ingrédients pondérés', async () => {
  await page.goto(`${BASE}/recettes.html?id=r1`)
  await page.locator('#modalDetail:not(.hidden)').waitFor()
  await page.getByRole('button', { name: 'Une personne de plus' }).click()
  await page.getByRole('button', { name: 'Une personne de plus' }).click()
  await page.waitForFunction(() => document.querySelector('.detail-ingredients')?.textContent.includes('900 g'))
  const t = await page.locator('.detail-ingredients').textContent()
  assert.match(t, /900 g/); assert.match(t, /60 cl/); assert.match(t, /450 g/)
  assert.match(await page.locator('#btnCuisinerRecette').textContent(), /6/)
})

await etape('Recettes : « Enregistrer pour 6 personnes » réécrit la recette', async () => {
  await page.locator('[data-garder-portions]').click()
  await page.locator('.modal-dialogue [data-oui]').click()
  await page.waitForFunction(() => !document.querySelector('[data-garder-portions]'))
  const r = tables.recettes.find(x => x.id === 'r1')
  assert.equal(r.portions, 6)
  assert.deepEqual(r.ingredients.map(i => i.quantite), ['900 g', '60 cl', '450 g'])
})

await etape('Recettes : modifier une recette garde « 400 g » + « Tomates » (et répare l\'ancienne)', async () => {
  await page.goto(`${BASE}/recettes.html?id=r5`)
  await page.locator('#modalDetail:not(.hidden)').waitFor()
  await page.locator('#btnEditRecette').click()
  await page.locator('#modalEditRecette:not(.hidden)').waitFor()
  await page.locator('#btnSauverEdit').click()
  await page.waitForFunction(() => document.querySelector('#modalEditRecette').classList.contains('hidden'))
  const r = tables.recettes.find(x => x.id === 'r5')
  assert.deepEqual(r.ingredients, [{ quantite: '400 g', nom: 'Tomates' }, { quantite: '2 c.s.', nom: 'huile d\'olive' }])
})

await etape('Recettes : nouvelle recette, liste d\'ingrédients collée', async () => {
  await page.locator('#modalDetail .modal-close').click().catch(() => {})
  await page.locator('#btnNouvelleRecette').click()
  await page.locator('#editNom').fill('Omelette aux herbes')
  await page.locator('.edit-nom').first().focus()
  await page.evaluate(() => {
    const champ = document.querySelector('.edit-nom')
    const dt = new DataTransfer(); dt.setData('text', '6 œufs\n1 botte de ciboulette\n20 g de beurre')
    champ.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  assert.equal(await page.locator('.edit-row-ingredient').count(), 3)
  await page.locator('#btnSauverEdit').click()
  await page.waitForFunction(() => document.querySelector('#modalEditRecette').classList.contains('hidden'))
  const r = tables.recettes.find(x => x.nom === 'Omelette aux herbes')
  assert.ok(r, 'recette non enregistrée')
  assert.deepEqual(r.ingredients[2], { quantite: '20 g', nom: 'beurre' })
})

await etape('Recettes : un ingrédient non halal est signalé à l\'enregistrement', async () => {
  await page.locator('#modalDetail .modal-close').click().catch(() => {})
  await page.locator('#btnNouvelleRecette').click()
  await page.locator('#editNom').fill('Pâtes carbonara')
  await page.locator('.edit-qte').first().fill('150 g')
  await page.locator('.edit-nom').first().fill('lardons fumés')
  await page.locator('#btnSauverEdit').click()
  await page.getByText('Contrainte halal').waitFor()
  await page.locator('.modal-dialogue [data-non]').click()
  assert.ok(!tables.recettes.some(x => x.nom === 'Pâtes carbonara'))
  await page.locator('#closeEditRecette').click()
})

await etape('Recettes : import d\'un texte collé', async () => {
  await page.locator('#btnImporterRecette').click()
  await page.locator('#importTexte').fill('Taboulé\nPour 6 personnes\nIngrédients :\n- 250 g de boulgour\n- 3 tomates\nPréparation :\n1. Mélanger.')
  await page.getByRole('button', { name: 'Lire le texte' }).click()
  await page.locator('#modalEditRecette:not(.hidden)').waitFor()
  assert.equal(await page.locator('#editNom').inputValue(), 'Taboulé')
  assert.equal(await page.locator('#editPortions').inputValue(), '6')
  assert.equal(await page.locator('.edit-qte').first().inputValue(), '250 g')
  await page.locator('#closeEditRecette').click()
})

await etape('Courses : une coche = une seule écriture, aucune relecture ; tout s\'affiche', async () => {
  await page.goto(`${BASE}/courses.html`)
  await page.waitForSelector('.courses-item')
  await attendreReseau()
  const texte = await page.locator('#coursesList').textContent()
  assert.match(texte, /Agneau/)   // samedi : session du dimanche
  assert.match(texte, /Lentilles/) // mercredi
  requetes.length = 0
  const premiere = page.locator('.courses-item-zone').first()
  const nom = await premiere.locator('.courses-item-label').textContent()
  await premiere.click()
  await page.waitForFunction(n => [...document.querySelectorAll('.courses-achetees .courses-item-label')].some(e => e.textContent === n), nom)
  await attendreReseau()
  assert.equal(requetes.filter(r => r.methode === 'GET').length, 0, 'relecture après la coche')
  assert.equal(requetes.filter(r => r.methode === 'POST' && r.table === 'courses_etat').length, 1)
})

await etape('Goûts : profil de la personne connectée par défaut, annulation de la dernière note', async () => {
  await page.goto(`${BASE}/preferences.html`)
  await page.waitForFunction(() => document.querySelector('[data-profil="femme"]')?.getAttribute('aria-pressed') === 'true')
  const nom = await page.locator('#cardNom').textContent()
  await page.locator('#prefButtons [data-niveau="j_adore"]').click()
  await page.waitForFunction(n => document.querySelector('#cardNom').textContent !== n, nom)
  assert.equal(tables.preferences.length, 1)
  await page.locator('#btnAnnulerNote').click()
  await page.waitForFunction(n => document.querySelector('#cardNom').textContent === n, nom)
  assert.equal(tables.preferences.length, 0)
})

await etape('Réglages : réparation des quantités abîmées', async () => {
  tables.recettes.find(x => x.id === 'r2').ingredients = [{ quantite: '400', nom: 'g Pâtes' }]
  await page.goto(`${BASE}/reglages.html`)
  await page.locator('#btnReparer').click()
  await page.locator('.modal-dialogue [data-oui]').click()
  await page.waitForFunction(() => /réparée/.test(document.querySelector('#reparerStatus').textContent))
  assert.deepEqual(tables.recettes.find(x => x.id === 'r2').ingredients, [{ quantite: '400 g', nom: 'Pâtes' }])
})

await etape('⚡ Envie : propositions de la bibliothèque, choix sur un repas déjà prévu → décaler', async () => {
  await page.goto(`${BASE}/planning.html`)
  await page.waitForSelector('.slot-nom')
  await page.locator('#btnFlash').click()
  await page.locator('.envie-card').first().waitFor()
  await page.locator('.envie-card[data-source="biblio"]').first().click()
  // Repas libre : placé directement ; repas occupé : choix décaler / congélo / supprimer
  await page.waitForFunction(() => document.querySelector('#modalFlash').classList.contains('hidden') || document.querySelector('[data-mode="decaler"]'))
  if (await page.locator('[data-mode="decaler"]').count()) {
    await page.locator('[data-mode="decaler"]').click()
    await page.locator('#modalFlash.hidden').waitFor({ state: 'attached' })
  }
})

await etape('Grand écran : frise du planning, sans erreur', async () => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${BASE}/planning.html`)
  await page.waitForSelector('.frise')
  assert.ok(await page.locator('.frise-bande-session').count() > 0)
})

await etape('Placard : inventaire saisi en vrac, quantités modifiables', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/placard.html`)
  await page.locator('#champPlacard').waitFor()
  await page.locator('#champPlacard').fill('2 boîtes de pois chiches\nriz basmati 500 g\nthon x3, pâtes 1 kg\ncurry\nlait de coco')
  await page.getByRole('button', { name: 'Ajouter au placard' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.placard-item').length === 6)
  await page.locator('[aria-label="Quantité de Curry"]').fill('1 pot')
  await page.locator('[aria-label="Quantité de Curry"]').press('Tab')
  await page.waitForFunction(() => true)
  const inv = tables.reglages.find(r => r.cle === 'inventaire').valeur
  assert.equal(inv.length, 6)
  assert.equal(inv.find(i => i.nom === 'Curry').quantite, '1 pot')
  assert.equal(inv.find(i => i.nom === 'Riz basmati').quantite, '500 g')
})

await etape('Placard : mes recettes d\'abord, puis l\'IA pour tout le reste', async () => {
  await page.getByRole('button', { name: 'Chercher dans mes recettes' }).click()
  await page.locator('#placardResultats:not(.hidden)').waitFor()
  assert.match(await page.locator('#placardRecettes').textContent(), /Curry de poulet/)   // riz + lait de coco
  const avant = appelsIA
  await page.getByRole('button', { name: 'Compléter avec l\'IA' }).click()
  await page.waitForFunction(() => /tout le placard est utilisé/.test(document.querySelector('#bandeauIA')?.textContent || ''), null, { timeout: 15000 })
  assert.ok(appelsIA > avant, 'IA non appelée')
  assert.match(await page.locator('#placardCouverture').textContent(), /6 \/ 6/)
  assert.ok(tables.recettes.some(r => r.nom.startsWith('Plat du placard')), 'recettes IA non enregistrées')
  assert.ok(tables.livres.some(l => l.nom === 'Vider le placard'), 'livre non créé')
})

await etape('Placard : recettes mises au planning, puis ce qui est à la maison sort des courses', async () => {
  const avant = tables.planning.filter(l => l.recette_id).length
  await page.getByRole('button', { name: 'Mettre au planning' }).click()
  await page.getByText(/recette\(s\) du placard au planning/).waitFor()
  assert.ok(tables.planning.filter(l => l.recette_id).length > avant, 'rien de planifié')
  await page.goto(`${BASE}/courses.html`)
  await page.waitForSelector('.courses-item')
  await page.locator('[data-ouvrir-placard]').click()
  const placard = await page.locator('.courses-placard-corps').textContent()
  assert.match(placard, /à la maison : Pois chiches \(2 boîtes\)/)
  assert.doesNotMatch(await page.locator('.courses-partie').allTextContents().then(t => t.join(' ')), /Pois chiches|Thon/)
})

await etape('Mode sombre : aucun flash clair (thème posé avant le rendu)', async () => {
  await page.evaluate(() => localStorage.setItem('repas_theme', JSON.stringify('dark')))
  await page.goto(`${BASE}/courses.html`, { waitUntil: 'commit' })
  await page.waitForSelector('html')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForSelector('.courses-item')
})

await etape('Aucune erreur JavaScript pendant les parcours', async () => {
  assert.deepEqual(erreurs, [], erreurs.join('\n'))
})

console.log(`\n${ok} étape(s) réussie(s)`)
await navigateur.close()
serveur.close()
