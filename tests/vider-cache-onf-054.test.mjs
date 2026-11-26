// SPDX-License-Identifier: GPL-3.0-or-later
// Mission 054 : bouton « Vider le cache ONF ». Tests d'acceptation écrits par le testeur SANS lire plugin/ : seuls la fiche
// (textes validés par Pascal le 26 novembre 2026), la spec (§ 3.3, § 3.6), docs/referentiels/vider-cache-onf.md (§ 8, V1-V10),
// cache-zone-qfield.md (§ 14-15) et les mocks des tests 053 / 014 servent de contrat.
//
// CONTRAT SUPPOSÉ (noms à valider par le dev et l'orchestrateur ; rien n'est inventé en silence, tout est ici) :
//   L.VERSION === '0.10.0' ; plugin/metadata.txt : version=0.10.0
//   L.TEXTES_VIDER_CACHE_ONF = { bouton, confirmation, non, oui, reussite, echec } (aucune clé « pendant » : pas de texte)
//   L.texteViderReussite(restes: string[]) -> « Cache ONF vidé. » ou « Cache ONF vidé. Fichiers restés sur l'appareil : a, b. »
//        (noms de fichiers sans dossier, séparés par « , », point final : forme de la 014)
//   L.VIDER_CONFIRMATION_DELAI_MS === 15000
//   L.viderCacheVisible(registre: tableau d'entrées) -> booléen : vrai seulement si un cache ONF complet est inscrit
//   L.viderCacheOnf(ctx) -> { ok, message, raison, restes } ; ctx = celui de cacheEnregistrer (visionId, dossierProjet, horodatage, date,
//        reglages, ecrireFichier, effacerFichier, existe, ouvrirCouche, creerIterateur, imposerSysteme, reecrireCouche, renommer, recharger,
//        coucheDuGroupe, retirerCacheDeLaCarte). Mode groupe si coucheDuGroupe donne les trois couches, sinon mode ancien.
//        message = texte validé (réussite ou échec) ; raison = diagnostic ; restes = noms des fichiers qui ont résisté (mode ancien).
//        Génération de travail = ctx.horodatage ; note de reprise = clé cleRegistre(id) + '/reprise' (comme la 053).
//   Vision.qml : function viderCacheOnf (qui appelle Logique.viderCacheOnf avec servicesCache()), property bool viderEnCours.
//   Panneau.qml : confirmationVider, viderCacheOnf() (un seul appel), viderCacheVisible (ou propriété équivalente portant ce nom), Timer.
// Un vert ne prouve rien sur le Samsung (faux QField).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../plugin/vision-logique.mjs';
import { EMPRISE_VRAISEMBLANCE } from '../plugin/vision-controles.mjs';
import { STYLES_ONF } from '../plugin/vision-styles-onf.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(join(ici, '..', f), 'utf8');

const ID = '6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b';
const PROJET = '/sdcard/QField/vision';
const IMPORTS = PROJET + '/vision-imports';
const CACHE = IMPORTS + '/_cache-onf';
const ACTUEL = CACHE + '/actuel';
const DATE = new Date(2026, 10, 26, 9, 0, 0);
const H = L.cacheHorodatage(DATE);
const H0 = '20261125T173000Z';
const ZONE = { xmin: 893717, ymin: 6677283, xmax: 897717, ymax: 6681283 };
const CODES = L.CACHE_ONF.couches.map((c) => c.couche);
const NB = { FOR_PUBL_FR: 4, PARC_PUBL_FR: 53, PRS_FR: 1 };
const EMPRISE = { xMinimum: 895200, yMinimum: 6678800, xMaximum: 897100, yMaximum: 6680800 };
const ZIP = { zip: 'Serre.zip', couche: 'UG', chemin: 'Serre/UG.gpkg', style: 'UG' };

const T = {
  bouton: 'Vider le cache ONF',
  confirmation: 'Vider le cache ONF ? Il faudra du réseau pour le refaire.',
  non: 'Non, garder',
  oui: 'Oui, vider',
  reussite: 'Cache ONF vidé.',
  echec: 'Cache ONF non vidé : rien n\'est changé, l\'ancien est gardé.',
};
const restesDebut = 'Cache ONF vidé. Fichiers restés sur l\'appareil : ';

const entrees = (chemin) => CODES.map((c) => ({ cache: 'onf', couche: c, chemin: chemin(c), emprise: ZONE, date: DATE.toISOString(), objets: NB[c] }));
const entreesActuel = () => entrees((c) => `actuel/${c}.gpkg`);
const entreesGeneration = (h) => entrees((c) => `${h}/${c}.gpkg`);

