/* Carto chantiers — PDF A4 : atlas du chantier (ensemble, série au 1/2 500, pages pylônes, légende, tableau, fiches) et rapport de visite. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, esc = U.esc;
  var P = C.pdf = {};
  var R = 6378137, DPI = 150;

  // logo inscrit dans sa boîte sans déformation
  function logoAt(pdf, meta, x, y, bw, bh) {
    if (!meta.logo) return;
    var r = meta.logoRatio || 2, w = bw, h = bw / r; if (h > bh) { h = bh; w = bh * r; }
    try { pdf.addImage(meta.logo, 'PNG', x + (bw - w) / 2, y + (bh - h) / 2, w, h, 'logo', 'FAST'); } catch (e) {}
  }
  function logoRatio() {
    var src = U.store('logo'); if (!src) return Promise.resolve(2);
    return new Promise(function (ok) { var im = new Image(); im.onload = function () { ok(im.width / im.height || 2); }; im.onerror = function () { ok(2); }; im.src = src; });
  }
  function txt(s) { // caractères absents des polices standard du PDF
    return String(s == null ? '' : s).replace(/γ/g, 'gamma').replace(/[≈]/g, '~').replace(/[✓✔]/g, 'v').replace(/[⚙★☁⏳📷📍]/g, '').replace(/[  ]/g, ' ').replace(/[^\x00-\xFFŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/g, '');
  }
  function merc(lat, lon) { return [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))]; }
  function unmerc(x, y) { return [(2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI, x / R * 180 / Math.PI]; }
  function fmtScale(n) { return '1/' + Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' '); }
  function loadImg(url, ms) {
    return new Promise(function (ok) {
      var im = new Image(), done = false; im.crossOrigin = 'anonymous';
      var t = setTimeout(function () { if (!done) { done = true; ok(null); } }, ms || 20000);
      im.onload = function () { if (!done) { done = true; clearTimeout(t); ok(im); } };
      im.onerror = function () { if (!done) { done = true; clearTimeout(t); ok(null); } };
      im.src = url;
    });
  }
  function pool(tasks, n) {
    var i = 0, out = [];
    function next() { if (i >= tasks.length) return Promise.resolve(); var k = i++; return tasks[k]().then(function (r) { out[k] = r; return next(); }); }
    var ps = []; for (var j = 0; j < n; j++) ps.push(next());
    return Promise.all(ps).then(function () { return out; });
  }

  /* ---------- Rendu d'une carte dans un canvas ---------- */
  // view : { cx, cy (mercator), res (m mercator / px), w, h (px) }
  function drawTiles(ctx, view, def, opacity) {
    var maxN = def.native ? def.native[1] : 19, minN = def.native ? def.native[0] : 0;
    var z = Math.ceil(Math.log(2 * Math.PI * R / (256 * view.res)) / Math.LN2);
    z = Math.max(minN, Math.min(maxN, z));
    var ts = 2 * Math.PI * R / Math.pow(2, z);
    var minx = view.cx - view.w / 2 * view.res, maxy = view.cy + view.h / 2 * view.res, maxx = view.cx + view.w / 2 * view.res, miny = view.cy - view.h / 2 * view.res;
    var x0 = Math.floor((minx + Math.PI * R) / ts), x1 = Math.floor((maxx + Math.PI * R) / ts);
    var y0 = Math.floor((Math.PI * R - maxy) / ts), y1 = Math.floor((Math.PI * R - miny) / ts);
    var tasks = [];
    for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) (function (x, y) {
      tasks.push(function () {
        var tx = (x * ts - Math.PI * R - minx) / view.res, ty = (maxy - (Math.PI * R - y * ts)) / view.res, sz = ts / view.res;
        // tuile absente (hors ligne, réseau faible) : on agrandit la partie utile d'une tuile parente
        function attempt(dz) {
          var zz = z - dz, xx = x >> dz, yy = y >> dz;
          return loadImg(C.tileUrl(def, zz, xx, yy), dz ? 8000 : 20000).then(function (im) {
            if (!im) return dz < 4 && zz - 1 >= minN ? attempt(dz + 1) : null;
            ctx.globalAlpha = opacity == null ? 1 : opacity;
            if (!dz) ctx.drawImage(im, tx, ty, sz + 0.6, sz + 0.6);
            else {
              var n = 1 << dz, part = im.width / n, sx = (x - (xx << dz)) * part, sy = (y - (yy << dz)) * part;
              ctx.drawImage(im, sx, sy, part, part, tx, ty, sz + 0.6, sz + 0.6);
            }
            ctx.globalAlpha = 1;
          });
        }
        return attempt(0);
      });
    })(x, y);
    return pool(tasks, 8);
  }
  function toPx(view, ll) { var m = merc(ll[0], ll[1]); return [(m[0] - view.cx) / view.res + view.w / 2, (view.cy - m[1]) / view.res + view.h / 2]; }
  function drawFeatures(ctx, view, docs, opts) {
    var k = view.w / 1600; // facteur de taille des symboles
    docs.forEach(function (d) {
      d.feats.forEach(function (f) {
        if (d.hidden[C.folderKey(f)]) return;
        var s = f.style || {}, terr = d.role === 'terrain';
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (f.kind === 'line' || f.kind === 'poly') {
          var rings = f.kind === 'line' ? [f.coords] : f.coords;
          ctx.beginPath();
          rings.forEach(function (r) { r.forEach(function (c, i) { var p = toPx(view, c); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); if (f.kind === 'poly') ctx.closePath(); });
          if (f.kind === 'poly') { ctx.fillStyle = hexA(s.fill || s.line || (terr ? '#ba68c8' : '#ffcc00'), s.noFill ? 0 : Math.min(s.fillOp != null ? s.fillOp : 0.2, 0.4)); ctx.fill(); }
          ctx.setLineDash(terr ? [8 * k, 6 * k] : []);
          ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = (Math.max(2, s.width || 3) + 2.5) * k * 1.4; ctx.stroke();
          ctx.strokeStyle = s.line || (terr ? '#7b1fa2' : '#ff3b30'); ctx.lineWidth = Math.max(2, s.width || 3) * k * 1.4; ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    });
    docs.forEach(function (d) {
      d.feats.forEach(function (f) {
        if (d.hidden[C.folderKey(f)] || f.kind !== 'point') return;
        var p = toPx(view, f.coords); if (p[0] < -20 || p[1] < -20 || p[0] > view.w + 20 || p[1] > view.h + 20) return;
        var terr = d.role === 'terrain';
        if (f.pylon && !terr) {
          var lab = String(f.pylon), st = C.fiches.statusOf(d, f.pylon);
          ctx.font = 'bold ' + Math.round(22 * k) + 'px Helvetica, Arial';
          var w = Math.max(30 * k, ctx.measureText(lab).width + 14 * k), h = 30 * k;
          var hl = opts && opts.highlight === f;
          roundRect(ctx, p[0] - w / 2, p[1] - h / 2, w, h, h / 2);
          ctx.fillStyle = hl ? '#111' : st === 'Validé' ? '#1e8e3e' : st === 'Visité' ? '#e08a00' : '#d6261c'; ctx.fill();
          ctx.lineWidth = 3 * k; ctx.strokeStyle = '#fff'; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, p[0], p[1] + 1);
        } else {
          ctx.beginPath(); ctx.arc(p[0], p[1], (terr ? 11 : 8) * k, 0, Math.PI * 2);
          ctx.fillStyle = terr ? '#7b1fa2' : (f.style && f.style.iconColor) || '#ffb300'; ctx.fill(); ctx.lineWidth = 3 * k; ctx.strokeStyle = '#fff'; ctx.stroke();
          if (f.name) {
            ctx.font = Math.round(18 * k) + 'px Helvetica, Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 4 * k; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(f.name.slice(0, 40), p[0] + 14 * k, p[1]);
            ctx.fillStyle = '#16202a'; ctx.fillText(f.name.slice(0, 40), p[0] + 14 * k, p[1]);
          }
        }
      });
    });
  }
  function hexA(h, a) { h = (h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16) + ',' + a + ')'; }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function renderView(view, layers, docs, opts) {
    var cv = document.createElement('canvas'); cv.width = view.w; cv.height = view.h;
    var ctx = cv.getContext('2d'); ctx.fillStyle = '#e6eaee'; ctx.fillRect(0, 0, view.w, view.h);
    var chain = Promise.resolve();
    layers.forEach(function (l) { chain = chain.then(function () { return l.vector ? l.vector(ctx, view, l.opacity) : drawTiles(ctx, view, l.def, l.opacity); }); });
    return chain.then(function () {
      drawFeatures(ctx, view, docs, opts);
      if (opts && opts.frames) opts.frames.forEach(function (fr, i) {
        var a = [(fr.minx - view.cx) / view.res + view.w / 2, (view.cy - fr.maxy) / view.res + view.h / 2], b = [(fr.maxx - view.cx) / view.res + view.w / 2, (view.cy - fr.miny) / view.res + view.h / 2];
        ctx.strokeStyle = '#0b5cad'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.setLineDash([]);
        ctx.font = 'bold 24px Helvetica, Arial'; ctx.fillStyle = '#0b5cad'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText(String(fr.page), a[0] + 6, a[1] + 4); ctx.fillText(String(fr.page), a[0] + 6, a[1] + 4);
      });
      if (opts && opts.arrows) opts.arrows.forEach(function (ar) {
        var dx = ar.x - view.cx, dy = view.cy - ar.y, ang = Math.atan2(dy, dx);
        var ex = view.w / 2 + Math.cos(ang) * (view.w / 2 - 60), ey = view.h / 2 + Math.sin(ang) * (view.h / 2 - 50);
        ex = Math.max(60, Math.min(view.w - 60, ex)); ey = Math.max(40, Math.min(view.h - 40, ey));
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
        ctx.fillStyle = 'rgba(11,92,173,.92)'; ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-10, -16); ctx.lineTo(-10, 16); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.font = 'bold 22px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 5; ctx.strokeStyle = '#fff';
        var lx = ex - Math.cos(ang) * 40, ly = ey - Math.sin(ang) * 32;
        ctx.strokeText(ar.label, lx, ly); ctx.fillStyle = '#0b5cad'; ctx.fillText(ar.label, lx, ly);
      });
      return cv;
    });
  }

  /* ---------- Mise en page ---------- */
  var A4L = { w: 297, h: 210 }, MAP = { x: 8, y: 8, w: 281, h: 160 };
  function activeLayers(baseId, withOverlays) {
    var out = [];
    var b = C.BASES.filter(function (x) { return x.id === baseId; })[0] || C.BASES[0];
    out.push({ def: b.def, opacity: 1, label: b.label });
    // même empilement et même transparence qu'à l'écran : du dessous vers le dessus, sans les calques masqués
    if (withOverlays) C.layerOrder.slice().reverse().forEach(function (id) {
      var it = C.ITEMS[id]; if (!it || C.hiddenLayers[id]) return;
      if (it.special === 'litho' && C.geology) { out.push({ vector: C.geology.drawView, opacity: C.opacityOf(id), label: it.label, item: it }); return; }
      if (!it.defs) return;
      it.defs.forEach(function (d) { out.push({ def: d, opacity: C.opacityOf(id), label: it.label, item: it }); });
    });
    return out;
  }
  function footer(pdf, meta, pageLabel, scaleN, view) {
    var y = 172;
    pdf.setDrawColor(200); pdf.setLineWidth(0.3); pdf.rect(MAP.x, y, MAP.w, 30);
    var x = MAP.x + 3;
    if (meta.logo) { logoAt(pdf, meta, x, y + 3, 30, 14); x += 34; }
    pdf.setTextColor(22, 32, 42); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text(txt(meta.title), x, y + 8);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.text(txt(pageLabel), x, y + 14);
    pdf.setFontSize(7.5); pdf.setTextColor(93, 107, 120);
    pdf.text(txt('Sources : ' + meta.sources), x, y + 20, { maxWidth: 150 });
    pdf.text(txt('Données publiques indicatives : ne remplacent pas une DT-DICT.'), x, y + 27);
    // échelle et nord
    var rx = 205;
    if (scaleN && view) {
      var groundPerMm = scaleN / 1000; // m par mm papier
      var target = groundPerMm * 40, nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000].filter(function (v) { return v <= target; }).pop() || 5;
      var mm = nice / groundPerMm;
      pdf.setFillColor(22, 32, 42); pdf.rect(rx, y + 5, mm / 2, 1.6, 'F'); pdf.setDrawColor(22, 32, 42); pdf.rect(rx + mm / 2, y + 5, mm / 2, 1.6);
      pdf.setFontSize(7.5); pdf.setTextColor(22, 32, 42); pdf.text('0', rx - 1, y + 10); pdf.text(nice >= 1000 ? (nice / 1000) + ' km' : nice + ' m', rx + mm - 4, y + 10);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.text(txt('Échelle ' + fmtScale(scaleN)), rx, y + 16); pdf.setFont('helvetica', 'normal');
    }
    var nx = 278; pdf.setFillColor(22, 32, 42); pdf.triangle(nx, y + 3, nx - 3, y + 11, nx + 3, y + 11, 'F'); pdf.setFontSize(9); pdf.text('N', nx - 1.2, y + 15);
    pdf.setFontSize(7.5); pdf.setTextColor(93, 107, 120);
    pdf.text(txt('Editeur : ' + meta.author + ' — version ' + meta.version + ' du ' + meta.date), rx, y + 22);
    pdf.text(txt('Page ' + meta.page + (meta.total ? ' / ' + meta.total : '')), rx, y + 27);
  }
  function smallLegend(pdf, y) {
    var x = 118;
    pdf.setFontSize(7.5); pdf.setTextColor(22, 32, 42);
    pdf.setFillColor(214, 38, 28); pdf.circle(x, y + 1, 1.5, 'F'); pdf.text('Pylône', x + 3, y + 2);
    pdf.setFillColor(224, 138, 0); pdf.circle(x + 18, y + 1, 1.5, 'F'); pdf.text('Visité', x + 21, y + 2);
    pdf.setFillColor(30, 142, 62); pdf.circle(x + 33, y + 1, 1.5, 'F'); pdf.text('Validé', x + 36, y + 2);
    pdf.setFillColor(123, 31, 162); pdf.circle(x + 50, y + 1, 1.5, 'F'); pdf.text('Ajout terrain', x + 53, y + 2);
  }
  function mapImage(pdf, cv, rect) {
    pdf.addImage(cv.toDataURL('image/jpeg', 0.86), 'JPEG', rect.x, rect.y, rect.w, rect.h, undefined, 'FAST');
    cv.width = cv.height = 0; // libère la mémoire (téléphones)
    pdf.setDrawColor(120); pdf.setLineWidth(0.3); pdf.rect(rect.x, rect.y, rect.w, rect.h);
  }
  function viewFor(cx, cy, scaleN, rect, lat) {
    var w = Math.round(rect.w / 25.4 * DPI), h = Math.round(rect.h / 25.4 * DPI);
    var res = scaleN * 0.0254 / DPI / Math.cos(lat * Math.PI / 180);
    return { cx: cx, cy: cy, res: res, w: w, h: h };
  }

  /* ---------- Découpage en série le long du tracé ---------- */
  function seriesPath(doc) {
    var py = C.pylonsOf(doc);
    if (py.length >= 2) return py.map(function (f) { return f.coords; });
    var lines = doc.feats.filter(function (f) { return f.kind === 'line'; }).sort(function (a, b) { return C.geo.lineLength(b.coords) - C.geo.lineLength(a.coords); });
    if (lines.length) return lines[0].coords;
    return doc.feats.filter(function (f) { return f.kind === 'point'; }).map(function (f) { return f.coords; });
  }
  function seriesFrames(path, scaleN, lat) {
    var k = 1 / Math.cos(lat * Math.PI / 180);
    var W = MAP.w / 1000 * scaleN * k * 0.88, H = MAP.h / 1000 * scaleN * k * 0.88; // en mètres mercator, avec marge
    var pts = []; C.geo.densify(path, 15).forEach(function (p) { pts.push(merc(p[0], p[1])); });
    var frames = [], i = 0;
    while (i < pts.length) {
      var minx = pts[i][0], maxx = minx, miny = pts[i][1], maxy = miny, j = i;
      while (j + 1 < pts.length) {
        var p = pts[j + 1];
        var nminx = Math.min(minx, p[0]), nmaxx = Math.max(maxx, p[0]), nminy = Math.min(miny, p[1]), nmaxy = Math.max(maxy, p[1]);
        if (nmaxx - nminx > W || nmaxy - nminy > H) break;
        minx = nminx; maxx = nmaxx; miny = nminy; maxy = nmaxy; j++;
      }
      var cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, hw = MAP.w / 1000 * scaleN * k / 2, hh = MAP.h / 1000 * scaleN * k / 2;
      frames.push({ cx: cx, cy: cy, minx: cx - hw, maxx: cx + hw, miny: cy - hh, maxy: cy + hh });
      if (j === i) j++;
      i = j;
      if (i >= pts.length - 1) break;
    }
    return frames;
  }

  /* ---------- Atlas ---------- */
  P.atlasDialog = function () {
    var a = C.activeDoc(); if (!a) { U.toast('Ouvre d\'abord un chantier'); return; }
    var npyl = C.pylonsOf(a).length;
    var html = '<p class="muted">Atlas A4 paysage de « ' + esc(U.baseName(a.name)) + ' » avec les calques actuellement affichés.</p>' +
      chk('atOv', 'Vue d\'ensemble', 'Tout le chantier, avec le tableau d\'assemblage des planches', true) +
      chk('atSer', 'Série le long du tracé au 1/2 500', 'Planches successives avec recouvrement et renvois', true) +
      chk('atPyl', 'Une page par pylône', npyl + ' pylône(s), avec le résumé de sa fiche', npyl > 0) +
      '<label class="field indent1"><span>Échelle des pages pylône</span><select id="atPylSc"><option value="1000">1/1 000 (abords immédiats)</option><option value="2500">1/2 500</option></select></label>' +
      chk('atFull', 'Fiches pylônes complètes', 'Toutes les rubriques de chaque fiche (pages portrait)', false) +
      chk('atLeg', 'Page de légende', 'Symboles officiels des calques affichés', true) +
      chk('atTab', 'Tableau des pylônes', 'N°, type, coordonnées GPS et Lambert 93, commune, statut', npyl > 0) +
      '<label class="field"><span>Fond de carte</span><select id="atBase">' + C.BASES.filter(function (b) { return !b.noOffline; }).map(function (b) { return '<option value="' + b.id + '"' + (b.id === C.curBase ? ' selected' : '') + '>' + esc(b.label) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Titre</span><input type="text" id="atTitle" value="' + esc(U.baseName(a.name).replace(/ \(modifié \d{4}-\d{2}-\d{2}\)$/, '')) + '"></label>' +
      '<div class="row2"><label class="field" style="flex:1"><span>Version</span><input type="text" id="atVer" value="01"></label><label class="field" style="flex:2"><span>Éditeur</span><input type="text" id="atAut" value="' + esc(U.store('auteur') || 'Frédéric FATTORE') + '"></label></div>' +
      (U.store('logo') ? '<p class="muted small">Logo : celui enregistré dans Carte → Réglages.</p>' : '<p class="muted small">Pas de logo : ajoute-le dans Carte → Réglages pour l\'avoir dans le cartouche.</p>') +
      '<p class="muted" id="atEst"></p>';
    var d = C.openDlg({ title: 'Atlas A4 du chantier', body: html, foot: '<button class="btn primary big" id="atGo">Créer l\'atlas PDF</button>' });
    function est() {
      var lat = (C.pylonsOf(a)[0] || {}).coords; lat = lat ? lat[0] : 46;
      var n = (d.q('#atOv').checked ? 1 : 0) + (d.q('#atLeg').checked ? 1 : 0) + (d.q('#atSer').checked ? seriesFrames(seriesPath(a), 2500, lat).length : 0) + (d.q('#atPyl').checked ? npyl : 0) + (d.q('#atTab').checked ? Math.ceil(npyl / 24) : 0) + (d.q('#atFull').checked ? npyl : 0);
      d.q('#atEst').textContent = 'Environ ' + n + ' page(s). ' + (U.isOnline() ? '' : 'Hors réseau : seuls les fonds préparés hors ligne apparaîtront.');
    }
    d.body.addEventListener('change', est); est();
    d.q('#atGo').onclick = function () {
      var o = { ov: d.q('#atOv').checked, ser: d.q('#atSer').checked, pyl: d.q('#atPyl').checked, pylSc: +d.q('#atPylSc').value, full: d.q('#atFull').checked, leg: d.q('#atLeg').checked, tab: d.q('#atTab').checked,
        base: d.q('#atBase').value, title: d.q('#atTitle').value || U.baseName(a.name), version: d.q('#atVer').value || '01', author: d.q('#atAut').value || '' };
      U.store('auteur', o.author);
      C.closeDlg(1); P.atlas(a, o);
    };
  };
  function chk(id, t, h, on) { return '<label class="check"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="grow">' + esc(t) + '<span class="hint">' + esc(h) + '</span></span></label>'; }

  P.atlas = function (doc, o) {
    U.busy(true, 'Préparation de l\'atlas…'); U.keepAwake(true);
    var ratio = 2;
    return U.loadScript('vendor/jspdf.umd.min.js').then(logoRatio).then(function (r) { ratio = r; }).then(function () {
      var jsPDF = window.jspdf.jsPDF, pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      var docs = [doc]; var t = C.terrainOf(doc); if (t) docs.push(t);
      var layers = activeLayers(o.base, true);
      var srcs = {}; layers.forEach(function (l) { srcs[C.shortSrc((l.item && l.item.src) || 'IGN')] = true; });
      var meta = { title: o.title, version: o.version, author: o.author, date: U.fmtDate(new Date().toISOString()), logo: U.store('logo'), logoRatio: ratio, sources: Object.keys(srcs).join(', '), page: 1, total: 0 };
      var pts = []; doc.feats.forEach(function (f) { if (f.kind === 'point') pts.push(f.coords); else (f.kind === 'line' ? f.coords : f.coords[0]).forEach(function (c) { pts.push(c); }); });
      if (!pts.length) throw new Error('Le chantier est vide');
      var lat = pts.reduce(function (s, p) { return s + p[0]; }, 0) / pts.length;
      var frames = o.ser ? seriesFrames(seriesPath(doc), 2500, lat) : [];
      var pyls = o.pyl || o.full || o.tab ? C.pylonsOf(doc) : [];
      // numérotation des pages
      var pages = [];
      if (o.ov) pages.push({ t: 'ov' });
      if (o.leg) pages.push({ t: 'leg' });
      frames.forEach(function (fr, i) { fr.page = null; pages.push({ t: 'ser', fr: fr, i: i }); });
      if (o.pyl) pyls.forEach(function (f) { pages.push({ t: 'pyl', f: f }); });
      if (o.tab) for (var k = 0; k < Math.ceil(pyls.length / 24); k++) pages.push({ t: 'tab', k: k });
      if (o.full) pyls.forEach(function (f) { var r = C.fiches.rowOf(doc, f.pylon); if (r && C.fiche.FIELDS.some(function (fd) { return r[fd.label]; })) pages.push({ t: 'full', f: f }); });
      pages.forEach(function (p, i) { p.n = i + 1; if (p.t === 'ser') p.fr.page = i + 1; });
      meta.total = pages.length;
      var chain = Promise.resolve(), first = true;
      pages.forEach(function (pg) {
        chain = chain.then(function () {
          U.busy(true, 'Atlas : page ' + pg.n + ' / ' + pages.length + '…');
          if (!first) pdf.addPage('a4', pg.t === 'full' ? 'portrait' : 'landscape');
          first = false; meta.page = pg.n;
          if (pg.t === 'ov') return pageOverview(pdf, doc, docs, layers, pts, frames, meta);
          if (pg.t === 'leg') return pageLegend(pdf, layers, meta);
          if (pg.t === 'ser') return pageSeries(pdf, docs, layers, frames, pg.i, lat, meta);
          if (pg.t === 'pyl') return pagePylon(pdf, doc, docs, layers, pg.f, o.pylSc, meta);
          if (pg.t === 'tab') return pageTable(pdf, doc, pyls.slice(pg.k * 24, pg.k * 24 + 24), meta);
          if (pg.t === 'full') return pageFull(pdf, doc, pg.f, meta);
        });
      });
      return chain.then(function () {
        U.busy(false);
        var blob = pdf.output('blob');
        return C.deliverDialog(blob, o.title + ' - atlas v' + o.version + ' ' + U.isoDay() + '.pdf');
      });
    }).catch(function (e) { U.busy(false); U.toast('Atlas impossible : ' + (e.message || e), 6000); }).then(function () { U.keepAwake(false); });
  };
  function pageOverview(pdf, doc, docs, layers, pts, frames, meta) {
    var ms = pts.map(function (p) { return merc(p[0], p[1]); });
    frames.forEach(function (f) { ms.push([f.minx, f.miny]); ms.push([f.maxx, f.maxy]); });
    var minx = Math.min.apply(null, ms.map(function (m) { return m[0]; })), maxx = Math.max.apply(null, ms.map(function (m) { return m[0]; }));
    var miny = Math.min.apply(null, ms.map(function (m) { return m[1]; })), maxy = Math.max.apply(null, ms.map(function (m) { return m[1]; }));
    var w = Math.round(MAP.w / 25.4 * DPI), h = Math.round(MAP.h / 25.4 * DPI);
    var res = Math.max((maxx - minx) / (w * 0.9), (maxy - miny) / (h * 0.9), 0.3);
    var view = { cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, res: res, w: w, h: h };
    var lat = unmerc(view.cx, view.cy)[0], scaleN = res * Math.cos(lat * Math.PI / 180) * DPI / 0.0254;
    return renderView(view, layers.slice(0, 1).concat(layers.slice(1).filter(function (l) { return !(l.item && /bt|gaz_distri/.test(l.item.id)); })), docs, { frames: frames }).then(function (cv) {
      mapImage(pdf, cv, MAP); footer(pdf, meta, 'Vue d\'ensemble' + (frames.length ? ' — tableau d\'assemblage (planches ' + frames[0].page + ' à ' + frames[frames.length - 1].page + ')' : ''), scaleN, view); smallLegend(pdf, 196);
    });
  }
  function pageSeries(pdf, docs, layers, frames, i, lat, meta) {
    var fr = frames[i], view = viewFor(fr.cx, fr.cy, 2500, MAP, lat);
    var arrows = [];
    if (frames[i - 1]) arrows.push({ x: frames[i - 1].cx, y: frames[i - 1].cy, label: 'p.' + frames[i - 1].page });
    if (frames[i + 1]) arrows.push({ x: frames[i + 1].cx, y: frames[i + 1].cy, label: 'p.' + frames[i + 1].page });
    return renderView(view, layers, docs, { arrows: arrows }).then(function (cv) {
      mapImage(pdf, cv, MAP);
      footer(pdf, meta, 'Planche ' + (i + 1) + ' / ' + frames.length + (frames[i - 1] ? ' — précédente p.' + frames[i - 1].page : '') + (frames[i + 1] ? ' — suivante p.' + frames[i + 1].page : ''), 2500, view);
      smallLegend(pdf, 196);
    });
  }
  function pagePylon(pdf, doc, docs, layers, f, sc, meta) {
    var rect = { x: 8, y: 8, w: 190, h: 160 }, m = merc(f.coords[0], f.coords[1]);
    var view = viewFor(m[0], m[1], sc, rect, f.coords[0]);
    return renderView(view, layers, docs, { highlight: f }).then(function (cv) {
      mapImage(pdf, cv, rect);
      var r = C.fiches.rowOf(doc, f.pylon) || {}, x = 202, y = 12;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.setTextColor(22, 32, 42); pdf.text(txt('Pylône ' + f.pylon), x, y + 2);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
      var l93 = C.geo.L93.fromWGS(f.coords[0], f.coords[1]);
      var lines = [['GPS', f.coords[0].toFixed(6) + ', ' + f.coords[1].toFixed(6)], ['Lambert 93', Math.round(l93[0]) + ' / ' + Math.round(l93[1])]];
      ['Statut', 'Type', 'Famille / modèle', 'Hauteur utile (m)', 'Commune', 'Parcelle', 'Accès', 'Engins possibles', 'Fondations : état', 'Embases : état', 'Structure : vétusté', 'Structure : corrosion', 'Structure : kit', 'Câbles : pylône suivant', 'Câbles : portée (m)', 'Nota : contraintes (saison, cultures, riverains)'].forEach(function (k) { if (r[k]) lines.push([k.replace(/ \(.*\)$/, ''), r[k]]); });
      y += 8;
      lines.forEach(function (ln) {
        if (y > 166) return;
        pdf.setTextColor(93, 107, 120); pdf.text(txt(ln[0]), x, y);
        pdf.setTextColor(22, 32, 42); var w = pdf.splitTextToSize(txt(ln[1]), 85); pdf.text(w.slice(0, 3), x, y + 3.6); y += 4 + 3.6 * Math.min(w.length, 3) + 1;
      });
      footer(pdf, meta, 'Pylône ' + f.pylon, sc, view); smallLegend(pdf, 196);
    });
  }
  function pageLegend(pdf, layers, meta) {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(22, 32, 42); pdf.text('Légende', 12, 18);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    var x = 12, y = 26, col = 0;
    var items = []; var seen = {};
    layers.forEach(function (l) { if (l.item && !seen[l.item.id]) { seen[l.item.id] = true; items.push(l.item); } });
    var jobs = items.map(function (it) {
      var spec = C.legendSpec(it);
      if (spec) return Promise.resolve({ it: it, ims: [], spec: spec });
      var urls = C.legendUrls(it);
      return Promise.all(urls.map(function (u) { return loadImg(u, 12000); })).then(function (ims) { return { it: it, ims: ims.filter(Boolean) }; });
    });
    return Promise.all(jobs).then(function (rs) {
      rs.forEach(function (r) {
        var hImg = 0;
        r.ims.forEach(function (im) { hImg += Math.min(40, im.height / im.width * 60); });
        if (r.spec) hImg = specHeight(pdf, r.spec);
        var need = 7 + hImg;
        if (y + need > 165) { col++; y = 26; x = 12 + col * 95; }
        if (col > 2) return;
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(22, 32, 42); pdf.text(txt(r.it.label), x, y);
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(93, 107, 120); pdf.setFontSize(7); pdf.text(txt(r.it.src), x, y + 3.5); pdf.setFontSize(9);
        y += 6;
        r.ims.forEach(function (im) {
          var w = Math.min(85, im.width / 4), h = im.height / im.width * w;
          if (h > 40) { h = 40; w = im.width / im.height * h; }
          try { var cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; cv.getContext('2d').drawImage(im, 0, 0); pdf.addImage(cv.toDataURL('image/png'), 'PNG', x, y, w, h); } catch (e) {}
          y += h + 2;
        });
        if (r.spec) { y = drawSpec(pdf, r.spec, x, y); }
        else if (!r.ims.length) { var cols = C.sampleColors(r.it.id); cols.forEach(function (c, i) { var m = c.match(/\d+/g); pdf.setFillColor(+m[0], +m[1], +m[2]); pdf.rect(x + i * 9, y - 1, 7, 4, 'F'); }); y += 6; }
        y += 3;
      });
      footer(pdf, meta, 'Légende des calques affichés', null, null); smallLegend(pdf, 196);
    });
  }
  function rgb(h) { h = (h || '#999').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function specHeight(pdf, spec) {
    var hh = 0;
    spec.forEach(function (e) {
      if (e.k === 'note') hh += 3.2 * pdf.splitTextToSize(txt(e.t), 82).length + 1;
      else if (e.k === 'ramp') hh += 9; else hh += 4.6;
    });
    return hh;
  }
  function drawSpec(pdf, spec, x, y) {
    spec.forEach(function (e) {
      pdf.setFontSize(7.5); pdf.setTextColor(22, 32, 42); pdf.setFont('helvetica', 'normal');
      if (e.k === 'title') { pdf.setFont('helvetica', 'bold'); pdf.text(txt(e.t), x, y + 2.5); y += 4.6; return; }
      if (e.k === 'note') { pdf.setTextColor(93, 107, 120); pdf.setFontSize(6.8); var lines = pdf.splitTextToSize(txt(e.t), 82); pdf.text(lines, x, y + 2.5); y += 3.2 * lines.length + 1; return; }
      if (e.k === 'ramp') {
        var n = e.c.length;
        e.c.forEach(function (c, i) { var v = rgb(c); pdf.setFillColor(v[0], v[1], v[2]); pdf.rect(x + i * 60 / n, y, 60 / n + 0.2, 3.5, 'F'); });
        pdf.setFontSize(6.8); e.ticks.forEach(function (t, i) { pdf.text(txt(t), x + i * 60 / (e.ticks.length - 1) - (i ? 3 : 0), y + 7); });
        y += 9; return;
      }
      var v = rgb(e.c);
      if (e.k === 'line' || e.k === 'dash') { pdf.setDrawColor(v[0], v[1], v[2]); pdf.setLineWidth(0.8); pdf.line(x, y + 1.7, x + 7, y + 1.7); pdf.setLineWidth(0.2); }
      else { pdf.setFillColor(v[0], v[1], v[2]); pdf.setDrawColor(150); pdf.setLineWidth(0.1); pdf.rect(x, y, 7, 3.5, 'FD'); }
      var lines2 = pdf.splitTextToSize(txt(e.t), 74); pdf.text(lines2[0] + (lines2.length > 1 ? '…' : ''), x + 9, y + 2.8);
      y += 4.6;
    });
    return y + 1;
  }
  function pageTable(pdf, doc, list, meta) {
    var cols = [['N°', 14], ['Type', 26], ['Famille / modèle', 34], ['Latitude', 22], ['Longitude', 22], ['X L93', 24], ['Y L93', 26], ['Commune', 48], ['Parcelle', 36], ['Statut', 20]];
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.setTextColor(22, 32, 42); pdf.text('Tableau des pylônes', 10, 16);
    var y = 24, x;
    pdf.setFontSize(8); pdf.setFillColor(232, 238, 245); pdf.rect(8, y - 4, 281, 6, 'F');
    x = 10; cols.forEach(function (c) { pdf.text(txt(c[0]), x, y); x += c[1]; });
    pdf.setFont('helvetica', 'normal');
    list.forEach(function (f, i) {
      y += 6;
      var r = C.fiches.rowOf(doc, f.pylon) || {}, l = C.geo.L93.fromWGS(f.coords[0], f.coords[1]);
      var vals = [f.pylon, r['Type'] || '', r['Famille / modèle'] || '', f.coords[0].toFixed(6), f.coords[1].toFixed(6), l[0].toFixed(1), l[1].toFixed(1), r['Commune'] || '', r['Parcelle'] || '', r['Statut'] || ''];
      if (i % 2) { pdf.setFillColor(246, 248, 250); pdf.rect(8, y - 4, 281, 6, 'F'); }
      x = 10; vals.forEach(function (v, k) { pdf.text(pdf.splitTextToSize(txt(v), cols[k][1] - 2)[0] || '', x, y); x += cols[k][1]; });
    });
    footer(pdf, meta, 'Tableau des pylônes', null, null);
  }
  function pageFull(pdf, doc, f, meta) {
    var r = C.fiches.rowOf(doc, f.pylon) || {};
    var W = 210, y = 16;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.setTextColor(22, 32, 42); pdf.text(txt('Fiche pylône ' + f.pylon + ' — ' + meta.title), 12, y);
    logoAt(pdf, meta, W - 42, 8, 30, 12);
    y += 6; pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(93, 107, 120);
    var l = C.geo.L93.fromWGS(f.coords[0], f.coords[1]);
    pdf.text(txt('GPS ' + f.coords[0].toFixed(6) + ', ' + f.coords[1].toFixed(6) + ' — Lambert 93 ' + Math.round(l[0]) + ' / ' + Math.round(l[1]) + (r['Statut'] ? ' — statut : ' + r['Statut'] : '')), 12, y);
    y += 4;
    C.fiche.SECTIONS.forEach(function (s) {
      var rows = s.fields.filter(function (fd) { return r[fd.label] && fd.t !== 'photos'; });
      var nph = s.fields.filter(function (fd) { return fd.t === 'photos' && r[fd.label]; }).map(function (fd) { return r[fd.label].split('\n').filter(Boolean).length; }).reduce(function (a, b) { return a + b; }, 0);
      if (!rows.length && !nph) return;
      if (y > 270) { pdf.addPage('a4', 'portrait'); y = 16; }
      y += 5; pdf.setFillColor(232, 238, 245); pdf.rect(10, y - 4, W - 20, 6, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9.5); pdf.setTextColor(22, 32, 42); pdf.text(txt(s.label), 12, y); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
      y += 5;
      rows.forEach(function (fd) {
        var lab = fd.label.replace(/^[^:]+ : /, ''), val = pdf.splitTextToSize(txt(r[fd.label]), 120);
        if (y + val.length * 3.8 > 282) { pdf.addPage('a4', 'portrait'); y = 16; }
        pdf.setTextColor(93, 107, 120); pdf.text(txt(lab), 12, y); pdf.setTextColor(22, 32, 42); pdf.text(val, 78, y);
        y += Math.max(4.4, val.length * 3.8 + 0.6);
      });
      if (nph) { pdf.setTextColor(93, 107, 120); pdf.text(txt(nph + ' photo(s) sur le Drive (liens dans le Google Sheet des fiches)'), 12, y); y += 4.4; }
    });
    pdf.setFontSize(7.5); pdf.setTextColor(93, 107, 120);
    pdf.text(txt('Editeur : ' + meta.author + ' — version ' + meta.version + ' du ' + meta.date + ' — page ' + meta.page + ' / ' + meta.total), 12, 290);
    return Promise.resolve();
  }

  /* ---------- Rapport de visite ---------- */
  P.reportDialog = function () {
    var a = C.activeDoc(); if (!a) { U.toast('Ouvre d\'abord un chantier'); return; }
    var today = U.isoDay();
    var d = C.openDlg({ title: 'Rapport de visite', body: '<p class="muted">Compte rendu A4 de « ' + esc(U.baseName(a.name)) + ' » : carte de la visite, ajouts terrain et fiches visitées sur la période, avec photos.</p>' +
      '<div class="row2"><label class="field" style="flex:1"><span>Du</span><input type="date" id="rpFrom" value="' + today + '"></label><label class="field" style="flex:1"><span>Au</span><input type="date" id="rpTo" value="' + today + '"></label></div>' +
      '<label class="field"><span>Objet de la visite</span><input type="text" id="rpObj" placeholder="ex. Reconnaissance des accès, état des embases…"></label>' +
      '<label class="field"><span>Participants</span><input type="text" id="rpPart" value="' + esc(U.store('auteur') || 'Frédéric FATTORE') + '"></label>' +
      '<label class="field"><span>Observations générales</span><textarea id="rpObs"></textarea></label>' +
      chk('rpPh', 'Inclure les photos', 'Vignettes récupérées sur le Drive (réseau nécessaire)', true),
      foot: '<button class="btn primary big" id="rpGo">Créer le rapport PDF</button>' });
    d.q('#rpGo').onclick = function () {
      var o = { from: d.q('#rpFrom').value, to: d.q('#rpTo').value, obj: d.q('#rpObj').value, part: d.q('#rpPart').value, obs: d.q('#rpObs').value, photos: d.q('#rpPh').checked };
      C.closeDlg(1); P.report(a, o);
    };
  };
  function parseFrDate(s) { var m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : (String(s || '').match(/\d{4}-\d{2}-\d{2}/) || [''])[0]; }
  function photoData(p) {
    if (p.thumb) return Promise.resolve(p.thumb);
    var id = p.id || ((p.url || '').match(/\/d\/([^/]+)/) || [])[1];
    if (!id || !U.isOnline()) return Promise.resolve(null);
    return C.callPorte('vignette', { id: id }).then(function (j) { return j.vignette; }).catch(function () { return null; });
  }
  P.report = function (doc, o) {
    U.busy(true, 'Préparation du rapport…');
    U.keepAwake(true);
    var ratio = 2;
    return U.loadScript('vendor/jspdf.umd.min.js').then(logoRatio).then(function (rr) { ratio = rr; }).then(function () {
      var jsPDF = window.jspdf.jsPDF, pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      var t = C.terrainOf(doc), inRange = function (day) { return day && day >= o.from && day <= o.to; };
      var adds = (t ? t.feats : []).filter(function (f) { return inRange(parseFrDate(C.dataGet(f, 'Date'))); });
      var rows = C.fiches.rowsOf(doc), visited = C.pylonsOf(doc).filter(function (f) { var r = C.fiches.rowOf(doc, f.pylon); return r && inRange(r['Date de visite']); });
      var meta = { title: U.baseName(doc.name).replace(/ \(modifié \d{4}-\d{2}-\d{2}\)$/, ''), author: o.part.split(',')[0] || '', date: U.fmtDate(new Date().toISOString()), logo: U.store('logo'), logoRatio: ratio };
      // page 1 : en-tête + carte
      var y = 16;
      logoAt(pdf, meta, 168, 8, 30, 12);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.setTextColor(22, 32, 42); pdf.text('Rapport de visite', 12, y);
      pdf.setFontSize(12); pdf.text(txt(meta.title), 12, y + 7);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(60, 70, 80);
      y += 15;
      [['Période', o.from === o.to ? U.fmtDate(o.from) : 'du ' + U.fmtDate(o.from) + ' au ' + U.fmtDate(o.to)], ['Objet', o.obj], ['Participants', o.part], ['Ajouts terrain', adds.length + ''], ['Pylônes visités', visited.map(function (f) { return f.pylon; }).join(', ') || '—']].forEach(function (l) {
        if (!l[1]) return; pdf.setTextColor(93, 107, 120); pdf.text(txt(l[0]), 12, y); pdf.setTextColor(22, 32, 42); var w = pdf.splitTextToSize(txt(l[1]), 150); pdf.text(w, 48, y); y += 5 * w.length + 1;
      });
      if (o.obs) { y += 2; pdf.setFont('helvetica', 'bold'); pdf.text('Observations générales', 12, y); pdf.setFont('helvetica', 'normal'); y += 5; var w2 = pdf.splitTextToSize(txt(o.obs), 186); pdf.text(w2, 12, y); y += w2.length * 4.4 + 2; }
      var pts = [];
      adds.forEach(function (f) { pts.push(f.kind === 'point' ? f.coords : C.centerOf(f)); });
      visited.forEach(function (f) { pts.push(f.coords); });
      if (!pts.length) C.pylonsOf(doc).forEach(function (f) { pts.push(f.coords); });
      var rect = { x: 12, y: Math.max(y + 2, 70), w: 186, h: 120 };
      var mapP = Promise.resolve();
      if (pts.length) {
        var ms = pts.map(function (p) { return merc(p[0], p[1]); });
        var minx = Math.min.apply(null, ms.map(function (m) { return m[0]; })), maxx = Math.max.apply(null, ms.map(function (m) { return m[0]; })), miny = Math.min.apply(null, ms.map(function (m) { return m[1]; })), maxy = Math.max.apply(null, ms.map(function (m) { return m[1]; }));
        var w = Math.round(rect.w / 25.4 * DPI), h = Math.round(rect.h / 25.4 * DPI);
        var view = { cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, res: Math.max((maxx - minx) / (w * 0.8), (maxy - miny) / (h * 0.8), 0.25), w: w, h: h };
        var docs = [doc]; if (t) docs.push(t);
        mapP = renderView(view, activeLayers(C.curBase === 'esri' ? 'ortho' : C.curBase, false), docs, {}).then(function (cv) { mapImage(pdf, cv, rect); });
      }
      return mapP.then(function () {
        var chain = Promise.resolve();
        function header(title) { pdf.addPage('a4', 'portrait'); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(22, 32, 42); pdf.text(txt(title), 12, 16); return 24; }
        var yy = 300;
        function ensure(h, title) { if (yy + h > 282) yy = header(title); }
        function block(title, lines, photos) {
          return Promise.all(o.photos ? (photos || []).slice(0, 6).map(photoData) : []).then(function (imgs) {
            imgs = imgs.filter(Boolean);
            var need = 8 + lines.length * 4.6 + (imgs.length ? 42 : 0);
            ensure(need, 'Détail de la visite');
            pdf.setFillColor(246, 248, 250); pdf.rect(10, yy - 5, 190, 7, 'F');
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(22, 32, 42); pdf.text(txt(title), 12, yy); yy += 6;
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
            lines.forEach(function (l) {
              var w = pdf.splitTextToSize(txt(l[1]), 140);
              ensure(w.length * 4, 'Détail de la visite');
              pdf.setTextColor(93, 107, 120); pdf.text(txt(l[0]), 12, yy); pdf.setTextColor(22, 32, 42); pdf.text(w, 56, yy); yy += Math.max(4.4, w.length * 3.9 + 0.5);
            });
            if (imgs.length) {
              var x = 12;
              imgs.forEach(function (src) { try { pdf.addImage(src, 'JPEG', x, yy, 48, 36, undefined, 'FAST'); } catch (e) {} x += 50; if (x > 160) { x = 12; } });
              yy += 40;
            }
            yy += 4;
          });
        }
        adds.forEach(function (f) {
          chain = chain.then(function () {
            var c = f.kind === 'point' ? f.coords : C.centerOf(f);
            return block('Ajout terrain — ' + f.name + ' (' + (f.folder[1] || '') + ')', [
              ['Date', C.dataGet(f, 'Date')], ['Pylône', C.dataGet(f, 'Pylône') || '—'], ['Statut', C.dataGet(f, 'Statut')], ['Position', c[0].toFixed(6) + ', ' + c[1].toFixed(6)],
              ['Note', f.desc || '—']].concat(C.dataGet(f, 'Longueur') ? [['Longueur', C.dataGet(f, 'Longueur')]] : []).concat(C.dataGet(f, 'Surface') ? [['Surface', C.dataGet(f, 'Surface')]] : []), f.photos);
          });
        });
        visited.forEach(function (f) {
          chain = chain.then(function () {
            var r = C.fiches.rowOf(doc, f.pylon) || {}, lines = [], photos = [];
            C.fiche.FIELDS.forEach(function (fd) {
              if (!r[fd.label]) return;
              if (fd.t === 'photos') r[fd.label].split('\n').forEach(function (s) { var u = s.split(' | ')[1]; if (u) photos.push({ url: u }); });
              else lines.push([fd.label.replace(/^[^:]+ : /, (fd.section.label.split(' ')[0] + ' : ')), r[fd.label]]);
            });
            return block('Pylône ' + f.pylon + ' — fiche', lines, photos);
          });
        });
        return chain;
      }).then(function () {
        var n = pdf.getNumberOfPages();
        for (var i = 1; i <= n; i++) { pdf.setPage(i); pdf.setFontSize(7.5); pdf.setTextColor(93, 107, 120); pdf.text(txt('Editeur : ' + meta.author + ' — ' + meta.date + ' — page ' + i + ' / ' + n), 12, 290); }
        U.busy(false);
        return C.deliverDialog(pdf.output('blob'), meta.title + ' - rapport de visite ' + o.from + '.pdf');
      });
    }).catch(function (e) { U.busy(false); U.toast('Rapport impossible : ' + (e.message || e), 6000); }).then(function () { U.keepAwake(false); });
  };
})();
