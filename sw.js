/* Service worker « Carto chantiers » : appli disponible sans réseau + tuiles préparées. */
var VERSION = 'v2.0.0';
var SHELL = 'carto-shell-' + VERSION;
var SHELL_FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './vendor/leaflet.js', './vendor/leaflet.css', './vendor/jszip.min.js', './vendor/jspdf.umd.min.js', './vendor/xlsx.full.min.js',
  './js/layers.js', './js/parse.js', './js/geo.js', './js/fiche.js', './js/formats.js', './js/offline.js',
  './js/core.js', './js/docs.js', './js/fiches.js', './js/tools.js', './js/export.js', './js/pdf.js', './js/main.js',
  './icons/icon-192.png', './icons/icon-512.png'
];
var DATA_HOSTS = ['data.geopf.fr', 'geobretagne.fr', 'www.georisques.gouv.fr', 'odre.opendatasoft.com', 'server.arcgisonline.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('carto-shell-') === 0 && k !== SHELL; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function timeout(p, ms) {
  return new Promise(function (ok, ko) {
    var t = setTimeout(function () { ko(new Error('timeout')); }, ms);
    p.then(function (r) { clearTimeout(t); ok(r); }, function (e) { clearTimeout(t); ko(e); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Appli : réseau d'abord (pour recevoir les mises à jour), sinon copie locale.
  if (url.origin === self.location.origin) {
    if (url.pathname.indexOf('/__data/') >= 0) return; // données lues directement dans le cache par l'appli
    e.respondWith(
      timeout(fetch(req), 4000).then(function (r) {
        if (r && r.ok) { var copy = r.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
        return r;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (r) {
          if (r) return r;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
    );
    return;
  }

  // Tuiles et données publiques : en direct si possible, sinon copie « hors ligne ».
  if (DATA_HOSTS.indexOf(url.hostname) >= 0) {
    e.respondWith((function () {
      if (self.navigator && self.navigator.onLine === false) {
        return caches.match(req.url).then(function (r) { return r || Response.error(); });
      }
      return timeout(fetch(req), 8000).then(function (r) {
        if (r && (r.ok || r.type === 'opaque')) return r;
        return caches.match(req.url).then(function (c) { return c || r; });
      }).catch(function () {
        return caches.match(req.url).then(function (r) { return r || Response.error(); });
      });
    })());
  }
});
