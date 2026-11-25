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
- **Révision :** aller-retour 1/3 après relecture de `0272d30` (pilote GML requalifié en inconnu, réponse tronquée,
  délai de 60 s, R2 corrigée, `gml_id`) ; § 8 : la sonde d'essai qui mesure sur le Samsung ce qui reste inconnu.
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
  délai propre à la requête d'objets (`mRequest.timeout()`, l. 603-604). Les requêtes passent par le gestionnaire
  réseau de QGIS, qui coupe une réponse **sans octet reçu pendant 60 s** (réglage `network-timeout`, défaut 60 000 ms :
  `QG src/core/network/qgsnetworkaccessmanager.cpp` l. 52 ; minuterie relancée à chaque octet reçu, l. 493-503).
  **L'écran de QField reste figé pendant tout le téléchargement**, sans bouton d'annulation possible depuis QML.
- Une coupure réseau en cours de route **termine l'itération sans erreur visible depuis QML** : `saveVectorLayerAs`
  rend quand même le chemin (l. 726-733 : aucun contrôle après la boucle). Un cache **incomplet** ne se distingue pas
  d'une zone pauvre en forêts.
- La création de la couche fait GetCapabilities et DescribeFeatureType de façon bloquante ; sans réseau la couche
  est invalide (`isValid`, `QG src/core/qgsmaplayer.h` l. 94), ce qui se teste.
- Type de géométrie : la mesure n° 1 a lu `Geometry` (type quelconque) pour les trois couches
  (`docs/referentiels/brut/onf/mesure-2026-11-25.md`). Le GeoPackage écrit prendrait ce type (`layer->wkbType()`,
  l. 712) : le rendu du style de Pascal sur une couche de type quelconque **n'est pas prouvé**.
- Cache du fournisseur : la voie A écrit le cache de téléchargement du fournisseur WFS **hors du dossier du projet**,
  dans `<dossier des réglages de QGIS>/cache/WFSprovider` (ou le réglage `cache/directory`) :
  `QG src/providers/wfs/qgscachedirectorymanager.cpp` l. 65-67. Fichiers temporaires que Vision ne gère pas (ni
  registre, ni effacement) ; la voie B n'en écrit pas.
- Lecture du GML : le fournisseur WFS de QGIS lit les réponses avec **son propre analyseur**
  (`QgsGmlStreamingParser`, `QG src/providers/wfs/qgswfsfeaturedownloaderimpl.cpp` l. 615), fondé sur Expat, dont le
  port qgis dépend directement (`QF vcpkg/ports/qgis/vcpkg.json` l. 14 : `"expat"`). La voie A ne dépend donc pas du
  pilote GML de GDAL : c'est son intérêt si ce pilote manque (§ 1.3).

### 1.3 Voie B — requête `GetFeature&BBOX=…` par le plugin, réponse GML 2 écrite puis réécrite en GeoPackage

**Requête http depuis QML** : `iface.createHttpRequest()` rend un `QfXmlHttpRequest` (`QF src/core/qfappinterface.h`
l. 229-230, `.cpp` l. 84-95), qui imite `XMLHttpRequest` : `open`, `send`, `abort`, `timeout`, `onload`, `onerror`,
`ontimeout`, `status`, `responseText`, `getResponseHeader` (`QF src/core/qfxmlhttprequest.h` l. 62-146, 168-212).

- `http` est **accepté** (seuls les schémas autres que http et https sont refusés : `qfxmlhttprequest.cpp` l. 279-286).
- La requête passe par `QgsNetworkAccessManager::instance()` (l. 320), donc par les réglages réseau de QField.
- Délai réglable (`timeout`, `.h` l. 95-99 ; `.cpp` l. 527-540) et annulation (`abort`, `.h` l. 202) : l'écran
  **ne se fige pas** pendant le téléchargement, l'agent peut annuler. Ce `timeout` ne prolonge pas le délai
  d'inactivité de 60 s du gestionnaire réseau de QGIS (`qgsnetworkaccessmanager.cpp` l. 52, l. 493-503) : un serveur
  muet 60 s coupe la réponse, quel que soit `timeout`. MapServer écrit le GML au fil de l'eau ; un long calcul avant le
  premier octet (grosse emprise) peut suffire à couper.
- La réponse n'existe qu'**en texte** : `mResponseText = QString::fromUtf8( responseBytes )` (`.cpp` l. 585),
  `response` = ce texte hors JSON (l. 604-614). Conséquences : SHAPE (zip binaire) est **exclu** ; le GML 2 passe
  **à condition d'être en UTF-8** (un GML en ISO-8859-1 aurait ses accents détruits, sans retour possible).
  L'encodage du GetFeature de l'ONF **n'est pas mesuré** (le GetCapabilities déclare `UTF-8`, l. 1 du fichier versé).
- **Le contrôle du contenu est obligatoire**, le code http ne suffit pas. Une réponse coupée **après** les en-têtes
  (coupure réseau, délai de 60 s) a déjà un `status` (200) : `finalizeReply` appelle alors **`onload`** avec le texte
  tronqué, pas `onerror` (`qfxmlhttprequest.cpp` l. 622-631 : `onerror` seulement si `status == 0`) ; l'erreur
  d'annulation elle-même est ignorée (l. 513-515). La réponse n'est tenue pour complète que si elle finit par
  `</wfs:FeatureCollection>` et ne contient pas de `ServiceExceptionReport` (que MapServer renvoie en HTTP 200 :
  journal du 25 novembre, aller-retour 1/3). Fonction de la sonde : `sondeAnalyserReponse` (§ 8).

**Écrire la réponse dans le projet** : `FileUtils.writeFileContent(chemin, octets)` (`QF src/core/utils/qffileutils.h`
l. 97 ; `.cpp` l. 652-690) n'écrit que **dans le dossier du projet** (`isWithinProjectDirectory`, l. 654-658 ;
`.h` l. 76), crée le dossier (l. 664-671) et vérifie le nombre d'octets écrits (l. 675-681). C'est l'appel qui écrit
déjà les `.qml` des imports (`plugin/Vision.qml`, `ecrireFichier`, octets UTF-8 en `ArrayBuffer`), prouvé sur le
Samsung (prototype n° 3). `vision-imports/` est sous le dossier du projet (spec § 3.3).

