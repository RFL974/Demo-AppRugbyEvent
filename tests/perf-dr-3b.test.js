/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — chargement différé, verrouillage et validation de clé
 *  Chantiers PERF-DR-3B et CORR-UX-PERF-DR-3B-R1
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/perf-dr-3b.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *    Sortie : une ligne par contrôle, puis un bilan. Code de sortie 1 si un contrôle échoue.
 *
 *  CE QU'IL PROTÈGE — douze affirmations que l'administration fait à l'organisateur :
 *
 *   ① l'ouverture ne coûte que trois lectures, quelles que soient les préférences du navigateur ;
 *   ② une préférence d'écran héritée ne peut plus faire grimper ce coût ;
 *   ③ un tournoi dont « l'écran du moment » serait secondaire non plus ;
 *   ④ chaque écran secondaire lit ce qu'il affiche, une seule fois ;
 *   ⑤ « Verrouiller » ferme réellement les lectures à venir ;
 *   ⑥ un rafraîchissement raté redevient « à relire » ;
 *   ⑦ les deux lectures Partenaires vivent leur vie séparément ;
 *   ⑧ l'envoi de la feuille ne confond jamais « panne » et « aucun destinataire » ;
 *   ⑨⑩⑪ une clé n'est acceptée que sur preuve, jamais par défaut ;
 *   ⑫ ordinateur et mobile passent par la MÊME logique, verrous compris.
 *
 *  ⭐ IL EXÉCUTE LE CODE RÉEL. Les fonctions sont EXTRAITES des fichiers de `js/` et jouées
 *  dans un contexte Node avec des doublures. ⛔ Rien n'est recopié : si une fonction est
 *  renommée, l'extraction échoue bruyamment — mets ce garde-fou à jour, ne le supprime pas.
 *
 *  ⭐ ET IL SE PROUVE LUI-MÊME (série Z, § 13). Le code d'AVANT chaque correctif est reconstruit
 *  par substitution et rejoué : s'il ne reproduit PAS le défaut, ce fichier ÉCHOUE. Un test qui
 *  ne peut pas échouer ne prouve rien — c'est la leçon de R-098.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');

/* ========================================================================== */
/*  EXTRACTION — on PREND le code réel, on ne le réécrit jamais.               */
/* ========================================================================== */

function lire(rel) {
  return fs.readFileSync(path.join(RACINE, rel), 'utf8');
}

