// js/recettes-ui.js
import { getRecettes, filtrerRecettes, deleteRecette, getRecetteById, addRecette } from './recettes.js'
import { dbEcouter } from './db.js'
import { esc, debounce } from './utils.js'
import { TAGS } from './filtres.js'
import { icone } from './icones.js'
import { initLivres, chargerLivres, renderLivres, getLivres, getLivreActif, nomLivre } from './livres-ui.js'

let filtres = {}
let recetteEnEdition = null
let nomsRecettes = []

async function renderList() {
  const toutes    = await getRecettes()
  nomsRecettes    = toutes.map(r => r.nom)
  renderLivres(toutes)
  const livre     = getLivreActif()
  const recettes  = filtrerRecettes(toutes, { ...filtres, livre })
  const container = document.getElementById('recettesList')
  if (!container) return
  container.innerHTML = recettes.length === 0
    ? `<p class="text-muted">${livre ? 'Ce livre est vide : « Générer des recettes » pour le remplir, ou range une recette dedans depuis « Modifier ».' : 'Aucune recette. Générez-en depuis le planning !'}</p>`
    : recettes.map(r => `
        <div class="recipe-card" style="cursor:pointer;" data-id="${esc(r.id)}">
          <div class="recipe-name">${esc(r.nom)}</div>
          <div class="recipe-meta">
            <span>${icone('horloge')}${r.temps_prep + r.temps_cuisson} min</span>
            <span>${icone('famille')}${r.portions} pers.</span>
            ${r.nutrition?.calories ? `<span>${icone('flamme')}${r.nutrition.calories} kcal</span>` : ''}
          </div>
          <div class="recipe-tags">${!livre && r.livre_id && nomLivre(r.livre_id) ? `<span class="recipe-tag recipe-tag-livre">${icone('livre')}${esc(nomLivre(r.livre_id))}</span>` : ''}${r.vegetarien ? '<span class="recipe-tag recipe-tag-veg">Végétarien</span>' : ''}${(r.tags || []).map(t => `<span class="recipe-tag">${esc(t)}</span>`).join('')}${r.cuisine ? `<span class="recipe-tag">${esc(r.cuisine)}</span>` : ''}</div>
        </div>`).join('')
  container.querySelectorAll('[data-id]').forEach(card => {
    card.addEventListener('click', () => ouvrirDetail(card.dataset.id))
  })
}

async function ouvrirDetail(id) {
  const r = await getRecetteById(id)
  if (!r) return
  document.getElementById('detailContent').innerHTML = `
    <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin-bottom:0.5rem;">${esc(r.nom)}</h2>
    <div class="recipe-meta" style="margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
      <span>${icone('horloge')}Préparation ${r.temps_prep} min</span>
      <span>${icone('flamme')}Cuisson ${r.temps_cuisson} min</span>
      <span>${icone('famille')}${r.portions} pers.</span>
      ${r.vegetarien ? `<span>${icone('feuille')}Végétarien</span>` : ''}
      ${r.livre_id && nomLivre(r.livre_id) ? `<span>${icone('livre')}${esc(nomLivre(r.livre_id))}</span>` : ''}
    </div>
    ${r.nutrition ? `<div class="card" style="margin-bottom:1rem;display:flex;gap:1rem;flex-wrap:wrap;">
      <span class="text-sm"><b>${r.nutrition.calories}</b> kcal</span>
      <span class="text-sm"><b>${r.nutrition.proteines} g</b> protéines</span>
      <span class="text-sm"><b>${r.nutrition.glucides} g</b> glucides</span>
      <span class="text-sm"><b>${r.nutrition.lipides} g</b> lipides</span>
    </div>` : ''}
    ${r.description ? `<p class="text-sm" style="margin-bottom:1rem;">${esc(r.description)}</p>` : ''}
    ${r.composants ? `<div class="recette-composants">
      ${r.composants.base ? `<b>Base</b><span>${esc(r.composants.base)}</span>` : ''}
      ${r.composants.principal ? `<b>Principal</b><span>${esc(r.composants.principal)}</span>` : ''}
      ${r.composants.proteine ? `<b>Protéine</b><span>${esc(r.composants.proteine)}</span>` : ''}
      ${r.composants.legumes?.length ? `<b>Légumes</b><span>${esc(r.composants.legumes.join(', '))}</span>` : ''}
      ${r.conservation_jours != null ? `<b>Conservation</b><span>${esc(r.conservation_jours)} jour(s) au frigo</span>` : ''}
    </div>` : ''}
    ${(r.legumes_caches || []).map(l => `<div class="astuce-cachee">${icone('oeil')}<span><b>${esc(l.legume)}</b> : ${esc(l.astuce)}</span></div>`).join('')}
    <h3 style="margin-bottom:0.5rem;${r.legumes_caches?.length ? 'margin-top:1rem;' : ''}">Ingrédients</h3>
    <ul style="margin-bottom:1rem;">
      ${(r.ingredients || []).map(i => `<li class="text-sm" style="padding:0.2rem 0;">• ${esc(i.quantite)} ${esc(i.nom)}</li>`).join('')}
    </ul>
    ${r.etapes?.length ? `<h3 style="margin-bottom:0.5rem;">Préparation</h3>
    <ol style="padding-left:1.25rem;">
      ${r.etapes.map(e => `<li class="text-sm" style="padding:0.3rem 0;">${esc(e)}</li>`).join('')}
    </ol>` : ''}
    <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--color-border);display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm" id="btnDeleteRecette" data-id="${esc(r.id)}">${icone('poubelle')}Supprimer</button>
      <button class="btn btn-secondary btn-sm" id="btnEditRecette" data-id="${esc(r.id)}">${icone('crayon')}Modifier</button>
      <button class="btn btn-secondary btn-sm" id="btnDupliquerRecette" data-id="${esc(r.id)}">${icone('copie')}Dupliquer</button>
    </div>`
  document.getElementById('modalDetail').classList.remove('hidden')

  document.getElementById('btnDeleteRecette').addEventListener('click', async () => {
    if (confirm(`Supprimer "${r.nom}" ?`)) {
      await deleteRecette(id)
      document.getElementById('modalDetail').classList.add('hidden')
      await renderList()
    }
  })

  document.getElementById('btnEditRecette').addEventListener('click', () => {
    ouvrirFormEdit(r)
  })

  document.getElementById('btnDupliquerRecette').addEventListener('click', () => {
    ouvrirFormEdit({ ...r, id: '', nom: 'Copie de ' + r.nom })
  })
}

