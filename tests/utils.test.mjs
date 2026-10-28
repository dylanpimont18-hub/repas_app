// tests/utils.test.mjs — Lancer avec : node --test tests/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esc, getSemaineKey, categoriser, validerVegetarien, combinerQuantites, ajouterArticlesLibres, separerPlacard, cleIngredient } from '../js/utils.js'

test('esc neutralise le HTML', () => {
  assert.equal(esc('<b>"Tajine" & co\'</b>'), '&lt;b&gt;&quot;Tajine&quot; &amp; co&#39;&lt;/b&gt;')
  assert.equal(esc(null), '')
})

test('getSemaineKey suit la norme ISO', () => {
  assert.equal(getSemaineKey(new Date(2026, 9, 24)), '2026-W43')
  assert.equal(getSemaineKey(new Date(2027, 0, 1)), '2026-W53')   // vendredi 1er janvier → dernière semaine 2026
  assert.equal(getSemaineKey(new Date(2025, 11, 29)), '2026-W01') // lundi 29 déc. 2025 → semaine 1 de 2026
})

test('categoriser range par rayon', () => {
  assert.equal(categoriser('Tomates cerises'), 'Fruits & Légumes')
  assert.equal(categoriser('Filet de poulet'), 'Viandes & Poissons')
  assert.equal(categoriser("Huile d'olive"), 'Épicerie & Condiments')
  assert.equal(categoriser('Papier cuisson'), 'Divers')
})

test('validerVegetarien détecte viande et poisson', () => {
  const veg = { nom: 'Curry de lentilles', vegetarien: true, ingredients: [{ nom: 'Lentilles corail', quantite: '200 g' }] }
  assert.equal(validerVegetarien(veg), true)
  assert.equal(validerVegetarien({ ...veg, ingredients: [{ nom: 'Blanc de poulet', quantite: '300 g' }] }), false)
  assert.equal(validerVegetarien({ ...veg, vegetarien: false }), false)
})

test('validerVegetarien sans faux positifs sur les mots courts', () => {
  const r = { nom: 'Gratin en barquette', vegetarien: true, ingredients: [{ nom: 'Chou-fleur rôti', quantite: '1' }, { nom: 'Jus de citron', quantite: '1 filet' }] }
  assert.equal(validerVegetarien(r), true)
  assert.equal(validerVegetarien({ ...r, ingredients: [{ nom: 'Bar', quantite: '2 filets' }] }), false)
})

test('combinerQuantites ajuste aux portions et additionne', () => {
  assert.equal(combinerQuantites([{ valeur: '200 g', facteur: 1 }, { valeur: '100 g', facteur: 2 }]), '400 g')
  assert.equal(combinerQuantites([{ valeur: '1,5 kg', facteur: 1 }]), '1,5 kg')
  assert.equal(combinerQuantites([{ valeur: '2', facteur: 1.5 }, { valeur: 'selon goût', facteur: 1 }]), '3 + selon goût')
  assert.equal(combinerQuantites([{ valeur: '200g', facteur: 1 }, { valeur: '1 c.s.', facteur: 1 }]), '200 g + 1 c.s.')
})

test('combinerQuantites arrondit les pièces au supérieur et les grammes à l\'unité', () => {
  assert.equal(combinerQuantites([{ valeur: '3', facteur: 1.5 }, { valeur: '2', facteur: 2 }, { valeur: '1', facteur: 3.3 }]), '12')
  assert.equal(combinerQuantites([{ valeur: '300 g', facteur: 1.333 }]), '400 g')
  assert.equal(combinerQuantites([{ valeur: '1,5 kg', facteur: 1.1 }]), '1,7 kg')
})

test('quantités réelles de la capture iPhone : fractions, notes, pièces, doublons', async () => {
  const { cleIngredient, nomIngredient, lireQuantite } = await import('../js/utils.js')
  assert.equal(combinerQuantites([{ valeur: '1', facteur: 2 }, { valeur: '1/2', facteur: 2 }, { valeur: '1/2 (pour le service)', facteur: 1 }], 'citron'), '4')
  assert.equal(combinerQuantites([{ valeur: '1,5 citron', facteur: 1 }, { valeur: '1', facteur: 1 }], 'citron (jus)'), '3')
  assert.equal(combinerQuantites([{ valeur: 'quelques brins', facteur: 1 }, { valeur: 'quelques brins', facteur: 2 }], 'coriandre fraîche'), 'quelques brins')
  assert.equal(combinerQuantites([{ valeur: '1/2 c. à café', facteur: 1 }, { valeur: '1 c.c.', facteur: 1.3 }], 'coriandre poudre'), '2 c.c.')
  assert.equal(combinerQuantites([{ valeur: '1 poignée', facteur: 4.5 }], 'persil'), '4,5 poignées')
  assert.equal(combinerQuantites([{ valeur: '3 carottes moyennes', facteur: 1 }], 'carottes'), '3')
  assert.equal(lireQuantite('1 1/2 c.s.').n, 1.5)
  assert.equal(cleIngredient('Pommes de terre (coupées en cubes de 2 cm)'), cleIngredient('pomme de terre'))
  assert.equal(cleIngredient('petits pois surgelés'), cleIngredient('Petits pois'))
  assert.equal(cleIngredient('maïs en boîte (égoutté)'), cleIngredient('Maïs'))
  assert.equal(nomIngredient('persil frais (haché)'), 'Persil frais')
  assert.equal(categoriser('coriandre poudre'), 'Épicerie & Condiments')
  assert.equal(categoriser('Coriandre fraîche'), 'Fruits & Légumes')
})

