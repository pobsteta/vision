# Un plugin QField peut-il effacer un dossier ? (mission 014, temps 2 : preuve avant code)

- **Propriétaire :** Pascal Obstétar. Rédigé par le `dev` le 26 novembre 2026. **Aucune ligne de plugin écrite.**
- **Question :** le plugin peut-il effacer le dossier **vide** `vision-imports/<zip>/` (décision de Pascal du 26 novembre 2026,
  spec § 11 n° 2) ? La 053 n'avait trouvé aucune voie (spec § 3.3, « aucune fonction d'effacement de dossier exposée »).
- **Sources lues :** QField **v4.3.8**, commit `61c4e3e4290b3fb9059016d87bf14aaa27f2df17` (clone en lecture, rien de recopié).
  Les pièces anciennes citent la v4.3.7 : tout est relu sur la v4.3.8. Lignes : `fichier l. N`, chemins sous `src/` ou `platform/`.
- **Limite :** tout est **lu**, rien n'est **essayé** sur le Samsung. « Prouvé » = écrit dans le code, pas « vu marcher ».

## Verdict

**Voie trouvée, mais pas équivalente à un `rmdir` silencieux.** La 053 avait raison pour les fonctions « propres »
(`rmFile` ne vise que des fichiers ; `FileUtils.deleteFiles` refuse nos dossiers). Elle a manqué deux fonctions de
`platformUtilities` : **`removeDataset(path)`** et **`removeFolder(path)`**. Sur Android, les deux affichent une **boîte de
confirmation** que l'agent doit toucher, ne rendent **rien** et agissent **après coup**. Une seule des deux est sûre pour nous :
`removeDataset`, qui ne supprime qu'un dossier **vide**. Ce n'est donc ni « impossible » ni « silencieux » : c'est une décision
d'ergonomie pour Pascal (questions en bas).

## Prouvé (lu, v4.3.8)