**Lire le GML puis le réécrire** : `LayerUtils.loadVectorLayer("<…>/vision-imports/…/FOR_PUBL_FR.gml", nom)` (pilote
OGR GML de GDAL), contrôles existants (système, vraisemblance de l'emprise, comptage par
`LayerUtils.createFeatureIterator`, `qflayerutils.h` l. 234), puis `saveVectorLayerAs(couche, cible, "GPKG")`, puis
effacement du `.gml` (et du `.gfs` que GDAL écrit à côté) par `platformUtilities.rmFile` (prouvé, ADR 0007).
**Pilote GML de GDAL : INCONNU, premier essai à faire** (sonde, § 8). Il a besoin d'Expat ou de Xerces
(`ports/gdal/portfile.cmake` l. 34 : `expat → GDAL_USE_EXPAT`). Les manifestes ne tranchent pas :
- le manifeste de QField déclare `gdal` avec `"default-features": false` (`QF vcpkg.json` l. 32-35) ; dans vcpkg, le
  manifeste de tête fait alors tomber les options par défaut de GDAL (dont `recommended-features` → `expat`, `curl`,
  `sqlite3` : `ports/gdal/vcpkg.json` l. 41-69, l. 296-313), et le port qgis ne demande que `gdal[archive, poppler]`
  (`QF vcpkg/ports/qgis/vcpkg.json`) : les manifestes prédiraient un GDAL **sans Expat** ;
- mais ils prédiraient aussi un GDAL **sans sqlite3**, donc sans GeoPackage, alors que le GeoPackage marche sur le
  Samsung (prototype n° 3, imports de l'ADR 0008) : la lecture des manifestes est donc incomplète (triplets, ports
  de surcouche ou dépendances indirectes), et ne prouve ni la présence ni l'absence du pilote GML.
Si le pilote manque, la voie B tombe et la voie A (analyseur GML propre à QGIS, § 1.2) devient la seule.

