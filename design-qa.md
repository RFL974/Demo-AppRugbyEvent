# Design QA — Invitation initiale

## Références comparées

- Maquette validée : `exec-135004aa-9581-4de0-9c23-fbb5f20b2773.png`
- Implémentation : `admin.html`, écran `Inviter un club`, onglet `Invitation initiale`
- Comparaison desktop : aperçu réel dans une fenêtre de 1440 × 1000 CSS px
- Contrôle mobile : 390 × 844 CSS px
- Affiche de démonstration de la maquette : `affiche-tournoi-des-petits-champions-2027.png`

## Résultat

Statut : **VALIDÉ**

### P0 — bloquant

Aucun.

### P1 — majeur

Aucun.

### P2 — visible

Aucun après correction. Les quatre cartes de paramètres restent groupées en grille, puis la préparation de l’email occupe toute la largeur disponible sous ces cartes. Le dépôt des pièces jointes suit immédiatement la phrase d’introduction et précède l’aperçu réel. Le rendu horizontal est lisible sur ordinateur et se transforme en cartes empilées sans débordement sur mobile.

### P3 — mineur / intentionnel

- L’affiche fournie est affichée dans l’aperçu local. Son enregistrement Drive reste indisponible dans l’environnement local ; l’envoi réel continue donc d’utiliser uniquement une affiche persistée et ne simule aucune pièce jointe enregistrée.
- Les quatre blocs pratiques n’affichent que les informations effectivement configurées. Aucun service ou contact de remplacement n’est inventé.
- Le bandeau reprend l’identité MaxiLou, les données du tournoi et la navigation visuelle validée ; les liens restent adaptés aux capacités réelles de l’email.
- La typographie reste volontairement fondée sur Arial/Helvetica pour conserver un rendu fiable dans les principaux clients de messagerie.
- Le libellé visible est `Rappel sécurité`, sans mention FFR. Le texte de prévention existant sur la sécurité des enfants est conservé mot pour mot.

## Contrôles effectués

- Position : quatre cartes de paramètres, puis objet, phrase d’introduction, dépôt des pièces jointes et aperçu réel dans le même onglet.
- Fidélité des données : tournoi, date, lieu, catégories, organisation sportive, modalités, contacts et services proviennent uniquement de la configuration existante.
- Hiérarchie : bandeau de marque, invitation avec affiche, comparaison repliable des catégories, rappel sécurité, informations pratiques et appel à l’action unique.
- Icônes : pictogrammes locaux distincts et cohérents, sans police ni ressource tierce.
- Responsive : aucune largeur excédentaire à 390 px ; la comparaison desktop est masquée au profit des cartes mobiles.
- Alignement : numéros de téléphone non coupés, courriel maintenu sur une ligne et valeurs de contact alignées sous leurs libellés.
- Libellé : `Équipes par catégories` est identique dans le tableau desktop et les cartes mobiles.
- Réseau : la saisie et le repeint de l’aperçu restent locaux, sans rechargement de l’iframe ni appel réseau par frappe.
- Accessibilité : titres structurés, tableau avec en-têtes, contrôle natif repliable, lien d’action explicite et alternative vide sur les icônes décoratives.
- Console navigateur : aucune erreur ni alerte.

## Compromis

Pour trois catégories ou moins, l’email embarque une comparaison horizontale et une variante mobile empilée sélectionnée par media query. Cette duplication de présentation conserve exactement les mêmes valeurs et liens ; elle évite le défilement horizontal dans les clients mobiles étroits.

## Design QA — Votre réponse

### Références comparées

- Direction fournie : `/Users/romainrifleu/Desktop/Capture d’écran 2026-09-25 à 17.59.58.png`
- Implémentation : `reponse-invitation.html`, parcours public sécurisé du club
- Comparaison desktop : page réelle servie par `127.0.0.1:8137`, fenêtre de 1390 × 932 CSS px
- Contrôle mobile : 390 × 844 CSS px
- Données contrôlées : réponse de démonstration de CLAMART, U10 et U12, deux équipes, 26 joueurs, quatre éducateurs, 22 repas et 320 €

### Résultat

Statut : **VALIDÉ**

#### P0 — bloquant

Aucun.

#### P1 — majeur

Aucun.

#### P2 — visible

