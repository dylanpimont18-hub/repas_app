// js/recettes-ui.js
import { getRecettes, filtrerRecettes, deleteRecette, addRecette } from './recettes.js'
import { dbEcouter, dbSetImageRecette, dbSetAvis, dbGetPlanningDeRecette, dbUpsertPlanningLot } from './db.js'
import { esc, debounce, reparerIngredient, lireLigneIngredient } from './utils.js'
import { TAGS } from './filtres.js'
import { icone } from './icones.js'
import { initLivres, chargerLivres, renderLivres, getLivres, getLivreActif, nomLivre } from './livres-ui.js'
import { filtresDisponibles, appliquerFiltres, nettoyerSelection, basculer, nbActifs, filtrerParIngredients, ajouterIngredients } from './filtres-recettes.js'
import { genererImageRecette } from './ai.js'
import { coutImage, formatDollars, expliquerErreur } from './credit-ia.js'
import { htmlErreurIA } from './credit-ia-ui.js'
import { imprimerRecette } from './impression-recette.js'
import { ouvrirPlanifier } from './planifier-recette.js'
import { recetteAuxPortions, ingredientsPour } from './cuisine.js'
import { confirmer, informer, signalerErreur } from './dialogue.js'
// Mode cuisine (et IA, minuteurs) chargé seulement au moment de cuisiner : page plus légère
const ouvrirModeCuisine = async (...args) => (await import('./mode-cuisine.js')).ouvrirModeCuisine(...args)

let filtres = {}        // recherche par nom
let selection = {}      // filtres déduits des recettes : { groupe: [valeurs] }
let ingredientsFiltre = [] // ingrédients que la recette doit tous contenir

// Filtres retrouvés à la prochaine visite (sur cet appareil)
const CLE_FILTRES = 'repas_filtres_recettes'
function memoriserFiltres() {
  try { localStorage.setItem(CLE_FILTRES, JSON.stringify({ selection, ingredientsFiltre, recherche: filtres.recherche || null })) } catch { /* navigation privée */ }
}
function relireFiltres() {
  try {
    const f = JSON.parse(localStorage.getItem(CLE_FILTRES) || '{}')
    selection = f.selection && typeof f.selection === 'object' ? f.selection : {}
    ingredientsFiltre = Array.isArray(f.ingredientsFiltre) ? f.ingredientsFiltre : []
    filtres.recherche = f.recherche || null
  } catch { /* rien de mémorisé */ }
}
let disponibles = []
let recetteEnEdition = null
let nomsRecettes = []

// ── Catalogue en mémoire : rechargé seulement quand une recette change (ici ou sur l'autre téléphone) ──
let catalogue = null
async function toutesLesRecettes() {
  if (!catalogue) catalogue = getRecettes().catch(e => { catalogue = null; throw e })
  return catalogue
}
function invaliderCatalogue() { catalogue = null }
async function recetteParId(id) {
  return (await toutesLesRecettes()).find(r => r.id === id) || null
}

// Panneau des filtres (seuls ceux portés par au moins une recette affichée) + rappel des filtres actifs
function renderFiltres(nbResultats, nbScope) {
  const nb = nbActifs(selection) + ingredientsFiltre.length
  const badge = document.getElementById('filtresNb')
  badge.textContent = nb
  badge.classList.toggle('hidden', nb === 0)
  document.getElementById('btnFiltres').classList.toggle('active', nb > 0)

  const puceIngredient = (nom, i) => `<button class="chip active filtre-actif" data-ingredient="${i}" aria-label="Retirer l'ingrédient ${esc(nom)}">${esc(nom)}${icone('croix')}</button>`
  document.getElementById('filtreIngredientsPuces').innerHTML = ingredientsFiltre.map(puceIngredient).join('')

  const actif = (g, v) => (selection[g] || []).includes(v)
  document.getElementById('filtresGroupes').innerHTML = disponibles.length === 0
    ? '<p class="text-sm text-muted">Aucun filtre : ajoute des recettes pour en voir apparaître.</p>'
    : disponibles.map(g => `<div class="filtres-groupe">
        <div class="filtres-groupe-titre">${esc(g.label)}${g.unique ? ' <span class="text-muted">(un seul choix)</span>' : ''}</div>
        <div class="gen-chips-wrap">${g.options.map(o => `<button class="chip ${actif(g.id, o.valeur) ? 'active' : ''}"
          data-groupe="${esc(g.id)}" data-valeur="${esc(o.valeur)}" aria-pressed="${actif(g.id, o.valeur)}">${esc(o.label)} <span class="filtre-compte">${o.n}</span></button>`).join('')}</div>
      </div>`).join('')
      + `<div class="filtres-pied"><span class="text-sm text-muted">${nbResultats} / ${nbScope} recette(s)</span>
        ${nb ? '<button class="btn btn-ghost btn-sm" data-effacer>Tout effacer</button>' : ''}</div>`

  const libelle = (g, v) => disponibles.find(x => x.id === g)?.options.find(o => o.valeur === v)?.label || v
  document.getElementById('filtresActifs').innerHTML = nb === 0 ? ''
    : ingredientsFiltre.map(puceIngredient).join('') + Object.entries(selection).flatMap(([g, vals]) => vals.map(v =>
        `<button class="chip active filtre-actif" data-groupe="${esc(g)}" data-valeur="${esc(v)}" aria-label="Retirer le filtre ${esc(libelle(g, v))}">${esc(libelle(g, v))}${icone('croix')}</button>`)).join('')
      + `<span class="text-xs text-muted">${nbResultats} recette(s)</span>`
}

