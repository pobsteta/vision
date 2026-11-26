// Mission 021 : les deux zips du projet modèle (décision de Pascal n° 1) et le garde-fou
// « pas de saisie.gpkg dans le zip de mise à jour ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { ecrireZip } from './recette/essai/zip-ecrire.mjs';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { fabriquerZips, nomsDuZip, verifierMiseAJour, verifierPremiereInstallation, ZIP_MISE_A_JOUR, ZIP_PREMIERE_INSTALLATION, CHEMINS_CACHE_VIDES } from '../outils/zips-projet-modele.mjs';
import { CACHE_ONF } from '../plugin/vision-logique.mjs';

const CACHE_VIDES = CACHE_ONF.couches.map((c) => `vision-imports/_cache-onf/actuel/${c.couche}.gpkg`);
const gdal = spawnSync('ogrinfo', ['--version']).status === 0;

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'vision-zips-021-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));
const e = (nom, d = 'x') => ({ nom: Buffer.from(nom), donnees: Buffer.from(d), stocke: false, utf8: true });
function contenu(buf, nom) { // lit un membre
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); let p = buf.readUInt32LE(fin + 16);
  for (let i = 0; i < buf.readUInt16LE(fin + 10); i++) {
    const lf = buf.readUInt16LE(p + 28), lx = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32), loc = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + lf) === nom) {
      const d = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28);
      return inflateRawSync(buf.subarray(d, d + buf.readUInt32LE(p + 20)));
    }
    p += 46 + lf + lx + lc;
  }
  return null;
}

test('le zip de mise à jour contient vision.qgz seul, sans saisie.gpkg', () => {
  const r = fabriquerZips(join(tmp, 'a'), RACINE), buf = readFileSync(r.miseAJour);
  assert.deepEqual(nomsDuZip(buf), ['vision.qgz']);
  assert.ok(contenu(buf, 'vision.qgz').equals(contenu(readFileSync(r.premiereInstallation), 'vision.qgz')));
});
test('le zip de première installation contient vision.qgz, saisie.gpkg (vide, identique à celui du dépôt) et les trois GeoPackage vides du cache ONF', () => {
  const r = fabriquerZips(join(tmp, 'b'), RACINE), buf = readFileSync(r.premiereInstallation);
  assert.deepEqual(nomsDuZip(buf).sort(), ['saisie.gpkg', ...CACHE_VIDES, 'vision.qgz'].sort());
  assert.ok(contenu(buf, 'saisie.gpkg').equals(readFileSync(join(RACINE, 'saisie.gpkg'))));
  assert.ok(contenu(buf, 'vision.qgz').equals(readFileSync(join(RACINE, 'vision.qgz'))));
});
test('noms des fichiers : ceux de la décision de Pascal (fiche 028)', () => {
  assert.equal(ZIP_MISE_A_JOUR, 'projet-vision-mise-a-jour.zip');
  assert.equal(ZIP_PREMIERE_INSTALLATION, 'projet-vision.zip');
  const r = fabriquerZips(join(tmp, 'n'), RACINE);
  assert.ok(r.miseAJour.endsWith('/projet-vision-mise-a-jour.zip') && r.premiereInstallation.endsWith('/projet-vision.zip'));
});
test('déterministe : deux fabrications donnent les mêmes octets', () => {
  const a = fabriquerZips(join(tmp, 'c1'), RACINE), b = fabriquerZips(join(tmp, 'c2'), RACINE);
  assert.ok(readFileSync(a.miseAJour).equals(readFileSync(b.miseAJour)));
  assert.ok(readFileSync(a.premiereInstallation).equals(readFileSync(b.premiereInstallation)));
});
test('garde-fou : un zip de mise à jour avec saisie.gpkg (racine ou sous-dossier, casse libre) est refusé', () => {
  for (const nom of ['saisie.gpkg', 'SAISIE.GPKG', 'projet/saisie.gpkg']) {
    assert.throws(() => verifierMiseAJour(ecrireZip([e('vision.qgz'), e(nom)])), /écraserait/, nom);
  }
});
test('garde-fou : un zip de mise à jour avec autre chose que vision.qgz seul est refusé ; vision.qgz seul est accepté', () => {
  assert.throws(() => verifierMiseAJour(ecrireZip([e('vision.qgz'), e('notes.txt')])), /seul/);
  assert.throws(() => verifierMiseAJour(ecrireZip([e('autre.qgz')])), /seul/);
  assert.doesNotThrow(() => verifierMiseAJour(ecrireZip([e('vision.qgz')])));
});
test('garde-fou : la première installation sans saisie.gpkg ou avec un intrus est refusée', () => {
  const complet = [e('vision.qgz'), e('saisie.gpkg'), ...CACHE_VIDES.map((n) => e(n))];
  assert.throws(() => verifierPremiereInstallation(ecrireZip([e('vision.qgz')])), /vision\.qgz, saisie\.gpkg/);
  assert.throws(() => verifierPremiereInstallation(ecrireZip([e('vision.qgz'), e('saisie.gpkg')])), /vision\.qgz, saisie\.gpkg/, 'sans les GeoPackage du cache : refusée');
  assert.throws(() => verifierPremiereInstallation(ecrireZip([...complet, e('x')])), /vision\.qgz, saisie\.gpkg/);
  assert.throws(() => verifierPremiereInstallation(ecrireZip(complet.slice(0, -1))), /vision\.qgz, saisie\.gpkg/, 'un GeoPackage du cache manque');
  assert.doesNotThrow(() => verifierPremiereInstallation(ecrireZip(complet)));
});
test('fabriquerZips échoue si une source manque', () => {
  const vide = join(tmp, 'vide'); writeFileSync(join(tmp, 'seul.qgz'), 'x');
  assert.throws(() => fabriquerZips(join(tmp, 'd'), vide));
});

