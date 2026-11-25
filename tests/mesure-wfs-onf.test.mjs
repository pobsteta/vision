// Mission 053, étape 1 : tests de la logique pure de outils/mesure-wfs-onf.mjs (hors réseau).
// Fixtures : le GetCapabilities et les trois .qml sont les pièces RÉELLES de Pascal
// (docs/referentiels/brut/onf/). Les DescribeFeatureType et sorties ogrinfo ci-dessous sont
// SYNTHÉTIQUES (forme MapServer 7 / GDAL), écrits pour tester l'analyse : ils ne disent rien des
// champs réels du service, que seule la mesure dans GitHub Actions donnera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COUCHES, analyserCapabilities, analyserDescribeFeatureType, champsDuStyle,
  comparerChampsStyle, hitsDepuisReponse, statutComptage, resumerOgrinfo, rapportMarkdown,
  argsOgr2ogr, urlGetFeatureHits, estException, versionAnnoncee, urlsCapabilities,
  uuidMetadonnee, urlsMetadonnees, TAILLE_PAGE,
} from '../outils/mesure-wfs-onf.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const ONF = join(racine, 'docs', 'referentiels', 'brut', 'onf');
const lire = (f) => readFileSync(join(ONF, f), 'utf8');
const CAPS = lire('onf-forets-getcapabilities-2026-11-25.xml');

const DESCRIBE = `<?xml version='1.0' encoding="UTF-8" ?>
<schema targetNamespace="http://mapserver.gis.umn.edu/mapserver" xmlns:ms="http://mapserver.gis.umn.edu/mapserver"
  xmlns:ogc="http://www.opengis.net/ogc" xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns="http://www.w3.org/2001/XMLSchema" xmlns:gml="http://www.opengis.net/gml" elementFormDefault="qualified" version="0.1">
  <import namespace="http://www.opengis.net/gml" schemaLocation="http://schemas.opengis.net/gml/2.1.2/feature.xsd" />
  <element name="FOR_PUBL_FR" type="ms:FOR_PUBL_FRType" substitutionGroup="gml:_Feature" />
  <complexType name="FOR_PUBL_FRType">
    <complexContent>
      <extension base="gml:AbstractFeatureType">
        <sequence>
          <element name="msGeometry" type="gml:GeometryPropertyType" minOccurs="0" maxOccurs="1"/>
          <element name="CCOD_FRT" type="string"/>
          <element name="LLIB_FRT" minOccurs="0" type="string"/>
          <element name="SURF_HA" type="decimal"/>
          <element name="NB" type="long"/>
        </sequence>
      </extension>
    </complexContent>
  </complexType>
</schema>`;

test('couches : les trois couches retenues, avec leur style', () => {
  assert.deepEqual(COUCHES.map((c) => c.nom), ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR']);
  assert.deepEqual(COUCHES.map((c) => c.qml),
    ['RDF_FRT.qml', 'RDF_Parc.qml', 'Point_de_rencontre_des_secours_en_frt.qml']);
});

test('GetCapabilities réel : six couches, EPSG:2154, trois MetadataURL, service en http', () => {
  const c = analyserCapabilities(CAPS);
  assert.equal(c.couches.length, 6);
  assert.deepEqual(c.couches.map((x) => x.nom), ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'DT_FR', 'ATE_FR', 'RB_FR', 'PRS_FR']);
  assert.ok(c.couches.every((x) => x.srs === 'EPSG:2154'));
  const f = c.couches.find((x) => x.nom === 'FOR_PUBL_FR');
  assert.equal(f.titre, 'Forêts publiques');
  assert.equal(f.metadataUrl, 'http://metadata.carmencarto.fr/geonetwork/105/catalog.search#/metadata/fr-662043116-7D3DC709-E1EB-470B-9FD0-8ABF8AAFD8E4');
  assert.equal(c.couches.find((x) => x.nom === 'PRS_FR').metadataUrl.endsWith('F93F1825-68A2-4AE7-8C65-F789D26D9665'), true);
  assert.equal(c.service.titre, "Données publiques de l'ONF en Métropole");
  assert.equal(c.service.fees, "Aucune condition ne s'applique");
  assert.equal(c.service.url, 'http://ws.carmencarto.fr/WFS/105/ONF_Forets?');
});

test('GetCapabilities réel : chaque couche retenue y figure', () => {
  const noms = analyserCapabilities(CAPS).couches.map((x) => x.nom);
  for (const c of COUCHES) assert.ok(noms.includes(c.nom), c.nom);
});

