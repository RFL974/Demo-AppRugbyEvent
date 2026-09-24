#!/usr/bin/env node
/**
 * ============================================================================
 *  LOT « SAISIE DES SCORES » — la table de marque, du chargement au résultat inconnu
 *  SCORES-TABLE-MARQUE-DR-8A
 * ============================================================================
 *
 *  ▶ node tests/scores-table-marque-dr-8a.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *
 *  ⭐ IL EXÉCUTE LE CODE RÉEL du parcours PROTÉGÉ, dans l'ordre exact où la passerelle le sert :
 *  `js/commun.js`, `js/dialog.js`, `js/api.js`, `js/saisie.js`, puis `js/saisie-protegee.js`.
 *  ⛔ Rien n'est recopié, rien n'est réécrit pour le test.
 *
 *  ⚠️ CE QU'IL NE PROUVE PAS, et il vaut mieux le dire : le DOM du harnais ne PARSE pas le HTML.
 *  Les cartes de match sont posées avec les MÊMES repères que `carteMatch()` produit — `.match`
 *  porteur de `data-id`, deux `input.score` dans l'ordre A puis B, `.bouton-valider`,
 *  `.message-form` —, et la § K vérifie, sur le HTML réellement rendu, que ces repères y sont.
 *  C'est le même partage des rôles que `saisie-table-marque.test.js` et `ux-cle-scores-retry-dr-5a`.
 *
 *  CE QU'IL PROTÈGE :
 *   A — chargement initial : UNE requête protégée, zéro appel parasite, zéro stockage persistant ;
 *   B — une validation = UNE requête, qui porte jeton, `requete_id` NEUF et `version_lue` du match ;
 *   C — double clic et double validation rapprochée : UNE seule mutation logique ;
 *   D — conflit (SCORE_MODIFIE) : relecture NON MUTANTE, aucun renvoi, message honnête ;
 *   E — accès fermé et édition tournée : l'onglet devient incapable d'écrire, sur-le-champ ;
 *   F — RÉSULTAT INCONNU : ni « réussi » ni « échoué », carte fermée jusqu'à relecture, ⛔ aucune
 *       réémission automatique — et la relecture, elle, ne mute rien ;
 *   G — erreurs CERTAINES (annulation, clé refusée) : elles ne bloquent pas la carte ;
 *   H — compatibilité : ancien frontend ↔ nouveau backend, nouveau frontend ↔ ancien backend,
 *       ancienne page en cache — échec FERME, jamais de faux succès ;
 *   I — l'état serveur autoritaire est repris ; le DOM et les variables ne sont jamais l'autorité ;
 *   J — plusieurs onglets / plusieurs tables de marque, sans contamination ;
 *   K — les repères du HTML rendu, et le contrat de validation ;
 *   Z — MUTANTS : chaque garantie a le sien, et chacun est EXÉCUTÉ.
 *
 *  ⚠️ TOUTES LES VALEURS SONT FACTICES — la clé, le jeton et l'adresse n'ouvrent rien
 *  (`exemple.invalid` : domaine réservé RFC 2606, jamais résoluble).
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

const CLE_FACTICE = 'CLE-SCORES-FACTICE-8A-jamais-reelle';
const JETON_FACTICE = 'a'.repeat(64);
const API_URL_FACTICE = 'https://exemple.invalid/exec';

let reussis = 0;
const echecs = [];
function verifier(num, intitule, condition, detail) {
  if (condition) { reussis++; console.log('  ✓ [' + num + '] ' + intitule); return; }
  const d = detail === undefined ? '' : String(typeof detail === 'string' ? detail : JSON.stringify(detail));
  echecs.push('[' + num + '] ' + intitule + (d ? ' :: ' + d.slice(0, 300) : ''));
  console.log('  ✗ [' + num + '] ' + intitule + (d ? '\n      → ' + d.slice(0, 300) : ''));
}
const titre = (t) => console.log('\n' + t + '\n' + '─'.repeat(72));

/* ==========================================================================
   LE DOM SIMULÉ — assez pour le parcours réel, et pas un octet de plus
   ========================================================================== */
