// js/livres-ui.js — Livres de recettes : barre de livres, création / édition, génération IA d'un livre
import { dbGetLivres, dbUpsertLivre, dbDeleteLivre, dbUpsertRecettes, dbSetImageRecette } from './db.js'
import { genererPourLivre, genererImageRecette } from './ai.js'
import { FILTRES } from './filtres.js'
import { expliquerErreur, coutImage, formatDollars } from './credit-ia.js'
import { photosAutoActives, ERREURS_BLOQUANTES } from './photos-auto.js'
import { chargerCredit, htmlEstimation, htmlErreurIA, majBandeau } from './credit-ia-ui.js'
import { esc } from './utils.js'
import { NOM_LIVRE_PLACARD } from './placard.js'
import { icone } from './icones.js'
import { confirmer, signalerErreur } from './dialogue.js'

const NB_MAX = 20

let livres = []
let livreActif = null      // id du livre affiché, null = toutes les recettes
let iaEnCours = false
let onChange = () => {}    // rappel de la page (re-rendu de la liste)
let getNoms = () => []     // noms des recettes existantes (à ne pas reproposer)
let sansPhoto = []         // recettes du livre affiché sans photo

export const getLivres = () => livres
export const getLivreActif = () => livreActif
export const nomLivre = id => livres.find(l => l.id === id)?.nom || ''

export async function chargerLivres() {
  livres = await dbGetLivres().catch(() => [])
  if (livreActif && !livres.some(l => l.id === livreActif)) livreActif = null
  return livres
}

