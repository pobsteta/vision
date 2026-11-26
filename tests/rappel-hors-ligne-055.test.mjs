// Mission 055, temps 2 : rappel « préparer le hors ligne » dans le panneau Vision. Textes validés par Pascal le 26 novembre 2026,
// relus mot pour mot dans la fiche. Aucune détection du réseau, jamais bloquant. Calcul « plus de 7 jours » : fonction pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../plugin/vision-logique.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const JOUR = 86400000;
const DATE = new Date(2026, 10, 19, 9, 0, 0); // 19/11/2026, heure de l'appareil

function entree(couche, date) {
  return { cache: 'onf', couche, chemin: 'actuel/' + couche + '.gpkg', objets: 3, date: date.toISOString() };
}
function registre(date) {
  return ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR'].map((c) => entree(c, date));
}

function textesFiche() {
  const t = {};
  for (const l of lire('pilotage/missions/055-rappel-hors-ligne.md').split('\n')) {
    const m = /^\| ([^|]+) \| (.+) \|$/.exec(l);
    if (m && m[2].includes('«')) t[m[1].trim()] = [...m[2].matchAll(/« (.*?) »/g)].map((x) => x[1]);
  }
  return t;
}

test('textes : ceux de la fiche 055 (validés par Pascal le 26 novembre 2026), mot pour mot', () => {
  const f = textesFiche();
  assert.equal(L.TEXTES_RAPPEL.permanent, f['Permanent'][0]);
  assert.equal(L.TEXTES_RAPPEL.absent, f['Cache absent'][0]);
  assert.equal(L.texteRappelAncien(new Date(2026, 10, 19)), f['Cache ancien'][0].replace('JJ/MM', '19/11'));
  assert.equal(f['Permanent'][0], "Avant le terrain, avec du réseau : parcourez la zone du jour, puis mettez l'ONF en cache.");
});

test('cacheAncien : 7 jours pile = pas ancien ; 7 jours et 1 ms = ancien', () => {
  assert.equal(L.cacheAncien(DATE, new Date(DATE.getTime() + 7 * JOUR)), false);
  assert.equal(L.cacheAncien(DATE, new Date(DATE.getTime() + 7 * JOUR + 1)), true);
  assert.equal(L.cacheAncien(DATE, new Date(DATE.getTime() + 8 * JOUR)), true);
  assert.equal(L.cacheAncien(DATE, new Date(DATE.getTime() + 6 * JOUR)), false);
});

test('cacheAncien : cache du jour, date future (horloge) et date illisible ne sont jamais anciens', () => {
  assert.equal(L.cacheAncien(DATE, DATE), false);
  assert.equal(L.cacheAncien(DATE, new Date(DATE.getTime() - 3 * JOUR)), false);
  for (const d of ['', 'pas une date', undefined, null, NaN]) assert.equal(L.cacheAncien(d, DATE), false, String(d));
  assert.equal(L.cacheAncien(DATE, 'illisible'), false);
  assert.equal(L.cacheAncien(DATE.toISOString(), new Date(DATE.getTime() + 9 * JOUR)), true, 'date du registre en texte ISO');
});

test('texteRappelAncien : JJ/MM de la date du cache, deux chiffres', () => {
  assert.equal(L.texteRappelAncien(new Date(2026, 2, 5)), 'Cache ONF ancien (du 05/03) : renouvelez-le avant de partir.');
});

test('rappelCacheLigne : registre sans cache ou cache incomplet = absent', () => {
  const now = new Date(DATE.getTime() + 1 * JOUR);
  assert.equal(L.rappelCacheLigne([], now), L.TEXTES_RAPPEL.absent);
  assert.equal(L.rappelCacheLigne(undefined, now), L.TEXTES_RAPPEL.absent);
  assert.equal(L.rappelCacheLigne(registre(DATE).slice(0, 2), now), L.TEXTES_RAPPEL.absent);
});

test('rappelCacheLigne : cache récent = rien de plus ; cache de plus de 7 jours = ancien avec sa date', () => {
  assert.equal(L.rappelCacheLigne(registre(DATE), new Date(DATE.getTime() + 7 * JOUR)), '');
  assert.equal(L.rappelCacheLigne(registre(DATE), new Date(DATE.getTime() + 7 * JOUR + 1)), 'Cache ONF ancien (du 19/11) : renouvelez-le avant de partir.');
});

test('rappelCacheLigne : date illisible dans le registre = entrée écartée, donc cache absent (jamais de faux « du JJ/MM »)', () => {
  const r = registre(DATE);
  r[0].date = 'illisible';
  assert.equal(L.rappelCacheLigne(r, DATE), L.TEXTES_RAPPEL.absent);
});

test('panneau : ligne permanente sous le bouton du cache, ligne conditionnelle, jamais bloquant, aucune détection du réseau', () => {
  const p = lire('plugin/Panneau.qml');
  const v = lire('plugin/Vision.qml');
  assert.match(p, /text: panneau\.vision \? panneau\.vision\.texteRappel : ""/);
  assert.match(p, /ligneRappel = vision \? vision\.rappelLigne\(\) : ""/);
  assert.match(p, /visible: panneau\.ligneRappel !== ""/);
  assert.ok(p.indexOf('panneau.vision.texteRappel') > p.indexOf('mettreEnCacheOnf()'), 'sous le bouton du cache');
  assert.match(v, /readonly property string texteRappel: Logique\.TEXTES_RAPPEL\.permanent/);
  assert.match(v, /Logique\.rappelCacheLigne\(/);
  for (const src of [p, v]) assert.doesNotMatch(src, /isReachable|cloudConnection/);
  const debut = p.indexOf('panneau.vision.texteRappel');
  const bloc = p.slice(debut - 400, p.indexOf('panneau.ligneRappel', debut) + 300);
  assert.doesNotMatch(bloc, /Dialog|Popup|modal/i);
});

test('version du plugin : 0.10.0 (mission 014, après la 055), constante et metadata.txt', () => {
  assert.equal(L.VERSION, '0.10.0');
  assert.match(lire('plugin/metadata.txt'), /^version=0\.10\.0$/m);
});
