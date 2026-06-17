# Design Spec — Application Repas

**Date :** 2026-06-17  
**Stack :** HTML5 / CSS3 / JS vanilla · Claude API · Weather API · localStorage  
**Public :** Foyer de 2 personnes (Dylan + sa femme)  
**Contrainte fixe :** Halal strict — aucun porc, aucun alcool, jamais suggéré par l'IA

---

## 1. Architecture générale

### Navigation : Dashboard + menu burger

- Page d'accueil (`index.html`) = hub central avec tuiles d'accès rapide
- Menu burger escamotable pour naviguer entre les 5 sections
- **Bouton ⚡ "Maintenant"** fixe dans la barre de navigation — visible sur toutes les pages, ouvre une modale sans quitter la page en cours

### Pages
| Fichier | Rôle |
|---|---|
| `index.html` | Dashboard : tuiles + résumé semaine en cours |
| `preferences.html` | Cartes de préférences d'ingrédients par profil |
| `planning.html` | Planificateur hebdomadaire |
| `recettes.html` | Bibliothèque des recettes sauvegardées |
| `courses.html` | Liste de courses générée |

---

## 2. Design visuel

### Palette — Terracotta & Sauge
```
--color-primary:    #c97d4e   /* Terracotta — actions principales, header */
--color-bg:         #f9f2e8   /* Crème — fond général */
--color-accent:     #7d9e7d   /* Vert sauge — actions secondaires, tags */
--color-text:       #3d2b1f   /* Brun foncé — texte principal */
--color-border:     #e8ddd0   /* Sable clair — bordures, séparateurs */
```

### Dark mode
- Toggle persisté en `localStorage` (`repas_theme`)
- Fond → `#1e1410` · Texte → `#f9f2e8` · Primaire conservé avec légère désaturation
- Accessible depuis n'importe quelle page (icône dans la nav)

### Typographie
- Titres : serif élégant (Georgia ou similar)
- Corps : sans-serif lisible (system-ui)
- Taille base : 16px

---

## 3. Système de préférences d'ingrédients

### Principe
Chaque profil (Dylan / Ma femme) note individuellement chaque ingrédient sur 4 niveaux :
`j_adore` · `j_aime` · `neutre` · `j_aime_pas`

### Interface
- **Une carte centrale** affiche l'ingrédient (emoji + nom + catégorie)
- **4 boutons colorés** sous la carte pour noter
- **Navigation par catégorie** : l'utilisateur choisit une catégorie, swipe toutes ses cartes, passe à la suivante
- **Barre de progression** par catégorie

### Catégories d'ingrédients
Légumes · Viandes & Poissons · Féculents · Produits laitiers & Œufs · Épices & Condiments · Fruits · Divers (150+ ingrédients au total)

### Données
```js
// localStorage
repas_profil_dylan  = { "tomate": "j_adore", "brocoli": "neutre", ... }
repas_profil_femme  = { "tomate": "j_aime", "brocoli": "j_aime_pas", ... }
```

### Règle IA
- Les ingrédients notés `j_aime_pas` d'un profil **ne doivent jamais** apparaître dans les recettes pour ce profil
- Les ingrédients `j_adore` sont favorisés dans les suggestions
- Profil femme = contraintes plus restrictives → utilisées quand on génère "pour nous deux"

---

## 4. Génération IA — Planification semaine

### Déclencheur
Bouton **"✨ Générer mes 14 repas"** sur la page planning ou depuis le dashboard.

### Paramètres utilisateur
- **Pour qui** : Nous deux / Moi seul (chips cliquables)
- **Contraintes optionnelles** : Végétarien · Rapide (< 30 min) · Budget serré
- **Météo Vierzon** : récupérée automatiquement via API météo (OpenWeatherMap), affichée et modifiable manuellement

### Ce que l'IA reçoit (prompt)
1. Préférences du ou des profils concernés (ingrédients aimés/détestés)
2. Contrainte halal (incluse systématiquement)
3. Météo et saison actuelles à Vierzon
4. Contraintes optionnelles cochées
5. Instruction d'optimisation : minimiser les ingrédients uniques, maximiser la réutilisation entre recettes

### Ce que l'IA retourne (JSON)
```json
{
  "semaine": {
    "lundi":   { "midi": { recette }, "soir": { recette } },
    "mardi":   { "midi": { recette }, "soir": { recette } },
    ...
  },
  "ingredients_communs": ["tomates", "courgettes", ...]
}
```

