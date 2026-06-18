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
Clé API Claude + URL/clé Supabase (non versionnée). Variables : `CLAUDE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

### netlify.toml
Config déploiement Netlify — redirects SPA, headers de sécurité.

### supabase-schema.sql
Schéma SQL des tables Supabase : `preferences`, `recettes`, `planning`.

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
- `dbGetSession()` — vérifie la session active
- `dbSignIn(email, password)` — connexion Supabase Auth
- `dbSignOut()` — déconnexion
- `dbGetProfil(profilNom)` — charge les préférences d'un profil
- `dbSetPreference(profilNom, ingredientId, niveau)` — upsert une préférence
- `dbGetRecettes()` — liste toutes les recettes triées par date
- `dbGetRecetteById(id)` — retourne une recette par id
- `dbUpsertRecette(recette)` — crée ou met à jour une recette
- `dbDeleteRecette(id)` — supprime une recette
- `dbGetPlanning(semaineKey)` — retourne le planning d'une semaine
- `dbUpsertPlanning(semaineKey, jour, moment, recetteId, portions)` — assigne ou supprime un repas

### js/storage.js
Wrapper localStorage : constantes de clés + helpers load/save/remove.
- `KEYS` — objet avec toutes les clés `repas_*`
- `load(key, defaultValue)` — lit et parse du localStorage
- `save(key, value)` — sérialise et écrit dans localStorage
- `remove(key)` — supprime une entrée localStorage

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

### js/preferences.js
Gestion des profils de préférences (couche métier au-dessus de db.js).
- `getProfil(qui)` — charge les préférences du profil via Supabase
- `setPreference(qui, ingredientId, niveau)` — enregistre une note
- `getANoter(qui, categorie)` — retourne les ingrédients sans note dans une catégorie
- `getProgression(qui)` — retourne le % de notation par catégorie

### js/recettes.js
CRUD bibliothèque de recettes (couche métier au-dessus de db.js).
- `getRecettes(filtres)` — retourne les recettes filtrées
- `addRecette(recette)` — sauvegarde une recette via Supabase
- `deleteRecette(id)` — supprime une recette
- `getRecetteById(id)` — retourne une recette par id

### js/planning.js
Gestion du planificateur hebdomadaire.
- `getSemaineKey(date?)` — retourne la clé YYYY-WW pour une date (par défaut aujourd'hui)
- `getPlanning(semaineKey)` — retourne le planning depuis Supabase
- `assignerRepas(semaineKey, jour, moment, recetteId, portions)` — assigne une recette
- `supprimerRepas(semaineKey, jour, moment)` — vide un créneau
- `importerSemaineIA(semaineKey, semaine, addRecetteFn)` — importe un planning complet généré par IA
- `importerCreneaux(semaineKey, repas, addRecetteFn)` — importe uniquement les créneaux sélectionnés (`repas = [{jour,moment,recette}]`)

### js/courses.js
Génération et gestion de la liste de courses.
- `genererListeCourses(semaineKey)` — agrège les ingrédients du planning, ajustés aux portions
- `getEtatCourses(semaineKey)` — async, retourne l'état coché depuis Supabase
- `toggleCourse(semaineKey, nom, checked)` — async, upsert Supabase
- `resetCourses(semaineKey)` — async, supprime toutes les lignes de la semaine

### js/ai.js
Intégration Claude API et prompt engineering.
- `genererSemaine({pourQui, meteo, contraintes})` — génère les 14 repas d'une semaine complète
- `genererCreneaux({slots, pourQui, meteo, contraintes})` — génère uniquement les créneaux sélectionnés (`slots = [{jour,moment}]`), stratégie anti-gaspi incluse
- `genererDerniereMinute({pourQui, ingredientsDispos, contraintes})` — génère une recette rapide
- `getMeteo()` — récupère la météo de Vierzon via OpenWeatherMap

---

## JS — Couche UI (rendu et interactions)

### js/dashboard.js
Contrôleur du tableau de bord d'accueil.
- Affiche le nombre de recettes et l'aperçu du planning de la semaine actuelle

### js/preferences-ui.js
Rendu et interactions de la page préférences (cartes + vue liste).
- `renderCatChips()` — affiche les boutons de catégorie
- `chargerFile()` — charge la file d'ingrédients à noter pour la catégorie active
- `afficherProchain()` — affiche la carte suivante ou l'écran "terminé"

### js/recettes-ui.js
Rendu et interactions de la bibliothèque de recettes.
- `renderList()` — affiche les cartes recettes filtrées
- `ouvrirDetail(id)` — affiche la modale de détail d'une recette (boutons Modifier, Dupliquer, Supprimer)
- `ouvrirFormEdit(recette)` — ouvre la modale d'édition/duplication pré-remplie

### js/planning-ui.js
Rendu et interactions du planificateur hebdomadaire.
- `renderGrid()` — affiche la grille 7×2 (mode normal ou mode sélection IA)
- `activerModeSelection()` / `desactiverModeSelection()` — bascule le mode sélection de créneaux pour la génération IA
- `ouvrirSelectRecette()` — modale de sélection d'une recette pour un créneau
- `creerPopover()` — popover contextuel (voir / changer / supprimer)

### js/courses-ui.js
Rendu et interactions de la liste de courses.
- `render()` — génère la liste groupée par catégorie avec cases à cocher

---

## Tests

### tests/test-utils.js
Utilitaires partagés entre les fichiers de test.

### tests/preferences.test.js
Tests unitaires pour le module préférences.

### tests/planning.test.js
Tests unitaires pour le module planning.

### tests/courses.test.js
Tests unitaires pour le module courses.

### tests/test.html
Runner de tests dans le navigateur.
