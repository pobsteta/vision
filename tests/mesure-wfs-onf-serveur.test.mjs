// Mission 053, étape 1 : `mesurer()` de bout en bout contre un FAUX serveur WFS local (http, 127.0.0.1),
// avec le vrai ogr2ogr de GDAL (test sauté s'il est absent). Le faux serveur imite la forme de MapServer 7 :
// numberOfFeatures seulement en 1.1.0, STARTINDEX/MAXFEATURES en 1.0.0, exception en HTTP 200 pour la version 2.0.0.
// Il ne prouve rien du service réel de l'ONF, seulement que la chaîne de l'outil tient.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mesurer, TAILLE_PAGE } from '../outils/mesure-wfs-onf.mjs';

const gdal = spawnSync('ogr2ogr', ['--version']).status === 0 && spawnSync('ogrinfo', ['--version']).status === 0;
const ONF = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'referentiels', 'brut', 'onf');
const CAPS = readFileSync(join(ONF, 'onf-forets-getcapabilities-2026-11-25.xml'), 'utf8');

// Champs : ceux que les styles lisent, sauf CCOD_PRF absent de PARC_PUBL_FR (pour vérifier que l'écart est détecté).
const SCHEMAS = {
  FOR_PUBL_FR: ['CCOD_FRT'],
  PARC_PUBL_FR: ['AUTRE'],
  PRS_FR: ['accessible', 'code_dep', 'code_prsf', 'coord_dfci', 'desc_prsf', 'gestionnaire', 'gid', 'insee_com', 'lat', 'lon', 'nom_com', 'panneau', 'reseau_tel', 'risque_tel', 'stationnement'],
};
const N = 7;

const xsd = (nom) => `<?xml version='1.0' encoding="UTF-8" ?>
<schema targetNamespace="http://mapserver.gis.umn.edu/mapserver" xmlns:ms="http://mapserver.gis.umn.edu/mapserver" xmlns:gml="http://www.opengis.net/gml" xmlns="http://www.w3.org/2001/XMLSchema" elementFormDefault="qualified" version="0.1">
<import namespace="http://www.opengis.net/gml" schemaLocation="http://schemas.opengis.net/gml/2.1.2/feature.xsd" />
<element name="${nom}" type="ms:${nom}Type" substitutionGroup="gml:_Feature" />
<complexType name="${nom}Type"><complexContent><extension base="gml:AbstractFeatureType"><sequence>
<element name="msGeometry" type="gml:GeometryPropertyType" minOccurs="0" maxOccurs="1"/>
${SCHEMAS[nom].map((c) => `<element name="${c}" type="string"/>`).join('\n')}
</sequence></extension></complexContent></complexType></schema>`;

function gml(nom, debut, max) {
  const fin = Math.min(N, debut + max);
  let membres = '';
  for (let i = debut; i < fin; i++) {
    const champs = SCHEMAS[nom].map((c) => `<ms:${c}>v${i}</ms:${c}>`).join('');
    membres += `<gml:featureMember><ms:${nom}><gml:boundedBy><gml:Box srsName="EPSG:2154"><gml:coordinates>700000,6600000 700100,6600100</gml:coordinates></gml:Box></gml:boundedBy><ms:msGeometry><gml:Point srsName="EPSG:2154"><gml:coordinates>${700000 + i},6600000</gml:coordinates></gml:Point></ms:msGeometry>${champs}</ms:${nom}></gml:featureMember>`;
  }
  return `<?xml version='1.0' encoding="UTF-8" ?>
<wfs:FeatureCollection xmlns:ms="http://mapserver.gis.umn.edu/mapserver" xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://mapserver.gis.umn.edu/mapserver http://HOST/x?SERVICE=WFS&amp;VERSION=1.0.0&amp;REQUEST=DescribeFeatureType&amp;TYPENAME=${nom} http://www.opengis.net/wfs http://schemas.opengis.net/wfs/1.0.0/WFS-basic.xsd"><gml:boundedBy><gml:null>missing</gml:null></gml:boundedBy>${membres}</wfs:FeatureCollection>`;
}

