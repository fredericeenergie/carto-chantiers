/* Carto chantiers — onglets Carte et Calques, hors ligne, paquets chantier, réglages, démarrage. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, esc = U.esc, map = C.map;

  /* ======================= Onglet Calques ======================= */
  C.tabs.calques = function (el) {
    var act = Object.keys(C.active);
    var openG = U.storeJSON('openGroups') || {};
    var html = '<div class="row2" style="margin-top:6px"><b style="flex:1">Affichés (' + act.length + ')</b>' + (act.length ? '<button class="btn ghost" id="lyNone">Tout masquer</button>' : '') + '</div>';
    html += act.length ? act.map(function (id) {
      var it = C.ITEMS[id];
      var op = (U.storeJSON('opacity') || {})[id]; if (op == null) op = it.opacity || 1;
      return '<div class="legend-card"><div class="row2"><b style="flex:1">' + esc(it.label) + '</b><button class="ico-btn" data-off="' + id + '" title="Masquer">×</button></div>' +
        '<div class="muted small">' + esc(id === 'vigicrues' && C.vigiInfo ? 'Vigicrues — bulletin du ' + U.fmtDate(C.vigiInfo.bulletin, true) + (C.vigiInfo.live ? '' : ' (copie)') : it.src) + (it.minZoom ? ' · visible à partir du zoom ' + it.minZoom : '') + '</div>' +
        '<div class="legend">' + C.legendHtml(it) + '</div>' +
        (it.defs ? '<label class="row2 small muted" style="gap:6px">Opacité<input class="op" type="range" min="0.2" max="1" step="0.05" value="' + op + '" data-op="' + id + '" style="flex:1"></label>' : '') + '</div>';
    }).join('') : '<p class="muted">Aucun calque affiché. Choisis ci-dessous.</p>';
    html += '<h3>Tous les calques</h3>' + C.GROUPS.map(function (g) {
      var n = g.items.filter(function (it) { return C.active[it.id]; }).length;
      return '<div class="grp' + (openG[g.id] ? ' open' : '') + '" data-g="' + g.id + '"><button type="button"><span>' + esc(g.label) + '</span>' + (n ? '<span class="n">' + n + '</span>' : '') + '<span class="chev">›</span></button><div class="items">' +
        g.items.map(function (it) {
          return '<label class="check"><input type="checkbox" data-id="' + it.id + '"' + (C.active[it.id] ? ' checked' : '') + '><span class="grow">' + esc(it.label) +
            (it.hint ? '<span class="hint">' + esc(it.hint) + '</span>' : '') + '<span class="src">' + esc(it.src) + '</span></span></label>';
        }).join('') + '</div></div>';
    }).join('') + '<p class="muted small" style="margin-top:12px">Données publiques indicatives : elles ne remplacent jamais une DT-DICT.</p>';
    el.innerHTML = html;
    el.querySelectorAll('.grp > button').forEach(function (b) {
      b.onclick = function () { var g = b.parentNode; g.classList.toggle('open'); openG[g.getAttribute('data-g')] = g.classList.contains('open'); U.storeJSON('openGroups', openG); };
    });
    el.querySelectorAll('[data-id]').forEach(function (c) { c.onchange = function () { C.setActive(c.getAttribute('data-id'), c.checked); setTimeout(function () { C.tabs.calques(el); }, 50); }; });
    el.querySelectorAll('[data-off]').forEach(function (b) { b.onclick = function () { C.setActive(b.getAttribute('data-off'), false); C.tabs.calques(el); }; });
    el.querySelectorAll('[data-op]').forEach(function (r) { r.oninput = function () { C.setOpacity(r.getAttribute('data-op'), +r.value); }; });
    if ($('lyNone')) $('lyNone').onclick = function () { Object.keys(C.active).forEach(function (id) { C.setActive(id, false); }); C.tabs.calques(el); };
    // les couleurs relevées sur les tuiles apparaissent quand celles-ci sont chargées
    if (act.some(function (id) { return !C.legendUrls(C.ITEMS[id]).length && C.ITEMS[id].defs; })) {
      clearTimeout(C._legT); C._legT = setTimeout(function () { if (el.classList.contains('on')) el.querySelectorAll('.legend-card').forEach(function (card, i) { var it = C.ITEMS[act[i]]; if (it && it.defs && !C.legendUrls(it).length) card.querySelector('.legend').innerHTML = C.legendHtml(it); }); }, 2500);
    }
  };
  map.on('zoomend', function () { C.refreshTab('calques'); });

  /* ======================= Onglet Carte ======================= */
  C.tabs.carte = function (el) {
    var reg = C.offlineRegistry(), a = C.activeDoc();
    var html = '<h3>Fond de carte</h3><div class="tiles">' + C.BASES.map(function (b) {
      return '<button class="tile' + (C.curBase === b.id ? ' on' : '') + '" data-base="' + b.id + '"><span class="e">' + (b.id === 'plan' ? '🗺' : '🛰') + '</span><b>' + esc(b.label) + '</b><span>' + esc(b.hint) + '</span></button>';
    }).join('') + '</div>';
    html += '<h3>Hors ligne</h3><div class="card" style="margin-top:0">' + (a ? '<div class="row2"><b style="flex:1">' + esc(U.baseName(a.name)) + '</b>' + (reg[C.docKey(a)] ? '<span class="tag ok">prêt</span>' : '<span class="tag grey">non préparé</span>') + '</div>' +
      (reg[C.docKey(a)] ? '<div class="muted small">Préparé le ' + U.fmtDate(reg[C.docKey(a)].date, true) + ' — ' + U.fmtBytes(reg[C.docKey(a)].bytes) + '</div>' : '') +
      '<div class="row2" style="margin-top:8px"><button class="btn primary" data-t="offline">⬇ ' + (reg[C.docKey(a)] ? 'Mettre à jour' : 'Préparer hors ligne') + '</button></div>' : '<p class="muted">Ouvre un chantier pour le préparer hors ligne.</p>') + '</div>';
    html += '<div class="card"><div class="row2"><b style="flex:1">📦 Paquets chantier</b><button class="btn" data-t="paquets">Ouvrir</button></div><div class="muted small">Prépare au bureau la liste des fichiers et calques à emporter ; le téléphone télécharge tout d\'un bouton.</div></div>';
    var others = Object.keys(reg).filter(function (k) { return !a || k !== C.docKey(a); });
    if (others.length) html += '<div class="muted small" style="margin-top:6px">Aussi prêts hors ligne : ' + others.map(function (k) { return esc(U.baseName(reg[k].name)); }).join(', ') + ' <button class="btn ghost" data-t="offlist">Gérer</button></div>';
    html += '<h3>Réglages</h3><div class="tiles">' + C.tools.tile('settings', '⚙', 'Porte Drive', C.porteConfigured() ? 'Réglée ✓' : 'À régler') + C.tools.tile('logo', '🖼', 'Logo et éditeur', U.store('logo') ? 'Logo enregistré' : 'Pour les PDF') + '</div>' +
      '<p class="muted small" style="margin-top:12px">Carto chantiers ' + C.VERSION + '</p>';
    el.innerHTML = html;
    el.querySelectorAll('[data-base]').forEach(function (b) { b.onclick = function () { C.setBase(b.getAttribute('data-base')); C.tabs.carte(el); }; });
    el.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-t');
        if (k === 'offline') offlineDialog(a);
        if (k === 'offlist') offlineList();
        if (k === 'paquets') paquetsDialog();
        if (k === 'settings') settingsDialog();
        if (k === 'logo') logoDialog();
      };
    });
  };

  /* ======================= Hors ligne ======================= */
  var BUFFER = 1000, dl = null;
  function offlineJobs(o) {
    var jobs = [];
    C.BASES.forEach(function (b) { if (!b.noOffline && o.bases[b.id]) jobs.push({ def: b.def, minZ: 10, maxZ: b.offline, avgKB: b.avgKB }); });
    o.items.forEach(function (id) {
      var it = C.ITEMS[id]; if (!it || !it.defs) return;
      it.defs.forEach(function (d) {
        var minZ = Math.max(10, d.native[0], it.minZoom || 0), maxZ = Math.min(it.offline || 16, d.native[1]);
        if (maxZ >= minZ) jobs.push({ def: d, minZ: minZ, maxZ: maxZ, avgKB: it.avgKB || 5 });
      });
    });
    return jobs;
  }
  function chantierSeqs(a) {
    var docs = [a]; var t = C.terrainOf(a); if (t) docs.push(t);
    var seqs = [];
    docs.forEach(function (d) { seqs = seqs.concat(C.geometryOf(C.asParsed(d))); });
    return seqs;
  }
  function offlinePlan(a, o) {
    var seqs = chantierSeqs(a), plan = C.planDownload(seqs, offlineJobs(o), BUFFER);
    var z12 = C.tilesAround(seqs, 12, BUFFER);
    if (o.items.indexOf('veg_rte') >= 0) z12.forEach(function (t) { plan.urls.push(C.vegUrl(t[0], t[1])); plan.estKB += 20; });
    if (o.items.indexOf('rte_num') >= 0) z12.forEach(function (t) { plan.urls.push(C.rteNumTileUrl(t[0], t[1])); plan.estKB += 10; });
    // légendes officielles des calques
    o.items.forEach(function (id) { if (C.ITEMS[id]) C.legendUrls(C.ITEMS[id]).forEach(function (u) { plan.urls.push(u); }); });
    return plan;
  }
  function offlineDialog(a, preset) {
    if (!a) return;
    var reg = C.offlineRegistry()[C.docKey(a)];
    var act = Object.keys(C.active).filter(function (id) { return C.ITEMS[id].special !== 'vigicrues'; });
    var d = C.openDlg({ title: 'Hors ligne — ' + U.baseName(a.name), body:
      (reg ? '<p class="muted">Prêt depuis le ' + U.fmtDate(reg.date, true) + ' — ' + U.fmtBytes(reg.bytes) + (reg.failed ? ' (' + reg.failed + ' tuiles manquantes)' : '') + '</p>' : '') +
      '<p class="muted">Télécharge tout dans un rayon de 1 km autour du chantier et de ses ajouts terrain. Le fichier, les fiches et le dernier bulletin Vigicrues sont aussi gardés.</p>' +
      '<label class="check"><input type="checkbox" id="ofOrtho" checked><span class="grow">Satellite IGN</span></label>' +
      '<label class="check"><input type="checkbox" id="ofPlan" checked><span class="grow">Carte IGN</span></label>' +
      '<label class="check"><input type="checkbox" id="ofActive" checked><span class="grow">Calques affichés (' + act.length + ')<span class="hint">' + esc(act.map(function (id) { return C.ITEMS[id].label; }).join(', ') || 'aucun') + '</span></span></label>' +
      '<label class="check"><input type="checkbox" id="ofAll"><span class="grow">Tous les autres calques aussi</span></label>' +
      '<p class="muted" id="ofEst">Estimation…</p><div id="ofProg"></div>',
      foot: '<button class="btn primary" id="ofGo">' + (reg ? 'Mettre à jour' : 'Préparer hors ligne') + '</button>' + (reg ? '<button class="btn danger" id="ofDel">Supprimer</button>' : '') });
    function opts() {
      var items = [];
      if (d.q('#ofActive').checked) items = items.concat(act);
      if (d.q('#ofAll').checked) items = items.concat(Object.keys(C.ITEMS));
      items = items.filter(function (v, i, arr) { return arr.indexOf(v) === i && C.ITEMS[v].special !== 'vigicrues'; });
      return { bases: { ortho: d.q('#ofOrtho').checked, plan: d.q('#ofPlan').checked }, items: items };
    }
    function est() { var p = offlinePlan(a, opts()); d.q('#ofEst').textContent = '≈ ' + p.urls.length.toLocaleString('fr-FR') + ' tuiles, environ ' + U.fmtBytes(p.estKB * 1024) + ' (estimation).'; }
    d.body.addEventListener('change', est); setTimeout(est, 30);
    if (d.q('#ofDel')) d.q('#ofDel').onclick = function () { C.removeOffline(C.docKey(a)).then(function () { C.closeDlg(1); C.refreshTab('carte'); }); };
    function go() {
      if (!U.isOnline()) { U.toast('Il faut du réseau pour préparer le hors ligne'); return; }
      var o = opts(), p = offlinePlan(a, o);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      if (C.active.vigicrues) C.refreshVigicrues();
      d.q('#ofGo').disabled = true;
      dl = { cancel: false };
      d.q('#ofProg').innerHTML = '<div class="prog"><div id="dlBar"></div></div><p class="muted" id="dlTxt">Démarrage…</p><button class="btn danger" id="dlStop">Arrêter</button>';
      d.q('#dlStop').onclick = function () { dl.cancel = true; };
      C.download(C.docKey(a), { name: a.name, layers: o.items }, p.urls, function (done, total, bytes, failed) {
        var bar = $('dlBar'), t = $('dlTxt'); if (!bar) return;
        bar.style.width = Math.round(done / total * 100) + '%';
        t.textContent = done.toLocaleString('fr-FR') + ' / ' + total.toLocaleString('fr-FR') + ' — ' + U.fmtBytes(bytes) + (failed ? ' — ' + failed + ' échecs' : '') + '. Garde l\'appli ouverte.';
      }, function () { return dl && dl.cancel; }).then(function (res) {
        dl = null;
        U.toast(res.cancelled ? 'Préparation arrêtée (le déjà reçu est gardé)' : '« ' + U.baseName(a.name) + ' » prêt hors ligne (' + U.fmtBytes(res.bytes) + ')', 5000);
        C.closeDlg(1); C.refreshTab('carte');
      }).catch(function (e) { dl = null; U.toast('Échec : ' + (e.message || e), 5000); });
    }
    d.q('#ofGo').onclick = go;
    if (preset) { d.q('#ofAll').checked = !!preset.all; est(); go(); }
  }
  C.offlineDialog = offlineDialog;
  function offlineList() {
    var reg = C.offlineRegistry();
    var d = C.openDlg({ title: 'Chantiers prêts hors ligne', body: Object.keys(reg).map(function (k) {
      return '<div class="list-item"><span class="grow"><span class="t">' + esc(U.baseName(reg[k].name)) + '</span><span class="s">' + U.fmtDate(reg[k].date, true) + ' — ' + U.fmtBytes(reg[k].bytes) + '</span></span><button class="btn danger" data-del="' + esc(k) + '">Supprimer</button></div>';
    }).join('') + '<p class="muted" id="olSt"></p>' });
    d.qa('[data-del]').forEach(function (b) { b.onclick = function () { C.removeOffline(b.getAttribute('data-del')).then(function () { C.closeDlg(1); offlineList(); C.refreshTab('carte'); }); }; });
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { d.q('#olSt').textContent = 'Espace utilisé par l\'appli : ' + U.fmtBytes(e.usage || 0); });
  }

  /* ======================= Paquets chantier ======================= */
  function paquetsDialog() {
    var d = C.openDlg({ title: 'Paquets chantier', body: '<p class="muted">Un paquet = les fichiers ouverts + les calques affichés + le fond. Crée-le au bureau ; sur le téléphone, « Télécharger » ouvre tout et prépare le hors ligne.</p><div id="pqList"><div class="empty">Lecture…</div></div>',
      foot: '<button class="btn primary big" id="pqNew">＋ Créer un paquet avec l\'état actuel</button>' });
    function load() {
      C.callPorte('paquets').then(function (j) { draw(j.paquets); }).catch(function (e) { d.q('#pqList').innerHTML = '<div class="empty">' + esc(e.message || e) + '</div>'; });
    }
    function draw(list) {
      d.q('#pqList').innerHTML = list.length ? list.map(function (p, i) {
        return '<div class="card"><div class="row2"><b style="flex:1">📦 ' + esc(p.nom) + '</b><span class="muted small">' + U.fmtDate(p.date) + '</span></div>' +
          '<div>' + p.fichiers.map(function (f) { return esc(U.baseName(f.name)); }).join(', ') + '</div><div class="muted small">' + p.calques.length + ' calque(s) · fond ' + esc(p.fond) + (p.tous ? ' · tous les calques hors ligne' : '') + '</div>' +
          '<div class="row2" style="margin-top:8px"><button class="btn primary" data-get="' + i + '">⬇ Télécharger</button><button class="btn danger" data-rm="' + i + '">Supprimer</button></div></div>';
      }).join('') : '<div class="empty">Aucun paquet pour l\'instant.</div>';
      d.qa('[data-get]').forEach(function (b) { b.onclick = function () { C.closeDlg(1); applyPaquet(list[+b.getAttribute('data-get')]); }; });
      d.qa('[data-rm]').forEach(function (b) { b.onclick = function () { C.postPorte('paquetSupprimer', { nom: list[+b.getAttribute('data-rm')].nom }).then(function (j) { draw(j.paquets); }); }; });
    }
    d.q('#pqNew').onclick = function () {
      var a = C.activeDoc();
      var files = C.docs.filter(function (x) { return x.role !== 'terrain' && x.id; });
      if (!files.length) { U.toast('Ouvre au moins un fichier enregistré sur le Drive'); return; }
      C.promptDlg('Nouveau paquet', 'Nom du paquet', a ? U.baseName(a.name) : 'Chantier', 'Créer').then(function (n) {
        if (!n) return;
        C.confirmDlg('Préparer aussi TOUS les autres calques hors ligne sur le téléphone ? (plus lourd)', 'Oui, tous').then(function (all) {
          var pq = { nom: n, fichiers: files.map(function (x) { return { id: x.id, name: x.name, parent: x.parent }; }), actif: a && a.id, calques: Object.keys(C.active), fond: C.curBase, tous: all };
          C.postPorte('paquetEcrire', { paquet: pq }).then(function (j) { U.toast('Paquet « ' + n + ' » enregistré', 3000); paquetsDialog(); }).catch(function (e) { U.toast(e.message || String(e)); });
        });
      });
    };
    load();
  }
  function applyPaquet(p) {
    U.busy(true, 'Ouverture du paquet « ' + p.nom + ' »…');
    Object.keys(C.active).forEach(function (id) { if (p.calques.indexOf(id) < 0) C.setActive(id, false); });
    p.calques.forEach(function (id) { if (!C.active[id]) C.setActive(id, true); });
    C.setBase(p.fond);
    var chain = Promise.resolve();
    p.fichiers.forEach(function (f) { chain = chain.then(function () { if (C.docs.some(function (d) { return d.id === f.id; })) return; return C.openDriveFile(f.id, { quiet: true, parent: f.parent }).catch(function () {}); }); });
    chain.then(function () {
      U.busy(false);
      var a = C.docs.filter(function (d) { return d.id === p.actif; })[0] || C.activeDoc();
      if (a) { C.setActiveDoc(a); C.fitDocs(a); setTimeout(function () { offlineDialog(a, { all: p.tous }); }, 1500); }
    });
  }

  /* ======================= Réglages ======================= */
  function settingsDialog() {
    var d = C.openDlg({ title: 'Porte Drive', body: '<p class="muted">L\'appli lit et enregistre sur ton Drive via ta « porte » Apps Script. Le plus simple : ouvrir une fois, sur chaque appareil, le lien donné par la fonction <b>lienInstallation()</b>. Sinon, colle ici l\'adresse (se termine par /exec) et la clé.</p>' +
      '<label class="field"><span>Adresse de la porte</span><input type="text" id="cfgPorte" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(U.store('porte') || '') + '" autocomplete="off"></label>' +
      '<label class="field"><span>Clé secrète</span><input type="password" id="cfgCle" value="' + esc(U.store('cle') || '') + '" autocomplete="off"></label>' +
      '<div class="row2"><button class="btn primary" id="cfgSave">Enregistrer et tester</button><span class="muted" id="cfgStatus"></span></div>' +
      '<p class="muted small" id="cfgStore"></p>' });
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { d.q('#cfgStore').textContent = 'Stockage utilisé sur cet appareil : ' + U.fmtBytes(e.usage || 0) + (e.quota ? ' (disponible : ' + U.fmtBytes(e.quota) + ')' : ''); });
    d.q('#cfgSave').onclick = function () {
      var p = d.q('#cfgPorte').value.trim(), k = d.q('#cfgCle').value.trim();
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(p)) { d.q('#cfgStatus').textContent = 'Adresse invalide'; return; }
      U.store('porte', p); U.store('cle', k); d.q('#cfgStatus').textContent = 'Test…';
      C.callPorte('ping').then(function (j) {
        d.q('#cfgStatus').textContent = '✓ Connexion OK' + (j.version < 2 ? ' — ⚠ porte en version 1 : mets à jour Code.gs' : '');
        C.refreshTab('carte');
      }, function (e) { d.q('#cfgStatus').textContent = '✗ ' + (e.message || e); });
    };
  }
  function logoDialog() {
    var logo = U.store('logo');
    var d = C.openDlg({ title: 'Logo et éditeur (PDF)', body:
      '<label class="field"><span>Éditeur (pied de page des PDF)</span><input type="text" id="lgAut" value="' + esc(U.store('auteur') || 'Frédéric FATTORE') + '"></label>' +
      '<div class="field"><span>Logo du cartouche</span>' + (logo ? '<img src="' + logo + '" style="max-width:200px;max-height:80px;border:1px solid #e1e6ea;border-radius:8px;display:block;margin-bottom:8px">' : '<p class="muted">Aucun logo.</p>') +
      '<div class="row2"><button class="btn" id="lgPick">Choisir une image…</button>' + (logo ? '<button class="btn danger" id="lgDel">Retirer</button>' : '') + '</div></div>',
      foot: '<button class="btn primary big" id="lgOk">Enregistrer</button>' });
    d.q('#lgPick').onclick = function () {
      U.pickFile('image/png,image/jpeg').then(function (f) {
        if (!f) return;
        var img = new Image(), url = URL.createObjectURL(f);
        img.onload = function () {
          var s = Math.min(1, 600 / img.width), cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
          var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
          U.store('logo', cv.toDataURL('image/png')); URL.revokeObjectURL(url); C.closeDlg(1); logoDialog();
        };
        img.src = url;
      });
    };
    if (d.q('#lgDel')) d.q('#lgDel').onclick = function () { U.store('logo', null); C.closeDlg(1); logoDialog(); };
    d.q('#lgOk').onclick = function () { U.store('auteur', d.q('#lgAut').value.trim()); C.closeDlg(1); C.refreshTab('carte'); };
  }

  /* ======================= Position ======================= */
  var me = null, meAcc = null;
  $('btnLocate').addEventListener('click', function () {
    if (!navigator.geolocation) { U.toast('Position indisponible'); return; }
    U.toast('Recherche de ta position…', 2000);
    navigator.geolocation.getCurrentPosition(function (pos) {
      var ll = [pos.coords.latitude, pos.coords.longitude];
      if (me) { map.removeLayer(me); map.removeLayer(meAcc); }
      meAcc = L.circle(ll, { radius: pos.coords.accuracy, color: '#1a73e8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
      me = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1, interactive: false }).addTo(map);
      map.setView(ll, Math.max(map.getZoom(), 16));
    }, function () { U.toast('Position indisponible (autorise la localisation pour l\'appli)', 4000); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });

  /* ======================= Démarrage ======================= */
  C.setBase(U.store('base') || 'ortho');
  Object.keys(C.active).forEach(function (id) { C.setActive(id, true); });
  C.updateLayerCount();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  if (U.isDesktop()) C.openPanel(U.store('tab') || 'outils');
  window.addEventListener('resize', U.debounce(function () { if (U.isDesktop()) C.openPanel(); }, 300));

  if (!C.porteConfigured()) {
    settingsDialog();
  } else {
    if (C._justConfigured) U.toast('Porte Drive configurée ✓', 3000);
    C.restoreOpenDocs().then(function (n) {
      if (n) { C.fitDocs(C.activeDoc()); } else C.openFilesDlg();
      C.sync.run();
    }).catch(function () { C.openFilesDlg(); });
    C.callPorte('ping').then(function (j) { if (j.version < 2) U.toast('Ta porte Apps Script est en version 1 : recolle le nouveau Code.gs (voir README) pour les nouvelles fonctions', 8000); }).catch(function () {});
  }
})();
