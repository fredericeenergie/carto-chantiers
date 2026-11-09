/* Carto chantiers — onglet « Export » : PDF (atlas, rapport), fichiers KMZ/KML/GPX/GeoJSON/DXF/CSV, réseaux publics en tracés, communes, destinations. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, esc = U.esc, ui = C.ui;
  var BUFFER = 1000;

  /* ======================= Destinations ======================= */
  C.deliver = function (files, dest) { // files : [{blob, name}]
    if (dest.type === 'device') {
      files.forEach(function (f, i) {
        setTimeout(function () {
          var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.blob], { type: 'application/octet-stream' })); a.download = f.name; document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        }, i * 600);
      });
      U.toast(files.length > 1 ? files.length + ' fichiers téléchargés' : 'Téléchargé : ' + files[0].name, 3500);
      return Promise.resolve();
    }
    if (dest.type === 'share') {
      var fl = files.map(function (f) { return new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }); });
      if (navigator.canShare && navigator.canShare({ files: fl })) {
        return navigator.share({ files: fl, title: fl[0].name }).catch(function (e) { if (e && e.name !== 'AbortError') U.toast('Partage impossible : ' + e.message); });
      }
      U.toast('Partage de fichiers non pris en charge ici : téléchargement à la place', 4000);
      return C.deliver(files, { type: 'device' });
    }
    var folder = dest.type === 'root' ? Promise.resolve({ id: 'root', name: 'Mon Drive' }) : C.driveDialog({ mode: 'folder' });
    return folder.then(function (fd) {
      if (!fd) return;
      U.busy(true, 'Envoi sur le Drive…');
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () { return U.blobToBase64(f.blob); }).then(function (b64) {
          return C.postPorte('enregistrer', { nom: f.name, dossierId: fd.id, base64: b64, mime: f.blob.type || 'application/octet-stream' });
        });
      });
      return chain.then(function () { U.busy(false); U.toast((files.length > 1 ? files.length + ' fichiers enregistrés' : '« ' + files[0].name + ' » enregistré') + ' dans « ' + fd.name + ' »', 4500); })
        .catch(function (e) { U.busy(false); U.toast('Échec de l\'envoi : ' + (e.message || e), 6000); });
    });
  };
  C.destChoices = function () {
    return [
      { v: 'root', ico: '☁', label: 'Mon Drive', hint: 'À la racine : visible dans la liste des chantiers' },
      { v: 'folder', ico: '📁', label: 'Un dossier du Drive…', hint: 'Choisir le dossier' },
      { v: 'device', ico: '⬇', label: 'Cet appareil', hint: 'Téléchargement' },
      { v: 'share', ico: '↗', label: 'Partager', hint: 'Mail, WhatsApp, Drive…' }
    ];
  };
  C.deliverDialog = function (blob, name) {
    return C.choiceDialog('Où enregistrer « ' + name + ' » ?', C.destChoices()).then(function (v) { if (v) return C.deliver([{ blob: blob, name: name }], { type: v }); });
  };

  /* ======================= Réseaux publics en tracés ======================= */
  function samplesOf(seqs) {
    var out = [];
    seqs.forEach(function (s) { C.geo.densify(s, 120).forEach(function (p) { out.push(p); }); });
    return out;
  }
  function near(samples, coords, limit) {
    var dl = limit / 111000 * 1.05;
    for (var i = 0; i < coords.length; i++) {
      var c = coords[i], dlo = dl / Math.max(0.2, Math.cos(c[0] * Math.PI / 180));
      for (var j = 0; j < samples.length; j++) {
        var s = samples[j];
        if (Math.abs(s[0] - c[0]) > dl || Math.abs(s[1] - c[1]) > dlo) continue;
        if (C.geo.dist(c, s) <= limit) return true;
      }
    }
    return false;
  }
  function gjCoords(g) { // → liste de géométries internes {kind, coords}
    var out = [], ll = function (c) { return [c[1], c[0]]; };
    if (!g) return out;
    if (g.type === 'Point') out.push({ kind: 'point', coords: ll(g.coordinates) });
    else if (g.type === 'MultiPoint') g.coordinates.forEach(function (c) { out.push({ kind: 'point', coords: ll(c) }); });
    else if (g.type === 'LineString') out.push({ kind: 'line', coords: g.coordinates.map(ll) });
    else if (g.type === 'MultiLineString') g.coordinates.forEach(function (l) { out.push({ kind: 'line', coords: l.map(ll) }); });
    else if (g.type === 'Polygon') out.push({ kind: 'poly', coords: g.coordinates.map(function (r) { return r.map(ll); }) });
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(function (p) { out.push({ kind: 'poly', coords: p.map(function (r) { return r.map(ll); }) }); });
    return out;
  }
  function flat(geom) { return geom.kind === 'point' ? [geom.coords] : geom.kind === 'line' ? C.geo.densify(geom.coords, 200) : C.geo.densify(geom.coords[0], 200); }
  function cleanProps(p) {
    var out = [];
    Object.keys(p || {}).forEach(function (k) {
      var v = p[k]; if (v == null || v === '' || typeof v === 'object') return;
      if (/^(geo_|the_geom|gid$|fid$|ogc_fid|cleabs|identification_[2-5]|nom_ouvrage_[2-5]|proprietaire_[2-5]|code_ligne_[2-5]|nom_ligne_[2-5]|etat_[2-5])/i.test(k)) return;
      out.push([k.replace(/_/g, ' '), String(v)]);
    });
    return out;
  }
  var MAXF = 5000;
  function corridorCells(b, samples, sizeDeg) {
    var cells = [], lat0 = (b.s + b.n) / 2, kx = Math.cos(lat0 * Math.PI / 180);
    var dLon = sizeDeg / kx;
    for (var la = b.s; la < b.n; la += sizeDeg) for (var lo = b.w; lo < b.e; lo += dLon) {
      var c = { s: la, w: lo, n: Math.min(b.n, la + sizeDeg), e: Math.min(b.e, lo + dLon) };
      var ctr = [(c.s + c.n) / 2, (c.w + c.e) / 2], half = C.geo.dist([c.s, c.w], [c.n, c.e]) / 2;
      if (samples.some(function (p) { return C.geo.dist(p, ctr) <= BUFFER + half; })) cells.push(c);
    }
    return cells;
  }
  function getJSON(u) { return U.withTimeout(fetch(u, { mode: 'cors' }), 60000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function fetchLayer(v, b, samples, onStep) {
    return getJSON(v.url(b)).then(function (j) {
      var fs = j.features || [];
      if (fs.length < MAXF) return { feats: fs, partial: false };
      // trop d'objets : on interroge le couloir par carreaux d'environ 1,5 km
      var cells = corridorCells(b, samples, 0.0135).map(function (c) { return { c: c, d: 0 }; }), out = [], seen = {}, partial = false, i = 0, total = cells.length;
      function worker() {
        if (i >= cells.length) return Promise.resolve();
        var job = cells[i++], c = job.c;
        if (onStep) onStep(v.label + ' (' + Math.min(i, total) + '/' + total + ')');
        return getJSON(v.url(c)).then(function (jj) {
          var ff = jj.features || [];
          if (ff.length >= MAXF && job.d < 3) { // carreau trop dense (ville) : découpé en quatre
            var mLa = (c.s + c.n) / 2, mLo = (c.w + c.e) / 2;
            [[c.s, c.w, mLa, mLo], [c.s, mLo, mLa, c.e], [mLa, c.w, c.n, mLo], [mLa, mLo, c.n, c.e]].forEach(function (q) { cells.push({ c: { s: q[0], w: q[1], n: q[2], e: q[3] }, d: job.d + 1 }); });
            total += 4; return;
          }
          if (ff.length >= MAXF) partial = true;
          ff.forEach(function (ft) { var k = ft.id || JSON.stringify(ft.geometry).slice(0, 200); if (!seen[k]) { seen[k] = 1; out.push(ft); } });
        }).catch(function () { partial = true; }).then(worker);
      }
      return Promise.all([worker(), worker(), worker()]).then(function () { return { feats: out, partial: partial }; });
    });
  }
  C.fetchPublic = function (chantier, ids, onStep) {
    var seqs = C.geometryOf(asParsed(chantier)), b = C.bboxOf(seqs, BUFFER), samples = samplesOf(seqs);
    var feats = [], report = [];
    var chain = Promise.resolve();
    C.VECTORS.filter(function (v) { return ids.indexOf(v.id) >= 0; }).forEach(function (v) {
      chain = chain.then(function () {
        if (onStep) onStep(v.label);
        return fetchLayer(v, b, samples, onStep).then(function (res) {
          var n = 0;
          res.feats.forEach(function (ft) {
            gjCoords(ft.geometry).forEach(function (g) {
              if (!near(samples, flat(g), BUFFER)) return;
              var p = ft.properties || {}, name = v.name.map(function (k) { return p[k]; }).filter(Boolean)[0] || v.label;
              feats.push({ kind: g.kind, coords: g.coords, name: String(name), folder: v.folder.split(' › ').concat([v.label.split(' — ').pop()]), data: cleanProps(p),
                style: { line: v.color, width: g.kind === 'line' ? 3 : 2, fill: v.color, fillOp: 0.2, iconColor: v.color } });
              n++;
            });
          });
          report.push(v.label + ' : ' + n + (res.partial ? ' (incomplet)' : ''));
        }).catch(function (e) { report.push(v.label + ' : indisponible (' + (e.message || e) + ')'); });
      });
    });
    return chain.then(function () { return { feats: feats, report: report }; });
  };
  C.fetchCommunes = function (chantier) {
    var seqs = C.geometryOf(asParsed(chantier)), b = C.bboxOf(seqs, BUFFER), samples = samplesOf(seqs);
    return U.withTimeout(fetch(C.communesUrl(b), { mode: 'cors' }), 60000).then(function (r) { return r.json(); }).then(function (j) {
      var out = [];
      (j.features || []).forEach(function (ft) {
        var gs = gjCoords(ft.geometry), hit = false;
        gs.forEach(function (g) {
          if (hit || g.kind !== 'poly') return;
          if (samples.some(function (s) { return C.geo.pointInRing(s, g.coords[0]); })) hit = true;
          else if (near(samples, g.coords[0].filter(function (c, i) { return i % 3 === 0; }), BUFFER)) hit = true;
        });
        if (hit) out.push({ nom: ft.properties.nom_officiel || ft.properties.nom || '?', insee: ft.properties.code_insee || '', dep: ft.properties.code_insee_du_departement || '', geoms: gs });
      });
      out.sort(function (a, b) { return U.natural(a.nom, b.nom); });
      return out;
    });
  };
  function asParsed(doc) { // pour réutiliser les fonctions « hors ligne »
    var res = { points: [], lines: [], polys: [] };
    doc.feats.forEach(function (f) {
      if (f.kind === 'point') res.points.push({ lat: f.coords[0], lon: f.coords[1] });
      else if (f.kind === 'line') res.lines.push({ coords: f.coords });
      else res.polys.push({ rings: f.coords });
    });
    return res;
  }
  C.asParsed = asParsed;

  /* ======================= Tableaux CSV ======================= */
  C.pylonCSV = function (doc) {
    var head = ['N°', 'Nom', 'Latitude', 'Longitude', 'X Lambert 93', 'Y Lambert 93', 'Type', 'Famille / modèle', 'Commune', 'Parcelle', 'Statut', 'Lien Waze', 'Fichier'];
    var rows = [head];
    C.pylonsOf(doc).forEach(function (f) {
      var r = C.fiches.rowOf(doc, f.pylon) || {}, l = C.geo.L93.fromWGS(f.coords[0], f.coords[1]);
      rows.push([f.pylon, f.name, f.coords[0].toFixed(7).replace('.', ','), f.coords[1].toFixed(7).replace('.', ','), l[0].toFixed(2).replace('.', ','), l[1].toFixed(2).replace('.', ','),
        r['Type'] || '', r['Famille / modèle'] || '', r['Commune'] || '', r['Parcelle'] || '', r['Statut'] || '',
        'https://waze.com/ul?ll=' + f.coords[0].toFixed(6) + ',' + f.coords[1].toFixed(6) + '&navigate=yes', U.baseName(doc.name)]);
    });
    return C.formats.toCSV(rows);
  };
  C.terrainCSV = function (chantier) {
    var t = C.terrainOf(chantier); var rows = [['Nom', 'Catégorie', 'Pylône', 'Note', 'Statut', 'Date', 'Auteur', 'Latitude', 'Longitude', 'X Lambert 93', 'Y Lambert 93', 'Longueur / surface', 'Photos']];
    (t ? t.feats : []).forEach(function (f) {
      var c = f.kind === 'point' ? f.coords : C.centerOf(f), l = C.geo.L93.fromWGS(c[0], c[1]);
      rows.push([f.name, f.folder[1] || '', C.dataGet(f, 'Pylône'), f.desc || '', C.dataGet(f, 'Statut'), C.dataGet(f, 'Date'), C.dataGet(f, 'Auteur'),
        c[0].toFixed(7).replace('.', ','), c[1].toFixed(7).replace('.', ','), l[0].toFixed(2).replace('.', ','), l[1].toFixed(2).replace('.', ','),
        C.dataGet(f, 'Longueur') || C.dataGet(f, 'Surface'), (f.photos || []).filter(function (p) { return p.url; }).map(function (p) { return p.url; }).join(' ')]);
    });
    return C.formats.toCSV(rows);
  };

  /* ======================= Onglet Export ======================= */
  var FORMATS = [['kmz', 'KMZ'], ['kml', 'KML'], ['gpx', 'GPX'], ['geojson', 'GeoJSON'], ['dxf', 'DXF']];
  var FORMAT_HINTS = { kmz: 'Google Earth, avec styles et icônes.', kml: 'Google Earth / Maps, texte (sans icônes embarquées).', gpx: 'GPS de randonnée, Garmin… (points et traces).', geojson: 'SIG (QGIS…), applis web.', dxf: 'AutoCAD, en Lambert 93 (mètres), un calque par dossier.' };
  var defaultVec = { rte_aer: ['v_rte_aer'], rte_pyl: ['v_rte_pyl'], rte_sout: ['v_rte_sout'], rte_postes: ['v_rte_postes'], hta_aer: ['v_hta_aer'], hta_sout: ['v_hta_sout'], bt: ['v_bt_aer', 'v_bt_sout'], gaz_distri: ['v_grdf'], gaz_transport: ['v_gaz'], canal_autres: ['v_hydro', 'v_chim'], sncf_lignes: ['v_sncf'], sncf_pn: ['v_sncf_pn'] };
  C.tabs.export = function (el) {
    var a = C.activeDoc(), docs = C.docs.filter(function (d) { return d.role !== 'terrain'; });
    var html = '<h3>Documents PDF</h3><div class="tiles">' +
      ui.tile('atlas', '🗺', 'Atlas du chantier', 'Ensemble, série 1/2 500, une page par pylône') +
      ui.tile('report', '📝', 'Rapport de visite', 'Carte, ajouts terrain et fiches visitées, avec photos') +
      '</div><h3>Fichier de cartographie</h3>';
    var pdfActs = { atlas: function () { C.pdf.atlasDialog(); }, report: function () { C.pdf.reportDialog(); } };
    if (!docs.length) { el.innerHTML = html + '<p class="muted">Ouvre d\'abord un chantier.</p>'; U.onAct(el, pdfActs); return; }
    var vecOn = {}; Object.keys(C.active).forEach(function (id) { (defaultVec[id] || []).forEach(function (v) { vecOn[v] = true; }); });
    html += '<div id="exWrap"><div class="card"><b>Contenu à exporter</b>';
    docs.forEach(function (d, di) {
      var keys = {}, order = [];
      d.feats.forEach(function (f) { var k = C.folderKey(f); if (keys[k] == null) { keys[k] = 0; order.push(k); } keys[k]++; });
      html += '<div class="card-sub">' + esc(U.baseName(d.name)) + '</div>' + order.map(function (k) {
        return '<label class="check"><input type="checkbox" data-doc="' + di + '" data-folder="' + esc(k) + '"' + (d.visible && !d.hidden[k] ? ' checked' : '') + '><span class="grow">' + esc(k) + '<span class="hint">' + keys[k] + ' élément(s)</span></span></label>';
      }).join('');
      var t = C.terrainOf(d);
      if (t && t.feats.length) html += '<label class="check"><input type="checkbox" data-terrain="' + di + '" checked><span class="grow">Ajouts terrain<span class="hint">' + t.feats.length + ' élément(s), avec liens des photos</span></span></label>';
    });
    html += '<label class="check"><input type="checkbox" id="exFiches" checked><span class="grow">Joindre les fiches pylônes<span class="hint">Chaque pylône porte les champs de sa fiche</span></span></label>';
    var nVec = C.VECTORS.filter(function (v) { return vecOn[v.id]; }).length;
    html += '<div class="grp" id="exVecG"><button type="button"><span>Réseaux publics en tracés<span class="hint">1 km autour de « ' + esc(a ? U.baseName(a.name) : '') + ' » — pré-cochés selon tes calques</span></span><span class="count" id="exVecN"' + (nVec ? '' : ' hidden') + '>' + nVec + '</span><span class="chev">›</span></button><div class="items">' +
      C.VECTORS.map(function (v) { return '<label class="check"><input type="checkbox" data-vec="' + v.id + '"' + (vecOn[v.id] ? ' checked' : '') + '><span class="grow">' + esc(v.label) + '</span></label>'; }).join('') +
      '<label class="check"><input type="checkbox" id="exCom"><span class="grow">Limites des communes traversées</span></label></div></div></div>';
    var fmt = U.store('exFmt') || 'kmz';
    html += '<div class="card"><b>Format</b><div class="seg tight" id="exFmt">' + FORMATS.map(function (f) { return '<button data-val="' + f[0] + '"' + (f[0] === fmt ? ' class="on"' : '') + '>' + f[1] + '</button>'; }).join('') + '</div>' +
      '<p class="muted small" id="exFmtHint"></p>' +
      '<label class="check"><input type="checkbox" id="exCsv" checked><span class="grow">+ Tableau CSV des pylônes<span class="hint">N°, GPS, Lambert 93, commune, statut, lien Waze</span></span></label>' +
      '<label class="check"><input type="checkbox" id="exCsvCom"><span class="grow">+ Liste des communes traversées (CSV)</span></label>' +
      '<label class="check"><input type="checkbox" id="exCsvTer"><span class="grow">+ Tableau des ajouts terrain (CSV)</span></label>' +
      '<label class="field"><span>Nom du fichier</span><input type="text" id="exName" value="' + esc((a ? U.baseName(a.name).replace(/ \(modifié \d{4}-\d{2}-\d{2}\)$/, '') : 'Export') + ' - export ' + U.isoDay()) + '"></label>' +
      '</div><div class="sticky-foot"><button class="btn primary big" id="exGo">Exporter…</button></div></div>';
    el.innerHTML = html;
    U.onAct(el, pdfActs);
    $('exFmtHint').textContent = FORMAT_HINTS[fmt];
    U.pickOne($('exFmt'), function (v) { fmt = v; U.store('exFmt', fmt); $('exFmtHint').textContent = FORMAT_HINTS[fmt]; });
    var g = $('exVecG'); g.querySelector('button').onclick = function () { g.classList.toggle('open'); };
    g.addEventListener('change', function () { var n = g.querySelectorAll('[data-vec]:checked').length; $('exVecN').textContent = n; $('exVecN').hidden = !n; });
    $('exGo').onclick = function () { runExport(el, docs, a, fmt); };
  };
  function runExport(el, docs, a, fmt) {
    var feats = [], images = {};
    var withF = $('exFiches').checked;
    docs.forEach(function (d, di) {
      var keep = {}; el.querySelectorAll('[data-doc="' + di + '"]').forEach(function (c) { if (c.checked) keep[c.getAttribute('data-folder')] = true; });
      var multi = docs.length > 1;
      C.docFeaturesForExport(d, { withFiches: withF }).forEach(function (f, i) {
        if (!keep[C.folderKey(d.feats[i])]) return;
        if (multi) f.folder = [U.baseName(d.name)].concat(f.folder || []);
        feats.push(f);
      });
      Object.assign(images, d.images || {});
      var tb = el.querySelector('[data-terrain="' + di + '"]');
      if (tb && tb.checked) {
        var t = C.terrainOf(d);
        t.feats.forEach(function (f) {
          var o = { kind: f.kind, name: f.name, coords: f.coords, folder: (multi ? [U.baseName(d.name)] : []).concat(f.folder), desc: f.desc, data: (f.data || []).slice(), style: f.style };
          if ((f.photos || []).some(function (p) { return p.url; })) o.descHtml = esc(f.desc || '') + '<br>' + f.photos.filter(function (p) { return p.url; }).map(function (p, i) { return '<a href="' + esc(p.url) + '">Photo ' + (i + 1) + '</a>'; }).join(' · ');
          feats.push(o);
        });
      }
    });
    var vecIds = []; el.querySelectorAll('[data-vec]').forEach(function (c) { if (c.checked) vecIds.push(c.getAttribute('data-vec')); });
    var wantCom = $('exCom').checked || $('exCsvCom').checked;
    var name = ($('exName').value || 'export').trim();
    var extra = Promise.resolve({ feats: [], report: [] }), communes = Promise.resolve(null);
    if ((vecIds.length || wantCom) && !a) { U.toast('Choisis un chantier actif pour les réseaux et communes'); return; }
    if ((vecIds.length || wantCom) && !U.isOnline()) { U.toast('Réseaux publics et communes : nécessitent du réseau'); return; }
    U.keepAwake(true);
    if (vecIds.length) { U.busy(true, 'Réseaux publics…'); extra = C.fetchPublic(a, vecIds, function (l) { U.busy(true, 'Téléchargement : ' + l + '…'); }); }
    extra.then(function (r) {
      feats = feats.concat(r.feats);
      if (wantCom) { U.busy(true, 'Communes traversées…'); communes = C.fetchCommunes(a); }
      return communes.then(function (coms) {
        if (coms && $('exCom').checked) coms.forEach(function (c) { c.geoms.forEach(function (g) { if (g.kind === 'poly') feats.push({ kind: 'poly', name: c.nom + ' (' + c.insee + ')', coords: g.coords, folder: ['Communes traversées'], data: [['Code INSEE', c.insee]], style: { line: '#455a64', width: 2, fill: '#90a4ae', fillOp: 0.05 } }); }); });
        U.busy(true, 'Création du fichier…');
        var files = [];
        var p;
        if (fmt === 'kmz') p = C.formats.toKMZ(name, feats, images).then(function (b) { files.push({ blob: b, name: name + '.kmz' }); });
        else {
          var txt = fmt === 'kml' ? C.formats.toKML(name, feats) : fmt === 'gpx' ? C.formats.toGPX(name, feats) : fmt === 'geojson' ? C.formats.toGeoJSON(name, feats) : C.formats.toDXF(feats);
          var mime = { kml: 'application/vnd.google-earth.kml+xml', gpx: 'application/gpx+xml', geojson: 'application/geo+json', dxf: 'application/dxf' }[fmt];
          files.push({ blob: new Blob([txt], { type: mime }), name: name + '.' + fmt }); p = Promise.resolve();
        }
        return p.then(function () {
          if ($('exCsv').checked && a) files.push({ blob: new Blob([C.pylonCSV(a)], { type: 'text/csv' }), name: name + ' - pylônes.csv' });
          if ($('exCsvTer').checked && a) files.push({ blob: new Blob([C.terrainCSV(a)], { type: 'text/csv' }), name: name + ' - ajouts terrain.csv' });
          if ($('exCsvCom').checked && coms) files.push({ blob: new Blob([C.formats.toCSV([['Commune', 'Code INSEE', 'Département']].concat(coms.map(function (c) { return [c.nom, c.insee, c.dep]; })))], { type: 'text/csv' }), name: name + ' - communes.csv' });
          U.busy(false); U.keepAwake(false);
          if (r.report.length) U.toast('Réseaux : ' + r.report.join(' · '), 7000);
          return C.choiceDialog(files.length > 1 ? 'Où enregistrer les ' + files.length + ' fichiers ?' : 'Où enregistrer « ' + files[0].name + ' » ?', C.destChoices()).then(function (v) { if (v) return C.deliver(files, { type: v }); });
        });
      });
    }).catch(function (e) { U.busy(false); U.keepAwake(false); U.toast('Export impossible : ' + (e.message || e), 6000); });
  }
})();
