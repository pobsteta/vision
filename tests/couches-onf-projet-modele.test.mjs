// Mission 053, étape 2 : groupe « ONF » (devenu « ONF WFS » à l'étape 3) du projet modèle (trois couches WFS en ligne) ;
// étape 3, temps 3 : groupe « ONF Cache » (trois couches GeoPackage à chemin fixe que le plugin remplit,
// docs/referentiels/cache-zone-qfield.md § 14).
// Sources : fiche 053 (arbitrages n° 2 à 4 ; noms tranchés par Pascal le 25 novembre 2026 : mêmes noms que le cache) ;
// mesure n° 1 (docs/referentiels/brut/onf/mesure-2026-11-25.md) ; cache-zone-qfield.md § 1.2 ; QGIS 3a92eb3 src/providers/wfs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { ecrireQgs, ecrireQgz, GROUPE_ONF, GROUPE_ONF_CACHE } from '../outils/projet-modele.mjs';
import { STYLES_ONF } from '../plugin/vision-styles-onf.mjs';
import { genererStylesOnf } from '../plugin/empaqueter.mjs';
import { CACHE_ONF, cacheSourceProjet } from '../plugin/vision-logique.mjs';

const QGS = ecrireQgs();
const dexml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xmlAttr = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NOMS = { FOR_PUBL_FR: 'Forêts publiques (© ONF)', PARC_PUBL_FR: 'Parcelles forestières (© ONF)', PRS_FR: 'Points de secours (© ONF)' };
// Les groupes « ONF WFS » et « ONF Cache » portent les mêmes noms de couches : `couche` rend la couche WFS, `coucheCache` celle du cache.
const blocs = (qgs = QGS) => [...qgs.matchAll(/<maplayer [^>]*>[\s\S]*?<\/maplayer>/g)].map((m) => m[0]);
const nomDe = (b) => b.match(/<layername>([^<]*)<\/layername>/)[1];
const couche = (nom, qgs = QGS) => blocs(qgs).find((b) => nomDe(b) === nom && /<provider[^>]*>WFS<\/provider>/.test(b));
const coucheCache = (code, qgs = QGS) => blocs(qgs).find((b) => /<provider[^>]*>ogr<\/provider>/.test(b) && b.includes(`actuel/${code}.gpkg`));
const attr = (t, n) => (new RegExp(` ?${n}="([^"]*)"`).exec(t) || [])[1];

