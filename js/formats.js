/* Lecture/écriture de fichiers : KML, KMZ, GPX, GeoJSON, CSV, DXF, tableaux (CSV/XLSX). */
(function () {
  var C = window.Carto = window.Carto || {};

  function xmlEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function kmlColor(hex, op) {
    hex = (hex || '#ff0000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var a = Math.round(Math.max(0, Math.min(1, op == null ? 1 : op)) * 255).toString(16);
    if (a.length < 2) a = '0' + a;
    return (a + hex.substr(4, 2) + hex.substr(2, 2) + hex.substr(0, 2)).toLowerCase();
  }
  function coordsKml(cs) { return cs.map(function (c) { return (+c[1]).toFixed(7) + ',' + (+c[0]).toFixed(7) + ',0'; }).join(' '); }

  /* features : [{ kind:'point'|'line'|'poly', name, coords, desc, data:[[k,v]], style, folder:[...] }] */
  function toKML(title, features, opts) {
    opts = opts || {};
    var root = { name: title, kids: {}, order: [], feats: [] };
    features.forEach(function (f) {
      var node = root;
      (f.folder || []).forEach(function (n) {
        if (!node.kids[n]) { node.kids[n] = { name: n, kids: {}, order: [], feats: [] }; node.order.push(n); }
        node = node.kids[n];
      });
      node.feats.push(f);
    });
    function placemark(f) {
      var s = f.style || {}, st = '<Style>';
      if (f.kind === 'point') {
        st += '<IconStyle>' + (s.iconColor ? '<color>' + kmlColor(s.iconColor, 1) + '</color>' : '') + '<scale>' + (f.pylon ? 1.1 : 0.9) + '</scale><Icon><href>' +
          xmlEsc(s.iconFile || (f.pylon ? 'http://maps.google.com/mapfiles/kml/shapes/placemark_square.png' : 'http://maps.google.com/mapfiles/kml/paddle/wht-circle.png')) + '</href></Icon></IconStyle>' +
          '<LabelStyle><scale>' + (f.pylon ? 0.9 : 0.7) + '</scale></LabelStyle>';
      } else {
        st += '<LineStyle><color>' + kmlColor(s.line || '#ff3b30', s.lineOp == null ? 1 : s.lineOp) + '</color><width>' + (s.width || 3) + '</width></LineStyle>';
        if (f.kind === 'poly') st += '<PolyStyle><color>' + kmlColor(s.fill || s.line || '#ffcc00', s.noFill ? 0 : (s.fillOp == null ? 0.25 : s.fillOp)) + '</color></PolyStyle>';
      }
      st += '</Style>';
      var geom = '';
      if (f.kind === 'point') geom = '<Point><coordinates>' + coordsKml([f.coords]) + '</coordinates></Point>';
      else if (f.kind === 'line') geom = '<LineString><tessellate>1</tessellate><coordinates>' + coordsKml(f.coords) + '</coordinates></LineString>';
      else geom = '<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>' + coordsKml(close(f.coords[0])) + '</coordinates></LinearRing></outerBoundaryIs>' +
        f.coords.slice(1).map(function (r) { return '<innerBoundaryIs><LinearRing><coordinates>' + coordsKml(close(r)) + '</coordinates></LinearRing></innerBoundaryIs>'; }).join('') + '</Polygon>';
      var ed = (f.data && f.data.length) ? '<ExtendedData>' + f.data.map(function (d) { return '<Data name="' + xmlEsc(d[0]) + '"><value>' + xmlEsc(d[1]) + '</value></Data>'; }).join('') + '</ExtendedData>' : '';
      var desc = f.descHtml ? '<description><![CDATA[' + String(f.descHtml).replace(/]]>/g, ']] >') + ']]></description>' : (f.desc ? '<description>' + xmlEsc(f.desc) + '</description>' : '');
      return '<Placemark><name>' + xmlEsc(f.name || '') + '</name>' + desc + st + ed + geom + '</Placemark>';
    }
    function folder(node, isRoot) {
      var inner = node.feats.map(placemark).join('') + node.order.map(function (n) { return folder(node.kids[n]); }).join('');
      return isRoot ? inner : '<Folder><name>' + xmlEsc(node.name) + '</name>' + inner + '</Folder>';
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + xmlEsc(title) + '</name>' +
      (opts.description ? '<description>' + xmlEsc(opts.description) + '</description>' : '') + folder(root, true) + '</Document></kml>';
  }
  function close(r) { if (!r.length) return r; var a = r[0], b = r[r.length - 1]; return (a[0] === b[0] && a[1] === b[1]) ? r : r.concat([a]); }

  function dataUrlToBytes(u) {
    var m = String(u).match(/^data:([^;]+);base64,(.*)$/); if (!m) return null;
    var bin = atob(m[2]), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /* KMZ : les icônes embarquées (images data:) sont rangées dans files/ */
  function zipLib() { return window.JSZip ? Promise.resolve() : C.u.loadScript('vendor/jszip.min.js'); }
  function toKMZ(title, features, images) { return zipLib().then(function () { return toKMZnow(title, features, images); }); }
  function toKMZnow(title, features, images) {
    var zip = new JSZip(), used = {};
    features.forEach(function (f) {
      var href = f.style && f.style.icon;
      if (href && images) {
        var key = href.replace(/^\.?\//, ''), src = images[key];
        if (!src) { for (var k in images) if (k.split('/').pop() === key.split('/').pop()) { src = images[k]; key = k; break; } }
        if (src) { var name = 'files/' + key.split('/').pop(); used[name] = src; f.style = Object.assign({}, f.style, { iconFile: name }); }
      }
    });
    zip.file('doc.kml', toKML(title, features));
    Object.keys(used).forEach(function (n) { var b = dataUrlToBytes(used[n]); if (b) zip.file(n, b); });
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz', compression: 'DEFLATE' });
  }

  function toGPX(title, features) {
    var w = [], t = [];
    features.forEach(function (f) {
      var nm = '<name>' + xmlEsc(f.name || '') + '</name>' + (f.desc ? '<desc>' + xmlEsc(f.desc) + '</desc>' : '');
      if (f.kind === 'point') w.push('<wpt lat="' + f.coords[0].toFixed(7) + '" lon="' + f.coords[1].toFixed(7) + '">' + nm + '</wpt>');
      else {
        var c = f.kind === 'line' ? f.coords : close(f.coords[0]);
        t.push('<trk>' + nm + '<trkseg>' + c.map(function (p) { return '<trkpt lat="' + p[0].toFixed(7) + '" lon="' + p[1].toFixed(7) + '"/>'; }).join('') + '</trkseg></trk>');
      }
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Carto chantiers" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>' + xmlEsc(title) + '</name></metadata>' + w.join('') + t.join('') + '</gpx>';
  }

  function toGeoJSON(title, features) {
    function ll(c) { return [+c[1].toFixed(7), +c[0].toFixed(7)]; }
    return JSON.stringify({ type: 'FeatureCollection', name: title, features: features.map(function (f) {
      var props = { name: f.name || '', dossier: (f.folder || []).join(' › ') };
      if (f.desc) props.description = f.desc;
      (f.data || []).forEach(function (d) { props[d[0]] = d[1]; });
      var g = f.kind === 'point' ? { type: 'Point', coordinates: ll(f.coords) }
        : f.kind === 'line' ? { type: 'LineString', coordinates: f.coords.map(ll) }
        : { type: 'Polygon', coordinates: f.coords.map(function (r) { return close(r).map(ll); }) };
      return { type: 'Feature', properties: props, geometry: g };
    }) });
  }

  /* CSV « Excel français » : séparateur ; et BOM UTF-8 */
  function toCSV(rows) {
    return '﻿' + rows.map(function (r) {
      return r.map(function (v) { v = v == null ? '' : String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';');
    }).join('\r\n');
  }

  /* DXF R12 en Lambert 93 : un calque AutoCAD par dossier */
  function toDXF(features) {
    var L93 = C.geo.L93, layers = {}, ents = [];
    function lay(f) {
      var n = ((f.folder || []).join('_') || 'CARTO').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_\-]+/g, '_').toUpperCase().slice(0, 60) || 'CARTO';
      layers[n] = true; return n;
    }
    function xy(c) { var p = L93.fromWGS(c[0], c[1]); return p; }
    features.forEach(function (f) {
      var L = lay(f);
      if (f.kind === 'point') {
        var p = xy(f.coords);
        ents.push('0\nPOINT\n8\n' + L + '\n10\n' + p[0].toFixed(3) + '\n20\n' + p[1].toFixed(3) + '\n30\n0.0');
        if (f.name) ents.push('0\nTEXT\n8\n' + L + '\n10\n' + (p[0] + 1.5).toFixed(3) + '\n20\n' + (p[1] + 1.5).toFixed(3) + '\n30\n0.0\n40\n2.5\n1\n' + String(f.name).replace(/\n/g, ' '));
      } else {
        var rings = f.kind === 'line' ? [f.coords] : f.coords;
        rings.forEach(function (r) {
          ents.push('0\nPOLYLINE\n8\n' + L + '\n66\n1\n70\n' + (f.kind === 'poly' ? 1 : 0) + '\n10\n0.0\n20\n0.0\n30\n0.0');
          r.forEach(function (c) { var q = xy(c); ents.push('0\nVERTEX\n8\n' + L + '\n10\n' + q[0].toFixed(3) + '\n20\n' + q[1].toFixed(3) + '\n30\n0.0'); });
          ents.push('0\nSEQEND\n8\n' + L);
        });
      }
    });
    var names = Object.keys(layers);
    var tables = '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n' + names.length + '\n' +
      names.map(function (n, i) { return '0\nLAYER\n2\n' + n + '\n70\n0\n62\n' + ((i % 7) + 1) + '\n6\nCONTINUOUS'; }).join('\n') + '\n0\nENDTAB\n0\nENDSEC\n';
    return '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n' + tables +
      '0\nSECTION\n2\nENTITIES\n' + ents.join('\n') + '\n0\nENDSEC\n0\nEOF\n';
  }

  /* ---------- Lecture de fichiers locaux (téléphone / ordinateur) ---------- */
  function readMapFile(file) {
    var name = file.name, ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
    ext = (ext || '').toLowerCase();
    if (ext === 'kmz') {
      return zipLib().then(function () { return JSZip.loadAsync(file); }).then(function (zip) {
        var kml = null, imgs = [];
        zip.forEach(function (path, entry) {
          if (/\.kml$/i.test(path) && (!kml || /(^|\/)doc\.kml$/i.test(path))) kml = entry;
          else if (/\.(png|jpe?g|gif)$/i.test(path)) imgs.push(entry);
        });
        if (!kml) throw new Error('Aucun KML dans ce KMZ');
        var images = {};
        return Promise.all(imgs.slice(0, 60).map(function (e) {
          return e.async('base64').then(function (b) {
            var mime = /\.png$/i.test(e.name) ? 'image/png' : /\.gif$/i.test(e.name) ? 'image/gif' : 'image/jpeg';
            images[e.name] = 'data:' + mime + ';base64,' + b;
          });
        })).then(function () { return kml.async('string'); }).then(function (text) {
          return { name: name, type: 'kml', text: text, images: images };
        });
      });
    }
    if (['kml', 'gpx', 'geojson', 'json'].indexOf(ext) >= 0) {
      return file.text().then(function (text) { return { name: name, type: ext === 'json' ? 'geojson' : ext, text: text, images: {} }; });
    }
    return Promise.reject(new Error('Format non reconnu (KMZ, KML, GPX ou GeoJSON)'));
  }

  /* Tableau (CSV, XLSX, XLS, ODS) → tableau 2D de textes */
  function readTable(file) {
    var ext = ((file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
    if (ext === 'csv' || ext === 'txt') {
      return file.text().then(function (t) { return parseCSV(t); });
    }
    return file.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array' });
      var sh = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' });
    });
  }
  function parseCSV(t) {
    t = t.replace(/^﻿/, '');
    var first = t.split(/\r?\n/)[0] || '';
    var sep = (first.split(';').length >= first.split(',').length) ? ';' : ',';
    if ((first.split('\t').length) > Math.max(first.split(';').length, first.split(',').length)) sep = '\t';
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); });
  }

  /* Modèle d'import : classeur Excel avec listes déroulantes et mode d'emploi */
  function templateWorkbook(pylons) {
    var F = C.fiche, head = ['N°', 'Latitude', 'Longitude', 'X Lambert 93', 'Y Lambert 93'].concat(F.FIELDS.filter(function (f) { return f.t !== 'photos'; }).map(function (f) { return f.label; }));
    var rows = [head];
    (pylons || []).forEach(function (p) { var r = head.map(function () { return ''; }); r[0] = p.pylon; r[1] = p.lat.toFixed(7); r[2] = p.lon.toFixed(7); var l = C.geo.L93.fromWGS(p.lat, p.lon); r[3] = l[0].toFixed(2); r[4] = l[1].toFixed(2); rows.push(r); });
    if (rows.length === 1) rows.push(['12', '', '', '', '']);
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = head.map(function (h, i) { return { wch: i === 0 ? 8 : Math.min(40, Math.max(12, h.length + 2)) }; });
    ws['!freeze'] = { xSplit: 1, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Pylônes');
    var lists = [['Champ', 'Valeurs possibles (séparer par « , » pour un choix multiple)']];
    F.FIELDS.forEach(function (f) { if (f.o) lists.push([f.label, f.o.join(' | ')]); });
    var wl = XLSX.utils.aoa_to_sheet(lists); wl['!cols'] = [{ wch: 48 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wl, 'Listes');
    var help = [
      ['Mode d\'emploi — modèle d\'import Carto chantiers'], [''],
      ['1. Une ligne par pylône. La colonne « N° » est obligatoire (ex. 12, 72N, 12bis).'],
      ['2. Coordonnées facultatives : soit Latitude/Longitude (GPS, ex. 44.9127 / -0.5302), soit X/Y Lambert 93.'],
      ['   Si le pylône n\'existe pas encore dans le fichier du chantier, il sera créé à ces coordonnées.'],
      ['3. Pour les champs à choix, utiliser les valeurs de l\'onglet « Listes » (plusieurs valeurs : séparées par des virgules).'],
      ['4. Laisser vide ce qui n\'est pas connu. Les colonnes que tu ajoutes toi-même sont gardées dans « Infos importées ».'],
      ['5. Dans l\'appli : onglet Chantier → Importer un tableau → choisir ce fichier (téléphone, ordinateur ou Drive).']
    ];
    var wh = XLSX.utils.aoa_to_sheet(help); wh['!cols'] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, wh, 'Mode d\'emploi');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  }

  C.formats = { toKML: toKML, toKMZ: toKMZ, toGPX: toGPX, toGeoJSON: toGeoJSON, toCSV: toCSV, toDXF: toDXF,
    readMapFile: readMapFile, readTable: readTable, parseCSV: parseCSV, templateWorkbook: templateWorkbook, kmlColor: kmlColor };
})();
