// tests/placard.test.mjs — « Vider le placard » : saisie de l'inventaire, recettes qui l'utilisent, répartition pour l'IA
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lireInventaire, fusionnerInventaire, utilise, couverture, choisirDansBibliotheque,
         nbRecettesConseille, repartirArticles, libelleArticle } from '../js/placard.js'
import { construireIndexPrefs } from '../js/selection.js'

const sans = l => l.map(({ nom, quantite }) => ({ nom, quantite }))

test('lireInventaire : une ligne ou une virgule par article, quantité avant ou après', () => {
  assert.deepEqual(sans(lireInventaire('2 boîtes de pois chiches\nriz basmati 500 g, lentilles corail\n- 1 kg de farine\nThon x3')), [
    { nom: 'Pois chiches', quantite: '2 boîtes' },
    { nom: 'Riz basmati', quantite: '500 g' },
    { nom: 'Lentilles corail', quantite: '' },
    { nom: 'Farine', quantite: '1 kg' },
    { nom: 'Thon', quantite: '3' },
  ])
  assert.deepEqual(lireInventaire('  \n'), [])
})

test('fusionnerInventaire : pas de doublon, la nouvelle quantité remplace l\'ancienne', () => {
  const a = lireInventaire('riz 500 g\nlentilles')
  const b = fusionnerInventaire(a, lireInventaire('Riz 1 kg\npâtes'))
  assert.deepEqual(sans(b), [{ nom: 'Riz', quantite: '1 kg' }, { nom: 'Lentilles', quantite: '' }, { nom: 'Pâtes', quantite: '' }])
  assert.equal(b[0].id, a[0].id)
})

const R = (id, nom, ...ings) => ({ id, nom, ingredients: ings.map(n => ({ nom: n, quantite: '1' })) })
const recettes = [
  R('houmous', 'Houmous maison', 'Pois chiches', 'Tahini', 'Citron'),
  R('dahl', 'Dahl de lentilles', 'Lentilles corail', 'Lait de coco', 'Riz basmati', 'Curry'),
  R('pates', 'Pâtes au thon', 'Pâtes', 'Thon', 'Tomates concassées'),
  R('salade', 'Salade de riz', 'Riz', 'Thon', 'Maïs'),
  R('carbo', 'Pâtes carbonara', 'Pâtes', 'Lardons', 'Crème'),
]
const inventaire = lireInventaire('pois chiches en boîte\nriz basmati 500 g\nlentilles corail\nthon 2 boîtes\npâtes 1 kg\nlait de coco\nsucre')

test('utilise : reconnaît l\'article malgré l\'emballage ou la variété', () => {
  const [pois, riz] = inventaire
  assert.equal(utilise(recettes[0], pois), true)          // « pois chiches en boîte » ↔ « Pois chiches »
  assert.equal(utilise(recettes[3], riz), true)           // « riz basmati » ↔ « Riz »
  assert.equal(utilise(recettes[2], pois), false)
  // « Lait » d'une recette n'est pas le « lait de coco » du placard
  const coco = lireInventaire('lait de coco')[0]
  assert.equal(utilise(R('x', 'Flan', 'Lait', 'Œufs'), coco), false)
  assert.equal(utilise(recettes[1], coco), true)
})

test('couverture : articles utilisés et restants', () => {
  const c = couverture(inventaire, recettes.slice(0, 2))
  assert.deepEqual(c.restants.map(i => i.nom), ['Thon', 'Pâtes', 'Sucre'])
})

test('choisirDansBibliotheque : vide le plus possible, sans recette non halal ni détestée', () => {
  const index = construireIndexPrefs([{ id: 'tahini', nom: 'Tahini', categorie: 'epices' }], { femme: { tahini: 'j_aime_pas' } })
  const choix = choisirDansBibliotheque(inventaire, recettes, { indexPrefs: index })
  const ids = choix.map(c => c.recette.id)
  assert.ok(!ids.includes('carbo'), 'carbonara (lardons) proposée')
  assert.ok(!ids.includes('houmous'), 'houmous (tahini détesté) proposé')
  assert.equal(ids[0], 'dahl')  // 3 articles du placard : lentilles, lait de coco, riz
  assert.ok(ids.includes('pates'))
})

test('nbRecettesConseille et repartirArticles : tout est réparti, rayons variés', () => {
  assert.equal(nbRecettesConseille(0), 0)
  assert.equal(nbRecettesConseille(7), 3)
  assert.equal(nbRecettesConseille(100), 15)
  const items = lireInventaire('riz\npâtes\nthon\npoulet\ncarottes\ncourgettes\ncumin')
  const groupes = repartirArticles(items, 3)
  assert.equal(groupes.length, 3)
  assert.equal(groupes.flat().length, 7)
  // Chaque groupe reçoit d'abord un féculent ou une protéine différente
  assert.notEqual(groupes[0][0].nom, groupes[1][0].nom)
  assert.equal(libelleArticle({ nom: 'Riz', quantite: '500 g' }), 'Riz (500 g)')
})

test('retirerCeQuiEstALaMaison : la liste de courses ne redemande pas ce qui est dans le placard', async () => {
  const { retirerCeQuiEstALaMaison } = await import('../js/placard.js')
  const parties = {
    samedi: { 'Féculents': [{ nom: 'Riz', quantites: [{ valeur: '300 g' }] }, { nom: 'Pâtes', quantites: [] }],
      'Laitiers & Œufs': [{ nom: 'Lait', quantites: [] }] },
    mercredi: { Divers: [{ nom: 'Pois chiches', quantites: [], libreId: 'x' }] },
  }
  const inv = lireInventaire('riz basmati 500 g\nlait de coco\npois chiches')
  const { parties: reste, aLaMaison } = retirerCeQuiEstALaMaison(parties, inv)
  assert.deepEqual(reste.samedi['Féculents'].map(i => i.nom), ['Pâtes'])
  assert.equal(reste.samedi['Laitiers & Œufs'].length, 1)        // « lait » ≠ « lait de coco »
  assert.equal(reste.mercredi.Divers.length, 1)                   // ajouté à la main : reste
  assert.deepEqual(aLaMaison.map(i => [i.nom, i.stock]), [['Riz', 'Riz basmati (500 g)']])
})
