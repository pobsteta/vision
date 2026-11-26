// Mission 053 : groupe « ONF Cache » du projet modèle (trois couches GeoPackage à chemin fixe que le plugin remplit,
// docs/referentiels/cache-zone-qfield.md § 14 et § 15). Étape 2 : les couches WFS en ligne, puis (temps 4, arbitrage de Pascal du
// 26 novembre 2026, après l'essai Samsung : « Impossible de charger certaines couches » hors réseau à cause d'elles) : le groupe
// « ONF WFS » est RETIRÉ de vision.qgz ; ces tests, qui le décrivaient, sont réécrits en garde d'absence (contrat changé par décision de Pascal).
// Sources : fiche 053 (arbitrages n° 2 à 4 ; noms validés) ; QGIS 3a92eb3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ecrireQgs, ecrireQgz, GROUPE_ONF_CACHE } from '../outils/projet-modele.mjs';
import * as Modele from '../outils/projet-modele.mjs';
import { STYLES_ONF } from '../plugin/vision-styles-onf.mjs';
import { genererStylesOnf } from '../plugin/empaqueter.mjs';
import { CACHE_ONF, cacheSourceProjet } from '../plugin/vision-logique.mjs';

const QGS = ecrireQgs();
const dexml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xmlAttr = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NOMS = { FOR_PUBL_FR: 'Forêts publiques (© ONF)', PARC_PUBL_FR: 'Parcelles forestières (© ONF)', PRS_FR: 'Points de secours (© ONF)' };
const blocs = (qgs = QGS) => [...qgs.matchAll(/<maplayer [^>]*>[\s\S]*?<\/maplayer>/g)].map((m) => m[0]);
const nomDe = (b) => b.match(/<layername>([^<]*)<\/layername>/)[1];
const coucheCache = (code, qgs = QGS) => blocs(qgs).find((b) => /<provider[^>]*>ogr<\/provider>/.test(b) && b.includes(`actuel/${code}.gpkg`));
const attr = (t, n) => (new RegExp(` ?${n}="([^"]*)"`).exec(t) || [])[1];

test('arbre : « ONF Cache » seul groupe ONF, coché et déplié, entre « Saisie terrain » et « Fonds de carte »', () => {
  assert.equal(GROUPE_ONF_CACHE, 'ONF Cache');
  const arbre = QGS.match(/<layer-tree-group>([\s\S]*?)<\/layer-tree-group>\s*<snapping/)[1];
  const ordre = [...arbre.matchAll(/<layer-tree-(?:group name="([^"]*)"|layer id="[^"]*" name="([^"]*)")/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(ordre.slice(0, 5), ['Saisie terrain', 'ONF Cache', 'Points de secours (© ONF)', 'Parcelles forestières (© ONF)', 'Forêts publiques (© ONF)']);
  assert.equal(ordre[5], 'Fonds de carte');
  assert.ok(!ordre.includes('ONF') && !ordre.includes('ONF WFS'), 'plus de groupe WFS');
  const g = arbre.match(/<layer-tree-group name="ONF Cache" ([^>]*)>([\s\S]*?)<\/layer-tree-group>/);
  assert.match(g[1], /checked="Qt::Checked"/);
  assert.match(g[1], /expanded="1"/);
  const feuilles = [...g[2].matchAll(/<layer-tree-layer [^>]*providerKey="([^"]*)"[^>]*checked="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(feuilles, [['ogr', 'Qt::Checked'], ['ogr', 'Qt::Checked'], ['ogr', 'Qt::Checked']]);
});

