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
 *  ⭐ LE CONTRAT DE CETTE LIVRAISON. Les 30 fichiers ci-dessous sont ceux que la branche
 *  `refonte/ciel-et-verre` modifie ou ajoute par rapport à `origin/main` (recensement
 *  `git diff --name-only origin/main...refonte/ciel-et-verre -- 'css/*' 'js/*'`). Chacun doit
 *  être appelé avec UNE seule version, explicite et identique partout.
 *
 *  ⛔ HORS PORTÉE, ET C'EST VOULU :
 *    · les fichiers NON modifiés (`js/api.js`, `js/sponsors.js`, `js/vendor/…`…) gardent leur
 *      adresse : leur contenu n'a pas bougé, les reversionner ne ferait que vider des caches
 *      encore valides ;
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

/** Le recensement des fichiers livrés par la refonte. */
const LIVRES = [
  'css/dossier.css', 'css/ecrans.css', 'css/saisie.css', 'css/sponsors.css', 'css/styles.css',
  'css/theme-r92.css', 'css/tokens.css', 'css/tournoi-public.css',
  'js/admin-autorisation.js', 'js/admin-choix-categories.js', 'js/admin-conformite-ffr.js',
  'js/admin-equipes.js', 'js/admin-generation.js', 'js/admin-infos-publication.js',
  'js/admin-reglages.js', 'js/admin-suivi-clubs.js', 'js/admin-tableau-bord.js',
  'js/admin-terrains.js', 'js/admin.js', 'js/commun.js', 'js/config.js', 'js/dialog.js',
  'js/dossier.js', 'js/ecrans.js', 'js/invitation.js', 'js/perfs.js', 'js/reponse.js',
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
    if (requete !== '?v=' + VERSION) fautives.push(page + ' → ' + chemin + (requete || ' (sans version)'));
  }
});
vrai(fautives.length === 0,
  '⛔ toute référence HTML à un fichier livré porte « ?v=' + VERSION + '  » — fautives : ' +
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

console.log('OK — ' + controles + '/' + controles + ' contrôles de cache-busting passés.');
