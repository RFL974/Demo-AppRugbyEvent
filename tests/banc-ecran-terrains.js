'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « TERRAINS » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par tests/ecran-terrains-surface.test.js
 *  et tests/ecran-terrains-zero-appel.test.js.
 *  ▶ node tests/banc-ecran-terrains.js --mesurer [--frontend avant|<dossier>] [--backend avant|<Code.gs>]
 *    imprime, geste par geste, les requêtes RÉELLES du vrai frontend (bloquantes, arrière-plan, total, retour,
 *    fin du réseau, appels et durée sous verrou).
 *
 *  ⭐ Références « avant » FIGÉES — celles qui closent le lot « Équipes », lues dans git, ⛔ jamais `HEAD` :
 *       frontend a476f425606f821a85117a786237b34e23e14cc8 · backend 9f770a5daf5fb09dd4053f27fff19f69960671d9.
 *  ⭐ Serveur : le VRAI Code.gs dans les doublures du banc de coût (backend/tests/banc-cout), sur le tournoi fictif
 *     (monde-demo.js : 5 catégories, 21 équipes, un plan de terrains déjà enregistré).
 *  ⭐ Navigateur : les VRAIS modules (api.js, commun.js, admin.js, admin-terrains.js, admin-reglages.js,
 *     admin-equipes.js, admin-tableau-bord.js, assistant.js) et les VRAIES cartes d'admin.html. La carte
 *     « Terrains & répartition » est construite par le VRAI `injecterTerrains()`, avec SES écouteurs délégués.
 *  ⭐ Transport RÉEL jusqu'au réseau : le vrai api.js ; seul `fetch` est simulé. Pannes injectables par émission.
 *     Minuteries ×1/1000. Les durées rapportées viennent du modèle de coût — ⚠️ ESTIMÉES, jamais mesurées chez Google.
 *  ⛔ Aucun réseau, aucun service Google réel. Ce que le mini-DOM ne peut pas prouver (géométrie SVG, glisser-déposer
 *     au pointeur, matrices `getScreenCTM`) est vérifié à part dans un vrai Chromium — voir le rapport du lot.
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
const { fourchette } = require(path.join(BACKEND, 'tests', 'banc-cout', 'modele-cout'));
const MD = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-demo'));

/* ⛔ Références FIGÉES (hashes complets) d'avant le lot « Terrains » — jamais HEAD, jamais un hash abrégé. */
const FRONTEND_AVANT_REV = 'a476f425606f821a85117a786237b34e23e14cc8';
const BACKEND_AVANT_REV = '9f770a5daf5fb09dd4053f27fff19f69960671d9';
const git = (depot, rev, fichier) => execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
const LECTEUR_AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, f);
const lecteur = (dossier) => (f) => fs.readFileSync(path.join(dossier || RACINE, f), 'utf8');
/** Cache du navigateur mêlant deux versions : `avant` = fichiers servis dans leur version figée d'avant. */
const lecteurMele = (avant, base) => (f) => (avant.indexOf(f) !== -1 ? LECTEUR_AVANT(f) : (base || lecteur())(f));

/* ============================================================== la page (vraies cartes d'admin.html) */
const SECTIONS = ['bloc-terrains', 'reglages', 'bloc-equipes', 'etat-avancement', 'bloc-generation'];
function page(html) {
  const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, '');
  return SECTIONS.map((id) => {
    const debut = sansCommentaires.search(new RegExp('<section[^>]*\\sid="' + id + '"'));
    if (debut === -1) return '';
    const fin = sansCommentaires.indexOf('</section>', debut);
    return sansCommentaires.slice(debut, fin + '</section>'.length);
  }).join('\n') + '<span id="tb-categories"></span><span id="tb-planning"></span><span id="tb-publication"></span>';
}

const MODULES = ['js/api.js', 'js/admin.js', 'js/admin-terrains.js', 'js/admin-invitations.js', 'js/admin-reglages.js', 'js/admin-equipes.js',
  'js/admin-tableau-bord.js', 'js/assistant.js'];

