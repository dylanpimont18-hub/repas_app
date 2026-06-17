# Design — Planning UX & Tableau Préférences

Date : 2026-06-18  
Statut : Approuvé

---

## 1. Contexte

Deux améliorations UX indépendantes sur l'application Repas :

1. **Planning** : cellules plus lisibles + accès rapide aux recettes via popover contextuel
2. **Préférences** : tableau récap par catégorie pour modifier les goûts sans passer par les cartes

---

## 2. Planning — Cellules + Popover contextuel

### 2.1 Cellules du planning

- Hauteur minimale portée à **90px** (actuellement 60px)
- Nom de la recette en `font-size: 0.85rem`, gras, sur 2 lignes max (`-webkit-line-clamp: 2`)
- Cellule vide : bouton "+" plus grand et plus visible (couleur primary, centré)

### 2.2 Popover contextuel (cellule avec recette)

**Déclencheur :** clic sur une cellule remplie  
**Contenu :** 3 boutons verticaux ou horizontaux :
- 👁 **Voir** — navigue vers la page recette
- ✏️ **Changer** — ouvre la modale de sélection existante
- 🗑 **Supprimer** — vide le créneau sans confirmation supplémentaire

**Comportement :**
- Une seule instance de popover active à la fois (ferme l'ancien avant d'en ouvrir un nouveau)
- Clic en dehors du popover = fermeture
- Clic sur cellule vide = ouvre directement la modale de sélection (comportement inchangé)
- Positionné près de la cellule cliquée (absolute, évite les débordements en bord d'écran)

**Implémentation :** élément DOM unique réutilisé, repositionné à chaque ouverture via `getBoundingClientRect()`.

### 2.3 Navigation vers la recette

- "Voir" navigue dans le même onglet vers : `recettes.html?id=<recetteId>&from=planning`
- `recettes.html` détecte `from=planning` → affiche un bandeau fixe en haut : `← Retour au planning`  
  (bandeau cliquable, navigue vers `planning.html`)
- `recettes.html` détecte `id=<recetteId>` → ouvre automatiquement le détail de cette recette (scroll + mise en évidence visuelle)

### 2.4 Fichiers touchés

- `css/components.css` — styles `.planning-cell` (hauteur), `.planning-popover`, `.back-banner`
- `js/planning-ui.js` — logique popover, gestion des clics, navigation
- `recettes.html` — bandeau "retour"
- `js/recettes.js` (ou `recettes-ui.js`) — lecture des params URL, scroll/highlight

---

## 3. Préférences — Tableau récap par catégorie

### 3.1 Bascule de vue

- En haut de `preferences.html`, deux boutons de mode :
  - **🃏 Cartes** (mode existant, inchangé)
  - **📋 Tableau** (nouveau)
- Le mode actif est persisté en `localStorage` (`repas_pref_view_mode`)
- Les données de préférences sont communes aux deux modes

### 3.2 Structure du tableau

**En-tête :**

| Ingrédient | ✗ N'aime pas | ○ Neutre | ♥ J'aime | ★ J'adore |

**Corps :**
- Trié par catégorie dans cet ordre fixe :
  1. Légumes
  2. Viandes & Poissons
  3. Féculents
  4. Produits laitiers
  5. Épices & Condiments
  6. Fruits
  7. Divers
- Chaque catégorie commence par une ligne de sous-en-tête (fond coloré, nom de la catégorie)
- Colonne "Ingrédient" : emoji + nom de l'ingrédient

### 3.3 Interaction

- Chaque ligne affiche 4 boutons radio visuels (un par niveau de goût)
- **Goût actif** = bouton coloré selon le niveau :
  - ✗ N'aime pas → rouge (`#ffebeb` / `#c0392b`)
  - ○ Neutre → orange (`#fff3e0` / `#d35400`)
  - ♥ J'aime → vert (`#e8f5e9` / `#27ae60`)
  - ★ J'adore → rose (`#fce4ec` / `#c0392b`)
- **Goûts inactifs** → grisés
- Ingrédient sans préférence définie → aucun bouton actif (tous grisés)
- **Clic** sur un bouton radio → sauvegarde immédiate en localStorage pour le profil actif
- Si on reclique le bouton déjà actif → désélection (retour à "non défini")

### 3.4 Sélection de profil

- Les chips Dylan / Ma femme existantes restent en haut de page
- Basculer de profil recharge le tableau avec les préférences du profil sélectionné
- Comportement identique au mode Cartes

### 3.5 Fichiers touchés

- `preferences.html` — ajout des boutons de bascule de vue, conteneur tableau
- `js/preferences.js` — logique de rendu tableau, gestion des clics radio, bascule de mode
- `css/components.css` — styles `.pref-table`, `.pref-radio-btn`, `.pref-category-header`

---

## 4. Ce qui ne change pas

- Logique de stockage localStorage (`repas_profil_dylan`, `repas_profil_femme`) — inchangée
- Mode Cartes de `preferences.html` — inchangé
- Modale de sélection de recette dans le planning — inchangée
- Aucun backend, aucune dépendance nouvelle

---

## 5. Ordre d'implémentation suggéré

1. Planning : CSS cellules + popover
2. Planning : logique JS popover
3. Planning : navigation + bandeau retour sur recettes.html
4. Préférences : bascule de vue + rendu tableau
5. Préférences : logique radio + sauvegarde
