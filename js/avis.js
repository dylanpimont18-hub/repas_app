// js/avis.js — Avis après le repas : quels plats demander à noter (fonctions pures, testées sous Node)
import { dateDeSemaine } from './cycle.js'

const HEURE = { midi: 13, soir: 20 }   // heure à laquelle le repas est considéré comme mangé
const JOUR_MS = 86400000

// Moment du repas d'une ligne du planning
export function dateRepas(ligne) {
  const d = dateDeSemaine(ligne.semaine_key, ligne.jour)
  d.setHours(HEURE[ligne.moment] ?? 12, 0, 0, 0)
  return d
}

/**
 * Plats mangés ces `jours` derniers jours et pas encore notés, regroupés par recette
 * (un plat de session mangé deux fois ne se note qu'une fois), le plus récent d'abord.
 * Les plats du congélo et les restes comptent : on les a mangés aussi.
 * @param lignes lignes du planning { semaine_key, jour, moment, recette_id, source, avis }
 * @returns [{ recetteId, creneaux: [{ semaine_key, jour, moment }], date }]
 */
export function repasANoter(lignes, maintenant = new Date(), jours = 3) {
  const limite = maintenant.getTime() - jours * JOUR_MS
  const parRecette = new Map()
  for (const l of lignes) {
    if (!l.recette_id || l.source === 'absent') continue
    const t = dateRepas(l).getTime()
    if (t > maintenant.getTime() || t < limite) continue
    if (!parRecette.has(l.recette_id)) parRecette.set(l.recette_id, { recetteId: l.recette_id, creneaux: [], date: 0, note: false })
    const r = parRecette.get(l.recette_id)
    r.creneaux.push({ semaine_key: l.semaine_key, jour: l.jour, moment: l.moment })
    r.date = Math.max(r.date, t)
    if (l.avis) r.note = true
  }
  return [...parRecette.values()].filter(r => !r.note)
    .sort((a, b) => b.date - a.date)
    .map(({ note: _, ...r }) => r)
}
