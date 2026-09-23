'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « DEMANDE D'AUTORISATION » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par tests/ecran-autorisation-surface.test.js
 *  et tests/ecran-autorisation-zero-appel.test.js.
 *  ▶ node tests/banc-ecran-autorisation.js --mesurer [--frontend avant|<dossier>] [--backend avant|<Code.gs>]
 *    imprime, geste par geste, les requêtes RÉELLES du vrai frontend (bloquantes, arrière-plan, total, retour,
 *    fin du réseau, appels et durée sous verrou).
 *
 *  ⭐ Références « avant » FIGÉES — celles qui closent le lot « Poules & planning », lues dans git, ⛔ jamais `HEAD` :
 *       frontend d9cbce38f6b4b3bcbb51ad58b55d396d82b35513 · backend c4128557b5bfa4c938e7c3296e523da47ae75f02.
 *  ⭐ Serveur : le VRAI Code.gs dans les doublures du banc de coût (backend/tests/banc-cout), sur le tournoi fictif
 *     (monde-demo.js : 5 catégories, 21 équipes, 10 clubs, référentiel FFR de démonstration).
 *  ⭐ Navigateur : les VRAIS modules (api.js, commun.js, admin.js, admin-autorisation.js) et la VRAIE carte
 *     `#bloc-autorisation` d'admin.html, avec SES écouteurs délégués. L'ouverture de l'écran passe par le VRAI
 *     `ouvrirEtapeAdmin('autorisation')` — le point de passage unique des deux parcours (barre latérale et mobile).
 *  ⭐ Transport RÉEL jusqu'au réseau : le vrai api.js ; seul `fetch` est simulé. Pannes injectables par émission.
 *     Minuteries ×1/1000. Les durées rapportées viennent du modèle de coût — ⚠️ ESTIMÉES, jamais mesurées chez Google.
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
const { fourchette } = require(path.join(BACKEND, 'tests', 'banc-cout', 'modele-cout'));
const MD = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-demo'));

/* ⛔ Références FIGÉES (hashes complets) d'avant le lot « Demande d'autorisation » — jamais HEAD, jamais abrégé. */
const FRONTEND_AVANT_REV = 'd9cbce38f6b4b3bcbb51ad58b55d396d82b35513';
const BACKEND_AVANT_REV = 'c4128557b5bfa4c938e7c3296e523da47ae75f02';
const git = (depot, rev, fichier) => execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
const LECTEUR_AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, f);
const lecteur = (dossier) => (f) => fs.readFileSync(path.join(dossier || RACINE, f), 'utf8');
/** Cache du navigateur mêlant deux versions : `avant` = fichiers servis dans leur version figée d'avant. */
const lecteurMele = (avant, base) => (f) => (avant.indexOf(f) !== -1 ? LECTEUR_AVANT(f) : (base || lecteur())(f));

/* ============================================================== la page (vraie carte d'admin.html) */
/* ⚠️ `bloc-clubs-invites` est là pour une raison PRÉCISE, et il ne fait pas partie de cet écran :
   `chargerClubsInvites` refuse de lire quand sa zone d'affichage est absente de la page. Sans cette
   carte, la requête `listerClubsInvites` que l'étape réclamait à l'arrivée ne partirait JAMAIS dans
   le banc — et la mesure « avant » afficherait 1 requête au lieu de 2, effaçant le gain à prouver. */
const SECTIONS = ['bloc-clubs-invites', 'bloc-autorisation'];
function page(html) {
  const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, '');
  const cartes = SECTIONS.map((id) => {
    const debut = sansCommentaires.search(new RegExp('<section[^>]*\\sid="' + id + '"'));
    if (debut === -1) throw new Error('carte introuvable dans admin.html : ' + id);
    const fin = sansCommentaires.indexOf('</section>', debut);
    return sansCommentaires.slice(debut, fin + '</section>'.length);
  }).join('\n');
  /* L'écran du mode « barre latérale » : `autorisationEstAffichee` le consulte pour savoir si la feuille
     est sous les yeux de l'organisateur. On le pose autour de la carte, comme le fait ecrans.js. */
  /* La carte des clubs vit sur l'écran « Inviter un club » : elle est hors de `#ecran-autorisation`,
     exactement comme dans la page — sans quoi `autorisationEstAffichee` se tromperait d'écran. */
  const debutAut = cartes.indexOf('<section');
  const coupe = cartes.indexOf('<section', debutAut + 1);
  return cartes.slice(0, coupe) + '<div id="ecran-autorisation">' + cartes.slice(coupe) + '</div>';
}

