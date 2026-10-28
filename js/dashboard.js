// js/dashboard.js — Accueil : prochain repas, prochaine session de cuisine, avis sur les derniers repas, aperçu du cycle
import { getRecettesByIds }  from './recettes.js'
import { chargerCycle }      from './planning.js'
import { dbEcouter, dbGetPlanningSemaines, dbSetAvis } from './db.js'
import { debutCycle, decalerCycle, dateIso, ajouterJours, groupesDuCycle, creneauCourant, labelCreneau } from './cycle.js'
import { platsACuisiner }    from './cuisine.js'
import { ouvrirModeCuisine } from './mode-cuisine.js'
import { repasANoter }       from './avis.js'
import { esc, debounce, getSemaineKey } from './utils.js'
import { icone }             from './icones.js'

const JOURS_LABEL = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
  vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}

let cycles = []          // [{ creneaux, occupation, absents, recettesMap }] : cycle en cours + suivant
let actions = {}         // id du bouton → plats à cuisiner
let avisMasques = new Set() // plats notés ou passés pendant cette visite
let avisEnCours = []        // plats à noter affichés : { recetteId, creneaux }

// Cycle en cours et suivant (la prochaine session peut tomber après samedi midi)
async function chargerCycles() {
  const samedis = [debutCycle(), decalerCycle(debutCycle(), 1)]
  const bruts = await Promise.all(samedis.map(s => chargerCycle(s)))
  const recettesMap = await getRecettesByIds(bruts.flatMap(c => Object.values(c.occupation).map(o => o.id)))
  return bruts.map(c => ({ ...c, recettesMap }))
}

function boutonCuisiner(plats, titre, classe = 'btn-primary') {
  if (!plats.length) return ''
  const id = `cuisiner-${Object.keys(actions).length}`
  actions[id] = { plats, titre }
  return `<button class="btn ${classe} btn-sm" data-cuisiner="${id}">${icone('marmite')}Cuisiner</button>`
}

// ── Prochain repas ──
function htmlProchainRepas() {
  const maintenant = new Date()
  const { creneaux, occupation, absents, recettesMap } = cycles[0]
  const c = creneauCourant(creneaux, maintenant)
  if (!c) return ''
  const occ = occupation[c.cle]
  const r = occ ? recettesMap[occ.id] : null
  const quand = dateIso(c.date) === dateIso(maintenant) ? (c.moment === 'midi' ? 'Ce midi' : 'Ce soir')
    : labelCreneau(c)
  const icon = icone(c.moment === 'midi' ? 'soleil' : 'lune')
  document.getElementById('dashSubtitle').textContent = r ? `${quand} : ${r.nom}` : absents[c.cle] ? `${quand} : pas de repas prévu` : `${quand} : rien de prévu pour l'instant`
  if (absents[c.cle]) return ''
  if (!r) {
    return `<section class="card dash-carte dash-vide">
      <span class="dash-icone">${icon}</span>
      <div class="dash-corps"><div class="dash-label">${esc(quand)}</div><div>Rien de prévu.</div></div>
      <div class="dash-actions">
        <a href="planning.html" class="btn btn-secondary btn-sm">${icone('plus')}Choisir un plat</a>
        <button class="btn btn-primary btn-sm" data-envie>${icone('eclair')}Envie</button>
      </div>
    </section>`
  }
  // Plat cuisiné en session : il est déjà prêt, on le réchauffe ; sinon on le cuisine sur place
  const pret = c.enSession && !['reserve', 'reste'].includes(occ.source)
  const info = occ.source === 'reserve' ? `${icone('flocon')}À sortir du congélo`
    : pret ? `${icone('marmite')}Préparé ${esc(c.cuisineLe)} : à réchauffer`
    : `${icone('horloge')}${(r.temps_prep || 0) + (r.temps_cuisson || 0)} min`
  const plats = pret || occ.source === 'reserve' ? [] : platsACuisiner([c], occupation, recettesMap)
  return `<section class="card dash-carte dash-prochain">
    ${r.image_url ? `<img class="dash-photo" src="${esc(r.image_url)}" alt="" loading="lazy">` : `<span class="dash-icone">${icon}</span>`}
    <div class="dash-corps">
      <div class="dash-label">${esc(quand)}</div>
      <div class="dash-nom">${esc(r.nom)}</div>
      <div class="dash-info">${info} · ${icone(occ.portions <= 1 ? 'personne' : 'famille')}${occ.portions}</div>
    </div>
    <div class="dash-actions">
      ${boutonCuisiner(plats, r.nom)}
      <a href="recettes.html?id=${encodeURIComponent(r.id)}&from=dashboard" class="btn btn-secondary btn-sm">Voir la recette</a>
    </div>
  </section>`
}

// ── Prochaine session de cuisine (dimanche, mercredi…) ──
function htmlProchaineSession() {
  const aujourdHui = dateIso(new Date())
  for (const cycle of cycles) {
    for (const g of groupesDuCycle(cycle.creneaux).filter(g => g.enSession)) {
      const c0 = g.creneaux[0]
      const jourCuisine = ajouterJours(c0.date, -c0.joursConservation)
      if (dateIso(jourCuisine) < aujourdHui) continue
      const plats = platsACuisiner(g.creneaux, cycle.occupation, cycle.recettesMap)
      const quand = dateIso(jourCuisine) === aujourdHui ? 'Aujourd\'hui' : `${g.cuisineLe.charAt(0).toUpperCase()}${g.cuisineLe.slice(1)} ${jourCuisine.getDate()}`
      return `<section class="card dash-carte dash-session">
        <span class="dash-icone">${icone('marmite')}</span>
        <div class="dash-corps">
          <div class="dash-label">Prochaine session · ${esc(quand)}</div>
          ${plats.length ? `<div class="dash-nom">${plats.length} plat${plats.length > 1 ? 's' : ''} à préparer</div>
            <ul class="dash-liste">${plats.map(p => `<li>${esc(p.recette.nom)} <span class="text-muted">· ${p.portions} portions</span></li>`).join('')}</ul>`
            : '<div>Rien de prévu pour cette session.</div>'}
        </div>
        <div class="dash-actions">
          ${plats.length ? boutonCuisiner(plats, `Session du ${g.cuisineLe}`) : '<a href="planning.html" class="btn btn-secondary btn-sm">Planifier</a>'}
        </div>
      </section>`
    }
  }
  return ''
}