/* ============================================================== serveur (vrai Code.gs) */
function serveur(source) {
  const m = chargerBanc(source, MD.peuplerDemo);
  MD.peuplerReferentielFFR(m);
  m.contexte.Session = { getScriptTimeZone: () => 'Europe/Paris' };
  m.appeler('assurerColonneCategorie', m.classeur, 'nb_poules');
  m.appeler('assurerColonnesConfig', m.classeur);
  m.config = () => m.appeler('lireConfig', m.classeur);
  m.categories = () => m.config().categories;
  m.cat = (nom) => m.categories().filter((c) => c.categorie === nom).pop();
  m.global = () => m.config().global;
  m.equipes = () => m.appeler('lireOngletSimple', m.classeur, 'Equipes');
  return m;
}

/* ============================================================== les primitives DOM que l'écran utilise */
function completerDom(doc) {
  const P = doc.Element.prototype;
  if (P.__completeTerrains) return;
  P.__completeTerrains = true;
  const detacher = (e) => { if (e.parentNode) { const f = e.parentNode.enfants; const i = f.indexOf(e); if (i !== -1) f.splice(i, 1); e.parentNode = null; } };
  const inserer = (parent, noeud, index) => { detacher(noeud); noeud.parentNode = parent; parent.enfants.splice(index, 0, noeud); return noeud; };
  P.remove = function () { detacher(this); };
  P.append = function (...n) { n.forEach((x) => inserer(this, x, this.enfants.length)); };
  P.prepend = function (...n) { n.slice().reverse().forEach((x) => inserer(this, x, 0)); };
  P.before = function (...n) { const p = this.parentNode; n.forEach((x) => inserer(p, x, p.enfants.indexOf(this))); };
  P.after = function (...n) { const p = this.parentNode; n.slice().reverse().forEach((x) => inserer(p, x, p.enfants.indexOf(this) + 1)); };
  P.removeChild = function (e) { detacher(e); return e; };
  Object.defineProperty(P, 'children', { configurable: true, get() { return this.enfants.filter((e) => e.tag); } });
  P.insertAdjacentHTML = function (ou, html) {
    const porteur = doc.createElement('span');
    porteur.innerHTML = html;
    const noeuds = porteur.enfants.slice();
    if (ou === 'afterend') this.after(...noeuds);
    else if (ou === 'beforebegin') this.before(...noeuds);
    else if (ou === 'afterbegin') this.prepend(...noeuds);
    else this.append(...noeuds);
    doc.nommer();
  };
  doc.createElementNS = (ns, tag) => doc.createElement(tag);
  doc.elementFromPoint = () => null;
}