function fabriquerDom() {
  const crees = [];
  const ecouteursDoc = [];
  const dialogues = [];

  /** `tag`, `.classe`, `tag.classe`, `#id`, et `tag[attribut="valeur"]` — le code réel n'en demande pas plus. */
  function correspond(el, simple) {
    const m = /^([a-z]*)((?:\.[\w-]+)*)(?:#([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i.exec(simple.trim());
    if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) {
      throw new Error('HARNAIS : sélecteur non pris en charge « ' + simple + ' »');
    }
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    if (m[3] && el.id !== m[3]) return false;
    if (m[4]) {
      /* ⭐ `name`, `rel`, `type`… sont des PROPRIÉTÉS sur les éléments du harnais, et peuvent aussi
         avoir été posées par `setAttribute` : on regarde les deux, comme un navigateur. */
      const valeur = el.getAttribute(m[4]) !== null ? el.getAttribute(m[4]) : el[m[4]];
      if (valeur === undefined || valeur === null || valeur === '') return false;
      if (m[5] !== undefined && String(valeur) !== m[5]) return false;
    }
    return m[2].split('.').filter(Boolean).every((c) => el.classList.contains(c));
  }
  /** Un sélecteur simple, ou un couple « ancêtre descendant » — les deux formes que le code emploie. */
  function correspondChemin(el, chemin) {
    const parties = chemin.trim().split(/\s+/);
    if (parties.length === 1) return correspond(el, parties[0]);
    if (parties.length !== 2) throw new Error('HARNAIS : sélecteur non pris en charge « ' + chemin + ' »');
    if (!correspond(el, parties[1])) return false;
    for (let n = el.parent; n; n = n.parent) if (correspond(n, parties[0])) return true;
    return false;
  }
  const selectionne = (el, sel) => sel.split(',').some((s) => correspondChemin(el, s));
  function estAttache(el) {
    for (let n = el; n; n = n.parent) if (n === doc.head || n === doc.body) return true;
    return false;
  }

  function creer(tag) {
    const classes = new Set();
    const attributs = {};
    const ecouteurs = {};
    const enfants = [];
    const el = {
      tagName: String(tag).toUpperCase(), enfants, attributs, ecouteurs, parent: null,
      id: '', textContent: '', innerHTML: '', value: '', type: '', name: '', content: '', rel: '', href: '',
      disabled: false, hidden: false,
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => { classes.add(c); },
        remove: (c) => { classes.delete(c); },
        toggle: (c, f) => { const v = (f === undefined) ? !classes.has(c) : !!f; if (v) classes.add(c); else classes.delete(c); return v; }
      },
      get className() { return Array.from(classes).join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      setAttribute(n, v) { attributs[n] = String(v); },
      getAttribute(n) { return Object.prototype.hasOwnProperty.call(attributs, n) ? attributs[n] : null; },
      removeAttribute(n) { delete attributs[n]; },
      appendChild(e) { if (e.parent) e.remove(); e.parent = el; enfants.push(e); if (el === doc.body && e.classList.contains('dlg-overlay')) dialogues.push(e); return e; },
      insertBefore(e, ref) { if (e.parent) e.remove(); e.parent = el; const i = enfants.indexOf(ref); enfants.splice(i === -1 ? enfants.length : i, 0, e); return e; },
      remove() { if (!el.parent) return; const f = el.parent.enfants; const i = f.indexOf(el); if (i !== -1) f.splice(i, 1); el.parent = null; },
      addEventListener(t, fn) { (ecouteurs[t] = ecouteurs[t] || []).push(fn); },
      removeEventListener(t, fn) { if (ecouteurs[t]) ecouteurs[t] = ecouteurs[t].filter((f) => f !== fn); },
      focus() {}, select() {},
      click() { return propager(el, 'click'); },
      closest(sel) { for (let n = el; n; n = n.parent) if (selectionne(n, sel)) return n; return null; },
      querySelectorAll(sel) {
        const r = [];
        (function parcourir(n) { n.enfants.forEach((e) => { if (selectionne(e, sel)) r.push(e); parcourir(e); }); })(el);
        return r;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      insertAdjacentHTML(pos, html) { el.htmlInsere = (el.htmlInsere || '') + html; },
      get firstChild() { return enfants[0] || null; }
    };
    crees.push(el);
    return el;
  }

  function propager(cible, type) {
    const ev = { type, target: cible, preventDefault() {}, stopPropagation() {} };
    for (let n = cible; n; n = n.parent) (n.ecouteurs[type] || []).slice().forEach((fn) => fn(ev));
    return ecouteursDoc.filter((x) => x.t === type).slice().map((x) => x.fn(ev));
  }

  const doc = {
    head: null, body: null,
    getElementById(id) { return crees.find((e) => e.id === id && estAttache(e)) || null; },
    createElement: creer,
    querySelector(sel) { return doc.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return doc.head.querySelectorAll(sel).concat(doc.body.querySelectorAll(sel)); },
    addEventListener(t, fn) { ecouteursDoc.push({ t, fn }); },
    removeEventListener(t, fn) { const i = ecouteursDoc.findIndex((x) => x.t === t && x.fn === fn); if (i !== -1) ecouteursDoc.splice(i, 1); }
  };
  doc.head = creer('head');
  doc.body = creer('body');
  doc.body.id = '__body__';
  return { document: doc, propager, dialogues, ecouteursDoc, creer };
}

/* ==========================================================================
   LE FAUX SERVEUR — programmable, et capable de RETENIR une réponse
   ========================================================================== */
function fabriquerReseau() {
  const requetes = [];
  const enAttente = [];
  let regle = null;

  function fetchFaux(url, reglages) {
    const corps = (reglages && reglages.body) ? JSON.parse(reglages.body) : {};
    const req = { n: requetes.length + 1, url: String(url), corps, action: corps.action };
    requetes.push(req);
    const decision = regle ? regle(req) : { json: { ok: true } };
    if (decision === 'retenir') {
      return new Promise((resoudre, rejeter) => { enAttente.push({ req, resoudre, rejeter }); });
    }
    if (decision.rejet) return Promise.reject(new Error(decision.rejet));
    if (decision.statut && decision.statut !== 200) {
      return Promise.resolve({ ok: false, status: decision.statut, json: () => Promise.resolve({}) });
    }
    if (decision.corpsIllisible) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('JSON illisible')) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(decision.json) });
  }

  return {
    fetch: fetchFaux,
    requetes,
    enAttente,
    programmer(f) { regle = f; },
    actions: () => requetes.map((r) => r.action),
    de: (action) => requetes.filter((r) => r.action === action),
    /** Libère une réponse retenue : c'est ainsi que l'ordre des événements est PILOTÉ. */
    livrer(indice, json) {
      const p = enAttente.splice(indice === undefined ? 0 : indice, 1)[0];
      p.resoudre({ ok: true, status: 200, json: () => Promise.resolve(json) });
    },
    couper(indice, message) {
      const p = enAttente.splice(indice === undefined ? 0 : indice, 1)[0];
      p.rejeter(new Error(message || 'Failed to fetch'));
    }
  };
}

/* ==========================================================================
   LES DONNÉES SERVIES — un tournoi minuscule, entièrement fictif
   ========================================================================== */
let versionCourante = 1;
function donneesSaisie(options) {
  const o = options || {};
  return {
    ok: true,
    config: { global: { tournoi_nom: 'Tournoi fictif 8A' }, categories: [{ categorie: 'U10' }] },
    equipes: [{ id_equipe: 'EA', nom_equipe: 'Alpha', categorie: 'U10', poule: 'A' },
              { id_equipe: 'EB', nom_equipe: 'Bravo', categorie: 'U10', poule: 'A' }],
    capacites: { categories: { U10: { tir_au_but: false } } },
    matchs: [{ id_match: 'M1', categorie: 'U10', poule: 'A', terrain: '1', heure_debut: '09:00',
      equipe_A: 'EA', equipe_B: 'EB', score_A: o.scoreA === undefined ? '' : o.scoreA,
      score_B: o.scoreB === undefined ? '' : o.scoreB, statut: o.statut || 'à venir', phase: 'poule',
      version_lue: o.version || ('v' + versionCourante) }]
  };
}
const REFUS_FERME = { error: 'Accès fermé ou lien expiré. Rechargez la page ou demandez un lien à jour.', acces_ferme: true };

/* ==========================================================================
   LE BANC — la page protégée, telle que la passerelle la sert
   ========================================================================== */
