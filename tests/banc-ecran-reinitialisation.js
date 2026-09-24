'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « RÉINITIALISER » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par
 *  tests/ecran-reinitialisation-surface.test.js et tests/ecran-reinitialisation-zero-appel.test.js.
 *
 *  ⭐ POURQUOI CE BANC CHARGE PRESQUE TOUTE LA PAGE, alors que l'écran n'a qu'un bouton.
 *  Un clic confirmé sur « Réinitialiser » ne touche pas seulement sa carte : il OUBLIE la liste des
 *  clubs, RELIT le serveur et REPEINT réglages, terrains, catégories, équipes, planning, infos,
 *  publication, dossier, tableau de bord, feuille FFR et verdict de conformité. Un banc qui ne
 *  chargerait que `bloc-reinitialisation` ne verrait RIEN de ce qui peut mal tourner — et c'est
 *  précisément là que les défauts vivent. Le banc charge donc les VRAIS modules d'admin.html, dans
 *  SON ordre, et la VRAIE page, telle qu'elle est écrite.
 *  ⛔ Les deux modules PARTENAIRES sont doublés, et c'est le seul écart : ils ne participent pas à
 *  la chaîne (les partenaires SURVIVENT délibérément au reset), et `js/sponsors.js` est l'un des
 *  fichiers chargés sans version sur trois pages — le toucher n'est pas au programme de ce lot.
 *
 *  ⭐ Serveur : le VRAI Code.gs dans les doublures du banc de coût (backend/tests/banc-cout), sur un
 *     tournoi fictif PLEIN (monde-reinitialisation.js) — ⛔ jamais un état fabriqué à la main.
 *  ⭐ Transport RÉEL jusqu'au réseau : le vrai api.js (délais bornés, abandon, rejeu unique d'une
 *     LECTURE après un 404) ; seul `fetch` est simulé, et TOUTE porte de sortie réseau est comptée
 *     (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource, image, window.open).
 *
 *  ⭐ Référence « avant » FIGÉE — celle d'où part le lot, lue dans git, ⛔ jamais `HEAD` :
 *     frontend fa4959594f5f18b72b2bacd403a08eb007c3e4dd ·
 *     backend  9d2816f4c0afab64373fc48ee75f79171ac804f2.
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
const { chargerBanc } = require(path.join(BACKEND, 'tests', 'banc-cout', 'instrumentation'));
const { completerPourPartenaires } = require(path.join(BACKEND, 'tests', 'banc-cout', 'instrumentation-partenaires'));
const { fourchette } = require(path.join(BACKEND, 'tests', 'banc-cout', 'modele-cout'));
const MR = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-reinitialisation'));
const CLE_ADMIN = MR.CLE_ADMIN;

/* ⛔ Références FIGÉES d'avant le lot « Réinitialiser » — jamais HEAD, jamais un hash abrégé. */
const FRONTEND_AVANT_REV = 'fa4959594f5f18b72b2bacd403a08eb007c3e4dd';
const BACKEND_AVANT_REV = '9d2816f4c0afab64373fc48ee75f79171ac804f2';
const git = (depot, rev, fichier) =>
  execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
const BACKEND_COURANT = () => fs.readFileSync(path.join(BACKEND, 'Code.gs'), 'utf8');
const lecteur = (racine) => (f) => fs.readFileSync(path.join(racine || RACINE, f), 'utf8');
const LECTEUR_AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, f);
/** Lecteur MÊLÉ — le cache du navigateur : `avant` = fichiers servis dans leur version d'avant. */
const lecteurMele = (avant) => (f) => (avant.indexOf(f) !== -1 ? LECTEUR_AVANT(f) : lecteur()(f));

/** Les modules chargés par admin.html, dans SON ordre — ⛔ moins les deux modules PARTENAIRES. */
const MODULES = ['js/config.js', 'js/commun.js', 'js/dialog.js', 'js/api.js', 'js/admin.js',
  'js/admin-infos-publication.js', 'js/admin-invitations.js', 'js/admin-suivi-clubs.js',
  'js/admin-reglages.js', 'js/admin-choix-categories.js', 'js/admin-conformite-ffr.js',
  'js/admin-equipes.js', 'js/admin-tableau-bord.js', 'js/admin-generation.js',
  'js/admin-terrains.js', 'js/admin-autorisation.js', 'js/admin-feuille-jour.js', 'js/ecrans.js'];

