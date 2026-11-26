// SPDX-License-Identifier: GPL-3.0-or-later
// Vision, plugin QField d'application : la logique du squelette (mission 008).
// Écrit pour Vision (ADR 0006) ; le lecteur de zip, la table CP437 et le décodeur UTF-8 sont
// repris du prototype n° 1 (le module zip du prototype n° 1 dans `prototype/`, nom d'origine, ADR 0009 ; code de Vision, prouvé sur le Samsung).
// Module ECMAScript pur, sans .pragma, sans .import, sans aucun import : chargé à la fois
// par QML (Vision.qml) et par Node (tests/squelette.test.mjs, tests/plugin.test.mjs), ADR 0005.
// Prudence de syntaxe pour le moteur JavaScript de QML : ni chaînage optionnel, ni
// coalescence des nuls, ni séparateur de chiffres, ni TextDecoder.
//
// Contrat validé par Pascal le 3 novembre 2026 (tête de tests/squelette.test.mjs) ;
// décisions de Pascal sur le plan : pilotage/missions/008-squelette-plugin.md.
// Aucune fonction ne touche QField : tout passe par les objets reçus (réglages, chargerCouche,
// existe, platformUtilities), que Vision.qml branche sur l'API de QField (plugin/PLAN.md § 5).

export const VERSION = '0.7.0';

// Mission 038 : comptage des entités par itérateur. Dans QGIS 3a92eb3, `featureCount()` (qgsvectorlayer.h l. 1701,
// `long long featureCount() const final;`) n'est ni Q_PROPERTY ni Q_INVOKABLE : QML ne peut pas l'appeler. QField v4.3.7
// expose `LayerUtils.createFeatureIterator(couche)` (qflayerutils.h l. 234), dont l'itérateur a hasNext(), next() et
// close() invocables (l. 52-75). `creerIterateur` est ce service, passé en paramètre (testable sans QField).
// Le contrôle 4 n'a besoin que de « vide » (0) ou « non vide » (au moins 1) : on s'arrête à la PREMIÈRE entité
// (plafond = 1), sans parcourir une grosse couche. nbEntites ne sert qu'à ce contrôle 4 : valeur 0 ou 1, jamais un total.
// Un itérateur impossible à créer ou qui lève rend { lisible: false } (contrôle 2, « illisible »), jamais « vide ».
// L'itérateur est toujours fermé.
export const PLAFOND_COMPTAGE = 1;
export function compterEntites(couche, creerIterateur) {
  let it = null;
  let nbEntites = 0;
  let lisible = true;
  try {
    it = creerIterateur(couche);
    if (!it) throw new Error('itérateur absent');
    while (nbEntites < PLAFOND_COMPTAGE && it.hasNext()) {
      it.next();
      nbEntites++;
    }
  } catch (e) {
    lisible = false;
    nbEntites = -1;
  }
  if (it) {
    try { it.close(); } catch (e) { /* fermeture sans effet sur le résultat */ }
  }
  return { lisible: lisible, nbEntites: nbEntites };
}

// Emprise d'une couche { xmin, ymin, xmax, ymax } (mission 037). Dans QGIS 3a92eb3, `extent` est une MÉTHODE
// (`Q_INVOKABLE virtual QgsRectangle extent() const`, qgsmaplayer.h l. 564), pas une propriété : `couche.extent` vaut
// alors une fonction, dont xMinimum est undefined. On l'appelle donc si c'est une fonction ; sinon on la lit telle quelle.
export function lireEmprise(couche) {
  let x = couche.extent;
  if (typeof x === 'function') x = couche.extent();
  return { xmin: Number(x.xMinimum), ymin: Number(x.yMinimum), xmax: Number(x.xMaximum), ymax: Number(x.yMaximum) };
}

// Mission 034 : jugement de validité du système de coordonnées d'une couche, d'après ce que QML voit.
// QGIS (commit 3a92eb3, embarqué par QField 4.3.7, src/core/proj/qgscoordinatereferencesystem.h, l. 218-223) n'expose
// à QML que mapUnits, isGeographic, authid et description (Q_PROPERTY) ; isValid() (l. 588) n'est ni Q_PROPERTY ni
// Q_INVOKABLE : crs.isValid vaut undefined côté QML. Règle : valide si authid non vide, à défaut si description non vide.
// `crs` est rendu tel quel (reprojection) ; epsg est tiré de authid (0 si pas de forme « EPSG:n »).
export function decrireSysteme(crs) {
  let authid = '';
  let description = '';
  try {
    authid = String(crs.authid || '').trim();
    description = String(crs.description || '').trim();
  } catch (e) {
    return { valide: false, epsg: 0, authid: '', crs: crs };
  }
  const m = /^EPSG:(\d+)$/.exec(authid);
  return { valide: authid !== '' || description !== '', epsg: m ? Number(m[1]) : 0, authid: authid, crs: crs };
}

// Dossier des copies, sous le dossier du projet : repli de la spec § 9 n° 1 appliqué par Pascal le
// 3 novembre 2026 (spec § 3.3, ADR 0003 et 0007) : QField 4.3.7 refuse à un plugin de lire hors
// du dossier projet (src/core/utils/qffileutils.cpp L620-628), vu à l'essai du squelette.
export const NOM_DOSSIER_COPIES = 'vision-imports';

// Décision de Pascal n° 6 (3 novembre 2026) : plafond de listage d'un zip, 10 Mo, soit la
// valeur du prototype (le module zip du prototype n° 1 dans `prototype/`, nom d'origine, ADR 0009 ; SEUIL_LECTURE_OCTETS = 10 000 000 octets).
// Mission 052 (Pascal, 6 novembre 2026) : le plafond passe à 100 Mo (spec § 11 n° 1).
export const PLAFOND_LISTAGE_OCTETS = 100000000;

// Style inscrit au registre quand aucune règle ne s'applique ; sinon le nom de la règle (UG,
// Parcelles, FRT, ProdBois) ou 'qml' (mission 010, plugin/vision-styles.mjs).
export const STYLE_DEFAUT = 'defaut';
export const STYLE_QML = 'qml';
// Mission 047 : style enregistré dans le GeoPackage du zip (table layer_styles).
export const STYLE_GPKG = 'gpkg';
// Mission 052 : style de la bibliothèque du plugin (plugin/vision-bibliotheque.mjs, généré depuis plugin/styles/).
export const STYLE_BIBLIOTHEQUE = 'bibliotheque';

// --------------------------------------------------------------------------- octets

// Rend un Uint8Array à partir de ce que rend QML (QByteArray → ArrayBuffer en Qt 6) ou Node
// (Buffer, Uint8Array). Un QByteArray vide arrive en ArrayBuffer vide, et le moteur de Qt 6
// lève « Type error » sur new Uint8Array() d'un tel tampon (prototype, PLAN.md § 10 bis n° 6).
export function octetsDe(valeur) {
  if (valeur instanceof Uint8Array) return valeur;
  if (valeur instanceof ArrayBuffer) return valeur.byteLength === 0 ? new Uint8Array(0) : new Uint8Array(valeur);
  if (valeur && ArrayBuffer.isView(valeur)) return new Uint8Array(valeur.buffer, valeur.byteOffset, valeur.byteLength);
  const type = valeur === null ? 'null' : typeof valeur;
  throw new Error(`octets illisibles : type reçu « ${type} », attendu ArrayBuffer ou Uint8Array`);
}

function lire16(o, i) {
  return o[i] | (o[i + 1] << 8);
}

function lire32(o, i) {
  return (o[i] | (o[i + 1] << 8) | (o[i + 2] << 16)) + o[i + 3] * 0x1000000;
}

// --------------------------------------------------------------------------- noms

// Table CP437, octets 0x80 à 0xFF, en points de code Unicode. Source : codec cp437 de
// Python 3.13.18 (« generated from VENDORS/MICSFT/PC/CP437.TXT », fichier publié par l'Unicode
// Consortium), contrôlée identique à iconv de la glibc 2.39 (prototype, 2 novembre 2026).
const CP437_HAUT = [
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7,
  0x00ea, 0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5,
  0x00c9, 0x00e6, 0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9,
  0x00ff, 0x00d6, 0x00dc, 0x00a2, 0x00a3, 0x00a5, 0x20a7, 0x0192,
  0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x00f1, 0x00d1, 0x00aa, 0x00ba,
  0x00bf, 0x2310, 0x00ac, 0x00bd, 0x00bc, 0x00a1, 0x00ab, 0x00bb,
  0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556,
  0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b, 0x2510,
  0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f,
  0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567,
  0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b,
  0x256a, 0x2518, 0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580,
  0x03b1, 0x00df, 0x0393, 0x03c0, 0x03a3, 0x03c3, 0x00b5, 0x03c4,
  0x03a6, 0x0398, 0x03a9, 0x03b4, 0x221e, 0x03c6, 0x03b5, 0x2229,
  0x2261, 0x00b1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00f7, 0x2248,
  0x00b0, 0x2219, 0x00b7, 0x221a, 0x207f, 0x00b2, 0x25a0, 0x00a0,
];

function decoderCp437(octets) {
  let s = '';
  for (let i = 0; i < octets.length; i++) {
    const b = octets[i];
    s += String.fromCharCode(b < 0x80 ? b : CP437_HAUT[b - 0x80]);
  }
  return s;
}

// Décodeur UTF-8 (QML n'offre pas TextDecoder). Octet invalide : U+FFFD.
function decoderUtf8(octets) {
  let s = '';
  let i = 0;
  const n = octets.length;
  const suite = (k) => k < n && (octets[k] & 0xc0) === 0x80;
  while (i < n) {
    const b = octets[i];
    let cp = -1;
    let long = 1;
    if (b < 0x80) {
      cp = b;
    } else if (b >= 0xc2 && b <= 0xdf && suite(i + 1)) {
      cp = ((b & 0x1f) << 6) | (octets[i + 1] & 0x3f); long = 2;
    } else if (b >= 0xe0 && b <= 0xef && suite(i + 1) && suite(i + 2)) {
      cp = ((b & 0x0f) << 12) | ((octets[i + 1] & 0x3f) << 6) | (octets[i + 2] & 0x3f); long = 3;
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) cp = -1;
    } else if (b >= 0xf0 && b <= 0xf4 && suite(i + 1) && suite(i + 2) && suite(i + 3)) {
      cp = ((b & 0x07) << 18) | ((octets[i + 1] & 0x3f) << 12) | ((octets[i + 2] & 0x3f) << 6) | (octets[i + 3] & 0x3f); long = 4;
      if (cp < 0x10000 || cp > 0x10ffff) cp = -1;
    }
    if (cp < 0) { s += '�'; i += 1; continue; }
    s += String.fromCodePoint(cp);
    i += long;
  }
  return s;
}

// Texte UTF-8 d'un contenu d'octets (un .json, un .qml lus dans le zip).
export function texteDe(valeur) {
  return decoderUtf8(octetsDe(valeur));
}

// Octets UTF-8 d'un texte (le moteur de QML n'a pas TextEncoder), pour écrire un .qml ou un GML reçu.
// Mission 053 : deux passes (longueur, puis remplissage d'un Uint8Array de la taille exacte), au lieu d'un tableau
// JavaScript d'un nombre par octet : le pic de mémoire relevé pour le GML reçu (docs/referentiels/cache-zone-qfield.md
// § 1.3) tombe à la taille du résultat. Même sortie qu'avant (tests/cache-onf-053.test.mjs).
function pointDeCode(t, i) {
  const c = t.charCodeAt(i);
  if (c >= 0xd800 && c <= 0xdbff && i + 1 < t.length) {
    const d = t.charCodeAt(i + 1);
    if (d >= 0xdc00 && d <= 0xdfff) return { c: 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00), n: 2 };
  }
  return { c: c, n: 1 };
}

export function octetsUtf8(texte) {
  const t = String(texte);
  let longueur = 0;
  for (let i = 0; i < t.length;) {
    const p = pointDeCode(t, i);
    longueur += p.c < 0x80 ? 1 : (p.c < 0x800 ? 2 : (p.c < 0x10000 ? 3 : 4));
    i += p.n;
  }
  const sortie = new Uint8Array(longueur);
  let k = 0;
  for (let i = 0; i < t.length;) {
    const p = pointDeCode(t, i);
    const c = p.c;
    i += p.n;
    if (c < 0x80) { sortie[k++] = c; } else if (c < 0x800) {
      sortie[k++] = 0xc0 | (c >> 6); sortie[k++] = 0x80 | (c & 0x3f);
    } else if (c < 0x10000) {
      sortie[k++] = 0xe0 | (c >> 12); sortie[k++] = 0x80 | ((c >> 6) & 0x3f); sortie[k++] = 0x80 | (c & 0x3f);
    } else {
      sortie[k++] = 0xf0 | (c >> 18); sortie[k++] = 0x80 | ((c >> 12) & 0x3f); sortie[k++] = 0x80 | ((c >> 6) & 0x3f); sortie[k++] = 0x80 | (c & 0x3f);
    }
  }
  return sortie;
}

// Un ArrayBuffer de la taille exacte des octets (celui que reçoit FileUtils.writeFileContent).
export function arrayBufferExact(octets) {
  const o = octetsDe(octets);
  return o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength);
}

// --------------------------------------------------------------------------- zip

// Noms des entrées d'un zip, dans l'ordre du répertoire central (APPNOTE de PKWARE : fin de
// répertoire 0x06054b50, répertoire central 0x02014b50, bit 11 = nom en UTF-8, sinon CP437).
// Pas de ZIP64. Erreur au message clair si ce n'est pas un zip ou s'il est tronqué.
export function nomsDuZip(valeur) {
  const o = octetsDe(valeur);
  if (o.length === 0) throw new Error('zip vide : 0 octet lu');
  if (o.length < 22) throw new Error(`ce fichier n'est pas un zip (${o.length} octets, trop court)`);
  let fin = -1;
  const plusBas = Math.max(0, o.length - 22 - 65535);
  for (let i = o.length - 22; i >= plusBas; i--) {
    if (o[i] === 0x50 && o[i + 1] === 0x4b && o[i + 2] === 0x05 && o[i + 3] === 0x06) { fin = i; break; }
  }
  if (fin < 0) {
    const debutZip = o[0] === 0x50 && o[1] === 0x4b;
    throw new Error(debutZip
      ? 'zip tronqué : fin de répertoire introuvable (fichier incomplet ?)'
      : "ce fichier n'est pas un zip (signature PK absente)");
  }
  const nombre = lire16(o, fin + 10);
  const tailleCentral = lire32(o, fin + 12);
  const decalageCentral = lire32(o, fin + 16);
  if (nombre === 0xffff || tailleCentral === 0xffffffff || decalageCentral === 0xffffffff) {
    throw new Error('zip de plus de 4 Go ou de 65535 entrées (ZIP64) : non lu par Vision');
  }
  if (decalageCentral + tailleCentral > fin) {
    throw new Error('zip tronqué ou abîmé : le répertoire central dépasse la fin du fichier');
  }
  const noms = [];
  let p = decalageCentral;
  for (let k = 0; k < nombre; k++) {
    if (p + 46 > fin || lire32(o, p) !== 0x02014b50) {
      throw new Error(`zip tronqué ou abîmé : entrée ${k + 1} sur ${nombre} illisible dans le répertoire central`);
    }
    const drapeaux = lire16(o, p + 8);
    const lNom = lire16(o, p + 28);
    const lExtra = lire16(o, p + 30);
    const lComm = lire16(o, p + 32);
    if (p + 46 + lNom > fin) throw new Error(`zip tronqué ou abîmé : nom de l'entrée ${k + 1} coupé`);
    const brut = o.subarray(p + 46, p + 46 + lNom);
    noms.push((drapeaux & 0x0800) !== 0 ? decoderUtf8(brut) : decoderCp437(brut));
    p += 46 + lNom + lExtra + lComm;
  }
  return noms;
}

// Décision n° 6 : un zip ne se lit en mémoire pour être listé que si sa taille est connue et
// d'au plus PLAFOND_LISTAGE_OCTETS.
export function listageSur(taille) {
  return typeof taille === 'number' && taille >= 0 && taille <= PLAFOND_LISTAGE_OCTETS;
}

export function messageListageRefuse(nomZip, taille) {
  if (!(typeof taille === 'number' && taille >= 0)) {
    return `${nomZip} : taille de la copie inconnue, zip non lu (plafond de 100 Mo pour lister un zip)`;
  }
  const mo = Math.round(taille / 100000) / 10;
  return `${nomZip} : ${mo} Mo, au-delà du plafond de 100 Mo pour lister un zip ; zip non lu`;
}

// Décision n° 3 : lecture refusée par QField : le dire, avec la version de QField et, s'il est
// connu, l'avis de QField sur la copie (FileUtils.isWithinProjectDirectory) ; aucun repli de plus.
export function messageLectureRefusee(nomZip, versionQField, dansLeProjet) {
  const version = versionQField ? String(versionQField) : 'inconnue';
  let lieu = '';
  if (dansLeProjet === true) lieu = ' Copie dans le dossier du projet selon QField.';
  if (dansLeProjet === false) lieu = ' Copie hors du dossier du projet selon QField.';
  return `${nomZip} : lecture refusée par QField (0 octet rendu ; version de QField ${version}).${lieu} Aucune couche chargée.`;
}

// --------------------------------------------------------------------------- noms et chemins

export function nomDeFichier(chemin) {
  const s = String(chemin);
  return s.substring(s.lastIndexOf('/') + 1);
}

export function dossierDe(chemin) {
  const s = String(chemin);
  const i = s.lastIndexOf('/');
  return i <= 0 ? (i === 0 ? '/' : '') : s.substring(0, i);
}

const MOTIF_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// vision_id : UUID, gardé tel quel (il forme la clé du registre et un nom de dossier).
export function estUuid(t) {
  return typeof t === 'string' && MOTIF_UUID.test(t);
}

// Nom simple (spec § 3.3, règle du 3 novembre 2026) : ni « / », ni « \ », ni « . » ou « .. »
// comme nom entier, ni caractère de contrôle.
function estNomSimple(nom) {
  if (typeof nom !== 'string' || nom === '' || nom === '.' || nom === '..') return false;
  if (nom.indexOf('/') >= 0 || nom.indexOf('\\') >= 0) return false;
  for (let i = 0; i < nom.length; i++) if (nom.charCodeAt(i) < 0x20) return false;
  return true;
}

export function estNomDeZip(nom) {
  return estNomSimple(nom) && nom.length > 4 && /\.zip$/i.test(nom);
}

// Segments d'un chemin relatif : aucun vide, aucun « . » ni « .. ».
function segmentsSains(relatif) {
  if (typeof relatif !== 'string' || relatif === '') return false;
  const segs = relatif.split('/');
  for (let i = 0; i < segs.length; i++) {
    if (segs[i] === '' || segs[i] === '.' || segs[i] === '..') return false;
  }
  return true;
}

function sansBarreFinale(d) {
  let s = String(d);
  while (s.length > 1 && s.charAt(s.length - 1) === '/') s = s.substring(0, s.length - 1);
  return s;
}

// --------------------------------------------------------------------------- projet Vision

export function lireVisionId(variables) {
  if (!variables || typeof variables !== 'object') return null;
  const v = variables.vision_id;
  if (v === undefined || v === null) return null;
  const t = String(v);
  return estUuid(t) ? t : null;
}

export function estProjetVision(variables) {
  return lireVisionId(variables) !== null;
}