// ------------------------------------------------------------------------------------------- faux QField (même forme que la 053)
function faux({ panne = {}, registre = [], actuel = 'vides', projet = true, disqueEnPlus = {} } = {}) {
  const disque = new Map();
  const journal = [];
  const carte = [];
  const reglages = new Map([[L.cleRegistre(ID), JSON.stringify(registre)]]);
  const gpkg = (n, c) => ({ n, wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' });
  if (actuel === 'vides') for (const c of CODES) disque.set(`${ACTUEL}/${c}.gpkg`, gpkg(0, c));
  if (typeof actuel === 'object') for (const c of CODES) if (actuel[c] !== undefined) disque.set(`${ACTUEL}/${c}.gpkg`, gpkg(actuel[c], c));
  for (const [k, v] of Object.entries(disqueEnPlus)) disque.set(k, v);
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
  const dossier = (nom) => () => { journal.push('DOSSIER ' + nom); return false; };
  const ctx = {
    visionId: ID, dossierProjet: PROJET, horodatage: H, date: DATE, emprise: ZONE, vraisemblance: EMPRISE_VRAISEMBLANCE, styles: STYLES_ONF,
    reponses: {},
    reglages: { value: (k, d) => (reglages.has(k) ? reglages.get(k) : d), setValue: (k, v) => { journal.push('registre ' + k); reglages.set(k, v); } },
    maintenant: () => DATE,
    ecrireFichier(chemin, texte) { journal.push('écrit ' + chemin); if (panne.ecrire === chemin) return false; disque.set(chemin, texte); return true; },
    effacerFichier(chemin) {
      journal.push('effacé ' + chemin);
      if ((panne.effacerRate || []).includes(chemin)) return false;
      disque.delete(chemin);
      return true;
    },
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
        return nouvelleCouche({ uri, nom, n: (d.match(/featureMember>/g) || []).length / 2, wkb: c.wkb, authid: 'EPSG:2154' });
      }
      return nouvelleCouche({ uri, nom, n: d.n, wkb: d.wkb, authid: d.authid });
    },
    creerIterateur(l) { let i = 0; return { hasNext: () => i < l.n, next: () => { i++; return {}; }, close() {} }; },
    imposerSysteme(l) { l.crs = { authid: 'EPSG:2154' }; },
    reecrireCouche(l, cible) { journal.push('réécrit ' + cible); disque.set(cible, { n: l.n, wkb: l.wkbType(), authid: l.crs.authid }); return cible; },
    renommer(de, vers) {
      journal.push('renommé ' + de + ' -> ' + vers);
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
    // Aucune fonction de dossier ne doit être appelée (décision de Pascal pour la 014, reprise ici : le dossier de génération vide reste).
    effacerDossier: dossier('effacerDossier'), supprimerDossier: dossier('supprimerDossier'), rmdir: dossier('rmdir'), removeDataset: dossier('removeDataset'), removeFolder: dossier('removeFolder'),
  };
  if (projet) ctx.coucheDuGroupe = (c) => couchesProjet[c] || null;
  return { ctx, disque, journal, carte, couchesProjet, reglages, registre: () => JSON.parse(reglages.get(L.cleRegistre(ID))) };
}

const zipsEtAutres = () => ({
  [`${IMPORTS}/Serre/UG.gpkg`]: { n: 9, wkb: 6, authid: 'EPSG:2154' },
  [`${IMPORTS}/Serre/UG.qml`]: 'style',
  [`${IMPORTS}/Serre.zip`]: 'zip',
  [`${PROJET}/saisie.gpkg`]: 'saisie',
  [`${PROJET}/vision.qgz`]: 'projet',
  [`${PROJET}/dernier-echec.txt`]: 'diag',
});
const intacts = (f, avant) => { for (const [k, v] of Object.entries(avant)) assert.deepEqual(f.disque.get(k), v, `${k} doit rester tel quel`); };
const chemins = (f) => f.journal.filter((x) => /^(écrit|effacé|renommé|réécrit) /.test(x)).flatMap((x) => x.replace(/^\S+ /, '').split(' -> '));
// Garde commune : tout ce qui est écrit, renommé ou effacé est dans _cache-onf/, jamais un zip, saisie.gpkg, vision.qgz ; aucune fonction de dossier.
function gardes(f) {
  for (const c of chemins(f)) {
    assert.ok(c.startsWith(CACHE + '/'), `hors _cache-onf/ : ${c}`);
    assert.ok(!/saisie\.gpkg|vision\.qgz|\.zip|dernier-echec/.test(c), c);
  }
  assert.deepEqual(f.journal.filter((x) => /^DOSSIER/.test(x)), [], 'aucun appel d\'effacement de dossier');
}
const sansSurprise = (f) => assert.ok(!f.journal.some((x) => /^(RETIRÉ|AJOUTÉ)/.test(x)), 'jamais addMapLayer ni removeMapLayer sur les couches du groupe');
const sansEcriture = (f) => assert.ok(!f.journal.some((x) => /^(écrit|réécrit|renommé|effacé) /.test(x)), 'rien écrit, renommé ni effacé : ' + f.journal.join(' | '));
const ancienActuel = { FOR_PUBL_FR: 4, PARC_PUBL_FR: 53, PRS_FR: 1 };

// ------------------------------------------------------------------------------------------- textes, version, visibilité
function textesFiche() {
  const t = {};
  for (const l of lire('pilotage/missions/054-vider-cache-onf.md').split('\n')) {
    const m = /^- (Bouton|Confirmation|Réussite|Échec)\b.*?:\s(«.*)$/.exec(l);
    if (m) t[m[1]] = [...m[2].matchAll(/« (.*?) »/g)].map((x) => x[1]);
  }
  return t;
}

test('V10 textes : ceux de la fiche 054 (validés par Pascal le 26 novembre 2026), mot pour mot, relus dans la fiche', () => {
  const f = textesFiche();
  assert.deepEqual(f.Bouton, [T.bouton]);
  assert.deepEqual(f.Confirmation, [T.confirmation, T.non, T.oui]);
  assert.equal(f['Réussite'][0], T.reussite);
  assert.equal(f['Réussite'][1].startsWith(restesDebut), true, 'la fiche : « Cache ONF vidé. Fichiers restés sur l\'appareil : … »');
  assert.deepEqual(f['Échec'], [T.echec]);
  const X = L.TEXTES_VIDER_CACHE_ONF;
  assert.equal(X.bouton, f.Bouton[0]);
  assert.equal(X.confirmation, f.Confirmation[0]);
  assert.equal(X.non, f.Confirmation[1]);
  assert.equal(X.oui, f.Confirmation[2]);
  assert.equal(X.reussite, f['Réussite'][0]);
  assert.equal(X.echec, f['Échec'][0]);
  assert.equal(X.pendant, undefined, 'pendant le vidage : aucun texte (bouton grisé)');
});

test('texte de réussite avec des fichiers restés : « Cache ONF vidé. Fichiers restés sur l\'appareil : a, b. » ; sans reste : « Cache ONF vidé. »', () => {
  assert.equal(L.texteViderReussite([]), 'Cache ONF vidé.');
  assert.equal(L.texteViderReussite(['PARC_PUBL_FR.qml']), restesDebut + 'PARC_PUBL_FR.qml.');
  assert.equal(L.texteViderReussite(['a.avant.gpkg', 'a.qml']), restesDebut + 'a.avant.gpkg, a.qml.');
});

test('confirmation : refermée seule au bout de 15 secondes (constante)', () => {
  assert.equal(L.VIDER_CONFIRMATION_DELAI_MS, 15000);
});

test('version du plugin : 0.10.0 (mission 054), constante et metadata.txt', () => {
  assert.equal(L.VERSION, '0.10.0');
  assert.match(lire('plugin/metadata.txt'), /^version=0\.10\.0\s*$/m);
});

test('bouton visible seulement quand un cache ONF est inscrit au registre (jamais pour les seuls zips, un cache incomplet ou un registre vide)', () => {
  assert.equal(L.viderCacheVisible([]), false);
  assert.equal(L.viderCacheVisible([ZIP]), false);
  assert.equal(L.viderCacheVisible(entreesActuel()), true);
  assert.equal(L.viderCacheVisible([ZIP, ...entreesActuel()]), true);
  assert.equal(L.viderCacheVisible(entreesGeneration(H0)), true, 'cache en génération (mode ancien ou migration non faite)');
  assert.equal(L.viderCacheVisible(entreesActuel().slice(0, 2)), false, 'deux entrées sur trois : pas un cache (comme rappelCacheLigne)');
  assert.equal(L.viderCacheVisible(null), false);
  assert.equal(L.viderCacheVisible(undefined), false);
});

test('V9 après le vidage, la ligne de rappel dit « Cache ONF absent… » (texte de la 055, aucun texte neuf) et le bouton disparaît', () => {
  const f = faux({ actuel: ancienActuel, registre: [ZIP, ...entreesActuel()] });
  assert.equal(L.viderCacheOnf(f.ctx).ok, true);
  assert.equal(L.rappelCacheLigne(f.registre(), new Date(DATE.getTime() + 1000)), L.TEXTES_RAPPEL.absent);
  assert.equal(L.viderCacheVisible(f.registre()), false);
});

// ------------------------------------------------------------------------------------------- V1 mode groupe : nominal
test('V1 mode groupe : trois GeoPackage vides écrits en génération, bascule vers actuel/, couches à 0 objet, registre sans cache (zip gardé), texte « Cache ONF vidé. »', () => {
  const autres = zipsEtAutres();
  const f = faux({ actuel: ancienActuel, registre: [ZIP, ...entreesActuel()], disqueEnPlus: autres });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.equal(r.message, T.reussite);
  assert.deepEqual(r.restes ?? [], []);
  for (const c of CODES) {
    const d = f.disque.get(`${ACTUEL}/${c}.gpkg`);
    assert.equal(d.n, 0, `${c} : 0 objet à actuel/`);
    assert.equal(d.wkb, L.coucheOnf(c).wkb, `${c} : type de géométrie conservé`);
    assert.equal(d.authid, 'EPSG:2154');
    assert.equal(f.couchesProjet[c].n, 0, `${c} : la couche du projet affiche 0 objet`);
    assert.equal(f.couchesProjet[c].isValid, true);
    assert.equal(f.couchesProjet[c].rechargements, 1, `${c} : un seul reload`);
    assert.ok(f.journal.includes(`réécrit ${CACHE}/${H}/${c}.gpkg`), `${c} : GeoPackage vide écrit dans la génération`);
  }
  assert.deepEqual(f.registre(), [ZIP], 'registre : plus aucune entrée de cache, l\'entrée du zip est intacte');
  sansSurprise(f);
  gardes(f);
  intacts(f, autres);
});

test('V1 bascule : l\'actuel est mis de côté puis le vide prend sa place, pour chaque couche ; reload après tous les renommages ; l\'ancien cache (.avant.gpkg) est effacé', () => {
  const f = faux({ actuel: ancienActuel, registre: entreesActuel() });
  assert.equal(L.viderCacheOnf(f.ctx).ok, true);
  const renommes = f.journal.filter((x) => /^renommé /.test(x));
  assert.deepEqual(renommes, CODES.flatMap((c) => [`renommé ${ACTUEL}/${c}.gpkg -> ${CACHE}/${H}/${c}.avant.gpkg`, `renommé ${CACHE}/${H}/${c}.gpkg -> ${ACTUEL}/${c}.gpkg`]));
  assert.ok(f.journal.lastIndexOf(renommes[renommes.length - 1]) < f.journal.findIndex((x) => /^rechargé /.test(x)));
  assert.deepEqual(f.journal.filter((x) => /^rechargé /.test(x)), CODES.map((c) => 'rechargé ' + L.coucheOnf(c).nom));
  for (const c of CODES) assert.ok(f.journal.includes(`effacé ${CACHE}/${H}/${c}.avant.gpkg`), `${c} : ancien cache effacé`);
  assert.deepEqual([...f.disque.keys()].filter((k) => k.startsWith(`${CACHE}/${H}/`)), [], 'rien ne reste dans la génération');
  assert.deepEqual([...f.disque.keys()].filter((k) => k.startsWith(ACTUEL + '/')).sort(), CODES.map((c) => `${ACTUEL}/${c}.gpkg`).sort(), 'actuel/ : trois .gpkg, rien d\'autre');
  assert.ok(!f.journal.some((x) => /^effacé .*\/actuel\//.test(x)), 'jamais d\'effacement dans actuel/');
  assert.ok(!f.journal.some((x) => /\.qml/.test(x)), 'aucun style voisin');
  gardes(f);
});

test('V1 le GeoPackage vide écrit n\'est pas rouvert par une couche de travail (jeu de données GDAL partagé avec la couche du projet)', () => {
  const f = faux({ actuel: ancienActuel, registre: entreesActuel() });
  L.viderCacheOnf(f.ctx);
  assert.ok(!f.journal.some((x) => /^ouvert .*\.gpkg/.test(x)), f.journal.filter((x) => /^ouvert /.test(x)).join(' | '));
});

test('V1 le vidage se fait sans réseau : aucune réponse du service dans le ctx, le vidage réussit quand même', () => {
  const f = faux({ actuel: ancienActuel, registre: entreesActuel() });
  delete f.ctx.reponses;
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, true, r.raison);
});

test('cache déjà vide (actuel/ vides) mais inscrit au registre : le vidage réussit et purge le registre', () => {
  const f = faux({ actuel: 'vides', registre: [ZIP, ...entreesActuel()] });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.deepEqual(f.registre(), [ZIP]);
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, 0);
});

test('mode groupe, registre encore en génération (migration non faite) : actuel/ mis à zéro, registre purgé, fichiers de la génération du registre effacés', () => {
  const f = faux({ actuel: { FOR_PUBL_FR: 0, PARC_PUBL_FR: 0, PRS_FR: 0 }, registre: [ZIP, ...entreesGeneration(H0)] });
  for (const c of CODES) { f.disque.set(`${CACHE}/${H0}/${c}.gpkg`, { n: NB[c], wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' }); f.disque.set(`${CACHE}/${H0}/${c}.qml`, 'style'); }
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.deepEqual(f.registre(), [ZIP]);
  for (const c of CODES) {
    assert.ok(!f.disque.has(`${CACHE}/${H0}/${c}.gpkg`) && !f.disque.has(`${CACHE}/${H0}/${c}.qml`), `${c} : ancienne génération effacée`);
    assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, 0);
    assert.equal(f.couchesProjet[c].n, 0);
  }
  sansSurprise(f);
  gardes(f);
});

// ------------------------------------------------------------------------------------------- V2-V4 mode groupe : échecs, retour arrière
test('V2 renommage refusé en cours de route : renommages inverses, actuels d\'origine remis, couches relues, registre inchangé, texte d\'échec, rien d\'autre touché', () => {
  const autres = zipsEtAutres();
  const registre = [ZIP, ...entreesActuel()];
  const f = faux({ actuel: ancienActuel, registre, disqueEnPlus: autres, panne: { renommerVers: [`${ACTUEL}/PARC_PUBL_FR.gpkg`] } });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec);
  assert.equal(typeof r.raison, 'string');
  assert.ok(r.raison.length > 0);
  for (const c of CODES) {
    assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, ancienActuel[c], `${c} : l'ancien cache est remis`);
    assert.ok(!f.disque.has(`${CACHE}/${H}/${c}.avant.gpkg`), 'plus de sauvegarde');
  }
  assert.deepEqual([...f.disque.keys()].filter((k) => k.startsWith(`${CACHE}/${H}/`)), [], 'génération effacée');
  assert.deepEqual(f.registre(), registre, 'registre inchangé, entrées du cache comprises');
  assert.deepEqual(CODES.map((c) => f.couchesProjet[c].n), [4, 53, 1], 'les couches affichent toujours l\'ancien cache');
  sansSurprise(f);
  gardes(f);
  intacts(f, autres);
});

test('V2 première mise de côté refusée : rien n\'a bougé, texte d\'échec', () => {
  const f = faux({ actuel: ancienActuel, registre: entreesActuel(), panne: { renommerVers: [`${CACHE}/${H}/FOR_PUBL_FR.avant.gpkg`] } });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec);
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, ancienActuel[c]);
  assert.deepEqual(f.registre().map((e) => e.chemin), CODES.map((c) => `actuel/${c}.gpkg`));
});

