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

test('sansRecettesPlacard : le planning ne propose pas les recettes du livre « Vider le placard »', async () => {
  const { sansRecettesPlacard } = await import('../js/placard.js')
  const livres = [{ id: 'l1', nom: 'Vider le placard' }, { id: 'l2', nom: 'Air fryer' }]
  const r = [{ id: 'a', livre_id: 'l1' }, { id: 'b', livre_id: 'l2' }, { id: 'c', livre_id: null }]
  assert.deepEqual(sansRecettesPlacard(r, livres).map(x => x.id), ['b', 'c'])
  assert.equal(sansRecettesPlacard(r, []).length, 3)
})

test('markdownPlacard : inventaire coché, recettes avec ingrédients pondérés, restants', async () => {
  const { markdownPlacard } = await import('../js/placard.js')
  const inv = lireInventaire('riz basmati 500 g\nsucre')
  const r = { id: 'x', nom: 'Salade de riz', portions: 4, temps_prep: 10, temps_cuisson: 15,
    ingredients: [{ nom: 'Riz', quantite: '300 g' }, { nom: 'Thon', quantite: '2 boîtes' }], etapes: ['Cuire le riz.', 'Mélanger.'] }
  const md = markdownPlacard(inv, [r], { titre: 'Placard', portions: 2 })
  assert.match(md, /^# Placard\n\n## Mon placard \(2\)\n\n- \[x\] Riz basmati — 500 g\n- \[ \] Sucre\n/)
  assert.match(md, /## Recettes retenues \(1\) — 1 \/ 2 articles utilisés/)
  assert.match(md, /### Salade de riz\n\n- \*\*Utilise :\*\* Riz basmati\n- \*\*À acheter :\*\* Thon\n- \*\*Temps :\*\* 25 min/)
  assert.match(md, /\*\*Ingrédients \(2 pers\.\)\*\*\n\n- 150 g Riz\n- 1 boîte Thon/)
  assert.match(md, /1\. Cuire le riz\.\n2\. Mélanger\./)
  assert.match(md, /## Pas encore utilisés\n\n- Sucre\n$/)
})

test('jamais une recette fourre-tout : au plus 4 articles du placard attribués par recette', async () => {
  const { repartirArticles, nbRecettesMinimum, nbRecettesConseille, recetteFourreTout } = await import('../js/placard.js')
  const vingt = lireInventaire(Array.from({ length: 20 }, (_, i) => `article${i}`).join('\n'))
  // Même si on demande 1 recette, l'appli n'en fait pas une avec les 20 articles
  assert.equal(nbRecettesMinimum(20), 5)
  assert.equal(nbRecettesConseille(20), 7)
  assert.ok(repartirArticles(vingt, 1)[0].length <= 4)
  assert.ok(repartirArticles(vingt, 7).every(g => g.length <= 4))
  assert.equal(repartirArticles(vingt, 7).flat().length, 20)
  // Au-delà de 15 recettes × 4 articles, le surplus attend le passage suivant
  const cent = lireInventaire(Array.from({ length: 100 }, (_, i) => `produit${i}`).join('\n'))
  const g = repartirArticles(cent, 30)
  assert.equal(g.length, 15)
  assert.equal(g.flat().length, 60)
  // Une recette qui utilise presque tout le placard est repérée
  const inv = lireInventaire('riz\npâtes\nthon\npois chiches\nlentilles\nmaïs\ncarottes\nfarine')
  const tout = { nom: 'Tout le placard', ingredients: inv.map(i => ({ nom: i.nom, quantite: '1' })) }
  const normal = { nom: 'Salade de riz au thon', ingredients: [{ nom: 'Riz' }, { nom: 'Thon' }, { nom: 'Maïs' }, { nom: 'Tomates' }] }
  assert.equal(recetteFourreTout(tout, inv, inv.slice(0, 3)), true)
  assert.equal(recetteFourreTout(normal, inv, inv.slice(0, 3)), false)
})

// ── Correctifs de l'audit du placard (docs/audit/2026-10-28-audit-placard.md) ──

test('P1 — pas de faux positifs de correspondance, synonymes reconnus', () => {
  const ok = (article, ingredient) => utilise({ ingredients: [{ nom: ingredient }] }, lireInventaire(article)[0])
  for (const [a, i] of [['Riz', 'Vinaigre de riz'], ['Poulet', 'Bouillon de poulet'], ['Pâtes', 'Pâte feuilletée'],
    ['Coco râpée', 'Lait de coco'], ['Pois chiches', 'Farine de pois chiches'], ['Maïs', 'Fécule de maïs'],
    ['Sucre', 'Sucre glace'], ['Concentré de tomate', 'Tomates'], ['Lait de coco', 'Lait'], ['Lentilles corail', 'Lentilles vertes']]) {
    assert.equal(ok(a, i), false, `${a} ↔ ${i}`)
  }
  for (const [a, i] of [['Riz basmati', 'Riz'], ['Riz', 'Riz basmati'], ['Pois chiches en boîte', 'Pois chiches'],
    ['Tomates pelées', 'Tomates'], ['Steaks hachés', 'Viande hachée'], ['Spaghetti', 'Pâtes'], ['Lait de coco', 'Lait de coco']]) {
    assert.equal(ok(a, i), true, `${a} ↔ ${i}`)
  }
})

test('P2 — saisie : décimales, multiplicateurs, conditionnements, « et », préfixes', () => {
  const lu = t => lireInventaire(t).map(i => [i.nom, i.quantite])
  assert.deepEqual(lu('lait 1,5 L'), [['Lait', '1,5 L']])
  assert.deepEqual(lu('2x lait de coco'), [['Lait de coco', '2']])
  assert.deepEqual(lu('1/2 paquet de farine'), [['Farine', '1/2 paquet']])
  assert.deepEqual(lu('pâtes 3 paquets de 500 g'), [['Pâtes', '3 paquets de 500 g']])
  assert.deepEqual(lu('riz, pâtes et semoule'), [['Riz', ''], ['Pâtes', ''], ['Semoule', '']])
  assert.deepEqual(lu('épices : cumin, paprika'), [['Cumin', ''], ['Paprika', '']])
  assert.deepEqual(lu('paquet de farine'), [['Farine', 'paquet']])
  // Nom de la base d'ingrédients quand c'est le même article
  assert.deepEqual(lireInventaire('pois chiche', { noms: ['Pois chiches'] }).map(i => i.nom), ['Pois chiches'])
})

test('P4 — article pas halal ou détesté repéré dès la saisie (légume à cacher accepté)', async () => {
  const { statutArticle } = await import('../js/placard.js')
  const index = construireIndexPrefs([
    { id: 'thon', nom: 'Thon', categorie: 'viandes' }, { id: 'courgette', nom: 'Courgette', categorie: 'legumes' },
    { id: 'olive', nom: 'Olives', categorie: 'divers' }],
  { femme: { thon: 'j_aime_pas', courgette: 'j_aime_pas' }, dylan: { olive: 'j_aime_pas' } })
  const st = n => statutArticle(lireInventaire(n)[0], index)?.raison || null
  assert.equal(st('lardons'), 'pas halal')
  assert.equal(st('vin rouge'), 'pas halal')
  assert.equal(st('thon 2 boîtes'), 'Ma femme n\'aime pas')
  assert.equal(st('olives vertes'), 'Dylan n\'aime pas')
  assert.equal(st('courgettes'), null)   // légume à cacher : utilisable
  assert.equal(st('riz'), null)
})

test('P5 — chaque recette IA a une vraie base, les épices viennent en complément (2 au plus)', async () => {
  const { estBase, nbBases } = await import('../js/placard.js')
  const inv = lireInventaire('cumin\npaprika\ncurry\ncannelle\nmoutarde\nsauce soja\nvinaigre balsamique\nriz\nlentilles\nthon\nfarine')
  assert.equal(nbBases(inv), 4)
  const groupes = repartirArticles(inv, nbRecettesConseille(nbBases(inv)))
  for (const g of groupes) {
    assert.ok(g.some(estBase), `groupe sans base : ${g.map(i => i.nom)}`)
    assert.ok(g.filter(i => !estBase(i)).length <= 2)
  }
  // Seulement des épices : elles servent de base
  assert.ok(repartirArticles(lireInventaire('cumin, paprika, curry'), 1)[0].length === 3)
})

test('P5 bis — « à finir vite » passe en premier dans les recettes IA', () => {
  const inv = lireInventaire('riz\npâtes\nsemoule\nquinoa\nboulgour\nlentilles')
  inv[5].vite = true
  const [premier] = repartirArticles(inv, 1)
  assert.equal(premier[0].nom, 'Lentilles')
})

test('P6 — deux téléphones modifient l\'inventaire en même temps : rien n\'est perdu', async () => {
  const { fusionnerModifications } = await import('../js/placard.js')
  const base = lireInventaire('riz 500 g\npâtes')
  const ici = [...base.map(i => (i.nom === 'Riz' ? { ...i, quantite: '300 g' } : i)), ...lireInventaire('thon')]     // quantité changée + ajout
  const serveur = [...base.filter(i => i.nom !== 'Pâtes'), ...lireInventaire('farine')]                                  // l'autre a retiré les pâtes, ajouté farine
  const res = fusionnerModifications(base, ici, serveur)
  assert.deepEqual(res.map(i => [i.nom, i.quantite]), [['Riz', '300 g'], ['Farine', ''], ['Thon', '']])
})

test('m2 — une recette existante qui utilise un seul article de base est retenue (pas pour une seule épice)', () => {
  const inv = lireInventaire('semoule\ncumin')
  const r = [R('a', 'Taboulé', 'Semoule', 'Tomates', 'Menthe'), R('b', 'Pois chiches grillés', 'Pois chiches', 'Cumin')]
  assert.deepEqual(choisirDansBibliotheque(inv, r).map(c => c.recette.id), ['a'])
})

test('m4 — quantités : un article en partie utilisé reste à placer avec ce qui reste', async () => {
  const { quantiteEnBase, texteQuantite } = await import('../js/placard.js')
  assert.deepEqual(quantiteEnBase('1,5 kg'), { n: 1500, unite: 'g' })
  assert.deepEqual(quantiteEnBase('2 boîtes'), { n: 2, unite: 'boite' })
  assert.deepEqual(quantiteEnBase('3 × 500 g'), { n: 1500, unite: 'g' })
  assert.equal(texteQuantite({ n: 700, unite: 'g' }), '700 g')
  const inv = lireInventaire('pâtes 1 kg\nthon 2 boîtes')
  const recette = { id: 'p', nom: 'Pâtes au thon', portions: 4, ingredients: [{ nom: 'Pâtes', quantite: '300 g' }, { nom: 'Thon', quantite: '2 boîtes' }] }
  const c = couverture(inv, [recette], { portions: 4 })
  assert.equal(c.partiels.get(inv[0].id).reste, '700 g')
  assert.deepEqual(c.restants.map(i => [i.nom, i.quantite]), [['Pâtes', '700 g']])
  // Sans les portions (export, ancienne vue) : utilisé = utilisé
  assert.equal(couverture(inv, [recette]).restants.length, 0)
})

test('P3 — cuisiné : seuls les articles de cette recette sortent (ou baissent)', async () => {
  const { apresCuisson } = await import('../js/placard.js')
  const inv = lireInventaire('pâtes 1 kg\nthon 2 boîtes\nriz\ncurry')
  const pates = { id: 'p', nom: 'Pâtes au thon', portions: 4, ingredients: [{ nom: 'Pâtes', quantite: '400 g' }, { nom: 'Thon', quantite: '2 boîtes' }, { nom: 'Curry', quantite: '1 c.c.' }] }
  const riz = { id: 'r', nom: 'Riz au curry', portions: 4, ingredients: [{ nom: 'Riz', quantite: '300 g' }, { nom: 'Curry', quantite: '2 c.c.' }] }
  const { inventaire, retires, diminues } = apresCuisson(inv, pates, 4, [pates, riz])
  assert.deepEqual(inventaire.map(i => [i.nom, i.quantite]), [['Pâtes', '600 g'], ['Riz', ''], ['Curry', '']])
  assert.deepEqual(retires, ['Thon'])
  assert.deepEqual(diminues, [{ nom: 'Pâtes', quantite: '600 g' }])
})

test('Ordre conseillé : « à finir vite » d\'abord, puis les produits frais', async () => {
  const { ordreConseille } = await import('../js/placard.js')
  const inv = lireInventaire('riz\npoulet\ncrème fraîche')
  inv[2].vite = true
  const rs = [R('a', 'Riz cantonais', 'Riz'), R('b', 'Poulet rôti', 'Poulet'), R('c', 'Gratin', 'Crème fraîche', 'Riz')]
  const { recettes, prioritaires } = ordreConseille(rs, inv)
  assert.deepEqual(recettes.map(r => r.id), ['c', 'b', 'a'])
  assert.deepEqual([...prioritaires], ['c'])
})

test('Saisie : nom ambigu de la base laissé tel que saisi', () => {
  assert.deepEqual(lireInventaire('thon', { noms: ['Thon (boîte)', 'Thon frais'] }).map(i => i.nom), ['Thon'])
  assert.deepEqual(lireInventaire('thon', { noms: ['Thon (boîte)'] }).map(i => i.nom), ['Thon (boîte)'])
})
