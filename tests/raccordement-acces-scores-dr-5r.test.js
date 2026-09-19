/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — LE RACCORDEMENT DES ACCÈS ÉPHÉMÈRES (table de marque)
 *  IMPL-RACCORDEMENT-ACCES-SCORES-DR-5R · adapté par CORR-SURFACE-HTML-ACCES-SCORES-DR-5S
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/raccordement-acces-scores-dr-5r.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *
 *  ⭐ IL EXÉCUTE LE CODE RÉEL : js/commun.js, js/api.js, js/vendor/qrcode.js, `ecrireAdmin` (admin.js),
 *  js/admin-infos-publication.js, js/saisie.js et js/saisie-protegee.js, sur un DOM doublé, un faux
 *  serveur (domaine réservé) et des dialogues scriptés. ⛔ Rien n'est recopié.
 *
 *  CE QU'IL PROUVE :
 *    § 1 — `saisie.html` est une page FERMÉE : ni script, ni formulaire, ni donnée ;
 *    § 2 — l'administration : l'état vient du serveur, seuls les gestes permis sont proposés, le lien
 *          et le QR n'apparaissent que s'ils sont rendus, rotation / pause / clôture / correction
 *          exigent une confirmation, rien ne change d'état tout seul ;
 *    § 3 — la saisie protégée : aucune donnée avant jeton + clé, plus jamais getAll ni
 *          getCapacitesCategories, jeton en mémoire seulement, clé rangée après réussite, aucun
 *          renvoi automatique, `requete_id` + `version_lue`, SCORE_MODIFIE rechargé, fermeture ;
 *    § 4 — 5S : le lien vient de la passerelle séparée configurée côté serveur ; sans elle, l'écran reste
 *          fermé et le dit clairement ; le navigateur ne fabrique aucun lien ; aucun pont d'appel serveur ;
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
const CLE_ADMIN_FICTIVE = 'CLE-ADMIN-FICTIVE-5R-front-jamais-reelle';
const CLE_SCORES_FICTIVE = 'CLE-SCORES-FICTIVE-5R-front-jamais-reelle';
const JETON_FICTIF = '0123456789abcdef'.repeat(4);
const LIEN_FICTIF = 'https://exemple.invalid/macros/s/PASSERELLE-FICTIVE/exec?jeton=' + JETON_FICTIF;   // format 5S

let reussis = 0;
const echecs = [];
const masquer = (s) => String(s).replace(/[0-9a-f]{64}/g, '<jeton>');
function verifier(num, libelle, condition, detail) {
  if (condition) { reussis++; console.log('  ✅ ' + num + ' — ' + libelle); return; }
  const d = detail === undefined ? '' : masquer(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300);
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
/*  DOUBLURES                                                                 */
/* ========================================================================== */

function fabriquerDom() {
  const tous = [];
  function simple(el, comp) {
    if (/:checked/.test(comp) || /\^=/.test(comp)) return false;
    const m = /^([a-z]*)((?:#[\w-]+)?)((?:\.[\w-]+)*)((?:\[[\w-]+\])*)$/i.exec(comp);
    if (!m) throw new Error('HARNAIS : sélecteur non pris en charge « ' + comp + ' »');
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && el.id !== m[2].slice(1)) return false;
    if (m[3] && !m[3].split('.').filter(Boolean).every((c) => el.classList.contains(c))) return false;
    if (m[4] && !(m[4].match(/[\w-]+/g) || []).every((a) => el.hasAttribute(a))) return false;
    return true;
  }
  function correspond(el, sel) {
    return sel.split(',').some((partie) => {
      const chaine = partie.trim().split(/\s+/);
      if (!simple(el, chaine[chaine.length - 1])) return false;
      let n = el.parent;
      for (let i = chaine.length - 2; i >= 0; i--) {
        while (n && !simple(n, chaine[i])) n = n.parent;
        if (!n) return false;
        n = n.parent;
      }
      return true;
    });
  }
  function creer(tag) {
    const classes = new Set();
    const attributs = {};
    const ecouteurs = {};
    const el = {
      tagName: String(tag).toUpperCase(), id: '', enfants: [], parent: null, textContent: '', innerHTML: '',
      value: '', hidden: false, disabled: false, href: '', type: '', injections: [], ecouteurs: ecouteurs,
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
      insertAdjacentHTML(pos, html) {
        if (/^\s*<svg/i.test(html)) { const s = creer('svg'); s.html = html; s.parent = el; el.enfants.unshift(s); }
        else el.injections.push(html);
      }
    };
    Object.defineProperty(el, 'className', {
      get: () => Array.from(classes).join(' '),
      set: (v) => { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); }
    });
    tous.push(el);
    return el;
  }
  const body = creer('body');
  const ecouteursDoc = {};
  const attache = (e) => { for (let n = e; n; n = n.parent) if (n === body) return true; return false; };
  const document = {
    body: body,
    createElement: creer,
    getElementById: (id) => tous.find((e) => e.id === id && attache(e)) || null,
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    querySelector: (sel) => body.querySelector(sel),
    addEventListener: (t, fn) => { (ecouteursDoc[t] = ecouteursDoc[t] || []).push(fn); },
    ecouteurs: ecouteursDoc
  };
  const ajouter = (id, tag, parent) => { const e = creer(tag || 'div'); e.id = id; (parent || body).appendChild(e); return e; };
  return { document, creer, ajouter };
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

/**
 * Un contexte de page : faux serveur (réponses scriptées), dialogues scriptés, stockages espions.
 * `serveur(corps, requete)` rend un objet (réponse JSON) ou une Error (panne réseau).
 */
function contexte(options) {
  const o = options || {};
  const dom = fabriquerDom();
  const requetes = [];
  const dialogues = [];
  const reponses = (o.dialogues || []).slice();
  const journalStockage = [];
  const historiqueAdresse = [];
  const qrDonnees = [];
  let uuid = 0;
  const ctx = {
    document: dom.document,
    console: { log() {}, warn() {}, error() {} },
    sessionStorage: memoire('session', o.session, journalStockage),
    localStorage: memoire('local', o.local, journalStockage),
    crypto: { randomUUID: () => 'uuid-fictif-' + (++uuid) },
    google: { script: { history: { replace: (etat, params) => historiqueAdresse.push(params) } } },
    fetch: (url, init) => {
      const methode = (init && init.method) || 'GET';
      const corps = init && init.body ? JSON.parse(init.body) : { action: new URL(url).searchParams.get('action') };
      const r = { methode: methode, corps: corps };
      requetes.push(r);
      const rep = o.serveur ? o.serveur(corps, requetes.length) : new Error('réseau interdit');
      if (rep instanceof Error) return Promise.reject(rep);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(rep))) });
    },
    dialogConfirmer: (m, opt) => { dialogues.push({ type: 'confirmer', message: m, opt: opt || {} }); return Promise.resolve(reponses.length ? reponses.shift() : false); },
    dialogDemander: (m, d, opt) => { dialogues.push({ type: 'demander', message: m, opt: opt || {} }); return Promise.resolve(reponses.length ? reponses.shift() : null); },
    dialogAlerter: (m) => { dialogues.push({ type: 'alerter', message: m }); return Promise.resolve(); }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext('var API_URL = ' + JSON.stringify(API_URL_FICTIVE) + ';', ctx);
  vm.runInContext(lire('js/commun.js'), ctx, { filename: 'js/commun.js' });
  vm.runInContext(lire('js/api.js'), ctx, { filename: 'js/api.js' });
  return { ctx, dom, requetes, dialogues, reponses, journalStockage, historiqueAdresse, qrDonnees,
    el: (id) => dom.document.getElementById(id),
    actions: () => requetes.map((r) => r.corps.action) };
}

