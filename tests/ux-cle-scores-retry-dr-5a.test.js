/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — une PANNE pendant la vérification de la clé scores
 *  se réessaie d'un clic, sans retaper la clé
 *  Chantier UX-CLE-SCORES-RETRY-DR-5A
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/ux-cle-scores-retry-dr-5a.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *
 *  LE DÉFAUT CORRIGÉ. Quand le réseau (ou le serveur) tombait pendant la vérification de la
 *  clé scores, `connexion()` et `demanderCleValide()` affichaient une alerte puis
 *  abandonnaient : la clé tapée, gardée dans une variable locale, était perdue. Pour
 *  réessayer, il fallait la RETAPER.
 *
 *  CE QU'IL PROTÈGE — treize promesses, numérotées comme la demande du lot :
 *   ①  une panne à la première vérification est reconnue comme une panne ;
 *   ②  après la panne, rien n'est mémorisé (ni sessionStorage, ni localStorage) ;
 *   ③  la clé n'est ni affichée, ni journalisée, ni placée dans le HTML ;
 *   ④  aucun réessai ne part tout seul ;
 *   ⑤  un bouton « Réessayer » explicite est proposé ;
 *   ⑥  le réessai revérifie la MÊME clé, sans nouvelle saisie ;
 *   ⑦  la deuxième vérification peut réussir ;
 *   ⑧  la clé n'est rangée qu'APRÈS cette réponse positive ;
 *   ⑨  l'action métier ne part qu'après, une fois au plus, et n'est jamais rejouée ;
 *   ⑩  une clé refusée est oubliée et jamais mémorisée ;
 *   ⑪  une annulation efface la valeur temporaire ;
 *   ⑫  la clé admin et les dialogues ordinaires ne changent pas ;
 *   ⑬  aucun écouteur ni dialogue n'est dédoublé.
 *
 *  Deux parcours RÉELS portent ① à ⑨ :
 *   P — l'ouverture de saisie.html (`initSaisie` → `connexion('scores', …)`) ;
 *   C — « Corriger » un score définitif (clic réel → `demanderCleValide('scores', …)`).
 *
 *  ⭐ IL EXÉCUTE LE CODE RÉEL : js/commun.js, js/dialog.js, js/api.js et js/saisie.js sont
 *  chargés ENTIERS, dans l'ordre de saisie.html, sur un DOM doublé, un faux réseau, un faux
 *  stockage et une console espionne. ⛔ Rien n'est recopié.
 *
 *  ⭐ ET IL SE PROUVE LUI-MÊME (§ Z) : le code d'AVANT est reconstruit et rejoué ; il doit
 *  reproduire le défaut. Deux mutants (clé rangée trop tôt, réessai automatique) doivent
 *  aussi être détectés. Sinon, ce fichier ÉCHOUE.
 *
 *  ⚠️ LES « CLÉS » UTILISÉES ICI SONT ENTIÈREMENT FACTICES. Elles sont inventées pour ce
 *  fichier, n'ouvrent rien, et n'ont jamais été de vraies clés. ⛔ Aucune requête ne quitte
 *  ce processus : le faux serveur vit ici, sur un domaine réservé qui ne résout jamais.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

/** ⚠️ Valeurs FACTICES — inventées pour ce test, elles n'ouvrent rien. */
const CLE_FACTICE = 'CLE-FACTICE-5A-jamais-reelle';
const CLE_FAUSSE = 'CLE-FAUSSE-5A-refusee-par-le-faux-serveur';
const SONDE = '__verif_cle__';
const API_URL_FACTICE = 'https://exemple.invalid/exec';   // ⛔ domaine réservé (RFC 2606)

/** Nombre de tours de boucle laissés au code pour « partir tout seul » s'il le voulait. */
const PATIENCE = 200;

/* ========================================================================== */
/*  DOUBLURE DE DOM — parenté, sélecteurs simples, propagation des clics.      */
/* ========================================================================== */

/**
 * ⭐ FIDÉLITÉS QUI COMPTENT ICI :
 *  · `element.value` est une PROPRIÉTÉ : elle n'apparaît pas dans `outerHTML` (comme un vrai
 *    DOM), alors qu'un `setAttribute('value', …)` y apparaîtrait ;
 *  · un clic part de la cible, remonte ses ancêtres, puis atteint `document` — les écouteurs
 *    délégués de saisie.js le reçoivent donc, comme dans la page ;
 *  · un sélecteur que la doublure ne sait pas lire LÈVE : un chemin de code inattendu se voit.
 */
