# Carto chantiers — v2.5

Appli de cartographie de chantiers de lignes aériennes. Elle s'utilise sur **téléphone** (comme une appli, avec hors ligne), sur **tablette** et sur **ordinateur** (dans Chrome ou Edge, sans rien installer).

Adresse : https://fredericeenergie.github.io/carto-chantiers/

## Où est quoi

Trois boutons en haut, quatre onglets. Chaque fonction n'a qu'un seul endroit.

| Où | Pour | Contenu |
|---|---|---|
| **Chantier** (en haut) | Choisir | Ouvrir un KMZ, KML, GPX ou GeoJSON depuis Mon Drive, un dossier du Drive ou l'appareil ; créer un chantier vierge ou depuis un tableau ; afficher, masquer, fermer ; choisir les dossiers affichés. Plusieurs chantiers peuvent être superposés. |
| **Loupe** (en haut) | Trouver | Adresse, commune, lieu-dit, coordonnées GPS ou Lambert 93. |
| **Pylône** (en haut) | Aller à | Choisir un pylône, puis Waze ou Google Maps, la **fiche pylône** et « Que trouve-t-on ici ? ». |
| Onglet **Calques** | Voir | **Fond de carte** (satellite IGN, satellite monde, carte IGN, infrarouge IGN, photos 1950-1965, carte IGN 1950). Une quarantaine de **calques publics** avec légende, transparence, ordre d'empilement (glisser ⠿ ou ▲▼), œil pour masquer sans éteindre, « Tout éteindre ». Électricité (RTE, Enedis), gaz, SNCF, cadastre, eau et inondations (dont Vigicrues en direct), sous-sol, environnement, végétation (dont LiDAR HD), agriculture (RPG), géologie, bâtiments, communes, règlementaire, drones, relief. |
| Onglet **Terrain** | Relever | **Mesurer** (distance, surface), **profil en long**, **ajouts terrain** — point, ligne ou zone, avec note, photos et pylône concerné — et **relecture** des ajouts (valider, intégrer au chantier). |
| Onglet **Chantier** | Préparer | **Modifier** le chantier (ajouter un pylône, une ligne, une zone ; déplacer, renommer, supprimer ; enregistrer une version). **Données** : importer un tableau, fiches pylônes, dossier des photos. **Hors ligne** et **paquets chantier**. **Réglages** (porte Drive, logo et éditeur des PDF, stockage). |
| Onglet **Export** | Livrer | **Atlas PDF A4** (ensemble, série au 1/2 500, une page par pylône, légende, tableau, fiches) et **rapport de visite PDF**. **Fichier** KMZ, KML, GPX, GeoJSON ou DXF (Lambert 93), dossier par dossier, avec au besoin les réseaux publics en vrais tracés (1 km autour du chantier), les communes traversées et des tableaux CSV. |

Dans les onglets, trois formes, trois sens :

- une **tuile** lance tout de suite une action, le plus souvent sur la carte ;
- une **ligne à chevron ›** ouvre une fenêtre ;
- le **bouton bleu** est l'action principale.

Les mots sont les mêmes partout : **Enregistrer** garde ce qui est saisi, **Annuler** quitte sans rien garder, **Fermer** referme sans rien perdre, **Supprimer** efface pour de bon (toujours après confirmation), **Ajouter** met un élément dans le chantier, **Créer** fabrique un nouveau chantier, paquet ou PDF. Les formes s'appellent **point, ligne, zone**.

