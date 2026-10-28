// js/placard-ui.js — Page « Vider le placard » : inventaire partagé, recettes qui l'utilisent (mode indépendant :
// ni le planning ni les courses n'en dépendent ; ses recettes ne sont pas proposées ailleurs)
// Inventaire : réglage partagé `inventaire` [{ id, nom, quantite, vite? }] ; recettes retenues : réglage `placard_selection`
import { dbGetReglage, dbSetReglage, dbEcouter, dbGetLivres, dbUpsertLivre, dbUpsertRecettes } from './db.js'
import { chargerDonnees } from './propositions.js'
import { NOM_LIVRE_PLACARD, lireInventaire, fusionnerInventaire, fusionnerModifications, couverture, choisirDansBibliotheque,
         nbRecettesConseille, nbRecettesMinimum, nbBases, repartirArticles, recetteFourreTout, statutArticle, apresCuisson,
         ordreConseille, aAcheter, markdownPlacard, MAX_RECETTES_IA, MAX_ARTICLES_PAR_RECETTE } from './placard.js'
import { FILTRES, estEnvie } from './filtres.js'
import { debutCycle, dateIso } from './cycle.js'
import { esc, debounce, categoriser, ORDRE_RAYONS } from './utils.js'
import { exporterFichier, nomDeFichier } from './fichier.js'
import { icone } from './icones.js'
import { confirmer, informer, signalerErreur } from './dialogue.js'
import { chargerCredit, htmlEstimation, htmlErreurIA, majBandeau } from './credit-ia-ui.js'
import { expliquerErreur } from './credit-ia.js'
import { apresCreation } from './photos-auto.js'
import { getAllIngredients } from './custom-ingredients.js'

const CLE_INVENTAIRE = 'inventaire'
const CLE_SELECTION = 'placard_selection'
const CLE_CUISINEES = 'placard_cuisinees'   // recettes déjà cuisinées pour ce placard : plus reproposées

let inventaire = []      // [{ id, nom, quantite, vite? }]
let inventaireServeur = []  // dernière version lue ou écrite (base de la fusion entre téléphones)
let selection = []       // ids des recettes retenues
let cuisinees = []       // ids des recettes déjà cuisinées pour ce placard
let donnees = null       // chargerDonnees() : catalogue, goûts
let nomsConnus = []      // noms de la base d'ingrédients (saisie homogène)
let nbIA = 0             // recettes à demander à l'IA
let nbIAChoisi = false   // l'utilisateur a réglé le nombre lui-même
let iaEnCours = false
let credit = null

const portionsChoisies = () => Number(document.getElementById('placardPortions')?.value) || 4
const recettesRetenues = () => selection.map(id => donnees?.recettesMap[id]).filter(Boolean)
const filtresChoisis = () => [...document.querySelectorAll('#placardFiltres .chip.active')].map(c => c.dataset.filtre)
// Articles qu'aucune recette n'utilisera (pas halal, détestés) : signalés, hors recettes et hors jauge
const statut = i => statutArticle(i, donnees?.indexPrefs || [])
const actifs = () => inventaire.filter(i => !statut(i))
const etat = () => couverture(actifs(), recettesRetenues(), { portions: portionsChoisies() })

// ── Enregistrement partagé : on fusionne avec la version du serveur (l'autre téléphone a pu écrire entre-temps).
// Les enregistrements partent un par un (deux modifications rapprochées ne s'écrasent pas) ──
let fileEcriture = Promise.resolve()
function modifierInventaire(changer) {
  const avant = inventaire
  inventaire = changer(inventaire)
  afficher()
  const ecriture = fileEcriture.then(() => envoyerInventaire(avant))
  fileEcriture = ecriture.catch(() => {})
  return ecriture
}
async function envoyerInventaire(avant) {
  try {
    const serveur = await dbGetReglage(CLE_INVENTAIRE)
    const fusion = fusionnerModifications(inventaireServeur, inventaire, Array.isArray(serveur) ? serveur : [])
    await dbSetReglage(CLE_INVENTAIRE, fusion)
    inventaireServeur = fusion
    inventaire = fusion
    afficher()
  } catch (e) { inventaire = avant; afficher(); signalerErreur(e, 'Placard') }
}
async function sauverSelection(suivant) {
  selection = [...new Set(suivant)]
  afficher()
  try { await dbSetReglage(CLE_SELECTION, selection) } catch (e) { signalerErreur(e, 'Sélection') }
}

