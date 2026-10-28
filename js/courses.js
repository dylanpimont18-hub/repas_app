// js/courses.js — Liste de courses du cycle : 🛒 samedi magasin + 🚗 mercredi drive
import { chargerCycle }     from './planning.js'
import { getRecettesByIds } from './recettes.js'
import { repartirCourses, ajouterArticlesLibres, separerPlacard, cleIngredient } from './utils.js'
import { retirerCeQuiEstALaMaison } from './placard.js'
import { dbGetCoursesEtat, dbToggleCourse, dbResetCourses, dbGetCoursesLibres, dbAddCourseLibre,
         dbDeleteCourseLibre, dbGetReglage, dbSetReglage } from './db.js'

// Liste complète du cycle : recettes + articles ajoutés à la main, moins ce qui est toujours au placard
// et ce qui est déjà à la maison (inventaire de « Vider le placard », rappelé avec la quantité en stock)
// → { parties: { samedi: { rayon: [item] }, mercredi: {…} }, auPlacard: [item] } ; item = { nom, quantites, cleEtat, libreId?, stock? }
export async function listeCourses(samedi, cleCycle) {
  const [parties, libres, placard, inventaire] = await Promise.all([genererListeCycle(samedi), dbGetCoursesLibres(cleCycle), getPlacard(),
    dbGetReglage('inventaire').catch(() => null)])
  const { parties: reste, auPlacard } = separerPlacard(ajouterArticlesLibres(parties, libres), placard)
  const { parties: aAcheter, aLaMaison } = retirerCeQuiEstALaMaison(reste, Array.isArray(inventaire) ? inventaire : [])
  return { parties: aAcheter, auPlacard: [...aLaMaison, ...auPlacard].sort((a, b) => a.nom.localeCompare(b.nom)) }
}

// → { samedi: { rayon: [{ nom, quantites, cleEtat }] }, mercredi: { ... } }
export async function genererListeCycle(samedi) {
  const { creneaux, occupation } = await chargerCycle(samedi)
  // Les plats sortis du congélo ne demandent aucune course
  const remplis  = creneaux.filter(c => occupation[c.cle] && occupation[c.cle].source !== 'reserve')
  const recettes = await getRecettesByIds(remplis.map(c => occupation[c.cle].id))

  const lignes = []
  for (const c of remplis) {
    const occ = occupation[c.cle]
    const recette = recettes[occ.id]
    if (!recette) continue
    const facteur = (occ.portions || c.portions) / (recette.portions || 4)
    for (const ing of recette.ingredients || []) {
      lignes.push({ partie: c.partie, nom: ing.nom, quantite: ing.quantite, facteur })
    }
  }
  return repartirCourses(lignes)
}

// ── Cases cochées : Supabase (temps réel), avec une file d'attente si le réseau manque en magasin ──
const CLE_FILE = 'repas_file_courses'
const erreurReseau = e => navigator.onLine === false || /fetch|network|load failed|réseau/i.test(String(e?.message || e))

export function fileCourses() {
  try { return JSON.parse(localStorage.getItem(CLE_FILE) || '[]') } catch { return [] }
}
function ecrireFile(file) {
  try { localStorage.setItem(CLE_FILE, JSON.stringify(file)) } catch { /* navigation privée */ }
}

export async function getEtatCourses(cle) {
  const etat = await dbGetCoursesEtat(cle)
  // Les coches pas encore envoyées l'emportent sur la base
  for (const f of fileCourses()) if (f.cle === cle) etat[f.nom.toLowerCase().trim()] = f.checked
  return etat
}

/** Coche / décoche ; renvoie 'envoye' ou 'en_attente' (hors connexion : envoyé au retour du réseau) */
export async function toggleCourse(cle, nom, checked) {
  try {
    await dbToggleCourse(cle, nom, checked)
    return 'envoye'
  } catch (e) {
    if (!erreurReseau(e)) throw e
    ecrireFile([...fileCourses().filter(f => !(f.cle === cle && f.nom === nom)), { cle, nom, checked }])
    return 'en_attente'
  }
}

/** Envoie les coches en attente ; renvoie le nombre envoyé */
export async function envoyerFileCourses() {
  let envoyes = 0
  for (const f of fileCourses()) {
    try {
      await dbToggleCourse(f.cle, f.nom, f.checked)
      ecrireFile(fileCourses().filter(x => !(x.cle === f.cle && x.nom === f.nom)))
      envoyes++
    } catch (e) { if (erreurReseau(e)) break; throw e }
  }
  return envoyes
}

export async function resetCourses(cle) {
  ecrireFile(fileCourses().filter(f => f.cle !== cle))
  return dbResetCourses(cle)
}

// Articles ajoutés à la main (pain, lessive…)
export async function ajouterArticle(cle, nom, partie) { return dbAddCourseLibre(cle, nom.trim(), partie) }
export async function supprimerArticle(id) { return dbDeleteCourseLibre(id) }

// « Toujours au placard » : réglage partagé du foyer, liste de clés d'ingrédients
export async function getPlacard() {
  const v = await dbGetReglage('placard').catch(e => { console.warn('Placard', e); return null })
  return Array.isArray(v) ? v : []
}
export async function basculerPlacard(nom, auPlacard) {
  const cle = cleIngredient(nom)
  const actuel = await getPlacard()
  const suivant = auPlacard ? [...new Set([...actuel, cle])] : actuel.filter(c => c !== cle)
  await dbSetReglage('placard', suivant)
}
