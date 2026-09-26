#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « SUIVI DES CLUBS » — tout l'écran, vrais modules contre le vrai Code.gs (lot « Suivi des clubs »)
 * ============================================================================
 *  ▶ node tests/ecran-suivi-surface.test.js [--frontend avant|<racine>] [--backend avant|<Code.gs>] [--mele <fichier,fichier>]
 *    `avant` = références FIGÉES du début du lot, lues dans git — jamais HEAD, jamais un hash abrégé :
 *    frontend b8c638bd5c0969a38445b93e56fd681abda679e4, backend 29543cf5c8b17364b079b49ae3a8dfc92c238ac9.
 *    `--mele js/admin-suivi-clubs.js,…` : cache du navigateur mêlant les versions — ces fichiers-là servis dans leur version d'avant.
 *
 *  Banc : banc-ecran-invitation.js (vrais modules, vrai api.js, écouteurs de `document` gardés : option `documentReel`), jeu de
 *  démonstration créé par le vrai serveur, fiche latérale et recherche posées comme ecrans.js les pose. Seul `fetch` est simulé.
 *    V.0  inventaire : chaque contrôle du Suivi (résumé, filtres, tableau, fiche de chaque sorte de club, dépliant, PDF,
 *         recherche) est classé ; un contrôle nouveau ou disparu fait tomber V.0 ;
 *    V.Z  gestes locaux (filtres, indicateurs, recherche, fiche, dépliant, confirmations annulées, PDF) : 0 appel, au plus bas ;
 *    V.A  arrivée : « Chargement… » pendant la lecture, échec DIT (plus de faux « aucun club »), « Réessayer » (une requête,
 *         même au double clic), lecture muette BORNÉE (plus d'écran pendu), relecture en échec : dernier état connu, signalé ;
 *    V.B  boutons de tête de la fiche occupés pendant l'écriture ; double clic : une écriture ;
 *    V.F  focus : gardé au repeint (filtre, tableau, fiche), rendu au bouton du geste après la confirmation, jamais volé ;
 *    V.C  liste remplacée pendant un geste (réponse d'un autre geste, relecture partie avant l'écriture) : l'écran suit le serveur ;
 *    V.R  non-régression des e-mails déjà acquis (lot « Inviter un club ») : une requête, un e-mail, aucun sous le verrou, reprise ;
 *    V.I  « Envoyer l’invitation » (club jamais invité) ≠ « Relancer la réponse » : mêmes mots ET même demande qu'une première invitation
 *         d'« Inviter un club » (`relance: non`, aucune fausse date de relance, refus serveur qui parle d'invitation) ; la vraie relance
 *         garde `relance: oui` et sa date ; double clic, réponse perdue (même identifiant), réseau coupé ; les deux consommateurs ;
 *    V.X  cohérence : jeu de démonstration exact, Suivi ↔ Équipes ↔ demande d'autorisation.
 *  ⛔ Aucun réseau, aucun service Google réel ; tournoi fictif.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const B = require('./banc-ecran-invitation');
const BC = require('./banc-ecran-categories');

const FRONTEND_AVANT_REV = 'b8c638bd5c0969a38445b93e56fd681abda679e4';
const BACKEND_AVANT_REV = '29543cf5c8b17364b079b49ae3a8dfc92c238ac9';
const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
const LECTEUR_AVANT = (f) => B.git(B.RACINE, FRONTEND_AVANT_REV, f);
const BASE = arg('frontend') === 'avant' ? LECTEUR_AVANT : arg('frontend') ? B.lecteur(path.resolve(arg('frontend'))) : B.lecteur();
const MELES = (arg('mele') || '').split(',').map((x) => x.trim()).filter(Boolean);
const LIRE = MELES.length ? (f) => (MELES.indexOf(f) !== -1 ? LECTEUR_AVANT(f) : BASE(f)) : BASE;
const CODE = arg('backend') === 'avant' ? B.git(B.BACKEND, BACKEND_AVANT_REV, 'Code.gs')
  : arg('backend') ? fs.readFileSync(path.resolve(arg('backend')), 'utf8') : fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');
const t = BC.compteur();
const json = JSON.stringify;
const essai = async (code, fn) => { try { await fn(); } catch (e) { t.vrai(false, code + ' (exception) ' + String(e && e.stack || e).slice(0, 400)); } };
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');

/** Clubs sans équipe propres aux scénarios d'interaction de ce banc — ils ne font plus partie du jeu produit. */
function peuplerClubsScenarioSuivi(m) {
  const ajouter = (club, reponse) => {
    m.appeler('ajouterClubInvite', m.classeur, { club_nom: club, club_contact_prenom: 'Contact', club_contact_nom: 'Démo – ' + club,
      club_contact_email: 'demo-' + club.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '@example.invalid' });
    m.appeler('ecrireEngagementClub', m.classeur, club, reponse, true);
  };
  ajouter('RC PUTEAUX', { statut: 'Décliné', invitation_envoyee: '2026-09-03', date_reponse: '2026-09-07', confirmation_reponse_envoyee: '2026-09-07 18:40:00' });
  ajouter('RC BOULOGNE', { statut: 'Invité', invitation_envoyee: '2026-09-03', derniere_relance_reponse: '2026-09-15' });
  ajouter('RC SAINT-CLOUD', { statut: 'Invité' });
}

