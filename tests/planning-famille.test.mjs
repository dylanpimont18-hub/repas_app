// tests/planning-famille.test.mjs — Cycle, filtres, sélection bibliothèque, décalage, courses
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creneauxDuCycle, debutCycle, groupesDuCycle, soirAssocie, creneauCourant, cleCycle } from '../js/cycle.js'
import { contientViande, contientInterdit, contientFeculent, passeFiltres, scoreStyle } from '../js/filtres.js'
import { construireIndexPrefs, evaluer, nouveauContexte, remplirCycle, decalerEnCascade, candidats } from '../js/selection.js'
import { repartirCourses } from '../js/utils.js'

const SAMEDI = new Date(2026, 9, 24) // samedi 24 octobre 2026
const C = creneauxDuCycle(SAMEDI)
const trouver = (jour, moment) => C.find(c => c.jour === jour && c.moment === moment)

// ── Cycle ────────────────────────────────────────────────────────────
test('le cycle va du samedi soir au samedi midi suivant (14 créneaux)', () => {
  assert.equal(C.length, 14)
  assert.deepEqual([C[0].jour, C[0].moment], ['samedi', 'soir'])
  assert.deepEqual([C[13].jour, C[13].moment], ['samedi', 'midi'])
  assert.equal(C[13].date.getDate(), 31)
})

test('debutCycle : un mercredi ou un samedi renvoient le bon samedi', () => {
  assert.equal(debutCycle(new Date(2026, 9, 28)).getDate(), 24)
  assert.equal(debutCycle(new Date(2026, 9, 24, 9)).getDate(), 24)
  assert.equal(debutCycle(new Date(2026, 9, 23)).getDate(), 17)
  assert.equal(cleCycle(SAMEDI), '2026-W43-C')
})

test('portions, profils et sessions du modèle par défaut', () => {
  assert.equal(trouver('lundi', 'midi').portions, 1)
  assert.deepEqual(trouver('lundi', 'midi').profils, ['femme'])
  assert.equal(trouver('lundi', 'soir').portions, 4)
  assert.equal(trouver('mercredi', 'midi').portions, 4)
  assert.equal(trouver('mardi', 'soir').enSession, true)
  assert.equal(trouver('mardi', 'soir').joursConservation, 2)
  assert.equal(trouver('jeudi', 'midi').joursConservation, 1)
  assert.equal(trouver('samedi', 'midi').enSession, false)
  assert.equal(trouver('dimanche', 'soir').enSession, false)
})

test('parties de courses : samedi jusqu\'au mardi, mercredi ensuite', () => {
  assert.equal(trouver('mardi', 'soir').partie, 'samedi')
  assert.equal(trouver('mercredi', 'midi').partie, 'mercredi')
  assert.equal(trouver('samedi', 'midi').partie, 'mercredi')
})

test('groupes : sessions dimanche et mercredi regroupées', () => {
  const titres = groupesDuCycle(C).map(g => g.titre)
  assert.ok(titres.some(t => t.includes('Préparé dimanche → Lundi · Mardi')))
  assert.ok(titres.some(t => t.includes('Préparé mercredi → Jeudi · Vendredi')))
  assert.equal(titres.length, 6) // sam soir, dim, session dim, mer, session mer, sam midi
})

test('soirAssocie : mardi midi reprend lundi soir, lundi midi reprend mardi soir', () => {
  assert.equal(soirAssocie(C, trouver('mardi', 'midi')).cle, trouver('lundi', 'soir').cle)
  assert.equal(soirAssocie(C, trouver('lundi', 'midi')).cle, trouver('mardi', 'soir').cle)
  assert.equal(soirAssocie(C, trouver('mercredi', 'midi')), null)
})

test('creneauCourant : midi, soir, puis lendemain midi après 21h', () => {
  assert.equal(creneauCourant(C, new Date(2026, 9, 26, 11)).cle, trouver('lundi', 'midi').cle)
  assert.equal(creneauCourant(C, new Date(2026, 9, 26, 18)).cle, trouver('lundi', 'soir').cle)
  assert.equal(creneauCourant(C, new Date(2026, 9, 26, 22)).cle, trouver('mardi', 'midi').cle)
})