// ── Helpers pour les lignes dynamiques ───────────────────────────────────────

function creerLigneIngredient(valeur = '') {
  const div = document.createElement('div')
  div.className = 'edit-row'
  const input = document.createElement('input')
  input.className = 'form-input'
  input.type = 'text'
  input.placeholder = 'ex: 200g tomates'
  input.value = valeur
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'edit-row-delete'
  btn.title = 'Supprimer'
  btn.setAttribute('aria-label', 'Supprimer la ligne')
  btn.innerHTML = icone('croix')
  btn.addEventListener('click', () => div.remove())
  div.appendChild(input)
  div.appendChild(btn)
  return div
}

function creerLigneEtape(valeur = '') {
  const div = document.createElement('div')
  div.className = 'edit-row'
  const input = document.createElement('input')
  input.className = 'form-input'
  input.type = 'text'
  input.placeholder = "Décrivez l'étape…"
  input.value = valeur
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'edit-row-delete'
  btn.title = 'Supprimer'
  btn.setAttribute('aria-label', 'Supprimer la ligne')
  btn.innerHTML = icone('croix')
  btn.addEventListener('click', () => div.remove())
  div.appendChild(input)
  div.appendChild(btn)
  return div
}

function renderIngredients(ingredients) {
  const liste = document.getElementById('editIngredientsList')
  liste.innerHTML = ''
  ;(ingredients || []).forEach(ing => {
    const valeur = `${ing.quantite} ${ing.nom}`.trim()
    liste.appendChild(creerLigneIngredient(valeur))
  })
}

function renderEtapes(etapes) {
  const liste = document.getElementById('editEtapesList')
  liste.innerHTML = ''
  ;(etapes || []).forEach(etape => {
    liste.appendChild(creerLigneEtape(etape))
  })
}

// ── Ouverture du formulaire d'édition / duplication ──────────────────────────

