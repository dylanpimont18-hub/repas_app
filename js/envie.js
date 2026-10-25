// js/envie.js — « ⚡ Envie ce soir » : remplacer ponctuellement un repas sans casser le cycle
import { debutCycle, creneauCourant, labelCreneau, dateIso, ajouterJours } from './cycle.js'
import { FILTRES } from './filtres.js'
import { chargerDonnees, proposerPourCreneau, ideeIA, placer } from './propositions.js'
import { recettesAvecIngredients } from './selection.js'
import { expliquerErreur } from './credit-ia.js'
import { htmlErreurIA } from './credit-ia-ui.js'
import { esc } from './utils.js'
import { icone } from './icones.js'

const ENVIES_RAPIDES = ['reconfortant', 'bouillon', 'gras', 'healthy', 'rapide', 'sansViande', 'sansFeculents']

export async function renderModalEnvie(content, fermer) {
  content.innerHTML = '<div class="flex-center" style="padding:2rem;"><span class="loader"></span></div>'
  const maintenant = new Date()
  let d = await chargerDonnees(debutCycle(maintenant))
  let cible   = creneauCourant(d.creneaux, maintenant)
  let filtres = []
  let style   = ''
  let ingredients = ''   // « Avec ce que j'ai » : restes, fond de frigo
  let ideeGeneree = null
  let erreur  = null     // info d'erreur expliquée (ou texte)
  let attente = false

  // Créneaux du jour et du lendemain (cibles possibles)
  const jours = [dateIso(maintenant), dateIso(ajouterJours(maintenant, 1))]
  const ciblesPossibles = d.creneaux.filter(c => jours.includes(dateIso(c.date)))

  const nomRecette = id => d.recettesMap[id]?.nom || '?'

  function draw() {
    style = content.querySelector('#envieStyle')?.value ?? style
    ingredients = content.querySelector('#envieIngredients')?.value ?? ingredients
    const occ = d.occupation[cible.cle]
    const propositions = proposerPourCreneau(d, cible, { filtres, style }, 3)
    const avecMesIngredients = ingredients.trim() ? recettesAvecIngredients(d.recettes, ingredients, 3) : []
    content.innerHTML = `
      <p class="modal-title">Envie pour ${esc(labelCreneau(cible).toLowerCase())}</p>
      <div class="gen-chips-wrap" style="margin-bottom:0.6rem;">
        ${ciblesPossibles.map(c => `<button class="chip ${c.cle === cible.cle ? 'active' : ''}" data-cible="${esc(c.cle)}">${esc(labelCreneau(c))}</button>`).join('')}
      </div>
      ${occ ? `<p class="text-xs text-muted" style="margin-bottom:0.6rem;">Prévu : ${esc(nomRecette(occ.id))}</p>` : ''}
      <div class="gen-chips-wrap" style="margin-bottom:0.5rem;">
        ${ENVIES_RAPIDES.map(id => FILTRES.find(f => f.id === id)).map(f =>
          `<button class="chip ${filtres.includes(f.id) ? 'active' : ''}" data-filtre="${f.id}">${f.label}</button>`).join('')}
      </div>
      <input id="envieStyle" class="form-input" style="margin-bottom:0.75rem;" type="text" value="${esc(style)}"
        placeholder="Style libre : asiatique, ramen…" aria-label="Style libre">
      ${erreur ? (erreur.titre ? htmlErreurIA(erreur) : `<p class="text-sm" style="color:var(--color-danger);margin-bottom:0.5rem;">${esc(erreur)}</p>`) : ''}
      <div class="text-xs text-muted" style="margin-bottom:0.4rem;">Dans tes recettes :</div>
      ${propositions.length ? propositions.map(r => carte(r, 'biblio')).join('')
        : '<p class="text-sm text-muted" style="margin-bottom:0.5rem;">Aucune de tes recettes ne correspond. Essaie une idée de l’IA.</p>'}
      ${ideeGeneree ? `<div class="text-xs text-muted" style="margin:0.6rem 0 0.4rem;">Idée de l'IA :</div>${carte(ideeGeneree, 'ia')}` : ''}
      ${attente ? '<div class="flex-center" style="padding:1rem;"><span class="loader"></span></div>'
        : `<button class="btn btn-ghost btn-full" id="envieIA" style="margin-top:0.4rem;">${icone('etincelle')}Autre idée par l'IA</button>`}

      <section class="envie-restes">
        <label class="envie-restes-titre" for="envieIngredients">${icone('boite')}Avec ce que j'ai</label>
        <textarea id="envieIngredients" class="form-input" rows="2"
          placeholder="Restes de bœuf bourguignon, 2 carottes, riz…">${esc(ingredients)}</textarea>
        ${avecMesIngredients.length ? `<div class="text-xs text-muted" style="margin:0.5rem 0 0.4rem;">Tes recettes avec ces ingrédients :</div>
          ${avecMesIngredients.map(r => carte(r, 'biblio')).join('')}` : ''}
        ${attente ? '' : `<button class="btn btn-secondary btn-full" id="envieRestes" style="margin-top:0.5rem;" ${ingredients.trim() ? '' : 'disabled'}>
          ${icone('etincelle')}Une recette avec ces ingrédients</button>`}
      </section>
    `
    content.querySelectorAll('[data-cible]').forEach(b => b.addEventListener('click', () => {
      cible = d.parCle[b.dataset.cible]; ideeGeneree = null; draw()
    }))
    content.querySelectorAll('[data-filtre]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.filtre
      filtres = filtres.includes(id) ? filtres.filter(x => x !== id) : [...filtres, id]
      draw()
    }))
    content.querySelector('#envieStyle')?.addEventListener('change', draw)
    content.querySelectorAll('[data-recette]').forEach(b => b.addEventListener('click', () =>
      choisir(b.dataset.recette, b.dataset.source)))
    // Recettes de la bibliothèque correspondantes au fil de la saisie ; le bouton s'active dès qu'il y a du texte
    content.querySelector('#envieIngredients')?.addEventListener('change', draw)
    content.querySelector('#envieIngredients')?.addEventListener('input', e => {
      const b = content.querySelector('#envieRestes')
      if (b) b.disabled = !e.target.value.trim()
    })
    const demanderIA = async (options) => {
      style = content.querySelector('#envieStyle')?.value.trim() ?? style
      ingredients = content.querySelector('#envieIngredients')?.value.trim() ?? ingredients
      attente = true; erreur = null; draw()
      try {
        ideeGeneree = await ideeIA(d, cible, { filtres, style, envie: true, ...options() })
        d.recettesMap[ideeGeneree.id] = ideeGeneree
      } catch (e) { erreur = e.info || expliquerErreur('INCONNUE', e.message) }
      attente = false; draw()
      content.querySelector('.envie-card[data-source="ia"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    content.querySelector('#envieIA')?.addEventListener('click', () => demanderIA(() => ({})))
    content.querySelector('#envieRestes')?.addEventListener('click', () => demanderIA(() => ({ avecIngredients: ingredients })))
  }

  function carte(r, source) {
    return `<div class="envie-card" data-recette="${esc(r.id)}" data-source="${source}">
      <div class="envie-nom">${esc(r.nom)}</div>
      <div class="envie-desc">${esc(r.description || `${(r.temps_prep || 0) + (r.temps_cuisson || 0)} min`)}</div>
    </div>`
  }

  // Le créneau est déjà pris : l'app demande quoi faire du plat prévu
  async function choisir(recetteId, source) {
    const occ = d.occupation[cible.cle]
    if (!occ) return valider(recetteId, source, 'remplacer')
    const prevu = esc(nomRecette(occ.id))
    const decal = await placer(d, cible, recetteId, source, 'decaler', true)
    const apercu = decal.changements.slice(1).map(c => `<div>${icone('droite')}${esc(labelCreneau(d.parCle[c.cle]))} : ${esc(nomRecette(c.recetteId))}</div>`).join('')
      + (decal.versReserve ? `<div>${icone('flocon')}${esc(nomRecette(decal.versReserve.recetteId))} part au congélo</div>` : '')
    content.innerHTML = `
      <p class="modal-title">Et « ${prevu} » ?</p>
      <p class="text-sm" style="margin-bottom:0.75rem;">${esc(labelCreneau(cible))} : <b>${esc(nomRecette(recetteId))}</b> à la place.</p>
      <button class="btn btn-primary btn-full" data-mode="decaler">Décaler au repas suivant</button>
      <div class="envie-apercu">${apercu || '<div>Rien d\'autre ne bouge.</div>'}</div>
      <button class="btn btn-secondary btn-full" data-mode="congelo" style="margin-bottom:0.5rem;">${icone('flocon')}Le mettre au congélo</button>
      <button class="btn btn-ghost btn-full" data-mode="remplacer" style="margin-bottom:0.5rem;">${icone('poubelle')}Le supprimer</button>
      <button class="btn btn-ghost btn-full btn-sm" data-mode="retour">${icone('gauche')}Retour</button>`
    content.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () =>
      b.dataset.mode === 'retour' ? draw() : valider(recetteId, source, b.dataset.mode)))
  }

  async function valider(recetteId, source, mode) {
    content.innerHTML = '<div class="flex-center" style="padding:2rem;"><span class="loader"></span></div>'
    try {
      await placer(d, cible, recetteId, source, mode)
      fermer()
    } catch (e) {
      erreur = e.message
      d = await chargerDonnees(d.samedi)
      draw()
    }
  }

  draw()
}
