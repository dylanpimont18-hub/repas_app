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