test('DescribeFeatureType : champs, types, obligatoire, géométrie à part', () => {
  const d = analyserDescribeFeatureType(DESCRIBE);
  assert.equal(d.nom, 'FOR_PUBL_FR');
  assert.deepEqual(d.geometrie, { nom: 'msGeometry', type: 'gml:GeometryPropertyType' });
  assert.deepEqual(d.champs.map((c) => c.nom), ['CCOD_FRT', 'LLIB_FRT', 'SURF_HA', 'NB']);
  assert.deepEqual(d.champs.map((c) => c.type), ['string', 'string', 'decimal', 'long']);
  assert.equal(d.champs[0].obligatoire, true);
  assert.equal(d.champs[1].obligatoire, false);
});

test('DescribeFeatureType : une exception de service ou un texte vide ne donne pas de champs inventés', () => {
  assert.deepEqual(analyserDescribeFeatureType('<ServiceExceptionReport><ServiceException>x</ServiceException></ServiceExceptionReport>').champs, []);
  assert.deepEqual(analyserDescribeFeatureType('').champs, []);
});

test('styles réels : étiquette CCOD_FRT (forêts) et CCOD_PRF (parcelles)', () => {
  assert.deepEqual(champsDuStyle(lire('RDF_FRT.qml')).etiquettes, ['CCOD_FRT']);
  assert.deepEqual(champsDuStyle(lire('RDF_Parc.qml')).etiquettes, ['CCOD_PRF']);
});

test('style réel des points de secours : les 15 champs listés', () => {
  const s = champsDuStyle(lire('Point_de_rencontre_des_secours_en_frt.qml'));
  assert.deepEqual([...s.configures].sort(), [
    'accessible', 'code_dep', 'code_prsf', 'coord_dfci', 'desc_prsf', 'gestionnaire', 'gid',
    'insee_com', 'lat', 'nom_com', 'panneau', 'reseau_tel', 'risque_tel', 'stationnement', 'lon',
  ].sort());
});

test('comparaison : tout présent', () => {
  const r = comparerChampsStyle(['CCOD_FRT', 'X'], { obligatoires: ['CCOD_FRT'], informatifs: [] });
  assert.deepEqual(r, { ok: true, manquants: [], informatifsManquants: [], casse: [] });
});

