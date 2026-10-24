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
Planning par cycle samedi soir → samedi midi, groupé par session de cuisine ; modale « Remplir le cycle ».

### courses.html
Liste de courses du cycle en deux parties (🛒 samedi magasin / 🚗 mercredi drive), navigation ← → par cycle.

### reglages.html
Réglages partagés : modèle de semaine (portions, qui mange, jour de cuisine), réserve congélo, conversion des anciennes recettes.

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

### supabase/migrations/20261024b_planning_famille.sql
Colonnes recette structurée (description, cuisine, composants, legumes_caches, tags, conservation_jours), `planning.source`, tables `reglages` et `reserve`.

### supabase/functions/ai/index.ts
Edge Function : proxy Mammouth AI (streaming), vérifie membre du foyer. Secret `MAMMOUTH_API_KEY`.

---

## CSS

### css/style.css
Variables CSS (tons chauds + dark mode), reset, layout global, toggle thème.

### css/components.css
Composants + mise en page grand écran (≥ 1024 px : menu en haut, fenêtres centrées, frise du planning, grilles).
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
- `dbGetPlanningSemaines(keys)` — lignes brutes de plusieurs semaines ISO
- `dbUpsertPlanning(...)` / `dbUpsertPlanningLot(lignes)` — assigne un ou plusieurs créneaux (avec `source`)
- `dbViderCreneaux(list)` — vide plusieurs créneaux
- `dbGetReglage(cle)` / `dbSetReglage(cle, valeur)` — réglages partagés du foyer
- `dbGetReserve()` / `dbAddReserve(recetteId, portions)` / `dbDeleteReserve(id)` — réserve congélo
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
- `repartirCourses(lignes)` — répartit la liste entre samedi et mercredi