/** ⭐ LA LIAISON DE L'ÉCRAN, mot pour mot celle de `brancherEcouteursAdmin` (js/admin.js).
 *  ⛔ Toute divergence est un ÉCHEC de `ecran-reinitialisation-surface`, pas une adaptation du banc. */
const LIAISON_ECRAN = "ecouter('bouton-reinitialiser', 'click', onReinitialiser);";

/** La page, telle qu'admin.html l'écrit : tout ce qui est dans <body>. */
function pageAdmin(html) {
  const debut = html.indexOf('<body');
  const ouvre = html.indexOf('>', debut);
  const fin = html.lastIndexOf('</body>');
  if (debut === -1 || fin === -1) throw new Error('body introuvable dans admin.html');
  return html.slice(ouvre + 1, fin);
}

/** Le serveur : le vrai Code.gs sur le tournoi fictif PLEIN, instrumenté finement. */
function serveur(source, opt) {
  const m = completerPourPartenaires(chargerBanc(source, (w) => MR.peuplerReinitialisation(w, opt || {})));
  m.config = () => m.appeler('lireConfig', m.classeur);
  m.equipes = () => m.appeler('lireOngletSimple', m.classeur, 'Equipes');
  m.poules = () => m.appeler('lireOngletSimple', m.classeur, 'Poules');
  m.matchs = () => m.appeler('lireOngletSimple', m.classeur, 'Matchs');
  m.clubs = () => m.appeler('lireOngletSimple', m.classeur, 'Clubs');
  m.editions = () => m.appeler('lireOngletSimple', m.classeur, 'Editions');
  m.zoneA = () => MR.zoneA(m);
  m.vide = () => m.equipes().length === 0 && m.poules().length === 0 && m.matchs().length === 0 &&
                 (m.config().categories || []).length === 0;
  /** Une écriture jouée DIRECTEMENT côté serveur — « l'autre onglet », hors de toute mesure. */
  m.autreOnglet = (corps) => m.postMesure(Object.assign({ cle: CLE_ADMIN }, corps), 'autre-onglet').reponse;
  return m;
}

/**
 * Le navigateur : vrais modules, vraie page, `fetch` simulé vers le vrai backend.
 * @param {object} srv        un `serveur(...)`
 * @param {function} lireJs   lecteur de fichiers du frontend (courant, figé ou mêlé)
 * @param {object} [options]  { dialogues: [], pannes: {action: 'silence'|'reseau'|'perdue'|'404'|'ancienne'},
 *                              cle }
 */