**`gml_id` NOT NULL** : lu par GDAL 3.8.4 sur le fichier d'essai de la sonde (forme MapServer, sans `gml:id`), le
pilote GML expose un champ `gml_id` ; `ogr2ogr` vers GeoPackage échoue alors sur tous les objets (« NOT NULL
constraint failed: FOR_PUBL_FR.gml_id », essai du 25 novembre dans la session ; même défaut que la mesure, corrigé
par `GML_EXPOSE_GML_ID=NO`, journal du 25 novembre). Par `saveVectorLayerAs`, la contrainte ne devrait **pas** être
recopiée : `includeConstraints` vaut `false` par défaut (`QG src/core/qgsvectorfilewriter.h` l. 585) et QField ne le
pose pas (`qflayerutils.cpp` l. 703-710), or c'est lui qui commande `OGR_Fld_SetNullable` (`qgsvectorfilewriter.cpp`
l. 930-939). Lu, non essayé : la sonde compare le nombre d'objets du GML et du GeoPackage relu.

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
- Conversion des octets en JS : `Logique.octetsUtf8` (`plugin/vision-logique.mjs` l. 181-195) empile chaque octet
  dans un tableau JavaScript avant le `Uint8Array` : **pic de mémoire** de plusieurs fois la taille du texte (un
  nombre JS par octet), en plus du texte lui-même. À quelques Mo, tolérable ; durée et mémoire mesurées par la sonde
  (octets et durée par couche). Une écriture par morceaux sera à prévoir au prototype si le pic gêne.

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
  (déjà utilisé par `Logique.decrireSysteme`). Le projet modèle est en EPSG:2154 (`outils/projet-modele.mjs` l. 298 `projectCrs`, l. 308 `destinationsrs`) ;
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
| **R2** (retenue par l'orchestrateur, forme corrigée ci-dessous) | Entrée de nouvelle sorte dans le même registre, marques `vision/cache=onf` et `vision/couche` | `entreeSaine`, `demarrerProjet`, `inscrire`/`retirer`, `coucheDuProjet`, `cheminsProteges`, le chargeur et le panneau étendus ; messages propres au cache | Une version **plus ancienne** du plugin retirerait ces entrées du registre (« douteuses ») sans effacer les fichiers : un retour arrière perd le cache à l'affichage |
| **R3** | Registre à part (clé `vision/<vision_id>/cache`) | Code à part, aucun risque pour le registre des zips | Deux registres à tenir ; aucun gain de rechargement |

**Ce que la première forme de R2 cassait** (relecture de `0272d30`) :

1. **Nom de table.** `saveVectorLayerAs` nomme la table d'après le fichier (`saveOptions.layerName =
   fileInfo.completeBaseName()`, `QF qflayerutils.cpp` l. 705). Un fichier `FOR_PUBL_FR-<horodatage>.gpkg` aurait une
   table `FOR_PUBL_FR-<horodatage>`, et le rechargement en `chemin + '|layername=' + e.couche`
   (`plugin/vision-logique.mjs` l. 1349 ; même forme à l'import, l. 968) ne la trouverait pas ; le `.qml` voisin,
   cherché sous le nom du fichier (`cheminsDeLaCopie`, l. 810-813), non plus.
2. **Couche du projet.** `coucheDuProjet` (`plugin/Vision.qml` l. 192-194) ne reconnaît que `vision/zip` : une couche
   de cache affichée serait prise pour une couche à libérer (`deleteLater` sur une couche de la carte). Les recherches
   `coucheMarquee` (l. 72) et `retirerLeZipDeLaCarte` (l. 302) ne connaissent aussi que `vision/zip`.
3. **Clé du registre.** `inscrire` et `retirer` comparent `(zip, couche)` (`memeCouche`, `vision-logique.mjs`
   l. 635-637) : une entrée sans `zip` serait confondue avec toute entrée sans `zip` de même couche.
4. **Fichiers protégés.** `cheminsProteges` (l. 982-995) protège `dossier + '/' + e.chemin` : pour une entrée de
   cache, ce chemin doit être pris sous le dossier du cache, sinon le mauvais fichier est protégé.
5. **Collision de dossier.** Le dossier d'un zip est son nom sans `.zip` (`dossierDuZip`, l. 805-807) : un dossier de
   cache `onf-cache/` serait celui d'un zip `onf-cache.zip` importé par l'agent.

**Forme corrigée proposée de R2** (à coder au prototype, après la sonde) :

- **Dossier réservé** `vision-imports/_cache-onf/`, et **à l'import, refus d'un zip** dont le dossier serait un nom
  réservé (`_cache-onf.zip`, `_sonde-053.zip`) : message clair, rien n'est copié.
- **Une génération par dossier** : `vision-imports/_cache-onf/<horodatage>/<couche>.gpkg` et `<couche>.qml`. Le
  fichier garde le nom de la couche, donc la table aussi (point 1), et `|layername=<couche>` comme le `.qml` voisin
  marchent sans changement de la mécanique de l'ADR 0008. Horodatage sûr : `AAAAMMJJTHHMMSSZ` (chiffres, `T`, `Z`).
- **Entrée** : `{ cache: "onf", couche: "FOR_PUBL_FR", chemin: "<horodatage>/FOR_PUBL_FR.gpkg", emprise: {xmin, ymin,
  xmax, ymax}, date, objets }`, sans `zip`. `entreeSaine` : `cache === "onf"`, `couche` parmi les trois couches,
  `chemin` = deux segments, horodatage conforme, fichier = `<couche>.gpkg`.
- **Clé** `(sorte, couche)` : `memeCouche` compare `cache` en plus de `zip` (une entrée de zip n'a pas de `cache`).
- **Marques** `vision/cache = "onf"` et `vision/couche` ; `coucheDuProjet` vrai aussi pour `vision/cache` (point 2) ;
  recherche propre `coucheDuCache(couche)` ; `coucheMarquee` et `retirerLeZipDeLaCarte` inchangés (elles ne doivent
  pas toucher au cache).
- **`cheminsProteges`** : pour une entrée de cache, base `vision-imports/_cache-onf/` (point 4) ; l'effacement d'une
  ancienne génération passe par la même garde que les copies (`peutEffacer`, dossier `vision-imports`).

**Remplacement au cache suivant** (arbitrage n° 7 : une seule zone, l'ancienne gardée si la nouvelle échoue) :
écrire les trois couches dans un **nouveau** dossier de génération ; les contrôler (complétude de chaque réponse,
plafond non dépassé, système EPSG:2154, emprise vraisemblable, nombre d'objets du GML = nombre relu du GeoPackage) ;
seulement si **les trois** passent : retirer de la carte les couches de l'ancienne génération, ajouter les nouvelles,
remplacer les entrées, effacer l'ancienne génération. Sinon : la nouvelle génération est effacée, l'ancienne reste
affichée et inscrite, le message dit pourquoi. Raison du nouveau dossier : ne pas écraser un GeoPackage encore ouvert
par QGIS (risque n° 4 de `plugin/PLAN.md` § 8, de même nature).

## 5. Bilan : voies classées

| Rang | Voie | Prouvé dans les sources | Pas prouvé | Pour l'agent |
|---|---|---|---|---|
| **1 (recommandée, sous condition)** | **B** : `iface.createHttpRequest()` → GML 2 → `writeFileContent` dans `vision-imports/` → `loadVectorLayer` (OGR) → contrôles existants → `saveVectorLayerAs` GPKG → `rmFile` du GML | http permis (§ 2) ; requête asynchrone, délai, annulation ; écriture dans le projet ; réécriture GPKG ; emprise lisible (§ 3) ; NOT NULL de `gml_id` non recopié | **pilote GML dans le paquet Android : inconnu (condition de la voie)** ; GML de l'ONF en UTF-8 ; type de géométrie ; durée et mémoire de conversion ; coupure après 60 s de silence | écran vivant, bouton « annuler » possible ; un cache incomplet est **détecté par le contenu et refusé**, l'ancien reste |
| 2 (seule voie si le pilote GML manque) | **A** : couche WFS (`loadVectorLayer(…, "WFS")`) + `saveVectorLayerAs(…, "GPKG", "intersects_bbox(…)")` | fournisseur WFS lié, avec son propre analyseur GML (Expat de QGIS) ; filtre traduit en `FILTER` OGC ; `maxNumFeatures` | traduction réelle du filtre par MapServer 7 ; type de géométrie ; rendu | écran **figé** pendant le téléchargement, sans annulation ; coupure réseau = cache **incomplet sans le savoir** |
| 3 | C1, C2 | — | — | plus de code, mêmes défauts que A (C1) ou emprise impossible (C2) |

La voie B demande un peu plus de code que A, mais c'est la seule où le plugin **sait** qu'il a tout reçu. Test du
roseau et du chêne : si l'on plie vers A (moins de code), c'est l'agent qui paie sur le terrain (un cache partiel,
une parcelle manquante en mode avion, sans message). Je ne plie pas en silence : B est proposée **si le pilote GML est
présent** (premier essai de la sonde). S'il manque, A devient la seule voie et son prix (cache incomplet sans le savoir,
écran figé) devra être écrit à Pascal avec une parade à prouver (par exemple compter les objets par une requête
`RESULTTYPE=hits` en WFS 1.1.0 avant d'écrire, comme la mesure de l'étape 1).

## 6. Ce que le temps 2 devra mesurer sur le Samsung

0. **D'abord** : un petit `.gml` écrit par le plugin s'ouvre-t-il par `loadVectorLayer` ? (pilote GML, condition de la
   voie B ; sonde, § 8).
1. Une requête `GetFeature&BBOX` en http sur une forêt connue : code 200, encodage déclaré du GML, taille, durée.
2. Ouverture du GML par `loadVectorLayer` (pilote GML présent ?), système lu (`EPSG:2154`), type de géométrie,
   nombre d'objets = nombre de `<gml:featureMember>`.
3. GeoPackage écrit, rechargé à la réouverture, styles de Pascal (copies adaptées) appliqués, en mode avion.
4. Plafond dépassé (`MAXFEATURES` = plafond + 1) : refus clair, ancien cache gardé.
5. Coupure réseau en cours (mode avion pendant la requête) : refus clair, ancien cache gardé.
6. Un point du terrain : le contour d'une forêt connue tombe sur le fond IGN à moins de 5 m (règle du projet).

## 7. Questions à Pascal

Tranchées le 25 novembre 2026 (fiche 053, arbitrages n° 5 à 7) : **plafond 20 km de côté et 5 000 objets par
couche** ; **cache en tête de liste** ; **une seule zone à la fois**, l'ancienne gardée si la nouvelle échoue.
Inscription : R2, forme corrigée (§ 4). Repères de la mesure n° 1 : 17 190 forêts, 408 400 parcelles, 24 343 points
sur la métropole ; débit observé ≈ 26 forêts/s et ≈ 190 parcelles/s (GitHub Actions, à revoir sur mobile).

Reste ouvert : **les textes affichés** du futur bouton de cache (libellé, réussite avec nombre d'objets et date, refus
pour plafond, réseau absent ou réponse incomplète, rechargement hors réseau), à soumettre à Pascal après la sonde. Les
textes de la sonde sont provisoires (outil d'essai).

## 8. Sonde d'essai (temps 2, premier pas)

**Zone d'essai** : massif de la Serre (Jura), cas `Serre_EA2026` de JFC. Point de référence WGS84 lon 5,585° E,
lat 47,185° N, soit **x 895 717, y 6 679 283 en EPSG:2154** (pyproj 3.8.0, ordre x est, y nord ; vérifié par
`tests/sonde-onf-053.test.mjs`). Emprise par défaut : carré de 4 km centré sur ce point
(893 717, 6 677 283 – 897 717, 6 681 283). La carte peut aussi décider (emprise visible, plafonnée à 20 km).

**Ce que fait la sonde** (plugin d'essai : Vision 0.6.0 + section « sonde 053 », `plugin/Vision.qml` et
`plugin/Panneau.qml` ; logique pure `plugin/vision-logique.mjs`, section « sonde 053 ») : rien au registre, rien à la
carte, rien d'effacé ; fichiers dans `vision-imports/_sonde-053/`.

1. Écrit `fixture.gml` (GML 2 de forme MapServer, 2 forêts fictives, accents, EPSG:2154), l'ouvre par
   `loadVectorLayer`, affiche validité, objets, système, champs, libellés et « accents JUSTES/FAUX », puis le réécrit
   en GeoPackage horodaté et compte les objets relus (`gml_id`).
2. Pour chaque couche, `GetFeature` WFS 1.0.0 `BBOX` (`MAXFEATURES=5001`) par `iface.createHttpRequest()` :
   statut, octets, durée, `Content-Length`, objets, complète ou non, exception, encodage déclaré, caractères illisibles ;
   écrit `<couche>.gml`, l'ouvre et le réécrit comme en 1.
3. Si le GML reçu ne s'ouvre pas : voie A (couche WFS de QGIS, `saveVectorLayerAs` filtré), objets et durée.
4. Bouton hors réseau : rouvre `fixture.gml` et les GML déjà reçus, sans réseau.
5. Compte rendu dans le panneau et dans `vision-imports/_sonde-053/rapport-<horodatage>.txt` (un par sonde ; fichier d'essai nommé « fixture » dans le compte rendu ; type de géométrie affiché pour chaque couche lue ; toute exception notée, la sonde se termine toujours).

Le dossier `_sonde-053` serait celui d'un zip `_sonde-053.zip` : collision improbable, acceptée pour un outil
d'essai ; la garde d'import des noms réservés est prévue avec R2 (§ 4).

## 9. Protocole d'essai de la sonde sur le Samsung (court)

**Mise en ligne** (Pascal, une fois la branche poussée par l'orchestrateur) : lancer à la main le workflow « Release du
plugin » sur la branche de la mission :
`gh workflow run release-plugin.yml --repo pobsteta/vision --ref claude/awesome-dirac-sbuica`
(ou, sur GitHub : Actions, « Release du plugin », « Run workflow », branche `claude/awesome-dirac-sbuica`). Hors de
`main`, `outils/decider-release.mjs` publie la **préversion** `plugin-essai` (jamais « latest », jamais `plugin-v*`),
après `node --test` ; la version reste 0.6.0 (une fusion par erreur sur `main` échouerait sur l'étiquette
`plugin-v0.6.0` déjà prise : pas de version stable possible par ce chemin). Adresse d'installation :
`https://github.com/pobsteta/vision/releases/download/plugin-essai/plugin-vision.zip` (flashcode dans les notes).

1. **Installer** : QField, Paramètres, Plugins, « Install plugin from URL », l'adresse ci-dessus ; ouvrir `vision.qgz`.
2. **Avec réseau** (wifi ou 4G), bouton Vision, « Sonde ONF : massif de la Serre (réseau) ». Attendre « Fin de la
   sonde. ». Noter ou photographier le compte rendu ; il est aussi écrit dans
   `vision-imports/_sonde-053/rapport-<horodatage>.txt` (un fichier par sonde, heure UTC : rien n'est écrasé ; la
   ligne « Compte rendu : … » en donne le nom).
3. Zoomer la carte sur une forêt connue de JFC (zone de moins de 20 km), puis « Sonde ONF : emprise de la carte
   (réseau) ».
4. **Mode avion**, « Sonde ONF : hors réseau (fichiers reçus) » : le fichier d'essai et les GML reçus se rouvrent-ils ?
5. Rapporter les trois comptes rendus (les trois fichiers `rapport-<horodatage>.txt`).

**Ce que le compte rendu doit dire, ligne par ligne** (textes de la sonde, tels qu'affichés) :

| Ligne | Si bon | Si mauvais : ce que ça veut dire |
|---|---|---|
| `fixture : GML ouvert, valide, 2 objets, système EPSG:2154, type de géométrie polygone, WKB 6 MultiPolygon, champs : …` puis `fixture : accents JUSTES (2/2)` | le pilote GML est dans le paquet : voie B possible | `fixture : ouverture du GML ÉCHOUÉE (pilote GML absent, ou fichier illisible)` : voie B tombe ; la voie A est essayée sur le réseau |
| `fixture : GeoPackage … : 2 objets relus, type de géométrie …` | `saveVectorLayerAs` passe malgré `gml_id` | `réécriture en GeoPackage REFUSÉE` ou `(ÉCART avec le GML)` : défaut `gml_id` NOT NULL à traiter |
| `FOR_PUBL_FR : HTTP 200, … octets, … s, … objets, complète, encodage UTF-8` (idem `PARC_PUBL_FR`, `PRS_FR`), puis `FOR_PUBL_FR : GML ouvert, valide, …, type de géométrie …` | requête http, contenu complet, type lu | `FOR_PUBL_FR : échec (…)` : réseau ; `INCOMPLÈTE` : coupure ; `exception : …` : refus du serveur ; `encodage ISO-8859-1` ou `caractères illisibles` : accents perdus en voie B ; `écriture du GML reçu ÉCHOUÉE` : écriture refusée dans le projet ; `aucun objet sur cette emprise` : rien sur la zone |
| `FOR_PUBL_FR : voie A, …` (seulement si le GML reçu ne s'ouvre pas) | `voie A, couche WFS valide, type de géométrie …` puis objets écrits et durée | `voie A, couche WFS invalide` ou `voie A, écriture REFUSÉE` |
| `EXCEPTION (…) : …` | absente | la sonde s'est arrêtée là ; le compte rendu est quand même écrit |
| hors réseau : mêmes lignes `GML ouvert, valide,` qu'avec réseau | lecture sans réseau | — |

Ce que la sonde **ne** prouve **pas** : le rendu des styles, le rechargement à la réouverture du projet, la tenue au
plafond sur une vraie grosse zone (prototype de cache, après la sonde).

## 10. Essai n° 1 de la sonde (25 novembre 2026, Samsung, QField **4.3.8**)

Bouton « massif de la Serre » (compte rendu transmis par l'orchestrateur) :

- **Prouvé sur l'appareil** : `fixture.gml` écrit dans `vision-imports/_sonde-053/` ; **pilote GML présent** (couche
  valide, 2 objets, EPSG:2154, polygone, WKB 6 MultiPolygon) ; **accents justes** (2/2). La condition de la voie B
  (§ 1.3) est levée ; l'encodage du vrai GML de l'ONF reste à voir.
- **Arrêt** : `TypeError: Property 'deleteLater' of object QgsVectorLayer(…) is not a function`, avant le GeoPackage
  et le réseau. Corrigé dans la sonde (aller-retour 3/3) : libération sûre `sondeLiberer`, qui le dit une fois.
- **Champ `coordinates`** : sans schéma, le pilote GML de GDAL prend le `gml:boundedBy/gml:Box/gml:coordinates` de
  chaque objet pour un attribut (fichier `.gfs` écrit à côté : `ElementPath` `boundedBy|Box|coordinates`, vu ici avec
  GDAL 3.8.4). Le fichier d'essai a cette boîte par objet comme les réponses de MapServer 7 : le vrai GML l'aura aussi,
  sauf si GDAL lit le schéma désigné par `schemaLocation` (DescribeFeatureType). Le prototype de cache devra écarter
  ce champ (et `gml_id`) ou fournir un `.gfs` ; la sonde le montrera sur les vraies réponses.

### Pourquoi `deleteLater` n'existe pas en QML

- Qt 6.10.3 (port `qtdeclarative` de QField : `vcpkg/ports/qtdeclarative/vcpkg.json` l. 3) **cache à QML** le slot
  `QObject::deleteLater()` et le signal `destroyed()` : `src/qml/qml/qqmlpropertycache.cpp` l. 431-450 et l. 817-826
  (« Used to block access to QObject::destroyed() and QObject::deleteLater() from QML »),
  `src/qml/jsruntime/qv4qobjectwrapper.cpp` l. 1023-1059. Ce n'est pas propre à `QgsVectorLayer` : aucun `QObject`
  n'a `deleteLater` en QML. Le commentaire de la mission 049 (« deleteLater, slot de QObject ») était faux.
- L'autre voie de QML, `destroy()`, refuse un objet en `CppOwnership` : `loadVectorLayer` pose cette propriété
  (`QF qflayerutils.cpp` l. 618) ; `setObjectOwnership(CppOwnership)` met `indestructible = true`
  (`src/qml/jsapi/qjsengine.cpp` l. 1324-1335) et `destroy()` lève alors « Invalid attempt to destroy() an
  indestructible object » (`qv4qobjectwrapper.cpp` l. 2994-2996 ; `qqmldata_p.h` l. 242-247).
- **Seule voie de libération lue, accessible au plugin** : donner la couche au projet puis l'en retirer.
  `ProjectUtils.addMapLayer` → `QgsProject::addMapLayer`, qui en prend la propriété (`setParent( this )`,
  `QG src/core/qgsmaplayerstore.cpp` l. 110-113) ; `ProjectUtils.removeMapLayer` la détruit (`delete lyr` si elle lui
  appartient, l. 183-186). Prix : la couche passe un instant dans la liste des couches et la carte (signaux du projet,
  rendu), et une couche **invalide** n'est peut-être pas acceptée (non lu en entier). **Non essayé**, à ne pas suivre
  sans décision.
- Sinon : ne rien libérer. Les couches ouvertes restent en mémoire (et leurs fichiers ouverts) jusqu'à la fermeture
  de QField ; pour une sonde ou un import ponctuel, c'est une fuite bornée.

## 11. Prototype du cache de zone dans le plugin (étape 1 ter) et protocole d'essai sur le Samsung

Rédigé par le `dev` le 25 novembre 2026. **La sonde est retirée du plugin** (Vision.qml, Panneau.qml, vision-logique.mjs et son
test) : §§ 8 à 10 en gardent l'historique. Le prototype suit la voie B (§ 1.3) et la forme R2 corrigée (§ 4).

**Ce que fait le bouton « Mettre en cache les couches ONF de cette zone »** (`plugin/Vision.qml`, section « cache ONF » ; logique
pure `plugin/vision-logique.mjs`, section « cache ONF », testée par `tests/cache-onf-053.test.mjs`) :

1. Emprise : les quatre coins de l'écran (`mapSettings.screenToCoordinate`, `qgsquickmapsettings.h` l. 236), reprojetés en
   EPSG:2154 si la carte ne l'est pas ; la boîte qui les contient (carte tournée comprise). Plus de 20 km de côté : refus
   (« Zone trop grande… »), jamais rognée.
2. Pour `FOR_PUBL_FR`, `PARC_PUBL_FR` puis `PRS_FR` : `GetFeature` WFS 1.0.0, `BBOX`, `MAXFEATURES=5001`. Chaque réponse est
   jugée : statut 0 (pas de réponse) = « Pas de réseau… » ; HTTP autre que 200, exception, fin de collection absente,
   encodage autre que UTF-8 ou caractère illisible = « Réponse incomplète… » ; 5 001 objets = « Trop d'objets… (plus de 5 000
   <couche>) ». Au premier refus, rien n'est écrit : l'ancien cache reste.
3. Les trois réponses reçues : écrites dans une **nouvelle génération** `vision-imports/_cache-onf/<AAAAMMJJTHHMMSSZ>/` :
   `<couche>.gml`, puis un schéma `<couche>.gfs` écrit par Vision, qui **fixe le système (EPSG:2154) et le type de géométrie**
   (MultiPolygon pour forêts et parcelles, Point pour les points ; GDAL force chaque objet à ce type, `ogrgmllayer.cpp` l. 389 de
   GDAL 3.12.4) et ne déclare que les champs réels (ni `gml_id` : option `EXPOSE_GML_ID=NO`, ni `coordinates`). GDAL lit ce
   `.gfs` avant tout schéma XSD distant (`ogrgmldatasource.cpp` l. 861-886, 910) : plus de « système inconnu », plus de
   DescribeFeatureType au moment de l'ouverture. Puis contrôles (valide, EPSG:2154, type, nombre d'objets = nombre reçu,
   emprise en France métropolitaine), `saveVectorLayerAs` en `<couche>.gpkg`, style adapté `<couche>.qml` écrit à côté,
   GeoPackage relu et recontrôlé. Le système est aussi imposé (`couche.crs`, Q_PROPERTY en écriture, `qgsmaplayer.h` l. 90) si
   GDAL n'en donnait pas.
4. **Tout ou rien** : seulement si les trois couches passent, l'ancien cache quitte la carte, le nouveau y entre (forêts, puis
   parcelles, puis points : les points en tête de liste), en lecture seule, sous les noms validés ; le registre est remplacé ;
   le GML, le `.gfs` et l'ancienne génération sont effacés. Sinon la nouvelle génération est effacée et l'ancien cache reste
   affiché et inscrit.
