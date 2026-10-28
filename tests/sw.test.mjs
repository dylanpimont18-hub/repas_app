// tests/sw.test.mjs — Le service worker met bien en cache tous les fichiers de l'appli (sinon : page cassée hors ligne)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
const liste = sw.slice(sw.indexOf('const COQUILLE'), sw.indexOf(']', sw.indexOf('const COQUILLE')))

test('chaque page et chaque module JS est dans la coquille hors ligne', () => {
  const racine = new URL('../', import.meta.url)
  const pages = readdirSync(racine).filter(f => f.endsWith('.html') && f !== 'generate-icons.html')
  const modules = [
    ...readdirSync(new URL('../js/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => `js/${f}`),
    ...readdirSync(new URL('../js/data/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => `js/data/${f}`),
    ...readdirSync(new URL('../js/vendor/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => `js/vendor/${f}`),
  ]
  for (const f of [...pages, ...modules]) assert.ok(liste.includes(`'${f}'`), `${f} manque dans sw.js`)
})

test('la coquille ne liste aucun fichier inexistant', () => {
  const fichiers = [...liste.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './' && f !== 'config.js')
  for (const f of fichiers) assert.doesNotThrow(() => readFileSync(new URL(`../${f}`, import.meta.url)), f)
})
