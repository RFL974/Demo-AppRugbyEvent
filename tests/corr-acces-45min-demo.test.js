/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — LA FERMETURE AUTOMATIQUE DE LA TABLE DE MARQUE, VUE DE L'ADMINISTRATION
 *  CORR-ACCES-45MIN-DEMO
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/corr-acces-45min-demo.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *
 *  ⭐ IL EXÉCUTE LE CODE RÉEL : js/commun.js, js/api.js, js/vendor/qrcode.js, `ecrireAdmin` (admin.js) et
 *  js/admin-infos-publication.js, sur un DOM doublé et un faux serveur (domaine réservé). Le serveur simulé
 *  rend `etat_effectif`, `fermee_automatiquement` et `echeance_auto` tels que Code.gs les fabrique (banc
 *  backend tests/backend-corr-acces-45min-demo.test.js). ⛔ Rien n'est recopié du code de production.
 *
 *  CE QU'IL PROUVE :
 *    § 1 — ouvert : l'heure de fermeture automatique annoncée vient du serveur, avec sa cause ;
 *    § 2 — fermé automatiquement : libellé explicite, « Reprendre » ET « Mettre en pause » proposés, même lien,
 *          correction de score rappelée ; la pause posée pendant la fermeture le dit ;
 *    § 3 — reprise, minuit, pause manuelle échue : la bonne phrase ;
 *    § 4 — planning incomplet : « NON programmée », jamais une protection affichée ; données invalides : « Saisie
 *          fermée » (ou fenêtre de reprise datée), jamais « reste ouverte » ;
 *    § 5 — « Reprendre » : un clic, un envoi (version lue + requete_id), puis relecture ;
 *    § 6 — rien n'est calculé dans le navigateur (ni horloge, ni minuterie, ni stockage) ;
 *    § Z — les contrôles savent échouer (mutants).
 *
 *  ⚠️ TOUT EST FICTIF : clés, jeton, adresses et données.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

const API_URL_FICTIVE = 'https://exemple.invalid/exec';
const CLE_ADMIN_FICTIVE = 'CLE-ADMIN-FICTIVE-45MIN-front-jamais-reelle';
const JETON_FICTIF = 'fedcba9876543210'.repeat(4);
const LIEN_FICTIF = 'https://exemple.invalid/macros/s/PASSERELLE-FICTIVE/exec?jeton=' + JETON_FICTIF;

let reussis = 0;
const echecs = [];
const masquer = (s) => String(s).replace(/[0-9a-f]{64}/g, '<jeton>');
function verifier(num, libelle, condition, detail) {
  if (condition) { reussis++; console.log('  ✅ ' + num + ' — ' + libelle); return; }
  const d = detail === undefined ? '' : masquer(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400);
  echecs.push(num + ' — ' + libelle + (d ? ' :: ' + d : ''));
  console.log('  ❌ ' + num + ' — ' + libelle + (d ? '\n        → ' + d : ''));
}
function titre(t) { console.log('\n' + t + '\n' + '─'.repeat(70)); }
function bloc(source, entete) {
  const debut = source.indexOf(entete);
  if (debut === -1) throw new Error('Introuvable : ' + entete);
  let p = 0;
  for (let i = source.indexOf('{', debut); i < source.length; i++) {
    if (source[i] === '{') p++;
    else if (source[i] === '}' && --p === 0) return source.slice(debut, i + 1);
  }
  throw new Error('Accolades déséquilibrées : ' + entete);
}
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

/* ========================================================================== */
/*  DOUBLURES (même principe que tests/raccordement-acces-scores-dr-5r.test.js) */
/* ========================================================================== */