async function renderList() {
  let toutes
  try { toutes = await toutesLesRecettes() } catch (e) { return signalerErreur(e, 'Chargement des recettes') }
  nomsRecettes    = toutes.map(r => r.nom)
  renderLivres(toutes)
  const livre     = getLivreActif()
  // Filtres calculés sur les recettes visibles (livre + recherche + ingrédients) ; ceux qui n'existent plus sont retirés
  const base      = filtrerRecettes(toutes, { ...filtres, livre })
  const scope     = filtrerParIngredients(base, ingredientsFiltre)
  disponibles     = filtresDisponibles(scope)
  selection       = nettoyerSelection(selection, disponibles)
  const recettes  = appliquerFiltres(scope, selection)
  memoriserFiltres()
  renderFiltres(recettes.length, base.length)
  const container = document.getElementById('recettesList')
  if (!container) return
  container.innerHTML = recettes.length === 0
    ? `<p class="text-muted">${base.length ? (scope.length ? 'Aucune recette ne correspond à ces filtres.' : `Aucune recette avec ${esc(ingredientsFiltre.join(' + '))}.`)
      : livre ? 'Ce livre est vide : « Générer des recettes » pour le remplir, ou range une recette dedans depuis « Modifier ».'
      : 'Aucune recette. Ajoute la tienne avec « Nouvelle », importe-la, ou remplis le planning avec l\'IA.'}</p>`
    : recettes.map(r => `
        <article class="recipe-card${r.image_url ? ' recipe-card-photo' : ''}" role="button" tabindex="0" data-id="${esc(r.id)}">
          ${r.image_url ? `<img class="recipe-photo" src="${esc(r.image_url)}" alt="" loading="lazy">` : ''}
          <h2 class="recipe-name">${esc(r.nom)}</h2>
          <div class="recipe-meta">
            <span>${icone('horloge')}${(r.temps_prep || 0) + (r.temps_cuisson || 0)} min</span>
            <span>${icone('famille')}${r.portions} pers.</span>
            ${r.nutrition?.calories ? `<span>${icone('flamme')}${r.nutrition.calories} kcal</span>` : ''}
          </div>
          <div class="recipe-tags">${!livre && r.livre_id && nomLivre(r.livre_id) ? `<span class="recipe-tag recipe-tag-livre">${icone('livre')}${esc(nomLivre(r.livre_id))}</span>` : ''}${r.avis === 1 ? `<span class="recipe-tag recipe-tag-avis">${icone('coeur')}A plu</span>` : ''}${r.vegetarien ? '<span class="recipe-tag recipe-tag-veg">Végétarien</span>' : ''}${(r.tags || []).map(t => `<span class="recipe-tag">${esc(t)}</span>`).join('')}${r.cuisine ? `<span class="recipe-tag">${esc(r.cuisine)}</span>` : ''}</div>
        </article>`).join('')
}

