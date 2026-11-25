// Mission 053, étape 3, temps 3 : groupe « ONF Cache » du projet modèle et GeoPackage vides de la première installation
// (fiche 053, « Étape 3 » ; docs/referentiels/cache-zone-qfield.md § 14.3, § 14.4 et § 15). Arbitrages de Pascal (25 novembre 2026) :
// « ONF » renommé « ONF WFS » ; « ONF Cache » au-dessus, les deux cochés ; couches à chemin fixe ; vides dans projet-vision.zip seulement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { ecrireQgs, ecrireQgz, ecrireGpkgCacheVide, GROUPE_CACHE_ONF, GROUPE_ONF, sourceCacheOnf, COUCHES_CACHE_ONF } from '../outils/projet-modele.mjs';
import { fabriquerZips, nomsDuZip, verifierMiseAJour, verifierPremiereInstallation, MEMBRES_CACHE, gpkgCacheVides } from '../outils/zips-projet-modele.mjs';
import { ecrireZip } from './recette/essai/zip-ecrire.mjs';
import { STYLES_ONF } from '../plugin/vision-styles-onf.mjs';
import * as L from '../plugin/vision-logique.mjs';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const QGS = ecrireQgs();
const gdal = spawnSync('ogrinfo', ['--version']).status === 0;
const tmp = mkdtempSync(join(tmpdir(), 'vision-groupe-cache-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));
const dexml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (t, n) => (new RegExp(` ${n}="([^"]*)"`).exec(t) || [])[1];
const blocs = () => [...QGS.matchAll(/<maplayer [^>]*>[\s\S]*?<\/maplayer>/g)].map((m) => m[0]);
const coucheCache = (code) => blocs().find((b) => b.includes(`<datasource>./vision-imports/_cache-onf/actuel/${code}.gpkg|layername=${code}</datasource>`));
const arbre = () => QGS.match(/<layer-tree-group>([\s\S]*?)<\/layer-tree-group>\s*<snapping/)[1];

test('arbre : Saisie terrain, « ONF Cache » (cochés, dépliés), puis « ONF WFS », puis les fonds', () => {
  assert.equal(GROUPE_ONF, 'ONF WFS');
  assert.equal(GROUPE_CACHE_ONF, 'ONF Cache');
  const ordre = [...arbre().matchAll(/<layer-tree-(?:group name="([^"]*)"|layer id="[^"]*" name="([^"]*)")/g)].map((m) => (m[1] !== undefined ? '[' + m[1] + ']' : m[2]));
  assert.deepEqual(ordre.slice(0, 10), ['Saisie terrain', '[ONF Cache]', 'Points de secours (© ONF)', 'Parcelles forestières (© ONF)', 'Forêts publiques (© ONF)',
    '[ONF WFS]', 'Points de secours (© ONF)', 'Parcelles forestières (© ONF)', 'Forêts publiques (© ONF)', '[Fonds de carte]']);
  assert.ok(!/<layer-tree-group name="ONF"[ >]/.test(QGS), 'plus de groupe « ONF »');
  const g = arbre().match(/<layer-tree-group name="ONF Cache" ([^>]*)>([\s\S]*?)<\/layer-tree-group>/);
  assert.match(g[1], /checked="Qt::Checked"/);
  assert.match(g[1], /expanded="1"/);
  assert.match(arbre().match(/<layer-tree-group name="ONF WFS" ([^>]*)>/)[1], /checked="Qt::Checked"/);
  const feuilles = [...g[2].matchAll(/<layer-tree-layer [^>]*source="([^"]*)" providerKey="([^"]*)"[^>]*checked="([^"]*)"/g)].map((m) => [dexml(m[1]), m[2], m[3]]);
  assert.deepEqual(feuilles, ['PRS_FR', 'PARC_PUBL_FR', 'FOR_PUBL_FR'].map((c) => [`./vision-imports/_cache-onf/actuel/${c}.gpkg|layername=${c}`, 'ogr', 'Qt::Checked']));
});

test('couches du cache : chemin fixe de la logique du plugin, GeoPackage (ogr), noms validés, lecture seule, « © ONF »', () => {
  for (const c of L.CACHE_ONF.couches) {
    const b = coucheCache(c.couche);
    assert.ok(b, c.couche);
    assert.equal(sourceCacheOnf({ couche: c.couche }), './' + L.cacheCheminsFixes('/p', c.couche).gpkg.replace('/p/', '') + '|layername=' + c.couche);
    assert.equal(b.match(/<provider[^>]*>([^<]*)<\/provider>/)[1], 'ogr');
    assert.equal(b.match(/<layername>([^<]*)<\/layername>/)[1], c.nom);
    assert.equal(attr(b.match(/<maplayer [^>]*>/)[0], 'readOnly'), '1');
    assert.equal(attr(b.match(/<maplayer [^>]*>/)[0], 'geometry'), c.wkb === 1 ? 'Point' : 'Polygon');
    assert.equal(b.match(/<rights>([^<]*)<\/rights>/)[1], '© ONF');
    assert.equal(b.match(/<attribution>([^<]*)<\/attribution>/)[1], '© ONF');
    assert.ok(QGS.includes(`name="${c.nom}" source="${b.match(/<datasource>([^<]*)<\/datasource>/)[1]}" providerKey="ogr"`), 'feuille = couche');
  }
});

test('marques lues par le plugin (vision/cache, vision/couche, vision/emplacement) dans la carte de propriétés de la couche, une seule fois', () => {
  for (const c of L.CACHE_ONF.couches) {
    const b = coucheCache(c.couche);
    assert.equal((b.match(/<customproperties>/g) || []).length, 1, c.couche);
    const props = b.match(/<customproperties>\s*<Option type="Map">([\s\S]*?)<\/customproperties>/)[1];
    for (const [k, v] of [['vision/cache', 'onf'], ['vision/couche', c.couche], [L.CACHE_FIXE.marque, L.CACHE_FIXE.valeur]]) {
      assert.ok(props.includes(`<Option name="${k}" type="QString" value="${v}"/>`), `${c.couche} : ${k}`);
    }
  }
  // Les couches WFS ne portent pas ces marques : le plugin ne les confond jamais avec le cache.
  for (const b of blocs().filter((x) => /<provider[^>]*>WFS</.test(x))) assert.ok(!b.includes('vision/cache'));
});

test('styles et seuils du cache : corps du style adapté, forêts toujours visibles, parcelles et points en deçà du 1:50 000', () => {
  const seuils = (code) => { const e = coucheCache(code).match(/<maplayer [^>]*>/)[0]; return [attr(e, 'hasScaleBasedVisibilityFlag'), attr(e, 'minScale'), attr(e, 'maxScale')]; };
  assert.deepEqual(seuils('FOR_PUBL_FR'), ['0', '100000000', '0']);
  assert.deepEqual(seuils('PARC_PUBL_FR'), ['1', '50000', '0']);
  assert.deepEqual(seuils('PRS_FR'), ['1', '50000', '0']);
  for (const code of Object.keys(STYLES_ONF)) {
    const sans = (t) => t.replace(/<customproperties>[\s\S]*?<\/customproperties>/, '');
    const corps = sans(STYLES_ONF[code].match(/<qgis [^>]*>\s*([\s\S]*?)\s*<\/qgis>/)[1]);
    assert.ok(sans(coucheCache(code)).includes(corps), code + ' : corps du style');
  }
});

test('ordre de rendu : Saisie, cache (points, parcelles, forêts), WFS (idem), fonds ; ordre personnalisé identique', () => {
  const ordre = [...QGS.match(/<layerorder>([\s\S]*?)<\/layerorder>/)[1].matchAll(/<layer id="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(ordre.length, 12);
  const src = (id) => QGS.match(new RegExp(`<id>${id}</id>\\s*<datasource>([^<]*)</datasource>`))[1];
  assert.match(src(ordre[0]), /saisie\.gpkg/);
  assert.deepEqual(ordre.slice(1, 4).map(src), ['PRS_FR', 'PARC_PUBL_FR', 'FOR_PUBL_FR'].map((c) => `./vision-imports/_cache-onf/actuel/${c}.gpkg|layername=${c}`));
  assert.ok(ordre.slice(4, 7).every((id) => /url=&apos;http:\/\/ws\.carmencarto\.fr|url='http/.test(dexml(src(id)))));
  const perso = [...QGS.match(/<custom-order[^>]*>([\s\S]*?)<\/custom-order>/)[1].matchAll(/<item>([^<]*)<\/item>/g)].map((m) => m[1]);
  assert.deepEqual(perso, ordre);
  assert.equal(new Set(ordre).size, 12, 'identifiants distincts (cache et WFS)');
});

test('vision.qgz du dépôt = sortie de l\'outil (groupe « ONF Cache » compris)', () => {
  assert.ok(readFileSync(new URL('../vision.qgz', import.meta.url)).equals(ecrireQgz(QGS)));
});

// ------------------------------------------------------------------------------------------- GeoPackage vides
test('GeoPackage vide : table = nom de la couche, fid et geom, MULTIPOLYGON / POINT en EPSG:2154, champs du service en TEXT, 0 objet', () => {
  for (const c of L.CACHE_ONF.couches) {
    const f = join(tmp, c.couche + '.gpkg');
    ecrireGpkgCacheVide(f, c.couche);
    const db = new DatabaseSync(f, { readOnly: true });
    try {
      assert.equal(db.prepare('PRAGMA application_id').get().application_id, 1196444487);
      assert.deepEqual({ ...db.prepare('SELECT table_name, data_type, srs_id FROM gpkg_contents').get() }, { table_name: c.couche, data_type: 'features', srs_id: 2154 });
      assert.deepEqual({ ...db.prepare('SELECT column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns').get() },
        { column_name: 'geom', geometry_type_name: c.wkb === 1 ? 'POINT' : 'MULTIPOLYGON', srs_id: 2154 });
      const cols = db.prepare(`PRAGMA table_info("${c.couche}")`).all().map((x) => [x.name, x.type]);
      assert.deepEqual(cols, [['fid', 'INTEGER'], ['geom', c.wkb === 1 ? 'POINT' : 'MULTIPOLYGON'], ...c.champs.map((x) => [x, 'TEXT'])]);
      assert.equal(db.prepare(`SELECT count(*) AS n FROM "${c.couche}"`).get().n, 0);
    } finally { db.close(); }
  }
  assert.throws(() => ecrireGpkgCacheVide(join(tmp, 'x.gpkg'), 'UG'), /inconnue/);
  assert.deepEqual(COUCHES_CACHE_ONF.map((c) => c.couche), ['PRS_FR', 'PARC_PUBL_FR', 'FOR_PUBL_FR']);
});

test('GeoPackage vide (GDAL réel) : lisible, 0 objet, type et système attendus', { skip: !gdal && 'GDAL absent' }, () => {
  for (const c of L.CACHE_ONF.couches) {
    const f = join(tmp, 'g-' + c.couche + '.gpkg');
    ecrireGpkgCacheVide(f, c.couche);
    const r = spawnSync('ogrinfo', ['-json', '-so', f, c.couche], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout).layers[0];
    assert.equal(j.featureCount, 0);
    assert.equal(j.geometryFields[0].type, c.wkb === 1 ? 'Point' : 'MultiPolygon');
    assert.match(JSON.stringify(j.geometryFields[0].coordinateSystem), /2154/);
  }
});

// ------------------------------------------------------------------------------------------- zips
function membre(buf, nom) {
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

test('projet-vision.zip : vision.qgz, saisie.gpkg et les trois GeoPackage vides au chemin fixe ; reproductible', () => {
  assert.deepEqual(MEMBRES_CACHE, ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR'].map((c) => `vision-imports/_cache-onf/actuel/${c}.gpkg`));
  const a = fabriquerZips(join(tmp, 'z1'), RACINE), b = fabriquerZips(join(tmp, 'z2'), RACINE);
  const buf = readFileSync(a.premiereInstallation);
  assert.deepEqual(nomsDuZip(buf).sort(), ['saisie.gpkg', 'vision.qgz', ...MEMBRES_CACHE].sort());
  assert.ok(buf.equals(readFileSync(b.premiereInstallation)), 'mêmes octets d\'une fabrication à l\'autre');
  const vides = gpkgCacheVides();
  for (const v of vides) assert.ok(membre(buf, v.nom).equals(v.donnees), v.nom);
  // Le chemin du zip est celui que déclare vision.qgz (relatif au dossier du projet).
  for (const c of L.CACHE_ONF.couches) assert.ok(QGS.includes(`./vision-imports/_cache-onf/actuel/${c.couche}.gpkg`));
});

test('projet-vision-mise-a-jour.zip : vision.qgz seul, jamais le cache ; garde-fou explicite', () => {
  const r = fabriquerZips(join(tmp, 'm'), RACINE);
  assert.deepEqual(nomsDuZip(readFileSync(r.miseAJour)), ['vision.qgz']);
  const e = (nom) => ({ nom: Buffer.from(nom), donnees: Buffer.from('x'), stocke: false, utf8: true });
  for (const nom of MEMBRES_CACHE.concat(['vision-imports/_CACHE-ONF/actuel/PRS_FR.gpkg', 'vision-imports/_cache-onf/'])) {
    assert.throws(() => verifierMiseAJour(ecrireZip([e('vision.qgz'), e(nom)])), /cache ONF/, nom);
  }
  assert.throws(() => verifierPremiereInstallation(ecrireZip([e('vision.qgz'), e('saisie.gpkg')])), /cache ONF vide/);
  assert.throws(() => verifierPremiereInstallation(ecrireZip([e('vision.qgz'), e('saisie.gpkg'), ...MEMBRES_CACHE.slice(1).map(e)])), /cache ONF vide/);
  assert.doesNotThrow(() => verifierPremiereInstallation(ecrireZip([e('vision.qgz'), e('saisie.gpkg'), ...MEMBRES_CACHE.map(e)])));
  writeFileSync(join(tmp, 'rien'), '');
});
