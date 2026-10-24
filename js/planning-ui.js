// js/planning-ui.js — Planning par cycle (samedi soir → samedi midi), groupé par session de cuisine
import { enregistrerCreneaux, viderCreneaux } from './planning.js'
import { debutCycle, decalerCycle, labelCycle, groupesDuCycle, labelCreneau } from './cycle.js'
import { FILTRES } from './filtres.js'
import { chargerDonnees, lireFiltres, memoriserFiltres, proposerPourCreneau,
         remplirDepuisBibliotheque, completerParIA, ideeIA } from './propositions.js'
import { dbEcouter } from './db.js'
import { esc, debounce } from './utils.js'
import { icone } from './icones.js'

let samedi  = debutCycle()
let donnees = null
let creneauEnCours = null

const SOURCES = { biblio: ['livre', 'biblio'], ia: ['etincelle', 'IA'], reste: ['boite', 'reste'], reserve: ['flocon', 'congélo'], manuel: ['', ''] }

const ecranLarge = window.matchMedia('(min-width: 1024px)')
const JOUR_COURT = { lundi:'Lun', mardi:'Mar', mercredi:'Mer', jeudi:'Jeu', vendredi:'Ven', samedi:'Sam', dimanche:'Dim' }

function badgePortions(c, portions) {
  return `${icone(portions <= 1 ? 'personne' : 'famille')}${portions}`
}

// Contenu d'un créneau (identique sur mobile et sur la frise ordinateur ; seule la mise en page change)
function htmlCreneau(c, { avecJour = true } = {}) {
  const occ = donnees.occupation[c.cle]
  const recette = occ ? donnees.recettesMap[occ.id] : null
  const [ico, label] = SOURCES[occ?.source] || SOURCES.manuel
  const moment = `${icone(c.moment === 'midi' ? 'soleil' : 'lune')}${avecJour ? `${JOUR_COURT[c.jour]} ` : ''}${c.moment}`
  return `<div class="slot${recette ? '' : ' slot-libre'}" data-cle="${esc(c.cle)}">
    <div class="slot-ligne">
      <span class="slot-moment">${moment}</span>
      <button class="portions-badge" data-action="portions" data-cle="${esc(c.cle)}" title="Changer les portions" aria-label="Portions : ${occ?.portions ?? c.portions}">${badgePortions(c, occ?.portions ?? c.portions)}</button>
      ${label ? `<span class="source-tag source-${esc(occ.source)}">${icone(ico)}<span class="source-txt">${label}</span></span>` : ''}
      ${recette ? `<span class="slot-actions">
        <button class="slot-btn" data-action="suivant" data-cle="${esc(c.cle)}" title="Autre proposition" aria-label="Autre proposition">${icone('autre')}</button>
        <button class="slot-btn" data-action="changer" data-cle="${esc(c.cle)}" title="Choisir un plat" aria-label="Choisir un plat">${icone('crayon')}</button>
        <button class="slot-btn slot-btn-del" data-action="supprimer" data-cle="${esc(c.cle)}" title="Vider" aria-label="Vider">${icone('poubelle')}</button>
      </span>` : ''}
    </div>
    ${recette ? `<div class="slot-nom">${esc(recette.nom)}</div>` : `<div class="slot-vide">${icone('plus')}Choisir un plat</div>`}
  </div>`
}

// Mobile : liste groupée par session de cuisine
function htmlListe() {
  return groupesDuCycle(donnees.creneaux).map(g => `
    <section class="cycle-groupe${g.enSession ? ' cycle-groupe-session' : ''}">
      <h2 class="cycle-groupe-titre">${g.enSession ? icone('marmite') : ''}${esc(g.titre)}</h2>
      ${g.creneaux.map(c => htmlCreneau(c)).join('')}
    </section>`).join('')
}

