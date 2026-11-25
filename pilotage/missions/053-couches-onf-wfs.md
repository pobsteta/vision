# Mission 053 — Couches ONF (forêts, parcelles, points de rencontre des secours) dans le projet modèle

> Fiche rédigée par Claude (orchestrateur) le 25 novembre 2026, à la demande de Pascal (« peux-tu
> ajouter ce service WFS au projet vision avec les couches Forêt, parcelles et point de rencontre en
> prenant comme style les styles joints »). **Statut : validée par Pascal le 25 novembre 2026** (« je valide »).
>
> **Changement de cap** : le bilan n° 1 (5 novembre 2026) suspendait les nouvelles fonctions jusqu'aux
> résultats de recette ; Pascal lève cette pause pour ce sujet en le demandant (journal du 25 novembre).

## Ce qui est su (25 novembre 2026)

- **Service** : `http://ws.carmencarto.fr/WFS/105/ONF_Forets?`, MapServer 7.0.0, **WFS 1.0.0 annoncé** par le GetCapabilities fourni (sans preuve que 1.1.0 et 2.0.0 sont refusés : la mesure le dira),
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

1. ~~**Copie locale et WFS** : une copie embarquée sert sans réseau, le WFS avec réseau.~~ **Remplacé le
   25 novembre 2026** (Pascal, « oui je valide ») par le **cache de zone sur le mobile** : avec réseau, l'agent
   cadre sa zone et le plugin enregistre en GeoPackage, dans `vision-imports/`, les objets des trois couches
   sur cette emprise ; sans réseau, ce cache s'affiche et revient à la réouverture. Plus de copie nationale.
2. **Affichage** : groupe « ONF » sous la couche « Saisie terrain », au-dessus des fonds ; requêtes WFS
   limitées à l'emprise visible ; Forêts cochée ; Parcelles et Points de secours cochés mais visibles
   seulement en deçà du 1:50 000.

## Arbitrages de Pascal après la mesure n° 1 (25 novembre 2026)

3. **Étiquette des forêts** : `iidtn_frt` (identifiant ONF), à la place de `CCOD_FRT` absent du service.
4. **Styles adaptés** aux champs réels du service (`ccod_prf` en minuscules pour les parcelles ; formulaire
   des points de secours sur `iidtn_prs`, `llib_prs`, `llib_com`…), symboles, couleurs et seuils gardés :
   copies adaptées générées depuis les `.qml` de Pascal, qui restent intacts dans `docs/referentiels/brut/onf/`.

5. **Plafond du cache** : zone de 20 km de côté au plus et 5 000 objets par couche au plus ; au-delà, refus et
   demande de zoomer.
6. **Rangement** : le cache en tête de liste (un plugin ne peut pas ranger une couche dans un groupe,
   `layerTreeRoot()` non exposé à QML) ; l'arbitrage n° 2 (groupe « ONF ») vaut pour les couches WFS du
   projet modèle seulement.
7. **Une seule zone à la fois** : un nouveau cache remplace le précédent, gardé si le nouveau échoue.

Mesure n° 1 : `docs/referentiels/brut/onf/mesure-2026-11-25.md` (service en WFS 1.0.0, 1.1.0 et 2.0.0 ;
17 190 forêts, 408 400 parcelles, 24 343 points ; licence non lue).

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

### Étape 1 bis — `dev` : prototype du cache de zone (preuve avant code)

Ouverte le 25 novembre 2026 après le choix du cache de zone. **Preuve d'abord, dans le code de QField
4.3.7 (et de QGIS qu'il embarque), avec fichiers et lignes cités**, avant toute ligne de plugin :

- comment un plugin QML peut obtenir les objets d'une couche WFS sur une emprise (couche WFS du projet
  filtrée par l'emprise de la carte, requête `GetFeature` + `BBOX` par `XMLHttpRequest` puis chargement,
  ou autre voie), et les **écrire en GeoPackage** dans `vision-imports/` (fonction déjà utilisée par les
  imports, mission 047 : `saveVectorLayerAs`) ; ce qui est exposé à QML et ce qui ne l'est pas ;
- trafic `http` non chiffré depuis QField Android (`usesCleartextTraffic` / configuration réseau du paquet) ;
- emprise de la carte lisible depuis le plugin, en Lambert 93 ;
- comment le cache s'inscrit au registre (`vision_id`, marques `vision/*`) pour revenir à la réouverture
  et être remplacé au cache suivant de la même couche.

