'use strict';

/**
 * ============================================================================
 *  GARDE-FOU — MAIL-STATUS-OBS-01 (frontend) : une invitation dont la réponse se perd est VÉRIFIÉE, jamais renvoyée
 * ============================================================================
 *  ▶ node tests/mail-status-obs-01.test.js [--frontend avant|<dossier>] [--backend avant|<Code.gs>]
 *    `avant` = références FIGÉES d'avant le lot, jamais HEAD : frontend 2a2bac5d7a646645329a5348ad79697a3263f126 (lu dans
 *    git), backend = production V19 (archives/deploiements/backend/v19/Code.gs).
 *
 *  Vrais modules du frontend (banc-ecran-invitation.js) contre le vrai Code.gs ; seul `fetch` est simulé, minuteries ×1/1000.
 *    A — périmètre : js/api.js et les pages publiques restent octet pour octet ceux de la référence (aucun rayon public) ;
 *    V — la vérification après une issue incertaine : succès normal sans lecture ; 404 après l'envoi → `fait` / `envoye`
 *        confirmés ; réservé / en envoi → lectures bornées (3) ; absent → « non confirmé », aucun renvoi ; interrompu →
 *        « échec confirmé » ; même identifiant à chaque lecture ; jamais de second POST d'envoi ; double clic bloqué ;
 *        invitation ET relance ; backend d'avant → relecture historique ;
 *    S — la reprise après rechargement (sessionStorage) : identifiant gardé 30 min, vérifié au clic suivant, effacé une
 *        fois le geste tranché ; ni clé, ni adresse, ni contenu stockés ;
 *    D — le diagnostic discret, propre au module : début, fin, durée, statut HTTP quand l'erreur le porte, identifiant, type
 *        d'erreur, mesures du serveur, vérifications (ni adresse finale ni redirection : js/api.js reste inchangé) ; jamais la
 *        clé, le contenu, l'adresse ni un jeton.
 *  Contre-épreuves (constatées) : `--frontend avant` fait tomber V.2–V.8, S.1–S.4, D.1–D.2 et garde A (périmètre, vrai
 *  avant comme après), V.1 (chemin normal), V.9 (message historique), V.10 et D.3 ; `--backend avant` (V19, sans
 *  getSendStatus) fait tomber V.2–V.6b, V.8, S.3, D.2 et garde A, V.1, V.7 (garde du double clic), V.9 (repli historique),
 *  V.10, S.1, S.2, S.4, D.1, D.3.
 *  ⛔ Aucun réseau, aucun service Google réel.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('./banc-ecran-invitation');
const BC = require('./banc-ecran-categories');

const FRONTEND_AVANT_REV = '2a2bac5d7a646645329a5348ad79697a3263f126';
const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
const LECTEUR_AVANT = (f) => B.git(B.RACINE, FRONTEND_AVANT_REV, f);
const LIRE = arg('frontend') === 'avant' ? LECTEUR_AVANT : arg('frontend') ? B.lecteur(path.resolve(arg('frontend'))) : B.lecteur();
const V19 = path.join(B.BACKEND, 'archives', 'deploiements', 'backend', 'v19', 'Code.gs');
const CODE = fs.readFileSync(arg('backend') === 'avant' ? V19 : arg('backend') ? path.resolve(arg('backend')) : path.join(B.BACKEND, 'Code.gs'), 'utf8');

const t = BC.compteur();
const banc = (o) => B.banc(Object.assign({ lire: LIRE, backend: CODE, monde: B.MI.amorcerClubs }, o || {}));
const essai = async (code, fn) => { try { await fn(); } catch (e) { t.vrai(false, code + ' (exception) ' + String(e && e.stack || e).slice(0, 400)); } };
const json = JSON.stringify;
const de = (r, action) => r.requetes.filter((q) => q.action === action);
const CLE_ENVOI = 'invitation|club fictif a';
const REGISTRE = 'ENVOI_EMAIL|invitation|club fictif a';
const EMAIL = 'club-a@example.invalid';
const inviterA = (b) => B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club'));
const relancerA = (b) => b.global('envoyerInvitationClubUI')('CLUB FICTIF A', { relance: true });
const avecRelanceA = (m) => { B.MI.amorcerClubs(m); m.appeler('ecrireEngagementClub', m.classeur, 'CLUB FICTIF A', { statut: 'Invité', invitation_envoyee: '2026-09-03' }, true); };
const message = (b) => b.texte('message-club-invite') || '';
const messageRelance = (b) => b.texte('message-suivi-clubs') || b.texte('message-club-invite') || '';
/** Première émission de `action` : `mode` ; `puis` (optionnel) : la panne de toutes les autres requêtes. */
const premiere = (action, mode, puis) => { let n = 0; return (e) => (e.action === action && ++n === 1 ? mode : puis ? puis(e) : null); };
const etatGeste = (b) => ({ incertain: b.global('envoisIncertains').has(CLE_ENVOI), id: b.global('idsEnvois').has(CLE_ENVOI) });
const diagnostics = (b) => { try { return JSON.parse(JSON.stringify(b.global('diagnosticsEnvois'))); } catch (e) { return null; } };

