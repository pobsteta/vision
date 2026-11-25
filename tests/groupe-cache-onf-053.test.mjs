// Mission 053, étape 3, temps 3 : groupe « ONF Cache » par la voie 1 (C4) (fiche pilotage/missions/053-couches-onf-wfs.md,
// « Étape 3 » et ses arbitrages ; preuves dans docs/referentiels/cache-zone-qfield.md § 14, sonde § 14 bis, protocole § 15).
// Couches du projet à chemin fixe vision-imports/_cache-onf/actuel/<couche>.gpkg, génération contrôlée comme avant, bascule par
// renommage (platformUtilities.renameFile) avec retour arrière, puis reload() ; GeoPackage vides dans projet-vision.zip
// seulement ; fichiers manquants créés par le plugin ; migration du cache 0.7.0 ; plugin à deux modes ; sonde C4 retirée.
// Logique pure testée hors réseau avec un faux QField ; GDAL réel quand il est là. Un vert ne prouve rien sur le Samsung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as L from '../plugin/vision-logique.mjs';
import { EMPRISE_VRAISEMBLANCE } from '../plugin/vision-controles.mjs';
import { STYLES_ONF } from '../plugin/vision-styles-onf.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ici, '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const gdal = spawnSync('ogrinfo', ['--version']).status === 0;

const ID = '6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b';
const PROJET = '/sdcard/QField/vision';
const IMPORTS = PROJET + '/vision-imports';
const CACHE = IMPORTS + '/_cache-onf';
const ACTUEL = CACHE + '/actuel';
const SAUVE = CACHE + '/sauvegarde';
const DATE = new Date(2026, 10, 25, 17, 30, 0);
const H = L.cacheHorodatage(DATE);
const COUCHES = ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR'];
// Massif de la Serre (Jura) : x 895 717, y 6 679 283 en EPSG:2154 (x est, y nord ; vérifié par pyproj dans cache-onf-053).
const ZONE = { xmin: 893717, ymin: 6677283, xmax: 897717, ymax: 6681283 };

// ------------------------------------------------------------------------------------------- chemins, garde, mode
test('chemins fixes : vision-imports/_cache-onf/actuel/<couche>.gpkg (et .qml), sauvegarde dans _cache-onf/sauvegarde/', () => {
  assert.deepEqual(L.cacheCheminsFixes(PROJET, 'PARC_PUBL_FR'), {
    relatif: 'actuel/PARC_PUBL_FR.gpkg', gpkg: `${ACTUEL}/PARC_PUBL_FR.gpkg`, qml: `${ACTUEL}/PARC_PUBL_FR.qml`,
    gml: `${ACTUEL}/PARC_PUBL_FR.gml`, gfs: `${ACTUEL}/PARC_PUBL_FR.gfs`, wal: `${ACTUEL}/PARC_PUBL_FR.gpkg-wal`,
    sauvegarde: `${SAUVE}/PARC_PUBL_FR.gpkg` });
  assert.equal(L.cacheCheminsFixes('relatif', 'PRS_FR'), null);
  assert.equal(L.cacheCheminsFixes(PROJET, 'UG'), null);
  assert.deepEqual(L.CACHE_FIXE, { dossier: 'actuel', sauvegarde: 'sauvegarde', marque: 'vision/emplacement', valeur: 'actuel' });
});

test('garde : actuel/ et sauvegarde/ admis pour les seuls fichiers du cache ; rien d\'autre', () => {
  for (const d of ['actuel', 'sauvegarde']) {
    for (const s of ['.gpkg', '.qml', '.gml', '.gfs', '.gpkg-wal', '.gpkg-shm']) assert.ok(L.peutToucherCache(`${CACHE}/${d}/PRS_FR${s}`, IMPORTS), d + s);
  }
  for (const mauvais of [`${CACHE}/actuel/UG.gpkg`, `${CACHE}/actuel/x/PRS_FR.gpkg`, `${CACHE}/ACTUEL/PRS_FR.gpkg`, `${CACHE}/autre/PRS_FR.gpkg`,
    `${CACHE}/actuel/../PRS_FR.gpkg`, `${IMPORTS}/actuel/PRS_FR.gpkg`]) {
    assert.ok(!L.peutToucherCache(mauvais, IMPORTS), mauvais);
  }
});

