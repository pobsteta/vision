# Référentiel du service WFS de l'ONF (forêts, parcelles, points de rencontre des secours)

- **Propriétaire :** Pascal Obstétar. Mission 053, étape 1 (mesure avant code).
- **Décision éclairée :** quelles couches ONF mettre dans `vision.qgz`, sous quelle forme (copie locale, WFS, ou les deux) et avec quel poids. **Tranchée le 25 novembre 2026 par Pascal : ADR [0010](../adr/0010-couches-onf-wfs-et-cache-de-zone.md)** (WFS en ligne et cache de zone sur le mobile ; copie nationale écartée). Spec : § 3.6.
- **Sources :** `brut/onf/onf-forets-getcapabilities-2026-11-25.xml` (GetCapabilities enregistré par Pascal le 25 novembre 2026) et les trois styles de Pascal (`brut/onf/*.qml`). Mesure n° 1 : `brut/onf/mesure-2026-11-25.md` (section 3). Essais de la sonde sur le Samsung : `brut/onf/sonde-*.jpg` et `cache-zone-qfield.md` §§ 8-9.
- **Limites :** le service ne répond qu'en http et n'est pas joignable depuis la session cloud de l'équipe ; la mesure se fait dans GitHub Actions. *Mise à jour du 25 novembre 2026 (archiviste) : la mesure n° 1 a tourné ; les sections 3 à 5 sont remplies. Le texte de la section 1 est conservé tel qu'écrit avant la mesure ; ses doutes sont levés dans la section 3.*

## 1. Ce qui est su (GetCapabilities du 25 novembre 2026)

- Service : `http://ws.carmencarto.fr/WFS/105/ONF_Forets?`, MapServer 7.0.0, **WFS 1.0.0 annoncé par le GetCapabilities** (lecture du fichier, sans preuve que 1.1.0 et 2.0.0 soient refusées : la mesure le dira) ; formats de sortie GetFeature annoncés : GML2, SHAPE, MIDMIF, KML (ni GeoJSON, ni GeoPackage).
- Titre : « Données publiques de l'ONF en Métropole » ; `Fees` : « Aucune condition ne s'applique » ; `AccessConstraints` : « Aucun obstacle technique ». La licence exacte est dans les fiches de métadonnées (section 4).
- Six couches, toutes en `EPSG:2154`, même emprise annoncée (`LatLongBoundingBox` : minx -247479, miny 6039530, maxx 1543750, maxy 7118590 ; malgré le nom, ce sont des coordonnées Lambert 93, à vérifier à la mesure) :

| Couche | Titre | Retenue | Style de Pascal |
|---|---|---|---|
| `FOR_PUBL_FR` | Forêts publiques | oui | `RDF_FRT.qml` (étiquette `CCOD_FRT`) |
| `PARC_PUBL_FR` | Parcelles forestières | oui | `RDF_Parc.qml` (étiquette `CCOD_PRF`) |
| `PRS_FR` | Points de Rencontre des Secours | oui | `Point_de_rencontre_des_secours_en_frt.qml` (15 champs listés : `accessible`, `code_dep`, `code_prsf`, `coord_dfci`, `desc_prsf`, `gestionnaire`, `gid`, `insee_com`, `lat`, `lon`, `nom_com`, `panneau`, `reseau_tel`, `risque_tel`, `stationnement`) |
| `DT_FR`, `ATE_FR`, `RB_FR` | (autres couches du service) | non, hors demande | |

- MapServer avertit, pour chaque couche, qu'aucun identifiant d'objet (`fid`) n'est déclaré.
- Remarque sur `RDF_FRT.qml` : sa configuration de champs liste des champs de type BD TOPO (`cleabs`, `toponyme`, `nature`…), pas `CCOD_FRT` seul ; l'outil ne les exige donc pas (il les signale à titre d'information). Seule l'étiquette `CCOD_FRT` est exigée.

## 2. Comment lancer la mesure