function fabriquerDom() {
  const tous = [];
  function simple(el, comp) {
    const m = /^([a-z]*)((?:#[\w-]+)?)((?:\.[\w-]+)*)((?:\[[\w-]+\])*)$/i.exec(comp);
    if (!m) throw new Error('HARNAIS : sélecteur non pris en charge « ' + comp + ' »');
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && el.id !== m[2].slice(1)) return false;
    if (m[3] && !m[3].split('.').filter(Boolean).every((c) => el.classList.contains(c))) return false;
    if (m[4] && !(m[4].match(/[\w-]+/g) || []).every((a) => el.hasAttribute(a))) return false;
    return true;
  }
  const correspond = (el, sel) => sel.split(',').some((partie) => simple(el, partie.trim().split(/\s+/).pop()));
  function creer(tag) {
    const classes = new Set();
    const attributs = {};
    const ecouteurs = {};
    const el = {
      tagName: String(tag).toUpperCase(), id: '', enfants: [], parent: null, textContent: '', innerHTML: '',
      value: '', hidden: false, disabled: false, href: '', type: '', ecouteurs: ecouteurs,
      classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
      setAttribute(n, v) { attributs[n] = String(v); },
      getAttribute(n) { return Object.prototype.hasOwnProperty.call(attributs, n) ? attributs[n] : null; },
      hasAttribute(n) { return Object.prototype.hasOwnProperty.call(attributs, n); },
      removeAttribute(n) { delete attributs[n]; },
      appendChild(e) { e.parent = el; el.enfants.push(e); return e; },
      remove() { if (el.parent) { const f = el.parent.enfants; f.splice(f.indexOf(el), 1); el.parent = null; } },
      addEventListener(t, fn) { (ecouteurs[t] = ecouteurs[t] || []).push(fn); },
      closest(sel) { for (let n = el; n; n = n.parent) if (correspond(n, sel)) return n; return null; },
      querySelectorAll(sel) {
        const r = [];
        (function parcourir(n) { n.enfants.forEach((e) => { if (correspond(e, sel)) r.push(e); parcourir(e); }); })(el);
        return r;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      insertAdjacentHTML(pos, html) { const s = creer('svg'); s.html = html; s.parent = el; el.enfants.unshift(s); }
    };
    Object.defineProperty(el, 'className', {
      get: () => Array.from(classes).join(' '),
      set: (v) => { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); }
    });
    tous.push(el);
    return el;
  }
  const body = creer('body');
  const attache = (e) => { for (let n = e; n; n = n.parent) if (n === body) return true; return false; };
  const document = {
    body: body,
    createElement: creer,
    getElementById: (id) => tous.find((e) => e.id === id && attache(e)) || null,
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    querySelector: (sel) => body.querySelector(sel),
    addEventListener() {}
  };
  const ajouter = (id, tag, parent) => { const e = creer(tag || 'div'); e.id = id; (parent || body).appendChild(e); return e; };
  return { document, ajouter };
}

function memoire(nom, initial, journal) {
  const d = Object.assign({}, initial || {});
  return {
    getItem(k) { journal.push(nom + ':lu:' + k); return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem(k, v) { journal.push(nom + ':ecrit:' + k); d[k] = String(v); },
    removeItem(k) { journal.push(nom + ':efface:' + k); delete d[k]; },
    donnees: d
  };
}

function bancAdmin(options) {
  const o = options || {};
  const dom = fabriquerDom();
  const requetes = [];
  const dialogues = [];
  const reponses = (o.dialogues || []).slice();
  const journalStockage = [];
  const qrDonnees = [];
  let uuid = 0;
  const ctx = {
    document: dom.document,
    console: { log() {}, warn() {}, error() {} },
    sessionStorage: memoire('session', { r92_cle_admin: CLE_ADMIN_FICTIVE }, journalStockage),
    localStorage: memoire('local', {}, journalStockage),
    crypto: { randomUUID: () => 'uuid-fictif-' + (++uuid) },
    fetch: (url, init) => {
      const corps = init && init.body ? JSON.parse(init.body) : { action: new URL(url).searchParams.get('action') };
      requetes.push({ corps: corps });
      const rep = o.serveur ? o.serveur(corps) : new Error('réseau interdit');
      if (rep instanceof Error) return Promise.reject(rep);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(rep))) });
    },
    dialogConfirmer: (m, opt) => { dialogues.push({ message: m, opt: opt || {} }); return Promise.resolve(reponses.length ? reponses.shift() : false); },
    dialogDemander: (m) => { dialogues.push({ message: m }); return Promise.resolve(null); },
    dialogAlerter: (m) => { dialogues.push({ message: m }); return Promise.resolve(); }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext('var API_URL = ' + JSON.stringify(API_URL_FICTIVE) + ';', ctx);
  vm.runInContext(lire('js/commun.js'), ctx, { filename: 'js/commun.js' });
  vm.runInContext(lire('js/api.js'), ctx, { filename: 'js/api.js' });
  const zone = dom.ajouter('acces-saisie');
  ['acces-saisie-etat', 'acces-saisie-avertissement', 'acces-saisie-actions', 'message-acces-saisie',
   'bouton-litige-charger', 'bouton-litige-corriger', 'litige-match', 'litige-formulaire', 'message-litige']
    .forEach((id) => dom.ajouter(id, id === 'litige-match' ? 'select' : 'div', zone));
  const corps = dom.ajouter('acces-saisie-corps', 'div', zone);
  corps.hidden = true;
  dom.ajouter('acces-saisie-lien', 'a', corps).href = '#';
  dom.ajouter('acces-saisie-url', 'span', corps);
  dom.ajouter('acces-saisie-qr', 'div', corps);
  vm.runInContext(lire('js/vendor/qrcode.js'), ctx, { filename: 'js/vendor/qrcode.js' });
  ctx.__espionQr = (v) => qrDonnees.push(String(v));
  vm.runInContext('var __qrReel = qrcode; qrcode = function (t, n) { var q = __qrReel(t, n); var a = q.addData; ' +
    'q.addData = function (v) { __espionQr(v); return a.apply(q, arguments); }; return q; };', ctx);
  vm.runInContext(bloc(lire('js/admin.js'), 'async function ecrireAdmin('), ctx, { filename: 'js/admin.js (ecrireAdmin)' });
  vm.runInContext(o.sourcePub || lire('js/admin-infos-publication.js'), ctx, { filename: 'js/admin-infos-publication.js' });
  const el = (id) => dom.document.getElementById(id);
  return {
    ctx, requetes, dialogues, journalStockage, qrDonnees, el,
    actions: () => requetes.map((r) => r.corps.action),
    etiquette: () => el('acces-saisie-etat').textContent,
    avert: () => el('acces-saisie-avertissement').textContent,
    classeAvert: () => el('acces-saisie-avertissement').className,
    gestes: () => el('acces-saisie-actions').querySelectorAll('button').map((b) => b.getAttribute('data-geste-acces'))
  };
}

/* ---- Les états que rend Code.gs (valeurs relevées dans le banc backend) ---- */
const BASE = { ok: true, disponible: true, edition_id: 'edition-fictive', rotations: 0, lien: LIEN_FICTIF,
  fin: { suggestion: 'AUCUNE', motif: 'categories_incompletes', en_cause: ['U12'], suite_generable: false },
  gel: { decision: 'CONFIRMATION_REQUISE', gel_manuel_possible: true },
  cloture: { decision: 'CONFIRMATION_RENFORCEE', cloture_possible: true } };
const ECHEANCE = { nature: 'PLANNING', calculable: true, fin_prevue: '2026-10-10 16:50:00', echeance_planning: '2026-10-10 17:35:00',
  echeance_reprise: '', echeance: '2026-10-10 17:35:00', source: 'planning', atteinte: false };
const etat = (champs, echeance) => Object.assign({}, BASE, champs, echeance === null ? {} : { echeance_auto: Object.assign({}, ECHEANCE, echeance || {}) });
const GESTES_FERME_AUTO = ['FIGER', 'REPRENDRE', 'CLOTURER', 'ROTATION'];
const INVALIDE = { nature: 'DONNEES_INVALIDES', calculable: false, motif: 'DATE_TOURNOI_ABSENTE', fin_prevue: undefined, echeance_planning: undefined,
  causes: [{ motif: 'DATE_TOURNOI_ABSENTE', categories: [], matchs: [] }], message: 'La date du tournoi est absente ou illisible.' };
const INCOMPLET = { nature: 'PLANNING_INCOMPLET', calculable: false, motif: 'PHASE_ATTENDUE', fin_prevue: undefined, echeance_planning: undefined,
  fin_planifiee: '2026-10-10 12:20:00', causes: [{ motif: 'PHASE_ATTENDUE', categories: ['U10', 'U12'], matchs: [] }],
  message: 'La phase suivante (après-midi) n\'est pas encore générée : la fin du matin n\'est pas la fin du tournoi. (U10, U12)' };
