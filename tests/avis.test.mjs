// tests/avis.test.mjs — Avis après le repas et effet sur la sélection
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repasANoter } from '../js/avis.js'
import { getSemaineKey } from '../js/utils.js'
import { creneauxDuCycle } from '../js/cycle.js'
import { nouveauContexte, candidats } from '../js/selection.js'

const MARDI = new Date(2026, 9, 27, 21, 0)  // mardi 27 octobre 2026, 21 h
const sk = getSemaineKey(MARDI)
const ligne = (jour, moment, recette_id, extra = {}) => ({ semaine_key: sk, jour, moment, recette_id, source: 'biblio', avis: null, ...extra })

test('repasANoter : plats passés récents, groupés par recette, sans les notés ni les futurs', () => {
  const lignes = [
    ligne('lundi', 'soir', 'tajine'), ligne('mardi', 'midi', 'tajine'),
    ligne('mardi', 'soir', 'curry'),
    ligne('dimanche', 'soir', 'pates', { semaine_key: getSemaineKey(new Date(2026, 9, 25)) }),
    ligne('mercredi', 'soir', 'futur'),
    ligne('lundi', 'midi', 'deja', { avis: 1 }),
    ligne('lundi', 'midi', null, { source: 'absent' }),
  ]
  const res = repasANoter(lignes, MARDI)
  assert.deepEqual(res.map(r => r.recetteId), ['curry', 'tajine', 'pates'])
  assert.equal(res[1].creneaux.length, 2)
  assert.deepEqual(repasANoter(lignes, MARDI, 1).map(r => r.recetteId), ['curry', 'tajine'])
})

test('sélection : un plat aimé passe devant, un plat pas aimé passe derrière', () => {
  const samedi = new Date(2026, 9, 24)
  const creneau = creneauxDuCycle(samedi).find(c => c.jour === 'dimanche' && c.moment === 'soir')
  const ctx = () => nouveauContexte({ indexPrefs: [], debut: samedi.getTime() })
  const base = { nom: 'Plat', conservation_jours: 3, ingredients: [{ nom: 'riz', quantite: '1' }] }
  const neutre = { ...base, id: 'neutre' }
  assert.equal(candidats([neutre, { ...base, id: 'aime', avis: 1 }], creneau, ctx())[0].recette.id, 'aime')
  assert.equal(candidats([{ ...base, id: 'rate', avis: -1 }, neutre], creneau, ctx())[0].recette.id, 'neutre')
})
