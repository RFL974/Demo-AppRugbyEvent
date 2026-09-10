/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — ouverture de l'administration et reprise après erreur
 *  Chantier UX-INIT-ADMIN-DR-4A
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/ux-init-admin-dr-4a.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *
 *  CE QU'IL PROTÈGE — sept promesses faites à l'organisateur qui ouvre `admin.html` :
 *
 *   ① tant que la page n'est pas prête, il voit « Chargement… », jamais des cases vides
 *      qui laisseraient croire que son tournoi a été effacé ;
 *   ② quand tout s'est bien passé, il arrive sur le parcours guidé ;
 *   ③ quand le réseau tombe, la carte « Réglages » n'est PAS démolie au passage ;
 *   ④ aucun écouteur n'est posé sur un élément absent — un trou local ne rend plus
 *      la page entière inerte ;
 *   ⑤ « Réessayer » relance l'ouverture UNE fois, sans jamais doubler les gestionnaires ;
 *   ⑥ une panne ne fait pas passer la clé pour mauvaise, ne l'enregistre pas, et ne
 *      l'affiche nulle part ;
 *   ⑦ s'il ANNULE la saisie, la barre du haut le lui dit — et rien n'est écrit dans une
 *      carte que le mode écrans laisse vide et masquée (UX-INIT-ADMIN-DR-4B).
 *
 *  ⭐ IL EXÉCUTE LE CODE RÉEL, extrait de `js/` et joué dans un contexte Node avec des
 *  doublures — comme `perf-dr-3b.test.js`. ⛔ Rien n'est recopié : si une fonction est
 *  renommée, l'extraction échoue bruyamment.
 *
 *  ⭐ ET IL SE PROUVE LUI-MÊME (§ 7). Le code d'AVANT le correctif est reconstruit par
 *  substitution et rejoué : s'il ne reproduit PAS le défaut, ce fichier ÉCHOUE. Un test
 *  qui ne peut pas échouer ne prouve rien.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const F_ADMIN = 'js/admin.js';

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
  throw new Error('Accolades déséquilibrées autour de « ' + entete +' » dans ' + rel);
}

function ligne(rel, entete) {
  const source = lire(rel);
  const debut = situer(source, rel, entete);
  const fin = source.indexOf(';\n', debut);
  if (fin === -1) throw new Error('Fin de déclaration introuvable : « ' + entete + ' »');
  return source.slice(debut, fin + 1);
}

/** Remplace un fragment EXACT, en exigeant qu'il soit présent (sinon la preuve serait creuse). */
function substituer(source, avant, apres, quoi) {
  if (source.indexOf(avant) === -1) {
    throw new Error('Reconstruction impossible (' + quoi + ') : fragment introuvable. ' +
      'Le code a changé — mets ce garde-fou à jour.');
  }
  return source.split(avant).join(apres);
}

/* Les briques de l'écran de chargement et du câblage sûr. */
const SRC_ECRAN = [
  bloc(F_ADMIN, 'function afficherEcranChargement('),
  bloc(F_ADMIN, 'function masquerEcranChargement('),
  bloc(F_ADMIN, 'function afficherErreurChargement('),
  bloc(F_ADMIN, 'function ecouter('),
  bloc(F_ADMIN, 'function ecouterSel(')
].join('\n');

const SRC_DRAPEAUX = [
  ligne(F_ADMIN, 'let adminEcouteursPoses'),
  ligne(F_ADMIN, 'let adminChargementEnCours'),
  ligne(F_ADMIN, 'let adminReessaiBranche')
].join('\n');

const SRC_INIT = bloc(F_ADMIN, 'async function initAdmin(');
const SRC_CHARGER = bloc(F_ADMIN, 'async function chargerAdmin(');
const SRC_BRANCHER = bloc(F_ADMIN, 'function brancherEcouteursAdmin(');
const SRC_BARRE = bloc(F_ADMIN, 'function majBarreConnexion(');
const SRC_SESSION = [
  ligne(F_ADMIN, 'let adminCleVolatile'),
  bloc(F_ADMIN, 'async function ouvrirSessionAdmin(')
].join('\n');

