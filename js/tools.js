/* Carto chantiers — onglet Outils : mesure, profil en long, ajouts terrain, modification du chantier, relecture. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, esc = U.esc, map = C.map;
  var T = C.tools = {};

  /* ======================= Mesure ======================= */
  var ms = { on: false, pts: [], area: false, layer: L.layerGroup() };
  function msRedraw() {
    ms.layer.clearLayers();
    var pts = ms.pts, d = 0;
    for (var i = 1; i < pts.length; i++) d += pts[i - 1].distanceTo(pts[i]);
    if (ms.area && pts.length >= 3) {
      L.polygon(pts, { color: '#ff6d00', weight: 3, fillOpacity: 0.15, interactive: false }).addTo(ms.layer);
      $('msValue').textContent = U.fmtArea(C.geo.area(pts.map(function (p) { return [p.lat, p.lng]; }))) + ' · périmètre ' + U.fmtDist(d + pts[pts.length - 1].distanceTo(pts[0]));
    } else {
      if (pts.length > 1) L.polyline(pts, { color: '#ff6d00', weight: 3, interactive: false }).addTo(ms.layer);
      var last = pts.length > 1 ? pts[pts.length - 2].distanceTo(pts[pts.length - 1]) : 0;
      $('msValue').textContent = U.fmtDist(d) + (pts.length > 2 ? '  (dernier : ' + U.fmtDist(last) + ')' : '');
    }
    pts.forEach(function (p) { L.marker(p, { icon: L.divIcon({ className: 'ms-ico', html: '<div></div>', iconSize: [0, 0] }), interactive: false }).addTo(ms.layer); });
    $('msHint').textContent = pts.length ? (ms.area ? 'Surface du polygone' : 'Distance totale') : 'Touche la carte ou un pylône pour poser des points';
    $('msArea').textContent = 'Surface : ' + (ms.area ? 'oui' : 'non');
    $('msProfile').disabled = pts.length < 2; $('msKeep').disabled = pts.length < 2;
  }
  T.measure = function (on, area) {
    if (on && drawState) T.cancelDraw();
    ms.on = on; ms.area = !!area;
    $('measureBar').hidden = !on;
    if (on) { C.closePanel(); C.clearSelection(); ms.pts = []; ms.layer.addTo(map); msRedraw(); C.mapClickHook = function (ll) { ms.pts.push(L.latLng(ll.lat, ll.lng)); msRedraw(); return true; }; }
    else { ms.pts = []; ms.layer.clearLayers(); map.removeLayer(ms.layer); C.mapClickHook = null; }
  };
  $('msUndo').onclick = function () { ms.pts.pop(); msRedraw(); };
  $('msClear').onclick = function () { ms.pts = []; msRedraw(); };
  $('msArea').onclick = function () { ms.area = !ms.area; msRedraw(); };
  $('msClose').onclick = function () { T.measure(false); };
  $('msProfile').onclick = function () { T.profile(ms.pts.map(function (p) { return [p.lat, p.lng]; })); };
  $('msKeep').onclick = function () {
    var a = C.activeDoc(); if (!a) { U.toast('Ouvre d\'abord un chantier'); return; }
    var pts = ms.pts.map(function (p) { return [p.lat, p.lng]; }), isArea = ms.area && pts.length >= 3;
    var val = isArea ? U.fmtArea(C.geo.area(pts)) : U.fmtDist(C.geo.lineLength(pts));
    C.promptDlg('Garder cette mesure', 'Nom', 'Mesure – ' + val, 'Garder').then(function (n) {
      if (!n) return;
      var t = C.terrainOf(a, true);
      var f = { uid: U.uid(), kind: isArea ? 'poly' : 'line', name: n, coords: isArea ? [pts] : pts, folder: ['Terrain', 'Mesures'], data: [], style: { line: '#ff6d00', width: 3, fill: '#ff6d00', fillOp: 0.15 }, photos: [], _local: true };
      C.dataSet(f, isArea ? 'Surface' : 'Longueur', val); C.dataSet(f, 'Date', U.fmtDate(new Date().toISOString(), true)); C.dataSet(f, 'Statut', 'À valider');
      t.feats.push(f); C.markDirty(t); C.renderDoc(t);
      U.toast('Mesure gardée dans le fichier terrain', 2500);
    });
  };

  /* ======================= Profil en long ======================= */
  T.profile = function (pts) {
    if (!pts || pts.length < 2) { U.toast('Pose au moins deux points'); return; }
    if (!U.isOnline()) { U.toast('Le profil en long nécessite du réseau'); return; }
    var len = C.geo.lineLength(pts);
    U.busy(true, 'Calcul du profil…');
    var dens = C.geo.densify(pts, Math.max(5, len / 180));
    if (dens.length > 190) { var step = dens.length / 190, tmp = []; for (var i = 0; i < 190; i++) tmp.push(dens[Math.floor(i * step)]); tmp.push(dens[dens.length - 1]); dens = tmp; }
    var u = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=' + dens.map(function (p) { return p[1].toFixed(6); }).join('|') +
      '&lat=' + dens.map(function (p) { return p[0].toFixed(6); }).join('|') + '&resource=ign_rge_alti_wld&zonly=true';
    fetch(u).then(function (r) { return r.json(); }).then(function (j) {
      U.busy(false);
      var z = j.elevations || [];
      var dist = [0]; for (var k = 1; k < dens.length; k++) dist.push(dist[k - 1] + C.geo.dist(dens[k - 1], dens[k]));
      var data = dens.map(function (p, i) { return { d: dist[i], z: typeof z[i] === 'number' ? z[i] : (z[i] && z[i].z) }; }).filter(function (o) { return o.z != null && o.z > -1000; });
      if (data.length < 2) throw new Error('Altitudes indisponibles ici');
      showProfile(data, pts);
    }).catch(function (e) { U.busy(false); U.toast('Profil impossible : ' + (e.message || e), 5000); });
  };
  function showProfile(data, pts) {
    var zs = data.map(function (o) { return o.z; }), zmin = Math.min.apply(null, zs), zmax = Math.max.apply(null, zs), L0 = data[data.length - 1].d;
    var pente = 0; for (var i = 1; i < data.length; i++) { var dd = data[i].d - data[i - 1].d; if (dd > 0) pente = Math.max(pente, Math.abs(data[i].z - data[i - 1].z) / dd * 100); }
    var d = C.openDlg({ title: 'Profil en long', body: '<canvas class="profile" id="pfC"></canvas>' +
      '<table class="tbl" style="margin-top:10px"><tr><th>Longueur</th><td>' + U.fmtDist(L0) + '</td><th>Dénivelé</th><td>' + (data[data.length - 1].z - data[0].z).toFixed(1).replace('.', ',') + ' m</td></tr>' +
      '<tr><th>Altitude min</th><td>' + zmin.toFixed(1).replace('.', ',') + ' m</td><th>Altitude max</th><td>' + zmax.toFixed(1).replace('.', ',') + ' m</td></tr>' +
      '<tr><th>Départ</th><td>' + data[0].z.toFixed(1).replace('.', ',') + ' m</td><th>Pente max</th><td>' + pente.toFixed(0) + ' %</td></tr></table>' +
      '<p class="muted small">Terrain naturel (RGE ALTI® IGN). Pointillés : corde droite entre les extrémités.</p>' });
    var cv = d.q('#pfC'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 400, H = 220;
    cv.width = W * dpr; cv.height = H * dpr; var g = cv.getContext('2d'); g.scale(dpr, dpr);
    var pad = { l: 46, r: 10, t: 12, b: 26 }, span = Math.max(5, zmax - zmin), lo = zmin - span * 0.1, hi = zmax + span * 0.15;
    function X(v) { return pad.l + v / L0 * (W - pad.l - pad.r); } function Y(v) { return H - pad.b - (v - lo) / (hi - lo) * (H - pad.t - pad.b); }
    g.strokeStyle = '#e1e6ea'; g.fillStyle = '#5d6b78'; g.font = '11px system-ui'; g.lineWidth = 1;
    for (var k = 0; k <= 4; k++) { var v = lo + (hi - lo) * k / 4; g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(W - pad.r, Y(v)); g.stroke(); g.fillText(Math.round(v) + ' m', 4, Y(v) + 4); }
    for (var k2 = 0; k2 <= 4; k2++) { var x = L0 * k2 / 4; g.fillText(U.fmtDist(x), Math.min(W - 50, X(x) - 10), H - 8); }
    g.beginPath(); g.moveTo(X(0), Y(lo)); data.forEach(function (o) { g.lineTo(X(o.d), Y(o.z)); }); g.lineTo(X(L0), Y(lo)); g.closePath();
    g.fillStyle = 'rgba(11,92,173,.15)'; g.fill();
    g.beginPath(); data.forEach(function (o, i) { if (i) g.lineTo(X(o.d), Y(o.z)); else g.moveTo(X(o.d), Y(o.z)); }); g.strokeStyle = '#0b5cad'; g.lineWidth = 2; g.stroke();
    g.setLineDash([5, 4]); g.beginPath(); g.moveTo(X(0), Y(data[0].z)); g.lineTo(X(L0), Y(data[data.length - 1].z)); g.strokeStyle = '#d6261c'; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
  }

  /* ======================= Tracé générique (ajouts, pylônes, lignes) ======================= */
  var drawState = null;
  T.draw = function (o) {
    if (ms.on) T.measure(false);
    C.closePanel(); C.clearSelection();
    drawState = Object.assign({ pts: [], layer: L.layerGroup().addTo(map) }, o);
    $('drawBar').hidden = false;
    $('drTitle').textContent = o.title;
    drUpdate();
    C.mapClickHook = function (ll) {
      drawState.pts.push(L.latLng(ll.lat, ll.lng));
      if (drawState.type === 'point') { finishDraw(); return true; }
      drUpdate(); return true;
    };
  };
  function drUpdate() {
    var s = drawState; s.layer.clearLayers();
    if (s.type === 'poly' && s.pts.length >= 3) L.polygon(s.pts, { color: '#7b1fa2', weight: 3, fillOpacity: 0.15, interactive: false }).addTo(s.layer);
    else if (s.pts.length > 1) L.polyline(s.pts, { color: '#7b1fa2', weight: 3, dashArray: '6 5', interactive: false }).addTo(s.layer);
    s.pts.forEach(function (p) { L.marker(p, { icon: L.divIcon({ className: 'ms-ico', html: '<div></div>', iconSize: [0, 0] }), interactive: false }).addTo(s.layer); });
    $('drHint').textContent = s.type === 'point' ? 'Touche l\'endroit sur la carte' : (s.pts.length ? s.pts.length + ' point(s) — continue puis « Valider »' : 'Touche la carte pour poser les points du tracé');
    $('drDone').disabled = s.type === 'point' || s.pts.length < (s.type === 'poly' ? 3 : 2);
    $('drUndo').hidden = s.type === 'point';
  }
  function finishDraw() {
    var s = drawState; if (!s) return;
    var pts = s.pts.map(function (p) { return [p.lat, p.lng]; });
    T.cancelDraw();
    s.onDone(pts);
  }
  T.cancelDraw = function () {
    if (!drawState) return;
    map.removeLayer(drawState.layer); drawState = null;
    $('drawBar').hidden = true; C.mapClickHook = null;
  };
  $('drUndo').onclick = function () { if (drawState) { drawState.pts.pop(); drUpdate(); } };
  // clavier (ordinateur) : Entrée valide le tracé, Retour arrière / Ctrl+Z annule le dernier point
  document.addEventListener('keydown', function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
    var undo = e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z');
    if (drawState) {
      if (e.key === 'Enter' && !$('drDone').disabled) { e.preventDefault(); finishDraw(); }
      else if (undo) { e.preventDefault(); drawState.pts.pop(); drUpdate(); }
    } else if (ms.on && undo) { e.preventDefault(); ms.pts.pop(); msRedraw(); }
  });
  $('drCancel').onclick = function () { T.cancelDraw(); };
  $('drDone').onclick = finishDraw;

  /* ======================= Ajouts terrain ======================= */
  var CATS = ['Accès', 'Aménagement', 'Contrainte', 'Danger', 'Matériel', 'Environnement', 'Note'];
  T.addTerrain = function (kind, latlngs) {
    var a = C.activeDoc(); if (!a) { U.toast('Ouvre d\'abord un chantier'); C.openFilesDlg(); return; }
    if (latlngs) { terrainForm(a, null, kind, latlngs.map(function (p) { return [p.lat, p.lng]; })); return; }
    T.draw({ type: kind, title: kind === 'point' ? 'Ajout : point' : kind === 'line' ? 'Ajout : tracé' : 'Ajout : zone', onDone: function (pts) { terrainForm(a, null, kind, pts); } });
  };
  T.editTerrain = function (doc, f) {
    var ch = C.docs.filter(function (d) { return C.docKey(d) === doc.terrainOf; })[0] || C.activeDoc();
    terrainForm(ch, f, f.kind, null, doc);
  };
  function nearestPylon(doc, ll) {
    var best = null, bd = 1e9;
    C.pylonsOf(doc).forEach(function (f) { var d = C.geo.dist(f.coords, ll); if (d < bd) { bd = d; best = f; } });
    return best && bd < 2000 ? best.pylon : '';
  }
  function terrainForm(chantier, f, kind, pts, tdoc) {
    var isNew = !f;
    var g = function (k) { return f ? C.dataGet(f, k) : ''; };
    var ll = pts ? (kind === 'point' ? pts[0] : pts[0]) : (kind === 'point' ? f.coords : C.centerOf(f));
    var cat = isNew ? 'Note' : (f.folder[1] || 'Note');
    var photos = f ? (f.photos || []).slice() : [];
    var newPhotos = [];
    var pyls = C.pylonsOf(chantier);
    var html = '<div class="field"><span>Catégorie</span><div class="chips" id="taCat">' + CATS.map(function (c) { return '<button type="button" data-c="' + c + '"' + (c === cat ? ' class="on"' : '') + '>' + c + '</button>'; }).join('') + '</div></div>' +
      '<label class="field"><span>Nom</span><input type="text" id="taName" value="' + esc(f ? f.name : '') + '" placeholder="ex. Portail fermé, zone humide, piste à créer…"></label>' +
      '<label class="field"><span>Note</span><textarea id="taNote" placeholder="Détail, consignes, contacts…">' + esc(f ? (f.desc || g('Note')) : '') + '</textarea></label>' +
      '<label class="field"><span>Pylône concerné</span><select id="taPyl"><option value="">—</option>' + pyls.map(function (p) { return '<option' + ((f ? g('Pylône') : nearestPylon(chantier, ll)) === p.pylon ? ' selected' : '') + '>' + esc(p.pylon) + '</option>'; }).join('') + '</select></label>' +
      '<div class="field"><span>Photos</span><div class="photos" id="taPh">' + photos.map(C.photoThumb).join('') + '<button type="button" class="ph add" id="taAdd" title="Prendre ou choisir des photos">📷</button></div></div>' +
      '<div class="field"><span>Statut</span><div class="seg" id="taSt">' + ['À valider', 'Validé', 'À revoir'].map(function (s) { return '<button type="button" data-s="' + s + '"' + ((g('Statut') || 'À valider') === s ? ' class="on"' : '') + '>' + s + '</button>'; }).join('') + '</div></div>';
    var processing = 0, snap = null;
    function state() { return [d.q('#taName').value, d.q('#taNote').value, d.q('#taPyl').value, (d.q('#taCat .on') || {}).textContent, (d.q('#taSt .on') || {}).textContent].join('|'); }
    var d = C.openDlg({ title: isNew ? 'Nouvel ajout terrain' : 'Modifier l\'ajout', body: html, foot: '<button class="btn" id="taCancel">Annuler</button><button class="btn primary push" id="taSave">Enregistrer</button>',
      guard: function () { return newPhotos.length > 0 || processing > 0 || state() !== snap; } });
    snap = state();
    if (isNew && !U.isDesktop()) { /* pas de clavier imposé sur téléphone */ } else if (isNew) setTimeout(function () { d.q('#taName').focus(); }, 250);
    d.qa('#taCat [data-c]').forEach(function (b) { b.onclick = function () { d.qa('#taCat [data-c]').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); }; });
    d.qa('#taSt [data-s]').forEach(function (b) { b.onclick = function () { d.qa('#taSt [data-s]').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); }; });
    d.q('#taAdd').onclick = function () {
      U.pickFiles('image/*').then(function (files) {
        files.forEach(function (file) {
          var key = U.uid();
          var s = document.createElement('span'); s.className = 'ph wait'; s.textContent = '…';
          d.q('#taPh').insertBefore(s, d.q('#taAdd'));
          processing++;
          U.compressImage(file).then(function (r) {
            var p = { key: key, thumb: r.thumb, name: U.baseName(chantier.name) + '_' + U.isoDay() + '_' + key.slice(-4) + '.jpg' };
            newPhotos.push({ p: p, file: r.blob });
            s.classList.remove('wait'); s.textContent = ''; if (r.thumb) s.style.backgroundImage = 'url(' + r.thumb + ')';
            processing--;
          });
        });
      });
    };
    d.q('#taCancel').onclick = function () { C.requestClose(1); };
    d.q('#taSave').onclick = function save() {
      if (processing) { U.toast('Photo en cours de préparation…', 1500); setTimeout(save, 600); return; }
      var t = tdoc || C.terrainOf(chantier, true);
      var c = d.q('#taCat .on') ? d.q('#taCat .on').getAttribute('data-c') : 'Note';
      var name = d.q('#taName').value.trim() || c;
      var item = f || { uid: U.uid(), kind: kind, coords: kind === 'point' ? pts[0] : kind === 'line' ? pts : [pts], data: [], style: { line: '#7b1fa2', width: 3, fill: '#ba68c8', fillOp: 0.2 }, photos: [] };
      item.name = name; item.folder = ['Terrain', c]; item.desc = d.q('#taNote').value.trim(); item._local = true;
      C.dataSet(item, 'Note', item.desc); C.dataSet(item, 'Catégorie', c); C.dataSet(item, 'Pylône', d.q('#taPyl').value);
      C.dataSet(item, 'Statut', d.q('#taSt .on') ? d.q('#taSt .on').getAttribute('data-s') : 'À valider');
      if (isNew) { C.dataSet(item, 'Date', U.fmtDate(new Date().toISOString(), true)); C.dataSet(item, 'Auteur', U.store('auteur') || 'Frédéric FATTORE'); }
      if (item.kind === 'line') C.dataSet(item, 'Longueur', U.fmtDist(C.geo.lineLength(item.coords)));
      if (item.kind === 'poly') C.dataSet(item, 'Surface', U.fmtArea(C.geo.area(item.coords[0])));
      newPhotos.forEach(function (np) {
        item.photos = item.photos || []; item.photos.push(np.p);
        C.sync.putBlob(np.p.key, np.file);
        C.sync.add({ t: 'photo', key: t.terrainOf, photo: np.p.key, name: np.p.name, target: 'terrain', chantier: U.baseName(chantier.name) });
      });
      if (isNew) t.feats.push(item);
      C.markDirty(t); C.renderDoc(t); C.closeDlg(1);
      U.toast('Ajout enregistré' + (U.isOnline() ? '' : ' (envoi au retour du réseau)'), 2500);
    };
  }

  /* ======================= Modifier le chantier ======================= */
  T.toggleEdit = function (doc) {
    doc.editing = !doc.editing; C.renderDoc(doc); C.updateChip(); C.refreshTab('outils');
    U.toast(doc.editing ? 'Mode modification : fais glisser les pylônes, touche-les pour renommer ou supprimer' : 'Mode modification terminé', 3500);
  };
  function nextNum(doc) {
    var nums = C.pylonsOf(doc).map(function (f) { return parseInt(f.pylon, 10); }).filter(function (n) { return isFinite(n); });
    return nums.length ? String(Math.max.apply(null, nums) + 1) : '1';
  }
  T.addPylon = function (doc) {
    T.draw({ type: 'point', title: 'Nouveau pylône', onDone: function (pts) {
      C.promptDlg('Nouveau pylône', 'Numéro', nextNum(doc), 'Ajouter').then(function (n) {
        if (!n) return;
        var f = C.tagPylon({ uid: U.uid(), kind: 'point', name: n, coords: pts[0], folder: ['Pylônes'], data: [], style: {} });
        if (!f.pylon) f.pylon = n;
        doc.feats.push(f); C.markDirty(doc); C.renderDoc(doc);
        U.toast('Pylône ' + n + ' ajouté', 1800);
      });
    } });
  };
  T.addShape = function (doc, kind) {
    T.draw({ type: kind, title: kind === 'line' ? 'Nouveau tracé' : 'Nouvelle zone', onDone: function (pts) {
      C.choiceDlg('Ranger dans le dossier', ['Accès', 'Pistes', 'Aires de travail', 'Tracé de la ligne', 'Autre'].map(function (x) { return { v: x, label: x }; })).then(function (folder) {
        if (!folder) return;
        C.promptDlg('Nom', 'Nom de l\'élément', folder, 'Ajouter').then(function (n) {
          if (!n) return;
          var f = { uid: U.uid(), kind: kind, name: n, coords: kind === 'line' ? pts : [pts], folder: [folder], data: [], style: { line: kind === 'line' ? '#ffd400' : '#ff9800', width: 3, fill: '#ff9800', fillOp: 0.25 } };
          doc.feats.push(f); C.markDirty(doc); C.renderDoc(doc);
        });
      });
    } });
  };

  /* ======================= Relire les ajouts terrain ======================= */
  T.review = function () {
    var a = C.activeDoc(); if (!a) { U.toast('Ouvre d\'abord un chantier'); return; }
    var t = C.terrainOf(a);
    if (!t || !t.feats.length) { U.toast('Aucun ajout terrain pour ce chantier'); return; }
    var filter = 'all';
    var d = C.openDlg({ title: 'Ajouts terrain — ' + U.baseName(a.name), body: '<div class="seg" id="rvF"><button data-f="all" class="on">Tous</button><button data-f="À valider">À valider</button><button data-f="Validé">Validés</button><button data-f="À revoir">À revoir</button></div><div id="rvList" style="margin-top:8px"></div>',
      foot: '<button class="btn" id="rvAll">Tout valider</button><button class="btn primary push" id="rvInt">Intégrer les validés au chantier</button>' });
    function draw() {
      var list = t.feats.filter(function (f) { return filter === 'all' || (C.dataGet(f, 'Statut') || 'À valider') === filter; });
      d.q('#rvList').innerHTML = list.length ? list.map(function (f) {
        var st = C.dataGet(f, 'Statut') || 'À valider';
        return '<div class="card"><div class="row2"><b style="flex:1">' + esc(f.name) + '</b><span class="tag ' + (st === 'Validé' ? 'ok' : st === 'À revoir' ? 'warn' : 'grey') + '">' + esc(st) + '</span></div>' +
          '<div>' + esc(f.folder[1] || '') + (C.dataGet(f, 'Pylône') ? ' · pylône ' + esc(C.dataGet(f, 'Pylône')) : '') + ' · ' + esc(C.dataGet(f, 'Date')) + (C.dataGet(f, 'Intégré') ? ' · intégré le ' + esc(C.dataGet(f, 'Intégré')) : '') + '</div>' +
          (f.desc ? '<div style="color:#16202a;margin-top:4px">' + esc(f.desc) + '</div>' : '') +
          (f.photos && f.photos.length ? '<div class="photos">' + f.photos.map(C.photoThumb).join('') + '</div>' : '') +
          '<div class="row2" style="margin-top:8px"><button class="btn" data-go="' + f.uid + '">Voir</button><button class="btn" data-ed="' + f.uid + '">Modifier</button><button class="btn" data-ok="' + f.uid + '">✓ Valider</button><button class="btn danger" data-rm="' + f.uid + '">Supprimer</button></div></div>';
      }).join('') : '<div class="empty">Rien dans ce filtre.</div>';
      function byUid(u) { return t.feats.filter(function (x) { return x.uid === u; })[0]; }
      d.qa('[data-go]').forEach(function (b) { b.onclick = function () { var f = byUid(b.getAttribute('data-go')); C.closeDlg(1); map.setView(f.kind === 'point' ? f.coords : C.centerOf(f), 18); C.selectFeature(t, f); }; });
      d.qa('[data-ed]').forEach(function (b) { b.onclick = function () { T.editTerrain(t, byUid(b.getAttribute('data-ed'))); }; });
      d.qa('[data-ok]').forEach(function (b) { b.onclick = function () { var f = byUid(b.getAttribute('data-ok')); C.dataSet(f, 'Statut', 'Validé'); C.markDirty(t); C.renderDoc(t); draw(); }; });
      d.qa('[data-rm]').forEach(function (b) { b.onclick = function () { C.confirmDlg('Supprimer cet ajout ?', 'Supprimer', true).then(function (y) { if (!y) return; t.feats = t.feats.filter(function (x) { return x.uid !== b.getAttribute('data-rm'); }); C.markDirty(t); C.renderDoc(t); draw(); }); }; });
    }
    d.qa('#rvF [data-f]').forEach(function (b) { b.onclick = function () { d.qa('#rvF [data-f]').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); filter = b.getAttribute('data-f'); draw(); }; });
    d.q('#rvAll').onclick = function () { t.feats.forEach(function (f) { if ((C.dataGet(f, 'Statut') || 'À valider') === 'À valider') C.dataSet(f, 'Statut', 'Validé'); }); C.markDirty(t); C.renderDoc(t); draw(); };
    d.q('#rvInt').onclick = function () {
      var ok = t.feats.filter(function (f) { return C.dataGet(f, 'Statut') === 'Validé' && !C.dataGet(f, 'Intégré'); });
      if (!ok.length) { U.toast('Aucun ajout validé à intégrer'); return; }
      C.confirmDlg(ok.length + ' ajout(s) validé(s) seront copiés dans le chantier (dossier « Terrain »), puis une nouvelle version datée sera enregistrée. Continuer ?', 'Intégrer').then(function (y) {
        if (!y) return;
        var day = U.isoDay();
        ok.forEach(function (f) {
          a.feats.push({ uid: U.uid(), kind: f.kind, name: f.name, coords: JSON.parse(JSON.stringify(f.coords)), folder: ['Terrain', f.folder[1] || 'Note'], desc: f.desc, data: (f.data || []).slice(), style: f.style, photos: (f.photos || []).slice() });
          C.dataSet(f, 'Intégré', day);
        });
        C.markDirty(t); C.markDirty(a); C.renderDoc(a); C.closeDlg(1);
        C.saveVersion(a);
      });
    };
    draw();
  };

  /* ======================= Onglet Outils ======================= */
  C.tabs.outils = function (el) {
    var a = C.activeDoc(), t = a && C.terrainOf(a);
    var st = a && C.fiches.storeOf(a);
    var nT = t ? t.feats.length : 0, nTv = t ? t.feats.filter(function (f) { return (C.dataGet(f, 'Statut') || 'À valider') === 'À valider'; }).length : 0;
    var nF = st ? Object.keys(st.rows).length : 0;
    var html = '<h3>Sur le terrain</h3><div class="tiles">' +
      tile('measure', '📏', 'Mesurer', 'Distance et surface, au doigt') +
      tile('profile', '⛰', 'Profil en long', 'Relief entre deux points ou le long d\'un tracé') +
      tile('addpt', '📍', 'Ajout terrain', 'Point avec note et photos') +
      tile('addline', '〰', 'Tracé / zone terrain', 'Piste, aire de travail, contrainte…') +
      tile('fiche', '📋', 'Fiche pylône', 'Fondations, embases, structure…') +
      tile('review', '✅', 'Relire les ajouts', nT ? nT + ' ajout(s), ' + nTv + ' à valider' : 'Aucun ajout pour l\'instant') +
      '</div>';
    if (a) {
      html += '<h3>Chantier actif : ' + esc(U.baseName(a.name)) + '</h3>' +
        '<div class="card" style="margin-top:0"><div class="row2"><b style="flex:1">' + (a.editing ? '✎ Modification en cours' : 'Modifier le chantier') + '</b><button class="btn ' + (a.editing ? 'primary' : '') + '" data-t="edit">' + (a.editing ? 'Terminer' : 'Modifier') + '</button></div>' +
        (a.editing ? '<div class="tiles" style="margin-top:8px">' + tile('pyl', '🗼', 'Ajouter un pylône', 'Numéroté automatiquement') + tile('line', '〰', 'Tracer une ligne', 'Accès, piste, tracé') + tile('poly', '⬠', 'Tracer une zone', 'Aire de travail…') + tile('folders', '☰', 'Dossiers affichés', 'Choisir ce qui s\'affiche') + '</div><p class="muted small">Fais glisser un pylône pour le déplacer, touche-le pour le renommer ou le supprimer.</p>' : '') +
        (a.dirty || a.source !== 'drive' ? '<div class="row2" style="margin-top:8px"><span class="tag warn">' + (a.source === 'drive' ? 'modifié' : a.source === 'local' ? 'fichier de l\'appareil' : 'pas encore sur le Drive') + '</span><button class="btn primary push" data-t="save">💾 Enregistrer une version</button></div><p class="muted small">Crée « ' + esc(U.baseName(a.name)) + (a.source === 'drive' ? ' (modifié ' + U.isoDay() + ')' : '') + '.kmz » ; l\'original reste intact.</p>' : '') + '</div>' +
        '<div class="card"><div class="row2"><b style="flex:1">Fiches pylônes</b>' + (st && st.url ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(st.url) + '">Ouvrir le Sheet</a>' : '') + '</div><div>' + nF + ' fiche(s)' + (st && Object.keys(st.dirty).length ? ' · ' + Object.keys(st.dirty).length + ' à envoyer' : '') + (st && !st.url ? ' · le Google Sheet sera créé au premier envoi' : '') + '</div>' +
        '<div class="row2" style="margin-top:8px"><button class="btn" data-t="import">📊 Importer un tableau</button><button class="btn" data-t="model">⬇ Modèle à remplir</button></div></div>' +
        '<div class="card"><div class="row2"><b style="flex:1">Dossier des photos</b><button class="btn" data-t="photos">Changer</button></div><div>' + esc(((U.storeJSON('photoFolders') || {})[C.docKey(a)] || {}).chemin || 'Par défaut : Carto chantiers – photos › ' + U.baseName(a.name)) + '</div></div>';
    } else {
      html += '<h3>Chantier</h3><p class="muted">Ouvre un fichier (bouton « Chantier » en haut) ou crée un chantier.</p>';
    }
    html += '<h3>Créer</h3><div class="tiles">' + tile('new', '✚', 'Nouveau chantier', 'Fichier vierge à remplir') + tile('table', '📊', 'Chantier depuis un tableau', 'Coordonnées CSV / Excel / Sheet') + '</div>';
    el.innerHTML = html;
    el.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-t');
        if (k === 'measure') T.measure(true);
        if (k === 'profile') { T.measure(true); U.toast('Pose les points puis touche « ⛰ Profil »', 3500); }
        if (k === 'addpt') T.addTerrain('point');
        if (k === 'addline') C.choiceDlg('Ajout terrain', [{ v: 'line', label: 'Tracé (ligne)' }, { v: 'poly', label: 'Zone (polygone)' }]).then(function (v) { if (v) T.addTerrain(v); });
        if (k === 'fiche') $('btnPyl').click();
        if (k === 'review') T.review();
        if (k === 'edit') T.toggleEdit(a);
        if (k === 'pyl') T.addPylon(a);
        if (k === 'line') T.addShape(a, 'line');
        if (k === 'poly') T.addShape(a, 'poly');
        if (k === 'folders') C.askFolders(a);
        if (k === 'save') C.saveVersion(a);
        if (k === 'import') C.fiches.importWizard({});
        if (k === 'model') C.fiches.downloadTemplate();
        if (k === 'photos') C.browseDrive({ mode: 'folder' }).then(function (f) { if (!f) return; var m = U.storeJSON('photoFolders') || {}; m[C.docKey(a)] = { id: f.id, chemin: f.name }; U.storeJSON('photoFolders', m); C.refreshTab('outils'); });
        if (k === 'new') C.newChantier();
        if (k === 'table') C.fiches.importWizard({ createDoc: true });
      };
    });
  };
  function tile(k, e, t, s) { return '<button class="tile" data-t="' + k + '"><span class="e">' + e + '</span><b>' + t + '</b><span>' + s + '</span></button>'; }
  T.tile = tile;
})();
