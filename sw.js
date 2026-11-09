/* Service worker « Carto chantiers » : démarrage instantané, appli disponible sans réseau, tuiles préparées. */
var VERSION = 'v2.6.0';
var SHELL = 'carto-shell-' + VERSION;
var SHELL_FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './vendor/leaflet.js', './vendor/leaflet.css', './vendor/jszip.min.js', './vendor/jspdf.umd.min.js', './vendor/xlsx.full.min.js',
  './js/layers.js', './js/parse.js', './js/geo.js', './js/fiche.js', './js/formats.js', './js/offline.js',
  './js/core.js', './js/geology.js', './data/litho1m.json', './data/geol50.json', './js/routes.js', './js/voice.js', './js/docs.js', './js/dxf.js', './js/fiches.js', './js/calques.js', './js/tools.js', './js/photo.js', './js/chantier.js', './js/export.js', './js/share.js', './js/pdf.js', './js/search.js', './js/main.js',
  './icons/icon-192.png', './icons/icon-512.png'
];
var DATA_HOSTS = ['data.geopf.fr', 'geobretagne.fr', 'www.georisques.gouv.fr', 'odre.opendatasoft.com', 'server.arcgisonline.com'];

self.addEventListener('install', function (e) {
  // « reload » : on prend les fichiers frais sur le serveur, pas une copie du cache HTTP
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return Promise.all(SHELL_FILES.map(function (u) { return fetch(new Request(u, { cache: 'reload' })).then(function (r) { if (!r.ok) throw new Error(u); return c.put(u, r); }); }));
  }).then(function () { return self.skipWaiting(); }));
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
function isTile(url) { return /GetTile|REQUEST=GetMap|request=GetMap|\/tile\//.test(url.href); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Appli : copie locale immédiate (démarrage instantané, même avec un réseau faible).
  // Les mises à jour arrivent avec une nouvelle version du service worker.
  if (url.origin === self.location.origin) {
    if (url.pathname.indexOf('/__data/') >= 0 || url.pathname.indexOf('/__blob/') >= 0) return;
    var shellReq = req.mode === 'navigate' ? './index.html' : req;
    e.respondWith(caches.open(SHELL).then(function (c) {
      return c.match(shellReq, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (r) { if (r && r.ok && url.search === '') c.put(req, r.clone()); return r; })
          .catch(function () { return req.mode === 'navigate' ? c.match('./index.html') : Response.error(); });
      });
    }));
    return;
  }

  // Tuiles et données publiques
  if (DATA_HOSTS.indexOf(url.hostname) >= 0) {
    e.respondWith((function () {
      // tuile déjà préparée hors ligne : affichage immédiat, sans attendre le réseau
      var cached = isTile(url) ? caches.match(req.url) : Promise.resolve(null);
      return cached.then(function (hit) {
        if (hit) return hit;
        if (self.navigator && self.navigator.onLine === false) {
          return caches.match(req.url).then(function (r) { return r || Response.error(); });
        }
        return timeout(fetch(req), 10000).then(function (r) {
          if (r && (r.ok || r.type === 'opaque')) return r;
          return caches.match(req.url).then(function (c) { return c || r; });
        }).catch(function () {
          return caches.match(req.url).then(function (r) { return r || Response.error(); });
        });
      });
    })());
  }
});