function demarrer(requetes) {
  return new Promise((ok) => {
    const srv = createServer((req, rep) => {
      const u = new URL(req.url, 'http://x');
      const q = new Map([...u.searchParams].map(([k, v]) => [k.toUpperCase(), v]));
      requetes.push(req.url);
      const dire = (corps, type = 'text/xml') => { rep.writeHead(200, { 'Content-Type': type }); rep.end(corps); };
      const req_ = q.get('REQUEST');
      if (u.pathname !== '/WFS/105/ONF_Forets') { rep.writeHead(404); return rep.end('non'); }
      if (req_ === 'GetCapabilities') {
        if (q.get('VERSION') === '2.0.0') return dire('<?xml version="1.0"?><ServiceExceptionReport version="1.2.0"><ServiceException code="InvalidParameterValue">version</ServiceException></ServiceExceptionReport>');
        return dire(CAPS.replace(/http:\/\/ws\.carmencarto\.fr/g, `http://127.0.0.1:${srv.address().port}`));
      }
      const nom = (q.get('TYPENAME') || '').split(',')[0];
      if (req_ === 'DescribeFeatureType' && SCHEMAS[nom]) return dire(xsd(nom));
      if (req_ === 'GetFeature' && SCHEMAS[nom]) {
        if (q.get('RESULTTYPE') === 'hits') {
          return dire(q.get('VERSION') === '1.1.0'
            ? `<?xml version="1.0"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" numberOfFeatures="${N}" timeStamp="2026-11-25T10:00:00"/>`
            : '<?xml version="1.0"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs"/>');
        }
        return dire(gml(nom, Number(q.get('STARTINDEX') || 0), Number(q.get('MAXFEATURES') || 1000)));
      }
      rep.writeHead(404); rep.end('non');
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

test('mesurer() contre un faux serveur MapServer : versions, comptage, champs, écart de style', { skip: !gdal && 'GDAL absent' }, async () => {
  const requetes = [];
  const srv = await demarrer(requetes);
  const sortie = mkdtempSync(join(tmpdir(), 'mesure-onf-'));
  try {
    const base = `http://127.0.0.1:${srv.address().port}/WFS/105/ONF_Forets?`;
    const r = await mesurer(sortie, base);

    // Versions : sans version, 1.0.0, 1.1.0 annoncées ; 2.0.0 refusée par une exception en HTTP 200.
    assert.deepEqual(r.versionsServies.map((v) => [v.demandee, v.annoncee, v.exception]),
      [[null, '1.0.0', false], ['1.0.0', '1.0.0', false], ['1.1.0', '1.0.0', false], ['2.0.0', null, true]]);
    for (const f of ['getcapabilities-sans-version.xml', 'getcapabilities-1.1.0.xml', 'getcapabilities-2.0.0.xml', 'rapport.md', 'rapport.json']) {
      assert.ok(existsSync(join(sortie, f)), f);
    }
    // Comptage en 1.1.0 : le nombre annoncé est lu et égal au nombre reçu.
    for (const c of r.couches) {
      assert.equal(c.hits, N, c.nom);
      assert.equal(c.nombre, N, c.nom);
      assert.equal(c.comptage.statut, 'complet', c.nom);
      assert.ok(c.poidsOctets > 0 && existsSync(join(sortie, `${c.nom}.gpkg`)));
      assert.equal(c.systeme, 'EPSG:2154', c.nom);
    }
    // Téléchargement en 1.0.0 paginé (STARTINDEX et MAXFEATURES), jamais en 2.0.0.
    const gf = requetes.filter((u) => /REQUEST=GetFeature/i.test(u) && !/RESULTTYPE=hits/i.test(u));
    assert.ok(gf.length >= 3 && gf.every((u) => /VERSION=1\.0\.0/.test(u)), gf.join('\n'));
    assert.ok(gf.every((u) => new RegExp(`MAXFEATURES=${TAILLE_PAGE}`).test(u) && /STARTINDEX=\d+/.test(u)), 'pagination demandée');
    assert.ok(gf.some((u) => /STARTINDEX=0/.test(u)));
    // Style : CCOD_FRT présent, CCOD_PRF absent de PARC_PUBL_FR -> écart détecté ; les 15 champs de PRS_FR présents.
    const par = Object.fromEntries(r.couches.map((c) => [c.nom, c]));
    assert.equal(par.FOR_PUBL_FR.style.ok, true);
    assert.equal(par.PARC_PUBL_FR.style.ok, false);
    assert.deepEqual(par.PARC_PUBL_FR.style.manquants, ['CCOD_PRF']);
    assert.equal(par.PRS_FR.style.ok, true);
    // Pas de gml:id chez MapServer (fid non déclaré) : sans GML_EXPOSE_GML_ID=NO, GDAL ajoute un gml_id NOT NULL
    // et l'écriture de tous les objets échoue. Les champs lus sont donc ceux du service seuls.
    assert.ok(!par.FOR_PUBL_FR.champs.some((f) => f.nom === 'gml_id'));
    assert.deepEqual(par.FOR_PUBL_FR.champs.map((f) => f.nom), ['CCOD_FRT']);
    // Fiches : essais enregistrés (le faux serveur répond 404 : ce n'est pas une erreur de mesure).
    assert.ok(par.FOR_PUBL_FR.metadonnees.length >= 2);
    assert.ok(par.FOR_PUBL_FR.metadonnees.every((m) => m.url.includes('127.0.0.1') || m.url.includes('metadata.carmencarto.fr')));
    assert.match(readFileSync(join(sortie, 'rapport.md'), 'utf8'), /Versions WFS/);
  } finally { srv.close(); }
});

test('mesurer() : une exception MapServer en HTTP 200 compte comme erreur', { skip: !gdal && 'GDAL absent' }, async () => {
  const srv = createServer((req, rep) => {
    rep.writeHead(200, { 'Content-Type': 'text/xml' });
    rep.end('<?xml version="1.0"?><ServiceExceptionReport version="1.2.0"><ServiceException code="x">KO</ServiceException></ServiceExceptionReport>');
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const sortie = mkdtempSync(join(tmpdir(), 'mesure-onf-'));
  try {
    const r = await mesurer(sortie, `http://127.0.0.1:${srv.address().port}/x?`);
    assert.ok(r.erreursGlobales.some((e) => /exception de service/.test(e)), JSON.stringify(r.erreursGlobales));
    for (const c of r.couches) {
      assert.ok(c.erreurs.some((e) => /DescribeFeatureType : exception de service/.test(e)), c.nom);
      assert.ok(c.erreurs.some((e) => /hits/.test(e) && /exception/.test(e)), c.nom);
    }
  } finally { srv.close(); }
});
