/* Carto chantiers — chantiers ouverts : fenêtre « Chantiers », dossiers affichés, navigateur Drive, pylônes, fiche du point, enregistrement, synchronisation. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, map = C.map, esc = U.esc, ui = C.ui;

  C.docs = [];
  var fileLayers = L.layerGroup().addTo(map);
  var vecR = L.canvas({ padding: 0.5, tolerance: L.Browser.mobile ? 10 : 5 });

  /* ======================= Modèle ======================= */
  function fromParsed(res) {
    var feats = [];
    res.points.forEach(function (p) { feats.push({ uid: U.uid(), kind: 'point', name: p.name, coords: [p.lat, p.lon], folder: p.folder || [], desc: p.desc, data: p.data || [], style: p.style || {} }); });
    res.lines.forEach(function (l) { feats.push({ uid: U.uid(), kind: 'line', name: l.name, coords: l.coords, folder: l.folder || [], desc: l.desc, style: l.style || {}, data: l.data || [] }); });
    res.polys.forEach(function (p) { feats.push({ uid: U.uid(), kind: 'poly', name: p.name, coords: p.rings, folder: p.folder || [], desc: p.desc, style: p.style || {}, data: p.data || [] }); });
    // photos des ajouts terrain : « nom | url » par ligne
    feats.forEach(function (f) {
      var ph = (f.data || []).filter(function (d) { return d[0] === 'Photos'; })[0];
      if (ph) f.photos = ph[1].split(/\n/).map(function (l) { var a = l.split(' | '); return a[1] ? { name: a[0], url: a[1], id: (a[1].match(/\/d\/([^/]+)/) || [])[1] } : null; }).filter(Boolean);
    });
    return feats;
  }
  C.parsePayload = function (r) {
    var res = r.type === 'kml' ? C.Parse.kml(r.text) : r.type === 'gpx' ? C.Parse.gpx(r.text) : C.Parse.geojson(r.text);
    // les lignes/polygones gardent leur dossier : on le reprend depuis le parseur KML si présent
    return fromParsed(res);
  };
  C.tagPylon = function (f) {
    f.pylon = (f.kind === 'point') ? C.Parse.pylonLabel({ name: f.name || '', folder: f.folder || [] }) : null;
    return f;
  };
  function folderKey(f) { return (f.folder || []).join(' › ') || '(racine)'; }
  C.folderKey = folderKey;
  function dataGet(f, k) { var d = (f.data || []).filter(function (x) { return x[0] === k; })[0]; return d ? d[1] : ''; }
  function dataSet(f, k, v) { f.data = (f.data || []).filter(function (x) { return x[0] !== k; }); if (v !== '' && v != null) f.data.push([k, String(v)]); }
  C.dataGet = dataGet; C.dataSet = dataSet;
  C.docKey = function (doc) { return doc.id || doc.uid; };

  C.activeDoc = function () {
    var u = U.store('activeDoc');
    return C.docs.filter(function (d) { return d.uid === u && d.role === 'chantier'; })[0] || C.docs.filter(function (d) { return d.role === 'chantier'; })[0] || null;
  };
  C.setActiveDoc = function (doc) { if (doc) U.store('activeDoc', doc.uid); updateChip(); C.refreshTab('terrain', 'chantier', 'export'); };
  C.terrainOf = function (chantier, create) {
    if (!chantier) return null;
    var t = C.docs.filter(function (d) { return d.role === 'terrain' && d.terrainOf === C.docKey(chantier); })[0];
    if (!t && create) {
      t = newDoc({ name: U.baseName(chantier.name) + ' - terrain.kml', role: 'terrain', source: 'new', parent: chantier.parent || { id: 'root', name: 'Mon Drive' }, terrainOf: C.docKey(chantier), feats: [] });
      C.docs.push(t); persistTerrain(t); render(t); saveOpenList();
    }
    return t;
  };
  function newDoc(o) {
    return Object.assign({ uid: U.uid(), id: null, name: 'Sans nom', parent: null, source: 'drive', role: 'chantier', feats: [], images: {}, visible: true, hidden: {}, editing: false, dirty: false, group: L.featureGroup() }, o);
  }

  /* ---- Mémorisation des fichiers ouverts ---- */
  function saveOpenList() {
    U.storeJSON('openDocs', C.docs.map(function (d) {
      return { uid: d.uid, id: d.id, name: d.name, source: d.source, role: d.role, visible: d.visible, hidden: d.hidden, terrainOf: d.terrainOf, parent: d.parent };
    }));
  }
  C.saveOpenList = saveOpenList;
  function persistLocal(doc) { C.saveData('doc-' + doc.uid, { feats: doc.feats, images: doc.images, name: doc.name, parent: doc.parent, id: doc.id }); }
  function persistTerrain(doc) { C.saveData('terrain-' + doc.terrainOf, { feats: doc.feats, name: doc.name, parent: doc.parent, id: doc.id }); }
  C.persistDoc = function (doc) { if (doc.role === 'terrain') persistTerrain(doc); else if (doc.source !== 'drive' || doc.dirty) persistLocal(doc); };

  /* ======================= Ouverture ======================= */
  function addDoc(doc, quiet) {
    var same = C.docs.filter(function (d) { return d.id && d.id === doc.id; })[0];
    if (same) { closeDoc(same, true); }
    doc.feats.forEach(C.tagPylon);
    if (doc.role === 'terrain') doc.feats.forEach(function (f) { var n = dataGet(f, 'Note'); if (n || f.desc) f.desc = n; f.pylon = null; });
    var prefs = (U.storeJSON('folderPrefs') || {})[C.docKey(doc)];
    if (prefs) doc.hidden = prefs;
    C.docs.push(doc);
    if (doc.role === 'chantier' && (!C.activeDoc() || !quiet)) U.store('activeDoc', doc.uid);
    render(doc); saveOpenList(); updateChip();
    refreshTabsSoon();
    return doc;
  }
  var refreshTabsSoon = U.debounce(function () { C.refreshTab('terrain', 'chantier', 'export'); }, 150);
  C.openDriveFile = function (id, opts) {
    opts = opts || {};
    if (!opts.quiet) U.busy(true, 'Ouverture du chantier…');
    var fromCache = null;
    return C.callPorte('fichier', { id: id }).then(function (j) {
      C.saveData('fichier-' + id, j.fichier); return j.fichier;
    }).catch(function (err) {
      return C.loadData('fichier-' + id).then(function (c) { if (!c) throw err; fromCache = c.savedAt; return c.data; });
    }).then(function (r) {
      var doc = newDoc({ id: id, name: r.name, parent: r.parent || opts.parent || null, source: 'drive', role: opts.role || (/ - terrain\.kml$/i.test(r.name) ? 'terrain' : 'chantier'), images: r.images || {}, feats: C.parsePayload(r), terrainOf: opts.terrainOf });
      if (doc.role === 'terrain' && !doc.terrainOf) {
        var ch = C.docs.filter(function (d) { return d.role === 'chantier' && U.baseName(d.name) + ' - terrain.kml' === r.name; })[0];
        doc.terrainOf = ch ? C.docKey(ch) : r.name;
        restoreTerrainState(doc);
      }
      addDoc(doc, opts.quiet);
      if (doc.role === 'terrain') persistTerrain(doc);
      U.busy(false);
      if (fromCache && !opts.quiet) U.toast('Pas de réseau : copie du ' + U.fmtDate(fromCache, true), 4000);
      if (doc.role === 'chantier') {
        if (!opts.quiet) { fit(doc); foldersDialog(doc, true); }
        findTerrain(doc);
        if (C.fiches) C.fiches.load(doc);
      }
      return doc;
    }).catch(function (e) {
      U.busy(false);
      if (!opts.quiet) U.toast('Impossible d\'ouvrir : ' + (e.message || e), 5000);
      throw e;
    });
  };
  function restoreTerrainState(doc) {
    // garde les ajouts locaux non encore envoyés
    C.loadData('terrain-' + doc.terrainOf).then(function (c) {
      if (!c || !c.data) return;
      var known = {}; doc.feats.forEach(function (f) { known[f.uid] = true; });
      var pending = (c.data.feats || []).filter(function (f) { return f._local; });
      if (pending.length) { doc.feats = doc.feats.concat(pending); render(doc); }
    });
  }
  function findTerrain(chantier) {
    var key = C.docKey(chantier);
    if (C.terrainOf(chantier)) return;
    var name = U.baseName(chantier.name) + ' - terrain.kml';
    // 1) copie locale (ajouts faits hors réseau)
    C.loadData('terrain-' + key).then(function (c) {
      if (c && c.data && !C.terrainOf(chantier)) {
        var t = newDoc({ id: c.data.id, name: c.data.name || name, parent: c.data.parent || chantier.parent, source: c.data.id ? 'drive' : 'new', role: 'terrain', terrainOf: key, feats: c.data.feats || [] });
        addDoc(t, true); return;
      }
      // 2) fichier terrain existant sur le Drive, à côté du chantier
      if (chantier.source !== 'drive' || !U.isOnline()) return;
      C.callPorte('dossier', { id: (chantier.parent && chantier.parent.id) || 'root' }).then(function (j) {
        var f = (j.contenu.fichiers || []).filter(function (x) { return x.name === name; })[0];
        if (f && !C.terrainOf(chantier)) C.openDriveFile(f.id, { quiet: true, role: 'terrain', terrainOf: key, parent: chantier.parent });
      }).catch(function () {});
    });
  }
  function openOneLocal(file, many) {
    U.busy(true, 'Lecture de « ' + file.name + ' »…');
    return C.formats.readMapFile(file).then(function (r) {
      var doc = newDoc({ name: r.name, source: 'local', role: 'chantier', images: r.images, feats: C.parsePayload(r), parent: null });
      addDoc(doc); persistLocal(doc); U.busy(false);
      if (!many) { fit(doc); foldersDialog(doc, true); }
      if (C.fiches) C.fiches.load(doc);
      return doc;
    }).catch(function (e) { U.busy(false); U.toast('Lecture impossible de « ' + file.name + ' » : ' + (e.message || e), 5000); });
  }
  C.openLocalFiles = function (files) {
    files = (files || []).filter(function (f) { return /\.(kmz|kml|gpx|geojson|json)$/i.test(f.name); });
    if (!files.length) return Promise.resolve();
    var chain = Promise.resolve(), last = null;
    files.forEach(function (f) { chain = chain.then(function () { return openOneLocal(f, files.length > 1).then(function (d) { if (d) last = d; }); }); });
    return chain.then(function () {
      if (files.length > 1) fit(null);
      if (last) U.toast(files.length > 1 ? files.length + ' chantiers ouverts depuis l\'appareil' : 'Chantier ouvert depuis l\'appareil : enregistre une version pour le mettre sur le Drive (onglet Chantier)', 5000);
    });
  };
  C.openLocalFile = function () {
    return U.pickFiles('.kmz,.kml,.gpx,.geojson,.json').then(C.openLocalFiles);
  };
  /* Glisser-déposer sur l'ordinateur : cartes → ouvertes ; tableaux → import des fiches */
  (function dropZone() {
    var ov = document.createElement('div'); ov.id = 'dropOv'; ov.innerHTML = '<div>Dépose ici tes KMZ, KML, GPX, GeoJSON<br><span>ou un tableau CSV / Excel à importer</span></div>';
    document.body.appendChild(ov);
    var depth = 0;
    function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
    document.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; depth++; ov.classList.add('on'); e.preventDefault(); });
    document.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) ov.classList.remove('on'); });
    document.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; ov.classList.remove('on');
      var files = Array.prototype.slice.call(e.dataTransfer.files || []);
      var maps = files.filter(function (f) { return /\.(kmz|kml|gpx|geojson|json)$/i.test(f.name); });
      var tables = files.filter(function (f) { return /\.(csv|txt|xlsx|xls|ods)$/i.test(f.name); });
      if (!maps.length && !tables.length) { U.toast('Format non reconnu : KMZ, KML, GPX, GeoJSON, CSV ou Excel'); return; }
      C.closeDialog(2); C.closeDialog(1);
      C.openLocalFiles(maps).then(function () { if (tables.length && C.fiches) C.fiches.importFile(tables[0], {}); });
    });
  })();
  C.newChantier = function () {
    return C.promptDialog('Nouveau chantier', 'Nom du chantier', '', 'Créer').then(function (n) {
      if (!n) return;
      var doc = newDoc({ name: n + '.kmz', source: 'new', role: 'chantier', parent: { id: 'root', name: 'Mon Drive' }, feats: [], editing: true, dirty: true });
      addDoc(doc); persistLocal(doc); C.closeDialog(1);
      U.toast('Chantier créé : ajoute ses pylônes depuis l\'onglet Chantier', 4500);
      C.openPanel('chantier');
    });
  };
  function closeDoc(doc, silent) {
    fileLayers.removeLayer(doc.group);
    C.docs = C.docs.filter(function (d) { return d !== doc; });
    if (doc.role === 'chantier') {
      var t = C.terrainOf(doc); if (t && !silent) { fileLayers.removeLayer(t.group); C.docs = C.docs.filter(function (d) { return d !== t; }); }
    }
    saveOpenList(); updateChip(); clearSelection(); refreshTabsSoon();
  }
  C.closeDoc = closeDoc;

  C.restoreOpenDocs = function () {
    var list = U.storeJSON('openDocs') || [];
    var jobs = list.map(function (o) {
      if (o.role === 'terrain') return Promise.resolve();
      if (o.source === 'drive' && o.id) return C.loadData('doc-' + o.uid).then(function (c) {
        if (c && c.data && c.data.feats) { // modifications locales non encore enregistrées sur le Drive
          var d = newDoc({ uid: o.uid, id: o.id, name: c.data.name, parent: c.data.parent || o.parent, source: 'drive', role: 'chantier', feats: c.data.feats, images: c.data.images || {}, visible: o.visible !== false, hidden: o.hidden || {}, dirty: true });
          addDoc(d, true); findTerrain(d); if (C.fiches) C.fiches.load(d); return;
        }
        return C.openDriveFile(o.id, { quiet: true, parent: o.parent }).then(function (d) { d.visible = o.visible !== false; d.hidden = o.hidden || {}; render(d); });
      }).catch(function () {});
      return C.loadData('doc-' + o.uid).then(function (c) {
        if (!c) return;
        var d = newDoc({ uid: o.uid, id: c.data.id || null, name: c.data.name, parent: c.data.parent, source: o.source, role: o.role || 'chantier', feats: c.data.feats, images: c.data.images || {}, visible: o.visible !== false, hidden: o.hidden || {}, dirty: true });
        addDoc(d, true); findTerrain(d); if (C.fiches) C.fiches.load(d);
      });
    });
    return Promise.all(jobs).then(function () {
      var a = list.filter(function (o) { return o.uid === U.store('activeDoc'); })[0];
      updateChip();
      return C.docs.length;
    });
  };

  /* ======================= Dessin ======================= */
  function pylonClass(doc, f) {
    var st = C.fiches ? C.fiches.statusOf(doc, f.pylon) : '';
    return 'pyl-ico' + (st === 'Validé' ? ' done' : st === 'Visité' ? ' seen' : '') + (doc.editing ? ' edit' : '') + (selected && selected.f === f ? ' sel' : '');
  }
  function iconFor(doc, href) {
    if (!href || !doc.images) return null;
    var key = href.replace(/^\.?\//, ''), src = doc.images[key];
    if (!src) { for (var k in doc.images) { if (k.split('/').pop() === key.split('/').pop()) { src = doc.images[k]; break; } } }
    return src ? L.icon({ iconUrl: src, iconSize: [28, 28], iconAnchor: [14, 14] }) : null;
  }
  function render(doc) {
    var g = doc.group; g.clearLayers();
    if (!fileLayers.hasLayer(g) && doc.visible) fileLayers.addLayer(g);
    if (!doc.visible) { fileLayers.removeLayer(g); return; }
    doc.feats.forEach(function (f) {
      if (doc.hidden[folderKey(f)]) return;
      var s = f.style || {}, m;
      var terr = doc.role === 'terrain';
      if (f.kind === 'poly') {
        m = L.polygon(f.coords, { renderer: vecR, interactive: terr, bubblingMouseEvents: false, color: s.line || (terr ? '#7b1fa2' : '#ffcc00'), weight: s.noOutline ? 0 : (s.width || 2), opacity: s.lineOp != null ? s.lineOp : 1,
          fillColor: s.fill || s.line || (terr ? '#ba68c8' : '#ffcc00'), fillOpacity: s.noFill ? 0 : (s.fillOp != null ? Math.min(s.fillOp, 0.5) : 0.2) });
      } else if (f.kind === 'line') {
        m = L.polyline(f.coords, { renderer: vecR, interactive: terr, bubblingMouseEvents: false, color: s.line || (terr ? '#7b1fa2' : '#ff3b30'), weight: Math.max(2, s.width || 3), opacity: s.lineOp != null ? Math.max(s.lineOp, 0.6) : 0.9, dashArray: terr ? '6 5' : null });
      } else if (f.pylon && !terr) {
        m = L.marker(f.coords, { icon: L.divIcon({ className: pylonClass(doc, f), html: '<div>' + esc(f.pylon) + '</div>', iconSize: [0, 0] }), zIndexOffset: 1000, draggable: doc.editing });
      } else if (terr) {
        var ok = dataGet(f, 'Statut') === 'Validé';
        m = L.marker(f.coords, { icon: L.divIcon({ className: 'tr-ico' + (ok ? ' ok' : ''), html: '<div></div>', iconSize: [0, 0] }), draggable: false, zIndexOffset: 900 });
        if (f.name) m.bindTooltip(esc(f.name), { permanent: true, direction: 'right', offset: [10, -14], className: 'pt-lbl' });
      } else {
        var ic = iconFor(doc, s.icon);
        m = ic ? L.marker(f.coords, { icon: ic, draggable: doc.editing })
               : (doc.editing ? L.marker(f.coords, { draggable: true, icon: L.divIcon({ className: 'pyl-ico edit pt', html: '<div></div>', iconSize: [0, 0] }) })
                  : L.circleMarker(f.coords, { renderer: vecR, radius: 6, color: '#fff', weight: 2, fillColor: s.iconColor || '#ffb300', fillOpacity: 1, bubblingMouseEvents: false }));
        if (f.name) m.bindTooltip(esc(f.name), { permanent: true, direction: 'right', offset: [8, 0], className: 'pt-lbl' });
      }
      f._layer = m;
      m.on('click', function (ev) {
        L.DomEvent.stop(ev);
        if (C.mapClickHook && C.mapClickHook(f.kind === 'point' ? L.latLng(f.coords[0], f.coords[1]) : ev.latlng, f)) return;
        select(doc, f);
      });
      if (m.dragging) m.on('dragend', function () {
        var ll = m.getLatLng(); f.coords = [ll.lat, ll.lng]; markDirty(doc);
        U.toast('« ' + (f.name || 'Point') + ' » déplacé', 1800);
      });
      g.addLayer(m);
    });
    updateChip();
  }
  C.renderDoc = render;
  C.renderAll = function () { C.docs.forEach(render); };
  function markDirty(doc) {
    doc.dirty = true; C.persistDoc(doc);
    if (doc.role === 'terrain') C.sync.add({ t: 'terrain', key: doc.terrainOf });
    C.refreshTab('terrain', 'chantier');
  }
  C.markDirty = markDirty;

  function updateChip() {
    var a = C.activeDoc(), n = C.docs.filter(function (d) { return d.role !== 'terrain'; }).length;
    $('chantierName').textContent = a ? U.baseName(a.name) + (n > 1 ? '  (+' + (n - 1) + ')' : '') + (a.editing ? ' ✎' : '') : (n ? n + ' chantier(s)' : 'Ouvrir…');
    var hasPyl = C.allPylons().length > 0;
    $('pylLbl').textContent = hasPyl ? 'Pylône' : 'Point';
  }
  C.updateChip = updateChip;

  function fit(doc) {
    var b = L.latLngBounds([]);
    (doc ? [doc] : C.docs.filter(function (d) { return d.visible; })).forEach(function (d) {
      d.feats.forEach(function (f) {
        if (d.hidden[folderKey(f)]) return;
        if (f.kind === 'point') b.extend(f.coords);
        else if (f.kind === 'line') f.coords.forEach(function (c) { b.extend(c); });
        else f.coords[0].forEach(function (c) { b.extend(c); });
      });
    });
    if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 17 });
  }
  C.fitDocs = fit;
  $('btnFit').addEventListener('click', function () { var a = C.activeDoc(); if (C.docs.length) fit(a || null); else U.toast('Ouvre d\'abord un chantier'); });

  /* ======================= Dossiers affichés ======================= */
  function foldersDialog(doc, firstTime) {
    var keys = {}, order = [];
    doc.feats.forEach(function (f) { var k = folderKey(f); if (!keys[k]) { keys[k] = 0; order.push(k); } keys[k]++; });
    if (firstTime && (order.length < 2 || (U.storeJSON('folderPrefs') || {})[C.docKey(doc)])) return;
    var html = '<p class="muted">Coche les dossiers à afficher sur la carte. Ton choix est retenu pour ce chantier.</p><div class="row"><button class="btn ghost" id="fdAll">Tout cocher</button><button class="btn ghost" id="fdNone">Tout décocher</button></div>' +
      order.map(function (k, i) {
        var depth = k === '(racine)' ? 0 : k.split(' › ').length - 1;
        return '<label class="check indent' + Math.min(depth, 3) + '"><input type="checkbox" data-folder="' + i + '"' + (doc.hidden[k] ? '' : ' checked') + '><span class="grow">' + esc(k.split(' › ').pop()) + '<span class="hint">' + keys[k] + ' élément(s)</span></span></label>';
      }).join('');
    var d = C.openDialog({ title: 'Dossiers de « ' + U.baseName(doc.name) + ' »', body: html, foot: '<button class="btn primary big" id="fdOk">Afficher</button>' });
    d.q('#fdAll').onclick = function () { d.qa('[data-folder]').forEach(function (c) { c.checked = true; }); };
    d.q('#fdNone').onclick = function () { d.qa('[data-folder]').forEach(function (c) { c.checked = false; }); };
    d.q('#fdOk').onclick = function () {
      doc.hidden = {};
      d.qa('[data-folder]').forEach(function (c) { if (!c.checked) doc.hidden[order[+c.getAttribute('data-folder')]] = true; });
      var p = U.storeJSON('folderPrefs') || {}; p[C.docKey(doc)] = doc.hidden; U.storeJSON('folderPrefs', p);
      render(doc); saveOpenList(); C.closeDialog(1);
    };
  }
  C.foldersDialog = foldersDialog;

  /* ======================= Fenêtre « Chantiers » : ouvrir, créer, afficher, fermer ======================= */
  // Le seul endroit où l'on ouvre ou crée un chantier (bouton « Chantier » en haut, ou onglet Chantier → Changer).
  C.chantiersDialog = function () {
    var docs = [];
    var d = C.openDialog({ title: 'Chantiers', body:
      '<div id="chOpen"></div>' +
      '<h3 class="sec-title">Ouvrir depuis Mon Drive</h3><div class="rows" id="chDrive"><div class="empty">Lecture du Drive…</div></div>' +
      '<div class="rows">' + ui.item('browse', '📁', 'Parcourir les dossiers du Drive', 'Chantier rangé ailleurs qu\'à la racine') +
      ui.item('local', '📱', 'Ouvrir depuis l\'appareil', 'KMZ reçu par mail, WhatsApp…') + '</div>' +
      '<h3 class="sec-title">Créer</h3><div class="rows">' + ui.item('create', '✚', 'Nouveau chantier', 'Vierge : pylônes à ajouter sur la carte') +
      ui.item('table', '📊', 'Chantier depuis un tableau', 'Coordonnées CSV, Excel ou Google Sheet') + '</div>' });
    function drawOpen() {
      var el = d.q('#chOpen'); if (!el) return;
      docs = C.docs.slice();
      if (!docs.length) { el.innerHTML = '<p class="muted">Aucun chantier ouvert. Tu peux en superposer plusieurs.</p>'; return; }
      var act = C.activeDoc(), many = docs.filter(function (x) { return x.role === 'chantier'; }).length > 1;
      el.innerHTML = '<h3 class="sec-title">Ouverts</h3><div class="rows">' + docs.map(function (doc, i) {
        var role = doc.role === 'terrain' ? '<span class="tag terrain">terrain</span>' : (doc === act && many ? '<span class="tag ok">★ actif</span>' : '');
        var src = doc.source === 'local' ? 'sur l\'appareil' : doc.source === 'new' ? 'pas encore sur le Drive' : (doc.parent && doc.parent.name ? doc.parent.name : 'Drive');
        return '<div class="list-item"><button class="ico-btn' + (doc.visible ? ' on' : '') + '" data-act="toggle" data-i="' + i + '" title="Afficher ou masquer sur la carte" aria-label="Afficher ou masquer">👁</button>' +
          '<span class="grow"><span class="item-title">' + esc(U.baseName(doc.name)) + ' ' + role + (doc.dirty && doc.role !== 'terrain' ? ' <span class="tag warn">modifié</span>' : '') + '</span><span class="item-sub">' + esc(src) + ' · ' + doc.feats.length + ' éléments</span></span>' +
          '<button class="ico-btn" data-act="folders" data-i="' + i + '" title="Dossiers affichés" aria-label="Dossiers affichés">☰</button>' +
          (doc.role === 'chantier' && doc !== act ? '<button class="ico-btn" data-act="activate" data-i="' + i + '" title="Rendre actif" aria-label="Rendre actif">★</button>' : '') +
          '<button class="ico-btn" data-act="close" data-i="' + i + '" title="Fermer" aria-label="Fermer">×</button></div>';
      }).join('') + '</div><p class="muted small sec-note">👁 afficher ou masquer · ☰ dossiers affichés' + (many ? ' · ★ rendre actif' : '') + ' · × fermer</p>';
    }
    function drawDrive(list, saved) {
      var el = d.q('#chDrive'), reg = C.offlineRegistry(); if (!el) return;
      if (!list.length) { el.innerHTML = '<div class="empty">Aucun fichier de cartographie à la racine de ton Drive.</div>'; return; }
      el.innerHTML = (saved ? '<p class="muted">Pas de réseau : liste du ' + U.fmtDate(saved, true) + '.</p>' : '') + list.map(function (f) {
        var open = C.docs.some(function (x) { return x.id === f.id; });
        return '<button class="list-item" data-act="open" data-id="' + esc(f.id) + '"><span class="tag">' + esc(f.ext) + '</span><span class="grow"><span class="item-title">' + esc(U.baseName(f.name)) + '</span><span class="item-sub">modifié le ' + U.fmtDate(f.modified) + '</span></span>' +
          (reg[f.id] ? '<span class="tag ok">hors ligne</span>' : '') + (open ? '<span class="tag grey">ouvert</span>' : '') + '</button>';
      }).join('');
    }
    d.on({
      toggle: function (i) { var doc = docs[+i]; doc.visible = !doc.visible; render(doc); saveOpenList(); drawOpen(); },
      folders: function (i) { foldersDialog(docs[+i]); },
      activate: function (i) { C.setActiveDoc(docs[+i]); drawOpen(); },
      close: function (i) {
        var doc = docs[+i];
        var go = doc.dirty && doc.role !== 'terrain' ? C.confirmDialog('« ' + U.baseName(doc.name) + ' » a des modifications non enregistrées sur le Drive. Fermer quand même ? (elles restent gardées sur cet appareil)', 'Fermer') : Promise.resolve(true);
        go.then(function (y) { if (y) { closeDoc(doc); drawOpen(); } });
      },
      open: function (id) { C.closeDialog(1); C.openDriveFile(id, { parent: { id: 'root', name: 'Mon Drive' } }); },
      browse: function () { C.driveDialog({ mode: 'file' }).then(function (f) { if (f) { C.closeDialog(1); C.openDriveFile(f.id, { parent: f.parent }); } }); },
      local: function () { C.closeDialog(1); C.openLocalFile(); },
      create: function () { C.newChantier(); },
      table: function () { C.closeDialog(1); C.fiches.importDialog({ createDoc: true }); }
    });
    drawOpen();
    C.callPorte('liste').then(function (j) { C.saveData('liste', j.fichiers); return { list: j.fichiers }; })
      .catch(function (e) { return C.loadData('liste').then(function (c) { if (c) return { list: c.data, saved: c.savedAt }; throw e; }); })
      .then(function (r) { drawDrive(r.list, r.saved); })
      .catch(function (e) {
        var el = d.q('#chDrive'); if (!el) return;
        el.innerHTML = '<div class="empty">' + (C.porteConfigured() ? 'Drive inaccessible : ' + esc(e.message || e) + (e.porte || /HTTP|erreur 4|page/.test(e.message || '') ? C.porteHelpHtml() : '')
          : 'La porte Drive n\'est pas encore réglée.<div class="row row-center"><button class="btn primary" data-open-settings>Ouvrir les réglages</button></div>') + '</div>';
      });
  };
  $('btnChantier').addEventListener('click', C.chantiersDialog);

  /* ======================= Navigateur Drive ======================= */
  // mode 'file' : choisir un fichier de cartographie ; 'folder' : choisir un dossier ; 'table' : choisir un Google Sheet ou un CSV
  C.driveDialog = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var done = false, cur = { id: 'root', name: 'Mon Drive' };
      var d = C.openDialog({ level: 2, title: opts.mode === 'folder' ? 'Choisir un dossier du Drive' : opts.mode === 'table' ? 'Choisir un tableau du Drive' : 'Choisir un fichier du Drive', body: '<div id="brPath" class="muted crumbs"></div><div id="brList"><div class="empty">Lecture…</div></div>',
        foot: opts.mode === 'folder' ? '<button class="btn" id="brNew">＋ Créer un dossier</button><button class="btn primary push" id="brPick">Choisir ce dossier</button>' : '',
        onClose: function () { if (!done) resolve(null); } });
      function load(id) {
        d.q('#brList').innerHTML = '<div class="empty">Lecture…</div>';
        var call = C.callPorte('dossier', opts.mode === 'table' ? { id: id, tableaux: '1' } : { id: id });
        call.then(function (j) {
          var c = j.contenu; cur = c.dossier;
          d.q('#brPath').innerHTML = '<button class="btn ghost" data-act="go" data-id="root">Mon Drive</button>' + c.chemin.map(function (p) { return ' › <button class="btn ghost" data-act="go" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button>'; }).join('');
          var html = c.dossiers.map(function (f) { return '<button class="list-item" data-act="go" data-id="' + esc(f.id) + '"><span class="item-ico">📁</span><span class="grow"><span class="item-title">' + esc(f.name) + '</span></span><span class="caret">›</span></button>'; }).join('');
          if (opts.mode === 'file' || opts.mode === 'table') html += c.fichiers.map(function (f) { return '<button class="list-item" data-act="pick" data-id="' + esc(f.id) + '"><span class="tag">' + esc(f.ext) + '</span><span class="grow"><span class="item-title">' + esc(f.name) + '</span><span class="item-sub">' + U.fmtDate(f.modified) + '</span></span></button>'; }).join('');
          d.q('#brList').innerHTML = html || '<div class="empty">Dossier vide' + (opts.mode === 'file' ? ' (aucun fichier de cartographie)' : '') + '.</div>';
        }).catch(function (e) { d.q('#brList').innerHTML = '<div class="empty">' + esc(e.message || e) + '</div>'; });
      }
      d.on({
        go: function (id) { load(id); },
        pick: function (id) { done = true; C.closeDialog(2); resolve({ id: id, parent: { id: cur.id, name: cur.name } }); }
      });
      if (d.q('#brPick')) d.q('#brPick').onclick = function () { done = true; C.closeDialog(2); resolve({ id: cur.id, name: cur.name }); };
      if (d.q('#brNew')) d.q('#brNew').onclick = function () {
        C.closeDialog(2);
        C.promptDialog('Créer un dossier dans « ' + cur.name + ' »', 'Nom du dossier', '', 'Créer').then(function (nom) {
          if (!nom) { resolve(null); return; }
          C.postPorte('creerDossier', { parentId: cur.id, nom: nom }).then(function (j) { resolve({ id: j.dossier.id, name: j.dossier.name }); })
            .catch(function (e) { U.toast(e.message || String(e)); resolve(null); });
        });
      };
      load(opts.start || 'root');
    });
  };

  /* ======================= Pylônes ======================= */
  C.allPylons = function () {
    var out = [];
    C.docs.forEach(function (doc) {
      if (!doc.visible || doc.role === 'terrain') return;
      doc.feats.forEach(function (f) { if (f.pylon && !doc.hidden[folderKey(f)]) out.push({ doc: doc, f: f }); });
    });
    return out;
  };
  C.pylonsOf = function (doc) {
    return doc.feats.filter(function (f) { return f.pylon; }).sort(function (a, b) { return U.natural(a.pylon, b.pylon); });
  };
  // Sélecteur de pylône (ou de point quand le chantier n'a pas de pylônes)
  C.pylonsDialog = function () {
    var all = C.allPylons();
    var pts = all.length ? all : [];
    if (!all.length) C.docs.forEach(function (doc) { if (doc.visible) doc.feats.forEach(function (f) { if (f.kind === 'point' && !doc.hidden[folderKey(f)]) pts.push({ doc: doc, f: f }); }); });
    if (!pts.length) { U.toast('Aucun pylône ni point dans les chantiers affichés'); if (!C.docs.length) C.chantiersDialog(); return; }
    var multi = C.docs.filter(function (d) { return d.visible && d.role !== 'terrain'; }).length > 1;
    var d = C.openDialog({ title: all.length ? all.length + ' pylônes' : pts.length + ' points', wide: true, body: '<input class="inp" id="pySearch" placeholder="N° ou nom…" autocomplete="off"><div id="pyList"></div>' });
    function draw() {
      var q = d.q('#pySearch').value.trim().toLowerCase();
      var list = pts.filter(function (p) { return !q || (p.f.pylon || '').toLowerCase().indexOf(q) === 0 || (p.f.name || '').toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return U.natural(a.doc.name, b.doc.name) || U.natural(a.f.pylon || a.f.name, b.f.pylon || b.f.name); });
      var html = '', lastDoc = null, box = '<div class="' + (all.length ? 'pyl-grid' : 'rows') + '">';
      list.forEach(function (p, i) {
        if (multi && p.doc !== lastDoc) { html += (lastDoc ? '</div>' : '') + '<div class="card-sub">' + esc(U.baseName(p.doc.name)) + '</div>' + box; lastDoc = p.doc; }
        else if (!multi && i === 0) html += box;
        var st = C.fiches ? C.fiches.statusOf(p.doc, p.f.pylon) : '';
        html += all.length ? '<button class="btn pyl-btn' + (st === 'Validé' ? ' done' : st === 'Visité' ? ' seen' : '') + '" data-i="' + pts.indexOf(p) + '">' + esc(p.f.pylon) + '</button>'
          : '<button class="list-item" data-i="' + pts.indexOf(p) + '"><span class="grow"><span class="item-title">' + esc(p.f.name || '(sans nom)') + '</span></span></button>';
      });
      html += list.length ? '</div>' : '<div class="empty">Aucun résultat.</div>';
      if (all.length) html += '<p class="muted small sec-foot">Vert : fiche validée · orange : pylône visité</p>';
      d.q('#pyList').innerHTML = html;
      d.qa('[data-i]').forEach(function (b) { b.onclick = function () { var p = pts[+b.getAttribute('data-i')]; C.closeDialog(1); select(p.doc, p.f, true); }; });
    }
    d.q('#pySearch').oninput = draw; draw();
    d.q('#pySearch').onkeydown = function (e) { if (e.key === 'Enter') { var b = d.q('#pyList [data-i]'); if (b) b.click(); } };
    if (U.isDesktop()) setTimeout(function () { d.q('#pySearch').focus(); }, 200);
  };
  $('btnPyl').addEventListener('click', C.pylonsDialog);

  /* ======================= Sélection et fiche « point » ======================= */
  var selected = null, target = null;
  C.selected = function () { return selected; };
  function clearSelection() {
    if (target) { map.removeLayer(target); target = null; }
    if (selected && selected.f && selected.f._layer && selected.f._layer.getElement && selected.f._layer.getElement()) selected.f._layer.getElement().classList.remove('sel');
    selected = null;
    $('pylName').textContent = '—';
    $('pointSheet').classList.remove('open');
  }
  C.clearSelection = clearSelection;
  $('ptClose').addEventListener('click', clearSelection);

  var PYL_PREFIX = /^\s*(?:pyl[oô]nes?|pyl\.?|p|n°|no\.?|#)?\s*[-.]?\s*\d{1,4}(?:\s?(?:bis|ter|[a-z]{1,2}))?\b/i;
  function select(doc, f, fly) {
    clearSelection();
    selected = { doc: doc, f: f };
    var el = f._layer && f._layer.getElement && f._layer.getElement(); if (el) el.classList.add('sel');
    var ll = f.kind === 'point' ? f.coords : null;
    if (fly && ll) map.setView(ll, Math.max(map.getZoom(), 18));
    if (f.pylon) $('pylName').textContent = f.pylon;
    var title;
    if (f.pylon && doc.role !== 'terrain') {
      var rest = (f.name || '').replace(PYL_PREFIX, '').replace(/^[\s\-–:]+/, '').trim();
      title = f.name === f.pylon ? 'Pylône ' + f.pylon : 'Pylône ' + f.pylon + (rest && rest !== f.name ? ' — ' + rest : '');
    } else title = f.name || (f.kind === 'point' ? 'Point' : f.kind === 'line' ? 'Ligne' : 'Zone');
    showPoint(title, ll || centerOf(f), doc, f);
  }
  C.selectFeature = select;
  var infoSeq = 0, infoReq = 0;
  function centerOf(f) {
    var cs = f.kind === 'line' ? f.coords : f.coords[0], la = 0, lo = 0;
    cs.forEach(function (c) { la += c[0]; lo += c[1]; });
    return [la / cs.length, lo / cs.length];
  }
  C.centerOf = centerOf;

  function showPoint(title, ll, doc, f) {
    var lat = ll[0], lon = ll[1], s = lat.toFixed(6) + ',' + lon.toFixed(6);
    var html = '<div class="coords">' + lat.toFixed(6) + ', ' + lon.toFixed(6) + (C.geo ? ' · L93 ' + C.geo.L93.fromWGS(lat, lon).map(function (v) { return Math.round(v); }).join(' / ') : '') + '</div>' +
      '<div class="route-links"><a class="waze" target="_blank" rel="noopener" href="https://waze.com/ul?ll=' + encodeURIComponent(s) + '&navigate=yes">Waze</a>' +
      '<a class="gmaps" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(s) + '&travelmode=driving">Google Maps</a></div><div class="row" id="ptActs"></div><div id="ptInfos"></div><div id="ptMeta"></div>';
    $('ptTitle').textContent = title; $('ptBody').innerHTML = html;
    if (f && f.pylon && doc && doc.role !== 'terrain') {
      var list = C.pylonsOf(doc), i = list.indexOf(f), pv = list[i - 1], nx = list[i + 1];
      if (pv || nx) {
        var nav = document.createElement('div'); nav.className = 'pnav';
        nav.innerHTML = '<button class="btn" data-step="-1" title="Pylône précédent"' + (pv ? '' : ' disabled') + '>◀ ' + (pv ? esc(pv.pylon) : '') + '</button><span class="muted small">' + (i + 1) + ' / ' + list.length + '</span><button class="btn" data-step="1" title="Pylône suivant"' + (nx ? '' : ' disabled') + '>' + (nx ? esc(nx.pylon) : '') + ' ▶</button>';
        $('ptBody').insertBefore(nav, $('ptBody').firstChild);
        nav.querySelectorAll('[data-step]').forEach(function (b) { b.onclick = function () { var g = list[i + +b.getAttribute('data-step')]; if (g) select(doc, g, true); }; });
      }
    }
    var acts = [];
    if (f && f.pylon && doc.role !== 'terrain') acts.push(['fiche', '📋 Fiche pylône', 'primary']);
    if (f && doc.role === 'terrain') acts.push(['editTerrain', '✎ Modifier', 'primary']);
    if (!f || f.kind !== 'point' || doc.role !== 'terrain') acts.push(['addPoint', '📍 Ajouter un point terrain', '']);
    if (f && f.kind === 'line') acts.push(['profile', '⛰ Profil en long', '']);
    acts.push(['info', 'Que trouve-t-on ici ?', '']);
    acts.push(['copy', 'Copier les coordonnées', '']);
    if (f && doc.editing && doc.role !== 'terrain') { acts.push(['rename', 'Renommer', '']); acts.push(['delete', 'Supprimer', 'danger']); }
    if (f && doc.role === 'terrain') acts.push(['delete', 'Supprimer', 'danger']);
    $('ptActs').innerHTML = acts.map(function (a) { return '<button class="btn ' + a[2] + '" data-act="' + a[0] + '">' + a[1] + '</button>'; }).join('');
    var meta = [];
    if (f) {
      if (f.folder && f.folder.length) meta.push('<b>Dossier :</b> ' + esc(f.folder.join(' › ')));
      (f.data || []).forEach(function (d) { if (d[0] !== 'Photos') meta.push('<b>' + esc(d[0]) + ' :</b> ' + esc(d[1])); });
      // pas de redite : la note, la longueur et la surface déjà listées ci-dessus ne sont pas répétées
      if (f.desc && f.desc !== dataGet(f, 'Note')) meta.push(esc(f.desc.length > 600 ? f.desc.slice(0, 600) + '…' : f.desc));
      if (f.kind === 'line' && !dataGet(f, 'Longueur')) meta.push('<b>Longueur :</b> ' + U.fmtDist(C.geo.lineLength(f.coords)));
      if (f.kind === 'poly' && !dataGet(f, 'Surface')) meta.push('<b>Surface :</b> ' + U.fmtArea(C.geo.area(f.coords[0])));
    }
    $('ptMeta').innerHTML = '<div class="meta">' + meta.join('\n') + '</div>' + (f && f.photos && f.photos.length ? '<div class="photos">' + f.photos.map(photoThumb).join('') + '</div>' : '');
    if (f && f.pylon && C.fiches) C.fiches.summaryInto($('ptMeta'), doc, f);
    var mySeq = ++infoSeq;
    function runInfo() {
      var tok = ++infoReq;
      $('ptInfos').innerHTML = '<p class="muted">Recherche…</p>';
      C.queryInfo(L.latLng(lat, lon)).then(function (h) { if (tok === infoReq && mySeq === infoSeq) $('ptInfos').innerHTML = h; });
    }
    // un appui sur la carte avec un calque interrogeable allumé (géologie, environnement, hauteur LiDAR…) affiche tout de suite ce qu'il y a
    if (!f && Object.keys(C.active).some(function (id) { var it = C.ITEMS[id]; return it && it.info && !C.hiddenLayers[id] && (it.special_info || U.isOnline()); })) setTimeout(runInfo, 30);
    U.onAct($('ptActs'), {
      fiche: function () { C.fiches.ficheDialog(doc, f); },
      info: runInfo,
      copy: function () { var t = lat.toFixed(6) + ', ' + lon.toFixed(6); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { U.toast('Coordonnées copiées'); }, function () { U.toast(t, 6000); }); },
      addPoint: function () { clearSelection(); C.tools.addTerrain('point', [L.latLng(lat, lon)]); },
      profile: function () { C.tools.profile(f.coords); },
      editTerrain: function () { C.tools.editTerrain(doc, f); },
      'delete': function () {
        C.confirmDialog('Supprimer « ' + (f.name || 'cet élément') + ' » ?', 'Supprimer', true).then(function (y) {
          if (!y) return; doc.feats = doc.feats.filter(function (x) { return x !== f; }); markDirty(doc); render(doc); clearSelection();
        });
      },
      rename: function () { C.promptDialog('Renommer', 'Nouveau nom', f.name || '', 'Renommer').then(function (n) { if (!n) return; f.name = n; C.tagPylon(f); markDirty(doc); render(doc); select(doc, f); }); }
    });
    $('pointSheet').classList.add('open');
    if (!U.isDesktop()) C.closePanel();
    setTimeout(function () { keepVisible(L.latLng(lat, lon)); }, 260);
  }
  function photoThumb(p) {
    var bg = p.thumb ? 'background-image:url(' + p.thumb + ')' : '';
    var inner = p.thumb ? '' : (p.id ? '☁' : '⏳');
    return p.url ? '<a class="ph" target="_blank" rel="noopener" href="' + esc(p.url) + '" style="' + bg + '">' + inner + '</a>' : '<span class="ph" style="' + bg + '" title="En attente d\'envoi">' + inner + '</span>';
  }
  C.photoThumb = photoThumb;
  // garde le point visible à côté de la fiche (en bas sur téléphone, à droite en paysage et sur ordinateur)
  function keepVisible(ll) {
    var sh = $('pointSheet'); if (!sh.classList.contains('open')) return;
    var r = sh.getBoundingClientRect(), m = map.getContainer().getBoundingClientRect();
    var p = map.latLngToContainerPoint(ll), sx = p.x + m.left, sy = p.y + m.top;
    if (r.left > m.left + 40) { // fiche à droite
      var free = r.left - m.left, wantX = m.left + free / 2;
      if (sx > r.left - 40 || sx < m.left + 40) map.panBy([sx - wantX, 0], { animate: true });
    } else { // fiche en bas
      var freeH = r.top - m.top, wantY = m.top + Math.max(110, freeH * 0.5);
      if (sy > r.top - 30 || sy < m.top + 90) map.panBy([0, sy - wantY], { animate: true });
    }
  }
  map.on('click', function (e) {
    if (C.mapClickHook && C.mapClickHook(e.latlng)) return;
    if (!U.isDesktop() && $('panel').classList.contains('open')) { C.closePanel(); return; }
    clearSelection();
    target = L.marker(e.latlng, { icon: L.divIcon({ className: 'tgt-ico', html: '<div></div>', iconSize: [0, 0] }) }).addTo(map);
    showPoint('Point choisi', [e.latlng.lat, e.latlng.lng], null, null);
  });

  // point posé depuis la recherche d'adresse
  C.showTarget = function (latlng, title) {
    clearSelection();
    target = L.marker(latlng, { icon: L.divIcon({ className: 'tgt-ico', html: '<div></div>', iconSize: [0, 0] }) }).addTo(map);
    showPoint(title || 'Point choisi', [latlng.lat, latlng.lng], null, null);
  };

  /* ======================= Enregistrer une version ======================= */
  C.docFeaturesForExport = function (doc, opts) {
    opts = opts || {};
    return doc.feats.filter(function (f) { return !opts.visibleOnly || !doc.hidden[folderKey(f)]; }).map(function (f) {
      var o = { kind: f.kind, name: f.name, coords: f.coords, folder: f.folder, desc: f.desc, data: (f.data || []).slice(), style: f.style, pylon: f.pylon };
      if (f.photos && f.photos.length) {
        o.descHtml = (f.desc ? esc(f.desc) + '<br>' : '') + f.photos.filter(function (p) { return p.url; }).map(function (p, i) { return '<a href="' + esc(p.url) + '">Photo ' + (i + 1) + '</a>'; }).join(' · ');
      }
      if (f.pylon && C.fiches && opts.withFiches !== false) C.fiches.appendData(doc, f, o);
      return o;
    });
  };
  C.saveVersion = function (doc) {
    if (!doc) return;
    var isNew = !doc.id;
    var name = isNew ? U.baseName(doc.name) + '.kmz' : U.baseName(doc.name).replace(/ \(modifié \d{4}-\d{2}-\d{2}\)$/, '') + ' (modifié ' + U.isoDay() + ').kmz';
    var dest = doc.parent && doc.parent.id ? Promise.resolve(doc.parent) : C.driveDialog({ mode: 'folder' });
    return dest.then(function (folder) {
      if (!folder) return;
      U.busy(true, 'Enregistrement de « ' + name + ' »…');
      return C.formats.toKMZ(U.baseName(name), C.docFeaturesForExport(doc, { withFiches: false }), doc.images).then(U.blobToBase64).then(function (b64) {
        return C.postPorte('enregistrer', { nom: name, dossierId: folder.id, base64: b64, mime: 'application/vnd.google-earth.kmz' });
      }).then(function (j) {
        U.busy(false);
        doc.dirty = false;
        if (isNew || doc.source !== 'drive') { doc.id = j.fichier.id; doc.source = 'drive'; doc.parent = { id: folder.id, name: folder.name }; }
        else { doc.id = j.fichier.id; doc.name = name; }
        C.deleteData('doc-' + doc.uid); saveOpenList(); updateChip(); C.refreshTab('chantier');
        U.toast('Enregistré sur le Drive : « ' + name + ' »', 4000);
      }).catch(function (e) { U.busy(false); U.toast('Échec de l\'enregistrement : ' + (e.message || e), 6000); });
    });
  };

  /* ======================= Synchronisation (ajouts, photos, fiches) ======================= */
  var sync = C.sync = {};
  var BLOBS = 'carto-blobs', BASE = new URL('./', location.href).href;
  function q() { return U.storeJSON('queue') || []; }
  function setQ(v) { U.storeJSON('queue', v); badge(); }
  function badge() {
    var n = q().length;
    if (n) C.setSyncBadge('⏳ ' + n + ' à envoyer' + (U.isOnline() ? '' : ' (hors réseau)'), '');
    else C.setSyncBadge('', '');
  }
  sync.add = function (task) {
    var list = q();
    var same = list.some(function (t) { return t.t === task.t && t.key === task.key && (task.t !== 'photo' || t.photo === task.photo); });
    if (!same) list.push(task);
    setQ(list); runSoon();
  };
  sync.putBlob = function (key, blob) { return caches.open(BLOBS).then(function (c) { return c.put(BASE + '__blob/' + key, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })); }); };
  sync.getBlob = function (key) { return caches.open(BLOBS).then(function (c) { return c.match(BASE + '__blob/' + key); }).then(function (r) { return r ? r.blob() : null; }); };
  sync.delBlob = function (key) { return caches.open(BLOBS).then(function (c) { return c.delete(BASE + '__blob/' + key); }); };
  var running = false, runSoon = U.debounce(function () { sync.run(); }, 2500);
  sync.photoFolder = function (chantierKey, chantierName) {
    var m = U.storeJSON('photoFolders') || {};
    if (m[chantierKey]) return Promise.resolve(m[chantierKey]);
    return C.postPorte('dossierPhotos', { chantier: chantierName }).then(function (j) {
      m[chantierKey] = { id: j.dossier.id, chemin: j.dossier.chemin }; U.storeJSON('photoFolders', m);
      U.toast('Photos rangées dans « ' + j.dossier.chemin + ' » (dossier modifiable dans l\'onglet Chantier)', 5000);
      return m[chantierKey];
    });
  };
  sync.run = function (manual) {
    badge();
    if (running || !U.isOnline() || !C.porteConfigured()) { if (manual && !U.isOnline()) U.toast('Pas de réseau : envoi au retour du réseau'); return; }
    var list = q(); if (!list.length) return;
    running = true;
    var task = list[0];
    var p;
    if (task.t === 'photo') p = doPhoto(task);
    else if (task.t === 'terrain') p = doTerrain(task);
    else if (task.t === 'fiches') p = C.fiches.push(task.key);
    else p = Promise.resolve();
    p.then(function () {
      setQ(q().filter(function (t) { return !(t.t === task.t && t.key === task.key && t.photo === task.photo); }));
      running = false;
      if (q().length) sync.run(); else { C.setSyncBadge('☁ À jour', 'ok'); setTimeout(badge, 2500); }
    }).catch(function (e) {
      running = false; badge();
      if (manual) U.toast('Envoi impossible : ' + (e.message || e), 5000);
      setTimeout(function () { sync.run(); }, 60000);
    });
  };
  function findTerrainByKey(key) { return C.docs.filter(function (d) { return d.role === 'terrain' && d.terrainOf === key; })[0]; }
  function doPhoto(task) {
    return sync.getBlob(task.photo).then(function (blob) {
      if (!blob) return; // déjà envoyée ou perdue
      var ch = C.docs.filter(function (d) { return C.docKey(d) === task.key; })[0];
      return sync.photoFolder(task.key, task.chantier || (ch ? U.baseName(ch.name) : 'Chantier')).then(function (folder) {
        return U.blobToBase64(blob).then(function (b64) { return C.postPorte('photo', { dossierId: folder.id, nom: task.name, base64: b64, mime: blob.type || 'image/jpeg' }); });
      }).then(function (j) {
        var ph = j.photo;
        if (task.target === 'terrain') {
          var t = findTerrainByKey(task.key);
          if (t) t.feats.forEach(function (f) { (f.photos || []).forEach(function (p) { if (p.key === task.photo) { p.id = ph.id; p.url = ph.url; } }); updatePhotoData(f); });
          if (t) { persistTerrain(t); sync.add({ t: 'terrain', key: task.key }); }
        } else if (task.target === 'fiche' && C.fiches) {
          C.fiches.photoUploaded(task.key, task.photo, ph);
        }
        return sync.delBlob(task.photo);
      });
    });
  }
  function updatePhotoData(f) {
    var links = (f.photos || []).filter(function (p) { return p.url; }).map(function (p) { return (p.name || 'photo') + ' | ' + p.url; });
    dataSet(f, 'Photos', links.join('\n'));
  }
  C.updatePhotoData = updatePhotoData;
  function doTerrain(task) {
    var t = findTerrainByKey(task.key);
    if (!t) return Promise.resolve();
    var feats = t.feats.map(function (f) {
      updatePhotoData(f);
      return { kind: f.kind, name: f.name, coords: f.coords, folder: f.folder, desc: f.desc, data: f.data, style: f.style,
        descHtml: (f.desc ? esc(f.desc) : '') + ((f.photos || []).some(function (p) { return p.url; }) ? '<br>' + f.photos.filter(function (p) { return p.url; }).map(function (p, i) { return '<a href="' + esc(p.url) + '">Photo ' + (i + 1) + '</a>'; }).join(' · ') : '') };
    });
    var text = C.formats.toKML(U.baseName(t.name), feats);
    return C.postPorte('enregistrer', { nom: t.name, dossierId: (t.parent && t.parent.id) || 'root', texte: text, mime: 'application/vnd.google-earth.kml+xml', fichierId: t.id || '' }).then(function (j) {
      t.id = j.fichier.id; t.source = 'drive'; t.dirty = false;
      t.feats.forEach(function (f) { delete f._local; });
      persistTerrain(t); saveOpenList();
    });
  }
})();
