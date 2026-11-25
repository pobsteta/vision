#!/usr/bin/env node
// Mission 053, étape 1 : mesure du service WFS de l'ONF (couches FOR_PUBL_FR, PARC_PUBL_FR, PRS_FR)
// avant tout changement de vision.qgz. Le service ne répond qu'en http : la mesure tourne dans
// GitHub Actions (.github/workflows/mesure-wfs-onf.yml), pas dans la session cloud.
//
// Usage : node outils/mesure-wfs-onf.mjs <dossier-de-sortie> [--service URL]
// Nécessite GDAL (ogr2ogr, ogrinfo) dans le PATH. Aucune clé, aucun secret.
// La logique pure (analyse, comparaison, rapport) est exportée et testée hors réseau
// (tests/mesure-wfs-onf.test.mjs) ; la partie réseau est dans `mesurer`, appelée seulement en ligne de commande.
// Cet outil ne tranche rien : il mesure et écrit ; les décisions sont à Pascal.
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const SERVICE = 'http://ws.carmencarto.fr/WFS/105/ONF_Forets?';

// `configuresObligatoires` : pour les points de secours, Pascal demande que les champs listés par le .qml existent.
// Pour les deux autres, seuls les champs d'étiquette sont obligatoires ; la liste du .qml est donnée à titre d'information
// (celle de RDF_FRT.qml contient des champs d'un autre jeu de données).
export const COUCHES = [
  { nom: 'FOR_PUBL_FR', qml: 'RDF_FRT.qml', configuresObligatoires: false },
  { nom: 'PARC_PUBL_FR', qml: 'RDF_Parc.qml', configuresObligatoires: false },
  { nom: 'PRS_FR', qml: 'Point_de_rencontre_des_secours_en_frt.qml', configuresObligatoires: true },
];

const decoder = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const balise = (xml, nom) => {
  const m = xml.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`));
  return m ? decoder(m[1].trim()) : null;
};

// GetCapabilities WFS 1.0.0 -> service et liste des couches.
export function analyserCapabilities(xml) {
  const service = {
    titre: balise(xml, 'Title'), fees: balise(xml, 'Fees'),
    accessConstraints: balise(xml, 'AccessConstraints'), url: balise(xml, 'OnlineResource'),
  };
  const couches = [];
  for (const m of xml.matchAll(/<FeatureType>([\s\S]*?)<\/FeatureType>/g)) {
    const b = m[1];
    couches.push({
      nom: balise(b, 'Name'), titre: balise(b, 'Title'), srs: balise(b, 'SRS'),
      metadataUrl: balise(b, 'MetadataURL'),
    });
  }
  return { service, couches };
}

const attr = (balise_, nom) => {
  const m = balise_.match(new RegExp(`(?:^|\\s)${nom}="([^"]*)"`));
  return m ? m[1] : null;
};

// DescribeFeatureType (schéma XSD de MapServer) -> champs (hors géométrie) et géométrie.
export function analyserDescribeFeatureType(xml) {
  const sortie = { nom: null, champs: [], geometrie: null };
  if (!xml) return sortie;
  for (const m of xml.matchAll(/<(?:\w+:)?element\b([^>]*?)\/?>/g)) {
    const a = m[1];
    const nom = attr(a, 'name');
    const type = attr(a, 'type');
    if (!nom || !type) continue;
    if (/substitutionGroup=/.test(a)) { sortie.nom = nom; continue; }
    if (/^gml:.*PropertyType$/.test(type)) { sortie.geometrie = { nom, type }; continue; }
    sortie.champs.push({ nom, type: type.replace(/^(?:xs|xsd):/, ''), obligatoire: attr(a, 'minOccurs') !== '0' });
  }
  return sortie;
}