Aucun après correction. L’écran reprend le bandeau bleu, la même famille typographique, les pictogrammes locaux et les cartes Ciel & Verre de l’invitation. Sur ordinateur, la saisie occupe la colonne principale et le récapitulatif reste visible à droite. Les champs nominatifs occupent désormais toute leur colonne, avec leurs libellés au-dessus. Sur mobile, les blocs se rangent sur une seule colonne sans débordement et les champs `Prénom` / `Nom` restent lisibles côte à côte.

#### P3 — mineur / intentionnel

- L’affiche est utilisée comme rappel compact, et non comme second contenu principal : le club reste immédiatement concentré sur sa réponse.
- Le visuel local de démonstration n’est appliqué qu’au nom exact du `Tournoi des petits champions`. Pour tout autre tournoi, seule une affiche réellement enregistrée peut être affichée.
- Le formulaire conserve toutes ses informations existantes : catégories, équipes, joueurs, éducateurs nominatifs, transport, repas, goûters et total. Aucun champ métier n’a été retiré pour obtenir la nouvelle composition.
- Le texte du transport et du parking est conservé parce qu’il appartient déjà au formulaire réel ; cette refonte n’ajoute aucune promesse pratique nouvelle.
- Le rappel de sécurité conserve le seuil réellement configuré mais ne mentionne ni affiliation ni exigence FFR.

### Contrôles effectués

- Parcours : participation, équipes, repas et récapitulatif disposent d’un repère d’étape visible et d’un `aria-current` mis à jour.
- Données : montants et quantités sont recalculés à partir des champs existants ; l’exemple réel affiche 100 € d’inscription, 220 € de repas et 320 € au total.
- Écriture : `Vérifier ma réponse` n’enregistre rien ; la requête n’est possible qu’au second clic sur `Valider la confirmation`.
- Continuité : navigation `Invitation / Votre réponse / Votre dossier`, affiche, couleurs, rayons, ombres légères et pictogrammes locaux cohérents avec l’invitation.
- Responsive : largeur du document égale à la fenêtre à 390 px et 1390 px ; aucune image manquante et aucun débordement horizontal.
- Accessibilité : titres structurés, progression nommée, contrôles natifs, zones d’erreur annoncées, focus visible et cibles principales d’au moins 44 px.
- Formulaires : chaque champ `Prénom` et `Nom` mesure environ 291 × 42 CSS px sur ordinateur et environ 130 × 42 CSS px à 390 px ; aucun ne reprend la largeur de 64 px réservée aux quantités numériques.
- Repli : Participation, Équipes, chaque catégorie engagée, Informations pratiques et Repas disposent d’un bouton de 44 × 44 CSS px avec `aria-expanded`, `aria-controls` et un libellé dynamique `Replier` / `Déplier`.
- Continuité de saisie : une valeur fictive saisie dans `Prénom`, puis repliée et dépliée, est restée intacte ; l’action n’appelle aucune écriture réseau.
- Console navigateur : aucune erreur ni alerte.
- Validation fonctionnelle : le récapitulatif de confirmation a été atteint avec des noms d’éducateurs et un mode de déplacement fictifs, sans cliquer sur l’écriture finale.

### Historique des corrections

1. Remplacement de l’ancien formulaire vertical uniforme par une composition desktop en deux colonnes.
2. Ajout du bandeau de parcours, du rappel de l’affiche et de la progression en quatre étapes.
3. Réemploi des icônes locales de l’invitation et suppression des pictogrammes textuels disparates.
4. Intégration de tous les champs réels, puis adaptation mobile et contrôle des débordements.
5. Conservation du récapitulatif de confirmation et du garde contre l’écriture au premier clic.
6. Correction P2 des champs nominatifs : l’ancienne règle générique des quantités les réduisait visuellement à 64 px. Une règle spécifique place maintenant le libellé au-dessus d’un champ pleine largeur ; le contrôle après correction confirme quatre lignes identiques sur ordinateur et une grille deux colonnes sans débordement à 390 px.
7. Ajout des replis demandés : chaque grande section et chaque catégorie peuvent être fermées indépendamment. Le contrôle post-correction montre U10 et U12 repliées tandis que le récapitulatif, les totaux et les Informations pratiques restent visibles ; à 390 px, les chevrons conservent une cible tactile de 44 px et la largeur du document reste égale à la fenêtre.