// Pastilles « Toutes · Air fryer (12) · + Livre » et en-tête du livre choisi
export function renderLivres(recettes) {
  const compte = id => recettes.filter(r => r.livre_id === id).length
  document.getElementById('livresBar').innerHTML =
    `<button class="chip ${livreActif ? '' : 'active'}" data-livre="">Toutes</button>`
    + livres.map(l => `<button class="chip ${livreActif === l.id ? 'active' : ''}" data-livre="${esc(l.id)}">${icone('livre')}${esc(l.nom)} <span class="livre-compte">${compte(l.id)}</span></button>`).join('')
    + `<button class="chip chip-nouveau" data-nouveau-livre>${icone('plus')}Livre</button>`

  const livre = livres.find(l => l.id === livreActif)
  sansPhoto = livre ? recettes.filter(r => r.livre_id === livre.id && !r.image_url) : []
  document.getElementById('livreEntete').innerHTML = livre ? `<section class="card livre-entete">
      <div class="livre-entete-titre">${icone('livre')}<h2>${esc(livre.nom)}</h2></div>
      ${livre.consigne ? `<p class="text-sm text-muted">${esc(livre.consigne)}</p>` : ''}
      ${livre.nom === NOM_LIVRE_PLACARD ? `<p class="text-sm">${icone('info')}Recettes de « Vider le placard » : elles ne sont pas proposées dans le planning. <a href="placard.html">Ouvrir le placard</a></p>` : ''}
      <div class="livre-entete-actions">
        <button class="btn btn-accent btn-sm" data-gen-livre ${iaEnCours ? 'disabled' : ''}>${icone('etincelle')}${iaEnCours ? 'Génération en cours…' : 'Générer des recettes'}</button>
        ${sansPhoto.length ? `<button class="btn btn-ghost btn-sm" data-photos-livre ${iaEnCours ? 'disabled' : ''}
          title="≈ ${formatDollars(coutImage().cout * sansPhoto.length)}">${icone('etincelle')}Photos manquantes (${sansPhoto.length})</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-edit-livre>${icone('crayon')}Modifier</button>
        <button class="btn btn-ghost btn-sm livre-supprimer" data-suppr-livre>${icone('poubelle')}Supprimer</button>
      </div>
    </section>` : ''
}

// ── Création / édition ───────────────────────────────────────────────
let livreEnEdition = null
function ouvrirFormLivre(livre = null) {
  livreEnEdition = livre
  document.getElementById('livreTitre').textContent = livre ? 'Modifier le livre' : 'Nouveau livre'
  document.getElementById('livreNom').value = livre?.nom || ''
  document.getElementById('livreConsigne').value = livre?.consigne || ''
  document.getElementById('modalLivre').classList.remove('hidden')
  document.getElementById('livreNom').focus()
}

async function enregistrerLivre(e) {
  e.preventDefault()
  const nom = document.getElementById('livreNom').value.trim()
  if (!nom) return
  const consigne = document.getElementById('livreConsigne').value.trim() || null
  try {
    const id = await dbUpsertLivre({ ...(livreEnEdition ? { id: livreEnEdition.id } : {}), nom, consigne })
    livreActif = id
    document.getElementById('modalLivre').classList.add('hidden')
    await chargerLivres()
    await onChange()
  } catch (err) { signalerErreur(err, 'Livre') }
}

async function supprimerLivre() {
  const livre = livres.find(l => l.id === livreActif)
  if (!livre || !await confirmer('Ses recettes restent dans la bibliothèque.', { titre: `Supprimer le livre « ${livre.nom} » ?`, ok: 'Supprimer', danger: true })) return
  try { await dbDeleteLivre(livre.id) } catch (e) { return signalerErreur(e, 'Livre') }
  livreActif = null
  await chargerLivres()
  await onChange()
}

// ── Génération IA pour le livre ──────────────────────────────────────
let nbGen = 3
let credit = null

function majEstimation() {
  document.getElementById('genLivreNb').textContent = nbGen
  document.getElementById('genLivrePhotosCout').textContent = `(≈ ${formatDollars(coutImage().cout * nbGen)} en plus)`
  document.querySelector('[data-nb="-1"]').disabled = nbGen <= 1
  document.querySelector('[data-nb="1"]').disabled = nbGen >= NB_MAX
  document.querySelectorAll('[data-nb-fixe]').forEach(b => {
    const actif = Number(b.dataset.nbFixe) === nbGen
    b.classList.toggle('active', actif)
    b.setAttribute('aria-pressed', actif)
  })
  document.getElementById('genLivreEstimation').innerHTML = credit ? htmlEstimation(nbGen, credit) : ''
}

function ouvrirGenLivre() {
  const livre = livres.find(l => l.id === livreActif)
  if (!livre) return
  document.getElementById('genLivreTitre').textContent = `Générer pour « ${livre.nom} »`
  document.getElementById('genLivreConsigne').textContent = livre.consigne ? `Règle du livre : ${livre.consigne}` : 'Ce livre n\'a pas de règle : ajoute-en une avec « Modifier » pour guider l\'IA.'
  document.getElementById('genLivreFiltres').innerHTML = FILTRES.map(f =>
    `<button type="button" class="chip" data-filtre="${f.id}">${f.label}</button>`).join('')
  document.getElementById('genLivreIdee').value = ''
  document.getElementById('genLivreStatus').textContent = ''
  photosAutoActives().then(a => { document.getElementById('genLivrePhotos').checked = a }) // réglage « photos automatiques »
  majEstimation()
  chargerCredit().then(c => { credit = c; majEstimation() })
  document.getElementById('modalGenLivre').classList.remove('hidden')
}

// Photos une par une (le bandeau suit) ; renvoie les erreurs expliquées
async function genererPhotos(recettes, bandeau, prefixe) {
  const erreurs = []
  let faites = 0
  for (const r of recettes) {
    bandeau({ etat: 'encours', texte: `${prefixe} : photo ${faites + 1} / ${recettes.length}`, pct: Math.max(3, faites / recettes.length * 95) })
    try {
      await dbSetImageRecette(r.id, await genererImageRecette(r))
      faites++
      await onChange()
    } catch (e) {
      erreurs.push(e.info || expliquerErreur('INCONNUE', e.message))
      // Crédit épuisé, clé refusée… : inutile d'insister pour les suivantes
      if (ERREURS_BLOQUANTES.includes(erreurs.at(-1).code)) break
    }
  }
  return { faites, erreurs }
}

const htmlErreursUniques = (erreurs) => {
  const codes = new Set()
  return erreurs.filter(e => !codes.has(e.code) && codes.add(e.code)).map(e => htmlErreurIA(e)).join('')
}

async function photosManquantes() {
  const livre = livres.find(l => l.id === livreActif)
  if (!livre || iaEnCours || !sansPhoto.length) return
  const cibles = [...sansPhoto]
  const bandeau = etat => majBandeau(document.getElementById('bandeauIA'), etat)
  iaEnCours = true
  await onChange()
  try {
    const { faites, erreurs } = await genererPhotos(cibles, bandeau, `« ${livre.nom} »`)
    bandeau({ etat: faites === cibles.length ? 'fini' : faites ? 'partiel' : 'erreur',
      texte: `${faites} photo(s) ajoutée(s)` + (faites < cibles.length ? ` · ${cibles.length - faites} manquante(s)` : ''),
      detail: htmlErreursUniques(erreurs) })
    if (faites === cibles.length) setTimeout(() => document.getElementById('bandeauIA').classList.add('hidden'), 6000)
  } finally {
    iaEnCours = false
    await onChange()
  }
}

async function lancerGeneration() {
  const livre = livres.find(l => l.id === livreActif)
  if (!livre || iaEnCours) return
  const avecPhotos = document.getElementById('genLivrePhotos').checked
  const filtres  = [...document.querySelectorAll('#genLivreFiltres .chip.active')].map(c => c.dataset.filtre)
  const style    = document.getElementById('genLivreIdee').value.trim()
  const portions = Math.min(12, Math.max(1, parseInt(document.getElementById('genLivrePortions').value, 10) || 4))
  const total = nbGen
  const bandeau = etat => majBandeau(document.getElementById('bandeauIA'), etat)

  document.getElementById('modalGenLivre').classList.add('hidden')
  iaEnCours = true
  await onChange()
  bandeau({ etat: 'encours', texte: `L'IA écrit ${total} recette(s) pour « ${livre.nom} »…`, pct: 3 })
  try {
    const creees = [] // { id, ...recette } pour les photos
    const { resultats, rejets, erreurs } = await genererPourLivre(
      { livre, nb: total, portions, filtres, style, nomsExistants: getNoms() },
      n => bandeau({ etat: 'encours', texte: `« ${livre.nom} » : ${n} / ${total} recette(s)`, pct: Math.max(3, n / total * 95) }),
      async lot => {
        const recettes = lot.map(x => ({ ...x.recette, livre_id: livre.id }))
        const ids = await dbUpsertRecettes(recettes)
        creees.push(...recettes.map((r, i) => ({ ...r, id: ids[i] })))
        await onChange()
      })
    // Photos après les recettes (elles sont déjà enregistrées : une photo ratée ne fait rien perdre)
    const photos = avecPhotos && creees.length ? await genererPhotos(creees, bandeau, `« ${livre.nom} »`) : null
    const manquantes = total - resultats.length
    const detail = (rejets.length ? `<p class="text-xs">Écartées (contraintes ou en double) : ${esc(rejets.join(', '))}</p>` : '')
      + htmlErreursUniques([...erreurs, ...(photos?.erreurs || [])])
    bandeau({ etat: manquantes || (photos && photos.faites < creees.length) ? 'partiel' : 'fini',
      texte: `${resultats.length} recette(s) ajoutée(s) à « ${livre.nom} »` + (manquantes ? ` · ${manquantes} manquante(s)` : '')
        + (photos ? ` · ${photos.faites} photo(s)` : ''), detail })
    if (!manquantes && !detail) setTimeout(() => document.getElementById('bandeauIA').classList.add('hidden'), 6000)
  } catch (e) {
    bandeau({ etat: 'erreur', texte: 'Aucune recette créée', detail: htmlErreurIA(e.info || expliquerErreur('INCONNUE', e.message)) })
  } finally {
    iaEnCours = false
    await onChange()
  }
}

