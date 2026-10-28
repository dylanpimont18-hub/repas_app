// sw.js — Service worker : l'appli s'ouvre et la liste de courses reste lisible sans réseau.
// Code de l'appli : réseau d'abord (toujours la dernière version en ligne), sinon la copie en cache.
// Données Supabase (lecture) : réseau d'abord, sinon la dernière réponse reçue. Écritures, IA, connexion : jamais en cache.
// Changer VERSION à chaque mise en ligne qui modifie la liste ci-dessous.
const VERSION = 'repas-v3'
const CACHE_CODE = `${VERSION}-code`
const CACHE_DONNEES = 'repas-donnees'   // vidé à la déconnexion (js/app.js)
const DELAI_RESEAU = 4000               // au-delà, on sert la copie en cache (4G faible en magasin)

const COQUILLE = [
  './', 'index.html', 'login.html', 'planning.html', 'recettes.html', 'courses.html', 'preferences.html', 'reglages.html', 'placard.html',
  'manifest.json', 'config.js', 'css/style.css', 'css/components.css',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
  'js/vendor/supabase-2.118.0.js',
  'js/ai.js', 'js/app.js', 'js/auth-login.js', 'js/avis.js', 'js/courses-ui.js', 'js/courses.js', 'js/credit-ia-ui.js',
  'js/controle-ia.js', 'js/credit-ia.js', 'js/cuisine.js', 'js/custom-ingredients.js', 'js/cycle.js', 'js/dashboard.js', 'js/data/ingredients.js',
  'js/db.js', 'js/dialogue.js', 'js/envie.js', 'js/filtres-recettes.js', 'js/filtres.js', 'js/hors-ligne.js', 'js/icones.js',
  'js/import-pur.js', 'js/import-recette.js', 'js/impression-recette.js', 'js/livres-ui.js', 'js/minuteurs.js', 'js/modales.js',
  'js/mode-cuisine.js', 'js/photos-auto.js', 'js/placard.js', 'js/placard-ui.js', 'js/planifier-recette.js', 'js/planning-ui.js', 'js/planning.js',
  'js/preferences-ui.js', 'js/preferences.js', 'js/propositions.js', 'js/recettes-ui.js', 'js/recettes.js',
  'js/reglages-ui.js', 'js/selection.js', 'js/storage.js', 'js/utils.js',
]

self.addEventListener('install', e => {
  // Fichier par fichier : un fichier absent (config.js en local…) ne bloque pas l'installation
  e.waitUntil(caches.open(CACHE_CODE).then(c => Promise.all(COQUILLE.map(f => c.add(f).catch(() => null))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(k => k !== CACHE_CODE && k !== CACHE_DONNEES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

// Réseau d'abord avec délai ; la réponse réseau met le cache à jour
async function reseauPuisCache(requete, nomCache, options = {}) {
  const cache = await caches.open(nomCache)
  const reseau = fetch(requete).then(rep => {
    if (rep.ok) cache.put(requete, rep.clone())
    return rep
  })
  const minuteur = new Promise(res => setTimeout(res, DELAI_RESEAU, null))
  try {
    const rapide = await Promise.race([reseau, minuteur])
    if (rapide) return rapide
  } catch { /* hors ligne */ }
  const copie = await cache.match(requete, { ignoreVary: true, ...options })
  if (copie) return copie
  return reseau // pas de copie : on attend le réseau (ou son erreur)
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Jamais en cache : connexion, temps réel, IA
  if (/\/(auth|realtime|functions)\/v1\//.test(url.pathname)) return
  if (/\/(rest|storage)\/v1\//.test(url.pathname)) {
    e.respondWith(reseauPuisCache(req, CACHE_DONNEES))
    return
  }
  if (url.origin !== self.location.origin) return
  // Pages : recettes.html?id=… retrouve recettes.html en cache
  e.respondWith(reseauPuisCache(req, CACHE_CODE, req.mode === 'navigate' ? { ignoreSearch: true } : {}))
})
