// SPDX-License-Identifier: GPL-3.0-or-later
// Vision, plugin QField d'application (mission 008) : le panneau, minimal. Gros boutons et
// textes noirs sur blanc ; l'interface soignée pour gants et soleil est la mission 015.
// Écrit pour Vision (ADR 0006). Aucun appel à QField ici : tout passe par Vision.qml.
// (Aucun composant n'est créé par Qt.createComponent depuis ce fichier.)
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
  id: panneau
  anchors.fill: parent

  property var vision: null      // objet de Vision.qml
  property var hote: null      // main.qml (dernierMessage)
  property var couches: []
  property string ligneCache: ""
  property string ligneRappel: ""
  // Mission 054 : « Vider le cache ONF », avec confirmation dans le panneau (ni fenêtre ni Popup), refermée seule au bout de 15 s.
  property bool viderCacheVisible: false
  property bool confirmationVider: false

  function relire() {
    couches = vision ? vision.couchesInscrites() : [];
    ligneCache = vision ? vision.cacheLigne() : "";
    ligneRappel = vision ? vision.rappelLigne() : "";
    viderCacheVisible = vision ? vision.viderCacheVisible() : false;
    if (!viderCacheVisible) confirmationVider = false;
  }

  Component.onCompleted: relire()

  Connections {
    target: panneau.vision
    function onRegistreChange() {
      panneau.relire();
    }
  }

  Flickable {
    id: defilement
    anchors.fill: parent
    contentWidth: width
    contentHeight: colonne.implicitHeight
    clip: true

    ColumnLayout {
      id: colonne
      width: defilement.width
      spacing: 8

      Button {
        Layout.fillWidth: true
        Layout.preferredHeight: 72
        font.pointSize: 18
        text: "Ajouter un zip"
        onClicked: panneau.vision.ajouterZip()
      }

      // Mission 053, étape 1 ter : cache de zone des couches ONF (textes validés par Pascal, Logique.TEXTES_CACHE_ONF).
      Button {
        Layout.fillWidth: true
        Layout.preferredHeight: 72
        font.pointSize: 18
        enabled: panneau.vision && !panneau.vision.cacheEnCours && !panneau.vision.viderEnCours
        text: panneau.vision ? (panneau.vision.cacheEnCours ? panneau.vision.textePendantCache : panneau.vision.texteBoutonCache) : ""
        onClicked: panneau.vision.mettreEnCacheOnf()
      }

      // Mission 054 : textes validés par Pascal le 26 novembre 2026 (Logique.TEXTES_VIDER_CACHE_ONF). Aucun texte pendant le vidage.
      Button {
        Layout.fillWidth: true
        Layout.preferredHeight: 72
        font.pointSize: 18
        visible: panneau.viderCacheVisible && !panneau.confirmationVider
        enabled: panneau.vision && !panneau.vision.cacheEnCours && !panneau.vision.viderEnCours
        text: panneau.vision ? panneau.vision.textesVider.bouton : ""
        onClicked: {
          panneau.confirmationVider = true;
          minuterieVider.restart();
        }
      }

      ColumnLayout {
        Layout.fillWidth: true
        spacing: 24
        visible: panneau.viderCacheVisible && panneau.confirmationVider

        Label {
          Layout.fillWidth: true
          wrapMode: Text.WordWrap
          color: "black"
          font.pointSize: 18
          font.bold: true
          text: panneau.vision ? panneau.vision.textesVider.confirmation : ""
        }

        Button {
          Layout.fillWidth: true
          Layout.preferredHeight: 72
          font.pointSize: 18
          enabled: panneau.vision && !panneau.vision.viderEnCours
          text: panneau.vision ? panneau.vision.textesVider.non : ""
          onClicked: {
            minuterieVider.stop();
            panneau.confirmationVider = false;
          }
        }

        Button {
          Layout.fillWidth: true
          Layout.preferredHeight: 72
          font.pointSize: 18
          enabled: panneau.vision && !panneau.vision.cacheEnCours && !panneau.vision.viderEnCours
          text: panneau.vision ? panneau.vision.textesVider.oui : ""
          onClicked: {
            minuterieVider.stop();
            panneau.confirmationVider = false;
            panneau.vision.viderCacheOnf();
          }
        }
      }

      Timer {
        id: minuterieVider
        interval: panneau.vision ? panneau.vision.delaiConfirmationVider : 15000
        repeat: false
        onTriggered: panneau.confirmationVider = false
      }

      Label {
        Layout.fillWidth: true
        visible: panneau.ligneCache !== ""
        wrapMode: Text.WordWrap
        color: "black"
        font.pointSize: 16
        text: panneau.ligneCache
      }

      // Mission 055 : rappel « préparer le hors ligne » (textes validés par Pascal le 26 novembre 2026, Logique.TEXTES_RAPPEL) ;
      // du texte, jamais une fenêtre.
      Label {
        Layout.fillWidth: true
        wrapMode: Text.WordWrap
        color: "black"
        font.pointSize: 16
        text: panneau.vision ? panneau.vision.texteRappel : ""
      }

      Label {
        Layout.fillWidth: true
        visible: panneau.ligneRappel !== ""
        wrapMode: Text.WordWrap
        color: "black"
        font.bold: true
        font.pointSize: 16
        text: panneau.ligneRappel
      }

      Rectangle {
        Layout.fillWidth: true
        Layout.preferredHeight: zoneMessage.implicitHeight + 16
        visible: panneau.hote && panneau.hote.dernierMessage !== ""
        color: "#fff8e1"
        border.color: "black"
        border.width: 2

        Label {
          id: zoneMessage
          x: 8
          y: 8
          width: parent.width - 16
          wrapMode: Text.WordWrap
          color: "black"
          font.pointSize: 16
          font.bold: true
          text: panneau.hote ? panneau.hote.dernierMessage : ""
        }
      }

      Label {
        Layout.fillWidth: true
        Layout.topMargin: 8
        wrapMode: Text.WordWrap
        color: "black"
        font.pointSize: 18
        font.bold: true
        text: panneau.couches.length === 0 ? "Aucune couche ajoutée." : "Couches ajoutées (" + panneau.couches.length + ")"
      }

      Repeater {
        model: panneau.couches

        RowLayout {
          required property var modelData
          Layout.fillWidth: true
          spacing: 8

          Label {
            Layout.fillWidth: true
            wrapMode: Text.WrapAnywhere
            color: "black"
            font.pointSize: 16
            text: modelData.couche + "\n(" + modelData.zip + ")"
          }

          Button {
            Layout.preferredHeight: 72
            Layout.preferredWidth: 160
            font.pointSize: 16
            text: "Retirer"
            onClicked: panneau.vision.retirer(modelData.zip, modelData.couche)
          }
        }
      }

      Label {
        Layout.fillWidth: true
        Layout.topMargin: 24
        wrapMode: Text.WordWrap
        color: "#333333"
        font.pointSize: 12
        text: "Vision " + (panneau.vision ? panneau.vision.versionPlugin : "?")
          + " — QField " + ((panneau.vision && panneau.vision.versionQField()) || "version inconnue")
      }

      Item { Layout.preferredHeight: 48 }
    }
  }
}