test('V2 reload sans effet (la couche affiche encore des objets) : bascule défaite, ancien cache remis et relu, registre inchangé, texte d\'échec', () => {
  const f = faux({ actuel: ancienActuel, registre: entreesActuel(), panne: { reloadSansEffet: 'PARC_PUBL_FR' } });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec);
  assert.match(r.raison, /PARC_PUBL_FR/);
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, ancienActuel[c], c);
  assert.ok(CODES.every((c) => f.couchesProjet[c].rechargements === 2), 'rechargées après la bascule puis après le retour arrière');
  assert.deepEqual(f.registre().map((e) => e.objets), [4, 53, 1]);
  sansSurprise(f);
});

test('V2 retour arrière lui-même refusé : texte d\'échec, raison « retour arrière incomplet », sauvegarde gardée, registre vidé des entrées du cache (zip gardé), note de reprise', () => {
  const f = faux({ actuel: { FOR_PUBL_FR: 2, PARC_PUBL_FR: 7, PRS_FR: 1 }, registre: [ZIP, ...entreesActuel()],
    panne: { renommerVers: [`${ACTUEL}/PRS_FR.gpkg`], renommerToujours: [`${ACTUEL}/PARC_PUBL_FR.gpkg`] } });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec, 'même texte d\'échec (choix de l\'orchestrateur), détail dans la raison');
  assert.match(r.raison, /retour arrière incomplet/);
  assert.ok(f.disque.has(`${CACHE}/${H}/PARC_PUBL_FR.avant.gpkg`), 'la sauvegarde n\'est pas effacée : elle est peut-être seule');
  assert.deepEqual(f.registre(), [ZIP], 'le registre ne dit plus ce qui s\'affiche (comme la 053)');
  const reprise = f.reglages.get(L.cleRegistre(ID) + '/reprise');
  assert.ok(reprise && JSON.parse(reprise).horodatage === H, 'note de reprise gardée pour l\'ouverture suivante');
});

