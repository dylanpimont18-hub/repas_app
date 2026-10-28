// tests/cuisine.test.mjs — Mode cuisine : plats d'une session et quantités ajustées
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { platsACuisiner, ingredientsPour } from '../js/cuisine.js'

const recettes = {
  a: { id: 'a', nom: 'Tajine', portions: 4, temps_cuisson: 60, ingredients: [{ nom: 'agneau', quantite: '800 g' }, { nom: 'oignon', quantite: '2' }] },
  b: { id: 'b', nom: 'Salade', portions: 4, temps_cuisson: 0 },
  c: { id: 'c', nom: 'Lasagnes', portions: 4, temps_cuisson: 45 },
}

test('platsACuisiner : additionne les portions, ignore le congélo, cuisson longue d\'abord', () => {
  const creneaux = ['l-soir', 'm-midi', 'm-soir', 'x', 'y'].map(cle => ({ cle, portions: 4 }))
  const occupation = {
    'l-soir': { id: 'b', portions: 4 }, 'm-midi': { id: 'a', portions: 1 }, 'm-soir': { id: 'a', portions: 4 },
    x: { id: 'c', portions: 4, source: 'reserve' }, y: { id: 'c', portions: 4, source: 'reste' },
  }
  const plats = platsACuisiner(creneaux, occupation, recettes)
  // y reprend « c », qui vient du congélo : rien à cuisiner pour lui
  assert.deepEqual(plats.map(p => [p.recette.id, p.portions, p.repas.length]), [['a', 5, 2], ['b', 4, 1]])
})

test('platsACuisiner : un midi « reste » ajoute ses portions au plat du soir (comme les courses)', () => {
  const creneaux = ['lun-soir', 'mar-midi'].map(cle => ({ cle, portions: 4 }))
  const occupation = { 'mar-midi': { id: 'a', portions: 1, source: 'reste' }, 'lun-soir': { id: 'a', portions: 4, source: 'biblio' } }
  const [plat] = platsACuisiner(creneaux, occupation, recettes)
  assert.equal(plat.portions, 5)
  assert.deepEqual(plat.repas.map(c => c.cle), ['lun-soir', 'mar-midi'])
  // Reste seul (plat d'origine pas dans ces créneaux) : rien à cuisiner
  assert.equal(platsACuisiner([creneaux[1]], occupation, recettes).length, 0)
})

test('ingredientsPour : quantités ajustées aux portions', () => {
  assert.deepEqual(ingredientsPour(recettes.a, 6), [{ nom: 'agneau', quantite: '1,2 kg' }, { nom: 'oignon', quantite: '3' }])
  assert.deepEqual(ingredientsPour(recettes.a, 4), [{ nom: 'agneau', quantite: '800 g' }, { nom: 'oignon', quantite: '2' }])
})

test('dureesDansEtape repère les minuteurs à proposer', async () => {
  const { dureesDansEtape } = await import('../js/cuisine.js')
  const s = t => dureesDansEtape(t).map(d => d.secondes)
  assert.deepEqual(s('Laisser mijoter 25 min à couvert.'), [1500])
  assert.deepEqual(s('Cuire 30 à 40 minutes au four à 180 °C'), [2400])
  assert.deepEqual(s('Enfourner 1 h 30 puis laisser reposer 10 min'), [5400, 600])
  assert.deepEqual(s('Cuire 2 heures'), [7200])
  assert.deepEqual(s('Ajouter 200 g de riz et 3 minutes plus tard le sel'), [180])
  assert.deepEqual(s('Préchauffer le four à 200 °C'), [])
  assert.deepEqual(s('Couper 2 tomates'), [])
})

test('recetteAuxPortions pondère les ingrédients selon le nombre de personnes', async () => {
  const { recetteAuxPortions } = await import('../js/cuisine.js')
  const r = { nom: 'Curry', portions: 4, ingredients: [{ nom: 'Poulet', quantite: '600 g' }, { nom: 'Lait de coco', quantite: '40 cl' }, { nom: 'Sel', quantite: 'selon goût' }, { nom: 'Oignon', quantite: '2' }] }
  const pour2 = recetteAuxPortions(r, 2)
  assert.equal(pour2.portions, 2)
  assert.deepEqual(pour2.ingredients.map(i => i.quantite), ['300 g', '20 cl', 'selon goût', '1'])
  assert.deepEqual(recetteAuxPortions(r, 6).ingredients.map(i => i.quantite), ['900 g', '60 cl', 'selon goût', '3'])
  assert.equal(recetteAuxPortions(r, 4).ingredients, r.ingredients) // inchangé
  assert.equal(r.portions, 4) // l'original n'est pas modifié
})
