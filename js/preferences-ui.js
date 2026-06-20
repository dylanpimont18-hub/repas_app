// js/preferences-ui.js
import { CATEGORIES } from './data/ingredients.js'
import { getAllParCategorie, addCustomIngredient, getCustomIngredients, removeCustomIngredient } from './custom-ingredients.js'
import { setPreference, getANoter, getProgression, getProfil } from './preferences.js'

let profilActif     = 'dylan'
let categorieActive = Object.keys(CATEGORIES)[0]
let fileAttente     = []
let vueActive       = localStorage.getItem('repas_pref_view_mode') || 'cartes'
let tableClickHandler = null

const NIVEAUX = [
  { id: 'j_aime_pas', label: '✗ Non',    cls: 'active-naime'  },
  { id: 'neutre',     label: '○ Neutre', cls: 'active-neutre' },
  { id: 'j_aime',     label: '♥ J\'aime', cls: 'active-aime'   },
  { id: 'j_adore',    label: '★ J\'adore', cls: 'active-adore'  },
]

function renderCatChips() {
  const c = document.getElementById('catChips')
  if (!c) return
  c.innerHTML = Object.entries(CATEGORIES).map(([id, cat]) =>
    `<button class="chip ${id === categorieActive ? 'active' : ''}" data-cat="${id}">${cat.emoji} ${cat.label}</button>`
  ).join('')
  c.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', async () => {
      categorieActive = btn.dataset.cat
      renderCatChips()
      await chargerFile()
    })
  })
}

async function chargerFile() {
  fileAttente = await getANoter(profilActif, categorieActive)
  afficherProchain()
  await updateProgress()
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
  const ing       = fileAttente[0]
  const cardEmoji = document.getElementById('cardEmoji')
  const cardNom   = document.getElementById('cardNom')
  const cardCat   = document.getElementById('cardCat')
  if (cardEmoji) cardEmoji.textContent = ing.emoji
  if (cardNom)   cardNom.textContent   = ing.nom
  if (cardCat)   cardCat.textContent   = (ing.custom ? '✦ Personnalisé · ' : '') + (CATEGORIES[ing.categorie]?.label || '')
}

async function updateProgress() {
  const ratio = await getProgression(profilActif, categorieActive)
  const fill  = document.getElementById('progressFill')
  const label = document.getElementById('progressLabel')
  if (fill)  fill.style.width = `${Math.round(ratio * 100)}%`
  const all  = getAllParCategorie(categorieActive)
  const done = Math.round(ratio * all.length)
  if (label) label.textContent =
    `${CATEGORIES[categorieActive].label} — ${done} / ${all.length} notés`
}

async function renderTableau() {
  const profil = await getProfil(profilActif)
  const table  = document.getElementById('prefTable')
  if (!table) return

  let html = `<thead><tr>
    <th style="min-width:160px;">Ingrédient</th>
    ${NIVEAUX.map(n => `<th>${n.label}</th>`).join('')}
    <th></th>
  </tr></thead><tbody>`

  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    const ings = getAllParCategorie(catId)
    if (!ings.length) continue
    html += `<tr class="cat-header"><td colspan="${2 + NIVEAUX.length}">${cat.emoji} ${cat.label}</td></tr>`
    for (const ing of ings) {
      const niveauActuel = profil[ing.id] || null
      html += `<tr data-ing-id="${ing.id}">`
      html += `<td><span class="ing-name"><span>${ing.emoji}</span><span>${ing.nom}</span>${ing.custom ? ' <span class="custom-badge">✦</span>' : ''}</span></td>`
      for (const n of NIVEAUX) {
        const actif = niveauActuel === n.id
        html += `<td style="text-align:center;"><button class="pref-radio-btn ${actif ? n.cls : ''}" data-ing="${ing.id}" data-niveau="${n.id}">${actif ? '●' : '○'}</button></td>`
      }
      html += `<td>${ing.custom ? `<button class="pref-delete-btn" data-del="${ing.id}" title="Supprimer">✕</button>` : ''}</td>`
      html += `</tr>`
    }
  }
  html += '</tbody>'
  table.innerHTML = html

  if (tableClickHandler) table.removeEventListener('click', tableClickHandler)
  tableClickHandler = async (e) => {
    // Suppression d'un ingrédient custom
    const delBtn = e.target.closest('.pref-delete-btn')
    if (delBtn) {
      if (!confirm(`Supprimer cet ingrédient personnalisé ?`)) return
      removeCustomIngredient(delBtn.dataset.del)
      await renderTableau()
      return
    }

    const btn = e.target.closest('.pref-radio-btn')
    if (!btn) return
    const ingId  = btn.dataset.ing
    const niveau = btn.dataset.niveau
    const row    = table.querySelector(`tr[data-ing-id="${ingId}"]`)
    if (!row) return

    const niveauDef = NIVEAUX.find(x => x.id === niveau)
    const estActif  = niveauDef && btn.classList.contains(niveauDef.cls)
    if (estActif) {
      await setPreference(profilActif, ingId, null)
    } else {
      await setPreference(profilActif, ingId, niveau)
    }

    row.querySelectorAll('.pref-radio-btn').forEach(b => {
      const n = NIVEAUX.find(x => x.id === b.dataset.niveau)
      if (!n) return
      b.className = 'pref-radio-btn'
      b.textContent = '○'
    })
    if (!estActif) {
      const activeCls = NIVEAUX.find(x => x.id === niveau)?.cls
      btn.classList.add(activeCls)
      btn.textContent = '●'
    }
  }
  table.addEventListener('click', tableClickHandler)
}

