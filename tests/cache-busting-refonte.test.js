#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  GARDE-FOU — CACHE-BUSTING DE LA REFONTE « CIEL & VERRE » DU 20/09/2026
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/cache-busting-refonte.test.js
 *
 *  ⚠️ POURQUOI. Les pages sont servies en statique par GitHub Pages : un navigateur qui a
 *  déjà visité le site garde ses CSS et ses JS en cache. Si l'adresse d'un fichier modifié
 *  ne change pas, l'organisateur voit l'ancienne page — parfois un HTML neuf avec un script
 *  périmé, ce qui casse plus franchement qu'un simple retard d'affichage.
 *
 *  ⭐ LE CONTRAT DE CETTE LIVRAISON. Les fichiers ci-dessous sont ceux que la branche
 *  `refonte/ciel-et-verre` modifie ou ajoute par rapport à `origin/main` (recensement
 *  `git diff --name-only origin/main...refonte/ciel-et-verre -- 'css/*' 'js/*'`). Chacun doit
 *  être appelé avec UNE seule version, explicite et identique partout.
 *
 *  ⚠️ UNE JUSTIFICATION FAUSSE A ÉTÉ CORRIGÉE ICI (lot « Pages publiques du tournoi », 24/09/2026).
 *  Ce bandeau affirmait que `js/api.js` n'avait pas bougé et n'avait donc pas besoin d'adresse
 *  neuve. 🔬 C'ÉTAIT FAUX, et vérifiable en une commande :
 *      git diff --stat origin/main...refonte/ciel-et-verre -- js/api.js   →  47 ajouts, 10 retraits
 *  Deux commits l'avaient modifié — `e1a7f06` puis `7cabce4` (lot « Saisie des scores ») — alors
 *  qu'il restait servi SANS version. Le test PASSAIT quand même, parce qu'il ne regardait que les
 *  fichiers de sa propre liste : il ne mentait pas sur ce qu'il vérifiait, il mentait sur ce qu'il
 *  affirmait ne pas avoir besoin de vérifier. ⛔ Le pire garde-fou est celui qui rassure à tort.
 *  ⭐ La section 5 ci-dessous ferme le défaut à la racine, pour les PAGES PUBLIQUES : chaque
 *  ressource qu'elles chargent voit son CONTENU ÉPINGLÉ à son ADRESSE. Modifier le fichier sans
 *  changer l'URL fait désormais échouer ce test.
 *
 *  ⛔ HORS PORTÉE, ET C'EST VOULU :
 *    · `js/vendor/…` : bibliothèques tierces, jamais modifiées, jamais reversionnées ;
 *    · `js/api.js` et `js/commun-dossier.js` restent servis SANS version à l'administration, à la
 *      saisie et aux pages club. ⚠️ C'est une DETTE CONNUE, consignée par le lot « Pages publiques » :
 *      la fermer impose de toucher `admin.html` (et donc la « Feuille de journée », exclue du lot).
 *      Les pages PUBLIQUES, elles, sont couvertes en section 5 ;
 *    · `backend/gateway-acces-scores/SaisieProtegee.html` est FIGÉ (empreinte vérifiée octet
 *      pour octet, contrôle S.3) : la page protégée charge donc `css/styles.css`, `js/commun.js`,
 *      `js/dialog.js`, `js/api.js`, `js/saisie.js` et `js/saisie-protegee.js` SANS version.
 *      C'est une limite connue, pas un oubli — la lever impose un redéploiement Apps Script.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function vrai(valeur, message) { assert.ok(valeur, message); controles++; }

const VERSION = 'refonte-ciel-verre-20260920';
const VERSIONS_PROPRES = {
  'css/styles.css': 'refonte-ciel-verre-20260920-terrain-orientation1',
  'css/dossier.css': 'refonte-ciel-verre-20260925-dossier-final4',
  'css/theme-r92.css': 'refonte-ciel-verre-20260926-r101-responsive1',
  'js/admin-autorisation.js': 'refonte-ciel-verre-20260925-terrains-pdf1',
  'js/admin-dps.js': 'refonte-ciel-verre-20260925-pdf-identite1',
  'js/pdf-ciel-verre.js': 'refonte-ciel-verre-20260925-pdf-identite1',
  'js/admin-terrains.js': 'refonte-ciel-verre-20260925-terrain-orientation1',
  'js/admin-terrains-pdf.js': 'refonte-ciel-verre-20260925-terrain-orientation1',
  'js/admin-invitations.js': 'refonte-ciel-verre-20260926-demo-dataset21',
  'js/admin-conformite-ffr.js': 'refonte-ciel-verre-20260926-perf-ffr01',
  'js/admin-generation.js': 'refonte-ciel-verre-20260926-texte1',
  'js/admin-suivi-clubs.js': VERSION + '-participants2',
  'js/admin.js': VERSION + '-participants3-municipal1',
  'js/assistant.js': VERSION + '-participants3-municipal1',
  'js/ecrans.js': VERSION + '-participants3-municipal1-invitation-ordinateur2-organiser1',
  'css/municipal.css': VERSION + '-municipal2',
  'js/admin-municipal.js': 'refonte-ciel-verre-20260925-pdf-identite1',
  'js/reponse.js': VERSION + '-participants2-reponse1',
  'js/dossier.js': 'refonte-ciel-verre-20260925-dossier-final5',
  'js/terrains-dossier.js': 'refonte-ciel-verre-20260925-terrain-orientation1'
};