/** Localise une DÉCLARATION en début de ligne (jamais une occurrence en commentaire). */
function situer(source, rel, entete) {
  const estFonction = entete.indexOf('(') !== -1;
  const noyau = estFonction ? entete.replace(/\s*\([\s\S]*$/, '') : entete;
  const motif = new RegExp('^' + noyau.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    (estFonction ? '\\s*\\(' : '\\b'), 'm');
  const trouve = motif.exec(source);
  if (!trouve) {
    throw new Error('Déclaration introuvable dans ' + rel + ' : « ' + entete + ' ». ' +
      'Si le code a été renommé, mets ce garde-fou à jour — ne le supprime pas.');
  }
  return trouve.index;
}

/** Découpe un bloc délimité par des accolades ou des crochets, par équilibrage. */
function bloc(rel, entete, ouvrant) {
  const source = lire(rel);
  const debut = situer(source, rel, entete);
  const fermant = ouvrant === '[' ? ']' : '}';
  let profondeur = 0;
  for (let i = source.indexOf(ouvrant, debut); i < source.length; i++) {
    if (source[i] === ouvrant) profondeur++;
    else if (source[i] === fermant && --profondeur === 0) return source.slice(debut, i + 1) + ';';
  }
  throw new Error('Délimiteurs déséquilibrés autour de « ' + entete + ' » dans ' + rel);
}

/** Découpe une déclaration simple, d'un début de ligne jusqu'au premier « ; » en fin de ligne. */
function ligne(rel, entete) {
  const source = lire(rel);
  const debut = situer(source, rel, entete);
  const fin = source.indexOf(';\n', debut);
  if (fin === -1) throw new Error('Fin de déclaration introuvable : « ' + entete + ' »');
  return source.slice(debut, fin + 1);
}

const F_ADMIN = 'js/admin.js';
const F_API = 'js/api.js';
const F_ECRANS = 'js/ecrans.js';
const F_ASSISTANT = 'js/assistant.js';
const F_FEUILLE = 'js/admin-feuille-jour.js';

/* Le registre de chargement différé, tel qu'il vit dans admin.js. */
const SRC_REGISTRE = [
  bloc(F_ADMIN, 'const ADMIN_RESSOURCES', '{'),
  bloc(F_ADMIN, 'const ADMIN_ETAPES', '{'),
  ligne(F_ADMIN, 'const adminEtatsRessources'),
  ligne(F_ADMIN, 'let adminConnecte'),
  bloc(F_ADMIN, 'function definirAdminConnecte(', '{'),
  bloc(F_ADMIN, 'function etatRessourceAdmin(', '{'),
  bloc(F_ADMIN, 'function marquerRessourceAdmin(', '{'),
  bloc(F_ADMIN, 'function ressourceAdminChargee(', '{'),
  bloc(F_ADMIN, 'function enfilerLectureAdmin(', '{'),
  bloc(F_ADMIN, 'function lancerLectureAdmin(', '{'),
  bloc(F_ADMIN, 'function assurerRessourceAdmin(', '{'),
  bloc(F_ADMIN, 'function rafraichirRessourceAdmin(', '{'),
  bloc(F_ADMIN, 'function assurerRessourcesAdmin(', '{'),
  bloc(F_ADMIN, 'function ouvrirEtapeAdmin(', '{')
].join('\n');

/* La validation de clé, telle qu'elle vit dans api.js. */
const SRC_CLES = [
  ligne(F_API, 'const CLE_SONDE_ID'),
  ligne(F_API, 'const MESSAGE_VERIF_IMPOSSIBLE'),
  bloc(F_API, 'function texteNuCle(', '{'),
  bloc(F_API, 'function estRefusCle(', '{'),
  bloc(F_API, 'function estRefusCleExplicite(', '{'),
  bloc(F_API, 'function estReponseSentinelleCle(', '{'),
  bloc(F_API, 'async function apiPost(', '{'),
  bloc(F_API, 'function lireCleLocale(', '{'),
  bloc(F_API, 'function definirCleLocale(', '{'),
  bloc(F_API, 'async function cleValide(', '{'),
  bloc(F_API, 'async function connexion(', '{')
].join('\n');

const F_AUTORISATION = 'js/admin-autorisation.js';

/* La VRAIE feuille d'autorisation : c'est elle qui porte le contrôle de fraîcheur. */
const SRC_AUTORISATION = [
  ligne(F_AUTORISATION, 'var autorisationRevision'),
  ligne(F_AUTORISATION, 'var autorisationRevisionLue'),
  bloc(F_AUTORISATION, 'async function majAutorisation(', '{')
].join('\n');

/* Le chemin d'enregistrement des champs `org_*` et la porte unique de relecture (R2A). */
const SRC_REVISIONS = [
  ligne(F_AUTORISATION, 'var autorisationRevision'),
  ligne(F_AUTORISATION, 'var autorisationRevisionLue')
].join('\n');
const SRC_RELIRE = bloc(F_AUTORISATION, 'async function relireAutorisation(', '{');
const SRC_ENREGISTRER = bloc(F_AUTORISATION, 'async function onEnregistrerAutorisation(', '{');

const SRC_DEPART = bloc(F_ECRANS, 'function ecransEcranDeDepart(', '{');
const SRC_ENVOI = bloc(F_FEUILLE, 'async function onEnvoyerFeuilleJour(', '{');

/* Le parcours mobile (verrou compris) — les mêmes blocs que le garde-fou R-098. */
const SRC_ETAPES_MOBILE = bloc(F_ASSISTANT, 'const ASSISTANT_ETAPES', '[');
const SRC_VERROU_MOBILE = [
  SRC_ETAPES_MOBILE,
  bloc(F_ASSISTANT, 'const ASSISTANT_CLES_CERVEAU', '{'),
  ligne(F_ASSISTANT, 'let assistantIndex'),
  ligne(F_ASSISTANT, 'let assistantAtteint'),
  bloc(F_ASSISTANT, 'function assistantRaisonsModifs(', '{'),
  bloc(F_ASSISTANT, 'function assistantRaisonsEtape(', '{'),
  bloc(F_ASSISTANT, 'function allerA(', '{')
].join('\n');

/* ========================================================================== */
/*  DOUBLURES — un DOM minimal, un faux réseau, un faux stockage.             */
/* ========================================================================== */

function fabriquerClassList() {
  const noms = new Set();
  return {
    contains: (n) => noms.has(n),
    add: (n) => noms.add(n),
    remove: (n) => noms.delete(n),
    toggle: (n, force) => {
      if (force === undefined) { noms.has(n) ? noms.delete(n) : noms.add(n); }
      else if (force) noms.add(n); else noms.delete(n);
      return noms.has(n);
    }
  };
}

function fauxElement(id) {
  return {
    id: id, innerHTML: '', innerText: '', textContent: '', value: '', disabled: false, hidden: false,
    style: {}, classList: fabriquerClassList(),
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, appendChild() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, scrollIntoView() {}, getBoundingClientRect() {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
  };
}

/** Un `document` qui fabrique les éléments à la demande, et se souvient de ce qu'on lui écrit. */
function fauxDocument(idsAbsents) {
  const absents = new Set(idsAbsents || []);
  const elements = new Map();
  return {
    elements,
    getElementById(id) {
      if (absents.has(id)) return null;
      if (!elements.has(id)) elements.set(id, fauxElement(id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(t) { return fauxElement(t); },
    addEventListener() {},
    body: fauxElement('body')
  };
}

function fauxStockage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear()
  };
}

/* ========================================================================== */
/*  BANCS D'ESSAI                                                             */
/* ========================================================================== */

/**
 * Banc du registre : le VRAI code de chargement différé, avec des lectures doublées dont on
 * décide le sort. `journal` enregistre chaque lecture RÉELLEMENT partie.
 */
function bancRegistre(options) {
  options = options || {};
  const journal = [];
  const sorts = Object.assign({
    clubsInvites: true, dossierAutorisation: true, fichesSponsors: true, relevesSponsors: true
  }, options.sorts || {});
  const enAttente = {};   // id → resolve, pour tenir une lecture EN VOL
  const debuts = [];      // ordre de DÉPART des lectures (pour prouver la sérialisation)
  const valeurs = Object.assign({}, options.valeurs || {});  // ce que la PROCHAINE lecture rapporte
  const etatLu = {};      // id → dernière valeur réellement écrite par une lecture
  const rendus = [];

  const ctx = {
    document: fauxDocument(options.idsAbsents),
    console,
    journal, rendus, sorts, enAttente, debuts, valeurs, etatLu,
    configCourante: { global: {}, categories: [] },
    autorisationRevision: 0,
    autorisationRevisionLue: 0,

    /* Les quatre lectures doublées : elles inscrivent leur résultat comme les vraies. */
    chargerClubsInvites() { return lecture('clubsInvites'); },
    majAutorisation(opt) {
      ctx.dernieresOptionsAutorisation = opt;
      return lecture('dossierAutorisation').then(function (ok) {
        return ok ? { ok: true } : { ok: false, motif: 'reseau' };
      });
    },
    lireFichesSponsors() { return lecture('fichesSponsors'); },
    lireRelevesSponsors() { return lecture('relevesSponsors'); },

    injecterReglagesSponsors() { rendus.push('reglages'); },
    afficherListeSponsors() { rendus.push('liste'); },
    afficherBilanSponsors() { rendus.push('bilan'); },
    majAutorisationSiObsolete() { journal.push('rattrapage'); return Promise.resolve({}); }
  };

  /* ⛔ LECTURE BRUTE, comme les vraies depuis R2 : elle lit, elle ÉCRIT l'état, elle N'INSCRIT
     RIEN dans la mémoire — c'est le registre qui décide seul de ce qui est retenu. */
  function lecture(id) {
    journal.push(id);
    debuts.push(id);
    const valeur = Object.prototype.hasOwnProperty.call(valeurs, id) ? valeurs[id] : null;
    const conclure = function (ok) { etatLu[id] = valeur; return ok; };
    const sort = sorts[id];
    if (sort === 'enVol') {
      return new Promise(function (resoudre) {
        enAttente[id] = function (ok) { resoudre(conclure(ok !== false)); };
      });
    }
    if (sort === 'leve') return Promise.reject(new Error('panne simulée'));
    return Promise.resolve(conclure(!!sort));
  }

  vm.createContext(ctx);
  // ⚠️ `const` / `let` ne deviennent PAS des propriétés du contexte : on les réexporte en `var`
  //    pour pouvoir les inspecter depuis le test.
  vm.runInContext((options.source || SRC_REGISTRE) +
    '\nvar __ADMIN_ETAPES = ADMIN_ETAPES;', ctx);
  ctx.definirAdminConnecte(options.connecte !== false);
  return ctx;
}

/** Banc des clés : le VRAI `cleValide` / `connexion`, avec un faux `fetch`. */
function bancCles(reponse, source) {
  const alertes = [];
  const ctx = {
    console, alertes,
    API_URL: 'https://exemple.invalid/exec',
    sessionStorage: fauxStockage(),
    fetch() {
      if (reponse.reseau === 'panne') return Promise.reject(new TypeError('Failed to fetch'));
      if (reponse.http) {
        return Promise.resolve({ ok: false, status: reponse.http, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(reponse.corps) });
    },
    dialogDemander: () => Promise.resolve(reponse.saisie === undefined ? null : reponse.saisie),
    dialogAlerter: (m) => { alertes.push(String(m)); return Promise.resolve(); }
  };
  vm.createContext(ctx);
  vm.runInContext(source || SRC_CLES, ctx);
  return ctx;
}

/* ========================================================================== */
/*  CONTRÔLES                                                                 */
/* ========================================================================== */

let reussis = 0;
const echecs = [];

function verifier(numero, intitule, condition, detail) {  // `numero` est une CHAÎNE : « 14.10 » ne doit pas s'afficher « 14.1 »
  if (condition) { reussis++; console.log('  ✓ [' + numero + '] ' + intitule); }
  else { echecs.push('[' + numero + '] ' + intitule + (detail ? ' — ' + detail : ''));
         console.log('  ✗ [' + numero + '] ' + intitule + (detail ? ' — ' + detail : '')); }
}

/** Laisse les micro-tâches s'écouler : `assurerRessourceAdmin` lance la lecture sur un
 *  `Promise.resolve().then(...)`, elle n'est donc PAS partie au retour de l'appel. */
function tick() {
  return new Promise(function (r) { setImmediate(r); });
}

function memesElements(a, b) {
  return a.length === b.length && a.slice().sort().join('|') === b.slice().sort().join('|');
}

async function controles() {
  /* ---- ① ② ③ — l'ouverture coûte trois lectures, toujours -------------- */
  console.log('\nOuverture : trois appels garantis');

  const ctxDepart = { localStorage: fauxStockage(), ecransEcranCourant: () => 'sponsors' };
  vm.createContext(ctxDepart);
  vm.runInContext(SRC_DEPART, ctxDepart);

  verifier('1', 'sans préférence : le départ est « infos »',
    ctxDepart.ecransEcranDeDepart() === 'infos');

  ctxDepart.localStorage.setItem('r92_ecran_admin', 'sponsors');
  verifier('2', 'avec r92_ecran_admin=sponsors : le départ reste « infos »',
    ctxDepart.ecransEcranDeDepart() === 'infos');

  verifier('3', '« écran du moment » secondaire : le départ reste « infos »',
    ctxDepart.ecransEcranDeDepart() === 'infos');

  const srcConstruire = bloc(F_ECRANS, 'function construireEcrans(', '{');
  verifier('3.1', 'construireEcrans() ne consulte plus aucune préférence d\'écran',
    srcConstruire.indexOf('ecransEcranDeDepart()') !== -1 &&
    srcConstruire.indexOf('localStorage') === -1,
    'la restauration d\'écran est revenue dans construireEcrans');

  const b0 = bancRegistre();
  await b0.ouvrirEtapeAdmin('infos');
  await b0.ouvrirEtapeAdmin('horaires');
  verifier('3.2', 'l\'écran de départ ne déclenche AUCUNE lecture différée',
    b0.journal.length === 0, 'journal : ' + b0.journal.join(', '));

  /* ---- ④ — navigation explicite : cardinal exact, aucun doublon --------- */
  console.log('\nNavigation explicite');

  const b1 = bancRegistre();
  await b1.ouvrirEtapeAdmin('invitation');
  const apres1 = b1.journal.slice();
  await b1.ouvrirEtapeAdmin('equipes');
  await b1.ouvrirEtapeAdmin('invitation');
  verifier('4.1', 'invitation → 1 listerClubsInvites, aucun doublon au retour',
    memesElements(apres1, ['clubsInvites']) && memesElements(b1.journal, ['clubsInvites']),
    'journal : ' + b1.journal.join(', '));

  await b1.ouvrirEtapeAdmin('autorisation');
  const apres2 = b1.journal.slice();
  await b1.ouvrirEtapeAdmin('invitation');
  await b1.ouvrirEtapeAdmin('autorisation');
  verifier('4.2', 'autorisation → 1 getDossierAutorisation (clubs déjà lus), aucun doublon',
    memesElements(apres2, ['clubsInvites', 'dossierAutorisation']) &&
    b1.journal.filter((x) => x === 'dossierAutorisation').length === 1,
    'journal : ' + b1.journal.join(', '));

  const b2 = bancRegistre();
  await b2.ouvrirEtapeAdmin('sponsors');
  const apresSponsors = b2.journal.slice();
  await b2.ouvrirEtapeAdmin('invitation');
  await b2.ouvrirEtapeAdmin('sponsors');
  verifier('4.3', 'sponsors → les DEUX lectures partent ensemble, aucun doublon au retour',
    memesElements(apresSponsors, ['fichesSponsors', 'relevesSponsors']) &&
    b2.journal.filter((x) => x === 'fichesSponsors').length === 1 &&
    b2.journal.filter((x) => x === 'relevesSponsors').length === 1,
    'journal : ' + b2.journal.join(', '));

  verifier('4.4', 'le bilan Partenaires n\'est peint qu\'APRÈS les deux lectures',
    b2.rendus.indexOf('bilan') > b2.rendus.indexOf('reglages'),
    'rendus : ' + b2.rendus.join(', '));

  const b3 = bancRegistre({ sorts: { clubsInvites: 'enVol' } });
  const v1 = b3.ouvrirEtapeAdmin('invitation');
  const v2 = b3.ouvrirEtapeAdmin('invitation');
  const v3 = b3.ouvrirEtapeAdmin('dossier');
  await tick();
  b3.enAttente.clubsInvites(true);
  await Promise.all([v1, v2, v3]);
  verifier('4.5', 'trois arrivées pendant une lecture EN VOL → une seule requête',
    b3.journal.filter((x) => x === 'clubsInvites').length === 1,
    'journal : ' + b3.journal.join(', '));

  /* ---- ⑤ — verrouiller ferme les lectures ------------------------------ */
  console.log('\nVerrouillage');

  const b4 = bancRegistre();
  await b4.ouvrirEtapeAdmin('invitation');
  b4.definirAdminConnecte(false);
  const avantVerrou = b4.journal.length;
  await b4.ouvrirEtapeAdmin('sponsors');
  await b4.ouvrirEtapeAdmin('autorisation');
  await b4.ouvrirEtapeAdmin('dossier');
  verifier('5.1', 'déconnecté : aucune lecture protégée ne part',
    b4.journal.length === avantVerrou, 'journal : ' + b4.journal.join(', '));

  verifier('5.2', 'déconnecté : aucun rattrapage d\'obsolescence non plus',
    b4.journal.indexOf('rattrapage') === -1);

  const srcVerrouiller = bloc(F_ADMIN, 'async function onClicConnexion(', '{');
  verifier('5.3', '« Verrouiller » coupe adminConnecte',
    /bouton-verrouiller[\s\S]{0,400}definirAdminConnecte\(false\)/.test(srcVerrouiller),
    'la coupure de session a disparu du bouton Verrouiller');
  verifier('5.4', '« Se connecter » recharge, sans sonde',
    /bouton-se-connecter[\s\S]{0,600}rechargerLaPage\(\)/.test(srcVerrouiller) &&
    srcVerrouiller.indexOf("connexion('admin'") === -1,
    'la sonde admin est revenue dans la reconnexion');

  /* ---- ⑥ ⑦ — cohérence de la mémoire après rafraîchissement ------------ */
  console.log('\nMémoire après rafraîchissement');

  const b5 = bancRegistre();
  await b5.ouvrirEtapeAdmin('invitation');                 // chargé
  b5.sorts.clubsInvites = false;                           // le rafraîchissement échouera
  await b5.rafraichirRessourceAdmin('clubsInvites');       // rafraîchissement EXPLICITE, raté
  verifier('6.1', 'clubs : un rafraîchissement raté efface la marque « chargé »',
    b5.ressourceAdminChargee('clubsInvites') === false);
  b5.sorts.clubsInvites = true;
  const avant6 = b5.journal.length;
  await b5.ouvrirEtapeAdmin('invitation');
  await b5.ouvrirEtapeAdmin('equipes');
  await b5.ouvrirEtapeAdmin('invitation');
  verifier('6.2', 'clubs : retour sur l\'écran → EXACTEMENT une nouvelle tentative',
    b5.journal.length - avant6 === 1, 'lectures ajoutées : ' + (b5.journal.length - avant6));

  const b6 = bancRegistre();
  await b6.ouvrirEtapeAdmin('sponsors');                   // les deux chargées
  b6.sorts.relevesSponsors = false;
  await b6.rafraichirRessourceAdmin('relevesSponsors');    // « Rafraîchir le bilan », raté
  verifier('7.1', 'sponsors : seule la lecture ratée perd sa marque',
    b6.ressourceAdminChargee('fichesSponsors') === true &&
    b6.ressourceAdminChargee('relevesSponsors') === false);
  b6.sorts.relevesSponsors = true;
  const avant7 = b6.journal.slice();
  await b6.ouvrirEtapeAdmin('equipes');
  await b6.ouvrirEtapeAdmin('sponsors');
  const ajoutes = b6.journal.slice(avant7.length);
  verifier('7.2', 'sponsors : le retour ne relit QUE les relevés',
    memesElements(ajoutes, ['relevesSponsors']), 'lectures ajoutées : ' + ajoutes.join(', '));

  const b7 = bancRegistre();
  await b7.ouvrirEtapeAdmin('autorisation');
  b7.sorts.dossierAutorisation = false;
  await b7.rafraichirRessourceAdmin('dossierAutorisation'); // relecture explicite ratée
  verifier('7.3', 'autorisation : une relecture explicite ratée efface la marque',
    b7.ressourceAdminChargee('dossierAutorisation') === false);
  b7.sorts.dossierAutorisation = true;
  const avant73 = b7.journal.length;
  await b7.ouvrirEtapeAdmin('invitation');
  await b7.ouvrirEtapeAdmin('autorisation');
  verifier('7.4', 'autorisation : retour sur l\'écran → une seule nouvelle tentative',
    b7.journal.filter((x) => x === 'dossierAutorisation').length - 2 === 1,
    'journal : ' + b7.journal.join(', '));

  const b8 = bancRegistre({ sorts: { clubsInvites: 'leve' } });
  await b8.ouvrirEtapeAdmin('invitation');
  verifier('7.5', 'une lecture qui LÈVE ne marque jamais « chargé »',
    b8.ressourceAdminChargee('clubsInvites') === false);

  /* ---- ⑧ — envoi de la feuille : échec fermé --------------------------- */
  console.log('\nFeuille de journée : échec fermé');

  function bancEnvoi(clubsLus) {
    const trace = { messages: [], confirmations: 0, envois: 0 };
    const ctx = {
      console, trace,
      document: fauxDocument(),
      clubsInvitesCourants: [],
      lignesFeuilleJour: () => [{ score: '3-0' }],
      afficherMessage: (z, t) => trace.messages.push(String(t)),
      assurerRessourceAdmin: () => Promise.resolve(clubsLus),
      estAccepte: () => true,
      dialogConfirmer: () => { trace.confirmations++; return Promise.resolve(true); },
      avecBoutonOccupe: async (b, m, f) => { await f(); },
      apiPostProtege: () => { trace.envois++; return Promise.resolve({ envoyes: 0 }); },
      titreFeuilleJour: () => ({ nom: 'x', date: '' }),
      htmlEmailFeuilleJour: () => '', texteEmailFeuilleJour: () => '',
      majFeuilleJour: () => {}, echapper: (s) => String(s)
    };
    vm.createContext(ctx);
    vm.runInContext(SRC_ENVOI, ctx);
    return ctx;
  }

  const e1 = bancEnvoi(false);
  await e1.onEnvoyerFeuilleJour();
  const msg1 = e1.trace.messages.join(' | ');
  verifier('8.1', 'lecture des clubs en échec : envoi ANNULÉ (aucun appel d\'envoi)',
    e1.trace.envois === 0);
  verifier('8.2', 'lecture en échec : aucune confirmation ouverte',
    e1.trace.confirmations === 0);
  verifier('8.3', 'lecture en échec : le message ne dit JAMAIS « Aucun club accepté »',
    msg1.indexOf('Aucun club accepté') === -1 && /impossible de lire/i.test(msg1),
    'message : ' + msg1);

  const e2 = bancEnvoi(true);          // lecture réussie, mais zéro destinataire
  await e2.onEnvoyerFeuilleJour();
  verifier('8.4', 'lecture réussie et zéro destinataire : « Aucun club accepté » est permis',
    e2.trace.envois === 0 && e2.trace.messages.join(' | ').indexOf('Aucun club accepté') !== -1,
    'message : ' + e2.trace.messages.join(' | '));

  /* ---- ⑨ ⑩ ⑪ — la clé n'est acceptée que sur preuve -------------------- */
  console.log('\nValidation de clé');

  const essai = async (corps, role) => {
    const ctx = bancCles(corps);
    try { return { valeur: await ctx.cleValide(role || 'admin', 'CLE-DE-TEST') }; }
    catch (e) { return { leve: e.message }; }
  };

  const r9 = await essai({ corps: { error: 'Équipe introuvable : __verif_cle__' } });
  verifier('9.1', 'sentinelle admin avec jeton dans le message → acceptée', r9.valeur === true);

  const r9b = await essai({ corps: { error: 'Match introuvable : __verif_cle__' } }, 'scores');
  verifier('9.2', 'sentinelle scores avec jeton → acceptée', r9b.valeur === true);

  const r9c = await essai({ corps: { error: 'Équipe introuvable.', id_equipe: '__verif_cle__' } });
  verifier('9.3', 'jeton dans un champ structuré → acceptée', r9c.valeur === true);

  const r10 = await essai({ corps: { error: 'Équipe introuvable.' } });
  verifier('10.1', 'même libellé SANS jeton → erreur levée (plus de repli)', !!r10.leve,
    'résultat : ' + JSON.stringify(r10));

  const r10b = await essai({ corps: { error: 'Équipe introuvable : autre-chose' } });
  verifier('10.2', 'jeton DIFFÉRENT → erreur levée', !!r10b.leve, 'résultat : ' + JSON.stringify(r10b));

  const r10c = await essai({ corps: { error: 'Match introuvable : __verif_cle__' } }); // rôle admin
  verifier('10.3', 'libellé du MAUVAIS rôle → erreur levée', !!r10c.leve);

  const r11 = await essai({ corps: { error: 'Clé incorrecte', acces_refuse: true } });
  verifier('11.1', 'refus explicite → false (jamais une erreur)', r11.valeur === false);

  const r11b = await essai({ reseau: 'panne' });
  verifier('11.2', 'panne réseau → erreur levée', !!r11b.leve);

  const r11c = await essai({ http: 500 });
  verifier('11.3', 'erreur HTTP → erreur levée', !!r11c.leve);

  const r11d = await essai({ corps: { ok: true } });
  verifier('11.4', 'succès nu → erreur levée', !!r11d.leve);

  const r11e = await essai({ corps: { error: 'Quota journalier dépassé' } });
  verifier('11.5', 'erreur métier inattendue → erreur levée', !!r11e.leve);

  const ctxCo = bancCles({ reseau: 'panne', saisie: 'CLE-DE-TEST' });
  ctxCo.sessionStorage.setItem('r92_cle_scores', 'MEMO');
  const co = await ctxCo.connexion('scores', 'de test');
  verifier('11.6', 'connexion() sur panne : jamais connecté, message technique',
    co === false && /technique/i.test(ctxCo.alertes.join(' ')),
    'retour ' + co + ' / alertes : ' + ctxCo.alertes.join(' | '));

  const ctxCo2 = bancCles({ corps: { error: 'Clé incorrecte', acces_refuse: true }, saisie: null });
  ctxCo2.sessionStorage.setItem('r92_cle_admin', 'MEMO-REFUSEE');
  await ctxCo2.connexion('admin', "à l'administration");
  verifier('11.7', 'clé de session refusée : elle est OUBLIÉE',
    ctxCo2.sessionStorage.getItem('r92_cle_admin') === '',
    'valeur : ' + JSON.stringify(ctxCo2.sessionStorage.getItem('r92_cle_admin')));

  /* ---- ⑫ — ordinateur et mobile passent par la même logique ------------ */
  console.log('\nParcours ordinateur et mobile');

  const srcActiver = bloc(F_ECRANS, 'function ecransActiver(', '{');
  const srcAllerA = bloc(F_ASSISTANT, 'function allerA(', '{');
  verifier('12.1', 'ecransActiver() passe par ouvrirEtapeAdmin',
    srcActiver.indexOf('ouvrirEtapeAdmin(') !== -1);
  verifier('12.2', 'allerA() passe par ouvrirEtapeAdmin',
    srcAllerA.indexOf('ouvrirEtapeAdmin(') !== -1);
  verifier('12.3', 'aucun crochet d\'obsolescence en double dans les deux parcours',
    srcActiver.indexOf('majAutorisationSiObsolete') === -1 &&
    srcAllerA.indexOf('majAutorisationSiObsolete') === -1,
    'un crochet jumeau est revenu — c\'est ce qui avait produit R-098');

  const idsEcrans = vm.runInNewContext(bloc(F_ECRANS, 'const ECRANS_DEF', '[') + '\nECRANS_DEF;')
    .map((e) => e.id);
  const idsMobile = vm.runInNewContext(SRC_ETAPES_MOBILE + '\nASSISTANT_ETAPES;').map((e) => e.id);
  const bTable = bancRegistre();
  const avecRessources = Object.keys(bTable.__ADMIN_ETAPES);
  verifier('12.4', 'les étapes à ressources existent dans les DEUX vocabulaires',
    avecRessources.every((id) => idsEcrans.indexOf(id) !== -1 && idsMobile.indexOf(id) !== -1),
    'étapes : ' + avecRessources.join(', '));

  const parcours = async (ids) => {
    const b = bancRegistre();
    for (const id of ids) await b.ouvrirEtapeAdmin(id);
    return b.journal.slice();
  };
  const jOrdi = await parcours(['infos', 'invitation', 'dossier', 'autorisation', 'sponsors']);
  const jMobile = await parcours(['infos', 'invitation', 'dossier', 'autorisation', 'sponsors']);
  verifier('12.5', 'le même parcours coûte exactement 4 lectures, ordinateur comme mobile',
    jOrdi.length === 4 && memesElements(jOrdi, jMobile) &&
    memesElements(jOrdi, ['clubsInvites', 'dossierAutorisation', 'fichesSponsors', 'relevesSponsors']),
    'ordinateur : ' + jOrdi.join(', ') + ' / mobile : ' + jMobile.join(', '));

  /* Verrou mobile : le VRAI `allerA`, sur un tournoi vide. */
  const ctxM = {
    console,
    document: Object.assign(fauxDocument(), { querySelectorAll: () => [] }),
    calculerEtatsEtapes: () => ['horaires', 'categories', 'equipes', 'terrains', 'poules', 'apresmidi']
      .map((cle) => ({ cle, titre: cle, statut: 'afaire', detail: 'témoin' })),
    raisonsModifsDans: () => [],
    assistantZonesSurveillees: () => [],
    assistantSecouerVerrou: () => {},
    assistantMajVerrou: () => {},
    ajusterHauteur: () => {},
    ouvrirEtapeAdmin: () => Promise.resolve([]),
    window: { scrollTo() {} }
  };
  vm.createContext(ctxM);
  vm.runInContext(SRC_VERROU_MOBILE +
    '\nvar __ETAPES = ASSISTANT_ETAPES;\nfunction __carte() { return ASSISTANT_ETAPES[assistantIndex].id; }',
    ctxM);
  const iDe = (id) => ctxM.__ETAPES.findIndex((e) => e.id === id);
  ctxM.allerA(iDe('equipes'), 1);
  const apresEquipes = ctxM.__carte();
  ctxM.allerA(iDe('resume'), 1);
  const apresResume = ctxM.__carte();
  ctxM.allerA(iDe('publication'), 1);
  const apresPublication = ctxM.__carte();
  verifier('12.6', 'mobile, tournoi vide : « Équipes » est refusé',
    apresEquipes !== 'equipes', 'arrivé sur ' + apresEquipes);
  verifier('12.7', 'mobile : « Résumé » (qui porte la réinitialisation) reste hors de portée',
    apresResume !== 'resume', 'arrivé sur ' + apresResume);
  verifier('12.8', 'mobile : la carte LIBRE « Publication » reste joignable',
    apresPublication === 'publication', 'arrivé sur ' + apresPublication);


  /* ---- ⑭ — concurrence entre lectures (R2) ---------------------------- */
  console.log('\nConcurrence : lecture en vol contre rafraîchissement forcé');

  /** Déroule le scénario « A en vol, écriture, B forcé » sur une ressource donnée. */
  async function scenarioAB(id) {
    const c = bancRegistre({ sorts: {}, valeurs: {} });
    c.sorts[id] = 'enVol';
    c.valeurs[id] = 'ancien';
    const A = c.assurerRessourceAdmin(id);       // lecture NORMALE de navigation
    await tick();                                 // …elle est partie
    const departsAvantB = c.debuts.length;
    c.valeurs[id] = 'frais';                      // ⚡ l'écriture a eu lieu
    const B = c.rafraichirRessourceAdmin(id);     // rafraîchissement EXIGÉ après écriture
    const partageAB = (A === B);
    const BPartieTropTot = c.debuts.length !== departsAvantB;
    c.enAttente[id](true);                        // A rend l'ANCIEN état
    await tick();
    const chargeeApresA = c.ressourceAdminChargee(id);
    const departsApresA = c.debuts.length;
    c.enAttente[id](true);                        // B rend le FRAIS
    const okB = await B;
    await A.catch(function () {});
    return { c, id, partageAB, BPartieTropTot: BPartieTropTot, chargeeApresA, departsApresA, okB };
  }

  const sc = await scenarioAB('clubsInvites');
  verifier('14.1', 'clubs : le rafraîchissement forcé ne réutilise PAS la lecture en vol',
    sc.partageAB === false);
  verifier('14.2', 'clubs : il attend cette lecture au lieu de partir en parallèle',
    sc.BPartieTropTot === false);
  verifier('14.3', 'clubs : une réponse ANCIENNE ne remet pas la ressource « chargée »',
    sc.chargeeApresA === false);
  verifier('14.4', 'clubs : exactement UNE lecture fraîche derrière l\'ancienne',
    sc.departsApresA === 2 && sc.c.journal.filter(function (x) { return x === 'clubsInvites'; }).length === 2,
    'départs : ' + sc.c.debuts.join(', '));
  verifier('14.5', 'clubs : l\'état final est celui de B, jamais celui de A',
    sc.c.etatLu.clubsInvites === 'frais' && sc.okB === true,
    'état final : ' + sc.c.etatLu.clubsInvites);

  const scS = await scenarioAB('relevesSponsors');
  verifier('14.6', 'sous-lecture Partenaires : mêmes garanties (pas de partage, une seule fraîche)',
    scS.partageAB === false && scS.BPartieTropTot === false && scS.departsApresA === 2);
  verifier('14.7', 'sous-lecture Partenaires : l\'état final est celui de B',
    scS.c.etatLu.relevesSponsors === 'frais' && scS.chargeeApresA === false);

  const scF = await scenarioAB('fichesSponsors');
  verifier('14.8', 'fiches Partenaires : mêmes garanties',
    scF.partageAB === false && scF.departsApresA === 2 && scF.c.etatLu.fichesSponsors === 'frais');

  const scA = await scenarioAB('dossierAutorisation');
  verifier('14.9', 'autorisation : mêmes garanties',
    scA.partageAB === false && scA.departsApresA === 2 && scA.c.etatLu.dossierAutorisation === 'frais');

  /* Regroupement : plusieurs écritures rapprochées ⇒ UNE seule lecture fraîche. */
  const cg = bancRegistre({ sorts: { clubsInvites: 'enVol' } });
  const Ag = cg.assurerRessourceAdmin('clubsInvites');
  await tick();
  const B1 = cg.rafraichirRessourceAdmin('clubsInvites');
  const B2 = cg.rafraichirRessourceAdmin('clubsInvites');
  const B3 = cg.rafraichirRessourceAdmin('clubsInvites');
  verifier('14.10', 'trois rafraîchissements forcés simultanés se REGROUPENT',
    B1 === B2 && B2 === B3);
  cg.enAttente.clubsInvites(true); await tick();
  cg.enAttente.clubsInvites(true);
  await Promise.all([Ag, B1]);
  verifier('14.11', 'le regroupement ne coûte qu\'UNE lecture fraîche (2 au total)',
    cg.journal.filter(function (x) { return x === 'clubsInvites'; }).length === 2,
    'journal : ' + cg.journal.join(', '));

  /* Une lecture normale arrivant pendant la fraîche la PARTAGE (pas de troisième requête). */
  const cn = bancRegistre({ sorts: { clubsInvites: 'enVol' } });
  const An = cn.assurerRessourceAdmin('clubsInvites'); await tick();
  const Bn = cn.rafraichirRessourceAdmin('clubsInvites');
  const Nn = cn.assurerRessourceAdmin('clubsInvites');   // navigation pendant l'attente
  verifier('14.12', 'une navigation pendant l\'attente partage la lecture fraîche',
    Nn === Bn);
  cn.enAttente.clubsInvites(true); await tick();
  cn.enAttente.clubsInvites(true);
  await Promise.all([An, Bn, Nn]);
  verifier('14.13', 'toujours 2 lectures, pas 3',
    cn.journal.filter(function (x) { return x === 'clubsInvites'; }).length === 2);

  /* La VRAIE feuille FFR : une écriture pendant le trajet ⇒ rien n'est peint. */
  console.log('\nAutorisation : réponse dépassée pendant son trajet');

  function bancAutorisation(ecrirePendantLeTrajet) {
    const doc = fauxDocument();
    const ctx = {
      console, document: doc,
      configCourante: { global: {}, categories: [] },
      chargerClubsInvites: () => Promise.resolve(true),
      lireFichesSponsors: () => Promise.resolve(true),
      lireRelevesSponsors: () => Promise.resolve(true),
      injecterReglagesSponsors() {}, afficherListeSponsors() {}, afficherBilanSponsors() {},
      majAutorisationSiObsolete: () => Promise.resolve({}),
      rendreFeuilleAutorisation: () => '<feuille/>',
      rendreSaisieAutorisation: () => '<saisie/>',
      questionsDejaRepondues: () => ({}),
      autorisationSaisieModifiee: () => false,
      autorisationPhotographierSaisie() {},
      apiPostProtege() {
        return Promise.resolve().then(function () {
          // ⚡ Une écriture survient PENDANT le trajet de la lecture.
          if (ecrirePendantLeTrajet) ctx.autorisationRevision++;
          return { dossier: { questions: {} } };
        });
      }
    };
    vm.createContext(ctx);
    vm.runInContext(SRC_AUTORISATION + '\n' + SRC_REGISTRE, ctx);
    ctx.definirAdminConnecte(true);
    return ctx;
  }

  const aTranquille = bancAutorisation(false);
  await aTranquille.assurerRessourceAdmin('dossierAutorisation');
  verifier('14.14', 'sans écriture concurrente : la feuille EST peinte et la ressource chargée',
    aTranquille.document.getElementById('autorisation-feuille').innerHTML === '<feuille/>' &&
    aTranquille.ressourceAdminChargee('dossierAutorisation') === true);

  const aBousculee = bancAutorisation(true);
  await aBousculee.assurerRessourceAdmin('dossierAutorisation');
  verifier('14.15', 'écriture pendant le trajet : AUCUNE réponse dépassée n\'est peinte',
    aBousculee.document.getElementById('autorisation-feuille').innerHTML === '',
    'contenu peint : ' + JSON.stringify(aBousculee.document.getElementById('autorisation-feuille').innerHTML));
  verifier('14.16', 'écriture pendant le trajet : la ressource reste « à relire »',
    aBousculee.ressourceAdminChargee('dossierAutorisation') === false);

  /* Sentinelles croisées entre rôles. */
  console.log('\nSentinelle : le champ structuré est lié au rôle');

  const x1 = await essai({ corps: { error: 'Équipe introuvable.', id_match: '__verif_cle__' } }, 'admin');
  verifier('14.17', 'admin + id_match=__verif_cle__ → erreur levée', !!x1.leve,
    'résultat : ' + JSON.stringify(x1));
  const x2 = await essai({ corps: { error: 'Match introuvable.', id_equipe: '__verif_cle__' } }, 'scores');
  verifier('14.18', 'scores + id_equipe=__verif_cle__ → erreur levée', !!x2.leve,
    'résultat : ' + JSON.stringify(x2));
  const x3 = await essai({ corps: { error: 'Match introuvable.', id_match: '__verif_cle__' } }, 'scores');
  verifier('14.19', 'scores + id_match=__verif_cle__ → acceptée (témoin positif)', x3.valeur === true);
  const x4 = await essai({ corps: { error: 'Équipe introuvable.', id: '__verif_cle__' } }, 'admin');
  verifier('14.20', 'champ générique « id » : plus reconnu → erreur levée', !!x4.leve);


  /* ---- ⑮ — relecture après enregistrement des champs (R2A) ------------- */
  console.log('\nEnregistrement des champs : la relecture passe par la file');

  /**
   * Banc du chemin RÉEL : `onEnregistrerAutorisation` → `relireAutorisation` →
   * `enfilerLectureAdmin` → registre. ⛔ Seule `majAutorisation` est doublée, pour tenir une
   * lecture en vol et choisir son verdict — tout le reste est le vrai code.
   */
  function bancEnregistrement() {
    const trace = { lectures: [], messages: [], rattrapages: 0, ecritures: 0, simultanees: 0 };
    const attentes = [];          // résolveurs des lectures tenues en vol
    let enVol = 0;
    const doc = fauxDocument();
    const form = fauxElement('form-autorisation');
    form.elements = [];           // aucun champ `org_*` : le corps envoyé est vide, c'est sans effet ici
    doc.elements.set('form-autorisation', form);

    const ctx = {
      console, trace, attentes,
      document: doc,
      configCourante: { global: {}, categories: [] },
      avecBoutonOccupe: async function (b, m, f) { await f(); },
      ecrireAdmin: function () { trace.ecritures++; return Promise.resolve({ ok: true }); },
      lireConfigAdmin: function () { return Promise.resolve({ global: {}, categories: [] }); },
      afficherMessage: function (z, t) { trace.messages.push(String(t)); },
      invaliderFeuilleAutorisationAffichee: function () {},
      signalerAutorisationObsolete: function () { ctx.autorisationRevision++; },
      majAutorisationSiObsolete: function () { trace.rattrapages++; return Promise.resolve({}); },
      /* La lecture BRUTE, doublée : elle se tient en vol jusqu'à ce qu'on la libère. */
      majAutorisation: function (opt) {
        trace.lectures.push(opt && opt.revisionCible);
        enVol++;
        if (enVol > 1) trace.simultanees++;   // ⛔ deux lectures d'une même ressource ensemble
        return new Promise(function (resoudre) {
          attentes.push(function (bilan) { enVol--; resoudre(bilan); });
        });
      }
    };
    vm.createContext(ctx);
    vm.runInContext([SRC_REVISIONS, SRC_REGISTRE, SRC_RELIRE, SRC_ENREGISTRER].join('\n'), ctx);
    ctx.definirAdminConnecte(true);
    /** Libère la plus ancienne lecture en vol avec le bilan donné. */
    ctx.liberer = function (bilan) { (attentes.shift() || function () {})(bilan); };
    return ctx;
  }

  /** Déroule : navigation en vol → enregistrement → relecture, et rend le verdict choisi. */
  async function scenarioEnregistrement(bilanRelecture) {
    const b = bancEnregistrement();
    const nav = b.assurerRessourceAdmin('dossierAutorisation');   // ① lecture déjà EN VOL
    await tick();
    const lecturesAvant = b.trace.lectures.length;                // 1
    const enreg = b.onEnregistrerAutorisation();                  // ② + ③ écriture puis relecture
    await tick(); await tick();
    const pendantAttente = b.trace.lectures.length;               // ④ elle n'est pas partie
    const ecrituresAvantLiberation = b.trace.ecritures;
    b.liberer({ ok: true });                                       // la navigation rend
    await tick(); await tick();
    const apresLiberation = b.trace.lectures.length;              // ④ elle part maintenant
    // ⭐ Photo de la mémoire AVANT le verdict de la relecture : c'est elle qui permet de dire
    //   « touchée » ou « pas touchée » — ⛔ supposer une valeur d'arrivée ne prouverait rien.
    const chargeeAvantRelecture = b.ressourceAdminChargee('dossierAutorisation');
    b.liberer(bilanRelecture);                                     // la relecture rend
    await enreg;
    await nav;
    return { b, lecturesAvant, pendantAttente, apresLiberation, ecrituresAvantLiberation,
             chargeeAvantRelecture };
  }

  const okRelecture = await scenarioEnregistrement({ ok: true });
  verifier('15.1', 'l\'écriture est acquise avant toute relecture',
    okRelecture.ecrituresAvantLiberation === 1 && okRelecture.lecturesAvant === 1);
  verifier('15.2', 'la relecture ATTEND la lecture déjà en vol (elle ne part pas)',
    okRelecture.pendantAttente === 1, 'lectures : ' + okRelecture.b.trace.lectures.join(', '));
  verifier('15.3', 'elle part ensuite EXACTEMENT une fois',
    okRelecture.apresLiberation === 2 && okRelecture.b.trace.lectures.length === 2,
    'lectures : ' + okRelecture.b.trace.lectures.join(', '));
  verifier('15.4', 'aucune lecture simultanée à aucun moment',
    okRelecture.b.trace.simultanees === 0);
  verifier('15.5', 'la relecture porte bien la CIBLE de cette écriture',
    okRelecture.b.trace.lectures[1] === 1, 'cible transmise : ' + okRelecture.b.trace.lectures[1]);
  verifier('15.6', 'réussite : la bonne révision est marquée lue et la ressource est chargée',
    okRelecture.b.autorisationRevisionLue === 1 &&
    okRelecture.b.ressourceAdminChargee('dossierAutorisation') === true,
    'revisionLue : ' + okRelecture.b.autorisationRevisionLue);
  verifier('15.7', 'réussite : l\'enregistrement est annoncé réussi, sans avertissement',
    /Champs enregistrés\.$/.test(okRelecture.b.trace.messages.join('')),
    'message : ' + okRelecture.b.trace.messages.join(' | '));

  const panne = await scenarioEnregistrement({ ok: false, motif: 'reseau' });
  verifier('15.8', 'panne : la ressource reste À RELIRE',
    panne.b.ressourceAdminChargee('dossierAutorisation') === false);
  verifier('15.9', 'panne : la révision n\'est PAS avancée',
    panne.b.autorisationRevisionLue === 0, 'revisionLue : ' + panne.b.autorisationRevisionLue);
  verifier('15.10', 'panne : l\'enregistrement métier reste annoncé RÉUSSI, avec l\'avertissement',
    /Champs enregistrés/.test(panne.b.trace.messages.join('')) &&
    /n'a pas pu être relue/.test(panne.b.trace.messages.join('')),
    'message : ' + panne.b.trace.messages.join(' | '));

  const depassee = await scenarioEnregistrement({ ok: false, motif: 'revision-depassee' });
  verifier('15.11', 'cible dépassée : le rattrapage normal repart',
    depassee.b.trace.rattrapages === 1);
  verifier('15.12', 'cible dépassée : la révision n\'est pas avancée',
    depassee.b.autorisationRevisionLue === 0, 'revisionLue : ' + depassee.b.autorisationRevisionLue);
  // ⛔ « Dépassée » n'est PAS une panne : rien n'a été peint, la dette de révision est intacte et
  //    le rattrapage s'en charge. La mémoire du registre doit donc rester TELLE QUELLE — l'effacer
  //    ferait relire intégralement une feuille que le rattrapage va déjà relire.
  verifier('15.12b', 'cible dépassée : la mémoire du registre n\'est PAS touchée',
    depassee.chargeeAvantRelecture === true &&
    depassee.b.ressourceAdminChargee('dossierAutorisation') === depassee.chargeeAvantRelecture,
    'avant : ' + depassee.chargeeAvantRelecture +
    ' / après : ' + depassee.b.ressourceAdminChargee('dossierAutorisation'));
  verifier('15.12c', 'panne, elle, EFFACE la marque (contraste avec « dépassée »)',
    panne.chargeeAvantRelecture === true &&
    panne.b.ressourceAdminChargee('dossierAutorisation') === false);
  verifier('15.13', 'cible dépassée : pas d\'avertissement de panne (ce n\'en est pas une)',
    !/n'a pas pu être relue/.test(depassee.b.trace.messages.join('')),
    'message : ' + depassee.b.trace.messages.join(' | '));

  /* Garde-fou de structure : plus aucun appel direct à `majAutorisation` hors de la porte. */
  const srcEnreg = bloc(F_AUTORISATION, 'async function onEnregistrerAutorisation(', '{');
  const srcObsolete = bloc(F_AUTORISATION, 'async function majAutorisationSiObsolete(', '{');
  const srcPorte = bloc(F_AUTORISATION, 'async function relireAutorisation(', '{');
  verifier('15.14', 'onEnregistrerAutorisation n\'appelle plus JAMAIS majAutorisation en direct',
    !/majAutorisation\s*\(/.test(srcEnreg) && srcEnreg.indexOf('relireAutorisation(') !== -1,
    'un appel direct est revenu : il contournerait la file de dossierAutorisation');
  verifier('15.15', 'majAutorisationSiObsolete passe lui aussi par la porte unique',
    !/majAutorisation\s*\(/.test(srcObsolete) && srcObsolete.indexOf('relireAutorisation(') !== -1);
  verifier('15.16', 'la porte unique est bien enfilée sur la file de la ressource',
    srcPorte.indexOf("enfilerLectureAdmin('dossierAutorisation'") !== -1 &&
    srcPorte.indexOf("marquerRessourceAdmin('dossierAutorisation'") !== -1);

  /* ---- ⑬ — le harnais se prouve lui-même (série Z) --------------------- */
  console.log('\nPreuve du harnais : le code d\'AVANT doit ÉCHOUER');

  function substituer(src, avant, apres, quoi) {
    if (src.indexOf(avant) === -1) {
      throw new Error('Reconstruction du code d\'AVANT impossible — ancre introuvable (' + quoi +
        ').\n  Le correctif a été réécrit : mets CETTE reconstruction à jour, ne la supprime pas.');
    }
    return src.replace(avant, apres);
  }

  // Z1 — la sentinelle d'avant R1 : repli « aucun jeton ⇒ vrai ».
  const srcAvantSentinelle = substituer(SRC_CLES,
    "  return String(echo || '') === CLE_SONDE_ID;",
    "  if (echo) return String(echo) === CLE_SONDE_ID;\n  return true;",
    'le repli de la sentinelle');
  const ctxZ1 = bancCles({ corps: { error: 'Équipe introuvable.' } }, srcAvantSentinelle);
  let z1Accepte = false;
  try { z1Accepte = (await ctxZ1.cleValide('admin', 'X')) === true; } catch (e) { z1Accepte = false; }
  verifier('13.1', 'Z1 — le code d\'AVANT accepte bien une réponse sans jeton (défaut reproduit)',
    z1Accepte, 'la reconstruction n\'a pas reproduit le défaut : le contrôle 10.1 ne prouve rien');

  // Z2 — le registre d'avant R1 : un échec marquait quand même « chargé ».
  const srcAvantRegistre = substituer(SRC_REGISTRE,
    '      if (etat.enVol === lecture) { marquerRessourceAdmin(id, ok); etat.enVol = null; }',
    '      if (etat.enVol === lecture) { marquerRessourceAdmin(id, true); etat.enVol = null; }',
    'le marquage conditionnel du registre');
  const ctxZ2 = bancRegistre({ sorts: { clubsInvites: false }, source: srcAvantRegistre });
  await ctxZ2.ouvrirEtapeAdmin('invitation');
  const avantZ2 = ctxZ2.journal.length;
  await ctxZ2.ouvrirEtapeAdmin('equipes');
  await ctxZ2.ouvrirEtapeAdmin('invitation');
  verifier('13.2', 'Z2 — le code d\'AVANT ne retente jamais après un échec (défaut reproduit)',
    ctxZ2.journal.length === avantZ2,
    'la reconstruction n\'a pas reproduit le défaut : le contrôle 6.2 ne prouve rien');

  // Z3 — l'écran de départ d'avant R1 : restauration de la préférence.
  const ctxZ3 = { localStorage: fauxStockage(), ecransEcranCourant: () => 'sponsors' };
  ctxZ3.localStorage.setItem('r92_ecran_admin', 'sponsors');
  vm.createContext(ctxZ3);
  vm.runInContext(substituer(SRC_DEPART, "  return 'infos';",
    "  var d = null;\n  try { d = localStorage.getItem('r92_ecran_admin'); } catch (e) {}\n" +
    "  return d || ecransEcranCourant();", 'le départ figé sur infos'), ctxZ3);
  verifier('13.3', 'Z3 — le code d\'AVANT repart sur un écran secondaire (défaut reproduit)',
    ctxZ3.ecransEcranDeDepart() === 'sponsors',
    'la reconstruction n\'a pas reproduit le défaut : les contrôles 1 à 3 ne prouvent rien');

  // Z4 — le registre d'avant R2 : le rafraîchissement forcé PARTAGEAIT la lecture en vol.
  const srcAvantR2 = substituer(SRC_REGISTRE,
    "  if (etat.programmee) return etat.programmee;   // déjà en file et pas encore partie : elle nous couvre",
    "  if (etat.enVol) return etat.enVol;",
    'le refus de partager une lecture commencée avant l\'écriture');
  const cZ4 = bancRegistre({ sorts: { clubsInvites: 'enVol' }, valeurs: { clubsInvites: 'ancien' },
    source: srcAvantR2 });
  const AZ4 = cZ4.assurerRessourceAdmin('clubsInvites');
  await tick();
  cZ4.valeurs.clubsInvites = 'frais';
  const BZ4 = cZ4.rafraichirRessourceAdmin('clubsInvites');
  cZ4.enAttente.clubsInvites(true);
  await Promise.all([AZ4, BZ4]);
  verifier('13.4', 'Z4 — le code d\'AVANT resservait la lecture périmée (défaut reproduit)',
    BZ4 === AZ4 && cZ4.etatLu.clubsInvites === 'ancien' &&
    cZ4.journal.filter(function (x) { return x === 'clubsInvites'; }).length === 1,
    'la reconstruction n\'a pas reproduit le défaut : la section 14 ne prouve rien');

  // Z5 — le chemin d'AVANT R2A : la relecture appelait `majAutorisation` EN DIRECT.
  const srcAvantR2A = substituer(SRC_ENREGISTRER,
    'const bilan = await relireAutorisation({ revisionCible: cible });',
    'const bilan = await majAutorisation({ revisionCible: cible });',
    'la porte unique de relecture');
  const bZ5 = bancEnregistrement();
  vm.runInContext(srcAvantR2A, bZ5);          // remplace le gestionnaire par sa version d'avant
  const navZ5 = bZ5.assurerRessourceAdmin('dossierAutorisation');
  await tick();
  const enregZ5 = bZ5.onEnregistrerAutorisation();
  await tick(); await tick();
  const simultaneesZ5 = bZ5.trace.simultanees;
  bZ5.liberer({ ok: true }); bZ5.liberer({ ok: true });
  await enregZ5.catch(function () {}); await navZ5.catch(function () {});
  verifier('13.5', 'Z5 — le code d\'AVANT lisait EN MÊME TEMPS que la lecture en vol (défaut reproduit)',
    simultaneesZ5 >= 1,
    'la reconstruction n\'a pas reproduit le défaut : la section 15 ne prouve rien');
}

/* ========================================================================== */

controles().then(function () {
  console.log('\n' + '─'.repeat(70));
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + ' contrôle(s) en défaut sur ' +
      (reussis + echecs.length) + ' :');
    echecs.forEach(function (e) { console.log('   · ' + e); });
    process.exit(1);
  }
  console.log('OK — ' + reussis + ' contrôles passés.');
}).catch(function (e) {
  console.error('\nERREUR DU HARNAIS : ' + (e && e.stack || e));
  process.exit(1);
});
