// SPDX-License-Identifier: GPL-3.0-or-later
// Mission 014 (reprise du 26 novembre 2026, temps 1) : tests d'acceptation du registre complet.
// Écrits par le testeur SANS lire plugin/ (seuls les noms d'API et les mocks des tests existants servent de contrat :
// tests/squelette.test.mjs, tests/retrait-nettoyage.test.mjs). Sources : spec § 3.3, § 11 n° 2 et 3, fiche 014.
//
// Deux familles :
//   R-xx : règles du § 3.3 (un test par règle ; la plupart sont déjà tenues -> verts, c'est dit dans le titre « [déjà tenu ?] »
//          seulement après exécution : voir le rendu du testeur) ;
//   D-xx : décisions de Pascal du 26 novembre 2026 : D1 = dossier vide LAISSÉ (variante B : aucun appel d'effacement de dossier,
//          aucun message), D2 = dossier entier remplacé au réimport, D3 = annexes d'une couche gardée effacées avant sa réécriture.
//
// Contrat de D1 : le mock enregistre dans appelsDossier TOUT appel à une fonction de platformUtilities autre que rmFile (removeDataset,
// removeFolder...), à FileUtils.deleteFiles ou à une fonction de dossier de ctx ; D1 exige que cette liste reste vide.
// (Avant le 26 novembre, le contrat supposait un effacement de dossier à la QDir::rmdir ; la voie réelle, removeDataset, ouvre une
// boîte de confirmation : écartée par Pascal.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ecrireZip } from './recette/essai/zip-ecrire.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ici = dirname(fileURLToPath(import.meta.url));
const MODULE = join(process.env.VISION_PLUGIN_014 || join(ici, '..', 'plugin'), 'vision-logique.mjs');
const R = "rouge attendu jusqu'à la mission 014";

let charge;
const S = await import(join(ici, '..', 'plugin', 'vision-styles.mjs'));
async function M() {
  if (!existsSync(MODULE)) throw new Error(`${MODULE} absent : ${R}`);
  if (!charge) charge = await import(MODULE);
  return charge;
}

const ID = 'd98bf4b8-0fac-4dac-85cf-58e6701aceeb';
const PROJET = '/storage/emulated/0/Android/data/ch.opengis.qfield/files/Imported Projects/Serre';
const COPIES = `${PROJET}/vision-imports`;
const DATE = '2026-11-04T10:00:00.000Z';

const dossierDe = (zip) => zip.replace(/\.zip$/, '');
const vec = (zip, couche, extra = {}) => ({ zip, couche, chemin: `${dossierDe(zip)}/${couche}.gpkg`, style: 'defaut', ajoutee_le: DATE, ...extra });
const vsi = (zip, couche) => ({ zip, couche, chemin_vsi: `${zip}/${couche}.tif`, style: 'defaut', ajoutee_le: DATE });
const SUFFIXES = ['.gpkg', '.qml', '.gpkg-wal', '.gpkg-shm', '.gpkg.aux.xml'];
const fichiers = (zip, couche) => SUFFIXES.map((s) => `${COPIES}/${dossierDe(zip)}/${couche}${s}`);
const trie = (l) => [...l].sort();
const sansSlash = (c) => (typeof c === 'string' ? c.replace(/\/+$/, '') : c);

// ---- Simulation de QField : disque, dossiers, réglages ---------------------------------------------------
function faussesReglages(entrees, cle = `vision/${ID}`) {
  const m = new Map(entrees ? [[cle, JSON.stringify(entrees)]] : []);
  return { magasin: m, ecritures: [], value(c, d) { return m.has(c) ? m.get(c) : d; }, setValue(c, v) { m.set(c, v); this.ecritures.push(c); } };
}

