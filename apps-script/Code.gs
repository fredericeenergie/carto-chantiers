/**
 * CARTO CHANTIERS — « porte » Google Apps Script — version 2
 * ----------------------------------------------------------
 * Pont entre l'appli (https://fredericeenergie.github.io/carto-chantiers/) et ton Google Drive :
 *   - liste les fichiers de cartographie (KMZ, KML, GPX, GeoJSON) de la racine ;
 *   - parcourt les dossiers du Drive et lit un fichier de carto où qu'il soit ;
 *   - enregistre les exports, le fichier « terrain » et les photos ;
 *   - relaie le flux Vigicrues.
 * Chaque appel doit fournir la clé secrète.
 *
 * Mise à jour depuis la v1 : remplacer tout ce fichier, enregistrer, puis
 *   Déployer > Gérer les déploiements > (crayon) Modifier > Version : Nouvelle version > Déployer.
 * L'adresse ne change pas : rien à refaire sur le téléphone.
 */

var APP_URL = 'https://fredericeenergie.github.io/carto-chantiers/';
// Adresse de l'application Web, celle qui FINIT PAR /exec (Déployer > Gérer les déploiements > URL).
// À coller ici si lienInstallation() affiche une adresse en /dev.
var PORTE_URL = '';
var VERSION = 2;
var EXTENSIONS = ['kmz', 'kml', 'gpx', 'geojson', 'json'];
var MAX_ICON_BYTES = 150000;
var MAX_ICONS = 60;
var VIGICRUES_URL = 'https://www.vigicrues.gouv.fr/services/InfoVigiCru.geojson';
var DOSSIER_PHOTOS = 'Carto chantiers – photos';

/* ================== Entrées ================== */

function doGet(e) {
  var p = (e && e.parameter) || {};
  return handle_(p);
}

function doPost(e) {
  var p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, erreur: 'Requête illisible.' }); }
  return handle_(p);
}