/**
 * Branche les livres sur la page recettes.
 * `rafraichir()` re-rend la page ; `nomsRecettes()` donne les noms existants.
 */
export function initLivres({ rafraichir, nomsRecettes }) {
  onChange = rafraichir
  getNoms = nomsRecettes

  document.getElementById('livresBar').addEventListener('click', async e => {
    if (e.target.closest('[data-nouveau-livre]')) return ouvrirFormLivre()
    const chip = e.target.closest('[data-livre]'); if (!chip) return
    livreActif = chip.dataset.livre || null
    await onChange()
  })
  document.getElementById('livreEntete').addEventListener('click', e => {
    if (e.target.closest('[data-gen-livre]')) return ouvrirGenLivre()
    if (e.target.closest('[data-photos-livre]')) return photosManquantes()
    if (e.target.closest('[data-edit-livre]')) return ouvrirFormLivre(livres.find(l => l.id === livreActif))
    if (e.target.closest('[data-suppr-livre]')) return supprimerLivre()
  })

  document.getElementById('formLivre').addEventListener('submit', enregistrerLivre)
  const fermer = id => () => document.getElementById(id).classList.add('hidden')
  document.getElementById('closeLivre').addEventListener('click', fermer('modalLivre'))
  document.getElementById('btnAnnulerLivre').addEventListener('click', fermer('modalLivre'))
  document.getElementById('closeGenLivre').addEventListener('click', fermer('modalGenLivre'))

  document.querySelector('#modalGenLivre .livre-nombres').addEventListener('click', e => {
    const fixe = e.target.closest('[data-nb-fixe]')
    const pas  = e.target.closest('[data-nb]')
    if (fixe) nbGen = Number(fixe.dataset.nbFixe)
    else if (pas) nbGen = Math.min(NB_MAX, Math.max(1, nbGen + Number(pas.dataset.nb)))
    else return
    majEstimation()
  })
  document.getElementById('genLivreFiltres').addEventListener('click', e => e.target.closest('.chip')?.classList.toggle('active'))
  document.getElementById('btnGenLivre').addEventListener('click', lancerGeneration)

  window.addEventListener('beforeunload', e => { if (iaEnCours) { e.preventDefault(); e.returnValue = '' } })
}