// ── Filtres ──────────────────────────────────────────────────────────
const curry = { id: 'curry', nom: 'Curry japonais', cuisine: 'japonaise', tags: ['réconfortant'], conservation_jours: 3,
  composants: { base: 'Riz japonais', principal: 'Sauce curry', proteine: 'Cuisses de poulet', legumes: ['Carotte', 'Pomme de terre'] },
  ingredients: [{ nom: 'Riz japonais', quantite: '400 g' }, { nom: 'Cuisses de poulet', quantite: '600 g' }, { nom: 'Carottes', quantite: '3' }] }
const soupe = { id: 'soupe', nom: 'Soupe de lentilles corail', cuisine: 'marocaine', tags: ['bouillon', 'healthy'], conservation_jours: 3,
  composants: { base: null, principal: 'Soupe', proteine: 'Lentilles corail', legumes: ['Carotte', 'Oignon'] },
  ingredients: [{ nom: 'Lentilles corail', quantite: '250 g' }, { nom: 'Carottes', quantite: '2' }, { nom: 'Oignon haché', quantite: '1' }] }
const gratin = { id: 'gratin', nom: 'Gratin de courgettes', tags: ['healthy'], conservation_jours: 2,
  composants: { base: null, principal: 'Gratin', proteine: 'Œufs', legumes: ['Courgette'] },
  ingredients: [{ nom: 'Courgettes', quantite: '3' }, { nom: 'Œufs', quantite: '3' }] }

test('détections : viande, féculent, halal (vinaigre de vin toléré)', () => {
  assert.equal(contientViande(curry), true)
  assert.equal(contientViande(soupe), false)   // « oignon haché » n'est pas de la viande
  assert.equal(contientFeculent(curry), true)
  assert.equal(contientFeculent(soupe), false)
  assert.equal(contientInterdit({ nom: 'Pâtes', ingredients: [{ nom: 'Lardons' }] }), true)
  assert.equal(contientInterdit({ nom: 'Salade', ingredients: [{ nom: 'Vinaigre de vin rouge' }] }), false)
  assert.equal(contientInterdit({ nom: 'Bœuf bourguignon', ingredients: [{ nom: 'Vin rouge' }] }), true)
})

test('filtres combinés et style libre', () => {
  assert.equal(passeFiltres(soupe, ['sansViande', 'sansFeculents', 'bouillon']), true)
  assert.equal(passeFiltres(curry, ['sansViande']), false)
  assert.ok(scoreStyle(curry, 'asiatique') > 0)
  assert.ok(scoreStyle(soupe, 'maghrébin') > 0)
  assert.equal(scoreStyle(gratin, 'asiatique'), 0)
})

// ── Sélection ────────────────────────────────────────────────────────
const ingredients = [
  { id: 'courgette', nom: 'Courgette', categorie: 'legumes' },
  { id: 'poulet', nom: 'Poulet', categorie: 'viandes' },
  { id: 'lentilles', nom: 'Lentilles corail', categorie: 'feculents' },
]
const debut = SAMEDI.getTime()

test('une recette adorée passe devant une neutre', () => {
  const idx = construireIndexPrefs(ingredients, { dylan: { poulet: 'j_adore' }, femme: {} })
  const ctx = nouveauContexte({ indexPrefs: idx, debut })
  const [premier] = candidats([soupe, curry], trouver('dimanche', 'soir'), ctx)
  assert.equal(premier.recette.id, 'curry')
})

test('« Je n\'aime pas » de Dylan exclut ; légume de la femme exclu sauf s\'il est caché', () => {
  const idx = construireIndexPrefs(ingredients, { dylan: { lentilles: 'j_aime_pas' }, femme: { courgette: 'j_aime_pas' } })
  const ctx = nouveauContexte({ indexPrefs: idx, debut })
  assert.equal(evaluer(soupe, trouver('dimanche', 'soir'), ctx), null)              // Dylan mange → exclue
  assert.notEqual(evaluer(soupe, trouver('lundi', 'midi'), ctx), null)               // femme seule → OK
  assert.equal(evaluer(gratin, trouver('dimanche', 'soir'), ctx), null)              // courgette visible
  const gratinCache = { ...gratin, legumes_caches: [{ legume: 'Courgette', astuce: 'Mixer dans la béchamel' }] }
  assert.notEqual(evaluer(gratinCache, trouver('dimanche', 'soir'), ctx), null)
})

