'use strict';

/**
 * ============================================================================
 *  GARDE-FOU — MAIL-GROUPE-DEMO-01 (frontend) : l'envoi GROUPÉ dit clairement quels clubs ne reçoivent pas l'invitation
 *  parce que leur adresse est une adresse de démonstration non distribuable
 * ============================================================================
 *  ▶ node tests/mail-groupe-demo-01.test.js [--frontend avant|<dossier>] [--backend avant|<Code.gs>]
 *    `avant` = références FIGÉES d'avant le lot, jamais HEAD : frontend fac854b9c9f4ab5e44ffa021b89d0f55d628b80e (lu dans
 *    git), backend = production V23 (archives/deploiements/backend/v23/Code.gs).
 *
 *  Vrais modules du frontend (banc-ecran-invitation.js) contre le vrai Code.gs ; seul `fetch` est simulé, minuteries ×1/1000.
 *  Le jeu Démo est créé par sa vraie porte ; ses clubs y sont « Accepté » : CLAMART est REMIS invitable dans le classeur du
 *  banc (statut vide, sans date), comme après un changement de statut à la main. ⛔ Le jeu lui-même n'est pas modifié.
 *    A — périmètre : js/api.js et les pages publiques octet pour octet ceux de la référence ; admin.html charge une seule
 *        fois admin-invitations.js, à sa nouvelle adresse versionnée ; un seul appel groupé, `renvoyer: 'non'`, garde du
 *        double clic ;
 *    R — résumé AVANT confirmation : la règle de l'envoi individuel (MAIL-01, `estDestinataireDemoNonDistribuable`, déjà
 *        dans ce module) signale les adresses de démonstration, nommées sans leur adresse, exclues du compte « recevront » ;
 *        tous Démo → « Aucun club à inviter », AUCUNE requête ;
 *    B — BILAN après envoi : les clubs refusés par le serveur (`demo_non_distribuables`) nommés avec la raison, jamais comme
 *        un échec technique ni avec leur adresse ; le serveur reste seul juge (club que l'écran ne reconnaît pas) ;
 *    V — réponse perdue : la vérification ne vise pas les clubs Démo signalés (bilan 1/1) ; un club Démo que seul le
 *        serveur reconnaît reste « non confirmé », jamais « confirmé » ;
 *    N — NON-RÉGRESSION contre la référence : sans club Démo, résumé, requêtes, e-mails et bilan identiques ; bilan des
 *        non-servis identique sans le nouveau champ ; refus individuel inchangé ; double clic : un seul POST.
 *  Contre-épreuves (constatées) : `--frontend avant` fait tomber R.1, R.2, B.1, B.2, B.3 et V.1, et garde A, V.2 (tenu par
 *  le serveur) et N ; `--backend avant` (V23) fait tomber B.2, B.3, V.1, V.2 et N.4 — la demande groupée ne porte aucune
 *  liste de clubs : V23 écrit à CLAMART quoi que l'écran ait signalé, le signalement seul ne protège pas — et garde A, R,
 *  B.1 et N.1 à N.3.
 *  ⛔ Aucun réseau, aucun service Google réel.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const B = require('./banc-ecran-invitation');
const BC = require('./banc-ecran-categories');

const FRONTEND_AVANT_REV = 'fac854b9c9f4ab5e44ffa021b89d0f55d628b80e';
const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
const LECTEUR_AVANT = (f) => B.git(B.RACINE, FRONTEND_AVANT_REV, f);
const LIRE = arg('frontend') === 'avant' ? LECTEUR_AVANT : arg('frontend') ? B.lecteur(path.resolve(arg('frontend'))) : B.lecteur();
const V23 = path.join(B.BACKEND, 'archives', 'deploiements', 'backend', 'v23', 'Code.gs');
const CODE = fs.readFileSync(arg('backend') === 'avant' ? V23 : arg('backend') ? path.resolve(arg('backend')) : path.join(B.BACKEND, 'Code.gs'), 'utf8');

const t = BC.compteur();
const json = JSON.stringify;
const DEMO_CLAMART = 'demo-clamart@example.invalid';
const LIGNE_BILAN = '⚠️ 1 non envoyée(s) — adresse de démonstration non distribuable, à remplacer dans les coordonnées du club : CLAMART.';
/**
 * Le monde du banc : le jeu Démo (vraie porte) ; `clamart` : CLAMART remis invitable ; `reel` : CLUB FICTIF A (invitable,
 * sans marque), B (accepté), C (décliné) ; `jetonSansMarque` : la participation de CLAMART porte un jeton NON marqué (seul
 * le carnet garde la marque : l'écran ne peut pas le reconnaître, le serveur si) ; `sansJeu` : le monde d'avant ce lot
 * (clubs A à E, aucun jeu).
 */
