/* Carto chantiers — recherche d'un lieu : adresse, commune, lieu-dit (IGN Géoplateforme), coordonnées GPS ou Lambert 93. */
(function () {
  var C = window.Carto, U = C.u, map = C.map, $ = function (id) { return document.getElementById(id); }, esc = U.esc;
  var AERIAL = { ortho: 1, esri: 1, irc: 1, histo: 1 };
  var ICON = { housenumber: '🏠', street: '🛣', municipality: '🏘', administratif: '🏘', 'lieu-dit habité': '📍', 'lieu-dit non habité': '📍' };

  function num(s) { return parseFloat(String(s).replace(',', '.')); }
  // « 44.91, -0.53 » · « 44,91 -0,53 » · « 44°54'45"N 0°31'57"W » · « 419373 6433824 » (Lambert 93)
  function parseCoords(q) {
    var t = q.trim();
    var dms = t.match(/(\d{1,3})[°\s]+(\d{1,2})['’\s]+(\d{1,2}(?:[.,]\d+)?)["”]?\s*([NS])[\s,;]+(\d{1,3})[°\s]+(\d{1,2})['’\s]+(\d{1,2}(?:[.,]\d+)?)["”]?\s*([EOW])/i);
    if (dms) {
      var la = +dms[1] + dms[2] / 60 + num(dms[3]) / 3600, lo = +dms[5] + dms[6] / 60 + num(dms[7]) / 3600;
      if (/S/i.test(dms[4])) la = -la; if (/[OW]/i.test(dms[8])) lo = -lo;
      return { lat: la, lon: lo, label: 'Coordonnées GPS' };
    }
    var m = t.match(/^(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
    if (m && (m[1].indexOf('.') >= 0 || m[2].indexOf('.') >= 0 || /\s/.test(t) || (m[1].split(',').length === 2 && m[2].split(',').length === 2))) {
      var a = num(m[1]), b = num(m[2]);
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b, label: 'Coordonnées GPS' };
    }
    var l = t.replace(/\s(?=\d{3}\b)/g, '').match(/^(\d{6}(?:[.,]\d+)?)\s*[,;\s]\s*(\d{7}(?:[.,]\d+)?)$/) || t.match(/^(\d{6}(?:[.,]\d+)?)\s*[,;\s]\s*(\d{7}(?:[.,]\d+)?)$/);
    if (l) {
      var x = num(l[1]), y = num(l[2]);
      if (x > 50000 && x < 1300000 && y > 6000000 && y < 7200000) { var w = C.geo.L93.toWGS(x, y); return { lat: w[0], lon: w[1], label: 'Lambert 93' }; }
    }
    return null;
  }
  function zoomFor(r) {
    if (r.kind === 'housenumber' || r.coords) return 19;
    if (r.kind === 'street') return 17;
    if (r.kind === 'municipality' || r.kind === 'administratif') return 14;
    return 16;
  }
  function recent() { return U.storeJSON('recentSearch') || []; }
  function remember(r) {
    var list = recent().filter(function (x) { return x.text !== r.text; });
    list.unshift({ text: r.text, sub: r.sub, lat: r.lat, lon: r.lon, kind: r.kind, coords: r.coords });
    U.storeJSON('recentSearch', list.slice(0, 8));
  }

  function go(r) {
    remember(r);
    C.closeDialog(1);
    if (!AERIAL[C.curBase]) { C.setBase('ortho'); C.refreshTab('calques'); }
    var ll = L.latLng(r.lat, r.lon);
    map.setView(ll, zoomFor(r));
    setTimeout(function () { C.showTarget(ll, r.text); }, 280);
  }

  C.searchDialog = function () {
    var d = C.openDialog({ title: 'Rechercher un lieu', top: true, body:
      '<div class="srch"><input type="search" id="srQ" placeholder="Adresse, lieu ou coordonnées" autocomplete="off" enterkeyhint="search"></div>' +
      '<p class="muted small srch-hint">Exemples : <i>45 route de Sangué Prémery</i> · <i>44.9127, -0.5302</i> · <i>419373 6433824</i> (Lambert 93)</p>' +
      '<div id="srList"></div>' });
    var q = d.q('#srQ'), list = d.q('#srList'), results = [], seq = 0;
    function draw(items, empty) {
      results = items;
      list.innerHTML = items.length ? items.map(function (r, i) {
        return '<button class="list-item" data-i="' + i + '"><span class="item-ico">' + (r.icon || '📍') + '</span><span class="grow"><span class="item-title">' + esc(r.text) + '</span>' + (r.sub ? '<span class="item-sub">' + esc(r.sub) + '</span>' : '') + '</span></button>';
      }).join('') : (empty ? '<p class="muted">' + empty + '</p>' : '');
      list.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { go(results[+b.getAttribute('data-i')]); }; });
    }
    function showRecent() {
      var r = recent();
      draw(r.map(function (x) { return { text: x.text, sub: x.sub || 'Recherche récente', lat: x.lat, lon: x.lon, kind: x.kind, coords: x.coords, icon: '🕘' }; }), '');
      if (r.length) list.insertAdjacentHTML('afterbegin', '<div class="card-sub">Recherches récentes</div>');
    }
    var run = U.debounce(function () {
      var text = q.value.trim(), my = ++seq;
      if (!text) { showRecent(); return; }
      var c = parseCoords(text);
      if (c) { draw([{ text: c.lat.toFixed(6) + ', ' + c.lon.toFixed(6), sub: c.label, lat: c.lat, lon: c.lon, coords: true, icon: '🎯' }]); return; }
      if (text.length < 3) { draw([], 'Tape au moins 3 caractères.'); return; }
      if (!U.isOnline()) { draw([], 'La recherche d\'adresse demande du réseau. Les coordonnées GPS ou Lambert 93 marchent hors ligne.'); return; }
      list.innerHTML = '<p class="muted">Recherche…</p>';
      var u = 'https://data.geopf.fr/geocodage/completion?text=' + encodeURIComponent(text) + '&type=StreetAddress,PositionOfInterest&maximumResponses=8';
      U.withTimeout(fetch(u), 12000).then(function (r) { return r.json(); }).then(function (j) {
        if (my !== seq) return;
        var items = (j.results || []).map(function (r) {
          var parts = String(r.fulltext || '').split(', ');
          var kind = r.kind || '';
          var typ = r.poiType && r.poiType[0] && r.poiType[0] !== kind ? r.poiType[0] : '';
          return { text: parts[0], sub: parts.slice(1).join(', ') + (kind && kind !== 'housenumber' && kind !== 'street' ? ' · ' + (typ || kind) : ''), lat: r.y, lon: r.x, kind: kind, icon: ICON[kind] || (r.country === 'PositionOfInterest' ? '📍' : '🏠') };
        });
        draw(items, 'Aucun résultat. Essaie avec la commune ou le code postal.');
      }).catch(function () { if (my === seq) draw([], 'Service de recherche indisponible pour l\'instant. Réessaie.'); });
    }, 250);
    q.addEventListener('input', run);
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (results[0]) go(results[0]); else run(); } });
    showRecent();
    setTimeout(function () { q.focus(); }, 120);
  };

  $('btnSearch').addEventListener('click', C.searchDialog);
  // raccourci clavier à l'ordinateur : « / » ou Ctrl+F ouvre la recherche
  document.addEventListener('keydown', function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) { e.preventDefault(); C.searchDialog(); }
  });
  C.parseCoords = parseCoords;
})();
