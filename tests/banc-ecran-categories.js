'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « CATÉGORIES » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par tests/ecran-categories-surface.test.js.
 *
 *  ⭐ Serveur : le VRAI backend (Code.gs du dépôt voisin, ou toute autre version), exécuté dans les doublures du banc de
 *     coût (backend/tests/banc-cout) sur le tournoi fictif, référentiel FFR de démonstration compris. Navigateur : les
 *     VRAIS modules de js/ chargés EN ENTIER (admin.js, admin-reglages.js, admin-choix-categories.js,
 *     admin-conformite-ffr.js, admin-tableau-bord.js, admin-autorisation.js) — ou ceux d'une autre version, pour les
 *     contre-épreuves et les mélanges de cache —, dans un contexte Node.
 *  ⭐ Les cartes sont rendues par le VRAI afficherCategories : un petit DOM lit ce balisage (formulaires et leurs champs
 *     nommés, groupes radio, listes et options, panneaux, focus et curseur, valeur « nettoyée » d'un nombre).
 *  ⭐ Transport RÉEL jusqu'au réseau : le vrai js/api.js (délais, relance unique d'une LECTURE de ses listes fermées après
 *     un 404 ou un délai dépassé, jamais d'une écriture) ; seul `fetch` est simulé. Chaque émission attend que le banc la
 *     serve — on distingue ce qu'un geste ATTEND de ce qui part en arrière-plan, et l'on compte ce qui part réellement vers
 *     le serveur, relances comprises. Pannes injectables par émission. Minuteries des modules accélérées ×1/1000 (un
 *     délai de 30 s dure 30 ms) ; les durées rapportées restent celles du modèle (30 s pour un délai dépassé).
 *  ⛔ Aucun réseau, aucun service Google réel. Hors périmètre (doublés et comptés) : écrans Terrains, Équipes, dossier.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const BACKEND = path.join(RACINE, '..', 'backend');
const { chargerBanc } = require(path.join(BACKEND, 'tests', 'banc-cout', 'instrumentation'));
const { peuplerDemo, peuplerReferentielFFR, CLE_ADMIN } = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-demo'));
const { fourchette } = require(path.join(BACKEND, 'tests', 'banc-cout', 'modele-cout'));

/* Références FIGÉES d'avant le lot « Catégories » (jamais HEAD : après un commit, HEAD serait le nouveau code). */
const FRONTEND_AVANT_REV = 'a8bb9fbed29e718a084015c11aa7c888ca7bad35';
const BACKEND_AVANT_REV = '96dada20276efbf007ec829d37cbbcb13a6d49ca';
const git = (depot, rev, fichier) => execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier], { encoding: 'utf8' });
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
const JS_AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, 'js/' + f);
const lecteurJs = (dossier) => (f) => fs.readFileSync(path.join(dossier || path.join(RACINE, 'js'), f), 'utf8');
/** Lecteur mêlant deux versions (cache du navigateur) : `avant` = fichiers servis dans leur version d'avant. */
const lecteurMele = (avant) => (f) => (avant.indexOf(f) !== -1 ? JS_AVANT(f) : lecteurJs()(f));

const tour = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function extrait(source, nom) {
  const debut = source.indexOf('function ' + nom + '(');
  if (debut === -1) throw new Error('fonction introuvable : ' + nom);
  const fin = source.indexOf('\n}', debut);
  return (source.slice(Math.max(0, debut - 6), debut) === 'async ' ? 'async ' : '') + source.slice(debut, fin + 2);
}

/* ============================================================== petit DOM */
const VIDES = { input: 1, br: 1, img: 1, hr: 1, meta: 1, link: 1 };
const CONTROLES = { input: 1, select: 1, textarea: 1 };
function decoder(t) { return String(t).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function nettoyer(type, v) {                  // ce que fait le navigateur d'une valeur posée dans le champ
  v = String(v == null ? '' : v);
  if (type === 'number') return /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v) ? v : '';
  return v;
}