test('mode « groupe » seulement si les trois couches fixes sont au projet ; sinon mode ancien (vision.qgz sans « ONF Cache »)', () => {
  const l = () => ({ isValid: true });
  assert.equal(L.cacheModeGroupe({ FOR_PUBL_FR: l(), PARC_PUBL_FR: l(), PRS_FR: l() }), true);
  assert.equal(L.cacheModeGroupe({ FOR_PUBL_FR: l(), PARC_PUBL_FR: l() }), false);
  assert.equal(L.cacheModeGroupe(null), false);
  assert.equal(L.cacheModeGroupe(undefined), false);
});

test('registre : une entrée « actuel/<couche>.gpkg » est saine ; ligne du panneau inchangée', () => {
  const reg = COUCHES.map((c, i) => ({ cache: 'onf', couche: c, chemin: `actuel/${c}.gpkg`, emprise: ZONE, date: DATE.toISOString(), objets: [4, 53, 1][i] }));
  assert.equal(L.entreesDuCache(reg).length, 3);
  assert.equal(L.cacheLignePanneau(reg), 'Cache ONF du 25/11/2026 : 4 forêts, 53 parcelles, 1 point de rencontre.');
  assert.equal(L.entreesDuCache([{ ...reg[0], chemin: 'actuel/PRS_FR.gpkg' }]).length, 0, 'fichier d\'une autre couche');
  assert.equal(L.entreesDuCache([{ ...reg[0], chemin: 'sauvegarde/FOR_PUBL_FR.gpkg' }]).length, 0, 'la sauvegarde n\'est jamais le cache');
});

// ------------------------------------------------------------------------------------------- GML vide, GDAL réel
test('GML vide : collection sans objet de forme MapServer ; son .gfs donne le schéma (type, système, champs)', () => {
  const g = L.cacheGmlVide();
  assert.match(g, /^<\?xml version='1\.0' encoding="UTF-8" \?>/);
  assert.equal((g.match(/<gml:featureMember>/g) || []).length, 0);
  assert.match(g, /<\/wfs:FeatureCollection>\s*$/);
  assert.equal(L.cacheJugerReponse('PRS_FR', { statut: 200, texte: g }).ok, true, 'même forme qu\'une réponse vide du service');
});

