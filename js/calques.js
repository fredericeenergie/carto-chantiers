/* Carto chantiers — onglet « Calques » : fond de carte, calques affichés (ordre, transparence, légende), catalogue. */
(function () {
  'use strict';
  var C = window.Carto, U = C.u, $ = C.$, esc = U.esc, map = C.map;
  var BASE_ICO = { ortho: '🛰', esri: '🌍', plan: '🗺', irc: '🌳', histo: '🕰', scan1950: '📜' };

  C.tabs.calques = function (el) {
    var act = C.layerOrder.slice(), n = act.length;
    var openG = U.storeJSON('openGroups') || {};
    var cur = C.BASES.filter(function (b) { return b.id === C.curBase; })[0] || C.BASES[0];

    /* --- Fond de carte : six fonds sur deux lignes, l'explication du fond choisi dessous --- */
    var html = '<h3>Fond de carte</h3><div class="bases">' + C.BASES.map(function (b) {
      return '<button class="base' + (b.id === cur.id ? ' on' : '') + '" data-act="base" data-id="' + b.id + '" title="' + esc(b.hint) + '"><span class="tile-ico">' + (BASE_ICO[b.id] || '🛰') + '</span><b>' + esc(b.label) + '</b></button>';
    }).join('') + '</div><p class="muted small bases-hint">' + esc(cur.hint) + '</p>';

    /* --- Calques affichés --- */
    html += '<div class="sec-head"><h3>Calques affichés (' + n + ')</h3>' + (n ? '<button class="btn ghost" data-act="allOff">Tout éteindre</button>' : '') + '</div>';
    if (n > 1) html += '<p class="muted small sec-note">Le premier de la liste passe au-dessus. Fais glisser ⠿ ou utilise ▲ ▼.</p>';
    html += n ? '<div id="lyList">' + act.map(function (id, i) {
      var it = C.ITEMS[id], hid = !!C.hiddenLayers[id], op = C.opacityOf(id), vec = C.isVectorItem(it);
      return '<div class="lyr' + (hid ? ' is-hidden' : '') + '" data-card="' + id + '">' +
        '<div class="lyr-head"><span class="handle" data-handle="' + id + '" title="Faire glisser pour changer l\'ordre" aria-label="Déplacer">⠿</span>' +
        '<b class="grow">' + esc(it.label) + '</b>' +
        '<button class="ico-btn sm" data-act="up" data-id="' + id + '" title="Monter (passer au-dessus)" aria-label="Monter"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button class="ico-btn sm" data-act="down" data-id="' + id + '" title="Descendre (passer en dessous)" aria-label="Descendre"' + (i === n - 1 ? ' disabled' : '') + '>▼</button>' +
        '<button class="ico-btn sm" data-act="toggle" data-id="' + id + '" title="' + (hid ? 'Afficher' : 'Masquer sans éteindre') + '" aria-label="' + (hid ? 'Afficher' : 'Masquer') + '">' + (hid ? '🙈' : '👁') + '</button>' +
        '<button class="ico-btn sm" data-act="off" data-id="' + id + '" title="Éteindre" aria-label="Éteindre">×</button></div>' +
        '<div class="muted small">' + esc(id === 'vigicrues' && C.vigiInfo ? 'Vigicrues — bulletin du ' + U.fmtDate(C.vigiInfo.bulletin, true) + (C.vigiInfo.live ? '' : ' (copie)') : it.src) + (it.minZoom ? ' · visible à partir du zoom ' + it.minZoom : '') + (hid ? ' · <b>masqué</b>' : '') + '</div>' +
        (hid ? '' : '<div class="legend">' + C.legendHtml(it) + '</div>') +
        (vec ? '<div class="muted small">Tracé dessiné : toujours au-dessus des calques images.</div>' :
          '<label class="lyr-opacity small muted">Transparence<input type="range" min="0" max="0.9" step="0.05" value="' + (1 - op).toFixed(2) + '" data-opacity="' + id + '"><span>' + Math.round((1 - op) * 100) + ' %</span></label>') +
        '</div>';
    }).join('') + '</div>' : '<p class="muted">Aucun calque affiché. Choisis ci-dessous.</p>';

    /* --- Catalogue --- */
    html += '<h3>Tous les calques</h3>' + C.GROUPS.map(function (g) {
      var items = g.items.filter(function (it) { return !(C.viewer && it.special === 'vigicrues'); }); // en consultation : pas de calque qui passe par la porte
      var k = items.filter(function (it) { return C.active[it.id]; }).length;
      if (!items.length) return '';
      return '<div class="grp' + (openG[g.id] ? ' open' : '') + '" data-group="' + g.id + '"><button type="button"><span>' + esc(g.label) + '</span>' + (k ? '<span class="count">' + k + '</span>' : '') + '<span class="chev">›</span></button><div class="items">' +
        items.map(function (it) {
          return '<label class="check"><input type="checkbox" data-id="' + it.id + '"' + (C.active[it.id] ? ' checked' : '') + '><span class="grow">' + esc(it.label) +
            (it.hint ? '<span class="hint">' + esc(it.hint) + '</span>' : '') + '<span class="src">' + esc(it.src) + '</span></span></label>';
        }).join('') + '</div></div>';
    }).join('') + '<p class="muted small sec-foot">Données publiques indicatives : elles ne remplacent jamais une DT-DICT.</p>';

    var keepScroll = el.scrollTop;
    el.innerHTML = html; el.scrollTop = keepScroll;
    function redraw() { C.tabs.calques(el); }

    U.onAct(el, {
      base: function (id) { C.setBase(id); redraw(); },
      allOff: function () {
        C.confirmDialog('Éteindre les ' + n + ' calques affichés ?', 'Tout éteindre').then(function (ok) { if (!ok) return; C.layerOrder.slice().forEach(function (id) { C.setActive(id, false); }); redraw(); });
      },
      up: function (id) { C.moveLayer(id, C.layerOrder.indexOf(id) - 1); redraw(); },
      down: function (id) { C.moveLayer(id, C.layerOrder.indexOf(id) + 1); redraw(); },
      toggle: function (id) { C.setHidden(id, !C.hiddenLayers[id]); redraw(); },
      off: function (id) { C.setActive(id, false); redraw(); }
    });
    el.querySelectorAll('.grp > button').forEach(function (b) {
      b.onclick = function () { var g = b.parentNode; g.classList.toggle('open'); openG[g.getAttribute('data-group')] = g.classList.contains('open'); U.storeJSON('openGroups', openG); };
    });
    el.querySelectorAll('.grp input[data-id]').forEach(function (c) { c.onchange = function () { C.setActive(c.getAttribute('data-id'), c.checked); setTimeout(redraw, 50); }; });
    el.querySelectorAll('[data-opacity]').forEach(function (r) {
      r.oninput = function () { C.setOpacity(r.getAttribute('data-opacity'), Math.round((1 - r.value) * 100) / 100); r.nextElementSibling.textContent = Math.round(r.value * 100) + ' %'; };
    });

    // glisser-déposer (doigt ou souris) sur la poignée ⠿
    var list = $('lyList');
    if (list) list.querySelectorAll('[data-handle]').forEach(function (h) {
      h.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        var card = h.closest('.lyr'), startY = ev.clientY, startTop = card.offsetTop, moved = false;
        h.setPointerCapture(ev.pointerId);
        card.classList.add('dragging');
        function move(e) {
          var dy = e.clientY - startY; if (Math.abs(dy) > 3) moved = true;
          var cards = [].slice.call(list.children).filter(function (c) { return c !== card; });
          var before = null;
          for (var i = 0; i < cards.length; i++) { var r = cards[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { before = cards[i]; break; } }
          var ph = list.querySelector('.lyr-ph');
          if (!ph) { ph = document.createElement('div'); ph.className = 'lyr-ph'; ph.style.height = card.offsetHeight + 'px'; }
          if (before) list.insertBefore(ph, before); else list.appendChild(ph);
          card.style.transform = 'translateY(' + (dy - (card.offsetTop - startTop)) + 'px)';
          // défilement automatique près des bords du panneau
          var er = el.getBoundingClientRect();
          if (e.clientY < er.top + 40) el.scrollTop -= 12; else if (e.clientY > er.bottom - 40) el.scrollTop += 12;
        }
        function up() {
          h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
          var ph = list.querySelector('.lyr-ph');
          if (ph) { list.insertBefore(card, ph); ph.remove(); }
          card.classList.remove('dragging'); card.style.transform = '';
          if (moved) { C.setLayerOrder([].slice.call(list.querySelectorAll('[data-card]')).map(function (c) { return c.getAttribute('data-card'); })); redraw(); }
        }
        h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
      });
    });

    // les couleurs relevées sur les tuiles apparaissent quand celles-ci sont chargées
    if (act.some(function (id) { return !C.legendUrls(C.ITEMS[id]).length && C.ITEMS[id].defs && !C.hiddenLayers[id]; })) {
      clearTimeout(C._legT); C._legT = setTimeout(function () {
        if (!el.classList.contains('on')) return;
        el.querySelectorAll('[data-card]').forEach(function (card) {
          var it = C.ITEMS[card.getAttribute('data-card')], lg = card.querySelector('.legend');
          if (it && it.defs && lg && !C.legendUrls(it).length) lg.innerHTML = C.legendHtml(it);
        });
      }, 2500);
    }
  };
  map.on('zoomend', function () { C.refreshTab('calques'); });
})();