function handle_(p) {
  try {
    var cle = PropertiesService.getScriptProperties().getProperty('CLE');
    if (!cle) return json_({ ok: false, erreur: 'Clé non créée : exécuter creerCle() dans Apps Script.' });
    if (p.cle !== cle) return json_({ ok: false, erreur: 'Clé invalide.' });

    switch (p.action) {
      case 'ping':          return json_({ ok: true, version: VERSION });
      case 'liste':         return json_({ ok: true, fichiers: listMapFiles_(DriveApp.getRootFolder()) });
      case 'dossier':       return json_({ ok: true, contenu: browse_(p.id, p.tableaux === '1') });
      case 'fichier':       return json_({ ok: true, fichier: loadMapFile_(p.id) });
      case 'vigicrues':     return json_({ ok: true, vigicrues: vigicrues_() });
      case 'enregistrer':   return json_({ ok: true, fichier: save_(p) });
      case 'photo':         return json_({ ok: true, photo: savePhoto_(p) });
      case 'dossierPhotos': return json_({ ok: true, dossier: photoFolder_(p.chantier) });
      case 'creerDossier':  return json_({ ok: true, dossier: makeFolder_(p.parentId, p.nom) });
      case 'fiches':        return json_({ ok: true, fiches: fichesRead_(p.chantier, p.parentId) });
      case 'fichesEcrire':  return json_({ ok: true, fiches: fichesWrite_(p) });
      case 'lireTableur':   return json_({ ok: true, valeurs: readSheet_(p.id) });
      case 'vignette':      return json_({ ok: true, vignette: thumb_(p.id) });
      case 'paquets':       return json_({ ok: true, paquets: paquets_() });
      case 'paquetEcrire':  return json_({ ok: true, paquets: paquetWrite_(p.paquet) });
      case 'paquetSupprimer': return json_({ ok: true, paquets: paquetDelete_(p.nom) });
      default:              return json_({ ok: false, erreur: 'Action inconnue.' });
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

function folderOf_(id) {
  return (!id || id === 'root') ? DriveApp.getRootFolder() : DriveApp.getFolderById(id);
}

function fileInfo_(f) {
  return { id: f.getId(), name: f.getName(), ext: extensionOf_(f.getName()), modified: f.getLastUpdated().toISOString(), size: f.getSize() };
}

/* ================== Lecture ================== */

function listMapFiles_(folder) {
  var out = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    if (EXTENSIONS.indexOf(extensionOf_(f.getName())) < 0) continue;
    out.push(fileInfo_(f));
  }
  out.sort(function (a, b) { return a.name.localeCompare(b.name, 'fr', { numeric: true }); });
  return out;
}

function browse_(id, tableaux) {
  var folder = folderOf_(id);
  var isRoot = folder.getId() === DriveApp.getRootFolder().getId();
  var subs = [], it = folder.getFolders();
  while (it.hasNext()) {
    var d = it.next();
    if (d.isTrashed()) continue;
    subs.push({ id: d.getId(), name: d.getName() });
  }
  subs.sort(function (a, b) { return a.name.localeCompare(b.name, 'fr', { numeric: true }); });
  var chemin = [];
  if (!isRoot) {
    var cur = folder, guard = 0;
    while (cur && guard++ < 20) {
      chemin.unshift({ id: cur.getId(), name: cur.getName() });
      var ps = cur.getParents();
      if (!ps.hasNext()) break;
      cur = ps.next();
      if (cur.getId() === DriveApp.getRootFolder().getId()) break;
    }
  }
  return {
    dossier: { id: isRoot ? 'root' : folder.getId(), name: isRoot ? 'Mon Drive' : folder.getName() },
    chemin: chemin,
    dossiers: subs,
    fichiers: tableaux ? listTables_(folder) : listMapFiles_(folder)
  };
}

function listTables_(folder) {
  var out = [], it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    var ext = extensionOf_(f.getName());
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) ext = 'sheet';
    else if (ext !== 'csv') continue;
    out.push({ id: f.getId(), name: f.getName(), ext: ext, modified: f.getLastUpdated().toISOString(), size: 0 });
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

  var parent = null, ps = f.getParents();
  if (ps.hasNext()) { var pf = ps.next(); parent = { id: pf.getId() === DriveApp.getRootFolder().getId() ? 'root' : pf.getId(), name: pf.getName() }; }
  var base = { id: id, name: name, modified: f.getLastUpdated().toISOString(), parent: parent };
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
  base.type = (ext === 'json') ? 'geojson' : ext;
  base.text = blob.getDataAsString('UTF-8'); base.images = {};
  return base;
}

/* ================== Écriture ================== */

/**
 * p.nom, p.dossierId ('root' par défaut), p.mime
 * contenu : p.texte (UTF-8) ou p.base64
 * p.fichierId : met à jour ce fichier (texte uniquement) au lieu d'en créer un nouveau.
 */
function save_(p) {
  if (!p.nom) throw new Error('Nom de fichier manquant.');
  var mime = p.mime || 'application/octet-stream';
  if (p.fichierId) {
    var existing = DriveApp.getFileById(p.fichierId);
    if (p.texte == null) throw new Error('Mise à jour possible seulement pour un fichier texte.');
    existing.setContent(p.texte);
    if (existing.getName() !== p.nom) existing.setName(p.nom);
    return { id: existing.getId(), name: existing.getName(), url: existing.getUrl() };
  }
  var blob = (p.texte != null)
    ? Utilities.newBlob(p.texte, mime, p.nom)
    : Utilities.newBlob(Utilities.base64Decode(p.base64), mime, p.nom);
  var f = folderOf_(p.dossierId).createFile(blob);
  return { id: f.getId(), name: f.getName(), url: f.getUrl() };
}

function savePhoto_(p) {
  if (!p.base64) throw new Error('Photo vide.');
  var blob = Utilities.newBlob(Utilities.base64Decode(p.base64), p.mime || 'image/jpeg', p.nom || ('photo_' + Date.now() + '.jpg'));
  var f = folderOf_(p.dossierId).createFile(blob);
  return { id: f.getId(), name: f.getName(), url: f.getUrl() };
}

function childFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  while (it.hasNext()) { var d = it.next(); if (!d.isTrashed()) return d; }
  return parent.createFolder(name);
}

/** Dossier photos par défaut : Mon Drive › Carto chantiers – photos › <chantier> */
function photoFolder_(chantier) {
  var top = childFolder_(DriveApp.getRootFolder(), DOSSIER_PHOTOS);
  var d = childFolder_(top, String(chantier || 'Sans nom').replace(/[\\\/]/g, '-'));
  return { id: d.getId(), name: d.getName(), chemin: DOSSIER_PHOTOS + ' › ' + d.getName() };
}