/* ============================================================== navigateur (vrais modules) */
function navigateur(srv, lire, options) {
  const o = options || {};
  const doc = BC.creerDocument();
  completerDom(doc);
  doc.Element.prototype.addEventListener = function (type, fn) { (this.__ecouteurs = this.__ecouteurs || []).push({ type, fn }); };
  doc.__ecouteurs = [];
  doc.addEventListener = function (type, fn) { doc.__ecouteurs.push({ type, fn }); };
  doc.removeEventListener = function (type, fn) { doc.__ecouteurs = doc.__ecouteurs.filter((x) => !(x.type === type && x.fn === fn)); };
  doc.Element.prototype.click = function () { return b.cliquer(this); };
  const journal = [];
  const attente = [];
  const dialogues = [];
  const reponses = o.dialogues || [];
  doc.body.innerHTML = page(lire('admin.html'));
  let dernierDelaiLong = null;
  const minuterie = (fn, ms, ...args) => { if (Number(ms) >= 5000) dernierDelaiLong = Number(ms);
    return setTimeout(fn, Math.max(0, Math.round((Number(ms) || 0) / 1000)), ...args); };
  const enVol = new Set();
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
  const reponseHttp = (status, donnees) => ({ ok: status >= 200 && status < 300, status,
    json: async () => JSON.parse(JSON.stringify(donnees == null ? {} : donnees)) });
  const lieu = { href: 'http://127.0.0.1:8137/admin.html', hostname: '127.0.0.1', protocol: 'http:', origin: 'http://127.0.0.1:8137' };
  const ctx = vm.createContext({
    console, URL, setTimeout: minuterie, clearTimeout, setInterval: () => 0, clearInterval,
    document: doc, window: { open() {}, location: lieu, CSS: { escape: (s) => String(s) } },
    navigator: {}, performance, AbortController, CSS: { escape: (x) => String(x).replace(/([^\w-])/g, '\\$1') },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: (k) => (k === 'r92_cle_admin' ? MD.CLE_ADMIN : ''), setItem() {}, removeItem() {} },
    location: lieu,
    API_URL: 'http://127.0.0.1:9/exec', SNAPSHOT_URL: '', fetch: fetchSimule, Blob: function () {},
    dialogConfirmer: async (texte) => { dialogues.push(texte); const r = reponses.length ? reponses.shift() : true; return typeof r === 'function' ? r() : r; },
    dialogAlerter: async (texte) => { dialogues.push('ALERTE ' + texte); },
    dialogDemander: async () => null
  });
  vm.runInContext(lire('js/commun.js'), ctx, { filename: 'js/commun.js' });
  const sources = {};
  MODULES.forEach((f) => { sources[f] = lire(f); vm.runInContext(sources[f], ctx, { filename: f }); });
  /* Hors périmètre de l'écran : doublés (publication, conformité FFR, génération, sponsors, dossier, écrans). */
  const doubles = { majVerrouPublier() {}, afficherPlanning() {}, majApresMidi() {}, majFeuilleJour() {},
    majConformiteFFR: async () => {}, planifierConformiteFFR() {}, ecransMajPastilles() {}, ecransEtats: () => null,
    ecransEstActif: () => false, ecransActiver() {}, majBoutonRecalculer() {}, majDossier() {}, majInvitation() {},
    majSurPlace() {}, majReponse() {}, majContactsSecurite() {}, afficherListeSponsors() {}, afficherBilanSponsors() {},
    injecterReglagesSponsors() {}, afficherSuiviClubs() {}, afficherClubsInvites() {}, majTableauBord() {} };
  Object.keys(doubles).forEach((n) => { if (vm.runInContext('typeof ' + n, ctx) === 'undefined') ctx[n] = doubles[n]; });
  const global = (expr) => vm.runInContext(expr, ctx);
  /* Les gestionnaires nommés par brancherEcouteursAdmin mais vivant hors des modules du banc sont doublés.
     ⛔ Jamais ceux qu'un module du banc déclare : un nom absent pour cause de mélange de versions doit lever. */
  const declares = new Set();
  Object.values(sources).concat([lire('js/commun.js')]).join('\n')
    .replace(/function\s+([A-Za-z0-9_$]+)\s*\(/g, (m, n) => { declares.add(n); return m; });
  const branchement = BC.extrait(sources['js/admin.js'], 'brancherEcouteursAdmin');
  (branchement.match(/\b(on[A-Z][A-Za-z0-9_$]*|maj[A-Z][A-Za-z0-9_$]*|brancher[A-Za-z]*|rafraichirAdmin|traiterFichier[A-Za-z]*|planifierConformiteFFR|rendreZoneAfficheAccessible|injecter[A-Za-z]*)\b/g) || [])
    .forEach((n) => { if (!declares.has(n) && global('typeof ' + n) === 'undefined') ctx[n] = function () {}; });

  const retenues = [];
  function servir(req, attendue) {
    const aLivrer = retenues.splice(0);
    const resultat = servirUne(req, attendue);
    aLivrer.forEach((livrer) => livrer());
    return resultat;
  }
  function servirUne(req, attendue) {
    const entree = { methode: req.methode, action: req.corps.action, corps: req.corps, attendue, delaiMs: req.opts && req.opts.delaiMs };
    journal.push(entree);
    if (req.signal && req.signal.aborted) { entree.reseauMs = entree.delaiMs || 0; entree.panne = 'abandonnee'; return; }
    const panne = o.panne ? o.panne(entree, journal) : null;
    entree.panne = panne || null;
    entree.reseauMs = 0;
    if (panne === 'reseau-avant') return req.reject(new TypeError('Failed to fetch'));
    if (/^http\d{3}-avant$/.test(panne || '')) return req.resolve(reponseHttp(Number(panne.slice(4, 7)), {}));
    if (panne === 'verrou-occupe') srv.verrouOccupe = true;
    if (typeof o.avantServir === 'function') o.avantServir(entree, srv);
    const servie = req.methode === 'POST' ? srv.postMesure(req.corps) : srv.getMesure(req.corps);
    srv.verrouOccupe = false;
    entree.reponse = servie.reponse;
    const f = fourchette(servie.mesure);
    entree.estimeMs = f.centrale.total;
    entree.verrouMs = f.centrale.sousVerrou;
    entree.appelsVerrou = servie.mesure.appels.filter((a) => a.sousVerrou).length;
    entree.appels = servie.mesure.appels.length;
    entree.reseauMs = (panne === 'delai' || panne === 'silence') ? (entree.delaiMs || 30000) : entree.estimeMs;
    if (panne === 'delai' || panne === 'silence') {
      if (!req.signal) { entree.pendante = true; return; }
      return;
    }
    if (/^http\d{3}-apres$/.test(panne || '')) return req.resolve(reponseHttp(Number(panne.slice(4, 7)), {}));
    if (panne === 'reseau-apres') return req.reject(new TypeError('Failed to fetch'));
    if (panne === 'retarder') { const r = entree.reponse; retenues.push(() => req.resolve(reponseHttp(200, r))); return undefined; }
    /* `sans-config` : la réponse d'un backend d'avant le lot (sans la configuration relue). */
    const sansConfig = () => { const r = Object.assign({}, entree.reponse); delete r.config; delete r.enregistre; return r; };
    const donnees = panne === 'partielle'
      ? { ok: true, contrat: entree.reponse.contrat, action: entree.reponse.action, modifies: entree.reponse.modifies }
      : panne === 'ancienne' ? { ok: true } : panne === 'sans-config' ? sansConfig() : entree.reponse;
    return req.resolve(reponseHttp(200, donnees));
  }
  const pause = () => new Promise((r) => setTimeout(r, 1));

  async function jouer(geste, pendant, auRetour) {
    const avant = journal.length;
    let fini = false;
    const p = Promise.resolve().then(geste).finally(() => { fini = true; });
    let n = 0;
    for (let garde = 0; garde < 6000 && !fini; garde++) {
      await BC.tour();
      if (!fini && attente.length) {
        if (pendant) { await pendant(n, attente[0]); await BC.tour(); }
        n++;
        servir(attente.shift(), true);
      } else if (!fini) await pause();
    }
    const bloque = !fini;
    if (!bloque) await p;
    await BC.tour();
    const auMoment = auRetour ? await auRetour({ enAttente: attente.concat([...enVol]).map((r) => r.corps.action) }) : null;
    for (let garde = 0, calme = 0; garde < 6000 && calme < 20; garde++) {
      await BC.tour();
      if (attente.length) { calme = 0; servir(attente.shift(), false); continue; }
      calme = [...enVol].some((r) => !r.pendante) ? 0 : calme + 1;
      await pause();
    }
    const faites = journal.slice(avant);
    const attendues = faites.filter((r) => r.attendue);
    const fond = faites.filter((r) => !r.attendue);
    const retourMs = attendues.reduce((t, r) => t + (r.reseauMs || 0), 0);
    return {
      requetes: faites, attendues, fond, auRetour: auMoment, bloque,
      ecritures: faites.filter((r) => r.methode === 'POST' && !/^(get|lister)/.test(r.action)),
      resume: faites.map((r) => (r.attendue ? '' : '↪') + r.action + (r.panne ? '[' + r.panne + ']' : '')).join(' → '),
      retourMs, finReseauMs: retourMs + fond.reduce((t, r) => t + (r.reseauMs || 0), 0),
      verrouMs: faites.reduce((t, r) => t + (r.verrouMs || 0), 0),
      appelsVerrou: faites.reduce((t, r) => t + (r.appelsVerrou || 0), 0),
      appels: faites.reduce((t, r) => t + (r.appels || 0), 0)
    };
  }

  const b = { ctx, srv, doc, journal, dialogues, jouer, global, lire };
  b.declencher = (el, type, extra) => {
    const ev = Object.assign({ type, target: el, preventDefault() { ev.defaultPrevented = true; }, stopPropagation() { ev.arrete = true; } }, extra || {});
    const retours = [];
    for (let n = el; n && !ev.arrete; n = n.parentNode) (n.__ecouteurs || []).filter((x) => x.type === type).forEach((x) => retours.push(x.fn.call(n, ev)));
    if (!ev.arrete && doc.__ecouteurs) doc.__ecouteurs.filter((x) => x.type === type).forEach((x) => retours.push(x.fn.call(doc, ev)));
    return Promise.all(retours.map((r) => Promise.resolve(r)));
  };
  /* ⭐ Un contrôle DÉSACTIVÉ ne reçoit pas le clic, comme dans un navigateur : sans cette garde, le banc
     verrait passer un second clic qu'aucun utilisateur ne peut donner. */
  b.cliquer = (el) => (el && el.disabled ? Promise.resolve([]) : b.declencher(el, 'click'));
  b.id = (x) => doc.getElementById(x);
  b.texte = (x) => { const e = doc.getElementById(x); return e ? e.textContent : null; };
  b.charger = async () => {
    global('configCourante = ' + JSON.stringify(srv.config()));
    global('equipesCourantes = ' + JSON.stringify(srv.equipes()));
    global('matchsCourants = []');
    global('definirAdminConnecte(true)');
    global('injecterReglages(configCourante.global, configCourante.categories)');
    global('injecterTerrains()');
    try { global('brancherEcouteursAdmin()'); b.erreurBranchement = null; } catch (e) { b.erreurBranchement = e.message; }
    journal.length = 0; dialogues.length = 0;
  };
  return b;
}

