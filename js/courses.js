// js/courses.js
import { getPlanning, JOURS, MOMENTS } from './planning.js'
import { getRecetteById }              from './recettes.js'
import { dbGetCoursesEtat, dbToggleCourse, dbResetCourses } from './db.js'

const CAT_MAP = {
  'Fruits & Légumes': ['tomate','courgette','aubergine','poivron','oignon','ail','carotte',
    'salade','champignon','avocat','citron','orange','pomme','banane','mangue','herbe',
    'persil','basilic','menthe','coriandre','légume','fruit','céleri','poireau','brocoli',
    'épinard','betterave','fenouil','asperge','potiron','navet','chou','endive','artichaut',
    'concombre','radis','petits pois','haricots verts','maïs','pomme de terre','patate'],
  'Viandes & Poissons': ['poulet','agneau','bœuf','boeuf','veau','dinde','canard','lapin',
    'saumon','cabillaud','thon','sardine','crevette','maquereau','merlan','sole','dorade',
    'calamar','moule','lotte','merguez','kefta','escalope'],
  'Féculents': ['riz','pâtes','pates','semoule','boulgour','quinoa','lentille',
    'pois chiche','haricot blanc','haricot rouge','farine','nouille','pain pita'],
  'Laitiers & Œufs': ['œuf','oeuf','lait','crème','beurre','fromage','yaourt',
    'feta','mozzarella','ricotta','coco'],
  'Épicerie & Condiments': ['huile','vinaigre','sauce','moutarde','miel','concentré',
    'bouillon','tahini','sel','poivre','cumin','paprika','curcuma','cannelle','curry',
    'harissa','ras-el-hanout','sumac','safran','cardamome','laurier','aneth',
    'romarin','thym','origan','basilic','gingembre','piment','herbes de provence'],
}

function categoriser(nom) {
  const n = nom.toLowerCase()
  for (const [cat, mots] of Object.entries(CAT_MAP)) {
    if (mots.some(m => n.includes(m))) return cat
  }
  return 'Divers'
}

export async function genererListeCourses(semaineKey) {
  const planning = await getPlanning(semaineKey)
  const agregat  = {}

  // Collecter tous les slots remplis
  const slots = []
  JOURS.forEach(jour => MOMENTS.forEach(moment => {
    const slot = planning[jour]?.[moment]
    if (slot?.id) slots.push({ ...slot, jour, moment })
  }))

  // Récupérer toutes les recettes en parallèle
  const recettes = await Promise.all(slots.map(s => getRecetteById(s.id)))

  slots.forEach((slot, i) => {
    const recette = recettes[i]
    if (!recette) return
    const facteur = (slot.portions || 2) / (recette.portions || 2)
    recette.ingredients.forEach(ing => {
      const k = ing.nom.toLowerCase().trim()
      if (!agregat[k]) agregat[k] = { nom: ing.nom, quantites: [], categorie: categoriser(ing.nom) }
      agregat[k].quantites.push({ valeur: ing.quantite, facteur })
    })
  })

  const groupes = {}
  Object.values(agregat).forEach(ing => {
    if (!groupes[ing.categorie]) groupes[ing.categorie] = []
    groupes[ing.categorie].push({ nom: ing.nom, quantites: ing.quantites })
  })
  return groupes
}

// État des cases à cocher — synchronisé via Supabase (temps réel multi-appareils)
export async function getEtatCourses(semaineKey) { return dbGetCoursesEtat(semaineKey) }
export async function toggleCourse(semaineKey, nom, checked) { return dbToggleCourse(semaineKey, nom, checked) }
export async function resetCourses(semaineKey) { return dbResetCourses(semaineKey) }