// Ordinateur : frise du cycle — une colonne par jour, bandeaux des sessions de cuisine au-dessus
function htmlFrise() {
  const jours = []
  for (const c of donnees.creneaux) {
    const cle = c.date.getTime()
    let j = jours.find(x => x.cle === cle)
    if (!j) { j = { cle, date: c.date, jour: c.jour, creneaux: {} }; jours.push(j) }
    j.creneaux[c.moment] = c
  }
  const col = i => `grid-column:${i + 2}`
  // Bandeaux : jours consécutifs préparés par la même session
  const bandes = []
  jours.forEach((j, i) => {
    const c = j.creneaux.soir || j.creneaux.midi
    const cle = c.enSession ? `session-${c.cuisineLe}` : `place-${i}`
    const der = bandes[bandes.length - 1]
    if (der && der.cle === cle && c.enSession) der.fin = i
    else bandes.push({ cle, debut: i, fin: i, enSession: c.enSession, cuisineLe: c.cuisineLe })
  })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return `<div class="frise" style="--nb-jours:${jours.length}">
    <div class="frise-coin"></div>
    ${jours.map((j, i) => `<div class="frise-jour${j.date.getTime() === today.getTime() ? ' frise-aujourdhui' : ''}" style="${col(i)}">
      <span class="frise-jour-nom">${JOUR_COURT[j.jour]}</span> <span class="frise-jour-date">${j.date.getDate()}</span></div>`).join('')}
    <div class="frise-label">Cuisine</div>
    ${bandes.map(b => `<div class="frise-bande${b.enSession ? ' frise-bande-session' : ''}" style="grid-column:${b.debut + 2} / ${b.fin + 3}">
      ${b.enSession ? `${icone('marmite')}Préparé ${esc(b.cuisineLe)}` : 'Sur place'}</div>`).join('')}
    ${['midi', 'soir'].map(m => `
      <div class="frise-label">${m === 'midi' ? `${icone('soleil')}Midi` : `${icone('lune')}Soir`}</div>
      ${jours.map((j, i) => j.creneaux[m]
        ? `<div class="frise-cellule" style="${col(i)}">${htmlCreneau(j.creneaux[m], { avecJour: false })}</div>`
        : `<div class="frise-cellule frise-hors" style="${col(i)}" aria-hidden="true"></div>`).join('')}`).join('')}
  </div>`
}

async function renderGrid() {
  donnees = await chargerDonnees(samedi)
  afficher()
}

function afficher() {
  if (!donnees) return
  const labelEl = document.getElementById('labelSemaine')
  if (labelEl) labelEl.textContent = labelCycle(samedi)

  const badge = document.getElementById('badgeReserve')
  if (badge) {
    badge.innerHTML = `${icone('flocon')}${donnees.reserve.length}`
    badge.setAttribute('aria-label', `Réserve congélo : ${donnees.reserve.length} plat(s)`)
    badge.classList.toggle('hidden', donnees.reserve.length === 0)
  }

  const grid = document.getElementById('planningGrid')
  if (!grid) return
  grid.className = ecranLarge.matches ? 'planning-frise' : 'planning-cycle'
  grid.innerHTML = ecranLarge.matches ? htmlFrise() : htmlListe()
}

// ── Actions sur un créneau ───────────────────────────────────────────
async function actionCreneau(action, cle, bouton) {
  const c = donnees.parCle[cle]
  creneauEnCours = c
  if (action === 'changer') return ouvrirSelectRecette()
  if (action === 'supprimer') { await viderCreneaux([c]); return renderGrid() }
  if (action === 'portions') {
    const occ = donnees.occupation[cle]
    const v = parseInt(prompt(`Portions pour ${labelCreneau(c)} :`, occ?.portions ?? c.portions), 10)
    if (!v || v < 1 || !occ) return
    await enregistrerCreneaux([{ creneau: c, recetteId: occ.id, source: occ.source, portions: v }])
    return renderGrid()
  }
  if (action === 'suivant') {
    const { filtres, style } = lireFiltres()
    const [prochain] = proposerPourCreneau(donnees, c, { filtres, style }, 1)
    if (bouton) { bouton.disabled = true; bouton.innerHTML = '<span class="loader loader-mini"></span>' }
    try {
      if (prochain) {
        await enregistrerCreneaux([{ creneau: c, recetteId: prochain.id, source: 'biblio' }])
      } else if (confirm('Plus rien de compatible dans tes recettes. Demander une idée à l\'IA ?')) {
        const r = await ideeIA(donnees, c, { filtres, style })
        await enregistrerCreneaux([{ creneau: c, recetteId: r.id, source: 'ia' }])
      }
    } catch (e) { alert(e.message) }
    return renderGrid()
  }
}

