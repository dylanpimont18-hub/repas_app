// js/hors-ligne.js — Service worker et bandeau « hors connexion »
import { icone } from './icones.js'

export const estHorsLigne = () => navigator.onLine === false

export function initHorsLigne() {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker', e))
  }
  const bandeau = document.createElement('div')
  bandeau.className = 'bandeau-horsligne hidden'
  bandeau.setAttribute('role', 'status')
  bandeau.innerHTML = `${icone('horsligne')}<span>Hors connexion : tu vois la dernière version enregistrée. Les coches des courses partiront au retour du réseau.</span>`
  document.body.prepend(bandeau)
  const maj = () => bandeau.classList.toggle('hidden', !estHorsLigne())
  window.addEventListener('online', maj)
  window.addEventListener('offline', maj)
  maj()
}