// .qml -> champs lus : étiquettes (fieldName=) et champs listés par la configuration des champs.
export function champsDuStyle(qml) {
  const unique = (l) => [...new Set(l)];
  const etiquettes = unique([...qml.matchAll(/\sfieldName="([^"]+)"/g)].map((m) => m[1]));
  const bloc = qml.match(/<fieldConfiguration>([\s\S]*?)<\/fieldConfiguration>/);
  const configures = bloc ? unique([...bloc[1].matchAll(/<field name="([^"]+)"/g)].map((m) => m[1])) : [];
  return { etiquettes, configures };
}

// Les noms de champs sont comparés à l'identique (QGIS respecte la casse) ; un écart de casse est signalé.
export function comparerChampsStyle(champsCouche, { obligatoires, informatifs }) {
  const present = new Set(champsCouche);
  const parCasse = new Map(champsCouche.map((c) => [c.toLowerCase(), c]));
  const manquants = obligatoires.filter((c) => !present.has(c));
  const informatifsManquants = informatifs.filter((c) => !present.has(c));
  const casse = [...manquants, ...informatifsManquants]
    .filter((c) => parCasse.has(c.toLowerCase())).map((c) => ({ style: c, couche: parCasse.get(c.toLowerCase()) }));
  return { ok: manquants.length === 0, manquants, informatifsManquants, casse };
}

export function champsAttendus(couche, qml) {
  const s = champsDuStyle(qml);
  const obligatoires = couche.configuresObligatoires ? unique2(s.etiquettes, s.configures) : s.etiquettes;
  const informatifs = s.configures.filter((c) => !obligatoires.includes(c));
  return { obligatoires, informatifs };
}
const unique2 = (a, b) => [...new Set([...a, ...b])];

// Comptage demandé en WFS 1.1.0 : MapServer 7.0 n'écrit numberOfFeatures qu'en 1.1.0 (numberMatched en 2.0.0) ;
// en 1.0.0 la réponse n'a pas de nombre. Le téléchargement, lui, reste en 1.0.0 (arbitré après mesure).
export function urlGetFeatureHits(base, couche, version = '1.1.0') {
  return `${base}SERVICE=WFS&VERSION=${version}&REQUEST=GetFeature&TYPENAME=${encodeURIComponent(couche)}&RESULTTYPE=hits`;
}

// Exception de service (MapServer la renvoie souvent en HTTP 200).
export function estException(xml) {
  return /<(?:\w+:)?(?:ServiceExceptionReport|ExceptionReport)\b/.test(xml || '');
}

// Version écrite par le serveur dans sa réponse GetCapabilities.
export function versionAnnoncee(xml) {
  if (!xml) return { version: null, exception: false };
  if (estException(xml)) return { version: null, exception: true };
  const m = xml.match(/<(?:\w+:)?WFS_Capabilities\b[^>]*?\sversion="([^"]+)"/);
  return { version: m ? m[1] : null, exception: false };
}

// GetCapabilities sans VERSION puis dans chaque version : on enregistre ce que le serveur sert réellement.
export function urlsCapabilities(base) {
  return [null, '1.0.0', '1.1.0', '2.0.0'].map((demandee) => ({
    demandee,
    url: `${base}SERVICE=WFS&${demandee ? `VERSION=${demandee}&` : ''}REQUEST=GetCapabilities`,
  }));
}

// L'adresse de la fiche porte l'uuid dans un fragment (#/metadata/<uuid>) que fetch ne transmet pas.
export function uuidMetadonnee(url) {
  const m = (url || '').match(/#\/metadata\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Formes d'API GeoNetwork À ESSAYER (non vérifiées) : les réponses sont enregistrées telles quelles.
export function urlsMetadonnees(url) {
  const uuid = uuidMetadonnee(url);
  if (!uuid) return [];
  const h = new URL(url).origin;
  return [
    { nom: 'api-records-srv', url: `${h}/geonetwork/srv/api/records/${uuid}`, accept: 'application/xml' },
    { nom: 'api-records-105', url: `${h}/geonetwork/105/api/records/${uuid}`, accept: 'application/xml' },
    { nom: 'formatter-xml-srv', url: `${h}/geonetwork/srv/api/records/${uuid}/formatters/xml`, accept: 'application/xml' },
    { nom: 'xml-metadata-get', url: `${h}/geonetwork/srv/fre/xml.metadata.get?uuid=${uuid}`, accept: 'application/xml' },
  ];
}

export const TAILLE_PAGE = 5000;

export function hitsDepuisReponse(xml) {
  const m = (xml || '').match(/\b(?:numberOfFeatures|numberMatched)="(\d+)"/);
  return m ? Number(m[1]) : null;
}

// Compare le nombre annoncé (resultType=hits) au nombre téléchargé.
export function statutComptage(hits, nombre) {
  if (hits == null) {
    return { statut: 'inconnu', message: `resultType=hits indisponible : risque de troncature non écarté (${nombre ?? '?'} objets reçus ; une limite du serveur donnerait un nombre rond ou constant).` };
  }
  if (nombre == null) return { statut: 'inconnu', message: 'nombre téléchargé inconnu (téléchargement en échec ?).' };
  if (hits === nombre) return { statut: 'complet', message: `${nombre} objets reçus sur ${hits} annoncés.` };
  return { statut: 'tronque', message: `TRONCATURE : ${nombre} objets reçus sur ${hits} annoncés.` };
}

// Sortie de `ogrinfo -json -so -al` -> résumé.
export function resumerOgrinfo(j) {
  const couche = (j && j.layers && j.layers[0]) || {};
  const g = (couche.geometryFields && couche.geometryFields[0]) || null;
  let systeme = null;
  const id = g && g.coordinateSystem && g.coordinateSystem.projjson && g.coordinateSystem.projjson.id;
  if (id && id.authority && id.code != null) systeme = `${id.authority}:${id.code}`;
  return {
    nombre: couche.featureCount ?? null,
    emprise: (g && g.extent) || null,
    systeme,
    geometrie: (g && g.type) || null,
    champs: (couche.fields || []).map((f) => ({ nom: f.name, type: f.type })),
  };
}

export function argsOgr2ogr(base, couche, sortie) {
  // Version dans l'URL : le pilote WFS de GDAL 3.8 ignore l'option d'ouverture VERSION (et négocie 2.0.0).
  // Pagination (STARTINDEX + MAXFEATURES) : vérifiée en WFS 1.0.0 avec GDAL 3.8. GML_EXPOSE_GML_ID=NO : MapServer n'écrit pas de gml:id (« fid not specified »), or le gml_id que GDAL ajoute sinon est NOT NULL dans le GeoPackage et fait échouer l'écriture de tout objet.
  return ['-f', 'GPKG', sortie, `WFS:${base}VERSION=1.0.0`, couche, '-nln', couche,
    '--config', 'OGR_WFS_PAGING_ALLOWED', 'ON', '--config', 'OGR_WFS_PAGE_SIZE', String(TAILLE_PAGE),
    '--config', 'GML_EXPOSE_GML_ID', 'NO'];
}

const mo = (o) => `${(o / 1048576).toFixed(1).replace('.', ',')} Mo`;

export function rapportMarkdown(r) {
  const l = [];
  l.push('# Mesure du service WFS de l\'ONF', '');
  l.push(`- Date (UTC) : ${r.date}`, `- Service : \`${r.service}\``);
  if (r.capabilities) l.push(`- Titre : ${r.capabilities.titre ?? "inconnu"} ; conditions : ${r.capabilities.fees ?? "inconnues"}`);
  if (r.versionsServies) {
    l.push('Versions WFS réellement servies (GetCapabilities demandé sans version, puis en 1.0.0, 1.1.0, 2.0.0) :', '');
    l.push('| Demandée | Annoncée par le serveur | Exception | HTTP |', '|---|---|---|---|');
    for (const v of r.versionsServies) l.push(`| ${v.demandee ?? '(aucune)'} | ${v.annoncee ?? '-'} | ${v.exception ? 'exception de service' : 'non'} | ${v.http ?? '?'} |`);
    l.push('');
  }
  l.push('| Couche | Objets | Annoncés (hits) | Poids .gpkg | Durée | Système |', '|---|---|---|---|---|---|');
  for (const c of r.couches) {
    l.push(`| \`${c.nom}\` | ${c.nombre ?? '?'} | ${c.hits ?? 'inconnu'} | ${c.poidsOctets != null ? mo(c.poidsOctets) : '?'} | ${c.dureeSecondes != null ? `${c.dureeSecondes.toFixed(1)} s` : '?'} | ${c.systeme ?? '?'} |`);
  }
  for (const c of r.couches) {
    l.push('', `## ${c.nom} — ${c.titre ?? ''}`, '');
    l.push(`- Métadonnées : ${c.metadataUrl ?? 'aucune'}`);
    for (const m of c.metadonnees || []) l.push(`  - essai ${m.nom} : HTTP ${m.http ?? 'échec'}, ${m.octets} octets (${m.url})`);
    l.push(`- Comptage : ${c.comptage ? `${c.comptage.statut} — ${c.comptage.message}` : 'non fait'}`);
    l.push(`- Emprise (${c.systeme ?? 'système inconnu'}, minx miny maxx maxy) : ${c.emprise ? c.emprise.join(' ') : 'inconnue'}`);
    l.push(`- Géométrie : ${c.geometrie ?? 'inconnue'}`);
    if (c.style) {
      const s = c.style;
      l.push(`- Style \`${s.qml}\` : ${s.ok ? 'champs obligatoires présents' : `MANQUE : ${s.manquants.join(', ')}`}`);
      if (s.informatifsManquants.length) l.push(`  - champs listés par le style mais absents (information) : ${s.informatifsManquants.join(', ')}`);
      for (const k of s.casse) l.push(`  - écart de casse : le style lit \`${k.style}\`, la couche a \`${k.couche}\``);
    }
    l.push('', 'Champs :', '');
    if (c.champs && c.champs.length) {
      l.push('| Champ | Type |', '|---|---|');
      for (const f of c.champs) l.push(`| \`${f.nom}\` | ${f.type} |`);
    } else l.push('(aucun champ lu)');
    if (c.erreurs && c.erreurs.length) { l.push('', 'Erreurs :', ''); for (const e of c.erreurs) l.push(`- ${e}`); }
  }
  l.push('');
  return l.join('\n');
}

// ---------------------------------------------------------------- partie réseau (non testée hors ligne)

// Lance une commande SANS bloquer la boucle d'événements (un spawnSync empêcherait un serveur local
// du même processus, celui des tests, de répondre à GDAL).
function lancer(cmd, args) {
  return new Promise((ok) => {
    const p = spawn(cmd, args);
    let stdout = ''; let stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('error', (error) => ok({ status: null, error, stdout, stderr }));
    p.on('close', (status) => ok({ status, stdout, stderr }));
  });
}

// Récupère une URL et range la réponse telle quelle. Renvoie { corps, http }.
// Une exception de service en HTTP 200 compte comme erreur (sauf `informatif`, pour les essais d'API non vérifiées).
async function prendre(url, fichier, erreurs, etiquette, { informatif = false, accept = null } = {}) {
  try {
    const rep = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: 'follow', headers: accept ? { Accept: accept } : {} });
    const corps = await rep.text();
    writeFileSync(fichier, corps);
    if (!informatif) {
      if (!rep.ok) erreurs.push(`${etiquette} : HTTP ${rep.status}`);
      else if (estException(corps)) erreurs.push(`${etiquette} : exception de service (HTTP 200)`);
    }
    return { corps, http: rep.status };
  } catch (e) {
    if (!informatif) erreurs.push(`${etiquette} : ${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}`);
    return { corps: null, http: null, erreur: e.message };
  }
}

export async function mesurer(sortie, base = SERVICE) {
  mkdirSync(sortie, { recursive: true });
  const rapport = { date: new Date().toISOString(), service: base, capabilities: null, erreursGlobales: [], couches: [] };
  // GetCapabilities en 1.0.0 : la référence des couches. Les autres versions : preuve de ce que le serveur sert.
  rapport.versionsServies = [];
  let capsXml = null;
  for (const { demandee, url } of urlsCapabilities(base)) {
    const nom = `getcapabilities-${demandee ?? 'sans-version'}.xml`;
    const r = await prendre(url, join(sortie, nom), demandee === '1.0.0' ? rapport.erreursGlobales : [], `GetCapabilities ${demandee ?? 'sans version'}`);
    if (demandee === '1.0.0') { capsXml = r.corps; writeFileSync(join(sortie, 'getcapabilities.xml'), r.corps ?? ''); }
    const v = versionAnnoncee(r.corps);
    rapport.versionsServies.push({ demandee, annoncee: v.version, exception: v.exception, http: r.http });
  }
  const caps = capsXml ? analyserCapabilities(capsXml) : { service: {}, couches: [] };
  rapport.capabilities = caps.service;
  const racine = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'referentiels', 'brut', 'onf');

  for (const couche of COUCHES) {
    const c = { nom: couche.nom, titre: null, metadataUrl: null, erreurs: [] };
    rapport.couches.push(c);
    const decl = caps.couches.find((x) => x.nom === couche.nom);
    if (decl) { c.titre = decl.titre; c.metadataUrl = decl.metadataUrl; } else c.erreurs.push('couche absente du GetCapabilities');

    const dxml = (await prendre(`${base}SERVICE=WFS&VERSION=1.0.0&REQUEST=DescribeFeatureType&TYPENAME=${couche.nom}`, join(sortie, `describefeaturetype-${couche.nom}.xml`), c.erreurs, 'DescribeFeatureType')).corps;
    c.describe = dxml ? analyserDescribeFeatureType(dxml) : null;
    c.metadonnees = [];
    if (c.metadataUrl) {
      // La page elle-même (le fragment #/… est coupé par fetch : sans doute vide) puis des API GeoNetwork à essayer.
      const essais = [{ nom: 'page', url: c.metadataUrl, accept: null }, ...urlsMetadonnees(c.metadataUrl)];
      for (const e of essais) {
        const r = await prendre(e.url, join(sortie, `metadonnees-${couche.nom}-${e.nom}.txt`), c.erreurs, `fiche ${e.nom}`, { informatif: true, accept: e.accept });
        c.metadonnees.push({ nom: e.nom, url: e.url, http: r.http, octets: r.corps ? Buffer.byteLength(r.corps) : 0 });
      }
    }

    const hxml = (await prendre(urlGetFeatureHits(base, couche.nom), join(sortie, `hits-${couche.nom}.xml`), c.erreurs, 'GetFeature resultType=hits (1.1.0)')).corps;
    c.hits = hitsDepuisReponse(hxml);

    const gpkg = join(sortie, `${couche.nom}.gpkg`);
    const t0 = Date.now();
    const o = await lancer('ogr2ogr', argsOgr2ogr(base, couche.nom, gpkg));
    c.dureeSecondes = (Date.now() - t0) / 1000;
    writeFileSync(join(sortie, `ogr2ogr-${couche.nom}.log`), `${o.stdout || ''}\n${o.stderr || ''}\nstatut ${o.status}\n`);
    if (o.error || o.status !== 0) c.erreurs.push(`téléchargement ogr2ogr : ${o.error ? o.error.message : `statut ${o.status}`}`);
    if (existsSync(gpkg)) {
      c.poidsOctets = statSync(gpkg).size;
      const i = await lancer('ogrinfo', ['-json', '-so', '-al', gpkg]);
      if (i.status === 0) {
        writeFileSync(join(sortie, `ogrinfo-${couche.nom}.json`), i.stdout);
        try { Object.assign(c, resumerOgrinfo(JSON.parse(i.stdout))); } catch (e) { c.erreurs.push(`ogrinfo : ${e.message}`); }
      } else c.erreurs.push(`ogrinfo : statut ${i.status}`);
    }
    c.comptage = statutComptage(c.hits ?? null, c.nombre ?? null);

    // Champs : ceux du .gpkg si lu, sinon ceux du DescribeFeatureType.
    const noms = (c.champs && c.champs.length ? c.champs : (c.describe ? c.describe.champs : [])).map((f) => f.nom);
    if (!(c.champs && c.champs.length) && c.describe) c.champs = c.describe.champs.map((f) => ({ nom: f.nom, type: f.type }));
    const qml = readFileSync(join(racine, couche.qml), 'utf8');
    c.style = { qml: couche.qml, ...comparerChampsStyle(noms, champsAttendus(couche, qml)) };
    if (!noms.length) c.erreurs.push('aucun champ connu : comparaison au style non concluante');
  }
  writeFileSync(join(sortie, 'rapport.json'), JSON.stringify(rapport, null, 2));
  writeFileSync(join(sortie, 'rapport.md'), rapportMarkdown(rapport));
  return rapport;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const iS = args.indexOf('--service');
  const base = iS >= 0 ? args.splice(iS, 2)[1] : SERVICE;
  const sortie = args[0];
  if (!sortie) { console.error('Usage : node outils/mesure-wfs-onf.mjs <dossier-de-sortie> [--service URL]'); process.exit(2); }
  const r = await mesurer(sortie, base);
  console.log(rapportMarkdown(r));
  const echec = r.erreursGlobales.length || r.couches.some((c) => c.erreurs.length || !c.style.ok);
  process.exit(echec ? 1 : 0);
}