/* ⚠️ `admin-invitations.js` EST chargé, et ce n'est pas du décor : c'est lui qui porte le VRAI
   `chargerClubsInvites`, donc la requête `listerClubsInvites` que l'étape réclamait à l'arrivée.
   ⛔ Le doubler ferait disparaître du banc exactement la requête que ce lot supprime — le banc
   « prouverait » alors un gain qu'il n'aurait pas mesuré. */
const MODULES = ['js/api.js', 'js/admin.js', 'js/admin-invitations.js', 'js/admin-autorisation.js'];

/* ============================================================== serveur (vrai Code.gs) */
function serveur(source) {
  const m = chargerBanc(source, (mo) => { MD.peuplerDemo(mo); MD.peuplerReferentielFFR(mo); });
  m.contexte.Session = { getScriptTimeZone: () => 'Europe/Paris' };
  m.config = () => m.appeler('lireConfig', m.classeur);
  m.global = () => m.config().global;
  m.equipes = () => m.appeler('lireOngletSimple', m.classeur, 'Equipes');
  m.matchs = () => m.appeler('lireOngletSimple', m.classeur, 'Matchs');
  m.clubs = () => m.appeler('clubsEditionActive', m.classeur);
  /* Le nombre de CELLULES de `Config` réellement posées depuis le début — la preuve « on ne réécrit
     pas ce qui n'a pas changé ». ⚠️ On compte les POSES (`setValues`, par où passe aussi `setValue`)
     et les INSERTIONS de ligne : une ligne créée pour un paramètre vide est, elle aussi, une écriture
     qu'il faut voir. ⛔ Pas `setNumberFormat` : il accompagne une pose, il n'en est pas une. */
  m.cellulesEcrites = () => m.ecritures.filter((e) => e.cible === 'Config' &&
    ['setValues', 'insertRowsBefore', 'appendRow', 'deleteRow'].indexOf(e.op) !== -1).length;
  return m;
}

/* ============================================================== les primitives DOM que l'écran utilise */
function completerDom(doc) {
  const P = doc.Element.prototype;
  if (P.__completeAutorisation) return;
  P.__completeAutorisation = true;
  P.removeChild = function (e) { const i = this.enfants.indexOf(e); if (i !== -1) this.enfants.splice(i, 1); e.parentNode = null; return e; };
  doc.createElementNS = (ns, tag) => doc.createElement(tag);
}