// ── Détail d'une recette ─────────────────────────────────────────────
// `portions` : nombre de personnes affiché (les ingrédients sont pondérés) ; par défaut, celui de la recette
async function ouvrirDetail(id, portions = null) {
  const r = await recetteParId(id)
  if (!r) return informer('Cette recette n\'existe plus.', { type: 'erreur' })
  const nb = portions || r.portions || 4
  const vue = recetteAuxPortions(r, nb)    // recette pondérée pour `nb` personnes
  const modifie = nb !== r.portions
  document.getElementById('detailContent').innerHTML = `
    <div class="detail-photo" id="detailPhoto">${r.image_url ? `<img src="${esc(r.image_url)}" alt="Photo : ${esc(r.nom)}">` : ''}</div>
    <h2 class="modal-title detail-titre">${esc(r.nom)}</h2>
    <div class="recipe-meta" style="margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
      <span>${icone('horloge')}Préparation ${r.temps_prep || 0} min</span>
      <span>${icone('flamme')}Cuisson ${r.temps_cuisson || 0} min</span>
      ${r.vegetarien ? `<span>${icone('feuille')}Végétarien</span>` : ''}
      ${r.livre_id && nomLivre(r.livre_id) ? `<span>${icone('livre')}${esc(nomLivre(r.livre_id))}</span>` : ''}
    </div>
    ${r.nutrition?.calories ? `<div class="card detail-nutrition">
      <span class="text-sm"><b>${esc(r.nutrition.calories)}</b> kcal</span>
      <span class="text-sm"><b>${esc(r.nutrition.proteines)} g</b> protéines</span>
      <span class="text-sm"><b>${esc(r.nutrition.glucides)} g</b> glucides</span>
      <span class="text-sm"><b>${esc(r.nutrition.lipides)} g</b> lipides</span>
      <span class="text-xs text-muted">par portion</span>
    </div>` : ''}
    ${r.description ? `<p class="text-sm" style="margin-bottom:1rem;">${esc(r.description)}</p>` : ''}
    <div class="detail-avis" role="group" aria-label="Avis du foyer">
      <span class="text-sm text-muted">Votre avis :</span>
      <button class="chip ${r.avis === 1 ? 'active' : ''}" data-avis-recette="1" aria-pressed="${r.avis === 1}">${icone('coeur')}A plu</button>
      <button class="chip ${r.avis === -1 ? 'active' : ''}" data-avis-recette="-1" aria-pressed="${r.avis === -1}">${icone('croix')}N'a pas plu</button>
    </div>
    ${r.composants ? `<div class="recette-composants">
      ${r.composants.base ? `<b>Base</b><span>${esc(r.composants.base)}</span>` : ''}
      ${r.composants.principal ? `<b>Principal</b><span>${esc(r.composants.principal)}</span>` : ''}
      ${r.composants.proteine ? `<b>Protéine</b><span>${esc(r.composants.proteine)}</span>` : ''}
      ${r.composants.legumes?.length ? `<b>Légumes</b><span>${esc(r.composants.legumes.join(', '))}</span>` : ''}
      ${r.conservation_jours != null ? `<b>Conservation</b><span>${esc(r.conservation_jours)} jour(s) au frigo</span>` : ''}
    </div>` : ''}
    ${(r.legumes_caches || []).map(l => `<div class="astuce-cachee">${icone('oeil')}<span><b>${esc(l.legume)}</b> : ${esc(l.astuce)}</span></div>`).join('')}
    <div class="detail-ingredients-tete">
      <h3>Ingrédients</h3>
      <div class="pas-a-pas" role="group" aria-label="Nombre de personnes">
        <button type="button" data-personnes="-1" aria-label="Une personne de moins" ${nb <= 1 ? 'disabled' : ''}>${icone('moins')}</button>
        <output aria-live="polite">${nb} pers.</output>
        <button type="button" data-personnes="1" aria-label="Une personne de plus" ${nb >= 20 ? 'disabled' : ''}>${icone('plus')}</button>
      </div>
    </div>
    ${modifie ? `<p class="text-xs text-muted detail-pondere">Quantités recalculées pour ${nb} personne(s) (recette écrite pour ${r.portions}).
      <button type="button" class="btn-lien" data-garder-portions>Enregistrer pour ${nb} personne(s)</button></p>` : ''}
    <ul class="detail-ingredients">
      ${(vue.ingredients || []).map(i => `<li class="text-sm"><span class="detail-qte">${esc(i.quantite)}</span> ${esc(i.nom)}</li>`).join('')}
    </ul>
    ${r.etapes?.length ? `<h3 style="margin-bottom:0.5rem;">Préparation</h3>
    <ol style="padding-left:1.25rem;">
      ${r.etapes.map(e => `<li class="text-sm" style="padding:0.3rem 0;">${esc(e)}</li>`).join('')}
    </ol>` : ''}
    <div id="detailPhotoErreur"></div>
    <div class="detail-actions">
      <button class="btn btn-primary btn-sm" id="btnCuisinerRecette">${icone('marmite')}Cuisiner pour ${nb}</button>
      <button class="btn btn-secondary btn-sm" id="btnPlanifierRecette">${icone('calendrier')}Planifier</button>
      <button class="btn btn-secondary btn-sm" id="btnEditRecette">${icone('crayon')}Modifier</button>
    </div>
    <details class="detail-plus">
      <summary>Plus d'actions</summary>
      <div class="detail-actions">
        <button class="btn btn-secondary btn-sm" id="btnImprimerRecette">${icone('imprimer')}Imprimer (${nb} pers.)</button>
        <button class="btn btn-secondary btn-sm" id="btnPhotoRecette" title="≈ ${formatDollars(coutImage().cout)} la photo">${icone('etincelle')}${r.image_url ? 'Nouvelle photo' : 'Générer une photo'}</button>
        <button class="btn btn-secondary btn-sm" id="btnDupliquerRecette">${icone('copie')}Dupliquer</button>
        <button class="btn btn-secondary btn-sm btn-texte-danger" id="btnDeleteRecette">${icone('poubelle')}Supprimer</button>
      </div>
    </details>`
  document.getElementById('modalDetail').classList.remove('hidden')
  const zone = document.getElementById('detailContent')

  zone.querySelectorAll('[data-personnes]').forEach(b => b.addEventListener('click', () => {
    const suivant = Math.min(20, Math.max(1, nb + Number(b.dataset.personnes)))
    ouvrirDetail(id, suivant).then(() => document.querySelector(`#detailContent [data-personnes="${b.dataset.personnes}"]:not([disabled])`)?.focus()
      || document.querySelector('#detailContent [data-personnes]:not([disabled])')?.focus())
  }))
  zone.querySelector('[data-garder-portions]')?.addEventListener('click', async () => {
    const ok = await confirmer(`Les quantités enregistrées seront celles pour ${nb} personne(s). Le planning et les courses restent justes (ils recalculent selon les portions de chaque repas).`,
      { titre: `Recette pour ${nb} personne(s) ?`, ok: 'Enregistrer' })
    if (!ok) return
    try {
      await addRecette({ ...vue, date: r.date })
      invaliderCatalogue()
      informer(`« ${r.nom} » est maintenant écrite pour ${nb} personne(s).`, { type: 'ok' })
      await ouvrirDetail(id)
      renderList()
    } catch (e) { signalerErreur(e, 'Enregistrement') }
  })
  document.getElementById('btnImprimerRecette').addEventListener('click', () => imprimerRecette(vue))
  zone.querySelectorAll('[data-avis-recette]').forEach(b => b.addEventListener('click', async () => {
    const avis = Number(b.dataset.avisRecette) === r.avis ? null : Number(b.dataset.avisRecette) // re-toucher = retirer
    try { await dbSetAvis([], r.id, avis) } catch (e) { return signalerErreur(e, 'Avis') }
    r.avis = avis
    ouvrirDetail(id, nb)
  }))
  document.getElementById('btnCuisinerRecette').addEventListener('click', () => ouvrirModeCuisine([{ recette: r, portions: nb }], r.nom))
  document.getElementById('btnPlanifierRecette').addEventListener('click', () =>
    ouvrirPlanifier(r, document.getElementById('detailContent'), () => ouvrirDetail(id, nb)))

  // Photo IA : la page reste utilisable ; la carte se met à jour par le temps réel
  document.getElementById('btnPhotoRecette').addEventListener('click', async (e) => {
    const btn = e.currentTarget
    const zonePhoto = document.getElementById('detailPhoto')
    btn.disabled = true
    btn.innerHTML = `<span class="loader loader-mini"></span>Photo en cours…`
    zonePhoto.classList.add('detail-photo-attente')
    document.getElementById('detailPhotoErreur').innerHTML = ''
    try {
      const url = await genererImageRecette(r)
      await dbSetImageRecette(r.id, url)
      r.image_url = url
      zonePhoto.innerHTML = `<img src="${esc(url)}" alt="Photo : ${esc(r.nom)}">`
      btn.innerHTML = `${icone('etincelle')}Nouvelle photo`
    } catch (err) {
      document.getElementById('detailPhotoErreur').innerHTML = htmlErreurIA(err.info || expliquerErreur('INCONNUE', err.message))
      btn.innerHTML = `${icone('etincelle')}${r.image_url ? 'Nouvelle photo' : 'Générer une photo'}`
    } finally {
      zonePhoto.classList.remove('detail-photo-attente')
      btn.disabled = false
    }
  })

  document.getElementById('btnDeleteRecette').addEventListener('click', () => supprimerRecette(r))
  document.getElementById('btnEditRecette').addEventListener('click', () => ouvrirFormEdit(r))
  document.getElementById('btnDupliquerRecette').addEventListener('click', () => {
    const { id: _, image_url: __, avis: ___, ...copie } = r
    ouvrirFormEdit({ ...copie, id: '', nom: 'Copie de ' + r.nom })
  })
}

