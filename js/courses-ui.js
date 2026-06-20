// js/courses-ui.js
import { genererListeCourses, getEtatCourses, toggleCourse, resetCourses } from './courses.js'
import { getSemaineKey } from './planning.js'
import { supabase } from './db.js'

let rendering = false
let acheteesOuverte = false

const ORDRE = ['Fruits & Légumes','Viandes & Poissons','Féculents','Laitiers & Œufs','Épicerie & Condiments','Divers']
const ICONE = {
  'Fruits & Légumes':      '🥬',
  'Viandes & Poissons':    '🥩',
  'Féculents':             '🍚',
  'Laitiers & Œufs':       '🥛',
  'Épicerie & Condiments': '🌿',
  'Divers':                '🛒',
}

async function render() {
  if (rendering) return
  rendering = true
  const semaineKey = getSemaineKey()
  const labelEl    = document.getElementById('labelSemaineCourses')
  if (labelEl) labelEl.textContent = semaineKey

  const groupes = await genererListeCourses(semaineKey)
  const etat    = await getEtatCourses(semaineKey)

  // Séparer les items actifs des items achetés
  const actifs   = {}  // { cat: [item, ...] }
  const achetees = []  // liste plate des items cochés

  ORDRE.forEach(cat => {
    if (!groupes[cat]?.length) return
    groupes[cat].forEach(item => {
      const k = item.nom.toLowerCase().trim()
      if (etat[k]) {
        achetees.push(item)
      } else {
        if (!actifs[cat]) actifs[cat] = []
        actifs[cat].push(item)
      }
    })
  })

  // HTML des items actifs groupés par catégorie
  const htmlActifs = ORDRE.filter(cat => actifs[cat]?.length).map(cat => `
    <div class="courses-group">
      <div class="courses-group-title">${ICONE[cat]} ${cat}</div>
      ${actifs[cat].map(item => {
        const k = item.nom.toLowerCase().trim()
        return `<div class="courses-item">
          <input type="checkbox" data-nom="${item.nom}" data-checked="false">
          <span class="courses-item-label">${item.nom}</span>
          <span class="courses-item-qty">${item.quantites.map(q => q.valeur).join(' + ')}</span>
        </div>`
      }).join('')}
    </div>`).join('')

  // HTML de la section Achetées (restaure l'état ouvert/fermé)
  const htmlAchetees = achetees.length ? `
    <div id="coursesAchetees">
      <div id="coursesAcheteesHeader">
        <span>✓ Achetées (<span id="coursesAcheteesCount">${achetees.length}</span>)</span>
        <span id="coursesAcheteesToggle">${acheteesOuverte ? '▲' : '▼'}</span>
      </div>
      <div id="coursesAcheteesBody" class="${acheteesOuverte ? '' : 'hidden'}">
        ${achetees.map(item => `
          <div class="courses-achetee-item">
            <input type="checkbox" checked data-nom="${item.nom}" data-checked="true">
            <span>${item.nom}</span>
            <span class="courses-item-qty">${item.quantites.map(q => q.valeur).join(' + ')}</span>
          </div>`).join('')}
      </div>
    </div>` : ''

  const list = document.getElementById('coursesList')
  if (list) {
    if (!htmlActifs && !htmlAchetees) {
      list.innerHTML = '<p class="text-muted">Aucun repas planifié cette semaine.</p>'
    } else {
      list.innerHTML = htmlActifs + htmlAchetees
    }

    // Événements checkbox items actifs
    list.querySelectorAll('input[type="checkbox"][data-checked="false"]').forEach(cb => {
      cb.addEventListener('change', async () => {
        try {
          await toggleCourse(semaineKey, cb.dataset.nom, true)
        } catch (e) {
          alert('Erreur : ' + e.message)
          cb.checked = false
          return
        }
        await render()
      })
    })

    // Événements checkbox items achetés (décocher = remettre en actif)
    list.querySelectorAll('input[type="checkbox"][data-checked="true"]').forEach(cb => {
      cb.addEventListener('change', async () => {
        try {
          await toggleCourse(semaineKey, cb.dataset.nom, false)
        } catch (e) {
          alert('Erreur : ' + e.message)
          cb.checked = true
          return
        }
        await render()
      })
    })

    initSwipeCourses(semaineKey)

    // Toggle section Achetées
    const header = document.getElementById('coursesAcheteesHeader')
    if (header) {
      header.addEventListener('click', () => {
        acheteesOuverte = !acheteesOuverte
        const body   = document.getElementById('coursesAcheteesBody')
        const toggle = document.getElementById('coursesAcheteesToggle')
        body.classList.toggle('hidden', !acheteesOuverte)
        toggle.textContent = acheteesOuverte ? '▲' : '▼'
      })
    }
  }
  rendering = false
}

function initSwipeCourses(semaineKey) {
  const THRESHOLD = 65

  document.querySelectorAll('.courses-item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]')
    if (!cb) return

    // Injecter le fond visuel
    const bg = document.createElement('div')
    bg.className = 'courses-item-swipe-bg'
    bg.textContent = cb.dataset.checked === 'false' ? '✓' : '↩'
    item.appendChild(bg)

    let startX = 0, startY = 0, active = false, directionLocked = false, isHorizontal = false

    item.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      active = true
      directionLocked = false
      isHorizontal = false
      item.style.transition = 'none'
    }, { passive: true })

    item.addEventListener('touchmove', e => {
      if (!active) return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY

      if (!directionLocked) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        isHorizontal = Math.abs(dx) > Math.abs(dy)
        directionLocked = true
      }
      if (!isHorizontal) return

      const isActiveItem = cb.dataset.checked === 'false'
      // Actif : swipe gauche seulement | Acheté : swipe droite seulement
      if (isActiveItem && dx >= 0) return
      if (!isActiveItem && dx <= 0) return

      const clampedDx = isActiveItem
        ? Math.max(dx * 0.65, -110)
        : Math.min(dx * 0.65, 110)

      item.style.transform = `translateX(${clampedDx}px)`
      const progress = Math.min(1, Math.abs(clampedDx) / THRESHOLD)
      bg.style.opacity = progress
    }, { passive: true })

    item.addEventListener('touchend', async e => {
      if (!active || !isHorizontal) { active = false; return }
      active = false
      const dx = e.changedTouches[0].clientX - startX
      const isActiveItem = cb.dataset.checked === 'false'
      const triggered = isActiveItem ? dx < -THRESHOLD : dx > THRESHOLD

      item.style.transition = 'transform 0.22s ease, opacity 0.22s ease'
      bg.style.opacity = 0

      if (triggered) {
        const outX = isActiveItem ? '-110%' : '110%'
        item.style.transform = `translateX(${outX})`
        item.style.opacity = '0'
        await new Promise(r => setTimeout(r, 220))
        try {
          await toggleCourse(semaineKey, cb.dataset.nom, isActiveItem)
        } catch {}
        await render()
      } else {
        item.style.transform = ''
      }
    })
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  await render()

  // Bouton réinitialiser
  document.getElementById('btnResetCourses')?.addEventListener('click', async () => {
    if (confirm('Réinitialiser les cases à cocher ?')) {
      const semaineKey = getSemaineKey()
      await resetCourses(semaineKey)
      await render()
    }
  })

  // Abonnement Supabase Realtime — re-render à chaque changement sur courses_etat
  supabase
    .channel('courses_etat')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courses_etat' }, () => render())
    .subscribe()
})