/* ============================================================== navigateur (vrais modules) */
function navigateur(srv, lire, options) {
  const o = options || {};
  const doc = BC.creerDocument();
  completerDom(doc);
  doc.Element.prototype.addEventListener = function (type, fn) { (this.__ecouteurs = this.__ecouteurs || []).push({ type, fn }); };
  doc.__ecouteurs = [];
  doc.addEventListener = function (type, fn) { doc.__ecouteurs.push({ type, fn }); };
  doc.Element.prototype.click = function () { return b.cliquer(this); };
  const journal = [];
  const attente = [];
  const dialogues = [];
  const fichiers = [];                                   // téléchargements produits par l'écran
  doc.body.innerHTML = page(lire('admin.html'));
  let dernierDelaiLong = null;
  const minuterie = (fn, ms, ...args) => { if (Number(ms) >= 5000) dernierDelaiLong = Number(ms);
    return setTimeout(fn, Math.max(0, Math.round((Number(ms) || 0) / 1000)), ...args); };
  const enVol = new Set();
  const reponseHttp = (status, donnees) => ({ ok: status >= 200 && status < 300, status,
    json: async () => JSON.parse(JSON.stringify(donnees == null ? {} : donnees)) });
  const fetchSimule = (adresse, reglages) => {
    /* ⭐ Le GABARIT PDF est un fichier du dépôt servi par le site lui-même : ce n'est PAS une requête
       serveur, et le banc ne doit surtout pas la compter comme telle — sinon « Télécharger le PDF »
       passerait pour un geste qui parle au backend. */
    if (String(adresse).indexOf('modeles/') === 0) {
      const octets = fs.readFileSync(path.join(RACINE, String(adresse)));
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: async () => octets });
    }
    return new Promise((resolve, reject) => {
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
  };
  const lieu = { href: 'http://127.0.0.1:8137/admin.html', hostname: '127.0.0.1', protocol: 'http:', origin: 'http://127.0.0.1:8137' };
  let imprime = 0;
  const ctx = vm.createContext({
    console, URL: Object.assign(function (a) { return new (require('url').URL)(a); }, { createObjectURL: () => 'blob:x', revokeObjectURL() {} }),
    setTimeout: minuterie, clearTimeout, setInterval: () => 0, clearInterval,
    document: doc, window: { open() {}, location: lieu, print() { imprime++; }, CSS: { escape: (s) => String(s) } },
    navigator: {}, performance, AbortController, CSS: { escape: (x) => String(x).replace(/([^\w-])/g, '\\$1') },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: (k) => (k === 'r92_cle_admin' ? MD.CLE_ADMIN : ''), setItem() {}, removeItem() {} },
    location: lieu, API_URL: 'http://127.0.0.1:9/exec', SNAPSHOT_URL: '', fetch: fetchSimule,
    Blob: function (parties) { this.parties = parties; },
    PDFLib: require(path.join(RACINE, 'js/vendor/pdf-lib.min.js')),
    dialogConfirmer: async (texte) => { dialogues.push(texte); return true; },
    dialogAlerter: async (texte) => { dialogues.push('ALERTE ' + texte); },
    dialogDemander: async () => null
  });
  ctx.window.URL = ctx.URL;
  vm.runInContext(lire('js/commun.js'), ctx, { filename: 'js/commun.js' });
  const sources = {};
  MODULES.forEach((f) => { sources[f] = lire(f); vm.runInContext(sources[f], ctx, { filename: f }); });
  /* `assistantSerialiser` : l'outil de photo du formulaire, emprunté à assistant.js — il porte la
     protection « ne pas effacer une saisie en cours ». Sans lui, cette protection ne peut pas être
     éprouvée (elle répond « oui » dans le doute et conserverait tout). */
  vm.runInContext('const assistantPhotos = new WeakMap();\n' +
    ['assistantSerialiser', 'assistantMarquerPropre', 'assistantEstPropre']
      .map((n) => BC.extrait(lire('js/assistant.js'), n)).join('\n'), ctx);
  /* Hors périmètre de l'écran : doublés. ⛔ Jamais un nom qu'un module du banc déclare. */
  const doubles = { chargerClubsInvites: () => Promise.resolve(true), afficherClubsInvites() {},
    afficherSuiviClubs() {}, majApercuDossier() {}, lireFichesSponsors: () => Promise.resolve(true),
    lireRelevesSponsors: () => Promise.resolve(true), injecterReglagesSponsors() {},
    afficherListeSponsors() {}, afficherBilanSponsors() {}, invaliderLecturesCategories() {},
    estAccepte: (s) => String(s == null ? '' : s).trim().toLowerCase() === 'accepté',
    svgIcone: () => '', injecterIcones() {} };
  Object.keys(doubles).forEach((n) => { if (vm.runInContext('typeof ' + n, ctx) === 'undefined') ctx[n] = doubles[n]; });
  const global = (expr) => vm.runInContext(expr, ctx);

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
    entree.lectures = servie.mesure.appels.filter((a) => a.famille === 'lecture').length;
    // ⭐ LE VOLUME, pas seulement le nombre d'appels : une lecture de `Config` entier et une lecture
    //   d'une cellule sont deux « lectures » et deux coûts très différents.
    entree.cellules = servie.mesure.appels.reduce((t, a) => t + (a.famille === 'lecture' ? (a.cellules || 0) : 0), 0);
    entree.reseauMs = (panne === 'delai' || panne === 'silence') ? (entree.delaiMs || 30000) : entree.estimeMs;
    if (panne === 'delai' || panne === 'silence') {
      if (!req.signal) { entree.pendante = true; return; }
      return;
    }
    if (/^http\d{3}-apres$/.test(panne || '')) return req.resolve(reponseHttp(Number(panne.slice(4, 7)), {}));
    if (panne === 'reseau-apres') return req.reject(new TypeError('Failed to fetch'));
    if (panne === 'retarder') { const r = entree.reponse; retenues.push(() => req.resolve(reponseHttp(200, r))); return undefined; }
    /* `ancienne` : ce qu'un backend d'AVANT ce lot répondrait — `{ ok: true }` nu pour l'écriture,
       et une lecture sans `comptes` ni `config`. C'est le repli que la compatibilité doit couvrir. */
    const ancienne = () => {
      if (entree.action === 'enregistrerDossierAutorisation') return { ok: true };
      const r = Object.assign({}, entree.reponse);
      delete r.comptes; delete r.config;
      return r;
    };
    const donnees = panne === 'ancienne' ? ancienne() : entree.reponse;
    return req.resolve(reponseHttp(200, donnees));
  }
  const pause = () => new Promise((r) => setTimeout(r, 1));

  /** Un geste : on sert une à une les requêtes qu'il ATTEND ; `pendant` s'exécute avant chaque service ;
   *  `auRetour` au moment où le geste rend la main, AVANT que l'arrière-plan soit servi. */
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
      appels: faites.reduce((t, r) => t + (r.appels || 0), 0),
      lectures: faites.reduce((t, r) => t + (r.lectures || 0), 0),
      cellules: faites.reduce((t, r) => t + (r.cellules || 0), 0)
    };
  }

  const b = { ctx, srv, doc, journal, dialogues, fichiers, jouer, global, lire };
  b.declencher = (el, type, extra) => {
    const ev = Object.assign({ type, target: el, preventDefault() { ev.defaultPrevented = true; }, stopPropagation() { ev.arrete = true; } }, extra || {});
    const retours = [];
    for (let n = el; n && !ev.arrete; n = n.parentNode) (n.__ecouteurs || []).filter((x) => x.type === type).forEach((x) => retours.push(x.fn.call(n, ev)));
    if (!ev.arrete && doc.__ecouteurs) doc.__ecouteurs.filter((x) => x.type === type).forEach((x) => retours.push(x.fn.call(doc, ev)));
    return Promise.all(retours.map((r) => Promise.resolve(r)));
  };
  b.cliquer = (el) => (el && el.disabled ? Promise.resolve([]) : b.declencher(el, 'click'));
  b.id = (x) => doc.getElementById(x);
  b.texte = (x) => { const e = doc.getElementById(x); return e ? e.textContent : null; };
  b.imprimes = () => imprime;
  /* Le téléchargement : `telechargerFichierAutorisation` fabrique un <a> et le clique. On compte. */
  doc.body.appendChild = doc.body.appendChild || function () {};
  b.charger = async () => {
    // Ouverture de l'administration (hors mesure) : config, équipes et matchs chargés, clé acceptée.
    global('configCourante = ' + JSON.stringify(srv.config()));
    global('equipesCourantes = ' + JSON.stringify(srv.equipes()));
    global('matchsCourants = ' + JSON.stringify(srv.matchs()));
    global('clubsInvitesCourants = []');
    global('definirAdminConnecte(true)');
    // Les écouteurs délégués de la carte, posés par son propre DOMContentLoaded.
    (doc.__ecouteurs || []).filter((x) => x.type === 'DOMContentLoaded').forEach((x) => x.fn({ type: 'DOMContentLoaded' }));
    journal.length = 0; dialogues.length = 0;
  };
  return b;
}

