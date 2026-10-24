# Planning famille + cuisine en avance + bibliothèque d'abord — Design

Date : 2026-10-24 · Statut : en attente de validation

## 1. Intention

Le foyer compte maintenant **4 personnes** (Dylan, sa femme, 2 enfants qui mangent comme les adultes), avec un nombre de couverts qui dépend du créneau et une organisation en **sessions de cuisine à l'avance**. L'objectif est une app **hyper intuitive** : en un geste la semaine est remplie, on ajuste deux ou trois plats, on valide, la liste de courses suit — puis « on suit les recettes ». Pas question d'y passer des heures.

Deuxième intention : **arrêter de régénérer sans cesse par IA**. La bibliothèque de recettes Supabase est la source principale ; l'IA n'intervient qu'en dernier recours, et chaque recette générée enrichit la bibliothèque dans un format structuré (JSON) facile à exploiter.

Troisième intention : **modulable**. Un soir, on peut avoir « envie d'autre chose » (bouillon, gras, réconfortant…) sans casser la semaine, et de nombreux sélecteurs permettent d'orienter les propositions.

## 2. Objectifs / non-objectifs / anti-objectifs

**Objectifs**
- Modèle de semaine avec portions par créneau et sessions de cuisine (§3).
- Remplissage automatique de la semaine depuis la bibliothèque (option « A » validée en maquette), IA seulement pour les créneaux sans candidat.
- Sélecteurs (filtres) + champ de style libre, partout où on choisit des plats.
- « ⚡ Envie ce soir » : remplacement ponctuel d'un repas, l'app demande quoi faire du plat déplacé.
- Recettes au nouveau format structuré (composants, légumes cachés, tags, conservation).
- Réutilisation maximale des ingrédients dans la semaine (anti-gaspi).
- Une seule liste de courses par semaine.

**Non-objectifs (pour plus tard)**
- Déroulé de session de cuisine (ordre des préparations, timing).
- Générateur de recettes détaillées étape par étape (on garde un descriptif court ; le champ `etapes` existant reste optionnel).
- Profils de goûts pour les enfants.
- Connexion Leclerc Drive.

**Anti-objectifs (échec même si « ça marche »)**
- Devoir toucher chaque créneau un par un pour obtenir une semaine.
- Appeler l'IA alors que la bibliothèque avait de quoi faire (coût et lenteur).
- Déplacer ou supprimer un repas planifié sans le demander.
- Proposer du porc ou de l'alcool (contrainte halal inchangée, absolue).
- Revoir le même plat trop souvent.

## 3. Modèle de semaine (décidé avec l'utilisateur)

| Jour | Midi | Soir | Cuisiné |
|---|---|---|---|
| Lundi | 👩 1 (femme) | 👨‍👩‍👧‍👦 4 | session du **dimanche** |
| Mardi | 👩 1 | 👨‍👩‍👧‍👦 4 | session du **dimanche** |
| Mercredi | 👨‍👩‍👧‍👦 4 | 👨‍👩‍👧‍👦 4 | sur place |
| Jeudi | 👩 1 | 👨‍👩‍👧‍👦 4 | session du **mercredi** |
| Vendredi | 👩 1 | 👨‍👩‍👧‍👦 4 | session du **mercredi** |
| Samedi | 👨‍👩‍👧‍👦 4 | 👨‍👩‍👧‍👦 4 | sur place |
| Dimanche | 👨‍👩‍👧‍👦 4 | 👨‍👩‍👧‍👦 4 | sur place |

- Le tableau est donné du lundi au dimanche, mais l'app affiche et planifie par **cycle samedi soir → samedi midi** (voir §11).
- Chaque session couvre au plus 2 jours → toute recette de session doit avoir `conservation_jours >= 2` (lundi/jeudi : 1 jour, mardi/vendredi : 2 jours après la session).
- Les créneaux « 👩 1 » ne tiennent compte **que des préférences de la femme** ; les créneaux à 4 tiennent compte des **deux profils**.
- **Modifiable** *(choix Claude)* : le modèle est stocké dans Supabase (partagé) et éditable dans une section « Réglages » (portions et type par créneau, jours de session). Les portions d'un créneau précis restent ajustables ponctuellement dans le planning, sans toucher au modèle.
- Le sélecteur « Nous deux / Moi seul » actuel disparaît : c'est le modèle qui dit qui mange.

## 4. Recettes — format structuré

Table `recettes` existante, colonnes ajoutées (toutes nullable pour compatibilité) :

