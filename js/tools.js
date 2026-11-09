/* Carto chantiers — onglet « Terrain » et outils sur la carte : mesure, profil en long, tracé, ajouts terrain, relecture, modification du chantier. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, esc = U.esc, map = C.map, ui = C.ui;
  var T = C.tools = {};

  /* ======================= Mesure ======================= */
  var ms = { on: false, pts: [], area: false, profile: false, layer: L.layerGroup() };
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
    $('msHint').textContent = pts.length ? (ms.area ? 'Surface de la zone' : 'Distance totale') : (ms.profile ? 'Profil en long : pose au moins deux points, puis touche « ⛰ Profil »' : 'Touche la carte ou un pylône pour poser des points');
    $('msArea').textContent = 'Surface : ' + (ms.area ? 'oui' : 'non');
    $('msProfile').disabled = pts.length < 2; $('msKeep').disabled = pts.length < 2;
    // un seul bouton bleu : « Profil » quand on est venu pour ça et qu'il est possible, sinon « Fermer »
    var wantProfile = ms.profile && pts.length >= 2;
    $('msProfile').classList.toggle('primary', wantProfile); $('msClose').classList.toggle('primary', !wantProfile);
  }
  // forProfile : la mesure est lancée pour obtenir un profil en long (le bouton « ⛰ Profil » est mis en avant)
  T.measure = function (on, area, forProfile) {
    if (on && drawState) T.cancelDraw();
    ms.on = on; ms.area = !!area; ms.profile = !!forProfile;
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
    C.promptDialog('Enregistrer cette mesure', 'Nom', 'Mesure – ' + val, 'Enregistrer').then(function (n) {
      if (!n) return;
      var t = C.terrainOf(a, true);
      var f = { uid: U.uid(), kind: isArea ? 'poly' : 'line', name: n, coords: isArea ? [pts] : pts, folder: ['Terrain', 'Mesures'], data: [], style: { line: '#ff6d00', width: 3, fill: '#ff6d00', fillOp: 0.15 }, photos: [], _local: true };
      C.dataSet(f, isArea ? 'Surface' : 'Longueur', val); C.dataSet(f, 'Date', U.fmtDate(new Date().toISOString(), true)); C.dataSet(f, 'Statut', 'À valider');
      t.feats.push(f); C.markDirty(t); C.renderDoc(t);
      U.toast('Mesure enregistrée dans les ajouts terrain', 2500);
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
    var d = C.openDialog({ title: 'Profil en long', body: '<canvas class="profile" id="pfCanvas"></canvas>' +
      '<table class="tbl"><tr><th>Longueur</th><td>' + U.fmtDist(L0) + '</td><th>Dénivelé</th><td>' + (data[data.length - 1].z - data[0].z).toFixed(1).replace('.', ',') + ' m</td></tr>' +
      '<tr><th>Altitude min</th><td>' + zmin.toFixed(1).replace('.', ',') + ' m</td><th>Altitude max</th><td>' + zmax.toFixed(1).replace('.', ',') + ' m</td></tr>' +
      '<tr><th>Départ</th><td>' + data[0].z.toFixed(1).replace('.', ',') + ' m</td><th>Pente max</th><td>' + pente.toFixed(0) + ' %</td></tr></table>' +
      '<p class="muted small">Terrain naturel (RGE ALTI® IGN). Pointillés : corde droite entre les extrémités.</p>' });
    var cv = d.q('#pfCanvas'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 400, H = 220;
    cv.width = W * dpr; cv.height = H * dpr; var g = cv.getContext('2d'); g.scale(dpr, dpr);
    var pad = { l: 46, r: 10, t: 12, b: 26 }, span = Math.max(5, zmax - zmin), lo = zmin - span * 0.1, hi = zmax + span * 0.15;
    function X(v) { return pad.l + v / L0 * (W - pad.l - pad.r); } function Y(v) { return H - pad.b - (v - lo) / (hi - lo) * (H - pad.t - pad.b); }
    g.strokeStyle = '#e1e6ea'; g.fillStyle = '#5d6b78'; g.font = '11px system-ui'; g.lineWidth = 1;
    for (var k = 0; k <= 4; k++) { var v = lo + (hi - lo) * k / 4; g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(W - pad.r, Y(v)); g.stroke(); g.fillText((hi - lo < 8 ? v.toFixed(1).replace('.', ',') : Math.round(v)) + ' m', 4, Y(v) + 4); }
    for (var k2 = 0; k2 <= 4; k2++) { var x = L0 * k2 / 4; g.fillText(U.fmtDist(x), Math.min(W - 50, X(x) - 10), H - 8); }
    g.beginPath(); g.moveTo(X(0), Y(lo)); data.forEach(function (o) { g.lineTo(X(o.d), Y(o.z)); }); g.lineTo(X(L0), Y(lo)); g.closePath();
    g.fillStyle = 'rgba(11,92,173,.15)'; g.fill();
    g.beginPath(); data.forEach(function (o, i) { if (i) g.lineTo(X(o.d), Y(o.z)); else g.moveTo(X(o.d), Y(o.z)); }); g.strokeStyle = '#0b5cad'; g.lineWidth = 2; g.stroke();
    g.setLineDash([5, 4]); g.beginPath(); g.moveTo(X(0), Y(data[0].z)); g.lineTo(X(L0), Y(data[data.length - 1].z)); g.strokeStyle = '#d6261c'; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
  }

  /* ======================= Tracé sur la carte (ajouts terrain, pylônes, lignes, zones) ======================= */
  var drawState = null;
  T.draw = function (o) {
    if (drawState) T.cancelDraw(); // un tracé à la fois
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
    $('drHint').textContent = s.type === 'point' ? 'Touche l\'endroit sur la carte' : (s.pts.length ? s.pts.length + ' point(s) — continue puis « Terminer »' : 'Touche la carte pour poser les points');
    $('drDone').disabled = s.type === 'point' || s.pts.length < (s.type === 'poly' ? 3 : 2);
    $('drUndo').hidden = s.type === 'point';
  }
  function finishDraw() {
    var s = drawState; if (!s) return;
    var pts = s.pts.map(function (p) { return [p.lat, p.lng]; });
    s.onCancel = null; // tracé terminé, pas annulé
    T.cancelDraw();
    s.onDone(pts);
  }
  T.cancelDraw = function () {
    if (!drawState) return;
    var s = drawState;
    map.removeLayer(s.layer); drawState = null;
    $('drawBar').hidden = true; C.mapClickHook = null;
    if (s.onCancel) s.onCancel();
  };
  $('drUndo').onclick = function () { if (drawState) { drawState.pts.pop(); drUpdate(); } };
  // clavier (ordinateur) : Entrée termine le tracé, Retour arrière / Ctrl+Z retire le dernier point
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
  var KIND = { point: 'point', line: 'ligne', poly: 'zone' }; // les trois formes, nommées partout de la même façon
  // init (facultatif) : { name, photos: [{ blob, thumb }] } — sert à la photo rapide
  T.addTerrain = function (kind, latlngs, init) {
    var a = C.activeDoc(); if (!a) { U.toast('Ouvre d\'abord un chantier'); C.chantiersDialog(); return; }
    if (latlngs) { terrainForm(a, null, kind, latlngs.map(function (p) { return [p.lat, p.lng]; }), null, init); return; }
    T.draw({ type: kind, title: 'Ajout terrain : ' + KIND[kind], onDone: function (pts) { terrainForm(a, null, kind, pts); } });
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
  function terrainForm(chantier, f, kind, pts, tdoc, init) {
    var isNew = !f; init = init || {};
    var g = function (k) { return f ? C.dataGet(f, k) : ''; };
    var ll = pts ? (kind === 'point' ? pts[0] : pts[0]) : (kind === 'point' ? f.coords : C.centerOf(f));
    var cat = isNew ? 'Note' : (f.folder[1] || 'Note');
    var photos = f ? (f.photos || []).slice() : [];
    var audios = f ? (f.audios || []).slice() : [];
    var newPhotos = [], newAudios = [];
    function photoName(key) { return U.baseName(chantier.name) + '_' + U.isoDay() + '_' + key.slice(-4) + '.jpg'; }
    (init.photos || []).forEach(function (ph) { var key = U.uid(); newPhotos.push({ p: { key: key, thumb: ph.thumb, name: photoName(key) }, file: ph.blob }); });
    var pyls = C.pylonsOf(chantier);
    var html = '<div class="field"><span>Catégorie</span><div class="chips" id="taCat">' + CATS.map(function (c) { return '<button type="button" data-val="' + c + '"' + (c === cat ? ' class="on"' : '') + '>' + c + '</button>'; }).join('') + '</div></div>' +
      '<label class="field"><span>Nom</span><input type="text" id="taName" value="' + esc(f ? f.name : (init.name || '')) + '" placeholder="ex. Portail fermé, zone humide, piste à créer…"></label>' +
      '<div class="field"><span>Note' + C.voice.buttonHtml() + '</span><textarea id="taNote" aria-label="Note" placeholder="Détail, consignes, contacts…">' + esc(f ? (f.desc || g('Note')) : '') + '</textarea>' +
      '<div class="audios" id="taAu">' + audios.map(function (a, i) { return C.fiches.audioChip((a.name || '') + (a.url ? ' | ' + a.url : ''), i); }).join('') + '</div></div>' +
      '<label class="field"><span>Pylône concerné</span><select id="taPyl"><option value="">—</option>' + pyls.map(function (p) { return '<option' + ((f ? g('Pylône') : nearestPylon(chantier, ll)) === p.pylon ? ' selected' : '') + '>' + esc(p.pylon) + '</option>'; }).join('') + '</select></label>' +
      '<div class="field"><span>Photos</span><div class="photos" id="taPh">' + photos.map(C.photoThumb).join('') + newPhotos.map(function (np) { return C.photoThumb(np.p); }).join('') + '<button type="button" class="ph add" id="taAdd" title="Prendre ou choisir des photos">📷</button></div></div>' +
      '<div class="field"><span>Statut</span><div class="seg" id="taSt">' + ['À valider', 'Validé', 'À revoir'].map(function (s) { return '<button type="button" data-val="' + s + '"' + ((g('Statut') || 'À valider') === s ? ' class="on"' : '') + '>' + s + '</button>'; }).join('') + '</div></div>';
    var processing = 0, snap = null;
    function state() { return [d.q('#taName').value, d.q('#taNote').value, d.q('#taPyl').value, U.picked(d.q('#taCat')), U.picked(d.q('#taSt'))].join('|'); }
    var d = C.openDialog({ title: isNew ? 'Ajout terrain : ' + KIND[kind] : 'Modifier l\'ajout terrain', body: html, foot: '<button class="btn" id="taCancel">Annuler</button><button class="btn primary push" id="taSave">Enregistrer</button>',
      guard: function () { return newPhotos.length > 0 || newAudios.length > 0 || processing > 0 || state() !== snap; } });
    snap = state();
    if (isNew && !U.isDesktop()) { /* pas de clavier imposé sur téléphone */ } else if (isNew) setTimeout(function () { d.q('#taName').focus(); }, 250);
    U.pickOne(d.q('#taCat')); U.pickOne(d.q('#taSt'));
    d.q('#taAdd').onclick = function () {
      U.pickFiles('image/*').then(function (files) {
        files.forEach(function (file) {
          var key = U.uid();
          var s = document.createElement('span'); s.className = 'ph wait'; s.textContent = '…';
          d.q('#taPh').insertBefore(s, d.q('#taAdd'));
          processing++;
          U.compressImage(file).then(function (r) {
            var p = { key: key, thumb: r.thumb, name: photoName(key) };
            newPhotos.push({ p: p, file: r.blob });
            s.classList.remove('wait'); s.textContent = ''; if (r.thumb) s.style.backgroundImage = 'url(' + r.thumb + ')';
            processing--;
          });
        });
      });
    };
    // dictée : le texte va dans la note, l'audio est rangé avec l'ajout
    C.voice.attach(d.body, function (audio) {
      var key = U.uid(), now = new Date();
      var name = U.baseName(chantier.name) + '_note-vocale_' + U.isoDay() + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + '.' + audio.ext;
      newAudios.push({ a: { key: key, name: name }, file: audio.blob });
      d.q('#taAu').insertAdjacentHTML('beforeend', '<span class="btn audio-wait">🎤 ' + C.voice.duration(audio.seconds) + ' · à envoyer</span>');
    });
    d.q('#taCancel').onclick = function () { C.requestClose(1); };
    d.q('#taSave').onclick = function save() {
      if (processing) { U.toast('Photo en cours de préparation…', 1500); setTimeout(save, 600); return; }
      var t = tdoc || C.terrainOf(chantier, true);
      var c = U.picked(d.q('#taCat')) || 'Note';
      var name = d.q('#taName').value.trim() || c;
      var item = f || { uid: U.uid(), kind: kind, coords: kind === 'point' ? pts[0] : kind === 'line' ? pts : [pts], data: [], style: { line: '#7b1fa2', width: 3, fill: '#ba68c8', fillOp: 0.2 }, photos: [] };
      item.name = name; item.folder = ['Terrain', c]; item.desc = d.q('#taNote').value.trim(); item._local = true;
      C.dataSet(item, 'Note', item.desc); C.dataSet(item, 'Catégorie', c); C.dataSet(item, 'Pylône', d.q('#taPyl').value);
      C.dataSet(item, 'Statut', U.picked(d.q('#taSt')) || 'À valider');
      if (isNew) { C.dataSet(item, 'Date', U.fmtDate(new Date().toISOString(), true)); C.dataSet(item, 'Auteur', U.store('auteur') || 'Frédéric FATTORE'); }
      if (item.kind === 'line') C.dataSet(item, 'Longueur', U.fmtDist(C.geo.lineLength(item.coords)));
      if (item.kind === 'poly') C.dataSet(item, 'Surface', U.fmtArea(C.geo.area(item.coords[0])));
      newPhotos.forEach(function (np) {
        item.photos = item.photos || []; item.photos.push(np.p);
        C.sync.putBlob(np.p.key, np.file);
        C.sync.add({ t: 'photo', key: t.terrainOf, photo: np.p.key, name: np.p.name, target: 'terrain', chantier: U.baseName(chantier.name) });
      });
      newAudios.forEach(function (na) {
        item.audios = item.audios || []; item.audios.push(na.a);
        C.sync.putBlob(na.a.key, na.file);
        C.sync.add({ t: 'photo', key: t.terrainOf, photo: na.a.key, name: na.a.name, target: 'terrain', chantier: U.baseName(chantier.name), sub: 'Notes vocales' });
      });
      if (isNew) t.feats.push(item);
      C.markDirty(t); C.renderDoc(t); C.closeDialog(1);
      U.toast('Ajout terrain enregistré' + (U.isOnline() ? '' : ' (envoi au retour du réseau)'), 2500);
    };
  }

  /* ======================= Modifier le chantier ======================= */
  T.toggleEdit = function (doc) {
    doc.editing = !doc.editing; C.renderDoc(doc); C.updateChip(); C.refreshTab('chantier');
    U.toast(doc.editing ? 'Modification en cours : fais glisser un élément pour le déplacer, touche-le pour le renommer ou le supprimer' : 'Modification terminée', 3500);
  };
  function nextNum(doc) {
    var nums = C.pylonsOf(doc).map(function (f) { return parseInt(f.pylon, 10); }).filter(function (n) { return isFinite(n); });
    return nums.length ? String(Math.max.apply(null, nums) + 1) : '1';
  }
  T.addPylon = function (doc) {
    T.draw({ type: 'point', title: 'Ajouter un pylône', onDone: function (pts) {
      C.promptDialog('Ajouter un pylône', 'Numéro', nextNum(doc), 'Ajouter').then(function (n) {
        if (!n) return;
        var f = C.tagPylon({ uid: U.uid(), kind: 'point', name: n, coords: pts[0], folder: ['Pylônes'], data: [], style: {} });
        if (!f.pylon) f.pylon = n;
        doc.feats.push(f); C.markDirty(doc); C.renderDoc(doc);
        U.toast('Pylône ' + n + ' ajouté', 1800);
      });
    } });
  };
  T.addShape = function (doc, kind) {
    T.draw({ type: kind, title: 'Ajouter une ' + KIND[kind], onDone: function (pts) {
      C.choiceDialog('Ranger dans le dossier', ['Accès', 'Pistes', 'Aires de travail', 'Tracé de la ligne', 'Autre'].map(function (x) { return { v: x, label: x }; })).then(function (folder) {
        if (!folder) return;
        C.promptDialog('Ajouter une ' + KIND[kind], 'Nom', folder, 'Ajouter').then(function (n) {
          if (!n) return;
          var f = { uid: U.uid(), kind: kind, name: n, coords: kind === 'line' ? pts : [pts], folder: [folder], data: [], style: { line: kind === 'line' ? '#ffd400' : '#ff9800', width: 3, fill: '#ff9800', fillOp: 0.25 } };
          doc.feats.push(f); C.markDirty(doc); C.renderDoc(doc);
          U.toast('« ' + n + ' » ajouté au chantier', 1800);
        });
      });
    } });
  };

  /* ======================= Relire les ajouts terrain ======================= */
  T.reviewDialog = function () {
    var a = C.activeDoc(); if (!a) { U.toast('Ouvre d\'abord un chantier'); return; }
    var t = C.terrainOf(a);
    if (!t || !t.feats.length) { U.toast('Aucun ajout terrain pour ce chantier'); return; }
    var filter = 'all';
    var d = C.openDialog({ title: 'Ajouts terrain — ' + U.baseName(a.name), wide: true,
      body: '<div class="seg" id="rvF"><button data-val="all" class="on">Tous</button><button data-val="À valider">À valider</button><button data-val="Validé">Validés</button><button data-val="À revoir">À revoir</button></div><div id="rvList" class="cols cols-cards"></div>',
      foot: '<button class="btn" data-act="validateAll">Tout valider</button><button class="btn primary push" data-act="integrate">Intégrer les validés au chantier</button>' });
    function statusOf(f) { return C.dataGet(f, 'Statut') || 'À valider'; }
    function byUid(u) { return t.feats.filter(function (x) { return x.uid === u; })[0]; }
    function changed() { C.markDirty(t); C.renderDoc(t); draw(); }
    function draw() {
      var list = t.feats.filter(function (f) { return filter === 'all' || statusOf(f) === filter; });
      d.q('#rvList').innerHTML = list.length ? list.map(function (f) {
        var st = statusOf(f);
        return '<div class="card"><div class="row"><b class="grow">' + esc(f.name) + '</b><span class="tag ' + (st === 'Validé' ? 'ok' : st === 'À revoir' ? 'warn' : 'grey') + '">' + esc(st) + '</span></div>' +
          '<div>' + esc(f.folder[1] || '') + (C.dataGet(f, 'Pylône') ? ' · pylône ' + esc(C.dataGet(f, 'Pylône')) : '') + ' · ' + esc(C.dataGet(f, 'Date')) + (C.dataGet(f, 'Intégré') ? ' · intégré le ' + esc(C.dataGet(f, 'Intégré')) : '') + '</div>' +
          (f.desc ? '<div class="card-text">' + esc(f.desc) + '</div>' : '') +
          (f.photos && f.photos.length ? '<div class="photos">' + f.photos.map(C.photoThumb).join('') + '</div>' : '') +
          '<div class="row card-actions"><button class="btn" data-act="show" data-id="' + f.uid + '">Voir</button><button class="btn" data-act="edit" data-id="' + f.uid + '">Modifier</button>' +
          (st === 'Validé' ? '' : '<button class="btn" data-act="validate" data-id="' + f.uid + '">✓ Valider</button>') + '<button class="btn danger" data-act="delete" data-id="' + f.uid + '">Supprimer</button></div></div>';
      }).join('') : '<div class="empty">Aucun ajout dans ce filtre.</div>';
    }
    U.pickOne(d.q('#rvF'), function (v) { filter = v; draw(); });
    d.on({
      show: function (u) { var f = byUid(u); C.closeDialog(1); map.setView(f.kind === 'point' ? f.coords : C.centerOf(f), 18); C.selectFeature(t, f); },
      edit: function (u) { T.editTerrain(t, byUid(u)); },
      validate: function (u) { C.dataSet(byUid(u), 'Statut', 'Validé'); changed(); },
      'delete': function (u) { C.confirmDialog('Supprimer l\'ajout terrain « ' + (byUid(u).name || '') + ' » ?', 'Supprimer', true).then(function (y) { if (!y) return; t.feats = t.feats.filter(function (x) { return x.uid !== u; }); changed(); }); },
      validateAll: function () { t.feats.forEach(function (f) { if (statusOf(f) === 'À valider') C.dataSet(f, 'Statut', 'Validé'); }); changed(); },
      integrate: function () {
        var ok = t.feats.filter(function (f) { return C.dataGet(f, 'Statut') === 'Validé' && !C.dataGet(f, 'Intégré'); });
        if (!ok.length) { U.toast('Aucun ajout validé à intégrer'); return; }
        C.confirmDialog(ok.length + ' ajout(s) validé(s) seront copiés dans le chantier (dossier « Terrain »), puis une nouvelle version datée sera enregistrée. Continuer ?', 'Intégrer').then(function (y) {
          if (!y) return;
          var day = U.isoDay();
          ok.forEach(function (f) {
            a.feats.push({ uid: U.uid(), kind: f.kind, name: f.name, coords: JSON.parse(JSON.stringify(f.coords)), folder: ['Terrain', f.folder[1] || 'Note'], desc: f.desc, data: (f.data || []).slice(), style: f.style, photos: (f.photos || []).slice() });
            C.dataSet(f, 'Intégré', day);
          });
          C.markDirty(t); C.markDirty(a); C.renderDoc(a); C.closeDialog(1);
          C.saveVersion(a);
        });
      }
    });
    draw();
  };

  /* ======================= Onglet Terrain ======================= */
  // Six tuiles, chacune lance directement son action sur la carte : aucune fenêtre intermédiaire.
  C.tabs.terrain = function (el) {
    var a = C.activeDoc(), t = a && C.terrainOf(a);
    var nT = t ? t.feats.length : 0, nTv = t ? t.feats.filter(function (f) { return (C.dataGet(f, 'Statut') || 'À valider') === 'À valider'; }).length : 0;
    var top = '<h3>Mesurer</h3><div class="tiles">' +
      ui.tile('measure', '📏', 'Mesurer', 'Distance et surface, au doigt') +
      ui.tile('profile', '⛰', 'Profil en long', 'Relief le long des points posés') + '</div>';
    if (C.viewer) { el.innerHTML = top + '<p class="muted small sec-foot">Consultation en lecture seule : les ajouts terrain ne sont pas disponibles.</p>'; U.onAct(el, { measure: function () { T.measure(true); }, profile: function () { T.measure(true, false, true); } }); return; }
    el.innerHTML = top + '<h3>Ajouts terrain</h3>' +
      (a ? '' : '<p class="muted sec-note">Ouvre un chantier pour y ranger tes ajouts.</p>') +
      '<div class="tiles">' +
      ui.tile('addPoint', '📍', 'Ajouter un point', 'Note, photos, pylône concerné') +
      ui.tile('addLine', '〰', 'Ajouter une ligne', 'Piste, accès à créer…') +
      ui.tile('addZone', '⬠', 'Ajouter une zone', 'Aire de travail, contrainte…') +
      ui.tile('review', '✅', 'Relire les ajouts', nT ? nT + ' ajout(s), ' + nTv + ' à valider' : 'Aucun ajout pour l\'instant') +
      '</div>' +
      (a ? '<p class="muted small sec-foot">Les ajouts sont rangés dans « ' + esc(U.baseName(a.name)) + ' - terrain.kml », à côté du chantier. Le chantier lui-même n\'est pas modifié.</p>' : '');
    U.onAct(el, {
      measure: function () { T.measure(true); },
      profile: function () { T.measure(true, false, true); },
      addPoint: function () { T.addTerrain('point'); },
      addLine: function () { T.addTerrain('line'); },
      addZone: function () { T.addTerrain('poly'); },
      review: function () { T.reviewDialog(); }
    });
  };
})();
