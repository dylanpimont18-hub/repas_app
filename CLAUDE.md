# Repas — Application de gestion des repas familiaux

## Contexte
Application web **PWA mobile-first** pour un foyer de 4 personnes (Dylan, sa femme, 2 enfants qui mangent comme les adultes ; seuls les 2 adultes ont un profil de goûts). Objectifs : ne plus manquer d'idées de repas, organiser la semaine, générer la liste de courses automatiquement.

## Contraintes métier fixes (non négociables)
- **Halal strict** : aucune recette contenant du porc ou de l'alcool — jamais suggéré par l'IA
- **Profil femme** : préférences plus restrictives que Dylan. Ses légumes « Je n'aime pas » sont des **candidats à cacher** (autorisés seulement avec une astuce `legumes_caches`) ; ses autres « Je n'aime pas » sont exclus
- **Cycle samedi soir → samedi midi** : midis lun/mar/jeu/ven = 1 portion (femme seule), autres repas = 4. Cuisine en avance le dimanche (→ lun, mar) et le mercredi (→ jeu, ven) ; mer, sam, dim cuisinés sur place. Modèle éditable dans Réglages
- **Courses** : une liste par cycle, en deux parties — 🛒 samedi magasin (sam soir → mar) et 🚗 mercredi drive (mer → sam midi)
- **Bibliothèque d'abord** : les propositions viennent des recettes enregistrées (js/selection.js) ; l'IA n'intervient qu'en dernier recours
- **Contraintes vs envies** : sans viande, végétarien, sans féculents, rapide, budget s'appliquent à tous les repas ; bouillon, réconfortant, gras, healthy sont des envies ponctuelles (1 à 3 repas par cycle, espacés ou à la suite)
- **Authentification requise** : toutes les pages redirigent vers `login.html` si pas de session Supabase

