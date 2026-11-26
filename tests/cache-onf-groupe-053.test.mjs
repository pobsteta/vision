// Mission 053, étape 3, temps 3 : groupe « ONF Cache » par la voie C4 (docs/referentiels/cache-zone-qfield.md § 14 ; sonde C4
// prouvée sur le Samsung, QField 4.3.8, journal du 25 novembre 2026). Le projet porte trois couches à chemin fixe
// (vision-imports/_cache-onf/actuel/<couche>.gpkg) ; le plugin y bascule un cache contrôlé par renommage puis reload(), avec
// retour arrière, sans jamais ajouter ni retirer ces couches de la carte. Logique testée hors réseau avec un faux QField : un vert
// ne prouve rien sur le Samsung (protocole du dev dans la pièce).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from '../plugin/vision-logique.mjs';
import { EMPRISE_VRAISEMBLANCE } from '../plugin/vision-controles.mjs';
import { STYLES_ONF } from '../plugin/vision-styles-onf.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(join(ici, '..', f), 'utf8');
const gdal = spawnSync('ogrinfo', ['--version']).status === 0;

const ID = '6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b';
const PROJET = '/sdcard/QField/vision';
const IMPORTS = PROJET + '/vision-imports';
const CACHE = IMPORTS + '/_cache-onf';
const ACTUEL = CACHE + '/actuel';
const DATE = new Date(2026, 10, 26, 9, 0, 0);
const H = L.cacheHorodatage(DATE);
const H0 = '20261125T173000Z'; // une génération plus ancienne (cache migré)
const ZONE = { xmin: 893717, ymin: 6677283, xmax: 897717, ymax: 6681283 };
const CODES = L.CACHE_ONF.couches.map((c) => c.couche);
const NB = { FOR_PUBL_FR: 4, PARC_PUBL_FR: 53, PRS_FR: 1 };
const EMPRISE = { xMinimum: 895200, yMinimum: 6678800, xMaximum: 897100, yMaximum: 6680800 };

// ------------------------------------------------------------------------------------------- chemins et gardes
test('chemin fixe : source de la couche du projet, relative au dossier du projet, table = nom de la couche', () => {
  assert.equal(L.cacheSourceProjet('FOR_PUBL_FR'), './vision-imports/_cache-onf/actuel/FOR_PUBL_FR.gpkg|layername=FOR_PUBL_FR');
  assert.equal(L.cacheSourceProjet('PRS_FR'), './vision-imports/_cache-onf/actuel/PRS_FR.gpkg|layername=PRS_FR');
  assert.throws(() => L.cacheSourceProjet('UG'), /couche inconnue/);
  assert.equal(L.CACHE_ONF.groupe, 'ONF Cache');
});

test('chemins de la bascule : actuel, nouveau (génération), sauvegarde (même génération), annexes SQLite', () => {
  const p = L.cacheCheminsGroupe(PROJET, H, 'PARC_PUBL_FR');
  assert.deepEqual(p, {
    relatif: 'actuel/PARC_PUBL_FR.gpkg', actuel: `${ACTUEL}/PARC_PUBL_FR.gpkg`, nouveau: `${CACHE}/${H}/PARC_PUBL_FR.gpkg`,
    sauvegarde: `${CACHE}/${H}/PARC_PUBL_FR.avant.gpkg`, wal: `${ACTUEL}/PARC_PUBL_FR.gpkg-wal`, walNouveau: `${CACHE}/${H}/PARC_PUBL_FR.gpkg-wal` });
  assert.equal(L.cacheCheminsGroupe(PROJET, '../x', 'PARC_PUBL_FR'), null);
  assert.equal(L.cacheCheminsGroupe(PROJET, H, 'UG'), null);
  assert.equal(L.cacheCheminsGroupe('relatif', H, 'PRS_FR'), null);
});

test('garde des renommages : actuel/<couche>.gpkg, <génération>/<couche>.gpkg et .avant.gpkg seulement', () => {
  for (const bon of [`${ACTUEL}/PRS_FR.gpkg`, `${CACHE}/${H}/PRS_FR.gpkg`, `${CACHE}/${H}/PRS_FR.avant.gpkg`]) assert.ok(L.peutRenommerCache(bon, IMPORTS), bon);
  for (const mauvais of [`${ACTUEL}/UG.gpkg`, `${ACTUEL}/PRS_FR.qml`, `${ACTUEL}/PRS_FR.avant.gpkg`, `${ACTUEL}/PRS_FR.gpkg|layername=PRS_FR`, `${CACHE}/PRS_FR.gpkg`,
    `${CACHE}/x/PRS_FR.gpkg`, `${CACHE}/${H}/../PRS_FR.gpkg`, `${IMPORTS}/Serre/PRS_FR.gpkg`, `${CACHE}/actuel/sous/PRS_FR.gpkg`, `${CACHE}/${H}/PRS_FR.gml`]) {
    assert.ok(!L.peutRenommerCache(mauvais, IMPORTS), mauvais);
  }
});

test('garde d\'effacement : la sauvegarde .avant.gpkg d\'une génération s\'efface ; rien dans actuel/ ne s\'efface', () => {
  assert.ok(L.peutToucherCache(`${CACHE}/${H}/PRS_FR.avant.gpkg`, IMPORTS));
  for (const c of CODES) for (const s of ['.gpkg', '.gpkg-wal', '.avant.gpkg']) assert.ok(!L.peutToucherCache(`${ACTUEL}/${c}${s}`, IMPORTS), `${c}${s}`);
});

test('registre : l\'entrée du cache désigne actuel/<couche>.gpkg (ou, comme avant, une génération) ; rien d\'autre', () => {
  const e = (couche, chemin) => ({ cache: 'onf', couche, chemin, emprise: ZONE, date: DATE.toISOString(), objets: 3 });
  const saines = [e('FOR_PUBL_FR', 'actuel/FOR_PUBL_FR.gpkg'), e('PARC_PUBL_FR', `${H0}/PARC_PUBL_FR.gpkg`), e('PRS_FR', 'actuel/PRS_FR.gpkg')];
  assert.equal(L.entreesDuCache(saines).length, 3);
  for (const mauvaise of [e('FOR_PUBL_FR', 'actuel/PRS_FR.gpkg'), e('FOR_PUBL_FR', 'actuel/../FOR_PUBL_FR.gpkg'), e('FOR_PUBL_FR', 'autre/FOR_PUBL_FR.gpkg'),
    e('FOR_PUBL_FR', 'actuel/FOR_PUBL_FR.gpkg|layername=x'), e('FOR_PUBL_FR', 'actuel/FOR_PUBL_FR.avant.gpkg'), e('FOR_PUBL_FR', '/actuel/FOR_PUBL_FR.gpkg')]) {
    assert.deepEqual(L.entreesDuCache([mauvaise]), [], mauvaise.chemin);
  }
});

