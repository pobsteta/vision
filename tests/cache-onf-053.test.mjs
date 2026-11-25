// Mission 053, étape 1 ter : cache de zone des couches ONF dans le plugin (fiche pilotage/missions/053-couches-onf-wfs.md ;
// preuves dans docs/referentiels/cache-zone-qfield.md). Toute la logique est testée hors réseau : textes validés par Pascal
// (mot pour mot, lus dans la fiche), emprise (quatre coins, plafond de 20 km), requête, complétude des réponses, schéma .gfs
// (lu par le vrai GDAL quand il est là), enregistrement tout ou rien, rechargement, registre (forme R2 corrigée), styles
// adaptés. L'API de QField est simulée : un vert ne prouve rien sur le Samsung (protocole : cache-zone-qfield.md § 11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from '../plugin/vision-logique.mjs';
import { EMPRISE_VRAISEMBLANCE } from '../plugin/vision-controles.mjs';
import { STYLES_ONF } from '../plugin/vision-styles-onf.mjs';
import { genererStylesOnf, adapterStyleOnf, SOURCES_STYLES_ONF, FICHIERS_PLUGIN } from '../plugin/empaqueter.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ici, '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const gdal = spawnSync('ogrinfo', ['--version']).status === 0;
const pyproj = spawnSync('python3', ['-I', '-c', 'import pyproj']).status === 0;

const ID = '6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b';
const PROJET = '/sdcard/QField/vision';
const IMPORTS = PROJET + '/vision-imports';
const CACHE = IMPORTS + '/_cache-onf';
const DATE = new Date(2026, 10, 25, 17, 30, 0); // 25/11/2026, heure de l'appareil
const H = L.cacheHorodatage(DATE);

// Point du terrain : massif de la Serre (Jura, cas Serre_EA2026 de JFC), WGS84 lon 5,585° E, lat 47,185° N (ordre lon, lat),
// soit x 895 717, y 6 679 283 en EPSG:2154 (ordre x est, y nord ; pyproj 3.8.0, vérifié ci-dessous).
const SERRE = { lon: 5.585, lat: 47.185, x: 895717, y: 6679283 };
const ZONE = { xmin: 893717, ymin: 6677283, xmax: 897717, ymax: 6681283 }; // 4 km de côté, centrée sur le point

// ------------------------------------------------------------------------------------------- textes validés (fiche)
function textesDeLaFiche() {
  const fiche = lire('pilotage/missions/053-couches-onf-wfs.md');
  const t = {};
  for (const l of fiche.split('\n')) {
    const m = /^\| ([^|]+) \| (.+) \|$/.exec(l);
    if (m && m[2].includes('«')) t[m[1].trim()] = [...m[2].matchAll(/« (.*?) »/g)].map((x) => x[1]);
  }
  return t;
}

test('textes : ceux de la fiche (validés par Pascal le 25 novembre 2026), mot pour mot', () => {
  const f = textesDeLaFiche();
  assert.equal(L.TEXTES_CACHE_ONF.bouton, f['Bouton'][0]);
  assert.equal(L.TEXTES_CACHE_ONF.pendant, f['Pendant'][0]);
  assert.equal(L.TEXTES_CACHE_ONF.zoneTropGrande, f['Zone trop grande'][0]);
  assert.equal(L.TEXTES_CACHE_ONF.pasDeReseau, f['Pas de réseau'][0]);
  assert.equal(L.TEXTES_CACHE_ONF.reponseIncomplete, f['Réponse incomplète'][0]);
  assert.equal(L.messageCacheReussi({ FOR_PUBL_FR: 4, PARC_PUBL_FR: 53, PRS_FR: 1 }, DATE), f['Réussite'][0]);
  assert.equal(L.messageTropDObjets('PARC_PUBL_FR'), f["Trop d'objets"][0]);
  // Noms : remplacés par les arbitrages de Pascal sur le prototype (attribution « © ONF » dans le nom).
  assert.deepEqual(L.CACHE_ONF.couches.map((c) => c.nom), arbitragesDuPrototype().noms);
  const entrees = L.CACHE_ONF.couches.map((c, i) => ({ cache: 'onf', couche: c.couche, chemin: `${H}/${c.couche}.gpkg`, date: DATE.toISOString(), objets: [4, 53, 1][i] }));
  assert.equal(L.cacheLignePanneau(entrees), f['Dans le panneau'][0]);
});

test('textes : « Trop d\'objets » nomme la couche en cause ; nombres au singulier pour 0 et 1', () => {
  assert.equal(L.messageTropDObjets('FOR_PUBL_FR'), "Trop d'objets dans cette zone (plus de 5 000 forêts) : zoomez, puis recommencez.");
  assert.equal(L.messageTropDObjets('PRS_FR'), "Trop d'objets dans cette zone (plus de 5 000 points de rencontre) : zoomez, puis recommencez.");
  assert.equal(L.messageCacheReussi({ FOR_PUBL_FR: 1, PARC_PUBL_FR: 0, PRS_FR: 2 }, DATE),
    'Couches ONF en cache : 1 forêt, 0 parcelle, 2 points de rencontre (zone du 25/11/2026).');
  assert.equal(L.cacheDateAffichee(new Date(2027, 0, 5)), '05/01/2027');
});

// Aller-retour 1/3 : textes ajoutés et noms validés par Pascal (fiche, « Arbitrages de Pascal sur le prototype »).
function arbitragesDuPrototype() {
  const fiche = lire('pilotage/missions/053-couches-onf-wfs.md');
  const i = fiche.indexOf('**Arbitrages de Pascal sur le prototype');
  assert.ok(i >= 0, 'arbitrages sur le prototype absents de la fiche');
  const bloc = fiche.slice(i, fiche.indexOf('\n\n', i)).replace(/\n\s*/g, ' ');
  const cites = [...bloc.matchAll(/« (.*?) »/g)].map((m) => m[1]);
  return { cites, noms: cites.filter((c) => /\(© ONF\)$/.test(c)) };
}

test('textes ajoutés (aller-retour 1/3) : validés par Pascal, mot pour mot, rangés avec les autres', () => {
  const { cites, noms } = arbitragesDuPrototype();
  for (const k of ['echecLocal', 'horsFrance', 'cacheIllisible', 'positionIllisible']) {
    assert.ok(cites.includes(L.TEXTES_CACHE_ONF[k]), `${k} : « ${L.TEXTES_CACHE_ONF[k]} » absent des arbitrages`);
  }
  assert.ok(cites.includes(L.messageZipReserve('_cache-onf.zip')));
  assert.deepEqual(noms, ['Forêts publiques (© ONF)', 'Parcelles forestières (© ONF)', 'Points de rencontre des secours (© ONF)']);
  assert.equal(L.TEXTES_CACHE_ONF_PROPOSES, undefined, 'plus de textes proposés en attente');
  assert.ok(!/NON VALIDÉS/.test(lire('plugin/vision-logique.mjs')));
});

test('emprise illisible : « Position de la carte illisible… » ; hors de France : « Carte hors de France métropolitaine… »', () => {
  assert.equal(L.cacheJugerEmprise(null, EMPRISE_VRAISEMBLANCE).message, L.TEXTES_CACHE_ONF.positionIllisible);
  assert.equal(L.cacheJugerEmprise({ xmin: 5.5, ymin: 47.1, xmax: 5.6, ymax: 47.2 }, EMPRISE_VRAISEMBLANCE).message, L.TEXTES_CACHE_ONF.horsFrance);
});

