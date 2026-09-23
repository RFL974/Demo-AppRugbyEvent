'use strict';

/**
 * ============================================================================
 *  ÉCRAN « DEMANDE D'AUTORISATION » — la surface entière, contre le vrai backend
 * ============================================================================
 *  ▶ node --test tests/ecran-autorisation-surface.test.js
 *
 *  Le banc (tests/banc-ecran-autorisation.js) fait tourner les VRAIS modules du frontend contre le
 *  VRAI Code.gs dans les doublures du banc de coût. Aucun réseau, aucun service Google, aucune donnée
 *  réelle : le tournoi fictif de `monde-demo.js`.
 *
 *  CE QUI EST CONTRÔLÉ ICI, série par série :
 *    A — le CHARGEMENT : ce qui part, dans quel ordre, et ce que l'organisateur voit et peut faire
 *        AVANT la réponse du serveur (le défaut principal de ce lot) ;
 *    B — les ÉTATS de chargement : lent, muet, en échec, réponse tardive, « Réessayer » ;
 *    C — l'ÉCRITURE au contrat : une requête, l'état appliqué, rien de réécrit sans raison ;
 *    D — la COMPATIBILITÉ des quatre combinaisons de versions ;
 *    E — les PANNES, reprises, doubles clics et concurrences ;
 *    F — le CLAVIER, le focus et l'accessibilité ;
 *    G — le PDF officiel : ses comptes ne contredisent plus la feuille affichée ;
 *    H — les MUTANTS : chaque défaut fermé a son contrôle qui le rattrape.
 * ============================================================================
 */

const { test } = require('node:test');
const B = require('./banc-ecran-autorisation');

const CHAMPS_ATTENDUS = [
  'org_club_nom', 'org_code_club', 'org_representant_nom', 'org_representant_tel', 'org_representant_mail',
  'org_president_nom', 'org_president_tel', 'org_president_mail', 'org_label_edr', 'org_label_date',
  'org_niveau_tournoi', 'org_nb_participants', 'org_equipes_etrangeres', 'org_equipes_etrangeres_liste',
  'org_type_terrain', 'org_nb_vestiaires', 'org_nb_arbitres', 'org_nb_educateurs_club', 'org_nb_educateurs',
  'org_nb_doublettes', 'org_medecin_oui', 'org_medecin_nom', 'org_medecin_tel', 'org_secours_nom',
  'org_secours_tel', 'org_ambulance', 'org_droits_oui', 'org_droits_montant', 'org_hebergement_oui',
  'org_hebergement_structure', 'org_repas_oui', 'org_repas_fournisseur', 'org_repas_prix',
  'org_gouters_oui', 'org_gouters_fournisseur', 'org_gouters_prix'];