/** Un banc prêt : serveur (vrai Code.gs) + navigateur (fichiers du frontend), écran « Terrains » peint. */
async function banc(options) {
  const o = options || {};
  const srv = serveur(o.backend || fs.readFileSync(path.join(BACKEND, 'Code.gs'), 'utf8'));
  const getScriptLock = srv.contexte.LockService.getScriptLock;
  srv.contexte.LockService.getScriptLock = function () {
    const v = getScriptLock.call(this);
    return Object.assign(Object.create(v), { tryLock(ms) { if (srv.verrouOccupe) return false; return v.tryLock(ms); },
      releaseLock() { return v.releaseLock(); }, hasLock() { return v.hasLock ? v.hasLock() : false; } });
  };
  const b = navigateur(srv, o.lire || lecteur(), o);
  await b.charger();

  /* ------------------------------------------------------------------ lecture de l'écran */
  b.zone = () => b.id('zone-terrains');
  b.fiches = () => b.doc.querySelectorAll('#liste-terrains-physiques .terrain-ligne');
  b.fiche = (i) => b.fiches()[i] || null;
  b.detail = (i) => { const f = b.fiche(i); return f ? f.parentNode : null; };
  b.noms = () => b.fiches().map((r) => r.querySelector('.tp-nom').value);
  b.codes = () => b.fiches().map((r) => r.querySelector('.tp-code').value);
  b.capacite = () => b.doc.querySelectorAll('#tableau-capacite tbody tr').map((tr) => tr.querySelectorAll('td').map((td) => td.textContent.trim()));
  b.enTetesCapacite = () => b.doc.querySelectorAll('#tableau-capacite thead th').map((th) => th.textContent.trim());
  b.auSol = (cat) => { const e = b.doc.querySelector('[data-role="ausol-' + cat + '"]'); return e ? e.textContent : null; };
  b.messageTerrains = () => b.texte('message-terrains');
  b.messageRepartition = () => b.texte('message-repartition');
  b.boutonEnregistrer = () => b.id('bouton-enregistrer-terrains');
  b.boutonRepartir = () => b.id('bouton-repartir');
  b.boutonValider = () => b.id('bouton-valider-placement');
  b.boutonAppliquer = () => b.id('bouton-appliquer-repartition');
  b.tuiles = () => b.doc.querySelectorAll('#repartition-carte g[data-tuile]').map((g) => g.getAttribute('data-tuile'));
  b.pastilles = () => b.doc.querySelectorAll('#repart-tray .repart-chip').map((c) => c.textContent.trim());
  b.focus = () => { const a = b.doc.activeElement; return a ? (a.id || a.getAttribute('class') || a.tag) : null; };
  b.propre = () => b.global('assistantEstPropre(document.getElementById("zone-terrains"))');
  b.planServeur = () => { const g = b.srv.global(); return { terrains_physiques: g.terrains_physiques,
    couloir_terrain_m: g.couloir_terrain_m, dimensions_categories: g.dimensions_categories,
    tm_longueur_m: g.tm_longueur_m, tm_largeur_m: g.tm_largeur_m,
    repartition_grands_terrains: g.repartition_grands_terrains }; };
  b.terrainsCategories = () => { const o2 = {}; b.srv.categories().forEach((c) => { o2[c.categorie] = c.terrains; }); return o2; };

  /* ------------------------------------------------------------------ gestes LOCAUX (aucune requête attendue) */
  b.saisir = (i, classe, valeur) => b.jouer(() => {
    const champ = b.fiche(i).querySelector('.' + classe);
    champ.focus(); champ.value = valeur;
    return b.declencher(champ, 'input');
  });
  b.frapper = (i, classe, texte) => b.jouer(async () => {
    const champ = b.fiche(i).querySelector('.' + classe);
    champ.focus(); champ.value = '';
    for (const c of String(texte)) { champ.value += c; await b.declencher(champ, 'input'); }
  });
  b.choisir = (i, classe, valeur) => b.jouer(() => {
    const champ = b.fiche(i).querySelector('.' + classe);
    champ.focus(); champ.value = valeur;
    return b.declencher(champ, 'change');
  });
  b.reglerCouloir = (valeur) => b.jouer(() => {
    const champ = b.id('couloir-terrain'); champ.focus(); champ.value = String(valeur);
    return b.declencher(champ, 'input');
  });
  b.reglerDimension = (cat, classe, valeur) => b.jouer(() => {
    const champ = b.doc.querySelector('.dim-ligne[data-cat="' + cat + '"] .' + classe);
    champ.focus(); champ.value = String(valeur);
    return b.declencher(champ, 'input');
  });
  b.cocherPlein = (cat) => b.jouer(() => {
    const c = b.doc.querySelector('.dim-ligne[data-cat="' + cat + '"] .dim-plein');
    c.focus(); c.checked = !c.checked;
    return b.declencher(c, 'change');
  });
  b.ajouterTerrain = () => b.jouer(() => b.cliquer(b.id('bouton-ajouter-terrain')));
  b.supprimerTerrain = (i) => b.jouer(() => b.cliquer(b.fiche(i).querySelector('.terr-suppr')));
  b.repartir = () => b.jouer(() => b.cliquer(b.boutonRepartir()));
  b.valider = () => b.jouer(() => b.cliquer(b.boutonValider()));
  b.retirerTuile = (id) => b.jouer(() => {
    const g = b.doc.querySelectorAll('#repartition-carte g[data-tuile]').filter((x) => x.getAttribute('data-tuile') === id)[0];
    return g ? b.cliquer(g) : null;
  });
  /** Un mini-terrain d'une catégorie NON « terrain entier » : seule une telle pastille porte le bouton ⟳.
   *  ⛔ Lu dans le PLAN, pas dans le texte du dessin : depuis que chaque tuile porte un nom accessible,
   *  le texte du groupe contient de toute façon « · ». */
  b.tuileNonPleine = () => {
    const plan = JSON.parse(b.global('JSON.stringify((repartitionCalculee||{}).fieldsPlan||[])'));
    for (const fp of plan) {
      if (fp.mode === 'plein') continue;
      for (const z of (fp.zones || [])) { if ((z.tiles || []).length) return String(z.tiles[0].id); }
    }
    return null;
  };
  b.pivoterPastille = (i) => b.jouer(() => b.cliquer(b.doc.querySelector('.repart-chip-pivot[data-pivot="' + i + '"]')));

  /* ------------------------------------------------------------------ LE PLAN AU CLAVIER */
  /** Envoie une touche sur un élément, comme un navigateur : il prend le focus, puis l'événement remonte. */
  b.touche = (el, key, extra) => b.jouer(() => {
    if (!el) return null;
    el.focus();
    return b.declencher(el, 'keydown', Object.assign({ key: key, shiftKey: false }, extra || {}));
  });
  b.tuileEl = (id) => b.doc.querySelectorAll('#repartition-carte g[data-tuile]')
    .filter((g) => g.getAttribute('data-tuile') === String(id))[0] || null;
  b.chipEl = (i) => b.doc.querySelectorAll('#repart-tray .repart-chip')[i || 0] || null;
  b.chips = () => b.doc.querySelectorAll('#repart-tray .repart-chip');
  b.annonce = () => { const e = b.id('repart-annonce'); return e ? e.textContent : null; };
  b.nomTuile = (id) => { const g = b.tuileEl(id); return g ? g.getAttribute('aria-label') : null; };
  b.nomChip = (i) => { const c = b.chipEl(i); return c ? c.getAttribute('aria-label') : null; };
  /** L'état d'un mini-terrain posé, tel que le plan le porte ({x,y,w,h,id}) ou null. */
  b.tuilePlan = (id) => JSON.parse(b.global(
    'JSON.stringify((trouverTuilePosee(' + JSON.stringify(String(id)) + ')||{}).tuile || null)'));

  /* ------------------------------------------------------------------ ÉCRITURES */
  b.enregistrer = (pendant, auRetour) => b.jouer(() => b.cliquer(b.boutonEnregistrer()), pendant, auRetour);
  b.enregistrerDeuxFois = () => b.jouer(() => {
    const bouton = b.boutonEnregistrer();
    return Promise.all([b.cliquer(bouton), b.cliquer(bouton)]);
  });
  b.appliquer = (pendant, auRetour) => b.jouer(() => b.cliquer(b.boutonAppliquer()), pendant, auRetour);
  b.appliquerDeuxFois = () => b.jouer(() => {
    const bouton = b.boutonAppliquer();
    return Promise.all([b.cliquer(bouton), b.cliquer(bouton)]);
  });
  /** Le parcours complet « Répartir → Valider → Appliquer », les deux premiers étant locaux. */
  b.parcoursRepartition = async () => { await b.repartir(); await b.valider(); };
  return b;
}

