// js/recettes-ui.js
import { getRecettes, deleteRecette, getRecetteById, addRecette } from './recettes.js'

let filtres = {}
let recetteEnEdition = null

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

async function renderList() {
  const recettes  = await getRecettes(filtres)
  const container = document.getElementById('recettesList')
  if (!container) return
  container.innerHTML = recettes.length === 0
    ? '<p class="text-muted">Aucune recette. Générez-en depuis le planning !</p>'
    : recettes.map(r => `
        <div class="recipe-card" style="cursor:pointer;" data-id="${r.id}">
          <div class="recipe-name">${r.nom}</div>
          <div class="recipe-meta">
            <span>⏱ ${r.temps_prep + r.temps_cuisson} min</span>
            <span>👤 ${r.portions} pers.</span>
            ${r.nutrition?.calories ? `<span>🔥 ${r.nutrition.calories} kcal</span>` : ''}
          </div>
          <div class="recipe-tags">${r.vegetarien ? '<span class="recipe-tag">🌿 Végétarien</span>' : ''}</div>
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
      <span>⏱ Prép: ${r.temps_prep} min</span>
      <span>🔥 Cuisson: ${r.temps_cuisson} min</span>
      <span>👤 ${r.portions} pers.</span>
      ${r.vegetarien ? '<span>🌿 Végétarien</span>' : ''}
    </div>
    ${r.nutrition ? `<div class="card" style="margin-bottom:1rem;display:flex;gap:1rem;flex-wrap:wrap;">
      <span class="text-sm">🔥 ${r.nutrition.calories} kcal</span>
      <span class="text-sm">💪 ${r.nutrition.proteines}g prot.</span>
      <span class="text-sm">🌾 ${r.nutrition.glucides}g gluc.</span>
      <span class="text-sm">🫙 ${r.nutrition.lipides}g lip.</span>
    </div>` : ''}
    <h3 style="margin-bottom:0.5rem;">Ingrédients</h3>
    <ul style="margin-bottom:1rem;">
      ${r.ingredients.map(i => `<li class="text-sm" style="padding:0.2rem 0;">• ${esc(i.quantite)} ${esc(i.nom)}</li>`).join('')}
    </ul>
    <h3 style="margin-bottom:0.5rem;">Préparation</h3>
    <ol style="padding-left:1.25rem;">
      ${r.etapes.map(e => `<li class="text-sm" style="padding:0.3rem 0;">${esc(e)}</li>`).join('')}
    </ol>
    <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--color-border);display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm" id="btnDeleteRecette" data-id="${esc(r.id)}">🗑 Supprimer</button>
      <button class="btn btn-secondary btn-sm" id="btnEditRecette" data-id="${esc(r.id)}">✏️ Modifier</button>
      <button class="btn btn-secondary btn-sm" id="btnDupliquerRecette" data-id="${esc(r.id)}">⧉ Dupliquer</button>
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
  btn.textContent = '✕'
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
  btn.textContent = '✕'
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
    recette.id ? '✏️ Modifier la recette' : '⧉ Dupliquer la recette'

  // Champs simples
  document.getElementById('editNom').value        = recette.nom || ''
  document.getElementById('editPortions').value   = recette.portions || ''
  document.getElementById('editPrep').value       = recette.temps_prep || ''
  document.getElementById('editCuisson').value    = recette.temps_cuisson || ''
  document.getElementById('editVeg').checked      = !!recette.vegetarien

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
  await renderList()

  // Gestion navigation depuis le planning
  const params = new URLSearchParams(window.location.search)
  if (params.get('from') === 'planning') {
    document.getElementById('backBanner')?.classList.remove('hidden')
  }
  const targetId = params.get('id')
  if (targetId) {
    await ouvrirDetail(targetId)
    const card = document.querySelector(`[data-id="${targetId}"]`)
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
})
