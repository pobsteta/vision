// Mission 017 (reprise du 26 novembre 2026) : docs/preparer-son-zip.md cite des formats, un plafond, un nom réservé
// et des styles ; ce test vérifie que ce sont ceux du code (plugin/vision-logique.mjs, vision-styles.mjs, vision-bibliotheque.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLAFOND_LISTAGE_OCTETS, couchesDuZip, fichiersDuShapefile, estDossierReserve, dossierDuZip,
  messageZipReserve, messageListageRefuse,
} from '../plugin/vision-logique.mjs';
import { estStyleRaster } from '../plugin/vision-styles.mjs';
import { BIBLIOTHEQUE } from '../plugin/vision-bibliotheque.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(RACINE, 'docs', 'preparer-son-zip.md'), 'utf8');
const readme = readFileSync(join(RACINE, 'README.md'), 'utf8');

test('chaque extension citée dans la page est lue par le code, et inversement', () => {
  const citees = ['.geojson', '.json', '.gpkg', '.shp', '.tif', '.tiff'];
  for (const ext of citees) {
    assert.ok(page.includes('`' + ext + '`'), ext + ' absent de la page');
    assert.equal(couchesDuZip(['x' + ext], {}).length, 1, ext + ' non lu par le code');
  }
  // Le code ne lit pas d'autre extension de couche : un format inconnu n'est pas une couche.
  assert.equal(couchesDuZip(['x.kml', 'x.csv', 'x.qml', 'x.dbf'], {}).length, 0);
});

test('les extensions du Shapefile citées sont celles du code', () => {
  const fichiers = fichiersDuShapefile('UG.shp', ['UG.shp', 'UG.shx', 'UG.dbf', 'UG.prj', 'UG.cpg', 'UG.qix']);
  assert.deepEqual(fichiers, ['UG.shp', 'UG.shx', 'UG.dbf', 'UG.prj', 'UG.cpg']);
  for (const ext of ['.shp', '.shx', '.dbf', '.prj', '.cpg']) assert.ok(page.includes('`' + ext + '`'), ext);
});

test('le plafond cité est celui du code (100 Mo, 100 000 000 octets)', () => {
  assert.equal(PLAFOND_LISTAGE_OCTETS, 100000000);
  assert.match(page, /100 Mo/);
  assert.ok(messageListageRefuse('a.zip', PLAFOND_LISTAGE_OCTETS + 1).includes('plafond de 100 Mo'));
  assert.ok(page.includes('au-delà du plafond de 100 Mo pour lister un zip ; zip non lu'));
  assert.doesNotMatch(page, /\b10 Mo\b/);
});

test('le nom réservé cité est celui du code, et son message aussi', () => {
  assert.ok(page.includes('`_cache-onf.zip`'));
  assert.equal(estDossierReserve(dossierDuZip('_cache-onf.zip')), true);
  assert.equal(estDossierReserve(dossierDuZip('_CACHE-ONF.zip')), true);
  assert.equal(estDossierReserve(dossierDuZip('Serre.zip')), false);
  assert.ok(page.includes(messageZipReserve('<nom>').replace('<nom>', '`<nom>`')));
});

test('la page cite le message de zip vide du code', () => {
  assert.ok(page.includes('Aucune couche GeoJSON, Shapefile, GeoPackage ou GeoTIFF dans'));
});

test('les styles de la bibliothèque cités sont ceux de la bibliothèque, vecteur et raster', () => {
  const vecteur = [];
  const raster = [];
  for (const [nom, qml] of Object.entries(BIBLIOTHEQUE)) (estStyleRaster(qml) ? raster : vecteur).push(nom);
  const section = (debut, fin) => {
    const i = page.indexOf(debut);
    assert.ok(i >= 0, debut);
    return page.substring(i, page.indexOf(fin, i));
  };
  const noms = (texte) => [...texte.matchAll(/`([^`]+)`/g)].map((m) => m[1]).sort();
  assert.deepEqual(noms(section('Styles de couches vecteur appliqués', 'Styles de raster')), vecteur.sort());
  assert.deepEqual(noms(section('Styles de raster', '### Garder')), raster.sort());
});

test('le README renvoie à la page', () => {
  assert.match(readme, /docs\/preparer-son-zip\.md/);
});

test('la page ne contient ni clé ni jeton', () => {
  assert.doesNotMatch(page, /ghp_|apikey|secret|token/i);
});
