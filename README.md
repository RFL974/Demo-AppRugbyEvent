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
de voir les fichiers, mais ne fournit ni données ni sauvegardes.

Depuis la racine de ce dépôt, **si Python 3 est déjà disponible sur la machine** :

```bash
python3 -m http.server 8137
```

⚠️ En alternative, `npx` rend le même service, mais **télécharge le paquet `http-server`** s'il
n'est pas déjà dans le cache npm — ce n'est donc pas une option « sans installation » :

```bash
npx --yes http-server -p 8137
```

puis ouvrir <http://127.0.0.1:8137/tournoi.html> (ou `admin.html`). Ces deux serveurs ne répondent
pas sur `/__api` : la mise en page, la navigation et les styles se revoient, mais les listes
restent vides et rien ne s'enregistre. C'est voulu — une revue visuelle ne doit pas pouvoir écrire
dans un classeur réel.

Une revue **avec des données** demande un atelier qui sert ce dépôt *et* répond sur `/__api` avec
des données en mémoire. Cet atelier ne fait pas partie du dépôt et n'est pas fourni ici : aucun
chemin de machine n'est donc documenté.

Les tests, eux, ne demandent ni serveur ni navigateur ni dépendance :

```bash
node --test tests/*.test.js
```

## Publier la refonte « Ciel & Verre »

### Le frontend ne demande aucune migration

La refonte ne touche que des fichiers statiques (HTML, CSS, JS). Elle ne demande **ni compilation,
ni dépendance npm, ni migration de données, ni modification des services Google** : publier le
dépôt suffit. `js/config.js` garde l'adresse de backend qu'il avait déjà.

Une vérification appuie cette phrase plutôt que de l'affirmer : la refonte n'ajoute et ne retire
**aucune action backend**. Les 28 actions appelées par `js/` sont exactement celles de `main`
(relevé des appels `apiGet` / `apiPost` / `apiPostProtege` sur les deux branches).

⚠️ **Exception depuis le lot « Inviter un club » (21 septembre 2026, local, non publié).** Le bouton du jeu de
démonstration a quitté l'écran « Équipes » pour l'onglet « Clubs invités » et appelle désormais
`creerJeuDemoRacing` au lieu de `chargerClubsDemoRacing` (une action remplacée, aucune autre). Le backend doit
donc être publié **avant** ce frontend : sinon le bouton répond « le serveur n'a pas encore la version… » et ne
crée rien. À l'inverse, un ancien frontend resté en cache reçoit du nouveau backend un refus qui indique le
nouveau bouton, sans rien écrire.
Depuis le 4ᵉ passage du même lot, les gestes de la liste des clubs (ajouter, modifier, retirer un club, ajouter ses équipes,
envoi groupé) demandent au serveur la liste relue dans leur réponse (`renvoyer_etat`) au lieu de la relire ensuite. Un
backend d'avant ignore la demande et répond comme avant : le frontend relit alors la liste, comme avant. L'ordre de
publication ci-dessus ne change pas.
Depuis le 5ᵉ passage, chaque envoi d'e-mail de l'écran (invitation, relance, envoi groupé, dossier final, relance de paiement,
confirmation) porte l'identifiant du geste (`id_envoi`) et, après une issue incertaine ou un refus « déjà parti » confirmé, `confirmer_renvoi` :
le nouveau backend n'envoie plus aucun e-mail sous son verrou et ne double jamais un envoi. Un backend d'avant ignore ces champs et envoie
comme avant ; un frontend d'avant garde les protections du serveur (un second envoi trop proche est refusé et le message le dit).
Le lot « Suivi des clubs » (22 septembre 2026, local, non publié) ne touche que le frontend : aucune action backend ajoutée ni modifiée,
il fonctionne avec le backend d'avant comme avec le nouveau. La lecture de la liste des clubs est bornée (30 s par tentative, une seule
relance) ; « Suivi des clubs » dit « Chargement… » ou l'échec (avec « Réessayer ») au lieu d'un faux « aucun club ». Depuis le Suivi, la
**première** invitation d'un club jamais invité envoie exactement la même demande que depuis « Inviter un club » (`relance: 'non'`) : le
serveur ne note plus de « dernière relance » à cette date-là ; une vraie relance garde `relance: 'oui'` et son comportement. Un cache mêlant
anciens et nouveaux fichiers reste correct, simplement sans ces protections.

Le seul point d'attention à la publication est le **cache du navigateur**. Chaque CSS et chaque JS
modifié par cette livraison est appelé avec une version unique, `?v=refonte-ciel-verre-20260920`,
pour qu'un visiteur déjà venu ne garde pas un ancien fichier. `tests/cache-busting-refonte.test.js`
recense ces fichiers et refuse toute référence non versionnée ou restée sur une version antérieure.

⚠️ **Une page échappe à ce versionnement** : la saisie protégée est servie par la passerelle Apps
Script, dont le modèle `SaisieProtegee.html` est figé (son empreinte est vérifiée octet pour octet).
Elle charge `css/styles.css`, `js/commun.js`, `js/dialog.js`, `js/api.js`, `js/saisie.js` et
`js/saisie-protegee.js` **sans version**. Lever cette limite imposerait un redéploiement Apps
Script : ce n'est pas fait ici. À la table de marque, prévoir un rafraîchissement forcé.

### Le backend, lui, a changé séparément aujourd'hui

⛔ **Ne pas lire « le frontend n'a rien à migrer » comme « il n'y a rien à faire côté Google ».**
Le backend Apps Script vit dans un **autre dépôt** (`../backend`, miroir local privé) et a reçu
le 20 septembre 2026 des changements qui lui sont propres, sans rapport avec la refonte visuelle.

Ce qui est constaté, et rien de plus :

- le `Code.gs` et le `Test.gs` du miroir **ne correspondent plus** aux empreintes du socle déployé
  (Version 2 du 8 septembre 2026) ; le miroir en tient le compte dans deux manifestes distincts ;
- trois actions appelées par ce frontend — `getAccesScoresAdmin`, `getMatchsLitige` et
  `getSaisieScores`, qui font vivre la saisie protégée des scores — **n'existent pas** dans le
  socle déployé, seulement dans l'état local ;
- cette dépendance **précède la refonte** : elle est déjà présente sur `main`.

### Le verdict, en trois phrases

- ⭐ **La refonte frontend est techniquement prête à être publiée** : rien à compiler, rien à
  migrer, rien à changer côté Google pour qu'elle s'affiche.
- ⛔ **L'application complète n'est pas prête pour un déploiement fonctionnel de bout en bout**
  tant que le backend Apps Script n'a pas été mis à jour chez Google.
- ⚠️ **Publier le frontend seul n'est donc pas un déploiement complet sans risque** dès lors que
  la **table de marque protégée** est attendue : `getAccesScoresAdmin`, `getMatchsLitige` et
  `getSaisieScores` manquent au backend **actuellement déployé**, et la saisie des scores ne
  répondra pas.

Ce déploiement backend est une **opération Google séparée et explicite**, qui n'a pas été faite
ici et qui ne relève pas de ce dépôt. Voir `../backend/README.md`.

⚠️ Si la journée de démonstration prévoit la saisie protégée des scores, **ordonner les deux
opérations** : mettre à jour le backend d'abord, publier le frontend ensuite. Publier le frontend
seul ne casse pas ce qui marche aujourd'hui, mais ne fait pas apparaître ce qui manque.
