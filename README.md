# Démo AppRugbyEvent

Démonstration publique d'**AppRugbyEvent**, une application d'organisation de tournoi de rugby
pour écoles de rugby.

**Adresse du site :** <https://rfl974.github.io/Demo-AppRugbyEvent/>

Ce dépôt contient le **frontend** de la démonstration : des pages web (HTML / CSS / JavaScript),
**pensées pour le mobile d'abord**, sans framework ni étape de construction. Elles dialoguent avec
un backend Google Apps Script adossé à un classeur Google Sheets **dédié à la démonstration** :
les données affichées ici sont des données d'exemple.

## À quoi sert cette démonstration

Montrer, en conditions réelles, le déroulé complet d'un tournoi : inviter les clubs, recueillir
leurs réponses, composer les poules et le planning, saisir les scores le jour J, et laisser
familles et éducateurs suivre la journée en direct depuis leur téléphone.

## Les pages

### La page publique du tournoi — `tournoi.html`

Le cœur de la démonstration, et la seule page destinée au grand public. Deux onglets,
**Mon équipe** et **Classements**, un filtre par catégorie et un podium quand il est
mathématiquement certain. Elle se rafraîchit toute seule pendant la journée. Aucune clé n'est
demandée : on ouvre l'adresse, on choisit son équipe, on suit ses matchs.

`index.html` redirige la racine du site vers cette page : ouvrir
<https://rfl974.github.io/Demo-AppRugbyEvent/> mène donc directement à `tournoi.html`.

### L'administration — `admin.html`

L'écran de l'organisateur : réglages du tournoi, catégories et terrains, équipes, génération des
poules et du planning, partenaires, publication. La direction **Ciel & Verre** utilise une barre
latérale par groupes sur ordinateur et le même parcours via le bouton Menu sur mobile. **Protégée par une clé
administrateur.**

### La saisie des scores — `saisie.html` (page fermée) et la saisie protégée

`saisie.html` n'est plus la table de marque : c'est une **page fermée d'information**, sans script
ni donnée. La vraie saisie (filtres par catégorie et par terrain, accordéons par match, saisie
rapide) est servie par une petite passerelle Apps Script séparée, derrière un **lien et un QR code propres à
chaque tournoi**, que l'organisateur prépare, ouvre, met en pause, renouvelle ou clôture depuis
l'administration (carte « Publier le tournoi »). Cette page protégée réutilise les styles et les
scripts de ce dépôt (`js/saisie.js`, `js/saisie-protegee.js`) et demande ensuite la **clé scores**,
distincte de la clé administrateur et jamais présente dans le lien.

### Les invitations et les dossiers clubs

Trois pages qui accompagnent les clubs invités, de l'invitation au jour J :

- **`invitation-club.html`** — le carton d'invitation envoyé aux clubs avant leur réponse :
  affiche, descriptif, frise horaire de la journée et une fiche par catégorie (forme de jeu,
  temps de jeu, pauses, effectifs, arbitrage, repères fédéraux). Exportable en PDF via
  l'impression du navigateur.
- **`reponse-invitation.html`** — le formulaire de réponse du club : présent ou absent, équipes
  engagées par catégorie, joueurs et éducateurs, avec des totaux qui se mettent à jour en direct.
- **`dossier-club.html`** — le dossier remis au club après son acceptation : la journée en un
  coup d'œil, ses équipes et leurs poules, son planning, les infos pratiques, l'accès, les
  contacts et la sécurité. C'est une **page vivante** : le club garde son lien et la page se
  reconstruit à chaque ouverture avec les données du moment.

Ces trois pages s'ouvrent depuis un lien personnel contenant un jeton propre au club.

### `perfs.html`

Une page interne de suivi, en lecture seule, qui n'est liée depuis aucune autre page.

## Clés et secrets

**Aucune clé n'est stockée dans ce dépôt.** La clé administrateur et la clé scores sont demandées
à l'écran au moment où l'on en a besoin, gardées le temps de l'onglet seulement, et ne sont jamais
écrites dans les fichiers publiés. La page publique du tournoi, elle, n'en demande aucune.

## Organisation des fichiers

| Dossier | Contenu |
|---|---|
| `css/` | Tokens Ciel & Verre partagés, composants, navigation responsive, page publique, partenaires et impression |
| `js/` | Une logique par page, plus les briques communes : `config.js` (adresse du backend), `api.js` (appels), `commun.js` et `commun-dossier.js` (fonctions partagées) |
| `js/vendor/` | Bibliothèques tierces embarquées |
| `assets/`, `img/` | Logos et icônes |
| `modeles/` | Modèle de document PDF |

`js/config.js` est le **seul** endroit où figure l'adresse du backend : la changer suffit à
rediriger toutes les pages.

## Voir les pages en local

Sur `localhost`, `127.0.0.1`, `[::1]` ou `file:`, les pages ne contactent plus le backend distant.
Elles attendent une API de test `/__api` sur la même origine. Un simple serveur statique permet
de voir les fichiers, mais ne fournit pas de données ni de sauvegardes.

Pour la revue de la refonte du 20 septembre 2026, l'atelier isolé se lance avec :

```bash
node "/Users/romainrifleu/Documents/Codex/2026-09-20/tu-dois-r-aliser-la-refonte/work/serveur.cjs"
```

puis ouvrir `http://127.0.0.1:8137/atelier`. Les clés affichées sont fictives ; les données restent
en mémoire. Les emails, Drive et les appels réseau Google sont bloqués. Le dossier `livrables`
voisin du serveur contient le bilan Git, les contrats, les captures et les limites de vérification.

La refonte ne demande aucune compilation, dépendance npm, migration backend ou modification des services distants.
