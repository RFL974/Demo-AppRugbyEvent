/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — le parcours d'ajout d'équipe reste récupérable
 *  Chantier CORR-BLOCAGE-LECTURES-ADMIN-DR
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/corr-blocage-lectures-admin-dr.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *
 *  CE QU'IL PROTÈGE — ce que l'organisateur a le droit d'attendre quand il saisit ses équipes :
 *
 *   ① il voit TROIS états distincts, jamais mélangés : « enregistrement en cours »,
 *      « enregistré, actualisation en cours », « enregistré MAIS actualisation échouée » ;
 *   ② un échec de LECTURE ne se déguise jamais en échec d'ÉCRITURE, et rien ne l'invite
 *      jamais à recréer une équipe déjà enregistrée ;
 *   ③ les lectures sont BORNÉES : une lecture qui « pend » finit par rendre la main, au lieu
 *      de geler le bouton et la liste jusqu'au rechargement complet de la page ;
 *   ④ il peut relire la SEULE liste depuis l'écran, sans recharger la page, sans réémettre
 *      d'écriture et sans perdre la saisie qu'il a déjà préparée ;
 *   ⑤ une réponse tardive n'écrase jamais un état plus récent, des clics répétés ne lancent
 *      pas plusieurs lectures, et aucun minuteur ne reste en vie ;
 *   ⑥ une écriture n'est JAMAIS rejouée toute seule ; une issue d'écriture inconnue reste
 *      annoncée comme inconnue ;
 *   ⑦ un « Rafraîchir » raté le DIT, au lieu de laisser un écran périmé se faire passer
 *      pour un écran à jour.
 *
 *  ⛔ CE QU'IL NE PROUVE PAS. Rien ici n'explique ni ne corrige les HTTP 404 observés sur ce
 *  parcours : leur cause n'est PAS établie par ces tests, et aucune assertion de ce fichier n'en
 *  traite. Borner une lecture ne la fait pas réussir — elle échoue plus vite, et de façon
 *  récupérable. ⛔ Rien ici ne démontre non plus la fluidité du parcours RÉEL : ces contrôles
 *  jouent sous doublures, avec une horloge virtuelle. Les budgets de 20 s et 30 s restent des
 *  valeurs NOMINALES à valider en conditions réelles ; les durées connues sont des temps
 *  d'exécution Apps Script, qui ne bornent pas le temps réseau total.
 *
 *  ⭐ IL EXÉCUTE LE CODE RÉEL, extrait de `js/` et joué dans un contexte Node avec des doublures
 *  (DOM minimal, réseau simulé, horloge virtuelle) — comme `ux-init-admin-dr-4a.test.js`.
 *  ⛔ Rien n'est recopié : si une fonction est renommée, l'extraction échoue bruyamment.
 *
 *  ⭐ ET IL SE PROUVE LUI-MÊME (§ 8 et § 9). Le défaut est d'abord REPRODUIT en retirant la
 *  borne de lecture par substitution sur le code réel ; puis neuf mutants doivent chacun faire
 *  tomber au moins un contrôle. Un test qui ne peut pas échouer ne prouve rien.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const F_API = 'js/api.js';
const F_EQUIPES = 'js/admin-equipes.js';
const F_ADMIN = 'js/admin.js';
const F_COMMUN = 'js/commun.js';
const F_HTML = 'admin.html';

/* ========================================================================== */
/*  EXTRACTION — on PREND le code réel, on ne le réécrit jamais.               */
/* ========================================================================== */

function lire(rel) {
  return fs.readFileSync(path.join(RACINE, rel), 'utf8');
}

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

function bloc(rel, entete) {
  const source = lire(rel);
  const debut = situer(source, rel, entete);
  let profondeur = 0;
  for (let i = source.indexOf('{', debut); i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}' && --profondeur === 0) return source.slice(debut, i + 1) + ';';
  }
  throw new Error('Accolades déséquilibrées autour de « ' + entete + ' » dans ' + rel);
}

function ligne(rel, entete) {
  const source = lire(rel);
  const debut = situer(source, rel, entete);
  const fin = source.indexOf(';\n', debut);
  if (fin === -1) throw new Error('Fin de déclaration introuvable : « ' + entete + ' »');
  return source.slice(debut, fin + 1);
}

/** Retire commentaires de ligne et de bloc — on compte du CODE, pas de la prose (comme DR-6F). */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
}

/** Remplace un fragment EXACT, en exigeant qu'il soit présent (sinon la preuve serait creuse). */
function substituer(source, avant, apres, quoi) {
  if (source.indexOf(avant) === -1) {
    throw new Error('Reconstruction impossible (' + quoi + ') : fragment introuvable. ' +
      'Le code a changé — mets ce garde-fou à jour.');
  }
  return source.split(avant).join(apres);
}

/* ---- les briques réelles ------------------------------------------------- */

const SRC_API = [
  ligne(F_API, 'const DELAI_REJEU_404_MS'),
  ligne(F_API, 'const ACTIONS_GET_REJOUABLES'),
  ligne(F_API, 'const ACTIONS_POST_REJOUABLES'),
  bloc(F_API, 'async function envoyerAvecRejeu404('),
  bloc(F_API, 'async function executerAvecRejeuAbandon('),
  bloc(F_API, 'async function apiGet('),
  bloc(F_API, 'async function apiPost('),
  bloc(F_API, 'function lireCleLocale('),
  bloc(F_API, 'function definirCleLocale('),
  bloc(F_API, 'async function demanderCle('),
  bloc(F_API, 'async function apiPostProtege('),
  bloc(F_API, 'function estRefusCle(')
].join('\n');

const SRC_COMMUN = [
  bloc(F_COMMUN, 'function echapper('),
  bloc(F_COMMUN, 'function afficherMessage(')
].join('\n');

const SRC_ETAT_EQUIPES = [
  ligne(F_EQUIPES, 'const DELAI_LECTURE_EQUIPES_MS'),
  ligne(F_EQUIPES, 'let lectureEquipesJeton'),
  ligne(F_EQUIPES, 'let lectureEquipesProprietaire'),
  ligne(F_EQUIPES, 'let equipesOperationsEnCours'),
  ligne(F_EQUIPES, 'let equipesAcquisNonReflete'),
  ligne(F_EQUIPES, 'let equipesListeIncertaine')
].join('\n');

const SRC_RECHARGER = bloc(F_EQUIPES, 'async function rechargerEquipes(');
const SRC_AJOUTER = bloc(F_EQUIPES, 'async function onAjouterEquipe(');
const SRC_ACTUALISER = bloc(F_EQUIPES, 'async function actualiserApresEcriture(');
const SRC_REPRISE = bloc(F_EQUIPES, 'async function onRepriseEquipes(');

const SRC_SUPPRIMER = bloc(F_EQUIPES, 'async function onSupprimerEquipe(');
const SRC_SUPPRIMER_CAT = bloc(F_EQUIPES, 'async function onSupprimerCategorieEquipes(');
const SRC_RENOMMER = bloc(F_EQUIPES, 'async function onEnregistrerNom(');

const SRC_EQUIPES = [
  bloc(F_EQUIPES, 'function effectifSaisi('),
  bloc(F_EQUIPES, 'function estEquipeAuto('),
  bloc(F_EQUIPES, 'function resumeEffectifs('),
  bloc(F_EQUIPES, 'function afficherEquipes('),
  bloc(F_EQUIPES, 'function remplirSelectCategories('),
  bloc(F_EQUIPES, 'function prendreJetonEquipes('),
  bloc(F_EQUIPES, 'function jetonEquipesValide('),
  bloc(F_EQUIPES, 'function listeEquipesIncertaine('),
  bloc(F_EQUIPES, 'function lectureEquipesEnCours('),
  bloc(F_EQUIPES, 'function operationEquipesEnCours('),
  bloc(F_EQUIPES, 'function debuterOperationEquipes('),
  bloc(F_EQUIPES, 'function terminerOperationEquipes('),
  bloc(F_EQUIPES, 'function ajoutPossibleEquipes('),
  bloc(F_EQUIPES, 'function majDisponibiliteAjout('),
  bloc(F_EQUIPES, 'function afficherRepriseEquipes('),
  bloc(F_EQUIPES, 'function masquerRepriseEquipes('),
  bloc(F_EQUIPES, 'function ecritureSansEffetEtabli('),
  bloc(F_EQUIPES, 'function refuserMutationSiIncertain(')
].join('\n');

const SRC_ADMIN = [
  bloc(F_ADMIN, 'async function ecrireAdmin('),
  bloc(F_ADMIN, 'async function lireConfigAdmin('),
  bloc(F_ADMIN, 'function estRefusCleAdmin('),
  ligne(F_ADMIN, 'let adminCleVolatile'),
  ligne(F_ADMIN, 'const DELAI_LECTURE_ADMIN_MS'),
  bloc(F_ADMIN, 'async function ouvrirSessionAdmin('),
  bloc(F_ADMIN, 'async function rechargerEtRendre('),
  bloc(F_ADMIN, 'async function rafraichirAdmin('),
  bloc(F_ADMIN, 'function majHeureAdmin(')
].join('\n');

/* ========================================================================== */
/*  DOUBLURES                                                                  */
/* ========================================================================== */

/** Horloge VIRTUELLE : rien n'attend réellement, tout est piloté par `avancer()`. */
function fabriquerHorloge() {
  let maintenant = 1000;
  let seq = 0;
  const taches = new Map();
  return {
    now: function () { return maintenant; },
    poser: function (fn, ms) { const id = ++seq; taches.set(id, { a: maintenant + (ms || 0), fn: fn }); return id; },
    retirer: function (id) { taches.delete(id); },
    restantes: function () { return taches.size; },
    avancer: async function (ms) {
      const cible = maintenant + ms;
      for (let garde = 0; garde < 10000; garde++) {
        let choisi = null;
        taches.forEach(function (t, id) {
          if (t.a <= cible && (!choisi || t.a < choisi.t.a)) choisi = { id: id, t: t };
        });
        if (!choisi) break;
        maintenant = choisi.t.a;
        taches.delete(choisi.id);
        choisi.t.fn();
        await souffler();
      }
      maintenant = cible;
      await souffler();
    }
  };
}

/** Laisse les micro-tâches (promesses) se dérouler. */
async function souffler() {
  // Le rejeu après expiration ajoute une couche asynchrone (fin de tentative puis tentative neuve).
  // On vide largement la file sans avancer le temps virtuel.
  for (let i = 0; i < 32; i++) await Promise.resolve();
}

function erreurAbandon() {
  const e = new Error('The operation was aborted.');
  e.name = 'AbortError';
  return e;
}

function fabriquerAbortController() {
  return function AbortControllerDouble() {
    const ecouteurs = [];
    this.signal = { aborted: false, _ecouteurs: ecouteurs };
    this.abort = function () {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      ecouteurs.slice().forEach(function (f) { f(); });
    };
  };
}

/**
 * Réseau simulé. Le scénario reçoit la description de chaque émission et rend :
 *   · { statut, corps }            → réponse immédiate
 *   · { statut, corps, apres }     → réponse après `apres` ms d'horloge virtuelle
 *   · { statut, corpsIllisible }   → réponse dont `.json()` lève
 *   · { statut, corpsPend: true }  → en-têtes reçus, CORPS qui ne vient jamais
 *   · 'pend'                       → requête qui ne se dénoue jamais d'elle-même
 */
