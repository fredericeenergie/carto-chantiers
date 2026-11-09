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
      var t = $('toast');
      t.innerHTML = 'Nouvelle version de l\'appli installée. <button class="btn toast-btn" id="btnReload">Recharger</button>';
      t.style.display = 'block'; clearTimeout(U.toast._t);
      $('btnReload').onclick = function () { location.reload(); };
      U.toast._t = setTimeout(function () { t.style.display = 'none'; }, 20000);
    });
  }
  // à l'ordinateur le panneau reste ouvert ; par défaut sur l'onglet de préparation du chantier
  if (U.isDesktop()) C.openPanel(U.store('tab') || 'chantier');
  window.addEventListener('resize', U.debounce(function () { if (U.isDesktop()) C.openPanel(); }, 300));

  // une adresse /dev déjà enregistrée (ancien lien) ne marche pas : on l'efface pour repartir des réglages
  if (/\/dev\/?$/.test(U.store('porte') || '')) { U.store('porte', ''); if (!C._devLink) U.toast('Adresse de porte en /dev effacée : il faut celle en /exec', 6000); }
  if (C._devLink) {
    /* la fenêtre d'explication s'ouvre seule */
  } else if (!C.porteConfigured()) {
    C.settingsDialog();
  } else {
    if (C._justConfigured) U.toast('Porte Drive configurée ✓', 3000);
    C.restoreOpenDocs().then(function (n) {
      if (n) { C.fitDocs(C.activeDoc()); } else C.chantiersDialog();
      C.sync.run();
    }).catch(function () { C.chantiersDialog(); });
    C.callPorte('ping').then(function (j) { if (j.version < 2) U.toast('Ta porte Apps Script est en version 1 : recolle le nouveau Code.gs (voir README) pour les nouvelles fonctions', 8000); }).catch(function () {});
  }
})();
