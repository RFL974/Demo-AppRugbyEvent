'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « APRÈS-MIDI » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par
 *  tests/ecran-apresmidi-surface.test.js et tests/ecran-apresmidi-zero-appel.test.js.
 *
 *  ⭐ Navigateur : les VRAIS modules (config, commun, dialog, api, admin, admin-generation) et les
 *     VRAIES cartes d'admin.html — `bloc-generation` et `bloc-apresmidi`, extraites telles quelles.
 *     ⚠️ `bloc-generation` appartient à l'écran « Poules & planning », déjà clôturé, et n'est pas
 *     modifié par ce lot : il est ici parce que l'écran « Après-midi » en DÉPEND réellement —
 *     `majDisponibilitePoules` ferme ses boutons et `afficherPlanning` écrit dans sa zone.
 *  ⭐ Serveur : le VRAI Code.gs dans les doublures du banc de coût (backend/tests/banc-cout), sur
 *     le tournoi fictif dont LE MATIN EST JOUÉ (monde-apresmidi.js) — sans quoi la génération
 *     serait refusée par son garde-fou et le banc ne mesurerait rien.
 *  ⭐ Transport RÉEL jusqu'au réseau : le vrai api.js ; seul `fetch` est simulé, et TOUTE porte de
 *     sortie réseau est comptée (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource).
 *
 *  ⭐ Référence « avant » FIGÉE — celle qui close le lot « Partenaires », lue dans git,
 *     ⛔ jamais `HEAD` : frontend 166f5285b1d5ffdc263af30c73203673d45f7238 ·
 *     backend 3e5f29e81944137c89c188170ddca050c0aad0ed.
 *  ⛔ Aucun réseau, aucun service Google réel, aucune donnée réelle.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const BC = require('./banc-ecran-categories');

const RACINE = BC.RACINE;
const BACKEND = BC.BACKEND;
const CLE_ADMIN = BC.CLE_ADMIN;
const { chargerBanc } = require(path.join(BACKEND, 'tests', 'banc-cout', 'instrumentation'));
const { completerPourPartenaires } =
  require(path.join(BACKEND, 'tests', 'banc-cout', 'instrumentation-partenaires'));
const MA = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-apresmidi'));

/* ⛔ Références FIGÉES d'avant le lot « Après-midi » — jamais HEAD, jamais un hash abrégé. */
const FRONTEND_AVANT_REV = '166f5285b1d5ffdc263af30c73203673d45f7238';
const BACKEND_AVANT_REV = '3e5f29e81944137c89c188170ddca050c0aad0ed';
const git = (depot, rev, fichier) =>
  execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
const lecteur = (racine) => (f) => fs.readFileSync(path.join(racine || RACINE, f), 'utf8');
const LECTEUR_AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, f);

/** Les modules chargés par admin.html dont l'écran dépend, dans SON ordre.
 *  ⛔ Les modules absents (feuille de journée, tableau de bord, réglages…) ne sont PAS remplacés
 *    par des doublures : `rafraichirPoulesDepuis` les appelle sous `typeof === 'function'`, donc
 *    leur absence est le comportement RÉEL d'une page qui ne les aurait pas chargés. En simuler
 *    reviendrait à tester des doublures. */
const MODULES = ['js/config.js', 'js/commun.js', 'js/dialog.js', 'js/api.js', 'js/admin.js',
                 'js/admin-generation.js'];

/** ⭐ LES LIAISONS DE L'ÉCRAN, mot pour mot celles de `brancherEcouteursAdmin` (js/admin.js).
 *  ⛔ Toute divergence est un ÉCHEC de `ecran-apresmidi-surface`, pas une adaptation du banc. */