test('rotation : une recette mangée il y a 10 jours est exclue', () => {
  const ctx = nouveauContexte({ indexPrefs: [], debut, historique: { curry: debut - 10 * 86400000 } })
  assert.equal(evaluer(curry, trouver('dimanche', 'soir'), ctx), null)
})

test('conservation : un plat qui tient 1 jour ne va pas sur mardi soir', () => {
  const ctx = nouveauContexte({ indexPrefs: [], debut })
  assert.equal(evaluer({ ...gratin, conservation_jours: 1 }, trouver('mardi', 'soir'), ctx), null)
  assert.notEqual(evaluer({ ...gratin, conservation_jours: 1 }, trouver('dimanche', 'soir'), ctx), null)
})

test('réutilisation : on préfère une recette qui partage des ingrédients frais', () => {
  const ctx = nouveauContexte({ indexPrefs: [], debut, dejaChoisies: [curry] })
  const [premier] = candidats([gratin, soupe], trouver('dimanche', 'soir'), ctx)
  assert.equal(premier.recette.id, 'soupe') // carottes en commun avec le curry
})

test('remplirCycle : restes pour les midis de session, réserve en priorité, créneaux vides signalés', () => {
  const r = remplirCycle({
    creneaux: C, aRemplir: [trouver('lundi', 'soir').cle, trouver('mardi', 'midi').cle, trouver('dimanche', 'soir').cle, trouver('mercredi', 'soir').cle],
    recettes: [curry, soupe], reserve: [{ id: 'z1', recette: gratin, portions: 4 }],
    indexPrefs: [], debut,
  })
  const par = Object.fromEntries(r.propositions.map(p => [p.cle, p]))
  assert.equal(par[trouver('dimanche', 'soir').cle].source, 'reserve')
  const lundiSoir = par[trouver('lundi', 'soir').cle]
  assert.equal(par[trouver('mardi', 'midi').cle].source, 'reste')
  assert.equal(par[trouver('mardi', 'midi').cle].recette.id, lundiSoir.recette.id)
  assert.equal(r.vides.length, 0)
  const r2 = remplirCycle({ creneaux: C, aRemplir: [trouver('lundi', 'soir').cle, trouver('mercredi', 'soir').cle, trouver('jeudi', 'soir').cle], recettes: [curry], indexPrefs: [], debut })
  assert.equal(r2.vides.length, 2)
})

// ── Décalage en cascade ──────────────────────────────────────────────
test('decalerEnCascade : le plat prévu glisse au repas suivant compatible, le dernier sort', () => {
  const ls = trouver('lundi', 'soir'), mm = trouver('mardi', 'midi'), ms = trouver('mardi', 'soir')
  const plan = { [ls.cle]: { recetteId: 'gratin', source: 'biblio' }, [ms.cle]: { recetteId: 'soupe', source: 'biblio' } }
  const sub = C.slice(C.indexOf(ls), C.indexOf(ms) + 1) // lun soir, mar midi, mar soir
  const { changements, sortant } = decalerEnCascade(sub, plan, ls.cle, { recetteId: 'chorba', source: 'biblio' })
  assert.deepEqual(changements.map(c => [c.cle, c.recetteId]), [[ls.cle, 'chorba'], [ms.cle, 'gratin']]) // saute mardi midi (1 portion)
  assert.deepEqual(sortant, { recetteId: 'soupe', portions: 4 })
  assert.ok(!changements.some(c => c.cle === mm.cle))
})

// ── Courses ──────────────────────────────────────────────────────────
test('repartirCourses : un ingrédient des deux parties va le samedi, en quantité totale', () => {
  const r = repartirCourses([
    { partie: 'samedi', nom: 'Carottes', quantite: '3', facteur: 1 },
    { partie: 'mercredi', nom: 'carottes', quantite: '2', facteur: 1 },
    { partie: 'mercredi', nom: 'Riz', quantite: '400 g', facteur: 1 },
  ])
  assert.equal(r.samedi['Fruits & Légumes'][0].quantites.length, 2)
  assert.equal(r.mercredi['Féculents'][0].nom, 'Riz')
  assert.equal(r.mercredi['Fruits & Légumes'], undefined)
})

