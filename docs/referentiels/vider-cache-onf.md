# Vider le cache ONF : preuve avant code et textes proposés (mission 054, premier temps)

- **Propriétaire :** Pascal Obstétar. Rédigé par le `dev` le 26 novembre 2026. **Aucune ligne de plugin écrite** (plugin toujours en 0.9.0 ; 0.10.0 viendra avec le code).
- **Mission en une phrase :** un bouton « Vider le cache ONF » du panneau Vision, avec confirmation, remet le cache de zone à zéro (couches du groupe
  « ONF Cache » vides, ou couches du plugin retirées de la carte en mode ancien), sort le cache du registre, sans toucher aux zips importés,
  à `saisie.gpkg` ni à `vision.qgz`. Le sens, les textes et la PR sont à Pascal.
- **Sources lues :** QField **v4.3.8** (`61c4e3e4…`, clone en lecture, relu pour ce document : `renameFile`, `rmFile`, `removeMapLayer`) ;
  QGIS `3a92eb30c83d7d52751a330628d72b8eb9e64876` (relu : `qgsmaplayer.h` l. 556 et 1934, `qgsvectorlayer.cpp` l. 437-447) ; plugin 0.9.0
  (`plugin/vision-logique.mjs`, `plugin/Vision.qml`, `plugin/Panneau.qml`) ; `docs/spec.md` §§ 3.3 et 3.6 ;
  `docs/referentiels/cache-zone-qfield.md` §§ 14-15 ; `docs/referentiels/effacer-dossier-qfield.md`. Lignes : `fichier l. N`.
- **Limite :** tout est **lu**, rien n'est **essayé** sur le Samsung pour ce bouton. Les briques réutilisées, elles, ont été **vues marcher** (essais C4 des
  25 et 26 novembre 2026). Suite de tests du dépôt avant toute modification : 1102 verts, 2 rouges **déjà là** (« le script se relance sans argument
  (contour versé) » et « … si l'empreinte du contour diffère », sans lien avec le cache) ; je n'y touche pas.

## Voie proposée (une phrase)

**Mode groupe : vider = bascule vers trois GeoPackage vides écrits à neuf** (la brique de bascule de la 053, réutilisée telle quelle, avec ses
retours arrière), registre purgé, `reload()` ; **mode ancien : renommer les fichiers, retirer les couches du plugin par `removeMapLayer`, effacer, purger le
registre.** Tout se fait **sans réseau** et ne demande aucune nouvelle fonction de QField.

## 1. Mode groupe (`vision.qgz` actuel : trois couches à chemin fixe `actuel/<couche>.gpkg`)

Pourquoi ne pas effacer : un chemin fixe sans fichier = page « Unable to load some layers » à l'ouverture suivante (`cache-zone-qfield.md` § 14.3). Pourquoi
ne pas `removeMapLayer` : le plugin ne range ni ne retire jamais ces couches (§ 14.4, `retirerCacheDeLaCarte` ne vise que `vision/origine=plugin`,
`Vision.qml` l. 548-558). Donc : **remettre des GeoPackage vides aux mêmes chemins.**

**Enchaînement** (la même suite que `cacheEnregistrer`, avec trois GML vides au lieu des réponses du service) :

1. **Garde** : projet Vision (`vision_id` UUID), registre lisible, aucun cache ni vidage en cours, aucune note de reprise en attente
   (`cleReprise`), aucun `-wal` à côté des GeoPackage actuels (même refus que la 053 : un journal rejoué sur un autre fichier).
2. **Écrire trois GeoPackage vides dans une génération neuve** `_cache-onf/<horodatage>/<couche>.gpkg`, par la voie prouvée : `cacheGmlVide(couche)` +
   `cacheGfs(couche, 'msGeometry')` écrits en `.gml` et `.gfs`, ouverts par une couche de travail, contrôlés (valide, EPSG:2154, type MultiPolygon ou
   Point, **0 objet**), réécrits par `saveVectorLayerAs` (`reecrireCouche`). C'est le corps de `creerCacheVide` (`vision-logique.mjs` l. 2325-2356) **dont
   seule la cible change** : la génération, au lieu de `actuel/`. Le GeoPackage écrit n'est **pas rouvert** par une couche de travail (même raison
   que `creerCacheVide` : jeu de données GDAL partagé avec la couche du projet).
