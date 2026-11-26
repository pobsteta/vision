# Mission 014 — Registre complet

## Reprise du 26 novembre 2026 (proposée par l'orchestrateur, à valider par Pascal, porte n° 2)

> Décisions de Pascal du 26 novembre 2026 (spec § 11 n° 2 et 3) : **dossier vide effacé**, **dossier entier remplacé au
> réimport**, **013 fusionnée ici**. Le texte d'origine plus bas est l'historique : une grande part du § 3.3 est déjà faite
> (missions 024, 031, 038, 049 : réimport qui remplace, retrait qui efface les fichiers, copie absente).

**En une phrase :** Le registre du plugin tient toutes les règles du § 3.3, y compris les deux décisions du 26 novembre
(dossier `vision-imports/<zip>/` effacé quand il ne contient plus rien, dossier entier remplacé au réimport), chacune
couverte par un test d'acceptation écrit avant le code, pour que l'agent ne garde jamais de restes d'un zip retiré ou réimporté.

**Trois temps :**
1. **Testeur** (sans lire le code) : état des lieux des règles du § 3.3 et des deux décisions ; un test d'acceptation par
   règle, dans `tests/registre-014.test.mjs` ; ceux qui passent déjà le disent (règle déjà tenue), les autres sont rouges.
2. **Dev, preuve avant code** : un plugin QField sait-il effacer un **dossier** ? La 053 n'en a trouvé aucun moyen (spec § 3.3,
   « aucune fonction d'effacement de dossier exposée »). Lire les sources de QField v4.3.8 (`FileUtils`, `platformUtilities`).
   **Si c'est impossible, s'arrêter** : la décision « dossier vide effacé » revient à Pascal (variante : dossier vide laissé,
   écrit comme limite). Le remplacement du dossier entier au réimport peut se faire fichier par fichier (les fichiers de l'ancien
   zip absents du nouveau sont effacés) : à vérifier contre le code actuel.
3. **Dev** : faire passer les tests rouges, sans en affaiblir aucun ; aucun nouveau texte affiché sans Pascal.

- **Homme :** `testeur` (temps 1), `dev` (temps 2 et 3), puis `relecteur`. Modèle : sonnet.
- **Harnais :** `plugin/vision-logique.mjs`, `plugin/Vision.qml`, tests ; jamais hors de `vision-imports/` ; jamais de
  fichier du cache ONF (`_cache-onf/`) ni de `saisie.gpkg`.
- **Terrain (Pascal, Samsung) :** importer un zip, retirer toutes ses couches : plus de dossier (ou dossier vide si la voie est
  impossible) ; réimporter un zip modifié (une couche en moins) : la couche disparue n'a plus de fichier.
- **Dépend de :** rien ; ne touche pas à la mission 054 (cache ONF, PR #59 en attente).


> Fiche rédigée par Claude (orchestrateur) le 2 novembre 2026 avec `/imperatrice:mission`.
> **Statut : validée par Pascal le 2 novembre 2026 (porte n° 2).** Une mission = une phrase = une
> branche = une PR.

## Mission

**En une phrase (quoi, et pourquoi) :** Compléter le registre du squelette avec toutes les règles du § 3.3, pour que l'agent retrouve ses couches après un redémarrage, une carte SD retirée ou un zip réimporté.

**Redite par l'agent :** _à compléter par l'agent avant d'agir — s'il n'y arrive pas, il s'arrête._

## Les trois questions (règle de staffing)

| Question | Réponse | Conséquence |
|---|---|---|
| Peut-il redire la mission en une phrase, avec son but ? | oui | confier |
| Sait-il comment faire ? (sources, conventions nommées ci-dessous) | oui — spec § 3.3, ADR 0003 | confier |
| A-t-il les moyens ? (outils, données d'essai, tests) | oui — tests 013 | confier |

**Temps de la main :** appuyer.

## Ma réponse d'abord

_Rempli par Pascal seul, avant de lire le travail de l'agent._

## L'Homme

- **Agent :** `dev`
- **Modèle :** sonnet
- **Ce qui ne lui est pas demandé :** interface.

## Harnais

- **Peut :** modifier `plugin/registre.mjs`.
- **Ne doit pas :** sortir du périmètre, inventer une donnée ou un code, toucher à `main`,
  modifier `docs/brief.md`, `docs/spec.md` ou une ADR (il signale l'écart à
  l'orchestrateur), effacer une ligne de `pilotage/journal.md`.
- **Sources autorisées :** `docs/spec.md` § 3.3, ADR 0003.

## Valeur provisoire (chiffre, réglage)

- aucune.

## Dépend de / rouge attendu jusqu'à

- 008, 013 ; ordre de fusion 013 → 014.

## Tests

- **Comment saura-t-on que c'est juste :** tests 013 au vert. Commande : `.claude/test-command`.

## Terrain

- **Échantillon que Pascal vérifiera :** Pascal réimporte un zip modifié et retire une couche sur le Samsung.

## Qui veille, qui tranche

- **Relecteur :** `relecteur`, puis Pascal.
- **Critère d'arrêt de la relecture :** 3 allers-retours ; au-delà, la décision remonte à Pascal.
- **Point de suivi :** à la remise de la PR, puis à la fin du cycle de `/boucle`.
- **Qui tranche :** Pascal.

## Comment saura-t-on que ça marche ?

la couche retirée ne revient pas ; le zip réimporté remplace l'ancien.

## Ajout du 4 novembre 2026 (Pascal)

- Les messages de réouverture (couche qui ne se recharge pas, zip absent) commencent eux aussi
  par le nom de la couche avec son extension (règle de la spec § 4, étendue au registre).
- Le zip réimporté est copié sous un nom provisoire dans `cerf-imports/` et ne remplace
  l'ancienne copie qu'après un import réussi (Pascal, 4 novembre 2026) : un zip abîmé ne doit
  pas rendre illisibles, à la réouverture, les couches gardées sur la carte.
