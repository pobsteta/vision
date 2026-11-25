// SPDX-License-Identifier: GPL-3.0-or-later
// Vision, plugin QField d'application (mission 008) : fabrique plugin-vision.zip, à installer par URL.
// main.qml à la racine du zip (exigence de QField : src/app/qfpluginmanager.cpp L441-448,
// v4.3.7). Le nom « plugin-vision.zip » donne le dossier du plugin « plugin-vision » (L452) : ne pas le renommer
// (mission 028 ; l'ancien « Vision », dossier « vision », est à désinstaller une fois).
// Le zip n'est pas versé au dépôt : il est publié en release par
// .github/workflows/release-plugin.yml (décision de Pascal n° 2, 3 novembre 2026).
//
// Usage : node plugin/empaqueter.mjs <dossier-de-sortie>   (obligatoire : rien n'est écrit
// dans le dépôt par défaut)
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireZip } from '../tests/recette/essai/zip-ecrire.mjs';
import { CACHE_ONF } from './vision-logique.mjs';

const ici = dirname(fileURLToPath(import.meta.url));

export const FICHIERS_PLUGIN = ['main.qml', 'Vision.qml', 'Panneau.qml', 'vision-logique.mjs', 'vision-controles.mjs', 'vision-styles.mjs', 'vision-bibliotheque.mjs', 'vision-styles-onf.mjs', 'metadata.txt', 'icon.svg'];

const entree = (nom) => ({ nom: Buffer.from(nom, 'utf8'), donnees: readFileSync(join(ici, nom)), stocke: false, utf8: true });

// Mission 052 : la bibliothèque de styles (plugin/styles/*.qml, fournis par Pascal, jamais modifiés) est embarquée dans
// un module JavaScript, car QField 4.3.7 ne laisse pas un plugin lire un fichier de son propre dossier
// (src/core/utils/qffileutils.cpp l. 620-628 : readFileContent refuse hors du dossier du projet). Le module est
// versionné (le plugin se charge tel quel depuis le dépôt) ; tests/bibliotheque-052.test.mjs vérifie qu'il est
// identique à ce que cette fonction génère. Pour le régénérer : node plugin/empaqueter.mjs --bibliotheque
export function genererBibliotheque() {
  const dossier = join(ici, 'styles');
  const noms = readdirSync(dossier).filter((f) => f.endsWith('.qml')).map((f) => f.slice(0, -4)).sort();
  const echapper = (t) => JSON.stringify(t).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const lignes = noms.map((n) => `  ${echapper(n)}: ${echapper(readFileSync(join(dossier, n + '.qml'), 'utf8'))},`);
  return `// SPDX-License-Identifier: GPL-3.0-or-later
// Vision, plugin QField d'application (mission 052) : bibliothèque de styles modèles, fournis par Pascal.
// FICHIER GÉNÉRÉ par plugin/empaqueter.mjs depuis plugin/styles/*.qml : ne pas le modifier à la main
// (node plugin/empaqueter.mjs --bibliotheque le régénère ; un test le compare au dossier).
// Module pur, sans import : { nom du fichier sans « .qml » : texte du .qml }.
export const BIBLIOTHEQUE = {
${lignes.join('\n')}
};
`;
}

