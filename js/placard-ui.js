// js/placard-ui.js — Page « Vider le placard » : inventaire partagé, recettes qui l'utilisent, mise au planning
// Inventaire : réglage partagé `inventaire` [{ id, nom, quantite }] ; recettes retenues : réglage `placard_selection`
import { dbGetReglage, dbSetReglage, dbEcouter, dbGetLivres, dbUpsertLivre, dbUpsertRecettes } from './db.js'
import { chargerDonnees, remplirDepuisBibliotheque, annulerRemplissage } from './propositions.js'
import { lireInventaire, fusionnerInventaire, couverture, choisirDansBibliotheque, nbRecettesConseille,
         repartirArticles, libelleArticle, utilise } from './placard.js'
import { FILTRES, estEnvie } from './filtres.js'
import { debutCycle, decalerCycle } from './cycle.js'
import { esc, debounce, cleIngredient } from './utils.js'
import { icone } from './icones.js'
import { confirmer, informer, signalerErreur } from './dialogue.js'
import { chargerCredit, htmlEstimation, htmlErreurIA, majBandeau } from './credit-ia-ui.js'
import { expliquerErreur } from './credit-ia.js'
import { apresCreation } from './photos-auto.js'

const CLE_INVENTAIRE = 'inventaire'
const CLE_SELECTION = 'placard_selection'
const NOM_LIVRE = 'Vider le placard'

let inventaire = []      // [{ id, nom, quantite }]
let selection = []       // ids des recettes retenues
let donnees = null       // chargerDonnees() : catalogue, goûts, cycle en cours
let nbIA = 0             // recettes à demander à l'IA
let nbIAChoisi = false   // l'utilisateur a réglé le nombre lui-même
let iaEnCours = false
let credit = null
const mesEcritures = { inventaire: 0, selection: 0 }   // écho temps réel de nos écritures, ignoré

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
  else plan.textContent = `${restants.length} article(s) pas encore utilisé(s)` + (nbIA ? ` : l'IA écrira ${nbIA} recette(s) qui se les partagent.` : '.')
  document.getElementById('placardEstimation').innerHTML = credit && nbIA && restants.length ? htmlEstimation(nbIA, credit) : ''
  document.getElementById('btnPlacardIA').disabled = iaEnCours || !restants.length || !nbIA
  document.getElementById('btnPlacardBiblio').disabled = !inventaire.length || !restants.length
}

// Ingrédients à acheter en plus pour une recette (hors placard et basiques)
const BASIQUES = new Set(['sel', 'poivre', 'eau', 'huile', 'huile d\'olive', 'sucre'])
function aAcheter(r) {
  return (r.ingredients || []).filter(ing => !BASIQUES.has(cleIngredient(ing.nom))
    && !inventaire.some(i => utilise({ ingredients: [ing] }, i))).map(ing => ing.nom)
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
    const achats = aAcheter(r)
    return `<article class="card placard-recette">
      <div class="placard-recette-tete">
        <h3><a href="recettes.html?id=${encodeURIComponent(r.id)}">${esc(r.nom)}</a></h3>
        <button class="courses-item-action" data-oublier="${esc(r.id)}" aria-label="Retirer « ${esc(r.nom)} » de la sélection">${icone('croix')}</button>
      </div>
      <p class="text-sm">${icone('boite')}Utilise : <b>${esc((parRecette[r.id] || []).map(nomArticle).filter(Boolean).join(', ') || '—')}</b></p>
      ${achats.length ? `<p class="text-xs text-muted">À acheter : ${esc(achats.join(', '))}</p>` : '<p class="text-xs text-muted">Rien à acheter.</p>'}
    </article>`
  }).join('')
  document.getElementById('placardRestants').innerHTML = restants.length
    ? `<p class="text-sm placard-restants">${icone('info')}Pas encore utilisés : ${esc(restants.map(i => i.nom).join(', '))}. « Compléter avec l'IA » écrit des recettes pour eux.</p>`
    : ''
}

function afficher() {
  afficherInventaire()
  afficherPlan()
  afficherResultats()
}

