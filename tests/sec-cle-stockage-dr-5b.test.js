/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — une clé n'est RANGÉE qu'après la réussite confirmée
 *  de l'action protégée
 *  Chantier SEC-CLE-STOCKAGE-DR-5B
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/sec-cle-stockage-dr-5b.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *
 *  LE DÉFAUT CORRIGÉ — mécanisme général `demanderCle()` / `apiPostProtege()` de js/api.js :
 *   · une clé tapée était écrite en sessionStorage AVANT toute réponse du serveur ;
 *   · après un refus explicite, la clé refusée pré-remplissait la seconde saisie, et restait
 *     rangée si l'utilisateur annulait ;
 *   · après une panne ou une réponse ambiguë, une nouvelle clé jamais confirmée restait rangée.
 *
 *  CE QU'IL PROTÈGE, pour le rôle `scores` (vrai écouteur « Valider » de saisie.js) ET pour le
 *  rôle `admin` (vraie fonction `ecrireAdmin` d'admin.js, qui porte la plupart des écritures) :
 *   ⓪  clé déjà rangée + succès : rien ne change ;
 *   ①  nouvelle clé + succès : rien d'écrit avant la réponse, rangée après ;
 *   ②  nouvelle clé + panne, réponse ambiguë ou erreur métier : un envoi, rien de rangé, aucun rejeu ;
 *   ③  refus explicite + annulation : clé effacée AVANT la redemande, champ vide, stockage vide ;
 *   ④  refus + nouvelle clé acceptée : deux envois au plus, rangée après le second succès seulement ;
 *   ⑤  refus + nouvelle clé puis panne : rien de rangé, aucun troisième envoi ;
 *   ⑥  clé déjà rangée + panne sans rapport avec la clé : clé PRÉSERVÉE ;
 *   ⑦  clé déjà rangée refusée, puis nouvelle clé refusée : rien ne reste, pas de troisième tour ;
 *   G   aucune clé visible ni journalisée, jamais de localStorage, aucun doublon, aucune minuterie.
 *
 *  ⭐ CODE RÉEL : js/commun.js, js/dialog.js et js/api.js ENTIERS, puis js/saisie.js (scores) ou
 *  la fonction `ecrireAdmin` extraite telle quelle d'admin.js (admin). ⛔ Rien n'est recopié.
 *
 *  ⭐ AUTO-PREUVE (§ Z) : le comportement d'AVANT 5B est reconstruit à partir du code actuel et
 *  rejoué ; les trois défauts doivent y réapparaître. Sinon, ce fichier ÉCHOUE.
 *
 *  ⚠️ TOUTES LES CLÉS ICI SONT FACTICES : inventées pour ce fichier, elles n'ouvrent rien.
 *  ⛔ Aucune requête ne quitte ce processus : le faux serveur vit ici, sur un domaine réservé.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

/** ⚠️ Valeurs FACTICES — inventées pour ce test, elles n'ouvrent rien. */
const CLE_MEMO = 'CLE-FACTICE-5B-deja-rangee';
const CLE_NEUVE = 'CLE-FACTICE-5B-nouvelle';
const CLE_REFUSEE = 'CLE-FACTICE-5B-refusee';
const CLES = [CLE_MEMO, CLE_NEUVE, CLE_REFUSEE];
const API_URL_FACTICE = 'https://exemple.invalid/exec';   // ⛔ domaine réservé (RFC 2606) : ne résout jamais

/** Tours de boucle laissés au code pour « repartir tout seul » s'il le voulait. */
const PATIENCE = 200;

/* ========================================================================== */
/*  EXTRACTION — on PREND le code réel, on ne le réécrit jamais.               */
/* ========================================================================== */

/** Localise une DÉCLARATION de fonction en début de ligne, puis la découpe par équilibrage. */
function bloc(source, rel, entete) {
  const noyau = entete.replace(/\s*\([\s\S]*$/, '');
  const motif = new RegExp('^' + noyau.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(', 'm');
  const trouve = motif.exec(source);
  if (!trouve) {
    throw new Error('Déclaration introuvable dans ' + rel + ' : « ' + entete + ' ». ' +
      'Si le code a été renommé, mets ce garde-fou à jour — ne le supprime pas.');
  }
  let profondeur = 0;
  for (let i = source.indexOf('{', trouve.index); i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}' && --profondeur === 0) {
      return { debut: trouve.index, fin: i + 1, texte: source.slice(trouve.index, i + 1) };
    }
  }
  throw new Error('Accolades déséquilibrées autour de « ' + entete + ' » dans ' + rel);
}

/* L'écriture ADMIN réelle : `ecrireAdmin` porte la majorité des écritures de l'administration. */
const SRC_ECRIRE_ADMIN = bloc(lire('js/admin.js'), 'js/admin.js', 'async function ecrireAdmin(').texte;

/* ========================================================================== */
/*  DOUBLURE DE DOM — parenté, sélecteurs simples, propagation des clics.      */
/* ========================================================================== */

/**
 * ⭐ FIDÉLITÉS QUI COMPTENT : `value` est une PROPRIÉTÉ (absente d'`outerHTML`, comme dans un vrai
 * DOM) ; un clic remonte jusqu'à `document` (les écouteurs délégués de saisie.js le reçoivent) ;
 * un sélecteur inconnu LÈVE, pour qu'un chemin de code inattendu se voie.
 */
function fabriquerDom() {
  const crees = [];
  const ecouteursDoc = [];
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
      focus() {},
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

  /** Un clic réel : la cible, ses ancêtres, puis `document`. Rend ce que `document` a rendu. */
  function propager(cible, type) {
    const ev = { type, target: cible, preventDefault() {}, stopPropagation() {} };
    for (let n = cible; n; n = n.parent) (n.ecouteurs[type] || []).slice().forEach((fn) => fn(ev));
    return ecouteursDoc.filter((x) => x.t === type).slice().map((x) => x.fn(ev));
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

  return { document: doc, ecouteursDoc, stats, propager, dialoguesOuverts, decrireDialogue };
}

/* ========================================================================== */
/*  FAUX RÉSEAU — chaque POST suit un plan écrit ; « tenue: » retient la réponse. */
/* ========================================================================== */

const repJson = (corps) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) });