3. **Bascule** : `basculerGeneration(ctx, groupe, horodatage, {FOR_PUBL_FR: 0, PARC_PUBL_FR: 0, PRS_FR: 0}, invalides)` (l. 2149-2207), inchangée :
   plan sans écriture (génération présente, pas de `-wal`, pas de `.avant.gpkg` déjà là) ; pour chaque couche `actuel` → `<génération>/<couche>.avant.gpkg`
   puis `<génération>/<couche>.gpkg` → `actuel/<couche>.gpkg` (`renameFile`, jamais vers un fichier existant, `qfplatformutilities.cpp` l. 214-250) ;
   `reload()` + `triggerRepaint()` ; **contrôle de ce que la couche affiche : valide et 0 objet** ; au moindre écart, renommages inverses en ordre inverse
   et nouveau `reload()`. Une couche du projet invalide au moment du geste est sautée, comme à la 053.
4. **Registre** : `remplacerEntreesCache(ctx, [])` (retire les entrées de sorte « cache », garde celles des zips, l. 2209-2215). Si l'écriture échoue : `defaire()`
   (retour arrière de la bascule), comme `cacheEnregistrer` l. 2276-2284.
5. **Nettoyage** : `effacerGeneration` efface les `.avant.gpkg` (l'ancien cache) et les fichiers de travail ; les **dossiers de génération vides restent**
   (décision de Pascal, 014). Un cache d'ancienne génération encore au registre (migration non faite) : ses fichiers sont effacés comme à la fin de
   `cacheEnregistrer` (l. 2311-2315), jamais ceux de `actuel/`.

**Ce que voit l'agent ensuite**
- Les trois couches du groupe « ONF Cache » **restent dans la légende, vides** (aucune forme à l'écran) ; aucune page d'erreur, ni maintenant ni à la
  réouverture (les trois fichiers existent, valides, 0 objet).
- **Panneau** : la ligne « Cache ONF du … » disparaît ; la ligne de rappel dit « Cache ONF absent : mettez-le en cache avant de partir. »
  (`TEXTES_RAPPEL.absent`, déjà là : `rappelCacheLigne` renvoie « absent » dès que les trois entrées manquent, l. 1789-1793). **Aucun texte neuf pour la 055.**
- Réouverture : `creerCachesVides` ne recrée rien (fichiers présents), `demarrerGroupeCache` voit un registre sans cache et des couches valides : rien à dire.
- **Un nouveau cache reste possible** (bascule d'un cache plein par-dessus les vides, comme la première fois).

**Mode groupe mais registre encore en génération** (migration ratée, « Cache ONF illisible… » affiché) : le vidage met aussi `actuel/` à zéro et efface la
génération du registre ; l'agent n'a plus à refaire un cache pour retrouver un panneau propre.

## 2. Mode ancien (ancien `vision.qgz` : couches ajoutées par le plugin, `vision/origine=plugin`)

Registre : entrées `<horodatage>/<couche>.gpkg`. Ordre proposé, pour que **tout ou rien tienne jusqu'au point de non-retour** :

1. **Mettre de côté** chaque `<horodatage>/<couche>.gpkg` en `<horodatage>/<couche>.avant.gpkg` (`renameFile`, fichier ouvert permis sous Linux, prouvé à la
   sonde C4 ; garde `peutRenommerCache`, qui accepte déjà ce nom hors `actuel/`). Un renommage refusé : renommages inverses, **rien n'a changé**, échec.
2. **Retirer les couches du plugin de la carte** par `ProjectUtils.removeMapLayer(qgisProject, id)` (`retirerCacheDeLaCarte` existe déjà ; `qfprojectutils.cpp`
   l. 62-76 ; prouvé : sonde C4 geste 5 et journal du 25 novembre, `deleteLater` inopérant sous Qt 6.10, `cache-zone-qfield.md` § 10). Point de non-retour.
3. **Purger le registre** (cache seul ; les zips restent).
4. **Effacer** les `.avant.gpkg`, `.qml`, `.gpkg-wal`, `-shm`, `.aux.xml` de la génération par `rmFile` sous la garde `peutToucherCache` (`effacerGeneration`).
   Un fichier qui résiste n'annule rien (le cache n'est plus ni affiché ni inscrit) : il est **nommé** dans le message (même forme que la 014 :
   « Fichiers restés sur l'appareil : … »).

Cas limite : un registre du **mode ancien qui pointe `actuel/`** (retour à l'ancien `vision.qgz` après le groupe, limite déjà acceptée en § 3.6) : `peutToucherCache`
refuse `actuel/` (il exige un horodatage) et **il ne faut pas effacer** ces fichiers (le nouveau `vision.qgz` les attend). Proposition : **refus avec le
texte d'échec**, rien n'est changé ; l'agent rouvre avec le nouveau `vision.qgz`, puis vide.

## 3. Tout ou rien, et ce qui n'est jamais touché

- **Mode groupe** : tout ou rien **réel** (la bascule le fait déjà : retour arrière, contrôle de la couche affichée, registre rétabli par `defaire()`).
  Retour arrière incomplet : mêmes suites qu'à la 053 (note de reprise, registre vidé des entrées de cache, « Cache ONF illisible… » à l'ouverture suivante,
  sauvegardes `.avant.gpkg` conservées).
- **Mode ancien** : tout ou rien **jusqu'au retrait des couches** (étape 2) ; ensuite, seul un fichier de reste peut subsister, dit dans le message.
- **Jamais touchés** : `vision-imports/<zip>/` (copies et zips importés), les entrées de zips du registre, `saisie.gpkg`, `vision.qgz`, les fonds, les couches WFS d'un
  ancien projet, `dernier-echec.txt` (diagnostic, reste). Garde : toute écriture ou tout effacement passe par `peutToucherCache` / `peutRenommerCache`, qui
  n'acceptent que `_cache-onf/<horodatage>|actuel/<couche>…` ; aucune fonction de dossier (`removeDataset`, `removeFolder`, `FileUtils.deleteFiles` : écartées,
  `effacer-dossier-qfield.md`). Le registre étant **commun aux projets Vision d'un appareil** (spec § 11 n° 12), vider le cache d'un projet le sort du registre pour les autres : connu.
- **Pendant un cache en cours** (`cacheEnCours`) : le bouton est grisé, et le bouton du cache l'est pendant un vidage.

## 4. Prouvé / non prouvé

| # | Fait | État |
|---|---|---|
| 1 | `renameFile` exposé ; renommer un GeoPackage ouvert puis `reload()` relit le nouveau fichier ; retour arrière | **Vu marcher** (sonde C4 « PROUVÉE », 25 novembre ; essai 26 novembre tests 2-4) |
| 2 | `reload()` exposé (`Q_INVOKABLE`) ; rouvre le fichier au même chemin ; ne rend pas valide une couche invalide | **Lu** QGIS `qgsmaplayer.h` l. 556, `qgsvectorlayer.cpp` l. 437-447 ; vu marcher (idem) |
| 3 | GML vide + `.gfs` → `saveVectorLayerAs` → GeoPackage valide, 0 objet (Point) | **Vu marcher** (sonde C4, « vide : valide, 0 objet ») |
| 4 | GeoPackage vide **créé par le plugin** (MultiPolygon et Point) lu sans page d'erreur par les couches du projet | **Vu marcher** à l'essai 6 du 26 novembre (3 vides créés sur l'ancien projet, puis le nouveau `vision.qgz` ouvert et le cache migré dessus) ; la lecture 0 objet par la couche affichée MultiPolygon n'est pas relevée à part |
| 5 | `removeMapLayer` retire une couche du plugin | **Vu marcher** (sonde C4 geste 5 ; journal du 25 novembre) |
| 6 | `rmFile` efface un fichier de la génération | **Vu marcher** (014, 053) |
| 7 | **Bascule vers du vide, et non vers un cache plein** : couche affichée à 0 objet après `reload()`, puis un nouveau cache par-dessus | **Non essayé** (la bascule a toujours porté des objets ; le contrôle « 0 objet attendu » est celui de `controlerCoucheCache`, déjà testé hors ligne) |
| 8 | Une couche du projet vide a une emprise nulle : « zoomer sur la couche » peut mal se comporter | **Non essayé** (§ 14.1 le signalait déjà) |
| 9 | Ordre du mode ancien (renommer ouvert, retirer, effacer) | **Non essayé** sur le Samsung ; chaque geste séparément est vu |
| 10 | Confirmation en deux étapes dans le panneau (§ 5) | **Non essayé** ; composants `Button`, `Label`, `Timer` déjà utilisés ou standards de QtQuick |

**Essai Samsung proposé** (avec le code, version 0.10.0) : (a) cache fait, puis vidé : trois couches vides, ligne « Cache ONF absent », WFS et zips intacts,
`actuel/` : 3 `.gpkg`, ni `-wal` ni `-shm`, pas de `.avant.gpkg` ; (b) fermer, **mode avion**, rouvrir : aucune page d'erreur ; (c) refaire un cache avec réseau ;
(d) le même en mode ancien (projet d'avant) ; (e) compter les touchers (gants) et lire le texte au soleil.

## 5. Confirmation sans fenêtre bloquante

QField n'expose à un plugin aucune boîte de dialogue maison ; la seule, `removeDataset`, est en anglais et hors de notre contrôle (`effacer-dossier-qfield.md`).
Moyen proposé : **dans le panneau lui-même**, en deux étapes, sans `Popup` (non essayé sur l'appareil). Au premier toucher, le bouton est remplacé par la
question et deux gros boutons ; un `Timer` ramène à l'état normal au bout de **15 s** sans réponse (un vidage involontaire reste impossible : sans toucher
sur « Oui », rien ne part). Le panneau garde un `Panneau.qml` « sans appel à QField » (tout passe par `Vision.qml`) : deux propriétés, `confirmationVider` et la fonction
`viderCacheOnf()`.

## 6. Textes proposés à Pascal (à valider mot pour mot avant tout code)

Contraintes : courts, gros caractères (18 pt), pas de jargon (« GeoPackage », « registre »), même ton que les textes de la 053 (« … : l'ancien est gardé »).

**Bouton** (variante A recommandée)
- **A : « Vider le cache ONF »** : le mot de la fiche ; dit que la place est libérée sans suggérer qu'on retire les couches du projet.
- **B : « Retirer le cache ONF »** : écho du bouton « Retirer » des zips, mais il y ferait croire à un retrait de couches (elles restent, vides).

**Confirmation** (variante A recommandée)
- **A (deux boutons)** : question « **Vider le cache ONF ? Il faudra du réseau pour le refaire.** » ; boutons « **Oui, vider** » et « **Non, garder** » (Non en
  haut, Oui en dessous, bien séparés ; rien ne part sans toucher « Oui »).
- **B (deuxième toucher)** : le bouton devient « **Toucher encore pour vider (5 s)** », puis revient seul. Plus court, mais un toucher ganté appuyé deux fois
  (rebond) suffit à vider : **déconseillée**.

**Réussite** : « **Cache ONF vidé.** » (le panneau dit déjà, juste dessous, « Cache ONF absent : mettez-le en cache avant de partir. »).
Avec des fichiers restés (mode ancien) : « **Cache ONF vidé. Fichiers restés sur l'appareil : … .** » (même forme que la 014, noms des fichiers).

**Échec** : « **Cache ONF non vidé : rien n'est changé, l'ancien est gardé.** » (même tournure que les échecs de la 053).
Retour arrière incomplet : pas de texte neuf, c'est « Cache ONF illisible : il n'est pas affiché ; remettez-le en cache avec réseau. » (053, validé) à l'ouverture suivante ;
l'échec du moment reprend le texte ci-dessus (limite : « l'ancien est gardé » serait inexact dans ce cas rare, voir question 3).

**En cours** : aucun texte (le geste dure une à deux secondes, bouton grisé). Un texte « Vidage du cache ONF… » est possible si Pascal le veut.

## 7. Questions pour Pascal

1. **Textes** : bouton A ou B ? confirmation A (deux boutons) ou B (deuxième toucher) ? réussite et échec tels quels ? ajout de « Vidage… » en cours ?
2. **Bouton visible seulement quand un cache est inscrit** (recommandé : pas de bouton qui ne fait rien) ou toujours là, avec un texte « Aucun cache ONF à vider » (texte neuf) ?
3. **Retour arrière incomplet** : accepter que le message d'échec dise « l'ancien est gardé » même dans ce cas rare, ou un texte dédié ?
4. **Mode ancien avec registre sur `actuel/`** (retour à l'ancien `vision.qgz`) : refus avec le texte d'échec (proposé), ou autre chose ?
5. **Délai de 15 s** avant que la confirmation se referme seule : bon, ou plus long (soleil, gants) ?

## 8. Tests à écrire d'abord (pour le `testeur`, aucun écrit ici)

V1 mode groupe : trois GeoPackage de génération vides, bascule, `actuel/` relu à 0 objet, registre sans cache, zips gardés, `.avant.gpkg` effacés ;
V2 renommage refusé en cours de route : retour arrière complet, registre inchangé, texte d'échec ; V3 `-wal` présent : refus avant toute écriture ;
V4 registre non écrit : `defaire()` ; V5 mode ancien : renommer, retirer (`removeMapLayer` pour les seules couches `vision/origine=plugin`), effacer, registre ;
V6 mode ancien, `actuel/` au registre : refus, rien changé ; V7 gardes : aucun appel hors `_cache-onf/`, aucun chemin de zip, `saisie.gpkg`, `vision.qgz`, aucun appel à
`removeMapLayer` sur une couche du groupe ; V8 confirmation : sans « Oui », aucun service appelé ; V9 le texte « Cache ONF absent » sort de `rappelCacheLigne` après vidage ;
V10 `TEXTES_VIDER_CACHE_ONF` relus dans la fiche (comme `TEXTES_CACHE_ONF`).

## Question de contrôle

Qui fait quoi d'ici quand, et comment saura-t-on que ça marche ? **Pascal** valide d'abord les textes et la voie (questions ci-dessus) ; **le `testeur`** écrit ensuite les tests
rouges (§ 8) ; **le `dev`** code en 0.10.0 ; **l'orchestrateur** lance l'essai sur le Samsung (§ 4, essai a-e) : on saura que ça marche quand les trois couches
sont vides **et** que la réouverture hors réseau ne donne aucune page d'erreur, avec WFS et zips intacts.

## Ligne de journal proposée

> 2026-11-26 · dev · 054 · preuve avant code (temps 1) : vider = bascule de la 053 vers trois GeoPackage vides écrits à neuf (mode groupe), renommer-retirer-effacer (mode ancien) ; tout lu dans QField 4.3.8 et QGIS 3a92eb3, briques vues marcher aux essais C4, bascule vers du vide non essayée ; textes proposés, rien écrit dans le plugin · `docs/referentiels/vider-cache-onf.md`.
