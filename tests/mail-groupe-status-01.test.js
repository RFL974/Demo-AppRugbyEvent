'use strict';

/**
 * ============================================================================
 *  GARDE-FOU — MAIL-GROUPE-STATUS-01 (frontend) : un envoi GROUPÉ dont la réponse se perd est VÉRIFIÉ, jamais renvoyé
 * ============================================================================
 *  ▶ node tests/mail-groupe-status-01.test.js [--frontend avant|<dossier>] [--backend avant|<Code.gs>]
 *    `avant` = références FIGÉES d'avant le lot, jamais HEAD : frontend 06f7f12107dc6f7c293613a22aebd0530867aa00 (lu dans
 *    git), backend = production V22 (archives/deploiements/backend/v22/Code.gs).
 *
 *  Vrais modules du frontend (banc-ecran-invitation.js) contre le vrai Code.gs ; seul `fetch` est simulé, minuteries ×1/1000.
 *  Trois clubs invitables (A, D, E), un accepté (B), un décliné (C).
 *    A — périmètre : js/api.js et les pages publiques restent octet pour octet ceux de la référence ; l'appel groupé garde
 *        `renvoyer: 'non'` et sa garde de double clic ;
 *    V — la vérification après une issue incertaine : succès normal sans lecture ; 404 après l'envoi → UNE lecture groupée
 *        (même identifiant, clubs visés) → « ✅ Envoi groupé confirmé : 3/3 » ; échec partiel → « ⚠️ Envoi partiel », le
 *        club non confirmé NOMMÉ ; en cours → trois lectures au plus (~4 s, ~12 s, ~27 s), « Traitement encore en cours » ;
 *        réponse jamais reçue → « Aucun envoi confirmé » ; réservations mortes → « ❌ Aucun envoi parti » ; jamais de second
 *        POST groupé ; refus lisible → aucune lecture ; backend d'avant → message et relecture historiques ;
 *    C — le clic suivant VÉRIFIE d'abord : précédent tranché → dit, rien n'est envoyé, puis le clic d'après n'écrit qu'aux
 *        restants (nouvel identifiant) ; précédent en cours → rien n'est envoyé ; précédent introuvable → confirmation qui
 *        prévient, MÊME identifiant ; double clic (et clic pendant la vérification) bloqués ;
 *    S — la reprise après rechargement (sessionStorage) : identifiant, clubs visés et instant gardés 30 min — ni clé, ni
 *        adresse, ni contenu ; vérifiés au clic suivant ; entrée périmée ou malformée jetée ; effacés une fois tranchés ;
 *    D — le diagnostic discret du geste groupé : durée, statut HTTP, identifiant, nombre de clubs, vérifications — jamais la
 *        clé, les adresses, les noms ni le contenu.
 *  Contre-épreuves (constatées) : `--frontend avant` fait tomber V.2–V.6, C.1–C.5, S.1–S.4, D.1–D.2 et garde A, V.1 (chemin
 *  normal), V.7 (refus lisible), V.8 (repli historique) et D.3 ; `--backend avant` (V22, sans getSendGroupStatus) fait tomber
 *  V.2–V.6, C.1–C.3, S.3 et D.2 et garde A, V.1, V.7, V.8, C.4 (repli sûr : confirmation qui prévient, même identifiant),
 *  C.5, S.1, S.2, S.4, D.1 et D.3.
 *  ⛔ Aucun réseau, aucun service Google réel.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const B = require('./banc-ecran-invitation');
const BC = require('./banc-ecran-categories');

const FRONTEND_AVANT_REV = '06f7f12107dc6f7c293613a22aebd0530867aa00';
const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
const LECTEUR_AVANT = (f) => B.git(B.RACINE, FRONTEND_AVANT_REV, f);
const LIRE = arg('frontend') === 'avant' ? LECTEUR_AVANT : arg('frontend') ? B.lecteur(path.resolve(arg('frontend'))) : B.lecteur();
const V22 = path.join(B.BACKEND, 'archives', 'deploiements', 'backend', 'v22', 'Code.gs');
const CODE = fs.readFileSync(arg('backend') === 'avant' ? V22 : arg('backend') ? path.resolve(arg('backend')) : path.join(B.BACKEND, 'Code.gs'), 'utf8');

const t = BC.compteur();
const json = JSON.stringify;
const CLE_GESTE = 'groupe|invitations';
const STOCKAGE = 'r92_envoi_groupe_incertain';
const VISES = ['CLUB FICTIF A', 'CLUB FICTIF D', 'CLUB FICTIF E'];
const REGISTRE = (nom) => 'ENVOI_EMAIL|invitation|' + nom.toLowerCase();
/** Trois clubs invitables (A, D, E), un accepté (B), un décliné (C) ; `panne` : destinataires dont MailApp échoue. */
const monde = (panne) => (m) => {
  B.MI.amorcerClubs(m);
  ['D', 'E'].forEach((x) => m.appeler('ajouterClubInvite', m.classeur, { club_nom: 'CLUB FICTIF ' + x, club_contact_nom: 'CONTACT',
    club_contact_prenom: x, club_contact_email: 'club-' + x.toLowerCase() + '@example.invalid' }));
  if (panne) {
    const envoi = m.contexte.__banc_courriel;
    m.contexte.__banc_courriel = (d, s) => { if (panne.indexOf(d) !== -1) throw new Error('boîte pleine (fictif)'); return envoi(d, s); };
  }
};
const banc = (o) => B.banc(Object.assign({ lire: LIRE, backend: CODE, monde: monde() }, o || {}));
const essai = async (code, fn) => { try { await fn(); } catch (e) { t.vrai(false, code + ' (exception) ' + String(e && e.stack || e).slice(0, 400)); } };
const de = (r, action) => r.requetes.filter((q) => q.action === action);
const groupe = (b) => b.global('onEnvoyerInvitationsGroupe')();
const message = (b) => b.texte('message-invitations') || '';
/** Première émission de `action` : `mode` ; `puis` (optionnel) : la panne de toutes les autres requêtes. */
const premiere = (action, mode, puis) => { let n = 0; return (e) => (e.action === action && ++n === 1 ? mode : puis ? puis(e) : null); };
/* `clubs` : null sur un frontend d'avant ce lot (la variable n'existe pas) — les contre-épreuves restent lisibles. */
const etatGeste = (b) => ({ incertain: b.global('envoisIncertains').has(CLE_GESTE), id: b.global('idsEnvois').has(CLE_GESTE),
  clubs: b.global('typeof clubsEnvoiGroupeIncertain === "undefined" ? null : clubsEnvoiGroupeIncertain.slice()') });
