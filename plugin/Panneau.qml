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

  function relire() {
    couches = vision ? vision.couchesInscrites() : [];
    ligneCache = vision ? vision.cacheLigne() : "";
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
        enabled: panneau.vision && !panneau.vision.cacheEnCours
        text: panneau.vision ? (panneau.vision.cacheEnCours ? panneau.vision.textePendantCache : panneau.vision.texteBoutonCache) : ""
        onClicked: panneau.vision.mettreEnCacheOnf()
      }

      Label {
        Layout.fillWidth: true
        visible: panneau.ligneCache !== ""
        wrapMode: Text.WordWrap
        color: "black"
        font.pointSize: 16
        text: panneau.ligneCache
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

      // Mission 053, étape 3 : sonde C4, outil d'essai (textes provisoires, à retirer avant toute fusion vers main).
      Label {
        Layout.fillWidth: true
        Layout.topMargin: 24
        wrapMode: Text.WordWrap
        color: "black"
        font.pointSize: 16
        font.bold: true
        text: "Sonde C4 : outil d'essai (mission 053), textes provisoires. Ajoute à la carte une couche « Sonde C4 (essai) » ; écrit dans vision-imports/_sonde-c4/."
      }

      Button {
        Layout.fillWidth: true
        Layout.preferredHeight: 72
        font.pointSize: 16
        text: "Sonde C4 : préparer et afficher"
        onClicked: panneau.vision.sondeC4Preparer()
      }

      Button {
        Layout.fillWidth: true
        Layout.preferredHeight: 72
        font.pointSize: 16
        text: "Sonde C4 : bascule et relecture"
        onClicked: panneau.vision.sondeC4Bascule()
      }

      Button {
        Layout.fillWidth: true
        Layout.preferredHeight: 72
        font.pointSize: 16
        text: "Sonde C4 : retirer la couche de sonde"
        onClicked: panneau.vision.sondeC4Retirer()
      }

      Label {
        Layout.fillWidth: true
        visible: panneau.vision && panneau.vision.sondeC4Texte !== ""
        wrapMode: Text.WrapAnywhere
        color: "black"
        font.pointSize: 12
        text: panneau.vision ? panneau.vision.sondeC4Texte : ""
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
