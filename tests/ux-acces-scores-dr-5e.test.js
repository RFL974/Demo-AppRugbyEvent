/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — l'accès à la TABLE DE MARQUE (saisie des scores)
 *  Chantier UX-ACCES-SCORES-DR-5E
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/ux-acces-scores-dr-5e.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *
 *  LE MANQUE COMBLÉ. `saisie.html` existait, mais AUCUN écran de l'administration n'y menait :
 *  le jour du tournoi, la personne à la table de marque devait connaître l'adresse par cœur ou
 *  la taper à la main. Et le seul QR code de l'application (dossier club) vise la page PUBLIQUE
 *  des résultats — ce n'est pas un accès à la saisie.
 *
 *  CE QU'IL PROTÈGE — d'abord les treize promesses du lot, numérotées comme sa demande :
 *   ①  l'accès est présent dans l'étape appropriée de l'administration ;
 *   ②  son libellé est explicite pour une personne qui ne connaît pas le projet ;
 *   ③  la cible résolue est exactement `saisie.html`, sans requête ni fragment ;
 *   ④  la valeur transmise au générateur QR est exactement la MÊME adresse sûre ;
 *   ⑤  ni le lien ni le QR ne contiennent `cle`, `key`, `token`, une clé factice ou une
 *       valeur de stockage ;
 *   ⑥  créer le lien ou le QR ne provoque AUCUNE navigation automatique ;
 *   ⑦  cela ne lit ni n'écrit `localStorage` ou `sessionStorage` ;
 *   ⑧  cela ne déclenche AUCUNE requête backend ;
 *   ⑨  l'accès reste visible et utilisable au clavier ;
 *   ⑩  le rendu tient sur ordinateur ET sur téléphone (règles de repli explicites) ;
 *   ⑪  la page de saisie demande TOUJOURS la clé scores pour elle-même — le lien ne la
 *       remplace pas, ne la contourne pas, ne la transporte pas ;
 *   ⑫  la demande / validation / réessai / rangement de la clé scores n'ont pas bougé ;
 *   ⑬  les fichiers JavaScript concernés restent syntaxiquement valides.
 *
 *  ET, DEPUIS LA CORRECTION DE RÉCEPTION (CORR-UX-ACCES-SCORES-DR-5E, § 10) — le critère
 *  CLAVIER du lot, qui n'était PAS satisfait à la réception : le lien était focalisable, donc
 *  réputé accessible, mais 🔬 138 tabulations étaient nécessaires pour l'atteindre sur
 *  téléphone (mesure de la revue ; 72 depuis le fil d'étapes au recontrôle du 2026-09-12, page
 *  ouverte sans clé admin — le chiffre dépend de l'état du classeur, le défaut non), parce que
 *  les TREIZE cartes du carrousel restaient toutes dans l'ordre de tabulation alors qu'une
 *  seule est visible. Sept promesses de plus :
 *   ⑭  exactement UNE carte est active, focalisable et annoncée ;
 *   ⑮  toutes les cartes inactives sortent du parcours de focus (`inert`) ;
 *   ⑯  … et de l'arbre d'accessibilité (`aria-hidden`) ;
 *   ⑰  une carte réactivée retrouve son état accessible ordinaire, dans les DEUX directions ;
 *   ⑱  la carte `libre` « Publication » reste joignable, sans rien déverrouiller d'autre ;
 *   ⑲  le fil d'étapes et les boutons Précédent / Suivant restent utilisables au clavier ;
 *   ⑳  le correctif n'ajoute ni réseau, ni stockage, ni navigation, ni seconde navigation.
 *
 *  ⭐ IL EXÉCUTE LE CODE RÉEL : `urlTableDeMarque`, `majAccesSaisie` et `dessinerQrSaisie` sont
 *  EXTRAITS de js/admin-infos-publication.js et joués sur un DOM doublé, avec le VRAI générateur
 *  de QR (js/vendor/qrcode.js), un stockage espion, un réseau espion et une navigation espionne.
 *  ⛔ Rien n'est recopié : si une fonction est renommée, l'extraction échoue bruyamment.
 *
 *  ⭐ ET IL SE PROUVE LUI-MÊME (§ Z) : l'état d'AVANT est reconstruit (le bloc retiré du HTML)
 *  et doit faire ÉCHOUER § 1 ; trois mutants (clé glissée dans l'adresse, QR qui encode autre
 *  chose que le lien, lecture du stockage) doivent être vus — puis QUATRE mutants du carrousel
 *  (cartes inactives redevenues focalisables, cartes inactives encore annoncées, inertie sans
 *  retour, toutes les cartes déclarées actives) doivent faire s'effondrer § 10, avec un nombre
 *  EXACT de contrôles tombés. Sinon, ce fichier ÉCHOUE.
 *
 *  ⭐ § 10 joue le VRAI `allerA` de js/assistant.js — et le vrai verrou avec lui
 *  (`ASSISTANT_ETAPES`, `ASSISTANT_CLES_CERVEAU`, `assistantRaisonsEtape`) — sur un DOM doublé
 *  de treize cartes qui SAIT ce qu'est un parent, un enfant et un focus. ⛔ Rien n'est réécrit :
 *  si une règle métier du carrousel changeait, ce fichier le verrait.
 *
 *  ⚠️ LES « CLÉS » UTILISÉES ICI SONT ENTIÈREMENT FACTICES. Elles sont inventées pour ce
 *  fichier, n'ouvrent rien, et n'ont jamais été de vraies clés. ⛔ Aucune requête ne quitte ce
 *  processus : il n'y a pas de serveur du tout, et toute tentative d'appel est comptée comme un
 *  ÉCHEC de contrôle.
 * ============================================================================
 */

/*
 * ⚠️ ADAPTATION EXPLICITE — IMPL-RACCORDEMENT-ACCES-SCORES-DR-5R (2026-09-15)
 *
 * Le lot 5R remplace le lien GÉNÉRIQUE `saisie.html` par un lien PROPRE À CHAQUE TOURNOI, rendu par
 * le serveur une fois l'accès préparé. Les promesses ③ (cible `saisie.html`), ④ (QR de cette
 * adresse), ⑤ (adresse fabriquée sans clé) et ⑥⑦⑧ (fabrication sans effet de bord) portaient sur
 * `urlTableDeMarque`, SUPPRIMÉE : les assertions qui IMPOSAIENT ce lien générique sont OBSOLÈTES et
 * ont été retirées (anciens § 3 à § 6, mutants Z.2 à Z.4). ⭐ Ce qui en reste vrai est gardé sous
 * une forme adaptée (§ O) : le lien et le QR ne montrent QUE ce que le serveur rend, disent la MÊME
 * chose, ne portent aucune clé, et leur affichage ne touche ni réseau, ni stockage, ni navigation.
 * § 1, § 2, § 7 à § 10 et les mutants Z.1, Z.5 à Z.12 restent, ajustés là où le HTML a changé.
 * Le parcours complet (états, gestes, confirmations, litige, saisie protégée) est prouvé par
 * tests/raccordement-acces-scores-dr-5r.test.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const F_PUB = 'js/admin-infos-publication.js';
const F_ADMIN = 'js/admin.js';
const F_ASSISTANT = 'js/assistant.js';
const F_ECRANS = 'js/ecrans.js';
const F_SAISIE = 'js/saisie.js';
const F_QRCODE = 'js/vendor/qrcode.js';
const F_HTML = 'admin.html';
const F_CSS = 'css/styles.css';

/** ⚠️ Valeurs FACTICES — inventées pour ce test, elles n'ouvrent rien et n'ont jamais rien ouvert. */
const CLE_FACTICE_SCORES = 'CLE-FACTICE-5E-scores-jamais-reelle';
const CLE_FACTICE_ADMIN = 'CLE-FACTICE-5E-admin-jamais-reelle';

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

/** Le CORPS COMPLET d'une fonction, accolades équilibrées. */
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

/** Le CORPS COMPLET d'une déclaration entre CROCHETS (`const X = [ … ];`). */
function blocCrochets(rel, entete) {
  const source = lire(rel);
  const debut = situer(source, rel, entete);
  let profondeur = 0;
  for (let i = source.indexOf('[', debut); i < source.length; i++) {
    if (source[i] === '[') profondeur++;
    else if (source[i] === ']' && --profondeur === 0) return source.slice(debut, i + 1) + ';';
  }
  throw new Error('Crochets déséquilibrés autour de « ' + entete + ' » dans ' + rel);
}

/** Une DÉCLARATION tenant sur une seule ligne (`let assistantIndex = 0;`). */
function ligne(rel, entete) {
  const source = lire(rel);
  const debut = situer(source, rel, entete);
  const fin = source.indexOf('\n', debut);
  return source.slice(debut, fin === -1 ? source.length : fin);
}

/** Le code SEUL — commentaires retirés. ⚠️ Indispensable dès qu'on COMPTE une occurrence :
    les explications de ce dépôt nomment volontiers ce qu'elles expliquent, et compter dans
    les commentaires reviendrait à se faire piéger par sa propre note. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
}

/** Remplace un fragment EXACT, en exigeant qu'il soit présent (sinon la preuve serait creuse). */
function substituer(source, avant, apres, quoi) {
  if (source.indexOf(avant) === -1) {
    throw new Error('Reconstruction impossible (' + quoi + ') : fragment introuvable. ' +
      'Le code a changé — mets ce garde-fou à jour.');
  }
  return source.split(avant).join(apres);
}

/* 5R — `urlTableDeMarque` n'existe plus : le lien vient du SERVEUR. On joue son affichage et son QR. */
const SRC_AFFICHER = bloc(F_PUB, 'function afficherLienAccesScores(');
const SRC_MAJ = bloc(F_PUB, 'function majAccesSaisie(');
const SRC_QR = bloc(F_PUB, 'function dessinerQrSaisie(');
const SRC_PUB = lire(F_PUB);
const SRC_QRCODE = lire(F_QRCODE);

/* Le PARCOURS MOBILE, pris tel quel dans js/assistant.js — les mêmes morceaux que le garde-fou
   R-098 (tests/perf-dr-3b.test.js), plus rien : c'est le VRAI verrou et le VRAI `allerA` qui
   tournent ici, pas une imitation. `allerA` est isolé pour que § Z puisse le muter. */
const SRC_ALLER = bloc(F_ASSISTANT, 'function allerA(');
const SRC_PARCOURS = [
  blocCrochets(F_ASSISTANT, 'const ASSISTANT_ETAPES'),
  bloc(F_ASSISTANT, 'const ASSISTANT_CLES_CERVEAU'),
  ligne(F_ASSISTANT, 'let assistantIndex'),
  ligne(F_ASSISTANT, 'let assistantAtteint'),
  bloc(F_ASSISTANT, 'function assistantRaisonsModifs('),
  bloc(F_ASSISTANT, 'function assistantRaisonsEtape(')
].join('\n');
const SRC_CONSTRUIRE = bloc(F_ASSISTANT, 'function construireAssistant(');

const HTML = lire(F_HTML);
const CSS = lire(F_CSS);

/* ========================================================================== */
/*  BILAN                                                                     */
/* ========================================================================== */

let reussis = 0;
const echecs = [];

function verifier(num, libelle, condition, pourquoi) {
  if (condition) {
    reussis++;
    console.log('  ✅ ' + num + ' — ' + libelle);
  } else {
    echecs.push(num + ' — ' + libelle + (pourquoi ? ' :: ' + pourquoi : ''));
    console.log('  ❌ ' + num + ' — ' + libelle + (pourquoi ? '\n        → ' + pourquoi : ''));
  }
}

function titre(t) { console.log('\n' + t + '\n' + '─'.repeat(70)); }

/* ========================================================================== */
/*  DOUBLURES — un DOM minimal, mais qui SAIT ce qu'est un enfant et un SVG.   */
/* ========================================================================== */

function fabriquerElement(id, doc) {
  const el = {
    id: id,
    href: '',
    hidden: false,
    textContent: '',
    attributs: {},
    enfants: [],          // chaînes HTML injectées, dans l'ordre du document
    parent: null,
    innerHTML: '',
    ecouteurs: [],
    addEventListener: function (type) { el.ecouteurs.push(type); },
    getAttribute: function (n) { return Object.prototype.hasOwnProperty.call(el.attributs, n) ? el.attributs[n] : null; },
    setAttribute: function (n, v) { el.attributs[n] = String(v); },
    removeAttribute: function (n) { delete el.attributs[n]; },
    /* Seul `afterbegin` est utilisé par le code réel : on refuse tout le reste bruyamment
       plutôt que de l'accepter en silence et de prouver autre chose que ce qui tourne. */
    insertAdjacentHTML: function (place, html) {
      if (place !== 'afterbegin') throw new Error('Position inattendue : ' + place);
      const noeud = {
        balise: /^\s*<\s*([a-zA-Z][\w-]*)/.exec(String(html)),
        html: String(html),
        remove: function () {
          const i = el.enfants.indexOf(noeud);
          if (i !== -1) el.enfants.splice(i, 1);
        }
      };
      noeud.balise = noeud.balise ? noeud.balise[1].toLowerCase() : '';
      el.enfants.unshift(noeud);
      doc.injections.push({ id: id, html: String(html) });
    },
    querySelector: function (sel) {
      const cible = String(sel).toLowerCase();
      for (let i = 0; i < el.enfants.length; i++) {
        if (el.enfants[i].balise === cible) return el.enfants[i];
      }
      return null;
    }
  };
  return el;
}

/**
 * Le banc d'essai.
 *
 * @param {object} opt
 *   · adresse      — l'adresse de la page d'administration (par défaut, une adresse locale) ;
 *   · sourceAfficher / sourceQr — sources SUBSTITUÉES (§ Z) ; sinon le code réel ;
 *   · sansQrcode   — ne charge pas la bibliothèque (repli « script absent ») ;
 *   · sansBloc     — le DOM ne contient pas le bloc d'accès (page allégée).
 */
function banc(opt) {
  const o = opt || {};
  const adresse = o.adresse || 'http://127.0.0.1:8080/admin.html';

  const doc = { injections: [], elements: {} };
  const ids = o.sansBloc ? [] : ['acces-saisie', 'acces-saisie-lien', 'acces-saisie-qr',
    'acces-saisie-corps', 'acces-saisie-etat', 'acces-saisie-actions', 'acces-saisie-actions-suite',
    'acces-saisie-cloture', 'bouton-copier-qr-saisie', 'acces-saisie-avertissement',
    'message-acces-saisie', 'bouton-litige-charger', 'bouton-litige-corriger', 'litige-match', 'litige-formulaire'];
  ids.forEach(function (id) { doc.elements[id] = fabriquerElement(id, doc); });
  if (doc.elements['acces-saisie-cloture']) doc.elements['acces-saisie-cloture'].hidden = true;

  const document = {
    getElementById: function (id) { return doc.elements[id] || null; }
  };

  /* --- Espions ---------------------------------------------------------- */
  const stockageLu = [];
  const stockageEcrit = [];
  const reseau = [];
  const navigations = [];
  const qrDonnees = [];      // ce qui est réellement passé à qr.addData()

  function faussStockage(nom, contenu) {
    const donnees = Object.assign({}, contenu || {});
    return {
      getItem: function (c) { stockageLu.push(nom + ':' + c); return Object.prototype.hasOwnProperty.call(donnees, c) ? donnees[c] : null; },
      setItem: function (c, v) { stockageEcrit.push(nom + ':' + c + '=' + v); donnees[c] = String(v); },
      removeItem: function (c) { stockageEcrit.push(nom + ':−' + c); delete donnees[c]; },
      key: function (i) { stockageLu.push(nom + ':key(' + i + ')'); return Object.keys(donnees)[i] || null; },
      clear: function () { stockageEcrit.push(nom + ':clear'); },
      get length() { stockageLu.push(nom + ':length'); return Object.keys(donnees).length; }
    };
  }

  /* ⚠️ Le stockage est PRÉ-REMPLI de valeurs factices. Si le code allait y puiser, § 5 verrait
     la valeur ressortir dans le lien ou dans le QR, et § 7 verrait la lecture. */
  const localStorage = faussStockage('local', {
    r92_cle_scores: CLE_FACTICE_SCORES,
    r92_cle_admin: CLE_FACTICE_ADMIN,
    r92_saisie_cat: 'U10'
  });
  const sessionStorage = faussStockage('session', { r92_cle_scores: CLE_FACTICE_SCORES });

  const location = {
    href: adresse,
    assign: function (u) { navigations.push('assign:' + u); },
    replace: function (u) { navigations.push('replace:' + u); },
    reload: function () { navigations.push('reload'); }
  };

  const window = {
    location: location,
    open: function (u) { navigations.push('open:' + u); return null; },
    localStorage: localStorage,
    sessionStorage: sessionStorage
  };

  const contexte = {
    window: window,
    document: document,
    location: location,
    localStorage: localStorage,
    sessionStorage: sessionStorage,
    URL: URL,
    console: { log: function () {}, warn: function () {}, error: function () {} },
    fetch: function (u) { reseau.push('fetch:' + u); return Promise.reject(new Error('réseau interdit dans ce test')); },
    XMLHttpRequest: function () {
      return { open: function (m, u) { reseau.push('xhr:' + u); }, send: function () {}, setRequestHeader: function () {} };
    },
    navigator: { sendBeacon: function (u) { reseau.push('beacon:' + u); return false; } },
    Image: function () { const i = {}; Object.defineProperty(i, 'src', { set: function (u) { reseau.push('img:' + u); } }); return i; },
    /* 5R — les briques voisines, DOUBLÉES et ESPIONNÉES : un appel serait compté comme réseau ou stockage. */
    afficherMessage: function (e, texte) { if (e) e.textContent = String(texte); },
    apiPostProtege: function (a) { reseau.push('apiPostProtege:' + a); return Promise.reject(new Error('réseau interdit dans ce test')); },
    ecrireAdmin: function (a) { reseau.push('ecrireAdmin:' + a); return Promise.reject(new Error('réseau interdit dans ce test')); },
    lireCleLocale: function (r) { stockageLu.push('cle:' + r); return ''; },
    module: undefined,
    exports: undefined
  };
  contexte.globalThis = contexte;
  vm.createContext(contexte);

  /* La VRAIE bibliothèque QR, puis un ESPION posé par-dessus : on veut la valeur EXACTE
     transmise à `addData`, sans changer le rendu (le SVG reste celui de la bibliothèque). */
  if (!o.sansQrcode) {
    vm.runInContext(SRC_QRCODE, contexte, { filename: F_QRCODE });
    vm.runInContext(
      'var __qrReel = qrcode;\n' +
      'qrcode = function (type, niveau) {\n' +
      '  var q = __qrReel(type, niveau);\n' +
      '  var addReel = q.addData;\n' +
      '  q.addData = function (d) { __espionQr(d); return addReel.apply(q, arguments); };\n' +
      '  return q;\n' +
      '};\n', contexte, { filename: 'espion-qr' });
    contexte.__espionQr = function (d) { qrDonnees.push(String(d)); };
  }

  /* 5R — le fichier ENTIER (il ne contient que des déclarations), avec les substitutions de § Z. */
  let pub = SRC_PUB;
  if (o.sourceAfficher) pub = substituer(pub, SRC_AFFICHER.slice(0, -1), o.sourceAfficher, 'affichage substitué');
  if (o.sourceQr) pub = substituer(pub, SRC_QR.slice(0, -1), o.sourceQr, 'QR substitué');
  vm.runInContext(pub, contexte, { filename: F_PUB });

  return {
    ctx: contexte,
    doc: doc,
    el: function (id) { return doc.elements[id] || null; },
    stockageLu: stockageLu,
    stockageEcrit: stockageEcrit,
    reseau: reseau,
    navigations: navigations,
    qrDonnees: qrDonnees
  };
}

/* ========================================================================== */
/*  OUTILS DE LECTURE DU HTML                                                 */
/* ========================================================================== */

/** Le contenu d'une <section> repérée par son id (balises imbriquées comprises). */
function sectionHtml(html, id) {
  const debut = html.indexOf('id="' + id + '"');
  if (debut === -1) return '';
  const ouvrant = html.lastIndexOf('<section', debut);
  if (ouvrant === -1) return '';
  let i = ouvrant, profondeur = 0;
  const re = /<\/?section\b/g;
  re.lastIndex = ouvrant;
  let m;
  while ((m = re.exec(html))) {
    if (html[m.index + 1] === '/') { if (--profondeur === 0) return html.slice(ouvrant, m.index); }
    else profondeur++;
    i = m.index;
  }
  return html.slice(ouvrant);
}

/** Le bloc <div id="acces-saisie"> … </div>, accolades de balises équilibrées. */
function blocAcces(html) {
  const debut = html.indexOf('<div class="publication-acces acces-saisie" id="acces-saisie">');
  if (debut === -1) return '';
  let profondeur = 0;
  const re = /<\/?div\b/g;
  re.lastIndex = debut;
  let m;
  while ((m = re.exec(html))) {
    if (html[m.index + 1] === '/') { if (--profondeur === 0) return html.slice(debut, m.index + 6); }
    else profondeur++;
  }
  return '';
}

/** Le texte visible (balises et commentaires retirés). */
function texteVisible(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ========================================================================== */
/*  § 1 — L'ACCÈS EST PRÉSENT DANS L'ÉTAPE APPROPRIÉE                          */
/* ========================================================================== */

/** Rejoué tel quel sur un HTML mutilé en § Z : il doit alors ÉCHOUER. */
function controlesPresence(html, prefixe, compter) {
  const dire = compter
    ? verifier
    : function (n, l, c) { if (!c) controlesPresence.echecsSimules++; };

  const section = sectionHtml(html, 'bloc-publication');
  const acces = blocAcces(html);

  dire(prefixe + '.1', 'le bloc d\'accès `#acces-saisie` existe dans admin.html',
    acces !== '', 'aucun bloc `#acces-saisie` : rien ne mène à la table de marque');

  dire(prefixe + '.2', 'il est DANS la carte « Publier le tournoi » (`#bloc-publication`), ' +
    'la seule étape guidée déclarée `libre` dans les deux modes',
    section !== '' && section.indexOf('id="acces-saisie"') !== -1,
    'le bloc existe mais hors de l\'étape prévue : il serait inatteignable le jour J');

  dire(prefixe + '.3', 'il porte un bouton-lien focusable, sans afficher l\'adresse temporaire en clair',
    (/<a\b[^>]*id="acces-saisie-lien"[^>]*href="#"/.test(acces) ||
      /<a\b[^>]*href="#"[^>]*id="acces-saisie-lien"/.test(acces)) &&
    !/id="acces-saisie-url"/.test(acces),
    'le bouton doit rester atteignable par Tab et l\'URL brute ne doit pas être rendue');

  dire(prefixe + '.4', 'il porte un conteneur de QR code dédié `#acces-saisie-qr`',
    /id="acces-saisie-qr"/.test(acces), 'pas de QR : le lot n\'est pas rendu');

  return acces;
}
controlesPresence.echecsSimules = 0;

function section1() {
  titre('§ 1 — ① L\'ACCÈS EST PRÉSENT DANS L\'ÉTAPE APPROPRIÉE');
  const acces = controlesPresence(HTML, '1', true);

  /* L'étape choisie doit être joignable : `bloc-publication` est déclaré `libre` dans les DEUX
     surcouches de présentation (assistant mobile ET barre latérale ordinateur). Sans cela,
     l'accès serait enfermé derrière la chaîne de préparation, exactement le jour où il sert. */
  const asst = lire(F_ASSISTANT);
  const ecr = lire(F_ECRANS);
  const ligneAsst = /\{[^{}]*blocs:\s*\['bloc-publication'\][^{}]*\}/.exec(asst);
  const ligneEcr = /\{[^{}]*blocs:\s*\['bloc-publication'\][^{}]*\}/.exec(ecr);

  verifier('1.5', '`bloc-publication` est une étape de l\'assistant mobile, et elle est `libre`',
    !!ligneAsst && /libre:\s*true/.test(ligneAsst[0]),
    'l\'accès serait verrouillé sur téléphone tant que la préparation n\'est pas finie');
  verifier('1.6', '`bloc-publication` est un écran de la barre latérale, et il est `libre`',
    !!ligneEcr && /libre:\s*true/.test(ligneEcr[0]),
    'l\'accès serait verrouillé sur ordinateur');

  /* La carte Dossier est fusionnée dans Inviter ; Suivi des clubs ajoute ensuite une étape dédiée. */
  const nbAsst = (asst.match(/\{\s*id:\s*'[^']+',\s*titre:/g) || []).length;
  const nbEcr = (ecr.match(/\{\s*id:\s*'[^']+',\s*titre:/g) || []).length;
  verifier('1.7', 'le suivi des clubs porte le parcours à 13 cartes et 14 écrans',
    nbAsst === 13 && nbEcr === 14,
    'compté ' + nbAsst + ' cartes et ' + nbEcr + ' écrans — la structure guidée a bougé');

  /* Le bloc est rempli à l'ouverture, avant que le mode guidé ne déplace les blocs. */
  /* ⚠️ On lit le CODE, jamais les commentaires : une mention de `initAssistant()` dans une
     explication fausserait complètement l'ordre observé. */
  const admin = lire(F_ADMIN).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const iMaj = admin.indexOf('majAccesSaisie()');
  const iAsst = admin.indexOf('initAssistant()');
  verifier('1.8', '`majAccesSaisie()` est appelée à l\'ouverture, AVANT `initAssistant()`',
    iMaj !== -1 && iAsst !== -1 && iMaj < iAsst,
    'appelée après le déplacement des blocs, elle remplirait un bloc déjà déménagé');

  /* La bibliothèque QR est bien servie à la page — et localement. */
  verifier('1.9', 'admin.html charge le générateur QR LOCAL (js/vendor/qrcode.js), sans CDN',
    /<script src="js\/vendor\/qrcode\.js"[^>]*><\/script>/.test(HTML) &&
    !/<script[^>]*src="https?:\/\//.test(HTML),
    'un générateur distant ferait sortir l\'adresse du poste et ajouterait une dépendance');

  return acces;
}

/* ========================================================================== */
/*  § 2 — ② LE LIBELLÉ EST EXPLICITE POUR QUI NE CONNAÎT PAS LE PROJET        */
/* ========================================================================== */

function section2(acces) {
  titre('§ 2 — ② UN LIBELLÉ COMPRÉHENSIBLE PAR QUELQU\'UN QUI DÉCOUVRE');
  const texte = texteVisible(acces);
  const lien = /<a\b[^>]*id="acces-saisie-lien"[^>]*>([\s\S]*?)<\/a>/.exec(acces);
  const libelleLien = lien ? texteVisible(lien[1]) : '';

  verifier('2.1', 'le lien porte un libellé en toutes lettres (≥ 3 mots), pas un nom de fichier',
    libelleLien.split(/\s+/).filter(Boolean).length >= 3 &&
    !/\.html/i.test(libelleLien) && libelleLien.length > 0,
    'libellé lu : « ' + libelleLien + ' »');

  verifier('2.2', 'le libellé du lien nomme la TABLE DE MARQUE',
    /table de marque/i.test(libelleLien), 'libellé lu : « ' + libelleLien + ' »');

  verifier('2.3', 'le bloc dit à quoi sert la page — « saisi… les scores » — en clair',
    /sais(it|ir|ie)[^.]{0,40}scores/i.test(texte) || /scores[^.]{0,40}sais(it|ir|ie)/i.test(texte),
    'rien n\'explique ce qu\'on fait sur cette page');

  verifier('2.4', 'le bloc prévient que la page demandera la CLÉ SCORES',
    /cl[ée] scores/i.test(texte), 'le lecteur croirait à un accès libre');

  verifier('2.5', 'le bloc dit explicitement que le lien et le QR ne contiennent AUCUNE clé',
    /aucune cl[ée]/i.test(texte), 'la garantie centrale du lot n\'est pas écrite à l\'écran');

  /* ⛔ Pas de jargon interne, pas de nom de code, pas d'abréviation de chantier dans le texte
     VISIBLE. On ne juge que ce que l'organisateur lit — les commentaires du code sont exclus. */
  const jargon = ['DR-5E', 'UX-ACCES', 'apiPost', 'localStorage', 'r92_', 'SCF', 'EDR', 'Apps Script'];
  const trouves = jargon.filter(function (j) { return new RegExp(j.replace(/[-]/g, '\\-'), 'i').test(texte); });
  verifier('2.6', 'aucun jargon interne ni nom de code dans le texte visible',
    trouves.length === 0, 'trouvé : ' + trouves.join(', '));
}

/* ========================================================================== */
/*  § O — 5R : LE LIEN ET LE QR NE MONTRENT QUE CE QUE LE SERVEUR REND         */
/* ========================================================================== */

/* ⚠️ Adresse ENTIÈREMENT FICTIVE (domaine réservé), au format du lien que rend le serveur depuis 5S :
   adresse de la passerelle séparée, suivie de `?jeton=`. */
const LIEN_FICTIF = 'https://exemple.invalid/macros/s/PASSERELLE-FICTIVE/exec?jeton=' +
  '0123456789abcdef'.repeat(4);

function sectionO() {
  titre('§ O — 5R : LE LIEN ET LE QR NE MONTRENT QUE CE QUE LE SERVEUR REND (③ à ⑧ adaptés)');
  verifier('O.1', 'l\'adresse générique a disparu : plus de `urlTableDeMarque`, plus de `saisie.html` dans le code d\'accès',
    !/function urlTableDeMarque\s*\(/.test(SRC_PUB) &&
    sansCommentaires(SRC_AFFICHER + SRC_MAJ + SRC_QR).indexOf('saisie.html') === -1);
  verifier('O.2', 'le HTML statique ne vise plus `saisie.html` et garde le lien masqué tant que le serveur n\'en rend aucun',
    texteVisible(blocAcces(HTML)).indexOf('saisie.html') === -1 && /href="#"/.test(blocAcces(HTML)) &&
    /id="acces-saisie-corps"[^>]*hidden/.test(blocAcces(HTML)));

  const b = banc({});
  b.ctx.majAccesSaisie();
  verifier('O.3', 'à l\'ouverture, avant la connexion : aucun lien, aucun QR, et l\'état invite à se connecter',
    b.el('acces-saisie-corps').hidden === true && b.el('acces-saisie-lien').href === '#' && b.qrDonnees.length === 0 &&
    /Connecte-toi/.test(b.el('acces-saisie-etat').textContent), b.el('acces-saisie-etat').textContent);

  b.ctx.afficherLienAccesScores(LIEN_FICTIF);
  verifier('O.4', 'un lien rendu par le serveur alimente le bouton, et le QR encode EXACTEMENT ce lien',
    b.el('acces-saisie-corps').hidden === false && b.el('acces-saisie-lien').hidden === false &&
    b.el('acces-saisie-lien').href === LIEN_FICTIF &&
    b.qrDonnees.length === 1 && b.qrDonnees[0] === LIEN_FICTIF,
    'encodé : ' + b.qrDonnees.join(' | '));
  b.ctx.afficherLienAccesScores(LIEN_FICTIF);
  verifier('O.5', 'réafficher le même lien ne redessine ni ne réencode rien (idempotent)',
    b.qrDonnees.length === 1 && b.el('acces-saisie-qr').enfants.length === 1);
  const svg = b.doc.injections.map(function (x) { return x.html; }).join('').replace(/xmlns(:[a-z]+)?="[^"]*"/gi, '');
  verifier('O.6', 'le SVG injecté ne contient ni script ni ressource distante',
    !/<script|https?:\/\/|url\s*\(|@import|\ssrc=|\shref=/i.test(svg));
  const INTERDITS = ['cle', 'clé', 'key', 'password', CLE_FACTICE_SCORES, CLE_FACTICE_ADMIN, 'r92_cle_scores', 'r92_cle_admin'];
  const matiere = [b.el('acces-saisie-lien').href, b.qrDonnees[0] || '',
    JSON.stringify(b.el('acces-saisie-qr').attributs)].join(' ').toLowerCase();
  verifier('O.7', 'ni le bouton-lien, ni le QR ne contiennent de clé ou de valeur de stockage',
    INTERDITS.every(function (mot) { return matiere.indexOf(mot.toLowerCase()) === -1; }));

  b.ctx.afficherLienAccesScores('');
  verifier('O.8', 'lien retiré (accès clôturé, session verrouillée) : bouton et QR disparaissent',
    b.el('acces-saisie-corps').hidden === true && b.el('acces-saisie-lien').hidden === true &&
    b.el('acces-saisie-lien').href === '#' &&
    b.el('acces-saisie-qr').enfants.length === 0);
  b.ctx.afficherLienAccesScores('http://exemple.invalid/non-chiffre');
  b.ctx.afficherLienAccesScores('javascript:alert(1)');
  verifier('O.9', 'une adresse qui n\'est pas https n\'est JAMAIS affichée ni encodée',
    b.el('acces-saisie-corps').hidden === true && b.qrDonnees.length === 1);
  verifier('O.10', '⑥ aucune navigation automatique', b.navigations.length === 0, 'observé : ' + b.navigations.join(', '));
  verifier('O.11', '⑦ aucune lecture ni écriture de stockage (ni clé lue)',
    b.stockageLu.length === 0 && b.stockageEcrit.length === 0, 'observé : ' + b.stockageLu.concat(b.stockageEcrit).join(', '));
  verifier('O.12', '⑧ aucune requête réseau à l\'ouverture ni à l\'affichage', b.reseau.length === 0, 'observé : ' + b.reseau.join(', '));
  verifier('O.13', 'ces trois fonctions ne mentionnent ni stockage, ni réseau, ni navigation, ni `innerHTML =`',
    !/localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|apiGet|apiPost|window\.open|location\.(assign|replace|reload)|\.innerHTML\s*=/
      .test(sansCommentaires(SRC_AFFICHER + SRC_QR)) &&
    !/localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|apiGet|apiPost|window\.open|location\.(assign|replace|reload)/
      .test(sansCommentaires(SRC_MAJ)));

  const sansLib = banc({ sansQrcode: true });
  let planta = false;
  try { sansLib.ctx.afficherLienAccesScores(LIEN_FICTIF); } catch (e) { planta = true; }
  verifier('O.14', 'sans la bibliothèque QR, rien ne plante et le lien reste affiché',
    !planta && sansLib.el('acces-saisie-lien').href === LIEN_FICTIF);
  const sansBloc = banc({ sansBloc: true });
  let planta2 = false;
  try { sansBloc.ctx.majAccesSaisie(); sansBloc.ctx.afficherLienAccesScores(LIEN_FICTIF); } catch (e) { planta2 = true; }
  verifier('O.15', 'sans le bloc dans le DOM, rien ne lève', !planta2);
  verifier('O.16', 'le bloc HTML ne déclare aucun gestionnaire en ligne (onclick=…)', !/\son[a-z]+\s*=/.test(blocAcces(HTML)));
}

/* ========================================================================== */
/*  § 7 — ⑨⑩ CLAVIER, VISIBILITÉ, ORDINATEUR ET TÉLÉPHONE                     */
/* ========================================================================== */

function section7(acces) {
  titre('§ 7 — ⑨⑩ ACCESSIBLE AU CLAVIER, LISIBLE SUR LES DEUX TAILLES');
  const balise = /<a\b[^>]*id="acces-saisie-lien"[^>]*>/.exec(acces);
  const a = balise ? balise[0] : '';

  verifier('7.1', 'le bouton-lien démarre masqué, puis le code le rend focalisable uniquement avec une adresse valide',
    a !== '' && /\bhidden\b/.test(a) && !/aria-hidden/.test(a) && !/tabindex\s*=\s*"-1"/.test(a) &&
    /lien\.hidden = !valide/.test(SRC_AFFICHER),
    'balise lue : ' + a);
  verifier('7.2', 'le bloc qui le contient n\'est ni `hidden` ni `aria-hidden`',
    !/<div class="publication-acces acces-saisie" id="acces-saisie"[^>]*(hidden|aria-hidden)/.test(acces),
    'un bloc masqué ne serait pas un accès');
  /* ⚠️ Compté sur le MARQUAGE seul : les commentaires du HTML expliquent justement pourquoi
     `aria-hidden` est là, et les compter reviendrait à se faire piéger par sa propre note. */
  const marquage = acces.replace(/<!--[\s\S]*?-->/g, '');
  verifier('7.3', 'le conteneur du QR n\'est pas masqué à l\'accessibilité : son bouton Copier reste utilisable',
    !/id="acces-saisie-qr"[^>]*aria-hidden/.test(marquage) && /id="bouton-copier-qr-saisie"/.test(marquage),
    'le bouton de copie ne doit jamais être placé sous aria-hidden');
  verifier('7.4', 'le lien s\'ouvre dans un nouvel onglet SANS lien de contexte (rel="noopener…")',
    /target="_blank"/.test(a) && /rel="noopener[^"]*"/.test(a), 'balise lue : ' + a);

  /* ⑩ Les règles qui font tenir le bloc sur un téléphone. Ce sont les MÊMES précautions que
     l'adresse publique (`overflow-wrap: anywhere`), plus le repli du QR sous le texte. */
  const regle = function (sel) {
    const m = new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}').exec(CSS);
    return m ? m[1] : '';
  };
  verifier('7.5', 'texte et QR se replient l\'un sous l\'autre quand la carte se resserre',
    /flex-wrap:\s*wrap/.test(regle('.acces-saisie-corps')), 'sans repli, l\'adresse serait écrasée');
  verifier('7.6', 'la colonne de texte peut rétrécir sans déborder (`min-width: 0`)',
    /min-width:\s*0/.test(regle('.acces-saisie-texte')), 'une colonne flex déborde sans cette règle');
  verifier('7.7', 'aucune adresse temporaire en clair ne peut déborder sur téléphone',
    !/class="publication-acces-url"/.test(acces) && !/id="acces-saisie-url"/.test(acces),
    'la carte de saisie doit montrer uniquement le bouton et le QR');
  verifier('7.8', 'le QR est dessiné sur fond clair (sinon il ne se scanne pas)',
    /background:\s*#fff/.test(regle('.acces-qr svg')), 'un QR sombre sur sombre est illisible');
  verifier('7.9', 'le QR ne dépasse jamais la largeur de la carte (`max-width: 100%`)',
    /max-width:\s*100%/.test(regle('.acces-qr')), 'débordement horizontal sur téléphone');
}

/* ========================================================================== */
/*  § 8 — ⑪⑫ LA CLÉ SCORES RESTE DEMANDÉE PAR LA PAGE DE SAISIE               */
/* ========================================================================== */

function section8() {
  titre('§ 8 — ⑪⑫ LA PAGE DE SAISIE DEMANDE TOUJOURS LA CLÉ, POUR ELLE-MÊME');
  const saisie = lire(F_SAISIE);

  verifier('8.1', '`saisie.js` appelle toujours `connexion(\'scores\', …)` à l\'ouverture',
    /connexion\('scores',\s*'de saisie des scores'\)/.test(saisie),
    'la page de saisie ne demanderait plus la clé — le lot aurait ouvert une porte');
  verifier('8.2', 'l\'enregistrement d\'un score passe toujours par `apiPostProtege(… \'scores\' …)`',
    /apiPostProtege\('enregistrerScore',[^)]*'scores'/.test(saisie),
    'la protection de l\'écriture des scores a bougé');
  verifier('8.3', 'la page de saisie ne lit AUCUNE clé dans l\'adresse (ni requête, ni fragment)',
    !/location\.(search|hash)/.test(saisie) && !/URLSearchParams/.test(saisie),
    'un lien pourrait alors transporter une clé — exactement ce que le lot interdit');

  /* ⑫ Le lot n'a pas touché à la mécanique de la clé : les garde-fous 5A / 5B tiennent parce
     que ces fonctions sont intactes. On vérifie ici qu'elles existent TOUJOURS, et que le
     nouveau code ne les appelle pas. */
  const api = lire('js/api.js');
  ['async function connexion(', 'async function demanderCleValide(', 'async function apiPostProtege(']
    .forEach(function (f, i) {
      verifier('8.' + (4 + i), '`' + f.replace('async function ', '').replace('(', '()') + '` est toujours là',
        api.indexOf(f) !== -1, 'la mécanique de la clé scores a été déplacée ou renommée');
    });
  verifier('8.7', 'le nouveau code n\'appelle AUCUNE de ces fonctions (il ne touche pas à la clé)',
    !/connexion\s*\(|demanderCleValide\s*\(|apiPostProtege\s*\(/.test(SRC_AFFICHER + SRC_MAJ + SRC_QR),
    'l\'accès ne doit ni valider, ni ranger, ni pré-remplir une clé');
  const protegee = lire('js/saisie-protegee.js');
  verifier('8.8', '5R — la page de saisie protégée demande la clé scores POUR ELLE-MÊME, en saisie masquée, et ne lit rien dans l\'adresse',
    /dialogDemander\('🔒 Accès de saisie des scores/.test(protegee) && /secret: true/.test(protegee) &&
    !/location\.(search|hash)|URLSearchParams/.test(sansCommentaires(protegee)),
    'la clé scores doit rester une seconde barrière, séparée du lien');
}

/* ========================================================================== */
/*  § 9 — ⑬ SYNTAXE DES FICHIERS CONCERNÉS                                    */
/* ========================================================================== */

function section9() {
  titre('§ 9 — ⑬ LES FICHIERS JAVASCRIPT CONCERNÉS RESTENT VALIDES');
  [F_PUB, F_ADMIN, F_ASSISTANT, F_ECRANS, F_SAISIE, 'js/saisie-protegee.js', 'js/api.js', 'js/commun.js', F_QRCODE]
    .forEach(function (f, i) {
      let ok = true, pourquoi = '';
      try { new vm.Script(lire(f), { filename: f }); } catch (e) { ok = false; pourquoi = e.message; }
      verifier('9.' + (i + 1), f + ' : syntaxe valide', ok, pourquoi);
    });
}

/* ========================================================================== */
/*  BANC DU CARROUSEL — treize cartes, un focus, et le VRAI verrou.            */
/* ========================================================================== */

/**
 * ⭐ POURQUOI CE SECOND BANC. Le carrousel mobile garde ses TREIZE cartes dans le document en
 * même temps : il ne fait que faire glisser la piste. Les douze cartes hors écran gardaient
 * donc leurs commandes dans l'ordre de tabulation — 🔬 138 tabulations mesurées le 2026-09-12
 * pour atteindre « Ouvrir la table de marque ». Le lien du lot était focalisable, donc déclaré
 * accessible, sans l'être pour une personne réelle. Ce banc joue le VRAI `allerA` sur un DOM
 * doublé qui SAIT ce qu'est un parent, un enfant et un focus, et il regarde ce que chaque carte
 * porte comme marquage à l'arrivée.
 *
 * ⛔ Il ne double PAS le verrou : `ASSISTANT_ETAPES`, `ASSISTANT_CLES_CERVEAU`,
 * `assistantRaisonsEtape` et `allerA` sont EXTRAITS du fichier réel. Si une règle métier
 * changeait, ce banc le verrait.
 */
function fabriquerClassList() {
  const noms = new Set();
  return {
    contains: function (n) { return noms.has(n); },
    add: function (n) { noms.add(n); },
    remove: function (n) { noms.delete(n); },
    toggle: function (n, force) {
      if (force === undefined) { if (noms.has(n)) noms.delete(n); else noms.add(n); }
      else if (force) noms.add(n); else noms.delete(n);
      return noms.has(n);
    }
  };
}

/** Un nœud doublé : attributs, parenté (pour `contains`), et un focus qui se laisse observer. */
function noeudCarrousel(nom, doc) {
  const el = {
    nom: nom,
    attributs: {},
    style: {},
    classList: fabriquerClassList(),
    textContent: '',
    scrollLeft: 0,
    clientWidth: 320,
    offsetWidth: 80,
    offsetHeight: 400,
    enfants: [],
    parent: null,
    getAttribute: function (n) { return Object.prototype.hasOwnProperty.call(el.attributs, n) ? el.attributs[n] : null; },
    setAttribute: function (n, v) { el.attributs[n] = String(v); },
    removeAttribute: function (n) { delete el.attributs[n]; },
    hasAttribute: function (n) { return Object.prototype.hasOwnProperty.call(el.attributs, n); },
    /* La VRAIE sémantique de `contains` : soi-même et toute sa descendance. C'est elle que le
       rattrapage de focus interroge — un doublon qui répondrait toujours `false` masquerait le
       défaut au lieu de le prouver. */
    contains: function (autre) {
      for (let a = autre; a; a = a.parent) { if (a === el) return true; }
      return false;
    },
    focus: function () { doc.activeElement = el; doc.focusJournal.push(el.nom); },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 0, height: 0 }; },
    scrollIntoView: function () { doc.scrolls.push(el.nom); },
    appendChild: function (enfant) { enfant.parent = el; el.enfants.push(enfant); return enfant; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  return el;
}

/**
 * @param {object} opt
 *   · sourceAller — `allerA` SUBSTITUÉ (§ Z) ; sinon le code réel ;
 *   · etats       — ce que rend le « cerveau » (par défaut : un classeur VIDE, tout à faire).
 */
function bancCarrousel(opt) {
  const o = opt || {};
  const doc = { activeElement: null, focusJournal: [], scrolls: [] };

  const track = noeudCarrousel('piste', doc);
  const etapes = vm.runInNewContext(blocCrochets(F_ASSISTANT, 'const ASSISTANT_ETAPES') +
    '\nASSISTANT_ETAPES;');
  const cartes = [];
  const commandes = [];   // UNE commande focalisable par carte — la cible d'une tabulation
  etapes.forEach(function (et, k) {
    const carte = noeudCarrousel('carte-' + k + '(' + et.id + ')', doc);
    carte.setAttribute('data-index', String(k));
    carte.classList.add('asst-slide');
    const cmd = noeudCarrousel('commande-' + k + '(' + et.id + ')', doc);
    carte.appendChild(cmd);
    track.appendChild(carte);
    cartes.push(carte);
    commandes.push(cmd);
  });
  track.querySelectorAll = function (sel) {
    return String(sel) === '.asst-slide' ? cartes.slice() : [];
  };

  const fil = [];
  etapes.forEach(function (et, k) { fil.push(noeudCarrousel('etape-' + k + '(' + et.id + ')', doc)); });

  const elements = {
    'asst-track': track,
    'asst-stepper': noeudCarrousel('fil', doc),
    'asst-compteur': noeudCarrousel('compteur', doc),
    'asst-prec': noeudCarrousel('precedent', doc),
    'asst-suiv': noeudCarrousel('suivant', doc),
    'asst-barre-jauge': noeudCarrousel('jauge', doc),
    'asst-verrou': noeudCarrousel('verrou', doc),
    assistant: noeudCarrousel('assistant', doc)
  };

  /* --- Espions : rien ne doit sortir de ce processus ---------------------- */
  const reseau = [];
  const navigations = [];
  const stockageLu = [];
  const stockageEcrit = [];
  const ouvertures = [];   // les appels à `ouvrirEtapeAdmin` (chargements différés)
  const secousses = [];

  function faussStockage(nom) {
    const donnees = { r92_cle_scores: CLE_FACTICE_SCORES, r92_cle_admin: CLE_FACTICE_ADMIN };
    return {
      getItem: function (c) { stockageLu.push(nom + ':' + c); return Object.prototype.hasOwnProperty.call(donnees, c) ? donnees[c] : null; },
      setItem: function (c, v) { stockageEcrit.push(nom + ':' + c + '=' + v); donnees[c] = String(v); },
      removeItem: function (c) { stockageEcrit.push(nom + ':−' + c); delete donnees[c]; },
      clear: function () { stockageEcrit.push(nom + ':clear'); }
    };
  }
  const localStorage = faussStockage('local');
  const sessionStorage = faussStockage('session');
  const location = {
    href: 'http://127.0.0.1:8080/admin.html',
    assign: function (u) { navigations.push('assign:' + u); },
    replace: function (u) { navigations.push('replace:' + u); },
    reload: function () { navigations.push('reload'); }
  };

  const document = {
    activeElement: null,
    getElementById: function (id) { return elements[id] || null; },
    querySelectorAll: function (sel) {
      return String(sel) === '.asst-step' ? fil.slice() : [];
    },
    querySelector: function (sel) {
      const m = /\.asst-slide\[data-index="(\d+)"\]/.exec(String(sel));
      return m ? (cartes[Number(m[1])] || null) : null;
    },
    addEventListener: function () {},
    body: noeudCarrousel('body', doc)
  };
  /* `document.activeElement` est une LECTURE VIVE : `focus()` la déplace réellement. */
  Object.defineProperty(document, 'activeElement', {
    get: function () { return doc.activeElement; },
    set: function (v) { doc.activeElement = v; }
  });

  /* ⚠️ Le « cerveau » par défaut décrit un classeur VIDE : tout est à faire. C'est l'état qui
     avait produit R-098 sur téléphone, donc l'état où le verrou doit être le plus strict. */
  const etatsParDefaut = ['horaires', 'categories', 'equipes', 'terrains', 'poules', 'apresmidi']
    .map(function (cle) { return { cle: cle, titre: cle, statut: 'afaire', detail: 'témoin' }; });

  const contexte = {
    document: document,
    window: { location: location, scrollTo: function () {}, open: function (u) { navigations.push('open:' + u); return null; } },
    location: location,
    localStorage: localStorage,
    sessionStorage: sessionStorage,
    console: { log: function () {}, warn: function () {}, error: function () {} },
    fetch: function (u) { reseau.push('fetch:' + u); return Promise.reject(new Error('réseau interdit dans ce test')); },
    XMLHttpRequest: function () {
      return { open: function (m, u) { reseau.push('xhr:' + u); }, send: function () {}, setRequestHeader: function () {} };
    },
    navigator: { sendBeacon: function (u) { reseau.push('beacon:' + u); return false; } },
    calculerEtatsEtapes: function () { return (o.etats || etatsParDefaut).slice(); },
    raisonsModifsDans: function () { return []; },
    assistantZonesSurveillees: function () { return []; },
    assistantSecouerVerrou: function () { secousses.push(1); },
    assistantMajVerrou: function () {},
    ajusterHauteur: function () {},
    ouvrirEtapeAdmin: function (id) { ouvertures.push(id); return Promise.resolve([]); }
  };
  contexte.globalThis = contexte;
  vm.createContext(contexte);
  vm.runInContext(SRC_PARCOURS + '\n' + (o.sourceAller || SRC_ALLER) +
    '\nfunction __index() { return assistantIndex; }\nfunction __atteint() { return assistantAtteint; }',
    contexte, { filename: F_ASSISTANT });

  const iDe = function (id) { return etapes.findIndex(function (e) { return e.id === id; }); };

  return {
    ctx: contexte,
    etapes: etapes,
    cartes: cartes,
    commandes: commandes,
    fil: fil,
    doc: doc,
    iDe: iDe,
    index: function () { return contexte.__index(); },
    atteint: function () { return contexte.__atteint(); },
    carteId: function () { return etapes[contexte.__index()].id; },
    /** Les cartes RESTÉES dans le parcours de focus (ni `inert`). */
    focalisables: function () {
      return cartes.filter(function (c) { return !c.hasAttribute('inert'); })
        .map(function (c) { return cartes.indexOf(c); });
    },
    /** Les cartes VISIBLES des technologies d'assistance (ni `aria-hidden`). */
    annoncees: function () {
      return cartes.filter(function (c) { return c.getAttribute('aria-hidden') !== 'true'; })
        .map(function (c) { return cartes.indexOf(c); });
    },
    reseau: reseau,
    navigations: navigations,
    stockageLu: stockageLu,
    stockageEcrit: stockageEcrit,
    ouvertures: ouvertures,
    secousses: secousses
  };
}

/* ========================================================================== */
/*  § 10 — LE PARCOURS DE FOCUS SUIT LA CARTE VISIBLE                          */
/* ========================================================================== */

/**
 * Rejoué tel quel sur un `allerA` MUTÉ en § Z : il doit alors ÉCHOUER.
 * ⚠️ C'est la raison d'être de cette forme : un contrôle d'accessibilité qui ne sait pas
 * échouer ne prouve rien, et c'est exactement ce qui s'était passé — le lien était focalisable,
 * donc réputé accessible, alors qu'il fallait 138 tabulations pour l'atteindre.
 */
function controlesFocus(sourceAller, prefixe, compter) {
  const dire = compter
    ? verifier
    : function (n, l, c) { if (!c) controlesFocus.echecsSimules++; };

  const b = bancCarrousel({ sourceAller: sourceAller });
  const iPub = b.iDe('publication');
  const total = b.cartes.length;

  /* --- ① une seule carte active, et c'est la carte affichée ---------------- */
  b.ctx.allerA(0, 0);
  dire(prefixe + '.1', 'à l\'ouverture, EXACTEMENT une carte reste dans le parcours de focus',
    b.focalisables().length === 1 && b.focalisables()[0] === 0,
    'cartes focalisables : [' + b.focalisables().join(', ') + '] sur ' + total);
  dire(prefixe + '.2', 'les ' + (total - 1) + ' autres cartes sont rendues INERTES',
    b.cartes.filter(function (c, k) { return k !== 0 && c.getAttribute('inert') !== null; }).length === total - 1,
    'une carte invisible restée focalisable, c\'est une tabulation dans le vide');

  /* --- ③ masquées pour les technologies d'assistance ---------------------- */
  dire(prefixe + '.3', 'les cartes inactives sont signalées `aria-hidden="true"`',
    b.annoncees().length === 1 && b.annoncees()[0] === 0,
    'cartes annoncées : [' + b.annoncees().join(', ') + '] — un lecteur d\'écran en lirait ' +
    b.annoncees().length);
  dire(prefixe + '.4', 'la carte active, elle, ne porte NI `inert` NI `aria-hidden`',
    !b.cartes[0].hasAttribute('inert') && !b.cartes[0].hasAttribute('aria-hidden'),
    'la carte affichée doit être accessible normalement, sans trace de son passage en inerte');

  /* --- ⑤ le changement fonctionne dans les DEUX directions ---------------- */
  b.ctx.allerA(iPub, 1);                                   // en AVANT, vers la carte libre
  dire(prefixe + '.5', 'vers l\'avant : la nouvelle carte est la seule focalisable',
    b.focalisables().length === 1 && b.focalisables()[0] === iPub &&
    b.annoncees().length === 1 && b.annoncees()[0] === iPub,
    'focalisables : [' + b.focalisables().join(', ') + '], annoncées : [' + b.annoncees().join(', ') + ']');
  dire(prefixe + '.6', 'la carte quittée est sortie du parcours de focus ET de l\'arbre d\'accessibilité',
    b.cartes[0].getAttribute('inert') !== null && b.cartes[0].getAttribute('aria-hidden') === 'true',
    'la carte de départ est restée atteignable');

  b.ctx.allerA(0, -1);                                     // en ARRIÈRE, retour à la première
  dire(prefixe + '.7', 'vers l\'arrière : la carte RÉACTIVÉE redevient focalisable et annoncée',
    !b.cartes[0].hasAttribute('inert') && !b.cartes[0].hasAttribute('aria-hidden') &&
    b.focalisables().length === 1 && b.focalisables()[0] === 0,
    'une carte inertée une fois et jamais rendue serait définitivement perdue');
  dire(prefixe + '.8', 'vers l\'arrière : la carte quittée est inertée à son tour',
    b.cartes[iPub].getAttribute('inert') !== null &&
    b.cartes[iPub].getAttribute('aria-hidden') === 'true',
    'l\'inertie ne doit pas être à sens unique');

  /* --- l'invariant, sur TOUT le parcours --------------------------------- */
  let ecarts = 0;
  for (let k = 0; k < total; k++) {
    b.ctx.allerA(k, 1);
    const f = b.focalisables();
    const a = b.annoncees();
    if (f.length !== 1 || f[0] !== b.index() || a.length !== 1 || a[0] !== b.index()) ecarts++;
  }
  for (let k = total - 1; k >= 0; k--) {
    b.ctx.allerA(k, -1);
    const f = b.focalisables();
    const a = b.annoncees();
    if (f.length !== 1 || f[0] !== b.index() || a.length !== 1 || a[0] !== b.index()) ecarts++;
  }
  dire(prefixe + '.9', 'sur un aller-retour complet, JAMAIS plus d\'une carte atteignable',
    ecarts === 0, ecarts + ' position(s) où le parcours de focus traversait une carte invisible');

  return b;
}
controlesFocus.echecsSimules = 0;

function section10() {
  titre('§ 10 — LE PARCOURS DE FOCUS SUIT LA CARTE VISIBLE (CORR-UX-ACCES-SCORES-DR-5E)');
  const b = controlesFocus(SRC_ALLER, '10', true);
  const iPub = b.iDe('publication');

  /* --- ⑥⑦⑧ LES RÈGLES MÉTIER N'ONT PAS BOUGÉ -----------------------------
     ⭐ Rejoué ICI, avec de vraies cartes dans le DOM, ce que perf-dr-3b (R-098) prouve sur un
     DOM vide : le correctif de focus ne devait toucher NI le verrou, NI les étapes `libre`, NI
     la progression acquise. Un banc sans cartes ne pouvait pas le voir — celui-ci, si. */
  const v = bancCarrousel({});                         // classeur VIDE : tout est à faire
  v.ctx.allerA(0, 0);
  v.ctx.allerA(iPub, 1);
  verifier('10.10', 'la carte LIBRE « Publication » reste joignable DIRECTEMENT, classeur vide',
    v.carteId() === 'publication',
    'arrivé sur « ' + v.carteId() + ' » — l\'accès table de marque serait hors de portée le jour J');
  const atteintApresPub = v.atteint();
  verifier('10.11', 'y entrer ne déclare PAS la progression jusqu\'à elle',
    atteintApresPub < iPub, 'assistantAtteint = ' + atteintApresPub + ' pour un rang ' + iPub);

  v.ctx.allerA(v.iDe('equipes'), 1);
  const apresEquipes = v.carteId();
  v.ctx.allerA(v.iDe('resume'), 1);
  const apresResume = v.carteId();
  v.ctx.allerA(v.iDe('reglages'), 1);
  const apresReglages = v.carteId();
  verifier('10.12', 'depuis « Publication », « Équipes » est consultable en démo',
    apresEquipes === 'equipes', 'arrivé sur ' + apresEquipes);
  verifier('10.13', 'depuis « Publication », « Résumé » est consultable en démo',
    apresResume === 'resume', 'arrivé sur ' + apresResume);
  verifier('10.14', 'l\'étape à corriger (« Réglages ») reste, elle, atteignable',
    apresReglages === 'reglages',
    'le verrou doit amener à l\'étape qui bloque, pas l\'interdire — arrivé sur ' + apresReglages);
  verifier('10.15', 'la progression acquise n\'a PAS reculé au passage (monotone)',
    v.atteint() >= atteintApresPub, 'assistantAtteint est passé de ' + atteintApresPub + ' à ' + v.atteint());
  verifier('10.16', 'la consultation libre ne déclenche aucun refus',
    v.secousses.length === 0, 'secousses comptées : ' + v.secousses.length);

  /* --- LE RATTRAPAGE DE FOCUS -------------------------------------------- */
  const f = bancCarrousel({});
  f.ctx.allerA(0, 0);
  f.commandes[0].focus();                              // le focus se tient DANS la carte 0
  const journalAvant = f.doc.focusJournal.length;
  f.ctx.allerA(iPub, 1);                               // …qui devient inerte
  verifier('10.17', 'quitter une carte où se tient le focus confie celui-ci à l\'étape active du fil',
    f.doc.activeElement === f.fil[iPub] && f.doc.focusJournal.length === journalAvant + 1,
    'focus laissé sur « ' + (f.doc.activeElement && f.doc.activeElement.nom) +
    ' » — la tabulation suivante repartirait du début de la page');
  verifier('10.18', 'le focus rattrapé ne va JAMAIS dans une carte (il reste sur le fil d\'étapes)',
    f.cartes.every(function (c) { return !c.contains(f.doc.activeElement); }),
    'le focus a été posé dans une carte : ce serait décider à la place de l\'organisateur');

  const journalApres = f.doc.focusJournal.length;
  f.ctx.allerA(0, -1);                                 // le focus est sur le FIL, hors des cartes
  verifier('10.19', 'un focus posé HORS des cartes n\'est jamais volé par un changement de carte',
    f.doc.activeElement === f.fil[iPub] && f.doc.focusJournal.length === journalApres,
    'le changement de carte a déplacé un focus qu\'il n\'avait pas à toucher');

  const n = bancCarrousel({});
  n.ctx.allerA(0, 0);                                  // construction : personne n'a le focus
  verifier('10.20', 'à la construction, aucun focus n\'est pris d\'autorité',
    n.doc.focusJournal.length === 0 && n.doc.activeElement === null,
    'l\'ouverture de la page volerait le focus : ' + n.doc.focusJournal.join(', '));

  /* --- ⑨⑩⑪ CE QUE LE CORRECTIF N'A PAS INTRODUIT ------------------------ */
  const s = bancCarrousel({});
  for (let k = 0; k < s.cartes.length; k++) s.ctx.allerA(k, 1);
  verifier('10.21', 'un parcours complet ne déclenche AUCUNE requête réseau',
    s.reseau.length === 0, 'requêtes vues : ' + s.reseau.join(', '));
  verifier('10.22', 'il ne lit ni n\'écrit AUCUN stockage',
    s.stockageLu.length === 0 && s.stockageEcrit.length === 0,
    'lectures : ' + s.stockageLu.join(', ') + ' / écritures : ' + s.stockageEcrit.join(', '));
  verifier('10.23', 'il ne provoque AUCUNE navigation automatique',
    s.navigations.length === 0, 'navigations vues : ' + s.navigations.join(', '));

  /* Le chargement différé (`ouvrirEtapeAdmin`) est le SEUL effet conservé, et il est
     inchangé : une ouverture par carte réellement atteinte, ni plus ni moins. */
  verifier('10.24', 'les chargements différés restent ceux du parcours, un par carte atteinte',
    s.ouvertures.length === s.cartes.length &&
    s.ouvertures.every(function (id) { return typeof id === 'string' && id !== ''; }),
    'ouvertures : ' + s.ouvertures.join(', '));

  /* --- LE CODE AJOUTÉ EST CONFINÉ ---------------------------------------- */
  const code = sansCommentaires(SRC_ALLER);
  const debut = code.indexOf("const slides = track.querySelectorAll('.asst-slide');");
  let inertie = '';
  if (debut !== -1) {
    let p = 0;
    for (let i = code.indexOf('{', debut); i < code.length; i++) {
      if (code[i] === '{') p++;
      else if (code[i] === '}' && --p === 0) { inertie = code.slice(debut, i + 1); break; }
    }
  }
  verifier('10.25', 'le bloc de focus est bien localisé dans `allerA` et se lit d\'un bloc',
    inertie !== '' && inertie.length < 1200, 'bloc extrait : ' + inertie.length + ' caractères');
  verifier('10.26', 'il ne lit ni n\'écrit AUCUNE règle métier (verrou, `libre`, progression)',
    inertie !== '' &&
    !/assistantAtteint|assistantIndex|calculerEtatsEtapes|assistantRaisonsEtape|libre|ouvrirEtapeAdmin/.test(inertie),
    'le correctif de présentation toucherait au verrou — exactement ce que le lot interdit');
  verifier('10.27', 'il ne clique, n\'ouvre et ne navigue nulle part',
    inertie !== '' && !/\.click\(|window\.open|location\s*[.=]/.test(inertie),
    'un correctif de focus n\'a rien à déclencher');
  verifier('10.28', '`inert` n\'est posé QUE sur les cartes (`.asst-slide`), nulle part ailleurs',
    (code.match(/inert/g) || []).length === 2 &&
    /setAttribute\('inert'/.test(inertie) && /removeAttribute\('inert'/.test(inertie),
    'compté ' + (code.match(/inert/g) || []).length + ' mentions de `inert` dans le CODE de allerA');
  verifier('10.29', 'aucun second système de navigation : `allerA` reste le seul chemin',
    !/addEventListener|tabindex/.test(inertie),
    'le bloc de focus installe un mécanisme de navigation parallèle');

  /* --- LE FIL ET LES BOUTONS NE SONT JAMAIS INERTES ---------------------- */
  verifier('10.30', 'la piste ne contient QUE des cartes : fil et boutons vivent en dehors',
    /<div class="asst-viewport"><div class="asst-track" id="asst-track"><\/div><\/div>/
      .test(SRC_CONSTRUIRE) &&
    /appendChild\(slide\)/.test(SRC_CONSTRUIRE),
    'si le fil ou les boutons entraient dans la piste, l\'inertie les emporterait');
  verifier('10.31', 'chaque étape du fil reste focalisable au clavier (`tabindex="0"`)',
    /setAttribute\('tabindex',\s*'0'\)/.test(SRC_CONSTRUIRE) &&
    /addEventListener\('keydown',\s*onStepperClic\)/.test(SRC_CONSTRUIRE),
    'le fil d\'étapes doit rester le chemin court vers une carte');
  verifier('10.32', 'les boutons Précédent et Suivant restent de vrais boutons branchés',
    /id="asst-prec"/.test(SRC_CONSTRUIRE) && /id="asst-suiv"/.test(SRC_CONSTRUIRE) &&
    /#asst-prec'\)\.addEventListener\('click'/.test(SRC_CONSTRUIRE) &&
    /#asst-suiv'\)\.addEventListener\('click'/.test(SRC_CONSTRUIRE),
    'la navigation ordinaire du carrousel doit survivre au correctif');

  /* --- ⑨⑩ LE LIEN DU LOT, UNE FOIS SA CARTE ACTIVE ---------------------- */
  const acces = blocAcces(HTML);
  verifier('10.33', 'le bloc d\'accès ne porte AUCUN marquage d\'inertie qui lui soit propre',
    !/\binert\b/.test(acces) && !/aria-hidden/.test(acces.replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<div class="acces-saisie-qr"[^>]*>/, '')),
    'le lien doit être accessible dès que sa carte est active, sans exception à lever');
  verifier('10.34', 'sa carte (`bloc-publication`) est bien celle que § 10 vient de rendre active',
    sectionHtml(HTML, 'bloc-publication').indexOf('id="acces-saisie"') !== -1 &&
    b.etapes[iPub].blocs.indexOf('bloc-publication') !== -1,
    'l\'accès et la carte rendue focalisable doivent être le même endroit');
}

/* ========================================================================== */
/*  § Z — L'AUTO-PREUVE : ces contrôles peuvent-ils ÉCHOUER ?                  */
/* ========================================================================== */

function sectionZ() {
  titre('§ Z — AUTO-PREUVE : l\'état d\'AVANT et trois mutants doivent être DÉTECTÉS');

  /* Z1 — l'état d'AVANT le lot : le bloc retiré du HTML. § 1 doit s'effondrer. */
  const avant = HTML.replace(blocAcces(HTML), '');
  controlesPresence.echecsSimules = 0;
  controlesPresence(avant, 'Z1', false);
  verifier('Z.1', 'sans le bloc (l\'état d\'AVANT), § 1 échoue sur ses 4 contrôles',
    avant !== HTML && controlesPresence.echecsSimules === 4,
    'échecs simulés : ' + controlesPresence.echecsSimules + ' — § 1 ne prouverait rien');

  /* Z2 — 5R : mutant « une clé glissée dans le lien affiché ». O.7 doit le voir. */
  const MUT_AFF = substituer(SRC_AFFICHER.slice(0, -1), "lien.href = valide ? url : '#';",
    "lien.href = valide ? url + '&cle=' + 'CLE-FACTICE-5E-scores-jamais-reelle' : '#';", 'mutant clé dans le lien');
  const b2 = banc({ sourceAfficher: MUT_AFF });
  b2.ctx.afficherLienAccesScores(LIEN_FICTIF);
  const vu2 = b2.el('acces-saisie-lien').href.toLowerCase();
  verifier('Z.2', 'mutant « clé dans le lien » : le contrôle O.7 (aucune clé) le détecte',
    MUT_AFF !== SRC_AFFICHER.slice(0, -1) && vu2.indexOf('cle') !== -1 && b2.el('acces-saisie-lien').href !== LIEN_FICTIF,
    'le mutant n\'a pas été vu : O.7 ne prouve rien');

  /* Z3 — mutant « le QR encode autre chose que le lien ». O.4 doit le voir. */
  const MUT_QR = substituer(SRC_QR.slice(0, -1), 'qr.addData(url);', "qr.addData(url + '&depuis=admin');", 'mutant QR divergent');
  const b3 = banc({ sourceQr: MUT_QR });
  b3.ctx.afficherLienAccesScores(LIEN_FICTIF);
  verifier('Z.3', 'mutant « QR divergent » : le contrôle O.4 (valeur identique au lien) le détecte',
    MUT_QR !== SRC_QR.slice(0, -1) && b3.qrDonnees[0] !== b3.el('acces-saisie-lien').href,
    'le mutant n\'a pas été vu : O.4 ne prouve rien');

  /* Z4 — mutant « une adresse non https est affichée ». O.9 doit le voir. */
  const MUT_HTTPS = substituer(SRC_AFFICHER.slice(0, -1), "const valide = /^https:\\/\\//.test(String(url || ''));",
    "const valide = String(url || '') !== '';", 'mutant adresse non sûre');
  const b4 = banc({ sourceAfficher: MUT_HTTPS });
  b4.ctx.afficherLienAccesScores('javascript:alert(1)');
  verifier('Z.4', 'mutant « adresse non https acceptée » : le contrôle O.9 le détecte',
    MUT_HTTPS !== SRC_AFFICHER.slice(0, -1) && b4.el('acces-saisie-corps').hidden === false,
    'le mutant n\'a pas été vu : O.9 ne prouve rien');

  /* Z5 — le banc sait-il seulement VOIR une navigation ? On en provoque une. */
  const b5 = banc({});
  b5.ctx.window.open('http://exemple.invalide/');
  verifier('Z.5', 'le banc détecte bien une navigation quand il y en a une',
    b5.navigations.length === 1, 'le contrôle 6.1 ne prouverait rien');

  /* Z6 — le banc sait-il seulement VOIR une requête ? */
  const b6 = banc({});
  b6.ctx.fetch('http://exemple.invalide/exec').catch(function () {});
  verifier('Z.6', 'le banc détecte bien une requête réseau quand il y en a une',
    b6.reseau.length === 1, 'le contrôle 6.4 ne prouverait rien');

  /* ======================================================================
     Z7 → Z10 — LA PREUVE NÉGATIVE DU CORRECTIF DE FOCUS.
     ⚠️ C'est le contrôle qui manquait. Le lien de ce lot ÉTAIT focalisable, donc tout
     contrôle automatique le déclarait accessible — alors qu'il fallait 138 tabulations pour
     l'atteindre. Quatre mutants remettent le carrousel dans son état défaillant, sous ses
     quatre formes possibles ; § 10 DOIT les voir tous. Sinon ce fichier échoue.

     ⚠️ LES NOMBRES ATTENDUS SONT EXACTS, comme en Z.1 : si un contrôle est ajouté à § 10,
     ces nombres bougent et il faut les remettre à jour — ⛔ jamais les assouplir en `>=`,
     ce qui laisserait passer un correctif à moitié défait.
     ====================================================================== */

  /** Rejoue § 10 sur un `allerA` muté, et rend le nombre de contrôles qui s'effondrent. */
  function mutantFocus(avant, apres, quoi) {
    const mute = substituer(SRC_ALLER, avant, apres, quoi);
    if (mute === SRC_ALLER) throw new Error('Mutant inopérant (' + quoi + ')');
    controlesFocus.echecsSimules = 0;
    controlesFocus(mute, 'Zf', false);
    return controlesFocus.echecsSimules;
  }

  /* Z7 — LE DÉFAUT D'ORIGINE, remis à l'identique : les cartes inactives redeviennent
     focalisables. C'est l'état mesuré à 138 tabulations. */
  const z7 = mutantFocus("slides[k].setAttribute('inert', '');",
    '/* mutant Z7 : la carte inactive reste dans le parcours de focus */',
    'mutant « cartes inactives focalisables »');
  verifier('Z.7', 'mutant « les cartes inactives redeviennent focalisables » : § 10 s\'effondre',
    z7 === 7, 'contrôles tombés : ' + z7 + ' (7 attendus) — § 10 ne prouverait RIEN sur le clavier');

  /* Z8 — les cartes inactives restent annoncées aux technologies d'assistance. */
  const z8 = mutantFocus("slides[k].setAttribute('aria-hidden', 'true');",
    '/* mutant Z8 : la carte inactive reste annoncée */',
    'mutant « cartes inactives annoncées »');
  verifier('Z.8', 'mutant « cartes inactives toujours annoncées » : § 10 le détecte',
    z8 === 5, 'contrôles tombés : ' + z8 + ' (5 attendus)');

  /* Z9 — l'inertie à SENS UNIQUE : une carte inertée ne redevient jamais accessible.
     C'est le défaut symétrique, et le plus sournois : le clavier semble propre, mais
     l'organisateur ne peut plus rien faire dès qu'il a changé de carte une fois. */
  const z9 = mutantFocus("slides[k].removeAttribute('inert');",
    '/* mutant Z9 : la carte redevenue active reste inerte */',
    'mutant « inertie sans retour »');
  verifier('Z.9', 'mutant « une carte réactivée reste inerte » : § 10 le détecte',
    z9 === 3, 'contrôles tombés : ' + z9 + ' (3 attendus)');

  /* Z10 — toutes les cartes déclarées actives : le marquage existe mais ne trie rien. */
  const z10 = mutantFocus('const estActive = (k === i);', 'const estActive = true;',
    'mutant « toutes les cartes actives »');
  verifier('Z.10', 'mutant « toutes les cartes actives » : § 10 le détecte',
    z10 === 8, 'contrôles tombés : ' + z10 + ' (8 attendus)');

  /* Z11 — le banc du carrousel sait-il seulement VOIR un focus se déplacer ? */
  const b11 = bancCarrousel({});
  b11.ctx.allerA(0, 0);
  b11.commandes[3].focus();
  verifier('Z.11', 'le banc du carrousel détecte bien un focus quand il y en a un',
    b11.doc.activeElement === b11.commandes[3] && b11.doc.focusJournal.length === 1,
    'les contrôles 10.17 à 10.20 ne prouveraient rien');

  /* Z12 — et sait-il voir une carte focalisable ? On en rend une à la main. */
  const b12 = bancCarrousel({});
  b12.ctx.allerA(0, 0);
  const focalisablesAvant = b12.focalisables().length;
  b12.cartes[5].removeAttribute('inert');
  verifier('Z.12', 'le banc compte bien les cartes restées focalisables',
    focalisablesAvant === 1 && b12.focalisables().length === 2,
    'le comptage de § 10 serait aveugle');
}

/* ========================================================================== */

/* ⛔ GARDE-FOU : on part en ÉCHEC, et on ne repasse au vert qu'à la toute fin du bilan. */
process.exitCode = 1;

try {
  const acces = section1();
  section2(acces);
  sectionO();
  section7(acces);
  section8();
  section9();
  section10();
  sectionZ();

  console.log('\n' + '─'.repeat(70));
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + ' contrôle(s) en défaut sur ' +
      (reussis + echecs.length) + ' :');
    echecs.forEach(function (e) { console.log('   · ' + e); });
    process.exit(1);
  }
  console.log('OK — ' + reussis + ' contrôles passés.');
  process.exitCode = 0;                       // ⭐ le seul endroit qui lève le garde-fou
} catch (e) {
  console.error('\nERREUR DU HARNAIS : ' + (e && e.stack || e));
  process.exit(1);
}
