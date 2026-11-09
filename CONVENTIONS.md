# Conventions — navigation, vocabulaire et code

Ce fichier fixe les règles suivies depuis la v2.5 (complétées en v2.6). Tout ajout les respecte, pour que l'appli reste simple à utiliser et le code simple à reprendre.

## 1. Navigation

**Un onglet = une intention. Une fonction = un seul endroit.**

| Où | Intention | Contenu |
|---|---|---|
| Bouton **Chantier** (haut) | Choisir | Fenêtre « Chantiers » : ouverts, ouvrir (Drive, appareil ; KMZ, KML, GPX, GeoJSON, DXF), créer (vierge, depuis un tableau) |
| **Loupe** (haut) | Trouver | Adresse, lieu, coordonnées GPS ou Lambert 93 ; parcelle (commune, section, numéro) |
| Bouton **Pylône** (haut) | Aller à | Sélecteur de pylône → fiche du point → fiche pylône |
| Bouton **photo** (carte) | Photographier | Photo rangée seule : fiche du pylône à moins de 50 m, sinon ajout terrain |
| Onglet **Calques** | Voir | Fond de carte, calques affichés (ordre, transparence, légende), catalogue |
| Onglet **Terrain** | Relever | Mesurer, profil en long, ajouts terrain (point, ligne, zone), relecture |
| Onglet **Chantier** | Préparer | Modifier le chantier, données (import, fiches, photos), hors ligne, paquets, réglages |
| Onglet **Export** | Livrer | Atlas PDF, rapport PDF, fichier de cartographie, lien de consultation |

Règles :

