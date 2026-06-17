// js/app.js
import { KEYS, load, save } from './storage.js'

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

// Stub remplacé en Task 10
export async function renderModalFlash() {
  const content = document.getElementById('modalContent')
  if (!content) return
  content.innerHTML = `
    <p class="modal-title">⚡ Recette de dernière minute</p>
    <p class="text-muted text-sm" style="margin-top:0.5rem;">Module IA à connecter (disponible après Task 10).</p>`
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

document.addEventListener('DOMContentLoaded', () => {
  initTheme()
  initBurger()
  highlightActiveLink()
  initModalFlash()
})