test('mise à jour : jamais un GeoPackage du cache (il écraserait un cache rempli) ; refusé quel que soit le dossier', () => {
  for (const nom of CACHE_VIDES) assert.throws(() => verifierMiseAJour(ecrireZip([e('vision.qgz'), e(nom)])), /seul/, nom);
  const r = fabriquerZips(join(tmp, 'maj'), RACINE);
  assert.deepEqual(nomsDuZip(readFileSync(r.miseAJour)), ['vision.qgz']);
});

test('chemins des GeoPackage vides : ceux de vision.qgz (chemin fixe), un par couche du cache', () => {
  assert.deepEqual(CHEMINS_CACHE_VIDES, CACHE_VIDES);
});

// Lit les GeoPackage vides du zip de première installation avec node:sqlite (le schéma réel des champs du service, MultiPolygon / Point, EPSG:2154).
function gpkgDuZip(chemin) {
  const r = fabriquerZips(join(tmp, 'g'), RACINE);
  const f = join(tmp, 'lu-' + chemin.replace(/\//g, '_'));
  writeFileSync(f, contenu(readFileSync(r.premiereInstallation), chemin));
  return f;
}

test('GeoPackage vides du cache : table = nom de la couche, 0 objet, EPSG:2154, MultiPolygon pour forêts et parcelles, Point pour les points', () => {
  for (const c of CACHE_ONF.couches) {
    const f = gpkgDuZip(`vision-imports/_cache-onf/actuel/${c.couche}.gpkg`);
    const db = new DatabaseSync(f, { readOnly: true });
    try {
      assert.deepEqual(db.prepare('SELECT table_name, data_type, srs_id FROM gpkg_contents').all().map((x) => ({ ...x })), [{ table_name: c.couche, data_type: 'features', srs_id: 2154 }]);
      assert.deepEqual(db.prepare('SELECT table_name, column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns').all().map((x) => ({ ...x })),
        [{ table_name: c.couche, column_name: 'geom', geometry_type_name: c.wkb === 1 ? 'POINT' : 'MULTIPOLYGON', srs_id: 2154 }]);
      assert.equal(db.prepare(`SELECT count(*) AS n FROM "${c.couche}"`).get().n, 0);
      const cols = db.prepare(`PRAGMA table_info("${c.couche}")`).all().map((x) => x.name);
      assert.deepEqual(cols, ['fid', 'geom', ...c.champs], 'champs réels du service (DescribeFeatureType de la mesure n° 1), ni gml_id ni coordinates');
      assert.ok(db.prepare('SELECT 1 AS x FROM gpkg_spatial_ref_sys WHERE srs_id = 2154').get(), 'EPSG:2154 déclaré');
      assert.equal(db.prepare('PRAGMA application_id').get().application_id, 1196444487);
      assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'delete', 'jamais de WAL');
    } finally { db.close(); }
  }
});

test('GeoPackage vides (GDAL réel) : lisibles, 0 objet, bon type de géométrie, EPSG:2154', { skip: !gdal && 'GDAL absent' }, () => {
  for (const c of CACHE_ONF.couches) {
    const f = gpkgDuZip(`vision-imports/_cache-onf/actuel/${c.couche}.gpkg`);
    const r = spawnSync('ogrinfo', ['-json', '-so', f, c.couche], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout).layers[0];
    assert.equal(j.featureCount, 0);
    assert.equal(j.geometryFields[0].type, c.wkb === 1 ? 'Point' : 'MultiPolygon');
    assert.match(JSON.stringify(j.geometryFields[0].coordinateSystem), /2154/);
    assert.deepEqual(j.fields.map((x) => x.name), c.champs);
  }
});

test('déterministe : deux fabrications donnent les mêmes GeoPackage vides', () => {
  const a = fabriquerZips(join(tmp, 'v1'), RACINE), b = fabriquerZips(join(tmp, 'v2'), RACINE);
  for (const nom of CACHE_VIDES) assert.ok(contenu(readFileSync(a.premiereInstallation), nom).equals(contenu(readFileSync(b.premiereInstallation), nom)), nom);
});
