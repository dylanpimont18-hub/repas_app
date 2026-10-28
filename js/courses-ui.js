// js/courses-ui.js
import { listeCourses, getEtatCourses, toggleCourse, resetCourses, ajouterArticle, supprimerArticle, basculerPlacard } from './courses.js'
import { debutCycle, decalerCycle, cleCycle, labelCycle } from './cycle.js'
import { dbEcouter } from './db.js'
import { esc, debounce, combinerQuantites } from './utils.js'
import { icone } from './icones.js'

let enCours         = null   // rendu en cours (Promise)
let aRefaire        = false  // un changement est arrivé pendant le rendu
let acheteesOuverte = false
let placardOuvert   = false
let partieAjout     = 'samedi'   // partie où vont les articles ajoutés à la main
let samedi          = debutCycle()

const PARTIES = [
  { id: 'samedi',   icone: 'panier',  titre: 'Samedi, au magasin', sous: 'Samedi soir → mardi (dont la session du dimanche)' },
  { id: 'mercredi', icone: 'voiture', titre: 'Mercredi, en drive', sous: 'Mercredi → samedi midi (dont la session du mercredi)' },
]

// Évite les rendus concurrents sans perdre de mise à jour : si un rendu est en cours,
// on en programme un nouveau juste après au lieu d'ignorer l'événement
async function render() {
  if (enCours) { aRefaire = true; return enCours }
  enCours = (async () => {
    do {
      aRefaire = false
      try { await renderUneFois() } catch (e) { console.error('Rendu courses', e) }
    } while (aRefaire)
  })()
  try { await enCours } finally { enCours = null }
}

const ORDRE = ['Fruits & Légumes','Viandes & Poissons','Féculents','Laitiers & Œufs','Épicerie & Condiments','Divers']

