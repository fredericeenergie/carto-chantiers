/* Carto chantiers — recherche d'un lieu : adresse, commune, lieu-dit (IGN Géoplateforme), coordonnées GPS ou Lambert 93,
   et parcelle cadastrale par commune + section + numéro (API Carto IGN). */
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

  /* ---- Parcelle cadastrale : contour sur la carte, référence et surface dans la fiche ---- */
  function showParcel(f) {
    var p = f.properties || {};
    var layer = L.geoJSON(f, { style: { color: '#d81b60', weight: 3, fillColor: '#d81b60', fillOpacity: 0.12 }, interactive: false });
    var b = layer.getBounds(), c = b.getCenter();
    C.closeDialog(1);
    map.fitBounds(b, { padding: [60, 60], maxZoom: 19 });
    var html = '<div class="card"><h4>Parcelle cadastrale</h4><div><b>' + esc(C.parcelRef(p)) + '</b>' + (p.contenance ? ' · ' + U.fmtArea(+p.contenance) : '') + '</div>' +
      (p.idu ? '<div class="small">Identifiant : ' + esc(p.idu) + '</div>' : '') + '</div>';
    setTimeout(function () { C.showTarget(c, 'Parcelle ' + String(p.section || '').replace(/^0+/, '') + ' ' + String(p.numero || '').replace(/^0+/, ''), html, layer); }, 300);
  }

  C.searchDialog = function () {
    var d = C.openDialog({ title: 'Rechercher un lieu', top: true, body:
      '<div class="seg" id="srMode"><button data-val="lieu" class="on">Adresse ou coordonnées</button><button data-val="parcelle">Parcelle</button></div>' +
      '<div id="srLieu"><div class="srch"><input type="search" id="srQ" placeholder="Adresse, lieu ou coordonnées" autocomplete="off" enterkeyhint="search"></div>' +
      '<p class="muted small srch-hint">Exemples : <i>45 route de Sangué Prémery</i> · <i>44.9127, -0.5302</i> · <i>419373 6433824</i> (Lambert 93)</p>' +
      '<div id="srList"></div></div>' +
      '<div id="srParc" hidden><label class="field"><span>Commune</span><input type="text" id="srCom" placeholder="Nom ou code postal" autocomplete="off"></label><div id="srComList"></div>' +
      '<div class="row"><label class="field"><span>Section</span><input type="text" id="srSec" placeholder="ex. A ou ZB" maxlength="2" autocomplete="off" autocapitalize="characters"></label>' +
      '<label class="field"><span>Numéro</span><input type="text" id="srNum" inputmode="numeric" placeholder="ex. 12" maxlength="4" autocomplete="off"></label></div>' +
      '<button class="btn primary big" id="srParcGo">Chercher la parcelle</button><div id="srParcMsg" class="muted srch-hint"></div></div>' });
    U.pickOne(d.q('#srMode'), function (v) {
      d.q('#srLieu').hidden = v !== 'lieu'; d.q('#srParc').hidden = v !== 'parcelle';
      setTimeout(function () { (v === 'lieu' ? q : (com ? d.q('#srSec') : comIn)).focus(); }, 80);
    });

    /* --- Adresse, lieu, coordonnées --- */
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

    /* --- Parcelle : commune, section, numéro (la dernière commune est proposée d'office) --- */
    var com = U.storeJSON('lastCommune') || null, comSeq = 0, found = [];
    function plain(t) { return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase(); }
    function pick(c) { com = { code: c.code, nom: c.nom }; comIn.value = c.nom; comList.innerHTML = ''; found = []; U.storeJSON('lastCommune', com); }
    // Paris, Lyon, Marseille : le cadastre se range par arrondissement
    function cadastreArea(code) {
      if (!/^(751\d\d|6938\d|132\d\d)$/.test(code)) return 'code_insee=' + code;
      return 'code_insee=' + ({ 75: '75056', 69: '69123', 13: '13055' })[code.slice(0, 2)] + '&code_arr=' + code.slice(2);
    }
    var comIn = d.q('#srCom'), comList = d.q('#srComList'), msg = d.q('#srParcMsg');
    if (com) comIn.value = com.nom;
    comIn.addEventListener('input', U.debounce(function () {
      var t = comIn.value.trim(), my = ++comSeq; com = null; found = [];
      if (t.length < 2) { comList.innerHTML = ''; return; }
      var u = 'https://geo.api.gouv.fr/communes?' + (/^\d{5}$/.test(t) ? 'codePostal=' + t : 'nom=' + encodeURIComponent(t) + '&boost=population') + '&type=commune-actuelle,arrondissement-municipal&fields=nom,code,codesPostaux&limit=6';
      U.withTimeout(fetch(u), 10000).then(function (r) { return r.json(); }).then(function (res) {
        if (my !== comSeq) return;
        found = Array.isArray(res) ? res : [];
        comList.innerHTML = found.map(function (c, i) {
          return '<button class="list-item" data-i="' + i + '"><span class="item-ico">🏘</span><span class="grow"><span class="item-title">' + esc(c.nom) + '</span><span class="item-sub">' + esc((c.codesPostaux || []).slice(0, 2).join(', ')) + '</span></span></button>';
        }).join('') || '<p class="muted">Commune introuvable.</p>';
        comList.querySelectorAll('[data-i]').forEach(function (b) {
          b.onclick = function () { pick(found[+b.getAttribute('data-i')]); d.q('#srSec').focus(); };
        });
      }).catch(function () { if (my === comSeq) comList.innerHTML = '<p class="muted">Recherche de commune indisponible.</p>'; });
    }, 250));
    function findParcel() {
      var sec = d.q('#srSec').value.trim().toUpperCase(), n = d.q('#srNum').value.trim();
      // commune tapée en entier sans toucher la liste : prise si elle est la seule à porter ce nom
      if (!com && found.length) { var same = found.filter(function (c) { return plain(c.nom) === plain(comIn.value); }); if (same.length === 1 || found.length === 1) pick(same[0] || found[0]); }
      if (!com) { msg.textContent = comIn.value.trim() ? 'Choisis la commune dans la liste.' : 'Indique la commune.'; return; }
      if (!/^[0-9A-Z]{1,2}$/.test(sec) || !/^\d{1,4}$/.test(n)) { msg.textContent = 'Section : 1 ou 2 lettres (A, ZB…). Numéro : 1 à 4 chiffres.'; return; }
      if (!U.isOnline()) { msg.textContent = 'La recherche de parcelle demande du réseau.'; return; }
      msg.textContent = 'Recherche…';
      var u = 'https://apicarto.ign.fr/api/cadastre/parcelle?' + cadastreArea(com.code) + '&section=' + sec.padStart(2, '0') + '&numero=' + n.padStart(4, '0');
      U.withTimeout(fetch(u), 15000).then(function (r) { return r.json(); }).then(function (j) {
        var fs = (j && j.features) || [];
        if (!fs.length) { msg.textContent = 'Parcelle introuvable dans ' + com.nom + ' : vérifie la section et le numéro.'; return; }
        if (fs.length === 1) { showParcel(fs[0]); return; }
        // même section et même numéro dans des communes fusionnées : on laisse choisir
        msg.innerHTML = '<div class="card-sub">Plusieurs parcelles portent cette référence :</div>' + fs.map(function (f, i) {
          var p = f.properties || {};
          return '<button class="list-item" data-i="' + i + '"><span class="grow"><span class="item-title">' + esc(p.idu || C.parcelRef(p)) + '</span><span class="item-sub">' + (p.contenance ? U.fmtArea(+p.contenance) : '') + '</span></span></button>';
        }).join('');
        msg.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { showParcel(fs[+b.getAttribute('data-i')]); }; });
      }).catch(function () { msg.textContent = 'Service du cadastre indisponible pour l\'instant. Réessaie.'; });
    }
    d.q('#srParcGo').onclick = findParcel;
    d.q('#srNum').onkeydown = d.q('#srSec').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); findParcel(); } };
  };

  $('btnSearch').addEventListener('click', C.searchDialog);
  // raccourci clavier à l'ordinateur : « / » ou Ctrl+F ouvre la recherche
  document.addEventListener('keydown', function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) { e.preventDefault(); C.searchDialog(); }
  });
  C.parseCoords = parseCoords;
})();