test('GML vide d\'un fichier à créer : aucun objet, fin de collection ; .gfs de la couche (type et système fixés)', () => {
  const g = L.cacheGmlVide('FOR_PUBL_FR');
  assert.equal((g.match(/featureMember/g) || []).length, 0);
  assert.match(g, /<\/wfs:FeatureCollection>\s*$/);
  assert.match(g, /^<\?xml version='1\.0' encoding="UTF-8" \?>/);
  assert.equal(L.cacheAnalyserReponse(g).complete, true);
  assert.equal(L.cacheAnalyserReponse(g).nbObjets, 0);
  assert.match(L.cacheGfs('FOR_PUBL_FR', 'msGeometry'), /<GeometryType>6<\/GeometryType>/);
  assert.throws(() => L.cacheGmlVide('UG'), /couche inconnue/);
});

test('GML vide (GDAL réel) : couche lisible à 0 objet, MultiPolygon pour les forêts, Point pour les points, EPSG:2154', { skip: !gdal && 'GDAL absent' }, () => {
  const d = mkdtempSync(join(tmpdir(), 'vision-groupe-'));
  try {
    for (const c of L.CACHE_ONF.couches) {
      writeFileSync(join(d, c.couche + '.gml'), L.cacheGmlVide(c.couche), 'utf8');
      writeFileSync(join(d, c.couche + '.gfs'), L.cacheGfs(c.couche, 'msGeometry'), 'utf8');
      const r = spawnSync('ogrinfo', ['-json', '-oo', 'EXPOSE_GML_ID=NO', join(d, c.couche + '.gml'), c.couche], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const j = JSON.parse(r.stdout).layers[0];
      assert.equal(j.featureCount, 0);
      assert.equal(j.geometryFields[0].type, c.wkb === 1 ? 'Point' : 'MultiPolygon');
      assert.match(JSON.stringify(j.geometryFields[0].coordinateSystem), /2154/);
      assert.deepEqual(j.fields.map((f) => f.name), c.champs);
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------- faux QField (mode groupe)
// Disque en mémoire : texte (GML, .gfs) ou { n, wkb, authid } (GeoPackage). Couches du projet : à chemin fixe, relues par reload().
function fauxGroupe({ panne = {}, registre = [], actuel = 'vides', projet = true } = {}) {
  const disque = new Map();
  const journal = [];
  const carte = [];
  const reglages = new Map([[L.cleRegistre(ID), JSON.stringify(registre)]]);
  const gpkg = (n, c) => ({ n, wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' });
  if (actuel === 'vides') for (const c of CODES) disque.set(`${ACTUEL}/${c}.gpkg`, gpkg(0, c));
  if (typeof actuel === 'object') for (const c of CODES) if (actuel[c] !== undefined) disque.set(`${ACTUEL}/${c}.gpkg`, gpkg(actuel[c], c));
  const couchesProjet = {};
  for (const c of CODES) {
    const fichier = `${ACTUEL}/${c}.gpkg`;
    const d = disque.get(fichier);
    couchesProjet[c] = { nom: L.coucheOnf(c).nom, fichier, isValid: !!d && panne.invalide !== c, n: d ? d.n : 0, rechargements: 0, readOnly: true, proprietes: { 'vision/cache': 'onf', 'vision/couche': c },
      customProperty(k, v) { return k in this.proprietes ? this.proprietes[k] : v; },
      reload() { this.rechargements++; if (!this.isValid) return; const x = disque.get(this.fichier); if (!x) { this.isValid = false; this.n = 0; } else if (panne.reloadSansEffet !== c) this.n = x.n; },
    };
  }
  const nouvelleCouche = (props) => ({ isValid: true, readOnly: false, crs: { authid: props.authid }, n: props.n, nom: props.nom, uri: props.uri, wkbType() { return props.wkb; }, extent() { return EMPRISE; } });
  const reponses = { FOR_PUBL_FR: { texte: 'gml-for', nbObjets: 4 }, PARC_PUBL_FR: { texte: 'gml-parc', nbObjets: 53 }, PRS_FR: { texte: 'gml-prs', nbObjets: 1 } };
  const ctx = {
    visionId: ID, dossierProjet: PROJET, horodatage: H, date: DATE, emprise: ZONE, vraisemblance: EMPRISE_VRAISEMBLANCE, styles: STYLES_ONF, reponses,
    reglages: { value: (k, d) => (reglages.has(k) ? reglages.get(k) : d), setValue: (k, v) => reglages.set(k, v) },
    maintenant: () => DATE,
    ecrireFichier(chemin, texte) { journal.push('écrit ' + chemin); if (panne.ecrire === chemin) return false; disque.set(chemin, texte); return true; },
    effacerFichier(chemin) { journal.push('effacé ' + chemin); disque.delete(chemin); return true; },
    existe: (chemin) => disque.has(chemin),
    ouvrirCouche(uri, nom) {
      journal.push('ouvert ' + uri);
      const fichier = uri.split('|')[0];
      if (!disque.has(fichier)) return { isValid: false };
      const code = fichier.replace(/^.*\//, '').replace(/\.[a-z]+$/, '');
      const c = L.coucheOnf(code);
      const d = disque.get(fichier);
      if (/\.gml$/.test(fichier)) {
        assert.ok(disque.has(fichier.replace(/\.gml$/, '.gfs')), 'le .gfs est écrit avant l\'ouverture du GML');
        const n = d.startsWith('<?xml') ? (d.match(/featureMember>/g) || []).length / 2 : reponses[c.couche].nbObjets;
        return nouvelleCouche({ uri, nom, n, wkb: c.wkb, authid: 'EPSG:2154' });
      }
      return nouvelleCouche({ uri, nom, n: panne.relus === c.couche ? d.n - 1 : d.n, wkb: d.wkb, authid: d.authid });
    },
    creerIterateur(l) { let i = 0; return { hasNext: () => i < l.n, next: () => { i++; return {}; }, close() {} }; },
    imposerSysteme(l) { l.crs = { authid: 'EPSG:2154' }; },
    reecrireCouche(l, cible) { journal.push('réécrit ' + cible); disque.set(cible, { n: l.n, wkb: l.wkbType(), authid: l.crs.authid }); return cible; },
    renommer(de, vers) {
      journal.push('renommé ' + de + ' -> ' + vers);
      // renommerVers : refusé la première fois seulement (le sens aller) ; renommerToujours : refusé aussi au retour arrière.
      const unique = (panne.renommerVers || []).indexOf(vers);
      if (unique >= 0) { panne.renommerVers.splice(unique, 1); return false; }
      if ((panne.renommerToujours || []).includes(vers) || !disque.has(de)) return false;
      disque.set(vers, disque.get(de));
      disque.delete(de);
      return true;
    },
    recharger(l) { journal.push('rechargé ' + l.nom); l.reload(); },
    retirerCacheDeLaCarte() { journal.push('RETIRÉ de la carte'); },
    ajouterCache(l, c) { journal.push('AJOUTÉ à la carte ' + c); carte.push(l); },
  };
  if (projet) ctx.coucheDuGroupe = (c) => couchesProjet[c] || null;
  return { ctx, disque, journal, carte, couchesProjet, registre: () => JSON.parse(reglages.get(L.cleRegistre(ID))) };
}

const sansSurprise = (f) => assert.ok(!f.journal.some((x) => /^(RETIRÉ|AJOUTÉ)/.test(x)), 'jamais addMapLayer ni removeMapLayer sur les couches du groupe');

test('bascule réussie : renommages vers actuel/, reload des trois couches, registre sur actuel/, rien ajouté ni retiré de la carte', () => {
  const zip = { zip: 'Serre.zip', couche: 'UG', chemin: 'Serre/UG.gpkg', style: 'UG' };
  const f = fauxGroupe({ registre: [zip] });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.equal(r.message, 'Couches ONF en cache : 4 forêts, 53 parcelles, 1 point de rencontre (zone du 26/11/2026).');
  sansSurprise(f);
  for (const c of CODES) {
    assert.equal(f.couchesProjet[c].n, NB[c], c);
    assert.equal(f.couchesProjet[c].rechargements, 1, c);
    assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, NB[c]);
    assert.ok(!f.disque.has(`${CACHE}/${H}/${c}.gpkg`), 'le GeoPackage de la génération est devenu l\'actuel');
    assert.ok(!f.disque.has(`${CACHE}/${H}/${c}.avant.gpkg`), 'sauvegarde effacée');
    assert.ok(!f.disque.has(`${CACHE}/${H}/${c}.gml`) && !f.disque.has(`${CACHE}/${H}/${c}.gfs`) && !f.disque.has(`${CACHE}/${H}/${c}.qml`));
  }
  const reg = f.registre();
  assert.deepEqual(reg[0], zip);
  assert.deepEqual(reg.slice(1).map((e) => [e.cache, e.couche, e.chemin, e.objets]), CODES.map((c) => ['onf', c, `actuel/${c}.gpkg`, NB[c]]));
  assert.deepEqual(reg[1].emprise, ZONE);
  assert.equal(L.cacheLignePanneau(reg), 'Cache ONF du 26/11/2026 : 4 forêts, 53 parcelles, 1 point de rencontre.');
  // Aucun style voisin : le style est celui du projet (ADR 0008 : le .qml voisin n'est plus nécessaire).
  assert.ok(!f.journal.some((x) => /\.qml/.test(x)));
});

test('bascule : pour chaque couche, l\'actuel est mis de côté, puis le nouveau y prend sa place ; reload après les renommages', () => {
  const f = fauxGroupe();
  assert.equal(L.cacheEnregistrer(f.ctx).ok, true);
  const renommes = f.journal.filter((x) => /^renommé /.test(x));
  assert.deepEqual(renommes, CODES.flatMap((c) => [`renommé ${ACTUEL}/${c}.gpkg -> ${CACHE}/${H}/${c}.avant.gpkg`, `renommé ${CACHE}/${H}/${c}.gpkg -> ${ACTUEL}/${c}.gpkg`]));
  const dernierRenommage = f.journal.lastIndexOf(renommes[renommes.length - 1]);
  const premierReload = f.journal.findIndex((x) => /^rechargé /.test(x));
  assert.ok(dernierRenommage < premierReload, 'reload seulement une fois tous les renommages faits');
  assert.deepEqual(f.journal.filter((x) => /^rechargé /.test(x)), CODES.map((c) => 'rechargé ' + L.coucheOnf(c).nom));
});

test('bascule : tout ce qui est écrit ou renommé reste dans _cache-onf/ (aucun autre dossier de vision-imports, ni vision.qgz)', () => {
  const f = fauxGroupe();
  L.cacheEnregistrer(f.ctx);
  for (const l of f.journal.filter((x) => /^(écrit|effacé|renommé) /.test(x))) {
    for (const chemin of l.replace(/^\S+ /, '').split(' -> ')) assert.ok(chemin.startsWith(CACHE + '/'), l);
  }
});

test('second cache : il remplace le premier, l\'ancien actuel (mis de côté) est effacé, jamais le nouveau', () => {
  const f = fauxGroupe({ actuel: { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 } });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  for (const c of CODES) {
    assert.equal(f.couchesProjet[c].n, NB[c]);
    assert.ok(!f.disque.has(`${CACHE}/${H}/${c}.avant.gpkg`));
  }
  assert.ok(f.journal.some((x) => x === `effacé ${CACHE}/${H}/PARC_PUBL_FR.avant.gpkg`), 'l\'ancien cache est effacé après la réussite');
});

test('journal SQLite : un -wal à côté d\'un actuel refuse la bascule ; rien n\'est renommé, la génération est effacée, l\'ancien est gardé', () => {
  const f = fauxGroupe({ actuel: { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 }, registre: [] });
  f.disque.set(`${ACTUEL}/PARC_PUBL_FR.gpkg-wal`, 'x');
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
  assert.match(r.raison, /wal/);
  assert.ok(!f.journal.some((x) => /^renommé /.test(x)));
  assert.equal(f.disque.get(`${ACTUEL}/PARC_PUBL_FR.gpkg`).n, 7);
  assert.ok(![...f.disque.keys()].some((k) => k.startsWith(`${CACHE}/${H}/`)), 'génération effacée');
  assert.deepEqual(f.registre(), []);
  sansSurprise(f);
});

test('journal SQLite : un -wal à côté du fichier de la génération refuse aussi la bascule (il resterait derrière le renommage)', () => {
  const f = fauxGroupe();
  const ecrire = f.ctx.reecrireCouche;
  f.ctx.reecrireCouche = (l, cible) => { const r = ecrire(l, cible); f.disque.set(cible + '-wal', 'x'); return r; };
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.match(r.raison, /wal/);
  assert.ok(!f.journal.some((x) => /^renommé /.test(x)));
});

test('renommage refusé en cours de route : renommages inverses, les actuels d\'origine sont remis, texte validé, registre inchangé', () => {
  const avant = { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 };
  const f = fauxGroupe({ actuel: avant, panne: { renommerVers: [`${ACTUEL}/PARC_PUBL_FR.gpkg`] } });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
  for (const c of CODES) {
    assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, avant[c], `${c} : l'ancien cache est remis à sa place`);
    assert.ok(!f.disque.has(`${CACHE}/${H}/${c}.avant.gpkg`), 'plus de sauvegarde');
  }
  assert.ok(![...f.disque.keys()].some((k) => k.startsWith(`${CACHE}/${H}/`)), 'génération effacée');
  assert.deepEqual(f.registre(), []);
  assert.deepEqual(CODES.map((c) => f.couchesProjet[c].n), [2, 7, 0], 'les couches affichent toujours l\'ancien cache');
  sansSurprise(f);
});

test('premier renommage refusé (mise de côté de l\'actuel) : rien n\'a bougé', () => {
  const f = fauxGroupe({ panne: { renommerVers: [`${CACHE}/${H}/FOR_PUBL_FR.avant.gpkg`] } });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, 0);
});

test('retour arrière lui-même refusé : dit dans la raison (diagnostic), texte validé affiché, jamais d\'exception', () => {
  const f = fauxGroupe({ actuel: { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 }, panne: { renommerVers: [`${ACTUEL}/PRS_FR.gpkg`], renommerToujours: [`${CACHE}/${H}/PARC_PUBL_FR.gpkg`] } });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
  assert.match(r.raison, /retour arrière/);
  // Retour arrière incomplet : la génération n'est PAS effacée (la sauvegarde de l'ancien cache y est peut-être seule).
  assert.ok(f.disque.has(`${CACHE}/${H}/PARC_PUBL_FR.avant.gpkg`), 'l\'ancien cache de PARC_PUBL_FR n\'est pas effacé');
});

test('reload sans effet (la couche affiche encore l\'ancien nombre) : bascule défaite, ancien cache remis et relu', () => {
  const avant = { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 };
  const f = fauxGroupe({ actuel: avant, panne: { reloadSansEffet: 'PARC_PUBL_FR' } });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, avant[c], c);
  assert.deepEqual(CODES.map((c) => f.couchesProjet[c].n), [2, 7, 0]);
  assert.ok(CODES.every((c) => f.couchesProjet[c].rechargements === 2), 'rechargées une fois après la bascule, une fois après le retour arrière');
  assert.deepEqual(f.registre(), []);
});

test('registre non écrit après une bascule réussie : bascule défaite (renommages inverses, reload), ancien cache gardé, texte validé', () => {
  const avant = { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 };
  const f = fauxGroupe({ actuel: avant });
  f.ctx.reglages.setValue = () => { throw new Error('réglages refusés'); };
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
  assert.match(r.raison, /registre non écrit/);
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, avant[c], c);
  assert.deepEqual(CODES.map((c) => f.couchesProjet[c].n), [2, 7, 0]);
});

const TEXTE_PRET = 'Cache ONF prêt : fermez puis rouvrez le projet pour l\'afficher.';

test('texte validé par Pascal (26 novembre 2026) : « Cache ONF prêt : fermez puis rouvrez le projet pour l\'afficher. », dans TEXTES_CACHE_ONF et dans la fiche', () => {
  assert.equal(L.TEXTES_CACHE_ONF.cachePret, TEXTE_PRET);
  assert.ok(lire('pilotage/missions/053-couches-onf-wfs.md').includes('« ' + TEXTE_PRET + ' »'));
});

test('couche du projet invalide au bouton (fichier absent créé à l\'instant, illisible) : le cache est bien écrit à actuel/ (la couche invalide ne se relit pas), texte « Cache ONF prêt… »', () => {
  const f = fauxGroupe({ actuel: { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 }, panne: { invalide: 'PRS_FR' } });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.equal(r.message, TEXTE_PRET);
  assert.equal(r.affichage, 'reouverture');
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, NB[c], `${c} : cache à actuel/`);
  assert.deepEqual(CODES.map((c) => f.couchesProjet[c].n), [4, 53, 0], 'les couches valides affichent déjà le nouveau cache, l\'invalide attend la réouverture');
  assert.deepEqual(f.registre().map((e) => [e.chemin, e.objets]), CODES.map((c) => [`actuel/${c}.gpkg`, NB[c]]), 'registre à jour : à la réouverture le cache est là');
  assert.ok(!f.disque.has(`${CACHE}/${H}/PRS_FR.avant.gpkg`) && !f.disque.has(`${CACHE}/${H}/FOR_PUBL_FR.avant.gpkg`), 'sauvegardes effacées');
  sansSurprise(f);
});

test('couches du projet toutes invalides, fichiers absents : cache posé à actuel/ sans sauvegarde, texte « Cache ONF prêt… »', () => {
  const f = fauxGroupe({ actuel: {} });
  for (const c of CODES) f.couchesProjet[c].isValid = false;
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.equal(r.message, TEXTE_PRET);
  assert.equal(f.disque.get(`${ACTUEL}/PARC_PUBL_FR.gpkg`).n, 53);
  assert.ok(!f.journal.some((x) => /avant\.gpkg/.test(x)));
});

test('couche invalide ET écart de relecture sur une couche valide : texte d\'échec (jamais « prêt »), registre inchangé, toutes les couches remises en place (PRS_FR comprise), génération effacée', () => {
  const avant = { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 3 };
  const f = fauxGroupe({ actuel: avant, panne: { invalide: 'PRS_FR', reloadSansEffet: 'PARC_PUBL_FR' } });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
  assert.notEqual(r.message, TEXTE_PRET);
  assert.equal(r.affichage, undefined);
  assert.match(r.raison, /PARC_PUBL_FR/);
  for (const c of CODES) {
    assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, avant[c], `${c} : ancien cache remis à actuel/`);
    assert.ok(!f.disque.has(`${CACHE}/${H}/${c}.avant.gpkg`), `${c} : plus de sauvegarde`);
  }
  assert.deepEqual(f.registre(), [], 'registre inchangé');
  // Contrat actuel : retour arrière complet = génération effacée ; l'invalide n'est pas rechargée, les valides le sont (bascule puis retour).
  assert.ok(![...f.disque.keys()].some((k) => k.startsWith(`${CACHE}/${H}/`)), 'génération effacée');
  assert.equal(f.couchesProjet.PRS_FR.rechargements, 0);
  assert.equal(f.couchesProjet.FOR_PUBL_FR.rechargements, 2);
  assert.deepEqual([f.couchesProjet.FOR_PUBL_FR.n, f.couchesProjet.PARC_PUBL_FR.n], [2, 7]);
  sansSurprise(f);
});

test('couche invalide ET renommage refusé : retour arrière, texte validé d\'échec (jamais « prêt » à tort)', () => {
  const f = fauxGroupe({ actuel: { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 }, panne: { invalide: 'PRS_FR', renommerVers: [`${ACTUEL}/PARC_PUBL_FR.gpkg`] } });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
  assert.equal(f.disque.get(`${ACTUEL}/FOR_PUBL_FR.gpkg`).n, 2);
});

test('un seul des trois fichiers actuels absent (couche valide à l\'ouverture, fichier effacé depuis) : pas de sauvegarde pour lui, bascule faite', () => {
  const f = fauxGroupe({ actuel: { FOR_PUBL_FR: 0, PARC_PUBL_FR: 0, PRS_FR: 0 } });
  f.disque.delete(`${ACTUEL}/PRS_FR.gpkg`);
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.ok(!f.journal.some((x) => x.startsWith(`renommé ${ACTUEL}/PRS_FR.gpkg`)));
  assert.equal(f.disque.get(`${ACTUEL}/PRS_FR.gpkg`).n, 1);
});

test('génération contrôlée comme avant : un GeoPackage relu avec un objet de moins refuse tout, avant le moindre renommage', () => {
  const f = fauxGroupe({ panne: { relus: 'PARC_PUBL_FR' } });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.match(r.raison, /PARC_PUBL_FR/);
  assert.ok(!f.journal.some((x) => /^renommé /.test(x)));
  assert.ok(![...f.disque.keys()].some((k) => k.startsWith(`${CACHE}/${H}/`)));
});

test('services du mode groupe absents (renommer, recharger) : refus net, texte validé', () => {
  for (const s of ['renommer', 'recharger']) {
    const f = fauxGroupe();
    delete f.ctx[s];
    const r = L.cacheEnregistrer(f.ctx);
    assert.equal(r.ok, false, s);
    assert.match(r.raison, /service absent/);
  }
});

test('mode ancien gardé : sans couches marquées dans le projet (ou une seule manquante), le cache passe en tête de liste comme avant', () => {
  const unSeulManquant = fauxGroupe();
  const c = unSeulManquant.ctx.coucheDuGroupe;
  unSeulManquant.ctx.coucheDuGroupe = (n) => (n === 'PRS_FR' ? null : c(n));
  for (const f of [fauxGroupe({ projet: false }), unSeulManquant]) {
    const r = L.cacheEnregistrer(f.ctx);
    assert.equal(r.ok, true, r.raison);
    assert.ok(f.journal.includes('RETIRÉ de la carte'));
    assert.deepEqual(f.journal.filter((x) => /^AJOUTÉ/.test(x)), CODES.map((c) => 'AJOUTÉ à la carte ' + c));
    assert.ok(!f.journal.some((x) => /^renommé /.test(x)));
    assert.deepEqual(f.registre().map((e) => e.chemin), CODES.map((c) => `${H}/${c}.gpkg`));
  }
});

// ------------------------------------------------------------------------------------------- ouverture du projet (mode groupe)
function entreesAnciennes(h = H0) {
  return CODES.map((c) => ({ cache: 'onf', couche: c, chemin: `${h}/${c}.gpkg`, emprise: ZONE, date: DATE.toISOString(), objets: NB[c] }));
}
function entreesActuel() {
  return CODES.map((c) => ({ cache: 'onf', couche: c, chemin: `actuel/${c}.gpkg`, emprise: ZONE, date: DATE.toISOString(), objets: NB[c] }));
}

function ouvrir(f, extra = {}) {
  const appels = [];
  const ctx = Object.assign({ variables: { vision_id: ID }, dossierProjet: PROJET, chargerCouche: () => null,
    chargerCache: (s, n, c) => { appels.push('chargerCache ' + c); return null; }, libererCouche: (c) => appels.push('libérée') }, f.ctx, extra);
  delete ctx.horodatage;
  const r = L.demarrerProjet(ctx);
  return { r, appels };
}

test('ouverture, fichiers présents : rien à charger (QGIS lit le projet), aucune couche ajoutée, retirée ni libérée, aucun message', () => {
  const f = fauxGroupe({ actuel: { FOR_PUBL_FR: 4, PARC_PUBL_FR: 53, PRS_FR: 1 }, registre: entreesActuel() });
  const { r, appels } = ouvrir(f);
  assert.deepEqual(appels, []);
  assert.deepEqual(r.cache.rechargees, CODES);
  assert.deepEqual(r.cache.manquantes, []);
  assert.deepEqual(r.cache.creees, []);
  assert.equal(r.message, '');
  assert.equal(f.registre().length, 3);
  sansSurprise(f);
  assert.ok(!f.journal.some((x) => /^(écrit|renommé|réécrit|effacé)/.test(x)), 'rien n\'est touché');
});

test('ouverture, fichiers manquants (appareil déjà en service) : créés par la voie prouvée (GML vide + .gfs, saveVectorLayerAs) à actuel/, jamais écrasés', () => {
  const f = fauxGroupe({ actuel: { PARC_PUBL_FR: 7 } });
  const { r } = ouvrir(f);
  assert.deepEqual(r.cache.creees, ['FOR_PUBL_FR', 'PRS_FR']);
  assert.equal(f.disque.get(`${ACTUEL}/FOR_PUBL_FR.gpkg`).n, 0);
  assert.equal(f.disque.get(`${ACTUEL}/FOR_PUBL_FR.gpkg`).wkb, 6);
  assert.equal(f.disque.get(`${ACTUEL}/PRS_FR.gpkg`).wkb, 1);
  assert.equal(f.disque.get(`${ACTUEL}/PARC_PUBL_FR.gpkg`).n, 7, 'un fichier présent n\'est jamais touché');
  assert.ok(!f.journal.some((x) => x.startsWith(`réécrit ${ACTUEL}/PARC_PUBL_FR`)));
  // fichiers de travail effacés
  assert.ok(![...f.disque.keys()].some((k) => /\.(gml|gfs)$/.test(k)));
  // aucune réouverture du GeoPackage créé par une couche de travail (le jeu de données GDAL serait partagé avec la couche du projet)
  assert.ok(!f.journal.some((x) => /^ouvert .*\/actuel\//.test(x)));
  // Les couches du projet sont invalides jusqu'à la réouverture (reload ne les répare pas) : pas de message, QField a sa page.
  assert.deepEqual(r.cache.manquantes, []);
  assert.equal(r.message, '');
});

test('ouverture, création refusée (écriture ou GeoPackage non écrit) : jamais d\'exception, fichier absent signalé par le texte validé', () => {
  const f = fauxGroupe({ actuel: {}, panne: { ecrire: `${CACHE}/${H}/FOR_PUBL_FR.gml` } });
  const { r } = ouvrir(f);
  assert.deepEqual(r.cache.creees.includes('FOR_PUBL_FR'), false);
  assert.ok(r.cache.manquantes.includes('FOR_PUBL_FR'));
  assert.match(r.message, new RegExp(L.TEXTES_CACHE_ONF.cacheIllisible.replace(/[().]/g, '\\$&')));
});

test('ouverture, couche du projet présente mais invalide : « Cache ONF illisible… » (texte validé), entrée gardée', () => {
  const f = fauxGroupe({ actuel: { FOR_PUBL_FR: 4, PARC_PUBL_FR: 53, PRS_FR: 1 }, registre: entreesActuel(), panne: { invalide: 'PRS_FR' } });
  const { r } = ouvrir(f);
  assert.deepEqual(r.cache.manquantes, ['PRS_FR']);
  assert.ok(r.message.includes(L.TEXTES_CACHE_ONF.cacheIllisible));
  assert.equal(f.registre().length, 3);
});

test('ouverture, migration (§ 14.4) : un cache en génération passe à actuel/ par renommages, reload, registre sur actuel/, hors réseau', () => {
  const f = fauxGroupe({ registre: entreesAnciennes() });
  for (const c of CODES) f.disque.set(`${CACHE}/${H0}/${c}.gpkg`, { n: NB[c], wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' });
  for (const c of CODES) f.disque.set(`${CACHE}/${H0}/${c}.qml`, 'style');
  const { r, appels } = ouvrir(f);
  assert.deepEqual(r.cache.migrees, CODES);
  assert.deepEqual(appels, [], 'les couches du cache ne sont pas rechargées une à une en tête de liste');
  for (const c of CODES) {
    assert.equal(f.couchesProjet[c].n, NB[c], c);
    assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, NB[c]);
    assert.ok(!f.disque.has(`${CACHE}/${H0}/${c}.gpkg`) && !f.disque.has(`${CACHE}/${H0}/${c}.avant.gpkg`) && !f.disque.has(`${CACHE}/${H0}/${c}.qml`), 'ancienne génération nettoyée');
  }
  assert.deepEqual(f.registre().map((e) => [e.chemin, e.objets]), CODES.map((c) => [`actuel/${c}.gpkg`, NB[c]]));
  assert.equal(L.cacheLignePanneau(f.registre()), 'Cache ONF du 26/11/2026 : 4 forêts, 53 parcelles, 1 point de rencontre.');
  assert.equal(r.message, '');
  sansSurprise(f);
});

test('ouverture, migration refusée par un -wal, un renommage refusé ou un reload sans effet : retour arrière, registre et fichiers d\'origine gardés', () => {
  for (const cas of ['wal', 'renommage', 'reload']) {
    const f = fauxGroupe({ registre: entreesAnciennes(), panne: cas === 'renommage' ? { renommerVers: [`${ACTUEL}/PRS_FR.gpkg`] } : cas === 'reload' ? { reloadSansEffet: 'FOR_PUBL_FR' } : {} });
    for (const c of CODES) f.disque.set(`${CACHE}/${H0}/${c}.gpkg`, { n: NB[c], wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' });
    if (cas === 'wal') f.disque.set(`${ACTUEL}/FOR_PUBL_FR.gpkg-wal`, 'x');
    const { r } = ouvrir(f);
    assert.deepEqual(r.cache.migrees, [], cas);
    assert.deepEqual(r.cache.manquantes, CODES, cas + ' : le cache enregistré n\'est pas affiché : dit');
    assert.ok(r.message.includes(L.TEXTES_CACHE_ONF.cacheIllisible), cas);
    assert.ok(r.cache.notes.some((n) => /^migration/.test(n)), cas + ' : raison notée pour le journal');
    for (const c of CODES) {
      assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, 0, `${cas} : actuel d'origine`);
      assert.equal(f.disque.get(`${CACHE}/${H0}/${c}.gpkg`).n, NB[c], `${cas} : génération gardée`);
    }
    assert.deepEqual(f.registre().map((e) => e.chemin), CODES.map((c) => `${H0}/${c}.gpkg`), cas);
  }
});

test('ouverture, migration : une génération incomplète (un fichier absent) ne migre pas ; « Cache ONF illisible… » ; entrées gardées', () => {
  const f = fauxGroupe({ registre: entreesAnciennes() });
  for (const c of CODES.slice(0, 2)) f.disque.set(`${CACHE}/${H0}/${c}.gpkg`, { n: NB[c], wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' });
  const { r } = ouvrir(f);
  assert.deepEqual(r.cache.migrees, []);
  assert.ok(!f.journal.some((x) => /^renommé /.test(x)));
  assert.ok(r.message.includes(L.TEXTES_CACHE_ONF.cacheIllisible));
  assert.equal(f.registre().length, 3);
});

test('ouverture, mode ancien gardé : sans couches marquées dans le projet, le cache est rechargé en tête de liste comme avant ; rien n\'est migré', () => {
  const f = fauxGroupe({ registre: entreesAnciennes(), projet: false });
  for (const c of CODES) f.disque.set(`${CACHE}/${H0}/${c}.gpkg`, { n: NB[c], wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' });
  const { r, appels } = ouvrir(f);
  assert.deepEqual(r.cache.rechargees, []);
  assert.deepEqual(r.cache.manquantes, CODES, 'faux chargeur sans couche : toutes manquantes, comme avant');
  assert.deepEqual(appels, CODES.map((c) => 'chargerCache ' + c));
  assert.ok(!f.journal.some((x) => /^(renommé|rechargé)/.test(x)), 'aucune migration ni bascule en mode ancien');
  assert.equal(f.registre().length, 3);
});

test('ouverture avec l\'ANCIEN vision.qgz : les GeoPackage vides sont créés quand même (« plugin d\'abord, puis vision.qgz », § 14.3)', () => {
  const f = fauxGroupe({ actuel: { PARC_PUBL_FR: 7 }, projet: false });
  const { r } = ouvrir(f);
  assert.deepEqual(r.cache.creees, ['FOR_PUBL_FR', 'PRS_FR']);
  assert.equal(f.disque.get(`${ACTUEL}/FOR_PUBL_FR.gpkg`).n, 0);
  assert.equal(f.disque.get(`${ACTUEL}/PARC_PUBL_FR.gpkg`).n, 7, 'jamais d\'écrasement');
  assert.ok(![...f.disque.keys()].some((k) => /\.(gml|gfs)$/.test(k)));
  assert.equal(r.message, '');
  // Ouvert une seconde fois : rien à recréer.
  const g = ouvrir(f);
  assert.deepEqual(g.r.cache.creees || [], []);
});

// ------------------------------------------------------------------------------------------- aller-retour 1/3 (relecture)
test('I1 : une exception de existe() vaut « présent » : aucune création sur un fichier peut-être rempli, aucun renommage vers une cible peut-être existante', () => {
  const f = fauxGroupe({ actuel: {} });
  f.ctx.existe = () => { throw new Error('droits refusés'); };
  const { r } = ouvrir(f);
  assert.ok(!f.journal.some((x) => /^(écrit|réécrit|renommé)/.test(x)), 'rien n\'est créé');
  assert.deepEqual(r.cache.creees, []);
  const g = fauxGroupe();
  g.ctx.existe = () => { throw new Error('droits refusés'); };
  const e = L.cacheEnregistrer(g.ctx);
  assert.equal(e.ok, false);
  assert.ok(!g.journal.some((x) => /^renommé /.test(x)), 'aucun renommage');
});

// Réouverture simulée après un retour arrière incomplet : les couches du projet sont relues d'après le disque.
function rouvrir(f) {
  for (const c of CODES) { const l = f.couchesProjet[c]; l.isValid = f.disque.has(l.fichier); l.n = l.isValid ? f.disque.get(l.fichier).n : 0; }
  return ouvrir(f);
}
function retourIncomplet() {
  const avant = { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 };
  const f = fauxGroupe({ actuel: avant, registre: CODES.map((c, i) => ({ cache: 'onf', couche: c, chemin: `actuel/${c}.gpkg`, emprise: ZONE, date: DATE.toISOString(), objets: [2, 7, 0][i] === 0 ? 1 : [2, 7, 0][i] })),
    panne: { renommerVers: [`${ACTUEL}/PRS_FR.gpkg`], renommerToujours: [`${ACTUEL}/PARC_PUBL_FR.gpkg`] } });
  return { f, avant };
}

test('I2 : retour arrière incomplet : le registre ne ment plus (entrées retirées), la reprise est notée, la génération gardée', () => {
  const { f } = retourIncomplet();
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.match(r.raison, /retour arrière incomplet/);
  assert.deepEqual(f.registre(), [], 'aucune entrée de cache : on ne sait plus ce qui s\'affiche');
  assert.ok(f.disque.has(`${CACHE}/${H}/PARC_PUBL_FR.avant.gpkg`));
});

test('I2 (reprise, simple) : actuel absent + sauvegarde présente : reprise par renommage, registre rétabli, message « illisible » (couche non affichée)', () => {
  const f = fauxGroupe({ actuel: { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 } });
  const entrees = CODES.map((c, i) => ({ cache: 'onf', couche: c, chemin: `actuel/${c}.gpkg`, emprise: ZONE, date: DATE.toISOString(), objets: [2, 7, 1][i] }));
  // état laissé par un retour arrière incomplet : les trois fichiers sont des sauvegardes dans la génération H0
  for (const c of CODES) { f.disque.set(`${CACHE}/${H0}/${c}.avant.gpkg`, f.disque.get(`${ACTUEL}/${c}.gpkg`)); f.disque.delete(`${ACTUEL}/${c}.gpkg`); }
  f.ctx.reglages.setValue(L.cleRegistre(ID) + '/reprise', JSON.stringify({ horodatage: H0, entrees: entrees }));
  f.ctx.reglages.setValue(L.cleRegistre(ID), '[]');
  const { r } = rouvrir(f);
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 0 }[c], c);
  assert.ok(!f.journal.some((x) => /^(écrit|réécrit)/.test(x)), 'aucun fichier vide créé à la place');
  assert.deepEqual(JSON.parse(f.ctx.reglages.value(L.cleRegistre(ID), '')).map((e) => e.chemin), CODES.map((c) => `actuel/${c}.gpkg`));
  assert.equal(f.ctx.reglages.value(L.cleRegistre(ID) + '/reprise', 'x'), '', 'reprise terminée');
  assert.ok(r.message.includes(L.TEXTES_CACHE_ONF.cacheIllisible), 'les couches du projet sont invalides jusqu\'à la réouverture : dit');
  assert.ok(r.cache.notes.some((n) => /reprise/.test(n)));
});

test('I2 (reprise impossible) : pas de sauvegarde : le vide est créé mais l\'état est dit (texte validé, note), registre sans entrées', () => {
  const f = fauxGroupe({ actuel: {} });
  f.ctx.reglages.setValue(L.cleRegistre(ID) + '/reprise', JSON.stringify({ horodatage: H0, entrees: [] }));
  const { r } = rouvrir(f);
  assert.deepEqual(r.cache.manquantes, CODES);
  assert.ok(r.message.includes(L.TEXTES_CACHE_ONF.cacheIllisible));
  assert.ok(r.cache.notes.some((n) => /reprise/.test(n)));
});

test('registre mêlé (actuel/ et génération) : les couches saines d\'actuel/ ne sont pas déclarées illisibles', () => {
  const e = entreesActuel();
  const mixte = [e[0], ...entreesAnciennes().slice(1)];
  const f = fauxGroupe({ actuel: { FOR_PUBL_FR: 4, PARC_PUBL_FR: 0, PRS_FR: 0 }, registre: mixte });
  const { r } = ouvrir(f);
  assert.deepEqual(r.cache.manquantes, ['PARC_PUBL_FR', 'PRS_FR']);
  assert.deepEqual(r.cache.rechargees, ['FOR_PUBL_FR']);
});

test('Vision.qml : coucheDuCache (mode ancien) ignore les couches du groupe du projet', () => {
  const q = sansCommentaires(qml());
  const s = q.slice(q.indexOf('function coucheDuCache'), q.indexOf('function coucheDuGroupe'));
  assert.match(s, /vision\/origine/);
});

test('Vision.qml : les notes de l\'ouverture vont aussi dans dernier-echec.txt', () => {
  const q = sansCommentaires(qml());
  assert.match(q.slice(q.indexOf('function demarrer()'), q.indexOf('function ajouterZip')), /cacheDiagnostic\(/);
});

// ------------------------------------------------------------------------------------------- pont QML
const qml = () => lire('plugin/Vision.qml');
function sansCommentaires(t) { return t.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); }

test('Vision.qml : renameFile, reload() et triggerRepaint() pour la bascule ; couches du groupe trouvées par leurs marques, hors couches du plugin', () => {
  const q = sansCommentaires(qml());
  for (const a of ['platformUtilities.renameFile(', '.reload()', '.triggerRepaint()', 'function coucheDuGroupe(', 'Logique.cacheEnregistrer', 'coucheDuGroupe: coucheDuGroupe',
    '"vision/origine"']) {
    assert.ok(q.includes(a), `absent : ${a}`);
  }
  const section = q.slice(q.indexOf('property bool cacheEnCours'), q.indexOf('function cacheLigne'));
  assert.ok(section.length > 500 && !section.includes('deleteLater'), 'aucun deleteLater dans le cache (inopérant sous Qt 6.10)');
  assert.ok(!q.slice(q.indexOf('function servicesCache()')).includes('deleteLater'), 'ni dans les services du cache');
  // La bascule ne passe jamais par addMapLayer ni removeMapLayer pour les couches du groupe : seules les couches du plugin sont ajoutées ou retirées.
  const retirer = q.slice(q.indexOf('function retirerCacheDeLaCarte'), q.indexOf('function cacheLigne'));
  assert.match(retirer, /vision\/origine/, 'le retrait ne vise que les couches ajoutées par le plugin (jamais celles du projet)');
  const groupe = q.slice(q.indexOf('function coucheDuGroupe'), q.indexOf('function ajouterCache'));
  assert.ok(!groupe.includes('addMapLayer') && !groupe.includes('removeMapLayer'));
});

test('Vision.qml : le démarrage et l\'enregistrement reçoivent les mêmes services de groupe (renommer, recharger, coucheDuGroupe)', () => {
  const q = sansCommentaires(qml());
  assert.match(q, /renommer: function \(de, vers\) \{ return !!platformUtilities\.renameFile\(de, vers, true\); \}/);
  assert.match(q, /recharger: function \(l\) \{ l\.reload\(\); l\.triggerRepaint\(\); \}/);
  const services = q.slice(q.indexOf('function servicesCache()'), q.indexOf('function cacheEnregistrer('));
  for (const s of ['coucheDuGroupe', 'renommer', 'recharger', 'reecrireCouche', 'imposerSysteme', 'ouvrirCouche']) assert.ok(services.includes(s), `servicesCache() ne passe pas ${s}`);
  const demarrer = q.slice(q.indexOf('function demarrer()'), q.indexOf('function ajouterZip'));
  assert.match(demarrer, /servicesCache\(\)/);
  assert.match(q.slice(q.indexOf('function cacheEnregistrer(')), /servicesCache\(\)/);
});

test('Vision.qml : une couche ajoutée par le plugin porte la marque d\'origine ; celles du projet ne l\'ont pas', () => {
  const q = sansCommentaires(qml());
  const ajout = q.slice(q.indexOf('function ajouterCache'), q.indexOf('function chargerCache'));
  assert.match(ajout, /setCustomProperty\("vision\/origine", "plugin"\)/);
});

test('sonde C4 retirée : ni Vision.qml, ni Panneau.qml, ni la logique ne la contiennent (rien ne va vers main)', () => {
  for (const f of ['plugin/Vision.qml', 'plugin/Panneau.qml', 'plugin/vision-logique.mjs', 'plugin/main.qml']) {
    assert.ok(!/sonde\s*C4|sondeC4|SONDE_C4|_sonde-c4|vision\/sonde/i.test(lire(f)), f);
  }
});

test('Panneau.qml : un seul bouton de cache, plus de bouton d\'essai ni de texte provisoire', () => {
  const p = lire('plugin/Panneau.qml');
  assert.ok(!/sondeC4|Sonde C4/i.test(p));
  assert.equal((p.match(/mettreEnCacheOnf\(\)/g) || []).length, 1);
});

test('version du plugin : 0.7.0 (préversion), inchangée', () => {
  assert.equal(L.VERSION, '0.7.0');
  assert.match(lire('plugin/metadata.txt'), /version=0\.7\.0/);
});

test('plugin/PLAN.md § 5 : bascule par renommage, couches du projet et GeoPackage vide, avec ce qui est prouvé et ce qui ne l\'est pas', () => {
  const plan = lire('plugin/PLAN.md');
  const s5 = plan.slice(plan.indexOf('## 5.'), plan.indexOf('## 6.'));
  for (const a of ['platformUtilities.renameFile', 'couche.reload()', 'triggerRepaint()', 'vision/origine', 'ONF Cache', 'mapLayers(qgisProject)', 'GeoPackage vide']) assert.ok(s5.includes(a), a);
  assert.ok(s5.includes('non prouvé'));
});