const diagnostics = (b) => { try { return JSON.parse(JSON.stringify(b.global('diagnosticsEnvois'))); } catch (e) { return null; } };
const bouton = (b) => b.id('bouton-envoyer-invitations');
/** Pose, pour chaque club visé, une entrée du registre au nom du geste lu (`corps.id_envoi`). */
const poserPour = (etat, ageMs) => (e, srv) => {
  if (e.action !== 'getSendGroupStatus') return;
  const r = Date.now() - (ageMs || 0);
  VISES.forEach((nom) => srv.proprietes.set(REGISTRE(nom), JSON.stringify({ e: etat, id: e.corps.id_envoi, r, t: r })));
};

(async () => {
  /* ============================== A — périmètre ============================== */
  console.log('\nA — périmètre : le transport partagé, les pages publiques et le contrat de l\'appel groupé ne bougent pas');
  await essai('A', async () => {
    const identiques = ['js/api.js', 'index.html', 'tournoi.html', 'perfs.html'].map((f) => [f, LIRE(f) === LECTEUR_AVANT(f)]);
    t.vrai(identiques.every((x) => x[1]), 'A.1 js/api.js, index.html, tournoi.html et perfs.html : octet pour octet ceux de la référence ' +
      FRONTEND_AVANT_REV.slice(0, 7) + ' (aucun rayon d\'impact public)', identiques.filter((x) => !x[1]));
    const module = LIRE('js/admin-invitations.js');
    const appels = module.match(/ecrireEnvoiEmail\('envoyerInvitationsGroupe'[\s\S]{0,400}?\}\s*,\s*ETAT_DANS_LA_REPONSE\)/g) || [];
    t.vrai(appels.length === 1 && /renvoyer: 'non'/.test(appels[0]) && !/renvoyer:\s*'oui'/.test(module) &&
      /if \(envoisEnCours\.has\(cle\) \|\| \(bouton && bouton\.disabled\)\) return;/.test(module),
    'A.2 UN seul appel groupé, `renvoyer: \'non\'` en dur, aucun `renvoyer: \'oui\'`, garde du double clic intacte', appels);
  });

  /* ============================== V — la vérification après une issue incertaine ============================== */
  console.log('\nV — issue incertaine : vérifier (même identifiant, clubs visés, lecture seule), jamais renvoyer');
  await essai('V.1', async () => {
    const b = await banc();
    const r = await b.jouer(() => groupe(b));
    const q = de(r, 'envoyerInvitationsGroupe');
    t.vrai(r.requetes.length === 1 && q.length === 1 && q[0].corps.renvoyer === 'non' && de(r, 'getSendGroupStatus').length === 0 &&
      /^✅ 3 invitation\(s\) envoyée\(s\)\.$/.test(message(b)) && b.srv.courrielsEnvoyes() === 3 && !etatGeste(b).incertain && !etatGeste(b).id,
    'V.1 succès HTTP normal : UNE requête, AUCUNE lecture d\'état, message historique « ✅ 3 invitation(s) envoyée(s). » (chemin normal inchangé)',
    [r.resume, message(b)]);
  });
  await essai('V.2', async () => {
    const stockage = new Map();
    let pendant = null;
    const b = await banc({ stockageSession: stockage, panne: premiere('envoyerInvitationsGroupe', 'http404-apres') });
    const r = await b.jouer(() => groupe(b), (n) => {
      if (n === 1) pendant = { stocke: stockage.get(STOCKAGE) || null, etat: etatGeste(b), bouton: bouton(b).textContent, occupe: bouton(b).disabled };
    });
    const envoi = de(r, 'envoyerInvitationsGroupe'), lectures = de(r, 'getSendGroupStatus');
    const id = envoi[0] && envoi[0].corps.id_envoi;
    t.vrai(envoi.length === 1 && lectures.length === 1 && lectures[0].corps.id_envoi === id && json(lectures[0].corps.clubs) === json(VISES) &&
      lectures[0].reponse.termine === true && b.srv.courrielsEnvoyes() === 3 &&
      /^✅ Envoi groupé confirmé : 3\/3 \(réponse du serveur non reçue — Le serveur a répondu avec une erreur \(404\) ; vérifié auprès du serveur, rien n’a été renvoyé\)\.$/.test(message(b)) &&
      json(r.requetes.map((q) => q.action)) === json(['envoyerInvitationsGroupe', 'getSendGroupStatus', 'listerClubsInvites']),
    'V.2 réponse perdue (404 après l\'envoi) : UNE lecture groupée (même identifiant, les 3 clubs visés) → « ✅ Envoi groupé confirmé : 3/3 », ' +
      'UN POST groupé, 3 e-mails, liste relue', [r.resume, message(b)]);
    t.vrai(pendant && pendant.etat.incertain && pendant.etat.id && json(pendant.etat.clubs) === json(VISES) && pendant.occupe && /Vérification/.test(pendant.bouton) &&
      JSON.parse(pendant.stocke).id === id && !etatGeste(b).incertain && !etatGeste(b).id && !stockage.has(STOCKAGE) && !bouton(b).disabled,
    'V.2b pendant la vérification : geste incertain, identifiant et clubs gardés (mémoire ET session), bouton occupé « Vérification… » ; une fois ' +
      'tranché : marques effacées, bouton libéré', [pendant, etatGeste(b), Array.from(stockage.keys())]);
  });
  await essai('V.3', async () => {
    const b = await banc({ monde: monde(['club-d@example.invalid']), panne: premiere('envoyerInvitationsGroupe', 'http404-apres') });
    const r = await b.jouer(() => groupe(b));
    const s = de(r, 'getSendGroupStatus')[0];
    t.vrai(de(r, 'envoyerInvitationsGroupe').length === 1 && de(r, 'getSendGroupStatus').length === 1 && s.reponse.termine === true &&
      /^⚠️ Envoi partiel : 2 confirmé\(s\) sur 3 ; 1 non confirmé\(s\) — aucune trace d’envoi : CLUB FICTIF D \(réponse du serveur non reçue/.test(message(b)) &&
      /un nouvel envoi n’écrira qu’aux clubs non invités/.test(message(b)) && !/✅/.test(message(b)) && b.srv.courrielsEnvoyes() === 2 && !etatGeste(b).incertain,
    'V.3 échec partiel (MailApp refuse CLUB D) puis réponse perdue : « ⚠️ Envoi partiel : 2 confirmé(s) sur 3 », le club non confirmé NOMMÉ, jamais « échec » ' +
      'sans preuve ni « ✅ » ; geste tranché', [r.resume, message(b)]);
  });
  await essai('V.4', async () => {
    // Réponse jamais reçue (réseau) et serveur qui répond « en envoi » pour CE geste : lectures bornées, puis « en cours ».
    const b = await banc({ panne: premiere('envoyerInvitationsGroupe', 'reseau-avant'), avantServir: poserPour('envoi') });
    const r = await b.jouer(() => groupe(b));
    const envoi = de(r, 'envoyerInvitationsGroupe'), lectures = de(r, 'getSendGroupStatus');
    t.vrai(envoi.length === 1 && lectures.length === 3 && lectures.every((q) => q.corps.id_envoi === envoi[0].corps.id_envoi && q.reponse.termine === false &&
      q.reponse.en_cours.length === 3) && json(b.global('VERIFICATIONS_ENVOI_MS')) === json([4000, 12000, 27000]) &&
      /^⚠️ Traitement encore en cours : 0 confirmé\(s\) sur 3 ; 3 en cours : CLUB FICTIF A, CLUB FICTIF D, CLUB FICTIF E/.test(message(b)) &&
      /Ne relance pas l’envoi/.test(message(b)) && etatGeste(b).incertain && etatGeste(b).id && b.srv.courrielsEnvoyes() === 0,
    'V.4 en cours (réservé / en envoi) : TROIS lectures au plus (~4 s, ~12 s, ~27 s), même identifiant, AUCUN POST de plus ; « ⚠️ Traitement encore en cours », ' +
      'clubs nommés, geste gardé', [r.resume, message(b)]);
  });
  await essai('V.5', async () => {
    const b = await banc({ panne: premiere('envoyerInvitationsGroupe', 'reseau-avant') });
    const r = await b.jouer(() => groupe(b));
    t.vrai(de(r, 'envoyerInvitationsGroupe').length === 1 && de(r, 'getSendGroupStatus').length === 3 &&
      de(r, 'getSendGroupStatus').every((q) => q.reponse.geste_trouve === false) &&
      /^⚠️ Aucun envoi confirmé \(réponse du serveur non reçue — Failed to fetch ; aucune trace de ce geste au serveur\)/.test(message(b)) &&
      !/✅|❌/.test(message(b)) && b.srv.courrielsEnvoyes() === 0 && etatGeste(b).incertain && etatGeste(b).id,
    'V.5 réponse jamais reçue (la demande attendait peut-être le verrou) : trois lectures, « ⚠️ Aucun envoi confirmé », AUCUN renvoi, geste gardé',
    [r.resume, message(b)]);
    const c = await banc({ monde: monde(['club-a@example.invalid', 'club-d@example.invalid', 'club-e@example.invalid']),
      panne: premiere('envoyerInvitationsGroupe', 'http404-apres') });
    const r2 = await c.jouer(() => groupe(c));
    t.vrai(de(r2, 'envoyerInvitationsGroupe').length === 1 && de(r2, 'getSendGroupStatus').length === 1 && /^⚠️ Aucun envoi confirmé/.test(message(c)) &&
      !/❌/.test(message(c)) && c.srv.courrielsEnvoyes() === 0,
    'V.5b MailApp en échec pour tous puis 404 (le serveur a fini) : UNE lecture tranche « ⚠️ Aucun envoi confirmé » — jamais « ❌ » sans preuve', [r2.resume, message(c)]);
  });
  await essai('V.6', async () => {
    const b = await banc({ panne: premiere('envoyerInvitationsGroupe', 'reseau-avant'), avantServir: poserPour('reserve', 8 * 60000) });
    const r = await b.jouer(() => groupe(b));
    t.vrai(de(r, 'getSendGroupStatus').length === 1 && /^❌ Aucun envoi parti : l’envoi groupé a été interrompu avant le départ des e-mails/.test(message(b)) &&
      !etatGeste(b).incertain && b.srv.courrielsEnvoyes() === 0,
    'V.6 réservations mortes AVANT l\'e-mail (preuve : rien n\'est parti) : « ❌ Aucun envoi parti », geste tranché', [r.resume, message(b)]);
  });
  await essai('V.7', async () => {
    const b = await banc({ panne: premiere('envoyerInvitationsGroupe', 'verrou-occupe') });
    const r = await b.jouer(() => groupe(b));
    t.vrai(de(r, 'getSendGroupStatus').length === 0 && /occup/i.test(message(b)) && !etatGeste(b).incertain && !etatGeste(b).id,
      'V.7 refus lisible du serveur (verrou occupé) : rien à vérifier, AUCUNE lecture d\'état', [r.resume, message(b)]);
  });
  await essai('V.8', async () => {
    // Backend d'avant ce lot (production V22, sans getSendGroupStatus) : repli sur le message et la relecture historiques.
    const b = await B.banc({ lire: LIRE, backend: fs.readFileSync(V22, 'utf8'), monde: monde(), panne: premiere('envoyerInvitationsGroupe', 'http404-apres') });
    const r = await b.jouer(() => groupe(b));
    t.vrai(de(r, 'envoyerInvitationsGroupe').length === 1 && de(r, 'getSendGroupStatus').length <= 1 && de(r, 'listerClubsInvites').length === 1 &&
      /non reçue/.test(message(b)) && /les envois ne sont pas confirmés/.test(message(b)) && /« Invité le … » montre qui l’a reçue/.test(message(b)) &&
      b.srv.courrielsEnvoyes() === 3 && etatGeste(b).incertain,
    'V.8 backend V22 (action inconnue) : message et relecture historiques, UN POST groupé, 3 e-mails, geste gardé', [r.resume, message(b)]);
  });

  /* ============================== C — le clic suivant vérifie d'abord ============================== */
  console.log('\nC — nouveau clic après une issue incertaine : vérifier AVANT tout envoi, jamais de renvoi massif');
  await essai('C.1', async () => {
    // Réponse perdue ET trois lectures ratées : le geste reste incertain. Au clic suivant (serveur joignable) : UNE lecture
    // d'abord → tranché (3/3) → dit, AUCUN POST, AUCUNE confirmation.
    const panneLectures = { active: true };
    const b = await banc({ panne: premiere('envoyerInvitationsGroupe', 'http404-apres', (e) => (e.action === 'getSendGroupStatus' && panneLectures.active ? 'reseau-avant' : null)) });
    const r1 = await b.jouer(() => groupe(b));
    const m1 = message(b), incertain1 = etatGeste(b).incertain;
    panneLectures.active = false;
    b.dialogues.length = 0;
    const r2 = await b.jouer(() => groupe(b));
    t.vrai(/les envois ne sont pas confirmés/.test(m1) && de(r1, 'getSendGroupStatus').length === 3 && incertain1 && !etatGeste(b).incertain &&
      de(r2, 'envoyerInvitationsGroupe').length === 0 && de(r2, 'getSendGroupStatus').length === 1 &&
      de(r2, 'getSendGroupStatus')[0].corps.id_envoi === de(r1, 'envoyerInvitationsGroupe')[0].corps.id_envoi && b.dialogues.length === 0 &&
      /^✅ Envoi groupé confirmé : 3\/3 \(envoi groupé précédent vérifié auprès du serveur : rien n’a été renvoyé\)\.$/.test(message(b)) &&
      b.srv.courrielsEnvoyes() === 3,
    'C.1 vérification impossible (3 lectures ratées) : historique, geste gardé ; au clic suivant, UNE lecture (même identifiant) → « ✅ 3/3 », AUCUN POST, ' +
      'AUCUNE confirmation, 3 e-mails', [m1.slice(0, 120), r1.resume, r2.resume, message(b)]);
  });
  await essai('C.2', async () => {
    // Précédent tranché PARTIEL : dit, rien n'est envoyé ; le clic d'après est un NOUVEAU geste qui n'écrit qu'au restant.
    const panneLectures = { active: true };
    const b = await banc({ monde: monde(['club-d@example.invalid']),
      panne: premiere('envoyerInvitationsGroupe', 'http404-apres', (e) => (e.action === 'getSendGroupStatus' && panneLectures.active ? 'reseau-avant' : null)) });
    const r1 = await b.jouer(() => groupe(b));
    panneLectures.active = false;
    const r2 = await b.jouer(() => groupe(b));
    const m2 = message(b);
    b.dialogues.length = 0;                                            // CLUB D refuse toujours : le nouveau geste le tente, lui seul
    const r3 = await b.jouer(() => groupe(b));
    const id1 = de(r1, 'envoyerInvitationsGroupe')[0].corps.id_envoi, q3 = de(r3, 'envoyerInvitationsGroupe')[0];
    t.vrai(de(r2, 'envoyerInvitationsGroupe').length === 0 && /^⚠️ Envoi partiel : 2 confirmé\(s\) sur 3 ; 1 non confirmé\(s\) — aucune trace d’envoi : CLUB FICTIF D/.test(m2) &&
      /envoi groupé précédent vérifié/.test(m2) && !!q3 && q3.corps.id_envoi !== id1 && q3.corps.confirmer_renvoi === 'non' &&
      b.dialogues.some((d) => /^Envoyer l'invitation à 1 club\(s\) \?/.test(d)) && json(q3.reponse.envoyes) === '[]' &&
      json(q3.reponse.echecs.map((e) => e.club)) === json(['CLUB FICTIF D']) && b.srv.courrielsEnvoyes() === 2,
    'C.2 précédent tranché partiel : « ⚠️ Envoi partiel… CLUB FICTIF D », AUCUN POST ; le clic d\'après est un NOUVEAU geste (nouvel identifiant) sur la ' +
      'liste relue : UN club proposé (D), A et E jamais réécrits', [r2.resume, m2.slice(0, 160), r3.resume, b.dialogues]);
  });
  await essai('C.3', async () => {
    // Précédent encore EN COURS au serveur : rien n'est envoyé, aucune confirmation proposée.
    const enCours = { actif: false };
    const b = await banc({ panne: premiere('envoyerInvitationsGroupe', 'reseau-avant'),
      avantServir: (e, srv) => { if (enCours.actif) poserPour('reserve')(e, srv); } });
    await b.jouer(() => groupe(b));
    enCours.actif = true;
    b.dialogues.length = 0;
    const r2 = await b.jouer(() => groupe(b));
    t.vrai(de(r2, 'envoyerInvitationsGroupe').length === 0 && de(r2, 'getSendGroupStatus').length === 1 && b.dialogues.length === 0 &&
      /^⚠️ Traitement encore en cours : 0 confirmé\(s\) sur 3 ; 3 en cours/.test(message(b)) && /envoi groupé précédent vérifié/.test(message(b)) &&
      etatGeste(b).incertain && b.srv.courrielsEnvoyes() === 0 && !bouton(b).disabled,
    'C.3 précédent encore en cours au serveur : UNE lecture, AUCUN POST, AUCUNE confirmation, « ⚠️ Traitement encore en cours », geste gardé, bouton libéré',
    [r2.resume, message(b)]);
  });
  await essai('C.4', async () => {
    // Précédent INTROUVABLE (réseau coupé avant l'envoi) : confirmation qui prévient, puis le MÊME identifiant ; UN envoi.
    const b = await banc({ panne: premiere('envoyerInvitationsGroupe', 'reseau-avant') });
    const r1 = await b.jouer(() => groupe(b));
    b.dialogues.length = 0;
    const r2 = await b.jouer(() => groupe(b));
    const q1 = de(r1, 'envoyerInvitationsGroupe')[0], q2 = de(r2, 'envoyerInvitationsGroupe')[0];
    t.vrai(de(r2, 'getSendGroupStatus').length === 1 && !!q2 && q2.corps.id_envoi === q1.corps.id_envoi && q2.corps.confirmer_renvoi === 'oui' &&
      q2.corps.renvoyer === 'non' && b.dialogues.some((d) => /L’envoi précédent n’a pas été confirmé/.test(d)) && json(q2.reponse.envoyes) === json(VISES) &&
      b.srv.courrielsEnvoyes() === 3 && !etatGeste(b).incertain && /^✅ 3 invitation\(s\) envoyée\(s\)\.$/.test(message(b)),
    'C.4 précédent introuvable : UNE lecture, puis la confirmation qui prévient et le MÊME identifiant (`renvoyer: \'non\'`) ; 3 e-mails au total',
    [r2.resume, b.dialogues, message(b)]);
  });
  await essai('C.5', async () => {
    // Double clic, puis clic PENDANT la vérification : UN POST, UNE série de lectures, UNE confirmation.
    const b = await banc({ panne: premiere('envoyerInvitationsGroupe', 'http404-apres') });
    let pendant = null;
    const r = await b.jouer(() => Promise.all([groupe(b), groupe(b)]), async (n) => {
      if (n !== 1) return;
      pendant = { desactive: bouton(b).disabled, texte: bouton(b).textContent };
      await groupe(b);
    });
    t.vrai(de(r, 'envoyerInvitationsGroupe').length === 1 && de(r, 'getSendGroupStatus').length === 1 && pendant && pendant.desactive &&
      /Vérification/.test(pendant.texte) && b.dialogues.filter((d) => /^Envoyer l'invitation/.test(d)).length === 1 && b.srv.courrielsEnvoyes() === 3,
    'C.5 double clic, puis clic PENDANT la vérification : UN POST groupé, UNE vérification, UNE confirmation, 3 e-mails ; bouton occupé', [r.resume, pendant]);
  });

  /* ============================== S — reprise après rechargement de l'onglet ============================== */
  console.log('\nS — le geste groupé incertain survit à un rechargement (sessionStorage, 30 min)');
  await essai('S', async () => {
    const stockage = new Map();
    const b = await banc({ stockageSession: stockage, panne: premiere('envoyerInvitationsGroupe', 'http404-apres', (e) => (e.action === 'getSendGroupStatus' ? 'reseau-avant' : null)) });
    const r1 = await b.jouer(() => groupe(b));
    const id = de(r1, 'envoyerInvitationsGroupe')[0].corps.id_envoi;
    const stocke = stockage.get(STOCKAGE) || '';
    const e = stocke ? JSON.parse(stocke) : {};
    t.vrai(e.id === id && json(e.clubs) === json(VISES) && typeof e.t === 'number' && Object.keys(e).sort().join() === 'clubs,id,t' &&
      !/@example\.invalid/.test(stocke) && stocke.indexOf(B.MI.CLE_ADMIN) === -1 && stocke.indexOf('<') === -1 && !/sujet|html|texte|pieces/.test(stocke),
    'S.1 geste incertain : identifiant, clubs visés (noms) et instant gardés en session — rien d\'autre (ni clé, ni adresse, ni contenu)', stocke);
    // Rechargement : un NOUVEAU navigateur sur la même session et le même serveur.
    const n = B.navigateur(b.srv, LIRE, { stockageSession: stockage, dialogues: [] });
    await n.charger();
    t.vrai(etatGeste(n).incertain && n.global('idsEnvois').get(CLE_GESTE) === id && json(etatGeste(n).clubs) === json(VISES),
      'S.2 après rechargement : le geste reprend son identifiant, ses clubs et sa marque « incertain »', etatGeste(n));
    const r2 = await n.jouer(() => groupe(n));
    t.vrai(de(r2, 'envoyerInvitationsGroupe').length === 0 && de(r2, 'getSendGroupStatus').length === 1 && de(r2, 'getSendGroupStatus')[0].corps.id_envoi === id &&
      json(de(r2, 'getSendGroupStatus')[0].corps.clubs) === json(VISES) && n.dialogues.length === 0 &&
      /^✅ Envoi groupé confirmé : 3\/3 \(envoi groupé précédent vérifié/.test(n.texte('message-invitations') || '') && !stockage.has(STOCKAGE) &&
      n.srv.courrielsEnvoyes() === 3,
    'S.3 clic après rechargement : UNE lecture (même identifiant, mêmes clubs) → « ✅ 3/3 », AUCUNE confirmation, AUCUN POST ; session nettoyée', [r2.resume]);
    // Entrée de plus de 30 min, malformée ou vide : ignorée et effacée au chargement.
    const cas = [{ id: 'ancien', clubs: VISES, t: Date.now() - 31 * 60000 }, { id: '', clubs: VISES, t: Date.now() }, { id: 'x', clubs: [], t: Date.now() },
      { id: 'x', clubs: [3], t: Date.now() }, 'pas du JSON'];
    const restes = [];
    for (const c of cas) {
      const s = new Map([[STOCKAGE, typeof c === 'string' ? c : json(c)]]);
      const v = await banc({ stockageSession: s });
      if (etatGeste(v).incertain || etatGeste(v).id || s.has(STOCKAGE)) restes.push(c);
    }
    t.vrai(restes.length === 0, 'S.4 entrée de plus de 30 min, sans identifiant, sans club, aux clubs non textuels ou illisible : ignorée et effacée au chargement', restes);
  });

  /* ============================== D — diagnostic discret ============================== */
  console.log('\nD — diagnostic discret du geste groupé : durée, statut, identifiant, vérifications ; jamais de donnée sensible');
  await essai('D', async () => {
    const b = await banc();
    await b.jouer(() => groupe(b));
    const ok = (diagnostics(b) || []).slice(-1)[0] || {};
    t.vrai(ok.geste === 'groupe' && ok.nb_clubs === 3 && ok.statut === null && ok.erreur === null && typeof ok.duree_ms === 'number' &&
      typeof ok.id_envoi === 'string' && ok.id_envoi.length >= 8 && ok.mesures_serveur && typeof ok.mesures_serveur.envoi_ms === 'number' && ok.verification === null,
    'D.1 succès : geste, nombre de clubs, durée, identifiant, mesures du serveur relevés ; aucune vérification', ok);
    const c = await banc({ panne: premiere('envoyerInvitationsGroupe', 'http404-apres') });
    const r = await c.jouer(() => groupe(c));
    const k = (diagnostics(c) || []).slice(-1)[0] || {};
    t.vrai(k.geste === 'groupe' && k.statut === 404 && k.erreur === 'http' && k.id_envoi === de(r, 'envoyerInvitationsGroupe')[0].corps.id_envoi &&
      k.verification && k.verification.verdict === 'termine' && k.verification.lectures.length === 1 && k.verification.lectures[0].confirmes === 3,
    'D.2 404 : statut, type d\'erreur, identifiant, verdict et lectures (comptes) de la vérification', k);
    const tout = json(diagnostics(b)) + json(diagnostics(c));
    t.vrai(tout.indexOf(B.MI.CLE_ADMIN) === -1 && !/@example\.invalid|CLUB FICTIF/.test(tout) && tout.indexOf('<') === -1 &&
      !/html_modele|texte_modele|sujet|pieces_jointes|"cle"/.test(tout),
    'D.3 ⛔ jamais la clé, les adresses, les noms des clubs ni le contenu (objet, HTML, texte, pièces) dans le diagnostic du groupé', tout.slice(0, 300));
  });

  console.log('\n' + (process.exitCode ? 'ÉCHEC' : 'OK — ' + t.n + ' contrôles MAIL-GROUPE-STATUS-01 (frontend) passés.'));
})().catch((e) => { console.error(e); process.exitCode = 1; });