async function ouvrirSelectRecette() {
  const modal = document.getElementById('modalRecetteSelect')
  const list  = document.getElementById('recetteSelectList')
  if (!modal || !list || !creneauEnCours) return
  const { filtres, style } = lireFiltres()
  const compatibles = proposerPourCreneau(donnees, creneauEnCours, { filtres, style }, 50)
  const idsCompat = new Set(compatibles.map(r => r.id))
  const autres = donnees.recettes.filter(r => !idsCompat.has(r.id)).sort((a, b) => a.nom.localeCompare(b.nom))
  const carte = (x, compat) => `
    <div class="recipe-card" style="margin-bottom:0.5rem;cursor:pointer;${compat ? '' : 'opacity:0.6;'}" data-id="${esc(x.id)}">
      <div class="recipe-name">${esc(x.nom)}</div>
      <div class="recipe-meta"><span>${icone('horloge')}${(x.temps_prep || 0) + (x.temps_cuisson || 0)} min</span>${x.vegetarien ? `<span>${icone('feuille')}végé</span>` : ''}${x.cuisine ? `<span>${esc(x.cuisine)}</span>` : ''}</div>
    </div>`
  list.innerHTML = `<p class="text-xs text-muted" style="margin-bottom:0.5rem;">${esc(labelCreneau(creneauEnCours))} · les mieux adaptées d'abord</p>`
    + (donnees.recettes.length === 0 ? '<p class="text-muted text-sm" style="padding:1rem;">Aucune recette pour l\'instant.</p>' : '')
    + compatibles.map(x => carte(x, true)).join('')
    + (autres.length ? `<p class="text-xs text-muted" style="margin:0.75rem 0 0.5rem;">Autres recettes (hors critères)</p>` + autres.map(x => carte(x, false)).join('') : '')

  list.querySelectorAll('[data-id]').forEach(card => {
    card.addEventListener('click', async () => {
      await enregistrerCreneaux([{ creneau: creneauEnCours, recetteId: card.dataset.id, source: 'manuel' }])
      modal.classList.add('hidden')
      await renderGrid()
    })
  })
  modal.classList.remove('hidden')
}