## Design QA — Dossier final publié

### Références comparées

- Maquette exacte validée : `/Users/romainrifleu/.codex/visualizations/2026/09/25/01a0d8eb-568d-7f72-8e8a-148f27d35bd8/apercu-plans-terrains.html`
- Implémentation : `dossier-club.html`, `js/dossier.js`, `js/terrains-dossier.js` et `css/dossier.css`
- Contrôle desktop : page réelle et composants de production, données locales du Tournoi des petits champions, navigateur intégré à 1280 px
- Contrôle mobile : mêmes composants à 390 × 844 CSS px
- Données contrôlées : CLAMART, U10 et U12, deux équipes, 22 repas, total 320 €, paiement en attente, planning publié et quatre grands terrains configurés

### Résultat

Statut : **VALIDÉ**

#### P0 — bloquant

Aucun.

#### P1 — majeur

Aucun.

#### P2 — visible

Aucun après correction. L’implantation globale reprend les positions, rotations et proportions physiques enregistrées. Chaque empreinte ouvre dans la page le grand terrain correspondant avec ses mini-terrains, sans dialogue détaché ni table de marque. Le retour à la vue globale conserve le contexte de lecture.

#### P3 — mineur / intentionnel

- Le dossier public reste inaccessible avec un jeton fictif : le contrôle visuel local a utilisé un banc de rendu temporaire alimentant les composants de production avec les données de démonstration déjà présentes dans l’administration. Aucun contournement de l’authentification n’a été conservé.
- Un grand terrain sans mini-terrain validé reste visible dans la vue d’implantation avec la mention `Disponible`, puisque ce terrain appartient bien au plan enregistré.
- Le PDF développe automatiquement chaque grand terrain ; l’écran conserve une vue interactive afin d’éviter un document démesurément long.

### Contrôles effectués

- Fidélité : bandeau, affiche, typographie, couleurs, cartes, espacements et hiérarchie reprennent la maquette acceptée.
- Ordre : informations pratiques, inscription et options, journée, équipes, planning, plans des terrains, puis rappel sportif.
- Options : seules les commandes réellement enregistrées sont affichées ; dans le cas contrôlé, 22 repas et aucun goûter.
- Modalités : date limite et mode de paiement sont regroupés dans la carte de commande ; la carte redondante de bas de page est supprimée et les trois cartes restantes se répartissent à largeur égale.
- Paiement : statut dérivé de `paiement_statut`, avec `Paiement en attente`, `Paiement reçu` et la date éventuelle, ou `Aucun paiement attendu` si le total est nul.
- Planning : les matchs du matin sont regroupés par catégorie et limités aux équipes du club.
- Terrains : quatre grands terrains visibles, y compris celui sans mini-terrain ; clic, retour et navigation clavier fonctionnels.
- Proportions : le plan coté de Rugby 1 conserve 115 × 70 m ; Rugby 2 conserve 110 × 68 m ; les mini-terrains gardent leurs dimensions et positions.
- Confidentialité : aucune table de marque (`TM`) n’apparaît à l’écran ni dans la projection PDF du dossier club.
- Responsive : `innerWidth`, `scrollWidth` et `bodyScrollWidth` valent tous 390 px ; aucun débordement horizontal.
- Console navigateur : aucune erreur ni alerte sur le rendu desktop, l’ouverture d’un terrain, le retour global et le contrôle mobile.
- Accessibilité : titres structurés, terrains exposés comme boutons nommés, activation Entrée/Espace, focus restauré au retour, textes et dimensions lisibles.

### Historique des corrections

1. Réorganisation du dossier selon la maquette exacte, avec les informations pratiques avant la journée.
2. Ajout du récapitulatif dynamique des équipes, options commandées, total et statut de paiement.
3. Ajout du planning du matin lorsque le tournoi est publié.
4. Remplacement de l’ancien schéma générique par une implantation globale fidèle aux coordonnées enregistrées.
5. Ajout des plans détaillés cotés, aux proportions physiques exactes, ouverts au clic.
6. Suppression complète de la table de marque de la vue club et du PDF club.
7. Ajustement desktop, impression et mobile à 390 px, puis contrôle réel sans erreur console.

final result: passed