/** Un banc prêt : jeu de démonstration, page à l'état d'une connexion neuve (liste des clubs pas encore lue). */
async function preparer(o) {
  const opts = o || {};
  let entree = null;
  const b = await B.banc(Object.assign({ lire: LIRE, backend: CODE, documentReel: true, avantServir: (e) => { entree = e; },
    monde: (m) => {
      m.postMesure({ action: 'creerJeuDemoRacing', cle: B.MI.CLE_ADMIN });
      if (!opts.sansExtras) peuplerClubsScenarioSuivi(m);
    } }, opts.banc || {}));
  const orig = b.srv.postMesure;
  b.srv.postMesure = (corps, lib) => {
    const remplacer = b.remplacer && b.remplacer[corps.action];
    if (remplacer) { delete b.remplacer[corps.action]; if (entree) entree.mesure = remplacer.mesure; return remplacer; }
    const s = orig(corps, lib); if (entree) entree.mesure = s.mesure; entree = null; return s;
  };
  b.global('configCourante = ' + json(b.srv.config()));
  b.global('equipesCourantes = ' + json(b.srv.equipes()));
  // Ce qu'ecrans.js pose (preparerSuiviClubs, preparerOutilsCiel) : la fiche latérale et la recherche du Suivi.
  const fiche = b.doc.createElement('aside'); fiche.id = 'cv-fiche-club'; fiche.className = 'carte cv-fiche-club est-vide';
  b.doc.body.appendChild(fiche);
  const barre = b.doc.createElement('div'); barre.className = 'cv-recherche';
  barre.innerHTML = '<label><input class="r-input" type="search" id="cv-recherche-liste-suivi-clubs"></label><span role="status" class="cv-recherche-resultat"></span>';
  b.doc.body.appendChild(barre);
  b.id('cv-recherche-liste-suivi-clubs').dataset = { liste: 'liste-suivi-clubs', lignes: '.suivi-club-ligne' };   // le mini-DOM ne relie pas data-* à dataset
  // Le mini-DOM ne lit que [attr="valeur"] : même sélecteur, écrit comme il le lit.
  b.global(BC.extrait(LIRE('js/ecrans.js'), 'actualiserRecherchesCiel').replace('[role=status]', '[role="status"]'));
  b.id('cv-recherche-liste-suivi-clubs').addEventListener('input', b.global('actualiserRecherchesCiel'));
  b.global(LIRE('js/vendor/pdf-lib.min.js'));
  const U = class extends URL {}; U.createObjectURL = () => { b.pdfs = (b.pdfs || 0) + 1; return 'blob:banc'; }; U.revokeObjectURL = () => {};
  b.ctx.URL = U;
  if (!b.doc.Element.prototype.remove) {
    b.doc.Element.prototype.remove = function () { if (this.parentNode) { const e = this.parentNode.enfants; e.splice(e.indexOf(this), 1); this.parentNode = null; } };
  }
  // Connexion neuve : la liste des clubs n'est pas lue (l'administration s'ouvre sur « Infos ») ; le Suivi montre le HTML d'origine.
  b.global('clubsInvitesCourants = []');
  b.global('marquerRessourceAdmin')('clubsInvites', false);
  b.global('if (typeof etatLectureClubs === "object") { etatLectureClubs.lue = false; etatLectureClubs.enCours = false; etatLectureClubs.erreur = ""; }');
  b.id('liste-suivi-clubs').innerHTML = '<p class="vide">Connecte-toi pour charger le suivi.</p>';
  b.id('suivi-clubs-resume').innerHTML = ''; b.id('suivi-clubs-filtres').innerHTML = '';
  // Compte au plus bas : chaque invocation de fetch (le seul transport du banc) et des autres primitives réseau.
  b.reseau = { fetch: 0, autres: 0 };
  const fetchBanc = b.ctx.fetch;
  b.ctx.fetch = function () { b.reseau.fetch++; return fetchBanc.apply(this, arguments); };
  b.ctx.XMLHttpRequest = function () { b.reseau.autres++; this.open = () => {}; this.send = () => {}; };
  b.ctx.navigator.sendBeacon = () => { b.reseau.autres++; return true; };
  b.ctx.window.open = () => { b.reseau.autres++; return null; };
  b.panne = null;
  if (!opts.sansArrivee) await b.jouer(() => b.global('ouvrirEtapeAdmin')('suivi-clubs'));
  b.journal.length = 0; b.dialogues.length = 0;
  return b;
}
const panneUnique = (action, mode, n) => { let reste = n || 1; return (e) => (e.action === action && reste > 0 ? (reste--, mode) : null); };
const ligne = (b, club) => b.doc.querySelectorAll('#liste-suivi-clubs .suivi-club-ligne').filter((l) => l.getAttribute('data-club') === club)[0] || null;
const boutonFiche = (b, action, zone) => b.doc.querySelectorAll('#cv-fiche-club ' + (zone || '') + ' [data-action="' + action + '"]')
  .filter((x) => x.getAttribute('data-club') !== null)[0] || null;
const decrire = (e) => !e ? 'page' : (e.id ? '#' + e.id : e.tag) + ['data-filtre', 'data-action', 'data-club'].map((a) => e.getAttribute(a) !== null ? '[' + a + '=' + e.getAttribute(a) + ']' : '').join('');
async function ouvrirFiche(b, club, deplier) {
  await b.cliquer(ligne(b, club).querySelector('[data-action="ouvrir-fiche"]'));
  if (deplier && b.id('cv-fiche-reste') && b.id('cv-fiche-reste').hidden) await b.cliquer(b.doc.querySelector('#cv-fiche-club .cv-fiche-plus'));
}
/** Le clic du Suivi ne rend pas la promesse du geste : on attend qu'aucun geste ne soit plus en vol. */
async function finGeste(b) {
  for (let i = 0; i < 20000; i++) {
    await BC.tour();
    const enCours = b.global('(typeof suiviGestesEnCours !== "undefined" ? suiviGestesEnCours.size : 0) + (typeof envoisEnCours !== "undefined" ? envoisEnCours.size : 0)');
    if (!enCours && i > 3) return;
    await attendre(1);
  }
}
async function zero(b, code, libelle, geste) {
  const avant = json(b.reseau);
  const r = await b.jouer(geste);
  await attendre(80);
  t.vrai(r.requetes.length === 0 && b.journal.length === 0 && json(b.reseau) === avant && !r.bloque,
    code + ' ' + libelle + ' : 0 requête, 0 appel réseau', [r.resume, b.reseau]);
  b.journal.length = 0;
}
const clubServeur = (b, nom) => b.srv.clubs().filter((c) => c.club_nom === nom)[0] || {};
const clubMemoire = (b, nom) => b.global('clubsInvitesCourants').filter((c) => c.club_nom === nom)[0] || {};