async function renderUneFois() {
  const semaineKey = cleCycle(samedi)
  const labelEl    = document.getElementById('labelSemaineCourses')
  if (labelEl) labelEl.textContent = labelCycle(samedi)

  const [{ parties, auPlacard }, etat] = await Promise.all([listeCourses(samedi, semaineKey), getEtatCourses(semaineKey)])
  // Article à la main : on peut le supprimer ; ingrédient de recette : on peut le dire toujours au placard
  const actionItem = item => item.libreId
    ? `<button class="courses-item-action" data-supprimer="${esc(item.libreId)}" aria-label="Supprimer ${esc(item.nom)}">${icone('croix')}</button>`
    : `<button class="courses-item-action" data-placard="${esc(item.nom)}" aria-label="${esc(item.nom)} : toujours au placard" title="Toujours au placard">${icone('boite')}</button>`

  // Séparer les items actifs (par partie puis rayon) des items achetés
  const achetees = []
  const htmlActifs = PARTIES.map(partie => {
    const groupes = parties[partie.id]
    const actifs  = {}
    ORDRE.forEach(cat => (groupes[cat] || []).forEach(item => {
      if (etat[item.nom.toLowerCase().trim()]) achetees.push(item)
      else (actifs[cat] ||= []).push(item)
    }))
    const rayons = ORDRE.filter(cat => actifs[cat]?.length)
    if (!rayons.length) return ''
    return `<div class="courses-partie">
      <div class="courses-partie-titre">${icone(partie.icone)}${partie.titre}<div class="text-xs text-muted">${partie.sous}</div></div>
      ${rayons.map(cat => `
      <div class="courses-group">
        <div class="courses-group-title">${cat}</div>
        ${actifs[cat].map(item => `<div class="courses-item">
            <input type="checkbox" data-nom="${esc(item.nom)}" data-checked="false">
            <span class="courses-item-label">${esc(item.nom)}</span>
            <span class="courses-item-qty">${esc(combinerQuantites(item.quantites, item.nom))}</span>
            ${actionItem(item)}
          </div>`).join('')}
      </div>`).join('')}
    </div>`
  }).join('')

  // HTML de la section Achetées (restaure l'état ouvert/fermé)
  const htmlAchetees = achetees.length ? `
    <div id="coursesAchetees">
      <div id="coursesAcheteesHeader">
        <span>${icone('check')}Achetées (<span id="coursesAcheteesCount">${achetees.length}</span>)</span>
        <span id="coursesAcheteesToggle">${acheteesOuverte ? '▲' : '▼'}</span>
      </div>
      <div id="coursesAcheteesBody" class="${acheteesOuverte ? '' : 'hidden'}">
        ${achetees.map(item => `
          <div class="courses-achetee-item">
            <input type="checkbox" checked data-nom="${esc(item.nom)}" data-checked="true">
            <span>${esc(item.nom)}</span>
            <span class="courses-item-qty">${esc(combinerQuantites(item.quantites, item.nom))}</span>
          </div>`).join('')}
      </div>
    </div>` : ''

  // Toujours au placard : hors liste, rappel replié pour vérifier qu'il en reste
  const htmlPlacard = auPlacard.length ? `
    <div class="courses-placard">
      <button class="courses-placard-entete" data-ouvrir-placard aria-expanded="${placardOuvert}">
        <span>${icone('boite')}Au placard (${auPlacard.length}) <span class="text-xs text-muted">vérifie qu'il en reste</span></span>
        <span>${placardOuvert ? '▲' : '▼'}</span>
      </button>
      ${placardOuvert ? `<div class="courses-placard-corps">${auPlacard.map(item => `
        <div class="courses-placard-item">
          <span>${esc(item.nom)}</span>
          <span class="courses-item-qty">${esc(combinerQuantites(item.quantites, item.nom))}</span>
          <button class="btn btn-ghost btn-sm" data-deplacard="${esc(item.nom)}">Remettre dans la liste</button>
        </div>`).join('')}</div>` : ''}
    </div>` : ''

  const list = document.getElementById('coursesList')
  if (list) {
    if (!htmlActifs && !htmlAchetees && !htmlPlacard) {
      list.innerHTML = '<p class="text-muted">Aucun repas planifié sur ce cycle.</p>'
    } else {
      list.innerHTML = htmlActifs + htmlAchetees + htmlPlacard
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
}

function initSwipeCourses(semaineKey) {
  const THRESHOLD = 65

  document.querySelectorAll('.courses-item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]')
    if (!cb) return

    // Injecter le fond visuel
    const bg = document.createElement('div')
    bg.className = 'courses-item-swipe-bg'
    bg.innerHTML = icone(cb.dataset.checked === 'false' ? 'check' : 'annuler')
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

  // Actions sur les articles (délégation : la liste est redessinée à chaque changement)
  document.getElementById('coursesList')?.addEventListener('click', async e => {
    const b = e.target.closest('[data-supprimer], [data-placard], [data-deplacard], [data-ouvrir-placard]')
    if (!b) return
    try {
      if (b.dataset.supprimer) await supprimerArticle(b.dataset.supprimer)
      else if (b.dataset.placard) await basculerPlacard(b.dataset.placard, true)
      else if (b.dataset.deplacard) await basculerPlacard(b.dataset.deplacard, false)
      else placardOuvert = !placardOuvert
    } catch (err) { alert('Erreur : ' + err.message) }
    await render()
  })

  // Ajouter un article à la main dans la partie choisie
  const formAjout = document.getElementById('formArticle')
  const majParties = () => formAjout?.querySelectorAll('[data-partie]').forEach(b => {
    b.classList.toggle('active', b.dataset.partie === partieAjout)
    b.setAttribute('aria-pressed', b.dataset.partie === partieAjout)
  })
  majParties()
  formAjout?.addEventListener('click', e => {
    const b = e.target.closest('[data-partie]'); if (!b) return
    partieAjout = b.dataset.partie
    majParties()
  })
  formAjout?.addEventListener('submit', async e => {
    e.preventDefault()
    const champ = document.getElementById('champArticle')
    const noms = champ.value.split(',').map(n => n.trim()).filter(Boolean)
    if (!noms.length) return
    try {
      for (const nom of noms) await ajouterArticle(cleCycle(samedi), nom, partieAjout)
      champ.value = ''
    } catch (err) { alert('Erreur : ' + err.message) }
    await render()
  })

  // Bouton réinitialiser
  document.getElementById('btnResetCourses')?.addEventListener('click', async () => {
    if (confirm('Réinitialiser les cases à cocher ?')) {
      await resetCourses(cleCycle(samedi))
      await render()
    }
  })

  // Impression de la liste (mise en page dédiée dans components.css, @media print)
  document.getElementById('btnImprimer')?.addEventListener('click', () => {
    const el = document.getElementById('impressionCycle')
    if (el) el.textContent = `Cycle du ${labelCycle(samedi)}`
    window.print()
  })

  // Navigation entre cycles
  document.getElementById('btnPrevCycle')?.addEventListener('click', () => { samedi = decalerCycle(samedi, -1); render() })
  document.getElementById('btnNextCycle')?.addEventListener('click', () => { samedi = decalerCycle(samedi, 1); render() })

  // Temps réel : cases cochées par l'autre, ou planning / recettes modifiés
  dbEcouter(['courses_etat', 'courses_libres', 'planning', 'recettes', 'reglages'], debounce(render, 300))
})
