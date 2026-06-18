// js/planning-ui.js
import { getSemaineKey, getPlanning, assignerRepas, supprimerRepas,
         importerSemaineIA, importerCreneaux, JOURS, MOMENTS } from './planning.js'
import { getRecettes, addRecette, getRecetteById } from './recettes.js'
import { genererSemaine, genererCreneaux, getMeteo } from './ai.js'

const JOURS_LABEL = { lundi:'Lun', mardi:'Mar', mercredi:'Mer', jeudi:'Jeu',
                      vendredi:'Ven', samedi:'Sam', dimanche:'Dim' }
const JOURS_LABEL_LONG = { lundi:'Lundi', mardi:'Mardi', mercredi:'Mercredi', jeudi:'Jeudi',
                           vendredi:'Vendredi', samedi:'Samedi', dimanche:'Dimanche' }

let semaineOffset = 0
let semaineKey    = getSemaineKey()
let slotEnCours   = null
let pourQui       = 'deux'
let contraintes   = {}
let sansViande    = 0
let sansPoisson   = 0

// ── Mode sélection ──
let modeSelection      = false
let slotsSelectionnes  = new Set()   // clé = "jour|moment"
let slotsPourGeneration = null       // snapshot transmis à la génération

function activerModeSelection() {
  modeSelection = true
  slotsSelectionnes = new Set()
  document.getElementById('modeSelectionToolbar')?.classList.remove('hidden')
  updateSelectionCount()
  renderGrid()
}

function desactiverModeSelection() {
  modeSelection = false
  slotsSelectionnes = new Set()
  document.getElementById('modeSelectionToolbar')?.classList.add('hidden')
  renderGrid()
}

function updateSelectionCount() {
  const n = slotsSelectionnes.size
  const selCount    = document.getElementById('selCount')
  const selCountBtn = document.getElementById('selCountBtn')
  if (selCount)    selCount.textContent    = `${n} créneau${n > 1 ? 'x' : ''} sélectionné${n > 1 ? 's' : ''}`
  if (selCountBtn) selCountBtn.textContent = String(n)
}

function toggleSlot(jour, moment) {
  const key = `${jour}|${moment}`
  if (slotsSelectionnes.has(key)) {
    slotsSelectionnes.delete(key)
  } else {
    slotsSelectionnes.add(key)
  }
  updateSelectionCount()
  // Met à jour visuellement la cellule sans re-render complet
  const grid = document.getElementById('planningGrid')
  const cell = grid?.querySelector(`.planning-cell[data-jour="${jour}"][data-moment="${moment}"]`)
  if (cell) {
    if (slotsSelectionnes.has(key)) {
      cell.classList.add('sel-active')
    } else {
      cell.classList.remove('sel-active')
    }
  }
}

// ── Popover contextuel ──
let popoverEl = null

function creerPopover() {
  const el = document.createElement('div')
  el.className = 'planning-popover'
  el.style.display = 'none'
  document.body.appendChild(el)
  document.addEventListener('click', (e) => {
    if (popoverEl && !popoverEl.contains(e.target)) fermerPopover()
  }, true)
  return el
}

function fermerPopover() {
  if (popoverEl) popoverEl.style.display = 'none'
}

function ouvrirPopover(cellEl, recetteId) {
  if (!popoverEl) popoverEl = creerPopover()
  const rect = cellEl.getBoundingClientRect()

  popoverEl.innerHTML = `
    <button data-action="voir">👁 Voir la recette</button>
    <button data-action="changer">✏️ Changer</button>
    <button data-action="supprimer" class="pop-delete">🗑 Supprimer</button>`

  popoverEl.querySelector('[data-action="voir"]').addEventListener('click', () => {
    fermerPopover()
    window.location.href = `recettes.html?id=${recetteId}&from=planning`
  })
  popoverEl.querySelector('[data-action="changer"]').addEventListener('click', () => {
    fermerPopover()
    ouvrirSelectRecette()
  })
  popoverEl.querySelector('[data-action="supprimer"]').addEventListener('click', async () => {
    fermerPopover()
    await supprimerRepas(semaineKey, slotEnCours.jour, slotEnCours.moment)
    await renderGrid()
  })

  popoverEl.style.display = 'flex'

  // Sur mobile (≤ 640px) le popover est ancré en bas via CSS — pas de positionnement JS
  if (window.innerWidth <= 640) return

  // Desktop : positionner près de la cellule sans déborder de l'écran
  const pw = 160, ph = 110
  let top  = rect.bottom + 4
  let left = rect.left
  if (top + ph > window.innerHeight) top = rect.top - ph - 4
  if (left + pw > window.innerWidth)  left = window.innerWidth - pw - 8
  popoverEl.style.top  = `${top}px`
  popoverEl.style.left = `${left}px`
}