const ETATS = {
  ouvert: etat({ etat: 'OUVERT', etat_effectif: 'OUVERT', fermee_automatiquement: false, version: 2, actions_possibles: ['FIGER', 'CLOTURER', 'ROTATION'] }),
  fermeAuto: etat({ etat: 'OUVERT', etat_effectif: 'FERME_AUTO', fermee_automatiquement: true, version: 2, actions_possibles: GESTES_FERME_AUTO },
    { atteinte: true }),
  invalideFerme: etat({ etat: 'OUVERT', etat_effectif: 'FERME_AUTO', fermee_automatiquement: true, version: 2, actions_possibles: GESTES_FERME_AUTO },
    Object.assign({}, INVALIDE, { echeance: '', source: 'donnees_invalides', atteinte: true })),
  invalideFenetre: etat({ etat: 'OUVERT', etat_effectif: 'OUVERT', fermee_automatiquement: false, version: 3, actions_possibles: ['FIGER', 'CLOTURER', 'ROTATION'] },
    Object.assign({}, INVALIDE, { echeance_reprise: '2026-10-10 18:25:00', echeance: '2026-10-10 18:25:00', source: 'reprise', atteinte: false })),
  invalideFenetreEchue: etat({ etat: 'OUVERT', etat_effectif: 'FERME_AUTO', fermee_automatiquement: true, version: 3, actions_possibles: GESTES_FERME_AUTO },
    Object.assign({}, INVALIDE, { echeance_reprise: '2026-10-10 18:25:00', echeance: '2026-10-10 18:25:00', source: 'reprise', atteinte: true })),
  incompletFenetre: etat({ etat: 'OUVERT', etat_effectif: 'OUVERT', fermee_automatiquement: false, version: 3, actions_possibles: ['FIGER', 'CLOTURER', 'ROTATION'] },
    Object.assign({}, INCOMPLET, { echeance_reprise: '2026-10-10 18:25:00', echeance: '2026-10-10 18:25:00', source: 'reprise', atteinte: false })),
  invalidePrepare: etat({ etat: 'PREPARE', etat_effectif: 'PREPARE', fermee_automatiquement: false, version: 1, actions_possibles: ['OUVRIR', 'CLOTURER', 'ROTATION'] },
    Object.assign({}, INVALIDE, { echeance: '', source: 'donnees_invalides', atteinte: true })),
  invalideFige: etat({ etat: 'FIGE', etat_effectif: 'FIGE', fermee_automatiquement: false, version: 3, actions_possibles: ['REPRENDRE', 'CLOTURER', 'ROTATION'] },
    Object.assign({}, INVALIDE, { echeance: '', source: 'donnees_invalides', atteinte: true })),
  reprise: etat({ etat: 'OUVERT', etat_effectif: 'OUVERT', fermee_automatiquement: false, version: 3, actions_possibles: ['FIGER', 'CLOTURER', 'ROTATION'] },
    { echeance_reprise: '2026-10-10 18:35:00', echeance: '2026-10-10 18:35:00', source: 'reprise' }),
  minuit: etat({ etat: 'OUVERT', etat_effectif: 'OUVERT', fermee_automatiquement: false, version: 2, actions_possibles: ['FIGER', 'CLOTURER', 'ROTATION'] },
    { fin_prevue: '2026-10-10 23:30:00', echeance_planning: '2026-10-11 00:15:00', echeance: '2026-10-11 00:15:00' }),
  pauseEchue: etat({ etat: 'FIGE', etat_effectif: 'FIGE', fermee_automatiquement: false, version: 3, actions_possibles: ['REPRENDRE', 'CLOTURER', 'ROTATION'] },
    { atteinte: true }),
  nonCalculable: Object.assign({}, BASE, { etat: 'OUVERT', etat_effectif: 'OUVERT', fermee_automatiquement: false, version: 2,
    actions_possibles: ['FIGER', 'CLOTURER', 'ROTATION'],
    echeance_auto: Object.assign({}, INCOMPLET, { echeance_reprise: '', echeance: '', source: '', atteinte: false }) }),
  ancien: etat({ etat: 'OUVERT', version: 2, actions_possibles: ['FIGER', 'CLOTURER', 'ROTATION'] }, null),
  prepareEchu: etat({ etat: 'PREPARE', etat_effectif: 'PREPARE', fermee_automatiquement: false, version: 1, actions_possibles: ['OUVRIR', 'CLOTURER', 'ROTATION'] },
    { atteinte: true }),
  repriseIllisible: etat({ etat: 'OUVERT', etat_effectif: 'OUVERT', fermee_automatiquement: false, version: 3, actions_possibles: ['FIGER', 'CLOTURER', 'ROTATION'] },
    { reprise_illisible: true }),
  dateFausse: etat({ etat: 'OUVERT', etat_effectif: 'OUVERT', fermee_automatiquement: false, version: 2, actions_possibles: ['FIGER', 'CLOTURER', 'ROTATION'] },
    { fin_prevue: '2026-10-12 16:50:00', echeance_planning: '2026-10-12 17:35:00', echeance: '2026-10-12 17:35:00' })
};
ETATS.nonCalculableFige = Object.assign({}, ETATS.nonCalculable, { etat: 'FIGE', etat_effectif: 'FIGE', version: 3,
  actions_possibles: ['REPRENDRE', 'CLOTURER', 'ROTATION'] });
/* ⭐ CORR-MAINTIEN-FERMETURE-45MIN — l'après-midi retirée APRÈS la fermeture automatique. Le serveur rend
   `maintenue: true` et `source: 'maintien'`, que le planning soit redevenu incomplet… */
ETATS.maintenue = etat({ etat: 'OUVERT', etat_effectif: 'FERME_AUTO', fermee_automatiquement: true, version: 2,
  actions_possibles: GESTES_FERME_AUTO },
  Object.assign({}, INCOMPLET, { echeance_reprise: '', echeance: '', source: 'maintien', atteinte: true, maintenue: true }));
/* … ou qu'il ait été RESTAURÉ en entier : l'échéance redevient calculable, et l'accès reste fermé quand même.
   ⚠️ `echeance` porte alors une heure À VENIR (18:25) tandis qu'`atteinte` est vrai : l'écran ne doit surtout
   pas la présenter comme « dépassée », ni comme « prévue ». */
ETATS.maintenueRestauree = etat({ etat: 'OUVERT', etat_effectif: 'FERME_AUTO', fermee_automatiquement: true, version: 2,
  actions_possibles: GESTES_FERME_AUTO },
  { echeance: '2026-10-10 18:25:00', echeance_planning: '2026-10-10 18:25:00', source: 'maintien', atteinte: true, maintenue: true });
/* ⭐ Une PAUSE MANUELLE posée pendant une fermeture maintenue : l'état enregistré est FIGE, et le maintien vit
   toujours. ⛔ L'écran ne doit pas parler d'échéance « dépassée » — 18:25 n'est pas encore passée. */
ETATS.maintenueFige = etat({ etat: 'FIGE', etat_effectif: 'FIGE', fermee_automatiquement: false, version: 3,
  actions_possibles: ['REPRENDRE', 'CLOTURER', 'ROTATION'] },
  { echeance: '2026-10-10 18:25:00', echeance_planning: '2026-10-10 18:25:00', source: 'maintien', atteinte: true, maintenue: true });

