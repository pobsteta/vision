// Mission 053, étape 1 bis, temps 2, premier pas : sonde d'essai du cache de zone (docs/referentiels/cache-zone-qfield.md).
// Logique pure de la sonde (plugin/vision-logique.mjs, section « sonde 053 »), testée hors réseau : emprise plafonnée,
// URL GetFeature, URI de la couche WFS (voie A), analyse de complétude d'une réponse, fichier GML d'essai.
// Le fichier d'essai est lu par le vrai GDAL quand il est là (test sauté sinon) ; le point du terrain (massif de la
// Serre, Jura) est recalculé par pyproj quand il est là. Un vert ne prouve rien sur le Samsung : c'est l'objet de la sonde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from '../plugin/vision-logique.mjs';
import { EMPRISE_VRAISEMBLANCE } from '../plugin/vision-controles.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(ici, '..', 'plugin');
const gdal = spawnSync('ogrinfo', ['--version']).status === 0;
const pyproj = spawnSync('python3', ['-I', '-c', 'import pyproj']).status === 0;

const S = () => L.SONDE_ONF;

test('sonde : constantes (service http de l\'ONF, trois couches, plafonds de Pascal : 20 km, 5 000 objets)', () => {
  assert.equal(S().service, 'http://ws.carmencarto.fr/WFS/105/ONF_Forets');
  assert.deepEqual(S().couches, ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR']);
  assert.equal(S().coteMax, 20000);
  assert.equal(S().objetsMax, 5000);
  assert.equal(S().version, 'sonde-053-1');
  // Version du plugin inchangée : une fusion par erreur sur main ferait échouer la release (étiquette plugin-v0.6.0 prise).
  assert.equal(L.VERSION, '0.6.0');
});

test('sonde : zone d\'essai par défaut, massif de la Serre (Jura), 4 km de côté, en EPSG:2154 (x est, y nord)', () => {
  const z = S().serre;
  // WGS84 : longitude 5,585° E, latitude 47,185° N (ordre lon, lat).
  assert.equal(z.lon, 5.585);
  assert.equal(z.lat, 47.185);
  const e = S().empriseSerre;
  assert.equal(e.xmax - e.xmin, 4000);
  assert.equal(e.ymax - e.ymin, 4000);
  assert.ok(Math.abs((e.xmin + e.xmax) / 2 - z.x) <= 1 && Math.abs((e.ymin + e.ymax) / 2 - z.y) <= 1, 'zone centrée sur le point');
  const r = L.sondeEmprise(e, EMPRISE_VRAISEMBLANCE);
  assert.equal(r.ok, true);
  assert.equal(r.plafonnee, false);
});

test('sonde : le point du massif de la Serre tombe au bon endroit (pyproj, WGS84 lon/lat -> EPSG:2154 x/y, à 1 m)', { skip: !pyproj && 'pyproj absent' }, () => {
  const z = S().serre;
  const script = `from pyproj import Transformer\nt = Transformer.from_crs('EPSG:4326', 'EPSG:2154', always_xy=True)\nx, y = t.transform(${z.lon}, ${z.lat})\nprint(f'{x:.3f} {y:.3f}')`;
  const r = spawnSync('python3', ['-I', '-c', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const [x, y] = r.stdout.trim().split(' ').map(Number);
  assert.ok(Math.abs(x - z.x) <= 1, `x pyproj ${x}, attendu ${z.x}`);
  assert.ok(Math.abs(y - z.y) <= 1, `y pyproj ${y}, attendu ${z.y}`);
});

test('sonde : emprise plafonnée à 20 km de côté, recentrée ; refus clair si invalide ou hors de France métropolitaine', () => {
  const petite = { xmin: 890000, ymin: 6675000, xmax: 893000, ymax: 6677000 };
  assert.deepEqual(L.sondeEmprise(petite, EMPRISE_VRAISEMBLANCE), { ok: true, emprise: petite, plafonnee: false, message: '' });
  const grande = { xmin: 870000, ymin: 6660000, xmax: 920000, ymax: 6690000 }; // 50 km x 30 km
  const r = L.sondeEmprise(grande, EMPRISE_VRAISEMBLANCE);
  assert.equal(r.ok, true);
  assert.equal(r.plafonnee, true);
  assert.deepEqual(r.emprise, { xmin: 885000, ymin: 6665000, xmax: 905000, ymax: 6685000 });
  assert.match(r.message, /20 km/);
  for (const mauvaise of [null, { xmin: NaN, ymin: 0, xmax: 1, ymax: 1 }, { xmin: 893000, ymin: 6675000, xmax: 890000, ymax: 6677000 }]) {
    const m = L.sondeEmprise(mauvaise, EMPRISE_VRAISEMBLANCE);
    assert.equal(m.ok, false);
    assert.match(m.message, /emprise/i);
  }
  // Une emprise en degrés (carte en WGS84 non reprojetée) est hors de France en Lambert 93 : refusée.
  const degres = L.sondeEmprise({ xmin: 5.5, ymin: 47.1, xmax: 5.6, ymax: 47.2 }, EMPRISE_VRAISEMBLANCE);
  assert.equal(degres.ok, false);
  assert.match(degres.message, /Lambert 93/);
});

test('sonde : emprise des quatre coins d\'une carte tournée (boîte englobante)', () => {
  const coins = [{ x: 891000, y: 6676000 }, { x: 893000, y: 6675000 }, { x: 894000, y: 6677000 }, { x: 892000, y: 6678000 }];
  assert.deepEqual(L.sondeEmpriseDesPoints(coins), { xmin: 891000, ymin: 6675000, xmax: 894000, ymax: 6678000 });
  assert.equal(L.sondeEmpriseDesPoints([]), null);
  assert.equal(L.sondeEmpriseDesPoints([{ x: NaN, y: 1 }]), null);
});

test('sonde : URL GetFeature WFS 1.0.0, BBOX x,y en Lambert 93 arrondie vers l\'extérieur, MAXFEATURES = plafond + 1', () => {
  const e = { xmin: 893717.4, ymin: 6677283.2, xmax: 897717.6, ymax: 6681283.9 };
  assert.equal(L.sondeUrlGetFeature('FOR_PUBL_FR', e),
    'http://ws.carmencarto.fr/WFS/105/ONF_Forets?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&TYPENAME=FOR_PUBL_FR'
    + '&BBOX=893717,6677283,897718,6681284&MAXFEATURES=5001');
  assert.throws(() => L.sondeUrlGetFeature('DT_FR', e), /couche/);
});

test('sonde : voie A, URI de la couche WFS et expression d\'emprise traduite en BBOX (qgsogcutils.cpp l. 2531)', () => {
  assert.equal(L.sondeUriWfs('PRS_FR'),
    "url='http://ws.carmencarto.fr/WFS/105/ONF_Forets' typename='PRS_FR' version='1.0.0' srsname='EPSG:2154' maxNumFeatures='5001' pagingEnabled='false' restrictToRequestBBOX='0'");
  assert.equal(L.sondeExpressionEmprise({ xmin: 1, ymin: 2, xmax: 3, ymax: 4 }),
    "intersects_bbox($geometry, geom_from_wkt('POLYGON((1 2, 3 2, 3 4, 1 4, 1 2))'))");
});

test('sonde : analyse d\'une réponse complète (fichier d\'essai) : 2 objets, UTF-8, fin de collection, pas d\'exception', () => {
  const a = L.sondeAnalyserReponse(L.sondeFixtureGml());
  assert.deepEqual(a, { encodage: 'UTF-8', complete: true, exception: '', nbObjets: 2, plafondDepasse: false, remplacements: 0 });
});

test('sonde : réponse coupée après les en-têtes (onload avec texte tronqué) = incomplète', () => {
  const t = L.sondeFixtureGml();
  const a = L.sondeAnalyserReponse(t.slice(0, Math.floor(t.length / 2)));
  assert.equal(a.complete, false);
  assert.equal(L.sondeAnalyserReponse('').complete, false);
});

test('sonde : exception MapServer en HTTP 200 lue et comptée comme incomplète', () => {
  const t = '<?xml version=\'1.0\' encoding="UTF-8" ?>\n<ServiceExceptionReport version="1.2.0"><ServiceException code="InvalidParameterValue">msWFSGetFeature(): Couche inconnue</ServiceException></ServiceExceptionReport>';
  const a = L.sondeAnalyserReponse(t);
  assert.equal(a.complete, false);
  assert.equal(a.exception, 'msWFSGetFeature(): Couche inconnue');
});

test('sonde : plafond dépassé (5 001 objets reçus), encodage ISO déclaré, caractères remplacés comptés', () => {
  const membre = '<gml:featureMember><ms:PRS_FR><ms:llib_prs>x</ms:llib_prs></ms:PRS_FR></gml:featureMember>';
  const t = '<?xml version=\'1.0\' encoding="ISO-8859-1" ?>\n<wfs:FeatureCollection>' + membre.repeat(5001) + 'For�t �</wfs:FeatureCollection>\n';
  const a = L.sondeAnalyserReponse(t);
  assert.equal(a.nbObjets, 5001);
  assert.equal(a.plafondDepasse, true);
  assert.equal(a.encodage, 'ISO-8859-1');
  assert.equal(a.remplacements, 2);
  assert.equal(a.complete, true);
});

test('sonde : ligne de compte rendu d\'une requête', () => {
  const l = L.sondeLigneReponse('FOR_PUBL_FR', { statut: 200, octets: 12345, dureeMs: 2500, analyse: L.sondeAnalyserReponse(L.sondeFixtureGml()) });
  assert.match(l, /^FOR_PUBL_FR : HTTP 200, 12345 octets, 2\.5 s, 2 objets, complète, encodage UTF-8/);
  const e = L.sondeLigneReponse('PRS_FR', { statut: 0, octets: 0, dureeMs: 60000, erreur: 'délai dépassé', analyse: null });
  assert.match(e, /PRS_FR : échec \(délai dépassé\)/);
});

test('sonde : dossier d\'essai sous vision-imports/, hors registre', () => {
  assert.equal(L.sondeDossier('/sdcard/projets/vision'), '/sdcard/projets/vision/vision-imports/_sonde-053');
  assert.equal(L.sondeDossier(''), '');
});

test('sonde : le fichier GML d\'essai est lu par GDAL : 2 objets, accents intacts, EPSG:2154, et le point de la Serre tombe dans la 1re forêt',
  { skip: !gdal && 'GDAL absent' }, () => {
    const dossier = mkdtempSync(join(tmpdir(), 'vision-sonde-'));
    try {
      const f = join(dossier, 'fixture.gml');
      writeFileSync(f, L.sondeFixtureGml(), 'utf8');
      const r = spawnSync('ogrinfo', ['-json', '-features', f, 'FOR_PUBL_FR'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const j = JSON.parse(r.stdout);
      const couche = j.layers[0];
      assert.equal(couche.featureCount, 2);
      assert.match(JSON.stringify(couche.geometryFields[0].coordinateSystem), /2154/);
      const libelles = couche.features.map((x) => x.properties.llib_frt);
      assert.deepEqual(libelles, L.SONDE_FIXTURE_ATTENDU.map((x) => x.llib_frt));
      assert.deepEqual(couche.features.map((x) => x.properties.iidtn_frt), L.SONDE_FIXTURE_ATTENDU.map((x) => x.iidtn_frt));
      // Point du terrain : (x, y) EPSG:2154 du massif de la Serre, filtre spatial d'1 m autour.
      const z = S().serre;
      const p = spawnSync('ogrinfo', ['-json', '-features', '-spat', String(z.x - 0.5), String(z.y - 0.5), String(z.x + 0.5), String(z.y + 0.5), f, 'FOR_PUBL_FR'], { encoding: 'utf8' });
      assert.equal(p.status, 0, p.stderr);
      const pj = JSON.parse(p.stdout);
      assert.deepEqual(pj.layers[0].features.map((x) => x.properties.iidtn_frt), [L.SONDE_FIXTURE_ATTENDU[0].iidtn_frt]);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

// ---------------------------------------------------------------------------------------------- pont QML
const lire = (f) => readFileSync(join(PLUGIN, f), 'utf8');
function sectionSonde() {
  const q = lire('Vision.qml');
  const debut = q.indexOf('// ==== sonde 053 : début');
  const fin = q.indexOf('// ==== sonde 053 : fin');
  assert.ok(debut >= 0 && fin > debut, 'section de la sonde absente de Vision.qml');
  // Les commentaires citent des fichiers de QField (qgsquickmapsettings.h…) : seul le code compte.
  return q.slice(debut, fin).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
}

test('sonde (QML) : appels lus dans QField v4.3.7, sans registre ni import', () => {
  const s = sectionSonde();
  for (const appel of ['iface.createHttpRequest()', 'iface.mapCanvas()', 'visibleExtent', 'destinationCrs', 'LayerUtils.loadVectorLayer',
    'LayerUtils.saveVectorLayerAs', '"WFS"', 'Logique.sondeAnalyserReponse', 'Logique.sondeUrlGetFeature', 'Logique.sondeNomRapport', 'Controles.EMPRISE_VRAISEMBLANCE']) {
    assert.ok(s.includes(appel), `appel absent : ${appel}`);
  }
  for (const interdit of ['inscrire', 'reglages', 'settings.', 'ProjectUtils.addMapLayer', 'rmFile', 'importerZip']) {
    assert.ok(!s.includes(interdit), `la sonde ne doit pas appeler : ${interdit}`);
  }
});

test('sonde (panneau) : boutons de la sonde, dit « outil d\'essai », textes non définitifs', () => {
  const p = lire('Panneau.qml');
  assert.match(p, /Sonde ONF/);
  assert.match(p, /outil d'essai/);
  assert.match(p, /sonderReseau\("carte"\)/);
  assert.match(p, /sonderReseau\("serre"\)/);
  assert.match(p, /sonderHorsReseau\(\)/);
});

// ---------------------------------------------------------------------------------------------- aller-retour 2/3
test('sonde : type de géométrie lisible (geometryType et wkbType, qgsvectorlayer.h l. 1003 et 1006)', () => {
  assert.equal(L.sondeTypeGeometrie(2, 6), 'polygone, WKB 6 MultiPolygon');
  assert.equal(L.sondeTypeGeometrie(0, 1), 'point, WKB 1 Point');
  assert.equal(L.sondeTypeGeometrie(3, 0), 'inconnue, WKB 0 Unknown');
  assert.equal(L.sondeTypeGeometrie(4, 100), 'sans géométrie, WKB 100 NoGeometry');
  assert.equal(L.sondeTypeGeometrie(2, 1006), 'polygone, WKB 1006');
  assert.equal(L.sondeTypeGeometrie(undefined, undefined), 'illisible');
});

test('sonde : horodatage du compte rendu (rapport-AAAAMMJJTHHMMSSZ.txt, UTC), sans écraser le précédent', () => {
  assert.equal(L.sondeNomRapport(new Date(Date.UTC(2026, 10, 25, 9, 5, 7))), 'rapport-20261125T090507Z.txt');
});

test('sonde (QML) : fichier d\'essai sous le nom « fixture », géométrie mesurée, fin garantie, échec d\'écriture dit', () => {
  const s = sectionSonde();
  assert.ok(s.includes('sondeOuvrirGml(dossier, chemin, "fixture", "llib_frt", Logique.SONDE_FIXTURE_ATTENDU)'), 'fixture nommée « fixture »');
  for (const appel of ['geometryType()', 'wkbType()', 'Logique.sondeTypeGeometrie', 'Logique.sondeNomRapport', 'finally', 'écriture du GML reçu ÉCHOUÉE']) {
    assert.ok(s.includes(appel), `absent : ${appel}`);
  }
  assert.ok(!s.includes('"/rapport.txt"'), 'rapport.txt ne doit plus être écrasé');
});

test('garde : la sonde ne part pas en version stable (présente seulement avec VERSION 0.6.0, à retirer avant main)', () => {
  const q = lire('Vision.qml');
  if (q.includes('==== sonde 053 : début')) {
    assert.equal(L.VERSION, '0.6.0', 'sonde 053 présente : retirer la section avant toute montée de version');
    assert.match(q, /==== sonde 053 : début[^\n]*\n\s*\/\/ À RETIRER AVANT TOUTE FUSION VERS MAIN/);
  }
});

test('pièce § 9 : le tableau de lecture reprend les textes de la sonde', () => {
  const doc = readFileSync(join(ici, '..', 'docs', 'referentiels', 'cache-zone-qfield.md'), 'utf8');
  const s9 = doc.slice(doc.indexOf('## 9.'));
  const qml = lire('Vision.qml') + readFileSync(join(PLUGIN, 'vision-logique.mjs'), 'utf8');
  assert.match(s9, /rapport-<horodatage>\.txt/);
  // Chaque fragment entre « ` » de la colonne de lecture doit exister tel quel dans le code de la sonde.
  for (const f of ['GML ouvert, valide,', 'accents JUSTES', 'objets relus', 'ouverture du GML ÉCHOUÉE', 'REFUSÉE', 'ÉCART avec le GML',
    'complète', 'INCOMPLÈTE', 'exception : ', 'caractères illisibles', 'écriture du GML reçu ÉCHOUÉE', 'voie A, couche WFS invalide', 'type de géométrie']) {
    assert.ok(s9.includes(f), `§ 9 ne cite pas : ${f}`);
    assert.ok(qml.includes(f), `la sonde n'affiche pas : ${f}`);
  }
});

// ---------------------------------------------------------------------------------------------- aller-retour 3/3
// Essai du 25 novembre 2026 sur le Samsung (QField 4.3.8) : « TypeError: Property 'deleteLater' of object QgsVectorLayer
// … is not a function ». Qt 6.10.3 cache deleteLater() à QML (qtdeclarative src/qml/qml/qqmlpropertycache.cpp
// l. 431-450, src/qml/jsruntime/qv4qobjectwrapper.cpp l. 1023-1059). La sonde ne doit plus appeler deleteLater
// qu'à travers une libération sûre, qui ne lève jamais et le dit une fois dans le compte rendu.
test('sonde (QML) : libération sûre, deleteLater seulement si c\'est une fonction, dit une seule fois', () => {
  const s = sectionSonde();
  const appels = s.match(/\.deleteLater\(\)/g) || [];
  assert.equal(appels.length, 1, `deleteLater appelé ${appels.length} fois (une seule, dans sondeLiberer)`);
  assert.match(s, /function sondeLiberer\(c\) \{[\s\S]*?typeof c\.deleteLater === "function"\) c\.deleteLater\(\);/);
  assert.ok(s.includes('libération impossible (deleteLater absent)'));
  assert.ok(s.includes('sondeLibererSignale'), 'la ligne n\'est écrite qu\'une fois par sonde');
  assert.ok((s.match(/sondeLiberer\(/g) || []).length >= 7, 'chaque couche ouverte par la sonde est libérée par sondeLiberer');
});
