// js/recettes-ui.js
import { getRecettes, deleteRecette, getRecetteById } from './recettes.js'

let filtres = {}

function renderList() {
  const recettes  = getRecettes(filtres)
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

function ouvrirDetail(id) {
  const r = getRecetteById(id)
  if (!r) return
  document.getElementById('detailContent').innerHTML = `
    <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin-bottom:0.5rem;">${r.nom}</h2>
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
      ${r.ingredients.map(i => `<li class="text-sm" style="padding:0.2rem 0;">• ${i.quantite} ${i.nom}</li>`).join('')}
    </ul>
    <h3 style="margin-bottom:0.5rem;">Préparation</h3>
    <ol style="padding-left:1.25rem;">
      ${r.etapes.map(e => `<li class="text-sm" style="padding:0.3rem 0;">${e}</li>`).join('')}
    </ol>
    <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--color-border);">
      <button class="btn btn-secondary btn-sm" id="btnDeleteRecette" data-id="${r.id}">🗑 Supprimer</button>
    </div>`
  document.getElementById('modalDetail').classList.remove('hidden')
  document.getElementById('btnDeleteRecette').addEventListener('click', () => {
    if (confirm(`Supprimer "${r.nom}" ?`)) {
      deleteRecette(id)
      document.getElementById('modalDetail').classList.add('hidden')
      renderList()
    }
  })
}

document.addEventListener('DOMContentLoaded', () => {
  renderList()
  document.getElementById('closeDetail')?.addEventListener('click', () =>
    document.getElementById('modalDetail').classList.add('hidden'))
  document.getElementById('filtreVeg')?.addEventListener('click', (e) => {
    filtres.vegetarien = !filtres.vegetarien
    e.target.classList.toggle('active')
    renderList()
  })
  document.getElementById('filtreRapide')?.addEventListener('click', (e) => {
    filtres.maxMinutes = filtres.maxMinutes ? null : 30
    e.target.classList.toggle('active')
    renderList()
  })
})
