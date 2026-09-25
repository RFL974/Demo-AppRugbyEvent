'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « PARTENAIRES » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par
 *  tests/ecran-partenaires-surface.test.js et tests/ecran-partenaires-zero-appel.test.js.
 *
 *  ⭐ Navigateur : les VRAIS modules (config, commun, dialog, api, admin, sponsors, admin-sponsors)
 *     et les VRAIES cartes d'admin.html — celles de l'écran, extraites telles quelles.
 *  ⭐ Serveur : le VRAI Code.gs dans les doublures du banc de coût (backend/tests/banc-cout), sur le
 *     tournoi fictif (monde-demo.js).
 *  ⭐ Transport RÉEL jusqu'au réseau : le vrai api.js ; seul `fetch` est simulé, et TOUTE porte de
 *     sortie réseau est comptée (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource, image).
 *
 *  ⭐ Référence « avant » FIGÉE — celle qui close le lot « Demande d'autorisation », lue dans git,
 *     ⛔ jamais `HEAD` : frontend e1a7f06db42307597d695af536ae3aaa5d69391d ·
 *     backend 6d561c1df19f847528a5117013878bc0017e9141.
 *  ⛔ Aucun réseau, aucun service Google réel.
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
const { completerPourPartenaires } = require(path.join(BACKEND, 'tests', 'banc-cout', 'instrumentation-partenaires'));
const MD = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-demo'));

/* ⛔ Références FIGÉES d'avant le lot « Partenaires » — jamais HEAD, jamais un hash abrégé. */
const FRONTEND_AVANT_REV = 'e1a7f06db42307597d695af536ae3aaa5d69391d';
const BACKEND_AVANT_REV = '6d561c1df19f847528a5117013878bc0017e9141';
const git = (depot, rev, fichier) =>
  execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
const lecteur = (racine) => (f) => fs.readFileSync(path.join(racine || RACINE, f), 'utf8');
const LECTEUR_AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, f);

/** Les modules chargés par admin.html, dans SON ordre. */
const MODULES = ['js/config.js', 'js/commun.js', 'js/dialog.js', 'js/api.js', 'js/admin.js',
                 'js/sponsors.js', 'js/admin-sponsors.js'];

/** Les quatre cartes de l'écran, extraites d'admin.html telles qu'elles y sont écrites. */
function cartesPartenaires(html) {
  const ids = ['bloc-sponsors-accueil', 'bloc-sponsors-reglages', 'bloc-sponsors-liste', 'bloc-sponsors-bilan'];
  return ids.map((id) => {
    const debut = html.indexOf('<section class="carte', html.indexOf('id="' + id + '"') - 400);
    if (debut === -1) throw new Error('carte introuvable : ' + id);
    const fin = html.indexOf('</section>', html.indexOf('id="' + id + '"'));
    return html.slice(debut, fin + 10);
  }).join('\n') +
    // Les quelques éléments hors cartes que l'écran manipule (barre de connexion, écran d'attente).
    '<div id="ecran-chargement-attente" hidden></div><div id="ecran-chargement-erreur" hidden></div>' +
    '<div id="ecran-chargement-message"></div>';
}

/** Le serveur : le vrai Code.gs sur le tournoi fictif, instrumenté pour Drive et le cache. */
function serveur(source) {
  const m = completerPourPartenaires(chargerBanc(source, MD.peuplerDemo));
  m.lister = () => m.appeler('listerSponsorsLecture_', m.classeur).sponsors;
  return m;
}

/**
 * Le navigateur : vrais modules, vraies cartes, `fetch` simulé vers le vrai backend.
 * @return {object} { ctx, doc, journal, appels, sorties, clic, saisir, cocher, choisir, tour, dialogues }
 */