function creerDocument() {
  const doc = { activeElement: null };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.tag = tag; this.attrs = {}; this.enfants = []; this.parentNode = null;
      this.texte = ''; this.dataset = {}; this.validity = { badInput: false, valid: true };
      this._valeur = null; this._coche = null; this._inactif = null; this._ouvert = null; this._selection = null; this.nodeType = 1;
    }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = v; }
    get name() { return this.attrs.name || ''; }
    get type() { return (this.attrs.type || (this.tag === 'button' ? 'submit' : this.tag === 'select' ? 'select-one' : 'text')).toLowerCase(); }
    get className() { return this.attrs.class || ''; }
    set className(v) { this.attrs.class = v; }
    get options() { return this.tag === 'select' ? this.querySelectorAll('option') : undefined; }
    get value() {
      if (this.tag === 'option') return 'value' in this.attrs ? decoder(this.attrs.value) : this.textContent;
      if (this.tag === 'select') {
        if (this._valeur !== null) return this._valeur;
        const opts = this.options;
        const choisie = opts.filter((o) => 'selected' in o.attrs).pop() || opts[0];
        return choisie ? choisie.value : '';
      }
      return this._valeur !== null ? this._valeur : nettoyer(this.type, decoder(this.attrs.value || ''));
    }
    set value(v) {
      if (this.tag === 'select') { this._valeur = this.options.some((o) => o.value === String(v)) ? String(v) : ''; return; }
      this._valeur = nettoyer(this.type, v); this.validity = { badInput: false, valid: true }; this._selection = null;
    }
    get checked() { return this._coche !== null ? this._coche : ('checked' in this.attrs); }
    set checked(v) {
      this._coche = !!v;
      if (v && this.type === 'radio') {                   // un seul bouton coché par groupe, comme un navigateur
        const f = this.closest('form');
        (f ? f.querySelectorAll('input') : []).forEach((r) => { if (r !== this && r.type === 'radio' && r.name === this.name) r._coche = false; });
      }
    }
    get disabled() {
      if (this._inactif !== null ? this._inactif : ('disabled' in this.attrs)) return true;
      const fs = this.closest && this.parentNode ? this.parentNode.closest('fieldset') : null;
      return !!(fs && fs.disabled && CONTROLES[this.tag]);
    }
    set disabled(v) { this._inactif = !!v; }
    get open() { return this._ouvert !== null ? this._ouvert : ('open' in this.attrs); }
    set open(v) { this._ouvert = !!v; }
    get hidden() { return 'hidden' in this.attrs; }
    set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
    get tabIndex() { return Number(this.attrs.tabindex || 0); }
    set tabIndex(v) { this.attrs.tabindex = String(v); }
    get selectionStart() { return this.tag === 'input' && this.type === 'text' ? (this._selection ? this._selection[0] : this.value.length) : null; }
    get selectionEnd() { return this.tag === 'input' && this.type === 'text' ? (this._selection ? this._selection[1] : this.value.length) : null; }
    setSelectionRange(a, b) { if (this.tag === 'input' && this.type === 'text') this._selection = [a, b]; else throw new Error('InvalidStateError'); }
    getAttribute(a) { return Object.prototype.hasOwnProperty.call(this.attrs, a) ? decoder(this.attrs[a]) : null; }
    setAttribute(a, v) { this.attrs[a] = String(v); }
    removeAttribute(a) { delete this.attrs[a]; }
    hasAttribute(a) { return Object.prototype.hasOwnProperty.call(this.attrs, a); }
    get classList() {
      const e = this; const liste = () => (e.attrs.class || '').split(/\s+/).filter(Boolean);
      return { contains: (c) => liste().indexOf(c) !== -1, add: (c) => { if (liste().indexOf(c) === -1) e.attrs.class = liste().concat(c).join(' '); },
        remove: (...cs) => { e.attrs.class = liste().filter((x) => cs.indexOf(x) === -1).join(' '); },
        toggle: (c, force) => { const a = force === undefined ? liste().indexOf(c) === -1 : !!force; if (a) e.classList.add(c); else e.classList.remove(c); return a; } };
    }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.racine; }
    get textContent() { return this.texte + this.enfants.map((e) => e.textContent).join(''); }
    set textContent(v) { this.enfants = []; this.texte = String(v); }
    get innerHTML() { return this._html || ''; }
    set innerHTML(html) {
      this._html = String(html); this.enfants.forEach((e) => { e.parentNode = null; }); this.enfants = []; this.texte = '';
      analyser(String(html), this); nommer();
      if (doc.activeElement && !doc.activeElement.isConnected) doc.activeElement = null;
    }
    get elements() { return this.querySelectorAll('input, select, textarea, button'); }
    appendChild(e) { e.parentNode = this; this.enfants.push(e); return e; }
    descendants() { const r = []; this.enfants.forEach((e) => { r.push(e); r.push(...e.descendants()); }); return r; }
    querySelectorAll(sel) { return this.descendants().filter((e) => e.tag && correspond(e, sel)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest(sel) { let n = this; while (n && n.tag) { if (correspond(n, sel)) return n; n = n.parentNode; } return null; }
    contains(e) { while (e) { if (e === this) return true; e = e.parentNode; } return false; }
    focus() { doc.activeElement = this; }
    blur() { if (doc.activeElement === this) doc.activeElement = null; }
    addEventListener() {}
  }
  function correspond(e, sel) {
    return sel.split(',').some((s) => {
      s = s.trim();
      const parties = s.split(/\s+(?![^[]*\])/);
      if (parties.length > 1) {
        if (!correspond(e, parties[parties.length - 1])) return false;
        let n = e.parentNode; const reste = parties.slice(0, -1).join(' ');
        while (n && n.tag) { if (correspond(n, reste)) return true; n = n.parentNode; }
        return false;
      }
      const m = /^([a-z0-9]*)((?:[#.][\w-]+|\[[^\]]+\]|:disabled|:checked)*)$/i.exec(s);
      if (!m) return false;
      if (m[1] && e.tag !== m[1].toLowerCase()) return false;
      const filtres = m[2].match(/[#.][\w-]+|\[[^\]]+\]|:disabled|:checked/g) || [];
      return filtres.every((f) => {
        if (f === ':disabled') return e.disabled;
        if (f === ':checked') return e.checked;                 // cases et boutons radio cochés, comme un navigateur
        if (f[0] === '#') return e.id === f.slice(1);
        if (f[0] === '.') return e.classList.contains(f.slice(1));
        // ⭐ La valeur peut être entre guillemets OU nue : `[role=status]` est un sélecteur valide, et
        //    ecrans.js l'écrit ainsi. Sans ce second cas, il ne correspondait à RIEN — un silence, pas une erreur.
        const a = /^\[([\w-]+)(?:=(?:"((?:[^"\\]|\\.)*)"|([^\]"]*)))?\]$/.exec(f);
        if (!a) return false;
        if (a[2] === undefined && a[3] === undefined) return e.hasAttribute(a[1]);
        const attendu = (a[2] === undefined ? a[3] : a[2]).replace(/\\(.)/g, '$1');
        if (a[1] === 'value' && CONTROLES[e.tag]) return e.getAttribute('value') === attendu;
        return e.getAttribute(a[1]) === attendu;
      });
    });
  }
  function analyser(html, parent) {
    const re = /<\/?([a-zA-Z0-9]+)((?:\s+[\w:-]+(?:="[^"]*"|='[^']*')?)*)\s*\/?>|([^<]+)/g;
    const pile = [parent];
    let m;
    while ((m = re.exec(html))) {
      const courant = pile[pile.length - 1];
      if (m[3] !== undefined) { const t = new Element('#texte'); t.tag = ''; t.texte = decoder(m[3]); courant.appendChild(t); continue; }
      const tag = m[1].toLowerCase();
      if (m[0][1] === '/') { while (pile.length > 1 && pile.pop().tag !== tag); continue; }
      const e = new Element(tag);
      (m[2].match(/[\w:-]+(?:="[^"]*"|='[^']*')?/g) || []).forEach((a) => {
        const i = a.indexOf('=');
        if (i === -1) e.attrs[a] = ''; else e.attrs[a.slice(0, i)] = a.slice(i + 2, -1);
      });
      courant.appendChild(e);
      if (!VIDES[tag] && !/\/>$/.test(m[0])) pile.push(e);
    }
  }
  /* form[name] → le champ (groupe radio : une liste dont `.value` est la valeur cochée), comme un navigateur. */
  function nommer() {
    doc.racine.querySelectorAll('form').forEach((f) => {
      (f.__noms || []).forEach((n) => { delete f[n]; });
      const groupes = {};
      f.querySelectorAll('input, select, textarea').forEach((c) => { if (c.name) (groupes[c.name] = groupes[c.name] || []).push(c); });
      f.__noms = Object.keys(groupes);
      f.__noms.forEach((n) => {
        const g = groupes[n];
        if (g[0].type === 'radio') {
          const liste = g.slice();
          Object.defineProperty(liste, 'value', { get() { const c = g.filter((r) => r.checked)[0]; return c ? c.value : ''; } });
          f[n] = liste;
        } else f[n] = g[0];
      });
    });
  }
  doc.racine = new Element('html');
  doc.Element = Element;
  doc.createElement = (tag) => new Element(tag);
  doc.getElementById = (id) => doc.racine.querySelector('#' + id);
  doc.querySelector = (s) => doc.racine.querySelector(s);
  doc.querySelectorAll = (s) => doc.racine.querySelectorAll(s);
  doc.addEventListener = () => {};
  doc.body = doc.racine.appendChild(new Element('body'));
  doc.nommer = nommer;
  return doc;
}

/* ============================================================== serveur (vrai Code.gs) */
function serveur(source) {
  const m = chargerBanc(source, peuplerDemo);
  peuplerReferentielFFR(m);
  m.contexte.Session = { getScriptTimeZone: () => 'Europe/Paris' };
  m.appeler('assurerColonneCategorie', m.classeur, 'nb_poules');     // classeur à jour de ses colonnes (démo)
  m.appeler('assurerColonnesConfig', m.classeur);
  m.categories = () => m.appeler('lireConfig', m.classeur).categories;
  m.cat = (nom) => m.categories().filter((c) => c.categorie === nom).pop();
  m.poserCategorie = (ligne) => m.appeler('enregistrerCategorie', m.classeur, Object.assign({}, m.cat(ligne.categorie) || {}, ligne));
  m.ajouterEquipe = (nom, cat) => m.appeler('ajouterEquipe', m.classeur, nom, cat, '', '');
  const cfg = m.appeler('lireConfig', m.classeur);
  const eq = m.appeler('lireOngletSimple', m.classeur, 'Equipes');
  m.appeler('ecrireParamGlobal', m.feuilles.get('Config'), 'signature_generation', m.appeler('signatureGeneration', cfg.global, cfg.categories, eq));
  m.appeler('ecrireParamGlobal', m.feuilles.get('Config'), 'signature_structure', m.appeler('signatureStructure', cfg.categories, eq));
  return m;
}

/* ============================================================== navigateur (vrais modules) */
const PAGE = '<div id="ecran-categories"><div id="zone-categories"></div></div><div id="zone-horaires"></div>' +
  '<form id="form-choix-categories"><fieldset id="choix-categories-champs">' +
  ['U6', 'U8', 'U10', 'U12', 'U14'].map((c) => '<label><input type="checkbox" name="categories" value="' + c + '"></label>').join('') +
  '</fieldset><button type="submit" id="bouton-valider-categories" hidden>Valider</button><div id="message-choix-categories"></div></form>' +
  '<div id="bloc-conformite-ffr"></div><div id="etat-avancement"></div><div id="etat-dossier"></div>' +
  '<span id="tb-categories"></span><span id="tb-equipes"></span><span id="tb-planning"></span><span id="tb-publication"></span>' +
  '<button id="bouton-recalculer-horaires" hidden></button><p id="aide-recalculer" hidden></p>';

function navigateur(srv, lireJs, options) {
  const o = options || {};
  const doc = creerDocument();
  const journal = [];
  const attente = [];
  const dialogues = [];
  const reponses = o.dialogues || [];                    // réponses scriptées aux confirmations (true par défaut)
  doc.body.innerHTML = PAGE;
  // Minuteries accélérées ×1/1000 ; le dernier délai LONG posé (celui d'une tentative d'api.js) est rattaché à l'émission
  // qui suit, pour rapporter sa durée réelle (30 s) quand la réponse ne vient pas à temps.
  let dernierDelaiLong = null;
  const minuterie = (fn, ms, ...args) => { if (Number(ms) >= 5000) dernierDelaiLong = Number(ms);
    return setTimeout(fn, Math.max(0, Math.round((Number(ms) || 0) / 1000)), ...args); };
  const enVol = new Set();                                  // émissions parties dont la promesse n'est pas dénouée
  const fetchSimule = (adresse, reglages) => new Promise((resolve, reject) => {
    const r = reglages || {};
    const u = new URL(adresse);
    const methode = r.method === 'POST' ? 'POST' : 'GET';
    const corps = methode === 'POST' ? JSON.parse(r.body) : Object.fromEntries([...u.searchParams].filter(([k]) => k !== '_'));
    if (r.signal && dernierDelaiLong && !r.signal.__delaiMs) r.signal.__delaiMs = dernierDelaiLong;
    dernierDelaiLong = null;
    const req = { methode, corps, opts: { delaiMs: r.signal ? r.signal.__delaiMs : undefined }, signal: r.signal };
    req.resolve = (v) => { enVol.delete(req); resolve(v); };
    req.reject = (e) => { enVol.delete(req); reject(e); };
    enVol.add(req);
    if (r.signal) r.signal.addEventListener('abort', () => req.reject(Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' })), { once: true });
    attente.push(req);
  });
  const reponseHttp = (status, donnees) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(donnees == null ? {} : donnees)) });
  const ctx = vm.createContext({
    console, URL, setTimeout: minuterie, clearTimeout, document: doc, window: {}, navigator: {}, performance, AbortController,
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: (k) => (k === 'r92_cle_admin' ? CLE_ADMIN : ''), setItem() {} },
    location: { href: '', hostname: '127.0.0.1', protocol: 'http:' },
    API_URL: 'http://127.0.0.1:9/exec', fetch: fetchSimule,
    dialogConfirmer: async (texte) => { dialogues.push(texte); const r = reponses.length ? reponses.shift() : true; return typeof r === 'function' ? r() : r; },
    dialogAlerter: async (texte) => { dialogues.push('ALERTE ' + texte); },
    dialogDemander: async () => null
  });
  const commun = fs.readFileSync(path.join(RACINE, 'js', 'commun.js'), 'utf8');
  vm.runInContext([extrait(commun, 'echapper'), extrait(commun, 'estTermine'), extrait(commun, 'avecBoutonOccupe'),
    extrait(commun, 'afficherMessage')].join('\n'), ctx);
  ctx.svgIcone = () => '';
  ['api.js', 'admin.js', 'admin-reglages.js', 'admin-choix-categories.js', 'admin-conformite-ffr.js', 'admin-tableau-bord.js',
    'admin-autorisation.js'].forEach((f) => vm.runInContext(lireJs(f), ctx, { filename: f }));
  const assistant = fs.readFileSync(path.join(RACINE, 'js', 'assistant.js'), 'utf8');
  vm.runInContext('const assistantPhotos = new WeakMap();\n' + ['assistantSerialiser', 'assistantMarquerPropre', 'assistantEstPropre',
    'assistantRephotographier', 'assistantNoterZoneInconnue'].map((n) => extrait(assistant, n)).join('\n') + '\n' +
    extrait(lireJs('admin-generation.js'), 'majBoutonRecalculer') + '\n' +
    extrait(lireJs('admin-invitations.js'), 'heurePlusMinutesEmail') + '\n' + extrait(lireJs('admin-invitations.js'), 'heureFinCommuniqueeAdmin') + '\n' +
    'let repartitionCalculee = null;\n' + extrait(lireJs('admin-terrains.js'), 'equipesParCategorie'), ctx);
  // Hors périmètre de l'écran : doublés et comptés.
  const appels = { injecterTerrains: 0, majDossier: 0, remplirSelectCategories: [], majInfosTournoi: 0 };
  Object.assign(ctx, {
    assistantMajVerrou() {}, majVerrouPublier() {}, estPublie: () => false, majInvitation() {}, majContactsSecurite() {}, majPerfsMotCleClub() {},
    majPublication() {}, majHeureAdmin() {}, afficherPlanning() {}, majApresMidi() {}, majFeuilleJour() {}, afficherEquipes() {},
    injecterTerrains() { appels.injecterTerrains++; }, majDossier() { appels.majDossier++; }, majInfosTournoi() { appels.majInfosTournoi++; },
    remplirSelectCategories(c) { appels.remplirSelectCategories.push((c || []).map((x) => x.categorie).join(',')); },
    prendreJetonEquipes: () => null, jetonEquipesValide: () => true, actualiserEtatClubsDepuisEquipes() {}
  });
  const global = (expr) => vm.runInContext(expr, ctx);

  function servir(req, attendue) {
    const entree = { methode: req.methode, action: req.corps.action, corps: req.corps, attendue, delaiMs: req.opts && req.opts.delaiMs };
    journal.push(entree);
    if (req.signal && req.signal.aborted) { entree.reseauMs = entree.delaiMs || 0; entree.panne = 'abandonnee'; return; }
    const panne = o.panne ? o.panne(entree, journal) : null;
    entree.panne = panne || null;
    entree.reseauMs = 0;                       // échec avant exécution : durée non modélisée (immédiat)
    if (panne === 'reseau-avant') return req.reject(new TypeError('Failed to fetch'));
    if (panne === 'http500-avant') return req.resolve(reponseHttp(500, {}));
    const servie = req.methode === 'POST' ? srv.postMesure(req.corps) : srv.getMesure(req.corps);
    entree.reponse = servie.reponse;
    const f = fourchette(servie.mesure);
    entree.estimeMs = f.centrale.total;
    entree.verrouMs = f.centrale.sousVerrou;
    // Temps pendant lequel la requête occupe le navigateur : sa durée estimée, ou tout le délai du client (api.js
    // abandonne au bout de `delaiMs`) quand la réponse ne vient pas à temps ('delai') ou ne vient jamais ('silence').
    entree.reseauMs = (panne === 'delai' || panne === 'silence') ? (entree.delaiMs || 30000) : entree.estimeMs;
    // Exécutée, mais la réponse n'arrive pas avant l'abandon du client (api.js, `delaiMs`) : c'est lui qui dénoue.
    if (panne === 'delai' || panne === 'silence') {
      if (!req.signal) return req.reject(Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' }));
      return;
    }
    if (panne === '404') return req.resolve(reponseHttp(404, {}));
    if (panne === 'reseau-apres') return req.reject(new TypeError('Failed to fetch'));
    const donnees = panne === 'partielle'
      ? { ok: true, contrat: entree.reponse.contrat, action: entree.reponse.action, modifies: entree.reponse.modifies }
      : panne === 'ancienne' ? { ok: true } : entree.reponse;
    return req.resolve(reponseHttp(200, donnees));
  }
  const pause = () => new Promise((r) => setTimeout(r, 1));

  /** Un geste : on sert une à une les requêtes qu'il ATTEND ; `pendant` s'exécute pendant la première attente ;
   *  `auRetour` au moment où le geste rend la main (bouton libéré), AVANT que les requêtes d'arrière-plan soient servies. */
  async function jouer(geste, pendant, auRetour) {
    const avant = journal.length;
    let fini = false;
    const p = Promise.resolve().then(geste).finally(() => { fini = true; });
    let pendantFait = !pendant;
    for (let garde = 0; garde < 4000 && !fini; garde++) {
      await tour();
      if (!fini && attente.length) {
        if (!pendantFait) { pendantFait = true; await pendant(); await tour(); }
        servir(attente.shift(), true);
      } else if (!fini) await pause();                    // minuteries (délai d'une émission sans réponse, rejeu…)
    }
    await p;
    await tour();
    const auMoment = auRetour ? await auRetour({ enAttente: attente.concat([...enVol]).map((r) => r.corps.action)
      .filter((x, i, t) => t.indexOf(x) === i) }) : null;
    // Arrière-plan : tout ce qui part après le retour — relances d'api.js et ce qu'une réponse relance comprises —,
    // jusqu'au calme (rien en attente, rien en vol, quelques millisecondes de minuteries sans émission).
    for (let garde = 0, calme = 0; garde < 4000 && calme < 20; garde++) {
      await tour();
      if (attente.length) { calme = 0; servir(attente.shift(), false); continue; }
      calme = enVol.size ? 0 : calme + 1;
      await pause();
    }
    const faites = journal.slice(avant);
    const attendues = faites.filter((r) => r.attendue);
    const fond = faites.filter((r) => !r.attendue);
    const retourMs = attendues.reduce((t, r) => t + (r.reseauMs || 0), 0);
    return {
      requetes: faites, attendues, fond, auRetour: auMoment,
      ecritures: faites.filter((r) => r.methode === 'POST' && !/^get/.test(r.action)),
      resume: faites.map((r) => (r.attendue ? '' : '↪') + r.action).join(' → '),
      attenteMs: attendues.reduce((t, r) => t + (r.estimeMs || 0), 0),
      // Retour à l'utilisateur : les requêtes attendues se suivent. Fin de toute activité réseau : l'arrière-plan part
      // APRÈS le retour (le contrôle FFR suit la réponse) ; ses requêtes sont comptées bout à bout (majorant).
      retourMs, finReseauMs: retourMs + fond.reduce((t, r) => t + (r.reseauMs || 0), 0),
      verrouMs: faites.reduce((t, r) => t + (r.verrouMs || 0), 0)
    };
  }

  const b = { ctx, srv, doc, journal, dialogues, appels, jouer, global };
  b.zone = () => doc.getElementById('zone-categories');
  b.form = (cat) => doc.querySelector('form.form-categorie[data-cat="' + cat + '"]');
  b.champ = (cat, nom) => { const f = b.form(cat); return f && f.querySelector('[name="' + nom + '"]'); };
  b.radio = (cat, nom, valeur) => b.form(cat).querySelector('[name="' + nom + '"][value="' + valeur + '"]');
  b.bouton = (cat) => b.form(cat).querySelector('button[type="submit"]');
  b.boutonSuppr = (cat) => b.form(cat).querySelector('.bouton-suppr-cat');
  b.message = (cat) => { const f = b.form(cat); const m = f && f.querySelector('[data-role="msg-cat"]'); return m ? m.textContent : null; };
  b.messageAjout = () => { const m = doc.querySelector('[data-role="msg-ajout-cat"]'); return m ? m.textContent : null; };
  b.onglets = () => doc.querySelectorAll('.cv-cat-onglet').map((x) => x.getAttribute('data-cat-onglet'));
  b.actif = () => { const x = doc.querySelector('.cv-cat-onglet.est-actif'); return x ? x.getAttribute('data-cat-onglet') : null; };
  b.config = () => global('configCourante');
  b.propre = (cat) => global('assistantEstPropre')(b.form(cat));
  /** Saisie comme au clavier : valeur posée, puis les événements `input` et `change` que le navigateur émet. */
  b.saisir = (cat, champs) => Object.keys(champs).forEach((nom) => {
    const v = champs[nom];
    const c = (b.form(cat).querySelector('[name="' + nom + '"]') || {}).type === 'radio' ? b.radio(cat, nom, v) : b.champ(cat, nom);
    if (c.type === 'radio') c.checked = true; else c.value = v;
    global('onReglagesInput')({ target: c });
    global('onReglagesChange')({ target: c });
  });
  b.illisible = (cat, nom) => { const c = b.champ(cat, nom); c._valeur = ''; c.validity = { badInput: true, valid: false }; };
  b.clic = (el) => global('onReglagesClick')({ target: el });
  b.onglet = (cat) => b.clic(doc.querySelector('.cv-cat-onglet[data-cat-onglet="' + cat + '"]'));
  b.soumettre = (form) => global('onReglagesSubmit')({ target: form, preventDefault() {} });
  b.enregistrer = (cat, auRetour) => jouer(() => (b.bouton(cat).disabled ? null : b.soumettre(b.form(cat))), null, auRetour);
  b.ajouter = (nom, auRetour) => { b.onglet(''); doc.querySelector('#form-ajout-categorie input[name="categorie"]').value = nom;
    return jouer(() => b.soumettre(doc.getElementById('form-ajout-categorie')), null, auRetour); };
  // Le clic délégué ne rend pas la promesse de la suppression : on l'attend ici (le routage du clic a son propre contrôle).
  b.supprimer = (cat, auRetour) => jouer(() => global('onSupprimerCategorie')(b.boutonSuppr(cat)), null, auRetour);
  b.charger = async () => {
    // Ouverture (hors mesure) : config, équipes et matchs chargés, écran rendu, référentiel et verdict FFR chargés.
    global('configCourante = ' + JSON.stringify(srv.postMesure({ action: 'getConfigAdmin', cle: CLE_ADMIN }).reponse.config));
    global('equipesCourantes = ' + JSON.stringify(srv.appeler('lireOngletSimple', srv.classeur, 'Equipes')));
    global('matchsCourants = ' + JSON.stringify(srv.appeler('lireOngletSimple', srv.classeur, 'Matchs')));
    global('injecterReglages(configCourante.global, configCourante.categories)');
    global('majChoixCategoriesTournoi()');
    await jouer(() => global('majConformiteFFR()'));
    global('majTableauBord()');
    journal.length = 0; dialogues.length = 0;
  };
  return b;
}

/** Un banc prêt : serveur (vrai Code.gs) + navigateur (modules de `js`), écran chargé. */
async function banc(options) {
  const o = options || {};
  const srv = serveur(o.backend || fs.readFileSync(path.join(BACKEND, 'Code.gs'), 'utf8'));
  if (o.monde) o.monde(srv);
  const b = navigateur(srv, o.js || lecteurJs(), o);
  await b.charger();
  return b;
}

function compteur() {
  let n = 0;
  return {
    vrai(v, m, preuve) {
      if (!v) { console.error('ÉCHEC — ' + m + (preuve === undefined ? '' : '\n  ' + String(JSON.stringify(preuve)).slice(0, 900))); process.exitCode = 1; return; }
      n++; console.log('  ✓ ' + m);
    },
    get n() { return n; }
  };
}

module.exports = { banc, serveur, navigateur, creerDocument, compteur, extrait, lecteurJs, lecteurMele, tour, git,
  BACKEND, RACINE, BACKEND_AVANT, JS_AVANT, FRONTEND_AVANT_REV, BACKEND_AVANT_REV, CLE_ADMIN };