### Prise en main
- **Téléphone debout** : onglets en bas, panneaux qui montent du bas. **Téléphone couché** : onglets à gauche, panneau à gauche, fenêtres à droite. **Tablette** : panneau flottant, fenêtres centrées ; les formulaires passent sur deux ou trois colonnes. **Ordinateur** : panneau fixe à gauche, fenêtres à droite ; la fiche pylône, l'import et la relecture s'élargissent pour utiliser l'écran.
- Le **bouton retour** du téléphone (ou **Échap** à l'ordinateur) referme d'abord la fenêtre ouverte, puis la fiche du point, puis le panneau.
- Une saisie non enregistrée (fiche pylône, ajout terrain) n'est jamais perdue par erreur : l'appli propose de **continuer la saisie** ou de **quitter sans enregistrer**.
- Fiche d'un pylône : **◀ ▶** pour passer au pylône précédent ou suivant ; dans la fiche pylône, **◀ 12 / 14 ▶** enregistre et passe au suivant.
- **Ma position** : un appui centre la carte sur toi et te suit ; dès que tu déplaces la carte, le suivi s'arrête (le point bleu reste) ; nouvel appui pour recentrer, encore un pour arrêter.
- À l'ordinateur : **glisse-dépose** des KMZ, KML, GPX, GeoJSON sur la carte pour les ouvrir, ou un tableau CSV / Excel pour l'importer dans les fiches. Pendant un tracé : **Entrée** termine, **Retour arrière** ou **Ctrl+Z** retire le dernier point.
- Les photos sont réduites à 2 560 px avant l'envoi : l'envoi depuis le terrain est rapide et le Drive reste léger.
- L'appli démarre instantanément, même sans réseau. Quand une nouvelle version est en ligne, un message propose de **recharger**.

### Rechercher un lieu
- Bouton **loupe** en haut (ou touche **/** à l'ordinateur) : adresse postale, commune, lieu-dit, ou coordonnées **GPS** (44.9127, -0.5302 ou 44°54'45"N 0°31'57"W) ou **Lambert 93** (419373 6433824).
- Le choix d'un résultat centre la carte, passe en **vue aérienne** et ouvre le point avec Waze / Google Maps.
- Les dernières recherches sont gardées ; les coordonnées marchent aussi hors ligne.

### Légendes et « Que trouve-t-on ici ? »
- Chaque calque affiché a sa légende dans l'onglet Calques (et dans la page Légende de l'atlas PDF). Quand le service public n'en fournit pas de lisible, l'appli dessine la sienne.
- **Carte géologique** : clé de lecture (couleur = âge des terrains, lettres F, C, e, j… = notation). Un appui sur la carte donne la famille de roche, le numéro et le nom de la feuille 1/50 000, et un lien vers sa **notice BRGM** où chaque code est décrit.
- **Nature du sous-sol (simplifiée)** : 11 familles (argiles, sables, calcaires, granites…), lisible d'un coup d'œil, disponible hors ligne.
- **Hauteur LiDAR** : échelle 0 → 30 m et plus ; un appui donne la hauteur mesurée au point.
- **Environnement** (Natura 2000, ZNIEFF, espaces protégés, PNR, Ramsar) : un appui donne le nom du site et un lien vers sa fiche officielle INPN.
- Dès qu'un calque interrogeable est allumé, un appui sur la carte affiche directement ces informations.

### Où vont les données
- **Fiches pylônes** : un Google Sheet par chantier, « <chantier> - fiches pylônes », rangé à côté du chantier. Une ligne par pylône, avec des listes déroulantes. Il se modifie aussi bien dans l'appli que dans Sheets.
- **Ajouts terrain** : fichier « <chantier> - terrain.kml » à côté du chantier. Le chantier d'origine n'est jamais modifié.
- **Photos** : par défaut dans « Mon Drive › Carto chantiers – photos › <chantier> » ; dossier modifiable dans l'onglet **Chantier → Dossier des photos**.
- **Modifications d'un chantier** : enregistrées en nouvelle version datée, « <nom> (modifié AAAA-MM-JJ).kmz » (onglet **Chantier → Enregistrer une version**).
- **Sans réseau** : tout est gardé sur l'appareil puis envoyé dès que le réseau revient (badge « ⏳ à envoyer »).

### Importer un tableau (CSV, Excel, Google Sheet)
Onglet **Chantier → Importer un tableau**. La même fenêtre propose le fichier de l'appareil, un Google Sheet du Drive, ou **le modèle à remplir** : un fichier Excel avec toutes les colonnes de la fiche, l'onglet des valeurs possibles et un mode d'emploi. L'appli associe chaque colonne à un champ, montre un aperçu, puis complète les fiches. Elle crée aussi les pylônes absents du chantier si leurs coordonnées (GPS ou Lambert 93) sont dans le tableau.

Pour créer un chantier entier depuis un tableau : bouton **Chantier** (en haut) **→ Chantier depuis un tableau**.

> Les données publiques sont indicatives : elles ne remplacent jamais une DT-DICT.

## Installation

### 1. Page GitHub (déjà fait si l'appli s'ouvre)
Dans ce dépôt, ouvre **Settings → Pages**. Pour « Source », choisis **Deploy from a branch**, branche **main**, dossier **/ (root)**.

### 2. Porte Drive (Apps Script)
- **Si tu as déjà la porte v1 :** remplace tout le contenu de `Code.gs` par [`apps-script/Code.gs`](apps-script/Code.gs), puis enregistre. Ensuite, **Déployer → Gérer les déploiements → ✎ Modifier → Version : Nouvelle version → Déployer**. Accepte les nouvelles autorisations (Google Sheets, création de fichiers). L'adresse ne change pas.
- **Première installation :**
  1. Sur script.google.com, crée un nouveau projet et colle `apps-script/Code.gs`.
  2. Exécute `creerCle`.
  3. Déploie en **Application Web** (« Exécuter en tant que : Moi », « Accès : Tout le monde »).
  4. Copie l'adresse du déploiement (elle finit par **/exec**) dans `var PORTE_URL`, enregistre, puis exécute `lienInstallation`. Le journal affiche un lien : ouvre-le une fois sur **chaque appareil** (téléphone, ordinateur).

Ne partage pas ce lien : il contient ta clé. La porte peut **écrire** sur ton Drive.

La v2.5 ne change rien à la porte : pas de nouveau `Code.gs` à coller.

### 3. Téléphone
Ouvre le lien dans Chrome, puis menu ⋮ → **Ajouter à l'écran d'accueil**. Pour le hors ligne, ouvre le chantier, puis onglet **Chantier → Préparer hors ligne**, de préférence en Wi-Fi. Pour le guidage sans réseau, télécharge aussi la zone dans Google Maps (hors connexion).

## Pour reprendre le code
Les règles de navigation, le vocabulaire de l'interface et le nommage (fichiers, identifiants, attributs, classes CSS, tailles d'écran) sont dans [`CONVENTIONS.md`](CONVENTIONS.md).

## Sources des calques
IGN Géoplateforme (orthophotos, Plan IGN, cadastre, BD TOPO, BD Forêt, BD Haie, LiDAR HD, RPG, Admin Express, altimétrie) · Géorisques · Géoportail de l'Urbanisme · INPN · DGAC · RTE, Enedis, GRDF et SNCF Réseau via GéoBretagne · Open Data Réseaux Énergies · Vigicrues · BRGM (en essai) · API Carto IGN et geo.api.gouv.fr (remplissage automatique).