/* ========================================================================== */
/*  DOUBLURES — un DOM minimal, mais qui SAIT ce qu'est un enfant.             */
/* ========================================================================== */

function fabriquerClassList(sur) {
  const noms = new Set(sur ? sur.split(' ').filter(Boolean) : []);
  return {
    noms,
    contains: (n) => noms.has(n),
    add: (n) => noms.add(n),
    remove: (n) => noms.delete(n),
    toggle: (n, f) => { if (f === undefined) { noms.has(n) ? noms.delete(n) : noms.add(n); }
      else if (f) noms.add(n); else noms.delete(n); return noms.has(n); }
  };
}

/**
 * Un `document` qui connaît la PARENTÉ des éléments.
 *
 * ⭐ C'est tout l'enjeu du § 3 : écrire `innerHTML` sur un parent DÉTRUIT ses enfants, et
 * `getElementById` doit alors renvoyer `null` pour eux — exactement comme un vrai navigateur.
 * Sans cette fidélité-là, le test ne pourrait pas voir le défaut qu'il surveille.
 *
 * @param {Object} parente   { idParent: [idsEnfants] }
 * @param {Array}  absents   ids qui n'existent pas du tout
 */
function fabriquerDocument(parente, absents) {
  const enfantsDe = parente || {};
  const disparus = new Set(absents || []);
  const elements = new Map();
  const ecouteurs = [];   // { id, type } — la trace de CE qui a été branché

  function detruireDescendants(id) {
    (enfantsDe[id] || []).forEach(function (enfant) {
      disparus.add(enfant);
      elements.delete(enfant);
      detruireDescendants(enfant);
    });
  }

  function creer(id) {
    const el = {
      id: id, textContent: '', className: '', value: '', hidden: false, disabled: false,
      style: {}, classList: fabriquerClassList(),
      addEventListener: function (type) { ecouteurs.push({ id: id, type: type }); },
      removeAttribute() {}, setAttribute() {}, getAttribute() { return null; },
      appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
      scrollIntoView() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
    };
    let html = '';
    Object.defineProperty(el, 'innerHTML', {
      get: function () { return html; },
      set: function (v) { html = String(v); detruireDescendants(id); }   // ⚠️ comme un vrai DOM
    });
    return el;
  }

  const body = creer('body');

  return {
    elements, ecouteurs, disparus,
    body: body,
    getElementById(id) {
      if (disparus.has(id)) return null;
      if (!elements.has(id)) elements.set(id, creer(id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(t) { return creer(t); },
    addEventListener() {}
  };
}

function fauxStockage() {
  const m = new Map();
  return {
    donnees: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear()
  };
}

/**
 * Contexte VM TOLÉRANT : tout identifiant inconnu devient une fonction inoffensive.
 *
 * ⭐ POURQUOI. `brancherEcouteursAdmin()` cite une soixantaine de gestionnaires (`onPublier`,
 * `rafraichirAdmin`, …) définis ailleurs dans le fichier. Les recopier ici serait long et
 * fragile ; les stubber automatiquement laisse le test se concentrer sur ce qu'il surveille :
 * QUI est branché, et sur quoi.
 */
function contexteTolerant(base) {
  const stubs = new Map();
  const proxy = new Proxy(base, {
    has() { return true; },                       // « tout existe » → jamais de ReferenceError
    get(cible, cle) {
      if (cle in cible) return cible[cle];
      if (typeof cle === 'symbol') return undefined;
      if (!stubs.has(cle)) stubs.set(cle, function () {});
      return stubs.get(cle);
    },
    set(cible, cle, val) { cible[cle] = val; return true; }
  });
  return vm.createContext(proxy);
}

/* ========================================================================== */
/*  CONTRÔLES                                                                 */
/* ========================================================================== */

let reussis = 0;
const echecs = [];

function verifier(numero, intitule, condition, detail) {
  if (condition) { reussis++; console.log('  ✓ [' + numero + '] ' + intitule); }
  else { echecs.push('[' + numero + '] ' + intitule + (detail ? ' — ' + detail : ''));
         console.log('  ✗ [' + numero + '] ' + intitule + (detail ? ' — ' + detail : '')); }
}

function tick() { return new Promise(function (r) { setImmediate(r); }); }

/**
 * Lit une variable `let` du code testé.
 * ⚠️ Une déclaration lexicale (`let` / `const`) au niveau supérieur d'un script VM n'est PAS
 * une propriété de l'objet global : `ctx.maVariable` renvoie `undefined`. Il faut l'évaluer
 * dans le contexte, où sa portée lexicale est restée vivante.
 */
function lireVar(ctx, nom) { return vm.runInContext(nom, ctx); }

/* --- Bancs ---------------------------------------------------------------- */

/** Banc d'ORCHESTRATION : le vrai `initAdmin`, avec `chargerAdmin` et le câblage doublés. */
function bancInit(options) {
  options = options || {};
  const doc = fabriquerDocument(options.parente, options.absents);
  const trace = { charges: 0, branchements: 0, assistants: 0 };
  const base = {
    document: doc, console, trace,
    chargerAdmin() {
      trace.charges++;
      if (options.tenir) return new Promise(function (r) { options.tenir.push(r); });
      if (options.panne) return Promise.reject(new Error(options.panne));
      return Promise.resolve(true);
    },
    brancherEcouteursAdmin() { trace.branchements++; },
    initAssistant() { trace.assistants++; }
  };
  const ctx = contexteTolerant(base);
  vm.runInContext(SRC_ECRAN + '\n' + SRC_DRAPEAUX + '\n' + SRC_INIT, ctx);
  return { ctx: ctx, doc: doc, trace: trace };
}

/** Banc de CHARGEMENT : le vrai `chargerAdmin`, avec la session doublée. */
function bancChargement(options) {
  options = options || {};
  const doc = fabriquerDocument({ reglages: ['zone-horaires', 'zone-categories'] });
  doc.getElementById('reglages');            // le parent existe dès le départ
  doc.getElementById('zone-categories');     // et ses enfants aussi
  doc.getElementById('zone-horaires');
  const trace = { barre: [] };
  const base = {
    document: doc, console, trace,
    ouvrirSessionAdmin() {
      if (options.panne) return Promise.reject(new Error(options.panne));
      return Promise.resolve({ connecte: false });
    },
    definirAdminConnecte() {},
    svgIcone() { return ''; }
  };
  const ctx = contexteTolerant(base);
  vm.runInContext(SRC_ECRAN + '\n' + SRC_BARRE + '\n' + SRC_CHARGER, ctx);
  return { ctx: ctx, doc: doc, trace: trace };
}

/** Banc de CLÉ : le vrai `ouvrirSessionAdmin`, avec le réseau et le stockage doublés. */
function bancCle(options) {
  options = options || {};
  const stockage = fauxStockage();
  // `refusRestants` est un COMPTEUR, pas un booléen : `ouvrirSessionAdmin` boucle tant que la
  // clé est refusée, un refus perpétuel ferait donc tourner le test à l'infini.
  const trace = { saisies: 0, alertes: [], rangees: [], refusRestants: options.refus || 0 };
  const base = {
    document: fabriquerDocument(), console, trace, stockage,
    lireCleLocale(role) { return stockage.getItem('r92_cle_' + role) || ''; },
    definirCleLocale(role, v) { trace.rangees.push(v); stockage.setItem('r92_cle_' + role, v || ''); },
    dialogDemander() { trace.saisies++; return Promise.resolve(options.saisie || 'CLE-DE-TEST-XYZ'); },
    dialogAlerter(m) { trace.alertes.push(String(m)); return Promise.resolve(); },
    apiGet() { return Promise.resolve({ equipes: [], matchs: [] }); },
    lireConfigAdmin() {
      if (options.panne) return Promise.reject(new Error(options.panne));
      if (trace.refusRestants > 0) {
        trace.refusRestants--;
        return Promise.reject(new Error('Clé incorrecte.'));
      }
      return Promise.resolve({ global: {}, categories: [] });
    },
    estRefusCleAdmin(err) { return /incorrecte|non\s*configur/i.test(String(err && err.message)); }
  };
  const ctx = contexteTolerant(base);
  vm.runInContext(SRC_SESSION, ctx);
  return { ctx: ctx, trace: trace, stockage: stockage };
}

/* ========================================================================== */

async function controles() {

  /* ---- ① l'écran de chargement masque l'état non initialisé -------------- */
  console.log('\n① L\'écran de chargement couvre la page tant qu\'elle n\'est pas prête');

  const tenues = [];
  const b1 = bancInit({ tenir: tenues });
  const vol = b1.ctx.initAdmin();
  await tick();

  verifier('1.1', 'dès l\'appel, la page est couverte (classe « admin-chargement » posée)',
    b1.doc.body.classList.contains('admin-chargement'));
  verifier('1.2', 'le bloc d\'attente est visible, le bloc d\'erreur non',
    b1.doc.getElementById('ecran-chargement-attente').hidden === false &&
    b1.doc.getElementById('ecran-chargement-erreur').hidden === true);
  verifier('1.3', 'tant que le chargement est EN VOL, la page reste couverte',
    b1.doc.body.classList.contains('admin-chargement'),
    'la page a été dévoilée avant la fin du chargement');

  tenues[0](true);
  await vol;
  verifier('1.4', 'une fois le chargement terminé, la page est découverte',
    b1.doc.body.classList.contains('admin-chargement') === false);

  /* ---- ② un succès affiche le parcours guidé ----------------------------- */
  console.log('\n② Après un chargement réussi : câblage puis parcours guidé');

  const b2 = bancInit({});
  const ok2 = await b2.ctx.initAdmin();
  verifier('2.1', 'le chargement est annoncé réussi', ok2 === true);
  verifier('2.2', 'les écouteurs sont posés, puis l\'assistant est lancé',
    b2.trace.branchements === 1 && b2.trace.assistants === 1);
  verifier('2.3', 'la page est découverte',
    b2.doc.body.classList.contains('admin-chargement') === false);

  /* ---- ③ une panne ne détruit pas #reglages ni zone-categories ----------- */
  console.log('\n③ Une panne laisse la carte « Réglages » intacte');

  const b3 = bancChargement({ panne: 'Failed to fetch' });
  let leve = null;
  try { await b3.ctx.chargerAdmin(); } catch (e) { leve = e; }

  verifier('3.1', 'la panne est REMONTÉE à l\'appelant (elle n\'est pas avalée)',
    leve instanceof Error && leve.message === 'Failed to fetch');
  verifier('3.2', '#reglages est toujours là, et n\'a pas été réécrit',
    b3.doc.getElementById('reglages') !== null &&
    b3.doc.getElementById('reglages').innerHTML === '');
  verifier('3.3', 'zone-categories a SURVÉCU',
    b3.doc.getElementById('zone-categories') !== null,
    'la zone a été détruite : le câblage qui suit lèvera un TypeError');
  verifier('3.4', 'zone-horaires a survécu aussi',
    b3.doc.getElementById('zone-horaires') !== null);
  verifier('3.5', 'la barre de connexion est repassée à « non connecté »',
    /Non connecté/.test(b3.doc.getElementById('barre-connexion').innerHTML));

  /* --- et l'écran d'erreur, lui, dit bien que ce n'est PAS une clé refusée - */
  const b3b = bancInit({ panne: 'NetworkError when attempting to fetch resource.' });
  const ok3b = await b3b.ctx.initAdmin();
  const msg3b = b3b.doc.getElementById('ecran-chargement-message').textContent;

  verifier('3.6', 'une panne ne « réussit » pas l\'ouverture', ok3b === false);
  verifier('3.7', 'la page reste COUVERTE après la panne (aucune case vide dévoilée)',
    b3b.doc.body.classList.contains('admin-chargement'),
    'la page a été dévoilée à moitié remplie');
  verifier('3.8', 'le bloc d\'erreur est affiché avec son bouton « Réessayer »',
    b3b.doc.getElementById('ecran-chargement-erreur').hidden === false &&
    b3b.doc.getElementById('ecran-chargement-attente').hidden === true);
  verifier('3.9', 'le message parle de problème TECHNIQUE, jamais de clé refusée',
    /technique/i.test(msg3b) && !/cl[ée]\s+incorrecte/i.test(msg3b) &&
    msg3b.indexOf('NetworkError') !== -1,
    'message obtenu : ' + JSON.stringify(msg3b));
  verifier('3.10', 'aucun écouteur n\'a été posé (le câblage n\'a pas eu lieu)',
    b3b.trace.branchements === 0 && b3b.trace.assistants === 0);

  /* ---- ④ aucun écouteur sur un élément absent ---------------------------- */
  console.log('\n④ Le câblage ne suppose jamais qu\'un élément existe');

  // Le VRAI câblage, joué sur un document où `zone-categories` a disparu.
  const docA = fabriquerDocument({}, ['zone-categories', 'form-parking']);
  const ctxA = contexteTolerant({ document: docA, console });
  vm.runInContext(SRC_ECRAN + '\n' + SRC_BRANCHER, ctxA);

  let planteA = null;
  try { ctxA.brancherEcouteursAdmin(); } catch (e) { planteA = e; }

  verifier('4.1', 'le câblage complet passe SANS TypeError malgré deux éléments absents',
    planteA === null, planteA && String(planteA.message));
  verifier('4.2', 'aucun écouteur n\'a été posé sur un élément absent',
    docA.ecouteurs.every(function (e) { return !docA.disparus.has(e.id); }),
    'écouteurs fautifs : ' + JSON.stringify(
      docA.ecouteurs.filter(function (e) { return docA.disparus.has(e.id); })));
  verifier('4.3', 'les AUTRES écouteurs ont bien été posés (le câblage n\'a pas été interrompu)',
    docA.ecouteurs.length >= 50,
    'seulement ' + docA.ecouteurs.length + ' écouteurs posés');

  // Contrôle STATIQUE : plus aucun branchement direct ne subsiste dans le câblage.
  const nus = (SRC_BRANCHER.match(/getElementById\([^)]*\)\s*\n?\s*\.addEventListener/g) || []);
  verifier('4.4', 'plus aucun « getElementById(…).addEventListener » nu dans le câblage',
    nus.length === 0, nus.join(' / '));

  /* ---- ⑤ « Réessayer » relance UNE fois ---------------------------------- */
  console.log('\n⑤ « Réessayer » relance l\'ouverture, une seule fois');

  const tenues5 = [];
  const b5 = bancInit({ tenir: tenues5 });
  const premier = b5.ctx.initAdmin();
  await tick();
  const pendant = await b5.ctx.initAdmin();      // second appel PENDANT le premier
  verifier('5.1', 'un appel pendant un chargement en vol ne relance rien',
    pendant === false && b5.trace.charges === 1,
    b5.trace.charges + ' chargements lancés');

  tenues5[0](true);
  await premier;
  verifier('5.2', 'le bouton « Réessayer » a été branché, et une seule fois',
    b5.doc.ecouteurs.filter(function (e) {
      return e.id === 'bouton-reessayer-init' && e.type === 'click';
    }).length === 1);

  // Un premier essai en panne, puis un second réussi : le câblage n'a lieu QU'UNE fois.
  const b5b = bancInit({ panne: 'coupure' });
  await b5b.ctx.initAdmin();
  verifier('5.3', 'après l\'échec, rien n\'est branché', b5b.trace.branchements === 0);

  b5b.ctx.chargerAdmin = function () { b5b.trace.charges++; return Promise.resolve(true); }; // réseau revenu
  await b5b.ctx.initAdmin();
  verifier('5.4', 'le second essai réussit et branche enfin la page',
    b5b.trace.charges === 2 && b5b.trace.branchements === 1 && b5b.trace.assistants === 1);

  await b5b.ctx.initAdmin();                     // un troisième appel, par acquit de conscience
  verifier('5.5', 'un essai SUPPLÉMENTAIRE ne rebranche jamais (aucun gestionnaire dédoublé)',
    b5b.trace.branchements === 1 && b5b.trace.assistants === 1,
    b5b.trace.branchements + ' branchements');
  verifier('5.6', 'un seul écouteur « Réessayer », malgré trois passages',
    b5b.doc.ecouteurs.filter(function (e) {
      return e.id === 'bouton-reessayer-init';
    }).length === 1);

  /* ---- ⑥ une panne ne mémorise pas la clé et ne la montre pas ------------ */
  console.log('\n⑥ Une panne pendant la vérification : la clé reste en suspens');

  const SECRET = 'CLE-DE-TEST-JAMAIS-REELLE';
  const b6 = bancCle({ panne: 'Failed to fetch', saisie: SECRET });
  let leve6 = null;
  try { await b6.ctx.ouvrirSessionAdmin(); } catch (e) { leve6 = e; }

  verifier('6.1', 'la panne est remontée telle quelle',
    leve6 instanceof Error && leve6.message === 'Failed to fetch');
  verifier('6.2', 'la clé n\'a PAS été enregistrée (ni session, ni local)',
    b6.trace.rangees.length === 0 && b6.stockage.getItem('r92_cle_admin') === null,
    'rangées : ' + JSON.stringify(b6.trace.rangees));
  verifier('6.3', 'aucune alerte « Clé incorrecte » : une panne n\'est pas un refus',
    b6.trace.alertes.length === 0, JSON.stringify(b6.trace.alertes));
  verifier('6.4', 'la clé n\'apparaît NULLE PART dans le message d\'erreur',
    String(leve6.message).indexOf(SECRET) === -1);
  verifier('6.5', 'elle est gardée en mémoire VIVE pour le réessai',
    lireVar(b6.ctx, 'adminCleVolatile') === SECRET);

  // Le réessai repart avec la clé conservée, SANS redemander la saisie.
  b6.ctx.lireConfigAdmin = function () { return Promise.resolve({ global: {}, categories: [] }); };
  const saisiesAvant = b6.trace.saisies;
  const session6 = await b6.ctx.ouvrirSessionAdmin();
  verifier('6.6', 'le réessai réussit sans redemander la clé',
    session6.connecte === true && b6.trace.saisies === saisiesAvant);
  verifier('6.7', 'une fois acceptée, elle est rangée et la mémoire vive est vidée',
    b6.stockage.getItem('r92_cle_admin') === SECRET && lireVar(b6.ctx, 'adminCleVolatile') === '');

  // Un refus EXPLICITE, lui, doit bien effacer la mémoire vive — et rester nommé « incorrecte ».
  const b6b = bancCle({ refus: 1, saisie: SECRET });
  const session6b = await b6b.ctx.ouvrirSessionAdmin();
  verifier('6.8', 'un refus explicite affiche bien « Clé incorrecte » (et lui seul le fait)',
    b6b.trace.alertes.length === 1 && /incorrecte/i.test(b6b.trace.alertes[0]));
  verifier('6.9', 'après le refus, la mémoire vive est vidée puis la clé acceptée est rangée',
    session6b.connecte === true && lireVar(b6b.ctx, 'adminCleVolatile') === '' &&
    b6b.stockage.getItem('r92_cle_admin') === SECRET);

  /* ---- ⑦ preuve du harnais : le code d'AVANT doit ÉCHOUER ---------------- */
  console.log('\n⑦ Preuve du harnais : le code d\'AVANT reproduit bien le défaut');

  // Z1 — le `catch` d'AVANT écrivait dans `#reglages`, ce qui détruisait ses enfants.
  const srcAvant = substituer(SRC_CHARGER,
    '    throw erreur;',
    '    document.getElementById(\'reglages\').innerHTML = \'<div>erreur</div>\'; throw erreur;',
    'le catch d\'avant, qui réécrivait #reglages');
  const bZ1 = bancChargement({ panne: 'Failed to fetch' });
  vm.runInContext(srcAvant, bZ1.ctx);
  try { await bZ1.ctx.chargerAdmin(); } catch (e) { /* attendue */ }

  verifier('7.1', 'Z1 — le code d\'AVANT détruit bien zone-categories (défaut reproduit)',
    bZ1.doc.getElementById('zone-categories') === null,
    'la reconstruction n\'a pas reproduit le défaut : le § 3 ne prouve rien');

  // Z2 — le câblage d'AVANT, sans garde, lève un TypeError sur un élément absent.
  const srcCablageAvant = substituer(bloc(F_ADMIN, 'function ecouter('),
    'if (!element) return false;', '', 'la garde d\'existence de ecouter()');
  const docZ2 = fabriquerDocument({}, ['zone-categories']);
  const ctxZ2 = contexteTolerant({ document: docZ2, console });
  vm.runInContext(SRC_ECRAN, ctxZ2);
  vm.runInContext(srcCablageAvant, ctxZ2);       // écrase ecouter() par sa version sans garde
  vm.runInContext(SRC_BRANCHER, ctxZ2);

  let planteZ2 = null;
  try { ctxZ2.brancherEcouteursAdmin(); } catch (e) { planteZ2 = e; }

  verifier('7.2', 'Z2 — sans la garde, le câblage lève bien un TypeError (défaut reproduit)',
    planteZ2 !== null && /addEventListener|null|undefined/i.test(String(planteZ2.message)),
    'la reconstruction n\'a pas reproduit le défaut : le § 4 ne prouve rien');

  // Z3 — sans le drapeau, « Réessayer » rebrancherait tout une seconde fois.
  const srcInitAvant = substituer(SRC_INIT,
    'if (!adminEcouteursPoses) {', 'if (true) {',
    'le drapeau de branchement unique');
  const bZ3 = bancInit({});
  vm.runInContext(srcInitAvant, bZ3.ctx);
  await bZ3.ctx.initAdmin();
  await bZ3.ctx.initAdmin();

  verifier('7.3', 'Z3 — sans le drapeau, un second essai rebranche tout (défaut reproduit)',
    bZ3.trace.branchements === 2,
    'la reconstruction n\'a pas reproduit le défaut : le § 5 ne prouve rien');
  /* ---- ⑧ saisie annulée : la barre du haut porte TOUT le message --------- */
  console.log('\n⑧ Saisie annulée : la barre de connexion suffit');

  // ⚠️ CE QUE CE CONTRÔLE PROTÈGE (UX-INIT-ADMIN-DR-4B). Un message « connecte-toi… » était
  // écrit dans la carte « Réglages ». Sur ordinateur, le mode écrans déplace zone-horaires et
  // zone-categories vers leurs propres écrans et laisse #reglages vide et masqué : le message
  // était donc écrit sans jamais être visible. Il a été retiré ; la barre du haut,
  // visible dans les DEUX présentations, porte seule l'information.
  const b8 = bancChargement({});          // pas de panne → session annulée (connecte: false)
  let plante8 = null;
  let connecte8;
  try { connecte8 = await b8.ctx.chargerAdmin(); } catch (e) { plante8 = e; }
  const barre8 = b8.doc.getElementById('barre-connexion');

  verifier('8.1', 'une annulation n\'est pas une panne : rien n\'est levé, et connecte vaut false',
    plante8 === null && connecte8 === false, plante8 && String(plante8.message));
  verifier('8.2', 'la barre affiche « Non connecté »',
    /Non connecté/.test(barre8.innerHTML), barre8.innerHTML.slice(0, 80));
  verifier('8.3', 'la barre est visible et porte le bouton « Se connecter »',
    barre8.hidden === false && /id="bouton-se-connecter"/.test(barre8.innerHTML) &&
    /Se connecter/.test(barre8.innerHTML));
  verifier('8.4', 'zone-horaires a survécu', b8.doc.getElementById('zone-horaires') !== null);
  verifier('8.5', 'zone-categories a survécu', b8.doc.getElementById('zone-categories') !== null);
  verifier('8.6', '#reglages n\'a PAS été réécrit (aucun message n\'y est glissé)',
    b8.doc.getElementById('reglages').innerHTML === '',
    'contenu : ' + b8.doc.getElementById('reglages').innerHTML.slice(0, 60));
  verifier('8.7', 'plus aucune trace de la zone de message supprimée dans le code',
    lire(F_ADMIN).indexOf('zone-reglages-message') === -1 &&
    lire(F_ADMIN).indexOf('afficherMessageReglages') === -1 &&
    lire('admin.html').indexOf('zone-reglages-message') === -1);

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
