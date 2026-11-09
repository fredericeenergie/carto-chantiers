/* Carto chantiers — photo rapide : un appui sur le bouton photo de la carte, la photo se range seule
   (fiche du pylône à moins de 50 m, sinon ajout terrain à l'endroit de la prise de vue). */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, esc = U.esc;
  var NEAR = 50; // mètres : au-delà, la photo devient un point terrain
  var GOOD = 50; // mètres : précision GPS au-delà de laquelle l'endroit se confirme sur la carte
  var RUBRIQUES = [['nota_photos', 'Général'], ['fond_photos', 'Fondations'], ['emb_photos', 'Embases'], ['st_photos', 'Structure'], ['eq_photos', 'Équipements'], ['mat_photos', 'Matériel'], ['cab_photos', 'Câbles']];

  function nearestPylon(doc, ll) {
    var best = null, bd = Infinity;
    C.pylonsOf(doc).forEach(function (f) { var d = C.geo.dist(f.coords, ll); if (d < bd) { bd = d; best = f; } });
    return best && bd <= NEAR ? { f: best, d: bd } : null;
  }
  function toTerrain(img, ll) { C.tools.addTerrain('point', [L.latLng(ll[0], ll[1])], { name: 'Photo', photos: [img] }); }

  function toPylon(doc, img, ll, near) {
    var last = U.store('photoRubrique') || 'nota_photos';
    var d = C.openDialog({ title: 'Photo — pylône ' + near.f.pylon, body:
      (img.thumb ? '<img class="photo-preview" alt="" src="' + img.thumb + '">' : '') +
      '<p class="muted">Prise à ' + Math.round(near.d) + ' m du pylône ' + esc(near.f.pylon) + '. Rubrique de sa fiche :</p>' +
      '<div class="chips" id="phRub">' + RUBRIQUES.map(function (r) { return '<button type="button" data-val="' + r[0] + '"' + (r[0] === last ? ' class="on"' : '') + '>' + r[1] + '</button>'; }).join('') + '</div>' +
      '<p><button class="btn ghost" data-act="terrain">Ce n\'est pas ce pylône : en faire un point terrain</button></p>',
      foot: '<button class="btn" data-act="cancel">Annuler</button><button class="btn primary push" data-act="save">Enregistrer</button>',
      guard: function () { return true; } }); // une photo prise n'est jamais perdue sur un geste de fermeture
    U.pickOne(d.q('#phRub'));
    d.on({
      cancel: function () { C.requestClose(1); },
      terrain: function () { C.closeDialog(1); toTerrain(img, ll); },
      save: function () {
        var key = U.picked(d.q('#phRub')) || 'nota_photos';
        U.store('photoRubrique', key);
        C.closeDialog(1);
        C.fiches.addPhoto(doc, near.f.pylon, key, img.blob).then(function (fd) {
          U.toast('Photo ajoutée à la fiche du pylône ' + near.f.pylon + ' (' + fd.label.replace(' : photos', '').replace('Nota', 'Général') + ')' + (U.isOnline() ? '' : ' — envoi au retour du réseau'), 3500);
        });
      }
    });
  }
  function place(doc, img, ll) {
    var near = nearestPylon(doc, ll);
    if (near) toPylon(doc, img, ll, near); else toTerrain(img, ll);
  }
  // pas de position GPS fiable : l'endroit se choisit sur la carte ; renoncer demande confirmation, la photo n'est pas perdue par mégarde
  function askPlace(doc, img) {
    C.tools.draw({ type: 'point', title: 'Photo : où a-t-elle été prise ?',
      onDone: function (pts) { place(doc, img, pts[0]); },
      onCancel: function () {
        C.confirmDialog('Sans endroit, la photo ne peut pas être rangée.', 'Supprimer la photo', true, 'Choisir l\'endroit').then(function (y) { if (!y) askPlace(doc, img); });
      } });
  }

  C.quickPhoto = function () {
    var doc = C.activeDoc();
    if (!doc) { U.toast('Ouvre d\'abord un chantier'); C.chantiersDialog(); return; }
    var gps = C.trackPosition(); // écouté dès maintenant : la position est prête quand la photo revient
    U.pickFile('image/*', true).then(function (file) {
      if (!file) { gps.stop(); return; }
      U.busy(true, 'Préparation de la photo…');
      U.compressImage(file).then(function (img) {
        return gps.get(6000, GOOD).then(function (pos) {
          U.busy(false);
          if (pos && pos.acc <= GOOD) { place(doc, img, pos.ll); return; }
          // position absente ou trop vague pour choisir entre deux pylônes : la carte se place au mieux, le doigt fait le reste
          if (pos) C.map.setView(pos.ll, Math.max(C.map.getZoom(), 17));
          U.toast((pos ? 'Position trop imprécise (± ' + Math.round(pos.acc) + ' m)' : 'Position introuvable') + ' : touche la carte à l\'endroit de la photo', 5000);
          askPlace(doc, img);
        });
      }).catch(function (e) { U.busy(false); gps.stop(); U.toast('Photo illisible : ' + (e && e.message || e), 4000); });
    });
  };
  $('btnPhoto').addEventListener('click', C.quickPhoto);
})();
