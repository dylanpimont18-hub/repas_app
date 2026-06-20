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
- **Claude API (Anthropic)** — génération de recettes par IA
- **OpenWeatherMap API** — météo actuelle à Vierzon pour contextualiser les suggestions IA
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
├── config.js               # Clés API (non versionnée) : CLAUDE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
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
    ├── custom-ingredients.js # Ingrédients personnalisés ajoutés par l'utilisateur
    ├── ai.js               # Appels Claude API + météo OpenWeatherMap + prompt engineering
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
                    portions, vegetarien, valeurs_nutritionnelles, date }
planning          { semaine_key, jour, moment, recette_id, portions }
courses_etat      { semaine_key, ingredient_nom, checked }
```

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
- La clé API et les credentials Supabase sont dans `config.js` (non versionné)

## Prompt IA (règles de base)
Chaque appel à Claude API inclut toujours :
- Contrainte halal (no porc, no alcool)
- Préférences du/des profils concernés (ingrédients aimés/détestés)
- Météo actuelle à Vierzon (OpenWeatherMap)
- Niveau végétarien et autres contraintes optionnelles
- Format de sortie JSON structuré pour parsing facile