/* ========================================================================== */
/*  § 1 — saisie.html EST UNE PAGE FERMÉE                                      */
/* ========================================================================== */

function section1() {
  titre('§ 1 — `saisie.html` N\'EST PLUS UNE PAGE FONCTIONNELLE');
  const html = lire('saisie.html');
  const code = html.replace(/<!--[\s\S]*?-->/g, '');
  verifier('1.1', 'aucun script : ni saisie.js, ni api.js, ni config.js', !/<script/i.test(code));
  verifier('1.2', 'aucun formulaire, champ, bouton ni zone de matchs', !/<(form|input|button|select|textarea)\b/i.test(code) &&
    code.indexOf('liste-matchs') === -1);
  verifier('1.3', 'aucune ressource d\'un tiers (ni police distante, ni adresse http)', !/https?:\/\//i.test(code));
  verifier('1.4', 'la page dit clairement que l\'adresse ne donne plus accès, et où trouver le bon lien',
    /ne donne plus accès à la saisie/.test(code) && /lien/.test(code) && /QR code/.test(code) && /clé scores/.test(code));
  verifier('1.5', 'politique no-referrer posée', /<meta name="referrer" content="no-referrer">/.test(code));

  const saisie = sansCommentaires(lire('js/saisie.js'));
  verifier('1.6', 'saisie.js : les quatre crochets ne s\'activent QUE si saisie-protegee.js est chargé',
    /if \(typeof initSaisieProtegee === 'function'\) return initSaisieProtegee\(\);/.test(saisie) &&
    /if \(typeof rafraichirSaisieProtegee === 'function'\) return rafraichirSaisieProtegee\(\);/.test(saisie) &&
    /typeof confirmerCleCorrectionProtegee === 'function'/.test(saisie) &&
    /if \(typeof envoyerScoreProtege === 'function'\) return envoyerScoreProtege\(data\);/.test(saisie));
  verifier('1.7', 'saisie.js : après une réussite, la version du match RÉELLEMENT écrit devient la version lue',
    /if \(res\.version_apres\) m\.version_lue = res\.version_apres;/.test(saisie));
  const protegee = sansCommentaires(lire('js/saisie-protegee.js'));
  verifier('1.8', 'saisie-protegee.js : ni localStorage, ni minuterie (donc aucun renvoi différé), ni getAll, ni getCapacitesCategories',
    !/localStorage|setTimeout|setInterval|getAll|getCapacitesCategories/.test(protegee));
  verifier('1.9', 'saisie-protegee.js : un seul appel d\'écriture, et c\'est enregistrerScore', (protegee.match(/apiPost\(/g) || []).length === 2 &&
    /apiPost\('enregistrerScore'/.test(protegee) && /apiPost\('getSaisieScores'/.test(protegee));
  ['js/saisie.js', 'js/saisie-protegee.js', 'js/admin-infos-publication.js', 'js/admin.js'].forEach((f, i) => {
    let ok = true;
    try { new vm.Script(lire(f), { filename: f }); } catch (e) { ok = false; }
    verifier('1.' + (10 + i), f + ' : syntaxe valide', ok);
  });
}

/* ========================================================================== */
/*  § 2 — L'ADMINISTRATION                                                     */
/* ========================================================================== */

const BASE_ETAT = { ok: true, disponible: true, edition_id: 'edition-fictive', rotations: 0,
  fin: { suggestion: 'AUCUNE', motif: 'categories_incompletes', en_cause: ['U10'], suite_generable: false },
  gel: { decision: 'CONFIRMATION_REQUISE', gel_manuel_possible: true },
  cloture: { decision: 'CONFIRMATION_RENFORCEE', cloture_possible: true } };
const ETATS = {
  ABSENT: Object.assign({}, BASE_ETAT, { etat: 'ABSENT', version: 0, actions_possibles: ['PREPARER'] }),
  PREPARE: Object.assign({}, BASE_ETAT, { etat: 'PREPARE', version: 1, actions_possibles: ['OUVRIR', 'CLOTURER', 'ROTATION'], lien: LIEN_FICTIF }),
  OUVERT: Object.assign({}, BASE_ETAT, { etat: 'OUVERT', version: 2, actions_possibles: ['FIGER', 'CLOTURER', 'ROTATION'], lien: LIEN_FICTIF }),
  FIGE: Object.assign({}, BASE_ETAT, { etat: 'FIGE', version: 3, actions_possibles: ['REPRENDRE', 'CLOTURER', 'ROTATION'], lien: LIEN_FICTIF }),
  CLOTURE: Object.assign({}, BASE_ETAT, { etat: 'CLOTURE', version: 4, actions_possibles: [] })
};

function bancAdmin(options) {
  const o = options || {};
  const b = contexte({ serveur: o.serveur, dialogues: o.dialogues, session: o.sansCle ? {} : { r92_cle_admin: CLE_ADMIN_FICTIVE } });
  const d = b.dom;
  const bloc5r = d.ajouter('acces-saisie');
  ['acces-saisie-etat', 'acces-saisie-avertissement', 'acces-saisie-actions', 'acces-saisie-actions-suite',
   'message-acces-saisie',
   'bouton-litige-charger', 'bouton-litige-corriger', 'litige-match', 'litige-formulaire', 'litige-lib-a', 'litige-lib-b',
   'litige-score-a', 'litige-score-b', 'litige-motif', 'message-litige'].forEach((id) => d.ajouter(id, id === 'litige-match' ? 'select' : 'div', bloc5r));
  const lien = d.ajouter('acces-saisie-lien', 'a', bloc5r);
  lien.href = '#';
  lien.hidden = true;
  const corps = d.ajouter('acces-saisie-corps', 'div', bloc5r);
  corps.hidden = true;
  const cloture = d.ajouter('acces-saisie-cloture', 'button', corps);
  cloture.hidden = true;
  cloture.textContent = 'Clôturer définitivement';
  cloture.setAttribute('data-geste-acces', 'CLOTURER');
  d.ajouter('acces-saisie-qr', 'div', corps);
  d.ajouter('bouton-copier-qr-saisie', 'button', corps);
  vm.runInContext(lire('js/vendor/qrcode.js'), b.ctx, { filename: 'js/vendor/qrcode.js' });
  b.ctx.__espionQr = (v) => b.qrDonnees.push(String(v));
  vm.runInContext('var __qrReel = qrcode; qrcode = function (t, n) { var q = __qrReel(t, n); var a = q.addData; ' +
    'q.addData = function (v) { __espionQr(v); return a.apply(q, arguments); }; return q; };', b.ctx);
  vm.runInContext(bloc(lire('js/admin.js'), 'async function ecrireAdmin('), b.ctx, { filename: 'js/admin.js (ecrireAdmin)' });
  vm.runInContext(o.sourcePub || lire('js/admin-infos-publication.js'), b.ctx, { filename: 'js/admin-infos-publication.js' });
  b.gestes = () => bloc5r.querySelectorAll('[data-geste-acces]');
  return b;
}

function serveurAdmin(etat, extra) {
  const e = extra || {};
  return (corps) => {
    if (corps.cle !== CLE_ADMIN_FICTIVE) return { error: 'Clé incorrecte.', acces_refuse: true };
    if (corps.action === 'getAccesScoresAdmin') return ETATS[etat];
    if (corps.action === 'creerConfirmationAccesScores') return { ok: true, confirmation_id: 'conf-fictive-1', transition: corps.transition };
    if (corps.action === 'changerAccesScores') return { ok: true, etat: 'OUVERT', version: 9 };
    if (corps.action === 'getMatchsLitige') return { ok: true, matchs: [{ id_match: 'M1', categorie: 'U10', nom_A: 'Alpha', nom_B: 'Bravo', score_A: 2, score_B: 2, statut: 'terminé', version_lue: 'version-litige-fictive' }] };
    if (corps.action === 'corrigerScoreLitige') return e.corriger ? e.corriger(corps) : { ok: true, acces_inchange: true };
    return { error: 'Action inattendue dans le banc : ' + corps.action };
  };
}

async function section2() {
  titre('§ 2 — L\'ADMINISTRATION : L\'ÉTAT VIENT DU SERVEUR, CHAQUE GESTE EST EXPLICITE');

  const b0 = bancAdmin({ serveur: serveurAdmin('OUVERT') });
  b0.ctx.majAccesSaisie();
  verifier('2.1', 'à l\'ouverture : aucune requête, aucun dialogue, gestes branchés, état « connecte-toi »',
    b0.requetes.length === 0 && b0.dialogues.length === 0 && (b0.el('acces-saisie-actions').ecouteurs.click || []).length === 1 &&
    /Connecte-toi/.test(b0.el('acces-saisie-etat').textContent));
  const sansCle = bancAdmin({ sansCle: true, serveur: serveurAdmin('OUVERT') });
  await sansCle.ctx.chargerAccesScores();
  verifier('2.2', 'sans clé admin rangée : aucune requête et JAMAIS de fenêtre de clé ouverte spontanément',
    sansCle.requetes.length === 0 && sansCle.dialogues.length === 0);

  const LIBELLES = { ABSENT: /Aucun accès/, PREPARE: /Préparé/, OUVERT: /Ouvert/, FIGE: /En pause/, CLOTURE: /Clôturé/ };
  const GESTES = { PREPARER: 'Préparer le lien', OUVRIR: 'Ouvrir la saisie', FIGER: 'Mettre en pause',
    REPRENDRE: 'Reprendre la saisie', ROTATION: 'Renouveler le lien', CLOTURER: 'Clôturer définitivement' };
  for (const [i, etat] of Object.keys(ETATS).entries()) {
    const b = bancAdmin({ serveur: serveurAdmin(etat) });
    b.ctx.majAccesSaisie();
    await b.ctx.chargerAccesScores();
    const boutons = b.gestes().filter((x) => !x.hidden);
    const gestes = boutons.map((x) => x.getAttribute('data-geste-acces')).sort();
    const attendus = ETATS[etat].actions_possibles.slice().sort();
    const avecLien = !!ETATS[etat].lien;
    verifier('2.3.' + (i + 1), etat + ' : libellé clair, SEULS les gestes permis, lien et QR seulement s\'ils sont rendus',
      LIBELLES[etat].test(b.el('acces-saisie-etat').textContent) && JSON.stringify(gestes) === JSON.stringify(attendus) &&
      boutons.every((x) => x.textContent === GESTES[x.getAttribute('data-geste-acces')]) &&
      b.el('acces-saisie-corps').hidden === !avecLien && (avecLien ? b.qrDonnees[0] === LIEN_FICTIF && b.el('acces-saisie-lien').href === LIEN_FICTIF
        : b.qrDonnees.length === 0 && b.el('acces-saisie-lien').href === '#') &&
      JSON.stringify(b.actions()) === '["getAccesScoresAdmin"]' && b.dialogues.length === 0,
      { etiquette: b.el('acces-saisie-etat').textContent, gestes: gestes, actions: b.actions() });
  }
  const bO = bancAdmin({ serveur: serveurAdmin('OUVERT') });
  await bO.ctx.chargerAccesScores();
  verifier('2.4', 'l\'avertissement du calcul de fin est affiché, et la pause reste proposée',
    /matchs ne sont pas terminés/.test(bO.el('acces-saisie-avertissement').textContent) &&
    bO.gestes().some((x) => !x.hidden && x.getAttribute('data-geste-acces') === 'FIGER'));
  verifier('2.5', 'ni le lien, ni le QR, ni l\'écran ne portent la clé admin ou scores',
    [bO.el('acces-saisie-lien').href, bO.qrDonnees.join(' ')].join(' ')
      .indexOf('CLE-') === -1);
  const indispo = bancAdmin({ serveur: (c) => (c.action === 'getAccesScoresAdmin'
    ? Object.assign({}, ETATS.OUVERT, { lien: undefined, lien_indisponible: true, lien_motif: 'RECUPERATION_IMPOSSIBLE' }) : {}) });
  await indispo.ctx.chargerAccesScores();
  verifier('2.6', 'lien non récupérable : pas de bouton d\'accès ni QR, la clôture reste disponible et l\'écran propose de renouveler',
    indispo.el('acces-saisie-corps').hidden === false && indispo.el('acces-saisie-lien').hidden === true &&
    indispo.el('acces-saisie-qr').hidden === true && !indispo.el('acces-saisie-cloture').hidden && indispo.qrDonnees.length === 0 &&
    /Renouvelle-le/.test(indispo.el('acces-saisie-avertissement').textContent));

  /* Les gestes et leurs confirmations. */
  async function geste(etat, action, dialogues, extra) {
    const b = bancAdmin({ serveur: serveurAdmin(etat, extra), dialogues: dialogues });
    await b.ctx.chargerAccesScores();
    const bouton = b.gestes().find((x) => !x.hidden && x.getAttribute('data-geste-acces') === action);
    await b.ctx.onClicGesteAccesScores({ target: bouton });
    return b;
  }
  const rotNon = await geste('OUVERT', 'ROTATION', [false]);
  verifier('2.7', 'ROTATION : confirmation explicite ; « Annuler » n\'envoie rien',
    rotNon.dialogues.length === 1 && rotNon.dialogues[0].opt.danger === true && /ne fonctionneront PLUS/.test(rotNon.dialogues[0].message) &&
    rotNon.actions().indexOf('changerAccesScores') === -1);
  const rotOui = await geste('OUVERT', 'ROTATION', [true]);
  const envoiRot = rotOui.requetes.find((r) => r.corps.action === 'changerAccesScores');
  verifier('2.8', 'ROTATION confirmée : UN envoi portant la version lue et un requete_id, puis relecture de l\'état',
    envoiRot && envoiRot.corps.transition === 'ROTATION' && envoiRot.corps.version_lue === '2' && /^adm-/.test(envoiRot.corps.requete_id) &&
    envoiRot.corps.cle === CLE_ADMIN_FICTIVE && JSON.stringify(rotOui.actions()) === '["getAccesScoresAdmin","changerAccesScores","getAccesScoresAdmin"]',
    rotOui.actions());
  let lecturesRotation404 = 0;
  const lienRenouvele = LIEN_FICTIF.replace(JETON_FICTIF, 'abcdef0123456789'.repeat(4));
  const rot404 = bancAdmin({ dialogues: [true], serveur: (c) => {
    if (c.action === 'getAccesScoresAdmin') {
      lecturesRotation404++;
      return lecturesRotation404 === 1 ? ETATS.OUVERT : Object.assign({}, ETATS.OUVERT,
        { version: 3, rotations: 1, lien: lienRenouvele });
    }
    if (c.action === 'changerAccesScores') return new Error('Le serveur a répondu avec une erreur (404).');
    return { error: 'Action inattendue : ' + c.action };
  } });
  await rot404.ctx.chargerAccesScores();
  await rot404.ctx.onClicGesteAccesScores({ target: rot404.gestes()
    .find((x) => !x.hidden && x.getAttribute('data-geste-acces') === 'ROTATION') });
  verifier('2.8.1', 'ROTATION appliquée mais réponse 404 perdue : aucune seconde écriture ; la relecture exacte confirme le nouveau lien et le QR',
    JSON.stringify(rot404.actions()) === '["getAccesScoresAdmin","changerAccesScores","getAccesScoresAdmin"]' &&
    /Lien et QR code renouvelés/.test(rot404.el('message-acces-saisie').textContent) &&
    rot404.el('acces-saisie-lien').href === lienRenouvele && rot404.qrDonnees.slice(-1)[0] === lienRenouvele,
    { actions: rot404.actions(), message: rot404.el('message-acces-saisie').textContent });
  const gelNon = await geste('OUVERT', 'FIGER', [false]);
  verifier('2.9', 'pause manuelle : confirmation explicite qui REPREND l\'avertissement ; « Annuler » n\'envoie rien',
    gelNon.dialogues.length === 1 && /ne confirme pas la fin/.test(gelNon.dialogues[0].message) &&
    /matchs ne sont pas terminés/.test(gelNon.dialogues[0].message) && gelNon.actions().length === 1);
  const gelOui = await geste('OUVERT', 'FIGER', [true]);
  const conf = gelOui.requetes.find((r) => r.corps.action === 'creerConfirmationAccesScores');
  const gel = gelOui.requetes.find((r) => r.corps.action === 'changerAccesScores');
  verifier('2.10', 'pause renforcée : la confirmation est créée CÔTÉ SERVEUR puis consommée, avec DEUX requete_id distincts',
    conf && gel && conf.corps.transition === 'FIGER' && gel.corps.confirmation_id === 'conf-fictive-1' &&
    conf.corps.requete_id !== gel.corps.requete_id && gelOui.requetes.indexOf(conf) < gelOui.requetes.indexOf(gel), gelOui.actions());
  const direct = bancAdmin({ dialogues: [true], serveur: (c) => (c.action === 'getAccesScoresAdmin'
    ? Object.assign({}, ETATS.OUVERT, { fin: { suggestion: 'GEL_POSSIBLE' }, gel: { decision: 'GEL_DIRECT' } })
    : serveurAdmin('OUVERT')(c)) });
  await direct.ctx.chargerAccesScores();
  await direct.ctx.onClicGesteAccesScores({ target: direct.gestes().find((x) => !x.hidden && x.getAttribute('data-geste-acces') === 'FIGER') });
  verifier('2.11', 'fin confirmée : la pause demande quand même un « oui », sans confirmation renforcée',
    direct.dialogues.length === 1 && direct.actions().indexOf('creerConfirmationAccesScores') === -1 &&
    !direct.requetes.find((r) => r.corps.action === 'changerAccesScores').corps.confirmation_id);
  const clo = await geste('OUVERT', 'CLOTURER', [true, true]);
  const envoiClo = clo.requetes.find((r) => r.corps.action === 'changerAccesScores');
  verifier('2.12', 'clôture : DEUX confirmations (définitive, puis renforcée), confirmation serveur, `confirme: true`',
    clo.dialogues.length === 2 && /DÉFINITIVEMENT/.test(clo.dialogues[0].message) && !!envoiClo &&
    clo.actions().indexOf('creerConfirmationAccesScores') !== -1 && envoiClo.corps.confirme === true &&
    envoiClo.corps.confirmation_id === 'conf-fictive-1');
  const cloNon = await geste('OUVERT', 'CLOTURER', [true, false]);
  verifier('2.13', 'clôture : refuser la confirmation renforcée n\'envoie rien', cloNon.actions().length === 1);
  const ouvrir = await geste('PREPARE', 'OUVRIR', []);
  verifier('2.14', 'OUVRIR : un clic, un envoi, aucune fenêtre', ouvrir.dialogues.length === 0 &&
    ouvrir.actions().filter((a) => a === 'changerAccesScores').length === 1);

  const masque = bancAdmin({ serveur: serveurAdmin('OUVERT') });
  await masque.ctx.chargerAccesScores();
  masque.ctx.masquerAccesScores();
  verifier('2.15', 'verrouiller la session retire le lien et le QR de l\'écran', masque.el('acces-saisie-corps').hidden === true &&
    masque.el('acces-saisie-lien').href === '#' && masque.el('acces-saisie-qr').querySelector('svg') === null);

  /* Correction de litige. */
  const lit = bancAdmin({ serveur: serveurAdmin('FIGE'), dialogues: [false, true] });
  await lit.ctx.chargerMatchsLitige(false);
  lit.el('litige-match').value = 'M1';
  lit.el('litige-score-a').value = '3';
  lit.el('litige-score-b').value = '2';
  await lit.ctx.onCorrigerScoreLitige();
  verifier('2.16', 'litige sans motif : message, aucune fenêtre, aucun envoi',
    /motif du litige est obligatoire/.test(lit.el('message-litige').textContent) && lit.dialogues.length === 0 &&
    lit.actions().indexOf('corrigerScoreLitige') === -1);
  lit.el('litige-motif').value = 'Litige fictif';
  await lit.ctx.onCorrigerScoreLitige();
  verifier('2.17', 'litige : « Annuler » à la confirmation n\'envoie rien', lit.dialogues.length === 1 &&
    lit.actions().indexOf('corrigerScoreLitige') === -1);
  await lit.ctx.onCorrigerScoreLitige();
  const envoiLit = lit.requetes.find((r) => r.corps.action === 'corrigerScoreLitige');
  verifier('2.18', 'litige confirmé : motif, `confirme`, version lue du match et requete_id envoyés — et l\'accès n\'est pas touché',
    envoiLit && envoiLit.corps.motif === 'Litige fictif' && envoiLit.corps.confirme === true &&
    envoiLit.corps.version_lue === 'version-litige-fictive' && /^adm-/.test(envoiLit.corps.requete_id) &&
    lit.actions().indexOf('changerAccesScores') === -1, envoiLit);
  const casc = bancAdmin({ dialogues: [true, true], serveur: serveurAdmin('FIGE', { corriger: (c) => (c.forcerCascade
    ? { ok: true } : { error: 'Ce résultat a déjà été propagé.', cascade_requise: true }) }) });
  await casc.ctx.chargerMatchsLitige(false);
  casc.el('litige-match').value = 'M1';
  casc.el('litige-score-a').value = '1';
  casc.el('litige-score-b').value = '5';
  casc.el('litige-motif').value = 'Inversion fictive';
  await casc.ctx.onCorrigerScoreLitige();
  const envois = casc.requetes.filter((r) => r.corps.action === 'corrigerScoreLitige');
  verifier('2.19', 'cascade : une SECONDE décision explicite, puis un envoi `forcerCascade` sous un NOUVEAU requete_id',
    casc.dialogues.length === 2 && envois.length === 2 && !envois[0].corps.forcerCascade && envois[1].corps.forcerCascade === true &&
    envois[0].corps.requete_id !== envois[1].corps.requete_id, envois.map((x) => x.corps));
}

/* ========================================================================== */
/*  § 3 — LA SAISIE PROTÉGÉE                                                   */
/* ========================================================================== */

const DONNEES = { ok: true, config: { global: {}, categories: [{ categorie: 'U10', presente: 'oui' }] },
  equipes: [{ id_equipe: 'E1', nom_equipe: 'Équipe fictive Alpha', categorie: 'U10', poule: 'A' },
            { id_equipe: 'E2', nom_equipe: 'Équipe fictive Bravo', categorie: 'U10', poule: 'A' }],
  poules: [], capacites: { categories: { U10: { tir_au_but: false } } },
  matchs: [{ id_match: 'M1', categorie: 'U10', poule: 'A', terrain: '1', heure_debut: '09:00', equipe_A: 'E1', equipe_B: 'E2',
             score_A: '', score_B: '', statut: 'à venir', phase: 'poule', version_lue: 'version-fictive-1' }] };

function bancSaisie(options) {
  const o = options || {};
  const b = contexte({ serveur: o.serveur, dialogues: o.dialogues, session: o.session });
  const d = b.dom;
  const contexteEl = d.ajouter('contexte-saisie');
  if (o.jeton !== null) contexteEl.setAttribute('data-jeton', o.jeton === undefined ? JETON_FICTIF : o.jeton);
  ['note-saisie', 'barre-saisie', 'maj-saisie', 'filtre-cat-saisie', 'filtre-terrain-saisie', 'liste-matchs']
    .forEach((id) => d.ajouter(id));
  d.ajouter('bouton-rafraichir-saisie', 'button');
  d.ajouter('select-cat-saisie', 'select');
  d.ajouter('select-terrain-saisie', 'select');
  vm.runInContext(lire('js/saisie.js'), b.ctx, { filename: 'js/saisie.js' });
  vm.runInContext(o.sourceProtegee || lire('js/saisie-protegee.js'), b.ctx, { filename: 'js/saisie-protegee.js' });
  b.global = (nom) => vm.runInContext(nom, b.ctx);
  return b;
}

function serveurSaisie(options) {
  const o = options || {};
  return (corps, n) => {
    if (o.panneA && o.panneA.indexOf(n) !== -1) return new Error('Failed to fetch (panne fictive)');
    if (corps.cle !== CLE_SCORES_FICTIVE) return { error: 'Clé incorrecte.', acces_refuse: true };
    if (o.ferme) return { error: 'Accès fermé ou invalide.', acces_ferme: true };
    if (corps.jeton !== JETON_FICTIF) return { error: 'Accès fermé ou invalide.', acces_ferme: true };
    if (corps.action === 'getSaisieScores') return o.donnees ? o.donnees(n) : DONNEES;
    if (corps.action === 'enregistrerScore') return o.ecrire ? o.ecrire(corps, n) : { ok: true, match: { id_match: corps.id_match,
      score_A: Number(corps.score_A), score_B: Number(corps.score_B), statut: 'terminé' }, detail: false, version_apres: 'version-fictive-2' };
    return { error: 'Action inattendue : ' + corps.action };
  };
}

async function section3() {
  titre('§ 3 — LA SAISIE PROTÉGÉE : JETON + CLÉ AVANT TOUTE DONNÉE, AUCUN RENVOI AUTOMATIQUE');

  const a = bancSaisie({ serveur: serveurSaisie(), dialogues: [null] });
  await a.global('initSaisie')();
  verifier('3.1', 'à l\'ouverture : AUCUNE requête avant la clé ; la clé est demandée en saisie masquée',
    a.requetes.length === 0 && a.dialogues.length === 1 && a.dialogues[0].opt.secret === true && /Accès de saisie des scores/.test(a.dialogues[0].message));
  verifier('3.2', 'le jeton est retiré du document et de la barre d\'adresse (remplacée SANS paramètre, 5S), et n\'entre dans AUCUN stockage',
    a.el('contexte-saisie').getAttribute('data-jeton') === null && JSON.stringify(a.historiqueAdresse) === '[{}]' &&
    JSON.stringify(a.ctx.localStorage.donnees).indexOf(JETON_FICTIF) === -1 && JSON.stringify(a.ctx.sessionStorage.donnees).indexOf(JETON_FICTIF) === -1);

  const b = bancSaisie({ serveur: serveurSaisie(), dialogues: [CLE_SCORES_FICTIVE] });
  await b.global('initSaisie')();
  verifier('3.3', 'clé saisie : UNE seule lecture, `getSaisieScores` en POST, avec clé ET jeton — jamais getAll ni getCapacitesCategories',
    b.requetes.length === 1 && b.requetes[0].methode === 'POST' && b.requetes[0].corps.action === 'getSaisieScores' &&
    b.requetes[0].corps.cle === CLE_SCORES_FICTIVE && b.requetes[0].corps.jeton === JETON_FICTIF &&
    !b.requetes.some((r) => r.methode === 'GET'), b.requetes.map((r) => r.methode + ' ' + r.corps.action));
  verifier('3.4', 'la clé est rangée dans la session APRÈS la réponse positive, et les matchs sont affichés',
    b.ctx.sessionStorage.donnees.r92_cle_scores === CLE_SCORES_FICTIVE && b.global('matchs').length === 1 &&
    /Alpha|M1|09:00/.test(b.el('liste-matchs').innerHTML));

  const c = bancSaisie({ serveur: serveurSaisie(), dialogues: ['CLE-FAUSSE-FICTIVE-refusee', CLE_SCORES_FICTIVE] });
  await c.global('initSaisie')();
  verifier('3.5', 'clé refusée : jamais rangée, redemandée ; la bonne clé ouvre ensuite',
    c.requetes.length === 2 && c.dialogues.filter((x) => x.type === 'demander').length === 2 &&
    c.journalStockage.indexOf('session:ecrit:r92_cle_scores') !== -1 && c.ctx.sessionStorage.donnees.r92_cle_scores === CLE_SCORES_FICTIVE &&
    c.dialogues.some((x) => x.type === 'alerter' && /Clé incorrecte/.test(x.message)));

  const p = bancSaisie({ serveur: serveurSaisie({ panneA: [1] }), dialogues: [CLE_SCORES_FICTIVE, false] });
  await p.global('initSaisie')();
  verifier('3.6', 'panne : rien n\'est rangé, un « Réessayer » EXPLICITE est proposé, et rien ne repart tout seul',
    p.requetes.length === 1 && !p.ctx.sessionStorage.donnees.r92_cle_scores &&
    p.dialogues.some((x) => x.type === 'confirmer' && x.opt.ok === 'Réessayer'));
  const p2 = bancSaisie({ serveur: serveurSaisie({ panneA: [1] }), dialogues: [CLE_SCORES_FICTIVE, true] });
  await p2.global('initSaisie')();
  verifier('3.7', '« Réessayer » revérifie la MÊME clé sans la redemander', p2.requetes.length === 2 &&
    p2.dialogues.filter((x) => x.type === 'demander').length === 1 && p2.requetes[1].corps.cle === CLE_SCORES_FICTIVE);

  const f = bancSaisie({ serveur: serveurSaisie({ ferme: true }), dialogues: [CLE_SCORES_FICTIVE] });
  await f.global('initSaisie')();
  verifier('3.8', 'accès fermé (gel, clôture, rotation) : interface fermée, jeton et clé oubliés, aucune donnée',
    /Accès fermé ou invalide/.test(f.el('liste-matchs').innerHTML) && f.global('saisieJeton') === '' &&
    f.global('saisieAccesFerme') === true && !f.ctx.sessionStorage.donnees.r92_cle_scores && f.el('barre-saisie').hidden === true &&
    f.global('matchs').length === 0);
  for (const [i, jeton] of [null, '', 'pas-un-jeton', JETON_FICTIF.toUpperCase()].entries()) {
    const x = bancSaisie({ jeton: jeton, serveur: serveurSaisie(), dialogues: [CLE_SCORES_FICTIVE] });
    await x.global('initSaisie')();
    verifier('3.9.' + (i + 1), 'jeton ' + (jeton === null ? 'absent' : 'invalide') + ' : fermeture immédiate, zéro requête, zéro fenêtre',
      x.requetes.length === 0 && x.dialogues.length === 0 && x.global('saisieAccesFerme') === true);
  }

  /* Envoi d'un score. */
  const e = bancSaisie({ serveur: serveurSaisie(), dialogues: [CLE_SCORES_FICTIVE] });
  await e.global('initSaisie')();
  const r1 = await e.global('envoyerScoreProtege')({ id_match: 'M1', modification: false, score_A: '3', score_B: '1' });
  const envoi = e.requetes[e.requetes.length - 1].corps;
  await e.global('envoyerScoreProtege')({ id_match: 'M1', modification: true, score_A: '4', score_B: '1' });
  const envoi2 = e.requetes[e.requetes.length - 1].corps;
  verifier('3.10', 'chaque envoi porte clé, jeton, la version lue du match et un requete_id NEUF',
    r1.ok === true && envoi.action === 'enregistrerScore' && envoi.cle === CLE_SCORES_FICTIVE && envoi.jeton === JETON_FICTIF &&
    envoi.version_lue === 'version-fictive-1' && /^tbl-/.test(envoi.requete_id) && envoi2.requete_id !== envoi.requete_id, [envoi, envoi2]);

  const pe = bancSaisie({ serveur: serveurSaisie({ panneA: [2] }), dialogues: [CLE_SCORES_FICTIVE] });
  await pe.global('initSaisie')();
  let leve = null;
  try { await pe.global('envoyerScoreProtege')({ id_match: 'M1', score_A: '3', score_B: '1' }); } catch (err) { leve = err; }
  verifier('3.11', 'panne pendant l\'envoi : l\'erreur remonte, et AUCUN renvoi automatique (un seul envoi)',
    leve && pe.requetes.filter((r) => r.corps.action === 'enregistrerScore').length === 1);

  const conflit = bancSaisie({ dialogues: [CLE_SCORES_FICTIVE], serveur: serveurSaisie({
    ecrire: () => ({ error: 'Ce match vient d\'être modifié.', refus: 'SCORE_MODIFIE', etat_actuel: { id_match: 'M1', score_A: '2', score_B: '0', termine: true } }),
    donnees: (n) => (n === 1 ? DONNEES : Object.assign({}, DONNEES, { matchs: [Object.assign({}, DONNEES.matchs[0],
      { score_A: '2', score_B: '0', statut: 'terminé', version_lue: 'version-fictive-autre-appareil' })] })) }) });
  await conflit.global('initSaisie')();
  let erreurConflit = null;
  try { await conflit.global('envoyerScoreProtege')({ id_match: 'M1', score_A: '3', score_B: '1' }); } catch (err) { erreurConflit = err; }
  verifier('3.12', 'SCORE_MODIFIE : message clair, rechargement (lecture) AVANT toute nouvelle saisie, et aucun renvoi',
    erreurConflit && /modifié depuis un autre appareil/.test(erreurConflit.message) &&
    JSON.stringify(conflit.actions()) === '["getSaisieScores","enregistrerScore","getSaisieScores"]' &&
    conflit.global('matchs')[0].version_lue === 'version-fictive-autre-appareil' &&
    conflit.dialogues.some((x) => x.type === 'alerter' && /modifié depuis un autre appareil/.test(x.message)), conflit.actions());

  const fermeEnvoi = bancSaisie({ dialogues: [CLE_SCORES_FICTIVE], serveur: serveurSaisie({
    ecrire: () => ({ error: 'Accès fermé ou invalide.', acces_ferme: true }) }) });
  await fermeEnvoi.global('initSaisie')();
  try { await fermeEnvoi.global('envoyerScoreProtege')({ id_match: 'M1', score_A: '3', score_B: '1' }); } catch (err) { /* attendu */ }
  verifier('3.13', 'accès fermé pendant la saisie : interface fermée, jeton et clé oubliés',
    fermeEnvoi.global('saisieAccesFerme') === true && fermeEnvoi.global('saisieJeton') === '' && !fermeEnvoi.ctx.sessionStorage.donnees.r92_cle_scores);

  /* Le VRAI écouteur « Valider » de saisie.js, sur une carte doublée. */
  const v = bancSaisie({ serveur: serveurSaisie(), dialogues: [CLE_SCORES_FICTIVE] });
  await v.global('initSaisie')();
  const dom = v.dom;
  const carte = dom.creer('div');
  carte.className = 'match';
  carte.setAttribute('data-id', 'M1');
  v.el('liste-matchs').appendChild(carte);
  const meta = dom.creer('div'); meta.className = 'match-meta'; carte.appendChild(meta);
  const saisieEl = dom.creer('div'); saisieEl.className = 'match-saisie'; carte.appendChild(saisieEl);
  ['3', '1'].forEach((val) => { const input = dom.creer('input'); input.className = 'r-input score'; input.value = val; saisieEl.appendChild(input); });
  const bouton = dom.creer('button'); bouton.className = 'bouton bouton-valider'; saisieEl.appendChild(bouton);
  const msg = dom.creer('div'); msg.className = 'message-form'; carte.appendChild(msg);
  await Promise.all((dom.document.ecouteurs.click || []).map((fn) => fn({ target: bouton })));
  const envoiEcouteur = v.requetes.filter((r) => r.corps.action === 'enregistrerScore');
  verifier('3.14', 'le vrai « Valider » passe par la saisie protégée, et la version lue devient `version_apres`',
    envoiEcouteur.length === 1 && envoiEcouteur[0].corps.version_lue === 'version-fictive-1' &&
    v.global('matchs')[0].version_lue === 'version-fictive-2' && /Score enregistré/.test(msg.textContent), { msg: msg.textContent });

  const r = bancSaisie({ serveur: serveurSaisie(), dialogues: [CLE_SCORES_FICTIVE] });
  await r.global('initSaisie')();
  await r.global('rafraichirSaisie')();
  verifier('3.15', '« Rafraîchir » relit par `getSaisieScores` (clé rangée, sans fenêtre), jamais par getAll',
    JSON.stringify(r.actions()) === '["getSaisieScores","getSaisieScores"]' && r.dialogues.length === 1 &&
    !r.requetes.some((q) => q.methode === 'GET'));
}

/* ========================================================================== */
/*  § 4 — 5S : LA PASSERELLE SÉPARÉE                                           */
/* ========================================================================== */

function serveurPasserelleNonConfiguree(c) {
  return c.action === 'getAccesScoresAdmin'
    ? Object.assign({}, ETATS.OUVERT, { lien: undefined, lien_indisponible: true, lien_motif: 'PASSERELLE_NON_CONFIGUREE' }) : {};
}

async function section4() {
  titre('§ 4 — 5S : LE LIEN VIENT DE LA PASSERELLE CONFIGURÉE CÔTÉ SERVEUR ; SANS ELLE, TOUT RESTE FERMÉ');

  const nc = bancAdmin({ serveur: serveurPasserelleNonConfiguree });
  await nc.ctx.chargerAccesScores();
  const avert = nc.el('acces-saisie-avertissement').textContent;
  verifier('4.1', 'passerelle non configurée : ni bouton d\'accès ni QR ; la clôture et les autres gestes restent disponibles',
    nc.el('acces-saisie-corps').hidden === false && nc.el('acces-saisie-qr').hidden === true &&
    nc.qrDonnees.length === 0 && nc.el('acces-saisie-lien').href === '#' && nc.el('acces-saisie-lien').hidden === true &&
    /Ouvert/.test(nc.el('acces-saisie-etat').textContent) &&
    nc.gestes().filter((x) => !x.hidden).length === ETATS.OUVERT.actions_possibles.length &&
    JSON.stringify(nc.actions()) === '["getAccesScoresAdmin"]' && nc.dialogues.length === 0);
  verifier('4.2', '… avec un message compréhensible : la page de saisie n\'est pas configurée, et renouveler n\'y changerait rien',
    /pas encore configurée/.test(avert) && /Renouveler le lien n'y changera rien/.test(avert) && !/Renouvelle-le/.test(avert), avert);

  const pub = sansCommentaires(lire('js/admin-infos-publication.js'));
  verifier('4.3', 'l\'administration ne FABRIQUE aucun lien : ni `?jeton=`, ni `route=`, ni `/exec`, ni adresse Apps Script — elle n\'affiche que `etat.lien`',
    !/\?jeton=|route=|\/exec\b|script\.google|macros\/s\//.test(pub) && /afficherLienAccesScores\(etat\.lien \|\| ''\);/.test(pub));
  const prot = sansCommentaires(lire('js/saisie-protegee.js'));
  verifier('4.4', 'saisie-protegee.js : aucun pont d\'appel serveur (`google.script.run`), aucune route, adresse remplacée sans paramètre',
    prot.indexOf('google.script.run') === -1 && !/route/.test(prot) && /google\.script\.history\.replace\(null, \{\}, ''\);/.test(prot));
  const b = bancAdmin({ serveur: serveurAdmin('OUVERT') });
  await b.ctx.chargerAccesScores();
  verifier('4.5', 'un lien de passerelle rendu par le serveur est affiché tel quel et encodé tel quel dans le QR',
    b.el('acces-saisie-lien').href === LIEN_FICTIF && b.qrDonnees[0] === LIEN_FICTIF &&
    /^https:\/\/exemple\.invalid\/macros\/s\/PASSERELLE-FICTIVE\/exec\?jeton=[0-9a-f]{64}$/.test(LIEN_FICTIF));
}

/* ========================================================================== */
/*  § Z — LES CONTRÔLES SAVENT ÉCHOUER                                         */
/* ========================================================================== */

async function sectionZ() {
  titre('§ Z — AUTO-PREUVE : QUATRE MUTANTS DOIVENT ÊTRE VUS');
  const source = lire('js/saisie-protegee.js');
  const muter = (avant, apres) => {
    if (source.indexOf(avant) === -1) throw new Error('Mutant inopérant : ' + avant);
    return source.split(avant).join(apres);
  };
  const MUT_AVANT = muter("      cle = saisie.trim();\n      if (!cle) { await dialogAlerter('Clé incorrecte. Réessaie.'); continue; }\n    }",
    "      cle = saisie.trim();\n      definirCleTable(cle);\n      if (!cle) { await dialogAlerter('Clé incorrecte. Réessaie.'); continue; }\n    }");
  const z1 = bancSaisie({ sourceProtegee: MUT_AVANT, serveur: serveurSaisie({ panneA: [1] }), dialogues: [CLE_SCORES_FICTIVE, false] });
  await z1.global('initSaisie')();
  verifier('Z.1', 'mutant « clé rangée avant la réponse » : le contrôle 3.6 le voit', MUT_AVANT !== source && z1.ctx.sessionStorage.donnees.r92_cle_scores === CLE_SCORES_FICTIVE);

  const MUT_RENVOI = muter("  try {\n    return await apiPost('enregistrerScore', corps);\n  } catch (err) {",
    "  try {\n    try { return await apiPost('enregistrerScore', corps); } catch (e1) { return await apiPost('enregistrerScore', corps); }\n  } catch (err) {");
  const z2 = bancSaisie({ sourceProtegee: MUT_RENVOI, serveur: serveurSaisie({ panneA: [2] }), dialogues: [CLE_SCORES_FICTIVE] });
  await z2.global('initSaisie')();
  try { await z2.global('envoyerScoreProtege')({ id_match: 'M1', score_A: '3', score_B: '1' }); } catch (err) { /* ignoré */ }
  verifier('Z.2', 'mutant « renvoi automatique » : le contrôle 3.11 le voit (deux envois)',
    z2.requetes.filter((q) => q.corps.action === 'enregistrerScore').length === 2);

  const MUT_JETON = muter("  saisieJeton = jeton;\n", "  saisieJeton = jeton;\n  try { sessionStorage.setItem('r92_jeton', jeton); } catch (e) {}\n");
  const z3 = bancSaisie({ sourceProtegee: MUT_JETON, serveur: serveurSaisie(), dialogues: [null] });
  await z3.global('initSaisie')();
  verifier('Z.3', 'mutant « jeton rangé en session » : le contrôle 3.2 le voit',
    JSON.stringify(z3.ctx.sessionStorage.donnees).indexOf(JETON_FICTIF) !== -1);

  const srcPub = lire('js/admin-infos-publication.js');
  const MOTIF = "(etat.lien_motif === 'PASSERELLE_NON_CONFIGUREE')";
  if (srcPub.indexOf(MOTIF) === -1) throw new Error('Mutant inopérant : ' + MOTIF);
  const z4 = bancAdmin({ sourcePub: srcPub.split(MOTIF).join('(false)'), serveur: serveurPasserelleNonConfiguree });
  await z4.ctx.chargerAccesScores();
  verifier('Z.4', 'mutant « message générique pour une passerelle non configurée » : le contrôle 4.2 le voit',
    /Renouvelle-le/.test(z4.el('acces-saisie-avertissement').textContent));
}

(async function () {
  process.exitCode = 1;
  try {
    section1();
    await section2();
    await section3();
    await section4();
    await sectionZ();
  } catch (e) {
    console.error('\nERREUR DU HARNAIS : ' + masquer((e && e.stack) || e));
    process.exit(1);
  }
  console.log('\n' + '─'.repeat(70));
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + ' contrôle(s) en défaut sur ' + (reussis + echecs.length) + ' :');
    echecs.forEach((x) => console.log('   · ' + x));
    process.exit(1);
  }
  console.log('OK — ' + reussis + ' contrôles passés.');
  process.exitCode = 0;
})();