const BANCS = [];
function banc(o) {
  const options = o || {};
  const dom = fabriquerDom();
  const reseau = fabriquerReseau();
  const accesStockage = [];
  const journaux = [];

  function stockage(nom) {
    const donnees = new Map();
    return {
      donnees,
      getItem(c) { accesStockage.push(nom + ':lire:' + c); return donnees.has(c) ? donnees.get(c) : null; },
      setItem(c, v) { accesStockage.push(nom + ':ecrire:' + c); donnees.set(c, String(v)); },
      removeItem(c) { accesStockage.push(nom + ':effacer:' + c); donnees.delete(c); }
    };
  }

  // Les éléments que la page de la passerelle porte, un par un.
  ['liste-matchs', 'filtre-cat-saisie', 'select-cat-saisie', 'filtre-terrain-saisie',
   'select-terrain-saisie', 'bouton-rafraichir-saisie', 'maj-saisie', 'barre-saisie', 'note-saisie']
    .forEach((id) => {
      const el = dom.document.createElement(id.indexOf('select-') === 0 ? 'select' : 'div');
      el.id = id;
      dom.document.body.appendChild(el);
    });
  const entete = dom.document.createElement('header');
  entete.className = 'entete';
  dom.document.body.appendChild(entete);
  const principal = dom.document.createElement('main');
  dom.document.body.appendChild(principal);
  const carteSection = dom.document.createElement('section');
  carteSection.className = 'carte';
  principal.appendChild(carteSection);
  const contexte = dom.document.createElement('div');
  contexte.id = 'contexte-saisie';
  contexte.setAttribute('data-jeton', options.jeton === undefined ? JETON_FACTICE : options.jeton);
  contexte.setAttribute('data-api', API_URL_FACTICE);
  dom.document.body.appendChild(contexte);

  const espion = function () { journaux.push(Array.prototype.map.call(arguments, String).join(' ')); };
  const ctx = {
    document: dom.document,
    console: { log: espion, info: espion, warn: espion, error: espion, debug: espion },
    API_URL: API_URL_FACTICE, SNAPSHOT_URL: '',
    URL, fetch: reseau.fetch,
    performance: { now: () => Date.now() },
    crypto: { randomUUID: () => 'uuid-fictif-' + (++compteurUuid) },
    Date, Math, JSON, Object, Array, String, Number, Boolean, isFinite, parseInt, Promise, Error,
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => 0, clearInterval: () => {}
  };
  ctx.window = ctx;
  ctx.localStorage = stockage('localStorage');
  ctx.sessionStorage = stockage('sessionStorage');
  if (options.cleRangee) ctx.sessionStorage.donnees.set('r92_cle_scores', options.cleRangee);
  vm.createContext(ctx);
  ['js/commun.js', 'js/dialog.js', 'js/api.js', 'js/saisie.js', 'js/saisie-protegee.js'].forEach((f) => {
    const source = (options.mutations && options.mutations[f])
      ? options.mutations[f](lire(f)) : lire(f);
    vm.runInContext(source, ctx, { filename: f });
  });
  /* ⭐ LES VARIABLES DE MODULE NE SONT PAS SUR L'OBJET GLOBAL. `js/saisie.js` déclare `matchs`,
     `saisieJeton` et les autres avec `let` : en V8, une déclaration lexicale de premier niveau vit
     dans l'environnement lexical du contexte, ⛔ jamais comme propriété de son objet global. On les
     lit donc en ÉVALUANT leur nom dans le contexte — c'est le code réel qu'on interroge, pas une copie. */
  const lex = (expression) => vm.runInContext(expression, ctx);
  const b = { dom, reseau, ctx, lex, accesStockage, journaux, options };
  BANCS.push(b);
  return b;
}
let compteurUuid = 0;

const tick = () => new Promise((r) => setImmediate(r));
async function patienter(n) { for (let i = 0; i < (n || 30); i++) await tick(); }
function suivre(p) {
  const v = { fini: false, valeur: undefined, erreur: null };
  Promise.resolve(p).then((x) => { v.valeur = x; v.fini = true; }, (e) => { v.erreur = e; v.fini = true; });
  return v;
}

/** Le dialogue ouvert, décrit. ⛔ Le harnais ne clique jamais « tout seul ». */
function dialogue(b) {
  const overlay = b.dom.document.body.enfants.filter((e) => e.classList.contains('dlg-overlay')).pop();
  if (!overlay) return null;
  const tous = [];
  (function parcourir(n) { n.enfants.forEach((e) => { tous.push(e); parcourir(e); }); })(overlay);
  const champ = tous.find((e) => e.classList.contains('dlg-input')) || null;
  const boutons = tous.filter((e) => e.tagName === 'BUTTON');
  const msg = tous.find((e) => e.classList.contains('dlg-msg'));
  return { overlay, champ, boutons, message: msg ? msg.textContent : '',
    libelles: boutons.map((x) => x.textContent) };
}
async function taper(b, valeur, libelle) {
  await patienter(6);
  const d = dialogue(b);
  if (!d) throw new Error('HARNAIS : aucun dialogue ouvert');
  if (d.champ) d.champ.value = valeur;
  const bouton = d.boutons.find((x) => x.textContent === libelle) || d.boutons[0];
  b.dom.propager(bouton, 'click');
  await patienter(6);
}

/** Une carte de match, avec EXACTEMENT les repères que `carteMatch()` produit. */
function poserCarte(b, o) {
  const opt = o || {};
  const d = b.dom.document;
  const el = (tag, classe, texte) => { const e = d.createElement(tag); e.className = classe; if (texte) e.textContent = texte; return e; };
  const carte = el('div', 'match' + (opt.termine ? ' match-termine' : ''));
  carte.setAttribute('data-id', opt.id || 'M1');
  const meta = el('div', 'match-meta', '09:00 · Terrain 1 · Poule A');
  const zone = el('div', 'match-saisie');
  const sA = el('input', 'r-input score');
  const sB = el('input', 'r-input score');
  sA.value = opt.a === undefined ? '3' : String(opt.a);
  sB.value = opt.b === undefined ? '1' : String(opt.b);
  sA.disabled = sB.disabled = !!opt.termine;
  const bouton = el('button', 'bouton bouton-valider', opt.termine ? 'Corriger' : 'Valider');
  const msg = el('div', 'message-form');
  zone.appendChild(sA); zone.appendChild(sB); zone.appendChild(bouton);
  carte.appendChild(meta); carte.appendChild(zone); carte.appendChild(msg);
  d.getElementById('liste-matchs').appendChild(carte);
  return { carte, bouton, msg, sA, sB };
}

/** Ouvre la page : jeton lu, clé demandée puis acceptée, matchs affichés. */
async function ouvrir(b, donnees) {
  b.reseau.programmer((r) => (r.action === 'getSaisieScores'
    ? { json: donnees || donneesSaisie() } : { json: { ok: true } }));
  const vol = suivre(b.ctx.initSaisieProtegee());
  if (!b.options.cleRangee) await taper(b, CLE_FACTICE, 'Se connecter');
  await patienter(20);
  return vol;
}

