'use strict';

/**
 * ============================================================================
 *  BANC DE LA PAGE PUBLIQUE DU TOURNOI — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par
 *  tests/ecran-public-surface.test.js et tests/ecran-public-zero-appel.test.js.
 *
 *  ⭐ Navigateur : les VRAIS modules (config, commun, dialog, api, sponsors, tournoi) et le VRAI
 *     corps de `tournoi.html`, pris tel quel.
 *  ⭐ Serveur : le VRAI Code.gs dans les doublures du banc de coût (backend/tests/banc-cout), sur
 *     le monde `monde-public` (publié / jamais publié / masqué, volume courant ou haut).
 *  ⭐ Transport RÉEL jusqu'au réseau : le vrai api.js ; seul `fetch` est simulé, et TOUTE porte de
 *     sortie réseau est comptée (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource,
 *     window.open, et le chargement d'une image — les logos partenaires passent par là).
 *
 *  ⭐ RÉFÉRENCE « AVANT » FIGÉE — les HEAD qui closent le lot « Saisie des scores », lus dans git,
 *     ⛔ jamais `HEAD` : frontend 7cabce4ac484fcde135f76c95fe5a5ad07f1522e ·
 *     backend  e1c96067ed9c0679fa427badf14776d7e57b6136.
 *     C'est ce qui rend une comparaison avant / après honnête : LE MÊME JEU DE DONNÉES des deux
 *     côtés, et un « avant » qui ne bouge pas quand l'arbre de travail bouge.
 *
 *  ⛔ AUCUN RÉSEAU, AUCUN SERVICE GOOGLE RÉEL. ⛔ Aucune adresse hors de 127.0.0.1 n'est joignable :
 *     toute tentative est COMPTÉE puis rejetée — c'est ainsi que l'aperçu d'un logo partenaire
 *     (`lh3.googleusercontent.com`) est observé sans jamais être appelé.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BC = require('./banc-ecran-categories');

const RACINE = BC.RACINE;
const BACKEND = BC.BACKEND;
const { chargerBanc, resumer } = require(path.join(BACKEND, 'tests', 'banc-cout', 'instrumentation'));
const MPub = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-public'));

/* ⛔ Références FIGÉES d'avant ce lot — jamais HEAD, jamais un hash abrégé. */
const FRONTEND_AVANT_REV = '7cabce4ac484fcde135f76c95fe5a5ad07f1522e';
const BACKEND_AVANT_REV = 'e1c96067ed9c0679fa427badf14776d7e57b6136';
/* ⭐ NOTRE PROPRE `git`, avec un tampon large : `Code.gs` pèse plus d'un mégaoctet, et le lecteur
   partagé rend `ENOBUFS` sur un fichier de cette taille. ⛔ Lecture seule, jamais d'écriture. */
const { execFileSync } = require('node:child_process');
const git = (depot, rev, fichier) =>
  execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
const AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, f);

/** Les modules chargés par `tournoi.html`, dans SON ordre. */
const MODULES = ['js/config.js', 'js/commun.js', 'js/dialog.js', 'js/api.js', 'js/sponsors.js', 'js/tournoi.js'];

