/* Carto chantiers — import DXF (AutoCAD) : lecture du fichier, reconnaissance du système de coordonnées
   (Lambert 93, RGF93 CC42 à CC50, GPS), calques AutoCAD rangés en dossiers, fond de plan ou chantier modifiable.
   Le DWG ne se lit pas dans un navigateur : dans AutoCAD ou DWG TrueView, « Enregistrer sous » → DXF. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, esc = U.esc;
  var D = C.dxf = {};
  var MAX_FEATS = 25000;
  var SYSTEMS = [{ id: 'l93', label: 'Lambert 93' }]
    .concat([42, 43, 44, 45, 46, 47, 48, 49, 50].map(function (z) { return { id: 'cc' + z, label: 'RGF93 CC' + z + ' (zone ' + (z - 41) + ')' }; }))
    .concat([{ id: 'wgs', label: 'GPS (degrés, WGS 84)' }]);
  var UNIT = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 7: 1000 }; // $INSUNITS → mètres

  /* ======================= Lecture ======================= */
  function decode(buf) {
    var bytes = new Uint8Array(buf);
    if (bytes.length > 22 && String.fromCharCode.apply(null, bytes.subarray(0, 18)) === 'AutoCAD Binary DXF') throw new Error('DXF binaire : enregistre-le en « DXF ASCII ».');
    var text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); } // anciens DXF : accents Windows
    return text;
  }
  function cleanText(t) {
    return String(t || '')
      .replace(/\\U\+([0-9A-Fa-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/\\P/g, ' ').replace(/\\~/g, ' ').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, '')
      .replace(/%%[dD]/g, '°').replace(/%%[cC]/g, 'Ø').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '').replace(/\s+/g, ' ').trim();
  }
  // arc d'une polyligne (« bulge ») entre deux sommets : points intermédiaires
  function bulgeArc(p1, p2, b) {
    var out = [], dx = p2[0] - p1[0], dy = p2[1] - p1[1], c = Math.sqrt(dx * dx + dy * dy);
    if (c < 1e-9 || Math.abs(b) < 1e-6) return out;
    var theta = 4 * Math.atan(b), r = c / (2 * Math.sin(theta / 2)), h = r * Math.cos(theta / 2);
    var cx = (p1[0] + p2[0]) / 2 - h * dy / c, cy = (p1[1] + p2[1]) / 2 + h * dx / c;
    var a1 = Math.atan2(p1[1] - cy, p1[0] - cx), n = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 12)));
    for (var k = 1; k < n; k++) { var a = a1 + theta * k / n; out.push([cx + Math.abs(r) * Math.cos(a), cy + Math.abs(r) * Math.sin(a)]); }
    return out;
  }
  function withBulges(pts, bulges, closed) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      out.push(pts[i]);
      var nx = i + 1 < pts.length ? pts[i + 1] : (closed ? pts[0] : null);
      if (nx && bulges[i]) out = out.concat(bulgeArc(pts[i], nx, bulges[i]));
    }
    return out;
  }

  // courbe « spline » : points calculés (algorithme de De Boor) ; à défaut, les points de contrôle
  function splinePts(ctrl, knots, deg) {
    var n = ctrl.length;
    if (n < 3 || !(deg >= 1) || knots.length !== n + deg + 1) return ctrl;
    var t0 = knots[deg], t1 = knots[n], out = [], steps = Math.min(400, Math.max(8, n * 6));
    if (!(t1 > t0)) return ctrl;
    for (var s = 0; s <= steps; s++) {
      var t = s === steps ? t1 : t0 + (t1 - t0) * s / steps, k = deg;
      while (k < n - 1 && knots[k + 1] <= t) k++;
      var d = [], j, r;
      for (j = 0; j <= deg; j++) d.push(ctrl[j + k - deg]);
      for (r = 1; r <= deg; r++) for (j = deg; j >= r; j--) {
        var lo = knots[j + k - deg], den = knots[j + 1 + k - r] - lo, a = den ? (t - lo) / den : 0;
        d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]];
      }
      out.push(d[deg]);
    }
    return out;
  }
  var OCS = { CIRCLE: 1, ARC: 1, LWPOLYLINE: 1, TEXT: 1, INSERT: 1, ATTRIB: 1, POLYLINE: 1 }; // objets dessinés dans leur propre plan
  var MAX_ENTS = 150000;

  /* Rend { units, layers: {nom: {color, off}}, ents: [...], count: {calque: {n, pts}}, truncated }.
     ents : { k: 'point'|'line'|'poly'|'text', pts, layer, color, … } ; les blocs sont remplacés par leur dessin. */
  D.parse = function (text) {
    var L = String(text).replace(/^﻿/, '').split(/\r\n|\r|\n/), n = L.length - 1, i = 0;
    var out = { units: 0, layers: {}, ents: [], count: {}, truncated: false };
    var blocks = {}, block = null, top = [];
    var section = '', wantName = false, ent = null, poly = null, insert = null, headVar = '';

    function add(e) {
      if (!e.pts || !e.pts.length || e.pts.some(function (p) { return !isFinite(p[0]) || !isFinite(p[1]); })) return;
      e.layer = e.layer || '0';
      (block ? block.ents : top).push(e);
    }
    function endPoly() {
      var p = poly; poly = null; if (!p || p.skip) return;
      var cl = !!(p.flags & 1), pp = withBulges(p.pts, p.bulges, cl);
      if (pp.length >= 2) add({ k: cl && pp.length >= 3 ? 'poly' : 'line', pts: pp, layer: p.layer, color: p.color });
    }
    function endInsert() { var x = insert; insert = null; if (x) { add(x); x.labels.forEach(add); delete x.labels; } }
    function flush() {
      var e = ent; ent = null; if (!e) return;
      if (e.t === 'LAYERDEF') { if (e.name) out.layers[e.name] = { color: Math.abs(e.color || 7), off: e.color < 0 || !!((e.flags || 0) & 1) }; return; }
      var mir = e.ez < 0 && OCS[e.t] ? -1 : 1; // objet « retourné » (extrusion vers le bas) : X inversé
      if (e.t === 'VERTEX') { if (poly && e.xs.length) { poly.pts.push([e.xs[0] * poly.mir, e.ys[0]]); poly.bulges.push((e.bulges[0] || 0) * poly.mir); } return; }
      if (e.t === 'ATTRIB') {
        if (insert && e.text) {
          var val = cleanText(e.text);
          insert.attrs.push([e.name || 'Attribut', val]);
          if (val && e.xs.length && !((e.flags || 0) & 1)) insert.labels.push({ k: 'text', pts: [[e.xs[0] * mir, e.ys[0]]], text: val.slice(0, 120), layer: e.layer || insert.layer, color: e.color });
        }
        return;
      }
      endPoly(); endInsert(); // un objet sans son « SEQEND » : on clôt ce qui était ouvert
      if (e.t === 'SEQEND') return;
      if (e.t === 'BLOCK') { block = { name: e.name || '', base: [e.xs[0] || 0, e.ys[0] || 0], ents: [] }; return; }
      if (e.t === 'ENDBLK') { if (block && block.name) blocks[block.name.toUpperCase()] = block; block = null; return; }
      if (e.paper) return; // espace papier (cartouche, mise en page) : n'a pas sa place sur une carte
      var base = { layer: e.layer, color: e.color };
      if (e.t === 'POLYLINE') { poly = { layer: e.layer, color: e.color, flags: e.flags || 0, pts: [], bulges: [], mir: mir, skip: !!((e.flags || 0) & 80) }; return; } // 16, 64 : maillages 3D
      if (e.t === 'DIMENSION') { if (e.name) add(Object.assign({ k: 'ref', pts: [[0, 0]], name: e.name }, base)); return; } // cote : son dessin est un bloc déjà en place
      if (!e.xs.length) return;
      var pts = e.xs.map(function (x, k) { return [x * mir, e.ys[k]]; });
      if (e.t === 'INSERT') {
        var ins = Object.assign({ k: 'point', pts: [pts[0]], name: e.name || '', attrs: [], labels: [],
          ins: { sx: (e.sx == null ? 1 : e.sx) * mir, sy: e.sy == null ? 1 : e.sy, rot: (e.a1 || 0) * mir } }, base);
        if (e.follow) insert = ins; else { delete ins.labels; add(ins); }
      } else if (e.t === 'POINT') add(Object.assign({ k: 'point', pts: [pts[0]], name: '', attrs: [] }, base));
      else if (e.t === 'LINE') { if (e.x2 != null) add(Object.assign({ k: 'line', pts: [pts[0], [e.x2, e.y2]] }, base)); }
      else if (e.t === 'LWPOLYLINE') {
        var closed = !!((e.flags || 0) & 1), p2 = withBulges(pts, mir < 0 ? e.bulges.map(function (b) { return -b; }) : e.bulges, closed);
        if (p2.length >= 2) add(Object.assign({ k: closed && p2.length >= 3 ? 'poly' : 'line', pts: p2 }, base));
      } else if (e.t === 'CIRCLE') {
        if (!(e.r > 0)) return;
        var ring = []; for (var a = 0; a < 32; a++) ring.push([pts[0][0] + e.r * Math.cos(a * Math.PI / 16), pts[0][1] + e.r * Math.sin(a * Math.PI / 16)]);
        add(Object.assign({ k: 'poly', pts: ring, circle: true, center: pts[0] }, base));
      } else if (e.t === 'ARC') {
        if (!(e.r > 0)) return;
        var a1 = e.a1 || 0, a2 = e.a2 || 0; if (mir < 0) { var sw = a1; a1 = 180 - a2; a2 = 180 - sw; }
        if (a2 <= a1) a2 += 360;
        var arc = []; for (var d = a1; d < a2; d += 10) arc.push([pts[0][0] + e.r * Math.cos(d * Math.PI / 180), pts[0][1] + e.r * Math.sin(d * Math.PI / 180)]);
        arc.push([pts[0][0] + e.r * Math.cos(a2 * Math.PI / 180), pts[0][1] + e.r * Math.sin(a2 * Math.PI / 180)]);
        add(Object.assign({ k: 'line', pts: arc }, base));
      } else if (e.t === 'ELLIPSE') {
        if (e.x2 == null) return;
        var ratio = e.r || 1, s = e.sx || 0, en = e.sy != null ? e.sy : 2 * Math.PI; if (en <= s) en += 2 * Math.PI;
        var whole = Math.abs(en - s - 2 * Math.PI) < 1e-6, seg = Math.max(8, Math.ceil((en - s) / (Math.PI / 18))), el = [];
        for (var q = 0; q <= seg - (whole ? 1 : 0); q++) { var t = s + (en - s) * q / seg; el.push([pts[0][0] + e.x2 * Math.cos(t) - e.y2 * ratio * Math.sin(t), pts[0][1] + e.y2 * Math.cos(t) + e.x2 * ratio * Math.sin(t)]); }
        add(Object.assign({ k: whole ? 'poly' : 'line', pts: el }, base));
      } else if (e.t === 'SPLINE') {
        var sp = e.fx.length >= 2 ? e.fx.map(function (x, k) { return [x, e.fy[k]]; }) : splinePts(pts, e.knots, e.deg);
        if (sp.length >= 2) add(Object.assign({ k: 'line', pts: sp }, base));
      } else if (e.t === 'TEXT' || e.t === 'MTEXT') {
        var txt = cleanText((e.more || '') + (e.text || ''));
        if (txt) add(Object.assign({ k: 'text', pts: [pts[0]], text: txt.slice(0, 120) }, base));
      }
    }

    for (; i + 1 <= n; i += 2) {
      var code = parseInt(L[i], 10), v = (L[i + 1] || '').trim();
      if (isNaN(code)) continue;
      if (code === 0) {
        flush();
        if (v === 'SECTION') { wantName = true; continue; }
        if (v === 'ENDSEC') { endPoly(); endInsert(); section = ''; block = null; continue; }
        if (v === 'EOF') break;
        if (section === 'TABLES') { if (v === 'LAYER') ent = { t: 'LAYERDEF' }; continue; }
        if (section === 'ENTITIES' || section === 'BLOCKS') ent = { t: v, xs: [], ys: [], bulges: [], fx: [], fy: [], knots: [] };
        continue;
      }
      if (wantName && code === 2) { section = v; wantName = false; continue; }
      if (section === 'HEADER') { if (code === 9) headVar = v; else if (headVar === '$INSUNITS' && code === 70) out.units = parseInt(v, 10) || 0; continue; }
      if (!ent) continue;
      if (ent.t === 'LAYERDEF') { if (code === 2) ent.name = v; else if (code === 62) ent.color = parseInt(v, 10); else if (code === 70) ent.flags = parseInt(v, 10); continue; }
      switch (code) {
        case 8: ent.layer = v; break;
        case 62: ent.color = parseInt(v, 10); break;
        case 67: ent.paper = parseInt(v, 10) === 1; break;
        case 10: ent.xs.push(parseFloat(v)); if (ent.t === 'LWPOLYLINE') ent.bulges.push(0); break;
        case 20: ent.ys.push(parseFloat(v)); break;
        case 11: if (ent.t === 'SPLINE') ent.fx.push(parseFloat(v)); else ent.x2 = parseFloat(v); break;
        case 21: if (ent.t === 'SPLINE') ent.fy.push(parseFloat(v)); else ent.y2 = parseFloat(v); break;
        case 40: if (ent.t === 'SPLINE') ent.knots.push(parseFloat(v)); else ent.r = parseFloat(v); break;
        case 41: ent.sx = parseFloat(v); break;
        case 42: if (ent.t === 'LWPOLYLINE') { if (ent.bulges.length) ent.bulges[ent.bulges.length - 1] = parseFloat(v); } else if (ent.t === 'VERTEX') ent.bulges[0] = parseFloat(v); else ent.sy = parseFloat(v); break;
        case 50: ent.a1 = parseFloat(v); break;
        case 51: ent.a2 = parseFloat(v); break;
        case 70: ent.flags = parseInt(v, 10); break;
        case 71: if (ent.t === 'SPLINE') ent.deg = parseInt(v, 10); break;
        case 66: ent.follow = parseInt(v, 10) === 1; break;
        case 230: ent.ez = parseFloat(v); break;
        case 1: ent.text = v; break;
        case 3: if (ent.t === 'MTEXT') ent.more = (ent.more || '') + v; break;
        case 2: ent.name = v; break;
      }
    }
    flush(); endPoly(); endInsert();

    /* Blocs : chaque insertion est remplacée par le dessin du bloc, mis en place (échelle, rotation, position). */
    function layerColor(l) { return (out.layers[l] || {}).color; }
    function place(e, b) {
      var sx = e.ins.sx, sy = e.ins.sy, a = e.ins.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), ox = e.pts[0][0], oy = e.pts[0][1], bx = b.base[0], by = b.base[1];
      return function (p) { var x = (p[0] - bx) * sx, y = (p[1] - by) * sy; return [ox + x * ca - y * sa, oy + x * sa + y * ca]; };
    }
    function expand(list, tr, lay, col, depth) {
      list.forEach(function (e) {
        if (out.ents.length >= MAX_ENTS) { out.truncated = true; return; }
        var inBlock = depth > 0;
        var layer = inBlock && e.layer === '0' ? lay : e.layer;              // calque 0 d'un bloc : celui de l'insertion
        var color = inBlock && e.color === 0 ? col : e.color;                // couleur « DuBloc » : celle de l'insertion
        if (e.k === 'ref' || e.ins) {
          var b = blocks[String(e.name || '').toUpperCase()], before = out.ents.length;
          if (b && b.ents.length && depth < 6) {
            var local = e.ins ? place(e, b) : null;
            var solid = color != null && color !== 256 && color !== 0 ? color : layerColor(layer);
            expand(b.ents, local ? (tr ? function (p) { return tr(local(p)); } : local) : tr, layer, solid, depth + 1);
          }
          if (e.k === 'ref' || inBlock) return;
          out.ents.push(Object.assign({}, e, { layer: layer, color: color, geo: out.ents.length - before }));
          return;
        }
        var c = Object.assign({}, e, { layer: layer, color: color, pts: tr ? e.pts.map(tr) : e.pts });
        if (inBlock) { c.fromBlock = true; if (c.center && tr) c.center = tr(e.center); }
        out.ents.push(c);
      });
    }
    expand(top, null, '0', undefined, 0);
    out.ents.forEach(function (e) {
      var c = out.count[e.layer] || (out.count[e.layer] = { n: 0, pts: 0 });
      c.n++; if ((e.k === 'point' || e.circle) && !e.fromBlock) c.pts++;
    });
    return out;
  };

  /* ======================= Système de coordonnées ======================= */
  function converter(id) {
    if (id === 'wgs') return function (x, y) { return [y, x]; };
    if (id === 'l93') return C.geo.L93.toWGS;
    var cc = C.geo.CC(+id.slice(2)); return cc.toWGS;
  }
  function inFrance(w) { return w[0] > 41 && w[0] < 51.6 && w[1] > -5.6 && w[1] < 10; }
  function onEarth(w) { return Math.abs(w[0]) <= 90 && Math.abs(w[1]) <= 180; }
  // point médian du dessin : un objet égaré à l'origine ne fausse pas la reconnaissance
  function median(dx) {
    var xs = [], ys = [], step = Math.max(1, Math.floor(dx.ents.length / 4000));
    for (var i = 0; i < dx.ents.length; i += step) { var p = dx.ents[i].pts[0]; xs.push(p[0]); ys.push(p[1]); }
    xs.sort(function (a, b) { return a - b; }); ys.sort(function (a, b) { return a - b; });
    return [xs[Math.floor(xs.length / 2)], ys[Math.floor(ys.length / 2)]];
  }
  // systèmes plausibles pour ce dessin : [{ id, label, scale }], le plus probable d'abord
  D.detect = function (dx) {
    var m = median(dx), out = [], unit = UNIT[dx.units] || 1;
    [unit, 1, 0.001].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (k) {
      if (out.length) return;
      var x = m[0] * k, y = m[1] * k;
      if (k === 1 && Math.abs(x) <= 180 && Math.abs(y) <= 90) { if (inFrance([y, x])) out.push({ id: 'wgs', scale: 1 }); return; }
      if (!isFinite(x) || !isFinite(y)) return;
      if (x > 50000 && x < 1350000 && y > 5950000 && y < 7250000 && inFrance(C.geo.L93.toWGS(x, y))) out.push({ id: 'l93', scale: k });
      var z = Math.floor(y / 1e6) + 41;
      if (z >= 42 && z <= 50 && x > 1050000 && x < 2350000 && Math.abs(C.geo.CC(z).toWGS(x, y)[0] - z) < 1.3 && inFrance(C.geo.CC(z).toWGS(x, y))) out.push({ id: 'cc' + z, scale: k });
    });
    out.forEach(function (c) { c.label = SYSTEMS.filter(function (s) { return s.id === c.id; })[0].label; });
    return out;
  };

  /* ======================= Couleurs AutoCAD (index ACI) ======================= */
  var ACI = { 1: '#ff0000', 2: '#ffd400', 3: '#00c853', 4: '#00b8d4', 5: '#2962ff', 6: '#d500f9', 8: '#757575', 9: '#bdbdbd' };
  D.color = function (aci) {
    if (aci == null || aci === 0 || aci === 7 || aci >= 250 && aci <= 256) return aci >= 250 && aci <= 254 ? '#9e9e9e' : '#ffd400'; // blanc/noir d'AutoCAD → jaune, lisible sur photo comme sur plan
    if (ACI[aci]) return ACI[aci];
    var hue = Math.floor((aci - 10) / 10) * 15, idx = aci % 10, val = [1, 0.8, 0.6, 0.5, 0.3][Math.floor(idx / 2)], sat = idx % 2 ? 0.5 : 1;
    var c = val * sat, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), mm = val - c, rgb = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + rgb.map(function (v) { return ('0' + Math.round((v + mm) * 255).toString(16)).slice(-2); }).join('');
  };

  /* ======================= Conversion en éléments du chantier ======================= */
  var LABEL = /^(?:P|PYL\.?|PYL[OÔ]NE|N°|NO\.?|#)?\s*\d{1,4}\s?[A-Za-z]{0,3}$/i;
  var NUM_TAG = /num|n°|^n[o°]?$|pyl|supp|rep/i;
  // o : { sys, scale, keep: {calque: true}, texts, pylLayer } → { feats, hidden, outside, dropped }
  D.toFeatures = function (dx, o) {
    var conv = converter(o.sys), k = o.scale || 1, ok = o.sys === 'wgs' ? onEarth : inFrance;
    var feats = [], hidden = {}, bad = 0, total = 0, seq = 0;
    function ll(p) { return conv(p[0] * k, p[1] * k); }
    // objet entièrement hors zone (cartouche, objet égaré à l'origine…) : écarté, il fausserait le cadrage
    function coords(pts) { var w = pts.map(ll); total++; if (w.some(ok)) return w; bad++; return null; }
    var reach = o.sys === 'wgs' ? 0.0003 : 30 / k; // un numéro à moins de 30 m d'un pylône est le sien
    var labels = dx.ents.filter(function (e) { return e.k === 'text' && LABEL.test(e.text); });
    function labelNear(c) {
      var best = '', bd = reach;
      labels.forEach(function (t) { var d = Math.sqrt(Math.pow(t.pts[0][0] - c[0], 2) + Math.pow(t.pts[0][1] - c[1], 2)); if (d < bd) { bd = d; best = t.text; } });
      return best;
    }
    function pylonName(e, c) {
      var at = e.attrs || [];
      var tagged = at.filter(function (x) { return x[1] && NUM_TAG.test(x[0]); })[0] || at.filter(function (x) { return LABEL.test(x[1]); })[0];
      return (tagged && tagged[1]) || labelNear(c) || (at[0] && at[0][1]) || String(++seq);
    }
    dx.ents.forEach(function (e) {
      if (!o.keep[e.layer]) return;
      var own = e.color != null && e.color !== 256 && e.color !== 0 ? e.color : (dx.layers[e.layer] || {}).color;
      var color = D.color(own), w;
      if (e.k === 'text') {
        if (!o.texts || !(w = coords(e.pts))) return;
        var folder = [e.layer, 'Textes']; hidden[folder.join(' › ')] = true;
        feats.push({ uid: U.uid(), kind: 'point', name: '“' + e.text + '”', coords: w[0], folder: folder, data: [], style: { iconColor: color } });
      } else if (o.pylLayer && e.layer === o.pylLayer && !e.fromBlock && (e.k === 'point' || e.circle)) {
        var c = e.k === 'point' ? e.pts[0] : e.center;
        if (!(w = coords([c]))) return;
        feats.push({ uid: U.uid(), kind: 'point', name: pylonName(e, c), coords: w[0], folder: ['Pylônes'],
          data: [['Calque AutoCAD', e.layer]].concat(e.name ? [['Bloc', e.name]] : [], e.attrs || []), style: {} });
      } else if (e.k === 'point') {
        if (e.geo && !e.attrs.length) return; // le dessin du bloc suffit : pas de point par-dessus
        if (!(w = coords(e.pts))) return;
        // sans nom : un numéro en ferait un pylône ; le bloc et ses attributs se lisent en touchant le point
        feats.push({ uid: U.uid(), kind: 'point', name: '', coords: w[0], folder: [e.layer], data: (e.name ? [['Bloc', e.name]] : []).concat(e.attrs || []), style: { iconColor: color } });
      } else if (e.k === 'line') {
        if (!(w = coords(e.pts))) return;
        feats.push({ uid: U.uid(), kind: 'line', name: '', coords: w, folder: [e.layer], data: [], style: { line: color, width: 2 } });
      } else {
        if (!(w = coords(e.pts))) return;
        feats.push({ uid: U.uid(), kind: 'poly', name: '', coords: [w], folder: [e.layer], data: [], style: { line: color, width: 2, fill: color, fillOp: 0.06 } });
      }
    });
    return { feats: feats, hidden: hidden, outside: total > 0 && bad / total > 0.5, dropped: bad };
  };

  /* ======================= Fenêtre d'import ======================= */
  function dialog(dx, name, resolve) {
    var cands = D.detect(dx), layers = Object.keys(dx.count).sort(U.natural), done = false;
    var guess = cands[0] || null, sure = cands.length === 1, unit = UNIT[dx.units] || 1;
    var pylLayers = layers.filter(function (l) { return dx.count[l].pts; });
    function shown(l) { return !(dx.layers[l] || {}).off && !/^defpoints$/i.test(l); } // masqué ou gelé dans AutoCAD : décoché au départ
    var pylGuess = pylLayers.filter(function (l) { return /pyl|support/i.test(l); })[0] || '';
    var HINT = { fond: 'Affiché en plus de ton chantier, qui reste le chantier actif.', chantier: 'Devient le chantier actif : modifiable, puis à enregistrer sur le Drive (onglet Chantier).' };
    var d = C.openDialog({ title: 'Importer un DXF', wide: true, body:
      '<p class="muted">« ' + esc(name) + ' » : ' + dx.ents.length.toLocaleString('fr-FR') + ' objets dans ' + layers.length + ' calque(s) AutoCAD.' +
      (dx.truncated ? ' Dessin très lourd : seule une partie est lue.' : dx.ents.length > 8000 ? ' Gros dessin : pour rester fluide sur téléphone, n\'importe que les calques utiles.' : '') + '</p>' +
      '<div class="cols"><label class="field"><span>Système de coordonnées' + (sure ? ' <span class="auto">reconnu</span>' : '') + '</span><select id="dxSys">' + (guess ? '' : '<option value="">— à choisir —</option>') +
      SYSTEMS.map(function (s) { return '<option value="' + s.id + '"' + (guess && guess.id === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Calque des pylônes</span><select id="dxPyl"><option value="">— aucun —</option>' +
      pylLayers.map(function (l) { return '<option' + (l === pylGuess ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select></label></div>' +
      (guess ? (sure ? '' : '<p class="muted">Deux systèmes sont possibles pour ce dessin (' + esc(cands.map(function (c) { return c.label; }).join(', ')) + ') : vérifie celui qui est choisi.</p>')
        : '<p class="muted">Système non reconnu : le dessin est peut-être en coordonnées locales. Choisis-le si tu le connais.</p>') +
      '<p class="muted small">Calque des pylônes : ses points, blocs et cercles deviennent des pylônes, numérotés d\'après le texte le plus proche.</p>' +
      '<div class="field"><span>Utilisation</span><div class="seg" id="dxUse"><button data-val="fond" class="on">Fond de plan</button><button data-val="chantier">Chantier modifiable</button></div><span class="hint" id="dxUseHint">' + HINT.fond + '</span></div>' +
      '<div class="sec-head"><h3 class="sec-title">Calques AutoCAD à importer</h3><span><button class="btn ghost" data-act="all">Tout cocher</button><button class="btn ghost" data-act="none">Tout décocher</button></span></div>' +
      layers.map(function (l, i) { return '<label class="check"><input type="checkbox" data-layer="' + i + '"' + (shown(l) ? ' checked' : '') + '><span class="grow">' + esc(l) + '<span class="hint">' + dx.count[l].n.toLocaleString('fr-FR') + ' objet(s)' + (shown(l) ? '' : ' · masqué dans AutoCAD') + '</span></span></label>'; }).join('') +
      '<label class="check"><input type="checkbox" id="dxTxt" checked><span class="grow">Importer aussi les textes<span class="hint">Rangés dans un sous-dossier « Textes », masqué au départ</span></span></label>' +
      '<p class="muted" id="dxMsg"></p>',
      foot: '<button class="btn" data-act="cancel">Annuler</button><button class="btn primary push" data-act="go">Importer</button>',
      onClose: function () { if (!done) resolve(null); } });
    U.pickOne(d.q('#dxUse'), function (v) { d.q('#dxUseHint').textContent = HINT[v]; });
    function setAll(on) { d.qa('[data-layer]').forEach(function (c) { c.checked = on; }); }
    d.on({
      all: function () { setAll(true); }, none: function () { setAll(false); },
      cancel: function () { C.closeDialog(1); },
      go: function () {
        var msg = d.q('#dxMsg'), sys = d.q('#dxSys').value;
        if (!sys) { msg.textContent = 'Choisis le système de coordonnées.'; return; }
        var keep = {}; d.qa('[data-layer]').forEach(function (c) { if (c.checked) keep[layers[+c.getAttribute('data-layer')]] = true; });
        var res = D.toFeatures(dx, { sys: sys, scale: guess && guess.id === sys ? guess.scale : (sys === 'wgs' ? 1 : unit), keep: keep, texts: d.q('#dxTxt').checked, pylLayer: d.q('#dxPyl').value });
        if (res.outside) { msg.textContent = 'Avec ce système, le dessin tombe hors de France : vérifie le système de coordonnées.'; return; }
        if (!res.feats.length) { msg.textContent = 'Rien à importer : coche au moins un calque.'; return; }
        if (res.feats.length > MAX_FEATS) { msg.textContent = 'Trop d\'objets (' + res.feats.length.toLocaleString('fr-FR') + ') : décoche des calques pour passer sous ' + MAX_FEATS.toLocaleString('fr-FR') + '.'; return; }
        var use = U.picked(d.q('#dxUse')) || 'fond';
        done = true; C.closeDialog(1);
        var doc = C.addLocalDoc(U.baseName(name) + (use === 'fond' ? ' (fond de plan)' : '') + '.kmz', res.feats, { quiet: use === 'fond', hidden: res.hidden, dxf: true });
        var nPyl = C.pylonsOf(doc).length;
        U.toast('DXF importé : ' + res.feats.length.toLocaleString('fr-FR') + ' objets' + (nPyl ? ', ' + nPyl + ' pylône(s)' : '') +
          (use === 'chantier' ? '. Enregistre une version pour le mettre sur le Drive (onglet Chantier).' : ' en fond de plan.') +
          (res.dropped ? ' ' + res.dropped.toLocaleString('fr-FR') + ' objet(s) hors zone écarté(s).' : ''), 7000);
        resolve(doc);
      }
    });
  }

  // Résout avec le chantier créé, ou null si l'import est abandonné.
  D.importText = function (text, name) {
    U.busy(true, 'Lecture du DXF…');
    return new Promise(function (resolve) {
      setTimeout(function () { // laisse le temps d'afficher « Lecture du DXF… »
        var dx;
        try { dx = D.parse(text); } catch (e) { U.busy(false); U.toast('DXF illisible : ' + (e.message || e), 6000); resolve(null); return; }
        U.busy(false);
        if (!dx.ents.length) { U.toast('Ce DXF ne contient aucun objet lisible (points, lignes, polylignes, cercles, textes, blocs).', 6000); resolve(null); return; }
        dialog(dx, name, resolve);
      }, 60);
    });
  };
  D.importFile = function (file) {
    if (file.size > 60e6) { U.toast('DXF trop lourd (' + Math.round(file.size / 1e6) + ' Mo) : dans AutoCAD, garde seulement les calques utiles puis enregistre à nouveau en DXF.', 7000); return Promise.resolve(null); }
    return file.arrayBuffer().then(function (buf) { return D.importText(decode(buf), file.name); })
      .catch(function (e) { U.busy(false); U.toast('Lecture impossible de « ' + file.name + ' » : ' + (e.message || e), 6000); return null; });
  };
})();
