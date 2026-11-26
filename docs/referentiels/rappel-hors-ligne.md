# Rappel « préparer le hors ligne » : texte, moment, preuves (mission 055, temps 1)

- **Propriétaire :** Pascal Obstétar. Rédigé par le `dev` le 26 novembre 2026. **Proposition seulement : aucune ligne de
  plugin, rien ne s'affiche** tant que Pascal n'a pas tranché texte et moment (spec § 11 n° 6).
- **Décision éclairée :** quel texte, à quel moment, pour que l'agent ne découvre pas en forêt une carte vide (fonds IGN
  non gardés, cache ONF absent).
- **Sources lues** (clone en lecture, rien de recopié) : QField **v4.3.8**, commit
  `61c4e3e4290b3fb9059016d87bf14aaa27f2df17` (clone superficiel de l'étiquette `v4.3.8`) ; QGIS embarqué, commit
  `3a92eb30c83d7d52751a330628d72b8eb9e64876` (`vcpkg/ports/qgis/portfile.cmake` l. 1 de QField). Les pièces antérieures du
  projet citent la v4.3.7 : les lignes ci-dessous sont relues sur la **v4.3.8**.
- **Limite :** tout est **lu**, rien n'est **essayé** sur le Samsung. « Prouvé » = écrit dans le code ; pas « vu marcher ».

Abréviations : `QF` = QField v4.3.8, `QG` = QGIS 3a92eb3. Lignes : `fichier l. N`.

## 1. Le plugin peut-il savoir si le réseau est là ?

**Réponse courte : probablement oui par un chemin détourné, mais la réponse ne prouve jamais « il y a du réseau ».**

### 1.1 Ce qui existe dans QField (prouvé, lu)

- `QfCloudConnection` (le « nuage » de QField) charge un détecteur Qt de joignabilité
  (`QNetworkInformation::loadBackendByFeatures( Reachability )`, `QF src/core/qfieldcloud/qfcloudconnection.cpp` l. 69-70),
  relaie ses changements (l. 72-78) et expose `isReachable`.
- `isReachable` : propriété QML lisible, avec signal (`qfcloudconnection.h` l. 90 ; `qfcloudconnection.cpp` l. 135-157).
  **Elle rend `true` dans tous les cas sauf `Disconnected`** : sans détecteur, ou sans prise en charge, ou état
  `Unknown`, elle rend `true` (commentaire `qfcloudconnection.h` l. 241-245 : « keep the existing behavior »).
  Donc `false` = déconnecté (fiable en principe) ; `true` = **ne dit rien de sûr** (peut être un Wi-Fi sans accès
  internet, un détecteur absent, un état inconnu).
- QField s'en sert lui-même pour ses propres fenêtres (`QF src/app/qml/QgisMobileapp.qml` l. 3596, 5033, 5325, 5672).
- La permission Android nécessaire est déclarée : `ACCESS_NETWORK_STATE` (`QF platform/android/AndroidManifest.xml.in` l. 11).

### 1.2 Comment un plugin y accéderait (lu, non essayé)

- L'objet est déclaré dans le QML principal avec `objectName: "cloudConnection"` (`QgisMobileapp.qml` l. 5289-5291).
- Un plugin reçoit `iface`, qui expose `findItemByObjectName(nom)` (`QF src/core/qfappinterface.h` l. 176 ;
  `qfappinterface.cpp` l. 97-101 : `rootObject()->findChild<QObject*>(nom)`, la racine étant `rootObjects().at(0)`,
  l. 57-62). Donc `iface.findItemByObjectName("cloudConnection").isReachable` **devrait** être lisible.
- Le plugin est créé dans le contexte racine du moteur (`QF src/app/qfpluginmanager.cpp` l. 103-113), **pas** dans celui de
  `QgisMobileapp.qml` : l'identifiant `cloudConnection` n'est pas visible tel quel, il faut passer par `iface`.
- **Non prouvé :** que `findChild` trouve cet objet (parenté QML d'un élément non visuel), que la valeur lue sur le Samsung
  est juste (avion, Wi-Fi sans internet, 4G faible), que le détecteur Android est chargé dans la version Qt embarquée
  (Qt 6.10.3, citée par `plugin/Vision.qml` l. 490 ; le détecteur Android de Qt n'est pas lu ici, je le connais de
  mémoire : non prouvé). Créer son propre `QFieldCloudConnection` (type enregistré, `QF src/core/qfcore.cpp` l. 309) est
  possible mais **déconseillé** : second objet nuage avec ses effets de bord (jeton, file d'envois).

### 1.3 Autre voie, plus sûre mais plus lourde

Une vraie requête de sonde par `iface.createHttpRequest()` (`qfappinterface.h` l. 230 ; `QfXmlHttpRequest` a un délai :
`qfxmlhttprequest.cpp` l. 64-71), comme le fait déjà le cache ONF. Elle prouve le réseau **vers un service précis**, mais
coûte une requête et un délai d'attente. Je ne la propose pas pour un simple rappel.

### 1.4 Conséquence pour le texte

Le texte ne doit **jamais** dire « vous avez du réseau » ni « vous êtes hors ligne » sur la foi de `isReachable`.
Le moment peut au mieux **s'appuyer** sur `isReachable === false` (« pas de réseau, faites-le avant de partir ») ; il ne
doit pas **exiger** `true`.

## 2. Ce que le plugin peut savoir du cache, ce qu'il ne peut pas

| Question | Réponse | Preuve |
|---|---|---|
| Le cache ONF existe-t-il, de quelle date ? | **Oui** : date dans le registre du projet, déjà affichée « Cache ONF du … » | `plugin/vision-logique.mjs` l. 1730-1736 (`cacheLignePanneau`, `cacheDateAffichee`) |
| Est-il « vieux de plus de N jours » ? | **Faisable** (comparer cette date à l'horloge) ; N est un choix de Pascal | même fonction ; aucun code de comparaison n'existe encore |
| Les tuiles IGN de la zone du jour sont-elles en cache ? | **Non, le plugin ne peut pas le savoir** : le cache des fonds est celui de QGIS/QField, non interrogé par le plugin | cache disque QGIS : `QG src/core/network/qgsnetworkaccessmanager.cpp` l. 852-867 (dossier `CacheLocation` ou réglage, taille réglable), taille par défaut « 0 = automatique » (`QG src/core/settings/qgssettingsregistrycore.cpp` l. 174-175) ; aucun réglage de ce cache dans `QF src` (recherche sans résultat) |
| Combien de temps une tuile IGN reste-t-elle ? | Le serveur annonce **21 jours** (`max-age=1814400`) ; que le client l'honore **n'est pas prouvé** | `docs/referentiels/fonds-ign.md` § 3 ; essai à J+2 (critère 5) **encore non rapporté** (spec § 11 n° 7) |

Conséquence : le rappel ne peut pas dire « vos fonds sont gardés ». Il dit **quoi faire**, pas **ce qui est déjà fait**.
Le texte ne promet pas non plus de durée tant que l'essai J+2 n'est pas rapporté.

## 3. Textes proposés (courts, lisibles au soleil, gants)

Règles : une action par ligne, verbes à l'impératif, aucun chiffre promis, un mot de motif, pas de jargon (« cache »
seulement là où le bouton du panneau l'emploie déjà : « Mettre en cache les couches ONF de cette zone »).

- **Texte 1 (deux étapes, numérotées).**
  « Avant de partir, avec du réseau : 1. Affichez la zone du jour sur la carte (fonds IGN). 2. Touchez « Mettre en cache les
  couches ONF de cette zone ». Sans cela, carte vide en forêt. »
- **Texte 2 (une phrase).**
  « Zone du jour : affichez-la avec du réseau, puis mettez en cache les couches ONF. Hors réseau, rien ne se charge. »
- **Texte 3 (le plus court, pour une ligne dans le panneau).**
  « Avant le terrain, avec du réseau : parcourez la zone du jour, puis mettez l'ONF en cache. »

Variante conditionnelle (si le moment § 4 le prévoit, cache ONF absent ou vieux) :
« Cache ONF absent : mettez-le en cache avant de partir. » / « Cache ONF ancien (du JJ/MM) : renouvelez-le avant de partir. »
(la date vient de la ligne déjà affichée).

## 4. Moments proposés

| | Moment | + | − | Preuve |
|---|---|---|---|---|
| **M1** | À l'ouverture du projet, quand le réseau est là | Arrive au bon moment (réseau) | Dépend de `isReachable`, qui rend `true` dans le doute (§ 1.1) : peut s'afficher sans réseau ; **ouvert en forêt, l'agent est trop tard** ; un message qui disparaît se rate avec des gants | détection : prouvée en lecture seulement, non essayée |
| **M2** | En permanence dans le panneau Vision, sous le bouton du cache | Aucun faux positif, aucune dépendance au réseau, se lit quand l'agent ouvre le panneau, ne bloque rien | Toujours là : on cesse de le lire ; ne prévient pas celui qui n'ouvre pas le panneau | aucune dépendance non prouvée |
| **M3** | Seulement si le cache ONF est absent ou vieux de plus de N jours | Ne parle que quand c'est utile ; date déjà connue | Ne couvre **pas** les fonds IGN (non lisibles par le plugin, § 2) ; N à choisir ; si le cache est frais, l'agent oublie les fonds | date : prouvée ; comparaison : à écrire |

## 5. Recommandation du dev

**M2 avec le texte 3, renforcé par M3** : une ligne fixe discrète sous le bouton du cache (texte 3), qui devient le texte
conditionnel de la variante (plus visible) quand le cache ONF est absent ou plus ancien que N jours.
Pourquoi : c'est la seule combinaison qui ne repose sur **aucune** chose non prouvée (pas de lecture du réseau), ne
bloque pas l'agent (pas de fenêtre), reste lisible au soleil (ligne du panneau, déjà au format de « Cache ONF du … »), et
couvre aussi les fonds par la ligne fixe. **N proposé : 7 jours** (choix de Pascal).
M1 écarté pour l'instant : le gain (arriver au bon moment) est annulé par une détection non prouvée sur l'appareil.
Si Pascal tient à M1, un essai sur le Samsung (lire `isReachable` en avion, Wi-Fi sans internet, 4G) est d'abord nécessaire.

**Qui paie ?** Si je tiens à M1 sans essai : l'agent qui a du réseau mais pas de rappel (faux « hors ligne »), ou qui voit le
rappel en forêt. Si je plie vers M2 : une ligne de plus dans le panneau, à lire ou à ignorer. Aucun coût sur la justesse
des données ni sur le terrain.

## 6. Questions à Pascal

1. **Texte** : 1, 2 ou 3 (ou un autre) ? « l'ONF » seul est-il compris des agents, ou faut-il « couches ONF » ?
2. **Moment** : M2 + M3 (recommandé), M1 (après essai de détection sur le Samsung), ou autre ?
3. **N** (âge à partir duquel le cache ONF est « ancien») : 7 jours ? autre ?
4. Le rappel doit-il citer les **fonds IGN** même si le plugin ne peut pas vérifier qu'ils sont gardés ? (recommandé : oui,
   comme une consigne, sans promesse.)
5. Veux-tu l'essai de `isReachable` sur le Samsung (petite sonde, mission séparée) avant d'écarter M1 définitivement ?

## 7. Ce qui est prouvé, ce qui ne l'est pas

**Prouvé (lu, v4.3.8) :** `isReachable` existe, est lisible en QML, rend `false` seulement en cas de déconnexion annoncée ;
`iface.findItemByObjectName` existe ; l'objet porte le nom `cloudConnection` ; la permission réseau est déclarée ; la date du
cache ONF est connue du plugin ; le serveur IGN annonce 21 jours.

**Non prouvé :** que `findItemByObjectName("cloudConnection")` trouve l'objet depuis un plugin ; que `isReachable` soit
juste sur le Samsung ; que `true` signifie un accès internet réel (il ne le signifie pas par construction) ; que QField
honore les 21 jours (essai J+2) ; que le plugin puisse lire l'état du cache de tuiles (aucune voie trouvée).