const REPONSES = {
  'succes':         () => repJson({ success: true, match: { score_A: '3', score_B: '1' } }),
  'refus':          () => repJson({ error: 'Clé incorrecte.', acces_refuse: true }),
  'panne-reseau':   () => Promise.reject(new TypeError('Failed to fetch')),
  'panne-http-500': () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
  'json-illisible': () => Promise.resolve({ ok: true, status: 200,
    json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')) }),
  'erreur-metier':  () => repJson({ error: 'Service momentanément indisponible.' })
};

/**
 * ⛔ Un envoi que le plan n'a pas prévu reçoit une promesse qui ne se résout JAMAIS : il est
 *    inscrit (donc visible), mais il ne peut ni réussir ni faire boucler un code fautif.
 * ⭐ Une réponse « tenue » attend `liberer()` : on peut ainsi regarder le stockage PENDANT
 *    que l'action protégée attend encore sa réponse.
 */
function fabriquerReseau(plan) {
  const requetes = [];
  const imprevus = [];
  const enAttente = [];
  const etat = { livrees: 0, derniere: null };
  function fetch(url, opts) {
    const u = new URL(String(url));
    if (u.origin !== new URL(API_URL_FACTICE).origin) {
      return Promise.reject(new Error('HARNAIS : requête hors du faux serveur'));
    }
    const methode = (opts && opts.method) || 'GET';
    const corps = (methode === 'POST') ? JSON.parse(opts.body) : null;
    const req = { n: requetes.length + 1, methode, corps, action: corps ? corps.action : u.searchParams.get('action') };
    requetes.push(req);
    let issue = (methode === 'POST') ? plan.shift() : null;
    if (!issue) { imprevus.push(req); return new Promise(function () {}); }
    const tenue = issue.indexOf('tenue:') === 0;
    if (tenue) issue = issue.slice('tenue:'.length);
    req.issue = issue;
    const conclure = () => { etat.livrees++; etat.derniere = issue; };
    const produire = () => REPONSES[issue]().then((r) => { conclure(); return r; }, (e) => { conclure(); throw e; });
    if (!tenue) return produire();
    return new Promise(function (res, rej) { enAttente.push(() => produire().then(res, rej)); });
  }
  return {
    fetch, requetes, imprevus, enAttente, etat,
    posts: () => requetes.filter((r) => r.methode === 'POST'),
    liberer: () => { const f = enAttente.shift(); if (f) f(); return !!f; }
  };
}

/** Un stockage qui inscrit TOUT accès (lecture comprise), avec l'état du réseau à cet instant. */
function fabriquerStockage(nom, acces, reseau) {
  const m = new Map();
  const noter = (op, k, v) => acces.push({
    ou: nom, op, k, v, livrees: reseau.etat.livrees, derniere: reseau.etat.derniere
  });
  return {
    donnees: m,
    getItem: (k) => { noter('lire', k, null); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { noter('ecrire', k, String(v)); m.set(k, String(v)); },
    removeItem: (k) => { noter('retirer', k, null); m.delete(k); },
    clear: () => { noter('vider', null, null); m.clear(); }
  };
}

/* ========================================================================== */
/*  BANC — un onglet neuf : saisie.html (rôle scores) ou l'administration (admin). */
/* ========================================================================== */

const BANCS = [];

function banc(o) {
  const page = o.page;
  const role = (page === 'saisie') ? 'scores' : 'admin';
  const dom = fabriquerDom();
  if (page === 'saisie') {
    ['liste-matchs', 'filtre-cat-saisie', 'select-cat-saisie', 'filtre-terrain-saisie',
      'select-terrain-saisie', 'bouton-rafraichir-saisie', 'maj-saisie'].forEach(function (id) {
      const el = dom.document.createElement('div');
      el.id = id;
      dom.document.body.appendChild(el);
    });
  }
  const reseau = fabriquerReseau((o.plan || []).slice());
  const acces = [];
  const journaux = [];
  const minuteries = [];
  const espion = function () { journaux.push(Array.prototype.map.call(arguments, String).join(' ')); };
  const ctx = {
    document: dom.document,
    console: { log: espion, info: espion, warn: espion, error: espion, debug: espion },
    API_URL: API_URL_FACTICE, SNAPSHOT_URL: '',          // ← ce que config.js définirait
    URL: URL, fetch: reseau.fetch,
    // ⛔ Les minuteries sont inscrites et ne se déclenchent JAMAIS : un rejeu différé se verrait ici.
    setTimeout: function (fn, ms) { minuteries.push(ms); return minuteries.length; },
    setInterval: function (fn, ms) { minuteries.push(ms); return minuteries.length; },
    clearTimeout: function () {}, clearInterval: function () {}
  };
  ctx.window = ctx;
  ctx.sessionStorage = fabriquerStockage('sessionStorage', acces, reseau);
  ctx.localStorage = fabriquerStockage('localStorage', acces, reseau);
  // Une clé rangée lors d'une action ANTÉRIEURE réussie (posée hors journal, avant le chargement).
  if (o.memo) ctx.sessionStorage.donnees.set('r92_cle_' + role, o.memo);
  vm.createContext(ctx);
  vm.runInContext(lire('js/commun.js'), ctx, { filename: 'js/commun.js' });
  vm.runInContext(lire('js/dialog.js'), ctx, { filename: 'js/dialog.js' });
  vm.runInContext(o.sourceApi || lire('js/api.js'), ctx, { filename: 'js/api.js' });
  if (page === 'saisie') vm.runInContext(lire('js/saisie.js'), ctx, { filename: 'js/saisie.js' });
  else vm.runInContext(SRC_ECRIRE_ADMIN, ctx, { filename: 'js/admin.js (ecrireAdmin)' });
  const b = { page, role, ctx, dom, reseau, acces, journaux, minuteries, messages: [] };
  if (o.suivi !== false) BANCS.push(b);
  return b;
}

/** Une carte de match « à saisir », telle que la rend `carteMatch()`. */
function poserCarte(b) {
  const d = b.dom.document;
  const el = (tag, classe, texte) => {
    const e = d.createElement(tag);
    e.className = classe;
    if (texte) e.textContent = texte;
    return e;
  };
  const carte = el('div', 'match');
  carte.setAttribute('data-id', 'M-TEST-1');
  const meta = el('div', 'match-meta', '10:00 · Terrain 1 · Poule A');
  const zone = el('div', 'match-saisie');
  const sA = el('input', 'r-input score');
  const sB = el('input', 'r-input score');
  sA.value = '3'; sB.value = '1';
  const bouton = el('button', 'bouton bouton-valider', 'Valider');
  const msg = el('div', 'message-form');
  zone.appendChild(sA); zone.appendChild(sB); zone.appendChild(bouton);
  carte.appendChild(meta); carte.appendChild(zone); carte.appendChild(msg);
  d.getElementById('liste-matchs').appendChild(carte);
  vm.runInContext("matchs = [{ id_match: 'M-TEST-1', categorie: 'U10', phase: 'poule', poule: 'A', " +
    "statut: 'à jouer', score_A: '', score_B: '', equipe_A: 'EA', equipe_B: 'EB' }];", b.ctx);
  return { carte, bouton, msg };
}

/** Lance l'action protégée par le VRAI chemin de la page : clic « Valider » ou `ecrireAdmin`. */
function lancer(b) {
  if (b.page === 'saisie') {
    b.carte = poserCarte(b);
    return suivre(Promise.all(b.dom.propager(b.carte.bouton, 'click')));
  }
  return suivre(b.ctx.ecrireAdmin('ajouterEquipe', { nom_equipe: 'Équipe factice', categorie: 'U10' }));
}

/** Ce que l'utilisateur apprend de l'issue : le message de la carte (scores) ou l'erreur levée (admin). */
function issue(b, s) {
  const r = (b.page === 'saisie')
    ? { ok: /Score enregistré/.test(b.carte.msg.textContent), message: b.carte.msg.textContent }
    : { ok: s.fini && !s.erreur, message: s.erreur ? String(s.erreur.message) : '' };
  b.messages.push(r.message);
  return r;
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

/** Suit une promesse SANS jamais l'attendre aveuglément (une attente sans fin figerait le test). */
function suivre(p) {
  const s = { fini: false, valeur: undefined, erreur: null };
  Promise.resolve(p).then((v) => { s.fini = true; s.valeur = v; }, (e) => { s.fini = true; s.erreur = e; });
  return s;
}

/** Le dialogue ouvert, décrit à l'instant, avec le pré-remplissage noté à son ouverture. */
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

async function taper(b, valeur, libelle) {
  const d = await attendreDialogue(b);
  if (!d || !d.champ) throw new Error('HARNAIS : aucun champ de saisie ouvert');
  d.champ.value = valeur;
  cliquer(b, libelle);
}

const nbSaisies = (b) => b.dom.stats.dialogues.filter((d) => d.nature === 'saisie').length;
const reessaiVu = (b) => b.dom.stats.dialogues.some((d) => d.libelles.indexOf('Réessayer') !== -1);
const rangee = (b) => { const v = b.ctx.sessionStorage.donnees.get('r92_cle_' + b.role); return v == null ? null : v; };
const sansCle = (b) => !rangee(b);   // '' (effacée) ou absente : aucune clé
const ecritures = (b) => b.acces.filter((a) => a.op !== 'lire');
const ecrituresDe = (b, v) => b.acces.filter((a) => a.op === 'ecrire' && a.v && a.v.indexOf(v) !== -1);

/** Remplace chaque clé factice par un repère neutre : même le détail d'un échec ne les imprime pas. */
const masquer = (t) => CLES.reduce((acc, k, i) => acc.split(k).join('‹clé ' + (i + 1) + '›'), String(t));
const etat = (b) => masquer(JSON.stringify({
  rangee: rangee(b), envois: b.reseau.posts().map((r) => ({ cle: r.corps.cle, issue: r.issue }))
}));

/** Tout ce qu'un regard ou une capture pourrait saisir : la page ET chaque dialogue ouvert. */
function toutLeVisible(b) {
  return [b.dom.document.body.outerHTML, b.dom.document.head.outerHTML]
    .concat(b.dom.stats.dialogues.map((d) => d.message + '\n' + d.overlay.outerHTML))
    .join('\n');
}

/* ========================================================================== */

let reussis = 0;
const echecs = [];

function verifier(numero, intitule, condition, detail) {
  if (condition) { reussis++; console.log('  ✓ [' + numero + '] ' + intitule); }
  else { echecs.push('[' + numero + '] ' + intitule + (detail ? ' — ' + detail : ''));
         console.log('  ✗ [' + numero + '] ' + intitule + (detail ? ' — ' + detail : '')); }
}

/* ========================================================================== */
/*  SCÉNARIOS — joués À L'IDENTIQUE pour les deux rôles                         */
/* ========================================================================== */

async function scenarios(page, P) {
  console.log('\n══ Rôle « ' + (page === 'saisie' ? 'scores' : 'admin') + ' » — ' + (page === 'saisie'
    ? 'vrai écouteur « Valider » de saisie.js' : 'vraie fonction ecrireAdmin() d\'admin.js') + ' ══');

  /* ⓪ — la voie ordinaire : clé déjà rangée, action réussie. */
  console.log('\n⓪ Clé déjà rangée + succès : rien ne change');
  const b0 = banc({ page, plan: ['succes'], memo: CLE_MEMO });
  const s0 = lancer(b0);
  await jusqua(() => s0.fini);
  verifier(P + '0.1', 'aucune saisie, un envoi avec la clé rangée, aucune écriture, clé conservée',
    issue(b0, s0).ok && nbSaisies(b0) === 0 && b0.reseau.posts().length === 1 &&
    b0.reseau.posts()[0].corps.cle === CLE_MEMO && ecritures(b0).length === 0 && rangee(b0) === CLE_MEMO, etat(b0));

  /* ① — nouvelle clé + succès (réponse TENUE, pour regarder le stockage pendant l'attente). */
  console.log('\n① Nouvelle clé + succès : rien d\'écrit avant la réponse, rangée après');
  const b1 = banc({ page, plan: ['tenue:succes'] });
  const s1 = lancer(b1);
  const d1 = await attendreDialogue(b1);
  verifier(P + '1.1', 'aucune clé rangée : elle est demandée dans un champ MASQUÉ et vide',
    !!d1 && d1.nature === 'saisie' && d1.masque && d1.valeurInitiale === '');
  await taper(b1, CLE_NEUVE, 'Valider');
  await jusqua(() => b1.reseau.enAttente.length === 1);
  verifier(P + '1.2', 'l\'action part avec la clé tapée',
    b1.reseau.posts().length === 1 && b1.reseau.posts()[0].corps.cle === CLE_NEUVE, etat(b1));
  verifier(P + '1.3', 'PENDANT l\'attente de la réponse : RIEN n\'est écrit, aucune clé rangée',
    ecrituresDe(b1, CLE_NEUVE).length === 0 && sansCle(b1), etat(b1));
  b1.reseau.liberer();
  await jusqua(() => s1.fini);
  const i1 = issue(b1, s1);
  verifier(P + '1.4', 'l\'action réussit', i1.ok, i1.message);
  const e1 = ecrituresDe(b1, CLE_NEUVE);
  verifier(P + '1.5', 'la clé est rangée UNE fois, APRÈS la réponse positive',
    e1.length === 1 && e1[0].livrees === 1 && e1[0].derniere === 'succes' && rangee(b1) === CLE_NEUVE,
    JSON.stringify(e1.map((a) => ({ reponsesRecues: a.livrees, derniere: a.derniere }))));
  verifier(P + '1.6', 'un seul envoi, une seule saisie', b1.reseau.posts().length === 1 && nbSaisies(b1) === 1);

  /* ② — nouvelle clé + panne technique / réponse ambiguë / erreur métier. */
  console.log('\n② Nouvelle clé + panne, réponse ambiguë ou erreur métier : rien de rangé, aucun rejeu');
  const GENRES = [
    ['panne-reseau', 'panne réseau'], ['panne-http-500', 'erreur HTTP 500'],
    ['json-illisible', 'réponse illisible (ambiguë)'], ['erreur-metier', 'erreur métier sans rapport avec la clé']
  ];
  for (let k = 0; k < GENRES.length; k++) {
    const b = banc({ page, plan: [GENRES[k][0]] });
    const s = lancer(b);
    await taper(b, CLE_NEUVE, 'Valider');
    await jusqua(() => s.fini);
    await patienter(PATIENCE);
    const iss = issue(b, s);
    verifier(P + '2.' + (k + 1) + 'a', GENRES[k][1] + ' : un seul envoi, aucun rejeu, aucun « Réessayer », erreur signalée',
      b.reseau.posts().length === 1 && b.reseau.imprevus.length === 0 && !reessaiVu(b) &&
      !iss.ok && iss.message !== '' && nbSaisies(b) === 1, etat(b) + ' / ' + masquer(iss.message));
    verifier(P + '2.' + (k + 1) + 'b', GENRES[k][1] + ' : la nouvelle clé n\'est PAS rangée',
      ecrituresDe(b, CLE_NEUVE).length === 0 && sansCle(b), etat(b));
  }

  /* ③ — refus explicite, puis annulation. */
  console.log('\n③ Refus explicite + annulation : clé effacée avant la redemande, champ vide, stockage vide');
  const b3 = banc({ page, plan: ['refus'], memo: CLE_MEMO });
  const s3 = lancer(b3);
  const d3 = await attendreDialogue(b3);
  verifier(P + '3.1', 'la clé rangée part sans rien demander, puis la redemande dit « incorrecte »',
    b3.reseau.posts().length === 1 && b3.reseau.posts()[0].corps.cle === CLE_MEMO && nbSaisies(b3) === 1 &&
    !!d3 && /incorrecte/i.test(d3.message));
  verifier(P + '3.2', 'la clé refusée est EFFACÉE avant la seconde demande', sansCle(b3), etat(b3));
  verifier(P + '3.3', 'le second champ est VIDE (la clé refusée n\'y est pas pré-remplie)',
    !!d3 && d3.valeurInitiale === '', d3 ? 'pré-remplissage : ' + (d3.valeurInitiale ? 'une clé' : 'vide') : 'aucun dialogue');
  if (dialogue(b3)) cliquer(b3, 'Annuler');
  await jusqua(() => s3.fini);
  await patienter(PATIENCE);
  const i3 = issue(b3, s3);
  verifier(P + '3.4', 'annulation : « Action annulée. », stockage vide, un seul envoi',
    /Action annulée/.test(i3.message) && sansCle(b3) && b3.reseau.posts().length === 1, etat(b3));

  const b3b = banc({ page, plan: ['refus'] });
  const s3b = lancer(b3b);
  await taper(b3b, CLE_REFUSEE, 'Valider');
  await jusqua(() => { const d = dialogue(b3b); return !!d && /incorrecte/i.test(d.message); });
  const d3b = dialogue(b3b);
  verifier(P + '3.5', 'nouvelle clé refusée : jamais écrite, et le second champ est vide',
    ecrituresDe(b3b, CLE_REFUSEE).length === 0 && sansCle(b3b) && !!d3b && d3b.valeurInitiale === '', etat(b3b));
  if (dialogue(b3b)) cliquer(b3b, 'Annuler');
  await jusqua(() => s3b.fini);
  const i3b = issue(b3b, s3b);
  verifier(P + '3.6', 'annulation : stockage vide, un seul envoi',
    /Action annulée/.test(i3b.message) && sansCle(b3b) && b3b.reseau.posts().length === 1, etat(b3b));

  /* ④ — refus explicite, puis nouvelle clé acceptée (réponse au rejeu TENUE). */
  console.log('\n④ Refus + nouvelle clé acceptée : deux envois au plus, rangée après le second succès');
  const b4 = banc({ page, plan: ['refus', 'tenue:succes'], memo: CLE_MEMO });
  const s4 = lancer(b4);
  await attendreDialogue(b4);
  await taper(b4, CLE_NEUVE, 'Valider');
  await jusqua(() => b4.reseau.enAttente.length === 1);
  const p4 = b4.reseau.posts();
  verifier(P + '4.1', 'le rejeu existant est conservé : second envoi avec la NOUVELLE clé',
    p4.length === 2 && p4[0].corps.cle === CLE_MEMO && p4[1].corps.cle === CLE_NEUVE, etat(b4));
  verifier(P + '4.2', 'pendant la réponse au rejeu : aucune clé rangée (ni l\'ancienne, ni la nouvelle)',
    ecrituresDe(b4, CLE_NEUVE).length === 0 && sansCle(b4), etat(b4));
  b4.reseau.liberer();
  await jusqua(() => s4.fini);
  await patienter(PATIENCE);
  const e4 = ecrituresDe(b4, CLE_NEUVE);
  verifier(P + '4.3', 'succès du rejeu : la nouvelle clé est rangée, APRÈS la seconde réponse',
    issue(b4, s4).ok && e4.length === 1 && e4[0].livrees === 2 && e4[0].derniere === 'succes' &&
    rangee(b4) === CLE_NEUVE, JSON.stringify(e4.map((a) => ({ reponsesRecues: a.livrees, derniere: a.derniere }))));
  verifier(P + '4.4', 'deux envois au total, une seule redemande',
    b4.reseau.posts().length === 2 && b4.reseau.imprevus.length === 0 && nbSaisies(b4) === 1);

  /* ⑤ — refus explicite, nouvelle clé, puis panne. */
  console.log('\n⑤ Refus + nouvelle clé puis panne : rien de rangé, aucun troisième envoi');
  const b5 = banc({ page, plan: ['refus', 'panne-reseau'] });
  const s5 = lancer(b5);
  await taper(b5, CLE_REFUSEE, 'Valider');
  await jusqua(() => { const d = dialogue(b5); return !!d && /incorrecte/i.test(d.message); });
  await taper(b5, CLE_NEUVE, 'Valider');
  await jusqua(() => s5.fini);
  await patienter(PATIENCE);
  const i5 = issue(b5, s5);
  verifier(P + '5.1', 'ni la clé refusée ni la nouvelle ne sont rangées',
    ecrituresDe(b5, CLE_REFUSEE).length === 0 && ecrituresDe(b5, CLE_NEUVE).length === 0 && sansCle(b5), etat(b5));
  verifier(P + '5.2', 'deux envois exactement, aucun « Réessayer », la panne est signalée',
    b5.reseau.posts().length === 2 && b5.reseau.imprevus.length === 0 && !reessaiVu(b5) &&
    !i5.ok && /Failed to fetch/.test(i5.message), etat(b5) + ' / ' + masquer(i5.message));

  /* ⑥ — clé déjà rangée + panne sans rapport avec la clé. */
  console.log('\n⑥ Clé déjà rangée + panne sans rapport avec la clé : clé PRÉSERVÉE');
  const GENRES6 = [['panne-reseau', 'panne réseau'], ['erreur-metier', 'erreur métier']];
  for (let k = 0; k < GENRES6.length; k++) {
    const b = banc({ page, plan: [GENRES6[k][0]], memo: CLE_MEMO });
    const s = lancer(b);
    await jusqua(() => s.fini);
    await patienter(PATIENCE);
    const iss = issue(b, s);
    verifier(P + '6.' + (k + 1), GENRES6[k][1] + ' : clé conservée, aucune écriture ni saisie, un envoi, aucun rejeu',
      rangee(b) === CLE_MEMO && ecritures(b).length === 0 && nbSaisies(b) === 0 &&
      b.reseau.posts().length === 1 && b.reseau.imprevus.length === 0 && !iss.ok, etat(b));
  }

  /* ⑦ — clé déjà rangée refusée, puis nouvelle clé refusée à son tour. */
  console.log('\n⑦ Clé rangée refusée, puis nouvelle clé refusée : rien ne reste, pas de troisième tour');
  const b7 = banc({ page, plan: ['refus', 'refus'], memo: CLE_MEMO });
  const s7 = lancer(b7);
  const d7 = await attendreDialogue(b7);
  const effaceeAvant = sansCle(b7);
  await taper(b7, CLE_REFUSEE, 'Valider');
  await jusqua(() => s7.fini);
  await patienter(PATIENCE);
  const i7 = issue(b7, s7);
  verifier(P + '7.1', 'la clé rangée refusée est effacée AVANT la seconde demande, champ vide',
    effaceeAvant && !!d7 && d7.valeurInitiale === '');
  verifier(P + '7.2', 'second refus : l\'erreur remonte, rien n\'est rangé, ni 3ᵉ demande ni 3ᵉ envoi',
    !i7.ok && /incorrecte/i.test(i7.message) && sansCle(b7) && ecrituresDe(b7, CLE_REFUSEE).length === 0 &&
    b7.reseau.posts().length === 2 && nbSaisies(b7) === 1 && b7.reseau.imprevus.length === 0, etat(b7));
}

/* --- Reconstruction du comportement d'AVANT 5B (auto-preuve) -------------- */

/**
 * Rend le code d'AVANT 5B à partir du code actuel, par quatre retouches LOCALISÉES dans
 * `demanderCle` et `apiPostProtege` — et nulle part ailleurs (les sites 5A restent intacts) :
 *  ① demanderCle range de nouveau la clé dès la saisie ;
 *  ② le rangement après succès est retiré ; ③ l'effacement avant la redemande aussi ;
 *  ④ et le rangement après le rejeu.
 * ⛔ Si une retouche ne trouve pas son ancre, la reconstruction est déclarée ratée (Z.0).
 */
function reconstruireAvant(src) {
  let dc, ap;
  try {
    dc = bloc(src, 'js/api.js', 'async function demanderCle(');
    ap = bloc(src, 'js/api.js', 'async function apiPostProtege(');
  } catch (e) { return { ok: false, source: src, detail: e.message }; }
  const manques = [];
  const retoucher = (texte, motif, par, quoi) => {
    if (!motif.test(texte)) { manques.push(quoi); return texte; }
    return texte.replace(motif, par);
  };
  const nDC = retoucher(dc.texte, /\n([ \t]*)return saisie\.trim\(\);/,
    '\n$1const propre = saisie.trim();\n$1definirCleLocale(role, propre);\n$1return propre;',
    '① demanderCle ne range plus rien');
  let nAP = ap.texte;
  nAP = retoucher(nAP, /\n[ \t]*if \(neuve\) definirCleLocale\(role, cle\);[^\n]*/, '', '② rangement après succès');
  nAP = retoucher(nAP, /\n[ \t]*definirCleLocale\(role, ''\);[^\n]*/, '', '③ effacement avant la redemande');
  nAP = retoucher(nAP, /\n[ \t]*definirCleLocale\(role, nouvelle\);[^\n]*/, '', '④ rangement après le rejeu');
  return {
    ok: manques.length === 0,
    source: src.slice(0, dc.debut) + nDC + src.slice(dc.fin, ap.debut) + nAP + src.slice(ap.fin),
    detail: manques.length ? 'retouche(s) sans ancre : ' + manques.join(' ; ') +
      ' — mets cette reconstruction à jour, ne la supprime pas' : ''
  };
}

/* ========================================================================== */
/*  CONTRÔLES                                                                 */
/* ========================================================================== */

async function controles() {
  await scenarios('saisie', 'S');
  await scenarios('admin', 'A');

  /* ---- G — garanties transverses ------------------------------------------ */
  console.log('\nG Garanties transverses — ' + BANCS.length + ' parcours, rôles scores et admin');
  const compte = (b, t) => b.dom.ecouteursDoc.filter((x) => x.t === t).length;
  verifier('G.1', 'aucune clé factice dans le HTML de la page ni dans un dialogue (message, attributs)',
    BANCS.every((b) => CLES.every((k) => toutLeVisible(b).indexOf(k) === -1)));
  verifier('G.2', 'aucune clé dans les messages d\'erreur affichés ou levés',
    BANCS.every((b) => b.messages.every((m) => CLES.every((k) => m.indexOf(k) === -1))));
  verifier('G.3', 'console muette : rien n\'est journalisé', BANCS.every((b) => b.journaux.length === 0),
    JSON.stringify(BANCS.map((b) => b.journaux.length)));
  verifier('G.4', 'localStorage n\'est JAMAIS utilisé (ni lu, ni écrit)',
    BANCS.every((b) => b.acces.every((a) => a.ou !== 'localStorage')));
  verifier('G.5', 'le stockage ne reçoit que la clé du rôle : aucune autre entrée écrite',
    BANCS.every((b) => ecritures(b).every((a) => a.k === 'r92_cle_' + b.role)));
  verifier('G.6', 'jamais plus d\'UN dialogue ouvert à la fois', BANCS.every((b) => b.dom.stats.maxDialogues <= 1));
  verifier('G.7', 'jamais plus d\'UN écouteur clavier de dialogue à la fois',
    BANCS.every((b) => b.dom.stats.maxClavier <= 1));
  verifier('G.8', 'en fin de parcours : aucun dialogue ni écouteur clavier résiduel',
    BANCS.every((b) => b.dom.dialoguesOuverts().length === 0 && compte(b, 'keydown') === 0));
  verifier('G.9', 'écouteurs de page en UN exemplaire (saisie : 2 clics, 1 saisie, 1 ouverture ; admin : aucun)',
    BANCS.every((b) => (b.page === 'saisie')
      ? (compte(b, 'click') === 2 && compte(b, 'input') === 1 && compte(b, 'DOMContentLoaded') === 1)
      : b.dom.ecouteursDoc.length === 0));
  verifier('G.10', 'aucune minuterie, aucun envoi imprévu : rien ne peut rejouer une écriture',
    BANCS.every((b) => b.minuteries.length === 0 && b.reseau.imprevus.length === 0));

  /* ---- Z — auto-preuve : le comportement d'AVANT 5B doit être pris en défaut */
  console.log('\nZ Preuve du harnais : le comportement d\'AVANT 5B, reconstruit, reproduit les trois défauts');
  const rec = reconstruireAvant(lire('js/api.js'));
  verifier('Z.0', 'le code d\'avant 5B est reconstruit (4 retouches localisées, sites 5A intacts)', rec.ok, rec.detail);
  const AV = rec.source;

  // Z.1 — défaut ① : la clé est écrite PENDANT l'attente de la réponse.
  const z1 = banc({ page: 'saisie', plan: ['tenue:succes'], sourceApi: AV, suivi: false });
  const sz1 = lancer(z1);
  await taper(z1, CLE_NEUVE, 'Valider');
  await jusqua(() => z1.reseau.enAttente.length === 1);
  const z1Pendant = ecrituresDe(z1, CLE_NEUVE).length > 0 && rangee(z1) === CLE_NEUVE;
  z1.reseau.liberer();
  await jusqua(() => sz1.fini);
  verifier('Z.1', 'avant 5B : la clé est écrite AVANT toute réponse (défaut ① reproduit)', z1Pendant,
    'la reconstruction n\'a pas reproduit le défaut : les contrôles x1.3 / x4.2 ne prouvent rien');

  // Z.2 — défaut ② : la clé rangée refusée pré-remplit la redemande et RESTE après annulation.
  const z2 = banc({ page: 'admin', plan: ['refus'], memo: CLE_MEMO, sourceApi: AV, suivi: false });
  const sz2 = lancer(z2);
  const dz2 = await attendreDialogue(z2);
  const prerempli = !!dz2 && dz2.valeurInitiale === CLE_MEMO;
  if (dialogue(z2)) cliquer(z2, 'Annuler');
  await jusqua(() => sz2.fini);
  verifier('Z.2', 'avant 5B : la clé refusée pré-remplit la redemande et RESTE après annulation (défaut ② reproduit)',
    prerempli && rangee(z2) === CLE_MEMO,
    'la reconstruction n\'a pas reproduit le défaut : les contrôles x3.2 à x3.4 ne prouvent rien');

  // Z.3 — défaut ② (clé neuve) : une nouvelle clé refusée RESTE rangée après annulation.
  const z3 = banc({ page: 'saisie', plan: ['refus'], sourceApi: AV, suivi: false });
  const sz3 = lancer(z3);
  await taper(z3, CLE_REFUSEE, 'Valider');
  await jusqua(() => { const d = dialogue(z3); return !!d && /incorrecte/i.test(d.message); });
  if (dialogue(z3)) cliquer(z3, 'Annuler');
  await jusqua(() => sz3.fini);
  verifier('Z.3', 'avant 5B : une nouvelle clé refusée RESTE rangée après annulation (défaut ② reproduit)',
    rangee(z3) === CLE_REFUSEE,
    'la reconstruction n\'a pas reproduit le défaut : les contrôles x3.5 / x3.6 ne prouvent rien');

  // Z.4 — défaut ③ : après une panne, la nouvelle clé jamais confirmée RESTE rangée.
  const z4 = banc({ page: 'admin', plan: ['panne-reseau'], sourceApi: AV, suivi: false });
  const sz4 = lancer(z4);
  await taper(z4, CLE_NEUVE, 'Valider');
  await jusqua(() => sz4.fini);
  verifier('Z.4', 'avant 5B : après une panne, la nouvelle clé RESTE rangée (défaut ③ reproduit)',
    rangee(z4) === CLE_NEUVE && z4.reseau.posts().length === 1,
    'la reconstruction n\'a pas reproduit le défaut : les contrôles x2.nb ne prouvent rien');
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
