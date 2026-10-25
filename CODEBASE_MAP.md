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
Bibliothèque des recettes sauvegardées avec filtres, livres de recettes (pastilles, génération IA d'un livre) et vue détail.

### planning.html
Planning par cycle samedi soir → samedi midi, groupé par session de cuisine ; modale « Remplir le cycle ».

### courses.html
Liste de courses du cycle en deux parties (🛒 samedi magasin / 🚗 mercredi drive), navigation ← → par cycle, bouton 🖨 Imprimer (mise en page @media print dans components.css).

### reglages.html
Réglages partagés : crédit IA (jauge, budget, recalage, derniers appels), modèle de semaine (portions, qui mange, jour de cuisine), réserve congélo, conversion des anciennes recettes.

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

### supabase/migrations/20261025_ia_usage.sql
Table `ia_usage` : journal des appels IA (tokens, coût, statut, code d'erreur) pour le suivi du crédit.

### supabase/migrations/20261025b_livres.sql
Table `livres` (nom, consigne IA) + `recettes.livre_id` (un livre au plus, ON DELETE SET NULL).

### supabase/migrations/20261025c_images_recettes.sql
Colonne `recettes.image_url` + espace de stockage public `recettes-images` (écriture par l'Edge Function).

### supabase/functions/ai/index.ts
Edge Function : proxy Mammouth AI (streaming + décompte des tokens `include_usage`, relance sans si refusé), vérifie membre du foyer, relaie le statut et le message d'erreur de Mammouth. Action `image` : photo via `gemini-3.1-flash-image-preview` (endpoint images, sinon chat), enregistrée dans `recettes-images/{id}`. Secret `MAMMOUTH_API_KEY`.

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
- `dbSetImageRecette(id, url)` — photo d'une recette (mise à jour partielle)
- `dbDeleteRecette(id)` — supprime une recette
- `dbGetPlanning(semaineKey)` — planning d'une semaine
- `dbGetPlanningSemaines(keys)` — lignes brutes de plusieurs semaines ISO
- `dbUpsertPlanning(...)` / `dbUpsertPlanningLot(lignes)` — assigne un ou plusieurs créneaux (avec `source`)
- `dbViderCreneaux(list)` — vide plusieurs créneaux
- `dbGetReglage(cle)` / `dbSetReglage(cle, valeur)` — réglages partagés du foyer
- `dbGetReserve()` / `dbAddReserve(recetteId, portions)` / `dbDeleteReserve(id)` — réserve congélo
- `dbGetCoursesEtat` / `dbToggleCourse` / `dbResetCourses` — cases cochées des courses
- `dbEcouter(tables, onChange)` — abonnement temps réel Supabase
- `dbGetLivres()` / `dbUpsertLivre(livre)` / `dbDeleteLivre(id)` — livres de recettes
- `dbAjouterUsageIA(ligne)` / `dbGetUsageIA(depuis)` — journal des appels IA (crédit)
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

### js/icones.js
Jeu d'icônes SVG unique (tracé façon Lucide, trait 2 px) qui remplace les emojis d'interface.
- `icone(nom, { label, classe })` — `<svg><use href="#i-nom">` (décorative par défaut, `label` → role="img")
- `injecterSprite()` — injecte le sprite une fois par page (appelé par app.js)

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
- `ENVIES` / `estEnvie(id)` — envies ponctuelles (bouillon, réconfortant, gras, healthy) vs contraintes
- `passeFiltres(r, filtres)` / `consignesFiltres(filtres)`
- `contientViande` / `contientPoisson` / `contientFeculent` / `contientInterdit` (halal)
- `scoreStyle(r, style)` — correspondance avec le style libre
- `normaliser(s)` / `contientMot(texte, mot)` / `texteRecette(r)`

### js/selection.js
Choix des recettes dans la bibliothèque, sans IA (pur, testé).
- `construireIndexPrefs(ingredients, prefs)` — préférences indexées mot à mot
- `evaluer(recette, creneau, ctx)` — exclusions (halal, filtres, goûts, légumes cachés, conservation, rotation) + score
- `nouveauContexte(...)` / `noterChoix(ctx, r)` / `candidats(recettes, creneau, ctx)`
- `repartirEnvies(creneaux, envies)` — place chaque envie (nb repas, espacés ou à la suite)
- `remplirCycle({...})` — réserve d'abord, repas familiaux, puis restes ; envies sur leurs repas, évitées ailleurs
- `ingredientsSaisis(texte)` / `recettesAvecIngredients(recettes, texte, n)` — « restes de bœuf, carottes » → recettes qui les utilisent
- `decalerEnCascade(creneaux, plan, cle, nouveau)` — décalage pour l'envie du soir
- `proteinePrincipale(r)` / `ingredientsRecette(r)` / `motsDe(s)` / `motsRecette(r)`
- Score : bonus ingrédient déjà prévu, malus ingrédient nouveau et recette > 8 ingrédients (moins d'ingrédients différents)

### js/propositions.js
Relie selection.js aux données Supabase du cycle.
- `chargerDonnees(samedi)` — cycle, recettes, réserve, historique, préférences
- `proposerPourCreneau(d, c, options, n)` — meilleurs candidats bibliothèque
- `remplirDepuisBibliotheque(d, cles, options)` / `completerParIA(d, creneaux, options, onProgress, onLot)` — IA par lots, enregistrés à l'arrivée
- `ideeIA(d, c, options)` — une recette IA enregistrée
- `placer(d, c, recetteId, source, mode, simuler)` — remplacer / congélo / décaler
- `echanger(d, cleA, cleB)` — intervertit deux repas ou déplace vers un créneau vide
- `lireFiltres()` / `memoriserFiltres(f)` — sélecteurs mémorisés sur l'appareil

### js/envie.js
Modale « ⚡ Envie ce soir ».
- `renderModalEnvie(content, fermer)` — cible, sélecteurs, 3 idées bibliothèque, IA, choix du sort du plat prévu ; « Avec ce que j'ai » : recettes de la bibliothèque avec ces ingrédients + recette IA construite autour (restes)

### js/reglages-ui.js
Page réglages : crédit IA, éditeur du modèle de semaine, réserve congélo, conversion IA des anciennes recettes par lots de 5.
- `renderCredit()` — jauge, crédit mensuel, jour de recharge, recalage, 15 derniers appels (erreurs expliquées au toucher)

### js/credit-ia.js
Crédit IA, pur et testé.
- `TARIF` / `BUDGET_DEFAUT` / `TAILLE_LOT` — 2 $/10 $ par M tokens, 4 $/mois, 3 recettes par appel
- `coutTokens(entree, sortie)` / `estimerTokens(texte)` / `decouperLots(liste)`
- `debutPeriode(date, jour)` / `finPeriode(date, jour)` — période de recharge mensuelle
- `moyennes(lignes)` / `estimerGeneration(nb, lignes)` / `coutParRecette(lignes)` — estimations calibrées sur le journal
- `resumeCredit(lignes, budget, maintenant)` — dépensé, restant (recalage), nb appels / erreurs
- `codeErreurHttp(status, corps)` / `expliquerErreur(code, detail)` — titre, explication, que faire
- `extraireRepasComplets(texte)` — récupère les repas complets d'une réponse tronquée
- `TARIF_IMAGE` / `coutImage(usage)` — coût d'une photo (≈ 0,004 $)
- `formatDollars(v)`

### js/credit-ia-ui.js
Chargement et rendu du crédit IA.
- `getBudget()` / `setBudget(b)` — réglage partagé `ia_budget`
- `chargerCredit()` — journal (3 mois) + résumé de la période
- `htmlJauge(resume, {compacte})` / `htmlEstimation(nb, credit)` / `htmlErreurIA(info)`
- `majBandeau(el, {etat, texte, detail, pct})` — bandeau de suivi d'une génération en arrière-plan

### js/filtres-recettes.js
Filtres de la bibliothèque déduits des recettes affichées (pur, testé) : un filtre n'existe que si une recette le porte.
- `GROUPES` — régime, temps total (choix unique), protéine, cuisine, style (tags), pratique
- `filtresDisponibles(recettes)` — groupes non vides avec compteurs
- `appliquerFiltres(recettes, selection)` — ET entre groupes, OU dans un groupe
- `nettoyerSelection(sel, dispo)` / `basculer(sel, groupe, valeur, unique)` / `nbActifs(sel)` / `proteineAffichee(r)`

### js/planifier-recette.js
Depuis une recette : la placer sur un repas précis.
- `ouvrirPlanifier(recette, zone, retour)` — repas du cycle (navigation ← →), état de chaque repas, remplacement confirmé

### js/impression-recette.js
Fiche A4 d'une recette seule (photo, infos, ingrédients à cocher, étapes, astuces).
- `imprimerRecette(r)` — construit `#impressionRecette`, attend la photo, `window.print()`

### js/livres-ui.js
Livres de recettes sur la page recettes.
- `chargerLivres()` / `getLivres()` / `getLivreActif()` / `nomLivre(id)`
- `renderLivres(recettes)` — pastilles Toutes / livres (nombre) / + Livre, en-tête du livre choisi
- `genererPhotos(recettes, bandeau)` / `photosManquantes()` — photos une par une, arrêt si crédit épuisé
- `initLivres({rafraichir, nomsRecettes})` — création / édition / suppression, modale « Générer » (3/6/10/15 ou 1 à 20, portions, contraintes, idée, coût estimé), génération en arrière-plan

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
- `filtrerRecettes(r, filtres)` — périmètre : recherche, livre
- `addRecette(recette)` / `deleteRecette(id)` — écriture

### js/planning.js
Planificateur hebdomadaire.
- `JOURS`, `MOMENTS`, `getSemaineKey` (réexporté de utils)
- `getPlanning(semaineKey)` / `assignerRepas(...)` / `supprimerRepas(...)`
- `getModele()` / `setModele(m)` — modèle de semaine partagé (table reglages)
- `chargerCycle(samedi)` — créneaux + occupation `{cle: {id, portions, source}}` + `absents` (repas supprimés)
- `chargerHistorique(samedi)` — dernière date de chaque recette (8 semaines)
- `enregistrerCreneaux(list)` / `viderCreneaux(list)` / `importerRecettesIA(lignes)`
- `supprimerCreneaux(list)` — « pas de repas » (ligne sans recette, source 'absent') ; rétablir = viderCreneaux
- `getJoursAvecRepas(semaineKey)` — créneaux remplis
- `idsDuPlanning(planning)` — ids des recettes d'un planning

### js/courses.js
Liste de courses.
- `genererListeCycle(samedi)` — liste du cycle `{samedi, mercredi}` (ignore les plats du congélo)
- `getEtatCourses` / `toggleCourse` / `resetCourses` — cases cochées Supabase

### js/ai.js
Génération IA via Mammouth AI (Edge Function `ai`) + prompts.
- `genererPourCreneaux({...}, onProgress, onLot)` — lots de 3 en parallèle (3 à la fois), doublons écartés, renvoie `{resultats, rejets, erreurs}`
- `genererPourLivre({livre, nb, portions, filtres, style, nomsExistants}, onProgress, onLot)` — recettes d'un livre (règle prioritaire, étapes détaillées), 3 lots à la fois avec une piste de cuisine chacun, les suivants connaissent les plats déjà créés
- `genererEnLots(items, {construirePrompt, filtres, parallele}, …)` / `buildPromptLivre()` — moteur commun des lots
- `buildPrompt({..., avecIngredients})` — recette construite autour des restes / ingrédients donnés (étapes détaillées)
- `genererImageRecette(recette)` — photo IA d'une recette (prompt culinaire), journalisée ; renvoie l'URL
- `ErreurIA` — erreur avec `info` (titre, explication, conseil) ; chaque appel est journalisé dans `ia_usage`
- `callIA(prompt, {action, nbRecettes, onChunk})` — flux SSE → `{texte, fin}` (ok / TRONQUEE / COUPEE)
- `genererUneRecette({creneau, ...})` — une seule recette
- `convertirRecettes(recettes)` — complète les anciennes recettes au nouveau format
- `getSaison()` — saison courante

---

## JS — Couche UI (rendu et interactions)

### js/dashboard.js
Contrôleur du tableau de bord d'accueil.
- `render()` — nombre de recettes, repas du jour, aperçu du cycle (samedi soir → samedi midi, « pas de repas » affiché) ; rafraîchi en temps réel

### js/preferences-ui.js
Rendu et interactions de la page préférences (cartes + vue liste).
- `renderCatChips()` — affiche les boutons de catégorie
- `chargerFile()` — charge la file d'ingrédients à noter pour la catégorie active
- `afficherProchain()` — affiche la carte suivante ou l'écran "terminé"
- Temps réel : recharge si l'autre profil note ou ajoute un ingrédient (ignore ses propres échos)

### js/recettes-ui.js
Rendu et interactions de la bibliothèque de recettes.
- `renderList()` — livres + filtres déduits + cartes recettes filtrées (livre actif, étiquette du livre)
- `renderFiltres(nb, nbScope)` — panneau « Filtres » (groupes, compteurs) + rappel des filtres actifs
- `ouvrirDetail(id)` — modale de détail (photo ; Planifier, Imprimer, Générer une photo, Supprimer, Modifier, Dupliquer)
- `ouvrirFormEdit(recette)` — ouvre la modale d'édition/duplication pré-remplie (choix du livre)
- Temps réel sur `recettes`

### js/planning-ui.js
Rendu et interactions du planificateur hebdomadaire.
- `renderGrid()` / `afficher()` — charge puis affiche le cycle : liste par session (mobile) ou frise jours × repas avec bandeaux de session (≥ 1024 px) ; temps réel
- `htmlCreneau(c)` / `htmlListe()` / `htmlFrise()` — rendu d'un repas (ou « Pas de repas » + Rétablir), de la liste, de la frise (bouton ✕ / ↺ par journée)
- `actionCreneau(action, cle)` — ↻ (bibliothèque puis IA), ✏️ (choisir / vider), ⇅ déplacer, portions
- Mode déplacement (toucher ⇅ puis la destination) et glisser-déposer sur ordinateur → `echanger()`
- `ouvrirSelectRecette()` — choix manuel avec recherche (nom, ingrédient), recettes compatibles en premier ; vider, pas de repas, supprimer / rétablir la journée
- `creneauxDuJour(c)` — midi et soir d'une même date
- `initModalGen()` — « Remplir le cycle » : contraintes (tous les repas) + envies réglables (1-3 repas, espacés / à la suite) ; « Mes recettes » ou « Avec l'IA » (coût estimé + crédit restant)
- `lancerGenerationIA(creneaux, sel)` / `majBandeauIA()` — génération en arrière-plan, bandeau de progression, erreurs expliquées

### js/courses-ui.js
Rendu et interactions de la liste de courses.
- `render()` — deux parties samedi / mercredi groupées par rayon, quantités ajustées ; file de rendu sans perte d'événement temps réel

---

## Tests

### tests/utils.test.mjs
Tests unitaires de js/utils.js — `node --test tests/*.test.mjs`.

### tests/filtres-recettes.test.mjs
Tests de js/filtres-recettes.js : existence des filtres, compteurs, ET/OU, sélection.

### tests/credit-ia.test.mjs
Tests de js/credit-ia.js : coûts, période, estimation, recalage, codes d'erreur, réponse tronquée.

### tests/planning-famille.test.mjs
Tests du cycle, des filtres, de la sélection bibliothèque, du décalage et de la répartition des courses.