export function cleRegistre(visionId) {
  return 'vision/' + visionId;
}

// Dossier du projet sain : absolu, autre que la racine, sans segment vide, « . » ou « .. », sans
// « \ ». Les barres finales sont tolérées (retirées).
function dossierProjetSain(dossierProjet) {
  if (typeof dossierProjet !== 'string' || dossierProjet.charAt(0) !== '/') return false;
  if (dossierProjet.indexOf('\\') >= 0) return false;
  const d = sansBarreFinale(dossierProjet);
  return d !== '/' && segmentsSains(d.substring(1));
}

// '<dossier du projet>/vision-imports' ; '' si le dossier du projet n'est pas sain.
export function dossierCopies(dossierProjet) {
  if (!dossierProjetSain(dossierProjet)) return '';
  return sansBarreFinale(dossierProjet) + '/' + NOM_DOSSIER_COPIES;
}

// '<dossier du projet>/vision-imports/<nomZip>' ; '' si le dossier du projet n'est pas sain.
export function cheminCopie(dossierProjet, nomZip) {
  const d = dossierCopies(dossierProjet);
  return d === '' ? '' : d + '/' + nomZip;
}

// Nom du zip d'une source « /vsizip/<dossierCopies>/<zip>/<entrée> », sinon ''.
export function zipDeLaSource(source, dossier) {
  const debut = '/vsizip/' + dossier + '/';
  if (typeof source !== 'string' || source.indexOf(debut) !== 0) return '';
  const reste = source.substring(debut.length);
  const i = reste.indexOf('/');
  if (i <= 0 || i === reste.length - 1) return '';
  return reste.substring(0, i);
}

// --------------------------------------------------------------------------- couches du zip

// Mission 024 (spec § 3.1, § 4 ; ADR 0008) : GeoJSON, Shapefile complet, une couche par table de
// GeoPackage et GeoTIFF, extensions sans tenir compte de la casse. Vocabulaire des formats : celui
// de decrireEntree et de vision-controles.mjs (geojson, shp, gpkg, tif).
// Chaque couche : { couche, entree, nom, format } ;
//   - couche : nom du fichier sans dossier ni extension ; pour une table de GeoPackage, le nom de la table ;
//   - nom : nom d'affichage des messages du § 4 = chemin complet dans le zip, avec l'extension ;
//     pour une table : « <chemin>.gpkg/<table> » (Pascal, 4 novembre 2026) ;
//   - Shapefile : + fichiers (fichiersDuShapefile, seule source, partagée avec decrireEntree) ;
//   - GeoPackage : + table. `tables` = { '<entrée .gpkg>': ['table', ...] } (tables vecteur lues par le
//     plugin, tablesDuGpkg). Tables inconnues (pas de clé) : une entrée table: null, refusée « tables
//     illisibles » ; liste vide : table: null, vide: true, refusée « aucune table vecteur ». Jamais perdu en silence.
// Un .json est retenu, marqué `json: true` : importerZip lit son contenu pour savoir si c'est du GeoJSON.
// Annexes (.shx, .dbf, .prj, .cpg seuls, .qix, .sbn, .sbx, .shp.xml, .tfw, .aux.xml, -wal, -shm), .qml, .qmd :
// aucune couche propre. Décision n° 7 : __MACOSX/ et les fichiers « ._* » ignorés en silence.
const FORMATS_PAR_EXTENSION = { geojson: 'geojson', json: 'geojson', shp: 'shp', gpkg: 'gpkg', tif: 'tif', tiff: 'tif' };
const EXTENSIONS_SHAPEFILE = ['shp', 'shx', 'dbf', 'prj', 'cpg'];

function extensionDe(fichier) {
  const m = /\.([^.]*)$/.exec(fichier);
  return m ? m[1].toLowerCase() : '';
}

function entreeIgnoree(entree) {
  if (entree === '' || entree.charAt(entree.length - 1) === '/') return true;
  if (('/' + entree).indexOf('/__MACOSX/') >= 0) return true;
  return nomDeFichier(entree).indexOf('._') === 0;
}

// Fichiers du Shapefile `entree` (son .shp) : entrées du zip du même dossier, même racine (casse libre),
// d'extension .shp .shx .dbf .prj .cpg, dans cet ordre, celles qui existent (la première de chaque
// extension). Chemins complets dans le zip. Seule source de ces fichiers (couchesDuZip, decrireEntree) :
// le contrôle 1 (spec § 4) lit cette liste.
export function fichiersDuShapefile(entree, noms) {
  const e = String(entree);
  const dossier = dossierDe(e);
  const fichier = nomDeFichier(e);
  const racine = fichier.replace(/\.[^.]*$/, '').toLowerCase();
  const trouves = {};
  for (let i = 0; i < noms.length; i++) {
    const n = String(noms[i]);
    if (entreeIgnoree(n) || dossierDe(n) !== dossier) continue;
    const f = nomDeFichier(n);
    const ext = extensionDe(f);
    if (EXTENSIONS_SHAPEFILE.indexOf(ext) < 0) continue;
    if (f.substring(0, f.length - ext.length - 1).toLowerCase() !== racine) continue;
    if (!Object.prototype.hasOwnProperty.call(trouves, ext)) trouves[ext] = n;
  }
  // Le .shp est l'entrée elle-même (si deux .shp ne diffèrent que par la casse, chacun garde le sien).
  if (extensionDe(fichier) === 'shp') trouves.shp = e;
  const fichiers = [];
  for (let k = 0; k < EXTENSIONS_SHAPEFILE.length; k++) {
    if (Object.prototype.hasOwnProperty.call(trouves, EXTENSIONS_SHAPEFILE[k])) fichiers.push(trouves[EXTENSIONS_SHAPEFILE[k]]);
  }
  return fichiers;
}

export function couchesDuZip(noms, tables) {
  const couches = [];
  const connues = tables && typeof tables === 'object' ? tables : {};
  for (let i = 0; i < noms.length; i++) {
    const entree = String(noms[i]);
    if (entreeIgnoree(entree)) continue;
    const fichier = nomDeFichier(entree);
    const ext = extensionDe(fichier);
    if (!Object.prototype.hasOwnProperty.call(FORMATS_PAR_EXTENSION, ext)) continue;
    const format = FORMATS_PAR_EXTENSION[ext];
    const couche = fichier.substring(0, fichier.length - ext.length - 1);
    if (couche === '') continue;
    if (format === 'geojson') {
      if (ext === 'json') couches.push({ couche, entree, nom: entree, format, json: true });
      else couches.push({ couche, entree, nom: entree, format });
    } else if (format === 'shp') {
      couches.push({ couche, entree, nom: entree, format, fichiers: fichiersDuShapefile(entree, noms) });
    } else if (format === 'tif') {
      couches.push({ couche, entree, nom: entree, format });
    } else {
      const liste = Object.prototype.hasOwnProperty.call(connues, entree) ? connues[entree] : null;
      if (!Array.isArray(liste)) {
        couches.push({ couche, entree, nom: entree, format, table: null });
      } else if (liste.length === 0) {
        couches.push({ couche, entree, nom: entree, format, table: null, vide: true });
      } else {
        for (let k = 0; k < liste.length; k++) {
          const table = String(liste[k]);
          couches.push({ couche: table, entree, nom: entree + '/' + table, format, table });
        }
      }
    }
  }
  return couches;
}

// Source /vsizip/ d'une couche du zip (copie du zip dans vision-imports/) : l'entrée elle-même (le .shp
// pour un Shapefile) ; pour une table de GeoPackage, « |layername=<table> ». Un GeoPackage aux tables
// inconnues ou sans table (table: null) n'a PAS de source : '' (QGIS ouvrirait sa première table en silence).
export function sourceDeLaCouche(copie, c) {
  const base = '/vsizip/' + copie + '/' + c.entree;
  if (c.format !== 'gpkg') return base;
  if (typeof c.table !== 'string' || !nomDeTableSur(c.table)) return '';
  return base + '|layername=' + c.table;
}

// Source d'un raster (GeoTIFF) : Vision.qml l'ouvre par LayerUtils.loadRasterLayer, et non loadVectorLayer.
export function estSourceRaster(source) {
  return typeof source === 'string' && /\.tiff?$/i.test(source);
}

// --------------------------------------------------------------------------- tables d'un GeoPackage (mission 024)

// Voie 1 du prototype n° 4 (mission 030, prototype-2/essai-logique.mjs, verdictTables ; bouton 13 de
// prototype-2/Essai.qml) : une couche OGR dont le filtre est une requête. QGIS 3a92eb3 passe un filtre qui
// commence par « SELECT » à GDALDatasetExecuteSQL (src/core/providers/ogr/qgsogrproviderutils.cpp
// l. 1390-1395) : chaque ligne de gpkg_contents devient une entité, lue par l'itérateur.
// NON PROUVÉE sur le Samsung (prototype n° 4 pas encore essayé) : en cas d'échec, « tables illisibles ».
export const SQL_TABLES_GPKG = 'SELECT table_name, data_type FROM gpkg_contents ORDER BY table_name';
export const TYPE_TABLE_VECTEUR = 'features';

// Nom de table sûr dans « |layername= » : ni « | » (séparateur des options de la source), ni retour à la
// ligne, ni caractère nul (garde du prototype n° 4, nomDeTableSur).
export function nomDeTableSur(nom) {
  return typeof nom === 'string' && nom !== '' && nom.length <= 200 && !/[|\r\n\u0000]/.test(nom);
}

