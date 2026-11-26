# Mission 054 — Bouton « Vider le cache ONF »

> Fiche rédigée par Claude (orchestrateur) le 25 novembre 2026, à la demande de Pascal (« Il faut
> prévoir un bouton pour vider le cache non ? … fais ce qu'il faut »). **Statut : validée par Pascal le 26
> novembre 2026 (porte n° 2).** La mission 053, dont elle dépendait, est fusionnée (PR #60) ; le plugin est en 0.9.0
> (missions 055 et 014). La fiche a d'abord été proposée dans la PR #59.

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

## Mise à jour du 26 novembre 2026 (validation)

État à prendre en compte (voir `docs/spec.md` § 3.3 et § 3.6, `docs/referentiels/cache-zone-qfield.md` § 14 et § 15) :
- **Mode groupe** (`vision.qgz` actuel) : les trois couches du groupe « ONF Cache » lisent des fichiers à chemin fixe
  `vision-imports/_cache-onf/actuel/<couche>.gpkg`. Les effacer ferait la page « Impossible de charger certaines couches » à
  l'ouverture suivante : **vider veut dire remettre des GeoPackage vides** à ces chemins (par la bascule prouvée, avec retour
  arrière), sortir le cache du registre, puis `reload()`. Jamais `removeMapLayer` sur ces couches.
- **Mode ancien** (ancien `vision.qgz`) : couches ajoutées par le plugin, retirées par `removeMapLayer`, fichiers effacés.
- **Dossier vide** : un dossier de génération vide reste (décision de Pascal pour la 014, même raison).
- **Rappel de la 055** : après le vidage, le panneau dit « Cache ONF absent… » (déjà prévu par le registre).
- **Version** : 0.10.0. **Preuve avant code**, puis **textes proposés à Pascal** (bouton, confirmation, réussite, échec) avant
  toute ligne de plugin.
