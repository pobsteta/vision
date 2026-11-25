// Mission 053, étape 3, temps 2 : sonde C4 (outil d'essai), avant tout prototype du groupe « ONF Cache »
// (docs/referentiels/cache-zone-qfield.md § 14 et § 14 bis). Elle mesure sur le Samsung la bascule d'une couche de la carte
// par renommage de son GeoPackage (platformUtilities.renameFile) puis couche.reload(), et l'ouverture d'un GeoPackage vide.
// Logique pure testée hors réseau avec un faux QField ; le GML d'essai est lu par le vrai GDAL quand il est là.
// Un vert ne prouve rien sur le Samsung : c'est l'objet de la sonde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from '../plugin/vision-logique.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ici, '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const gdal = spawnSync('ogrinfo', ['--version']).status === 0;
const PROJET = '/sdcard/QField/vision';
const D = PROJET + '/vision-imports/_sonde-c4';

test('sonde C4 : chemins sous vision-imports/_sonde-c4/, même nom de fichier partout (table = nom du fichier)', () => {
  const c = L.sondeC4Chemins(PROJET);
  assert.deepEqual(c, {
    dossier: D, actuel: `${D}/actuel/SONDE_C4.gpkg`, b: `${D}/b/SONDE_C4.gpkg`, sauvegarde: `${D}/sauvegarde/SONDE_C4.gpkg`,
    vide: `${D}/vide/SONDE_C4.gpkg`, travail: `${D}/travail` });
  assert.equal(L.sondeC4Chemins('relatif'), null);
  assert.equal(L.SONDE_C4.nom, 'Sonde C4 (essai)');
  assert.equal(L.sondeC4NomRapport(new Date(Date.UTC(2026, 10, 25, 9, 5, 7))), 'rapport-20261125T090507Z.txt');
});

test('sonde C4 : GML d\'essai (points en EPSG:2154, x est puis y nord, autour du massif de la Serre) et son .gfs', () => {
  const g = L.sondeC4Gml(2, 0);
  assert.equal((g.match(/<gml:featureMember>/g) || []).length, 2);
  assert.match(g, /<gml:coordinates>895717,6679283<\/gml:coordinates>/);
  assert.equal((L.sondeC4Gml(0, 0).match(/<gml:featureMember>/g) || []).length, 0);
  const f = L.sondeC4Gfs();
  assert.match(f, /<GeometryType>1<\/GeometryType>/);
  assert.match(f, /<SRSName>EPSG:2154<\/SRSName>/);
});

