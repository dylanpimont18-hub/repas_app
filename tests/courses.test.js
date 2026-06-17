// tests/courses.test.js
import { assert, summary } from './test-utils.js'
import { genererListeCourses, getEtatCourses, toggleCourse, resetCourses } from '../js/courses.js'
import { KEYS, save } from '../js/storage.js'

// Données de test
save(KEYS.recettes, [{
  id: 'r_courses_test',
  nom: 'Test Poulet Tomate',
  vegetarien: false,
  temps_prep: 10, temps_cuisson: 20,
  portions: 2,
  ingredients: [
    { nom: 'Tomate', quantite: '200g' },
    { nom: 'Poulet (filet)', quantite: '300g' },
    { nom: 'Huile d\'olive', quantite: '2 c.s.' },
  ],
  etapes: [], nutrition: null, date: new Date().toISOString()
}])
save(KEYS.planning, {
  '2099-W01': {
    lundi:    { midi: { id: 'r_courses_test', portions: 2 }, soir: null },
    mardi:    { midi: null, soir: null },
    mercredi: { midi: null, soir: null },
    jeudi:    { midi: null, soir: null },
    vendredi: { midi: null, soir: null },
    samedi:   { midi: null, soir: null },
    dimanche: { midi: null, soir: null },
  }
})

const groupes = genererListeCourses('2099-W01')

assert('retourne un objet',              typeof groupes === 'object')
assert('Tomate → Fruits & Légumes',      groupes['Fruits & Légumes']?.some(i => i.nom === 'Tomate'))
assert('Poulet → Viandes & Poissons',    groupes['Viandes & Poissons']?.some(i => i.nom === 'Poulet (filet)'))
assert("Huile → Épicerie & Condiments",  groupes['Épicerie & Condiments']?.some(i => i.nom === "Huile d'olive"))
assert('Tomate a une quantité',          groupes['Fruits & Légumes']?.find(i => i.nom === 'Tomate')?.quantites[0]?.valeur === '200g')

// Tests état courses
resetCourses()
assert('état initial vide', Object.keys(getEtatCourses()).length === 0)

const checked = toggleCourse('Tomate')
assert('toggleCourse retourne true au premier appel', checked === true)
assert('Tomate marquée dans état', getEtatCourses()['tomate'] === true)

const unchecked = toggleCourse('Tomate')
assert('toggleCourse retourne false au second appel', unchecked === false)

resetCourses()
assert('resetCourses vide l\'état', Object.keys(getEtatCourses()).length === 0)

// Nettoyage
localStorage.removeItem(KEYS.recettes)
localStorage.removeItem(KEYS.planning)
summary()
