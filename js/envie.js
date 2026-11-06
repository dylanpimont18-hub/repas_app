// js/envie.js — « ⚡ Envie ce soir » : remplacer ponctuellement un repas sans casser le cycle
import { debutCycle, creneauCourant, labelCreneau, dateIso, ajouterJours } from './cycle.js'
import { FILTRES } from './filtres.js'
import { chargerDonnees, proposerPourCreneau, ideesIA, enregistrerIdee, placer } from './propositions.js'
import { recettesAvecIngredients, recettesPlacard, aAcheter } from './selection.js'
import { getPlacard } from './courses.js'
import { dbGetReglage, dbSetReglage } from './db.js'
import { expliquerErreur } from './credit-ia.js'
import { htmlErreurIA } from './credit-ia-ui.js'
import { esc } from './utils.js'
import { icone } from './icones.js'

const ENVIES_RAPIDES = ['reconfortant', 'bouillon', 'gras', 'healthy', 'rapide', 'sansViande', 'sansFeculents']
const NB_IDEES = [2, 3, 4, 5]

const MAX_ACHATS = 3   // « Vider le placard » : au plus 3 ingrédients à acheter

// mode 'placard' : un repas du soir avec un maximum de ce qu'on a, le moins d'achats possible
export async function renderModalEnvie(content, fermer, { mode = 'envie' } = {}) {
  content.innerHTML = '<div class="flex-center" style="padding:2rem;"><span class="loader"></span></div>'
  const maintenant = new Date()
  let d = await chargerDonnees(debutCycle(maintenant))
  let cible   = creneauCourant(d.creneaux, maintenant)
  let filtres = []
  let style   = ''
  let ingredients = ''   // « Avec ce que j'ai » : restes, fond de frigo
  let idees   = []       // idées IA au choix, non enregistrées tant qu'on n'en choisit pas une
  let nbIdees = 3
  let erreur  = null     // info d'erreur expliquée (ou texte)
  let attente = false

  // Créneaux du jour et du lendemain (cibles possibles)
  const jours = [dateIso(maintenant), dateIso(ajouterJours(maintenant, 1))]
  const tousCibles = d.creneaux.filter(c => jours.includes(dateIso(c.date)))
  let ciblesPossibles = tousCibles

  // Vider le placard : les soirs uniquement (ce soir, ou demain soir passé 21 h) ; le fond du placard
  // saisi la dernière fois est partagé entre les deux téléphones (réglage `fond_placard`)
  let placard = []
  async function passerEnPlacard() {
    const soirs = tousCibles.filter(c => c.moment === 'soir')
    if (soirs.length) ciblesPossibles = soirs
    const aujourdHui = dateIso(maintenant)
    cible = soirs.find(c => maintenant.getHours() < 21 || dateIso(c.date) !== aujourdHui) || soirs[0] || cible
    const [p, fond] = await Promise.all([getPlacard(), dbGetReglage('fond_placard').catch(() => null)])
    placard = p
    if (!ingredients.trim() && typeof fond === 'string') ingredients = fond
  }
  if (mode === 'placard') await passerEnPlacard()
  const enregistrerFond = () => dbSetReglage('fond_placard', ingredients).catch(() => {})

  const nomRecette = id => d.recettesMap[id]?.nom || '?'
  const memoriserIdees = () => idees.forEach(r => { d.recettesMap[r.id] = r })

  function draw() {
    style = content.querySelector('#envieStyle')?.value ?? style
    ingredients = content.querySelector('#envieIngredients')?.value ?? ingredients
    if (mode === 'placard') return drawPlacard()
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
      ${idees.length ? `<div class="text-xs text-muted" style="margin:0.6rem 0 0.4rem;">Idées de l'IA, touche celle qui te tente :</div>
        ${idees.map(r => carte(r, 'ia')).join('')}` : ''}
      <div class="envie-nb-idees" role="group" aria-label="Nombre d'idées de l'IA">
        <span class="text-xs text-muted">Idées de l'IA :</span>
        ${NB_IDEES.map(n => `<button class="chip ${n === nbIdees ? 'active' : ''}" data-nb="${n}" aria-pressed="${n === nbIdees}">${n}</button>`).join('')}
      </div>
      ${attente ? '<div class="flex-center" style="padding:1rem;"><span class="loader"></span></div>'
        : `<button class="btn btn-ghost btn-full" id="envieIA" style="margin-top:0.4rem;">${icone('etincelle')}${idees.length ? 'Autres idées' : `${nbIdees} idées`} par l'IA</button>`}

      <button class="btn btn-secondary btn-full" id="enviePlacard" style="margin-top:0.75rem;">${icone('boite')}Vider le placard</button>
      <section class="envie-restes">
        <label class="envie-restes-titre" for="envieIngredients">${icone('boite')}Avec ce que j'ai</label>
        <textarea id="envieIngredients" class="form-input" rows="2"
          placeholder="Restes de bœuf bourguignon, 2 carottes, riz…">${esc(ingredients)}</textarea>
        ${avecMesIngredients.length ? `<div class="text-xs text-muted" style="margin:0.5rem 0 0.4rem;">Tes recettes avec ces ingrédients :</div>
          ${avecMesIngredients.map(r => carte(r, 'biblio')).join('')}` : ''}
        ${attente ? '' : `<button class="btn btn-secondary btn-full" id="envieRestes" style="margin-top:0.5rem;" ${ingredients.trim() ? '' : 'disabled'}>
          ${icone('etincelle')}${nbIdees} idées avec ces ingrédients</button>`}
      </section>
    `
    content.querySelectorAll('[data-cible]').forEach(b => b.addEventListener('click', () => {
      cible = d.parCle[b.dataset.cible]; idees = []; draw()
    }))
    content.querySelectorAll('[data-nb]').forEach(b => b.addEventListener('click', () => {
      nbIdees = Number(b.dataset.nb); draw()
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
        idees = await ideesIA(d, cible, { filtres, style, envie: true, ...options() }, nbIdees)
        memoriserIdees()
      } catch (e) { erreur = e.info || expliquerErreur('INCONNUE', e.message) }
      attente = false; draw()
      content.querySelector('.envie-card[data-source="ia"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    content.querySelector('#enviePlacard')?.addEventListener('click', async () => {
      mode = 'placard'; idees = []; erreur = null
      content.innerHTML = '<div class="flex-center" style="padding:2rem;"><span class="loader"></span></div>'
      await passerEnPlacard()
      draw()
    })
    content.querySelector('#envieIA')?.addEventListener('click', () => demanderIA(() => ({})))
    content.querySelector('#envieRestes')?.addEventListener('click', () => demanderIA(() => ({ avecIngredients: ingredients })))
  }

  // ── Vider le placard ──
  function drawPlacard() {
    const occ = d.occupation[cible.cle]
    const pret = ingredients.trim()
    const biblio = pret ? recettesPlacard(d.recettes, ingredients, placard, 3, MAX_ACHATS) : []
    // Idées IA : celles qui demandent le moins d'achats d'abord
    const ideesTriees = idees.map(r => ({ ...r, aAcheter: aAcheter(r, ingredients, placard) }))
      .sort((a, b) => a.aAcheter.length - b.aAcheter.length)
    content.innerHTML = `
      <p class="modal-title">${icone('boite')}Vider le placard</p>
      <div class="gen-chips-wrap" style="margin-bottom:0.6rem;">
        ${ciblesPossibles.map(c => `<button class="chip ${c.cle === cible.cle ? 'active' : ''}" data-cible="${esc(c.cle)}">${esc(labelCreneau(c))}</button>`).join('')}
      </div>
      ${occ ? `<p class="text-xs text-muted" style="margin-bottom:0.6rem;">Prévu : ${esc(nomRecette(occ.id))}</p>` : ''}
      <label class="form-label" for="envieIngredients">Ce que tu as (placard, frigo, congélo)</label>
      <textarea id="envieIngredients" class="form-input" rows="3"
        placeholder="Pâtes, pois chiches, boîte de thon, 2 courgettes, crème, riz…">${esc(ingredients)}</textarea>
      <p class="text-xs text-muted" style="margin:0.3rem 0 0.75rem;">Sel, huile, épices et tes articles « toujours au placard » sont comptés d'office. Au plus ${MAX_ACHATS} choses à acheter.</p>
      ${erreur ? (erreur.titre ? htmlErreurIA(erreur) : `<p class="text-sm" style="color:var(--color-danger);margin-bottom:0.5rem;">${esc(erreur)}</p>`) : ''}
      ${pret ? `<div class="text-xs text-muted" style="margin-bottom:0.4rem;">Dans tes recettes :</div>
        ${biblio.length ? biblio.map(r => carte(r, 'biblio')).join('')
          : '<p class="text-sm text-muted" style="margin-bottom:0.5rem;">Aucune de tes recettes ne se fait avec ça. Demande à l’IA.</p>'}` : ''}
      ${ideesTriees.length ? `<div class="text-xs text-muted" style="margin:0.6rem 0 0.4rem;">Idées de l'IA, touche celle qui te tente :</div>
        ${ideesTriees.map(r => carte(r, 'ia')).join('')}` : ''}
      <div class="envie-nb-idees" role="group" aria-label="Nombre d'idées de l'IA">
        <span class="text-xs text-muted">Idées de l'IA :</span>
        ${NB_IDEES.map(n => `<button class="chip ${n === nbIdees ? 'active' : ''}" data-nb="${n}" aria-pressed="${n === nbIdees}">${n}</button>`).join('')}
      </div>
      ${attente ? '<div class="flex-center" style="padding:1rem;"><span class="loader"></span></div>'
        : `<button class="btn btn-primary btn-full" id="enviePlacardIA" style="margin-top:0.4rem;" ${pret ? '' : 'disabled'}>
          ${icone('etincelle')}${idees.length ? 'Autres idées' : `${nbIdees} idées`} avec le placard</button>`}
      <button class="btn btn-ghost btn-full btn-sm" id="envieModeNormal" style="margin-top:0.5rem;">${icone('eclair')}Plutôt une envie</button>
    `
    content.querySelectorAll('[data-cible]').forEach(b => b.addEventListener('click', () => {
      cible = d.parCle[b.dataset.cible]; idees = []; draw()
    }))
    content.querySelectorAll('[data-nb]').forEach(b => b.addEventListener('click', () => {
      nbIdees = Number(b.dataset.nb); draw()
    }))
    content.querySelectorAll('[data-recette]').forEach(b => b.addEventListener('click', () =>
      choisir(b.dataset.recette, b.dataset.source)))
    const zone = content.querySelector('#envieIngredients')
    zone.addEventListener('change', () => { draw(); enregistrerFond() })
    zone.addEventListener('input', e => {
      const b = content.querySelector('#enviePlacardIA')
      if (b) b.disabled = !e.target.value.trim()
    })
    content.querySelector('#envieModeNormal').addEventListener('click', () => {
      mode = 'envie'; idees = []; erreur = null; ciblesPossibles = tousCibles; draw()
    })
    content.querySelector('#enviePlacardIA')?.addEventListener('click', async () => {
      ingredients = zone.value.trim()
      enregistrerFond()
      attente = true; erreur = null; draw()
      try {
        idees = await ideesIA(d, cible, { envie: true, avecIngredients: ingredients,
          placard: { maxAchats: MAX_ACHATS, basiques: placard } }, nbIdees)
        memoriserIdees()
      } catch (e) { erreur = e.info || expliquerErreur('INCONNUE', e.message) }
      attente = false; draw()
      content.querySelector('.envie-card[data-source="ia"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function carte(r, source) {
    const achats = r.aAcheter
      ? `<div class="envie-achats">${icone('panier')}${r.aAcheter.length ? `À acheter : ${esc(r.aAcheter.join(', '))}` : 'Rien à acheter'}</div>` : ''
    return `<div class="envie-card" data-recette="${esc(r.id)}" data-source="${source}">
      <div class="envie-nom">${esc(r.nom)}</div>
      <div class="envie-desc">${esc(r.description || '')}${r.description ? ' · ' : ''}${(r.temps_prep || 0) + (r.temps_cuisson || 0)} min</div>
      ${achats}
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
      // Idée IA choisie : enregistrée en bibliothèque seulement maintenant (les autres sont oubliées)
      const idee = idees.find(r => r.id === recetteId && r.provisoire)
      if (idee) {
        const id = await enregistrerIdee(idee)
        idees = idees.map(r => (r === idee ? { ...idee, id, provisoire: false } : r))
        memoriserIdees()
        recetteId = id
      }
      await placer(d, cible, recetteId, source, mode)
      fermer()
    } catch (e) {
      erreur = e.message
      d = await chargerDonnees(d.samedi)
      memoriserIdees()
      draw()
    }
  }

  draw()
}
