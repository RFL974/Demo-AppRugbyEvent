'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « INVITER UN CLUB » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par tests/ecran-invitation-surface.test.js.
 *  ▶ node tests/banc-ecran-invitation.js --mesurer [--frontend avant|<dossier>] [--backend avant|<Code.gs>]
 *    imprime, geste par geste, les requêtes RÉELLES du vrai frontend (bloquantes, arrière-plan, total, retour, fin du
 *    réseau, verrou estimé). `avant` = références FIGÉES a8d549424f6161962b35a476946d09e81b5c988b (frontend) et
 *    0fcf9f1367719ff8074f722f41fabe0e09e9fbf0 (backend), lues dans git — jamais HEAD, jamais un hash abrégé.
 *
 *  ⭐ Serveur : le VRAI Code.gs dans les doublures du banc de coût (backend/tests/banc-cout), sur un tournoi fictif VIDE
 *     (monde-invitation.js : réglages et tarifs de la démo, aucune équipe, aucun club). Navigateur : les VRAIS modules
 *     (api.js, admin.js, admin-invitations.js, admin-equipes.js, admin-suivi-clubs.js, admin-tableau-bord.js,
 *     admin-autorisation.js, admin-infos-publication.js, commun.js) et les VRAIES cartes de admin.html (sections copiées
 *     telles quelles dans un petit DOM), chargés dans un contexte Node.
 *  ⭐ Transport RÉEL jusqu'au réseau : le vrai api.js (délais, relance unique d'une lecture de ses listes fermées, et des
 *     seules écritures qu'il déclare idempotentes) ; seul `fetch` est simulé. Pannes injectables par émission. Minuteries
 *     ×1/1000 ; les durées rapportées sont celles du modèle de coût (⚠️ ESTIMÉES, pas mesurées chez Google).
 *  ⭐ Options (4ᵉ passage) : `documentReel` — les écouteurs posés sur `document` sont gardés et reçoivent les événements qui
 *     remontent, comme dans un navigateur (suite « zéro appel ») ; panne `sans-etat` — la réponse d'un backend d'avant le
 *     4ᵉ passage (sans les listes `clubs` / `equipes`).
 *  ⛔ Aucun réseau, aucun service Google réel.
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
const MI = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-invitation'));

/* Références FIGÉES d'avant le lot « Inviter un club » (jamais HEAD : après un commit, HEAD serait le nouveau code). */
const FRONTEND_AVANT_REV = 'a8d549424f6161962b35a476946d09e81b5c988b';
const BACKEND_AVANT_REV = '0fcf9f1367719ff8074f722f41fabe0e09e9fbf0';
const git = (depot, rev, fichier) => execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
/** Lecteur de fichiers du frontend (chemins relatifs à la racine : 'js/admin.js', 'admin.html'). */
const lecteur = (dossier) => (f) => fs.readFileSync(path.join(dossier || RACINE, f), 'utf8');
const LECTEUR_AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, f);
/** Cache du navigateur mêlant deux versions : `avant` = fichiers servis dans leur version d'avant. */
const lecteurMele = (avant, base) => (f) => (avant.indexOf(f) !== -1 ? LECTEUR_AVANT(f) : (base || lecteur())(f));

let _toutesVersions = null;
function BC_SOURCES_TOUTES_VERSIONS() {
  if (_toutesVersions === null) {
    _toutesVersions = ['js/commun.js'].concat(MODULES_BANC()).map((f) => { try { return LECTEUR_AVANT(f); } catch (e) { return ''; } })
      .concat(['js/commun.js'].concat(MODULES_BANC()).map((f) => lecteur()(f))).join('\n');
  }
  return _toutesVersions;
}
function MODULES_BANC() { return MODULES; }

/* ============================================================== serveur (vrai Code.gs) */
function serveur(source, options) {
  const o = options || {};
  const m = chargerBanc(source, (monde) => { MI.peuplerTournoiVide(monde, { modele: o.modele }); MI.brancherServices(monde); });
  m.equipes = () => m.appeler('lireOngletSimple', m.classeur, 'Equipes');
  m.clubs = () => m.appeler('listerClubsInvites', m.classeur).clubs;
  m.carnet = () => m.appeler('lireOngletSimple', m.classeur, 'Clubs');
  m.participations = () => m.appeler('lireOngletSimple', m.classeur, 'Participations');
  m.config = () => m.appeler('lireConfig', m.classeur);
  if (o.monde) o.monde(m);
  return m;
}

