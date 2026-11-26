// SPDX-License-Identifier: GPL-3.0-or-later
// Mission 054, tests du dev (en plus de ceux du testeur, tests/vider-cache-onf-054.test.mjs, non modifiés) :
// réponses de l'orchestrateur aux questions du testeur, n° 1 (couche du projet invalide) et n° 2 (aucun cache inscrit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../plugin/vision-logique.mjs';
import { EMPRISE_VRAISEMBLANCE } from '../plugin/vision-controles.mjs';

const ID = '6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b';
const PROJET = '/sdcard/QField/vision';
const CACHE = PROJET + '/vision-imports/_cache-onf';
const ACTUEL = CACHE + '/actuel';
const DATE = new Date(2026, 10, 26, 9, 0, 0);
const H = L.cacheHorodatage(DATE);
const CODES = L.CACHE_ONF.couches.map((c) => c.couche);
const ZONE = { xmin: 893717, ymin: 6677283, xmax: 897717, ymax: 6681283 };
const ZIP = { zip: 'Serre.zip', couche: 'UG', chemin: 'Serre/UG.gpkg', style: 'UG' };
const entreesActuel = () => CODES.map((c) => ({ cache: 'onf', couche: c, chemin: `actuel/${c}.gpkg`, emprise: ZONE, date: DATE.toISOString(), objets: 3 }));

// Faux QField minimal : un disque, un journal, trois couches du projet (l'une peut être invalide).
function faux({ registre, invalide = null }) {
  const disque = new Map();
  const journal = [];
  const reglages = new Map([[L.cleRegistre(ID), JSON.stringify(registre)]]);
  for (const c of CODES) disque.set(`${ACTUEL}/${c}.gpkg`, { n: 3, wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' });
  const couches = {};
  for (const c of CODES) {
    couches[c] = { nom: L.coucheOnf(c).nom, fichier: `${ACTUEL}/${c}.gpkg`, isValid: invalide !== c, n: 3, rechargements: 0,
      reload() { this.rechargements++; if (this.isValid) this.n = disque.get(this.fichier).n; } };
  }
  const ctx = {
    visionId: ID, dossierProjet: PROJET, horodatage: H, date: DATE, vraisemblance: EMPRISE_VRAISEMBLANCE, styles: {},
    reglages: { value: (k, d) => (reglages.has(k) ? reglages.get(k) : d), setValue: (k, v) => { journal.push('registre'); reglages.set(k, v); } },
    ecrireFichier(chemin, texte) { journal.push('écrit ' + chemin); disque.set(chemin, texte); return true; },
    effacerFichier(chemin) { journal.push('effacé ' + chemin); disque.delete(chemin); return true; },
    existe: (chemin) => disque.has(chemin),
    ouvrirCouche(uri) {
      const code = uri.split('|')[0].replace(/^.*\//, '').replace(/\.[a-z]+$/, '');
      return { isValid: true, readOnly: false, crs: { authid: 'EPSG:2154' }, n: 0, wkbType: () => L.coucheOnf(code).wkb, extent: () => ({}) };
    },
    creerIterateur(l) { let i = 0; return { hasNext: () => i < l.n, next: () => { i++; return {}; }, close() {} }; },
    imposerSysteme() {},
    reecrireCouche(l, cible) { journal.push('réécrit ' + cible); disque.set(cible, { n: l.n, wkb: l.wkbType(), authid: 'EPSG:2154' }); return cible; },
    renommer(de, vers) { journal.push('renommé'); if (!disque.has(de)) return false; disque.set(vers, disque.get(de)); disque.delete(de); return true; },
    recharger(l) { l.reload(); },
    retirerCacheDeLaCarte() { journal.push('RETIRÉ'); },
    coucheDuGroupe: (c) => couches[c],
  };
  return { ctx, disque, journal, couches, registre: () => JSON.parse(reglages.get(L.cleRegistre(ID))) };
}

test('mode groupe, une couche du projet invalide au geste : les fichiers vides sont posés à actuel/, la couche invalide est ignorée (ni reload ni contrôle), réussite « Cache ONF vidé. »', () => {
  const f = faux({ registre: [ZIP, ...entreesActuel()], invalide: 'PARC_PUBL_FR' });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.equal(r.message, 'Cache ONF vidé.');
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, 0, `${c} : GeoPackage vide à actuel/`);
  assert.equal(f.couches.PARC_PUBL_FR.rechargements, 0, 'la couche invalide n\'est pas rechargée (reload ne la répare pas)');
  assert.equal(f.couches.FOR_PUBL_FR.rechargements, 1);
  assert.equal(f.couches.FOR_PUBL_FR.n, 0);
  assert.deepEqual(f.registre(), [ZIP]);
  assert.ok(!f.journal.includes('RETIRÉ'), 'jamais retirée de la carte en mode groupe');
});

test('aucun cache inscrit : succès sans effet, rien écrit, renommé ni effacé, registre intact (le bouton est caché dans ce cas)', () => {
  for (const registre of [[], [ZIP]]) {
    const f = faux({ registre });
    const r = L.viderCacheOnf(f.ctx);
    assert.equal(r.ok, true);
    assert.equal(r.message, 'Cache ONF vidé.');
    assert.deepEqual(r.restes, []);
    assert.deepEqual(f.journal, [], 'aucun geste sur le disque ni sur le registre');
    assert.deepEqual(f.registre(), registre);
    for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, 3, 'actuel/ intact');
  }
});