function valeurTexte(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

function ouvrirSansPlanter(services, uri, nom) {
  try {
    const c = services.ouvrir(uri, nom);
    return c && c.isValid === true ? c : (c ? { invalide: c } : null);
  } catch (e) {
    return null;
  }
}

function liberer(services, c) {
  if (!c) return;
  try { if (typeof services.liberer === 'function') services.liberer(c.invalide ? c.invalide : c); } catch (e) { /* sans effet */ }
}

// Tables vecteur d'un GeoPackage `source` (« /vsizip/<copie>/<entrée .gpkg> »), sans réseau.
// services = { ouvrir(uri, nom) -> couche, creerIterateur(couche) -> itérateur, liberer(couche) }.
// Rend { etat, tables } :
//   - 'liste' : tables vecteur (data_type « features »), dans l'ordre de la requête ;
//   - 'aucune' : la liste est lue sans erreur, au moins une ligne, aucune de type « features », ET aucune
//     sonde « |layerid=0 » ne s'ouvre (exigence de la relecture de la 030) ;
//   - 'illisible' : tout le reste : requête qui ne s'ouvre pas, lecture qui lève, liste vide (GDAL y a ouvert
//     une couche : incohérent), table_name ou data_type manquant, nom de table non sûr, ou aucune table
//     vecteur alors que la sonde layerid ouvre une couche. Jamais « aucune » sur une erreur. Ne lève jamais.
export function tablesDuGpkg(source, services) {
  const illisible = { etat: 'illisible', tables: [] };
  if (!services || typeof services.ouvrir !== 'function' || typeof services.creerIterateur !== 'function') return illisible;
  const requete = ouvrirSansPlanter(services, source + '|subset=' + SQL_TABLES_GPKG, 'vision_tables');
  if (!requete || requete.invalide) { liberer(services, requete); return illisible; }
  const lignes = [];
  let it = null;
  let lu = true;
  try {
    it = services.creerIterateur(requete);
    if (!it) throw new Error('itérateur absent');
    while (it.hasNext()) {
      const f = it.next();
      const table = valeurTexte(f.attribute('table_name'));
      const type = valeurTexte(f.attribute('data_type'));
      if (table === '' || type === '') throw new Error('table_name ou data_type manquant');
      lignes.push({ table: table, type: type });
    }
  } catch (e) {
    lu = false;
  }
  if (it) { try { it.close(); } catch (e) { /* fermeture sans effet sur le résultat */ } }
  liberer(services, requete);
  if (!lu || lignes.length === 0) return illisible;
  const tables = [];
  for (let i = 0; i < lignes.length; i++) {
    if (lignes[i].type !== TYPE_TABLE_VECTEUR) continue;
    if (!nomDeTableSur(lignes[i].table)) return illisible;
    tables.push(lignes[i].table);
  }
  if (tables.length > 0) return { etat: 'liste', tables: tables };
  // Aucune table vecteur lue : on ne le croit que si GDAL n'ouvre aucune couche par layerid.
  const sonde = ouvrirSansPlanter(services, source + '|layerid=0', 'vision_sonde');
  const ouverte = !!sonde && !sonde.invalide;
  liberer(services, sonde);
  return ouverte ? illisible : { etat: 'aucune', tables: [] };
}

// --------------------------------------------------------------------------- style d'une table de GeoPackage (mission 047)

// Style enregistré par QGIS dans la table `layer_styles` du GeoPackage (« Enregistrer le style dans la base de
// données »). Même voie que gpkg_contents : une couche OGR dont le filtre est une requête SELECT, exécutée par
// GDALDatasetExecuteSQL sur le jeu de données (QGIS 3a92eb3, qgsogrprovider.cpp l. 2600-2630 et
// qgsogrproviderutils.cpp l. 1390-1395), sans réseau ; la couche 0 du fichier doit exister (analyzeURI,
// qgsogrproviderutils.cpp l. 82 : layerIndex = 0 par défaut). Ordre des lignes : celui de QGIS
// (qgsogrutils.cpp l. 3044-3048, loadStoredStyle) : style par défaut d'abord, puis le plus récent ; seule la
// première ligne est lue. NON PROUVÉE sur le Samsung (comme gpkg_contents).
export function requeteStyleGpkg(table) {
  const nom = String(table).replace(/'/g, "''");
  return "SELECT styleQML FROM layer_styles WHERE f_table_name = '" + nom
    + "' ORDER BY CASE WHEN useAsDefault THEN 1 ELSE 2 END, update_time DESC LIMIT 1";
}

// Style enregistré pour la table `table` du GeoPackage `source` (« /vsizip/<copie>/<entrée .gpkg> »).
// services = { ouvrir(uri, nom) -> couche, creerIterateur(couche) -> itérateur, liberer(couche) } (comme tablesDuGpkg).
// Rend { etat, texte } :
//   - 'lu' : une ligne existe ; `texte` = son styleQML ('' si vide ou NULL) ; le contrôle du .qml vient après ;
//   - 'illisible' : la requête s'est ouverte, une ligne existe, mais elle ne se lit pas ;
//   - 'absent' : tout le reste : pas de table layer_styles (la requête ne s'ouvre pas : on ne peut pas le
//     distinguer d'un échec d'ouverture), aucune ligne pour la table, nom de table non sûr (jamais interpolé),
//     services absents. Ne lève jamais.
// Le nom de table sans « \ » : cleanSubsetString (qgsogrproviderutils.cpp l. 1340-1365) suit les chaînes entre
// apostrophes et traite « \ » comme un échappement, ce que le doublement d'apostrophe de SQL ne suit pas.
export function styleDuGpkg(source, table, services) {
  const absent = { etat: 'absent' };
  if (!services || typeof services.ouvrir !== 'function' || typeof services.creerIterateur !== 'function') return absent;
  if (!nomDeTableSur(table) || String(table).indexOf('\\') >= 0) return absent;
  const requete = ouvrirSansPlanter(services, source + '|subset=' + requeteStyleGpkg(table), 'vision_style');
  if (!requete || requete.invalide) { liberer(services, requete); return absent; }
  let it = null;
  let etat = absent;
  try {
    it = services.creerIterateur(requete);
    if (!it) throw new Error('itérateur absent');
    if (it.hasNext()) {
      const f = it.next();
      etat = { etat: 'lu', texte: valeurTexte(f.attribute('styleQML')) };
    }
  } catch (e) {
    etat = { etat: 'illisible' };
  }
  if (it) { try { it.close(); } catch (e) { /* fermeture sans effet sur le résultat */ } }
  liberer(services, requete);
  return etat;
}

// --------------------------------------------------------------------------- registre

// { liste, illisible } : illisible quand la valeur n'est ni absente, ni une liste JSON.
function etatRegistre(reglages, visionId) {
  const brut = reglages.value(cleRegistre(visionId), '');
  if (brut === undefined || brut === null || brut === '') return { liste: [], illisible: false };
  let v;
  try {
    v = JSON.parse(String(brut));
  } catch (e) {
    return { liste: [], illisible: true };
  }
  return Array.isArray(v) ? { liste: v, illisible: false } : { liste: [], illisible: true };
}

function ecrireRegistre(reglages, visionId, liste) {
  reglages.setValue(cleRegistre(visionId), JSON.stringify(liste));
}

export function lireRegistre(reglages, visionId) {
  return etatRegistre(reglages, visionId).liste;
}

// Mission 053 (forme R2 corrigée, docs/referentiels/cache-zone-qfield.md § 4) : la clé est (sorte, zip, couche). Une entrée
// de zip n'a pas de `cache` ; une entrée du cache ONF a `cache: 'onf'` et pas de `zip` : les deux ne se confondent jamais.
function memeCouche(e, zip, couche, cache) {
  if (!e || typeof e !== 'object') return false;
  const sorte = typeof cache === 'string' ? cache : '';
  const sienne = typeof e.cache === 'string' ? e.cache : '';
  return sienne === sorte && e.zip === zip && e.couche === couche;
}

// Remplace l'entrée de même (sorte, zip, couche) à sa place, ou ajoute à la fin.
export function inscrire(reglages, visionId, entree) {
  const liste = lireRegistre(reglages, visionId).slice();
  let place = -1;
  for (let i = 0; i < liste.length; i++) {
    if (memeCouche(liste[i], entree.zip, entree.couche, entree.cache)) {
      if (place < 0) { place = i; liste[i] = entree; } else { liste.splice(i, 1); i--; }
    }
  }
  if (place < 0) liste.push(entree);
  ecrireRegistre(reglages, visionId, liste);
}

export function retirer(reglages, visionId, cible) {
  const liste = lireRegistre(reglages, visionId);
  const reste = [];
  let retiree = false;
  for (let i = 0; i < liste.length; i++) {
    if (memeCouche(liste[i], cible.zip, cible.couche, cible.cache)) retiree = true; else reste.push(liste[i]);
  }
  if (!retiree) return { retiree: false, zipInutile: false };
  ecrireRegistre(reglages, visionId, reste);
  let encore = 0;
  for (let i = 0; i < reste.length; i++) if (reste[i] && reste[i].zip === cible.zip) encore++;
  return { retiree: true, zipInutile: encore === 0 };
}

function nombreDeCouchesDuZip(reglages, visionId, zip) {
  const liste = lireRegistre(reglages, visionId);
  let n = 0;
  for (let i = 0; i < liste.length; i++) if (liste[i] && liste[i].zip === zip) n++;
  return n;
}

export function zipUtilise(reglages, visionId, zip) {
  return nombreDeCouchesDuZip(reglages, visionId, zip) > 0;
}

// Entrée saine : nom de zip simple, couche nommée, et soit `chemin` (copie GeoPackage, ADR 0008 :
// « <dossier du zip>/<fichier>.gpkg » sous vision-imports/), soit `chemin_vsi` dans ce zip (GeoTIFF
// lus dans le zip, entrées des versions 0.2.x) ; sans « .. ».
function entreeSaine(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.cache !== undefined) return entreeDuCacheSaine(e);
  if (!estNomDeZip(e.zip)) return false;
  if (typeof e.couche !== 'string' || e.couche === '') return false;
  if (typeof e.chemin === 'string') {
    if (e.chemin.indexOf('|') >= 0 || e.chemin.indexOf('\\') >= 0 || !segmentsSains(e.chemin)) return false;
    const segs = e.chemin.split('/');
    return segs.length === 2 && segs[0] === dossierDuZip(e.zip) && /\.gpkg$/.test(segs[1]) && segs[1] !== '.gpkg';
  }
  if (typeof e.chemin_vsi !== 'string' || e.chemin_vsi.indexOf(e.zip + '/') !== 0) return false;
  return segmentsSains(e.chemin_vsi);
}

// --------------------------------------------------------------------------- messages

function pluriel(n, un, plusieurs) {
  return n === 1 ? un : plusieurs;
}

function nomsDe(liste) {
  const noms = [];
  for (let i = 0; i < liste.length; i++) noms.push(liste[i].couche);
  return noms.join(', ');
}

// --------------------------------------------------------------------------- importer

// Mission 049 : QField rend toute couche chargée par LayerUtils en CppOwnership (v4.3.7, qflayerutils.cpp l. 618 et 624) :
// personne ne la libère si elle n'est pas ajoutée au projet. `liberer(couche)` libère une couche invalide (une seule fois).
function chargerSansPlanter(chargerCouche, source, nom, zip, liberer) {
  try {
    const c = zip === undefined ? chargerCouche(source, nom) : chargerCouche(source, nom, zip);
    if (!c) return { couche: null, raison: 'illisible' };
    if (!c.isValid) {
      if (typeof liberer === 'function') liberer(c);
      return { couche: null, raison: 'illisible' };
    }
    return { couche: c, raison: '' };
  } catch (e) {
    return { couche: null, raison: 'illisible (' + (e && e.message ? e.message : String(e)) + ')' };
  }
}

// Mission 049 : suivi des couches ouvertes par un import. `liberer` ne libère une couche qu'une fois, jamais une couche
// « gardée » (ajoutée au projet, ou dont l'ajout a été tenté : le doute profite à la carte). `toutLiberer` balaie à la fin
// de l'import (y compris sur retour anticipé ou exception) ce qui a été ouvert sans être gardé. Le service est
// `ctx.libererCouche(couche)` (Vision.qml : deleteLater) ; absent, rien n'est libéré. Ne lève jamais.
function creerSuivi(ctx) {
  const ouvertes = [];
  const gardees = [];
  const liberees = [];
  const suivi = {
    suivre: function (c) { if (c && ouvertes.indexOf(c) < 0) ouvertes.push(c); return c; },
    garder: function (c) { if (c && gardees.indexOf(c) < 0) gardees.push(c); },
    liberer: function (c) {
      if (!c || gardees.indexOf(c) >= 0 || liberees.indexOf(c) >= 0) return;
      // Une couche déjà au projet (rendue telle quelle par le chargeur) appartient au QgsProject : jamais libérée ici.
      try { if (ctx && typeof ctx.coucheDuProjet === 'function' && ctx.coucheDuProjet(c)) return; } catch (e) { return; }
      liberees.push(c);
      try { if (ctx && typeof ctx.libererCouche === 'function') ctx.libererCouche(c); } catch (e) { /* sans effet */ }
    },
    toutLiberer: function () { for (let i = 0; i < ouvertes.length; i++) suivi.liberer(ouvertes[i]); },
  };
  return suivi;
}

// Description d'une entrée du zip pour les contrôles (spec § 4) : nom court avec extension,
// format d'après l'extension, et les fichiers (noms sans dossier). Pour un Shapefile, les fichiers sont
// ceux de fichiersDuShapefile (mission 024 : une seule source avec couchesDuZip, que lit le contrôle 1) ;
// pour les autres formats, les noms du zip dans le même dossier (inchangé depuis la mission 010).
export function decrireEntree(entree, noms) {
  const fichier = nomDeFichier(entree);
  const ext = extensionDe(fichier);
  const format = Object.prototype.hasOwnProperty.call(FORMATS_PAR_EXTENSION, ext) ? FORMATS_PAR_EXTENSION[ext] : ext;
  const fichiers = [];
  if (format === 'shp') {
    const liste = fichiersDuShapefile(entree, noms);
    for (let i = 0; i < liste.length; i++) fichiers.push(nomDeFichier(liste[i]));
  } else {
    const dossier = dossierDe(entree);
    for (let i = 0; i < noms.length; i++) {
      const n = String(noms[i]);
      if (dossierDe(n) === dossier) fichiers.push(nomDeFichier(n));
    }
  }
  return { nom: fichier, format, fichiers };
}

// Nom d'une couche dans les messages du § 4 : le chemin complet dans le zip, avec l'extension, et
// « /<table> » pour une table de GeoPackage (Pascal, 4 novembre 2026 ; mission 024). Repli : l'entrée.
function nomAffiche(c) {
  return typeof c.nom === 'string' && c.nom !== '' ? c.nom : String(c.entree);
}

// Mission 044 : fin de la ligne d'un .json écarté (« <chemin> : pas une couche GeoJSON, ignoré »).
const PHRASE_JSON_ECARTE = 'pas une couche GeoJSON, ignoré';

// Décrit puis contrôle une couche ; toute exception vaut refus (spec § 4). Si l'ouverture a
// échoué (`couche` nulle), on contrôle quand même avec `lisible: false` : le contrôle 1
// (Shapefile incomplet) passe avant le 2 (« illisible »), et le message porte le chemin complet
// dans le zip (mission 024), sans erreur technique. decrireEntree donne le format et les fichiers ;
// le nom transmis au contrôle est le nom affiché (vision-controles.mjs en tire la racine du Shapefile).
function controlerSansPlanter(ctx, couche, c, noms) {
  const nom = nomAffiche(c);
  try {
    const entree = decrireEntree(c.entree, noms);
    const lue = couche ? ctx.decrireCouche(couche, entree.format) : { lisible: false };
    const description = Object.assign({}, lue, entree, { nom: nom });
    if (!couche) description.lisible = false;
    const v = ctx.controlerCouche(description);
    if (v && v.charge === true) return { charge: true, avertissements: Array.isArray(v.avertissements) ? v.avertissements : [] };
    return { charge: false, message: v && v.message ? String(v.message) : nom + ' : couche refusée' };
  } catch (e) {
    return { charge: false, message: nom + ' : contrôle impossible, couche refusée' };
  }
}

// --------------------------------------------------------------------------- copies et styles (mission 010, ADR 0008)

function messageErreur(e) {
  return e && e.message ? e.message : String(e);
}

// Nom du dossier des copies d'un zip : le nom du zip sans « .zip » (il ne peut pas porter le nom
// du zip lui-même, qui est un fichier du même dossier).
export function dossierDuZip(nomZip) {
  return String(nomZip).replace(/\.zip$/i, '');
}

// Chemins de la copie d'une couche vecteur : relatif à vision-imports/ ('Serre/UG.gpkg'), absolu.
export function cheminsDeLaCopie(dossierProjet, nomZip, nomCouche) {
  const base = dossierCopies(dossierProjet);
  const relatif = dossierDuZip(nomZip) + '/' + nomCouche + '.gpkg';
  return { relatif, gpkg: base === '' ? '' : base + '/' + relatif, qml: base === '' ? '' : base + '/' + dossierDuZip(nomZip) + '/' + nomCouche + '.qml' };
}

// Garde avant toute écriture (saveVectorLayerAs crée les dossiers et écrase sans contrôle de
// chemin ; writeFileContent aussi) : seul un « .gpkg » ou un « .qml » directement dans
// <dossier des copies>/<dossier du zip>/ est écrivable. Ne se fie à aucun argument : dossier
// absolu en « /vision-imports », segments sains, ni « \ » ni « | » (séparateur d'URI de couche),
// dossier du zip ne finissant pas par « .zip » (il se confondrait avec la copie du zip).
export function peutEcrireCopie(chemin, dossier) {
  if (typeof chemin !== 'string' || typeof dossier !== 'string') return false;
  if (!peutEffacer(chemin.replace(/\.(gpkg|qml)$/, '.x'), dossier)) return false;
  if (chemin.indexOf('|') >= 0) return false;
  for (let i = 0; i < chemin.length; i++) if (chemin.charCodeAt(i) < 0x20) return false;
  const reste = chemin.substring(dossier.length + 1).split('/');
  if (reste.length !== 2) return false;
  if (/\.zip$/i.test(reste[0]) || !/\.(gpkg|qml)$/.test(reste[1]) || /^\.(gpkg|qml)$/.test(reste[1])) return false;
  return true;
}

// Mission 047 : style enregistré dans le GeoPackage pour la table de `c`, par le service facultatif
// `ctx.styleGpkg(source, table)` (Vision.qml : styleGpkg). Rend { etat: 'lu', texte } ou { etat: 'illisible' } quand une
// ligne existe ; null dans tous les autres cas (service absent, qui lève, réponse inattendue, « absent ») : la
// règle du manuel s'applique alors comme avant, sans avertissement.
function styleEnregistre(ctx, nomZip, c) {
  if (typeof ctx.styleGpkg !== 'function' || typeof c.table !== 'string') return null;
  let r = null;
  try { r = ctx.styleGpkg('/vsizip/' + cheminCopie(ctx.dossierProjet, nomZip) + '/' + c.entree, c.table); } catch (e) { r = null; }
  if (!r || typeof r !== 'object') return null;
  if (r.etat === 'illisible') return { etat: 'illisible' };
  if (r.etat === 'lu' && typeof r.texte === 'string') return { etat: 'lu', texte: r.texte };
  return null;
}

// Choisit le .qml à écrire à côté de la copie : le style enregistré dans le GeoPackage (mission 047), puis la bibliothèque
// du plugin par nom exact (mission 052, `ctx.bibliotheque`), puis celui du zip
// s'il est valide (XML, racine <qgis>, <renderer-v2>), sinon celui de la règle du manuel (styleDe puis qmlDe). Rend
// { style, qml, contenu, avertissements } ; contenu null = rien à écrire (style par défaut).
// Les avertissements sont des phrases seules (l'appelant ajoute « <fichier> : », spec § 4).
function choisirStyle(ctx, couche, nomZip, c, noms) {
  const nomCouche = c.couche;
  const rien = { style: STYLE_DEFAUT, qml: '', contenu: null, avertissements: [] };
  const S = ctx.styles;
  if (!S || typeof ctx.infosCouche !== 'function') return rien;
  try {
    const infos = ctx.infosCouche(couche) || {};
    const champs = infos.champs || [];
    let cheminQml = null;
    let texte = null;
    // Mission 047 : le style enregistré dans le GeoPackage (layer_styles) passe avant la règle du manuel.
    const gpkg = c.format === 'gpkg' ? styleEnregistre(ctx, nomZip, c) : null;
    // Mission 052 : puis la bibliothèque du plugin, par nom exact ; un style de raster n'est jamais posé sur un vecteur.
    let bibliotheque = null;
    if (gpkg === null && typeof S.styleDeBibliotheque === 'function' && ctx.bibliotheque) {
      const e = S.styleDeBibliotheque(nomCouche, ctx.bibliotheque);
      if (e !== null && !(typeof S.estStyleRaster === 'function' && S.estStyleRaster(e.qml))) bibliotheque = e;
    }
    if (gpkg !== null) {
      // Une ligne existe : mêmes garde-fous qu'un .qml (non vide, XML <qgis>) ; sinon règle du manuel et l'avertissement
      // existant (reconnaitre) ; une ligne illisible vaut un texte vide.
      texte = gpkg.etat === 'lu' && S.qmlValide(gpkg.texte) ? gpkg.texte : '';
    } else if (bibliotheque !== null) {
      // Mission 052 : le nom exact de la couche est celui d'un style vecteur de la bibliothèque ; un .qml illisible
      // vaut un texte vide (règle du manuel et avertissement existant, via reconnaitre).
      texte = S.qmlValide(bibliotheque.qml) ? bibliotheque.qml : '';
    } else {
      // Une table de GeoPackage : son .qml porte le nom de la table, à côté du .gpkg (spec § 5).
      if (c.format === 'gpkg') cheminQml = typeof S.trouverQmlDeTable === 'function' ? S.trouverQmlDeTable(c.entree, c.table, noms) : null;
      else cheminQml = typeof S.trouverQml === 'function' ? S.trouverQml(c.entree, noms) : null;
      if (cheminQml) {
        try { texte = typeof ctx.lireTexte === 'function' ? ctx.lireTexte(nomZip, cheminQml) : null; } catch (e) { texte = null; }
        texte = typeof texte === 'string' && S.qmlValide(texte) ? texte : '';
      }
    }
    const r = S.reconnaitre({ nom: nomCouche, geometrie: infos.geometrie, champs, qml: texte });
    if (r.source === 'qml') {
      if (gpkg !== null) return { style: STYLE_GPKG, qml: '', contenu: texte, avertissements: [] };
      if (bibliotheque !== null) return { style: STYLE_BIBLIOTHEQUE, qml: '', contenu: texte, avertissements: [] };
      return { style: STYLE_QML, qml: cheminQml, contenu: texte, avertissements: [] };
    }
    const avertissements = r.avertissement ? [r.avertissement] : [];
    const attendu = S.champCodeDe(r.regle);
    const style = S.styleDe(r.regle, {
      champCode: attendu === null ? undefined : (S.champReel(champs, S.sansCasseNiAccents(attendu)) || attendu),
      champEssence: S.champReel(champs, 'essence') || undefined,
      champDiametre: S.champReel(champs, 'diametre') || undefined,
    });
    const contenu = style === null ? null : S.qmlDe(style, infos.geometrie);
    if (contenu === null) return { style: STYLE_DEFAUT, qml: '', contenu: null, avertissements };
    return { style: r.regle, qml: '', contenu, avertissements };
  } catch (e) {
    return { style: STYLE_DEFAUT, qml: '', contenu: null, avertissements: ['style non appliqué (' + messageErreur(e) + ')'] };
  }
}

// Vrai seulement s'il est SÛR qu'aucun .qml n'existe à ce chemin (effacé, puis vérifié par `existe` :
// la valeur rendue par l'effacement n'est pas crue). Chemin non écrivable ou
// exception : faux. Seule exception : les deux services de fichiers absents (contextes d'essai des tests).
function qmlAbsent(ctx, chemin, dossier) {
  try {
    // Ces deux services sont FACULTATIFS dans importerZip à dessein : les tests du testeur (mission 024) ne
    // les fournissent pas, et les rendre obligatoires les casserait. Absents, la garde est sautée sans bruit.
    // Le branchement réel est donc figé ailleurs : tests/plugin-styles.test.mjs vérifie que Vision.qml les passe.
    if (typeof ctx.existe !== 'function' || typeof ctx.effacerFichier !== 'function') return true;
    if (!ctx.existe(chemin)) return true;
    if (!peutEcrireCopie(chemin, dossier)) return false;
    ctx.effacerFichier(chemin);
    return !ctx.existe(chemin);
  } catch (e) {
    return false;
  }
}

// Réécrit la couche ouverte (contrôlée) en GeoPackage dans vision-imports/<zip>/, écrit le .qml à
// côté AVANT le chargement, puis charge la copie. Rend { ok: false, message } ou
// { ok: true, copie, rendu, relatif, style, qml, avertissements }.
function copierEtStyler(ctx, couche, c, nomZip, noms, suivi) {
  const fichier = nomAffiche(c);
  const dossier = dossierCopies(ctx.dossierProjet);
  const p = cheminsDeLaCopie(ctx.dossierProjet, nomZip, c.couche);
  if (!peutEcrireCopie(p.gpkg, dossier) || !peutEcrireCopie(p.qml, dossier)) {
    return { ok: false, message: `${fichier} : nom non écrivable dans vision-imports/, couche refusée` };
  }
  const st = choisirStyle(ctx, couche, nomZip, c, noms);
  let rendu = '';
  try { rendu = String(ctx.reecrireCouche(couche, p.gpkg) || ''); } catch (e) { rendu = ''; }
  if (rendu === '') return { ok: false, message: `${fichier} : copie impossible (écriture refusée par QField), couche refusée` };
  if (!/\.gpkg$/.test(rendu) || !peutEcrireCopie(rendu, dossier)) {
    return { ok: false, message: `${fichier} : copie écrite hors de vision-imports/, couche refusée` };
  }
  const avertissements = st.avertissements.slice();
  const cheminQml = rendu.substring(0, rendu.length - '.gpkg'.length) + '.qml';
  // Arbitrage de Pascal (4 novembre 2026) : l'ancien .qml voisin est effacé AVANT toute écriture,
  // qu'il y ait ou non un style à poser (un .qml resté d'un import précédent s'appliquerait en
  // silence à la copie). Effacement non vérifié = couche refusée : le message ne peut pas dire
  // vrai sur un style que QGIS appliquerait malgré nous.
  if (!qmlAbsent(ctx, cheminQml, dossier)) {
    return { ok: false, message: `${fichier} : ancien style (.qml) impossible à effacer, couche refusée` };
  }
  let styleFinal = st.style;
  let qmlFinal = st.qml;
  if (st.contenu !== null) {
    let ecrit = false;
    try { ecrit = peutEcrireCopie(cheminQml, dossier) && ctx.ecrireFichier(cheminQml, st.contenu) === true; } catch (e) { ecrit = false; }
    if (!ecrit) {
      // Écriture ratée ou interrompue : un .qml tronqué peut rester sur le disque et s'appliquer
      // (ou faire échouer le chargement). On l'efface ; s'il reste, la couche est refusée.
      if (!qmlAbsent(ctx, cheminQml, dossier)) {
        return { ok: false, message: `${fichier} : style (.qml) mal écrit et impossible à effacer, couche refusée` };
      }
      // La couche reste utilisable, mais sans les couleurs du manuel : on le dit.
      styleFinal = STYLE_DEFAUT;
      qmlFinal = '';
      avertissements.push('style non écrit, couche chargée avec le style par défaut');
    }
  }
  const o = chargerSansPlanter(ctx.ouvrirCouche, rendu + '|layername=' + c.couche, c.couche, undefined, suivi.liberer);
  suivi.suivre(o.couche);
  if (!o.couche) return { ok: false, message: `${fichier} : copie illisible après réécriture, couche refusée` };
  return { ok: true, copie: o.couche, rendu, relatif: rendu.substring(dossier.length + 1), style: styleFinal, qml: qmlFinal, avertissements };
}

// --------------------------------------------------------------------------- fichiers d'une couche (mission 031)

// Suffixes des fichiers réécrits d'une couche vecteur, dans l'ordre où leurs noms sont dits (ADR 0007
// amendée ; annexes SQLite et GDAL : -wal, -shm, .aux.xml).
const SUFFIXES_COUCHE = ['.gpkg', '.qml', '.gpkg-wal', '.gpkg-shm', '.gpkg.aux.xml'];

// Chemins protégés : fichiers qu'une autre entrée du registre utilise encore. On ne suit le `chemin`
// du registre que pour PROTÉGER, jamais pour effacer. Un .gpkg partagé protège aussi ses annexes et son .qml.
function cheminsProteges(dossier, autres) {
  const proteges = {};
  const proteger = (gpkg) => {
    const base = gpkg.replace(/\.gpkg$/, '');
    for (let k = 0; k < SUFFIXES_COUCHE.length; k++) proteges[base + SUFFIXES_COUCHE[k]] = true;
  };
  for (let i = 0; i < autres.length; i++) {
    const e = autres[i];
    if (!e || typeof e !== 'object' || typeof e.chemin !== 'string') continue;
    // Mission 053 : le chemin d'une entrée du cache ONF est relatif à vision-imports/_cache-onf/ (R2, point 4).
    if (e.cache !== undefined) { proteger(dossier + '/' + CACHE_ONF.dossier + '/' + e.chemin); continue; }
    proteger(dossier + '/' + e.chemin);
    if (estNomDeZip(e.zip) && estNomSimple(e.couche)) proteger(dossier + '/' + dossierDuZip(e.zip) + '/' + e.couche + '.gpkg');
  }
  return proteges;
}

// Efface les fichiers réécrits d'une couche vecteur sortie du registre. Rend les noms des fichiers
// qui existaient et sont restés (ordre de SUFFIXES_COUCHE), et `nonVerifiable` quand le service `existe`
// manque : rien n'est alors tenté (la réponse de l'effacement n'est jamais crue : on vérifie avant et
// après). Ne lève jamais.
const PHRASE_NON_VERIFIABLE = 'Effacement non vérifiable : fichiers peut-être restés.';
function effacerFichiersDeCouche(ctx, zip, couche, autres) {
  const restes = [];
  const bilan = { restes, nonVerifiable: false };
  try {
    if (!estNomDeZip(zip) || !estNomSimple(couche) || couche.indexOf('|') >= 0) return bilan;
    if (/\.zip$/i.test(dossierDuZip(zip))) return bilan;
    const dossier = dossierCopies(ctx.dossierProjet);
    if (dossier === '') return bilan;
    if (typeof ctx.existe !== 'function') { bilan.nonVerifiable = true; return bilan; }
    let rm = null;
    if (typeof ctx.effacerFichier === 'function') rm = ctx.effacerFichier;
    else if (ctx.platformUtilities && typeof ctx.platformUtilities.rmFile === 'function') rm = (c) => ctx.platformUtilities.rmFile(c);
    const proteges = cheminsProteges(dossier, autres);
    for (let i = 0; i < SUFFIXES_COUCHE.length; i++) {
      const chemin = dossier + '/' + dossierDuZip(zip) + '/' + couche + SUFFIXES_COUCHE[i];
      if (Object.prototype.hasOwnProperty.call(proteges, chemin)) continue;
      if (!peutEffacer(chemin, dossier)) continue;
      try { if (!ctx.existe(chemin)) continue; } catch (e) { continue; }
      if (rm !== null) { try { rm(chemin); } catch (e) { /* vérifié ci-dessous */ } }
      let reste = true;
      try { reste = !!ctx.existe(chemin); } catch (e) { reste = true; }
      if (reste) restes.push(nomDeFichier(chemin));
    }
  } catch (e) {
    /* jamais d'exception : ce qui est connu est rendu */
  }
  return bilan;
}

function noterEffacement(cumul, bilan) {
  for (let i = 0; i < bilan.restes.length; i++) cumul.restes.push(bilan.restes[i]);
  if (bilan.nonVerifiable) cumul.nonVerifiable = true;
}

// Tables des GeoPackage du zip, par le service `ctx.tablesGpkg(source, entree)` (Vision.qml : tablesDuGpkg
// sur QField) : il rend la liste des tables vecteur, [] si aucune, ou autre chose (null, exception) si
// illisibles. Service absent : tables inconnues, donc « tables illisibles » (jamais ouvert sans layername).
function tablesDesGpkg(ctx, copie, noms) {
  const tables = {};
  if (typeof ctx.tablesGpkg !== 'function') return tables;
  const sans = couchesDuZip(noms);
  for (let i = 0; i < sans.length; i++) {
    const c = sans[i];
    if (c.format !== 'gpkg' || Object.prototype.hasOwnProperty.call(tables, c.entree)) continue;
    let liste = null;
    try { liste = ctx.tablesGpkg('/vsizip/' + copie + '/' + c.entree, c.entree); } catch (e) { liste = null; }
    if (!Array.isArray(liste)) continue;
    let saine = true;
    for (let k = 0; k < liste.length; k++) if (!nomDeTableSur(liste[k])) saine = false;
    if (saine) tables[c.entree] = liste.slice();
  }
  return tables;
}

// Refus d'un GeoPackage sans table à charger (spec § 4, Pascal, 4 novembre 2026), avant toute ouverture.
function messageGpkgSansTable(c) {
  return c.vide === true
    ? `${nomAffiche(c)} : aucune table vecteur, couche non chargée`
    : `${nomAffiche(c)} : tables illisibles, couche non chargée`;
}

// Ouvre une couche du zip en /vsizip/, sans l'ajouter à la carte. Le format est passé à ouvrirCouche :
// Vision.qml ouvre un GeoTIFF par LayerUtils.loadRasterLayer (mission 024), le reste par loadVectorLayer.
function ouvrirDuZip(ctx, copie, c, suivi) {
  const source = sourceDeLaCouche(copie, c);
  if (source === '') return { couche: null, raison: 'illisible' };
  const o = chargerSansPlanter(function (s, n) { return ctx.ouvrirCouche(s, n, c.format); }, source, c.couche, undefined, suivi.liberer);
  suivi.suivre(o.couche);
  return o;
}

export function importerZip(ctx) {
  const suivi = creerSuivi(ctx);
  try {
    return importerZipSuivi(ctx, suivi);
  } finally {
    suivi.toutLiberer();
  }
}

function importerZipSuivi(ctx, suivi) {
  const vide = (message) => ({ chargees: [], refusees: [], ecartees: [], message });
  if (!ctx || !estUuid(ctx.visionId)) return vide("Projet non Vision (vision_id absent ou invalide) : rien n'est importé.");
  const nomZip = ctx.nomZip;
  if (!estNomDeZip(nomZip)) return vide(`Fichier refusé : « ${nomZip} » n'est pas un nom de zip simple (.zip).`);
  // Mission 053 (R2, point 5) : le dossier d'un zip est son nom sans « .zip » ; un zip dont le dossier serait celui du cache ONF
  // est refusé avant toute lecture (rien n'est copié ni inscrit).
  if (estDossierReserve(dossierDuZip(nomZip))) return vide(messageZipReserve(nomZip));
  if (!dossierProjetSain(ctx.dossierProjet)) return vide("Dossier du projet inconnu : rien n'est importé.");
  let noms;
  try {
    const o = octetsDe(ctx.octets);
    if (o.length > PLAFOND_LISTAGE_OCTETS) return vide(messageListageRefuse(nomZip, o.length));
    noms = nomsDuZip(o);
  } catch (e) {
    return vide(`${nomZip} : ${e.message}`);
  }
  const copie = cheminCopie(ctx.dossierProjet, nomZip);
  // Un .json n'est une couche que s'il est du GeoJSON (spec § 3.1). Mission 044 : un .json écarté (contenu
  // lisible qui n'est pas du GeoJSON, ou, plus bas, ouverture ratée) n'est PAS un refus : il est dit par la
  // ligne « <chemin> : pas une couche GeoJSON, ignoré » (Pascal, 5 novembre 2026), jamais perdu en silence.
  // Contenu illisible (cas de l'appareil, lireTexte rend null) : on tente le chargement.
  const couches = [];
  const ecartees = [];
  const ecarter = (c) => ecartees.push({ couche: c.couche, entree: c.entree, message: `${nomAffiche(c)} : ${PHRASE_JSON_ECARTE}` });
  const candidates = couchesDuZip(noms, tablesDesGpkg(ctx, copie, noms));
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.json && ctx.styles && typeof ctx.styles.estGeoJson === 'function' && typeof ctx.lireTexte === 'function') {
      let texte = null;
      try { texte = ctx.lireTexte(nomZip, c.entree); } catch (e) { texte = null; }
      if (typeof texte === 'string' && !ctx.styles.estGeoJson(texte)) { ecarter(c); continue; }
    }
    couches.push(c);
  }
  // Zip sans couche à traiter : message existant, puis les lignes d'écart.
  const sansCouche = () => {
    // Décision n° 11 : zip réimporté sans aucune couche lisible = import avorté (registre et carte
    // intacts : ce retour précède le retrait de la décision n° 8).
    const dejaImporte = lireRegistre(ctx.reglages, ctx.visionId).some((e) => e && typeof e === 'object' && e.zip === nomZip);
    const base = dejaImporte
      ? `aucune couche lisible dans ${nomZip}, rien changé`
      : `Aucune couche GeoJSON, Shapefile, GeoPackage ou GeoTIFF dans ${nomZip}.`;
    const r = vide([base].concat(ecartees.map((e) => e.message)).join('\n'));
    r.ecartees = ecartees;
    return r;
  };
  if (couches.length === 0) return sansCouche();
  // Mission 012 : le contrôle est obligatoire. Un service absent refuse tout (jamais « pas de
  // contrôle = tout passe »). Mission 010 (ADR 0008) : sans de quoi réécrire et écrire le .qml,
  // aucune couche n'est chargée non plus.
  for (const service of ['ouvrirCouche', 'decrireCouche', 'controlerCouche', 'ajouterALaCarte', 'reecrireCouche', 'ecrireFichier']) {
    if (typeof ctx[service] !== 'function') {
      return vide(`Contrôles d'import indisponibles (${service} absent) : rien n'est importé.`);
    }
  }
  // Mission 044 : un .json dont le contenu n'a pas pu être lu est ouvert d'abord ; s'il ne s'ouvre pas, il est
  // écarté (ligne d'écart, ni refus ni compté lisible). Un .geojson illisible, lui, reste refusé « illisible ».
  const ouvertesJson = {};
  for (let i = couches.length - 1; i >= 0; i--) {
    const c = couches[i];
    if (!c.json) continue;
    const o = ouvrirDuZip(ctx, copie, c, suivi);
    if (o.couche) { ouvertesJson[c.entree] = o; continue; }
    couches.splice(i, 1);
    ecarter(c);
  }
  // splice à rebours : remettre les lignes d'écart dans l'ordre du zip.
  ecartees.sort((a, b) => noms.indexOf(a.entree) - noms.indexOf(b.entree));
  if (couches.length === 0) return sansCouche();
  const maintenant = typeof ctx.maintenant === 'function' ? ctx.maintenant : () => new Date();
  // Un GeoPackage sans table à charger (table: null) n'est jamais ouvert ni compté comme présent.
  const aCharger = (c) => !(c.format === 'gpkg' && c.table === null);
  // Ouverture de toutes les couches AVANT de toucher au registre ou à la carte (décision n° 13) :
  // un zip réimporté dont aucune couche ne s'ouvre est un import avorté, rien n'est retiré.
  const ouvertes = {};
  const dejaImporte = lireRegistre(ctx.reglages, ctx.visionId).some((e) => e && typeof e === 'object' && e.zip === nomZip);
  if (dejaImporte) {
    let nbLisibles = 0;
    for (let i = 0; i < couches.length; i++) {
      const c = couches[i];
      if (!aCharger(c)) continue;
      if (c.json) { nbLisibles++; continue; } // déjà ouvert plus haut
      if (Object.prototype.hasOwnProperty.call(ouvertes, c.couche)) continue; // doublon : refusé plus bas
      const o = ouvrirDuZip(ctx, copie, c, suivi);
      ouvertes[c.couche] = o;
      if (o.couche) nbLisibles++;
    }
    if (nbLisibles === 0) return sansCouche();
  }
  // Retrait de la carte des couches de ce zip (réimport), seulement maintenant.
  if (typeof ctx.retirerLeZipDeLaCarte === 'function') ctx.retirerLeZipDeLaCarte(nomZip);
  // Décision n° 8 : le zip réimporté remplace l'ancien en entier. Les couches de ce zip qui n'y
  // sont plus sortent du registre (la copie du zip est écrasée par QField ; les copies des
  // couches, réécrites par saveVectorLayerAs).
  const presentes = {};
  for (let i = 0; i < couches.length; i++) if (aCharger(couches[i])) presentes[couches[i].couche] = true;
  const bilanEfface = { restes: [], nonVerifiable: false };
  const anciennes = lireRegistre(ctx.reglages, ctx.visionId);
  for (let i = 0; i < anciennes.length; i++) {
    const e = anciennes[i];
    if (e && typeof e === 'object' && e.zip === nomZip && !Object.prototype.hasOwnProperty.call(presentes, e.couche)) {
      retirer(ctx.reglages, ctx.visionId, { zip: nomZip, couche: e.couche });
      if (typeof e.chemin === 'string') {
        noterEffacement(bilanEfface, effacerFichiersDeCouche(ctx, nomZip, e.couche, lireRegistre(ctx.reglages, ctx.visionId)));
      }
    }
  }
  const chargees = [];
  const refusees = [];
  const avertissements = [];
  const vues = {};
  for (let i = 0; i < couches.length; i++) {
    const c = couches[i];
    const nom = nomAffiche(c);
    if (!aCharger(c)) {
      // GeoPackage aux tables illisibles ou sans table vecteur : refusé, jamais ouvert, voisins traités.
      const message = messageGpkgSansTable(c);
      refusees.push({ couche: c.couche, entree: c.entree, raison: message, message });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(vues, c.couche)) {
      // Décision n° 4 : même nom dans deux dossiers du zip, la seconde est refusée.
      const raison = `nom de couche en double dans le zip (déjà pris par ${vues[c.couche]})`;
      refusees.push({ couche: c.couche, entree: c.entree, raison, message: `${nom} : ${raison}` });
      continue;
    }
    vues[c.couche] = nom;
    const source = sourceDeLaCouche(copie, c);
    // Ouvrir (en /vsizip/, sans ajouter à la carte), contrôler, réécrire, styler, charger la copie,
    // puis seulement ajouter à la carte et inscrire.
    const r = (c.json && ouvertesJson[c.entree]) || ouvertes[c.couche] || ouvrirDuZip(ctx, copie, c, suivi);
    // Ouverture ratée : le contrôle passe quand même (lisible: false), pour que le contrôle 1
    // précède « illisible » et que le message porte le chemin complet dans le zip.
    const verdict = controlerSansPlanter(ctx, r.couche, c, noms);
    const refuser = (message) => {
      // Réimport : une couche acceptée au premier import puis refusée ne doit pas rester au registre.
      const etaitInscrite = lireRegistre(ctx.reglages, ctx.visionId).some((x) => memeCouche(x, nomZip, c.couche) && typeof x.chemin === 'string');
      retirer(ctx.reglages, ctx.visionId, { zip: nomZip, couche: c.couche });
      if (etaitInscrite) noterEffacement(bilanEfface, effacerFichiersDeCouche(ctx, nomZip, c.couche, lireRegistre(ctx.reglages, ctx.visionId)));
      refusees.push({ couche: c.couche, entree: c.entree, raison: message, message });
    };
    if (!verdict.charge) { refuser(verdict.message); continue; }
    // Un verdict d'acceptation ne vaut rien sur une couche qui ne s'est pas ouverte : jamais de copie d'une couche nulle.
    if (!r.couche) { refuser(nom + ' : couche illisible, couche refusée'); continue; }
    if (c.format === 'tif') {
      // GeoTIFF (ADR 0008, arbitrage n° 3) : lu dans le zip, style par défaut, sans réécriture ; au registre
      // par `chemin_vsi` (ADR 0003 amendée). Pas de readOnly : QgsRasterLayer n'a pas cette propriété
      // (QGIS 3a92eb3, src/core/raster/qgsrasterlayer.h ; elle est à QgsVectorLayer, qgsvectorlayer.h l. 420).
      for (let k = 0; k < verdict.avertissements.length; k++) avertissements.push(verdict.avertissements[k]);
      try {
        suivi.garder(r.couche);
        ctx.ajouterALaCarte(r.couche, c.couche, source, nomZip);
      } catch (e) {
        refuser(nom + ' : ajout à la carte impossible');
        continue;
      }
      inscrire(ctx.reglages, ctx.visionId, {
        zip: nomZip, couche: c.couche, chemin_vsi: nomZip + '/' + c.entree, style: STYLE_DEFAUT, ajoutee_le: maintenant().toISOString(),
      });
      chargees.push({ couche: c.couche, entree: c.entree, source, style: STYLE_DEFAUT });
      continue;
    }
    const cp = copierEtStyler(ctx, r.couche, c, nomZip, noms, suivi);
    // La couche ouverte dans le zip n'est jamais celle de la carte (la copie GeoPackage l'est) : libérée sans attendre.
    suivi.liberer(r.couche);
    if (!cp.ok) { refuser(cp.message); continue; }
    for (let k = 0; k < verdict.avertissements.length; k++) avertissements.push(verdict.avertissements[k]);
    for (let k = 0; k < cp.avertissements.length; k++) avertissements.push(nom + ' : ' + cp.avertissements[k]);
    try {
      cp.copie.readOnly = true;
      suivi.garder(cp.copie);
      ctx.ajouterALaCarte(cp.copie, c.couche, cp.rendu, nomZip);
    } catch (e) {
      refuser(nom + ' : ajout à la carte impossible');
      continue;
    }
    // Inscription après chaque couche (spec § 1, geste 5).
    const ligne = {
      zip: nomZip,
      couche: c.couche,
      chemin: cp.relatif,
      style: cp.style,
      ajoutee_le: maintenant().toISOString(),
    };
    if (cp.qml !== '') ligne.qml = cp.qml;
    inscrire(ctx.reglages, ctx.visionId, ligne);
    chargees.push({ couche: c.couche, entree: c.entree, source: cp.rendu, style: cp.style });
  }
  const lignes = [];
  if (chargees.length > 0) {
    lignes.push(`${chargees.length} ${pluriel(chargees.length, 'couche chargée', 'couches chargées')} : ${nomsDe(chargees)}`);
  } else {
    lignes.push(`Aucune couche chargée depuis ${nomZip}`);
  }
  for (let i = 0; i < refusees.length; i++) lignes.push(refusees[i].message || `${refusees[i].couche} : ${refusees[i].raison}`);
  for (let i = 0; i < ecartees.length; i++) lignes.push(ecartees[i].message);
  for (let i = 0; i < avertissements.length; i++) lignes.push(avertissements[i]);
  if (bilanEfface.restes.length > 0) lignes.push(`Fichiers restés sur l'appareil : ${bilanEfface.restes.join(', ')}.`);
  if (bilanEfface.nonVerifiable) lignes.push(PHRASE_NON_VERIFIABLE);
  return { chargees, refusees, ecartees, avertissements, message: lignes.join('\n') };
}