// Suppression avec « Annuler » : la recette et ses repas prévus sont remis en place
async function supprimerRecette(r) {
  let prevus = []
  try { prevus = await dbGetPlanningDeRecette(r.id) } catch { /* on supprime quand même, sans pouvoir remettre les repas */ }
  const message = prevus.length
    ? `Elle est prévue sur ${prevus.length} repas, qui redeviendront vides.`
    : 'Elle sera retirée de la bibliothèque.'
  if (!await confirmer(message, { titre: `Supprimer « ${r.nom} » ?`, ok: 'Supprimer', danger: true })) return
  try {
    await deleteRecette(r.id)
  } catch (e) { return signalerErreur(e, 'Suppression') }
  document.getElementById('modalDetail').classList.add('hidden')
  invaliderCatalogue()
  await renderList()
  informer(`« ${r.nom} » supprimée.`, {
    duree: 8000,
    action: { label: 'Annuler', faire: async () => {
      try {
        await addRecette(r)
        if (prevus.length) await dbUpsertPlanningLot(prevus)
        invaliderCatalogue()
        await renderList()
        informer(`« ${r.nom} » est revenue.`, { type: 'ok' })
      } catch (e) { signalerErreur(e, 'Annulation') }
    } },
  })
}

// ── Formulaire : ingrédients (quantité + nom) et étapes ──────────────
function creerLigneIngredient({ quantite = '', nom = '' } = {}) {
  const div = document.createElement('div')
  div.className = 'edit-row edit-row-ingredient'
  div.innerHTML = `<input class="form-input edit-qte" type="text" placeholder="400 g" aria-label="Quantité" value="${esc(quantite)}">
    <input class="form-input edit-nom" type="text" placeholder="tomates" aria-label="Ingrédient" value="${esc(nom)}">
    <button type="button" class="edit-row-delete" aria-label="Supprimer la ligne">${icone('croix')}</button>`
  div.querySelector('.edit-row-delete').addEventListener('click', () => div.remove())
  // Liste collée (« 400 g tomates », une par ligne) : découpée en lignes quantité + nom
  div.querySelector('.edit-nom').addEventListener('paste', e => {
    const texte = e.clipboardData?.getData('text') || ''
    const lignes = texte.split(/\r?\n/).map(lireLigneIngredient).filter(Boolean)
    if (lignes.length < 2 && !(lignes.length === 1 && lignes[0].quantite && !div.querySelector('.edit-qte').value)) return
    e.preventDefault()
    const [premiere, ...suivantes] = lignes
    div.querySelector('.edit-qte').value = premiere.quantite
    div.querySelector('.edit-nom').value = premiere.nom
    let apres = div
    for (const l of suivantes) { const n = creerLigneIngredient(l); apres.after(n); apres = n }
  })
  return div
}