Puis, si une voie est prouvée : un **prototype minimal** (plugin d'essai séparé ou branche du plugin,
version d'essai), un bouton qui met en cache les trois couches sur l'emprise visible, avec un plafond
d'emprise ou de nombre d'objets proposé (à trancher par Pascal), et un **protocole d'essai sur le
Samsung** (une forêt, avec réseau puis en mode avion, réouverture). Si aucune voie n'est prouvée :
s'arrêter et décrire les options à Pascal.

**Ne doit pas :** publier en stable ; toucher à `vision.qgz` ; trancher le plafond, les textes affichés
ou le sort des étiquettes ; écrire un texte affiché sans le soumettre à Pascal.

### Étape 1 ter — `dev` : prototype du cache de zone (ouverte le 25 novembre 2026)

La sonde a prouvé la voie B sur le Samsung (QField 4.3.8, essais n° 1 à 4 au journal, captures dans
`docs/referentiels/brut/onf/`) : `GetFeature` + `BBOX` en http, GML lu avec les accents, réécrit en GeoPackage,
relu sans réseau. Le prototype est le **cache de zone dans le plugin**, publié en préversion `plugin-essai`,
**sonde retirée** :

- bouton dans le panneau ; emprise visible (carte tournée : les quatre coins) ; plafonds n° 5 ; les trois couches ;
  contrôle de complétude obligatoire (fin de collection, aucune exception, nombre d'objets ≤ 5 000) ;
- **système imposé EPSG:2154** aux couches reçues (« système inconnu » à chaque réponse) et **type de géométrie
  fixé** (MultiPolygon pour forêts et parcelles, Point pour les points : la réponse donne tantôt Polygon, tantôt
  MultiPolygon) ; champ parasite `gml_id` (et `coordinates` s'il apparaît) écarté ;
- enregistrement en GeoPackage selon la forme R2 corrigée de `docs/referentiels/cache-zone-qfield.md` (une
  génération par dossier, remplacement tout ou rien, ancien cache gardé en cas d'échec), rechargement à la
  réouverture du projet, cache en tête de liste, lecture seule ;
- **styles adaptés** (arbitrages n° 3 et 4) générés depuis les `.qml` de Pascal, qui restent intacts : forêts
  étiquetées par `iidtn_frt`, parcelles par `ccod_prf`, formulaire des points sur les vrais champs ;
- libération des couches de travail impossible en QML (Qt 6.10.3) : ne pas l'appeler, le dire en commentaire ;
- textes validés par Pascal (ci-dessous), mot pour mot ; version du plugin montée (préversion seulement) ;
- tests hors réseau de toute la logique ; protocole d'essai Samsung court (forêt de JFC, avec réseau, mode avion,
  réouverture, zone trop grande, coupure).

**Textes validés par Pascal (25 novembre 2026, « Je valide »)** — les nombres et la date sont remplis par le plugin :

| Moment | Texte |
|---|---|
| Bouton | « Mettre en cache les couches ONF de cette zone » |
| Pendant | « Téléchargement des couches ONF… » |
| Réussite | « Couches ONF en cache : 4 forêts, 53 parcelles, 1 point de rencontre (zone du 25/11/2026). » |
| Zone trop grande | « Zone trop grande (plus de 20 km de côté) : zoomez, puis recommencez. » |
| Trop d'objets | « Trop d'objets dans cette zone (plus de 5 000 parcelles) : zoomez, puis recommencez. » |
| Pas de réseau | « Pas de réseau : le cache ONF n'est pas mis à jour, l'ancien est gardé. » |
| Réponse incomplète | « Réponse incomplète du service ONF : le cache n'est pas mis à jour, l'ancien est gardé. » |
| Dans le panneau | « Cache ONF du 25/11/2026 : 4 forêts, 53 parcelles, 1 point de rencontre. » |
| Noms des couches | « Forêts publiques (© ONF) », « Parcelles forestières (© ONF) », « Points de secours (© ONF) » (remplacés le 25 novembre 2026, attribution dans le nom ; « Points de secours » raccourci par Pascal le même jour) |

Attribution des trois couches : « © ONF » (validée par Pascal le 25 novembre 2026 ; accord de l'ONF rapporté par
Pascal, trace écrite à verser).

**Arbitrages de Pascal sur le prototype (25 novembre 2026)** :
- textes ajoutés validés : « Enregistrement du cache ONF impossible : le cache n'est pas mis à jour, l'ancien est
  gardé. » ; « Carte hors de France métropolitaine : le cache ONF n'est pas mis à jour, l'ancien est gardé. » ;
  « Cache ONF illisible : il n'est pas affiché ; remettez-le en cache avec réseau. » ; « _cache-onf.zip : nom
  réservé par Vision (cache ONF), rien n'est importé. » ;
- attribution du cache **dans le nom des couches** (le plugin ne peut pas poser `rights`) : « Forêts publiques
  (© ONF) », « Parcelles forestières (© ONF) », « Points de secours (© ONF) » (nom raccourci par Pascal, 25 novembre 2026) ;
- **mêmes seuils** que l'arbitrage n° 2 pour les couches du cache (parcelles et points en deçà du 1:50 000) ;
- texte ajouté pour une emprise illisible : « Position de la carte illisible : le cache ONF n'est pas mis à jour,
  l'ancien est gardé. » (« Carte hors de France métropolitaine … » reste pour une carte hors de France) ;
- plugin d'essai en **0.7.0** dès maintenant (README et tests adaptés sans affaiblissement).

« Trop d'objets » nomme la couche en cause (parcelles, forêts ou points de rencontre). Tout autre texte est soumis à
Pascal avant d'être écrit.

### Étape 2 — `dev` : projet modèle et plugin (après l'essai du prototype sur le Samsung)

- `outils/projet-modele.mjs` : groupe « ONF » entre « Saisie terrain » et « Fonds de carte », avec les
  trois couches WFS (`provider="WFS"`, version et paramètres selon la mesure de l'étape 1,
  `restrictToRequestBBOX='1'`, lecture seule), aux styles de Pascal (`docs/referentiels/brut/onf/`,
  intacts), seuils de l'arbitrage n° 2.
- Plugin : bouton de cache de zone selon le prototype validé ; cache affiché au-dessus ou à la place des
  couches WFS (à trancher après le prototype) ; textes validés par Pascal.
- Tests (projet modèle, plugin, logique du cache hors réseau) ; aucun affaiblissement.
- Spec (§ 3.3 et nouveau § 3.6) et README à jour ; ADR **0010** « Couches ONF : WFS et cache de zone sur
  le mobile » proposée par l'orchestrateur, **tranchée par Pascal**.
- **Ne doit pas :** toucher à la bibliothèque de styles (`plugin/styles/`) ; mettre une clé ; ajouter
  `DT_FR`, `ATE_FR` ou `RB_FR` (hors demande).

### Étape 3 — groupe « ONF Cache » (ouverte le 25 novembre 2026, demande de Pascal)

Pascal : « renommer le groupe ONF en ONF WFS et ajouter un groupe ONF Cache ». Le groupe « ONF » de `vision.qgz`
devient **« ONF WFS »** ; un groupe **« ONF Cache »** reçoit les trois couches du cache, qui ne s'empilent plus en tête
de liste (voie C4 de `docs/referentiels/cache-zone-qfield.md` : un plugin ne peut ni créer un groupe ni y ranger une
couche ; le projet modèle porte donc le groupe et trois couches à chemin fixe que le plugin remplit). **Preuve
avant code** dans les sources de QField 4.3.7 / QGIS : relecture d'une couche existante après remplacement de son
fichier (API exposée à QML), remplacement d'un GeoPackage ouvert sur Android, tout ou rien avec des chemins fixes,
GeoPackage vides livrés avec le projet, rechargement et registre, place du groupe (proposition : « ONF Cache » au-dessus
de « ONF WFS »). Si une voie est prouvée : prototype, essai Samsung, puis documentation et ADR 0010 amendée.

## Terrain

Sur le Samsung : avec réseau, les trois couches s'affichent aux styles fournis, Parcelles et Points
de secours en deçà du 1:50 000 ; hors réseau (mode avion), la copie locale s'affiche seule ; flèches
du point de secours visibles (sinon, signaler).

## Qui veille, qui tranche

- **Relecteur :** `relecteur` après chaque étape, puis Pascal (PR vers `main`).
- **Tranche :** Pascal (arbitrage après l'étape 1, ADR 0010, PR).

**Redite par l'agent (dev, étape 1, 25 novembre 2026) :** Livrer un outil testé et un workflow manuel GitHub Actions qui mesurent, pour les forêts publiques, les parcelles forestières et les points de rencontre des secours du WFS de l'ONF, les champs, volumes et métadonnées et leur compatibilité avec les trois styles de Pascal, sans toucher à `vision.qgz`, afin que Pascal arbitre ensuite la copie locale sur des mesures.
