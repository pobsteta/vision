# Mission 053 — Couches ONF (forêts, parcelles, points de rencontre des secours) dans le projet modèle

> Fiche rédigée par Claude (orchestrateur) le 25 novembre 2026, à la demande de Pascal (« peux-tu
> ajouter ce service WFS au projet vision avec les couches Forêt, parcelles et point de rencontre en
> prenant comme style les styles joints »). **Statut : validée par Pascal le 25 novembre 2026** (« je valide »).
>
> **Changement de cap** : le bilan n° 1 (5 novembre 2026) suspendait les nouvelles fonctions jusqu'aux
> résultats de recette ; Pascal lève cette pause pour ce sujet en le demandant (journal du 25 novembre).

## Ce qui est su (25 novembre 2026)

- **Service** : `http://ws.carmencarto.fr/WFS/105/ONF_Forets?`, MapServer 7.0.0, **WFS 1.0.0 seulement**,
  **http seulement** (le port 443 coupe la connexion), « Données publiques de l'ONF en Métropole »,
  « Aucune condition ne s'applique ». GetCapabilities fourni par Pascal, versé dans
  `docs/referentiels/brut/onf/` avec les trois styles (versés tels quels).
- **Couches retenues** (toutes en `EPSG:2154`) :

  | Couche du service | Titre | Style joint par Pascal |
  |---|---|---|
  | `FOR_PUBL_FR` | Forêts publiques | `RDF_FRT.qml` (contour cyan, étiquette `CCOD_FRT` au-delà du 1:50 000) |
  | `PARC_PUBL_FR` | Parcelles forestières | `RDF_Parc.qml` (contour orange, étiquette `CCOD_PRF` en deçà du 1:50 000) |
  | `PRS_FR` | Points de Rencontre des Secours | `Point_de_rencontre_des_secours_en_frt.qml` (carré rouge et flèches SVG `arrows/Arrow_01.svg`) |

- **Inconnues** : champs réels des couches (aucun DescribeFeatureType lu : les styles supposent
  `CCOD_FRT`, `CCOD_PRF`, `desc_prsf`…) ; nombre d'objets et poids d'une copie de toute la métropole ;
  identifiant d'objet absent (avertissement MapServer « fid not specified » sur les six couches) ;
  licence exacte (fiches de métadonnées `metadata.carmencarto.fr`, http) ; présence de
  `arrows/Arrow_01.svg` dans QField Android.
- **Moyens** : la session cloud ne joint pas un hôte en http (proxy en https seulement). Les mesures
  passent donc par **GitHub Actions** (réseau ouvert) ou par Pascal.

## Arbitrages de Pascal (25 novembre 2026)

1. **Copie locale et WFS** : une copie embarquée sert sans réseau, le WFS avec réseau.
2. **Affichage** : groupe « ONF » sous la couche « Saisie terrain », au-dessus des fonds ; requêtes WFS
   limitées à l'emprise visible ; Forêts cochée ; Parcelles et Points de secours cochés mais visibles
   seulement en deçà du 1:50 000.

## Mission

**En une phrase :** Ajouter à `vision.qgz` un groupe « ONF » donnant les forêts publiques, les parcelles
forestières et les points de rencontre des secours du service WFS de l'ONF, aux styles fournis par Pascal,
lisibles **sans réseau** par une copie locale et à jour **avec réseau** par le WFS.

### Étape 1 — `dev` : mesure avant code (workflow de mesure, aucun changement de `vision.qgz`)

Un workflow `workflow_dispatch` (`.github/workflows/mesure-wfs-onf.yml`) et un outil testé
(`outils/mesure-wfs-onf.*`) qui, pour `FOR_PUBL_FR`, `PARC_PUBL_FR` et `PRS_FR` :

- enregistre le GetCapabilities, le DescribeFeatureType de chaque couche et les trois fiches de
  métadonnées (MetadataURL) ;
- télécharge toute la couche avec GDAL (`ogr2ogr`, pilote WFS, pagination si le serveur limite), en
  GeoPackage, et note : nombre d'objets, poids du `.gpkg`, durée, emprise, système, champs ;
- vérifie que les champs lus par les trois styles existent (`CCOD_FRT`, `CCOD_PRF`, champs du `.qml`
  des points de secours) ;
- publie le tout en artefact ; les pièces utiles sont versées dans `docs/referentiels/brut/` (datées) et
  résumées dans `docs/referentiels/onf-wfs.md`.

**Ne doit pas :** toucher à `vision.qgz`, au plugin ou aux zips publiés ; trancher quoi que ce soit.

### Arbitrage de Pascal attendu après l'étape 1

Selon les poids mesurés : copie de toute la métropole dans `projet-vision.zip`, ou copie séparée
(fichier à part, par direction territoriale ou agence), rythme de mise à jour, nom du fichier
(proposition : `onf.gpkg`, trois tables), et sort des étiquettes si un champ manque.

### Étape 2 — `dev` : projet modèle (après l'arbitrage)

- `outils/projet-modele.mjs` : groupe « ONF » entre « Saisie terrain » et « Fonds de carte » ; pour
  chaque couche, la copie locale (cochée selon l'arbitrage n° 2) et la couche WFS (`provider="WFS"`,
  `version='1.0.0'`, `typename=…`, `srsname='EPSG:2154'`, `restrictToRequestBBOX='1'`,
  lecture seule), rangée dans un sous-groupe « ONF en ligne (à jour) » **décoché** : les deux ne
  s'affichent pas l'une sur l'autre par défaut (proposition à confirmer à l'arbitrage).
- Styles : les trois `.qml` de Pascal (`docs/referentiels/brut/onf/`, intacts) recopiés dans `vision.qgz` par l'outil ; seuils d'échelle de l'arbitrage n° 2.
- Copie locale fabriquée par l'outil de l'étape 1 et jointe aux zips par
  `outils/zips-projet-modele.mjs` (ou à part, selon l'arbitrage) ; `projet-vision-mise-a-jour.zip`
  ne doit jamais contenir `saisie.gpkg` (garde existante).
- Tests (`tests/projet-modele.test.mjs`, `tests/outil-projet-modele.test.mjs`,
  `tests/zips-projet-modele.test.mjs`) : groupe et ordre, sources WFS exactes, lecture seule,
  seuils, styles identiques aux `.qml` fournis, copie locale présente et en Lambert 93 ; aucun
  affaiblissement.
- Spec § 3.4 (ou nouveau § 3.6) et README à jour ; ADR **0010** « Couches ONF : copie locale et
  WFS » proposée par l'orchestrateur, **tranchée par Pascal**.
- **Ne doit pas :** toucher au plugin ni à la bibliothèque de styles (`plugin/styles/`) ; mettre une
  clé ; ajouter `DT_FR`, `ATE_FR` ou `RB_FR` (hors demande).

## Terrain

Sur le Samsung : avec réseau, les trois couches s'affichent aux styles fournis, Parcelles et Points
de secours en deçà du 1:50 000 ; hors réseau (mode avion), la copie locale s'affiche seule ; flèches
du point de secours visibles (sinon, signaler).

## Qui veille, qui tranche

- **Relecteur :** `relecteur` après chaque étape, puis Pascal (PR vers `main`).
- **Tranche :** Pascal (arbitrage après l'étape 1, ADR 0010, PR).