function getSemaineDecalee(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  return getSemaineKey(d)
}

async function renderGrid() {
  const planning = await getPlanning(semaineKey)
  const labelEl  = document.getElementById('labelSemaine')
  if (labelEl) labelEl.textContent = semaineKey

  // Pre-fetch toutes les recettes de la semaine en parallèle
  const ids = [...new Set(
    JOURS.flatMap(j => MOMENTS.map(m => planning[j]?.[m]?.id).filter(Boolean))
  )]
  const recettesArr = await Promise.all(ids.map(id => getRecetteById(id)))
  const recettesMap = Object.fromEntries(ids.map((id, i) => [id, recettesArr[i]]))

  const grid = document.getElementById('planningGrid')
  if (!grid) return

  if (window.innerWidth < 768) {
    renderListView(planning, recettesMap, grid)
  } else {
    renderGridView(planning, recettesMap, grid)
  }
}

function renderGridView(planning, recettesMap, grid) {
  grid.className = 'planning-grid'

  let html = '<div class="planning-header-cell"></div>'
  JOURS.forEach(j => { html += `<div class="planning-header-cell">${JOURS_LABEL[j]}</div>` })

  MOMENTS.forEach(moment => {
    html += `<div class="planning-label-cell"><span>${moment === 'midi' ? '☀️' : '🌙'}</span><span>${moment}</span></div>`
    JOURS.forEach(jour => {
      const slot    = planning[jour]?.[moment]
      const recette = slot?.id ? recettesMap[slot.id] : null
      const key     = `${jour}|${moment}`
      const selClass = modeSelection
        ? ` selection-mode${slotsSelectionnes.has(key) ? ' sel-active' : ''}`
        : ''
      html += `<div class="planning-cell${selClass}" data-jour="${jour}" data-moment="${moment}">`
      if (modeSelection) {
        html += `<div class="planning-cell-checkbox">${slotsSelectionnes.has(key) ? '✓' : ''}</div>`
      }
      html += recette
        ? `<span class="meal-tag" title="${recette.nom}">${recette.nom}</span>`
        : `<span class="meal-empty">+</span>`
      html += `</div>`
    })
  })

  grid.innerHTML = html
  grid.querySelectorAll('.planning-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation()
      const jour   = cell.dataset.jour
      const moment = cell.dataset.moment
      if (modeSelection) { toggleSlot(jour, moment); return }
      slotEnCours = { jour, moment }
      const slot = planning[jour]?.[moment]
      if (slot?.id) { ouvrirPopover(cell, slot.id) } else { fermerPopover(); ouvrirSelectRecette() }
    })
  })
}

function renderListView(planning, recettesMap, grid) {
  grid.className = 'planning-list'

  let html = ''
  for (const jour of JOURS) {
    html += `<div class="planning-list-day">
      <div class="planning-list-day-header">${JOURS_LABEL_LONG[jour]}</div>`
    for (const moment of MOMENTS) {
      const slot    = planning[jour]?.[moment]
      const recette = slot?.id ? recettesMap[slot.id] : null
      html += `<div class="planning-list-slot" data-jour="${jour}" data-moment="${moment}">
        <span class="list-slot-icon">${moment === 'midi' ? '☀️' : '🌙'}</span>
        <span class="list-slot-label">${moment === 'midi' ? 'Midi' : 'Soir'}</span>
        <span class="list-slot-meal">${recette
          ? `<span class="list-meal-name">${recette.nom}</span>`
          : `<span class="list-meal-empty">+ Ajouter</span>`
        }</span>
        ${recette ? '<span class="list-slot-chevron">›</span>' : ''}
      </div>`
    }
    html += '</div>'
  }

  grid.innerHTML = html
  grid.querySelectorAll('.planning-list-slot').forEach(slot => {
    slot.addEventListener('click', (e) => {
      e.stopPropagation()
      const jour   = slot.dataset.jour
      const moment = slot.dataset.moment
      slotEnCours  = { jour, moment }
      const s = planning[jour]?.[moment]
      if (s?.id) { ouvrirPopover(slot, s.id) } else { fermerPopover(); ouvrirSelectRecette() }
    })
  })
}

