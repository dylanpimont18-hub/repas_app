// js/planning.js
import { dbGetPlanning, dbUpsertPlanning, dbUpsertPlanningLot, dbUpsertRecettes,
         dbGetPlanningSemaines, dbViderCreneaux, dbGetReglage, dbSetReglage } from './db.js'
import { getSemaineKey } from './utils.js'
import { creneauxDuCycle, semainesDuCycle, normaliserModele, ajouterJours, dateDeSemaine } from './cycle.js'

export { getSemaineKey }
export const JOURS   = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
export const MOMENTS = ['midi','soir']

export async function getPlanning(semaineKey) {
  return await dbGetPlanning(semaineKey)
}

export async function assignerRepas(semaineKey, jour, moment, recetteId, portions) {
  await dbUpsertPlanning(semaineKey, jour, moment, recetteId, portions)
}

export async function supprimerRepas(semaineKey, jour, moment) {
  await dbUpsertPlanning(semaineKey, jour, moment, null, null)
}

// ── Cycle samedi soir → samedi midi ──────────────────────────────────
export async function getModele() {
  return normaliserModele(await dbGetReglage('modele_semaine'))
}

export async function setModele(modele) {
  await dbSetReglage('modele_semaine', normaliserModele(modele))
}

// Créneaux du cycle + occupation actuelle { cle: { id, portions, source } }
// + repas supprimés { cle: true } (ligne sans recette, source 'absent' : restent vides, hors remplissage et courses)
export async function chargerCycle(samedi, modele = null) {
  const m = modele || await getModele()
  const creneaux = creneauxDuCycle(samedi, m)
  const lignes = await dbGetPlanningSemaines(semainesDuCycle(samedi))
  const parCle = Object.fromEntries(lignes.map(l => [`${l.semaine_key}|${l.jour}|${l.moment}`, l]))
  const occupation = {}, absents = {}
  for (const c of creneaux) {
    const l = parCle[c.cle]
    if (l?.recette_id) occupation[c.cle] = { id: l.recette_id, portions: l.portions ?? c.portions, source: l.source || 'manuel' }
    else if (l?.source === 'absent') absents[c.cle] = true
  }
  return { modele: m, creneaux, occupation, absents }
}

// Supprime des repas du cycle (pas de repas ce jour-là) ; « Rétablir » = viderCreneaux
export async function supprimerCreneaux(creneaux) {
  await dbUpsertPlanningLot(creneaux.map(c => ({
    semaine_key: c.semaineKey, jour: c.jour, moment: c.moment, recette_id: null, portions: c.portions, source: 'absent',
  })))
}

// Dernière date de consommation de chaque recette sur les 8 semaines avant le cycle : { recetteId: timestamp }
export async function chargerHistorique(samedi) {
  const keys = [...new Set([0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => getSemaineKey(ajouterJours(samedi, -7 * k))))]
  const lignes = await dbGetPlanningSemaines(keys)
  const limite = samedi.getTime() + 12 * 3600000   // jusqu'au samedi midi inclus
  const hist = {}
  for (const l of lignes) {
    if (!l.recette_id) continue
    const t = dateDeSemaine(l.semaine_key, l.jour).getTime() + (l.moment === 'soir' ? 19 : 12) * 3600000
    if (t > limite) continue
    if (!hist[l.recette_id] || hist[l.recette_id] < t) hist[l.recette_id] = t
  }
  return hist
}

// Écrit plusieurs créneaux : [{ creneau, recetteId, source, portions? }]
export async function enregistrerCreneaux(affectations) {
  await dbUpsertPlanningLot(affectations.map(a => ({
    semaine_key: a.creneau.semaineKey,
    jour:        a.creneau.jour,
    moment:      a.creneau.moment,
    recette_id:  a.recetteId,
    portions:    a.portions ?? a.creneau.portions,
    source:      a.source || 'manuel',
  })))
}

export async function viderCreneaux(creneaux) {
  await dbViderCreneaux(creneaux.map(c => ({ semaine_key: c.semaineKey, jour: c.jour, moment: c.moment })))
}

// Enregistre des recettes générées par l'IA puis les affecte : [{ creneau, recette }]
export async function importerRecettesIA(lignes) {
  const valides = lignes.filter(l => l.recette && l.creneau)
  const ids = await dbUpsertRecettes(valides.map(l => l.recette))
  await enregistrerCreneaux(valides.map((l, i) => ({ creneau: l.creneau, recetteId: ids[i], source: 'ia' })))
  return ids
}

export async function getJoursAvecRepas(semaineKey) {
  const planning = await dbGetPlanning(semaineKey)
  return JOURS.flatMap(jour =>
    MOMENTS.filter(m => planning[jour]?.[m]?.id).map(m => ({ jour, moment: m, ...planning[jour][m] }))
  )
}

// Ids des recettes présentes dans un planning
export function idsDuPlanning(planning) {
  return JOURS.flatMap(j => MOMENTS.map(m => planning[j]?.[m]?.id)).filter(Boolean)
}
