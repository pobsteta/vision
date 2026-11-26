// SPDX-License-Identifier: GPL-3.0-or-later
// Mission 014, aller-retour 1 : couche gardée dont une annexe résiste, rechargée sur la carte depuis son ancienne copie.
// Complète D3-04 (tests/registre-014.test.mjs) : ici, la lecture seule et l'URI d'ouverture, que son mock ne voit pas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ecrireZip } from './recette/essai/zip-ecrire.mjs';
import * as L from '../plugin/vision-logique.mjs';
import * as S from '../plugin/vision-styles.mjs';

const ID = 'd98bf4b8-0fac-4dac-85cf-58e6701aceeb';
const PROJET = '/storage/emulated/0/Android/data/ch.opengis.qfield/files/Imported Projects/Serre';
const COPIES = `${PROJET}/vision-imports`;
const GJ = Buffer.from('{"type":"FeatureCollection","features":[]}');
const zip = ecrireZip([{ nom: Buffer.from('a.geojson'), donnees: GJ, stocke: false, utf8: true }]);

test('annexe qui résiste : la couche gardée est rouverte sur l\'ancienne copie (|layername=a), en lecture seule, ajoutée une fois', () => {
  const fichiers = new Set();
  const mag = new Map();
  const reglages = { value: (c, d) => (mag.has(c) ? mag.get(c) : d), setValue: (c, v) => mag.set(c, v) };
  const wal = `${COPIES}/z/a.gpkg-wal`;
  const ouvertures = [];
  const ajouts = [];
  const rm = (chemin) => { if (chemin === wal) return false; return fichiers.delete(chemin); };
  const ctx = {
    visionId: ID, dossierProjet: PROJET, nomZip: 'z.zip', octets: zip, reglages, styles: S,
    maintenant: () => new Date('2026-11-27T10:00:00.000Z'),
    ouvrirCouche: (source, nom) => { ouvertures.push(source); return { source, name: nom, isValid: true, readOnly: false, deleteLater() {} }; },
    decrireCouche: () => ({ lisible: true, systeme: 'EPSG:2154', nbEntites: 1, emprise: [600000, 6800000, 601000, 6801000] }),
    controlerCouche: () => ({ charge: true, controle: null, message: null, avertissements: [] }),
    reecrireCouche: (c, cible) => { fichiers.add(cible); return cible; },
    ecrireFichier: (chemin) => { fichiers.add(chemin); return true; },
    ajouterALaCarte: (c, nom, source) => ajouts.push({ c, nom, source }),
    infosCouche: () => ({ geometrie: 'polygone', champs: [] }),
    lireTexte: () => null,
    effacerFichier: rm,
    platformUtilities: { rmFile: rm },
    existe: (chemin) => fichiers.has(chemin),
  };
  L.importerZip(ctx);
  fichiers.add(wal);
  ouvertures.length = 0; ajouts.length = 0;
  L.importerZip(ctx);
  const a = ajouts.filter((x) => x.nom === 'a');
  assert.equal(a.length, 1);
  assert.equal(a[0].source, `${COPIES}/z/a.gpkg`);
  assert.equal(a[0].c.readOnly, true, 'rouverte en lecture seule');
  assert.ok(ouvertures.includes(`${COPIES}/z/a.gpkg|layername=a`), ouvertures.join(' | '));
});
