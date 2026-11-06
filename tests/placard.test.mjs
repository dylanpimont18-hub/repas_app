import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aAcheter, recettesPlacard } from '../js/selection.js'

const ing = (...noms) => noms.map(nom => ({ nom, quantite: 1, unite: '' }))

test('aAcheter : saisis, placard et basiques ne sont pas à acheter', () => {
  const r = { nom: 'Riz sauté', ingredients: ing('Riz basmati', 'Carottes', 'Oeufs', 'Sauce soja', 'Huile', 'Sel', 'Oignon') }
  assert.deepEqual(aAcheter(r, 'riz, 2 carottes, oeufs', ['sauce soja']), ['Oignon'])
})

test('aAcheter : un reste décrit en plusieurs mots couvre l’ingrédient simple', () => {
  const r = { nom: 'Hachis', ingredients: ing('Boeuf', 'Pommes de terre') }
  assert.deepEqual(aAcheter(r, 'reste de boeuf bourguignon, pommes de terre'), [])
})

test('recettesPlacard : le moins d’achats d’abord, trop d’achats exclus', () => {
  const recettes = [
    { id: 'a', nom: 'A', ingredients: ing('Riz', 'Carotte', 'Poulet', 'Coco', 'Curry') },
    { id: 'b', nom: 'B', ingredients: ing('Riz', 'Carotte', 'Oeuf') },
    { id: 'c', nom: 'C', ingredients: ing('Riz', 'Carotte', 'Saumon', 'Aneth', 'Citron', 'Crème', 'Poireau') },
    { id: 'd', nom: 'D', ingredients: ing('Pâtes', 'Tomate') },
  ]
  const res = recettesPlacard(recettes, 'riz, carotte', [], 5)
  assert.deepEqual(res.map(r => r.id), ['b', 'a'])
  assert.deepEqual(res[0].aAcheter, ['Oeuf'])
})
