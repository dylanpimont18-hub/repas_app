// js/courses-ui.js
import { genererListeCourses, getEtatCourses, toggleCourse, resetCourses } from './courses.js'
import { getSemaineKey } from './planning.js'

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
  const semaineKey = getSemaineKey()
  const labelEl    = document.getElementById('labelSemaineCourses')
  if (labelEl) labelEl.textContent = semaineKey

  const groupes = await genererListeCourses(semaineKey)
  const etat    = getEtatCourses()

  const html = ORDRE.filter(cat => groupes[cat]?.length).map(cat => `
    <div class="courses-group">
      <div class="courses-group-title">${ICONE[cat]} ${cat}</div>
      ${groupes[cat].map(item => {
        const k = item.nom.toLowerCase().trim()
        return `<div class="courses-item${etat[k] ? ' checked' : ''}">
          <input type="checkbox" ${etat[k] ? 'checked' : ''} data-nom="${item.nom}">
          <span class="courses-item-label">${item.nom}</span>
          <span class="courses-item-qty">${item.quantites.map(q => q.valeur).join(' + ')}</span>
        </div>`
      }).join('')}
    </div>`).join('')

  const list = document.getElementById('coursesList')
  if (list) {
    list.innerHTML = html || '<p class="text-muted">Aucun repas planifié cette semaine.</p>'
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', async () => { toggleCourse(cb.dataset.nom); await render() })
    })
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await render()
  document.getElementById('btnResetCourses')?.addEventListener('click', async () => {
    if (confirm('Réinitialiser les cases à cocher ?')) { resetCourses(); await render() }
  })
})