test('dateDeSemaine retrouve la date d\'un jour ISO', async () => {
  const { dateDeSemaine } = await import('../js/cycle.js')
  assert.equal(dateDeSemaine('2026-W43', 'samedi').getDate(), 24)
  assert.equal(dateDeSemaine('2026-W01', 'lundi').getDate(), 29) // lundi 29 décembre 2025
})

test('préférence la plus précise : « Poulet (cuisse) » détesté n\'exclut pas « Poulet (filet) » ; « Escalope de dinde » adorée passe malgré « Dinde » détestée', () => {
  const ings = [
    { id: 'poulet_filet', nom: 'Poulet (filet)', categorie: 'viandes' },
    { id: 'poulet_cuisse', nom: 'Poulet (cuisse)', categorie: 'viandes' },
    { id: 'dinde', nom: 'Dinde', categorie: 'viandes' },
    { id: 'escalope_dinde', nom: 'Escalope de dinde', categorie: 'viandes' },
  ]
  const idx = construireIndexPrefs(ings, { dylan: {}, femme: { poulet_filet: 'j_adore', poulet_cuisse: 'j_aime_pas', dinde: 'j_aime_pas', escalope_dinde: 'j_adore' } })
  const ctx = nouveauContexte({ indexPrefs: idx, debut })
  const c = trouver('dimanche', 'soir')
  const r = (nom, ing) => ({ id: nom, nom, ingredients: [{ nom: ing, quantite: '1' }] })
  assert.notEqual(evaluer(r('Poulet citron', 'Poulet (filet)'), c, ctx), null)
  assert.equal(evaluer(r('Poulet rôti', 'Cuisses de poulet'), c, ctx), null)
  assert.notEqual(evaluer(r('Couscous', 'Escalope de dinde'), c, ctx), null)
  assert.equal(evaluer(r('Rôti', 'Rôti de dinde'), c, ctx), null)
})

test('envies espacées : 2 bouillons sur des jours différents, le soir', async () => {
  const { repartirEnvies } = await import('../js/selection.js')
  const r = repartirEnvies(C, [{ id: 'bouillon', nb: 2, suite: false }])
  const cles = Object.keys(r)
  assert.equal(cles.length, 2)
  const choisis = C.filter(c => cles.includes(c.cle))
  assert.ok(choisis.every(c => c.moment === 'soir'))
  assert.ok(Math.abs(choisis[1].date - choisis[0].date) >= 2 * 86400000) // pas deux jours de suite
})

test('envies à la suite : 3 repas familiaux consécutifs', async () => {
  const { repartirEnvies } = await import('../js/selection.js')
  const r = repartirEnvies(C, [{ id: 'bouillon', nb: 3, suite: true }])
  const idx = C.filter(c => r[c.cle]).map(c => C.filter(x => x.portions > 1).indexOf(c))
  assert.deepEqual(idx, [idx[0], idx[0] + 1, idx[0] + 2])
})

test('remplirCycle avec envie : le bouillon seulement sur ses repas, pas tous les soirs', () => {
  const autres = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'].map(id => ({ id, nom: `Plat ${id}`, conservation_jours: 3, tags: [],
    ingredients: [{ nom: `Ingrédient ${id}`, quantite: '1' }] }))
  const bouillons = ['b1', 'b2', 'b3'].map(id => ({ id, nom: `Soupe ${id}`, conservation_jours: 3, tags: ['bouillon'],
    ingredients: [{ nom: `Légume ${id}`, quantite: '1' }] }))
  const soirs = C.filter(c => c.moment === 'soir' && !c.enSession).map(c => c.cle)
  const r = remplirCycle({ creneaux: C, aRemplir: soirs, recettes: [...bouillons, ...autres], indexPrefs: [], debut,
    envies: [{ id: 'bouillon', nb: 1, suite: false }] })
  const nbBouillon = r.propositions.filter(p => p.recette.tags.includes('bouillon')).length
  assert.equal(soirs.length, 3)
  assert.equal(nbBouillon, 1)
})
