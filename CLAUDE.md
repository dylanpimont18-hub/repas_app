# Repas — Application de gestion des repas familiaux

## Contexte
Application web **PWA mobile-first** pour un foyer de 2 personnes (Dylan + sa femme). Objectifs : ne plus manquer d'idées de repas, organiser la semaine, générer la liste de courses automatiquement.

## Contraintes métier fixes (non négociables)
- **Halal strict** : aucune recette contenant du porc ou de l'alcool — jamais suggéré par l'IA
- **Profil femme** : préférences plus restrictives que Dylan — l'IA doit en tenir compte si le repas est "pour deux"
- **Authentification requise** : toutes les pages redirigent vers `login.html` si pas de session Supabase

## Stack technique
- **HTML5 / CSS3 / JS vanilla** — aucun framework, aucun build tool
- **Supabase** — authentification + base de données (toutes les données métier)
- **Mammouth AI** (API compatible OpenAI, modèle `claude-sonnet-5-5`) — génération de recettes, appelée **uniquement** via l'Edge Function Supabase `ai`
- **OpenWeatherMap API** — météo à Vierzon, également via l'Edge Function `ai`
- **Aucune clé secrète côté navigateur** : `MAMMOUTH_API_KEY` et `OPENWEATHER_API_KEY` sont des secrets Supabase
- Fichiers servis directement (Live Server VSCode ou `npx serve .`)
- PWA : `manifest.json` + balises `apple-mobile-web-app-*` sur toutes les pages

## Architecture des modules

### 1. Authentification (`login.html`)
Page de connexion email/mot de passe via Supabase Auth.
- Redirige vers `index.html` après connexion
- Toutes les autres pages redirigent ici si pas de session active

### 2. Préférences d'ingrédients (`preferences.html`)
Système de cartes pour noter chaque ingrédient par profil.
- **2 profils** : Dylan / Ma femme (switchable)
- **4 niveaux** : J'adore / J'aime bien / Neutre / Je n'aime pas
- **Vue Cartes** : une carte à la fois avec 4 boutons de notation
- **Vue Tableau** : tous les ingrédients avec boutons radio inline (scroll horizontal)
- **Navigation par catégorie** : Légumes, Viandes & Poissons, Féculents, Produits laitiers, Épices & Condiments, Fruits, Divers
- Base de 150+ ingrédients + possibilité d'en ajouter des personnalisés
- Badge rouge sur l'icône nav indiquant le nombre d'ingrédients non notés

### 3. Bibliothèque de recettes (`recettes.html`)
Toutes les recettes sauvegardées (générées par IA ou saisies manuellement).
- Filtres : Végétarien, Rapide
- Vue liste + modale détail + modale édition complète
- Édition : nom, portions, temps prep/cuisson, valeurs nutritionnelles, ingrédients, étapes

### 4. Planificateur hebdomadaire (`planning.html`)
Vue liste 7 jours × 2 repas (midi + soir).
- Navigation semaine précédente / suivante
- Génération IA de toute la semaine (créneaux vides sélectionnables)
- Assignation manuelle depuis la bibliothèque ou via recette de dernière minute ⚡
- Portions réglables par repas

### 5. Liste de courses (`courses.html`)
Générée automatiquement depuis le planning de la semaine active.
- Ingrédients agrégés et ajustés selon les portions
- Regroupés par catégorie de supermarché
- Cases à cocher persistées en base (Supabase `courses_etat`)

### 6. Dashboard (`index.html`)
Hub central : tuiles d'accès rapide + aperçu de la semaine en cours.

