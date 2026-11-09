/* Carto chantiers — dictée vocale : le texte reconnu va dans la note, l'enregistrement audio est gardé à part
   (dossier « Notes vocales » du dossier des photos du chantier). Selon l'appareil, on obtient le texte, l'audio ou les deux. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var ANDROID = /Android/i.test(navigator.userAgent);
  var MAX_SECONDS = 300;
  var V = C.voice = {};

  V.canRecord = function () { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); };
  V.supported = function () { return !!SR || V.canRecord(); };
  // bouton micro à placer dans le libellé d'un champ texte
  V.buttonHtml = function () { return V.supported() ? '<button type="button" class="mic" data-act="mic" title="Dicter" aria-label="Dicter">🎤</button>' : ''; };

  var cur = null; // une seule dictée à la fois

  // Lance la dictée. Résout avec { text, audio } (audio = { blob, mime, ext, seconds } ou null), ou null si annulée.
  V.dictate = function () {
    if (cur) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var st = cur = { text: '', chunks: [], peak: 0, t0: Date.now(), active: true, srErr: '' };
      var bar = document.createElement('div'); bar.className = 'voice-bar'; bar.id = 'voiceBar';
      bar.innerHTML = '<div class="row"><span class="voice-dot"></span><b id="vcTime">0:00</b><span class="muted grow" id="vcNote">Parle, je note…</span></div>' +
        '<div class="voice-text" id="vcText"></div>' +
        '<div class="row"><button class="btn" id="vcCancel">Annuler</button><button class="btn primary push" id="vcDone">Terminer</button></div>';
      document.body.appendChild(bar);
      function q(id) { return bar.querySelector('#' + id); }
      function note(t) { q('vcNote').textContent = t; }
      function live(extra) { q('vcText').textContent = (st.text + (extra || '')).trim(); }
      var tick = setInterval(function () {
        var s = Math.round((Date.now() - st.t0) / 1000);
        q('vcTime').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        if (s >= MAX_SECONDS) finish(true);
      }, 500);

      /* --- texte : reconnaissance vocale du navigateur --- */
      function startText(track) {
        if (!SR) { note(st.mr ? 'Texte indisponible sur cet appareil : l\'audio est enregistré.' : 'Dictée indisponible sur cet appareil.'); return; }
        var r = st.rec = new SR(); r.lang = 'fr-FR'; r.interimResults = true;
        r.continuous = !ANDROID; // sur Android, le mode continu répète les mots : on enchaîne des écoutes courtes
        r.onresult = function (e) {
          var inter = '';
          for (var i = e.resultIndex; i < e.results.length; i++) {
            var t = e.results[i][0].transcript;
            if (e.results[i].isFinal) st.text += t.trim() + ' '; else inter += t;
          }
          live(inter);
        };
        r.onerror = function (e) {
          if (e.error === 'no-speech' || e.error === 'aborted') return;
          st.srErr = e.error;
          var why = e.error === 'network' ? 'Pas de réseau pour le texte' : (e.error === 'not-allowed' || e.error === 'service-not-allowed') ? 'Dictée en texte refusée' : 'Texte indisponible';
          note(st.mr ? why + ' : l\'audio est enregistré.' : why + '.');
        };
        r.onend = function () { if (st.active && !st.srErr) { try { r.start(); } catch (e) { /* déjà relancée */ } } };
        // quand le navigateur le permet, la reconnaissance écoute la même prise de son que l'enregistrement
        try { if (track) r.start(track); else r.start(); } catch (e) { try { r.start(); } catch (e2) { st.srErr = 'start'; } }
      }

      /* --- audio : enregistrement, avec mesure du niveau pour écarter un fichier muet --- */
      function startAudio() {
        if (!V.canRecord()) { startText(null); return; }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          if (!st.active) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
          st.stream = stream;
          try {
            var mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0];
            st.mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
            st.mr.ondataavailable = function (e) { if (e.data && e.data.size) st.chunks.push(e.data); };
            st.mr.start(1000);
          } catch (e) { st.mr = null; }
          try {
            var AC = window.AudioContext || window.webkitAudioContext; st.ac = new AC();
            if (st.ac.resume) st.ac.resume().catch(function () { /* mesure indisponible */ });
            // fenêtre de 8192 échantillons (≈ 0,17 s) lue toutes les 150 ms : tout le son est écouté, un mot bref n'échappe pas à la mesure
            var an = st.ac.createAnalyser(); an.fftSize = 8192; st.ac.createMediaStreamSource(stream).connect(an);
            var buf = new Uint8Array(an.fftSize);
            st.meter = setInterval(function () {
              if (st.ac.state !== 'running') return; // mesure en pause (certains iPhone) : on ne conclut pas au silence
              an.getByteTimeDomainData(buf); var m = 0;
              for (var i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i] - 128));
              st.peak = Math.max(st.peak, m / 128);
              st.measured = true;
            }, 150);
          } catch (e) { /* pas de mesure possible : on garde l'audio */ }
          startText(stream.getAudioTracks()[0]);
        }, function () {
          note('Micro refusé : autorise le micro pour l\'appli.'); st.denied = true;
        });
      }

      function finish(keep) {
        if (!st.active) return;
        st.active = false; clearInterval(tick); clearInterval(st.meter);
        try { if (st.rec) st.rec.stop(); } catch (e) { /* rien */ }
        function done(blob) {
          if (st.stream) st.stream.getTracks().forEach(function (t) { t.stop(); });
          if (st.ac) { try { st.ac.close(); } catch (e) { /* rien */ } }
          var seconds = Math.round((Date.now() - st.t0) / 1000);
          // les derniers mots arrivent juste après l'arrêt de l'écoute
          setTimeout(function () {
            bar.remove(); cur = null;
            if (!keep) { resolve(null); return; }
            var type = (blob && blob.type) || '';
            var heard = !st.measured || st.peak > 0.03; // sans mesure du niveau, l'enregistrement est gardé
            var audio = blob && blob.size > 1500 && heard && seconds >= 1
              ? { blob: blob, mime: type || 'audio/webm', ext: /mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm', seconds: seconds } : null;
            resolve({ text: st.text.trim(), audio: audio });
          }, keep && st.rec && !st.srErr ? 700 : 0);
        }
        if (st.mr && st.mr.state !== 'inactive') {
          st.mr.onstop = function () { done(new Blob(st.chunks, { type: st.mr.mimeType || 'audio/webm' })); };
          try { st.mr.stop(); } catch (e) { done(null); }
        } else done(null);
      }
      q('vcCancel').onclick = function () { finish(false); };
      q('vcDone').onclick = function () { finish(true); };
      st.finish = finish;
      startAudio();
    });
  };
  V.cancel = function () { if (cur && cur.finish) cur.finish(false); };

  // Branche les boutons micro d'un formulaire. onAudio(audio, champ) reçoit l'enregistrement à ranger, s'il y en a un.
  V.attach = function (root, onAudio) {
    root.querySelectorAll('[data-act="mic"]').forEach(function (b) {
      b.onclick = function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var box = b.closest('.field'), field = box && box.querySelector('textarea, input[type=text]');
        if (!field) return;
        b.classList.add('on');
        V.dictate().then(function (res) {
          b.classList.remove('on');
          if (!res || !field.isConnected) return;
          if (res.text) {
            field.value = (field.value ? field.value.replace(/\s+$/, '') + ' ' : '') + res.text;
            field.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (res.audio && onAudio) onAudio(res.audio, field);
          U.toast(res.text && res.audio ? 'Note dictée : texte et audio' : res.text ? 'Note dictée' : res.audio ? 'Note vocale enregistrée (sans texte)' : 'Rien entendu', 2500);
        });
      };
    });
  };
  V.duration = function (s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
})();
