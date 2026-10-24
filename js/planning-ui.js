// js/planning-ui.js
import { getSemaineKey, getPlanning, assignerRepas, supprimerRepas,
         importerCreneaux, idsDuPlanning, JOURS, MOMENTS } from './planning.js'
import { getRecettes, getRecettesByIds } from './recettes.js'
import { genererCreneaux, getMeteo } from './ai.js'
import { dbEcouter } from './db.js'
import { esc, debounce } from './utils.js'

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
let perimetre = 1  // 1 ou 2 semaines

function getSemaineDecalee(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  return getSemaineKey(d)
}

async function renderGrid() {
  const planning = await getPlanning(semaineKey)
  const labelEl  = document.getElementById('labelSemaine')
  if (labelEl) labelEl.textContent = semaineKey

  // Toutes les recettes de la semaine en une requête
  const recettesMap = await getRecettesByIds(idsDuPlanning(planning))

  const grid = document.getElementById('planningGrid')
  if (!grid) return

  renderListView(planning, recettesMap, grid)
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
            ? `<span class="list-meal-name">${esc(recette.nom)}</span>`
            : `<span class="list-meal-empty">+ Ajouter</span>`
          }
        </div>
        ${recette ? `<div class="list-slot-actions">
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
        window.location.href = `recettes.html?id=${encodeURIComponent(s.id)}&from=planning`
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
        <div class="recipe-card" style="margin-bottom:0.5rem;cursor:pointer;" data-id="${esc(x.id)}">
          <div class="recipe-name">${esc(x.nom)}</div>
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

  async function chargerSlots() {
    const planning1 = await getPlanning(semaineKey)
    const key2      = getSemaineDecalee(semaineOffset + 1)
    const planning2 = perimetre === 2 ? await getPlanning(key2) : null

    // Slots semaine 1
    let s1 = JOURS.flatMap(jour =>
      MOMENTS.filter(m => !planning1[jour]?.[m]?.id).map(m => ({ jour, moment: m, semaine: 1, semaineKeyValue: semaineKey }))
    )
    if (s1.length === 0) s1 = JOURS.flatMap(jour =>
      MOMENTS.map(m => ({ jour, moment: m, semaine: 1, semaineKeyValue: semaineKey }))
    )

    let slots = s1

    if (perimetre === 2 && planning2) {
      let s2 = JOURS.flatMap(jour =>
        MOMENTS.filter(m => !planning2[jour]?.[m]?.id).map(m => ({ jour, moment: m, semaine: 2, semaineKeyValue: key2 }))
      )
      if (s2.length === 0) s2 = JOURS.flatMap(jour =>
        MOMENTS.map(m => ({ jour, moment: m, semaine: 2, semaineKeyValue: key2 }))
      )
      slots = [...s1, ...s2]
    }

    slotsPourGeneration = slots

    // Chips de créneaux
    const chipsWrap = document.getElementById('genSlotChips')
    if (chipsWrap) {
      let html = ''
      if (perimetre === 2) {
        const s1chips = slots.filter(s => s.semaine === 1)
        const s2chips = slots.filter(s => s.semaine === 2)
        html += `<div style="width:100%;font-size:0.72rem;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.25rem;">Semaine 1</div>`
        html += s1chips.map((s, i) =>
          `<button class="chip active" data-slot-idx="${i}">${JOURS_LABEL[s.jour]} ${s.moment === 'midi' ? '☀️' : '🌙'}</button>`
        ).join('')
        html += `<div style="width:100%;font-size:0.72rem;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:0.5rem 0 0.25rem;">Semaine 2 <span style="font-weight:400;opacity:0.7;">(${key2})</span></div>`
        html += s2chips.map((s, i) =>
          `<button class="chip active" data-slot-idx="${s1chips.length + i}">${JOURS_LABEL[s.jour]} ${s.moment === 'midi' ? '☀️' : '🌙'}</button>`
        ).join('')
      } else {
        html = slots.map((s, i) =>
          `<button class="chip active" data-slot-idx="${i}">${JOURS_LABEL[s.jour]} ${s.moment === 'midi' ? '☀️' : '🌙'}</button>`
        ).join('')
      }
      chipsWrap.innerHTML = html
      chipsWrap.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
          chip.classList.toggle('active')
          const count = chipsWrap.querySelectorAll('.chip.active').length
          const genCount = document.getElementById('genCreneauxCount')
          if (genCount) genCount.textContent = count
        })
      })
    }

    const genCount = document.getElementById('genCreneauxCount')
    if (genCount) genCount.textContent = slots.length
  }

  document.getElementById('btnGenererSemaine')?.addEventListener('click', async () => {
    // Reset
    document.getElementById('consignesLibres').value = ''
    modal.querySelectorAll('[data-opt].active').forEach(c => c.classList.remove('active'))
    contraintes = {}
    pourQui = 'deux'
    perimetre = 1
    modal.querySelectorAll('[data-pour]').forEach(c => c.classList.toggle('active', c.dataset.pour === 'deux'))
    modal.querySelectorAll('[data-perimetre]').forEach(c => c.classList.toggle('active', c.dataset.perimetre === '1'))
    document.getElementById('genStatus').textContent = ''

    await chargerSlots()

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

  // ── Périmètre 1 / 2 semaines ──
  modal.querySelectorAll('[data-perimetre]').forEach(chip => {
    chip.addEventListener('click', async () => {
      perimetre = parseInt(chip.dataset.perimetre)
      modal.querySelectorAll('[data-perimetre]').forEach(c => c.classList.remove('active'))
      chip.classList.add('active')
      await chargerSlots()
    })
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

    // Slots actifs (chips sélectionnées)
    const chipsWrap = document.getElementById('genSlotChips')
    const activeIdxs = chipsWrap
      ? [...chipsWrap.querySelectorAll('.chip.active')].map(c => parseInt(c.dataset.slotIdx))
      : slotsPourGeneration.map((_, i) => i)
    const slots = activeIdxs.map(i => slotsPourGeneration[i]).filter(Boolean)

    if (slots.length === 0) {
      if (status) status.textContent = 'Sélectionne au moins un créneau.'
      return
    }

    if (btnLancer) { btnLancer.disabled = true; btnLancer.textContent = '⏳ Génération…' }

    const progressWrap = document.getElementById('genProgressWrap')
    const progressFill = document.getElementById('genProgressFill')
    if (progressWrap) progressWrap.classList.remove('hidden')
    if (progressFill) progressFill.style.width = '0%'
    if (status) status.textContent = `0 / ${slots.length} recettes…`

    try {
      const meteo     = modal._meteo || await getMeteo()
      const consignes = document.getElementById('consignesLibres')?.value.trim() || ''
      const result    = await genererCreneaux(
        { slots, pourQui, meteo, contraintes: { ...contraintes, consignes } },
        (count, total) => {
          const capped = Math.min(count, total)
          if (status)       status.textContent    = `${capped} / ${total} recettes…`
          if (progressFill) progressFill.style.width = (capped / total * 95) + '%'
        }
      )
      await importerCreneaux(result.repas || [], { 1: semaineKey, 2: getSemaineDecalee(semaineOffset + 1) })

      if (progressFill) progressFill.style.width = '100%'
      if (status) status.textContent = `✅ ${slots.length} / ${slots.length} — Terminé !`
      setTimeout(async () => {
        modal.classList.add('hidden')
        slotsPourGeneration = null
        if (progressWrap) progressWrap.classList.add('hidden')
        if (progressFill) progressFill.style.width = '0%'
        await renderGrid()
      }, 900)
    } catch (e) {
      if (progressFill) progressFill.style.width = '0%'
      if (status) status.textContent = `❌ ${e.message}`
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

  // Temps réel : refléter les changements faits depuis l'autre téléphone
  dbEcouter(['planning', 'recettes'], debounce(renderGrid, 300))
})
