# Audit — « Vider le placard » (28/10/2026)

Périmètre : `placard.html`, `js/placard.js`, `js/placard-ui.js`, `genererPourPlacard` / `buildPromptPlacard` (`js/ai.js`), commit `3034c2a`.
Méthode : lecture du code, script de vérification sur des saisies et des correspondances réelles, parcours navigateur existants (`tests/e2e/parcours.mjs`).
Légende : **[Constat]** vérifié par script ou dans le code · **[Hypothèse]** à confirmer à l'usage.

## Synthèse

Le parcours de base marche : saisie en vrac, recettes existantes d'abord, IA pour le reste avec 3 à 4 articles par recette, contrôle halal et goûts, export .md, indépendance vis-à-vis du planning et des courses.

Trois points faussent le résultat dès qu'on vide un vrai placard :
1. **La correspondance article ↔ ingrédient a des faux positifs.** « Riz » est compté comme utilisé par du vinaigre de riz, « Pâtes » par de la pâte feuilletée, « Poulet » par du bouillon de poulet. La jauge et le choix des recettes existantes se trompent.
2. **La saisie casse sur des cas courants.** « lait 1,5 L » donne deux articles (« Lait » et « 5 L »), « 2x lait de coco » donne « X lait de coco », « 1/2 paquet de farine » donne « Paquet de farine ».
3. **« C'est cuisiné » retire du placard les articles de toutes les recettes retenues**, pas seulement de celle qu'on vient de cuisiner.

## Problèmes

### Majeurs

