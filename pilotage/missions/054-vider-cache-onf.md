# Mission 054 — Bouton « Vider le cache ONF »

> Fiche rédigée par Claude (orchestrateur) le 25 novembre 2026, à la demande de Pascal (« Il faut
> prévoir un bouton pour vider le cache non ? … fais ce qu'il faut »). **Statut : proposée, à valider
> par Pascal.** À lancer **après la fusion** de la mission 053 (branche `claude/awesome-dirac-sbuica`,
> cache de zone, ADR 0010), dont elle dépend.

## Constat

Le cache de zone de la 053 (plugin 0.7.0, `vision-imports/_cache-onf/`) se remplace quand on le
refait sur une autre zone, mais rien ne permet de le retirer : spec § 11 n° 11 de la branche 053 (« le
cache n'a pas de bouton d'annulation »). L'agent ne peut ni libérer la place ni revenir à un projet
sans cache.

## Mission

**En une phrase :** Un bouton « Vider le cache ONF » du panneau Vision, avec confirmation, retire de
la carte les couches du cache, efface `vision-imports/_cache-onf/` et sort le cache du registre,
sans toucher aux couches WFS, aux zips importés ni à `saisie.gpkg`.

- Confirmation obligatoire (gants : pas de vidage sur un toucher involontaire).
- Retrait par `removeMapLayer` (pas `deleteLater`, inopérant sous Qt 6.10, journal du 25 novembre).
- Tout ou rien autant que possible ; un échec dit ce qui reste, l'ancien état n'est pas cassé.
- Tenir compte de la voie C4 de l'étape 3 de la 053 (chemins fixes `_cache-onf/actuel/`, GeoPackage
  vides attendus à l'ouverture pour éviter la page « Unable to load some layers ») : vider peut vouloir
  dire remettre des GeoPackage vides plutôt qu'effacer. **Preuve avant code** selon l'état de la 053
  fusionnée.
- Textes (bouton, confirmation, réussite, échec) **proposés puis validés par Pascal** avant le code.
- Tests rouges d'abord ; aucun test affaibli.

## Terrain

Sur le Samsung : cache fait, puis vidé ; couches du cache absentes ou vides, WFS et zips intacts ;
réouverture du projet sans plantage ni page d'erreur ; nouveau cache possible ensuite.

## Qui

- `dev` (sonnet), puis `relecteur` ; essai sur le Samsung (téléphone branché, essai possible par
  l'orchestrateur) ; **tranche :** Pascal (textes, PR).