async function ouvrirSelectRecette() {
  const modal = document.getElementById('modalRecetteSelect')
  const list  = document.getElementById('recetteSelectList')
  if (!modal || !list) return

  const r = await getRecettes()
  list.innerHTML = r.length === 0
    ? '<p class="text-muted text-sm" style="padding:1rem;">Aucune recette — générez-en d\'abord via IA.</p>'
    : r.map(x => `
        <div class="recipe-card" style="margin-bottom:0.5rem;cursor:pointer;" data-id="${x.id}">
          <div class="recipe-name">${x.nom}</div>
          <div class="recipe-meta"><span>⏱ ${x.temps_prep + x.temps_cuisson} min</span>${x.vegetarien ? '<span>🌿</span>' : ''}</div>
        </div>`).join('')

  list.querySelectorAll('[data-id]').forEach(card => {
    card.addEventListener('click', async () => {
      await assignerRepas(semaineKey, slotEnCours.jour, slotEnCours.moment, card.dataset.id, 2)
      modal.classList.add('hidden')
      await renderGrid()
    })
  })
  list.insertAdjacentHTML('beforeend',
    `<button class="btn btn-ghost btn-sm" id="btnViderSlot" style="margin-top:0.5rem;">🗑 Vider ce créneau</button>`)
  document.getElementById('btnViderSlot')?.addEventListener('click', async () => {
    await supprimerRepas(semaineKey, slotEnCours.jour, slotEnCours.moment)
    modal.classList.add('hidden')
    await renderGrid()
  })
  modal.classList.remove('hidden')
}