Chaque `recette` contient : `nom`, `ingredients` (avec quantités), `etapes` (numérotées), `temps_prep`, `temps_cuisson`, `valeurs_nutritionnelles`, `vegetarien` (bool), `pour` (nombre de personnes).

### Résultat
Le planning de la semaine est pré-rempli. L'utilisateur peut modifier chaque créneau manuellement ensuite.

---

## 5. Recette de dernière minute ⚡

### Déclencheur
Bouton **"⚡ Maintenant"** fixe dans la barre de navigation — toutes les pages, à tout moment, que le créneau soit vide ou non.

### Interface
Modale légère (sans quitter la page) :
- Chips : Pour qui · Végétarien
- L'IA génère une recette rapide
- Actions : "Ajouter au planning" · "Autre idée ↻"

### Contexte transmis à l'IA
- Profil(s) concerné(s)
- Ingrédients déjà présents dans la liste de courses de la semaine (pour favoriser ce qu'on a déjà acheté)
- Météo actuelle

---

## 6. Planificateur hebdomadaire

### Mise en page
Grille complète : **7 colonnes (jours) × 2 lignes (midi / soir)**
- Toute la semaine visible d'un coup d'œil
- Chaque créneau : nom de la recette + indicateur "pour N pers."
- Créneau vide : `+` en pointillés terracotta
- Navigation semaine précédente / suivante

### Interactions
- Clic sur un créneau → sélectionner une recette depuis la bibliothèque ou générer via ⚡
- Clic sur une recette assignée → voir le détail ou modifier les portions

### Données
```js
repas_planning = {
  "2026-W25": {
    "lundi":   { "midi": { id: "abc", portions: 2 }, "soir": null },
    "mardi":   { ... },
    ...
  }
}
```

---

## 7. Bibliothèque de recettes

Toutes les recettes sauvegardées (générées par IA ou saisies manuellement).

- **Filtres** : Végétarien · Compatibilité femme · Durée · Catégorie
- **Vue liste** : cartes compactes avec nom, durée, tags
- **Vue détail** : recette complète, bouton "Ajouter au planning"

---

## 8. Liste de courses

Générée automatiquement depuis le planning de la semaine active.

- **Agrégation** : ingrédients combinés avec quantités ajustées selon les portions de chaque repas
- **Groupement** : par catégorie de supermarché (Fruits & légumes · Viandes · Féculents · Laitiers · Épicerie · Surgelés)
- **Cases à cocher** : état persisté en session (réinitialisé en début de semaine)

---

## 9. Architecture technique

### Fichiers
```
Repas/
├── index.html
├── preferences.html
├── planning.html
├── recettes.html
├── courses.html
├── config.js              ← clé API Claude (non versionnée)
├── css/
│   ├── style.css          ← variables CSS, reset, layout, dark mode
│   └── components.css     ← cartes, modale, grille, boutons
└── js/
    ├── app.js             ← init, nav burger, dark mode, modale ⚡
    ├── data/
    │   └── ingredients.js ← base 150+ ingrédients
    ├── preferences.js     ← CRUD préférences par profil
    ├── ai.js              ← Claude API + weather API + prompt builder
    ├── recettes.js        ← CRUD bibliothèque recettes
    ├── planning.js        ← gestion grille hebdomadaire
    └── courses.js         ← agrégation et rendu liste de courses
```

### APIs externes
- **Claude API** (Anthropic) — génération de recettes, prompt JSON structuré
- **OpenWeatherMap API** (gratuit) — météo actuelle à Vierzon (lat 47.22, lon 2.07)

### localStorage — clés
```
repas_profil_dylan    // préférences ingrédients Dylan
repas_profil_femme    // préférences ingrédients femme
repas_recettes        // bibliothèque de recettes
repas_planning        // planning par semaine (clé YYYY-Www)
repas_courses_etat    // état des cases à cocher (session)
repas_theme           // "light" | "dark"
```

---

## 10. Contraintes et règles non négociables

1. **Halal absolu** : le prompt Claude inclut systématiquement l'interdiction de porc et d'alcool, dans tous les flux (semaine + dernière minute)
2. **Préférences femme prioritaires** quand on génère "pour nous deux" — un ingrédient que la femme n'aime pas n'apparaît jamais, même si Dylan l'adore
3. **Pas de backend** : 100% localStorage, 0 serveur applicatif
4. **Clé API hors versioning** : `config.js` jamais commité