/** Le recensement des fichiers livrés par la refonte. */
const LIVRES = [
  'css/dossier.css', 'css/ecrans.css', 'css/municipal.css', 'css/saisie.css', 'css/sponsors.css', 'css/styles.css',
  'css/theme-r92.css', 'css/tokens.css', 'css/tournoi-public.css',
  'js/admin-autorisation.js', 'js/admin-choix-categories.js', 'js/admin-conformite-ffr.js', 'js/admin-dps.js', 'js/admin-municipal.js', 'js/pdf-ciel-verre.js',
  'js/admin-equipes.js', 'js/admin-generation.js', 'js/admin-infos-publication.js',
  'js/admin-reglages.js', 'js/admin-suivi-clubs.js', 'js/admin-tableau-bord.js',
  'js/admin-terrains.js', 'js/admin-terrains-pdf.js', 'js/admin.js', 'js/assistant.js', 'js/commun.js', 'js/config.js', 'js/dialog.js',
  'js/dossier.js', 'js/ecrans.js', 'js/invitation.js', 'js/perfs.js', 'js/reponse.js', 'js/terrains-dossier.js',
  'js/saisie-protegee.js', 'js/saisie.js', 'js/tournoi.js',
];

/**
 * Les fichiers qu'aucune page HTML de ce dépôt n'appelle :
 *  · `css/tokens.css` est tiré par `@import` (contrôlé en 3) ;
 *  · `css/saisie.css` est posé par `js/saisie.js` (contrôlé en 3) ;
 *  · `js/saisie.js` et `js/saisie-protegee.js` ne sont chargés que par la passerelle FIGÉE.
 */
const SANS_APPEL_HTML = ['css/saisie.css', 'css/tokens.css', 'js/saisie.js', 'js/saisie-protegee.js'];

vrai(LIVRES.every(f => fs.existsSync(path.join(racine, f))),
  'chaque fichier recensé existe encore dans le dépôt');

/* ---- 1) Toute référence HTML à un fichier livré porte la version de la livraison ---- */

const pages = fs.readdirSync(racine).filter(f => f.endsWith('.html'));
vrai(pages.length > 0, 'des pages HTML sont bien présentes à la racine');