const LIAISONS_ECRAN = [
  "ecouter('bouton-generer', 'click', onGenerer);",
  "ecouter('bouton-simuler-scores-matin', 'click', onSimulerScoresMatin);",
  "ecouter('bouton-recalculer-horaires', 'click', onRecalculerHoraires);",
  "ecouter('bouton-modifier-poules', 'click', onModifierPoules);",
  "ecouter('edition-poules', 'click', onClicEditionPoules);",
  "ecouter('arbitrages', 'click', onClicArbitrage);",
  "ecouter('bouton-apresmidi', 'click', onGenererApresMidi);",
  "ecouter('bouton-simuler-scores-apresmidi', 'click', onSimulerScoresApresMidi);",
  "ecouter('bouton-dimanche-scf', 'click', onGenererDimancheScf);"
];

/** Les deux cartes de l'écran, extraites d'admin.html telles qu'elles y sont écrites. */
function cartesApresMidi(html) {
  const ids = ['bloc-generation', 'bloc-apresmidi'];
  return ids.map((id) => {
    const ancre = html.indexOf('id="' + id + '"');
    if (ancre === -1) throw new Error('carte introuvable : ' + id);
    /* ⛔ `lastIndexOf` ET PAS une recherche EN AVANT depuis « l'ancre moins 400 ». `bloc-terrains`
       se termine CINQ lignes avant `bloc-generation` : une recherche en avant attrapait la
       balise ouvrante de la carte PRÉCÉDENTE et embarquait tout son contenu — la zone terrains
       se retrouvait dans le banc, et le contrôle A2 se mettait à parler d'écouteurs qui
       n'appartiennent pas à cet écran. La balise cherchée est la DERNIÈRE avant l'ancre. */
    const debut = html.lastIndexOf('<section class="carte', ancre);
    if (debut === -1) throw new Error('balise de carte introuvable : ' + id);
    const fin = html.indexOf('</section>', ancre);
    return html.slice(debut, fin + 10);
  }).join('\n') +
    '<div id="ecran-chargement-attente" hidden></div><div id="ecran-chargement-erreur" hidden></div>' +
    '<div id="ecran-chargement-message"></div>';
}

/**
 * Le serveur : le vrai Code.gs sur le tournoi fictif au matin JOUÉ, instrumenté finement.
 * @param {string} source  le texte de Code.gs
 * @param {object} [opt]   passé à `peuplerApresMidi` (ex. `{ matinIncomplet: true }`)
 */
function serveur(source, opt) {
  const m = completerPourPartenaires(chargerBanc(source, (w) => MA.peuplerApresMidi(w, opt || {})));
  m.matin = () => MA.matchsMatin(m);
  m.aprem = () => MA.matchsAprem(m);
  m.empreinteMatin = () => MA.empreinte(MA.matchsMatin(m));
  m.empreinteAprem = () => MA.empreinte(MA.matchsAprem(m));
  m.scorerApresMidi = (n) => MA.saisirScoresApresMidi(m, n);
  return m;
}

/** Pose un score sur TOUS les matchs d'après-midi déjà générés (table de marque simulée). */
function scorerToutApresMidi(srv) {
  const o = srv.classeur.getSheetByName('Matchs');
  const v = o.getDataRange().getValues(), e = v[0];
  const p = e.indexOf('phase'), a = e.indexOf('score_A'), b = e.indexOf('score_B'), s = e.indexOf('statut');
  let n = 0;
  for (let l = 1; l < v.length; l++) {
    if (String(v[l][p]) !== 'classement') continue;
    v[l][a] = 10 + n; v[l][b] = n; v[l][s] = 'terminé'; n++;
  }
  o.getRange(1, 1, v.length, e.length).setValues(v);
  return n;
}

/** Inverse les scores du MATIN d'une catégorie : le classement bascule, donc le tableau de
 *  l'après-midi change — c'est le geste que la page recommande (« corriger un score du matin »). */