test('garde (arbitrage de Pascal, 26 novembre 2026) : aucune couche WFS dans vision.qgz (hors réseau, elle donnerait « Impossible de charger certaines couches »)', () => {
  assert.doesNotMatch(QGS, /<provider[^>]*>\s*WFS\s*<\/provider>/);
  assert.doesNotMatch(QGS, /providerKey="WFS"/);
  assert.doesNotMatch(QGS, /ws\.carmencarto\.fr|typename=|restrictToRequestBBOX|srsname=/);
  assert.doesNotMatch(QGS, /ONF WFS/);
  for (const nom of ['GROUPE_ONF', 'SERVICE_ONF', 'VERSION_WFS_ONF', 'sourceOnf']) assert.equal(Modele[nom], undefined, `${nom} : reste du groupe WFS`);
  assert.equal(blocs().filter((b) => /<provider[^>]*>(?!ogr|wms|gdal)[^<]*<\/provider>/.test(b)).length, 0);
  // Le plugin interroge le service lui-même (GetFeature par le bouton) : cela ne passe pas par vision.qgz.
  assert.equal(CACHE_ONF.service, 'http://ws.carmencarto.fr/WFS/105/ONF_Forets');
});

test('noms exacts : ceux du cache du plugin (Pascal, 25 novembre 2026), une seule fois chacun', () => {
  for (const c of CACHE_ONF.couches) {
    assert.equal(NOMS[c.couche], c.nom, c.couche);
    const b = coucheCache(c.couche);
    assert.equal(nomDe(b), c.nom);
    assert.equal(b.match(/<title>([^<]*)<\/title>/)[1], c.nom);
    assert.equal(blocs().filter((x) => nomDe(x) === c.nom).length, 1);
  }
  assert.doesNotMatch(QGS, /en ligne/);
});

test('ordre de rendu et ordre personnalisé : Saisie, ONF Cache (points, parcelles, forêts), puis les fonds', () => {
  const ordre = [...QGS.match(/<layerorder>([\s\S]*?)<\/layerorder>/)[1].matchAll(/<layer id="([^"]*)"/g)].map((m) => m[1]);
  const noms = ordre.map((id) => QGS.match(new RegExp(`<id>${id}</id>[\\s\\S]*?<layername>([^<]*)</layername>`))[1]);
  assert.deepEqual(noms.slice(0, 4), ['Saisie terrain', NOMS.PRS_FR, NOMS.PARC_PUBL_FR, NOMS.FOR_PUBL_FR]);
  assert.ok(ordre.slice(1, 4).every((id) => id.includes('Cache')));
  assert.equal(noms.length, 9);
  assert.equal(new Set(ordre).size, 9, 'identifiants de couche distincts');
  const perso = [...QGS.match(/<custom-order[^>]*>([\s\S]*?)<\/custom-order>/)[1].matchAll(/<item>([^<]*)<\/item>/g)].map((m) => m[1]);
  assert.deepEqual(perso, ordre);
});