test('V4 registre non écrit après une bascule réussie : bascule défaite (renommages inverses, reload), ancien cache gardé et non effacé, texte d\'échec', () => {
  const f = faux({ actuel: ancienActuel, registre: entreesActuel() });
  f.ctx.reglages.setValue = () => { throw new Error('réglages refusés'); };
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec);
  assert.match(r.raison, /registre non écrit/);
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, ancienActuel[c], c);
  assert.deepEqual(CODES.map((c) => f.couchesProjet[c].n), [4, 53, 1]);
  assert.ok(!f.journal.some((x) => /^effacé .*\.avant\.gpkg/.test(x)), 'l\'ancien cache n\'est jamais effacé tant que le registre n\'est pas écrit');
});

// ------------------------------------------------------------------------------------------- V3 gardes
test('V3 un -wal à côté d\'un GeoPackage actuel : refus avant toute écriture, renommage ou effacement ; texte d\'échec ; rien n\'est changé', () => {
  const f = faux({ actuel: ancienActuel, registre: entreesActuel() });
  f.disque.set(`${ACTUEL}/PARC_PUBL_FR.gpkg-wal`, 'x');
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec);
  assert.match(r.raison, /wal/);
  sansEcriture(f);
  assert.equal(f.disque.get(`${ACTUEL}/PARC_PUBL_FR.gpkg`).n, 53);
  assert.equal(f.registre().length, 3);
});