```json
{
  "nom": "Curry japonais",
  "description": "Curry doux mijoté, servi sur riz. 2-3 phrases max.",
  "cuisine": "japonaise",
  "composants": {
    "base": "Riz japonais",          // féculent, null si aucun
    "principal": "Sauce curry douce",
    "proteine": "Cuisses de poulet", // null si végétarien
    "legumes": ["Carotte", "Pomme de terre", "Oignon"]
  },
  "ingredients": [{ "nom": "Riz japonais", "quantite": "400 g" }],
  "legumes_caches": [{ "legume": "Courgette", "astuce": "Mixer dans la sauce" }],
  "tags": ["réconfortant"],
  "conservation_jours": 3,
  "portions": 4,
  "temps_prep": 15, "temps_cuisson": 35, "vegetarien": false,
  "nutrition": { "calories": 0, "proteines": 0, "glucides": 0, "lipides": 0 }
}
```

- `tags` : vocabulaire **fermé** (l'IA doit choisir dedans) : `healthy`, `réconfortant`, `bouillon`, `gras`, `rapide`, `léger`, `économique`. Liste centralisée dans un seul module JS pour servir aux filtres et au prompt.
- `cuisine` : texte libre court (japonaise, marocaine, française…), utilisé pour le champ de style.
- `legumes_caches` : uniquement pour la femme (voir §6).
- `etapes` : reste en base, optionnel ; affiché s'il existe.
- Les 21 recettes existantes sont **converties une fois** au nouveau format par l'IA (bouton dans Réglages « Mettre à jour les anciennes recettes », par lots), une fois la clé Mammouth en place *(choix Claude)*. Tant qu'une recette n'est pas convertie, elle reste utilisable (champs manquants = neutres dans le classement).

## 5. Sélecteurs

Les mêmes sélecteurs apparaissent dans « Remplir la semaine » et « ⚡ Envie ce soir » :

| Sélecteur | Effet bibliothèque | Effet IA |
|---|---|---|
| 🥗 Healthy | tag `healthy` requis | consigne |
| 🌱 Sans viande | `composants.proteine` sans viande (poisson OK) | consigne |
| 🐟 Sans poisson | pas de poisson/fruits de mer | consigne |
| 🥦 Végétarien | `vegetarien = true` + `validerVegetarien` | consigne + validation existante |
| 🚫🍚 Sans féculents | `composants.base` vide et aucun féculent dans les ingrédients | consigne |
| ⏱ Rapide | prep + cuisson ≤ 30 min | consigne |
| 💸 Budget | tag `économique` | consigne |
| 🍲 Réconfortant / 🥣 Bouillon / 🧀 Plutôt gras | tag correspondant requis | consigne |
| ✍️ Style libre (texte) | bonus si le texte apparaît dans `cuisine`, `nom` ou `tags` (pas un filtre dur) | consigne prioritaire |

« Réconfortant / Bouillon / Gras » sont surtout pensés pour l'envie du soir mais restent disponibles partout. Les détections viande/poisson/féculents réutilisent des listes de mots dans `js/utils.js` (comme `validerVegetarien`), testées.

## 6. Préférences et légumes cachés (décidé)

- Ingrédient « Je n'aime pas » de **Dylan** : exclu, toujours.
- Ingrédient « Je n'aime pas » de **la femme** :
  - si c'est un **légume** (catégorie `legumes` de `js/data/ingredients.js` ou ingrédient perso de cette catégorie) → **candidat à cacher** : autorisé dans une recette *seulement* si la recette fournit une entrée `legumes_caches` pour ce légume ;
  - sinon → exclu.
- Sur un créneau 👩 1, seules ses préférences comptent (même règle pour les légumes cachés).
- La fiche recette affiche les astuces « 🙈 légume caché » bien visibles.

## 7. Remplir la semaine (écran planning, option A)

Bouton principal « ✨ Remplir la semaine » (remplace « Générer par IA »). Fenêtre bottom-sheet :
1. Sélecteurs + champ style libre.
2. Créneaux concernés : par défaut tous les créneaux **vides** de la semaine affichée (chips désélectionnables, comme aujourd'hui).
3. « Proposer » → l'algorithme de §8 remplit, **sans IA**. Résultat affiché directement dans le planning regroupé par session (Session dimanche → lun·mar / Mercredi sur place / Session mercredi → jeu·ven / Samedi / Dimanche), chaque créneau avec son badge portions, une étiquette `biblio`/`IA`/`reste`/`réserve`, et un bouton ↻.
4. Créneaux restés vides faute de candidat : bouton « ✨ Compléter avec l'IA (n repas) » → un seul appel IA pour tous ces créneaux (§9).
5. ↻ sur un créneau : propose le candidat suivant de la bibliothèque (même filtres) ; quand il n'y en a plus, « ✨ Idée IA » pour ce créneau seul.
6. Pas d'étape « Valider » séparée *(choix Claude)* : chaque proposition est écrite dans `planning` immédiatement (synchronisée en temps réel sur l'autre téléphone) ; ↻ et la suppression restent possibles à tout moment.

**Restes pour le midi de la femme** *(choix Claude)* : quand c'est possible, le midi 👩 1 du jour J reprend le plat du soir J‑1 de la même session (ex. mardi midi = curry de lundi soir). Concrètement les deux créneaux pointent vers la même `recette_id` ; la liste de courses agrège déjà par créneau (4 + 1 = 5 parts). Pour lundi midi et jeudi midi (premier jour de session), on choisit un plat de la même session (ex. une part du plat de mardi soir) — même mécanisme. L'étiquette `reste` l'indique dans l'UI.

L'ancien mode « 2 semaines » est retiré *(choix Claude)* : la règle de rotation (§8) remplit le même rôle anti-redondance.

## 8. Algorithme de sélection (bibliothèque, sans IA)

Fonction pure dans un module testable (`js/selection.js`, sans dépendance Supabase), entrée : recettes, préférences des deux profils, modèle de semaine, créneaux à remplir, sélecteurs, historique (planning des 4 semaines précédentes), réserve congélo. Sortie : affectation créneau → recette (ou vide).

1. **Filtres durs** par créneau : sélecteurs, exclusions §6 (selon les profils du créneau), halal (aucun mot porc/alcool — double sécurité), `conservation_jours` suffisante pour les créneaux de session, pas mangée dans les **3 dernières semaines** *(choix Claude)*, pas déjà utilisée ailleurs dans la semaine (hors restes volontaires).
2. **Score** :
   - goûts : `j_adore` +3, `j_aime` +1, `neutre` 0 par ingrédient/composant concerné, pour chaque profil du créneau ;
   - ancienneté : bonus croissant avec le nombre de semaines depuis la dernière utilisation ;
   - **réutilisation d'ingrédients** : bonus pour chaque ingrédient frais (légumes, protéines, herbes) déjà présent dans les recettes déjà choisies de la semaine — objectif « un maximum d'ingrédients réutilisés » ;
   - variété : malus si même `composants.proteine` ou même `cuisine` déjà choisie 2 fois dans la semaine ;
   - style libre : bonus si correspondance (§5) ;
   - réserve congélo : les plats en réserve compatibles passent en premier (§10).
3. Remplissage **glouton** dans l'ordre des créneaux (soirs à 4 d'abord, puis midis 👩 qui privilégient les restes), en recalculant le bonus de réutilisation à chaque choix.
4. Les créneaux sans candidat restent vides et alimentent l'appel IA.

