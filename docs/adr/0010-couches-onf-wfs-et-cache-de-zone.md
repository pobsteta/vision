# ADR 0010 — Couches ONF : WFS en ligne et cache de zone sur le mobile

- **Date :** 2026-11-25
- **Statut :** **acceptée par Pascal le 25 novembre 2026** (« je valide le reste »)
- **Proposée par :** Claude (orchestrateur)
- **Tranchée par :** Pascal
- **Mission :** 053 (`pilotage/missions/053-couches-onf-wfs.md`)
- **N'amende aucune ADR** ; s'appuie sur l'ADR 0003 (registre) et l'ADR 0008 (couches écrites sur le disque avec
  leur style à côté).

## La décision en une phrase

Les forêts publiques, les parcelles forestières et les points de rencontre des secours de l'ONF viennent du
service WFS `http://ws.carmencarto.fr/WFS/105/ONF_Forets` : en ligne, par trois couches WFS d'un groupe « ONF »
de `vision.qgz` ; sans réseau, par un **cache de zone** que l'agent fait avec réseau depuis le panneau Vision
(les trois couches sur l'emprise de sa carte, écrites en GeoPackage dans `vision-imports/_cache-onf/` avec leur
style à côté), et qui revient à chaque réouverture.

## Contexte

- Demande de Pascal (25 novembre 2026) : ajouter ce service et ses trois couches, aux styles qu'il a fournis
  (`docs/referentiels/brut/onf/`). Le terrain est sans réseau (brief) : un WFS seul y serait vide.
- Mesure n° 1 (GitHub Actions, 25 novembre 2026, `docs/referentiels/brut/onf/mesure-2026-11-25.md`) : toute la
  métropole pèse 687 Mo et demande 47 min (408 400 parcelles, 505 Mo, 36 min) : une copie nationale embarquée
  n'est pas livrable. Le service sert WFS 1.0.0, 1.1.0 et 2.0.0, en EPSG:2154, http seulement.
- Sonde sur le Samsung de Pascal (QField 4.3.8, essais n° 1 à 4, journal du 25 novembre) : `GetFeature` + `BBOX`
  en http répond en moins d'une seconde sur une zone de travail (161 parcelles, 242 Ko, 0,2 s) ; le GML est lu par
  QField, accents justes ; réécrit en GeoPackage sans perte ; relu sans réseau. Défauts : système inconnu, type de
  géométrie variable, libération des couches impossible en QML (Qt 6.10.3).
- Prototype du cache (plugin 0.7.0 d'essai) validé par Pascal sur le Samsung, en ligne et hors ligne.
- Accord de l'ONF pour cet usage : rapporté par Pascal, sans pièce écrite (décision de Pascal).

## Ce qui est décidé

1. **En ligne** : groupe « ONF » dans `vision.qgz`, entre « Saisie terrain » et les fonds, trois couches WFS en
   lecture seule, nommées comme celles du cache (« Forêts publiques (© ONF) », « Parcelles forestières (© ONF) »,
   « Points de secours (© ONF) » : « en ligne » écarté par Pascal, trop long), requêtes limitées à l'emprise visible ; forêts toujours visibles, parcelles et points en deçà du
   1:50 000 ; hors du thème « Fond embarqué ».
2. **Sans réseau** : bouton « Mettre en cache les couches ONF de cette zone » ; emprise visible (quatre coins si la
   carte est tournée) de 20 km de côté au plus, 5 000 objets par couche au plus ; requêtes `GetFeature` WFS 1.0.0 +
   `BBOX` ; contrôle de complétude obligatoire ; système EPSG:2154 et type de géométrie imposés par un `.gfs` écrit
   à côté du GML ; GeoPackage et `.qml` voisin dans `vision-imports/_cache-onf/<horodatage>/` ; **une seule zone**,
   remplacement tout ou rien (l'ancien cache est gardé en cas d'échec) ; inscription au registre (sorte « cache ») ;
   couches en tête de liste (un plugin ne peut pas ranger une couche dans un groupe), en lecture seule.
3. **Styles** : ceux de Pascal, adaptés aux champs réels du service par génération (forêts étiquetées par
   `iidtn_frt`, parcelles par `ccod_prf`, formulaire des points sur ses vrais champs) ; les `.qml` d'origine restent
   intacts.
4. **Attribution** « © ONF » : dans le nom des couches du cache (le plugin ne peut pas poser `rights`) ; dans
   l'attribution des couches WFS de `vision.qgz`.
5. **Textes** affichés : ceux validés par Pascal (fiche 053), mot pour mot.

## Options écartées

- **WFS seul** : vide sans réseau, contraire au brief.
- **Copie nationale embarquée** (premier choix de Pascal, abandonné le 25 novembre 2026) : 687 Mo, 47 min de
  fabrication, mise à jour lourde.
- **Couche WFS filtrée réécrite par QGIS** (voie A) : écran figé pendant le téléchargement, cache incomplet sans
  signe visible ; gardée en repli documenté (`docs/referentiels/cache-zone-qfield.md`).
- **Cache rangé dans le groupe « ONF »** (voie C4) : non prouvée, non examinée jusqu'au bout.

## Le crible FRANCE

| Lettre | Question | Réponse | Ce que ça coûte | Prêts à payer ? |
|---|---|---|---|---|
| **F**rugale | Plus simple ? | Mécanismes de QGIS et GDAL (`.gfs`, `.qml` voisin, `saveVectorLayerAs`) ; pas de copie nationale. | Code du cache dans le plugin (requêtes, contrôles, registre). | oui (Pascal, 25 novembre 2026) |
| **R**esponsable | Qui fait quoi ? | L'agent met en cache avec réseau, avant de partir ; l'ONF tient le service. | Un geste de plus pour l'agent. | oui (Pascal, 25 novembre 2026) |
| **A**nticiper | Imprévu ? | Service indisponible ou modifié (champs, http) ; zone plus grande que 20 km ; cache oublié avant le départ ; mémoire non libérée (Qt). | Message clair, ancien cache gardé ; zone limitée. | oui (Pascal, 25 novembre 2026) |
| **N**ovateur | Idées écoutées ? | Copie nationale, WFS seul, voie A, voie C4 examinées ; sonde avant le prototype. | — | — |
| **C**oût | Dépense inutile ? | Pas de fabrication nationale ni de stockage lourd. | — | — |
| **É**cologique | Réutilisation ? | Données publiques de l'ONF, service existant ; formats ouverts (GML, GeoPackage). | — | — |

## Valeurs sacrifiées

- **Le rangement** : le cache s'affiche en tête de liste, hors du groupe « ONF ».
- **L'étendue sans réseau** : une seule zone de 20 km au plus.
- **La mémoire** : les couches de travail ne sont pas libérées avant la fermeture de QField (Qt 6.10.3) ; mission
  à part proposée.
- **La preuve écrite de l'accord de l'ONF** : décision de Pascal.

## Ce qui reste à prouver

- Affichage des couches WFS de `vision.qgz` dans QField 4.3.8 sur le Samsung, avec réseau.
- Tenue d'une zone proche des plafonds (20 km, 5 000 objets) sur l'appareil.
