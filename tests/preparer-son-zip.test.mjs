// Mission 017 (reprise du 26 novembre 2026) : docs/preparer-son-zip.md cite des formats, un plafond, un nom réservé
// et des styles ; ce test vérifie que ce sont ceux du code (plugin/vision-logique.mjs, vision-styles.mjs, vision-bibliotheque.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLAFOND_LISTAGE_OCTETS, couchesDuZip, fichiersDuShapefile, estDossierReserve, dossierDuZip,
  messageZipReserve, messageListageRefuse, importerZip, inscrire,
} from '../plugin/vision-logique.mjs';
import { controlerCouche, MESSAGE_INCOHERENT } from '../plugin/vision-controles.mjs';
import { AVERTISSEMENT_PAS_UN_POLYGONE } from '../plugin/vision-styles.mjs';
import { ecrireZip } from './recette/essai/zip-ecrire.mjs';
import { estStyleRaster } from '../plugin/vision-styles.mjs';
import { BIBLIOTHEQUE } from '../plugin/vision-bibliotheque.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(RACINE, 'docs', 'preparer-son-zip.md'), 'utf8');
const ID = 'd98bf4b8-0fac-4dac-85cf-58e6701aceeb';
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
  // Le message de la page est celui du code, le nom du zip et la taille remplacés par des marques.
  const msg = messageListageRefuse('x.zip', PLAFOND_LISTAGE_OCTETS * 2);
  assert.match(msg, /^x\.zip : 200 Mo, au-delà du plafond de 100 Mo/);
  assert.ok(page.includes(msg.replace('x.zip', '`<zip>`').replace('200 Mo', '`<n>` Mo')), msg);
  assert.doesNotMatch(page, /\b10 Mo\b/);
});

test('le nom réservé cité est celui du code, et son message aussi', () => {
  assert.ok(page.includes('`_cache-onf.zip`'));
  assert.equal(estDossierReserve(dossierDuZip('_cache-onf.zip')), true);
  assert.equal(estDossierReserve(dossierDuZip('_CACHE-ONF.zip')), true);
  assert.equal(estDossierReserve(dossierDuZip('Serre.zip')), false);
  assert.ok(page.includes(messageZipReserve('<nom>').replace('<nom>', '`<nom>`')));
});

// Contexte minimal : un zip de fichiers qui ne sont pas des couches (le code produit les messages de zip vide).
function ctxZip(nomZip, noms, reglages) {
  const octets = ecrireZip(noms.map((nom) => ({ nom: Buffer.from(nom, 'utf8'), donnees: Buffer.from('x'), stocke: false, utf8: true })));
  return {
    visionId: ID, nomZip, octets,
    dossierProjet: '/storage/emulated/0/Android/data/ch.opengis.qfield/files/Imported Projects/Serre',
    reglages, maintenant: () => new Date('2026-11-26T10:00:00Z'), styles: {},
  };
}

test('la page cite les messages de zip vide du code (zip neuf et zip déjà importé)', () => {
  const m = new Map();
  const reglages = { value: (k, d) => (m.has(k) ? m.get(k) : d), setValue: (k, v) => m.set(k, v) };
  const neuf = importerZip(ctxZip('x.zip', ['lisez-moi.txt'], reglages)).message;
  assert.match(neuf, /^Aucune couche GeoJSON, Shapefile, GeoPackage ou GeoTIFF dans x\.zip\./);
  assert.ok(page.includes(neuf.replace('x.zip', '`<zip>`')), neuf);
  // Zip déjà inscrit au registre : réimporter un zip sans couche lisible n'est pas un « zip sans couche ».
  inscrire(reglages, ID, { zip: 'x.zip', couche: 'UG', format: 'geojson', source: 'vision-imports/x/UG.gpkg' });
  const deja = importerZip(ctxZip('x.zip', ['lisez-moi.txt'], reglages)).message;
  assert.equal(deja, 'aucune couche lisible dans x.zip, rien changé');
  assert.ok(page.includes(deja.replace('x.zip', '`<zip>`')), deja);
});

test('les messages du tableau § 4 accessibles depuis le code sont ceux de la page', () => {
  const contenu = (nom, fichiers, extra = {}) => ({
    nom, format: 'shp', fichiers, lisible: true, nbEntites: 3,
    systeme: { valide: true, epsg: 2154, authid: 'EPSG:2154' }, emprise: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 }, ...extra,
  });
  const services = { reprojeter: () => ({ xmin: 600000, xmax: 601000, ymin: 6600000, ymax: 6601000 }) };
  const tous = ['UG.shp', 'UG.shx', 'UG.dbf', 'UG.prj', 'UG.cpg'];
  const sans = (ext) => tous.filter((f) => !f.endsWith(ext));
  for (const ext of ['.prj', '.shx', '.dbf']) {
    const r = controlerCouche(contenu('UG.shp', sans(ext)), services);
    assert.equal(r.charge, false);
    assert.ok(r.message.includes(`fichier ${ext} manquant`), r.message);
    assert.ok(page.includes(r.message.replace('UG.shp', '`<couche>.shp`')), r.message);
  }
  const sansCpg = controlerCouche(contenu('UG.shp', sans('.cpg')), services);
  assert.equal(sansCpg.charge, true);
  const accents = sansCpg.avertissements[0].replace('UG.shp : ', '');
  assert.match(accents, /accents peut-être mal lus/);
  assert.ok(page.includes(accents), accents);
  const illisible = controlerCouche(contenu('UG', tous, { format: 'geojson', lisible: false }), services).message.replace('UG : ', '');
  assert.ok(page.includes('`<couche>` : ' + illisible), illisible);
  const inconnu = controlerCouche(contenu('UG.shp', tous, { systeme: { valide: false } }), services).message.replace('UG.shp : ', '');
  assert.ok(page.includes('| ' + inconnu + ' |'), inconnu);
  const hors = controlerCouche(contenu('UG.shp', tous), { reprojeter: () => ({ xmin: 0, xmax: 1, ymin: 0, ymax: 1 }) });
  assert.equal(hors.charge, false);
  assert.equal(hors.message, 'UG.shp : ' + MESSAGE_INCOHERENT);
  assert.ok(page.includes(MESSAGE_INCOHERENT));
  const vide = controlerCouche(contenu('UG.shp', tous, { nbEntites: 0 }), services);
  assert.equal(vide.charge, true);
  assert.ok(page.includes('avertissement : ' + vide.avertissements[0].replace('UG.shp : ', '')), vide.avertissements[0]);
  assert.ok(page.includes('avertissement : ' + AVERTISSEMENT_PAS_UN_POLYGONE));
  assert.ok(page.includes('au-delà du plafond de 100 Mo pour lister un zip ; zip non lu'));
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