Les poids exacts sont laissés au développeur, avec tests sur des cas simples (une recette adorée passe devant une neutre ; une recette mangée la semaine dernière est exclue ; deux recettes partageant la courgette sont préférées à deux sans ingrédient commun).

## 9. IA (Mammouth via Edge Function `ai`)

- Un seul appel pour tous les créneaux à compléter, JSON strict au format §4, `stream` + progression existante.
- Le prompt inclut, en plus des règles actuelles (halal, météo, préférences, végétarien…) :
  - pour chaque créneau : jour, moment, portions, profils concernés, session ou sur place, conservation minimale ;
  - la règle légumes cachés §6 (liste des légumes à cacher de la femme) ;
  - **les ingrédients des recettes déjà retenues dans la semaine, à réutiliser en priorité** ;
  - le vocabulaire fermé des `tags` ;
  - les sélecteurs et le style libre ;
  - la liste des noms de recettes déjà en bibliothèque, à ne pas dupliquer.
- Les recettes générées sont validées (végétarien si demandé, tags dans le vocabulaire, champs requis) puis enregistrées en bibliothèque et affectées.

## 10. ⚡ Envie ce soir (décidé : option 3)

Remplace la modale « ⚡ Maintenant » actuelle.
1. Cible : le prochain repas à venir (selon l'heure) *(choix Claude)*, modifiable en un tap (chips des créneaux du jour et du lendemain).
2. Sélecteurs + style libre, puis **3 propositions de la bibliothèque** (même algorithme, créneau unique), puis « ✨ Autre chose → idées IA » (1 recette, enregistrée en bibliothèque).
3. À la sélection, si le créneau avait déjà un plat, l'app **demande** :
   - **Décaler au repas suivant** : le plat prend le prochain créneau compatible (même nombre de portions ou plus) ; si ce créneau est occupé, son plat est décalé à son tour, en cascade jusqu'à la fin de la semaine ; le plat qui « sort » de la semaine va en réserve congélo. L'app affiche le résultat avant confirmation.
   - **Mettre au congélo** : le plat part dans la réserve.
   - **Supprimer** : le créneau est simplement remplacé.
4. **Réserve congélo** (nouvelle table) : `{ id, recette_id, portions, ajoute_le }`. Visible dans le planning (petit compteur ❄️), proposée en priorité par l'algorithme les semaines suivantes (aucune cuisine ni course nécessaire pour ce créneau : la liste de courses l'ignore).

