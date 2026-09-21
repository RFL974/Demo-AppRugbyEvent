'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « HORAIRES » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par tests/ecran-horaires-surface.test.js.
 *
 *  ⭐ Serveur : le VRAI backend (Code.gs du dépôt voisin, ou toute autre version), exécuté dans les doublures du
 *     banc de coût (backend/tests/banc-cout) sur le tournoi fictif. Navigateur : les VRAIS modules de js/ (ou ceux
 *     d'une autre version, pour les contre-épreuves et les mélanges de cache), dans un contexte Node.
 *  ⭐ La carte est rendue par le VRAI `afficherHoraires` : un petit DOM lit ce balisage (balises, attributs,
 *     champs nommés, panneaux, focus, valeur « nettoyée » d'un champ heure ou nombre comme le fait un navigateur).
 *  ⭐ Transport simulé : chaque requête attend que le banc la serve — on distingue ce qu'un geste ATTEND de ce qui
 *     part en arrière-plan, et l'on compte ce qui part réellement vers le serveur. Pannes injectables.
 *  ⛔ Aucun réseau, aucun service Google réel.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const BACKEND = path.join(RACINE, '..', 'backend');
const { chargerBanc } = require(path.join(BACKEND, 'tests', 'banc-cout', 'instrumentation'));
const { peuplerDemo, CLE_ADMIN } = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-demo'));
const { fourchette } = require(path.join(BACKEND, 'tests', 'banc-cout', 'modele-cout'));

/* Références FIGÉES d'avant le lot « Horaires » (jamais HEAD : après un commit, HEAD serait le nouveau code). */
const FRONTEND_AVANT_REV = '1201fcb60a7421fb2832b2b3c59a19bbe14602d4';
const BACKEND_AVANT_REV = '5fee61948c761dda65d124eba9a31f827838abf1';
const git = (depot, rev, fichier) => execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier], { encoding: 'utf8' });
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
const JS_AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, 'js/' + f);
const lecteurJs = (dossier) => (f) => fs.readFileSync(path.join(dossier || path.join(RACINE, 'js'), f), 'utf8');
/** Lecteur mêlant deux versions (cache du navigateur) : `avant` = fichiers servis dans leur version d'avant. */
const lecteurMele = (avant) => (f) => (avant.indexOf(f) !== -1 ? JS_AVANT(f) : lecteurJs()(f));

const tour = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function extrait(source, nom) {
  const debut = source.indexOf('function ' + nom + '(');
  if (debut === -1) throw new Error('fonction introuvable : ' + nom);
  const fin = source.indexOf('\n}', debut);
  return (source.slice(Math.max(0, debut - 6), debut) === 'async ' ? 'async ' : '') + source.slice(debut, fin + 2);
}

/* ============================================================== petit DOM (balisage de la carte) */
const VIDES = { input: 1, br: 1, img: 1, hr: 1, meta: 1, link: 1 };
function decoder(t) { return String(t).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function nettoyer(type, v) {                  // ce que fait le navigateur d'une valeur posée dans le champ
  v = String(v == null ? '' : v);
  if (type === 'time') return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '';
  if (type === 'number') return /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v) ? v : '';
  return v;
}

