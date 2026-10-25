// tests/credit-ia.test.mjs — Coûts, période, estimation, codes d'erreur, récupération d'une réponse tronquée
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coutTokens, decouperLots, debutPeriode, finPeriode, estimerGeneration, resumeCredit,
         codeErreurHttp, expliquerErreur, extraireRepasComplets, formatDollars, coutImage, moyennes } from '../js/credit-ia.js'

test('coût : 2 $ / M en entrée, 10 $ / M en sortie', () => {
  assert.equal(coutTokens(1_000_000, 0), 2)
  assert.equal(coutTokens(0, 1_000_000), 10)
  assert.ok(Math.abs(coutTokens(3000, 2700) - 0.033) < 1e-9)
})

test('lots de 3 recettes', () => {
  assert.deepEqual(decouperLots([1, 2, 3, 4, 5, 6, 7]).map(l => l.length), [3, 3, 1])
})

test('période : rechargé le 15 → du 15 au 15 du mois suivant', () => {
  assert.equal(debutPeriode(new Date(2026, 9, 25), 15).getTime(), new Date(2026, 9, 15).getTime())
  assert.equal(debutPeriode(new Date(2026, 9, 10), 15).getTime(), new Date(2026, 8, 15).getTime())
  assert.equal(finPeriode(new Date(2026, 9, 10), 15).getTime(), new Date(2026, 9, 15).getTime())
  assert.equal(debutPeriode(new Date(2026, 0, 3), 5).getTime(), new Date(2025, 11, 5).getTime())
})

test('estimation : un prompt par lot + sortie par recette', () => {
  const { cout, appels } = estimerGeneration(6)
  assert.equal(appels, 2)
  assert.ok(Math.abs(cout - coutTokens(6000, 5400)) < 1e-9)
  assert.equal(estimerGeneration(0).cout, 0)
})

test('estimation calibrée sur le journal dès 3 appels réussis', () => {
  const l = { action: 'generation', statut: 'ok', nb_recettes: 3, tokens_entree: 4000, tokens_sortie: 1500, estime: false }
  const { cout } = estimerGeneration(3, [l, l, l])
  assert.ok(Math.abs(cout - coutTokens(4000, 1500)) < 1e-9)
})

test('résumé : dépense de la période, reste et recalage', () => {
  const maintenant = new Date(2026, 9, 25)
  const lignes = [
    { cree_le: new Date(2026, 9, 20).toISOString(), cout: 0.5, statut: 'ok' },
    { cree_le: new Date(2026, 9, 24).toISOString(), cout: 0.25, statut: 'erreur' },
    { cree_le: new Date(2026, 8, 20).toISOString(), cout: 3, statut: 'ok' }, // période précédente
  ]
  const r = resumeCredit(lignes, { montant: 4, jour: 1, recalage: null }, maintenant)
  assert.equal(r.depense, 0.75)
  assert.equal(r.reste, 3.25)
  assert.equal(r.nbAppels, 2)
  assert.equal(r.nbErreurs, 1)

  const recale = resumeCredit(lignes, { montant: 4, jour: 1, recalage: { reste: 2, le: new Date(2026, 9, 22).toISOString() } }, maintenant)
  assert.equal(recale.reste, 1.75) // 2 $ au 22, moins l'appel du 24
  const ancien = resumeCredit(lignes, { montant: 4, jour: 1, recalage: { reste: 1, le: new Date(2026, 8, 2).toISOString() } }, maintenant)
  assert.equal(ancien.reste, 3.25) // recalage d'une période passée ignoré
})

test('codes d\'erreur : crédit épuisé, clé, limites, session', () => {
  assert.equal(codeErreurHttp(402, { error: 'ERREUR_IA' }), 'CREDIT_EPUISE')
  assert.equal(codeErreurHttp(400, { error: 'ERREUR_IA', detail: 'Budget exceeded for this API key' }), 'CREDIT_EPUISE')
  assert.equal(codeErreurHttp(401, { error: 'ERREUR_IA', detail: 'invalid api key' }), 'CLE_INVALIDE')
  assert.equal(codeErreurHttp(429, { error: 'ERREUR_IA' }), 'LIMITE')
  assert.equal(codeErreurHttp(529, { error: 'ERREUR_IA' }), 'SURCHARGE')
  assert.equal(codeErreurHttp(400, { error: 'ERREUR_IA', detail: 'model not found' }), 'REQUETE_REFUSEE')
  assert.equal(codeErreurHttp(503, { error: 'CLE_MANQUANTE' }), 'CLE_MANQUANTE')
  assert.equal(codeErreurHttp(401, { error: 'Non connecté' }), 'SESSION')
  assert.equal(codeErreurHttp(403, { error: 'Pas membre du foyer' }), 'FOYER')
  const info = expliquerErreur('CREDIT_EPUISE', 'x')
  assert.ok(info.titre && info.explication && info.conseil)
  assert.equal(expliquerErreur('???').code, '???')
  assert.equal(expliquerErreur('???').titre, 'Erreur inattendue')
})

test('réponse tronquée : seuls les repas complets sont gardés', () => {
  const texte = '{ "repas": [ { "id": "c1", "recette": { "nom": "Tajine {doux}", "etapes": ["a \\"b\\""] } },'
    + ' { "id": "c2", "recette": { "nom": "Curry" } }, { "id": "c3", "recette": { "nom": "Sou'
  const repas = extraireRepasComplets(texte)
  assert.deepEqual(repas.map(r => r.id), ['c1', 'c2'])
  assert.equal(repas[0].recette.nom, 'Tajine {doux}')
  assert.deepEqual(extraireRepasComplets('rien'), [])
})

test('photo : coût réel si Mammouth renvoie le décompte, sinon estimé', () => {
  const reel = coutImage({ prompt_tokens: 100, completion_tokens: 1290 })
  assert.ok(Math.abs(reel.cout - (100 * 0.5 + 1290 * 3) / 1e6) < 1e-12)
  assert.equal(reel.estime, false)
  const estime = coutImage()
  assert.equal(estime.estime, true)
  assert.ok(estime.cout > 0.003 && estime.cout < 0.005)
  assert.equal(codeErreurHttp(502, { error: 'IMAGE_VIDE' }), 'IMAGE_VIDE')
})

test('les photos ne faussent pas l\'estimation des recettes', () => {
  const img = { action: 'image', statut: 'ok', nb_recettes: 1, tokens_entree: 100, tokens_sortie: 1300, estime: false }
  assert.equal(moyennes([img, img, img]).observe, false)
})

test('format en dollars', () => {
  assert.equal(formatDollars(3.256), '3,26 $')
  assert.equal(formatDollars(0.004), '< 0,01 $')
  assert.equal(formatDollars(0), '0,00 $')
})