function fabriquerReseau(horloge) {
  const journal = [];
  let scenario = function () { return { statut: 200, corps: {} }; };
  return {
    journal: journal,
    programmer: function (fn) { scenario = fn; },
    fetch: function (url, reglages) {
      const info = {
        n: journal.length + 1,
        url: String(url),
        methode: (reglages && reglages.method) || 'GET',
        corps: (reglages && reglages.body) || null,
        borne: !!(reglages && reglages.signal)
      };
      try { info.action = info.corps ? JSON.parse(info.corps).action : new URL(info.url).searchParams.get('action'); }
      catch (e) { info.action = null; }
      journal.push(info);
      const plan = scenario(info);
      const signal = reglages && reglages.signal;
      return new Promise(function (resoudre, rejeter) {
        if (signal) {
          if (signal.aborted) { rejeter(erreurAbandon()); return; }
          signal._ecouteurs.push(function () { rejeter(erreurAbandon()); });
        }
        if (plan === 'pend') return;                       // jamais dénouée toute seule
        const livrer = function () { resoudre(fabriquerReponse(plan, signal)); };
        if (plan.apres) horloge.poser(livrer, plan.apres); else livrer();
      });
    }
  };
}

function fabriquerReponse(plan, signal) {
  const statut = plan.statut == null ? 200 : plan.statut;
  return {
    ok: statut >= 200 && statut < 300,
    status: statut,
    json: function () {
      if (plan.corpsIllisible) return Promise.reject(new SyntaxError('Unexpected token < in JSON'));
      if (plan.corpsPend) {
        return new Promise(function (resoudre, rejeter) {
          if (signal) {
            if (signal.aborted) { rejeter(erreurAbandon()); return; }
            signal._ecouteurs.push(function () { rejeter(erreurAbandon()); });
          }
        });
      }
      return Promise.resolve(plan.corps == null ? {} : plan.corps);
    }
  };
}

/* ---- DOM minimal --------------------------------------------------------- */

function fabriquerElement(id) {
  return {
    id: id,
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    disabled: false,
    hidden: false,
    _focus: 0,
    focus: function () { this._focus++; },
    select: function () {},
    setAttribute: function () {},
    getAttribute: function () { return null; },
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    appendChild: function () {}
  };
}

