// Mission 053, étape 2 : groupe « ONF » du projet modèle (trois couches WFS en ligne).
// Sources : fiche 053 (arbitrages n° 2 à 4 ; noms tranchés par Pascal le 25 novembre 2026 : mêmes noms que le cache) ;
// mesure n° 1 (docs/referentiels/brut/onf/mesure-2026-11-25.md) ; cache-zone-qfield.md § 1.2 ; QGIS 3a92eb3 src/providers/wfs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { ecrireQgs, ecrireQgz } from '../outils/projet-modele.mjs';
import { STYLES_ONF } from '../plugin/vision-styles-onf.mjs';
import { genererStylesOnf } from '../plugin/empaqueter.mjs';
import { CACHE_ONF } from '../plugin/vision-logique.mjs';

const QGS = ecrireQgs();
const dexml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const NOMS = { FOR_PUBL_FR: 'Forêts publiques (© ONF)', PARC_PUBL_FR: 'Parcelles forestières (© ONF)', PRS_FR: 'Points de secours (© ONF)' };
const couche = (nom, qgs = QGS) => qgs.match(new RegExp(`<maplayer [^>]*>(?:(?!</maplayer>)[\\s\\S])*?<layername>${nom.replace(/[()]/g, '\\$&')}</layername>[\\s\\S]*?</maplayer>`))[0];
const entete = (b) => b.match(/^<maplayer ([^>]*)>|^\s*<maplayer ([^>]*)>/)[1] ?? '';
const attr = (t, n) => (new RegExp(` ?${n}="([^"]*)"`).exec(t) || [])[1];

test('arbre : groupe « ONF » coché et déplié, entre « Saisie terrain » et « Fonds de carte »', () => {
  const arbre = QGS.match(/<layer-tree-group>([\s\S]*?)<\/layer-tree-group>\s*<snapping/)[1];
  const ordre = [...arbre.matchAll(/<layer-tree-(?:group name="([^"]*)"|layer id="[^"]*" name="([^"]*)")/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(ordre.slice(0, 5), ['Saisie terrain', 'ONF', 'Points de secours (© ONF)', 'Parcelles forestières (© ONF)', 'Forêts publiques (© ONF)']);
  assert.equal(ordre[5], 'Fonds de carte');
  const g = arbre.match(/<layer-tree-group name="ONF" ([^>]*)>([\s\S]*?)<\/layer-tree-group>/);
  assert.match(g[1], /checked="Qt::Checked"/);
  assert.match(g[1], /expanded="1"/);
  const feuilles = [...g[2].matchAll(/<layer-tree-layer [^>]*providerKey="([^"]*)"[^>]*checked="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(feuilles, [['WFS', 'Qt::Checked'], ['WFS', 'Qt::Checked'], ['WFS', 'Qt::Checked']]); // arbitrage n° 2 : toutes cochées
});

test('noms exacts : ceux du cache du plugin, sans « en ligne » (Pascal, 25 novembre 2026)', () => {
  for (const c of CACHE_ONF.couches) {
    assert.equal(NOMS[c.couche], c.nom, c.couche);
    const b = couche(c.nom);
    assert.equal(b.match(/<layername>([^<]*)<\/layername>/)[1], c.nom);
    assert.equal(b.match(/<title>([^<]*)<\/title>/)[1], c.nom);
  }
  assert.doesNotMatch(QGS, /en ligne/);
});