async function initModalGen() {
  const modal    = document.getElementById('modalGenSemaine')
  const meteoDiv = document.getElementById('meteoDisplay')
  if (!modal) return

  // Bouton "Générer par IA" → active le mode sélection
  document.getElementById('btnGenererSemaine')?.addEventListener('click', () => {
    activerModeSelection()
  })

  // Boutons de sélection rapide
  document.getElementById('selTousMidis')?.addEventListener('click', () => {
    JOURS.forEach(j => slotsSelectionnes.add(`${j}|midi`))
    updateSelectionCount()
    renderGrid()
  })
  document.getElementById('selTousSoirs')?.addEventListener('click', () => {
    JOURS.forEach(j => slotsSelectionnes.add(`${j}|soir`))
    updateSelectionCount()
    renderGrid()
  })
  document.getElementById('selTousRepas')?.addEventListener('click', () => {
    JOURS.forEach(j => MOMENTS.forEach(m => slotsSelectionnes.add(`${j}|${m}`)))
    updateSelectionCount()
    renderGrid()
  })
  document.getElementById('selAucun')?.addEventListener('click', () => {
    slotsSelectionnes.clear()
    updateSelectionCount()
    renderGrid()
  })

  document.getElementById('btnAnnulerSelection')?.addEventListener('click', () => {
    desactiverModeSelection()
  })

  document.getElementById('btnConfirmerSelection')?.addEventListener('click', async () => {
    if (slotsSelectionnes.size === 0) return

    // Convertit le Set en tableau de {jour, moment}
    slotsPourGeneration = [...slotsSelectionnes].map(key => {
      const [jour, moment] = key.split('|')
      return { jour, moment }
    })

    desactiverModeSelection()

    // Met à jour le libellé du bouton de lancement
    const btnLancer = document.getElementById('btnLancerGen')
    if (btnLancer) btnLancer.textContent = `✨ Générer ${slotsPourGeneration.length} repas`

    // Ouvre la modale de configuration
    modal.classList.remove('hidden')
    if (meteoDiv) {
      meteoDiv.innerHTML = '<span class="loader"></span> Récupération météo…'
      const meteo = await getMeteo()
      meteoDiv.innerHTML = `<div class="card" style="padding:0.6rem 0.9rem;display:flex;align-items:center;gap:0.75rem;">
        <span style="font-size:1.5rem;">🌤️</span>
        <div>
          <div class="text-sm" style="font-weight:600;">Vierzon — ${meteo.avgTemp}°C</div>
          <div class="text-xs text-muted">${meteo.description} · ${meteo.saison}</div>
        </div></div>`
      modal._meteo = meteo
    }
  })

  document.getElementById('closeGenSemaine')?.addEventListener('click', () => {
    modal.classList.add('hidden')
    slotsPourGeneration = null
  })

  modal.querySelectorAll('[data-pour]').forEach(chip => {
    chip.addEventListener('click', () => {
      pourQui = chip.dataset.pour
      modal.querySelectorAll('[data-pour]').forEach(c => c.classList.remove('active'))
      chip.classList.add('active')
    })
  })

  modal.querySelectorAll('[data-opt]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active')
      contraintes[chip.dataset.opt] = chip.classList.contains('active')
    })
  })

  // Compteurs sans viande / sans poisson
  function updateCounter(id, val) {
    const el = document.getElementById(id)
    if (el) el.textContent = val
  }
  document.getElementById('btnSansViandeM')?.addEventListener('click', () => {
    sansViande = Math.max(0, sansViande - 1); updateCounter('sansViandeVal', sansViande)
  })
  document.getElementById('btnSansViandePl')?.addEventListener('click', () => {
    const max = slotsPourGeneration ? slotsPourGeneration.length : 14
    sansViande = Math.min(max, sansViande + 1); updateCounter('sansViandeVal', sansViande)
  })
  document.getElementById('btnSansPoissonM')?.addEventListener('click', () => {
    sansPoisson = Math.max(0, sansPoisson - 1); updateCounter('sansPoissonVal', sansPoisson)
  })
  document.getElementById('btnSansPoissonPl')?.addEventListener('click', () => {
    const max = slotsPourGeneration ? slotsPourGeneration.length : 14
    sansPoisson = Math.min(max, sansPoisson + 1); updateCounter('sansPoissonVal', sansPoisson)
  })

  document.getElementById('btnLancerGen')?.addEventListener('click', async () => {
    const status    = document.getElementById('genStatus')
    const btnLancer = document.getElementById('btnLancerGen')
    if (btnLancer) btnLancer.disabled = true
    if (status) status.textContent = '⏳ Génération en cours (30-60s)…'
    try {
      const meteo = modal._meteo || { avgTemp: 20, saison: 'été', description: '' }
      const slots = slotsPourGeneration
      if (!slots) return

      const result = await genererCreneaux({ slots, pourQui, meteo, contraintes: { ...contraintes, sansViande, sansPoisson } })
      await importerCreneaux(semaineKey, result.repas, addRecette)

      modal.classList.add('hidden')
      slotsPourGeneration = null
      await renderGrid()
      if (status) status.textContent = ''
      // Réinitialise le libellé du bouton
      if (btnLancer) btnLancer.textContent = '✨ Générer les repas sélectionnés'
    } catch (e) {
      if (status) status.textContent = `Erreur : ${e.message}`
    } finally {
      if (btnLancer) btnLancer.disabled = false
    }
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  await renderGrid()
  await initModalGen()
  document.getElementById('btnPrevWeek')?.addEventListener('click', async () => {
    semaineOffset--
    semaineKey = getSemaineDecalee(semaineOffset)
    await renderGrid()
  })
  document.getElementById('btnNextWeek')?.addEventListener('click', async () => {
    semaineOffset++
    semaineKey = getSemaineDecalee(semaineOffset)
    await renderGrid()
  })
  document.getElementById('closeRecetteSelect')?.addEventListener('click', () =>
    document.getElementById('modalRecetteSelect')?.classList.add('hidden'))
})
