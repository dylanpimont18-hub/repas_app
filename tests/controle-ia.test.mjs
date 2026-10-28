// tests/controle-ia.test.mjs — Les recettes de l'IA passent les mêmes règles que la bibliothèque
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { raisonRefus, verifier, nettoyerRecette } from '../js/controle-ia.js'
import { construireIndexPrefs } from '../js/selection.js'

const ingredients = [
  { id: 'courgette', nom: 'Courgette', categorie: 'legumes' },
  { id: 'champignon', nom: 'Champignon', categorie: 'legumes' },
  { id: 'thon', nom: 'Thon', categorie: 'viandes' },
  { id: 'coriandre', nom: 'Coriandre', categorie: 'epices' },
]
const index = construireIndexPrefs(ingredients, {
  dylan: { coriandre: 'j_aime_pas' },
  femme: { courgette: 'j_aime_pas', champignon: 'j_aime_pas', thon: 'j_aime_pas' },
})
const famille = { profils: ['dylan', 'femme'], portions: 4 }
const femmeSeule = { profils: ['femme'], portions: 1 }
const recette = (...noms) => nettoyerRecette({ nom: 'Plat', ingredients: noms.map(nom => ({ nom, quantite: '1' })) }, 4)

test('refuse un ingrédient « Je n\'aime pas » du profil qui mange', () => {
  assert.equal(raisonRefus(recette('Thon', 'Riz'), famille, [], index), 'goûts du foyer')
  assert.equal(raisonRefus(recette('Coriandre fraîche', 'Riz'), famille, [], index), 'goûts du foyer')
  // Dylan ne mange pas ce midi-là : sa coriandre détestée ne compte pas
  assert.equal(raisonRefus(recette('Coriandre', 'Riz'), femmeSeule, [], index), null)
})

test('un légume de la femme est accepté seulement s\'il est caché avec une astuce', () => {
  const sansAstuce = recette('Courgette', 'Pâtes')
  assert.equal(raisonRefus(sansAstuce, famille, [], index), 'goûts du foyer')
  const cache = { ...sansAstuce, legumes_caches: [{ legume: 'courgette', astuce: 'mixée dans la sauce' }] }
  assert.equal(raisonRefus(cache, famille, [], index), null)
})

test('halal, contraintes et conservation de session', () => {
  assert.equal(raisonRefus(recette('Lardons', 'Pâtes'), famille, [], index), 'pas halal')
  assert.equal(raisonRefus(recette('Poulet', 'Riz'), famille, ['vegetarien'], index), 'hors contraintes')
  const session = { ...famille, enSession: true, joursConservation: 2 }
  assert.equal(raisonRefus({ ...recette('Poulet', 'Riz'), conservation_jours: 1 }, session, [], index), 'ne se conserve pas assez')
  // Une envie (bouillon) n'est pas une contrainte dure
  assert.equal(raisonRefus(recette('Poulet', 'Riz'), famille, ['bouillon'], index), null)
})

test('verifier sépare les recettes gardées et rejetées, avec la raison', () => {
  const { ok, rejets } = verifier([
    { creneau: famille, recette: recette('Poulet', 'Riz') },
    { creneau: famille, recette: { ...recette('Thon'), nom: 'Salade de thon' } },
  ], [], index)
  assert.equal(ok.length, 1)
  assert.deepEqual(rejets, ['Salade de thon (goûts du foyer)'])
})