function fabriquerDom() {
  const crees = [];
  const ecouteursDoc = [];                       // écouteurs ACTUELLEMENT posés sur `document`
  const stats = { maxDialogues: 0, maxClavier: 0, dialogues: [] };

  function correspond(el, simple) {
    const m = /^([a-z]*)((?:\.[\w-]+)*)$/i.exec(simple.trim());
    if (!m || (!m[1] && !m[2])) throw new Error('HARNAIS : sélecteur non pris en charge « ' + simple + ' »');
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    return m[2].split('.').filter(Boolean).every((c) => el.classList.contains(c));
  }
  const selectionne = (el, sel) => sel.split(',').some((s) => correspond(el, s));

  function estAttache(el) {
    for (let n = el; n; n = n.parent) {
      if (n === doc.head || n === doc.body || n === doc.documentElement) return true;
    }
    return false;
  }

  const dialoguesOuverts = () => doc.body.enfants.filter((e) => e.classList.contains('dlg-overlay'));

  /** Ce qu'un dialogue montre : sa nature, son message, ses boutons, son champ éventuel. */
  function decrireDialogue(overlay) {
    const tous = [];
    (function parcourir(n) { n.enfants.forEach((e) => { tous.push(e); parcourir(e); }); })(overlay);
    const champ = tous.find((e) => e.classList.contains('dlg-input')) || null;
    const boutons = tous.filter((e) => e.tagName === 'BUTTON');
    const msg = tous.find((e) => e.classList.contains('dlg-msg'));
    return {
      overlay, champ, boutons,
      message: msg ? msg.textContent : '',
      libelles: boutons.map((b) => b.textContent),
      nature: champ ? 'saisie' : (boutons.length > 1 ? 'choix' : 'alerte'),
      masque: !!champ && champ.type === 'password'
    };
  }

  function noterDialogue(overlay) {
    stats.maxDialogues = Math.max(stats.maxDialogues, dialoguesOuverts().length);
    const d = decrireDialogue(overlay);
    d.valeurInitiale = d.champ ? d.champ.value : null;     // pré-remplissage éventuel du champ
    stats.dialogues.push(d);
  }

  function creer(tag) {
    const classes = new Set();
    const attributs = {};
    const ecouteurs = {};
    const enfants = [];
    const el = {
      tagName: String(tag).toUpperCase(), enfants, attributs, ecouteurs, parent: null,
      id: '', textContent: '', innerHTML: '', value: '', placeholder: '', type: '', autocomplete: '',
      spellcheck: undefined, disabled: false, hidden: false,
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => { classes.add(c); },
        remove: (c) => { classes.delete(c); },
        toggle: (c, f) => {
          const v = (f === undefined) ? !classes.has(c) : !!f;
          if (v) classes.add(c); else classes.delete(c);
          return v;
        }
      },
      get className() { return Array.from(classes).join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      setAttribute(n, v) { attributs[n] = String(v); },
      getAttribute(n) { return Object.prototype.hasOwnProperty.call(attributs, n) ? attributs[n] : null; },
      removeAttribute(n) { delete attributs[n]; },
      appendChild(e) {
        if (e.parent) e.remove();
        e.parent = el;
        enfants.push(e);
        if (el === doc.body && e.classList.contains('dlg-overlay')) noterDialogue(e);
        return e;
      },
      remove() {
        if (!el.parent) return;
        const fratrie = el.parent.enfants;
        const i = fratrie.indexOf(el);
        if (i !== -1) fratrie.splice(i, 1);
        el.parent = null;
      },
      addEventListener(t, fn) { (ecouteurs[t] = ecouteurs[t] || []).push(fn); },
      removeEventListener(t, fn) { if (ecouteurs[t]) ecouteurs[t] = ecouteurs[t].filter((f) => f !== fn); },
      focus() { el.aEuLeFocus = true; },
      select() {},
      click() { return propager(el, 'click'); },
      closest(sel) {
        for (let n = el; n; n = n.parent) if (selectionne(n, sel)) return n;
        return null;
      },
      querySelectorAll(sel) {
        const r = [];
        (function parcourir(n) {
          n.enfants.forEach((e) => { if (selectionne(e, sel)) r.push(e); parcourir(e); });
        })(el);
        return r;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      insertAdjacentHTML(pos, html) { el.htmlInsere = (el.htmlInsere || '') + html; },
      // Sérialisation : ATTRIBUTS et texte seulement — jamais la PROPRIÉTÉ `value`.
      get outerHTML() {
        const a = [];
        if (el.className) a.push('class="' + el.className + '"');
        if (el.id) a.push('id="' + el.id + '"');
        if (el.type) a.push('type="' + el.type + '"');
        if (el.autocomplete) a.push('autocomplete="' + el.autocomplete + '"');
        if (el.placeholder) a.push('placeholder="' + el.placeholder + '"');
        Object.keys(attributs).forEach((n) => a.push(n + '="' + attributs[n] + '"'));
        const dedans = el.innerHTML + (el.htmlInsere || '') +
          enfants.map((e) => e.outerHTML).join('') + (el.textContent || '');
        return '<' + tag + (a.length ? ' ' + a.join(' ') : '') + '>' + dedans + '</' + tag + '>';
      }
    };
    crees.push(el);
    return el;
  }

  /** Un clic réel : la cible, puis ses ancêtres, puis `document`. Rend ce que `document` a rendu. */
  function propager(cible, type) {
    const ev = { type, target: cible, preventDefault() {}, stopPropagation() {} };
    for (let n = cible; n; n = n.parent) (n.ecouteurs[type] || []).slice().forEach((fn) => fn(ev));
    return ecouteursDoc.filter((x) => x.t === type).slice().map((x) => x.fn(ev));
  }

  /** Une touche du clavier, telle que la reçoivent les écouteurs posés sur `document`. */
  function touche(key) {
    const ev = { key, preventDefault() {} };
    ecouteursDoc.filter((x) => x.t === 'keydown').slice().forEach((x) => x.fn(ev));
  }

  const doc = {
    head: null, body: null, documentElement: null,
    getElementById(id) { return crees.find((e) => e.id === id && estAttache(e)) || null; },
    createElement: creer,
    querySelector(sel) { return doc.body.querySelector(sel); },
    querySelectorAll(sel) { return doc.body.querySelectorAll(sel); },
    addEventListener(t, fn) {
      ecouteursDoc.push({ t, fn });
      stats.maxClavier = Math.max(stats.maxClavier, ecouteursDoc.filter((x) => x.t === 'keydown').length);
    },
    removeEventListener(t, fn) {
      const i = ecouteursDoc.findIndex((x) => x.t === t && x.fn === fn);
      if (i !== -1) ecouteursDoc.splice(i, 1);
    }
  };
  doc.head = creer('head');
  doc.body = creer('body');
  doc.documentElement = creer('html');

  return { document: doc, ecouteursDoc, stats, propager, touche, dialoguesOuverts, decrireDialogue };
}

/* ========================================================================== */
/*  FAUX RÉSEAU — chaque requête est inscrite ; les POST suivent un plan écrit. */
/* ========================================================================== */

const repJson = (corps) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) });

/** Les réponses que le faux serveur sait donner, désignées par leur nom dans un plan. */
const REPONSES = {
  'panne-reseau':      () => Promise.reject(new TypeError('Failed to fetch')),
  'panne-http-500':    () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
  'panne-http-503':    () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
  'sentinelle-scores': () => repJson({ error: 'Match introuvable : ' + SONDE }),
  'sentinelle-admin':  () => repJson({ error: 'Équipe introuvable : ' + SONDE }),
  'refus':             () => repJson({ error: 'Clé incorrecte.', acces_refuse: true }),
  'succes-metier':     () => repJson({ success: true, match: { score_A: '3', score_B: '1' } })
};

/**
 * ⛔ Un POST que le plan n'a pas prévu reçoit une promesse qui ne se résout JAMAIS : il est
 *    inscrit (donc visible), mais il ne peut ni réussir ni faire boucler un code fautif.
 */
function fabriquerReseau(plan) {
  const requetes = [];
  const imprevus = [];
  const etat = { postsLivres: 0, derniere: null };
  function fetch(url, opts) {
    const u = new URL(String(url));
    if (u.origin !== new URL(API_URL_FACTICE).origin) {
      return Promise.reject(new Error('HARNAIS : requête hors du faux serveur (' + u.origin + ')'));
    }
    const methode = (opts && opts.method) || 'GET';
    const corps = (methode === 'POST') ? JSON.parse(opts.body) : null;
    const req = {
      n: requetes.length + 1, methode, corps,
      action: corps ? corps.action : u.searchParams.get('action'),
      estSonde: !!corps && (corps.id_match === SONDE || corps.id_equipe === SONDE)
    };
    req.estMetier = (methode === 'POST') && !req.estSonde;
    requetes.push(req);
    if (methode === 'GET') {
      if (req.action === 'getAll') return repJson({ equipes: [], matchs: [], config: {} });
      if (req.action === 'getCapacitesCategories') return repJson({ categories: {} });
      imprevus.push(req);
      return new Promise(function () {});
    }
    const issue = plan.shift();
    if (!issue) { imprevus.push(req); return new Promise(function () {}); }
    req.issue = issue;
    const conclure = () => { etat.postsLivres++; etat.derniere = issue; };
    return REPONSES[issue]().then((r) => { conclure(); return r; }, (e) => { conclure(); throw e; });
  }
  return {
    fetch, requetes, imprevus, etat,
    posts: () => requetes.filter((r) => r.methode === 'POST'),
    sondes: () => requetes.filter((r) => r.estSonde),
    metier: () => requetes.filter((r) => r.estMetier)
  };
}

/** Un stockage qui inscrit CHAQUE écriture, avec l'état du réseau à cet instant précis. */
function fabriquerStockage(nom, ecritures, reseau) {
  const m = new Map();
  const noter = (k, v) => ecritures.push({
    ou: nom, k, v, postsLivres: reseau.etat.postsLivres, derniere: reseau.etat.derniere
  });
  return {
    donnees: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { noter(k, String(v)); m.set(k, String(v)); },
    removeItem: (k) => { noter(k, null); m.delete(k); },
    clear: () => m.clear()
  };
}

/* ========================================================================== */
/*  BANC — un onglet « saisie.html » neuf, avec les quatre scripts RÉELS.       */
/* ========================================================================== */

const BANCS = [];   // les bancs des parcours « normaux » : le § ⑬ les passe tous en revue