/** Un banc prêt : serveur (vrai Code.gs) + navigateur (fichiers du frontend), écran PAS ENCORE ouvert. */
async function banc(options) {
  const o = options || {};
  const srv = serveur(o.backend || fs.readFileSync(path.join(BACKEND, 'Code.gs'), 'utf8'));
  const getScriptLock = srv.contexte.LockService.getScriptLock;
  srv.contexte.LockService.getScriptLock = function () {
    const v = getScriptLock.call(this);
    return Object.assign(Object.create(v), { tryLock(ms) { if (srv.verrouOccupe) return false; return v.tryLock(ms); },
      releaseLock() { return v.releaseLock(); }, hasLock() { return v.hasLock ? v.hasLock() : false; } });
  };
  /* ⭐ `muter` — une SUBSTITUTION de texte appliquée aux modules chargés. C'est le support des mutants
     FRONTEND : on réintroduit un défaut dans le vrai fichier, puis on exige qu'un contrôle le rattrape.
     ⛔ Elle ÉCHOUE BRUYAMMENT si le motif est introuvable : un mutant qui ne s'applique pas donnerait
     un test vert sans rien prouver. */
  const lireBase = o.lire || lecteur();
  const lire = o.muter
    ? (f) => {
      const source = lireBase(f);
      if (f !== o.muter.fichier) return source;
      if (source.indexOf(o.muter.avant) === -1) {
        throw new Error('mutant NON APPLIQUÉ (motif introuvable dans ' + f + ') : ' + o.muter.avant.slice(0, 60));
      }
      return source.replace(o.muter.avant, o.muter.apres);
    }
    : lireBase;
  const b = navigateur(srv, lire, o);
  await b.charger();

  /* ------------------------------------------------------------------ lecture de l'écran */
  b.zoneSaisie = () => b.id('autorisation-saisie');
  b.zoneFeuille = () => b.id('autorisation-feuille');
  b.form = () => b.id('form-autorisation');
  b.champ = (nom) => { const f = b.form(); return f ? f.querySelector('[name="' + nom + '"]') : null; };
  b.champs = () => { const f = b.form(); return f ? f.querySelectorAll('[name]').map((e) => e.name) : []; };
  b.feuille = () => { const z = b.zoneFeuille(); return z ? z.innerHTML : ''; };
  b.lignesFeuille = () => b.doc.querySelectorAll('#feuille-report tr')
    .map((tr) => tr.querySelectorAll('th,td').map((c) => c.textContent.trim()));
  b.valeurFeuille = (libelle) => { const l = b.lignesFeuille().filter((x) => x[0] === libelle).pop(); return l ? l[1] : null; };
  b.message = () => b.texte('autorisation-message');
  b.boutonEnregistrer = () => b.id('bouton-enregistrer-autorisation');
  b.boutonPdf = () => b.id('bouton-pdf-autorisation');
  b.boutonImprimer = () => b.id('bouton-imprimer-autorisation');
  b.boutonReessayer = () => b.id('bouton-reessayer-autorisation');
  b.focus = () => { const a = b.doc.activeElement; return a ? (a.name || a.id || a.tag) : null; };

  /* ------------------------------------------------------------------ gestes */
  /** L'ARRIVÉE sur l'écran — par le point de passage unique des deux parcours. */
  b.ouvrir = (pendant) => b.jouer(() => b.global('ouvrirEtapeAdmin("autorisation")'), pendant);
  /** Un aller-retour : on quitte l'écran puis on y revient (le registre garde sa mémoire). */
  b.revenir = () => b.jouer(() => b.global('ouvrirEtapeAdmin("autorisation")'));
  b.saisir = (nom, valeur) => { const c = b.champ(nom); c.focus(); c.value = valeur;
    return b.declencher(c, 'change'); };
  /* ⚠️ Le clic DÉLÉGUÉ ne rend pas la promesse de l'enregistrement (`onEnregistrerAutorisation()` est
     appelée sans `return`, comme dans la page) : mesurer le clic ferait passer TOUTE l'attente pour
     de l'arrière-plan. On appelle donc le gestionnaire et on l'attend — c'est bien ce que
     l'organisateur attend, bouton grisé. ⭐ `b.cliquerEnregistrer` reste là pour éprouver le
     routage du clic lui-même (double clic, bouton désactivé). */
  b.enregistrer = (pendant, auRetour) => b.jouer(() => b.global('onEnregistrerAutorisation()'), pendant, auRetour);
  b.cliquerEnregistrer = (pendant, auRetour) => b.jouer(() => b.cliquer(b.boutonEnregistrer()), pendant, auRetour);
  /* Même raison que pour l'enregistrement : le clic délégué ne rend pas la promesse. Le PDF est en
     outre LENT (pdf-lib travaille sur un gabarit de 1 Mo) — mesurer le clic rendrait la main avant
     la fin et lirait un message d'étape. */
  b.telechargerPdf = () => b.jouer(() => b.global('onTelechargerPdfAutorisation()'));
  b.cliquerPdf = () => b.jouer(() => b.cliquer(b.boutonPdf()));
  b.imprimer = () => b.jouer(() => b.cliquer(b.boutonImprimer()));
  b.reessayer = () => b.jouer(() => b.cliquer(b.boutonReessayer()));
  return b;
}

