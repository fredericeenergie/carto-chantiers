/* Carto chantiers — application principale */
(function () {
  'use strict';
  var C = window.Carto;
  var APP_VERSION = 'v1.0.0';
  var $ = function (id) { return document.getElementById(id); };

  /* ======================= Outils ======================= */
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem('carto.' + k);
      if (v === null) localStorage.removeItem('carto.' + k); else localStorage.setItem('carto.' + k, v);
    } catch (e) { return null; }
  }
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 3000);
  }
  function busy(on, txt) { $('busy').style.display = on ? 'grid' : 'none'; if (txt) $('busyTxt').textContent = txt; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function natural(a, b) { return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' }); }
  function fmtBytes(b) { if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' Ko'; return (b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0).replace('.', ',') + ' Mo'; }
  function fmtDate(iso, withTime) {
    try {
      var d = new Date(iso), o = { day: '2-digit', month: '2-digit', year: 'numeric' };
      if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; }
      return d.toLocaleString('fr-FR', o);
    } catch (e) { return ''; }
  }
  function fmtDist(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',') + ' km'; }
  function fmtArea(a) { return a < 10000 ? Math.round(a).toLocaleString('fr-FR') + ' m²' : (a / 10000).toFixed(a < 100000 ? 2 : 1).replace('.', ',') + ' ha'; }
  function withTimeout(p, ms) {
    return new Promise(function (ok, ko) {
      var t = setTimeout(function () { ko(new Error('Délai dépassé')); }, ms);
      p.then(function (r) { clearTimeout(t); ok(r); }, function (e) { clearTimeout(t); ko(e); });
    });
  }
  function isOnline() { return navigator.onLine !== false; }

  /* ======================= Porte Drive ======================= */
  (function readSetupHash() {
    var h = location.hash.replace(/^#/, '');
    if (!/porte=/.test(h)) return;
    var p = {}; h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (p.porte && p.cle) { store('porte', p.porte); store('cle', p.cle); C._justConfigured = true; }
    try { history.replaceState(null, '', location.pathname); } catch (e) { location.hash = ''; }
  })();
  function porteConfigured() { return !!(store('porte') && store('cle')); }
  function callPorte(action, params) {
    if (!porteConfigured()) return Promise.reject(new Error('Porte Drive non configurée'));
    if (!isOnline()) return Promise.reject(new Error('Pas de réseau'));
    var u = store('porte') + '?action=' + encodeURIComponent(action) + '&cle=' + encodeURIComponent(store('cle'));
    for (var k in (params || {})) u += '&' + k + '=' + encodeURIComponent(params[k]);
    return withTimeout(fetch(u, { redirect: 'follow', credentials: 'omit' }), 45000)
      .then(function (r) { if (!r.ok) throw new Error('Porte : erreur ' + r.status); return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.erreur || 'Erreur de la porte'); return j; });
  }

  /* ======================= Carte ======================= */
  var map = L.map('map', { zoomControl: false, maxZoom: 21, worldCopyJump: true }).setView([46.6, 2.4], 6);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');

  var FallbackLayer = L.GridLayer.extend({
    initialize: function (def, opts) { this._def = def; L.GridLayer.prototype.initialize.call(this, opts); },
    createTile: function (coords, done) {
      var tile = L.DomUtil.create('div', 'fb-tile');
      var img = document.createElement('img');
      img.alt = ''; img.setAttribute('role', 'presentation'); img.draggable = false;
      if (this._def.kind !== 'xyz') img.crossOrigin = 'anonymous';
      tile.appendChild(img);
      var def = this._def, minN = def.native ? def.native[0] : 0, dz = 0;
      function load() {
        var xx = coords.x >> dz, yy = coords.y >> dz;
        if (dz > 0) {
          var n = 1 << dz;
          img.style.width = img.style.height = (256 * n) + 'px';
          img.style.left = (-(coords.x - (xx << dz)) * 256) + 'px';
          img.style.top = (-(coords.y - (yy << dz)) * 256) + 'px';
        }
        img.src = C.tileUrl(def, coords.z - dz, xx, yy);
      }
      img.onload = function () { done(null, tile); };
      img.onerror = function () {
        // Tuile absente (souvent hors ligne) : on agrandit une tuile parente déjà enregistrée.
        if (dz < 5 && coords.z - dz - 1 >= minN) { dz++; load(); }
        else { img.style.display = 'none'; done(null, tile); }
      };
      load();
      return tile;
    }
  });

  function shortSrc(s) { return String(s || '').split(/[,—(]/)[0].replace(/ Géoplateforme/, '').trim(); }

  /* ---- Fonds ---- */
  var baseLayers = {}, curBase = null;
  C.BASES.forEach(function (b) {
    baseLayers[b.id] = new FallbackLayer(b.def, { maxZoom: 21, maxNativeZoom: b.def.native[1], zIndex: 1, attribution: shortSrc(b.src) });
  });
  function setBase(id) {
    if (!baseLayers[id]) id = 'ortho';
    if (curBase) map.removeLayer(baseLayers[curBase]);
    baseLayers[id].addTo(map); curBase = id; store('base', id);
    document.querySelectorAll('input[name=base]').forEach(function (r) { r.checked = r.value === id; });
  }

  /* ---- Calques ---- */
  var ITEMS = {}, ORDER = { relief: 10, air: 15, env: 20, veg: 25, regl: 30, eau: 35, sol: 40, cad: 45, fer: 50, gaz: 55, elec: 60 };
  C.GROUPS.forEach(function (g) {
    g.items.forEach(function (it, i) { it.group = g; it.z = (ORDER[g.id] || 30) * 10 + i; ITEMS[it.id] = it; });
  });
  var active = {};
  try { (JSON.parse(store('layers') || 'null') || ['rte_aer', 'rte_pyl']).forEach(function (id) { if (ITEMS[id]) active[id] = true; }); } catch (e) { active = { rte_aer: true, rte_pyl: true }; }
  var live = {}; // id -> tableau de couches Leaflet

  function buildItem(it) {
    if (it.special === 'vigicrues') return [vigiLayer];
    if (it.special === 'veg_rte') return [vegLayer];
    return it.defs.map(function (d, k) {
      return new FallbackLayer(d, {
        maxZoom: 21, maxNativeZoom: d.native[1],
        minZoom: Math.max(it.minZoom || 0, d.native[0]),
        opacity: it.opacity || 1, zIndex: it.z * 4 + k, attribution: shortSrc(it.src)
      });
    });
  }
  function setActive(id, on) {
    var it = ITEMS[id]; if (!it) return;
    if (on) {
      active[id] = true;
      if (!live[id]) live[id] = buildItem(it);
      live[id].forEach(function (l) { if (!map.hasLayer(l)) l.addTo(map); });
      if (it.special === 'vigicrues') refreshVigicrues();
      if (it.special === 'veg_rte') refreshVeg();
      if (it.minZoom && map.getZoom() < it.minZoom) toast('« ' + it.label + ' » : visible à partir d\'un zoom plus fort', 2500);
    } else {
      delete active[id];
      (live[id] || []).forEach(function (l) { map.removeLayer(l); });
    }
    store('layers', JSON.stringify(Object.keys(active)));
    updateLayerCount();
  }
  function updateLayerCount() {
    var n = Object.keys(active).length, el = $('layerCount');
    el.textContent = n; el.style.display = n ? 'block' : 'none';
    document.querySelectorAll('.grp').forEach(function (g) {
      var c = g.querySelectorAll('input[type=checkbox]:checked').length;
      var b = g.querySelector('.n'); b.textContent = c; b.style.display = c ? 'inline' : 'none';
    });
  }

  function renderLayerPanel() {
    $('baseList').innerHTML = C.BASES.map(function (b) {
      return '<label><input type="radio" name="base" value="' + b.id + '"><span>' + esc(b.label) + '<span class="hint">' + esc(b.hint) + '</span></span></label>';
    }).join('');
    document.querySelectorAll('input[name=base]').forEach(function (r) {
      r.checked = r.value === curBase;
      r.addEventListener('change', function () { setBase(r.value); });
    });
    var openG = {}; try { openG = JSON.parse(store('openGroups') || '{}'); } catch (e) {}
    $('groupList').innerHTML = C.GROUPS.map(function (g) {
      return '<div class="grp' + (openG[g.id] ? ' open' : '') + '" data-g="' + g.id + '"><button type="button"><span>' + esc(g.label) + '</span><span class="n"></span><span class="chev">›</span></button><div class="items">' +
        g.items.map(function (it) {
          return '<label class="item"><input type="checkbox" data-id="' + it.id + '"' + (active[it.id] ? ' checked' : '') + '><span>' + esc(it.label) +
            (it.hint ? '<span class="hint">' + esc(it.hint) + '</span>' : '') +
            '<span class="src" id="src_' + it.id + '">' + esc(it.src) + '</span></span></label>';
        }).join('') + '</div></div>';
    }).join('');
    document.querySelectorAll('.grp > button').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.parentNode; g.classList.toggle('open');
        openG[g.getAttribute('data-g')] = g.classList.contains('open'); store('openGroups', JSON.stringify(openG));
      });
    });
    document.querySelectorAll('#groupList input[type=checkbox]').forEach(function (c) {
      c.addEventListener('change', function () { setActive(c.getAttribute('data-id'), c.checked); });
    });
    updateLayerCount(); updateVigiSrc();
  }
  $('btnNoLayers').addEventListener('click', function () {
    Object.keys(active).forEach(function (id) { setActive(id, false); });
    document.querySelectorAll('#groupList input[type=checkbox]').forEach(function (c) { c.checked = false; });
    updateLayerCount();
  });

  /* ---- Vigicrues (via la porte) ---- */
  var VIGI_COL = { 1: '#2e7d32', 2: '#f2c200', 3: '#ff8c00', 4: '#d50000' };
  var VIGI_TXT = { 1: 'pas de vigilance particulière', 2: 'vigilance jaune', 3: 'vigilance orange', 4: 'vigilance rouge' };
  var vigiInfo = null, vigiLoading = false;
  var vigiLayer = L.geoJSON(null, {
    style: function (f) { var n = f.properties.niveau || 1; return { color: VIGI_COL[n] || '#2e7d32', weight: n > 1 ? 7 : 4, opacity: 0.9 }; },
    onEachFeature: function (f, l) {
      l.options.bubblingMouseEvents = false;
      l.on('click', function (e) {
        if (measure.on) { addMeasurePoint(e.latlng); return; }
        L.popup().setLatLng(e.latlng).setContent('<b>' + esc(f.properties.nom) + '</b><br>' + esc(VIGI_TXT[f.properties.niveau] || '') +
          (vigiInfo && vigiInfo.bulletin ? '<br><small>Bulletin du ' + fmtDate(vigiInfo.bulletin, true) + '</small>' : '')).openOn(map);
      });
    }
  });
  function updateVigiSrc() {
    var el = $('src_vigicrues'); if (!el) return;
    if (!vigiInfo) { el.textContent = C.SRC.vigicrues; return; }
    el.textContent = 'Vigicrues — bulletin du ' + fmtDate(vigiInfo.bulletin, true) + (vigiInfo.live ? '' : ' (copie enregistrée)');
  }
  function refreshVigicrues() {
    if (vigiLoading) return; vigiLoading = true;
    callPorte('vigicrues').then(function (j) {
      C.saveData('vigicrues', j.vigicrues);
      return { data: j.vigicrues, live: true };
    }).catch(function (err) {
      return C.loadData('vigicrues').then(function (c) {
        if (!c) throw err;
        return { data: c.data, live: false };
      });
    }).then(function (r) {
      vigiLayer.clearLayers(); vigiLayer.addData(r.data);
      vigiInfo = { bulletin: r.data.bulletin, live: r.live };
      updateVigiSrc();
      if (!r.live) {
        var age = (Date.now() - new Date(r.data.bulletin).getTime()) / 3600000;
        toast('Vigicrues : copie du bulletin du ' + fmtDate(r.data.bulletin, true) + (age > 12 ? ' — information dépassée' : ''), 5000);
      }
    }).catch(function (e) {
      toast('Vigicrues indisponible : ' + (e.message || e), 4000);
    }).then(function () { vigiLoading = false; });
  }

  /* ---- Végétation sous lignes RTE (ODRÉ, chargée par zone) ---- */
  var VEG_DS = 'vegetation-emprise-lignes-rte';
  var vegLayer = L.geoJSON(null, {
    style: { color: '#1b5e20', weight: 1, fillColor: '#43a047', fillOpacity: 0.45 },
    pointToLayer: function (f, ll) { return L.circleMarker(ll, { radius: 5, color: '#1b5e20', weight: 1, fillColor: '#43a047', fillOpacity: 0.8 }); },
    onEachFeature: function (f, l) {
      l.options.bubblingMouseEvents = false;
      l.on('click', function (e) {
        if (measure.on) { addMeasurePoint(e.latlng); return; }
        L.popup({ maxWidth: 260 }).setLatLng(e.latlng).setContent('<b>Végétation sous ligne RTE</b><br>' + propsHtml(f.properties)).openOn(map);
      });
    }
  });
  var vegDone = {}, vegWarned = false;
  function z12Bounds(x, y) {
    var n = 4096;
    var w = x / n * 360 - 180, e = (x + 1) / n * 360 - 180;
    var la = function (t) { var r = Math.PI - 2 * Math.PI * t / n; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(r) - Math.exp(-r))); };
    return { n: la(y), s: la(y + 1), w: w, e: e };
  }
  C.vegUrl = function (x, y) {
    var b = z12Bounds(x, y);
    var where = 'in_bbox(geo_point_2d, ' + b.s.toFixed(5) + ', ' + b.w.toFixed(5) + ', ' + b.n.toFixed(5) + ', ' + b.e.toFixed(5) + ')';
    return 'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/' + VEG_DS + '/exports/geojson?where=' + encodeURIComponent(where) + '&limit=-1';
  };
  function refreshVeg() {
    if (!active.veg_rte || map.getZoom() < 13) return;
    var b = map.getBounds(), z = 12;
    var t1 = map.project(b.getNorthWest(), z).divideBy(256).floor(), t2 = map.project(b.getSouthEast(), z).divideBy(256).floor();
    for (var x = t1.x; x <= t2.x; x++) for (var y = t1.y; y <= t2.y; y++) {
      var k = x + '/' + y; if (vegDone[k]) continue; vegDone[k] = 'loading';
      (function (k, u) {
        fetch(u, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (j) { vegDone[k] = true; if (j && j.features) vegLayer.addData(j); })
          .catch(function () {
            delete vegDone[k];
            if (!vegWarned) { vegWarned = true; toast('Végétation RTE : source indisponible pour le moment', 4000); }
          });
      })(k, C.vegUrl(x, y));
    }
  }
  map.on('moveend', function () { if (active.veg_rte) refreshVeg(); });

  function propsHtml(p) {
    var rows = [];
    for (var k in p) {
      var v = p[k];
      if (v == null || v === '' || typeof v === 'object') continue;
      if (/^(geo_|the_geom|geometry|bbox|gid$|fid$|objectid$|ogc_fid|id$|identification_[2-5]|nom_ouvrage_[2-5]|proprietaire_[2-5])/i.test(k) && !/^id_/.test(k)) continue;
      var label = k.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
      rows.push('<b>' + esc(label) + ' :</b> ' + esc(String(v).slice(0, 200)));
      if (rows.length >= 14) break;
    }
    return rows.join('<br>') || '<i>Pas de détail</i>';
  }

  /* ======================= Feuilles ======================= */
  function openSheet(id, keepMap) {
    closeSheets(true);
    $(id).classList.add('open');
    $('scrim').style.display = keepMap ? 'none' : 'block';
  }
  function closeSheets(keepScrim) {
    document.querySelectorAll('.sheet.open').forEach(function (s) { s.classList.remove('open'); });
    if (!keepScrim) $('scrim').style.display = 'none';
  }
  $('scrim').addEventListener('click', function () { closeSheets(); clearTarget(); });
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeSheets(); clearTarget(); }); });

  /* ======================= Fichiers ======================= */
  var files = [], filesSaved = null, current = null, data = null;
  var fileLayer = L.layerGroup().addTo(map);

  function renderFiles() {
    var el = $('fileList'), reg = C.offlineRegistry();
    if (!porteConfigured()) { el.innerHTML = '<div class="empty">La porte Drive n\'est pas encore réglée. Touche « Réglages de la porte Drive ».</div>'; return; }
    if (!files.length) { el.innerHTML = '<div class="empty">Aucun fichier KMZ, KML, GPX ou GeoJSON à la racine de ton Drive.</div>'; return; }
    el.innerHTML = (filesSaved ? '<p class="muted">Pas de réseau : liste enregistrée le ' + fmtDate(filesSaved, true) + '.</p>' : '') +
      files.map(function (f) {
        return '<button class="file' + (current && current.id === f.id ? ' cur' : '') + '" data-id="' + esc(f.id) + '"><span class="ext">' + esc(f.ext) + '</span>' +
          '<span class="nm">' + esc(f.name.replace(/\.[^.]+$/, '')) + '<span class="dt">modifié le ' + fmtDate(f.modified) + '</span></span>' +
          (reg[f.id] ? '<span class="off">✓ hors ligne</span>' : '') + '</button>';
      }).join('');
    el.querySelectorAll('.file').forEach(function (b) { b.addEventListener('click', function () { closeSheets(); openFile(b.getAttribute('data-id')); }); });
  }
  function refreshFiles() {
    $('fileList').innerHTML = '<div class="empty">Lecture du Drive…</div>';
    return callPorte('liste').then(function (j) {
      files = j.fichiers; filesSaved = null; C.saveData('liste', files); renderFiles(); return files;
    }).catch(function (err) {
      return C.loadData('liste').then(function (c) {
        if (c) { files = c.data; filesSaved = c.savedAt; renderFiles(); return files; }
        $('fileList').innerHTML = '<div class="empty">Impossible de lire le Drive : ' + esc(err.message || err) + '</div>';
        throw err;
      });
    });
  }
  $('btnFile').addEventListener('click', function () { openSheet('sheetFiles'); renderFiles(); });
  $('btnRefresh').addEventListener('click', function () { refreshFiles().then(function () { toast(files.length + ' fichier(s)'); }, function () {}); });

  function openFile(id, quiet) {
    var f = files.filter(function (x) { return x.id === id; })[0];
    var name = f ? f.name : 'fichier';
    busy(true, 'Ouverture de « ' + name.replace(/\.[^.]+$/, '') + ' »…');
    var fromCache = null;
    return callPorte('fichier', { id: id }).then(function (j) {
      C.saveData('fichier-' + id, j.fichier); return j.fichier;
    }).catch(function (err) {
      return C.loadData('fichier-' + id).then(function (c) {
        if (!c) throw err;
        fromCache = c.savedAt; return c.data;
      });
    }).then(function (r) {
      var res = r.type === 'kml' ? C.Parse.kml(r.text) : r.type === 'gpx' ? C.Parse.gpx(r.text) : C.Parse.geojson(r.text);
      C.Parse.tagPylons(res); res.images = r.images || {};
      current = f || { id: id, name: r.name, ext: '' }; data = res; store('file', id);
      $('fileName').textContent = (r.name || name).replace(/\.[^.]+$/, '');
      draw(); fit(); busy(false);
      if (fromCache) toast('Pas de réseau : copie du ' + fmtDate(fromCache, true), 4000);
      if (!res.points.length && !res.lines.length && !res.polys.length) toast('Ce fichier ne contient aucun élément affichable.');
    }).catch(function (e) {
      busy(false);
      if (!quiet) toast('Impossible d\'ouvrir : ' + (e.message || e) + (isOnline() ? '' : ' (fichier non préparé hors ligne)'), 5000);
    });
  }

  /* ---- Dessin du fichier ---- */
  var pylMarkers = [];
  function iconFor(href) {
    if (!href || !data.images) return null;
    var key = href.replace(/^\.?\//, '');
    var src = data.images[key];
    if (!src) { try { src = data.images[decodeURIComponent(key)]; } catch (e) {} }
    if (!src) { for (var k in data.images) { if (k.split('/').pop() === key.split('/').pop()) { src = data.images[k]; break; } } }
    return src ? L.icon({ iconUrl: src, iconSize: [28, 28], iconAnchor: [14, 14] }) : null;
  }
  function draw() {
    fileLayer.clearLayers(); pylMarkers = []; clearTarget(); selected = null;
    data.polys.forEach(function (p) {
      var s = p.style;
      L.polygon(p.rings, { interactive: false, color: s.line || '#ffcc00', weight: s.noOutline ? 0 : (s.width || 2), opacity: s.lineOp != null ? s.lineOp : 1,
        fillColor: s.fill || s.line || '#ffcc00', fillOpacity: s.noFill ? 0 : (s.fillOp != null ? Math.min(s.fillOp, 0.5) : 0.2) }).addTo(fileLayer);
    });
    data.lines.forEach(function (l) {
      var s = l.style;
      L.polyline(l.coords, { interactive: false, color: s.line || '#ff3b30', weight: Math.max(2, s.width || 3), opacity: s.lineOp != null ? Math.max(s.lineOp, 0.6) : 0.9 }).addTo(fileLayer);
    });
    data.points.forEach(function (p) {
      var m;
      if (p.pylon) {
        m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'pyl-ico', html: '<div>' + esc(p.pylon) + '</div>', iconSize: [0, 0] }), zIndexOffset: 1000 });
        p.marker = m; pylMarkers.push(m);
      } else {
        var ic = iconFor(p.style.icon);
        m = ic ? L.marker([p.lat, p.lon], { icon: ic })
               : L.circleMarker([p.lat, p.lon], { radius: 6, color: '#fff', weight: 2, fillColor: p.style.iconColor || '#ffb300', fillOpacity: 1, bubblingMouseEvents: false });
        if (p.name) m.bindTooltip(esc(p.name), { permanent: true, direction: 'right', offset: [8, 0], className: 'pt-lbl' });
      }
      m.on('click', function (ev) {
        L.DomEvent.stop(ev);
        if (measure.on) { addMeasurePoint(L.latLng(p.lat, p.lon)); return; }
        selectPoint(p, false);
      });
      m.addTo(fileLayer);
    });
    var hasPyl = data.pylonCount > 0;
    $('pylLbl').textContent = hasPyl ? 'Pylône' : 'Point';
    $('pylTitle').textContent = hasPyl ? data.pylonCount + ' pylônes' : data.points.length + ' points';
    $('pylName').textContent = '—';
  }
  function fit() {
    if (!data) return;
    var b = L.latLngBounds([]);
    C.geometryOf(data).forEach(function (s) { s.forEach(function (c) { b.extend(c); }); });
    if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 17 });
  }
  $('btnFit').addEventListener('click', function () { if (data) fit(); else toast('Choisis d\'abord un fichier'); });

  function zoomClass() { map.getContainer().classList.toggle('far', map.getZoom() < 14); }
  map.on('zoomend', zoomClass); zoomClass();

  /* ---- Choix du pylône ---- */
  var selected = null, target = null;
  function pickList() {
    if (!data) return [];
    var hasPyl = data.pylonCount > 0;
    var list = data.points.filter(function (p) { return hasPyl ? p.pylon : true; });
    list.sort(function (a, b) { return natural(hasPyl ? a.pylon : a.name, hasPyl ? b.pylon : b.name); });
    return list;
  }
  function renderPyl() {
    var el = $('pylList');
    if (!data) { el.className = ''; el.innerHTML = '<div class="empty">Choisis d\'abord un fichier.</div>'; return; }
    var q = $('pylSearch').value.trim().toLowerCase(), hasPyl = data.pylonCount > 0;
    var list = pickList().filter(function (p) { return !q || (p.pylon || '').toLowerCase().indexOf(q) === 0 || (p.name || '').toLowerCase().indexOf(q) >= 0; });
    if (!list.length) { el.className = ''; el.innerHTML = '<div class="empty">Aucun résultat.</div>'; return; }
    el.className = hasPyl ? 'grid' : 'list';
    el.innerHTML = list.map(function (p, i) { return '<button data-i="' + i + '"' + (selected === p ? ' class="cur"' : '') + '>' + esc(hasPyl ? p.pylon : (p.name || '(sans nom)')) + '</button>'; }).join('');
    el.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { selectPoint(list[+b.getAttribute('data-i')], true); }); });
  }
  $('btnPyl').addEventListener('click', function () {
    if (!data) { toast('Choisis d\'abord un fichier'); openSheet('sheetFiles'); renderFiles(); return; }
    $('pylSearch').value = ''; renderPyl(); openSheet('sheetPyl');
  });
  $('pylSearch').addEventListener('input', renderPyl);

  /* ---- Destination ---- */
  function clearTarget() {
    if (target) { map.removeLayer(target); target = null; }
    if (selected && selected.marker && selected.marker.getElement()) selected.marker.getElement().classList.remove('sel');
  }
  var PYL_PREFIX = /^\s*(?:pyl[oô]nes?|pyl\.?|p|n°|no\.?|#)?\s*[-.]?\s*\d{1,4}(?:\s?(?:bis|ter|[a-z]{1,2}))?\b/i;
  function selectPoint(p, fly) {
    clearTarget(); selected = p;
    if (p.marker && p.marker.getElement()) p.marker.getElement().classList.add('sel');
    if (p.pylon) $('pylName').textContent = p.pylon;
    if (fly) map.setView([p.lat, p.lon], Math.max(map.getZoom(), 18));
    var meta = [];
    if (p.folder && p.folder.length) meta.push('<b>Dossier :</b> ' + esc(p.folder.join(' › ')));
    (p.data || []).forEach(function (d) { meta.push('<b>' + esc(d[0]) + ' :</b> ' + esc(d[1])); });
    if (p.desc) meta.push(esc(p.desc.length > 600 ? p.desc.slice(0, 600) + '…' : p.desc));
    var rest = (p.name || '').replace(PYL_PREFIX, '').replace(/^[\s\-–:]+/, '').trim();
    var title = !p.pylon ? (p.name || 'Point') : (p.name === p.pylon ? p.pylon : 'Pylône ' + p.pylon + (rest && rest !== p.name ? ' — ' + rest : ''));
    showDest(title, p.lat, p.lon, meta.join('\n'));
  }
  var destLatLng = null;
  function showDest(title, lat, lon, metaHtml) {
    destLatLng = L.latLng(lat, lon);
    var ll = lat.toFixed(6) + ',' + lon.toFixed(6);
    $('destTitle').textContent = title;
    $('destCoords').textContent = lat.toFixed(6) + ', ' + lon.toFixed(6);
    $('lnkWaze').href = 'https://waze.com/ul?ll=' + encodeURIComponent(ll) + '&navigate=yes';
    $('lnkGmaps').href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(ll) + '&travelmode=driving';
    $('destMeta').innerHTML = metaHtml || '';
    $('destMeta').style.display = metaHtml ? 'block' : 'none';
    $('destInfos').innerHTML = '';
    $('btnInfo').style.display = Object.keys(active).some(function (id) { return ITEMS[id].info; }) ? '' : 'none';
    openSheet('sheetDest', true);
    setTimeout(function () { keepVisible(destLatLng); }, 260);
  }
  function keepVisible(ll) {
    var sh = $('sheetDest'); if (!sh.classList.contains('open')) return;
    var free = window.innerHeight - sh.offsetHeight;
    var p = map.latLngToContainerPoint(ll), want = Math.max(110, free * 0.55);
    if (p.y > free - 30 || p.y < 90) map.panBy([0, p.y - want], { animate: true });
  }
  $('btnCopy').addEventListener('click', function () {
    var s = $('destCoords').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(function () { toast('Coordonnées copiées'); }, function () { toast(s, 6000); });
  });
  map.on('click', function (e) {
    if (measure.on) { addMeasurePoint(e.latlng); return; }
    closeSheets(); clearTarget(); selected = null;
    target = L.marker(e.latlng, { icon: L.divIcon({ className: 'tgt-ico', html: '<div></div>', iconSize: [0, 0] }) }).addTo(map);
    showDest('Point choisi', e.latlng.lat, e.latlng.lng, '');
  });

  /* ---- « Que trouve-t-on ici ? » (calques interrogeables) ---- */
  $('btnInfo').addEventListener('click', function () {
    if (!destLatLng) return;
    var box = $('destInfos');
    if (!isOnline()) { box.innerHTML = '<p class="muted">Nécessite du réseau.</p>'; return; }
    box.innerHTML = '<p class="muted">Recherche…</p>';
    var z = map.getZoom(), res = 2 * 20037508.342789244 / (256 * Math.pow(2, z));
    var pt = L.CRS.EPSG3857.project(destLatLng), h = 50 * res;
    var bbox = [pt.x - h, pt.y - h, pt.x + h, pt.y + h].map(function (v) { return v.toFixed(2); }).join(',');
    var jobs = [];
    Object.keys(active).forEach(function (id) {
      var it = ITEMS[id]; if (!it.info) return;
      it.defs.forEach(function (d) {
        var u = d.base + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=' + d.layers + '&QUERY_LAYERS=' + d.layers +
          '&STYLES=&CRS=EPSG:3857&BBOX=' + bbox + '&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=5&BUFFER=12';
        jobs.push(withTimeout(fetch(u, { mode: 'cors' }), 15000).then(function (r) { return r.json(); })
          .then(function (j) { return { it: it, feats: (j && j.features) || [] }; }).catch(function () { return { it: it, feats: [], err: true }; }));
      });
    });
    Promise.all(jobs).then(function (rs) {
      var html = [];
      rs.forEach(function (r) {
        r.feats.forEach(function (f) { html.push('<div class="card"><h4>' + esc(r.it.label) + '</h4><div>' + propsHtml(f.properties || {}) + '</div></div>'); });
      });
      box.innerHTML = html.length ? html.join('') : '<p class="muted">Rien trouvé à cet endroit dans les calques affichés (réseaux, SNCF, PLU, servitudes…).</p>';
    });
  });

  /* ======================= Mesure ======================= */
  var measure = { on: false, pts: [], area: false, layer: L.layerGroup() };
  function geodesicArea(lls) {
    var R = 6378137, s = 0, n = lls.length, toR = Math.PI / 180;
    for (var i = 0; i < n; i++) {
      var p1 = lls[i], p2 = lls[(i + 1) % n];
      s += (p2.lng - p1.lng) * toR * (2 + Math.sin(p1.lat * toR) + Math.sin(p2.lat * toR));
    }
    return Math.abs(s * R * R / 2);
  }
  function redrawMeasure() {
    measure.layer.clearLayers();
    var pts = measure.pts, d = 0;
    for (var i = 1; i < pts.length; i++) d += pts[i - 1].distanceTo(pts[i]);
    if (measure.area && pts.length >= 3) {
      L.polygon(pts, { color: '#ff6d00', weight: 3, fillOpacity: 0.15, interactive: false }).addTo(measure.layer);
      var per = d + pts[pts.length - 1].distanceTo(pts[0]);
      $('msValue').textContent = fmtArea(geodesicArea(pts)) + ' · périmètre ' + fmtDist(per);
    } else {
      if (pts.length > 1) L.polyline(pts, { color: '#ff6d00', weight: 3, interactive: false }).addTo(measure.layer);
      var last = pts.length > 1 ? pts[pts.length - 2].distanceTo(pts[pts.length - 1]) : 0;
      $('msValue').textContent = fmtDist(d) + (pts.length > 2 ? '  (dernier : ' + fmtDist(last) + ')' : '');
    }
    pts.forEach(function (p) { L.marker(p, { icon: L.divIcon({ className: 'ms-ico', html: '<div></div>', iconSize: [0, 0] }), interactive: false }).addTo(measure.layer); });
    $('msHint').textContent = pts.length ? (measure.area ? 'Surface du polygone' : 'Distance totale') : 'Touche la carte ou un pylône pour poser des points';
    $('msArea').textContent = 'Surface : ' + (measure.area ? 'oui' : 'non');
  }
  function addMeasurePoint(ll) { measure.pts.push(L.latLng(ll.lat, ll.lng)); redrawMeasure(); }
  function setMeasure(on) {
    measure.on = on;
    $('btnMeasure').classList.toggle('on', on);
    $('measureBar').style.display = on ? 'block' : 'none';
    if (on) { closeSheets(); clearTarget(); measure.layer.addTo(map); redrawMeasure(); }
    else { measure.pts = []; measure.layer.clearLayers(); map.removeLayer(measure.layer); }
  }
  $('btnMeasure').addEventListener('click', function () { setMeasure(!measure.on); });
  $('msUndo').addEventListener('click', function () { measure.pts.pop(); redrawMeasure(); });
  $('msClear').addEventListener('click', function () { measure.pts = []; redrawMeasure(); });
  $('msArea').addEventListener('click', function () { measure.area = !measure.area; redrawMeasure(); });
  $('msClose').addEventListener('click', function () { setMeasure(false); });

  /* ======================= Hors ligne ======================= */
  var dl = null; // téléchargement en cours
  var BUFFER_M = 1000;
  function offlineJobs(opts) {
    var jobs = [];
    C.BASES.forEach(function (b) {
      if (b.noOffline || !opts.bases[b.id]) return;
      jobs.push({ def: b.def, minZ: 10, maxZ: b.offline, avgKB: b.avgKB });
    });
    opts.items.forEach(function (id) {
      var it = ITEMS[id]; if (!it || it.special) return;
      it.defs.forEach(function (d) {
        var minZ = Math.max(10, d.native[0], it.minZoom || 0), maxZ = Math.min(it.offline || 16, d.native[1]);
        if (maxZ >= minZ) jobs.push({ def: d, minZ: minZ, maxZ: maxZ, avgKB: it.avgKB || 5 });
      });
    });
    return jobs;
  }
  function offlineUrls(opts) {
    var seqs = C.geometryOf(data);
    var plan = C.planDownload(seqs, offlineJobs(opts), BUFFER_M);
    if (opts.items.indexOf('veg_rte') >= 0) {
      C.tilesAround(seqs, 12, BUFFER_M).forEach(function (t) { plan.urls.push(C.vegUrl(t[0], t[1])); plan.estKB += 20; });
    }
    return plan;
  }
  function renderOffline() {
    var body = $('offBody'), reg = C.offlineRegistry(), html = [];
    if (dl) {
      html.push('<p><b>Préparation de « ' + esc(dl.name) + ' »</b></p><div class="prog"><div id="dlBar"></div></div><p class="muted" id="dlTxt">Démarrage…</p>' +
        '<button class="btn danger" id="dlCancel">Arrêter</button>');
    } else if (!data || !current) {
      html.push('<p class="muted">Ouvre d\'abord un fichier pour préparer son chantier hors ligne.</p>');
    } else {
      var r = reg[current.id];
      html.push('<p><b>' + esc((current.name || '').replace(/\.[^.]+$/, '')) + '</b><br><span class="muted">' +
        (r ? 'Prêt hors ligne depuis le ' + fmtDate(r.date, true) + ' — ' + fmtBytes(r.bytes) + (r.failed ? ' (' + r.failed + (r.failed > 1 ? ' tuiles manquantes)' : ' tuile manquante)') : '') : 'Pas encore préparé hors ligne') + '</span></p>');
      html.push('<p class="muted">Télécharge tout dans un rayon de 1 km autour des éléments du fichier.</p>');
      html.push('<label class="item" style="display:flex;gap:10px;padding:8px 0"><input type="checkbox" id="ofOrtho" checked> Satellite IGN</label>');
      html.push('<label class="item" style="display:flex;gap:10px;padding:8px 0"><input type="checkbox" id="ofPlan" checked> Carte IGN</label>');
      var act = Object.keys(active).filter(function (id) { return ITEMS[id].special !== 'vigicrues'; });
      html.push('<label class="item" style="display:flex;gap:10px;padding:8px 0"><input type="checkbox" id="ofActive" checked><span>Calques affichés (' + act.length + ')' +
        (act.length ? '<span class="hint muted" style="display:block">' + esc(act.map(function (id) { return ITEMS[id].label; }).join(', ')) + '</span>' : '') + '</span></label>');
      html.push('<label class="item" style="display:flex;gap:10px;padding:8px 0"><input type="checkbox" id="ofAll"> Tous les autres calques aussi</label>');
      html.push('<p class="muted" id="ofEst">Estimation…</p><div class="row2"><button class="btn primary" id="ofGo">' + (r ? 'Mettre à jour' : 'Préparer hors ligne') + '</button>' +
        (r ? '<button class="btn danger" id="ofDel">Supprimer</button>' : '') + '</div>');
      html.push('<p class="muted">Vigicrues : le dernier bulletin consulté est gardé automatiquement. Pour le guidage sans réseau, télécharge aussi la zone dans Google Maps (hors connexion).</p>');
    }
    var others = Object.keys(reg).filter(function (id) { return !current || id !== current.id; });
    if (others.length) {
      html.push('<div class="sect">Autres chantiers prêts hors ligne</div>');
      others.forEach(function (id) {
        html.push('<div class="offitem"><b>' + esc((reg[id].name || '').replace(/\.[^.]+$/, '')) + '</b><span class="muted">' + fmtDate(reg[id].date, true) + ' — ' + fmtBytes(reg[id].bytes) +
          '</span><div class="row2" style="margin-top:6px"><button class="btn danger" data-del="' + esc(id) + '">Supprimer</button></div></div>');
      });
    }
    html.push('<p class="muted" id="ofStorage"></p>');
    body.innerHTML = html.join('');

    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) {
      var el = $('ofStorage'); if (el) el.textContent = 'Espace utilisé par l\'appli : ' + fmtBytes(e.usage || 0) + (e.quota ? ' (disponible : ' + fmtBytes(e.quota) + ')' : '');
    });
    body.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { C.removeOffline(b.getAttribute('data-del')).then(renderOffline); });
    });
    if (dl) {
      $('dlCancel').addEventListener('click', function () { dl.cancel = true; });
      updateDlUi();
      return;
    }
    if (!data || !current) return;
    function opts() {
      var items = [];
      if ($('ofActive').checked) items = items.concat(Object.keys(active));
      if ($('ofAll').checked) items = items.concat(Object.keys(ITEMS));
      items = items.filter(function (v, i, a) { return a.indexOf(v) === i && ITEMS[v].special !== 'vigicrues'; });
      return { bases: { ortho: $('ofOrtho').checked, plan: $('ofPlan').checked }, items: items };
    }
    function estimate() {
      var p = offlineUrls(opts());
      $('ofEst').textContent = '≈ ' + p.urls.length.toLocaleString('fr-FR') + ' tuiles, environ ' + fmtBytes(p.estKB * 1024) + ' (estimation).';
    }
    ['ofOrtho', 'ofPlan', 'ofActive', 'ofAll'].forEach(function (id) { $(id).addEventListener('change', estimate); });
    setTimeout(estimate, 30);
    $('ofGo').addEventListener('click', function () {
      if (!isOnline()) { toast('Il faut du réseau pour préparer le hors ligne'); return; }
      var o = opts(), p = offlineUrls(o);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      dl = { name: current.name.replace(/\.[^.]+$/, ''), id: current.id, done: 0, total: p.urls.length, bytes: 0, failed: 0, cancel: false };
      renderOffline();
      C.download(current.id, { name: current.name, layers: o.items }, p.urls, function (d, t, b, f) {
        if (!dl) return; dl.done = d; dl.total = t; dl.bytes = b; dl.failed = f; updateDlUi();
      }, function () { return dl && dl.cancel; }).then(function (res) {
        var name = dl.name; dl = null;
        if (res.cancelled) toast('Préparation arrêtée (les tuiles déjà reçues sont gardées)', 4000);
        else toast('« ' + name + ' » prêt hors ligne (' + fmtBytes(res.bytes) + ')' + (res.failed ? ' — ' + res.failed + ' tuiles en échec' : ''), 5000);
        renderOffline(); renderFiles();
      }).catch(function (e) { dl = null; toast('Échec : ' + (e.message || e), 5000); renderOffline(); });
    });
    if ($('ofDel')) $('ofDel').addEventListener('click', function () { C.removeOffline(current.id).then(function () { renderOffline(); renderFiles(); }); });
  }
  function updateDlUi() {
    if (!dl) return;
    var bar = $('dlBar'), txt = $('dlTxt'); if (!bar) return;
    bar.style.width = (dl.total ? Math.round(dl.done / dl.total * 100) : 0) + '%';
    txt.textContent = dl.done.toLocaleString('fr-FR') + ' / ' + dl.total.toLocaleString('fr-FR') + ' tuiles — ' + fmtBytes(dl.bytes) + (dl.failed ? ' — ' + dl.failed + ' échecs' : '') + '. Garde l\'appli ouverte.';
  }
  $('btnOffline').addEventListener('click', function () { renderOffline(); openSheet('sheetOffline'); });

  /* ======================= Position ======================= */
  var me = null, meAcc = null;
  $('btnLocate').addEventListener('click', function () {
    if (!navigator.geolocation) { toast('Position indisponible'); return; }
    toast('Recherche de ta position…', 2000);
    navigator.geolocation.getCurrentPosition(function (pos) {
      var ll = [pos.coords.latitude, pos.coords.longitude];
      if (me) { map.removeLayer(me); map.removeLayer(meAcc); }
      meAcc = L.circle(ll, { radius: pos.coords.accuracy, color: '#1a73e8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
      me = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1, interactive: false }).addTo(map);
      map.setView(ll, Math.max(map.getZoom(), 16));
    }, function () { toast('Position indisponible (autorise la localisation pour l\'appli)', 4000); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });

  /* ======================= Réglages ======================= */
  function renderSettings() {
    $('cfgPorte').value = store('porte') || '';
    $('cfgCle').value = store('cle') || '';
    $('cfgStatus').textContent = '';
    $('cfgVersion').textContent = 'Version ' + APP_VERSION;
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) {
      $('cfgStorage').textContent = 'Utilisé : ' + fmtBytes(e.usage || 0) + (e.quota ? ' sur ' + fmtBytes(e.quota) + ' disponibles' : '');
    });
  }
  $('btnSettings').addEventListener('click', function () { renderSettings(); openSheet('sheetSettings'); });
  $('cfgSave').addEventListener('click', function () {
    var p = $('cfgPorte').value.trim(), k = $('cfgCle').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(p)) { $('cfgStatus').textContent = 'Adresse invalide (doit commencer par https://script.google.com/)'; return; }
    store('porte', p); store('cle', k);
    $('cfgStatus').textContent = 'Test…';
    callPorte('ping').then(function () { $('cfgStatus').textContent = '✓ Connexion OK'; refreshFiles().catch(function () {}); },
      function (e) { $('cfgStatus').textContent = '✗ ' + (e.message || e); });
  });

  /* ======================= Réseau ======================= */
  function updateNet() { $('offBadge').style.display = isOnline() ? 'none' : 'block'; }
  window.addEventListener('online', function () { updateNet(); if (active.vigicrues) refreshVigicrues(); });
  window.addEventListener('offline', updateNet);
  updateNet();

  /* ======================= Démarrage ======================= */
  setBase(store('base') || 'ortho');
  Object.keys(active).forEach(function (id) { setActive(id, true); });
  renderLayerPanel();
  $('btnLayers').addEventListener('click', function () { renderLayerPanel(); openSheet('sheetLayers'); });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  if (!porteConfigured()) {
    renderSettings(); openSheet('sheetSettings');
  } else {
    if (C._justConfigured) toast('Porte Drive configurée ✓', 3000);
    refreshFiles().then(function () {
      var last = store('file');
      if (last && files.some(function (f) { return f.id === last; })) openFile(last, true);
      else if (files.length === 1) openFile(files[0].id);
      else { openSheet('sheetFiles'); }
    }).catch(function () { openSheet('sheetFiles'); });
  }

  C.app = { map: map, setActive: setActive, openFile: openFile, ITEMS: ITEMS, active: active };
})();
