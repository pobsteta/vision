# Référentiel du service WFS de l'ONF (forêts, parcelles, points de rencontre des secours)

- **Propriétaire :** Pascal Obstétar. Mission 053, étape 1 (mesure avant code).
- **Décision éclairée :** quelles couches ONF mettre dans `vision.qgz`, sous quelle forme (copie locale, WFS, ou les deux) et avec quel poids (fiche 053, arbitrage attendu après l'étape 1 ; ADR 0010 à venir).
- **Sources :** `brut/onf/onf-forets-getcapabilities-2026-11-25.xml` (GetCapabilities enregistré par Pascal le 25 novembre 2026) et les trois styles de Pascal (`brut/onf/*.qml`). Rien d'autre n'est encore mesuré.
- **Limites :** le service ne répond qu'en http et n'est pas joignable depuis la session cloud de l'équipe ; la mesure se fait dans GitHub Actions. **Tout ce qui suit la section 1 est vide tant que la mesure n'a pas tourné.**

## 1. Ce qui est su (GetCapabilities du 25 novembre 2026)

- Service : `http://ws.carmencarto.fr/WFS/105/ONF_Forets?`, MapServer 7.0.0, **WFS 1.0.0 seulement** ; formats de sortie GetFeature annoncés : GML2, SHAPE, MIDMIF, KML (ni GeoJSON, ni GeoPackage).
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
3. Le rapport s'affiche dans le résumé du lancement ; l'artefact `mesure-wfs-onf` (conservé 7 jours) contient `rapport.md`, `rapport.json`, `getcapabilities.xml`, un `describefeaturetype-<couche>.xml`, un `hits-<couche>.xml`, un `metadonnees-<couche>.html`, des journaux `ogr2ogr-<couche>.log` et `ogrinfo-<couche>.json`, et les trois `.gpkg`.
4. Ce que l'outil fait par couche : DescribeFeatureType ; nombre annoncé (`RESULTTYPE=hits`) ; téléchargement complet par `ogr2ogr` (pilote WFS, version 1.0.0) en GeoPackage ; nombre d'objets reçus, poids, durée, emprise, système, champs ; comparaison aux champs lus par le style. Un nombre reçu différent du nombre annoncé est écrit « TRONCATURE » ; si `hits` est indisponible, le rapport dit que le risque de troncature n'est pas écarté (limite de MapServer, `maxfeatures`).
5. Hors GitHub (poste de Pascal avec GDAL) : `node outils/mesure-wfs-onf.mjs <dossier>` donne la même chose. Le code de sortie est non nul si un champ obligatoire manque ou si une étape a échoué.
6. Les pièces utiles (rapport, GetCapabilities, DescribeFeatureType, fiches) sont ensuite versées dans `brut/onf/` avec la date ; les `.gpkg` ne sont pas versés au dépôt.

## 3. Résultats de la mesure (à remplir : lancement du … novembre 2026)

Date et lancement (lien) : _à remplir_.

| Couche | Objets annoncés (hits) | Objets reçus | Poids .gpkg | Durée | Système lu | Emprise | Complet ? |
|---|---|---|---|---|---|---|---|
| `FOR_PUBL_FR` | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ |
| `PARC_PUBL_FR` | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ |
| `PRS_FR` | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ | _à remplir_ |

Champs et types par couche : _à remplir_.

Champs lus par les styles, présents dans la couche ? (`CCOD_FRT`, `CCOD_PRF`, 15 champs des points de secours) : _à remplir_.

## 4. Licence et métadonnées (à remplir)

Fiches (MetadataURL du GetCapabilities, en http, page JavaScript de GeoNetwork : le HTML enregistré peut ne pas contenir le texte de la fiche ; à lire dans un navigateur au besoin) :

- `FOR_PUBL_FR` : `http://metadata.carmencarto.fr/geonetwork/105/catalog.search#/metadata/fr-662043116-7D3DC709-E1EB-470B-9FD0-8ABF8AAFD8E4`
- `PARC_PUBL_FR` : `http://metadata.carmencarto.fr/geonetwork/105/catalog.search#/metadata/fr-662043116-82880F0D-E1C4-4EF3-80AF-416977F118F1`
- `PRS_FR` : `http://metadata.carmencarto.fr/geonetwork/105/catalog.search#/metadata/fr-662043116-F93F1825-68A2-4AE7-8C65-F789D26D9665`

Licence lue, droit de redistribuer une copie dans un zip, mentions à afficher : _à remplir_.

## 5. Ce qui reste inconnu après la mesure (à remplir)

Présence de `arrows/Arrow_01.svg` dans QField Android (essai sur le Samsung, étape 2) ; date de mise à jour des données et rythme de la copie : _à remplir_.
