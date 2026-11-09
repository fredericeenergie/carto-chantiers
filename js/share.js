/* Carto chantiers — lien de consultation : un seul chantier, en lecture seule, sans la clé, pour une durée choisie.
   Côté propriétaire : créer, copier, supprimer les liens (onglet Export). Côté destinataire : l'appli s'ouvre en « consultation »,
   ne mémorise rien et ne propose que la carte, les calques, les pylônes, la mesure et la recherche. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, esc = U.esc;
  var S = C.share = {};
  var PORTE_OK = /^(https:\/\/script\.google(usercontent)?\.com\/|http:\/\/(127\.0\.0\.1|localhost)[:\/])/; // Apps Script, ou la machine elle-même pour les essais

  function linkOf(token) { return location.origin + location.pathname + '#vue=' + token + '&porte=' + encodeURIComponent(U.store('porte') || ''); }
  function until(ms) { return ms ? 'jusqu\'au ' + U.fmtDate(new Date(ms).toISOString()) : 'sans limite de durée'; }
  function copy(text, okMsg) {
    return (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { U.toast(okMsg || 'Lien copié', 4000); }, function () { return C.promptDialog('Lien de consultation', 'À copier', text, 'Fermer'); });
  }

  /* ======================= Propriétaire : créer et gérer ======================= */
  S.dialog = function () {
    var a = C.activeDoc(), list = [];
    var ready = a && a.source === 'drive' && a.id && !a.dirty;
    var d = C.openDialog({ title: 'Liens de consultation', body:
      '<p class="muted">Un lien ouvre <b>un seul chantier, en lecture seule</b> : carte, calques, pylônes, mesure, Waze. Il ne contient pas ta clé et ne donne accès à rien d\'autre sur ton Drive. Tu peux le supprimer quand tu veux.</p>' +
      '<p class="muted small">Le lien montre le chantier tel qu\'il est enregistré aujourd\'hui : après un « Enregistrer une version », crée un nouveau lien pour montrer la nouvelle.</p>' +
      (ready ? '<div class="card"><b>Nouveau lien pour « ' + esc(U.baseName(a.name)) + ' »</b><div class="seg" id="shDur"><button data-val="7" class="on">7 jours</button><button data-val="30">30 jours</button><button data-val="0">Sans limite</button></div>' +
        '<button class="btn primary big" data-act="create">Créer le lien</button></div>'
        : '<p class="muted">' + (a ? 'Pour créer un lien, « ' + esc(U.baseName(a.name)) + ' » doit d\'abord être enregistré sur le Drive (onglet Chantier → Enregistrer une version).' : 'Ouvre d\'abord le chantier à montrer.') + '</p>') +
      '<h3 class="sec-title">Liens en cours</h3><div id="shList"><div class="empty">Lecture…</div></div>' });
    if (ready) U.pickOne(d.q('#shDur'));
    function draw(l) {
      list = l || []; var box = d.q('#shList'); if (!box) return;
      box.innerHTML = list.length ? list.map(function (p, i) {
        var dead = p.expire && Date.now() > p.expire;
        return '<div class="card"><div class="row"><b class="grow">🔗 ' + esc(p.nom) + '</b><span class="tag ' + (dead ? 'warn' : 'ok') + '">' + (dead ? 'expiré' : 'actif') + '</span></div>' +
          '<div>Créé le ' + U.fmtDate(p.cree) + ' · ' + (dead ? 'expiré depuis le ' + U.fmtDate(new Date(p.expire).toISOString()) : 'valable ' + until(p.expire)) + '</div>' +
          '<div class="row card-actions">' + (dead ? '' : '<button class="btn" data-act="copy" data-i="' + i + '">Copier le lien</button>' + (navigator.share ? '<button class="btn" data-act="send" data-i="' + i + '">↗ Partager</button>' : '')) +
          '<button class="btn danger" data-act="delete" data-i="' + i + '">Supprimer</button></div></div>';
      }).join('') : '<div class="empty">Aucun lien pour l\'instant.</div>';
    }
    function fail(e) {
      var box = d.q('#shList'); if (!box) return;
      var old = /Action inconnue/i.test(e.message || '');
      box.innerHTML = '<div class="empty">' + (old ? 'Cette fonction demande la porte en version 3 : recolle le nouveau <b>Code.gs</b> dans Apps Script, puis <b>Déployer → Gérer les déploiements → ✎ → Nouvelle version</b> (voir README).' : esc(e.message || e)) + '</div>';
      var b = d.q('[data-act=create]'); if (b && old) b.disabled = true;
    }
    d.on({
      create: function (id, b) {
        b.disabled = true;
        C.postPorte('partageCreer', { fichierId: a.id, nom: U.baseName(a.name), jours: +U.picked(d.q('#shDur')) }).then(function (j) {
          b.disabled = false; draw(j.partages);
          copy(linkOf(j.partage.jeton), 'Lien créé et copié : valable ' + until(j.partage.expire));
        }).catch(function (e) { b.disabled = false; if (/Action inconnue/i.test(e.message || '')) fail(e); else U.toast(e.message || String(e), 5000); });
      },
      copy: function (i) { copy(linkOf(list[+i].jeton)); },
      send: function (i) { navigator.share({ title: 'Carto chantiers — ' + list[+i].nom, text: 'Chantier « ' + list[+i].nom + ' » en consultation (' + until(list[+i].expire) + ')', url: linkOf(list[+i].jeton) }).catch(function () {}); },
      'delete': function (i) {
        var p = list[+i];
        C.confirmDialog('Supprimer le lien de consultation de « ' + p.nom + ' » ? Les personnes qui l\'ont reçu ne pourront plus l\'ouvrir.', 'Supprimer', true).then(function (y) {
          if (y) C.postPorte('partageSupprimer', { jeton: p.jeton }).then(function (j) { draw(j.partages); }).catch(function (e) { U.toast(e.message || String(e)); });
        });
      }
    });
    C.callPorte('partages').then(function (j) { draw(j.partages); }).catch(fail);
  };

  /* ======================= Destinataire : consultation ======================= */
  function refuse(msg) {
    C.openDialog({ title: 'Consultation impossible', body: '<p>' + esc(msg) + '</p><p class="muted">Demande un nouveau lien à la personne qui te l\'a envoyé.</p>' });
  }
  S.openView = function () {
    var v = C.viewer;
    document.body.classList.add('viewer');
    ['chantier', 'export'].forEach(function (t) { document.querySelectorAll('[data-tab="' + t + '"]').forEach(function (b) { b.hidden = true; }); });
    $('btnPhoto').hidden = true;
    var badge = $('viewBadge'); badge.hidden = false; badge.textContent = '👁 Lecture seule';
    if (!v.porte || !PORTE_OK.test(v.porte) || !/^[a-f0-9]{16,64}$/.test(v.token)) { refuse('Ce lien de consultation est incomplet ou abîmé.'); return; }
    if (!U.isOnline()) { refuse('Pas de réseau : la consultation demande une connexion.'); return; }
    U.busy(true, 'Ouverture du chantier…');
    U.withTimeout(fetch(v.porte + '?action=partage&jeton=' + encodeURIComponent(v.token), { redirect: 'follow', credentials: 'omit' }), 60000)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        U.busy(false);
        if (!j.ok) throw new Error(j.erreur || 'Lien refusé.');
        if (!j.partage || !j.partage.fichier || j.partage.fichier.type === 'dxf') throw new Error('Ce chantier ne peut pas être consulté par lien.');
        v.info = { nom: j.partage.nom, expire: j.partage.expire };
        C.addSharedDoc(j.partage.fichier);
        badge.textContent = '👁 Lecture seule' + (v.info.expire ? ' · ' + until(v.info.expire) : '');
      })
      .catch(function (e) { U.busy(false); refuse(/Failed to fetch|JSON|timeout|Délai/i.test(e.message || '') ? 'Le chantier n\'a pas pu être chargé. Réessaie dans un instant.' : (e.message || String(e))); });
  };
  S.infoDialog = function () {
    var v = C.viewer || {}, i = v.info;
    C.openDialog({ title: 'Consultation', body: i
      ? '<p>Chantier « <b>' + esc(i.nom) + '</b> », partagé en <b>lecture seule</b>, ' + (i.expire ? 'valable ' + until(i.expire) : 'sans limite de durée') + '.</p><p class="muted">Tu peux regarder la carte, allumer des calques, aller à un pylône, mesurer, chercher une adresse. Rien n\'est modifié ni enregistré.</p>'
      : '<p class="muted">Le chantier partagé n\'est pas chargé.</p>' });
  };
})();