// ── Affichage ──
function afficherInventaire() {
  document.getElementById('placardCompte').textContent = inventaire.length ? `(${inventaire.length})` : ''
  document.getElementById('btnViderInventaire').classList.toggle('hidden', !inventaire.length)
  const { utilises, partiels } = etat()
  const ligne = i => {
    const st = statut(i)
    const pris = utilises.has(i.id) && !partiels.has(i.id)
    const note = st ? `<span class="placard-alerte">${icone('flamme')}${esc(st.raison)} : aucune recette ne l'utilisera</span>`
      : partiels.has(i.id) ? `<span class="text-xs text-muted">recettes : ${esc(partiels.get(i.id).besoin)} · reste ${esc(partiels.get(i.id).reste)}</span>` : ''
    return `<li class="placard-item${pris ? ' placard-utilise' : ''}${st ? ' placard-exclu' : ''}">
      <span class="placard-nom">${pris ? icone('check', { label: 'utilisé par une recette retenue' }) : ''}<span>${esc(i.nom)}${note}</span></span>
      <input class="form-input placard-qte" type="text" value="${esc(i.quantite)}" placeholder="quantité" data-qte="${esc(i.id)}" aria-label="Quantité de ${esc(i.nom)}">
      <button class="courses-item-action placard-vite${i.vite ? ' actif' : ''}" data-vite="${esc(i.id)}" aria-pressed="${!!i.vite}" aria-label="${esc(i.nom)} : à finir vite">${icone('flamme')}</button>
      <button class="courses-item-action" data-retirer="${esc(i.id)}" aria-label="Retirer ${esc(i.nom)} du placard">${icone('croix')}</button>
    </li>`
  }
  // Groupé par rayon, comme la liste de courses
  const parRayon = ORDRE_RAYONS.map(r => [r, inventaire.filter(i => categoriser(i.nom) === r).sort((a, b) => (b.vite ? 1 : 0) - (a.vite ? 1 : 0) || a.nom.localeCompare(b.nom))])
    .filter(([, items]) => items.length)
  document.getElementById('placardListe').innerHTML = inventaire.length
    ? parRayon.map(([r, items]) => `<li class="placard-rayon"><h3 class="courses-group-title">${r} <span class="text-muted">(${items.length})</span></h3>
        <ul>${items.map(ligne).join('')}</ul></li>`).join('')
    : '<li class="text-sm text-muted">Le placard est vide : ajoute ce que tu as (conserves, féculents, épices, surgelés…).</li>'
}

function afficherPlan() {
  const { restants } = etat()
  const bases = nbBases(restants)
  // Jamais une recette fourre-tout : au moins assez de recettes pour 4 articles de base chacune au plus
  const minimum = nbRecettesMinimum(bases)
  if (!nbIAChoisi) nbIA = nbRecettesConseille(bases)
  nbIA = Math.max(minimum, Math.min(nbIA, MAX_RECETTES_IA, Math.max(bases, minimum)))
  document.getElementById('placardNbIA').textContent = nbIA
  document.querySelector('[data-nb="-1"]').disabled = nbIA <= minimum
  document.querySelector('[data-nb="1"]').disabled = nbIA >= Math.min(MAX_RECETTES_IA, bases)
  const plan = document.getElementById('placardPlan')
  const exclus = inventaire.length - actifs().length
  if (!inventaire.length) plan.textContent = ''
  else if (!restants.length) plan.innerHTML = `${icone('check')}Tout le placard utilisable est pris par les recettes retenues.`
  else plan.textContent = `${restants.length} article(s) à placer : tes recettes existantes d'abord`
    + (nbIA ? `, puis l'IA écrira jusqu'à ${nbIA} recettes différentes, chacune avec ${MAX_ARTICLES_PAR_RECETTE} articles de base au plus.` : '.')
    + (bases > MAX_RECETTES_IA * MAX_ARTICLES_PAR_RECETTE ? ` Les derniers attendront un second passage.` : '')
    + (exclus ? ` ${exclus} article(s) écarté(s) (halal ou goûts).` : '')
  // Coût : au plus celui de nbIA recettes (les recettes existantes peuvent en éviter)
  document.getElementById('placardEstimation').innerHTML = credit && nbIA && restants.length
    ? `<p class="text-xs text-muted">Au plus :</p>${htmlEstimation(nbIA, credit)}` : ''
  document.getElementById('btnPlacardIA').disabled = iaEnCours || !restants.length
  document.getElementById('btnPlacardBiblio').disabled = iaEnCours || !restants.length
}