/* ============================================================== mesure (campagne) */
const s = (ms) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';

/** Les gestes de l'écran, joués dans l'ordre sur un banc neuf. Chaque entrée : [nom, fonction]. */
const GESTES = [
  ['frapper le nom d\'un grand terrain (14 frappes)', (b) => b.frapper(0, 'tp-nom', 'Terrain Municipal')],
  ['frapper la longueur d\'un terrain', (b) => b.frapper(0, 'tp-l', '110')],
  ['changer le sport (menu)', (b) => b.choisir(0, 'tp-type', 'foot')],
  ['changer la surface (menu)', (b) => b.choisir(0, 'tp-nature', 'Synthétique')],
  ['frapper le code court', (b) => b.frapper(0, 'tp-code', 'MUN')],
  ['frapper l\'orientation', (b) => b.frapper(0, 'tp-rot', '35')],
  ['régler le couloir de circulation', (b) => b.reglerCouloir(5)],
  ['régler une cote de catégorie (U10)', (b) => b.reglerDimension('U10', 'dim-l', 45)],
  ['régler l\'en-but d\'une catégorie (U10)', (b) => b.reglerDimension('U10', 'dim-enbut', 5)],
  ['cocher « terrain entier » (U14)', (b) => b.cocherPlein('U14')],
  ['ajouter un grand terrain', (b) => b.ajouterTerrain()],
  ['supprimer un grand terrain', (b) => b.supprimerTerrain(1)],
  ['« Répartir les terrains »', (b) => b.repartir()],
  ['mettre un mini-terrain de côté', async (b) => { await b.repartir(); return b.retirerTuile(b.tuileNonPleine()); }],
  ['pivoter une pastille mise de côté', async (b) => { await b.repartir(); await b.retirerTuile(b.tuileNonPleine()); return b.pivoterPastille(0); }],
  ['« Valider le placement »', async (b) => { await b.repartir(); return b.valider(); }],
  ['« Enregistrer les terrains »', (b) => b.enregistrer()],
  ['« Enregistrer les terrains » deux fois (double clic)', (b) => b.enregistrerDeuxFois()],
  ['« Appliquer aux catégories »', async (b) => { await b.parcoursRepartition(); return b.appliquer(); }],
  ['« Appliquer » deux fois (double clic)', async (b) => { await b.parcoursRepartition(); return b.appliquerDeuxFois(); }]
];

