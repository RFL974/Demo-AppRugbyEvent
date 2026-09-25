'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « PUBLICATION » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par
 *  tests/ecran-publication-surface.test.js et tests/ecran-publication-zero-appel.test.js.
 *
 *  ⭐ Navigateur : les VRAIS modules chargés par admin.html dans SON ordre (config, commun, dialog,
 *     api, admin, admin-infos-publication, admin-tableau-bord, le QR embarqué du dépôt) et la VRAIE
 *     carte `bloc-publication`, extraite telle quelle d'admin.html. Le mode guidé « Ciel & Verre »
 *     est joué par le VRAI `preparerPublication()` (js/ecrans.js) : c'est lui qui déplace les nœuds,
 *     et la question « un retour sur l'écran relit-il ? » ne se pose que dans cette mise en page.
 *  ⭐ Serveur : le VRAI Code.gs dans les doublures du banc de coût (backend/tests/banc-cout), sur le
 *     tournoi fictif PRÊT À PUBLIER, passerelle fictive configurée (monde-publication.js) — sans quoi
 *     « Publier » resterait grisé et le lien de la table de marque n'existerait jamais.
 *  ⭐ Transport RÉEL jusqu'au réseau : le vrai api.js ; seul `fetch` est simulé, et TOUTE porte de
 *     sortie réseau est comptée (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource,
 *     window.open, navigator.clipboard). ⛔ Rien ne peut sortir du banc.
 *
 *  ⭐ Référence « avant » FIGÉE — celle qui close le lot « Après-midi », lue dans git,
 *     ⛔ jamais `HEAD` : frontend 6212027e1b600032ead11b7fd489e2af5949c6fd ·
 *     backend ce7250dd5891cc54242529a6803acb843c873720.
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
const { completerPourPartenaires, cumulerDetails } =
  require(path.join(BACKEND, 'tests', 'banc-cout', 'instrumentation-partenaires'));
const MP = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-publication'));

const CLE_ADMIN = MP.CLE_ADMIN;

/* ⛔ Références FIGÉES d'avant le lot « Publication » — jamais HEAD, jamais un hash abrégé. */
const FRONTEND_AVANT_REV = '6212027e1b600032ead11b7fd489e2af5949c6fd';
const BACKEND_AVANT_REV = 'ce7250dd5891cc54242529a6803acb843c873720';
const git = (depot, rev, fichier) =>
  execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier],
    { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024 });
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
const BACKEND_COURANT = () => fs.readFileSync(path.join(BACKEND, 'Code.gs'), 'utf8');
const lecteur = (racine) => (f) => fs.readFileSync(path.join(racine || RACINE, f), 'utf8');
const LECTEUR_AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, f);
/** Lecteur MÊLÉ (cache du navigateur) : `avant` = fichiers servis dans leur version d'avant. */
const lecteurMele = (avant) => (f) => ((avant || []).indexOf(f) !== -1 ? LECTEUR_AVANT(f) : lecteur()(f));

/** Les modules chargés par admin.html dont l'écran dépend, dans SON ordre.
 *  ⛔ Les modules absents (invitations, suivi, réglages, terrains, partenaires, autorisation,
 *    feuille de journée) ne sont PAS remplacés par des doublures : l'écran « Publication » ne les
 *    appelle que sous `typeof === 'function'`, donc leur absence est le comportement RÉEL d'une
 *    page qui ne les aurait pas chargés. En simuler reviendrait à tester des doublures.
 *  ⭐ `admin-tableau-bord.js` est là parce que le garde-fou de « Publier » en DÉPEND réellement :
 *    `majVerrouPublier` relit `calculerEtatsEtapes()`. `ecrans.js` y est pour `preparerPublication`.
 *  ⭐ `vendor/qrcode.js` est la brique EMBARQUÉE du dépôt : les deux QR codes sont dessinés en
 *    local, et un banc qui la remplacerait ne prouverait pas qu'ils ne coûtent aucun appel. */
const MODULES = ['js/config.js', 'js/commun.js', 'js/dialog.js', 'js/api.js', 'js/admin.js',
                 'js/admin-infos-publication.js', 'js/admin-tableau-bord.js',
                 'js/vendor/qrcode.js', 'js/ecrans.js'];

/** ⭐ LES LIAISONS DE L'ÉCRAN, mot pour mot celles de `brancherEcouteursAdmin` (js/admin.js).
 *  ⛔ Toute divergence est un ÉCHEC de `ecran-publication-surface`, pas une adaptation du banc. */
