// js/courses.js
import { KEYS, load, save } from './storage.js'
import { getPlanning, JOURS, MOMENTS } from './planning.js'
import { getRecetteById }              from './recettes.js'

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

export function genererListeCourses(semaineKey) {
  const planning = getPlanning(semaineKey)
  const agregat  = {}

  JOURS.forEach(jour => {
    MOMENTS.forEach(moment => {
      const slot    = planning[jour]?.[moment]
      if (!slot?.id) return
      const recette = getRecetteById(slot.id)
      if (!recette) return
      const facteur = (slot.portions || 2) / (recette.portions || 2)
      recette.ingredients.forEach(ing => {
        const k = ing.nom.toLowerCase().trim()
        if (!agregat[k]) agregat[k] = { nom: ing.nom, quantites: [], categorie: categoriser(ing.nom) }
        agregat[k].quantites.push({ valeur: ing.quantite, facteur })
      })
    })
  })

  const groupes = {}
  Object.values(agregat).forEach(ing => {
    if (!groupes[ing.categorie]) groupes[ing.categorie] = []
    groupes[ing.categorie].push({ nom: ing.nom, quantites: ing.quantites })
  })
  return groupes
}

export function getEtatCourses() { return load(KEYS.coursesEtat, {}) }

export function toggleCourse(nom) {
  const etat = getEtatCourses()
  const k    = nom.toLowerCase().trim()
  etat[k]    = !etat[k]
  save(KEYS.coursesEtat, etat)
  return etat[k]
}

export function resetCourses() { save(KEYS.coursesEtat, {}) }