5. Le panneau affiche « Cache ONF du JJ/MM/AAAA : … » ; à la réouverture du projet (sans réseau), les trois GeoPackage sont
   rechargés depuis le disque, après les couches des zips (donc en tête de liste), et leur `.qml` s'applique (ADR 0008).
   Le fond embarqué (`basemap.mbtiles`, mission 048), chargé ensuite, se range lui-même (placement optimal de QGIS) : il peut
   passer au-dessus du cache dans la liste ; noté, non traité ici.

**Aller-retour 1/3 (arbitrages de Pascal sur le prototype, fiche 053)** : noms des couches « Forêts publiques (© ONF) »,
« Parcelles forestières (© ONF) », « Points de secours (© ONF) » (attribution dans le nom, § 12 ; nom des points raccourci par Pascal le 25 novembre 2026, après l'essai réussi ; le registre ne garde pas le nom affiché, un cache déjà enregistré revient sous le nouveau) ; parcelles et
points visibles seulement en deçà du 1:50 000 : seuil posé dans l'en-tête `<qgis>` des styles adaptés
(`hasScaleBasedVisibilityFlag="1"`, `minScale="50000"`, `maxScale="0"`), appliqué par QGIS avec le `.qml` voisin, à la création
comme à la réouverture ; forêts toujours visibles ; textes ajoutés validés ; garde si le projet change pendant le
téléchargement ; registre illisible : le cache refuse (« Enregistrement du cache ONF impossible… ») au lieu de le remplacer ;
couche du cache invalide à la réouverture jamais passée à `libererCouche` (`deleteLater`) ; plugin en 0.7.0. Source OGR :
options lues par `analyzeURI` (`QG src/core/providers/ogr/qgsogrprovider.cpp` l. 434), puis ouverture par `open()` l. 4392-4523 (les l. 206-210 citées avant concernent la réouverture d'un Shapefile, pas ce chemin).

**Lu dans le code, non essayé sur l'appareil** : `screenToCoordinate` depuis un plugin ; l'option `|option:EXPOSE_GML_ID=NO`
dans une source OGR de QGIS ; la lecture du `.gfs` voisin par le GDAL du paquet Android (3.12.4 ; essayée avec GDAL 3.8.4
dans la session, réponse vide comprise) ; le rendu des styles adaptés sur les GeoPackage du cache ; les flèches
`arrows/Arrow_01.svg` dans QField Android. Point qui dépend de QField 4.3.8 : aucun repéré (sources lues : 4.3.7).

**Limites connues** : couches de travail (GML ouverts) jamais libérées (§ 10) ; dossiers de génération vides laissés sur
l'appareil (aucune fonction d'effacement de dossier exposée) ; pas de bouton d'annulation (texte non validé) ; écran figé le
temps de l'écriture (quelques secondes, après les téléchargements) ; une version plus ancienne du plugin retirerait les
entrées du cache du registre (« douteuses »), sans effacer les fichiers (prix de R2, § 4).

**Mise en ligne** (Pascal, une fois la branche poussée par l'orchestrateur) :
`gh workflow run release-plugin.yml --repo pobsteta/vision --ref claude/awesome-dirac-sbuica` (préversion `plugin-essai`,
jamais « latest » ; adresse `https://github.com/pobsteta/vision/releases/download/plugin-essai/plugin-vision.zip`). Installer
par « Install plugin from URL », ouvrir `vision.qgz`.

**Protocole court (Samsung, une forêt de JFC : massif de la Serre, Jura, autour de x 895 717, y 6 679 283 en EPSG:2154 ; avec réseau, mode avion, réouverture, zone trop grande, coupure réseau, second cache)** :

| N° | Geste | Attendu | Si autre chose |
|---|---|---|---|
| 1 | Avec réseau, carte zoomée sur la forêt (moins de 20 km de côté), bouton Vision, « Mettre en cache les couches ONF de cette zone » | « Téléchargement des couches ONF… », puis « Couches ONF en cache : n forêts, n parcelles, n points de rencontre (zone du JJ/MM/AAAA). » ; trois couches en tête de liste, « Forêts publiques (© ONF) », « Parcelles forestières (© ONF) », « Points de secours (© ONF) », aux styles de Pascal (contour cyan et étiquette `iidtn_frt` au-delà du 1:50 000 ; parcelles orange, étiquette `ccod_prf` en deçà ; carré rouge et flèches des points) ; parcelles et points invisibles au-delà du 1:50 000, forêts toujours visibles ; ligne « Cache ONF du … » dans le panneau | noter le message et faire une capture ; flèches absentes : le signaler |
| 2 | Toucher une parcelle et un point de rencontre | formulaire lisible, accents justes ; contour d'une forêt connue sur le fond IGN à moins de 5 m | capture |
| 3 | **Mode avion**, fermer puis rouvrir `vision.qgz` (**réouverture**) | les trois couches reviennent, mêmes styles, même ligne « Cache ONF du … » | message affiché à l'ouverture |
| 4 | Toujours en mode avion, bouton du cache | « Pas de réseau : le cache ONF n'est pas mis à jour, l'ancien est gardé. » ; l'ancien cache reste affiché | capture |
| 5 | Avec réseau, dézoomer au-delà de 20 km de côté, bouton du cache | « Zone trop grande (plus de 20 km de côté) : zoomez, puis recommencez. » ; rien ne change | capture |
| 6 | **Coupure** : avec réseau, bouton du cache, puis mode avion aussitôt pendant « Téléchargement des couches ONF… » | « Pas de réseau… » ou « Réponse incomplète du service ONF… » ; l'ancien cache reste affiché | capture ; si « Couches ONF en cache » s'affiche, noter les nombres |
| 7 | **Second cache** : avec réseau, déplacer la carte sur une autre forêt proche, bouton du cache | nouveau message de réussite ; l'ancienne zone disparaît de la carte, la nouvelle s'affiche ; la ligne du panneau change | capture |

À rapporter : les captures des étapes 1 à 7, la version de QField, et la durée approximative de l'étape 1.

### 11 bis. Essai n° 1 du prototype 0.7.0 (25 novembre 2026, Samsung, QField 4.3.8) : échec local, diagnostic ajouté

Constat (Pascal) : avec réseau, sur une forêt, « Enregistrement du cache ONF impossible : le cache n'est pas mis à jour,
l'ancien est gardé. », rien d'autre ; registre lisible (6 couches de `Test_avec_Pascal.zip`). Les requêtes sont donc passées
(sinon « Pas de réseau » ou « Réponse incomplète ») ; l'échec vient de la préparation, d'une exception du pont QML ou de
l'enregistrement, dont la raison n'était pas montrée.

**Diagnostic (aller-retour 2/3)** : à chaque échec du cache, le plugin écrit `vision-imports/_cache-onf/dernier-echec.txt`
(écrasé à chaque échec, date dedans) et la même chose dans le journal de QField (`console.log`) : étape, couche, raison,
exception (avec fichier et ligne quand le moteur les donne), message affiché, contexte (projet, horodatage, emprise), et pour
la couche en cause : validité, système lu (`authid`, description), type WKB, nombre d'objets lus et reçus, emprise, champs,
chemins, présence du GML, du `.gfs`, du GeoPackage et du `.qml`, source OGR passée à QGIS. Pour un refus de réponse : URL,
statut, erreur, longueur, analyse et extrait (300 premiers et derniers caractères). Le texte affiché ne change pas.

**Ce qui diffère de la sonde, qui a réussi sur le même appareil** (la sonde ouvrait le GML sans `.gfs`, sans `|layername=`
ni `|option:`, sans `imposerSysteme`, et ne contrôlait ni type, ni système, ni emprise, ni nombre relu) ; causes possibles,
de la plus probable à la moins probable, **aucune certaine à la lecture** :

1. **Le `.gfs` n'est pas pris** (le GML s'ouvre alors comme dans la sonde : système inconnu, type Polygon pour des parcelles) :
   le système serait imposé, mais le contrôle du type refuserait (« type de géométrie 3 »). Lu dans GDAL 3.12.4 : le `.gfs`
   voisin est lu s'il n'est pas plus ancien que le GML (`ogrgmldatasource.cpp` l. 861-886) ; il est écrit après. Rien de lu
   ne l'écarterait, mais rien n'est essayé sur Android.
2. **Contrôle du système** après lecture par le `.gfs` : `crs.authid` peut ne pas valoir exactement `EPSG:2154` (WKT sans
   identifiant reconnu) ; la sonde n'a jamais montré le système d'un GML lu avec un système déclaré par un schéma.
3. **Le dossier de génération à deux niveaux nouveaux** (`_cache-onf/<horodatage>/`, premier cache) :
   `FileUtils.isWithinProjectDirectory` remonte l'arbre par `QDir::cdUp`, qui échoue sur un parent absent
   (`QF qffileutils.cpp` l. 576-600) ; le chemin est alors comparé en absolu au dossier du projet **canonique**. Sans lien
   symbolique dans le chemin, l'écriture passe ; sinon elle est refusée (« écriture du GML refusée »). La sonde n'avait qu'un
   niveau nouveau.
4. `|option:EXPOSE_GML_ID=NO` ou `|layername=` dans la source : lus dans QGIS (`qgsogrprovidermetadata.cpp` l. 228-270,
   `qgsogrprovider.cpp` l. 434 puis `open()` l. 4392-4523), sans raison lue d'échouer.
5. Une exception du pont QML (`cacheRequete`, `cacheReponse`, `cacheEnregistrer`) : rien de repéré à la relecture (syntaxe
   contrôlée) ; le diagnostic la donnera avec sa ligne.

Écartées à la lecture : `saveVectorLayerAs` qui rendrait un autre chemin (la sonde montre le chemin demandé, capture n° 2) ;
`depart` (chaînes de `visionId()` et `dossierProjet()` des deux côtés) ; registre illisible (lisible selon Pascal).

**À relever par Pascal** : refaire le geste de l'essai n° 1 avec le plugin republié, puis rapporter le fichier
`vision-imports/_cache-onf/dernier-echec.txt` (dans le dossier du projet `projet-vision`), ou une capture de son contenu.

## 12. Attribution « © ONF » (ajout validé par Pascal le 25 novembre 2026) : impossible depuis le plugin

QField affiche les crédits d'une couche à partir de `layer->metadata().rights()` (`QF src/core/qflayertreemodel.cpp`
l. 1118-1138). Aucune voie lue ne permet au plugin d'y écrire « © ONF » :