// ── Bibliothèque d'abord ──
function chercherDansBibliotheque() {
  const { restants } = couverture(inventaire, recettesRetenues())
  const candidates = donnees.recettes.filter(r => !selection.includes(r.id))
  const choix = choisirDansBibliotheque(restants, candidates, { indexPrefs: donnees.indexPrefs, filtres: filtresChoisis() })
  if (!choix.length) return informer('Aucune de tes recettes n\'utilise au moins 2 de ces articles : « Compléter avec l\'IA » en écrira.')
  const nb = new Set(choix.flatMap(c => c.articles)).size
  sauverSelection([...selection, ...choix.map(c => c.recette.id)])
  informer(`${choix.length} recette(s) de ta bibliothèque utilisent ${nb} article(s) du placard.`, { type: 'ok' })
}

// ── IA pour les articles restants ──
async function livrePlacard() {
  const livres = await dbGetLivres().catch(() => [])
  const existant = livres.find(l => l.nom === NOM_LIVRE)
  if (existant) return existant.id
  return dbUpsertLivre({ nom: NOM_LIVRE, consigne: 'Recettes anti-gaspi construites autour de ce qu\'il y a dans le placard.' })
}

async function completerParIA() {
  const { restants } = couverture(inventaire, recettesRetenues())
  if (!restants.length || !nbIA || iaEnCours) return
  const groupes = repartirArticles(restants, nbIA)
  const portions = Number(document.getElementById('placardPortions').value) || 4
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

// ── Mettre les recettes retenues au planning (repas libres à venir, cycle en cours puis suivants) ──
async function mettreAuPlanning() {
  const retenues = recettesRetenues()
  if (!retenues.length) return
  const bouton = document.getElementById('btnPlacardPlanning')
  bouton.disabled = true
  const annulations = []   // [{ d, resultat }]
  let places = 0
  try {
    let restantes = [...retenues]
    for (let k = 0; k < 3 && restantes.length; k++) {
      const d = await chargerDonnees(decalerCycle(debutCycle(), k))
      const maintenant = Date.now()
      const libres = d.creneaux.filter(c => !d.occupation[c.cle] && !d.absents[c.cle]
        && c.date.getTime() + (c.moment === 'soir' ? 20 : 13) * 3600000 > maintenant)
      if (!libres.length) continue
      const resultat = await remplirDepuisBibliotheque({ ...d, recettes: restantes, reserve: [] }, libres.map(c => c.cle), { filtres: filtresChoisis() })
      annulations.push({ d, resultat })
      const utilisees = new Set(resultat.propositions.map(p => p.recette.id))
      places += utilisees.size
      restantes = restantes.filter(r => !utilisees.has(r.id))
    }
    if (!places) return informer('Aucun repas libre à venir (ou recettes qui ne se conservent pas assez pour les sessions). Libère des repas dans le planning.')
    informer(`${places} recette(s) du placard au planning` + (restantes.length ? ` · ${restantes.length} sans place` : '') + '.', {
      type: 'ok', duree: 10000,
      action: { label: 'Annuler', faire: async () => {
        try { for (const a of annulations) await annulerRemplissage(a.d, a.resultat); informer('Planning remis comme avant.') }
        catch (e) { signalerErreur(e, 'Annulation') }
      } },
    })
  } catch (e) { signalerErreur(e, 'Planning') }
  finally { bouton.disabled = false }
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
    const [inv, sel, d] = await Promise.all([dbGetReglage(CLE_INVENTAIRE), dbGetReglage(CLE_SELECTION), chargerDonnees(debutCycle())])
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
  document.getElementById('btnPlacardBiblio').addEventListener('click', chercherDansBibliotheque)
  document.getElementById('btnPlacardIA').addEventListener('click', completerParIA)
  document.getElementById('btnPlacardPlanning').addEventListener('click', mettreAuPlanning)
  document.getElementById('btnPlacardUtilises')?.addEventListener('click', retirerUtilises)
  document.getElementById('btnPlacardOublier').addEventListener('click', async () => {
    const avant = selection
    await sauverSelection([])
    informer('Sélection effacée (les recettes restent dans la bibliothèque).', { action: { label: 'Annuler', faire: () => sauverSelection(avant) } })
  })
  document.getElementById('placardRecettes').addEventListener('click', e => {
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
      if (selection.some(id => !donnees.recettesMap[id])) donnees = await chargerDonnees(debutCycle()).catch(() => donnees)
      selection = selection.filter(id => donnees.recettesMap[id])
      afficher()
    }
  })
  dbEcouter(['recettes'], debounce(async () => {
    if (iaEnCours) return
    donnees = await chargerDonnees(debutCycle()).catch(() => donnees)
    afficher()
  }, 800))
})
