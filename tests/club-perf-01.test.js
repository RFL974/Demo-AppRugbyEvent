#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  CLUB-PERF-01 — chargement initial de « Clubs invités » et « Suivi des clubs »
 * ============================================================================
 *  ▶ node tests/club-perf-01.test.js
 *
 *  Les deux écrans partagent UNE lecture, `listerClubsInvites` (registre `clubsInvites`, `chargerClubsInvites`).
 *  Avant ce lot : 30 s par tentative SANS budget total — une réponse muette laissait `js/api.js` relancer une seconde
 *  tentative complète, jusqu'à ≈ 60 s d'attente, annoncée « délai de 30 s dépassé ».
 *  ⛔ Une borne de 15 s par tentative a été ESSAYÉE puis REJETÉE : en production (28/09/2026), des lectures réelles et
 *  valides ont répondu en 13,9 s et 17,0 s — celle de 17,0 s aurait été abandonnée puis rejouée.
 *  ⭐ Mitigation retenue : 30 s pour la tentative ET 30 s de budget total. Une réponse valide dispose des 30 s
 *  historiques entières ; une réponse muette échoue à 30 s, sans seconde tentative automatique ; « Réessayer » reste le
 *  recours. ⚠️ C'est une borne de l'attente, pas une correction de la lenteur du serveur, dont la cause reste inconnue.
 *  ⭐ L'échec est DIT dans « Clubs invités » comme dans le Suivi : motif lisible (jamais une chaîne technique d'api.js),
 *  bouton « Réessayer » qui relit par le registre partagé, une lecture à la fois.
 *
 *  Méthode : le VRAI `js/api.js` (transport, relance, budget), le VRAI `ecrireAdmin` et le VRAI registre des ressources
 *  (admin.js), la VRAIE `chargerClubsInvites` (admin-invitations.js), exécutés sur une HORLOGE VIRTUELLE — minuteries et
 *  `performance.now()` avancent ensemble, donc les instants relevés sont exacts. Seul `fetch` est simulé, émission par
 *  émission.
 *  Contre-épreuves : ① `admin-invitations.js` FIGÉ au début du lot (révision 689674ef6b7f51a87d76ed3ac3f4fbe368ceb336,
 *  lue dans git) ; ② la variante REJETÉE à 15 s par tentative (la version courante, délai remplacé par 15 000 ms).
 *  ⛔ Aucun réseau, aucun service Google, aucun navigateur.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const AVANT_REV = '689674ef6b7f51a87d76ed3ac3f4fbe368ceb336';
const lireCourant = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const lireAvant = (f) => execFileSync('git', ['show', AVANT_REV + ':' + f], { cwd: RACINE, encoding: 'utf8' });

let total = 0;
let echecs = 0;
function verifier(code, libelle, condition, preuve) {
  total++;
  if (condition) return console.log('OK ' + code + ' — ' + libelle);
  echecs++;
  console.error('ÉCHEC ' + code + ' — ' + libelle + '\n  ' + JSON.stringify(preuve).slice(0, 1200));
}

