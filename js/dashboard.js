// js/dashboard.js
import { getRecettes }                       from './recettes.js'
import { getPlanning, getSemaineKey, JOURS } from './planning.js'
import { getRecetteById }                    from './recettes.js'

const JOURS_LABEL = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
  vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}

document.addEventListener('DOMContentLoaded', () => {
  const count    = getRecettes().length
  const tileCount = document.getElementById('tileRecettesCount')
  if (tileCount) tileCount.textContent = `${count} recette${count !== 1 ? 's' : ''}`

  const semaineKey = getSemaineKey()
  const planning   = getPlanning(semaineKey)

  const dashSemaine = document.getElementById('dashSemaine')
  if (dashSemaine) {
    dashSemaine.innerHTML = JOURS.map(jour => {
      const midi = planning[jour]?.midi?.id ? getRecetteById(planning[jour].midi.id) : null
      const soir = planning[jour]?.soir?.id ? getRecetteById(planning[jour].soir.id) : null
      return `
        <div class="card" style="padding:0.75rem;">
          <div class="text-xs text-muted" style="font-weight:700;margin-bottom:0.4rem;">${JOURS_LABEL[jour]}</div>
          <div class="text-xs" style="margin-bottom:0.2rem;">☀️ ${midi ? midi.nom : '—'}</div>
          <div class="text-xs">🌙 ${soir ? soir.nom : '—'}</div>
        </div>`
    }).join('')
  }
})
