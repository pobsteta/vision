// Mission 053, étape 3, temps 3 : la sonde C4 (outil d'essai du temps 2, textes provisoires) est RETIRÉE. Elle a prouvé sur le Samsung
// (QField v4.3.8, journal du 25 novembre 2026, comptes rendus dans docs/referentiels/brut/onf/sonde-c4-2026-11-25/) la bascule d'un
// GeoPackage par renommage puis reload() ; le prototype du groupe « ONF Cache » la remplace (tests/cache-onf-groupe-053.test.mjs).
// Ce fichier est la garde : rien de la sonde ne doit partir vers main, ni en code, ni en bouton, ni en texte provisoire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../plugin/vision-logique.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const SONDE = /sonde\s*C4|sondeC4|SONDE_C4|_sonde-c4|vision\/sonde|outil d'essai|textes provisoires|À RETIRER AVANT TOUTE FUSION/i;

test('garde : la sonde C4 n\'existe plus dans le plugin (logique, pont QML, panneau, main.qml, métadonnées)', () => {
  for (const f of readdirSync(join(RACINE, 'plugin')).filter((n) => /\.(qml|mjs|txt)$/.test(n))) {
    assert.ok(!SONDE.test(lire('plugin/' + f)), `plugin/${f} : reste de la sonde C4`);
  }
});

test('garde : aucune fonction ni constante de la sonde n\'est exportée par la logique', () => {
  for (const nom of Object.keys(L)) assert.ok(!/sonde/i.test(nom), nom);
  for (const nom of ['sondeC4Chemins', 'sondeC4NomRapport', 'sondeC4Gml', 'sondeC4Gfs', 'sondeC4Preparer', 'sondeC4Bascule', 'SONDE_C4']) assert.equal(L[nom], undefined, nom);
});

test('garde : le panneau n\'a plus de bouton de sonde ; le bouton du cache reste', () => {
  const p = lire('plugin/Panneau.qml');
  for (const f of ['sondeC4Preparer', 'sondeC4Bascule', 'sondeC4Retirer', 'sondeC4Texte']) assert.ok(!p.includes(f), f);
  assert.match(p, /onClicked: panneau\.vision\.mettreEnCacheOnf\(\)/);
});

test('garde : la sonde est retirée, la preuve reste écrite dans la pièce (§ 14 bis : verdict PROUVÉE, page « Impossible de charger certaines couches »)', () => {
  const doc = lire('docs/referentiels/cache-zone-qfield.md');
  assert.ok(doc.includes('### 14 bis.'));
  const dossier = readdirSync(join(RACINE, 'docs/referentiels/brut/onf/sonde-c4-2026-11-25'));
  assert.ok(dossier.some((f) => /^rapport-.*\.txt$/.test(f)));
  assert.ok(dossier.some((f) => /page-erreur/.test(f)));
  const prouve = dossier.filter((f) => /\.txt$/.test(f)).map((f) => lire('docs/referentiels/brut/onf/sonde-c4-2026-11-25/' + f)).join('\n');
  assert.match(prouve, /VERDICT : bascule par renommage puis reload\(\) PROUVÉE/);
});