/* ============================================================== mesure (--mesurer) */
const SCENARIOS = [
  { nom: '1. arrivée sur l’écran (première fois)', jouer: async (b) => b.ouvrir() },
  { nom: '2. aller-retour : on quitte l’écran et on y revient', jouer: async (b) => { await b.ouvrir(); return b.revenir(); } },
  { nom: '3. frappe dans un champ (geste purement local)',
    jouer: async (b) => { await b.ouvrir(); return b.jouer(() => b.saisir('org_code_club', '9212345')); } },
  { nom: '4. « Enregistrer les champs saisis »',
    jouer: async (b) => { await b.ouvrir(); await b.jouer(() => b.saisir('org_code_club', '9212345')); return b.enregistrer(); } },
  { nom: '5. second clic « Enregistrer » (rien n’a bougé)',
    jouer: async (b) => { await b.ouvrir(); await b.jouer(() => b.saisir('org_code_club', '9212345')); await b.enregistrer(); return b.enregistrer(); } },
  { nom: '6. « Télécharger le formulaire pré-rempli (PDF) »',
    jouer: async (b) => { await b.ouvrir(); return b.telechargerPdf(); } },
  { nom: '7. « Imprimer la feuille »', jouer: async (b) => { await b.ouvrir(); return b.imprimer(); } }
];

