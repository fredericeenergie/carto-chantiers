# Carto chantiers — v2.6

Appli de cartographie de chantiers de lignes aériennes. Elle s'utilise sur **téléphone** (comme une appli, avec hors ligne), sur **tablette** et sur **ordinateur** (dans Chrome ou Edge, sans rien installer).

Adresse : https://fredericeenergie.github.io/carto-chantiers/

## Où est quoi

Trois boutons en haut, un bouton photo sur la carte, quatre onglets. Chaque fonction n'a qu'un seul endroit.

| Où | Pour | Contenu |
|---|---|---|
| **Chantier** (en haut) | Choisir | Ouvrir un KMZ, KML, GPX, GeoJSON ou un **plan AutoCAD (DXF)** depuis Mon Drive, un dossier du Drive ou l'appareil ; créer un chantier vierge ou depuis un tableau ; afficher, masquer, fermer ; choisir les dossiers affichés. Plusieurs chantiers peuvent être superposés. |
| **Loupe** (en haut) | Trouver | Adresse, commune, lieu-dit, coordonnées GPS ou Lambert 93 ; ou une **parcelle** par commune, section et numéro. |
| **Pylône** (en haut) | Aller à | Choisir un pylône, puis Waze ou Google Maps, la **fiche pylône** et « Que trouve-t-on ici ? ». |
| Bouton **photo** (sur la carte) | Photographier | Un appui, une photo : elle se range seule dans la fiche du pylône le plus proche, ou devient un point terrain. |
| Onglet **Calques** | Voir | **Fond de carte** (satellite IGN, satellite monde, carte IGN, infrarouge IGN, photos 1950-1965, carte IGN 1950). Une quarantaine de **calques publics** avec légende, transparence, ordre d'empilement (glisser ⠿ ou ▲▼), œil pour masquer sans éteindre, « Tout éteindre ». Électricité (RTE, Enedis), gaz, SNCF, **routes et chemins** (praticabilité, limites connues), cadastre, eau et inondations (dont Vigicrues en direct), sous-sol, environnement, végétation (dont LiDAR HD), agriculture (RPG), géologie, bâtiments, communes, règlementaire, drones, relief. |
| Onglet **Terrain** | Relever | **Mesurer** (distance, surface), **profil en long**, **ajouts terrain** — point, ligne ou zone, avec note (tapée ou **dictée**), photos et pylône concerné — et **relecture** des ajouts (valider, intégrer au chantier). |
| Onglet **Chantier** | Préparer | **Modifier** le chantier (ajouter un pylône, une ligne, une zone ; déplacer, renommer, supprimer ; enregistrer une version). **Données** : importer un tableau, fiches pylônes, dossier des photos. **Hors ligne** et **paquets chantier**. **Réglages** (porte Drive, logo et éditeur des PDF, stockage). |
| Onglet **Export** | Livrer | **Atlas PDF A4** (ensemble, série au 1/2 500, une page par pylône, légende, tableau, fiches) et **rapport de visite PDF**. **Fichier** KMZ, KML, GPX, GeoJSON ou DXF (Lambert 93), dossier par dossier, avec au besoin les réseaux publics en vrais tracés (1 km autour du chantier), les communes traversées et des tableaux CSV. **Lien de consultation** : un chantier en lecture seule pour quelqu'un d'autre. |

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
- À l'ordinateur : **glisse-dépose** des KMZ, KML, GPX, GeoJSON ou DXF sur la carte pour les ouvrir, ou un tableau CSV / Excel pour l'importer dans les fiches. Pendant un tracé : **Entrée** termine, **Retour arrière** ou **Ctrl+Z** retire le dernier point.
- Les photos sont réduites à 2 560 px avant l'envoi : l'envoi depuis le terrain est rapide et le Drive reste léger.
- L'appli démarre instantanément, même sans réseau. Quand une nouvelle version est en ligne, un message propose de **recharger**.

