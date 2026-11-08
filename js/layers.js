/* Catalogue des fonds et calques.
 * kind:
 *   wmts : IGN Géoplateforme (data.geopf.fr/wmts)
 *   wms  : serveur WMS (tuiles 256 px calculées en EPSG:3857)
 *   xyz  : tuiles XYZ classiques
 * native : [zoom min, zoom max] servis par la source
 * offline : zoom max téléchargé par « Préparer hors ligne » (au-delà : agrandissement)
 * info : interrogeable au toucher (GetFeatureInfo JSON)
 */
(function () {
  var GB = function (ws) { return 'https://geobretagne.fr/geoserver/' + ws + '/wms'; };
  var GEORISQUES = 'https://www.georisques.gouv.fr/services';
  var GPU = 'https://data.geopf.fr/wms-v/ows';

  function ign(layer, fmt, tms, native, style) {
    return { kind: 'wmts', layer: layer, fmt: fmt || 'image/png', tms: tms, style: style || 'normal', native: native };
  }
  function wms(base, layers, native, extra) {
    var d = { kind: 'wms', base: base, layers: layers, native: native || [5, 19] };
    for (var k in (extra || {})) d[k] = extra[k];
    return d;
  }

  var SRC = {
    ign: 'IGN Géoplateforme',
    gb_rte: 'RTE, via GéoBretagne',
    gb_enedis: 'Enedis, via GéoBretagne — vision juillet 2026',
    gb_grdf: 'GRDF, via GéoBretagne — réseau au 01/03/2023',
    gb_sncf: 'SNCF Réseau, via GéoBretagne',
    georisques: 'Géorisques (BRGM / ministère)',
    gpu: 'Géoportail de l\'Urbanisme',
    inpn: 'INPN (MNHN / OFB), via IGN',
    dgac: 'DGAC, via IGN',
    odre: 'RTE, Open Data Réseaux Énergies — données au 6 mai 2024',
    vigicrues: 'Vigicrues (ministère) — bulletin en cours',
    rpg: 'RPG 2025 (ASP / IGN)',
    lidar: 'LiDAR HD (IGN)',
    admin: 'Admin Express (IGN)',
    brgm: 'BRGM — carte géologique (en essai)'
  };
  var WMSR = 'https://data.geopf.fr/wms-r/wms';
  var LEG = 'https://data.geopf.fr/annexes/ressources/legendes/';

  var BASES = [
    { id: 'ortho', label: 'Satellite IGN', hint: 'Photos aériennes France, les plus précises', src: SRC.ign,
      def: ign('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg', 'PM', [0, 19]), offline: 18, avgKB: 18 },
    { id: 'esri', label: 'Satellite monde', hint: 'Esri — hors France ; pas disponible hors ligne', src: 'Esri World Imagery',
      def: { kind: 'xyz', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', native: [0, 19] },
      noOffline: true },
    { id: 'plan', label: 'Carte IGN', hint: 'Plan IGN : routes, chemins, lieux-dits', src: SRC.ign,
      def: ign('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png', 'PM', [0, 19]), offline: 17, avgKB: 14 }
  ];

  var GROUPS = [
    { id: 'elec', label: 'Électricité', items: [
      { id: 'rte_aer', label: 'RTE — lignes aériennes', src: SRC.gb_rte, info: true, offline: 17,
        defs: [wms(GB('rte'), 'lignes_aeriennes')] },
      { id: 'rte_pyl', label: 'RTE — pylônes', src: SRC.gb_rte, info: true, offline: 17, minZoom: 12,
        defs: [wms(GB('rte'), 'pylones')] },
      { id: 'rte_num', label: 'RTE — numéros des pylônes', src: SRC.gb_rte, special: 'rte_num', minZoom: 15,
        hint: 'Numéro affiché à côté de chaque pylône RTE existant' },
      { id: 'rte_sout', label: 'RTE — liaisons souterraines', src: SRC.gb_rte, info: true, offline: 17,
        defs: [wms(GB('rte'), 'lignes_souterraines')] },
      { id: 'rte_postes', label: 'RTE — postes', src: SRC.gb_rte, info: true, offline: 17,
        defs: [wms(GB('rte'), 'enceintes_de_poste'), wms(GB('rte'), 'postes_electriques')] },
      { id: 'hta_aer', label: 'Enedis — HTA aérien', src: SRC.gb_enedis, info: true, offline: 17,
        defs: [wms(GB('enedis'), 'reseau_hta')] },
      { id: 'hta_sout', label: 'Enedis — HTA souterrain', src: SRC.gb_enedis, info: true, offline: 17,
        defs: [wms(GB('enedis'), 'reseau_souterrain_hta')] },
      { id: 'bt', label: 'Enedis — BT aérien et souterrain', src: SRC.gb_enedis, info: true, offline: 17, minZoom: 15,
        hint: 'Visible à partir d\'un zoom fort',
        defs: [wms(GB('enedis'), 'reseau_bt'), wms(GB('enedis'), 'reseau_souterrain_bt')] }
    ]},
    { id: 'gaz', label: 'Gaz et canalisations', items: [
      { id: 'gaz_transport', label: 'Gaz — transport (NaTran, Teréga)', src: SRC.georisques, offline: 16,
        hint: 'Canalisations de transport de gaz naturel',
        defs: [wms(GEORISQUES, 'C_GAZ')] },
      { id: 'gaz_distri', label: 'Gaz — distribution GRDF', src: SRC.gb_grdf, info: true, offline: 17, minZoom: 13,
        defs: [wms(GB('grdf'), 'reseau_gaz')] },
      { id: 'canal_autres', label: 'Hydrocarbures et chimie', src: SRC.georisques, offline: 16,
        hint: 'Autres canalisations de transport de matières dangereuses',
        defs: [wms(GEORISQUES, 'C_HYDROCARBURES'), wms(GEORISQUES, 'C_PRODUITS_CHIM')] }
    ]},
    { id: 'fer', label: 'Ferroviaire', items: [
      { id: 'sncf_lignes', label: 'SNCF — lignes', src: SRC.gb_sncf, info: true, offline: 16,
        defs: [wms(GB('sncf'), 'ligne_ferroviaire')] },
      { id: 'sncf_pn', label: 'SNCF — passages à niveau', src: SRC.gb_sncf, info: true, offline: 16, minZoom: 12,
        defs: [wms(GB('sncf'), 'passage_niveau')] }
    ]},
    { id: 'cad', label: 'Cadastre', items: [
      { id: 'cadastre', label: 'Parcelles (limites et numéros)', src: SRC.ign, offline: 18, minZoom: 14, avgKB: 8, legendUrl: LEG + 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS-legend.png',
        defs: [ign('CADASTRALPARCELS.PARCELLAIRE_EXPRESS', 'image/png', 'PM_0_19', [0, 19], 'PCI vecteur')] }
    ]},
    { id: 'eau', label: 'Eau et inondations', items: [
      { id: 'vigicrues', label: 'Vigicrues — vigilance en cours', src: SRC.vigicrues, special: 'vigicrues',
        hint: 'Vert, jaune, orange, rouge ; via ta porte Apps Script' },
      { id: 'hydro', label: 'Cours d\'eau et plans d\'eau', src: SRC.ign, offline: 17,
        defs: [ign('HYDROGRAPHY.HYDROGRAPHY', 'image/png', 'PM_6_18', [6, 18])] },
      { id: 'bcae', label: 'Cours d\'eau BCAE (bandes tampons)', src: SRC.ign, offline: 16,
        defs: [ign('HYDROGRAPHY.BCAE.LATEST', 'image/png', 'PM_6_17', [6, 17])] },
      { id: 'humides', label: 'Zones humides et tourbières', src: SRC.ign, offline: 16, opacity: 0.8, legendUrl: LEG + 'TOURBIERES-ZONES-HUMIDES-BCAE-legend.png',
        defs: [ign('TOURBIERES_ZONES-HUMIDES.BCAE', 'image/png', 'PM_6_16', [6, 16]), ign('Patrinat_RAMSAR', 'image/png', 'PM_6_16', [6, 16])] },
      { id: 'tri', label: 'Surfaces inondables (TRI)', src: SRC.georisques, offline: 16, opacity: 0.6, minZoom: 11,
        hint: 'Crue fréquente, moyenne et rare, dans les territoires à risque important cartographiés',
        defs: [wms(GEORISQUES, 'ALEA_SYNT_01_04FAI_FXX'), wms(GEORISQUES, 'ALEA_SYNT_01_02MOY_FXX'), wms(GEORISQUES, 'ALEA_SYNT_01_01FOR_FXX')] },
      { id: 'ppri', label: 'Communes avec un PPR inondation', src: SRC.georisques, offline: 12, opacity: 0.45,
        hint: 'Zonage précis : calque « Servitudes » ou règlement du PPR en mairie',
        defs: [wms(GEORISQUES, 'PPRN_COMMUNE_RISQINOND_APPROUV')] },
      { id: 'nappes', label: 'Remontées de nappe', src: SRC.georisques, offline: 15, opacity: 0.6,
        defs: [wms(GEORISQUES, 'REMNAPPE_FR')] }
    ]},
    { id: 'sol', label: 'Sous-sol et risques', items: [
      { id: 'cavites', label: 'Cavités souterraines', src: SRC.georisques, offline: 16,
        defs: [wms(GEORISQUES, 'CAVITE_LOCALISEE')] },
      { id: 'mvt', label: 'Mouvements de terrain', src: SRC.georisques, offline: 16,
        defs: [wms(GEORISQUES, 'MVT_LOCALISE')] },
      { id: 'argiles', label: 'Retrait-gonflement des argiles', src: SRC.georisques, offline: 15, opacity: 0.55,
        defs: [wms(GEORISQUES, 'ALEARG')] },
      { id: 'pollues', label: 'Sites et sols pollués', src: SRC.georisques, offline: 16,
        hint: 'SIS, BASOL et anciens sites industriels',
        defs: [wms(GEORISQUES, 'SSP_CLASSIFICATION_SIS'), wms(GEORISQUES, 'SSP_INSTRUCTION'), wms(GEORISQUES, 'SSP_ETABLISSEMENT')] }
    ]},
    { id: 'env', label: 'Environnement', items: [
      { id: 'n2000_hab', label: 'Natura 2000 — Habitats (ZSC)', src: SRC.inpn, offline: 16, opacity: 0.7,
        defs: [ign('Patrinat_SIC', 'image/png', 'PM_6_16', [6, 16])] },
      { id: 'n2000_ois', label: 'Natura 2000 — Oiseaux (ZPS)', src: SRC.inpn, offline: 16, opacity: 0.7,
        defs: [ign('Patrinat_ZPS', 'image/png', 'PM_6_16', [6, 16])] },
      { id: 'znieff1', label: 'ZNIEFF type I', src: SRC.inpn, offline: 16, opacity: 0.7,
        defs: [ign('Patrinat_ZNIEFF1', 'image/png', 'PM_6_16', [6, 16])] },
      { id: 'znieff2', label: 'ZNIEFF type II', src: SRC.inpn, offline: 16, opacity: 0.6,
        defs: [ign('Patrinat_ZNIEFF2', 'image/png', 'PM_6_16', [6, 16])] },
      { id: 'protege', label: 'Espaces protégés', src: SRC.inpn, offline: 16, opacity: 0.7,
        hint: 'Arrêtés de biotope, réserves naturelles, parcs nationaux',
        defs: [ign('Patrinat_APB', 'image/png', 'PM_6_16', [6, 16]), ign('Patrinat_RNN', 'image/png', 'PM_6_16', [6, 16]),
               ign('Patrinat_RNR', 'image/png', 'PM_6_16', [6, 16]), ign('Patrinat_PN', 'image/png', 'PM_6_16', [6, 16])] },
      { id: 'pnr', label: 'Parcs naturels régionaux', src: SRC.inpn, offline: 14, opacity: 0.5,
        defs: [ign('Patrinat_PNR', 'image/png', 'PM_6_16', [6, 16])] }
    ]},
    { id: 'veg', label: 'Végétation', items: [
      { id: 'veg_rte', label: 'Végétation à risque sous lignes RTE', src: SRC.odre, special: 'veg_rte', minZoom: 13,
        hint: 'Essences dont la pousse peut menacer les câbles' },
      { id: 'mnh', label: 'Hauteur de végétation (LiDAR HD)', src: SRC.lidar, offline: 17, opacity: 0.75, minZoom: 13,
        hint: 'Hauteur des arbres et du sursol ; couverture LiDAR HD en cours',
        defs: [wms(WMSR, 'IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93', [10, 19], { styles: 'hypso_mnh' })] },
      { id: 'foret', label: 'Forêts (BD Forêt)', src: SRC.ign, offline: 16, opacity: 0.6, legendUrl: LEG + 'LANDCOVER.FORESTINVENTORY.V2-legend.png',
        defs: [ign('LANDCOVER.FORESTINVENTORY.V2', 'image/png', 'PM_6_16', [6, 16])] },
      { id: 'haies', label: 'Haies (BD Haie 2024)', src: SRC.ign, offline: 17,
        defs: [ign('hedge.hedge', 'image/png', 'PM_7_18', [7, 18])] }
    ]},
    { id: 'agri', label: 'Agriculture', items: [
      { id: 'rpg', label: 'Cultures agricoles (RPG 2025)', src: SRC.rpg, offline: 16, opacity: 0.6, minZoom: 11,
        hint: 'Culture déclarée sur chaque parcelle agricole', legendUrl: LEG + 'LANDUSE-AGRICULTURE-legend.png',
        defs: [ign('LANDUSE.AGRICULTURE.LATEST', 'image/png', 'PM_6_16', [6, 16])] }
    ]},
    { id: 'geol', label: 'Géologie', items: [
      { id: 'geologie', label: 'Carte géologique 1/50 000', src: SRC.brgm, offline: 15, opacity: 0.6,
        hint: 'Serveur BRGM non vérifié : peut ne rien afficher',
        defs: [wms('https://geoservices.brgm.fr/geologie', 'SCAN_H_GEOL50', [6, 17])] }
    ]},
    { id: 'admin', label: 'Limites administratives', items: [
      { id: 'communes', label: 'Limites des communes', src: SRC.admin, offline: 15, legendUrl: LEG + 'ADMINEXPRESS-COG-legend.png',
        defs: [ign('ADMINEXPRESS-COG-CARTO.LATEST', 'image/png', 'PM_6_16', [6, 16])] }
    ]},
    { id: 'regl', label: 'Règlementaire', items: [
      { id: 'plu', label: 'Zonage PLU / carte communale', src: SRC.gpu, info: true, offline: 16, opacity: 0.55,
        defs: [wms(GPU, 'zone_secteur')] },
      { id: 'sup', label: 'Servitudes d\'utilité publique', src: SRC.gpu, info: true, offline: 16, opacity: 0.7,
        defs: [wms(GPU, 'sup')] },
      { id: 'mh', label: 'Monuments historiques', src: SRC.gpu, info: true, offline: 16, opacity: 0.8,
        defs: [wms(GPU, 'monument_historique')] },
      { id: 'icpe', label: 'Installations classées (ICPE, Seveso)', src: SRC.georisques, offline: 16,
        defs: [wms(GEORISQUES, 'INSTALLATIONS_CLASSEES_SIMPLIFIE')] }
    ]},
    { id: 'air', label: 'Aérien', items: [
      { id: 'drones', label: 'Restrictions drones', src: SRC.dgac, offline: 15, opacity: 0.6, legendUrl: LEG + 'TRANSPORTS.DRONES.RESTRICTIONS-legend.png',
        hint: 'Catégorie Ouverte et aéromodélisme',
        defs: [ign('TRANSPORTS.DRONES.RESTRICTIONS', 'image/png', 'PM_3_15', [3, 15])] }
    ]},
    { id: 'relief', label: 'Relief', items: [
      { id: 'courbes', label: 'Courbes de niveau', src: SRC.ign, offline: 17, legendUrl: LEG + 'ELEVATION-CONTOUR-LINE-legend.png',
        defs: [ign('ELEVATION.CONTOUR.LINE', 'image/png', 'PM_6_18', [6, 18])] },
      { id: 'ombrage', label: 'Ombrage du relief', src: SRC.ign, offline: 16, opacity: 0.45,
        defs: [ign('IGNF_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', 'image/png', 'PM_6_17', [6, 17])] }
    ]}
  ];

  /* ---- URL d'une tuile (même fonction pour l'affichage et le hors ligne) ---- */
  var R = 20037508.342789244;
  function tileUrl(def, z, x, y) {
    if (def.kind === 'wmts') {
      return 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + def.layer +
        '&STYLE=' + encodeURIComponent(def.style) + '&TILEMATRIXSET=' + def.tms + '&FORMAT=' + def.fmt +
        '&TILEMATRIX=' + z + '&TILEROW=' + y + '&TILECOL=' + x;
    }
    if (def.kind === 'xyz') {
      return def.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    }
    var s = 2 * R / Math.pow(2, z);
    var minx = -R + x * s, maxy = R - y * s;
    var bbox = [minx, maxy - s, minx + s, maxy].map(function (v) { return v.toFixed(2); }).join(',');
    return def.base + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=' + def.layers + '&STYLES=&CRS=EPSG:3857&BBOX=' +
      bbox + '&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true';
  }

  /* ---- Légende d'un calque ---- */
  function legendUrls(it) {
    if (it.legendUrl) return [it.legendUrl];
    if (!it.defs) return [];
    return it.defs.filter(function (d) { return d.kind === 'wms' && !/wms-r/.test(d.base); }).map(function (d) {
      return d.base + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYER=' + d.layers + '&FORMAT=image/png' +
        (d.base.indexOf('georisques') >= 0 ? '&SLD_VERSION=1.1.0' : '') + (d.base.indexOf('geobretagne') >= 0 ? '&LEGEND_OPTIONS=fontSize:11;forceLabels:on' : '');
    });
  }

  /* ---- Réseaux exportables en vrais tracés (WFS) ---- */
  function gbWfs(ws, layer) {
    return function (b) {
      return GB(ws).replace('/wms', '/wfs') + '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=' + ws + ':' + layer +
        '&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&COUNT=5000&BBOX=' + [b.s, b.w, b.n, b.e].map(function (v) { return v.toFixed(5); }).join(',') + ',urn:ogc:def:crs:EPSG::4326';
    };
  }
  function grWfs(layer) {
    return function (b) {
      return GEORISQUES + '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:' + layer + '&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326&COUNT=5000&BBOX=' +
        [b.s, b.w, b.n, b.e].map(function (v) { return v.toFixed(5); }).join(',') + ',urn:ogc:def:crs:EPSG::4326';
    };
  }
  var VECTORS = [
    { id: 'v_rte_aer', label: 'RTE — lignes aériennes', folder: 'Réseaux › RTE', color: '#1565c0', url: gbWfs('rte', 'lignes_aeriennes'), name: ['nom_ligne', 'code_ligne'] },
    { id: 'v_rte_pyl', label: 'RTE — pylônes', folder: 'Réseaux › RTE', color: '#1565c0', url: gbWfs('rte', 'pylones'), name: ['numero_pylone'] },
    { id: 'v_rte_sout', label: 'RTE — liaisons souterraines', folder: 'Réseaux › RTE', color: '#6a1b9a', url: gbWfs('rte', 'lignes_souterraines'), name: ['nom_ligne'] },
    { id: 'v_rte_postes', label: 'RTE — postes', folder: 'Réseaux › RTE', color: '#1565c0', url: gbWfs('rte', 'postes_electriques'), name: ['nom_poste', 'nom'] },
    { id: 'v_hta_aer', label: 'Enedis — HTA aérien', folder: 'Réseaux › Enedis', color: '#00897b', url: gbWfs('enedis', 'reseau_hta'), name: ['tension'] },
    { id: 'v_hta_sout', label: 'Enedis — HTA souterrain', folder: 'Réseaux › Enedis', color: '#26a69a', url: gbWfs('enedis', 'reseau_souterrain_hta'), name: ['tension'] },
    { id: 'v_bt_aer', label: 'Enedis — BT aérien', folder: 'Réseaux › Enedis', color: '#9ccc65', url: gbWfs('enedis', 'reseau_bt'), name: ['tension'] },
    { id: 'v_bt_sout', label: 'Enedis — BT souterrain', folder: 'Réseaux › Enedis', color: '#c5e1a5', url: gbWfs('enedis', 'reseau_souterrain_bt'), name: ['tension'] },
    { id: 'v_grdf', label: 'Gaz — distribution GRDF', folder: 'Réseaux › Gaz', color: '#ef6c00', url: gbWfs('grdf', 'reseau_gaz'), name: ['nom_de_commune_administratif'] },
    { id: 'v_gaz', label: 'Gaz — transport', folder: 'Réseaux › Gaz', color: '#e65100', url: grWfs('C_GAZ'), name: ['desc_ouv'] },
    { id: 'v_hydro', label: 'Hydrocarbures', folder: 'Réseaux › Canalisations', color: '#4e342e', url: grWfs('C_HYDROCARBURES'), name: ['desc_ouv'] },
    { id: 'v_chim', label: 'Produits chimiques', folder: 'Réseaux › Canalisations', color: '#7b1fa2', url: grWfs('C_PRODUITS_CHIM'), name: ['desc_ouv'] },
    { id: 'v_sncf', label: 'SNCF — lignes', folder: 'Réseaux › SNCF', color: '#37474f', url: gbWfs('sncf', 'ligne_ferroviaire'), name: ['lib_ligne', 'code_ligne'] },
    { id: 'v_sncf_pn', label: 'SNCF — passages à niveau', folder: 'Réseaux › SNCF', color: '#37474f', url: gbWfs('sncf', 'passage_niveau'), name: ['libelle', 'num_pn'] }
  ];
  function communesUrl(b) {
    return 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ADMINEXPRESS-COG.LATEST:commune&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&COUNT=500&BBOX=' +
      [b.s, b.w, b.n, b.e].map(function (v) { return v.toFixed(5); }).join(',') + ',urn:ogc:def:crs:EPSG::4326';
  }
  function rteNumUrl(b) { return gbWfs('rte', 'pylones')(b); }

  window.Carto = window.Carto || {};
  window.Carto.legendUrls = legendUrls;
  window.Carto.VECTORS = VECTORS;
  window.Carto.communesUrl = communesUrl;
  window.Carto.rteNumUrl = rteNumUrl;
  window.Carto.BASES = BASES;
  window.Carto.GROUPS = GROUPS;
  window.Carto.tileUrl = tileUrl;
  window.Carto.SRC = SRC;
})();
