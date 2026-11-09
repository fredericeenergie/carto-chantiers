/* Carto chantiers — onglet « Chantier » : modifier le chantier actif, ses données, le hors ligne, les paquets, les réglages. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, esc = U.esc, ui = C.ui;

  /* ======================= Onglet Chantier ======================= */
  C.tabs.chantier = function (el) {
    var a = C.activeDoc(), reg = C.offlineRegistry(), html = '';
    if (!a) {
      html += '<div class="card hero"><b>Aucun chantier ouvert</b><div>Ouvre un fichier de ton Drive ou crée un chantier.</div>' +
        '<button class="btn primary big" data-act="chantiers">Ouvrir ou créer un chantier</button></div>';
    } else {
      var name = U.baseName(a.name), st = C.fiches.storeOf(a), off = reg[C.docKey(a)];
      var nF = Object.keys(st.rows).length, nSend = Object.keys(st.dirty).length;
      var where = a.source === 'local' ? 'Fichier de l\'appareil' : a.source === 'new' ? 'Pas encore sur le Drive' : ((a.parent && a.parent.name) || 'Drive');
      var unsaved = a.dirty || a.source !== 'drive';
      html += '<div class="card hero"><div class="row"><b class="grow">🗂 ' + esc(name) + '</b><button class="btn" data-act="chantiers">Changer</button></div>' +
        '<div>' + esc(where) + ' · ' + C.pylonsOf(a).length + ' pylône(s) · ' + a.feats.length + ' élément(s)' + (a.dirty && a.source === 'drive' ? ' · <span class="tag warn">modifié</span>' : '') + '</div>' +
        (unsaved ? '<button class="btn primary big" data-act="save">💾 Enregistrer une version</button><div class="small">Crée « ' + esc(name.replace(/ \(modifié \d{4}-\d{2}-\d{2}\)$/, '')) + (a.source === 'drive' ? ' (modifié ' + U.isoDay() + ')' : '') + '.kmz » sur le Drive ; l\'original reste intact.</div>' : '') +
        '</div>';

      html += '<h3>Modifier</h3><div class="tiles">' +
        ui.tile('addPylon', '🗼', 'Ajouter un pylône', 'Numéroté automatiquement') +
        ui.tile('addLine', '〰', 'Ajouter une ligne', 'Accès, piste, tracé') +
        ui.tile('addZone', '⬠', 'Ajouter une zone', 'Aire de travail, emprise') +
        ui.tile('edit', '✎', a.editing ? 'Modification en cours' : 'Déplacer, renommer', a.editing ? 'Touche ici pour terminer' : 'ou supprimer un élément', a.editing) +
        '</div>';

      var fichesSub = nF + ' fiche(s)' + (nSend ? ' · ' + nSend + ' à envoyer' : '');
      html += '<h3>Données</h3><div class="rows">' +
        ui.item('import', '📊', 'Importer un tableau', 'CSV, Excel ou Google Sheet → fiches et pylônes') +
        (st.url ? '<a class="list-item" target="_blank" rel="noopener" href="' + esc(st.url) + '"><span class="item-ico">📋</span><span class="grow"><span class="item-title">Fiches pylônes</span><span class="item-sub">' + fichesSub + ' · ouvrir le Google Sheet</span></span><span class="caret">↗</span></a>'
          : '<div class="list-item"><span class="item-ico">📋</span><span class="grow"><span class="item-title">Fiches pylônes</span><span class="item-sub">' + fichesSub + ' · Google Sheet créé au premier envoi</span></span></div>') +
        ui.item('photos', '📷', 'Dossier des photos', esc(((U.storeJSON('photoFolders') || {})[C.docKey(a)] || {}).chemin || 'Carto chantiers – photos › ' + name)) +
        '</div>';

      html += '<h3>Hors ligne</h3><div class="card"><div class="row"><b class="grow">Carte et calques à 1 km autour</b>' + (off ? '<span class="tag ok">prêt</span>' : '<span class="tag grey">non préparé</span>') + '</div>' +
        (off ? '<div>Préparé le ' + U.fmtDate(off.date, true) + ' — ' + U.fmtBytes(off.bytes) + '</div>' : '') +
        '<button class="btn primary big" data-act="offline">⬇ ' + (off ? 'Mettre à jour le hors ligne' : 'Préparer hors ligne') + '</button></div>';
    }
    html += (a ? '' : '<h3>Hors ligne</h3>') + '<div class="rows">' + ui.item('paquets', '📦', 'Paquets chantier', 'Chantiers + calques à emporter, préparés au bureau') + '</div>';
    html += '<h3>Appli</h3><div class="rows">' + ui.item('settings', '⚙', 'Réglages', 'Porte Drive ' + (C.porteConfigured() ? '✓' : 'à régler') + ' · logo des PDF · stockage') + '</div>' +
      '<p class="muted small sec-foot">Carto chantiers ' + C.VERSION + '</p>';
    el.innerHTML = html;

    U.onAct(el, {
      chantiers: function () { C.chantiersDialog(); },
      save: function () { C.saveVersion(a); },
      addPylon: function () { C.tools.addPylon(a); },
      addLine: function () { C.tools.addShape(a, 'line'); },
      addZone: function () { C.tools.addShape(a, 'poly'); },
      edit: function () { C.tools.toggleEdit(a); if (a.editing) C.closePanel(); }, // comme les autres tuiles : la carte reprend la main
      'import': function () { C.fiches.importDialog({}); },
      photos: function () {
        C.driveDialog({ mode: 'folder' }).then(function (f) { if (!f) return; var m = U.storeJSON('photoFolders') || {}; m[C.docKey(a)] = { id: f.id, chemin: f.name }; U.storeJSON('photoFolders', m); C.refreshTab('chantier'); U.toast('Photos rangées dans « ' + f.name + ' »', 3000); });
      },
      offline: function () { offlineDialog(a); },
      paquets: paquetsDialog,
      settings: function () { settingsDialog(); }
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
    if (o.items.indexOf('routes') >= 0) C.tilesAround(seqs, 14, BUFFER).forEach(function (t) { plan.urls.push(C.routesUrl(t[0], t[1])); plan.estKB += 120; });
    // légendes officielles des calques
    o.items.forEach(function (id) { if (C.ITEMS[id]) C.legendUrls(C.ITEMS[id]).forEach(function (u) { plan.urls.push(u); }); });
    return plan;
  }
  function offlineDialog(a, preset) {
    if (!a) return;
    var reg = C.offlineRegistry()[C.docKey(a)];
    var act = Object.keys(C.active).filter(function (id) { return C.ITEMS[id].special !== 'vigicrues'; });
    var d = C.openDialog({ title: 'Hors ligne — ' + U.baseName(a.name), body:
      (reg ? '<p class="muted">Prêt depuis le ' + U.fmtDate(reg.date, true) + ' — ' + U.fmtBytes(reg.bytes) + (reg.failed ? ' (' + reg.failed + ' tuiles manquantes)' : '') + '</p>' : '') +
      '<p class="muted">Télécharge tout dans un rayon de 1 km autour du chantier et de ses ajouts terrain. Le chantier, les fiches et le dernier bulletin Vigicrues sont aussi gardés.</p>' +
      C.BASES.filter(function (b) { return !b.noOffline; }).map(function (b) {
        var on = b.id === 'ortho' || b.id === 'plan' || b.id === C.curBase;
        return '<label class="check"><input type="checkbox" data-base="' + b.id + '"' + (on ? ' checked' : '') + '><span class="grow">' + esc(b.label) + '</span></label>';
      }).join('') +
      '<label class="check"><input type="checkbox" id="ofActive" checked><span class="grow">Calques affichés (' + act.length + ')<span class="hint">' + esc(act.map(function (id) { return C.ITEMS[id].label; }).join(', ') || 'aucun') + '</span></span></label>' +
      '<label class="check"><input type="checkbox" id="ofAll"><span class="grow">Tous les autres calques aussi</span></label>' +
      '<p class="muted" id="ofEst">Estimation…</p><div id="ofProg"></div>',
      foot: '<button class="btn primary" id="ofGo">' + (reg ? 'Mettre à jour le hors ligne' : 'Préparer hors ligne') + '</button>' + (reg ? '<button class="btn danger" id="ofDel">Supprimer la copie</button>' : '') });
    function opts() {
      var items = [];
      if (d.q('#ofActive').checked) items = items.concat(act);
      if (d.q('#ofAll').checked) items = items.concat(Object.keys(C.ITEMS));
      items = items.filter(function (v, i, arr) { return arr.indexOf(v) === i && C.ITEMS[v].special !== 'vigicrues'; });
      var bases = {}; d.body.querySelectorAll('[data-base]').forEach(function (c) { bases[c.getAttribute('data-base')] = c.checked; });
      return { bases: bases, items: items };
    }
    function est() { var p = offlinePlan(a, opts()); d.q('#ofEst').textContent = '≈ ' + p.urls.length.toLocaleString('fr-FR') + ' tuiles, environ ' + U.fmtBytes(p.estKB * 1024) + ' (estimation).'; }
    d.body.addEventListener('change', est); setTimeout(est, 30);
    if (d.q('#ofDel')) d.q('#ofDel').onclick = function () {
      C.confirmDialog('Supprimer la copie hors ligne de « ' + U.baseName(a.name) + ' » ? (le chantier lui-même n\'est pas touché)', 'Supprimer', true).then(function (y) {
        if (y) C.removeOffline(C.docKey(a)).then(function () { C.closeDialog(1); C.refreshTab('chantier'); U.toast('Copie hors ligne supprimée'); });
      });
    };
    function go() {
      if (!U.isOnline()) { U.toast('Il faut du réseau pour préparer le hors ligne'); return; }
      var o = opts(), p = offlinePlan(a, o);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      if (C.active.vigicrues) C.refreshVigicrues();
      d.q('#ofGo').disabled = true;
      dl = { cancel: false }; U.keepAwake(true);
      d.q('#ofProg').innerHTML = '<div class="prog"><div id="ofBar"></div></div><p class="muted" id="ofTxt">Démarrage…</p><button class="btn danger" id="ofStop">Arrêter</button>';
      d.q('#ofStop').onclick = function () { dl.cancel = true; };
      C.download(C.docKey(a), { name: a.name, layers: o.items }, p.urls, function (done, total, bytes, failed) {
        var bar = $('ofBar'), t = $('ofTxt'); if (!bar) return;
        bar.style.width = Math.round(done / total * 100) + '%';
        t.textContent = done.toLocaleString('fr-FR') + ' / ' + total.toLocaleString('fr-FR') + ' — ' + U.fmtBytes(bytes) + (failed ? ' — ' + failed + ' échecs' : '') + '. Garde l\'appli ouverte.';
      }, function () { return dl && dl.cancel; }).then(function (res) {
        dl = null; U.keepAwake(false);
        U.toast(res.cancelled ? 'Préparation arrêtée (le déjà reçu est gardé)' : '« ' + U.baseName(a.name) + ' » prêt hors ligne (' + U.fmtBytes(res.bytes) + ')', 5000);
        C.closeDialog(1); C.refreshTab('chantier');
      }).catch(function (e) { dl = null; U.keepAwake(false); U.toast('Échec : ' + (e.message || e), 5000); });
    }
    d.q('#ofGo').onclick = go;
    if (preset) { d.q('#ofAll').checked = !!preset.all; est(); go(); }
  }
  C.offlineDialog = offlineDialog;
  // À l'ouverture d'un chantier du Drive pas encore préparé : une proposition discrète, une fois par semaine au plus par chantier
  C.proposeOffline = function (doc) {
    if (C.viewer || !doc || doc.source !== 'drive' || !U.isOnline()) return;
    var key = C.docKey(doc), asked = U.storeJSON('offlineAsked') || {};
    if (C.offlineRegistry()[key] || (asked[key] && Date.now() - asked[key] < 7 * 86400000)) return;
    var tries = 0;
    setTimeout(function wait() { // après la fenêtre « Dossiers affichés », s'il y en a une
      if ($('dlg').classList.contains('open') || $('dlg2').classList.contains('open') || $('busy').style.display === 'grid') { if (++tries < 180) setTimeout(wait, 1000); return; }
      if (C.activeDoc() !== doc || C.offlineRegistry()[key]) return;
      asked[key] = Date.now(); U.storeJSON('offlineAsked', asked);
      U.toastAction('« ' + U.baseName(doc.name) + ' » n\'est pas prêt hors ligne.', 'Préparer', function () { offlineDialog(doc); }, 12000);
    }, 1500);
  };

  /* ======================= Paquets chantier ======================= */
  function paquetsDialog() {
    var list = [];
    var d = C.openDialog({ title: 'Paquets chantier', body: '<p class="muted">Un paquet = les chantiers ouverts + les calques affichés + le fond. Crée-le au bureau ; sur le téléphone, « Ouvrir et préparer » ouvre tout et télécharge le hors ligne.</p><div id="pqList"><div class="empty">Lecture…</div></div>',
      foot: '<button class="btn big" data-act="create">＋ Créer un paquet</button>' });
    function load() {
      C.callPorte('paquets').then(function (j) { draw(j.paquets); }).catch(function (e) { if (d.q('#pqList')) d.q('#pqList').innerHTML = '<div class="empty">' + esc(e.message || e) + '</div>'; });
    }
    function draw(l) {
      list = l; if (!d.q('#pqList')) return;
      d.q('#pqList').innerHTML = list.length ? list.map(function (p, i) {
        return '<div class="card"><div class="row"><b class="grow">📦 ' + esc(p.nom) + '</b><span class="muted small">' + U.fmtDate(p.date) + '</span></div>' +
          '<div>' + p.fichiers.map(function (f) { return esc(U.baseName(f.name)); }).join(', ') + '</div><div class="small">' + p.calques.length + ' calque(s) · fond ' + esc(p.fond) + (p.tous ? ' · tous les calques hors ligne' : '') + '</div>' +
          '<div class="row card-actions"><button class="btn primary" data-act="open" data-i="' + i + '">⬇ Ouvrir et préparer</button><button class="btn danger" data-act="delete" data-i="' + i + '">Supprimer</button></div></div>';
      }).join('') : '<div class="empty">Aucun paquet pour l\'instant.</div>';
      d.q('[data-act=create]').classList.toggle('primary', !list.length); // un seul bouton bleu : « Ouvrir et préparer » dès qu'il y a un paquet
    }
    d.on({
      open: function (i) { C.closeDialog(1); applyPaquet(list[+i]); },
      'delete': function (i) {
        var nom = list[+i].nom;
        C.confirmDialog('Supprimer le paquet « ' + nom + ' » ? (les fichiers du Drive ne sont pas touchés)', 'Supprimer', true).then(function (y) {
          if (y) C.postPorte('paquetSupprimer', { nom: nom }).then(function (j) { draw(j.paquets); }).catch(function (e) { U.toast(e.message || String(e)); });
        });
      },
      create: function () { createPaquet(load); }
    });
    load();
  }
  C.paquetsDialog = paquetsDialog;
  // Une seule fenêtre pour créer : nom + option, au lieu de deux questions à la suite
  function createPaquet(done) {
    var a = C.activeDoc();
    var files = C.docs.filter(function (x) { return x.role !== 'terrain' && x.id; });
    if (!files.length) { U.toast('Ouvre au moins un chantier enregistré sur le Drive'); return; }
    var base = C.BASES.filter(function (b) { return b.id === C.curBase; })[0];
    var d = C.openDialog({ level: 2, title: 'Créer un paquet', body:
      '<p class="muted">Le paquet reprend l\'état actuel : ' + files.length + ' chantier(s), ' + C.layerOrder.length + ' calque(s) affiché(s), fond « ' + esc(base ? base.label : C.curBase) + ' ».</p>' +
      '<label class="field"><span>Nom du paquet</span><input type="text" id="pqName" value="' + esc(a ? U.baseName(a.name) : 'Chantier') + '"></label>' +
      '<label class="check"><input type="checkbox" id="pqAll"><span class="grow">Préparer aussi tous les autres calques hors ligne<span class="hint">Plus lourd à télécharger sur le téléphone</span></span></label>',
      foot: '<button class="btn" id="pqCancel">Annuler</button><button class="btn primary push" id="pqCreate">Créer</button>' });
    d.q('#pqCancel').onclick = function () { C.closeDialog(2); };
    function create() {
      var n = d.q('#pqName').value.trim(); if (!n) { U.toast('Donne un nom au paquet'); return; }
      var pq = { nom: n, fichiers: files.map(function (x) { return { id: x.id, name: x.name, parent: x.parent }; }), actif: a && a.id, calques: C.layerOrder.slice(), masques: Object.keys(C.hiddenLayers),
        opacites: C.layerOrder.reduce(function (o, id) { o[id] = C.opacityOf(id); return o; }, {}), fond: C.curBase, tous: d.q('#pqAll').checked };
      C.closeDialog(2);
      C.postPorte('paquetEcrire', { paquet: pq }).then(function () { U.toast('Paquet « ' + n + ' » enregistré', 3000); done(); }).catch(function (e) { U.toast(e.message || String(e)); });
    }
    d.q('#pqCreate').onclick = create;
    d.q('#pqName').onkeydown = function (e) { if (e.key === 'Enter') create(); };
    if (U.isDesktop()) setTimeout(function () { d.q('#pqName').focus(); d.q('#pqName').select(); }, 250);
  }
  function applyPaquet(p) {
    U.busy(true, 'Ouverture du paquet « ' + p.nom + ' »…');
    Object.keys(C.active).forEach(function (id) { if (p.calques.indexOf(id) < 0) C.setActive(id, false); });
    p.calques.forEach(function (id) { if (!C.active[id]) C.setActive(id, true); });
    C.setLayerOrder(p.calques);
    Object.keys(p.opacites || {}).forEach(function (id) { C.setOpacity(id, p.opacites[id]); });
    C.layerOrder.forEach(function (id) { var h = (p.masques || []).indexOf(id) >= 0; if (h !== !!C.hiddenLayers[id]) C.setHidden(id, h); });
    C.setBase(p.fond);
    var chain = Promise.resolve();
    p.fichiers.forEach(function (f) { chain = chain.then(function () { if (C.docs.some(function (d) { return d.id === f.id; })) return; return C.openDriveFile(f.id, { quiet: true, parent: f.parent }).catch(function () {}); }); });
    chain.then(function () {
      U.busy(false);
      var a = C.docs.filter(function (d) { return d.id === p.actif; })[0] || C.activeDoc();
      if (a) { C.setActiveDoc(a); C.fitDocs(a); setTimeout(function () { offlineDialog(a, { all: p.tous }); }, 1500); }
    });
  }

  /* ======================= Réglages (une seule fenêtre : porte Drive, PDF, stockage) ======================= */
  function settingsDialog() {
    var d = C.openDialog({ title: 'Réglages', body:
      '<h3 class="sec-title">Porte Drive</h3>' +
      '<p class="muted">L\'appli lit et enregistre sur ton Drive via ta « porte » Apps Script. Le plus simple : ouvrir une fois, sur chaque appareil, le lien donné par la fonction <b>lienInstallation()</b>. Sinon, colle ici l\'adresse (elle finit par /exec) et la clé.</p>' +
      '<label class="field"><span>Adresse de la porte</span><input type="text" id="rgPorte" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(U.store('porte') || '') + '" autocomplete="off"></label>' +
      '<label class="field"><span>Clé secrète</span><input type="password" id="rgCle" value="' + esc(U.store('cle') || '') + '" autocomplete="off"></label>' +
      '<div class="row"><button class="btn primary" id="rgSave">Enregistrer et tester</button><span class="muted" id="rgStatus"></span></div><div id="rgHelp"></div>' +
      '<h3 class="sec-title">PDF (atlas et rapports)</h3>' +
      '<label class="field"><span>Éditeur (pied de page)</span><input type="text" id="rgAuteur" value="' + esc(U.store('auteur') || 'Frédéric FATTORE') + '"></label>' +
      '<div class="field"><span>Logo du cartouche</span><div id="rgLogo"></div></div>' +
      '<h3 class="sec-title">Stockage sur cet appareil</h3><p class="muted" id="rgStore">Calcul…</p><div id="rgOffline"></div>' +
      '<p class="muted small sec-foot">Carto chantiers ' + C.VERSION + '</p>' });

    /* --- Porte Drive --- */
    d.q('#rgSave').onclick = function () {
      var p = d.q('#rgPorte').value.trim(), k = d.q('#rgCle').value.trim(), st = d.q('#rgStatus');
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(p)) { st.textContent = '✗ Adresse invalide'; return; }
      if (/\/dev\/?$/.test(p)) { st.textContent = '✗ Adresse en /dev : prends celle qui finit par /exec (Gérer les déploiements)'; return; }
      U.store('porte', p); U.store('cle', k); st.textContent = 'Test…';
      C.callPorte('ping').then(function (j) {
        st.textContent = '✓ Connexion OK — porte version ' + j.version + (j.version < 3 ? ' : recolle le nouveau Code.gs (liens de consultation, notes vocales)' : '');
        d.q('#rgHelp').innerHTML = '';
        C.refreshTab('chantier');
      }, function (e) {
        st.textContent = '✗ ' + (e.message || e);
        d.q('#rgHelp').innerHTML = C.porteHelpHtml();
        var again = d.q('#rgHelp [data-open-settings]'); if (again) again.remove(); // on y est déjà
      });
    };

    /* --- PDF : l'éditeur s'enregistre dès la saisie, le logo dès qu'il est choisi --- */
    d.q('#rgAuteur').onchange = function () { U.store('auteur', this.value.trim()); U.toast('Éditeur enregistré', 1500); };
    function drawLogo() {
      var logo = U.store('logo'), box = d.q('#rgLogo'); if (!box) return;
      box.innerHTML = (logo ? '<img class="logo-preview" alt="Logo" src="' + logo + '">' : '<p class="muted">Aucun logo.</p>') +
        '<div class="row"><button class="btn" data-act="logoPick">' + (logo ? 'Changer l\'image…' : 'Choisir une image…') + '</button>' + (logo ? '<button class="btn danger" data-act="logoDelete">Supprimer le logo</button>' : '') + '</div>';
    }
    /* --- Stockage : espace utilisé et copies hors ligne --- */
    function drawOffline() {
      var reg = C.offlineRegistry(), keys = Object.keys(reg), box = d.q('#rgOffline'); if (!box) return;
      box.innerHTML = keys.length ? '<div class="muted small sec-note">Chantiers prêts hors ligne :</div>' + keys.map(function (k) {
        return '<div class="list-item"><span class="grow"><span class="item-title">' + esc(U.baseName(reg[k].name)) + '</span><span class="item-sub">' + U.fmtDate(reg[k].date, true) + ' — ' + U.fmtBytes(reg[k].bytes) + '</span></span><button class="btn danger" data-act="offlineDelete" data-id="' + esc(k) + '">Supprimer</button></div>';
      }).join('') : '<p class="muted small">Aucun chantier préparé hors ligne.</p>';
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) {
        if (d.q('#rgStore')) d.q('#rgStore').textContent = 'Espace utilisé par l\'appli : ' + U.fmtBytes(e.usage || 0) + (e.quota ? ' (disponible : ' + U.fmtBytes(e.quota) + ')' : '');
      }); else d.q('#rgStore').textContent = '';
    }
    d.on({
      logoPick: function () {
        U.pickFile('image/png,image/jpeg').then(function (f) {
          if (!f) return;
          var img = new Image(), url = URL.createObjectURL(f);
          img.onload = function () {
            var s = Math.min(1, 600 / img.width), cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
            var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
            U.store('logo', cv.toDataURL('image/png')); URL.revokeObjectURL(url); drawLogo(); U.toast('Logo enregistré', 1500);
          };
          img.onerror = function () { URL.revokeObjectURL(url); U.toast('Image illisible'); };
          img.src = url;
        });
      },
      logoDelete: function () { C.confirmDialog('Supprimer le logo des PDF ?', 'Supprimer', true).then(function (y) { if (y) { U.store('logo', null); drawLogo(); } }); },
      offlineDelete: function (k) {
        var reg = C.offlineRegistry(); if (!reg[k]) return;
        C.confirmDialog('Supprimer la copie hors ligne de « ' + U.baseName(reg[k].name) + ' » ? (le chantier lui-même n\'est pas touché)', 'Supprimer', true).then(function (y) {
          if (y) C.removeOffline(k).then(function () { drawOffline(); C.refreshTab('chantier'); });
        });
      }
    });
    drawLogo(); drawOffline();
    return d;
  }
  C.settingsDialog = settingsDialog;
})();