function navigateur(srv, lireJs, options) {
  const o = options || {};
  const doc = BC.creerDocument();
  /* ⭐ DE VRAIS ÉCOUTEURS. Le mini-DOM partagé ignore `addEventListener` : les bancs existants
     appellent directement les fonctions du frontend. Ici, il faut au contraire que les gestes
     passent par les VRAIS écouteurs — c'est la seule façon de prouver qu'un geste local n'émet
     aucune requête, écouteur délégué compris. On complète donc le prototype, avec bouillonnement. */
  (function poserEvenements() {
    const proto = Object.getPrototypeOf(doc.createElement('div'));
    if (proto.__evenements) return;
    proto.__evenements = true;
    proto.addEventListener = function (type, fn) {
      if (!this.__ev) this.__ev = {};
      (this.__ev[type] = this.__ev[type] || []).push(fn);
    };
    // Gestes de confort du navigateur, sans effet mesurable ici mais appelés par l'écran.
    proto.scrollIntoView = function () {};
    proto.click = function () { this.dispatchEvent({ type: 'click' }); };
    proto.removeEventListener = function (type, fn) {
      if (!this.__ev || !this.__ev[type]) return;
      this.__ev[type] = this.__ev[type].filter((f) => f !== fn);
    };
    proto.dispatchEvent = function (brut) {
      const ev = Object.assign({ target: this, key: '', preventDefault() {}, stopPropagation() {} }, brut || {});
      /* ⭐ UN ÉCOUTEUR QUI REJETTE EST UNE ISSUE, PAS UN PLANTAGE DU BANC.
         🔬 Un écouteur `async` rend une promesse que le vrai navigateur ignore ; ici, elle
         devenait un rejet NON GÉRÉ qui tuait la passe entière. ⛔ Depuis que `getAll` refuse un
         tournoi non publié (lot « Pages publiques du tournoi »), un frontend FIGÉ rejoué contre le
         backend courant rejette pour de bonnes raisons — et le banc doit l'OBSERVER, pas mourir.
         ⭐ Les rejets sont donc retenus dans `doc.__rejets`, consultables par les contrôles. */
      const surveiller = (r) => {
        if (r && typeof r.catch === 'function') {
          r.catch((e) => { (doc.__rejets = doc.__rejets || []).push(String(e && e.message || e)); });
        }
      };
      let n = this;
      while (n && n.tag) {
        ((n.__ev || {})[ev.type] || []).slice().forEach((fn) => surveiller(fn.call(n, ev)));
        n = n.parentNode;
      }
      ((doc.__ev || {})[ev.type] || []).slice().forEach((fn) => surveiller(fn.call(doc, ev)));
      return true;
    };
  })();
  doc.addEventListener = function (type, fn) {
    if (!doc.__ev) doc.__ev = {};
    (doc.__ev[type] = doc.__ev[type] || []).push(fn);
  };
  /* `style.setProperty` et `classList` : l'aperçu par emplacement s'en sert pour poser la taille
     RÉELLE de l'encart. Le mini-DOM partagé ne les porte pas ; on les complète, sans rien simuler
     de plus qu'un magasin de valeurs. */
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
  /* `form.reset()` : le mini-DOM ne l'a pas, et `reinitialiserFormSponsor` s'en sert. On le pose
     avec la sémantique du navigateur — chaque champ retrouve sa valeur d'origine (ici : vide). */
  (function poserReset() {
    const proto = Object.getPrototypeOf(doc.createElement('form'));
    if (proto.reset) return;
    proto.reset = function () {
      this.querySelectorAll('input, select, textarea').forEach((c) => {
        if (c.type === 'checkbox' || c.type === 'radio') c.checked = false;
        else c.value = '';
      });
    };
  })();
  const journal = [];        // une entrée par requête métier reçue par le serveur
  const sorties = [];        // TOUTE sortie réseau, au plus bas niveau
  const dialogues = [];      // questions posées à l'utilisateur
  const reponses = (o.dialogues || []).slice();
  doc.body.innerHTML = cartesPartenaires(lireJs('admin.html'));

  const minuterie = (fn, ms, ...args) => setTimeout(fn, Math.max(0, Math.round((Number(ms) || 0) / 1000)), ...args);

  const fetchSimule = (adresse, reglages) => new Promise((resolve, reject) => {
    const r = reglages || {};
    sorties.push('fetch ' + String(adresse));
    const methode = r.method === 'POST' ? 'POST' : 'GET';
    let corps;
    try {
      corps = methode === 'POST' ? JSON.parse(r.body)
        : Object.fromEntries([...new URL(adresse).searchParams].filter(([k]) => k !== '_'));
    } catch (e) { corps = {}; }
    journal.push(corps.action);
    // Panne injectée : par action, ou pour la n-ième émission.
    const panne = (o.pannes || {})[corps.action];
    if (panne === 'silence') return;                              // ne se dénoue jamais
    if (panne === 'reseau') { setTimeout(() => reject(new TypeError('Failed to fetch')), 0); return; }
    if (panne === 'perdue') {
      // La requête ABOUTIT côté serveur, mais la réponse n'arrive jamais au navigateur.
      try { methode === 'POST' ? srv.postMesure(corps, corps.action) : srv.getMesure(corps, corps.action); } catch (e) {}
      setTimeout(() => reject(new TypeError('Failed to fetch')), 0);
      return;
    }
    let sortie;
    try {
      sortie = methode === 'POST' ? srv.postMesure(corps, corps.action) : srv.getMesure(corps, corps.action);
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
    // ⭐ Une origine LOCALE : `config.js` en déduit son `API_URL` (const) tout seul, sans qu'on ait
    //   à la réécrire — le banc charge donc le VRAI fichier, tel quel.
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

  // La clé admin déjà acceptée : l'écran n'ouvre pas de fenêtre de saisie.
  ctx.sessionStorage.setItem('r92_cle_admin', o.cle === undefined ? CLE_ADMIN : o.cle);
  // Les dialogues : scriptés, et journalisés.
  ctx.dialogConfirmer = async (message, opts) => {
    dialogues.push({ message: String(message), opts: opts || {} });
    return reponses.length ? reponses.shift() : true;
  };
  ctx.dialogDemander = async () => (reponses.length ? reponses.shift() : CLE_ADMIN);
  vm.runInContext('dialogConfirmer = this.dialogConfirmer; dialogDemander = this.dialogDemander;', ctx);
  vm.runInContext('configCourante = { global: {}, categories: [] };', ctx);
  vm.runInContext('definirAdminConnecte(true);', ctx);
  vm.runInContext('initAdminSponsors();', ctx);

  const el = (id) => doc.getElementById(id);
  const tour = async (n) => { for (let i = 0; i < (n || 12); i++) await new Promise((r) => setTimeout(r, 0)); };
  return {
    ctx, doc, journal, sorties, dialogues, el, tour,
    requetes: () => journal.slice(),
    ouvrir: async () => { await vm.runInContext('ouvrirEtapeAdmin("sponsors")', ctx); await tour(); },
    clic: async (id) => { const e = el(id); if (!e) throw new Error('bouton introuvable : ' + id); e.dispatchEvent({ type: 'click', target: e }); await tour(); },
    champ: (nom) => doc.querySelector('#form-sponsor [name="' + nom + '"]') ||
                    doc.querySelector('#form-sponsors-reglages [name="' + nom + '"]'),
    saisir: async (nom, valeur) => {
      const c = doc.querySelector('#form-sponsor [name="' + nom + '"]') ||
                doc.querySelector('#form-sponsors-reglages [name="' + nom + '"]');
      if (!c) throw new Error('champ introuvable : ' + nom);
      c.value = String(valeur);
      c.dispatchEvent({ type: 'input', target: c });
      await tour(2);
    },
    cocher: async (nom, valeur) => {
      const c = doc.querySelector('#form-sponsor [name="' + nom + '"]') ||
                doc.querySelector('#form-sponsors-reglages [name="' + nom + '"]');
      if (!c) throw new Error('case introuvable : ' + nom);
      c.checked = !!valeur;
      c.dispatchEvent({ type: 'input', target: c });
      c.dispatchEvent({ type: 'change', target: c });
      await tour(2);
    }
  };
}

module.exports = { serveur, navigateur, cartesPartenaires, lecteur, LECTEUR_AVANT, BACKEND_AVANT,
  FRONTEND_AVANT_REV, BACKEND_AVANT_REV, RACINE, BACKEND, CLE_ADMIN, MODULES, git };