const monde = (o) => (m) => {
  if (o.sansJeu) {
    B.MI.amorcerClubs(m);
    ['D', 'E'].forEach((x) => m.appeler('ajouterClubInvite', m.classeur, { club_nom: 'CLUB FICTIF ' + x, club_contact_nom: 'CONTACT',
      club_contact_prenom: x, club_contact_email: 'club-' + x.toLowerCase() + '@example.invalid' }));
    return;
  }
  const r = m.postMesure({ action: 'creerJeuDemoRacing', cle: B.MI.CLE_ADMIN }).reponse;
  if (r.error) throw new Error('jeu Démo : ' + r.error);
  if (o.reel !== false) B.MI.amorcerClubs(m);
  if (o.clamart !== false) m.appeler('ecrireEngagementClub', m.classeur, 'CLAMART', { statut: '', invitation_envoyee: '' }, false);
  if (o.jetonSansMarque) {
    const clubId = m.carnet().find((x) => x.club_nom === 'CLAMART').club_id;
    const f = m.feuilles.get('Participations');
    const cC = f.cellules[0].indexOf('club_id'), cT = f.cellules[0].indexOf('club_token');
    f.cellules.forEach((l, i) => { if (i && l[cC] === clubId) l[cT] = 'jeton-fictif-clamart-0001'; });
  }
  m.cache.delete('snapshot_json_v3');
};
const banc = (o) => B.banc(Object.assign({ lire: LIRE, backend: CODE }, o || {}, { monde: monde(o || {}) }));
const essai = async (code, fn) => { try { await fn(); } catch (e) { t.vrai(false, code + ' (exception) ' + String(e && e.stack || e).slice(0, 400)); } };
const de = (r, action) => r.requetes.filter((q) => q.action === action);
const groupe = (b) => b.global('onEnvoyerInvitationsGroupe')();
const message = (b) => b.texte('message-invitations') || '';
const ton = (b) => (b.id('message-invitations') || {}).className || '';
const adresses = (b) => b.srv.courriels.map((c) => c.dest);
const premiere = (action, mode) => { let n = 0; return (e) => (e.action === action && ++n === 1 ? mode : null); };

