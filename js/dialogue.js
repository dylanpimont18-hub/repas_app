// js/dialogue.js — Confirmations, choix d'un nombre et messages, à la place de confirm() / prompt() / alert()
import { esc } from './utils.js'
import { icone } from './icones.js'

// Feuille ouverte depuis le bas (même style que les autres modales) ; `rendre(fermer)` remplit le contenu
function feuille(html, rendre) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay modal-dialogue'
  overlay.innerHTML = `<div class="modal dialogue">${html}</div>`
  document.body.appendChild(overlay)
  return new Promise(resolve => {
    const fermer = (valeur) => { overlay.remove(); resolve(valeur) }
    overlay.addEventListener('click', e => { if (e.target === overlay) fermer(null) })
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); fermer(null) } })
    rendre(overlay, fermer)
  })
}

/** Demande une confirmation → true / false */
export async function confirmer(message, { titre = '', ok = 'Confirmer', annuler = 'Annuler', danger = false } = {}) {
  const r = await feuille(`
    ${titre ? `<p class="modal-title">${esc(titre)}</p>` : ''}
    <p class="dialogue-message">${esc(message)}</p>
    <div class="dialogue-actions">
      <button class="btn btn-secondary" data-non>${esc(annuler)}</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-oui>${esc(ok)}</button>
    </div>`, (overlay, fermer) => {
    overlay.querySelector('[data-non]').addEventListener('click', () => fermer(false))
    overlay.querySelector('[data-oui]').addEventListener('click', () => fermer(true))
  })
  return r === true
}

/** Choisit un nombre avec − / + → nombre ou null si annulé */
export function choisirNombre({ titre, valeur = 1, min = 1, max = 20, unite = '', aide = '' }) {
  let n = Math.min(max, Math.max(min, Number(valeur) || min))
  return feuille(`
    <p class="modal-title">${esc(titre)}</p>
    ${aide ? `<p class="text-sm text-muted dialogue-message">${esc(aide)}</p>` : ''}
    <div class="pas-a-pas pas-a-pas-grand" role="group" aria-label="${esc(titre)}">
      <button type="button" data-pas="-1" aria-label="Un de moins">${icone('moins')}</button>
      <output aria-live="polite" data-valeur></output>
      <button type="button" data-pas="1" aria-label="Un de plus">${icone('plus')}</button>
    </div>
    <div class="dialogue-actions">
      <button class="btn btn-secondary" data-non>Annuler</button>
      <button class="btn btn-primary" data-oui>Valider</button>
    </div>`, (overlay, fermer) => {
    const maj = () => {
      overlay.querySelector('[data-valeur]').textContent = `${n}${unite ? ` ${unite}` : ''}`
      overlay.querySelector('[data-pas="-1"]').disabled = n <= min
      overlay.querySelector('[data-pas="1"]').disabled = n >= max
    }
    overlay.querySelectorAll('[data-pas]').forEach(b => b.addEventListener('click', () => {
      n = Math.min(max, Math.max(min, n + Number(b.dataset.pas))); maj()
    }))
    overlay.querySelector('[data-non]').addEventListener('click', () => fermer(null))
    overlay.querySelector('[data-oui]').addEventListener('click', () => fermer(n))
    maj()
  })
}

// ── Messages courts en bas d'écran (annoncés aux lecteurs d'écran) ──
function zoneMessages() {
  let z = document.getElementById('messages')
  if (!z) {
    z = document.createElement('div')
    z.id = 'messages'
    z.className = 'messages'
    z.setAttribute('role', 'status')
    z.setAttribute('aria-live', 'polite')
    document.body.appendChild(z)
  }
  return z
}

/**
 * Affiche un message ; `action` = { label, faire } ajoute un bouton (ex. « Annuler »).
 * type : 'info' | 'ok' | 'erreur'
 */
export function informer(message, { type = 'info', duree = 4000, action = null } = {}) {
  const el = document.createElement('div')
  el.className = `message message-${type}`
  if (type === 'erreur') el.setAttribute('role', 'alert')
  el.innerHTML = `${icone(type === 'erreur' ? 'flamme' : type === 'ok' ? 'check' : 'info')}<span>${esc(message)}</span>`
    + (action ? `<button class="message-action">${esc(action.label)}</button>` : '')
    + `<button class="message-fermer" aria-label="Fermer le message">${icone('croix')}</button>`
  const retirer = () => el.remove()
  el.querySelector('.message-fermer').addEventListener('click', retirer)
  el.querySelector('.message-action')?.addEventListener('click', async () => { retirer(); await action.faire() })
  zoneMessages().appendChild(el)
  if (duree) setTimeout(retirer, duree)
  return retirer
}

/** Erreur lisible (message de l'erreur, avec le contexte de l'action) */
export function signalerErreur(e, contexte = '') {
  console.error(contexte, e)
  const msg = e?.info ? `${e.info.titre} — ${e.info.conseil}` : (e?.message || String(e))
  informer(contexte ? `${contexte} : ${msg}` : msg, { type: 'erreur', duree: 7000 })
}