function banc(o) {
  o = o || {};
  const dom = fabriquerDom();
  // Les éléments statiques de saisie.html dont initSaisie() a besoin.
  ['liste-matchs', 'filtre-cat-saisie', 'select-cat-saisie', 'filtre-terrain-saisie',
    'select-terrain-saisie', 'bouton-rafraichir-saisie', 'maj-saisie'].forEach(function (id) {
    const el = dom.document.createElement('div');
    el.id = id;
    dom.document.body.appendChild(el);
  });
  const reseau = fabriquerReseau((o.plan || []).slice());
  const ecritures = [];
  const journaux = [];
  const minuteries = [];
  const espion = function () { journaux.push(Array.prototype.map.call(arguments, String).join(' ')); };
  const ctx = {
    document: dom.document,
    console: { log: espion, info: espion, warn: espion, error: espion, debug: espion },
    API_URL: API_URL_FACTICE, SNAPSHOT_URL: '',          // ← ce que config.js définirait
    URL: URL, fetch: reseau.fetch,
    // ⛔ Les minuteries sont inscrites et ne se déclenchent JAMAIS : un réessai différé se verrait ici.
    setTimeout: function (fn, ms) { minuteries.push(ms); return minuteries.length; },
    setInterval: function (fn, ms) { minuteries.push(ms); return minuteries.length; },
    clearTimeout: function () {}, clearInterval: function () {}
  };
  ctx.window = ctx;
  ctx.sessionStorage = fabriquerStockage('sessionStorage', ecritures, reseau);
  ctx.localStorage = fabriquerStockage('localStorage', ecritures, reseau);
  vm.createContext(ctx);
  // L'ordre de saisie.html : config.js (doublé ci-dessus), commun.js, dialog.js, api.js, saisie.js.
  vm.runInContext(lire('js/commun.js'), ctx, { filename: 'js/commun.js' });
  vm.runInContext(lire('js/dialog.js'), ctx, { filename: 'js/dialog.js' });
  vm.runInContext(o.sourceApi || lire('js/api.js'), ctx, { filename: 'js/api.js' });
  vm.runInContext(lire('js/saisie.js'), ctx, { filename: 'js/saisie.js' });
  const b = { ctx, dom, reseau, ecritures, journaux, minuteries };
  if (o.suivi !== false) BANCS.push(b);
  return b;
}

/** Une carte de match telle que la rend `carteMatch()` : score DÉFINITIF (verrouillé) ou à saisir. */
function poserCarte(b, termine) {
  const d = b.dom.document;
  const el = (tag, classe, texte) => {
    const e = d.createElement(tag);
    e.className = classe;
    if (texte) e.textContent = texte;
    return e;
  };
  const carte = el('div', 'match' + (termine ? ' match-termine' : ''));
  carte.setAttribute('data-id', 'M-TEST-1');
  const meta = el('div', 'match-meta', '10:00 · Terrain 1 · Poule A');
  const zone = el('div', 'match-saisie');
  const sA = el('input', 'r-input score');
  const sB = el('input', 'r-input score');
  sA.value = termine ? '2' : '3'; sB.value = '1';
  sA.disabled = sB.disabled = !!termine;
  const bouton = el('button', 'bouton bouton-valider', termine ? 'Corriger' : 'Valider');
  const msg = el('div', 'message-form');
  zone.appendChild(sA); zone.appendChild(sB); zone.appendChild(bouton);
  carte.appendChild(meta); carte.appendChild(zone); carte.appendChild(msg);
  d.getElementById('liste-matchs').appendChild(carte);
  vm.runInContext("matchs = [{ id_match: 'M-TEST-1', categorie: 'U10', phase: 'poule', poule: 'A', " +
    "statut: '" + (termine ? 'terminé' : 'à jouer') + "', score_A: '" + (termine ? '2' : '') +
    "', score_B: '" + (termine ? '1' : '') + "', equipe_A: 'EA', equipe_B: 'EB' }];", b.ctx);
  return { carte, bouton, msg, sA, sB };
}

/* ========================================================================== */
/*  OUTILS                                                                    */
/* ========================================================================== */

const tick = () => new Promise((r) => setImmediate(r));
async function patienter(n) { for (let i = 0; i < n; i++) await tick(); }
async function jusqua(cond, max) {
  for (let i = 0; i < (max || 400); i++) { if (cond()) return true; await tick(); }
  return cond();
}

/**
 * Suit une promesse SANS jamais l'attendre aveuglément.
 * ⚠️ Leçon de 4E : un `await` sur une promesse qui ne se résout pas fige la suite EN SILENCE,
 *    et le processus s'éteint avec un code 0 trompeur. Ici, on n'attend que des conditions bornées.
 */
function suivre(p) {
  const s = { fini: false, valeur: undefined, erreur: null };
  Promise.resolve(p).then((v) => { s.fini = true; s.valeur = v; }, (e) => { s.fini = true; s.erreur = e; });
  return s;
}

/** Le dialogue actuellement ouvert, décrit à l'instant (avec la valeur de pré-remplissage notée à l'ouverture). */
function dialogue(b) {
  const ouverts = b.dom.dialoguesOuverts();
  if (!ouverts.length) return null;
  const o = ouverts[ouverts.length - 1];
  const d = b.dom.decrireDialogue(o);
  const note = b.dom.stats.dialogues.find((x) => x.overlay === o);
  d.valeurInitiale = note ? note.valeurInitiale : undefined;
  return d;
}
async function attendreDialogue(b) { await jusqua(() => dialogue(b) !== null); return dialogue(b); }

function cliquer(b, libelle) {
  const d = dialogue(b);
  const bt = d && d.boutons.find((x) => x.textContent === libelle);
  if (!bt) throw new Error('HARNAIS : bouton « ' + libelle + ' » absent du dialogue ouvert');
  return b.dom.propager(bt, 'click');
}

/** L'utilisateur tape une valeur dans le dialogue de saisie ouvert, puis clique un bouton. */
async function taper(b, valeur, libelle) {
  const d = await attendreDialogue(b);
  if (!d || !d.champ) throw new Error('HARNAIS : aucun champ de saisie ouvert');
  d.champ.value = valeur;
  cliquer(b, libelle);
}

/**
 * « Réessayer » si le dialogue ouvert le propose ; sinon — code d'AVANT — on le ferme par son seul
 * bouton, comme l'utilisateur le pourrait. ⭐ Ainsi, rejoué sur l'ancien code, ce fichier ne
 * s'interrompt pas : il va jusqu'au bout et LISTE chaque promesse que l'ancien code ne tient pas.
 */
function reessayerOuFermer(b) {
  const d = dialogue(b);
  if (!d) return false;
  if (reessaiPropose(d)) { cliquer(b, 'Réessayer'); return true; }
  b.dom.propager(d.boutons[d.boutons.length - 1], 'click');
  return false;
}

/** « Annuler » si le dialogue ouvert le propose ; sinon son seul bouton. */
function annulerOuFermer(b) {
  const d = dialogue(b);
  if (!d) return false;
  b.dom.propager(d.boutons.find((x) => x.textContent === 'Annuler') || d.boutons[d.boutons.length - 1], 'click');
  return true;
}

const nbSaisies = (b) => b.dom.stats.dialogues.filter((d) => d.nature === 'saisie').length;
const lireRangee = (b, role) => b.ctx.sessionStorage.getItem('r92_cle_' + (role || 'scores'));
const ecrituresDe = (b, valeur) => b.ecritures.filter((w) => w.v !== null && w.v.indexOf(valeur) !== -1);
const reessaiPropose = (d) => !!d && d.nature === 'choix' &&
  d.libelles.indexOf('Réessayer') !== -1 && d.libelles.indexOf('Annuler') !== -1;
const resumeReq = (r) => ({ n: r.n, action: r.action, sonde: r.estSonde, issue: r.issue });

/** Tout ce qu'un regard ou une capture d'écran pourrait saisir : la page ET chaque dialogue ouvert. */
function toutLeVisible(b) {
  return [b.dom.document.body.outerHTML, b.dom.document.head.outerHTML]
    .concat(b.dom.stats.dialogues.map((d) => d.message + '\n' + d.overlay.outerHTML))
    .join('\n');
}

