# ADR 0010 — Couches ONF : WFS en ligne et cache de zone sur le mobile

- **Date :** 2026-11-25
- **Statut :** **acceptée par Pascal le 25 novembre 2026** (« je valide le reste »)
- **Amendée le 26 novembre 2026** (WFS retiré, groupe « ONF Cache ») : voir l'amendement en fin de page, qui prévaut.
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
   « Points de secours (© ONF) » : « en ligne » écarté par Pascal, trop long), requêtes limitées à l'emprise visible, WFS **1.0.0 fixée** (`version='1.0.0'` : version prouvée sur le Samsung ;
   sans clé, QGIS négocie, forme jamais mesurée) ; ordre points, parcelles, forêts (points au-dessus des polygones) ;
   forêts en deçà du 1:250 000 (sans seuil, la carte dézoomée demanderait les 177 Mo de forêts de métropole :
   Pascal, 25 novembre 2026), parcelles et points en deçà du 1:50 000 ; hors du thème « Fond embarqué ». Les couches
   du cache gardent leurs seuils (forêts toujours visibles : une zone de 20 km au plus).
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

## Amendement du 26 novembre 2026 : groupe « ONF Cache » (voie C4) et retrait du WFS

> Ajout daté (règle du sommier) : le texte ci-dessus n'est pas modifié ; il dit ce qui a été décidé le 25 novembre 2026.
> **Là où il se contredit avec cet amendement, l'amendement prévaut.** Décisions de Pascal du 25 et du 26 novembre 2026 (journal),
> mission 053, étape 3. Preuves : `docs/referentiels/cache-zone-qfield.md` §§ 14, 15 et 15 bis.

**Ce qui change**

1. **Le WFS est retiré de `vision.qgz`** (Pascal, 26 novembre 2026). Raison : à l'essai du temps 3 sur le Samsung, en mode avion, l'ouverture du
   projet affichait la page « Impossible de charger certaines couches » nommant les trois couches WFS (test 3). Le cache, fait avec réseau, est la
   **seule source ONF du projet**. Le point 1 de « Ce qui est décidé » (couches WFS en ligne, seuil du 1:250 000) ne vaut plus ; la version WFS
   1.0.0 reste celle des requêtes du cache. Un agent doit donc mettre sa zone en cache, avec réseau, pour voir l'ONF. Le plugin n'a jamais dépendu des
   couches WFS du projet. Un ancien `vision.qgz` garde son groupe « ONF » WFS tant qu'il n'est pas remplacé.
2. **Groupe « ONF Cache » (voie C4, voie 1 du § 14 de la pièce)** : `vision.qgz` porte un groupe « ONF Cache » avec trois couches à **chemin fixe**
   `vision-imports/_cache-onf/actuel/<couche>.gpkg` (mêmes noms « … (© ONF) », styles adaptés, lecture seule). Le plugin remplit ces fichiers par
   **bascule par renommage** (actuel mis de côté, nouveau à sa place, `reload()`, contrôle de ce qui s'affiche, renommages inverses au moindre écart :
   le tout ou rien est gardé). Cela remplace « couches en tête de liste » et lève la valeur sacrifiée « le rangement » ; l'option écartée « cache rangé
   dans le groupe (voie C4) » est **prouvée** (sonde du 25 novembre, essais 1 à 6 du 26 novembre).
3. **GeoPackage vides** : livrés dans `projet-vision.zip` (première installation) seulement, jamais dans la mise à jour ; créés par le plugin à
   l'ouverture de tout projet Vision s'ils manquent. **Mode ancien gardé** (ancien `vision.qgz` : cache en tête de liste, comme avant). **Migration**
   d'un cache en génération vers `actuel/` à la première ouverture du nouveau projet. **Reprise après un retour arrière incomplet** : sauvegardes
   `.avant.gpkg` remises à `actuel/` à l'ouverture suivante.
4. **Seuils** : forêts du cache visibles à toutes les échelles (Pascal, 26 novembre 2026) ; parcelles et points en deçà du 1:50 000.
5. **Texte validé** (fiche 053) « Cache ONF prêt : fermez puis rouvrez le projet pour l'afficher. », quand une couche du projet était invalide au
   moment du bouton.
6. **Consigne de mise à jour d'un appareil en service** : plugin d'abord, ouvrir le projet une fois, puis copier le nouveau `vision.qgz`, puis cocher
   « ONF Cache » dans la légende (QField réapplique l'ancien état de la légende, `QfProjectInfo`, QField 4.3.8). Dans l'autre ordre : page d'erreur
   une fois, couches invalides jusqu'à la réouverture.

**Limites acceptées par Pascal (26 novembre 2026)** : un dossier de génération vide laissé par chaque cache ; styles absents du cache **en mode
ancien**, transitoires (réparés par la copie du nouveau `vision.qgz`, aucune recherche de plus) ; groupe décoché après mise à jour (consigne, aucun
code). **Constatée à l'essai, non tranchée** : le registre est partagé entre plusieurs projets Vision d'un même appareil (même `vision_id`), ce qui
contredit la règle « un seul `vision.qgz` par appareil » (spec § 3.3) : le cache d'un projet remplace celui d'un autre dans le registre.

**Valeurs sacrifiées, mises à jour** : « le rangement » n'est plus sacrifié ; s'ajoutent le WFS en ligne (retiré) et la propreté du dossier du cache
(dossiers de génération vides). **Reste à prouver** : le `.qml` voisin en mode ancien (point C du temps 4, non fait) et la tenue d'une zone proche
des plafonds ; l'essai des couches WFS du projet n'a plus d'objet.

**Pièces** : `docs/referentiels/brut/onf/essai-c4-2026-11-26/` (tests 1 à 6), `docs/referentiels/brut/onf/essai-temps4-2026-11-26/` (points A et B).