// --------------------------------------------------------------------------- fond embarqué (mission 048)

// basemap.mbtiles (QFieldSync, mission 046) posé à côté de vision.qgz. Chargé en lecture seule par GDAL (LayerUtils.loadRasterLayer,
// QField v4.3.7 qflayerutils.cpp l. 622-627), ajouté à la carte sans écriture dans le registre des imports. Sa place dans l'arbre
// est celle de QgsLayerTreeUtils::insertLayerAtOptimalPlacement (QGIS 3a92eb3, qgslayertreeutils.cpp l. 534-720) : sous les couches
// vecteur, au-dessus des fonds XYZ ; pas de déplacement (décision de Pascal, 5 novembre 2026).
export const NOM_FICHIER_FOND = 'basemap.mbtiles';
export const NOM_FOND_EMBARQUE = 'Fond embarqué (hors ligne)';
export const MESSAGE_FOND_ILLISIBLE = "Fond embarqué (basemap.mbtiles) : fichier illisible, il n'est pas affiché.";

// Vrai si `source` est le fond embarqué (chemin finissant par /basemap.mbtiles).
export function estSourceFondEmbarque(source) {
  const fin = '/' + NOM_FICHIER_FOND;
  return typeof source === 'string' && source.length > fin.length && source.substring(source.length - fin.length) === fin;
}

