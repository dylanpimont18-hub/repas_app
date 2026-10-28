// js/courses-ui.js — Liste de courses : coche instantanée (état local), lignes entières tactiles, hors-ligne, partage
import { listeCourses, getEtatCourses, toggleCourse, envoyerFileCourses, fileCourses, resetCourses,
         ajouterArticle, supprimerArticle, basculerPlacard } from './courses.js'
import { debutCycle, decalerCycle, cleCycle, labelCycle } from './cycle.js'
import { dbEcouter } from './db.js'
import { esc, debounce, combinerQuantites, ORDRE_RAYONS, texteCourses } from './utils.js'
import { icone } from './icones.js'
import { confirmer, informer, signalerErreur } from './dialogue.js'

let samedi          = debutCycle()
let liste           = null   // { parties, auPlacard } du cycle affiché
let etat            = {}     // { cleEtat: true } cases cochées
let acheteesOuverte = false
let placardOuvert   = false
let partieAjout     = 'samedi'   // partie où vont les articles ajoutés à la main
const mesEcritures  = new Map()  // cleEtat → { checked, t } : écho temps réel de nos propres coches, ignoré

const PARTIES = [
  { id: 'samedi',   icone: 'panier',  titre: 'Samedi, au magasin', court: 'Samedi', sous: 'Samedi soir → mardi (dont la session du dimanche)' },
  { id: 'mercredi', icone: 'voiture', titre: 'Mercredi, en drive', court: 'Mercredi', sous: 'Mercredi → samedi midi (dont la session du mercredi)' },
]

const cle = () => cleCycle(samedi)
const coche = item => !!etat[item.cleEtat]

// ── Chargement (réseau) : liste et cases ; l'affichage, lui, ne fait aucune requête ──
let chargement = null, aRecharger = false
async function charger({ listeAussi = true } = {}) {
  if (chargement) { aRecharger = true; return chargement }
  chargement = (async () => {
    do {
      aRecharger = false
      try {
        const k = cle()
        const [l, e] = await Promise.all([listeAussi || !liste ? listeCourses(samedi, k) : liste, getEtatCourses(k)])
        liste = l; etat = e
        afficher()
      } catch (err) {
        if (!liste) document.getElementById('coursesList').innerHTML = `<p class="text-muted">Impossible de charger la liste : ${esc(err.message)}</p>`
        console.error('Courses', err)
      }
    } while (aRecharger)
  })()
  try { await chargement } finally { chargement = null }
}

function htmlItem(item, partie) {
  const id = `c-${partie}-${item.cleEtat}`.replace(/[^\w-]/g, '_')
  const qte = combinerQuantites(item.quantites, item.nom)
  const action = item.libreId
    ? `<button class="courses-item-action" data-supprimer="${esc(item.libreId)}" aria-label="Supprimer ${esc(item.nom)}">${icone('croix')}</button>`
    : `<button class="courses-item-action" data-placard="${esc(item.nom)}" aria-label="${esc(item.nom)} : toujours au placard" title="Toujours au placard">${icone('boite')}</button>`
  return `<div class="courses-item${coche(item) ? ' checked' : ''}" data-cle-etat="${esc(item.cleEtat)}">
    <label class="courses-item-zone" for="${id}">
      <input type="checkbox" id="${id}" data-cle-etat="${esc(item.cleEtat)}" ${coche(item) ? 'checked' : ''}>
      <span class="courses-item-label">${esc(item.nom)}</span>
      <span class="courses-item-qty">${esc(qte)}</span>
    </label>
    ${action}
  </div>`
}