- `metadata` est une `Q_PROPERTY` **en écriture** de `QgsMapLayer` (`READ metadata WRITE setMetadata`, `QG src/core/qgsmaplayer.h`
  l. 89 de ce clone ; l. 88 selon la relecture), mais `QgsLayerMetadata` est un
  `Q_GADGET` dont `rights` est en **lecture seule** (`QG src/core/metadata/qgslayermetadata.h` l. 57-60), sans méthode
  invocable : QML ne peut ni modifier les droits d'un objet de métadonnées ni en fabriquer un. **Voie (d), non examinée** (correction
  de la relecture) : recopier par `couche.metadata = autre.metadata` les métadonnées d'une couche qui porte déjà
  `<rights>© ONF</rights>` (par exemple une couche WFS de `vision.qgz` à l'étape 2) ; à lire et essayer à l'étape 2 ;
- `setAttribution` et `serverProperties()` ne sont ni `Q_INVOKABLE` ni propriétés (`qgsmaplayer.h` l. 414-445) ;
- un `.qmd` voisin n'est pas lu au chargement (`loadDefaultMetadata` n'est appelé par aucun code du cœur lu ; `qgsmaplayer.cpp`
  l. 1517-1521) ; le fournisseur OGR ne lit les métadonnées d'un GeoPackage que dans sa table `gpkg_metadata`
  (`QG src/core/providers/ogr/qgsogrprovider.cpp` l. 1206-1260), que `saveVectorLayerAs` n'écrit pas (`QF qflayerutils.cpp`
  l. 675-733 : aucune option de métadonnées) ;
