# Cache de zone des couches ONF dans QField : preuve dans les sources (mission 053, étape 1 bis, temps 1)

- **Propriétaire :** Pascal Obstétar. Rédigé par le `dev` le 25 novembre 2026, avant toute ligne de plugin.
- **Décision éclairée :** par quelle voie le plugin Vision peut, avec réseau, enregistrer en GeoPackage dans
  `vision-imports/` les objets de `FOR_PUBL_FR`, `PARC_PUBL_FR` et `PRS_FR` sur l'emprise de la carte, puis les
  rendre sans réseau (fiche 053, arbitrage n° 1 du 25 novembre 2026). Sert le prototype (temps 2) et l'ADR 0010.
- **Sources lues** (clones en lecture, rien de recopié dans Vision) :
  - QField **v4.3.7**, commit `3fb12810b42654c6c45b39d669227d82a25f1fc8` (le même que `plugin/PLAN.md`) ;
  - QGIS embarqué : commit `3a92eb30c83d7d52751a330628d72b8eb9e64876` (`vcpkg/ports/qgis/portfile.cmake` l. 1 de QField) ;
  - GDAL : port vcpkg 3.12.4 du dépôt vcpkg au commit `99e82d9c9f0b281ec11fba48cc8434574a2b6e66`
    (`CMakeLists.txt` l. 5 de QField : `VCPKG_TAG`), fichiers `ports/gdal/vcpkg.json` et `portfile.cmake`.
- **Limite :** tout ce qui suit est **lu**, rien n'est **essayé**. Le service ONF (http seulement) est injoignable
  depuis la session cloud ; aucun appel n'a tourné sur le Samsung. « Prouvé » veut dire ici « écrit dans le code
  de la version embarquée », pas « vu marcher ».

Abréviations : `QF` = arbre QField v4.3.7, `QG` = arbre QGIS 3a92eb3. Lignes au format `fichier l. N`.

## 1. Obtenir les objets d'une couche WFS sur une emprise, depuis QML

### 1.1 Ce qui est exposé à un plugin

- Singletons QML `LayerUtils`, `FileUtils`, `GeometryUtils`, `ProjectUtils`, `CoordinateReferenceSystemUtils` :
  `QF src/core/qfcore.cpp` l. 326-334 (`REGISTER_SINGLETON( "org.qfield.core", QfLayerUtils, "LayerUtils" )`, etc.).
- Objets de contexte `iface`, `qgisProject`, `settings`, `platformUtilities` : `QF src/app/qgismobileapp.cpp` l. 416, 422-425.
- Le fournisseur **WFS de QGIS est lié dans l'application Android** (QGIS statique) :
  `QF cmake/qgis-cmake-wrapper.cmake` l. 68-73 (archives `provider_*_a` des builds statiques Android/iOS) et l. 91
  (`_find_and_link_library(provider_wfs_a QGIS::Core)`). QField traite d'ailleurs les couches WFS à part :
  `QF src/core/qflayertreemodel.cpp` l. 1006-1007.

### 1.2 Voie A — couche WFS créée par le plugin, puis `saveVectorLayerAs` avec filtre d'emprise

**Créer la couche** : `LayerUtils.loadVectorLayer(uri, nom, fournisseur)` accepte le nom du fournisseur
(`QF src/core/utils/qflayerutils.h` l. 200, défaut `"ogr"` ; `.cpp` l. 615-620 : `new QgsVectorLayer( uri, name, provider )`,
`CppOwnership`). Donc `LayerUtils.loadVectorLayer("url='http://ws.carmencarto.fr/WFS/105/ONF_Forets' typename='FOR_PUBL_FR' version='1.0.0' …", "FOR_PUBL_FR", "WFS")`
crée une couche WFS. Paramètres d'URI connus du fournisseur : `QG src/providers/wfs/qgswfsconstants.cpp` l. 28-53,
dont `version`, `typename`, `srsname`, `filter`, `restrictToRequestBBOX`, **`maxNumFeatures`** (l. 40), `pagingEnabled`,
`pageSize`, `sql`. Il **n'y a pas d'emprise fixe** dans l'URI : `bbox` n'est lu que dans l'ancienne forme d'URI et
devient seulement `restrictToRequestBBOX=1` (`QG …/qgswfsdatasourceuri.cpp` l. 62 et l. 104-105).

