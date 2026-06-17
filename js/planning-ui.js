// js/planning-ui.js
import { getSemaineKey, getPlanning, assignerRepas, supprimerRepas,
         importerSemaineIA, JOURS, MOMENTS } from './planning.js'
import { getRecettes, addRecette, getRecetteById } from './recettes.js'
import { genererSemaine, getMeteo }               from './ai.js'

const JOURS_LABEL = { lundi:'Lun', mardi:'Mar', mercredi:'Mer', jeudi:'Jeu',
                      vendredi:'Ven', samedi:'Sam', dimanche:'Dim' }

let semaineOffset = 0
let semaineKey    = getSemaineKey()
let slotEnCours   = null
let pourQui       = 'deux'
let contraintes   = {}

function getSemaineDecalee(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  return getSemaineKey(d)
}

function renderGrid() {
  const planning = getPlanning(semaineKey)
  const grid     = document.getElementById('planningGrid')
  if (!grid) return
  document.getElementById('labelSemaine').textContent = semaineKey

  let html = '<div class="planning-header-cell"></div>'
  JOURS.forEach(j => { html += `<div class="planning-header-cell">${JOURS_LABEL[j]}</div>` })

  MOMENTS.forEach(moment => {
    html += `<div class="planning-label-cell"><span>${moment === 'midi' ? '☀️' : '🌙'}</span><span>${moment}</span></div>`
    JOURS.forEach(jour => {
      const slot    = planning[jour]?.[moment]
      const recette = slot?.id ? getRecetteById(slot.id) : null
      html += `<div class="planning-cell" data-jour="${jour}" data-moment="${moment}">`
      html += recette
        ? `<span class="meal-tag" title="${recette.nom}">${recette.nom}</span>`
        : `<span class="meal-empty">+</span>`
      html += `</div>`
    })
  })

  grid.innerHTML = html
  grid.querySelectorAll('.planning-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      slotEnCours = { jour: cell.dataset.jour, moment: cell.dataset.moment }
      ouvrirSelectRecette()
    })
  })
}

function ouvrirSelectRecette() {
  const modal = document.getElementById('modalRecetteSelect')
  const list  = document.getElementById('recetteSelectList')
  if (!modal || !list) return
  const r = getRecettes()
  list.innerHTML = r.length === 0
    ? '<p class="text-muted text-sm" style="padding:1rem;">Aucune recette — générez-en d\'abord via IA.</p>'
    : r.map(x => `
        <div class="recipe-card" style="margin-bottom:0.5rem;cursor:pointer;" data-id="${x.id}">
          <div class="recipe-name">${x.nom}</div>
          <div class="recipe-meta"><span>⏱ ${x.temps_prep + x.temps_cuisson} min</span>${x.vegetarien ? '<span>🌿</span>' : ''}</div>
        </div>`).join('')
  list.querySelectorAll('[data-id]').forEach(card => {
    card.addEventListener('click', () => {
      assignerRepas(semaineKey, slotEnCours.jour, slotEnCours.moment, card.dataset.id, 2)
      modal.classList.add('hidden')
      renderGrid()
    })
  })
  list.insertAdjacentHTML('beforeend',
    `<button class="btn btn-ghost btn-sm" id="btnViderSlot" style="margin-top:0.5rem;">🗑 Vider ce créneau</button>`)
  document.getElementById('btnViderSlot')?.addEventListener('click', () => {
    supprimerRepas(semaineKey, slotEnCours.jour, slotEnCours.moment)
    modal.classList.add('hidden')
    renderGrid()
  })
  modal.classList.remove('hidden')
}

async function initModalGen() {
  const modal    = document.getElementById('modalGenSemaine')
  const meteoDiv = document.getElementById('meteoDisplay')
  if (!modal) return

  document.getElementById('btnGenererSemaine')?.addEventListener('click', async () => {
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

  document.getElementById('closeGenSemaine')?.addEventListener('click', () => modal.classList.add('hidden'))

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

  document.getElementById('btnLancerGen')?.addEventListener('click', async () => {
    const status    = document.getElementById('genStatus')
    const btnLancer = document.getElementById('btnLancerGen')
    if (btnLancer) btnLancer.disabled = true
    if (status) status.textContent = '⏳ Génération en cours (30-60s)…'
    try {
      const meteo  = modal._meteo || { avgTemp: 20, saison: getSemaineKey() ? 'été' : 'été', description: '' }
      const result = await genererSemaine({ pourQui, meteo, contraintes })
      importerSemaineIA(semaineKey, result.semaine, addRecette)
      modal.classList.add('hidden')
      renderGrid()
      if (status) status.textContent = ''
    } catch (e) {
      if (status) status.textContent = `Erreur : ${e.message}`
    } finally {
      if (btnLancer) btnLancer.disabled = false
    }
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  renderGrid()
  await initModalGen()
  document.getElementById('btnPrevWeek')?.addEventListener('click', () => {
    semaineOffset--
    semaineKey = getSemaineDecalee(semaineOffset)
    renderGrid()
  })
  document.getElementById('btnNextWeek')?.addEventListener('click', () => {
    semaineOffset++
    semaineKey = getSemaineDecalee(semaineOffset)
    renderGrid()
  })
  document.getElementById('closeRecetteSelect')?.addEventListener('click', () =>
    document.getElementById('modalRecetteSelect')?.classList.add('hidden'))
})
