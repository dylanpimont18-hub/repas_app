// js/planning-ui.js — Planning par cycle (samedi soir → samedi midi), groupé par session de cuisine
import { enregistrerCreneaux, viderCreneaux, supprimerCreneaux } from './planning.js'
import { debutCycle, decalerCycle, labelCycle, groupesDuCycle, labelCreneau } from './cycle.js'
import { FILTRES, estEnvie, normaliser } from './filtres.js'
import { chargerDonnees, lireFiltres, memoriserFiltres, proposerPourCreneau,
         remplirDepuisBibliotheque, annulerRemplissage, completerParIA, ideeIA, echanger } from './propositions.js'
import { dbEcouter, dbGetReglage, dbSetReglage, dbGetMonProfil } from './db.js'
import { confirmer, choisirNombre, informer, signalerErreur } from './dialogue.js'
import { esc, debounce } from './utils.js'
import { icone } from './icones.js'
import { expliquerErreur } from './credit-ia.js'
import { photosEnAttente } from './photos-auto.js'
import { chargerCredit, htmlEstimation, htmlErreurIA, majBandeau } from './credit-ia-ui.js'
import { platsACuisiner } from './cuisine.js'
// Mode cuisine (et IA, minuteurs) chargé seulement au moment de cuisiner : page plus légère
const ouvrirModeCuisine = async (...args) => (await import('./mode-cuisine.js')).ouvrirModeCuisine(...args)

let samedi  = debutCycle()
let donnees = null
let creneauEnCours = null
let aDeplacer = null   // clé du repas en cours de déplacement

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
  if (donnees.absents[c.cle]) {
    return `<div class="slot slot-absent${c.cle === aDeplacer ? ' slot-source' : ''}" data-cle="${esc(c.cle)}">
      <div class="slot-ligne">
        <span class="slot-moment">${moment}</span>
        <button class="btn btn-ghost btn-sm slot-retablir" data-action="retablir" data-cle="${esc(c.cle)}" aria-label="Rétablir ce repas">${icone('annuler')}Rétablir</button>
      </div>
      <div class="slot-sans-repas">Pas de repas</div>
    </div>`
  }
  const glissable = recette && ecranLarge.matches ? ' draggable="true"' : ''
  return `<div class="slot${recette ? '' : ' slot-libre'}${c.cle === aDeplacer ? ' slot-source' : ''}" data-cle="${esc(c.cle)}"${glissable}>
    <div class="slot-ligne">
      <span class="slot-moment">${moment}</span>
      <button class="portions-badge" data-action="portions" data-cle="${esc(c.cle)}" title="Changer les portions" aria-label="${esc(labelCreneau(c))} : ${occ?.portions ?? c.portions} portion(s), changer">${badgePortions(c, occ?.portions ?? c.portions)}</button>
      ${label ? `<span class="source-tag source-${esc(occ.source)}">${icone(ico)}<span class="source-txt">${label}</span></span>` : ''}
      ${recette ? `<span class="slot-actions">
        <button class="slot-btn" data-action="suivant" data-cle="${esc(c.cle)}" title="Autre proposition" aria-label="Autre proposition : ${esc(labelCreneau(c))}">${icone('autre')}</button>
        <button class="slot-btn" data-action="changer" data-cle="${esc(c.cle)}" title="Choisir un plat" aria-label="Choisir un plat : ${esc(labelCreneau(c))}">${icone('crayon')}</button>
        <button class="slot-btn" data-action="deplacer" data-cle="${esc(c.cle)}" title="Déplacer ou intervertir" aria-label="Déplacer ou intervertir : ${esc(labelCreneau(c))}">${icone('deplacer')}</button>
      </span>` : ''}
    </div>
    ${recette ? `<button type="button" class="slot-nom" data-ouvrir="${esc(c.cle)}">${esc(recette.nom)}</button>`
      : `<button type="button" class="slot-vide" data-ouvrir="${esc(c.cle)}">${icone('plus')}Choisir un plat<span class="sr-only"> pour ${esc(labelCreneau(c))}</span></button>`}
  </div>`
}

// « Cuisiner » : ouvre le mode cuisine avec les plats à préparer pour ces créneaux (rien si tout vient du congélo)
function boutonCuisiner(creneaux, titre) {
  if (!platsACuisiner(creneaux, donnees.occupation, donnees.recettesMap).length) return ''
  return `<button class="btn btn-ghost btn-sm btn-cuisiner" data-cuisiner="${esc(creneaux.map(c => c.cle).join(','))}"
    data-titre="${esc(titre)}" aria-label="Cuisiner : ${esc(titre)}">${icone('marmite')}Cuisiner</button>`
}