function creerDocument() {
  const doc = { activeElement: null, parDefaut: {} };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.tag = tag; this.attrs = {}; this.enfants = []; this.parentNode = null;
      this.texte = ''; this.dataset = {}; this.ecouteurs = {}; this.validity = { badInput: false };
      this._valeur = null; this._coche = null; this._inactif = null; this._ouvert = null;
    }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = v; }
    get name() { return this.attrs.name || ''; }
    get type() { return (this.attrs.type || (this.tag === 'button' ? 'submit' : 'text')).toLowerCase(); }
    get className() { return this.attrs.class || ''; }
    set className(v) { this.attrs.class = v; }
    get value() { return this._valeur !== null ? this._valeur : nettoyer(this.type, decoder(this.attrs.value || '')); }
    set value(v) { this._valeur = nettoyer(this.type, v); this.validity = { badInput: false }; }
    get checked() { return this._coche !== null ? this._coche : ('checked' in this.attrs); }
    set checked(v) { this._coche = !!v; }
    get disabled() { return this._inactif !== null ? this._inactif : ('disabled' in this.attrs); }
    set disabled(v) { this._inactif = !!v; }
    get open() { return this._ouvert !== null ? this._ouvert : ('open' in this.attrs); }
    set open(v) { this._ouvert = !!v; }
    get hidden() { return 'hidden' in this.attrs; }
    set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
    getAttribute(a) { return Object.prototype.hasOwnProperty.call(this.attrs, a) ? this.attrs[a] : null; }
    setAttribute(a, v) { this.attrs[a] = String(v); }
    removeAttribute(a) { delete this.attrs[a]; }
    hasAttribute(a) { return Object.prototype.hasOwnProperty.call(this.attrs, a); }
    get classList() {
      const e = this; const liste = () => (e.attrs.class || '').split(/\s+/).filter(Boolean);
      return { contains: (c) => liste().indexOf(c) !== -1, add: (c) => { if (liste().indexOf(c) === -1) e.attrs.class = liste().concat(c).join(' '); },
        remove: (c) => { e.attrs.class = liste().filter((x) => x !== c).join(' '); }, toggle() {} };
    }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.racine; }
    get textContent() { return this.texte + this.enfants.map((e) => e.textContent).join(''); }
    set textContent(v) { this.enfants = []; this.texte = String(v); }
    get innerHTML() { return this._html || ''; }
    set innerHTML(html) { this._html = String(html); this.enfants = []; this.texte = ''; analyser(String(html), this); nommer(this); }
    appendChild(e) { e.parentNode = this; this.enfants.push(e); return e; }
    descendants() { const r = []; this.enfants.forEach((e) => { r.push(e); r.push(...e.descendants()); }); return r; }
    querySelectorAll(sel) { return this.descendants().filter((e) => correspond(e, sel)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest(sel) { let n = this; while (n && n.tag) { if (correspond(n, sel)) return n; n = n.parentNode; } return null; }
    contains(e) { while (e) { if (e === this) return true; e = e.parentNode; } return false; }
    focus() { doc.activeElement = this; }
    blur() { if (doc.activeElement === this) doc.activeElement = null; }
    addEventListener(t, fn) { (this.ecouteurs[t] = this.ecouteurs[t] || []).push(fn); }
  }
  function correspond(e, sel) {
    return sel.split(',').some((s) => {
      s = s.trim();
      const parties = s.split(/\s+/);
      if (parties.length > 1) {
        if (!correspond(e, parties[parties.length - 1])) return false;
        let n = e.parentNode; const reste = parties.slice(0, -1).join(' ');
        while (n && n.tag) { if (correspond(n, reste)) return true; n = n.parentNode; }
        return false;
      }
      const m = /^([a-z0-9]*)((?:[#.][\w-]+|\[[^\]]+\])*)$/i.exec(s);
      if (!m) return false;
      if (m[1] && e.tag !== m[1].toLowerCase()) return false;
      const filtres = m[2].match(/[#.][\w-]+|\[[^\]]+\]/g) || [];
      return filtres.every((f) => {
        if (f[0] === '#') return e.id === f.slice(1);
        if (f[0] === '.') return e.classList.contains(f.slice(1));
        const a = /^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/.exec(f);
        return a && (a[2] === undefined ? e.hasAttribute(a[1]) : e.getAttribute(a[1]) === a[2]);
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
        if (i === -1) e.attrs[a] = ''; else e.attrs[a.slice(0, i)] = decoder(a.slice(i + 2, -1));
      });
      courant.appendChild(e);
      if (!VIDES[tag] && !/\/>$/.test(m[0])) pile.push(e);
    }
  }
  function nommer(racine) {                     // form[name] → le champ, comme un navigateur
    racine.querySelectorAll('form').forEach((f) => f.querySelectorAll('input, select, textarea').forEach((c) => { if (c.name) f[c.name] = c; }));
  }
  doc.racine = new Element('html');
  doc.Element = Element;
  doc.createElement = (tag) => new Element(tag);
  doc.getElementById = (id) => doc.racine.querySelector('#' + id);
  doc.querySelector = (s) => doc.racine.querySelector(s);
  doc.querySelectorAll = (s) => doc.racine.querySelectorAll(s);
  doc.addEventListener = () => {};
  doc.body = doc.racine.appendChild(new Element('body'));
  doc.body.id = 'corps';
  return doc;
}

/* ============================================================== serveur (vrai Code.gs) */
function serveur(source) {
  const m = chargerBanc(source, peuplerDemo);
  m.contexte.Session = { getScriptTimeZone: () => 'Europe/Paris' };
  m.global = () => m.appeler('lireConfig', m.classeur).global;
  m.poser = (nom, valeur) => m.appeler('ecrireParamGlobal', m.feuilles.get('Config'), nom, valeur);
  // Planning « généré » : signatures cohérentes avec l'état (comme après genererPoulesEtPlanning).
  const cfg = m.appeler('lireConfig', m.classeur);
  const eq = m.appeler('lireOngletSimple', m.classeur, 'Equipes');
  m.poser('signature_generation', m.appeler('signatureGeneration', cfg.global, cfg.categories, eq));
  m.poser('signature_structure', m.appeler('signatureStructure', cfg.categories, eq));
  return m;
}

/* ============================================================== navigateur (vrais modules) */
function navigateur(srv, lireJs, options) {
  const o = options || {};
  const doc = creerDocument();
  const journal = [];
  const attente = [];
  const messages = [];
  // Page : la carte Horaires, son écran, et les repères du tableau de bord qu'elle met à jour.
  doc.body.innerHTML = '<div id="ecran-horaires"><div id="zone-horaires"></div></div><div id="zone-categories"></div>' +
    '<div id="etat-avancement"></div><div id="etat-dossier"></div><span id="tb-categories"></span><span id="tb-equipes"></span>' +
    '<span id="tb-planning"></span><span id="tb-publication"></span>' +
    '<button id="bouton-recalculer-horaires" hidden></button><p id="aide-recalculer" hidden></p>';
  const transport = (methode, corps, opts) => new Promise((resolve, reject) => attente.push({ methode, corps, opts, resolve, reject }));
  const ctx = vm.createContext({
    console, URL, setTimeout, clearTimeout, document: doc, window: {},
    configCourante: { global: {}, categories: [] }, equipesCourantes: [], matchsCourants: [],
    DELAI_LECTURE_ADMIN_MS: 30000,
    apiPostProtege: (action, data, role, lib, opts) => transport('POST', Object.assign({}, data, { action, cle: CLE_ADMIN }), opts),
    apiPost: (action, data, opts) => transport('POST', Object.assign({}, data, { action }), opts),
    apiGet: (action, params, opts) => transport('GET', Object.assign({ action }, params || {}), opts),
    afficherCategories: () => '', verifierTerrainsBloc() {}, majFormesCategories() {}, injecterTerrains() {},
    remplirSelectCategories() {}, afficherPlanning() {}, majApresMidi() {}, majFeuilleJour() {}, majInfosTournoi() {},
    majContactsSecurite() {}, majInvitation() {}, majPerfsMotCleClub() {}, majPublication() {}, majHeureAdmin() {},
    estPublie: () => false, prendreJetonEquipes: () => null, jetonEquipesValide: () => true,
    versionCategoriesCourante: () => 1, assistantMarquerPropre: (z) => { ctx.__propres = (ctx.__propres || 0) + 1; ctx.__photo = z && z.id; },
    assistantRephotographier: () => { ctx.__rephotos = (ctx.__rephotos || 0) + 1; },
    majDossier: () => { ctx.__dossiers = (ctx.__dossiers || 0) + 1; }
  });
  const admin = lireJs('admin.js');
  const commun = fs.readFileSync(path.join(RACINE, 'js', 'commun.js'), 'utf8');
  const invitations = lireJs('admin-invitations.js');
  vm.runInContext([
    extrait(commun, 'echapper'), extrait(commun, 'estTermine'), extrait(commun, 'avecBoutonOccupe'),
    extrait(invitations, 'heurePlusMinutesEmail'), extrait(invitations, 'heureFinCommuniqueeAdmin'),
    extrait(admin, 'estPresente'), extrait(admin, 'ecrireAdmin'), extrait(admin, 'lireConfigAdmin'),
    extrait(admin, 'rechargerEtRendre'), extrait(admin, 'onReglagesChange'), extrait(admin, 'onReglagesSubmit'),
    extrait(lireJs('admin-generation.js'), 'majBoutonRecalculer'),
    lireJs('admin-tableau-bord.js'), lireJs('admin-autorisation.js'), lireJs('admin-reglages.js')
  ].join('\n'), ctx);
  ctx.afficherMessage = (e, texte, type) => { e.textContent = texte; e.className = 'message-form ' + type; messages.push({ texte, type }); };
  // Hors périmètre : la carte des catégories (même fonction d'injection) n'est pas rendue par ce banc.
  ctx.afficherCategories = () => '';
  ctx.verifierTerrainsBloc = () => {};
  ctx.majFormesCategories = () => {};

  function servir(req, attendue) {
    const entree = { methode: req.methode, action: req.corps.action, corps: req.corps, attendue, delaiMs: req.opts && req.opts.delaiMs };
    journal.push(entree);
    const panne = o.panne ? o.panne(entree, journal) : null;
    const rejeter = (e) => req.reject(e);
    if (panne === 'reseau-avant') return rejeter(Object.assign(new TypeError('Failed to fetch')));
    const servie = req.methode === 'POST' ? srv.postMesure(req.corps) : srv.getMesure(req.corps);
    entree.reponse = servie.reponse;
    const f = fourchette(servie.mesure);
    entree.estimeMs = f.centrale.total;
    entree.verrouMs = f.centrale.sousVerrou;
    if (panne === 'delai') return rejeter(Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' }));
    if (panne === '404') return rejeter(new Error('Le serveur a répondu avec une erreur (404).'));
    if (panne === 'reseau-apres') return rejeter(new TypeError('Failed to fetch'));
    const donnees = panne === 'partielle'
      ? { ok: true, contrat: entree.reponse.contrat, action: entree.reponse.action, modifies: entree.reponse.modifies }
      : panne === 'ancienne' ? { ok: true } : entree.reponse;
    if (donnees && donnees.error) { const e = new Error(donnees.error); e.reponse = donnees; return rejeter(e); }
    return req.resolve(donnees);
  }

  /** Un geste : on sert une à une les requêtes qu'il ATTEND ; `pendant` s'exécute pendant la première attente. */
  async function jouer(geste, pendant) {
    const avant = journal.length;
    let fini = false;
    const p = Promise.resolve().then(geste).finally(() => { fini = true; });
    let pendantFait = !pendant;
    for (let garde = 0; garde < 400 && !fini; garde++) {
      await tour();
      if (!fini && attente.length) {
        if (!pendantFait) { pendantFait = true; await pendant(); await tour(); }
        servir(attente.shift(), true);
      }
    }
    await p;
    while (attente.length) { servir(attente.shift(), false); await tour(); }
    await tour();
    const faites = journal.slice(avant);
    return {
      requetes: faites, attendues: faites.filter((r) => r.attendue), fond: faites.filter((r) => !r.attendue),
      ecritures: faites.filter((r) => r.methode === 'POST' && !/^get/.test(r.action)),
      resume: faites.map((r) => (r.attendue ? '' : '↪') + r.action).join(' → '),
      attenteMs: faites.filter((r) => r.attendue).reduce((t, r) => t + (r.estimeMs || 0), 0),
      verrouMs: faites.reduce((t, r) => t + (r.verrouMs || 0), 0)
    };
  }

  const b = { ctx, srv, doc, journal, messages, jouer };
  b.form = () => doc.getElementById('form-horaires');
  b.champ = (nom) => b.form()[nom];
  b.bouton = () => doc.querySelector('[form="form-horaires"]');
  b.message = () => doc.getElementById('message-horaires').textContent;
  /** Saisie d'un champ comme au clavier : valeur posée, puis l'événement `change` que le navigateur émet. */
  b.saisir = (champs) => Object.keys(champs).forEach((nom) => {
    const c = b.champ(nom);
    if (typeof champs[nom] === 'boolean') c.checked = champs[nom]; else c.value = champs[nom];
    ctx.onReglagesChange({ target: c });
  });
  b.illisible = (nom) => { const c = b.champ(nom); c._valeur = ''; c.validity = { badInput: true }; };
  b.soumettre = () => ctx.onReglagesSubmit({ target: b.form(), preventDefault() {} });
  b.cliquer = () => jouer(() => (b.bouton().disabled ? null : b.soumettre()));
  b.charger = async () => {
    // Ouverture (hors mesure) : config et matchs chargés, cartes rendues, tableau de bord à jour.
    ctx.configCourante = srv.postMesure({ action: 'getConfigAdmin', cle: CLE_ADMIN }).reponse.config;
    ctx.equipesCourantes = srv.appeler('lireOngletSimple', srv.classeur, 'Equipes');
    ctx.matchsCourants = srv.appeler('lireOngletSimple', srv.classeur, 'Matchs');
    ctx.injecterReglages(ctx.configCourante.global, ctx.configCourante.categories);
    ctx.majTableauBord();
    journal.length = 0; messages.length = 0;
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
