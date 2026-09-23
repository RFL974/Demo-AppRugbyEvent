#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ZÉRO APPEL — l'écran « Après-midi » ne lit RIEN qu'il possède déjà
 * ============================================================================
 *  ▶ node tests/ecran-apresmidi-zero-appel.test.js
 *
 *  ⭐ CE QUE CETTE SUITE PROUVE, ET COMMENT. L'écran « Après-midi » n'a AUCUNE ressource propre :
 *  tout ce qu'il affiche — l'avancement des scores du matin, le tableau, les formats par
 *  catégorie — vit déjà dans `matchsCourants` et `configCourante`, que la page a chargés à son
 *  ouverture. Un écran qui n'a rien à lire doit donc n'émettre RIEN tant qu'on ne lui demande pas
 *  d'écrire. C'est une propriété RÉSEAU : elle est mesurée au transport, sur de VRAIS écouteurs,
 *  ⛔ jamais déduite de la lecture du code.
 *
 *  ⭐ TOUTES LES PORTES DE SORTIE SONT COMPTÉES, pas seulement `fetch` : XMLHttpRequest,
 *  sendBeacon, WebSocket, EventSource, window.open. Un écran qui « ne ferait pas de fetch » mais
 *  poserait une image de traçage passerait ce contrôle à tort si l'on n'en comptait qu'une.
 *
 *  ⭐ UN TÉMOIN clôt la suite : un geste dont on SAIT qu'il émet doit émettre. Sans lui, un banc
 *  dont le transport serait cassé afficherait « zéro appel » partout, et aurait l'air vert.
 *
 *  ⛔ Aucun réseau, aucun service Google réel, aucune donnée réelle : tournoi fictif.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('./banc-ecran-apresmidi');

let n = 0;
const echecs = [];
function ok(v, m) {
  n++;
  if (!v) echecs.push(n + ' — ' + m);
  console.log('  ' + (v ? '✓' : '✗') + ' ' + n + ' ' + m);
}
function titre(t) { console.log('\n-- ' + t + ' --'); }

const SRC = () => fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');
const lire = (f) => fs.readFileSync(path.join(B.RACINE, f), 'utf8');

async function ecran(opts, srvOpts) {
  const srv = B.serveur(SRC(), srvOpts);
  const nav = B.navigateur(srv, B.lecteur(), opts || {});
  await nav.amorcer();
  return { srv, nav };
}
/** Remet les compteurs à zéro : ce qui précède n'est pas le geste mesuré. */
function remettre(nav) { nav.journal.length = 0; nav.corps.length = 0; nav.sorties.length = 0; }
/** Le bilan d'un geste : requêtes métier et sorties réseau de TOUTE nature. */
function bilan(nav) { return { req: nav.journal.slice(), sorties: nav.sorties.length }; }