// Mission 053, étape 1 ter : styles du cache ONF, adaptés aux champs réels du service (arbitrages n° 3 et 4 de Pascal) depuis
// les trois .qml fournis par Pascal (docs/referentiels/brut/onf/, jamais modifiés). Seuls changent : l'étiquette des forêts
// (CCOD_FRT, absent du service, devient iidtn_frt), la casse de l'étiquette des parcelles (ccod_prf), et la description
// des champs des points de rencontre (formulaire : les 13 champs réels, mêmes réglages pour chacun ; aperçu desc_prsf ->
// llib_prs ; champ de durée du temporel, désactivé, lat -> qlat_prs). Symboles, couleurs et seuils inchangés.
// Module versionné comme la bibliothèque (tests/cache-onf-053.test.mjs le compare). Régénérer : node plugin/empaqueter.mjs --styles-onf
const ONF = join(ici, '..', 'docs', 'referentiels', 'brut', 'onf');
export const SOURCES_STYLES_ONF = { FOR_PUBL_FR: 'RDF_FRT.qml', PARC_PUBL_FR: 'RDF_Parc.qml', PRS_FR: 'Point_de_rencontre_des_secours_en_frt.qml' };
// Champs du style des points de Pascal, dans son ordre (fieldConfiguration).
export const CHAMPS_PRS_DU_STYLE = ['gid', 'desc_prsf', 'code_prsf', 'panneau', 'nom_com', 'coord_dfci', 'insee_com', 'code_dep', 'lat', 'lon',
  'reseau_tel', 'accessible', 'stationnement', 'risque_tel', 'gestionnaire'];
const SECTIONS_CHAMPS = ['fieldConfiguration', 'aliases', 'splitPolicies', 'duplicatePolicies', 'defaults', 'constraints', 'constraintExpressions',
  'columns', 'editable', 'labelOnTop', 'reuseLastValue'];

function remplacerUneFois(texte, avant, apres) {
  const n = texte.split(avant).length - 1;
  if (n !== 1) throw new Error(`style ONF : « ${avant} » trouvé ${n} fois (1 attendu)`);
  return texte.replace(avant, () => apres);
}

// Champ d'une entrée de section : le seul ancien champ cité entre guillemets.
function champDeLEntree(entree, anciens) {
  const vus = anciens.filter((f) => entree.includes(`"${f}"`));
  return vus.length === 1 ? vus[0] : null;
}

// Refait une section par champ : chaque entrée des anciens champs doit être la même aux noms (et index) près ; elle est
// reprise pour chaque champ réel, dans l'ordre du service. Les lignes sans champ (colonne « actions ») restent à la fin.
function refaireSection(texte, balise, anciens, nouveaux) {
  const ouvre = new RegExp(`\\n( *)<${balise}>\\n`);
  const m = ouvre.exec(texte);
  if (!m) throw new Error(`style ONF : section <${balise}> absente`);
  const debut = m.index + m[0].length;
  const fin = texte.indexOf(`\n${m[1]}</${balise}>`, debut);
  if (fin < 0) throw new Error(`style ONF : section <${balise}> non fermée`);
  const lignes = texte.slice(debut, fin + 1).split('\n').slice(0, -1);
  const entrees = [];
  const autres = [];
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const bloc = /^( *)<field name="[^"]+"[^/]*>$/.exec(l);
    if (bloc) {
      let j = i;
      while (j < lignes.length && lignes[j] !== `${bloc[1]}</field>`) j++;
      if (j === lignes.length) throw new Error(`style ONF : <field> non fermé dans <${balise}>`);
      entrees.push(lignes.slice(i, j + 1).join('\n'));
      i = j;
    } else if (champDeLEntree(l, anciens) !== null) {
      entrees.push(l);
    } else {
      autres.push(l);
    }
  }
  const champs = entrees.map((e) => champDeLEntree(e, anciens));
  if ([...champs].sort().join(',') !== [...anciens].sort().join(',')) throw new Error(`style ONF : <${balise}> ne décrit pas les ${anciens.length} champs attendus`);
  const modele = (e, f) => e.split(`"${f}"`).join('"@CHAMP@"').replace(/ index="\d+"/, ' index="@INDEX@"');
  const gabarit = modele(entrees[0], champs[0]);
  for (let i = 1; i < entrees.length; i++) {
    if (modele(entrees[i], champs[i]) !== gabarit) throw new Error(`style ONF : réglages différents d'un champ à l'autre dans <${balise}> (${champs[i]})`);
  }
  const refaites = nouveaux.map((f, i) => gabarit.split('"@CHAMP@"').join(`"${f}"`).replace(' index="@INDEX@"', ` index="${i}"`));
  return texte.slice(0, debut) + refaites.concat(autres).join('\n') + '\n' + texte.slice(fin + 1);
}

