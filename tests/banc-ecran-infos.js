'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « INFOS DU TOURNOI » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par
 *  tests/contrat-ecriture-categories.test.js et tests/ecran-infos-surface.test.js.
 *
 *  ⭐ Le serveur est le VRAI backend (Code.gs du dépôt voisin, ou toute autre version), exécuté dans
 *  les doublures Google du banc de coût (backend/tests/banc-cout) sur un tournoi fictif. Le navigateur
 *  est fait des VRAIS modules de js/ (ou d'une autre version, pour les contre-épreuves), chargés tels
 *  quels dans un contexte Node, avec un DOM minimal.
 *  ⭐ Le transport est simulé : chaque requête attend que le banc la serve. On distingue ainsi les
 *  requêtes qu'un geste ATTEND de celles qui partent en arrière-plan, et l'on compte ce qui part
 *  réellement vers le serveur.
 *  ⛔ Aucun réseau, aucun service Google réel.
 * ============================================================================
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const BACKEND = path.join(RACINE, '..', 'backend');
const { chargerBanc } = require(path.join(BACKEND, 'tests', 'banc-cout', 'instrumentation'));
const { peuplerDemo, peuplerReferentielFFR, CLE_ADMIN } = require(path.join(BACKEND, 'tests', 'banc-cout', 'monde-demo'));
const { fourchette } = require(path.join(BACKEND, 'tests', 'banc-cout', 'modele-cout'));

const CHOIX = ['U6', 'U8', 'U10', 'U12', 'U14'];
const PNG = 'data:image/png;base64,' + Buffer.alloc(600, 3).toString('base64');

/** Versions de référence, lues dans l'historique git (jamais recopiées) : compatibilité. */
const git = (depot, rev, fichier) => execFileSync('git', ['-C', depot, 'show', rev + ':' + fichier], { encoding: 'utf8' });
const BACKEND_AVANT = () => git(BACKEND, '3f26c3c', 'Code.gs');
const JS_AVANT = (f) => git(RACINE, 'f51bcfb', 'js/' + f);
/** Lecteur des modules d'un dossier js/ (celui du dépôt par défaut). */
const lecteurJs = (dossier) => (f) => fs.readFileSync(path.join(dossier || path.join(RACINE, 'js'), f), 'utf8');

const tour = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function extrait(source, nom) {
  const debut = source.indexOf('function ' + nom + '(');
  assert.notEqual(debut, -1, nom);
  const fin = source.indexOf('\n}', debut);
  return (source.slice(Math.max(0, debut - 6), debut) === 'async ' ? 'async ' : '') + source.slice(debut, fin + 2);
}

/* ---------------------------------------------------------------- le serveur (vrai Code.gs) */
function serveur(source, retouches) {
  const m = chargerBanc(source, peuplerDemo);
  m.contexte.Session = { getScriptTimeZone: () => 'Europe/Paris' };
  m.drive = { crees: [], corbeille: [] };
  m.contexte.DriveApp = {
    Access: { ANYONE_WITH_LINK: 'A' }, Permission: { VIEW: 'V' },
    createFile() { const id = 'fichier-fictif-' + (m.drive.crees.length + 1); m.drive.crees.push(id); return { getId: () => id, setSharing() {} }; },
    getFileById(id) { return { setTrashed() { m.drive.corbeille.push(id); } }; }
  };
  m.contexte.Utilities.base64Decode = (b) => Array.from(Buffer.from(b, 'base64'));
  // Classeur « en service » : entête des catégories complète, comme setupSheet la crée.
  m.appeler('assurerColonneCategorie', m.classeur, 'nb_poules');
  m.appeler('assurerColonnesConfig', m.classeur);
  const r = retouches || {};
  if (r.ffrRiche) peuplerReferentielFFR(m);
  const config = m.feuilles.get('Config');
  const ligneDe = (nom) => config.cellules.findIndex((l) => l && l[0] === nom);
  const sansUsage = (cat) => ['Equipes', 'Matchs'].forEach((nom) => {
    const f = m.feuilles.get(nom); const c = f.cellules[0].indexOf('categorie');
    f.cellules = [f.cellules[0]].concat(f.cellules.slice(1).filter((l) => l[c] !== cat));
  });
  (r.sans || []).forEach((cat) => { config.cellules.splice(ligneDe(cat), 1); sansUsage(cat); });
  (r.vides || []).forEach(sansUsage);
  Object.keys(r.parametres || {}).forEach((nom) => { const l = ligneDe(nom); if (l !== -1) config.poser(l + 1, 2, r.parametres[nom]); });
  m.categories = () => m.appeler('lireConfig', m.classeur).categories.map((c) => c.categorie + ':' + c.presente).join(' ');
  m.global = () => m.appeler('lireConfig', m.classeur).global;
  m.categorie = (nom) => m.appeler('lireConfig', m.classeur).categories.find((c) => c.categorie === nom);
  m.lignes = (onglet) => m.appeler('lireOngletSimple', m.classeur, onglet);
  return m;
}

/* ---------------------------------------------------------------- le navigateur (vrais modules) */
function navigateur(srv, lireJs, options) {
  const o = options || {};
  const journal = [];            // tout ce qui part vers le serveur
  const attente = [];            // requêtes émises, pas encore servies
  const messages = [];
  const dialogues = [];
  const alertes = [];
  const reponsesDialogue = (o.dialogues || []).slice();
  const elements = {};
  const minuteries = [];
  const champ = (v) => ({ value: v || '', clics: 0, ecouteurs: {}, click() { this.clics++; },
    addEventListener(type, fn) { (this.ecouteurs[type] = this.ecouteurs[type] || []).push(fn); } });
  const el = (id) => elements[id] || (elements[id] = {
    id, innerHTML: '', textContent: '', value: '', disabled: false, hidden: false, className: '', src: '',
    attributs: {}, ecouteurs: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, fn) { (this.ecouteurs[type] = this.ecouteurs[type] || []).push(fn); },
    declencher(type, evenement) { (this.ecouteurs[type] || []).forEach((fn) => fn(evenement)); },
    removeAttribute(a) { if (a === 'src') this.src = ''; delete this.attributs[a]; },
    setAttribute(a, v) { this.attributs[a] = String(v); },
    getAttribute(a) { return Object.prototype.hasOwnProperty.call(this.attributs, a) ? this.attributs[a] : null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, focus() {}
  });
  Object.assign(el('form-infos-tournoi'), { tournoi_nom: champ(), tournoi_lieu: champ(), tournoi_adresse: champ(),
    tournoi_description: champ(), tournoi_affiche: champ() });
  Object.assign(el('form-cadre-tournoi'), { tournoi_date: champ(), zone_vacances: champ() });
  el('zone-depot-affiche').querySelector = (s) => (/file/.test(s) ? el('form-infos-tournoi').tournoi_affiche : null);
  const cases = CHOIX.map((value) => ({ value, checked: false }));
  el('form-choix-categories').querySelectorAll = () => cases;
  el('ecran-autorisation').hidden = true;          // mode écrans, sur l'écran « Infos » : feuille non affichée
  el('bouton-valider-categories').hidden = true;   // mode écrans : « Valider » est masqué (ecrans.js)
  el('bouton-enregistrer-cadre').hidden = true;    // mode écrans : « Enregistrer la date » aussi
  el('panneau-trouver-date').hidden = true;

  const horloge = {
    setTimeout(fn, ms) { const id = minuteries.length + 1; minuteries.push({ id, fn, ms, actif: true }); return id; },
    clearTimeout(id) { const t = minuteries.find((x) => x.id === id); if (t) t.actif = false; }
  };
  const transport = (methode, corps) => new Promise((resolve, reject) => attente.push({ methode, corps, resolve, reject }));
  const ctx = vm.createContext({
    console, URL,
    setTimeout: o.horlogeFactice ? horloge.setTimeout : setTimeout,
    clearTimeout: o.horlogeFactice ? horloge.clearTimeout : clearTimeout,
    document: {
      getElementById: el,
      querySelector: (s) => s.includes('tournoi_date') ? el('form-cadre-tournoi').tournoi_date
        : s.includes('zone_vacances') ? el('form-cadre-tournoi').zone_vacances : null,
      querySelectorAll: () => [], addEventListener() {}
    },
    window: { CSS: { escape: (v) => v } },
    configCourante: { global: {}, categories: [] }, equipesCourantes: [], matchsCourants: [], afficheDataURI: '',
    DELAI_LECTURE_ADMIN_MS: 30000,
    afficherMessage: (e, texte, type) => { e.textContent = texte; e.type = type; messages.push({ id: e.id, texte, type }); },
    echapper: (s) => String(s), urlAffiche: (id, l) => 'https://exemple.invalid/' + id + '=w' + l,
    afficherCategories: (cats) => cats.map((c) => c.categorie).join(','), remplirSelectCategories() {},
    injecterTerrains() {}, majTableauBord() {}, assistantMarquerPropre() {},
    injecterReglages: (g, cats) => { el('zone-categories').rendus = (el('zone-categories').rendus || 0) + 1; el('zone-categories').dernier = cats; },
    redimensionnerImage: async (fichier) => {
      if (!fichier || fichier.illisible) throw new Error('image illisible (simulé)');
      return 'data:image/jpeg;base64,IMAGE-' + fichier.nom;
    },
    dialogConfirmer: async (texte, opts) => {
      dialogues.push({ texte, opts });
      const r = reponsesDialogue.length ? reponsesDialogue.shift() : true;
      if (r === 'panne') throw new Error('Boîte de dialogue indisponible (simulé)');
      return r;
    },
    dialogAlerter: async (texte) => { alertes.push(texte); },
    apiPostProtege: (action, data) => transport('POST', Object.assign({}, data, { action, cle: CLE_ADMIN })),
    apiPost: (action, data) => transport('POST', Object.assign({}, data, { action })),
    apiGet: (action, params) => transport('GET', Object.assign({ action }, params || {}))
  });
  const admin = lireJs('admin.js');
  const commun = fs.readFileSync(path.join(RACINE, 'js', 'commun.js'), 'utf8');
  vm.runInContext([
    extrait(fs.readFileSync(path.join(RACINE, 'js', 'admin-reglages.js'), 'utf8'), 'normaliserNomCategorie'),
    extrait(admin, 'estPresente'), extrait(admin, 'ecrireAdmin'), extrait(admin, 'lireConfigAdmin'),
    extrait(admin, 'rechargerReglages'), extrait(commun, 'avecBoutonOccupe'), extrait(commun, 'dateLocaleDepuisISO'),
    lireJs('admin-autorisation.js'), lireJs('admin-choix-categories.js'), lireJs('admin-conformite-ffr.js'),
    lireJs('admin-infos-publication.js')
  ].join('\n'), ctx);
  ctx.majDossier = () => { el('etat-dossier').rendus = (el('etat-dossier').rendus || 0) + 1; };
  ctx.majFormesCategories = () => {};
  ctx.refFFRCache = { dates: [{}], formes: [], regles: [], temps: [], millesime: 'SIMULATION' };

  /** Sert UNE requête en attente : exécution réelle de doPost / doGet, pannes injectables. */
  function servir(req, attendue) {
    const entree = { methode: req.methode, action: req.corps.action, corps: req.corps, attendue };
    journal.push(entree);
    const panne = o.panne ? o.panne(entree, journal) : null;
    const perdue = () => req.reject(Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' }));
    if (panne === 'perdue-avant') return perdue();
    const servie = req.methode === 'POST' ? srv.postMesure(req.corps) : srv.getMesure(req.corps);
    entree.reponse = servie.reponse;
    // Durée ESTIMÉE par le modèle de coût du banc (pas une mesure chez Google).
    const f = fourchette(servie.mesure);
    entree.estimeMs = f.centrale.total;
    entree.verrouMs = f.centrale.sousVerrou;
    if (panne === 'perdue-apres') return perdue();
    const donnees = panne === 'partielle'
      ? { ok: true, contrat: entree.reponse.contrat, action: entree.reponse.action, modifies: entree.reponse.modifies } : entree.reponse;
    if (donnees && donnees.error) { const e = new Error(donnees.error); e.reponse = donnees; return req.reject(e); }
    return req.resolve(donnees);
  }

  /** Un geste : on sert une à une les requêtes qu'il ATTEND ; celles restées en attente à la fin
   *  du geste partent en arrière-plan (servies ensuite). */
  async function jouer(geste) {
    const avant = journal.length;
    let fini = false;
    const p = Promise.resolve().then(geste).finally(() => { fini = true; });
    for (let garde = 0; garde < 400 && !fini; garde++) {
      await tour();
      if (!fini && attente.length) servir(attente.shift(), true);
    }
    await p;
    while (attente.length) { servir(attente.shift(), false); await tour(); }
    await tour();
    const faites = journal.slice(avant);
    return {
      requetes: faites, attendues: faites.filter((r) => r.attendue), fond: faites.filter((r) => !r.attendue),
      ecritures: faites.filter((r) => r.methode === 'POST' && r.action !== 'getConfigAdmin'),
      resume: faites.map((r) => (r.attendue ? '' : '↪') + r.action).join(' → '),
      // Attente ESTIMÉE qui bloque le geste : somme des requêtes attendues (majorant si deux d'entre
      // elles partent ensemble), et verrou d'écriture cumulé.
      attenteMs: faites.filter((r) => r.attendue).reduce((t, r) => t + (r.estimeMs || 0), 0),
      verrouMs: faites.reduce((t, r) => t + (r.verrouMs || 0), 0)
    };
  }

  const b = { ctx, srv, journal, messages, dialogues, alertes, reponsesDialogue, el, cases, minuteries };
  b.jouer = jouer;
  /** Horloge factice : déclenche les minuteries échues (debounce du contrôle FFR…). */
  b.avancer = () => jouer(() => {
    minuteries.filter((t) => t.actif).forEach((t) => { t.actif = false; t.fn(); });
  });
  b.minuteriesActives = () => minuteries.filter((t) => t.actif).length;
  b.message = () => el('message-infos-tournoi').textContent;
  b.messageChoix = () => el('message-choix-categories').textContent;
  b.messageCadre = () => el('message-cadre-tournoi').textContent;
  b.cocher = (noms) => { cases.forEach((c) => { c.checked = noms.includes(c.value); }); ctx.onChangerChoixCategories(); };
  b.cliquer = () => jouer(() => (el('bouton-enregistrer-infos').disabled ? null : ctx.onEnregistrerInfos()));
  b.saisir = (champs) => Object.keys(champs).forEach((k) => {
    const cadre = el('form-cadre-tournoi');
    (cadre[k] || el('form-infos-tournoi')[k]).value = champs[k];
  });
  b.charger = async () => {
    // Ouverture de l'écran (hors mesure) : config, équipes et matchs chargés, formulaire rempli, verdict FFR.
    ctx.configCourante = srv.postMesure({ action: 'getConfigAdmin', cle: CLE_ADMIN }).reponse.config;
    if (!o.equipesInconnues) { ctx.equipesCourantes = srv.lignes('Equipes'); ctx.matchsCourants = srv.lignes('Matchs'); }
    await jouer(() => ctx.majInfosTournoi());
    journal.length = 0; messages.length = 0;
  };
  return b;
}

/** Un banc prêt : serveur (vrai Code.gs, retouches de `monde`) + navigateur (modules de `js`), écran chargé. */
async function banc(options) {
  const o = options || {};
  const srv = serveur(o.backend || fs.readFileSync(path.join(BACKEND, 'Code.gs'), 'utf8'), o.monde);
  const b = navigateur(srv, o.js || lecteurJs(), o);
  await b.charger();
  return b;
}

/** Petit compteur de contrôles, partagé par les suites qui utilisent ce banc. */
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

module.exports = { banc, serveur, navigateur, compteur, extrait, lecteurJs, tour, git,
  BACKEND, RACINE, BACKEND_AVANT, JS_AVANT, CHOIX, PNG, CLE_ADMIN };