function ouvrirFormEdit(recette) {
  recetteEnEdition = recette

  // Titre de la modale
  document.getElementById('editRecetteTitle').textContent =
    recette.id ? 'Modifier la recette' : 'Dupliquer la recette'

  // Champs simples
  document.getElementById('editNom').value        = recette.nom || ''
  document.getElementById('editPortions').value   = recette.portions || ''
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
  tagsWrap.innerHTML = TAGS.map(t => `<button type="button" class="chip ${(recette.tags || []).includes(t) ? 'active' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')

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

  // Ingrédients : chaque ligne = "quantite nom" (séparé au premier espace)
  const ingredients = []
  document.getElementById('editIngredientsList').querySelectorAll('.edit-row input').forEach(input => {
    const val = input.value.trim()
    if (!val) return
    const idx = val.indexOf(' ')
    if (idx === -1) {
      ingredients.push({ quantite: val, nom: '' })
    } else {
      ingredients.push({ quantite: val.slice(0, idx), nom: val.slice(idx + 1) })
    }
  })

  // Étapes
  const etapes = []
  document.getElementById('editEtapesList').querySelectorAll('.edit-row input').forEach(input => {
    const val = input.value.trim()
    if (val) etapes.push(val)
  })

  // Construction de l'objet recette
  const recette = {
    nom:           document.getElementById('editNom').value.trim(),
    portions:      parseInt(document.getElementById('editPortions').value) || 2,
    temps_prep:    parseInt(document.getElementById('editPrep').value)    || 0,
    temps_cuisson: parseInt(document.getElementById('editCuisson').value) || 0,
    vegetarien:    document.getElementById('editVeg').checked,
    ingredients,
    etapes,
    nutrition: {
      calories:  parseInt(document.getElementById('editKcal').value) || 0,
      proteines: parseInt(document.getElementById('editProt').value) || 0,
      glucides:  parseInt(document.getElementById('editGluc').value) || 0,
      lipides:   parseInt(document.getElementById('editLip').value)  || 0,
    },
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
    conservation_jours: document.getElementById('editConservation').value === '' ? null
      : parseInt(document.getElementById('editConservation').value, 10),
    livre_id: document.getElementById('editLivre').value || null,
  }

  // Pour une modification, on conserve l'id existant
  // Pour une duplication (id vide), on n'ajoute pas d'id → dbUpsertRecette en génère un nouveau
  if (recetteEnEdition.id) {
    recette.id = recetteEnEdition.id
  }

  try {
    await addRecette(recette)
  } catch (err) {
    alert('Erreur lors de la sauvegarde : ' + err.message)
    return
  }

  // Fermeture des deux modales + rechargement liste
  document.getElementById('modalEditRecette').classList.add('hidden')
  document.getElementById('modalDetail').classList.add('hidden')
  await renderList()
}

// ── Initialisation ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await chargerLivres()
  initLivres({ rafraichir: renderList, nomsRecettes: () => nomsRecettes })
  await renderList()

  // Gestion navigation depuis le planning
  const params = new URLSearchParams(window.location.search)
  if (params.get('from') === 'planning') {
    document.getElementById('backBanner')?.classList.remove('hidden')
  }
  const targetId = params.get('id')
  if (targetId) {
    await ouvrirDetail(targetId)
    const card = document.querySelector(`[data-id="${CSS.escape(targetId)}"]`)
    if (card) {
      card.style.outline = '2px solid var(--color-primary)'
      card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // Fermeture modale détail
  document.getElementById('closeDetail')?.addEventListener('click', () =>
    document.getElementById('modalDetail').classList.add('hidden'))

  // Filtres liste
  document.getElementById('filtreVeg')?.addEventListener('click', async (e) => {
    filtres.vegetarien = !filtres.vegetarien
    e.target.classList.toggle('active')
    await renderList()
  })
  document.getElementById('filtreRapide')?.addEventListener('click', async (e) => {
    filtres.maxMinutes = filtres.maxMinutes ? null : 30
    e.target.classList.toggle('active')
    await renderList()
  })

  // Recherche par nom
  let rechercheTimer = null
  document.getElementById('rechercheRecette')?.addEventListener('input', e => {
    clearTimeout(rechercheTimer)
    rechercheTimer = setTimeout(async () => {
      filtres.recherche = e.target.value.trim() || null
      await renderList()
    }, 200)
  })

  // Fermeture modale édition
  document.getElementById('closeEditRecette')?.addEventListener('click', () =>
    document.getElementById('modalEditRecette').classList.add('hidden'))
  document.getElementById('btnAnnulerEdit')?.addEventListener('click', () =>
    document.getElementById('modalEditRecette').classList.add('hidden'))

  // Boutons ajout de ligne
  document.getElementById('btnAddIngredient')?.addEventListener('click', () => {
    document.getElementById('editIngredientsList').appendChild(creerLigneIngredient())
  })
  document.getElementById('btnAddEtape')?.addEventListener('click', () => {
    document.getElementById('editEtapesList').appendChild(creerLigneEtape())
  })

  // Soumission formulaire
  document.getElementById('formEditRecette')?.addEventListener('submit', soumettreFormEdit)
  document.getElementById('editTags')?.addEventListener('click', e => e.target.closest('.chip')?.classList.toggle('active'))

  // Temps réel : nouvelles recettes ou modifications faites par l'autre membre du foyer
  dbEcouter(['recettes'], debounce(renderList, 300))
  dbEcouter(['livres'], debounce(async () => { await chargerLivres(); await renderList() }, 300))
})