- un style `.qml` ne porte pas de métadonnées (`importNamedMetadata` est un chemin distinct, `qgsmaplayer.cpp` l. 1700-1724).

Options, à trancher : (a) l'attribution `<rights>© ONF</rights>` sur les couches WFS de `vision.qgz` à l'étape 2 (comme les
fonds, `outils/projet-modele.mjs` l. 106-111), et pour le cache la voie C4 (§ 1.4 : couches GeoPackage déclarées dans
`vision.qgz`, qui portent leurs métadonnées) ; (b) un texte « © ONF » dans le panneau, à côté de la ligne « Cache ONF du … »
(texte à valider) ; (c) « © ONF » dans le nom des couches. **Tranché par Pascal (arbitrages sur le prototype) : (c)**, en
place depuis l'aller-retour 1/3.

## 13. À écrire à l'étape 2 (spec § 3.3 ou nouveau § 3.6, README), non fait ici

> **Fait le 25 novembre 2026 (archiviste, mission 053 étape 2)** : spec § 1 (note), § 3.3 (entrée « cache », dossier et nom réservés), § 3.6, § 11 n° 9 à 11 ; README § 3 « Les couches de l'ONF », « Services externes ». Les textes validés ne sont pas recopiés : la fiche 053 est leur source. La liste ci-dessous est gardée telle qu'écrite.