function creerLigneEtape(valeur = '') {
  const div = document.createElement('div')
  div.className = 'edit-row'
  div.innerHTML = `<textarea class="form-input" rows="2" placeholder="Décrivez l'étape…" aria-label="Étape">${esc(valeur)}</textarea>
    <button type="button" class="edit-row-delete" aria-label="Supprimer l'étape">${icone('croix')}</button>`
  div.querySelector('.edit-row-delete').addEventListener('click', () => div.remove())
  return div
}

function renderIngredients(ingredients) {
  const liste = document.getElementById('editIngredientsList')
  liste.innerHTML = ''
  // Les ingrédients abîmés par l'ancien formulaire (« 400 » + « g Tomates ») sont recollés à l'ouverture
  ;(ingredients || []).map(reparerIngredient).filter(i => i.nom || i.quantite).forEach(i => liste.appendChild(creerLigneIngredient(i)))
  if (!liste.children.length) liste.appendChild(creerLigneIngredient())
}

function lireIngredientsFormulaire() {
  return [...document.querySelectorAll('#editIngredientsList .edit-row-ingredient')].map(row => ({
    quantite: row.querySelector('.edit-qte').value.trim(),
    nom:      row.querySelector('.edit-nom').value.trim(),
  })).filter(i => i.nom)
}

