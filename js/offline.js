/* Hors ligne : stockage des données Drive et téléchargement des tuiles autour d'un chantier. */
(function () {
  var C = window.Carto = window.Carto || {};
  var DATA_CACHE = 'carto-data';
  var BASE = new URL('./', location.href).href;

  /* ---------- Petites données (liste, fichiers, Vigicrues) ---------- */
  function dataKey(name) { return BASE + '__data/' + name; }
  C.saveData = function (name, obj) {
    if (!('caches' in window) || C.viewer) return Promise.resolve(); // consultation : rien n'est gardé
    return caches.open(DATA_CACHE).then(function (c) {
      return c.put(dataKey(name), new Response(JSON.stringify({ savedAt: new Date().toISOString(), data: obj }, function (k, v) { return k === '_layer' ? undefined : v; }),
        { headers: { 'Content-Type': 'application/json' } }));
    }).catch(function (e) { console.warn('saveData', name, e); });
  };
  C.loadData = function (name) {
    if (!('caches' in window) || C.viewer) return Promise.resolve(null);
    return caches.open(DATA_CACHE).then(function (c) { return c.match(dataKey(name)); })
      .then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
  };
  C.deleteData = function (name) {
    if (!('caches' in window)) return Promise.resolve();
    return caches.open(DATA_CACHE).then(function (c) { return c.delete(dataKey(name)); }).catch(function () {});
  };

  /* ---------- Registre des chantiers préparés ---------- */
  function reg() { try { return JSON.parse(localStorage.getItem('carto.offline') || '{}'); } catch (e) { return {}; } }
  function setReg(r) { try { localStorage.setItem('carto.offline', JSON.stringify(r)); } catch (e) {} }
  C.offlineRegistry = reg;
  C.removeOffline = function (fileId) {
    var r = reg(); delete r[fileId]; setReg(r);
    return caches.delete('tiles-' + fileId);
  };

  /* ---------- Calcul des tuiles autour des éléments du fichier ---------- */
  function lonLatToTile(lon, lat, z) {
    var n = Math.pow(2, z);
    var x = (lon + 180) / 360 * n;
    var latR = lat * Math.PI / 180;
    var y = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
    return [Math.floor(x), Math.floor(y)];
  }
  function dist(a, b) {
    var R = 6371000, toR = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  // Suites de points [lat, lon] représentant le fichier (points, lignes, contours).
  C.geometryOf = function (data) {
    var seqs = [];
    data.points.forEach(function (p) { seqs.push([[p.lat, p.lon]]); });
    data.lines.forEach(function (l) { seqs.push(l.coords); });
    data.polys.forEach(function (p) { seqs.push(p.rings[0]); });
    return seqs;
  };
  C.tilesAround = function (seqs, z, bufferM) {
    var set = new Set();
    var lat0 = 46;
    seqs.some(function (s) { if (s.length) { lat0 = s[0][0]; return true; } return false; });
    var m = 40075016.686 * Math.cos(lat0 * Math.PI / 180) / Math.pow(2, z); // largeur d'une tuile (m)
    var r = Math.ceil(bufferM / m);
    var step = Math.max(10, Math.min(m / 2, 200));
    var n = Math.pow(2, z);
    function addAround(p) {
      var t = lonLatToTile(p[1], p[0], z);
      for (var dx = -r; dx <= r; dx++) for (var dy = -r; dy <= r; dy++) {
        if (dx * dx + dy * dy > (r + 0.75) * (r + 0.75)) continue;
        var x = t[0] + dx, y = t[1] + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        set.add(x + '/' + y);
      }
    }
    seqs.forEach(function (s) {
      for (var i = 0; i < s.length; i++) {
        addAround(s[i]);
        if (i + 1 < s.length) {
          var d = dist(s[i], s[i + 1]), k = Math.floor(d / step);
          for (var j = 1; j < k; j++) {
            var f = j / k;
            addAround([s[i][0] + (s[i + 1][0] - s[i][0]) * f, s[i][1] + (s[i + 1][1] - s[i][1]) * f]);
          }
        }
      }
    });
    return Array.from(set).map(function (k) { var a = k.split('/'); return [+a[0], +a[1]]; });
  };
  C.bboxOf = function (seqs, bufferM) {
    var s = 90, w = 180, n = -90, e = -180;
    seqs.forEach(function (q) { q.forEach(function (p) { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }); });
    var dLat = bufferM / 111320, dLon = bufferM / (111320 * Math.cos(((s + n) / 2) * Math.PI / 180));
    return { s: s - dLat, w: w - dLon, n: n + dLat, e: e + dLon };
  };

  /* ---------- Plan de téléchargement ---------- */
  // jobs : [{ def, minZ, maxZ, avgKB }] ; extraUrls : URL supplémentaires (Vigicrues, végétation…)
  C.planDownload = function (seqs, jobs, bufferM) {
    var urls = new Set(), estKB = 0, cacheByZ = {};
    jobs.forEach(function (j) {
      for (var z = j.minZ; z <= j.maxZ; z++) {
        if (!cacheByZ[z]) cacheByZ[z] = C.tilesAround(seqs, z, bufferM);
        cacheByZ[z].forEach(function (t) {
          var u = C.tileUrl(j.def, z, t[0], t[1]);
          if (!urls.has(u)) { urls.add(u); estKB += (j.avgKB || 5); }
        });
      }
    });
    return { urls: Array.from(urls), estKB: estKB };
  };

  /* ---------- Téléchargement ---------- */
  C.download = function (fileId, meta, urls, onProgress, isCancelled) {
    var cacheName = 'tiles-' + fileId;
    var done = 0, failed = 0, bytes = 0, i = 0, total = urls.length;
    return caches.open(cacheName).then(function (cache) {
      function worker() {
        if (isCancelled()) return Promise.resolve();
        if (i >= total) return Promise.resolve();
        var u = urls[i++];
        return cache.match(u).then(function (hit) {
          if (hit) return hit.blob().then(function (b) { bytes += b.size; });
          return fetchRetry(u, 2).then(function (resp) {
            return resp.clone().blob().then(function (b) { bytes += b.size; return cache.put(u, resp); });
          });
        }).catch(function () { failed++; }).then(function () {
          done++; onProgress(done, total, bytes, failed);
          return worker();
        });
      }
      var pool = []; for (var k = 0; k < 6; k++) pool.push(worker());
      return Promise.all(pool);
    }).then(function () {
      if (isCancelled()) return { cancelled: true, done: done, total: total, bytes: bytes, failed: failed };
      var r = reg();
      r[fileId] = { name: meta.name, date: new Date().toISOString(), tiles: total, failed: failed, bytes: bytes, layers: meta.layers };
      setReg(r);
      return { done: done, total: total, bytes: bytes, failed: failed };
    });
  };
  function fetchRetry(u, n) {
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : null;
    return fetch(u, { mode: 'cors', credentials: 'omit', signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (t) clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    }).catch(function (e) {
      if (n > 0) return new Promise(function (ok) { setTimeout(ok, 700); }).then(function () { return fetchRetry(u, n - 1); });
      throw e;
    });
  }
})();