function navigateur(srv, lireJs, options) {
  const o = options || {};
  const doc = BC.creerDocument();

  /* ⭐ DE VRAIS ÉCOUTEURS, avec bouillonnement : les gestes passent par les écouteurs que `ecouter`
     pose vraiment. ⛔ Sans cela, une suite « zéro appel » ne prouverait rien. */
  (function completerDom() {
    const proto = Object.getPrototypeOf(doc.createElement('div'));
    if (proto.__resetComplete) return;
    proto.__resetComplete = true;
    proto.addEventListener = function (type, fn) {
      if (!this.__ev) this.__ev = {};
      (this.__ev[type] = this.__ev[type] || []).push(fn);
    };
    proto.removeEventListener = function (type, fn) {
      if (!this.__ev || !this.__ev[type]) return;
      this.__ev[type] = this.__ev[type].filter((f) => f !== fn);
    };
    proto.scrollIntoView = function () {};
    proto.focus = function () { doc.activeElement = this; };
    proto.blur = function () {};
    proto.select = function () { doc.activeElement = this; };
    proto.click = function () { this.dispatchEvent({ type: 'click' }); };
    proto.dispatchEvent = function (brut) {
      const ev = Object.assign({ type: 'click', target: this, key: '',
        preventDefault() {}, stopPropagation() {} }, brut || {});
      let n = this;
      while (n && n.tag) {
        ((n.__ev || {})[ev.type] || []).slice().forEach((fn) => fn.call(n, ev));
        n = n.parentNode;
      }
      ((doc.__ev || {})[ev.type] || []).slice().forEach((fn) => fn.call(doc, ev));
      return true;
    };
    const appendChildBase = proto.appendChild;
    proto.appendChild = function (e) {
      if (e && e.parentNode && e.parentNode !== this) {
        const f = e.parentNode.enfants.indexOf(e);
        if (f !== -1) e.parentNode.enfants.splice(f, 1);
      }
      return appendChildBase.call(this, e);
    };
    proto.removeChild = function (e) {
      const i = this.enfants.indexOf(e);
      if (i !== -1) { this.enfants.splice(i, 1); e.parentNode = null; }
      return e;
    };
    proto.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
    proto.insertBefore = function (e, ref) {
      if (e && e.parentNode) {
        const f = e.parentNode.enfants.indexOf(e);
        if (f !== -1) e.parentNode.enfants.splice(f, 1);
      }
      const i = ref ? this.enfants.indexOf(ref) : -1;
      e.parentNode = this;
      if (i === -1) this.enfants.push(e); else this.enfants.splice(i, 0, e);
      return e;
    };
    proto.insertAdjacentHTML = function (position, html) {
      const bac = doc.createElement('div');
      bac.innerHTML = String(html);
      const morceaux = bac.enfants.slice();
      if (position === 'afterbegin') morceaux.reverse().forEach((m) => this.insertBefore(m, this.enfants[0] || null));
      else morceaux.forEach((m) => this.appendChild(m));
    };
    proto.closest = proto.closest || function () { return null; };
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
    Object.defineProperty(proto, 'children', { configurable: true, get() { return this.enfants.filter((e) => e.tag); } });
    Object.defineProperty(proto, 'firstElementChild', { configurable: true, get() { return this.children[0] || null; } });
    Object.defineProperty(proto, 'href', { configurable: true,
      get() { return this.attrs.href === undefined ? '' : this.attrs.href; },
      set(v) { this.attrs.href = String(v); } });
  })();
  doc.addEventListener = function (type, fn) {
    if (!doc.__ev) doc.__ev = {};
    (doc.__ev[type] = doc.__ev[type] || []).push(fn);
  };

  const journal = [];      // une entrée par requête métier reçue par le serveur
  const corps = [];        // le corps COMPLET de chaque POST (pour lire etat_vu, renvoyer_etat…)
  const sorties = [];      // TOUTE sortie du navigateur vers l'extérieur, au plus bas niveau
  const dialogues = [];    // questions posées à l'organisateur
  const details = [];      // le relevé fin du serveur, requête par requête
  const estimations = [];  // la fourchette du modèle de coût, requête par requête
  const reponses = (o.dialogues || []).slice();
  let rechargements = 0;   // ⭐ le filet de secours : combien de fois la page a été rechargée

  doc.body.innerHTML = pageAdmin(lireJs('admin.html'));

  /* ⭐ LE TEMPS EST COMPRIMÉ : un délai de 180 s du frontend dure 900 ms ici. C'est ce qui rend les
     délais bornés observables en quelques tours de boucle. ⚠️ CE QUE CETTE COMPRESSION NE PROUVE
     PAS : que l'attente se dénoue à la seconde annoncée. Elle prouve qu'elle SE DÉNOUE, que rien
     n'est réémis, et que la cause est nommée. */
  const COMPRESSION_TEMPS = 200;
  const minuterie = (fn, ms, ...args) =>
    setTimeout(fn, Math.max(0, Math.round((Number(ms) || 0) / COMPRESSION_TEMPS)), ...args);

  const fetchSimule = (adresse, reglages) => new Promise((resolve, reject) => {
    const r = reglages || {};
    sorties.push('fetch ' + String(adresse));
    /* ⭐ LE SIGNAL D'ABANDON EST HONORÉ, comme le ferait un vrai navigateur. ⛔ Sans cela, un délai
       borné serait INOBSERVABLE : api.js pose bien son `AbortController`, mais rien ne l'écouterait. */
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
    const panne = typeof o.pannes === 'function' ? o.pannes(demande, journal) : (o.pannes || {})[demande.action];
    if (panne === 'silence') return;                        // ⛔ ne se dénoue JAMAIS : délai attendu
    if (panne === 'reseau') { setTimeout(() => reject(new TypeError('Failed to fetch')), 0); return; }
    if (panne === '404') { setTimeout(() => resolve({ ok: false, status: 404, json: async () => ({}) }), 0); return; }
    if (panne === 'perdue') {
      /* ⭐ LA REQUÊTE ABOUTIT CÔTÉ SERVEUR, la réponse n'arrive jamais au navigateur. C'est le seul
         moyen honnête d'éprouver ce que l'écran OSE dire après une réponse perdue. */
      try {
        const s = methode === 'POST' ? srv.postMesure(demande, demande.action) : srv.getMesure(demande, demande.action);
        details.push(s.detail); estimations.push(fourchette(s.mesure));
      } catch (e) { /* le classeur garde ce qu'il a pu écrire */ }
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
    details.push(sortie.detail);
    estimations.push(fourchette(sortie.mesure));
    /* `ancienne` : la réponse d'un backend d'AVANT ce lot — mêmes champs historiques, ⛔ sans
       `etat`, sans `deja_reinitialise`, sans `precondition`. */
    let donnees = sortie.reponse;
    if (panne === 'ancienne' && donnees && !donnees.error) {
      donnees = Object.assign({}, donnees);
      ['etat', 'deja_reinitialise', 'modifies', 'cellules_videes', 'precondition', 'etat_avant',
       'drive_corbeille', 'mesures'].forEach((c) => { delete donnees[c]; });
    }
    const texte = JSON.stringify(donnees);
    setTimeout(() => resolve({ ok: true, status: 200, json: async () => JSON.parse(texte) }), 0);
  });

  const ctx = {
    console: o.console || { log() {}, warn() {}, error() {} },
    document: doc,
    navigator: { onLine: true, clipboard: { writeText: async (t) => { sorties.push('clipboard'); void t; } },
                 sendBeacon: (u) => { sorties.push('sendBeacon ' + u); return true; } },
    location: { search: '', href: 'http://127.0.0.1/admin.html', origin: 'http://127.0.0.1',
                protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1',
                /* ⭐ LE FILET DE SECOURS EST COMPTÉ, pas ignoré : `rechargerLaPage()` passe par là. */
                reload: () => { rechargements++; } },
    setTimeout: minuterie, clearTimeout, setInterval: minuterie, clearInterval,
    Promise, JSON, Math, Date, String, Number, Object, Array, Boolean, RegExp, Error, TypeError,
    SyntaxError, Map, Set, Uint8Array, Intl, URL, URLSearchParams, AbortController, performance,
    isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    Blob: function (parties, opts) { this.parties = parties; this.type = (opts || {}).type || ''; },
    crypto: { randomUUID: (function () { let k = 0; return () => 'fictif-' + String(++k).padStart(8, '0'); })() },
    fetch: fetchSimule,
    sessionStorage: (function () { const d = {}; return {
      getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } }; })(),
    localStorage: (function () { const d = {}; return {
      getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } }; })(),
    XMLHttpRequest: function () { sorties.push('XMLHttpRequest'); return { open() {}, send() {}, setRequestHeader() {} }; },
    WebSocket: function (u) { sorties.push('WebSocket ' + u); },
    EventSource: function (u) { sorties.push('EventSource ' + u); },
    Image: function () { const i = {}; Object.defineProperty(i, 'src', {
      set(v) { sorties.push('Image ' + v); }, get() { return ''; } }); return i; }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.window.open = (u) => { sorties.push('window.open ' + u); return null; };
  ctx.window.addEventListener = () => {};
  ctx.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ctx.window.print = () => { sorties.push('print'); };
  ctx.window.requestAnimationFrame = (fn) => minuterie(fn, 0);
  ctx.window.scrollTo = () => {};
  ctx.scrollTo = () => {};
  vm.createContext(ctx);

  const sources = {};
  MODULES.forEach((f) => { sources[f] = lireJs(f); vm.runInContext(sources[f], ctx, { filename: f }); });

  /* ⭐ LES DEUX MODULES PARTENAIRES SONT DOUBLÉS, ET NOMMÉS — voir le bandeau. ⛔ Aucune autre
     fonction de production n'est doublée : un nom absent pour cause de mélange de versions doit
     lever, comme dans un vrai navigateur. */
  const DOUBLES = ['injecterReglagesSponsors', 'afficherListeSponsors', 'afficherBilanSponsors',
    'lireFichesSponsors', 'lireRelevesSponsors', 'demarrerChargementGroupeSponsors',
    'sponsorsGroupeEnVol', 'initAdminSponsors', 'onEnregistrerSponsor', 'onSupprimerSponsor',
    'onEnregistrerReglagesSponsors', 'onViderMesuresSponsors', 'onActualiserSponsors',
    'onRafraichirRelevesSponsors', 'onChangerJourneeBilan', 'onApercuSponsor',
    'onFichierSponsor', 'onAnnulerSponsor', 'reinitialiserFormSponsor'];
  DOUBLES.forEach((n) => { if (vm.runInContext('typeof ' + n, ctx) === 'undefined') ctx[n] = function () {}; });

  ctx.sessionStorage.setItem('r92_cle_admin', o.cle === undefined ? CLE_ADMIN : o.cle);
  ctx.dialogConfirmer = async (message, opts) => {
    dialogues.push({ message: String(message), opts: opts || {} });
    const r = reponses.length ? reponses.shift() : true;
    return typeof r === 'function' ? r() : r;
  };
  ctx.dialogAlerter = async (message) => { dialogues.push({ message: String(message), alerte: true }); };
  ctx.dialogDemander = async (message) => { dialogues.push({ message: String(message), saisie: true }); return CLE_ADMIN; };
  vm.runInContext('dialogConfirmer = this.dialogConfirmer; dialogDemander = this.dialogDemander;' +
    ' dialogAlerter = this.dialogAlerter;', ctx);
  vm.runInContext('definirAdminConnecte(true);', ctx);

  const el = (id) => doc.getElementById(id);
  const tour = async (n) => { for (let i = 0; i < (n || 20); i++) await new Promise((r) => setTimeout(r, 0)); };

  /**
   * L'OUVERTURE DE L'ADMINISTRATION, telle que `chargerAdmin()` la joue : les deux lectures
   * d'ouverture, la mémoire, puis les repeints, puis la LIAISON de l'écran.
   * ⛔ `chargerAdmin()` en entier n'est pas jouable ici (il appelle les gestionnaires des modules
   *   partenaires, doublés). On joue donc ses lignes, et `ecran-reinitialisation-surface` vérifie
   *   MOT POUR MOT que `LIAISON_ECRAN` est bien celle d'`admin.js`.
   */
  async function ouvrir() {
    const session = await vm.runInContext('ouvrirSessionAdmin()', ctx);
    await tour();
    if (!session.connecte) return session;
    ctx.__cfg = session.cfg; ctx.__data = session.data;
    vm.runInContext('configCourante = this.__cfg; equipesCourantes = this.__data.equipes;' +
      ' matchsCourants = this.__data.matchs || [];', ctx);
    vm.runInContext(LIAISON_ECRAN, ctx);
    vm.runInContext('injecterReglages(configCourante.global, configCourante.categories);', ctx);
    vm.runInContext('remplirSelectCategories(configCourante.categories);', ctx);
    vm.runInContext('afficherEquipes(equipesCourantes);', ctx);
    vm.runInContext('afficherPlanning(this.__data.poules, this.__data.matchs);', ctx);
    vm.runInContext('majInfosTournoi(); majPublication(); majTableauBord();', ctx);
    await tour();
    return session;
  }

  const banc = {
    ctx, doc, journal, corps, sorties, dialogues, details, estimations, el, tour, srv,
    requetes: () => journal.slice(),
    demandes: () => corps.slice(),
    rechargements: () => rechargements,
    /** Remet les compteurs à zéro : ce qui précède n'est pas le geste que l'on mesure. */
    remettre: () => { journal.length = 0; corps.length = 0; sorties.length = 0;
                      dialogues.length = 0; details.length = 0; estimations.length = 0; },
    texte: (id) => String((el(id) || {}).textContent || ''),
    message: () => String((el('message-reinitialisation') || {}).textContent || ''),
    bouton: () => el('bouton-reinitialiser'),
    ouvrir,
    amorcer: async () => { await ouvrir(); banc.remettre(); },
    /** ⭐ L'ARRIVÉE SUR L'ÉCRAN — le point de passage UNIQUE des deux parcours guidés. */
    arriver: async (tours) => {
      const p = vm.runInContext('ouvrirEtapeAdmin("reinitialisation")', ctx);
      await tour(tours);
      return p;
    },
    /** La navigation complète telle que la barre latérale la joue. */
    naviguer: async (id, tours) => { vm.runInContext('ecransActiver("' + id + '")', ctx); await tour(tours); },
    clic: async (id, tours) => {
      const e = el(id);
      if (!e) throw new Error('bouton introuvable : ' + id);
      e.dispatchEvent({ type: 'click', target: e });
      await tour(tours);
    },
    /** Un clic qui ne rend PAS la main (délai ou confirmation en cours) : la promesse vit. */
    clicSansAttendre: (id) => {
      const e = el(id);
      if (!e) throw new Error('bouton introuvable : ' + id);
      e.dispatchEvent({ type: 'click', target: e });
    },
    /** ⭐ LE DOUBLE CLIC, au sens du navigateur : deux événements AVANT tout tour de boucle. */
    doubleClic: async (id, tours) => {
      const e = el(id);
      if (!e) throw new Error('bouton introuvable : ' + id);
      e.dispatchEvent({ type: 'click', target: e });
      e.dispatchEvent({ type: 'click', target: e });
      await tour(tours);
    },
    /** L'état que l'écran MONTRE — ⛔ jamais celui du serveur. */
    etatEcran: () => ({
      categories: (vm.runInContext('(configCourante && configCourante.categories) || []', ctx) || []).length,
      equipes: (vm.runInContext('equipesCourantes || []', ctx) || []).length,
      poules: (vm.runInContext('typeof planningPoules !== "undefined" ? (planningPoules || []) : []', ctx) || []).length,
      matchs: (vm.runInContext('typeof planningMatchs !== "undefined" ? (planningMatchs || []) : []', ctx) || []).length
    }),
    etatServeur: () => ({ categories: (srv.config().categories || []).length, equipes: srv.equipes().length,
                          poules: srv.poules().length, matchs: srv.matchs().length }),
    clubsEcran: () => (vm.runInContext('clubsInvitesCourants || []', ctx) || []).length,
    valeur: (nom) => vm.runInContext(nom, ctx)
  };
  return banc;
}

/** Ouvre un banc complet (serveur + navigateur), amorcé. */
async function banc(opt) {
  const o = opt || {};
  const srv = serveur(o.backend || BACKEND_COURANT(), o.monde || {});
  if (o.avant) o.avant(srv);
  const b = navigateur(srv, o.js || lecteur(), o);
  if (o.amorcer === false) return b;
  await (o.garderOuverture ? b.ouvrir() : b.amorcer());
  return b;
}

module.exports = { banc, serveur, navigateur, pageAdmin, MODULES, LIAISON_ECRAN,
  lecteur, lecteurMele, LECTEUR_AVANT, BACKEND_AVANT, BACKEND_COURANT,
  FRONTEND_AVANT_REV, BACKEND_AVANT_REV, RACINE, BACKEND, CLE_ADMIN, git, MR,
  compteur: BC.compteur };