## Stack technique
- **HTML5 / CSS3 / JS vanilla** — aucun framework, aucun build tool
- **Supabase** — authentification + base de données (toutes les données métier)
- **Mammouth AI** (API compatible OpenAI, modèle `claude-sonnet-5-5`) — génération de recettes, appelée **uniquement** via l'Edge Function Supabase `ai`
- **Aucune clé secrète côté navigateur** : `MAMMOUTH_API_KEY` est un secret Supabase
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
- Filtres déduits des recettes affichées (régime, temps, protéine, cuisine, style, avis, pratique) : un filtre n'apparaît que si au moins une recette le porte ; filtre « Contient les ingrédients » (toutes les puces doivent être présentes) ; filtres mémorisés sur l'appareil
- Avis du foyer (« A plu » / « N'a pas plu », `recettes.avis`) : pèse dans la sélection de la bibliothèque
- Photos IA (`recettes.image_url`, stockage public `recettes-images`, écrit par l'Edge Function) et impression d'une fiche recette A4
- Livres de recettes (ex. « Air fryer ») : une règle par livre guide la génération IA ; leurs recettes restent proposées dans le planning
- Vue liste + modale détail + modale édition complète
- Édition : nom, portions, temps prep/cuisson, valeurs nutritionnelles, ingrédients (quantité + nom), étapes ; « Nouvelle » et « Importer » (lien ou texte)
- Détail : nombre de personnes réglable, ingrédients pondérés (cuisiner, imprimer, ou enregistrer pour ce nombre)

### 4. Planificateur (`planning.html`)
Cycle samedi soir → samedi midi, groupé par session de cuisine (spec : docs/superpowers/specs/2026-10-24-planning-famille-batch-design.md).
- Navigation semaine précédente / suivante
- Génération IA de toute la semaine (créneaux vides sélectionnables)
- Assignation manuelle depuis la bibliothèque ou via recette de dernière minute ⚡
- Portions réglables par repas
- « Cuisiner » sur chaque session ou repas sur place → mode cuisine (js/mode-cuisine.js) : écran allumé, étapes en grand, plats de la session regroupés (portions additionnées, cuisson la plus longue d'abord) ; étapes écrites par l'IA si la recette n'en a pas
- ⚡ Envie : 2 à 5 idées IA au choix, seule celle choisie est enregistrée

### 5. Liste de courses (`courses.html`)
Générée automatiquement depuis le planning de la semaine active.
- Ingrédients agrégés et ajustés selon les portions
- Regroupés par catégorie de supermarché
- Cases à cocher persistées en base (Supabase `courses_etat`)
- Articles ajoutés à la main par partie (`courses_libres`) ; ingrédients « toujours au placard » (réglage `placard`) sortis de la liste, rappelés dans une section repliée

### 6. Vider le placard (`placard.html`) — mode indépendant
Inventaire de ce qu'il y a à la maison (quantités facultatives, saisi en vrac), partagé (`reglages.inventaire`).
- « Trouver les recettes » : toutes les recettes existantes d'abord (celles qui utilisent le plus d'articles, halal et goûts respectés), puis l'IA pour les articles restants, répartis entre ses recettes (≈ 3 par recette, rayons variés), rangées dans le livre « Vider le placard »
- Recettes retenues (`reglages.placard_selection`) : couverture du placard, ce qu'il reste à acheter, « Cuisiner » (mode cuisine), « C'est cuisiné : retirer du placard »
- **Indépendant** : les recettes du livre « Vider le placard » ne sont jamais proposées par le planning ni ⚡ Envie (`sansRecettesPlacard` dans `chargerDonnees`), rien n'est mis au planning, l'inventaire ne change pas la liste de courses

### 7. Dashboard (`index.html`)
Prochain repas (cuisiner / voir la recette / ⚡ si vide), prochaine session de cuisine, « Comment c'était ? » (avis sur les plats des 3 derniers jours), aperçu du cycle.

## Structure de fichiers
```
Repas/
├── index.html              # Dashboard
├── login.html              # Page de connexion Supabase
├── preferences.html        # Préférences d'ingrédients par profil
├── recettes.html           # Bibliothèque de recettes
├── planning.html           # Planificateur hebdomadaire
├── courses.html            # Liste de courses
├── placard.html            # Vider le placard (inventaire → recettes)
├── manifest.json           # PWA manifest (icônes normales + maskable)
├── sw.js                   # Service worker : hors-ligne (code + dernières données)
├── config.js               # Non versionné : SUPABASE_URL, SUPABASE_ANON_KEY (publiques)
├── supabase/
│   ├── functions/ai/       # Edge Function : proxy Mammouth AI
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
    ├── ai.js               # Appels IA via Edge Function + prompt engineering
    ├── recettes.js         # CRUD recettes (via db.js)
    ├── recettes-ui.js      # Rendu UI recettes (liste, détail, édition)
    ├── planning.js         # Logique métier planning (via db.js)
    ├── planning-ui.js      # Rendu UI planning + génération semaine IA
    ├── courses.js          # Agrégation ingrédients depuis planning
    ├── courses-ui.js       # Rendu UI liste de courses
    ├── cuisine.js          # Plats d'une session et quantités ajustées (pur, testé)
    ├── mode-cuisine.js     # Mode cuisine plein écran
    ├── avis.js             # Plats à noter après le repas (pur, testé)
    ├── dialogue.js         # Confirmations, nombres, messages (remplace alert/confirm/prompt)
    ├── modales.js          # Accessibilité de toutes les modales (dialogue, focus, Échap, Tab)
    ├── hors-ligne.js       # Service worker + bandeau hors connexion
    ├── minuteurs.js        # Minuteurs du mode cuisine
    ├── controle-ia.js      # Contrôle des recettes IA : halal, goûts, légumes cachés (pur, testé)
    ├── import-pur.js       # Import de recette : JSON-LD, texte collé (pur, testé)
    ├── import-recette.js   # Fenêtre « Importer une recette »
    ├── placard.js          # Vider le placard : inventaire, couverture, choix des recettes (pur, testé)
    ├── placard-ui.js       # Page « Vider le placard »
    ├── vendor/             # supabase-js épinglé (copie locale)
    └── data/
        └── ingredients.js  # Base de données statique des ingrédients (150+)
```

## Architecture données — Supabase

### Tables
```
preferences       { profil_nom, ingredient_id, niveau }
recettes          { id, nom, ingredients, etapes, temps_prep, temps_cuisson,
                    portions, vegetarien, nutrition, date, avis }
planning          { semaine_key, jour, moment, recette_id, portions, source, avis }
courses_etat      { semaine_key, ingredient_nom, checked }
courses_libres    { id, semaine_key, nom, partie }   -- articles ajoutés à la main (pain, lessive…)
ingredients_custom { id, nom, categorie, emoji }
foyer_membres     { user_id, profil_nom }   -- seuls ces comptes passent la RLS (est_membre_foyer())
livres            { id, nom, consigne }    -- livres de recettes ; recettes.livre_id (un livre au plus)
ia_usage          { cree_le, action, nb_recettes, tokens_entree, tokens_sortie, cout, estime, statut, erreur }
                  -- journal des appels IA → crédit Mammouth (budget dans reglages.ia_budget)
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
- **Icônes** : SVG du sprite `js/icones.js` uniquement — pas d'emoji comme icône d'interface (les emojis d'ingrédients restent du contenu)
- **Couleurs** : toujours via les tokens de `css/style.css` (`--color-primary`, `--color-on-primary`, `--color-accent`, `--color-danger`, `--color-info`…), contrastes vérifiés ≥ 4,5:1 en clair et en sombre
- **Tactile** : cibles ≥ 44 px sur mobile (ou zone élargie par `::after`), encoche gérée par `env(safe-area-inset-*)`
- **Grand écran** (≥ 1024 px) : menu en haut, fenêtres centrées, frise du planning

## Conventions de code
- Indentation : 2 espaces
- Nommage : camelCase JS, kebab-case CSS et fichiers HTML
- Commentaires en français
- `config.js` (non versionné) ne contient que des valeurs publiques ; les secrets vont dans Supabase
- Tests : `node --test tests/*.test.mjs` (fonctions pures) et `node tests/e2e/parcours.mjs` (parcours dans Chromium, Supabase simulé)
- Jamais d'`alert` / `confirm` / `prompt` : `js/dialogue.js` (`confirmer`, `choisirNombre`, `informer`, `signalerErreur`)
- Nouveau fichier JS ou page : l'ajouter à `COQUILLE` dans `sw.js` (tests/sw.test.mjs le vérifie) et changer `VERSION`
- Après une écriture, mettre à jour l'état local plutôt que tout recharger ; ignorer l'écho temps réel de ses propres écritures
- Déploiement Supabase : fonction `ai` d'abord, puis les migrations (20261028b rend `ia_usage` en lecture seule)

## Prompt IA (règles de base)
Chaque appel IA inclut toujours :
- Contrainte halal (no porc, no alcool)
- Préférences du/des profils concernés (ingrédients aimés/détestés)
- Saison courante (produits de saison) — pas de météo
- Niveau végétarien et autres contraintes optionnelles
- Format de sortie JSON structuré pour parsing facile