function renderEtapes(etapes) {
  const liste = document.getElementById('editEtapesList')
  liste.innerHTML = ''
  ;(etapes || []).forEach(etape => liste.appendChild(creerLigneEtape(etape)))
}

// Changer les portions du formulaire pondère les quantités saisies (si la case est cochée)
function surChangementPortions(e) {
  const champ = e.target
  const avant = Number(champ.dataset.avant) || 0
  const apres = parseInt(champ.value, 10) || 0
  champ.dataset.avant = apres || avant
  if (!avant || !apres || avant === apres || !document.getElementById('editAjusterQuantites').checked) return
  const ingredients = ingredientsPour({ portions: avant, ingredients: lireIngredientsFormulaire() }, apres)
  renderIngredients(ingredients)
  informer(`Quantités recalculées pour ${apres} personne(s).`, { type: 'ok', duree: 2500 })
}

// ── Ouverture du formulaire (modifier, dupliquer, nouvelle recette, import) ──
export function ouvrirFormEdit(recette = {}) {
  recetteEnEdition = recette

  document.getElementById('editRecetteTitle').textContent =
    recette.id ? 'Modifier la recette' : recette.nom ? 'Nouvelle recette (à vérifier)' : 'Nouvelle recette'

  // Champs simples
  document.getElementById('editNom').value        = recette.nom || ''
  document.getElementById('editPortions').value   = recette.portions || 4
  document.getElementById('editPortions').dataset.avant = recette.portions || 4
  document.getElementById('editPrep').value       = recette.temps_prep || ''
  document.getElementById('editCuisson').value    = recette.temps_cuisson || ''
  document.getElementById('editVeg').checked      = !!recette.vegetarien

  // Livre (une recette au plus dans un livre) ; nouvelle recette depuis un livre ouvert → ce livre
  const livreId = recette.id ? recette.livre_id : (recette.livre_id ?? getLivreActif())
  document.getElementById('editLivre').innerHTML = '<option value="">Aucun livre</option>'
    + getLivres().map(l => `<option value="${esc(l.id)}">${esc(l.nom)}</option>`).join('')
  document.getElementById('editLivre').value = livreId || ''

  // Format structuré
  const c = recette.composants || {}
  document.getElementById('editDescription').value  = recette.description || ''
  document.getElementById('editBase').value         = c.base || ''
  document.getElementById('editPrincipal').value    = c.principal || ''
  document.getElementById('editProteine').value     = c.proteine || ''
  document.getElementById('editLegumes').value      = (c.legumes || []).join(', ')
  document.getElementById('editCuisine').value      = recette.cuisine || ''
  document.getElementById('editConservation').value = recette.conservation_jours ?? ''
  document.getElementById('editCaches').value       = (recette.legumes_caches || []).map(l => `${l.legume} : ${l.astuce}`).join('\n')
  const tagsWrap = document.getElementById('editTags')
  tagsWrap.innerHTML = TAGS.map(t => `<button type="button" class="chip ${(recette.tags || []).includes(t) ? 'active' : ''}" data-tag="${esc(t)}" aria-pressed="${(recette.tags || []).includes(t)}">${esc(t)}</button>`).join('')

  // Nutrition
  const n = recette.nutrition || {}
  document.getElementById('editKcal').value = n.calories   || ''
  document.getElementById('editProt').value = n.proteines  || ''
  document.getElementById('editGluc').value = n.glucides   || ''
  document.getElementById('editLip').value  = n.lipides    || ''

  // Listes dynamiques
  renderIngredients(recette.ingredients || [])
  renderEtapes(recette.etapes || [])

  document.getElementById('modalEditRecette').classList.remove('hidden')
}

// ── Soumission du formulaire ──────────────────────────────────────────────────

