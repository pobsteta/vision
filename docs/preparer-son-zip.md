# Préparer son zip pour Vision

Page pour JFC. Elle dit **quoi mettre dans le zip** pour que le plugin Vision 0.7.0 l'accepte du premier coup, sans réseau. Le détail et les textes exacts des refus sont dans [`spec.md`](spec.md) § 3.1, § 4 et § 5 : en cas de doute, la spec et le code font foi, pas cette page.

## En deux minutes

1. Un seul fichier **`.zip`**, de **100 Mo au plus** (le fichier zip lui-même, pas son contenu décompressé). Le plafond est de 100 000 000 octets : l'explorateur Windows l'affiche environ **95 Mo**, donc vise moins de 95 Mo affichés.
2. Dedans : des couches **GeoJSON, GeoPackage, Shapefile complet ou GeoTIFF**, à la racine ou dans des dossiers.
3. Chaque couche **déclare son système de coordonnées** (Lambert 93 de préférence) et se trouve **en France métropolitaine**.
4. **Nomme les couches** comme le manuel (`UG`, `Parcelles`, `FRT`) pour avoir les couleurs du manuel.
5. Ne nomme pas le zip `_cache-onf.zip`.

## 1. Les formats acceptés

Extensions sans tenir compte de la casse.

| Format | Fichiers à mettre | Remarques |
|---|---|---|
| GeoJSON | `.geojson` (un `.json` est tenté comme GeoJSON) | Un `.json` qui n'est pas du GeoJSON est écarté avec la ligne « `<chemin>` : pas une couche GeoJSON, ignoré » ; les autres couches se chargent. Préfère `.geojson`. |
| GeoPackage | `.gpkg` | Une couche par **table vecteur**. Une table sans géométrie (attributaire seule) est ignorée si le fichier contient au moins une table vecteur ; un GeoPackage sans aucune table vecteur lisible est refusé. |
| Shapefile | `.shp`, `.shx`, `.dbf`, `.prj` **obligatoires** ; `.cpg` conseillé | Voir ci-dessous. |
| GeoTIFF | `.tif`, `.tiff` | Range-le dans le zip **sans compression** (`zip -0`) ou en SOZip, pour une lecture rapide. Pas de style du manuel. |

Tout autre fichier est ignoré sans message (`.qmd`, `__MACOSX`, fichiers `._*`). Les fichiers annexes `.tfw`, `.aux.xml`, `.sbn`, `.sbx`, `.qix` vont avec leur couche. **Un `.qml` posé dans le zip n'est pas pris en charge** pour l'instant (reporté) : il est inutile d'en mettre.

### Shapefile : tous les fichiers, même dossier, même nom

`UG.shp`, `UG.shx`, `UG.dbf`, `UG.prj`, `UG.cpg` côte à côte. Sans `.prj`, `.shx` ou `.dbf`, la couche est **refusée** ; sans `.cpg`, elle est chargée avec l'avertissement « accents peut-être mal lus ». Mets donc le `.cpg` (en UTF-8 si ton export le permet).

### Le zip lui-même

- Fais-le avec QGIS ou 7-Zip. Un zip fait par l'explorateur Windows peut abîmer les noms accentués (à vérifier, spec § 3.1).
- Le nom du zip doit être un simple nom de fichier en `.zip`.
- **Nom réservé : `_cache-onf.zip`** (majuscules ou minuscules, peu importe) est refusé : « `<nom>` : nom réservé par Vision (cache ONF), rien n'est importé. » Choisis un autre nom.
- Deux couches de **même nom** dans le zip (`a/UG.geojson` et `b/UG.shp`) : la seconde est refusée. Donne un nom différent à chacune.

## 2. Le système de coordonnées

Le projet est en **Lambert 93 (EPSG:2154)**. Toute couche est reprojetée à la volée, puis son emprise est contrôlée : elle doit tomber en **France métropolitaine, Corse comprise**. Sinon, refus : « Coordonnées incohérentes : système mal déclaré ? ».

- **GeoJSON sans membre `crs`** : lu en **WGS84** (norme RFC 7946). Si tes coordonnées sont en Lambert 93, exporte-les en Lambert 93 depuis QGIS (ou en WGS84) : sinon la couche est refusée.
- **Shapefile** : le `.prj` dit le système ; sans lui, refus.
- **GeoPackage, GeoTIFF** : le système est dans le fichier ; un GeoTIFF sans géoréférencement est refusé (« système de coordonnées inconnu »).
- Une couche **vide** est chargée avec un avertissement, sans contrôle d'emprise.

## 3. Les noms qui donnent les styles

Le nom de la couche (le nom du fichier sans extension ; pour un GeoPackage, le nom de la **table**) décide du style. Casse et accents sont ignorés. Ordre : style enregistré dans le GeoPackage, puis bibliothèque de styles (nom exact), puis règle du manuel, puis style par défaut de QGIS.

### Les couleurs du manuel

| Couche | Nom reconnu (exemples) | Géométrie | Style |
|---|---|---|---|
| UG | `UG`, `UG_2026`, `ug-nord`, `UG 3` | polygone | contour bleu `#0000FF`, étiquette 10 pt |
| Parcelles | `Parcelles`, `Parcelle`, `Parcelles_EA` | polygone | contour orange `#FF8C00`, étiquette 15 pt |
| FRT | `FRT`, `FRT_serre` | polygone | contour vert-bleu `#008B8B`, étiquette 10 pt |
| ProdBois / Relevés | n'importe quel nom | **points** ayant les champs `essence` **et** `diametre` | point noir, étiquette essence + diamètre |