(async () => {
  /* ============================== A — périmètre : js/api.js et pages publiques intacts ============================== */
  console.log('\nA — périmètre : le transport partagé et les pages publiques ne bougent pas');
  await essai('A', async () => {
    const identiques = ['js/api.js', 'index.html', 'tournoi.html', 'perfs.html'].map((f) => [f, LIRE(f) === LECTEUR_AVANT(f)]);
    t.vrai(identiques.every((x) => x[1]), 'A.1 js/api.js, index.html, tournoi.html et perfs.html : octet pour octet ceux de la référence ' +
      FRONTEND_AVANT_REV.slice(0, 7) + ' (aucun rayon d\'impact public)', identiques.filter((x) => !x[1]));
    const module = LIRE('js/admin-invitations.js');
    t.vrai(!/diagnostic\s*:/.test(module.slice(module.indexOf('function ecrireInvitation('), module.indexOf('function marquerBoutonsEnvoi('))),
      'A.2 le module d\'invitation ne demande rien de plus au transport : `ecrireInvitation` / `ecrireEnvoiEmail` inchangés dans leurs options');
  });

  /* ============================== V — la vérification après une issue incertaine ============================== */
  console.log('\nV — issue incertaine : vérifier (même identifiant, lecture seule), jamais renvoyer');
  await essai('V.1', async () => {
    const b = await banc();
    const r = await b.jouer(() => inviterA(b));
    t.vrai(r.requetes.length === 1 && de(r, 'envoyerInvitationClub').length === 1 && de(r, 'getSendStatus').length === 0 &&
      /^✅ Invitation envoyée à club-a@example\.invalid/.test(message(b)) && b.srv.courrielsEnvoyes() === 1,
    'V.1 succès HTTP normal : UNE requête, AUCUNE lecture d\'état, « ✅ Invitation envoyée » (chemin normal inchangé)', [r.resume, message(b)]);
  });
  for (const [code, geste, monde, lire, nature] of [['V.2', inviterA, B.MI.amorcerClubs, message, 'invitation'], ['V.2r', relancerA, avecRelanceA, messageRelance, 'relance']]) {
    await essai(code, async () => {
      const stockage = new Map();
      let pendant = null;
      const b = await banc({ monde, stockageSession: stockage, panne: premiere('envoyerInvitationClub', 'http404-apres') });
      const r = await b.jouer(() => geste(b), (n) => { if (n === 1) pendant = { stocke: stockage.get('r92_envois_incertains') || null, etat: etatGeste(b) }; });
      const envoi = de(r, 'envoyerInvitationClub'), lectures = de(r, 'getSendStatus');
      const id = envoi[0] && envoi[0].corps.id_envoi;
      t.vrai(envoi.length === 1 && lectures.length === 1 && lectures[0].corps.id_envoi === id && lectures[0].corps.club_nom === 'CLUB FICTIF A' &&
        lectures[0].reponse.etat === 'fait' && b.srv.courrielsEnvoyes() === 1 &&
        new RegExp('^✅ Envoi confirmé : ' + nature + ' partie vers club-a@example\\.invalid').test(lire(b)) && /rien n’a été renvoyé/.test(lire(b)) &&
        json(r.requetes.map((q) => q.action)) === json(['envoyerInvitationClub', 'getSendStatus', 'listerClubsInvites']),
      code + ' ' + nature + ', réponse perdue (404 après l\'envoi) : UNE lecture d\'état (même identifiant) → `fait` → « ✅ Envoi confirmé », UN e-mail, UN POST d\'envoi, liste relue',
      [r.resume, lire(b)]);
      t.vrai(pendant && pendant.etat.incertain && pendant.etat.id && pendant.stocke && JSON.parse(pendant.stocke)[CLE_ENVOI].id === id &&
        !etatGeste(b).incertain && !etatGeste(b).id && !stockage.has('r92_envois_incertains'),
      code + '.b pendant la vérification : geste incertain, identifiant gardé en session ; une fois `fait` : marques effacées (mémoire ET session)',
      [pendant, etatGeste(b), Array.from(stockage.keys())]);
    });
  }
  await essai('V.3', async () => {
    const reglage = { prises: 0, refuser: false };
    const b = await banc({ panne: premiere('envoyerInvitationClub', 'http404-apres'),
      avantServir: (e) => { reglage.prises = 0; reglage.refuser = e.action === 'envoyerInvitationClub'; } });
    const base = b.srv.contexte.LockService.getScriptLock;
    b.srv.contexte.LockService.getScriptLock = function () {
      const v = base.call(this);
      return Object.assign(Object.create(v), { tryLock(ms) { reglage.prises++; return reglage.refuser && reglage.prises > 1 ? false : v.tryLock(ms); },
        releaseLock() { return v.releaseLock(); }, hasLock() { return v.hasLock ? v.hasLock() : false; } });
    };
    const r = await b.jouer(() => inviterA(b));
    const lectures = de(r, 'getSendStatus');
    t.vrai(de(r, 'envoyerInvitationClub').length === 1 && lectures.length === 1 && lectures[0].reponse.etat === 'envoye' && b.srv.courrielsEnvoyes() === 1 &&
      /^✅ Mail envoyé à club-a@example\.invalid\. La mise à jour du suivi est encore en cours/.test(message(b)) && !etatGeste(b).incertain,
    'V.3 mail parti, finalisation impossible (verrou refusé), réponse perdue : `envoye` → « ✅ Mail envoyé… suivi encore en cours », geste clos, UN e-mail', [r.resume, message(b)]);
  });
  await essai('V.4', async () => {
    // Réponse jamais reçue (réseau) et serveur qui répond « en envoi » pour CE geste : lectures bornées, puis « en cours ».
    const b = await banc({ panne: premiere('envoyerInvitationClub', 'reseau-avant'),
      avantServir: (e, srv) => { if (e.action === 'getSendStatus') srv.proprietes.set(REGISTRE, JSON.stringify({ e: 'envoi', id: e.corps.id_envoi, r: Date.now(), t: Date.now() })); } });
    const r = await b.jouer(() => inviterA(b));
    const envoi = de(r, 'envoyerInvitationClub'), lectures = de(r, 'getSendStatus');
    t.vrai(envoi.length === 1 && lectures.length === 3 && lectures.every((q) => q.corps.id_envoi === envoi[0].corps.id_envoi && q.reponse.etat === 'envoi') &&
      json(b.global('VERIFICATIONS_ENVOI_MS')) === json([4000, 12000, 27000]) && /^⚠️ Envoi toujours en cours vers club-a@example\.invalid/.test(message(b)) &&
      /Rien n’est renvoyé automatiquement/.test(message(b)) && etatGeste(b).incertain && etatGeste(b).id && b.srv.courrielsEnvoyes() === 0,
    'V.4 en cours (réservé / en envoi) : TROIS lectures au plus (~4 s, ~12 s, ~27 s), même identifiant, AUCUN POST de plus ; « ⚠️ Envoi toujours en cours », geste gardé',
    [r.resume, message(b)]);
  });
  await essai('V.5', async () => {
    const b = await banc({ panne: premiere('envoyerInvitationClub', 'reseau-avant') });
    const r = await b.jouer(() => inviterA(b));
    t.vrai(de(r, 'envoyerInvitationClub').length === 1 && de(r, 'getSendStatus').length === 3 && de(r, 'getSendStatus').every((q) => q.reponse.etat === 'absent') &&
      /^⚠️ L’envoi à club-a@example\.invalid n’a pas pu être confirmé/.test(message(b)) && !/✅/.test(message(b)) && b.srv.courrielsEnvoyes() === 0 &&
      etatGeste(b).incertain && etatGeste(b).id,
    'V.5 absent, réponse jamais reçue (la demande attendait peut-être le verrou) : trois lectures, « n’a pas pu être confirmé », AUCUN renvoi automatique, geste gardé',
    [r.resume, message(b)]);
    const c = await banc({ panne: premiere('envoyerInvitationClub', 'http500-avant') });
    const r2 = await c.jouer(() => inviterA(c));
    t.vrai(de(r2, 'envoyerInvitationClub').length === 1 && de(r2, 'getSendStatus').length === 1 && /n’a pas pu être confirmé/.test(message(c)) && c.srv.courrielsEnvoyes() === 0,
      'V.5b absent APRÈS une réponse HTTP (le serveur a fini) : UNE lecture suffit à trancher « non confirmé », aucun renvoi', [r2.resume, message(c)]);
  });
  await essai('V.6', async () => {
    const b = await banc({ panne: premiere('envoyerInvitationClub', 'reseau-avant'),
      avantServir: (e, srv) => { if (e.action === 'getSendStatus') srv.proprietes.set(REGISTRE, JSON.stringify({ e: 'reserve', id: e.corps.id_envoi, r: Date.now() - 8 * 60000, t: Date.now() - 8 * 60000 })); } });
    const r = await b.jouer(() => inviterA(b));
    t.vrai(de(r, 'getSendStatus').length === 1 && /^❌ Échec confirmé : l’envoi à club-a@example\.invalid a été interrompu avant le départ de l’e-mail, rien n’est parti/.test(message(b)) &&
      !etatGeste(b).incertain && b.srv.courrielsEnvoyes() === 0,
    'V.6 interrompu avant l\'e-mail (réservation morte) : « ❌ Échec confirmé », rien n\'est parti, geste clos (le clic suivant est un nouvel envoi)', [r.resume, message(b)]);
    // MailApp en échec, réponse perdue : jamais un faux succès.
    const c = await banc({ panne: premiere('envoyerInvitationClub', 'http404-apres'),
      monde: (m) => { B.MI.amorcerClubs(m); const envoi = m.contexte.__banc_courriel; m.contexte.__banc_courriel = (d, s) => { if (d === EMAIL) throw new Error('quota (fictif)'); return envoi(d, s); }; } });
    const r2 = await c.jouer(() => inviterA(c));
    t.vrai(de(r2, 'getSendStatus').length === 1 && de(r2, 'getSendStatus')[0].reponse.etat === 'absent' && !/✅/.test(message(c)) && /n’a pas pu être confirmé/.test(message(c)) &&
      c.srv.courrielsEnvoyes() === 0, 'V.6b MailApp en échec puis réponse perdue : `absent` → « non confirmé », JAMAIS « ✅ »', [r2.resume, message(c)]);
  });
  await essai('V.7', async () => {
    const b = await banc({ panne: premiere('envoyerInvitationClub', 'http404-apres') });
    let pendant = null;
    const r = await b.jouer(() => Promise.all([inviterA(b), inviterA(b)]), async (n) => {
      if (n !== 1) return;                                                  // pendant la vérification : redessin + troisième clic
      b.global('afficherClubsInvites()');
      const x = B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club');
      pendant = { desactive: x.disabled, occupe: x.getAttribute('aria-busy') };
      await inviterA(b);
    });
    t.vrai(de(r, 'envoyerInvitationClub').length === 1 && de(r, 'getSendStatus').length === 1 && pendant && pendant.desactive && pendant.occupe === 'true' &&
      b.srv.courrielsEnvoyes() === 1 && b.dialogues.filter((d) => /^Envoyer l'invitation/.test(d)).length === 1,
    'V.7 double clic, puis clic sur le bouton redessiné PENDANT la vérification : UN POST, UNE vérification, UNE confirmation, UN e-mail ; bouton occupé', [r.resume, pendant]);
  });
  await essai('V.8', async () => {
    // La réponse se perd ET les trois lectures échouent (réseau) : le geste reste incertain. Au clic suivant (serveur
    // joignable), UNE lecture d'abord : déjà parti → rien ne repart, aucune confirmation n'est même proposée.
    const panneLectures = { active: true };
    const b = await banc({ panne: premiere('envoyerInvitationClub', 'http404-apres', (e) => (e.action === 'getSendStatus' && panneLectures.active ? 'reseau-avant' : null)) });
    const r1 = await b.jouer(() => inviterA(b));
    const m1 = message(b);
    const incertainApres1 = etatGeste(b).incertain;
    panneLectures.active = false;
    b.dialogues.length = 0;
    // La liste relue montre le club « Invité » : le geste suivant possible est celui du Suivi (« Relancer la réponse »).
    const r2 = await b.jouer(() => relancerA(b));
    t.vrai(/non reçue/.test(m1) && /pas confirmé/.test(m1) && de(r1, 'getSendStatus').length === 3 && incertainApres1 && !etatGeste(b).incertain &&
      de(r2, 'envoyerInvitationClub').length === 0 && de(r2, 'getSendStatus').length === 1 &&
      de(r2, 'getSendStatus')[0].corps.id_envoi === de(r1, 'envoyerInvitationClub')[0].corps.id_envoi && b.dialogues.length === 0 &&
      /^✅ Invitation déjà partie vers club-a@example\.invalid \(envoi précédent vérifié auprès du serveur\)/.test(messageRelance(b)) && b.srv.courrielsEnvoyes() === 1,
    'V.8 vérification impossible (3 lectures ratées) : « non confirmé », geste gardé ; au geste suivant, UNE lecture (même identifiant) → « déjà partie », AUCUN POST, AUCUNE confirmation, UN e-mail',
    [m1.slice(0, 100), r1.resume, r2.resume, messageRelance(b)]);
  });
  await essai('V.9', async () => {
    // Backend d'avant ce lot (production V19, sans getSendStatus) : repli sur la relecture historique, aucun renvoi.
    const b = await B.banc({ lire: LIRE, backend: fs.readFileSync(V19, 'utf8'), monde: B.MI.amorcerClubs, panne: premiere('envoyerInvitationClub', 'http404-apres') });
    const r = await b.jouer(() => inviterA(b));
    t.vrai(de(r, 'envoyerInvitationClub').length === 1 && de(r, 'getSendStatus').length <= 1 && de(r, 'listerClubsInvites').length === 1 &&
      /non reçue/.test(message(b)) && /pas confirmé/.test(message(b)) && /« Invité le … » dira s’il est parti/.test(message(b)) && b.srv.courrielsEnvoyes() === 1,
    'V.9 backend V19 (action inconnue) : message et relecture historiques, UN POST d\'envoi, UN e-mail', [r.resume, message(b)]);
  });
  await essai('V.10', async () => {
    const b = await banc({ panne: premiere('envoyerInvitationClub', 'verrou-occupe') });
    const r = await b.jouer(() => inviterA(b));
    t.vrai(de(r, 'getSendStatus').length === 0 && /occup/i.test(message(b)) && !etatGeste(b).incertain,
      'V.10 refus lisible du serveur (verrou occupé) : rien à vérifier, AUCUNE lecture d\'état', [r.resume, message(b)]);
  });

  /* ============================== S — reprise après rechargement de l'onglet ============================== */
  console.log('\nS — l\'identifiant d\'un geste incertain survit à un rechargement (sessionStorage, 30 min)');
  await essai('S', async () => {
    const stockage = new Map();
    const b = await banc({ stockageSession: stockage, panne: premiere('envoyerInvitationClub', 'http404-apres', (e) => (e.action === 'getSendStatus' ? 'reseau-avant' : null)) });
    const r1 = await b.jouer(() => inviterA(b));
    const id = de(r1, 'envoyerInvitationClub')[0].corps.id_envoi;
    const stocke = stockage.get('r92_envois_incertains') || '';
    t.vrai(!!stocke && JSON.parse(stocke)[CLE_ENVOI].id === id && JSON.parse(stocke)[CLE_ENVOI].relance === false &&
      stocke.indexOf(EMAIL) === -1 && stocke.indexOf(B.MI.CLE_ADMIN) === -1 && stocke.indexOf('<') === -1 && Object.keys(JSON.parse(stocke)[CLE_ENVOI]).sort().join() === 'id,relance,t',
    'S.1 geste incertain : identifiant, nature et instant gardés en session — rien d\'autre (ni clé, ni adresse, ni contenu)', stocke);
    // Rechargement : un NOUVEAU navigateur sur la même session et le même serveur.
    const n = B.navigateur(b.srv, LIRE, { stockageSession: stockage, dialogues: [] });
    await n.charger();
    t.vrai(n.global('envoisIncertains').has(CLE_ENVOI) && n.global('idsEnvois').get(CLE_ENVOI) === id,
      'S.2 après rechargement : le geste reprend son identifiant et sa marque « incertain »', etatGeste(n));
    // La liste relue au chargement montre le club « Invité » : le geste possible est « Relancer la réponse » (Suivi).
    const r2 = await n.jouer(() => relancerA(n));
    t.vrai(de(r2, 'envoyerInvitationClub').length === 0 && de(r2, 'getSendStatus').length === 1 && de(r2, 'getSendStatus')[0].corps.id_envoi === id &&
      n.dialogues.length === 0 && /^✅ Invitation déjà partie vers club-a@example\.invalid \(envoi précédent vérifié auprès du serveur\)/.test(messageRelance(n)) &&
      !stockage.has('r92_envois_incertains') && n.srv.courrielsEnvoyes() === 1,
    'S.3 geste après rechargement : UNE lecture (même identifiant) → « déjà partie », AUCUNE confirmation, AUCUN POST ; session nettoyée', [r2.resume, messageRelance(n)]);
    // Une entrée de plus de 30 min (ou étrangère aux invitations) est jetée au chargement.
    const vieille = new Map([['r92_envois_incertains', json({ [CLE_ENVOI]: { id: 'ancien-geste', relance: false, t: Date.now() - 31 * 60000 },
      'dossier|club fictif b': { id: 'autre', relance: false, t: Date.now() } })]]);
    const v = await banc({ stockageSession: vieille });
    t.vrai(!v.global('envoisIncertains').has(CLE_ENVOI) && !v.global('idsEnvois').has('dossier|club fictif b') && !vieille.has('r92_envois_incertains'),
      'S.4 entrée de plus de 30 min, ou d\'une autre sorte d\'e-mail : ignorée et effacée au chargement', Array.from(vieille.entries()));
  });

  /* ============================== D — diagnostic discret ============================== */
  console.log('\nD — diagnostic discret : durée, statut, identifiant, mesures ; jamais de donnée sensible');
  await essai('D', async () => {
    const b = await banc();
    await b.jouer(() => inviterA(b));
    const ok = (diagnostics(b) || []).slice(-1)[0] || {};
    t.vrai(ok.geste === 'invitation' && ok.statut === null && ok.erreur === null && typeof ok.duree_ms === 'number' && !!ok.debut && !!ok.fin &&
      typeof ok.id_envoi === 'string' && ok.id_envoi.length >= 8 && ok.mesures_serveur && typeof ok.mesures_serveur.verrou_ms === 'number' && ok.verification === null,
    'D.1 succès : début, fin, durée, identifiant, mesures du serveur (serveur / verrou / envoi) relevés ; statut non inventé (js/api.js ne l\'expose pas) ; aucune vérification', ok);
    const c = await banc({ panne: premiere('envoyerInvitationClub', 'http404-apres') });
    const r = await c.jouer(() => inviterA(c));
    const k = (diagnostics(c) || []).slice(-1)[0] || {};
    t.vrai(k.statut === 404 && k.erreur === 'http' && k.id_envoi === de(r, 'envoyerInvitationClub')[0].corps.id_envoi && typeof k.duree_ms === 'number' &&
      k.verification && k.verification.verdict === 'fait' && k.verification.lectures.length === 1 && k.mesures_serveur && typeof k.mesures_serveur.envoi_ms === 'number',
    'D.2 404 : statut, type d\'erreur, durée, identifiant, verdict de la vérification ET mesures du serveur retrouvées au registre', k);
    const tout = json(diagnostics(b)) + json(diagnostics(c));
    const jeton = (b.srv.clubs().find((x) => x.club_nom === 'CLUB FICTIF A') || {}).club_token || 'jeton-absent';
    t.vrai(tout.indexOf(B.MI.CLE_ADMIN) === -1 && tout.indexOf(EMAIL) === -1 && tout.indexOf(jeton) === -1 && tout.indexOf('<') === -1 &&
      !/html_modele|texte_modele|sujet|pieces_jointes|"cle"/.test(tout),
    'D.3 ⛔ jamais la clé, l\'adresse du club, son jeton, le contenu (objet, HTML, texte, pièces) dans le diagnostic', tout.slice(0, 300));
  });

  console.log('\n' + (process.exitCode ? 'ÉCHEC' : 'OK — ' + t.n + ' contrôles MAIL-STATUS-OBS-01 (frontend) passés.'));
})().catch((e) => { console.error(e); process.exitCode = 1; });
