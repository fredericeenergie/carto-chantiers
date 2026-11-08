# Carto chantiers

Appli mobile (à ajouter sur l'écran d'accueil) pour les chantiers de lignes aériennes :

- **Fichiers :** lit les fichiers de cartographie (KMZ, KML, GPX, GeoJSON) posés **à la racine** de « Mon Drive ».
- **Pylônes :** choix du pylône (P12, Pylône 72N, 12bis…), ou appui n'importe où sur la carte, puis envoi vers **Waze** ou **Google Maps**.
- **Fonds de carte :** satellite IGN, satellite monde (Esri) ou carte IGN.
- **Calques publics à afficher ou masquer :**
  - électricité : RTE et Enedis ;
  - gaz et canalisations ;
  - SNCF ;
  - cadastre ;
  - eau et inondations, avec Vigicrues ;
  - sous-sol ;
  - environnement ;
  - végétation ;
  - règlementaire ;
  - drones ;
  - relief.
- **« Que trouve-t-on ici ? » :** nom de la ligne, tension, zonage du PLU… à l'endroit touché.
- **Mesure :** distances et surfaces.
- **Hors ligne :** un chantier préparé (fonds et calques dans un rayon de 1 km) reste consultable sans réseau.

> Les données publiques sont indicatives : elles ne remplacent jamais une DT-DICT.

## Installation (une seule fois, depuis un ordinateur)

### 1. Activer la page GitHub
Dans ce dépôt, ouvre **Settings → Pages**. Pour « Source », choisis **Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
Au bout d'une minute, l'appli est en ligne à l'adresse : https://fredericeenergie.github.io/carto-chantiers/

### 2. Créer la porte Drive (Apps Script)
1. Va sur https://script.google.com et crée un **Nouveau projet**, nommé « Carto chantiers – porte ».
2. Remplace le contenu de `Code.gs` par celui du fichier [`apps-script/Code.gs`](apps-script/Code.gs) de ce dépôt, puis enregistre.
3. En haut, choisis la fonction **creerCle**, puis clique sur **Exécuter**. Accepte les autorisations (accès au Drive et aux services externes).
4. Clique sur **Déployer → Nouveau déploiement**, avec le type **Application Web** :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**

   La clé secrète protège l'accès : sans elle, la porte ne répond rien.
5. Choisis la fonction **lienInstallation**, puis clique sur **Exécuter**. Ouvre le **Journal d'exécution** et copie le lien affiché.

### 3. Sur le téléphone
1. Envoie-toi le lien (mail ou message), puis ouvre-le **dans Chrome** sur le téléphone. L'appli se configure toute seule.
2. Dans le menu ⋮ de Chrome, choisis **Ajouter à l'écran d'accueil** (ou **Installer l'application**).
3. Autorise la localisation si tu veux le bouton « ma position ».

Ne partage pas ce lien : il contient ta clé. Pour changer la clé, relance `creerCle()` puis `lienInstallation()`.

## Hors ligne
Ouvre le fichier du chantier, touche le bouton ⬇, puis **Préparer hors ligne**. L'estimation de taille s'affiche avant le téléchargement. Pendant celui-ci, garde l'appli ouverte et, de préférence, reste en Wi-Fi.
Pour le guidage sans réseau, télécharge aussi la zone dans Google Maps (Hors connexion). Waze a besoin du réseau.

## Sources des calques
IGN Géoplateforme · Géorisques · Géoportail de l'Urbanisme · INPN · DGAC · RTE, Enedis, GRDF et SNCF Réseau via GéoBretagne · RTE (Open Data Réseaux Énergies) · Vigicrues.