test('thème « Fond embarqué » : aucune couche ONF, Plan IGN v2 et Cadastre seuls', () => {
  const theme = QGS.match(/<visibility-preset name="Fond embarqué"[\s\S]*?<\/visibility-preset>/)[0];
  const ids = [...theme.matchAll(/<layer id="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2);
  for (const id of ids) assert.match(id, /^(Plan_IGN_v2|Cadastre)_/);
  assert.doesNotMatch(theme, /FOR_PUBL_FR|PARC_PUBL_FR|PRS_FR|ONF/);
});

test('vision.qgz du dépôt est celui que régénère l\'outil (groupe ONF Cache seul)', () => {
  const buf = readFileSync(new URL('../vision.qgz', import.meta.url));
  assert.ok(buf.equals(ecrireQgz(QGS)));
});

test('déterminisme : deux écritures identiques', () => {
  assert.equal(ecrireQgs(), ecrireQgs());
});

test('cache : trois couches ogr à chemin fixe vision-imports/_cache-onf/actuel/<couche>.gpkg, table = couche (source relative au projet)', () => {
  for (const [code, nom] of Object.entries(NOMS)) {
    const b = coucheCache(code);
    assert.ok(b, code);
    assert.equal(dexml(b.match(/<datasource>([^<]*)<\/datasource>/)[1]), `./vision-imports/_cache-onf/actuel/${code}.gpkg|layername=${code}`);
    assert.equal(dexml(b.match(/<datasource>([^<]*)<\/datasource>/)[1]), cacheSourceProjet(code), 'même source que le plugin');
    assert.equal(b.match(/<provider[^>]*>([^<]*)<\/provider>/)[1], 'ogr');
    assert.equal(attr(b.match(/<maplayer [^>]*>/)[0], 'type'), 'vector');
    assert.ok(QGS.includes(`name="${nom}" source="${xmlAttr(cacheSourceProjet(code))}" providerKey="ogr"`), `feuille d'arbre de ${code}`);
  }
});

test('cache : lecture seule, attribution « © ONF », polygone pour forêts et parcelles, point pour les points de secours', () => {
  for (const [code, nom] of Object.entries(NOMS)) {
    const b = coucheCache(code);
    assert.equal(attr(b.match(/<maplayer [^>]*>/)[0], 'readOnly'), '1', nom);
    assert.equal(b.match(/<rights>([^<]*)<\/rights>/)[1], '© ONF');
    assert.equal(b.match(/<attribution>([^<]*)<\/attribution>/)[1], '© ONF');
    assert.equal(attr(b.match(/<maplayer [^>]*>/)[0], 'geometry'), code === 'PRS_FR' ? 'Point' : 'Polygon');
    assert.match(b, /<srs>[\s\S]*?2154[\s\S]*?<\/srs>/);
  }
});

test('cache : marques vision/cache=onf et vision/couche=<couche> dans les propriétés de la couche (une seule section, celle du style)', () => {
  for (const code of Object.keys(NOMS)) {
    const b = coucheCache(code);
    assert.equal((b.match(/<customproperties>/g) || []).length, 1, 'une seule section customproperties');
    assert.ok(b.includes('<Option name="vision/cache" value="onf" type="QString"/>'), code);
    assert.ok(b.includes(`<Option name="vision/couche" value="${code}" type="QString"/>`), code);
  }
});

test('cache : seuils : parcelles et points en deçà du 1:50 000, forêts visibles à toutes les échelles (Pascal, 26 novembre 2026)', () => {
  const t = (code) => { const e = coucheCache(code).match(/<maplayer [^>]*>/)[0]; return [attr(e, 'hasScaleBasedVisibilityFlag'), attr(e, 'minScale'), attr(e, 'maxScale')]; };
  assert.deepEqual(t('FOR_PUBL_FR'), ['0', '100000000', '0']);
  assert.deepEqual(t('PARC_PUBL_FR'), ['1', '50000', '0']);
  assert.deepEqual(t('PRS_FR'), ['1', '50000', '0']);
});

test('cache : styles du plugin (corps du .qml adapté) à l\'insertion près des deux marques ; étiquettes et champs réels', () => {
  assert.equal(genererStylesOnf().includes(JSON.stringify(STYLES_ONF.FOR_PUBL_FR)), true, 'le module du plugin est à jour');
  for (const code of Object.keys(NOMS)) {
    const corps = STYLES_ONF[code].match(/<qgis [^>]*>\s*([\s\S]*?)\s*<\/qgis>/)[1];
    const sansMarques = coucheCache(code).replace(/\s*<Option name="vision\/cache" value="onf" type="QString"\/>\s*<Option name="vision\/couche" value="[A-Z_]+" type="QString"\/>/, '');
    assert.ok(sansMarques.includes(corps), `${code} : corps du style absent de la couche du cache`);
  }
  assert.match(coucheCache('FOR_PUBL_FR'), /fieldName="iidtn_frt"/);
  assert.match(coucheCache('PARC_PUBL_FR'), /fieldName="ccod_prf"/);
  assert.match(coucheCache('PRS_FR'), /<previewExpression>"llib_prs"<\/previewExpression>/);
});

test('cache : identifiant de couche « ONF_Cache_<couche>_<empreinte> » (repli du plugin si ses propriétés ne se lisent pas)', () => {
  const qml = readFileSync(new URL('../plugin/Vision.qml', import.meta.url), 'utf8');
  for (const code of Object.keys(NOMS)) {
    assert.match(QGS.match(new RegExp(`<id>(ONF_Cache_${code}_[^<]*)</id>`))[1], new RegExp(`^ONF_Cache_${code}_[0-9a-f_]+$`));
    assert.equal((QGS.match(new RegExp(`<id>ONF_Cache_${code}_`, 'g')) || []).length, 1);
  }
  assert.match(qml, /"ONF_Cache_" \+ nomCouche/);
});
