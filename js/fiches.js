/* Carto chantiers — fiches pylônes (un Google Sheet par chantier) : formulaire, remplissage automatique, import de tableaux, modèle à remplir. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, esc = U.esc, F = C.fiche;
  var FS = {}; // clé chantier → { sheetId, url, rows: {N°: {libellé: valeur}}, dirty: {N°: true}, extras: [libellés importés] }
  var api = C.fiches = {};

  function norm(n) { n = String(n || '').trim(); var c = C.Parse.pylonLabel({ name: n, folder: [] }); return (c || n).replace(/\s+/g, '').toUpperCase(); }
  api.norm = norm;
  function store(key) {
    if (!FS[key]) FS[key] = { sheetId: null, url: null, rows: {}, dirty: {}, extras: [] };
    return FS[key];
  }
  function saveLocal(key) { C.saveData('fiches-' + key, FS[key]); }
  function docByKey(key) { return C.docs.filter(function (d) { return C.docKey(d) === key; })[0]; }

  api.load = function (doc) {
    var key = C.docKey(doc), st = store(key);
    return C.loadData('fiches-' + key).then(function (c) {
      if (c && c.data) { var d = c.data; st.sheetId = d.sheetId; st.url = d.url; st.rows = d.rows || {}; st.dirty = d.dirty || {}; st.extras = d.extras || []; }
      C.renderDoc(doc);
      if (!U.isOnline() || !C.porteConfigured() || doc.source !== 'drive') return;
      return C.callPorte('fiches', { chantier: U.baseName(doc.name).replace(/ \(modifié \d{4}-\d{2}-\d{2}\)$/, ''), parentId: (doc.parent && doc.parent.id) || 'root' }).then(function (j) {
        var r = j.fiches; if (!r.id) return;
        st.sheetId = r.id; st.url = r.url;
        (r.entetes || []).forEach(function (h) { if (h.indexOf(F.IMPORT_PREFIX) === 0 && st.extras.indexOf(h) < 0) st.extras.push(h); });
        (r.lignes || []).forEach(function (row) {
          var n = norm(row['N°']); if (!n || st.dirty[n]) return;
          st.rows[n] = row;
        });
        saveLocal(key); C.renderDoc(doc);
      }).catch(function () {});
    });
  };
  api.statusOf = function (doc, num) {
    if (!doc || !num) return '';
    var st = FS[C.docKey(doc)]; if (!st) return '';
    var r = st.rows[norm(num)]; return r ? (r['Statut'] || '') : '';
  };
  api.rowOf = function (doc, num) { var st = FS[C.docKey(doc)]; return st ? st.rows[norm(num)] || null : null; };
  api.rowsOf = function (doc) { var st = FS[C.docKey(doc)]; return st ? st.rows : {}; };
  api.storeOf = function (doc) { return store(C.docKey(doc)); };

  function setRow(doc, num, values) {
    var key = C.docKey(doc), st = store(key), n = norm(num);
    var row = Object.assign({}, st.rows[n] || {}, values);
    row['N°'] = String(num);
    row['Modifié le'] = U.fmtDate(new Date().toISOString(), true);
    st.rows[n] = row; st.dirty[n] = true;
    saveLocal(key);
    C.sync.add({ t: 'fiches', key: key });
  }
  api.setRow = setRow;

  /* ---- Envoi vers le Google Sheet ---- */
  api.push = function (key) {
    var st = FS[key]; if (!st) return Promise.resolve();
    var doc = docByKey(key);
    var nums = Object.keys(st.dirty); if (!nums.length) return Promise.resolve();
    if (doc && doc.source !== 'drive') return Promise.reject(new Error('Enregistre d\'abord le chantier sur le Drive (onglet Chantier → Enregistrer une version)'));
    var listes = {};
    F.FIELDS.forEach(function (f) { if (f.t === 'choice') listes[f.label] = f.o; });
    var lignes = nums.map(function (n) {
      var r = Object.assign({}, st.rows[n]);
      // coordonnées
      var f = doc && C.pylonsOf(doc).filter(function (p) { return norm(p.pylon) === n; })[0];
      if (f) { r['Latitude'] = f.coords[0].toFixed(7); r['Longitude'] = f.coords[1].toFixed(7); var l = C.geo.L93.fromWGS(f.coords[0], f.coords[1]); r['X Lambert 93'] = l[0].toFixed(2); r['Y Lambert 93'] = l[1].toFixed(2); }
      Object.keys(r).forEach(function (k) { if (/local:/.test(r[k])) r[k] = String(r[k]).replace(/local:[a-z0-9]+/g, '(photo en attente)'); });
      return r;
    });
    return C.postPorte('fichesEcrire', {
      id: st.sheetId || '', chantier: doc ? U.baseName(doc.name).replace(/ \(modifié \d{4}-\d{2}-\d{2}\)$/, '') : key,
      parentId: (doc && doc.parent && doc.parent.id) || 'root', entetes: F.HEADERS.concat(st.extras), lignes: lignes, listes: listes
    }).then(function (j) {
      st.sheetId = j.fiches.id; st.url = j.fiches.url;
      nums.forEach(function (n) { if (!JSON.stringify(st.rows[n]).match(/local:/)) delete st.dirty[n]; });
      saveLocal(key);
      C.refreshTab('chantier');
    });
  };
  api.photoUploaded = function (key, photoUid, ph) {
    var st = FS[key]; if (!st) return;
    Object.keys(st.rows).forEach(function (n) {
      var r = st.rows[n], hit = false;
      Object.keys(r).forEach(function (k) { if (String(r[k]).indexOf('local:' + photoUid) >= 0) { r[k] = String(r[k]).replace('local:' + photoUid, (ph.name || 'photo') + ' | ' + ph.url); hit = true; } });
      if (hit) st.dirty[n] = true;
    });
    saveLocal(key); C.sync.add({ t: 'fiches', key: key });
  };

  /* ---- Export : fiche jointe au point (KMZ) ---- */
  api.appendData = function (doc, f, o) {
    var r = api.rowOf(doc, f.pylon); if (!r) return;
    Object.keys(r).forEach(function (k) {
      if (k === 'N°' || k === 'Latitude' || k === 'Longitude' || !r[k]) return;
      o.data.push([k, String(r[k]).replace(/local:[a-z0-9]+/g, '(photo en attente)')]);
    });
  };
  api.summaryInto = function (el, doc, f) {
    var r = api.rowOf(doc, f.pylon);
    var filled = r ? F.FIELDS.filter(function (x) { return r[x.label]; }).length : 0;
    var box = document.createElement('div'); box.className = 'card';
    box.innerHTML = '<h4>Fiche pylône ' + esc(f.pylon) + ' ' + (r && r['Statut'] ? '<span class="tag ' + (r['Statut'] === 'Validé' ? 'ok' : r['Statut'] === 'Visité' ? 'warn' : 'grey') + '">' + esc(r['Statut']) + '</span>' : (filled ? '<span class="tag grey">en cours</span>' : '<span class="tag grey">vide</span>')) + '</h4>' +
      '<div>' + filled + ' / ' + F.FIELDS.length + ' champs remplis' + (r && r['Type'] ? ' · ' + esc(r['Type']) : '') + (r && r['Famille / modèle'] ? ' · ' + esc(r['Famille / modèle']) : '') + '</div>';
    el.insertBefore(box, el.firstChild);
  };

  // note vocale d'une fiche ou d'un ajout : lien une fois envoyée, « en attente » avant
  api.audioChip = function (line, i) {
    var url = U.safeUrl(String(line).split(' | ')[1]);
    return url ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(url) + '">🎤 Note vocale ' + (i + 1) + '</a>' : '<span class="btn audio-wait">🎤 en attente d\'envoi</span>';
  };
  // Photo rapide : ajoute une photo à une rubrique de la fiche sans ouvrir le formulaire
  api.addPhoto = function (doc, num, fieldKey, blob) {
    var fd = F.BY_KEY[fieldKey] || F.BY_KEY.nota_photos, key = U.uid(), row = api.rowOf(doc, num) || {};
    var name = 'P' + num + '_' + U.isoDay() + '_' + key.slice(-4) + '.jpg';
    return C.sync.putBlob(key, blob).then(function () {
      var vals = {}; vals[fd.label] = (row[fd.label] ? row[fd.label] + '\n' : '') + 'local:' + key;
      if (!row['Auteur']) vals['Auteur'] = U.store('auteur') || 'Frédéric FATTORE';
      setRow(doc, num, vals);
      C.sync.add({ t: 'photo', key: C.docKey(doc), photo: key, name: name, target: 'fiche', chantier: U.baseName(doc.name) });
      C.renderDoc(doc);
      return fd;
    });
  };

  /* ======================= Formulaire ======================= */
  var pending = []; // photos ajoutées pendant l'édition
  api.ficheDialog = function (doc, f) {
    var num = f.pylon, r = Object.assign({}, api.rowOf(doc, num) || {});
    if (!r['Auteur']) r['Auteur'] = U.store('auteur') || 'Frédéric FATTORE';
    pending = [];
    var openSec = U.storeJSON('ficheOpen') || { id: true };
    var html = '<div class="seg" id="fcStat">' + ['À visiter', 'Visité', 'Validé'].map(function (s) { return '<button data-val="' + s + '"' + (r['Statut'] === s ? ' class="on"' : '') + '>' + s + '</button>'; }).join('') + '</div>' +
      '<div class="row fc-auto"><button class="btn" id="fcAuto">⚙ Remplir automatiquement</button><span class="muted small" id="fcAutoMsg"></span></div>' +
      F.SECTIONS.filter(function (s) { return s.id !== 'suivi'; }).concat([F.SECTIONS.filter(function (s) { return s.id === 'suivi'; })[0]]).map(function (s) {
        return '<div class="fsec' + (openSec[s.id] ? ' open' : '') + '" data-sec="' + s.id + '"><button type="button"><span>' + esc(s.label) + '</span><span class="fill" data-fill="' + s.id + '"></span><span class="chev">›</span></button><div class="fbody cols">' +
          s.fields.filter(function (fd) { return fd.k !== 'statut'; }).map(function (fd) { return fieldHtml(fd, r[fd.label]); }).join('') + '</div></div>';
      }).join('');
    var st = store(C.docKey(doc));
    if (st.extras.length) {
      html += '<div class="fsec" data-sec="extras"><button type="button"><span>Infos importées</span><span class="chev">›</span></button><div class="fbody cols">' +
        st.extras.map(function (h) { return '<label class="field"><span>' + esc(h.slice(F.IMPORT_PREFIX.length)) + '</span><input type="text" data-extra="' + esc(h) + '" value="' + esc(r[h] || '') + '"></label>'; }).join('') + '</div></div>';
    }
    if (st.url) html += '<p class="muted small sec-foot">Toutes les fiches du chantier : <a href="' + esc(st.url) + '" target="_blank" rel="noopener">ouvrir le Google Sheet ↗</a></p>';
    var plist = C.pylonsOf(doc), pi = plist.indexOf(f), prev = plist[pi - 1], next = plist[pi + 1];
    var snapshot = null;
    var d = C.openDialog({ title: 'Fiche pylône ' + num + ' — ' + U.baseName(doc.name), wide: true, body: html,
      foot: '<button class="btn" id="fcCancel">Annuler</button>' +
        (prev ? '<button class="btn" id="fcPrev" title="Enregistrer et passer au pylône ' + esc(prev.pylon) + '">◀ ' + esc(prev.pylon) + '</button>' : '') +
        (next ? '<button class="btn" id="fcNext" title="Enregistrer et passer au pylône ' + esc(next.pylon) + '">' + esc(next.pylon) + ' ▶</button>' : '') +
        '<button class="btn primary push" id="fcSave">Enregistrer</button>',
      guard: function () { return pending.length > 0 || JSON.stringify(currentVals()) !== snapshot; } });
    var body = d.body;
    function currentVals() {
      var v = readFields(body); v['Statut'] = U.picked(body.querySelector('#fcStat'));
      body.querySelectorAll('[data-extra]').forEach(function (i) { v[i.getAttribute('data-extra')] = i.value; });
      return v;
    }
    // sections
    body.querySelectorAll('.fsec > button').forEach(function (b) {
      b.onclick = function () { var s = b.parentNode; s.classList.toggle('open'); openSec[s.getAttribute('data-sec')] = s.classList.contains('open'); U.storeJSON('ficheOpen', openSec); };
    });
    // statut : un nouvel appui sur le statut choisi l'efface
    body.querySelectorAll('#fcStat [data-val]').forEach(function (b) {
      b.onclick = function () {
        var on = !b.classList.contains('on');
        body.querySelectorAll('#fcStat [data-val]').forEach(function (x) { x.classList.remove('on'); });
        if (on) b.classList.add('on');
        var dv = body.querySelector('[data-field="date_visite"]');
        if (on && b.getAttribute('data-val') !== 'À visiter' && dv && !dv.value) dv.value = U.isoDay();
      };
    });
    wireFields(body, doc, num);
    updateFill(body);
    body.addEventListener('input', function () { updateFill(body); });
    body.addEventListener('click', function (e) { if (e.target.closest('.chips')) setTimeout(function () { updateFill(body); }, 0); });
    snapshot = JSON.stringify(currentVals());
    d.q('#fcAuto').onclick = function () { autoFill(doc, f, body); };
    d.q('#fcCancel').onclick = function () { C.requestClose(1); };
    if (d.q('#fcPrev')) d.q('#fcPrev').onclick = function () { save(prev); };
    if (d.q('#fcNext')) d.q('#fcNext').onclick = function () { save(next); };
    d.q('#fcSave').onclick = function () { save(null); };
    function save(goTo) {
      var unchanged = !pending.length && JSON.stringify(currentVals()) === snapshot;
      if (unchanged && goTo) { C.closeDialog(1); C.selectFeature(doc, goTo, true); api.ficheDialog(doc, goTo); return; }
      var busyPh = body.querySelectorAll('.ph.wait').length;
      if (busyPh) { U.toast('Photo en cours de préparation…', 1500); setTimeout(function () { save(goTo); }, 600); return; }
      var vals = currentVals();
      if (vals['Auteur']) U.store('auteur', vals['Auteur']);
      // photos à envoyer
      pending.forEach(function (p) { C.sync.add({ t: 'photo', key: C.docKey(doc), photo: p.key, name: p.name, target: 'fiche', chantier: U.baseName(doc.name), sub: p.sub || '' }); });
      pending = [];
      setRow(doc, num, vals);
      C.closeDialog(1); C.renderDoc(doc);
      U.toast('Fiche du pylône ' + num + ' enregistrée' + (U.isOnline() ? '' : ' (envoi au retour du réseau)'), 2500);
      if (goTo) { C.selectFeature(doc, goTo, true); api.ficheDialog(doc, goTo); }
      else if (C.selected() && C.selected().f === f) C.selectFeature(doc, f);
    }
  };
  // Champs courts (texte, nombre, date) : une colonne chacun ; choix, textes longs et photos : toute la largeur (.full)
  function fieldHtml(fd, v) {
    v = v == null ? '' : String(v);
    var short = fd.label.replace(/^[^:]+ : /, ''); short = short.charAt(0).toUpperCase() + short.slice(1);
    var lab = '<span>' + esc(short) + (fd.auto ? '<span class="auto">⚙ auto</span>' : '') + '</span>';
    if (fd.t === 'choice' || fd.t === 'multi') {
      var sel = fd.t === 'multi' ? v.split(/\s*,\s*/) : [v];
      return '<div class="field full" data-field="' + fd.k + '" data-type="' + fd.t + '">' + lab + '<div class="chips">' + fd.o.map(function (o) { return '<button type="button" data-val="' + esc(o) + '"' + (sel.indexOf(o) >= 0 ? ' class="on"' : '') + '>' + esc(o) + '</button>'; }).join('') + '</div></div>';
    }
    if (fd.t === 'long') return '<div class="field full"><span>' + esc(short) + (fd.auto ? '<span class="auto">⚙ auto</span>' : '') + C.voice.buttonHtml() + '</span><textarea data-field="' + fd.k + '" aria-label="' + esc(short) + '">' + esc(v) + '</textarea></div>';
    if (fd.t === 'audio') {
      var notes = v ? v.split(/\n/).filter(Boolean) : [];
      return '<div class="field full" data-field="' + fd.k + '" data-type="audio" data-value="' + esc(v) + '">' + lab + '<div class="audios">' + notes.map(api.audioChip).join('') +
        '<span class="muted small audios-hint"' + (notes.length ? ' hidden' : '') + '>Aucune pour l\'instant : le micro 🎤 d\'une note en ajoute une.</span></div></div>';
    }
    if (fd.t === 'photos') {
      var items = v ? v.split(/\n/).filter(Boolean) : [];
      return '<div class="field full" data-field="' + fd.k + '" data-type="photos" data-value="' + esc(v) + '">' + lab + '<div class="photos">' + items.map(function (it) {
        var url = U.safeUrl(it.split(' | ')[1]); return url ? '<a class="ph" target="_blank" rel="noopener" href="' + esc(url) + '">☁</a>' : '<span class="ph">⏳</span>';
      }).join('') + '<button type="button" class="ph add" data-act="addPhoto" title="Prendre ou choisir des photos">📷</button></div></div>';
    }
    var type = fd.t === 'number' ? 'number' : fd.t === 'date' ? 'date' : 'text';
    return '<label class="field">' + lab + '<input type="' + type + '" ' + (type === 'number' ? 'inputmode="decimal" step="any" ' : '') + 'data-field="' + fd.k + '" value="' + esc(v) + '"></label>';
  }
  function wireFields(body, doc, num) {
    body.querySelectorAll('.chips').forEach(function (ch) {
      var multi = ch.parentNode.getAttribute('data-type') === 'multi';
      ch.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          if (multi) b.classList.toggle('on');
          else { var was = b.classList.contains('on'); ch.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); if (!was) b.classList.add('on'); }
        };
      });
    });
    // dictée : le texte va dans le champ ; l'audio est rangé dans « Nota : notes vocales », nommé d'après le champ dicté
    C.voice.attach(body, function (audio, field) {
      var holder = body.querySelector('[data-field="nota_audio"]'); if (!holder) return;
      var key = U.uid(), d = new Date();
      var name = 'P' + (num || '') + '_' + (field.getAttribute('data-field') || 'note') + '_' + U.isoDay() + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '.' + audio.ext;
      C.sync.putBlob(key, audio.blob).then(function () {
        pending.push({ key: key, name: name, sub: 'Notes vocales' });
        holder.setAttribute('data-value', (holder.getAttribute('data-value') ? holder.getAttribute('data-value') + '\n' : '') + 'local:' + key);
        var hint = holder.querySelector('.audios-hint'); if (hint) hint.hidden = true;
        holder.querySelector('.audios').insertAdjacentHTML('beforeend', '<span class="btn audio-wait">🎤 ' + C.voice.duration(audio.seconds) + ' · à envoyer</span>');
        updateFill(body);
      });
    });
    body.querySelectorAll('[data-act="addPhoto"]').forEach(function (b) {
      b.onclick = function () {
        U.pickFiles('image/*').then(function (files) {
          files.forEach(function (file) {
            var key = U.uid(), name = 'P' + (num || '') + '_' + U.isoDay() + '_' + key.slice(-4) + '.jpg';
            var holder = b.parentNode.parentNode;
            holder.setAttribute('data-value', (holder.getAttribute('data-value') ? holder.getAttribute('data-value') + '\n' : '') + 'local:' + key);
            var s = document.createElement('span'); s.className = 'ph wait'; s.textContent = '…'; b.parentNode.insertBefore(s, b);
            U.compressImage(file).then(function (r) {
              return C.sync.putBlob(key, r.blob).then(function () {
                pending.push({ key: key, name: name });
                s.classList.remove('wait'); s.textContent = ''; if (r.thumb) s.style.backgroundImage = 'url(' + r.thumb + ')';
              });
            });
          });
        });
      };
    });
  }
  function readFields(body) {
    var vals = {};
    F.FIELDS.forEach(function (fd) {
      if (fd.k === 'statut') return;
      var el = body.querySelector('[data-field="' + fd.k + '"]'); if (!el) return;
      var t = el.getAttribute('data-type');
      if (t === 'choice' || t === 'multi') vals[fd.label] = Array.prototype.map.call(el.querySelectorAll('.chips .on'), function (b) { return b.getAttribute('data-val'); }).join(', ');
      else if (t === 'photos' || t === 'audio') vals[fd.label] = el.getAttribute('data-value') || '';
      else vals[fd.label] = el.value;
    });
    return vals;
  }
  function updateFill(body) {
    var vals = readFields(body);
    F.SECTIONS.forEach(function (s) {
      var el = body.querySelector('[data-fill="' + s.id + '"]'); if (!el) return;
      var n = s.fields.filter(function (fd) { return vals[fd.label]; }).length;
      el.textContent = n ? n + ' / ' + s.fields.length : '';
    });
  }

  /* ---- Remplissage automatique (commune, parcelle, portée, environnement) ---- */
  function setVal(body, k, v) { var el = body.querySelector('[data-field="' + k + '"]'); if (el && !el.value && v) { el.value = v; } }
  function geomParam(lat, lon) { return encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] })); }
  function autoFill(doc, f, body) {
    var lat = f.coords[0], lon = f.coords[1], msg = body.querySelector('#fcAutoMsg');
    // portée vers le pylône suivant (ordre des numéros)
    var list = C.pylonsOf(doc), i = list.indexOf(f), nx = list[i + 1];
    if (nx) { setVal(body, 'cab_suivant', nx.pylon); setVal(body, 'cab_portee', Math.round(C.geo.dist(f.coords, nx.coords))); }
    if (!U.isOnline()) { msg.textContent = 'Portée calculée ; commune, parcelle et environnement nécessitent du réseau.'; return; }
    msg.textContent = 'Recherche…';
    var jobs = [
      fetch('https://geo.api.gouv.fr/communes?lat=' + lat + '&lon=' + lon + '&fields=nom,code').then(function (r) { return r.json(); }).then(function (j) { if (j[0]) setVal(body, 'commune', j[0].nom + ' (' + j[0].code + ')'); }),
      fetch('https://apicarto.ign.fr/api/cadastre/parcelle?geom=' + geomParam(lat, lon)).then(function (r) { return r.json(); }).then(function (j) {
        var p = j.features && j.features[0] && j.features[0].properties; if (p) setVal(body, 'parcelle', 'Section ' + (p.section || '?') + ' n° ' + (p.numero || '?') + (p.contenance ? ' (' + p.contenance + ' m²)' : ''));
      }),
      envAt(lat, lon).then(function (t) { if (t) { var el = body.querySelector('[data-field="nota_env"]'); if (el && !el.value) el.value = t; } })
    ];
    Promise.all(jobs.map(function (p) { return p.catch(function () {}); })).then(function () { msg.textContent = 'Champs vides complétés.'; updateFill(body); });
  }
  function envAt(lat, lon) {
    var g = geomParam(lat, lon), out = [];
    var srcs = [['natura-habitat', 'Natura 2000 Habitats'], ['natura-oiseaux', 'Natura 2000 Oiseaux'], ['znieff1', 'ZNIEFF I'], ['znieff2', 'ZNIEFF II'], ['pn', 'Parc national'], ['pnr', 'PNR'], ['rnn', 'Réserve naturelle']];
    var jobs = srcs.map(function (s) {
      return fetch('https://apicarto.ign.fr/api/nature/' + s[0] + '?geom=' + g).then(function (r) { return r.json(); }).then(function (j) {
        (j.features || []).slice(0, 2).forEach(function (ft) { var p = ft.properties || {}; out.push(s[1] + ' : ' + (p.sitename || p.nom || p.nom_site || p.lib_znieff || p.nom_znieff || '(sans nom)')); });
      }).catch(function () {});
    });
    jobs.push(fetch('https://apicarto.ign.fr/api/rpg/v2?annee=2024&geom=' + g).then(function (r) { return r.json(); }).then(function (j) {
      var p = j.features && j.features[0] && j.features[0].properties; if (p) out.push('Culture (RPG 2024) : ' + (p.lbl_cultu || p.code_cultu || p.code_group || '?'));
    }).catch(function () {}));
    return Promise.all(jobs).then(function () { return out.join('\n') || 'Aucune zone environnementale répertoriée au pylône.'; });
  }

  /* ======================= Import de tableaux ======================= */
  var TARGETS = [['', '— Ignorer —'], ['num', 'N° du pylône'], ['lat', 'Latitude (GPS)'], ['lon', 'Longitude (GPS)'], ['x', 'X Lambert 93'], ['y', 'Y Lambert 93']]
    .concat(F.FIELDS.filter(function (f) { return !F.isFile(f); }).map(function (f) { return [f.label, f.label]; }))
    .concat([['extra', 'Infos importées (garder le titre)']]);
  function simplify(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function guess(h) {
    var s = simplify(h);
    if (/^(n|no|num|numero|n pylone|pylone|support|n support|n de pylone|numero pylone)$/.test(s) || /^n\s?°?$/.test(String(h).trim().toLowerCase())) return 'num';
    if (/^(lat|latitude|y gps)/.test(s)) return 'lat';
    if (/^(lon|lng|long|longitude|x gps)/.test(s)) return 'lon';
    if (/^x( l93| lambert| lambert 93)?$/.test(s) || /^x lambert/.test(s)) return 'x';
    if (/^y( l93| lambert| lambert 93)?$/.test(s) || /^y lambert/.test(s)) return 'y';
    for (var i = 0; i < F.FIELDS.length; i++) {
      var f = F.FIELDS[i], a = simplify(f.label), b = simplify(f.label.replace(/^[^:]+ : /, ''));
      if (s === a || s === b) return f.label;
    }
    return 'extra';
  }
  // Une seule entrée pour tout ce qui vient d'un tableau : le fichier, le Google Sheet, et le modèle à remplir.
  api.importDialog = function (opts) {
    opts = opts || {};
    C.choiceDialog(opts.createDoc ? 'Chantier depuis un tableau' : 'Importer un tableau', [
      { v: 'device', ico: '📱', label: 'Fichier de l\'appareil', hint: 'CSV, Excel (.xlsx, .xls) ou ODS' },
      { v: 'drive', ico: '☁', label: 'Google Sheet ou CSV du Drive', hint: 'Parcourir ton Drive' },
      { v: 'model', ico: '⬇', label: 'Obtenir le modèle à remplir', hint: 'Excel avec toutes les colonnes de la fiche et le mode d\'emploi' }
    ]).then(function (src) {
      if (!src) return;
      if (src === 'model') return api.downloadTemplate();
      if (src === 'device') return U.pickFile('.csv,.txt,.xlsx,.xls,.ods').then(function (file) { if (file) api.importFile(file, opts); });
      return C.driveDialog({ mode: 'table' }).then(function (f) {
        if (!f) return null;
        U.busy(true, 'Lecture du tableau…');
        return C.callPorte('lireTableur', { id: f.id }).then(function (j) { return j.valeurs; });
      }).then(function (rows) { U.busy(false); if (rows) mapping(rows, opts); }).catch(function (e) { U.busy(false); U.toast('Lecture impossible : ' + (e.message || e), 6000); });
    });
  };
  api.importFile = function (file, opts) {
    U.busy(true, 'Lecture du tableau…');
    return U.loadScript('vendor/xlsx.full.min.js').then(function () { return C.formats.readTable(file); })
      .then(function (rows) { U.busy(false); if (rows) mapping(rows, opts || {}); })
      .catch(function (e) { U.busy(false); U.toast('Lecture impossible : ' + (e.message || e), 6000); });
  };
  function mapping(rows, opts) {
    rows = rows.filter(function (r) { return r && r.some(function (v) { return String(v).trim() !== ''; }); });
    if (rows.length < 2) { U.toast('Tableau vide ou sans ligne de données'); return; }
    var head = rows[0].map(function (h) { return String(h).trim(); }), data = rows.slice(1);
    var guesses = head.map(guess);
    var chantiers = C.docs.filter(function (d) { return d.role === 'chantier'; }), act = C.activeDoc();
    var html = '<p class="muted">' + data.length + ' ligne(s), ' + head.length + ' colonne(s). Vérifie où va chaque colonne :</p><div class="cols">' +
      head.map(function (h, i) {
        var sample = data.slice(0, 2).map(function (r) { return String(r[i] == null ? '' : r[i]).slice(0, 30); }).filter(Boolean).join(' · ');
        return '<label class="field"><span>' + esc(h || '(colonne ' + (i + 1) + ')') + (sample ? ' <i class="sample">— ex. ' + esc(sample) + '</i>' : '') + '</span><select data-col="' + i + '">' +
          TARGETS.map(function (t) { return '<option value="' + esc(t[0]) + '"' + (t[0] === guesses[i] ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('') + '</select></label>';
      }).join('') + '</div>' +
      '<div class="sep"></div><div class="cols"><label class="field"><span>Chantier concerné</span><select id="imDoc">' +
      chantiers.map(function (d, i) { return '<option value="' + i + '"' + (d === act ? ' selected' : '') + '>' + esc(U.baseName(d.name)) + '</option>'; }).join('') +
      '<option value="new"' + (opts.createDoc || !chantiers.length ? ' selected' : '') + '>➕ Nouveau chantier créé depuis ce tableau</option></select></label>' +
      '<label class="field"><span>Cases déjà remplies dans les fiches</span><select id="imMode"><option value="fill">Compléter seulement les cases vides</option><option value="replace">Remplacer par les valeurs du tableau</option></select></label></div>' +
      '<label class="check"><input type="checkbox" id="imCreate" checked><span class="grow">Créer les pylônes absents du chantier (si le tableau donne leurs coordonnées)</span></label>' +
      '<div id="imPrev" class="card"></div>';
    var d = C.openDialog({ title: 'Importer un tableau', wide: true, body: html, foot: '<button class="btn" id="imCancel">Annuler</button><button class="btn primary push" id="imGo">Importer</button>' });
    function plan() {
      var map = {}; d.qa('[data-col]').forEach(function (s) { map[+s.getAttribute('data-col')] = s.value; });
      var docSel = d.q('#imDoc').value, doc = docSel === 'new' ? null : chantiers[+docSel];
      var numCol = Object.keys(map).filter(function (k) { return map[k] === 'num'; })[0];
      var res = { map: map, doc: doc, rows: [], noNum: 0, known: 0, created: 0, noCoord: 0 };
      if (numCol == null) return res;
      var existing = {}; if (doc) C.pylonsOf(doc).forEach(function (p) { existing[norm(p.pylon)] = p; });
      data.forEach(function (r) {
        var num = String(r[numCol] == null ? '' : r[numCol]).trim();
        if (!num) { res.noNum++; return; }
        var o = { num: num, vals: {}, lat: null, lon: null, x: null, y: null };
        head.forEach(function (h, i) {
          var t = map[i], v = r[i] == null ? '' : String(r[i]).trim(); if (!t || t === 'num' || v === '') return;
          var num2 = parseFloat(v.replace(',', '.'));
          if (t === 'lat') o.lat = num2; else if (t === 'lon') o.lon = num2; else if (t === 'x') o.x = num2; else if (t === 'y') o.y = num2;
          else if (t === 'extra') o.vals[F.IMPORT_PREFIX + (h || 'Colonne ' + (i + 1))] = v;
          else o.vals[t] = v;
        });
        if ((o.lat == null || o.lon == null) && o.x != null && o.y != null && isFinite(o.x) && isFinite(o.y)) { var w = C.geo.L93.toWGS(o.x, o.y); o.lat = w[0]; o.lon = w[1]; }
        o.hasCoord = isFinite(o.lat) && isFinite(o.lon) && o.lat != null && o.lon != null;
        o.exists = !!existing[norm(num)];
        if (o.exists) res.known++; else if (o.hasCoord) res.created++; else res.noCoord++;
        res.rows.push(o);
      });
      return res;
    }
    function preview() {
      var p = plan();
      if (!p.rows.length) { d.q('#imPrev').innerHTML = '<b>Choisis la colonne « N° du pylône ».</b>'; return; }
      d.q('#imPrev').innerHTML = '<h4>Aperçu</h4><div>' + p.rows.length + ' pylône(s) dans le tableau : ' + p.known + ' déjà présents, ' + p.created + ' à créer (coordonnées fournies)' +
        (p.noCoord ? ', <b>' + p.noCoord + ' inconnus sans coordonnées</b> (fiche créée quand même)' : '') + (p.noNum ? ' · ' + p.noNum + ' ligne(s) sans N° ignorée(s)' : '') + '.</div>';
    }
    d.body.addEventListener('change', preview); preview();
    d.q('#imCancel').onclick = function () { C.closeDialog(1); };
    d.q('#imGo').onclick = function () {
      var p = plan(); if (!p.rows.length) { U.toast('Choisis la colonne du N° de pylône'); return; }
      var doc = p.doc, replace = d.q('#imMode').value === 'replace', create = d.q('#imCreate').checked;
      var go = doc ? Promise.resolve(doc) : C.promptDialog('Nouveau chantier', 'Nom du chantier', 'Chantier importé ' + U.isoDay(), 'Créer').then(function (n) {
        if (!n) return null;
        return C.createDocFromPoints(n);
      });
      go.then(function (doc) {
        if (!doc) return;
        var st = store(C.docKey(doc)), existing = {}, added = 0;
        C.pylonsOf(doc).forEach(function (f) { existing[norm(f.pylon)] = f; });
        p.rows.forEach(function (o) {
          if (!existing[norm(o.num)] && o.hasCoord && create) {
            var f = C.tagPylon({ uid: U.uid(), kind: 'point', name: o.num, coords: [o.lat, o.lon], folder: ['Pylônes'], data: [], style: {} });
            if (!f.pylon) f.pylon = o.num;
            doc.feats.push(f); existing[norm(o.num)] = f; added++;
          }
          Object.keys(o.vals).forEach(function (k) { if (k.indexOf(F.IMPORT_PREFIX) === 0 && st.extras.indexOf(k) < 0) st.extras.push(k); });
          var cur = st.rows[norm(o.num)] || {}, vals = {};
          Object.keys(o.vals).forEach(function (k) { if (replace || !cur[k]) vals[k] = o.vals[k]; });
          var label = existing[norm(o.num)] ? existing[norm(o.num)].pylon : o.num;
          if (Object.keys(vals).length || !st.rows[norm(o.num)]) setRow(doc, label, vals);
        });
        if (added) { C.markDirty(doc); }
        C.renderDoc(doc); C.closeDialog(1); C.fitDocs(doc);
        U.toast(p.rows.length + ' fiche(s) importée(s)' + (added ? ', ' + added + ' pylône(s) créé(s) — pense à enregistrer une version (onglet Chantier)' : ''), 6000);
      });
    };
  }
  C.createDocFromPoints = function (name) {
    var doc = { uid: U.uid(), id: null, name: name + '.kmz', parent: { id: 'root', name: 'Mon Drive' }, source: 'new', role: 'chantier', feats: [], images: {}, visible: true, hidden: {}, editing: false, dirty: true, group: L.featureGroup() };
    C.docs.push(doc); U.store('activeDoc', doc.uid); C.saveOpenList(); C.persistDoc(doc); C.updateChip();
    return doc;
  };

  api.downloadTemplate = function () {
    var doc = C.activeDoc();
    U.busy(true, 'Préparation du modèle…');
    return U.loadScript('vendor/xlsx.full.min.js').then(function () {
      var buf = C.formats.templateWorkbook(doc ? C.pylonsOf(doc).map(function (f) { return { pylon: f.pylon, lat: f.coords[0], lon: f.coords[1] }; }) : []);
      U.busy(false);
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      return C.deliverDialog(blob, 'Modèle import fiches' + (doc ? ' - ' + U.baseName(doc.name) : '') + '.xlsx');
    }).catch(function (e) { U.busy(false); U.toast(e.message || String(e)); });
  };
})();