function serveur(nom, apres) {
  let lectures = 0;
  return (corps) => {
    if (corps.cle !== CLE_ADMIN_FICTIVE) return { error: 'Clé incorrecte.', acces_refuse: true };
    if (corps.action === 'getAccesScoresAdmin') return (lectures++ === 0 || !apres) ? ETATS[nom] : ETATS[apres];
    if (corps.action === 'creerConfirmationAccesScores') return { ok: true, confirmation_id: 'conf-fictive-45', transition: corps.transition };
    if (corps.action === 'changerAccesScores') return { ok: true, etat: corps.transition === 'CLOTURER' ? 'CLOTURE' : 'OUVERT', version: 3 };
    return { error: 'Action inattendue dans le banc : ' + corps.action };
  };
}
async function clicGeste(nom, apres, action, dialogues, o) {
  const b = bancAdmin(Object.assign({ serveur: serveur(nom, apres), dialogues: dialogues || [] }, o));
  await b.ctx.chargerAccesScores();
  const bouton = b.el('acces-saisie-actions').querySelectorAll('button').find((x) => x.getAttribute('data-geste-acces') === action);
  if (bouton) await b.ctx.onClicGesteAccesScores({ target: bouton });
  b.bouton = bouton;
  return b;
}
async function vue(nom, options) {
  const b = bancAdmin(Object.assign({ serveur: serveur(nom) }, options || {}));
  await b.ctx.chargerAccesScores();
  return b;
}

