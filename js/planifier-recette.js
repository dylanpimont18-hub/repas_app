// js/planifier-recette.js — Depuis une recette : la placer sur un repas précis du planning (cycle au choix)
import { debutCycle, decalerCycle, labelCycle, labelCreneau, dateIso } from './cycle.js'
import { chargerDonnees, placer } from './propositions.js'
import { esc } from './utils.js'
import { icone } from './icones.js'

/**
 * Affiche le choix du repas dans `zone` (contenu de la modale de détail).
 * `retour()` réaffiche la recette.
 */
export async function ouvrirPlanifier(recette, zone, retour) {
  let samedi = debutCycle()
  let d = null

  const chargement = () => { zone.innerHTML = '<div class="flex-center" style="padding:2rem;"><span class="loader"></span></div>' }

  async function afficher() {
    chargement()
    d = await chargerDonnees(samedi)
    const maintenant = Date.now()
    // Un bloc par jour ; repas passés grisés mais possibles (pour noter ce qui a été mangé)
    const jours = []
    for (const c of d.creneaux) {
      let j = jours.find(x => x.iso === dateIso(c.date))
      if (!j) { j = { iso: dateIso(c.date), date: c.date, creneaux: [] }; jours.push(j) }
      j.creneaux.push(c)
    }
    const etat = c => {
      const occ = d.occupation[c.cle]
      if (occ?.id === recette.id) return '<span class="planif-etat planif-deja">déjà prévue</span>'
      if (occ) return `<span class="planif-etat">${esc(d.recettesMap[occ.id]?.nom || 'plat prévu')}</span>`
      if (d.absents[c.cle]) return '<span class="planif-etat">pas de repas</span>'
      return '<span class="planif-etat planif-libre">libre</span>'
    }
    zone.innerHTML = `
      <p class="modal-title">Planifier « ${esc(recette.nom)} »</p>
      <div class="planif-nav">
        <button class="btn btn-secondary btn-sm" data-cycle="-1" aria-label="Cycle précédent">${icone('gauche')}</button>
        <span class="text-sm text-muted">${esc(labelCycle(samedi))}</span>
        <button class="btn btn-secondary btn-sm" data-cycle="1" aria-label="Cycle suivant">${icone('droite')}</button>
      </div>
      <p class="text-xs text-muted" style="margin-bottom:0.6rem;">Touche le repas où tu veux la cuisiner.</p>
      <div class="planif-jours">
        ${jours.map(j => `<div class="planif-jour">
          <div class="planif-jour-nom">${esc(j.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }))}</div>
          ${j.creneaux.map(c => `<button class="planif-repas${c.date.getTime() + (c.moment === 'soir' ? 20 : 13) * 3600000 < maintenant ? ' planif-passe' : ''}" data-cle="${esc(c.cle)}">
            ${icone(c.moment === 'midi' ? 'soleil' : 'lune')}<span class="planif-moment">${c.moment === 'midi' ? 'Midi' : 'Soir'}</span>
            <span class="planif-portions">${icone(c.portions <= 1 ? 'personne' : 'famille')}${c.portions}</span>${etat(c)}</button>`).join('')}
        </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-full btn-sm" data-retour style="margin-top:0.75rem;">${icone('gauche')}Retour à la recette</button>`

    zone.querySelectorAll('[data-cycle]').forEach(b => b.addEventListener('click', () => {
      samedi = decalerCycle(samedi, Number(b.dataset.cycle)); afficher()
    }))
    zone.querySelector('[data-retour]').addEventListener('click', retour)
    zone.querySelectorAll('[data-cle]').forEach(b => b.addEventListener('click', () => choisir(d.parCle[b.dataset.cle])))
  }

  async function choisir(c) {
    const occ = d.occupation[c.cle]
    if (occ?.id === recette.id) return
    if (occ && !confirm(`Remplacer « ${d.recettesMap[occ.id]?.nom || 'le plat prévu'} » (${labelCreneau(c)}) ?`)) return
    chargement()
    try {
      await placer(d, c, recette.id, 'manuel', 'remplacer')
      zone.innerHTML = `
        <div class="planif-ok">${icone('check')}<p>« ${esc(recette.nom)} » est prévue <b>${esc(labelCreneau(c).toLowerCase())}</b> (${c.portions} portion(s)).</p></div>
        <a class="btn btn-primary btn-full" href="planning.html">${icone('calendrier')}Voir le planning</a>
        <button class="btn btn-ghost btn-full btn-sm" data-retour style="margin-top:0.5rem;">${icone('gauche')}Retour à la recette</button>`
      zone.querySelector('[data-retour]').addEventListener('click', retour)
    } catch (e) {
      alert(`Erreur : ${e.message}`)
      afficher()
    }
  }

  await afficher()
}