// ── Comment c'était ? (avis sur les plats mangés ces 3 derniers jours) ──
async function htmlAvis() {
  const maintenant = new Date()
  const semaines = [...new Set([0, 3].map(n => getSemaineKey(ajouterJours(maintenant, -n))))]
  const lignes = await dbGetPlanningSemaines(semaines)
  const aNoter = repasANoter(lignes, maintenant).filter(x => !avisMasques.has(x.recetteId)).slice(0, 3)
  if (!aNoter.length) return ''
  const recettes = await getRecettesByIds(aNoter.map(x => x.recetteId))
  const items = aNoter.filter(x => recettes[x.recetteId])
  if (!items.length) return ''
  avisEnCours = items
  return `<section class="card dash-avis">
    <h2 class="section-title dash-avis-titre">Comment c'était ?</h2>
    ${items.map(x => `<div class="dash-avis-ligne">
      <span class="dash-avis-nom">${esc(recettes[x.recetteId].nom)}</span>
      <span class="dash-avis-boutons">
        <button class="btn btn-secondary btn-sm" data-avis="1" data-recette="${esc(x.recetteId)}" aria-label="On a aimé ${esc(recettes[x.recetteId].nom)}">${icone('coeur')}Aimé</button>
        <button class="btn btn-ghost btn-sm" data-avis="-1" data-recette="${esc(x.recetteId)}" aria-label="Pas aimé ${esc(recettes[x.recetteId].nom)}">${icone('croix')}Bof</button>
        <button class="btn btn-ghost btn-sm dash-avis-passer" data-passer="${esc(x.recetteId)}" aria-label="Ne pas noter ${esc(recettes[x.recetteId].nom)}">Passer</button>
      </span>
    </div>`).join('')}
    <p class="text-xs text-muted">Un plat aimé reviendra plus souvent, un plat raté beaucoup moins.</p>
  </section>`
}

// ── Aperçu du cycle (samedi soir → samedi midi) ──
function htmlCycle() {
  const { creneaux, occupation, absents, recettesMap } = cycles[0]
  const jours = []
  for (const c of creneaux) {
    let j = jours.find(x => x.iso === dateIso(c.date))
    if (!j) { j = { iso: dateIso(c.date), date: c.date, jour: c.jour, repas: {} }; jours.push(j) }
    j.repas[c.moment] = absents[c.cle] ? 'absent' : recettesMap[occupation[c.cle]?.id] || null
  }
  const aujourdHui = dateIso(new Date())
  const ligne = (ico, r, present) => present
    ? `<div class="apercu-repas">${ico} ${r === 'absent' ? '<span class="text-muted">pas de repas</span>'
      : r ? esc(r.nom) : '<span class="text-muted">—</span>'}</div>` : ''
  return jours.map(j => `
    <a href="planning.html" class="apercu-jour${j.iso === aujourdHui ? ' apercu-aujourdhui' : ''}">
      <div class="apercu-jour-nom">${JOURS_LABEL[j.jour]} ${j.date.getDate()}</div>
      ${ligne(icone('soleil'), j.repas.midi, 'midi' in j.repas)}
      ${ligne(icone('lune'), j.repas.soir, 'soir' in j.repas)}
    </a>`).join('')
}

async function render() {
  cycles = await chargerCycles()
  actions = {}
  const avis = await htmlAvis().catch(() => '')
  document.getElementById('dashCeSoir').innerHTML = htmlProchainRepas() + htmlProchaineSession() + avis
  const dashSemaine = document.getElementById('dashSemaine')
  dashSemaine.className = 'apercu-cycle'
  dashSemaine.innerHTML = htmlCycle()
}

document.addEventListener('DOMContentLoaded', async () => {
  await render()

  document.getElementById('dashCeSoir').addEventListener('click', async e => {
    const cuisiner = e.target.closest('[data-cuisiner]')
    if (cuisiner) { const a = actions[cuisiner.dataset.cuisiner]; return ouvrirModeCuisine(a.plats, a.titre) }
    if (e.target.closest('[data-envie]')) return document.getElementById('btnFlash')?.click()
    const passer = e.target.closest('[data-passer]')
    if (passer) { avisMasques.add(passer.dataset.passer); return render() }
    const b = e.target.closest('[data-avis]')
    if (!b) return
    const item = avisEnCours.find(x => x.recetteId === b.dataset.recette)
    if (!item) return
    b.closest('.dash-avis-ligne').querySelectorAll('button').forEach(x => { x.disabled = true })
    try {
      await dbSetAvis(item.creneaux, item.recetteId, Number(b.dataset.avis))
    } catch (err) { alert('Erreur : ' + err.message) }
    avisMasques.add(item.recetteId)
    await render()
  })

  // Rafraîchir si l'autre membre du foyer modifie le planning ou les recettes
  dbEcouter(['planning', 'recettes'], debounce(render, 400))
})