- Spec : le cache de zone (bouton, plafonds, contrôles, tout ou rien, `vision-imports/_cache-onf/<horodatage>/`, entrées du
  registre `cache: "onf"`, rechargement, noms des couches, textes validés et ceux qui restent à valider) ; le refus d'un zip
  nommé `_cache-onf.zip` ; l'attribution (§ 12).
- README § 3 : le bouton du cache, ce qu'il faut de réseau, ce qui revient en mode avion, la ligne du panneau ; la version
  du plugin (« Le plugin 0.x.0 (sur `main`) », vérifiée par `tests/readme.test.mjs`).

### 13.1 Étape 2 : couches WFS du projet modèle, ce qui n'est pas prouvé (25 novembre 2026)

`vision.qgz` déclare maintenant, dans le groupe « ONF », les trois couches WFS (`outils/projet-modele.mjs` ; fournisseur `WFS`,
`version='1.0.0'`, `srsname='EPSG:2154'`, `restrictToRequestBBOX='1'`, lecture seule, mêmes noms que le cache). **Non prouvé** :

- **l'affichage de ces couches dans QField 4.3.8 sur Android** : le fournisseur WFS de QGIS, chargé depuis le projet (voie A de § 1.2),
  n'a été essayé nulle part ; la sonde et le cache ont prouvé la voie B (`GetFeature` + `BBOX` par le plugin, GML réécrit en GeoPackage),
  non le fournisseur. À essayer par Pascal : projet ouvert avec réseau, forêts visibles, zoom en deçà du 1:50 000 pour parcelles et
  points, GetCapabilities et DescribeFeatureType de la couche lus par le fournisseur en `version='1.0.0'` ;
