# CODEBASE_MAP — Repas

Index de navigation. Mis à jour après chaque tâche modifiant des fichiers.

> Projet en cours d'initialisation — fichiers à créer.

---

## index.html
Dashboard d'accueil : liens rapides vers les 5 sections, résumé du planning de la semaine.

## preferences.html
Système de cartes Tinder pour noter les ingrédients par profil (Dylan / Ma femme).

## generateur.html
Interface de génération de recette via Claude API avec paramètres (pour qui, végétarien).

## recettes.html
Bibliothèque des recettes sauvegardées avec filtres et vue détail.

## planning.html
Grille hebdomadaire 7 × 2 (midi/soir) avec sélection de recettes et réglage des portions.

## courses.html
Liste de courses agrégée depuis le planning, groupée par catégorie, avec cases à cocher.

## config.js
Clé API Claude (non versionnée). Contient `CLAUDE_API_KEY`.

## css/style.css
Variables CSS (couleurs chauds + dark mode), reset, layout global, toggle thème.

## css/components.css
Composants réutilisables : cartes swipe, cartes recette, grille planning, modale, boutons.

## js/app.js
Initialisation, navigation entre pages, gestion du thème dark/light.
- `init()` — charge le thème et initialise les listeners
- `setTheme(theme)` — applique et persiste dark/light

## js/data/ingredients.js
Base de données statique des ingrédients (150+), organisée par catégorie.
- Chaque ingrédient : `{id, nom, categorie, emoji}`
- Catégories : légumes, viandes, féculents, laitiers, épices, fruits, divers

## js/preferences.js
Gestion des profils de préférences d'ingrédients.
- `getProfil(qui)` — retourne les préférences du profil ("dylan"|"femme")
- `setPreference(qui, ingredientId, niveau)` — enregistre une note
- `getPreferencesFiltered(qui, niveau)` — retourne les ingrédients par niveau
- `getIngredientsParCategorie(categorie)` — retourne les ingrédients d'une catégorie

## js/ai.js
Intégration Claude API et prompt engineering.
- `buildPrompt(params)` — construit le prompt avec contraintes halal + préférences
- `genererRecette(params)` — appelle Claude API, retourne recette parsée
- `parseReponseIA(response)` — extrait le JSON de la réponse Claude

## js/recettes.js
CRUD de la bibliothèque de recettes en localStorage.
- `getRecettes(filtres)` — retourne les recettes filtrées
- `addRecette(recette)` — sauvegarde une recette
- `deleteRecette(id)` — supprime une recette
- `getRecetteById(id)` — retourne une recette par id

## js/planning.js
Gestion du planificateur hebdomadaire.
- `getPlanning(semaine)` — retourne le planning d'une semaine (format YYYY-WW)
- `assignerRepas(semaine, jour, moment, recetteId, portions)` — assigne une recette
- `supprimerRepas(semaine, jour, moment)` — vide un créneau
- `getSemaineCourante()` — retourne la clé YYYY-WW de cette semaine

## js/courses.js
Génération et gestion de la liste de courses.
- `genererListe(semaine)` — agrège les ingrédients du planning avec quantités ajustées
- `grouperParCategorie(liste)` — regroupe par catégorie de supermarché