**Filtrer sur l'emprise, côté serveur** : deux portes lues.

1. Le 4ᵉ argument de `saveVectorLayerAs(couche, chemin, pilote, expressionFiltre)` (`QF qflayerutils.h` l. 254) devient
   `request.setFilterExpression(...)` (`qflayerutils.cpp` l. 719-724). L'itérateur WFS traduit cette expression en
   filtre OGC (`QG …/qgsbackgroundcachedfeatureiterator.cpp` l. 58-61 → `QgsWFSSharedData::computedExpression`,
   `qgswfsshareddata.cpp` l. 117-148), l'enregistre (`qgsbackgroundcachedfeatureiterator.cpp` l. 147-148 →
   `qgsbackgroundcachedshareddata.cpp` l. 488-495) et le téléchargeur l'envoie en `FILTER=`
   (`qgswfsfeaturedownloaderimpl.cpp` l. 276-279). L'expression `intersects_bbox($geometry, geom_from_wkt('POLYGON((…))'))`
   donne un `<ogc:BBOX>` avec une `gml:Box` en GML 2 (`QG src/core/qgsogcutils.cpp` l. 2531-2563).
2. Ou bien `couche.subsetString = "intersects_bbox(...)"` : `subsetString` est une `Q_PROPERTY` en écriture
   (`QG src/core/vector/qgsvectorlayer.h` l. 417) ; le fournisseur WFS en fait un filtre OGC
   (`qgswfsprovider.cpp` l. 933-987 → `qgswfsshareddata.cpp` l. 213-266).

**Plafond d'objets natif** : `maxNumFeatures` dans l'URI devient `MAXFEATURES=` en 1.0.0/1.1.0
(`qgswfsfeaturedownloaderimpl.cpp` l. 153-168, `run` l. 599-606). Demander plafond + 1 permet de **savoir** que le
plafond est dépassé (nombre écrit = plafond + 1).

**Écriture** : `saveVectorLayerAs` crée les dossiers (`qflayerutils.cpp` l. 688-692), écrase (`CreateOrOverwriteFile`,
l. 710), n'écrit aucun style (`NoSymbology`, l. 709), prend le système de la couche (l. 712) et rend le chemin écrit
ou `""` (l. 675-733). C'est la fonction des imports (ADR 0008, prouvée sur le Samsung par le prototype n° 3).

**Ce qui coûte, lu dans le code :**

- L'itération se fait **dans le fil principal** : le téléchargement tourne dans un autre fil, le fil principal attend
  par tranches de 50 ms avec `processEvents` (`qgsbackgroundcachedfeatureiterator.cpp` l. 491, l. 600-635), sans
  délai maximal par défaut. **L'écran de QField reste figé pendant tout le téléchargement**, sans bouton
  d'annulation possible depuis QML.
- Une coupure réseau en cours de route **termine l'itération sans erreur visible depuis QML** : `saveVectorLayerAs`
  rend quand même le chemin (l. 726-733 : aucun contrôle après la boucle). Un cache **incomplet** ne se distingue pas
  d'une zone pauvre en forêts.
- La création de la couche fait GetCapabilities et DescribeFeatureType de façon bloquante ; sans réseau la couche
  est invalide (`isValid`, `QG src/core/qgsmaplayer.h` l. 94), ce qui se teste.
- Type de géométrie : la mesure n° 1 a lu `Geometry` (type quelconque) pour les trois couches
  (`docs/referentiels/brut/onf/mesure-2026-11-25.md`). Le GeoPackage écrit prendrait ce type (`layer->wkbType()`,
  l. 712) : le rendu du style de Pascal sur une couche de type quelconque **n'est pas prouvé**.

### 1.3 Voie B — requête `GetFeature&BBOX=…` par le plugin, réponse GML 2 écrite puis réécrite en GeoPackage

**Requête http depuis QML** : `iface.createHttpRequest()` rend un `QfXmlHttpRequest` (`QF src/core/qfappinterface.h`
l. 229-230, `.cpp` l. 84-95), qui imite `XMLHttpRequest` : `open`, `send`, `abort`, `timeout`, `onload`, `onerror`,
`ontimeout`, `status`, `responseText`, `getResponseHeader` (`QF src/core/qfxmlhttprequest.h` l. 62-146, 168-212).