// Rend 'absent' (rien, sans message), 'deja' (une couche le lit déjà), 'ajoute' ou 'illisible'.
function chargerFondEmbarque(ctx, dossierProjet) {
  if (typeof ctx.fondDejaPresent !== 'function' || typeof ctx.existe !== 'function') return 'absent';
  const chemin = sansBarreFinale(dossierProjet) + '/' + NOM_FICHIER_FOND;
  let present = false;
  try { present = !!ctx.existe(chemin); } catch (e) { present = false; }
  if (!present) return 'absent';
  let deja = false;
  try { deja = !!ctx.fondDejaPresent(chemin); } catch (e) { deja = false; }
  if (deja) return 'deja';
  // Pas de `liberer` ici, volontairement : le chargeur de Vision.qml libère seul un fond invalide (CppOwnership) ;
  // en passer un autre donnerait une double libération.
  const r = chargerSansPlanter(ctx.chargerCouche, chemin, NOM_FOND_EMBARQUE);
  return r.couche ? 'ajoute' : 'illisible';
}

// --------------------------------------------------------------------------- ouvrir

export function demarrerProjet(ctx) {
  const inactif = { actif: false, boutonVisible: false, rechargees: [], absentes: [], illisibles: [], douteuses: 0, message: '' };
  if (!ctx) return inactif;
  const visionId = lireVisionId(ctx.variables);
  if (visionId === null) return inactif;
  const dossier = dossierCopies(ctx.dossierProjet);
  if (dossier === '') {
    return {
      actif: true, boutonVisible: true, visionId, rechargees: [], absentes: [], illisibles: [], douteuses: 0,
      message: 'Dossier du projet inconnu : aucune couche rechargée.',
    };
  }
  const etat = etatRegistre(ctx.reglages, visionId);
  const saines = [];
  let douteuses = 0;
  for (let i = 0; i < etat.liste.length; i++) {
    if (entreeSaine(etat.liste[i])) saines.push(etat.liste[i]); else douteuses++;
  }
  // Décision n° 5 : les entrées douteuses sont retirées aussitôt, sans rien effacer.
  if (douteuses > 0) ecrireRegistre(ctx.reglages, visionId, saines);
  // Mission 049 : le chargeur rend une couche invalide sans l'ajouter à la carte ; elle est libérée ici, une seule fois.
  const suivi = creerSuivi(ctx);
  const liberer = suivi.liberer;
  const presence = {};
  const rechargees = [];
  const absentes = [];
  const illisibles = [];
  const entreesCache = [];
  for (let i = 0; i < saines.length; i++) {
    const e = saines[i];
    // Mission 053 : le cache ONF est rechargé après les couches des zips (cache en tête de liste, arbitrage n° 6).
    if (e.cache !== undefined) { entreesCache.push(e); continue; }
    if (typeof e.chemin === 'string') {
      // Copie GeoPackage (ADR 0008) : rechargée depuis le disque, le zip n'est pas relu ; son .qml
      // est à côté, QGIS l'applique seul au chargement.
      if (!ctx.existe(dossier + '/' + e.chemin)) { absentes.push({ zip: e.zip, couche: e.couche, copie: true }); continue; }
      const rc = chargerSansPlanter(ctx.chargerCouche, dossier + '/' + e.chemin + '|layername=' + e.couche, e.couche, e.zip, liberer);
      if (!rc.couche) { illisibles.push({ zip: e.zip, couche: e.couche }); continue; }
      rc.couche.readOnly = true;
      rechargees.push({ zip: e.zip, couche: e.couche });
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(presence, e.zip)) presence[e.zip] = !!ctx.existe(dossier + '/' + e.zip);
    if (!presence[e.zip]) { absentes.push({ zip: e.zip, couche: e.couche }); continue; }
    const source = '/vsizip/' + dossier + '/' + e.chemin_vsi;
    const r = chargerSansPlanter(ctx.chargerCouche, source, e.couche, undefined, liberer);
    if (!r.couche) { illisibles.push({ zip: e.zip, couche: e.couche }); continue; }
    // Un GeoTIFF (mission 024) n'a pas de readOnly (propriété de QgsVectorLayer seulement, qgsvectorlayer.h l. 420).
    if (!estSourceRaster(source)) r.couche.readOnly = true;
    rechargees.push({ zip: e.zip, couche: e.couche });
  }
  // Mission 053, étape 3 : si le projet porte les trois couches du groupe « ONF Cache », il les lit lui-même (chemin fixe) ; sinon
  // (ancien vision.qgz) les couches du cache sont rechargées en tête de liste, comme avant.
  const ctxCache = Object.assign({}, ctx, { visionId: visionId });
  const reprise = reprendreBascule(ctxCache);
  const creation = creerCachesVides(ctxCache);
  creation.notes = reprise.notes.concat(creation.notes);
  creation.repriseIncomplete = reprise.ouverte && reprise.restaurees.length < CACHE_ONF.couches.length;
  creation.repriseFaite = reprise.ouverte && reprise.restaurees.length === CACHE_ONF.couches.length;
  const groupe = groupeDuProjet(ctx);
  const cache = groupe ? demarrerGroupeCache(ctxCache, groupe, entreesCache, creation) : rechargerCacheOnf(ctx, dossier, entreesCache);
  if (!groupe && creation.creees.length > 0) cache.creees = creation.creees;
  if (!groupe && creation.notes.length > 0) cache.notes = creation.notes;
  const fondEmbarque = chargerFondEmbarque(ctx, ctx.dossierProjet);
  const lignes = [];
  if (etat.illisible) lignes.push("registre illisible : il sera remplacé au prochain ajout d'un zip");
  if (douteuses > 0) {
    lignes.push(`${douteuses} ${pluriel(douteuses, 'entrée douteuse retirée', 'entrées douteuses retirées')} du registre (aucun fichier effacé)`);
  }
  const zipsAbsents = absentes.filter((a) => !a.copie).length;
  const copiesAbsentes = absentes.length - zipsAbsents;
  if (zipsAbsents > 0) {
    lignes.push(zipsAbsents === 1
      ? "1 couche n'a pas pu être rechargée : zip absent"
      : `${zipsAbsents} couches n'ont pas pu être rechargées : zip absent`);
  }
  if (copiesAbsentes > 0) {
    lignes.push(copiesAbsentes === 1
      ? "1 couche n'a pas pu être rechargée : copie absente (réimporter le zip)"
      : `${copiesAbsentes} couches n'ont pas pu être rechargées : copie absente (réimporter le zip)`);
  }
  if (illisibles.length > 0) {
    lignes.push(illisibles.length === 1
      ? `1 couche n'a pas pu être rechargée : illisible (${nomsDe(illisibles)})`
      : `${illisibles.length} couches n'ont pas pu être rechargées : illisibles (${nomsDe(illisibles)})`);
  }
  if (fondEmbarque === 'illisible') lignes.push(MESSAGE_FOND_ILLISIBLE);
  if (cache.manquantes.length > 0) lignes.push(TEXTES_CACHE_ONF.cacheIllisible);
  return {
    actif: true, boutonVisible: true, visionId, rechargees, absentes, illisibles, douteuses, fondEmbarque, cache,
    message: lignes.join('\n'),
  };
}

// --------------------------------------------------------------------------- retirer et effacer

// Garde avant rmFile (ADR 0007) : ne se fie à aucun argument. Le dossier doit être absolu, sans
// segment vide, « . » ou « .. », sans « \ », et finir exactement par « /vision-imports » sous un
// dossier de projet autre que la racine ; le chemin doit être dedans, sans segment douteux.
export function peutEffacer(chemin, dossier) {
  if (typeof chemin !== 'string' || typeof dossier !== 'string') return false;
  if (dossier.indexOf('\\') >= 0 || chemin.indexOf('\\') >= 0) return false;
  if (dossier.charAt(0) !== '/' || !segmentsSains(dossier.substring(1))) return false;
  const suffixe = '/' + NOM_DOSSIER_COPIES;
  if (dossier.length <= suffixe.length || dossier.substring(dossier.length - suffixe.length) !== suffixe) return false;
  if (chemin.indexOf(dossier + '/') !== 0) return false;
  return segmentsSains(chemin.substring(dossier.length + 1));
}

export function effacerCopie(platformUtilities, chemin, dossier) {
  const nom = nomDeFichier(chemin);
  if (!peutEffacer(chemin, dossier)) {
    return { efface: false, message: `Effacement refusé (hors du dossier des copies) : ${nom}` };
  }
  if (!platformUtilities || typeof platformUtilities.rmFile !== 'function') {
    return { efface: false, message: `Copie conservée sur l'appareil : ${nom}` };
  }
  let fait = false;
  try {
    fait = !!platformUtilities.rmFile(chemin);
  } catch (e) {
    fait = false;
  }
  return fait
    ? { efface: true, message: `Copie effacée : ${nom}` }
    : { efface: false, message: `Copie conservée sur l'appareil : ${nom}` };
}

export function retirerCouche(ctx) {
  if (!ctx || !estUuid(ctx.visionId)) {
    return { efface: false, message: "Projet non Vision (vision_id absent ou invalide) : rien n'est retiré." };
  }
  const zip = ctx.zip;
  const couche = ctx.couche;
  if (typeof ctx.retirerDeLaCarte === 'function') ctx.retirerDeLaCarte(couche);
  const avant = lireRegistre(ctx.reglages, ctx.visionId);
  let vectorielle = false;
  for (let i = 0; i < avant.length; i++) {
    if (memeCouche(avant[i], zip, couche) && typeof avant[i].chemin === 'string') vectorielle = true;
  }
  const r = retirer(ctx.reglages, ctx.visionId, { zip, couche });
  if (!r.retiree) return { efface: false, message: `Couche absente du registre : ${couche}.` };
  const debut = `Couche retirée : ${couche}.`;
  // Fichiers réécrits de la couche (mission 031) : après la carte et le registre, jamais bloquant.
  let phrase = '';
  if (vectorielle) {
    const b = effacerFichiersDeCouche(ctx, zip, couche, lireRegistre(ctx.reglages, ctx.visionId));
    if (b.restes.length > 0) phrase = ` Fichiers restés sur l'appareil : ${b.restes.join(', ')}.`;
    if (b.nonVerifiable) phrase += ` ${PHRASE_NON_VERIFIABLE}`;
  }
  if (!r.zipInutile) {
    const n = nombreDeCouchesDuZip(ctx.reglages, ctx.visionId, zip);
    return { efface: false, message: `${debut}${phrase} La copie ${zip} sert encore à ${n} ${pluriel(n, 'couche', 'couches')}.` };
  }
  if (!estNomDeZip(zip)) {
    return { efface: false, message: `${debut}${phrase} Nom de zip douteux au registre : aucun fichier effacé.` };
  }
  if (!dossierProjetSain(ctx.dossierProjet)) {
    return { efface: false, message: `${debut}${phrase} Dossier du projet inconnu : aucun fichier effacé (${zip}).` };
  }
  const e = effacerCopie(ctx.platformUtilities, cheminCopie(ctx.dossierProjet, zip), dossierCopies(ctx.dossierProjet));
  return { efface: e.efface, message: `${debut}${phrase} ${e.message}` };
}

// --------------------------------------------------------------------------- cache ONF (mission 053, étape 1 ter)

// Cache de zone des couches ONF (fiche pilotage/missions/053-couches-onf-wfs.md, arbitrages n° 1 et 5 à 7 ; preuves dans
// docs/referentiels/cache-zone-qfield.md). Voie B, prouvée sur le Samsung par la sonde (QField 4.3.8, essais n° 1 à 4) :
// GetFeature WFS 1.0.0 + BBOX par iface.createHttpRequest (Vision.qml), GML 2 écrit dans vision-imports/, ouvert par le
// pilote GML de GDAL avec un schéma .gfs écrit par Vision (système EPSG:2154 et type de géométrie fixés, champs réels du
// service, gml_id écarté), réécrit en GeoPackage par saveVectorLayerAs, style adapté écrit à côté (ADR 0008).
// Inscription : forme R2 corrigée (cache-zone-qfield.md § 4) : vision-imports/_cache-onf/<horodatage>/<couche>.gpkg.
// Plafonds (arbitrage n° 5) : 20 km de côté, 5 000 objets par couche ; une seule zone (arbitrage n° 7).
export const CACHE_ONF = {
  sorte: 'onf',
  service: 'http://ws.carmencarto.fr/WFS/105/ONF_Forets',
  dossier: '_cache-onf',
  // Étape 3 (docs/referentiels/cache-zone-qfield.md § 14) : groupe du projet modèle et chemin fixe de ses trois couches,
  // vision-imports/_cache-onf/actuel/<couche>.gpkg ; le plugin y bascule un cache contrôlé (renommage, puis reload()).
  groupe: 'ONF Cache',
  actuel: 'actuel',
  systeme: 'EPSG:2154',
  coteMax: 20000,
  objetsMax: 5000,
  // Champs : DescribeFeatureType de la mesure n° 1 (docs/referentiels/brut/onf/mesure-2026-11-25.md), tous String.
  // wkb : Qgis::WkbType (QGIS 3a92eb3) et type OGR du .gfs : 6 MultiPolygon, 1 Point.
  couches: [
    { couche: 'FOR_PUBL_FR', nom: 'Forêts publiques (© ONF)', wkb: 6, un: 'forêt', plusieurs: 'forêts',
      champs: ['iidtn_frt', 'llib_frt', 'cdom_frt', 'cinse_dep'] },
    { couche: 'PARC_PUBL_FR', nom: 'Parcelles forestières (© ONF)', wkb: 6, un: 'parcelle', plusieurs: 'parcelles',
      champs: ['iidtn_frt', 'llib_frt', 'ccod_prf'] },
    { couche: 'PRS_FR', nom: 'Points de secours (© ONF)', wkb: 1, un: 'point de rencontre', plusieurs: 'points de rencontre',
      champs: ['iidtn_prs', 'cinse_dep', 'loff_prs', 'cdfci_prs', 'ccod_cmat', 'ccod_ctps', 'llib_prs', 'lobs_prs', 'qlat_prs',
        'qlon_prs', 'qdis_prs', 'llib_com', 'cinse_com'] },
  ],
};

// Textes validés par Pascal le 25 novembre 2026 (« Je valide », fiche 053 ; puis « Arbitrages de Pascal sur le prototype »,
// aller-retour 1/3), mot pour mot ; nombres et date remplis ici. Noms des couches : CACHE_ONF.couches (attribution « © ONF »
// dans le nom : le plugin ne peut pas poser les droits de la couche, cache-zone-qfield.md § 12).
export const TEXTES_CACHE_ONF = {
  bouton: 'Mettre en cache les couches ONF de cette zone',
  pendant: 'Téléchargement des couches ONF…',
  zoneTropGrande: 'Zone trop grande (plus de 20 km de côté) : zoomez, puis recommencez.',
  pasDeReseau: "Pas de réseau : le cache ONF n'est pas mis à jour, l'ancien est gardé.",
  reponseIncomplete: "Réponse incomplète du service ONF : le cache n'est pas mis à jour, l'ancien est gardé.",
  // Écriture ou relecture refusée, contrôle raté, projet changé pendant le téléchargement, registre illisible.
  echecLocal: "Enregistrement du cache ONF impossible : le cache n'est pas mis à jour, l'ancien est gardé.",
  // Emprise hors de France métropolitaine en Lambert 93.
  horsFrance: "Carte hors de France métropolitaine : le cache ONF n'est pas mis à jour, l'ancien est gardé.",
  // Emprise de la carte illisible.
  positionIllisible: "Position de la carte illisible : le cache ONF n'est pas mis à jour, l'ancien est gardé.",
  // À la réouverture : une couche du cache absente ou illisible sur l'appareil.
  cacheIllisible: "Cache ONF illisible : il n'est pas affiché ; remettez-le en cache avec réseau.",
  // Mode groupe : une couche du projet était invalide au bouton (fichier absent créé à l'instant, illisible) : le cache est écrit à
  // actuel/ mais cette couche ne se relit qu'à la réouverture du projet (reload() ne rend pas valide une couche invalide).
  // Validé par Pascal le 26 novembre 2026.
  cachePret: "Cache ONF prêt : fermez puis rouvrez le projet pour l'afficher.",
};

export function messageZipReserve(nomZip) {
  return `${nomZip} : nom réservé par Vision (cache ONF), rien n'est importé.`;
}

// Insensible à la casse : la mémoire partagée d'Android ne distingue pas toujours « _CACHE-ONF » de « _cache-onf ».
export function estDossierReserve(nom) {
  return String(nom).toLowerCase() === CACHE_ONF.dossier;
}

export function coucheOnf(couche) {
  for (let i = 0; i < CACHE_ONF.couches.length; i++) if (CACHE_ONF.couches[i].couche === couche) return CACHE_ONF.couches[i];
  return null;
}

function nombreDe(n, c) {
  // « 1 point de rencontre », « 4 forêts » (exemple validé) ; 0 et 1 au singulier (usage du français).
  return n + ' ' + (n < 2 ? c.un : c.plusieurs);
}

function deuxChiffres(n) {
  return (n < 10 ? '0' : '') + n;
}

// Date affichée « JJ/MM/AAAA », à l'heure de l'appareil.
export function cacheDateAffichee(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!isFinite(d.getTime())) return '';
  return deuxChiffres(d.getDate()) + '/' + deuxChiffres(d.getMonth() + 1) + '/' + d.getFullYear();
}

// « 4 forêts, 53 parcelles, 1 point de rencontre » ; compte = { FOR_PUBL_FR: n, PARC_PUBL_FR: n, PRS_FR: n }.
function decompte(compte) {
  const parts = [];
  for (let i = 0; i < CACHE_ONF.couches.length; i++) {
    const c = CACHE_ONF.couches[i];
    parts.push(nombreDe(Number(compte[c.couche]) || 0, c));
  }
  return parts.join(', ');
}

export function messageCacheReussi(compte, date) {
  return `Couches ONF en cache : ${decompte(compte)} (zone du ${cacheDateAffichee(date)}).`;
}

export function messageTropDObjets(couche) {
  const c = coucheOnf(couche);
  return `Trop d'objets dans cette zone (plus de 5 000 ${c ? c.plusieurs : 'objets'}) : zoomez, puis recommencez.`;
}

// Horodatage d'une génération, en UTC : AAAAMMJJTHHMMSSZ (chiffres, « T », « Z » : nom de dossier sûr).
export function cacheHorodatage(date) {
  const d = date instanceof Date ? date : new Date();
  return '' + d.getUTCFullYear() + deuxChiffres(d.getUTCMonth() + 1) + deuxChiffres(d.getUTCDate())
    + 'T' + deuxChiffres(d.getUTCHours()) + deuxChiffres(d.getUTCMinutes()) + deuxChiffres(d.getUTCSeconds()) + 'Z';
}

const MOTIF_HORODATAGE = /^\d{8}T\d{6}Z$/;

// <dossier du projet>/vision-imports/_cache-onf ; '' si le dossier du projet n'est pas sain.
export function cacheDossier(dossierProjet) {
  const d = dossierCopies(dossierProjet);
  return d === '' ? '' : d + '/' + CACHE_ONF.dossier;
}

