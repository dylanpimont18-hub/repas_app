// tests/preferences.test.js
import { assert, summary } from './test-utils.js'
import { setPreference, getProfil, getProfilFiltre, getProgression, getANoter } from '../js/preferences.js'

// Nettoyage avant tests
localStorage.removeItem('repas_profil_dylan')
localStorage.removeItem('repas_profil_femme')

// Tests setPreference + getProfil
setPreference('dylan', 'tomate', 'j_adore')
setPreference('dylan', 'brocoli', 'j_aime_pas')
setPreference('dylan', 'courgette', 'neutre')

const profil = getProfil('dylan')
assert('setPreference stocke j_adore',    profil['tomate']    === 'j_adore')
assert('setPreference stocke j_aime_pas', profil['brocoli']   === 'j_aime_pas')
assert('setPreference stocke neutre',     profil['courgette'] === 'neutre')
assert('profils séparés — femme vide',    Object.keys(getProfil('femme')).length === 0)

// Tests getProfilFiltre
const adore = getProfilFiltre('dylan', 'j_adore')
assert('getProfilFiltre retourne j_adore',  adore.includes('tomate'))
assert('getProfilFiltre exclut les autres', !adore.includes('brocoli'))
assert('getProfilFiltre naime retourne brocoli', getProfilFiltre('dylan', 'j_aime_pas').includes('brocoli'))

// Tests getProgression
const prog = getProgression('dylan', 'legumes')
assert('getProgression > 0 après notation', prog > 0)
assert('getProgression <= 1',               prog <= 1)
assert('getProgression catégorie vide = 1', getProgression('femme', 'legumes') === 0)

// Tests getANoter
const aNoter = getANoter('dylan', 'legumes')
assert('getANoter exclut les déjà notés',  !aNoter.some(i => i.id === 'tomate'))
assert('getANoter exclut brocoli',         !aNoter.some(i => i.id === 'brocoli'))
assert('getANoter inclut les non-notés',    aNoter.length > 0)

// Nettoyage
localStorage.removeItem('repas_profil_dylan')
localStorage.removeItem('repas_profil_femme')
summary()
