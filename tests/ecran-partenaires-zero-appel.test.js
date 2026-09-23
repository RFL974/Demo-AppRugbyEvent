#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « PARTENAIRES » — UN GESTE LOCAL = ZÉRO APPEL (lot « Partenaires »)
 * ============================================================================
 *  ▶ node tests/ecran-partenaires-zero-appel.test.js
 *
 *  Vrais modules (api.js compris) et vraies cartes d'admin.html, contre le vrai Code.gs
 *  (banc-ecran-partenaires.js). Le compte se fait AU PLUS BAS, à l'invocation : `fetch`,
 *  XMLHttpRequest, sendBeacon, WebSocket, EventSource, window.open — un appel indirect ne peut pas
 *  échapper. Les minuteries sont ensuite laissées courir (×1/1000) pour attraper un appel différé.
 *
 *    Z.0  INVENTAIRE : chaque contrôle de l'écran est classé — geste LOCAL (joué ici, zéro appel
 *         attendu) ou ACTION explicite (ses appels sont comptés dans ecran-partenaires-surface).
 *         ⛔ Aucun contrôle non classé ;
 *    Z.<geste>  chaque geste local, joué par son VRAI écouteur ;
 *    Z.T  TÉMOIN : le compteur voit bien l'appel d'une action explicite (la suite n'est pas aveugle).
 *  ⛔ Aucun réseau, aucun service Google réel.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('./banc-ecran-partenaires');

const CODE = fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');
let ok = 0, ko = 0;
function verifier(c, m, d) {
  if (c) { ok++; console.log('  ✓ ' + m + (d ? '  — ' + d : '')); }
  else { ko++; console.error('  ✗ ' + m + (d ? '  — ' + d : '')); }
}

/* ⭐ L'INVENTAIRE. Tout contrôle interactif de l'écran est ici, d'un côté ou de l'autre. Un contrôle
   ajouté plus tard sans être classé fera tomber Z.0 — c'est le but : on ne veut pas d'angle mort. */
const GESTES_LOCAUX = [
  'bouton-ajouter-sponsor', 'bouton-annuler-sponsor', 'bouton-retirer-sponsor-logo',
  'bouton-tester-interstitiel', 'bouton-imprimer-bilan', 'bouton-exporter-bilan',
  'zone-depot-sponsor-logo', 'projection-appareils', 'bilan-journee'
];
const ACTIONS_EXPLICITES = [
  'bouton-actualiser-sponsors', 'bouton-enregistrer-sponsor', 'bouton-enregistrer-sponsors-reglages',
  'bouton-rafraichir-bilan', 'bouton-vider-bilan', 'bouton-tester-remontee', 'bouton-verifier-public'
];

(async () => {
async function ecran() {
  const srv = B.serveur(CODE);
  const n = B.navigateur(srv, B.lecteur());
  n.srv = srv;
  await n.ouvrir();
  await n.tour(20);
  n.sorties.length = 0;                 // on part du silence : l'ouverture est déjà comptée ailleurs
  n.journal.length = 0;
  return n;
}
/** Joue un geste, laisse courir les minuteries, et renvoie les sorties réseau observées. */
async function apres(n, geste) {
  await geste();
  await n.tour(40);                     // plusieurs minutes simulées (minuteries ×1/1000)
  return n.sorties.slice();
}

console.log('\n■ Z.0 — inventaire des contrôles de l’écran');
{
  const n = await ecran();
  const controles = n.doc.querySelectorAll('button, input, select, textarea')
    .map((e) => e.getAttribute && e.getAttribute('id')).filter(Boolean);
  const classes = GESTES_LOCAUX.concat(ACTIONS_EXPLICITES);
  const orphelins = controles.filter((id) => classes.indexOf(id) === -1);
  verifier(orphelins.length === 0,
    'chaque contrôle porteur d’un identifiant est classé (local ou action)',
    orphelins.length ? 'non classés : ' + orphelins.join(', ') : controles.length + ' contrôle(s)');
}

console.log('\n■ Z.1 — naviguer entre les trois tâches');
{
  const n = await ecran();
  const sorties = await apres(n, async () => {
    for (const vue of ['publication', 'bilan', 'gestion']) {
      const b = n.doc.querySelector('[data-vue-sponsors="' + vue + '"]');
      b.dispatchEvent({ type: 'click', target: b });
    }
  });
  verifier(sorties.length === 0, 'basculer entre gestion, publication et bilan : zéro appel',
    sorties.join(', '));
}

console.log('\n■ Z.2 — ouvrir, remplir et abandonner le formulaire');
{
  const n = await ecran();
  const sorties = await apres(n, async () => {
    await n.clic('bouton-ajouter-sponsor');
    for (const [champ, valeur] of [['nom', 'Boulangerie'], ['accroche', 'Le bon pain'],
      ['url', 'https://example.invalid'], ['couleur', '#123456'], ['poids', '3'],
      ['ordre', '10'], ['logo_zoom', '150']]) {
      // Frappe caractère par caractère : un écouteur `input` mal posé se verrait ici.
      const c = n.champ(champ);
      for (const lettre of String(valeur)) { c.value = String(c.value) + lettre; c.dispatchEvent({ type: 'input', target: c }); }
    }
    await n.clic('bouton-annuler-sponsor');
  });
  verifier(sorties.length === 0, 'ouvrir, saisir sept champs caractère par caractère, abandonner : zéro appel',
    sorties.join(', '));
}

console.log('\n■ Z.3 — emplacements : cases, textes, tailles, dispositions, niveaux');
{
  const n = await ecran();
  const sorties = await apres(n, async () => {
    await n.clic('bouton-ajouter-sponsor');
    for (const preset of ['essentiel', 'renforce', 'personnalise']) {
      const r = n.doc.querySelector('[name="visibilite_preset"][value="' + preset + '"]');
      r.checked = true;
      r.dispatchEvent({ type: 'change', target: r });
    }
    for (const e of ['bandeau', 'rail', 'fil', 'plein', 'mur', 'dossier']) {
      await n.cocher('emp_' + e, true);
      const t = n.doc.querySelector('[name="txt_' + e + '"]');
      if (t) { t.value = 'Texte ' + e; t.dispatchEvent({ type: 'input', target: t }); }
      const z = n.doc.querySelector('[name="zoom_' + e + '"]');
      if (z) { z.value = '120'; z.dispatchEvent({ type: 'input', target: z }); }
      const d = n.doc.querySelector('[name="dispo_' + e + '"]');
      if (d) { d.value = 'droite'; d.dispatchEvent({ type: 'change', target: d }); d.dispatchEvent({ type: 'input', target: d }); }
      await n.cocher('emp_' + e, false);
    }
  });
  verifier(sorties.length === 0,
    'six emplacements, trois niveaux, textes, tailles et dispositions : zéro appel', sorties.join(', '));
}

console.log('\n■ Z.4 — aperçu : un seul rendu par frappe');
{
  const n = await ecran();
  await n.clic('bouton-ajouter-sponsor');
  let rendus = 0;
  /* ⚠️ On compte À L'INTÉRIEUR du rendu, pas la fonction elle-même : les écouteurs ont capturé sa
     RÉFÉRENCE au branchement, la remplacer après coup ne verrait rien passer. */
  n.ctx.__compter = () => { rendus++; };
  vm.runInContext('var __vraiDepuis = sponsorDepuisFormulaire; ' +
    'sponsorDepuisFormulaire = function () { __compter(); return __vraiDepuis.apply(this, arguments); };', n.ctx);
  const t = n.doc.querySelector('[name="txt_mur"]');
  t.value = 'a';
  t.dispatchEvent({ type: 'input', target: t });
  await n.tour(5);
  verifier(rendus === 1,
    '⭐ une frappe dans un champ d’emplacement ne redessine les aperçus QU’UNE fois',
    rendus + ' rendu(s)');
}

console.log('\n■ Z.5 — modifier une fiche : ouvrir le formulaire ne parle à personne');
{
  const n = await ecran();
  const sorties = await apres(n, async () => {
    const b = n.doc.querySelector('#liste-sponsors button[data-action="modifier"]');
    b.dispatchEvent({ type: 'click', target: b });
  });
  verifier(sorties.length === 0, 'cliquer « Modifier » : zéro appel', sorties.join(', '));
  verifier(!!vm.runInContext('sponsorsBaseFiche', n.ctx), 'et la base brute est mémorisée localement');
}

console.log('\n■ Z.6 — retirer le logo, tester le plein écran, projeter');
{
  const n = await ecran();
  const sorties = await apres(n, async () => {
    const b = n.doc.querySelector('#liste-sponsors button[data-action="modifier"]');
    b.dispatchEvent({ type: 'click', target: b });
    await n.clic('bouton-retirer-sponsor-logo');
    await n.clic('bouton-tester-interstitiel');
    const p = n.el('projection-appareils');
    p.value = '250';
    p.dispatchEvent({ type: 'input', target: p });
  });
  verifier(sorties.length === 0,
    'retirer le logo, tester le message plein écran, projeter sur 250 appareils : zéro appel',
    sorties.join(', '));
}

console.log('\n■ Z.7 — exporter le bilan et l’imprimer');
{
  const n = await ecran();
  n.ctx.URL = Object.assign(function () {}, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
  n.ctx.print = () => {};
  const sorties = await apres(n, async () => {
    await n.clic('bouton-exporter-bilan');
    await n.clic('bouton-imprimer-bilan');
  });
  verifier(sorties.length === 0, 'export CSV et impression : zéro appel', sorties.join(', '));
}

console.log('\n■ Z.T — témoin : le compteur n’est pas aveugle');
{
  const n = await ecran();
  const sorties = await apres(n, async () => { await n.clic('bouton-actualiser-sponsors'); });
  verifier(sorties.length === 1, '« Actualiser la liste » est bien vu comme UN appel',
    sorties.length + ' : ' + n.journal.join(', '));
  verifier(n.journal.join(',') === 'listerSponsors',
    'et c’est bien la lecture des fiches SEULES', n.journal.join(', '));
}

console.log('\n──────────────────────────────────────────────────────────────');
if (ko) { console.error('ÉCHEC — ' + ok + ' OK, ' + ko + ' ÉCHEC(S).'); process.exit(1); }
console.log('OK — ' + ok + '/' + ok + ' contrôles « zéro appel » passés.');
})().catch((e) => { console.error('EXCEPTION : ' + e.stack); process.exit(1); });