async function soumettreFormEdit(e) {
  e.preventDefault()
  const nombre = id => { const v = parseInt(document.getElementById(id).value, 10); return Number.isFinite(v) ? v : null }

  const etapes = [...document.querySelectorAll('#editEtapesList .edit-row textarea')].map(t => t.value.trim()).filter(Boolean)
  const nutrition = { calories: nombre('editKcal'), proteines: nombre('editProt'), glucides: nombre('editGluc'), lipides: nombre('editLip') }

  const recette = {
    ...(recetteEnEdition.id ? { id: recetteEnEdition.id } : {}),
    nom:           document.getElementById('editNom').value.trim(),
    portions:      nombre('editPortions') || 4,
    temps_prep:    nombre('editPrep') || 0,
    temps_cuisson: nombre('editCuisson') || 0,
    vegetarien:    document.getElementById('editVeg').checked,
    ingredients:   lireIngredientsFormulaire(),
    etapes,
    // Nutrition vide : rien d'enregistré (plutôt que « 0 kcal »)
    nutrition: Object.values(nutrition).some(v => v) ? Object.fromEntries(Object.entries(nutrition).map(([k, v]) => [k, v || 0])) : null,
    date: recetteEnEdition.id ? (recetteEnEdition.date || new Date().toISOString()) : new Date().toISOString(),
    description: document.getElementById('editDescription').value.trim() || null,
    cuisine:     document.getElementById('editCuisine').value.trim().toLowerCase() || null,
    composants: {
      base:      document.getElementById('editBase').value.trim() || null,
      principal: document.getElementById('editPrincipal').value.trim() || null,
      proteine:  document.getElementById('editProteine').value.trim() || null,
      legumes:   document.getElementById('editLegumes').value.split(',').map(x => x.trim()).filter(Boolean),
    },
    tags: [...document.querySelectorAll('#editTags .chip.active')].map(b => b.dataset.tag),
    legumes_caches: document.getElementById('editCaches').value.split('\n').map(l => {
      const i = l.indexOf(':')
      return i > 0 ? { legume: l.slice(0, i).trim(), astuce: l.slice(i + 1).trim() } : null
    }).filter(l => l?.legume && l.astuce),
    conservation_jours: nombre('editConservation'),
    livre_id: document.getElementById('editLivre').value || null,
  }
  if (!recette.nom) return informer('Donne un nom à la recette.', { type: 'erreur' })
  if (!recette.ingredients.length && !await confirmer('Cette recette n\'a aucun ingrédient : elle n\'apparaîtra pas dans les courses.', { ok: 'Enregistrer quand même' })) return

  // Contrôle halal immédiat (la bibliothèque l'écarterait de toute façon des propositions)
  const { contientInterdit } = await import('./filtres.js')
  if (contientInterdit(recette) && !await confirmer('Un ingrédient ressemble à du porc ou de l\'alcool : la recette ne sera jamais proposée dans le planning. Si c\'est une version halal, précise-le (« jambon de dinde », « gélatine bovine »).',
    { titre: 'Contrainte halal', ok: 'Enregistrer quand même', danger: true })) return

  const bouton = document.getElementById('btnSauverEdit')
  bouton.disabled = true
  let id
  try {
    id = await addRecette(recette)
  } catch (err) {
    bouton.disabled = false
    return signalerErreur(err, 'Enregistrement')
  }
  bouton.disabled = false
  document.getElementById('modalEditRecette').classList.add('hidden')
  invaliderCatalogue()
  await renderList()
  informer(recetteEnEdition.id ? 'Recette enregistrée.' : `« ${recette.nom} » ajoutée à la bibliothèque.`, { type: 'ok' })
  await ouvrirDetail(id)
}

