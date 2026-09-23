#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  SURFACE DE L'ÉCRAN « APRÈS-MIDI » — ce que l'organisateur obtient réellement
 * ============================================================================
 *  ▶ node tests/ecran-apresmidi-surface.test.js
 *
 *  ⭐ CONTRÔLES DYNAMIQUES, PAS TEXTUELS. Chaque propriété est éprouvée en JOUANT le geste :
 *  vrais modules du frontend, vrais écouteurs, vrai `api.js`, vrai `Code.gs` dans les doublures
 *  du banc de coût. Les requêtes sont comptées au niveau du transport — pas déduites du code.
 *  ⛔ Les deux seuls contrôles textuels de cette suite (A1, A2) ne portent pas sur un
 *    comportement : ils vérifient que le BANC n'a pas dérivé de la page réelle.
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

const RACINE = B.RACINE;
const BACKEND = B.BACKEND;
const SRC = () => fs.readFileSync(path.join(BACKEND, 'Code.gs'), 'utf8');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

/** Un écran prêt à cliquer, sur un serveur neuf. */
async function ecran(opts, srvOpts) {
  const srv = B.serveur(SRC(), srvOpts);
  const nav = B.navigateur(srv, B.lecteur(), opts || {});
  await nav.amorcer();
  return { srv, nav };
}
/** Le même, mais sur le frontend FIGÉ d'avant le lot (contre-épreuve). */
async function ecranAvant(opts, srvOpts) {
  const srv = B.serveur(SRC(), srvOpts);
  const nav = B.navigateur(srv, B.LECTEUR_AVANT, opts || {});
  await nav.amorcer();
  return { srv, nav };
}
/** Prépare un après-midi généré, scoré, puis un matin corrigé : le tableau VA changer. */
async function apresMidiJoueEtMatinCorrige(opts) {
  const e = await ecran(opts);
  await e.nav.clic('bouton-apresmidi', 30);
  const poses = B.scorerToutApresMidi(e.srv);
  ['U10', 'U12', 'U14'].forEach((c) => B.inverserMatin(e.srv, c));
  e.nav.journal.length = 0; e.nav.corps.length = 0; e.nav.dialogues.length = 0;
  return Object.assign(e, { poses: poses });
}