| # | Fait | Source |
|---|---|---|
| 1 | `platformUtilities` est exposé à QML ; `removeDataset` et `removeFolder` sont `Q_INVOKABLE virtual`. | `core/platforms/qfplatformutilities.h` l. 179 et 183 |
| 2 | `rmFile` = `QFile::remove` : un **fichier** seulement. `createDir` crée, ne supprime pas. `renameFile` crée le dossier cible (`mkpath`), efface la cible si elle existe (`overwrite`), puis `QFile::rename`, sinon **copie + efface la source** : pour un dossier, rien de fiable ; **à ne pas utiliser sur un dossier**. | `core/platforms/qfplatformutilities.cpp` l. 202-247 (rmFile l. 208, renameFile l. 214) |
| 3 | **Android, `removeDataset(path)`** : garde = `path.startsWith(applicationDirectory())` ou un dossier de `additionalApplicationDirectories()` (comparaison de **texte**, sans canonicalisation, `..` non traité). Puis, sur le fil principal, appelle `QFieldActivity.removeDataset`. | `core/platforms/android/qfandroidplatformutilities.cpp` l. 317-343 |
| 4 | `QFieldActivity.removeDataset` : `AlertDialog` (titre « Removal Confirmation », message « The dataset will be permamently deleted, proceed with removal? », bouton « Remove »), `setCancelable(false)` ; au « Remove » : **`file.delete()`** (`java.io.File.delete`, **non récursif** : sur un dossier, ne réussit que s'il est **vide**), puis `openPath(parent)`. | `platform/android/src/ch/opengis/qfield/QFieldActivity.java` l. 792-817 ; textes : `platform/android/res/values/strings.xml` l. 22-25 |
| 5 | **Android, `removeFolder(path)`** : même garde de texte ; appelle `removeProjectFolder`, boîte « The project folder will be permamently deleted… », puis **`QFieldUtils.deleteDirectory(file, true)` = récursif**. | `qfandroidplatformutilities.cpp` l. 381-404 ; `QFieldActivity.java` l. 851-876 ; `QFieldUtils.java` l. 433-452 |
| 6 | `openPath(parent)` émis après suppression ne change que le chemin de l'écran « fichiers locaux » **s'il est visible** : sans effet sur la carte. | `QFieldActivity.java` l. 803 ; `core/qfappinterface.h` l. 292 ; `app/qml/QfLocalDataPickerScreen.qml` l. 1857-1863 |
| 7 | Ni `removeDataset` ni `removeFolder` ne **rendent** de valeur (`void`) ; l'effacement est **asynchrone** (fil principal Android, après le toucher). Aucun signal de fin exposé au plugin. | `qfplatformutilities.h` l. 179, 183 ; `qfandroidplatformutilities.cpp` l. 333-340 |
| 8 | `FileUtils` (singleton QML `org.qfield`) : `deleteFiles` a bien une branche dossier (`removeRecursively`), mais `isDeletable` n'accepte un dossier que si son **parent** est `<dossier appli>/Imported Projects`, `Imported Datasets` ou `Created Projects`. `vision-imports/<zip>/` a pour parent `vision-imports` : **refusé**. Les **fichiers** n'y passent que pour pdf, png, jpg, jpeg, mp4, mp4a, mp3 : le plugin n'efface donc pas ses `.gpkg` par là (il utilise `rmFile`, `Vision.qml` l. 172). **Danger si on s'en servait** : le dossier `Imported Projects/<projet>` (le projet Vision lui-même) est, lui, acceptable et supprimé **récursivement**. | `core/utils/qffileutils.cpp` l. 891-1010 (`isDeletable`, `deleteFiles`) ; `qffileutils.h` l. 168, 176 ; enregistrement QML : `core/qfcore.cpp` l. 329 |
| 9 | `FileUtils.fileExists` ne répond « vrai » que pour un **fichier** (`isFile()`), jamais pour un dossier : le plugin **ne peut pas** vérifier par là qu'un dossier a disparu. | `core/utils/qffileutils.cpp` l. 90-94 |
| 10 | Autres `removeRecursively` (QfAppInterface l. 575, QfPluginManager l. 473-527, QfCloudProject l. 2256-2587, `copyRecursively` avec `wipeDestFolder`) : internes à QField, **non exposés** à QML. Aucune autre fonction `rmdir`, `removeDir` accessible. | recherche `rmdir|removeRecursively|moveToTrash|QDir::remove` dans `src/` |
| 11 | Hors Android (bureau, utile aux essais) : `removeDataset` et `removeFolder` ouvrent un `QMessageBox` puis **`QFile::moveToTrash(path)`** (corbeille ; un dossier **non vide** part aussi). | `qfplatformutilities.cpp` l. 390-419 |

Le projet Vision est dans `.../Android/data/ch.opengis.qfield/files/Imported Projects/<projet>/` (`tests/registre-014.test.mjs`
l. 37-38, valeur d'essai du testeur) : donc **dans** `applicationDirectory()` ; la garde de texte de `removeDataset` laisse passer.

## Voies détournées

| Voie | Verdict | Pourquoi |
|---|---|---|
| `platformUtilities.removeDataset(<vision-imports/zip>)` | **Sûre, avec réserve** | `File.delete()` non récursif : un dossier non vide **n'est pas** supprimé (échec silencieux, rien ne se perd). Réserve : boîte de confirmation à toucher ; texte anglais de QField (« dataset » pour un dossier) hors de notre contrôle ; aucun retour. |
| `platformUtilities.removeFolder(...)` | **Dangereuse** | Récursive : si le chemin est faux, tout part. Garde de texte seulement (`startsWith`), `..` non traité, et `Imported Projects/` est dans la zone permise : une faute de chemin efface le projet Vision, son `.qgz` et `saisie.gpkg`. **Interdite** pour Vision. |
| `FileUtils.deleteFiles([dossier])` | **Inutilisable** à notre endroit, **dangereuse** à côté | Refuse `vision-imports/<zip>`, mais accepterait `Imported Projects/<projet>` récursivement. |
| `platformUtilities.renameFile(dossier, autre)` | **Dangereuse, inutile** | Ne renomme pas un dossier de façon fiable ; peut effacer la cible. Renommer ne ferait d'ailleurs pas disparaître le dossier. |
| `createDir` pour tester l'existence | **Non** | Crée le dossier s'il manque : effet de bord. |

Règle de garde si la voie `removeDataset` est retenue : n'appeler qu'avec un chemin construit `COPIES + '/' + nom`, `nom` simple
(sans `/`, `\`, `..`, vide), jamais `COPIES` lui-même ni le dossier du projet, jamais sous `_cache-onf/` ; et **seulement après
que `rmFile` a rendu vrai pour chaque fichier connu** (ce que demandent D1-01 et D1-03). C'est ce que vérifie D1-07.

## Non prouvé (lu seulement ou ouvert)

1. **Que la boîte s'affiche et que `file.delete()` réussisse** sur le Samsung (Android 11+, stockage `Android/data/...`).
2. Si la boîte **masque** la carte ou le panneau du plugin pendant le geste (modale ; l'Activité est celle de QField).
3. **Un fichier invisible pour le plugin** dans le dossier (restes `-wal`, `.aux.xml` non listés) : `File.delete()` échoue sans bruit, le dossier reste, aucun retour pour le savoir.
4. Le moment du toucher : le plugin ne sait pas quand l'agent touche « Remove » ou « Annuler » ; aucun signal exposé.
5. Que `removeDataset` ne soit ni retiré ni modifié dans une version suivante de QField (surface non garantie aux plugins).

## À essayer sur le Samsung (essai court, sans code Vision)

Avec un plugin d'essai jetable (rien dans `main`) : (a) `platformUtilities.removeDataset(<dossier vide créé à la main sous vision-imports>)` :
boîte ? dossier disparu après « Remove » ? ; (b) même appel sur un dossier **non vide** : dossier toujours là, aucun fichier perdu ? ;
(c) « Annuler » : rien ne bouge ? ; (d) l'appel pendant que le panneau Vision est ouvert : le panneau reste-t-il utilisable ?
Compter les touchers (gants).

## Contrat proposé pour D1-01 et D1-05 (testeur)

Les tests actuels (`tests/registre-014.test.mjs` l. 62-82, 309-317, 347-355) supposent un service **synchrone, qui rend vrai/faux**
(`rmdir` : faux si non vide, vrai sinon), injecté sous un nom parmi `effacerDossier`, `supprimerDossier`, `rmdir`, `rmDir`,
`removeDir` ou comme méthode de `platformUtilities`. Le réel ne le fait pas. Contrat proposé (à valider par Pascal ; je ne modifie pas les tests) :

1. **Nom :** une seule fonction injectée, `effacerDossier(chemin)`. Dans `Vision.qml`, c'est un adaptateur sur
   `platformUtilities.removeDataset(chemin)` (rien d'autre ; jamais `removeFolder`).
2. **Retour :** la logique **n'attend pas** de valeur fiable. Elle ne dit jamais « dossier effacé » : elle dit « demandé ». D1-01 et
   D1-05 gardent leur sens sur ce qui est vérifiable : appel avec le chemin exact, **après** le dernier `rmFile`, **jamais** si un fichier
   reste (D1-03), jamais si d'autres couches restent (D1-02, D1-06), gardes de D1-07. L'assertion `w.dossiers.has(...) === false` reste
   vraie avec le double synchrone du testeur ; elle ne prouve rien du réel : **c'est le Samsung qui le prouve**.
3. **Message :** aucun nouveau texte sans Pascal. Le plugin ne pouvant pas vérifier l'absence du dossier, la phrase « dossier effacé »
   n'est jamais écrite. Un texte de réserve est une décision de Pascal (question 2).
4. **Variante B** (dossier vide laissé, écrit comme limite) : D1-01 et D1-05 s'inversent (« aucun appel de dossier ») ; à réécrire par le
   `testeur`, pas par le dev.

## Questions pour Pascal

1. Accepter une **boîte de confirmation QField (en anglais, un toucher)** à chaque retrait de la dernière couche d'un zip et à
   chaque réimport qui ne laisse plus rien ? Si oui, variante A (`removeDataset`). Si non, variante B : dossier vide laissé, écrit
   comme limite, comme pour `_cache-onf/` (spec § 3.3, l. 158).
2. Si A : le plugin dit-il quelque chose avant la boîte (texte nouveau, à valider), ou laisse-t-il la boîte seule ?
3. Le **remplacement du dossier entier au réimport** reste fichier par fichier, quelle que soit la réponse ; le dossier ne part que
   vide, après coup : confirmé ?

## Ligne de journal proposée

> 26 novembre 2026 : Mission 014, temps 2 (preuve avant code). Lu QField v4.3.8 : `platformUtilities.removeDataset` (Android, `File.delete()` non récursif, boîte de confirmation, sans retour) peut effacer un dossier **vide** ; `removeFolder` (récursif) et `FileUtils.deleteFiles` écartés comme dangereux. Rien essayé sur le Samsung. Décision à Pascal : boîte acceptée (variante A) ou dossier vide laissé (variante B). Fiche : `docs/referentiels/effacer-dossier-qfield.md`.
