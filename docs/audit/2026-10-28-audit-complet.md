# Audit complet — Repas (28/10/2026)

Périmètre : dépôt `repas_app` au commit `19a66b3` (6 pages, 33 modules JS ≈ 4 900 lignes, 1 340 lignes de CSS, 6 migrations, 1 Edge Function, 57 tests Node qui passent tous).
Méthode : lecture intégrale du code, scripts de vérification (contrastes WCAG, graphe d'imports, filtre halal, analyse des ingrédients), comparaison avec les specs `docs/superpowers/specs/*`.
Légende : **[Constat]** vérifié dans le code ou par script · **[Hypothèse]** non vérifiable ici (appareil réel, réseau, tableau de bord Supabase).

---

## 1. Synthèse exécutive

**Forces.** Le cœur métier est très bien pensé et testé : le cycle samedi→samedi et les sessions de cuisine (`js/cycle.js`), une sélection « bibliothèque d'abord » vraiment riche (rotation de 21 jours, goûts par profil, légumes à cacher, anti-gaspi, envies réparties, `js/selection.js`), un décalage en cascade du ⚡, des courses en deux parties, un suivi du coût de l'IA et des erreurs IA bien expliquées. Les données sont échappées partout (`esc()`), la RLS réserve tout au foyer, et aucun secret n'est exposé côté navigateur.

**Les 5 problèmes les plus graves**
1. **Filtre halal incomplet** (bloquant) : saucisse de Toulouse, salami, chorizo-like (pepperoni, mortadelle, speck, prosciutto), gin, brandy, xérès, Cointreau… passent le contrôle `contientInterdit` (`js/filtres.js:29-31`).
2. **Modifier une recette abîme ses ingrédients** (bloquant) : « 400 g Tomates » est réenregistré en quantité « 400 » et nom « g Tomates » (`js/recettes-ui.js:249,321-326`), ce qui casse les courses et le rapprochement avec les goûts.
3. **Les recettes de l'IA ne sont pas contrôlées vis-à-vis des goûts** : seuls le halal et les filtres sont vérifiés (`js/ai.js:287-296`). Un « Je n'aime pas » ou un légume à cacher sans astuce peut donc passer.
4. **Le mode cuisine oublie les portions des midis « reste »** (`js/cuisine.js:17`), alors que les courses les comptent (`js/courses.js:19`). La session du dimanche cuisine 4 parts au lieu de 5, et le midi de la femme manque.
5. **Courses en magasin fragiles** : aucun hors-ligne (pas de service worker), chaque coche relance environ 13 requêtes, la case fait 20 px et n'a pas de libellé.

**Les 5 opportunités**
1. **Hors-ligne et coche instantanée** pour les courses (service worker et mises à jour optimistes) : c'est le plus gros gain ressenti, sans aucun framework.
2. **Nouvelle recette et import** (URL, ou texte collé puis structuré par l'IA). Aujourd'hui, une recette de famille ne peut entrer que par « Dupliquer ».
3. **Export vers le drive du mercredi** (partage texte, regroupement par rayon) et achat des produits frais au plus près du repas.
4. **Minuteurs et plan de session** dans le mode cuisine (étapes de plusieurs plats entrelacées, à la manière de Cookidoo ou Paprika).
5. **Un garde-fou côté serveur** : règles halal et plafond mensuel appliqués dans l'Edge Function, journal `ia_usage` écrit côté serveur.

---

## 2. Audit fonctionnel — parcours réels

Notes de 1 à 5 sur quatre critères : **E**fficacité · **T**aps · **C**larté · **R**obustesse.

### P1. Remplir un cycle complet (bibliothèque puis IA) — **4,0 / 5** (E4 T5 C4 R3)
Parcours : Planning → « Remplir » → « Mes recettes » → « Compléter avec l'IA (n) », soit **4 taps**. C'est excellent.
- ✅ Les créneaux vides sont pré-cochés, l'estimation du coût s'affiche, l'IA tourne en arrière-plan avec un bandeau de suivi (`planning-ui.js:267-288`), et chaque lot est enregistré dès réception.
- ⚠ Quitter la page interrompt la génération (`planning-ui.js:263`). Le `beforeunload` prévient, mais sur une PWA iOS, passer à une autre app peut suspendre le flux, ce qui laisse des lots « COUPEE ». [Hypothèse]
- ⚠ Après « Mes recettes », la modale se ferme toute seule au bout de 900 ms quand tout est rempli (`:401`). Aucun récapitulatif ni « Annuler » : si le remplissage déplaît, il faut vider créneau par créneau.
- ⚠ Les filtres « Contraintes » n'ont pas `aria-pressed` (`:363`), alors que les envies l'ont (`:316`).
- ⚠ Deux téléphones qui lancent « Remplir » en même temps travaillent chacun sur leur propre copie des données et s'écrasent mutuellement (voir P8).
- Manque : un **aperçu avant écriture** (« voici le cycle proposé — Garder / Relancer »).

### P2. Changer un repas au dernier moment (⚡ Envie, décaler, congélo) — **3,5 / 5** (E4 T4 C4 R2)
⚡ → (puce de filtre) → carte → « Décaler / Congélo / Supprimer » : **3 taps**, avec un aperçu de la cascade (`envie.js:118-135`). C'est un vrai point fort.
- ⚠ Chaque puce redessine toute la modale par `innerHTML` (`envie.js:40`) : le focus et la position de défilement sont perdus.
- ⚠ À chaque ouverture, `chargerDonnees` recharge **toutes** les recettes en `select *`, plus 4 autres requêtes (`propositions.js:23-35`).
- ⚠ Les idées de l'IA sont générées **complètes, étapes comprises** (2 à 5 recettes) alors qu'une seule est gardée (`propositions.js:104`) : environ 2/3 de la sortie est payée pour rien (voir §6).
- ⚠ Les cartes sont des `<div>` cliquables (`envie.js:111`), donc inaccessibles au clavier et à VoiceOver.
- ⚠ « Le supprimer » ne propose pas d'annulation.
- ⚠ « Décaler » envoie au congélo le plat qui sort du cycle. Si deux téléphones le font en même temps, la réserve reçoit un doublon (`propositions.js:134`).

### P3. Courses du samedi puis drive du mercredi — **2,5 / 5** (E3 T2 C4 R1)
- ❌ **Pas de hors-ligne** : aucun service worker dans le dépôt. Si la 4G décroche dans le magasin, la page ne se charge plus. [Constat] Le cas est fréquent en hypermarché. [Hypothèse]
- ❌ **Chaque coche** : 1 écriture, puis un rendu complet de 6 lectures (`courses-ui.js:122` → `courses.js:11-34`), puis **6 lectures de plus** déclenchées par l'écho temps réel de sa propre écriture (`courses-ui.js:292`). Cela fait **≈ 13 requêtes par coche**, soit environ 520 pour une liste de 40 articles.
- ❌ La cible tactile est la case de 20 × 20 px (`components.css:294`) ; le nom de l'article n'est pas un `<label>` (`courses-ui.js:62-64`) et la case n'a aucun nom accessible.
- ⚠ Un ingrédient présent dans les deux parties est acheté **en entier le samedi** (`utils.js:123`). Une salade ou du poisson prévus pour jeudi soir sont donc achetés 5 jours avant.
- ⚠ Pas d'export vers le drive : ni partage, ni copie en texte. Seule l'impression existe (`courses-ui.js:281-286`).
- ⚠ La section « Achetées » mélange samedi et mercredi. Le mercredi, on y retrouve tout ce qui a été pris le samedi.
- ⚠ L'état coché est lié au **nom affiché** (`courses-ui.js:52`). Si une autre recette du cycle change l'orthographe retenue (« Tomate » / « Tomates cerises »), la coche est perdue.
- ⚠ Le swipe échoue en silence (`courses-ui.js:223 catch {}`) ; les autres erreurs s'affichent dans une boîte `alert()`.
- ✅ Les points forts : la réserve « placard », les articles libres par partie, l'impression et la synchronisation temps réel.

### P4. Session de cuisine du dimanche — **3,0 / 5** (E3 T4 C4 R2)
Accueil → « Cuisiner » sur la prochaine session : **1 tap**. L'écran reste allumé et la cuisson la plus longue passe en premier.
- ❌ **Portions sous-estimées** : `platsACuisiner` ignore la source `reste` (`cuisine.js:17`, et le test `tests/cuisine.test.mjs:12` le confirme). La spec dit pourtant « 4 + 1 = 5 parts » (`specs/2026-10-24…:123,180`). Les courses achètent 5 parts, le mode cuisine en fait cuire 4.
- ⚠ Il n'y a **pas de minuteur**. Les durées sont écrites dans les étapes (« 25 min ») mais ne sont pas détectées.
- ⚠ Chaque « Suivante » redessine tout l'écran (`mode-cuisine.js:74`) : le focus revient en haut, et la zone `aria-live` est recréée, donc ses annonces ne sont pas fiables.
- ⚠ La progression (étape en cours, ingrédients sortis) disparaît à la fermeture ou au rechargement.
- ⚠ Le maintien de l'écran allumé dans une PWA iOS installée a été défaillant selon les versions d'iOS. [Hypothèse — à tester sur les deux iPhone]
- Manque : un **plan de session** qui entrelace les plats (« pendant que le tajine mijote, prépare la salade »).

### P5. Ajouter / éditer une recette, créer un livre — **2,0 / 5** (E2 T1 C3 R1)
- ❌ **Aucun bouton « Nouvelle recette »** (vérifié dans `recettes.html`) : `ouvrirFormEdit` n'est appelé que par Modifier et Dupliquer (`recettes-ui.js:194-200`). L'état vide renvoie vers le planning (`:83`). C'est une impasse pour une recette de famille.
- ❌ **Corruption à l'enregistrement** (`recettes-ui.js:249` puis `:321-326`). Le script le confirme : « 400 g Tomates » devient `{quantite:"400", nom:"g Tomates"}`, puis la clé de courses « g tomate », séparée de « tomate », pour une quantité de « 400 » pièces.
- ⚠ Une nutrition vide est enregistrée comme `{0,0,0,0}`, puis affichée « 0 kcal » (`:345-350`).
- ⚠ « Supprimer » n'a pas de `try/catch` (`:186-191`) ; aucune annulation, et l'on n'avertit pas que la recette est planifiée.
- ⚠ Chaque frappe dans la recherche recharge toutes les recettes depuis Supabase (`:66-67`, et `recettes.js:4`). L'ouverture du détail refait une requête alors que la recette est déjà en mémoire (`:101`).
- ✅ Les livres sont bien faits : règle IA, génération par lots, photos manquantes, suppression sans perte des recettes.

### P6. Noter ses préférences — **3,5 / 5** (E4 T3 C4 R3)
- ✅ Cartes avec swipe, 4 niveaux, progression par catégorie, ingrédients personnalisés partagés.
- ⚠ Le profil actif est toujours « dylan » par défaut (`preferences-ui.js:9`), alors que `foyer_membres.profil_nom` donne le profil de la personne connectée. La femme doit basculer à chaque visite.
- ⚠ Il n'y a **pas d'annulation** de la dernière note en vue Cartes : une erreur de swipe oblige à passer par le tableau.
- ⚠ En vue Tableau, les boutons « ● / ○ » n'ont ni nom accessible ni `aria-pressed` (`preferences-ui.js:96`) et font 22 px.
- ⚠ Les erreurs d'écriture ne sont pas rattrapées dans le clic sur les boutons (`preferences-ui.js` vers 330-336) : la promesse rejetée passe inaperçue.
- ⚠ Le badge compte les ingrédients non notés **des deux profils** (`app.js:105-121`), soit un « 99+ » quasi permanent qui finit par ne plus rien signaler.

### P7. Donner son avis après un repas — **4,0 / 5** (E5 T5 C4 R3)
1 tap depuis l'accueil (`dashboard.js:108-130`), l'avis pèse dans la sélection (+2 / −8).
- ⚠ « Passer » n'est retenu qu'en mémoire (`dashboard.js:171`) : le plat revient au prochain chargement.
- ⚠ L'avis est commun au foyer. Avec deux profils de goûts, « Bof pour elle, top pour lui » ne peut pas s'exprimer. C'est un arbitrage produit : un avis par profil serait plus juste pour la sélection.

### P8. Usage simultané sur deux téléphones — **2,5 / 5** (E3 T— C3 R2)
- ✅ Toutes les tables sont en temps réel, avec un debounce de 300 à 400 ms.
- ❌ C'est le dernier qui écrit qui gagne, sans aucun contrôle de version : pas de `updated_at`, `upsert` aveugle (`db.js:190-195`). Si A génère par IA pendant que B choisit un plat, le lot de A écrase le choix de B. [Constat sur le code, scénario déduit]
- ⚠ **Écho** : chaque écriture locale déclenche aussi un rechargement complet via le temps réel (planning `planning-ui.js:517`, courses, accueil), en plus du `renderGrid()` explicite. Cela double les lectures.
- ⚠ La réserve congélo peut être consommée deux fois si les deux téléphones lancent « Remplir » en même temps (`propositions.js:73-74`).
- Manque : un indicateur « modifié par l'autre téléphone il y a 5 s » et un verrou souple pendant une génération IA (par exemple un réglage `ia_en_cours` partagé).

---

## 3. Audit UX / UI / accessibilité

### 3.1 Design system
- ✅ Les couleurs passent par les tokens (`css/style.css:2-49`) et les icônes par le sprite SVG. Il existe un focus visible global (`components.css:619`), `prefers-reduced-motion` (`:620`), la gestion de l'encoche (`style.css:72-76,129,153`) et une mise en page grand écran ≥ 1024 px (frise du planning).
- ⚠ Il reste des couleurs codées en dur hors tokens : indicateurs de swipe des préférences (`components.css:68-71`), boutons de préférence (`:93-96, 325-328, 362-369`), `#c0392b` (`:213,243,251` et `login.html`), `source-ia` (`:444`).
- ⚠ Des glyphes servent d'icônes d'interface, contrairement à la règle : « ▲▼ » (`courses-ui.js:77,94,150`), « ●○ » (`preferences-ui.js:17,135,140`), « − » (pas-à-pas). Les emojis de catégories dans les puces de navigation (`preferences-ui.js:26`) sont à la limite de la règle.
- ⚠ Beaucoup de styles en ligne (`style="margin…"`) dans les gabarits JS : `planning-ui.js:201,221`, `envie.js:42-72`, `recettes-ui.js:105-142`.

### 3.2 Contrastes réels (calcul WCAG 2.x par script)

| Paire | Clair | Sombre |
|---|---|---|
| texte / fond | 12,08 ✅ | 14,86 ✅ |
| texte atténué / fond · surface | 5,57 · 6,19 ✅ | 7,01 ✅ |
| primaire / fond (liens, boutons fantômes) | **4,90** ✅ (juste) | 6,86 ✅ |
| texte sur primaire | 5,45 ✅ | 7,65 ✅ |
| texte sur accent (⚡) | 5,55 ✅ | 8,10 ✅ |
| danger / surface | 6,54 ✅ | 8,03 ✅ |
| info / surface | 6,47 ✅ | 8,03 ✅ |
| onglet inactif (nav-fg-muted α 0,74) | 6,80 ✅ | 8,87 ✅ |
| onglet actif | 6,75 ✅ | 9,67 ✅ |
| badge blanc / #c62828 | 5,62 ✅ | — |
| primaire sur primary-soft (aujourd'hui, case source) | **4,36 ❌** | — |
| indicateur swipe « J'aime » #27ae60 / #e8f5e9 | **2,55 ❌** | identique |
| indicateur swipe #e74c3c / #ffebeb | **3,34 ❌** | identique |
| indicateur swipe #d35400 / #fff3e0 | **3,80 ❌** | identique |
| erreur de connexion #c0392b / surface sombre | — | **2,98 ❌** (mais la page de connexion n'applique jamais le thème sombre) |

Les tokens sont donc conformes. Les échecs viennent tous de couleurs codées en dur ou d'un fond `-soft` sous du texte primaire.

### 3.3 Cibles tactiles
- ✅ Nav, ⚡, fermeture des modales (44 px, `components.css:720`), boutons de créneau (40 + 3 px), puces (40 px + `::after`).
- ❌ Case à cocher des courses : **20 px**, sans zone élargie (`components.css:294`). C'est l'action la plus répétée de l'appli.
- ⚠ Badge portions dans un créneau : 24 px de haut + 14 px de zone élargie, soit 38 px (`:517,719`). Boutons radio des préférences : 22 px. Ligne de résumé du détail IA : 32 px (`:868`).

### 3.4 Accessibilité
- ❌ **Éléments cliquables non focusables** : créneaux du planning (`planning-ui.js:46`), cartes recettes (`recettes-ui.js:85`), cartes de la sélection (`planning-ui.js:201`), cartes ⚡ (`envie.js:111`), en-tête « Achetées » (`courses-ui.js:75`). Au clavier comme avec VoiceOver, on ne peut **ni ouvrir une recette ni choisir un plat**.
- ❌ **Modales** : aucune n'a `role="dialog"`, `aria-modal` ni `aria-labelledby`. Les 12 occurrences de `.modal-overlay` dans les pages sont concernées ; seul le mode cuisine l'a (`mode-cuisine.js:31-33`). Pas de piège de focus, pas de retour du focus à la fermeture, fond non `inert`. Échap ne ferme que ⚡ (`app.js:60`) et le mode cuisine.
- ⚠ Pas d'annonce `aria-live` pour `genStatus` (`planning.html:148`), les coches de courses ou les erreurs de connexion (`login.html`).
- ⚠ La connexion n'est pas un `<form>` (`login.html:33-43`) : Entrée est intercepté sur tout le document, et l'enregistrement du mot de passe dans le trousseau iOS est moins fiable. [Hypothèse]
- ⚠ Le thème est appliqué **après** l'`await` de la session (`app.js:125-128`) : en mode sombre, chaque page flashe en clair. Le thème ne suit pas non plus `prefers-color-scheme`.

### 3.5 Hiérarchie de l'information par page
- **Accueil** : très bonne (prochain repas → session → avis → aperçu du cycle). Le titre « Bonjour ! » est générique et pourrait nommer le profil connecté.
- **Planning** : groupement par session clair. Mais trois boutons d'action par créneau (↻, ✎, ⇄), plus le badge portions et l'étiquette de source, font beaucoup sur 375 px. Un tap sur un créneau rempli quitte la page vers `recettes.html` (`planning-ui.js:501`) au lieu d'ouvrir une feuille. Les portions se règlent par `prompt()` (`:164`).
- **Recettes** : filtres déduits intelligents. Il manque l'action principale « Nouvelle recette ». Le détail aligne 7 boutons de même poids (`recettes-ui.js:142-150`).
- **Courses** : bon découpage en deux parties. Les actions secondaires (réinitialiser, imprimer) sont au même niveau que la liste ; le formulaire d'ajout passe avant la liste.
- **Préférences** : correcte. Le profil actif n'est pas assez mis en évidence pour éviter de noter pour l'autre personne.
- **Réglages** : seulement accessible par une icône dans la barre du haut (`app.js:62-73`), sans libellé visible sur mobile. Crédit IA, modèle de semaine et conversion technique sont sur un même long écran.
- **Connexion** : sobre. Pas de mode sombre, pas de « mot de passe oublié » (acceptable pour deux comptes).

---

## 4. Audit technique

### 4.1 Qualité du code
- ✅ Logique pure isolée et testée (`cycle`, `selection`, `filtres`, `credit-ia`, `cuisine`, `avis`, `utils`). Nommage et commentaires en français, cohérents.
- ⚠ **Re-rendus complets par `innerHTML`** partout (planning, ⚡, courses, mode cuisine, recettes) : focus perdu, écouteurs réattachés à chaque rendu (`courses-ui.js:113-138`, `envie.js:75-107`).
- ⚠ **Rechargement après chaque action** : `renderGrid()` = `chargerDonnees()` complet (`planning-ui.js:122-125`), appelé par toutes les actions (`:160-181`, `:238`, `:244`, `:441`, `:496`).
- ⚠ **Erreurs** : 14 `alert()`, 4 `confirm()`, 1 `prompt()`. Plusieurs actions ont des promesses rejetées sans `catch` (vider, déplacer, supprimer une journée dans `planning-ui.js:160-161,437-441,489-496` ; supprimer recette/livre). Catches silencieux : `app.js:120`, `courses-ui.js:223`, `livres-ui.js:25`, `courses.js:46`.
- ⚠ **État global** : variables de module (`donnees`, `aDeplacer`, `creneauEnCours`, `iaEnCours`…). C'est acceptable à cette taille, mais `iaEnCours` est propre à la page, donc invisible depuis l'autre téléphone.
- ⚠ Course possible : `getCustomIngredients` n'a pas de promesse partagée (`custom-ingredients.js:18-24`), contrairement à `preferences.js:9-12`. Le badge et la page font donc deux requêtes en parallèle.
- ⚠ Duplication : la génération IA est dupliquée entre planning et livres (bandeau, erreurs uniques, `beforeunload`). Deux listes de mots de viande coexistent (`filtres.js:20` et `utils.js:193`).
- ⚠ `supabase-schema.sql` crée des politiques `USING (true)` (`:41-43,54`) qui ne sont fermées que par la migration suivante. Réinstaller depuis ce fichier seul ouvrirait la base à tout compte authentifié.

### 4.2 Sécurité
| Point | Constat | Gravité |
|---|---|---|
| XSS | `esc()` appliqué de façon cohérente ; textes dynamiques via `textContent` ; URL d'image dans `src` uniquement (le schéma `javascript:` y est inopérant). Aucune faille trouvée. | ✅ |
| RLS | 11 tables, toutes avec `est_membre_foyer()` (`migrations/*`). `foyer_membres` est lisible uniquement pour sa propre ligne et n'a aucune politique d'écriture. | ✅ |
| Inscriptions | Si l'inscription libre est ouverte dans Supabase, n'importe qui peut créer un compte. Il ne voit rien grâce à la RLS, mais peut appeler l'Edge Function jusqu'au contrôle d'appartenance (`index.ts:93`). | [Hypothèse] à désactiver |
| Edge Function | Authentification et appartenance au foyer vérifiées (`index.ts:88-94`). Mais **le prompt est entièrement fourni par le client** (jusqu'à 50 000 caractères, `:120`) : les règles halal ne sont imposées que dans le navigateur. Il n'y a ni plafond mensuel, ni limite de débit, ni journal côté serveur : `ia_usage` est écrit par le client (`ai.js:175-177`) et modifiable ou supprimable (politique `FOR ALL`, `20261025_ia_usage.sql:16`). | Majeur |
| CORS | `*` (`index.ts:74`). C'est acceptable avec un jeton Bearer, mais on pourrait le limiter au domaine Netlify. | Mineur |
| Images | Bucket public (`20261025c…:7-9`) : les photos de plats sont lisibles par quiconque a l'URL. Sensibilité faible. L'Edge Function suit une URL distante renvoyée par le modèle (`index.ts:15-19`), un cas de requête forcée côté serveur théorique et à risque faible. | Mineur |
| Données personnelles | Deux adresses e-mail personnelles sont versionnées dans `migrations/20261024_foyer_sync.sql:13-14`. | Mineur (vie privée si le dépôt est public) |
| Dépendance | `esm.sh/@supabase/supabase-js@2` sans version précise (`db.js:2`) : la résolution vers la dernière 2.x à chaque chargement crée un risque de rupture et de chaîne d'approvisionnement tierce. | Mineur |

### 4.3 Performance — requêtes Supabase comptées

| Page / action | Aujourd'hui | Détail | Après correctifs |
|---|---|---|---|
| Accueil (chargement) | **9** | badge 2 (préférences + perso) · 2 × (réglage modèle + planning) · recettes · planning avis · recettes avis | **4** (1 réglage, 1 planning sur 3 semaines, 1 recettes, badge mis en cache) |
| Planning (chargement) | **7–8** | badge 2 (+1 en double pour les ingrédients perso) · modèle · planning cycle · **toutes les recettes `select *`** · réserve + jointure · historique 9 semaines | **5** (cycle et historique fusionnés en une requête) |
| Planning, chaque action (↻, déplacer, portions…) | **1 écriture + ~10 lectures** | `renderGrid` 5 + écho temps réel 5 | **1 écriture + 0** (mise à jour locale, écho ignoré) |
| Courses (chargement) | **8** | badge 2 · modèle · planning · recettes · libres · placard · état | **6** |
| Courses, chaque coche | **1 + 12** | rendu 6 + écho 6 | **1** (mise à jour optimiste) |
| Recettes, chaque frappe ou filtre | **1 (tout le catalogue)** | `dbGetRecettes()` sans cache | **0** (filtrage en mémoire) |

Poids JS par page, mesuré sur le graphe d'imports (hors supabase-js) : accueil **132 Ko**, planning 175 Ko, recettes 197 Ko, réglages 126 Ko, courses 61 Ko, préférences 67 Ko. L'accueil importe statiquement `mode-cuisine.js`, donc `ai.js` et `credit-ia*` : en le chargeant **à la demande** (comme `envie.js`), l'accueil passe de **132 à 59 Ko (−73 Ko, −55 %)**. supabase-js via esm.sh : environ 10 requêtes en cascade et ≈ 35-45 Ko gzip. [Hypothèse — esm.sh injoignable depuis cet environnement] Une copie locale d'un bundle ESM épinglé supprime la résolution de version et la dépendance au CDN, sans outil de build.

### 4.4 Fiabilité de l'IA
- ✅ Analyse robuste : JSON extrait, récupération des repas complets d'une réponse tronquée (`credit-ia.js:228-248`), lots de 3 en parallèle, élimination des doublons entre lots, nettoyage et vocabulaire de tags fermé (`ai.js:261-284`).
- ❌ **Halal après génération incomplet** (script) : passent `saucisse de Toulouse, salami, pepperoni, mortadelle, speck, prosciutto, guanciale, cervelas, knacki, rosette, chipolata, gin, brandy, armagnac, xérès, madère, pastis, grand marnier, amaretto, Cointreau, Kahlua, limoncello, crème de cassis, sauce worcestershire`. Faux positifs à l'inverse : `jambon de dinde`, `lardons de dinde`, `gélatine bovine halal` sont bloqués. Ce même filtre protège aussi la bibliothèque (`selection.js:106`) et les recettes saisies à la main.
- ❌ **Goûts non contrôlés** : `verifier()` (`ai.js:287-296`) ne réutilise pas `evaluer()` de `selection.js`, qui sait pourtant détecter un « Je n'aime pas », une astuce de légume caché manquante ou une conservation insuffisante (`conservation_jours ≥ joursConservation`).
- ⚠ Pas de délai maximal ni d'`AbortController` sur `callIA` (`ai.js:180-237`) : un flux bloqué laisse le bandeau « en cours » indéfiniment.
- ⚠ Le prompt envoie jusqu'à 120 noms de recettes existantes à chaque lot (`ai.js:110`), soit ≈ 1 000 tokens répétés.
- ⚠ Les idées ⚡ (jusqu'à 5) sont découpées en 2 lots qui ne se voient pas : les variantes peuvent se ressembler.
- **Coût par action** (tarif du code : 2 $ / 10 $ par M tokens, `credit-ia.js:4`, entrée ≈ 3 000 et sortie ≈ 900 par recette) :
  - un lot de 3 recettes ≈ **0,033 $** (82 % pour la sortie) ;
  - cycle complet par IA (≈ 11 recettes, 4 lots) ≈ **0,13 $**, plus photos 11 × 0,004 $, soit **≈ 0,18 $** ;
  - ⚡ 3 idées ≈ 0,033 $, dont ≈ 0,018 $ pour les 2 idées écartées ;
  - avec un budget de 4 $/mois, cela fait ≈ 22 cycles 100 % IA : **le coût n'est pas un problème**, l'enjeu est la fiabilité.

### 4.5 Tests
- 57 tests, tous verts, sur 6 fichiers, couvrant les fonctions pures.
- **Non testé et qui devrait l'être** : vocabulaire halal avec cas positifs et négatifs (le trou actuel serait apparu) ; analyse d'une ligne d'ingrédient du formulaire (à extraire dans `utils.js`) ; `nettoyerRecette` et `verifier` (dans `ai.js`, à exporter) ; `importerRecettesIA` ; la cohérence **portions mode cuisine = portions courses** (test qui fixerait le bug P4) ; `debutCycle` et `getSemaineKey` autour du passage heure d'été / heure d'hiver et du 31/12 ; `decalerEnCascade` quand la réserve est pleine.
- **Playwright** (déjà installé dans l'environnement) : servir le dossier avec `npx serve .`, injecter un faux `CONFIG` et intercepter Supabase par `page.route`. Scénarios : (1) redirection vers la connexion sans session ; (2) Remplir → Mes recettes → 14 créneaux ; (3) Modifier une recette → les quantités ne changent pas ; (4) coche de courses → une seule requête ; (5) navigation au clavier : Tab jusqu'à un créneau et Entrée ; (6) contrôles axe-core en clair et en sombre ; (7) écran iPhone 13 en 390 × 844 avec encoche simulée.

### 4.6 PWA
- ✅ Manifest et icônes 180 / 192 / 512 présents (`CLAUDE.md` indique encore « à compléter », c'est fait). Balises `apple-mobile-web-app-*` sur toutes les pages.
- ⚠ `"purpose": "any maskable"` sur la même icône (`manifest.json`) : sous Android, l'icône est rognée si elle n'a pas de marge de sécurité. Mieux vaut deux entrées séparées.
- ⚠ Pas d'écran de démarrage iOS (`apple-touch-startup-image`) : écran blanc ou brun au lancement.
- ❌ **Pas de service worker**, donc aucun hors-ligne, aucune mise en cache des pages ni de supabase-js.
- ⚠ `orientation: portrait-primary` bloque le paysage, alors que la tablette ou le paysage pourrait servir en cuisine.

---

## 5. Benchmark concurrentiel

Sources des faits datés : voir en fin de section. Le reste repose sur la connaissance générale des produits, ✱ = à revérifier (les offres évoluent).

| Fonction | **Repas** | Jow | Mealime | Paprika | Plan to Eat | Samsung Food | Cookidoo | HelloFresh / Quitoque | Bring! | Listonic | Batch FR (Basta, Pancia, Batchii) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Planification | ✅ cycle sam→sam | ✅ | ✅ | ✅ | ✅ glisser-déposer | ✅ | ✅ | box hebdo | — | — | ✅ |
| Batch cooking / sessions | ✅ **sessions dim./mer.** | ◐ | ◐ | — | ◐ | ◐ | ◐ | — | — | — | ✅ cœur du produit |
| Liste de courses | ✅ deux parties, placard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | box | ✅ **référence** | ✅ | ✅ |
| Partage du foyer | ✅ temps réel | ◐ | ◐ | ◐ sync | ✅ | ✅ | ◐ | ◐ | ✅ | ✅ | ◐ |
| Import URL / photo | ❌ | — | — | ✅ **navigateur intégré** | ✅ | ✅ | — | — | ◐ (recettes) | — | ◐ Yapluka (Insta/TikTok) |
| IA | ✅ génération sur contraintes | ◐ | — | — | — | ✅ (Vision, plans) | ◐ | — | — | — | ◐ |
| Nutrition | ◐ par recette | ◐ | ✅ | ◐ | ◐ | ✅ (Food+) | ✅ | ✅ | — | — | ◐ |
| Stock / anti-gaspi | ◐ réserve congélo, placard, « avec ce que j'ai » | ◐ | ◐ | ✅ garde-manger | ◐ | ✅ garde-manger + photo | — | portions exactes | — | — | ✅ |
| Mode cuisine | ✅ session groupée, écran allumé | ✅ | ✅ | ✅ **minuteurs auto** | ◐ | ✅ pas à pas | ✅ **guidé + appareil** | ✅ | — | — | ✅ ordre de session |
| Drive / enseigne | ❌ | ✅ **7 enseignes** (Carrefour, Leclerc, Auchan, Intermarché, U, Monoprix, Chronodrive) | — (US) | — | — | ✅ (US) | — | livraison box | ◐ offres | ◐ prospectus | — |
| Prix | gratuit, IA ≈ 0,18 $/cycle | gratuit | freemium ✱ | achat unique par plateforme ✱ | abonnement ✱ | gratuit + Food+ ≈ 7 $/mois | abonnement ✱ | box payante | freemium | freemium | Basta dès 4,99 €/mois ; Pancia gratuit |
| Hors-ligne | ❌ | ◐ | ✅ | ✅ **local d'abord** | ◐ | ◐ | ◐ | ◐ | ✅ | ✅ | ◐ |
| Halal strict | ✅ **double contrôle** | filtre régime ◐ | ◐ | — | — | ◐ | — | ◐ | — | — | ◐ |
| Légumes cachés / goûts par personne | ✅ **unique** | ◐ goûts | ◐ dégoûts | — | — | ◐ | — | — | — | — | — |

**Ce que les concurrents font mieux, et ce qu'il faut en reprendre, adapté au foyer**
- **Jow** : le panier passe directement au drive. Le reprendre tel quel n'est pas réaliste, faute d'API publique des enseignes. Version adaptée : bouton « Partager la liste du mercredi » (`navigator.share`, texte groupé par rayon), à coller dans l'appli du drive ou dans les notes.
- **Paprika / Plan to Eat** : import d'une recette par URL et mode hors-ligne d'abord. Version adaptée : « Importer » (URL ou texte collé), avec structuration par l'IA dans le même format JSON puis contrôles halal et goûts. Le format JSON-LD `Recipe` des sites permettrait d'éviter l'IA dans environ 80 % des cas. [Hypothèse] Comme le navigateur ne peut pas lire une page d'un autre site (CORS), la récupération passerait par une nouvelle action de l'Edge Function.
- **Paprika / Cookidoo** : minuteurs tirés des étapes (« 25 min » → bouton minuteur), progression conservée.
- **Bring! / Listonic** : coche instantanée hors-ligne, grandes lignes tactiles, liste « déjà acheté » repliable, suggestions d'articles fréquents. C'est le gain prioritaire pour P3.
- **Samsung Food** : garde-manger photographié. Version adaptée : étendre « placard » à un petit inventaire (« reste 2 boîtes de pois chiches ») qui alimenterait le score anti-gaspi existant.
- **Apps batch FR (Basta, Pancia)** : plan de session minuté qui entrelace les plats. Le planificateur et `platsACuisiner` ont déjà les données nécessaires.
- **HelloFresh / Quitoque** : fiches très visuelles et portions exactes. Les photos IA existent déjà ; il faudrait surtout des quantités justes (bug P4, bug P5).

**Ce que Repas fait mieux** : la contrainte halal vérifiée deux fois (une fois le filtre corrigé), la logique « légumes à cacher » avec astuce, le cycle réel de la famille (midis à 1 portion, sessions dim./mer., courses en deux temps), la réserve congélo intégrée au remplissage, le décalage en cascade, la bibliothèque d'abord et l'IA en dernier recours, avec un coût maîtrisé et visible. Aucune appli du marché ne combine ces éléments.

Sources : [Futura — Jow](https://www.futura-sciences.com/tech/telecharger/jow-53480), [Presse-citron — Jow](https://www.presse-citron.net/telecharger/loisirs/cuisine_et_boisson/jow.html), [Clubic — Jow](https://www.clubic.com/telecharger-fiche441003-jow-1.html), [LSA — Monoprix × Jow](https://www.lsa-conso.fr/monoprix-s-associe-a-jow-pour-accelerer-les-courses-en-ligne,285036), [Mes listes de courses — applis batch cooking](https://meslistesdecourses.fr/application-batch-cooking/), [App Store — Pancia](https://apps.apple.com/fr/app/pancia-batch-cooking/id6450043468), [Yapluka](https://mwm.ai/apps/yapluka-recettes-planning/6754612982), [Samsung Food Plus (prix)](https://hub.netzgemeinde.eu/@gadgeteer?cat=meals), [Stuff — Samsung Food](https://stuff.co.za/?p=197896), [App Store — Samsung Food](https://apps.apple.com/gh/app/id1133637674?l=en-gb).

---

## 6. Liste des problèmes par gravité

Effort : **S** < ½ jour · **M** 1 à 3 jours · **L** > 3 jours.

### Bloquant
| # | Constat | Preuve | Impact | Correctif | Effort |
|---|---|---|---|---|---|
| B1 | Filtre halal incomplet : 24 termes porc ou alcool non détectés ; faux positifs sur la dinde | `js/filtres.js:29-31`, script de vérification | Une recette non halal peut être proposée depuis la bibliothèque, l'IA ou une saisie manuelle | Compléter la liste (charcuterie, spiritueux, liqueurs, xérès, madère, worcestershire). Ajouter une liste blanche « de dinde / de bœuf / de volaille / halal » appliquée avant le test. Écrire des tests positifs et négatifs | S |
| B2 | L'édition d'une recette scinde la quantité au premier espace | `js/recettes-ui.js:249,321-326` | Toute recette IA modifiée devient fausse en courses (« 400 » pièces de « g Tomates ») et dans le rapprochement avec les goûts | Deux champs par ligne (quantité / nom), ou une fonction pure `lireLigneIngredient()` dans `utils.js` (nombre + unité connue) testée. Script de réparation des recettes déjà touchées (nom qui commence par g / ml / c.s.…) | S |

### Majeur
| # | Constat | Preuve | Impact | Correctif | Effort |
|---|---|---|---|---|---|
| M1 | Goûts et légumes cachés non vérifiés après l'IA | `js/ai.js:287-296` | Un « Je n'aime pas » de la femme dans l'assiette, alors que c'est une contrainte non négociable | Dans `verifier()`, appeler `evaluer(recette, creneau, ctx)` de `selection.js` (déjà pur et testé). Rejeter si le résultat est `null` et relancer une fois | S |
| M2 | Le mode cuisine exclut les portions « reste » | `js/cuisine.js:17`, `tests/cuisine.test.mjs:12` contre spec §123/180 et `courses.js:19` | La session du dimanche oublie le midi de la femme | Compter les portions `reste` dans le plat source sans créer de plat distinct. Mettre le test à jour. Afficher « dont 1 part pour mardi midi » | S |
| M3 | Pas de création de recette | `recettes.html`, `recettes-ui.js:194-200` | Impossible d'ajouter une recette de famille | Bouton principal « Nouvelle recette » qui ouvre `ouvrirFormEdit({})` | S |
| M4 | Pas de hors-ligne | aucun `serviceWorker` dans le dépôt | Liste de courses inutilisable sans réseau | Service worker vanilla : cache des pages, CSS, JS et supabase-js en « réseau d'abord, sinon cache ». Dernière liste de courses en cache, coches en file d'attente (IndexedDB ou localStorage) rejouées au retour du réseau | M |
| M5 | Courses : 13 requêtes par coche, cible de 20 px, case sans nom | `courses-ui.js:62-64,122,292`, `components.css:294` | Lenteur et ratés en magasin, illisible pour VoiceOver | Ligne entière en `<label>`, coche optimiste (état local + écriture), ignorer l'écho de sa propre écriture (comparer avec l'état local) | S |
| M6 | Planning : rechargement complet + écho après chaque action ; dernier écrivain gagnant | `planning-ui.js:122,517`, `db.js:190-195` | ≈ 10 lectures par tap ; écrasements entre les deux téléphones | Mettre à jour `donnees.occupation` localement, recharger seulement sur un événement distant. Colonne `maj_le` + `upsert` conditionnel, ou réglage partagé `ia_en_cours` (verrou souple pendant une génération) | M |
| M7 | Accessibilité : cartes et créneaux non focusables ; modales sans dialogue ni piège de focus | `planning-ui.js:46,201`, `recettes-ui.js:85`, `envie.js:111`, 12 `.modal-overlay` | Navigation au clavier et VoiceOver impossibles sur l'essentiel | `<button>` ou `role="button" tabindex="0"` + Entrée. Utilitaire `ouvrirModale(el)` commun (role, aria-modal, focus initial et retour, Échap, `inert` sur `main`) | M |
| M8 | Edge Function : prompt libre, aucun plafond ni journal côté serveur | `supabase/functions/ai/index.ts:96-158`, `ai.js:175` | Les règles halal reposent sur le navigateur ; budget non garanti | Message système halal ajouté côté serveur à tout `chat`. Journal `ia_usage` écrit par la fonction (clé de service). Refus si le coût du mois dépasse `reglages.ia_budget`. Politique `ia_usage` limitée à SELECT pour les clients | M |
| M9 | Produits frais du jeudi et vendredi achetés le samedi | `utils.js:123` | Fraîcheur et gaspillage | Pour les rayons frais (Fruits & Légumes, Viandes & Poissons), répartir les quantités par partie. Garder le regroupement samedi pour l'épicerie | S |

### Mineur
| # | Constat | Preuve | Correctif | Effort |
|---|---|---|---|---|
| m1 | `prompt()` / `confirm()` / `alert()` (19 appels) | `planning-ui.js:164,176,180` … | Pas-à-pas pour les portions, feuille de confirmation, message en bas d'écran avec « Annuler » | M |
| m2 | Promesses non rattrapées, catches silencieux | `planning-ui.js:160-161,489-496`, `courses-ui.js:223`, `app.js:120` | `try/catch` + message d'erreur uniforme | S |
| m3 | Profil par défaut toujours Dylan | `preferences-ui.js:9` | Lire `foyer_membres.profil_nom` de l'utilisateur connecté | S |
| m4 | Pas d'annulation de la dernière note | vue Cartes | Bouton « Annuler la dernière note » (une pile en mémoire) | S |
| m5 | « Passer » (avis) non mémorisé | `dashboard.js:171` | localStorage avec date, ou `planning.avis = 0` | S |
| m6 | Recettes : chaque frappe recharge tout le catalogue ; le détail refait une requête | `recettes-ui.js:66,101` | Cache mémoire invalidé par le temps réel | S |
| m7 | `mode-cuisine` importé statiquement sur l'accueil | graphe d'imports | `import()` au clic : −73 Ko sur l'accueil | S |
| m8 | supabase-js non épinglé sur esm.sh | `db.js:2` | Version exacte, ou fichier ESM local `js/vendor/` | S |
| m9 | Thème appliqué après la session (flash) ; pas de `prefers-color-scheme` | `app.js:125-128` | Petit script en ligne dans `<head>` qui pose `data-theme` | S |
| m10 | Connexion sans `<form>`, sans `aria-live`, toujours en clair | `login.html:33-43` | `<form>` + `submit`, `role="alert"`, thème | S |
| m11 | Couleurs codées en dur sous 4,5:1 (swipe 2,55–3,80 ; primaire sur fond soft 4,36) | `components.css:68-71` | Passer aux tokens danger / accent / info | S |
| m12 | Boutons radio du tableau des préférences sans nom, 22 px | `preferences-ui.js:96` | `aria-label="Dylan : J'adore Poulet"`, `aria-pressed`, 44 px | S |
| m13 | Modèle de semaine : jour de cuisine postérieur au repas accepté | `reglages-ui.js:40-44` | Ne proposer que les jours précédents ou le jour même | S |
| m14 | Nutrition vide enregistrée à 0 | `recettes-ui.js:345-350` | `null` si tous les champs sont vides | S |
| m15 | Badge de préférences des deux profils (« 99+ » permanent) | `app.js:105-121` | Compter seulement le profil connecté, mettre en cache | S |
| m16 | `supabase-schema.sql` avec politiques ouvertes ; e-mails dans une migration | `supabase-schema.sql:41-43`, `20261024_foyer_sync.sql:13-14` | Mettre à jour le schéma de référence ; insérer les membres par un script non versionné | S |
| m17 | Manifest `any maskable` ; pas d'écran de démarrage iOS | `manifest.json` | Deux icônes séparées ; images `apple-touch-startup-image` | S |
| m18 | Pas de délai maximal sur le flux IA | `ai.js:180-237` | `AbortController`, 120 s sans données → COUPEE | S |

### Cosmétique
- Glyphes ▲▼●○− utilisés comme icônes (`courses-ui.js:77,94`, `preferences-ui.js:17`) : utiliser les icônes `haut` / `bas` / `check` du sprite.
- Styles en ligne dans les gabarits JS (environ 40 occurrences) : en faire des classes.
- Badge portions à 38 px de zone tactile (`components.css:517`).
- Les 7 boutons du détail d'une recette ont tous le même poids : mettre en avant « Cuisiner » et « Planifier », ranger le reste dans « Plus… ».
- `CLAUDE.md` est en retard : icônes, `reglages.html`, tables `reglages` et `reserve` absentes du schéma décrit.

---

## 7. Feuille de route

### Vague 1 — gains rapides (< 1 jour chacun, ≈ 3 jours au total)
1. **B1** Filtre halal : liste complétée, liste blanche, tests (S). *Aucune dépendance. À faire en premier.*
2. **B2** Analyse des lignes d'ingrédients + réparation des recettes abîmées (S).
3. **M1** `evaluer()` dans `verifier()` de l'IA (S). *Dépend de B1 (même filtre).*
4. **M2** Portions des restes dans le mode cuisine + test (S).
5. **M3** Bouton « Nouvelle recette » (S). *Après B2 (même formulaire).*
6. **M5** Ligne de courses tactile + coche optimiste + écho ignoré (S).
7. **M9** Produits frais par partie (S).
8. **m7, m8, m9, m3, m5, m11, m12, m14, m15, m18** (S chacun).

### Vague 2 — améliorations (≈ 1 semaine)
1. **M7** Utilitaire de modale accessible commun + cartes focusables (M). Il sert ensuite à m1.
2. **m1** Remplacer `prompt`, `confirm` et `alert` par des feuilles et messages (M). *Dépend de M7.*
3. **M6** Mises à jour locales dans le planning, filtre de l'écho, verrou souple IA (M).
4. **M8** Durcissement de l'Edge Function : système halal, journal et plafond côté serveur (M).
5. Partage de la liste du mercredi (`navigator.share`, texte par rayon) (S).
6. Minuteurs dans le mode cuisine (« 25 min » repéré dans l'étape) + progression conservée en localStorage (M).
7. Idées ⚡ « légères » puis recette complète pour l'idée choisie (S).
8. Tests Playwright des 7 scénarios du §4.5 (M).

### Vague 3 — chantiers (> 1 semaine)
1. **M4** Hors-ligne complet : service worker, file d'écriture, indicateur réseau (L). *Après M5 et M6, qui préparent l'état local.*
2. Import de recette par URL (JSON-LD `Recipe`, sinon IA) et par texte collé (L). *Dépend de B2, M1 et M8.* Nouvelle action `import` de l'Edge Function pour récupérer la page.
3. Plan de session entrelacé (« pendant que… ») généré à partir de `platsACuisiner` et des étapes (L).
4. Mini-inventaire (placard + quantités) branché sur le score anti-gaspi (L).
5. Avis par profil (arbitrage produit, voir §9) (M).

---

## 8. Optimisations chiffrées

| Optimisation | Avant | Après | Gain |
|---|---|---|---|
| Coche de courses | 13 requêtes | 1 | **−92 %** ; liste de 40 articles : 520 → 40 requêtes |
| Action dans le planning (↻, déplacer, portions) | 1 + ~10 | 1 + 0 | −10 lectures par tap, dont 2 chargements complets du catalogue `select *` |
| Chargement de l'accueil | 9 requêtes | 4 | −5 (−56 %) |
| Chargement du planning | 7–8 | 5 | −2 à −3 |
| Recherche dans les recettes (10 frappes) | 10 catalogues complets | 0 | −10 |
| JS de l'accueil | 132 Ko | 59 Ko | **−73 Ko (−55 %)** |
| supabase-js | ≈ 10 requêtes esm.sh en cascade ✱ | 1 fichier local mis en cache par le service worker | −9 requêtes, 0 au 2ᵉ chargement |
| IA — ⚡ 3 idées | sortie ≈ 2 700 tokens ≈ 0,033 $ | 3 × 250 légères + 900 = 1 650 ≈ 0,022 $ | −33 % par ⚡ |
| IA — prompt de lot | ≈ 3 000 tokens d'entrée | ≈ 2 300 (noms existants limités à 40 + noms proches) | −0,0014 $/lot (modeste) |
| IA — cycle complet | ≈ 0,13 $ + 0,044 $ photos ≈ **0,18 $** | lots de 4 (3 lots au lieu de 4) + prompt allégé ≈ 0,12 $ + photos ≈ **0,16 $** | −10 à −12 % ; l'enjeu reste la fiabilité, pas le coût (≈ 22 cycles par mois avec 4 $) |
| Taps — ajouter une recette de famille | impossible (Dupliquer, puis réécrire ~15 champs) | 1 tap + saisie ; import par URL : 2 taps | parcours débloqué |
| Taps — régler les portions | 1 tap + clavier + OK (3, dialogue système) | pas-à-pas : 1 à 2 | −1 à −2 |
| Taps — préférences de la femme | +1 bascule de profil à chaque visite | 0 | −1 par visite |
| Taps — corriger une note de swipe | Tableau → chercher → corriger (≈ 4) | « Annuler » (1) | −3 |
| Taps — envoyer la liste du drive | recopie manuelle (~30 articles) | 1 (partager) | ≈ −30 saisies |

✱ Estimation non mesurée : le CDN était injoignable depuis l'environnement d'audit.

---

## 9. Compatibilité avec les contraintes de CLAUDE.md

Toutes les recommandations ci-dessus **respectent** les contraintes : halal renforcé (B1, M1, M8) ; profil femme et légumes cachés vérifiés après l'IA (M1) ; cycle et sessions inchangés (M2 rend le mode cuisine conforme à la spec) ; courses toujours en deux parties (M9 ne touche que la répartition des produits frais entre les deux) ; bibliothèque d'abord (l'import enrichit la bibliothèque, les idées légères réduisent l'IA) ; contraintes et envies inchangées ; authentification requise (le service worker ne met en cache que des pages qui gardent leur redirection, et les données en cache ne s'affichent qu'avec une session) ; aucun framework ni outil de build (service worker, modale et vendoring sont du vanilla).

**Arbitrages à trancher par le foyer**
1. **Avis par profil** (P7) : plus juste pour la sélection, mais l'avis reste un geste à 1 tap pour toute la famille. Il change le schéma (`planning.avis` → par profil).
2. **Produits frais achetés le mercredi** (M9) : une liste du drive plus longue en échange de la fraîcheur.
3. **Import par URL** : l'IA (ou une récupération côté serveur) touche des sites tiers. C'est compatible avec « IA en dernier recours » seulement si le JSON-LD est essayé d'abord.
4. **Gélatine** : le filtre actuel bloque toute gélatine, même bovine halal. Garder ce choix (le plus sûr) ou l'assouplir avec la liste blanche « halal ».
5. **Drive intégré à la Jow** : hors de portée sans API d'enseigne. Le partage texte est le compromis proposé.
