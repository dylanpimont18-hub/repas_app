// js/import-pur.js — Import de recette : texte collé ou données « Recipe » d'un site (JSON-LD) → recette de l'appli
// Fonctions pures, testées sous Node. Le résultat s'ouvre dans le formulaire pour être vérifié avant d'être enregistré.
import { lireLigneIngredient } from './utils.js'

// « PT1H15M » → 75 (minutes)
export function dureeIso(d) {
  const m = String(d ?? '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (!m) return 0
  return (Number(m[1] || 0) * 1440) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) + Math.round(Number(m[4] || 0) / 60)
}

// « 4 personnes », 4, ["4", "4 parts"] → 4
function portionsDe(y) {
  const v = Array.isArray(y) ? y.find(x => /\d/.test(String(x))) : y
  const n = parseInt(String(v ?? '').match(/\d+/)?.[0], 10)
  return n > 0 && n <= 30 ? n : 4
}

const texteSimple = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#39;|&apos;/g, '\'').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()

// Étapes JSON-LD : texte, liste de textes, HowToStep, HowToSection (imbriquées)
function etapesDe(instr) {
  if (!instr) return []
  if (typeof instr === 'string') return instr.split(/\r?\n|(?<=\.)\s+(?=\d+[.)]\s)/).map(texteSimple).filter(Boolean)
  if (Array.isArray(instr)) return instr.flatMap(etapesDe)
  if (instr.itemListElement) return etapesDe(instr.itemListElement)
  return [texteSimple(instr.text || instr.name)].filter(Boolean)
}

// Trouve l'objet Recipe dans un ou plusieurs blocs JSON-LD (@graph, listes…)
export function trouverRecette(donnees) {
  const pile = [donnees]
  while (pile.length) {
    const x = pile.shift()
    if (!x || typeof x !== 'object') continue
    if (Array.isArray(x)) { pile.push(...x); continue }
    const type = [].concat(x['@type'] || [])
    if (type.includes('Recipe')) return x
    if (x['@graph']) pile.push(x['@graph'])
  }
  return null
}

/** Objet schema.org Recipe → recette de l'appli (ingrédients découpés en quantité + nom) */
export function recetteDepuisJsonLd(r) {
  if (!r) return null
  const prep = dureeIso(r.prepTime), cuisson = dureeIso(r.cookTime), total = dureeIso(r.totalTime)
  return {
    nom: texteSimple(r.name),
    description: texteSimple(r.description).slice(0, 400) || null,
    cuisine: texteSimple([].concat(r.recipeCuisine || [])[0]).toLowerCase() || null,
    portions: portionsDe(r.recipeYield),
    temps_prep: prep || (total && !cuisson ? total : 0),
    temps_cuisson: cuisson || (total && prep ? Math.max(0, total - prep) : 0),
    ingredients: [].concat(r.recipeIngredient || r.ingredients || []).map(i => lireLigneIngredient(texteSimple(i))).filter(Boolean),
    etapes: etapesDe(r.recipeInstructions),
    nutrition: r.nutrition?.calories ? { calories: parseInt(r.nutrition.calories, 10) || 0, proteines: parseInt(r.nutrition.proteinContent, 10) || 0,
      glucides: parseInt(r.nutrition.carbohydrateContent, 10) || 0, lipides: parseInt(r.nutrition.fatContent, 10) || 0 } : null,
  }
}

/**
 * Texte collé (recette d'un message, d'un livre…) → recette.
 * 1re ligne = nom ; section « Ingrédients » puis « Préparation / Étapes » ; sans titres de section, les lignes qui
 * commencent par une quantité sont des ingrédients et les autres des étapes.
 */
export function recetteDepuisTexte(texte) {
  const lignes = String(texte ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lignes.length) return null
  const nom = lignes.shift().replace(/^#+\s*/, '')
  const r = { nom, portions: 4, ingredients: [], etapes: [], temps_prep: 0, temps_cuisson: 0 }
  let section = null
  for (const ligne of lignes) {
    const titre = ligne.toLowerCase().replace(/[:#*]/g, '').trim()
    if (/^ingr[ée]dients?\b/.test(titre)) { section = 'ingredients'; const p = titre.match(/(\d+)\s*(pers|parts?|portions?)/); if (p) r.portions = Number(p[1]); continue }
    if (/^(pr[ée]paration|[ée]tapes?|instructions?|recette|m[ée]thode)\b/.test(titre)) { section = 'etapes'; continue }
    const pers = titre.match(/^pour\s+(\d+)\s*(pers|parts?|portions?)/)
    if (pers) { r.portions = Number(pers[1]); continue }
    const temps = titre.match(/(pr[ée]paration|cuisson)\s*:?\s*(\d+)\s*(min|h)/)
    if (temps && !section) { r[temps[1].startsWith('c') ? 'temps_cuisson' : 'temps_prep'] = Number(temps[2]) * (temps[3] === 'h' ? 60 : 1); continue }
    const propre = ligne.replace(/^(?:[-•*]|\d+[.)])\s*/, '')
    const estIngredient = section === 'ingredients' || (!section && /^[-•*]?\s*[\d½¼¾]/.test(ligne) && !/^\d+[.)]\s/.test(ligne))
    if (estIngredient) { const i = lireLigneIngredient(propre); if (i) r.ingredients.push(i) }
    else r.etapes.push(propre)
  }
  return r
}