(async function () {

  titre('A — le banc ne dérive pas de la page réelle');
  {
    const admin = lire('js/admin.js');
    const manquantes = B.LIAISONS_ECRAN.filter((l) => admin.indexOf('  ' + l) === -1);
    ok(manquantes.length === 0,
      'A1 ⭐⭐ les ' + B.LIAISONS_ECRAN.length + ' liaisons jouées par le banc sont MOT POUR MOT ' +
      'celles de `brancherEcouteursAdmin`' + (manquantes.length ? ' — absentes : ' + manquantes.join(' | ') : ''));

    /* ⛔ L'inverse aussi : si `admin.js` branchait un DIXIÈME écouteur sur ces deux cartes, le
       banc ne le jouerait pas et un geste passerait sous le radar. */
    const html = lire('admin.html');
    const cartes = B.cartesApresMidi(html);
    const idsCartes = new Set((cartes.match(/id="([a-z0-9-]+)"/g) || [])
      .map((s) => s.slice(4, -1)));
    const liees = new Set(B.LIAISONS_ECRAN.map((l) => l.match(/ecouter\('([^']+)'/)[1]));
    const oubliees = (admin.match(/^  ecouter\('([a-z0-9-]+)'/gm) || [])
      .map((s) => s.match(/'([a-z0-9-]+)'/)[1])
      .filter((id) => idsCartes.has(id) && !liees.has(id));
    ok(oubliees.length === 0,
      'A2 ⭐⭐ aucun écouteur d\'`admin.js` posé sur un élément de ces deux cartes n\'échappe au banc' +
      (oubliees.length ? ' — oubliés : ' + oubliees.join(', ') : ''));
  }

  titre('B — UNE requête par geste (l\'état relu remplace getAll + getConfigAdmin)');
  {
    const { nav } = await ecran();
    await nav.clic('bouton-apresmidi', 30);
    ok(JSON.stringify(nav.requetes()) === JSON.stringify(['genererApresMidi']),
      'B1 ⭐⭐ « Générer l\'après-midi » émet EXACTEMENT une requête — observé : ' +
      JSON.stringify(nav.requetes()));
    ok(nav.sorties.length === 1,
      'B2 ⭐ une seule sortie réseau, toutes portes confondues (fetch, XHR, beacon, WebSocket) — ' +
      nav.sorties.length);
    ok(String(nav.texte('message-apresmidi')).indexOf('18 match(s)') !== -1,
      'B3 le bilan annonce les matchs réellement générés');
  }
  {
    /* ⛔ CONTRE-ÉPREUVE SUR LA RÉFÉRENCE FIGÉE : le frontend d'AVANT émettait bien trois requêtes.
       Sans elle, « une requête » ne prouverait pas qu'on a retiré quoi que ce soit. */
    const { nav } = await ecranAvant();
    await nav.clic('bouton-apresmidi', 30);
    const r = nav.requetes();
    ok(r.length === 3 && r[0] === 'genererApresMidi' && r.indexOf('getAll') !== -1 &&
       r.indexOf('getConfigAdmin') !== -1,
      'B4 ⭐⭐ contre-épreuve — le frontend figé ' + B.FRONTEND_AVANT_REV.slice(0, 12) +
      ' émettait TROIS requêtes : ' + JSON.stringify(r));
  }

  titre('C — une opération à la fois, fenêtre de confirmation comprise');
  {
    const { srv, nav } = await ecran();
    nav.clicSansAttendre('bouton-apresmidi');
    nav.clicSansAttendre('bouton-apresmidi');
    await nav.tour(40);
    ok(nav.dialogues.length === 1,
      'C1 ⭐⭐ un double clic n\'ouvre QU\'UNE fenêtre de confirmation — ' + nav.dialogues.length);
    ok(nav.requetes().length === 1,
      'C2 ⭐⭐ un double clic n\'émet QU\'UNE génération — ' + JSON.stringify(nav.requetes()));
    ok(srv.aprem().length === 18,
      'C3 le classeur ne porte qu\'UN après-midi — ' + srv.aprem().length + ' matchs');
  }
  {
    const { nav } = await ecranAvant();
    nav.clicSansAttendre('bouton-apresmidi');
    nav.clicSansAttendre('bouton-apresmidi');
    await nav.tour(40);
    ok(nav.dialogues.length === 2,
      'C4 ⭐⭐ contre-épreuve — le frontend figé ouvrait DEUX fenêtres : ' + nav.dialogues.length);
  }
  {
    /* ⭐ Les trois boutons voisins se ferment PENDANT l'écriture (même onglet Matchs). */
    const { nav } = await ecran({ pannes: { genererApresMidi: 'silence' } });
    nav.clicSansAttendre('bouton-apresmidi');
    await nav.tour(6);
    const fermes = ['bouton-generer', 'bouton-recalculer-horaires', 'bouton-modifier-poules',
      'bouton-simuler-scores-matin', 'bouton-simuler-scores-apresmidi', 'bouton-dimanche-scf']
      .filter((id) => nav.el(id) && nav.el(id).disabled);
    ok(fermes.length === 6,
      'C5 ⭐⭐ pendant la génération, les SIX autres commandes du planning sont fermées — ' +
      fermes.length + '/6 (' + fermes.join(', ') + ')');
  }

  titre('D — le délai borne l\'attente du navigateur, et l\'écran ne ment pas');
  {
    const { srv, nav } = await ecran({ pannes: { genererApresMidi: 'silence' } });
    nav.clicSansAttendre('bouton-apresmidi');
    for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 20));
    const msg = nav.texte('message-apresmidi');
    ok(msg.indexOf('Résultat INCONNU') !== -1,
      'D1 ⭐⭐ serveur MUET : l\'attente se termine et le résultat est annoncé INCONNU — « ' +
      msg.slice(0, 60) + ' »');
    ok(msg.indexOf('délai') !== -1,
      'D2 la cause est nommée (délai dépassé), pas maquillée en échec');
    ok(nav.el('bouton-apresmidi').textContent === "Générer l'après-midi" &&
       !nav.el('bouton-apresmidi').disabled,
      'D3 ⭐ le bouton retrouve son libellé et se rouvre — il ne reste pas figé sur « Génération… »');
    ok(nav.requetes().length === 1,
      'D4 ⛔ AUCUN renvoi automatique après un délai dépassé — ' + nav.requetes().length + ' requête(s)');
    ok(srv.aprem().length === 0,
      'D5 témoin : dans ce scénario le serveur n\'a effectivement rien écrit');
  }
  {
    const { nav } = await ecranAvant({ pannes: { genererApresMidi: 'silence' } });
    nav.clicSansAttendre('bouton-apresmidi');
    for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 20));
    ok(nav.el('bouton-apresmidi').textContent === 'Génération…',
      'D6 ⭐⭐ contre-épreuve — le frontend figé restait figé sur « Génération… » indéfiniment');
  }

  titre('E — réponse PERDUE : jamais annoncer à tort que rien n\'a été écrit');
  {
    const { srv, nav } = await ecran({ pannes: { genererApresMidi: 'perdue' } });
    await nav.clic('bouton-apresmidi', 40);
    const msg = nav.texte('message-apresmidi');
    ok(srv.aprem().length === 18,
      'E1 prémisse : le serveur A ÉCRIT (18 matchs) — seule la réponse s\'est perdue');
    ok(msg.indexOf('Résultat INCONNU') !== -1 && msg.indexOf('peut-être') !== -1,
      'E2 ⭐⭐ l\'écran dit que le résultat est INCONNU et que l\'écriture a PEUT-ÊTRE eu lieu — « ' +
      msg.slice(0, 60) + ' »');
    ok(msg.indexOf('⚠️') !== 0,
      'E3 ⛔ ce n\'est PAS présenté comme une erreur certaine (pas de « ⚠️ » d\'échec en tête)');
    ok(nav.requetes().length === 1,
      'E4 ⛔ aucun rejeu automatique : la génération n\'est pas idempotente côté identifiants');
  }
  {
    const { nav } = await ecranAvant({ pannes: { genererApresMidi: 'perdue' } });
    await nav.clic('bouton-apresmidi', 40);
    const msg = nav.texte('message-apresmidi');
    ok(msg.indexOf('Résultat INCONNU') === -1 && msg.indexOf('⚠️') === 0,
      'E5 ⭐⭐ contre-épreuve — le frontend figé annonçait un ÉCHEC pur et simple : « ' +
      msg.slice(0, 50) + ' »');
  }

  titre('F — la perte de scores est arbitrée par le SERVEUR, jamais déduite de l\'écran');
  {
    const { srv, nav } = await apresMidiJoueEtMatinCorrige({ dialogues: [true, true] });
    const avant = srv.empreinteAprem();
    await nav.clic('bouton-apresmidi', 40);
    ok(nav.requetes().length === 2,
      'F1 ⭐ deux requêtes : le refus du serveur, PUIS la demande confirmée — ' +
      JSON.stringify(nav.requetes()));
    const q = nav.dialogues[1] ? nav.dialogues[1].message : '';
    ok(q.indexOf('vont perdre leur score') !== -1,
      'F2 ⭐⭐ l\'organisateur est averti AVANT toute écriture');
    ok(/U1[024] N\d — \S+ \d+–\d+ \S+/.test(q),
      'F3 ⭐⭐ les matchs menacés sont NOMMÉS avec leur score — ⛔ jamais un simple compte');
    const d = nav.demandes()[1] || {};
    ok(d.scores_aprem_confirmes === 'oui' && d.scores_aprem_vus === '6',
      'F4 ⭐⭐ la confirmation reporte le compte ANNONCÉ PAR LE SERVEUR (6), ⛔ pas un compte du ' +
      'navigateur — observé : ' + JSON.stringify({ c: d.scores_aprem_confirmes, v: d.scores_aprem_vus }));
    ok(String(nav.texte('message-apresmidi')).indexOf('12 score(s) déjà saisi(s) conservé(s)') !== -1,
      'F5 ⭐⭐ le bilan dit ce qui a été CONSERVÉ (12 scores sur 18), pas seulement ce qui a été généré');
    ok(srv.empreinteAprem() !== avant,
      'F6 témoin : après confirmation, l\'après-midi a bien été régénéré');
  }
  {
    /* ⛔ L'ORGANISATEUR REFUSE : rien n'est écrit, et le message le dit. */
    const e = await apresMidiJoueEtMatinCorrige();
    const avant = e.srv.empreinteAprem();
    e.nav.ctx.dialogConfirmer = async function (m) {
      e.nav.dialogues.push({ message: String(m) });
      return e.nav.dialogues.length === 1;          // oui à la génération, NON à la perte
    };
    vm.runInContext('dialogConfirmer = this.dialogConfirmer;', e.nav.ctx);
    await e.nav.clic('bouton-apresmidi', 40);
    ok(e.nav.requetes().length === 1,
      'F7 ⭐⭐ refus de la perte ⇒ AUCUNE seconde requête — ' + JSON.stringify(e.nav.requetes()));
    ok(e.srv.empreinteAprem() === avant,
      'F8 ⭐⭐ refus de la perte ⇒ le classeur est RIGOUREUSEMENT inchangé');
    ok(String(e.nav.texte('message-apresmidi')).indexOf('les scores sont intacts') !== -1,
      'F9 le message le dit sans ambiguïté — « ' + e.nav.texte('message-apresmidi') + ' »');
  }
  {
    /* ⛔ CONTRE-ÉPREUVE : le frontend figé détruisait ces scores SANS RIEN DEMANDER. */
    const srv = B.serveur(fs.readFileSync(path.join(BACKEND, 'Code.gs'), 'utf8'));
    const nav = B.navigateur(srv, B.LECTEUR_AVANT, {});
    await nav.amorcer();
    await nav.clic('bouton-apresmidi', 30);
    B.scorerToutApresMidi(srv);
    ['U10', 'U12', 'U14'].forEach((c) => B.inverserMatin(srv, c));
    nav.dialogues.length = 0;
    await nav.clic('bouton-apresmidi', 40);
    const scores = srv.aprem().filter((m) => String(m.score_A) !== '').length;
    ok(nav.dialogues.length === 1 &&
       nav.dialogues[0].message.indexOf('perdre leur score') === -1,
      'F10 ⭐⭐ contre-épreuve — le frontend figé ne posait AUCUNE question sur la perte');
    /* ⭐ ET POURTANT RIEN N'EST DÉTRUIT — c'est le SERVEUR qui tient. Un frontend d'avant
       n'envoie aucune confirmation ; le serveur refuse donc l'écriture en bloc, et les DIX-HUIT
       scores survivent. ⛔ C'est l'écart de compatibilité assumé du lot : un appelant ancien perd
       la faculté de détruire en silence, jamais celle de générer un après-midi. */
    ok(scores === 18,
      'F11 ⭐⭐ … et le backend corrigé refuse l\'écriture : les DIX-HUIT scores survivent ' +
      '(le frontend figé en effaçait 6) — observé ' + scores);
    ok(nav.texte('message-apresmidi').indexOf('déjà un score') !== -1,
      'F12 ⭐ le frontend figé, lui, affiche le refus du serveur tel quel — il ne le masque pas');
  }

  titre('G — un second clic identique est gratuit, et l\'écran l\'avoue');
  {
    const { srv, nav } = await ecran();
    await nav.clic('bouton-apresmidi', 30);
    const avant = srv.empreinteAprem();
    nav.journal.length = 0;
    await nav.clic('bouton-apresmidi', 30);
    ok(nav.requetes().length === 1,
      'G1 le second clic émet bien une requête (l\'écran ne peut pas savoir seul)');
    ok(String(nav.texte('message-apresmidi')).indexOf('rien n’a été réécrit') !== -1,
      'G2 ⭐⭐ le bilan dit que RIEN n\'a été réécrit — ⛔ jamais « 18 matchs générés », qui ' +
      'laisserait croire à une écriture : « ' + nav.texte('message-apresmidi') + ' »');
    ok(srv.empreinteAprem() === avant,
      'G3 ⭐⭐ le classeur est inchangé, cellule pour cellule');
  }

  titre('H — le matin est conservé, quoi qu\'il arrive');
  {
    const { srv, nav } = await ecran();
    const avant = srv.empreinteMatin();
    await nav.clic('bouton-apresmidi', 30);
    ok(srv.empreinteMatin() === avant,
      'H1 ⭐⭐ après génération, les 34 matchs du matin sont IDENTIQUES, scores compris');
    B.scorerToutApresMidi(srv);
    ['U10', 'U12', 'U14'].forEach((c) => B.inverserMatin(srv, c));
    const avant2 = srv.empreinteMatin();
    nav.ctx.dialogConfirmer = async () => true;
    vm.runInContext('dialogConfirmer = this.dialogConfirmer;', nav.ctx);
    await nav.clic('bouton-apresmidi', 40);
    ok(srv.empreinteMatin() === avant2,
      'H2 ⭐⭐ après une RÉGÉNÉRATION confirmée, le matin est encore identique');
  }

  titre('I — garde-fou serveur : matin incomplet');
  {
    const { srv, nav } = await ecran({}, { matinIncomplet: true });
    ok(nav.el('bouton-apresmidi').disabled === true,
      'I1 l\'écran désactive le bouton à l\'avance — le garde-fou n\'est pas une surprise');
    /* L'action reste refusée si elle arrive quand même (autre appareil, onglet ancien). */
    const r = srv.postMesure({ action: 'genererApresMidi', cle: B.CLE_ADMIN }).reponse;
    ok(r.error && r.error.indexOf('ne sont pas encore terminés') !== -1,
      'I2 ⭐ le serveur refuse, avec son message historique — « ' + String(r.error).slice(0, 55) + ' »');
    ok(srv.aprem().length === 0,
      'I3 ⛔ un refus n\'écrit rien');
  }

  console.log('\n==================================================');
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + '/' + n + ' contrôle(s) :');
    echecs.forEach((e) => console.log('  ✗ ' + e));
    process.exit(1);
  }
  console.log('OK — ' + n + '/' + n + ' contrôles de la surface de l’écran « Après-midi ».');
})().catch((e) => { console.error('ERREUR — ' + e.stack); process.exit(1); });