/* ========================================================================== */
async function sectionsPrincipales(sourcePub) {
  const o = sourcePub ? { sourcePub: sourcePub } : {};
  const r = {};

  const ouvert = await vue('ouvert', o);
  r.ouvert = /^Ouvert/.test(ouvert.etiquette()) &&
    ouvert.avert().indexOf('⏱️ Fermeture automatique prévue le 10/10 à 17:35 (45 minutes après la fin prévue du dernier match, le 10/10 à 16:50).') !== -1 &&
    JSON.stringify(ouvert.gestes().sort()) === '["CLOTURER","FIGER","ROTATION"]' && ouvert.el('acces-saisie-lien').href === LIEN_FICTIF &&
    JSON.stringify(ouvert.actions()) === '["getAccesScoresAdmin"]' && ouvert.dialogues.length === 0;
  r.ouvertDetail = { etiquette: ouvert.etiquette(), avert: ouvert.avert(), gestes: ouvert.gestes() };

  const ferme = await vue('fermeAuto', o);
  r.fermeLibelle = /^Fermé automatiquement/.test(ferme.etiquette()) && /« Reprendre la saisie » rouvre 45 minutes avec le même lien/.test(ferme.etiquette()) &&
    /« Mettre en pause » la garde fermée/.test(ferme.etiquette());
  const boutonDe = (b, a) => b.el('acces-saisie-actions').querySelectorAll('button').find((x) => x.getAttribute('data-geste-acces') === a);
  r.fermeGestes = JSON.stringify(ferme.gestes().sort()) === '["CLOTURER","FIGER","REPRENDRE","ROTATION"]' &&
    boutonDe(ferme, 'REPRENDRE').textContent === 'Reprendre la saisie' && boutonDe(ferme, 'FIGER').textContent === 'Mettre en pause';
  r.fermeTexte = ferme.avert().indexOf('⏱️ Saisie fermée automatiquement le 10/10 à 17:35 (45 minutes après la fin prévue du dernier match, le 10/10 à 16:50).') !== -1 &&
    /corriger un score/.test(ferme.avert()) && /La pause reste possible, avec une confirmation renforcée\./.test(ferme.avert()) &&
    / ko$|^ko$|\bko\b/.test(ferme.classeAvert());
  r.fermeLien = ferme.el('acces-saisie-corps').hidden === false && ferme.el('acces-saisie-lien').href === LIEN_FICTIF && ferme.qrDonnees[0] === LIEN_FICTIF;
  r.fermeDetail = { etiquette: ferme.etiquette(), avert: ferme.avert(), gestes: ferme.gestes(), classe: ferme.classeAvert() };

  const maintenue = await vue('maintenue', o);
  const maintenueRestauree = await vue('maintenueRestauree', o);
  const maintenueFige = await vue('maintenueFige', o);
  const PHRASE_MAINTIEN = '⛔ La fermeture automatique est MAINTENUE : le planning a changé après elle (après-midi retirée, ' +
    'catégorie retirée, ajoutée ou devenue incomplète). Le remettre en état ne rouvre pas la saisie — seul ' +
    '« Reprendre la saisie » la rend, pour 45 minutes, avec le lien affiché ci-dessous.';
  r.maintenue = /^Fermé automatiquement/.test(maintenue.etiquette()) && maintenue.avert().indexOf(PHRASE_MAINTIEN) !== -1 &&
    maintenue.avert().indexOf('⛔ Saisie fermée, et maintenue fermée.') !== -1 &&
    /corriger un score/.test(maintenue.avert()) && !/reste ouverte/.test(maintenue.avert()) && !/NON programmée/.test(maintenue.avert()) &&
    JSON.stringify(maintenue.gestes().sort()) === '["CLOTURER","FIGER","REPRENDRE","ROTATION"]' &&
    maintenue.el('acces-saisie-lien').href === LIEN_FICTIF;
  /* ⭐ L'INCISE EST UN CONTRÔLE À PART (⛔ pas mêlée à `r.maintenue`, sinon aucun mutant ne distinguerait
     « la phrase de maintien a disparu » de « le motif a disparu ») : présente quand le planning est illisible,
     absente quand il est de nouveau lisible. */
  r.maintienMotif = /Par ailleurs, le planning n'est pas lisible : La phase suivante \(après-midi\)/.test(maintenue.avert()) &&
    maintenueRestauree.avert().indexOf('Par ailleurs') === -1 && maintenueFige.avert().indexOf('Par ailleurs') === -1;
  r.maintenueRestauree = maintenueRestauree.avert().indexOf(PHRASE_MAINTIEN) !== -1 &&
    maintenueRestauree.avert().indexOf('Fermeture automatique prévue') === -1 &&
    maintenueRestauree.avert().indexOf('dépassée') === -1 && maintenueRestauree.avert().indexOf('18:25') === -1;
  /* ⛔ En pause, 18:25 n'est PAS dépassée : l'écran ne doit ni l'annoncer dépassée, ni la présenter comme à venir. */
  r.maintenueFige = /^En pause/.test(maintenueFige.etiquette()) && !/Fermé automatiquement/.test(maintenueFige.etiquette()) &&
    maintenueFige.avert().indexOf(PHRASE_MAINTIEN) !== -1 &&
    maintenueFige.avert().indexOf('Saisie fermée, et maintenue fermée.') === -1 &&
    maintenueFige.avert().indexOf('dépassée') === -1 && maintenueFige.avert().indexOf('prévue') === -1;
  r.maintienDetail = { maintenue: [maintenue.etiquette(), maintenue.avert(), maintenue.gestes()],
    restauree: maintenueRestauree.avert(), fige: [maintenueFige.etiquette(), maintenueFige.avert()] };

  const reprise = await vue('reprise', o);
  r.reprise = reprise.avert().indexOf('⏱️ Fermeture automatique prévue le 10/10 à 18:35 (45 minutes après la reprise).') !== -1 && /^Ouvert/.test(reprise.etiquette());
  const minuit = await vue('minuit', o);
  r.minuit = minuit.avert().indexOf('⏱️ Fermeture automatique prévue le 11/10 à 00:15 (45 minutes après la fin prévue du dernier match, le 10/10 à 23:30).') !== -1;
  const echue = await vue('pauseEchue', o);
  r.pauseEchue = /^En pause/.test(echue.etiquette()) && !/Fermé automatiquement/.test(echue.etiquette()) &&
    echue.avert().indexOf('⏱️ Échéance de fermeture automatique dépassée (le 10/10 à 17:35) : « Reprendre la saisie » ne rouvrira la saisie que pour 45 minutes.') !== -1;
  r.autresDetail = { reprise: reprise.avert(), minuit: minuit.avert(), echue: [echue.etiquette(), echue.avert()] };

  const nc = await vue('nonCalculable', o);
  r.nonCalculable = /^Ouvert/.test(nc.etiquette()) &&
    nc.avert().indexOf('⚠️ Fermeture automatique NON programmée : La phase suivante (après-midi) n\'est pas encore générée : la fin du matin n\'est pas la fin du tournoi. (U10, U12) La saisie reste ouverte tant que tu ne la mets pas en pause.') !== -1 &&
    !/prévue à|prévue le|fermée automatiquement|dépassée/.test(nc.avert()) && /\bko\b/.test(nc.classeAvert());
  const ncFige = await vue('nonCalculableFige', o);
  r.nonCalculableFige = /NON programmée/.test(ncFige.avert()) && !/reste ouverte/.test(ncFige.avert()) && /^En pause/.test(ncFige.etiquette());
  r.ncDetail = { avert: nc.avert(), classe: nc.classeAvert(), fige: ncFige.avert() };

  const ancien = await vue('ancien', o);
  r.compatible = /^Ouvert/.test(ancien.etiquette()) && !/⏱️|Fermeture automatique/.test(ancien.avert()) && /matchs ne sont pas terminés/.test(ancien.avert());

  const clic = bancAdmin(Object.assign({ serveur: serveur('fermeAuto', 'reprise') }, o));
  await clic.ctx.chargerAccesScores();
  const bouton = clic.el('acces-saisie-actions').querySelectorAll('button').find((b) => b.getAttribute('data-geste-acces') === 'REPRENDRE');
  if (bouton) await clic.ctx.onClicGesteAccesScores({ target: bouton });
  const envoi = clic.requetes.find((q) => q.corps.action === 'changerAccesScores');
  r.reprendre = !!bouton && clic.dialogues.length === 0 && !!envoi && envoi.corps.transition === 'REPRENDRE' && envoi.corps.version_lue === '2' &&
    /^adm-/.test(envoi.corps.requete_id) && !envoi.corps.confirmation_id &&
    JSON.stringify(clic.actions()) === '["getAccesScoresAdmin","changerAccesScores","getAccesScoresAdmin"]' &&
    /^Ouvert/.test(clic.etiquette()) && /prévue le 10\/10 à 18:35/.test(clic.avert());
  r.reprendreDetail = { actions: clic.actions(), dialogues: clic.dialogues, etiquette: clic.etiquette(), avert: clic.avert() };
  r.stockage = [ouvert, ferme, nc, clic].every((b) => b.journalStockage.every((j) => /^session:lu:/.test(j)));

  const prep = await vue('prepareEchu', o);
  r.prepare = /^Préparé/.test(prep.etiquette()) &&
    prep.avert().indexOf('⏱️ Échéance de fermeture automatique dépassée (le 10/10 à 17:35) : une saisie ouverte maintenant serait aussitôt fermée ; « Reprendre la saisie » la rouvrirait ensuite pour 45 minutes.') !== -1;
  const ouvrir = await clicGeste('prepareEchu', 'fermeAuto', 'OUVRIR', [], o);
  const messageOuvrir = ouvrir.el('message-acces-saisie').textContent;
  r.ouvrirApres = !!ouvrir.bouton && ouvrir.actions().indexOf('changerAccesScores') !== -1 && /^Fermé automatiquement/.test(ouvrir.etiquette()) &&
    messageOuvrir.indexOf('⚠️ Saisie aussitôt fermée automatiquement (voir la raison ci-dessus). « Reprendre la saisie » la rouvre pour 45 minutes.') === 0 &&
    !/✅/.test(messageOuvrir) &&
    /\bko\b/.test(ouvrir.el('message-acces-saisie').className);
  const ouvrirAvant = await clicGeste('prepareEchu', 'ouvert', 'OUVRIR', [], o);
  r.ouvrirAvant = /^✅ Ouvert/.test(ouvrirAvant.el('message-acces-saisie').textContent);
  r.prepDetail = { prep: [prep.etiquette(), prep.avert()], ouvrir: [ouvrir.etiquette(), messageOuvrir], avant: ouvrirAvant.el('message-acces-saisie').textContent };

  const clo = await clicGeste('fermeAuto', null, 'CLOTURER', [true, true], o);
  const renforcee = clo.dialogues[1] ? clo.dialogues[1].message : '';
  const cloOuvert = await clicGeste('ouvert', null, 'CLOTURER', [true, true], o);
  const renforceeOuvert = cloOuvert.dialogues[1] ? cloOuvert.dialogues[1].message : '';
  r.clotureInchangee = clo.dialogues.length === 2 && renforcee === renforceeOuvert && /La pause reste possible, avec une confirmation renforcée\./.test(renforcee) &&
    clo.actions().indexOf('changerAccesScores') !== -1;
  r.cloDetail = { ferme: renforcee, ouvert: renforceeOuvert };

  const pause = await clicGeste('fermeAuto', 'fermeAuto', 'FIGER', [true], o);
  const qPause = pause.dialogues[0] ? pause.dialogues[0].message : '';
  const confPause = pause.requetes.find((q) => q.corps.action === 'creerConfirmationAccesScores');
  const envoiPause = pause.requetes.find((q) => q.corps.action === 'changerAccesScores');
  r.pauseFermee = !!pause.bouton && pause.dialogues.length === 1 && /ne confirme pas la fin/.test(qPause) &&
    /La saisie est déjà fermée automatiquement : la pause la gardera fermée, même si le planning change\./.test(qPause) &&
    !!confPause && confPause.corps.transition === 'FIGER' && confPause.corps.version_lue === '2' &&
    !!envoiPause && envoiPause.corps.transition === 'FIGER' && envoiPause.corps.confirmation_id === 'conf-fictive-45' &&
    envoiPause.corps.version_lue === '2' && confPause.corps.requete_id !== envoiPause.corps.requete_id;
  const pauseOuverte = await clicGeste('ouvert', 'ouvert', 'FIGER', [true], o);
  r.pauseOuverteInchangee = !/déjà fermée automatiquement/.test(pauseOuverte.dialogues[0] ? pauseOuverte.dialogues[0].message : 'déjà fermée automatiquement');
  r.pauseDetail = { question: qPause, actions: pause.actions(), ouverte: pauseOuverte.dialogues.map((d) => d.message) };

  const invF = await vue('invalideFerme', o);
  r.invalideFerme = /^Fermé automatiquement/.test(invF.etiquette()) && JSON.stringify(invF.gestes().sort()) === '["CLOTURER","FIGER","REPRENDRE","ROTATION"]' &&
    invF.avert().indexOf('⛔ Saisie fermée : données du planning invalides — La date du tournoi est absente ou illisible. Aucune échéance fiable : corrige ces données, ou « Reprendre la saisie » pour 45 minutes. Tu peux toujours corriger un score depuis l\'administration.') !== -1 &&
    !/prévue|NON programmée|reste ouverte/.test(invF.avert()) && /\bko\b/.test(invF.classeAvert());
  const invO = await vue('invalideFenetre', o);
  r.invalideFenetre = /^Ouvert/.test(invO.etiquette()) &&
    invO.avert().indexOf('⚠️ Fermeture automatique prévue le 10/10 à 18:25 (45 minutes après la reprise) : données du planning invalides — La date du tournoi est absente ou illisible.') !== -1;
  const invE = await vue('invalideFenetreEchue', o);
  r.invalideFenetreEchue = /^Fermé automatiquement/.test(invE.etiquette()) &&
    invE.avert().indexOf('⛔ Saisie fermée le 10/10 à 18:25 (45 minutes après la reprise) : données du planning invalides — La date du tournoi est absente ou illisible.') !== -1;
  const incF = await vue('incompletFenetre', o);
  r.incompletFenetre = /^Ouvert/.test(incF.etiquette()) &&
    incF.avert().indexOf('⏱️ Fermeture automatique prévue le 10/10 à 18:25 (45 minutes après la reprise). Planning incomplet : La phase suivante (après-midi)') !== -1 &&
    !/NON programmée/.test(incF.avert());
  const invP = await vue('invalidePrepare', o);
  const invG = await vue('invalideFige', o);
  r.invalideAutresEtats = /^Préparé/.test(invP.etiquette()) && /^En pause/.test(invG.etiquette()) &&
    invP.avert().indexOf('⚠️ Données du planning invalides — La date du tournoi est absente ou illisible. une saisie ouverte maintenant serait aussitôt fermée ; « Reprendre la saisie » la rouvrirait ensuite pour 45 minutes.') !== -1 &&
    invG.avert().indexOf('⚠️ Données du planning invalides — La date du tournoi est absente ou illisible. « Reprendre la saisie » ne rouvrira la saisie que pour 45 minutes.') !== -1 &&
    !/ne tiendra que 45 minutes/.test(invP.avert() + invG.avert());
  const rot = await clicGeste('fermeAuto', 'fermeAuto', 'ROTATION', [true], o);
  const messageRot = rot.el('message-acces-saisie').textContent;
  r.rotationMessage = !!rot.bouton && rot.actions().indexOf('changerAccesScores') !== -1 &&
    /^✅ /.test(messageRot) && !/aussitôt fermée/.test(messageRot) && /^Fermé automatiquement/.test(rot.etiquette());
  r.invalideDetail = { ferme: invF.avert(), fenetre: invO.avert(), echue: invE.avert(), incomplet: incF.avert(),
    prepare: invP.avert(), fige: invG.avert(), rotation: messageRot };

  const illisible = await vue('repriseIllisible', o);
  r.repriseIllisible = /La date de la dernière reprise est illisible : elle ne prolonge rien\./.test(illisible.avert()) && /\bko\b/.test(illisible.classeAvert());
  const fausse = await vue('dateFausse', o);
  r.dateVisible = fausse.avert().indexOf('prévue le 12/10 à 17:35') !== -1;
  r.diversDetail = { illisible: illisible.avert(), fausse: fausse.avert() };
  return r;
}