// Fichiers d'une couche d'une génération : relatif (au dossier du cache, celui du registre), gml, gfs, gpkg, qml (absolus).
export function cacheChemins(dossierProjet, horodatage, couche) {
  const base = cacheDossier(dossierProjet);
  if (base === '' || !MOTIF_HORODATAGE.test(String(horodatage)) || coucheOnf(couche) === null) return null;
  const racine = base + '/' + horodatage + '/' + couche;
  return { relatif: horodatage + '/' + couche + '.gpkg', gml: racine + '.gml', gfs: racine + '.gfs', gpkg: racine + '.gpkg', qml: racine + '.qml' };
}

// Suffixes des fichiers d'une couche du cache (annexes SQLite et GDAL comprises), pour l'effacement d'une génération.
// « .avant.gpkg » : le cache précédent, mis de côté le temps de la bascule (étape 3).
const SUFFIXES_CACHE = ['.gpkg', '.qml', '.gpkg-wal', '.gpkg-shm', '.gpkg.aux.xml', '.gml', '.gfs', '.avant.gpkg'];

// Garde avant toute écriture ou tout effacement dans le cache : <vision-imports>/_cache-onf/<horodatage>/<couche><suffixe>,
// rien d'autre (même garde de dossier que les copies : peutEffacer).
export function peutToucherCache(chemin, dossierImports) {
  if (!peutEffacer(chemin, dossierImports) || String(chemin).indexOf('|') >= 0) return false;
  const reste = String(chemin).substring(dossierImports.length + 1).split('/');
  if (reste.length !== 3 || reste[0] !== CACHE_ONF.dossier || !MOTIF_HORODATAGE.test(reste[1])) return false;
  for (let i = 0; i < CACHE_ONF.couches.length; i++) {
    for (let k = 0; k < SUFFIXES_CACHE.length; k++) if (reste[2] === CACHE_ONF.couches[i].couche + SUFFIXES_CACHE[k]) return true;
  }
  return false;
}

// ---- groupe « ONF Cache » du projet modèle (étape 3, voie C4 : docs/referentiels/cache-zone-qfield.md § 14)

// Source de la couche du projet, relative au dossier du projet : écrite telle quelle dans vision.qgz (outils/projet-modele.mjs).
// Un plugin ne peut pas changer le chemin d'une couche du projet (setDataSource n'est pas exposé à QML) : il est fixe.
export function cacheSourceProjet(couche) {
  if (coucheOnf(couche) === null) throw new Error('cache ONF : couche inconnue ' + couche);
  return './' + NOM_DOSSIER_COPIES + '/' + CACHE_ONF.dossier + '/' + CACHE_ONF.actuel + '/' + couche + '.gpkg|layername=' + couche;
}

// Fichiers d'une bascule vers actuel/ : le GeoPackage actuel (chemin fixe), celui de la nouvelle génération, la sauvegarde de
// l'actuel (dans la même génération), et les journaux SQLite à surveiller (un -wal resterait derrière un renommage).
export function cacheCheminsGroupe(dossierProjet, horodatage, couche) {
  const base = cacheDossier(dossierProjet);
  if (base === '' || !MOTIF_HORODATAGE.test(String(horodatage)) || coucheOnf(couche) === null) return null;
  const actuel = base + '/' + CACHE_ONF.actuel + '/' + couche + '.gpkg';
  const generation = base + '/' + horodatage + '/' + couche;
  return { relatif: CACHE_ONF.actuel + '/' + couche + '.gpkg', actuel: actuel, nouveau: generation + '.gpkg', sauvegarde: generation + '.avant.gpkg',
    wal: actuel + '-wal', walNouveau: generation + '.gpkg-wal' };
}

// Garde de tout renommage ou de toute écriture de GeoPackage vers actuel/ : <vision-imports>/_cache-onf/actuel/<couche>.gpkg,
// <vision-imports>/_cache-onf/<horodatage>/<couche>.gpkg ou <couche>.avant.gpkg, rien d'autre.
export function peutRenommerCache(chemin, dossierImports) {
  if (!peutEffacer(chemin, dossierImports) || String(chemin).indexOf('|') >= 0) return false;
  const reste = String(chemin).substring(dossierImports.length + 1).split('/');
  if (reste.length !== 3 || reste[0] !== CACHE_ONF.dossier) return false;
  const actuel = reste[1] === CACHE_ONF.actuel;
  if (!actuel && !MOTIF_HORODATAGE.test(reste[1])) return false;
  for (let i = 0; i < CACHE_ONF.couches.length; i++) {
    const c = CACHE_ONF.couches[i].couche;
    if (reste[2] === c + '.gpkg' || (!actuel && reste[2] === c + '.avant.gpkg')) return true;
  }
  return false;
}

// Réponse « zone sans objet » de MapServer (forme essayée sur le Samsung à l'essai C4 du 25 novembre 2026, pièce § 14 bis : GML + .gfs lus, écrits en GeoPackage
// de 0 objet) : de quoi fabriquer, sur un appareil déjà en service, le GeoPackage vide que le projet attend à son chemin fixe.
export function cacheGmlVide(couche) {
  if (coucheOnf(couche) === null) throw new Error('cache ONF : couche inconnue ' + couche);
  return "<?xml version='1.0' encoding=\"UTF-8\" ?>\n"
    + '<wfs:FeatureCollection xmlns:ms="http://mapserver.gis.umn.edu/mapserver" xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml">\n'
    + '   <gml:boundedBy>\n      <gml:null>missing</gml:null>\n   </gml:boundedBy>\n</wfs:FeatureCollection>\n';
}

// Entrée du registre : { cache: 'onf', couche, chemin: '<horodatage>/<couche>.gpkg' ou 'actuel/<couche>.gpkg', emprise, date (ISO), objets }.
function entreeDuCacheSaine(e) {
  if (e.cache !== CACHE_ONF.sorte || e.zip !== undefined || coucheOnf(e.couche) === null) return false;
  if (typeof e.chemin !== 'string' || e.chemin.indexOf('|') >= 0 || e.chemin.indexOf('\\') >= 0) return false;
  const segs = e.chemin.split('/');
  // Une génération (<horodatage>/<couche>.gpkg, mode ancien) ou le chemin fixe du groupe du projet (actuel/<couche>.gpkg).
  if (segs.length !== 2 || (!MOTIF_HORODATAGE.test(segs[0]) && segs[0] !== CACHE_ONF.actuel) || segs[1] !== e.couche + '.gpkg') return false;
  if (typeof e.objets !== 'number' || !(e.objets >= 0) || Math.floor(e.objets) !== e.objets || e.objets > CACHE_ONF.objetsMax) return false;
  return typeof e.date === 'string' && isFinite(new Date(e.date).getTime());
}

// Entrées saines du cache ONF, dans l'ordre de CACHE_ONF.couches.
export function entreesDuCache(liste) {
  const r = [];
  for (let i = 0; i < CACHE_ONF.couches.length; i++) {
    for (let k = 0; k < (liste || []).length; k++) {
      const e = liste[k];
      if (e && typeof e === 'object' && e.cache !== undefined && entreeDuCacheSaine(e) && e.couche === CACHE_ONF.couches[i].couche) { r.push(e); break; }
    }
  }
  return r;
}

// Entrées des zips seulement (liste « Couches ajoutées » du panneau, bouton « Retirer »).
export function entreesDesZips(liste) {
  const r = [];
  for (let i = 0; i < (liste || []).length; i++) if (liste[i] && typeof liste[i] === 'object' && liste[i].cache === undefined) r.push(liste[i]);
  return r;
}

// Ligne du panneau : « Cache ONF du 25/11/2026 : 4 forêts, 53 parcelles, 1 point de rencontre. » ; '' sans cache complet.
export function cacheLignePanneau(liste) {
  const e = entreesDuCache(liste);
  if (e.length !== CACHE_ONF.couches.length) return '';
  const compte = {};
  for (let i = 0; i < e.length; i++) compte[e[i].couche] = e[i].objets;
  return `Cache ONF du ${cacheDateAffichee(e[0].date)} : ${decompte(compte)}.`;
}

function empriseFinie(e) {
  return !!e && isFinite(e.xmin) && isFinite(e.ymin) && isFinite(e.xmax) && isFinite(e.ymax)
    && Number(e.xmin) < Number(e.xmax) && Number(e.ymin) < Number(e.ymax);
}

// Boîte englobante de points { x, y } en EPSG:2154 (les quatre coins de l'écran : carte tournée) ; null si vide ou non fini.
export function cacheEmpriseDesPoints(points) {
  if (!points || points.length === 0) return null;
  const r = { xmin: Infinity, ymin: Infinity, xmax: -Infinity, ymax: -Infinity };
  for (let i = 0; i < points.length; i++) {
    const x = Number(points[i] && points[i].x);
    const y = Number(points[i] && points[i].y);
    if (!isFinite(x) || !isFinite(y)) return null;
    if (x < r.xmin) r.xmin = x;
    if (x > r.xmax) r.xmax = x;
    if (y < r.ymin) r.ymin = y;
    if (y > r.ymax) r.ymax = y;
  }
  return r;
}

// Emprise demandée, en EPSG:2154 (x est, y nord) : refusée (jamais rognée, arbitrage n° 5 : « refus et demande de zoomer »)
// si plus de 20 km de côté ; refusée si illisible ou hors de l'emprise de vraisemblance de la France métropolitaine.
// Rend { ok, emprise, refus: '' | 'illisible' | 'trop-grande' | 'hors-france', message }.
export function cacheJugerEmprise(e, vraisemblance) {
  if (!empriseFinie(e)) return { ok: false, emprise: null, refus: 'illisible', message: TEXTES_CACHE_ONF.positionIllisible };
  const r = { xmin: Number(e.xmin), ymin: Number(e.ymin), xmax: Number(e.xmax), ymax: Number(e.ymax) };
  if (r.xmax - r.xmin > CACHE_ONF.coteMax || r.ymax - r.ymin > CACHE_ONF.coteMax) {
    return { ok: false, emprise: null, refus: 'trop-grande', message: TEXTES_CACHE_ONF.zoneTropGrande };
  }
  const v = vraisemblance;
  if (!v || r.xmin < v.xmin || r.xmax > v.xmax || r.ymin < v.ymin || r.ymax > v.ymax) {
    return { ok: false, emprise: null, refus: 'hors-france', message: TEXTES_CACHE_ONF.horsFrance };
  }
  return { ok: true, emprise: r, refus: '', message: '' };
}

// GetFeature WFS 1.0.0 (servi : mesure n° 1) : BBOX « xmin,ymin,xmax,ymax » en EPSG:2154, x puis y (pas d'inversion d'axes en
// 1.0.0), arrondie vers l'extérieur au mètre ; MAXFEATURES = plafond + 1 (5 001 objets reçus = plafond dépassé).
export function cacheUrlGetFeature(couche, e) {
  if (coucheOnf(couche) === null) throw new Error('cache ONF : couche inconnue ' + couche);
  const bbox = [Math.floor(e.xmin), Math.floor(e.ymin), Math.ceil(e.xmax), Math.ceil(e.ymax)].join(',');
  return `${CACHE_ONF.service}?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&TYPENAME=${couche}&BBOX=${bbox}&MAXFEATURES=${CACHE_ONF.objetsMax + 1}`;
}

function compter(texte, motif) {
  const m = texte.match(motif);
  return m ? m.length : 0;
}

// Analyse d'une réponse GetFeature reçue en texte (QfXmlHttpRequest.responseText, décodé en UTF-8). Une réponse coupée après
// les en-têtes arrive par onload avec un texte tronqué (QField qfxmlhttprequest.cpp l. 622-631) : seule la fin de collection
// prouve qu'elle est complète ; MapServer renvoie ses exceptions en HTTP 200.
export function cacheAnalyserReponse(texte) {
  const t = String(texte === undefined || texte === null ? '' : texte);
  const decl = /^\s*<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(t);
  const exception = /<ServiceExceptionReport\b|<ServiceException\b/.test(t);
  const nbObjets = compter(t, /<gml:featureMember[\s>]/g);
  return {
    encodage: decl ? decl[1] : '',
    complete: !exception && /<\/(?:[A-Za-z0-9_]+:)?FeatureCollection>\s*$/.test(t),
    exception: exception,
    nbObjets: nbObjets,
    remplacements: compter(t, /�/g),
  };
}

// Jugement d'une réponse : r = { statut, texte, erreur }. Contrôle de complétude obligatoire (fiche, étape 1 ter) : fin de
// collection, aucune exception, nombre d'objets au plus 5 000. Statut 0 (aucune réponse : réseau absent, délai, annulation)
// = « Pas de réseau » ; tout autre défaut de la réponse (HTTP autre que 200, exception, coupure, encodage autre que UTF-8 ou
// caractères illisibles : accents perdus) = « Réponse incomplète ». Rend { ok, refus, nbObjets, message }.
export function cacheJugerReponse(couche, r) {
  const statut = Number(r && r.statut);
  const texte = r && typeof r.texte === 'string' ? r.texte : '';
  if (!(statut > 0)) return { ok: false, refus: 'reseau', nbObjets: 0, message: TEXTES_CACHE_ONF.pasDeReseau };
  const incomplete = { ok: false, refus: 'incomplete', nbObjets: 0, message: TEXTES_CACHE_ONF.reponseIncomplete };
  if (statut !== 200 || texte === '') return incomplete;
  const a = cacheAnalyserReponse(texte);
  if (!a.complete || a.remplacements > 0 || (a.encodage !== '' && !/^utf-?8$/i.test(a.encodage))) return incomplete;
  if (a.nbObjets > CACHE_ONF.objetsMax) return { ok: false, refus: 'trop', nbObjets: a.nbObjets, message: messageTropDObjets(couche) };
  return { ok: true, refus: '', nbObjets: a.nbObjets, message: '' };
}

// Élément de géométrie des objets d'une réponse de MapServer (« msGeometry » par défaut) : le premier élément dont le premier
// enfant est une géométrie GML. Sans objet : « msGeometry ».
export function cacheElementGeometrie(texte) {
  const m = /<(?:[A-Za-z0-9_]+:)?([A-Za-z0-9_]+)>\s*<gml:(?:Point|MultiPoint|LineString|MultiLineString|Polygon|MultiPolygon|MultiGeometry)\b/.exec(String(texte));
  return m ? m[1] : 'msGeometry';
}