1. Sur GitHub : onglet **Actions**, workflow « Mesure du WFS de l'ONF », **Run workflow** (branche de la mission 053).
2. Le workflow installe GDAL (`gdal-bin`), rejoue les tests de l'outil, puis lance `node outils/mesure-wfs-onf.mjs mesure-onf`. Il ne publie rien : pas de release, pas de commit.
3. Le rapport s'affiche dans le résumé du lancement ; l'artefact `mesure-wfs-onf` (conservé 7 jours) contient `rapport.md`, `rapport.json`, `getcapabilities.xml`, un `describefeaturetype-<couche>.xml`, un `hits-<couche>.xml`, des `metadonnees-<couche>-<forme>.txt`, `getcapabilities-<version>.xml`, des journaux `ogr2ogr-<couche>.log` et `ogrinfo-<couche>.json`, et les trois `.gpkg`.
4. Ce que l'outil fait par couche : DescribeFeatureType ; nombre annoncé (`RESULTTYPE=hits` demandé en WFS **1.1.0**, car MapServer 7 n'écrit `numberOfFeatures` qu'en 1.1.0 et `numberMatched` qu'en 2.0.0, jamais en 1.0.0) ; téléchargement complet par `ogr2ogr` en GeoPackage, **version 1.0.0 donnée dans l'URL** (`WFS:<service>VERSION=1.0.0` ; le pilote WFS de GDAL 3.8 ignore l'option `-oo VERSION` et négocierait du 2.0.0), paginé par `STARTINDEX` et `MAXFEATURES` (pages de 5000, option GDAL `OGR_WFS_PAGING_ALLOWED`), avec `GML_EXPOSE_GML_ID=NO` ; nombre d'objets reçus, poids, durée, emprise, système, champs ; comparaison aux champs lus par le style. Un nombre reçu différent du nombre annoncé est écrit « TRONCATURE » ; si `hits` est indisponible, le rapport dit que le risque de troncature n'est pas écarté (limite de MapServer, `maxfeatures`).
   Le `GML_EXPOSE_GML_ID=NO` est nécessaire : MapServer n'écrit pas de `gml:id` (avertissement « fid not specified »), et le champ `gml_id` que GDAL ajoute sinon est `NOT NULL` dans le GeoPackage, ce qui fait échouer l'écriture de chaque objet (constaté contre un faux serveur de même forme). Les champs du rapport sont donc ceux du service seuls ; si une copie GeoPackage est un jour produite autrement, il faudra aussi décider de l'identifiant d'objet.
   Le rapport dit aussi quelles versions du protocole le serveur sert réellement (GetCapabilities sans version, 1.0.0, 1.1.0, 2.0.0, enregistrés tels quels). La version de téléchargement ne change pas en conséquence : à arbitrer après mesure.
   Les fiches de métadonnées : `fetch` coupe le fragment `#/metadata/<uuid>`, la page enregistrée sera vide ; l'outil essaie donc aussi quatre formes d'API GeoNetwork construites sur l'uuid (formes non vérifiées, réponses enregistrées telles quelles dans `metadonnees-<couche>-<forme>.txt`, le rapport donne HTTP et taille de chacune sans affirmer laquelle marche).
5. Hors GitHub (poste de Pascal avec GDAL) : `node outils/mesure-wfs-onf.mjs <dossier>` donne la même chose. Le code de sortie est non nul si un champ obligatoire manque ou si une étape a échoué.
6. Les pièces utiles (rapport, GetCapabilities, DescribeFeatureType, fiches) sont ensuite versées dans `brut/onf/` avec la date ; les `.gpkg` ne sont pas versés au dépôt.

## 3. Résultats de la mesure n° 1 (25 novembre 2026)

Date et lancement : 25 novembre 2026, workflow « Mesure du WFS de l'ONF », lancement n° 1, [run 45620739455](https://github.com/pobsteta/vision/actions/runs/45620739455) (commit 229c495, GDAL 3.12.2, ubuntu-latest, 48 min), lancé par Pascal. Artefact `mesure-wfs-onf` (217 Mo, expire le 2 décembre 2026 : **les `.gpkg` ne sont pas au dépôt**). Pièce versée, recopiée telle quelle : [`brut/onf/mesure-2026-11-25.md`](brut/onf/mesure-2026-11-25.md) (source des chiffres ci-dessous).

**Versions du protocole servies** (la section 1 le doutait) : GetCapabilities sans version, 1.0.0, 1.1.0 et 2.0.0 répondent toutes HTTP 200, sans exception, et annoncent la version demandée. « 1.0.0 seulement » est **faux** ; la version 1.0.0 est **fixée par choix** (prouvée sur le Samsung), pas par contrainte (ADR 0010).

| Couche | Objets annoncés (hits) | Objets reçus | Poids .gpkg | Durée | Système lu | Emprise (EPSG:2154, xmin ymin xmax ymax) | Complet ? |
|---|---|---|---|---|---|---|---|
| `FOR_PUBL_FR` | 17 190 | 17 190 | 177,0 Mo | 657,6 s (11 min) | EPSG:2154 | 126014,2 6061982,5 1239155,4 7085843,4 | oui |
| `PARC_PUBL_FR` | 408 400 | 408 400 | 505,2 Mo | 2 136,4 s (36 min) | EPSG:2154 | 126014,2 6137906,3 1206122,9 7085843,4 | oui |
| `PRS_FR` | 24 343 | 24 343 | 5,1 Mo | 51,0 s | EPSG:2154 | 140481,019 6092810,07075 1225571,643 7083465 | oui |

Toute la métropole : environ 687 Mo et 47 min (ADR 0010 : copie nationale non livrable). La géométrie lue en bloc est « Geometry » (types mêlés) ; la sonde sur le Samsung a vu des forêts en MultiPolygon, des parcelles tantôt Polygon tantôt MultiPolygon, des points en Point : le cache fixe le type (`cache-zone-qfield.md` § 11).

**Champs et types** (tous `String`) :

