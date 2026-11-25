// SPDX-License-Identifier: GPL-3.0-or-later
// Vision, plugin QField d'application (mission 008) : le pont entre la logique
// (vision-logique.mjs, testée sous Node) et l'API de QField. Seul fichier qui importe le module.
// Écrit pour Vision (ADR 0006). Appels de QField lus dans QField v4.3.7 (commit 3fb1281) : voir
// plugin/PLAN.md § 5, qui dit pour chacun s'il est prouvé sur le Samsung ou non.
import QtQuick
import org.qfield
import "vision-logique.mjs" as Logique
import "vision-controles.mjs" as Controles
import "vision-styles.mjs" as Styles
import "vision-bibliotheque.mjs" as Bibliotheque

Item {
  id: vision
  visible: false

  // Un message à montrer à l'agent (toast et zone de messages du panneau).
  signal message(string texte)
  // Le registre a changé : le panneau relit la liste.
  signal registreChange()

  readonly property string versionPlugin: Logique.VERSION
  property var source: null          // QfResourceSource rendu par getFile
  property string prefixeEnCours: ""

  // -------------------------------------------------------------- contexte QField

  function versionQField() {
    try {
      return String(Qfield.version);
    } catch (e) {
      return "";
    }
  }

  function variables() {
    if (!qgisProject) return null;
    return ExpressionContextUtils.projectVariables(qgisProject);
  }

  function visionId() {
    return Logique.lireVisionId(variables());
  }

  // Dossier du projet : qgisProject.homePath (QGIS qgsproject.h L119) ; à défaut (chaîne
  // vide), le dossier du fichier projet, celui que FileUtils.isWithinProjectDirectory prend
  // pour référence (qffileutils.cpp L541-556). Les copies vont dans <ce dossier>/vision-imports
  // (repli de la spec § 9 n° 1, appliqué par Pascal le 3 novembre 2026).
  function dossierProjet() {
    if (!qgisProject) return "";
    const home = String(qgisProject.homePath || "");
    if (home !== "") return home;
    return Logique.dossierDe(String(qgisProject.fileName || ""));
  }

  // Registre dans les réglages de QField (QfSettings, contexte « settings ») ; sync après
  // chaque écriture pour qu'un redémarrage brutal ne perde rien.
  readonly property var reglages: ({
    value: function (cle, defaut) { return settings.value(cle, defaut); },
    setValue: function (cle, valeur) { settings.setValue(cle, valeur); settings.sync(); }
  })

  // -------------------------------------------------------------- couches sur la carte

  // Couche du projet marquée (zip, couche) par Vision, ou null.
  function coucheMarquee(zip, nom) {
    if (!qgisProject) return null;
    const couches = ProjectUtils.mapLayers(qgisProject);
    for (const id in couches) {
      const l = couches[id];
      if (!l || typeof l.customProperty !== "function") continue;
      if (String(l.customProperty("vision/zip", "")) === zip && String(l.customProperty("vision/couche", "")) === nom) return l;
    }
    return null;
  }

  // chargerCouche(source, nom) du contrat : charge la couche par GDAL, la marque et l'ajoute
  // à la carte si elle est valide ; une couche déjà présente (même marque) est rendue telle
  // quelle (pas de double chargement). La logique pose readOnly ensuite.
  function chargeur() {
    const dossier = Logique.dossierCopies(dossierProjet());
    return function (source, nom, zipDeLaCopie) {
      // Mission 048 : le fond embarqué n'est pas une couche du zip (ni zip ni registre) ; marque propre, lecture seule par nature.
      if (Logique.estSourceFondEmbarque(source)) {
        const fond = LayerUtils.loadRasterLayer(source, nom);
        if (fond && fond.isValid) {
          fond.setCustomProperty("vision/fond", "embarque");
          ProjectUtils.addMapLayer(qgisProject, fond);
          return fond;
        }
        // Couche invalide : loadRasterLayer la rend en CppOwnership (QField v4.3.7 qflayerutils.cpp l. 624), personne ne la libérera.
        if (fond) fond.deleteLater();
        return null;
      }
      // Copie GeoPackage (ADR 0008) : le zip est donné ; couche en /vsizip/ : il se lit dans la source.
      const zip = zipDeLaCopie ? String(zipDeLaCopie) : Logique.zipDeLaSource(source, dossier);
      const deja = coucheMarquee(zip, nom);
      // Mission 049 : une couche déjà au projet n'est rendue que valide ; invalide -> null (même résultat visible : « illisible »),
      // et la logique ne libère jamais une couche du projet (coucheDuProjet).
      if (deja) return deja.isValid ? deja : null;
      // Mission 024 : un GeoTIFF (chemin_vsi en .tif ou .tiff) se recharge en raster.
      const couche = Logique.estSourceRaster(source) ? LayerUtils.loadRasterLayer(source, nom) : LayerUtils.loadVectorLayer(source, nom);
      if (couche && couche.isValid) {
        couche.setCustomProperty("vision/zip", zip);
        couche.setCustomProperty("vision/couche", nom);
        ProjectUtils.addMapLayer(qgisProject, couche);
      }
      return couche;
    };
  }

  // Mission 048 : une couche du projet porte déjà la marque vision/fond=embarque. Seule la marque compte sur l'appareil :
  // source() n'est ni Q_PROPERTY ni Q_INVOKABLE (QGIS 3a92eb3 qgsmaplayer.h l. 606), « l.source » vaut undefined en QML.
  function fondDejaPresent() {
    if (!qgisProject) return false;
    const couches = ProjectUtils.mapLayers(qgisProject);
    for (const id in couches) {
      const l = couches[id];
      if (!l) continue;
      try {
        if (typeof l.customProperty === "function" && String(l.customProperty("vision/fond", "")) === "embarque") return true;
      } catch (e) { /* couche sans source lisible */ }
    }
    return false;
  }

  // Styles du manuel (mission 010). Ce que Vision.qml sait dire à la logique : la géométrie et les
  // champs d'une couche (QgsVectorLayer.geometryType() est Q_INVOKABLE, QgsFields expose « names »)
  // et la lecture d'un fichier du zip (null si impossible). La POSE du style passe par un .qml écrit
  // à côté de la copie, avant son chargement (ADR 0008) : voir reecrireCouche et ecrireFichier.
  function infosCouche(couche) {
    let noms = [];
    try {
      noms = couche.fields.names;
    } catch (e) {
      noms = [];
    }
    let geometrie = null;
    try {
      geometrie = Styles.geometrieDe(couche.geometryType());
    } catch (e) {
      geometrie = null;
    }
    return { geometrie: geometrie, champs: noms };
  }

  function lireTexte(zip, chemin) {
    try {
      const octets = Logique.octetsDe(FileUtils.readFileContent("/vsizip/" + Logique.cheminCopie(dossierProjet(), zip) + "/" + chemin));
      return octets.length === 0 ? null : Logique.texteDe(octets);
    } catch (e) {
      return null;
    }
  }

  // ---- ADR 0008, prouvé sur le Samsung par le prototype n° 3 (fiche 027).
  // Réécrit la couche ouverte (/vsizip/) en GeoPackage ; rend le chemin écrit, ou "" si QField a
  // refusé (échec muet : la raison n'est que dans le journal de QField). saveVectorLayerAs crée les
  // dossiers et écrase sans contrôle de chemin : la garde est dans la logique (peutEcrireCopie).
  function reecrireCouche(couche, cible) {
    return String(LayerUtils.saveVectorLayerAs(couche, cible, "GPKG") || "");
  }

  // Écrit un texte en UTF-8 (le .qml), le relit pour comparer la taille. true si écrit.
  function ecrireFichier(chemin, texte) {
    const octets = Logique.octetsUtf8(texte);
    FileUtils.writeFileContent(chemin, Logique.arrayBufferExact(octets));
    return Logique.octetsDe(FileUtils.readFileContent(chemin)).length === octets.length;
  }

  function effacerFichier(chemin) {
    return !!platformUtilities.rmFile(chemin);
  }

  // ---- Mission 012 : ouvrir, contrôler, puis seulement ajouter (spec § 4).
  // NON PROUVÉ (aucun accès aux sources de QField pour la mission 012) : chaque appel marqué
  // « à vérifier » ci-dessous est à confirmer sur le Samsung ; un appel absent ou en erreur
  // donne un REFUS de la couche (jamais « contrôle sauté »).

  // Ouvre la couche sans l'ajouter au projet. Mission 024 : un GeoTIFF (format « tif ») s'ouvre par
  // LayerUtils.loadRasterLayer (QField v4.3.7, src/core/utils/qflayerutils.h l. 208 ; qflayerutils.cpp l. 622-627 :
  // new QgsRasterLayer(uri, name, "gdal")), en /vsizip/ (ADR 0008) ; le reste par loadVectorLayer (l. 200).
  function ouvrirCouche(source, nom, format) {
    if (format === "tif") return LayerUtils.loadRasterLayer(source, nom);
    return LayerUtils.loadVectorLayer(source, nom);
  }

  // Mission 049 : libère une couche ouverte par LayerUtils.loadVectorLayer / loadRasterLayer et non ajoutée à la carte.
  // QField v4.3.7 (qflayerutils.cpp l. 618 et 624) la rend en CppOwnership : sans deleteLater, personne ne la détruit.
  // La logique ne l'appelle jamais sur une couche ajoutée au projet, ni deux fois sur la même.
  // Mission 049 : vrai si la couche porte la marque Vision, donc appartient au projet (ajoutée par le chargeur) : jamais libérée.
  function coucheDuProjet(couche) {
    return !!couche && typeof couche.customProperty === "function" && String(couche.customProperty("vision/zip", "")) !== "";
  }

  function libererCouche(couche) {
    couche.deleteLater();
  }

  // Mission 024 : tables vecteur d'un GeoPackage du zip (voie 1 du prototype n° 4, NON PROUVÉE sur le Samsung).
  // Rend la liste des tables, [] si aucune, null si illisibles (la logique refuse alors « tables illisibles »).
  // Appels lus dans les sources : LayerUtils.loadVectorLayer (qflayerutils.h l. 200), createFeatureIterator (l. 234),
  // hasNext, next, close (l. 52-75) ; QgsFeature::attribute(QString) Q_INVOKABLE (QGIS 3a92eb3,
  // src/core/qgsfeature.h l. 1080) ; isValid Q_PROPERTY de QgsMapLayer (qgsmaplayer.h l. 94) ; deleteLater, slot de
  // QObject (la couche est en CppOwnership, qflayerutils.cpp l. 618 : sans cela elle resterait en mémoire).
  function tablesGpkg(source) {
    const r = Logique.tablesDuGpkg(source, {
      ouvrir: function (uri, nom) { return LayerUtils.loadVectorLayer(uri, nom); },
      creerIterateur: function (l) { return LayerUtils.createFeatureIterator(l); },
      liberer: function (l) { l.deleteLater(); }
    });
    if (r.etat === "liste") return r.tables;
    if (r.etat === "aucune") return [];
    return null;
  }

  // Mission 047 : style enregistré dans la table layer_styles d'un GeoPackage du zip, pour une table (voie 1 du
  // prototype n° 4 : même mécanique que tablesGpkg, NON PROUVÉE sur le Samsung). Rend { etat, texte } de
  // Logique.styleDuGpkg : « lu », « illisible » ou « absent » (la règle du manuel s'applique alors). Mêmes appels que
  // tablesGpkg ; le champ styleQML est une chaîne sans limite de largeur (QGIS 3a92eb3, src/core/qgsogrutils.cpp
  // l. 3141-3143 : OFTString sans OGR_Fld_SetWidth) lue par QgsFeature::attribute(QString).
  function styleGpkg(source, table) {
    return Logique.styleDuGpkg(source, table, {
      ouvrir: function (uri, nom) { return LayerUtils.loadVectorLayer(uri, nom); },
      creerIterateur: function (l) { return LayerUtils.createFeatureIterator(l); },
      liberer: function (l) { l.deleteLater(); }
    });
  }

  // Ajoute à la carte une couche acceptée, marquée (zip, couche). `zipDonne` : le zip de la copie
  // GeoPackage (ADR 0008) ; à défaut il se lit dans une source /vsizip/.
  function ajouterALaCarte(couche, nom, source, zipDonne) {
    const zip = zipDonne ? String(zipDonne) : Logique.zipDeLaSource(source, Logique.dossierCopies(dossierProjet()));
    couche.setCustomProperty("vision/zip", zip);
    couche.setCustomProperty("vision/couche", nom);
    ProjectUtils.addMapLayer(qgisProject, couche);
  }

  // Lectures de la couche pour les contrôles ; chaque lecture est protégée (échec = valeur
  // « mauvaise », donc refus). Comptage par itérateur (mission 038) : featureCount() n'est pas invocable.
  function decrireCouche(couche, format) {
    let lisible = false;
    let systeme = { valide: false, epsg: 0 };
    let nbEntites = -1;
    let emprise = null;
    try { lisible = !!(couche && couche.isValid); } catch (e) { lisible = false; }
    try {
      // QML ne voit de crs que mapUnits, isGeographic, authid, description (mission 034) : la règle est dans
      // Logique.decrireSysteme. L'objet crs est passé tel quel à la reprojection.
      systeme = Logique.decrireSysteme(couche.crs);
    } catch (e) { /* système inconnu */ }
    if (format !== "tif") {
      // Un raster n'a pas d'entités (jamais « vide ») ; pour un vecteur, un itérateur qui échoue = illisible (contrôle 2).
      const c = Logique.compterEntites(couche, function (l) { return LayerUtils.createFeatureIterator(l); });
      nbEntites = c.nbEntites;
      if (!c.lisible) lisible = false;
    }
    try {
      emprise = Logique.lireEmprise(couche);
    } catch (e) { emprise = null; }
    return { lisible: lisible, systeme: systeme, nbEntites: nbEntites, emprise: emprise };
  }

  // Reprojette un point (x, y) du système source `crs` (construit par construireSource) vers EPSG:2154. À vérifier dans QField v4.3.7 :
  // GeometryUtils.reprojectPoint et CoordinateReferenceSystemUtils.fromDescription. Si l'API
  // manque, on lève : toute erreur de reprojection vaut refus (spec § 4), aucun contournement.
  function reprojeterPoint(x, y, epsg, crs) {
    const source = crs;
    const but = CoordinateReferenceSystemUtils.fromDescription("EPSG:2154");
    const p = GeometryUtils.reprojectPoint(GeometryUtils.point(x, y), source, but);
    // QField 4.3.7 ne lève rien sur échec : il rend un QgsPoint() vide, dont x et y valent NaN (QGIS 3a92eb3,
    // src/core/geometry/qgspoint.h l. 89-91). isEmpty() n'est pas exposé à QML (qgspoint.h l. 633 : ni Q_INVOKABLE ni
    // Q_PROPERTY ; seuls x, y, z, m le sont, l. 56-59) : c'est le test de finitude qui refuse le point vide.
    // Source déjà en 2154 : l'entrée est rendue telle quelle (finie), donc acceptée.
    const px = p ? Number(p.x) : NaN;
    const py = p ? Number(p.y) : NaN;
    if (!isFinite(px) || !isFinite(py)) throw new Error("reprojection : point vide");
    return { x: px, y: py };
  }

  function controlerCouche(description) {
    return Controles.controlerAvecDetail(description, {
      reprojeter: function (emprise, epsg, crs, authid) {
        // Système source reconstruit par son nom (fromDescription), repli : l'objet de la couche (mission 037).
        const s = Controles.construireSource(authid, crs, function (d) { return CoordinateReferenceSystemUtils.fromDescription(d); });
        return Controles.reprojeterEmprise(emprise, epsg, reprojeterPoint, s.source);
      }
    });
  }

  function retirerDeLaCarte(zip, nom) {
    const l = coucheMarquee(zip, nom);
    if (l) ProjectUtils.removeMapLayer(qgisProject, String(l.id));
  }

  function retirerLeZipDeLaCarte(zip) {
    if (!qgisProject) return;
    const couches = ProjectUtils.mapLayers(qgisProject);
    const ids = [];
    for (const id in couches) {
      const l = couches[id];
      if (l && typeof l.customProperty === "function" && String(l.customProperty("vision/zip", "")) === zip) ids.push(String(l.id));
    }
    for (let i = 0; i < ids.length; i++) ProjectUtils.removeMapLayer(qgisProject, ids[i]);
  }

  // -------------------------------------------------------------- taille d'une copie

  // Par LocalFilesModel (sans contrôle de dossier ; motif du prototype). -1 si inconnue.
  function tailleFichier(chemin) {
    try {
      fichiers.currentPath = Logique.dossierDe(chemin);
      const nom = Logique.nomDeFichier(chemin);
      const n = fichiers.rowCount();
      for (let i = 0; i < n; i++) {
        const element = fichiers.get(i);
        if (Logique.nomDeFichier(String(element.path)) === nom) return Number(element.size);
      }
    } catch (e) {
      return -1;
    }
    return -1;
  }

  LocalFilesModel {
    id: fichiers
  }

  // -------------------------------------------------------------- gestes

  // Geste 2 : ouverture du projet. Rend le résultat de demarrerProjet.
  function demarrer() {
    const id = visionId();
    const r = Logique.demarrerProjet({
      variables: variables(),
      reglages: reglages,
      dossierProjet: dossierProjet(),
      existe: function (chemin) { return FileUtils.fileExists(chemin); },
      fondDejaPresent: fondDejaPresent,
      libererCouche: libererCouche,
      coucheDuProjet: coucheDuProjet,
      chargerCouche: id ? chargeur() : function () { return null; }
    });
    registreChange();
    return r;
  }

  // Gestes 3 et 4 : sélecteur Android, copie dans <dossier du projet>/vision-imports/.
  function ajouterZip() {
    const id = visionId();
    if (!id) {
      message("Projet non Vision (vision_id absent ou invalide) : rien n'est importé.");
      return;
    }
    const dossier = Logique.dossierCopies(dossierProjet());
    if (dossier === "") {
      message("Dossier du projet inconnu : rien n'est importé.");
      return;
    }
    // Garde : la copie doit être lisible par le plugin, donc dans le dossier du projet aux
    // yeux de QField (readFileContent, qffileutils.cpp L620-628), avant même de copier.
    if (!FileUtils.isWithinProjectDirectory(dossier + "/essai.zip")) {
      message("QField ne tient pas " + dossier + " pour le dossier du projet : rien n'est copié (version de QField "
        + (versionQField() || "inconnue") + ").");
      return;
    }
    prefixeEnCours = dossier + "/";
    platformUtilities.requestStoragePermission();
    source = platformUtilities.getFile(prefixeEnCours, "{filename}", "*/*", vision);
  }

  // Geste 5 : la copie est arrivée (QField l'annonce même si elle a échoué : on vérifie).
  function zipRecu(recu) {
    const id = visionId();
    if (!id) return;
    // Le dossier où la copie a été demandée (et non celui d'un projet ouvert entre-temps).
    const dossier = Logique.dossierDe(prefixeEnCours + "x");
    if (dossier !== Logique.dossierCopies(dossierProjet())) {
      message("Le projet a changé pendant le choix du zip : rien n'est importé.");
      return;
    }
    if (!recu) {
      message("Aucun zip choisi.");
      return;
    }
    const nom = String(recu);
    const chemin = dossier + "/" + nom;
    if (!Logique.estNomDeZip(nom)) {
      const e = Logique.effacerCopie(platformUtilities, chemin, dossier);
      message("« " + nom + " » n'est pas un zip : rien n'est importé. " + e.message);
      return;
    }
    if (!FileUtils.fileExists(chemin)) {
      message(nom + " : la copie a échoué (fichier absent après le choix) ; rien n'est importé.");
      return;
    }
    const taille = tailleFichier(chemin);
    if (!Logique.listageSur(taille)) {
      let texte = Logique.messageListageRefuse(nom, taille);
      if (!Logique.zipUtilise(reglages, id, nom)) texte += "\n" + Logique.effacerCopie(platformUtilities, chemin, dossier).message;
      message(texte);
      return;
    }
    const octets = Logique.octetsDe(FileUtils.readFileContent(chemin));
    if (octets.length === 0 && taille > 0) {
      message(Logique.messageLectureRefusee(nom, versionQField(), FileUtils.isWithinProjectDirectory(chemin)));
      return;
    }
    // Zip réimporté sous le même nom : ses couches sont retirées de la carte (par importerZip,
    // une fois sûr qu'au moins une couche est lisible) puis rechargées.
    const r = Logique.importerZip({
      visionId: id,
      dossierProjet: dossierProjet(),
      nomZip: nom,
      octets: octets,
      reglages: reglages,
      styles: Styles,
      bibliotheque: Bibliotheque.BIBLIOTHEQUE,
      infosCouche: infosCouche,
      lireTexte: lireTexte,
      reecrireCouche: reecrireCouche,
      ecrireFichier: ecrireFichier,
      effacerFichier: effacerFichier,
      existe: function (chemin) { return FileUtils.fileExists(chemin); },
      ouvrirCouche: ouvrirCouche,
      libererCouche: libererCouche,
      coucheDuProjet: coucheDuProjet,
      tablesGpkg: tablesGpkg,
      styleGpkg: styleGpkg,
      retirerLeZipDeLaCarte: function (zip) { vision.retirerLeZipDeLaCarte(zip); },
      decrireCouche: decrireCouche,
      controlerCouche: controlerCouche,
      ajouterALaCarte: ajouterALaCarte,
      maintenant: function () { return new Date(); }
    });
    let texte = r.message;
    if (r.chargees.length === 0 && !Logique.zipUtilise(reglages, id, nom)) {
      texte += "\n" + Logique.effacerCopie(platformUtilities, chemin, dossier).message;
    }
    message(texte);
    registreChange();
  }

  Connections {
    target: vision.source
    ignoreUnknownSignals: true
    function onResourceReceived(path) {
      vision.zipRecu(path);
    }
  }

  // Geste 7 : retirer une couche (carte, registre, copie si plus aucune couche ne s'en sert).
  function retirer(zip, couche) {
    const r = Logique.retirerCouche({
      visionId: visionId(),
      dossierProjet: dossierProjet(),
      zip: zip,
      couche: couche,
      reglages: reglages,
      retirerDeLaCarte: function (nom) { vision.retirerDeLaCarte(zip, nom); },
      existe: function (chemin) { return FileUtils.fileExists(chemin); },
      effacerFichier: effacerFichier,
      platformUtilities: platformUtilities
    });
    message(r.message);
    registreChange();
  }

  // Couches du registre, pour le panneau.
  function couchesInscrites() {
    const id = visionId();
    return id ? Logique.lireRegistre(reglages, id) : [];
  }

  // ==== sonde 053 : début (outil d'essai, mission 053, étape 1 bis, temps 2 ; docs/referentiels/cache-zone-qfield.md § 8)
  // Mesure sur l'appareil, sans toucher au registre, sans rien ajouter à la carte ni rien effacer : écrit
  // seulement dans vision-imports/_sonde-053/ (fichier d'essai, GML reçus, GeoPackage d'essai, rapport.txt).
  // Appels lus dans QField v4.3.7 : iface.createHttpRequest (qfappinterface.h l. 230 ; qfxmlhttprequest.h l. 62-212),
  // iface.mapCanvas().mapSettings.visibleExtent et destinationCrs (qfappinterface.h l. 214 ; qgsquickmapsettings.h
  // l. 72, l. 109), LayerUtils.loadVectorLayer avec fournisseur (qflayerutils.h l. 200), saveVectorLayerAs avec filtre
  // (l. 254). Textes provisoires : la sonde est un outil d'essai.
  property string sondeTexte: ""
  property bool sondeEnCours: false
  property var sondeLignes: []

  function sondeNoter(ligne) {
    sondeLignes.push(String(ligne));
    sondeTexte = sondeLignes.join("\n");
  }

  function sondeDebut(titre) {
    sondeLignes = [];
    sondeTexte = "";
    sondeNoter("Sonde ONF (" + Logique.SONDE_ONF.version + ", outil d'essai) : " + titre);
    sondeNoter("Date : " + new Date().toISOString() + " ; Vision " + versionPlugin + " ; QField " + (versionQField() || "version inconnue"));
  }

  function sondeFin(dossier) {
    sondeNoter("Fin de la sonde.");
    let ecrit = false;
    try { ecrit = ecrireFichier(dossier + "/rapport.txt", sondeTexte + "\n"); } catch (e) { ecrit = false; }
    sondeNoter(ecrit ? "Compte rendu écrit : " + dossier + "/rapport.txt" : "Compte rendu NON écrit dans " + dossier + "/rapport.txt");
    sondeEnCours = false;
    message("Sonde ONF terminée (voir le panneau).");
  }

  // Emprise visible de la carte, en EPSG:2154 ; reprojetée par ses quatre coins si la carte est dans un autre système.
  function sondeEmpriseCarte() {
    const ms = iface.mapCanvas().mapSettings;
    const r = ms.visibleExtent;
    const authid = String(ms.destinationCrs.authid || "");
    let e = { xmin: Number(r.xMinimum), ymin: Number(r.yMinimum), xmax: Number(r.xMaximum), ymax: Number(r.yMaximum) };
    sondeNoter("Carte : système " + (authid || "inconnu") + ", rotation " + Number(ms.rotation) + "°, emprise visible "
      + [e.xmin, e.ymin, e.xmax, e.ymax].map(function (v) { return Math.round(v); }).join(", "));
    if (Number(ms.rotation) !== 0) sondeNoter("Carte tournée : l'emprise lue peut ne pas couvrir tout l'écran.");
    if (authid !== "EPSG:2154") {
      const but = CoordinateReferenceSystemUtils.fromDescription("EPSG:2154");
      const coins = [[e.xmin, e.ymin], [e.xmax, e.ymin], [e.xmax, e.ymax], [e.xmin, e.ymax]].map(function (c) {
        const p = GeometryUtils.reprojectPoint(GeometryUtils.point(c[0], c[1]), ms.destinationCrs, but);
        return { x: Number(p.x), y: Number(p.y) };
      });
      e = Logique.sondeEmpriseDesPoints(coins);
    }
    return e;
  }

  // Ouvre un GML (pilote OGR GML de GDAL), le décrit, le réécrit en GeoPackage d'essai puis relit ce GeoPackage.
  // Rend true si le GML s'est ouvert. `attendu` : valeurs attendues (fichier d'essai) ou null.
  function sondeOuvrirGml(dossier, chemin, nom, champLibelle, attendu) {
    let c = null;
    try { c = LayerUtils.loadVectorLayer(chemin, nom); } catch (e) { c = null; }
    if (!c || !c.isValid) {
      sondeNoter("  " + nom + " : ouverture du GML ÉCHOUÉE (pilote GML absent, ou fichier illisible)");
      if (c) c.deleteLater();
      return false;
    }
    let champs = [];
    try { champs = c.fields.names; } catch (e) { champs = []; }
    let authid = "";
    try { authid = String(c.crs.authid || ""); } catch (e) { authid = ""; }
    let n = 0;
    const valeurs = [];
    try {
      const it = LayerUtils.createFeatureIterator(c);
      while (it.hasNext()) {
        const f = it.next();
        if (n < 3) valeurs.push(String(f.attribute(champLibelle)));
        n++;
      }
      it.close();
    } catch (e) {
      sondeNoter("  " + nom + " : lecture des objets interrompue (" + e + ")");
    }
    sondeNoter("  " + nom + " : GML ouvert, valide, " + n + " objets, système " + (authid || "inconnu") + ", champs : " + champs.join(", "));
    sondeNoter("  " + nom + " : " + champLibelle + " lus : " + valeurs.join(" | "));
    if (attendu) {
      let justes = 0;
      for (let i = 0; i < attendu.length; i++) if (valeurs[i] === attendu[i].llib_frt) justes++;
      sondeNoter("  " + nom + " : accents " + (justes === attendu.length && n === attendu.length ? "JUSTES" : "FAUX") + " (" + justes + "/" + attendu.length + ")");
    }
    // GeoPackage d'essai, nom horodaté (aucun fichier encore ouvert n'est écrasé) ; table = nom du fichier (qflayerutils.cpp l. 705).
    const base = nom + "-" + Date.now();
    const ecrit = String(LayerUtils.saveVectorLayerAs(c, dossier + "/" + base + ".gpkg", "GPKG") || "");
    c.deleteLater();
    if (ecrit === "") {
      sondeNoter("  " + nom + " : réécriture en GeoPackage REFUSÉE (raison dans le journal de QField)");
      return true;
    }
    let g = null;
    let m = -1;
    try {
      g = LayerUtils.loadVectorLayer(ecrit + "|layername=" + base, base);
      if (g && g.isValid) {
        m = 0;
        const it2 = LayerUtils.createFeatureIterator(g);
        while (it2.hasNext()) { it2.next(); m++; }
        it2.close();
      }
    } catch (e) { m = -1; }
    if (g) g.deleteLater();
    sondeNoter("  " + nom + " : GeoPackage " + ecrit + " : " + (m < 0 ? "illisible" : m + " objets relus") + (m >= 0 && m !== n ? " (ÉCART avec le GML)" : ""));
    return true;
  }

  // Voie A : couche WFS de QGIS, réécrite par saveVectorLayerAs avec un filtre d'emprise. L'écran se fige pendant le téléchargement.
  function sondeVoieA(dossier, couche, emprise) {
    sondeNoter("  " + couche + " : voie A (couche WFS de QGIS ; écran figé pendant le téléchargement)");
    const t0 = Date.now();
    let l = null;
    try { l = LayerUtils.loadVectorLayer(Logique.sondeUriWfs(couche), couche, "WFS"); } catch (e) { l = null; }
    if (!l || !l.isValid) {
      sondeNoter("  " + couche + " : voie A, couche WFS invalide (" + (Date.now() - t0) + " ms)");
      if (l) l.deleteLater();
      return;
    }
    const base = couche + "-voieA-" + Date.now();
    const ecrit = String(LayerUtils.saveVectorLayerAs(l, dossier + "/" + base + ".gpkg", "GPKG", Logique.sondeExpressionEmprise(emprise)) || "");
    l.deleteLater();
    let m = -1;
    if (ecrit !== "") {
      let g = null;
      try {
        g = LayerUtils.loadVectorLayer(ecrit + "|layername=" + base, base);
        if (g && g.isValid) {
          m = 0;
          const it = LayerUtils.createFeatureIterator(g);
          while (it.hasNext()) { it.next(); m++; }
          it.close();
        }
      } catch (e) { m = -1; }
      if (g) g.deleteLater();
    }
    sondeNoter("  " + couche + " : voie A, " + (ecrit === "" ? "écriture REFUSÉE" : ecrit + " : " + (m < 0 ? "illisible" : m + " objets")) + ", " + ((Date.now() - t0) / 1000).toFixed(1) + " s");
  }

  function sondeFichierEssai(dossier) {
    const chemin = dossier + "/fixture.gml";
    let ok = false;
    try { ok = ecrireFichier(chemin, Logique.sondeFixtureGml()); } catch (e) { ok = false; }
    sondeNoter("Fichier d'essai (2 forêts fictives, accents) : " + (ok ? "écrit" : "NON écrit") + " dans " + chemin);
    if (ok) sondeOuvrirGml(dossier, chemin, "FOR_PUBL_FR", "llib_frt", Logique.SONDE_FIXTURE_ATTENDU);
  }

  // Une couche, puis la suivante (requêtes l'une après l'autre).
  function sondeCouche(i, emprise, dossier) {
    const couches = Logique.SONDE_ONF.couches;
    if (i >= couches.length) { sondeFin(dossier); return; }
    const couche = couches[i];
    const url = Logique.sondeUrlGetFeature(couche, emprise);
    sondeNoter("Requête " + couche + " : " + url);
    const t0 = Date.now();
    let fini = false;
    const req = iface.createHttpRequest();
    const suite = function (statut, texte, erreur, longueur) {
      if (fini) return;
      fini = true;
      Qt.callLater(function () { sondeReponse(i, emprise, dossier, couche, statut, texte, erreur, longueur, Date.now() - t0); });
    };
    req.timeout = 120000;
    req.onload = function () { suite(Number(req.status), String(req.responseText || ""), "", String(req.getResponseHeader("Content-Length") || "")); };
    req.onerror = function (code, texte) { suite(Number(req.status), "", "erreur réseau " + code + " : " + texte, ""); };
    req.ontimeout = function () { suite(0, "", "délai dépassé", ""); };
    req.onaborted = function () { suite(0, "", "requête annulée", ""); };
    req.open("GET", url);
    req.send();
  }

  function sondeReponse(i, emprise, dossier, couche, statut, texte, erreur, longueur, dureeMs) {
    const analyse = texte !== "" ? Logique.sondeAnalyserReponse(texte) : null;
    let octets = 0;
    let chemin = "";
    if (texte !== "") {
      const o = Logique.octetsUtf8(texte);
      octets = o.length;
      chemin = dossier + "/" + couche + ".gml";
      if (!FileUtils.writeFileContent(chemin, Logique.arrayBufferExact(o))) chemin = "";
    }
    sondeNoter(Logique.sondeLigneReponse(couche, { statut: statut, octets: octets, dureeMs: dureeMs, erreur: erreur, analyse: analyse })
      + (longueur !== "" ? " (Content-Length " + longueur + ")" : ""));
    let ouvert = false;
    if (chemin !== "" && analyse && analyse.nbObjets > 0) {
      ouvert = sondeOuvrirGml(dossier, chemin, couche, Logique.SONDE_ONF.libelles[couche], null);
    } else if (analyse && analyse.complete && analyse.nbObjets === 0) {
      sondeNoter("  " + couche + " : aucun objet sur cette emprise");
      ouvert = true;
    }
    if (!ouvert && statut === 200) sondeVoieA(dossier, couche, emprise);
    sondeCouche(i + 1, emprise, dossier);
  }

  // Bouton « avec réseau » : mode "carte" (emprise visible) ou "serre" (zone d'essai du massif de la Serre).
  function sonderReseau(mode) {
    if (sondeEnCours) return;
    const dossier = Logique.sondeDossier(dossierProjet());
    sondeDebut(mode === "serre" ? "avec réseau, massif de la Serre (Jura)" : "avec réseau, emprise de la carte");
    if (dossier === "") { sondeNoter("Dossier du projet inconnu : sonde arrêtée."); return; }
    let brute = null;
    if (mode === "serre") {
      brute = Logique.SONDE_ONF.empriseSerre;
    } else {
      try { brute = sondeEmpriseCarte(); } catch (e) { sondeNoter("Carte illisible : " + e); brute = null; }
    }
    const r = Logique.sondeEmprise(brute, Controles.EMPRISE_VRAISEMBLANCE);
    if (r.message) sondeNoter(r.message);
    if (!r.ok) { sondeFin(dossier); return; }
    sondeNoter("Emprise demandée (EPSG:2154, x est, y nord) : " + [r.emprise.xmin, r.emprise.ymin, r.emprise.xmax, r.emprise.ymax].map(function (v) { return Math.round(v); }).join(", "));
    sondeFichierEssai(dossier);
    sondeEnCours = true;
    sondeCouche(0, r.emprise, dossier);
  }

  // Bouton « hors réseau » (mode avion) : le fichier d'essai et les GML déjà reçus, rouverts sans réseau.
  function sonderHorsReseau() {
    if (sondeEnCours) return;
    const dossier = Logique.sondeDossier(dossierProjet());
    sondeDebut("hors réseau, fichiers déjà reçus");
    if (dossier === "") { sondeNoter("Dossier du projet inconnu : sonde arrêtée."); return; }
    sondeFichierEssai(dossier);
    const couches = Logique.SONDE_ONF.couches;
    for (let i = 0; i < couches.length; i++) {
      const chemin = dossier + "/" + couches[i] + ".gml";
      if (FileUtils.fileExists(chemin)) sondeOuvrirGml(dossier, chemin, couches[i], Logique.SONDE_ONF.libelles[couches[i]], null);
      else sondeNoter("  " + couches[i] + " : aucun GML reçu auparavant (" + chemin + ")");
    }
    sondeFin(dossier);
  }
  // ==== sonde 053 : fin
}
