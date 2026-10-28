// tests/halal.test.mjs — Contrôle halal (porc, alcool) : aucun trou, pas de faux positifs sur les versions halal
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contientInterdit } from '../js/filtres.js'

const avec = nom => ({ nom: 'Plat', ingredients: [{ nom, quantite: '1' }] })

test('bloque le porc et la charcuterie de porc', () => {
  for (const nom of ['Saucisse de Toulouse', 'Salami', 'Pepperoni', 'Mortadelle', 'Speck', 'Prosciutto', 'Guanciale',
    'Cervelas', 'Knacki', 'Rosette', 'Chipolatas', 'Lardons fumés', 'Jambon blanc', 'Chorizo', 'Gélatine', 'Saindoux',
    'Échine de porc', 'Pâté de campagne', 'Andouillette']) {
    assert.equal(contientInterdit(avec(nom)), true, nom)
  }
})

test("bloque l'alcool, y compris les spiritueux et liqueurs", () => {
  for (const nom of ['Vin blanc', 'Bière', 'Gin', 'Brandy', 'Armagnac', 'Xérès', 'Madère', 'Pastis', 'Grand Marnier',
    'Cointreau', 'Kahlua', 'Limoncello', 'Amaretto', 'Crème de cassis', 'Vin de Shaoxing', 'Mirin', 'Saké', 'Rhum']) {
    assert.equal(contientInterdit(avec(nom)), true, nom)
  }
})

test('laisse passer les versions halal et les faux amis', () => {
  for (const nom of ['Jambon de dinde', 'Lardons de volaille', 'Gélatine bovine halal', 'Saucisses de volaille',
    'Bacon de bœuf', 'Chorizo halal', 'Gélatine végétale', 'Vinaigre de vin rouge', 'Vinaigre de xérès',
    'Vinaigre de cidre', 'Vinaigrette', 'Gingembre', 'Champignons de Paris', 'Pâtes', 'Merguez', 'Portobello',
    'Cassis', 'Riz', 'Boudin blanc de volaille']) {
    assert.equal(contientInterdit(avec(nom)), false, nom)
  }
})