/* ============================================================== la page (vraies cartes de admin.html) */
const SECTIONS = ['tableau-bord', 'etat-avancement', 'bloc-contacts-securite', 'bloc-equipes', 'bloc-clubs-invites', 'bloc-suivi-clubs',
  'bloc-apercu-invitation', 'bloc-pieces-jointes-invitation', 'bloc-surplace', 'bloc-reponse', 'bloc-modalites', 'bloc-parking',
  'bloc-encadrement', 'bloc-pieces-jointes-dossier', 'bloc-dossier', 'bloc-apercu-dossier-email', 'bloc-autorisation'];
function page(html) {
  const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, '');
  return SECTIONS.map((id) => {
    const debut = sansCommentaires.search(new RegExp('<section[^>]*\\sid="' + id + '"'));
    if (debut === -1) return '';
    const fin = sansCommentaires.indexOf('</section>', debut);
    const bloc = sansCommentaires.slice(debut, fin + '</section>'.length);
    // Mode « écrans » : la feuille d'autorisation vit dans son écran, masqué tant qu'on ne l'ouvre pas.
    return id === 'bloc-autorisation' ? '<div id="ecran-autorisation" hidden>' + bloc + '</div>' : bloc;
  }).join('\n') + '<span id="tb-categories"></span><span id="tb-planning"></span><span id="tb-publication"></span>' +
    '<button id="bouton-recalculer-horaires" hidden></button><p id="aide-recalculer" hidden></p><div id="etat-dossier"></div>';
}

const MODULES = ['js/api.js', 'js/admin.js', 'js/admin-invitations.js', 'js/admin-equipes.js', 'js/admin-suivi-clubs.js',
  'js/admin-tableau-bord.js', 'js/admin-autorisation.js', 'js/admin-infos-publication.js'];

