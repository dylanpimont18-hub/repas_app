// js/mode-cuisine.js — Mode cuisine : écran qui reste allumé, étapes en grand, plats d'une session ensemble
import { ingredientsPour } from './cuisine.js'
import { labelCreneau } from './cycle.js'
import { genererEtapes } from './ai.js'
import { dbSetEtapesRecette } from './db.js'
import { expliquerErreur } from './credit-ia.js'
import { htmlErreurIA } from './credit-ia-ui.js'
import { esc } from './utils.js'
import { icone } from './icones.js'

// Écran allumé tant que le mode cuisine est ouvert (le verrou saute quand l'app passe en arrière-plan)
let verrou = null
async function garderEcranAllume() {
  try { verrou = await navigator.wakeLock?.request('screen') } catch { verrou = null }
}
function surVisibilite() {
  if (document.visibilityState === 'visible' && document.getElementById('modeCuisine')) garderEcranAllume()
}

/**
 * Ouvre le mode cuisine.
 * @param plats [{ recette, portions, repas?: [creneau] }] dans l'ordre conseillé
 * @param titre ex. « Session du dimanche »
 */
export function ouvrirModeCuisine(plats, titre = 'En cuisine') {
  if (!plats.length) return
  document.getElementById('modeCuisine')?.remove()
  const overlay = document.createElement('div')
  overlay.id = 'modeCuisine'
  overlay.className = 'mode-cuisine'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', titre)
  document.body.appendChild(overlay)
  document.body.classList.add('mode-cuisine-ouvert')

  let actif = 0                          // plat affiché
  const etape = plats.map(() => 0)       // étape en cours par plat
  const coches = plats.map(() => new Set()) // ingrédients sortis
  let attente = false, erreur = null

  garderEcranAllume().then(() => { if (overlay.isConnected && verrou) overlay.querySelector('.mc-ecran').innerHTML = `${icone('soleil')}écran allumé` })
  document.addEventListener('visibilitychange', surVisibilite)

  function fermer() {
    verrou?.release?.().catch(() => {})
    verrou = null
    document.removeEventListener('visibilitychange', surVisibilite)
    document.removeEventListener('keydown', clavier)
    document.body.classList.remove('mode-cuisine-ouvert')
    overlay.remove()
  }

  function clavier(e) {
    if (e.key === 'Escape') fermer()
    if (e.key === 'ArrowRight') changerEtape(1)
    if (e.key === 'ArrowLeft') changerEtape(-1)
  }
  document.addEventListener('keydown', clavier)

  function changerEtape(delta) {
    const n = plats[actif].recette.etapes?.length || 0
    const suivante = etape[actif] + delta
    if (suivante < 0 || suivante >= n) return
    etape[actif] = suivante
    draw()
  }

  function draw() {
    const { recette: r, portions, repas = [] } = plats[actif]
    const etapes = r.etapes || []
    const i = etape[actif]
    const ingredients = ingredientsPour(r, portions)
    overlay.innerHTML = `
      <header class="mc-entete">
        <div class="mc-titre">${icone('marmite')}<span>${esc(titre)}</span>
          <span class="mc-ecran">${verrou ? `${icone('soleil')}écran allumé` : ''}</span></div>
        <button class="modal-close mc-fermer" data-fermer aria-label="Quitter le mode cuisine">${icone('croix')}</button>
      </header>
      ${plats.length > 1 ? `<nav class="mc-plats gen-chips-wrap" aria-label="Plats de la session">
        ${plats.map((p, k) => `<button class="chip ${k === actif ? 'active' : ''}" data-plat="${k}" aria-pressed="${k === actif}">${k + 1}. ${esc(p.recette.nom)}</button>`).join('')}
      </nav>
      ${actif === 0 ? '<p class="text-xs text-muted mc-conseil">Ordre conseillé : la cuisson la plus longue d\'abord.</p>' : ''}` : ''}
      <h2 class="mc-nom">${esc(r.nom)}</h2>
      <p class="text-sm text-muted">${icone('famille')}${portions} portion(s)${repas.length ? ` · pour ${esc(repas.map(labelCreneau).join(', ').toLowerCase())}` : ''}
        · ${(r.temps_prep || 0) + (r.temps_cuisson || 0)} min</p>

      ${etapes.length ? `<section class="mc-etape" aria-live="polite">
          <div class="mc-etape-num">Étape ${i + 1} / ${etapes.length}</div>
          <p class="mc-etape-texte">${esc(etapes[i])}</p>
          <div class="mc-etape-nav">
            <button class="btn btn-secondary" data-etape="-1" ${i === 0 ? 'disabled' : ''}>${icone('gauche')}Précédente</button>
            <button class="btn btn-primary" data-etape="1" ${i === etapes.length - 1 ? 'disabled' : ''}>Suivante${icone('droite')}</button>
          </div>
          ${i === etapes.length - 1 && actif < plats.length - 1 ? `<button class="btn btn-ghost btn-full" data-plat="${actif + 1}">Plat suivant : ${esc(plats[actif + 1].recette.nom)}${icone('droite')}</button>` : ''}
        </section>`
        : `<section class="mc-etape mc-sans-etapes">
          ${r.description ? `<p class="text-sm" style="margin-bottom:0.75rem;">${esc(r.description)}</p>` : ''}
          <p class="text-sm text-muted" style="margin-bottom:0.75rem;">Cette recette n'a pas encore d'étapes.</p>
          ${erreur ? htmlErreurIA(erreur) : ''}
          ${attente ? '<div class="flex-center" style="padding:1rem;"><span class="loader"></span></div>'
            : `<button class="btn btn-primary btn-full" data-ecrire>${icone('etincelle')}Écrire les étapes avec l'IA</button>`}
        </section>`}

      ${(r.legumes_caches || []).map(l => `<div class="astuce-cachee">${icone('oeil')}<span><b>${esc(l.legume)}</b> : ${esc(l.astuce)}</span></div>`).join('')}

      <section class="mc-ingredients">
        <h3>Ingrédients <span class="text-xs text-muted">(touche ce qui est sorti)</span></h3>
        ${ingredients.map((ing, k) => `<label class="mc-ingredient${coches[actif].has(k) ? ' mc-sorti' : ''}">
          <input type="checkbox" data-ing="${k}" ${coches[actif].has(k) ? 'checked' : ''}>
          <span class="mc-ing-nom">${esc(ing.nom)}</span><span class="mc-ing-qte">${esc(ing.quantite)}</span></label>`).join('')}
      </section>
      ${etapes.length > 1 ? `<details class="mc-toutes"><summary>Toutes les étapes</summary><ol>
        ${etapes.map((e, k) => `<li class="${k === i ? 'mc-courante' : ''}"><button class="mc-aller" data-aller="${k}">${esc(e)}</button></li>`).join('')}
      </ol></details>` : ''}`

    overlay.querySelector('[data-fermer]').addEventListener('click', fermer)
    overlay.querySelectorAll('[data-plat]').forEach(b => b.addEventListener('click', () => {
      actif = Number(b.dataset.plat); erreur = null; draw(); overlay.scrollTop = 0
    }))
    overlay.querySelectorAll('[data-etape]').forEach(b => b.addEventListener('click', () => changerEtape(Number(b.dataset.etape))))
    overlay.querySelectorAll('[data-aller]').forEach(b => b.addEventListener('click', () => {
      etape[actif] = Number(b.dataset.aller); draw(); overlay.scrollTop = 0
    }))
    overlay.querySelectorAll('[data-ing]').forEach(cb => cb.addEventListener('change', () => {
      const k = Number(cb.dataset.ing)
      if (cb.checked) coches[actif].add(k)
      else coches[actif].delete(k)
      cb.closest('.mc-ingredient').classList.toggle('mc-sorti', cb.checked)
    }))
    overlay.querySelector('[data-ecrire]')?.addEventListener('click', async () => {
      attente = true; erreur = null; draw()
      try {
        const etapes = await genererEtapes(r)
        await dbSetEtapesRecette(r.id, etapes)
        r.etapes = etapes
        etape[actif] = 0
      } catch (e) { erreur = e.info || expliquerErreur('INCONNUE', e.message) }
      attente = false; draw()
    })
  }

  draw()
}