function makeFolder_(parentId, nom) {
  if (!nom) throw new Error('Nom de dossier manquant.');
  var d = childFolder_(folderOf_(parentId), nom);
  return { id: d.getId(), name: d.getName() };
}

/* ================== Fiches pylônes (Google Sheet) ================== */

function canon_(n) {
  var s = String(n == null ? '' : n).trim().toUpperCase().replace(/\s+/g, '');
  var m = s.match(/^(?:PYL[OÔ]NES?|PYL\.?|P|N°|NO\.?|#)?[-.]?(\d{1,4}(?:BIS|TER|[A-Z]{1,2})?)$/);
  return m ? m[1] : s;
}

function fichesName_(chantier) { return String(chantier || 'Chantier') + ' - fiches pylônes'; }

function findSheetFile_(chantier, parentId) {
  var it = folderOf_(parentId).getFilesByName(fichesName_(chantier));
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed() && f.getMimeType() === MimeType.GOOGLE_SHEETS) return f; }
  return null;
}

function fichesRead_(chantier, parentId) {
  var f = findSheetFile_(chantier, parentId);
  if (!f) return { id: null, url: null, entetes: [], lignes: [] };
  var sh = SpreadsheetApp.openById(f.getId()).getSheets()[0];
  var v = sh.getDataRange().getDisplayValues();
  var head = v.length ? v[0] : [];
  var rows = [];
  for (var i = 1; i < v.length; i++) {
    var o = {}, empty = true;
    for (var j = 0; j < head.length; j++) { if (head[j]) { o[head[j]] = v[i][j]; if (v[i][j] !== '') empty = false; } }
    if (!empty) rows.push(o);
  }
  return { id: f.getId(), url: f.getUrl(), entetes: head, lignes: rows };
}

/** p.chantier, p.parentId, p.id (si connu), p.entetes [libellés dans l'ordre], p.lignes [{libellé: valeur}], clé = « N° » */
function fichesWrite_(p) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var file = p.id ? DriveApp.getFileById(p.id) : findSheetFile_(p.chantier, p.parentId);
    var ss;
    if (!file) {
      ss = SpreadsheetApp.create(fichesName_(p.chantier));
      file = DriveApp.getFileById(ss.getId());
      var target = folderOf_(p.parentId);
      if (target.getId() !== DriveApp.getRootFolder().getId()) file.moveTo(target);
      ss.getSheets()[0].setName('Fiches');
    } else {
      ss = SpreadsheetApp.openById(file.getId());
    }
    var sh = ss.getSheets()[0];
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var head = sh.getLastRow() ? sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : [];
    while (head.length && head[head.length - 1] === '') head.pop();
    (p.entetes || []).forEach(function (h) { if (head.indexOf(h) < 0) head.push(h); });
    (p.lignes || []).forEach(function (r) { Object.keys(r).forEach(function (h) { if (head.indexOf(h) < 0) head.push(h); }); });
    if (head.indexOf('N°') < 0) head.unshift('N°');
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eef5');
    // listes déroulantes pour les champs à choix unique
    var listes = p.listes || {};
    Object.keys(listes).forEach(function (h) {
      var c = head.indexOf(h); if (c < 0) return;
      var rule = SpreadsheetApp.newDataValidation().requireValueInList(listes[h], true).setAllowInvalid(true).build();
      sh.getRange(2, c + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
    });
    sh.setFrozenRows(1); sh.setFrozenColumns(1);

    var n = sh.getLastRow();
    var data = n > 1 ? sh.getRange(2, 1, n - 1, head.length).getValues() : [];
    var numCol = head.indexOf('N°');
    var index = {};
    data.forEach(function (row, i) { index[canon_(row[numCol])] = i; });
    (p.lignes || []).forEach(function (r) {
      var key = canon_(r['N°']);
      if (!key) return;
      var i = index[key];
      if (i == null) { data.push(head.map(function () { return ''; })); i = data.length - 1; index[key] = i; }
      Object.keys(r).forEach(function (h) { var c = head.indexOf(h); if (c >= 0) data[i][c] = r[h]; });
    });
    if (data.length) {
      data.forEach(function (row) { while (row.length < head.length) row.push(''); });
      sh.getRange(2, 1, data.length, head.length).setNumberFormat('@').setValues(data);
    }
    return { id: file.getId(), url: file.getUrl() };
  } finally { lock.releaseLock(); }
}