/* ============================================================== navigateur (vrais modules) */
function navigateur(srv, lire, options) {
  const o = options || {};
  const doc = BC.creerDocument();
  // ⭐ Événements RÉELS : les écouteurs posés par admin.js (brancherEcouteursAdmin) sont gardés et déclenchés avec
  //    remontée (délégation comprise) — c'est ainsi qu'un mélange de versions qui casserait le branchement se voit.
  doc.Element.prototype.addEventListener = function (type, fn) { (this.__ecouteurs = this.__ecouteurs || []).push({ type, fn }); };
  doc.Element.prototype.select = function () { doc.activeElement = this; };
  // ⭐ Option `documentReel` (suite « zéro appel ») : les écouteurs posés sur `document` (admin.js, admin-suivi-clubs.js…)
  //    sont gardés et reçoivent chaque événement qui remonte, comme dans un navigateur. Sans l'option : ignorés, comme avant.
  if (o.documentReel) {
    doc.__ecouteurs = [];
    doc.addEventListener = function (type, fn) { doc.__ecouteurs.push({ type, fn }); };
    doc.Element.prototype.click = function () { return b.cliquer(this); };
  }
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
    console, URL, setTimeout: minuterie, clearTimeout, document: doc, window: { open() {}, location: lieu }, navigator: {}, performance, AbortController,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: (k) => (k === 'r92_cle_admin' ? MI.CLE_ADMIN : ''), setItem() {}, removeItem() {} },
    location: lieu,
    API_URL: 'http://127.0.0.1:9/exec', SNAPSHOT_URL: '', fetch: fetchSimule, Blob: function () {},
    dialogConfirmer: async (texte) => { dialogues.push(texte); const r = reponses.length ? reponses.shift() : true; return typeof r === 'function' ? r() : r; },
    dialogAlerter: async (texte) => { dialogues.push('ALERTE ' + texte); },
    dialogDemander: async () => null
  });
  vm.runInContext(lire('js/commun.js'), ctx, { filename: 'js/commun.js' });
  const sources = {};
  MODULES.forEach((f) => { sources[f] = lire(f); vm.runInContext(sources[f], ctx, { filename: f }); });
  // Hors périmètre de l'écran : doublés (planning, terrains, publication, assistant, réglages).
  Object.assign(ctx, { assistantMajVerrou() {}, majVerrouPublier() {}, afficherPlanning() {}, majApresMidi() {}, majFeuilleJour() {},
    injecterReglages() {}, injecterTerrains() {}, majConformiteFFR: async () => {}, invaliderLecturesCategories() {},
    versionCategoriesCourante: () => 0, ecransMajPastilles() {}, assistantMarquerPropre() {}, majBoutonRecalculer() {} });
  const global = (expr) => vm.runInContext(expr, ctx);
  /* Les gestionnaires que brancherEcouteursAdmin nomme mais qui vivent dans des modules HORS du banc (infos, terrains,
     génération…) sont doublés. ⛔ Jamais ceux que déclare un module du banc, dans l'une OU l'autre version : un nom
     absent pour cause de mélange de versions doit lever, comme dans un vrai navigateur. */
  const declares = new Set();
  [BC_SOURCES_TOUTES_VERSIONS()].concat(Object.values(sources)).join('\n').replace(/function\s+([A-Za-z0-9_$]+)\s*\(/g, (m, n) => { declares.add(n); return m; });
  const branchement = BC.extrait(sources['js/admin.js'], 'brancherEcouteursAdmin');
  (branchement.match(/\b(on[A-Z][A-Za-z0-9_$]*|majApercu[A-Za-z]*|brancher[A-Za-z]*|rafraichirAdmin|traiterFichier[A-Za-z]*|planifierConformiteFFR|majConformiteFFR|majFormesCategories|majAffichageOptionsSurPlace|rendreZoneAfficheAccessible)\b/g) || [])
    .forEach((n) => { if (!declares.has(n) && global('typeof ' + n) === 'undefined') ctx[n] = function () {}; });

  const retenues = [];                                          // réponses servies mais livrées APRÈS la suivante
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
    entree.reseauMs = (panne === 'delai' || panne === 'silence') ? (entree.delaiMs || 30000) : entree.estimeMs;
    if (panne === 'delai' || panne === 'silence') {
      if (!req.signal) { entree.pendante = true; return; }       // sans délai client : l'appel reste pendu (défaut relevé)
      return;
    }
    if (/^http\d{3}-apres$/.test(panne || '')) return req.resolve(reponseHttp(Number(panne.slice(4, 7)), {}));
    if (panne === 'reseau-apres') return req.reject(new TypeError('Failed to fetch'));
    if (panne === 'retarder') { const r = entree.reponse; retenues.push(() => req.resolve(reponseHttp(200, r))); return undefined; }
    // `sans-etat` : la réponse d'un backend d'avant le 4ᵉ passage (mêmes champs, sans les listes relues `clubs` / `equipes`).
    const sansEtat = () => { const r = Object.assign({}, entree.reponse); delete r.clubs; delete r.equipes; return r; };
    const donnees = panne === 'partielle'
      ? { ok: true, contrat: entree.reponse.contrat, action: entree.reponse.action, modifies: entree.reponse.modifies }
      : panne === 'ancienne' ? { ok: true } : panne === 'sans-etat' ? sansEtat() : entree.reponse;
    return req.resolve(reponseHttp(200, donnees));
  }
  const pause = () => new Promise((r) => setTimeout(r, 1));

  /** Un geste : on sert une à une les requêtes qu'il ATTEND ; `pendant(n)` s'exécute avant de servir la n-ième attente
   *  (n = 0 : avant la première) ; `auRetour` au moment où le geste rend la main, AVANT l'arrière-plan. */
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
    const bloque = !fini;                                   // le geste ne rend jamais la main (appel pendu)
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
      appelsVerrou: faites.reduce((t, r) => t + (r.appelsVerrou || 0), 0)
    };
  }

  const b = { ctx, srv, doc, journal, dialogues, jouer, global, lire };
  /** Déclenche un événement comme un navigateur : sur l'élément, puis en remontant (écouteurs délégués). */
  b.declencher = (el, type, extra) => {
    const ev = Object.assign({ type, target: el, preventDefault() { ev.defaultPrevented = true; }, stopPropagation() { ev.arrete = true; } }, extra || {});
    const retours = [];
    for (let n = el; n && !ev.arrete; n = n.parentNode) (n.__ecouteurs || []).filter((x) => x.type === type).forEach((x) => retours.push(x.fn.call(n, ev)));
    if (!ev.arrete && doc.__ecouteurs) doc.__ecouteurs.filter((x) => x.type === type).forEach((x) => retours.push(x.fn.call(doc, ev)));
    return Promise.all(retours.map((r) => Promise.resolve(r)));
  };
  b.cliquer = (el) => b.declencher(el, 'click');
  b.id = (x) => doc.getElementById(x);
  b.texte = (x) => { const e = doc.getElementById(x); return e ? e.textContent : null; };
  b.message = () => b.texte('message-jeu-demo') || b.texte('message-equipe');
  /** Le bouton du jeu de démonstration, où qu'il soit dans la page ; son écran (section) d'accueil. */
  b.boutonDemo = () => doc.getElementById('bouton-charger-equipes-demo');
  b.sectionDe = (el) => { let n = el; while (n && n.tag !== 'section') n = n.parentNode; return n ? n.id : null; };
  b.clubsAffiches = () => doc.querySelectorAll('#liste-clubs-invites .club-invite-item').map((e) => e.getAttribute('data-club'));
  b.suiviAffiche = () => doc.querySelectorAll('#liste-suivi-clubs .suivi-club-ligne').map((e) => e.getAttribute('data-club'));
  b.equipesAffichees = () => doc.querySelectorAll('#liste-equipes .equipe-item').map((e) => {
    const cellules = e.querySelectorAll('[role="cell"]');
    return { nom: cellules[0].querySelector('.nom') ? cellules[0].textContent : cellules[0].textContent, club: cellules[1].textContent,
      categorie: cellules[2].textContent, joueurs: cellules[3].textContent, educateurs: cellules[4].textContent };
  });
  /** Clic RÉEL sur le bouton du jeu : par l'écouteur qu'admin.js y a posé (quelle que soit la version). Un bouton
   *  désactivé ne reçoit pas le clic, comme dans un navigateur. */
  b.cliquerDemo = () => {
    const bouton = b.boutonDemo();
    if (!bouton || bouton.disabled) return null;
    return b.cliquer(bouton);
  };
  b.demo = (pendant, auRetour) => jouer(() => b.cliquerDemo(), pendant, auRetour);
  /** Saisie d'une équipe dans le formulaire de l'écran Équipes, puis soumission (comme Entrée ou « Ajouter »). */
  b.saisirEquipe = (e) => jouer(() => {
    b.id('champ-nom').value = e.nom_equipe; b.id('champ-categorie').value = e.categorie;
    b.id('champ-joueurs').value = String(e.joueurs); b.id('champ-educateurs').value = String(e.educateurs);
    return global('onAjouterEquipe')({ preventDefault() {} });
  });
  b.charger = async () => {
    // Ouverture (hors mesure) : config, équipes et matchs chargés, écran rendu, liste des clubs lue.
    global('configCourante = ' + JSON.stringify(srv.postMesure({ action: 'getConfigAdmin', cle: MI.CLE_ADMIN }).reponse.config));
    global('equipesCourantes = ' + JSON.stringify(srv.equipes()));
    global('matchsCourants = []');
    global('definirAdminConnecte(true)');
    global('remplirSelectCategories(configCourante.categories)');
    global('afficherEquipes(equipesCourantes)');
    global('majInvitation(); majSurPlace(); majReponse(); majContactsSecurite(); majDossier();');
    try { global('brancherEcouteursAdmin()'); b.erreurBranchement = null; } catch (e) { b.erreurBranchement = e.message; }
    await jouer(() => global('ouvrirEtapeAdmin')('invitation'));
    global('majTableauBord()');
    journal.length = 0; dialogues.length = 0;
  };
  return b;
}