test('GML vide (GDAL réel) : réécrit en GeoPackage, 0 objet, MultiPolygon / Point, EPSG:2154, champs du service, table = nom du fichier',
  { skip: !gdal && 'GDAL absent' }, () => {
    const d = mkdtempSync(join(tmpdir(), 'vision-fixe-'));
    try {
      for (const c of L.CACHE_ONF.couches) {
        writeFileSync(join(d, c.couche + '.gml'), L.cacheGmlVide(), 'utf8');
        writeFileSync(join(d, c.couche + '.gfs'), L.cacheGfs(c.couche, 'msGeometry'), 'utf8');
        const gpkg = join(d, c.couche + '.gpkg');
        const w = spawnSync('ogr2ogr', ['-f', 'GPKG', '-oo', 'EXPOSE_GML_ID=NO', '-nln', c.couche, gpkg, join(d, c.couche + '.gml'), c.couche], { encoding: 'utf8' });
        assert.equal(w.status, 0, w.stderr);
        const r = spawnSync('ogrinfo', ['-json', '-so', gpkg, c.couche], { encoding: 'utf8' });
        assert.equal(r.status, 0, r.stderr);
        const j = JSON.parse(r.stdout).layers[0];
        assert.equal(j.featureCount, 0);
        assert.equal(j.geometryFields[0].type, c.wkb === 6 ? 'MultiPolygon' : 'Point', c.couche);
        assert.match(JSON.stringify(j.geometryFields[0].coordinateSystem), /2154/);
        assert.deepEqual(j.fields.map((f) => f.name), c.champs);
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

// ------------------------------------------------------------------------------------------- faux QField (mode groupe)
// Disque en mémoire : un « GeoPackage » porte un nombre d'objets. Couches fixes du projet : elles lisent leur chemin à
// l'ouverture du projet et le relisent à reload() (prouvé par la sonde C4) ; invalides si le fichier manquait à l'ouverture,
// et reload() ne les rend pas valides (QGIS 3a92eb3 qgsvectorlayer.cpp l. 437-447 : pas de setValid).
function fauxQField({ registre = [], fichiers = {}, panne = {} } = {}) {
  const disque = new Map(Object.entries(fichiers));
  const journal = [];
  const carte = [];
  const reglages = new Map([[L.cleRegistre(ID), JSON.stringify(registre)]]);
  const fixe = (c) => {
    const chemin = `${ACTUEL}/${c}.gpkg`;
    const l = { couche: c, chemin, isValid: disque.has(chemin), n: disque.has(chemin) ? disque.get(chemin).n : 0, readOnly: true,
      proprietes: { 'vision/cache': 'onf', 'vision/couche': c, 'vision/emplacement': 'actuel' } };
    l.relire = () => { if (l.isValid) { const f = disque.get(chemin); l.n = f ? f.n : 0; if (!f) l.isValid = false; } };
    return l;
  };
  const couchesFixes = { FOR_PUBL_FR: fixe('FOR_PUBL_FR'), PARC_PUBL_FR: fixe('PARC_PUBL_FR'), PRS_FR: fixe('PRS_FR') };
  const couche = (props) => ({
    isValid: true, readOnly: false, crs: { authid: props.authid }, n: props.n, nom: props.nom, uri: props.uri,
    proprietes: {}, wkbType() { return props.wkb; }, extent() { return { xMinimum: 895200, yMinimum: 6678800, xMaximum: 897100, yMaximum: 6680800 }; },
    setCustomProperty(k, v) { this.proprietes[k] = v; }, customProperty(k, d) { return k in this.proprietes ? this.proprietes[k] : d; },
  });
  const ctx = {
    visionId: ID, dossierProjet: PROJET, horodatage: H, date: DATE, emprise: ZONE, vraisemblance: EMPRISE_VRAISEMBLANCE,
    variables: { vision_id: ID },
    reglages: { value: (k, d) => (reglages.has(k) ? reglages.get(k) : d), setValue: (k, v) => reglages.set(k, v) },
    styles: STYLES_ONF,
    reponses: { FOR_PUBL_FR: { texte: 'gml-for', nbObjets: 4 }, PARC_PUBL_FR: { texte: 'gml-parc', nbObjets: 53 }, PRS_FR: { texte: 'gml-prs', nbObjets: 1 } },
    couchesFixes,
    ecrireFichier(chemin, texte) { journal.push('écrit ' + chemin); if (panne.ecrire === chemin) return false; disque.set(chemin, texte); return true; },
    effacerFichier(chemin) { journal.push('effacé ' + chemin); disque.delete(chemin); return true; },
    existe: (chemin) => disque.has(chemin),
    ouvrirCouche(uri, nom) {
      journal.push('ouvert ' + uri);
      const fichier = uri.split('|')[0];
      if (!disque.has(fichier)) return { isValid: false };
      const c = L.coucheOnf(fichier.replace(/^.*\//, '').replace(/\.[a-z]+$/, ''));
      if (/\.gml$/.test(fichier)) {
        const vide = disque.get(fichier) === L.cacheGmlVide();
        return couche({ uri, nom, n: vide ? 0 : ctx.reponses[c.couche].nbObjets, wkb: c.wkb, authid: 'EPSG:2154' });
      }
      const d = disque.get(fichier);
      return couche({ uri, nom, n: d.n, wkb: d.wkb, authid: d.authid });
    },
    creerIterateur(l) { let i = 0; return { hasNext: () => i < l.n, next: () => { i++; return {}; }, close() {} }; },
    imposerSysteme(l) { l.crs = { authid: 'EPSG:2154' }; },
    reecrireCouche(l, cible) { journal.push('réécrit ' + cible); disque.set(cible, { n: l.n, wkb: l.wkbType(), authid: l.crs.authid }); return cible; },
    renommer(de, vers) {
      journal.push(`renommé ${de} -> ${vers}`);
      if (panne.renommer && panne.renommer(de, vers)) return false;
      if (!disque.has(de)) return false;
      disque.set(vers, disque.get(de)); disque.delete(de); return true;
    },
    recharger(l) { journal.push('rechargé ' + l.couche); l.relire(); if (panne.relus && panne.relus === l.couche && l.isValid) l.n -= 1; },
    retirerCacheDeLaCarte() { journal.push('retirerCacheDeLaCarte'); },
    ajouterCache(l, nomCouche) { journal.push('ajouterCache ' + nomCouche); carte.push(l); },
    chargerCache(source, nom, c) { journal.push('chargerCache ' + c); const l = { isValid: true, readOnly: false, source, nom }; carte.push(l); return l; },
    chargerCouche: () => null,
  };
  return { ctx, disque, journal, carte, couchesFixes, registre: () => JSON.parse(reglages.get(L.cleRegistre(ID))) };
}
const vides = () => Object.fromEntries(COUCHES.map((c) => [`${ACTUEL}/${c}.gpkg`, { n: 0, wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' }]));
const renommages = (f) => f.journal.filter((x) => x.startsWith('renommé '));

// ------------------------------------------------------------------------------------------- bascule (nouveau cache)
test('mode groupe, cache réussi : génération contrôlée, bascule par renommage vers actuel/, reload(), jamais addMapLayer ni removeMapLayer', () => {
  const zipEntree = { zip: 'Serre.zip', couche: 'UG', chemin: 'Serre/UG.gpkg', style: 'UG' };
  const f = fauxQField({ registre: [zipEntree], fichiers: vides() });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.equal(r.message, 'Couches ONF en cache : 4 forêts, 53 parcelles, 1 point de rencontre (zone du 25/11/2026).');
  assert.ok(!f.journal.includes('retirerCacheDeLaCarte') && !f.journal.some((x) => x.startsWith('ajouterCache')), 'ni retrait ni ajout de couche');
  assert.equal(f.carte.length, 0);
  // Renommages : l'ancien de côté, puis le nouveau au chemin fixe, couche par couche ; puis reload des trois.
  assert.deepEqual(renommages(f), COUCHES.flatMap((c) => [
    `renommé ${ACTUEL}/${c}.gpkg -> ${SAUVE}/${c}.gpkg`, `renommé ${CACHE}/${H}/${c}.gpkg -> ${ACTUEL}/${c}.gpkg`]));
  const iRech = f.journal.indexOf('rechargé FOR_PUBL_FR');
  assert.ok(iRech > f.journal.lastIndexOf(renommages(f).at(-1)), 'reload après les six renommages');
  assert.deepEqual(COUCHES.map((c) => f.couchesFixes[c].n), [4, 53, 1], 'les couches du groupe relisent le nouveau cache');
  // Registre : chemin fixe, date, nombres, emprise ; l'entrée du zip reste.
  const reg = f.registre();
  assert.deepEqual(reg[0], zipEntree);
  assert.deepEqual(reg.slice(1).map((e) => [e.cache, e.couche, e.chemin, e.objets]),
    [['onf', 'FOR_PUBL_FR', 'actuel/FOR_PUBL_FR.gpkg', 4], ['onf', 'PARC_PUBL_FR', 'actuel/PARC_PUBL_FR.gpkg', 53], ['onf', 'PRS_FR', 'actuel/PRS_FR.gpkg', 1]]);
  assert.deepEqual(reg[1].emprise, ZONE);
  assert.equal(L.cacheLignePanneau(reg), 'Cache ONF du 25/11/2026 : 4 forêts, 53 parcelles, 1 point de rencontre.');
  // Fichiers : actuel/ rempli, style voisin écrit (pour le mode ancien) ; sauvegardes et fichiers de la génération effacés.
  for (const c of COUCHES) {
    assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, f.ctx.reponses[c].nbObjets);
    assert.equal(f.disque.get(`${ACTUEL}/${c}.qml`), STYLES_ONF[c]);
    assert.ok(!f.disque.has(`${SAUVE}/${c}.gpkg`), 'sauvegarde effacée');
    for (const s of ['.gpkg', '.qml', '.gml', '.gfs']) assert.ok(!f.disque.has(`${CACHE}/${H}/${c}${s}`), 'génération vidée : ' + c + s);
  }
});

test('mode groupe, second cache : l\'ancien est mis de côté puis effacé, le nouveau relu par les mêmes couches', () => {
  const f = fauxQField({ fichiers: vides() });
  assert.equal(L.cacheEnregistrer(f.ctx).ok, true);
  const H2 = L.cacheHorodatage(new Date(DATE.getTime() + 3600000));
  Object.assign(f.ctx, { horodatage: H2 });
  f.ctx.reponses.PRS_FR = { texte: 'gml-prs-2', nbObjets: 0 };
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.equal(f.couchesFixes.PRS_FR.n, 0);
  assert.deepEqual(f.registre().map((e) => e.chemin), COUCHES.map((c) => `actuel/${c}.gpkg`));
  for (const k of f.disque.keys()) assert.ok(!k.includes('/sauvegarde/') && !k.includes(`/${H}/`) && !k.includes(`/${H2}/`), k);
});

test('mode groupe : un journal -wal à côté d\'un fichier actuel : bascule refusée, aucun renommage, ancien cache gardé', () => {
  const fichiers = { ...vides(), [`${ACTUEL}/PARC_PUBL_FR.gpkg-wal`]: 'journal' };
  const f = fauxQField({ fichiers });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
  assert.match(r.raison, /-wal/);
  assert.deepEqual(renommages(f), []);
  assert.deepEqual(f.registre(), []);
  for (const k of f.disque.keys()) assert.ok(!k.includes(`/${H}/`), 'nouvelle génération effacée : ' + k);
  for (const c of COUCHES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, 0, 'actuel inchangé');
});

const H_SUIVANT = L.cacheHorodatage(new Date(DATE.getTime() + 60000));
for (const [nom, panne, attendus] of [
  // Renommages tentés, aller puis retour : 5 + 4 (forêts et parcelles remises), 4 + 3, 6 + 6.
  ['mise de côté des points refusée', { renommer: (de) => de === `${ACTUEL}/PRS_FR.gpkg` }, 9],
  ['bascule des parcelles refusée', { renommer: (de) => de === `${CACHE}/${H_SUIVANT}/PARC_PUBL_FR.gpkg` }, 7],
  ['parcelles relues avec un objet de moins après reload()', { relus: 'PARC_PUBL_FR' }, 12],
]) {
  test(`mode groupe, ${nom} : renommages inverses, reload, ancien cache relu et gardé (tout ou rien)`, () => {
    const premier = fauxQField({ fichiers: vides() });
    assert.equal(L.cacheEnregistrer(premier.ctx).ok, true);
    const avantDisque = new Map([...premier.disque].filter(([k]) => k.startsWith(ACTUEL + '/')));
    const avantReg = JSON.stringify(premier.registre());
    const f = fauxQField({ registre: premier.registre(), fichiers: Object.fromEntries(avantDisque), panne });
    const H2 = H_SUIVANT;
    Object.assign(f.ctx, { horodatage: H2 });
    f.ctx.reponses.FOR_PUBL_FR = { texte: 'gml-for-2', nbObjets: 7 };
    const r = L.cacheEnregistrer(f.ctx);
    assert.equal(r.ok, false);
    assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
    assert.equal(renommages(f).length, attendus, 'nombre de renommages (aller puis retour)');
    assert.equal(JSON.stringify(f.registre()), avantReg, 'registre inchangé');
    for (const c of COUCHES) {
      assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, avantDisque.get(`${ACTUEL}/${c}.gpkg`).n, 'ancien fichier remis : ' + c);
      assert.equal(f.couchesFixes[c].n, avantDisque.get(`${ACTUEL}/${c}.gpkg`).n - (panne.relus === c ? 1 : 0), 'couche relue : ' + c);
      assert.ok(!f.disque.has(`${SAUVE}/${c}.gpkg`), 'plus de sauvegarde : ' + c);
    }
    assert.ok(f.journal.lastIndexOf('rechargé PRS_FR') > f.journal.lastIndexOf(renommages(f).at(-1)), 'reload après le retour arrière');
    for (const k of f.disque.keys()) assert.ok(!k.includes(`/${H2}/`), 'nouvelle génération effacée : ' + k);
  });
}

test('mode groupe : services de bascule absents (renommer, recharger) : refus, rien n\'est touché', () => {
  for (const s of ['renommer', 'recharger']) {
    const f = fauxQField({ fichiers: vides() });
    delete f.ctx[s];
    const r = L.cacheEnregistrer(f.ctx);
    assert.equal(r.ok, false, s);
    assert.deepEqual(f.registre(), []);
  }
});

test('mode ancien (vision.qgz sans « ONF Cache ») : comportement de 0.7.0, cache en tête de liste par addMapLayer', () => {
  const f = fauxQField({ fichiers: vides() });
  f.ctx.couchesFixes = null;
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.deepEqual(renommages(f), []);
  assert.ok(f.journal.includes('retirerCacheDeLaCarte'));
  assert.deepEqual(f.journal.filter((x) => x.startsWith('ajouterCache')), COUCHES.map((c) => 'ajouterCache ' + c));
  assert.deepEqual(f.registre().map((e) => e.chemin), COUCHES.map((c) => `${H}/${c}.gpkg`));
});

// ------------------------------------------------------------------------------------------- ouverture du projet
const entreesGeneration = (h = H) => COUCHES.map((c, i) => ({ cache: 'onf', couche: c, chemin: `${h}/${c}.gpkg`, emprise: ZONE, date: DATE.toISOString(), objets: [4, 53, 1][i] }));
const entreesFixes = () => entreesGeneration().map((e) => ({ ...e, chemin: `actuel/${e.couche}.gpkg` }));
const generation = (h = H) => Object.fromEntries(COUCHES.flatMap((c, i) => [
  [`${CACHE}/${h}/${c}.gpkg`, { n: [4, 53, 1][i], wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' }], [`${CACHE}/${h}/${c}.qml`, STYLES_ONF[c]]]));

test('ouverture, mode groupe, cache déjà au chemin fixe : rien n\'est chargé ni renommé, aucun message', () => {
  const fichiers = vides();
  for (const c of COUCHES) fichiers[`${ACTUEL}/${c}.gpkg`] = { n: 9, wkb: 1, authid: 'EPSG:2154' };
  const f = fauxQField({ registre: entreesFixes(), fichiers });
  const r = L.demarrerProjet(f.ctx);
  assert.equal(r.message, '');
  assert.deepEqual(renommages(f), []);
  assert.equal(f.carte.length, 0, 'aucun chargerCache en mode groupe');
  assert.equal(r.cacheFixe.mode, 'groupe');
  assert.equal(r.cacheFixe.migration, '');
  assert.deepEqual(f.registre(), entreesFixes());
});

test('migration du cache 0.7.0 (génération horodatée, tête de liste) à la première ouverture en mode groupe, hors réseau', () => {
  const f = fauxQField({ registre: entreesGeneration(), fichiers: { ...vides(), ...generation() } });
  const r = L.demarrerProjet(f.ctx);
  assert.equal(r.message, '');
  assert.equal(r.cacheFixe.migration, 'faite');
  assert.equal(f.carte.length, 0, 'l\'ancien cache n\'est plus ajouté en tête de liste');
  assert.deepEqual(COUCHES.map((c) => f.couchesFixes[c].n), [4, 53, 1]);
  assert.deepEqual(f.registre().map((e) => [e.chemin, e.objets, e.date]), entreesFixes().map((e) => [e.chemin, e.objets, e.date]));
  for (const c of COUCHES) {
    assert.ok(!f.disque.has(`${CACHE}/${H}/${c}.gpkg`) && !f.disque.has(`${CACHE}/${H}/${c}.qml`), 'ancienne génération effacée');
    assert.ok(!f.disque.has(`${SAUVE}/${c}.gpkg`), 'sauvegarde (fichier vide) effacée');
    assert.equal(f.disque.get(`${ACTUEL}/${c}.qml`), STYLES_ONF[c]);
  }
});

test('migration impossible (un GeoPackage de la génération manque) : rien n\'est renommé, « Cache ONF illisible… », registre gardé', () => {
  const g = generation();
  delete g[`${CACHE}/${H}/PRS_FR.gpkg`];
  const f = fauxQField({ registre: entreesGeneration(), fichiers: { ...vides(), ...g } });
  const r = L.demarrerProjet(f.ctx);
  assert.equal(r.cacheFixe.migration, 'impossible');
  assert.deepEqual(renommages(f), []);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.cacheIllisible);
  assert.deepEqual(f.registre(), entreesGeneration());
});

test('migration : contrôle raté après reload (objets relus ≠ registre) : retour arrière, « Cache ONF illisible… »', () => {
  const f = fauxQField({ registre: entreesGeneration(), fichiers: { ...vides(), ...generation() }, panne: { relus: 'FOR_PUBL_FR' } });
  const r = L.demarrerProjet(f.ctx);
  assert.equal(r.cacheFixe.migration, 'impossible');
  assert.equal(r.message, L.TEXTES_CACHE_ONF.cacheIllisible);
  for (const c of COUCHES) assert.ok(f.disque.has(`${CACHE}/${H}/${c}.gpkg`), 'génération remise : ' + c);
  assert.deepEqual(f.registre(), entreesGeneration());
});

test('ouverture, mode groupe, fichiers fixes absents (vision.qgz copié avant le plugin) : couches invalides dites, fichiers créés pour la fois suivante', () => {
  const f = fauxQField({ registre: [] });
  const r = L.demarrerProjet(f.ctx);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.cacheIllisible);
  assert.deepEqual(r.cacheFixe.crees, COUCHES);
  for (const c of COUCHES) {
    assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, 0, 'GeoPackage vide créé : ' + c);
    assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).wkb, L.coucheOnf(c).wkb);
    assert.equal(f.disque.get(`${ACTUEL}/${c}.qml`), STYLES_ONF[c]);
    assert.ok(!f.disque.has(`${ACTUEL}/${c}.gml`) && !f.disque.has(`${ACTUEL}/${c}.gfs`), 'fichiers de travail effacés');
  }
  // Ouverture suivante : les couches sont valides (fichiers présents dès l'ouverture), plus de message.
  const g = fauxQField({ registre: [], fichiers: Object.fromEntries(f.disque) });
  assert.equal(L.demarrerProjet(g.ctx).message, '');
});

test('ouverture, mode ancien : fichiers fixes créés s\'ils manquent (plugin d\'abord, puis vision.qgz), cache 0.7.0 rechargé comme avant', () => {
  const f = fauxQField({ registre: entreesGeneration(), fichiers: generation() });
  f.ctx.couchesFixes = null;
  const r = L.demarrerProjet(f.ctx);
  assert.equal(r.cacheFixe.mode, 'ancien');
  assert.deepEqual(r.cacheFixe.crees, COUCHES);
  assert.deepEqual(r.cache, { rechargees: COUCHES, manquantes: [] });
  assert.deepEqual(f.journal.filter((x) => x.startsWith('chargerCache')), COUCHES.map((c) => 'chargerCache ' + c));
  assert.equal(r.message, '');
  for (const c of COUCHES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, 0);
  // Déjà là : rien n'est réécrit.
  const g = fauxQField({ registre: entreesGeneration(), fichiers: Object.fromEntries(f.disque) });
  g.ctx.couchesFixes = null;
  assert.deepEqual(L.demarrerProjet(g.ctx).cacheFixe.crees, []);
  assert.ok(!g.journal.some((x) => x.startsWith('réécrit ')));
});

test('ouverture, mode ancien avec un cache au chemin fixe (retour à un ancien vision.qgz) : rechargé depuis actuel/ en tête de liste', () => {
  const fichiers = vides();
  const f = fauxQField({ registre: entreesFixes(), fichiers });
  f.ctx.couchesFixes = null;
  const r = L.demarrerProjet(f.ctx);
  assert.deepEqual(r.cache.rechargees, COUCHES);
  assert.deepEqual(f.carte.map((l) => l.source), COUCHES.map((c) => `${ACTUEL}/${c}.gpkg|layername=${c}`));
});

test('ouverture : création d\'un fichier fixe refusée : pas d\'exception, rien d\'autre touché', () => {
  const f = fauxQField({ registre: [], panne: { ecrire: `${ACTUEL}/PARC_PUBL_FR.gml` } });
  const r = L.demarrerProjet(f.ctx);
  assert.deepEqual(r.cacheFixe.crees, ['FOR_PUBL_FR', 'PRS_FR']);
  assert.deepEqual(r.cacheFixe.echecs, ['PARC_PUBL_FR']);
  assert.ok(!f.disque.has(`${ACTUEL}/PARC_PUBL_FR.gpkg`));
});

test('ouverture sans les services d\'écriture (ancien contrat) : rien n\'est créé ni renommé', () => {
  const f = fauxQField({ registre: [] });
  for (const s of ['ecrireFichier', 'reecrireCouche', 'ouvrirCouche', 'renommer', 'recharger']) delete f.ctx[s];
  const r = L.demarrerProjet(f.ctx);
  assert.deepEqual(r.cacheFixe.crees, []);
  assert.equal(f.disque.size, 0);
});

// ------------------------------------------------------------------------------------------- pont QML et panneau
const qml = () => lire('plugin/Vision.qml');
function sectionCache() {
  const q = qml();
  const debut = q.indexOf('// ==== cache ONF (mission 053');
  const fin = q.indexOf('// ==== cache ONF : fin');
  assert.ok(debut >= 0 && fin > debut);
  return q.slice(debut, fin).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
}

test('Vision.qml : couches fixes trouvées par marques (vision/cache, vision/couche, vision/emplacement), jamais par le nom', () => {
  const s = sectionCache();
  const f = s.slice(s.indexOf('function couchesFixesDuCache'), s.indexOf('\n  }\n', s.indexOf('function couchesFixesDuCache')));
  for (const a of ['"vision/cache"', '"vision/couche"', 'Logique.CACHE_FIXE.marque', 'Logique.cacheModeGroupe']) assert.ok(f.includes(a), a);
  assert.ok(!/\.name\b|layerName|\(© ONF\)/.test(f), 'aucune recherche par le nom');
});

test('Vision.qml : bascule par platformUtilities.renameFile(…, true), reload() puis triggerRepaint() ; couches fixes jamais retirées ni rechargées par addMapLayer', () => {
  const s = sectionCache();
  assert.ok(s.includes('platformUtilities.renameFile(de, vers, true)'));
  assert.match(s, /\.reload\(\);\s*\w+\.triggerRepaint\(\);/);
  for (const f of ['function retirerCacheDeLaCarte', 'function coucheDuCache']) {
    const corps = s.slice(s.indexOf(f), s.indexOf('\n  }\n', s.indexOf(f)));
    assert.ok(corps.includes('Logique.CACHE_FIXE.marque'), f + ' : les couches fixes sont écartées');
  }
  assert.match(s, /couchesFixes: couchesFixesDuCache\(\)/);
  const q = qml();
  const demarrer = q.slice(q.indexOf('function demarrer()'), q.indexOf('function ajouterZip()'));
  for (const a of ['couchesFixes: couchesFixesDuCache()', 'renommer:', 'recharger:', 'ecrireFichier:', 'reecrireCouche:', 'ouvrirCouche:', 'effacerFichier:', 'styles: StylesOnf.STYLES_ONF', 'creerIterateur:']) {
    assert.ok(demarrer.includes(a), 'demarrer : ' + a);
  }
});

test('sonde C4 retirée : ni code, ni bouton, ni texte dans le plugin ; son test de garde n\'existe plus', () => {
  // Le code et les textes, hors commentaires (les commentaires citent la sonde comme preuve, § 14 bis).
  const code = (f) => lire(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/ .*$/, '')).join('\n');
  for (const f of ['plugin/Vision.qml', 'plugin/Panneau.qml', 'plugin/vision-logique.mjs', 'plugin/main.qml']) {
    assert.ok(!/sonde ?C4|sondeC4|SONDE_C4|_sonde-c4|vision\/sonde/i.test(code(f)), f);
  }
  assert.ok(!/Sonde C4/.test(lire('plugin/Panneau.qml')), 'aucun bouton ni texte de sonde dans le panneau');
  assert.ok(!existsSync(join(RACINE, 'tests/sonde-c4-053.test.mjs')), 'la garde « sonde présente seulement en 0.7.0 » est remplacée par celle-ci');
  assert.equal(L.VERSION, '0.7.0', 'version du plugin gardée (préversion plugin-essai)');
});

test('plugin/PLAN.md § 5 : appels de la bascule inscrits (renameFile, reload, triggerRepaint, marque vision/emplacement)', () => {
  const plan = lire('plugin/PLAN.md');
  const s5 = plan.slice(plan.indexOf('## 5.'), plan.indexOf('## 6.'));
  for (const a of ['platformUtilities.renameFile', 'reload()', 'triggerRepaint()', 'vision/emplacement']) assert.ok(s5.includes(a), a);
});

// ------------------------------------------------------------------------------------------- pièce § 15 et README
test('pièce § 15 : ce qui est fait et protocole Samsung du temps 3 (première installation, zone, bascule, réouverture, mode ancien, migration, hors réseau)', () => {
  const doc = lire('docs/referentiels/cache-zone-qfield.md');
  assert.ok(doc.includes('## 15.'), '§ 15 absent');
  const s = doc.slice(doc.indexOf('## 15.'));
  for (const m of ['projet-vision.zip', 'ONF Cache', 'ONF WFS', 'renameFile', 'reload()', 'mode avion', 'réouverture', 'mode ancien', 'migration', 'plugin d\'abord', '-wal']) {
    assert.ok(s.includes(m), m);
  }
});

test('README : groupes « ONF Cache » et « ONF WFS », consigne « plugin d\'abord, puis vision.qgz »', () => {
  const r = lire('README.md');
  assert.ok(r.includes('« ONF Cache »') && r.includes('« ONF WFS »'));
  assert.match(r, /plugin d'abord/i);
  assert.ok(!/Le cache s'affiche en tête de liste/.test(r), 'ancienne phrase du mode tête de liste retirée');
});
