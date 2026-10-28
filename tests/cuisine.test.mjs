// tests/cuisine.test.mjs — Mode cuisine : plats d'une session et quantités ajustées
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { platsACuisiner, ingredientsPour } from '../js/cuisine.js'

const recettes = {
  a: { id: 'a', nom: 'Tajine', portions: 4, temps_cuisson: 60, ingredients: [{ nom: 'agneau', quantite: '800 g' }, { nom: 'oignon', quantite: '2' }] },
  b: { id: 'b', nom: 'Salade', portions: 4, temps_cuisson: 0 },
  c: { id: 'c', nom: 'Lasagnes', portions: 4, temps_cuisson: 45 },
}

test('platsACuisiner : additionne les portions, ignore congélo et restes, cuisson longue d\'abord', () => {
  const creneaux = ['l-soir', 'm-midi', 'm-soir', 'x', 'y'].map(cle => ({ cle, portions: 4 }))
  const occupation = {
    'l-soir': { id: 'b', portions: 4 }, 'm-midi': { id: 'a', portions: 1 }, 'm-soir': { id: 'a', portions: 4 },
    x: { id: 'c', portions: 4, source: 'reserve' }, y: { id: 'c', portions: 4, source: 'reste' },
  }
  const plats = platsACuisiner(creneaux, occupation, recettes)
  assert.deepEqual(plats.map(p => [p.recette.id, p.portions, p.repas.length]), [['a', 5, 2], ['b', 4, 1]])
})

test('ingredientsPour : quantités ajustées aux portions', () => {
  assert.deepEqual(ingredientsPour(recettes.a, 6), [{ nom: 'agneau', quantite: '1,2 kg' }, { nom: 'oignon', quantite: '3' }])
  assert.deepEqual(ingredientsPour(recettes.a, 4), [{ nom: 'agneau', quantite: '800 g' }, { nom: 'oignon', quantite: '2' }])
})