function afficher() {
  const labelEl = document.getElementById('labelSemaineCourses')
  if (labelEl) labelEl.textContent = labelCycle(samedi)
  const list = document.getElementById('coursesList')
  if (!list || !liste) return
  const { parties, auPlacard } = liste

  // À acheter (par partie puis rayon) ; achetés : repliés, aussi par partie
  const achetees = { samedi: [], mercredi: [] }
  const htmlActifs = PARTIES.map(partie => {
    const groupes = parties[partie.id] || {}
    const actifs = {}
    let total = 0
    ORDRE_RAYONS.forEach(cat => (groupes[cat] || []).forEach(item => {
      total++
      if (coche(item)) achetees[partie.id].push(item)
      else (actifs[cat] ||= []).push(item)
    }))
    if (!total) return ''
    const rayons = ORDRE_RAYONS.filter(cat => actifs[cat]?.length)
    const reste = rayons.reduce((n, cat) => n + actifs[cat].length, 0)
    return `<section class="courses-partie" aria-labelledby="titre-${partie.id}">
      <h2 class="courses-partie-titre" id="titre-${partie.id}">${icone(partie.icone)}${partie.titre}
        <span class="courses-compteur">${reste ? `${reste} à prendre` : `${icone('check')}tout est pris`}</span>
        <span class="text-xs text-muted courses-partie-sous">${partie.sous}</span></h2>
      ${rayons.map(cat => `
      <div class="courses-group">
        <h3 class="courses-group-title">${cat}</h3>
        ${actifs[cat].map(item => htmlItem(item, partie.id)).join('')}
      </div>`).join('')}
    </section>`
  }).join('')

  const nbAchetees = achetees.samedi.length + achetees.mercredi.length
  const htmlAchetees = nbAchetees ? `
    <section class="courses-achetees">
      <button class="courses-repli" data-ouvrir-achetees aria-expanded="${acheteesOuverte}" aria-controls="coursesAcheteesBody">
        <span>${icone('check')}Déjà pris (${nbAchetees})</span>${icone(acheteesOuverte ? 'haut' : 'bas')}
      </button>
      <div id="coursesAcheteesBody" class="${acheteesOuverte ? '' : 'hidden'}">
        ${PARTIES.filter(p => achetees[p.id].length).map(p => `
          <h3 class="courses-group-title">${icone(p.icone)}${p.court}</h3>
          ${achetees[p.id].map(item => htmlItem(item, p.id)).join('')}`).join('')}
      </div>
    </section>` : ''

  // Toujours au placard : hors liste, rappel replié pour vérifier qu'il en reste
  const htmlPlacard = auPlacard.length ? `
    <section class="courses-placard">
      <button class="courses-repli" data-ouvrir-placard aria-expanded="${placardOuvert}">
        <span>${icone('boite')}Au placard (${auPlacard.length}) <span class="text-xs text-muted">vérifie qu'il en reste</span></span>${icone(placardOuvert ? 'haut' : 'bas')}
      </button>
      ${placardOuvert ? `<div class="courses-placard-corps">${auPlacard.map(item => `
        <div class="courses-placard-item">
          <span>${esc(item.nom)}${item.stock ? `<span class="text-xs text-muted courses-stock">à la maison : ${esc(item.stock)}</span>` : ''}</span>
          <span class="courses-item-qty">${esc(combinerQuantites(item.quantites, item.nom))}</span>
          ${item.stock ? '<a class="btn btn-ghost btn-sm" href="placard.html">Placard</a>'
            : `<button class="btn btn-ghost btn-sm" data-deplacard="${esc(item.nom)}">Remettre dans la liste</button>`}
        </div>`).join('')}</div>` : ''}
    </section>` : ''

  const enAttente = fileCourses().filter(f => f.cle === cle()).length
  list.innerHTML = (enAttente ? `<p class="courses-attente" role="status">${icone('horsligne')}${enAttente} coche(s) en attente du réseau</p>` : '')
    + ((htmlActifs || htmlAchetees || htmlPlacard) ? htmlActifs + htmlAchetees + htmlPlacard
      : `<div class="etat-vide"><p>Aucun repas planifié sur ce cycle.</p><a class="btn btn-primary btn-sm" href="planning.html">${icone('calendrier')}Remplir le planning</a></div>`)
  initSwipe()
}

// ── Cocher : mise à jour immédiate à l'écran, envoi en arrière-plan ──
async function basculerCoche(cleEtat, checked) {
  const avant = etat[cleEtat]
  etat[cleEtat] = checked
  mesEcritures.set(cleEtat, { checked, t: Date.now() })
  // Le focus passe à l'article suivant de la liste (la ligne cochée part dans « Déjà pris »)
  const lignes = [...document.querySelectorAll('#coursesList input[type="checkbox"]')]
  const index = lignes.findIndex(cb => cb.dataset.cleEtat === cleEtat)
  const avaitFocus = document.activeElement?.dataset?.cleEtat === cleEtat
  afficher()
  if (avaitFocus) {
    const apres = [...document.querySelectorAll('#coursesList input[type="checkbox"]')]
    ;(apres[Math.min(index, apres.length - 1)] || document.getElementById('champArticle'))?.focus()
  }
  try {
    const r = await toggleCourse(cle(), cleEtat, checked)
    if (r === 'en_attente') afficher()
  } catch (e) {
    etat[cleEtat] = avant
    afficher()
    signalerErreur(e, 'Case non enregistrée')
  }
}

// Glisser une ligne : à gauche = pris, à droite (dans « Déjà pris ») = à reprendre
function initSwipe() {
  const SEUIL = 65
  document.querySelectorAll('#coursesList .courses-item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]')
    if (!cb) return
    const bg = document.createElement('div')
    bg.className = 'courses-item-swipe-bg'
    bg.innerHTML = icone(cb.checked ? 'annuler' : 'check')
    item.appendChild(bg)
    let x0 = 0, y0 = 0, actif = false, verrouille = false, horizontal = false
    item.addEventListener('touchstart', e => {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY
      actif = true; verrouille = false; horizontal = false
      item.style.transition = 'none'
    }, { passive: true })
    item.addEventListener('touchmove', e => {
      if (!actif) return
      const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0
      if (!verrouille) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        horizontal = Math.abs(dx) > Math.abs(dy); verrouille = true
      }
      if (!horizontal || (!cb.checked && dx >= 0) || (cb.checked && dx <= 0)) return
      const d = cb.checked ? Math.min(dx * 0.65, 110) : Math.max(dx * 0.65, -110)
      item.style.transform = `translateX(${d}px)`
      bg.style.opacity = Math.min(1, Math.abs(d) / SEUIL)
    }, { passive: true })
    item.addEventListener('touchend', e => {
      if (!actif || !horizontal) { actif = false; return }
      actif = false
      const dx = e.changedTouches[0].clientX - x0
      const declenche = cb.checked ? dx > SEUIL : dx < -SEUIL
      item.style.transition = 'transform 0.2s ease'
      bg.style.opacity = 0
      item.style.transform = ''
      if (declenche) basculerCoche(cb.dataset.cleEtat, !cb.checked)
    })
  })
}

