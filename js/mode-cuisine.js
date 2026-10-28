// js/mode-cuisine.js — Mode cuisine : écran qui reste allumé, étapes en grand, minuteurs, plats d'une session ensemble
import { ingredientsPour, dureesDansEtape } from './cuisine.js'
import { labelCreneau } from './cycle.js'
import { genererEtapes } from './ai.js'
import { dbSetEtapesRecette } from './db.js'
import { expliquerErreur } from './credit-ia.js'
import { htmlErreurIA } from './credit-ia-ui.js'
import { lancerMinuteur, afficherMinuteurs } from './minuteurs.js'
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

// Progression gardée sur l'appareil (fermer le mode cuisine ou recharger la page ne fait rien perdre)
const DUREE_PROGRESSION = 2 * 86400000
const cleProgression = plats => `repas_cuisine_${plats.map(p => p.recette.id).join('_')}`
function lireProgression(plats) {
  try {
    const p = JSON.parse(localStorage.getItem(cleProgression(plats)) || 'null')
    return p && Date.now() - p.le < DUREE_PROGRESSION ? p : null
  } catch { return null }
}
function sauverProgression(plats, etat) {
  try { localStorage.setItem(cleProgression(plats), JSON.stringify({ ...etat, le: Date.now() })) } catch { /* navigation privée */ }
}

// Conseil d'organisation d'une session : lancer la cuisson la plus longue, préparer les autres plats pendant ce temps
export function conseilSession(plats) {
  if (plats.length < 2) return ''
  const [long, ...autres] = plats
  const cuisson = long.recette.temps_cuisson || 0
  if (cuisson < 20) return 'Ordre conseillé : la cuisson la plus longue d\'abord.'
  return `Commence par « ${long.recette.nom} » : pendant ses ${cuisson} min de cuisson, prépare ${autres.map(p => `« ${p.recette.nom} »`).join(', ')}.`
}

/**
 * Ouvre le mode cuisine.
 * @param plats [{ recette, portions, repas?: [creneau] }] dans l'ordre conseillé
 * @param titre ex. « Session du dimanche »
 */
