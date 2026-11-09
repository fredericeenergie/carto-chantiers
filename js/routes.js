/* Carto chantiers — calque « Routes et chemins » (BD TOPO® IGN) : praticabilité par couleur, limites connues en étiquettes.
   Les limites de tonnage, de hauteur et de largeur sont rarement renseignées dans la BD TOPO : leur absence ne garantit rien. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, map = C.map;
  var ID = 'routes', TILE_Z = 14, MIN_ZOOM = 15;
  var PROPS = 'nature,largeur_de_chaussee,acces_vehicule_leger,restriction_de_poids_total,restriction_de_poids_par_essieu,restriction_de_hauteur,restriction_de_largeur,restriction_de_longueur,prive,position_par_rapport_au_sol,cpx_numero,nom_voie_ban_gauche,geometrie';

  // tronçons d'une dalle (zoom 14), avec seulement les attributs utiles : dix fois moins lourd que la réponse complète
  C.routesUrl = function (x, y) {
    var b = C.tileBounds(TILE_Z, x, y);
    return 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:troncon_de_route&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&COUNT=5000&PROPERTYNAME=' + PROPS +
      '&BBOX=' + [b.s, b.w, b.n, b.e].map(function (v) { return v.toFixed(5); }).join(',') + ',urn:ogc:def:crs:EPSG::4326';
  };

  /* ---- Praticabilité ---- */
  var CLASSES = {
    route:     { c: '#2e7d32', w: 4,   t: 'Route revêtue (3,5 m et plus, ou largeur inconnue)' },
    etroite:   { c: '#f9a825', w: 4,   t: 'Route revêtue étroite (moins de 3,5 m)' },
    empierree: { c: '#ef6c00', w: 3.5, t: 'Route empierrée' },
    chemin:    { c: '#8d6e63', w: 3,   t: 'Chemin de terre', dash: '8 6' },
    pied:      { c: '#c62828', w: 2.5, t: 'Sentier, escalier ou passage impossible en véhicule', dash: '2 6' },
    restreint: { c: '#6a1b9a', w: 3.5, t: 'Accès restreint (ayants droit, voie privée)', dash: '10 5' }
  };
  function classOf(p) {
    var n = p.nature || '', acc = p.acces_vehicule_leger || '';
    if (acc === 'Physiquement impossible' || n === 'Sentier' || n === 'Escalier' || n === 'Piste cyclable') return 'pied';
    if (acc === 'Restreint aux ayants droit' || p.prive === true) return 'restreint';
    if (n === 'Chemin') return 'chemin';
    if (n === 'Route empierrée') return 'empierree';
    var w = +p.largeur_de_chaussee || 0;
    return w && w < 3.5 ? 'etroite' : 'route';
  }
  function num(v) { return String(v).replace('.', ','); }
  // limites à afficher : le tonnage total, la hauteur, la largeur, la longueur ; l'essieu seulement sous les 13 t légales
  function limits(p) {
    var out = [];
    if (p.restriction_de_poids_total) out.push(num(p.restriction_de_poids_total) + ' t');
    if (p.restriction_de_poids_par_essieu && +p.restriction_de_poids_par_essieu < 13) out.push(num(p.restriction_de_poids_par_essieu) + ' t/essieu');
    if (p.restriction_de_hauteur) out.push('↕ ' + num(p.restriction_de_hauteur) + ' m');
    if (p.restriction_de_largeur) out.push('↔ ' + num(p.restriction_de_largeur) + ' m');
    if (p.restriction_de_longueur) out.push('long. ' + num(p.restriction_de_longueur) + ' m');
    return out;
  }
  var legend = Object.keys(CLASSES).map(function (k) { return { k: CLASSES[k].dash ? 'dash' : 'line', c: CLASSES[k].c, t: CLASSES[k].t }; })
    .concat([{ k: 'note', t: 'Étiquettes : limites connues (tonnage, hauteur ↕, largeur ↔). Elles sont rarement renseignées : sans étiquette, rien n\'est garanti. Touche un tronçon pour son détail.' }]);

  function popupHtml(p) {
    var lim = limits(p), rows = ['<b>' + U.esc(p.nom_voie_ban_gauche || p.cpx_numero || p.nature || 'Tronçon') + '</b>', U.esc(CLASSES[classOf(p)].t)];
    if (p.nature) rows.push('Nature : ' + U.esc(p.nature));
    if (p.largeur_de_chaussee) rows.push('Largeur de chaussée : ' + num(p.largeur_de_chaussee) + ' m');
    if (p.acces_vehicule_leger) rows.push('Accès véhicule : ' + U.esc(p.acces_vehicule_leger.toLowerCase()));
    if (+p.position_par_rapport_au_sol > 0) rows.push('Sur pont ou en hauteur'); else if (+p.position_par_rapport_au_sol < 0) rows.push('En tunnel ou en tranchée couverte');
    rows.push(lim.length ? '<b>Limites : ' + U.esc(lim.join(' · ')) + '</b>' : '<span class="muted small">Aucune limite connue dans la BD TOPO.</span>');
    return rows.join('<br>');
  }

  /* ---- Dessin : tronçons sur un canevas (des milliers de traits), étiquettes en marqueurs ---- */
  var lines = L.geoJSON(null, {
    renderer: L.canvas({ padding: 0.3, tolerance: 6 }),
    style: function (f) { var k = CLASSES[classOf(f.properties || {})]; return { color: k.c, weight: k.w, opacity: 0.85, dashArray: k.dash || null }; },
    onEachFeature: function (f, l) {
      l.options.bubblingMouseEvents = false;
      l.on('click', function (e) { if (C.mapClickHook && C.mapClickHook(e.latlng)) return; L.popup({ maxWidth: 260 }).setLatLng(e.latlng).setContent(popupHtml(f.properties || {})).openOn(map); });
    }
  });
  var labels = L.layerGroup(), group = L.layerGroup([lines, labels]);
  var done = {}, seen = {}, warned = false;

  function add(j) {
    var fresh = (j && j.features || []).filter(function (f) {
      if (!f.geometry || f.geometry.type !== 'LineString') return false;
      var id = f.id || JSON.stringify(f.geometry.coordinates[0]);
      if (seen[id]) return false; // un tronçon à cheval sur deux dalles n'est dessiné qu'une fois
      seen[id] = 1; return true;
    });
    if (!fresh.length) return;
    lines.addData({ type: 'FeatureCollection', features: fresh });
    fresh.forEach(function (f) {
      var lim = limits(f.properties || {}); if (!lim.length) return;
      var cs = f.geometry.coordinates, mid = cs[Math.floor(cs.length / 2)];
      var m = L.marker([mid[1], mid[0]], { icon: L.divIcon({ className: 'rd-lim', html: '<div>' + U.esc(lim.join(' · ')) + '</div>', iconSize: [0, 0] }), keyboard: false });
      m.on('click', function (e) { L.DomEvent.stop(e); if (C.mapClickHook && C.mapClickHook(e.latlng)) return; L.popup({ maxWidth: 260 }).setLatLng(e.latlng).setContent(popupHtml(f.properties)).openOn(map); });
      labels.addLayer(m);
    });
  }
  function refresh() {
    if (!C.active[ID] || C.hiddenLayers[ID] || map.getZoom() < MIN_ZOOM) return;
    var b = map.getBounds();
    var t1 = map.project(b.getNorthWest(), TILE_Z).divideBy(256).floor(), t2 = map.project(b.getSouthEast(), TILE_Z).divideBy(256).floor();
    for (var x = t1.x; x <= t2.x; x++) for (var y = t1.y; y <= t2.y; y++) {
      var k = x + '/' + y; if (done[k]) continue; done[k] = 'loading';
      (function (k, u) {
        fetch(u, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (j) { done[k] = true; add(j); })
          .catch(function () { delete done[k]; if (!warned) { warned = true; U.toast('Routes et chemins : source indisponible pour le moment', 4000); } });
      })(k, C.routesUrl(x, y));
    }
  }
  // en dessous du zoom utile, les tronçons déjà chargés s'effacent : de loin, ils noieraient la carte
  function showByZoom() {
    var on = map.getZoom() >= MIN_ZOOM;
    [lines, labels].forEach(function (l) { if (on && !group.hasLayer(l)) group.addLayer(l); else if (!on && group.hasLayer(l)) group.removeLayer(l); });
  }
  map.on('moveend', refresh);
  map.on('zoomend', showByZoom);
  showByZoom();
  C.specialLayers[ID] = { layers: [group], refresh: refresh };
  if (C.ITEMS[ID]) C.ITEMS[ID].legend = legend; // légende dessinée par l'appli, dans l'onglet Calques
  C.routes = { classOf: classOf, limits: limits }; // pour les contrôles
})();