const LIAISONS_ECRAN = [
  "ecouter('bouton-publier', 'click', onPublier);",
  "ecouter('bouton-copier-adresse-publique', 'click', onCopierAdressePublique);",
  "ecouter('bouton-ouvrir-page-publique', 'click', onOuvrirPagePublique);",
  "ecouter('bouton-copier-qr-public', 'click', onCopierQrPublic);"
];

/** Les identifiants des gestes LOCAUX de la carte : ⛔ aucun ne doit émettre un appel métier. */
const GESTES_LOCAUX = ['bouton-copier-adresse-publique', 'bouton-ouvrir-page-publique',
                       'bouton-copier-qr-public', 'bouton-copier-qr-saisie'];

/** ⭐ LES TROIS CARTES DU BANC, et pourquoi elles y sont toutes les trois.
 *  · `bloc-publication` EST l'écran mesuré ;
 *  · `bloc-infos-tournoi` et `bloc-cadre-tournoi` appartiennent aux écrans « Infos du tournoi » et
 *    « Date & conformité FFR », HORS PÉRIMÈTRE et non modifiés par ce lot. Ils sont ici parce que
 *    « Publier » en DÉPEND réellement : `onPublier` envoie `lireInfosTournoi()` fusionné à
 *    `lireCadreTournoi()` — les champs de CES deux formulaires — puis repeint la carte « Infos »
 *    par `majInfosTournoi()`. ⛔ Les remplacer par des champs inventés ferait mesurer un
 *    formulaire qui n'existe pas, et masquerait ce que la publication enregistre vraiment. */
const BLOCS = ['bloc-cadre-tournoi', 'bloc-infos-tournoi', 'bloc-publication'];

/** Les cartes de l'écran, extraites d'admin.html telles qu'elles y sont écrites, plus les nœuds
 *  d'infrastructure que les modules cherchent (écran de chargement). */
function carterPublication(html) {
  const carte = (id) => {
    const ancre = html.indexOf('id="' + id + '"');
    if (ancre === -1) throw new Error('carte introuvable : ' + id);
    /* ⛔ `lastIndexOf` ET PAS une recherche en avant : la carte précédente se termine quelques
       lignes plus haut, et une recherche en avant attraperait SA balise ouvrante. */
    const debut = html.lastIndexOf('<section class="carte', ancre);
    if (debut === -1) throw new Error('balise de carte introuvable : ' + id);
    /* ⭐ La DERNIÈRE section imbriquée connue sert d'ancre de fin pour `bloc-publication`, qui
       contient un `<details>` mais aucune section fille ; les deux autres se ferment sur la
       première `</section>` qui suit. ⛔ Aucune heuristique de comptage : une ancre nommée. */
    const depuis = id === 'bloc-publication' ? html.indexOf('id="acces-saisie-litige"', ancre) : ancre;
    const fin = html.indexOf('</section>', depuis);
    if (fin === -1) throw new Error('fin de carte introuvable : ' + id);
    return html.slice(debut, fin + 10);
  };
  return BLOCS.map(carte).join('\n') +
    '<div id="ecran-chargement-attente" hidden></div><div id="ecran-chargement-erreur" hidden></div>' +
    '<div id="ecran-chargement-message"></div>';
}

/**
 * Le serveur : le vrai Code.gs sur le tournoi fictif prêt à publier, instrumenté finement.
 * @param {string} source  le texte de Code.gs
 * @param {object} [opt]   passé à `peuplerPublication` (ex. `{ publie: 'oui' }`)
 */
function serveur(source, opt) {
  const m = completerPourPartenaires(chargerBanc(source, (w) => MP.peuplerPublication(w, opt || {})));
  m.publie = () => MP.drapeauPublie(m);
  m.acces = () => MP.ligneAcces(m);
  m.empreinteConfig = () => MP.empreinteConfig(m);
  /** L'état de l'accès tel que le serveur le rend (⛔ hors de toute fenêtre de mesure d'un geste). */
  m.etatAcces = () => m.postMesure({ action: 'getAccesScoresAdmin', cle: CLE_ADMIN }, 'sonde').reponse;
  /** Amène l'accès dans un état donné, par les VRAIES transitions du serveur. */
  m.amenerAcces = (transitions) => {
    let n = 0;
    (transitions || []).forEach((t) => {
      const e = m.etatAcces();
      m.postMesure({ action: 'changerAccesScores', cle: CLE_ADMIN, transition: t,
        version_lue: String(e.version), requete_id: 'adm-banc-' + (++n) }, 'sonde');
    });
    return m.etatAcces();
  };
  return m;
}