// ── Initialisation ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await chargerLivres()
  initLivres({ rafraichir: () => { invaliderCatalogue(); return renderList() }, nomsRecettes: () => nomsRecettes })
  relireFiltres()
  const champRecherche = document.getElementById('rechercheRecette')
  if (champRecherche && filtres.recherche) champRecherche.value = filtres.recherche
  await renderList()

  // Gestion navigation depuis le planning
  const params = new URLSearchParams(window.location.search)
  if (params.get('from') === 'planning') {
    document.getElementById('backBanner')?.classList.remove('hidden')
  }
  const targetId = params.get('id')
  if (targetId) {
    await ouvrirDetail(targetId, Number(params.get('portions')) || null)
    const card = document.querySelector(`[data-id="${CSS.escape(targetId)}"]`)
    if (card) {
      card.classList.add('recipe-card-cible')
      card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // Cartes : clic (et Entrée / Espace via modales.js) → détail
  document.getElementById('recettesList')?.addEventListener('click', e => {
    const card = e.target.closest('[data-id]')
    if (card) ouvrirDetail(card.dataset.id)
  })

  // Nouvelle recette, import
  document.getElementById('btnNouvelleRecette')?.addEventListener('click', () => ouvrirFormEdit({ portions: 4 }))
  document.getElementById('btnImporterRecette')?.addEventListener('click', async () => {
    const { ouvrirImport } = await import('./import-recette.js')
    ouvrirImport(recette => ouvrirFormEdit(recette))
  })

  // Fermeture modale détail
  document.getElementById('closeDetail')?.addEventListener('click', () =>
    document.getElementById('modalDetail').classList.add('hidden'))

  // Filtres déduits des recettes : panneau repliable + rappel des filtres actifs
  document.getElementById('btnFiltres')?.addEventListener('click', (e) => {
    const panel = document.getElementById('filtresPanel')
    const ouvert = panel.classList.toggle('hidden') === false
    e.currentTarget.setAttribute('aria-expanded', ouvert)
  })
  const surFiltre = async (e) => {
    if (e.target.closest('[data-effacer]')) { selection = {}; ingredientsFiltre = []; return renderList() }
    const puce = e.target.closest('[data-ingredient]')
    if (puce) { ingredientsFiltre = ingredientsFiltre.filter((_, i) => i !== Number(puce.dataset.ingredient)); return renderList() }
    const chip = e.target.closest('[data-groupe]'); if (!chip) return
    const unique = disponibles.find(g => g.id === chip.dataset.groupe)?.unique
    selection = basculer(selection, chip.dataset.groupe, chip.dataset.valeur, unique)
    await renderList()
    document.querySelector(`#filtresPanel [data-groupe="${CSS.escape(chip.dataset.groupe)}"][data-valeur="${CSS.escape(chip.dataset.valeur)}"]`)?.focus()
  }
  document.getElementById('filtresPanel')?.addEventListener('click', surFiltre)
  document.getElementById('filtresActifs')?.addEventListener('click', surFiltre)

  // Ingrédients : Entrée, virgule ou « Ajouter » transforment la saisie en puces
  const champIngredient = document.getElementById('filtreIngredient')
  const validerIngredients = async () => {
    const suivant = ajouterIngredients(ingredientsFiltre, champIngredient.value)
    champIngredient.value = ''
    if (suivant.length === ingredientsFiltre.length) return
    ingredientsFiltre = suivant
    await renderList()
  }
  champIngredient?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); validerIngredients() }
  })
  champIngredient?.addEventListener('blur', validerIngredients)
  document.getElementById('btnAjouterIngredient')?.addEventListener('click', validerIngredients)

  // Recherche par nom (dans le catalogue en mémoire : aucune requête)
  let rechercheTimer = null
  document.getElementById('rechercheRecette')?.addEventListener('input', e => {
    clearTimeout(rechercheTimer)
    rechercheTimer = setTimeout(async () => {
      filtres.recherche = e.target.value.trim() || null
      await renderList()
    }, 150)
  })

  // Fermeture modale édition
  document.getElementById('closeEditRecette')?.addEventListener('click', () =>
    document.getElementById('modalEditRecette').classList.add('hidden'))
  document.getElementById('btnAnnulerEdit')?.addEventListener('click', () =>
    document.getElementById('modalEditRecette').classList.add('hidden'))

  // Boutons ajout de ligne (le nouveau champ prend le focus)
  document.getElementById('btnAddIngredient')?.addEventListener('click', () => {
    const ligne = creerLigneIngredient()
    document.getElementById('editIngredientsList').appendChild(ligne)
    ligne.querySelector('.edit-qte').focus()
  })
  document.getElementById('btnAddEtape')?.addEventListener('click', () => {
    const ligne = creerLigneEtape()
    document.getElementById('editEtapesList').appendChild(ligne)
    ligne.querySelector('textarea').focus()
  })
  document.getElementById('editPortions')?.addEventListener('change', surChangementPortions)

  // Soumission formulaire
  document.getElementById('formEditRecette')?.addEventListener('submit', soumettreFormEdit)
  document.getElementById('editTags')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return
    chip.classList.toggle('active')
    chip.setAttribute('aria-pressed', chip.classList.contains('active'))
  })

  // Temps réel : nouvelles recettes ou modifications faites par l'autre membre du foyer
  dbEcouter(['recettes'], debounce(() => { invaliderCatalogue(); renderList() }, 300))
  dbEcouter(['livres'], debounce(async () => { await chargerLivres(); await renderList() }, 300))
})