- `http` est **accepté** (seuls les schémas autres que http et https sont refusés : `qfxmlhttprequest.cpp` l. 279-286).
- La requête passe par `QgsNetworkAccessManager::instance()` (l. 320), donc par les réglages réseau de QField.
- Délai réglable (`timeout`, `.h` l. 95-99 ; `.cpp` l. 527-540) et annulation (`abort`, `.h` l. 202) : l'écran
  **ne se fige pas** pendant le téléchargement, l'agent peut annuler.
- La réponse n'existe qu'**en texte** : `mResponseText = QString::fromUtf8( responseBytes )` (`.cpp` l. 585),
  `response` = ce texte hors JSON (l. 604-614). Conséquences : SHAPE (zip binaire) est **exclu** ; le GML 2 passe
  **à condition d'être en UTF-8** (un GML en ISO-8859-1 aurait ses accents détruits, sans retour possible).
  L'encodage du GetFeature de l'ONF **n'est pas mesuré** (le GetCapabilities déclare `UTF-8`, l. 1 du fichier versé).
- On sait si la réponse est **complète** : code http (`status`), erreur réseau (`onerror`), et contenu (fin
  `</wfs:FeatureCollection>`, absence de `ServiceExceptionReport`, que MapServer renvoie en HTTP 200 : journal du
  25 novembre, aller-retour 1/3).

**Écrire la réponse dans le projet** : `FileUtils.writeFileContent(chemin, octets)` (`QF src/core/utils/qffileutils.h`
l. 97 ; `.cpp` l. 652-690) n'écrit que **dans le dossier du projet** (`isWithinProjectDirectory`, l. 654-658 ;
`.h` l. 76), crée le dossier (l. 664-671) et vérifie le nombre d'octets écrits (l. 675-681). C'est l'appel qui écrit
déjà les `.qml` des imports (`plugin/Vision.qml`, `ecrireFichier`, octets UTF-8 en `ArrayBuffer`), prouvé sur le
Samsung (prototype n° 3). `vision-imports/` est sous le dossier du projet (spec § 3.3).

**Lire le GML puis le réécrire** : `LayerUtils.loadVectorLayer("<…>/vision-imports/…/FOR_PUBL_FR.gml", nom)` (pilote
OGR GML de GDAL), contrôles existants (système, vraisemblance de l'emprise, comptage par
`LayerUtils.createFeatureIterator`, `qflayerutils.h` l. 234), puis `saveVectorLayerAs(couche, cible, "GPKG")`, puis
effacement du `.gml` (et du `.gfs` que GDAL écrit à côté) par `platformUtilities.rmFile` (prouvé, ADR 0007).
Le pilote GML de GDAL a besoin d'Expat ou de Xerces : le port GDAL de QGIS est demandé **avec ses options par
défaut** (`QF vcpkg/ports/qgis/vcpkg.json`, entrée `gdal` sans `default-features: false`), qui comprennent
`recommended-features` → `expat` et `curl` (`ports/gdal/vcpkg.json` l. 41-69 et l. 296-313 ; `portfile.cmake` l. 34 :
`expat → GDAL_USE_EXPAT`). **Déduit des manifestes de construction, non vérifié dans le paquet Android.**

