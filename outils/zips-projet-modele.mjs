#!/usr/bin/env node
// Mission 021 : fabrique les deux zips du projet modèle (décision de Pascal n° 1, 3 novembre 2026).
//   projet-vision-mise-a-jour.zip = vision.qgz seul : MISE À JOUR, par copie de vision.qgz à la main (câble USB)
//                                 dans le dossier du projet (mission 028 : QField importe un zip dans un dossier
//                                 neuf, sans les points saisis). Sans saisie.gpkg : ne peut rien écraser.
//   projet-vision.zip             = vision.qgz + saisie.gpkg vide : PREMIÈRE INSTALLATION, une seule fois par
//                                 appareil (un saisie.gpkg rempli recopié serait perdu).
// Mission 053, étape 3 (arbitrage de Pascal, 25 novembre 2026) : la première installation contient aussi les trois GeoPackage vides
// du groupe « ONF Cache » (vision-imports/_cache-onf/actuel/<couche>.gpkg : sans eux, QField afficherait « Unable to load some layers »).
// La mise à jour ne les contient JAMAIS (elle écraserait un cache rempli) : garde-fou ci-dessous.
// Déterministe (dates MS-DOS fixes, ordre fixe). Écrit pour Vision, sans dépendance.
// Usage : node outils/zips-projet-modele.mjs <dossier-de-sortie> [dossier-des-sources (défaut : racine du dépôt)]
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireZip } from '../tests/recette/essai/zip-ecrire.mjs';
import { COUCHES_CACHE_ONF, DOSSIER_CACHE_FIXE, ecrireGpkgCacheVide } from './projet-modele.mjs';

export const ZIP_MISE_A_JOUR = 'projet-vision-mise-a-jour.zip';
export const ZIP_PREMIERE_INSTALLATION = 'projet-vision.zip';
export const NOM_QGZ = 'vision.qgz', NOM_GPKG = 'saisie.gpkg';
// Membres du cache vide, dans l'ordre forêts, parcelles, points (ordre fixe : zip déterministe).
export const MEMBRES_CACHE = ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR'].map((c) => `${DOSSIER_CACHE_FIXE}/${c}.gpkg`);

const entree = (nom, donnees) => ({ nom: Buffer.from(nom, 'utf8'), donnees, stocke: false, utf8: true });

// Noms des membres d'un zip (répertoire central), pour le garde-fou.
export function nomsDuZip(buf) {
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('pas un zip (fin de répertoire introuvable)');
  const n = buf.readUInt16LE(fin + 10); let p = buf.readUInt32LE(fin + 16); const noms = [];
  for (let i = 0; i < n; i++) {
    const lf = buf.readUInt16LE(p + 28), lx = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32);
    noms.push(buf.toString('utf8', p + 46, p + 46 + lf)); p += 46 + lf + lx + lc;
  }
  return noms;
}

// Garde-fou : le zip de mise à jour ne doit JAMAIS contenir saisie.gpkg (même dans un sous-dossier).
export function verifierMiseAJour(buf) {
  const noms = nomsDuZip(buf);
  if (noms.some((n) => /(^|\/)saisie\.gpkg$/i.test(n))) throw new Error(`${ZIP_MISE_A_JOUR} contient saisie.gpkg : il écraserait les points saisis sur l'appareil`);
  if (noms.some((n) => /(^|\/)_cache-onf(\/|$)/i.test(n))) throw new Error(`${ZIP_MISE_A_JOUR} contient le cache ONF : il écraserait le cache rempli sur l'appareil`);
  if (noms.length !== 1 || noms[0] !== NOM_QGZ) throw new Error(`${ZIP_MISE_A_JOUR} doit contenir vision.qgz seul, trouvé : ${JSON.stringify(noms)}`);
}
export function verifierPremiereInstallation(buf) {
  const noms = nomsDuZip(buf).sort();
  const attendus = [NOM_QGZ, NOM_GPKG, ...MEMBRES_CACHE].sort();
  if (JSON.stringify(noms) !== JSON.stringify(attendus)) {
    throw new Error(`${ZIP_PREMIERE_INSTALLATION} doit contenir vision.qgz, saisie.gpkg et le cache ONF vide (${MEMBRES_CACHE.join(', ')}), trouvé : ${JSON.stringify(noms)}`);
  }
}

// Les trois GeoPackage vides du groupe « ONF Cache », écrits par l'outil du projet modèle (contenu identique à chaque exécution).
export function gpkgCacheVides() {
  const d = mkdtempSync(join(tmpdir(), 'vision-cache-vide-'));
  try {
    return MEMBRES_CACHE.map((nom, i) => {
      const code = ['FOR_PUBL_FR', 'PARC_PUBL_FR', 'PRS_FR'][i];
      if (!COUCHES_CACHE_ONF.some((c) => c.couche === code)) throw new Error(`couche du cache inconnue : ${code}`);
      const f = join(d, code + '.gpkg');
      ecrireGpkgCacheVide(f, code);
      return { nom, donnees: readFileSync(f) };
    });
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

export function fabriquerZips(sortie, sources) {
  const qgz = readFileSync(join(sources, NOM_QGZ)), gpkg = readFileSync(join(sources, NOM_GPKG));
  const miseAJour = ecrireZip([entree(NOM_QGZ, qgz)]);
  const premiere = ecrireZip([entree(NOM_QGZ, qgz), entree(NOM_GPKG, gpkg), ...gpkgCacheVides().map((m) => entree(m.nom, m.donnees))]);
  verifierMiseAJour(miseAJour); verifierPremiereInstallation(premiere);
  mkdirSync(sortie, { recursive: true });
  const a = join(sortie, ZIP_MISE_A_JOUR), b = join(sortie, ZIP_PREMIERE_INSTALLATION);
  writeFileSync(a, miseAJour); writeFileSync(b, premiere);
  return { miseAJour: a, premiereInstallation: b };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , sortie, sources = fileURLToPath(new URL('..', import.meta.url))] = process.argv;
  if (!sortie) { console.error('Usage : node outils/zips-projet-modele.mjs <dossier-de-sortie> [dossier-des-sources]'); process.exit(2); }
  const r = fabriquerZips(sortie, sources);
  console.log(`écrit : ${r.miseAJour}\nécrit : ${r.premiereInstallation}`);
}
