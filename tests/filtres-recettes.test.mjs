// tests/filtres-recettes.test.mjs — Filtres de la bibliothèque déduits des recettes
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtresDisponibles, appliquerFiltres, nettoyerSelection, basculer, proteineAffichee, nbActifs, filtrerParIngredients, ajouterIngredients } from '../js/filtres-recettes.js'

const R = [
  { id: 'a', nom: 'Poulet croustillant', cuisine: 'Américaine', tags: ['rapide'], temps_prep: 10, temps_cuisson: 15,
    composants: { proteine: 'blancs de poulet' }, ingredients: [{ nom: 'poulet' }, { nom: 'chapelure' }] },
  { id: 'b', nom: 'Saumon teriyaki', cuisine: 'japonaise', tags: ['healthy'], temps_prep: 10, temps_cuisson: 30,
    ingredients: [{ nom: 'saumon' }, { nom: 'sauce soja' }], conservation_jours: 3 },
  { id: 'c', nom: 'Curry de pois chiches', cuisine: 'Indienne', vegetarien: true, tags: ['réconfortant', 'healthy'],
    temps_prep: 15, temps_cuisson: 25, ingredients: [{ nom: 'pois chiches' }, { nom: 'lait de coco' }],
    legumes_caches: [{ legume: 'courgette', astuce: 'mixée' }] },
]

const groupe = (dispo, id) => dispo.find(g => g.id === id)
const valeurs = (dispo, id) => groupe(dispo, id)?.options.map(o => o.valeur) || []

test('un filtre n\'existe que si une recette le porte', () => {
  const d = filtresDisponibles(R)
  assert.deepEqual(valeurs(d, 'regime').sort(), ['poisson', 'vegetarien', 'viande'])
  assert.deepEqual(valeurs(d, 'cuisine').sort(), ['americaine', 'indienne', 'japonaise'])
  assert.deepEqual(valeurs(d, 'style').sort(), ['healthy', 'rapide', 'réconfortant'])
  assert.deepEqual(valeurs(d, 'pratique').sort(), ['caches', 'garde', 'peu'])
  assert.deepEqual(valeurs(filtresDisponibles([R[0]]), 'regime'), ['viande'])
  assert.equal(groupe(filtresDisponibles([R[0]]), 'pratique').options.length, 1) // 2 ingrédients → « peu »
  assert.deepEqual(filtresDisponibles([]), [])
})

test('compteurs et ordre : du plus fréquent au moins fréquent, temps dans l\'ordre', () => {
  const d = filtresDisponibles(R)
  assert.deepEqual(groupe(d, 'style').options[0], { valeur: 'healthy', label: 'Healthy', n: 2 })
  assert.deepEqual(valeurs(d, 'temps'), ['30', '45']) // 25, 40, 40 min
  assert.equal(groupe(d, 'temps').unique, true)
})

test('protéine lisible', () => {
  assert.equal(proteineAffichee(R[0]), 'Poulet')
  assert.equal(proteineAffichee(R[1]), 'Saumon')
  assert.equal(proteineAffichee(R[2]), 'Pois chiches')
  assert.equal(proteineAffichee({ nom: 'Salade verte', ingredients: [{ nom: 'laitue' }] }), null)
})

test('ET entre groupes, OU dans un groupe', () => {
  assert.deepEqual(appliquerFiltres(R, { style: ['healthy'] }).map(r => r.id), ['b', 'c'])
  assert.deepEqual(appliquerFiltres(R, { style: ['healthy'], regime: ['vegetarien'] }).map(r => r.id), ['c'])
  assert.deepEqual(appliquerFiltres(R, { cuisine: ['japonaise', 'americaine'] }).map(r => r.id), ['a', 'b'])
  assert.deepEqual(appliquerFiltres(R, { temps: ['30'] }).map(r => r.id), ['a'])
  assert.equal(appliquerFiltres(R, {}).length, 3)
})

test('sélection : bascule, choix unique, nettoyage', () => {
  let s = basculer({}, 'style', 'healthy')
  s = basculer(s, 'style', 'rapide')
  assert.deepEqual(s, { style: ['healthy', 'rapide'] })
  s = basculer(s, 'temps', '30', true)
  s = basculer(s, 'temps', '45', true)
  assert.deepEqual(s.temps, ['45'])
  assert.equal(nbActifs(s), 3)
  assert.deepEqual(basculer({ style: ['healthy'] }, 'style', 'healthy'), {})
  // Livre sans recette japonaise : le filtre disparaît de la sélection
  const nettoye = nettoyerSelection({ cuisine: ['japonaise'], style: ['healthy'] }, filtresDisponibles([R[2]]))
  assert.deepEqual(nettoye, { style: ['healthy'] })
})

test('filtrerParIngredients : toutes les puces doivent être dans la recette (ET), sans accents ni pluriel', () => {
  const ids = (ings) => filtrerParIngredients(R, ings).map(r => r.id)
  assert.deepEqual(ids([]), ['a', 'b', 'c'])
  assert.deepEqual(ids(['Poulets']), ['a'])
  assert.deepEqual(ids(['poulet', 'chapelure']), ['a'])
  assert.deepEqual(ids(['poulet', 'saumon']), [])
  assert.deepEqual(ids(['pois chiche', 'LAIT de coco']), ['c'])
  assert.deepEqual(ids(['soja']), ['b'])
})

test('ajouterIngredients : découpe la saisie et ignore les doublons', () => {
  assert.deepEqual(ajouterIngredients([], 'poulet, carottes et riz'), ['poulet', 'carottes', 'riz'])
  assert.deepEqual(ajouterIngredients(['poulet'], 'Poulets ; tomate'), ['poulet', 'tomate'])
  assert.deepEqual(ajouterIngredients(['poulet'], '  , '), ['poulet'])
})