export function adapterStyleOnf(couche, texte) {
  if (couche === 'FOR_PUBL_FR') return remplacerUneFois(texte, 'fieldName="CCOD_FRT"', 'fieldName="iidtn_frt"');
  if (couche === 'PARC_PUBL_FR') return remplacerUneFois(texte, 'fieldName="CCOD_PRF"', 'fieldName="ccod_prf"');
  if (couche !== 'PRS_FR') throw new Error('style ONF : couche inconnue ' + couche);
  const nouveaux = CACHE_ONF.couches.filter((c) => c.couche === 'PRS_FR')[0].champs;
  let t = texte;
  for (const s of SECTIONS_CHAMPS) t = refaireSection(t, s, CHAMPS_PRS_DU_STYLE, nouveaux);
  t = remplacerUneFois(t, '<previewExpression>"desc_prsf"</previewExpression>', '<previewExpression>"llib_prs"</previewExpression>');
  t = remplacerUneFois(t, 'durationField="lat"', 'durationField="qlat_prs"');
  for (const f of CHAMPS_PRS_DU_STYLE) if (t.includes(`"${f}"`)) throw new Error(`style ONF : champ ${f} encore cité`);
  return t;
}

export function genererStylesOnf() {
  const echapper = (t) => JSON.stringify(t).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const lignes = Object.keys(SOURCES_STYLES_ONF).map((c) => `  ${echapper(c)}: ${echapper(adapterStyleOnf(c, readFileSync(join(ONF, SOURCES_STYLES_ONF[c]), 'utf8')))},`);
  return `// SPDX-License-Identifier: GPL-3.0-or-later
// Vision, plugin QField d'application (mission 053, étape 1 ter) : styles du cache des couches ONF.
// FICHIER GÉNÉRÉ par plugin/empaqueter.mjs depuis les .qml de Pascal (docs/referentiels/brut/onf/), adaptés aux champs réels
// du service : ne pas le modifier à la main (node plugin/empaqueter.mjs --styles-onf le régénère ; un test le compare).
// Module pur, sans import : { couche du service : texte du .qml adapté }.
export const STYLES_ONF = {
${lignes.join('\n')}
};
`;
}

const GENERES = { 'vision-bibliotheque.mjs': genererBibliotheque, 'vision-styles-onf.mjs': genererStylesOnf };
const fichierPlugin = (nom) => (Object.prototype.hasOwnProperty.call(GENERES, nom)
  ? { nom: Buffer.from(nom, 'utf8'), donnees: Buffer.from(GENERES[nom](), 'utf8'), stocke: false, utf8: true }
  : entree(nom));

export function empaqueter(sortie) {
  mkdirSync(sortie, { recursive: true });
  const chemin = join(sortie, 'plugin-vision.zip');
  writeFileSync(chemin, ecrireZip(FICHIERS_PLUGIN.map(fichierPlugin)));
  return { chemin, taille: statSync(chemin).size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv[2] === '--bibliotheque') {
    writeFileSync(join(ici, 'vision-bibliotheque.mjs'), genererBibliotheque());
    console.log('écrit : plugin/vision-bibliotheque.mjs');
    process.exit(0);
  }
  if (process.argv[2] === '--styles-onf') {
    writeFileSync(join(ici, 'vision-styles-onf.mjs'), genererStylesOnf());
    console.log('écrit : plugin/vision-styles-onf.mjs');
    process.exit(0);
  }
  if (!process.argv[2]) {
    console.error('usage : node plugin/empaqueter.mjs <dossier-de-sortie>   |   node plugin/empaqueter.mjs --bibliotheque   |   node plugin/empaqueter.mjs --styles-onf');
    process.exit(2);
  }
  const r = empaqueter(process.argv[2]);
  console.log(`écrit : ${r.chemin} (${r.taille} octets)`);
}