/** Lecture d'un Google Sheet (ou d'un Excel du Drive converti à la volée) pour l'import. */
function readSheet_(id) {
  var f = DriveApp.getFileById(id);
  if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
    return SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getDisplayValues();
  }
  if (/\.csv$/i.test(f.getName()) || f.getMimeType() === 'text/csv') {
    return Utilities.parseCsv(f.getBlob().getDataAsString('UTF-8'), f.getBlob().getDataAsString('UTF-8').indexOf(';') >= 0 ? ';' : ',');
  }
  throw new Error('Pour un fichier Excel, importe-le depuis le téléphone/ordinateur, ou ouvre-le une fois dans Google Sheets.');
}

/* ================== Vignettes de photos ================== */

function thumb_(id) {
  var f = DriveApp.getFileById(id);
  var b = f.getThumbnail();
  if (!b) b = f.getBlob();
  return 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
}

/* ================== Paquets chantier ================== */

function paquets_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('PAQUETS') || '[]'); } catch (e) { return []; }
}
function paquetWrite_(pq) {
  if (!pq || !pq.nom) throw new Error('Paquet sans nom.');
  var list = paquets_().filter(function (x) { return x.nom !== pq.nom; });
  pq.date = new Date().toISOString();
  list.unshift(pq);
  PropertiesService.getScriptProperties().setProperty('PAQUETS', JSON.stringify(list.slice(0, 30)));
  return list;
}
function paquetDelete_(nom) {
  var list = paquets_().filter(function (x) { return x.nom !== nom; });
  PropertiesService.getScriptProperties().setProperty('PAQUETS', JSON.stringify(list));
  return list;
}

/* ================== Vigicrues ================== */

function vigicrues_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('vigicrues');
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch(VIGICRUES_URL, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('Vigicrues indisponible (' + res.getResponseCode() + ').');
  var g = JSON.parse(res.getContentText('UTF-8'));
  var feats = (g.features || []).map(function (f) {
    var p = f.properties || {};
    return {
      type: 'Feature',
      properties: { nom: p.lbentcru || '', code: p.CdEntCru || '', niveau: Number(p.NivInfViCr) || 1 },
      geometry: { type: f.geometry.type, coordinates: round_(f.geometry.coordinates) }
    };
  });
  var out = { type: 'FeatureCollection', bulletin: g.DtHrInfoVigiCru || null, ref: g.RefInfoVigiCru || null, features: feats };
  try { cache.put('vigicrues', JSON.stringify(out), 600); } catch (e) { /* trop gros pour le cache */ }
  return out;
}

function round_(c) {
  if (typeof c === 'number') return Math.round(c * 1e5) / 1e5;
  return c.map(round_);
}

/* ================== Installation ================== */

/** Crée (ou recrée) la clé secrète. Recréer la clé déconnecte l'appli jusqu'à la nouvelle saisie. */
function creerCle() {
  var cle = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('CLE', cle);
  Logger.log('Clé créée : ' + cle);
}

/** Affiche le lien à ouvrir UNE fois sur chaque appareil (téléphone, ordinateur). */
function lienInstallation() {
  var cle = PropertiesService.getScriptProperties().getProperty('CLE');
  if (!cle) { creerCle(); cle = PropertiesService.getScriptProperties().getProperty('CLE'); }
  var url = PORTE_URL || ScriptApp.getService().getUrl();
  if (!url) { Logger.log('Déploie d\'abord le projet en Application Web, puis relance cette fonction.'); return; }
  if (/\/dev$/.test(url)) {
    Logger.log('⚠ L\'adresse trouvée finit par /dev : elle ne marche que dans l\'éditeur, pas dans l\'appli.\n' +
      'Va dans Déployer > Gérer les déploiements, copie l\'URL de l\'application Web (elle finit par /exec),\n' +
      'colle-la en haut du code dans PORTE_URL = \'…\'; enregistre, puis relance lienInstallation.');
    return;
  }
  Logger.log('Lien à ouvrir sur chaque appareil (ne le partage pas, il contient ta clé) :\n' +
    APP_URL + '#porte=' + encodeURIComponent(url) + '&cle=' + cle);
}

/** Test depuis l'éditeur : liste les fichiers de carto de la racine. */
function testerListe() {
  Logger.log(JSON.stringify(listMapFiles_(DriveApp.getRootFolder()), null, 2));
}
