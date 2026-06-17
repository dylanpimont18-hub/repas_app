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

export async function renderModalFlash() {
  const content = document.getElementById('modalContent')
  if (!content) return

  const { genererDerniereMinute }                                        = await import('./ai.js')
  const { getJoursAvecRepas, getSemaineKey: gsk, JOURS, MOMENTS,
          assignerRepas }                                                 = await import('./planning.js')
  const { getRecetteById, addRecette }                                   = await import('./recettes.js')

  const semaineKey        = gsk()
  const ingredientsDispos = [...new Set(
    getJoursAvecRepas(semaineKey).flatMap(r => {
      const rec = getRecetteById(r.id)
      return rec ? rec.ingredients.map(i => i.nom) : []
    })
  )]

  let pourQui    = 'deux'
  let vegetarien = false
  let recetteGen = null

  const draw = (loading = false, recette = null, error = null) => {
    content.innerHTML = `
      <p class="modal-title">⚡ Recette de dernière minute</p>
      <div class="flex gap-sm" style="margin-bottom:1rem;">
        <button class="chip ${pourQui === 'deux'  ? 'active' : ''}" data-pour="deux">Nous deux</button>
        <button class="chip ${pourQui === 'dylan' ? 'active' : ''}" data-pour="dylan">Moi seul</button>
        <button class="chip chip-accent ${vegetarien ? 'active' : ''}" id="flashVeg">🌿 Végé</button>
      </div>
      ${loading ? '<div class="flex-center" style="padding:2rem;"><span class="loader"></span></div>' : ''}
      ${error   ? `<p class="text-sm" style="color:#c0392b;margin-bottom:0.75rem;">${error}</p>` : ''}
      ${recette ? `
        <div class="card" style="margin-bottom:1rem;">
          <div class="recipe-name" style="margin-bottom:0.3rem;">${recette.nom}</div>
          <div class="recipe-meta">⏱ ${recette.temps_prep + recette.temps_cuisson} min${recette.vegetarien ? ' · 🌿' : ''}</div>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary btn-sm" id="flashAjouter">Ajouter au planning</button>
          <button class="btn btn-ghost   btn-sm" id="flashAutre">Autre idée ↻</button>
        </div>
      ` : (!loading ? `<button class="btn btn-primary btn-full" id="flashGenerer">Générer une idée</button>` : '')}
    `

    content.querySelectorAll('[data-pour]').forEach(b => {
      b.addEventListener('click', () => { pourQui = b.dataset.pour; draw(false, recetteGen) })
    })
    content.querySelector('#flashVeg')?.addEventListener('click', () => {
      vegetarien = !vegetarien; draw(false, recetteGen)
    })

    const doGenerate = async () => {
      draw(true)
      try {
        recetteGen = await genererDerniereMinute({ pourQui, ingredientsDispos, contraintes: { vegetarien } })
        draw(false, recetteGen)
      } catch (e) { draw(false, null, e.message) }
    }

    content.querySelector('#flashGenerer')?.addEventListener('click', doGenerate)
    content.querySelector('#flashAutre')?.addEventListener('click', doGenerate)

    content.querySelector('#flashAjouter')?.addEventListener('click', async () => {
      if (!recetteGen) return
      const id      = addRecette(recetteGen)
      const sk      = gsk()
      const { getPlanning } = await import('./planning.js')
      const planning = getPlanning(sk)
      let   slot     = null
      for (const j of JOURS) {
        for (const m of MOMENTS) {
          if (!planning[j]?.[m]?.id) { slot = { jour: j, moment: m }; break }
        }
        if (slot) break
      }
      if (slot) assignerRepas(sk, slot.jour, slot.moment, id, recetteGen.portions || 2)
      document.getElementById('modalFlash').classList.add('hidden')
    })
  }

  draw()
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
