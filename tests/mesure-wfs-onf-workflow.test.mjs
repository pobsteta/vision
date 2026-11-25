// Mission 053, étape 1 : le workflow de mesure du WFS de l'ONF ne publie rien et ne se lance qu'à la main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const wf = readFileSync(join(RACINE, '.github', 'workflows', 'mesure-wfs-onf.yml'), 'utf8')
  .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

test('mesure WFS ONF : déclencheur unique, workflow_dispatch', () => {
  const on = wf.match(/^on:\n((?:[ ]+.*\n)+)/m);
  assert.ok(on, 'bloc on:');
  assert.deepEqual(on[1].match(/^ {2}\S[^:]*/gm).map((s) => s.trim()), ['workflow_dispatch']);
  assert.doesNotMatch(wf, /\bpush:|pull_request|schedule:/);
});

test('mesure WFS ONF : lecture seule, pas de contents: write, pas de release ni de push', () => {
  assert.match(wf, /permissions:\n\s+contents: read/);
  assert.doesNotMatch(wf, /contents:\s*write/);
  assert.doesNotMatch(wf, /gh release|git push|git commit|GH_TOKEN/);
});

test('mesure WFS ONF : GDAL par apt, outil lancé, artefact à courte rétention avec les .gpkg', () => {
  assert.match(wf, /apt-get install -y gdal-bin/);
  assert.match(wf, /node outils\/mesure-wfs-onf\.mjs mesure-onf/);
  assert.match(wf, /actions\/upload-artifact@v4/);
  assert.match(wf, /if: always\(\)/);
  const jours = Number(wf.match(/retention-days: (\d+)/)[1]);
  assert.ok(jours >= 1 && jours <= 14, `rétention courte (${jours} j)`);
  assert.match(wf, /mesure-onf\//);
});
