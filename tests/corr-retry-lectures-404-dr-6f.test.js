/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — rejeu UNIQUE après un 404, pour des LISTES FERMÉES de
 *  lectures seulement, sous un abandon global qui réveille la pause
 *  Chantiers CORR-RETRY-LECTURES-404-DR-6F, 6F-R1 et 6F-R3
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/corr-retry-lectures-404-dr-6f.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *
 *  LE SYMPTÔME ATTÉNUÉ — la Web App répond par intermittence 404 au second saut
 *  (script.google.com → 302 → script.googleusercontent.com), alors que l'exécution Apps Script
 *  est « Terminée ». ⚠️ Mitigation frontend seulement : la cause, côté Google, n'est pas corrigée.
 *
 *  DÉCISIONS 6F-R3 PROTÉGÉES ICI :
 *   · GET : plus de « tout GET rejouable ». Liste FERMÉE de onze actions ; `getHistorique` (qui peut
 *     créer l'onglet Historique), `getPoules`, `getClassement` et toute action inconnue restent à
 *     UNE émission ;
 *   · POST : liste FERMÉE de sept actions ; `listerSponsors` et toute écriture restent à UNE émission ;
 *   · deux émissions au plus PAR INVOCATION ; un parcours `apiPostProtege` avec renouvellement de clé
 *     peut en compter quatre (deux cycles) ;
 *   · TEMPS : pas de limite murale absolue. Un seul abandon global, jamais réarmé ; même signal ;
 *     l'abandon RÉVEILLE la pause ; aucun second fetch si l'échéance est atteinte ou le signal
 *     abandonné ; aucun résidu à la fin de l'appel.
 *
 *  LE BANC DISTINGUE QUATRE INSTANTS : l'ÉCHÉANCE NOMINALE (t0 + delaiMs) ; l'EXÉCUTION RÉELLE du
 *  rappel d'abandon (minuterie éventuellement retardée) ; le BLOCAGE du thread principal (aucune
 *  tâche ne s'exécute) ; la DÉCISION prise juste avant le second fetch.
 *  Les dépassements de l'échéance nominale — qui n'apparaissent que si le navigateur retarde les
 *  minuteries ou bloque le thread, et dont une part vient de la pause du rejeu (voir « sans rejeu ») —
 *  sont MESURÉS et affichés à part (« ⚠ LIMITES ») : le respect de l'échéance n'y est jamais compté
 *  comme succès ; seuls sont comptés les faits vérifiés (aucun fetch tardif, dénouement à la première
 *  tâche qui s'exécute réellement, aucun résidu).
 *
 *  ⭐ CODE RÉEL : js/api.js est chargé ENTIER dans un contexte Node. Seuls sont doublés : fetch
 *  (faux serveur), le temps (horloge virtuelle derrière setTimeout ET performance.now, retards par
 *  minuterie, blocage du thread), sessionStorage et les dialogues. ⛔ Rien de js/api.js n'est recopié.
 *
 *  ⭐ AUTO-PREUVE (§ Z) : chaque mutant de js/api.js est rejoué contre les MÊMES critères que ceux
 *  qu'il doit faire échouer ; un mutant n'est « vu » que par un échec de comportement, jamais par
 *  une exception du harnais. Sinon, ce fichier ÉCHOUE.
 *
 *  ⚠️ URL, CLÉS, JETONS ET DONNÉES SONT FICTIFS. ⛔ Aucune requête ne quitte ce processus.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

/** ⚠️ Valeurs FICTIVES — inventées pour ce test, elles n'ouvrent rien. */
const API_URL_FACTICE = 'https://exemple.invalid/exec';   // ⛔ domaine réservé (RFC 2606) : ne résout jamais
const CLE_FACTICE = 'CLE-FACTICE-6F-lecture-protegee';
const CLE_SECONDE = 'CLE-FACTICE-6F-seconde-saisie';
const CLE_MEMO = 'CLE-FACTICE-6F-deja-rangee';
const JETON_FACTICE = 'JETON-FACTICE-6F-table';
const MARQUE_DONNEE = 'DONNEE-FACTICE-6F';
const SECRETS = [CLE_FACTICE, CLE_SECONDE, CLE_MEMO, JETON_FACTICE, MARQUE_DONNEE];

/** Décision 6F-R3 : les ONZE GET rejouables. */
const GET_ATTENDUES = ['getAll', 'getRefFFR', 'getConfig', 'getEquipes', 'getMatchs', 'getConformiteFFR',
  'datesCompatiblesFFR', 'getCapacitesCategories', 'getConfigClub', 'getClubDossier', 'getReponseInvitation'];

/** GET exclue : doGet → lireHistorique → assurerOngletHistorique → creerOngletAvecEntetes. */
const GET_EXCLUE = 'getHistorique';

/** GET non retenues par la décision (non appelées par le frontend). */
const GET_NON_RETENUES = ['getPoules', 'getClassement'];

/** GET pièges : inconnue, vide, casse, espaces, ressemblante, prototype. */
const GET_PIEGES = ['actionInconnue', '', 'getall', 'GETALL', 'GetAll', ' getAll', 'getAll ', 'get All', 'getAll2',
  'getHistoriques', 'ping', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'length', '0', undefined, null,
  'getConfigAdmin', 'getDossierAutorisation', 'lireMesuresSponsors', 'listerClubsInvites', 'getAccesScoresAdmin',
  'getMatchsLitige', 'getSaisieScores', 'listerSponsors'];

/** Paramètres fictifs des GET qui en portent (dont un jeton, pour la journalisation). */
const PARAMS_GET = {
  getConfigClub: { club: 'CLUB-FICTIF', token: JETON_FACTICE },
  getClubDossier: { club: 'CLUB-FICTIF', token: JETON_FACTICE },
  getReponseInvitation: { club: 'CLUB-FICTIF', token: JETON_FACTICE },
  getConformiteFFR: { date: '2026-09-23', categories: 'U8,U10', zone: 'fictive' },
  datesCompatiblesFFR: { mois: '2026-09', categories: 'U8', zone: 'fictive' }
};

/** Décision 6F-R3 : les SEPT POST rejouables. */
const POST_ATTENDUES = ['getConfigAdmin', 'getDossierAutorisation', 'lireMesuresSponsors',
  'listerClubsInvites', 'getAccesScoresAdmin', 'getMatchsLitige', 'getSaisieScores'];

/** POST exclue : listerSponsors → assurerOngletSponsors peut écrire. */
const POST_EXCLUE = 'listerSponsors';

/** Les écritures que le lot désigne nommément. */
const ECRITURES_SENSIBLES = ['changerAccesScores', 'creerConfirmationAccesScores', 'corrigerScoreLitige',
  'enregistrerScore', 'repondreInvitation', 'ajouterEquipe', 'supprimerEquipe'];

/** POST pièges. */
const POST_PIEGES = ['getConfig', 'getAll', 'getRefFFR', 'getAccesScores', 'lireConfig', 'listerEquipes',
  'getconfigadmin', 'GETCONFIGADMIN', 'getConfigAdmin ', ' getConfigAdmin', 'getSaisieScores2',
  'constructor', '__proto__', 'toString', 'hasOwnProperty', 'length', '0', '', undefined, null];

/** Délai nominal des scénarios temporels. */
const DELAI = 1000;

/* ========================================================================== */
/*  BANC — faux serveur, horloge virtuelle, stockage et dialogues doublés       */
/* ========================================================================== */

const BANCS = [];

/**
 * @param {Object} o
 *   plan     : réponses successives du faux serveur, une par émission —
 *              { status, corps, apresMs, lectureMs } | 'rejet' | 'json-illisible' | 'pend'
 *   retards  : function (ms, rang) → retard propre à CHAQUE minuterie du code (négatif : exécution
 *              en avance, comme un arrondi d'horloge). Les livraisons réseau ne sont pas retardées.
 *   saisies  : valeurs rendues, dans l'ordre, par dialogDemander (null = annuler)
 *   memo     : clé admin déjà rangée avant le chargement
 *   source   : texte de js/api.js à charger (mutants du § Z)
 *   suivi    : false pour exclure le banc des contrôles transverses (§ G)
 */
function banc(o) {
  o = o || {};
  const horloge = { t: 0 };
  let prochainId = 1;
  const file = [];          // tâches en attente : { id, execution, fn, interne }
  const minuteries = [];    // minuteries du CODE : { id, ms, echeance, execution, etat, executeeA }
  const appels = [];        // chaque appel à fetch
  const invocations = [];   // chaque invocation d'envoyerAvecRejeu404 : { emissions }
  const plan = (o.plan || []).slice();
  const journaux = [];
  const stockage = [];
  const accesLocal = [];
  const dialogues = [];
  const saisies = (o.saisies || []).slice();
  let invocationCourante = null;   // invocation d'envoyerAvecRejeu404 en train d'émettre (appel synchrone à fetch)

  function poser(fn, execution, interne) {
    const id = prochainId++;
    file.push({ id: id, execution: execution, fn: fn, interne: !!interne });
    return id;
  }
  function retirer(id) {
    const i = file.findIndex((m) => m.id === id);
    if (i !== -1) file.splice(i, 1);
    return i !== -1;
  }

  const donnees = new Map();
  if (o.memo) donnees.set('r92_cle_admin', o.memo);
  const sessionStorage = {
    getItem(k) { stockage.push(['get', k]); return donnees.has(k) ? donnees.get(k) : null; },
    setItem(k, v) { stockage.push(['set', k, String(v)]); donnees.set(k, String(v)); },
    removeItem(k) { stockage.push(['remove', k]); donnees.delete(k); }
  };
  const localStorage = new Proxy({}, { get(_, k) { accesLocal.push(String(k)); return () => null; } });

  const abandon = () => new DOMException('This operation was aborted', 'AbortError');

  /** Faux serveur : se comporte comme fetch — un signal déjà abandonné rejette SANS rien émettre. */
  function fetch(url, init) {
    init = init || {};
    const signal = init.signal || null;
    const appel = {
      t: horloge.t, url: String(url), methode: init.method || 'GET', corps: init.body, init: init,
      entetes: JSON.stringify(init.headers || null), cache: init.cache, signal: signal,
      signalAbandonne: !!(signal && signal.aborted), cleRangee: donnees.get('r92_cle_admin') || '',
      invocation: invocationCourante
    };
    appels.push(appel);
    if (appel.signalAbandonne) { appel.emise = false; return Promise.reject(abandon()); }
    appel.emise = true;
    const etape = plan.length ? plan.shift() : null;
    appel.imprevu = !etape;
    return new Promise(function (resoudre, rejeter) {
      let livraison = null;
      function livrer() {
        if (!etape) return rejeter(new Error('ÉMISSION IMPRÉVUE : le plan du banc est épuisé'));
        if (etape === 'rejet') return rejeter(new TypeError('Failed to fetch'));
        if (etape === 'pend') return;
        if (etape === 'json-illisible') {
          return resoudre({ ok: true, status: 200,
            json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')) });
        }
        const st = etape.status;
        const corps = () => JSON.parse(JSON.stringify(etape.corps || {}));
        // Lecture du corps éventuellement LENTE : comme dans un navigateur, l'abandon l'interrompt.
        const lireCorps = !etape.lectureMs ? () => Promise.resolve(corps()) : () => new Promise(function (ok, ko) {
          if (signal && signal.aborted) return ko(abandon());
          const lecture = poser(function () { ok(corps()); }, horloge.t + etape.lectureMs, true);
          if (signal) signal.addEventListener('abort', function () { retirer(lecture); ko(abandon()); }, { once: true });
        });
        resoudre({ ok: st >= 200 && st < 300, status: st, json: lireCorps });
      }
      if (signal) {
        signal.addEventListener('abort', function () {
          if (livraison) retirer(livraison);
          rejeter(abandon());
        }, { once: true });
      }
      const apres = (etape && etape.apresMs) || 0;
      if (apres > 0) livraison = poser(livrer, horloge.t + apres, true);
      else livrer();
    });
  }

  const espion = function () {
    journaux.push(Array.prototype.map.call(arguments, function (a) {
      try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); }
    }).join(' '));
  };

  const ctx = {
    console: { log: espion, info: espion, warn: espion, error: espion, debug: espion, trace: espion },
    API_URL: API_URL_FACTICE,                               // ← ce que config.js définirait
    URL: URL, AbortController: AbortController, fetch: fetch,
    setTimeout(fn, ms) {
      const duree = Math.max(0, Math.trunc(Number(ms) || 0));   // comme un navigateur : durée tronquée à l'entier
      const retard = o.retards ? (o.retards(duree, minuteries.length) || 0) : 0;
      const m = { ms: ms, echeance: horloge.t + duree, execution: horloge.t + duree + retard, etat: 'attente', executeeA: null };
      m.id = poser(function () { m.etat = 'executee'; m.executeeA = horloge.t; fn(); }, m.execution, false);
      minuteries.push(m);
      return m.id;
    },
    clearTimeout(id) {
      const m = minuteries.find((x) => x.id === id);
      if (retirer(id) && m) m.etat = 'effacee';
    },
    performance: { now: () => horloge.t },                  // ⏱️ horloge monotone, la même que les minuteries
    sessionStorage: sessionStorage, localStorage: localStorage,
    dialogDemander(message, defaut, opt) {
      dialogues.push({ type: 'demander', message: String(message), defaut: defaut, opt: opt || {},
        cleRangee: donnees.get('r92_cle_admin') || '' });
      return Promise.resolve(saisies.length ? saisies.shift() : null);
    },
    dialogAlerter(m) { dialogues.push({ type: 'alerter', message: String(m) }); return Promise.resolve(); },
    dialogConfirmer(m) { dialogues.push({ type: 'confirmer', message: String(m) }); return Promise.resolve(false); }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(o.source || lire('js/api.js'), ctx, { filename: 'js/api.js' });

  // Compteur PAR INVOCATION : on enveloppe la fonction globale réelle, sans rien changer à son comportement.
  const reelle = ctx.envoyerAvecRejeu404;
  if (typeof reelle !== 'function') {
    throw new Error('envoyerAvecRejeu404 introuvable dans js/api.js : mets ce garde-fou à jour, ne le supprime pas.');
  }
  ctx.envoyerAvecRejeu404 = function (emettre) {
    const inv = { emissions: 0 };
    invocations.push(inv);
    const args = Array.prototype.slice.call(arguments);
    args[0] = function () {
      const avant = invocationCourante;
      invocationCourante = inv;
      try { inv.emissions++; return emettre.apply(this, arguments); } finally { invocationCourante = avant; }
    };
    return reelle.apply(this, args);
  };

  /** Laisse s'écouler toutes les micro-tâches en attente. */
  async function vider() {
    for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));
  }

  /** Exécute, dans l'ordre de leur heure d'exécution prévue, les tâches prêtes au plus tard à `cible`. */
  async function executerPretes(cible) {
    for (;;) {
      let p = null;
      for (const m of file) {
        if (m.execution > cible) continue;
        if (!p || m.execution < p.execution || (m.execution === p.execution && m.id < p.id)) p = m;
      }
      if (!p) break;
      retirer(p.id);
      horloge.t = Math.max(horloge.t, p.execution);
      p.fn();
      await vider();
    }
  }

  async function avancer(ms) {
    const cible = horloge.t + ms;
    await vider();
    await executerPretes(cible);
    horloge.t = cible;
    await vider();
  }
  const avancerJusqua = (instant) => avancer(Math.max(0, instant - horloge.t));

  /** Thread principal BLOQUÉ pendant `duree` : l'horloge avance sans qu'aucune tâche ne s'exécute ;
   *  au déblocage, les tâches prêtes s'exécutent dans l'ordre de leur heure d'exécution prévue. */
  async function bloquer(duree) {
    await vider();
    horloge.t += duree;
    await executerPretes(horloge.t);
    await vider();
  }

  function suivre(promesse) {
    const s = { fini: false, valeur: undefined, erreur: null, t: null, enAttente: null };
    function clore() { s.fini = true; s.t = horloge.t; s.enAttente = file.filter((m) => !m.interne).length; }
    promesse.then(function (v) { s.valeur = v; clore(); }, function (e) { s.erreur = e; clore(); });
    return s;
  }

  /** Lance un appel, laisse courir une minute virtuelle, rend son suivi. */
  async function jouer(appeler) {
    const s = suivre(appeler(ctx));
    await avancer(60000);
    return s;
  }

  const b = {
    ctx, horloge, file, minuteries, appels, invocations, plan, journaux, stockage, accesLocal, dialogues, donnees,
    avancer, avancerJusqua, bloquer, suivre, jouer,
    valeur: (expr) => vm.runInContext(expr, ctx),
    emissions: () => appels.filter((a) => a.emise).length,
    parInvocation: () => invocations.map((i) => i.emissions),
    ecritures: () => stockage.filter((x) => x[0] !== 'get')
  };
  if (o.suivi !== false) BANCS.push(b);
  return b;
}

/* ========================================================================== */
/*  OUTILS                                                                    */
/* ========================================================================== */

let reussis = 0;
const echecs = [];

function verifier(numero, intitule, condition, detail) {
  if (condition) { reussis++; console.log('  ✓ [' + numero + '] ' + intitule); }
  else { echecs.push('[' + numero + '] ' + intitule + (detail ? ' — ' + detail : ''));
         console.log('  ✗ [' + numero + '] ' + intitule + (detail ? ' — ' + detail : '')); }
}

const json = (v) => JSON.stringify(v);
const R = (status, corps, apresMs) => ({ status: status, corps: corps, apresMs: apresMs });
const OK = (corps) => R(200, corps || { ok: true });
const erreurHttp = (s, st) => !!(s.fini && s.erreur && String(s.erreur.message).indexOf('(' + st + ')') !== -1);
const succes = (s) => !!(s.fini && !s.erreur && s.valeur);

function nature(s) {
  if (!s.fini) return 'en attente';
  if (!s.erreur) return 'succès';
  if (s.erreur.name === 'AbortError') return 'AbortError';
  const m = /\((\d{3})\)/.exec(String(s.erreur.message));
  return m ? 'HTTP ' + m[1] : s.erreur.name + ' : ' + s.erreur.message;
}

/** Retire les commentaires d'un source (pour les recensements statiques). */
function sansCommentaires(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"])\/\/.*$/gm, '$1');
}

/** Découpe une déclaration de fonction de premier niveau, par équilibrage des accolades. */
function blocFonction(src, entete) {
  const debut = src.indexOf(entete);
  if (debut === -1) throw new Error('Déclaration introuvable dans js/api.js : « ' + entete + ' »');
  let profondeur = 0;
  for (let i = src.indexOf('{', debut); i < src.length; i++) {
    if (src[i] === '{') profondeur++;
    else if (src[i] === '}' && --profondeur === 0) return src.slice(debut, i + 1);
  }
  throw new Error('Accolades déséquilibrées autour de « ' + entete + ' »');
}

/** Fichiers JavaScript de la page (hors api.js). */
function sourcesPage() {
  return fs.readdirSync(path.join(RACINE, 'js')).filter((f) => f.endsWith('.js') && f !== 'api.js')
    .map((f) => ({ nom: 'js/' + f, src: lire('js/' + f) }));
}

/** Toutes les actions POST nommées en dur dans le code de la page (js/*.js). */
function actionsPostDuCode() {
  const noms = new Set();
  sourcesPage().concat([{ nom: 'js/api.js', src: lire('js/api.js') }]).forEach(function (f) {
    [/\b(?:apiPost|apiPostProtege|ecrireAdmin)\(\s*'([A-Za-z]\w*)'/g, /\baction:\s*'([A-Za-z]\w*)'/g]
      .forEach(function (motif) {
        let m;
        while ((m = motif.exec(f.src))) noms.add(m[1]);
      });
  });
  return Array.from(noms).sort();
}

/** Deux émissions GET STRICTEMENT identiques : adresse (action, paramètres, anti-cache), réglages, signal. */
function getIdentiques(b, action, params) {
  const [x, y] = b.appels;
  if (!x || !y) return false;
  const u = new URL(x.url);
  const parametres = Object.keys(params || {}).every((k) => u.searchParams.get(k) === String(params[k]));
  return x.url === y.url && u.searchParams.get('action') === action && parametres && u.searchParams.get('_') !== null &&
    x.methode === 'GET' && y.methode === 'GET' && x.init === y.init && x.cache === 'no-store' && y.cache === 'no-store' &&
    x.signal === y.signal && x.corps === undefined && y.corps === undefined;
}

/* ========================================================================== */
/*  SCÉNARIOS                                                                 */
/* ========================================================================== */

let D = null;   // DELAI_REJEU_404_MS réel, lu au démarrage

async function getFlux(source, suivi, action, params, plan, options) {
  const b = banc({ source, suivi, plan });
  const s = await b.jouer((c) => c.apiGet(action, params, options));
  return { b, s };
}

async function postFlux(source, suivi, action, data, plan) {
  const b = banc({ source, suivi, plan });
  const s = await b.jouer((c) => c.apiPost(action, data));
  return { b, s };
}

/**
 * Scénario temporel : apiGet(action, null, { delaiMs }).
 * @param o { plan, retards, blocage: [debut, fin], sondes: [instants], action, delaiMs (DELAI par défaut) }
 */
async function scenTemps(source, suivi, o) {
  const b = banc({ source, suivi, plan: o.plan, retards: o.retards });
  const delai = o.delaiMs || DELAI;
  const s = b.suivre(b.ctx.apiGet(o.action || 'getAll', null, { delaiMs: delai }));
  const sondes = {};
  for (const instant of (o.sondes || [])) {
    await b.avancerJusqua(instant);
    sondes[instant] = { fini: s.fini, appels: b.appels.length };
  }
  if (o.blocage) {
    await b.avancerJusqua(o.blocage[0]);
    await b.bloquer(o.blocage[1] - o.blocage[0]);
  }
  await b.avancer(60000);
  const ab = b.minuteries.find((m) => m.ms === delai) || null;
  const pa = b.minuteries.find((m) => m.ms === D) || null;
  const vue = (m) => m && { echeance: m.echeance, execution: m.execution, etat: m.etat, executeeA: m.executeeA };
  return {
    b, s, sondes, fin: s.t, nature: nature(s), appels: b.appels.length, tAppels: b.appels.map((a) => a.t),
    fetchSurSignalAbandonne: b.appels.filter((a) => a.signalAbandonne).length,
    memeSignal: b.appels.length > 0 && !!b.appels[0].signal && b.appels.every((a) => a.signal === b.appels[0].signal),
    durees: b.minuteries.map((m) => m.ms), abandon: vue(ab), pause: vue(pa),
    enAttente: s.enAttente, parInvocation: b.parInvocation(), planRestant: b.plan.length
  };
}

const resume = (o) => json({ fin: o.fin, nature: o.nature, appels: o.tAppels, surSignalAbandonne: o.fetchSurSignalAbandonne,
  durees: o.durees, abandon: o.abandon, pause: o.pause, enAttente: o.enAttente, inv: o.parInvocation, sondes: o.sondes });

/** Scénarios temporels nommés — partagés par les critères § C et les limites mesurées. */
const TEMPS = {
  pauseNormale: { plan: [R(404, null, 400), OK({ ok: true })] },
  tropProche: { plan: [R(404, null, 900), OK()] },
  seuilPile: () => ({ plan: [R(404, null, DELAI - D), OK()] }),
  seuilJuste: () => ({ plan: [R(404, null, DELAI - 1 - D), 'pend'], sondes: [DELAI - 1] }),
  pauseRetardee: () => ({ plan: [R(404, null, 400), OK()], retards: (ms) => (ms === D ? 800 : 0), sondes: [DELAI - 1] }),
  abandonEtPauseRetardes: () => ({ plan: [R(404, null, 400), OK()], retards: (ms) => (ms === D ? 800 : (ms === DELAI ? 200 : 0)) }),
  abandonAvantEcheanceLue: () => ({ plan: [R(404, null, 650), OK()], retards: (ms) => (ms === DELAI ? -1 : (ms === D ? 100 : 0)) }),
  pausePileEcheance: () => ({ plan: [R(404, null, 400), OK()], retards: (ms) => (ms === D ? DELAI - 400 - D : (ms === DELAI ? 50 : 0)) }),
  toutRetarde: { plan: [R(404, null, 400), OK()], retards: () => 500 },
  blocage: { plan: [R(404, null, 400), OK()], blocage: [600, 1300] },
  livraisonPendantBlocage: { plan: [R(404, null, 650), OK()], blocage: [600, 1300] },
  premiereEmissionPendante: { plan: ['pend'] },
  deux404: { plan: [R(404, null, 400), R(404)] },
  corpsLentApresRejeu: { plan: [R(404, null, 400), { status: 200, corps: { ok: true }, apresMs: 100, lectureMs: 300 }] },
  delaiNonEntier: { plan: [R(404, null, 700.5), OK()], delaiMs: 1000.9 }
};
const temps = (nom) => (typeof TEMPS[nom] === 'function' ? TEMPS[nom]() : TEMPS[nom]);

/** Nouvelle clé : 404 puis 200, avec une sonde au milieu de la pause. */
async function scenCleNeuve(source, suivi) {
  const a = banc({ source, suivi, saisies: [CLE_FACTICE], plan: [R(404), OK({ ok: true, config: {} })] });
  const s = a.suivre(a.ctx.apiPostProtege('getConfigAdmin', {}, 'admin', 'admin'));
  await a.avancer(Math.floor(D / 2));
  const pendantPause = { emissions: a.emissions(), rangee: a.donnees.has('r92_cle_admin'), ecritures: a.ecritures().length };
  await a.avancer(60000);
  return { a, s, pendantPause };
}

/** Parcours protégé complet : clé 1 → 404 puis refus → effacement → clé 2 → 404 puis succès. */
async function scenQuatreEmissions(source, suivi) {
  const b = banc({ source, suivi, saisies: [CLE_FACTICE, CLE_SECONDE],
    plan: [R(404), OK({ error: 'Clé admin incorrecte.', acces_refuse: true }), R(404), OK({ ok: true, config: {} }), OK()] });
  const s = await b.jouer((c) => c.apiPostProtege('getConfigAdmin', {}, 'admin', 'admin'));
  return { b, s, cles: b.appels.map((a) => a.corps && JSON.parse(a.corps).cle) };
}

/* ========================================================================== */
/*  CRITÈRES — chacun rejouable contre une source quelconque (§ Z)             */
/* ========================================================================== */

const SECTIONS = [];
const CRITERES = {};
const OBS = {};

function section(titre) { SECTIONS.push({ titre: titre, criteres: [] }); }
function critere(id, intitule, jouer, ok, detail) {
  if (CRITERES[id]) throw new Error('Identifiant de contrôle en double : ' + id);
  const c = { id: id, intitule: intitule, jouer: jouer, ok: ok, detail: detail || (() => '') };
  SECTIONS[SECTIONS.length - 1].criteres.push(c);
  CRITERES[id] = c;
}

/* ---- A — GET ------------------------------------------------------------ */
section('A — GET : liste fermée de onze lectures rejouables, tout le reste à une émission');

GET_ATTENDUES.forEach(function (action, i) {
  const params = PARAMS_GET[action] || null;
  critere('A.' + (i + 1), action + ' : 404→200 → deux émissions identiques puis succès ; 404→404 → deux émissions puis erreur',
    async (src, suivi) => ({
      oui: await getFlux(src, suivi, action, params, [R(404), OK({ ok: true, lu: action })]),
      non: await getFlux(src, suivi, action, params, [R(404), R(404), OK()])
    }),
    (o) => o.oui.b.appels.length === 2 && json(o.oui.b.parInvocation()) === '[2]' && getIdentiques(o.oui.b, action, params) &&
      o.oui.b.appels[1].t - o.oui.b.appels[0].t === D && succes(o.oui.s) && o.oui.s.valeur.lu === action &&
      o.non.b.appels.length === 2 && json(o.non.b.parInvocation()) === '[2]' && o.non.b.plan.length === 1 && erreurHttp(o.non.s, 404),
    (o) => json({ oui: o.oui.b.appels.length, inv: o.oui.b.parInvocation(), non: o.non.b.appels.length, invNon: o.non.b.parInvocation() }));
});

critere('A.12', 'getAll avec délai (usage de tournoi.js, 12 000 ms) : 404→200 → mêmes adresse et réglages, MÊME signal global, abandon effacé, aucun résidu',
  (src, suivi) => getFlux(src, suivi, 'getAll', null, [R(404), OK({ ok: true })], { delaiMs: 12000 }),
  (o) => o.b.appels.length === 2 && getIdentiques(o.b, 'getAll', null) && !!o.b.appels[0].signal &&
    json(o.b.minuteries.map((m) => m.ms)) === json([12000, D]) && o.b.minuteries[0].etat === 'effacee' && succes(o.s) && o.s.enAttente === 0,
  (o) => json({ appels: o.b.appels.length, signal: !!(o.b.appels[0] && o.b.appels[0].signal), minuteries: o.b.minuteries.map((m) => [m.ms, m.etat]) }));

critere('A.13', 'getHistorique (exclue : peut créer l\'onglet) : 404 puis 200 prévu → UNE émission, erreur 404, réponse suivante non consommée ; 404 puis 404 → UNE émission',
  async (src, suivi) => ({
    a: await getFlux(src, suivi, GET_EXCLUE, null, [R(404), OK({ ok: true })]),
    b: await getFlux(src, suivi, GET_EXCLUE, null, [R(404), R(404)])
  }),
  (o) => o.a.b.appels.length === 1 && erreurHttp(o.a.s, 404) && o.a.b.plan.length === 1 && o.a.b.minuteries.length === 0 &&
    o.b.b.appels.length === 1 && erreurHttp(o.b.s, 404),
  (o) => json({ a: o.a.b.appels.length, b: o.b.b.appels.length }));

critere('A.14', 'getPoules et getClassement (non retenues) : 404 → UNE émission',
  async (src, suivi) => {
    const r = {};
    for (const a of GET_NON_RETENUES) r[a] = await getFlux(src, suivi, a, null, [R(404), OK()]);
    return r;
  },
  (o) => GET_NON_RETENUES.every((a) => o[a].b.appels.length === 1 && erreurHttp(o[a].s, 404) && o[a].b.minuteries.length === 0),
  (o) => json(GET_NON_RETENUES.map((a) => [a, o[a].b.appels.length])));

critere('A.15', 'GET inconnue, vide, casse différente, espaces, ressemblante, prototype (' + GET_PIEGES.length + ') : 404 → UNE émission',
  async (src, suivi) => {
    const fautifs = [];
    for (const a of GET_PIEGES) {
      const r = await getFlux(src, suivi, a, null, [R(404), OK()]);
      if (!(r.b.appels.length === 1 && erreurHttp(r.s, 404) && r.b.minuteries.length === 0)) fautifs.push(String(a));
    }
    return fautifs;
  },
  (fautifs) => fautifs.length === 0, (fautifs) => json(fautifs));

critere('A.16', 'classement sur l\'action RÉELLEMENT envoyée : getAll écrasée en getHistorique par les paramètres → une émission ; l\'inverse → deux',
  async (src, suivi) => ({
    versExclue: await getFlux(src, suivi, 'getAll', { action: GET_EXCLUE }, [R(404), OK()]),
    versListe: await getFlux(src, suivi, GET_EXCLUE, { action: 'getAll' }, [R(404), OK({ ok: true })])
  }),
  (o) => o.versExclue.b.appels.length === 1 && new URL(o.versExclue.b.appels[0].url).searchParams.get('action') === GET_EXCLUE &&
    o.versListe.b.appels.length === 2 && new URL(o.versListe.b.appels[0].url).searchParams.get('action') === 'getAll' && succes(o.versListe.s),
  (o) => json({ versExclue: o.versExclue.b.appels.length, versListe: o.versListe.b.appels.length }));

const ISSUES_UNE_EMISSION = [
  ['HTTP 500', [R(500), OK()], (s) => erreurHttp(s, 500)],
  ['HTTP 403', [R(403), OK()], (s) => erreurHttp(s, 403)],
  ['HTTP 502', [R(502), OK()], (s) => erreurHttp(s, 502)],
  ['rejet réseau', ['rejet', OK()], (s) => !!(s.erreur && s.erreur.name === 'TypeError')],
  ['JSON illisible', ['json-illisible', OK()], (s) => !!(s.erreur && s.erreur.name === 'SyntaxError')],
  ['HTTP 200 { error }', [OK({ error: 'Erreur serveur pendant la lecture.' }), OK()], (s) => !!(s.erreur && s.erreur.message === 'Erreur serveur pendant la lecture.')]
];

critere('A.17', 'GET rejouables (getAll, getConfigClub) : autre statut, rejet réseau, JSON illisible, erreur applicative → UNE émission, aucune pause',
  async (src, suivi) => {
    const fautifs = [];
    for (const action of ['getAll', 'getConfigClub']) {
      for (const [nom, plan, attendu] of ISSUES_UNE_EMISSION) {
        const r = await getFlux(src, suivi, action, PARAMS_GET[action] || null, plan.slice());
        if (!(r.b.appels.length === 1 && r.b.minuteries.length === 0 && attendu(r.s))) fautifs.push(action + ' / ' + nom);
      }
    }
    return fautifs;
  },
  (fautifs) => fautifs.length === 0, (fautifs) => json(fautifs));

critere('A.18', 'témoin : GET 200 du premier coup → une émission, aucune pause',
  (src, suivi) => getFlux(src, suivi, 'getAll', null, [OK({ ok: true }), OK()]),
  (o) => o.b.appels.length === 1 && succes(o.s) && o.b.minuteries.length === 0);

/* ---- B — POST ----------------------------------------------------------- */
section('B — POST : liste fermée de sept lectures rejouables, listerSponsors et écritures à une émission');

const DONNEES_LECTURE = () => ({ cle: CLE_FACTICE, jeton: JETON_FACTICE, marque: MARQUE_DONNEE, liste: [1, 2] });

critere('B.1', 'les 7 POST rejouables : 404→200 → deux émissions (une invocation), même action, corps et en-têtes identiques, succès, données intactes',
  async (src, suivi) => {
    const fautifs = [];
    for (const action of POST_ATTENDUES) {
      const data = DONNEES_LECTURE();
      const { b, s } = await postFlux(src, suivi, action, data, [R(404), OK({ ok: true, lu: action })]);
      const [x, y] = b.appels;
      const ok = b.appels.length === 2 && json(b.parInvocation()) === '[2]' && typeof x.corps === 'string' && x.corps === y.corps &&
        JSON.parse(x.corps).action === action && x.methode === 'POST' && y.methode === 'POST' && x.url === API_URL_FACTICE &&
        y.url === API_URL_FACTICE && x.entetes === y.entetes && x.signal === null && y.signal === null &&
        json(Object.assign({}, JSON.parse(x.corps), { action: undefined })) === json(Object.assign({ action: undefined }, DONNEES_LECTURE())) &&
        succes(s) && s.valeur.lu === action && json(data) === json(DONNEES_LECTURE());
      if (!ok) fautifs.push(action);
    }
    return fautifs;
  },
  (fautifs) => fautifs.length === 0, (fautifs) => json(fautifs));

critere('B.2', 'les 7 POST rejouables : 404→404 → deux émissions, jamais de troisième, erreur 404',
  async (src, suivi) => {
    const fautifs = [];
    for (const action of POST_ATTENDUES) {
      const { b, s } = await postFlux(src, suivi, action, DONNEES_LECTURE(), [R(404), R(404), OK()]);
      if (!(b.appels.length === 2 && json(b.parInvocation()) === '[2]' && b.plan.length === 1 && erreurHttp(s, 404))) fautifs.push(action);
    }
    return fautifs;
  },
  (fautifs) => fautifs.length === 0, (fautifs) => json(fautifs));

critere('B.3', 'les 7 POST rejouables : autre statut, rejet réseau, JSON illisible, erreur applicative, refus de clé → UNE émission',
  async (src, suivi) => {
    const fautifs = [];
    const issues = ISSUES_UNE_EMISSION.concat([['refus de clé', [OK({ error: 'Clé admin incorrecte.', acces_refuse: true }), OK()],
      (s) => !!(s.erreur && s.erreur.reponse && s.erreur.reponse.acces_refuse === true)]]);
    for (const action of POST_ATTENDUES) {
      for (const [nom, plan, attendu] of issues) {
        const { b, s } = await postFlux(src, suivi, action, DONNEES_LECTURE(), plan.slice());
        if (!(b.appels.length === 1 && b.minuteries.length === 0 && attendu(s))) fautifs.push(action + ' / ' + nom);
      }
    }
    return fautifs;
  },
  (fautifs) => fautifs.length === 0, (fautifs) => json(fautifs));

critere('B.4', 'listerSponsors : apiPost 404→200 prévu, apiPost 404→404, apiPostProtege (clé rangée), apiPostProtege (clé neuve) → UNE émission chacun, rien de rangé',
  async (src, suivi) => {
    const a = await postFlux(src, suivi, POST_EXCLUE, { cle: CLE_FACTICE }, [R(404), OK({ ok: true, sponsors: [] })]);
    const b = await postFlux(src, suivi, POST_EXCLUE, { cle: CLE_FACTICE }, [R(404), R(404)]);
    const c = banc({ source: src, suivi, memo: CLE_MEMO, plan: [R(404), OK({ ok: true, sponsors: [] })] });
    const sc = await c.jouer((x) => x.apiPostProtege(POST_EXCLUE, {}, 'admin', 'admin'));
    const d = banc({ source: src, suivi, saisies: [CLE_FACTICE], plan: [R(404), OK({ ok: true, sponsors: [] })] });
    const sd = await d.jouer((x) => x.apiPostProtege(POST_EXCLUE, {}, 'admin', 'admin'));
    return { a, b, c, sc, d, sd };
  },
  (o) => o.a.b.appels.length === 1 && erreurHttp(o.a.s, 404) && o.a.b.plan.length === 1 && o.a.b.minuteries.length === 0 &&
    o.b.b.appels.length === 1 &&
    o.c.appels.length === 1 && erreurHttp(o.sc, 404) && o.c.dialogues.length === 0 && o.c.ecritures().length === 0 && o.c.donnees.get('r92_cle_admin') === CLE_MEMO &&
    o.d.appels.length === 1 && erreurHttp(o.sd, 404) && o.d.dialogues.length === 1 && o.d.ecritures().length === 0,
  (o) => json([o.a.b.appels.length, o.b.b.appels.length, o.c.appels.length, o.d.appels.length]));

ECRITURES_SENSIBLES.forEach(function (action, i) {
  critere('B.' + (5 + i), action + ' + 404 → UNE émission, erreur 404, aucune pause',
    (src, suivi) => postFlux(src, suivi, action, { cle: CLE_FACTICE, marque: MARQUE_DONNEE }, [R(404), OK()]),
    (o) => o.b.appels.length === 1 && erreurHttp(o.s, 404) && o.b.minuteries.length === 0 && o.b.plan.length === 1,
    (o) => o.b.appels.length + ' émission(s)');
});

const ACTIONS_POST_CODE = actionsPostDuCode().filter((a) => POST_ATTENDUES.indexOf(a) === -1);
critere('B.12', 'toutes les actions POST nommées dans js/*.js hors liste (' + ACTIONS_POST_CODE.length + ', dont listerSponsors et les écritures sensibles) → UNE émission',
  async (src, suivi) => {
    const fautifs = [];
    for (const action of ACTIONS_POST_CODE) {
      const r = await postFlux(src, suivi, action, { cle: CLE_FACTICE }, [R(404), OK()]);
      if (!(r.b.appels.length === 1 && erreurHttp(r.s, 404))) fautifs.push(action);
    }
    return fautifs;
  },
  (fautifs) => ACTIONS_POST_CODE.length >= 40 && ACTIONS_POST_CODE.indexOf(POST_EXCLUE) !== -1 &&
    ECRITURES_SENSIBLES.every((a) => ACTIONS_POST_CODE.indexOf(a) !== -1) && fautifs.length === 0,
  (fautifs) => json({ n: ACTIONS_POST_CODE.length, fautifs }));

critere('B.13', 'POST pièges (' + POST_PIEGES.length + ' : ressemblants, casse, espaces, prototype, vides) → UNE émission',
  async (src, suivi) => {
    const fautifs = [];
    for (const action of POST_PIEGES) {
      const r = await postFlux(src, suivi, action, { cle: CLE_FACTICE }, [R(404), OK()]);
      if (!(r.b.appels.length === 1 && erreurHttp(r.s, 404))) fautifs.push(String(action));
    }
    return fautifs;
  },
  (fautifs) => fautifs.length === 0, (fautifs) => json(fautifs));

critere('B.14', 'classement sur l\'action RÉELLEMENT envoyée : lecture écrasée en écriture par data.action → une émission ; l\'inverse → deux',
  async (src, suivi) => ({
    versEcriture: await postFlux(src, suivi, 'getConfigAdmin', { action: 'supprimerEquipe', id_equipe: MARQUE_DONNEE }, [R(404), OK()]),
    versLecture: await postFlux(src, suivi, 'supprimerEquipe', { action: 'getMatchsLitige' }, [R(404), OK({ ok: true })])
  }),
  (o) => o.versEcriture.b.appels.length === 1 && JSON.parse(o.versEcriture.b.appels[0].corps).action === 'supprimerEquipe' &&
    o.versLecture.b.appels.length === 2 && o.versLecture.b.appels.every((a) => JSON.parse(a.corps).action === 'getMatchsLitige') && succes(o.versLecture.s),
  (o) => json([o.versEcriture.b.appels.length, o.versLecture.b.appels.length]));

critere('B.17', 'corps FIGÉ : les données imbriquées de l\'appelant modifiées PENDANT la pause ne changent pas le corps rejoué',
  async (src, suivi) => {
    const data = { cle: CLE_FACTICE, filtre: { categorie: 'U8' } };
    const b = banc({ source: src, suivi, plan: [R(404), OK({ ok: true })] });
    const s = b.suivre(b.ctx.apiPost('getMatchsLitige', data));
    await b.avancer(Math.floor(D / 2));
    data.filtre.categorie = 'U10';
    await b.avancer(60000);
    return { b, s };
  },
  (o) => o.b.appels.length === 2 && o.b.appels[0].corps === o.b.appels[1].corps &&
    JSON.parse(o.b.appels[1].corps).filtre.categorie === 'U8' && succes(o.s),
  (o) => json(o.b.appels.map((a) => a.corps && JSON.parse(a.corps).filtre)));

critere('B.15', 'écriture par apiPostProtege (chemin d\'ecrireAdmin) : changerAccesScores + 404 → une émission, aucune saisie, clé rangée intacte',
  async (src, suivi) => {
    const b = banc({ source: src, suivi, memo: CLE_MEMO, plan: [R(404), OK()] });
    const s = await b.jouer((c) => c.apiPostProtege('changerAccesScores', { geste: 'PREPARER' }, 'admin', 'admin'));
    return { b, s };
  },
  (o) => o.b.appels.length === 1 && erreurHttp(o.s, 404) && o.b.dialogues.length === 0 && o.b.ecritures().length === 0 &&
    o.b.donnees.get('r92_cle_admin') === CLE_MEMO);

critere('B.16', 'sonde de clé (écriture sentinelle enregistrerScore) + 404 → une émission, l\'erreur remonte',
  async (src, suivi) => {
    const b = banc({ source: src, suivi, plan: [R(404), OK()] });
    const s = await b.jouer((c) => c.cleValide('scores', CLE_FACTICE));
    return { b, s };
  },
  (o) => o.b.appels.length === 1 && JSON.parse(o.b.appels[0].corps).action === 'enregistrerScore' && erreurHttp(o.s, 404));

/* ---- C — temps et abandon ---------------------------------------------- */
section('C — Temps et abandon (délai nominal ' + DELAI + ' ms) : échéance nominale, exécution réelle de l\'abandon, blocage, décision avant le second fetch');

critere('C.1', 'pause normale : 1er fetch à 0 ms, 404 reçu à 400 ms → second fetch à 700 ms, même signal, succès à 700 ms (≤ échéance), minuteries [1000, 300], abandon effacé, aucun résidu',
  (src, suivi) => scenTemps(src, suivi, temps('pauseNormale')),
  (o) => o.fin === 400 + D && o.nature === 'succès' && json(o.tAppels) === json([0, 400 + D]) && o.memeSignal &&
    json(o.durees) === json([DELAI, D]) && o.abandon.etat === 'effacee' && o.pause.etat === 'executee' && o.enAttente === 0 &&
    o.fin <= o.abandon.echeance && json(o.parInvocation) === '[2]', resume);

critere('C.2', '404 trop proche de l\'échéance (900 ms) : AUCUNE pause, aucun rejeu, 404 rendu aussitôt (900 ms), abandon effacé, aucun résidu',
  (src, suivi) => scenTemps(src, suivi, temps('tropProche')),
  (o) => o.fin === 900 && o.nature === 'HTTP 404' && o.appels === 1 && json(o.durees) === json([DELAI]) &&
    o.abandon.etat === 'effacee' && o.enAttente === 0 && o.planRestant === 1, resume);

critere('C.3', 'seuil : 404 à 700 ms (pause finissant PILE à l\'échéance) → aucune pause, aucun rejeu, 404 à 700 ms',
  (src, suivi) => scenTemps(src, suivi, temps('seuilPile')),
  (o) => o.fin === DELAI - D && o.nature === 'HTTP 404' && o.appels === 1 && json(o.durees) === json([DELAI]) && o.enAttente === 0, resume);

critere('C.4', 'seuil : 404 reçu à 699 ms → second fetch à 999 ms avec le MÊME signal ; en cours à 999 ms ; AbortError à 1000 ms, instant d\'exécution de l\'abandon ; minuteries [1000, 300]',
  (src, suivi) => scenTemps(src, suivi, temps('seuilJuste')),
  (o) => json(o.tAppels) === json([0, DELAI - 1]) && o.memeSignal && o.sondes[DELAI - 1].fini === false &&
    o.fin === DELAI && o.abandon.executeeA === DELAI && o.nature === 'AbortError' && json(o.durees) === json([DELAI, D]) &&
    o.enAttente === 0 && o.fetchSurSignalAbandonne === 0, resume);

critere('C.5', 'abandon exécuté PENDANT une pause retardée (réveil prévu à 1500 ms) : la pause est RÉVEILLÉE par l\'abandon → 404 rendu à 1000 ms, aucun second fetch, minuteur de pause effacé',
  (src, suivi) => scenTemps(src, suivi, temps('pauseRetardee')),
  (o) => o.sondes[DELAI - 1].fini === false && o.fin === DELAI && o.abandon.executeeA === DELAI && o.nature === 'HTTP 404' &&
    o.appels === 1 && o.pause.etat === 'effacee' && o.enAttente === 0 && o.planRestant === 1, resume);

critere('C.6', 'abandon lui-même retardé (exécuté à 1200 ms) pendant une pause retardée (1500 ms) : fin À L\'EXÉCUTION RÉELLE de l\'abandon (1200 ms), pas au réveil de la pause — ⚠ au-delà de l\'échéance nominale, voir LIMITES',
  (src, suivi) => scenTemps(src, suivi, temps('abandonEtPauseRetardes')),
  (o) => o.fin === 1200 && o.abandon.executeeA === 1200 && o.nature === 'HTTP 404' && o.appels === 1 &&
    o.pause.etat === 'effacee' && o.enAttente === 0, resume);

critere('C.7', 'signal DÉJÀ abandonné avant le second envoi (abandon exécuté à 999 ms, échéance lue 1000 ms) : aucun fetch, 404 rendu à 999 ms',
  (src, suivi) => scenTemps(src, suivi, temps('abandonAvantEcheanceLue')),
  (o) => o.fin === DELAI - 1 && o.abandon.executeeA === DELAI - 1 && o.abandon.echeance === DELAI && o.appels === 1 &&
    o.fetchSurSignalAbandonne === 0 && o.nature === 'HTTP 404' && o.pause.etat === 'effacee' && o.enAttente === 0, resume);

critere('C.8', 'décision avant le second fetch : pause réveillée PILE à l\'échéance, signal encore intact → aucun fetch, 404 à 1000 ms, abandon effacé',
  (src, suivi) => scenTemps(src, suivi, temps('pausePileEcheance')),
  (o) => o.fin === DELAI && o.pause.executeeA === DELAI && o.appels === 1 && o.nature === 'HTTP 404' &&
    o.abandon.etat === 'effacee' && o.enAttente === 0, resume);

critere('C.9', 'toutes les minuteries retardées de 500 ms : aucun fetch à l\'échéance ou après ; fin au réveil tardif de la pause (1200 ms), avant l\'exécution prévue de l\'abandon (1500 ms) — ⚠ au-delà de l\'échéance nominale, voir LIMITES',
  (src, suivi) => scenTemps(src, suivi, temps('toutRetarde')),
  (o) => o.fin === 1200 && o.pause.executeeA === 1200 && o.appels === 1 && o.tAppels.every((t) => t < o.abandon.echeance) &&
    o.fin <= o.abandon.execution && o.abandon.etat === 'effacee' && o.nature === 'HTTP 404' && o.enAttente === 0, resume);

critere('C.10', 'thread principal BLOQUÉ de 600 à 1300 ms pendant la pause : aucun fetch ; fin au déblocage (1300 ms) — ⚠ au-delà de l\'échéance nominale, voir LIMITES',
  (src, suivi) => scenTemps(src, suivi, temps('blocage')),
  (o) => o.fin === 1300 && o.appels === 1 && o.nature === 'HTTP 404' && o.pause.executeeA === 1300 &&
    o.abandon.etat === 'effacee' && o.enAttente === 0, resume);

critere('C.11', '404 livré PENDANT un blocage (650 ms, blocage 600-1300 ms) : aucune pause, aucun rejeu ; fin au déblocage (1300 ms), 404 ou AbortError selon l\'ordre des sources de tâches (non garanti par le navigateur) — ⚠ au-delà de l\'échéance nominale, voir LIMITES',
  (src, suivi) => scenTemps(src, suivi, temps('livraisonPendantBlocage')),
  (o) => o.fin === 1300 && o.appels === 1 && json(o.durees) === json([DELAI]) && ['HTTP 404', 'AbortError'].indexOf(o.nature) !== -1 &&
    o.enAttente === 0, resume);

critere('C.12', 'abandon pendant la PREMIÈRE émission : AbortError à 1000 ms, une émission, aucune pause, aucun résidu',
  (src, suivi) => scenTemps(src, suivi, temps('premiereEmissionPendante')),
  (o) => o.fin === DELAI && o.nature === 'AbortError' && o.appels === 1 && json(o.durees) === json([DELAI]) &&
    o.abandon.etat === 'executee' && o.enAttente === 0, resume);

critere('C.13', 'un seul minuteur d\'abandon, jamais réarmé : 404 puis 404 avec délai → minuteries [1000, 300], même signal, abandon effacé, deux émissions',
  (src, suivi) => scenTemps(src, suivi, temps('deux404')),
  (o) => json(o.durees) === json([DELAI, D]) && o.memeSignal && o.appels === 2 && o.abandon.etat === 'effacee' &&
    o.nature === 'HTTP 404' && o.fin === 400 + D && o.enAttente === 0 && json(o.parInvocation) === '[2]', resume);

critere('C.15', 'abandon pendant la LECTURE DU CORPS de la seconde émission (200 reçu à 800 ms, corps lu jusqu\'à 1100 ms) : AbortError à 1000 ms, même signal, aucun résidu',
  (src, suivi) => scenTemps(src, suivi, temps('corpsLentApresRejeu')),
  (o) => o.fin === DELAI && o.nature === 'AbortError' && o.appels === 2 && o.memeSignal && o.abandon.executeeA === DELAI &&
    json(o.durees) === json([DELAI, D]) && o.enAttente === 0, resume);

critere('C.16', 'délai NON entier (1000.9 ms) sans aucun retard : l\'abandon s\'exécute à 1000 ms, AVANT l\'échéance lue (1000.9) → le test du signal empêche le second fetch, 404 à 1000 ms',
  (src, suivi) => scenTemps(src, suivi, temps('delaiNonEntier')),
  (o) => o.fin === 1000 && o.abandon.executeeA === 1000 && o.abandon.echeance === 1000 && o.appels === 1 &&
    o.fetchSurSignalAbandonne === 0 && o.nature === 'HTTP 404' && o.pause.etat === 'effacee' && o.enAttente === 0, resume);

critere('C.17', 'deux GET SIMULTANÉS en pause retardée : l\'abandon du premier (1000 ms) ne réveille QUE sa pause → 404 à 1000 ms ; le second garde la sienne (réveil 1600 ms), rejoue à 1600 ms et réussit',
  async (src, suivi) => {
    const b = banc({ source: src, suivi, retards: (ms) => (ms === D ? 800 : 0),
      plan: [R(404, null, 400), R(404, null, 500), OK({ ok: true, lu: 'second' })] });
    const premier = b.suivre(b.ctx.apiGet('getAll', null, { delaiMs: DELAI }));
    const second = b.suivre(b.ctx.apiGet('getRefFFR', null, { delaiMs: 3 * DELAI }));
    await b.avancer(60000);
    return { b, premier, second };
  },
  (o) => o.premier.t === DELAI && erreurHttp(o.premier, 404) &&
    succes(o.second) && o.second.valeur.lu === 'second' && o.second.t === 500 + D + 800 &&
    json(o.b.appels.map((a) => a.t)) === json([0, 0, 500 + D + 800]) && json(o.b.parInvocation()) === json([1, 2]) &&
    o.b.file.filter((m) => !m.interne).length === 0,
  (o) => json({ premier: [o.premier.t, nature(o.premier)], second: [o.second.t, nature(o.second)], appels: o.b.appels.map((a) => a.t), inv: o.b.parInvocation() }));

const ISSUES_RESIDUS = [
  ['200', { plan: [OK()] }], ['404→200', { plan: [R(404), OK()] }], ['404→404', { plan: [R(404), R(404)] }],
  ['rejet', { plan: ['rejet'] }], ['404→rejet', { plan: [R(404), 'rejet'] }], ['JSON illisible', { plan: ['json-illisible'] }],
  ['{ error }', { plan: [OK({ error: 'x' })] }], ['404 à 900 ms', { plan: [R(404, null, 900)] }],
  ['abandon (requête pendante)', { plan: ['pend'] }], ['404→abandon', { plan: [R(404), 'pend'] }],
  ['abandon pendant pause retardée', null], ['getHistorique 404', { plan: [R(404), OK()], action: GET_EXCLUE }]
];
critere('C.14', 'aucun minuteur ni attente résiduels À L\'INSTANT du dénouement (' + ISSUES_RESIDUS.length + ' issues avec délai)',
  async (src, suivi) => {
    const fautifs = [];
    for (const [nom, o] of ISSUES_RESIDUS) {
      const r = await scenTemps(src, suivi, o || temps('pauseRetardee'));
      if (!(r.s.fini && r.enAttente === 0)) fautifs.push(nom + ' (' + r.enAttente + ')');
    }
    return fautifs;
  },
  (fautifs) => fautifs.length === 0, (fautifs) => json(fautifs));

/* ---- D — clés ----------------------------------------------------------- */
section('D — Clés : demandées et rangées selon les règles existantes ; parcours à quatre émissions');

critere('D.1', 'nouvelle clé + 404 puis 200 : UNE seule demande de clé, en saisie masquée',
  scenCleNeuve,
  (o) => o.a.dialogues.length === 1 && o.a.dialogues[0].type === 'demander' && o.a.dialogues[0].opt.secret === true);
critere('D.2', 'deux émissions portant la même clé saisie, corps identiques',
  scenCleNeuve,
  (o) => o.a.appels.length === 2 && o.a.appels[0].corps === o.a.appels[1].corps && JSON.parse(o.a.appels[0].corps).cle === CLE_FACTICE);
critere('D.3', 'rien n\'est rangé avant le succès : ni à la 1re émission, ni pendant la pause, ni à la 2de',
  scenCleNeuve,
  (o) => o.pendantPause.emissions === 1 && !o.pendantPause.rangee && o.pendantPause.ecritures === 0 && o.a.appels.every((x) => x.cleRangee === ''),
  (o) => json(o.pendantPause));
critere('D.4', 'après le succès : la clé est rangée, une seule écriture de stockage',
  scenCleNeuve,
  (o) => succes(o.s) && o.a.donnees.get('r92_cle_admin') === CLE_FACTICE && json(o.a.ecritures()) === json([['set', 'r92_cle_admin', CLE_FACTICE]]));

critere('D.5', 'nouvelle clé + 404 puis 404 : une demande, deux émissions, erreur 404, RIEN de rangé',
  async (src, suivi) => {
    const b = banc({ source: src, suivi, saisies: [CLE_FACTICE], plan: [R(404), R(404), OK()] });
    return { b, s: await b.jouer((c) => c.apiPostProtege('getConfigAdmin', {}, 'admin', 'admin')) };
  },
  (o) => o.b.dialogues.length === 1 && o.b.appels.length === 2 && erreurHttp(o.s, 404) && o.b.ecritures().length === 0 && !o.b.donnees.has('r92_cle_admin'));

critere('D.6', 'clé déjà rangée + 404 puis 200 : aucune demande, deux émissions, stockage inchangé',
  async (src, suivi) => {
    const b = banc({ source: src, suivi, memo: CLE_MEMO, plan: [R(404), OK({ ok: true })] });
    return { b, s: await b.jouer((c) => c.apiPostProtege('getMatchsLitige', {}, 'admin', 'admin')) };
  },
  (o) => o.b.dialogues.length === 0 && o.b.appels.length === 2 && succes(o.s) && o.b.ecritures().length === 0 && o.b.donnees.get('r92_cle_admin') === CLE_MEMO);

critere('D.7', 'clé déjà rangée + 404 puis 404 : aucune demande, clé PRÉSERVÉE (une panne n\'est pas un refus)',
  async (src, suivi) => {
    const b = banc({ source: src, suivi, memo: CLE_MEMO, plan: [R(404), R(404), OK()] });
    return { b, s: await b.jouer((c) => c.apiPostProtege('getAccesScoresAdmin', {}, 'admin', 'admin')) };
  },
  (o) => o.b.dialogues.length === 0 && o.b.appels.length === 2 && erreurHttp(o.s, 404) && o.b.ecritures().length === 0 && o.b.donnees.get('r92_cle_admin') === CLE_MEMO);

critere('D.8', '404 puis refus de clé, nouvelle saisie ANNULÉE : deux émissions, le refus n\'est pas rejoué, aucune clé rangée',
  async (src, suivi) => {
    const b = banc({ source: src, suivi, saisies: [CLE_FACTICE, null], plan: [R(404), OK({ error: 'Clé admin incorrecte.', acces_refuse: true }), OK()] });
    return { b, s: await b.jouer((c) => c.apiPostProtege('getConfigAdmin', {}, 'admin', 'admin')) };
  },
  (o) => o.b.appels.length === 2 && o.b.dialogues.filter((z) => z.type === 'demander').length === 2 &&
    o.s.erreur && o.s.erreur.message === 'Action annulée.' && o.b.ecritures().every((w) => w[0] === 'set' && w[2] === '') && !o.b.donnees.get('r92_cle_admin'));

critere('D.9', 'parcours protégé complet (clé 1 : 404 puis refus → clé 2 : 404 puis succès) : QUATRE fetch en DEUX invocations [2, 2], jamais trois dans un même cycle, succès',
  scenQuatreEmissions,
  (o) => o.b.appels.length === 4 && json(o.b.parInvocation()) === '[2,2]' && succes(o.s) && o.b.plan.length === 1,
  (o) => json({ appels: o.b.appels.length, inv: o.b.parInvocation(), t: o.b.appels.map((a) => a.t) }));
critere('D.10', 'parcours à quatre émissions : première clé sur les émissions 1-2, seconde clé sur les émissions 3-4, corps identiques deux à deux',
  scenQuatreEmissions,
  (o) => json(o.cles) === json([CLE_FACTICE, CLE_FACTICE, CLE_SECONDE, CLE_SECONDE]) &&
    o.b.appels[0].corps === o.b.appels[1].corps && o.b.appels[2].corps === o.b.appels[3].corps,
  (o) => json(o.cles.map((c) => (c === CLE_FACTICE ? 'clé 1' : c === CLE_SECONDE ? 'clé 2' : c))));
critere('D.11', 'parcours à quatre émissions : la clé refusée est EFFACÉE avant la nouvelle saisie (champ vide), deux demandes au total',
  scenQuatreEmissions,
  (o) => o.b.dialogues.length === 2 && o.b.dialogues[1].cleRangee === '' && o.b.dialogues[1].defaut === '' &&
    json(o.b.ecritures()[0]) === json(['set', 'r92_cle_admin', '']),
  (o) => json({ dialogues: o.b.dialogues.length, ecritures: o.b.ecritures().map((w) => w[2] ? 'clé' : 'vide') }));
critere('D.12', 'parcours à quatre émissions : la seconde clé n\'est rangée qu\'APRÈS le succès (absente aux émissions 3 et 4)',
  scenQuatreEmissions,
  (o) => o.b.appels[2].cleRangee === '' && o.b.appels[3].cleRangee === '' && o.b.donnees.get('r92_cle_admin') === CLE_SECONDE &&
    json(o.b.ecritures()) === json([['set', 'r92_cle_admin', ''], ['set', 'r92_cle_admin', CLE_SECONDE]]));

/* ---- E — journalisation ------------------------------------------------- */
section('E — Journalisation : aucun corps, aucune clé, aucun jeton');

critere('E.1', 'GET à jeton dans l\'adresse (404→200 et 404→404), GET avec abandon, POST à clé et jeton, parcours à quatre émissions, listerSponsors : AUCUNE ligne journalisée ; aucun secret dans les journaux, les messages d\'erreur, le stockage de session (hors clés d\'accès), les globales ou les variables de module',
  async (src, suivi) => {
    const flux = [];
    flux.push(await getFlux(src, suivi, 'getConfigClub', PARAMS_GET.getConfigClub, [R(404), OK({ ok: true })]));
    flux.push(await getFlux(src, suivi, 'getConfigClub', PARAMS_GET.getConfigClub, [R(404), R(404)]));
    flux.push(await scenTemps(src, suivi, { plan: [R(404), 'pend'] }));
    flux.push(await postFlux(src, suivi, 'getSaisieScores', DONNEES_LECTURE(), [R(404), OK({ ok: true })]));
    flux.push(await postFlux(src, suivi, 'getSaisieScores', DONNEES_LECTURE(), [R(404), R(404)]));
    flux.push(await scenQuatreEmissions(src, suivi));
    flux.push(await postFlux(src, suivi, POST_EXCLUE, DONNEES_LECTURE(), [R(404), OK()]));
    const lignes = [].concat.apply([], flux.map((f) => f.b.journaux));
    const messages = flux.map((f) => (f.s.erreur ? String(f.s.erreur.message) : '')).join('\n');
    // Ce que la page RETIENT : écritures de session hors clés d'accès, propriétés globales, variables de module.
    const retenu = [];
    const modules = (src.match(/^(?:let|var|const)\s+(\w+)/gm) || []).map((l) => l.split(/\s+/)[1]);
    flux.forEach(function (f) {
      f.b.ecritures().forEach(function (w) {
        if (!/^r92_cle_(admin|scores)$/.test(w[1]) || [JETON_FACTICE, MARQUE_DONNEE].some((x) => String(w[2]).indexOf(x) !== -1)) {
          retenu.push('session:' + w[1]);
        }
      });
      Object.keys(f.b.ctx).forEach(function (k) {
        if (typeof f.b.ctx[k] === 'string' && SECRETS.some((x) => f.b.ctx[k].indexOf(x) !== -1)) retenu.push('global:' + k);
      });
      modules.forEach(function (nom) {
        let v;
        try { v = f.b.valeur(nom); } catch (e) { return; }
        let t = '';
        try { t = typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { t = ''; }
        if (typeof t === 'string' && SECRETS.some((x) => t.indexOf(x) !== -1)) retenu.push('module:' + nom);
      });
    });
    return { lignes, texte: lignes.join('\n'), messages, retenu };
  },
  (o) => o.lignes.length === 0 && SECRETS.every((x) => o.texte.indexOf(x) === -1 && o.messages.indexOf(x) === -1) && o.retenu.length === 0,
  (o) => json({ lignes: o.lignes.length, retenu: o.retenu }));

/* ---- F — structure ------------------------------------------------------ */
section('F — Structure : listes figées, classement par liste seule, une implémentation, aucun écouteur');

critere('F.1', 'ACTIONS_GET_REJOUABLES = les 11 actions attendues, dans l\'ordre, figée ; getHistorique, getPoules, getClassement absentes',
  async (src) => {
    const b = banc({ source: src, suivi: false });
    const liste = b.valeur('ACTIONS_GET_REJOUABLES');
    let modifiable = false;
    try { b.valeur('ACTIONS_GET_REJOUABLES.push("getHistorique")'); modifiable = true; } catch (e) { /* attendu */ }
    return { liste: Array.from(liste), gele: Object.isFrozen(liste) && !modifiable };
  },
  (o) => json(o.liste) === json(GET_ATTENDUES) && o.gele && [GET_EXCLUE].concat(GET_NON_RETENUES).every((a) => o.liste.indexOf(a) === -1),
  (o) => json(o));

critere('F.2', 'ACTIONS_POST_REJOUABLES = les 7 actions attendues, dans l\'ordre, figée ; listerSponsors et écritures sensibles absentes',
  async (src) => {
    const b = banc({ source: src, suivi: false });
    const liste = b.valeur('ACTIONS_POST_REJOUABLES');
    let modifiable = false;
    try { b.valeur('ACTIONS_POST_REJOUABLES.push("listerSponsors")'); modifiable = true; } catch (e) { /* attendu */ }
    return { liste: Array.from(liste), gele: Object.isFrozen(liste) && !modifiable };
  },
  (o) => json(o.liste) === json(POST_ATTENDUES) && o.gele && [POST_EXCLUE].concat(ECRITURES_SENSIBLES).every((a) => o.liste.indexOf(a) === -1),
  (o) => json(o));

critere('F.3', 'apiGet et apiPost décident par leur liste fermée SEULE, sur l\'action envoyée — aucun motif de nom ; listerSponsors et getHistorique absentes du code',
  async (src) => ({
    get: sansCommentaires(blocFonction(src, 'async function apiGet(')),
    post: sansCommentaires(blocFonction(src, 'async function apiPost(')),
    code: sansCommentaires(src)
  }),
  (o) => /const rejouable = ACTIONS_GET_REJOUABLES\.indexOf\(url\.searchParams\.get\('action'\)\) !== -1;/.test(o.get) &&
    /const rejouable = ACTIONS_POST_REJOUABLES\.indexOf\(corps\.action\) !== -1;/.test(o.post) &&
    (o.get.match(/ACTIONS_(GET|POST)_REJOUABLES/g) || []).length === 1 && (o.post.match(/ACTIONS_(GET|POST)_REJOUABLES/g) || []).length === 1 &&
    [o.get, o.post].every((f) => !/startsWith|endsWith|RegExp|\.test\(|\.match\(|toLowerCase|toUpperCase|\/\^/.test(f)) &&
    o.code.indexOf(POST_EXCLUE) === -1 && o.code.indexOf(GET_EXCLUE) === -1);

critere('F.4', 'UNE seule implémentation : une définition, deux appelants, deux fetch ; un minuteur d\'abandon dans apiGet, un minuteur de pause dans le mécanisme',
  async (src) => ({
    code: sansCommentaires(src),
    get: sansCommentaires(blocFonction(src, 'async function apiGet(')),
    post: sansCommentaires(blocFonction(src, 'async function apiPost(')),
    rejeu: sansCommentaires(blocFonction(src, 'async function envoyerAvecRejeu404('))
  }),
  (o) => (o.code.match(/async function envoyerAvecRejeu404\(/g) || []).length === 1 &&
    (o.code.match(/envoyerAvecRejeu404\(/g) || []).length === 3 &&
    (o.get.match(/envoyerAvecRejeu404\(/g) || []).length === 1 && (o.post.match(/envoyerAvecRejeu404\(/g) || []).length === 1 &&
    (o.code.match(/\bfetch\(/g) || []).length === 2 &&
    (o.get.match(/setTimeout\(/g) || []).length === 1 && (o.get.match(/new AbortController\(/g) || []).length === 1 &&
    (o.rejeu.match(/setTimeout\(/g) || []).length === 1 && (o.rejeu.match(/clearTimeout\(/g) || []).length === 1);

critere('F.5', 'js/api.js ne pose AUCUN écouteur (ni addEventListener, ni onabort/on…=), ne journalise rien ; performance.now pour l\'échéance, Date.now pour l\'anti-cache seulement',
  async (src) => ({ code: sansCommentaires(src) }),
  (o) => o.code.indexOf('addEventListener') === -1 && !/\.on[a-z]+\s*=/.test(o.code) && !/\bconsole\s*\./.test(o.code) &&
    (o.code.match(/Date\.now\(\)/g) || []).length === 1 && /url\.searchParams\.set\('_', String\(Date\.now\(\)\)\);/.test(o.code) &&
    /echeance: performance\.now\(\) \+ delaiMs/.test(o.code));

critere('F.6', 'recensement : les actions GET appelées par la page sont exactement les 11 rejouables + getHistorique, toutes en littéral',
  async () => {
    const appelees = new Set();
    let nonLitteraux = 0;
    const fichiers = sourcesPage().concat(fs.readdirSync(RACINE).filter((f) => f.endsWith('.html')).map((f) => ({ nom: f, src: lire(f) })));
    fichiers.forEach(function (f) {
      let m;
      const litteral = /\bapiGet\(\s*'([^']*)'/g;
      while ((m = litteral.exec(f.src))) appelees.add(m[1]);
      nonLitteraux += (f.src.match(/\bapiGet\(\s*[^'\s)]/g) || []).length;
    });
    return { appelees: Array.from(appelees).sort(), nonLitteraux };
  },
  (o) => json(o.appelees) === json(GET_ATTENDUES.concat([GET_EXCLUE]).sort()) && o.nonLitteraux === 0,
  (o) => json(o));

/* ========================================================================== */
/*  MUTANTS — chacun doit faire échouer AU MOINS UN des critères désignés      */
/* ========================================================================== */

const ANCRES = {
  test404: '  if (!rejouable || reponse.status !== 404) return reponse;',
  classementGet: "const rejouable = ACTIONS_GET_REJOUABLES.indexOf(url.searchParams.get('action')) !== -1;",
  listeGet: "'getConfigClub', 'getClubDossier', 'getReponseInvitation'",
  classementPost: 'ACTIONS_POST_REJOUABLES.indexOf(corps.action) !== -1',
  listePost: "  'getConfigAdmin', 'getDossierAutorisation', 'lireMesuresSponsors',",
  reveil: '    if (abandon.reveiller) abandon.reveiller();\n',
  gardeAvant: '  if (abandon && performance.now() + DELAI_REJEU_404_MS >= abandon.echeance) {',
  gardeApres: '    if (abandon.signal.aborted || performance.now() >= abandon.echeance) return reponse;',
  effacerPause: '  clearTimeout(pause);\n',
  effacerAbandon: '    if (minuteur) clearTimeout(minuteur);',
  enregistrerReveil: '    if (abandon) abandon.reveiller = reprendre;',
  emissionGet: 'return fetch(adresse, reglages);',
  fermetureGet: 'function () { return fetch(adresse, reglages); }',
  derniere: '  return emettre();',
  texte: '  const texte = JSON.stringify(corps);',
  adresse: '    const adresse = url.toString();',
  erreurGet: "      throw new Error('Le serveur a répondu avec une erreur (' + reponse.status + ').');"
};

const MUTANTS = [
  ['aucun rejeu', [[ANCRES.test404, '  return reponse;']], ['A.1', 'B.1']],
  ['tout statut d\'erreur rejoué', [[ANCRES.test404, '  if (!rejouable || reponse.ok) return reponse;']], ['A.17', 'B.3']],
  ['rejeu de TOUS les GET', [[ANCRES.classementGet, 'const rejouable = true;']], ['A.13', 'A.14', 'A.15']],
  ['réintroduction de getHistorique', [[ANCRES.listeGet, ANCRES.listeGet + ", 'getHistorique'"]], ['A.13', 'F.1']],
  ['action GET inconnue rendue rejouable (liste noire au lieu de liste fermée)',
    [[ANCRES.classementGet, "const rejouable = ['getHistorique', 'getPoules', 'getClassement'].indexOf(url.searchParams.get('action')) === -1;"]], ['A.15']],
  ['classement GET sur le paramètre `action` au lieu de l\'action envoyée',
    [[ANCRES.classementGet, 'const rejouable = ACTIONS_GET_REJOUABLES.indexOf(action) !== -1;']], ['A.16']],
  ['classement GET déduit du nom', [[ANCRES.classementGet, "const rejouable = /^get/.test(String(url.searchParams.get('action')));"]], ['A.13', 'A.14']],
  ['pause NON réveillée par l\'abandon', [[ANCRES.reveil, '']], ['C.5', 'C.6']],
  ['second envoi malgré un signal abandonné', [[ANCRES.gardeApres, '    if (performance.now() >= abandon.echeance) return reponse;']], ['C.7', 'C.16']],
  ['perte du signal global', [[ANCRES.emissionGet, 'return fetch(adresse, { cache: reglages.cache });']], ['C.4', 'A.12', 'C.15']],
  ['réarmement du délai pour le rejeu', [[ANCRES.fermetureGet,
    '(function () { let n = 0; return function () { if (n++ === 0) return fetch(adresse, reglages); ' +
    'const c2 = new AbortController(); setTimeout(function () { c2.abort(); }, delaiMs); ' +
    'return fetch(adresse, { cache: reglages.cache, signal: c2.signal }); }; })()']], ['C.4', 'C.13', 'C.15']],
  ['troisième émission dans un même cycle', [[ANCRES.derniere, '  const r2 = await emettre(); return r2.status === 404 ? emettre() : r2;']], ['A.1', 'B.2', 'C.13']],
  ['réintroduction de listerSponsors', [[ANCRES.listePost, "  'getConfigAdmin', 'getDossierAutorisation', 'listerSponsors', 'lireMesuresSponsors',"]], ['B.4', 'F.2']],
  ['rejeu de toute écriture', [[ANCRES.classementPost, 'true']], ['B.5', 'B.10', 'B.12']],
  ['classement POST déduit du nom', [[ANCRES.classementPost, '/^(get|lire|lister)/.test(String(corps.action))']], ['B.4', 'B.13']],
  ['corps POST journalisé', [[ANCRES.texte, ANCRES.texte + " console.log('rejeu', texte);"]], ['E.1']],
  ['clé journalisée', [[ANCRES.texte, ANCRES.texte + " console.warn('cle', corps.cle);"]], ['E.1']],
  ['adresse GET (jeton) journalisée', [[ANCRES.adresse, ANCRES.adresse + " console.info('GET', adresse);"]], ['E.1']],
  ['adresse GET (jeton) dans le message d\'erreur', [[ANCRES.erreurGet, "      throw new Error('Le serveur a répondu avec une erreur (' + reponse.status + ') : ' + adresse);"]], ['E.1']],
  ['garde d\'avant la pause retirée (défaut 6F)', [[ANCRES.gardeAvant, '  if (false) {']], ['C.2']],
  ['garde d\'avant la pause en « > »', [[ANCRES.gardeAvant, ANCRES.gardeAvant.replace('>= abandon.echeance', '> abandon.echeance')]], ['C.3']],
  ['garde d\'après la pause en « > »', [[ANCRES.gardeApres, ANCRES.gardeApres.replace('>= abandon.echeance', '> abandon.echeance')]], ['C.8']],
  ['minuteur de pause non effacé', [[ANCRES.effacerPause, '']], ['C.5', 'C.14']],
  ['minuteur d\'abandon non effacé', [[ANCRES.effacerAbandon, '    // (effacement retiré)']], ['C.14']],
  ['corps POST non figé (resérialisé à chaque émission)', [["      body: texte", "      body: JSON.stringify(corps)"]], ['B.17']],
  ['adresse GET (jeton) retenue en session après un 404', [[ANCRES.erreurGet,
    "      if (reponse.status === 404) sessionStorage.setItem('r92_diag_404', adresse);\n" + ANCRES.erreurGet]], ['E.1']],
  ['adresse GET (jeton) exposée en variable globale', [[ANCRES.adresse, ANCRES.adresse + ' window.derniereLecture = adresse;']], ['E.1']],
  ['réveil PARTAGÉ entre appels simultanés (variable de module)', [
    [ANCRES.enregistrerReveil, '    if (abandon) globalThis.__reveilPartage = reprendre;'],
    [ANCRES.reveil, '    if (globalThis.__reveilPartage) globalThis.__reveilPartage();\n']], ['C.17']],
  ['écouteur d\'abandon persistant à la place du réveil', [[ANCRES.enregistrerReveil,
    "    if (abandon) abandon.signal.addEventListener('abort', reprendre, { once: true });"]], ['F.5']]
];

/* ========================================================================== */
/*  LIMITES MESURÉES — le respect de l'échéance n'y est jamais compté          */
/* ========================================================================== */

const LIMITES = [
  ['C.6', 'abandonEtPauseRetardes', 'abandon lui-même retardé de 200 ms'],
  ['C.9', 'toutRetarde', 'toutes les minuteries retardées de 500 ms'],
  ['C.10', 'blocage', 'thread principal bloqué de 600 à 1300 ms'],
  ['C.11', 'livraisonPendantBlocage', '404 livré pendant un blocage de 600 à 1300 ms']
];

/* ========================================================================== */
/*  EXÉCUTION                                                                 */
/* ========================================================================== */

async function controles() {
  const SRC = lire('js/api.js');
  D = banc({ suivi: false }).valeur('DELAI_REJEU_404_MS');
  verifier('0.1', 'pause fixe et courte : 0 < DELAI_REJEU_404_MS ≤ 500 (' + D + ' ms)', typeof D === 'number' && D > 0 && D <= 500);

  for (const sec of SECTIONS) {
    console.log('\n' + sec.titre);
    for (const c of sec.criteres) {
      let obs, ok = false, detail = '';
      try { obs = await c.jouer(SRC, true); ok = !!c.ok(obs); detail = ok ? '' : c.detail(obs); }
      catch (e) { detail = 'EXCEPTION : ' + (e && e.stack || e); }
      OBS[c.id] = obs;
      verifier(c.id, c.intitule, ok, detail);
    }
  }

  /* ---- G — transverses (sur tous les parcours suivis) --------------------- */
  console.log('\nG — Garanties transverses, sur les ' + BANCS.length + ' parcours suivis');
  {
    const lignes = [].concat.apply([], BANCS.map((x) => x.journaux));
    const texte = lignes.join('\n');
    const envois = [].concat.apply([], BANCS.map((x) => x.appels.map((a) => (a.methode === 'GET' ? a.url : a.corps))
      .filter((c) => typeof c === 'string' && c.length > 2)));
    verifier('G.1', 'aucune ligne journalisée ; aucune clé, aucun jeton, aucun corps, aucune adresse (' + envois.length + ' envois)',
      lignes.length === 0 && SECRETS.every((x) => texte.indexOf(x) === -1) && envois.every((c) => texte.indexOf(c) === -1),
      lignes.length + ' ligne(s)');
    verifier('G.2', 'localStorage n\'est JAMAIS touché', BANCS.every((x) => x.accesLocal.length === 0));
    const excedents = BANCS.filter((x) => x.invocations.some((i) => i.emissions > 2) || x.appels.some((a) => a.imprevu || !a.invocation) ||
      x.appels.length > 2 * Math.max(1, x.invocations.length));
    verifier('G.3', 'deux émissions au plus PAR INVOCATION partout ; chaque fetch rattaché à une invocation du mécanisme ; aucune émission imprévue', excedents.length === 0,
      excedents.length + ' parcours fautif(s)');
    const multiCycles = BANCS.filter((x) => x.appels.length > 2);
    verifier('G.4', 'les parcours à plus de deux fetch (' + multiCycles.length + ') comptent autant d\'invocations que nécessaire, chacune ≤ 2',
      multiCycles.length >= 1 && multiCycles.every((x) => x.invocations.length >= Math.ceil(x.appels.length / 2) && x.invocations.every((i) => i.emissions <= 2)));
  }

  /* ---- ⚠ limites du navigateur ------------------------------------------- */
  console.log('\n⚠ LIMITES DU NAVIGATEUR — dépassements de l\'échéance nominale MESURÉS ; le respect de l\'échéance n\'y est jamais compté comme succès (aucune limite murale absolue n\'est revendiquée)');
  {
    const sansRejeu = SRC.replace(ANCRES.test404, '  return reponse;');
    for (const [id, nom, libelle] of LIMITES) {
      const o = OBS[id];
      const t = await scenTemps(sansRejeu, false, temps(nom));
      if (!o) { console.log('  ⚠ [' + id + '] ' + libelle + ' : non mesuré (contrôle en échec)'); continue; }
      const exec = o.abandon && (o.abandon.executeeA !== null ? o.abandon.executeeA + ' ms (exécuté)' : 'prévu à ' + o.abandon.execution + ' ms, jamais exécuté (effacé à la fin de l\'appel)');
      console.log('  ⚠ [' + id + '] ' + libelle + ' : fin ' + o.fin + ' ms ; échéance nominale ' + DELAI + ' ms ; dépassement ' +
        (o.fin - DELAI > 0 ? '+' + (o.fin - DELAI) : '0') + ' ms ; rappel d\'abandon ' + exec + ' ; même scénario sans rejeu : fin ' + t.fin + ' ms');
    }
  }

  /* ---- Z — mutants --------------------------------------------------------- */
  console.log('\nZ Preuve du harnais : chaque mutant est VU par un échec de comportement des critères désignés');
  let n = 0;
  for (const [nom, substitutions, vus] of MUTANTS) {
    n++;
    let src = SRC;
    for (const [avant, apres] of substitutions) {
      if (src.split(avant).length !== 2) {
        throw new Error('Mutant « ' + nom + ' » impossible — ancre absente ou non unique : ' + avant +
          '\n  Le mécanisme a été réécrit : mets CE mutant à jour, ne le supprime pas.');
      }
      src = src.replace(avant, apres);
    }
    const par = [], exceptions = [];
    for (const id of vus) {
      try {
        const obs = await CRITERES[id].jouer(src, false);
        if (!CRITERES[id].ok(obs)) par.push(id);
      } catch (e) { exceptions.push(id); }
    }
    verifier('Z.' + n, 'mutant « ' + nom + ' » : VU par ' + (par.length ? par.join(', ') : '—'),
      par.length > 0, 'aucun échec de comportement' + (exceptions.length ? ' (exceptions : ' + exceptions.join(', ') + ')' : ''));
  }
}

/* ========================================================================== */

/* ⛔ GARDE-FOU : on part en ÉCHEC, et on ne repasse au vert qu'à la toute fin du bilan.
   Sans cela, une attente qui ne se dénoue jamais éteindrait le processus avec un code 0. */
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
