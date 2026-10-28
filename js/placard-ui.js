// js/placard-ui.js — Page « Vider le placard » : inventaire partagé, recettes qui l'utilisent (mode indépendant :
// ni le planning ni les courses n'en dépendent ; ses recettes ne sont pas proposées ailleurs)
// Inventaire : réglage partagé `inventaire` [{ id, nom, quantite }] ; recettes retenues : réglage `placard_selection`
import { dbGetReglage, dbSetReglage, dbEcouter, dbGetLivres, dbUpsertLivre, dbUpsertRecettes } from './db.js'
import { chargerDonnees } from './propositions.js'
import { NOM_LIVRE_PLACARD, lireInventaire, fusionnerInventaire, couverture, choisirDansBibliotheque, nbRecettesConseille,
         repartirArticles, aAcheter, markdownPlacard } from './placard.js'
import { FILTRES, estEnvie } from './filtres.js'
import { debutCycle, dateIso } from './cycle.js'
import { esc, debounce } from './utils.js'
import { exporterFichier, nomDeFichier } from './fichier.js'
import { icone } from './icones.js'
import { confirmer, informer, signalerErreur } from './dialogue.js'
import { chargerCredit, htmlEstimation, htmlErreurIA, majBandeau } from './credit-ia-ui.js'
import { expliquerErreur } from './credit-ia.js'
import { apresCreation } from './photos-auto.js'

const CLE_INVENTAIRE = 'inventaire'
const CLE_SELECTION = 'placard_selection'

let inventaire = []      // [{ id, nom, quantite }]
let selection = []       // ids des recettes retenues
let donnees = null       // chargerDonnees() : catalogue, goûts, cycle en cours
let nbIA = 0             // recettes à demander à l'IA
let nbIAChoisi = false   // l'utilisateur a réglé le nombre lui-même
let iaEnCours = false
let credit = null
const mesEcritures = { inventaire: 0, selection: 0 }   // écho temps réel de nos écritures, ignoré

const portionsChoisies = () => Number(document.getElementById('placardPortions')?.value) || 4
const recettesRetenues = () => selection.map(id => donnees?.recettesMap[id]).filter(Boolean)
const filtresChoisis = () => [...document.querySelectorAll('#placardFiltres .chip.active')].map(c => c.dataset.filtre)

// ── Enregistrement (partagé entre les deux téléphones) ──
async function sauverInventaire(suivant) {
  const avant = inventaire
  inventaire = suivant
  afficher()
  try { mesEcritures.inventaire = Date.now(); await dbSetReglage(CLE_INVENTAIRE, inventaire) }
  catch (e) { inventaire = avant; afficher(); signalerErreur(e, 'Placard') }
}
async function sauverSelection(suivant) {
  selection = [...new Set(suivant)]
  afficher()
  try { mesEcritures.selection = Date.now(); await dbSetReglage(CLE_SELECTION, selection) }
  catch (e) { signalerErreur(e, 'Sélection') }
}

// ── Affichage ──
function afficherInventaire() {
  document.getElementById('placardCompte').textContent = inventaire.length ? `(${inventaire.length})` : ''
  document.getElementById('btnViderInventaire').classList.toggle('hidden', !inventaire.length)
  const { utilises } = couverture(inventaire, recettesRetenues())
  document.getElementById('placardListe').innerHTML = inventaire.length
    ? inventaire.map(i => `<li class="placard-item${utilises.has(i.id) ? ' placard-utilise' : ''}">
        <span class="placard-nom">${utilises.has(i.id) ? icone('check', { label: 'utilisé par une recette retenue' }) : ''}${esc(i.nom)}</span>
        <input class="form-input placard-qte" type="text" value="${esc(i.quantite)}" placeholder="quantité" data-qte="${esc(i.id)}" aria-label="Quantité de ${esc(i.nom)}">
        <button class="courses-item-action" data-retirer="${esc(i.id)}" aria-label="Retirer ${esc(i.nom)} du placard">${icone('croix')}</button>
      </li>`).join('')
    : '<li class="text-sm text-muted">Le placard est vide : ajoute ce que tu as (conserves, féculents, épices, surgelés…).</li>'
}

function afficherPlan() {
  const { restants } = couverture(inventaire, recettesRetenues())
  if (!nbIAChoisi) nbIA = nbRecettesConseille(restants.length)
  document.getElementById('placardNbIA').textContent = nbIA
  document.querySelector('[data-nb="-1"]').disabled = nbIA <= 0
  document.querySelector('[data-nb="1"]').disabled = nbIA >= 15
  const plan = document.getElementById('placardPlan')
  if (!inventaire.length) plan.textContent = ''
  else if (!restants.length) plan.innerHTML = `${icone('check')}Tous les articles du placard sont utilisés par les recettes retenues.`
  else plan.textContent = `${restants.length} article(s) pas encore utilisé(s) : tes recettes existantes d'abord`
    + (nbIA ? `, puis l'IA en écrira jusqu'à ${nbIA} pour le reste.` : ' (aucune recette demandée à l\'IA).')
  document.getElementById('placardEstimation').innerHTML = credit && nbIA && restants.length ? htmlEstimation(nbIA, credit) : ''
  document.getElementById('btnPlacardIA').disabled = iaEnCours || !restants.length
  document.getElementById('btnPlacardBiblio').disabled = !inventaire.length || !restants.length
}

