// tests/import.test.mjs — Import d'une recette depuis un site (JSON-LD) ou un texte collé
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dureeIso, trouverRecette, recetteDepuisJsonLd, recetteDepuisTexte } from '../js/import-pur.js'

test('dureeIso lit les durées schema.org', () => {
  assert.equal(dureeIso('PT1H15M'), 75)
  assert.equal(dureeIso('PT20M'), 20)
  assert.equal(dureeIso(''), 0)
})

test('JSON-LD : recette trouvée dans un @graph et convertie', () => {
  const page = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, {
    '@type': ['Recipe'], name: 'Tajine de poulet &amp; citron', recipeYield: '6 personnes', prepTime: 'PT20M', cookTime: 'PT1H',
    recipeIngredient: ['1 kg de poulet', '2 citrons confits', '1 c.à.s. de ras el hanout', 'Sel'],
    recipeInstructions: [{ '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'Faire revenir le poulet.' }, { '@type': 'HowToStep', text: '<b>Mijoter</b> 1 h.' }] }],
  }] }
  const r = recetteDepuisJsonLd(trouverRecette(page))
  assert.equal(r.nom, 'Tajine de poulet & citron')
  assert.equal(r.portions, 6)
  assert.deepEqual([r.temps_prep, r.temps_cuisson], [20, 60])
  assert.deepEqual(r.ingredients[0], { quantite: '1 kg', nom: 'poulet' })
  assert.deepEqual(r.ingredients[3], { quantite: '', nom: 'Sel' })
  assert.deepEqual(r.etapes, ['Faire revenir le poulet.', 'Mijoter 1 h.'])
  assert.equal(trouverRecette({ '@type': 'Article' }), null)
})

test('texte collé : sections ingrédients et préparation', () => {
  const r = recetteDepuisTexte(`Gratin de courgettes
Pour 4 personnes
Ingrédients :
- 3 courgettes
- 200 g de fromage râpé
- 20 cl de crème
Préparation :
1. Couper les courgettes.
2. Gratiner 25 min.`)
  assert.equal(r.nom, 'Gratin de courgettes')
  assert.equal(r.portions, 4)
  assert.deepEqual(r.ingredients.map(i => [i.quantite, i.nom]), [['3', 'courgettes'], ['200 g', 'fromage râpé'], ['20 cl', 'crème']])
  assert.deepEqual(r.etapes, ['Couper les courgettes.', 'Gratiner 25 min.'])
})

test('texte collé sans titres : quantités = ingrédients, le reste = étapes', () => {
  const r = recetteDepuisTexte('Omelette\n3 œufs\n1 pincée de sel\nBattre les œufs et cuire à feu doux.')
  assert.equal(r.ingredients.length, 2)
  assert.deepEqual(r.etapes, ['Battre les œufs et cuire à feu doux.'])
})