### Photo rapide
- Bouton **photo** bleu, sur la carte. L'appareil photo s'ouvre ; au retour, l'appli regarde où tu es.
- **À moins de 50 m d'un pylône** du chantier actif : elle propose sa fiche et la rubrique (Général, Fondations, Embases, Structure, Équipements, Matériel, Câbles). La dernière rubrique choisie est proposée d'office. « Ce n'est pas ce pylône » en fait un point terrain.
- **Plus loin** : la photo devient un ajout terrain « Photo » à l'endroit de la prise de vue, à compléter si besoin.
- **GPS absent ou trop vague** (plus de 50 m d'incertitude) : la carte se place au mieux et tu touches l'endroit.
- Sans réseau, la photo attend sur l'appareil et part au retour du réseau.

### Dictée vocale
- Bouton **micro** dans la note d'un ajout terrain et dans les champs de commentaire de la fiche pylône. « Terminer » ajoute le texte à la suite de ce qui est écrit ; « Annuler » ne garde rien.
- **Le texte** va dans le champ. **L'enregistrement audio** est gardé à part, dans un sous-dossier **« Notes vocales »** du dossier des photos du chantier, avec un lien dans l'ajout terrain ou dans la fiche (colonne « Nota : notes vocales » du Google Sheet).
- Selon l'appareil, on obtient le texte, l'audio, ou les deux. Sur **ordinateur** : en général les deux. Sur **Android** : le texte quand il y a du réseau (la reconnaissance vocale de Google prend alors le micro), l'audio seul sans réseau. Sur **iPhone** : l'audio, et le texte si Safari l'autorise. L'appli dit à chaque fois ce qu'elle a gardé.
- 5 minutes au plus par dictée.

### Rechercher un lieu ou une parcelle
- Bouton **loupe** en haut (ou touche **/** à l'ordinateur) : adresse postale, commune, lieu-dit, ou coordonnées **GPS** (44.9127, -0.5302 ou 44°54'45"N 0°31'57"W) ou **Lambert 93** (419373 6433824).
- Le choix d'un résultat centre la carte, passe en **vue aérienne** et ouvre le point avec Waze / Google Maps.
- Les dernières recherches sont gardées ; les coordonnées marchent aussi hors ligne.
- **Parcelle** : commune (nom ou code postal), section, numéro. Le contour s'affiche avec la référence, la surface et l'identifiant cadastral. La dernière commune est proposée d'office. À Paris, Lyon et Marseille, choisis l'arrondissement.
- Calque **Cadastre** allumé : un appui sur la carte donne la référence et la surface de la parcelle touchée.

### Routes et chemins
- Onglet **Calques → Routes et accès** (visible à partir du zoom 15). Source : IGN BD TOPO®.
- Couleur = praticabilité : route revêtue, route étroite (moins de 3,5 m), route empierrée, chemin de terre, sentier ou passage impossible en véhicule, accès restreint.
- **Étiquettes rouges** : limites connues de tonnage, de hauteur (↕) et de largeur (↔). Un appui sur un tronçon donne son détail.
- Ces limites sont **rarement renseignées** dans la base nationale : l'absence d'étiquette ne garantit rien. Une reconnaissance sur place reste nécessaire pour un convoi.
- Le calque fait partie de la préparation hors ligne s'il est allumé. Il n'est pas dessiné dans l'atlas PDF.

### Importer un plan AutoCAD (DXF)
- Bouton **Chantier → Ouvrir depuis l'appareil** (ou depuis le Drive, ou glisser-déposer à l'ordinateur).
- Le **système de coordonnées** est reconnu tout seul : Lambert 93, RGF93 CC42 à CC50, ou degrés GPS, en mètres comme en millimètres. S'il ne l'est pas (plan en coordonnées locales), le plan ne peut pas être placé sur la carte.
- Deux usages : **fond de plan** (affiché en plus du chantier) ou **chantier modifiable** (devient le chantier actif, à enregistrer ensuite sur le Drive).
- **Calque des pylônes** : ses points, blocs et cercles deviennent des pylônes, numérotés d'après l'attribut du bloc ou le texte le plus proche.
- Chaque calque AutoCAD devient un dossier. Les blocs sont dessinés (échelle, rotation). Les textes vont dans des sous-dossiers « Textes », masqués au départ. Les calques gelés ou éteints dans AutoCAD sont décochés. L'espace papier (cartouche) est ignoré.
- Le **DWG** ne se lit pas dans un navigateur : dans AutoCAD ou DWG TrueView (gratuit), « Enregistrer sous » → DXF. Les anciens plans en Lambert zone (NTF) ne sont pas reconnus.

### Lien de consultation
- Onglet **Export → Créer ou gérer un lien**. Le chantier doit être enregistré sur le Drive.
- Le lien ouvre **un seul chantier, en lecture seule**, pour 7 jours, 30 jours ou sans limite : carte, calques, pylônes, mesure, recherche, Waze. Pas de fiches, pas d'ajouts terrain, pas de photos.
- Il **ne contient pas ta clé** et ne donne accès à rien d'autre sur ton Drive. Rien n'est mémorisé sur l'appareil de la personne qui l'ouvre.
- Il se **supprime** quand tu veux, au même endroit : il cesse de marcher aussitôt.
- Il montre le chantier tel qu'il était enregistré au moment du lien. Après « Enregistrer une version », crée un nouveau lien.
- 20 liens au plus en même temps.

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
- **Notes vocales** : sous-dossier « Notes vocales » de ce même dossier.
- **Modifications d'un chantier** : enregistrées en nouvelle version datée, « <nom> (modifié AAAA-MM-JJ).kmz » (onglet **Chantier → Enregistrer une version**).
- **Sans réseau** : tout est gardé sur l'appareil puis envoyé dès que le réseau revient (badge « ⏳ à envoyer »).

### Importer un tableau (CSV, Excel, Google Sheet)
Onglet **Chantier → Importer un tableau**. La même fenêtre propose le fichier de l'appareil, un Google Sheet du Drive, ou **le modèle à remplir** : un fichier Excel avec toutes les colonnes de la fiche, l'onglet des valeurs possibles et un mode d'emploi. L'appli associe chaque colonne à un champ, montre un aperçu, puis complète les fiches. Elle crée aussi les pylônes absents du chantier si leurs coordonnées (GPS ou Lambert 93) sont dans le tableau.

Pour créer un chantier entier depuis un tableau : bouton **Chantier** (en haut) **→ Chantier depuis un tableau**.

### Hors ligne
Onglet **Chantier → Préparer hors ligne**. À l'ouverture d'un chantier du Drive pas encore préparé, l'appli le propose une fois (pas plus d'une fois par semaine et par chantier) ; rien ne se télécharge sans ton accord.

> Les données publiques sont indicatives : elles ne remplacent jamais une DT-DICT.

## Installation

### 1. Page GitHub (déjà fait si l'appli s'ouvre)
Dans ce dépôt, ouvre **Settings → Pages**. Pour « Source », choisis **Deploy from a branch**, branche **main**, dossier **/ (root)**.

### 2. Porte Drive (Apps Script)
- **Si tu as déjà la porte (v1 ou v2) :** la v2.6 demande la **porte v3** pour les liens de consultation, le sous-dossier « Notes vocales » et les DXF du Drive. Tout le reste marche avec l'ancienne.
  1. Sur script.google.com, ouvre ton projet. Remplace **tout** le contenu de `Code.gs` par [`apps-script/Code.gs`](apps-script/Code.gs), puis enregistre.
  2. **Déployer → Gérer les déploiements → ✎ Modifier → Version : Nouvelle version → Déployer**.
  3. C'est tout : l'adresse ne change pas, rien à refaire sur le téléphone. Depuis la v2, aucune nouvelle autorisation n'est demandée.
- **Première installation :**
  1. Sur script.google.com, crée un nouveau projet et colle `apps-script/Code.gs`.
  2. Exécute `creerCle`.
  3. Déploie en **Application Web** (« Exécuter en tant que : Moi », « Accès : Tout le monde »).
  4. Copie l'adresse du déploiement (elle finit par **/exec**) dans `var PORTE_URL`, enregistre, puis exécute `lienInstallation`. Le journal affiche un lien : ouvre-le une fois sur **chaque appareil** (téléphone, ordinateur).

Ne partage pas ce lien d'installation : il contient ta clé. La porte peut **écrire** sur ton Drive. Pour montrer un chantier à quelqu'un, utilise un **lien de consultation** (onglet Export), qui ne contient pas la clé.

N'ouvre un lien d'installation que s'il vient de ton propre Apps Script. Par précaution, l'appli refuse un lien dont l'adresse n'est pas une porte Apps Script, et **demande avant de remplacer** une porte déjà réglée par une autre.

Vérifier la version de la porte : onglet **Chantier → Réglages → Enregistrer et tester** affiche « Connexion OK — porte version 3 ».

### 3. Téléphone
Ouvre le lien dans Chrome, puis menu ⋮ → **Ajouter à l'écran d'accueil**. Pour le hors ligne, ouvre le chantier, puis onglet **Chantier → Préparer hors ligne**, de préférence en Wi-Fi. Pour le guidage sans réseau, télécharge aussi la zone dans Google Maps (hors connexion).

## Pour reprendre le code
Les règles de navigation, le vocabulaire de l'interface et le nommage (fichiers, identifiants, attributs, classes CSS, tailles d'écran) sont dans [`CONVENTIONS.md`](CONVENTIONS.md).

## Sources des calques
IGN Géoplateforme (orthophotos, Plan IGN, cadastre, BD TOPO dont routes et chemins, BD Forêt, BD Haie, LiDAR HD, RPG, Admin Express, altimétrie) · Géorisques · Géoportail de l'Urbanisme · INPN · DGAC · RTE, Enedis, GRDF et SNCF Réseau via GéoBretagne · Open Data Réseaux Énergies · Vigicrues · BRGM (en essai) · API Carto IGN et geo.api.gouv.fr (parcelles, communes, remplissage automatique).
