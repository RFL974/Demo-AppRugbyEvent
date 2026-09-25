# Design QA — Demande municipale

## Références comparées

- Maquette validée : `exec-d2a47d9d-2ceb-4b45-aefc-30c445e656d8.png`
- Implémentation : `admin.html`, écran `Demande municipale`, étape 2, volet `Ajouter un espace` ouvert
- Comparaison desktop : 1487 × 1058 CSS px, densité 1
- Contrôle mobile : 390 × 844 CSS px, écran principal puis volet ouvert
- Captures de contrôle : `/tmp/design-qa-implementation.png`, `/tmp/design-qa-mobile.png`, `/tmp/design-qa-mobile-drawer.png`
- Doctrine produit Notion : ne réutiliser que les données connues, ne rien inventer, et ne jamais transformer la procédure d’une commune en modèle national.
- Échantillon officiel : Lyon, Paris, Nantes (espace public et ERP), Rennes, Toulouse, Angers, Grenoble, Sartrouville, Argentré-du-Plessis et Le Plessis-Robinson.

## Résultat

Statut : **VALIDÉ**

### P0 — bloquant

Aucun.

### P1 — majeur

Aucun.

### P2 — visible

Aucun après correction. Le volet a été ramené à 440 px, complété avec l’interlocuteur, les usages détaillés et le dépôt de document optionnel. Les champs restent lisibles et le pied d’action reste accessible sur desktop comme sur mobile.

### P3 — mineur / intentionnel

- La maquette de référence illustre trois espaces et des besoins déjà saisis ; l’état réel contrôlé contient le seul espace de démonstration enregistré dans le serveur local. Il s’agit d’une différence de données, pas de structure.
- L’implémentation ajoute le sélecteur de bibliothèque d’espaces demandé pour accélérer les éditions suivantes.
- Le profil récurrent (commune, service, canal, interlocuteur, identité légale et assurance) est enregistré séparément du dossier d’édition et survit à la réinitialisation, comme la bibliothèque d’espaces.
- Les volets variables sont présentés comme « à inclure ou à vérifier », jamais comme des obligations universelles.
- Les formats de pièce acceptés sont volontairement limités à PDF, JPG et PNG pour garantir l’assemblage local du dossier final.

## Contrôles effectués

- Hiérarchie, largeur du volet, densité et alignements comparés côte à côte avec la maquette.
- Navigation clavier : dialogue modal, fermeture Échap, boucle de focus et restitution du focus.
- Adaptation mobile sans débordement horizontal ; volet plein écran avec actions fixes.
- Console navigateur : aucune erreur ni alerte.
- Persistance : ajout puis enregistrement d’un espace, rechargement, état restauré.
- Performance : aucun appel réseau lors de la saisie locale, des accordéons, des pièces et de la génération PDF ; un seul appel explicite à l’enregistrement.
- Résilience : aucune relance automatique d’une écriture incertaine et protection par révision contre l’écrasement concurrent.
- Données : validation serveur de la version, des formes JSON, des volumes, des listes d’espaces et de besoins ; profil permanent séparé des données d’édition.
- Exhaustivité : destinataire, canal et échéance locale, identité de l’organisateur, multi-jours, montage/démontage, besoins quantifiés et index des annexes.

## Compromis

Le corps du volet défile sur les petits écrans pendant que les actions restent visibles. Cela préserve la taille des champs et les cibles tactiles sans compresser le formulaire.
