// tests/planning.test.js
import { assert, summary } from './test-utils.js'
import { getSemaineKey, getPlanning, assignerRepas, supprimerRepas, getJoursAvecRepas, JOURS } from '../js/planning.js'

// Tests getSemaineKey
const key = getSemaineKey(new Date('2026-06-17'))
assert('getSemaineKey format YYYY-Www', /^\d{4}-W\d{2}$/.test(key))
assert('2026-06-17 = W25', key === '2026-W25')

const keyJan = getSemaineKey(new Date('2026-01-01'))
assert('getSemaineKey 2026-01-01 = W01', keyJan === '2026-W01')

// Tests getPlanning
const planning = getPlanning('2099-W99')
assert('getPlanning retourne 7 jours', Object.keys(planning).length === 7)
assert('getPlanning contient lundi',    'lundi' in planning)
assert('midi null par défaut',          planning['lundi']['midi'] === null)
assert('soir null par défaut',          planning['lundi']['soir'] === null)
assert('JOURS contient 7 éléments',     JOURS.length === 7)

// Tests assignerRepas
assignerRepas('2099-W99', 'lundi', 'midi', 'r_test', 2)
const p2 = getPlanning('2099-W99')
assert('assignerRepas stocke id',      p2['lundi']['midi']?.id === 'r_test')
assert('assignerRepas stocke portions',p2['lundi']['midi']?.portions === 2)
assert('soir non affecté',             p2['lundi']['soir'] === null)

// Tests supprimerRepas
supprimerRepas('2099-W99', 'lundi', 'midi')
assert('supprimerRepas remet null', getPlanning('2099-W99')['lundi']['midi'] === null)

// Tests getJoursAvecRepas
assignerRepas('2099-W99', 'mardi', 'soir', 'r_test2', 3)
const slots = getJoursAvecRepas('2099-W99')
assert('getJoursAvecRepas retourne les slots remplis', slots.length === 1)
assert('slot contient jour et moment',  slots[0].jour === 'mardi' && slots[0].moment === 'soir')
assert('slot contient id',              slots[0].id === 'r_test2')

// Nettoyage
localStorage.removeItem('repas_planning')
summary()
