/* Géologie : nature du sous-sol (BRGM 1/1 000 000) dessinée sur l'appareil, feuilles 1/50 000 et notices,
   lecture des codes de la carte géologique. Données en local (data/), donc disponibles hors ligne. */
(function () {
  var C = window.Carto, U = C.u;
  var R = 6378137, MAXX = Math.PI * R;
  var G = C.geology = {};
  var litho = null, sheets = null, loading = {};

  function getJSON(name) {
    if (!loading[name]) loading[name] = fetch('data/' + name + '.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function (e) { loading[name] = null; throw e; });
    return loading[name];
  }
  function merc(lon, lat) { return [lon * Math.PI / 180 * R, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R]; }

  G.loadLitho = function () {
    if (litho) return Promise.resolve(litho);
    return getJSON('litho1m').then(function (j) {
      var polys = j.polys.map(function (p) {
        var bb = [Infinity, Infinity, -Infinity, -Infinity];
        var rings = p[1].map(function (flat) {
          var ll = [], xy = new Float64Array(flat.length);
          for (var i = 0; i < flat.length; i += 2) {
            var lon = flat[i], lat = flat[i + 1]; ll.push([lon, lat]);
            var m = merc(lon, lat); xy[i] = m[0]; xy[i + 1] = m[1];
            if (lon < bb[0]) bb[0] = lon; if (lat < bb[1]) bb[1] = lat; if (lon > bb[2]) bb[2] = lon; if (lat > bb[3]) bb[3] = lat;
          }
          return { ll: ll, xy: xy };
        });
        var mb = merc(bb[0], bb[1]), mt = merc(bb[2], bb[3]);
        return { c: p[0], rings: rings, bb: bb, mb: [mb[0], mb[1], mt[0], mt[1]] };
      });
      litho = { classes: j.classes, polys: polys };
      G.classes = j.classes;
      return litho;
    });
  };
  G.loadSheets = function () {
    if (sheets) return Promise.resolve(sheets);
    return getJSON('geol50').then(function (j) {
      sheets = j.map(function (s) {
        var ring = [], bb = [Infinity, Infinity, -Infinity, -Infinity];
        for (var i = 0; i < s[2].length; i += 2) { var x = s[2][i], y = s[2][i + 1]; ring.push([x, y]); bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)]; }
        return { n: s[0], nom: s[1], ring: ring, bb: bb };
      });
      return sheets;
    });
  };
  function inRing(lon, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  G.lithoAt = function (lat, lon) {
    return G.loadLitho().then(function (L1) {
      for (var i = 0; i < L1.polys.length; i++) {
        var p = L1.polys[i];
        if (lon < p.bb[0] || lon > p.bb[2] || lat < p.bb[1] || lat > p.bb[3]) continue;
        var inside = false;
        p.rings.forEach(function (r) { if (inRing(lon, lat, r.ll)) inside = !inside; });
        if (inside) { var k = L1.classes[p.c] || ['?', '', '#ccc']; return { code: p.c, descr: k[0], type: k[1], color: k[2] }; }
      }
      return null;
    });
  };
  G.sheetAt = function (lat, lon) {
    return G.loadSheets().then(function (S) {
      for (var i = 0; i < S.length; i++) {
        var s = S[i];
        if (lon < s.bb[0] || lon > s.bb[2] || lat < s.bb[1] || lat > s.bb[3]) continue;
        if (inRing(lon, lat, s.ring)) return { numero: s.n, nom: s.nom, notice: 'http://ficheinfoterre.brgm.fr/Notices/' + ('0000' + s.n).slice(-4) + 'N.pdf' };
      }
      return null;
    });
  };

  /* Dessin dans un canvas (tuiles de la carte et pages du PDF) */
  function draw(ctx, minx, maxy, res, w, h, alpha) {
    if (!litho) return;
    var maxx = minx + w * res, miny = maxy - h * res, edge = res < 400;
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineJoin = 'round';
    litho.polys.forEach(function (p) {
      if (p.mb[2] < minx || p.mb[0] > maxx || p.mb[3] < miny || p.mb[1] > maxy) return;
      ctx.beginPath();
      p.rings.forEach(function (r) {
        var xy = r.xy;
        for (var i = 0; i < xy.length; i += 2) {
          var px = (xy[i] - minx) / res, py = (maxy - xy[i + 1]) / res;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
      });
      ctx.fillStyle = (litho.classes[p.c] || [0, 0, '#ccc'])[2];
      ctx.fill('evenodd');
      if (edge) { ctx.strokeStyle = 'rgba(60,60,60,.55)'; ctx.lineWidth = 1; ctx.stroke(); }
    });
    ctx.restore();
  }
  G.drawView = function (ctx, view, alpha) {
    return G.loadLitho().then(function () { draw(ctx, view.cx - view.w / 2 * view.res, view.cy + view.h / 2 * view.res, view.res, view.w, view.h, alpha); }).catch(function () {});
  };
  G.GridLayer = L.GridLayer.extend({
    createTile: function (coords, done) {
      var t = document.createElement('canvas'), sz = this.getTileSize();
      t.width = sz.x; t.height = sz.y;
      var span = 2 * MAXX / Math.pow(2, coords.z), res = span / sz.x;
      var minx = -MAXX + coords.x * span, maxy = MAXX - coords.y * span;
      G.loadLitho().then(function () { draw(t.getContext('2d'), minx, maxy, res, sz.x, sz.y, 1); done(null, t); })
        .catch(function (e) { done(e, t); });
      return t;
    }
  });

  /* Fiche « Que trouve-t-on ici ? » */
  G.infoHtml = function (lat, lon) {
    return Promise.all([G.lithoAt(lat, lon).catch(function () { return null; }), G.sheetAt(lat, lon).catch(function () { return null; })]).then(function (r) {
      var li = r[0], sh = r[1], h = '<div class="card"><h4>Géologie</h4>';
      if (li) h += '<div><span class="sw"><i style="background:' + li.color + '"></i></span><b>' + U.esc(li.descr) + '</b> <span class="muted small">— ' + U.esc(li.type.toLowerCase()) + ' (nature du sous-sol simplifiée, 1/1 000 000)</span></div>';
      if (sh) h += '<div style="margin-top:6px">Feuille géologique 1/50 000 <b>n° ' + U.esc(sh.numero) + ' ' + U.esc(sh.nom) + '</b><br><a href="' + sh.notice + '" target="_blank" rel="noopener">Notice de la feuille (PDF BRGM) ↗</a> <span class="muted small">— description de chaque code (Fz, e6, j2…)</span></div>';
      if (!li && !sh) h += '<p class="muted">Hors de la France métropolitaine.</p>';
      h += '<p class="muted small" style="margin:6px 0 0">Lecture des codes : voir la légende du calque « Carte géologique » (onglet Calques).</p></div>';
      return h;
    });
  };
})();