function xmlTexte(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Schéma GML de GDAL (.gfs) d'une couche : il fixe le système (EPSG:2154 ; les réponses sont lues en « système inconnu »
// sans lui, essais n° 2 à 4 de la sonde) et le type de géométrie (MultiPolygon ou Point ; GDAL force chaque objet à ce type
// à la lecture, ogrgmllayer.cpp l. 389 de GDAL 3.12.4), et ne déclare que les champs réels du service (ni « coordinates »
// ni boundedBy). Lu avant tout schéma XSD distant (ogrgmldatasource.cpp l. 861-886 et 910 : aucun DescribeFeatureType).
export function cacheGfs(couche, elementGeometrie) {
  const c = coucheOnf(couche);
  if (c === null) throw new Error('cache ONF : couche inconnue ' + couche);
  const g = xmlTexte(elementGeometrie || 'msGeometry');
  const champs = c.champs.map((f) => `    <PropertyDefn>\n      <Name>${f}</Name>\n      <ElementPath>${f}</ElementPath>\n      <Type>String</Type>\n    </PropertyDefn>\n`).join('');
  return '<GMLFeatureClassList>\n  <GMLFeatureClass>\n'
    + `    <Name>${c.couche}</Name>\n    <ElementPath>${c.couche}</ElementPath>\n`
    + `    <GeometryName>${g}</GeometryName>\n    <GeometryElementPath>${g}</GeometryElementPath>\n`
    + `    <GeometryType>${c.wkb}</GeometryType>\n    <SRSName>${CACHE_ONF.systeme}</SRSName>\n`
    + champs + '  </GMLFeatureClass>\n</GMLFeatureClassList>\n';
}

// Source OGR du GML reçu : le .gfs est écrit APRÈS le GML, à côté et sous le même nom ; GDAL le lit alors de lui-même, avant
// tout schéma XSD distant, s'il n'est pas plus ancien que le GML (ogrgmldatasource.cpp l. 861-886 de GDAL 3.12.4). L'option
// GFS_TEMPLATE n'est PAS employée : elle fait rechercher dans le GML les couches présentes (PrescanForTemplate, l. 849-857),
// et une réponse sans objet ne s'ouvre plus (essai GDAL 3.8.4, tests/cache-onf-053.test.mjs). Option d'ouverture passée par
// « |option: » (QGIS 3a92eb3, qgsogrprovidermetadata.cpp l. 228-270 ; qgsogrprovider.cpp l. 434, analyzeURI, puis open() l. 4392-4523 : écriture tentée, puis lecture seule)
// : EXPOSE_GML_ID=NO
// (sans elle, gml_id est ajouté à toute réponse WFS, ogrgmldatasource.cpp l. 520 et 567-571).
export function cacheSourceGml(chemins, couche) {
  return chemins.gml + '|layername=' + couche + '|option:EXPOSE_GML_ID=NO';
}

// Comptage complet par itérateur (au plus objetsMax + 1). -1 si illisible.
export function compterObjets(couche, creerIterateur) {
  let it = null;
  let n = 0;
  try {
    it = creerIterateur(couche);
    if (!it) throw new Error('itérateur absent');
    while (n <= CACHE_ONF.objetsMax && it.hasNext()) { it.next(); n++; }
  } catch (e) {
    n = -1;
  }
  if (it) { try { it.close(); } catch (e) { /* sans effet */ } }
  return n;
}

// Préparation d'un cache : projet Vision, dossier du projet, emprise. ctx = { visionId, dossierProjet, emprise, vraisemblance,
// maintenant }. Rend { ok, message, emprise, horodatage, date }.
export function cachePreparer(ctx) {
  const refus = (m) => ({ ok: false, message: m, emprise: null, horodatage: '', date: null });
  if (!ctx || !estUuid(ctx.visionId) || cacheDossier(ctx.dossierProjet) === '') return refus(TEXTES_CACHE_ONF.echecLocal);
  const j = cacheJugerEmprise(ctx.emprise, ctx.vraisemblance);
  if (!j.ok) return refus(j.message);
  const date = typeof ctx.maintenant === 'function' ? ctx.maintenant() : new Date();
  return { ok: true, message: '', emprise: j.emprise, horodatage: cacheHorodatage(date), date: date, visionId: ctx.visionId, dossierProjet: ctx.dossierProjet };
}

// Efface les fichiers d'une génération (toutes les couches), sous la garde peutToucherCache. Ne lève jamais.
function effacerGeneration(ctx, horodatage) {
  try {
    const dossierImports = dossierCopies(ctx.dossierProjet);
    for (let i = 0; i < CACHE_ONF.couches.length; i++) {
      const p = cacheChemins(ctx.dossierProjet, horodatage, CACHE_ONF.couches[i].couche);
      if (p === null) continue;
      const base = p.gpkg.substring(0, p.gpkg.length - '.gpkg'.length);
      for (let k = 0; k < SUFFIXES_CACHE.length; k++) {
        const chemin = base + SUFFIXES_CACHE[k];
        if (!peutToucherCache(chemin, dossierImports)) continue;
        try { if (typeof ctx.existe === 'function' && !ctx.existe(chemin)) continue; } catch (e) { continue; }
        try { ctx.effacerFichier(chemin); } catch (e) { /* fichier resté : sans effet sur le cache affiché */ }
      }
    }
  } catch (e) { /* jamais d'exception */ }
}

function effacerFichierCache(ctx, chemin) {
  try { if (peutToucherCache(chemin, dossierCopies(ctx.dossierProjet))) ctx.effacerFichier(chemin); } catch (e) { /* sans effet */ }
}

function systemeDe(couche) {
  try { return String(couche.crs.authid || ''); } catch (e) { return ''; }
}

function wkbDe(couche) {
  try { return Number(couche.wkbType()); } catch (e) { return NaN; }
}

// Description d'une couche pour le diagnostic : chaque lecture protégée.
export function decrireCoucheCache(ctx, couche) {
  const d = { valide: false, systeme: '', description: '', wkb: NaN, objets: -1, emprise: null, champs: [] };
  if (!couche) return d;
  try { d.valide = couche.isValid; } catch (e) { d.valide = 'erreur'; }
  d.systeme = systemeDe(couche);
  try { d.description = String(couche.crs.description || ''); } catch (e) { d.description = ''; }
  d.wkb = wkbDe(couche);
  try { d.objets = compterObjets(couche, ctx.creerIterateur); } catch (e) { d.objets = -1; }
  try { d.emprise = lireEmprise(couche); } catch (e) { d.emprise = null; }
  try { d.champs = [].concat(couche.fields.names); } catch (e) { d.champs = []; }
  return d;
}

// Emprise d'une couche du cache : bornes finies, xmin <= xmax et ymin <= ymax. Une emprise plate est valable (un seul point
// de rencontre, ou des points sur une même ligne : essai sur le Samsung, aller-retour 3/3) ; empriseFinie, stricte, reste
// celle de l'emprise de la carte.
function empriseDeCoucheFinie(e) {
  return !!e && isFinite(e.xmin) && isFinite(e.ymin) && isFinite(e.xmax) && isFinite(e.ymax)
    && Number(e.xmin) <= Number(e.xmax) && Number(e.ymin) <= Number(e.ymax);
}

// Contrôle d'une couche ouverte (GML reçu ou GeoPackage relu) : valide, EPSG:2154, type fixé, nombre d'objets attendu,
// emprise dans la France métropolitaine (s'il y a des objets). Rend '' si bonne, sinon la raison (journal du dev, jamais affichée).
function controlerCoucheCache(ctx, couche, c, attendus) {
  if (!couche || couche.isValid !== true) return 'illisible';
  if (systemeDe(couche) !== CACHE_ONF.systeme) return 'système ' + (systemeDe(couche) || 'inconnu');
  if (wkbDe(couche) !== c.wkb) return 'type de géométrie ' + wkbDe(couche);
  const n = compterObjets(couche, ctx.creerIterateur);
  if (n !== attendus) return n + ' objets lus, ' + attendus + ' attendus';
  if (n > 0) {
    let e = null;
    try { e = lireEmprise(couche); } catch (x) { e = null; }
    const v = ctx.vraisemblance;
    if (!empriseDeCoucheFinie(e) || !v || e.xmin < v.xmin || e.xmax > v.xmax || e.ymin < v.ymin || e.ymax > v.ymax) return 'emprise hors de France';
  }
  return '';
}

// Une couche : GML et .gfs écrits, GML ouvert et contrôlé, GeoPackage écrit, style écrit à côté (mode ancien seulement : en mode
// groupe, le style est celui du projet), GeoPackage relu et contrôlé. Rend { ok, couche (la copie relue), raison }.
function enregistrerCouche(ctx, c, reponse, horodatage, avecStyle) {
  const p = cacheChemins(ctx.dossierProjet, horodatage, c.couche);
  const dossierImports = dossierCopies(ctx.dossierProjet);
  // Diagnostic (aller-retour 2/3) : étape, couche en cause décrite, chemins, présence des fichiers ; jamais affiché.
  let etape = 'chemins';
  let enCause = null;
  let rendu = '';
  const present = (chemin) => { try { return typeof ctx.existe === 'function' ? !!ctx.existe(chemin) : 'inconnu'; } catch (e) { return 'erreur'; } };
  const echec = (raison) => ({ ok: false, couche: null, raison: c.couche + ' : ' + raison, etape: etape, details: {
    couche: c.couche, chemins: p, rendu: rendu, nbObjetsRecus: reponse.nbObjets,
    gmlPresent: p ? present(p.gml) : '', gfsPresent: p ? present(p.gfs) : '', gpkgPresent: p ? present(p.gpkg) : '',
    qmlPresent: p ? present(p.qml) : '', source: p ? cacheSourceGml(p, c.couche) : '',
    coucheEnCause: enCause === null ? null : decrireCoucheCache(ctx, enCause) } });
  if (p === null) return echec('chemins');
  for (const k of ['gml', 'gfs', 'gpkg', 'qml']) if (!peutToucherCache(p[k], dossierImports)) return echec('chemin refusé ' + p[k]);
  etape = 'style';
  const style = avecStyle && ctx.styles && typeof ctx.styles[c.couche] === 'string' ? ctx.styles[c.couche] : '';
  if (avecStyle && style === '') return echec('style absent');
  etape = 'écriture du GML et du .gfs';
  let ecrit = false;
  try { ecrit = ctx.ecrireFichier(p.gml, reponse.texte) === true; } catch (e) { ecrit = false; }
  if (!ecrit) return echec('écriture du GML refusée');
  try { ecrit = ctx.ecrireFichier(p.gfs, cacheGfs(c.couche, cacheElementGeometrie(reponse.texte))) === true; } catch (e) { ecrit = false; }
  if (!ecrit) return echec('écriture du .gfs refusée');
  etape = 'ouverture du GML';
  // Couches de travail : jamais libérées. Qt 6.10.3 cache deleteLater à QML et destroy() refuse une couche en CppOwnership
  // (cache-zone-qfield.md § 10) : elles restent en mémoire jusqu'à la fermeture de QField (fuite bornée, 3 couches par cache).
  let g = null;
  try { g = ctx.ouvrirCouche(cacheSourceGml(p, c.couche), c.couche); } catch (e) { g = null; }
  enCause = g;
  if (!g || g.isValid !== true) return echec('GML illisible');
  etape = 'contrôle du GML';
  // Système imposé (QgsMapLayer::crs, Q_PROPERTY en écriture, QGIS 3a92eb3 qgsmaplayer.h l. 90) : le .gfs le donne déjà ;
  // seul un système absent est complété, un autre système connu est refusé par le contrôle.
  if (systemeDe(g) === '') { try { ctx.imposerSysteme(g); } catch (e) { /* refusé au contrôle */ } }
  const r1 = controlerCoucheCache(ctx, g, c, reponse.nbObjets);
  if (r1 !== '') return echec('GML : ' + r1);
  etape = 'réécriture en GeoPackage';
  try { rendu = String(ctx.reecrireCouche(g, p.gpkg) || ''); } catch (e) { rendu = ''; }
  if (rendu !== p.gpkg) return echec('GeoPackage non écrit (' + rendu + ')');
  if (avecStyle) {
    etape = 'écriture du style';
    try { ecrit = ctx.ecrireFichier(p.qml, style) === true; } catch (e) { ecrit = false; }
    if (!ecrit) return echec('style non écrit');
  }
  let copie = null;
  etape = 'contrôle du GeoPackage relu';
  try { copie = ctx.ouvrirCouche(p.gpkg + '|layername=' + c.couche, c.nom); } catch (e) { copie = null; }
  enCause = copie;
  const r2 = controlerCoucheCache(ctx, copie, c, reponse.nbObjets);
  if (r2 !== '') return echec('GeoPackage : ' + r2);
  return { ok: true, couche: copie, raison: '' };
}

// ---- mode groupe (étape 3, voie C4 : docs/referentiels/cache-zone-qfield.md § 14)

// Les trois couches du groupe « ONF Cache » du projet (marques vision/cache=onf et vision/couche, ctx.coucheDuGroupe(couche) dans
// Vision.qml), ou null : le mode groupe exige les trois ; sinon (ancien vision.qgz) le mode ancien (en tête de liste) reste.
function groupeDuProjet(ctx) {
  if (!ctx || typeof ctx.coucheDuGroupe !== 'function') return null;
  const g = {};
  for (let i = 0; i < CACHE_ONF.couches.length; i++) {
    let l = null;
    try { l = ctx.coucheDuGroupe(CACHE_ONF.couches[i].couche); } catch (e) { l = null; }
    if (!l) return null;
    g[CACHE_ONF.couches[i].couche] = l;
  }
  return g;
}

// Une exception de existe() vaut « présent » : dans le doute, jamais d'écriture sur un fichier peut-être rempli ni de renommage vers
// une cible peut-être existante (renameFile s'appelle avec « overwrite » vrai, comme à l'essai C4, et l'effacerait).
function presentSur(ctx, chemin) {
  try { return !!ctx.existe(chemin); } catch (e) { return true; }
}

// Renommage gardé : jamais hors des chemins du cache, jamais vers un fichier existant (ou peut-être existant).
function renommerCache(ctx, de, vers) {
  const dossierImports = dossierCopies(ctx.dossierProjet);
  if (!peutRenommerCache(de, dossierImports) || !peutRenommerCache(vers, dossierImports) || presentSur(ctx, vers)) return false;
  try { return ctx.renommer(de, vers) === true; } catch (e) { return false; }
}

// I2 : retour arrière incomplet. La reprise est notée dans les réglages (clé du registre + '/reprise') : génération qui porte les
// sauvegardes .avant.gpkg et entrées du registre d'avant ; à l'ouverture suivante reprendreBascule remet les sauvegardes à actuel/.
function cleReprise(visionId) {
  return cleRegistre(visionId) + '/reprise';
}

function noterReprise(ctx, horodatage, entrees) {
  try {
    ctx.reglages.setValue(cleReprise(ctx.visionId), JSON.stringify({ horodatage: horodatage, entrees: entrees }));
    // Le registre ne dit plus ce qui s'affiche : on ne le sait plus.
    remplacerEntreesCache(ctx, []);
  } catch (e) { /* le diagnostic de l'échec dit la raison */ }
}

// À l'ouverture, avant toute création de GeoPackage vide : reprend les sauvegardes d'une bascule dont le retour arrière a échoué.
// Rend { ouverte, restaurees, notes }. `ouverte` : une reprise était notée ; elle est close (même incomplète : les notes la disent).
function reprendreBascule(ctx) {
  const r = { ouverte: false, restaurees: [], notes: [] };
  let brut = '';
  try { brut = ctx.reglages.value(cleReprise(ctx.visionId), ''); } catch (e) { brut = ''; }
  if (brut === undefined || brut === null || brut === '') return r;
  let m = null;
  try { m = JSON.parse(String(brut)); } catch (e) { m = null; }
  r.ouverte = true;
  if (!m || !MOTIF_HORODATAGE.test(String(m.horodatage)) || typeof ctx.renommer !== 'function' || typeof ctx.existe !== 'function') {
    r.notes.push('reprise : note illisible ou services absents');
    try { ctx.reglages.setValue(cleReprise(ctx.visionId), ''); } catch (e) { /* sans effet */ }
    return r;
  }
  for (let i = 0; i < CACHE_ONF.couches.length; i++) {
    const code = CACHE_ONF.couches[i].couche;
    const p = cacheCheminsGroupe(ctx.dossierProjet, m.horodatage, code);
    if (p === null) continue;
    if (presentSur(ctx, p.actuel)) { r.notes.push('reprise : ' + code + ' : actuel présent' + (presentSur(ctx, p.sauvegarde) ? ' ET sauvegarde présente (' + p.sauvegarde + ')' : '')); continue; }
    if (!presentSur(ctx, p.sauvegarde)) { r.notes.push('reprise : ' + code + ' : ni actuel ni sauvegarde'); continue; }
    if (renommerCache(ctx, p.sauvegarde, p.actuel)) r.restaurees.push(code); else r.notes.push('reprise : ' + code + ' : renommage de la sauvegarde refusé');
  }
  if (r.restaurees.length === CACHE_ONF.couches.length) {
    r.notes.push('reprise : les trois sauvegardes remises à actuel/ (couches du projet à relire : rouvrir le projet)');
    try { if (Array.isArray(m.entrees) && m.entrees.length > 0) remplacerEntreesCache(ctx, m.entrees); } catch (e) { r.notes.push('reprise : registre non rétabli'); }
  } else {
    r.notes.push('reprise : incomplète, registre laissé sans entrées de cache');
  }
  try { ctx.reglages.setValue(cleReprise(ctx.visionId), ''); } catch (e) { /* sans effet */ }
  return r;
}

// Bascule par renommage (§ 14.2), tout ou rien. Pour chaque couche : le GeoPackage actuel est mis de côté (<génération>/<couche>.avant.gpkg),
// puis celui de la génération prend sa place (actuel/<couche>.gpkg) ; ensuite reload() et triggerRepaint() sur les couches du projet
// (ctx.recharger), et contrôle de ce que la couche AFFICHE (valide, nombre d'objets attendu). Au moindre refus ou écart : renommages
// inverses (ordre inverse), nouveau reload. `attendus` = { <couche>: nombre d'objets }. Rend { ok, raison, etape, details, defait,
// defaire() } : `defait` vrai si l'état d'avant est rétabli (ou n'a jamais changé) ; `defaire()` rend les renommages inverses
// réussis (à appeler si l'inscription au registre échoue après une bascule réussie). Ne lève jamais.
function basculerGeneration(ctx, groupe, horodatage, attendus, invalides) {
  const aRouvrir = invalides || [];
  const fait = [];
  const plan = [];
  const rechargerTout = () => {
    for (let i = 0; i < CACHE_ONF.couches.length; i++) {
      if (aRouvrir.indexOf(CACHE_ONF.couches[i].couche) >= 0) continue; // couche invalide : reload() ne la répare pas
      try { ctx.recharger(groupe[CACHE_ONF.couches[i].couche]); } catch (e) { /* contrôlé ensuite */ }
    }
  };
  const renommer = (de, vers) => renommerCache(ctx, de, vers);
  const defaire = () => {
    const rates = [];
    for (let i = fait.length - 1; i >= 0; i--) {
      if (renommer(fait[i].vers, fait[i].de)) fait.splice(i, 1); else rates.push(fait[i].vers + ' -> ' + fait[i].de);
    }
    rechargerTout();
    return rates;
  };
  const echec = (raison, etape, details, avecRetour) => {
    let rates = [];
    if (avecRetour) rates = defaire();
    const incomplet = rates.length > 0;
    return { ok: false, raison: raison + (incomplet ? ' ; retour arrière incomplet : ' + rates.join(', ') : ''), etape: etape, defait: !incomplet,
      details: Object.assign({ horodatage: horodatage, retourArriere: incomplet ? rates : 'complet', renommages: fait.length }, details || {}) };
  };
  for (let i = 0; i < CACHE_ONF.couches.length; i++) {
    const c = CACHE_ONF.couches[i];
    const p = cacheCheminsGroupe(ctx.dossierProjet, horodatage, c.couche);
    if (p === null) return echec(c.couche + ' : chemins', 'bascule : plan', null, false);
    if (!presentSur(ctx, p.nouveau)) return echec(c.couche + ' : GeoPackage de la génération absent', 'bascule : plan', { chemin: p.nouveau }, false);
    if (presentSur(ctx, p.wal) || presentSur(ctx, p.walNouveau)) return echec(c.couche + ' : journal SQLite (-wal) présent à côté du GeoPackage', 'bascule : plan', { wal: presentSur(ctx, p.wal) ? p.wal : p.walNouveau }, false);
    if (presentSur(ctx, p.sauvegarde)) return echec(c.couche + ' : sauvegarde déjà présente', 'bascule : plan', { chemin: p.sauvegarde }, false);
    plan.push({ c: c, p: p, avait: presentSur(ctx, p.actuel) });
  }
  for (let i = 0; i < plan.length; i++) {
    const x = plan[i];
    if (x.avait) {
      if (!renommer(x.p.actuel, x.p.sauvegarde)) return echec(x.c.couche + ' : renommage refusé (actuel mis de côté)', 'bascule : renommage', { de: x.p.actuel, vers: x.p.sauvegarde }, true);
      fait.push({ de: x.p.actuel, vers: x.p.sauvegarde });
    }
    if (!renommer(x.p.nouveau, x.p.actuel)) return echec(x.c.couche + ' : renommage refusé (nouveau vers actuel)', 'bascule : renommage', { de: x.p.nouveau, vers: x.p.actuel }, true);
    fait.push({ de: x.p.nouveau, vers: x.p.actuel });
  }
  rechargerTout();
  const ecarts = [];
  for (let i = 0; i < plan.length; i++) {
    const code = plan[i].c.couche;
    if (aRouvrir.indexOf(code) >= 0) continue; // affichée à la réouverture seulement (texte « Cache ONF prêt… »)
    const l = groupe[code];
    let valide = false;
    try { valide = l.isValid === true; } catch (e) { valide = false; }
    const n = valide ? compterObjets(l, ctx.creerIterateur) : -1;
    if (!valide || n !== attendus[code]) ecarts.push(code + ' : ' + (valide ? n + ' objets affichés, ' + attendus[code] + ' attendus' : 'couche invalide après reload'));
  }
  if (ecarts.length > 0) return echec('la couche affichée n\'est pas celle attendue (' + ecarts.join(' ; ') + ')', 'bascule : relecture', { ecarts: ecarts }, true);
  return { ok: true, raison: '', etape: 'bascule', details: null, defait: false, defaire: defaire, plan: plan };
}

// Remplace les entrées du cache ONF du registre par `entrees`, les autres (zips) gardées dans leur ordre.
function remplacerEntreesCache(ctx, entrees) {
  const garde = [];
  const liste = lireRegistre(ctx.reglages, ctx.visionId);
  for (let i = 0; i < liste.length; i++) if (!(liste[i] && typeof liste[i] === 'object' && liste[i].cache === CACHE_ONF.sorte)) garde.push(liste[i]);
  ecrireRegistre(ctx.reglages, ctx.visionId, garde.concat(entrees));
}

// Enregistrement du cache, une fois les trois réponses reçues et jugées bonnes (tout ou rien, arbitrage n° 7) :
// ctx = { visionId, dossierProjet, reglages, horodatage, date, emprise, reponses: { <couche>: { texte, nbObjets } }, styles,
//   vraisemblance, ecrireFichier, effacerFichier, existe, ouvrirCouche(uri, nom), creerIterateur, imposerSysteme(couche),
//   reecrireCouche(couche, cible), et selon le mode :
//   mode groupe (le projet porte les trois couches marquées : coucheDuGroupe(couche) les rend) : renommer(de, vers), recharger(couche) ;
//   mode ancien (ancien vision.qgz) : retirerCacheDeLaCarte(), ajouterCache(couche, nomCouche) }.
// Les trois couches sont écrites dans une NOUVELLE génération et contrôlées ; seulement si les trois passent :
// - mode groupe : bascule par renommage vers actuel/ et reload() (basculerGeneration), registre sur actuel/, sauvegardes effacées ;
//   la couche du projet n'est jamais ajoutée ni retirée de la carte ;
// - mode ancien : l'ancien cache quitte la carte, le nouveau y entre (en tête de liste, lecture seule), registre remplacé,
//   ancienne génération effacée.
// Sinon la nouvelle génération est effacée, l'ancien cache reste affiché et inscrit. Rend { ok, message, compte, raison }.
// `ctx.depart` (facultatif) : { visionId, dossierProjet } au moment du bouton ; un autre projet ouvert pendant le
// téléchargement fait tout refuser (même garde que zipRecu dans Vision.qml). Registre illisible : refus, il n'est pas
// remplacé par le cache (seul l'ajout d'un zip le remplace, comme le dit le message d'ouverture de demarrerProjet).
export function cacheEnregistrer(ctx) {
  const echec = (raison, etape, details) => ({ ok: false, message: TEXTES_CACHE_ONF.echecLocal, compte: null, raison: raison,
    etape: etape || 'contexte', details: details || null });
  if (!ctx || !estUuid(ctx.visionId) || cacheDossier(ctx.dossierProjet) === '' || !MOTIF_HORODATAGE.test(String(ctx.horodatage))) return echec('contexte');
  if (ctx.depart && (ctx.depart.visionId !== ctx.visionId || ctx.depart.dossierProjet !== ctx.dossierProjet)) return echec('projet changé pendant le téléchargement');
  if (etatRegistre(ctx.reglages, ctx.visionId).illisible) return echec('registre illisible');
  const groupe = groupeDuProjet(ctx);
  const invalides = [];
  const services = ['ecrireFichier', 'effacerFichier', 'ouvrirCouche', 'creerIterateur', 'imposerSysteme', 'reecrireCouche']
    .concat(groupe ? ['renommer', 'recharger'] : ['retirerCacheDeLaCarte', 'ajouterCache']);
  for (const s of services) {
    if (typeof ctx[s] !== 'function') return echec('service absent : ' + s);
  }
  if (groupe) {
    // Une couche du projet invalide (fichier absent ou illisible à l'ouverture) ne se répare pas par reload() (QgsMapLayer::reload ne passe
    // pas par setValid, § 14.1) : le cache est quand même posé à actuel/, elle le lira à la réouverture (texte « Cache ONF prêt… »).
    // Avant toute écriture : un -wal à côté d'un GeoPackage actuel serait rejoué sur un autre fichier.
    for (let i = 0; i < CACHE_ONF.couches.length; i++) {
      const code = CACHE_ONF.couches[i].couche;
      let valide = false;
      try { valide = groupe[code].isValid === true; } catch (e) { valide = false; }
      if (!valide) invalides.push(code);
      const p = cacheCheminsGroupe(ctx.dossierProjet, ctx.horodatage, code);
      if (p !== null && presentSur(ctx, p.wal)) return echec(code + ' : journal SQLite (-wal) à côté du GeoPackage actuel', 'groupe : -wal', { wal: p.wal });
    }
  }
  const anciennes = entreesDuCache(lireRegistre(ctx.reglages, ctx.visionId));
  const copies = [];
  const compte = {};
  for (let i = 0; i < CACHE_ONF.couches.length; i++) {
    const c = CACHE_ONF.couches[i];
    const rep = ctx.reponses ? ctx.reponses[c.couche] : null;
    if (!rep || typeof rep.texte !== 'string' || typeof rep.nbObjets !== 'number') { effacerGeneration(ctx, ctx.horodatage); return echec(c.couche + ' : réponse absente'); }
    let r = null;
    try {
      r = enregistrerCouche(ctx, c, rep, ctx.horodatage, !groupe);
    } catch (e) {
      r = { ok: false, raison: c.couche + ' : exception', etape: 'exception', details: { couche: c.couche, exception: texteException(e) } };
    }
    if (!r.ok) { effacerGeneration(ctx, ctx.horodatage); return echec(r.raison, r.etape, r.details); }
    copies.push({ c: c, couche: r.couche });
    compte[c.couche] = rep.nbObjets;
  }
  const date = ctx.date instanceof Date ? ctx.date : new Date();
  const entrees = (chemin) => CACHE_ONF.couches.map((c) => ({ cache: CACHE_ONF.sorte, couche: c.couche, chemin: chemin(c), emprise: ctx.emprise,
    date: date.toISOString(), objets: compte[c.couche] }));
  if (groupe) {
    // Les trois passent : bascule dans le projet (jamais d'ajout ni de retrait de couche).
    const b = basculerGeneration(ctx, groupe, ctx.horodatage, compte, invalides);
    if (!b.ok) {
      // Retour arrière incomplet : la génération (et la sauvegarde de l'ancien cache qu'elle porte) n'est PAS effacée ; la reprise est
      // notée (reprendreBascule à l'ouverture) et le registre ne dit plus rien du cache.
      if (b.defait) effacerGeneration(ctx, ctx.horodatage); else noterReprise(ctx, ctx.horodatage, anciennes);
      return echec(b.raison, b.etape, b.details);
    }
    try {
      remplacerEntreesCache(ctx, entrees((c) => CACHE_ONF.actuel + '/' + c.couche + '.gpkg'));
    } catch (e) {
      const rates = b.defaire();
      if (rates.length === 0) effacerGeneration(ctx, ctx.horodatage); else noterReprise(ctx, ctx.horodatage, anciennes);
      return echec('registre non écrit : ' + texteException(e) + (rates.length > 0 ? ' ; retour arrière incomplet : ' + rates.join(', ') : ''), 'registre', null);
    }
    // Fichiers de travail et sauvegardes de l'ancien cache, effacés une fois le registre à jour (le GeoPackage de la génération est
    // devenu l'actuel : effacerGeneration ne le trouve plus à son ancien nom).
    effacerGeneration(ctx, ctx.horodatage);
  } else {
    // Les trois passent : remplacement en tête de liste.
    try { ctx.retirerCacheDeLaCarte(); } catch (e) { /* l'ajout suit */ }
    for (let i = 0; i < copies.length; i++) {
      try { copies[i].couche.readOnly = true; } catch (e) { /* lecture seule : propriété de QgsVectorLayer */ }
      try { ctx.ajouterCache(copies[i].couche, copies[i].c.couche); } catch (e) { /* le registre fait foi à la réouverture */ }
    }
    remplacerEntreesCache(ctx, entrees((c) => ctx.horodatage + '/' + c.couche + '.gpkg'));
    // Fichiers de travail de la nouvelle génération (l'ancienne est effacée plus bas, jamais celle qu'on vient d'écrire).
    for (let i = 0; i < CACHE_ONF.couches.length; i++) {
      const p = cacheChemins(ctx.dossierProjet, ctx.horodatage, CACHE_ONF.couches[i].couche);
      if (p !== null) { effacerFichierCache(ctx, p.gml); effacerFichierCache(ctx, p.gfs); }
    }
  }
  const vues = {};
  for (let i = 0; i < anciennes.length; i++) {
    const h = anciennes[i].chemin.split('/')[0];
    if (h !== ctx.horodatage && h !== CACHE_ONF.actuel && !vues[h]) { vues[h] = true; effacerGeneration(ctx, h); }
  }
  if (groupe && invalides.length > 0) return { ok: true, message: TEXTES_CACHE_ONF.cachePret, compte: compte, raison: '', affichage: 'reouverture', invalides: invalides };
  return { ok: true, message: messageCacheReussi(compte, date), compte: compte, raison: '' };
}

// ---- ouverture du projet en mode groupe (§ 14.3 et § 14.4)

// Crée le GeoPackage vide d'une couche à son chemin fixe, par la voie prouvée (GML sans objet + .gfs écrits, ouverts par GDAL,
// réécrits par saveVectorLayerAs : essai C4 du 25 novembre 2026, « vide : valide, 0 objet »). Jamais sur un fichier existant
// (saveVectorLayerAs écrase sans contrôle) ; le GeoPackage créé n'est PAS rouvert par une couche de travail (son jeu de données GDAL
// serait partagé avec la couche du projet, et fausserait la relecture après une bascule). Rend '' si créé, sinon la raison.
function creerCacheVide(ctx, c, horodatage) {
  for (const s of ['ecrireFichier', 'effacerFichier', 'ouvrirCouche', 'creerIterateur', 'reecrireCouche']) {
    if (typeof ctx[s] !== 'function') return 'service absent : ' + s;
  }
  const dossierImports = dossierCopies(ctx.dossierProjet);
  const p = cacheChemins(ctx.dossierProjet, horodatage, c.couche);
  const g = cacheCheminsGroupe(ctx.dossierProjet, horodatage, c.couche);
  if (p === null || g === null) return 'chemins';
  if (!peutToucherCache(p.gml, dossierImports) || !peutToucherCache(p.gfs, dossierImports) || !peutRenommerCache(g.actuel, dossierImports)) return 'chemin refusé';
  if (presentSur(ctx, g.actuel)) return 'fichier déjà présent';
  let raison = '';
  try {
    if (ctx.ecrireFichier(p.gml, cacheGmlVide(c.couche)) !== true) return 'écriture du GML refusée';
    if (ctx.ecrireFichier(p.gfs, cacheGfs(c.couche, 'msGeometry')) !== true) return 'écriture du .gfs refusée';
    const l = ctx.ouvrirCouche(cacheSourceGml(p, c.couche), c.couche);
    if (!l || l.isValid !== true) return 'GML vide illisible';
    if (systemeDe(l) === '' && typeof ctx.imposerSysteme === 'function') { try { ctx.imposerSysteme(l); } catch (e) { /* refusé au contrôle */ } }
    raison = controlerCoucheCache(ctx, l, c, 0);
    if (raison !== '') return 'GML vide : ' + raison;
    const rendu = String(ctx.reecrireCouche(l, g.actuel) || '');
    if (rendu !== g.actuel) return 'GeoPackage non écrit (' + rendu + ')';
    return '';
  } catch (e) {
    return 'exception : ' + texteException(e);
  } finally {
    effacerFichierCache(ctx, p.gml);
    effacerFichierCache(ctx, p.gfs);
  }
}

// À toute ouverture d'un projet Vision, y compris avec l'ancien vision.qgz (§ 14.3, « plugin d'abord, puis vision.qgz ») : crée les
// GeoPackage vides absents de vision-imports/_cache-onf/actuel/, pour que le nouveau vision.qgz, copié ensuite, ne produise pas la
// page « Impossible de charger certaines couches ». Sans les services d'écriture, rien n'est tenté. Rend { creees, notes }.
function creerCachesVides(ctx) {
  const r = { creees: [], notes: [] };
  const services = ['existe', 'ecrireFichier', 'effacerFichier', 'ouvrirCouche', 'creerIterateur', 'reecrireCouche'].every((s) => typeof ctx[s] === 'function');
  if (!services) return r;
  const maintenant = typeof ctx.maintenant === 'function' ? ctx.maintenant() : new Date();
  const horodatage = cacheHorodatage(maintenant);
  for (let i = 0; i < CACHE_ONF.couches.length; i++) {
    const c = CACHE_ONF.couches[i];
    const g = cacheCheminsGroupe(ctx.dossierProjet, horodatage, c.couche);
    if (g === null || presentSur(ctx, g.actuel)) continue;
    const raison = creerCacheVide(ctx, c, horodatage);
    if (raison === '') r.creees.push(c.couche); else r.notes.push(c.couche + ' : GeoPackage vide non créé (' + raison + ')');
  }
  return r;
}

// Ouverture du projet en mode groupe : QGIS a déjà lu les trois couches du projet ; il reste (1) à migrer un cache en génération vers
// actuel/ (§ 14.4 : hors réseau), (2) à dire ce qui n'est pas affiché. Aucune couche n'est ajoutée, retirée ni libérée.
// `creation` : ce que creerCachesVides vient de faire (un fichier créé à l'instant ne rend pas valide la couche du projet).
// Rend { rechargees (couches valides), manquantes (non affichées, texte « Cache ONF illisible… »), creees, migrees, notes }.
function demarrerGroupeCache(ctx, groupe, entrees, creation) {
  const bilan = { rechargees: [], manquantes: [], creees: creation.creees.slice(), migrees: [], notes: creation.notes.slice() };
  // Migration : trois entrées, toutes en génération, de la même génération.
  const cache = entreesDuCache(entrees);
  const enGeneration = cache.filter((e) => e.chemin.split('/')[0] !== CACHE_ONF.actuel);
  // Couches dont le cache enregistré (en génération) n'a pas été migré : non affichées.
  let nonMigrees = [];
  if (enGeneration.length > 0) {
    const h = enGeneration[0].chemin.split('/')[0];
    const memeGeneration = enGeneration.length === CACHE_ONF.couches.length && enGeneration.every((e) => e.chemin.split('/')[0] === h);
    const services = typeof ctx.renommer === 'function' && typeof ctx.recharger === 'function' && typeof ctx.creerIterateur === 'function';
    const valides = CACHE_ONF.couches.every((c) => { try { return groupe[c.couche].isValid === true; } catch (e) { return false; } });
    const attendus = {};
    for (const e of enGeneration) attendus[e.couche] = e.objets;
    if (!memeGeneration) { nonMigrees = enGeneration.map((e) => e.couche); bilan.notes.push('migration : génération incomplète ou mêlée dans le registre'); }
    else if (!services) { nonMigrees = enGeneration.map((e) => e.couche); bilan.notes.push('migration : services de bascule absents'); }
    else if (!valides) { nonMigrees = enGeneration.map((e) => e.couche); bilan.notes.push('migration : une couche du projet est invalide (fichier créé à l\'instant : rouvrir le projet)'); }
    else {
      const b = basculerGeneration(ctx, groupe, h, attendus);
      if (!b.ok) {
        nonMigrees = enGeneration.map((e) => e.couche);
        bilan.notes.push('migration : ' + b.raison + ' (' + b.etape + ')');
        if (!b.defait) noterReprise(ctx, h, enGeneration);
      }
      else {
        try {
          const nouvelles = enGeneration.map((e) => Object.assign({}, e, { chemin: CACHE_ONF.actuel + '/' + e.couche + '.gpkg' }));
          remplacerEntreesCache(ctx, nouvelles);
          effacerGeneration(ctx, h);
          bilan.migrees = CACHE_ONF.couches.map((c) => c.couche);
        } catch (e) {
          nonMigrees = enGeneration.map((e) => e.couche);
          const rates = b.defaire();
          if (rates.length > 0) noterReprise(ctx, h, enGeneration);
          bilan.notes.push('migration : registre non écrit (' + texteException(e) + ')' + (rates.length > 0 ? ' ; retour arrière incomplet' : ''));
        }
      }
    }
  }
  for (let i = 0; i < CACHE_ONF.couches.length; i++) {
    const code = CACHE_ONF.couches[i].couche;
    let valide = false;
    try { valide = groupe[code].isValid === true; } catch (e) { valide = false; }
    // Un fichier créé à l'instant ne rend pas valide la couche du projet (reload() ne la répare pas) : QField a sa propre page ;
    // le plugin ne dit « illisible » que d'une couche dont le fichier existait ou d'un cache enregistré mais non affiché.
    if (nonMigrees.indexOf(code) >= 0 || creation.repriseIncomplete) bilan.manquantes.push(code);
    else if (valide) bilan.rechargees.push(code);
    else if (bilan.creees.indexOf(code) < 0 || creation.repriseFaite) bilan.manquantes.push(code);
  }
  return bilan;
}

// Réouverture du projet : couches du cache rechargées depuis le disque (sans réseau), marquées par ctx.chargerCache(source,
// nomAffiche, couche) (Vision.qml), en lecture seule ; son .qml voisin est appliqué par QGIS au chargement (ADR 0008).
// Sans ctx.chargerCache : rien n'est chargé. Rend { rechargees, manquantes } (noms des couches du service).
// Une couche invalide n'est PAS libérée (aucun `liberer` passé) : libererCouche appelle deleteLater, que Qt 6.10.3 cache à
// QML (cache-zone-qfield.md § 10) ; elle reste en mémoire jusqu'à la fermeture de QField.
function rechargerCacheOnf(ctx, dossier, entrees) {
  const bilan = { rechargees: [], manquantes: [] };
  if (typeof ctx.chargerCache !== 'function' || entrees.length === 0) return bilan;
  for (let i = 0; i < entrees.length; i++) {
    const e = entrees[i];
    const c = coucheOnf(e.couche);
    const chemin = dossier + '/' + CACHE_ONF.dossier + '/' + e.chemin;
    let present = false;
    try { present = !!ctx.existe(chemin); } catch (x) { present = false; }
    if (!present) { bilan.manquantes.push(e.couche); continue; }
    const r = chargerSansPlanter(function (s, n) { return ctx.chargerCache(s, n, e.couche); }, chemin + '|layername=' + e.couche, c.nom);
    if (!r.couche) { bilan.manquantes.push(e.couche); continue; }
    try { r.couche.readOnly = true; } catch (x) { /* propriété de QgsVectorLayer */ }
    bilan.rechargees.push(e.couche);
  }
  return bilan;
}

// --------------------------------------------------------------------------- diagnostic du cache ONF (aller-retour 2/3)

// Essai n° 1 du prototype sur le Samsung (QField 4.3.8) : « Enregistrement du cache ONF impossible… » sans autre indice. À chaque
// échec du cache, Vision.qml écrit le diagnostic ci-dessous dans vision-imports/_cache-onf/dernier-echec.txt (écrasé à chaque
// échec) et dans le journal de QField (console.log). Le texte affiché reste le texte validé.
export const NOM_DIAGNOSTIC_CACHE = 'dernier-echec.txt';

export function cacheCheminDiagnostic(dossierProjet) {
  const d = cacheDossier(dossierProjet);
  return d === '' ? '' : d + '/' + NOM_DIAGNOSTIC_CACHE;
}

// Texte d'une exception, avec sa pile et sa ligne si le moteur les donne (QML : lineNumber, fileName, stack).
export function texteException(e) {
  if (e === undefined || e === null) return '';
  let t = '';
  try { t = String(e); } catch (x) { t = 'exception illisible'; }
  try { if (e.fileName || e.lineNumber) t += ' (' + (e.fileName || '?') + ':' + (e.lineNumber || '?') + ')'; } catch (x) { /* sans effet */ }
  try { if (e.stack) t += '\n' + String(e.stack); } catch (x) { /* sans effet */ }
  return t;
}

function valeurDiagnostic(v) {
  if (v === undefined) return 'non défini';
  if (v === null) return 'aucun';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

// Début et fin d'un texte reçu (réponse du service), pour le diagnostic.
export function extraitReponse(texte, n) {
  const t = String(texte === undefined || texte === null ? '' : texte);
  const k = n || 300;
  return t.length <= 2 * k ? t : t.slice(0, k) + '\n[… ' + (t.length - 2 * k) + ' caractères …]\n' + t.slice(t.length - k);
}

// d = { date, vision, qfield, etape, couche, raison, exception, message, contexte, details } ; une ligne par élément connu.
export function cacheTexteDiagnostic(d) {
  const x = d || {};
  const date = x.date instanceof Date ? x.date : new Date();
  const lignes = ['Vision, cache ONF : dernier échec', 'Date : ' + date.toISOString(),
    'Vision ' + valeurDiagnostic(x.vision) + ' ; QField ' + valeurDiagnostic(x.qfield),
    'Étape : ' + valeurDiagnostic(x.etape), 'Message affiché : ' + valeurDiagnostic(x.message)];
  if (x.couche) lignes.push('Couche : ' + x.couche);
  if (x.raison) lignes.push('Raison : ' + x.raison);
  if (x.exception) lignes.push('Exception : ' + x.exception);
  const ajouter = (titre, o) => {
    if (!o || typeof o !== 'object') return;
    for (const k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'emprise' && k !== 'chemins') ajouter(titre + k + '.', v);
      else lignes.push(titre + k + ' : ' + valeurDiagnostic(v));
    }
  };
  ajouter('contexte.', x.contexte);
  ajouter('', x.details);
  return lignes.join('\n') + '\n';
}