function fabriquerDocument() {
  const elements = new Map();
  ['champ-nom', 'champ-categorie', 'champ-joueurs', 'champ-educateurs', 'bouton-ajouter',
   'message-equipe', 'liste-equipes', 'reprise-equipes', 'bouton-reprise-equipes',
   'aide-categories', 'maj-admin', 'bouton-rafraichir-admin'].forEach(function (id) {
    elements.set(id, fabriquerElement(id));
  });
  elements.get('reprise-equipes').hidden = true;
  elements.get('bouton-reprise-equipes').textContent = 'Actualiser la liste';
  elements.get('bouton-rafraichir-admin').textContent = 'Rafraîchir';
  return {
    _elements: elements,
    getElementById: function (id) { return elements.has(id) ? elements.get(id) : null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function (t) { return fabriquerElement(t); },
    addEventListener: function () {}
  };
}

/* ---- le bac à sable ------------------------------------------------------ */

/**
 * @param {Object} [opt]
 * @param {string} [opt.sourceRecharger]  pour rejouer une variante (reproduction / mutants)
 * @param {string} [opt.sourceActualiser]
 * @param {string} [opt.sourceAjouter]
 * @param {string} [opt.sourceEquipes]
 */
function bac(opt) {
  opt = opt || {};
  const horloge = fabriquerHorloge();
  const reseau = fabriquerReseau(horloge);
  const doc = fabriquerDocument();
  const session = new Map([['r92_cle_admin', 'CLE-DEJA-VALIDEE']]);
  const dialogues = [];

  const ctx = {
    API_URL: 'https://exemple.test/exec',
    document: doc,
    console: { log: function () {}, warn: function () {}, error: function () {} },
    performance: { now: function () { return horloge.now(); } },
    setTimeout: function (fn, ms) { return horloge.poser(fn, ms); },
    clearTimeout: function (id) { horloge.retirer(id); },
    AbortController: fabriquerAbortController(),
    fetch: reseau.fetch,
    URL: URL,
    Date: Date,
    sessionStorage: {
      getItem: function (k) { return session.has(k) ? session.get(k) : null; },
      setItem: function (k, v) { session.set(k, String(v)); }
    },
    /* Doublures d'AFFICHAGE PUR — hors périmètre du défaut. ⛔ Aucune d'elles ne remplace une
       interaction visée : les lectures, les décisions d'état et les gestes restent le code réel. */
    svgIcone: function () { return ''; },
    injecterReglages: function () {}, injecterTerrains: function () {},
    afficherPlanning: function () { ctx._planning++; }, majApresMidi: function () {},
    majFeuilleJour: function () {}, majPublicationPlanning: function () {},
    majInfosTournoi: function () {}, majContactsSecurite: function () {},
    majInvitation: function () {}, majPerfsMotCleClub: function () {},
    majPublication: function () {}, majDossier: function () {},
    majTableauBord: function () { ctx._tableauBord++; },
    dialogDemander: async function (m) { dialogues.push(m); return ctx._cleSaisie; },
    dialogAlerter: async function (m) { dialogues.push(m); },
    dialogConfirmer: async function (m) { dialogues.push(m); return true; },
    estPresente: function (c) { return String(c.presente).toLowerCase() === 'oui'; },
    injecterIcones: function () {},
    /* état de la page */
    configCourante: { global: {}, categories: [{ categorie: 'U10', presente: 'oui' }] },
    equipesCourantes: [],
    matchsCourants: [],
    _tableauBord: 0,
    _planning: 0,
    _cleSaisie: 'CLE-TAPEE'
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  const source = [
    SRC_COMMUN,
    SRC_API,
    SRC_ADMIN,
    SRC_ETAT_EQUIPES,
    opt.sourceEquipes || SRC_EQUIPES,
    opt.sourceRecharger || SRC_RECHARGER,
    opt.sourceActualiser || SRC_ACTUALISER,
    opt.sourceAjouter || SRC_AJOUTER,
    SRC_SUPPRIMER, SRC_SUPPRIMER_CAT, SRC_RENOMMER,
    SRC_REPRISE
  ].join('\n');
  vm.runInContext(source, ctx);

  return {
    ctx: ctx, doc: doc, horloge: horloge, reseau: reseau, dialogues: dialogues,
    /* ⚠️ Les `const` / `let` du code réel sont des liaisons LEXICALES du script : elles
       n'apparaissent pas comme propriétés du contexte. On les lit donc par évaluation, dans
       la même portée — c'est bien la valeur du code réel qui est observée. */
    valeur: function (expression) { return vm.runInContext(expression, ctx); },
    el: function (id) { return doc.getElementById(id); },
    message: function () { return doc.getElementById('message-equipe').textContent; },
    classeMessage: function () { return doc.getElementById('message-equipe').className; },
    ajoutFerme: function () { return doc.getElementById('bouton-ajouter').disabled === true; },
    repriseVisible: function () { return doc.getElementById('reprise-equipes').hidden === false; },
    /** Prépare le formulaire comme l'organisateur l'aurait rempli. */
    saisir: function (nom, cat) {
      doc.getElementById('champ-nom').value = nom;
      doc.getElementById('champ-categorie').value = cat || 'U10';
    },
    /** Lance l'ajout SANS l'attendre (le scénario pilote l'horloge ensuite). */
    lancerAjout: function () {
      const p = ctx.onAjouterEquipe({ preventDefault: function () {} });
      p.catch(function () { /* surveillée : aucune promesse non gérée */ });
      return p;
    },
    postsDe: function (action) {
      return reseau.journal.filter(function (i) { return i.methode === 'POST' && i.action === action; });
    },
    getsDe: function (action) {
      return reseau.journal.filter(function (i) { return i.methode !== 'POST' && i.action === action; });
    }
  };
}

/** Scénario courant : l'écriture réussit, la lecture suivante suit `planLecture`. */
function scenarioAjout(b, planLecture, planEcriture) {
  b.reseau.programmer(function (info) {
    if (info.methode === 'POST') return planEcriture || { statut: 200, corps: { ok: true } };
    return typeof planLecture === 'function' ? planLecture(info) : planLecture;
  });
}

/* ========================================================================== */
/*  MOTEUR DE CONTRÔLE                                                         */
/* ========================================================================== */

let total = 0, echecs = 0;
const details = [];

function verifier(code, libelle, condition, preuve) {
  total++;
  const ok = condition === true;
  if (!ok) { echecs++; details.push(code + ' — ' + libelle + (preuve ? '\n      ' + preuve : '')); }
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + code + ' — ' + libelle);
}

function titre(t) { console.log('\n' + t + '\n' + '─'.repeat(70)); }

function json(v) { return JSON.stringify(v); }

/* ========================================================================== */
/*  LES CONTRÔLES                                                              */
/* ========================================================================== */

async function principal() {

  /* ---------------------------------------------------------------------- */
  titre('§ 1 — SUCCÈS NORMAL : rien ne doit changer pour le parcours qui marche');

  {
    const b = bac();
    scenarioAjout(b, { statut: 200, corps: [{ id_equipe: 'E1', nom_equipe: 'RACING 92-1', categorie: 'U10' }], apres: 2600 },
      { statut: 200, corps: { ok: true }, apres: 5600 });
    b.saisir('RACING 92-1');
    const p = b.lancerAjout();
    await souffler();
    const pendantEcriture = { msg: b.message(), ferme: b.ajoutFerme(), libelle: b.el('bouton-ajouter').textContent };
    await b.horloge.avancer(6000);
    const pendantLecture = { msg: b.message(), ferme: b.ajoutFerme() };
    await b.horloge.avancer(3000);
    await p;

    verifier('1.1', '① « Enregistrement… » est annoncé pendant l\'écriture, bouton fermé et libellé « Ajout… »',
      pendantEcriture.msg.indexOf('Enregistrement de « RACING 92-1 »') !== -1 &&
      pendantEcriture.ferme === true && pendantEcriture.libelle === 'Ajout…',
      json(pendantEcriture));

    verifier('1.2', '② dès l\'écriture confirmée, le succès est DIT et l\'actualisation annoncée',
      pendantLecture.msg.indexOf('✅ « RACING 92-1 » ajoutée.') !== -1 &&
      pendantLecture.msg.indexOf('Actualisation de la liste…') !== -1,
      json(pendantLecture));

    verifier('1.3', 'fin : message de succès NET, liste rendue, compteur mis à jour, ajout rouvert',
      b.message() === '✅ « RACING 92-1 » ajoutée.' && b.classeMessage().indexOf('ok') !== -1 &&
      b.ctx.equipesCourantes.length === 1 && b.ctx._tableauBord >= 1 && b.ajoutFerme() === false,
      json({ msg: b.message(), n: b.ctx.equipesCourantes.length, tb: b.ctx._tableauBord, ferme: b.ajoutFerme() }));

    verifier('1.4', 'les champs saisis sont libérés pour l\'équipe suivante, le focus revient au nom',
      b.el('champ-nom').value === '' && b.el('champ-nom')._focus >= 1,
      json({ nom: b.el('champ-nom').value, focus: b.el('champ-nom')._focus }));

    verifier('1.5', 'aucune reprise proposée quand tout s\'est bien passé, aucun minuteur résiduel',
      b.repriseVisible() === false && b.horloge.restantes() === 0,
      json({ reprise: b.repriseVisible(), minuteurs: b.horloge.restantes() }));

    verifier('1.6', 'UNE écriture et UNE lecture, pas davantage',
      b.postsDe('ajouterEquipe').length === 1 && b.getsDe('getEquipes').length === 1,
      json({ post: b.postsDe('ajouterEquipe').length, get: b.getsDe('getEquipes').length }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 2 — ÉCRITURE CONFIRMÉE, LECTURE EN ÉCHEC : l\'acquis est dit, jamais renié');

  {
    /* La lecture PEND : c'est exactement le cas de terrain (succès affiché, liste figée). */
    const b = bac();
    scenarioAjout(b, 'pend');
    b.saisir('RACING 92-2');
    const p = b.lancerAjout();
    await souffler();
    await b.horloge.avancer(1000);
    const avantEcheance = { msg: b.message(), ferme: b.ajoutFerme(), reprise: b.repriseVisible() };
    await b.horloge.avancer(45000);   // au-delà des deux budgets de 20 s
    await p;

    verifier('2.1', 'avant l\'échéance : état ② — succès acquis annoncé, actualisation en cours',
      avantEcheance.msg.indexOf('✅ « RACING 92-2 » ajoutée.') !== -1 &&
      avantEcheance.msg.indexOf('Actualisation de la liste…') !== -1 && avantEcheance.reprise === false,
      json(avantEcheance));

    verifier('2.2', 'après deux échéances : état ③ — la lecture rend la main, avec deux émissions au plus',
      b.message().indexOf('Actualisation de la liste…') === -1 && b.getsDe('getEquipes').length === 2,
      json({ msg: b.message(), lectures: b.getsDe('getEquipes').length }));

    verifier('2.3', 'l\'acquis reste DIT dans le message d\'échec (l\'écriture n\'est pas reniée)',
      b.message().indexOf('✅ « RACING 92-2 » ajoutée.') === 0,
      json({ msg: b.message() }));

    verifier('2.4', 'la liste est déclarée NON actualisée, et l\'écran ne prétend pas le contraire',
      b.message().indexOf('n\'a PAS pu être actualisée') !== -1 && b.classeMessage().indexOf('ko') !== -1,
      json({ msg: b.message(), classe: b.classeMessage() }));

    verifier('2.5', '⛔ rien n\'invite à recréer l\'équipe : « Ne recrée rien » est explicite',
      b.message().indexOf('Ne recrée rien') !== -1 && !/recommenc|refais|ré-?essaie l'ajout/i.test(b.message()),
      json({ msg: b.message() }));

    verifier('2.6', 'l\'ajout RESTE fermé : une liste obsolète ne rouvre pas la porte au doublon',
      b.ajoutFerme() === true, json({ ferme: b.ajoutFerme() }));

    verifier('2.7', 'la reprise ciblée est offerte, et aucun minuteur ne survit',
      b.repriseVisible() === true && b.horloge.restantes() === 0,
      json({ reprise: b.repriseVisible(), minuteurs: b.horloge.restantes() }));

    verifier('2.8', '⛔ AUCUNE réémission de l\'écriture pendant tout ce parcours',
      b.postsDe('ajouterEquipe').length === 1, json({ post: b.postsDe('ajouterEquipe').length }));
  }

  {
    /* Corps de réponse qui ne vient jamais : le budget doit le couvrir AUSSI. */
    const b = bac();
    scenarioAjout(b, { statut: 200, corpsPend: true });
    b.saisir('CORPS PENDANT');
    const p = b.lancerAjout();
    await souffler();
    await b.horloge.avancer(45000);
    await p;
    verifier('2.9', 'le budget couvre aussi l\'attente du CORPS de la réponse, puis tente une seconde lecture bornée',
      b.message().indexOf('n\'a PAS pu être actualisée') !== -1 && b.repriseVisible() === true &&
      b.getsDe('getEquipes').length === 2 && b.horloge.restantes() === 0,
      json({ msg: b.message(), reprise: b.repriseVisible(), lectures: b.getsDe('getEquipes').length,
             minuteurs: b.horloge.restantes() }));
  }

  {
    /* JSON illisible : échec IMMÉDIAT, pas d'attente du budget. */
    const b = bac();
    scenarioAjout(b, { statut: 200, corpsIllisible: true });
    b.saisir('JSON CASSE');
    await b.lancerAjout();
    verifier('2.10', 'JSON illisible : état ③ tout de suite, acquis conservé, ajout fermé, reprise offerte',
      b.message().indexOf('✅ « JSON CASSE » ajoutée.') === 0 &&
      b.message().indexOf('n\'a PAS pu être actualisée') !== -1 &&
      b.ajoutFerme() === true && b.repriseVisible() === true,
      json({ msg: b.message() }));

    verifier('2.11', 'aucun minuteur résiduel après un échec immédiat',
      b.horloge.restantes() === 0, json({ minuteurs: b.horloge.restantes() }));
  }

  {
    /* 404 répété : `getEquipes` est rejouable — DEUX émissions au plus, puis état ③. */
    const b = bac();
    scenarioAjout(b, { statut: 404 });
    b.saisir('QUATRE CENT QUATRE');
    const p = b.lancerAjout();
    await souffler();
    await b.horloge.avancer(2000);
    await p;
    verifier('2.12', '404 : le rejeu unique de DR-6F joue (2 émissions), puis état ③ — jamais un échec d\'écriture',
      b.getsDe('getEquipes').length === 2 && b.message().indexOf('✅ « QUATRE CENT QUATRE » ajoutée.') === 0 &&
      b.message().indexOf('n\'a PAS pu être actualisée') !== -1,
      json({ emissions: b.getsDe('getEquipes').length, msg: b.message() }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 3 — BUDGETS : les lectures sont bornées, les écritures ne le sont pas');

  {
    const b = bac();
    scenarioAjout(b, { statut: 200, corps: [] });
    b.saisir('BUDGET');
    await b.lancerAjout();
    const lecture = b.getsDe('getEquipes')[0];
    const ecriture = b.postsDe('ajouterEquipe')[0];
    verifier('3.1', 'la lecture de la liste part AVEC un signal d\'abandon ; l\'écriture SANS',
      lecture.borne === true && ecriture.borne === false,
      json({ lecture: lecture.borne, ecriture: ecriture.borne }));

    const budgetListe = b.valeur('DELAI_LECTURE_EQUIPES_MS');
    const budgetOuverture = b.valeur('DELAI_LECTURE_ADMIN_MS');
    verifier('3.2', 'le budget de la liste est explicite et non nul (20 s), déclaré dans le code réel',
      budgetListe === 20000, json({ budget: budgetListe }));

    verifier('3.3', 'le budget d\'ouverture est explicite, plus large que celui de la liste',
      budgetOuverture === 30000 && budgetOuverture > budgetListe,
      json({ ouverture: budgetOuverture, liste: budgetListe }));
  }

  {
    /* Démarrage : une des deux lectures d'ouverture PEND. */
    const b = bac();
    b.reseau.programmer(function (info) {
      if (info.methode === 'POST') return { statut: 200, corps: { config: { global: {}, categories: [] } } };
      return 'pend';                                  // getAll ne répond jamais
    });
    const p = b.ctx.ouvrirSessionAdmin();
    let issue = null;
    p.then(function (r) { issue = { ok: r }; }, function (e) { issue = { err: e.message, nom: e.name }; });
    await souffler();
    await b.horloge.avancer(10000);
    const a10s = issue;
    await b.horloge.avancer(55000);
    await souffler();

    verifier('3.4', 'démarrage avec une lecture pendante : à 10 s, l\'ouverture attend encore (pas de faux échec)',
      a10s === null, json({ a10s: a10s }));

    verifier('3.5', 'passé le budget, l\'ouverture REJETTE : l\'écran d\'attente peut devenir écran d\'erreur',
      issue !== null && !!issue.err, json({ issue: issue }));

    verifier('3.6', 'les DEUX lectures d\'ouverture partent bornées (getAll et getConfigAdmin)',
      b.getsDe('getAll').length === 2 && b.getsDe('getAll').every(function (x) { return x.borne === true; }) &&
      b.postsDe('getConfigAdmin').length === 1 && b.postsDe('getConfigAdmin')[0].borne === true,
      json({ getAll: b.getsDe('getAll'), post: b.postsDe('getConfigAdmin')[0] }));

    verifier('3.7', 'aucun minuteur résiduel après l\'abandon de l\'ouverture',
      b.horloge.restantes() === 0, json({ minuteurs: b.horloge.restantes() }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 4 — REPRISE CIBLÉE : relire la liste, sans recharger la page');

  {
    const b = bac();
    scenarioAjout(b, { statut: 200, corpsIllisible: true });
    b.saisir('STADE FRANCAIS-1');
    await b.lancerAjout();
    const apresEchec = { msg: b.message(), ferme: b.ajoutFerme(), reprise: b.repriseVisible() };

    /* L'organisateur prépare DÉJÀ l'équipe suivante pendant que la liste est en panne. */
    b.el('champ-nom').value = 'STADE FRANCAIS-2';
    b.el('champ-joueurs').value = '11';

    b.reseau.programmer(function (info) {
      if (info.methode === 'POST') return { statut: 200, corps: { ok: true } };
      return { statut: 200, corps: [{ id_equipe: 'E3', nom_equipe: 'STADE FRANCAIS-1', categorie: 'U10' }], apres: 2300 };
    });
    const pr = b.ctx.onRepriseEquipes();
    await souffler();
    const pendant = { libelle: b.el('bouton-reprise-equipes').textContent, ferme: b.el('bouton-reprise-equipes').disabled };
    await b.horloge.avancer(3000);
    await pr;

    verifier('4.1', 'départ : état ③ avec reprise offerte et ajout fermé',
      apresEchec.reprise === true && apresEchec.ferme === true, json(apresEchec));

    verifier('4.2', 'pendant la reprise, le bouton le dit et se protège du double clic',
      pendant.libelle === 'Actualisation…' && pendant.ferme === true, json(pendant));

    verifier('4.3', 'reprise RÉUSSIE : liste, compteur et disponibilité de l\'ajout redeviennent cohérents',
      b.ctx.equipesCourantes.length === 1 && b.ctx._tableauBord >= 1 && b.ajoutFerme() === false &&
      b.repriseVisible() === false,
      json({ n: b.ctx.equipesCourantes.length, ferme: b.ajoutFerme(), reprise: b.repriseVisible() }));

    verifier('4.4', 'le message final rappelle l\'acquis ET annonce la liste à jour',
      b.message().indexOf('✅ « STADE FRANCAIS-1 » ajoutée.') !== -1 &&
      b.message().indexOf('Liste à jour') !== -1, json({ msg: b.message() }));

    verifier('4.5', '⭐ la saisie PRÉPARÉE est intacte : la reprise ne vide aucun champ',
      b.el('champ-nom').value === 'STADE FRANCAIS-2' && b.el('champ-joueurs').value === '11',
      json({ nom: b.el('champ-nom').value, j: b.el('champ-joueurs').value }));

    verifier('4.6', '⛔ la reprise n\'a réémis AUCUNE écriture — une seule depuis le début',
      b.postsDe('ajouterEquipe').length === 1 && b.reseau.journal.filter(function (i) {
        return i.methode === 'POST' && i.action !== 'getConfigAdmin';
      }).length === 1,
      json({ posts: b.reseau.journal.filter(function (i) { return i.methode === 'POST'; }).map(function (i) { return i.action; }) }));

    verifier('4.7', 'le bouton de reprise redevient utilisable, aucun minuteur résiduel',
      b.el('bouton-reprise-equipes').disabled === false &&
      b.el('bouton-reprise-equipes').textContent === 'Actualiser la liste' && b.horloge.restantes() === 0,
      json({ ferme: b.el('bouton-reprise-equipes').disabled, minuteurs: b.horloge.restantes() }));
  }

  {
    /* Clics répétés : une seule lecture part. */
    const b = bac();
    scenarioAjout(b, { statut: 200, corpsIllisible: true });
    b.saisir('CLICS');
    await b.lancerAjout();
    b.reseau.programmer(function () { return { statut: 200, corps: [], apres: 3000 }; });
    const p1 = b.ctx.onRepriseEquipes();
    await souffler();
    const p2 = b.ctx.onRepriseEquipes();
    const p3 = b.ctx.onRepriseEquipes();
    await souffler();
    const pendant = b.getsDe('getEquipes').length;
    await b.horloge.avancer(4000);
    await Promise.all([p1, p2, p3]);
    verifier('4.8', 'trois clics de reprise pendant une lecture en vol ⇒ UNE seule lecture émise',
      pendant === 2 && b.getsDe('getEquipes').length === 2,
      json({ pendantLesClics: pendant, total: b.getsDe('getEquipes').length }));
  }

  {
    /* Reprise qui échoue à son tour. */
    const b = bac();
    scenarioAjout(b, { statut: 200, corpsIllisible: true });
    b.saisir('REPRISE KO');
    await b.lancerAjout();
    b.reseau.programmer(function () { return { statut: 500 }; });
    await b.ctx.onRepriseEquipes();
    verifier('4.9', 'reprise ÉCHOUÉE : l\'acquis est répété, l\'incertitude est nommée, l\'ajout reste fermé',
      b.message().indexOf('✅ « REPRISE KO » ajoutée.') === 0 &&
      b.message().indexOf('toujours pas pu être actualisée') !== -1 &&
      b.message().indexOf('peut être ancien') !== -1 && b.ajoutFerme() === true,
      json({ msg: b.message(), ferme: b.ajoutFerme() }));

    verifier('4.10', 'la reprise reste offerte tant que l\'écran n\'est pas à jour',
      b.repriseVisible() === true, json({ reprise: b.repriseVisible() }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 5 — CONCURRENCE : une réponse tardive n\'écrase jamais un état plus récent');

  {
    const b = bac();
    scenarioAjout(b, { statut: 200, corpsIllisible: true });
    b.saisir('TARDIVE');
    await b.lancerAjout();

    /* Première reprise : lente (8 s). Seconde : rapide (1 s) et plus récente. */
    let appel = 0;
    b.reseau.programmer(function () {
      appel++;
      return appel === 1
        ? { statut: 200, corps: [{ id_equipe: 'VIEUX', nom_equipe: 'VIEILLE LISTE', categorie: 'U10' }], apres: 8000 }
        : { statut: 200, corps: [{ id_equipe: 'N1', nom_equipe: 'A', categorie: 'U10' },
                                 { id_equipe: 'N2', nom_equipe: 'B', categorie: 'U10' }], apres: 1000 };
    });
    const lente = b.ctx.rechargerEquipes();
    lente.catch(function () {});
    await souffler();
    const rapide = b.ctx.rechargerEquipes();
    rapide.catch(function () {});
    await b.horloge.avancer(2000);
    const apresRapide = b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; });
    await b.horloge.avancer(10000);
    const resultats = { lente: await lente, rapide: await rapide };

    verifier('5.1', 'la lecture RÉCENTE s\'affiche dès son arrivée',
      json(apresRapide) === json(['N1', 'N2']), json({ apresRapide: apresRapide }));

    verifier('5.2', '⭐ la réponse TARDIVE ne remplace pas l\'état plus récent',
      json(b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; })) === json(['N1', 'N2']),
      json({ final: b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; }) }));

    verifier('5.3', 'la tardive se déclare « sans effet » (false) ; la récente, effective (true)',
      resultats.lente === false && resultats.rapide === true, json(resultats));

    verifier('5.4', 'aucun minuteur résiduel après ce croisement',
      b.horloge.restantes() === 0, json({ minuteurs: b.horloge.restantes() }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 6 — ÉCRITURE : refus connu, issue inconnue, et jamais de rejeu');

  {
    /* ⭐ R1 — Erreur MÉTIER : une réponse `{error}` ne prouve PAS l'absence d'écriture. */
    const b = bac();
    b.reseau.programmer(function (info) {
      if (info.methode === 'POST') return { statut: 200, corps: { error: 'Catégorie inconnue.' } };
      return { statut: 200, corps: [] };
    });
    b.saisir('REFUS METIER');
    await b.lancerAjout();
    verifier('6.1', '⭐ R1 — erreur métier : issue INCERTAINE, ajout FERMÉ, reprise offerte',
      b.message().indexOf('Impossible de savoir') !== -1 && b.message().indexOf('Catégorie inconnue.') !== -1 &&
      b.ajoutFerme() === true && b.repriseVisible() === true,
      json({ msg: b.message(), ferme: b.ajoutFerme(), reprise: b.repriseVisible() }));

    verifier('6.2', 'erreur métier : aucune lecture automatique n\'est lancée — c\'est à l\'organisateur de décider',
      b.getsDe('getEquipes').length === 0, json({ lectures: b.getsDe('getEquipes').length }));
  }

  {
    /* ⭐ R1 — CONTRE-ÉPREUVE A : l'erreur serveur GÉNÉRIQUE du backend, qui peut suivre une
       écriture partielle. Elle est structurellement identique à un refus de validation. */
    const b = bac();
    b.reseau.programmer(function (info) {
      if (info.methode === 'POST') return { statut: 200, corps: { error: 'Erreur serveur pendant l\'écriture.' } };
      return { statut: 200, corps: [] };
    });
    b.saisir('ERREUR SERVEUR');
    await b.lancerAjout();
    verifier('6.9', '⭐ R1 — « Erreur serveur pendant l\'écriture. » ⇒ INCERTAIN, jamais « sans effet »',
      b.message().indexOf('Impossible de savoir si « ERREUR SERVEUR » a été enregistrée') !== -1 &&
      b.ajoutFerme() === true && b.repriseVisible() === true,
      json({ msg: b.message(), ferme: b.ajoutFerme(), reprise: b.repriseVisible() }));

    verifier('6.10', '⛔ aucune réémission de l\'écriture après cette erreur générique',
      b.postsDe('ajouterEquipe').length === 1, json({ posts: b.postsDe('ajouterEquipe').length }));
  }

  {
    /* ⭐ R1 — la règle exacte de `ecritureSansEffetEtabli`, cas par cas. */
    const b = bac();
    const sansEffet = function (e) { return b.valeur('ecritureSansEffetEtabli')(e); };
    const cas = {
      annulation: sansEffet(new Error('Action annulée.')),
      accesRefuse: sansEffet(Object.assign(new Error('Clé incorrecte'), { reponse: { acces_refuse: true } })),
      texteRefus: sansEffet(Object.assign(new Error('Clé incorrecte'), { reponse: { error: 'Clé incorrecte' } })),
      accesAccorde: sansEffet(Object.assign(new Error('Boum'), { reponse: { acces_refuse: false } })),
      erreurMetier: sansEffet(Object.assign(new Error('Catégorie inconnue.'), { reponse: { error: 'Catégorie inconnue.' } })),
      erreurServeur: sansEffet(Object.assign(new Error('Erreur serveur pendant l\'écriture.'),
        { reponse: { error: 'Erreur serveur pendant l\'écriture.' } })),
      panneReseau: sansEffet(new Error('Failed to fetch')),
      abandon: sansEffet(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
    };
    verifier('6.11', '⭐ R1 — SEULS l\'authentification refusée et l\'annulation avant émission valent « sans effet »',
      cas.annulation === true && cas.accesRefuse === true && cas.texteRefus === true &&
      cas.accesAccorde === false && cas.erreurMetier === false && cas.erreurServeur === false &&
      cas.panneReseau === false && cas.abandon === false,
      json(cas));
  }

  {
    /* Panne TECHNIQUE sur l'écriture : issue INCONNUE. */
    const b = bac();
    b.reseau.programmer(function (info) {
      if (info.methode === 'POST') return { statut: 500 };
      return { statut: 200, corps: [] };
    });
    b.saisir('INCONNU');
    await b.lancerAjout();
    verifier('6.3', '⭐ issue INCONNUE : le message le dit, et ne parle jamais d\'échec d\'enregistrement',
      b.message().indexOf('Impossible de savoir si « INCONNU » a été enregistrée') !== -1,
      json({ msg: b.message() }));

    verifier('6.4', '⛔ issue inconnue : « Ne la recrée pas » est explicite, l\'ajout reste FERMÉ',
      b.message().indexOf('Ne la recrée pas') !== -1 && b.ajoutFerme() === true,
      json({ msg: b.message(), ferme: b.ajoutFerme() }));

    verifier('6.5', 'issue inconnue : la reprise ciblée est offerte pour aller VOIR ce que le serveur a retenu',
      b.repriseVisible() === true && b.message().indexOf('Actualise d\'abord la liste') !== -1,
      json({ reprise: b.repriseVisible() }));

    verifier('6.6', '⛔ AUCUNE réémission de l\'écriture après une panne technique',
      b.postsDe('ajouterEquipe').length === 1, json({ posts: b.postsDe('ajouterEquipe').length }));
  }

  {
    /* Clé refusée : distincte d'une panne technique. */
    const b = bac();
    let n = 0;
    b.reseau.programmer(function (info) {
      if (info.methode !== 'POST') return { statut: 200, corps: [] };
      n++;
      return { statut: 200, corps: { error: 'Clé incorrecte', acces_refuse: true } };
    });
    b.ctx._cleSaisie = 'ENCORE-MAUVAISE';
    b.saisir('CLE REFUSEE');
    await b.lancerAjout();
    verifier('6.7', 'clé refusée : message de refus, PAS le message d\'issue inconnue, ajout rouvert',
      b.message().indexOf('Clé incorrecte') !== -1 &&
      b.message().indexOf('Impossible de savoir') === -1 && b.ajoutFerme() === false,
      json({ msg: b.message(), ferme: b.ajoutFerme() }));

    verifier('6.8', 'clé refusée : la redemande de DR-5B a bien eu lieu (deux émissions métier au plus)',
      n === 2 && b.dialogues.length >= 1, json({ emissions: n, dialogues: b.dialogues.length }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 7 — RAFRAÎCHIR : un écran périmé ne se fait plus passer pour un écran à jour');

  {
    const b = bac();
    b.ctx.rechargerEtRendre = async function () { throw new Error('Le serveur a répondu avec une erreur (404).'); };
    await b.ctx.rafraichirAdmin();
    verifier('7.1', '⭐ échec de « Rafraîchir » : il est DIT, à la place de l\'horodatage',
      b.el('maj-admin').textContent.indexOf('Non actualisé') !== -1 &&
      b.el('maj-admin').textContent.indexOf('404') !== -1,
      json({ maj: b.el('maj-admin').textContent }));

    verifier('7.2', 'l\'avertissement est marqué visuellement, et le bouton redevient utilisable',
      b.el('maj-admin').className.indexOf('live-maj-echec') !== -1 &&
      b.el('bouton-rafraichir-admin').disabled === false &&
      b.el('bouton-rafraichir-admin').textContent === 'Rafraîchir',
      json({ classe: b.el('maj-admin').className }));

    /* Puis un rafraîchissement qui réussit doit EFFACER l'avertissement. */
    b.ctx.rechargerEtRendre = async function () { b.ctx.majHeureAdmin(); };
    await b.ctx.rafraichirAdmin();
    verifier('7.3', 'un rafraîchissement RÉUSSI efface l\'avertissement : l\'écran ne reste pas marqué à tort',
      b.el('maj-admin').textContent.indexOf('Non actualisé') === -1 &&
      b.el('maj-admin').textContent.indexOf('Mis à jour à') === 0 &&
      b.el('maj-admin').className.indexOf('live-maj-echec') === -1,
      json({ maj: b.el('maj-admin').textContent, classe: b.el('maj-admin').className }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 7 bis — RETOUCHE R1 : les trois autres mutations suivent la MÊME règle');

  {
    /* Suppression unitaire recevant un 404 : issue incertaine. */
    const b = bac();
    b.ctx.equipesCourantes = [{ id_equipe: 'E1', nom_equipe: 'RACING 92-1', categorie: 'U10' }];
    b.reseau.programmer(function (info) { return info.methode === 'POST' ? { statut: 404 } : { statut: 200, corps: [] }; });
    const bouton = fabriquerElement('suppr');
    bouton.getAttribute = function (a) { return a === 'data-id' ? 'E1' : 'RACING 92-1'; };
    await b.ctx.onSupprimerEquipe(bouton);
    verifier('R1.1', '⭐ suppression + 404 : issue INCERTAINE, reprise RÉELLEMENT offerte, geste NON réactivé',
      b.message().indexOf('Impossible de savoir si « RACING 92-1 » a été supprimée') !== -1 &&
      b.repriseVisible() === true && bouton.disabled === true,
      json({ msg: b.message(), reprise: b.repriseVisible(), bouton: bouton.disabled }));

    verifier('R1.2', '⛔ et l\'ajout est fermé lui aussi : aucune mutation sur une liste douteuse',
      b.ajoutFerme() === true, json({ ferme: b.ajoutFerme() }));

    verifier('R1.3', '⛔ aucune réémission de la suppression',
      b.postsDe('supprimerEquipe').length === 1, json({ posts: b.postsDe('supprimerEquipe').length }));
  }

  {
    /* Suppression par catégorie : une partie a pu être supprimée. */
    const b = bac();
    b.ctx.equipesCourantes = [{ id_equipe: 'E1', categorie: 'U10' }, { id_equipe: 'E2', categorie: 'U10' }];
    b.reseau.programmer(function (info) { return info.methode === 'POST' ? { statut: 500 } : { statut: 200, corps: [] }; });
    const bouton = fabriquerElement('suppr-cat');
    bouton.getAttribute = function () { return 'U10'; };
    await b.ctx.onSupprimerCategorieEquipes(bouton);
    verifier('R1.4', '⭐ suppression par catégorie en panne : « une partie a pu être supprimée », reprise offerte',
      b.message().indexOf('Impossible de savoir ce qui a été supprimé') !== -1 &&
      b.message().indexOf('une partie a pu être supprimée') !== -1 &&
      b.repriseVisible() === true && bouton.disabled === true,
      json({ msg: b.message(), bouton: bouton.disabled }));
  }

  {
    /* Modification : `modifierEquipe` écrit en plusieurs fois. */
    const b = bac();
    b.ctx.equipesCourantes = [{ id_equipe: 'E1', nom_equipe: 'AVANT', categorie: 'U10' }];
    b.reseau.programmer(function (info) {
      return info.methode === 'POST' ? { statut: 200, corps: { error: 'Erreur serveur pendant l\'écriture.' } }
                                     : { statut: 200, corps: [] };
    });
    const item = fabriquerElement('item');
    const champs = { '.champ-edit-nom': fabriquerElement('n'), '.champ-edit-joueurs': fabriquerElement('j'),
                     '.champ-edit-educateurs': fabriquerElement('e') };
    champs['.champ-edit-nom'].value = 'APRES';
    item.querySelector = function (sel) { return champs[sel] || null; };
    b.doc.querySelector = function () { return item; };
    const bouton = fabriquerElement('edit-ok');
    bouton.getAttribute = function () { return 'E1'; };
    await b.ctx.onEnregistrerNom(bouton);
    verifier('R1.5', '⭐ modification + erreur serveur générique : « ce qui a été enregistré » reste inconnu',
      b.message().indexOf('Impossible de savoir ce qui a été enregistré pour « APRES »') !== -1 &&
      b.repriseVisible() === true && bouton.disabled === true,
      json({ msg: b.message(), bouton: bouton.disabled }));
  }

  {
    /* Gardes à l'ENTRÉE : en état incertain, aucune mutation ne part. */
    const b = bac();
    b.ctx.equipesCourantes = [{ id_equipe: 'E1', nom_equipe: 'X', categorie: 'U10' }];
    b.reseau.programmer(function () { return { statut: 200, corps: {} }; });
    b.valeur('afficherRepriseEquipes')('✅ acquis en suspens.');
    const avant = b.reseau.journal.length;

    b.saisir('NOUVELLE');
    await b.lancerAjout();
    const apresAjout = b.reseau.journal.length;

    const bs = fabriquerElement('s');
    bs.getAttribute = function (a) { return a === 'data-id' ? 'E1' : 'X'; };
    await b.ctx.onSupprimerEquipe(bs);
    const bc = fabriquerElement('c');
    bc.getAttribute = function () { return 'U10'; };
    await b.ctx.onSupprimerCategorieEquipes(bc);

    verifier('R1.6', '⭐ garde à l\'entrée : en état incertain, AUCUNE mutation n\'est émise',
      apresAjout === avant && b.reseau.journal.length === avant,
      json({ avant: avant, apres: b.reseau.journal.length }));

    verifier('R1.7', 'la garde explique pourquoi, rappelle l\'acquis et laisse la reprise offerte',
      b.message().indexOf('✅ acquis en suspens.') === 0 &&
      b.message().indexOf('est suspendu') !== -1 && b.repriseVisible() === true,
      json({ msg: b.message() }));

    verifier('R1.8', '⭐ la saisie préparée survit à la garde',
      b.el('champ-nom').value === 'NOUVELLE', json({ nom: b.el('champ-nom').value }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 7 ter — RETOUCHE R1 : fraîcheur et disponibilité VRAIMENT partagées');

  {
    /* B1 — le rendu des catégories ne doit plus lever le verrou. */
    const b = bac();
    b.valeur('afficherRepriseEquipes')('✅ ajout acquis.');
    const ferméAvant = b.ajoutFerme();
    b.ctx.remplirSelectCategories([{ categorie: 'U10', presente: 'oui' }]);
    verifier('R1.9', '⭐ B1 — `remplirSelectCategories` (U10 présente) ne rouvre PLUS l\'ajout verrouillé',
      ferméAvant === true && b.ajoutFerme() === true && b.repriseVisible() === true,
      json({ avant: ferméAvant, apres: b.ajoutFerme() }));

    /* …et une fois l'écran fiable, il le rouvre bien. */
    b.valeur('masquerRepriseEquipes')();
    b.ctx.remplirSelectCategories([{ categorie: 'U10', presente: 'oui' }]);
    verifier('R1.10', 'écran redevenu fiable : le rendu des catégories rouvre normalement l\'ajout',
      b.ajoutFerme() === false, json({ ferme: b.ajoutFerme() }));
  }

  {
    /* B2 — un `getAll` ancien ne doit pas ramener la liste en arrière. */
    const b = bac();
    b.ctx.equipesCourantes = [];
    let appel = 0;
    b.reseau.programmer(function (info) {
      appel++;
      if (info.action === 'getAll') {
        return { statut: 200, corps: { equipes: [{ id_equipe: 'ANCIENNE' }], matchs: [], poules: [] }, apres: 9000 };
      }
      return { statut: 200, corps: [{ id_equipe: 'A' }, { id_equipe: 'B' }], apres: 1000 };
    });
    const global = b.ctx.rechargerEtRendre({ equipes: true });
    global.catch(function () {});
    await souffler();
    const ciblee = b.ctx.rechargerEquipes();
    ciblee.catch(function () {});
    await b.horloge.avancer(2000);
    const apresCiblee = b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; });
    await b.horloge.avancer(12000);
    await global; await ciblee;

    verifier('R1.11', '⭐ B2 — le `getAll` ANCIEN ne remplace pas la liste relue entre-temps',
      json(apresCiblee) === json(['A', 'B']) &&
      json(b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; })) === json(['A', 'B']),
      json({ apresCiblee: apresCiblee, final: b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; }) }));

    verifier('R1.12', 'le reste du rendu global suit quand même son cours (planning rendu)',
      b.ctx._planning >= 1, json({ planning: b.ctx._planning }));
  }

  {
    /* B3 — un REJET périmé ne doit pas écraser un succès plus récent. */
    const b = bac();
    let appel = 0;
    b.reseau.programmer(function () {
      appel++;
      return appel === 1 ? { statut: 500, apres: 9000 }
                         : { statut: 200, corps: [{ id_equipe: 'N1' }], apres: 1000 };
    });
    const msg = b.el('message-equipe');
    const ancienne = b.ctx.actualiserApresEcriture(msg, '✅ ancien acquis.');
    ancienne.catch(function () {});
    await souffler();
    const recente = b.ctx.actualiserApresEcriture(msg, '✅ nouvel acquis.');
    recente.catch(function () {});
    await b.horloge.avancer(2000);
    const apresRecente = { msg: b.message(), reprise: b.repriseVisible(), ferme: b.ajoutFerme() };
    await b.horloge.avancer(12000);
    const issues = { ancienne: await ancienne, recente: await recente };

    verifier('R1.13', 'la plus récente conclut normalement : message net, reprise cachée, ajout ouvert',
      apresRecente.msg === '✅ nouvel acquis.' && apresRecente.reprise === false && apresRecente.ferme === false,
      json(apresRecente));

    verifier('R1.14', '⭐ B3 — le REJET périmé ne rouvre pas la reprise et ne referme pas l\'ajout',
      b.message() === '✅ nouvel acquis.' && b.repriseVisible() === false && b.ajoutFerme() === false,
      json({ msg: b.message(), reprise: b.repriseVisible(), ferme: b.ajoutFerme() }));

    verifier('R1.15', 'la lecture périmée se déclare sans effet (elle ne lève pas chez l\'appelant)',
      issues.ancienne === true && issues.recente === true, json(issues));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 7 quater — RETOUCHE R1 : le VRAI chemin de « Rafraîchir »');

  {
    /* C — `rafraichirAdmin` réel, `rechargerEtRendre` réel, réseau qui pend. */
    const b = bac();
    b.reseau.programmer(function () { return 'pend'; });
    const p = b.ctx.rafraichirAdmin();
    p.catch(function () {});
    await souffler();
    const pendant = { ferme: b.el('bouton-rafraichir-admin').disabled, libelle: b.el('bouton-rafraichir-admin').textContent };
    await b.horloge.avancer(120000);
    await p;

    verifier('R1.16', '⭐ C — le VRAI chemin se dénoue : la promesse de `rafraichirAdmin` aboutit',
      pendant.ferme === true && b.el('bouton-rafraichir-admin').disabled === false,
      json({ pendant: pendant, apres: b.el('bouton-rafraichir-admin').disabled }));

    verifier('R1.17', '⭐ C — l\'avertissement apparaît réellement, sans doubler `rechargerEtRendre`',
      b.el('maj-admin').textContent.indexOf('Non actualisé') !== -1 &&
      b.el('maj-admin').className.indexOf('live-maj-echec') !== -1,
      json({ maj: b.el('maj-admin').textContent }));

    verifier('R1.18', '⭐ C — la lecture de ce chemin part BORNÉE, et aucun minuteur ne survit',
      b.getsDe('getAll').length === 2 && b.getsDe('getAll').every(function (x) { return x.borne === true; }) &&
      b.horloge.restantes() === 0,
      json({ lectures: b.getsDe('getAll').length, borne: b.getsDe('getAll')[0].borne,
             minuteurs: b.horloge.restantes() }));
  }

  {
    /* C — réussite PARTIELLE : `getAll` passe, la config échoue. */
    const b = bac();
    b.ctx.equipesCourantes = [{ id_equipe: 'AVANT' }];
    b.reseau.programmer(function (info) {
      if (info.methode === 'POST') return { statut: 500 };   // lireConfigAdmin échoue
      return { statut: 200, corps: { equipes: [{ id_equipe: 'NOUVELLE' }], matchs: [], poules: [] } };
    });
    let leve = false;
    try { await b.ctx.rechargerEtRendre({ equipes: true, publication: true }); } catch (e) { leve = true; }
    verifier('R1.19', '⭐ C — réussite partielle : la mémoire n\'est PAS mise à jour en silence',
      leve === true && json(b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; })) === json(['AVANT']),
      json({ leve: leve, equipes: b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; }) }));

    verifier('R1.20', 'les DEUX lectures de ce chemin sont bornées',
      b.getsDe('getAll')[0].borne === true && b.postsDe('getConfigAdmin')[0].borne === true,
      json({ get: b.getsDe('getAll')[0].borne, post: b.postsDe('getConfigAdmin')[0].borne }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 7 quinquies — RETOUCHE R2 : l\'OPÉRATION EN COURS entre dans la garde');

  {
    /* R2-1a — écriture EN VOL : ni le rendu des catégories, ni une seconde soumission. */
    const b = bac();
    b.reseau.programmer(function (info) { return info.methode === 'POST' ? 'pend' : { statut: 200, corps: [] }; });
    b.saisir('DOUBLON EN VOL');
    const p = b.lancerAjout(); p.catch(function () {});
    await souffler();
    const pendant = {
      ferme: b.ajoutFerme(),
      operation: b.valeur('operationEquipesEnCours')(),
      incertaine: b.valeur('listeEquipesIncertaine')(),
      posts: b.postsDe('ajouterEquipe').length
    };

    b.ctx.remplirSelectCategories([{ categorie: 'U10', presente: 'oui' }]);
    const apresRendu = b.ajoutFerme();

    b.saisir('DOUBLON EN VOL');
    await b.lancerAjout();

    verifier('R2.1', '⭐ écriture en vol : l\'OPÉRATION est déclarée, sans marquer la liste douteuse',
      pendant.operation === true && pendant.ferme === true && pendant.incertaine === false,
      json(pendant));

    verifier('R2.2', '⭐ R2 — le rendu des catégories ne rouvre PAS l\'ajout pendant une écriture en vol',
      apresRendu === true, json({ apresRendu: apresRendu }));

    verifier('R2.3', '⭐ R2 — une SECONDE soumission du même nom n\'émet AUCUN second POST',
      b.postsDe('ajouterEquipe').length === 1 && pendant.posts === 1,
      json({ posts: b.postsDe('ajouterEquipe').length }));

    verifier('R2.4', 'le refus dit que c\'est une ATTENTE, pas un écran périmé — et rien n\'est marqué douteux',
      b.message().indexOf('une opération est déjà en cours') !== -1 &&
      b.valeur('listeEquipesIncertaine')() === false && b.repriseVisible() === false,
      json({ msg: b.message(), incertaine: b.valeur('listeEquipesIncertaine')() }));

    verifier('R2.5', 'la saisie préparée survit au refus',
      b.el('champ-nom').value === 'DOUBLON EN VOL', json({ nom: b.el('champ-nom').value }));
  }

  {
    /* R2-1b — écriture RÉUSSIE, réconciliation en vol : même protection. */
    const b = bac();
    scenarioAjout(b, 'pend');
    b.saisir('RECONCILIATION');
    const p = b.lancerAjout(); p.catch(function () {});
    await souffler();
    const pendant = {
      msg: b.message(),
      operation: b.valeur('operationEquipesEnCours')(),
      incertaine: b.valeur('listeEquipesIncertaine')(),
      ferme: b.ajoutFerme()
    };
    b.ctx.remplirSelectCategories([{ categorie: 'U10', presente: 'oui' }]);
    const apresRendu = b.ajoutFerme();
    b.saisir('RECONCILIATION');
    await b.lancerAjout();

    verifier('R2.6', '⭐ R2 — pendant la RÉCONCILIATION, l\'opération court encore (l\'écran ne se croit pas fiable)',
      pendant.operation === true && pendant.ferme === true &&
      pendant.msg.indexOf('Actualisation de la liste…') !== -1,
      json(pendant));

    verifier('R2.7', '⭐ R2 — rendu des catégories puis seconde soumission : toujours UN SEUL POST',
      apresRendu === true && b.postsDe('ajouterEquipe').length === 1,
      json({ apresRendu: apresRendu, posts: b.postsDe('ajouterEquipe').length }));
  }

  {
    /* R2-1c — l'opération se LIBÈRE sur tous les chemins de sortie. */
    const sorties = {};
    /* ① confirmation + réconciliation réussies */
    let b = bac();
    scenarioAjout(b, { statut: 200, corps: [{ id_equipe: 'E1', categorie: 'U10' }] });
    b.saisir('OK');
    await b.lancerAjout();
    sorties.succes = { op: b.valeur('operationEquipesEnCours')(), ferme: b.ajoutFerme() };
    /* ② refus SANS EFFET établi (clé refusée puis annulation) */
    b = bac();
    b.ctx._cleSaisie = null;                       // l'organisateur annule la redemande
    b.reseau.programmer(function (i) {
      return i.methode === 'POST' ? { statut: 200, corps: { error: 'Clé incorrecte', acces_refuse: true } }
                                  : { statut: 200, corps: [] };
    });
    b.saisir('REFUS');
    await b.lancerAjout();
    sorties.sansEffet = { op: b.valeur('operationEquipesEnCours')(), ferme: b.ajoutFerme() };
    /* ③ écriture INCERTAINE */
    b = bac();
    b.reseau.programmer(function (i) { return i.methode === 'POST' ? { statut: 500 } : { statut: 200, corps: [] }; });
    b.saisir('INCERTAIN');
    await b.lancerAjout();
    sorties.incertain = { op: b.valeur('operationEquipesEnCours')(), ferme: b.ajoutFerme() };
    /* ④ réconciliation ÉCHOUÉE */
    b = bac();
    scenarioAjout(b, { statut: 200, corpsIllisible: true });
    b.saisir('LECTURE KO');
    await b.lancerAjout();
    sorties.lectureKo = { op: b.valeur('operationEquipesEnCours')(), ferme: b.ajoutFerme() };

    verifier('R2.8', '⭐ R2 — l\'opération est LIBÉRÉE sur les quatre chemins de sortie',
      sorties.succes.op === false && sorties.sansEffet.op === false &&
      sorties.incertain.op === false && sorties.lectureKo.op === false, json(sorties));

    verifier('R2.9', '⛔ mais la disponibilité reste gouvernée par l\'état : ouverte seulement quand c\'est sûr',
      sorties.succes.ferme === false && sorties.sansEffet.ferme === false &&
      sorties.incertain.ferme === true && sorties.lectureKo.ferme === true, json(sorties));
  }

  {
    /* R2-1d — les autres gestes de la carte tiennent l'opération eux aussi. */
    const b = bac();
    b.ctx.equipesCourantes = [{ id_equipe: 'E1', nom_equipe: 'X', categorie: 'U10' }];
    b.reseau.programmer(function (i) { return i.methode === 'POST' ? 'pend' : { statut: 200, corps: [] }; });
    const bs = fabriquerElement('s');
    bs.getAttribute = function (a) { return a === 'data-id' ? 'E1' : 'X'; };
    const ps = b.ctx.onSupprimerEquipe(bs); ps.catch(function () {});
    await souffler();
    const pendant = { op: b.valeur('operationEquipesEnCours')(), ferme: b.ajoutFerme() };
    b.ctx.remplirSelectCategories([{ categorie: 'U10', presente: 'oui' }]);
    b.saisir('PENDANT SUPPRESSION');
    await b.lancerAjout();
    verifier('R2.10', '⭐ R2 — une suppression en vol ferme aussi l\'ajout, et aucune écriture ne part',
      pendant.op === true && pendant.ferme === true && b.ajoutFerme() === true &&
      b.postsDe('ajouterEquipe').length === 0,
      json({ pendant: pendant, ajouts: b.postsDe('ajouterEquipe').length }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 7 sexies — RETOUCHE R2 : le verrou de lecture appartient à son lecteur');

  /** Monte le scénario « ciblée lente + rafraîchissement global », dans l'ordre demandé. */
  async function croisement(o) {
    const b = bac();
    b.valeur('afficherRepriseEquipes')('✅ acquis.');
    b.reseau.programmer(function (info) {
      if (info.action === 'getEquipes') return o.ciblee;
      if (info.action === 'getAll') return o.global;
      return { statut: 200, corps: {} };
    });
    let ciblee, global;
    if (o.globalDabord) {
      global = b.ctx.rechargerEtRendre({ equipes: true }); global.catch(function () {});
      await souffler();
      ciblee = b.ctx.onRepriseEquipes(); ciblee.catch(function () {});
    } else {
      ciblee = b.ctx.onRepriseEquipes(); ciblee.catch(function () {});
      await souffler();
      global = b.ctx.rechargerEtRendre({ equipes: true }); global.catch(function () {});
    }
    await souffler();
    const verrouPendant = b.valeur('lectureEquipesEnCours')();
    await b.horloge.avancer(60000);
    await ciblee.catch(function () {});
    await global.catch(function () {});
    return { b: b, verrouPendant: verrouPendant, verrouApres: b.valeur('lectureEquipesEnCours')() };
  }

  const combinaisons = [
    ['R2.11', 'ciblée réussie / global réussi', { ciblee: { statut: 200, corps: [{ id_equipe: 'C' }], apres: 9000 },
      global: { statut: 200, corps: { equipes: [{ id_equipe: 'G' }], matchs: [] }, apres: 1000 } }],
    ['R2.12', 'ciblée réussie / global en ERREUR 500', { ciblee: { statut: 200, corps: [{ id_equipe: 'C' }], apres: 9000 },
      global: { statut: 500, apres: 1000 } }],
    ['R2.13', 'ciblée en ERREUR / global réussi', { ciblee: { statut: 500, apres: 9000 },
      global: { statut: 200, corps: { equipes: [{ id_equipe: 'G' }], matchs: [] }, apres: 1000 } }],
    ['R2.14', 'ciblée EXPIRÉE (budget) / global réussi', { ciblee: 'pend',
      global: { statut: 200, corps: { equipes: [{ id_equipe: 'G' }], matchs: [] }, apres: 1000 } }],
    ['R2.15', 'ordre inverse : global d\'abord, ciblée ensuite', { globalDabord: true,
      ciblee: { statut: 200, corps: [{ id_equipe: 'C' }], apres: 2000 },
      global: { statut: 200, corps: { equipes: [{ id_equipe: 'G' }], matchs: [] }, apres: 9000 } }]
  ];

  for (const [code, libelle, o] of combinaisons) {
    const r = await croisement(o);
    verifier(code, '⭐ R2 — ' + libelle + ' : le verrou est RELÂCHÉ, aucun minuteur ne survit',
      r.verrouPendant === true && r.verrouApres === false && r.b.horloge.restantes() === 0,
      json({ pendant: r.verrouPendant, apres: r.verrouApres, minuteurs: r.b.horloge.restantes() }));
  }

  {
    /* Et surtout : après le croisement, une reprise reste UTILE — sans recharger la page. */
    const r = await croisement({ ciblee: { statut: 200, corps: [{ id_equipe: 'C' }], apres: 9000 },
      global: { statut: 200, corps: { equipes: [{ id_equipe: 'G' }], matchs: [] }, apres: 1000 } });
    const b = r.b;
    const avant = b.getsDe('getEquipes').length;
    b.reseau.programmer(function () { return { statut: 200, corps: [{ id_equipe: 'FINAL' }] }; });
    await b.ctx.onRepriseEquipes();

    verifier('R2.16', '⭐ R2 — le clic suivant sur « Actualiser la liste » émet RÉELLEMENT une lecture',
      b.getsDe('getEquipes').length === avant + 1, json({ avant: avant, apres: b.getsDe('getEquipes').length }));

    verifier('R2.17', 'et il rétablit un état cohérent : liste à jour, reprise cachée, ajout rouvert',
      json(b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; })) === json(['FINAL']) &&
      b.repriseVisible() === false && b.ajoutFerme() === false,
      json({ liste: b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; }),
             reprise: b.repriseVisible(), ferme: b.ajoutFerme() }));

    verifier('R2.18', '⛔ aucune mutation n\'a été émise pendant tout ce croisement',
      b.reseau.journal.filter(function (i) { return i.methode === 'POST' && i.action !== 'getConfigAdmin'; }).length === 0,
      json({ posts: b.reseau.journal.filter(function (i) { return i.methode === 'POST'; }).map(function (i) { return i.action; }) }));
  }

  {
    /* La réponse la plus RÉCENTE gagne, et une erreur ancienne ne pollue rien. */
    const r = await croisement({ ciblee: { statut: 500, apres: 9000 },
      global: { statut: 200, corps: { equipes: [{ id_equipe: 'G' }], matchs: [] }, apres: 1000 } });
    verifier('R2.19', '⭐ R2 — la lecture GLOBALE (plus récente) gagne ; l\'erreur ciblée ancienne ne pollue pas l\'écran',
      json(r.b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; })) === json(['G']),
      json({ liste: r.b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; }) }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 8 — REPRODUCTION DU DÉFAUT : sans la borne, le parcours reste bloqué');

  {
    /* ⭐ On retire la BORNE de la lecture, par substitution sur le code réel.
       ⚠️ PORTÉE EXACTE DE CETTE REPRODUCTION : c'est le code CORRIGÉ privé de son budget, et non
       une exécution intégrale du HEAD antérieur. Elle isole donc UNE cause — l'absence de borne —
       et démontre qu'elle suffit à produire le blocage constaté. Elle ne rejoue pas l'ancien
       enchaînement complet (message, `finally`, catch commun), qui a d'autres défauts, traités
       ailleurs dans ce fichier par les contrôles de § 2 et les mutants de § 10. */
    const AVANT = substituer(SRC_RECHARGER,
      '{ delaiMs: (options && options.delaiMs) || DELAI_LECTURE_EQUIPES_MS }',
      'undefined', 'lecture non bornée (état d\'avant)');

    const b = bac({ sourceRecharger: AVANT });
    scenarioAjout(b, 'pend');
    b.saisir('AVANT CORRECTIF');
    const p = b.lancerAjout();
    p.catch(function () {});
    await souffler();
    await b.horloge.avancer(120000);   // deux minutes : bien au-delà de tout budget

    verifier('8.1', '⛔ AVANT : après 2 minutes, l\'ajout est TOUJOURS fermé — c\'est le blocage constaté',
      b.ajoutFerme() === true, json({ ferme: b.ajoutFerme() }));

    verifier('8.2', '⛔ AVANT : l\'écran reste coincé en « actualisation en cours », sans issue',
      b.message().indexOf('Actualisation de la liste…') !== -1 && b.repriseVisible() === false,
      json({ msg: b.message(), reprise: b.repriseVisible() }));

    verifier('8.3', '⛔ AVANT : la lecture n\'est pas bornée — aucun signal d\'abandon n\'accompagne la requête',
      b.getsDe('getEquipes').length === 1 && b.getsDe('getEquipes')[0].borne === false,
      json({ borne: b.getsDe('getEquipes')[0].borne }));

    /* APRÈS : même scénario, code réel — il faut que ça se dénoue. */
    const c = bac();
    scenarioAjout(c, 'pend');
    c.saisir('APRES CORRECTIF');
    const q = c.lancerAjout();
    q.catch(function () {});
    await souffler();
    await c.horloge.avancer(120000);
    await q;

    verifier('8.4', '⭐ APRÈS : le même scénario se dénoue — état ③, reprise offerte, écran explicite',
      c.message().indexOf('n\'a PAS pu être actualisée') !== -1 && c.repriseVisible() === true,
      json({ msg: c.message(), reprise: c.repriseVisible() }));

    verifier('8.5', '⭐ APRÈS : l\'acquis de l\'écriture est préservé dans l\'écran d\'échec',
      c.message().indexOf('✅ « APRES CORRECTIF » ajoutée.') === 0, json({ msg: c.message() }));
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 9 — CONTRATS DE DR-6F PRÉSERVÉS : rien n\'est élargi, rien n\'est affaibli');

  {
    const src = lire(F_API);
    const b = bac();

    const listeGet = b.valeur('ACTIONS_GET_REJOUABLES');
    const listePost = b.valeur('ACTIONS_POST_REJOUABLES');
    verifier('9.1', 'les deux listes fermées de rejeu sont INCHANGÉES et toujours gelées',
      Object.isFrozen(listeGet) && Object.isFrozen(listePost) &&
      listeGet.length === 11 && listePost.length === 7 &&
      listePost.indexOf('ajouterEquipe') === -1 && listePost.indexOf('listerSponsors') === -1 &&
      listeGet.indexOf('getEquipes') !== -1,
      json({ get: listeGet.length, post: listePost.length }));

    verifier('9.2', 'le classement reste décidé par la LISTE FERMÉE seule, sur l\'action envoyée',
      /const rejouable = ACTIONS_POST_REJOUABLES\.indexOf\(corps\.action\) !== -1;/.test(src) &&
      /const rejouable = ACTIONS_GET_REJOUABLES\.indexOf\(url\.searchParams\.get\('action'\)\) !== -1;/.test(src),
      'motifs de classement introuvables');

    const codeApi = sansCommentaires(src);
    verifier('9.3', 'toujours DEUX fetch dans api.js, et UNE seule implémentation du rejeu',
      (codeApi.match(/\bfetch\(/g) || []).length === 2 &&
      (codeApi.match(/async function envoyerAvecRejeu404\(/g) || []).length === 1 &&
      (codeApi.match(/envoyerAvecRejeu404\(/g) || []).length === 3,
      json({ fetch: (codeApi.match(/\bfetch\(/g) || []).length,
             appels: (codeApi.match(/envoyerAvecRejeu404\(/g) || []).length }));
  }

  {
    /* apiPost SANS options : strictement l'ancien comportement. */
    const b = bac();
    b.reseau.programmer(function () { return { statut: 200, corps: { ok: true } }; });
    await b.ctx.apiPost('ajouterEquipe', { nom_equipe: 'X' });
    verifier('9.4', '⭐ apiPost SANS options : aucun signal, aucun minuteur — compatibilité stricte',
      b.reseau.journal[0].borne === false && b.horloge.restantes() === 0,
      json({ borne: b.reseau.journal[0].borne, minuteurs: b.horloge.restantes() }));
  }

  {
    /* Une ÉCRITURE qui reçoit un 404 n'est JAMAIS réémise, bornée ou non. */
    const b = bac();
    b.reseau.programmer(function () { return { statut: 404 }; });
    let leve = false;
    try { await b.ctx.apiPost('ajouterEquipe', { nom_equipe: 'X' }, { delaiMs: 20000 }); }
    catch (e) { leve = true; }
    verifier('9.5', '⛔ une écriture bornée qui reçoit un 404 reste à UNE émission et lève',
      leve === true && b.reseau.journal.length === 1 && b.horloge.restantes() === 0,
      json({ emissions: b.reseau.journal.length, leve: leve }));

    /* Une LECTURE de la liste fermée, elle, est bien réémise une fois. */
    const c = bac();
    c.reseau.programmer(function () { return { statut: 404 }; });
    const pc = c.ctx.apiPost('getConfigAdmin', {}, { delaiMs: 20000 });
    pc.catch(function () {});
    await souffler();
    await c.horloge.avancer(1000);
    try { await pc; } catch (e) { /* attendu */ }
    verifier('9.6', 'une LECTURE protégée de la liste fermée garde son rejeu unique (2 émissions)',
      c.reseau.journal.length === 2 && c.horloge.restantes() === 0,
      json({ emissions: c.reseau.journal.length }));
  }

  {
    const html = lire(F_HTML);
    verifier('9.7', 'la reprise ciblée existe dans la page, masquée au départ',
      /id="reprise-equipes"[^>]*hidden/.test(html) && html.indexOf('id="bouton-reprise-equipes"') !== -1,
      'bloc de reprise absent ou visible par défaut');
  }

  /* ---------------------------------------------------------------------- */
  titre('§ 10 — MUTANTS : chacun doit faire tomber au moins un contrôle ci-dessus');

  const mutants = [
    {
      code: 'Z.1', quoi: 'l\'état ② disparaît (le succès n\'est plus dit avant la lecture)',
      variante: function () {
        return { sourceActualiser: substituer(SRC_ACTUALISER,
          "afficherMessage(message, acquis + ' Actualisation de la liste…', 'ok');",
          '', 'mutant Z.1') };
      },
      tombe: async function (b) {
        scenarioAjout(b, 'pend');
        b.saisir('M');
        const p = b.lancerAjout(); p.catch(function () {});
        await souffler(); await b.horloge.avancer(1000);
        return b.message().indexOf('Actualisation de la liste…') === -1;
      }
    },
    {
      code: 'Z.2', quoi: 'l\'échec de LECTURE redevient un échec d\'écriture nu',
      variante: function () {
        return { sourceActualiser: substituer(SRC_ACTUALISER,
          "acquis + '\\n⚠️ La liste ci-dessous",
          "'' + '⚠️ La liste ci-dessous", 'mutant Z.2') };
      },
      tombe: async function (b) {
        scenarioAjout(b, { statut: 200, corpsIllisible: true });
        b.saisir('M');
        await b.lancerAjout();
        return b.message().indexOf('✅ « M » ajoutée.') !== 0;
      }
    },
    {
      code: 'Z.3', quoi: 'l\'ajout se rouvre malgré une liste périmée (porte ouverte au doublon)',
      variante: function () {
        return { sourceEquipes: substituer(SRC_EQUIPES,
          'listeEquipesIncertaine() || !ajoutPossibleEquipes();',
          '!ajoutPossibleEquipes();', 'mutant Z.3') };
      },
      tombe: async function (b) {
        scenarioAjout(b, { statut: 200, corpsIllisible: true });
        b.saisir('M');
        await b.lancerAjout();
        return b.ajoutFerme() === false;
      }
    },
    {
      code: 'Z.4', quoi: 'la reprise ciblée vide le formulaire (la saisie préparée est perdue)',
      variante: function () {
        return { sourceActualiser: SRC_ACTUALISER };
      },
      surMesure: async function () {
        const MUTANT = substituer(SRC_REPRISE,
          '    masquerRepriseEquipes();',
          "    masquerRepriseEquipes(); document.getElementById('champ-nom').value = '';", 'mutant Z.4');
        const b = bac();
        vm.runInContext(MUTANT, b.ctx);
        scenarioAjout(b, { statut: 200, corpsIllisible: true });
        b.saisir('M');
        await b.lancerAjout();
        b.el('champ-nom').value = 'SUIVANTE';
        b.reseau.programmer(function () { return { statut: 200, corps: [] }; });
        await b.ctx.onRepriseEquipes();
        return b.el('champ-nom').value !== 'SUIVANTE';
      }
    },
    {
      code: 'Z.5', quoi: 'la garde anti-double-lecture saute (les clics répétés doublent les lectures)',
      surMesure: async function () {
        const MUTANT = substituer(SRC_REPRISE, '  if (lectureEquipesEnCours()) return;', '', 'mutant Z.5');
        const b = bac();
        vm.runInContext(MUTANT, b.ctx);
        scenarioAjout(b, { statut: 200, corpsIllisible: true });
        b.saisir('M');
        await b.lancerAjout();
        b.reseau.programmer(function () { return { statut: 200, corps: [], apres: 3000 }; });
        const a = b.ctx.onRepriseEquipes(); a.catch(function () {});
        await souffler();
        const c = b.ctx.onRepriseEquipes(); c.catch(function () {});
        await souffler();
        const emises = b.getsDe('getEquipes').length;
        await b.horloge.avancer(5000);
        await Promise.all([a, c]);
        return emises > 2;
      }
    },
    {
      code: 'Z.6', quoi: 'le jeton de fraîcheur saute : une réponse tardive écrase l\'état récent',
      surMesure: async function () {
        const MUTANT = substituer(SRC_RECHARGER,
          '  if (!jetonEquipesValide(jeton)) return false;',
          '', 'mutant Z.6');
        const b = bac({ sourceRecharger: MUTANT });
        let appel = 0;
        b.reseau.programmer(function () {
          appel++;
          return appel === 1
            ? { statut: 200, corps: [{ id_equipe: 'VIEUX' }], apres: 8000 }
            : { statut: 200, corps: [{ id_equipe: 'N1' }, { id_equipe: 'N2' }], apres: 1000 };
        });
        const lente = b.ctx.rechargerEquipes(); lente.catch(function () {});
        await souffler();
        const rapide = b.ctx.rechargerEquipes(); rapide.catch(function () {});
        await b.horloge.avancer(12000);
        await Promise.all([lente.catch(function () {}), rapide.catch(function () {})]);
        return json(b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; })) === json(['VIEUX']);
      }
    },
    {
      code: 'Z.7', quoi: 'toute réponse JSON vaut « sans effet » (le défaut A d\'avant R1)',
      surMesure: async function () {
        const MUTANT = substituer(SRC_EQUIPES,
          "  if (rep && typeof rep === 'object' && 'acces_refuse' in rep) return rep.acces_refuse === true;",
          '  if (rep) return true;', 'mutant Z.7');
        const b = bac({ sourceEquipes: MUTANT });
        b.reseau.programmer(function (i) {
          return i.methode === 'POST'
            ? { statut: 200, corps: { error: 'Erreur serveur pendant l\'écriture.' } }
            : { statut: 200, corps: [] };
        });
        b.saisir('M');
        await b.lancerAjout();
        return b.message().indexOf('Impossible de savoir') === -1 && b.ajoutFerme() === false;
      }
    },
    {
      code: 'Z.10', quoi: 'B1 — le rendu des catégories rouvre l\'ajout verrouillé',
      surMesure: async function () {
        const MUTANT = substituer(SRC_EQUIPES, '  majDisponibiliteAjout();\n  [\'champ-joueurs\'',
          "  const boutonAj = document.getElementById('bouton-ajouter');\n" +
          '  if (boutonAj) boutonAj.disabled = aucune;\n  [\'champ-joueurs\'', 'mutant Z.10');
        const b = bac({ sourceEquipes: MUTANT });
        b.valeur('afficherRepriseEquipes')('✅ acquis.');
        b.ctx.remplirSelectCategories([{ categorie: 'U10', presente: 'oui' }]);
        return b.ajoutFerme() === false;
      }
    },
    {
      code: 'Z.11', quoi: 'B2 — le rafraîchissement global ignore le jeton et ramène la liste en arrière',
      surMesure: async function () {
        /* ⚠️ Pas de redéclaration du budget : `const` partage la portée lexicale du contexte vm,
           et la fonction mutée y résout donc la constante d'origine. */
        const MUTANT = substituer(bloc(F_ADMIN, 'async function rechargerEtRendre('),
            '  if (equipesFraiches) equipesCourantes = data.equipes;',
            '  equipesCourantes = data.equipes;', 'mutant Z.11');
        const b = bac();
        vm.runInContext(MUTANT, b.ctx);
        b.reseau.programmer(function (info) {
          return info.action === 'getAll'
            ? { statut: 200, corps: { equipes: [{ id_equipe: 'ANCIENNE' }], matchs: [] }, apres: 9000 }
            : { statut: 200, corps: [{ id_equipe: 'A' }], apres: 1000 };
        });
        const g = b.ctx.rechargerEtRendre({ equipes: true }); g.catch(function () {});
        await souffler();
        const c = b.ctx.rechargerEquipes(); c.catch(function () {});
        await b.horloge.avancer(14000);
        await Promise.all([g.catch(function () {}), c.catch(function () {})]);
        return json(b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; })) === json(['ANCIENNE']);
      }
    },
    {
      code: 'Z.12', quoi: 'C — le vrai chemin de « Rafraîchir » redevient non borné',
      surMesure: async function () {
        /* ⚠️ Pas de redéclaration du budget : `const` partage la portée lexicale du contexte vm,
           et la fonction mutée y résout donc la constante d'origine. */
        const MUTANT = substituer(bloc(F_ADMIN, 'async function rechargerEtRendre('),
            '  const budget = { delaiMs: DELAI_LECTURE_ADMIN_MS };',
            '  const budget = undefined;', 'mutant Z.12');
        const b = bac();
        vm.runInContext(MUTANT, b.ctx);
        b.reseau.programmer(function () { return 'pend'; });
        let fini = false;
        const p = b.ctx.rafraichirAdmin();
        p.then(function () { fini = true; }, function () { fini = true; });
        await souffler();
        await b.horloge.avancer(120000);
        return fini === false && b.el('bouton-rafraichir-admin').disabled === true;
      }
    },
    {
      code: 'Z.13', quoi: 'C — la mémoire est écrite AVANT la seconde lecture (réussite partielle silencieuse)',
      surMesure: async function () {
        /* ⚠️ Pas de redéclaration du budget : `const` partage la portée lexicale du contexte vm,
           et la fonction mutée y résout donc la constante d'origine. */
        const MUTANT = substituer(bloc(F_ADMIN, 'async function rechargerEtRendre('),
            '  const cfg = besoinConfig ? await lireConfigAdmin(undefined, budget) : null;',
            '  equipesCourantes = data.equipes;\n' +
            '  const cfg = besoinConfig ? await lireConfigAdmin(undefined, budget) : null;', 'mutant Z.13');
        const b = bac();
        vm.runInContext(MUTANT, b.ctx);
        b.ctx.equipesCourantes = [{ id_equipe: 'AVANT' }];
        b.reseau.programmer(function (info) {
          return info.methode === 'POST' ? { statut: 500 }
            : { statut: 200, corps: { equipes: [{ id_equipe: 'NOUVELLE' }], matchs: [] } };
        });
        try { await b.ctx.rechargerEtRendre({ equipes: true, publication: true }); } catch (e) { /* attendu */ }
        return json(b.ctx.equipesCourantes.map(function (e) { return e.id_equipe; })) === json(['NOUVELLE']);
      }
    },
    {
      code: 'Z.15', quoi: 'R2 — l\'opération en cours ne compte plus dans la disponibilité',
      surMesure: async function () {
        const MUTANT = substituer(SRC_EQUIPES,
          '  bouton.disabled = operationEquipesEnCours() || listeEquipesIncertaine()',
          '  bouton.disabled = listeEquipesIncertaine()', 'mutant Z.15');
        const b = bac({ sourceEquipes: MUTANT });
        b.reseau.programmer(function (i) { return i.methode === 'POST' ? 'pend' : { statut: 200, corps: [] }; });
        b.saisir('M');
        const p = b.lancerAjout(); p.catch(function () {});
        await souffler();
        b.ctx.remplirSelectCategories([{ categorie: 'U10', presente: 'oui' }]);
        return b.ajoutFerme() === false;
      }
    },
    {
      code: 'Z.16', quoi: 'R2 — la garde d\'entrée ignore l\'opération en cours (second POST possible)',
      surMesure: async function () {
        const MUTANT = substituer(SRC_EQUIPES,
          '  if (operationEquipesEnCours()) {', '  if (false) {', 'mutant Z.16');
        const b = bac({ sourceEquipes: MUTANT });
        b.reseau.programmer(function (i) { return i.methode === 'POST' ? 'pend' : { statut: 200, corps: [] }; });
        b.saisir('M');
        const p = b.lancerAjout(); p.catch(function () {});
        await souffler();
        b.el('bouton-ajouter').disabled = false;      // ce qu'un rendu de catégories faisait
        b.saisir('M');
        const q = b.lancerAjout(); q.catch(function () {});
        await souffler();
        return b.postsDe('ajouterEquipe').length > 1;
      }
    },
    {
      code: 'Z.17', quoi: 'R2 — le verrou de lecture est relâché par la FRAÎCHEUR (orphelin possible)',
      surMesure: async function () {
        const MUTANT = substituer(SRC_RECHARGER,
          '    if (lectureEquipesProprietaire === proprietaire) lectureEquipesProprietaire = null;',
          '    if (jetonEquipesValide(jeton)) lectureEquipesProprietaire = null;', 'mutant Z.17');
        const b = bac({ sourceRecharger: MUTANT });
        b.valeur('afficherRepriseEquipes')('✅ acquis.');
        b.reseau.programmer(function (info) {
          return info.action === 'getEquipes'
            ? { statut: 200, corps: [{ id_equipe: 'C' }], apres: 9000 }
            : { statut: 200, corps: { equipes: [{ id_equipe: 'G' }], matchs: [] }, apres: 1000 };
        });
        const ciblee = b.ctx.onRepriseEquipes(); ciblee.catch(function () {});
        await souffler();
        const global = b.ctx.rechargerEtRendre({ equipes: true }); global.catch(function () {});
        await b.horloge.avancer(60000);
        await ciblee.catch(function () {}); await global.catch(function () {});
        return b.valeur('lectureEquipesEnCours')() === true;   // verrou ORPHELIN
      }
    },
    {
      code: 'Z.18', quoi: 'R2 — l\'opération n\'est jamais libérée (blocage permanent de l\'ajout)',
      surMesure: async function () {
        const MUTANT = substituer(SRC_AJOUTER, '    terminerOperationEquipes();', '', 'mutant Z.18');
        const b = bac({ sourceAjouter: MUTANT });
        scenarioAjout(b, { statut: 200, corps: [{ id_equipe: 'E1', categorie: 'U10' }] });
        b.saisir('M');
        await b.lancerAjout();
        return b.valeur('operationEquipesEnCours')() === true && b.ajoutFerme() === true;
      }
    },
    {
      code: 'Z.14', quoi: 'A — la garde à l\'entrée de l\'ajout disparaît (mutation sur liste douteuse)',
      surMesure: async function () {
        const MUTANT = substituer(SRC_AJOUTER,
          "  if (refuserMutationSiIncertain(message, 'L\\'ajout d\\'équipe')) return;",
          '', 'mutant Z.14');
        const b = bac({ sourceAjouter: MUTANT });
        b.reseau.programmer(function () { return { statut: 200, corps: { ok: true } }; });
        b.valeur('afficherRepriseEquipes')('✅ acquis.');
        const avant = b.reseau.journal.length;
        b.saisir('M');
        await b.lancerAjout();
        return b.reseau.journal.length > avant;
      }
    },
    {
      code: 'Z.8', quoi: 'l\'échec de « Rafraîchir » redevient silencieux',
      surMesure: async function () {
        const MUTANT = substituer(bloc(F_ADMIN, 'async function rafraichirAdmin('),
          "      el.textContent = '⚠️ Non actualisé (' + ((err && err.message) || 'erreur inconnue') + ')';",
          '', 'mutant Z.8');
        const b = bac();
        vm.runInContext(MUTANT, b.ctx);
        b.ctx.rechargerEtRendre = async function () { throw new Error('404'); };
        await b.ctx.rafraichirAdmin();
        return b.el('maj-admin').textContent.indexOf('Non actualisé') === -1;
      }
    },
    {
      code: 'Z.9', quoi: 'apiPost borne TOUJOURS, même sans options (compatibilité rompue)',
      surMesure: async function () {
        const MUTANT = substituer(bloc(F_API, 'async function apiPost('),
          '  const delaiMs = options && options.delaiMs;',
          '  const delaiMs = (options && options.delaiMs) || 20000;', 'mutant Z.9');
        const b = bac();
        vm.runInContext(MUTANT, b.ctx);
        b.reseau.programmer(function () { return { statut: 200, corps: { ok: true } }; });
        await b.ctx.apiPost('ajouterEquipe', { nom_equipe: 'X' });
        return b.reseau.journal[0].borne === true;
      }
    }
  ];

  for (const m of mutants) {
    let tombe = false, detail = '';
    try {
      if (m.surMesure) tombe = await m.surMesure();
      else {
        const b = bac(m.variante());
        tombe = await m.tombe(b);
      }
    } catch (e) { detail = e.message; tombe = false; }
    verifier(m.code, 'mutant « ' + m.quoi + ' » : détecté',
      tombe === true, detail || 'le mutant n\'a PAS été vu — le contrôle correspondant ne prouve rien');
  }

  /* ---------------------------------------------------------------------- */
  console.log('\n' + '─'.repeat(70));
  if (echecs === 0) {
    console.log('OK — ' + total + ' contrôles passés.');
  } else {
    console.log('ÉCHEC — ' + echecs + ' contrôle(s) en défaut sur ' + total + ' :');
    details.forEach(function (d) { console.log('   · ' + d); });
    process.exitCode = 1;
  }
}

principal().catch(function (e) {
  console.error('\n💥 Le banc lui-même a échoué : ' + e.stack);
  process.exitCode = 1;
});