test('V3 note de reprise en attente : refus avant toute écriture, texte d\'échec', () => {
  const f = faux({ actuel: ancienActuel, registre: entreesActuel() });
  f.reglages.set(L.cleRegistre(ID) + '/reprise', JSON.stringify({ horodatage: H0, entrees: [] }));
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec);
  sansEcriture(f);
  assert.equal(f.registre().length, 3);
});

test('gardes d\'entrée : sans vision_id valide (absent, vide, non UUID, traversée) ou sans dossier de projet absolu, rien n\'est écrit ni effacé ni renommé, texte d\'échec, jamais d\'exception', () => {
  for (const visionId of [undefined, '', '../..', 'pas-un-uuid', null]) {
    for (const projet of [true, false]) {
      const f = faux({ actuel: ancienActuel, registre: projet ? entreesActuel() : entreesGeneration(H0), projet });
      f.ctx.visionId = visionId;
      const r = L.viderCacheOnf(f.ctx);
      assert.equal(r.ok, false, String(visionId));
      assert.equal(r.message, T.echec);
      sansEcriture(f);
      assert.ok(!f.journal.some((x) => /^RETIRÉ/.test(x)));
    }
  }
  const f = faux({ registre: entreesActuel() });
  f.ctx.dossierProjet = 'relatif';
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec);
  sansEcriture(f);
});