const MOTIF = /(?:href|src)="((?:css|js)\/[^"?]+\.(?:css|js))((?:\?[^"]*)?)"/g;
const vues = new Set();
const fautives = [];
pages.forEach(page => {
  const html = lire(page);
  let m;
  while ((m = MOTIF.exec(html)) !== null) {
    const [, chemin, requete] = m;
    if (LIVRES.indexOf(chemin) === -1) continue;
    vues.add(chemin);
    const versionAttendue = VERSIONS_PROPRES[chemin] || VERSION;
    if (requete !== '?v=' + versionAttendue) fautives.push(page + ' → ' + chemin + (requete || ' (sans version)'));
  }
});
vrai(fautives.length === 0,
  '⛔ toute référence HTML à un fichier livré porte la version globale ou son suffixe propre déclaré — fautives : ' +
  fautives.join(', '));

vrai(LIVRES.filter(f => !vues.has(f) && SANS_APPEL_HTML.indexOf(f) === -1).length === 0,
  '⛔ tout fichier livré appelé depuis le HTML a bien été vu — manquants : ' +
  LIVRES.filter(f => !vues.has(f) && SANS_APPEL_HTML.indexOf(f) === -1).join(', '));

/* ---- 2) Aucune version périmée ne subsiste sur un fichier livré ---- */

const ANCIENNES = ['coherence-clubs-20260920', 'tarifs-mobile-demo-20260920', 'mail-initial-20260920',
  'sync-tarifs-demo-20260920', 'scores-croises-20260920', 'navigation-libre-demo-1', 'partenaires-simple'];
const restes = [];
pages.forEach(page => {
  const html = lire(page);
  let m;
  const motif = new RegExp(MOTIF.source, 'g');
  while ((m = motif.exec(html)) !== null) {
    if (LIVRES.indexOf(m[1]) === -1) continue;
    ANCIENNES.forEach(v => { if (m[2].includes(v)) restes.push(page + ' → ' + m[1] + ' (' + v + ')'); });
  }
});
vrai(restes.length === 0,
  '⛔ aucune ancienne version ne colle à un fichier livré — restes : ' + restes.join(', '));

/* ---- 3) Les deux chargements qui ne passent pas par une balise HTML ---- */

['css/styles.css', 'css/dossier.css', 'css/tournoi-public.css'].forEach(feuille => {
  vrai(lire(feuille).includes('@import url("tokens.css?v=' + VERSION + '");'),
    feuille + ' importe `tokens.css` avec la version de la livraison');
});

const sourceSaisie = lire('js/saisie.js');
vrai(/replace\(\/styles\\\.css\/, 'saisie\.css'\)/.test(sourceSaisie),
  '⭐ `js/saisie.js` ne remplace QUE le nom du fichier : la version de la feuille de base suit ' +
  'jusqu’à `saisie.css` (l’ancien motif `/styles\\.css.*$/` avalait le `?v=…`)');

/* ---- 4) Les bibliothèques tierces ne sont pas reversionnées pour rien ---- */

const vendorVersionne = [];
pages.forEach(page => {
  const motif = /(?:href|src)="(js\/vendor\/[^"]+)"/g;
  let m;
  while ((m = motif.exec(lire(page))) !== null) if (m[1].includes('?')) vendorVersionne.push(page + ' → ' + m[1]);
});
vrai(vendorVersionne.length === 0,
  '⛔ les bibliothèques `js/vendor/` restent telles quelles : ' + vendorVersionne.join(', '));

/* ---- 5) PAGES PUBLIQUES : le CONTENU de chaque ressource est ÉPINGLÉ à son ADRESSE ----
 *
 * ⭐ L'INVARIANT, en une phrase : un fichier dont les octets changent doit changer d'URL.
 * Les sections 1 à 4 vérifient la FORME des adresses (une version, la bonne, partout). Elles ne
 * peuvent RIEN dire du contenu — c'est exactement ce qui a laissé passer `js/api.js`.
 * ⛔ Ici, chaque ressource chargée par une page PUBLIQUE est épinglée : adresse ET empreinte.
 * Toucher au fichier sans toucher à l'adresse fait échouer ce contrôle, et le message dit quoi faire.
 *
 * ⚠️ CE QUE CE TABLEAU N'EST PAS : une liste de versions à incrémenter par réflexe. Une ressource
 * INCHANGÉE garde son adresse — reversionner pour rien viderait des caches encore valides, ce que
 * la doctrine du dépôt refuse depuis l'origine. C'est pourquoi `js/sponsors.js` y figure SANS
 * version : ce lot ne l'a pas touché, et son empreinte le prouve.
 */
const PUBLIQUES = ['index.html', 'tournoi.html', 'perfs.html'];

/** [chemin, requête attendue, SHA-256 du contenu servi à cette adresse]. */
const EPINGLES = [
  ['css/sponsors.css', '?v=refonte-ciel-verre-20260920',
    'f68723568bbd8145e9d9c2a28c88a2306cbdabfb46eba54d6e116ba1dd375545'],
  ['css/styles.css', '?v=refonte-ciel-verre-20260920-terrain-orientation1',
    '582991130ac28417eadd42a9558758a91a23ff694aa763089a7be8b2c15b320f'],
  ['css/tokens.css', '?v=refonte-ciel-verre-20260920',
    '59609c6375098bc54a7fe6d8fd706f5e2e9150b91b52461944203fe43ffa13dc'],
  ['css/tournoi-public.css', '?v=refonte-ciel-verre-20260920',
    'cdcaaa5e96cc5f9d8943661d185d9642df26bebef62d5fb6ed30684d6a839b73'],
  /* ⭐ L'ADRESSE PROPRE À LA RESSOURCE : le suffixe `-api2` produit une URL DISTINCTE sans toucher
     à la version GLOBALE de la livraison, qui doit rester `refonte-ciel-verre-20260920`. */
  ['js/api.js', '?v=refonte-ciel-verre-20260920-api2',
    '04761ab8ee8bd9c3d8aba1db029a1b45f31a062b34a33a124213919a273be0d7'],
  ['js/commun.js', '?v=refonte-ciel-verre-20260920',
    'a269fc151823318b7a1f78f81e3b13502d0a39460bec27c7e503282f3673274d'],
  ['js/config.js', '?v=refonte-ciel-verre-20260920',
    '26c341bc20571a7e28632e7b64214a3feae0d7a8c1c2a10e31a54dab35d20ee6'],
  ['js/dialog.js', '?v=refonte-ciel-verre-20260920',
    'de2d2634f89bb710a7feaa56f95f6afa515a8b7eba2845cf2916932b757c9115'],
  ['js/perfs.js', '?v=refonte-ciel-verre-20260920',
    'ed24f59aa298d6d236a490f1388e46f58e73f5281d1b6b12c5820f8b1e5dc18f'],
  /* ⛔ SANS VERSION, ET C'EST JUSTE : `js/sponsors.js` n'a été modifié ni par la refonte, ni par ce
     lot. Son empreinte est là pour qu'un changement futur ne puisse plus passer inaperçu. */
  ['js/sponsors.js', '',
    '18c8f8af4bed1f5c9ae3104a92f75298adcf05d21d8d1a69c0e1ebf2e1ba82cf'],
  ['js/tournoi.js', '?v=refonte-ciel-verre-20260920',
    '1a77083cbb34fa9ba3be81ce9b120959e335cdd13b2f768a20a60a27cd0bbe9f']
];

const crypto = require('node:crypto');
const sha256 = (rel) => crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(racine, rel))).digest('hex');