test('arbre : « ONF Cache » au-dessus de « ONF WFS », tous deux cochés et dépliés, entre « Saisie terrain » et « Fonds de carte »', () => {
  assert.equal(GROUPE_ONF, 'ONF WFS');
  assert.equal(GROUPE_ONF_CACHE, 'ONF Cache');
  const arbre = QGS.match(/<layer-tree-group>([\s\S]*?)<\/layer-tree-group>\s*<snapping/)[1];
  const ordre = [...arbre.matchAll(/<layer-tree-(?:group name="([^"]*)"|layer id="[^"]*" name="([^"]*)")/g)].map((m) => m[1] ?? m[2]);
  const trois = ['Points de secours (© ONF)', 'Parcelles forestières (© ONF)', 'Forêts publiques (© ONF)'];
  assert.deepEqual(ordre.slice(0, 9), ['Saisie terrain', 'ONF Cache', ...trois, 'ONF WFS', ...trois]);
  assert.equal(ordre[9], 'Fonds de carte');
  assert.ok(!ordre.includes('ONF'), 'l\'ancien groupe « ONF » n\'existe plus');
  const groupe = (nom) => arbre.match(new RegExp(`<layer-tree-group name="${nom}" ([^>]*)>([\\s\\S]*?)</layer-tree-group>`));
  for (const nom of ['ONF WFS', 'ONF Cache']) {
    const g = groupe(nom);
    assert.match(g[1], /checked="Qt::Checked"/, nom); // arbitrage de Pascal (26 novembre 2026) : les deux groupes cochés par défaut
    assert.match(g[1], /expanded="1"/, nom);
  }
  const feuilles = (nom) => [...groupe(nom)[2].matchAll(/<layer-tree-layer [^>]*providerKey="([^"]*)"[^>]*checked="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(feuilles('ONF WFS'), [['WFS', 'Qt::Checked'], ['WFS', 'Qt::Checked'], ['WFS', 'Qt::Checked']]); // arbitrage n° 2 : toutes cochées
  assert.deepEqual(feuilles('ONF Cache'), [['ogr', 'Qt::Checked'], ['ogr', 'Qt::Checked'], ['ogr', 'Qt::Checked']]);
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
  assert.doesNotMatch(QGS.match(/<layer-tree-group name="ONF WFS"[\s\S]*?<\/layer-tree-group>/)[0], /[?&' ;](apikey|api_key|key|token|password|username|authcfg)=/i);
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

test('ordre de rendu et ordre personnalisé : Saisie, ONF Cache (points, parcelles, forêts), ONF WFS (idem), puis les fonds', () => {
  const ordre = [...QGS.match(/<layerorder>([\s\S]*?)<\/layerorder>/)[1].matchAll(/<layer id="([^"]*)"/g)].map((m) => m[1]);
  const noms = ordre.map((id) => QGS.match(new RegExp(`<id>${id}</id>[\\s\\S]*?<layername>([^<]*)</layername>`))[1]);
  assert.deepEqual(noms.slice(0, 7), ['Saisie terrain', NOMS.PRS_FR, NOMS.PARC_PUBL_FR, NOMS.FOR_PUBL_FR, NOMS.PRS_FR, NOMS.PARC_PUBL_FR, NOMS.FOR_PUBL_FR]);
  assert.ok(ordre.slice(1, 4).every((id) => id.includes('Cache')) && ordre.slice(4, 7).every((id) => !id.includes('Cache')), 'les trois premières couches ONF sont celles du cache');
  assert.equal(noms.length, 12);
  assert.equal(new Set(ordre).size, 12, 'identifiants de couche distincts');
  const perso = [...QGS.match(/<custom-order[^>]*>([\s\S]*?)<\/custom-order>/)[1].matchAll(/<item>([^<]*)<\/item>/g)].map((m) => m[1]);
  assert.deepEqual(perso, ordre);
});

test('thème « Fond embarqué » : aucune couche ONF (en ligne seulement), Plan IGN v2 et Cadastre seuls', () => {
  const theme = QGS.match(/<visibility-preset name="Fond embarqué"[\s\S]*?<\/visibility-preset>/)[0];
  const ids = [...theme.matchAll(/<layer id="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2);
  for (const id of ids) assert.match(id, /^(Plan_IGN_v2|Cadastre)_/);
  assert.doesNotMatch(theme, /FOR_PUBL_FR|PARC_PUBL_FR|PRS_FR|ONF/);
});

test('vision.qgz du dépôt contient les groupes ONF Cache et ONF WFS (régénéré par l\'outil)', () => {
  const buf = readFileSync(new URL('../vision.qgz', import.meta.url));
  assert.ok(buf.equals(ecrireQgz(QGS)));
});

test('déterminisme : deux écritures identiques', () => {
  assert.equal(ecrireQgs(), ecrireQgs());
});

// ------------------------------------------------------------------------------------------- groupe « ONF Cache » (étape 3, temps 3)
test('cache : trois couches ogr à chemin fixe vision-imports/_cache-onf/actuel/<couche>.gpkg, table = couche (source relative au projet)', () => {
  for (const [code, nom] of Object.entries(NOMS)) {
    const b = coucheCache(code);
    assert.ok(b, code);
    assert.equal(dexml(b.match(/<datasource>([^<]*)<\/datasource>/)[1]), `./vision-imports/_cache-onf/actuel/${code}.gpkg|layername=${code}`);
    assert.equal(dexml(b.match(/<datasource>([^<]*)<\/datasource>/)[1]), cacheSourceProjet(code), 'même source que le plugin');
    assert.equal(nomDe(b), nom, 'nom validé « … (© ONF) »');
    assert.equal(b.match(/<title>([^<]*)<\/title>/)[1], nom);
    assert.equal(b.match(/<provider[^>]*>([^<]*)<\/provider>/)[1], 'ogr');
    assert.equal(attr(b.match(/<maplayer [^>]*>/)[0], 'type'), 'vector');
    assert.ok(QGS.includes(`name="${nom}" source="${xmlAttr(cacheSourceProjet(code))}" providerKey="ogr"`), `feuille d'arbre de ${code}`);
  }
});

test('cache : lecture seule, attribution « © ONF », géométrie polygone pour forêts et parcelles, point pour les points de secours', () => {
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
  assert.ok(!/vision\/cache|vision\/couche/.test(couche(NOMS.FOR_PUBL_FR)), 'les couches WFS ne portent pas les marques du cache');
});

test('cache : seuils comme avant (« mêmes seuils ») : parcelles et points en deçà du 1:50 000, forêts toujours visibles', () => {
  const t = (code) => { const e = coucheCache(code).match(/<maplayer [^>]*>/)[0]; return [attr(e, 'hasScaleBasedVisibilityFlag'), attr(e, 'minScale'), attr(e, 'maxScale')]; };
  assert.deepEqual(t('FOR_PUBL_FR'), ['0', '100000000', '0']);
  assert.deepEqual(t('PARC_PUBL_FR'), ['1', '50000', '0']);
  assert.deepEqual(t('PRS_FR'), ['1', '50000', '0']);
});

test('cache : styles du plugin (corps du .qml adapté) à l\'insertion près des deux marques ; étiquettes et champs réels', () => {
  for (const code of Object.keys(NOMS)) {
    const corps = STYLES_ONF[code].match(/<qgis [^>]*>\s*([\s\S]*?)\s*<\/qgis>/)[1];
    const sansMarques = coucheCache(code).replace(/\s*<Option name="vision\/cache" value="onf" type="QString"\/>\s*<Option name="vision\/couche" value="[A-Z_]+" type="QString"\/>/, '');
    assert.ok(sansMarques.includes(corps), `${code} : corps du style absent de la couche du cache`);
  }
  assert.match(coucheCache('FOR_PUBL_FR'), /fieldName="iidtn_frt"/);
  assert.match(coucheCache('PARC_PUBL_FR'), /fieldName="ccod_prf"/);
  assert.match(coucheCache('PRS_FR'), /<previewExpression>"llib_prs"<\/previewExpression>/);
});

test('cache et WFS : mêmes couches, deux groupes ; l\'un ne remplace pas l\'autre (cache = hors réseau, WFS = en ligne)', () => {
  for (const [code, nom] of Object.entries(NOMS)) {
    assert.ok(couche(nom) && coucheCache(code), code);
    assert.notEqual(couche(nom), coucheCache(code));
  }
  assert.equal(blocs().filter((b) => /<provider[^>]*>ogr<\/provider>/.test(b) && b.includes('_cache-onf')).length, 3);
});

test('cache : identifiant de couche « ONF_Cache_<couche>_<empreinte> » (repli du plugin si ses propriétés ne se lisent pas) ; ceux du WFS n\'ont pas ce préfixe', () => {
  for (const code of Object.keys(NOMS)) {
    assert.match(QGS.match(new RegExp(`<id>(ONF_Cache_${code}_[^<]*)</id>`))[1], new RegExp(`^ONF_Cache_${code}_[0-9a-f_]+$`));
    assert.equal((QGS.match(new RegExp(`<id>ONF_Cache_${code}_`, 'g')) || []).length, 1);
    assert.match(lireQml(), new RegExp('"ONF_Cache_" \\+ nomCouche'));
  }
});
const lireQml = () => readFileSync(new URL('../plugin/Vision.qml', import.meta.url), 'utf8');
