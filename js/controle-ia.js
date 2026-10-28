// js/controle-ia.js — Nettoyage et contrôle des recettes reçues de l'IA (fonctions pures, testées sous Node)
// Une recette n'est gardée que si elle passe les mêmes règles que la bibliothèque : halal, sélecteurs,
// goûts des profils qui mangent (légumes « cachables » seulement avec une astuce), conservation pour la session
import { TAGS, ENVIES, contientInterdit, passeFiltres } from './filtres.js'
import { validerVegetarien } from './utils.js'
import { evaluer } from './selection.js'

const FAMILLE = ['dylan', 'femme']

// Nettoie une recette IA : champs attendus, tags du vocabulaire, nombres valides
export function nettoyerRecette(r, portionsParDefaut) {
  const nombre = (v, def = 0) => Number.isFinite(Number(v)) ? Number(v) : def
  return {
    nom:                String(r.nom || '').trim(),
    description:        r.description ? String(r.description) : null,
    cuisine:            r.cuisine ? String(r.cuisine).toLowerCase() : null,
    composants: {
      base:      r.composants?.base || null,
      principal: r.composants?.principal || null,
      proteine:  r.composants?.proteine || null,
      legumes:   Array.isArray(r.composants?.legumes) ? r.composants.legumes : [],
    },
    ingredients:        (r.ingredients || []).filter(i => i?.nom).map(i => ({ nom: String(i.nom), quantite: String(i.quantite ?? '') })),
    legumes_caches:     (r.legumes_caches || []).filter(l => l?.legume && l?.astuce),
    tags:               (r.tags || []).map(t => String(t).toLowerCase()).filter(t => TAGS.includes(t)),
    conservation_jours: nombre(r.conservation_jours, 2),
    portions:           nombre(r.portions, portionsParDefaut) || portionsParDefaut,
    temps_prep:         nombre(r.temps_prep),
    temps_cuisson:      nombre(r.temps_cuisson),
    vegetarien:         !!r.vegetarien,
    etapes:             Array.isArray(r.etapes) ? r.etapes.map(e => String(e)) : [],
    nutrition:          r.nutrition && typeof r.nutrition === 'object' ? r.nutrition : null,
  }
}

/** Raison du refus d'une recette pour un créneau (null si elle est conforme) */
export function raisonRefus(r, creneau, filtres = [], indexPrefs = []) {
  if (!r.nom) return 'sans nom'
  if (contientInterdit(r)) return 'pas halal'
  if (!passeFiltres(r, filtres.filter(f => !ENVIES.includes(f) && f !== 'budget'))) return 'hors contraintes'
  if (filtres.includes('vegetarien') && !validerVegetarien(r)) return 'pas végétarien'
  const profils = creneau?.profils?.length ? creneau.profils : FAMILLE
  const pourCreneau = { ...creneau, profils }
  // Goûts et conservation : mêmes règles que la sélection dans la bibliothèque (sans rotation ni filtres, déjà vus)
  if (evaluer(r, pourCreneau, { indexPrefs, filtres: [], historique: {}, style: '' }) === null) {
    if (creneau?.enSession && r.conservation_jours < creneau.joursConservation) return 'ne se conserve pas assez'
    return 'goûts du foyer'
  }
  return null
}

// Vérifie chaque { creneau, recette } ; renvoie les recettes conformes et les noms rejetés (avec la raison)
export function verifier(recettes, filtres = [], indexPrefs = []) {
  const ok = [], rejets = []
  for (const x of recettes) {
    const raison = raisonRefus(x.recette, x.creneau, filtres, indexPrefs)
    if (raison) rejets.push(`${x.recette.nom || '?'} (${raison})`)
    else ok.push(x)
  }
  return { ok, rejets }
}
