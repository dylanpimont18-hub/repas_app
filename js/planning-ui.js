// js/planning-ui.js
import { getSemaineKey, getPlanning, assignerRepas, supprimerRepas,
         importerCreneaux, JOURS, MOMENTS } from './planning.js'
import { getRecettes, addRecette, getRecetteById } from './recettes.js'
import { genererCreneaux, getMeteo } from './ai.js'

const JOURS_LABEL = { lundi:'Lun', mardi:'Mar', mercredi:'Mer', jeudi:'Jeu',
                      vendredi:'Ven', samedi:'Sam', dimanche:'Dim' }
const JOURS_LABEL_LONG = { lundi:'Lundi', mardi:'Mardi', mercredi:'Mercredi', jeudi:'Jeudi',
                           vendredi:'Vendredi', samedi:'Samedi', dimanche:'Dimanche' }

let semaineOffset = 0
let semaineKey    = getSemaineKey()
let slotEnCours   = null
let pourQui       = 'deux'
let contraintes   = {}

function getDatesDeSemaine(key) {
  const [yr, wk] = key.split('-W')
  const year = parseInt(yr, 10), week = parseInt(wk, 10)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const lundi = new Date(jan4)
  lundi.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7)
  const dates = {}
  JOURS.forEach((j, i) => {
    const d = new Date(lundi)
    d.setUTCDate(lundi.getUTCDate() + i)
    dates[j] = `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`
  })
  return dates
}

let slotsPourGeneration = null

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
  const dates = getDatesDeSemaine(semaineKey)

  let html = '<div class="planning-header-cell"></div>'
  JOURS.forEach(j => { html += `<div class="planning-header-cell">${JOURS_LABEL[j]}<span class="planning-header-date">${dates[j]}</span></div>` })

  MOMENTS.forEach(moment => {
    html += `<div class="planning-label-cell"><span>${moment === 'midi' ? '☀️' : '🌙'}</span><span>${moment}</span></div>`
    JOURS.forEach(jour => {
      const slot    = planning[jour]?.[moment]
      const recette = slot?.id ? recettesMap[slot.id] : null
      html += `<div class="planning-cell" data-jour="${jour}" data-moment="${moment}">`
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
      slotEnCours = { jour, moment }
      const slot = planning[jour]?.[moment]
      if (slot?.id) { ouvrirPopover(cell, slot.id) } else { fermerPopover(); ouvrirSelectRecette() }
    })
  })
}