test('services du mode groupe absents (renommer, recharger) : refus net avec le texte d\'échec, ancien cache et registre gardés', () => {
  for (const s of ['renommer', 'recharger']) {
    const f = faux({ actuel: ancienActuel, registre: entreesActuel() });
    delete f.ctx[s];
    const r = L.viderCacheOnf(f.ctx);
    assert.equal(r.ok, false, s);
    assert.equal(r.message, T.echec, s);
    assert.equal(f.registre().length, 3, s);
    for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, ancienActuel[c], s);
  }
});

// ------------------------------------------------------------------------------------------- V5 mode ancien
const SUFFIXES = ['.gpkg', '.qml', '.gpkg-wal', '.gpkg-shm', '.gpkg.aux.xml'];
function ancien({ panne = {}, registre = [ZIP, ...entreesGeneration(H0)] } = {}) {
  const enPlus = zipsEtAutres();
  for (const c of CODES) for (const s of SUFFIXES) enPlus[`${CACHE}/${H0}/${c}${s}`] = s === '.gpkg' ? { n: NB[c], wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' } : 'annexe';
  const f = faux({ projet: false, actuel: {}, registre, panne, disqueEnPlus: enPlus });
  return { f, autres: zipsEtAutres() };
}

test('V5 mode ancien nominal : mise de côté, retrait de la carte, registre purgé, puis effacement ; dans cet ordre ; texte « Cache ONF vidé. »', () => {
  const { f, autres } = ancien();
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.equal(r.message, T.reussite);
  assert.deepEqual(r.restes ?? [], []);
  const renommes = f.journal.filter((x) => /^renommé /.test(x));
  assert.deepEqual(renommes, CODES.map((c) => `renommé ${CACHE}/${H0}/${c}.gpkg -> ${CACHE}/${H0}/${c}.avant.gpkg`));
  const i = (re) => f.journal.findIndex((x) => re.test(x));
  assert.equal(f.journal.filter((x) => x === 'RETIRÉ de la carte').length, 1, 'couches du plugin retirées une seule fois');
  assert.ok(f.journal.lastIndexOf(renommes[renommes.length - 1]) < i(/^RETIRÉ/), 'retrait de la carte après la mise de côté');
  assert.ok(i(/^RETIRÉ/) < i(/^registre /), 'registre purgé après le retrait');
  assert.ok(i(/^registre /) < i(/^effacé /), 'effacement après la purge du registre');
  assert.ok(!f.journal.some((x) => /^AJOUTÉ/.test(x)));
  assert.deepEqual(f.registre(), [ZIP]);
  const effaces = f.journal.filter((x) => /^effacé /.test(x)).map((x) => x.slice(7));
  for (const c of CODES) {
    for (const s of ['.avant.gpkg', '.qml', '.gpkg-wal', '.gpkg-shm', '.gpkg.aux.xml']) {
      assert.ok(effaces.includes(`${CACHE}/${H0}/${c}${s}`), `${c}${s} : effacement demandé`);
      assert.ok(!f.disque.has(`${CACHE}/${H0}/${c}${s}`), `${c}${s} : parti`);
    }
    assert.ok(!f.disque.has(`${CACHE}/${H0}/${c}.gpkg`));
  }
  assert.ok(effaces.every((p) => p.startsWith(`${CACHE}/${H0}/`)), 'effacements dans la génération du registre seulement');
  assert.ok(!f.journal.some((x) => /^(écrit|réécrit|rechargé) /.test(x)), 'aucun GeoPackage vide écrit, aucun reload en mode ancien');
  gardes(f);
  intacts(f, autres);
});

test('V5 mode ancien : les entrées de zip du registre restent (toutes), aucune fonction de dossier appelée', () => {
  const { f } = ancien({ registre: [ZIP, { ...ZIP, couche: 'Parcelles', chemin: 'Serre/Parcelles.gpkg' }, ...entreesGeneration(H0)] });
  assert.equal(L.viderCacheOnf(f.ctx).ok, true);
  assert.equal(f.registre().length, 2);
  assert.ok(f.registre().every((e) => !e.cache));
  assert.deepEqual(f.journal.filter((x) => /^DOSSIER/.test(x)), []);
});

test('V5 mode ancien : un fichier qui résiste n\'annule rien (cache retiré et sorti du registre) ; il est nommé dans le message', () => {
  const resiste = `${CACHE}/${H0}/PARC_PUBL_FR.qml`;
  const { f } = ancien({ panne: { effacerRate: [resiste] } });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.deepEqual(r.restes, ['PARC_PUBL_FR.qml']);
  assert.equal(r.message, restesDebut + 'PARC_PUBL_FR.qml.');
  assert.ok(f.journal.includes('RETIRÉ de la carte'));
  assert.deepEqual(f.registre(), [ZIP]);
  assert.ok(f.disque.has(resiste), 'le fichier est resté');
  assert.equal(f.disque.has(`${CACHE}/${H0}/FOR_PUBL_FR.avant.gpkg`), false, 'les autres sont effacés');
});

test('V5 mode ancien : plusieurs fichiers qui résistent sont tous nommés, séparés par « , », point final, sans dossier', () => {
  const rates = [`${CACHE}/${H0}/FOR_PUBL_FR.avant.gpkg`, `${CACHE}/${H0}/PRS_FR.gpkg-wal`];
  const { f } = ancien({ panne: { effacerRate: rates } });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, true, r.raison);
  assert.deepEqual([...r.restes].sort(), ['FOR_PUBL_FR.avant.gpkg', 'PRS_FR.gpkg-wal']);
  assert.match(r.message, /^Cache ONF vidé\. Fichiers restés sur l'appareil : (FOR_PUBL_FR\.avant\.gpkg, PRS_FR\.gpkg-wal|PRS_FR\.gpkg-wal, FOR_PUBL_FR\.avant\.gpkg)\.$/);
});

test('V5 mode ancien : mise de côté refusée en cours de route : renommages inverses, rien n\'a changé (couches non retirées, registre inchangé), texte d\'échec', () => {
  const registre = [ZIP, ...entreesGeneration(H0)];
  const { f, autres } = ancien({ registre, panne: { renommerVers: [`${CACHE}/${H0}/PRS_FR.avant.gpkg`] } });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec);
  for (const c of CODES) {
    assert.equal(f.disque.get(`${CACHE}/${H0}/${c}.gpkg`).n, NB[c], `${c} remis à sa place`);
    assert.ok(!f.disque.has(`${CACHE}/${H0}/${c}.avant.gpkg`));
  }
  assert.ok(!f.journal.some((x) => /^RETIRÉ/.test(x)), 'les couches ne sont pas retirées avant que tout soit sûr');
  assert.ok(!f.journal.some((x) => /^effacé /.test(x)));
  assert.deepEqual(f.registre(), registre);
  gardes(f);
  intacts(f, autres);
});