/** Les variables de module (let / var / const de premier niveau) qui retiendraient une valeur. */
const SOURCES_MODULES = ['js/commun.js', 'js/api.js', 'js/saisie.js'];
function retenuesPar(b, valeur) {
  const noms = new Set();
  SOURCES_MODULES.forEach((f) => (lire(f).match(/^(?:let|var|const)\s+\w+/gm) || [])
    .forEach((l) => noms.add(l.split(/\s+/)[1])));
  const fautives = Array.from(noms).filter(function (nom) {
    let v;
    try { v = vm.runInContext(nom, b.ctx); } catch (e) { return false; }
    let t;
    try { t = (typeof v === 'string') ? v : JSON.stringify(v); } catch (e) { t = ''; }
    return typeof t === 'string' && t.indexOf(valeur) !== -1;
  });
  // … et les propriétés globales de la page (un `window.x = cle` se verrait ici).
  Object.keys(b.ctx).forEach(function (k) {
    if (typeof b.ctx[k] === 'string' && b.ctx[k].indexOf(valeur) !== -1) fautives.push('window.' + k);
  });
  return fautives;
}

/* ========================================================================== */

let reussis = 0;
const echecs = [];

function verifier(numero, intitule, condition, detail) {
  if (condition) { reussis++; console.log('  ✓ [' + numero + '] ' + intitule); }
  else { echecs.push('[' + numero + '] ' + intitule + (detail ? ' — ' + detail : ''));
         console.log('  ✗ [' + numero + '] ' + intitule + (detail ? ' — ' + detail : '')); }
}

/* --- Contrôles communs aux parcours P et C -------------------------------- */

/** ① à ⑤ — ce qui doit être vrai PENDANT que le dialogue de panne attend un choix. */
async function controlerPendantPanne(b, P, panne, detailAttendu) {
  const sondes = b.reseau.sondes();
  verifier(P + '1.1', 'la première vérification est partie vers la SONDE, avec la clé tapée',
    sondes.length === 1 && sondes[0].corps.cle === CLE_FACTICE, JSON.stringify(sondes.map(resumeReq)));
  verifier(P + '1.2', 'aucune écriture métier n\'est partie', b.reseau.metier().length === 0);
  verifier(P + '1.3', 'la panne est dite TECHNIQUE, jamais « clé incorrecte »',
    !!panne && /technique/i.test(panne.message) && !/incorrecte/i.test(panne.message) &&
    panne.message.indexOf(detailAttendu) !== -1, panne && JSON.stringify(panne.message));

  verifier(P + '2.1', 'rien n\'est rangé sous r92_cle_scores', lireRangee(b) === null);
  verifier(P + '2.2', 'aucune écriture de la clé, ni en sessionStorage ni en localStorage',
    ecrituresDe(b, CLE_FACTICE).length === 0, JSON.stringify(ecrituresDe(b, CLE_FACTICE)));

  verifier(P + '3.1', 'la clé n\'apparaît ni dans le HTML de la page, ni dans aucun dialogue',
    toutLeVisible(b).indexOf(CLE_FACTICE) === -1);
  verifier(P + '3.2', 'le dialogue de panne n\'a AUCUN champ : la clé ne peut pas y être posée',
    !!panne && panne.champ === null);
  verifier(P + '3.3', 'rien n\'a été journalisé (console muette)',
    b.journaux.length === 0, JSON.stringify(b.journaux).slice(0, 160));

  const postsAvant = b.reseau.posts().length;
  await patienter(PATIENCE);
  verifier(P + '4.1', 'le dialogue attend : AUCUNE requête ne repart toute seule',
    b.reseau.posts().length === postsAvant && b.reseau.imprevus.length === 0,
    (b.reseau.posts().length - postsAvant) + ' requête(s) partie(s) sans clic');
  verifier(P + '4.2', 'aucune minuterie programmée : rien ne peut repartir plus tard',
    b.minuteries.length === 0, JSON.stringify(b.minuteries));
  verifier(P + '4.3', 'le même dialogue est toujours ouvert, en attente d\'un choix',
    !!dialogue(b) && !!panne && dialogue(b).overlay === panne.overlay);

  verifier(P + '5.1', 'le dialogue propose « Réessayer » ET « Annuler »', reessaiPropose(panne),
    panne && JSON.stringify(panne.libelles));
}

/** ⑤ à ⑧ — le clic sur « Réessayer », puis la réponse positive. */
async function controlerReessai(b, P, termine) {
  const postsAvant = b.reseau.posts().length;
  reessayerOuFermer(b);
  await jusqua(termine);
  const sondes = b.reseau.sondes();
  verifier(P + '5.2', 'le clic relance UNE vérification, et une seule',
    b.reseau.posts().length === postsAvant + 1 && sondes.length === 2,
    JSON.stringify(b.reseau.posts().map(resumeReq)));
  verifier(P + '6.1', 'la deuxième vérification porte la MÊME clé',
    sondes.length === 2 && sondes[1].corps.cle === CLE_FACTICE);
  verifier(P + '6.2', 'sans nouvelle saisie : un seul champ de clé a été ouvert',
    nbSaisies(b) === 1, nbSaisies(b) + ' champ(s) de saisie ouverts');
  verifier(P + '6.3', 'c\'est toujours la SONDE : aucune écriture métier',
    b.reseau.metier().length === 0);
  verifier(P + '7.1', 'la deuxième vérification RÉUSSIT (réponse sentinelle du bon rôle)',
    sondes.length === 2 && sondes[1].issue === 'sentinelle-scores' && termine());

  const rangees = b.ecritures.filter((w) => w.k === 'r92_cle_scores');
  verifier(P + '8.1', 'la clé est rangée UNE fois, en sessionStorage',
    rangees.length === 1 && rangees[0].ou === 'sessionStorage' && rangees[0].v === CLE_FACTICE,
    JSON.stringify(rangees.map((w) => ({ ou: w.ou, apres: w.derniere }))));
  verifier(P + '8.2', 'et seulement APRÈS la réponse positive du DEUXIÈME essai',
    rangees.length === 1 && rangees[0].derniere === 'sentinelle-scores' && rangees[0].postsLivres === 2);
  verifier(P + '8.3', 'jamais en localStorage',
    b.ecritures.every((w) => w.ou !== 'localStorage' || w.v === null || w.v.indexOf(CLE_FACTICE) === -1));
}

/* ========================================================================== */
/*  CONTRÔLES                                                                 */
/* ========================================================================== */