function afficherResultats() {
  const zone = document.getElementById('placardResultats')
  const { recettes: retenues, prioritaires } = ordreConseille(recettesRetenues(), actifs())
  zone.classList.toggle('hidden', !retenues.length)
  if (!retenues.length) return
  const { parRecette, utilises, partiels, restants } = etat()
  const pleins = [...utilises].filter(id => !partiels.has(id)).length
  const total = actifs().length
  const pct = total ? Math.round(pleins / total * 100) : 0
  document.getElementById('placardCouverture').textContent = `${pleins} / ${total} articles utilisés` + (partiels.size ? ` · ${partiels.size} en partie` : '')
  const jauge = document.getElementById('placardJauge')
  jauge.setAttribute('aria-valuenow', pct)
  jauge.querySelector('.placard-barre-rempli').style.width = `${pct}%`
  const nomArticle = id => inventaire.find(i => i.id === id)?.nom
  const n = portionsChoisies()
  document.getElementById('placardRecettes').innerHTML = retenues.map(r => {
    const achats = aAcheter(r, actifs())
    const articles = parRecette[r.id] || []
    return `<article class="card placard-recette${prioritaires.has(r.id) ? ' placard-prioritaire' : ''}">
      <div class="placard-recette-tete">
        <h3><a href="recettes.html?id=${encodeURIComponent(r.id)}&portions=${n}">${esc(r.nom)}</a></h3>
        <button class="courses-item-action" data-oublier="${esc(r.id)}" aria-label="Retirer « ${esc(r.nom)} » de la sélection">${icone('croix')}</button>
      </div>
      ${prioritaires.has(r.id) ? `<p class="text-xs placard-badge">${icone('flamme')}À cuisiner en premier</p>` : ''}
      ${articles.length
        ? `<p class="text-sm">${icone('boite')}Utilise : <b>${esc(articles.map(nomArticle).filter(Boolean).join(', '))}</b></p>`
        : `<p class="text-sm placard-alerte">${icone('info')}N'utilise plus rien du placard</p>`}
      ${achats.length ? `<p class="text-xs text-muted">À acheter : ${esc(achats.join(', '))}</p>` : '<p class="text-xs text-muted">Rien à acheter.</p>'}
      <div class="placard-recette-actions">
        <button class="btn btn-secondary btn-sm" data-cuisiner="${esc(r.id)}">${icone('marmite')}Cuisiner pour ${n}</button>
        <button class="btn btn-ghost btn-sm" data-cuisine="${esc(r.id)}">${icone('check')}Cuisiné</button>
        ${articles.length ? `<button class="btn btn-ghost btn-sm" data-autre="${esc(r.id)}" ${iaEnCours ? 'disabled' : ''}>${icone('autre')}Autre recette</button>` : ''}
      </div>
    </article>`
  }).join('')
  document.getElementById('placardRestants').innerHTML = restants.length
    ? `<p class="text-sm placard-restants">${icone('info')}Encore à placer : ${esc(restants.map(i => `${i.nom}${partiels.has(i.id) ? ` (${i.quantite})` : ''}`).join(', '))}. « Trouver les recettes » en fera écrire par l'IA.</p>`
    : ''
}

function afficher() {
  afficherInventaire()
  afficherPlan()
  afficherResultats()
}

// ── Bibliothèque d'abord : toutes les recettes existantes (y compris celles déjà écrites pour le placard) ──
async function chercherDansBibliotheque({ silencieux = false } = {}) {
  const { restants } = etat()
  const candidates = donnees.recettes.filter(r => !selection.includes(r.id) && !cuisinees.includes(r.id))
  const choix = choisirDansBibliotheque(restants, candidates, { indexPrefs: donnees.indexPrefs, filtres: filtresChoisis() })
  if (!choix.length) {
    if (!silencieux) informer('Aucune de tes recettes n\'utilise ces articles : « Trouver les recettes » en fera écrire par l\'IA.')
    return 0
  }
  const nb = new Set(choix.flatMap(c => c.articles)).size
  await sauverSelection([...selection, ...choix.map(c => c.recette.id)])
  informer(`${choix.length} recette(s) déjà enregistrée(s) utilisent ${nb} article(s) du placard.`, { type: 'ok' })
  return choix.length
}

// « Trouver les recettes » : recettes existantes d'abord, puis l'IA seulement pour ce qui reste
async function trouverRecettes() {
  if (iaEnCours) return
  await chercherDansBibliotheque({ silencieux: true })
  const { restants } = etat()
  if (!restants.length) return informer('Tes recettes existantes suffisent : tout le placard est utilisé.', { type: 'ok' })
  await completerParIA(restants, nbIA)
}

// ── IA ──
async function livrePlacard() {
  const livres = await dbGetLivres().catch(() => [])
  const existant = livres.find(l => l.nom === NOM_LIVRE_PLACARD)
  if (existant) return existant.id
  return dbUpsertLivre({ nom: NOM_LIVRE_PLACARD, consigne: 'Recettes anti-gaspi construites autour de ce qu\'il y a dans le placard.' })
}

/** L'IA écrit `nb` recettes pour `articles` (répartis, 4 de base au plus chacune) ; `remplace` : id d'une recette à remplacer */
async function completerParIA(articles, nb, { remplace = null } = {}) {
  if (!articles.length || !nb || iaEnCours) return
  const groupes = repartirArticles(articles, nb)
  const fourreTout = []
  const portions = portionsChoisies()
  const bandeau = e => majBandeau(document.getElementById('bandeauIA'), e)
  iaEnCours = true
  afficher()
  bandeau({ etat: 'encours', texte: `L'IA écrit ${groupes.length} recette(s) avec ton placard…`, pct: 3 })
  try {
    const { genererPourPlacard } = await import('./ai.js')
    const livreId = await livrePlacard().catch(() => null)
    let ajoutees = 0
    const { rejets, erreurs } = await genererPourPlacard({
      groupes, inventaire: actifs(), portions, filtres: filtresChoisis(), style: document.getElementById('placardIdee').value.trim(),
      nomsExistants: donnees.recettes.map(r => r.nom),
    },
    k => bandeau({ etat: 'encours', texte: `Placard : ${k} / ${groupes.length} recette(s)`, pct: Math.max(3, k / groupes.length * 95) }),
    async lot => {
      // Une recette qui met presque tout le placard dans un seul plat est écartée
      const gardees = lot.filter(x => {
        if (!recetteFourreTout(x.recette, actifs(), x.creneau.articles)) return true
        fourreTout.push(x.recette.nom)
        return false
      })
      if (!gardees.length) return
      const recettes = gardees.map(x => ({ ...x.recette, livre_id: livreId }))
      const ids = await dbUpsertRecettes(recettes)
      recettes.forEach((r, i) => { const rec = { ...r, id: ids[i] }; donnees.recettes.unshift(rec); donnees.recettesMap[rec.id] = rec })
      apresCreation(recettes.map((r, i) => ({ ...r, id: ids[i] })))
      ajoutees += ids.length
      await sauverSelection([...selection.filter(id => id !== remplace), ...ids])
    })
    const { restants: encore } = etat()
    const ecartees = [...rejets, ...fourreTout.map(n => `${n} (trop d'articles du placard dans un seul plat)`)]
    const detail = (ecartees.length ? `<p class="text-xs">Écartées : ${esc(ecartees.join(', '))}</p>` : '')
      + [...new Map(erreurs.map(e => [e.code, e])).values()].map(e => htmlErreurIA(e)).join('')
    bandeau({ etat: encore.length || detail ? 'partiel' : 'fini',
      texte: `${ajoutees} recette(s) ajoutée(s)` + (encore.length ? ` · ${encore.length} article(s) encore à placer` : ' · tout le placard est utilisé'), detail })
  } catch (e) {
    bandeau({ etat: 'erreur', texte: 'Aucune recette créée', detail: htmlErreurIA(e.info || expliquerErreur('INCONNUE', e.message)) })
  } finally {
    iaEnCours = false
    afficher()
  }
}

// « Autre recette » : une recette existante qui utilise les mêmes articles, sinon une nouvelle par l'IA
async function autreRecette(id) {
  const r = donnees.recettesMap[id]
  const { parRecette } = couverture(actifs(), [r])
  const articles = actifs().filter(i => (parRecette[id] || []).includes(i.id))
  if (!articles.length) return
  const candidates = donnees.recettes.filter(x => !selection.includes(x.id) && !cuisinees.includes(x.id) && x.id !== id)
  const [choix] = choisirDansBibliotheque(articles, candidates, { indexPrefs: donnees.indexPrefs, filtres: filtresChoisis(), max: 1, minimum: Math.min(2, articles.length) })
  if (choix) {
    await sauverSelection(selection.map(x => (x === id ? choix.recette.id : x)))
    return informer(`« ${r.nom} » remplacée par « ${choix.recette.nom} » (déjà dans tes recettes).`, { type: 'ok' })
  }
  await completerParIA(articles, 1, { remplace: id })
}

// « Cuisiné » : les articles de cette recette sortent du placard (ou leur quantité baisse) et elle quitte la sélection
async function cuisine(id) {
  const r = donnees.recettesMap[id]
  const avantInv = inventaire, avantSel = selection
  const { retires, diminues } = apresCuisson(inventaire, r, portionsChoisies(), recettesRetenues())
  const avantCuisinees = cuisinees
  await modifierInventaire(inv => apresCuisson(inv, r, portionsChoisies(), recettesRetenues()).inventaire)
  await sauverSelection(selection.filter(x => x !== id))
  await sauverCuisinees([...cuisinees, id])
  const detail = [retires.length ? `${retires.join(', ')} retiré(s)` : '', diminues.map(d => `${d.nom} : reste ${d.quantite}`).join(', ')].filter(Boolean).join(' · ')
  informer(`« ${r.nom} » cuisinée. ${detail || 'Placard inchangé.'}`, { duree: 8000, action: { label: 'Annuler', faire: async () => {
    await modifierInventaire(() => avantInv)
    await sauverSelection(avantSel)
    await sauverCuisinees(avantCuisinees)
  } } })
}

async function sauverCuisinees(suivant) {
  cuisinees = [...new Set(suivant)]
  try { await dbSetReglage(CLE_CUISINEES, cuisinees) } catch (e) { signalerErreur(e, 'Placard') }
}

// « Tout est cuisiné » : toutes les recettes retenues, une par une
async function toutCuisine() {
  const retenues = recettesRetenues()
  if (!retenues.length) return
  if (!await confirmer(`Les articles des ${retenues.length} recettes retenues sortent du placard (ou leur quantité baisse).`, { titre: 'Tout est cuisiné ?', ok: 'Oui' })) return
  const avantInv = inventaire, avantSel = selection
  const avantCuisinees = cuisinees
  await modifierInventaire(inv => retenues.reduce((acc, r) => apresCuisson(acc, r, portionsChoisies(), []).inventaire, inv))
  await sauverSelection([])
  await sauverCuisinees([...cuisinees, ...retenues.map(r => r.id)])
  informer('Placard mis à jour.', { action: { label: 'Annuler', faire: async () => { await modifierInventaire(() => avantInv); await sauverSelection(avantSel); await sauverCuisinees(avantCuisinees) } } })
}

// ── Initialisation ──
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [inv, sel, d, ingredients, cuites] = await Promise.all([dbGetReglage(CLE_INVENTAIRE), dbGetReglage(CLE_SELECTION),
      chargerDonnees(debutCycle(), { avecPlacard: true }), getAllIngredients().catch(() => []), dbGetReglage(CLE_CUISINEES).catch(() => null)])
    cuisinees = Array.isArray(cuites) ? cuites : []
    inventaire = Array.isArray(inv) ? inv : []
    inventaireServeur = inventaire
    donnees = d
    nomsConnus = ingredients.map(i => i.nom)
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
    const nouveaux = lireInventaire(champ.value, { noms: nomsConnus })
    if (!nouveaux.length) return
    champ.value = ''
    modifierInventaire(inv => fusionnerInventaire(inv, nouveaux))
    const exclus = nouveaux.filter(statut)
    informer(`${nouveaux.length} article(s) ajouté(s).` + (exclus.length ? ` ${exclus.map(i => `${i.nom} (${statut(i).raison})`).join(', ')} : aucune recette ne l'utilisera.` : ''),
      { type: exclus.length ? 'info' : 'ok', duree: exclus.length ? 7000 : 2500 })
    champ.focus()
  })
  // Entrée valide, Maj + Entrée passe à la ligne
  document.getElementById('champPlacard').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('formPlacard').requestSubmit() }
  })
  document.getElementById('placardListe').addEventListener('change', e => {
    const champ = e.target.closest('[data-qte]'); if (!champ) return
    modifierInventaire(inv => inv.map(i => (i.id === champ.dataset.qte ? { ...i, quantite: champ.value.trim() } : i)))
  })
  document.getElementById('placardListe').addEventListener('click', e => {
    const vite = e.target.closest('[data-vite]')
    if (vite) {
      modifierInventaire(inv => inv.map(i => (i.id === vite.dataset.vite ? { ...i, vite: !i.vite } : i)))
      return requestAnimationFrame(() => document.querySelector(`[data-vite="${CSS.escape(vite.dataset.vite)}"]`)?.focus())
    }
    const b = e.target.closest('[data-retirer]'); if (!b) return
    const item = inventaire.find(i => i.id === b.dataset.retirer)
    modifierInventaire(inv => inv.filter(i => i.id !== b.dataset.retirer))
    informer(`${item?.nom} retiré.`, { action: { label: 'Annuler', faire: () => modifierInventaire(inv => fusionnerInventaire(inv, [item])) } })
  })
  document.getElementById('btnViderInventaire').addEventListener('click', async () => {
    if (!await confirmer('Tous les articles du placard seront effacés.', { titre: 'Tout effacer ?', ok: 'Effacer', danger: true })) return
    const avant = inventaire
    const avantCuisinees = cuisinees
    await modifierInventaire(() => [])
    await sauverCuisinees([])
    informer('Placard effacé.', { action: { label: 'Annuler', faire: async () => { await modifierInventaire(inv => fusionnerInventaire(inv, avant)); await sauverCuisinees(avantCuisinees) } } })
  })
  document.querySelector('.placard-options .pas-a-pas').addEventListener('click', e => {
    const b = e.target.closest('[data-nb]'); if (!b) return
    nbIA = nbIA + Number(b.dataset.nb)   // bornes (minimum sans fourre-tout, maximum) appliquées par afficherPlan
    nbIAChoisi = true                    // gardé jusqu'au prochain changement du placard
    afficherPlan()
  })
  document.getElementById('placardFiltres').addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return
    chip.classList.toggle('active')
    chip.setAttribute('aria-pressed', chip.classList.contains('active'))
  })
  document.getElementById('btnPlacardBiblio').addEventListener('click', () => chercherDansBibliotheque())
  document.getElementById('btnPlacardIA').addEventListener('click', trouverRecettes)
  document.getElementById('btnPlacardUtilises')?.addEventListener('click', toutCuisine)
  // Export .md : inventaire, recettes retenues (ingrédients pour le nombre de personnes choisi, étapes), restants
  document.getElementById('btnExporterPlacard').addEventListener('click', () => {
    if (!inventaire.length) return informer('Le placard est vide : rien à exporter.')
    exporterFichier(nomDeFichier(`placard ${dateIso(new Date())}`),
      markdownPlacard(inventaire, ordreConseille(recettesRetenues(), actifs()).recettes,
        { titre: `Vider le placard · ${new Date().toLocaleDateString('fr-FR')}`, portions: portionsChoisies() }))
  })
  document.getElementById('btnPlacardOublier').addEventListener('click', async () => {
    const avant = selection
    await sauverSelection([])
    informer('Sélection effacée (les recettes restent dans la bibliothèque).', { action: { label: 'Annuler', faire: () => sauverSelection(avant) } })
  })
  document.getElementById('placardPortions').addEventListener('change', afficher)
  document.getElementById('placardRecettes').addEventListener('click', async e => {
    const b = e.target.closest('[data-cuisiner], [data-cuisine], [data-autre], [data-oublier]'); if (!b) return
    try {
      if (b.dataset.cuisiner) {
        const r = donnees.recettesMap[b.dataset.cuisiner]
        const { ouvrirModeCuisine } = await import('./mode-cuisine.js')
        return ouvrirModeCuisine([{ recette: r, portions: portionsChoisies() }], r.nom)
      }
      if (b.dataset.cuisine) return await cuisine(b.dataset.cuisine)
      if (b.dataset.autre) return await autreRecette(b.dataset.autre)
      const avant = selection
      await sauverSelection(selection.filter(id => id !== b.dataset.oublier))
      informer('Recette retirée de la sélection.', { action: { label: 'Annuler', faire: () => sauverSelection(avant) } })
    } catch (err) { signalerErreur(err, 'Placard') }
  })
  window.addEventListener('beforeunload', e => { if (iaEnCours) { e.preventDefault(); e.returnValue = '' } })

  // Temps réel : l'autre téléphone remplit le placard en même temps ; nos propres écritures (même contenu) sont ignorées
  dbEcouter(['reglages'], async payload => {
    const cle = payload?.new?.cle || payload?.old?.cle
    if (cle === CLE_INVENTAIRE) {
      const v = await dbGetReglage(CLE_INVENTAIRE).catch(() => null)
      const serveur = Array.isArray(v) ? v : []
      if (JSON.stringify(serveur) === JSON.stringify(inventaireServeur)) return
      // Nos modifications pas encore envoyées sont gardées par-dessus
      inventaire = fusionnerModifications(inventaireServeur, inventaire, serveur)
      inventaireServeur = serveur
      nbIAChoisi = false
      afficher()
    }
    if (cle === CLE_SELECTION) {
      const v = await dbGetReglage(CLE_SELECTION).catch(() => null)
      const serveur = Array.isArray(v) ? v : []
      if (JSON.stringify(serveur) === JSON.stringify(selection)) return
      // Recettes créées sur l'autre téléphone : catalogue rechargé
      if (serveur.some(id => !donnees.recettesMap[id])) donnees = await chargerDonnees(debutCycle(), { avecPlacard: true }).catch(() => donnees)
      selection = serveur.filter(id => donnees.recettesMap[id])
      afficher()
    }
  })
  dbEcouter(['recettes'], debounce(async () => {
    if (iaEnCours) return
    donnees = await chargerDonnees(debutCycle(), { avecPlacard: true }).catch(() => donnees)
    afficher()
  }, 800))
})
