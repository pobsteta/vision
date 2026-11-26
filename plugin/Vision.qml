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
import "vision-styles-onf.mjs" as StylesOnf

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
  // Mission 053 : une couche du cache ONF (marque vision/cache) appartient aussi au projet (forme R2 corrigée, point 2).
  function coucheDuProjet(couche) {
    if (!couche || typeof couche.customProperty !== "function") return false;
    return String(couche.customProperty("vision/zip", "")) !== "" || String(couche.customProperty("vision/cache", "")) !== "";
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
    // Mission 053, étape 3 : les services du cache (dont ceux du groupe « ONF Cache » du projet) servent aussi à l'ouverture :
    // création des GeoPackage absents et migration d'un cache en génération vers actuel/ (Logique.demarrerProjet).
    const r = Logique.demarrerProjet(Object.assign({
      variables: variables(),
      reglages: reglages,
      dossierProjet: dossierProjet(),
      fondDejaPresent: fondDejaPresent,
      libererCouche: libererCouche,
      coucheDuProjet: coucheDuProjet,
      chargerCouche: id ? chargeur() : function () { return null; },
      chargerCache: id ? chargerCache : function () { return null; }
    }, servicesCache()));
    if (r && r.cache && r.cache.notes) {
      for (let i = 0; i < r.cache.notes.length; i++) console.log("Vision, cache ONF : " + r.cache.notes[i]);
      // Dit aussi dans dernier-echec.txt (migration ou reprise manquée, fichier non créé).
      if (r.cache.notes.length > 0) cacheDiagnostic({ etape: "ouverture du projet", message: r.message, contexte: contexteCache(null), details: { notes: r.cache.notes.join(" | ") } });
    }
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

  // Couches des zips du registre, pour le panneau (le cache ONF a sa propre ligne : cacheLigne).
  function couchesInscrites() {
    const id = visionId();
    return id ? Logique.entreesDesZips(Logique.lireRegistre(reglages, id)) : [];
  }

  // ==== cache ONF (mission 053, étape 1 ter ; docs/referentiels/cache-zone-qfield.md, voie B prouvée par la sonde)
  // Avec réseau : GetFeature WFS 1.0.0 + BBOX des trois couches ONF sur l'emprise visible, l'une après l'autre, par
  // iface.createHttpRequest (QField v4.3.7 qfappinterface.h l. 230 ; qfxmlhttprequest.h l. 62-212) ; puis
  // Logique.cacheEnregistrer (GML écrit, .gfs de Vision, GeoPackage, style, contrôles, remplacement tout ou rien).
  // Sans réseau : le cache revient à la réouverture (Logique.demarrerProjet, chargerCache).
  // Libération des couches de travail : impossible en QML (Qt 6.10.3 cache deleteLater ; destroy() refuse une couche en
  // CppOwnership : cache-zone-qfield.md § 10) ; elles ne sont pas libérées, voir Logique.cacheEnregistrer.
  property bool cacheEnCours: false
  readonly property string texteBoutonCache: Logique.TEXTES_CACHE_ONF.bouton
  readonly property string textePendantCache: Logique.TEXTES_CACHE_ONF.pendant

  // Couche du cache ONF déjà sur la carte (marques vision/cache=onf et vision/couche), ou null.
  function coucheDuCache(nomCouche) {
    if (!qgisProject) return null;
    const couches = ProjectUtils.mapLayers(qgisProject);
    for (const id in couches) {
      const l = couches[id];
      if (!l || typeof l.customProperty !== "function") continue;
      // Mode ancien : jamais une couche du groupe du projet (elle n'a pas la marque d'origine du plugin).
      if (String(l.customProperty("vision/origine", "")) !== "plugin") continue;
      if (String(l.customProperty("vision/cache", "")) === "onf" && String(l.customProperty("vision/couche", "")) === nomCouche) return l;
    }
    return null;
  }

  // Mission 053, étape 3 (docs/referentiels/cache-zone-qfield.md § 14.4) : couche du groupe « ONF Cache » de vision.qgz, trouvée par
  // ses marques (vision/cache=onf, vision/couche) ; une couche ajoutée par le plugin (mode ancien, marque vision/origine) n'en est pas
  // une. Valide ou non : la logique juge. Le plugin ne l'ajoute ni ne la retire jamais de la carte (bascule : renommer, recharger).
  function coucheDuGroupe(nomCouche) {
    if (!qgisProject) return null;
    const couches = ProjectUtils.mapLayers(qgisProject);
    for (const id in couches) {
      const l = couches[id];
      if (!l || typeof l.customProperty !== "function") continue;
      if (String(l.customProperty("vision/origine", "")) === "plugin") continue;
      if (String(l.customProperty("vision/cache", "")) === "onf" && String(l.customProperty("vision/couche", "")) === nomCouche) return l;
      // Repli (lecture des propriétés d'une couche CHARGÉE PAR LE PROJET non prouvée sur l'appareil) : l'identifiant que vision.qgz
      // donne à la couche du groupe, « ONF_Cache_<couche>_<empreinte> » (outils/projet-modele.mjs, idCache).
      if (String(l.id).indexOf("ONF_Cache_" + nomCouche + "_") === 0) return l;
    }
    return null;
  }

  // Mode ancien (ancien vision.qgz, sans groupe) : marque la couche du cache et l'ajoute à la carte : ProjectUtils.addMapLayer la
  // met en tête de liste (arbitrage n° 6). « vision/origine » la distingue des couches du projet, que le plugin ne retire jamais.
  function ajouterCache(couche, nomCouche) {
    couche.setCustomProperty("vision/cache", "onf");
    couche.setCustomProperty("vision/couche", nomCouche);
    couche.setCustomProperty("vision/origine", "plugin");
    ProjectUtils.addMapLayer(qgisProject, couche);
  }

  // Réouverture du projet : chargerCache(source, nom affiché, couche du service) ; rend la couche (valide ou non).
  function chargerCache(source, nom, nomCouche) {
    const deja = coucheDuCache(nomCouche);
    if (deja) return deja.isValid ? deja : null;
    const couche = LayerUtils.loadVectorLayer(source, nom);
    if (couche && couche.isValid) ajouterCache(couche, nomCouche);
    return couche;
  }

  // Mode ancien : retire de la carte les couches du cache ONF ajoutées par le plugin (ProjectUtils.removeMapLayer : le projet les
  // détruit), jamais celles du groupe du projet (étape 3).
  function retirerCacheDeLaCarte() {
    if (!qgisProject) return;
    const couches = ProjectUtils.mapLayers(qgisProject);
    const ids = [];
    for (const id in couches) {
      const l = couches[id];
      if (l && typeof l.customProperty === "function" && String(l.customProperty("vision/cache", "")) === "onf"
          && String(l.customProperty("vision/origine", "")) === "plugin") ids.push(String(l.id));
    }
    for (let i = 0; i < ids.length; i++) ProjectUtils.removeMapLayer(qgisProject, ids[i]);
  }

  // Ligne du panneau (« Cache ONF du … »), '' sans cache.
  function cacheLigne() {
    const id = visionId();
    return id ? Logique.cacheLignePanneau(Logique.lireRegistre(reglages, id)) : "";
  }

  // Mission 055 : ligne conditionnelle du rappel (cache ONF absent ou ancien), '' sinon. Aucune lecture du réseau.
  readonly property string texteRappel: Logique.TEXTES_RAPPEL.permanent
  function rappelLigne() {
    const id = visionId();
    return Logique.rappelCacheLigne(id ? Logique.lireRegistre(reglages, id) : [], new Date());
  }

  // Emprise visible en EPSG:2154 : les quatre coins de l'écran (carte tournée), par mapSettings.screenToCoordinate
  // (qgsquickmapsettings.h l. 236, Q_INVOKABLE, coordonnées de l'élément de carte), reprojetés si la carte n'est pas en
  // EPSG:2154 (GeometryUtils.reprojectPoint). Repli : visibleExtent (l. 72). null si illisible.
  function empriseCarteCache() {
    const canvas = iface.mapCanvas();
    const ms = canvas.mapSettings;
    const crs = ms.destinationCrs;
    const enLambert = String(crs.authid || "") === "EPSG:2154";
    const but = CoordinateReferenceSystemUtils.fromDescription("EPSG:2154");
    const vers2154 = function (x, y) {
      if (enLambert) return { x: Number(x), y: Number(y) };
      const p = GeometryUtils.reprojectPoint(GeometryUtils.point(Number(x), Number(y)), crs, but);
      return { x: Number(p.x), y: Number(p.y) };
    };
    try {
      const w = Number(canvas.width);
      const h = Number(canvas.height);
      if (w > 0 && h > 0) {
        const coins = [[0, 0], [w, 0], [w, h], [0, h]].map(function (c) {
          const p = ms.screenToCoordinate(Qt.point(c[0], c[1]));
          return vers2154(p.x, p.y);
        });
        const e = Logique.cacheEmpriseDesPoints(coins);
        if (e) return e;
      }
    } catch (e) { /* repli ci-dessous */ }
    const r = ms.visibleExtent;
    return Logique.cacheEmpriseDesPoints([vers2154(r.xMinimum, r.yMinimum), vers2154(r.xMaximum, r.yMinimum),
      vers2154(r.xMaximum, r.yMaximum), vers2154(r.xMinimum, r.yMaximum)]);
  }

  // Bouton « Mettre en cache les couches ONF de cette zone ».
  // Diagnostic de tout échec du cache (aller-retour 2/3, essai n° 1 sur le Samsung) : écrit dans
  // vision-imports/_cache-onf/dernier-echec.txt (écrasé à chaque échec) et dans le journal de QField (console.log).
  // d = { etape, couche, raison, exception, message, contexte, details } (Logique.cacheTexteDiagnostic). Ne lève jamais ;
  // le texte affiché reste celui de la logique (textes validés).
  function cacheDiagnostic(d) {
    try {
      const x = d || {};
      x.date = new Date();
      x.vision = versionPlugin;
      x.qfield = versionQField();
      const texte = Logique.cacheTexteDiagnostic(x);
      console.log(texte);
      const chemin = Logique.cacheCheminDiagnostic(dossierProjet());
      if (chemin !== "" && !ecrireFichier(chemin, texte)) console.log("Vision, cache ONF : diagnostic non écrit dans " + chemin);
    } catch (e) {
      try { console.log("Vision, cache ONF : diagnostic impossible : " + e); } catch (x2) { /* rien */ }
    }
  }

  function contexteCache(prep) {
    return {
      visionId: visionId(), dossierProjet: dossierProjet(),
      horodatage: prep ? prep.horodatage : "", emprise: prep ? prep.emprise : null,
      depart: prep ? { visionId: prep.visionId, dossierProjet: prep.dossierProjet } : null
    };
  }

  function mettreEnCacheOnf() {
    if (cacheEnCours) return;
    let prep = null;
    try {
      let emprise = null;
      let erreurEmprise = "";
      try { emprise = empriseCarteCache(); } catch (e) { emprise = null; erreurEmprise = Logique.texteException(e); }
      prep = Logique.cachePreparer({
        visionId: visionId(), dossierProjet: dossierProjet(), emprise: emprise,
        vraisemblance: Controles.EMPRISE_VRAISEMBLANCE, maintenant: function () { return new Date(); }
      });
      if (!prep.ok) {
        cacheDiagnostic({ etape: "préparation", message: prep.message, exception: erreurEmprise,
          contexte: { visionId: visionId(), dossierProjet: dossierProjet(), emprise: emprise } });
        message(prep.message);
        return;
      }
    } catch (e) {
      cacheDiagnostic({ etape: "préparation (exception)", message: Logique.TEXTES_CACHE_ONF.echecLocal, exception: Logique.texteException(e), contexte: contexteCache(prep) });
      message(Logique.TEXTES_CACHE_ONF.echecLocal);
      return;
    }
    cacheEnCours = true;
    message(textePendantCache);
    cacheRequete(0, prep, {});
  }

  function cacheFin(texte) {
    cacheEnCours = false;
    message(texte);
    registreChange();
  }

  // Une couche, puis la suivante ; toute exception termine proprement (cacheEnCours revient à faux, rien n'est inscrit).
  function cacheRequete(i, prep, reponses) {
    const couches = Logique.CACHE_ONF.couches;
    let etape = "requête " + (i + 1);
    try {
      if (i >= couches.length) {
        etape = "enregistrement";
        const r = cacheEnregistrer(prep, reponses);
        if (!r.ok) cacheDiagnostic({ etape: r.etape, raison: r.raison, message: r.message, contexte: contexteCache(prep), details: r.details });
        cacheFin(r.message);
        return;
      }
      const couche = couches[i].couche;
      const url = Logique.cacheUrlGetFeature(couche, prep.emprise);
      let fini = false;
      const req = iface.createHttpRequest();
      const suite = function (statut, texte, erreur) {
        if (fini) return;
        fini = true;
        Qt.callLater(function () { cacheReponse(i, prep, reponses, couche, { statut: statut, texte: texte, erreur: erreur, url: url }); });
      };
      req.timeout = 120000;
      req.onload = function () { suite(Number(req.status), String(req.responseText || ""), ""); };
      req.onerror = function (code, texte) { suite(Number(req.status), "", "erreur réseau " + code + " : " + texte); };
      req.ontimeout = function () { suite(0, "", "délai dépassé"); };
      req.onaborted = function () { suite(0, "", "requête annulée"); };
      req.open("GET", url);
      req.send();
    } catch (e) {
      cacheDiagnostic({ etape: etape + " (exception)", couche: i < couches.length ? couches[i].couche : "", message: Logique.TEXTES_CACHE_ONF.echecLocal,
        exception: Logique.texteException(e), contexte: contexteCache(prep) });
      cacheFin(Logique.TEXTES_CACHE_ONF.echecLocal);
    }
  }

  function cacheReponse(i, prep, reponses, couche, r) {
    try {
      const j = Logique.cacheJugerReponse(couche, r);
      if (!j.ok) {
        cacheDiagnostic({ etape: "réponse jugée : " + j.refus, couche: couche, message: j.message, contexte: contexteCache(prep),
          details: { url: r.url, statut: r.statut, erreur: r.erreur, nbObjets: j.nbObjets, longueur: String(r.texte || "").length,
            analyse: Logique.cacheAnalyserReponse(r.texte), extrait: Logique.extraitReponse(r.texte, 300) } });
        cacheFin(j.message);
        return;
      }
      reponses[couche] = { texte: r.texte, nbObjets: j.nbObjets };
    } catch (e) {
      cacheDiagnostic({ etape: "réponse (exception)", couche: couche, message: Logique.TEXTES_CACHE_ONF.echecLocal,
        exception: Logique.texteException(e), contexte: contexteCache(prep) });
      cacheFin(Logique.TEXTES_CACHE_ONF.echecLocal);
      return;
    }
    cacheRequete(i + 1, prep, reponses);
  }

  // Services communs à l'ouverture du projet et à l'enregistrement du cache (Logique.demarrerProjet, Logique.cacheEnregistrer).
  // Mode groupe : renommer (platformUtilities.renameFile, QField qfplatformutilities.h l. 132 ; « overwrite » vrai comme à l'essai C4
  // du 25 novembre 2026 sur le Samsung, pièce § 14 bis ; la logique ne renomme jamais vers un fichier existant), recharger
  // (QgsMapLayer::reload, Q_INVOKABLE, puis triggerRepaint, slot : qgsmaplayer.h l. 556 et 1934), coucheDuGroupe.
  // Mode ancien : retirerCacheDeLaCarte, ajouterCache.
  function servicesCache() {
    return {
      ecrireFichier: ecrireFichier,
      effacerFichier: effacerFichier,
      existe: function (chemin) { return FileUtils.fileExists(chemin); },
      ouvrirCouche: function (uri, nom) { return LayerUtils.loadVectorLayer(uri, nom); },
      creerIterateur: function (l) { return LayerUtils.createFeatureIterator(l); },
      // QgsMapLayer::crs : Q_PROPERTY en écriture (QGIS 3a92eb3 qgsmaplayer.h l. 90) ; saveVectorLayerAs l'écrit dans le GeoPackage
      // (QField qflayerutils.cpp l. 712 : layer->crs()).
      imposerSysteme: function (l) { l.crs = CoordinateReferenceSystemUtils.fromDescription("EPSG:2154"); },
      reecrireCouche: reecrireCouche,
      vraisemblance: Controles.EMPRISE_VRAISEMBLANCE,
      maintenant: function () { return new Date(); },
      coucheDuGroupe: coucheDuGroupe,
      renommer: function (de, vers) { return !!platformUtilities.renameFile(de, vers, true); },
      recharger: function (l) { l.reload(); l.triggerRepaint(); },
      retirerCacheDeLaCarte: retirerCacheDeLaCarte,
      ajouterCache: ajouterCache
    };
  }

  function cacheEnregistrer(prep, reponses) {
    return Logique.cacheEnregistrer(Object.assign({
      visionId: visionId(),
      dossierProjet: dossierProjet(),
      reglages: reglages,
      horodatage: prep.horodatage,
      date: prep.date,
      // Garde : le projet ouvert doit être celui du bouton (comme zipRecu).
      depart: { visionId: prep.visionId, dossierProjet: prep.dossierProjet },
      emprise: prep.emprise,
      reponses: reponses,
      styles: StylesOnf.STYLES_ONF
    }, servicesCache()));
  }
  // ==== cache ONF : fin
}
