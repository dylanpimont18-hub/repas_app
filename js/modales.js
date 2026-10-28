// js/modales.js — Accessibilité de toutes les fenêtres (.modal-overlay) sans toucher à chaque page :
// rôle dialogue, focus à l'ouverture et retour au bouton d'origine, Échap, Tab gardé dans la fenêtre,
// et activation au clavier (Entrée / Espace) des éléments role="button"
let compteur = 0
const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary'

const visible = ov => !ov.classList.contains('hidden') && ov.isConnected
const ouvertes = () => [...document.querySelectorAll('.modal-overlay')].filter(visible)
const focusables = el => [...el.querySelectorAll(FOCUSABLES)].filter(x => x.offsetParent !== null || x === document.activeElement)

function preparer(ov) {
  if (ov.dataset.a11y) return
  ov.dataset.a11y = '1'
  const boite = ov.querySelector('.modal') || ov
  boite.setAttribute('role', 'dialog')
  boite.setAttribute('aria-modal', 'true')
  const titre = boite.querySelector('.modal-title, h2')
  if (titre) {
    titre.id ||= `titre-modale-${++compteur}`
    boite.setAttribute('aria-labelledby', titre.id)
  }
  new MutationObserver(() => basculer(ov)).observe(ov, { attributes: true, attributeFilter: ['class'] })
  if (visible(ov)) basculer(ov)
}

function basculer(ov) {
  const estOuverte = visible(ov)
  if (estOuverte && !ov.__ouverte) {
    ov.__ouverte = true
    ov.__retour = document.activeElement
    // Le contenu peut arriver un peu après l'ouverture (chargement) : on attend un instant
    setTimeout(() => {
      if (!visible(ov) || ov.contains(document.activeElement)) return
      const boite = ov.querySelector('.modal') || ov
      const cible = boite.querySelector('[autofocus]') || focusables(boite).find(x => !x.classList.contains('modal-close')) || focusables(boite)[0]
      if (cible) cible.focus({ preventScroll: true })
      else { boite.setAttribute('tabindex', '-1'); boite.focus({ preventScroll: true }) }
    }, 60)
  } else if (!estOuverte && ov.__ouverte) {
    ov.__ouverte = false
    const retour = ov.__retour
    if (retour?.isConnected && !ouvertes().length) retour.focus?.({ preventScroll: true })
  }
}

export function initModales() {
  document.querySelectorAll('.modal-overlay').forEach(preparer)
  // Fenêtres créées plus tard (dialogue.js…)
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return
    if (n.classList?.contains('modal-overlay')) preparer(n)
    n.querySelectorAll?.('.modal-overlay').forEach(preparer)
  }))).observe(document.body, { childList: true, subtree: true })

  document.addEventListener('keydown', e => {
    const haut = ouvertes().at(-1)
    if (haut && e.key === 'Escape') {
      if (haut.classList.contains('modal-dialogue')) return // géré par dialogue.js
      const fermer = haut.querySelector('.modal-close')
      if (fermer) fermer.click()
      else haut.classList.add('hidden')
      e.preventDefault()
      return
    }
    if (haut && e.key === 'Tab') {
      const liste = focusables(haut.querySelector('.modal') || haut)
      if (!liste.length) return
      const premier = liste[0], dernier = liste.at(-1)
      if (!haut.contains(document.activeElement)) { e.preventDefault(); premier.focus() }
      else if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus() }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus() }
      return
    }
    // Entrée / Espace sur un élément role="button" qui n'est pas un vrai bouton
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"]:not(button)')) {
      e.preventDefault()
      e.target.click()
    }
  })
}
