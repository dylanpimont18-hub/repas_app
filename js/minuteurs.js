// js/minuteurs.js — Minuteurs de cuisine : plusieurs à la fois, gardés si on ferme le mode cuisine ou recharge la page
import { esc } from './utils.js'
import { icone } from './icones.js'

const CLE = 'repas_minuteurs'
let minuteurs = lire()   // [{ id, libelle, fin (ms), duree (s), sonne }]
let tic = null
let audio = null

function lire() {
  try { return JSON.parse(localStorage.getItem(CLE) || '[]').filter(m => m.fin > Date.now() - 3600000) } catch { return [] }
}
function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(minuteurs)) } catch { /* navigation privée */ }
}

const format = s => {
  s = Math.max(0, Math.round(s))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

// Bip (le son doit être « débloqué » par un geste : il l'est au lancement du minuteur)
function debloquerSon() {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.() } catch { audio = null }
}
function sonner() {
  navigator.vibrate?.([300, 150, 300, 150, 300])
  if (!audio) return
  ;[0, 0.35, 0.7].forEach(t => {
    const o = audio.createOscillator(), g = audio.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.25, audio.currentTime + t)
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t + 0.3)
    o.connect(g).connect(audio.destination)
    o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.3)
  })
}

export function lancerMinuteur(libelle, secondes) {
  debloquerSon()
  minuteurs.push({ id: `m${Date.now()}`, libelle, fin: Date.now() + secondes * 1000, duree: secondes, sonne: false })
  sauver()
  afficherMinuteurs()
}

export function afficherMinuteurs() {
  let barre = document.getElementById('barreMinuteurs')
  if (!minuteurs.length) { barre?.remove(); clearInterval(tic); tic = null; return }
  if (!barre) {
    barre = document.createElement('div')
    barre.id = 'barreMinuteurs'
    barre.className = 'barre-minuteurs'
    barre.setAttribute('role', 'region')
    barre.setAttribute('aria-label', 'Minuteurs')
    barre.addEventListener('click', e => {
      const b = e.target.closest('[data-minuteur]'); if (!b) return
      minuteurs = minuteurs.filter(m => m.id !== b.dataset.minuteur)
      sauver(); afficherMinuteurs()
    })
    document.body.appendChild(barre)
  }
  // Structure redessinée seulement quand la liste change ; chaque seconde, seul le temps restant bouge (le focus reste)
  let signature = ''
  const dessiner = () => {
    const maintenant = Date.now()
    for (const m of minuteurs) {
      if (!m.sonne && m.fin <= maintenant) { m.sonne = true; sauver(); sonner() }
    }
    const sig = minuteurs.map(m => `${m.id}${m.sonne}`).join()
    if (sig !== signature) {
      signature = sig
      barre.innerHTML = minuteurs.map(m => `<div class="minuteur${m.sonne ? ' minuteur-fini' : ''}">
        ${icone('minuteur')}<span class="minuteur-libelle">${esc(m.libelle)}</span>
        <span class="minuteur-temps" data-temps="${esc(m.id)}" ${m.sonne ? 'role="alert"' : ''}></span>
        <button class="minuteur-stop" data-minuteur="${esc(m.id)}" aria-label="${m.sonne ? 'Fermer' : 'Arrêter'} le minuteur ${esc(m.libelle)}">${icone('croix')}</button>
      </div>`).join('')
    }
    for (const m of minuteurs) {
      const el = barre.querySelector(`[data-temps="${m.id}"]`)
      if (el) el.textContent = m.sonne ? 'Terminé !' : format((m.fin - maintenant) / 1000)
    }
  }
  dessiner()
  clearInterval(tic)
  tic = setInterval(dessiner, 1000)
}

export const minuteursEnCours = () => minuteurs.length > 0
