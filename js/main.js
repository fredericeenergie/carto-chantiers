/* Carto chantiers — position de l'utilisateur et démarrage de l'appli. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, map = C.map;

  /* ======================= Position ======================= */
  // 1er appui : centre sur toi et te suit ; tu bouges la carte → le suivi s'arrête (la position reste affichée) ; appui suivant : recentre / arrête.
  var me = null, meAcc = null, watch = null, follow = false, firstFix = true;
  function setLocBtn() { var b = $('btnLocate'); b.classList.toggle('on', watch != null); b.classList.toggle('follow', follow); b.title = watch == null ? 'Ma position' : follow ? 'Arrêter le suivi' : 'Recentrer sur ma position'; }
  function stopLocate() {
    if (watch != null) navigator.geolocation.clearWatch(watch);
    watch = null; follow = false;
    if (me) { map.removeLayer(me); map.removeLayer(meAcc); me = meAcc = null; }
    setLocBtn();
  }
  function onPos(pos) {
    var ll = [pos.coords.latitude, pos.coords.longitude];
    if (!me) {
      meAcc = L.circle(ll, { radius: pos.coords.accuracy, color: '#1a73e8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
      me = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1, interactive: false }).addTo(map);
    } else { me.setLatLng(ll); meAcc.setLatLng(ll).setRadius(pos.coords.accuracy); }
    if (follow) { if (firstFix) map.setView(ll, Math.max(map.getZoom(), 16)); else map.panTo(ll, { animate: true }); }
    firstFix = false;
  }
  /* Position d'une prise de vue : le GPS est écouté dès l'appui sur le bouton photo, et lu au retour de la photo.
     get(attente) résout avec { ll: [lat, lon], acc } — acc = précision en mètres —, ou null si aucune position n'arrive. */
  C.trackPosition = function () {
    var last = null, id = null, wake = null, guard = null;
    function live() { return me ? { ll: [me.getLatLng().lat, me.getLatLng().lng], acc: meAcc ? meAcc.getRadius() : 0 } : null; }
    function stop() { if (id != null) { navigator.geolocation.clearWatch(id); id = null; } clearTimeout(guard); }
    if (navigator.geolocation && watch == null) {
      id = navigator.geolocation.watchPosition(function (pos) { last = { ll: [pos.coords.latitude, pos.coords.longitude], acc: pos.coords.accuracy || 0 }; if (wake) wake(); },
        function (err) { if (err && err.code === 1) { stop(); if (wake) wake(); } }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
      guard = setTimeout(stop, 180000); // prise de vue abandonnée sans prévenir : le GPS ne reste pas allumé
    }
    return {
      stop: stop,
      get: function (wait, goodEnough) {
        return new Promise(function (ok) {
          var limit = goodEnough || 50, t = null, poll = null;
          function cur() { return live() || last; }
          function fine() { var c = cur(); return !!c && c.acc <= limit; }
          function done() { clearTimeout(t); clearInterval(poll); wake = null; stop(); ok(cur()); }
          if (fine() || (id == null && watch == null)) { done(); return; }
          t = setTimeout(done, wait || 6000);
          poll = setInterval(function () { if (fine()) done(); }, 400);  // suivi de position déjà en marche : on lit son point
          wake = function () { if (id == null || fine()) done(); };      // position précise reçue, ou GPS refusé
        });
      }
    };
  };
  $('btnLocate').addEventListener('click', function () {
    if (!navigator.geolocation) { U.toast('Position indisponible sur cet appareil'); return; }
    if (watch != null && follow) { stopLocate(); U.toast('Suivi de position arrêté', 1500); return; }
    if (watch != null) { follow = true; setLocBtn(); if (me) map.setView(me.getLatLng(), Math.max(map.getZoom(), 16)); return; }
    follow = true; firstFix = true; setLocBtn();
    U.toast('Recherche de ta position…', 2000);
    watch = navigator.geolocation.watchPosition(onPos, function (err) {
      if (err && err.code === 1) { stopLocate(); U.toast('Position refusée : autorise la localisation pour l\'appli', 4500); }
      else if (!me) U.toast('Position introuvable pour l\'instant (ciel dégagé, GPS activé ?)', 4000);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
  });
  map.on('dragstart', function () { if (follow) { follow = false; setLocBtn(); } });

  /* ======================= Démarrage ======================= */
  C.setBase(U.store('base') || 'ortho');
  Object.keys(C.active).forEach(function (id) { C.setActive(id, true); });
  C.updateLayerCount();
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // vérifie s'il existe une nouvelle version à chaque retour sur l'appli
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }
      U.toastAction('Nouvelle version de l\'appli installée.', 'Recharger', function () { location.reload(); }, 20000);
    });
  }
  // à l'ordinateur le panneau reste ouvert ; par défaut sur l'onglet de préparation du chantier
  if (U.isDesktop()) C.openPanel(U.store('tab') || (C.viewer ? 'calques' : 'chantier'));
  window.addEventListener('resize', U.debounce(function () { if (U.isDesktop()) C.openPanel(); }, 300));

  // une adresse /dev déjà enregistrée (ancien lien) ne marche pas : on l'efface pour repartir des réglages
  if (/\/dev\/?$/.test(U.store('porte') || '')) { U.store('porte', ''); if (!C._devLink) U.toast('Adresse de porte en /dev effacée : il faut celle en /exec', 6000); }
  if (C._badLink) setTimeout(function () { U.toast('Lien d\'installation refusé : son adresse n\'est pas une porte Apps Script.', 7000); }, 1500);
  if (C.viewer) {
    C.share.openView(); // lien de consultation : un seul chantier, en lecture seule, rien n'est mémorisé
  } else if (C._devLink) {
    /* la fenêtre d'explication s'ouvre seule */
  } else if (!C.porteConfigured()) {
    C.settingsDialog();
  } else {
    if (C._justConfigured) U.toast('Porte Drive configurée ✓', 3000);
    // lien d'installation d'une AUTRE porte que celle de l'appareil : jamais remplacée sans accord (tes envois partiraient ailleurs)
    if (C._otherPorte) setTimeout(function () {
      C.confirmDialog('Ce lien d\'installation règle une autre porte Drive que celle de cet appareil. Si tu la remplaces, l\'appli lira et enregistrera sur l\'autre Drive. Ne le fais que si ce lien vient de ton propre Apps Script.', 'Remplacer la porte', true, 'Garder la mienne').then(function (y) {
        if (!y) { U.toast('Porte inchangée', 2500); return; }
        U.store('porte', C._otherPorte.porte); U.store('cle', C._otherPorte.cle); location.reload();
      });
    }, 1200);
    C.restoreOpenDocs().then(function (n) {
      if (n) { C.fitDocs(C.activeDoc()); } else C.chantiersDialog();
      C.sync.run();
    }).catch(function () { C.chantiersDialog(); });
    // porte plus ancienne que l'appli : un rappel, pas plus d'une fois par semaine
    C.callPorte('ping').then(function (j) {
      if (j.version >= 3 || Date.now() - (+U.store('porteRappel') || 0) < 7 * 86400000) return;
      U.store('porteRappel', String(Date.now()));
      setTimeout(function () { U.toast('Ta porte Apps Script est en version ' + j.version + ' : recolle le nouveau Code.gs (voir README) pour les liens de consultation et le dossier « Notes vocales ».', 9000); }, 4000);
    }).catch(function () {});
  }
})();