// `rate` : rmFile répond faux ; `sansServiceDossier` : aucun moyen d'effacer un dossier (variante « dossier vide laissé »).
function disqueSimule({ disque = [], dossiersEnPlus = [], rate = [], sansServiceDossier = false, registre = [] } = {}) {
  const fichiersSur = new Set(disque);
  const dossiers = new Set(dossiersEnPlus.map(sansSlash));
  for (const f of fichiersSur) { const m = /^(.*\/vision-imports\/[^/]+)\/[^/]+$/.exec(f); if (m) dossiers.add(m[1]); }
  const journal = [];
  const appelsFichier = [];
  const appelsDossier = [];
  const sousDossier = (d) => [...fichiersSur].some((f) => f.startsWith(d + '/'));
  const rm = (chemin) => {
    journal.push('effacer ' + chemin); appelsFichier.push(chemin);
    if (!fichiersSur.has(chemin) || rate.includes(chemin)) return false;
    fichiersSur.delete(chemin);
    return true;
  };
  const rmdir = (chemin) => {
    const d = sansSlash(chemin);
    journal.push('dossier ' + d); appelsDossier.push(d);
    if (!dossiers.has(d) || sousDossier(d)) return false; // QDir::rmdir : refuse un dossier non vide
    dossiers.delete(d);
    return true;
  };
  const base = { rmFile: rm };
  const platformUtilities = sansServiceDossier ? base
    : new Proxy(base, { get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string' || k === 'then') return undefined; return rmdir; } });
  const serviceDossier = sansServiceDossier ? {} : { effacerDossier: rmdir, supprimerDossier: rmdir, rmdir, rmDir: rmdir, removeDir: rmdir, removeFolder: rmdir, removeDataset: rmdir, FileUtils: { deleteFiles: rmdir } };
  const reglages = faussesReglages(registre);
  return {
    fichiersSur, dossiers, journal, appelsFichier, appelsDossier, reglages, rm, rmdir,
    services: { reglages, platformUtilities, ...serviceDossier, effacerFichier: rm, existe: (c) => fichiersSur.has(c) || dossiers.has(sansSlash(c)) },
  };
}

function mondeRetrait({ entrees, ...opts }) {
  const d = disqueSimule({ ...opts, registre: entrees });
  const ctx = { visionId: ID, dossierProjet: PROJET, zip: 'z.zip', couche: 'a', retirerDeLaCarte: (nom) => { d.journal.push('carte ' + nom); }, ...d.services };
  return { ...d, ctx };
}
const retire = async (w, extra = {}) => { const m = await M(); return await Promise.resolve(m.retirerCouche({ ...w.ctx, ...extra })); };

const GJ = '{"type":"FeatureCollection","features":[]}';
const zipDe = (...noms) => ecrireZip(noms.map((nom) => ({ nom: Buffer.from(nom, 'utf8'), donnees: Buffer.from(GJ), stocke: false, utf8: true })));
const OK = { charge: true, controle: null, message: null, avertissements: [] };
const REFUS = { charge: false, controle: 5, message: 'a.geojson : Coordonnées incohérentes : système mal déclaré ?', avertissements: [] };

function mondeImport(opts = {}) {
  const d = disqueSimule(opts);
  const ctx = {
    visionId: ID, dossierProjet: PROJET, nomZip: 'deux.zip', octets: zipDe('a.geojson', 'sous/b.geojson'),
    maintenant: () => new Date(DATE),
    ouvrirCouche: (source, nom) => ({ source, name: nom, isValid: true, readOnly: false }),
    decrireCouche: () => ({ lisible: true, systeme: 'EPSG:2154', nbEntites: 1, emprise: [600000, 6800000, 601000, 6801000] }),
    controlerCouche: () => OK,
    reecrireCouche: (c, cible) => { d.journal.push('reecrire ' + cible); d.fichiersSur.add(cible); d.dossiers.add(dirname(cible)); return cible; },
    ecrireFichier: (chemin) => { d.journal.push('ecrire ' + chemin); d.fichiersSur.add(chemin); d.dossiers.add(dirname(chemin)); return true; },
    ajouterALaCarte: () => {},
    styles: S,
    infosCouche: () => ({ geometrie: 'polygone', champs: ['code_ug'] }),
    lireTexte: () => null,
    ...d.services,
  };
  return { ...d, ctx };
}
const importe = async (w, extra = {}) => { const m = await M(); return await Promise.resolve(m.importerZip({ ...w.ctx, ...extra })); };
const couchesDe = (m, reglages, zip) => m.lireRegistre(reglages, ID).filter((x) => x.zip === zip).map((x) => x.couche);
const D_DEUX = `${COPIES}/deux`;

// =====================================================================================================
// RÈGLES DU § 3.3
// =====================================================================================================

test('R-01 identifiant : sans vision_id (absent, vide, non UUID), le plugin n\'agit pas : rien écrit, rien effacé, rien chargé', async () => {
  const m = await M();
  for (const variables of [{}, { vision_id: '' }, { vision_id: '../..' }, { vision_id: 'pas-un-uuid' }, null]) {
    const d = disqueSimule({ disque: fichiers('z.zip', 'a'), registre: [vec('z.zip', 'a')] });
    const chargees = [];
    const r = await Promise.resolve(m.demarrerProjet({ variables, reglages: d.reglages, dossierProjet: PROJET, existe: d.services.existe, chargerCouche: (s, n) => { chargees.push(n); return {}; } }));
    assert.equal(r.actif, false, JSON.stringify(variables));
    assert.deepEqual(chargees, [], JSON.stringify(variables));
    assert.deepEqual(d.reglages.ecritures, [], JSON.stringify(variables));
    assert.deepEqual(d.appelsFichier, [], JSON.stringify(variables));
  }
});

test('R-02 registre : clé vision/<vision_id>, valeur JSON, entrée vecteur { zip, couche, chemin relatif, style, ajoutee_le }, écrite à chaque couche chargée', async () => {
  const m = await M();
  const w = mondeImport();
  await importe(w);
  assert.deepEqual([...w.reglages.magasin.keys()], [`vision/${ID}`]);
  const liste = JSON.parse(w.reglages.magasin.get(`vision/${ID}`));
  assert.deepEqual(liste.map((x) => x.chemin), ['deux/a.gpkg', 'deux/b.gpkg']);
  for (const en of liste) {
    assert.deepEqual(Object.keys(en).sort(), ['ajoutee_le', 'chemin', 'couche', 'style', 'zip']);
    assert.equal(en.zip, 'deux.zip');
    assert.ok(!en.chemin.startsWith('/') && !en.chemin.includes('..'));
  }
  assert.ok(w.reglages.ecritures.length >= 2, 'une écriture au moins par couche chargée');
  assert.deepEqual(m.lireRegistre(w.reglages, ID).map((x) => x.couche), ['a', 'b']);
});

test('R-03 registre accumulé : un second zip s\'ajoute sans toucher au premier ; il survit à un « redémarrage » (réglages relus)', async () => {
  const m = await M();
  const w = mondeImport();
  await importe(w);
  await importe(w, { nomZip: 'trois.zip', octets: zipDe('c.geojson') });
  assert.deepEqual(m.lireRegistre(w.reglages, ID).map((x) => `${x.zip}/${x.couche}`), ['deux.zip/a', 'deux.zip/b', 'trois.zip/c']);
  const relus = faussesReglages(); relus.magasin.set(`vision/${ID}`, w.reglages.magasin.get(`vision/${ID}`));
  const chargees = [];
  const r = await Promise.resolve(m.demarrerProjet({ variables: { vision_id: ID }, reglages: relus, dossierProjet: PROJET, existe: () => true, chargerCouche: (s, n) => { chargees.push(n); return { source: s, name: n, isValid: true, readOnly: false }; } }));
  assert.equal(r.actif, true);
  assert.deepEqual(chargees, ['a', 'b', 'c']);
});

test('R-04 copies : tout ce que le plugin écrit ou efface est directement sous <dossier du projet>/vision-imports/<zip sans .zip>/ (jamais ailleurs, jamais _cache-onf, jamais saisie.gpkg)', async () => {
  const w = mondeImport({ disque: [`${PROJET}/vision.qgz`, `${PROJET}/saisie.gpkg`, `${COPIES}/_cache-onf/actuel/FOR_PUBL_FR.gpkg`] });
  await importe(w);
  await importe(w, { octets: zipDe('a.geojson') });
  const m = await M();
  await Promise.resolve(m.retirerCouche({ ...w.ctx, zip: 'deux.zip', couche: 'a', retirerDeLaCarte: () => {} }));
  const touches = w.journal.filter((l) => /^(effacer|ecrire|reecrire|dossier) /.test(l)).map((l) => l.replace(/^\S+ /, ''));
  assert.ok(touches.length > 0);
  for (const c of touches) assert.match(c, new RegExp('^' + (COPIES + '/').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(deux|deux\\.zip)(/[^/]+)?$'), c);
  for (const sauf of [`${PROJET}/vision.qgz`, `${PROJET}/saisie.gpkg`, `${COPIES}/_cache-onf/actuel/FOR_PUBL_FR.gpkg`]) assert.equal(w.fichiersSur.has(sauf), true, sauf);
});

test('R-05 nom de zip au registre : une entrée au nom douteux est retirée du registre, sans qu\'aucun fichier soit effacé (ouverture du projet)', async () => {
  const m = await M();
  for (const zip of ['../x.zip', 'a/b.zip', '/etc/x.zip', '..']) {
    const d = disqueSimule({ disque: [`${COPIES}/x/c.gpkg`, `${PROJET}/x/c.gpkg`, ...fichiers('z.zip', 'a')], registre: [{ zip, couche: 'c', chemin: `${zip}/c.gpkg`, style: 'defaut', ajoutee_le: DATE }, vec('z.zip', 'a')] });
    await Promise.resolve(m.demarrerProjet({ variables: { vision_id: ID }, reglages: d.reglages, dossierProjet: PROJET, existe: d.services.existe, chargerCouche: (s, n) => ({ source: s, name: n, isValid: true, readOnly: false }) }));
    assert.deepEqual(d.appelsFichier, [], zip);
    assert.deepEqual(d.appelsDossier, [], zip);
    assert.deepEqual(m.lireRegistre(d.reglages, ID).map((x) => x.zip), ['z.zip'], `${zip} : entrée douteuse retirée, l'autre gardée`);
  }
});

test('R-06 vision_id non UUID : le projet est refusé, rien n\'est écrit ni effacé (import et retrait)', async () => {
  for (const id of ['../..', 'pas-un-uuid', '', 'a/b']) {
    const w = mondeImport({ disque: fichiers('deux.zip', 'a'), registre: [vec('deux.zip', 'a')] });
    const avant = [...w.reglages.magasin.entries()];
    await importe(w, { visionId: id });
    const r = mondeRetrait({ entrees: [vec('z.zip', 'a')], disque: fichiers('z.zip', 'a') });
    await retire(r, { visionId: id });
    assert.deepEqual([...w.reglages.magasin.entries()], avant, `import, visionId « ${id} »`);
    assert.deepEqual(w.appelsFichier, [], id);
    assert.deepEqual(r.appelsFichier, [], id);
    assert.deepEqual(r.appelsDossier, [], id);
  }
});

test('R-07 zip réimporté sous le même nom : une seule entrée par couche, la couche est réécrite à la même place (le nouveau remplace l\'ancien)', async () => {
  const m = await M();
  const w = mondeImport();
  await importe(w);
  w.journal.length = 0;
  await importe(w);
  assert.deepEqual(m.lireRegistre(w.reglages, ID).map((x) => x.couche), ['a', 'b']);
  const reecrites = w.journal.filter((l) => l.startsWith('reecrire ')).map((l) => l.slice(9));
  assert.deepEqual(trie(reecrites), [`${D_DEUX}/a.gpkg`, `${D_DEUX}/b.gpkg`]);
});

test('R-08 ancien .qml : effacé AVANT l\'écriture du nouveau (spec § 3.3, § 5 ; couche au style du manuel, ici UG)', async () => {
  const w = mondeImport({ octets: zipDe('UG.geojson') });
  await importe(w, { octets: zipDe('UG.geojson') });
  assert.equal(w.fichiersSur.has(`${D_DEUX}/UG.qml`), true, 'l\'import écrit UG.qml (style du manuel)');
  w.journal.length = 0;
  await importe(w, { octets: zipDe('UG.geojson') });
  const iEff = w.journal.indexOf(`effacer ${D_DEUX}/UG.qml`);
  const iEcr = w.journal.indexOf(`ecrire ${D_DEUX}/UG.qml`);
  assert.ok(iEff >= 0, `l'ancien UG.qml doit être effacé : ${w.journal.join(' | ')}`);
  assert.ok(iEcr >= 0 && iEff < iEcr, `effacement (${iEff}) avant écriture (${iEcr}) : ${w.journal.join(' | ')}`);
});

test('R-09 zip absent (GeoTIFF et anciennes entrées chemin_vsi) : l\'entrée reste, UN message « N couches n\'ont pas pu être rechargées : zip absent »', async () => {
  const m = await M();
  const d = disqueSimule({ registre: [vsi('r.zip', 't1'), vsi('r.zip', 't2')] });
  const avant = d.reglages.magasin.get(`vision/${ID}`);
  const r = await Promise.resolve(m.demarrerProjet({ variables: { vision_id: ID }, reglages: d.reglages, dossierProjet: PROJET, existe: () => false, chargerCouche: () => null }));
  assert.equal(r.message, "2 couches n'ont pas pu être rechargées : zip absent");
  assert.equal(d.reglages.magasin.get(`vision/${ID}`), avant, 'entrées gardées, registre inchangé');
});

test('R-10 copie absente (vecteur) : l\'entrée reste, UN message « N couches n\'ont pas pu être rechargées : copie absente (réimporter le zip) »', async () => {
  const m = await M();
  const d = disqueSimule({ registre: [vec('z.zip', 'a'), vec('z.zip', 'b'), vec('z.zip', 'c')] });
  const avant = d.reglages.magasin.get(`vision/${ID}`);
  const r = await Promise.resolve(m.demarrerProjet({ variables: { vision_id: ID }, reglages: d.reglages, dossierProjet: PROJET, existe: () => false, chargerCouche: () => null }));
  assert.equal(r.message, "3 couches n'ont pas pu être rechargées : copie absente (réimporter le zip)");
  assert.equal(d.reglages.magasin.get(`vision/${ID}`), avant);
});

test('R-11 vecteur réécrit : GeoJSON -> GeoPackage dans vision-imports/<zip>/, .qml du manuel à côté (UG), couche chargée depuis la copie', async () => {
  const w = mondeImport();
  const ajoutees = [];
  await importe(w, { octets: zipDe('UG.geojson', 'b.geojson'), ajouterALaCarte: (c, nom, source) => ajoutees.push({ nom, source }) });
  for (const c of ['UG', 'b']) assert.equal(w.fichiersSur.has(`${D_DEUX}/${c}.gpkg`), true, `${c}.gpkg écrit`);
  assert.equal(w.fichiersSur.has(`${D_DEUX}/UG.qml`), true, 'UG.qml écrit à côté');
  assert.deepEqual(ajoutees.map((x) => x.source), [`${D_DEUX}/UG.gpkg`, `${D_DEUX}/b.gpkg`]);
});

test('R-12 retrait : efface .gpkg, .qml, -wal, -shm, .aux.xml de la couche, et eux seuls ; la couche quitte le registre et la carte avant', async () => {
  const m = await M();
  const w = mondeRetrait({ entrees: [vec('z.zip', 'a'), vec('z.zip', 'a2')], disque: [...fichiers('z.zip', 'a'), ...fichiers('z.zip', 'a2')] });
  await retire(w);
  assert.deepEqual(trie(w.appelsFichier), trie(fichiers('z.zip', 'a')));
  assert.deepEqual(m.lireRegistre(w.reglages, ID).map((x) => x.couche), ['a2']);
  assert.ok(w.journal.indexOf('carte a') === 0, w.journal.join(' | '));
});

test('R-13 cache ONF : un zip n\'entame jamais les entrées « cache » du registre ni le dossier _cache-onf/ (retrait, réimport)', async () => {
  const m = await M();
  const cache = { cache: 'onf', couche: 'FOR_PUBL_FR', chemin: 'actuel/FOR_PUBL_FR.gpkg', emprise: [600000, 6800000, 601000, 6801000], date: DATE, objets: 3 };
  const cf = `${COPIES}/_cache-onf/actuel/FOR_PUBL_FR.gpkg`;
  const w = mondeRetrait({ entrees: [vec('z.zip', 'a'), cache], disque: [...fichiers('z.zip', 'a'), cf] });
  await retire(w);
  assert.equal(w.fichiersSur.has(cf), true);
  assert.ok(m.lireRegistre(w.reglages, ID).some((x) => x.cache === 'onf' && x.couche === 'FOR_PUBL_FR'), 'entrée du cache gardée');
  for (const c of [...w.appelsFichier, ...w.appelsDossier]) assert.ok(!c.includes('_cache-onf'), c);
  const i = mondeImport({ disque: [cf], registre: [cache] });
  await importe(i);
  await importe(i, { octets: zipDe('a.geojson') });
  assert.equal(i.fichiersSur.has(cf), true);
  assert.ok(m.lireRegistre(i.reglages, ID).some((x) => x.cache === 'onf'), 'entrée du cache gardée après réimport');
  for (const c of [...i.appelsFichier, ...i.appelsDossier]) assert.ok(!c.includes('_cache-onf'), c);
});

test('R-14 nom réservé : un zip _cache-onf.zip (casse ignorée) est refusé, rien n\'est importé, écrit ni effacé (texte de la spec § 3.3)', async () => {
  for (const nomZip of ['_cache-onf.zip', '_CACHE-ONF.zip']) {
    const w = mondeImport();
    const r = await importe(w, { nomZip });
    assert.match(r.message, /^`?_cache-onf\.zip`? : nom réservé par Vision \(cache ONF\), rien n'est importé\.$/i, `${nomZip} : ${r.message}`);
    assert.deepEqual(w.journal, [], nomZip);
    assert.deepEqual(w.reglages.ecritures, [], nomZip);
  }
});

test('R-15 zip abîmé au réimport : les couches gardées sur la carte ne sont pas touchées (aucun effacement, registre intact ; fiche 014, ajout du 4 novembre)', async () => {
  const w = mondeImport();
  await importe(w);
  const avant = w.reglages.magasin.get(`vision/${ID}`);
  const fichiersAvant = trie([...w.fichiersSur]);
  w.journal.length = 0;
  await Promise.resolve(importe(w, { octets: Buffer.from('ceci n\'est pas un zip') })).catch(() => {});
  assert.deepEqual(w.appelsFichier, [], 'aucun effacement');
  assert.deepEqual(w.appelsDossier, []);
  assert.equal(w.reglages.magasin.get(`vision/${ID}`), avant);
  assert.deepEqual(trie([...w.fichiersSur]), fichiersAvant);
});

// =====================================================================================================
// DÉCISION 1 (26 novembre 2026, variante B de Pascal) : le dossier vide est LAISSÉ
// =====================================================================================================
const R1 = "rouge attendu jusqu'à la mission 014 (D1 : dossier vide laissé, aucun appel de dossier)";
// Un « appel de dossier » est tout appel à une fonction de platformUtilities autre que rmFile (removeDataset, removeFolder, ...),
// à FileUtils.deleteFiles, ou à une des fonctions de dossier de ctx : le mock les enregistre toutes dans appelsDossier.
const sansMessageDossier = (message) => assert.ok(!/dossier|\bvide\b|folder|dataset/i.test(message ?? ''), `le plugin se tait sur le dossier : « ${message} »`);

test('D1-01 retrait de la dernière couche d\'un zip : fichiers et copie du zip effacés, le dossier vision-imports/z/ est LAISSÉ (aucun appel de dossier), aucun message sur le dossier', async () => {
  const w = mondeRetrait({ entrees: [vec('z.zip', 'a')], disque: [...fichiers('z.zip', 'a'), `${COPIES}/z.zip`] });
  const r = await retire(w);
  for (const f of [...fichiers('z.zip', 'a'), `${COPIES}/z.zip`]) assert.equal(w.fichiersSur.has(f), false, f);
  assert.deepEqual(w.appelsDossier, [], `aucun appel d'effacement de dossier (ni removeDataset, ni removeFolder, ni FileUtils.deleteFiles) : ${R1}`);
  assert.equal(w.dossiers.has(`${COPIES}/z`), true, 'le dossier vide est laissé');
  sansMessageDossier(r.message);
  assert.ok(!/Fichiers restés/.test(r.message ?? ''), r.message);
});

test('D1-02 retrait d\'une couche alors que d\'autres restent dans le zip : le dossier reste, aucun appel de dossier, les autres couches intactes', async () => {
  const w = mondeRetrait({ entrees: [vec('z.zip', 'a'), vec('z.zip', 'b')], disque: [...fichiers('z.zip', 'a'), ...fichiers('z.zip', 'b')] });
  await retire(w);
  assert.equal(w.dossiers.has(`${COPIES}/z`), true);
  assert.deepEqual(w.appelsDossier, [], R1);
  for (const f of fichiers('z.zip', 'b')) assert.equal(w.fichiersSur.has(f), true, f);
});

test('D1-03 un fichier résiste à l\'effacement : son nom est dit comme avant (031), aucun appel de dossier, aucun message sur le dossier', async () => {
  const [g] = fichiers('z.zip', 'a');
  const w = mondeRetrait({ entrees: [vec('z.zip', 'a')], disque: fichiers('z.zip', 'a'), rate: [g] });
  const r = await retire(w);
  assert.equal(w.dossiers.has(`${COPIES}/z`), true);
  assert.equal(w.fichiersSur.has(g), true);
  assert.match(r.message, /Fichiers restés sur l'appareil : a\.gpkg\./);
  assert.deepEqual(w.appelsDossier, [], R1);
  sansMessageDossier(r.message.replace(/Fichiers restés sur l'appareil : a\.gpkg\./, ''));
});

test('D1-04 un fichier étranger dans le dossier (non posé par Vision) n\'est jamais effacé ; aucun appel de dossier', async () => {
  const etranger = `${COPIES}/z/notes-jfc.txt`;
  const w = mondeRetrait({ entrees: [vec('z.zip', 'a')], disque: [...fichiers('z.zip', 'a'), etranger] });
  await retire(w);
  assert.equal(w.fichiersSur.has(etranger), true);
  assert.ok(!w.appelsFichier.includes(etranger));
  assert.deepEqual(w.appelsDossier, [], R1);
  assert.equal(w.dossiers.has(`${COPIES}/z`), true);
  for (const f of fichiers('z.zip', 'a')) assert.equal(w.fichiersSur.has(f), false, f);
});

test('D1-05 réimport où plus aucune couche n\'est acceptée : leurs fichiers sont effacés, le dossier est LAISSÉ (aucun appel de dossier), aucun message sur le dossier', async () => {
  const w = mondeImport();
  await importe(w);
  assert.equal(w.dossiers.has(D_DEUX), true);
  const avant = w.appelsDossier.length;
  const r = await importe(w, { controlerCouche: () => REFUS });
  const m = await M();
  assert.deepEqual(couchesDe(m, w.reglages, 'deux.zip'), []);
  for (const c of ['a', 'b']) for (const f of fichiers('deux.zip', c)) assert.equal(w.fichiersSur.has(f), false, f);
  assert.equal(w.appelsDossier.length, avant);
  assert.deepEqual(w.appelsDossier, [], R1);
  assert.equal(w.dossiers.has(D_DEUX), true, 'le dossier vide est laissé');
  // Le message du refus (contrôle) reste dit ; il ne parle pas du dossier.
  sansMessageDossier(String(r.message ?? '').replace(REFUS.message, ''));
});

test('D1-06 réimport où il reste des couches : le dossier reste, aucun appel de dossier', async () => {
  const w = mondeImport();
  await importe(w);
  await importe(w, { octets: zipDe('a.geojson') });
  assert.equal(w.dossiers.has(D_DEUX), true);
  assert.deepEqual(w.appelsDossier, [], R1);
});

test('D1-07 gardes (réécrit) : même avec un registre ou un chemin de projet trafiqué, jamais d\'appel de dossier (l\'ancienne garde « chemin de dossier visé » n\'a plus d\'objet) ; fichiers effacés seulement sous vision-imports/<nom>/', async () => {
  for (const [entrees, extra] of [
    [[vec('z.zip', 'a')], {}],
    [[vec('z.zip', 'a', { chemin: '../../vision.qgz' })], {}],
    [[vec('z.zip', '..')], { couche: '..' }],
    [[{ zip: '../x.zip', couche: 'c', chemin: '../x.zip/c.gpkg', style: 'defaut', ajoutee_le: DATE }], { zip: '../x.zip', couche: 'c' }],
  ]) {
    const w = mondeRetrait({ entrees, disque: [...fichiers('z.zip', 'a'), `${PROJET}/vision.qgz`] });
    await retire(w, extra);
    assert.deepEqual(w.appelsDossier, [], R1);
    for (const c of w.appelsFichier) assert.ok((c.startsWith(COPIES + '/z/') || c === COPIES + '/z.zip') && !c.includes('..') && !c.includes('_cache-onf'), c);
    assert.equal(w.fichiersSur.has(`${PROJET}/vision.qgz`), true);
  }
  for (const dossierProjet of ['', '/', 'relatif', undefined]) {
    const w = mondeRetrait({ entrees: [vec('z.zip', 'a')], disque: fichiers('z.zip', 'a') });
    await retire(w, { dossierProjet });
    assert.deepEqual(w.appelsDossier, [], JSON.stringify(dossierProjet));
    assert.deepEqual(w.appelsFichier, [], `dossier de projet invalide : rien d'effacé : ${JSON.stringify(dossierProjet)}`);
  }
});

test('D1-08 aucun service de dossier fourni (le cas réel, variante B) : le retrait réussit (pas d\'exception, fichiers effacés, registre à jour)', async () => {
  const m = await M();
  const w = mondeRetrait({ entrees: [vec('z.zip', 'a'), vec('y.zip', 'b')], disque: [...fichiers('z.zip', 'a'), `${COPIES}/z.zip`], sansServiceDossier: true });
  const r = await retire(w);
  for (const f of fichiers('z.zip', 'a')) assert.equal(w.fichiersSur.has(f), false, f);
  assert.deepEqual(m.lireRegistre(w.reglages, ID).map((x) => x.zip), ['y.zip']);
  sansMessageDossier(r.message);
});

test('D1-09 un autre zip : son dossier, vide ou non, n\'est pas touché par le retrait d\'une couche de z.zip ; aucun appel de dossier', async () => {
  const w = mondeRetrait({ entrees: [vec('z.zip', 'a'), vec('y.zip', 'b')], disque: [...fichiers('z.zip', 'a'), ...fichiers('y.zip', 'b')], dossiersEnPlus: [`${COPIES}/vide`] });
  await retire(w);
  assert.equal(w.dossiers.has(`${COPIES}/y`), true);
  assert.equal(w.dossiers.has(`${COPIES}/vide`), true);
  assert.deepEqual(w.appelsDossier, [], R1);
});
// =====================================================================================================
// =====================================================================================================
// DÉCISION 2 (26 novembre 2026) : dossier entier remplacé au réimport
// =====================================================================================================
const R2 = "rouge attendu jusqu'à la mission 014 (D2 : dossier entier remplacé au réimport)";

test('D2-01 réimport avec une couche en moins : la couche disparue n\'a plus aucun fichier, les couches gardées sont réécrites, le dossier reste', async () => {
  const m = await M();
  const w = mondeImport();
  await importe(w);
  w.journal.length = 0;
  await importe(w, { octets: zipDe('a.geojson') });
  for (const f of fichiers('deux.zip', 'b')) assert.equal(w.fichiersSur.has(f), false, `${f} : ${R2}`);
  assert.equal(w.fichiersSur.has(`${D_DEUX}/a.gpkg`), true);
  assert.ok(w.journal.includes(`reecrire ${D_DEUX}/a.gpkg`), 'a est réécrite');
  assert.deepEqual(couchesDe(m, w.reglages, 'deux.zip'), ['a']);
  assert.equal(w.dossiers.has(D_DEUX), true);
});

test('D2-02 après réimport, le dossier ne contient que les fichiers des couches du nouveau zip (ni reste de l\'ancien .qml, ni annexe de la couche disparue)', async () => {
  const w = mondeImport();
  await importe(w);
  for (const f of fichiers('deux.zip', 'b')) w.fichiersSur.add(f); // annexes -wal, -shm, .aux.xml posées par QField
  await importe(w, { octets: zipDe('a.geojson') });
  const restes = [...w.fichiersSur].filter((f) => f.startsWith(D_DEUX + '/'));
  for (const f of restes) assert.match(f.slice(D_DEUX.length + 1), /^a(\.gpkg|\.qml|\.gpkg-wal|\.gpkg-shm|\.gpkg\.aux\.xml)$/, `reste d'une couche disparue : ${f} : ${R2}`);
});

test('D2-03 réimport sous un autre nom de zip : le dossier de l\'ancien n\'est pas touché', async () => {
  const w = mondeImport();
  await importe(w);
  const avant = trie([...w.fichiersSur]);
  await importe(w, { nomZip: 'quatre.zip', octets: zipDe('c.geojson') });
  for (const f of avant) assert.equal(w.fichiersSur.has(f), true, f);
  assert.deepEqual(w.appelsFichier.filter((c) => c.startsWith(D_DEUX)), []);
});

test('D2-04 réimport : le remplacement ne sort pas de vision-imports/<zip>/ (aucun effacement ailleurs), même avec un registre trafiqué', async () => {
  const w = mondeImport({ disque: [`${PROJET}/vision.qgz`, `${PROJET}/saisie.gpkg`], registre: [vec('deux.zip', 'x', { chemin: '../../vision.qgz' }), vec('deux.zip', '..')] });
  await importe(w);
  for (const c of [...w.appelsFichier, ...w.appelsDossier]) assert.ok(c.startsWith(D_DEUX), c);
  assert.equal(w.fichiersSur.has(`${PROJET}/vision.qgz`), true);
  assert.equal(w.fichiersSur.has(`${PROJET}/saisie.gpkg`), true);
});

// =====================================================================================================
// DÉCISION 3 (26 novembre 2026) : annexes d'une couche GARDÉE effacées avant sa réécriture, son .gpkg jamais
// =====================================================================================================
const R3 = "rouge attendu jusqu'à la mission 014 (D3 : annexes de la couche gardée effacées avant la réécriture)";
const ANNEXES = ['.gpkg-wal', '.gpkg-shm', '.gpkg.aux.xml'];

test('D3-01 réimport : les annexes -wal, -shm et .aux.xml de la couche gardée sont effacées AVANT la réécriture de son .gpkg, et son .gpkg n\'est jamais effacé', async () => {
  const w = mondeImport();
  await importe(w);
  const annexes = ANNEXES.map((s) => `${D_DEUX}/a${s}`);
  for (const f of annexes) w.fichiersSur.add(f);
  w.journal.length = 0; w.appelsFichier.length = 0;
  await importe(w, { octets: zipDe('a.geojson') });
  const iEcr = w.journal.indexOf(`reecrire ${D_DEUX}/a.gpkg`);
  assert.ok(iEcr >= 0, `a est réécrite : ${w.journal.join(' | ')}`);
  for (const f of annexes) {
    const iEff = w.journal.indexOf(`effacer ${f}`);
    assert.ok(iEff >= 0 && iEff < iEcr, `${f} : effacement (${iEff}) avant réécriture (${iEcr}) : ${R3} : ${w.journal.join(' | ')}`);
    assert.equal(w.fichiersSur.has(f), false, f);
  }
  assert.ok(!w.appelsFichier.includes(`${D_DEUX}/a.gpkg`), `le .gpkg de la couche gardée n'est jamais effacé : ${w.appelsFichier.join(', ')}`);
  assert.equal(w.fichiersSur.has(`${D_DEUX}/a.gpkg`), true);
  assert.deepEqual(w.appelsDossier, []);
});

test('D3-02 réimport : seules les annexes de la couche gardée, dans le dossier du zip, sont visées (annexe d\'un autre zip, .gpkg du même nom ailleurs, cache ONF : intacts)', async () => {
  const w = mondeImport();
  await importe(w);
  const autres = [...ANNEXES.map((s) => `${COPIES}/y/a${s}`), `${COPIES}/y/a.gpkg`, `${COPIES}/_cache-onf/actuel/a.gpkg-wal`];
  for (const f of [...ANNEXES.map((s) => `${D_DEUX}/a${s}`), ...autres]) w.fichiersSur.add(f);
  w.journal.length = 0; w.appelsFichier.length = 0;
  await importe(w, { octets: zipDe('a.geojson') });
  for (const f of autres) { assert.equal(w.fichiersSur.has(f), true, f); assert.ok(!w.appelsFichier.includes(f), f); }
  for (const f of ANNEXES.map((s) => `${D_DEUX}/a${s}`)) assert.equal(w.fichiersSur.has(f), false, `${f} : ${R3}`);
});

test('D3-03 réimport sans annexe sur le disque : le .gpkg n\'est pas effacé, la couche est réécrite et reste au registre', async () => {
  const m = await M();
  const w = mondeImport();
  await importe(w);
  w.journal.length = 0; w.appelsFichier.length = 0;
  await importe(w, { octets: zipDe('a.geojson') });
  assert.ok(!w.appelsFichier.includes(`${D_DEUX}/a.gpkg`));
  assert.ok(w.journal.includes(`reecrire ${D_DEUX}/a.gpkg`));
  assert.deepEqual(couchesDe(m, w.reglages, 'deux.zip'), ['a']);
});

test('D3-04 réimport : une annexe de la couche gardée refuse de s\'effacer -> cette couche n\'est PAS réécrite (fichier et registre inchangés ; rechargée sur la carte depuis l\'ancienne copie), la ligne « Fichiers restés sur l\'appareil : a.gpkg-wal. » la nomme ; l\'autre couche est réécrite normalement', async () => {
  const m = await M();
  const wal = `${D_DEUX}/a.gpkg-wal`;
  const w2 = mondeImport({ rate: [wal] });
  await importe(w2);
  w2.fichiersSur.add(wal);
  const reg2 = m.lireRegistre(w2.reglages, ID).find((x) => x.couche === 'a');
  w2.journal.length = 0; w2.appelsFichier.length = 0;
  const ajoutees2 = [];
  const r2 = await importe(w2, { ajouterALaCarte: (c, nom, source) => ajoutees2.push({ nom, source }), maintenant: () => new Date('2026-11-27T10:00:00.000Z') });
  assert.ok(!w2.journal.includes(`reecrire ${D_DEUX}/a.gpkg`), `a n'est pas réécrite : ${w2.journal.join(' | ')}`);
  assert.equal(w2.fichiersSur.has(`${D_DEUX}/a.gpkg`), true, 'l\'ancien .gpkg reste');
  assert.ok(!w2.appelsFichier.includes(`${D_DEUX}/a.gpkg`), 'le .gpkg n\'est jamais effacé');
  assert.equal(w2.fichiersSur.has(wal), true);
  assert.deepEqual(m.lireRegistre(w2.reglages, ID).find((x) => x.couche === 'a'), reg2, 'entrée de a au registre inchangée (même date)');
  assert.deepEqual(ajoutees2.map((x) => x.source).sort(), [`${D_DEUX}/a.gpkg`, `${D_DEUX}/b.gpkg`], `a est rechargée sur la carte depuis son ANCIENNE copie (une fois), b depuis sa copie réécrite : ${JSON.stringify(ajoutees2)}`);
  assert.ok(w2.journal.includes(`reecrire ${D_DEUX}/b.gpkg`), 'b est réécrite normalement');
  assert.deepEqual(couchesDe(m, w2.reglages, 'deux.zip'), ['a', 'b']);
  assert.equal(/Fichiers restés sur l'appareil : (.*?)\.(?=\s|$)/s.exec(r2.message ?? '')?.[0], "Fichiers restés sur l'appareil : a.gpkg-wal.", `« ${r2.message} » : ${R3}`);
});