test('ajouterArticlesLibres : range par partie et rayon, sans doublon avec les recettes', () => {
  const parties = { samedi: { 'Fruits & Légumes': [{ nom: 'Carotte', quantites: [] }] }, mercredi: {} }
  ajouterArticlesLibres(parties, [{ id: '1', nom: 'carottes', partie: 'samedi' }, { id: '2', nom: 'lessive', partie: 'mercredi' }])
  assert.equal(parties.samedi['Fruits & Légumes'].length, 1)
  assert.deepEqual(parties.mercredi.Divers, [{ nom: 'Lessive', quantites: [], libreId: '2' }])
})

test('separerPlacard : retire les articles du placard, garde les articles libres', () => {
  const parties = {
    samedi: { 'Épicerie & Condiments': [{ nom: 'Sel', quantites: [] }, { nom: 'Cumin', quantites: [] }] },
    mercredi: { Divers: [{ nom: 'Sel', quantites: [], libreId: 'x' }] },
  }
  const { parties: reste, auPlacard } = separerPlacard(parties, [cleIngredient('sel')])
  assert.deepEqual(reste.samedi['Épicerie & Condiments'].map(i => i.nom), ['Cumin'])
  assert.equal(reste.mercredi.Divers.length, 1)
  assert.deepEqual(auPlacard.map(i => i.nom), ['Sel'])
})

test('lireLigneIngredient sépare quantité, unité et nom', async () => {
  const { lireLigneIngredient } = await import('../js/utils.js')
  assert.deepEqual(lireLigneIngredient('400 g Tomates'), { quantite: '400 g', nom: 'Tomates' })
  assert.deepEqual(lireLigneIngredient('2 c.s. huile d\'olive'), { quantite: '2 c.s.', nom: 'huile d\'olive' })
  assert.deepEqual(lireLigneIngredient('1 pincée de sel'), { quantite: '1 pincée', nom: 'sel' })
  assert.deepEqual(lireLigneIngredient('3 carottes'), { quantite: '3', nom: 'carottes' })
  assert.deepEqual(lireLigneIngredient('½ citron'), { quantite: '½', nom: 'citron' })
  assert.deepEqual(lireLigneIngredient('1,5 kg de pommes de terre'), { quantite: '1,5 kg', nom: 'pommes de terre' })
  assert.deepEqual(lireLigneIngredient('2 gousses d\'ail'), { quantite: '2 gousses', nom: 'ail' })
  assert.deepEqual(lireLigneIngredient('- Sel'), { quantite: '', nom: 'Sel' })
  assert.equal(lireLigneIngredient('  '), null)
})

test('reparerIngredient recolle l\'unité coupée par l\'ancien formulaire', async () => {
  const { reparerIngredient } = await import('../js/utils.js')
  assert.deepEqual(reparerIngredient({ quantite: '400', nom: 'g Tomates' }), { quantite: '400 g', nom: 'Tomates' })
  assert.deepEqual(reparerIngredient({ quantite: '2', nom: 'c.s. huile d\'olive' }), { quantite: '2 c.s.', nom: 'huile d\'olive' })
  assert.deepEqual(reparerIngredient({ quantite: 'Sel', nom: '' }), { quantite: '', nom: 'Sel' })
  // Rien à réparer
  assert.deepEqual(reparerIngredient({ quantite: '400 g', nom: 'Tomates' }), { quantite: '400 g', nom: 'Tomates' })
  assert.deepEqual(reparerIngredient({ quantite: '1', nom: 'noix de coco râpée' }), { quantite: '1', nom: 'noix de coco râpée' })
  assert.deepEqual(reparerIngredient({ quantite: '2', nom: 'filets de poulet' }), { quantite: '2', nom: 'filets de poulet' })
})
