/* Carto chantiers — noyau : utilitaires, composants d'interface, porte Drive, fenêtres, panneau et onglets, carte, fonds et calques.
   Conventions de nommage : voir CONVENTIONS.md. */
(function () {
  'use strict';
  var C = window.Carto;
  C.VERSION = 'v2.6.1';
  var $ = C.$ = function (id) { return document.getElementById(id); };

  /* ======================= Utilitaires ======================= */
  var U = C.u = {};
  // Consultation (lien en lecture seule, #vue=…) : rien n'est lu ni écrit dans la mémoire de l'appareil,
  // pour ne pas toucher aux réglages et aux chantiers de la personne qui ouvre le lien.
  var VIEW = /(^#|&)vue=/.test(location.hash), mem = {};
  U.store = function (k, v) {
    if (VIEW) { if (v === undefined) return k in mem ? mem[k] : null; if (v === null) delete mem[k]; else mem[k] = String(v); return; }
    try {
      if (v === undefined) return localStorage.getItem('carto.' + k);
      if (v === null) localStorage.removeItem('carto.' + k); else localStorage.setItem('carto.' + k, v);
    } catch (e) { return null; }
  };
  U.storeJSON = function (k, v) {
    if (v === undefined) { try { return JSON.parse(U.store(k) || 'null'); } catch (e) { return null; } }
    U.store(k, JSON.stringify(v));
  };
  U.toast = function (msg, ms) {
    var t = $('toast'); t.textContent = msg; t.style.display = 'block';
    clearTimeout(U.toast._t); U.toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 3000);
  };
  // message avec un bouton d'action (nouvelle version, proposition)
  U.toastAction = function (msg, label, fn, ms) {
    var t = $('toast'); t.textContent = msg + ' ';
    var b = document.createElement('button'); b.className = 'btn toast-btn'; b.textContent = label;
    b.onclick = function () { t.style.display = 'none'; fn(); };
    t.appendChild(b); t.style.display = 'block';
    clearTimeout(U.toast._t); U.toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 10000);
  };
  U.busy = function (on, txt) { $('busy').style.display = on ? 'grid' : 'none'; if (txt) $('busyTxt').textContent = txt; };
  // lien venu d'un fichier ou d'un tableau : seules les adresses web sont gardées (jamais « javascript: » et consorts)
  U.safeUrl = function (u) { u = String(u == null ? '' : u).trim(); return /^https?:\/\//i.test(u) ? u : ''; };
  U.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  U.natural = function (a, b) { return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' }); };
  U.fmtBytes = function (b) { if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + ' Ko'; return (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' Mo'; };
  U.fmtDate = function (iso, withTime) {
    try { var o = { day: '2-digit', month: '2-digit', year: 'numeric' }; if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; } return new Date(iso).toLocaleString('fr-FR', o); } catch (e) { return ''; }
  };
  U.isoDay = function (d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  U.fmtDist = function (m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',') + ' km'; };
  U.fmtArea = function (a) { return a < 10000 ? Math.round(a).toLocaleString('fr-FR') + ' m²' : (a / 10000).toFixed(a < 100000 ? 2 : 1).replace('.', ',') + ' ha'; };
  U.withTimeout = function (p, ms) {
    return new Promise(function (ok, ko) {
      var t = setTimeout(function () { ko(new Error('Délai dépassé')); }, ms);
      p.then(function (r) { clearTimeout(t); ok(r); }, function (e) { clearTimeout(t); ko(e); });
    });
  };
  U.isOnline = function () { return navigator.onLine !== false; };
  U.debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };
  U.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  U.baseName = function (n) { return String(n || '').replace(/\.[^.]+$/, ''); };
  var loaded = {};
  U.loadScript = function (src) {
    if (!loaded[src]) loaded[src] = new Promise(function (ok, ko) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { delete loaded[src]; ko(new Error('Chargement impossible : ' + src)); }; document.head.appendChild(s); });
    return loaded[src];
  };
  U.blobToBase64 = function (blob) {
    return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = ko; r.readAsDataURL(blob); });
  };
  U.blobToDataUrl = function (blob) {
    return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(String(r.result)); }; r.onerror = ko; r.readAsDataURL(blob); });
  };
  U.pickFile = function (accept, capture) {
    return new Promise(function (ok) {
      var inp = $('filePick'); inp.value = ''; inp.accept = accept || ''; inp.multiple = false;
      if (capture) inp.setAttribute('capture', 'environment'); else inp.removeAttribute('capture');
      inp.onchange = function () { ok(inp.files && inp.files[0] ? inp.files[0] : null); };
      inp.oncancel = function () { ok(null); };
      inp.click();
    });
  };
  U.pickFiles = function (accept) {
    return new Promise(function (ok) {
      var inp = $('filePick'); inp.value = ''; inp.accept = accept || ''; inp.multiple = true; inp.removeAttribute('capture');
      inp.onchange = function () { ok(inp.files ? Array.prototype.slice.call(inp.files) : []); };
      inp.oncancel = function () { ok([]); };
      inp.click();
    });
  };
  /* Photo : réduite à 2 560 px (JPEG) pour un envoi rapide depuis le terrain, avec vignette */
  U.compressImage = function (file, max, q) {
    max = max || 2560; q = q || 0.85;
    return new Promise(function (ok) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height)), w = Math.round(img.width * s), h = Math.round(img.height * s);
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
        var ts = 240 / Math.max(w, h), tc = document.createElement('canvas'); tc.width = Math.round(w * ts); tc.height = Math.round(h * ts);
        tc.getContext('2d').drawImage(cv, 0, 0, tc.width, tc.height);
        var thumb = tc.toDataURL('image/jpeg', 0.7);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          var keep = b && (b.size < file.size || !/jpe?g/i.test(file.type)) ? b : file;
          cv.width = cv.height = 0; ok({ blob: keep, thumb: thumb });
        }, 'image/jpeg', q);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok({ blob: file, thumb: null }); };
      img.src = url;
    });
  };
  /* Écran gardé allumé pendant un long téléchargement ou une création de PDF */
  var wake = { n: 0, s: null };
  function wakeGet() { if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').then(function (s) { wake.s = s; }).catch(function () {}); }
  U.keepAwake = function (on) {
    wake.n = Math.max(0, wake.n + (on ? 1 : -1));
    if (wake.n && !wake.s) wakeGet();
    if (!wake.n && wake.s) { wake.s.release().catch(function () {}); wake.s = null; }
  };
  document.addEventListener('visibilitychange', function () { if (wake.n && document.visibilityState === 'visible') { wake.s = null; wakeGet(); } });
  U.isDesktop = function () { return window.matchMedia('(min-width: 900px) and (min-height: 561px)').matches; };


  /* ======================= Composants d'interface ======================= */
  // Un seul écouteur par conteneur : <button data-act="x" data-id="…"> appelle handlers.x(id, bouton).
  // « root.onclick » est remplacé à chaque appel : pas d'écouteurs empilés quand un écran est redessiné.
  U.onAct = function (root, handlers) {
    root.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b || !root.contains(b) || b.disabled) return;
      var h = handlers[b.getAttribute('data-act')];
      if (h) h(b.hasAttribute('data-id') ? b.getAttribute('data-id') : b.getAttribute('data-i'), b, e);
    };
  };
  // Groupe à choix unique (.seg, .chips) : le bouton choisi porte .on, sa valeur est dans data-val.
  U.pickOne = function (group, onChange) {
    group.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-val]') : null; if (!b || !group.contains(b)) return;
      group.querySelectorAll('[data-val]').forEach(function (x) { x.classList.toggle('on', x === b); });
      if (onChange) onChange(b.getAttribute('data-val'));
    });
  };
  U.picked = function (group) { var b = group && group.querySelector('.on'); return b ? b.getAttribute('data-val') : ''; };
  var ui = C.ui = {};
  // Tuile = action immédiate (souvent sur la carte)
  ui.tile = function (act, ico, title, sub, on) {
    return '<button class="tile' + (on ? ' on' : '') + '" data-act="' + act + '"><span class="tile-ico">' + ico + '</span><b>' + title + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</button>';
  };
  // Ligne à chevron = ouvre une fenêtre
  ui.item = function (act, ico, title, sub, right) {
    return '<button class="list-item" data-act="' + act + '"><span class="item-ico">' + ico + '</span><span class="grow"><span class="item-title">' + title + '</span>' + (sub ? '<span class="item-sub">' + sub + '</span>' : '') + '</span>' + (right || '') + '<span class="caret">›</span></button>';
  };

  /* ======================= Porte Drive ======================= */
  // une porte est toujours une application Apps Script (ou la machine elle-même, pour les essais)
  C.PORTE_RE = /^(https:\/\/script\.google(usercontent)?\.com\/|http:\/\/(127\.0\.0\.1|localhost)[:\/])/;
  (function readSetupHash() {
    var h = location.hash.replace(/^#/, '');
    if (!/porte=/.test(h)) return;
    var p = {}; h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (p.vue) { C.viewer = { token: p.vue, porte: p.porte }; return; } // le lien reste dans l'adresse : un rechargement garde la consultation
    if (p.porte && /\/dev\/?$/.test(p.porte)) C._devLink = true;
    else if (p.porte && p.cle) {
      if (!C.PORTE_RE.test(p.porte)) C._badLink = true;                                                        // adresse qui n'est pas une porte : rien n'est enregistré
      else if (U.store('porte') && U.store('cle') && U.store('porte') !== p.porte) C._otherPorte = { porte: p.porte, cle: p.cle }; // une autre porte est déjà réglée : on demande avant de la remplacer
      else { U.store('porte', p.porte); U.store('cle', p.cle); C._justConfigured = true; }
    }
    try { history.replaceState(null, '', location.pathname); } catch (e) { location.hash = ''; }
  })();
  // lien d'installation fabriqué avec l'adresse /dev (réservée à l'éditeur Apps Script) : on l'explique au lieu de l'enregistrer
  if (C._devLink) setTimeout(function () {
    C.openDialog({ title: 'Lien d\'installation à refaire', body: '<p>Ce lien contient l\'adresse de la porte en <b>/dev</b>. Elle ne fonctionne que dans l\'éditeur Apps Script, pas dans l\'appli.</p>' +
      '<ol class="small steps"><li>Dans Apps Script : <b>Déployer → Gérer les déploiements</b>, copie l\'<b>URL de l\'application Web</b> (elle finit par <b>/exec</b>).</li>' +
      '<li>Colle-la en haut du code : <code>var PORTE_URL = \'…/exec\';</code> puis enregistre.</li>' +
      '<li>Exécute <b>lienInstallation</b> et ouvre le nouveau lien.</li></ol>' +
      '<p class="muted small">Ou colle directement l\'adresse /exec et la clé dans les réglages.</p>',
      foot: '<button class="btn primary big" data-open-settings>Ouvrir les réglages</button>' });
  }, 600);
  C.porteConfigured = function () { return !!(U.store('porte') && U.store('cle')); };
  // « Failed to fetch » : Google a renvoyé une page (connexion, autorisation, erreur) au lieu des données
  function porteNetErr(e) {
    if (e && e.message === 'timeout') throw new Error('La porte ne répond pas (délai dépassé). Réessaie.');
    var u = U.store('porte') || '';
    var why = /\/dev(\?|$)/.test(u) ? 'l\'adresse finit par /dev au lieu de /exec' : 'la porte renvoie une page Google au lieu des données';
    var err = new Error('Porte injoignable : ' + why + '.');
    err.porte = true; throw err;
  }
  C.porteTestUrl = function () { return (U.store('porte') || '') + '?action=ping&cle=' + encodeURIComponent(U.store('cle') || ''); };
  C.porteHelpHtml = function () {
    return '<div class="card help"><b>Causes habituelles</b><ol class="small steps">' +
      '<li>Déploiement pas en <b>« Qui peut accéder : Tout le monde »</b> (Gérer les déploiements → ✎).</li>' +
      '<li>Nouvelle version déployée mais <b>autorisations pas acceptées</b> : dans Apps Script, exécute <b>testerListe</b> et accepte.</li>' +
      '<li>Adresse collée qui finit par <b>/dev</b> au lieu de <b>/exec</b>, ou ancien déploiement supprimé.</li></ol>' +
      '<div class="row"><a class="btn" href="' + U.esc(C.porteTestUrl()) + '" target="_blank" rel="noopener">Tester la porte ↗</a><button class="btn" data-open-settings>Ouvrir les réglages</button></div>' +
      '<p class="muted small">« Tester la porte » doit afficher <code>{"ok":true,"version":3}</code>. Une page de connexion Google ou un message d\'erreur indique le réglage à corriger.</p></div>';
  };
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-open-settings]'); if (b && C.settingsDialog) { C.closeDialog(2); C.closeDialog(1); C.settingsDialog(); } });
  C.callPorte = function (action, params) {
    if (!C.porteConfigured()) return Promise.reject(new Error('Porte Drive non réglée'));
    if (!U.isOnline()) return Promise.reject(new Error('Pas de réseau'));
    var u = U.store('porte') + '?action=' + encodeURIComponent(action) + '&cle=' + encodeURIComponent(U.store('cle'));
    for (var k in (params || {})) u += '&' + k + '=' + encodeURIComponent(params[k]);
    return U.withTimeout(fetch(u, { redirect: 'follow', credentials: 'omit' }), 60000)
      .catch(porteNetErr)
      .then(function (r) { if (!r.ok) throw new Error('Porte : erreur ' + r.status); return r.json().catch(function () { throw new Error('La porte a répondu une page au lieu de données (déploiement à vérifier).'); }); })
      .then(function (j) { if (!j.ok) throw new Error(j.erreur || 'Erreur de la porte'); return j; });
  };
  C.postPorte = function (action, body) {
    if (!C.porteConfigured()) return Promise.reject(new Error('Porte Drive non réglée'));
    if (!U.isOnline()) return Promise.reject(new Error('Pas de réseau'));
    var b = Object.assign({}, body || {}, { action: action, cle: U.store('cle') });
    return U.withTimeout(fetch(U.store('porte'), { method: 'POST', body: JSON.stringify(b), redirect: 'follow', credentials: 'omit' }), 120000)
      .catch(porteNetErr)
      .then(function (r) { if (!r.ok) throw new Error('Porte : erreur ' + r.status); return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.erreur || 'Erreur de la porte'); return j; });
  };

  /* ======================= Fenêtres ======================= */
  var dlgClose = {}, dlgGuard = {};
  C.openDialog = function (o) {
    var lvl = o.level === 2 ? '2' : '';
    var el = $('dlg' + lvl);
    $('dlg' + lvl + 'Title').textContent = o.title || '';
    // corps neuf à chaque ouverture : les écouteurs posés par la fenêtre précédente (change, input…) disparaissent avec elle
    var old = $('dlg' + lvl + 'Body'), body = old.cloneNode(false); old.parentNode.replaceChild(body, old);
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    var foot = $('dlg' + lvl + 'Foot'); foot.innerHTML = o.foot || '';
    if (!lvl) { $('dlgHead').innerHTML = o.head || ''; }
    body.scrollTop = 0;
    el.classList.toggle('at-top', !!o.top); // fenêtre en haut de l'écran (saisie au clavier sur téléphone)
    el.classList.toggle('wide', !!o.wide); // fenêtre large sur ordinateur et tablette (formulaires, listes en colonnes)
    el.onclick = null;                      // les actions de la fenêtre précédente ne survivent pas
    dlgClose[lvl] = o.onClose || null;
    dlgGuard[lvl] = o.guard || null;
    el.classList.add('open');
    $('scrim').style.display = 'block';
    if (!lvl) dlgClose.point = $('pointSheet').classList.contains('open') || (dlgClose.point && $('dlg').classList.contains('open'));
    $('pointSheet').classList.remove('open');
    if (!U.isDesktop()) C.closePanel();
    return { el: el, body: body, foot: foot, q: function (sel) { return el.querySelector(sel); }, qa: function (sel) { return el.querySelectorAll(sel); }, on: function (handlers) { U.onAct(el, handlers); } };
  };
  C.closeDialog = function (level) {
    var lvl = level === 2 ? '2' : '';
    var el = $('dlg' + lvl); if (!el.classList.contains('open')) return;
    el.classList.remove('open');
    dlgGuard[lvl] = null;
    var cb = dlgClose[lvl]; dlgClose[lvl] = null; if (cb) cb();
    // la fiche du point sélectionné réapparaît quand on referme la fenêtre ouverte par-dessus
    if (!lvl && dlgClose.point) { dlgClose.point = false; if (C.selected && C.selected() && !$('dlg').classList.contains('open')) $('pointSheet').classList.add('open'); }
    if (!$('dlg').classList.contains('open') && !$('dlg2').classList.contains('open')) $('scrim').style.display = 'none';
  };
  // fermeture demandée par l'utilisateur (×, fond grisé, bouton retour, Échap, Annuler) : on protège la saisie en cours
  C.requestClose = function (level) {
    var lvl = level === 2 ? '2' : '';
    var g = dlgGuard[lvl];
    if (g && g()) {
      return C.confirmDialog('Des informations saisies ne sont pas enregistrées.', 'Quitter sans enregistrer', true, 'Continuer la saisie').then(function (y) { if (y) { dlgGuard[lvl] = null; C.closeDialog(level); } });
    }
    C.closeDialog(level); return Promise.resolve();
  };
  document.querySelector('[data-close]').addEventListener('click', function () { C.requestClose(1); });
  document.querySelector('[data-close2]').addEventListener('click', function () { C.requestClose(2); });
  $('scrim').addEventListener('click', function () { if ($('dlg2').classList.contains('open')) C.requestClose(2); else C.requestClose(1); });
  C.confirmDialog = function (msg, okLabel, danger, cancelLabel) {
    return new Promise(function (ok) {
      var done = false;
      var d = C.openDialog({ level: 2, title: 'Confirmer', body: '<p>' + U.esc(msg) + '</p>',
        foot: '<button class="btn" id="cfNo">' + U.esc(cancelLabel || 'Annuler') + '</button><button class="btn ' + (danger ? 'danger' : 'primary') + ' push" id="cfYes">' + U.esc(okLabel || 'Confirmer') + '</button>',
        onClose: function () { if (!done) ok(false); } });
      d.q('#cfNo').onclick = function () { done = true; C.closeDialog(2); ok(false); };
      d.q('#cfYes').onclick = function () { done = true; C.closeDialog(2); ok(true); };
    });
  };
  C.promptDialog = function (title, label, value, okLabel) {
    return new Promise(function (ok) {
      var done = false;
      var d = C.openDialog({ level: 2, title: title, body: '<label class="field"><span>' + U.esc(label) + '</span><input type="text" id="pmV" value="' + U.esc(value || '') + '"></label>',
        foot: '<button class="btn" id="pmNo">Annuler</button><button class="btn primary push" id="pmOk">' + U.esc(okLabel || 'Enregistrer') + '</button>',
        onClose: function () { if (!done) ok(null); } });
      var inp = d.q('#pmV'); setTimeout(function () { inp.focus(); inp.select(); }, 250);
      function go() { done = true; var v = inp.value.trim(); C.closeDialog(2); ok(v || null); }
      inp.onkeydown = function (e) { if (e.key === 'Enter') go(); };
      d.q('#pmNo').onclick = function () { done = true; C.closeDialog(2); ok(null); };
      d.q('#pmOk').onclick = go;
    });
  };
  C.choiceDialog = function (title, choices) { // choices : [{v, label, hint, ico}]
    return new Promise(function (ok) {
      var done = false;
      var d = C.openDialog({ level: 2, title: title, body: choices.map(function (c, i) {
        return '<button class="list-item" data-i="' + i + '">' + (c.ico ? '<span class="item-ico">' + c.ico + '</span>' : '') + '<span class="grow"><span class="item-title">' + U.esc(c.label) + '</span>' + (c.hint ? '<span class="item-sub">' + U.esc(c.hint) + '</span>' : '') + '</span><span class="caret">›</span></button>';
      }).join(''), onClose: function () { if (!done) ok(null); } });
      d.qa('[data-i]').forEach(function (b) { b.onclick = function () { done = true; C.closeDialog(2); ok(choices[+b.getAttribute('data-i')].v); }; });
    });
  };

  /* ======================= Retour arrière et Échap ======================= */
  // Le bouton « retour » du téléphone ferme d'abord la fenêtre ouverte, puis la fiche du point, puis le panneau.
  C.closeTop = function () {
    if ($('dlg2').classList.contains('open')) { C.requestClose(2); return true; }
    if ($('dlg').classList.contains('open')) { C.requestClose(1); return true; }
    if ($('busy').style.display === 'grid') return true;
    if ($('pointSheet').classList.contains('open')) { C.clearSelection(); return true; }
    if (!$('measureBar').hidden && C.tools) { C.tools.measure(false); return true; }
    if (!$('drawBar').hidden && C.tools) { C.tools.cancelDraw(); return true; }
    if (!U.isDesktop() && $('panel').classList.contains('open')) { C.closePanel(); return true; }
    return false;
  };
  (function backButton() {
    var pushed = false, ignore = 0, t = null;
    function anyOpen() {
      return $('dlg').classList.contains('open') || $('dlg2').classList.contains('open') || $('pointSheet').classList.contains('open') ||
        !$('measureBar').hidden || !$('drawBar').hidden || (!U.isDesktop() && $('panel').classList.contains('open'));
    }
    function sync() {
      t = null;
      var open = anyOpen();
      if (open && !pushed) { try { history.pushState({ carto: 1 }, ''); pushed = true; } catch (e) {} }
      else if (!open && pushed) { pushed = false; ignore++; history.back(); }
    }
    function later() { if (!t) t = setTimeout(sync, 60); }
    window.addEventListener('popstate', function () {
      if (ignore) { ignore--; return; }
      pushed = false;
      C.closeTop();
      later();
    });
    var mo = new MutationObserver(later);
    ['dlg', 'dlg2', 'pointSheet', 'panel', 'measureBar', 'drawBar'].forEach(function (id) { mo.observe($(id), { attributes: true, attributeFilter: ['class', 'hidden'] }); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (C.closeTop()) e.preventDefault();
    });
  })();

  /* ======================= Panneau et onglets ======================= */
  // Quatre onglets, une intention chacun : calques (voir), terrain (relever), chantier (préparer), export (livrer).
  var TABS = ['calques', 'terrain', 'chantier', 'export'];
  C.tabs = {};
  var curTab = null;
  function tabEl(tab) { return $('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)); }
  C.tabEl = tabEl;
  C.openPanel = function (tab) {
    curTab = tab || curTab || 'calques';
    if (TABS.indexOf(curTab) < 0) curTab = { carte: 'calques', outils: 'terrain' }[curTab] || 'calques'; // onglets d'avant la v2.5
    if (C.viewer && (curTab === 'chantier' || curTab === 'export')) curTab = 'calques';                  // consultation : voir et mesurer seulement
    TABS.forEach(function (t) { tabEl(t).classList.toggle('on', t === curTab); });
    document.querySelectorAll('#nav button, #ptabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === curTab); });
    if (C.tabs[curTab]) C.tabs[curTab](tabEl(curTab));
    $('panel').classList.add('open');
    U.store('tab', curTab);
  };
  C.closePanel = function () {
    if (U.isDesktop()) return;
    $('panel').classList.remove('open');
    document.querySelectorAll('#nav button').forEach(function (b) { b.classList.remove('on'); });
  };
  // redessine l'onglet affiché s'il fait partie de ceux cités : C.refreshTab('terrain', 'chantier')
  C.refreshTab = function () {
    if (!curTab || !C.tabs[curTab] || !($('panel').classList.contains('open') || U.isDesktop())) return;
    if (Array.prototype.indexOf.call(arguments, curTab) >= 0) C.tabs[curTab](tabEl(curTab));
  };
  document.querySelectorAll('#nav button, #ptabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-tab');
      if (!U.isDesktop() && $('panel').classList.contains('open') && curTab === t) C.closePanel(); else C.openPanel(t);
    });
  });
  (function swipeDown() {
    var y0 = null, g = $('panelGrab');
    g.addEventListener('touchstart', function (e) { y0 = e.touches[0].clientY; }, { passive: true });
    g.addEventListener('touchend', function (e) { if (y0 != null && e.changedTouches[0].clientY - y0 > 40) C.closePanel(); y0 = null; });
    g.addEventListener('click', function () { C.closePanel(); });
  })();

  /* ======================= Carte ======================= */
  var map = C.map = L.map('map', { zoomControl: false, maxZoom: 21, worldCopyJump: true, tap: true }).setView([46.6, 2.4], 6);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  map.attributionControl.setPrefix(false);
  C.shortSrc = function (s) { return String(s || '').split(/[,—(]/)[0].replace(/ Géoplateforme/, '').trim(); };

  C.FallbackLayer = L.GridLayer.extend({
    initialize: function (def, opts) { this._def = def; L.GridLayer.prototype.initialize.call(this, opts); },
    createTile: function (coords, done) {
      var tile = L.DomUtil.create('div', 'fb-tile');
      var img = document.createElement('img');
      img.alt = ''; img.setAttribute('role', 'presentation'); img.draggable = false;
      if (this._def.kind !== 'xyz') img.crossOrigin = 'anonymous';
      tile.appendChild(img);
      var def = this._def, minN = def.native ? def.native[0] : 0, dz = 0;
      function load() {
        var xx = coords.x >> dz, yy = coords.y >> dz;
        if (dz > 0) {
          var n = 1 << dz;
          img.style.width = img.style.height = (256 * n) + 'px';
          img.style.left = (-(coords.x - (xx << dz)) * 256) + 'px';
          img.style.top = (-(coords.y - (yy << dz)) * 256) + 'px';
        }
        img.src = C.tileUrl(def, coords.z - dz, xx, yy);
      }
      var retried = false, finished = false, sharp = C.tileUrl(def, coords.z, coords.x, coords.y);
      function fin() { if (!finished) { finished = true; done(null, tile); } }
      img.onload = fin;
      img.onerror = function () {
        if (!retried && dz === 0 && U.isOnline()) {
          // réseau faible : on affiche l'agrandissement d'une tuile parente, puis on retente la tuile nette
          retried = true;
          setTimeout(function () {
            var im2 = new Image(); if (def.kind !== 'xyz') im2.crossOrigin = 'anonymous';
            im2.onload = function () { dz = 0; img.style.cssText = ''; img.src = sharp; };
            im2.src = sharp;
          }, 4000);
        }
        if (dz < 5 && coords.z - dz - 1 >= minN) { dz++; load(); }
        else { img.style.display = 'none'; fin(); }
      };
      load();
      return tile;
    }
  });

  /* ---- Fonds ---- */
  var baseLayers = {};
  C.curBase = null;
  C.BASES.forEach(function (b) {
    baseLayers[b.id] = new C.FallbackLayer(b.def, { maxZoom: 21, maxNativeZoom: b.def.native[1], zIndex: 1, keepBuffer: 4, attribution: C.shortSrc(b.src) });
  });
  C.baseLayers = baseLayers;
  C.setBase = function (id) {
    if (!baseLayers[id]) id = 'ortho';
    if (C.curBase) map.removeLayer(baseLayers[C.curBase]);
    baseLayers[id].addTo(map); C.curBase = id; U.store('base', id);
  };

  /* ---- Calques ---- */
  var ITEMS = C.ITEMS = {}, ORDER = { relief: 10, air: 15, admin: 17, geol: 18, agri: 19, env: 20, veg: 25, regl: 30, eau: 35, sol: 40, cad: 45, bati: 47, fer: 50, gaz: 55, elec: 60 };
  C.GROUPS.forEach(function (g) { g.items.forEach(function (it, i) { it.group = g; it.z = (ORDER[g.id] || 30) * 10 + i; ITEMS[it.id] = it; }); });
  var active = C.active = {};
  (U.storeJSON('layers') || ['rte_aer', 'rte_pyl']).forEach(function (id) { if (ITEMS[id]) active[id] = true; });
  var live = C.liveLayers = {};
  var opac = U.storeJSON('opacity') || {};

  // calques dessinés par un autre fichier : C.specialLayers.<special> = { layers: [...], refresh: fn }
  C.specialLayers = {};
  function buildItem(it) {
    if (C.specialLayers[it.special]) return C.specialLayers[it.special].layers;
    if (it.special === 'vigicrues') return [vigiLayer];
    if (it.special === 'veg_rte') return [vegLayer];
    if (it.special === 'rte_num') return [rteNumLayer];
    if (it.special === 'litho') return [new C.geology.GridLayer({ maxZoom: 21, minZoom: 5, keepBuffer: 2, opacity: opac[it.id] != null ? opac[it.id] : (it.opacity || 1), zIndex: it.z * 4, attribution: 'BRGM' })];
    return it.defs.map(function (d, k) {
      return new C.FallbackLayer(d, {
        maxZoom: 21, maxNativeZoom: d.native[1], minZoom: Math.max(it.minZoom || 0, d.native[0]), keepBuffer: 3,
        opacity: opac[it.id] != null ? opac[it.id] : (it.opacity || 1), zIndex: it.z * 4 + k, attribution: C.shortSrc(it.src)
      });
    });
  }
  /* Ordre d'empilement (premier = au-dessus), calques masqués sans être éteints */
  var hidden = C.hiddenLayers = {};
  (U.storeJSON('hiddenLayers') || []).forEach(function (id) { if (active[id]) hidden[id] = true; });
  var order = C.layerOrder = (U.storeJSON('layerOrder') || []).filter(function (id, i, arr) { return active[id] && arr.indexOf(id) === i; });
  function insertNatural(id) {
    var z = ITEMS[id].z, i = 0;
    while (i < order.length && ITEMS[order[i]].z > z) i++;
    order.splice(i, 0, id);
  }
  Object.keys(active).sort(function (a, b) { return ITEMS[b].z - ITEMS[a].z; }).forEach(function (id) { if (order.indexOf(id) < 0) insertNatural(id); });
  function saveLayerState() {
    U.storeJSON('layers', order.slice());
    U.storeJSON('layerOrder', order.slice());
    U.storeJSON('hiddenLayers', Object.keys(hidden));
  }
  function applyOrder() {
    var n = order.length;
    order.forEach(function (id, i) {
      (live[id] || []).forEach(function (l, k) { if (l.setZIndex) l.setZIndex((n - i) * 4 + k + 10); });
    });
  }
  C.isVectorItem = function (it) { return it.special !== 'litho' && (!!it.special || !it.defs); };
  C.opacityOf = function (id) { var it = ITEMS[id]; return opac[id] != null ? opac[id] : ((it && it.opacity) || 1); };
  C.setActive = function (id, on) {
    var it = ITEMS[id]; if (!it) return;
    if (on) {
      active[id] = true;
      if (order.indexOf(id) < 0) insertNatural(id);
      if (!live[id]) live[id] = buildItem(it);
      applyOrder();
      if (!hidden[id]) {
        live[id].forEach(function (l) { if (!map.hasLayer(l)) l.addTo(map); });
        if (it.special === 'vigicrues') refreshVigicrues();
        if (it.special === 'veg_rte') refreshVector(vegCfg);
        if (it.special === 'rte_num') refreshVector(rteNumCfg);
        if (C.specialLayers[it.special]) C.specialLayers[it.special].refresh();
        if (it.minZoom && map.getZoom() < it.minZoom) U.toast('« ' + it.label + ' » : visible en zoomant davantage', 2500);
      }
    } else {
      delete active[id]; delete hidden[id];
      var i = order.indexOf(id); if (i >= 0) order.splice(i, 1);
      (live[id] || []).forEach(function (l) { map.removeLayer(l); });
      applyOrder();
    }
    saveLayerState();
    C.updateLayerCount();
  };
  C.setHidden = function (id, h) {
    if (!active[id]) return;
    if (h) { hidden[id] = true; (live[id] || []).forEach(function (l) { map.removeLayer(l); }); saveLayerState(); }
    else { delete hidden[id]; saveLayerState(); C.setActive(id, true); }
  };
  C.moveLayer = function (id, to) {
    var i = order.indexOf(id); if (i < 0) return;
    to = Math.max(0, Math.min(order.length - 1, to)); if (to === i) return;
    order.splice(i, 1); order.splice(to, 0, id);
    applyOrder(); saveLayerState();
  };
  C.setLayerOrder = function (ids) {
    var next = ids.filter(function (id) { return active[id]; });
    order.forEach(function (id) { if (next.indexOf(id) < 0) next.push(id); });
    order.length = 0; next.forEach(function (id) { order.push(id); });
    applyOrder(); saveLayerState();
  };
  C.setOpacity = function (id, v) {
    opac[id] = v; U.storeJSON('opacity', opac);
    (live[id] || []).forEach(function (l) { if (l.setOpacity) l.setOpacity(v); });
  };
  C.updateLayerCount = function () {
    var n = Object.keys(active).length, el = $('layerCount');
    el.textContent = n; el.hidden = !n;
  };

  /* ---- Légendes : image officielle, sinon couleurs relevées sur les tuiles affichées ---- */
  C.sampleColors = function (id) {
    var cols = {};
    (live[id] || []).forEach(function (l) {
      var cont = l.getContainer && l.getContainer(); if (!cont) return;
      var imgs = cont.querySelectorAll('img');
      var cv = document.createElement('canvas'); cv.width = cv.height = 32; var cx = cv.getContext('2d', { willReadFrequently: true });
      for (var i = 0; i < Math.min(imgs.length, 12); i++) {
        var im = imgs[i]; if (!im.complete || !im.naturalWidth) continue;
        try {
          cx.clearRect(0, 0, 32, 32); cx.drawImage(im, 0, 0, 32, 32);
          var d = cx.getImageData(0, 0, 32, 32).data;
          for (var p = 0; p < d.length; p += 4) {
            if (d[p + 3] < 160) continue;
            var k = ((d[p] >> 4) << 8) | ((d[p + 1] >> 4) << 4) | (d[p + 2] >> 4);
            cols[k] = (cols[k] || 0) + 1;
          }
        } catch (e) { /* tuile non lisible */ }
      }
    });
    return Object.keys(cols).sort(function (a, b) { return cols[b] - cols[a]; }).slice(0, 3).map(function (k) {
      k = +k; var r = ((k >> 8) & 15) * 17, g = ((k >> 4) & 15) * 17, b = (k & 15) * 17;
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    });
  };
  function swatch(e) {
    var c = U.esc(e.c || '#999');
    if (e.k === 'line') return '<i class="lg-line" style="background:' + c + '"></i>';
    if (e.k === 'dash') return '<i class="lg-line dash" style="color:' + c + '"></i>';
    if (e.k === 'dot') return '<i class="lg-dot" style="background:' + c + '"></i>';
    return '<i style="background:' + c + '"></i>';
  }
  function legendList(list) {
    return '<div class="lg-list">' + list.map(function (e) {
      if (e.k === 'note') return '<p class="muted small lg-note">' + U.esc(e.t) + '</p>';
      if (e.k === 'ramp') return '<div class="lg-ramp"><div class="lg-bar" style="background:linear-gradient(90deg,' + e.c.join(',') + ')"></div><div class="ticks">' + e.ticks.map(function (t) { return '<span>' + U.esc(t) + '</span>'; }).join('') + '</div></div>';
      if (e.k === 'title') return '<div class="lg-title">' + U.esc(e.t) + '</div>';
      return '<div class="lg-row"><span class="sw">' + swatch(e) + '</span><span>' + U.esc(e.t) + '</span></div>';
    }).join('') + '</div>';
  }
  C.legendList = legendList;
  // Clé de lecture de la carte géologique : couleur = âge des terrains, lettres = notation
  var GEOL_KEY = [
    { k: 'title', t: 'Couleur = âge des terrains' },
    { k: 'fill', c: '#fdf6c8', t: 'Quaternaire (alluvions, limons, éboulis) — moins de 2,6 millions d\'années' },
    { k: 'fill', c: '#ffd36b', t: 'Tertiaire (sables, argiles, calcaires lacustres)' },
    { k: 'fill', c: '#9fd38c', t: 'Crétacé (craie, marnes, sables verts)' },
    { k: 'fill', c: '#8fbde6', t: 'Jurassique (calcaires, marnes)' },
    { k: 'fill', c: '#c8a2d6', t: 'Trias (grès, argiles bariolées, gypse)' },
    { k: 'fill', c: '#b3a796', t: 'Primaire (schistes, grès anciens, houiller)' },
    { k: 'fill', c: '#f48a8a', t: 'Roches magmatiques (granites, basaltes)' },
    { k: 'fill', c: '#e9b3d6', t: 'Roches métamorphiques (gneiss, micaschistes)' },
    { k: 'title', t: 'Lettres sur la carte' },
    { k: 'note', t: 'F = alluvions (Fz récentes, Fy, Fx plus anciennes) · C = colluvions · E = éboulis · LP = limons des plateaux · R = altérites · X = remblais · e = Éocène · g = Oligocène · m = Miocène · p = Pliocène · c = Crétacé sup. · n = Crétacé inf. · j = Jurassique · l = Lias · t = Trias · h = Carbonifère · γ = granite. Le chiffre précise l\'étage (1 = le plus ancien).' },
    { k: 'line', c: '#222', t: 'Trait noir épais : faille (pointillé si supposée)' },
    { k: 'note', t: 'Le détail exact de chaque code est dans la notice de la feuille : touche la carte puis « Que trouve-t-on ici ? ».' }
  ];
  C.legendSpec = function (it) {
    if (it.legend === 'geol') return GEOL_KEY;
    if (it.special === 'litho' && C.geology) {
      if (!C.geology.classes) { C.geology.loadLitho().then(function () { C.refreshTab('calques'); }).catch(function () {}); return [{ k: 'note', t: 'Chargement de la légende…' }]; }
      var cl = C.geology.classes;
      var keys = Object.keys(cl).sort(function (a, b) { return (cl[a][1] + cl[a][0]).localeCompare(cl[b][1] + cl[b][0]); }), out = [], last = '';
      keys.forEach(function (k) { if (cl[k][1] !== last) { last = cl[k][1]; out.push({ k: 'title', t: last }); } out.push({ k: 'fill', c: cl[k][2], t: cl[k][0] }); });
      out.push({ k: 'note', t: 'Carte au 1/1 000 000 : donne la famille de roche dominante, pas le détail d\'une parcelle.' });
      return out;
    }
    if (Array.isArray(it.legend)) return it.legend;
    return null;
  };
  C.legendHtml = function (it) {
    if (it.special === 'vigicrues') return ['Pas de vigilance', 'Jaune', 'Orange', 'Rouge'].map(function (t, i) { return '<span class="sw"><i style="background:' + VIGI_COL[i + 1] + '"></i>' + t + '</span>'; }).join('');
    if (it.special === 'veg_rte') return '<span class="sw"><i style="background:#43a047"></i>Végétation à risque</span>';
    if (it.special === 'rte_num') return '<span class="sw"><i style="background:#1565c0"></i>N° de pylône RTE</span>';
    var spec = C.legendSpec(it);
    if (spec) return legendList(spec);
    var urls = C.legendUrls(it);
    if (urls.length) return urls.map(function (u) { return '<img loading="lazy" alt="Légende" src="' + U.esc(u) + '" onerror="this.remove()">'; }).join('');
    var cols = C.sampleColors(it.id);
    if (!cols.length) return '<span class="muted small">Symboles visibles sur la carte une fois chargée</span>';
    return cols.map(function (c) { return '<span class="sw"><i style="background:' + c + '"></i></span>'; }).join('') + '<span class="muted small">couleurs relevées sur la carte</span>';
  };

  /* ---- Vigicrues (via la porte) ---- */
  var VIGI_COL = C.VIGI_COL = { 1: '#2e7d32', 2: '#f2c200', 3: '#ff8c00', 4: '#d50000' };
  var VIGI_TXT = { 1: 'pas de vigilance particulière', 2: 'vigilance jaune', 3: 'vigilance orange', 4: 'vigilance rouge' };
  C.vigiInfo = null;
  var vigiLoading = false;
  var vigiLayer = L.geoJSON(null, {
    style: function (f) { var n = f.properties.niveau || 1; return { color: VIGI_COL[n] || '#2e7d32', weight: n > 1 ? 7 : 4, opacity: 0.9 }; },
    onEachFeature: function (f, l) {
      l.options.bubblingMouseEvents = false;
      l.on('click', function (e) {
        if (C.mapClickHook && C.mapClickHook(e.latlng)) return;
        L.popup().setLatLng(e.latlng).setContent('<b>' + U.esc(f.properties.nom) + '</b><br>' + U.esc(VIGI_TXT[f.properties.niveau] || '') +
          (C.vigiInfo && C.vigiInfo.bulletin ? '<br><small>Bulletin du ' + U.fmtDate(C.vigiInfo.bulletin, true) + '</small>' : '')).openOn(map);
      });
    }
  });
  function refreshVigicrues() {
    if (vigiLoading) return; vigiLoading = true;
    C.callPorte('vigicrues').then(function (j) {
      C.saveData('vigicrues', j.vigicrues); return { data: j.vigicrues, live: true };
    }).catch(function (err) {
      return C.loadData('vigicrues').then(function (c) { if (!c) throw err; return { data: c.data, live: false }; });
    }).then(function (r) {
      vigiLayer.clearLayers(); vigiLayer.addData(r.data);
      C.vigiInfo = { bulletin: r.data.bulletin, live: r.live };
      if (!r.live) {
        var age = (Date.now() - new Date(r.data.bulletin).getTime()) / 3600000;
        U.toast('Vigicrues : copie du bulletin du ' + U.fmtDate(r.data.bulletin, true) + (age > 12 ? ' — information dépassée' : ''), 5000);
      }
      C.refreshTab('calques');
    }).catch(function (e) { U.toast('Vigicrues indisponible : ' + (e.message || e), 4000); })
      .then(function () { vigiLoading = false; });
  }
  C.refreshVigicrues = refreshVigicrues;

  /* ---- Calques vectoriels chargés par zone (végétation RTE, n° pylônes RTE) ---- */
  function z12Bounds(x, y) {
    var n = 4096, la = function (t) { var r = Math.PI - 2 * Math.PI * t / n; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(r) - Math.exp(-r))); };
    return { n: la(y), s: la(y + 1), w: x / n * 360 - 180, e: (x + 1) / n * 360 - 180 };
  }
  C.z12Bounds = z12Bounds;
  C.tileBounds = function (z, x, y) {
    var n = Math.pow(2, z), la = function (t) { var r = Math.PI - 2 * Math.PI * t / n; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(r) - Math.exp(-r))); };
    return { n: la(y), s: la(y + 1), w: x / n * 360 - 180, e: (x + 1) / n * 360 - 180 };
  };
  C.vegUrl = function (x, y) {
    var b = z12Bounds(x, y);
    var where = 'in_bbox(geo_point_2d, ' + b.s.toFixed(5) + ', ' + b.w.toFixed(5) + ', ' + b.n.toFixed(5) + ', ' + b.e.toFixed(5) + ')';
    return 'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/vegetation-emprise-lignes-rte/exports/geojson?where=' + encodeURIComponent(where) + '&limit=-1';
  };
  C.rteNumTileUrl = function (x, y) { return C.rteNumUrl(z12Bounds(x, y)); };
  C.propsHtml = function (p) {
    var rows = [];
    if (p.nom_site && p.url_fiche) {
      return '<b>' + U.esc(p.nom_site) + '</b>' + (p.id_mnhn ? ' <span class="muted small">(' + U.esc(p.id_mnhn) + ')</span>' : '') +
        (p.gest_site ? '<br><span class="muted small">Gestion : ' + U.esc(p.gest_site) + '</span>' : '') +
        '<br><a href="' + U.esc(p.url_fiche) + '" target="_blank" rel="noopener">Fiche officielle INPN ↗</a>';
    }
    for (var k in p) {
      var v = p[k];
      if (v == null || v === '' || typeof v === 'object') continue;
      if (/^(geo_|the_geom|geometry|bbox|gid$|fid$|objectid$|ogc_fid|cleabs|id$|identification_[2-5]|nom_ouvrage_[2-5]|proprietaire_[2-5])/i.test(k)) continue;
      rows.push('<b>' + U.esc(k.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); })) + ' :</b> ' + U.esc(String(v).slice(0, 200)));
      if (rows.length >= 14) break;
    }
    return rows.join('<br>') || '<i>Pas de détail</i>';
  };
  var vegLayer = L.geoJSON(null, {
    style: { color: '#1b5e20', weight: 1, fillColor: '#43a047', fillOpacity: 0.45 },
    pointToLayer: function (f, ll) { return L.circleMarker(ll, { radius: 5, color: '#1b5e20', weight: 1, fillColor: '#43a047', fillOpacity: 0.8 }); },
    onEachFeature: function (f, l) {
      l.options.bubblingMouseEvents = false;
      l.on('click', function (e) { if (C.mapClickHook && C.mapClickHook(e.latlng)) return; L.popup({ maxWidth: 260 }).setLatLng(e.latlng).setContent('<b>Végétation sous ligne RTE</b><br>' + C.propsHtml(f.properties)).openOn(map); });
    }
  });
  var rteNumLayer = L.layerGroup();
  var vegCfg = { id: 'veg_rte', minZoom: 13, url: C.vegUrl, done: {}, warn: false, label: 'Végétation RTE',
    add: function (j) { if (j && j.features) vegLayer.addData(j); } };
  var rteNumCfg = { id: 'rte_num', minZoom: 14, url: C.rteNumTileUrl, done: {}, warn: false, label: 'N° pylônes RTE',
    add: function (j) {
      (j && j.features || []).forEach(function (f) {
        if (!f.geometry || f.geometry.type !== 'Point') return;
        var c = f.geometry.coordinates, p = f.properties || {};
        var m = L.marker([c[1], c[0]], { icon: L.divIcon({ className: 'rte-num', html: '<div>' + U.esc(p.numero_pylone || '?') + '</div>', iconSize: [0, 0] }), interactive: true, keyboard: false });
        m.on('click', function (e) { L.DomEvent.stop(e); if (C.mapClickHook && C.mapClickHook(e.latlng)) return; L.popup().setLatLng(e.latlng).setContent('<b>Pylône RTE ' + U.esc(p.numero_pylone || '') + '</b><br>' + C.propsHtml(p)).openOn(map); });
        rteNumLayer.addLayer(m);
      });
    } };
  function refreshVector(cfg) {
    if (!active[cfg.id] || hidden[cfg.id] || map.getZoom() < cfg.minZoom) return;
    var b = map.getBounds(), z = 12;
    var t1 = map.project(b.getNorthWest(), z).divideBy(256).floor(), t2 = map.project(b.getSouthEast(), z).divideBy(256).floor();
    for (var x = t1.x; x <= t2.x; x++) for (var y = t1.y; y <= t2.y; y++) {
      var k = x + '/' + y; if (cfg.done[k]) continue; cfg.done[k] = 'loading';
      (function (k, u) {
        fetch(u, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (j) { cfg.done[k] = true; cfg.add(j); })
          .catch(function () { delete cfg.done[k]; if (!cfg.warn) { cfg.warn = true; U.toast(cfg.label + ' : source indisponible pour le moment', 4000); } });
      })(k, cfg.url(x, y));
    }
  }
  map.on('moveend', function () { refreshVector(vegCfg); refreshVector(rteNumCfg); });

  /* ---- « Que trouve-t-on ici ? » ---- */
  // hauteur LiDAR (MNH) : on lit la valeur brute (GeoTIFF float32) de quelques pixels autour du point
  function mnhAt(latlng) {
    var p = L.CRS.EPSG3857.project(latlng), h = 1.5;
    var u = 'https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93&STYLES=&CRS=EPSG:3857&BBOX=' +
      [p.x - h, p.y - h, p.x + h, p.y + h].map(function (v) { return v.toFixed(2); }).join(',') + '&WIDTH=3&HEIGHT=3&FORMAT=image/geotiff';
    function get(n) {
      // le serveur LiDAR répond parfois par une erreur passagère : on retente
      return U.withTimeout(fetch(u), 15000).then(function (r) {
        if (!r.ok || !/tiff/.test(r.headers.get('content-type') || '')) throw new Error('mnh ' + r.status);
        return r.arrayBuffer();
      }).catch(function (e) { if (n > 0) return new Promise(function (ok) { setTimeout(ok, 700); }).then(function () { return get(n - 1); }); throw e; });
    }
    return get(2).then(function (buf) {
      var v = readTiffFloats(buf); if (!v || !v.length) return null;
      var ok = v.filter(function (x) { return isFinite(x) && x > -50 && x < 400; });
      return ok.length ? Math.max.apply(null, ok) : null;
    });
  }
  function readTiffFloats(buf) {
    var dv = new DataView(buf), le = dv.getUint16(0) === 0x4949;
    var g16 = function (o) { return dv.getUint16(o, le); }, g32 = function (o) { return dv.getUint32(o, le); };
    var ifd = g32(4), n = g16(ifd), tags = {};
    for (var i = 0; i < n; i++) {
      var e = ifd + 2 + i * 12, tag = g16(e), type = g16(e + 2), cnt = g32(e + 4);
      var val = type === 3 && cnt === 1 ? g16(e + 8) : g32(e + 8);
      tags[tag] = { type: type, cnt: cnt, val: val };
    }
    if (tags[259] && tags[259].val !== 1) return null; // compressé : non lu
    var w = tags[256].val, hgt = tags[257].val, bps = tags[258] ? (tags[258].cnt === 1 ? tags[258].val : 32) : 32;
    var off = tags[273].cnt === 1 ? tags[273].val : g32(tags[273].val);
    var out = [];
    for (var k = 0; k < w * hgt; k++) out.push(bps === 64 ? dv.getFloat64(off + k * 8, le) : dv.getFloat32(off + k * 4, le));
    return out;
  }
  // référence cadastrale au point touché (API Carto IGN)
  C.parcelRef = function (p) { return (p.nom_com || '') + ' — section ' + String(p.section || '?').replace(/^0+/, '') + ' n° ' + String(p.numero || '?').replace(/^0+/, ''); };
  function parcelAt(latlng) {
    var u = 'https://apicarto.ign.fr/api/cadastre/parcelle?geom=' + encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [latlng.lng, latlng.lat] }));
    return U.withTimeout(fetch(u), 12000).then(function (r) { return r.json(); }).then(function (j) {
      var p = j.features && j.features[0] && j.features[0].properties; if (!p) return '';
      return '<div class="card"><h4>Parcelle cadastrale</h4><div><b>' + U.esc(C.parcelRef(p)) + '</b>' + (p.contenance ? ' · ' + U.fmtArea(+p.contenance) : '') + '</div></div>';
    }).catch(function () { return ''; });
  }
  C.queryInfo = function (latlng) {
    var z = map.getZoom(), res = 2 * 20037508.342789244 / (256 * Math.pow(2, z));
    var pt = L.CRS.EPSG3857.project(latlng), h = 50 * res;
    var bbox = [pt.x - h, pt.y - h, pt.x + h, pt.y + h].map(function (v) { return v.toFixed(2); }).join(',');
    var jobs = [], specials = {}, online = U.isOnline();
    Object.keys(active).forEach(function (id) {
      var it = ITEMS[id]; if (!it.info || hidden[id]) return;
      if (it.special_info) specials[it.special_info] = true;
      if (!online) return;
      (it.infoDefs || it.defs || []).forEach(function (d) {
        if (d.kind !== 'wms') return;
        var u = d.base + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=' + d.layers + '&QUERY_LAYERS=' + d.layers +
          '&STYLES=&CRS=EPSG:3857&BBOX=' + bbox + '&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=5&BUFFER=12';
        jobs.push(U.withTimeout(fetch(u, { mode: 'cors' }), 15000).then(function (r) { return r.json(); })
          .then(function (j) { return { it: it, feats: (j && j.features) || [] }; }).catch(function () { return { it: it, feats: [] }; }));
      });
    });
    var extra = [];
    if (specials.geol && C.geology) extra.push(C.geology.infoHtml(latlng.lat, latlng.lng));
    if (specials.parcelle) extra.push(online ? parcelAt(latlng) : Promise.resolve('<p class="muted small">Référence de la parcelle : nécessite du réseau.</p>'));
    if (specials.mnh) extra.push(online ? mnhAt(latlng).then(function (v) {
      return '<div class="card"><h4>Hauteur LiDAR HD</h4><div>' + (v == null ? 'Pas de mesure ici (zone pas encore couverte ou zone protégée).' : 'Hauteur au-dessus du sol : <b>' + (v < 0.5 ? 'moins de 0,5 m' : v.toFixed(1).replace('.', ',') + ' m') + '</b> <span class="muted small">(arbres, bâtiments, pylônes…)</span>') + '</div></div>';
    }).catch(function () { return ''; }) : Promise.resolve(''));
    if (!jobs.length && !extra.length) return Promise.resolve(online ? '<p class="muted">Allume un calque interrogeable (réseaux, environnement, géologie, hauteur LiDAR, PLU, servitudes, bâtiments…) pour l\'interroger.</p>' : '<p class="muted">Nécessite du réseau (sauf la géologie, consultable hors ligne).</p>');
    return Promise.all([Promise.all(extra), Promise.all(jobs)]).then(function (r) {
      var html = r[0].filter(Boolean);
      r[1].forEach(function (x) { x.feats.forEach(function (f) { html.push('<div class="card"><h4>' + U.esc(x.it.label) + '</h4><div>' + C.propsHtml(f.properties || {}) + '</div></div>'); }); });
      if (!online && jobs.length === 0 && Object.keys(active).some(function (id) { return ITEMS[id].info && !ITEMS[id].special_info; })) html.push('<p class="muted small">Les autres calques demandent du réseau.</p>');
      return html.length ? html.join('') : '<p class="muted">Rien trouvé à cet endroit dans les calques affichés.</p>';
    });
  };

  /* ---- Réseau ---- */
  function updateNet() { $('offBadge').hidden = U.isOnline(); }
  window.addEventListener('online', function () { updateNet(); if (active.vigicrues) refreshVigicrues(); if (C.sync) C.sync.run(); });
  window.addEventListener('offline', updateNet);
  updateNet();
  C.setSyncBadge = function (txt, cls) { var b = $('syncBadge'); b.hidden = !txt; b.textContent = txt || ''; b.className = 'badge ' + (cls || ''); };
  $('syncBadge').addEventListener('click', function () { if (C.sync) C.sync.run(true); });

  function zoomClass() { map.getContainer().classList.toggle('far', map.getZoom() < 14); }
  map.on('zoomend', zoomClass); zoomClass();
})();