**Requête proposée** (WFS 1.0.0, servie : mesure n° 1 ; coordonnées Lambert 93 dans l'ordre x, y, sans
inversion d'axes en 1.0.0) :
`http://ws.carmencarto.fr/WFS/105/ONF_Forets?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&TYPENAME=FOR_PUBL_FR&BBOX=<xmin>,<ymin>,<xmax>,<ymax>&MAXFEATURES=<plafond+1>`
(sortie GML 2 par défaut ; formats annoncés GML2, SHAPE, MIDMIF, KML : `docs/referentiels/onf-wfs.md` § 1).

**Ce qui coûte, ou reste inconnu :**

- Toute la réponse tient en mémoire (texte QString, puis octets en JS) : à l'échelle d'une zone, quelques Mo
  (estimation d'après la mesure n° 1 : ≈ 10 Ko par forêt, ≈ 1,2 Ko par parcelle, ≈ 0,2 Ko par point en GeoPackage ;
  le GML est plus lourd). Une forêt qui touche la zone vient **entière** (BBOX ne découpe pas).
- Le GML de MapServer porte un `schemaLocation` vers DescribeFeatureType : GDAL peut aller le chercher (réseau
  présent à ce moment) et en tirer un type de géométrie quelconque, comme la mesure. **Non prouvé** ; parade possible
  à essayer au temps 2 : écrire avant l'ouverture un `.gfs` qui fixe le type (`MultiPolygon`, `Point`).
- Conversion des octets en JS (`Logique.octetsUtf8`, boucle par caractère) : durée sur quelques Mo à mesurer.

### 1.4 Autres voies, non retenues

- **C1. Itérer la couche WFS dans QML** (`LayerUtils.createFeatureIteratorFromRectangle`, `qflayerutils.h` l. 244 ;
  `.cpp` l. 669-673, avec `restrictToRequestBBOX='1'`), recopier dans une couche mémoire (`createMemoryLayer`, l. 226 ;
  `addFeature`, l. 170) puis `saveVectorLayerAs`. Mêmes défauts que A (fil principal), plus de code.
- **C2. Pilote WFS de GDAL** (`loadVectorLayer("WFS:http://…", nom)` en `ogr`, `curl` présent d'après les manifestes) :
  aucun moyen lu de lui donner une emprise fixe depuis QML. Non étudié plus loin.
- **C3. GeoJSON par `memoryLayerFromJsonString`** (`qflayerutils.h` l. 217) : MapServer 7 n'annonce pas de sortie
  GeoJSON pour ce service. Écarté.
- **C4. Couches GeoPackage déclarées dans `vision.qgz`** à un chemin fixe sous `vision-imports/`, que le plugin
  remplirait : rangement dans le groupe « ONF » réglé par le projet modèle, mais écraser un GeoPackage ouvert par
  la carte (verrou, `-wal`) et la couche absente au premier lancement ne sont **pas prouvés**. Relève de l'étape 2
  (touche `vision.qgz`) ; à garder en tête pour la question du groupe (§ 4).

## 2. Trafic http non chiffré sous Android

**Prouvé dans le paquet de QField 4.3.7** :

- `QF platform/android/AndroidManifest.xml.in` l. 52 : `android:usesCleartextTraffic="true"` ; l. 53 :
  `android:networkSecurityConfig="@xml/network_security_config"` ; l. 10 : permission `INTERNET`.
- `QF platform/android/res/xml/network_security_config.xml` l. 2 : `<base-config cleartextTrafficPermitted="true">`.
- Côté requête, `QfXmlHttpRequest` laisse passer `http` (`qfxmlhttprequest.cpp` l. 279-286).

Le trafic http vers `ws.carmencarto.fr` n'est donc pas bloqué par QField. **Non prouvé** : que le réseau de
l'appareil (opérateur, wifi de l'ONF, proxy) laisse passer ce port 80.

## 3. Emprise visible de la carte, en Lambert 93

- `iface.mapCanvas()` rend l'objet nommé `mapCanvas` (`QF src/core/qfappinterface.h` l. 214 ; `.cpp` l. 171-180),
  qui est le `QfMapCanvas` de l'écran principal (`QF src/app/qml/QgisMobileapp.qml` l. 838-840).
- Il porte `mapSettings` (`QF src/core/qml/QfMapCanvas.qml` l. 32 ; `src/core/qgsquick/qgsquickmapcanvasmap.h` l. 61).
- `mapSettings.visibleExtent` : `Q_PROPERTY` de type `QgsRectangle` (`QF src/core/qgsquick/qgsquickmapsettings.h`
  l. 72 ; `.cpp` l. 316-318), lisible en QML par `xMinimum`, `yMinimum`, `xMaximum`, `yMaximum`
  (`QG src/core/geometry/qgsrectangle.h` l. 48-53, `Q_GADGET`). C'est la lecture que fait déjà `Logique.lireEmprise`.
- Système de cette emprise : `mapSettings.destinationCrs` (`qgsquickmapsettings.h` l. 109), lisible par `authid`
  (déjà utilisé par `Logique.decrireSysteme`). Le projet modèle est en EPSG:2154 (`outils/projet-modele.mjs` l. 142) ;
  si ce n'est pas le cas, `GeometryUtils.reprojectRectangle(rect, source, but)` (`QF src/core/utils/qfgeometryutils.h`
  l. 119) avec `CoordinateReferenceSystemUtils.fromDescription("EPSG:2154")` (`qfcoordinatereferencesystemutils.h`
  l. 36, déjà employé par le plugin).