| # | Constat | Preuve | Impact | Correctif | Effort |
|---|---|---|---|---|---|
| P1 | **Faux positifs de correspondance** [Constat] : un article court « contenu » dans un ingrédient composé est compté. Vrais sur 8 cas testés sur 12 : Riz ↔ Vinaigre de riz, Poulet ↔ Bouillon de poulet, Pâtes ↔ Pâte feuilletée, Coco râpée ↔ Lait de coco, Pois chiches ↔ Farine de pois chiches, Maïs ↔ Fécule de maïs, Sucre ↔ Sucre glace, Concentré de tomate ↔ Tomates | `placard.js:70-80` (`utilise`) | Article marqué « utilisé » à tort, jauge trop optimiste, recette existante retenue pour un article qu'elle n'utilise pas, « À acheter » incomplet | N'accepter « article ⊂ ingrédient » que si le **premier mot** de l'ingrédient est dans l'article (« riz » ⊂ « riz basmati » oui, « riz » ⊂ « vinaigre de riz » non) ; étendre la règle des têtes composées (`pate`, `sucre`, `farine`, `fecule`, `concentre`…) dans les deux sens ; cas de test pour chacun | S |
| P2 | **Saisie cassée sur des cas courants** [Constat] : « lait 1,5 L » → « Lait » + « 5 L » (la virgule décimale coupe) ; « 2x lait de coco » → « X lait de coco » ; « 1/2 paquet de farine » → « Paquet de farine » ; « pâtes 3 paquets de 500 g » → « Pâtes 3 paquets de » ; « riz, pâtes et semoule » → « Pâtes et semoule » ; « épices : cumin, paprika » → « Épices : cumin » | `placard.js:29-37` (`lireInventaire`) | Articles faux ou en double, à corriger à la main | Ne couper sur la virgule que si elle n'est pas entre deux chiffres ; reconnaître `2x` / `x2` / `×2` ; retirer l'unité de conditionnement du nom (« paquet de ») ; couper sur « et » ; ignorer un préfixe « épices : » ; tests | S |
| P3 | **« C'est cuisiné » retire tout** [Constat] : le bouton enlève les articles de *toutes* les recettes retenues | `placard-ui.js:202-209` | Cuisiner une recette sur six vide l'inventaire de ce que les cinq autres attendent | Un bouton « Cuisiné » **par recette** : retire ses articles (ou baisse la quantité si on la connaît) et la marque faite (barrée, ou sortie de la sélection) ; garder le bouton global en « Tout est cuisiné » | S |
| P4 | **Article non halal ou détesté accepté sans rien dire** [Constat] : « lardons », « vin rouge », « chorizo » entrent dans l'inventaire ; l'IA reçoit la consigne de les ignorer, ils restent « pas encore utilisés » à chaque passage, et l'IA est rappelée pour rien | `placard-ui.js:227-237` (aucun contrôle), `ai.js` (« ignoré ») | Recettes IA payées pour des articles qu'aucune recette n'utilisera ; jauge jamais à 100 % | À la saisie : marquer l'article (« pas halal », « Ma femme n'aime pas »), l'exclure des groupes IA et de la jauge, proposer « Retirer » ; les légumes « à cacher » restent autorisés | S |
| P5 | **Groupes IA sans ingrédient principal** [Constat] : sur un placard riche en épicerie, une recette reçoit « Thon, Cannelle, Sucre », une autre « Farine, Curry, Vinaigre balsamique » | `placard.js:149-156` (`repartirArticles`, tourniquet par rayon) | Associations incohérentes, l'IA force des plats bizarres ou ignore des articles | Répartir en deux temps : d'abord une **base** par recette (féculent, protéine, légume, conserve), puis les épices et condiments en **compléments** (au plus 1 ou 2 par recette, ou en libre-service pour toutes) ; ne pas compter les épices dans la limite de 4 | M |
| P6 | **Inventaire partagé écrasé** [Constat] : chaque modification réécrit tout l'inventaire (une seule valeur JSON). Si les deux téléphones notent en même temps, le dernier efface les ajouts de l'autre ; l'écho temps réel est aussi ignoré pendant 3 s, y compris celui de l'autre téléphone | `placard-ui.js:36-42`, `:299-303` | Articles perdus quand on vide le placard à deux (cas prévu) | Relire puis **fusionner par id** avant d'écrire (ajouts et suppressions des deux côtés) ; à terme, une table `inventaire` (une ligne par article) | M |

### Mineurs

| # | Constat | Preuve | Correctif | Effort |
|---|---|---|---|---|
| m1 | Le nombre de recettes IA choisi est remis à la valeur conseillée quand « Trouver les recettes » passe par la bibliothèque | `placard-ui.js:130` (`nbIAChoisi = false`) | Garder le choix, seulement le borner (minimum, maximum) | S |
| m2 | Une recette existante qui n'utilise qu'**un** article n'est jamais retenue (minimum 2), même si elle est le meilleur usage de cet article | `placard.js:101,117` | Après le glouton à 2, une seconde passe à 1 article pour les restants avant l'IA | S |
| m3 | Faux négatifs de synonymes : « Steaks hachés » ↔ « Viande hachée », « Lentilles corail » ↔ « Lentilles » oui, mais ↔ « Lentilles vertes » non (correct) | `placard.js:70-80` | Petite table de synonymes (steak haché/viande hachée, crème/crème fraîche, gruyère/emmental râpé…) | S |
| m4 | La quantité n'est pas prise en compte : 1 kg de farine est « utilisé » par une recette qui en prend 20 g | `couverture` | Afficher « 20 g sur 1 kg » quand les unités sont comparables ; garder l'article en « partiellement utilisé » | M |
| m5 | La sélection garde des recettes qui n'utilisent plus rien après modification de l'inventaire | `afficherResultats` | Les signaler (« n'utilise plus rien du placard ») avec « Retirer » | S |
| m6 | L'inventaire n'est ni trié ni groupé : difficile à relire au-delà de 20 articles | `afficherInventaire` | Grouper par rayon (comme les courses), compteur par rayon | S |
| m7 | Le coût affiché porte sur le nombre de recettes IA demandé avant la recherche dans la bibliothèque | `afficherPlan` | Recalculer après la recherche, ou indiquer « au plus » | S |

## Améliorations proposées (au-delà des correctifs)

| Idée | Pourquoi | Effort |
|---|---|---|
| **« À finir vite »** sur un article (date proche, entamé) : servi en premier dans les groupes IA et dans le choix des recettes existantes | C'est le cœur de l'anti-gaspi : vider d'abord ce qui va se perdre | S |
| **Ordre conseillé des recettes** : celles qui utilisent les articles « à finir vite » et les frais en premier | Savoir quoi cuisiner ce soir | S |
| **Décompte des quantités** à la cuisson quand les unités le permettent (500 g de riz − 300 g = 200 g restant) | L'inventaire reste juste sans tout ressaisir | M |
| **« Encore des idées »** sur une recette retenue qui ne plaît pas : remplacée par une autre avec les mêmes articles | Aujourd'hui, retirer une recette laisse ses articles « restants » sans proposition | S |
| **Photo du placard** : l'IA lit une photo d'étagère et pré-remplit la liste (à vérifier avant d'ajouter) | Saisie plus rapide pour un gros placard ; coût IA à afficher, IA en dernier recours | L |
| **Saisie guidée** : suggestions de noms depuis la base des ingrédients (150+) et les articles déjà saisis | Noms homogènes, meilleures correspondances (P1, m3) | M |

## Ordre conseillé

1. P1, P2, P3, P4, m1 (moins d'un jour) : résultats justes et rien de perdu.
2. P5, m2, m5, m6, « À finir vite », ordre conseillé, « Encore des idées » (1 à 2 jours).
3. P6, m4 et décompte des quantités, saisie guidée (quelques jours) ; photo du placard plus tard.

Tout reste compatible avec CLAUDE.md : bibliothèque d'abord, halal et goûts contrôlés, mode indépendant du planning et des courses.

## Suivi (28/10/2026)

| # | État | Où |
|---|---|---|
| P1 | Corrigé : tête du nom obligatoire, têtes composées dans les deux sens | `correspond` (`placard.js`), tests P1 |
| P2 | Corrigé : virgule décimale, `2x`/`x2`, conditionnement, « et », préfixe | `lireInventaire`, tests P2 |
| P3 | Corrigé : « Cuisiné » par recette, décompte des quantités ; global renommé « Tout est cuisiné » | `apresCuisson`, `placard-ui.js` |
| P4 | Corrigé : article signalé, exclu de la jauge et de l'IA, bouton Retirer | `statutArticle` |
| P5 | Corrigé : une base par recette, épices en compléments (2 au plus) | `repartirArticles`, prompt |
| P6 | Corrigé : fusion par article avec le serveur, écritures en file, écho temps réel comparé au contenu | `fusionnerModifications` |
| m1 | Corrigé : choix gardé, seulement borné | `placard-ui.js` |
| m2 | Corrigé : seconde passe à 1 article de base | `choisirDansBibliotheque` |
| m3 | Corrigé : synonymes (steak haché, crème, emmental…) et pluriels | `SYNONYMES` |
| m4 | Corrigé : « 300 g sur 1 kg », article partiellement utilisé | `couverture` |
| m5 | Corrigé : « N'utilise plus rien du placard » | `afficherResultats` |
| m6 | Corrigé : groupé par rayon avec compteur | `afficherInventaire` |
| m7 | Corrigé : « Au plus : » | `afficherPlan` |
| À finir vite, ordre conseillé, Autre recette, décompte | Faits | `ordreConseille`, `autreRecette`, `apresCuisson` |
| Saisie guidée | Version légère : noms ramenés à ceux de la base des ingrédients | `lireInventaire({ noms })` |
| Photo du placard | Non fait (effort L) | — |
