// js/dashboard.js — Accueil : prochain repas, prochaine session de cuisine, avis sur les derniers repas, aperçu du cycle
import { getRecettesByIds }  from './recettes.js'
import { getModele, cycleDepuisLignes } from './planning.js'
import { dbEcouter, dbGetPlanningSemaines, dbSetAvis } from './db.js'
import { debutCycle, decalerCycle, dateIso, ajouterJours, groupesDuCycle, creneauCourant, labelCreneau, semainesDuCycle } from './cycle.js'
import { platsACuisiner }    from './cuisine.js'
// Mode cuisine (et IA, minuteurs) chargé seulement au moment de cuisiner : page plus légère
const ouvrirModeCuisine = async (...args) => (await import('./mode-cuisine.js')).ouvrirModeCuisine(...args)
import { repasANoter }       from './avis.js'
import { esc, debounce, getSemaineKey } from './utils.js'
import { icone }             from './icones.js'
import { signalerErreur }    from './dialogue.js'

const JOURS_LABEL = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
  vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}

let cycles = []          // [{ creneaux, occupation, absents, recettesMap }] : cycle en cours + suivant
let actions = {}         // id du bouton → plats à cuisiner
let avisEnCours = []        // plats à noter affichés : { recetteId, creneaux }
let lignesAvis = []         // lignes du planning des derniers jours (pour « Comment c'était ? »)

// Plats « passés » (pas notés) : retenus 4 jours sur cet appareil, pour ne pas les redemander à chaque visite
const CLE_PASSES = 'repas_avis_passes'
function avisPasses() {
  try { return Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem(CLE_PASSES) || '{}')).filter(([, t]) => Date.now() - t < 4 * 86400000)) } catch { return {} }
}
function passerAvis(recetteId) {
  try { localStorage.setItem(CLE_PASSES, JSON.stringify({ ...avisPasses(), [recetteId]: Date.now() })) } catch { /* navigation privée */ }
}

// Cycle en cours et suivant (la prochaine session peut tomber après samedi midi) + derniers jours pour l'avis :
// 1 réglage, 1 requête planning (toutes les semaines utiles), 1 requête recettes
async function chargerCycles() {
  const samedis = [debutCycle(), decalerCycle(debutCycle(), 1)]
  const maintenant = new Date()
  const semainesAvis = [0, 3].map(n => getSemaineKey(ajouterJours(maintenant, -n)))
  const [modele, lignes] = await Promise.all([getModele(),
    dbGetPlanningSemaines([...new Set([...samedis.flatMap(semainesDuCycle), ...semainesAvis])])])
  lignesAvis = lignes.filter(l => semainesAvis.includes(l.semaine_key))
  const bruts = samedis.map(s => cycleDepuisLignes(s, modele, lignes))
  const aNoter = repasANoter(lignesAvis, maintenant)
  const recettesMap = await getRecettesByIds([...bruts.flatMap(c => Object.values(c.occupation).map(o => o.id)), ...aNoter.map(x => x.recetteId)])
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
  // Plat cuisiné en session (ou reste d'un soir de la session) : il est déjà prêt, on le réchauffe
  const pret = c.enSession && occ.source !== 'reserve'
  const info = occ.source === 'reserve' ? `${icone('flocon')}À sortir du congélo`
    : occ.source === 'reste' ? `${icone('boite')}Reste préparé ${esc(c.cuisineLe)} : à réchauffer`
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
function htmlAvis() {
  const passes = avisPasses()
  const aNoter = repasANoter(lignesAvis, new Date()).filter(x => !passes[x.recetteId]).slice(0, 3)
  if (!aNoter.length) return ''
  const recettes = cycles[0].recettesMap
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

// Remplace seulement le bloc « Comment c'était ? »
function afficherAvis() {
  const zone = document.getElementById('dashCeSoir')
  zone.querySelector('.dash-avis')?.remove()
  zone.insertAdjacentHTML('beforeend', htmlAvis())
  zone.querySelector('.dash-avis button')?.focus()
}

async function render() {
  try {
    cycles = await chargerCycles()
  } catch (e) {
    document.getElementById('dashCeSoir').innerHTML = `<p class="text-muted">Impossible de charger le cycle : ${esc(e.message)}</p>`
    return signalerErreur(e, 'Accueil')
  }
  actions = {}
  document.getElementById('dashCeSoir').innerHTML = htmlProchainRepas() + htmlProchaineSession() + htmlAvis()
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
    if (passer) { passerAvis(passer.dataset.passer); lignesAvis = [...lignesAvis]; return afficherAvis() }
    const b = e.target.closest('[data-avis]')
    if (!b) return
    const item = avisEnCours.find(x => x.recetteId === b.dataset.recette)
    if (!item) return
    b.closest('.dash-avis-ligne').querySelectorAll('button').forEach(x => { x.disabled = true })
    try {
      await dbSetAvis(item.creneaux, item.recetteId, Number(b.dataset.avis))
      // Mise à jour locale : plus besoin de recharger tout l'accueil
      lignesAvis = lignesAvis.map(l => item.creneaux.some(c => c.semaine_key === l.semaine_key && c.jour === l.jour && c.moment === l.moment) ? { ...l, avis: Number(b.dataset.avis) } : l)
      afficherAvis()
    } catch (err) { signalerErreur(err, 'Avis') }
  })

  // Rafraîchir si l'autre membre du foyer modifie le planning ou les recettes
  dbEcouter(['planning', 'recettes'], debounce(render, 400))
})