function renderListView(planning, recettesMap, grid) {
  grid.className = 'planning-list'
  const dates = getDatesDeSemaine(semaineKey)

  let html = ''
  for (const jour of JOURS) {
    html += `<div class="planning-list-day">
      <div class="planning-list-day-header">
        ${JOURS_LABEL_LONG[jour]}
        <span class="planning-header-date">${dates[jour]}</span>
      </div>`
    for (const moment of MOMENTS) {
      const slot    = planning[jour]?.[moment]
      const recette = slot?.id ? recettesMap[slot.id] : null
      html += `<div class="planning-list-slot" data-jour="${jour}" data-moment="${moment}">
        <span class="list-slot-icon">${moment === 'midi' ? '☀️' : '🌙'}</span>
        <div class="list-slot-content">
          <span class="list-slot-label">${moment === 'midi' ? 'Midi' : 'Soir'}</span>
          ${recette
            ? `<span class="list-meal-name">${recette.nom}</span>`
            : `<span class="list-meal-empty">+ Ajouter</span>`
          }
        </div>
        ${!modeSelection && recette ? `<div class="list-slot-actions">
          <button class="list-act-btn" data-action="changer" data-jour="${jour}" data-moment="${moment}" title="Changer">✏️</button>
          <button class="list-act-btn list-act-del" data-action="supprimer" data-jour="${jour}" data-moment="${moment}" title="Supprimer">🗑</button>
        </div>` : ''}
      </div>`
    }
    html += '</div>'
  }

  grid.innerHTML = html

  grid.querySelectorAll('.planning-list-slot').forEach(slotEl => {
    slotEl.addEventListener('click', async (e) => {
      if (e.target.closest('.list-act-btn')) return
      e.stopPropagation()
      const jour   = slotEl.dataset.jour
      const moment = slotEl.dataset.moment
      slotEnCours = { jour, moment }
      const s = planning[jour]?.[moment]
      if (s?.id) {
        window.location.href = `recettes.html?id=${s.id}&from=planning`
      } else {
        ouvrirSelectRecette()
      }
    })
  })

  grid.querySelectorAll('.list-act-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const action = btn.dataset.action
      const jour   = btn.dataset.jour
      const moment = btn.dataset.moment
      slotEnCours  = { jour, moment }
      if (action === 'changer') {
        ouvrirSelectRecette()
      } else if (action === 'supprimer') {
        await supprimerRepas(semaineKey, jour, moment)
        await renderGrid()
      }
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

  document.getElementById('btnGenererSemaine')?.addEventListener('click', async () => {
    // Sélectionne tous les créneaux vides de la semaine
    const planning = await getPlanning(semaineKey)
    slotsPourGeneration = JOURS.flatMap(jour =>
      MOMENTS.filter(m => !planning[jour]?.[m]?.id).map(m => ({ jour, moment: m }))
    )
    if (slotsPourGeneration.length === 0) slotsPourGeneration =
      JOURS.flatMap(jour => MOMENTS.map(m => ({ jour, moment: m })))

    // Reset et titre
    document.getElementById('consignesLibres').value = ''
    modal.querySelectorAll('[data-opt].active').forEach(c => c.classList.remove('active'))
    contraintes = {}
    pourQui = 'deux'
    modal.querySelectorAll('[data-pour]').forEach(c => c.classList.toggle('active', c.dataset.pour === 'deux'))
    const genCount = document.getElementById('genCreneauxCount')
    if (genCount) genCount.textContent = slotsPourGeneration.length

    // Ouvre et charge la météo
    modal.classList.remove('hidden')
    if (meteoDiv) {
      meteoDiv.innerHTML = '<span class="text-xs text-muted">⏳ Récupération météo…</span>'
      const meteo = await getMeteo()
      meteoDiv.innerHTML = `<div class="gen-meteo-card">
        <span class="gen-meteo-icon">🌤️</span>
        <div>
          <div class="text-sm" style="font-weight:600;">Vierzon · ${meteo.avgTemp}°C</div>
          <div class="text-xs text-muted">${meteo.description} · ${meteo.saison}</div>
        </div>
      </div>`
      modal._meteo = meteo
    }
  })

  document.getElementById('closeGenSemaine')?.addEventListener('click', () => {
    modal.classList.add('hidden'); slotsPourGeneration = null
  })

  // ── Pour qui ──
  modal.querySelectorAll('[data-pour]').forEach(chip => {
    chip.addEventListener('click', () => {
      pourQui = chip.dataset.pour
      modal.querySelectorAll('[data-pour]').forEach(c => c.classList.remove('active'))
      chip.classList.add('active')
    })
  })

  // ── Options ──
  modal.querySelectorAll('[data-opt]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active')
      contraintes[chip.dataset.opt] = chip.classList.contains('active')
    })
  })

  // ── Lancer la génération ──
  document.getElementById('btnLancerGen')?.addEventListener('click', async () => {
    const status    = document.getElementById('genStatus')
    const btnLancer = document.getElementById('btnLancerGen')
    if (btnLancer) { btnLancer.disabled = true; btnLancer.textContent = '⏳ Génération…' }
    if (status) status.textContent = "L'IA prépare tes repas (30-60s)…"
    try {
      const meteo = modal._meteo || { avgTemp: 20, saison: 'été', description: '' }
      const slots = slotsPourGeneration
      if (!slots) return

      const consignes = document.getElementById('consignesLibres')?.value.trim() || ''
      const result = await genererCreneaux({ slots, pourQui, meteo, contraintes: { ...contraintes, consignes } })
      await importerCreneaux(semaineKey, result.repas, addRecette)

      modal.classList.add('hidden')
      slotsPourGeneration = null
      await renderGrid()
      if (status) status.textContent = ''
    } catch (e) {
      if (status) status.textContent = `Erreur : ${e.message}`
    } finally {
      if (btnLancer) { btnLancer.disabled = false; btnLancer.textContent = '✨ Générer les repas' }
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