## Structure de fichiers
```
Repas/
├── index.html              # Dashboard
├── login.html              # Page de connexion Supabase
├── preferences.html        # Préférences d'ingrédients par profil
├── recettes.html           # Bibliothèque de recettes
├── planning.html           # Planificateur hebdomadaire
├── courses.html            # Liste de courses
├── manifest.json           # PWA manifest (icônes à compléter)
├── config.js               # Non versionné : SUPABASE_URL, SUPABASE_ANON_KEY (publiques)
├── supabase/
│   ├── functions/ai/       # Edge Function : proxy Mammouth AI + météo
│   └── migrations/         # Migrations SQL (foyer, ingrédients perso, temps réel)
├── css/
│   ├── style.css           # Variables CSS, reset, nav, bottom nav, layout, dark mode
│   └── components.css      # Boutons, chips, cartes, modales, planning, courses, formulaires
└── js/
    ├── app.js              # Init globale : thème, bottom nav, modale ⚡, badge préfs, logout
    ├── db.js               # Client Supabase + toutes les opérations base de données
    ├── storage.js          # Helpers localStorage (thème uniquement en pratique)
    ├── auth-login.js       # Logique page de connexion
    ├── dashboard.js        # Logique dashboard
    ├── preferences.js      # Logique métier préférences (lecture/écriture via db.js)
    ├── preferences-ui.js   # Rendu UI préférences (cartes + tableau)
    ├── custom-ingredients.js # Ingrédients personnalisés (table ingredients_custom, partagés)
    ├── utils.js            # Fonctions pures testables (esc, semaine ISO, quantités, catégories…)
    ├── ai.js               # Appels IA via Edge Function + météo + prompt engineering
    ├── recettes.js         # CRUD recettes (via db.js)
    ├── recettes-ui.js      # Rendu UI recettes (liste, détail, édition)
    ├── planning.js         # Logique métier planning (via db.js)
    ├── planning-ui.js      # Rendu UI planning + génération semaine IA
    ├── courses.js          # Agrégation ingrédients depuis planning
    ├── courses-ui.js       # Rendu UI liste de courses
    └── data/
        └── ingredients.js  # Base de données statique des ingrédients (150+)
```

## Architecture données — Supabase

### Tables
```
preferences       { profil_nom, ingredient_id, niveau }
recettes          { id, nom, ingredients, etapes, temps_prep, temps_cuisson,
                    portions, vegetarien, nutrition, date }
planning          { semaine_key, jour, moment, recette_id, portions }
courses_etat      { semaine_key, ingredient_nom, checked }
ingredients_custom { id, nom, categorie, emoji }
foyer_membres     { user_id, profil_nom }   -- seuls ces comptes passent la RLS (est_membre_foyer())
```

### Synchronisation
Toutes les tables sont dans la publication `supabase_realtime`. Les pages s'abonnent via `dbEcouter()` (db.js) pour refléter les changements faits depuis l'autre téléphone.

### localStorage (résiduel)
```js
repas_theme   // "light" | "dark" — seule donnée encore en localStorage
```

## Design
- **Ambiance** : chaleureux, appétissant — tons chauds (terracotta, crème, vert sauge)
- **Mobile-first / PWA** : optimisé iPhone, installable sur l'écran d'accueil
- **Bottom navigation** : 5 onglets fixes en bas (Accueil, Planning, Recettes, Prefs, Courses)
- **Modales bottom sheet** : s'ouvrent depuis le bas de l'écran (pattern iOS natif)
- **Dark mode** : toggle dans la nav du haut, persisté en localStorage
- **Typographie** : serif élégant (Georgia) pour les titres, sans-serif system pour le texte

## Conventions de code
- Indentation : 2 espaces
- Nommage : camelCase JS, kebab-case CSS et fichiers HTML
- Commentaires en français
- `config.js` (non versionné) ne contient que des valeurs publiques ; les secrets vont dans Supabase
- Tests : `node --test tests/*.test.mjs` (fonctions pures de `js/utils.js`)

## Prompt IA (règles de base)
Chaque appel IA inclut toujours :
- Contrainte halal (no porc, no alcool)
- Préférences du/des profils concernés (ingrédients aimés/détestés)
- Météo actuelle à Vierzon (OpenWeatherMap)
- Niveau végétarien et autres contraintes optionnelles
- Format de sortie JSON structuré pour parsing facile