test('V6 mode ancien dont le registre pointe actuel/ : refus avec le texte d\'échec, rien d\'effacé ni renommé ni retiré, fichiers d\'actuel/ intacts', () => {
  const registre = [ZIP, ...entreesActuel()];
  const f = faux({ projet: false, actuel: ancienActuel, registre, disqueEnPlus: zipsEtAutres() });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec);
  assert.equal(typeof r.raison, 'string');
  sansEcriture(f);
  assert.ok(!f.journal.some((x) => /^RETIRÉ/.test(x)));
  for (const c of CODES) assert.equal(f.disque.get(`${ACTUEL}/${c}.gpkg`).n, ancienActuel[c], c);
  assert.deepEqual(f.registre(), registre);
});

test('V6 mode ancien, registre mêlé (une entrée sur actuel/, deux en génération) : refus, rien touché', () => {
  const e = entreesActuel();
  const mixte = [e[0], ...entreesGeneration(H0).slice(1)];
  const { f } = ancien({ registre: mixte });
  for (const c of CODES) f.disque.set(`${ACTUEL}/${c}.gpkg`, { n: NB[c], wkb: L.coucheOnf(c).wkb, authid: 'EPSG:2154' });
  const r = L.viderCacheOnf(f.ctx);
  assert.equal(r.ok, false);
  assert.equal(r.message, T.echec);
  sansEcriture(f);
  assert.deepEqual(f.registre(), mixte);
});