function afficherResultats() {
  const retenues = recettesRetenues()
  const zone = document.getElementById('placardResultats')
  zone.classList.toggle('hidden', !retenues.length)
  if (!retenues.length) return
  const { parRecette, utilises, restants } = couverture(inventaire, retenues)
  const pct = inventaire.length ? Math.round(utilises.size / inventaire.length * 100) : 0
  document.getElementById('placardCouverture').textContent = `${utilises.size} / ${inventaire.length} articles utilisés`
  const jauge = document.getElementById('placardJauge')
  jauge.setAttribute('aria-valuenow', pct)
  jauge.querySelector('.placard-barre-rempli').style.width = `${pct}%`
  const nomArticle = id => inventaire.find(i => i.id === id)?.nom
  document.getElementById('placardRecettes').innerHTML = retenues.map(r => {
    const achats = aAcheter(r, inventaire)
    return `<article class="card placard-recette">
      <div class="placard-recette-tete">
        <h3><a href="recettes.html?id=${encodeURIComponent(r.id)}&portions=${portionsChoisies()}">${esc(r.nom)}</a></h3>
        <button class="courses-item-action" data-oublier="${esc(r.id)}" aria-label="Retirer « ${esc(r.nom)} » de la sélection">${icone('croix')}</button>
      </div>
      <p class="text-sm">${icone('boite')}Utilise : <b>${esc((parRecette[r.id] || []).map(nomArticle).filter(Boolean).join(', ') || '—')}</b></p>
      ${achats.length ? `<p class="text-xs text-muted">À acheter : ${esc(achats.join(', '))}</p>` : '<p class="text-xs text-muted">Rien à acheter.</p>'}
      <button class="btn btn-secondary btn-sm placard-cuisiner" data-cuisiner="${esc(r.id)}">${icone('marmite')}Cuisiner pour ${portionsChoisies()}</button>
    </article>`
  }).join('')
  document.getElementById('placardRestants').innerHTML = restants.length
    ? `<p class="text-sm placard-restants">${icone('info')}Pas encore utilisés : ${esc(restants.map(i => i.nom).join(', '))}. « Trouver les recettes » en fera écrire par l'IA.</p>`
    : ''
}

function afficher() {
  afficherInventaire()
  afficherPlan()
  afficherResultats()
}

// ── Bibliothèque d'abord : toutes les recettes existantes (y compris celles déjà écrites pour le placard) ──
// Renvoie le nombre de recettes ajoutées à la sélection
async function chercherDansBibliotheque({ silencieux = false } = {}) {
  const { restants } = couverture(inventaire, recettesRetenues())
  const candidates = donnees.recettes.filter(r => !selection.includes(r.id))
  const choix = choisirDansBibliotheque(restants, candidates, { indexPrefs: donnees.indexPrefs, filtres: filtresChoisis() })
  if (!choix.length) {
    if (!silencieux) informer('Aucune de tes recettes n\'utilise au moins 2 de ces articles : « Trouver les recettes » en fera écrire par l\'IA.')
    return 0
  }
  const nb = new Set(choix.flatMap(c => c.articles)).size
  nbIAChoisi = false
  await sauverSelection([...selection, ...choix.map(c => c.recette.id)])
  informer(`${choix.length} recette(s) déjà enregistrée(s) utilisent ${nb} article(s) du placard.`, { type: 'ok' })
  return choix.length
}

// « Trouver les recettes » : recettes existantes d'abord, puis l'IA seulement pour ce qui reste
async function trouverRecettes() {
  if (iaEnCours) return
  await chercherDansBibliotheque({ silencieux: true })
  const { restants } = couverture(inventaire, recettesRetenues())
  if (!restants.length) return informer('Tes recettes existantes suffisent : tout le placard est utilisé.', { type: 'ok' })
  if (!nbIA) return informer(`${restants.length} article(s) restent : augmente le nombre de recettes IA pour les utiliser.`)
  await completerParIA()
}

// ── IA pour les articles restants ──
async function livrePlacard() {
  const livres = await dbGetLivres().catch(() => [])
  const existant = livres.find(l => l.nom === NOM_LIVRE_PLACARD)
  if (existant) return existant.id
  return dbUpsertLivre({ nom: NOM_LIVRE_PLACARD, consigne: 'Recettes anti-gaspi construites autour de ce qu\'il y a dans le placard.' })
}