(async () => {
  /* ============================== V.0 — inventaire ============================== */
  console.log('\nV.0 — inventaire : chaque contrôle du Suivi est classé');
  const b = await preparer();
  await essai('V.0', async () => {
    const LOCAL = 'local', ACTION = 'action';
    const CLASSEMENT = { 'filtre:resume': LOCAL, 'filtre:filtres': LOCAL, 'ouvrir-fiche': LOCAL, 'fermer-fiche': LOCAL, 'fiche-complete': LOCAL,
      '#bouton-pdf-suivi-restauration': LOCAL, '#cv-recherche-liste-suivi-clubs': LOCAL, '#cv-fiche-nom': LOCAL,
      'relance-reponse': ACTION, 'renvoyer-confirmation': ACTION, 'relance-paiement': ACTION, 'marquer-paye': ACTION,
      'marquer-a-payer': ACTION, 'envoyer-dossier': ACTION };
    const vus = new Set();
    const relever = () => ['suivi-clubs-resume', 'suivi-clubs-filtres', 'liste-suivi-clubs', 'cv-fiche-club'].forEach((z) => b.id(z)
      .querySelectorAll('button, input, [tabindex]').forEach((e) => vus.add(e.getAttribute('data-filtre') !== null ? 'filtre:' + z.replace('suivi-clubs-', '')
        : e.getAttribute('data-action') || '#' + e.id)));
    relever(); vus.add('#bouton-pdf-suivi-restauration'); vus.add('#cv-recherche-liste-suivi-clubs');
    for (const club of b.global('clubsInvitesCourants').map((c) => c.club_nom)) { await ouvrirFiche(b, club, true); relever(); }
    await b.cliquer(b.doc.querySelector('#cv-fiche-club [data-action="fermer-fiche"]'));
    const inconnus = [...vus].filter((k) => !CLASSEMENT[k]);
    const absents = Object.keys(CLASSEMENT).filter((k) => !vus.has(k));
    t.vrai(!inconnus.length && !absents.length, 'V.0 ' + vus.size + ' sortes de contrôles, toutes classées (' +
      [...vus].filter((k) => CLASSEMENT[k] === LOCAL).length + ' locales, ' + [...vus].filter((k) => CLASSEMENT[k] === ACTION).length + ' actions)', { inconnus, absents });
  });

  /* ============================== V.Z — gestes locaux : zéro appel ============================== */
  console.log('\nV.Z — gestes locaux : zéro appel');
  await essai('V.Z', async () => {
    for (const zone of ['suivi-clubs-filtres', 'suivi-clubs-resume']) {
      for (const f of b.doc.querySelectorAll('#' + zone + ' [data-filtre]').map((x) => x.getAttribute('data-filtre'))) {
        await zero(b, 'V.Z.' + zone.slice(12) + '.' + f, 'filtre « ' + f + ' » (' + zone + ')', () => b.cliquer(b.doc.querySelector('#' + zone + ' [data-filtre="' + f + '"]')));
      }
    }
    await b.cliquer(b.doc.querySelector('#suivi-clubs-filtres [data-filtre="tous"]'));
    const champ = b.id('cv-recherche-liste-suivi-clubs');
    await zero(b, 'V.Z.recherche', 'recherche « clam » frappée une lettre à la fois, puis effacée', async () => {
      for (const c of 'clam') { champ.value += c; await b.declencher(champ, 'input'); }
      champ.value = ''; await b.declencher(champ, 'input'); });
    for (const club of b.global('clubsInvitesCourants').map((c) => c.club_nom)) {
      await zero(b, 'V.Z.fiche.' + club, club + ' : ouvrir, déplier, replier, fermer la fiche', async () => {
        await b.cliquer(ligne(b, club).querySelector('[data-action="ouvrir-fiche"]'));
        await b.cliquer(b.doc.querySelector('#cv-fiche-club .cv-fiche-plus')); await b.cliquer(b.doc.querySelector('#cv-fiche-club .cv-fiche-plus'));
        await b.cliquer(b.doc.querySelector('#cv-fiche-club [data-action="fermer-fiche"]')); });
    }
    b.ctx.dialogConfirmer = async (texte) => { b.dialogues.push(texte); return false; };
    for (const [club, action] of [['RC BOULOGNE', 'relance-reponse'], ['RC SAINT-CLOUD', 'relance-reponse'], ['VÉLIZY', 'renvoyer-confirmation'],
      ['ISSY-LES-MOULINEAUX', 'relance-paiement'], ['ISSY-LES-MOULINEAUX', 'marquer-paye'], ['CLAMART', 'marquer-a-payer']]) {
      await ouvrirFiche(b, club, true);
      await zero(b, 'V.Z.annule.' + action + '.' + club, club + ' : « ' + action + ' » puis « Annuler »', async () => { await b.cliquer(boutonFiche(b, action)); await finGeste(b); });
    }
    b.ctx.dialogConfirmer = async (texte) => { b.dialogues.push(texte); return true; };
    await zero(b, 'V.Z.pdf', 'PDF « repas et goûters » (généré dans la page)', () => b.global('onTelechargerPdfSuiviRestauration')());
    t.vrai(b.pdfs === 1 && /120 repas et 73 goûters/.test(txt(b.id('message-suivi-clubs'))), 'V.Z.pdf.1 le PDF est produit : 120 repas et 73 goûters (9 clubs participants)',
      [b.pdfs, txt(b.id('message-suivi-clubs'))]);
  });

  /* ============================== V.A — arrivée, chargement, erreurs ============================== */
  console.log('\nV.A — arrivée sur l\'écran : chargement, échec, lecture muette, relecture');
  await essai('V.A1', async () => {
    const a = await preparer({ sansArrivee: true });
    let pendant = null;
    const r = await a.jouer(() => a.global('ouvrirEtapeAdmin')('suivi-clubs'), async (n) => { if (n === 0) pendant = txt(a.id('liste-suivi-clubs')); });
    t.vrai(r.requetes.length === 1 && /Chargement du suivi/.test(pendant) && !/Connecte-toi/.test(pendant),
      'V.A1 première arrivée : UNE lecture, et « Chargement du suivi des clubs… » pendant qu\'elle court (plus « Connecte-toi… »)', [r.resume, pendant]);
    t.vrai(a.doc.querySelectorAll('#liste-suivi-clubs .suivi-club-ligne').length === 12, 'V.A1.b puis les 12 clubs du jeu', txt(a.id('suivi-clubs-resume')));
    const retour = await a.jouer(async () => { await a.global('ouvrirEtapeAdmin')('equipes'); await a.global('ouvrirEtapeAdmin')('suivi-clubs'); });
    t.vrai(retour.requetes.length === 0, 'V.A2 retour sur l\'écran, liste déjà lue : 0 requête', retour.resume);
  });
  /** Un banc dont les pannes se posent APRÈS la préparation (la lecture d'ouverture de l'écran Inviter ne les consomme pas). */
  const avecPannes = async (o) => { const boite = {}; const a = await preparer(Object.assign({}, o, { banc: { panne: (e) => (boite.panne ? boite.panne(e) : null) } }));
    a.poserPanne = (fn) => { boite.panne = fn; }; return a; };
  for (const mode of ['http500-avant', 'reseau-avant']) {
    await essai('V.A3.' + mode, async () => {
      const a = await avecPannes({ sansArrivee: true });
      a.poserPanne(panneUnique('listerClubsInvites', mode));
      const r = await a.jouer(() => a.global('ouvrirEtapeAdmin')('suivi-clubs'));
      const liste = txt(a.id('liste-suivi-clubs'));
      t.vrai(r.requetes.length === 1 && /Impossible de charger le suivi/.test(liste) && !/Aucun club/.test(liste) && txt(a.id('suivi-clubs-resume')) === '' &&
        !!a.doc.querySelector('#liste-suivi-clubs [data-action="relire-suivi"]'),
        'V.A3 lecture en échec (' + mode + ') : l\'échec est DIT dans le Suivi, avec « Réessayer » — plus de faux « 0 réponse… Aucun club »', [r.resume, liste, txt(a.id('suivi-clubs-resume'))]);
      const relire = a.doc.querySelector('#liste-suivi-clubs [data-action="relire-suivi"]');
      const r2 = await a.jouer(async () => { await Promise.all([a.cliquer(relire), a.cliquer(relire)]);
        for (let i = 0; i < 400 && a.global('typeof suiviRelectureEnCours !== "undefined" && suiviRelectureEnCours'); i++) { await BC.tour(); await attendre(1); } });
      t.vrai(r2.requetes.length === 1 && a.doc.querySelectorAll('#liste-suivi-clubs .suivi-club-ligne').length === 12,
        'V.A4 « Réessayer » (double clic compris) : UNE lecture, puis le tableau (' + mode + ')', r2.resume);
    });
  }
  await essai('V.A5', async () => {
    const a = await avecPannes({ sansArrivee: true });
    a.poserPanne(panneUnique('listerClubsInvites', 'silence', 2));
    const r = await a.jouer(() => a.global('ouvrirEtapeAdmin')('suivi-clubs'));
    const liste = txt(a.id('liste-suivi-clubs'));
    t.vrai(!r.bloque && r.requetes.length === 2 && /délai de 30 s dépassé/.test(liste) && !!a.doc.querySelector('[data-action="relire-suivi"]'),
      'V.A5 lecture muette deux fois : bornée (30 s + la relance unique d\'api.js), l\'écran ne reste plus pendu et dit « délai de 30 s dépassé »',
      [r.bloque, r.resume, liste]);
    const c = await avecPannes({ sansArrivee: true });
    c.poserPanne(panneUnique('listerClubsInvites', 'silence', 1));
    const r2 = await c.jouer(() => c.global('ouvrirEtapeAdmin')('suivi-clubs'));
    t.vrai(!r2.bloque && r2.requetes.length === 2 && c.doc.querySelectorAll('#liste-suivi-clubs .suivi-club-ligne').length === 12,
      'V.A6 lecture muette une fois : la relance unique d\'api.js aboutit, le tableau paraît', [r2.bloque, r2.resume]);
  });
  await essai('V.A7', async () => {
    const a = await avecPannes();
    a.poserPanne(panneUnique('listerClubsInvites', 'http500-avant'));
    await a.jouer(() => a.global('rafraichirRessourceAdmin')('clubsInvites'));
    const liste = txt(a.id('liste-suivi-clubs'));
    t.vrai(/n’a pas pu être relue/.test(liste) && a.doc.querySelectorAll('#liste-suivi-clubs .suivi-club-ligne').length === 12 &&
      /9Participants/.test(txt(a.id('suivi-clubs-resume')).replace(/\s/g, '')),
      'V.A7 relecture en échec après une lecture réussie : le tableau garde le dernier état connu, et l\'écran le signale', liste.slice(0, 160));
  });

  /* ============================== V.B — boutons occupés, double clic ============================== */
  console.log('\nV.B — boutons de tête de la fiche occupés pendant l\'écriture ; double clic');
  for (const [action, occupe] of [['marquer-paye', 'Enregistrement…'], ['relance-paiement', 'Envoi…']]) {
    await essai('V.B.' + action, async () => {
      const g = await preparer();
      await ouvrirFiche(g, 'ISSY-LES-MOULINEAUX');
      let pendant = null;
      const r = await g.jouer(async () => {
        const bt = boutonFiche(g, action, '.cv-fiche-actions');
        const p1 = g.cliquer(bt); const p2 = g.cliquer(bt); await Promise.all([p1, p2]); await finGeste(g);
      }, async (n) => {
        if (n !== 0) return;
        const x = boutonFiche(g, action, '.cv-fiche-actions');
        pendant = x && { inactif: !!x.disabled, occupe: x.getAttribute('aria-busy') === 'true', texte: txt(x) };
        if (x) await g.cliquer(x);                                              // troisième clic, pendant l'envoi
      });
      t.vrai(!!pendant && pendant.inactif && pendant.occupe && pendant.texte === occupe,
        'V.B.1 « ' + action + ' » (tête de la fiche) : désactivé, aria-busy, « ' + occupe + ' » pendant l\'écriture', pendant);
      t.vrai(r.ecritures.length === 1, 'V.B.2 « ' + action + ' » : trois clics (double clic, puis pendant l\'envoi) → UNE écriture', r.resume);
      const apres = boutonFiche(g, 'relance-paiement', '.cv-fiche-actions');
      t.vrai(action === 'marquer-paye' ? !apres : (!!apres && !apres.disabled && txt(apres) === 'Relancer le paiement'),
        'V.B.3 après le geste : bouton libéré (ou retiré : club payé)', apres && txt(apres));
    });
  }

  /* ============================== V.F — focus ============================== */
  console.log('\nV.F — focus : gardé au repeint, rendu après la confirmation, jamais volé');
  await essai('V.F', async () => {
    const f = await preparer();
    for (const [zone, filtre] of [['suivi-clubs-filtres', 'oui'], ['suivi-clubs-resume', 'paiement'], ['suivi-clubs-filtres', 'tous']]) {
      const el = f.doc.querySelector('#' + zone + ' [data-filtre="' + filtre + '"]'); el.focus();
      await f.cliquer(el);
      t.vrai(decrire(f.doc.activeElement) === 'button[data-filtre=' + filtre + ']' && f.id(zone).contains(f.doc.activeElement),
        'V.F.1 filtre « ' + filtre + ' » (clic ou Entrée) : le focus reste sur ce filtre', decrire(f.doc.activeElement));
    }
    const ouvrir = ligne(f, 'CLAMART').querySelector('[data-action="ouvrir-fiche"]'); ouvrir.focus();
    f.global('afficherSuiviClubs()');
    t.vrai(decrire(f.doc.activeElement) === 'button[data-action=ouvrir-fiche][data-club=CLAMART]', 'V.F.2 repeint venu d\'ailleurs, focus dans le tableau : gardé', decrire(f.doc.activeElement));
    await ouvrirFiche(f, 'VÉLIZY', true);
    boutonFiche(f, 'renvoyer-confirmation').focus();
    f.global('afficherSuiviClubs()');
    t.vrai(decrire(f.doc.activeElement) === 'button[data-action=renvoyer-confirmation][data-club=VÉLIZY]', 'V.F.3 repeint, focus dans la fiche : gardé', decrire(f.doc.activeElement));
    // La confirmation (dialog.js, commune) prend le focus et le laisse tomber sur la page en se fermant.
    f.ctx.dialogConfirmer = async (texte) => { f.dialogues.push(texte); f.doc.activeElement = null; return true; };
    await ouvrirFiche(f, 'ISSY-LES-MOULINEAUX');
    const relance = boutonFiche(f, 'relance-paiement', '.cv-fiche-actions'); relance.focus();
    let pendant = null;
    await f.jouer(async () => { await f.cliquer(relance); await finGeste(f); }, async (n) => { if (n === 0) pendant = decrire(f.doc.activeElement); });
    await BC.tour();
    t.vrai(pendant === '#cv-fiche-nom' && decrire(f.doc.activeElement) === 'button[data-action=relance-paiement][data-club=ISSY-LES-MOULINEAUX]',
      'V.F.4 « Relancer le paiement » : pendant l\'envoi (bouton occupé) le focus est sur le titre de la fiche, puis revient au bouton', [pendant, decrire(f.doc.activeElement)]);
    const paye = boutonFiche(f, 'marquer-paye', '.cv-fiche-actions'); paye.focus();
    await f.jouer(async () => { await f.cliquer(paye); await finGeste(f); });
    await BC.tour();
    t.vrai(decrire(f.doc.activeElement) === '#cv-fiche-nom', 'V.F.5 « Marquer payé » : le bouton disparaît (club payé) → focus sur le titre de la fiche', decrire(f.doc.activeElement));
    // Jamais volé : pendant l'envoi, l'organisateur tape dans la recherche ; la fin du geste ne lui reprend pas le focus.
    await ouvrirFiche(f, 'VÉLIZY', true);
    const conf = boutonFiche(f, 'renvoyer-confirmation'); conf.focus();
    await f.jouer(async () => { await f.cliquer(conf); await finGeste(f); }, async (n) => { if (n === 0) f.id('cv-recherche-liste-suivi-clubs').focus(); });
    await BC.tour();
    t.vrai(decrire(f.doc.activeElement) === '#cv-recherche-liste-suivi-clubs', 'V.F.6 focus posé ailleurs pendant l\'envoi (recherche) : jamais repris', decrire(f.doc.activeElement));
  });

  /* ============================== V.C — liste remplacée pendant un geste ============================== */
  console.log('\nV.C — liste des clubs remplacée pendant un geste : l\'écran suit le serveur');
  const remplacerPendant = async (g) => {                    // la réponse d'un autre geste, lue sous son verrou AVANT notre écriture
    const liste = g.srv.clubs();
    await g.global('appliquerRessourceAdmin')('clubsInvites', () => { g.global('clubsInvitesCourants = ' + json(liste)); g.global('afficherSuiviClubs()'); });
  };
  const cas = [
    ['V.C1', 'Marquer payé', 'ISSY-LES-MOULINEAUX', 'marquer-paye', '.cv-fiche-actions', (m) => m.paiement_statut, false],
    ['V.C2', 'Relancer le paiement', 'ISSY-LES-MOULINEAUX', 'relance-paiement', '.cv-fiche-actions', (m) => m.derniere_relance_paiement, false],
    ['V.C3', 'Renvoyer la confirmation', 'VÉLIZY', 'renvoyer-confirmation', '', (m) => m.confirmation_reponse_envoyee, true],
    ['V.C4', 'Envoyer l\'invitation (depuis le Suivi)', 'RC SAINT-CLOUD', 'relance-reponse', '', (m) => m.derniere_relance_reponse + '|' + (m.invitation_envoyee ? 'invité' : ''), true]
  ];
  for (const [code, libelle, club, action, zone, champ, deplier] of cas) {
    await essai(code, async () => {
      const g = await preparer();
      await ouvrirFiche(g, club, deplier);
      await g.jouer(async () => { await g.cliquer(boutonFiche(g, action, zone)); await finGeste(g); }, async (n) => { if (n === 0) await remplacerPendant(g); });
      const srv = clubServeur(g, club);
      const attendu = code === 'V.C4' ? srv.derniere_relance_reponse + '|invité' : champ(srv);
      t.vrai(champ(clubMemoire(g, club)) === attendu && !!attendu && !/\|$/.test(attendu),
        code + ' ' + libelle + ' (' + club + ') : liste remplacée pendant l\'envoi — l\'écran montre le résultat du serveur', [champ(clubMemoire(g, club)), attendu]);
    });
  }
  await essai('V.C5', async () => {
    const g = await preparer();
    await ouvrirFiche(g, 'ISSY-LES-MOULINEAUX');
    const r = await g.jouer(async () => { await g.cliquer(boutonFiche(g, 'marquer-paye', '.cv-fiche-actions')); await finGeste(g); }, async (n) => {
      if (n !== 0) return;
      // « Rafraîchir » : sa lecture s'exécute au serveur AVANT l'écriture (état d'avant), sa réponse arrive APRÈS.
      g.remplacer = { listerClubsInvites: g.srv.postMesure({ action: 'listerClubsInvites', cle: B.MI.CLE_ADMIN }) };
      g.global('rafraichirRessourceAdmin')('clubsInvites');
      await BC.tour();
    });
    const cellules = ligne(g, 'ISSY-LES-MOULINEAUX').querySelectorAll('[role="cell"]').map(txt);
    t.vrai(clubMemoire(g, 'ISSY-LES-MOULINEAUX').paiement_statut === 'Payé' && cellules[5] === 'Payé' && clubServeur(g, 'ISSY-LES-MOULINEAUX').paiement_statut === 'Payé',
      'V.C5 relecture exécutée avant « Marquer payé », réponse arrivée après : le paiement reste affiché « Payé » (reposé après elle)', [r.resume, cellules]);
  });

  /* ============================== V.R — non-régression des e-mails déjà acquis ============================== */
  console.log('\nV.R — e-mails du Suivi (acquis du lot « Inviter un club ») : une requête, un e-mail, aucun sous le verrou');
  const courriels = (r) => r.requetes.reduce((n, q) => n + ((q.mesure && q.mesure.appels) || []).filter((a) => a.service === 'MailApp').length, 0);
  const sousVerrou = (r) => r.requetes.reduce((n, q) => n + ((q.mesure && q.mesure.appels) || []).filter((a) => a.service === 'MailApp' && a.sousVerrou).length, 0);
  for (const [code, club, action, zone, deplier, attendue] of [['V.R1', 'ISSY-LES-MOULINEAUX', 'relance-paiement', '.cv-fiche-actions', false, 'relancerPaiementClub'],
    ['V.R2', 'VÉLIZY', 'renvoyer-confirmation', '', true, 'renvoyerConfirmationReponseClub'], ['V.R3', 'RC BOULOGNE', 'relance-reponse', '', true, 'envoyerInvitationClub']]) {
    await essai(code, async () => {
      const g = await preparer();
      await ouvrirFiche(g, club, deplier);
      const r = await g.jouer(async () => { await g.cliquer(boutonFiche(g, action, zone)); await finGeste(g); });
      t.vrai(r.resume === attendue && courriels(r) === 1 && sousVerrou(r) === 0 && g.srv.courriels.length === 1 && /✅/.test(txt(g.id('message-suivi-clubs'))),
        code + ' ' + action + ' (' + club + ') : une requête, un e-mail, aucun sous le verrou', [r.resume, courriels(r), sousVerrou(r), txt(g.id('message-suivi-clubs'))]);
    });
  }
  await essai('V.R4', async () => {
    const g = await avecPannes();
    g.poserPanne(panneUnique('relancerPaiementClub', 'http404-apres'));
    await ouvrirFiche(g, 'ISSY-LES-MOULINEAUX');
    const r1 = await g.jouer(async () => { await g.cliquer(boutonFiche(g, 'relance-paiement', '.cv-fiche-actions')); await finGeste(g); });
    const r2 = await g.jouer(async () => { await g.cliquer(boutonFiche(g, 'relance-paiement', '.cv-fiche-actions')); await finGeste(g); });
    t.vrai(/relancerPaiementClub\[http404-apres\]/.test(r1.resume) && r2.resume === 'relancerPaiementClub' && g.srv.courriels.length === 1 &&
      /déjà partie/.test(txt(g.id('message-suivi-clubs'))),
      'V.R4 relance de paiement, réponse perdue puis même geste : « déjà partie », UN seul e-mail au total', [r1.resume, r2.resume, g.srv.courriels.length, txt(g.id('message-suivi-clubs'))]);
  });
  await essai('V.R5', async () => {
    const g = await preparer();
    await ouvrirFiche(g, 'ANTONY', true);
    const r = await g.jouer(async () => {
      await g.cliquer(boutonFiche(g, 'envoyer-dossier'));
      for (let i = 0; i < 50 && !g.doc.querySelector('.eml-overlay'); i++) await BC.tour();
      await g.cliquer(g.doc.querySelector('.eml-overlay #eml-envoyer'));
      await finGeste(g);
    });
    t.vrai(r.resume === 'envoyerDossierEmail' && courriels(r) === 1 && sousVerrou(r) === 0 && !!clubMemoire(g, 'ANTONY').dossier_envoye,
      'V.R5 dossier final (ANTONY) : une requête, un e-mail, aucun sous le verrou, « Dossier envoyé » affiché', [r.resume, courriels(r), clubMemoire(g, 'ANTONY').dossier_envoye]);
  });

  /* ============================== V.I — première invitation ou vraie relance : les mots justes ============================== */
  console.log('\nV.I — « Envoyer l’invitation » (jamais invité) ou « Relancer la réponse » : textes justes, requête inchangée, deux consommateurs');
  /** Un banc dont les confirmations sont relevées avec leur bouton (« Envoyer » / « Relancer »). */
  const avecDialogues = async (o) => {
    const g = await avecPannes(o);
    g.dlg = [];
    g.reponses = [];                                                  // réponses aux confirmations, dans l'ordre (défaut : oui)
    g.ctx.dialogConfirmer = async (texte, opts) => { g.dlg.push({ texte: String(texte), ok: opts && opts.ok });
      return g.reponses.length ? g.reponses.shift() : true; };
    return g;
  };
  /* Ce que le serveur a enregistré pour ce club, et la marque de son registre d'envois (`rel` = relance). */
  const registreEnvoi = (g, club) => { let v = null;
    g.srv.proprietes.forEach((valeur, k) => { if (k === 'ENVOI_EMAIL|invitation|' + club.toLowerCase()) v = JSON.parse(valeur); });
    return v; };
  const donneesServeur = (g, club) => { const c = clubServeur(g, club); const r = registreEnvoi(g, club);
    return { invitation_envoyee: c.invitation_envoyee || '', derniere_relance_reponse: c.derniere_relance_reponse || '',
      statut: c.statut, registre: r ? { e: r.e, rel: r.rel } : null }; };
  const demande = (r) => { const q = r.requetes.filter((x) => x.action === 'envoyerInvitationClub')[0];
    if (!q) return null; const c = Object.assign({}, q.corps); const id = c.id_envoi; delete c.id_envoi; delete c.cle; return { corps: c, id: id }; };
  const cliquerSuivi = async (g, club) => { await ouvrirFiche(g, club, true); return g.jouer(async () => { await g.cliquer(boutonFiche(g, 'relance-reponse')); await finGeste(g); }); };
  const envois = (r) => r.requetes.filter((q) => q.action === 'envoyerInvitationClub');
  await essai('V.I1', async () => {
    const g = await avecDialogues();
    await ouvrirFiche(g, 'RC SAINT-CLOUD', true);
    const libelle = txt(boutonFiche(g, 'relance-reponse'));
    const r = await cliquerSuivi(g, 'RC SAINT-CLOUD');
    const d = g.dlg[0] || {}, msg = txt(g.id('message-suivi-clubs'));
    t.vrai(libelle === 'Envoyer l’invitation' && /^Envoyer l'invitation à « RC SAINT-CLOUD »/.test(d.texte) && !/[Rr]elanc/.test(d.texte) && d.ok === 'Envoyer',
      'V.I1.a Suivi, club jamais invité : bouton « Envoyer l’invitation », confirmation « Envoyer l\'invitation à … ? » (bouton « Envoyer »), jamais « Relancer »', [libelle, d]);
    t.vrai(/^✅ Invitation envoyée à demo-rc-saint-cloud@example\.invalid/.test(msg) && !/[Rr]elance/.test(msg),
      'V.I1.b … puis « ✅ Invitation envoyée à … » (plus « Relance envoyée »), sous le Suivi', msg);
    t.vrai(envois(r).length === 1 && r.requetes.length === 1 && envois(r)[0].corps.relance === 'non' && courriels(r) === 1 && sousVerrou(r) === 0 && g.srv.courriels.length === 1,
      'V.I1.c une première invitation demande `relance: non` — comme depuis « Inviter un club » ; une requête, un e-mail, aucun sous le verrou',
      [r.resume, envois(r)[0] && envois(r)[0].corps.relance, courriels(r)]);
    const srv1 = donneesServeur(g, 'RC SAINT-CLOUD');
    t.vrai(srv1.invitation_envoyee === '2026-09-15' && srv1.derniere_relance_reponse === '' && srv1.statut === 'Invité' &&
      srv1.registre && srv1.registre.e === 'fait' && srv1.registre.rel === undefined,
      'V.I1.e côté SERVEUR : invitation datée, AUCUNE date de dernière relance, registre sans marque de relance', srv1);
    t.vrai(!/Dernière relance/.test(txt(g.doc.querySelector('#cv-fiche-club'))),
      'V.I1.f l\'écran n\'affiche aucune « Dernière relance » après une première invitation', txt(g.doc.querySelector('#cv-fiche-club')).slice(0, 120));
    await ouvrirFiche(g, 'RC SAINT-CLOUD', true);
    t.vrai(txt(boutonFiche(g, 'relance-reponse')) === 'Relancer la réponse', 'V.I1.d le club est désormais invité : le bouton devient « Relancer la réponse »', txt(boutonFiche(g, 'relance-reponse')));
  });
  await essai('V.I2', async () => {
    const g = await avecDialogues();
    const r = await cliquerSuivi(g, 'RC BOULOGNE');
    const d = g.dlg[0] || {}, msg = txt(g.id('message-suivi-clubs'));
    t.vrai(/^Relancer « RC BOULOGNE » sur sa réponse/.test(d.texte) && d.ok === 'Relancer' && /^✅ Relance envoyée à demo-rc-boulogne@example\.invalid\.$/.test(msg) &&
      envois(r).length === 1 && envois(r)[0].corps.relance === 'oui' && g.srv.courriels.length === 1,
      'V.I2 Suivi, club déjà invité : vraie relance — « Relancer … sur sa réponse ? » (bouton « Relancer »), « ✅ Relance envoyée », `relance: oui`, un e-mail', [d, msg, r.resume]);
    const srv = donneesServeur(g, 'RC BOULOGNE');
    t.vrai(srv.derniere_relance_reponse === '2026-09-15' && srv.invitation_envoyee === '2026-09-15' && srv.registre && srv.registre.rel === 1,
      'V.I2.b côté SERVEUR : la vraie relance date bien sa « dernière relance » et marque son registre (comportement historique)', srv);
    await ouvrirFiche(g, 'RC BOULOGNE', true);
    t.vrai(/Dernière relance : 15\/09\/2026/.test(txt(g.doc.querySelector('#cv-fiche-club'))), 'V.I2.c … et l\'écran l\'affiche', txt(g.doc.querySelector('#cv-fiche-club')).slice(0, 160));
  });
  await essai('V.I3', async () => {
    const g = await avecDialogues();
    await ouvrirFiche(g, 'RC SAINT-CLOUD', true);
    const bt = boutonFiche(g, 'relance-reponse');
    const r = await g.jouer(async () => { await Promise.all([g.cliquer(bt), g.cliquer(bt)]); await finGeste(g); });
    t.vrai(g.dlg.length === 1 && envois(r).length === 1 && g.srv.courriels.length === 1 && /Invitation envoyée/.test(txt(g.id('message-suivi-clubs'))),
      'V.I3 première invitation, double clic : une confirmation, une requête, un e-mail', [g.dlg.length, r.resume, g.srv.courriels.length]);
  });
  await essai('V.I4', async () => {
    const g = await avecDialogues();
    g.poserPanne(panneUnique('envoyerInvitationClub', 'http404-apres'));
    const r1 = await cliquerSuivi(g, 'RC SAINT-CLOUD');
    const m1 = txt(g.id('message-suivi-clubs'));
    await ouvrirFiche(g, 'RC SAINT-CLOUD', true);
    const relu = { invite: !!clubMemoire(g, 'RC SAINT-CLOUD').invitation_envoyee, bouton: txt(boutonFiche(g, 'relance-reponse')) };
    const r2 = await cliquerSuivi(g, 'RC SAINT-CLOUD');
    const d2 = g.dlg[1] || {}, m2 = txt(g.id('message-suivi-clubs'));
    t.vrai(/non reçue/.test(m1) && relu.invite && relu.bouton === 'Relancer la réponse' && /^Envoyer l'invitation à « RC SAINT-CLOUD »/.test(d2.texte) && /pas été confirmé/.test(d2.texte) && d2.ok === 'Envoyer' &&
      /^✅ Invitation déjà partie vers/.test(m2) && /rien n’a été renvoyé/.test(m2) && g.srv.courriels.length === 1 &&
      envois(r2).length === 1 && envois(r2)[0].corps.id_envoi === envois(r1)[0].corps.id_envoi &&
      envois(r1)[0].corps.relance === 'non' && envois(r2)[0].corps.relance === 'non' &&
      donneesServeur(g, 'RC SAINT-CLOUD').derniere_relance_reponse === '',
      'V.I4 première invitation, réponse perdue (404) puis même geste : même identifiant, même demande `relance: non`, « déjà partie », UN seul e-mail, aucune date de relance au serveur',
      [m1.slice(0, 90), relu, d2, m2, g.srv.courriels.length, r1.resume, r2.resume]);
  });
  await essai('V.I5', async () => {
    const g = await avecDialogues();
    g.poserPanne(panneUnique('envoyerInvitationClub', 'reseau-avant'));
    await cliquerSuivi(g, 'RC SAINT-CLOUD');
    const r2 = await cliquerSuivi(g, 'RC SAINT-CLOUD');
    const m2 = txt(g.id('message-suivi-clubs'));
    t.vrai(/^✅ Invitation envoyée à/.test(m2) && g.srv.courriels.length === 1 && envois(r2).length === 1 && !envois(r2)[0].reponse.rejeu,
      'V.I5 première invitation, réseau coupé avant l\'envoi puis même geste : l\'invitation part une fois, « Invitation envoyée »', [m2, g.srv.courriels.length]);
  });
  await essai('V.I6', async () => {
    const g = await avecDialogues();
    const ligneInviter = B.clubLigne(g, 'RC SAINT-CLOUD');
    const r = await g.jouer(async () => { await B.clic(g, ligneInviter.querySelector('.bouton-inviter-club')); await finGeste(g); });
    const d = g.dlg[0] || {}, msg = txt(g.id('message-club-invite'));
    t.vrai(/^Envoyer l'invitation à « RC SAINT-CLOUD »/.test(d.texte) && d.ok === 'Envoyer' && /^✅ Invitation envoyée à/.test(msg) &&
      envois(r).length === 1 && envois(r)[0].corps.relance === 'non' && g.srv.courriels.length === 1,
      'V.I6 « Inviter un club » (ligne du club) : inchangé — « Envoyer l\'invitation à … ? », « ✅ Invitation envoyée », requête `relance: non`, un e-mail', [d, msg, r.resume]);
    const r2 = await g.jouer(() => g.global('envoyerInvitationClubUI')('RC BOULOGNE'));
    t.vrai(r2.requetes.length === 0 && /Invitation déjà envoyée\. Pour une relance, utilise « Suivi des clubs »/.test(txt(g.id('message-club-invite'))),
      'V.I7 « Inviter un club », club déjà invité : inchangé — aucun envoi, renvoi vers le Suivi pour une relance', txt(g.id('message-club-invite')));
  });

  await essai('V.I8', async () => {                                     // la MÊME demande depuis les deux écrans
    const a = await avecDialogues();
    const rA = await a.jouer(async () => { await B.clic(a, B.clubLigne(a, 'RC SAINT-CLOUD').querySelector('.bouton-inviter-club')); await finGeste(a); });
    const g = await avecDialogues();
    const rG = await cliquerSuivi(g, 'RC SAINT-CLOUD');
    const dA = demande(rA), dG = demande(rG);
    t.vrai(dA && dG && json(dA.corps) === json(dG.corps) && dA.id !== dG.id && dA.corps.relance === 'non',
      'V.I8 première invitation : la demande envoyée est la MÊME depuis « Inviter un club » et depuis « Suivi des clubs » (hors identifiant d\'envoi)',
      [dA && dA.corps, dG && dG.corps]);
    t.vrai(json(donneesServeur(a, 'RC SAINT-CLOUD')) === json(donneesServeur(g, 'RC SAINT-CLOUD')),
      'V.I8.b … et le serveur enregistre exactement la même chose dans les deux cas', [donneesServeur(a, 'RC SAINT-CLOUD'), donneesServeur(g, 'RC SAINT-CLOUD')]);
  });
  await essai('V.I9', async () => {                                     // le message du SERVEUR parle d'invitation
    const g = await avecDialogues();
    await cliquerSuivi(g, 'RC SAINT-CLOUD');
    g.reponses = [true, false];                                         // la confirmation de l'écran : oui ; « Envoyer quand même ? » : non
    const r2 = await cliquerSuivi(g, 'RC SAINT-CLOUD');
    const refus = (g.dlg[g.dlg.length - 1] || {}).texte || '';
    const q = envois(r2)[0];
    t.vrai(q && q.reponse.code === 'envoi_recent' && /L’invitation est déjà partie/.test(refus) && !/relance/i.test(refus) &&
      g.srv.courriels.length === 1 && /Renvoi annulé/.test(txt(g.id('message-suivi-clubs'))),
      'V.I9 second geste dans les 5 min : le refus du SERVEUR parle de « L’invitation … déjà partie » (plus « la relance ») ; annulé → un seul e-mail',
      [refus.slice(0, 120), txt(g.id('message-suivi-clubs'))]);
  });
  await essai('V.I10', async () => {                                    // ancien frontend / nouveau frontend, même backend figé
    const ancien = await B.banc({ lire: LECTEUR_AVANT, backend: CODE, documentReel: true,
      monde: (m) => { m.postMesure({ action: 'creerJeuDemoRacing', cle: B.MI.CLE_ADMIN }); peuplerClubsScenarioSuivi(m); } });
    ancien.global('configCourante = ' + json(ancien.srv.config()));
    ancien.global('equipesCourantes = ' + json(ancien.srv.equipes()));
    ancien.ctx.dialogConfirmer = async () => true;
    await ancien.jouer(() => ancien.global('chargerClubsInvites')());
    const rA = await ancien.jouer(async () => { await ancien.global('envoyerInvitationClubUI')('RC SAINT-CLOUD', { relance: true }); });
    const qA = rA.requetes.filter((x) => x.action === 'envoyerInvitationClub')[0];
    const dA = donneesServeur(ancien, 'RC SAINT-CLOUD');
    const g = await avecDialogues();
    await cliquerSuivi(g, 'RC SAINT-CLOUD');
    const dN = donneesServeur(g, 'RC SAINT-CLOUD');
    t.vrai(qA && qA.corps.relance === 'oui' && dA.derniere_relance_reponse === '2026-09-15' && dA.registre.rel === 1 &&
      dN.derniere_relance_reponse === '' && dN.registre.rel === undefined && dA.invitation_envoyee === dN.invitation_envoyee,
      'V.I10 sur le MÊME backend figé : l\'ancien frontend (b8c638bd…) notait une fausse « dernière relance » (`relance: oui`), le nouveau non — l\'invitation est datée dans les deux cas',
      { ancien: dA, nouveau: dN, demandeAncienne: qA && qA.corps.relance });
  });

  /* ============================== V.X — cohérence du jeu ============================== */
  console.log('\nV.X — cohérence : jeu de démonstration, Suivi, Équipes, autorisation');
  await essai('V.X', async () => {
    const propre = await preparer({ sansExtras: true });
    const clubs = propre.global('clubsInvitesCourants');
    const statut = (n) => (clubs.filter((c) => c.club_nom === n)[0] || {}).statut;
    const acceptes = clubs.filter((c) => propre.global('estAccepte')(c.statut));
    const eq = propre.srv.equipes();
    const somme = (l, j, e) => l.reduce((s, x) => ({ j: s.j + Number(x[j] || 0), e: s.e + Number(x[e] || 0) }), { j: 0, e: 0 });
    t.vrai(clubs.length === 9 && acceptes.length === 9 && !clubs.some((c) => /RACING 92|RC BOULOGNE|RC SAINT[ -]CLOUD|RC PUTEAUX|CHATENAY/.test(c.club_nom)),
      'V.X1 Suivi : exactement 9 clubs participants ; organisateur et clubs exclus absents',
      clubs.map((c) => c.club_nom + ':' + c.statut));
    const tout = somme(eq, 'nb_joueurs', 'nb_educateurs');
    const invites = somme(eq.filter((e) => !/^RACING 92/.test(e.nom_equipe)), 'nb_joueurs', 'nb_educateurs');
    const declares = somme(acceptes, 'nb_joueurs_total', 'nb_educateurs_total');
    t.vrai(eq.length === 21 && tout.j === 327 && tout.e === 34 && json(invites) === json(declares) && declares.j === 262 && declares.e === 28,
      'V.X2 Équipes : 21 équipes, 327 joueurs, 34 éducateurs ; les 9 participants du Suivi déclarent exactement leurs équipes (262 / 28, RACING 92 à part)',
      { equipes: eq.length, tout, invites, declares });
    t.vrai(/0Réponsesattendues9Participants0Neparticipentpas7Paiementsattendus/.test(txt(propre.id('suivi-clubs-resume')).replace(/\s/g, '')),
      'V.X3 compteurs du Suivi : 0 réponse attendue, 9 participants, 0 ne participe pas, 7 paiements attendus', txt(propre.id('suivi-clubs-resume')));
    const aut = propre.srv.appeler('getDossierAutorisation', propre.srv.classeur);
    const champs = {};
    ((aut && aut.dossier && aut.dossier.sections) || []).forEach((s) => (s.champs || []).forEach((c) => { champs[String(c.libelle).replace(/’/g, '\'')] = String(c.valeur); }));
    t.vrai(champs['Nombre de clubs'] === '9' && champs['Nombre d\'équipes (minimum 3)'] === '21' && champs['Nombre de participants'] === '327' &&
      champs['Nombre d\'éducateurs'] === '34',
      'V.X4 demande d\'autorisation : 9 clubs, 21 équipes, 327 participants, 34 éducateurs', champs);
    const gen = propre.srv.postMesure({ action: 'genererPoulesEtPlanning', cle: B.MI.CLE_ADMIN }).reponse;
    const poules = propre.srv.appeler('lireOngletSimple', propre.srv.classeur, 'Poules').length;
    const matchs = propre.srv.appeler('lireOngletSimple', propre.srv.classeur, 'Matchs').length;
    t.vrai(!gen.error && poules === 4 && matchs === 45, 'V.X5 génération sur le jeu : 4 poules, 45 matchs', { gen: gen.error || 'ok', poules, matchs });
  });

  console.log('\n' + (process.exitCode ? 'ÉCHEC' : 'OK — ' + t.n + ' contrôles de l\'écran « Suivi des clubs » passés.'));
})().catch((e) => { console.error(e); process.exitCode = 1; });