- **Trois appuis au plus** pour atteindre une fonction depuis la carte ; une confirmation de suppression ne compte pas.
- **Deux niveaux de fenêtre au plus** : une fenêtre (`#dlg`) et, par-dessus, une question courte (`#dlg2` : confirmer, nommer, choisir, parcourir le Drive).
- **Pas de doublon** : une action n'a qu'une entrée. Un rappel ailleurs est un lien vers cette entrée (ex. « Changer » dans l'onglet Chantier ouvre la fenêtre « Chantiers »).
- Trois formes, trois sens :
  - **tuile** = action immédiate, souvent sur la carte (le panneau se referme sur téléphone) ;
  - **ligne à chevron ›** = ouvre une fenêtre ;
  - **bouton bleu** = action principale, un seul par fenêtre ou par section d'onglet.
- **Une proposition n'est jamais une fenêtre** : ce que l'appli suggère d'elle-même (nouvelle version, préparation hors ligne) passe par un message avec un bouton (`U.toastAction`), qui s'efface seul.
- **Une saisie faite sur le terrain ne se perd pas sur un geste** : photo prise, dictée, formulaire modifié → fermer demande confirmation (`guard` de `C.openDialog`).
- **Consultation** (`C.viewer`, lien `#vue=`) : l'appli ne mémorise rien (`U.store` en mémoire, `C.saveData` inactif), n'appelle la porte que par le jeton, et n'affiche que ce qui se lit : onglets Calques et Terrain (mesure, profil), pylônes, recherche. Toute nouvelle fonction qui écrit, ou qui passe par la clé, se masque dans ce mode.

## 2. Vocabulaire de l'interface

Un mot par action, le même partout.

| Mot | Sens | Ne pas écrire |
|---|---|---|
| **Enregistrer** | Garder ce qui vient d'être saisi (formulaire, mesure, réglage) | Valider, OK, Garder, Sauver |
| **Annuler** | Quitter sans rien garder (bouton secondaire) | Abandonner |
| **Fermer** | Refermer une fenêtre, un outil ou un chantier, sans rien perdre | Terminer, Quitter |
| **Terminer** | Finir un tracé en cours sur la carte | Valider |
| **↶ Dernier point** | Retirer le dernier point posé | Annuler |
| **Supprimer** | Effacer définitivement (bouton rouge, toujours confirmé) | Retirer, Effacer |
| **Créer** | Fabriquer un nouvel objet : chantier, dossier, paquet, PDF | |
| **Ajouter** | Mettre un élément dans un chantier : pylône, point, ligne, zone, photo | Créer, Tracer |
| **Ouvrir** | Charger un chantier ou un paquet | (pas pour une fenêtre) |
| **Modifier** | Changer un élément existant | Éditer |
| **Importer / Exporter** | Faire entrer un tableau / produire des fichiers | |
| **Afficher / Masquer** | Montrer ou cacher sans rien éteindre ni fermer | Montrer |
| **Éteindre** | Retirer un calque de la carte | |
| **Préparer hors ligne** | Télécharger la zone du chantier sur l'appareil | Télécharger |
| **Valider** | Réservé au **statut** : ajout « À valider / Validé », fiche « Validé » | |
| **Changer** | Remplacer un choix : chantier actif, dossier, image | |
| **Voir** | Montrer un élément sur la carte | |
| **Arrêter** | Interrompre un téléchargement en cours | |
| **Terminer** (dictée) | Finir une dictée et garder ce qui a été dit | Stop, OK |
| **Copier** | Mettre un lien ou des coordonnées dans le presse-papiers | |

Noms :

- **chantier** : le fichier de cartographie ouvert dans l'appli. « Fichier » ne sert que pour l'objet technique (fichier exporté, fichier de l'appareil).
- **point, ligne, zone** : les trois formes. Ni « tracé » ni « polygone » pour une forme.
- **ajout terrain** : ce qui est relevé sur site, rangé à part du chantier.
- **Mon Drive** : la racine du Drive.
- **lien de consultation** : le lien en lecture seule vers un chantier. « Lien d'installation » désigne seulement celui qui contient la clé.
- **note vocale** : l'enregistrement audio d'une dictée. **fond de plan** : un plan importé affiché sous le chantier actif.
- **calque AutoCAD** : un calque d'un fichier DXF (pour ne pas le confondre avec les calques de la carte).
- Tutoiement partout. Questions de confirmation : le bouton reprend le verbe de l'action (« Supprimer », « Tout éteindre »), jamais « Oui » ou « OK ».

## 3. Fichiers

| Fichier | Rôle |
|---|---|
| `js/core.js` | Noyau : utilitaires (`U`), composants (`C.ui`), porte Drive, fenêtres, panneau et onglets, carte, fonds et calques |
| `js/docs.js` | Chantiers ouverts : fenêtre « Chantiers », dossiers, navigateur Drive, pylônes, fiche du point, enregistrement, synchronisation |
| `js/calques.js` | Onglet **Calques** |
| `js/tools.js` | Onglet **Terrain** et outils sur la carte (mesure, profil, tracé, ajouts, relecture, modification) |
| `js/chantier.js` | Onglet **Chantier**, hors ligne, paquets, réglages |
| `js/export.js` | Onglet **Export**, formats, réseaux publics, destinations |
| `js/fiches.js`, `js/fiche.js` | Fiches pylônes : formulaire, import de tableaux ; liste des champs |
| `js/pdf.js` | Atlas et rapport PDF |
| `js/search.js` | Recherche de lieu et de parcelle |
| `js/photo.js` | Photo rapide (bouton photo de la carte) |
| `js/voice.js` | Dictée vocale : texte et enregistrement audio |
| `js/routes.js` | Calque « Routes et chemins » (BD TOPO) : praticabilité, limites |
| `js/dxf.js` | Import d'un plan AutoCAD (DXF) : lecture, système de coordonnées, fenêtre d'import |
| `js/share.js` | Lien de consultation : création et gestion ; mode consultation |
| `js/main.js` | Position de l'utilisateur (suivi, position d'une prise de vue), démarrage |
| `js/layers.js`, `js/geology.js`, `js/formats.js`, `js/parse.js`, `js/geo.js`, `js/offline.js` | Catalogue des calques, géologie, formats de fichiers, lecture, géométrie, hors ligne |
| `css/app.css` | Style, téléphone d'abord ; sections numérotées, adaptations d'écran en fin de fichier |

## 4. Nommage dans le code

### Fonctions JavaScript
- Identifiants en anglais, `camelCase` ; les noms du métier restent en français (`chantier`, `paquet`, `porte`, `fiche`).
- Toute fonction qui ouvre une fenêtre finit par **`Dialog`** : `C.chantiersDialog`, `C.foldersDialog`, `C.driveDialog`, `C.pylonsDialog`, `C.searchDialog`, `C.settingsDialog`, `C.offlineDialog`, `C.paquetsDialog`, `C.share.dialog` et `C.share.infoDialog`, `C.fiches.ficheDialog`, `C.fiches.importDialog`, `C.tools.reviewDialog`, `C.pdf.atlasDialog`, `C.pdf.reportDialog`.
- Fenêtres génériques : `C.openDialog`, `C.closeDialog`, `C.requestClose`, `C.confirmDialog`, `C.promptDialog`, `C.choiceDialog`.
- Onglets : `C.tabs.<id>` avec `<id>` ∈ `calques`, `terrain`, `chantier`, `export` ; `C.openPanel(id)`, `C.refreshTab(id, …)`.
- Calque dessiné par un fichier à part : il s'inscrit dans `C.specialLayers.<special> = { layers: [...], refresh: fn }` et porte `special: '<special>'` dans le catalogue (`js/layers.js`). Exemple : `js/routes.js`.
- Messages : `U.toast(texte, durée)` ; avec une action, `U.toastAction(texte, libellé, fn, durée)`.
- Contenu venu d'un fichier, d'un tableau ou d'un lien : texte toujours passé par `U.esc` avant d'entrer dans du HTML ; adresse toujours passée par `U.safeUrl` avant d'entrer dans un `href` ; adresse de porte toujours contrôlée par `C.PORTE_RE` avant tout appel.

### Identifiants HTML (`id`)
`camelCase`, **préfixe de l'écran + rôle**. Un préfixe par écran ; les éléments uniques de l'écran principal portent leur nom propre (`map`, `panel`, `nav`, `toast`, `busy`, `scrim`, `pointSheet`, `measureBar`, `drawBar`, `chantierName`, `pylName`…) :

| Préfixe | Écran | | Préfixe | Écran |
|---|---|---|---|---|
| `btn` | boutons de l'écran principal | | `im` | import d'un tableau |
| `tab` | sections des onglets (`tabCalques`…) | | `fd` | dossiers affichés |
| `dlg`, `dlg2` | fenêtres (titre, corps, pied) | | `br` | navigateur Drive |
| `pt` | fiche du point | | `py` | sélecteur de pylône |
| `ms` | barre de mesure | | `sr` | recherche |
| `dr` | barre de tracé | | `of` | hors ligne |
| `ly` | onglet Calques | | `pq` | paquets |
| `ch` | fenêtre « Chantiers » | | `rg` | réglages |
| `ta` | formulaire d'ajout terrain | | `ex` | export de fichier |
| `rv` | relecture des ajouts | | `at` | atlas PDF |
| `fc` | fiche pylône | | `rp` | rapport PDF |
| `pf` | profil en long | | `cf`, `pm` | confirmation, saisie d'un nom |
| `ph` | photo rapide | | `vc` | barre de dictée |
| `dx` | import DXF | | `sh` | liens de consultation |

### Attributs `data-`
| Attribut | Sens |
|---|---|
| `data-act="verbe"` | **Commande** déclenchée par un appui. Cible éventuelle dans `data-id` (identifiant) ou `data-i` (rang dans une liste). Branchée par `U.onAct(conteneur, { verbe: fn })` ou `d.on({…})` dans une fenêtre : un seul écouteur par conteneur. |
| `data-val` | Valeur d'un bouton dans un **groupe à choix** (`.seg`, `.chips`) ; `U.pickOne(groupe, fn)` gère le choix unique, `U.picked(groupe)` le lit. |
| `data-tab` | Onglet visé |
| `data-id` | Identifiant d'un objet (calque, fichier du Drive, élément) |
| `data-i` | Rang d'une ligne dans une liste à choisir |
| `data-field`, `data-type`, `data-value`, `data-extra` | Champ de la fiche pylône : clé, type, valeur composée, colonne importée |
| `data-folder`, `data-doc`, `data-terrain`, `data-vec`, `data-base`, `data-col`, `data-layer` | Cases à cocher : dossier, chantier, ajouts terrain, réseau public, fond, colonne d'un tableau, calque AutoCAD |
| `data-group`, `data-sec`, `data-card`, `data-handle`, `data-opacity`, `data-step`, `data-fill` | Structure : groupe dépliable, section de fiche, carte de calque, poignée, curseur, pas précédent/suivant, compteur |
| `data-close`, `data-close2`, `data-open-settings` | Raccourcis globaux : fermer la fenêtre, ouvrir les réglages |

Pas d'attribut à une lettre.

### Classes CSS
- **Composant** : un nom (`.chip`, `.tile`, `.base`, `.list-item`, `.rows`, `.card`, `.btn`, `.ico-btn`, `.field`, `.check`, `.chips`, `.seg`, `.grp`, `.lyr`, `.fsec`, `.tag`, `.badge`, `.fab`, `.bar`, `.sheet`, `.mic`, `.audios`).
- **Partie d'un composant** : `composant-partie` (`.chip-label`, `.tile-ico`, `.item-title`, `.item-sub`, `.lyr-head`, `.sheet-close`, `.card-actions`, `.bar-value`, `.voice-bar`, `.voice-text`, `.photo-preview`, `.toast-btn`).
- **Variante** : mot accolé (`.btn.primary`, `.btn.danger`, `.btn.ghost`, `.btn.big`, `.ico-btn.sm`, `.tag.ok`, `.seg.tight`, `.sheet.wide`, `.sheet.compact`, `.card.hero`, `.fab.fab-photo`).
- **État** : `.on` (choisi, actif), `.open` (déplié, ouvert), `.is-hidden` (calque masqué), `.dragging`, `.wait`, `.sel` ; sur `body` : `.viewer` (consultation), `.far` (carte vue de loin).
- **Utilitaires** : `.row`, `.grow`, `.push`, `.cols`, `.full`, `.mt`, `.muted`, `.small`, `.empty`, `.sep`.
- Pas de classe à une lettre. Pas de `style="…"` de mise en page dans le JavaScript : seulement des valeurs issues des données (couleur d'une légende, vignette d'une photo, largeur d'une barre de progression).

## 5. Écrans

Le style de base vaut pour le **téléphone debout**. Quatre adaptations, dans cet ordre en fin de `css/app.css` :

| Écran | Condition | Disposition |
|---|---|---|
| Téléphone debout | par défaut | Onglets en bas, panneau et fenêtres montant du bas |
| Tablette debout | largeur 600–899 px | Panneau flottant, fenêtres centrées (640 px, 780 px si `.wide`) |
| Ordinateur, tablette couchée | largeur ≥ 900 px et hauteur ≥ 561 px | Panneau fixe à gauche (380 → 420 px), fenêtres en tiroir à droite (460 → 520 px) ; `.sheet.wide` s'élargit jusqu'à 760–900 px en gardant au moins 340 px de carte |
| Téléphone couché | paysage et hauteur ≤ 560 px | Onglets à gauche, panneau à gauche, fenêtres à droite |

Les formulaires longs utilisent `.cols` : une colonne sur téléphone, deux ou trois dès que la fenêtre est assez large, sans règle par appareil. `U.isDesktop()` reprend la même condition que le bloc « ordinateur ».

## 6. Avant de publier

1. Passer la version dans `C.VERSION` (`js/core.js`) **et** `VERSION` (`sw.js`) ; ajouter tout nouveau fichier à `SHELL_FILES`.
   Si `apps-script/Code.gs` change : augmenter son `VERSION`, laisser `PORTE_URL` vide, ne jamais y écrire de clé ni d'adresse `/exec` (le dépôt est public), et dire dans le README ce qui marche encore avec l'ancienne porte.
2. Vérifier chaque écran en 390 × 844, 844 × 390, 820 × 1180, 1180 × 820 et 1440 × 900.
3. Pour toute nouvelle fonction : un seul point d'entrée, les mots du tableau ci-dessus, trois appuis au plus.
4. Vérifier le mode consultation : la fonction y est-elle utile en lecture seule ? Sinon, la masquer (`C.viewer`).
