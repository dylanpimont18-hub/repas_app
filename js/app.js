// js/app.js
import { load, save, KEYS } from './storage.js'
import { dbGetSession, dbSignOut } from './db.js'

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  const btn = document.getElementById('btnTheme')
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙'
}

function initTheme() {
  applyTheme(load(KEYS.theme, 'light'))
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.classList.add('hidden') })
}

function initLogout() {
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await dbSignOut()
    window.location.href = 'login.html'
  })
}

function injectBottomNav() {
  const current = location.pathname.split('/').pop() || 'index.html'
  const pages = [
    { href: 'index.html',       icon: '🏠', label: 'Accueil'   },
    { href: 'planning.html',    icon: '📅', label: 'Planning'  },
    { href: 'recettes.html',    icon: '📖', label: 'Recettes'  },
    { href: 'preferences.html', icon: '❤️', label: 'Prefs'     },
    { href: 'courses.html',     icon: '🛒', label: 'Courses'   },
  ]
  const nav = document.createElement('nav')
  nav.className = 'bottom-nav'
  nav.id = 'bottomNav'
  nav.innerHTML = pages.map(p =>
    `<a href="${p.href}" class="bottom-nav-item${p.href === current ? ' active' : ''}">
      <span class="bottom-nav-icon">${p.icon}</span>
      <span class="bottom-nav-label">${p.label}</span>
    </a>`
  ).join('')
  document.body.appendChild(nav)
}

async function initPrefsBadge() {
  // Cible tous les liens vers preferences.html (top nav + bottom nav)
  try {
    const { getTotalANoter } = await import('./preferences.js')
    const [nd, nf] = await Promise.all([getTotalANoter('dylan'), getTotalANoter('femme')])
    const total = nd + nf
    if (total > 0) {
      document.querySelectorAll('a[href="preferences.html"]').forEach(link => {
        const badge = document.createElement('span')
        badge.className = 'nav-badge'
        badge.title = `${total} ingrédient(s) non noté(s)`
        badge.textContent = total > 99 ? '99+' : total
        link.appendChild(badge)
      })
    }
  } catch { /* silently ignore */ }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Guard : rediriger vers login si non connecté
  const session = await dbGetSession()
  if (!session) { window.location.href = 'login.html'; return }

  initTheme()
  initBurger()
  highlightActiveLink()
  initModalFlash()
  initLogout()
  injectBottomNav()
  initPrefsBadge()
})