(async () => {
  /* ============================== A — périmètre ============================== */
  console.log('\nA — périmètre : transport partagé, pages publiques et contrat de l\'appel groupé inchangés');
  await essai('A', async () => {
    const identiques = ['js/api.js', 'index.html', 'tournoi.html', 'perfs.html'].map((f) => [f, LIRE(f) === LECTEUR_AVANT(f)]);
    t.vrai(identiques.every((x) => x[1]), 'A.1 js/api.js, index.html, tournoi.html et perfs.html : octet pour octet ceux de la référence ' +
      FRONTEND_AVANT_REV.slice(0, 7), identiques.filter((x) => !x[1]));
    /* A.2 — le contrat du lot DANS admin.html : admin-invitations.js chargé UNE seule fois, à SA nouvelle adresse versionnée
       (la référence le chargeait une fois, en mail-groupe-status01 : le fichier a changé, son adresse aussi). ⭐ Seules les
       balises <script> réellement chargées comptent (commentaires HTML retirés). ⛔ On ne compare plus TOUT admin.html à la
       référence : les évolutions indépendantes de la page (versions d'autres fichiers…) ne concernent pas ce lot. */
    const chargementsInvitations = (html) => {
      const motif = /<script\b[^>]*\bsrc=["']([^"'?]*admin-invitations\.js(?:\?[^"']*)?)["']/gi;
      const page = html.replace(/<!--[\s\S]*?-->/g, '');
      const srcs = [];
      let m;
      while ((m = motif.exec(page)) !== null) srcs.push(m[1]);
      return srcs;
    };
    const chargesMaintenant = chargementsInvitations(LIRE('admin.html'));
    const chargesReference = chargementsInvitations(LECTEUR_AVANT('admin.html'));
    t.vrai(arg('frontend') === 'avant' || (chargesMaintenant.length === 1 &&
      chargesMaintenant[0] === 'js/admin-invitations.js?v=refonte-ciel-verre-20260927-mail-groupe-demo01' &&
      chargesReference.length === 1 &&
      chargesReference[0] === 'js/admin-invitations.js?v=refonte-ciel-verre-20260927-mail-groupe-status01'),
    'A.2 admin.html charge admin-invitations.js UNE seule fois, à la nouvelle adresse versionnée (mail-groupe-demo01, ' +
      'mail-groupe-status01 à la référence) ; les autres évolutions d\'admin.html ne concernent pas ce lot',
    { maintenant: chargesMaintenant, reference: chargesReference });
    const module = LIRE('js/admin-invitations.js');
    const appels = module.match(/ecrireEnvoiEmail\('envoyerInvitationsGroupe'[\s\S]{0,400}?\}\s*,\s*ETAT_DANS_LA_REPONSE\)/g) || [];
    t.vrai(appels.length === 1 && /renvoyer: 'non'/.test(appels[0]) && !/renvoyer:\s*'oui'/.test(module) &&
      /if \(envoisEnCours\.has\(cle\) \|\| \(bouton && bouton\.disabled\)\) return;/.test(module),
    'A.3 UN seul appel groupé, `renvoyer: \'non\'` en dur, aucun `renvoyer: \'oui\'`, garde du double clic intacte', appels);
  });

  /* ============================== R — résumé avant confirmation ============================== */
  console.log('\nR — résumé avant confirmation : la règle de l\'envoi individuel signale les adresses de démonstration');
  await essai('R.1', async () => {
    const b = await banc();
    const r = await b.jouer(() => groupe(b));
    const resume = b.dialogues[0] || '';
    t.vrai(/^Envoyer l'invitation à 1 club\(s\) \?/.test(resume) && /• 1 recevront l'invitation\n/.test(resume) &&
      resume.indexOf('• 1 adresse(s) de démonstration non distribuable(s), à remplacer dans les coordonnées du club : CLAMART (exclue(s))\n') !== -1 &&
      !/@/.test(resume) && de(r, 'envoyerInvitationsGroupe').length === 1,
    'R.1 un club réel + CLAMART (Démo) : « Envoyer l\'invitation à 1 club(s) ? », « 1 recevront », CLAMART signalé par son NOM (aucune adresse ' +
      'dans le résumé), exclu du compte ; puis UN POST groupé', [resume, r.resume]);
  });
  await essai('R.2', async () => {
    const b = await banc({ reel: false });
    const r = await b.jouer(() => groupe(b));
    const alerte = b.dialogues[0] || '';
    t.vrai(/^ALERTE Aucun club à inviter pour le moment\./.test(alerte) &&
      alerte.indexOf('1 adresse(s) de démonstration non distribuable(s), à remplacer dans les coordonnées du club : CLAMART.\n') !== -1 &&
      !/@/.test(alerte) && r.requetes.length === 0 && b.srv.courrielsEnvoyes() === 0,
    'R.2 seul CLAMART (Démo) à inviter : « Aucun club à inviter pour le moment », CLAMART nommé avec la raison, AUCUNE requête, aucun e-mail',
    [alerte, r.resume]);
  });

  /* ============================== B — bilan après envoi ============================== */
  console.log('\nB — bilan : les clubs refusés par le serveur sont nommés avec la raison, jamais comme un échec technique');
  await essai('B.1', async () => {
    const f = LIRE('js/admin-invitations.js');
    const b = await banc();
    const bilan = b.global('messageEnvoisNonServis')({ demo_non_distribuables: ['CLAMART', 'ANTONY'] });
    t.vrai(bilan === ' ⚠️ 2 non envoyée(s) — adresse de démonstration non distribuable, à remplacer dans les coordonnées du club : CLAMART, ANTONY.' &&
      /'demo_non_distribuables'/.test(f),
    'B.1 `messageEnvoisNonServis` nomme les clubs de `demo_non_distribuables` avec la raison (« non envoyée(s) — adresse de démonstration non ' +
      'distribuable ») : ni échec, ni adresse', bilan);
  });
  await essai('B.2', async () => {
    // L'écran ne reconnaît pas CLAMART (jeton de participation sans marque) : il l'envoie ; le serveur, seul juge, le refuse.
    const b = await banc({ jetonSansMarque: true });
    const r = await b.jouer(() => groupe(b));
    const resume = b.dialogues[0] || '';
    const rep = (de(r, 'envoyerInvitationsGroupe')[0] || {}).reponse || {};
    t.vrai(/• 2 recevront l'invitation\n/.test(resume) && resume.indexOf('démonstration') === -1 &&
      json(rep.demo_non_distribuables) === json(['CLAMART']) && json(adresses(b)) === json(['club-a@example.invalid']) &&
      message(b) === '✅ 1 invitation(s) envoyée(s). ' + LIGNE_BILAN && !/échec/.test(message(b)) && !/@/.test(message(b)) && /ko/.test(ton(b)),
    'B.2 serveur seul juge : CLAMART que l\'écran ne reconnaît pas part dans la demande, le serveur le refuse — bilan « ✅ 1 invitation(s) ' +
      'envoyée(s). ⚠️ 1 non envoyée(s) — adresse de démonstration non distribuable… : CLAMART. », ni « échec » ni adresse, aucun e-mail vers elle',
    [resume, message(b), adresses(b)]);
  });
  await essai('B.3', async () => {
    const b = await banc();
    await b.jouer(() => groupe(b));
    t.vrai(message(b) === '✅ 1 invitation(s) envoyée(s). ' + LIGNE_BILAN && adresses(b).indexOf(DEMO_CLAMART) === -1 &&
      json(adresses(b)) === json(['club-a@example.invalid']),
    'B.3 CLAMART signalé d\'avance : un seul e-mail (le club réel), jamais vers l\'adresse réservée ; le bilan le nomme encore, avec la raison ' +
      'que le serveur confirme — sans « échec »', [message(b), adresses(b)]);
  });

  /* ============================== V — réponse perdue ============================== */
  console.log('\nV — réponse perdue : la vérification ne présente jamais un club Démo comme confirmé');
  await essai('V.1', async () => {
    const stockage = new Map();
    const b = await banc({ stockageSession: stockage, panne: premiere('envoyerInvitationsGroupe', 'http404-apres') });
    const r = await b.jouer(() => groupe(b));
    const lecture = de(r, 'getSendGroupStatus')[0] || { corps: {} };
    t.vrai(de(r, 'envoyerInvitationsGroupe').length === 1 && json(lecture.corps.clubs) === json(['CLUB FICTIF A']) &&
      /^✅ Envoi groupé confirmé : 1\/1 /.test(message(b)) && b.srv.courrielsEnvoyes() === 1,
    'V.1 404 après l\'envoi : UNE lecture groupée qui ne vise que le club réel (CLAMART, signalé d\'avance, n\'est ni envoyé ni vérifié) → ' +
      '« ✅ Envoi groupé confirmé : 1/1 » ; un seul POST groupé', [r.resume, lecture.corps.clubs, message(b)]);
  });
  await essai('V.2', async () => {
    const b = await banc({ jetonSansMarque: true, panne: premiere('envoyerInvitationsGroupe', 'http404-apres') });
    const r = await b.jouer(() => groupe(b));
    const s = (de(r, 'getSendGroupStatus')[0] || {}).reponse || {};
    t.vrai(json(s.confirmes) === json(['CLUB FICTIF A']) && json(s.absents) === json(['CLAMART']) &&
      /^⚠️ Envoi partiel : 1 confirmé\(s\) sur 2 ; 1 non confirmé\(s\) — aucune trace d’envoi : CLAMART /.test(message(b)) &&
      !/✅/.test(message(b)) && b.srv.courrielsEnvoyes() === 1,
    'V.2 CLAMART que seul le serveur reconnaît, réponse perdue : lu « absent », dit « non confirmé — aucune trace d\'envoi », jamais « confirmé » ; ' +
      'un seul e-mail (le club réel)', [s, message(b)]);
  });

  /* ============================== N — non-régression ============================== */
  console.log('\nN — non-régression : sans club Démo, tout est identique à la référence');
  await essai('N.1', async () => {
    const jouer = async (lire) => {
      const b = await B.banc({ lire, backend: CODE, monde: monde({ sansJeu: true }) });
      const r = await b.jouer(() => groupe(b));
      return { dialogues: b.dialogues.slice(), message: message(b), ton: ton(b), actions: r.requetes.map((q) => q.action),
        corps: de(r, 'envoyerInvitationsGroupe').map((q) => { const c = Object.assign({}, q.corps); delete c.id_envoi; return c; }), mails: adresses(b) };
    };
    const av = await jouer(LECTEUR_AVANT), ap = await jouer(LIRE);
    t.vrai(json(av) === json(ap) && ap.mails.length === 3 && /^✅ 3 invitation\(s\) envoyée\(s\)\.$/.test(ap.message),
      'N.1 trois clubs réels, aucun club Démo : résumé avant confirmation, requêtes (corps hors identifiant), e-mails, bilan et ton IDENTIQUES à ' +
        'la référence ' + FRONTEND_AVANT_REV.slice(0, 7), [av, ap].map((x) => json(x).slice(0, 400)));
  });
  await essai('N.2', async () => {
    const b = await banc();
    const a = await B.banc({ lire: LECTEUR_AVANT, backend: CODE, monde: monde({}) });
    const entrees = [{}, { non_envoyes: ['X'] }, { en_cours: ['X', 'Y'], recents: ['Z'] }, { non_confirmes: ['W'], suivi_a_jour: false, avertissements: ['A1'] },
      { non_envoyes: [], en_cours: [], non_confirmes: [], recents: [] }];
    const ecarts = entrees.filter((e) => b.global('messageEnvoisNonServis')(e) !== a.global('messageEnvoisNonServis')(e));
    t.vrai(ecarts.length === 0, 'N.2 `messageEnvoisNonServis` sans le nouveau champ : texte identique à la référence sur ' + entrees.length + ' réponses', ecarts);
  });
  await essai('N.3', async () => {
    const jouer = async (lire) => {
      const b = await B.banc({ lire, backend: CODE, monde: monde({}) });
      const r = await b.jouer(() => b.global('envoyerInvitationClubUI')('CLAMART'));
      return { dialogues: b.dialogues.slice(), actions: r.requetes.map((q) => q.action), mails: adresses(b) };
    };
    const av = await jouer(LECTEUR_AVANT), ap = await jouer(LIRE);
    t.vrai(json(av) === json(ap) && ap.actions.length === 0 && /adresse de démonstration non distribuable/.test(ap.dialogues[0] || ''),
      'N.3 invitation INDIVIDUELLE de CLAMART : même refus qu\'à la référence (alerte, aucune requête, aucun e-mail)', [av, ap]);
  });
  await essai('N.4', async () => {
    const b = await banc();
    const r = await b.jouer(() => Promise.all([groupe(b), groupe(b)]));
    t.vrai(de(r, 'envoyerInvitationsGroupe').length === 1 && b.dialogues.length === 1 && b.srv.courrielsEnvoyes() === 1,
      'N.4 double clic sur « Envoyer » (avec un club Démo) : UN résumé, UN POST groupé, un e-mail', [r.resume, b.dialogues.length]);
  });

  console.log('\n' + (process.exitCode ? 'ÉCHEC' : 'OK — ' + t.n + ' contrôles MAIL-GROUPE-DEMO-01 (frontend) passés.'));
})().catch((e) => { console.error(e); process.exitCode = 1; });