test('comparaison : un champ manquant fait échouer, un informatif manquant non', () => {
  const r = comparerChampsStyle(['A'], { obligatoires: ['A', 'B'], informatifs: ['C'] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.manquants, ['B']);
  assert.deepEqual(r.informatifsManquants, ['C']);
});

test('comparaison : la casse compte (QGIS la respecte), l\'écart de casse est signalé', () => {
  const r = comparerChampsStyle(['ccod_frt'], { obligatoires: ['CCOD_FRT'], informatifs: [] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.manquants, ['CCOD_FRT']);
  assert.deepEqual(r.casse, [{ style: 'CCOD_FRT', couche: 'ccod_frt' }]);
});

test('hits : numberOfFeatures (WFS 1.0.0) et numberMatched (WFS 2.0), sinon null', () => {
  assert.equal(hitsDepuisReponse('<wfs:FeatureCollection numberOfFeatures="1234" xmlns:wfs="x"/>'), 1234);
  assert.equal(hitsDepuisReponse('<wfs:FeatureCollection numberMatched="56" numberReturned="0"/>'), 56);
  assert.equal(hitsDepuisReponse('<ServiceExceptionReport/>'), null);
  assert.equal(hitsDepuisReponse(''), null);
});

test('comptage : complet, tronqué (limite ronde), inconnu', () => {
  assert.equal(statutComptage(100, 100).statut, 'complet');
  assert.equal(statutComptage(100, 90).statut, 'tronque');
  assert.equal(statutComptage(null, 1000).statut, 'inconnu');
  assert.match(statutComptage(null, 1000).message, /troncature/i);
  assert.match(statutComptage(null, 1234).message, /troncature/i);
  assert.equal(statutComptage(null, 1234).statut, 'inconnu');
  assert.equal(statutComptage(100, null).statut, 'inconnu');
});

const OGRINFO = {
  layers: [{
    name: 'FOR_PUBL_FR', featureCount: 1500,
    geometryFields: [{
      name: 'msGeometry', type: 'MultiPolygon', extent: [100000, 6100000, 1000000, 7000000],
      coordinateSystem: { wkt: 'PROJCRS["RGF93 v1 / Lambert-93"]', projjson: { id: { authority: 'EPSG', code: 2154 } } },
    }],
    fields: [{ name: 'CCOD_FRT', type: 'String' }, { name: 'NB', type: 'Integer64' }],
  }],
};

test('ogrinfo -json : nombre, emprise, système, champs', () => {
  const r = resumerOgrinfo(OGRINFO);
  assert.equal(r.nombre, 1500);
  assert.deepEqual(r.emprise, [100000, 6100000, 1000000, 7000000]);
  assert.equal(r.systeme, 'EPSG:2154');
  assert.equal(r.geometrie, 'MultiPolygon');
  assert.deepEqual(r.champs, [{ nom: 'CCOD_FRT', type: 'String' }, { nom: 'NB', type: 'Integer64' }]);
});

test('ogrinfo -json : sans système ni emprise, on le dit (null) au lieu d\'inventer', () => {
  const r = resumerOgrinfo({ layers: [{ name: 'X', featureCount: 3, geometryFields: [], fields: [] }] });
  assert.equal(r.nombre, 3);
  assert.equal(r.emprise, null);
  assert.equal(r.systeme, null);
  assert.deepEqual(resumerOgrinfo({}).champs, []);
});

test('URL hits : comptage en WFS 1.1.0 (MapServer 7 n\'écrit numberOfFeatures qu\'en 1.1.0), couche encodée', () => {
  const u = urlGetFeatureHits('http://h/x?', 'PRS_FR');
  assert.match(u, /^http:\/\/h\/x\?/);
  assert.match(u, /SERVICE=WFS/);
  assert.match(u, /VERSION=1\.1\.0/);
  assert.match(u, /REQUEST=GetFeature/);
  assert.match(u, /TYPENAME=PRS_FR/);
  assert.match(u, /RESULTTYPE=hits/);
  assert.match(urlGetFeatureHits('http://h/x?', 'PRS_FR', '2.0.0'), /VERSION=2\.0\.0/);
});

test('hits : formes produites par MapServer 7 (1.1.0 et 2.0.0)', () => {
  const v110 = '<?xml version="1.0"?>\n<wfs:FeatureCollection xmlns:ms="http://mapserver.gis.umn.edu/mapserver" xmlns:wfs="http://www.opengis.net/wfs" numberOfFeatures="4321" timeStamp="2026-11-25T10:00:00"/>';
  const v200 = '<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" timeStamp="x" numberMatched="987" numberReturned="0"/>';
  assert.equal(hitsDepuisReponse(v110), 4321);
  assert.equal(hitsDepuisReponse(v200), 987);
  assert.equal(hitsDepuisReponse('<wfs:FeatureCollection numberMatched="unknown" numberReturned="0"/>'), null);
});

test('exception de service renvoyée en HTTP 200 : reconnue', () => {
  assert.equal(estException('<?xml version="1.0"?><ServiceExceptionReport version="1.2.0"><ServiceException code="x">msg</ServiceException></ServiceExceptionReport>'), true);
  assert.equal(estException('<ows:ExceptionReport xmlns:ows="x"><ows:Exception exceptionCode="y"/></ows:ExceptionReport>'), true);
  assert.equal(estException('<WFS_Capabilities version="1.0.0"/>'), false);
  assert.equal(estException(CAPS), false);
  assert.equal(estException(null), false);
});

test('version annoncée par une réponse GetCapabilities (WFS_Capabilities ou ows)', () => {
  assert.deepEqual(versionAnnoncee(CAPS), { version: '1.0.0', exception: false });
  assert.deepEqual(versionAnnoncee('<wfs:WFS_Capabilities version="2.0.0" xmlns:wfs="x"/>'), { version: '2.0.0', exception: false });
  assert.deepEqual(versionAnnoncee('<ServiceExceptionReport><ServiceException/></ServiceExceptionReport>'), { version: null, exception: true });
  assert.deepEqual(versionAnnoncee(null), { version: null, exception: false });
});

test('GetCapabilities : sans VERSION, 1.0.0, 1.1.0, 2.0.0', () => {
  const u = urlsCapabilities('http://h/x?');
  assert.deepEqual(u.map((x) => x.demandee), [null, '1.0.0', '1.1.0', '2.0.0']);
  assert.ok(!/VERSION=/.test(u[0].url));
  assert.match(u[0].url, /REQUEST=GetCapabilities/);
  assert.match(u[3].url, /VERSION=2\.0\.0/);
});

test('fiche de métadonnées : l\'uuid du fragment #/metadata/<uuid>, que fetch coupe', () => {
  const m = 'http://metadata.carmencarto.fr/geonetwork/105/catalog.search#/metadata/fr-662043116-F93F1825-68A2-4AE7-8C65-F789D26D9665';
  assert.equal(uuidMetadonnee(m), 'fr-662043116-F93F1825-68A2-4AE7-8C65-F789D26D9665');
  assert.equal(uuidMetadonnee('http://x/y'), null);
  const u = urlsMetadonnees(m);
  assert.ok(u.length >= 2);
  assert.ok(u.every((x) => x.url.includes('fr-662043116-F93F1825-68A2-4AE7-8C65-F789D26D9665')));
  assert.ok(u.every((x) => x.url.startsWith('http://metadata.carmencarto.fr/geonetwork/')));
  assert.deepEqual(urlsMetadonnees('http://x/y'), []);
});

test('ogr2ogr : GeoPackage, WFS 1.0.0 dans l\'URL (pas d\'option -oo VERSION), une couche, système tel que servi', () => {
  const a = argsOgr2ogr('http://h/x?', 'PRS_FR', '/s/PRS_FR.gpkg');
  assert.deepEqual(a.slice(0, 2), ['-f', 'GPKG']);
  assert.ok(a.includes('/s/PRS_FR.gpkg'));
  assert.ok(a.includes('WFS:http://h/x?VERSION=1.0.0'));
  assert.ok(a.includes('PRS_FR'));
  assert.ok(!a.includes('-oo'), 'le pilote WFS ignore -oo VERSION');
  assert.ok(!a.some((x) => /^VERSION=/.test(x)));
  assert.ok(!a.includes('-t_srs') && !a.includes('-a_srs'), 'on mesure le système tel que servi');
});

test('ogr2ogr : pas de gml_id exposé (MapServer n\'en écrit pas ; il serait NOT NULL dans le GeoPackage)', () => {
  const a = argsOgr2ogr('http://h/x?', 'PRS_FR', '/s/x.gpkg');
  const i = a.indexOf('GML_EXPOSE_GML_ID');
  assert.ok(i > 0 && a[i - 1] === '--config' && a[i + 1] === 'NO');
});

test('ogr2ogr : pagination STARTINDEX/MAXFEATURES demandée à GDAL', () => {
  assert.equal(TAILLE_PAGE, 5000);
  const a = argsOgr2ogr('http://h/x?', 'PRS_FR', '/s/PRS_FR.gpkg');
  const i = a.indexOf('OGR_WFS_PAGING_ALLOWED');
  assert.ok(i > 0 && a[i - 1] === '--config' && a[i + 1] === 'ON');
  const j = a.indexOf('OGR_WFS_PAGE_SIZE');
  assert.ok(j > 0 && a[j - 1] === '--config' && a[j + 1] === String(TAILLE_PAGE));
});

test('rapport Markdown : ce qui manque est écrit en clair, pas masqué', () => {
  const rapport = {
    date: '2026-11-25T10:00:00Z', service: 'http://h/x?',
    capabilities: { titre: 'T', fees: 'F' },
    versionsServies: [{ demandee: null, annoncee: '1.0.0', exception: false, http: 200 }, { demandee: '2.0.0', annoncee: null, exception: true, http: 200 }],
    couches: [{
      nom: 'FOR_PUBL_FR', titre: 'Forêts publiques', metadataUrl: 'http://m',
      hits: null, comptage: { statut: 'inconnu', message: 'risque de troncature' },
      nombre: 1500, poidsOctets: 5 * 1024 * 1024, dureeSecondes: 12.3,
      emprise: [1, 2, 3, 4], systeme: 'EPSG:2154', geometrie: 'MultiPolygon',
      champs: [{ nom: 'NB', type: 'Integer64' }],
      style: { qml: 'RDF_FRT.qml', ok: false, manquants: ['CCOD_FRT'], informatifsManquants: ['Z'], casse: [] },
      erreurs: ['téléchargement : échec'],
    }],
  };
  const md = rapportMarkdown(rapport);
  assert.match(md, /FOR_PUBL_FR/);
  assert.match(md, /1500/);
  assert.match(md, /5,0 Mo|5\.0 Mo|5,00 Mo/);
  assert.match(md, /EPSG:2154/);
  assert.match(md, /CCOD_FRT/);
  assert.match(md, /MANQUE/i);
  assert.match(md, /risque de troncature/);
  assert.match(md, /téléchargement : échec/);
  assert.match(md, /NB/);
  assert.match(md, /Versions WFS/);
  assert.match(md, /2\.0\.0.*exception/i);
});