async function mesurer(options) {
  const o = options || {};
  const lignes = [];
  for (const [nom, geste] of GESTES) {
    const b = await banc({ backend: o.backend, lire: o.lire });
    const r = await geste(b);
    lignes.push([nom, r]);
  }
  return lignes;
}

if (require.main === module && process.argv.indexOf('--mesurer') !== -1) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf('--' + n); return i === -1 ? null : args[i + 1]; };
  const fRef = opt('frontend'), bRef = opt('backend');
  const lire = fRef === 'avant' ? LECTEUR_AVANT : fRef ? lecteur(path.resolve(fRef)) : lecteur();
  const backend = bRef === 'avant' ? BACKEND_AVANT() : bRef ? fs.readFileSync(path.resolve(bRef), 'utf8') : undefined;
  mesurer({ lire, backend }).then((lignes) => {
    console.log('Frontend : ' + (fRef || 'arbre de travail') + ' — Backend : ' + (bRef || 'arbre de travail') + '\n');
    console.log('| Geste | bloquantes | arrière-plan | total | retour | fin du réseau | appels sous verrou | verrou | suite |');
    console.log('|---|---|---|---|---|---|---|---|---|');
    lignes.forEach(([nom, r]) => {
      console.log('| ' + nom + ' | ' + r.attendues.length + ' | ' + r.fond.length + ' | ' + r.requetes.length + ' | ' +
        (r.bloque ? '⛔ jamais' : s(r.retourMs)) + ' | ' + (r.bloque ? '⛔ jamais' : s(r.finReseauMs)) + ' | ' +
        r.appelsVerrou + ' | ' + s(r.verrouMs) + ' | ' + (r.resume || '—') + ' |');
    });
  }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { banc, serveur, navigateur, page, mesurer, GESTES, lecteur, lecteurMele, LECTEUR_AVANT, BACKEND_AVANT,
  FRONTEND_AVANT_REV, BACKEND_AVANT_REV, RACINE, BACKEND, git, fourchette, MD, completerDom };