async function completerParIA() {
  const { restants } = couverture(inventaire, recettesRetenues())
  if (!restants.length || !nbIA || iaEnCours) return
  const groupes = repartirArticles(restants, nbIA)
  const portions = portionsChoisies()
  const bandeau = etat => majBandeau(document.getElementById('bandeauIA'), etat)
  iaEnCours = true
  afficherPlan()
  bandeau({ etat: 'encours', texte: `L'IA écrit ${groupes.length} recette(s) avec ton placard…`, pct: 3 })
  try {
    const { genererPourPlacard } = await import('./ai.js')
    const livreId = await livrePlacard().catch(() => null)
    const { resultats, rejets, erreurs } = await genererPourPlacard({
      groupes, inventaire, portions, filtres: filtresChoisis(), style: document.getElementById('placardIdee').value.trim(),
      nomsExistants: donnees.recettes.map(r => r.nom),
    },
    n => bandeau({ etat: 'encours', texte: `Placard : ${n} / ${groupes.length} recette(s)`, pct: Math.max(3, n / groupes.length * 95) }),
    async lot => {
      const recettes = lot.map(x => ({ ...x.recette, livre_id: livreId }))
      const ids = await dbUpsertRecettes(recettes)
      recettes.forEach((r, i) => { const rec = { ...r, id: ids[i] }; donnees.recettes.unshift(rec); donnees.recettesMap[rec.id] = rec })
      apresCreation(recettes.map((r, i) => ({ ...r, id: ids[i] })))
      await sauverSelection([...selection, ...ids])
    })
    const { restants: encore } = couverture(inventaire, recettesRetenues())
    const detail = (rejets.length ? `<p class="text-xs">Écartées : ${esc(rejets.join(', '))}</p>` : '')
      + [...new Map(erreurs.map(e => [e.code, e])).values()].map(e => htmlErreurIA(e)).join('')
    bandeau({ etat: encore.length || detail ? 'partiel' : 'fini',
      texte: `${resultats.length} recette(s) ajoutée(s)` + (encore.length ? ` · ${encore.length} article(s) encore inutilisé(s)` : ' · tout le placard est utilisé'), detail })
  } catch (e) {
    bandeau({ etat: 'erreur', texte: 'Aucune recette créée', detail: htmlErreurIA(e.info || expliquerErreur('INCONNUE', e.message)) })
  } finally {
    iaEnCours = false
    nbIAChoisi = false
    afficher()
  }
}

// Retire du placard les articles utilisés par les recettes retenues (une fois cuisinées)
async function retirerUtilises() {
  const { utilises } = couverture(inventaire, recettesRetenues())
  if (!utilises.size) return
  if (!await confirmer(`${utilises.size} article(s) utilisé(s) par les recettes retenues sortent du placard.`, { titre: 'Recettes cuisinées ?', ok: 'Retirer' })) return
  const avant = inventaire
  await sauverInventaire(inventaire.filter(i => !utilises.has(i.id)))
  informer('Placard mis à jour.', { action: { label: 'Annuler', faire: () => sauverInventaire(avant) } })
}