## 11. Liste de courses (décidé)

- **La « semaine » de l'app est un cycle samedi soir → samedi midi suivant** (décidé). Ordre affiché : sam soir, dim (midi, soir, + session → lun·mar), lun, mar, mer (midi, soir, + session → jeu·ven), jeu, ven, sam midi. Navigation ← → par cycle.
- **Deux courses par cycle** (décidé) : 🛒 **samedi en magasin** et 🚗 **mercredi en drive**.
- **Une seule liste par cycle**, découpée en deux sections *(découpage : choix Claude)* :
  - 🛒 Samedi magasin : ingrédients des repas sam soir → mar soir (dont la session du dimanche) ;
  - 🚗 Mercredi drive : ingrédients des repas mer midi → sam midi (dont la session du mercredi) ;
  - un ingrédient présent dans les deux parties va dans la première, en quantité totale ;
  - l'épicerie sèche (féculents secs, conserves, épices, condiments — catégories `Féculents` / `Épicerie & Condiments` de `CAT_MAP`) va de préférence au drive du mercredi, sauf si elle sert avant mercredi.
  - Dans chaque section, regroupement par rayon comme aujourd'hui.
- En base, `planning.semaine_key` reste la semaine ISO de chaque jour (aucune migration de données) ; le cycle est calculé à partir des dates. `courses_etat` reçoit la clé ISO du samedi qui ouvre le cycle (suffixée `-C` pour ne pas mélanger avec l'ancien état).
- Agrégation par créneau, portions ajustées, comme aujourd'hui.
- Les créneaux servis depuis la réserve congélo ne génèrent pas de courses.
- Les restes (même recette sur deux créneaux) s'agrègent naturellement (4 + 1 parts).

## 12. Données — changements Supabase

- `recettes` : + `description text`, `cuisine text`, `composants jsonb`, `legumes_caches jsonb default '[]'`, `tags text[] default '{}'`, `conservation_jours int`.
- `planning` : + `source text` (`biblio` | `ia` | `reste` | `reserve` | `manuel`) pour l'étiquette, nullable.
- `reglages` : `{ cle text primary key, valeur jsonb }` — contient `modele_semaine`.
- `reserve` : `{ id uuid pk, recette_id text references recettes on delete cascade, portions int, ajoute_le timestamptz }`.
- Toutes avec la politique « membre du foyer » et ajoutées à la publication temps réel, comme la migration du 2026-10-24.

## 13. Contraintes

- JS vanilla, pas de build, mobile-first iPhone, bottom sheets, conventions du projet (camelCase, commentaires FR, 2 espaces).
- Toute logique de choix testable sous Node (`node --test tests/*.test.mjs`).
- Clé IA uniquement côté Edge Function.
- Les deux téléphones voient les changements en temps réel.

## 14. Laissé au développeur

- Poids exacts du score et ordre fin du remplissage glouton.
- Mise en page précise de la section Réglages (éditeur du modèle de semaine).
- Détection « ingrédient frais » pour le bonus de réutilisation (catégories existantes de `CAT_MAP`).
- Découpage en lots de la conversion des 21 recettes.
- Comportement hors ligne (non requis).

## 15. Choix faits par Claude (à vérifier)

1. Modèle de semaine éditable dans Réglages, stocké dans Supabase.
2. Midi de la femme = reste d'un plat de la même session quand c'est possible.
3. Pas d'étape « Valider » : chaque proposition est enregistrée immédiatement.
4. Mode « 2 semaines » retiré au profit de la rotation.
5. Rotation : pas deux fois la même recette en 3 semaines.
6. Conversion des 21 recettes existantes par l'IA, via un bouton.
7. « Envie ce soir » cible par défaut le prochain repas à venir.
8. « Décaler » en cascade, avec le plat sortant envoyé en réserve congélo.
9. Répartition de la liste entre samedi et mercredi (§11), en particulier l'épicerie sèche envoyée au drive.
