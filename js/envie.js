// js/envie.js — « ⚡ Envie ce soir » : remplacer ponctuellement un repas sans casser le cycle
import { debutCycle, creneauCourant, labelCreneau, dateIso, ajouterJours } from './cycle.js'
import { FILTRES } from './filtres.js'
import { chargerDonnees, proposerPourCreneau, ideeIA, placer } from './propositions.js'
import { esc } from './utils.js'

const ENVIES_RAPIDES = ['reconfortant', 'bouillon', 'gras', 'healthy', 'rapide', 'sansViande', 'sansFeculents']

export async function renderModalEnvie(content, fermer) {
  content.innerHTML = '<div class="flex-center" style="padding:2rem;"><span class="loader"></span></div>'
  const maintenant = new Date()
  let d = await chargerDonnees(debutCycle(maintenant))
  let cible   = creneauCourant(d.creneaux, maintenant)
  let filtres = []
  let style   = ''
  let ideeGeneree = null
  let erreur  = null
  let attente = false

  // Créneaux du jour et du lendemain (cibles possibles)
  const jours = [dateIso(maintenant), dateIso(ajouterJours(maintenant, 1))]
  const ciblesPossibles = d.creneaux.filter(c => jours.includes(dateIso(c.date)))

  const nomRecette = id => d.recettesMap[id]?.nom || '?'

  function draw() {
    style = content.querySelector('#envieStyle')?.value ?? style
    const occ = d.occupation[cible.cle]
    const propositions = proposerPourCreneau(d, cible, { filtres, style }, 3)
    content.innerHTML = `
      <p class="modal-title">⚡ Envie ${esc(labelCreneau(cible).toLowerCase())}</p>
      <div class="gen-chips-wrap" style="margin-bottom:0.6rem;">
        ${ciblesPossibles.map(c => `<button class="chip ${c.cle === cible.cle ? 'active' : ''}" data-cible="${esc(c.cle)}">${esc(labelCreneau(c))}</button>`).join('')}
      </div>
      ${occ ? `<p class="text-xs text-muted" style="margin-bottom:0.6rem;">Prévu : ${esc(nomRecette(occ.id))}</p>` : ''}
      <div class="gen-chips-wrap" style="margin-bottom:0.5rem;">
        ${ENVIES_RAPIDES.map(id => FILTRES.find(f => f.id === id)).map(f =>
          `<button class="chip ${filtres.includes(f.id) ? 'active' : ''}" data-filtre="${f.id}">${f.label}</button>`).join('')}
      </div>
      <input id="envieStyle" class="form-input" style="margin-bottom:0.75rem;" type="text" value="${esc(style)}"
        placeholder="✍️ Style libre… ex : asiatique, maghrébin, ramen">
      ${erreur ? `<p class="text-sm" style="color:#c0392b;margin-bottom:0.5rem;">${esc(erreur)}</p>` : ''}
      <div class="text-xs text-muted" style="margin-bottom:0.4rem;">Dans tes recettes :</div>
      ${propositions.length ? propositions.map(r => carte(r, 'biblio')).join('')
        : '<p class="text-sm text-muted" style="margin-bottom:0.5rem;">Rien qui colle dans tes recettes.</p>'}
      ${ideeGeneree ? `<div class="text-xs text-muted" style="margin:0.6rem 0 0.4rem;">Idée de l'IA :</div>${carte(ideeGeneree, 'ia')}` : ''}
      ${attente ? '<div class="flex-center" style="padding:1rem;"><span class="loader"></span></div>'
        : `<button class="btn btn-ghost btn-full" id="envieIA" style="margin-top:0.4rem;">✨ Autre chose → idée IA</button>`}
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
    content.querySelector('#envieIA')?.addEventListener('click', async () => {
      style = content.querySelector('#envieStyle')?.value.trim() ?? style
      attente = true; erreur = null; draw()
      try {
        ideeGeneree = await ideeIA(d, cible, { filtres, style, envie: true })
        d.recettesMap[ideeGeneree.id] = ideeGeneree
      } catch (e) { erreur = e.message }
      attente = false; draw()
    })
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
    const apercu = decal.changements.slice(1).map(c => `<div>↪️ ${esc(labelCreneau(d.parCle[c.cle]))} : ${esc(nomRecette(c.recetteId))}</div>`).join('')
      + (decal.versReserve ? `<div>❄️ ${esc(nomRecette(decal.versReserve.recetteId))} → congélo</div>` : '')
    content.innerHTML = `
      <p class="modal-title">Et « ${prevu} » ?</p>
      <p class="text-sm" style="margin-bottom:0.75rem;">${esc(labelCreneau(cible))} : <b>${esc(nomRecette(recetteId))}</b> à la place.</p>
      <button class="btn btn-primary btn-full" data-mode="decaler">↪️ Décaler au repas suivant</button>
      <div class="envie-apercu">${apercu || '<div>Rien d\'autre ne bouge.</div>'}</div>
      <button class="btn btn-secondary btn-full" data-mode="congelo" style="margin-bottom:0.5rem;">❄️ Le mettre au congélo</button>
      <button class="btn btn-ghost btn-full" data-mode="remplacer" style="margin-bottom:0.5rem;">🗑 Le supprimer</button>
      <button class="btn btn-ghost btn-full btn-sm" data-mode="retour">← Retour</button>`
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
