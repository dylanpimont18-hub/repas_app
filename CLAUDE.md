# Repas — Application de gestion des repas familiaux

## Contexte
Application web desktop pour un foyer de 2 personnes (Dylan + sa femme). Objectifs : ne plus manquer d'idées de repas, organiser la semaine, générer la liste de courses automatiquement.

## Contraintes métier fixes (non négociables)
- **Halal strict** : aucune recette contenant du porc ou de l'alcool — jamais suggéré par l'IA
- **Profil femme** : préférences plus restrictives que Dylan — l'IA doit en tenir compte si le repas est "pour deux"
- **Pas de backend** : toutes les données en localStorage

## Stack technique
- **HTML5 / CSS3 / JS vanilla** — aucun framework, aucun build tool
- **Claude API (Anthropic)** — génération de recettes par IA
- Fichiers servis directement (Live Server VSCode ou `npx serve .`)

## Architecture des modules (5 sections)

### 1. Préférences d'ingrédients (`preferences.html`)
Système de cartes à swiper (style Tinder) pour chaque profil.
- **2 profils** : Dylan / Ma femme (switchable)
- **4 niveaux** : J'adore / J'aime bien / Neutre / Je n'aime pas
- **Navigation par catégorie** : Légumes, Viandes & Poissons, Féculents, Produits laitiers, Épices & Condiments, Fruits, Divers
- Grande base d'ingrédients (150+)
- Données stockées séparément par profil

### 2. Générateur de recettes IA (`generateur.html`)
Interface pour demander une recette via Claude API.
- Paramètres : pour qui (les deux / Dylan seul), végétarien oui/non
- L'IA reçoit les préférences du ou des profils concernés
- Recette générée avec : ingrédients + quantités, étapes numérotées, temps de préparation/cuisson, valeurs nutritionnelles
- Possibilité de sauvegarder la recette générée dans la bibliothèque

### 3. Bibliothèque de recettes (`recettes.html`)
Toutes les recettes sauvegardées (générées ou saisies manuellement).
- Filtres : végétarien, compatibilité femme, durée, catégorie
- Vue liste + vue détail

### 4. Planificateur hebdomadaire (`planning.html`)
Grille 7 jours × 2 repas (midi + soir).
- Drag & drop ou sélection depuis la bibliothèque
- Portions réglables par repas (ça varie)
- Navigation semaine précédente / suivante

### 5. Liste de courses (`courses.html`)
Générée automatiquement depuis le planning actif.
- Ingrédients agrégés et ajustés selon les portions
- Regroupés par catégorie de supermarché
- Cases à cocher (cochées = déjà acheté, persistées le temps de la session)

## Structure de fichiers
```
Repas/
├── index.html              # Page d'accueil / dashboard
├── preferences.html        # Cartes de préférences par profil
├── generateur.html         # Générateur IA de recettes
├── recettes.html           # Bibliothèque de recettes
├── planning.html           # Planificateur hebdomadaire
├── courses.html            # Liste de courses
├── css/
│   ├── style.css           # Variables, reset, layout global, dark mode
│   └── components.css      # Cartes, modales, boutons, grilles
├── js/
│   ├── app.js              # Init, navigation, thème dark/light
│   ├── data/
│   │   └── ingredients.js  # Base de données des ingrédients (150+)
│   ├── preferences.js      # Gestion profils et préférences ingrédients
│   ├── ai.js               # Appels Claude API, prompt engineering
│   ├── recettes.js         # CRUD bibliothèque recettes
│   ├── planning.js         # Planificateur hebdomadaire
│   └── courses.js          # Génération liste de courses
└── config.js               # Clé API Claude (non commitée)
```

## Design
- **Ambiance** : chaleureux, appétissant — tons chauds (terracotta, crème, vert sauge)
- **Dark mode** : toggle accessible partout, persisté en localStorage
- **Desktop-first** : layout optimisé grand écran, readable sur tablette
- **Typographie** : serif élégant pour les titres, sans-serif lisible pour le texte

## Conventions de code
- Indentation : 2 espaces
- Nommage : camelCase JS, kebab-case CSS et fichiers HTML
- Commentaires en français
- Clé localStorage préfixe `repas_`
- La clé API Claude est dans `config.js` (non versionnée) : `const CLAUDE_API_KEY = "..."`

## Architecture localStorage
```js
repas_profil_dylan      // {[ingredient_id]: "adore"|"aime"|"neutre"|"naime_pas"}
repas_profil_femme      // {[ingredient_id]: "adore"|"aime"|"neutre"|"naime_pas"}
repas_recettes          // [{id, nom, pour, vegetarien, ingredients, etapes, temps, nutrition, date}]
repas_planning          // {[YYYY-WW]: {lundi: {midi: id|null, soir: id|null, portions: n}, ...}}
repas_theme             // "light" | "dark"
```

## Prompt IA (règles de base)
Chaque appel à Claude API inclut toujours :
- Contrainte halal (no porc, no alcool)
- Préférences du/des profils concernés (ingrédients aimés/détestés)
- Niveau végétarien si demandé
- Format de sortie JSON structuré pour parsing facile