// Partager la liste (drive, notes, message) ; sinon copiée dans le presse-papiers
async function partager(seulement) {
  if (!liste) return
  const texte = `Courses · ${labelCycle(samedi)}\n\n${texteCourses(liste.parties, { coche, seulement })}`
  try {
    if (navigator.share) await navigator.share({ title: 'Liste de courses', text: texte })
    else { await navigator.clipboard.writeText(texte); informer('Liste copiée : colle-la dans ton appli de drive ou tes notes.', { type: 'ok' }) }
  } catch (e) {
    if (e?.name === 'AbortError') return
    try { await navigator.clipboard.writeText(texte); informer('Liste copiée.', { type: 'ok' }) } catch { signalerErreur(e, 'Partage') }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await envoyerFileCourses().catch(() => 0)
  await charger()

  const list = document.getElementById('coursesList')
  list?.addEventListener('change', e => {
    const cb = e.target.closest('input[type="checkbox"][data-cle-etat]')
    if (cb) basculerCoche(cb.dataset.cleEtat, cb.checked)
  })
  list?.addEventListener('click', async e => {
    const b = e.target.closest('[data-supprimer], [data-placard], [data-deplacard], [data-ouvrir-placard], [data-ouvrir-achetees]')
    if (!b) return
    if (b.dataset.ouvrirAchetees !== undefined) { acheteesOuverte = !acheteesOuverte; afficher(); return list.querySelector('[data-ouvrir-achetees]')?.focus() }
    if (b.dataset.ouvrirPlacard !== undefined) { placardOuvert = !placardOuvert; afficher(); return list.querySelector('[data-ouvrir-placard]')?.focus() }
    try {
      if (b.dataset.supprimer) await supprimerArticle(b.dataset.supprimer)
      else if (b.dataset.placard) {
        await basculerPlacard(b.dataset.placard, true)
        informer(`« ${b.dataset.placard} » ne sera plus dans la liste (rappel dans « Au placard »).`, {
          action: { label: 'Annuler', faire: async () => { await basculerPlacard(b.dataset.placard, false); await charger() } } })
      }
      else if (b.dataset.deplacard) await basculerPlacard(b.dataset.deplacard, false)
    } catch (err) { signalerErreur(err, 'Courses') }
    await charger()
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
      for (const nom of noms) await ajouterArticle(cle(), nom, partieAjout)
      champ.value = ''
    } catch (err) { signalerErreur(err, 'Ajout') }
    await charger()
  })

  // Réinitialiser les cases
  document.getElementById('btnResetCourses')?.addEventListener('click', async () => {
    if (!await confirmer('Toutes les cases de ce cycle seront décochées.', { titre: 'Réinitialiser les courses ?', ok: 'Réinitialiser', danger: true })) return
    try { await resetCourses(cle()); etat = {}; afficher() } catch (err) { signalerErreur(err, 'Réinitialisation') }
  })

  // Impression de la liste (mise en page dédiée dans components.css, @media print)
  document.getElementById('btnImprimer')?.addEventListener('click', () => {
    const el = document.getElementById('impressionCycle')
    if (el) el.textContent = `Cycle du ${labelCycle(samedi)}`
    window.print()
  })
  document.getElementById('btnPartager')?.addEventListener('click', () => partager(null))
  document.getElementById('btnPartagerDrive')?.addEventListener('click', () => partager('mercredi'))

  // Navigation entre cycles
  const changerCycle = n => { samedi = decalerCycle(samedi, n); liste = null; etat = {}; charger() }
  document.getElementById('btnPrevCycle')?.addEventListener('click', () => changerCycle(-1))
  document.getElementById('btnNextCycle')?.addEventListener('click', () => changerCycle(1))

  // Retour du réseau : on envoie les coches en attente
  window.addEventListener('online', async () => {
    const n = await envoyerFileCourses().catch(() => 0)
    if (n) informer(`${n} coche(s) envoyée(s).`, { type: 'ok' })
    charger({ listeAussi: false })
  })

  // Temps réel : cases cochées par l'autre (nos propres coches sont ignorées), ou planning / recettes modifiés
  const rechargerCases = debounce(() => charger({ listeAussi: false }), 300)
  dbEcouter(['courses_etat'], payload => {
    const ligne = payload.new || {}
    const mienne = mesEcritures.get(ligne.ingredient_nom)
    if (mienne && mienne.checked === ligne.checked && Date.now() - mienne.t < 10000) return
    rechargerCases()
  })
  dbEcouter(['courses_libres', 'planning', 'recettes', 'reglages'], debounce(() => charger(), 400))
})