async function controles() {

  /* ---- Parcours P — ouverture de saisie.html ------------------------------ */
  console.log('\nParcours P — ouverture de saisie.html : panne RÉSEAU, puis « Réessayer »');

  const bP = banc({ plan: ['panne-reseau', 'sentinelle-scores', 'succes-metier'] });
  const ouverture = bP.dom.ecouteursDoc.find((x) => x.t === 'DOMContentLoaded');
  const volP = suivre(ouverture.fn({}));           // ← le VRAI initSaisie, comme au chargement

  const saisieP = await attendreDialogue(bP);
  verifier('P0.1', 'à l\'ouverture, la clé scores est demandée dans un champ MASQUÉ et vide',
    !!saisieP && saisieP.nature === 'saisie' && saisieP.masque && saisieP.valeurInitiale === '');
  await taper(bP, CLE_FACTICE, 'Se connecter');

  const panneP = await attendreDialogue(bP);
  await controlerPendantPanne(bP, 'P', panneP, 'Failed to fetch');
  verifier('P4.4', 'la page n\'a pas fini de s\'ouvrir : elle attend le choix de l\'utilisateur',
    volP.fini === false);

  await controlerReessai(bP, 'P', () => volP.fini);
  verifier('P7.2', 'la page est ouverte, sans erreur, et plus aucun dialogue n\'est affiché',
    volP.fini && !volP.erreur && dialogue(bP) === null, volP.erreur && String(volP.erreur));

  /* ⑨ — l'action métier : un score saisi APRÈS la connexion. */
  const carteP = poserCarte(bP, false);
  const envoiP = suivre(Promise.all(bP.dom.propager(carteP.bouton, 'click')));
  await jusqua(() => envoiP.fini);
  const metierP = bP.reseau.metier();
  verifier('P9.1', 'l\'écriture métier part APRÈS la validation positive, avec la clé rangée',
    metierP.length === 1 && metierP[0].corps.cle === CLE_FACTICE &&
    metierP[0].corps.id_match === 'M-TEST-1' && metierP[0].n > bP.reseau.sondes()[1].n,
    JSON.stringify(bP.reseau.posts().map(resumeReq)));
  verifier('P9.2', 'sans redemander la clé, et le score est enregistré',
    nbSaisies(bP) === 1 && /Score enregistré/.test(carteP.msg.textContent), carteP.msg.textContent);
  await patienter(PATIENCE);
  verifier('P9.3', 'l\'écriture métier n\'est JAMAIS rejouée',
    bP.reseau.metier().length === 1 && bP.reseau.imprevus.length === 0);

  /* ---- Parcours C — « Corriger » un score définitif ----------------------- */
  console.log('\nParcours C — « Corriger » un score définitif : panne HTTP 503, puis « Réessayer »');

  const bC = banc({ plan: ['panne-http-503', 'sentinelle-scores', 'succes-metier'] });
  const carteC = poserCarte(bC, true);
  const clicC = suivre(Promise.all(bC.dom.propager(carteC.bouton, 'click')));  // ← le VRAI écouteur de saisie.js
  const saisieC = await attendreDialogue(bC);
  verifier('C0.1', '« Corriger » demande la clé scores dans un champ MASQUÉ et vide',
    !!saisieC && saisieC.nature === 'saisie' && saisieC.masque && saisieC.valeurInitiale === '' &&
    /Corriger un score définitif/.test(saisieC.message));
  await taper(bC, CLE_FACTICE, 'Valider');

  const panneC = await attendreDialogue(bC);
  await controlerPendantPanne(bC, 'C', panneC, '(503)');
  verifier('C4.4', 'pendant l\'attente, la carte reste VERROUILLÉE (rien n\'est déverrouillé)',
    carteC.carte.classList.contains('match-termine') && !carteC.carte.classList.contains('match-edition') &&
    carteC.sA.disabled === true && clicC.fini === false);

  await controlerReessai(bC, 'C', () => clicC.fini);
  verifier('C7.2', 'la carte n\'est déverrouillée qu\'APRÈS la validation positive',
    carteC.carte.classList.contains('match-edition') && carteC.sA.disabled === false &&
    /Corrige le score/.test(carteC.msg.textContent), carteC.msg.textContent);

  /* ⑨ — l'action métier : la correction elle-même, sur un clic EXPLICITE. */
  verifier('C9.0', 'le déverrouillage n\'a rien envoyé : la correction attend son propre clic',
    bC.reseau.metier().length === 0);
  carteC.sA.value = '4';
  const envoiC = suivre(Promise.all(bC.dom.propager(carteC.bouton, 'click')));
  await jusqua(() => envoiC.fini);
  const metierC = bC.reseau.metier();
  verifier('C9.1', 'la correction part UNE fois, avec la clé validée, marquée « modification »',
    metierC.length === 1 && metierC[0].corps.cle === CLE_FACTICE &&
    metierC[0].corps.modification === true && metierC[0].corps.score_A === '4',
    JSON.stringify(bC.reseau.posts().map(resumeReq)));
  verifier('C9.2', 'sans redemander la clé, et la carte est reverrouillée',
    nbSaisies(bC) === 1 && /Score enregistré/.test(carteC.msg.textContent) &&
    !carteC.carte.classList.contains('match-edition'), carteC.msg.textContent);
  await patienter(PATIENCE);
  verifier('C9.3', 'la correction n\'est JAMAIS rejouée',
    bC.reseau.metier().length === 1 && bC.reseau.imprevus.length === 0);

  /* ---- ⑤ bis — chaque réessai exige SON clic, quelle que soit la panne ---- */
  console.log('\n⑤ bis — Pannes successives (HTTP 500 puis réseau) : un clic = un essai');

  const bR = banc({ plan: ['panne-http-500', 'panne-reseau', 'sentinelle-scores'] });
  const volR = suivre(bR.ctx.connexion('scores', 'de saisie des scores'));
  await taper(bR, CLE_FACTICE, 'Se connecter');
  const d1 = await attendreDialogue(bR);
  await patienter(PATIENCE);
  const apres1 = bR.reseau.posts().length;
  reessayerOuFermer(bR);
  await jusqua(() => bR.reseau.posts().length === 2 && dialogue(bR) !== null);
  const d2 = dialogue(bR);
  await patienter(PATIENCE);
  const apres2 = bR.reseau.posts().length;
  reessayerOuFermer(bR);
  await jusqua(() => volR.fini);

  verifier('R5.1', 'panne HTTP 500 : dialogue TECHNIQUE, avec « Réessayer »',
    reessaiPropose(d1) && d1.message.indexOf('(500)') !== -1 && !/incorrecte/i.test(d1.message),
    d1 && JSON.stringify(d1.message));
  verifier('R5.2', 'une deuxième panne rouvre le choix — et ne relance rien toute seule',
    reessaiPropose(d2) && d2.message.indexOf('Failed to fetch') !== -1 && apres1 === 1 && apres2 === 2,
    'requêtes : ' + apres1 + ' puis ' + apres2);
  verifier('R5.3', 'trois essais = une saisie + deux clics, toujours avec la même clé',
    bR.reseau.sondes().length === 3 && bR.reseau.sondes().every((r) => r.corps.cle === CLE_FACTICE) &&
    nbSaisies(bR) === 1);
  verifier('R7.1', 'connexion() rend « connecté » (true) au troisième essai', volR.fini && volR.valeur === true);
  verifier('R8.1', 'la clé n\'est rangée qu\'une fois, après la SEULE réponse positive',
    bR.ecritures.length === 1 && bR.ecritures[0].derniere === 'sentinelle-scores' &&
    bR.ecritures[0].postsLivres === 3, JSON.stringify(bR.ecritures.map((w) => w.derniere)));

  /* ---- ⑨ bis — une écriture métier en panne n'est JAMAIS rejouée ---------- */
  console.log('\n⑨ bis — Panne pendant l\'écriture métier elle-même : aucun rejeu, aucun « Réessayer »');

  const bM = banc({ plan: ['sentinelle-scores', 'panne-reseau'] });
  const volM = suivre(bM.ctx.connexion('scores', 'de saisie des scores'));
  await taper(bM, CLE_FACTICE, 'Se connecter');
  await jusqua(() => volM.fini);
  const carteM = poserCarte(bM, false);
  const envoiM = suivre(Promise.all(bM.dom.propager(carteM.bouton, 'click')));
  await jusqua(() => envoiM.fini);
  await patienter(PATIENCE);
  verifier('M9.1', 'l\'écriture métier est partie UNE fois, et la panne s\'affiche sur la carte',
    bM.reseau.metier().length === 1 && /Failed to fetch/.test(carteM.msg.textContent) &&
    carteM.msg.classList.contains('ko'), carteM.msg.textContent);
  verifier('M9.2', 'elle n\'est jamais rejouée — ni toute seule, ni par un dialogue « Réessayer »',
    bM.reseau.metier().length === 1 && bM.reseau.imprevus.length === 0 &&
    bM.dom.stats.dialogues.every((d) => d.libelles.indexOf('Réessayer') === -1));
  verifier('M9.3', 'le bouton est rendu : un NOUVEL envoi reste la décision de l\'utilisateur',
    carteM.bouton.disabled === false && dialogue(bM) === null);

  /* ---- ⑩ — une clé REFUSÉE est oubliée, jamais mémorisée ------------------ */
  console.log('\n⑩ Clé refusée : oubliée sur-le-champ, jamais rangée');

  // ⑩a — refus direct, puis la bonne clé.
  const bF = banc({ plan: ['refus', 'sentinelle-scores'] });
  const volF = suivre(bF.ctx.connexion('scores', 'de saisie des scores'));
  await taper(bF, CLE_FAUSSE, 'Se connecter');
  const refusF = await attendreDialogue(bF);
  verifier('10.1', 'un refus dit « Clé incorrecte », sans « Réessayer » (ce n\'est pas une panne)',
    !!refusF && refusF.nature === 'alerte' && /incorrecte/i.test(refusF.message) && !reessaiPropose(refusF),
    refusF && JSON.stringify(refusF.libelles));
  cliquer(bF, 'OK');
  const resaisieF = await attendreDialogue(bF);
  verifier('10.2', 'la clé refusée n\'est PAS pré-remplie dans le nouveau champ',
    !!resaisieF && resaisieF.nature === 'saisie' && resaisieF.valeurInitiale === '');
  resaisieF.champ.value = CLE_FACTICE;
  cliquer(bF, 'Se connecter');
  await jusqua(() => volF.fini);
  verifier('10.3', 'la vérification suivante porte la NOUVELLE clé, et elle seule',
    bF.reseau.sondes().length === 2 && bF.reseau.sondes()[1].corps.cle === CLE_FACTICE && volF.valeur === true);
  verifier('10.4', 'la clé refusée n\'a JAMAIS été écrite, nulle part',
    ecrituresDe(bF, CLE_FAUSSE).length === 0, JSON.stringify(ecrituresDe(bF, CLE_FAUSSE)));
  verifier('10.5', 'elle n\'est retenue par aucune variable de la page, ni visible',
    retenuesPar(bF, CLE_FAUSSE).length === 0 && toutLeVisible(bF).indexOf(CLE_FAUSSE) === -1,
    retenuesPar(bF, CLE_FAUSSE).join(', '));

  // ⑩b — panne, « Réessayer », PUIS refus : la clé tenue en réserve est lâchée.
  const bG = banc({ plan: ['panne-reseau', 'refus'] });
  const volG = suivre(bG.ctx.connexion('scores', 'de saisie des scores'));
  await taper(bG, CLE_FAUSSE, 'Se connecter');
  await attendreDialogue(bG);
  reessayerOuFermer(bG);
  await jusqua(() => { const d = dialogue(bG); return !!d && d.nature === 'alerte'; });
  const refusG = dialogue(bG);
  if (refusG) cliquer(bG, 'OK');
  const resaisieG = await attendreDialogue(bG);
  verifier('10.6', 'refus APRÈS un réessai : « Clé incorrecte », puis un champ VIDE',
    !!refusG && /incorrecte/i.test(refusG.message) && !!resaisieG &&
    resaisieG.nature === 'saisie' && resaisieG.valeurInitiale === '');
  if (dialogue(bG)) cliquer(bG, 'Annuler');
  await jusqua(() => volG.fini);
  await patienter(PATIENCE);
  verifier('10.7', 'la clé refusée n\'est ni rangée, ni retenue, ni renvoyée une troisième fois',
    volG.valeur === false && ecrituresDe(bG, CLE_FAUSSE).length === 0 &&
    retenuesPar(bG, CLE_FAUSSE).length === 0 && bG.reseau.posts().length === 2 && bG.reseau.imprevus.length === 0);

  // ⑩c — « Corriger » avec une mauvaise clé : rien n'est déverrouillé.
  const bH = banc({ plan: ['refus'] });
  const carteH = poserCarte(bH, true);
  const clicH = suivre(Promise.all(bH.dom.propager(carteH.bouton, 'click')));
  await taper(bH, CLE_FAUSSE, 'Valider');
  const refusH = await attendreDialogue(bH);
  cliquer(bH, 'OK');
  const resaisieH = await attendreDialogue(bH);
  const videH = !!resaisieH && resaisieH.valeurInitiale === '';
  cliquer(bH, 'Annuler');
  await jusqua(() => clicH.fini);
  verifier('10.8', '« Corriger » + clé refusée : « Clé incorrecte », champ vide, carte toujours verrouillée',
    !!refusH && /incorrecte/i.test(refusH.message) && videH &&
    !carteH.carte.classList.contains('match-edition') &&
    ecrituresDe(bH, CLE_FAUSSE).length === 0 && bH.reseau.metier().length === 0);

  /* ---- ⑪ — une ANNULATION efface la valeur temporaire -------------------- */
  console.log('\n⑪ Annulation : la clé tenue en réserve disparaît');

  // ⑪a — ouverture : panne, puis « Annuler ».
  const bA = banc({ plan: ['panne-reseau'] });
  const volA = suivre(bA.ctx.connexion('scores', 'de saisie des scores'));
  await taper(bA, CLE_FACTICE, 'Se connecter');
  await attendreDialogue(bA);
  annulerOuFermer(bA);
  await jusqua(() => volA.fini);
  await patienter(PATIENCE);
  verifier('11.1', '« Annuler » : connexion() rend « non connecté » (false)', volA.fini && volA.valeur === false);
  verifier('11.2', 'rien n\'a été écrit (ni sessionStorage, ni localStorage)',
    bA.ecritures.length === 0, JSON.stringify(bA.ecritures.map((w) => w.k)));
  verifier('11.3', 'aucune requête de plus, aucun dialogue ni écouteur clavier restant',
    bA.reseau.posts().length === 1 && bA.reseau.imprevus.length === 0 && dialogue(bA) === null &&
    bA.dom.ecouteursDoc.filter((x) => x.t === 'keydown').length === 0);
  verifier('11.4', 'la clé n\'est retenue par AUCUNE variable de la page',
    retenuesPar(bA, CLE_FACTICE).length === 0, retenuesPar(bA, CLE_FACTICE).join(', '));

  // ⑪b — « Corriger » : panne, puis Échap ; un nouveau « Corriger » repart de zéro.
  const bE = banc({ plan: ['panne-http-500'] });
  const carteE = poserCarte(bE, true);
  const clicE = suivre(Promise.all(bE.dom.propager(carteE.bouton, 'click')));
  await taper(bE, CLE_FACTICE, 'Valider');
  const panneE = await attendreDialogue(bE);
  bE.dom.touche('Escape');
  await jusqua(() => clicE.fini);
  verifier('11.5', 'Échap sur le dialogue de panne vaut « Annuler » : la carte reste verrouillée',
    reessaiPropose(panneE) && dialogue(bE) === null && !carteE.carte.classList.contains('match-edition') &&
    bE.reseau.metier().length === 0 && bE.ecritures.length === 0);
  const clicE2 = suivre(Promise.all(bE.dom.propager(carteE.bouton, 'click')));
  const resaisieE = await attendreDialogue(bE);
  verifier('11.6', 'un nouveau « Corriger » redemande la clé (champ vide) SANS rien vérifier d\'office',
    !!resaisieE && resaisieE.nature === 'saisie' && resaisieE.valeurInitiale === '' &&
    bE.reseau.posts().length === 1);
  cliquer(bE, 'Annuler');
  await jusqua(() => clicE2.fini);
  await patienter(PATIENCE);
  verifier('11.7', 'rien n\'est reparti : une vérification en tout, aucune écriture, aucune rétention',
    bE.reseau.posts().length === 1 && bE.reseau.imprevus.length === 0 &&
    retenuesPar(bE, CLE_FACTICE).length === 0);

  /* ---- ⑫ — clé admin et dialogues ordinaires : RIEN ne change ------------ */
  console.log('\n⑫ Clé admin et dialogues ordinaires : déroulé identique au code d\'avant');

  // Le code d'AVANT : chaque site de réessai redevient « alerte, puis abandon ».
  const SRC_API = lire('js/api.js');
  const MOTIF_REESSAI = new RegExp(
    "if \\(role !== 'scores'\\) \\{ (await dialogAlerter\\(MESSAGE_VERIF_IMPOSSIBLE \\+ err\\.message\\);) " +
    "(return (?:false|null);) \\}\\s*if \\(!await dialogConfirmer\\(MESSAGE_VERIF_IMPOSSIBLE \\+ err\\.message,\\s*" +
    "\\{ ok: 'Réessayer', annuler: 'Annuler' \\}\\)\\) return (?:false|null);", 'g');
  const nbSites = (SRC_API.match(MOTIF_REESSAI) || []).length;
  const SRC_AVANT = SRC_API.replace(MOTIF_REESSAI, '$1 $2');
  verifier('12.0', 'le code d\'AVANT est reconstruit (les 2 sites de réessai retirés)',
    nbSites === 2 && SRC_AVANT !== SRC_API,
    nbSites + ' site(s) trouvé(s) : mets cette reconstruction à jour, ne la supprime pas');

  /** Joue un appel de clé ; un « robot » répond aux dialogues selon un script fixe. */
  async function jouer(sourceApi, cas) {
    const b = banc({ plan: cas.plan.slice(), sourceApi: sourceApi, suivi: !sourceApi });
    if (cas.prepa) cas.prepa(b);
    const s = suivre(cas.appel(b.ctx));
    for (const pas of cas.script) {
      await jusqua(() => dialogue(b) !== null || s.fini);
      const d = dialogue(b);
      if (!d) break;
      if (pas.taper !== undefined && d.champ) d.champ.value = pas.taper;
      const bt = d.boutons.find((x) => x.textContent === pas.bouton);
      if (!bt) break;                         // bouton attendu absent : la signature le montrera
      b.dom.propager(bt, 'click');
    }
    await jusqua(() => s.fini);
    const masquer = (v) => (v === CLE_FACTICE ? '‹clé›' : (v === CLE_FAUSSE ? '‹clé fausse›' : v));
    const sig = JSON.stringify({
      retour: s.fini ? masquer(s.valeur) : 'EN SUSPENS',
      dialogues: b.dom.stats.dialogues.map((d) => [d.nature, d.masque, d.message, d.libelles.join('|')]),
      requetes: b.reseau.posts().map((r) => [r.action, r.estSonde, masquer(r.corps.cle)]),
      ecritures: b.ecritures.map((w) => [w.ou, w.k, masquer(w.v)])
    });
    return { b, s, sig };
  }

  const CAS = [
    { id: '12.1', quoi: 'confirmation forte admin (régénération), panne réseau', plan: ['panne-reseau'],
      appel: (c) => c.demanderCleValide('admin', 'Confirmation forte : 3 score(s) seront effacés.\n\nEntre la clé admin pour confirmer :'),
      script: [{ taper: CLE_FACTICE, bouton: 'Valider' }, { bouton: 'OK' }] },
    { id: '12.2', quoi: 'connexion admin, panne HTTP 503', plan: ['panne-http-503'],
      appel: (c) => c.connexion('admin', "à l'administration"),
      script: [{ taper: CLE_FACTICE, bouton: 'Se connecter' }, { bouton: 'OK' }] },
    { id: '12.3', quoi: 'nouvelle clé admin acceptée', plan: ['sentinelle-admin'],
      appel: (c) => c.demanderCleValide('admin', 'Clé actuelle confirmée.\n\nEntre la NOUVELLE clé :'),
      script: [{ taper: CLE_FACTICE, bouton: 'Valider' }] },
    { id: '12.4', quoi: 'clé admin refusée, puis abandon', plan: ['refus'],
      appel: (c) => c.demanderCleValide('admin', 'Entre la clé admin :'),
      script: [{ taper: CLE_FAUSSE, bouton: 'Valider' }, { bouton: 'OK' }, { bouton: 'Annuler' }] },
    { id: '12.5', quoi: 'clé scores DÉJÀ rangée + panne (chemin existant : alerte, sans réessai)',
      plan: ['panne-reseau'], appel: (c) => c.connexion('scores', 'de saisie des scores'),
      script: [{ bouton: 'OK' }],
      prepa: (b) => b.ctx.sessionStorage.donnees.set('r92_cle_scores', CLE_FACTICE) }
  ];
  for (const cas of CAS) {
    const neuf = await jouer(null, cas);
    const avant = await jouer(SRC_AVANT, cas);
    const sansReessai = neuf.b.dom.stats.dialogues.every((d) => d.libelles.indexOf('Réessayer') === -1);
    verifier(cas.id, cas.quoi + ' → aucun « Réessayer », déroulé IDENTIQUE à avant',
      sansReessai && neuf.s.fini && neuf.sig === avant.sig,
      '\n      nouveau : ' + neuf.sig + '\n      avant   : ' + avant.sig);
  }

  // Les dialogues ORDINAIRES (dialog.js n'est pas modifié par ce lot : simple vérification).
  const bO = banc();
  const pC = suivre(bO.ctx.dialogConfirmer('Supprimer ?'));
  const dC = await attendreDialogue(bO);
  cliquer(bO, 'Confirmer');
  await jusqua(() => pC.fini);
  const pD = suivre(bO.ctx.dialogDemander('Copie l\'adresse :', 'https://exemple.test/page', { ok: 'Fermer' }));
  const dD = await attendreDialogue(bO);
  cliquer(bO, 'Fermer');
  await jusqua(() => pD.fini);
  const pAl = suivre(bO.ctx.dialogAlerter('Info'));
  const dAl = await attendreDialogue(bO);
  cliquer(bO, 'OK');
  await jusqua(() => pAl.fini);
  verifier('12.6', 'confirmation ordinaire : « Annuler » / « Confirmer », rend true',
    dC.nature === 'choix' && dC.libelles.join('|') === 'Annuler|Confirmer' && pC.valeur === true);
  verifier('12.7', 'saisie ordinaire : champ EN CLAIR, pré-rempli, valeur rendue',
    dD.nature === 'saisie' && !dD.masque && dD.valeurInitiale === 'https://exemple.test/page' &&
    pD.valeur === 'https://exemple.test/page');
  verifier('12.8', 'alerte ordinaire : un seul bouton « OK »',
    dAl.nature === 'alerte' && dAl.libelles.join('|') === 'OK');
  verifier('12.9', 'le dialogue « Réessayer » est une confirmation ordinaire (aucun bouton rouge)',
    !!panneP && panneP.boutons.every((bt) => !bt.classList.contains('dlg-danger')));

  /* ---- ⑬ — aucun écouteur ni dialogue dédoublé -------------------------- */
  console.log('\n⑬ Doublons : un dialogue à la fois, un écouteur clavier à la fois');

  const compte = (b, t) => b.dom.ecouteursDoc.filter((x) => x.t === t).length;
  const natures = (b) => b.dom.stats.dialogues.map((d) => d.nature).join(' → ');
  verifier('13.1', 'jamais plus d\'UN dialogue ouvert à la fois (' + BANCS.length + ' parcours)',
    BANCS.every((b) => b.dom.stats.maxDialogues <= 1), JSON.stringify(BANCS.map((b) => b.dom.stats.maxDialogues)));
  verifier('13.2', 'jamais plus d\'UN écouteur clavier de dialogue à la fois',
    BANCS.every((b) => b.dom.stats.maxClavier <= 1), JSON.stringify(BANCS.map((b) => b.dom.stats.maxClavier)));
  verifier('13.3', 'en fin de parcours : aucun dialogue ni écouteur clavier résiduel',
    BANCS.every((b) => b.dom.dialoguesOuverts().length === 0 && compte(b, 'keydown') === 0));
  verifier('13.4', 'les écouteurs de la page restent en UN exemplaire (2 clics, 1 saisie, 1 ouverture)',
    BANCS.every((b) => compte(b, 'click') === 2 && compte(b, 'input') === 1 && compte(b, 'DOMContentLoaded') === 1));
  verifier('13.5', 'parcours P : une saisie de clé, puis UN dialogue de panne — rien d\'autre',
    natures(bP) === 'saisie → choix', natures(bP));
  verifier('13.6', 'parcours C : une saisie de clé, puis UN dialogue de panne — rien d\'autre',
    natures(bC) === 'saisie → choix', natures(bC));
  verifier('13.7', 'api.js ne pose AUCUN écouteur lui-même (le réessai passe par dialog.js)',
    SRC_API.indexOf('addEventListener') === -1);

  /* ---- Z — preuve du harnais : le code d'AVANT doit ÉCHOUER --------------- */
  console.log('\nZ Preuve du harnais : le code d\'AVANT reproduit le défaut, les mutants sont vus');

  // Z1 — ouverture, code d'AVANT : aucun « Réessayer » ; pour réessayer, il faut RETAPER la clé.
  const bZ1 = banc({ plan: ['panne-reseau', 'sentinelle-scores'], sourceApi: SRC_AVANT, suivi: false });
  const volZ1 = suivre(bZ1.dom.ecouteursDoc.find((x) => x.t === 'DOMContentLoaded').fn({}));
  await taper(bZ1, CLE_FACTICE, 'Se connecter');
  const panneZ1 = await attendreDialogue(bZ1);
  const offreZ1 = reessaiPropose(panneZ1);
  cliquer(bZ1, panneZ1.libelles[panneZ1.libelles.length - 1]);
  await jusqua(() => volZ1.fini);
  suivre(bZ1.ctx.connexion('scores', 'de saisie des scores'));   // le seul recours : rouvrir la page
  const resaisieZ1 = await attendreDialogue(bZ1);
  verifier('Z.1', 'code d\'AVANT, ouverture : aucun « Réessayer », la clé doit être RETAPÉE (défaut reproduit)',
    !offreZ1 && panneZ1.nature === 'alerte' && lireRangee(bZ1) === null &&
    !!resaisieZ1 && resaisieZ1.nature === 'saisie' && nbSaisies(bZ1) === 2,
    'la reconstruction n\'a pas reproduit le défaut : les contrôles P5 à P8 ne prouvent rien');
  annulerOuFermer(bZ1);

  // Z2 — « Corriger », code d'AVANT : la panne abandonne ; un nouveau « Corriger » redemande la clé.
  const bZ2 = banc({ plan: ['panne-http-503', 'sentinelle-scores'], sourceApi: SRC_AVANT, suivi: false });
  const carteZ2 = poserCarte(bZ2, true);
  const clicZ2 = suivre(Promise.all(bZ2.dom.propager(carteZ2.bouton, 'click')));
  await taper(bZ2, CLE_FACTICE, 'Valider');
  const panneZ2 = await attendreDialogue(bZ2);
  const offreZ2 = reessaiPropose(panneZ2);
  cliquer(bZ2, panneZ2.libelles[panneZ2.libelles.length - 1]);
  await jusqua(() => clicZ2.fini);
  const verrouilleeZ2 = !carteZ2.carte.classList.contains('match-edition');
  bZ2.dom.propager(carteZ2.bouton, 'click');
  const resaisieZ2 = await attendreDialogue(bZ2);
  verifier('Z.2', 'code d\'AVANT, « Corriger » : la panne abandonne, la clé doit être RETAPÉE (défaut reproduit)',
    !offreZ2 && verrouilleeZ2 && !!resaisieZ2 && resaisieZ2.nature === 'saisie' && nbSaisies(bZ2) === 2,
    'la reconstruction n\'a pas reproduit le défaut : les contrôles C5 à C8 ne prouvent rien');
  annulerOuFermer(bZ2);

  // Z3 — mutant « clé rangée pendant la panne » : les contrôles ② doivent le voir.
  const SRC_M1 = SRC_API.replace('if (!await dialogConfirmer(',
    'definirCleLocale(role, cle); if (!await dialogConfirmer(');
  const bZ3 = banc({ plan: ['panne-reseau'], sourceApi: SRC_M1, suivi: false });
  suivre(bZ3.ctx.connexion('scores', 'de saisie des scores'));
  await taper(bZ3, CLE_FACTICE, 'Se connecter');
  await attendreDialogue(bZ3);
  verifier('Z.3', 'mutant « clé rangée pendant la panne » : le contrôle ② le détecte',
    SRC_M1 !== SRC_API && ecrituresDe(bZ3, CLE_FACTICE).length > 0 && lireRangee(bZ3) === CLE_FACTICE,
    'le mutant n\'a pas été vu : les contrôles P2 / C2 ne prouvent rien');
  annulerOuFermer(bZ3);

  // Z4 — mutant « réessai automatique » : les contrôles ④ doivent le voir.
  const SRC_M2 = SRC_API.replace(new RegExp("if \\(!await dialogConfirmer\\(MESSAGE_VERIF_IMPOSSIBLE \\+ " +
    "err\\.message,\\s*\\{ ok: 'Réessayer', annuler: 'Annuler' \\}\\)\\) return false;"),
    '/* MUTANT : réessai sans rien demander */');
  const bZ4 = banc({ plan: ['panne-reseau'], sourceApi: SRC_M2, suivi: false });
  suivre(bZ4.ctx.connexion('scores', 'de saisie des scores'));
  await taper(bZ4, CLE_FACTICE, 'Se connecter');
  await patienter(PATIENCE);
  verifier('Z.4', 'mutant « réessai automatique » : le contrôle ④ le détecte (requête partie sans clic)',
    SRC_M2 !== SRC_API && bZ4.reseau.posts().length > 1 && bZ4.reseau.imprevus.length > 0,
    'le mutant n\'a pas été vu : les contrôles P4 / C4 ne prouvent rien');
}

/* ========================================================================== */

/* ⛔ GARDE-FOU : on part en ÉCHEC, et on ne repasse au vert qu'à la toute fin du bilan.
   Sans cela, une attente qui ne se dénoue jamais éteindrait le processus avec un code 0 —
   un test « vert » qui n'a en réalité rien joué. */
process.exitCode = 1;

controles().then(function () {
  console.log('\n' + '─'.repeat(70));
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + ' contrôle(s) en défaut sur ' +
      (reussis + echecs.length) + ' :');
    echecs.forEach(function (e) { console.log('   · ' + e); });
    process.exit(1);
  }
  console.log('OK — ' + reussis + ' contrôles passés.');
  process.exitCode = 0;                       // ⭐ le seul endroit qui lève le garde-fou
}).catch(function (e) {
  console.error('\nERREUR DU HARNAIS : ' + (e && e.stack || e));
  process.exit(1);
});