- les **flèches SVG** du style des points (`arrows/Arrow_01.svg`) dans QField Android ;
- ~~le **poids d'une requête** des forêts « toujours visibles » à petite échelle (177 Mo pour toute la métropole, mesure n° 1) : rien ne plafonne
  la requête hors de `restrictToRequestBBOX` ; la clé `maxNumFeatures` existe (§ 1.2) et n'est pas posée (arbitrage de Pascal requis) ;~~
  **Corrigé le 25 novembre 2026 (archiviste, sur décision de Pascal du même jour, journal et ADR 0010)** : pour les couches **WFS** de
  `vision.qgz`, les forêts ne sont plus « toujours visibles » : **seuil 1:250 000** (visibles en deçà seulement), posé par le projet
  (`COUCHES_ONF`, `minScale: 250000`, `outils/projet-modele.mjs`) ; parcelles et points restent en deçà du 1:50 000. Ce qui reste vrai :
  **rien d'autre ne plafonne la requête** (`maxNumFeatures` non posée) ; à 1:250 000, une requête de forêts couvre encore une grande zone, **non
  mesurée**. Pour les couches du **cache**, les forêts restent toujours visibles (zone de 20 km au plus, 5 000 objets) ;
- en mode avion, ces trois couches n'affichent rien (en ligne seulement) ; le cache de zone prend le relais.
