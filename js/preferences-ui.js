// js/preferences-ui.js
import { CATEGORIES, getParCategorie } from './data/ingredients.js'
import { setPreference, getANoter, getProgression } from './preferences.js'

let profilActif     = 'dylan'
let categorieActive = Object.keys(CATEGORIES)[0]
let fileAttente     = []

function renderCatChips() {
  const c = document.getElementById('catChips')
  if (!c) return
  c.innerHTML = Object.entries(CATEGORIES).map(([id, cat]) =>
    `<button class="chip ${id === categorieActive ? 'active' : ''}" data-cat="${id}">${cat.emoji} ${cat.label}</button>`
  ).join('')
  c.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      categorieActive = btn.dataset.cat
      renderCatChips()
      chargerFile()
    })
  })
}

function chargerFile() {
  fileAttente = getANoter(profilActif, categorieActive)
  afficherProchain()
  updateProgress()
}

function afficherProchain() {
  const finished = document.getElementById('catFinished')
  const card     = document.getElementById('ingredientCard')
  const btns     = document.getElementById('prefButtons')
  if (!card || !btns || !finished) return
  if (fileAttente.length === 0) {
    card.style.display = 'none'
    btns.style.display = 'none'
    finished.style.display = 'block'
    return
  }
  card.style.display = ''
  btns.style.display = ''
  finished.style.display = 'none'
  const ing = fileAttente[0]
  const cardEmoji = document.getElementById('cardEmoji')
  const cardNom   = document.getElementById('cardNom')
  const cardCat   = document.getElementById('cardCat')
  if (cardEmoji) cardEmoji.textContent = ing.emoji
  if (cardNom)   cardNom.textContent   = ing.nom
  if (cardCat)   cardCat.textContent   = CATEGORIES[ing.categorie]?.label || ''
}

function updateProgress() {
  const ratio = getProgression(profilActif, categorieActive)
  const fill  = document.getElementById('progressFill')
  const label = document.getElementById('progressLabel')
  if (fill)  fill.style.width = `${Math.round(ratio * 100)}%`
  const total = getParCategorie(categorieActive).length
  const done  = Math.round(ratio * total)
  if (label) label.textContent =
    `${CATEGORIES[categorieActive].label} — ${done} / ${total} notés`
}

document.addEventListener('DOMContentLoaded', () => {
  renderCatChips()

  document.querySelectorAll('[data-profil]').forEach(btn => {
    btn.addEventListener('click', () => {
      profilActif = btn.dataset.profil
      document.querySelectorAll('[data-profil]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      chargerFile()
    })
  })

  document.getElementById('prefButtons')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-niveau]')
    if (!btn || fileAttente.length === 0) return
    const ing = fileAttente.shift()
    setPreference(profilActif, ing.id, btn.dataset.niveau)
    afficherProchain()
    updateProgress()
  })

  chargerFile()
})
