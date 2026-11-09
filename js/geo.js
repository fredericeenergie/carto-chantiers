/* Outils géographiques : distances, Lambert 93, géométrie simple. */
(function () {
  var C = window.Carto = window.Carto || {};
  var R = 6371008.8, toR = Math.PI / 180;

  function dist(a, b) { // [lat, lon]
    var dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function lineLength(c) { var d = 0; for (var i = 1; i < c.length; i++) d += dist(c[i - 1], c[i]); return d; }
  function area(ring) { // m², sphérique
    var s = 0, n = ring.length, Ra = 6378137;
    for (var i = 0; i < n; i++) {
      var p1 = ring[i], p2 = ring[(i + 1) % n];
      s += (p2[1] - p1[1]) * toR * (2 + Math.sin(p1[0] * toR) + Math.sin(p2[0] * toR));
    }
    return Math.abs(s * Ra * Ra / 2);
  }
  function densify(c, step) {
    var out = [];
    for (var i = 0; i < c.length; i++) {
      out.push(c[i]);
      if (i + 1 < c.length) {
        var d = dist(c[i], c[i + 1]), k = Math.floor(d / step);
        for (var j = 1; j < k; j++) { var f = j / k; out.push([c[i][0] + (c[i + 1][0] - c[i][0]) * f, c[i][1] + (c[i + 1][1] - c[i][1]) * f]); }
      }
    }
    return out;
  }
  function pointInRing(p, ring) { // p [lat,lon], ring [[lat,lon]]
    var x = p[1], y = p[0], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][1], yi = ring[i][0], xj = ring[j][1], yj = ring[j][0];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* Projection conique conforme de Lambert sécante (RGF93, GRS80) — formules IGN ALG0003/ALG0004.
     Sert au Lambert 93 et aux neuf zones « coniques conformes » CC42 à CC50. Latitudes et longitudes en degrés. */
  function lcc(lat0, lat1, lat2, lon0, X0, Y0) {
    var a = 6378137, e = 0.0818191910428158, l0 = lon0 * toR, p0 = lat0 * toR, p1 = lat1 * toR, p2 = lat2 * toR;
    function m(p) { return Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) * Math.sin(p)); }
    function t(p) { return Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - e * Math.sin(p)) / (1 + e * Math.sin(p)), e / 2); }
    var n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(t(p1)) - Math.log(t(p2)));
    var F = m(p1) / (n * Math.pow(t(p1), n));
    var r0 = a * F * Math.pow(t(p0), n);
    return {
      fromWGS: function (lat, lon) {
        var r = a * F * Math.pow(t(lat * toR), n), th = n * (lon * toR - l0);
        return [X0 + r * Math.sin(th), Y0 + r0 - r * Math.cos(th)];
      },
      toWGS: function (x, y) {
        var dx = x - X0, dy = r0 - (y - Y0);
        var r = Math.sign(n) * Math.sqrt(dx * dx + dy * dy), th = Math.atan2(dx, dy);
        var tt = Math.pow(r / (a * F), 1 / n), lon = l0 + th / n;
        var lat = Math.PI / 2 - 2 * Math.atan(tt);
        for (var i = 0; i < 10; i++) lat = Math.PI / 2 - 2 * Math.atan(tt * Math.pow((1 - e * Math.sin(lat)) / (1 + e * Math.sin(lat)), e / 2));
        return [lat / toR, lon / toR];
      }
    };
  }
  var L93 = lcc(46.5, 44, 49, 3, 700000, 6600000);
  // zone 42 à 50 : parallèle d'origine = numéro de zone, X0 = 1 700 000, Y0 = (zone − 41) × 1 000 000 + 200 000
  var ccCache = {};
  function CC(zone) { return ccCache[zone] || (ccCache[zone] = lcc(zone, zone - 0.75, zone + 0.75, 3, 1700000, (zone - 41) * 1000000 + 200000)); }

  C.geo = { dist: dist, lineLength: lineLength, area: area, densify: densify, pointInRing: pointInRing, L93: L93, CC: CC };
  if (typeof module !== 'undefined') module.exports = C.geo;
})();
