/**
 * CARTO CHANTIERS — « porte » Google Apps Script
 * ------------------------------------------------
 * Sert de pont entre l'appli (https://fredericeenergie.github.io/carto-chantiers/)
 * et la RACINE de « Mon Drive » :
 *   - liste les fichiers de cartographie (KMZ, KML, GPX, GeoJSON) posés à la racine ;
 *   - renvoie le contenu d'un de ces fichiers (le KMZ est décompressé ici) ;
 *   - relaie le flux Vigicrues (non lisible directement depuis une page web).
 * Rien d'autre n'est accessible. Chaque appel doit fournir la clé secrète.
 *
 * Installation : voir README du dépôt (5 étapes).
 *   1) Coller ce fichier dans un nouveau projet Apps Script.
 *   2) Exécuter une fois la fonction creerCle().
 *   3) Déployer > Nouveau déploiement > Application Web
 *        Exécuter en tant que : Moi
 *        Qui a accès : Tout le monde
 *   4) Exécuter lienInstallation() et ouvrir le lien affiché sur le téléphone.
 */

var APP_URL = 'https://fredericeenergie.github.io/carto-chantiers/';
var EXTENSIONS = ['kmz', 'kml', 'gpx', 'geojson'];
var MAX_ICON_BYTES = 150000;
var MAX_ICONS = 60;
var VIGICRUES_URL = 'https://www.vigicrues.gouv.fr/services/InfoVigiCru.geojson';

/* ------------------------------------------------------------------ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var cle = PropertiesService.getScriptProperties().getProperty('CLE');
    if (!cle) return json_({ ok: false, erreur: 'Clé non créée : exécuter creerCle() dans Apps Script.' });
    if (p.cle !== cle) return json_({ ok: false, erreur: 'Clé invalide.' });

    switch (p.action) {
      case 'ping':      return json_({ ok: true, version: 1 });
      case 'liste':     return json_({ ok: true, fichiers: listMapFiles_() });
      case 'fichier':   return json_({ ok: true, fichier: loadMapFile_(p.id) });
      case 'vigicrues': return json_({ ok: true, vigicrues: vigicrues_() });
      default:          return json_({ ok: false, erreur: 'Action inconnue.' });
    }
  } catch (err) {
    return json_({ ok: false, erreur: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function extensionOf_(name) {
  var m = String(name).match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

/* ---- Fichiers de la racine ---------------------------------------- */

function listMapFiles_() {
  var out = [];
  var it = DriveApp.searchFiles("'root' in parents and trashed = false");
  while (it.hasNext()) {
    var f = it.next();
    var ext = extensionOf_(f.getName());
    if (EXTENSIONS.indexOf(ext) < 0) continue;
    out.push({
      id: f.getId(),
      name: f.getName(),
      ext: ext,
      modified: f.getLastUpdated().toISOString(),
      size: f.getSize()
    });
  }
  out.sort(function (a, b) { return a.name.localeCompare(b.name, 'fr', { numeric: true }); });
  return out;
}

function loadMapFile_(id) {
  if (!id) throw new Error('Identifiant manquant.');
  var f = DriveApp.getFileById(id);
  var name = f.getName();
  var ext = extensionOf_(name);
  if (EXTENSIONS.indexOf(ext) < 0) throw new Error('Ce fichier n\'est pas un fichier de cartographie.');

  // Seuls les fichiers posés à la racine de Mon Drive sont servis.
  var rootId = DriveApp.getRootFolder().getId();
  var parents = f.getParents(), atRoot = false;
  while (parents.hasNext()) { if (parents.next().getId() === rootId) atRoot = true; }
  if (!atRoot) throw new Error('Ce fichier n\'est plus à la racine du Drive.');

  var base = { id: id, name: name, modified: f.getLastUpdated().toISOString() };
  var blob = f.getBlob();

  if (ext === 'kmz') {
    var parts = Utilities.unzip(blob.setContentType('application/zip'));
    var kml = null, images = {}, count = 0;
    parts.forEach(function (p) {
      var n = p.getName();
      if (/\.kml$/i.test(n)) {
        if (!kml || /(^|\/)doc\.kml$/i.test(n)) kml = p;
      } else if (/\.(png|jpe?g|gif)$/i.test(n) && count < MAX_ICONS) {
        var bytes = p.getBytes();
        if (bytes.length <= MAX_ICON_BYTES) {
          var mime = /\.png$/i.test(n) ? 'image/png' : (/\.gif$/i.test(n) ? 'image/gif' : 'image/jpeg');
          images[n] = 'data:' + mime + ';base64,' + Utilities.base64Encode(bytes);
          count++;
        }
      }
    });
    if (!kml) throw new Error('Aucun fichier KML dans ce KMZ.');
    base.type = 'kml'; base.text = kml.getDataAsString('UTF-8'); base.images = images;
    return base;
  }
  base.type = ext; base.text = blob.getDataAsString('UTF-8'); base.images = {};
  return base;
}

/* ---- Vigicrues ------------------------------------------------------ */

function vigicrues_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('vigicrues');
  if (hit) return JSON.parse(hit);

  var res = UrlFetchApp.fetch(VIGICRUES_URL, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('Vigicrues indisponible (' + res.getResponseCode() + ').');
  var g = JSON.parse(res.getContentText('UTF-8'));

  // Allègement : 5 décimales (~1 m) et seulement les propriétés utiles.
  var feats = (g.features || []).map(function (f) {
    var p = f.properties || {};
    return {
      type: 'Feature',
      properties: { nom: p.lbentcru || '', code: p.CdEntCru || '', niveau: Number(p.NivInfViCr) || 1 },
      geometry: { type: f.geometry.type, coordinates: round_(f.geometry.coordinates) }
    };
  });
  var out = { type: 'FeatureCollection', bulletin: g.DtHrInfoVigiCru || null, ref: g.RefInfoVigiCru || null, features: feats };
  try { cache.put('vigicrues', JSON.stringify(out), 600); } catch (e) { /* trop gros pour le cache : tant pis */ }
  return out;
}

function round_(c) {
  if (typeof c === 'number') return Math.round(c * 1e5) / 1e5;
  return c.map(round_);
}

/* ---- Outils d'installation (à lancer à la main) -------------------- */

/** Crée (ou recrée) la clé secrète. Recréer la clé déconnecte l'appli jusqu'à la nouvelle saisie. */
function creerCle() {
  var cle = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('CLE', cle);
  Logger.log('Clé créée : ' + cle);
}

/** Affiche le lien à ouvrir UNE fois sur le téléphone (il configure l'appli tout seul). */
function lienInstallation() {
  var cle = PropertiesService.getScriptProperties().getProperty('CLE');
  if (!cle) { creerCle(); cle = PropertiesService.getScriptProperties().getProperty('CLE'); }
  var url = ScriptApp.getService().getUrl();
  if (!url) { Logger.log('Déploie d\'abord le projet en Application Web, puis relance cette fonction.'); return; }
  Logger.log('Lien à ouvrir sur le téléphone (ne le partage pas, il contient ta clé) :\n' +
    APP_URL + '#porte=' + encodeURIComponent(url) + '&cle=' + cle);
}

/** Petit test depuis l'éditeur : liste les fichiers trouvés à la racine. */
function testerListe() {
  Logger.log(JSON.stringify(listMapFiles_(), null, 2));
}