// ── Remplir le cycle ─────────────────────────────────────────────────
function initModalGen() {
  const modal = document.getElementById('modalGenSemaine')
  if (!modal) return
  const filtresWrap = document.getElementById('genFiltres')
  const styleInput  = document.getElementById('genStyle')
  const chipsWrap   = document.getElementById('genSlotChips')
  const status      = document.getElementById('genStatus')
  const btnBiblio   = document.getElementById('btnLancerGen')
  const btnIA       = document.getElementById('btnCompleterIA')
  const progress    = document.getElementById('genProgressWrap')
  const fill        = document.getElementById('genProgressFill')
  let videsRestants = []

  const lireSelection = () => ({
    filtres: [...filtresWrap.querySelectorAll('.chip.active')].map(c => c.dataset.filtre),
    style:   styleInput.value.trim(),
  })
  const majCompteur = () => {
    document.getElementById('genCreneauxCount').textContent = chipsWrap.querySelectorAll('.chip.active').length
  }

  document.getElementById('btnGenererSemaine')?.addEventListener('click', () => {
    const memo = lireFiltres()
    filtresWrap.innerHTML = FILTRES.map(f =>
      `<button class="chip ${memo.filtres.includes(f.id) ? 'active' : ''}" data-filtre="${f.id}">${f.label}</button>`).join('')
    styleInput.value = memo.style || ''
    const vides = donnees.creneaux.filter(c => !donnees.occupation[c.cle])
    chipsWrap.innerHTML = (vides.length ? '' : '<p class="text-xs text-muted" style="width:100%;">Tout est rempli : sélectionne les créneaux à remplacer.</p>')
      + donnees.creneaux.map(c => `<button class="chip ${donnees.occupation[c.cle] ? '' : 'active'}" data-cle="${esc(c.cle)}">
          ${esc(labelCreneau(c))}${c.portions === 1 ? icone('personne') : ''}</button>`).join('')
    status.textContent = ''
    btnIA.classList.add('hidden')
    progress.classList.add('hidden')
    majCompteur()
    modal.classList.remove('hidden')
  })

  filtresWrap.addEventListener('click', e => { e.target.closest('.chip')?.classList.toggle('active') })
  chipsWrap.addEventListener('click', e => { e.target.closest('.chip')?.classList.toggle('active'); majCompteur() })
  document.getElementById('closeGenSemaine')?.addEventListener('click', () => modal.classList.add('hidden'))

  btnBiblio.addEventListener('click', async () => {
    const sel  = lireSelection()
    memoriserFiltres(sel)
    const cles = [...chipsWrap.querySelectorAll('.chip.active')].map(c => c.dataset.cle)
    if (!cles.length) { status.textContent = 'Sélectionne au moins un créneau.'; return }
    btnBiblio.disabled = true
    status.textContent = 'Recherche dans tes recettes…'
    try {
      const { nbProposes, vides } = await remplirDepuisBibliotheque(donnees, cles, sel)
      videsRestants = vides
      status.textContent = `${nbProposes} repas proposés depuis tes recettes` + (vides.length ? ` · ${vides.length} sans idée` : '')
      btnIA.innerHTML = `${icone('etincelle')}Compléter avec l'IA (${vides.length} repas)`
      btnIA.classList.toggle('hidden', vides.length === 0)
      await renderGrid()
      if (!vides.length) setTimeout(() => modal.classList.add('hidden'), 900)
    } catch (e) {
      status.textContent = e.message
    } finally {
      btnBiblio.disabled = false
    }
  })

  // Génération IA : directement pour les créneaux choisis, ou pour ceux restés vides après la bibliothèque
  async function genererIA(creneaux, bouton) {
    if (!creneaux.length) { status.textContent = 'Sélectionne au moins un repas.'; return }
    bouton.disabled = true
    btnBiblio.disabled = true
    progress.classList.remove('hidden')
    fill.style.width = '0%'
    const total = creneaux.length
    status.textContent = `0 / ${total} recettes…`
    try {
      const sel = lireSelection()
      memoriserFiltres(sel)
      const { nbCrees, rejets } = await completerParIA(donnees, creneaux, sel, (n) => {
        const k = Math.min(n, total)
        status.textContent = `${k} / ${total} recettes…`
        fill.style.width = `${k / total * 95}%`
      })
      fill.style.width = '100%'
      status.textContent = `${nbCrees} nouvelles recettes ajoutées` + (rejets.length ? ` · refusées (contraintes) : ${rejets.join(', ')}` : '')
      videsRestants = []
      btnIA.classList.add('hidden')
      await renderGrid()
    } catch (e) {
      fill.style.width = '0%'
      status.textContent = e.message
    } finally {
      bouton.disabled = false
      btnBiblio.disabled = false
    }
  }

  btnIA.addEventListener('click', () => genererIA(videsRestants, btnIA))
  document.getElementById('btnGenererIA').addEventListener('click', (e) => {
    const cles = [...chipsWrap.querySelectorAll('.chip.active')].map(c => c.dataset.cle)
    const deja = cles.filter(cle => donnees.occupation[cle]).length
    if (deja && !confirm(`${deja} repas déjà prévu(s) seront remplacés par de nouvelles recettes. Continuer ?`)) return
    genererIA(cles.map(cle => donnees.parCle[cle]), e.currentTarget)
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  await renderGrid()
  initModalGen()

  document.getElementById('planningGrid')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (btn) { e.stopPropagation(); return actionCreneau(btn.dataset.action, btn.dataset.cle, btn) }
    const slot = e.target.closest('.slot')
    if (!slot) return
    const occ = donnees.occupation[slot.dataset.cle]
    if (occ) window.location.href = `recettes.html?id=${encodeURIComponent(occ.id)}&from=planning`
    else { creneauEnCours = donnees.parCle[slot.dataset.cle]; ouvrirSelectRecette() }
  })

  document.getElementById('btnPrevWeek')?.addEventListener('click', async () => {
    samedi = decalerCycle(samedi, -1); await renderGrid()
  })
  document.getElementById('btnNextWeek')?.addEventListener('click', async () => {
    samedi = decalerCycle(samedi, 1); await renderGrid()
  })
  document.getElementById('closeRecetteSelect')?.addEventListener('click', () =>
    document.getElementById('modalRecetteSelect')?.classList.add('hidden'))

  ecranLarge.addEventListener('change', afficher)

  // Temps réel : refléter les changements faits depuis l'autre téléphone
  dbEcouter(['planning', 'recettes', 'reserve', 'reglages'], debounce(renderGrid, 300))
})