// Mobile : liste groupée par session de cuisine
function htmlListe() {
  return groupesDuCycle(donnees.creneaux).map(g => `
    <section class="cycle-groupe${g.enSession ? ' cycle-groupe-session' : ''}">
      <h2 class="cycle-groupe-titre">${g.enSession ? icone('marmite') : ''}${esc(g.titre)}${boutonCuisiner(g.creneaux, g.enSession ? `Session du ${g.cuisineLe}` : g.titre)}</h2>
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
  // Créneaux d'une bande : ceux de la session (ou du jour, sur place)
  const creneauxBande = b => jours.slice(b.debut, b.fin + 1).flatMap(j => Object.values(j.creneaux))
    .filter(c => b.enSession ? c.enSession && c.cuisineLe === b.cuisineLe : !c.enSession)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return `<div class="frise" style="--nb-jours:${jours.length}">
    <div class="frise-coin"></div>
    ${jours.map((j, i) => {
      const cles = Object.values(j.creneaux).map(c => c.cle)
      const absent = cles.every(cle => donnees.absents[cle])
      return `<div class="frise-jour${j.date.getTime() === today.getTime() ? ' frise-aujourdhui' : ''}${absent ? ' frise-jour-absent' : ''}" style="${col(i)}">
      <span class="frise-jour-nom">${JOUR_COURT[j.jour]}</span> <span class="frise-jour-date">${j.date.getDate()}</span>
      <button class="frise-jour-btn" data-jour-action="${absent ? 'retablir' : 'supprimer'}" data-cles="${esc(cles.join(','))}"
        title="${absent ? 'Rétablir la journée' : 'Supprimer la journée (pas de repas)'}" aria-label="${absent ? 'Rétablir' : 'Supprimer'} le ${JOUR_COURT[j.jour]} ${j.date.getDate()}">${icone(absent ? 'annuler' : 'croix')}</button></div>`
    }).join('')}
    <div class="frise-label">Cuisine</div>
    ${bandes.map(b => `<div class="frise-bande${b.enSession ? ' frise-bande-session' : ''}" style="grid-column:${b.debut + 2} / ${b.fin + 3}">
      ${b.enSession ? `${icone('marmite')}Préparé ${esc(b.cuisineLe)}${boutonCuisiner(creneauxBande(b), `Session du ${b.cuisineLe}`)}`
        : boutonCuisiner(creneauxBande(b), 'Cuisine sur place') || 'Sur place'}</div>`).join('')}
    ${['midi', 'soir'].map(m => `
      <div class="frise-label">${m === 'midi' ? `${icone('soleil')}Midi` : `${icone('lune')}Soir`}</div>
      ${jours.map((j, i) => j.creneaux[m]
        ? `<div class="frise-cellule" style="${col(i)}">${htmlCreneau(j.creneaux[m], { avecJour: false })}</div>`
        : `<div class="frise-cellule frise-hors" style="${col(i)}" aria-hidden="true"></div>`).join('')}`).join('')}
  </div>`
}

async function renderGrid() {
  try {
    donnees = await chargerDonnees(samedi)
  } catch (e) {
    if (!donnees) document.getElementById('planningGrid').innerHTML = `<p class="text-muted">Impossible de charger le planning : ${esc(e.message)}</p>`
    return signalerErreur(e, 'Planning')
  }
  afficher()
}

// ── Écritures : appliquées tout de suite à l'écran, et leur écho temps réel est ignoré ──
const mesEcritures = new Map()   // clé de créneau → horodatage
const noterEcritures = cles => cles.forEach(k => mesEcritures.set(k, Date.now()))
const estMonEcho = cle => Date.now() - (mesEcritures.get(cle) || 0) < 8000

// Met à jour l'occupation locale (sans recharger tout le cycle) puis redessine
function appliquer(changements) {
  for (const ch of changements) {
    if (ch.vider) { delete donnees.occupation[ch.cle]; delete donnees.absents[ch.cle] }
    else if (ch.absent) { delete donnees.occupation[ch.cle]; donnees.absents[ch.cle] = true }
    else donnees.occupation[ch.cle] = { id: ch.recetteId, portions: ch.portions ?? donnees.parCle[ch.cle].portions, source: ch.source || 'manuel' }
  }
  noterEcritures(changements.map(ch => ch.cle))
  afficher()
}

// Garde le focus sur le même bouton après un redessin (clavier, VoiceOver)
function refocus(selecteur) {
  requestAnimationFrame(() => document.querySelector(selecteur)?.focus())
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
  grid.className = (ecranLarge.matches ? 'planning-frise' : 'planning-cycle') + (aDeplacer ? ' mode-deplacement' : '')
  grid.innerHTML = ecranLarge.matches ? htmlFrise() : htmlListe()

  // Bandeau du mode déplacement
  const bandeau = document.getElementById('bandeauDeplacement')
  if (bandeau) {
    const occ = aDeplacer && donnees.occupation[aDeplacer]
    bandeau.classList.toggle('hidden', !occ)
    if (occ) bandeau.innerHTML = `<span>${icone('deplacer')}Touche le repas de destination</span>
      <button class="btn btn-secondary btn-sm" data-annuler>Annuler</button>`
  }
}

// ── Actions sur un créneau ───────────────────────────────────────────
async function actionCreneau(action, cle, bouton) {
  const c = donnees.parCle[cle]
  creneauEnCours = c
  try {
    if (action === 'changer') return ouvrirSelectRecette()
    if (action === 'deplacer') { aDeplacer = aDeplacer === cle ? null : cle; afficher(); return refocus(`[data-action="deplacer"][data-cle="${CSS.escape(cle)}"]`) }
    if (action === 'supprimer' || action === 'retablir') { await viderCreneaux([c]); return appliquer([{ cle, vider: true }]) }
    if (action === 'portions') {
      const occ = donnees.occupation[cle]
      if (!occ) return informer('Choisis d\'abord un plat pour ce repas.')
      const v = await choisirNombre({ titre: `Portions · ${labelCreneau(c)}`, valeur: occ.portions ?? c.portions, min: 1, max: 12, unite: 'portion(s)',
        aide: 'Pour ce repas seulement (le modèle de semaine ne change pas). Les courses suivent.' })
      if (!v) return
      await enregistrerCreneaux([{ creneau: c, recetteId: occ.id, source: occ.source, portions: v }])
      appliquer([{ cle, recetteId: occ.id, source: occ.source, portions: v }])
      return refocus(`[data-action="portions"][data-cle="${CSS.escape(cle)}"]`)
    }
    if (action === 'suivant') {
      const { filtres, style } = lireFiltres()
      const [prochain] = proposerPourCreneau(donnees, c, { filtres, style }, 1)
      if (prochain) {
        await enregistrerCreneaux([{ creneau: c, recetteId: prochain.id, source: 'biblio' }])
        appliquer([{ cle, recetteId: prochain.id, source: 'biblio' }])
        return refocus(`[data-action="suivant"][data-cle="${CSS.escape(cle)}"]`)
      }
      if (!await confirmer('Plus rien de compatible dans tes recettes pour ce repas.', { titre: 'Demander une idée à l\'IA ?', ok: 'Demander à l\'IA' })) return
      if (bouton) { bouton.disabled = true; bouton.innerHTML = '<span class="loader loader-mini"></span>' }
      const r = await ideeIA(donnees, c, { filtres, style })
      await enregistrerCreneaux([{ creneau: c, recetteId: r.id, source: 'ia' }])
      donnees.recettesMap[r.id] = r
      donnees.recettes.unshift(r)
      appliquer([{ cle, recetteId: r.id, source: 'ia' }])
    }
  } catch (e) {
    signalerErreur(e, labelCreneau(c))
    renderGrid()
  }
}

// Midi et soir de la même date (dans le cycle)
function creneauxDuJour(c) {
  return donnees.creneaux.filter(x => x.date.getTime() === c.date.getTime())
}

async function ouvrirSelectRecette() {
  const modal = document.getElementById('modalRecetteSelect')
  const list  = document.getElementById('recetteSelectList')
  if (!modal || !list || !creneauEnCours) return
  const { filtres, style } = lireFiltres()
  const compatibles = proposerPourCreneau(donnees, creneauEnCours, { filtres, style }, 50)
  const idsCompat = new Set(compatibles.map(r => r.id))
  const autres = donnees.recettes.filter(r => !idsCompat.has(r.id)).sort((a, b) => a.nom.localeCompare(b.nom))
  // Texte cherché : nom + cuisine + ingrédients (sans accents)
  const texte = x => normaliser([x.nom, x.cuisine, ...(x.ingredients || []).map(i => i.nom)].filter(Boolean).join(' '))
  const carte = (x, compat) => `
    <button type="button" class="recipe-card select-carte${compat ? '' : ' select-carte-hors'}" data-id="${esc(x.id)}" data-texte="${esc(texte(x))}">
      <span class="recipe-name">${esc(x.nom)}</span>
      <span class="recipe-meta"><span>${icone('horloge')}${(x.temps_prep || 0) + (x.temps_cuisson || 0)} min</span>${x.vegetarien ? `<span>${icone('feuille')}végé</span>` : ''}${x.cuisine ? `<span>${esc(x.cuisine)}</span>` : ''}${compat ? '' : '<span>hors critères</span>'}</span>
    </button>`
  const occupe = donnees.occupation[creneauEnCours.cle]
  const absent = donnees.absents[creneauEnCours.cle]
  const jourDuCreneau = creneauxDuJour(creneauEnCours)
  const jourAbsent = jourDuCreneau.every(c => donnees.absents[c.cle])
  list.innerHTML = `<div class="select-gestion">
      ${occupe ? `<button class="btn btn-secondary btn-sm" data-gerer="vider">${icone('poubelle')}Vider (à remplir)</button>` : ''}
      ${absent
        ? `<button class="btn btn-secondary btn-sm" data-gerer="retablir">${icone('annuler')}Rétablir ce repas</button>`
        : `<button class="btn btn-secondary btn-sm select-vider" data-gerer="supprimer">${icone('croix')}Pas de repas</button>`}
      ${jourDuCreneau.length > 1 ? (jourAbsent
        ? `<button class="btn btn-secondary btn-sm" data-gerer="retablir-jour">${icone('annuler')}Rétablir la journée</button>`
        : `<button class="btn btn-secondary btn-sm select-vider" data-gerer="supprimer-jour">${icone('calendrier')}Supprimer la journée</button>`) : ''}
    </div>
    <p class="text-xs text-muted select-gestion-aide">« Pas de repas » : le repas reste vide, n'est plus proposé au remplissage et sort des courses.</p>`
    + (donnees.recettes.length ? `<input type="search" class="form-input select-recherche" id="selectRecherche" autocomplete="off"
        placeholder="Chercher une recette précise (nom, ingrédient)…" aria-label="Chercher une recette">` : '')
    + `<p class="text-xs text-muted" style="margin-bottom:0.5rem;">${esc(labelCreneau(creneauEnCours))} · les mieux adaptées d'abord</p>`
    + (donnees.recettes.length === 0 ? '<p class="text-muted text-sm" style="padding:1rem;">Aucune recette pour l\'instant.</p>' : '')
    + `<div data-section>${compatibles.map(x => carte(x, true)).join('')}</div>`
    + (autres.length ? `<div data-section><p class="text-xs text-muted" style="margin:0.75rem 0 0.5rem;">Autres recettes (hors critères)</p>${autres.map(x => carte(x, false)).join('')}</div>` : '')
    + '<p class="text-sm text-muted hidden" data-aucune>Aucune recette ne correspond.</p>'

  list.querySelectorAll('[data-gerer]').forEach(b => b.addEventListener('click', async () => {
    const action = b.dataset.gerer
    const cibles = action.endsWith('-jour') ? jourDuCreneau : [creneauEnCours]
    const avant = cibles.map(c => ({ c, occ: donnees.occupation[c.cle], absent: donnees.absents[c.cle] }))
    try {
      if (action.startsWith('supprimer')) {
        const pleins = cibles.filter(c => donnees.occupation[c.cle]).length
        if (pleins && !await confirmer(`${pleins} plat(s) prévu(s) seront retirés du planning et des courses.`, { titre: 'Pas de repas ?', ok: 'Retirer', danger: true })) return
        await supprimerCreneaux(cibles)
        appliquer(cibles.map(c => ({ cle: c.cle, absent: true })))
      } else {
        await viderCreneaux(cibles) // vider, ou rétablir un repas supprimé
        appliquer(cibles.map(c => ({ cle: c.cle, vider: true })))
      }
      modal.classList.add('hidden')
      if (action !== 'retablir' && action !== 'retablir-jour') informer(action === 'vider' ? 'Repas vidé.' : 'Repas retiré.', {
        action: { label: 'Annuler', faire: () => restaurer(avant) } })
    } catch (e) { signalerErreur(e, 'Planning') }
  }))
  list.querySelectorAll('[data-id]').forEach(card => {
    card.addEventListener('click', async () => {
      try {
        await enregistrerCreneaux([{ creneau: creneauEnCours, recetteId: card.dataset.id, source: 'manuel' }])
        modal.classList.add('hidden')
        appliquer([{ cle: creneauEnCours.cle, recetteId: card.dataset.id, source: 'manuel' }])
        refocus(`[data-ouvrir="${CSS.escape(creneauEnCours.cle)}"]`)
      } catch (e) { signalerErreur(e, 'Choix du plat') }
    })
  })
  // Recherche : chaque mot tapé doit apparaître (nom, cuisine ou ingrédient)
  list.querySelector('#selectRecherche')?.addEventListener('input', e => {
    const mots = normaliser(e.target.value).split(' ').filter(Boolean)
    let visibles = 0
    list.querySelectorAll('[data-id]').forEach(card => {
      const ok = mots.every(m => card.dataset.texte.includes(m))
      card.classList.toggle('hidden', !ok)
      visibles += ok
    })
    list.querySelectorAll('[data-section]').forEach(s => s.classList.toggle('hidden', !s.querySelector('[data-id]:not(.hidden)')))
    list.querySelector('[data-aucune]').classList.toggle('hidden', visibles > 0)
  })
  modal.classList.remove('hidden')
}

// Remet des créneaux dans leur état d'avant (« Annuler »)
async function restaurer(avant) {
  try {
    const remettre = avant.filter(x => x.occ), vider = avant.filter(x => !x.occ && !x.absent), absents = avant.filter(x => x.absent)
    if (remettre.length) await enregistrerCreneaux(remettre.map(x => ({ creneau: x.c, recetteId: x.occ.id, source: x.occ.source, portions: x.occ.portions })))
    if (vider.length) await viderCreneaux(vider.map(x => x.c))
    if (absents.length) await supprimerCreneaux(absents.map(x => x.c))
    appliquer([...remettre.map(x => ({ cle: x.c.cle, recetteId: x.occ.id, source: x.occ.source, portions: x.occ.portions })),
      ...vider.map(x => ({ cle: x.c.cle, vider: true })), ...absents.map(x => ({ cle: x.c.cle, absent: true }))])
  } catch (e) { signalerErreur(e, 'Annulation') }
}

// ── Verrou souple : une génération IA en cours sur un téléphone est visible sur l'autre ──
const CLE_VERROU = 'ia_en_cours'
const VERROU_MAX = 10 * 60000
async function poserVerrou(creneaux) {
  const qui = await dbGetMonProfil().catch(() => null)
  await dbSetReglage(CLE_VERROU, { qui, depuis: Date.now(), cles: creneaux.map(c => c.cle) }).catch(() => {})
}
const leverVerrou = () => dbSetReglage(CLE_VERROU, null).catch(() => {})
async function verrouAutreTelephone() {
  if (iaEnCours) return null
  const v = await dbGetReglage(CLE_VERROU).catch(() => null)
  return v && Date.now() - v.depuis < VERROU_MAX ? v : null
}

// ── Génération IA en arrière-plan ────────────────────────────────────
// Les recettes s'affichent lot par lot ; la page reste utilisable (quitter la page interrompt la génération)
let iaEnCours = false
const majBandeauIA = (etat) => majBandeau(document.getElementById('bandeauIA'), etat)

async function lancerGenerationIA(creneaux, sel) {
  iaEnCours = true
  noterEcritures(creneaux.map(c => c.cle))
  poserVerrou(creneaux)
  const total = creneaux.length
  majBandeauIA({ etat: 'encours', texte: `L'IA prépare ${total} recette(s)…`, pct: 3 })
  try {
    const { nbCrees, rejets, erreurs } = await completerParIA(donnees, creneaux, sel,
      (n) => majBandeauIA({ etat: 'encours', texte: `L'IA prépare tes recettes : ${n} / ${total}`, pct: Math.max(3, n / total * 95) }),
      (lot) => { noterEcritures(lot.map(x => x.creneau.cle)); return renderGrid() })
    const manquants = total - nbCrees
    const codes = new Set()
    const detail = (rejets.length ? `<p class="text-xs">Écartées (contraintes ou en double) : ${esc(rejets.join(', '))}</p>` : '')
      + erreurs.filter(e => !codes.has(e.code) && codes.add(e.code)).map(e => htmlErreurIA(e)).join('')
    majBandeauIA({ etat: manquants ? 'partiel' : 'fini',
      texte: `${nbCrees} recette(s) ajoutée(s)` + (manquants ? ` · ${manquants} repas encore vide(s)` : ''), detail })
    if (!manquants && !detail) setTimeout(() => document.getElementById('bandeauIA').classList.add('hidden'), 6000)
  } catch (e) {
    majBandeauIA({ etat: 'erreur', texte: 'Aucune recette créée', detail: htmlErreurIA(e.info || expliquerErreur('INCONNUE', e.message)) })
  } finally {
    iaEnCours = false
    leverVerrou()
    await renderGrid()
  }
}

window.addEventListener('beforeunload', (e) => {
  if (iaEnCours || photosEnAttente()) { e.preventDefault(); e.returnValue = '' }
})

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
  const estimation  = document.getElementById('genEstimation')
  const enviesWrap  = document.getElementById('genEnvies')
  let videsRestants = []
  let credit = null   // crédit IA, rechargé à chaque ouverture
  let envies = {}   // { id: { actif, nb, suite } }

  // Envies : activer, nombre de repas (1 à 3), espacés ou à la suite
  function renderEnvies() {
    const liste = FILTRES.filter(f => estEnvie(f.id))
    const etat = id => envies[id] || { actif: false, nb: 2, suite: false }
    // Une rangée de pastilles, puis une ligne de réglages par envie cochée
    enviesWrap.innerHTML = `<div class="gen-chips-wrap">${liste.map(f => `<span data-envie="${f.id}">
        <button class="chip ${etat(f.id).actif ? 'active' : ''}" data-act="basculer" aria-pressed="${etat(f.id).actif}">${f.label}</button></span>`).join('')}</div>`
      + liste.filter(f => etat(f.id).actif).map(f => {
      const e = etat(f.id)
      return `<div class="envie-ligne" data-envie="${f.id}">
        <span class="envie-nom">${f.label}</span>
        ${e.actif ? `<div class="envie-reglages">
          <div class="pas-a-pas" role="group" aria-label="Nombre de repas ${esc(f.label)}">
            <button data-act="moins" aria-label="Un repas de moins" ${e.nb <= 1 ? 'disabled' : ''}>−</button>
            <span>${e.nb} repas</span>
            <button data-act="plus" aria-label="Un repas de plus" ${e.nb >= 3 ? 'disabled' : ''}>+</button>
          </div>
          <div class="segmente" role="group" aria-label="Répartition">
            <button data-act="espaces" class="${e.suite ? '' : 'active'}" aria-pressed="${!e.suite}">Espacés</button>
            <button data-act="suite" class="${e.suite ? 'active' : ''}" aria-pressed="${e.suite}">À la suite</button>
          </div>
        </div>` : ''}
      </div>`
    }).join('')
  }
  enviesWrap.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]'); if (!b) return
    const id = b.closest('[data-envie]').dataset.envie
    const e = envies[id] ||= { actif: false, nb: 2, suite: false }
    if (b.dataset.act === 'basculer') e.actif = !e.actif
    if (b.dataset.act === 'moins') e.nb = Math.max(1, e.nb - 1)
    if (b.dataset.act === 'plus')  e.nb = Math.min(3, e.nb + 1)
    if (b.dataset.act === 'espaces') e.suite = false
    if (b.dataset.act === 'suite')   e.suite = true
    renderEnvies()
  })

  const lireSelection = () => ({
    filtres: [...filtresWrap.querySelectorAll('.chip.active')].map(c => c.dataset.filtre),
    style:   styleInput.value.trim(),
    envies:  Object.entries(envies).filter(([, e]) => e.actif).map(([id, e]) => ({ id, nb: e.nb, suite: e.suite })),
  })
  // Nombre de repas choisis + coût estimé si on passe par l'IA (`nbIA` : repas restés vides après la bibliothèque)
  const majCompteur = (nbIA = null) => {
    const n = chipsWrap.querySelectorAll('.chip.active').length
    document.getElementById('genCreneauxCount').textContent = n
    estimation.innerHTML = credit ? htmlEstimation(nbIA ?? n, credit) : ''
  }

  document.getElementById('btnGenererSemaine')?.addEventListener('click', () => {
    chargerCredit().then(c => { credit = c; majCompteur(videsRestants.length || null) })
    const memo = lireFiltres()
    filtresWrap.innerHTML = FILTRES.filter(f => !estEnvie(f.id)).map(f =>
      `<button class="chip ${memo.filtres.includes(f.id) ? 'active' : ''}" data-filtre="${f.id}" aria-pressed="${memo.filtres.includes(f.id)}">${f.label}</button>`).join('')
    envies = Object.fromEntries((memo.envies || []).map(e => [e.id, { actif: true, nb: e.nb, suite: e.suite }]))
    renderEnvies()
    styleInput.value = memo.style || ''
    // Repas supprimés : non cochés (on peut quand même les cocher pour les remplir)
    const vides = donnees.creneaux.filter(c => !donnees.occupation[c.cle] && !donnees.absents[c.cle])
    chipsWrap.innerHTML = (vides.length ? '' : '<p class="text-xs text-muted" style="width:100%;">Tout est rempli : sélectionne les créneaux à remplacer.</p>')
      + donnees.creneaux.map(c => {
        const absent = donnees.absents[c.cle]
        return `<button class="chip ${vides.includes(c) ? 'active' : ''}${absent ? ' chip-absent' : ''}" data-cle="${esc(c.cle)}" aria-pressed="${vides.includes(c)}"${absent ? ' title="Pas de repas"' : ''}>
          ${esc(labelCreneau(c))}${c.portions === 1 ? icone('personne') : ''}${absent ? icone('croix', { label: 'pas de repas' }) : ''}</button>`
      }).join('')
    status.textContent = iaEnCours ? 'Une génération IA est déjà en cours (voir le bandeau de suivi).' : ''
    verrouAutreTelephone().then(v => {
      if (v) status.textContent = `L'IA prépare déjà ${v.cles?.length || ''} repas depuis l'autre téléphone (${v.qui === 'dylan' ? 'Dylan' : v.qui === 'femme' ? 'ta femme' : 'autre compte'}) : attends la fin pour éviter de remplacer ses choix.`
    })
    videsRestants = []
    btnIA.classList.add('hidden')
    majCompteur()
    modal.classList.remove('hidden')
  })

  const basculerPuce = chip => { if (!chip) return; chip.classList.toggle('active'); chip.setAttribute('aria-pressed', chip.classList.contains('active')) }
  filtresWrap.addEventListener('click', e => basculerPuce(e.target.closest('.chip')))
  chipsWrap.addEventListener('click', e => { basculerPuce(e.target.closest('.chip')); majCompteur() })
  document.getElementById('closeGenSemaine')?.addEventListener('click', () => modal.classList.add('hidden'))

  btnBiblio.addEventListener('click', async () => {
    const sel  = lireSelection()
    memoriserFiltres(sel)
    const cles = [...chipsWrap.querySelectorAll('.chip.active')].map(c => c.dataset.cle)
    if (!cles.length) { status.textContent = 'Sélectionne au moins un créneau.'; return }
    btnBiblio.disabled = true
    status.textContent = 'Recherche dans tes recettes…'
    try {
      noterEcritures(cles)
      const resultat = await remplirDepuisBibliotheque(donnees, cles, sel)
      const { nbProposes, vides } = resultat
      videsRestants = vides
      status.textContent = `${nbProposes} repas proposés depuis tes recettes` + (vides.length ? ` · ${vides.length} sans idée` : '')
      btnIA.innerHTML = `${icone('etincelle')}Compléter avec l'IA (${vides.length} repas)`
      btnIA.classList.toggle('hidden', vides.length === 0)
      majCompteur(vides.length)
      await renderGrid()
      if (nbProposes) informer(`${nbProposes} repas remplis depuis tes recettes.`, { type: 'ok', duree: 10000,
        action: { label: 'Annuler', faire: async () => {
          try { noterEcritures(cles); await annulerRemplissage(donnees, resultat); await renderGrid(); informer('Remplissage annulé.') }
          catch (e) { signalerErreur(e, 'Annulation') }
        } } })
      if (!vides.length) setTimeout(() => modal.classList.add('hidden'), 900)
    } catch (e) {
      status.textContent = e.message
    } finally {
      btnBiblio.disabled = false
    }
  })

  // Génération IA : directement pour les créneaux choisis, ou pour ceux restés vides après la bibliothèque
  // Lancée en arrière-plan : la fenêtre se ferme, le bandeau suit la progression
  function genererIA(creneaux) {
    if (!creneaux.length) { status.textContent = 'Sélectionne au moins un repas.'; return }
    if (iaEnCours) { status.textContent = 'Une génération IA est déjà en cours : attends qu\'elle se termine.'; return }
    const sel = lireSelection()
    memoriserFiltres(sel)
    videsRestants = []
    modal.classList.add('hidden')
    lancerGenerationIA(creneaux, sel)
  }

  // Une génération lancée depuis l'autre téléphone : on prévient avant d'en lancer une seconde
  const autreGeneration = async () => {
    const v = await verrouAutreTelephone()
    return v && !await confirmer('L\'autre téléphone a une génération IA en cours : les deux pourraient remplir les mêmes repas.', { titre: 'Lancer quand même ?', ok: 'Lancer' })
  }
  btnIA.addEventListener('click', async () => { if (!await autreGeneration()) genererIA(videsRestants) })
  document.getElementById('btnGenererIA').addEventListener('click', async () => {
    const cles = [...chipsWrap.querySelectorAll('.chip.active')].map(c => c.dataset.cle)
    const deja = cles.filter(cle => donnees.occupation[cle]).length
    if (deja && !await confirmer(`${deja} repas déjà prévu(s) seront remplacés par de nouvelles recettes.`, { titre: 'Remplacer ces repas ?', ok: 'Remplacer' })) return
    if (await autreGeneration()) return
    genererIA(cles.map(cle => donnees.parCle[cle]))
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  await renderGrid()
  initModalGen()

  const grille = document.getElementById('planningGrid')

  // Mode déplacement : le prochain repas touché reçoit le plat (échange si occupé)
  async function deposer(cible) {
    const source = aDeplacer
    aDeplacer = null
    if (!source || !cible || source === cible) return afficher()
    const a = donnees.occupation[source], b = donnees.occupation[cible]
    try {
      await echanger(donnees, source, cible)
      const src = o => (o.source === 'reste' ? 'manuel' : o.source)
      appliquer([a ? { cle: cible, recetteId: a.id, source: src(a) } : { cle: cible, vider: true },
        b ? { cle: source, recetteId: b.id, source: src(b) } : { cle: source, vider: true }])
      refocus(`[data-ouvrir="${CSS.escape(cible)}"]`)
    } catch (e) { signalerErreur(e, 'Déplacement'); renderGrid() }
  }
  document.getElementById('bandeauDeplacement')?.addEventListener('click', e => {
    if (e.target.closest('[data-annuler]')) { aDeplacer = null; afficher() }
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && aDeplacer) { aDeplacer = null; afficher() } })

  // Ordinateur : glisser-déposer d'une case à l'autre
  grille?.addEventListener('dragstart', e => {
    const slot = e.target.closest('.slot[draggable]'); if (!slot) return
    e.dataTransfer.setData('text/plain', slot.dataset.cle)
    e.dataTransfer.effectAllowed = 'move'
    slot.classList.add('slot-source')
  })
  grille?.addEventListener('dragend', e => e.target.closest?.('.slot')?.classList.remove('slot-source'))
  grille?.addEventListener('dragover', e => {
    const slot = e.target.closest('.slot'); if (!slot) return
    e.preventDefault()
    grille.querySelectorAll('.slot-cible').forEach(s => s !== slot && s.classList.remove('slot-cible'))
    slot.classList.add('slot-cible')
  })
  grille?.addEventListener('dragleave', e => e.target.closest?.('.slot')?.classList.remove('slot-cible'))
  grille?.addEventListener('drop', async e => {
    const slot = e.target.closest('.slot'); if (!slot) return
    e.preventDefault()
    aDeplacer = e.dataTransfer.getData('text/plain')
    await deposer(slot.dataset.cle)
  })

  grille?.addEventListener('click', async (e) => {
    if (aDeplacer) {
      const slot = e.target.closest('.slot')
      if (slot) {
        e.stopPropagation()
        if (slot.dataset.cle === aDeplacer) { aDeplacer = null; return afficher() }
        return deposer(slot.dataset.cle)
      }
    }
    const btnCuisiner = e.target.closest('[data-cuisiner]')
    if (btnCuisiner) {
      const creneaux = btnCuisiner.dataset.cuisiner.split(',').map(cle => donnees.parCle[cle]).filter(Boolean)
      return ouvrirModeCuisine(platsACuisiner(creneaux, donnees.occupation, donnees.recettesMap), btnCuisiner.dataset.titre)
    }
    const btn = e.target.closest('[data-action]')
    if (btn) { e.stopPropagation(); return actionCreneau(btn.dataset.action, btn.dataset.cle, btn) }
    // Frise : supprimer / rétablir une journée entière
    const btnJour = e.target.closest('[data-jour-action]')
    if (btnJour) {
      const cibles = btnJour.dataset.cles.split(',').map(cle => donnees.parCle[cle])
      try {
        if (btnJour.dataset.jourAction === 'retablir') { await viderCreneaux(cibles); appliquer(cibles.map(c => ({ cle: c.cle, vider: true }))) }
        else {
          const pleins = cibles.filter(c => donnees.occupation[c.cle]).length
          if (pleins && !await confirmer(`${pleins} plat(s) prévu(s) seront retirés du planning et des courses.`, { titre: 'Supprimer la journée ?', ok: 'Supprimer', danger: true })) return
          await supprimerCreneaux(cibles)
          appliquer(cibles.map(c => ({ cle: c.cle, absent: true })))
        }
      } catch (err) { signalerErreur(err, 'Journée') }
      return
    }
    const slot = e.target.closest('.slot')
    if (!slot) return
    const occ = donnees.occupation[slot.dataset.cle]
    if (occ) window.location.href = `recettes.html?id=${encodeURIComponent(occ.id)}&from=planning&portions=${occ.portions || ''}`
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

  // Temps réel : refléter les changements faits depuis l'autre téléphone (nos propres écritures sont ignorées)
  const recharger = debounce(renderGrid, 300)
  dbEcouter(['planning'], payload => {
    const l = payload.new?.semaine_key ? payload.new : payload.old || {}
    if (l.semaine_key && estMonEcho(`${l.semaine_key}|${l.jour}|${l.moment}`)) return
    recharger()
  })
  dbEcouter(['recettes', 'reserve'], () => { if (!iaEnCours) recharger() })
  dbEcouter(['reglages'], payload => { if ((payload.new?.cle || payload.old?.cle) !== CLE_VERROU) recharger() })
})