- **Carte tournée** : `visibleExtent` est l'emprise de `QgsMapSettings` ; avec une rotation, elle ne couvre pas
  forcément tout l'écran (comportement de QGIS, non relu ici). Parade lue : `mapSettings.screenToCoordinate(point)`
  (`qgsquickmapsettings.h` l. 236, `Q_INVOKABLE`) sur les quatre coins de l'écran, puis la boîte qui les contient.
  La rotation de la carte est un réglage de QField (`QgisMobileapp.qml` l. 845, `enableMapRotation`).

**Prouvé dans le code** ; **non essayé** depuis un plugin.

## 4. Inscription au registre du plugin

Ce qui existe (`plugin/vision-logique.mjs`, `plugin/Vision.qml`) :

- Registre : une liste JSON dans les réglages de QField, clé par `vision_id` (`cleRegistre`, `inscrire` l. 640-650,
  remplacement d'une entrée de même `(zip, couche)` à sa place). Entrée d'une copie vecteur :
  `{ zip, couche, chemin: "<dossier du zip>/<couche>.gpkg" }` (`entreeSaine`, l. 680-693 : le zip doit finir par `.zip`).
- À l'ouverture du projet (`demarrerProjet`, l. 1316-1390) : une entrée à `chemin` est rechargée **depuis le disque,
  sans relire le zip** (`dossier + '/' + chemin + '|layername=' + couche`), marquée `vision/zip` et `vision/couche`
  (`Vision.qml`, `chargeur`), mise en lecture seule ; son `.qml` voisin est appliqué par QGIS au chargement (ADR 0008).
  Une entrée qui ne passe pas `entreeSaine` est **retirée du registre** (décision n° 5).
- Ajout à la carte : `ProjectUtils.addMapLayer` → `project->addMapLayer(layer)` (`QF src/core/utils/qfprojectutils.cpp`
  l. 54-60), donc **en tête de l'arbre des couches, hors de tout groupe**. `QgsProject::layerTreeRoot()` n'est ni
  `Q_INVOKABLE` ni propriété (`QG src/core/project/qgsproject.h` l. 1041) et `flatLayerTree` n'offre aucun
  déplacement (`QF src/core/qflayertreemodel.h` l. 197-229) : **un plugin ne peut pas ranger une couche dans le
  groupe « ONF »** (lu, non essayé). L'arbitrage n° 2 (groupe sous « Saisie terrain ») ne tient donc que pour des
  couches déclarées dans `vision.qgz` (étape 2, ou voie C4).

Trois façons de l'inscrire, à trancher (le `dev` ne tranche pas) :

| | Inscription | Ce que ça demande | Prix |
|---|---|---|---|
| **R1** | Pseudo-zip `ONF.zip`, entrées `{ zip: "ONF.zip", couche: "FOR_PUBL_FR", chemin: "ONF/FOR_PUBL_FR.gpkg" }` | **Aucune** ligne de rechargement nouvelle : `demarrerProjet` le recharge tel quel | Collision avec un vrai zip nommé `ONF.zip` ; messages « zip absent » / « réimporter le zip » faux pour un cache ; le retrait parle de zip |
| **R2** (proposée) | Entrée de nouvelle sorte dans le même registre : `{ cache: "onf", couche, chemin: "onf-cache/<couche>-<horodatage>.gpkg", emprise, date, objets }`, marques `vision/cache=onf` et `vision/couche` | `entreeSaine`, `demarrerProjet`, `retirerCouche` et le panneau étendus ; messages propres au cache | Une version **plus ancienne** du plugin retirerait ces entrées du registre (« douteuses ») sans effacer les fichiers : un retour arrière perd le cache à l'affichage |
| **R3** | Registre à part (clé `vision/<vision_id>/cache`) | Code à part, aucun risque pour le registre des zips | Deux registres à tenir ; aucun gain de rechargement |

**Remplacement au cache suivant (proposé pour R2)** : écrire le nouveau GeoPackage sous un **nouveau nom**
(horodaté), le charger, le contrôler ; seulement alors retirer de la carte l'ancienne couche marquée
(`ProjectUtils.removeMapLayer`), effacer ses fichiers (`rmFile`, garde `peutEffacer`), et remplacer l'entrée.
En cas d'échec (réseau coupé, réponse incomplète, plafond dépassé), l'ancien cache **reste** affiché et inscrit.
Raison : ne pas écraser un GeoPackage encore ouvert par QGIS (risque n° 4 de `plugin/PLAN.md` § 8, de même nature).

## 5. Bilan : voies classées

| Rang | Voie | Prouvé dans les sources | Pas prouvé | Pour l'agent |
|---|---|---|---|---|
| **1 (recommandée)** | **B** : `iface.createHttpRequest()` → GML 2 → `writeFileContent` dans `vision-imports/` → `loadVectorLayer` (OGR) → contrôles existants → `saveVectorLayerAs` GPKG → `rmFile` du GML | http permis (§ 2) ; requête asynchrone, délai, annulation, code http ; écriture dans le projet ; réécriture GPKG ; emprise lisible (§ 3) | pilote GML dans le paquet Android (déduit) ; GML de l'ONF en UTF-8 ; type de géométrie ; durée de conversion | écran vivant, bouton « annuler » possible ; un cache incomplet est **détecté et refusé**, l'ancien reste |
| 2 | **A** : couche WFS (`loadVectorLayer(…, "WFS")`) + `saveVectorLayerAs(…, "GPKG", "intersects_bbox(…)")` | fournisseur WFS lié ; filtre traduit en `FILTER` OGC ; `maxNumFeatures` | traduction réelle du filtre par MapServer 7 ; type de géométrie ; rendu | écran **figé** pendant le téléchargement, sans annulation ; coupure réseau = cache **incomplet sans le savoir** |
| 3 | C1, C2 | — | — | plus de code, mêmes défauts que A (C1) ou emprise impossible (C2) |

La voie B demande un peu plus de code que A, mais c'est la seule où le plugin **sait** qu'il a tout reçu. Test du
roseau et du chêne : si l'on plie vers A (moins de code), c'est l'agent qui paie sur le terrain (un cache partiel,
une parcelle manquante en mode avion, sans message). Je ne plie pas en silence : B est proposée, A reste en repli si
le pilote GML manque dans le paquet Android.