// ── Initialisation ──
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [inv, sel, d] = await Promise.all([dbGetReglage(CLE_INVENTAIRE), dbGetReglage(CLE_SELECTION), chargerDonnees(debutCycle(), { avecPlacard: true })])
    inventaire = Array.isArray(inv) ? inv : []
    donnees = d
    selection = (Array.isArray(sel) ? sel : []).filter(id => d.recettesMap[id])
  } catch (e) {
    signalerErreur(e, 'Chargement du placard')
    donnees ||= { recettes: [], recettesMap: {}, indexPrefs: [] }
  }
  document.getElementById('placardFiltres').innerHTML = FILTRES.filter(f => !estEnvie(f.id)).map(f =>
    `<button type="button" class="chip" data-filtre="${f.id}" aria-pressed="false">${f.label}</button>`).join('')
  afficher()
  chargerCredit().then(c => { credit = c; afficherPlan() }).catch(() => {})

  document.getElementById('formPlacard').addEventListener('submit', e => {
    e.preventDefault()
    const champ = document.getElementById('champPlacard')
    const nouveaux = lireInventaire(champ.value)
    if (!nouveaux.length) return
    champ.value = ''
    nbIAChoisi = false
    sauverInventaire(fusionnerInventaire(inventaire, nouveaux))
    informer(`${nouveaux.length} article(s) ajouté(s).`, { type: 'ok', duree: 2500 })
    champ.focus()
  })
  // Entrée valide, Maj + Entrée passe à la ligne
  document.getElementById('champPlacard').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('formPlacard').requestSubmit() }
  })
  document.getElementById('placardListe').addEventListener('change', e => {
    const champ = e.target.closest('[data-qte]'); if (!champ) return
    sauverInventaire(inventaire.map(i => (i.id === champ.dataset.qte ? { ...i, quantite: champ.value.trim() } : i)))
  })
  document.getElementById('placardListe').addEventListener('click', e => {
    const b = e.target.closest('[data-retirer]'); if (!b) return
    const item = inventaire.find(i => i.id === b.dataset.retirer)
    const avant = inventaire
    sauverInventaire(inventaire.filter(i => i.id !== b.dataset.retirer))
    informer(`${item?.nom} retiré.`, { action: { label: 'Annuler', faire: () => sauverInventaire(avant) } })
  })
  document.getElementById('btnViderInventaire').addEventListener('click', async () => {
    if (!await confirmer('Tous les articles du placard seront effacés.', { titre: 'Tout effacer ?', ok: 'Effacer', danger: true })) return
    const avant = inventaire
    await sauverInventaire([])
    informer('Placard effacé.', { action: { label: 'Annuler', faire: () => sauverInventaire(avant) } })
  })
  document.querySelector('.placard-options .pas-a-pas').addEventListener('click', e => {
    const b = e.target.closest('[data-nb]'); if (!b) return
    nbIA = Math.min(15, Math.max(0, nbIA + Number(b.dataset.nb)))
    nbIAChoisi = true
    afficherPlan()
  })
  document.getElementById('placardFiltres').addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return
    chip.classList.toggle('active')
    chip.setAttribute('aria-pressed', chip.classList.contains('active'))
  })
  document.getElementById('btnPlacardBiblio').addEventListener('click', () => chercherDansBibliotheque())
  document.getElementById('btnPlacardIA').addEventListener('click', trouverRecettes)
  document.getElementById('btnPlacardUtilises')?.addEventListener('click', retirerUtilises)
  // Export .md : inventaire, recettes retenues (ingrédients pour le nombre de personnes choisi, étapes), restants
  document.getElementById('btnExporterPlacard').addEventListener('click', () => {
    if (!inventaire.length) return informer('Le placard est vide : rien à exporter.')
    exporterFichier(nomDeFichier(`placard ${dateIso(new Date())}`),
      markdownPlacard(inventaire, recettesRetenues(), { titre: `Vider le placard · ${new Date().toLocaleDateString('fr-FR')}`, portions: portionsChoisies() }))
  })
  document.getElementById('btnPlacardOublier').addEventListener('click', async () => {
    const avant = selection
    await sauverSelection([])
    informer('Sélection effacée (les recettes restent dans la bibliothèque).', { action: { label: 'Annuler', faire: () => sauverSelection(avant) } })
  })
  document.getElementById('placardPortions').addEventListener('change', afficherResultats)
  document.getElementById('placardRecettes').addEventListener('click', async e => {
    const cuisiner = e.target.closest('[data-cuisiner]')
    if (cuisiner) {
      const r = donnees.recettesMap[cuisiner.dataset.cuisiner]
      const { ouvrirModeCuisine } = await import('./mode-cuisine.js')
      return ouvrirModeCuisine([{ recette: r, portions: portionsChoisies() }], r.nom)
    }
    const b = e.target.closest('[data-oublier]'); if (!b) return
    nbIAChoisi = false
    sauverSelection(selection.filter(id => id !== b.dataset.oublier))
  })
  window.addEventListener('beforeunload', e => { if (iaEnCours) { e.preventDefault(); e.returnValue = '' } })

  // Temps réel : l'autre téléphone remplit le placard en même temps (nos propres écritures sont ignorées)
  dbEcouter(['reglages'], async payload => {
    const cle = payload?.new?.cle || payload?.old?.cle
    if (cle === CLE_INVENTAIRE && Date.now() - mesEcritures.inventaire > 3000) {
      const v = await dbGetReglage(CLE_INVENTAIRE).catch(() => null); inventaire = Array.isArray(v) ? v : []; afficher()
    }
    if (cle === CLE_SELECTION && Date.now() - mesEcritures.selection > 3000) {
      const v = await dbGetReglage(CLE_SELECTION).catch(() => null)
      selection = Array.isArray(v) ? v : []
      // Recettes créées sur l'autre téléphone : catalogue rechargé
      if (selection.some(id => !donnees.recettesMap[id])) donnees = await chargerDonnees(debutCycle(), { avecPlacard: true }).catch(() => donnees)
      selection = selection.filter(id => donnees.recettesMap[id])
      afficher()
    }
  })
  dbEcouter(['recettes'], debounce(async () => {
    if (iaEnCours) return
    donnees = await chargerDonnees(debutCycle(), { avecPlacard: true }).catch(() => donnees)
    afficher()
  }, 800))
})