/* ══════════════════════════════════════════════════════════════════════════ */
(async function () {

titre('A — CHARGEMENT INITIAL : une seule requête, aucun parasite, aucun stockage persistant');
{
  const b = banc();
  await ouvrir(b);
  verifier('A.1', 'UNE seule requête réseau au chargement, et c\'est `getSaisieScores`',
    b.reseau.requetes.length === 1 && b.reseau.requetes[0].action === 'getSaisieScores',
    JSON.stringify(b.reseau.actions()));
  verifier('A.2', '⛔ ni `getAll`, ni `getCapacitesCategories`, ni aucune lecture publique',
    b.reseau.de('getAll').length === 0 && b.reseau.de('getCapacitesCategories').length === 0);
  verifier('A.3', 'la requête porte le jeton ET la clé — jamais l\'un sans l\'autre',
    b.reseau.requetes[0].corps.jeton === JETON_FACTICE && b.reseau.requetes[0].corps.cle === CLE_FACTICE);
  verifier('A.4', '⛔ `localStorage` n\'est JAMAIS touché — ni lu, ni écrit — pendant TOUT le parcours',
    b.accesStockage.every((a) => a.indexOf('localStorage') !== 0), JSON.stringify(b.accesStockage));
  verifier('A.5', 'la clé n\'est rangée qu\'APRÈS la réponse positive, et seulement en session',
    b.ctx.sessionStorage.donnees.get('r92_cle_scores') === CLE_FACTICE);
  verifier('A.6', 'le jeton est RETIRÉ du document dès sa lecture',
    b.dom.document.getElementById('contexte-saisie').getAttribute('data-jeton') === null);
  verifier('A.7', '⛔ le jeton n\'est écrit dans AUCUN stockage',
    Array.from(b.ctx.sessionStorage.donnees.values()).every((v) => v.indexOf(JETON_FACTICE) === -1) &&
    b.ctx.localStorage.donnees.size === 0);
  verifier('A.8', 'les matchs servis sont affichés, et la catégorie active vient des données',
    b.lex('matchs').length === 1 && b.lex('categorieActiveSaisie') === 'U10');
}

{
  const b = banc({ jeton: 'pas-un-jeton' });
  const vol = suivre(b.ctx.initSaisieProtegee());
  await patienter(10);
  verifier('A.9', '⛔ jeton mal formé : AUCUNE requête, interface fermée, aucun dialogue de clé',
    b.reseau.requetes.length === 0 && dialogue(b) === null && vol.fini === true &&
    b.lex('saisieAccesFerme') === true, JSON.stringify(b.reseau.actions()));
}

titre('B — UNE VALIDATION = UNE REQUÊTE, qui porte la précondition');
{
  const b = banc();
  await ouvrir(b);
  const c = poserCarte(b);
  b.reseau.programmer((r) => (r.action === 'enregistrerScore'
    ? { json: { ok: true, id_match: 'M1', match: { score_A: '3', score_B: '1', statut: 'terminé' }, version_apres: 'v2' } }
    : { json: donneesSaisie() }));
  const avant = b.reseau.requetes.length;
  await Promise.all(b.dom.propager(c.bouton, 'click'));
  await patienter(20);
  const envois = b.reseau.de('enregistrerScore');
  verifier('B.1', 'UNE seule requête réseau pour une validation',
    b.reseau.requetes.length === avant + 1 && envois.length === 1, JSON.stringify(b.reseau.actions()));
  verifier('B.2', 'elle porte le jeton, la clé, un `requete_id` et la `version_lue` DU MATCH',
    envois[0].corps.jeton === JETON_FACTICE && envois[0].corps.cle === CLE_FACTICE &&
    /^tbl-/.test(String(envois[0].corps.requete_id)) && envois[0].corps.version_lue === 'v1', envois[0].corps);
  verifier('B.3', '⭐ l\'état serveur autoritaire est REPRIS : la version rendue devient la version lue',
    b.lex('matchs')[0].version_lue === 'v2' && b.lex('matchs')[0].score_A === '3', b.lex('matchs')[0]);
  verifier('B.4', 'le message annonce l\'enregistrement, et la carte se verrouille',
    /Score enregistré/.test(c.msg.textContent) && c.carte.classList.contains('match-termine'),
    c.msg.textContent);

  /* ⭐ Une seconde validation à l'identique : le serveur dit qu'il n'a rien écrit, l'écran le dit aussi. */
  b.ctx.deverrouiller(c.carte);
  b.reseau.programmer(() => ({ json: { ok: true, id_match: 'M1', score_inchange: true,
    match: { score_A: '3', score_B: '1', statut: 'terminé' }, version_apres: 'v2' } }));
  await Promise.all(b.dom.propager(c.bouton, 'click'));
  await patienter(20);
  verifier('B.5', '⭐ score INCHANGÉ : le message le DIT, sans prétendre avoir écrit',
    /déjà enregistré, inchangé/.test(c.msg.textContent) && !/^Score enregistré ✓$/.test(c.msg.textContent),
    c.msg.textContent);
  verifier('B.6', 'et la version reste celle du serveur', b.lex('matchs')[0].version_lue === 'v2');
}

titre('C — DOUBLE CLIC ET DOUBLE VALIDATION : une seule mutation logique');
{
  const b = banc();
  await ouvrir(b);
  const c = poserCarte(b);
  b.reseau.programmer((r) => (r.action === 'enregistrerScore' ? 'retenir' : { json: donneesSaisie() }));
  /* ⭐ L'ORDRE EST PILOTÉ : la première réponse est RETENUE, et les deux clics suivants tombent
     pendant qu'elle est en vol. ⛔ Aucun `await` entre les clics : c'est un vrai double clic. */
  const premier = suivre(Promise.all(b.dom.propager(c.bouton, 'click')));
  const second = suivre(Promise.all(b.dom.propager(c.bouton, 'click')));
  const troisieme = suivre(Promise.all(b.dom.propager(c.bouton, 'click')));
  await patienter(10);
  verifier('C.1', '⭐ trois clics rapprochés, UNE seule requête d\'écriture partie',
    b.reseau.de('enregistrerScore').length === 1, JSON.stringify(b.reseau.actions()));
  verifier('C.2', 'le bouton est fermé pendant l\'envoi', c.bouton.disabled === true);
  b.reseau.livrer(0, { ok: true, id_match: 'M1', match: { score_A: '3', score_B: '1', statut: 'terminé' }, version_apres: 'v2' });
  await patienter(20);
  verifier('C.3', 'après la réponse, toujours UNE seule requête d\'écriture',
    b.reseau.de('enregistrerScore').length === 1 && premier.fini && second.fini && troisieme.fini);
  verifier('C.4', 'et un seul `requete_id` a été tiré',
    new Set(b.reseau.de('enregistrerScore').map((r) => r.corps.requete_id)).size === 1);
}

titre('D — CONFLIT : relecture NON MUTANTE, aucun renvoi, message honnête');
{
  const b = banc();
  await ouvrir(b);
  const c = poserCarte(b);
  b.reseau.programmer((r) => {
    if (r.action === 'enregistrerScore') {
      return { json: { error: 'Ce match vient d\'être modifié depuis un autre appareil : recharge le match avant toute nouvelle saisie.',
        refus: 'SCORE_MODIFIE', id_match: 'M1', version_actuelle: 'v9' } };
    }
    return { json: donneesSaisie({ scoreA: '7', scoreB: '0', statut: 'terminé', version: 'v9' }) };
  });
  /* ⛔ ON N'ATTEND PAS LE CLIC : le parcours de conflit OUVRE un dialogue et s'arrête dessus.
     L'attendre ici figerait le banc — c'est au harnais de fermer le dialogue, comme un humain. */
  const envoi = suivre(Promise.all(b.dom.propager(c.bouton, 'click')));
  await patienter(25);
  const dlg = dialogue(b);
  if (dlg) b.dom.propager(dlg.boutons[dlg.boutons.length - 1], 'click');
  await patienter(25);
  void envoi;
  verifier('D.1', '⛔ l\'écriture n\'est JAMAIS renvoyée après un conflit',
    b.reseau.de('enregistrerScore').length === 1, JSON.stringify(b.reseau.actions()));
  verifier('D.2', '⭐ une RELECTURE non mutante est faite, et une seule',
    b.reseau.de('getSaisieScores').length === 2, JSON.stringify(b.reseau.actions()));
  verifier('D.3', 'l\'état serveur écrase l\'état local : le score affiché est celui du serveur',
    b.lex('matchs')[0].score_A === '7' && b.lex('matchs')[0].version_lue === 'v9', b.lex('matchs')[0]);
  verifier('D.4', 'le message dit que le match a changé ailleurs — pas un succès, pas une panne',
    /modifié depuis un autre appareil/.test(c.msg.textContent) ||
    /modifié depuis un autre appareil/.test((dlg && dlg.message) || ''), c.msg.textContent);
  verifier('D.5', '⛔ et la carte ne passe PAS en « résultat inconnu » : ce refus-là est CERTAIN',
    c.carte.classList.contains('match-inconnu') === false);
}

titre('E — ACCÈS FERMÉ / ÉDITION TOURNÉE : l\'onglet devient incapable d\'écrire');
{
  const b = banc();
  await ouvrir(b);
  const c = poserCarte(b);
  b.reseau.programmer(() => ({ json: REFUS_FERME }));
  await Promise.all(b.dom.propager(c.bouton, 'click'));
  await patienter(20);
  verifier('E.1', 'le contexte est vidé : jeton oublié, clé effacée, matchs abandonnés',
    b.lex('saisieAccesFerme') === true && b.lex('saisieJeton') === '' && b.lex('matchs').length === 0 &&
    b.ctx.sessionStorage.donnees.get('r92_cle_scores') === '');
  const avant = b.reseau.requetes.length;
  await Promise.all(b.dom.propager(c.bouton, 'click'));
  await patienter(15);
  verifier('E.2', '⛔ un nouveau clic n\'émet plus RIEN : la page est close',
    b.reseau.requetes.length === avant, JSON.stringify(b.reseau.actions().slice(avant)));
  await b.ctx.rafraichirSaisieProtegee();
  await patienter(10);
  verifier('E.3', '⛔ et « Rafraîchir » n\'émet plus rien non plus', b.reseau.requetes.length === avant);
}

titre('F — RÉSULTAT INCONNU : ni réussi, ni échoué — et rien ne repart tout seul');
{
  /* Les quatre façons dont une réponse peut ne pas revenir. */
  const CAS = [
    ['coupure réseau', () => ({ rejet: 'Failed to fetch' })],
    ['statut HTTP 502', () => ({ statut: 502 })],
    ['corps illisible', () => ({ corpsIllisible: true })],
    ['le serveur dit lui-même qu\'il ne conclut pas (ETAT_A_RELIRE)',
      () => ({ json: { error: 'La demande précédente a été interrompue et l\'état observé ne permet pas de conclure.', refus: 'ETAT_A_RELIRE' } })]
  ];
  for (let i = 0; i < CAS.length; i++) {
    const [nom, reponse] = CAS[i];
    const b = banc();
    await ouvrir(b);
    const c = poserCarte(b);
    b.reseau.programmer((r) => (r.action === 'enregistrerScore' ? reponse() : { json: donneesSaisie() }));
    await Promise.all(b.dom.propager(c.bouton, 'click'));
    await patienter(25);
    verifier('F.1.' + (i + 1), nom + ' : le message n\'affirme NI la réussite NI l\'échec',
      /on ne sait pas si ce score a été enregistré/.test(c.msg.textContent) &&
      !/Score enregistré/.test(c.msg.textContent), c.msg.textContent);
    verifier('F.2.' + (i + 1), nom + ' : ⛔ AUCUNE réémission automatique',
      b.reseau.de('enregistrerScore').length === 1, JSON.stringify(b.reseau.actions()));
    verifier('F.3.' + (i + 1), nom + ' : la carte est FERMÉE — plus de nouvelle intention d\'écriture',
      c.bouton.disabled === true && c.sA.disabled === true && c.sB.disabled === true &&
      c.carte.classList.contains('match-inconnu'));
    const avant = b.reseau.requetes.length;
    await Promise.all(b.dom.propager(c.bouton, 'click'));
    await patienter(10);
    verifier('F.4.' + (i + 1), nom + ' : recliquer n\'émet rien tant qu\'on n\'a pas relu',
      b.reseau.requetes.length === avant);
  }
}

{
  /* ⭐ LA SORTIE : une RELECTURE, et elle ne mute rien. */
  const b = banc();
  await ouvrir(b);
  const c = poserCarte(b);
  b.reseau.programmer((r) => (r.action === 'enregistrerScore' ? { rejet: 'Failed to fetch' }
    : { json: donneesSaisie({ scoreA: '3', scoreB: '1', statut: 'terminé', version: 'v2' }) }));
  await Promise.all(b.dom.propager(c.bouton, 'click'));
  await patienter(25);
  const avant = b.reseau.requetes.length;
  await b.ctx.rafraichirSaisieProtegee();
  await patienter(20);
  const nouvelles = b.reseau.requetes.slice(avant);
  verifier('F.5', '⭐ la relecture est une LECTURE, et rien d\'autre',
    nouvelles.length === 1 && nouvelles[0].action === 'getSaisieScores',
    JSON.stringify(nouvelles.map((r) => r.action)));
  verifier('F.6', '⭐ et elle rend l\'état serveur autoritaire : le doute est levé par le SERVEUR',
    b.lex('matchs')[0].score_A === '3' && b.lex('matchs')[0].version_lue === 'v2' &&
    b.lex('matchs')[0].statut === 'terminé', b.lex('matchs')[0]);
  verifier('F.7', '⛔ la relecture n\'a émis aucune écriture', b.reseau.de('enregistrerScore').length === 1);
}

{
  /* ⭐ LE DÉLAI PUR : la requête PEND — ni réponse, ni erreur. C'est le cas le plus long de la
     journée d'un tournoi (réseau de stade saturé), et le plus dangereux si l'écran s'impatiente. */
  const b = banc();
  await ouvrir(b);
  const c = poserCarte(b);
  b.reseau.programmer((r) => (r.action === 'enregistrerScore' ? 'retenir' : { json: donneesSaisie() }));
  const envoi = suivre(Promise.all(b.dom.propager(c.bouton, 'click')));
  await patienter(60);
  verifier('F.8', 'requête en vol : UNE seule émission, le bouton fermé, et l\'envoi toujours en cours',
    b.reseau.de('enregistrerScore').length === 1 && c.bouton.disabled === true && envoi.fini === false);
  verifier('F.9', '⛔ aucune minuterie ne relance quoi que ce soit pendant l\'attente',
    b.reseau.requetes.filter((r) => r.action === 'enregistrerScore').length === 1);
  verifier('F.10', '⛔ et rien n\'est annoncé : ni « enregistré », ni « échoué »',
    c.msg.textContent === '' || (!/Score enregistré/.test(c.msg.textContent) &&
      !/on ne sait pas/.test(c.msg.textContent)), c.msg.textContent);
  /* ⭐ LE DÉLAI SE DÉNOUE EN PANNE : l'issue devient INCONNUE, et seulement à cet instant. */
  b.reseau.couper(0, 'Failed to fetch');
  await patienter(30);
  verifier('F.11', 'quand l\'attente se dénoue en panne, l\'issue devient INCONNUE — pas avant',
    /on ne sait pas si ce score a été enregistré/.test(c.msg.textContent) &&
    c.carte.classList.contains('match-inconnu') && b.reseau.de('enregistrerScore').length === 1,
    c.msg.textContent);
}

{
  /* ⭐ LE DÉLAI QUI SE DÉNOUE EN RÉUSSITE : la réponse arrive tard, et elle fait autorité. */
  const b = banc();
  await ouvrir(b);
  const c = poserCarte(b);
  b.reseau.programmer((r) => (r.action === 'enregistrerScore' ? 'retenir' : { json: donneesSaisie() }));
  const envoi = suivre(Promise.all(b.dom.propager(c.bouton, 'click')));
  await patienter(40);
  b.reseau.livrer(0, { ok: true, id_match: 'M1', match: { score_A: '3', score_B: '1', statut: 'terminé' },
    version_apres: 'v-tardive' });
  await patienter(25);
  verifier('F.12', 'une réponse TARDIVE reste autoritaire : elle est reprise, la carte se rouvre',
    b.lex('matchs')[0].version_lue === 'v-tardive' && /Score enregistré/.test(c.msg.textContent) &&
    c.carte.classList.contains('match-inconnu') === false && envoi.fini === true, c.msg.textContent);
}

titre('G — ERREURS CERTAINES : elles ne ferment pas la carte');
{
  const b = banc();
  await ouvrir(b);
  const c = poserCarte(b);
  b.reseau.programmer((r) => (r.action === 'enregistrerScore'
    ? { json: { error: 'Clé incorrecte ou non configurée.', acces_refuse: true } } : { json: donneesSaisie() }));
  await Promise.all(b.dom.propager(c.bouton, 'click'));
  await patienter(20);
  verifier('G.1', 'clé refusée : erreur CERTAINE — la carte reste utilisable, le bouton est rendu',
    c.bouton.disabled === false && c.carte.classList.contains('match-inconnu') === false &&
    /Clé scores refusée/.test(c.msg.textContent), c.msg.textContent);
  verifier('G.2', '⛔ et la clé refusée est effacée du stockage de session',
    b.ctx.sessionStorage.donnees.get('r92_cle_scores') === '');
  verifier('G.3', '⛔ rien n\'est renvoyé', b.reseau.de('enregistrerScore').length === 1);
}

titre('H — COMPATIBILITÉ : échec FERME, jamais de faux succès');
{
  /* ⭐ NOUVEAU FRONTEND, ANCIEN BACKEND : le socle déployé ne connaît pas `getSaisieScores`. */
  const b = banc();
  b.reseau.programmer(() => ({ json: { error: 'Action inconnue : getSaisieScores' } }));
  const vol = suivre(b.ctx.initSaisieProtegee());
  await taper(b, CLE_FACTICE, 'Se connecter');
  await patienter(15);
  const d = dialogue(b);
  verifier('H.1', 'un backend qui ne connaît pas l\'action : la panne est ANNONCÉE, jamais confondue avec un refus de clé',
    !!d && /Vérification de la clé impossible/.test(d.message) && /Action inconnue/.test(d.message),
    d && d.message);
  if (d) b.dom.propager(d.boutons.find((x) => x.textContent === 'Annuler') || d.boutons[1], 'click');
  await patienter(10);
  verifier('H.2', '⛔ aucun match n\'est affiché, aucune clé n\'est rangée : aucun faux succès',
    b.lex('matchs').length === 0 && (b.ctx.sessionStorage.donnees.get('r92_cle_scores') || '') === '' && vol.fini);
  const avant = b.reseau.requetes.length;
  const c = poserCarte(b);
  /* ⛔ ON N'ATTEND PAS : faute de clé rangée, la validation redemande la clé et s'arrête sur le
     dialogue. C'est précisément ce qu'on veut voir — elle ne part PAS écrire. */
  const tentative = suivre(Promise.all(b.dom.propager(c.bouton, 'click')));
  await patienter(20);
  verifier('H.3', '⭐ ET SURTOUT : sans lecture réussie, aucune ÉCRITURE ne peut partir avec la clé',
    b.reseau.requetes.slice(avant).every((r) => r.action !== 'enregistrerScore'),
    JSON.stringify(b.reseau.requetes.slice(avant).map((r) => r.action)));
  const dlgH = dialogue(b);
  if (dlgH) b.dom.propager(dlgH.boutons[dlgH.boutons.length - 1], 'click');
  await patienter(20);
  verifier('H.3b', '⛔ et après l\'annulation du dialogue, toujours aucune écriture partie',
    b.reseau.requetes.slice(avant).every((r) => r.action !== 'enregistrerScore') && tentative.fini !== undefined,
    JSON.stringify(b.reseau.requetes.slice(avant).map((r) => r.action)));
}

{
  /* ⭐ ANCIEN FRONTEND, NOUVEAU BACKEND : le corps d'AVANT n'a ni jeton, ni requete_id, ni version_lue.
     ⛔ On ne peut pas charger l'ancien `saisie.js` ici — il n'existe plus. On prouve donc le
     SYMÉTRIQUE, qui est ce qui compte : le corps que le frontend ACTUEL émet porte bien les trois
     champs, et le refus du backend pour un corps qui ne les porte pas est éprouvé côté serveur
     (`backend-raccordement-acces-scores`, contrôles A.12 et A.13). */
  const b = banc();
  await ouvrir(b);
  const c = poserCarte(b);
  b.reseau.programmer((r) => (r.action === 'enregistrerScore'
    ? { json: { ok: true, id_match: 'M1', match: { score_A: '3', score_B: '1' }, version_apres: 'v2' } }
    : { json: donneesSaisie() }));
  await Promise.all(b.dom.propager(c.bouton, 'click'));
  await patienter(20);
  const corps = b.reseau.de('enregistrerScore')[0].corps;
  verifier('H.4', 'le corps émis porte les TROIS champs qu\'un ancien frontend n\'avait pas',
    typeof corps.jeton === 'string' && corps.jeton.length === 64 &&
    typeof corps.requete_id === 'string' && corps.requete_id.length > 8 &&
    typeof corps.version_lue === 'string' && corps.version_lue !== '', corps);
}

{
  /* ⭐ ANCIENNE PAGE EN CACHE : le jeton qu'elle porte a été tourné. */
  const b = banc({ jeton: 'b'.repeat(64) });
  b.reseau.programmer(() => ({ json: REFUS_FERME }));
  const vol = suivre(b.ctx.initSaisieProtegee());
  await taper(b, CLE_FACTICE, 'Se connecter');
  await patienter(15);
  verifier('H.5', 'ancienne page en cache (jeton tourné) : refus NEUTRE, interface fermée, aucun faux succès',
    b.lex('saisieAccesFerme') === true && b.lex('matchs').length === 0 && vol.fini);
  verifier('H.6', '⛔ aucune clé n\'est rangée à partir d\'un accès fermé',
    (b.ctx.sessionStorage.donnees.get('r92_cle_scores') || '') === '');
}

titre('I — L\'AUTORITÉ EST AU SERVEUR : ni le DOM, ni les variables');
{
  const b = banc();
  await ouvrir(b);
  const c = poserCarte(b);
  /* On ment au DOM ET aux variables : le serveur, lui, dit autre chose. */
  c.sA.value = '99';
  b.lex('matchs')[0].version_lue = 'version-inventee-par-le-client';
  b.reseau.programmer((r) => (r.action === 'enregistrerScore'
    ? { json: { ok: true, id_match: 'M1', match: { score_A: '4', score_B: '4', statut: 'terminé' }, version_apres: 'v-serveur' } }
    : { json: donneesSaisie() }));
  await Promise.all(b.dom.propager(c.bouton, 'click'));
  await patienter(20);
  verifier('I.1', '⭐ le score retenu est celui que le SERVEUR renvoie, pas celui du champ',
    b.lex('matchs')[0].score_A === '4' && b.lex('matchs')[0].score_B === '4', b.lex('matchs')[0]);
  verifier('I.2', '⭐ la version retenue est celle du SERVEUR',
    b.lex('matchs')[0].version_lue === 'v-serveur');
  verifier('I.3', 'et la version inventée par le client a bien été ENVOYÉE comme précondition — ' +
    'c\'est au serveur de la refuser, jamais au client de se croire',
    b.reseau.de('enregistrerScore')[0].corps.version_lue === 'version-inventee-par-le-client');
}

titre('J — PLUSIEURS ONGLETS, PLUSIEURS TABLES : aucune contamination');
{
  const b1 = banc();
  const b2 = banc({ jeton: 'c'.repeat(64) });
  await ouvrir(b1);
  b2.reseau.programmer((r) => (r.action === 'getSaisieScores'
    ? { json: donneesSaisie({ scoreA: '5', scoreB: '5', statut: 'terminé', version: 'vB' }) } : { json: { ok: true } }));
  const vol2 = suivre(b2.ctx.initSaisieProtegee());
  await taper(b2, 'AUTRE-CLE-FACTICE-8A', 'Se connecter');
  await patienter(20);
  void vol2;
  verifier('J.1', 'deux onglets, deux jetons, deux clés : chacun garde le sien',
    b1.lex('saisieJeton') === JETON_FACTICE && b2.lex('saisieJeton') === 'c'.repeat(64) &&
    b1.ctx.sessionStorage.donnees.get('r92_cle_scores') === CLE_FACTICE &&
    b2.ctx.sessionStorage.donnees.get('r92_cle_scores') === 'AUTRE-CLE-FACTICE-8A');
  verifier('J.2', 'et deux états de match indépendants',
    b1.lex('matchs')[0].version_lue === 'v1' && b2.lex('matchs')[0].version_lue === 'vB');
  /* La fermeture de l'un ne ferme pas l'autre. */
  b1.ctx.fermerInterfaceSaisie();
  verifier('J.3', '⛔ fermer une table de marque n\'en ferme aucune autre',
    b1.lex('saisieAccesFerme') === true && b2.lex('saisieAccesFerme') === false);
}

titre('K — LE HTML RENDU PORTE BIEN LE CONTRAT DE VALIDATION');
{
  const b = banc();
  await ouvrir(b);
  const html = b.dom.document.getElementById('liste-matchs').innerHTML;
  verifier('K.1', 'le rendu porte `.match` avec `data-id`', /class="match[^"]*"[^>]*data-id="M1"/.test(html) ||
    /data-id="M1"/.test(html), html.slice(0, 200));
  verifier('K.2', 'deux champs `input.score`', (html.match(/class="r-input score"/g) || []).length === 2, html.slice(0, 400));
  verifier('K.3', 'un bouton `.bouton-valider` et une zone `.message-form`',
    /class="bouton bouton-valider"/.test(html) && /class="message-form"/.test(html));
  verifier('K.4', '⛔ et AUCUN accès à `localStorage` n\'a eu lieu pour produire ce rendu',
    b.accesStockage.every((a) => a.indexOf('localStorage') !== 0), JSON.stringify(b.accesStockage));
}

titre('Z — MUTANTS FRONTEND : la version correcte passe, la version mutée tombe');
{
  /** Un mutant : on remplace un fragment EXACT d'un module réel, puis on exige que le contrôle TOMBE. */
  async function mutant(num, nom, fichier, avant, apres, controle) {
    const source = lire(fichier);
    if (source.indexOf(avant) === -1) {
      verifier(num, 'mutant « ' + nom + ' » : fragment introuvable — ⛔ le mutant ne prouve rien', false, avant.slice(0, 90));
      return;
    }
    let tombe = false, detail = '';
    try {
      const b = banc({ mutations: { [fichier]: (s) => s.replace(avant, apres) } });
      tombe = !(await controle(b));
    } catch (e) { tombe = true; detail = String(e.message).slice(0, 110); }
    verifier(num, 'mutant « ' + nom + ' » : DÉTECTÉ' + (detail ? ' (par exception : ' + detail + ')' : ''), tombe);
  }

  /** Le contrôle « résultat inconnu » : message honnête, carte fermée, aucune réémission. */
  const CONTROLE_INCONNU = async (b) => {
    await ouvrir(b);
    const c = poserCarte(b);
    b.reseau.programmer((r) => (r.action === 'enregistrerScore' ? { rejet: 'Failed to fetch' } : { json: donneesSaisie() }));
    await Promise.all(b.dom.propager(c.bouton, 'click'));
    await patienter(25);
    return /on ne sait pas si ce score a été enregistré/.test(c.msg.textContent) &&
      c.bouton.disabled === true && b.reseau.de('enregistrerScore').length === 1;
  };
  verifier('Z.0', 'témoin — la version correcte traite bien le résultat inconnu', await CONTROLE_INCONNU(banc()));

  await mutant('Z.1', 'le résultat inconnu est transformé en ÉCHEC certain', 'js/saisie.js',
    '    issueInconnue = resultatEnvoiInconnu(err);',
    '    issueInconnue = false;', CONTROLE_INCONNU);
  await mutant('Z.2', 'toute erreur est réputée CERTAINE (la règle est inversée)', 'js/saisie.js',
    "  if (err.resultatCertain === true) return false;          // fabriquée ICI, après une réponse serveur",
    "  return false;", CONTROLE_INCONNU);
  await mutant('Z.3', 'la carte reste ouverte après un résultat inconnu (nouvelle intention permise)', 'js/saisie.js',
    '    if (!issueInconnue) bouton.disabled = false;',
    '    bouton.disabled = false;', CONTROLE_INCONNU);
  await mutant('Z.4', 'une panne de transport est marquée « certaine » par saisie-protegee', 'js/saisie-protegee.js',
    '    throw err;\n  }\n}',
    '    throw erreurCertaine(err.message);\n  }\n}', CONTROLE_INCONNU);

  /* ⛔ RÉÉMISSION AUTOMATIQUE : le mutant renvoie la mutation tout seul. */
  await mutant('Z.5', 'réémission automatique après un résultat inconnu', 'js/saisie-protegee.js',
    '  try {\n    return await apiPost(\'enregistrerScore\', corps);',
    '  try {\n    try { return await apiPost(\'enregistrerScore\', corps); }\n' +
    '    catch (premiere) { return await apiPost(\'enregistrerScore\', corps); }',
    async (b) => {
      await ouvrir(b);
      const c = poserCarte(b);
      b.reseau.programmer((r) => (r.action === 'enregistrerScore' ? { rejet: 'Failed to fetch' } : { json: donneesSaisie() }));
      await Promise.all(b.dom.propager(c.bouton, 'click'));
      await patienter(25);
      return b.reseau.de('enregistrerScore').length === 1;
    });

  /* ⛔ LE SUCCÈS ANNONCÉ AVANT LA RÉPONSE AUTORITAIRE. */
  const CONTROLE_AUTORITE = async (b) => {
    await ouvrir(b);
    const c = poserCarte(b);
    b.reseau.programmer((r) => (r.action === 'enregistrerScore'
      ? { json: { ok: true, id_match: 'M1', match: { score_A: '4', score_B: '4' }, version_apres: 'v-serveur' } }
      : { json: donneesSaisie() }));
    c.sA.value = '99';
    await Promise.all(b.dom.propager(c.bouton, 'click'));
    await patienter(20);
    return b.lex('matchs')[0].score_A === '4' && b.lex('matchs')[0].version_lue === 'v-serveur';
  };
  verifier('Z.6', 'témoin — l\'état serveur autoritaire est bien repris', await CONTROLE_AUTORITE(banc()));
  await mutant('Z.7', 'la réponse serveur est ignorée : l\'état local est pris pour autorité', 'js/saisie.js',
    '      m.score_A = res.match.score_A; m.score_B = res.match.score_B; m.statut = \'terminé\';',
    '      m.statut = \'terminé\';', CONTROLE_AUTORITE);
  await mutant('Z.8', 'la version rendue par le serveur est ignorée', 'js/saisie.js',
    '      if (res.version_apres) m.version_lue = res.version_apres;',
    '      if (false) m.version_lue = res.version_apres;', CONTROLE_AUTORITE);

  /* ⛔ LA PRÉCONDITION N'EST PLUS ENVOYÉE. */
  const CONTROLE_PRECONDITION = async (b) => {
    await ouvrir(b);
    const c = poserCarte(b);
    b.reseau.programmer((r) => (r.action === 'enregistrerScore'
      ? { json: { ok: true, id_match: 'M1', match: { score_A: '3', score_B: '1' }, version_apres: 'v2' } }
      : { json: donneesSaisie() }));
    await Promise.all(b.dom.propager(c.bouton, 'click'));
    await patienter(20);
    const corps = b.reseau.de('enregistrerScore')[0].corps;
    return corps.version_lue === 'v1' && /^tbl-/.test(String(corps.requete_id)) && corps.jeton === JETON_FACTICE;
  };
  verifier('Z.9', 'témoin — la précondition et l\'identifiant de demande partent bien', await CONTROLE_PRECONDITION(banc()));
  await mutant('Z.10', 'la `version_lue` n\'est plus envoyée (écriture à l\'aveugle)', 'js/saisie-protegee.js',
    "version_lue: (m && m.version_lue) || ''", "version_lue: ''", CONTROLE_PRECONDITION);
  await mutant('Z.11', 'un `requete_id` FIXE est réutilisé pour toutes les intentions', 'js/saisie-protegee.js',
    'requete_id: nouvelIdRequete()', "requete_id: 'tbl-toujours-le-meme'",
    async (b) => {
      await ouvrir(b);
      const c1 = poserCarte(b, { id: 'M1' });
      b.reseau.programmer((r) => (r.action === 'enregistrerScore'
        ? { json: { ok: true, id_match: 'M1', match: { score_A: '3', score_B: '1' }, version_apres: 'v2' } }
        : { json: donneesSaisie() }));
      await Promise.all(b.dom.propager(c1.bouton, 'click'));
      await patienter(15);
      b.ctx.deverrouiller(c1.carte);
      c1.sA.value = '8';
      await Promise.all(b.dom.propager(c1.bouton, 'click'));
      await patienter(15);
      const ids = b.reseau.de('enregistrerScore').map((r) => r.corps.requete_id);
      /* ⭐ DEUX INTENTIONS DIFFÉRENTES = DEUX identifiants. Un identifiant réutilisé pour un AUTRE
         contenu serait refusé par le serveur (REQUETE_ID_REUTILISE) : la correction serait perdue. */
      return ids.length === 2 && ids[0] !== ids[1];
    });

  /* ⛔ LE DOUBLE CLIC REDEVIENT DEUX MUTATIONS. */
  const CONTROLE_DOUBLE = async (b) => {
    await ouvrir(b);
    const c = poserCarte(b);
    b.reseau.programmer((r) => (r.action === 'enregistrerScore' ? 'retenir' : { json: donneesSaisie() }));
    b.dom.propager(c.bouton, 'click');
    b.dom.propager(c.bouton, 'click');
    await patienter(10);
    return b.reseau.de('enregistrerScore').length === 1;
  };
  verifier('Z.12', 'témoin — un double clic ne produit qu\'une émission', await CONTROLE_DOUBLE(banc()));
  await mutant('Z.13', 'le garde de double clic est retiré ET le bouton n\'est plus fermé', 'js/saisie.js',
    '  if (bouton.disabled) return;',
    '  if (false) return;\n  bouton.disabled = false;', CONTROLE_DOUBLE);

  /* ⛔ LE STOCKAGE PERSISTANT REVIENT. */
  const CONTROLE_STOCKAGE = async (b) => {
    await ouvrir(b);
    return b.accesStockage.every((a) => a.indexOf('localStorage') !== 0);
  };
  verifier('Z.14', 'témoin — aucun accès à `localStorage` dans le parcours', await CONTROLE_STOCKAGE(banc()));
  await mutant('Z.15', '`localStorage` est de nouveau consulté pour le filtre de catégorie', 'js/saisie.js',
    '  categorieActiveSaisie = (cats.indexOf(categorieActiveSaisie) >= 0) ? categorieActiveSaisie : (cats[0] || \'\');',
    '  const memo = localStorage.getItem(\'r92_saisie_cat\') || \'\';\n' +
    '  categorieActiveSaisie = (cats.indexOf(memo) >= 0) ? memo : (cats[0] || \'\');', CONTROLE_STOCKAGE);

  /* ⛔ UN FAUX SUCCÈS SUR UN ACCÈS FERMÉ. */
  const CONTROLE_FERME = async (b) => {
    await ouvrir(b);
    const c = poserCarte(b);
    b.reseau.programmer(() => ({ json: REFUS_FERME }));
    await Promise.all(b.dom.propager(c.bouton, 'click'));
    await patienter(20);
    return b.lex('saisieAccesFerme') === true && b.lex('saisieJeton') === '' && !/Score enregistré/.test(c.msg.textContent);
  };
  verifier('Z.16', 'témoin — un accès fermé ferme vraiment l\'interface', await CONTROLE_FERME(banc()));
  await mutant('Z.17', 'l\'accès fermé n\'est plus reconnu (la page continue de croire pouvoir écrire)',
    'js/saisie-protegee.js',
    '    if (rep.acces_ferme === true) { fermerInterfaceSaisie(); throw erreurCertaine(SAISIE_MESSAGE_FERME); }',
    '    if (false) { fermerInterfaceSaisie(); }', CONTROLE_FERME);
}

/* ══════════════════════════════════════════════════════════════════════════ */
console.log('\n' + '─'.repeat(72));
if (echecs.length) {
  console.log('ÉCHEC — ' + echecs.length + ' contrôle(s) en défaut sur ' + (reussis + echecs.length) + ' :');
  echecs.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('OK — ' + reussis + ' contrôles passés.');

})().catch((e) => { console.error('EXCEPTION DU BANC :', e); process.exit(1); });