/** Les ressources RÉELLEMENT chargées par les pages publiques (balises + @import). */
function ressourcesPubliques() {
  const trouve = new Map();
  const ajouter = (chemin, requete) => {
    if (!trouve.has(chemin)) trouve.set(chemin, new Set());
    trouve.get(chemin).add(requete || '');
  };
  PUBLIQUES.forEach((page) => {
    const html = lire(page);
    const motif = new RegExp(MOTIF.source, 'g');
    let m;
    while ((m = motif.exec(html)) !== null) ajouter(m[1], m[2]);
  });
  // Les feuilles tirées par `@import`, qu'aucune balise ne nomme.
  Array.from(trouve.keys()).filter((f) => f.endsWith('.css')).forEach((f) => {
    const motif = /@import url\("([^"?]+)(\?[^"]*)?"\)/g;
    let m;
    while ((m = motif.exec(lire(f))) !== null) ajouter('css/' + m[1], m[2] || '');
  });
  return trouve;
}

const reelles = ressourcesPubliques();
const epingles = new Map(EPINGLES.map((e) => [e[0], e]));

vrai(EPINGLES.length === reelles.size,
  '⛔ le tableau d’épingles décrit EXACTEMENT les ressources des pages publiques — épinglées : ' +
  EPINGLES.length + ', chargées : ' + reelles.size + ' — écart : ' +
  JSON.stringify(Array.from(reelles.keys()).filter((f) => !epingles.has(f))
    .concat(EPINGLES.map((e) => e[0]).filter((f) => !reelles.has(f)))));

const desaccords = [];
reelles.forEach((requetes, chemin) => {
  const e = epingles.get(chemin);
  if (!e) { desaccords.push(chemin + ' : non épinglé'); return; }
  const vues = Array.from(requetes);
  if (vues.length !== 1 || vues[0] !== e[1]) {
    desaccords.push(chemin + ' : adresse ' + JSON.stringify(vues) + ' ≠ ' + JSON.stringify(e[1]));
  }
  const reel = sha256(chemin);
  if (reel !== e[2]) {
    desaccords.push(chemin + ' : CONTENU CHANGÉ (' + reel.slice(0, 12) + '… ≠ ' + e[2].slice(0, 12) +
      '…) — donne-lui une adresse neuve, puis épingle la nouvelle empreinte');
  }
});
vrai(desaccords.length === 0,
  '⭐⭐ chaque ressource des pages publiques est servie à SON adresse épinglée, avec SON contenu épinglé — ' +
  'désaccords : ' + desaccords.join(' | '));

/* Le suffixe propre à une ressource ne doit jamais devenir une version GLOBALE de rechange. */
vrai(EPINGLES.every((e) => e[1] === '' || e[1] === '?v=' + VERSION || e[1].indexOf('?v=' + VERSION + '-') === 0),
  '⛔ toute adresse épinglée est soit nue, soit la version de la livraison, soit un SUFFIXE de ' +
  'celle-ci — ⛔ jamais une version concurrente');

console.log('OK — ' + controles + '/' + controles + ' contrôles de cache-busting passés.');