function basculerVue(vue) {
  vueActive = vue
  localStorage.setItem('repas_pref_view_mode', vue)
  document.getElementById('vueCartes').style.display  = vue === 'cartes'  ? '' : 'none'
  document.getElementById('vueTableau').style.display = vue === 'tableau' ? '' : 'none'
  document.getElementById('btnVueCartes').classList.toggle('active',  vue === 'cartes')
  document.getElementById('btnVueTableau').classList.toggle('active', vue === 'tableau')
}

// ── Modal ajout ingrédient ───────────────────────────────────────────────────

function ouvrirModalAjout() {
  const overlay = document.getElementById('modalAddIng')
  if (!overlay) return
  overlay.classList.remove('hidden')
  document.getElementById('addIngNom')?.focus()
}

function fermerModalAjout() {
  const overlay = document.getElementById('modalAddIng')
  if (!overlay) return
  overlay.classList.add('hidden')
  document.getElementById('addIngForm')?.reset()
}

async function soumettreAjoutIngredient(e) {
  e.preventDefault()
  const nom      = document.getElementById('addIngNom').value.trim()
  const categorie= document.getElementById('addIngCat').value
  const emoji    = document.getElementById('addIngEmoji').value.trim() || CATEGORIES[categorie]?.emoji || '🍽️'
  if (!nom) return

  addCustomIngredient({ nom, categorie, emoji })
  fermerModalAjout()

  // Rafraîchir la vue active
  await chargerFile()
  if (vueActive === 'tableau') await renderTableau()

  // Rafraîchir le badge nav
  await refreshNavBadge()
}

async function refreshNavBadge() {
  const navLink = document.querySelector('.nav-links a[href="preferences.html"]')
  if (!navLink) return
  const existing = navLink.querySelector('.nav-badge')
  if (existing) existing.remove()

  try {
    const { getTotalANoter } = await import('./preferences.js')
    const [nd, nf] = await Promise.all([getTotalANoter('dylan'), getTotalANoter('femme')])
    const total = nd + nf
    if (total > 0) {
      const badge = document.createElement('span')
      badge.className = 'nav-badge'
      badge.textContent = total
      navLink.appendChild(badge)
    }
  } catch { /* silently ignore */ }
}

// ── Swipe sur la carte d'ingrédient ──────────────────────────────────────────