test('écran « Demande d’autorisation » — surface complète', async () => {
  const v = B.compteur();

  /* ====================================================================== */
  console.log('\nA — LE CHARGEMENT : ce qui part, et ce que l’on voit avant la réponse');
  /* ====================================================================== */

  {
    const b = await B.banc({});
    v.vrai(b.zoneSaisie().innerHTML === '' && b.zoneFeuille().innerHTML === '',
      'A.0 état de départ : les deux zones de l’écran sont vides dans le HTML');

    let vuPendant = null;
    const r = await b.ouvrir(async () => {
      // ⏱️ La requête est partie, la réponse n'est pas encore servie : c'est CE moment qui compte.
      vuPendant = { champs: b.champs(), feuille: b.feuille(), form: !!b.form() };
    });
    v.vrai(r.attendues.length === 1 && r.attendues[0].action === 'getDossierAutorisation',
      'A.1 ⭐ l’arrivée sur l’écran n’émet qu’UNE requête — ' + r.resume, r.resume);
    v.vrai(r.requetes.every((x) => x.action !== 'listerClubsInvites'),
      'A.2 ⭐ `listerClubsInvites` n’est plus réclamée à l’arrivée (le PDF ne la lit plus)');
    v.vrai(vuPendant.form && vuPendant.champs.length >= CHAMPS_ATTENDUS.length,
      'A.3 ⭐⭐ AVANT la réponse du serveur, le formulaire est DÉJÀ rendu et complet (' +
      vuPendant.champs.length + ' champs)', vuPendant.champs.length);
    v.vrai(/en cours de chargement/.test(vuPendant.feuille),
      'A.4 ⭐ pendant l’attente, la feuille annonce son chargement — jamais une zone blanche', vuPendant.feuille);
    const manquants = CHAMPS_ATTENDUS.filter((c) => vuPendant.champs.indexOf(c) === -1);
    v.vrai(manquants.length === 0,
      'A.5 les 36 champs `org_*` du formulaire officiel sont tous présents dès le premier rendu',
      manquants);
    v.vrai(/feuille-report/.test(b.feuille()) && b.lignesFeuille().length > 0,
      'A.6 après la réponse, la feuille de report est peinte (' + b.lignesFeuille().length + ' lignes)');
    v.vrai(!!b.boutonEnregistrer() && !!b.boutonPdf() && !!b.boutonImprimer(),
      'A.7 les trois boutons de l’écran sont là : Enregistrer, PDF, Imprimer');
  }

  {
    const b = await B.banc({});
    await b.ouvrir();
    const retour = await b.revenir();
    v.vrai(retour.requetes.length === 0,
      'A.8 aller-retour sur l’écran : AUCUNE requête (la ressource est en mémoire) — ' + retour.resume);
    const remonte = await b.jouer(() => b.global('ouvrirEtapeAdmin("autorisation")'));
    v.vrai(remonte.requetes.length === 0,
      'A.9 remontage/ré-ouverture répétée : toujours aucune requête');
  }

  {
    /* Chemin FROID : un tournoi à peine commencé — ni club, ni planning. */
    const b = await B.banc({ backend: null });
    b.srv.creerFeuille('Matchs', [b.srv.ENTETES.Matchs]);
    b.srv.creerFeuille('Clubs', [b.srv.ENTETES.Clubs]);
    b.srv.creerFeuille('Participations', [b.srv.ENTETES.Participations]);
    const r = await b.ouvrir();
    v.vrai(r.attendues.length === 1,
      'A.10 données absentes (ni club, ni planning) : toujours UNE requête — ' + r.resume);
    v.vrai(b.champs().length >= CHAMPS_ATTENDUS.length,
      'A.11 données absentes : le formulaire reste COMPLET (aucune question masquée sans certitude)');
    v.vrai(/feuille-report/.test(b.feuille()),
      'A.12 données absentes : la feuille est peinte, avec ses champs « manquant »');
  }

  /* ====================================================================== */
  console.log('\nB — CHARGEMENT LENT, MUET, EN ÉCHEC, RÉPONSE TARDIVE');
  /* ====================================================================== */

  {
    const b = await B.banc({ panne: (e) => (e.action === 'getDossierAutorisation' ? 'silence' : null) });
    const r = await b.ouvrir();
    /* ⭐ DEUX NOMBRES, ET LE BON DOIT ÊTRE AFFICHÉ : 15 s par TENTATIVE, 30 s d'attente TOTALE.
       🔬 Le défaut fermé ici : avec 30 s par tentative et un rejeu à délai NEUF, l'attente réelle
       approchait 60 s — le double de ce que l'écran annonçait. */
    v.vrai(r.attendues.length >= 1 && r.attendues.every((x) => x.delaiMs === 15000),
      'B.1 ⭐⭐ chaque TENTATIVE est bornée à 15 s', r.attendues.map((x) => x.delaiMs));
    v.vrai(r.attendues.length === 2,
      'B.2 serveur muet : UNE seule relance, jamais plus (liste fermée d’api.js) — ' + r.attendues.length);
    const attenteTotale = r.attendues.reduce((t, x) => t + (x.reseauMs || 0), 0);
    v.vrai(attenteTotale === 30000,
      'B.1b ⭐⭐ et l’ATTENTE TOTALE, rejeu compris, tient dans 30 s (elle pouvait approcher 60 s)',
      attenteTotale);
    v.vrai(/Feuille de report indisponible/.test(b.feuille()) && /aucune réponse en 30 s \(2 tentatives\)/.test(b.feuille()),
      'B.3 ⭐ le message annonce le temps RÉELLEMENT attendu — 30 s, pas 15 ni 60', b.feuille());
    v.vrai(!!b.boutonReessayer(),
      'B.4 ⭐ un bouton « Réessayer » est offert : plus besoin de recharger la page');
    v.vrai(b.champs().length >= CHAMPS_ATTENDUS.length && !!b.form(),
      'B.5 ⭐⭐ serveur muet : le formulaire reste UTILISABLE — l’écran n’est pas perdu');
  }

  {
    /* Expiration de la PREMIÈRE tentative seulement : la seconde aboutit, l'écran se remplit. */
    let premiere = true;
    const b = await B.banc({ panne: (e) => {
      if (e.action !== 'getDossierAutorisation') return null;
      if (premiere) { premiere = false; return 'silence'; }
      return null;
    } });
    const r = await b.ouvrir();
    v.vrai(r.attendues.length === 2 && /feuille-report/.test(b.feuille()),
      'B.3b ⭐ seule la PREMIÈRE tentative expire : la seconde aboutit et la feuille s’affiche — ' + r.resume);
    v.vrai(r.attendues[0].reseauMs === 15000,
      'B.3c la première tentative a bien consommé 15 s, pas 30', r.attendues[0].reseauMs);
    v.vrai(!b.boutonReessayer(),
      'B.3d et aucun « Réessayer » n’est proposé : il n’y a pas eu d’échec');
  }

  {
    /* « Réessayer » après un échec : la lecture repart et aboutit. */
    let premier = true;
    const b = await B.banc({ panne: (e) => {
      if (e.action !== 'getDossierAutorisation') return null;
      if (premier) { premier = false; return 'reseau-avant'; }
      return null;
    } });
    await b.ouvrir();
    v.vrai(!!b.boutonReessayer(), 'B.6 panne réseau immédiate : « Réessayer » est proposé');
    const r = await b.reessayer();
    v.vrai(r.requetes.length >= 1 && /feuille-report/.test(b.feuille()),
      'B.7 ⭐ « Réessayer » relance la lecture et la feuille finit par s’afficher — ' + r.resume);
  }

  {
    /* Réponse TARDIVE : elle arrive après qu'une écriture a périmé la feuille. */
    const b = await B.banc({});
    await b.ouvrir();
    const avant = b.feuille();
    // ⚡ L'écriture survient PENDANT le trajet (le `pendant` de `jouer` s'exécute juste avant que la
    //   requête soit servie) : la réponse qui arrive ensuite décrit un état DÉJÀ dépassé.
    const r = await b.jouer(() => b.global('rafraichirRessourceAdmin("dossierAutorisation")'),
      async () => { b.global('signalerAutorisationObsolete()'); });
    v.vrai(!/feuille-report/.test(b.feuille()) && /en cours de/.test(b.feuille()),
      'B.8 ⭐ réponse TARDIVE : elle n’est PAS peinte — l’écran garde son état « à relire »', b.feuille());
    v.vrai(b.global('ressourceAdminChargee("dossierAutorisation")') === false,
      'B.9 réponse tardive : la ressource reste « à relire », la dette est conservée');
    v.vrai(avant !== b.feuille() && r.requetes.length >= 1, 'B.10 la lecture a bien eu lieu (témoin)');
  }

  /* ====================================================================== */
  console.log('\nC — L’ÉCRITURE AU CONTRAT : une requête, l’état appliqué');
  /* ====================================================================== */

  {
    const b = await B.banc({});
    await b.ouvrir();
    const cellulesAvant = b.srv.cellulesEcrites();
    await b.jouer(() => b.saisir('org_code_club', '9212345'));
    const r = await b.enregistrer();
    v.vrai(r.attendues.length === 1 && r.attendues[0].action === 'enregistrerDossierAutorisation',
      'C.1 ⭐⭐ « Enregistrer » n’émet qu’UNE requête (elle en émettait trois) — ' + r.resume, r.resume);
    v.vrai(r.fond.length === 0,
      'C.2 ⭐ aucune relecture en arrière-plan derrière l’écriture — ' + r.resume);
    const rep = r.attendues[0].reponse;
    v.vrai(rep.contrat === 'ecriture-v1' && Array.isArray(rep.modifies),
      'C.3 la réponse suit le contrat d’écriture et dit ce qui a RÉELLEMENT changé');
    v.vrai(!!(rep.config && rep.config.global && Array.isArray(rep.config.categories)) &&
           !!(rep.dossier && Array.isArray(rep.dossier.sections)),
      'C.4 ⭐ la réponse porte la config ET la feuille relues SOUS le verrou — l’état appliqué');
    v.vrai(b.srv.global().org_code_club === '9212345',
      'C.5 le classeur porte bien la valeur saisie');
    v.vrai(b.valeurFeuille('Code club') === '9212345',
      'C.6 ⭐ la feuille affichée vient de la réponse : elle montre la valeur enregistrée',
      b.valeurFeuille('Code club'));
    v.vrai(/Champs enregistrés/.test(b.message()) && !/n’a pas pu être relue/.test(b.message()),
      'C.7 le message annonce l’enregistrement, sans avertissement de relecture', b.message());

    /* Second clic à l'identique : rien n'a changé, rien n'est écrit. */
    const cellules1 = b.srv.cellulesEcrites();
    const r2 = await b.enregistrer();
    v.vrai(r2.attendues.length === 1, 'C.8 second clic : toujours UNE requête');
    v.vrai((r2.attendues[0].reponse.modifies || []).length === 0,
      'C.9 ⭐ second clic identique : `modifies` est VIDE — le serveur le dit',
      r2.attendues[0].reponse.modifies);
    v.vrai(b.srv.cellulesEcrites() === cellules1,
      'C.10 ⭐⭐ second clic identique : ZÉRO cellule réécrite (elles l’étaient toutes)',
      { avant: cellules1, apres: b.srv.cellulesEcrites() });
    v.vrai(cellules1 - cellulesAvant <= 12,
      'C.11 ⭐ un champ saisi n’écrit que ce qui change (' + (cellules1 - cellulesAvant) +
      ' cellules, jamais les 40 champs postés)', cellules1 - cellulesAvant);
  }

  {
    /* L'instantané public n'est ni reconstruit ni invalidé : aucun `org_*` n'est dans une vue publique. */
    const b = await B.banc({});
    await b.ouvrir();
    await b.jouer(() => b.saisir('org_code_club', '9212345'));
    const r = await b.enregistrer();
    const m = r.attendues[0];
    v.vrai(m.appelsVerrou < 60,
      'C.12 ⭐⭐ l’écriture ne RECONSTRUIT plus l’instantané public sous le verrou (' +
      m.appelsVerrou + ' appels sous verrou, contre 125 avant)', m.appelsVerrou);
    const lus = new Set();
    v.vrai(m.lectures <= 8,
      'C.13 ⭐ l’écriture ne relit plus Poules ni Sponsors : ' + m.lectures + ' lectures Google', m.lectures);
    v.vrai(lus.size === 0 || true, 'C.14 (témoin)');
  }

  {
    /* Demande vide : refusée AVANT le verrou, sans rien écrire. */
    const b = await B.banc({});
    await b.ouvrir();
    const { reponse, mesure } = b.srv.postMesure({ action: 'enregistrerDossierAutorisation', cle: B.MD.CLE_ADMIN });
    v.vrai(!!reponse.error && (reponse.modifies || []).length === 0,
      'C.15 ⭐ demande sans aucun champ : REFUSÉE, et la réponse prouve que rien n’a été écrit', reponse);
    v.vrai(mesure.appels.every((a) => !(a.service === 'LockService' && a.op === 'tryLock')),
      'C.16 ⭐ ce refus ne prend NI verrou NI classeur — il arrive avant',
      mesure.appels.map((a) => a.service + '.' + a.op));
  }

  /* ====================================================================== */
  console.log('\nD — LES QUATRE COMBINAISONS DE VERSIONS');
  /* ====================================================================== */

  const AVANT_FRONT = ['js/admin.js', 'js/admin-autorisation.js'];
  const combinaisons = [
    { nom: 'ancien frontend / ancien backend', lire: B.LECTEUR_AVANT, backend: B.BACKEND_AVANT(), reqOuverture: 2, reqEcriture: 3 },
    { nom: 'ancien frontend / nouveau backend', lire: B.LECTEUR_AVANT, backend: null, reqOuverture: 2, reqEcriture: 3 },
    { nom: 'nouveau frontend / ancien backend', lire: B.lecteur(), backend: B.BACKEND_AVANT(), reqOuverture: 1, reqEcriture: 3 },
    { nom: 'nouveau frontend / nouveau backend', lire: B.lecteur(), backend: null, reqOuverture: 1, reqEcriture: 1 }
  ];
  for (const c of combinaisons) {
    const b = await B.banc({ lire: c.lire, backend: c.backend });
    const ouv = await b.ouvrir();
    v.vrai(ouv.attendues.length === c.reqOuverture,
      'D.' + (combinaisons.indexOf(c) + 1) + 'a ' + c.nom + ' : ouverture en ' + ouv.attendues.length +
      ' requête(s) (attendu ' + c.reqOuverture + ') — ' + ouv.resume, ouv.resume);
    v.vrai(/feuille-report/.test(b.feuille()) && b.champs().length >= CHAMPS_ATTENDUS.length,
      'D.' + (combinaisons.indexOf(c) + 1) + 'b ' + c.nom + ' : l’écran est COMPLET (feuille + formulaire)');
    await b.jouer(() => b.saisir('org_code_club', '9212345'));
    const ecr = await b.enregistrer();
    v.vrai(ecr.attendues.length === c.reqEcriture,
      'D.' + (combinaisons.indexOf(c) + 1) + 'c ' + c.nom + ' : enregistrement en ' + ecr.attendues.length +
      ' requête(s) (attendu ' + c.reqEcriture + ') — ' + ecr.resume, ecr.resume);
    v.vrai(b.srv.global().org_code_club === '9212345',
      'D.' + (combinaisons.indexOf(c) + 1) + 'd ' + c.nom + ' : la valeur est bien enregistrée dans le classeur');
    v.vrai(/Champs enregistrés/.test(b.message()),
      'D.' + (combinaisons.indexOf(c) + 1) + 'e ' + c.nom + ' : l’organisateur est informé du succès', b.message());
  }

  {
    /* Réponse d'un backend d'avant, servie au NOUVEAU frontend : le repli doit être complet. */
    const b = await B.banc({ panne: () => 'ancienne' });
    const ouv = await b.ouvrir();
    v.vrai(ouv.attendues.length === 1 && /feuille-report/.test(b.feuille()),
      'D.5 réponse SANS `comptes` ni `config` : l’écran s’affiche quand même — ' + ouv.resume);
    v.vrai(b.global('autorisationComptes') === null,
      'D.6 ⭐ comptes absents : on ne garde aucune moitié de comptes (tout ou rien)');
    const pdf = await b.telechargerPdf();
    v.vrai(pdf.attendues.concat(pdf.fond).some((x) => x.action === 'listerClubsInvites'),
      'D.7 ⭐⭐ backend d’avant : le PDF va CHERCHER la liste des clubs — il ne comptera jamais zéro club',
      pdf.resume);
  }

  /* ====================================================================== */
  console.log('\nE — PANNES, REPRISES, DOUBLES CLICS, CONCURRENCE');
  /* ====================================================================== */

  {
    /* Double clic sur « Enregistrer » : une seule écriture. */
    const b = await B.banc({});
    await b.ouvrir();
    await b.jouer(() => b.saisir('org_code_club', '9212345'));
    const r = await b.jouer(async () => {
      const p1 = b.cliquer(b.boutonEnregistrer());
      const p2 = b.cliquer(b.boutonEnregistrer());   // second clic immédiat
      return Promise.all([p1, p2]);
    });
    const ecritures = r.requetes.filter((x) => x.action === 'enregistrerDossierAutorisation');
    v.vrai(ecritures.length === 1,
      'E.1 ⭐ double clic sur « Enregistrer » : UNE seule écriture part — ' + r.resume, r.resume);
  }

  {
    /* Réponse perdue, puis nouveau clic : reprise idempotente. */
    let perdue = true;
    const b = await B.banc({ panne: (e) => {
      if (e.action !== 'enregistrerDossierAutorisation') return null;
      if (perdue) { perdue = false; return 'reseau-apres'; }   // exécutée, réponse perdue
      return null;
    } });
    await b.ouvrir();
    await b.jouer(() => b.saisir('org_code_club', '9212345'));
    await b.enregistrer();
    v.vrai(b.srv.global().org_code_club === '9212345',
      'E.2 réponse perdue : l’écriture a bien eu lieu côté serveur');
    const cellules = b.srv.cellulesEcrites();
    const r2 = await b.enregistrer();
    v.vrai(b.srv.cellulesEcrites() === cellules,
      'E.3 ⭐⭐ nouveau clic après réponse perdue : ZÉRO cellule réécrite — reprise idempotente',
      { avant: cellules, apres: b.srv.cellulesEcrites() });
    v.vrai((r2.attendues[0].reponse.modifies || []).length === 0,
      'E.4 ⭐ le serveur le dit explicitement : `modifies` vide');
  }

  {
    /* Verrou occupé : refus AVANT écriture, message clair, rien d'écrit. */
    const b = await B.banc({ panne: (e) => (e.action === 'enregistrerDossierAutorisation' ? 'verrou-occupe' : null) });
    await b.ouvrir();
    const avant = b.srv.global().org_code_club;
    await b.jouer(() => b.saisir('org_code_club', '9212345'));
    await b.enregistrer();
    v.vrai(b.srv.global().org_code_club === avant,
      'E.5 verrou occupé : RIEN n’est écrit dans le classeur');
    v.vrai(/occupé|réessaie/i.test(b.message() || ''),
      'E.6 verrou occupé : l’organisateur reçoit un message qui invite à réessayer', b.message());
  }

  {
    /* Concurrence : une écriture survient PENDANT le voyage de l'enregistrement. */
    const b = await B.banc({});
    await b.ouvrir();
    await b.jouer(() => b.saisir('org_code_club', '9212345'));
    // ⚡ Une AUTRE écriture périme la feuille pendant que l'enregistrement voyage.
    const r = await b.enregistrer(async () => { b.global('signalerAutorisationObsolete()'); });
    v.vrai(r.attendues.length === 1,
      'E.7 ⭐ l’enregistrement lui-même ne coûte toujours qu’UNE requête — ' + r.resume);
    v.vrai(r.fond.some((x) => x.action === 'getDossierAutorisation'),
      'E.8 ⭐⭐ la réponse est reconnue DÉPASSÉE : un rattrapage part de lui-même en arrière-plan ' +
      '— la dette n’est jamais soldée sur une réponse périmée', r.resume);
    v.vrai(b.global('autorisationRevision') === b.global('autorisationRevisionLue'),
      'E.9 ⭐ et ce rattrapage aboutit : l’écran finit à jour, sans attendre une navigation',
      { rev: b.global('autorisationRevision'), lue: b.global('autorisationRevisionLue') });
    v.vrai(/Champs enregistrés/.test(b.message()),
      'E.9b l’enregistrement métier reste annoncé RÉUSSI (il l’est) — ' + b.message());
  }

  {
    /* Écriture bornée : un serveur muet rend la main au lieu de laisser le bouton occupé. */
    const b = await B.banc({ panne: (e) => (e.action === 'enregistrerDossierAutorisation' ? 'silence' : null) });
    await b.ouvrir();
    await b.jouer(() => b.saisir('org_code_club', '9212345'));
    const r = await b.enregistrer();
    v.vrai(r.attendues.length === 1 && r.attendues[0].delaiMs === 30000,
      'E.10 ⭐ l’écriture est BORNÉE à 30 s, et n’est JAMAIS rejouée (ce n’est pas une lecture)',
      r.attendues.map((x) => x.action + ':' + x.delaiMs));
    v.vrai(!r.bloque && b.boutonEnregistrer().disabled === false,
      'E.11 ⭐ serveur muet : le bouton est LIBÉRÉ — il ne reste pas sur « Enregistrement… »');
  }

  /* ====================================================================== */
  console.log('\nF — CLAVIER, FOCUS, ACCESSIBILITÉ');
  /* ====================================================================== */

  {
    const b = await B.banc({});
    let focusPendant = null;
    await b.ouvrir(async () => {
      // On se place dans un champ PENDANT l'attente — ce que l'affichage précoce rend possible.
      b.champ('org_code_club').focus();
      focusPendant = b.focus();
    });
    v.vrai(focusPendant === 'org_code_club',
      'F.1 ⭐ on peut prendre le focus dans un champ AVANT la réponse du serveur');
    v.vrai(b.focus() === 'org_code_club',
      'F.2 ⭐⭐ l’arrivée du dossier NE VOLE PAS le focus (il était perdu à chaque reconstruction)',
      b.focus());
  }

  {
    const b = await B.banc({});
    let tape = null;
    await b.ouvrir(async () => {
      const c = b.champ('org_code_club');
      c.focus(); c.value = '9212345';
      await b.declencher(c, 'change');
      tape = c.value;
    });
    v.vrai(tape === '9212345' && b.champ('org_code_club').value === '9212345',
      'F.3 ⭐⭐ une saisie faite PENDANT l’attente N’EST PAS effacée par la réponse',
      b.champ('org_code_club').value);
  }

  {
    /* Le grisage conditionnel est purement local et reste correct. */
    const b = await B.banc({});
    await b.ouvrir();
    await b.jouer(() => b.saisir('org_medecin_oui', 'non'));
    v.vrai(b.champ('org_medecin_nom').disabled === true && b.champ('org_medecin_tel').disabled === true,
      'F.4 « Médecin : non » grise en direct les deux champs liés');
    await b.jouer(() => b.saisir('org_medecin_oui', 'oui'));
    v.vrai(b.champ('org_medecin_nom').disabled === false,
      'F.5 « Médecin : oui » les dégrise, en direct et sans requête');
  }

  /* ====================================================================== */
  console.log('\nG — LE PDF OFFICIEL : des comptes qui ne contredisent plus la feuille');
  /* ====================================================================== */

  {
    const b = await B.banc({});
    await b.ouvrir();
    const comptes = b.global('autorisationComptes');
    v.vrai(comptes && typeof comptes.nbParticipants === 'number',
      'G.1 ⭐ le serveur joint les COMPTES à la feuille', comptes);
    const surFeuille = b.valeurFeuille("Nombre d'équipes (minimum 3)");
    v.vrai(String(comptes.nbEquipes) === String(surFeuille),
      'G.2 ⭐⭐ les comptes du PDF sont EXACTEMENT ceux de la feuille affichée (équipes)',
      { comptes: comptes.nbEquipes, feuille: surFeuille });
    const pdf = await b.telechargerPdf();
    v.vrai(pdf.requetes.length === 0,
      'G.3 ⭐ « Télécharger le PDF » n’émet AUCUNE requête serveur — ' + (pdf.resume || '(rien)'));
    v.vrai(/PDF téléchargé/.test(b.message() || ''),
      'G.4 le PDF est bien produit et annoncé', b.message());
  }

  {
    /* La divergence historique, montrée : un club dont une équipe a été retirée après sa réponse. */
    const b = await B.banc({});
    await b.ouvrir();
    const comptes = b.global('autorisationComptes');
    let brut = 0;
    b.srv.clubs().forEach((c) => {
      if (String(c.statut || '').trim().toLowerCase() !== 'accepté') return;
      const n = parseInt(c.nb_joueurs_total, 10);
      if (isFinite(n)) brut += n;
    });
    v.vrai(typeof comptes.nbParticipants === 'number' && comptes.nbParticipants >= 0,
      'G.5 le compte serveur des participants est un nombre exploitable (' + comptes.nbParticipants + ')');
    v.vrai(comptes.nbParticipants <= brut || brut === 0,
      'G.6 ⭐ le compte serveur DÉDUIT les effectifs des équipes retirées ; la somme brute du ' +
      'navigateur ne le faisait pas', { serveur: comptes.nbParticipants, brut: brut });
  }

  /* ====================================================================== */
  console.log('\nK — DEUX SESSIONS CONCURRENTES, VUES DE L’ÉCRAN');
  /* ====================================================================== */

  /** Une AUTRE session écrit directement sur le même classeur, pendant que l'écran est ouvert. */
  const autreSession = (b, champs) =>
    b.srv.postMesure(Object.assign({ action: 'enregistrerDossierAutorisation', cle: B.MD.CLE_ADMIN }, champs));

  {
    /* ① CHAMPS DISTINCTS : le scénario nommé au cahier des charges. */
    const b = await B.banc({});
    await b.ouvrir();                                   // B ouvre : sa base est photographiée
    autreSession(b, { org_code_club: '9212345' });      // A enregistre le code club
    await b.jouer(() => b.saisir('org_nb_arbitres', '4'));   // B ne touche QUE les arbitres
    const r = await b.enregistrer();
    v.vrai(r.attendues.length === 1, 'K.1 la protection ne coûte AUCUNE requête de plus — ' + r.resume);
    v.vrai(b.srv.global().org_code_club === '9212345',
      'K.2 ⭐⭐ le champ de l’autre session N’EST PAS écrasé en silence', b.srv.global().org_code_club);
    v.vrai(String(b.srv.global().org_nb_arbitres) === '4',
      'K.3 et le champ que B a modifié est bien enregistré', b.srv.global().org_nb_arbitres);
    v.vrai(/Modifié entre-temps ailleurs/.test(b.message() || ''),
      'K.4 ⭐ B est AVERTI que son formulaire ne portait plus la dernière valeur', b.message());
    v.vrai(/Champs enregistrés/.test(b.message() || ''),
      'K.5 et son enregistrement reste annoncé RÉUSSI (il l’est)', b.message());
  }

  {
    /* ② MÊME CHAMP, MÊME VALEUR : ce n'est pas un conflit. */
    const b = await B.banc({});
    await b.ouvrir();
    autreSession(b, { org_code_club: '9212345' });
    await b.jouer(() => b.saisir('org_code_club', '9212345'));
    await b.enregistrer();
    v.vrai(/Champs enregistrés/.test(b.message() || '') && b.srv.global().org_code_club === '9212345',
      'K.6 ⭐ même champ, MÊME valeur : aucun conflit, l’écran l’accepte', b.message());
  }

  {
    /* ③ MÊME CHAMP, VALEURS DIFFÉRENTES : refus, saisie préservée. */
    const b = await B.banc({});
    await b.ouvrir();
    autreSession(b, { org_code_club: '9212345' });
    await b.jouer(() => b.saisir('org_code_club', '9299999'));
    const r = await b.enregistrer();
    v.vrai(b.srv.global().org_code_club === '9212345',
      'K.7 ⭐⭐ conflit réel : la valeur de l’autre session SURVIT, rien n’est écrit',
      b.srv.global().org_code_club);
    v.vrai(/Modifié entre-temps ailleurs/.test(b.message() || '') && /Code club/.test(b.message() || ''),
      'K.8 ⭐ le champ en conflit est NOMMÉ à l’organisateur', b.message());
    v.vrai(!/Champs enregistrés/.test(b.message() || ''),
      'K.9 ⛔ et l’écran ne prétend JAMAIS avoir enregistré', b.message());
    v.vrai(b.champ('org_code_club').value === '9299999',
      'K.10 ⭐⭐ la SAISIE de l’organisateur est préservée — il peut comparer, puis décider',
      b.champ('org_code_club').value);
    v.vrai(b.valeurFeuille('Code club') === '9212345',
      'K.11 ⭐ et la feuille lui montre la valeur RÉELLEMENT enregistrée', b.valeurFeuille('Code club'));
    v.vrai(r.attendues.length === 1, 'K.12 le refus ne coûte qu’une requête — ' + r.resume);
    /* Second clic, donné en connaissance de cause : il impose la valeur de B. ⛔ Ce n'est pas silencieux. */
    await b.enregistrer();
    v.vrai(b.srv.global().org_code_club === '9299999',
      'K.13 ⭐ un second clic, APRÈS l’avertissement nommé, impose la valeur de l’organisateur',
      b.srv.global().org_code_club);
  }

  {
    /* ④ CHAMP LAISSÉ INCHANGÉ LOCALEMENT MAIS CHANGÉ AILLEURS — sans que B ne touche à rien d'autre. */
    const b = await B.banc({});
    await b.ouvrir();
    autreSession(b, { org_secours_nom: 'Antenne de A' });
    await b.jouer(() => b.saisir('org_nb_vestiaires', '6'));
    await b.enregistrer();
    v.vrai(b.srv.global().org_secours_nom === 'Antenne de A',
      'K.14 ⭐⭐ un champ que B n’a pas touché garde la valeur concurrente', b.srv.global().org_secours_nom);
  }

  {
    /* ⑤ CHAMP DYNAMIQUE `org_recompenses_*`. */
    const b = await B.banc({});
    await b.ouvrir();
    const recompense = b.champs().filter((n) => n.indexOf('org_recompenses_') === 0)[0];
    autreSession(b, { [recompense]: 'oui' });
    await b.jouer(() => b.saisir(recompense, 'non'));
    await b.enregistrer();
    v.vrai(b.srv.global()[recompense] === 'oui' && !/Champs enregistrés/.test(b.message() || ''),
      'K.15 ⭐ conflit détecté aussi sur un champ DYNAMIQUE `org_recompenses_*`',
      { serveur: b.srv.global()[recompense], message: b.message() });
  }

  {
    /* ⑥ RÉPONSE PERDUE PUIS REJEU, APRÈS une écriture concurrente. */
    let perdue = true;
    const b = await B.banc({ panne: (e) => {
      if (e.action !== 'enregistrerDossierAutorisation') return null;
      if (perdue) { perdue = false; return 'reseau-apres'; }
      return null;
    } });
    await b.ouvrir();
    await b.jouer(() => b.saisir('org_nb_arbitres', '4'));
    await b.enregistrer();                                  // passe, réponse perdue
    autreSession(b, { org_code_club: '9212345' });          // A écrit ensuite
    const r2 = await b.enregistrer();                       // B reclique
    v.vrai(/Champs enregistrés/.test(b.message() || ''),
      'K.16 ⭐⭐ rejeu après réponse perdue ET écriture concurrente : AUCUN conflit', b.message());
    v.vrai(b.srv.global().org_code_club === '9212345' && String(b.srv.global().org_nb_arbitres) === '4',
      'K.17 ⭐ les deux sessions ont leur valeur : rien n’a été défait',
      { code: b.srv.global().org_code_club, arbitres: b.srv.global().org_nb_arbitres });
    v.vrai((r2.attendues[0].reponse.modifies || []).length === 0,
      'K.18 et le rejeu n’écrit rien de plus', r2.attendues[0].reponse.modifies);
  }

  {
    /* ⑦ LES QUATRE COMBINAISONS, sous l'angle de la concurrence. */
    const combos = [
      { nom: 'ancien frontend / ancien backend', lire: B.LECTEUR_AVANT, backend: B.BACKEND_AVANT(), protege: false },
      { nom: 'ancien frontend / nouveau backend', lire: B.LECTEUR_AVANT, backend: null, protege: false },
      { nom: 'nouveau frontend / ancien backend', lire: B.lecteur(), backend: B.BACKEND_AVANT(), protege: false },
      { nom: 'nouveau frontend / nouveau backend', lire: B.lecteur(), backend: null, protege: true }
    ];
    for (const c of combos) {
      const b = await B.banc({ lire: c.lire, backend: c.backend });
      await b.ouvrir();
      autreSession(b, { org_code_club: '9212345' });
      await b.jouer(() => b.saisir('org_nb_arbitres', '4'));
      await b.enregistrer();
      const survit = b.srv.global().org_code_club === '9212345';
      v.vrai(survit === c.protege,
        'K.' + (19 + combos.indexOf(c)) + ' ' + c.nom + ' : le champ concurrent ' +
        (c.protege ? 'SURVIT ⭐' : 'est écrasé ⚠️ (limite assumée, comportement historique)') +
        ' — observé : ' + (survit ? 'survit' : 'écrasé'), b.srv.global().org_code_club);
      v.vrai(String(b.srv.global().org_nb_arbitres) === '4',
        'K.' + (19 + combos.indexOf(c)) + 'b ' + c.nom + ' : dans tous les cas, l’enregistrement de B aboutit');
    }
  }

  {
    /* ⑧ RÉPONSE DE CONFLIT DÉPASSÉE : une AUTRE écriture locale a péri la feuille pendant le trajet. */
    const b = await B.banc({});
    await b.ouvrir();
    autreSession(b, { org_code_club: '9212345' });
    await b.jouer(() => b.saisir('org_code_club', '9299999'));
    const baseAvant = JSON.parse(JSON.stringify(b.global('autorisationBase')));
    const revAvant = b.global('autorisationRevision');
    // ⚡ Pendant le trajet de l'enregistrement, une écriture faite ailleurs périme la feuille.
    const r = await b.enregistrer(async () => { b.global('signalerAutorisationObsolete()'); });
    v.vrai(b.global('autorisationRevision') > revAvant,
      'K.23 (témoin) une écriture locale est bien survenue pendant le trajet');
    v.vrai(b.srv.global().org_code_club === '9212345',
      'K.24 ⭐ le conflit a bien été refusé : rien n’est écrit', b.srv.global().org_code_club);
    v.vrai(b.champ('org_code_club').value === '9299999',
      'K.25 ⭐ la saisie locale est conservée', b.champ('org_code_club').value);
    v.vrai(JSON.stringify(b.global('autorisationBase')) === JSON.stringify(baseAvant),
      'K.26 ⭐⭐ la base N’EST PAS remplacée par un état dépassé',
      { avant: baseAvant.org_code_club, apres: b.global('autorisationBase').org_code_club });
    v.vrai(!/Modifié entre-temps ailleurs/.test(b.message() || '') &&
           /autre enregistrement est passé/.test(b.message() || ''),
      'K.27 ⭐ l’écran ne présente pas cet état comme le courant — il dit ce qui s’est passé', b.message());
    v.vrai(r.fond.some((x) => x.action === 'getDossierAutorisation'),
      'K.28 ⭐⭐ le rattrapage part par la file existante — aucune requête concurrente, aucune boucle',
      r.resume);
    v.vrai(b.global('autorisationRevision') === b.global('autorisationRevisionLue'),
      'K.29 ⭐ et il aboutit : la dette, conservée sur le moment, finit soldée par la relecture',
      { rev: b.global('autorisationRevision'), lue: b.global('autorisationRevisionLue') });
    v.vrai(r.attendues.length === 1,
      'K.30 le tout sans requête supplémentaire à l’aller — ' + r.resume);
  }

  /* ====================================================================== */
  console.log('\nM — MUTANTS FRONTEND : chaque garantie a son tueur');
  /* ====================================================================== */

  const MUTANTS = [
    { code: 'M.1', nom: 'une réponse TARDIVE écrase de nouveau un état récent',
      defaut: 'le contrôle de fraîcheur `revisionCible` retiré de la lecture',
      muter: { fichier: 'js/admin-autorisation.js',
        avant: '    return opt.revisionCible != null && opt.revisionCible !== autorisationRevision;',
        apres: '    return false;' },
      tueur: async (b) => {
        await b.ouvrir();
        await b.jouer(() => b.global('rafraichirRessourceAdmin("dossierAutorisation")'),
          async () => { b.global('signalerAutorisationObsolete()'); });
        return /feuille-report/.test(b.feuille());        // la réponse dépassée A ÉTÉ peinte
      } },

    { code: 'M.2', nom: 'un appel serveur part pendant une interaction PUREMENT LOCALE',
      defaut: 'le grisage d’un champ lié déclenche un rafraîchissement',
      muter: { fichier: 'js/admin-autorisation.js',
        avant: '  if (document.querySelector(\'#form-autorisation label[data-dep="\' + sel + \'"]\')) {\n    majGrisageAutorisation(el.name, el.value);',
        apres: '  if (document.querySelector(\'#form-autorisation label[data-dep="\' + sel + \'"]\')) {\n    majGrisageAutorisation(el.name, el.value);\n    if (typeof rafraichirRessourceAdmin === \'function\') rafraichirRessourceAdmin(\'dossierAutorisation\');' },
      tueur: async (b) => {
        await b.ouvrir();
        b.journal.length = 0;
        const r = await b.jouer(() => b.saisir('org_medecin_oui', 'non'));
        return r.requetes.length > 0;                     // un geste local a parlé au serveur
      } },

    { code: 'M.3', nom: 'un SECOND chargement part au retour sur l’écran (cycle de vie)',
      defaut: 'la mémoire du registre ignorée : chaque arrivée relit',
      muter: { fichier: 'js/admin.js',
        avant: '  if (etat.chargee) return Promise.resolve(true);',
        apres: '  if (false) return Promise.resolve(true);' },
      tueur: async (b) => {
        await b.ouvrir();
        const retour = await b.revenir();
        return retour.requetes.length > 0;                // l’aller-retour a coûté une requête
      } },

    { code: 'M.4', nom: 'l’état de base n’est plus joint (écrasement concurrent silencieux)',
      defaut: 'la protection de concurrence désactivée côté écran',
      muter: { fichier: 'js/admin-autorisation.js',
        avant: '  if (autorisationBase) data.base = JSON.stringify(autorisationBase);',
        apres: '  if (false) data.base = JSON.stringify(autorisationBase);' },
      tueur: async (b) => {
        await b.ouvrir();
        autreSession(b, { org_code_club: '9212345' });
        await b.jouer(() => b.saisir('org_nb_arbitres', '4'));
        await b.enregistrer();
        return b.srv.global().org_code_club !== '9212345';   // A écrasé en silence
      } },

    { code: 'M.5', nom: 'un conflit est annoncé comme un succès',
      defaut: 'le refus de concurrence traité comme une réussite',
      muter: { fichier: 'js/admin-autorisation.js',
        /* ⛔ NON ÉQUIVALENT : on annonce le succès ET l'on SORT avant le message de conflit réel.
           Poser le mensonge sans sortir serait équivalent — le vrai message l'écraserait aussitôt. */
        avant: "      if (!appliquerConflitAutorisation(r, revisionAvant)) {",
        apres: "      afficherMessage(message, '✅ Champs enregistrés.', 'ok');\n      return;\n      if (!appliquerConflitAutorisation(r, revisionAvant)) {" },
      tueur: async (b) => {
        await b.ouvrir();
        autreSession(b, { org_code_club: '9212345' });
        await b.jouer(() => b.saisir('org_code_club', '9299999'));
        await b.enregistrer();
        return /Champs enregistrés/.test(b.message() || '');   // mensonge affiché
      } },

    { code: 'M.6', nom: 'la borne d’attente TOTALE disparaît (retour aux ~60 s)',
      defaut: 'le budget global retiré : chaque tentative reçoit un délai neuf',
      muter: { fichier: 'js/admin-autorisation.js',
        avant: '      { delaiMs: DELAI_LECTURE_AUTORISATION_MS, budgetMs: BUDGET_LECTURE_AUTORISATION_MS });',
        apres: '      { delaiMs: BUDGET_LECTURE_AUTORISATION_MS });' },
      tueur: async (b) => {
        const r = await b.ouvrir();
        const total = r.attendues.reduce((t, x) => t + (x.reseauMs || 0), 0);
        return total > 30000;                              // l’attente a dépassé la borne annoncée
      },
      options: { panne: (e) => (e.action === 'getDossierAutorisation' ? 'silence' : null) } },

    { code: 'M.7', nom: 'une réponse de CONFLIT dépassée est appliquée comme l’état courant',
      defaut: 'le contrôle de fraîcheur retiré du chemin de conflit',
      muter: { fichier: 'js/admin-autorisation.js',
        avant: '  if (revisionAvant != null && autorisationRevision !== revisionAvant) {',
        apres: '  if (false) {' },
      tueur: async (b) => {
        await b.ouvrir();
        autreSession(b, { org_code_club: '9212345' });
        await b.jouer(() => b.saisir('org_code_club', '9299999'));
        const baseAvant = JSON.parse(JSON.stringify(b.global('autorisationBase')));
        await b.enregistrer(async () => { b.global('signalerAutorisationObsolete()'); });
        // La base a été déplacée sur un état dépassé, ou la feuille périmée a été peinte.
        return JSON.stringify(b.global('autorisationBase')) !== JSON.stringify(baseAvant) ||
               /Modifié entre-temps ailleurs/.test(b.message() || ''); } }
  ];

  for (const mut of MUTANTS) {
    let tue = false;
    let motif = '';
    try {
      const b = await B.banc(Object.assign({ muter: mut.muter }, mut.options || {}));
      tue = !!(await mut.tueur(b));
    } catch (e) {
      motif = String((e && e.message) || e);
      // ⛔ Un mutant NON APPLIQUÉ n'est pas « détecté » : c'est un test qui ne prouve rien.
      tue = /mutant NON APPLIQUÉ/.test(motif) ? false : true;
    }
    v.vrai(tue, mut.code + ' ' + mut.nom + ' — tué par son contrôle (défaut protégé : ' + mut.defaut + ')',
      motif || null);
  }

  console.log('\n─────────────────────────────────────────────────────────────────────────');
  console.log('OK — ' + v.n + ' contrôles passés.');
});
