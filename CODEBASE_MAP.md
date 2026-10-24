# CODEBASE_MAP — Repas

Index de navigation. Mis à jour après chaque tâche modifiant des fichiers.

---

## Pages HTML

### index.html
Dashboard d'accueil : aperçu du planning de la semaine, liens vers les 5 sections.

### login.html
Page de connexion Supabase Auth (email + mot de passe).

### preferences.html
Système de cartes Tinder pour noter les ingrédients par profil (Dylan / Ma femme).

### recettes.html
Bibliothèque des recettes sauvegardées avec filtres et vue détail.

### planning.html
Grille hebdomadaire 7 × 2 (midi/soir) avec sélection de recettes et génération IA.

### courses.html
Liste de courses agrégée depuis le planning, groupée par catégorie, avec cases à cocher.

---

## Config & déploiement

### config.js
URL + clé publique Supabase (non versionnée). Variables : `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Aucune clé secrète.

### generate-config.js
Build Netlify : génère config.js (valeurs publiques uniquement).

### netlify.toml
Config déploiement Netlify — commande de build.

### supabase-schema.sql
Schéma SQL initial : `preferences`, `recettes`, `planning`, `courses_etat`.

### supabase/migrations/20261024_foyer_sync.sql
Foyer (`foyer_membres` + `est_membre_foyer()`), table `ingredients_custom`, RLS réservée au foyer, publication temps réel.

### supabase/functions/ai/index.ts
Edge Function : proxy Mammouth AI (streaming) + météo OpenWeatherMap, vérifie membre du foyer. Secrets `MAMMOUTH_API_KEY`, `OPENWEATHER_API_KEY`.

---

## CSS

### css/style.css
Variables CSS (tons chauds + dark mode), reset, layout global, toggle thème.

### css/components.css
Composants réutilisables : cartes swipe, cartes recette, grille planning, modale, boutons.

---

## JS — Couche données (Supabase)

### js/db.js
Client Supabase + toutes les opérations base de données.
- `dbGetSession()` / `dbSignIn()` / `dbSignOut()` — auth Supabase
- `dbGetToutesPreferences()` — préférences des deux profils, une requête
- `dbSetPreference(profilNom, ingredientId, niveau)` — upsert ou supprime une note
- `dbGetCustomIngredients()` / `dbAddCustomIngredients(list)` / `dbDeleteCustomIngredient(id)` — ingrédients perso partagés
- `dbGetRecettes()` / `dbGetRecetteById(id)` — lecture recettes
- `dbGetRecettesByIds(ids)` — plusieurs recettes en une requête → `{id: recette}`
- `dbUpsertRecette(r)` / `dbUpsertRecettes(list)` — enregistre recette(s), retourne les ids
- `dbDeleteRecette(id)` — supprime une recette
- `dbGetPlanning(semaineKey)` — planning d'une semaine
- `dbUpsertPlanning(...)` / `dbUpsertPlanningLot(lignes)` — assigne un ou plusieurs créneaux
- `dbGetCoursesEtat` / `dbToggleCourse` / `dbResetCourses` — cases cochées des courses
- `dbEcouter(tables, onChange)` — abonnement temps réel Supabase
- `dbAppelFonctionIA(body)` — appelle l'Edge Function `ai` avec le jeton de session

### js/utils.js
Fonctions pures testables sous Node.
- `esc(s)` — échappe pour insertion HTML
- `getSemaineKey(date)` — clé ISO YYYY-Www
- `debounce(fn, ms)` — regroupe des appels rapprochés
- `combinerQuantites(quantites)` — ajuste aux portions et additionne
- `categoriser(nom)` — rayon de supermarché d'un ingrédient
- `validerVegetarien(recette)` — détecte viande/poisson dans une recette

### js/storage.js
Wrapper localStorage (thème uniquement).
- `KEYS`, `load(key, def)`, `save(key, v)`, `remove(key)`

---

## JS — Logique métier

### js/app.js
Initialisation, navigation, gestion du thème dark/light, vérification auth.
- `init()` — charge le thème, initialise les listeners, vérifie session
- `setTheme(theme)` — applique et persiste dark/light

### js/auth-login.js
Logique de la page de connexion.
- Redirige automatiquement si déjà connecté
- `tenterConnexion()` — valide le formulaire et appelle `dbSignIn`

### js/data/ingredients.js
Base de données statique des ingrédients (150+), organisée par catégorie.
- `CATEGORIES` — objet des catégories avec label et emoji
- `getParCategorie(categorieId)` — retourne les ingrédients d'une catégorie

### js/custom-ingredients.js
Ingrédients personnalisés via Supabase (cache mémoire, migration auto depuis l'ancien localStorage).
- `getCustomIngredients()` / `invaliderCustomIngredients()` — lecture en cache / reset
- `addCustomIngredient({nom, categorie, emoji})` / `removeCustomIngredient(id)` — async
- `getAllParCategorie(cat)` / `getAllIngredients()` / `getIngredientParId(id)` — base statique + perso, async

### js/preferences.js
Préférences par profil, cache mémoire (une requête par page).
- `getProfil(qui)` — `{ingredientId: niveau}` depuis le cache
- `setPreference(qui, ingredientId, niveau)` — enregistre et met à jour le cache
- `invaliderPreferences()` — force un rechargement (temps réel)
- `getANoter(qui, categorie)` — ingrédients sans note
- `getProgression(qui, categorie)` — `{faits, total}`
- `getTotalANoter(qui)` — nombre total non noté (badge)

### js/recettes.js
CRUD bibliothèque de recettes.
- `getRecettes(filtres)` / `getRecetteById(id)` / `getRecettesByIds(ids)` — lecture
- `addRecette(recette)` / `deleteRecette(id)` — écriture

### js/planning.js
Planificateur hebdomadaire.
- `JOURS`, `MOMENTS`, `getSemaineKey` (réexporté de utils)
- `getPlanning(semaineKey)` / `assignerRepas(...)` / `supprimerRepas(...)`
- `importerCreneaux(repas, semaineKeys)` — import IA en 2 requêtes (1 ou 2 semaines)
- `getJoursAvecRepas(semaineKey)` — créneaux remplis
- `idsDuPlanning(planning)` — ids des recettes d'un planning

### js/courses.js
Liste de courses.
- `genererListeCourses(semaineKey)` — agrège les ingrédients (une requête recettes)
- `getEtatCourses` / `toggleCourse` / `resetCourses` — cases cochées Supabase

### js/ai.js
Génération IA via Mammouth AI (Edge Function `ai`) + prompts.
- `genererCreneaux({slots, pourQui, meteo, contraintes}, onProgress)` — repas des créneaux choisis, anti-gaspi
- `genererDerniereMinute({pourQui, ingredientsDispos, contraintes})` — une recette rapide
- `getMeteo()` — météo Vierzon via l'Edge Function
- `getSaison()` — saison courante

---

## JS — Couche UI (rendu et interactions)

### js/dashboard.js
Contrôleur du tableau de bord d'accueil.
- `render()` — nombre de recettes, repas du jour, aperçu semaine ; rafraîchi en temps réel

### js/preferences-ui.js
Rendu et interactions de la page préférences (cartes + vue liste).
- `renderCatChips()` — affiche les boutons de catégorie
- `chargerFile()` — charge la file d'ingrédients à noter pour la catégorie active
- `afficherProchain()` — affiche la carte suivante ou l'écran "terminé"
- Temps réel : recharge si l'autre profil note ou ajoute un ingrédient (ignore ses propres échos)

### js/recettes-ui.js
Rendu et interactions de la bibliothèque de recettes.
- `renderList()` — affiche les cartes recettes filtrées
- `ouvrirDetail(id)` — affiche la modale de détail d'une recette (boutons Modifier, Dupliquer, Supprimer)
- `ouvrirFormEdit(recette)` — ouvre la modale d'édition/duplication pré-remplie
- Temps réel sur `recettes`

### js/planning-ui.js
Rendu et interactions du planificateur hebdomadaire.
- `renderGrid()` — vue liste 7 jours × 2 repas ; temps réel sur `planning`/`recettes`
- `initModalGen()` — modale de génération IA (1 ou 2 semaines, progression en direct)
- `ouvrirSelectRecette()` — modale de sélection d'une recette pour un créneau

### js/courses-ui.js
Rendu et interactions de la liste de courses.
- `render()` — liste groupée par rayon, quantités ajustées ; file de rendu sans perte d'événement temps réel

---

## Tests

### tests/utils.test.mjs
Tests unitaires de js/utils.js — `node --test tests/*.test.mjs`.