test('B1 : couche du cache invalide à la réouverture : libererCouche (deleteLater) jamais appelé', () => {
  const reglages = new Map([[L.cleRegistre(ID), JSON.stringify(entreesCache())]]);
  const liberees = [];
  const r = L.demarrerProjet({
    variables: { vision_id: ID }, dossierProjet: PROJET, existe: () => true, chargerCouche: () => null,
    reglages: { value: (k, d) => (reglages.has(k) ? reglages.get(k) : d), setValue: (k, v) => reglages.set(k, v) },
    chargerCache: () => ({ isValid: false }), libererCouche: (l) => liberees.push(l), coucheDuProjet: () => false,
  });
  assert.deepEqual(r.cache.manquantes, ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR']);
  assert.deepEqual(liberees, []);
});

test('seuils (arbitrage sur le prototype) : parcelles et points visibles en deçà du 1:50 000, forêts toujours visibles', () => {
  const entete = (x) => /<qgis [^>]*>/.exec(x)[0];
  for (const c of ['PARC_PUBL_FR', 'PRS_FR']) {
    assert.match(entete(STYLES_ONF[c]), / hasScaleBasedVisibilityFlag="1"/, c);
    assert.match(entete(STYLES_ONF[c]), / minScale="50000"/, c);
    assert.match(entete(STYLES_ONF[c]), / maxScale="0"/, c);
  }
  assert.match(entete(STYLES_ONF.FOR_PUBL_FR), / hasScaleBasedVisibilityFlag="0"/);
  assert.equal(entete(STYLES_ONF.FOR_PUBL_FR), entete(source('FOR_PUBL_FR')));
});

test('changement de projet pendant le téléchargement : rien n\'est écrit, « Enregistrement du cache ONF impossible… »', () => {
  const f = fauxQField();
  f.ctx.depart = { visionId: ID, dossierProjet: '/sdcard/QField/autre' };
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
  assert.equal(f.disque.size, 0);
  const g = fauxQField();
  g.ctx.depart = { visionId: ID, dossierProjet: PROJET };
  assert.equal(L.cacheEnregistrer(g.ctx).ok, true);
});

test('registre illisible : le cache ne le remplace pas (seul l\'ajout d\'un zip le remplace, message d\'ouverture)', () => {
  const f = fauxQField();
  f.ctx.reglages.setValue(L.cleRegistre(ID), '{pas du json');
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
  assert.equal(f.ctx.reglages.value(L.cleRegistre(ID), ''), '{pas du json');
  assert.equal(f.carte.length, 0);
});

test('dossier réservé insensible à la casse (_CACHE-ONF.zip refusé)', () => {
  assert.ok(L.estDossierReserve('_CACHE-ONF') && L.estDossierReserve('_Cache-Onf'));
  const r = L.importerZip({ visionId: ID, nomZip: '_CACHE-ONF.zip', dossierProjet: PROJET, octets: new Uint8Array(0), reglages: { value: () => '', setValue: () => {} } });
  assert.equal(r.message, L.messageZipReserve('_CACHE-ONF.zip'));
});

test('plugin/PLAN.md § 5 : appels du cache ONF inscrits', () => {
  const plan = lire('plugin/PLAN.md');
  const s5 = plan.slice(plan.indexOf('## 5.'), plan.indexOf('## 6.'));
  for (const a of ['iface.createHttpRequest()', 'screenToCoordinate', 'EXPOSE_GML_ID=NO', 'couche.crs', 'wkbType()', 'vision/cache']) assert.ok(s5.includes(a), a);
});

// ------------------------------------------------------------------------------------------- constantes, emprise
test('constantes : service http de l\'ONF, trois couches, plafonds de Pascal (20 km, 5 000 objets), dossier réservé', () => {
  assert.equal(L.CACHE_ONF.service, 'http://ws.carmencarto.fr/WFS/105/ONF_Forets');
  assert.deepEqual(L.CACHE_ONF.couches.map((c) => c.couche), ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR']);
  assert.deepEqual(L.CACHE_ONF.couches.map((c) => c.wkb), [6, 6, 1], 'MultiPolygon, MultiPolygon, Point');
  assert.equal(L.CACHE_ONF.coteMax, 20000);
  assert.equal(L.CACHE_ONF.objetsMax, 5000);
  assert.equal(L.CACHE_ONF.systeme, 'EPSG:2154');
  assert.equal(L.cacheDossier(PROJET), CACHE);
  assert.equal(L.cacheDossier('relatif'), '');
  // Champs réels (mesure n° 1), gml_id jamais déclaré.
  assert.deepEqual(L.coucheOnf('FOR_PUBL_FR').champs, ['iidtn_frt', 'llib_frt', 'cdom_frt', 'cinse_dep']);
  assert.deepEqual(L.coucheOnf('PARC_PUBL_FR').champs, ['iidtn_frt', 'llib_frt', 'ccod_prf']);
  assert.equal(L.coucheOnf('PRS_FR').champs.length, 13);
  for (const c of L.CACHE_ONF.couches) assert.ok(!c.champs.includes('gml_id') && !c.champs.includes('coordinates'));
});

test('point du terrain : le massif de la Serre tombe au bon endroit (pyproj, WGS84 lon/lat -> EPSG:2154 x/y, à 1 m)', { skip: !pyproj && 'pyproj absent' }, () => {
  const script = `from pyproj import Transformer\nt = Transformer.from_crs('EPSG:4326', 'EPSG:2154', always_xy=True)\nx, y = t.transform(${SERRE.lon}, ${SERRE.lat})\nprint(f'{x:.3f} {y:.3f}')`;
  const r = spawnSync('python3', ['-I', '-c', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const [x, y] = r.stdout.trim().split(' ').map(Number);
  assert.ok(Math.abs(x - SERRE.x) <= 1 && Math.abs(y - SERRE.y) <= 1, `pyproj ${x} ${y}`);
});

test('emprise : boîte des quatre coins d\'une carte tournée, en EPSG:2154 (x est, y nord)', () => {
  // Carré de 2 km tourné de 30° autour du point de la Serre : la boîte englobante est plus large que le carré.
  const a = Math.PI / 6;
  const coins = [[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]].map(([dx, dy]) => ({
    x: SERRE.x + dx * Math.cos(a) - dy * Math.sin(a), y: SERRE.y + dx * Math.sin(a) + dy * Math.cos(a) }));
  const e = L.cacheEmpriseDesPoints(coins);
  const demi = 1000 * (Math.cos(a) + Math.sin(a));
  assert.ok(Math.abs(e.xmin - (SERRE.x - demi)) < 1e-6 && Math.abs(e.xmax - (SERRE.x + demi)) < 1e-6);
  assert.ok(Math.abs(e.ymin - (SERRE.y - demi)) < 1e-6 && Math.abs(e.ymax - (SERRE.y + demi)) < 1e-6);
  assert.equal(L.cacheEmpriseDesPoints([]), null);
  assert.equal(L.cacheEmpriseDesPoints([{ x: NaN, y: 1 }]), null);
});

test('emprise : plus de 20 km de côté refusée (jamais rognée), 20 km acceptés ; illisible ou hors de France refusée', () => {
  assert.deepEqual(L.cacheJugerEmprise(ZONE, EMPRISE_VRAISEMBLANCE), { ok: true, emprise: ZONE, refus: '', message: '' });
  const vingt = { xmin: 885000, ymin: 6670000, xmax: 905000, ymax: 6690000 };
  assert.equal(L.cacheJugerEmprise(vingt, EMPRISE_VRAISEMBLANCE).ok, true);
  for (const g of [{ ...vingt, xmax: 905001 }, { ...vingt, ymax: 6690001 }]) {
    const r = L.cacheJugerEmprise(g, EMPRISE_VRAISEMBLANCE);
    assert.equal(r.refus, 'trop-grande');
    assert.equal(r.message, L.TEXTES_CACHE_ONF.zoneTropGrande);
  }
  assert.equal(L.cacheJugerEmprise(null, EMPRISE_VRAISEMBLANCE).refus, 'illisible');
  assert.equal(L.cacheJugerEmprise(null, EMPRISE_VRAISEMBLANCE).message, L.TEXTES_CACHE_ONF.positionIllisible);
  // Une emprise en degrés (carte en WGS84 non reprojetée) n'est pas en France en Lambert 93.
  assert.equal(L.cacheJugerEmprise({ xmin: 5.5, ymin: 47.1, xmax: 5.6, ymax: 47.2 }, EMPRISE_VRAISEMBLANCE).refus, 'hors-france');
});

test('requête : GetFeature WFS 1.0.0, BBOX x,y en Lambert 93 arrondie vers l\'extérieur, MAXFEATURES = plafond + 1', () => {
  assert.equal(L.cacheUrlGetFeature('PARC_PUBL_FR', { xmin: 893717.4, ymin: 6677283.2, xmax: 897717.6, ymax: 6681283.9 }),
    'http://ws.carmencarto.fr/WFS/105/ONF_Forets?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&TYPENAME=PARC_PUBL_FR'
    + '&BBOX=893717,6677283,897718,6681284&MAXFEATURES=5001');
  assert.throws(() => L.cacheUrlGetFeature('DT_FR', ZONE), /couche inconnue/);
});

test('préparation : projet Vision et dossier sains, emprise jugée, génération horodatée en UTC', () => {
  const p = L.cachePreparer({ visionId: ID, dossierProjet: PROJET, emprise: ZONE, vraisemblance: EMPRISE_VRAISEMBLANCE, maintenant: () => DATE });
  assert.equal(p.ok, true);
  assert.match(p.horodatage, /^\d{8}T\d{6}Z$/);
  assert.equal(L.cacheHorodatage(new Date(Date.UTC(2026, 10, 25, 9, 5, 7))), '20261125T090507Z');
  assert.equal(L.cachePreparer({ visionId: 'x', dossierProjet: PROJET, emprise: ZONE }).message, L.TEXTES_CACHE_ONF.echecLocal);
  assert.equal(L.cachePreparer({ visionId: ID, dossierProjet: PROJET, emprise: { xmin: 0, ymin: 0, xmax: 30000, ymax: 1 }, vraisemblance: EMPRISE_VRAISEMBLANCE }).message,
    L.TEXTES_CACHE_ONF.zoneTropGrande);
});

// ------------------------------------------------------------------------------------------- réponses
// Réponse de forme MapServer 7 (WFS 1.0.0, GML 2) : schemaLocation vers DescribeFeatureType, boundedBy par objet,
// géométrie tantôt Polygon, tantôt MultiPolygon (essais n° 2 et 4 de la sonde).
function reponseParcelles(n, { prefixe = 'ms' } = {}) {
  const membres = [];
  for (let i = 0; i < n; i++) {
    // Parcelles de 100 m, disjointes ; la première contient le point de la Serre.
    const x = SERRE.x - 50 + (i % 10) * 100;
    const y = SERRE.y - 50 + Math.floor(i / 10) * 100;
    const anneau = `${x},${y} ${x + 100},${y} ${x + 100},${y + 100} ${x},${y + 100} ${x},${y}`;
    const geom = i % 2 === 0
      ? `<gml:Polygon srsName="EPSG:2154"><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>${anneau}</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon>`
      : `<gml:MultiPolygon srsName="EPSG:2154"><gml:polygonMember><gml:Polygon><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>${anneau}</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon></gml:polygonMember></gml:MultiPolygon>`;
    membres.push(`    <gml:featureMember>
      <${prefixe}:PARC_PUBL_FR>
        <gml:boundedBy><gml:Box srsName="EPSG:2154"><gml:coordinates>${x},${y} ${x + 100},${y + 100}</gml:coordinates></gml:Box></gml:boundedBy>
        <${prefixe}:msGeometry>${geom}</${prefixe}:msGeometry>
        <${prefixe}:iidtn_frt>F39OFFL${i}</${prefixe}:iidtn_frt>
        <${prefixe}:llib_frt>Forêt communale d'Offlanges</${prefixe}:llib_frt>
        <${prefixe}:ccod_prf>${i + 1}a</${prefixe}:ccod_prf>
      </${prefixe}:PARC_PUBL_FR>
    </gml:featureMember>
`);
  }
  return `<?xml version='1.0' encoding="UTF-8" ?>
<wfs:FeatureCollection
   xmlns:${prefixe}="http://mapserver.gis.umn.edu/mapserver"
   xmlns:wfs="http://www.opengis.net/wfs"
   xmlns:gml="http://www.opengis.net/gml"
   xmlns:ogc="http://www.opengis.net/ogc"
   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
   xsi:schemaLocation="http://www.opengis.net/wfs http://schemas.opengis.net/wfs/1.0.0/WFS-basic.xsd
                       http://mapserver.gis.umn.edu/mapserver http://127.0.0.1:9/WFS/105/ONF_Forets?SERVICE=WFS&amp;VERSION=1.0.0&amp;REQUEST=DescribeFeatureType&amp;TYPENAME=PARC_PUBL_FR&amp;OUTPUTFORMAT=XMLSCHEMA">
      <gml:boundedBy><gml:Box srsName="EPSG:2154"><gml:coordinates>895200,6678800 897100,6680800</gml:coordinates></gml:Box></gml:boundedBy>
${membres.join('')}</wfs:FeatureCollection>
`;
}

function reponsePoints(n) {
  let m = '';
  for (let i = 0; i < n; i++) {
    m += `    <gml:featureMember>
      <ms:PRS_FR>
        <gml:boundedBy><gml:Box srsName="EPSG:2154"><gml:coordinates>${SERRE.x},${SERRE.y} ${SERRE.x},${SERRE.y}</gml:coordinates></gml:Box></gml:boundedBy>
        <ms:msGeometry><gml:Point srsName="EPSG:2154"><gml:coordinates>${SERRE.x},${SERRE.y}</gml:coordinates></gml:Point></ms:msGeometry>
        <ms:iidtn_prs>39-ONF-000${i}</ms:iidtn_prs>
        <ms:llib_prs>Carrefour de la Serre</ms:llib_prs>
        <ms:llib_com>Offlanges</ms:llib_com>
      </ms:PRS_FR>
    </gml:featureMember>
`;
  }
  // Sans objet, MapServer écrit une boîte « missing » (mapwfs.c, msWFSGetFeature_GMLPostfix : <gml:null>missing</gml:null>).
  if (n === 0) m = '   <gml:boundedBy>\n      <gml:null>missing</gml:null>\n   </gml:boundedBy>\n';
  return `<?xml version='1.0' encoding="UTF-8" ?>\n<wfs:FeatureCollection xmlns:ms="http://mapserver.gis.umn.edu/mapserver" xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml">\n${m}</wfs:FeatureCollection>\n`;
}

test('réponse complète : jugée bonne, objets comptés', () => {
  const r = L.cacheJugerReponse('PARC_PUBL_FR', { statut: 200, texte: reponseParcelles(3) });
  assert.deepEqual(r, { ok: true, refus: '', nbObjets: 3, message: '' });
  assert.equal(L.cacheJugerReponse('PRS_FR', { statut: 200, texte: reponsePoints(0) }).nbObjets, 0, 'zone sans point : 0, accepté');
});

test('réponse coupée après les en-têtes (onload, texte tronqué), exception en HTTP 200, HTTP 500 : « Réponse incomplète »', () => {
  const t = reponseParcelles(3);
  const exc = '<?xml version=\'1.0\' encoding="UTF-8" ?>\n<ServiceExceptionReport version="1.2.0"><ServiceException code="InvalidParameterValue">msWFSGetFeature(): erreur</ServiceException></ServiceExceptionReport>';
  for (const r of [{ statut: 200, texte: t.slice(0, t.length / 2) }, { statut: 200, texte: exc }, { statut: 500, texte: t }, { statut: 200, texte: '' }]) {
    const j = L.cacheJugerReponse('PARC_PUBL_FR', r);
    assert.equal(j.ok, false);
    assert.equal(j.message, L.TEXTES_CACHE_ONF.reponseIncomplete);
  }
});

test('aucune réponse (statut 0 : réseau absent, délai, annulation) : « Pas de réseau »', () => {
  for (const r of [{ statut: 0, texte: '', erreur: 'erreur réseau 3' }, { statut: 0, texte: '', erreur: 'délai dépassé' }, {}]) {
    assert.equal(L.cacheJugerReponse('FOR_PUBL_FR', r).message, L.TEXTES_CACHE_ONF.pasDeReseau);
  }
});

test('5 001 objets reçus (MAXFEATURES = 5 001) : « Trop d\'objets », la couche en cause est nommée ; 5 000 acceptés', () => {
  const membre = '<gml:featureMember><ms:PRS_FR><ms:llib_prs>x</ms:llib_prs></ms:PRS_FR></gml:featureMember>\n';
  const texte = (n) => '<?xml version=\'1.0\' encoding="UTF-8" ?>\n<wfs:FeatureCollection>' + membre.repeat(n) + '</wfs:FeatureCollection>\n';
  const trop = L.cacheJugerReponse('PRS_FR', { statut: 200, texte: texte(5001) });
  assert.equal(trop.refus, 'trop');
  assert.equal(trop.message, L.messageTropDObjets('PRS_FR'));
  assert.equal(L.cacheJugerReponse('PRS_FR', { statut: 200, texte: texte(5000) }).ok, true);
});

test('accents en danger (encodage déclaré autre que UTF-8, caractères illisibles) : refus, jamais un cache aux accents perdus', () => {
  const t = reponseParcelles(1);
  assert.equal(L.cacheJugerReponse('PARC_PUBL_FR', { statut: 200, texte: t.replace('encoding="UTF-8"', 'encoding="ISO-8859-1"') }).ok, false);
  assert.equal(L.cacheJugerReponse('PARC_PUBL_FR', { statut: 200, texte: t.replace('Forêt', 'For�t') }).ok, false);
});

test('élément de géométrie lu dans la réponse (msGeometry par défaut)', () => {
  assert.equal(L.cacheElementGeometrie(reponseParcelles(1)), 'msGeometry');
  assert.equal(L.cacheElementGeometrie(reponseParcelles(1).replace(/msGeometry/g, 'the_geom')), 'the_geom');
  assert.equal(L.cacheElementGeometrie(reponsePoints(0)), 'msGeometry');
});

// ------------------------------------------------------------------------------------------- .gfs, avec le vrai GDAL
function ouvrirAvecGdal(dossier, couche, texte) {
  const chemins = { gml: join(dossier, couche + '.gml'), gfs: join(dossier, couche + '.gfs') };
  writeFileSync(chemins.gml, texte, 'utf8');
  writeFileSync(chemins.gfs, L.cacheGfs(couche, L.cacheElementGeometrie(texte)), 'utf8');
  // Mêmes options d'ouverture que la source donnée à QGIS (« |option:CLÉ=VALEUR »).
  const source = L.cacheSourceGml(chemins, couche);
  const options = [...source.matchAll(/\|option:([^|]+)/g)].flatMap((m) => ['-oo', m[1]]);
  assert.deepEqual(options, ['-oo', 'EXPOSE_GML_ID=NO']);
  const r = spawnSync('ogrinfo', ['-json', '-features', ...options, chemins.gml, couche], { encoding: 'utf8', env: { ...process.env, GDAL_HTTP_TIMEOUT: '2' } });
  assert.equal(r.status, 0, r.stderr);
  return { j: JSON.parse(r.stdout).layers[0], stderr: r.stderr, chemins, options };
}

test('.gfs (GDAL réel) : parcelles en MultiPolygon et EPSG:2154 même mêlées de Polygon, champs réels seuls (ni gml_id ni coordinates), accents, aucun schéma distant',
  { skip: !gdal && 'GDAL absent' }, () => {
    const d = mkdtempSync(join(tmpdir(), 'vision-cache-'));
    try {
      const { j, stderr, chemins, options } = ouvrirAvecGdal(d, 'PARC_PUBL_FR', reponseParcelles(4));
      assert.equal(j.featureCount, 4);
      assert.equal(j.geometryFields[0].type, 'MultiPolygon');
      assert.match(JSON.stringify(j.geometryFields[0].coordinateSystem), /"EPSG",2154\]|2154/);
      assert.deepEqual(j.fields.map((f) => f.name), ['iidtn_frt', 'llib_frt', 'ccod_prf']);
      for (const f of j.features) assert.equal(f.geometry.type, 'MultiPolygon');
      assert.equal(j.features[0].properties.llib_frt, "Forêt communale d'Offlanges");
      assert.ok(!/127\.0\.0\.1|connect/i.test(stderr), 'le DescribeFeatureType du schemaLocation ne doit pas être demandé : ' + stderr);
      // Réécriture en GeoPackage : le type MultiPolygon reste.
      const gpkg = join(d, 'PARC_PUBL_FR.gpkg');
      const w = spawnSync('ogr2ogr', ['-f', 'GPKG', gpkg, ...options, chemins.gml, 'PARC_PUBL_FR'], { encoding: 'utf8' });
      assert.equal(w.status, 0, w.stderr);
      const g = JSON.parse(spawnSync('ogrinfo', ['-json', '-so', gpkg, 'PARC_PUBL_FR'], { encoding: 'utf8' }).stdout).layers[0];
      assert.equal(g.featureCount, 4);
      assert.equal(g.geometryFields[0].type, 'MultiPolygon');
      // Point du terrain : (x, y) EPSG:2154 du massif de la Serre, filtre d'1 m : il tombe dans la première parcelle seule.
      const p = spawnSync('ogrinfo', ['-json', '-features', '-spat', String(SERRE.x - 0.5), String(SERRE.y - 0.5), String(SERRE.x + 0.5), String(SERRE.y + 0.5), gpkg, 'PARC_PUBL_FR'], { encoding: 'utf8' });
      assert.deepEqual(JSON.parse(p.stdout).layers[0].features.map((f) => f.properties.ccod_prf), ['1a']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

test('.gfs (GDAL réel) : points en Point, 13 champs déclarés ; zone sans objet : couche vide lisible', { skip: !gdal && 'GDAL absent' }, () => {
  const d = mkdtempSync(join(tmpdir(), 'vision-cache-'));
  try {
    const { j } = ouvrirAvecGdal(d, 'PRS_FR', reponsePoints(2));
    assert.equal(j.featureCount, 2);
    assert.equal(j.geometryFields[0].type, 'Point');
    assert.deepEqual(j.fields.map((f) => f.name), L.coucheOnf('PRS_FR').champs);
    assert.deepEqual(j.features[0].geometry.coordinates, [SERRE.x, SERRE.y], 'x est puis y nord, sans inversion');
    const v = ouvrirAvecGdal(d, 'PRS_FR', reponsePoints(0)).j;
    assert.equal(v.featureCount, 0);
    assert.equal(v.geometryFields[0].type, 'Point');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('.gfs : forme (système, type, champs du service en String) ; couche inconnue refusée', () => {
  const g = L.cacheGfs('FOR_PUBL_FR');
  assert.match(g, /<SRSName>EPSG:2154<\/SRSName>/);
  assert.match(g, /<GeometryType>6<\/GeometryType>/);
  assert.match(g, /<GeometryElementPath>msGeometry<\/GeometryElementPath>/);
  assert.equal((g.match(/<PropertyDefn>/g) || []).length, 4);
  assert.match(L.cacheGfs('PRS_FR'), /<GeometryType>1<\/GeometryType>/);
  assert.throws(() => L.cacheGfs('RB_FR'), /couche inconnue/);
});

// ------------------------------------------------------------------------------------------- chemins et garde
test('chemins : une génération par dossier, fichier = nom de la couche (table et .qml voisin, ADR 0008)', () => {
  const p = L.cacheChemins(PROJET, H, 'FOR_PUBL_FR');
  assert.deepEqual(p, {
    relatif: `${H}/FOR_PUBL_FR.gpkg`, gml: `${CACHE}/${H}/FOR_PUBL_FR.gml`, gfs: `${CACHE}/${H}/FOR_PUBL_FR.gfs`,
    gpkg: `${CACHE}/${H}/FOR_PUBL_FR.gpkg`, qml: `${CACHE}/${H}/FOR_PUBL_FR.qml` });
  assert.equal(L.cacheChemins(PROJET, '../x', 'FOR_PUBL_FR'), null);
  assert.equal(L.cacheChemins(PROJET, H, 'UG'), null);
});

test('garde : seuls les fichiers du cache (_cache-onf/<horodatage>/<couche><suffixe>) sont touchés', () => {
  for (const s of ['.gpkg', '.qml', '.gml', '.gfs', '.gpkg-wal', '.gpkg-shm', '.gpkg.aux.xml']) assert.ok(L.peutToucherCache(`${CACHE}/${H}/PRS_FR${s}`, IMPORTS), s);
  for (const mauvais of [`${IMPORTS}/Serre/UG.gpkg`, `${IMPORTS}/Serre.zip`, `${CACHE}/PRS_FR.gpkg`, `${CACHE}/${H}/UG.gpkg`,
    `${CACHE}/x/PRS_FR.gpkg`, `${CACHE}/${H}/../PRS_FR.gpkg`, `${CACHE}/${H}/PRS_FR.gpkg|layername=x`, `${CACHE}/${H}/PRS_FR.txt`]) {
    assert.ok(!L.peutToucherCache(mauvais, IMPORTS), mauvais);
  }
  assert.ok(!L.peutToucherCache(`/autre/_cache-onf/${H}/PRS_FR.gpkg`, '/autre'), 'dossier qui n\'est pas vision-imports');
});

// ------------------------------------------------------------------------------------------- faux QField
// Disque en mémoire ; couches simulées : un GML ouvert a les objets du texte écrit ; le GeoPackage, ceux de la couche réécrite.
function fauxQField({ panne = {}, registre = [] } = {}) {
  const disque = new Map();
  const journal = [];
  const carte = [];
  const reglages = new Map([[L.cleRegistre(ID), JSON.stringify(registre)]]);
  const couche = (props) => ({
    isValid: true, readOnly: false, crs: { authid: props.authid }, n: props.n, nom: props.nom, uri: props.uri,
    proprietes: {}, wkbType() { return props.wkb; }, extent() { return props.emprise; },
    setCustomProperty(k, v) { this.proprietes[k] = v; }, customProperty(k, d) { return k in this.proprietes ? this.proprietes[k] : d; },
  });
  const emprise = { xMinimum: 895200, yMinimum: 6678800, xMaximum: 897100, yMaximum: 6680800 };
  const ctx = {
    visionId: ID, dossierProjet: PROJET, horodatage: H, date: DATE, emprise: ZONE, vraisemblance: EMPRISE_VRAISEMBLANCE,
    reglages: { value: (k, d) => (reglages.has(k) ? reglages.get(k) : d), setValue: (k, v) => reglages.set(k, v) },
    styles: STYLES_ONF,
    reponses: { FOR_PUBL_FR: { texte: 'gml-for', nbObjets: 4 }, PARC_PUBL_FR: { texte: 'gml-parc', nbObjets: 53 }, PRS_FR: { texte: 'gml-prs', nbObjets: 1 } },
    ecrireFichier(chemin, texte) { journal.push('écrit ' + chemin); if (panne.ecrire === chemin) return false; disque.set(chemin, texte); return true; },
    effacerFichier(chemin) { journal.push('effacé ' + chemin); disque.delete(chemin); return true; },
    existe: (chemin) => disque.has(chemin),
    ouvrirCouche(uri, nom) {
      journal.push('ouvert ' + uri);
      const fichier = uri.split('|')[0];
      if (!disque.has(fichier)) return { isValid: false };
      const c = L.coucheOnf(fichier.replace(/^.*\//, '').replace(/\.[a-z]+$/, ''));
      if (/\.gml$/.test(fichier)) {
        assert.ok(disque.has(fichier.replace(/\.gml$/, '.gfs')), 'le .gfs est écrit avant l\'ouverture du GML');
        const n = ctx.reponses[c.couche].nbObjets;
        return couche({ uri, nom, n, wkb: panne.wkbGml === c.couche ? 3 : c.wkb, authid: panne.systeme && panne.systeme[c.couche] !== undefined ? panne.systeme[c.couche] : 'EPSG:2154', emprise });
      }
      assert.ok(disque.has(fichier.replace(/\.gpkg$/, '.qml')), 'le style est écrit avant l\'ouverture du GeoPackage');
      const d = disque.get(fichier);
      return couche({ uri, nom, n: panne.relus === c.couche ? d.n - 1 : d.n, wkb: d.wkb, authid: d.authid, emprise });
    },
    creerIterateur(l) { let i = 0; return { hasNext: () => i < l.n, next: () => { i++; return {}; }, close() {} }; },
    imposerSysteme(l) { journal.push('système imposé'); l.crs = { authid: 'EPSG:2154' }; },
    reecrireCouche(l, cible) { journal.push('réécrit ' + cible); disque.set(cible, { n: l.n, wkb: l.wkbType(), authid: l.crs.authid }); return cible; },
    retirerCacheDeLaCarte() { journal.push('ancien cache retiré'); for (let i = carte.length - 1; i >= 0; i--) if (carte[i].customProperty('vision/cache', '') === 'onf') carte.splice(i, 1); },
    ajouterCache(l, nomCouche) { journal.push('ajouté ' + nomCouche); l.setCustomProperty('vision/cache', 'onf'); l.setCustomProperty('vision/couche', nomCouche); carte.push(l); },
  };
  return { ctx, disque, journal, carte, registre: () => JSON.parse(reglages.get(L.cleRegistre(ID))) };
}

test('enregistrement réussi : trois GeoPackage contrôlés, styles écrits avant chargement, carte et registre remplacés, fichiers de travail effacés', () => {
  const zipEntree = { zip: 'Serre.zip', couche: 'UG', chemin: 'Serre/UG.gpkg', style: 'UG' };
  const f = fauxQField({ registre: [zipEntree] });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.equal(r.message, 'Couches ONF en cache : 4 forêts, 53 parcelles, 1 point de rencontre (zone du 25/11/2026).');
  // Carte : forêts, parcelles puis points (le dernier ajouté est en tête de liste), lecture seule, noms validés.
  assert.deepEqual(f.carte.map((l) => l.proprietes['vision/couche']), ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR']);
  assert.deepEqual(f.carte.map((l) => l.nom), L.CACHE_ONF.couches.map((c) => c.nom));
  assert.ok(f.carte.every((l) => l.readOnly === true));
  assert.ok(f.carte.every((l) => /\.gpkg\|layername=(FOR_PUBL_FR|PARC_PUBL_FR|PRS_FR)$/.test(l.uri)));
  // Registre : l'entrée du zip reste, trois entrées de cache (forme R2 corrigée).
  const reg = f.registre();
  assert.deepEqual(reg[0], zipEntree);
  assert.deepEqual(reg.slice(1).map((e) => [e.cache, e.couche, e.chemin, e.objets, e.zip]),
    [['onf', 'FOR_PUBL_FR', `${H}/FOR_PUBL_FR.gpkg`, 4, undefined], ['onf', 'PARC_PUBL_FR', `${H}/PARC_PUBL_FR.gpkg`, 53, undefined], ['onf', 'PRS_FR', `${H}/PRS_FR.gpkg`, 1, undefined]]);
  assert.deepEqual(reg[1].emprise, ZONE);
  assert.equal(reg[1].date, DATE.toISOString());
  // Fichiers : GeoPackage et .qml gardés, GML et .gfs effacés ; style des forêts = style adapté.
  for (const c of ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR']) {
    assert.ok(f.disque.has(`${CACHE}/${H}/${c}.gpkg`) && f.disque.has(`${CACHE}/${H}/${c}.qml`));
    assert.ok(!f.disque.has(`${CACHE}/${H}/${c}.gml`) && !f.disque.has(`${CACHE}/${H}/${c}.gfs`));
  }
  assert.equal(f.disque.get(`${CACHE}/${H}/FOR_PUBL_FR.qml`), STYLES_ONF.FOR_PUBL_FR);
  assert.equal(L.cacheLignePanneau(reg), 'Cache ONF du 25/11/2026 : 4 forêts, 53 parcelles, 1 point de rencontre.');
  // Rien n'est écrit hors du dossier de la génération.
  for (const l of f.journal.filter((x) => /^écrit /.test(x))) assert.ok(l.startsWith(`écrit ${CACHE}/${H}/`), l);
});

test('second cache : il remplace le premier (carte, registre) et l\'ancienne génération est effacée, jamais la nouvelle', () => {
  const f = fauxQField();
  assert.equal(L.cacheEnregistrer(f.ctx).ok, true);
  const H2 = L.cacheHorodatage(new Date(DATE.getTime() + 3600000));
  f.ctx.horodatage = H2;
  f.ctx.reponses.PRS_FR = { texte: 'gml-prs-2', nbObjets: 0 };
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.match(r.message, /0 point de rencontre/);
  assert.equal(f.carte.length, 3, 'l\'ancien cache a quitté la carte');
  assert.ok(f.carte.every((l) => l.uri.includes(`/${H2}/`)));
  assert.deepEqual(f.registre().map((e) => e.chemin.split('/')[0]), [H2, H2, H2]);
  for (const c of ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR']) {
    assert.ok(!f.disque.has(`${CACHE}/${H}/${c}.gpkg`) && !f.disque.has(`${CACHE}/${H}/${c}.qml`), 'ancienne génération effacée');
    assert.ok(f.disque.has(`${CACHE}/${H2}/${c}.gpkg`), 'nouvelle génération gardée');
  }
  const i = f.journal.lastIndexOf('ancien cache retiré');
  assert.ok(i > f.journal.indexOf(`réécrit ${CACHE}/${H2}/PRS_FR.gpkg`), 'l\'ancien cache ne quitte la carte qu\'une fois les trois couches prêtes');
});

for (const [nom, panne] of [
  ['GeoPackage relu avec un objet de moins (parcelles)', { relus: 'PARC_PUBL_FR' }],
  ['écriture du GML des points refusée', { ecrire: `${CACHE}/${H}/PRS_FR.gml` }],
  ['style des parcelles non écrit', { ecrire: `${CACHE}/${H}/PARC_PUBL_FR.qml` }],
  ['type de géométrie inconnu (forêts)', { wkbGml: 'FOR_PUBL_FR' }],
  ['GML des points dans un autre système connu', { systeme: { PRS_FR: 'EPSG:4326' } }],
]) {
  test(`échec, l'ancien cache est gardé (tout ou rien) : ${nom}`, () => {
    const f = fauxQField();
    assert.equal(L.cacheEnregistrer(f.ctx).ok, true);
    const avant = JSON.stringify(f.registre());
    const carteAvant = f.carte.slice();
    const H2 = L.cacheHorodatage(new Date(DATE.getTime() + 60000));
    Object.assign(f.ctx, { horodatage: H2 });
    const g = fauxQField({ panne: JSON.parse(JSON.stringify(panne).split(H).join(H2)) });
    // Même disque, même carte, même registre : seules les pannes changent.
    Object.assign(f.ctx, { ecrireFichier: function (c, t) { return g.ctx.ecrireFichier.call(this, c, t) && f.ctx.ecrireFichierReel(c, t); } });
    f.ctx.ecrireFichierReel = (c, t) => { f.disque.set(c, t); return true; };
    const ouvrirReel = f.ctx.ouvrirCouche;
    f.ctx.ouvrirCouche = (uri, n) => {
      const l = ouvrirReel(uri, n);
      const c = L.coucheOnf(uri.split('|')[0].replace(/^.*\//, '').replace(/\.[a-z]+$/, ''));
      if (!l.isValid || !c) return l;
      if (/\.gml\|/.test(uri) && panne.wkbGml === c.couche) l.wkbType = () => 3;
      if (/\.gml\|/.test(uri) && panne.systeme && panne.systeme[c.couche]) l.crs = { authid: panne.systeme[c.couche] };
      if (/\.gpkg\|/.test(uri) && panne.relus === c.couche) l.n -= 1;
      return l;
    };
    const r = L.cacheEnregistrer(f.ctx);
    assert.equal(r.ok, false);
    assert.equal(r.message, L.TEXTES_CACHE_ONF.echecLocal);
    assert.equal(JSON.stringify(f.registre()), avant, 'registre inchangé');
    assert.deepEqual(f.carte, carteAvant, 'carte inchangée');
    for (const k of f.disque.keys()) assert.ok(!k.includes(`/${H2}/`), 'nouvelle génération effacée : ' + k);
    for (const c of ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR']) assert.ok(f.disque.has(`${CACHE}/${H}/${c}.gpkg`), 'ancienne génération gardée');
  });
}

test('système inconnu à la lecture du GML (essais n° 2 à 4 de la sonde) : EPSG:2154 imposé, le cache passe', () => {
  const f = fauxQField({ panne: { systeme: { FOR_PUBL_FR: '', PARC_PUBL_FR: '', PRS_FR: '' } } });
  const r = L.cacheEnregistrer(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.equal(f.journal.filter((x) => x === 'système imposé').length, 3);
});

test('service absent ou réponse manquante : rien n\'est écrit au registre ni à la carte', () => {
  const f = fauxQField();
  delete f.ctx.imposerSysteme;
  assert.equal(L.cacheEnregistrer(f.ctx).ok, false);
  const g = fauxQField();
  delete g.ctx.reponses.PRS_FR;
  assert.equal(L.cacheEnregistrer(g.ctx).ok, false);
  assert.deepEqual(g.registre(), []);
  assert.equal(g.carte.length, 0);
});

// ------------------------------------------------------------------------------------------- réouverture, registre
function entreesCache(h = H) {
  return L.CACHE_ONF.couches.map((c, i) => ({ cache: 'onf', couche: c.couche, chemin: `${h}/${c.couche}.gpkg`, emprise: ZONE, date: DATE.toISOString(), objets: [4, 53, 1][i] }));
}

function demarrer(registre, { fichiers, sansChargerCache = false } = {}) {
  const reglages = new Map([[L.cleRegistre(ID), JSON.stringify(registre)]]);
  const ordre = [];
  const existants = fichiers || new Set([...registre.map((e) => (e.cache ? `${CACHE}/${e.chemin}` : `${IMPORTS}/${e.chemin}`))]);
  const ctx = {
    variables: { vision_id: ID }, dossierProjet: PROJET,
    reglages: { value: (k, d) => (reglages.has(k) ? reglages.get(k) : d), setValue: (k, v) => reglages.set(k, v) },
    existe: (c) => existants.has(c),
    chargerCouche: (source, nom) => { ordre.push('zip ' + nom); return { isValid: true, readOnly: false, source }; },
  };
  if (!sansChargerCache) ctx.chargerCache = (source, nom, couche) => { ordre.push('cache ' + couche); return { isValid: true, readOnly: false, source, nom }; };
  const r = L.demarrerProjet(ctx);
  return { r, ordre, registre: () => JSON.parse(reglages.get(L.cleRegistre(ID))) };
}

test('réouverture (sans réseau) : le cache revient depuis le disque, après les couches des zips (en tête de liste), sous les noms validés', () => {
  const zip = { zip: 'Serre.zip', couche: 'UG', chemin: 'Serre/UG.gpkg', style: 'UG' };
  const { r, ordre } = demarrer(entreesCache().concat([zip]));
  assert.deepEqual(ordre, ['zip UG', 'cache FOR_PUBL_FR', 'cache PARC_PUBL_FR', 'cache PRS_FR']);
  assert.deepEqual(r.cache, { rechargees: ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR'], manquantes: [] });
  assert.equal(r.douteuses, 0);
  assert.equal(r.message, '');
});

test('réouverture : source du GeoPackage du cache, couche en lecture seule', () => {
  const vues = [];
  const reglages = new Map([[L.cleRegistre(ID), JSON.stringify(entreesCache())]]);
  L.demarrerProjet({
    variables: { vision_id: ID }, dossierProjet: PROJET, existe: () => true, chargerCouche: () => null,
    reglages: { value: (k, d) => (reglages.has(k) ? reglages.get(k) : d), setValue: (k, v) => reglages.set(k, v) },
    chargerCache: (source, nom, couche) => { const l = { isValid: true, readOnly: false, source, nom, couche }; vues.push(l); return l; },
  });
  assert.deepEqual(vues.map((l) => [l.source, l.nom, l.readOnly]), L.CACHE_ONF.couches.map((c) => [`${CACHE}/${H}/${c.couche}.gpkg|layername=${c.couche}`, c.nom, true]));
});

test('réouverture : fichier du cache absent ou illisible : dit (texte proposé), jamais en silence ; entrée gardée', () => {
  const { r, registre } = demarrer(entreesCache(), { fichiers: new Set([`${CACHE}/${H}/FOR_PUBL_FR.gpkg`, `${CACHE}/${H}/PARC_PUBL_FR.gpkg`]) });
  assert.deepEqual(r.cache.manquantes, ['PRS_FR']);
  assert.match(r.message, new RegExp(L.TEXTES_CACHE_ONF.cacheIllisible.replace(/[().]/g, '\\$&')));
  assert.equal(registre().length, 3);
});

test('réouverture : entrée de cache douteuse retirée (décision n° 5), sans chargerCache rien n\'est chargé', () => {
  const mauvaises = [
    { ...entreesCache()[0], chemin: '../FOR_PUBL_FR.gpkg' }, { ...entreesCache()[0], chemin: `${H}/PRS_FR.gpkg` },
    { ...entreesCache()[0], cache: 'ign' }, { ...entreesCache()[0], objets: 5001 }, { ...entreesCache()[0], zip: 'a.zip' },
    { ...entreesCache()[0], couche: 'DT_FR', chemin: `${H}/DT_FR.gpkg` },
  ];
  const { r, registre } = demarrer(mauvaises);
  assert.equal(r.douteuses, mauvaises.length);
  assert.deepEqual(registre(), []);
  assert.deepEqual(demarrer(entreesCache(), { sansChargerCache: true }).ordre, []);
});

test('registre : clé (sorte, zip, couche) : une couche de zip nommée FOR_PUBL_FR et le cache ne se confondent pas', () => {
  const reglages = new Map();
  const R = { value: (k, d) => (reglages.has(k) ? reglages.get(k) : d), setValue: (k, v) => reglages.set(k, v) };
  L.inscrire(R, ID, entreesCache()[0]);
  L.inscrire(R, ID, { zip: 'onf.zip', couche: 'FOR_PUBL_FR', chemin: 'onf/FOR_PUBL_FR.gpkg' });
  assert.equal(L.lireRegistre(R, ID).length, 2);
  L.retirer(R, ID, { zip: 'onf.zip', couche: 'FOR_PUBL_FR' });
  assert.deepEqual(L.lireRegistre(R, ID), [entreesCache()[0]], 'le retrait du zip laisse le cache');
  assert.deepEqual(L.entreesDesZips([entreesCache()[0], { zip: 'a.zip', couche: 'x' }]), [{ zip: 'a.zip', couche: 'x' }]);
  assert.equal(L.cacheLignePanneau(entreesCache().slice(0, 2)), '', 'cache incomplet : pas de ligne');
});

test('retrait d\'une couche d\'un zip : aucun fichier du cache n\'est effacé', () => {
  const reglages = new Map([[L.cleRegistre(ID), JSON.stringify(entreesCache().concat([{ zip: 'z.zip', couche: 'FOR_PUBL_FR', chemin: 'z/FOR_PUBL_FR.gpkg' }]))]]);
  const effaces = [];
  L.retirerCouche({ visionId: ID, dossierProjet: PROJET, zip: 'z.zip', couche: 'FOR_PUBL_FR',
    reglages: { value: (k, d) => (reglages.has(k) ? reglages.get(k) : d), setValue: (k, v) => reglages.set(k, v) },
    existe: () => true, effacerFichier: (c) => { effaces.push(c); return true; }, platformUtilities: { rmFile: () => true } });
  assert.ok(effaces.length > 0 && effaces.every((c) => !c.includes('/_cache-onf/')), effaces.join(', '));
});

test('import : un zip dont le dossier serait celui du cache (_cache-onf.zip) est refusé avant toute lecture (texte proposé)', () => {
  const r = L.importerZip({ visionId: ID, nomZip: '_cache-onf.zip', dossierProjet: PROJET, octets: new Uint8Array(0), reglages: { value: () => '', setValue: () => {} } });
  assert.equal(r.chargees.length, 0);
  assert.equal(r.message, L.messageZipReserve('_cache-onf.zip'));
  assert.ok(L.estDossierReserve(L.dossierDuZip('_cache-onf.zip')) && !L.estDossierReserve(L.dossierDuZip('ONF.zip')));
});

// ------------------------------------------------------------------------------------------- octets
test('octetsUtf8 en deux passes : même sortie que l\'UTF-8 de Node (accents, emoji), taille exacte', () => {
  for (const t of ['', 'abc', 'Forêt communale d’Offlanges', 'Ç à ô ü œ €', '🌲 sapin', 'x'.repeat(100000) + 'é']) {
    const o = L.octetsUtf8(t);
    assert.ok(o instanceof Uint8Array);
    assert.deepEqual(Buffer.from(o), Buffer.from(t, 'utf8'), t.slice(0, 20));
  }
});

// ------------------------------------------------------------------------------------------- styles adaptés
// Empreintes des trois .qml de Pascal tels que versés le 25 novembre 2026 : ils restent intacts.
const EMPREINTES = {
  'RDF_FRT.qml': '351a202aa48a598d99ce87dfba8c653e470fa5c42363f58f0370b17410926210', 'RDF_Parc.qml': 'f0aa7cd8bd81cf6d9a411d3e1429c912532379f06ba64bccae0030a49d9fc99f', 'Point_de_rencontre_des_secours_en_frt.qml': '545140cac4bfea71280cfc45d126f7d0c4a0a57dbe158207dd2ba2d7ff866538',
};
const source = (c) => lire('docs/referentiels/brut/onf/' + SOURCES_STYLES_ONF[c]);

test('styles : les .qml de Pascal sont intacts ; plugin/styles/ (bibliothèque de la 052) non touché', () => {
  for (const [f, h] of Object.entries(EMPREINTES)) {
    assert.equal(createHash('sha256').update(readFileSync(join(RACINE, 'docs/referentiels/brut/onf', f))).digest('hex'), h, f);
  }
  assert.equal(lire('plugin/styles/RDF_FRT.qml'), source('FOR_PUBL_FR'));
  assert.equal(lire('plugin/styles/RDF_Parc.qml'), source('PARC_PUBL_FR'));
});

test('styles : le module vision-styles-onf.mjs est celui que génère empaqueter.mjs, et il part dans le zip du plugin', () => {
  assert.equal(lire('plugin/vision-styles-onf.mjs'), genererStylesOnf());
  assert.ok(FICHIERS_PLUGIN.includes('vision-styles-onf.mjs'));
  assert.deepEqual(Object.keys(STYLES_ONF), ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR']);
});

function lignesChangees(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  assert.equal(x.length, y.length);
  return x.map((l, i) => [l, y[i]]).filter(([l, m]) => l !== m);
}

// Seuil de visibilité de la couche (aller-retour 1/3) : seul l'en-tête <qgis …> des parcelles et des points change en plus.
const seuil = (x) => x.replace(' hasScaleBasedVisibilityFlag="1"', ' hasScaleBasedVisibilityFlag="0"').replace(' minScale="50000"', ' minScale="100000000"');

test('styles : forêts étiquetées par iidtn_frt, parcelles par ccod_prf ; seules ces lignes et le seuil changent, symboles, couleurs et seuils d\'étiquettes gardés', () => {
  const frt = lignesChangees(source('FOR_PUBL_FR'), STYLES_ONF.FOR_PUBL_FR);
  assert.equal(frt.length, 1);
  assert.equal(frt[0][0].replace('fieldName="CCOD_FRT"', 'fieldName="iidtn_frt"'), frt[0][1]);
  const parc = lignesChangees(source('PARC_PUBL_FR'), seuil(STYLES_ONF.PARC_PUBL_FR));
  assert.equal(parc.length, 1);
  assert.equal(parc[0][0].replace('fieldName="CCOD_PRF"', 'fieldName="ccod_prf"'), parc[0][1]);
  // Seuils : étiquettes des forêts au-delà du 1:50 000, des parcelles en deçà (inchangés).
  assert.match(STYLES_ONF.FOR_PUBL_FR, /scaleMin="50000"/);
  assert.match(STYLES_ONF.PARC_PUBL_FR, /scaleMax="50000"/);
});

test('styles : formulaire des points sur les 13 champs réels (mêmes réglages), aperçu llib_prs, symboles et flèches inchangés', () => {
  const t = STYLES_ONF.PRS_FR;
  const s = source('PRS_FR');
  const champs = [...t.slice(t.indexOf('<fieldConfiguration>'), t.indexOf('</fieldConfiguration>')).matchAll(/<field name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(champs, L.coucheOnf('PRS_FR').champs);
  assert.equal((t.match(/<alias name="" index="\d+" field="/g) || []).length, 13);
  assert.match(t, /<alias name="" index="12" field="cinse_com"\/>/);
  assert.match(t, /<previewExpression>"llib_prs"<\/previewExpression>/);
  assert.match(t, /<column hidden="1" type="actions" width="-1"\/>/);
  for (const ancien of ['desc_prsf', 'code_prsf', 'nom_com', 'gid', 'gestionnaire']) assert.ok(!t.includes(`"${ancien}"`), ancien);
  const rendu = (x) => x.slice(x.indexOf('<renderer-v2'), x.indexOf('</renderer-v2>'));
  assert.equal(rendu(t), rendu(s), 'symbole (carré rouge, flèches arrows/Arrow_01.svg) inchangé');
  assert.equal(seuil(t.slice(0, t.indexOf('\n', 100))), s.slice(0, s.indexOf('\n', 100)), 'en-tête : seul le seuil de visibilité change');
  assert.match(t, /arrows\/Arrow_01\.svg/);
});

test('styles : une adaptation qui ne trouve pas son point de départ échoue (jamais un style faux en silence)', () => {
  assert.throws(() => adapterStyleOnf('FOR_PUBL_FR', '<qgis/>'), /CCOD_FRT/);
  assert.throws(() => adapterStyleOnf('PRS_FR', source('PRS_FR').replace('<field name="gid" editable="1"/>', '<field name="gid" editable="0"/>')), /réglages différents/);
  assert.throws(() => adapterStyleOnf('DT_FR', ''), /couche inconnue/);
});

// ------------------------------------------------------------------------------------------- pont QML
const qml = () => lire('plugin/Vision.qml');
function sectionCache() {
  const q = qml();
  const debut = q.indexOf('// ==== cache ONF (mission 053');
  const fin = q.indexOf('// ==== cache ONF : fin');
  assert.ok(debut >= 0 && fin > debut, 'section du cache absente de Vision.qml');
  return q.slice(debut, fin).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
}

test('sonde retirée : ni Vision.qml, ni Panneau.qml, ni la logique ne la contiennent', () => {
  for (const f of ['plugin/Vision.qml', 'plugin/Panneau.qml', 'plugin/vision-logique.mjs']) {
    assert.ok(!/sonde 053|SONDE_ONF|sonder|_sonde-053/i.test(lire(f)), f);
  }
});

test('Vision.qml : requêtes par iface.createHttpRequest, quatre coins de l\'écran, système imposé, enregistrement par la logique', () => {
  const s = sectionCache();
  for (const appel of ['iface.createHttpRequest()', 'iface.mapCanvas()', 'screenToCoordinate(Qt.point(', 'visibleExtent', 'destinationCrs',
    'GeometryUtils.reprojectPoint', 'Logique.cachePreparer', 'Logique.cacheUrlGetFeature', 'Logique.cacheJugerReponse', 'Logique.cacheEnregistrer',
    'Controles.EMPRISE_VRAISEMBLANCE', 'StylesOnf.STYLES_ONF', 'l.crs = CoordinateReferenceSystemUtils.fromDescription("EPSG:2154")',
    'ProjectUtils.addMapLayer', 'ProjectUtils.removeMapLayer', 'setCustomProperty("vision/cache", "onf")', 'cacheEnCours = false']) {
    assert.ok(s.includes(appel), `absent : ${appel}`);
  }
  assert.ok(!s.includes('deleteLater'), 'aucune libération par deleteLater (Qt 6.10.3 la cache à QML)');
  assert.match(qml(), /^import "vision-styles-onf\.mjs" as StylesOnf$/m);
});

test('Vision.qml : coucheDuProjet reconnaît le cache ; chargerCache passé à demarrerProjet ; le panneau ne liste que les zips', () => {
  const q = qml();
  assert.match(q, /function coucheDuProjet\(couche\) \{[\s\S]*?"vision\/zip"[\s\S]*?"vision\/cache"[\s\S]*?\n  \}/);
  assert.match(q, /chargerCache: id \? chargerCache :/);
  assert.match(q, /Logique\.entreesDesZips\(Logique\.lireRegistre\(reglages, id\)\)/);
  // coucheMarquee et retirerLeZipDeLaCarte ne connaissent que vision/zip : elles ne touchent pas au cache.
  const marquee = q.slice(q.indexOf('function coucheMarquee'), q.indexOf('function chargeur'));
  assert.ok(!marquee.includes('vision/cache'));
});

test('panneau : bouton du cache (texte validé, « pendant » quand il travaille), ligne « Cache ONF du … »', () => {
  const p = lire('plugin/Panneau.qml');
  assert.match(p, /onClicked: panneau\.vision\.mettreEnCacheOnf\(\)/);
  assert.match(p, /panneau\.vision\.cacheEnCours \? panneau\.vision\.textePendantCache : panneau\.vision\.texteBoutonCache/);
  assert.match(p, /ligneCache = vision \? vision\.cacheLigne\(\) : ""/);
  assert.match(qml(), /readonly property string texteBoutonCache: Logique\.TEXTES_CACHE_ONF\.bouton/);
});

test('pièce : protocole d\'essai Samsung du cache (§ 11) : forêt de JFC, mode avion, réouverture, zone trop grande, coupure, second cache', () => {
  const doc = lire('docs/referentiels/cache-zone-qfield.md');
  const s = doc.slice(doc.indexOf('## 11.'));
  assert.ok(doc.includes('## 11.'), '§ 11 absent');
  for (const mot of ['massif de la Serre', 'mode avion', 'réouverture', 'Zone trop grande', 'coupure', 'second cache', L.TEXTES_CACHE_ONF.bouton,
    L.TEXTES_CACHE_ONF.pasDeReseau]) {
    assert.ok(s.includes(mot), `§ 11 ne cite pas : ${mot}`);
  }
});