### js/cycle.js
Cycle samedi soir → samedi midi et modèle de semaine (pur, testé).
- `MODELE_DEFAUT` / `normaliserModele(m)` — portions, profils et jour de cuisine par créneau
- `debutCycle(date)` / `decalerCycle(samedi, n)` / `cleCycle(samedi)` / `labelCycle(samedi)`
- `creneauxDuCycle(samedi, modele)` — 14 créneaux (portions, profils, session, conservation, partie de courses)
- `groupesDuCycle(creneaux)` — groupes d'affichage sur place / session
- `soirAssocie(creneaux, c)` — soir dont un midi de session reprend le plat
- `creneauCourant(creneaux, maintenant)` — prochain repas (cible de l'envie)
- `dateDeSemaine(key, jour)` / `semainesDuCycle(samedi)` / `ajouterJours` / `dateIso` / `dateCourte`

### js/filtres.js
Vocabulaire des tags, sélecteurs et détections (pur, testé).
- `TAGS`, `FILTRES` — sélecteurs avec test bibliothèque et consigne IA
- `passeFiltres(r, filtres)` / `consignesFiltres(filtres)`
- `contientViande` / `contientPoisson` / `contientFeculent` / `contientInterdit` (halal)
- `scoreStyle(r, style)` — correspondance avec le style libre
- `normaliser(s)` / `contientMot(texte, mot)` / `texteRecette(r)`

### js/selection.js
Choix des recettes dans la bibliothèque, sans IA (pur, testé).
- `construireIndexPrefs(ingredients, prefs)` — préférences indexées mot à mot
- `evaluer(recette, creneau, ctx)` — exclusions (halal, filtres, goûts, légumes cachés, conservation, rotation) + score
- `nouveauContexte(...)` / `noterChoix(ctx, r)` / `candidats(recettes, creneau, ctx)`
- `remplirCycle({...})` — réserve d'abord, repas familiaux, puis restes pour les midis de session
- `decalerEnCascade(creneaux, plan, cle, nouveau)` — décalage pour l'envie du soir
- `proteinePrincipale(r)` / `ingredientsFrais(r)` / `motsDe(s)` / `motsRecette(r)`

### js/propositions.js
Relie selection.js aux données Supabase du cycle.
- `chargerDonnees(samedi)` — cycle, recettes, réserve, historique, préférences
- `proposerPourCreneau(d, c, options, n)` — meilleurs candidats bibliothèque
- `remplirDepuisBibliotheque(d, cles, options)` / `completerParIA(d, creneaux, options, onProgress)`
- `ideeIA(d, c, options)` — une recette IA enregistrée
- `placer(d, c, recetteId, source, mode, simuler)` — remplacer / congélo / décaler
- `lireFiltres()` / `memoriserFiltres(f)` — sélecteurs mémorisés sur l'appareil

### js/envie.js
Modale « ⚡ Envie ce soir ».
- `renderModalEnvie(content, fermer)` — cible, sélecteurs, 3 idées bibliothèque, IA, choix du sort du plat prévu

### js/reglages-ui.js
Page réglages : éditeur du modèle de semaine, réserve congélo, conversion IA des anciennes recettes par lots de 5.

### js/storage.js
Wrapper localStorage (thème uniquement).
- `KEYS`, `load(key, def)`, `save(key, v)`, `remove(key)`

---

## JS — Logique métier

### js/app.js
Initialisation, navigation, gestion du thème dark/light, vérification auth.
- `init()` — charge le thème, initialise les listeners, vérifie session
- `setTheme(theme)` — applique et persiste dark/light
- `injectBoutonReglages()` — bouton ⚙️ vers reglages.html dans la barre du haut

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
- `getModele()` / `setModele(m)` — modèle de semaine partagé (table reglages)
- `chargerCycle(samedi)` — créneaux + occupation `{cle: {id, portions, source}}`
- `chargerHistorique(samedi)` — dernière date de chaque recette (8 semaines)
- `enregistrerCreneaux(list)` / `viderCreneaux(list)` / `importerRecettesIA(lignes)`
- `getJoursAvecRepas(semaineKey)` — créneaux remplis
- `idsDuPlanning(planning)` — ids des recettes d'un planning

### js/courses.js
Liste de courses.
- `genererListeCycle(samedi)` — liste du cycle `{samedi, mercredi}` (ignore les plats du congélo)
- `getEtatCourses` / `toggleCourse` / `resetCourses` — cases cochées Supabase

### js/ai.js
Génération IA via Mammouth AI (Edge Function `ai`) + prompts.
- `genererPourCreneaux({creneaux, filtres, style, ingredientsAReutiliser, nomsExistants, envie}, onProgress)` — une recette par créneau, format structuré, légumes cachés
- `genererUneRecette({creneau, ...})` — une seule recette
- `convertirRecettes(recettes)` — complète les anciennes recettes au nouveau format
- `getSaison()` — saison courante

---

## JS — Couche UI (rendu et interactions)

### js/dashboard.js
Contrôleur du tableau de bord d'accueil.
- `render()` — nombre de recettes, repas du jour, aperçu du cycle (samedi soir → samedi midi) ; rafraîchi en temps réel

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
- `renderGrid()` / `afficher()` — charge puis affiche le cycle : liste par session (mobile) ou frise jours × repas avec bandeaux de session (≥ 1024 px) ; temps réel
- `htmlCreneau(c)` / `htmlListe()` / `htmlFrise()` — rendu d'un repas, de la liste, de la frise
- `actionCreneau(action, cle)` — ↻ (bibliothèque puis IA), ✏️, 🗑, portions
- `ouvrirSelectRecette()` — choix manuel, recettes compatibles en premier
- `initModalGen()` — « Remplir le cycle » : « Mes recettes » (bibliothèque) ou « Générer avec l'IA » directement, + « Compléter avec l'IA » après la bibliothèque

### js/courses-ui.js
Rendu et interactions de la liste de courses.
- `render()` — deux parties samedi / mercredi groupées par rayon, quantités ajustées ; file de rendu sans perte d'événement temps réel

---

## Tests

### tests/utils.test.mjs
Tests unitaires de js/utils.js — `node --test tests/*.test.mjs`.

### tests/planning-famille.test.mjs
Tests du cycle, des filtres, de la sélection bibliothèque, du décalage et de la répartition des courses.