function initSwipeGesture() {
  const card = document.getElementById('ingredientCard')
  if (!card) return

  const THRESHOLD = 55
  const DIRECTION_NIVEAU = { right: 'j_adore', left: 'j_aime_pas', up: 'j_aime', down: 'neutre' }

  const indicators = {
    right: creerIndicateur('swipe-indicator swipe-indicator-right', "❤️ J'adore"),
    left:  creerIndicateur('swipe-indicator swipe-indicator-left',  '✗ Non'),
    up:    creerIndicateur('swipe-indicator swipe-indicator-up',    '♥ J\'aime'),
    down:  creerIndicateur('swipe-indicator swipe-indicator-down',  '○ Neutre'),
  }
  Object.values(indicators).forEach(el => card.appendChild(el))

  function creerIndicateur(cls, texte) {
    const el = document.createElement('div')
    el.className = cls
    el.textContent = texte
    return el
  }

  function getDirection(dx, dy) {
    const ax = Math.abs(dx), ay = Math.abs(dy)
    if (ax < 8 && ay < 8) return null
    if (ax > ay) return dx > 0 ? 'right' : 'left'
    return dy < 0 ? 'up' : 'down'
  }

  function showIndicator(dir, strength) {
    for (const [d, el] of Object.entries(indicators)) {
      el.style.opacity = (d === dir && strength > 20) ? Math.min(1, (strength - 20) / 35) : 0
    }
  }

  function hideIndicators() {
    Object.values(indicators).forEach(el => { el.style.opacity = 0 })
  }

  let startX = 0, startY = 0, active = false

  card.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    active = true
    card.style.transition = 'none'
  }, { passive: true })

  card.addEventListener('touchmove', e => {
    if (!active) return
    const dx = e.touches[0].clientX - startX
    const dy = e.touches[0].clientY - startY
    const dir = getDirection(dx, dy)
    const strength = Math.max(Math.abs(dx), Math.abs(dy))
    card.style.transform = `translate(${dx * 0.25}px, ${dy * 0.25}px) rotate(${(dx / 300) * 15}deg)`
    showIndicator(dir, strength)
  }, { passive: true })

  card.addEventListener('touchend', async e => {
    if (!active) return
    active = false
    const dx = e.changedTouches[0].clientX - startX
    const dy = e.changedTouches[0].clientY - startY
    const dir = getDirection(dx, dy)
    const strength = Math.max(Math.abs(dx), Math.abs(dy))

    card.style.transition = 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.28s ease'
    hideIndicators()

    if (dir && strength > THRESHOLD && fileAttente.length > 0) {
      const out = { right: ['120%','0','20deg'], left: ['-120%','0','-20deg'], up: ['0','-120%','0deg'], down: ['0','120%','0deg'] }[dir]
      card.style.transform = `translate(${out[0]}, ${out[1]}) rotate(${out[2]})`
      card.style.opacity = '0'

      await new Promise(r => setTimeout(r, 280))

      const ing = fileAttente.shift()
      await setPreference(profilActif, ing.id, DIRECTION_NIVEAU[dir])
      await updateProgress()

      card.style.transition = 'none'
      card.style.transform = ''
      card.style.opacity = '1'
      afficherProchain()
    } else {
      card.style.transform = ''
    }
  })

  // Hint une seule fois
  if (!localStorage.getItem('repas_swipe_hint_seen')) {
    const hint = document.createElement('p')
    hint.className = 'swipe-hint'
    hint.textContent = '← Glisser pour noter · ↑ J\'aime · ↓ Neutre →'
    card.parentElement.insertBefore(hint, card)
    localStorage.setItem('repas_swipe_hint_seen', '1')
    hint.addEventListener('animationend', () => hint.remove())
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  renderCatChips()

  document.querySelectorAll('[data-profil]').forEach(btn => {
    btn.addEventListener('click', async () => {
      profilActif = btn.dataset.profil
      document.querySelectorAll('[data-profil]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      await chargerFile()
      if (vueActive === 'tableau') await renderTableau()
    })
  })

  document.getElementById('prefButtons')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-niveau]')
    if (!btn || fileAttente.length === 0) return
    const ing = fileAttente.shift()
    await setPreference(profilActif, ing.id, btn.dataset.niveau)
    afficherProchain()
    await updateProgress()
  })

  document.getElementById('btnVueCartes')?.addEventListener('click', () => basculerVue('cartes'))
  document.getElementById('btnVueTableau')?.addEventListener('click', async () => {
    basculerVue('tableau')
    await renderTableau()
  })

  // Ajout ingrédient
  document.getElementById('btnAddIng')?.addEventListener('click', ouvrirModalAjout)
  document.getElementById('modalAddIngClose')?.addEventListener('click', fermerModalAjout)
  document.getElementById('modalAddIngClose2')?.addEventListener('click', fermerModalAjout)
  document.getElementById('modalAddIng')?.addEventListener('click', e => { if (e.target.id === 'modalAddIng') fermerModalAjout() })
  document.getElementById('addIngForm')?.addEventListener('submit', soumettreAjoutIngredient)

  // Remplir le select des catégories
  const catSelect = document.getElementById('addIngCat')
  if (catSelect) {
    catSelect.innerHTML = Object.entries(CATEGORIES)
      .map(([id, cat]) => `<option value="${id}">${cat.emoji} ${cat.label}</option>`)
      .join('')
    catSelect.value = categorieActive
  }

  basculerVue(vueActive)
  await chargerFile()
  if (vueActive === 'tableau') await renderTableau()
  initSwipeGesture()
})