/**
 * Le navigateur : vrais modules, vraie carte, `fetch` simulé vers le vrai backend.
 * @param {object} srv      un `serveur(...)`
 * @param {function} lireJs lecteur de fichiers du frontend (courant, figé ou mêlé)
 * @param {object} [options] { dialogues: [], pannes: {action: 'silence'|'reseau'|'perdue'},
 *                             cle, presse: 'ok'|'ko', modeEcrans: true }
 */
function navigateur(srv, lireJs, options) {
  const o = options || {};
  const doc = BC.creerDocument();

  /* ⭐ DE VRAIS ÉCOUTEURS, avec bouillonnement : les gestes doivent passer par les écouteurs que
     `ecouter` pose vraiment, sinon une suite « zéro appel » ne prouverait rien.
     ⭐ ET DE VRAIS DÉPLACEMENTS DE NŒUDS. `preparerPublication()` (js/ecrans.js) ne recrée rien :
     il DÉPLACE les boutons, les messages et les QR du HTML dans ses deux cartes. Un `appendChild`
     qui ne détacherait pas le nœud de son ancien parent le laisserait dans les DEUX endroits, et
     le banc compterait deux fois chaque bouton. Le prototype du petit DOM est donc complété une
     seule fois, ici, avec exactement ce que l'écran utilise. */
  (function completerDom() {
    const proto = Object.getPrototypeOf(doc.createElement('div'));
    if (proto.__complete) return;
    proto.__complete = true;
    proto.addEventListener = function (type, fn) {
      if (!this.__ev) this.__ev = {};
      (this.__ev[type] = this.__ev[type] || []).push(fn);
    };
    proto.removeEventListener = function (type, fn) {
      if (!this.__ev || !this.__ev[type]) return;
      this.__ev[type] = this.__ev[type].filter((f) => f !== fn);
    };
    proto.scrollIntoView = function () {};
    proto.focus = function () {};
    proto.click = function () { this.dispatchEvent({ type: 'click' }); };
    proto.dispatchEvent = function (brut) {
      const ev = Object.assign({ type: 'click', target: this, key: '',
        preventDefault() {}, stopPropagation() {} }, brut || {});
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
    /* ⭐ DÉTACHER PUIS RATTACHER — la sémantique du DOM, et ce qui rend `preparerPublication`
       mesurable : un nœud n'a qu'un parent. */
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
    proto.remove = function () {
      if (this.parentNode) this.parentNode.removeChild(this);
    };
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
    /* `insertAdjacentHTML` sert aux DEUX QR codes (dessinés en local). ⛔ Seules les deux
       positions réellement employées par l'écran sont admises : inventer les autres donnerait
       une fausse impression de couverture. */
    proto.insertAdjacentHTML = function (position, html) {
      const bac = doc.createElement('div');
      bac.innerHTML = String(html);
      const morceaux = bac.enfants.slice();
      if (position === 'afterbegin') {
        morceaux.reverse().forEach((m) => this.insertBefore(m, this.enfants[0] || null));
      } else if (position === 'beforeend') {
        morceaux.forEach((m) => this.appendChild(m));
      } else {
        throw new Error('position non gérée par le banc : ' + position);
      }
    };
    /* ⭐ `href` RÉFLÉCHI, comme dans un navigateur : `lien.href = url` doit se relire par
       `getAttribute('href')`. Deux contrôles en dépendent — l'adresse publique et le bouton
       d'ouverture de la table de marque. */
    Object.defineProperty(proto, 'href', {
      configurable: true,
      get() { return this.attrs.href === undefined ? '' : this.attrs.href; },
      set(v) { this.attrs.href = String(v); }
    });
    Object.defineProperty(proto, 'children', {
      configurable: true, get() { return this.enfants.filter((e) => e.tag); }
    });
    Object.defineProperty(proto, 'firstElementChild', {
      configurable: true, get() { return this.children[0] || null; }
    });
    /* ⭐ UN CANVAS PUREMENT LOCAL, pour « Copier le QR code » : il calcule des pixels en mémoire
       et rend un Blob fictif. ⛔ Aucune image n'est chargée, aucune adresse n'est appelée. */
    proto.getContext = function (type) {
      if (this.tag !== 'canvas' || type !== '2d') return null;
      if (!this.__dessin) {
        const trace = [];
        this.__trace = trace;
        this.__dessin = { fillStyle: '', fillRect: (x, y, l, h) => { trace.push([x, y, l, h]); } };
      }
      return this.__dessin;
    };
    proto.toBlob = function (rappel, type) {
      if (this.tag !== 'canvas') return undefined;
      const rects = (this.__trace || []).length;
      return rappel({ type: type || 'image/png', size: rects, __fictif: true });
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
  const corps = [];       // le corps COMPLET de chaque POST (pour lire renvoyer_etat, requete_id…)
  const sorties = [];     // TOUTE sortie du navigateur vers l'extérieur, au plus bas niveau
  const dialogues = [];   // questions posées à l'organisateur
  const presse = [];      // ce qui est écrit dans le presse-papiers
  const details = [];     // le relevé fin du serveur, requête par requête
  const reponses = (o.dialogues || []).slice();
  doc.body.innerHTML = carterPublication(lireJs('admin.html'));

  /* ⭐ LE TEMPS EST COMPRIMÉ : un délai de 30 s du frontend dure 150 ms ici. C'est ce qui rend les
     délais bornés observables en quelques tours de boucle.
     ⚠️ LE FACTEUR N'EST PAS 1 000, ET C'EST DÉLIBÉRÉ. À ÷1 000, le délai d'ouverture de
     l'administration (30 s) devient 30 ms de temps RÉEL — et `performance.now()`, lui, n'est pas
     comprimé. Sur une machine chargée (la suite entière tourne en parallèle), le banc mettait
     parfois plus de 30 ms à servir `getAll` : api.js abandonnait et réémettait la lecture, et le
     compte de requêtes de l'ouverture passait de 2 à 3. ⛔ Un banc qui dépend de la charge de la
     machine ne mesure plus rien. À ÷200, la marge est vingt fois plus grande, et les contrôles de
     délai restent observables (400 tours de boucle ≈ 400 ms > 150 ms).
     ⚠️ CE QUE CETTE COMPRESSION NE PROUVE PAS : que l'attente se dénoue à la seconde annoncée.
     Elle prouve qu'elle SE DÉNOUE et que la cause est nommée. */
  const COMPRESSION_TEMPS = 200;
  const minuterie = (fn, ms, ...args) =>
    setTimeout(fn, Math.max(0, Math.round((Number(ms) || 0) / COMPRESSION_TEMPS)), ...args);

  const fetchSimule = (adresse, reglages) => new Promise((resolve, reject) => {
    const r = reglages || {};
    sorties.push('fetch ' + String(adresse));
    /* ⭐ LE SIGNAL D'ABANDON EST HONORÉ, comme le ferait un vrai navigateur. ⛔ Sans cela, un
       délai borné serait INOBSERVABLE : api.js pose bien son `AbortController`, mais rien ne
       l'écouterait, et le banc conclurait à tort qu'aucun délai ne borne l'attente. */
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
    if (panne === '404') {
      setTimeout(() => resolve({ ok: false, status: 404, json: async () => ({}) }), 0);
      return;
    }
    if (panne === 'perdue') {
      /* ⭐ LA REQUÊTE ABOUTIT CÔTÉ SERVEUR, la réponse n'arrive jamais au navigateur. C'est le
         seul moyen honnête d'éprouver ce que l'écran OSE dire après une réponse perdue. */
      try {
        const s = methode === 'POST' ? srv.postMesure(demande, demande.action)
                                     : srv.getMesure(demande, demande.action);
        details.push(s.detail);
      } catch (e) { /* le classeur garde ce qu'il a pu écrire */ }
      setTimeout(() => reject(new TypeError('Failed to fetch')), 0);
      return;
    }
    let sortie;
    try {
      sortie = methode === 'POST' ? srv.postMesure(demande, demande.action)
                                  : srv.getMesure(demande, demande.action);
    } catch (e) {
      setTimeout(() => resolve({ ok: false, status: 500, json: async () => ({ error: String(e.message) }) }), 0);
      return;
    }
    details.push(sortie.detail);
    const texte = JSON.stringify(sortie.reponse);
    setTimeout(() => resolve({ ok: true, status: 200, json: async () => JSON.parse(texte) }), 0);
  });

  /* ⭐ LE PRESSE-PAPIERS EST UNE SORTIE, et elle est comptée comme telle — mais ⛔ ce n'est PAS un
     appel réseau : la suite « zéro appel » doit pouvoir distinguer les deux. */
  const presseOk = o.presse !== 'ko';
  const clipboard = {
    writeText: async (t) => {
      sorties.push('clipboard.writeText');
      if (!presseOk) throw new Error('presse-papiers indisponible');
      presse.push(String(t));
    },
    write: async (items) => {
      sorties.push('clipboard.write');
      if (!presseOk) throw new Error('copie d’image indisponible');
      presse.push('[image]');
      return items;
    }
  };

  const ctx = {
    console: o.console || { log() {}, warn() {}, error() {} },
    document: doc,
    navigator: { onLine: true, clipboard: clipboard,
                 sendBeacon: (u) => { sorties.push('sendBeacon ' + u); return true; } },
    location: { search: '', href: 'http://127.0.0.1/admin.html', origin: 'http://127.0.0.1',
                protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1' },
    setTimeout: minuterie, clearTimeout, setInterval: minuterie, clearInterval,
    Promise, JSON, Math, Date, String, Number, Object, Array, Boolean, RegExp, Error, TypeError,
    SyntaxError, Map, Set, Uint8Array, Intl,
    URL, URLSearchParams, AbortController, performance, isFinite, parseInt, parseFloat, encodeURIComponent,
    decodeURIComponent, atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    /* ⛔ Un Blob qui ne peut rien envoyer : il ne sert qu'à la copie du QR en image. */
    Blob: function (parties, opts) { this.parties = parties; this.type = (opts || {}).type || ''; },
    ClipboardItem: function (donnees) { this.donnees = donnees; },
    crypto: { randomUUID: (function () { let n = 0; return () => 'fictif-' + String(++n).padStart(8, '0'); })() },
    fetch: fetchSimule,
    sessionStorage: (function () { const d = {}; return {
      getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); },
      removeItem: (k) => { delete d[k]; } }; })(),
    localStorage: (function () { const d = {}; return {
      getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); },
      removeItem: (k) => { delete d[k]; } }; })(),
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
  vm.createContext(ctx);

  MODULES.forEach((f) => { vm.runInContext(lireJs(f), ctx, { filename: f }); });

  ctx.sessionStorage.setItem('r92_cle_admin', o.cle === undefined ? CLE_ADMIN : o.cle);
  ctx.dialogConfirmer = async (message, opts) => {
    dialogues.push({ message: String(message), opts: opts || {} });
    return reponses.length ? reponses.shift() : true;
  };
  ctx.dialogAlerter = async (message) => { dialogues.push({ message: String(message), alerte: true }); };
  ctx.dialogDemander = async (message, valeur) => {
    dialogues.push({ message: String(message), valeur: String(valeur == null ? '' : valeur) });
    return reponses.length ? reponses.shift() : CLE_ADMIN;
  };
  vm.runInContext('dialogConfirmer = this.dialogConfirmer; dialogDemander = this.dialogDemander;' +
    ' dialogAlerter = this.dialogAlerter;', ctx);
  vm.runInContext('definirAdminConnecte(true);', ctx);

  const el = (id) => doc.getElementById(id);
  const tour = async (n) => { for (let i = 0; i < (n || 14); i++) await new Promise((r) => setTimeout(r, 0)); };

  /**
   * L'OUVERTURE DE L'ADMINISTRATION, telle que `chargerAdmin()` la joue pour cet écran : les deux
   * lectures d'ouverture, puis les liaisons, puis `majAccesSaisie()` (branchement, ⛔ sans réseau),
   * puis `majPublication()`.
   * ⛔ `chargerAdmin()` en entier n'est pas jouable ici : il appelle les gestionnaires des dix
   *   autres modules d'admin.html, que ce banc ne charge pas. Les déclarer en doublures
   *   reviendrait à tester des doublures. On joue donc EXACTEMENT ses lignes de cet écran — et
   *   `ecran-publication-surface` vérifie, ligne à ligne, que `LIAISONS_ECRAN` est bien la liste
   *   d'`admin.js` : le banc ne peut pas dériver de la page sans qu'un contrôle tombe.
   */
  async function ouvrir() {
    /* ⭐ LES DEUX LECTURES D'OUVERTURE PARTENT PAR LE VRAI `ouvrirSessionAdmin()` — donc par le vrai
       api.js, avec ses délais et son rejeu : elles sont comptées comme les autres, et une panne
       injectée sur `getAll` ou `getConfigAdmin` se comporte comme en vrai. */
    const session = await vm.runInContext('ouvrirSessionAdmin()', ctx);
    await tour();
    if (!session.connecte) return session;
    ctx.__cfg = session.cfg; ctx.__data = session.data;
    vm.runInContext('configCourante = this.__cfg; equipesCourantes = this.__data.equipes;' +
      ' matchsCourants = this.__data.matchs || [];', ctx);
    vm.runInContext(LIAISONS_ECRAN.join('\n'), ctx);
    vm.runInContext('majAccesSaisie();', ctx);       // branchement des gestes de la table de marque
    /* ⭐ DANS L'ORDRE DE `chargerAdmin()`, et cet ordre COMPTE : `majInfosTournoi()` remplit le
       formulaire d'infos AVANT que la publication soit peinte. ⛔ Sans lui, le formulaire resterait
       vide et « Publier » — qui enregistre les infos saisies — EFFACERAIT le nom, le lieu,
       l'adresse et la description du tournoi. Le banc mesurerait alors cinq cellules écrites qui
       n'ont rien à voir avec la publication. */
    vm.runInContext('majInfosTournoi();', ctx);
    vm.runInContext('majPublication();', ctx);       // ⭐ LE point d'entrée de l'écran
    await tour();
    if (o.modeEcrans !== false) vm.runInContext('preparerPublication();', ctx);   // mode « Ciel & Verre »
    await tour();
    return session;
  }

  const banc = {
    ctx, doc, journal, corps, sorties, dialogues, presse, details, el, tour,
    requetes: () => journal.slice(),
    demandes: () => corps.slice(),
    cumul: () => cumulerDetails(details),
    /** Remet les compteurs à zéro : ce qui précède n'est pas le geste que l'on mesure. */
    remettre: () => { journal.length = 0; corps.length = 0; sorties.length = 0;
                      dialogues.length = 0; presse.length = 0; details.length = 0; },
    texte: (id) => String((el(id) || {}).textContent || ''),
    /** L'ouverture, compteurs GARDÉS : c'est un parcours à mesurer comme les autres. */
    ouvrir,
    /** L'ouverture, compteurs REMIS À ZÉRO : point de départ des gestes. */
    amorcer: async () => { await ouvrir(); banc.remettre(); },
    /** ⭐ L'ARRIVÉE SUR L'ÉCRAN — le point de passage UNIQUE des deux parcours guidés
     *  (`ecransActiver` sur ordinateur, `allerA` sur mobile appellent tous deux celui-ci). */
    arriver: async (tours) => {
      const p = vm.runInContext('ouvrirEtapeAdmin("publication")', ctx);
      await tour(tours);
      return p;
    },
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
    },
    /** Un geste de la table de marque, par son VRAI bouton rendu par `rendreAccesScores`. */
    boutonGeste: (action) => doc.querySelectorAll('[data-geste-acces]')
      .find((b) => b.getAttribute('data-geste-acces') === action) || null,
    clicGeste: async (action, tours) => {
      const b = banc.boutonGeste(action);
      if (!b) throw new Error('geste absent de l\'écran : ' + action);
      b.dispatchEvent({ type: 'click', target: b });
      await tour(tours);
    },
    clicGesteSansAttendre: (action) => {
      const b = banc.boutonGeste(action);
      if (!b) throw new Error('geste absent de l\'écran : ' + action);
      b.dispatchEvent({ type: 'click', target: b });
    },
    /** Les gestes que l'écran propose réellement, dans l'ordre où il les peint. */
    gestesOfferts: () => doc.querySelectorAll('[data-geste-acces]')
      .filter((b) => !b.hidden).map((b) => b.getAttribute('data-geste-acces')),
    /** L'état mémorisé par l'écran — ⭐ toujours celui que le SERVEUR a rendu. */
    etatEcran: () => vm.runInContext('accesScoresCourant', ctx),
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
  b.srv = srv;
  if (o.amorcer === false) return b;
  await (o.garderOuverture ? b.ouvrir() : b.amorcer());
  return b;
}

module.exports = { banc, serveur, navigateur, carterPublication, LIAISONS_ECRAN, GESTES_LOCAUX, BLOCS,
  MODULES, lecteur, lecteurMele, LECTEUR_AVANT, BACKEND_AVANT, BACKEND_COURANT,
  FRONTEND_AVANT_REV, BACKEND_AVANT_REV, RACINE, BACKEND, CLE_ADMIN, git, MP,
  compteur: BC.compteur, cumulerDetails };