- `FOR_PUBL_FR` : `iidtn_frt`, `llib_frt`, `cdom_frt`, `cinse_dep`.
- `PARC_PUBL_FR` : `iidtn_frt`, `llib_frt`, `ccod_prf`.
- `PRS_FR` : `iidtn_prs`, `cinse_dep`, `loff_prs`, `cdfci_prs`, `ccod_cmat`, `ccod_ctps`, `llib_prs`, `lobs_prs`, `qlat_prs`, `qlon_prs`, `qdis_prs`, `llib_com`, `cinse_com`.

**Champs lus par les styles de Pascal, présents dans la couche ?** Non, pour les trois :

- `RDF_FRT.qml` lit `CCOD_FRT` : **absent** du service (champs : `iidtn_frt`, `llib_frt`, `cdom_frt`, `cinse_dep`). Étiquette reprise sur `iidtn_frt` (arbitrage n° 3 de Pascal, 25 novembre 2026).
- `RDF_Parc.qml` lit `CCOD_PRF`, `IIDTN_FRT`, `LLIB_FRT` : la couche a les mêmes en **minuscules**.
- `Point_de_rencontre_des_secours_en_frt.qml` : aucun des 15 champs listés (`gid`, `desc_prsf`, `code_prsf`, `panneau`, `nom_com`, `coord_dfci`, `insee_com`, `code_dep`, `lat`, `lon`, `reseau_tel`, `accessible`, `stationnement`, `risque_tel`, `gestionnaire`) n'existe ; le style n'a pas d'étiquette, seul son formulaire est touché.
- Conséquence (arbitrage n° 4 de Pascal) : **styles adaptés générés** aux champs réels (`plugin/vision-styles-onf.mjs`), `.qml` d'origine intacts dans `brut/onf/`.
- Aucun identifiant d'objet n'est déclaré par le service (« fid not specified ») : le cache écarte le champ parasite `gml_id`.

## 4. Licence et métadonnées

Fiches (MetadataURL du GetCapabilities, en http, page JavaScript de GeoNetwork) :

- `FOR_PUBL_FR` : `http://metadata.carmencarto.fr/geonetwork/105/catalog.search#/metadata/fr-662043116-7D3DC709-E1EB-470B-9FD0-8ABF8AAFD8E4`
- `PARC_PUBL_FR` : `http://metadata.carmencarto.fr/geonetwork/105/catalog.search#/metadata/fr-662043116-82880F0D-E1C4-4EF3-80AF-416977F118F1`
- `PRS_FR` : `http://metadata.carmencarto.fr/geonetwork/105/catalog.search#/metadata/fr-662043116-F93F1825-68A2-4AE7-8C65-F789D26D9665`

**Lecture des fiches : échec.** Les cinq essais de l'outil (page et quatre formes d'API GeoNetwork) ont échoué pour les trois couches (« HTTP échec, 0 octets », mesure n° 1) ; **le texte de licence des fiches n'a jamais été lu** (journal du 25 novembre 2026 : à lire par Pascal dans un navigateur ; non rapporté à ce jour).

**Ce qui tient lieu de licence (25 novembre 2026)** :

- Le GetCapabilities dit « Aucune condition ne s'applique » (`Fees`) et « Aucun obstacle technique » (`AccessConstraints`) ; titre « Données publiques de l'ONF en Métropole ». C'est une déclaration du service, pas une licence.
- **Accord de l'ONF pour cet usage** (les trois couches et leur cache sur le mobile) : **rapporté par Pascal le 25 novembre 2026** (« J'ai l'accord de l'ONF »), **sans pièce écrite** : « Laisse tomber la trace écrite onf pas besoin » (Pascal, même jour, décision consignée au journal). Rien n'est vérifiable dans le dépôt ; si l'accord est un jour contesté, la preuve manque.
- **Mention à afficher** : « © ONF », validée par Pascal le 25 novembre 2026. Posée dans le **nom** des trois couches du cache (le plugin ne peut pas écrire les droits d'une couche, `cache-zone-qfield.md` § 12) et dans l'attribution des couches WFS de `vision.qgz`.
- **Droit de redistribuer une copie dans un zip** : non lu, non demandé. Le cache est fait **sur l'appareil de l'agent** depuis le service, aucune donnée de l'ONF n'est dans le dépôt ni dans une release.

## 5. Ce qui reste inconnu après la mesure

- Texte exact de la licence des fiches de métadonnées (voir section 4).
- Affichage des trois couches WFS de `vision.qgz` (fournisseur WFS de QGIS) dans QField 4.3.8 sur Android, avec réseau : jamais essayé (`cache-zone-qfield.md` § 13.1).
- Présence et affichage de `arrows/Arrow_01.svg` dans QField Android.
- Tenue d'une zone proche des plafonds du cache (20 km de côté, 5 000 objets par couche) sur l'appareil.
- Date de mise à jour des données de l'ONF et rythme conseillé du cache : non connus ; le cache porte sa date (« zone du JJ/MM/AAAA »), c'est à l'agent de le refaire quand il le juge utile.
- Stabilité du service : en http seulement, sur le domaine `carmencarto.fr` (qui l'héberge : non vérifié) ; un changement de champs ou d'adresse casserait le cache (message « Réponse incomplète… » ou refus, ancien cache gardé).