- Le nom doit **commencer** par `UG`, `Parcelle(s)` ou `FRT`, suivi au besoin de `_`, `-` ou espace puis de la suite : `RUG` ou `MesParcelles` ne sont pas reconnus.
- Une couche nommée `UG`, `Parcelles` ou `FRT` mais en points ou en lignes garde le style par défaut, avec l'avertissement « nom reconnu mais pas un polygone ».
- Pour ProdBois, ce sont les champs `essence` et `diametre` (`diamètre` accepté) qui comptent, pas le nom. Si un des deux champs est vide sur un objet, son étiquette n'apparaît pas (à confirmer avec JFC).
- **Champs de code provisoires** : l'étiquette des UG, parcelles et FRT lit les champs `CODE_UG`, `CODE_PARC`, `CODE_FRT`. Ces noms sont **provisoires** (à confirmer par JFC d'après ses fichiers) ; la bibliothèque ci-dessous utilise `CCOD_UG`, `CCOD_PRF`, `CCOD_FRT`. **Question à JFC : quels sont les vrais noms de champs ?**

### La bibliothèque de styles

Une couche dont le nom est **exactement** celui d'un style de la bibliothèque de styles de Vision prend ce style, avant la règle du manuel. Ni préfixe ni sous-chaîne : `RDF_UG_2026` ne prend pas `RDF_UG`.

Styles de couches vecteur appliqués : `Bornes`, `ParcCad`, `PPE`, `PPI`, `PPR`, `RDF_FRT`, `RDF_Parc`, `RDF_UG`, `arbre_bio`, `captages_eau`, `env_bdn_enjeu`, `env_bdn_observation`, `reserves`, `stag_zonages`, `tiges_2024`, `tiges_2025`, `tiges_2026`, `voie_grumiers`, `voie_non_grumiers`.

Styles de raster `D50`, `G`, `MNH`, `VAT`, `compoRVB`, `mnh_classe_res10m` : dans la bibliothèque mais **non appliqués pour l'instant** ; un GeoTIFF reste sans style.

### Garder son propre style

Un GeoPackage qui contient son style (enregistré dans le GeoPackage depuis QGIS) le **garde**, avant tout le reste. C'est la voie pour un style sur mesure. *Pas encore prouvé sur l'appareil (spec § 5).*

## 4. Ce que l'agent verra

Chaque refus ou avertissement commence par le **chemin de la couche dans le zip**, avec son extension (`FRT.shp : …`, `Serre EA/Parcelles.shp : …`, `Serre.gpkg/Releves : …`). Une couche refusée n'empêche pas les autres. Pour un Shapefile incomplet, un seul message par couche : le premier fichier manquant, dans l'ordre `.prj`, `.shx`, `.dbf`. L'agent ne peut pas forcer le chargement.

| Situation | Message |
|---|---|
| Zip de plus de 100 Mo | `<zip>` : `<n>` Mo, au-delà du plafond de 100 Mo pour lister un zip ; zip non lu |
| Zip sans couche reconnue | Aucune couche GeoJSON, Shapefile, GeoPackage ou GeoTIFF dans `<zip>`. |
| Zip déjà importé, sans couche lisible | aucune couche lisible dans `<zip>`, rien changé |
| Nom `_cache-onf.zip` | `<zip>` : nom réservé par Vision (cache ONF), rien n'est importé. |
| Shapefile sans `.prj` | `<couche>.shp` : fichier .prj manquant, système de coordonnées inconnu |
| Shapefile sans `.shx` | `<couche>.shp` : fichier .shx manquant, couche non chargée |
| Shapefile sans `.dbf` | `<couche>.shp` : fichier .dbf manquant, couche non chargée |
| Shapefile sans `.cpg` | avertissement : accents peut-être mal lus |
| Fichier illisible | `<couche>` : illisible |
| `.json` qui n'est pas du GeoJSON | `<chemin>` : pas une couche GeoJSON, ignoré |
| Système inconnu | système de coordonnées inconnu |
| Emprise hors de France métropolitaine | Coordonnées incohérentes : système mal déclaré ? |
| Même nom de couche deux fois | `<seconde>` : nom de couche en double dans le zip (déjà pris par `<première>`) |
| GeoPackage sans table lisible | `<chemin>.gpkg` : tables illisibles, couche non chargée |
| Nom reconnu mais pas un polygone | avertissement : nom reconnu mais pas un polygone |
| Couche vide | avertissement : couche vide, chargée quand même |

Les textes complets, y compris les refus de copie, sont dans [`spec.md`](spec.md) § 4 et § 5.

## 5. Liste de contrôle avant d'envoyer le zip

- [ ] Le zip pèse moins de 100 Mo et ne s'appelle pas `_cache-onf.zip`.
- [ ] Chaque Shapefile a `.shp`, `.shx`, `.dbf`, `.prj` (et `.cpg`).
- [ ] Chaque GeoJSON est exporté en Lambert 93 depuis QGIS (ou en WGS84), pas en coordonnées sans système déclaré.
- [ ] Les couches sont en France métropolitaine.
- [ ] Les noms de couches sont uniques dans tout le zip.
- [ ] `UG`, `Parcelles`, `FRT` sont des polygones ; ProdBois a des points avec `essence` et `diametre`.
- [ ] Les GeoTIFF sont rangés sans compression.

## Cas d'essai

Les zips d'essai (UG, Parcelles, FRT, ProdBois fictifs) sont dans le [README](../README.md) § 3, « Zip d'essai ».

*Sources : `plugin/vision-logique.mjs` (formats, plafond, nom réservé), `plugin/vision-styles.mjs` (règles de noms), `plugin/vision-bibliotheque.mjs` (bibliothèque). Un test (`tests/preparer-son-zip.test.mjs`) vérifie que les formats, le plafond et le nom réservé de cette page sont ceux du code. Tenue à jour avec le plugin ; propriétaire : Pascal.*