async function mesurer(args) {
  const opt = (nom, defaut) => { const i = args.indexOf('--' + nom); return i === -1 ? defaut : args[i + 1]; };
  const frontend = opt('frontend', null);
  const backend = opt('backend', null);
  const lire = frontend === 'avant' ? LECTEUR_AVANT : lecteur(frontend);
  const source = backend === 'avant' ? BACKEND_AVANT() : (backend ? fs.readFileSync(path.resolve(backend), 'utf8') : null);
  const s = (ms) => (ms / 1000).toFixed(2).replace('.', ',');
  console.log('frontend : ' + (frontend || 'arbre de travail') + ' · backend : ' + (backend || 'arbre de travail') + '\n');
  console.log('| Geste | requêtes attendues | arrière-plan | total | lectures Google | CELLULES LUES | appels sous verrou | retour estimé | fin du réseau | verrou |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const sc of SCENARIOS) {
    const b = await banc({ lire, backend: source });
    const r = await sc.jouer(b);
    console.log('| ' + sc.nom + ' | ' + r.attendues.length + ' | ' + r.fond.length + ' | ' + r.requetes.length +
      ' | ' + r.lectures + ' | ' + r.cellules + ' | ' + r.appelsVerrou + ' | ' + s(r.retourMs) + ' s | ' + s(r.finReseauMs) + ' s | ' +
      s(r.verrouMs) + ' s |');
  }
}

if (require.main === module && process.argv.indexOf('--mesurer') !== -1) {
  mesurer(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { banc, serveur, navigateur, lecteur, lecteurMele, LECTEUR_AVANT, BACKEND_AVANT,
  FRONTEND_AVANT_REV, BACKEND_AVANT_REV, RACINE, BACKEND, MD, git, compteur: BC.compteur, tour: BC.tour };