async function principal() {
  const r = await sectionsPrincipales();

  titre('§ 1 — OUVERT : L\'HEURE DE FERMETURE AUTOMATIQUE VIENT DU SERVEUR');
  verifier('1.1', 'libellé « Ouvert », phrase « Fermeture automatique prévue le 10/10 à 17:35 (… fin prévue du dernier match, le 10/10 à 16:50) » — la DATE est écrite, gestes inchangés, une seule lecture',
    r.ouvert, r.ouvertDetail);
  verifier('1.2', 'un état sans `echeance_auto` (serveur antérieur) s\'affiche comme avant, sans phrase d\'échéance', r.compatible);

  titre('§ 2 — FERMÉ AUTOMATIQUEMENT');
  verifier('2.1', 'libellé explicite : « Fermé automatiquement … « Reprendre la saisie » rouvre 45 minutes avec le même lien, « Mettre en pause » la garde fermée »', r.fermeLibelle, r.fermeDetail);
  verifier('2.2', 'gestes : Mettre en pause, Reprendre la saisie, Clôturer, Renouveler — la pause manuelle reste proposée', r.fermeGestes, r.fermeDetail);
  verifier('2.3', 'message d\'alerte : « Saisie fermée automatiquement le 10/10 à 17:35 (…) », correction de score rappelée, et l\'avertissement de pause habituel', r.fermeTexte, r.fermeDetail);
  verifier('2.4', 'le MÊME lien et le MÊME QR restent affichés (la reprise ne change pas le lien)', r.fermeLien);
  verifier('2.5', '« Mettre en pause » pendant la fermeture automatique : la confirmation dit que la pause la gardera fermée même si le planning change, puis confirmation serveur et envoi FIGER (version lue, deux requete_id) ; hors fermeture, texte inchangé',
    r.pauseFermee && r.pauseOuverteInchangee, r.pauseDetail);

  titre('§ 3 — REPRISE, MINUIT, PAUSE MANUELLE ÉCHUE');
  verifier('3.1', 'après une reprise : « prévue le 10/10 à 18:35 (45 minutes après la reprise) »', r.reprise, r.autresDetail);
  verifier('3.2', 'passage de minuit : « prévue le 11/10 à 00:15 (… le 10/10 à 23:30) »', r.minuit, r.autresDetail);
  verifier('3.3', 'pause manuelle dont l\'échéance est passée : reste « En pause », et dit que la reprise ne donnera que 45 minutes', r.pauseEchue, r.autresDetail);

  verifier('3.4', 'préparé, échéance dépassée : l\'écran prévient qu\'une saisie ouverte maintenant serait aussitôt fermée (sans renvoyer vers un bouton absent)',
    r.prepare, r.prepDetail);
  verifier('3.5', '« Ouvrir la saisie » après l\'échéance : le serveur la ferme aussitôt, et l\'écran le DIT (⚠️) au lieu de « ✅ Ouvert »', r.ouvrirApres, r.prepDetail);
  verifier('3.6', '« Ouvrir la saisie » avant l\'échéance : message « ✅ Ouvert » inchangé', r.ouvrirAvant, r.prepDetail);
  verifier('3.6.1', 'renouveler le lien PENDANT la fermeture automatique : le message reste celui du serveur — ⛔ pas de « Saisie aussitôt fermée », qui ne serait pas la conséquence du geste',
    r.rotationMessage, r.invalideDetail);
  verifier('3.7', 'clôture pendant la fermeture automatique : la confirmation renforcée est la MÊME qu\'hors fermeture (la pause y reste possible, et elle l\'est)',
    r.clotureInchangee, r.cloDetail);
  verifier('3.8', 'date de reprise illisible : signalée, en alerte', r.repriseIllisible, r.diversDetail);
  verifier('3.9', 'la DATE de l\'échéance est toujours écrite (une date de tournoi erronée — ici le 12/10 — se voit)', r.dateVisible, r.diversDetail);

  titre('§ 4 — ÉCHÉANCE NON CALCULABLE : SIGNALÉE, JAMAIS PRÉSENTÉE COMME ACTIVE');
  verifier('4.1', 'ouvert, après-midi non générée : « Fermeture automatique NON programmée : <motif du serveur> La saisie reste ouverte… », en alerte, sans aucune heure',
    r.nonCalculable, r.ncDetail);
  verifier('4.2', 'en pause : le motif est dit, sans prétendre que la saisie est ouverte', r.nonCalculableFige, r.ncDetail);
  verifier('4.3', 'DONNÉES INVALIDES, sans fenêtre de reprise : « Fermé automatiquement », « ⛔ Saisie fermée : données du planning invalides — <motif> Aucune échéance fiable… », les quatre gestes — ⛔ jamais « NON programmée » ni « reste ouverte »',
    r.invalideFerme, r.invalideDetail);
  verifier('4.4', 'données invalides pendant une fenêtre de reprise : « Fermeture automatique prévue le 10/10 à 18:25 (45 minutes après la reprise) : données du planning invalides — … »',
    r.invalideFenetre, r.invalideDetail);
  verifier('4.5', 'données invalides, fenêtre de reprise échue : « ⛔ Saisie fermée le 10/10 à 18:25 (45 minutes après la reprise) : données du planning invalides — … »',
    r.invalideFenetreEchue, r.invalideDetail);
  verifier('4.6', 'planning incomplet avec une reprise tardive : « Fermeture automatique prévue le 10/10 à 18:25 (45 minutes après la reprise). Planning incomplet : … »',
    r.incompletFenetre, r.invalideDetail);
  verifier('4.7', 'données invalides sur un accès PRÉPARÉ : « une saisie ouverte maintenant serait aussitôt fermée » (⛔ jamais « ne tiendra que 45 minutes ») ; en pause : « Reprendre » ne rouvrira que 45 minutes',
    r.invalideAutresEtats, r.invalideDetail);

  titre('§ 4 bis — LA FERMETURE MAINTENUE (CORR-MAINTIEN-FERMETURE-45MIN)');
  verifier('4.8', 'après-midi retirée APRÈS la fermeture : « ⛔ Saisie fermée, et maintenue fermée. ⛔ La fermeture automatique est MAINTENUE … seul « Reprendre la saisie » la rend », correction rappelée, quatre gestes, lien affiché — ⛔ jamais « NON programmée » ni « reste ouverte »',
    r.maintenue, r.maintienDetail);
  verifier('4.9', 'planning RESTAURÉ mais fermeture maintenue : la MÊME phrase — ⛔ ni « Fermeture automatique prévue », ni « dépassée », ni l\'heure 18:25, qui n\'est pas passée',
    r.maintenueRestauree, r.maintienDetail);
  verifier('4.10', 'pause manuelle posée pendant une fermeture maintenue : reste « En pause », le maintien est dit, ⛔ sans « Saisie fermée » (c\'est la pause qui ferme) ni échéance « dépassée »',
    r.maintenueFige, r.maintienDetail);
  verifier('4.11', 'fermeture maintenue ET planning illisible : le motif du serveur est TOUJOURS dit (« Par ailleurs… ») — ⛔ mais pas quand le planning est de nouveau lisible',
    r.maintienMotif, r.maintienDetail);

  titre('§ 5 — « REPRENDRE LA SAISIE »');
  verifier('5.1', 'un clic, AUCUNE fenêtre, UN envoi REPRENDRE (version lue 2, requete_id adm-…), puis relecture qui annonce la nouvelle échéance',
    r.reprendre, r.reprendreDetail);

  titre('§ 6 — RIEN N\'EST CALCULÉ DANS LE NAVIGATEUR');
  verifier('6.1', 'aucun stockage écrit : seule la clé admin est LUE', r.stockage);
  const src = lire('js/admin-infos-publication.js');
  const fonctions = sansCommentaires(bloc(src, 'function momentEcheanceAcces(') + bloc(src, 'function texteEcheanceAcces('));
  verifier('6.2', '`momentEcheanceAcces` et `texteEcheanceAcces` ne lisent ni l\'horloge, ni une minuterie, ni un stockage, ni le réseau',
    !/Date|setTimeout|setInterval|Storage|fetch|apiPost/.test(fonctions));
  let syntaxe = true;
  try { new vm.Script(src, { filename: 'js/admin-infos-publication.js' }); } catch (e) { syntaxe = false; }
  verifier('6.3', 'js/admin-infos-publication.js : syntaxe valide', syntaxe);

  titre('§ Z — AUTO-PREUVE : DOUZE MUTANTS DOIVENT ÊTRE VUS');
  const muter = (avant, apres) => {
    if (src.indexOf(avant) === -1) throw new Error('Mutant inopérant : ' + avant);
    return src.split(avant).join(apres);
  };
  const z1 = await sectionsPrincipales(muter('const fermeAuto = etat.fermee_automatiquement === true;', 'const fermeAuto = false;'));
  verifier('Z.1', 'mutant « l\'état effectif est ignoré par le libellé » : 2.1 tombe', !z1.fermeLibelle);
  const z2 = await sectionsPrincipales(muter("  if (nature !== 'PLANNING') {", '  if (false) {'));
  verifier('Z.2', 'mutant « un planning incomplet est affiché comme une heure » : 4.1 et 4.6 tombent', !z2.nonCalculable && !z2.incompletFenetre);
  const z3 = await sectionsPrincipales(muter("[echeance ? echeance.texte : '', aviso", "['', aviso"));
  verifier('Z.3', 'mutant « l\'échéance n\'est plus affichée » : 1.1, 2.3 et 3.1 tombent', !z3.ouvert && !z3.fermeTexte && !z3.reprise);
  const z4 = await sectionsPrincipales(muter("  if (applique && message && (action === 'OUVRIR' || action === 'REPRENDRE') &&\n      accesScoresCourant && accesScoresCourant.fermee_automatiquement === true) {", '  if (false) {'));
  verifier('Z.4', 'mutant « ✅ Ouvert affiché après une ouverture aussitôt fermée » : 3.5 tombe, 3.6 tient', !z4.ouvrirApres && z4.ouvrirAvant);
  const z5 = await sectionsPrincipales(muter("    const dejaFermee = etat.fermee_automatiquement === true\n", "    const dejaFermee = false\n"));
  verifier('Z.5', 'mutant « la pause posée pendant la fermeture n\'annonce plus qu\'elle la garde fermée » : 2.5 tombe', !z5.pauseFermee && z5.pauseOuverteInchangee);
  const z6 = await sectionsPrincipales(muter("  if (nature === 'DONNEES_INVALIDES') {", '  if (false) {'));
  verifier('Z.6', 'mutant « des données invalides sont affichées comme une attente normale » : 4.3, 4.4 et 4.5 tombent',
    !z6.invalideFerme && !z6.invalideFenetre && !z6.invalideFenetreEchue);
  const z7 = await sectionsPrincipales(muter("    if (fermee) {\n      return { texte: '⛔ Saisie fermée : ' + cause", "    if (false) {\n      return { texte: '⛔ Saisie fermée : ' + cause"));
  verifier('Z.7', 'mutant « données invalides fermées présentées comme une invitation à saisir » : 4.3 tombe, 4.4 tient', !z7.invalideFerme && z7.invalideFenetre);
  const z8 = await sectionsPrincipales(muter("    const suite = etat.etat === 'PREPARE'\n      ? 'une saisie ouverte maintenant serait aussitôt fermée ; « Reprendre la saisie » la rouvrirait ensuite pour 45 minutes.'\n      : '« Reprendre la saisie » ne rouvrira la saisie que pour 45 minutes.';\n    return { texte: '⚠️ Données du planning invalides — ' + motif + ' ' + suite + repriseIllisible, type: 'ko' };",
    "    return { texte: '⚠️ Données du planning invalides — ' + motif + ' Une saisie ouverte ou reprise ne tiendra que 45 minutes.' + repriseIllisible, type: 'ko' };"));
  verifier('Z.8', 'mutant « une saisie ouverte tiendrait 45 minutes malgré des données invalides » : 4.7 tombe', !z8.invalideAutresEtats);
  const z9 = await sectionsPrincipales(muter("  if (applique && message && (action === 'OUVRIR' || action === 'REPRENDRE') &&\n      accesScoresCourant && accesScoresCourant.fermee_automatiquement === true) {",
    '  if (applique && message && accesScoresCourant && accesScoresCourant.fermee_automatiquement === true) {'));
  verifier('Z.9', 'mutant « tout geste annonce une saisie aussitôt fermée » : 3.6.1 tombe, 3.5 tient', !z9.rotationMessage && z9.ouvrirApres);
  const z10 = await sectionsPrincipales(muter('  if (e.maintenue === true) {', '  if (false) {'));
  verifier('Z.10', 'mutant « la fermeture maintenue n\'est plus dite » : 4.8, 4.9 et 4.10 tombent, et 4.1 (attente normale) tient',
    !z10.maintenue && !z10.maintenueRestauree && !z10.maintenueFige && z10.nonCalculable);
  const z11 = await sectionsPrincipales(muter("    return { texte: (ouvert ? '⛔ Saisie fermée, et maintenue fermée. ' : '') + maintien",
    "    return { texte: '⛔ Saisie fermée, et maintenue fermée. ' + maintien"));
  verifier('Z.11', 'mutant « une pause est annoncée comme une saisie fermée par le maintien » : 4.10 tombe, 4.8 tient',
    !z11.maintenueFige && z11.maintenue);
  const z12 = await sectionsPrincipales(muter("    const aussi = e.calculable === true ? '' : ' Par ailleurs, le planning n\\'est pas lisible : ' + motif;",
    "    const aussi = '';"));
  verifier('Z.12', 'mutant « le maintien masque le motif du planning » : 4.11 tombe, et 4.8 TIENT (les deux contrôles sont indépendants)',
    !z12.maintienMotif && z12.maintenue);
}

(async function () {
  process.exitCode = 1;
  try {
    await principal();
  } catch (e) {
    console.error('\nERREUR DU HARNAIS : ' + masquer((e && e.stack) || e));
    process.exit(1);
  }
  console.log('\n' + '─'.repeat(70));
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + ' contrôle(s) en défaut sur ' + (reussis + echecs.length));
    echecs.forEach((x) => console.log('   · ' + x));
    process.exit(1);
  }
  console.log('OK — ' + reussis + ' contrôles passés.');
  process.exitCode = 0;
})();