## 6. Ce que le temps 2 devra mesurer sur le Samsung (si l'orchestrateur le lance)

1. Une requête `GetFeature&BBOX` en http sur une forêt connue : code 200, encodage déclaré du GML, taille, durée.
2. Ouverture du GML par `loadVectorLayer` (pilote GML présent ?), système lu (`EPSG:2154`), type de géométrie,
   nombre d'objets = nombre de `<gml:featureMember>`.
3. GeoPackage écrit, rechargé à la réouverture, styles de Pascal (copies adaptées) appliqués, en mode avion.
4. Plafond dépassé (`MAXFEATURES` = plafond + 1) : refus clair, ancien cache gardé.
5. Coupure réseau en cours (mode avion pendant la requête) : refus clair, ancien cache gardé.
6. Un point du terrain : le contour d'une forêt connue tombe sur le fond IGN à moins de 5 m (règle du projet).

## 7. Questions à Pascal

1. **Plafond** (à trancher) : proposition d'un côté maximal de zone (par exemple 10 km × 10 km, ou 20 km × 20 km)
   **et** d'un nombre maximal d'objets par couche (par exemple 5 000), au-delà desquels le plugin refuse et demande
   de zoomer. Repères de la mesure n° 1 : 17 190 forêts, 408 400 parcelles, 24 343 points sur la métropole ; débit
   observé du serveur ≈ 26 forêts/s et ≈ 190 parcelles/s (GitHub Actions, à revoir sur mobile).
2. **Textes affichés** (à valider avant le prototype) : libellé du bouton, message de réussite (nombre d'objets
   par couche, date), de refus (plafond, réseau absent, réponse incomplète), de rechargement hors réseau, et
   l'affichage de la date du cache.
3. **Rangement** : un plugin ne peut pas mettre le cache dans le groupe « ONF » (§ 4). Acceptez-vous, pour le
   prototype, des couches de cache **en tête de la liste** ? Pour l'étape 2 : cache rangé par le projet modèle
   (voie C4, à prouver) ou en tête.
4. **Inscription** : R2 (nouvelle sorte d'entrée, proposée), R1 ou R3 (§ 4).
5. **Une seule zone** à la fois (le cache suivant remplace le précédent, comme dit la fiche) : confirmé ?
