// js/dashboard.js
import { getRecettes }                       from './recettes.js'
import { getPlanning, getSemaineKey, JOURS } from './planning.js'
import { getRecetteById }                    from './recettes.js'

const JOURS_LABEL = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
  vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}
const JOURS_LABEL_LONG = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}
const JOURS_JS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

document.addEventListener('DOMContentLoaded', async () => {
  const recettes   = await getRecettes()
  const tileCount  = document.getElementById('tileRecettesCount')
  if (tileCount) tileCount.textContent = `${recettes.length} recette${recettes.length !== 1 ? 's' : ''}`

  const semaineKey = getSemaineKey()
  const planning   = await getPlanning(semaineKey)

  // Pre-fetch toutes les recettes du planning en parallèle
  const ids = [...new Set(
    JOURS.flatMap(j => ['midi','soir'].map(m => planning[j]?.[m]?.id).filter(Boolean))
  )]
  const recettesArr = await Promise.all(ids.map(id => getRecetteById(id)))
  const recettesMap = Object.fromEntries(ids.map((id, i) => [id, recettesArr[i]]))

  // Jour actuel
  const jourAujourdhui = JOURS_JS[new Date().getDay()]
  const repasAujourdhui = {
    midi: planning[jourAujourdhui]?.midi?.id ? recettesMap[planning[jourAujourdhui].midi.id] : null,
    soir: planning[jourAujourdhui]?.soir?.id ? recettesMap[planning[jourAujourdhui].soir.id] : null,
  }

  // ── Carte "Ce soir / Aujourd'hui" en évidence ──
  const subtitle = document.getElementById('dashSubtitle')
  if (subtitle) {
    const nomJour = JOURS_LABEL_LONG[jourAujourdhui] || ''
    if (repasAujourdhui.soir) {
      subtitle.textContent = `${nomJour} — Ce soir : ${repasAujourdhui.soir.nom}`
    } else if (repasAujourdhui.midi) {
      subtitle.textContent = `${nomJour} — Midi : ${repasAujourdhui.midi.nom}`
    } else {
      subtitle.textContent = `${nomJour} — Aucun repas planifié ce soir`
    }
  }

  // Bannière "Ce soir" cliquable si une recette existe
  const ceSoirContainer = document.getElementById('dashCeSoir')
  if (ceSoirContainer) {
    if (repasAujourdhui.soir) {
      const r = repasAujourdhui.soir
      ceSoirContainer.innerHTML = `
        <a href="recettes.html?id=${r.id}&from=dashboard" class="card" style="display:flex;align-items:center;gap:1rem;padding:1rem;text-decoration:none;color:inherit;border-left:4px solid var(--color-primary);margin-bottom:1.5rem;">
          <span style="font-size:1.75rem;">🌙</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted);margin-bottom:0.2rem;">Ce soir</div>
            <div style="font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.nom}</div>
            <div style="font-size:0.78rem;color:var(--color-text-muted);">⏱ ${r.temps_prep + r.temps_cuisson} min${r.vegetarien ? ' · 🌿' : ''}</div>
          </div>
          <span style="color:var(--color-primary);font-size:1rem;">›</span>
        </a>`
    } else if (repasAujourdhui.midi && !repasAujourdhui.soir) {
      // Midi planifié mais pas le soir
      const r = repasAujourdhui.midi
      ceSoirContainer.innerHTML = `
        <div class="card" style="display:flex;align-items:center;gap:1rem;padding:1rem;border-left:4px solid var(--color-accent);margin-bottom:1.5rem;opacity:0.85;">
          <span style="font-size:1.75rem;">☀️</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted);margin-bottom:0.2rem;">Midi aujourd'hui</div>
            <div style="font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.nom}</div>
          </div>
        </div>`
    } else {
      ceSoirContainer.innerHTML = `
        <a href="planning.html" class="card" style="display:flex;align-items:center;gap:1rem;padding:1rem;text-decoration:none;color:inherit;border-left:4px solid var(--color-border);margin-bottom:1.5rem;opacity:0.7;">
          <span style="font-size:1.75rem;">🌙</span>
          <div style="flex:1;">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted);margin-bottom:0.2rem;">Ce soir</div>
            <div style="font-size:0.88rem;color:var(--color-text-muted);">Aucun repas planifié → Ajouter</div>
          </div>
          <span style="color:var(--color-primary);font-size:1rem;">›</span>
        </a>`
    }
  }

  // ── Grille de la semaine ──
  const dashSemaine = document.getElementById('dashSemaine')
  if (dashSemaine) {
    dashSemaine.innerHTML = JOURS.map(jour => {
      const midi      = planning[jour]?.midi?.id ? recettesMap[planning[jour].midi.id] : null
      const soir      = planning[jour]?.soir?.id ? recettesMap[planning[jour].soir.id] : null
      const estAujourdhui = jour === jourAujourdhui
      return `
        <div class="card" style="padding:0.75rem;${estAujourdhui ? 'border-color:var(--color-primary);border-width:2px;' : ''}">
          <div style="font-size:0.75rem;font-weight:700;margin-bottom:0.4rem;${estAujourdhui ? 'color:var(--color-primary);' : 'color:var(--color-text-muted);'}">${JOURS_LABEL[jour]}${estAujourdhui ? ' ·' : ''}</div>
          <div class="text-xs" style="margin-bottom:0.2rem;">☀️ ${midi ? midi.nom : '<span style="opacity:0.4">—</span>'}</div>
          <div class="text-xs">🌙 ${soir ? soir.nom : '<span style="opacity:0.4">—</span>'}</div>
        </div>`
    }).join('')
  }
})