export function ouvrirModeCuisine(plats, titre = 'En cuisine') {
  if (!plats.length) return
  document.getElementById('modeCuisine')?.remove()
  const retour = document.activeElement
  const overlay = document.createElement('div')
  overlay.id = 'modeCuisine'
  overlay.className = 'mode-cuisine'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', titre)
  document.body.appendChild(overlay)
  document.body.classList.add('mode-cuisine-ouvert')

  const memo = lireProgression(plats)
  let actif = memo?.actif ?? 0                                   // plat affiché
  const etape = plats.map((_, k) => memo?.etape?.[k] ?? 0)       // étape en cours par plat
  const coches = plats.map((_, k) => new Set(memo?.coches?.[k] || [])) // ingrédients sortis
  let attente = false, erreur = null
  const sauver = () => sauverProgression(plats, { actif, etape, coches: coches.map(s => [...s]) })

  garderEcranAllume().then(() => { if (overlay.isConnected && verrou) overlay.querySelector('.mc-ecran').innerHTML = `${icone('soleil')}écran allumé` })
  document.addEventListener('visibilitychange', surVisibilite)
  afficherMinuteurs()

  function fermer() {
    verrou?.release?.().catch(() => {})
    verrou = null
    document.removeEventListener('visibilitychange', surVisibilite)
    document.removeEventListener('keydown', clavier)
    document.body.classList.remove('mode-cuisine-ouvert')
    overlay.remove()
    retour?.focus?.({ preventScroll: true })
  }

  function clavier(e) {
    if (e.key === 'Escape') fermer()
    if (e.target.matches?.('input, textarea')) return
    if (e.key === 'ArrowRight') changerEtape(1)
    if (e.key === 'ArrowLeft') changerEtape(-1)
  }
  document.addEventListener('keydown', clavier)

  function changerEtape(delta) {
    const n = plats[actif].recette.etapes?.length || 0
    const suivante = etape[actif] + delta
    if (suivante < 0 || suivante >= n) return
    etape[actif] = suivante
    sauver()
    // Seule l'étape change : le bouton touché garde le focus
    const focus = document.activeElement?.dataset?.etape
    dessinerEtape()
    if (focus) overlay.querySelector(`[data-etape="${focus}"]:not([disabled])`)?.focus() || overlay.querySelector('[data-etape]:not([disabled])')?.focus()
    overlay.querySelector('#mcAnnonce').textContent = `Étape ${suivante + 1} sur ${n} : ${plats[actif].recette.etapes[suivante]}`
  }

  function htmlEtape() {
    const r = plats[actif].recette
    const etapes = r.etapes || []
    const i = etape[actif]
    if (!etapes.length) {
      return `<section class="mc-etape mc-sans-etapes">
        ${r.description ? `<p class="text-sm" style="margin-bottom:0.75rem;">${esc(r.description)}</p>` : ''}
        <p class="text-sm text-muted" style="margin-bottom:0.75rem;">Cette recette n'a pas encore d'étapes.</p>
        ${erreur ? htmlErreurIA(erreur) : ''}
        ${attente ? '<div class="flex-center" style="padding:1rem;"><span class="loader"></span></div>'
          : `<button class="btn btn-primary btn-full" data-ecrire>${icone('etincelle')}Écrire les étapes avec l'IA</button>`}
      </section>`
    }
    const durees = dureesDansEtape(etapes[i])
    return `<section class="mc-etape">
        <div class="mc-etape-num">Étape ${i + 1} / ${etapes.length}</div>
        <p class="mc-etape-texte">${esc(etapes[i])}</p>
        ${durees.length ? `<div class="mc-minuteurs">${durees.map(d => `<button class="btn btn-secondary btn-sm" data-minuteur-s="${d.secondes}" data-minuteur-txt="${esc(d.texte)}">${icone('minuteur')}Minuteur ${esc(d.texte)}</button>`).join('')}</div>` : ''}
        <div class="mc-etape-nav">
          <button class="btn btn-secondary" data-etape="-1" ${i === 0 ? 'disabled' : ''}>${icone('gauche')}Précédente</button>
          <button class="btn btn-primary" data-etape="1" ${i === etapes.length - 1 ? 'disabled' : ''}>Suivante${icone('droite')}</button>
        </div>
        ${i === etapes.length - 1 && actif < plats.length - 1 ? `<button class="btn btn-ghost btn-full" data-plat="${actif + 1}">Plat suivant : ${esc(plats[actif + 1].recette.nom)}${icone('droite')}</button>` : ''}
      </section>`
  }

  function dessinerEtape() {
    overlay.querySelector('.mc-zone-etape').innerHTML = htmlEtape()
    overlay.querySelectorAll('.mc-toutes li').forEach((li, k) => li.classList.toggle('mc-courante', k === etape[actif]))
  }

  function draw() {
    const { recette: r, portions, repas = [] } = plats[actif]
    const etapes = r.etapes || []
    const ingredients = ingredientsPour(r, portions)
    overlay.innerHTML = `
      <header class="mc-entete">
        <div class="mc-titre">${icone('marmite')}<span>${esc(titre)}</span>
          <span class="mc-ecran">${verrou ? `${icone('soleil')}écran allumé` : ''}</span></div>
        <button class="modal-close mc-fermer" data-fermer aria-label="Quitter le mode cuisine">${icone('croix')}</button>
      </header>
      <p class="sr-only" id="mcAnnonce" aria-live="polite"></p>
      ${plats.length > 1 ? `<nav class="mc-plats gen-chips-wrap" aria-label="Plats de la session">
        ${plats.map((p, k) => `<button class="chip ${k === actif ? 'active' : ''}" data-plat="${k}" aria-pressed="${k === actif}">${k + 1}. ${esc(p.recette.nom)}</button>`).join('')}
      </nav>
      ${actif === 0 ? `<p class="text-xs text-muted mc-conseil">${esc(conseilSession(plats))}</p>` : ''}` : ''}
      <h2 class="mc-nom">${esc(r.nom)}</h2>
      <p class="text-sm text-muted">${icone('famille')}${portions} portion(s)${repas.length ? ` · pour ${esc(repas.map(labelCreneau).join(', ').toLowerCase())}` : ''}
        · ${(r.temps_prep || 0) + (r.temps_cuisson || 0)} min</p>

      <div class="mc-zone-etape">${htmlEtape()}</div>

      ${(r.legumes_caches || []).map(l => `<div class="astuce-cachee">${icone('oeil')}<span><b>${esc(l.legume)}</b> : ${esc(l.astuce)}</span></div>`).join('')}

      <section class="mc-ingredients">
        <h3>Ingrédients <span class="text-xs text-muted">(touche ce qui est sorti)</span></h3>
        ${ingredients.map((ing, k) => `<label class="mc-ingredient${coches[actif].has(k) ? ' mc-sorti' : ''}">
          <input type="checkbox" data-ing="${k}" ${coches[actif].has(k) ? 'checked' : ''}>
          <span class="mc-ing-nom">${esc(ing.nom)}</span><span class="mc-ing-qte">${esc(ing.quantite)}</span></label>`).join('')}
      </section>
      ${etapes.length > 1 ? `<details class="mc-toutes"><summary>Toutes les étapes</summary><ol>
        ${etapes.map((e, k) => `<li class="${k === etape[actif] ? 'mc-courante' : ''}"><button class="mc-aller" data-aller="${k}">${esc(e)}</button></li>`).join('')}
      </ol></details>` : ''}`
  }

  // Un seul écouteur pour tout le mode cuisine (le contenu est redessiné)
  overlay.addEventListener('click', async e => {
    if (e.target.closest('[data-fermer]')) return fermer()
    const plat = e.target.closest('[data-plat]')
    if (plat) { actif = Number(plat.dataset.plat); erreur = null; sauver(); draw(); overlay.scrollTop = 0; overlay.querySelector(`[data-plat="${actif}"]`)?.focus(); return }
    const pas = e.target.closest('[data-etape]')
    if (pas) return changerEtape(Number(pas.dataset.etape))
    const aller = e.target.closest('[data-aller]')
    if (aller) { etape[actif] = Number(aller.dataset.aller); sauver(); dessinerEtape(); overlay.scrollTop = 0; overlay.querySelector('[data-etape]:not([disabled])')?.focus(); return }
    const minuteur = e.target.closest('[data-minuteur-s]')
    if (minuteur) return lancerMinuteur(`${plats[actif].recette.nom} · ${minuteur.dataset.minuteurTxt}`, Number(minuteur.dataset.minuteurS))
    if (e.target.closest('[data-ecrire]')) {
      const r = plats[actif].recette
      attente = true; erreur = null; dessinerEtape()
      try {
        const etapes = await genererEtapes(r)
        await dbSetEtapesRecette(r.id, etapes)
        r.etapes = etapes
        etape[actif] = 0
      } catch (err) { erreur = err.info || expliquerErreur('INCONNUE', err.message) }
      attente = false; draw()
    }
  })
  overlay.addEventListener('change', e => {
    const cb = e.target.closest('[data-ing]'); if (!cb) return
    const k = Number(cb.dataset.ing)
    if (cb.checked) coches[actif].add(k)
    else coches[actif].delete(k)
    cb.closest('.mc-ingredient').classList.toggle('mc-sorti', cb.checked)
    sauver()
  })

  draw()
  overlay.querySelector('[data-etape]:not([disabled]), [data-ecrire]')?.focus({ preventScroll: true })
}
