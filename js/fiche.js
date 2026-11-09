/* Fiche pylône : schéma (rubriques et champs). Les libellés servent de titres de colonnes du Google Sheet. */
(function () {
  var C = window.Carto = window.Carto || {};

  var ETAT3 = ['Bon', 'Moyen', 'Mauvais'];
  var SECTIONS = [
    { id: 'id', label: 'Identité', fields: [
      { k: 'type', label: 'Type', t: 'choice', o: ['Suspension', 'Ancrage', 'Arrêt', 'Angle', 'Dérivation', 'Aéro-souterrain'] },
      { k: 'famille', label: 'Famille / modèle', t: 'text' },
      { k: 'hauteur', label: 'Hauteur utile (m)', t: 'number' },
      { k: 'commune', label: 'Commune', t: 'text', auto: 'commune' },
      { k: 'parcelle', label: 'Parcelle', t: 'text', auto: 'parcelle' },
      { k: 'proprio', label: 'Propriétaire / exploitant', t: 'text' },
      { k: 'contact', label: 'Contact', t: 'text' },
      { k: 'acces', label: 'Accès', t: 'choice', o: ['Route', 'Chemin', 'Champ', 'À créer'] },
      { k: 'engins', label: 'Engins possibles', t: 'multi', o: ['VL', 'PL', 'Grue', 'Chenillé'] }
    ]},
    { id: 'fond', label: 'Fondations', fields: [
      { k: 'fond_type', label: 'Fondations : type', t: 'choice', o: ['Massif béton', 'Pieux', 'Micropieux', 'Dalle', 'Grillage'] },
      { k: 'fond_pieds', label: 'Fondations : nombre de pieds', t: 'number' },
      { k: 'fond_etat', label: 'Fondations : état', t: 'choice', o: ETAT3 },
      { k: 'fond_desordres', label: 'Fondations : désordres', t: 'multi', o: ['Fissures', 'Épaufrures', 'Affouillement', 'Massif enterré'] },
      { k: 'fond_travaux', label: 'Fondations : travaux prévus', t: 'text' },
      { k: 'fond_com', label: 'Fondations : commentaire', t: 'long' },
      { k: 'fond_photos', label: 'Fondations : photos', t: 'photos' }
    ]},
    { id: 'emb', label: 'Embases', fields: [
      { k: 'emb_etat', label: 'Embases : état', t: 'choice', o: ['Bon', 'Corrosion légère', 'Corrosion avancée', 'Perte de section'] },
      { k: 'emb_nb', label: 'Embases : nombre à traiter', t: 'number' },
      { k: 'emb_travaux', label: 'Embases : travaux', t: 'multi', o: ['Peinture', 'Renfort', 'Kit embase', 'Remplacement'] },
      { k: 'emb_com', label: 'Embases : commentaire', t: 'long' },
      { k: 'emb_photos', label: 'Embases : photos', t: 'photos' }
    ]},
    { id: 'struct', label: 'Structure', fields: [
      { k: 'st_vetuste', label: 'Structure : vétusté', t: 'choice', o: ['Bonne', 'Moyenne', 'Mauvaise'] },
      { k: 'st_corrosion', label: 'Structure : corrosion', t: 'choice', o: ['Aucune', 'Légère', 'Avancée'] },
      { k: 'st_cornieres', label: 'Structure : cornières manquantes/déformées', t: 'number' },
      { k: 'st_kit', label: 'Structure : kit', t: 'choice', o: ['Oui', 'Non'] },
      { k: 'st_kit_ref', label: 'Structure : référence du kit', t: 'text' },
      { k: 'st_boulons', label: 'Structure : boulonnerie', t: 'choice', o: ['OK', 'À reprendre'] },
      { k: 'st_peinture', label: 'Structure : peinture (état, année)', t: 'text' },
      { k: 'st_antiesc', label: 'Structure : anti-escalade', t: 'choice', o: ['Présent', 'À remplacer', 'Absent'] },
      { k: 'st_plaques', label: 'Structure : plaques signalétiques', t: 'choice', o: ['Présentes', 'À remplacer', 'Absentes'] },
      { k: 'st_com', label: 'Structure : commentaire', t: 'long' },
      { k: 'st_photos', label: 'Structure : photos', t: 'photos' }
    ]},
    { id: 'equip', label: 'Pylône (équipements)', fields: [
      { k: 'eq_malt', label: 'Équipements : mise à la terre', t: 'choice', o: ['OK', 'À contrôler'] },
      { k: 'eq_balisage', label: 'Équipements : balisage', t: 'choice', o: ['Aucun', 'Diurne', 'Nocturne', 'Diurne et nocturne'] },
      { k: 'eq_nids', label: 'Équipements : nids / oiseaux', t: 'choice', o: ['Non', 'Oui'] },
      { k: 'eq_veg', label: 'Équipements : végétation au pied', t: 'choice', o: ['Non', 'Oui'] },
      { k: 'eq_com', label: 'Équipements : commentaire', t: 'long' },
      { k: 'eq_photos', label: 'Équipements : photos', t: 'photos' }
    ]},
    { id: 'mat', label: 'Matériel', fields: [
      { k: 'mat_chaines', label: 'Matériel : chaînes d\'isolateurs (type, nombre, état)', t: 'long' },
      { k: 'mat_access', label: 'Matériel : accessoires', t: 'multi', o: ['Pinces', 'Amortisseurs', 'Entretoises', 'Contrepoids'] },
      { k: 'mat_access_com', label: 'Matériel : accessoires (détail)', t: 'text' },
      { k: 'mat_commande', label: 'Matériel : à commander (désignation × quantité)', t: 'long' },
      { k: 'mat_photos', label: 'Matériel : photos', t: 'photos' }
    ]},
    { id: 'cab', label: 'Câbles (portée vers le pylône suivant)', fields: [
      { k: 'cab_suivant', label: 'Câbles : pylône suivant', t: 'text', auto: 'suivant' },
      { k: 'cab_portee', label: 'Câbles : portée (m)', t: 'number', auto: 'portee' },
      { k: 'cab_cond', label: 'Câbles : conducteurs (type, section)', t: 'text' },
      { k: 'cab_garde', label: 'Câbles : câble de garde', t: 'choice', o: ['Classique', 'OPGW', 'Aucun'] },
      { k: 'cab_etat', label: 'Câbles : état', t: 'choice', o: ['Bon', 'Brins cassés', 'À surveiller'] },
      { k: 'cab_travers', label: 'Câbles : traversées', t: 'multi', o: ['Route', 'Rail', 'Ligne électrique', 'Cours d\'eau'] },
      { k: 'cab_veg', label: 'Câbles : distance à la végétation (m)', t: 'number' },
      { k: 'cab_com', label: 'Câbles : commentaire', t: 'long' },
      { k: 'cab_photos', label: 'Câbles : photos', t: 'photos' }
    ]},
    { id: 'nota', label: 'Nota particuliers', fields: [
      { k: 'nota_env', label: 'Nota : environnement', t: 'long', auto: 'environnement' },
      { k: 'nota_contraintes', label: 'Nota : contraintes (saison, cultures, riverains)', t: 'long' },
      { k: 'nota_infos', label: 'Nota : infos diverses', t: 'long' },
      { k: 'nota_photos', label: 'Nota : photos', t: 'photos' },
      { k: 'nota_audio', label: 'Nota : notes vocales', t: 'audio' }
    ]},
    { id: 'suivi', label: 'Suivi', fields: [
      { k: 'statut', label: 'Statut', t: 'choice', o: ['À visiter', 'Visité', 'Validé'] },
      { k: 'date_visite', label: 'Date de visite', t: 'date' },
      { k: 'auteur', label: 'Auteur', t: 'text' }
    ]}
  ];

  var FIELDS = [], BY_KEY = {}, BY_LABEL = {};
  SECTIONS.forEach(function (s) { s.fields.forEach(function (f) { f.section = s; FIELDS.push(f); BY_KEY[f.k] = f; BY_LABEL[f.label] = f; }); });
  var HEADERS = ['N°', 'Latitude', 'Longitude', 'X Lambert 93', 'Y Lambert 93'].concat(FIELDS.map(function (f) { return f.label; })).concat(['Modifié le']);
  var IMPORT_PREFIX = 'Infos importées : ';

  // champs « pièces jointes » (photos, notes vocales) : une ligne « nom | lien » par fichier, jamais saisis à la main
  function isFile(f) { return f.t === 'photos' || f.t === 'audio'; }

  C.fiche = { SECTIONS: SECTIONS, FIELDS: FIELDS, BY_KEY: BY_KEY, BY_LABEL: BY_LABEL, HEADERS: HEADERS, IMPORT_PREFIX: IMPORT_PREFIX, isFile: isFile };
})();