test('mode ancien : service de renommage ou de retrait de la carte absent : refus net avec le texte d\'échec, rien d\'effacé, registre inchangé', () => {
  for (const s of ['renommer', 'retirerCacheDeLaCarte']) {
    const { f } = ancien();
    delete f.ctx[s];
    const r = L.viderCacheOnf(f.ctx);
    assert.equal(r.ok, false, s);
    assert.equal(r.message, T.echec, s);
    assert.equal(f.registre().length, 4, s);
    assert.ok(!f.journal.some((x) => /^effacé /.test(x)), s);
  }
});

// ------------------------------------------------------------------------------------------- V7 jamais touchés
test('V7 les gardes de la 053 s\'appliquent : zips importés, saisie.gpkg, vision.qgz, dernier-echec.txt et actuel/ ne sont jamais acceptés à l\'effacement', () => {
  for (const p of [`${IMPORTS}/Serre/UG.gpkg`, `${IMPORTS}/Serre.zip`, `${PROJET}/saisie.gpkg`, `${PROJET}/vision.qgz`, `${PROJET}/dernier-echec.txt`, `${ACTUEL}/PRS_FR.gpkg`]) {
    assert.equal(L.peutToucherCache(p, IMPORTS), false, p);
  }
  assert.equal(L.peutToucherCache(`${CACHE}/${H0}/PRS_FR.avant.gpkg`, IMPORTS), true);
});

test('V7 aucun cas (groupe nominal, groupe en échec, ancien nominal) ne touche ni un zip importé, ni saisie.gpkg, ni vision.qgz, ni dernier-echec.txt', () => {
  const cas = [
    faux({ actuel: ancienActuel, registre: [ZIP, ...entreesActuel()], disqueEnPlus: zipsEtAutres() }),
    faux({ actuel: ancienActuel, registre: [ZIP, ...entreesActuel()], disqueEnPlus: zipsEtAutres(), panne: { renommerVers: [`${ACTUEL}/PRS_FR.gpkg`] } }),
    ancien().f,
  ];
  for (const f of cas) {
    L.viderCacheOnf(f.ctx);
    gardes(f);
    intacts(f, zipsEtAutres());
  }
});

// ------------------------------------------------------------------------------------------- pont QML (texte des sources : contrat à valider)
const qml = (f) => lire(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('V8 Vision.qml : appelle Logique.viderCacheOnf avec les services du cache, expose viderEnCours, jamais deleteLater (inopérant sous Qt 6.10), removeMapLayer pour le mode ancien', () => {
  const q = qml('plugin/Vision.qml');
  assert.ok(q.includes('Logique.viderCacheOnf'), 'Logique.viderCacheOnf absent');
  assert.match(q, /property bool viderEnCours/);
  const debut = q.indexOf('function viderCacheOnf');
  assert.ok(debut >= 0, 'function viderCacheOnf absente de Vision.qml');
  const fin = q.indexOf('\n    function ', debut + 10);
  const corps = q.slice(debut, fin < 0 ? undefined : fin);
  assert.match(corps, /servicesCache\(\)/);
  assert.ok(!corps.includes('deleteLater'));
  assert.ok(q.includes('ProjectUtils.removeMapLayer'));
});

test('V8 Panneau.qml : confirmation dans le panneau (ni Popup ni Dialog), minuteur de 15 s, un seul appel de vidage, bouton grisé pendant le vidage, visible seulement si un cache est inscrit', () => {
  const p = qml('plugin/Panneau.qml');
  assert.match(p, /confirmationVider\s*=\s*true/, 'le premier toucher ouvre la confirmation');
  assert.match(p, /confirmationVider\s*=\s*false/, 'Non, garder et la minuterie la referment');
  assert.match(p, /viderEnCours/);
  assert.match(p, /viderCacheVisible/);
  assert.match(p, /VIDER_CONFIRMATION_DELAI_MS|15000/);
  assert.match(p, /Timer/);
  assert.ok(!/\b(Popup|Dialog|MessageDialog)\b/.test(p), 'aucune fenêtre bloquante dans le panneau');
  assert.equal((p.match(/viderCacheOnf\(\)/g) || []).length, 1, 'un seul point d\'appel : le bouton « Oui, vider »');
});