(async function () {

  titre('A — l\'inventaire des commandes de l\'écran est COMPLET');
  {
    const { nav } = await ecran();
    const boutons = vm.runInContext(
      "Array.from(document.querySelectorAll('button')).map(b => b.id)", nav.ctx);
    /* ⭐ Chaque bouton des deux cartes est rangé dans EXACTEMENT une des deux colonnes. Un bouton
       nouveau, non rangé, fait tomber ce contrôle : la suite ne peut pas passer à côté de lui. */
    const ECRITURES = ['bouton-generer', 'bouton-recalculer-horaires', 'bouton-simuler-scores-matin',
      'bouton-modifier-poules', 'bouton-apresmidi', 'bouton-simuler-scores-apresmidi',
      'bouton-dimanche-scf'];
    const LOCAUX = [];
    const ranges = new Set(ECRITURES.concat(LOCAUX));
    const inconnus = boutons.filter((id) => id && !ranges.has(id));
    ok(inconnus.length === 0,
      'A1 ⭐⭐ les ' + boutons.length + ' commandes des deux cartes sont toutes inventoriées' +
      (inconnus.length ? ' — non rangées : ' + inconnus.join(', ') : ''));
    ok(boutons.filter(Boolean).length === ECRITURES.length + LOCAUX.length,
      'A2 ⭐ l\'inventaire n\'a pas de ligne morte : ' + boutons.filter(Boolean).length +
      ' boutons pour ' + (ECRITURES.length + LOCAUX.length) + ' entrées');
  }

  titre('B — l\'écran ne déclare AUCUNE ressource : l\'ouvrir ne lit rien');
  {
    const { nav } = await ecran();
    const etapes = vm.runInContext('Object.keys(ADMIN_ETAPES)', nav.ctx);
    ok(etapes.indexOf('apresmidi') === -1,
      'B1 ⭐⭐ `ADMIN_ETAPES` ne porte pas d\'entrée « apresmidi » — l\'écran n\'a rien à lire : ' +
      JSON.stringify(etapes));
    remettre(nav);
    await vm.runInContext("ouvrirEtapeAdmin('apresmidi')", nav.ctx);
    await nav.tour(20);
    let b = bilan(nav);
    ok(b.req.length === 0 && b.sorties === 0,
      'B2 ⭐⭐ OUVRIR l\'écran n\'émet RIEN — ' + JSON.stringify(b));
    remettre(nav);
    await vm.runInContext("ouvrirEtapeAdmin('apresmidi')", nav.ctx);
    await nav.tour(20);
    b = bilan(nav);
    ok(b.req.length === 0 && b.sorties === 0,
      'B3 ⭐⭐ Y REVENIR n\'émet rien non plus — ' + JSON.stringify(b));
  }

  titre('C — les états de l\'écran se calculent SANS rien demander');
  {
    const { nav } = await ecran();
    remettre(nav);
    /* Les trois calculateurs de l'écran, appelés directement : ils ne lisent que la mémoire. */
    vm.runInContext('majApresMidi(); majDimancheScf(); majBoutonsScoresDemo();', nav.ctx);
    vm.runInContext('majDisponibilitePoules();', nav.ctx);
    await nav.tour(20);
    const b = bilan(nav);
    ok(b.req.length === 0 && b.sorties === 0,
      'C1 ⭐⭐ `majApresMidi`, `majDimancheScf`, `majBoutonsScoresDemo` et ' +
      '`majDisponibilitePoules` n\'émettent RIEN — ' + JSON.stringify(b));
    ok(nav.texte('etat-scores-matin').indexOf('Tous les scores du matin sont saisis') !== -1,
      'C2 … et pourtant le bandeau est juste : « ' + nav.texte('etat-scores-matin') + ' »');
  }
  {
    /* ⭐ Le bandeau dit la VÉRITÉ dans les trois états, sans jamais relire. */
    const { nav } = await ecran({}, { matinIncomplet: true });
    remettre(nav);
    vm.runInContext('majApresMidi();', nav.ctx);
    await nav.tour(10);
    ok(bilan(nav).sorties === 0 && nav.texte('etat-scores-matin').indexOf('reste à saisir') !== -1,
      'C3 ⭐ matin incomplet : « ' + nav.texte('etat-scores-matin') +' » — et zéro sortie réseau');
    ok(nav.el('bouton-apresmidi').disabled === true,
      'C4 ⭐ et le bouton est fermé À L\'AVANCE, sans consulter le serveur');
  }
  {
    const { nav } = await ecran();
    vm.runInContext('matchsCourants = [];', nav.ctx);
    remettre(nav);
    vm.runInContext('majApresMidi();', nav.ctx);
    await nav.tour(10);
    ok(bilan(nav).sorties === 0 &&
       nav.texte('etat-scores-matin').indexOf('pas encore généré') !== -1,
      'C5 ⭐ planning absent : « ' + nav.texte('etat-scores-matin') + ' » — zéro sortie réseau');
  }

  titre('D — une confirmation ANNULÉE ne coûte pas une requête');
  {
    const { nav } = await ecran();
    nav.ctx.dialogConfirmer = async () => false;
    vm.runInContext('dialogConfirmer = this.dialogConfirmer;', nav.ctx);
    remettre(nav);
    await nav.clic('bouton-apresmidi', 20);
    const b = bilan(nav);
    ok(b.req.length === 0 && b.sorties === 0,
      'D1 ⭐⭐ « Générer l\'après-midi » annulé ⇒ RIEN n\'est émis — ' + JSON.stringify(b));
    remettre(nav);
    await nav.clic('bouton-dimanche-scf', 20);
    const b2 = bilan(nav);
    ok(b2.req.length === 0 && b2.sorties === 0,
      'D2 ⭐ « Générer le dimanche » annulé ⇒ RIEN n\'est émis — ' + JSON.stringify(b2));
  }
  {
    /* ⭐ La SECONDE confirmation (la perte) annulée : la première requête a bien eu lieu — c'est
       elle qui a révélé la perte — mais AUCUNE seconde n'est émise. */
    const { srv, nav } = await ecran();
    await nav.clic('bouton-apresmidi', 30);
    B.scorerToutApresMidi(srv);
    ['U10', 'U12', 'U14'].forEach((c) => B.inverserMatin(srv, c));
    let appels = 0;
    nav.ctx.dialogConfirmer = async () => { appels++; return appels === 1; };
    vm.runInContext('dialogConfirmer = this.dialogConfirmer;', nav.ctx);
    remettre(nav);
    await nav.clic('bouton-apresmidi', 40);
    const b = bilan(nav);
    ok(b.req.length === 1 && b.sorties === 1,
      'D3 ⭐⭐ perte refusée ⇒ UNE requête (celle qui a constaté la perte), pas deux — ' +
      JSON.stringify(b));
  }

  titre('E — aucune minuterie de fond, aucune sortie différée');
  {
    const { nav } = await ecran();
    await nav.clic('bouton-apresmidi', 30);
    remettre(nav);
    /* ⭐ LES MINUTERIES SONT LAISSÉES COURIR — longuement, en temps RÉEL. Un écran qui poserait
       un rafraîchissement périodique (ou une relecture différée après écriture) se trahirait ici.
       ⛔ Un `tour()` synchrone ne suffirait pas : il ne fait pas avancer l'horloge. */
    for (let i = 0; i < 60; i++) await new Promise((r) => setTimeout(r, 20));
    const b = bilan(nav);
    ok(b.req.length === 0 && b.sorties === 0,
      'E1 ⭐⭐ APRÈS une génération réussie, plus rien n\'est émis en fond — ' + JSON.stringify(b));
  }

  titre('F — témoin : le transport du banc fonctionne bel et bien');
  {
    const { nav } = await ecran();
    remettre(nav);
    await nav.clic('bouton-apresmidi', 30);
    const b = bilan(nav);
    ok(b.req.length === 1 && b.sorties === 1,
      'F1 ⭐⭐ TÉMOIN — un geste dont on sait qu\'il émet émet bien : ' + JSON.stringify(b) +
      '. Sans ce contrôle, un transport cassé rendrait toute cette suite verte à tort.');
    /* ⛔ Et le témoin vaut aussi pour les portes EXOTIQUES : si le banc ne les comptait pas, un
       « zéro sortie » ne voudrait rien dire. On en déclenche une à la main. */
    const avant = nav.sorties.length;
    vm.runInContext('navigator.sendBeacon("http://127.0.0.1/temoin");', nav.ctx);
    ok(nav.sorties.length === avant + 1,
      'F2 ⭐⭐ TÉMOIN — une sortie par `sendBeacon` EST comptée : le compteur n\'est pas aveugle');
  }

  titre('G — le fichier de l\'écran ne réintroduit aucune relecture');
  {
    /* ⛔ Le SEUL contrôle textuel de la suite, et il ne remplace aucun contrôle dynamique :
       il interdit que `rechargerEtRendre` revienne dans les deux gestes de l'écran, y compris
       dans un chemin d'erreur qu'aucun scénario n'atteindrait. */
    const src = lire('js/admin-generation.js');
    const debut = src.indexOf('function genererPhaseClassement(');
    const fin = src.indexOf('\nfunction afficherArbitrages(');
    ok(debut !== -1 && fin > debut,
      'G1 la fonction commune des deux générations est bien là où on la cherche');
    const bloc = src.slice(debut, fin);
    ok(bloc.indexOf('rechargerEtRendre') === -1,
      'G2 ⭐⭐ ⛔ aucun appel à `rechargerEtRendre` dans les deux générations — ' +
      'il valait DEUX requêtes de plus par geste');
    ok(bloc.indexOf('rafraichirPoulesDepuis') !== -1,
      'G3 ⭐ l\'état relu de la réponse est bien ce qui le remplace');
    ok((bloc.match(/ecrireAdmin\(/g) || []).length === 1,
      'G4 ⭐ UN SEUL point d\'émission dans les deux gestes — ' +
      (bloc.match(/ecrireAdmin\(/g) || []).length);
    ok(bloc.indexOf('DELAI_ECRITURE_POULES_MS') !== -1,
      'G5 ⭐ et il est borné par le délai de l\'écran');
  }

  console.log('\n==================================================');
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + '/' + n + ' contrôle(s) :');
    echecs.forEach((e) => console.log('  ✗ ' + e));
    process.exit(1);
  }
  console.log('OK — ' + n + '/' + n + ' contrôles « zéro appel » de l’écran « Après-midi ».');
})().catch((e) => { console.error('ERREUR — ' + e.stack); process.exit(1); });