test('sources WFS exactes : service, typename, 1.0.0, EPSG:2154, restrictToRequestBBOX=1, aucune clé', () => {
  for (const [code, nom] of Object.entries(NOMS)) {
    const b = couche(nom);
    assert.equal(dexml(b.match(/<datasource>([^<]*)<\/datasource>/)[1]),
      `restrictToRequestBBOX='1' srsname='EPSG:2154' typename='${code}' url='http://ws.carmencarto.fr/WFS/105/ONF_Forets' version='1.0.0'`, code);
    assert.equal(b.match(/<provider[^>]*>([^<]*)<\/provider>/)[1], 'WFS');
    assert.equal(attr(b.match(/<maplayer [^>]*>/)[0], 'type'), 'vector');
  }
  assert.equal(CACHE_ONF.service, 'http://ws.carmencarto.fr/WFS/105/ONF_Forets');
  assert.doesNotMatch(QGS.match(/<layer-tree-group name="ONF"[\s\S]*?<\/layer-tree-group>/)[0], /[?&' ;](apikey|api_key|key|token|password|username|authcfg)=/i);
});

test('la source de la feuille d\'arbre est celle de la couche', () => {
  for (const nom of Object.values(NOMS)) {
    const src = couche(nom).match(/<datasource>([^<]*)<\/datasource>/)[1];
    assert.ok(QGS.includes(`name="${nom}" source="${src}" providerKey="WFS"`), nom);
  }
});

test('lecture seule, attribution « © ONF » (rights et attribution)', () => {
  for (const nom of Object.values(NOMS)) {
    const b = couche(nom);
    assert.equal(attr(b.match(/<maplayer [^>]*>/)[0], 'readOnly'), '1', nom);
    assert.equal(b.match(/<rights>([^<]*)<\/rights>/)[1], '© ONF');
    assert.equal(b.match(/<attribution>([^<]*)<\/attribution>/)[1], '© ONF');
  }
});

test('seuils : forêts WFS visibles en deçà du 1:250 000 (Pascal, 25 novembre 2026), parcelles et points en deçà du 1:50 000 ; style du cache inchangé', () => {
  const t = (nom) => { const e = couche(nom).match(/<maplayer [^>]*>/)[0]; return [attr(e, 'hasScaleBasedVisibilityFlag'), attr(e, 'minScale'), attr(e, 'maxScale')]; };
  assert.deepEqual(t(NOMS.FOR_PUBL_FR), ['1', '250000', '0']);
  // le seuil vient du projet, non du style : le style adapté du plugin (cache) garde les forêts toujours visibles
  assert.match(STYLES_ONF.FOR_PUBL_FR.match(/<qgis [^>]*>/)[0], /hasScaleBasedVisibilityFlag="0"/);
  assert.match(STYLES_ONF.FOR_PUBL_FR.match(/<qgis [^>]*>/)[0], /minScale="100000000"/);
  assert.deepEqual(t(NOMS.PARC_PUBL_FR), ['1', '50000', '0']);
  assert.deepEqual(t(NOMS.PRS_FR), ['1', '50000', '0']);
});

test('styles : ceux du plugin, octet pour octet (corps du .qml adapté), étiquettes et champs réels', () => {
  assert.equal(genererStylesOnf().includes(JSON.stringify(STYLES_ONF.FOR_PUBL_FR)), true, 'le module du plugin est à jour');
  for (const [code, nom] of Object.entries(NOMS)) {
    const corps = STYLES_ONF[code].match(/<qgis [^>]*>\s*([\s\S]*?)\s*<\/qgis>/)[1];
    assert.ok(couche(nom).includes(corps), `${code} : corps du style absent de la couche`);
  }
  assert.match(couche(NOMS.FOR_PUBL_FR), /fieldName="iidtn_frt"/);
  assert.doesNotMatch(couche(NOMS.FOR_PUBL_FR), /fieldName="CCOD_FRT"/);
  assert.match(couche(NOMS.PARC_PUBL_FR), /fieldName="ccod_prf"/);
  assert.doesNotMatch(couche(NOMS.PARC_PUBL_FR), /fieldName="CCOD_PRF"/);
  const pts = couche(NOMS.PRS_FR);
  assert.match(pts, /<previewExpression>"llib_prs"<\/previewExpression>/);
  for (const f of ['iidtn_prs', 'llib_prs', 'llib_com']) assert.ok(pts.includes(`"${f}"`), f);
  assert.doesNotMatch(pts, /desc_prsf/);
});

test('ordre de rendu et ordre personnalisé : Saisie, ONF (points, parcelles, forêts), puis les fonds', () => {
  const ordre = [...QGS.match(/<layerorder>([\s\S]*?)<\/layerorder>/)[1].matchAll(/<layer id="([^"]*)"/g)].map((m) => m[1]);
  const noms = ordre.map((id) => QGS.match(new RegExp(`<id>${id}</id>[\\s\\S]*?<layername>([^<]*)</layername>`))[1]);
  assert.deepEqual(noms.slice(0, 4), ['Saisie terrain', NOMS.PRS_FR, NOMS.PARC_PUBL_FR, NOMS.FOR_PUBL_FR]);
  assert.equal(noms.length, 9);
  const perso = [...QGS.match(/<custom-order[^>]*>([\s\S]*?)<\/custom-order>/)[1].matchAll(/<item>([^<]*)<\/item>/g)].map((m) => m[1]);
  assert.deepEqual(perso, ordre);
});

test('thème « Fond embarqué » : aucune couche ONF (en ligne seulement), Plan IGN v2 et Cadastre seuls', () => {
  const theme = QGS.match(/<visibility-preset name="Fond embarqué"[\s\S]*?<\/visibility-preset>/)[0];
  const ids = [...theme.matchAll(/<layer id="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2);
  for (const id of ids) assert.match(id, /^(Plan_IGN_v2|Cadastre)_/);
  assert.doesNotMatch(theme, /FOR_PUBL_FR|PARC_PUBL_FR|PRS_FR/);
});

test('vision.qgz du dépôt contient le groupe ONF (régénéré par l\'outil)', () => {
  const buf = readFileSync(new URL('../vision.qgz', import.meta.url));
  assert.ok(buf.equals(ecrireQgz(QGS)));
});

test('déterminisme : deux écritures identiques', () => {
  assert.equal(ecrireQgs(), ecrireQgs());
});
