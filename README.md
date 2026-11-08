# Carto chantiers — v2

Appli de cartographie de chantiers de lignes aériennes. Elle s'utilise sur **téléphone** (comme une appli, avec hors ligne) et sur **ordinateur** (dans Chrome ou Edge, sans rien installer).

Adresse : https://fredericeenergie.github.io/carto-chantiers/

## Ce qu'elle fait

| Onglet | Contenu |
|---|---|
| **Chantier** (en haut) | Ouvrir des KMZ, KML, GPX ou GeoJSON depuis la racine du Drive, n'importe quel dossier, l'appareil ou un tableau. Plusieurs fichiers peuvent être superposés, avec choix des dossiers affichés. |
| **Pylône** (en haut) | Choisir un pylône, puis Waze ou Google Maps, la **fiche pylône** et « que trouve-t-on ici ? ». |
| **Carte** | Fonds (satellite IGN, satellite monde, carte IGN), préparation **hors ligne**, **paquets chantier**, réglages (porte Drive, logo, éditeur). |
| **Calques** | Une quarantaine de calques publics avec **légende** et opacité. Électricité (RTE, Enedis), gaz, SNCF, cadastre, eau et inondations (dont Vigicrues en direct), sous-sol, environnement, végétation (dont LiDAR HD), agriculture (RPG), géologie, communes, règlementaire, drones, relief. |
| **Outils** | Mesure (distance, surface), **profil en long**, **ajouts terrain** (point, tracé ou zone avec note et photos), modification du chantier (ajouter, déplacer, renommer ou supprimer des pylônes, tracer accès et zones), nouveau chantier, relecture et validation des ajouts. |
| **Export** | **KMZ, KML, GPX, GeoJSON, DXF** (Lambert 93), couche par couche. Peut inclure les **réseaux publics en vrais tracés** (1 km autour du chantier), les communes traversées et des tableaux CSV (pylônes avec GPS et Lambert 93, ajouts, communes). Aussi : **atlas PDF A4** (ensemble, série au 1/2 500, une page par pylône, légende, tableau, fiches) et **rapport de visite PDF**. |

### Où vont les données
- **Fiches pylônes** : un Google Sheet par chantier, « <chantier> - fiches pylônes », rangé à côté du fichier du chantier. Une ligne par pylône, avec des listes déroulantes. Il se modifie aussi bien dans l'appli que dans Sheets.
- **Ajouts terrain** : fichier « <chantier> - terrain.kml » à côté du chantier. Le fichier d'origine n'est jamais modifié.
- **Photos** : par défaut dans « Mon Drive › Carto chantiers – photos › <chantier> », dossier modifiable dans Outils.
- **Modifications d'un chantier** : enregistrées en nouvelle version datée, « <nom> (modifié AAAA-MM-JJ).kmz ».
- **Sans réseau** : tout est gardé sur l'appareil puis envoyé dès que le réseau revient (badge « ⏳ à envoyer »).

### Importer des données (CSV, Excel, Google Sheet)
Ouvre **Export → Modèle à remplir** pour obtenir un fichier Excel avec toutes les colonnes de la fiche, l'onglet des valeurs possibles et un mode d'emploi. Remplis-le, puis lance **Export → Importer des données**. L'appli associe chaque colonne à un champ, montre un aperçu, puis complète les fiches. Elle crée aussi les pylônes absents du chantier si leurs coordonnées (GPS ou Lambert 93) sont dans le tableau.

> Les données publiques sont indicatives : elles ne remplacent jamais une DT-DICT.

## Installation

### 1. Page GitHub (déjà fait si la v1 marche)
Dans ce dépôt, ouvre **Settings → Pages**. Pour « Source », choisis **Deploy from a branch**, branche **main**, dossier **/ (root)**.

### 2. Porte Drive (Apps Script)
- **Si tu as déjà la porte v1 :** remplace tout le contenu de `Code.gs` par [`apps-script/Code.gs`](apps-script/Code.gs), puis enregistre. Ensuite, **Déployer → Gérer les déploiements → ✎ Modifier → Version : Nouvelle version → Déployer**. Accepte les nouvelles autorisations (Google Sheets, création de fichiers). L'adresse ne change pas.
- **Première installation :**
  1. Sur script.google.com, crée un nouveau projet et colle `apps-script/Code.gs`.
  2. Exécute `creerCle`.
  3. Déploie en **Application Web** (« Exécuter en tant que : Moi », « Accès : Tout le monde »).
  4. Exécute `lienInstallation`. Le journal affiche un lien : ouvre-le une fois sur **chaque appareil** (téléphone, ordinateur).

Ne partage pas ce lien : il contient ta clé. Avec la v2, la porte peut aussi **écrire** sur ton Drive.

### 3. Téléphone
Ouvre le lien dans Chrome, puis menu ⋮ → **Ajouter à l'écran d'accueil**. Pour le hors ligne, ouvre le chantier, puis **Carte → Préparer hors ligne**, de préférence en Wi-Fi. Pour le guidage sans réseau, télécharge aussi la zone dans Google Maps (hors connexion).

## Sources des calques
IGN Géoplateforme (orthophotos, Plan IGN, cadastre, BD TOPO, BD Forêt, BD Haie, LiDAR HD, RPG, Admin Express, altimétrie) · Géorisques · Géoportail de l'Urbanisme · INPN · DGAC · RTE, Enedis, GRDF et SNCF Réseau via GéoBretagne · Open Data Réseaux Énergies · Vigicrues · BRGM (en essai) · API Carto IGN et geo.api.gouv.fr (remplissage automatique).
