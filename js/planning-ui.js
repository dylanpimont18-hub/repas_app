// js/planning-ui.js — Planning par cycle (samedi soir → samedi midi), groupé par session de cuisine
import { enregistrerCreneaux, viderCreneaux } from './planning.js'
import { debutCycle, decalerCycle, labelCycle, groupesDuCycle, labelCreneau } from './cycle.js'
import { FILTRES } from './filtres.js'
import { chargerDonnees, lireFiltres, memoriserFiltres, proposerPourCreneau,
         remplirDepuisBibliotheque, completerParIA, ideeIA } from './propositions.js'
import { dbEcouter } from './db.js'
import { esc, debounce } from './utils.js'

let samedi  = debutCycle()
let donnees = null
let creneauEnCours = null

const SOURCES = { biblio: ['📖', 'biblio'], ia: ['✨', 'IA'], reste: ['🍱', 'reste'], reserve: ['❄️', 'congélo'], manuel: ['', ''] }

function badgePortions(c, portions) {
  return c.profils.length === 1 && c.profils[0] === 'femme' && portions === 1 ? '👩 1' : `👥 ${portions}`
}

async function renderGrid() {
  donnees = await chargerDonnees(samedi)
  const labelEl = document.getElementById('labelSemaine')
  if (labelEl) labelEl.textContent = labelCycle(samedi)

  const badge = document.getElementById('badgeReserve')
  if (badge) {
    badge.textContent = `❄️ ${donnees.reserve.length}`
    badge.classList.toggle('hidden', donnees.reserve.length === 0)
  }

  const grid = document.getElementById('planningGrid')
  if (!grid) return
  grid.className = 'planning-list'
  grid.innerHTML = groupesDuCycle(donnees.creneaux).map(g => `
    <div class="planning-list-day${g.enSession ? ' planning-session' : ''}">
      <div class="planning-list-day-header">${esc(g.titre)}</div>
      ${g.creneaux.map(c => {
        const occ = donnees.occupation[c.cle]
        const recette = occ ? donnees.recettesMap[occ.id] : null
        const [icone, label] = SOURCES[occ?.source] || SOURCES.manuel
        return `<div class="planning-list-slot" data-cle="${esc(c.cle)}">
          <span class="list-slot-icon">${c.moment === 'midi' ? '☀️' : '🌙'}</span>
          <div class="list-slot-content">
            <span class="list-slot-label">${esc(labelCreneau(c).split(' ')[0].slice(0, 3))}</span>
            ${recette
              ? `<span class="list-meal-name">${esc(recette.nom)}</span>${label ? `<span class="source-tag source-${esc(occ.source)}">${icone} ${label}</span>` : ''}`
              : `<span class="list-meal-empty">+ Ajouter</span>`}
          </div>
          <button class="portions-badge" data-action="portions" data-cle="${esc(c.cle)}" title="Portions">${badgePortions(c, occ?.portions ?? c.portions)}</button>
          ${recette ? `<div class="list-slot-actions">
            <button class="list-act-btn" data-action="suivant" data-cle="${esc(c.cle)}" title="Autre proposition">↻</button>
            <button class="list-act-btn" data-action="changer" data-cle="${esc(c.cle)}" title="Choisir">✏️</button>
            <button class="list-act-btn list-act-del" data-action="supprimer" data-cle="${esc(c.cle)}" title="Vider">🗑</button>
          </div>` : ''}
        </div>`
      }).join('')}
    </div>`).join('')
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
    if (bouton) { bouton.disabled = true; bouton.textContent = '⏳' }
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
      <div class="recipe-meta"><span>⏱ ${(x.temps_prep || 0) + (x.temps_cuisson || 0)} min</span>${x.vegetarien ? '<span>🌿</span>' : ''}${x.cuisine ? `<span>${esc(x.cuisine)}</span>` : ''}</div>
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
          ${esc(labelCreneau(c))} ${c.portions === 1 ? '👩' : ''}</button>`).join('')
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
    status.textContent = '⏳ Recherche dans tes recettes…'
    try {
      const { nbProposes, vides } = await remplirDepuisBibliotheque(donnees, cles, sel)
      videsRestants = vides
      status.textContent = `✅ ${nbProposes} repas proposés depuis tes recettes` + (vides.length ? ` · ${vides.length} sans idée` : '')
      btnIA.textContent = `✨ Compléter avec l'IA (${vides.length} repas)`
      btnIA.classList.toggle('hidden', vides.length === 0)
      await renderGrid()
      if (!vides.length) setTimeout(() => modal.classList.add('hidden'), 900)
    } catch (e) {
      status.textContent = `❌ ${e.message}`
    } finally {
      btnBiblio.disabled = false
    }
  })

  btnIA.addEventListener('click', async () => {
    if (!videsRestants.length) return
    btnIA.disabled = true
    progress.classList.remove('hidden')
    fill.style.width = '0%'
    const total = videsRestants.length
    status.textContent = `0 / ${total} recettes…`
    try {
      const { nbCrees, rejets } = await completerParIA(donnees, videsRestants, lireSelection(), (n) => {
        const k = Math.min(n, total)
        status.textContent = `${k} / ${total} recettes…`
        fill.style.width = `${k / total * 95}%`
      })
      fill.style.width = '100%'
      status.textContent = `✅ ${nbCrees} nouvelles recettes ajoutées` + (rejets.length ? ` · refusées (contraintes) : ${rejets.join(', ')}` : '')
      videsRestants = []
      btnIA.classList.add('hidden')
      await renderGrid()
    } catch (e) {
      fill.style.width = '0%'
      status.textContent = `❌ ${e.message}`
    } finally {
      btnIA.disabled = false
    }
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  await renderGrid()
  initModalGen()

  document.getElementById('planningGrid')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (btn) { e.stopPropagation(); return actionCreneau(btn.dataset.action, btn.dataset.cle, btn) }
    const slot = e.target.closest('.planning-list-slot')
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

  // Temps réel : refléter les changements faits depuis l'autre téléphone
  dbEcouter(['planning', 'recettes', 'reserve', 'reglages'], debounce(renderGrid, 300))
})