test('sonde C4 (GDAL réel) : 3 points lus, Point, EPSG:2154, x/y du point du terrain ; GML vide lisible', { skip: !gdal && 'GDAL absent' }, () => {
  const d = mkdtempSync(join(tmpdir(), 'vision-c4-'));
  try {
    for (const [nom, n] of [['b', 3], ['vide', 0]]) {
      writeFileSync(join(d, nom + '.gml'), L.sondeC4Gml(n, nom === 'b' ? 500 : 0), 'utf8');
      writeFileSync(join(d, nom + '.gfs'), L.sondeC4Gfs(), 'utf8');
      const r = spawnSync('ogrinfo', ['-json', '-features', '-oo', 'EXPOSE_GML_ID=NO', join(d, nom + '.gml'), 'SONDE_C4'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const j = JSON.parse(r.stdout).layers[0];
      assert.equal(j.featureCount, n);
      assert.equal(j.geometryFields[0].type, 'Point');
      assert.match(JSON.stringify(j.geometryFields[0].coordinateSystem), /2154/);
      if (n > 0) assert.deepEqual(j.features[0].geometry.coordinates, [895717 + 500, 6679283]);
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// Faux QField : disque de « GeoPackage » (nombre d'objets), couche qui relit son chemin à reload().
function fauxQField({ panne = {} } = {}) {
  const disque = new Map();
  const journal = [];
  const carte = [];
  const nouvelleCouche = (uri, nom) => {
    const fichier = uri.split('|')[0];
    const l = { uri, nom, fichier, isValid: disque.has(fichier), crs: { authid: 'EPSG:2154', description: 'RGF93 v1 / Lambert-93' },
      n: disque.has(fichier) ? disque.get(fichier).n : 0, wkbType: () => 1, extent: () => ({ xMinimum: 0, yMinimum: 0, xMaximum: 0, yMaximum: 0 }),
      fields: { names: ['nom'] } };
    return l;
  };
  const s = {
    ecrireFichier(chemin, texte) { journal.push('écrit ' + chemin); disque.set(chemin, { n: (texte.match(/<gml:featureMember>/g) || []).length }); return true; },
    existe: (c) => disque.has(c),
    ouvrir(uri, nom) { journal.push('ouvert ' + uri); return nouvelleCouche(uri, nom); },
    reecrire(couche, cible) { journal.push('réécrit ' + cible); disque.set(cible, { n: couche.n }); return cible; },
    creerIterateur(l) { let i = 0; return { hasNext: () => i < l.n, next: () => { i++; return {}; }, close() {} }; },
    ajouter(l) { journal.push('ajouté ' + l.nom); carte.push(l); },
    renommer(de, vers) {
      journal.push(`renommé ${de} -> ${vers}`);
      if (panne.renommer === de || !disque.has(de)) return false;
      disque.set(vers, disque.get(de)); disque.delete(de); return true;
    },
    recharger(l) { journal.push('rechargé ' + l.nom); l.isValid = disque.has(l.fichier); l.n = l.isValid ? disque.get(l.fichier).n : 0; },
    maintenant: (() => { let t = 0; return () => (t += 7); })(),
  };
  return { s, disque, journal, carte };
}

test('sonde C4, préparation : A (2 objets) au chemin fixe, GeoPackage vide (0 objet), A ajouté à la carte sous « Sonde C4 (essai) »', () => {
  const f = fauxQField();
  const r = L.sondeC4Preparer(PROJET, f.s);
  assert.equal(r.ok, true, r.lignes.join('\n'));
  assert.equal(f.disque.get(`${D}/actuel/SONDE_C4.gpkg`).n, 2);
  assert.equal(f.disque.get(`${D}/vide/SONDE_C4.gpkg`).n, 0);
  assert.equal(f.carte.length, 1);
  assert.equal(f.carte[0].nom, 'Sonde C4 (essai)');
  assert.equal(f.carte[0].uri, `${D}/actuel/SONDE_C4.gpkg|layername=SONDE_C4`);
  const t = r.lignes.join('\n');
  for (const m of ['outil d\'essai', 'textes provisoires', 'A (actuel) : valide, 2 objets, WKB 1, système EPSG:2154', 'vide : valide, 0 objet, WKB 1, système EPSG:2154',
    'couche de sonde ajoutée à la carte : « Sonde C4 (essai) »', '-wal : absent', '-shm : absent']) {
    assert.ok(t.includes(m), `absent : ${m}\n${t}`);
  }
  // Rien hors de _sonde-c4/.
  for (const l of f.journal.filter((x) => /^(écrit|réécrit) /.test(x))) assert.ok(l.includes('/_sonde-c4/'), l);
});

test('sonde C4, bascule : B (3 objets) renommé au chemin de A, reload : la couche affichée a 3 objets ; retour arrière : 2 objets', () => {
  const f = fauxQField();
  const p = L.sondeC4Preparer(PROJET, f.s);
  const r = L.sondeC4Bascule(PROJET, f.s, p.couche);
  const t = r.lignes.join('\n');
  assert.equal(r.ok, true, t);
  assert.equal(r.apres, 3);
  assert.equal(r.retour, 2);
  assert.match(t, /bascule : renommages réussis, couche affichée relue : 3 objets \(attendu 3\), \d+ ms/);
  assert.match(t, /retour arrière : renommages réussis, couche relue : 2 objets \(attendu 2\)/);
  assert.match(t, /VERDICT : bascule par renommage puis reload\(\) PROUVÉE/);
  const ordre = f.journal.filter((x) => /^renommé|^rechargé/.test(x));
  assert.deepEqual(ordre, [
    `renommé ${D}/actuel/SONDE_C4.gpkg -> ${D}/sauvegarde/SONDE_C4.gpkg`, `renommé ${D}/b/SONDE_C4.gpkg -> ${D}/actuel/SONDE_C4.gpkg`, 'rechargé Sonde C4 (essai)',
    `renommé ${D}/actuel/SONDE_C4.gpkg -> ${D}/b/SONDE_C4.gpkg`, `renommé ${D}/sauvegarde/SONDE_C4.gpkg -> ${D}/actuel/SONDE_C4.gpkg`, 'rechargé Sonde C4 (essai)']);
  assert.equal(f.disque.get(`${D}/actuel/SONDE_C4.gpkg`).n, 2, 'A revenu au chemin fixe');
});

test('sonde C4, bascule : reload sans effet (la couche garde 2 objets) ou renommage refusé : verdict NON PROUVÉE, dit', () => {
  const f = fauxQField();
  const p = L.sondeC4Preparer(PROJET, f.s);
  f.s.recharger = () => {};
  const r = L.sondeC4Bascule(PROJET, f.s, p.couche);
  assert.equal(r.ok, false);
  assert.match(r.lignes.join('\n'), /couche affichée relue : 2 objets \(attendu 3\)[\s\S]*VERDICT : bascule NON PROUVÉE/);
  const g = fauxQField({ panne: { renommer: `${D}/b/SONDE_C4.gpkg` } });
  const q = L.sondeC4Preparer(PROJET, g.s);
  const s = L.sondeC4Bascule(PROJET, g.s, q.couche);
  assert.equal(s.ok, false);
  assert.match(s.lignes.join('\n'), /bascule : renommage REFUSÉ/);
  assert.equal(g.disque.get(`${D}/actuel/SONDE_C4.gpkg`).n, 2, 'A remis en place après le refus');
});

test('sonde C4 : -wal et -shm relevés avant et après la bascule ; sans couche de sonde, rien n\'est tenté', () => {
  const f = fauxQField();
  const p = L.sondeC4Preparer(PROJET, f.s);
  f.disque.set(`${D}/actuel/SONDE_C4.gpkg-wal`, { n: 0 });
  const t = L.sondeC4Bascule(PROJET, f.s, p.couche).lignes.join('\n');
  assert.match(t, /avant la bascule : -wal : PRÉSENT, -shm : absent/);
  assert.match(t, /après la bascule : -wal : PRÉSENT, -shm : absent/);
  const r = L.sondeC4Bascule(PROJET, fauxQField().s, null);
  assert.equal(r.ok, false);
  assert.match(r.lignes.join('\n'), /aucune couche de sonde sur la carte/);
});

test('sonde C4 : n\'écrit ni au registre ni au cache, ne touche pas vision.qgz (aucun service de ce genre)', () => {
  const src = lire('plugin/vision-logique.mjs');
  const s = src.slice(src.indexOf('// ==== sonde C4 : début'), src.indexOf('// ==== sonde C4 : fin'));
  assert.ok(s.length > 0);
  for (const interdit of ['inscrire(', 'ecrireRegistre(', 'reglages', '_cache-onf', 'CACHE_ONF.dossier', 'vision.qgz']) assert.ok(!s.includes(interdit), interdit);
});

// ------------------------------------------------------------------------------------------- pont QML et garde
function sectionQml() {
  const q = lire('plugin/Vision.qml');
  const debut = q.indexOf('// ==== sonde C4 : début');
  const fin = q.indexOf('// ==== sonde C4 : fin');
  assert.ok(debut >= 0 && fin > debut, 'section de la sonde C4 absente de Vision.qml');
  return q.slice(debut, fin).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
}

test('sonde C4 (QML) : renameFile, reload(), triggerRepaint(), addMapLayer puis removeMapLayer, compte rendu écrit', () => {
  const s = sectionQml();
  for (const a of ['platformUtilities.renameFile(', '.reload()', '.triggerRepaint()', 'ProjectUtils.addMapLayer', 'ProjectUtils.removeMapLayer',
    'Logique.sondeC4Preparer', 'Logique.sondeC4Bascule', 'Logique.sondeC4NomRapport', 'LayerUtils.saveVectorLayerAs', '"vision/sonde"']) {
    assert.ok(s.includes(a), `absent : ${a}`);
  }
  for (const i of ['settings.', 'Logique.inscrire', 'cacheEnregistrer', 'deleteLater']) assert.ok(!s.includes(i), `interdit : ${i}`);
});

test('sonde C4 (panneau) : trois boutons, dits « outil d\'essai », textes provisoires', () => {
  const p = lire('plugin/Panneau.qml');
  assert.match(p, /Sonde C4 : outil d'essai/);
  assert.match(p, /textes provisoires/);
  for (const f of ['sondeC4Preparer()', 'sondeC4Bascule()', 'sondeC4Retirer()']) assert.ok(p.includes('panneau.vision.' + f), f);
});

test('garde : la sonde C4 ne part pas en version stable (présente seulement avec VERSION 0.7.0, à retirer avant main)', () => {
  for (const f of ['plugin/Vision.qml', 'plugin/vision-logique.mjs', 'plugin/Panneau.qml']) {
    const t = lire(f);
    if (t.includes('sonde C4') || t.includes('Sonde C4')) {
      assert.equal(L.VERSION, '0.7.0', `${f} : sonde C4 présente, la retirer avant toute montée de version`);
    }
  }
  assert.match(lire('plugin/Vision.qml'), /==== sonde C4 : début[^\n]*\n\s*\/\/ À RETIRER AVANT TOUTE FUSION VERS MAIN/);
  assert.match(lire('plugin/vision-logique.mjs'), /==== sonde C4 : début[^\n]*\n\/\/ À RETIRER AVANT TOUTE FUSION VERS MAIN/);
});

test('pièce § 14 bis : protocole de la sonde C4 (bascule, retour arrière, GeoPackage vide, page « Unable to load some layers », retrait)', () => {
  const doc = lire('docs/referentiels/cache-zone-qfield.md');
  assert.ok(doc.includes('### 14 bis.'), '§ 14 bis absent');
  const s = doc.slice(doc.indexOf('### 14 bis.'));
  for (const m of ['Sonde C4 : préparer et afficher', 'Sonde C4 : bascule et relecture', 'Sonde C4 : retirer la couche de sonde', 'Unable to load some layers',
    'rapport-<horodatage>.txt', 'VERDICT', 'gh workflow run release-plugin.yml']) {
    assert.ok(s.includes(m), `§ 14 bis ne cite pas : ${m}`);
  }
});
