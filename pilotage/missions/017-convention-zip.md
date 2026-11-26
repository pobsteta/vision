# Mission 017 — Convention du zip

## Reprise du 26 novembre 2026 (proposée par l'orchestrateur, à valider par Pascal, porte n° 2)

> Décision de Pascal du 26 novembre 2026 (spec § 11 n° 5) : **page unique « préparer son zip » pour JFC, avec la notice de
> la 018**. Le texte d'origine plus bas est l'historique ; la convention est aujourd'hui répartie entre spec § 3.1, § 4, § 5
> et README § 3.

**En une phrase :** Écrire `docs/preparer-son-zip.md`, une page que JFC peut suivre seul : formats acceptés, Shapefile complet,
système de coordonnées (Lambert 93, GeoJSON sans `crs` lu en WGS84), noms de couches qui donnent les styles du manuel et ceux de
la bibliothèque (052), plafond de 100 Mo, nom réservé `_cache-onf.zip`, ce qui est refusé et le message que l'agent verra ;
pour qu'un zip préparé d'après cette page passe tous les contrôles du premier coup.

- **Homme :** `archiviste`, puis `relecteur`. Modèle : sonnet.
- **Harnais :** écrit `docs/preparer-son-zip.md` et un renvoi depuis le README ; **une source unique** : la page renvoie à la
  spec pour le détail plutôt que de le recopier, sauf ce dont JFC a besoin pour agir ; aucune règle inventée ; les champs
  `CODE_*` / `CCOD_*` restent écrits comme provisoires (question à JFC).
- **Tests :** test de la minute (chaque règle trouvée en moins d'une minute) ; un test vérifie que chaque format, le plafond et
  le nom réservé cités dans la page sont ceux du code (`plugin/vision-logique.mjs`).
- **Terrain :** Pascal la lit, puis fabrique un zip d'après elle ; le zip passe sur le Samsung.
- **Lien avec la 018 (notice de JFC)** : la 018 attend toujours les fichiers bruts de JFC ; cette page part seule et la notice
  la citera.


> Fiche rédigée par Claude (orchestrateur) le 2 novembre 2026 avec `/imperatrice:mission`.
> **Statut : validée par Pascal le 2 novembre 2026 (porte n° 2).** Une mission = une phrase = une
> branche = une PR.

## Mission

**En une phrase (quoi, et pourquoi) :** Rédiger la convention du zip en une page avec l'annexe des styles, pour que JFC fabrique un zip que le plugin accepte du premier coup.

**Redite par l'agent :** _à compléter par l'agent avant d'agir — s'il n'y arrive pas, il s'arrête._

## Les trois questions (règle de staffing)

| Question | Réponse | Conséquence |
|---|---|---|
| Peut-il redire la mission en une phrase, avec son but ? | oui | confier |
| Sait-il comment faire ? (sources, conventions nommées ci-dessous) | oui — spec § 3.1, § 4, § 5 | confier |
| A-t-il les moyens ? (outils, données d'essai, tests) | oui | confier |

**Temps de la main :** appuyer.

## Ma réponse d'abord

_Rempli par Pascal seul, avant de lire le travail de l'agent._

## L'Homme

- **Agent :** `archiviste`
- **Modèle :** sonnet
- **Ce qui ne lui est pas demandé :** la notice.

## Harnais

- **Peut :** écrire `docs/convention-zip.md`.
- **Ne doit pas :** sortir du périmètre, inventer une donnée ou un code, toucher à `main`,
  modifier `docs/brief.md`, `docs/spec.md` ou une ADR (il signale l'écart à
  l'orchestrateur), effacer une ligne de `pilotage/journal.md`.
- **Sources autorisées :** `docs/spec.md` § 3.1, § 4, § 5.

## Valeur provisoire (chiffre, réglage)

- champs de code : provisoires (voir 009).

## Dépend de / rouge attendu jusqu'à

- aucune.

## Tests

- **Comment saura-t-on que c'est juste :** test de la minute : on trouve chaque règle en moins d'une minute ; une page. Commande : `.claude/test-command`.

## Terrain

- **Échantillon que Pascal vérifiera :** Pascal la lit et fabrique un zip conforme.

## Qui veille, qui tranche

- **Relecteur :** `relecteur`, puis Pascal.
- **Critère d'arrêt de la relecture :** 3 allers-retours ; au-delà, la décision remonte à Pascal.
- **Point de suivi :** à la remise de la PR, puis à la fin du cycle de `/boucle`.
- **Qui tranche :** Pascal.

## Comment saura-t-on que ça marche ?

un zip fait d'après la page passe tous les contrôles.