/** Un banc prêt : serveur (vrai Code.gs) + navigateur (fichiers du frontend), écran chargé. */
async function banc(options) {
  const o = options || {};
  const srv = serveur(o.backend || fs.readFileSync(path.join(BACKEND, 'Code.gs'), 'utf8'), o);
  const getScriptLock = srv.contexte.LockService.getScriptLock;
  srv.contexte.LockService.getScriptLock = function () {
    const v = getScriptLock.call(this);
    return Object.assign(Object.create(v), { tryLock(ms) { if (srv.verrouOccupe) return false; return v.tryLock(ms); },
      releaseLock() { return v.releaseLock(); }, hasLock() { return v.hasLock ? v.hasLock() : false; } });
  };
  const b = navigateur(srv, o.lire || lecteur(), o);
  await b.charger();
  return b;
}

/* ============================================================== mesure (campagne) */
const s = (ms) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';
function ligneMesure(nom, r) {
  if (r.bloque) return '| ' + nom + ' | ' + r.attendues.length + ' | ' + r.fond.length + ' | ' + r.requetes.length + ' | ⛔ jamais (bouton bloqué) | ' +
    '⛔ jamais | ' + r.appelsVerrou + ' | ' + s(r.verrouMs) + ' | ' + (r.resume || '—') + ' |';
  return '| ' + nom + ' | ' + r.attendues.length + ' | ' + r.fond.length + ' | ' + r.requetes.length + ' | ' + s(r.retourMs) + ' | ' +
    s(r.finReseauMs) + ' | ' + r.appelsVerrou + ' | ' + s(r.verrouMs) + ' | ' + (r.resume || '—') + ' |';
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
/** Pose des valeurs dans un formulaire (par nom de champ), comme au clavier. */
function remplir(b, idForm, valeurs) {
  const f = b.id(idForm);
  Object.keys(valeurs).forEach((nom) => {
    const champs = f.querySelectorAll('[name="' + nom + '"]');
    champs.forEach((c) => {
      if (c.type === 'checkbox') c.checked = valeurs[nom] === 'oui';
      else if (c.type === 'radio') c.checked = c.value === valeurs[nom];
      else c.value = valeurs[nom];
    });
  });
}
const clubLigne = (b, nom) => b.doc.querySelector('#liste-clubs-invites .club-invite-item[data-club="' + nom + '"]');
const clic = (b, el) => b.global('onClicClubsInvites')({ target: el });

/** Chaque geste serveur de l'écran (hors jeu de démonstration), sur les VRAIS modules. */
async function gestesEcran(o) {
  const lignes = [];
  const resultats = [];
  let b;
  const MESSAGES = { A2: 'message-modalites', A3: 'message-reponse', A4: 'message-contacts-securite', A5: 'message-surplace',
    A6: 'message-invitations', B1: 'message-parking', B2: 'message-parking', B3: 'message-parking', B4: 'message-encadrement' };
  const note = (nom, r) => {
    lignes.push(ligneMesure(nom, r));
    const code = nom.split('.')[0];
    resultats.push({ code, nom, r, message: b.texte(MESSAGES[code] || 'message-club-invite') || '' });
  };
  const clubs = (m) => MI.amorcerClubs(m);
  b = await banc(Object.assign({}, o, { monde: clubs }));
  const arrivee = await b.jouer(() => { b.global('marquerRessourceAdmin')('clubsInvites', false); return b.global('ouvrirEtapeAdmin')('invitation'); });
  note('A1. arrivée sur l\'écran (liste des clubs)', arrivee);
  remplir(b, 'form-modalites', { tarif_engagement_oui: 'oui', tarif_engagement_montant: '50', tarif_engagement_mode: 'par_equipe',
    tarif_engagement_modalites: 'Virement fictif', date_limite_confirmation: '2027-05-01' });
  note('A2. enregistrer les modalités', await b.jouer(() => b.global('onEnregistrerModalites')()));
  remplir(b, 'form-reponse', { date_limite_reponse: '2027-04-15', contact_reponse_nom: 'Accueil fictif', contact_reponse_tel: '0600000000',
    contact_reponse_email: 'contact@example.invalid' });
  note('A3. enregistrer « Réponse à l\'invitation »', await b.jouer(() => b.global('onEnregistrerReponse')()));
  remplir(b, 'form-contacts-securite', { referent_nom: 'Référent fictif', referent_tel: '0600000000' });
  note('A4. enregistrer contacts & sécurité', await b.jouer(() => b.global('onEnregistrerContacts')()));
  remplir(b, 'form-surplace', { buvette_disponible: 'oui', repas_sur_place_oui: 'oui', repas_sur_place_mode: 'prix_personne',
    repas_sur_place_montant: '11' });
  note('A5. enregistrer « Sur place »', await b.jouer(() => b.global('onEnregistrerSurPlace')()));
  note('A6. envoyer aux clubs non encore invités', await b.jouer(() => b.global('onEnvoyerInvitationsGroupe')()));
  remplir(b, 'form-parking', { parking_texte: 'Parking fictif, entrée B' });
  note('B1. enregistrer parking & accès (texte)', await b.jouer(() => b.global('onEnregistrerParking')()));
  b.global('parkingDataURI = ' + JSON.stringify(PNG));
  note('B2. enregistrer parking & accès (texte + photo)', await b.jouer(() => b.global('onEnregistrerParking')()));
  b.global('parkingDataURI = ""');
  note('B3. retirer la photo du parking', await b.jouer(() => b.global('onRetirerPhotoParking')()));
  remplir(b, 'form-encadrement', { encadrement_ratio: '1 pour 8', encadrement_diplomes: 'Diplôme fictif' });
  note('B4. enregistrer encadrement & assurance', await b.jouer(() => b.global('onEnregistrerEncadrement')()));
  b = await banc(Object.assign({}, o, { monde: clubs }));
  b.id('champ-club-nom').value = 'club fictif d'; b.id('champ-club-email').value = 'club-d@example.invalid';
  note('C1. ajouter un club (bouton ou Entrée)', await b.jouer(() => b.global('onAjouterClubInvite')({ preventDefault() {} })));
  const select = clubLigne(b, 'CLUB FICTIF D').querySelector('.statut-club');
  select.value = 'Décliné';
  note('C2. changer le statut d\'un club', await b.jouer(() => b.global('onChangerStatutClub')({ target: select })));
  note('C3. envoyer l\'invitation (ligne du club)', await b.jouer(() => clic(b, clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club'))));
  await clic(b, clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-editer-club'));
  clubLigne(b, 'CLUB FICTIF A').querySelector('.club-edit-prenom').value = 'A2';
  note('C4. modifier les coordonnées', await b.jouer(() => clic(b, clubLigne(b, 'CLUB FICTIF A').querySelector('.btn-enregistrer-edition'))));
  note('C5. retirer un club (sans équipe)', await b.jouer(() => clic(b, clubLigne(b, 'CLUB FICTIF C').querySelector('.bouton-suppr-club'))));
  note('C6. ajouter les équipes au tournoi (club accepté)', await b.jouer(() => clic(b, clubLigne(b, 'CLUB FICTIF B').querySelector('.bouton-cats-club'))));
  lignes.resultats = resultats;
  return lignes;
}

async function mesurer(o) {
  const lignes = await gestesEcran(o);
  const note = (nom, r) => lignes.push(ligneMesure(nom, r));
  // D1 — tournoi vide : un clic sur le bouton du jeu de démonstration.
  let b = await banc(o);
  note('D1. jeu de démonstration, tournoi vide : un clic', await b.demo());
  const apresD1 = { equipes: b.srv.equipes().length, clubs: b.srv.clubs().length, message: b.message() };
  note('D1 bis. second clic', await b.demo());
  // D2 — l'ancien chemin vers le jeu complet : 21 saisies dans « Équipes », puis le bouton.
  b = await banc(o);
  let saisies = null;
  for (const e of MI.ATTENDU.EQUIPES) {
    const r = await b.saisirEquipe(e);
    if (!saisies) saisies = { attendues: [], fond: [], requetes: [], retourMs: 0, finReseauMs: 0, verrouMs: 0, appelsVerrou: 0, resume: '' };
    saisies.attendues.push(...r.attendues); saisies.fond.push(...r.fond); saisies.requetes.push(...r.requetes);
    saisies.retourMs += r.retourMs; saisies.finReseauMs += r.finReseauMs; saisies.verrouMs += r.verrouMs; saisies.appelsVerrou += r.appelsVerrou;
  }
  saisies.resume = '21 × (' + [...new Set(saisies.requetes.map((q) => (q.attendue ? '' : '↪') + q.action))].join(' → ') + ')';
  note('D2 a. saisir les 21 équipes une à une (écran Équipes)', saisies);
  const d2 = await b.demo();
  note('D2 b. puis le bouton du jeu de démonstration', d2);
  const apresD2 = { equipes: b.srv.equipes().length, clubs: b.srv.clubs().length, message: b.message() };
  // N1 — sur le jeu complet obtenu en D2 (quelle que soit la version) : « Ajouter les équipes » sur CLAMART.
  const avantN1 = b.srv.equipes().map((e) => e.categorie + ':' + e.nom_equipe).sort().join(',');
  const ligneClamart = clubLigne(b, 'CLAMART');
  if (ligneClamart && ligneClamart.querySelector('.club-prenom-input')) {
    const champPrenom = ligneClamart.querySelector('.club-prenom-input');
    champPrenom.value = 'Contact2'; await b.declencher(champPrenom, 'change');
    note('N1. « Ajouter les équipes » sur CLAMART (jeu complet, déjà au complet)', await b.jouer(() => clic(b, clubLigne(b, 'CLAMART').querySelector('.bouton-cats-club'))));
  }
  const apresN1 = b.srv.equipes().map((e) => e.categorie + ':' + e.nom_equipe).sort().join(',');
  // ⭐ 2ᵉ passage — navigation, retour, « Rafraîchir », écritures incertaines, « Ajouter les équipes » sur un club du jeu.
  const clubs = (m) => MI.amorcerClubs(m);
  b = await banc(Object.assign({}, o, { monde: clubs }));
  note('F2. retour sur l\'écran (Inviter → Suivi → Inviter)', await b.jouer(async () => {
    await b.global('ouvrirEtapeAdmin')('suivi-clubs'); await b.global('ouvrirEtapeAdmin')('invitation'); }));
  note('F3. « Rafraîchir »', await b.jouer(() => b.cliquer(b.id('bouton-rafraichir-admin'))));
  const panne = (action, mode) => { let premiere = true; return (e) => (e.action === action && premiere ? (premiere = false, mode) : null); };
  b = await banc(Object.assign({}, o, { monde: clubs, panne: panne('enregistrerInvitation', 'http404-apres') }));
  remplir(b, 'form-modalites', { tarif_engagement_oui: 'oui', tarif_engagement_montant: '75', tarif_engagement_mode: 'par_equipe' });
  const w1 = await b.jouer(() => b.global('onEnregistrerModalites')());
  note('W1. modalités, réponse perdue (404 après écriture)', w1);
  const msgW1 = b.texte('message-modalites');
  b = await banc(Object.assign({}, o, { monde: clubs, panne: panne('enregistrerInvitation', 'silence') }));
  remplir(b, 'form-modalites', { tarif_engagement_oui: 'oui', tarif_engagement_montant: '75', tarif_engagement_mode: 'par_equipe' });
  const w3 = await b.jouer(() => b.global('onEnregistrerModalites')());
  note('W3. modalités, réponse silencieuse', w3);
  const msgW3 = b.texte('message-modalites');
  b = await banc(Object.assign({}, o, { monde: clubs, panne: panne('envoyerInvitationClub', 'http404-apres') }));
  const w2 = await b.jouer(() => clic(b, clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club')));
  note('W2. invitation individuelle, réponse perdue (404 après envoi)', w2);
  const msgW2 = b.texte('message-club-invite');
  return { lignes, apresD1, apresD2, messages: { W1: msgW1, W2: msgW2, W3: msgW3 }, nomsInchanges: avantN1 === apresN1,
    renommees: avantN1.split(',').filter((n) => apresN1.split(',').indexOf(n) === -1) };
}

if (require.main === module) {
  const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
  const o = {
    lire: arg('frontend') === 'avant' ? LECTEUR_AVANT : arg('frontend') ? lecteur(path.resolve(arg('frontend'))) : lecteur(),
    backend: arg('backend') === 'avant' ? BACKEND_AVANT() : arg('backend') ? fs.readFileSync(path.resolve(arg('backend')), 'utf8') : undefined
  };
  mesurer(o).then((r) => {
    console.log('| Geste | bloquantes | arrière-plan | total | retour utilisateur | fin du réseau | appels sous verrou | verrou | requêtes |');
    console.log('|---|---|---|---|---|---|---|---|---|');
    r.lignes.forEach((l) => console.log(l));
    console.log('\nAprès D1 : ' + JSON.stringify(r.apresD1));
    console.log('Après D2 : ' + JSON.stringify(r.apresD2));
    console.log('Messages : ' + JSON.stringify(r.messages));
    console.log('N1 — noms inchangés : ' + r.nomsInchanges + ' ; disparus : ' + JSON.stringify(r.renommees));
  }).catch((e) => { console.error(e); process.exitCode = 1; });
}

module.exports = { banc, serveur, navigateur, page, lecteur, lecteurMele, LECTEUR_AVANT, BACKEND_AVANT, FRONTEND_AVANT_REV,
  BACKEND_AVANT_REV, MI, RACINE, BACKEND, git, mesurer, gestesEcran, remplir, clubLigne, clic, PNG };