/** Déclaration complète (fonction ou objet `const X = {…};`) : accolades équilibrées, chaînes et commentaires sautés. */
function extraire(source, entete) {
  const debut = source.indexOf(entete);
  if (debut === -1) throw new Error('Déclaration introuvable : ' + entete);
  const objet = /^(const|let|var) /.test(entete);
  const ouvre = objet ? source.indexOf('{', debut) : source.indexOf('{', source.indexOf(')', debut));
  let profondeur = 0, quote = '', echappe = false, ligne = false, bloc = false;
  for (let i = ouvre; i < source.length; i++) {
    const c = source[i], s = source[i + 1];
    if (ligne) { if (c === '\n') ligne = false; continue; }
    if (bloc) { if (c === '*' && s === '/') { bloc = false; i++; } continue; }
    if (quote) { if (echappe) echappe = false; else if (c === '\\') echappe = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && s === '/') { ligne = true; i++; continue; }
    if (c === '/' && s === '*') { bloc = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') profondeur++;
    if (c === '}' && --profondeur === 0) return source.slice(debut, i + 1) + (objet ? ';' : '');
  }
  throw new Error('Fin de déclaration introuvable : ' + entete);
}

/** Les déclarations de tête de la lecture (délai, budget s'il existe, état partagé avec le Suivi). */
function constantesLecture(source) {
  return ['DELAI_LECTURE_CLUBS_MS', 'BUDGET_LECTURE_CLUBS_MS', 'etatLectureClubs'].map((nom) => {
    const m = source.match(new RegExp('^const ' + nom + ' = [^\\n]*;$', 'm'));
    return m ? m[0] : '';
  }).filter(Boolean).join('\n');
}

/** Les déclarations de l'état d'échec de « Clubs invités » (CLUB-PERF-01), si le module les porte. */
function optionnels(source) {
  const drapeau = source.match(/^let relectureClubsEnCours = [^\n]*;$/m);
  return [drapeau ? drapeau[0] : ''].concat(['function htmlEchecLectureClubs(', 'function relireClubsInvites(']
    .map((e) => (source.indexOf(e) === -1 ? '' : extraire(source, e)))).join('\n');
}

/** Le registre des ressources d'admin.js : les deux écrans y passent pour lire la liste (une ressource = une lecture). */
const ADMIN = lireCourant('js/admin.js');
const REGISTRE = ['const ADMIN_RESSOURCES = {', 'const ADMIN_ETAPES = {', 'function etatRessourceAdmin(',
  'function marquerRessourceAdmin(', 'function ressourceAdminChargee(', 'function enfilerLectureAdmin(', 'function lancerLectureAdmin(',
  'function assurerRessourceAdmin(', 'function rafraichirRessourceAdmin(', 'function assurerRessourcesAdmin(', 'function ouvrirEtapeAdmin(']
  .map((e) => extraire(ADMIN, e)).join('\n');

/** Horloge virtuelle : minuteries ordonnées, `performance.now()` = instant courant. */
function horloge() {
  let maintenant = 0, seq = 0;
  const file = [];
  const vider = () => new Promise((r) => setImmediate(r));
  return {
    now: () => maintenant,
    setTimeout(fn, ms, ...args) { const id = ++seq; file.push({ id, t: maintenant + Math.max(0, Number(ms) || 0), fn: () => fn(...args) }); return id; },
    clearTimeout(id) { const i = file.findIndex((x) => x.id === id); if (i !== -1) file.splice(i, 1); },
    /** Avance jusqu'à ce que `fini()` soit vrai (ou que plus rien ne soit programmé). */
    async derouler(fini) {
      for (let garde = 0; garde < 10000; garde++) {
        await vider();
        if (fini()) return true;
        if (!file.length) return false;
        file.sort((a, b) => a.t - b.t || a.id - b.id);
        const x = file.shift();
        maintenant = x.t;
        x.fn();
      }
      return false;
    }
  };
}

/**
 * Joue un geste (par défaut l'arrivée sur l'écran : `chargerClubsInvites()`) contre une suite de comportements serveur.
 * @param {string} sourceInvitations  admin-invitations.js (courant, figé ou variante)
 * @param {Array<Object>} comportements  un par émission : { perdue: true } | { apresMs, statut, corps }
 * @param {string} [geste]  expression évaluée dans la page (une promesse)
 */
async function jouer(sourceInvitations, comportements, geste) {
  const h = horloge();
  const emissions = [];
  const peints = { clubs: 0, suivi: 0 };
  const zone = { innerHTML: '' };
  const fetch = (url, reglages) => {
    const corps = JSON.parse(reglages.body);
    const c = comportements[Math.min(emissions.length, comportements.length - 1)];
    const e = { action: corps.action, emiseMs: h.now(), finMs: null, issue: null };
    emissions.push(e);
    return new Promise((ok, ko) => {
      const abandon = () => {
        if (e.issue) return;
        e.finMs = h.now(); e.issue = 'abandon';
        const err = new Error('signal is aborted without reason'); err.name = 'AbortError'; ko(err);
      };
      if (reglages.signal) {
        if (reglages.signal.aborted) return abandon();
        reglages.signal.addEventListener('abort', abandon, { once: true });
      }
      if (c.perdue) return;                                   // la réponse ne revient jamais
      h.setTimeout(() => {
        if (e.issue) return;
        e.finMs = h.now(); e.issue = 'http' + c.statut;
        ok({ ok: c.statut >= 200 && c.statut < 300, status: c.statut, json: async () => c.corps });
      }, c.apresMs);
    });
  };
  const ctx = vm.createContext({
    console, URL, JSON, Promise, Object, Array, String, Number, Math, Error, TypeError,
    setTimeout: h.setTimeout, clearTimeout: h.clearTimeout, performance: { now: h.now }, AbortController, fetch,
    sessionStorage: { getItem: () => 'CLE-FICTIVE-CLUB-PERF-01', setItem() {} },
    dialogDemander: async () => null, dialogAlerter: async () => {}, dialogConfirmer: async () => false,
    document: { activeElement: null, body: null, getElementById: (id) => (id === 'liste-clubs-invites' ? zone : null) },
    echapper: (s) => String(s),
    afficherClubsInvites() { peints.clubs++; },
    afficherSuiviClubs() { peints.suivi++; }
  });
  vm.runInContext('var API_URL = "http://127.0.0.1:9/__api"; var clubsInvitesCourants = []; var estimationPublicCourante = null;' +
    ' var adminConnecte = true; const adminEtatsRessources = Object.create(null);', ctx);
  vm.runInContext(lireCourant('js/api.js'), ctx, { filename: 'js/api.js' });
  vm.runInContext(extraire(ADMIN, 'async function ecrireAdmin(') + '\n' + REGISTRE, ctx, { filename: 'admin.js (extraits)' });
  vm.runInContext(constantesLecture(sourceInvitations) + '\n' + optionnels(sourceInvitations) + '\n' +
    extraire(sourceInvitations, 'async function chargerClubsInvites('), ctx, { filename: 'chargerClubsInvites' });
  let resultat, fini = false;
  vm.runInContext(geste || 'chargerClubsInvites()', ctx).then((r) => { resultat = r; fini = true; }, (e) => { resultat = e; fini = true; });
  await h.derouler(() => fini);
  const finMs = h.now();
  const emissionsAuRetour = emissions.length;
  await h.derouler(() => false);                            // tout ce qui restait programmé : aucune émission ne doit en sortir
  const etat = vm.runInContext('({ lue: etatLectureClubs.lue, enCours: etatLectureClubs.enCours, erreur: etatLectureClubs.erreur,' +
    ' clubs: clubsInvitesCourants.length, chargee: ressourceAdminChargee("clubsInvites") })', ctx);
  return { fini, resultat, ok: resultat === true, finMs, emissions, emissionsAuRetour, emissionsFinales: emissions.length, etat, peints,
    zone: zone.innerHTML };
}

const REPONSE = { apresMs: 3000, statut: 200, corps: { ok: true, clubs: [{ club_nom: 'CLUB FICTIF A' }, { club_nom: 'CLUB FICTIF B' }], estimation_public: null } };
const PERDUE = { perdue: true };
const lente = (ms) => Object.assign({}, REPONSE, { apresMs: ms });
const instants = (r) => r.emissions.map((e) => e.emiseMs);
/** Une lecture réelle réussie : UNE émission, la liste à l'instant de la réponse, rien d'autre ensuite. */
const reussiteUnique = (r, ms) => r.ok && r.emissions.length === 1 && r.emissionsFinales === 1 && r.finMs === ms &&
  r.emissions[0].issue === 'http200' && r.etat.lue && r.etat.erreur === '' && r.etat.clubs === 2;

(async () => {
  const COURANT = lireCourant('js/admin-invitations.js');
  const AVANT = lireAvant('js/admin-invitations.js');
  const VARIANTE_15S = COURANT.replace(/^const DELAI_LECTURE_CLUBS_MS = 30000;$/m, 'const DELAI_LECTURE_CLUBS_MS = 15000;');

  /* ============================== C.0 — la lecture et ses bornes ============================== */
  console.log('\nC.0 — la lecture des clubs, ses bornes, et ce que le lot ne touche pas');
  const lecture = extraire(COURANT, 'async function chargerClubsInvites(');
  const bornes = vm.runInNewContext(constantesLecture(COURANT) + '; ({ d: DELAI_LECTURE_CLUBS_MS, b: BUDGET_LECTURE_CLUBS_MS })');
  verifier('C.0.1', 'la tentative garde les 30 s historiques, et le budget total vaut ces mêmes 30 s (aucune seconde tentative complète)',
    bornes.d === 30000 && bornes.b === 30000, bornes);
  verifier('C.0.2', 'la lecture passe le délai ET le budget à `ecrireAdmin`',
    /ecrireAdmin\('listerClubsInvites', \{\}, \{ delaiMs: DELAI_LECTURE_CLUBS_MS, budgetMs: BUDGET_LECTURE_CLUBS_MS \}\)/.test(lecture), lecture.slice(0, 600));
  const appelants = fs.readdirSync(path.join(RACINE, 'js')).filter((f) => f.endsWith('.js'))
    .filter((f) => /ecrireAdmin\('listerClubsInvites'|api(Post|PostProtege)\('listerClubsInvites'/.test(lireCourant('js/' + f)));
  verifier('C.0.3', 'une seule porte vers `listerClubsInvites` dans js/ : `chargerClubsInvites`, derrière la ressource `clubsInvites` des deux écrans',
    appelants.length === 1 && appelants[0] === 'admin-invitations.js' &&
      (COURANT.match(/ecrireAdmin\('listerClubsInvites'/g) || []).length === 1 &&
      /invitation:\s*\{ ressources: \['clubsInvites'\] \}/.test(ADMIN) && /'suivi-clubs': \{\s*ressources: \['clubsInvites'\]/.test(ADMIN), appelants);
  verifier('C.0.4', '`js/api.js` inchangé (transport partagé avec les pages publiques, épinglé ailleurs) et la lecture reste dans sa liste fermée',
    lireCourant('js/api.js') === lireAvant('js/api.js') && /'listerClubsInvites'/.test(lireCourant('js/api.js').split('ACTIONS_POST_REJOUABLES')[1] || ''), null);
  const html = lireCourant('admin.html');
  verifier('C.0.5', 'admin.html charge la version du module propre à ce lot (cache du navigateur)',
    /js\/admin-invitations\.js\?v=refonte-ciel-verre-20260928-club-perf01"/.test(html), (html.match(/admin-invitations\.js\?v=[^"]*/) || [])[0]);
  verifier('C.0.7', '« Suivi des clubs » inchangé : js/admin-suivi-clubs.js octet pour octet celui de la référence (message et « Réessayer » d\'avant)',
    lireCourant('js/admin-suivi-clubs.js') === lireAvant('js/admin-suivi-clubs.js'), null);
  verifier('C.0.6', 'contre-épreuve prête : la variante rejetée ne diffère de la version courante que par ses 15 s par tentative',
    VARIANTE_15S !== COURANT && /^const DELAI_LECTURE_CLUBS_MS = 15000;$/m.test(VARIANTE_15S) && /^const BUDGET_LECTURE_CLUBS_MS = 30000;$/m.test(VARIANTE_15S), null);

  /* ============================== C.1 — chemin nominal ============================== */
  console.log('\nC.1 — chemin nominal : inchangé');
  const n = await jouer(COURANT, [REPONSE]);
  const nAvant = await jouer(AVANT, [REPONSE]);
  verifier('C.1.1', 'réponse à 3 s : une émission, la liste à 3 s, les deux écrans repeints, état « lue »',
    reussiteUnique(n, 3000) && n.peints.clubs === 1 && n.peints.suivi >= 1, n);
  verifier('C.1.2', 'même chronologie que la version figée', JSON.stringify(instants(n)) === JSON.stringify(instants(nAvant)) && nAvant.finMs === n.finMs,
    [instants(n), instants(nAvant), n.finMs, nAvant.finMs]);

  /* ============================== C.2 — les durées réelles de production ============================== */
  console.log('\nC.2 — réponses lentes mais valides (durées relevées en production le 28/09/2026, et au-delà)');
  for (const [code, ms, libelle] of [['C.2.1', 13929, '13,9 s (« Clubs invités » en production)'], ['C.2.2', 17000, '17 s (« Suivi des clubs » en production)'],
    ['C.2.3', 20000, '20 s'], ['C.2.4', 29000, '29 s']]) {
    const r = await jouer(COURANT, [lente(ms)]);
    verifier(code, 'réponse à ' + libelle + ' : UNE émission, aucune abandonnée, la liste à ' + ms + ' ms, rien ne repart ensuite', reussiteUnique(r, ms), r);
  }
  const v17 = await jouer(VARIANTE_15S, [lente(17000)]);
  verifier('C.2.5', 'contre-épreuve — la variante rejetée (15 s par tentative) ABANDONNE la réponse de 17 s et rejoue : elle échoue au contrôle C.2.2',
    !reussiteUnique(v17, 17000) && v17.emissions.length === 2 && v17.emissions[0].issue === 'abandon' && v17.emissions[0].finMs === 15000, v17);
  const v14 = await jouer(VARIANTE_15S, [lente(13929)]);
  verifier('C.2.6', 'contre-épreuve — la même variante passait 13,9 s : seul un scénario au-delà de 15 s la démasque',
    reussiteUnique(v14, 13929), v14);

  /* ============================== C.3 — réponse perdue ============================== */
  console.log('\nC.3 — réponse perdue : échec à 30 s, sans seconde tentative automatique');
  const p1 = await jouer(COURANT, [PERDUE, REPONSE]);
  verifier('C.3.1', 'UNE seule émission, l\'échec est dit à 30 s', p1.fini && !p1.ok && p1.emissions.length === 1 && p1.finMs === 30000 &&
    p1.emissions[0].issue === 'abandon' && p1.emissions[0].finMs === 30000, p1);
  verifier('C.3.2', 'budget épuisé : aucune seconde émission, même en laissant courir toutes les minuteries', p1.emissionsFinales === 1, p1.emissions);
  verifier('C.3.3', 'le message annonce les 30 s réellement attendues, la liste n\'est pas tenue pour lue, l\'échec est affiché',
    p1.etat.erreur === 'délai de 30 s dépassé' && !p1.etat.lue && !p1.etat.enCours && !p1.etat.chargee &&
      /Impossible de charger les clubs invités/.test(p1.zone), p1.etat);
  verifier('C.3.8', '« Clubs invités » : « Impossible de charger les clubs invités : délai de 30 s dépassé. » et un bouton « Réessayer », jamais « signal is aborted »',
    p1.zone.indexOf('Impossible de charger les clubs invités : délai de 30 s dépassé.') !== -1 && !/signal is aborted/.test(p1.zone) &&
      /<button type="button" class="bouton bouton-doux" data-action="relire-clubs-invites">Réessayer<\/button>/.test(p1.zone), p1.zone);
  const clic = await jouer(COURANT, [PERDUE, REPONSE],
    "chargerClubsInvites().then(function (a) { var r1 = relireClubsInvites(); var r2 = relireClubsInvites();" +
    " var pendant = document.getElementById('liste-clubs-invites').innerHTML;" +
    " return Promise.all([r1, r2]).then(function (r) { return { a: a, r: r, pendant: pendant }; }); })");
  verifier('C.3.9', '« Réessayer » cliqué deux fois : « Chargement… », UNE nouvelle émission (registre), succès — les deux écrans repeints',
    clic.resultat && clic.resultat.a === false && clic.resultat.r[0] === true && clic.resultat.r[1] === false &&
      /Chargement des clubs invités…/.test(clic.resultat.pendant) && clic.emissionsFinales === 2 && clic.emissions[1].emiseMs === 30000 &&
      clic.finMs === 33000 && clic.etat.chargee && clic.etat.lue && clic.peints.clubs === 1 && clic.peints.suivi >= 2,
    [clic.resultat, instants(clic), clic.finMs, clic.peints]);
  const l31 = await jouer(COURANT, [lente(31000)]);
  verifier('C.3.4', 'une réponse qui viendrait à 31 s : abandonnée à 30 s, une émission, même message', !l31.ok && l31.emissionsFinales === 1 &&
    l31.finMs === 30000 && l31.etat.erreur === 'délai de 30 s dépassé', l31);
  const reessai = await jouer(COURANT, [PERDUE, REPONSE],
    "ouvrirEtapeAdmin('suivi-clubs').then(function (a) { return rafraichirRessourceAdmin('clubsInvites').then(function (b) { return a[0] === false && b; }); })");
  verifier('C.3.5', '« Réessayer » (relecture forcée du registre, celle du bouton du Suivi) : une NOUVELLE émission, décidée par l\'organisateur, qui aboutit',
    reessai.resultat === true && reessai.emissions.length === 2 && reessai.emissions[1].emiseMs === 30000 && reessai.finMs === 33000 && reessai.etat.chargee,
    reessai);
  const revisite = await jouer(COURANT, [PERDUE, REPONSE],
    "ouvrirEtapeAdmin('invitation').then(function (a) { return ouvrirEtapeAdmin('invitation').then(function (b) { return a[0] === false && b[0] === true; }); })");
  verifier('C.3.7', '« Clubs invités » (sans bouton « Réessayer ») : revenir sur l\'écran après l\'échec relance UNE lecture — le registre a effacé l\'échec — qui aboutit',
    revisite.resultat === true && revisite.emissions.length === 2 && revisite.emissions[1].emiseMs === 30000 && revisite.finMs === 33000 && revisite.etat.chargee,
    [revisite.resultat, instants(revisite), revisite.finMs]);
  const p1Avant = await jouer(AVANT, [PERDUE, PERDUE]);
  const p1Variante = await jouer(VARIANTE_15S, [PERDUE, PERDUE]);
  verifier('C.3.6', 'contre-épreuve — version figée : seconde tentative complète, échec à 60 s annoncé « 30 s » ; variante 15 s : deux émissions',
    p1Avant.emissions.length === 2 && p1Avant.finMs === 60000 && p1Avant.etat.erreur === 'délai de 30 s dépassé' &&
      p1Variante.emissions.length === 2 && p1Variante.finMs === 30000, [p1Avant.finMs, instants(p1Avant), p1Variante.finMs, instants(p1Variante)]);

  /* ============================== C.4 — 404 : le contrat de rejeu dans le budget restant ============================== */
  console.log('\nC.4 — 404 : une réémission au plus, dans le temps qui reste');
  const r404 = await jouer(COURANT, [{ apresMs: 1000, statut: 404, corps: {} }, REPONSE]);
  verifier('C.4.1', '404 à 1 s : une réémission après la pause d\'api.js (1,3 s), liste à 4,3 s — comme avant le lot',
    r404.ok && r404.emissionsFinales === 2 && JSON.stringify(instants(r404)) === '[0,1300]' && r404.finMs === 4300, [instants(r404), r404.finMs]);
  const r404p = await jouer(COURANT, [{ apresMs: 1000, statut: 404, corps: {} }, PERDUE]);
  verifier('C.4.2', '404 à 1 s puis réponse perdue : la réémission ne reçoit que le temps restant — échec à 30 s, jamais 31,3 s',
    !r404p.ok && r404p.emissionsFinales === 2 && r404p.finMs === 30000 && r404p.etat.erreur === 'délai de 30 s dépassé', [instants(r404p), r404p.finMs]);
  const r404t = await jouer(COURANT, [{ apresMs: 29500, statut: 404, corps: {} }, REPONSE]);
  // ⚠️ Le message est alors celui d'api.js (« Rejeu interne après 404 ») : fenêtre d'environ 1 s en fin de budget, texte non retouché ici.
  verifier('C.4.3', '404 à 29,5 s : la pause d\'api.js (0,3 s) passée, le budget restant est sous 1 s — AUCUNE réémission, l\'échec est dit à 29,8 s',
    !r404t.ok && r404t.emissionsFinales === 1 && r404t.finMs === 29800 && r404t.etat.erreur !== '' && !r404t.etat.lue, [r404t.finMs, r404t.etat]);
  verifier('C.4.4', '404 tardif : « réponse du serveur indisponible », dans « Clubs invités » comme dans le Suivi — jamais « Rejeu interne après 404 »',
    r404t.etat.erreur === 'réponse du serveur indisponible' && !/Rejeu interne/.test(r404t.zone) &&
      r404t.zone.indexOf('Impossible de charger les clubs invités : réponse du serveur indisponible.') !== -1, [r404t.etat, r404t.zone]);

  /* ============================== C.5 — erreur métier ============================== */
  console.log('\nC.5 — erreur métier : jamais rejouée');
  const em = await jouer(COURANT, [{ apresMs: 2000, statut: 200, corps: { error: 'Onglet Clubs illisible.' } }]);
  verifier('C.5.1', 'une seule émission, pas de relance, le motif est affiché',
    !em.ok && em.emissionsFinales === 1 && em.finMs === 2000 && em.etat.erreur === 'Onglet Clubs illisible' && !em.etat.lue &&
      em.zone.indexOf('Impossible de charger les clubs invités : Onglet Clubs illisible.') !== -1 && /data-action="relire-clubs-invites"/.test(em.zone), em);

  /* ============================== C.6 — une seule lecture pour les deux écrans ============================== */
  console.log('\nC.6 — « Clubs invités » et « Suivi des clubs » partagent une seule lecture');
  const partage = await jouer(COURANT, [lente(17000)],
    "Promise.all([ouvrirEtapeAdmin('invitation'), ouvrirEtapeAdmin('suivi-clubs')])" +
    ".then(function (a) { return Promise.all([ouvrirEtapeAdmin('suivi-clubs'), ouvrirEtapeAdmin('invitation')]).then(function (b) {" +
    " return a.concat(b).every(function (x) { return x[0] === true; }); }); })");
  verifier('C.6.1', 'les deux écrans ouverts pendant une lecture de 17 s : UNE émission partagée, puis les retours ne coûtent rien',
    partage.resultat === true && partage.emissionsFinales === 1 && partage.finMs === 17000 && partage.etat.chargee && partage.peints.suivi >= 2,
    [partage.resultat, instants(partage), partage.finMs, partage.peints]);

  /* ============================== C.7 — l'écran réel ============================== */
  console.log('\nC.7 — « Clubs invités » réel (vrais modules, vrai api.js, écouteurs d\'admin.js, vrai Code.gs) : échec à 30 s, puis « Réessayer »');
  const B = require('./banc-ecran-invitation');
  const boite = {};
  const b = await B.banc({ documentReel: true, panne: (e) => (boite.panne ? boite.panne(e) : null),
    monde: (m) => { m.postMesure({ action: 'creerJeuDemoRacing', cle: B.MI.CLE_ADMIN }); } });
  // Le banc accélère ses minuteries (×1/1000) : `performance.now()` suit ce rythme, sans quoi le budget ne s'y épuiserait jamais.
  const t0 = performance.now();
  b.ctx.performance = { now: () => (performance.now() - t0) * 1000 };
  // Connexion neuve : la liste n'a pas encore été lue.
  b.global('clubsInvitesCourants = []');
  b.global('marquerRessourceAdmin')('clubsInvites', false);
  b.global('etatLectureClubs.lue = false; etatLectureClubs.enCours = false; etatLectureClubs.erreur = ""');
  b.journal.length = 0;
  let muettes = 1;
  boite.panne = (e) => (e.action === 'listerClubsInvites' && muettes > 0 ? (muettes--, 'silence') : null);
  const texte = (id) => { const e = b.id(id); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const arrivee = await b.jouer(() => b.global('ouvrirEtapeAdmin')('invitation'));
  const bouton = b.doc.querySelector('#liste-clubs-invites [data-action="relire-clubs-invites"]');
  verifier('C.7.1', 'réponse muette : UNE requête, « Impossible de charger les clubs invités : délai de 30 s dépassé. », bouton « Réessayer » visible',
    !arrivee.bloque && arrivee.requetes.length === 1 && texte('liste-clubs-invites').indexOf('Impossible de charger les clubs invités : délai de 30 s dépassé.') !== -1 &&
      !/signal is aborted|Rejeu interne/.test(texte('liste-clubs-invites')) && !!bouton && bouton.textContent.trim() === 'Réessayer' && !bouton.hidden,
    [arrivee.resume, texte('liste-clubs-invites')]);
  verifier('C.7.2', '« Suivi des clubs » : son message et son « Réessayer » d\'avant, inchangés',
    /Impossible de charger le suivi des clubs \(délai de 30 s dépassé\)/.test(texte('liste-suivi-clubs')) &&
      !!b.doc.querySelector('#liste-suivi-clubs [data-action="relire-suivi"]'), texte('liste-suivi-clubs'));
  let pendant = null;
  const reessaiEcran = !bouton ? { bloque: true, requetes: [], resume: 'aucun bouton « Réessayer »' }
    : await b.jouer(async () => { await Promise.all([b.cliquer(bouton), b.cliquer(bouton)]); },
      async (n) => { if (n === 0) pendant = texte('liste-clubs-invites'); });
  const attendus = b.srv.clubs().length;
  verifier('C.7.3', 'double clic sur « Réessayer » : « Chargement… », UNE lecture, puis la liste dans « Clubs invités » ET dans le Suivi',
    !reessaiEcran.bloque && reessaiEcran.requetes.length === 1 && /Chargement des clubs invités/.test(pendant || '') && attendus > 0 &&
      b.doc.querySelectorAll('#liste-clubs-invites .club-invite-item').length === attendus &&
      b.doc.querySelectorAll('#liste-suivi-clubs .suivi-club-ligne').length === attendus && b.global('ressourceAdminChargee')('clubsInvites'),
    [reessaiEcran.resume, pendant, attendus, b.doc.querySelectorAll('#liste-clubs-invites .club-invite-item').length]);
  const retour = await b.jouer(async () => { await b.global('ouvrirEtapeAdmin')('suivi-clubs'); await b.global('ouvrirEtapeAdmin')('invitation'); });
  verifier('C.7.4', 'ensuite, aller et venir entre les deux écrans : 0 requête (lecture partagée)', !retour.bloque && retour.requetes.length === 0, retour.resume);

  console.log('\n==================================================');
  console.log('CLUB-PERF-01 — ' + (total - echecs) + '/' + total + ' OK, ' + echecs + ' ÉCHEC(S)');
  process.exitCode = echecs ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