/** Lecteur des fichiers de l'arbre de travail. */
const lecteur = () => (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
/** Lecteur MÊLÉ (cache du navigateur) : les fichiers nommés sont servis dans leur version d'AVANT. */
const lecteurMele = (avant) => (f) => (avant.indexOf(f) !== -1 ? AVANT(f) : lecteur()(f));

/** Le corps de `tournoi.html`, tel qu'il est écrit. */
function corpsPublic(html) {
  const debut = html.indexOf('<body>');
  const fin = html.indexOf('</body>');
  if (debut === -1 || fin === -1) throw new Error('corps de tournoi.html introuvable');
  return html.slice(debut + 6, fin);
}

/** Le serveur : le vrai Code.gs sur le monde public fictif. */
function serveur(source, opt) {
  const o = opt || {};
  return chargerBanc(source || fs.readFileSync(path.join(BACKEND, 'Code.gs'), 'utf8'),
    (m) => {
      MPub.peuplerPublic(m, { etat: o.etat || 'oui', volume: o.volume || 'courant' });
      if (o.historique) MPub.peuplerHistorique(m, o.historique.courant, o.historique.passe);
    });
}

/**
 * Le navigateur : vrais modules, vrai corps de page, `fetch` simulé vers le vrai backend.
 *
 * Options :
 *   · js          — lecteur de fichiers (défaut : l'arbre de travail ; voir `lecteurMele`) ;
 *   · html        — source de `tournoi.html` (défaut : l'arbre de travail) ;
 *   · pannes      — { action: 'reseau' | 'silence' | 'json' | 'tronque' | 'http500' } ;
 *   · manuel      — true : les réponses ne partent QUE sur `livrer()` — c'est ainsi qu'on pilote
 *                   réellement une COURSE (deux requêtes dénouées dans l'ordre qu'on choisit) ;
 *   · relais      — { url, corps } : double du relais CDN (⛔ jamais un relais réel) ;
 *   · horsLigne   — true : `navigator.onLine` est faux au départ.
 */
function navigateur(srv, options) {
  const o = options || {};
  const lireJs = o.js || lecteur();
  const doc = BC.creerDocument();

  /* ⭐ DE VRAIS ÉCOUTEURS, avec bouillonnement : la page publique ne s'anime QUE par eux
     (onglets, flèches, bouton, visibilité, retour en ligne). Sans cela, le banc appellerait les
     fonctions à la main et ne prouverait rien du câblage réel. */
  (function poserEvenements() {
    const proto = Object.getPrototypeOf(doc.createElement('div'));
    if (proto.__evenements) return;
    proto.__evenements = true;
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
    proto.click = function () { this.dispatchEvent({ type: 'click' }); };
    proto.dispatchEvent = function (brut) {
      const ev = Object.assign({ type: '', key: '', target: this,
        preventDefault() { ev.defaultPrevented = true; }, stopPropagation() {} }, brut || {});
      ev.target = ev.target || this;
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
  doc.activeElement = null;
  doc.hidden = false;
  doc.body.innerHTML = corpsPublic(o.html || lireJs('tournoi.html'));

  const journal = [];     // une entrée par requête métier reçue par le serveur
  const sorties = [];     // TOUTE sortie réseau, au plus bas niveau
  const externes = [];    // ⛔ les adresses HORS 127.0.0.1 (jamais appelées, seulement comptées)
  const enAttente = [];   // requêtes retenues quand `manuel` est vrai

  /* ⭐ LE TEMPS N'EST PAS ACCÉLÉRÉ, ET C'EST UN CHOIX.
     🔬 LE PIÈGE ÉVITÉ. Les bancs d'écran voisins divisent les délais par mille pour aller vite.
     Ici, ça FABRIQUERAIT le défaut qu'on cherche : la boucle de rafraîchissement (15 s) tomberait
     à 15 ms et tirerait plusieurs requêtes pendant qu'on observe un simple clic — « zéro requête
     dupliquée » deviendrait invérifiable, et tout échec ambigu.
     ⭐ Les délais restent donc RÉELS : aucun minuteur long ne se déclenche pendant un test, et
     c'est `tourAutomatique()` qui joue un tour de boucle, à l'instant qu'on choisit.
     ⛔ Tous les minuteurs sont retenus : sans cela, la boucle qui se replanifie elle-même et la
     rotation des partenaires tiendraient le processus éveillé indéfiniment. */
  const minuteurs = new Set();
  const minuterie = (fn, ms, ...args) => {
    const id = setTimeout(() => { minuteurs.delete(id); fn(...args); }, Math.max(0, Number(ms) || 0));
    minuteurs.add(id);
    return id;
  };
  const intervalle = (fn, ms, ...args) => {
    const id = setInterval(fn, Math.max(1, Number(ms) || 0), ...args);
    minuteurs.add(id);
    return id;
  };

  function reponseServeur(corps, methode) {
    return methode === 'POST' ? srv.postMesure(corps, corps.action) : srv.getMesure(corps, corps.action);
  }

  /** Abîme une réponse de la façon demandée, pour éprouver un corps illisible. */
  function abimer(texte, panne) {
    if (panne === 'json') return '{ ceci n’est pas du JSON';
    if (panne === 'tronque') return texte.slice(0, Math.floor(texte.length / 2));
    return texte;
  }

  const fetchSimule = (adresse, reglages) => new Promise((resolve, reject) => {
    const r = reglages || {};
    const url = String(adresse);
    sorties.push('fetch ' + url);
    /* ⛔ LE MONDE EXTÉRIEUR EST FERMÉ. Une adresse qui n'est pas locale est COMPTÉE puis REJETÉE :
       le banc ne peut pas appeler `lh3.googleusercontent.com`, ni un relais réel, ni quoi que ce
       soit d'autre — et l'avoir tenté se voit. */
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url) && url.indexOf('/__api') !== 0) {
      if (!o.relais || url !== o.relais.url) {
        externes.push(url);
        setTimeout(() => reject(new TypeError('Failed to fetch (adresse externe fermée par le banc)')), 0);
        return;
      }
    }
    if (o.relais && url === o.relais.url) {
      const c = o.relais.corps;
      if (c === null) { setTimeout(() => reject(new TypeError('Failed to fetch')), 0); return; }
      const t = JSON.stringify(c);
      journal.push('RELAIS');
      setTimeout(() => resolve({ ok: true, status: 200, json: async () => JSON.parse(t) }), 0);
      return;
    }

    const methode = r.method === 'POST' ? 'POST' : 'GET';
    let corps;
    try {
      corps = methode === 'POST' ? JSON.parse(r.body)
        : Object.fromEntries([...new URL(url, 'http://127.0.0.1').searchParams].filter(([k]) => k !== '_'));
    } catch (e) { corps = {}; }
    journal.push(corps.action);

    const panne = (o.pannes || {})[corps.action];
    if (panne === 'silence') return;                                   // ne se dénoue jamais
    if (panne === 'reseau') { setTimeout(() => reject(new TypeError('Failed to fetch')), 0); return; }
    if (panne === 'http500') { setTimeout(() => resolve({ ok: false, status: 500, json: async () => ({ error: 'panne' }) }), 0); return; }

    let sortie;
    try { sortie = reponseServeur(corps, methode); }
    catch (e) {
      setTimeout(() => resolve({ ok: false, status: 500, json: async () => ({ error: String(e.message) }) }), 0);
      return;
    }
    const texte = abimer(JSON.stringify(sortie.reponse), panne);
    const livrer = () => resolve({ ok: true, status: 200,
      json: async () => { try { return JSON.parse(texte); } catch (e) { throw new SyntaxError('JSON illisible'); } } });
    if (o.manuel) { enAttente.push({ action: corps.action, livrer: livrer, texte: texte }); return; }
    setTimeout(livrer, 0);
  });

  const stockage = () => { const d = {}; return {
    getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); },
    removeItem: (k) => { delete d[k]; }, __d: d }; };

  const ctx = {
    console: o.console || { log() {}, warn() {}, error() {} },
    document: doc,
    navigator: { onLine: !o.horsLigne, sendBeacon: (u) => { sorties.push('sendBeacon ' + u); return true; } },
    location: { search: '', href: 'http://127.0.0.1/tournoi.html', origin: 'http://127.0.0.1',
                protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1' },
    setTimeout: minuterie, clearTimeout, setInterval: intervalle, clearInterval,
    Promise, JSON, Math, Date, String, Number, Object, Array, Boolean, RegExp, Error, TypeError,
    SyntaxError, URL, URLSearchParams, AbortController, performance, isFinite, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, Intl,
    fetch: fetchSimule,
    sessionStorage: stockage(),
    localStorage: o.localStorage || stockage(),
    XMLHttpRequest: function () { sorties.push('XMLHttpRequest'); return { open() {}, send() {}, setRequestHeader() {} }; },
    WebSocket: function (u) { sorties.push('WebSocket ' + u); },
    EventSource: function (u) { sorties.push('EventSource ' + u); },
    Image: function () { const i = {}; Object.defineProperty(i, 'src', {
      set(v) { sorties.push('Image ' + v); externes.push(String(v)); } }); return i; }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.window.open = (u) => { sorties.push('window.open ' + u); };
  const ecouteursFenetre = {};
  ctx.window.addEventListener = (type, fn) => { (ecouteursFenetre[type] = ecouteursFenetre[type] || []).push(fn); };
  vm.createContext(ctx);

  MODULES.forEach((f) => {
    let source = lireJs(f);
    /* ⭐ LE RELAIS SE RÈGLE DANS `config.js`, LÀ OÙ IL VIT VRAIMENT. `SNAPSHOT_URL` y est une
       CONSTANTE : la réassigner après coup lèverait. On réécrit donc la ligne de configuration,
       exactement comme l'organisateur le ferait — ⛔ et JAMAIS vers un relais réel : l'adresse est
       un domaine `.invalid`, que le banc ferme de toute façon. */
    if (f === 'js/config.js' && o.relais) {
      source = source.replace(/const SNAPSHOT_URL = "";/,
        'const SNAPSHOT_URL = ' + JSON.stringify(o.relais.url) + ';');
      if (source.indexOf(o.relais.url) === -1) throw new Error('SNAPSHOT_URL introuvable dans config.js');
    }
    vm.runInContext(source, ctx, { filename: f });
  });

  const el = (id) => doc.getElementById(id);
  const tour = async (n) => { for (let i = 0; i < (n || 30); i++) await new Promise((r) => setTimeout(r, 0)); };

  return {
    ctx, doc, journal, sorties, externes, enAttente, el, tour, srv,
    requetes: () => journal.slice(),
    /** Ouvre la page comme le ferait `DOMContentLoaded`.
     *  ⛔ On N'ATTEND PAS la promesse d'`initTournoi` : en mode `manuel`, la première requête est
     *  RETENUE, donc cette promesse ne se dénouerait jamais et le banc se figerait. On laisse
     *  plutôt la page démarrer, puis on rend la main — c'est ce que fait un navigateur. */
    ouvrir: async () => {
      const p = vm.runInContext('initTournoi()', ctx);
      if (p && typeof p.catch === 'function') p.catch(() => {});
      await tour();
    },
    /** Le clic sur « Rafraîchir ». */
    rafraichir: async () => { el('btn-refresh').dispatchEvent({ type: 'click' }); await tour(); },
    /** Le clic sur « Réessayer » de l'écran d'indisponibilité. */
    reessayer: async () => { el('btn-reessayer').dispatchEvent({ type: 'click' }); await tour(); },
    /** Un clic d'onglet. */
    onglet: async (cle) => {
      doc.querySelectorAll('.onglet[data-onglet]').forEach((b) => {
        if (b.getAttribute('data-onglet') === cle) b.dispatchEvent({ type: 'click' });
      });
      await tour();
    },
    /** Une touche sur l'onglet actif (⭐ c'est ainsi qu'on éprouve la navigation au clavier). */
    touche: async (id, key) => { el(id).dispatchEvent({ type: 'keydown', key: key }); await tour(); },
    /** Déclenche un évènement de fenêtre (online / offline). */
    fenetre: async (type) => {
      (ecouteursFenetre[type] || []).slice().forEach((fn) => fn({ type }));
      await tour();
    },
    /** Déclenche PLUSIEURS signaux DANS LE MÊME TOUR, puis laisse la page réagir.
     *  ⭐ C'est la vraie forme d'une tempête : déverrouiller un téléphone en sortant d'un tunnel
     *  produit `visibilitychange` ET `online` à quelques millisecondes, pas à quelques secondes.
     *  ⛔ Les espacer d'un `await` fabriquerait trois besoins distincts, et ne prouverait rien. */
    signauxSimultanes: async (types) => {
      types.forEach((type) => {
        if (type === 'visibilitychange') {
          doc.hidden = false;
          ((doc.__ev || {})[type] || []).slice().forEach((fn) => fn({ type }));
        } else {
          (ecouteursFenetre[type] || []).slice().forEach((fn) => fn({ type }));
        }
      });
      await tour();
    },
    /** Livre une réponse retenue (mode `manuel`) — c'est LE pilotage des courses réseau. */
    livrer: async (i) => { const e = enAttente.splice(i, 1)[0]; if (!e) throw new Error('rien à livrer'); e.livrer(); await tour(); },
    /** L'état interne de la page, tel que `js/tournoi.js` le tient. */
    etat: () => vm.runInContext('JSON.parse(JSON.stringify(etatPublic))', ctx),
    /** Lit une expression DANS la page. ⭐ Les variables `let` du script ne sont PAS des propriétés
     *  du contexte : `ctx.matchs` vaut `undefined` alors que `matchs` existe. Sans ce lecteur, un
     *  contrôle sur les données résiduelles passerait toujours, pour de mauvaises raisons. */
    lireVm: (expression) => vm.runInContext(expression, ctx),
    texte: (id) => (el(id) ? String(el(id).textContent || '') : null),
    cache: (id) => (el(id) ? !!el(id).hidden : null),
    /** Coupe la boucle de rafraîchissement automatique (et elle seule). */
    arreterBoucle: () => vm.runInContext(
      'if (minuteurRafraichissement != null) { clearTimeout(minuteurRafraichissement); minuteurRafraichissement = null; }', ctx),
    /** Un tour de boucle AUTOMATIQUE, déclenché à la demande — ⛔ jamais en attendant le hasard. */
    tourAutomatique: async () => { await vm.runInContext('charger(false)', ctx); await tour(); },
    /** Coupe TOUT : plus un minuteur ne survit au banc. */
    fermer: () => { minuteurs.forEach((id) => { clearTimeout(id); clearInterval(id); }); minuteurs.clear(); }
  };
}

/** Un banc prêt : serveur + navigateur + page ouverte. */
async function banc(options) {
  const o = options || {};
  const srv = serveur(o.backend, o);
  const b = navigateur(srv, o);
  if (o.ouvrir !== false) {
    await b.ouvrir();
    /* ⛔ LA BOUCLE EST COUPÉE PAR DÉFAUT. Le temps du banc est accéléré mille fois : laissée
       libre, la boucle tirerait des dizaines de requêtes pendant qu'on observe un geste, et
       « zéro requête dupliquée » deviendrait invérifiable. On la relance À LA DEMANDE
       (`tourAutomatique`), ou on la laisse vivre avec `boucle: true`. */
    if (!o.boucle) b.arreterBoucle();
  }
  return b;
}

module.exports = { banc, serveur, navigateur, corpsPublic, lecteur, lecteurMele, AVANT,
                   BACKEND_AVANT, FRONTEND_AVANT_REV, BACKEND_AVANT_REV, RACINE, BACKEND,
                   MODULES, MPub, resumer, compteur: BC.compteur, git };