function inverserMatin(srv, categorie) {
  const o = srv.classeur.getSheetByName('Matchs');
  const v = o.getDataRange().getValues(), e = v[0];
  const p = e.indexOf('phase'), c = e.indexOf('categorie'),
        a = e.indexOf('score_A'), b = e.indexOf('score_B');
  for (let l = 1; l < v.length; l++) {
    if (String(v[l][p]) === 'classement' || String(v[l][c]) !== categorie) continue;
    const x = v[l][a]; v[l][a] = v[l][b]; v[l][b] = x;
  }
  o.getRange(1, 1, v.length, e.length).setValues(v);
}

/**
 * Le navigateur : vrais modules, vraies cartes, `fetch` simulé vers le vrai backend.
 * @param {object} srv      un `serveur(...)`
 * @param {function} lireJs lecteur de fichiers du frontend (courant ou figé)
 * @param {object} [options] { dialogues: [], pannes: {action: 'silence'|'reseau'|'perdue'}, cle }
 */
function navigateur(srv, lireJs, options) {
  const o = options || {};
  const doc = BC.creerDocument();

  /* ⭐ DE VRAIS ÉCOUTEURS — même raison qu'au banc « Partenaires » : les gestes doivent passer
     par les écouteurs que `brancherEvenements` pose vraiment, sinon un test « zéro appel » ne
     prouverait rien. Le prototype est complété une seule fois, avec bouillonnement. */
  (function poserEvenements() {
    const proto = Object.getPrototypeOf(doc.createElement('div'));
    if (proto.__evenements) return;
    proto.__evenements = true;
    proto.addEventListener = function (type, fn) {
      if (!this.__ev) this.__ev = {};
      (this.__ev[type] = this.__ev[type] || []).push(fn);
    };
    proto.scrollIntoView = function () {};
    proto.click = function () { this.dispatchEvent({ type: 'click' }); };
    proto.removeEventListener = function (type, fn) {
      if (!this.__ev || !this.__ev[type]) return;
      this.__ev[type] = this.__ev[type].filter((f) => f !== fn);
    };
    proto.dispatchEvent = function (brut) {
      const ev = Object.assign({ target: this, key: '', preventDefault() {}, stopPropagation() {} }, brut || {});
      let n = this;
      while (n && n.tag) {
        ((n.__ev || {})[ev.type] || []).slice().forEach((fn) => fn.call(n, ev));
        n = n.parentNode;
      }
      ((doc.__ev || {})[ev.type] || []).slice().forEach((fn) => fn.call(doc, ev));
      return true;
    };
  })();
  doc.addEventListener = function (type, fn) {
    if (!doc.__ev) doc.__ev = {};
    (doc.__ev[type] = doc.__ev[type] || []).push(fn);
  };
  (function poserStyle() {
    const proto = Object.getPrototypeOf(doc.createElement('div'));
    if (proto.__style) return;
    proto.__style = true;
    Object.defineProperty(proto, 'style', {
      configurable: true,
      get() {
        if (!this.__styleObj) {
          const magasin = {};
          this.__styleObj = { setProperty: (k, v) => { magasin[k] = v; },
            getPropertyValue: (k) => magasin[k] || '', removeProperty: (k) => { delete magasin[k]; } };
        }
        return this.__styleObj;
      }
    });
  })();

  const journal = [];     // une entrée par requête métier reçue par le serveur
  const corps = [];       // le corps COMPLET de chaque requête POST (pour lire les confirmations)
  const sorties = [];     // TOUTE sortie réseau, au plus bas niveau
  const dialogues = [];   // questions posées à l'utilisateur
  const reponses = (o.dialogues || []).slice();
  doc.body.innerHTML = cartesApresMidi(lireJs('admin.html'));

  /* ⭐ LE TEMPS EST COMPRIMÉ : une milliseconde du frontend vaut une microseconde du banc. C'est
     ce qui rend le délai de 30 s de `DELAI_ECRITURE_POULES_MS` observable en quelques tours. */
  const minuterie = (fn, ms, ...args) =>
    setTimeout(fn, Math.max(0, Math.round((Number(ms) || 0) / 1000)), ...args);

  const fetchSimule = (adresse, reglages) => new Promise((resolve, reject) => {
    const r = reglages || {};
    sorties.push('fetch ' + String(adresse));
    /* ⭐ LE SIGNAL D'ABANDON EST HONORÉ, comme le ferait un vrai navigateur. ⛔ Sans cela, le
       délai de `DELAI_ECRITURE_POULES_MS` serait INOBSERVABLE : `api.js` pose bien son
       `AbortController`, mais rien ne l'écouterait, et un banc qui ignore le signal conclurait
       à tort que le délai ne borne rien. C'est la panne « silence » qui en dépend entièrement. */
    if (r.signal) {
      if (r.signal.aborted) {
        const e = new Error('The operation was aborted.'); e.name = 'AbortError';
        return reject(e);
      }
      r.signal.addEventListener('abort', () => {
        const e = new Error('The operation was aborted.'); e.name = 'AbortError';
        reject(e);
      }, { once: true });
    }
    const methode = r.method === 'POST' ? 'POST' : 'GET';
    let demande;
    try {
      demande = methode === 'POST' ? JSON.parse(r.body)
        : Object.fromEntries([...new URL(adresse).searchParams].filter(([k]) => k !== '_'));
    } catch (e) { demande = {}; }
    journal.push(demande.action);
    corps.push(demande);
    const panne = (o.pannes || {})[demande.action];
    if (panne === 'silence') return;                       // ⛔ ne se dénoue JAMAIS : délai attendu
    if (panne === 'reseau') { setTimeout(() => reject(new TypeError('Failed to fetch')), 0); return; }
    if (panne === 'perdue') {
      /* ⭐ LA REQUÊTE ABOUTIT CÔTÉ SERVEUR, la réponse n'arrive jamais au navigateur. C'est le
         seul moyen honnête d'éprouver ce que l'écran OSE dire après une réponse perdue. */
      try { methode === 'POST' ? srv.postMesure(demande, demande.action) : srv.getMesure(demande, demande.action); }
      catch (e) { /* le classeur garde ce qu'il a pu écrire */ }
      setTimeout(() => reject(new TypeError('Failed to fetch')), 0);
      return;
    }
    let sortie;
    try {
      sortie = methode === 'POST' ? srv.postMesure(demande, demande.action) : srv.getMesure(demande, demande.action);
    } catch (e) {
      setTimeout(() => resolve({ ok: false, status: 500, json: async () => ({ error: String(e.message) }) }), 0);
      return;
    }
    const texte = JSON.stringify(sortie.reponse);
    setTimeout(() => resolve({ ok: true, status: 200, json: async () => JSON.parse(texte) }), 0);
  });

  const ctx = {
    console: o.console || { log() {}, warn() {}, error() {} },
    document: doc,
    navigator: { onLine: true, sendBeacon: (u) => { sorties.push('sendBeacon ' + u); return true; } },
    location: { search: '', href: 'http://127.0.0.1/admin.html', origin: 'http://127.0.0.1',
                protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1' },
    setTimeout: minuterie, clearTimeout, setInterval: minuterie, clearInterval,
    Promise, JSON, Math, Date, String, Number, Object, Array, Boolean, RegExp, Error, TypeError, SyntaxError,
    URL, URLSearchParams, AbortController, performance, Blob: function () {}, isFinite, parseInt, parseFloat,
    fetch: fetchSimule,
    sessionStorage: (function () { const d = {}; return {
      getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } }; })(),
    localStorage: (function () { const d = {}; return {
      getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } }; })(),
    XMLHttpRequest: function () { sorties.push('XMLHttpRequest'); return { open() {}, send() {}, setRequestHeader() {} }; },
    WebSocket: function (u) { sorties.push('WebSocket ' + u); },
    EventSource: function (u) { sorties.push('EventSource ' + u); }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.window.open = (u) => { sorties.push('window.open ' + u); };
  ctx.window.addEventListener = () => {};
  vm.createContext(ctx);

  MODULES.forEach((f) => { vm.runInContext(lireJs(f), ctx, { filename: f }); });

  ctx.sessionStorage.setItem('r92_cle_admin', o.cle === undefined ? CLE_ADMIN : o.cle);
  ctx.dialogConfirmer = async (message, opts) => {
    dialogues.push({ message: String(message), opts: opts || {} });
    return reponses.length ? reponses.shift() : true;
  };
  ctx.dialogDemander = async () => (reponses.length ? reponses.shift() : CLE_ADMIN);
  vm.runInContext('dialogConfirmer = this.dialogConfirmer; dialogDemander = this.dialogDemander;', ctx);
  vm.runInContext('definirAdminConnecte(true);', ctx);

  const el = (id) => doc.getElementById(id);
  const tour = async (n) => { for (let i = 0; i < (n || 12); i++) await new Promise((r) => setTimeout(r, 0)); };

  /** Charge l'état du serveur dans la mémoire de l'écran, comme l'ouverture de la page le ferait. */
  async function amorcer() {
    const etat = srv.getMesure({ action: 'getAll' }, 'getAll').reponse;
    const cfg = srv.postMesure({ action: 'getConfigAdmin', cle: CLE_ADMIN }, 'getConfigAdmin').reponse;
    ctx.configCourante = cfg;
    ctx.equipesCourantes = etat.equipes;
    ctx.matchsCourants = etat.matchs || [];
    vm.runInContext('configCourante = this.configCourante; equipesCourantes = this.equipesCourantes;' +
      ' matchsCourants = this.matchsCourants;', ctx);
    /* ⭐ LES VRAIS ÉCOUTEURS, POSÉS PAR LE VRAI `ecouter`, sur les VRAIS gestionnaires.
       ⛔ `brancherEcouteursAdmin()` en entier n'est pas jouable ici : il référence les
         gestionnaires des neuf autres modules d'admin.html, que ce banc ne charge pas. Les
         déclarer en doublures reviendrait à tester des doublures. On pose donc EXACTEMENT les
         neuf lignes que ce lieur consacre aux deux cartes — et `ecran-apresmidi-surface`
         vérifie, ligne à ligne, que cette liste est bien celle d'`admin.js` : le banc ne peut
         pas dériver de la page sans qu'un contrôle tombe. */
    vm.runInContext(LIAISONS_ECRAN.join('\n'), ctx);
    vm.runInContext('majApresMidi();', ctx);
    await tour();
    journal.length = 0; corps.length = 0; sorties.length = 0;   // l'amorçage n'est pas un geste
  }

  return {
    ctx, doc, journal, corps, sorties, dialogues, el, tour, amorcer,
    requetes: () => journal.slice(),
    demandes: () => corps.slice(),
    texte: (id) => String((el(id) || {}).textContent || ''),
    clic: async (id, tours) => {
      const e = el(id);
      if (!e) throw new Error('bouton introuvable : ' + id);
      e.dispatchEvent({ type: 'click', target: e });
      await tour(tours);
    },
    /** Un clic qui ne rend PAS la main (délai en cours) : on laisse la promesse vivre. */
    clicSansAttendre: (id) => {
      const e = el(id);
      if (!e) throw new Error('bouton introuvable : ' + id);
      e.dispatchEvent({ type: 'click', target: e });
    }
  };
}

module.exports = { serveur, navigateur, cartesApresMidi, LIAISONS_ECRAN, lecteur, LECTEUR_AVANT, BACKEND_AVANT,
  scorerToutApresMidi, inverserMatin, FRONTEND_AVANT_REV, BACKEND_AVANT_REV,
  RACINE, BACKEND, CLE_ADMIN, MODULES, git, MA };
