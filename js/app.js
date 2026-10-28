// js/app.js
import { load, save, KEYS } from './storage.js'
import { dbGetSession, dbSignOut, dbGetMonProfil } from './db.js'
import { icone, injecterSprite } from './icones.js'
import { initModales } from './modales.js'
import { initHorsLigne } from './hors-ligne.js'

injecterSprite()

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  const btn = document.getElementById('btnTheme')
  if (btn) btn.innerHTML = icone(theme === 'dark' ? 'soleil' : 'lune')
}

// Thème déjà posé dans <head> (pas de flash) ; sans choix enregistré, on suit le réglage du téléphone
function initTheme() {
  applyTheme(load(KEYS.theme, null) || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  document.getElementById('btnTheme')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    save(KEYS.theme, next)
    applyTheme(next)
  })
}

function initBurger() {
  const burger = document.getElementById('navBurger')
  const links  = document.getElementById('navLinks')
  if (!burger || !links) return
  burger.addEventListener('click', () => links.classList.toggle('open'))
  document.addEventListener('click', (e) => {
    if (!burger.contains(e.target) && !links.contains(e.target))
      links.classList.remove('open')
  })
}

function highlightActiveLink() {
  const current = location.pathname.split('/').pop() || 'index.html'
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === current) a.classList.add('active')
  })
}

// « ⚡ Envie ce soir » (chargé à la demande : n'alourdit pas les autres pages)
export async function renderModalFlash() {
  const content = document.getElementById('modalContent')
  if (!content) return
  const { renderModalEnvie } = await import('./envie.js')
  await renderModalEnvie(content, () => document.getElementById('modalFlash').classList.add('hidden'))
}

function initModalFlash() {
  const btn      = document.getElementById('btnFlash')
  const overlay  = document.getElementById('modalFlash')
  const closeBtn = document.getElementById('modalClose')
  if (!btn || !overlay) return
  btn.addEventListener('click', () => {
    overlay.classList.remove('hidden')
    renderModalFlash()
  })
  closeBtn?.addEventListener('click', () => overlay.classList.add('hidden'))
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden') })
}

// Bouton ⚙️ Réglages dans la barre du haut (le menu texte est masqué sur mobile)
function injectBoutonReglages() {
  const theme = document.getElementById('btnTheme')
  if (!theme || document.getElementById('btnReglages')) return
  const a = document.createElement('a')
  a.id = 'btnReglages'
  a.href = 'reglages.html'
  a.className = 'nav-theme'
  a.title = 'Réglages'
  a.setAttribute('aria-label', 'Réglages')
  a.innerHTML = icone('reglages')
  theme.before(a)
}

function initLogout() {
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await dbSignOut()
    // Les données gardées pour le hors-ligne ne restent pas sur l'appareil après déconnexion
    try { await caches?.delete('repas-donnees') } catch { /* pas de cache */ }
    try { Object.keys(localStorage).filter(k => k.startsWith('repas_profil_') || k === 'repas_file_courses').forEach(k => localStorage.removeItem(k)) } catch { /* navigation privée */ }
    window.location.href = 'login.html'
  })
}

function injectBottomNav() {
  const current = location.pathname.split('/').pop() || 'index.html'
  const pages = [
    { href: 'index.html',       icon: 'accueil',    label: 'Accueil'   },
    { href: 'planning.html',    icon: 'calendrier', label: 'Planning'  },
    { href: 'recettes.html',    icon: 'livre',      label: 'Recettes'  },
    { href: 'preferences.html', icon: 'coeur',      label: 'Goûts'     },
    { href: 'courses.html',     icon: 'panier',     label: 'Courses'   },
  ]
  const nav = document.createElement('nav')
  nav.className = 'bottom-nav'
  nav.id = 'bottomNav'
  nav.innerHTML = pages.map(p =>
    `<a href="${p.href}" class="bottom-nav-item${p.href === current ? ' active' : ''}">
      <span class="bottom-nav-icon">${icone(p.icon)}</span>
      <span class="bottom-nav-label">${p.label}</span>
    </a>`
  ).join('')
  document.body.appendChild(nav)
}

// Badge : ingrédients que la personne connectée n'a pas encore notés (pas ceux de l'autre profil)
async function initPrefsBadge() {
  try {
    const profil = await dbGetMonProfil()
    if (!profil) return
    const { getTotalANoter } = await import('./preferences.js')
    const total = await getTotalANoter(profil)
    if (total > 0) {
      document.querySelectorAll('a[href="preferences.html"]').forEach(link => {
        const badge = document.createElement('span')
        badge.className = 'nav-badge'
        badge.title = `${total} ingrédient(s) non noté(s)`
        badge.textContent = total > 99 ? '99+' : total
        link.appendChild(badge)
      })
    }
  } catch (e) { console.warn('Badge préférences', e) }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Guard : rediriger vers login si non connecté
  const session = await dbGetSession()
  if (!session) { window.location.href = 'login.html'; return }

  initTheme()
  initModales()
  initHorsLigne()
  initBurger()
  highlightActiveLink()
  initModalFlash()
  initLogout()
  injectBoutonReglages()
  injectBottomNav()
  initPrefsBadge()
  // Minuteurs de cuisine encore en cours (lancés depuis une autre page)
  try { if (JSON.parse(localStorage.getItem('repas_minuteurs') || '[]').length) import('./minuteurs.js').then(m => m.afficherMinuteurs()) } catch { /* rien */ }
})
