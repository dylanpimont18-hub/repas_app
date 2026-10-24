// js/cycle.js — Cycle samedi soir → samedi midi, modèle de semaine, sessions de cuisine (fonctions pures)
import { getSemaineKey } from './utils.js'

export const JOURS_JS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
const LABEL_JOUR = { lundi:'Lundi', mardi:'Mardi', mercredi:'Mercredi', jeudi:'Jeudi', vendredi:'Vendredi', samedi:'Samedi', dimanche:'Dimanche' }

const FEMME  = { portions: 1, profils: ['femme'] }
const FAMILLE = { portions: 4, profils: ['dylan', 'femme'] }

// Modèle par défaut : qui mange à chaque créneau et quel jour le plat est cuisiné
export const MODELE_DEFAUT = {
  lundi:    { midi: FEMME,   soir: FAMILLE, cuisineLe: 'dimanche' },
  mardi:    { midi: FEMME,   soir: FAMILLE, cuisineLe: 'dimanche' },
  mercredi: { midi: FAMILLE, soir: FAMILLE, cuisineLe: 'mercredi' },
  jeudi:    { midi: FEMME,   soir: FAMILLE, cuisineLe: 'mercredi' },
  vendredi: { midi: FEMME,   soir: FAMILLE, cuisineLe: 'mercredi' },
  samedi:   { midi: FAMILLE, soir: FAMILLE, cuisineLe: 'samedi' },
  dimanche: { midi: FAMILLE, soir: FAMILLE, cuisineLe: 'dimanche' },
}

// Complète un modèle partiel (réglages Supabase) avec les valeurs par défaut
export function normaliserModele(modele) {
  const res = {}
  for (const jour of Object.keys(MODELE_DEFAUT)) {
    const d = MODELE_DEFAUT[jour], m = modele?.[jour] || {}
    res[jour] = {
      midi:      { ...d.midi, ...(m.midi || {}) },
      soir:      { ...d.soir, ...(m.soir || {}) },
      cuisineLe: m.cuisineLe || d.cuisineLe,
    }
  }
  return res
}

export function ajouterJours(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
}

export function dateIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function dateCourte(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

// Samedi qui ouvre le cycle contenant `date` (le samedi lui-même ouvre un nouveau cycle : jour des courses)
export function debutCycle(date = new Date()) {
  const offset = (date.getDay() - 6 + 7) % 7
  return ajouterJours(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -offset)
}

export function decalerCycle(samedi, n) { return ajouterJours(samedi, 7 * n) }

// Clé d'état des courses du cycle (suffixe -C : distincte de l'ancien état par semaine ISO)
export function cleCycle(samedi) { return `${getSemaineKey(samedi)}-C` }

export function labelCycle(samedi) {
  return `Sam ${dateCourte(samedi)} → Sam ${dateCourte(ajouterJours(samedi, 7))}`
}

// Semaines ISO couvertes par le cycle (pour charger le planning)
export function semainesDuCycle(samedi) {
  return [...new Set([getSemaineKey(samedi), getSemaineKey(ajouterJours(samedi, 7))])]
}

// Date d'un jour d'une semaine ISO ("2026-W43", "mardi")
export function dateDeSemaine(semaineKey, jour) {
  const [an, sem] = semaineKey.split('-W').map(Number)
  const jan4  = new Date(an, 0, 4)
  const lundi = ajouterJours(jan4, -((jan4.getDay() || 7) - 1) + (sem - 1) * 7)
  return ajouterJours(lundi, ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'].indexOf(jour))
}

// Nombre de jours entre le jour de cuisine (dernière occurrence de `cuisineLe` avant ou le jour même) et `date`
function joursDepuisCuisine(date, cuisineLe) {
  for (let n = 0; n < 7; n++) {
    if (JOURS_JS[ajouterJours(date, -n).getDay()] === cuisineLe) return n
  }
  return 0
}

// Les 14 créneaux du cycle, dans l'ordre chronologique
export function creneauxDuCycle(samedi, modele = MODELE_DEFAUT) {
  const m = normaliserModele(modele)
  const mercredi = ajouterJours(samedi, 4)
  const liste = [{ date: samedi, moment: 'soir' }]
  for (let i = 1; i <= 6; i++) {
    const d = ajouterJours(samedi, i)
    liste.push({ date: d, moment: 'midi' }, { date: d, moment: 'soir' })
  }
  liste.push({ date: ajouterJours(samedi, 7), moment: 'midi' })

  return liste.map(({ date, moment }, idx) => {
    const jour       = JOURS_JS[date.getDay()]
    const semaineKey = getSemaineKey(date)
    const cuisineLe  = m[jour].cuisineLe
    const enSession  = cuisineLe !== jour
    return {
      idx, date, jour, moment, semaineKey,
      cle:        `${semaineKey}|${jour}|${moment}`,
      portions:   m[jour][moment].portions,
      profils:    m[jour][moment].profils,
      cuisineLe,
      enSession,
      joursConservation: enSession ? joursDepuisCuisine(date, cuisineLe) : 0,
      partie:     date < mercredi ? 'samedi' : 'mercredi',
    }
  })
}

// Groupes d'affichage : sur place jour par jour, ou une session de cuisine regroupant ses jours
export function groupesDuCycle(creneaux) {
  const groupes = []
  for (const c of creneaux) {
    const cle = c.enSession ? `session-${c.cuisineLe}-${dateIso(ajouterJours(c.date, -c.joursConservation))}` : `place-${dateIso(c.date)}`
    let g = groupes[groupes.length - 1]
    if (!g || g.cle !== cle) {
      g = { cle, enSession: c.enSession, cuisineLe: c.cuisineLe, creneaux: [], jours: [] }
      groupes.push(g)
    }
    g.creneaux.push(c)
    if (!g.jours.includes(c.jour)) g.jours.push(c.jour)
  }
  groupes.forEach(g => {
    const c0 = g.creneaux[0]
    g.titre = g.enSession
      ? `Préparé ${g.cuisineLe} → ${g.jours.map(j => LABEL_JOUR[j]).join(' · ')}`
      : `${LABEL_JOUR[c0.jour]} ${dateCourte(c0.date)} · sur place`
  })
  return groupes
}

export function labelCreneau(c) {
  return `${LABEL_JOUR[c.jour]} ${c.moment === 'midi' ? 'midi' : 'soir'}`
}

// Pour un midi « petite portion » cuisiné en session : soir de la même session dont il peut reprendre le plat
// (la veille en priorité, sinon le lendemain)
export function soirAssocie(creneaux, c) {
  if (!c.enSession || c.moment !== 'midi') return null
  const memeSession = s => s.enSession && s.cuisineLe === c.cuisineLe && s.moment === 'soir' &&
    s.portions > c.portions && Math.abs(s.date - c.date) <= 86400000 * 1.5
  const veille    = creneaux.find(s => memeSession(s) && s.date < c.date)
  const lendemain = creneaux.find(s => memeSession(s) && s.date > c.date)
  return veille || lendemain || null
}

// Prochain repas à venir (cible par défaut de « Envie ce soir »)
export function creneauCourant(creneaux, maintenant = new Date()) {
  const minuit = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
  const h = maintenant.getHours()
  // Après 21h, on pense déjà au lendemain midi
  const cible = h >= 21 ? { date: ajouterJours(minuit, 1), moment: 'midi' }
              : { date: minuit, moment: h < 14 ? 'midi' : 'soir' }
  return creneaux.find(s => dateIso(s.date) === dateIso(cible.date) && s.moment === cible.moment)
      || creneaux.find(s => s.date >= minuit)
      || creneaux[0]
}
