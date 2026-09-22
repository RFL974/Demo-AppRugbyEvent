#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « INVITER UN CLUB » — surface complète et jeu de démonstration, vrais modules contre le vrai Code.gs
 * ============================================================================
 *  ▶ node tests/ecran-invitation-surface.test.js [--frontend avant|<racine>] [--backend avant|<Code.gs>]
 *
 *  Principe : un geste local ne fait AUCUN appel ; chaque geste serveur garde sa séquence (relevée ici, requête par
 *  requête) ; le jeu de démonstration se crée d'UN clic depuis l'onglet « Clubs invités », en UNE requête, et les trois
 *  écrans — Clubs invités, Suivi des clubs, Équipes — se mettent à jour depuis la réponse, sans relecture, en concordance
 *  exacte avec l'oracle écrit à la main (backend/tests/banc-cout/jeu-demo-attendu.js).
 *    I — inventaire des contrôles (statiques et créés par le rendu), place du bouton ;   L — gestes locaux : zéro appel ;
 *    G — chaque geste serveur de l'écran : séquence réelle et message ;
 *    D — le jeu : un clic, les 21 équipes, les totaux, la concordance des trois écrans, second clic, double clic, Entrée
 *        pendant l'envoi, annulation ;
 *    P — pannes : réponse perdue, silence, délai, 400 / 404 / 409 / 500, verrou occupé, réponse incomplète ;
 *    K — données existantes incompatibles ou partielles ;   C — écran concurrent ;   B — brouillons conservés ;
 *    X — versions mêlées (backend d'avant, frontend d'avant, caches mêlés) ;   R — réinitialisation depuis l'écran ;
 *  2ᵉ passage du lot (toutes les écritures de l'écran, pas seulement le jeu) :
 *    W — chaque écriture de l'écran : délai borné, issue incertaine (404, 400, 409, 500, réseau, silence, verrou occupé)
 *        dite « non confirmée », JAMAIS renvoyée, interface libérée, relecture sûre, saisies conservées ;
 *    E — e-mails : jamais avec des valeurs non enregistrées, bouton occupé, double clic = un e-mail, nouvel envoi après
 *        une issue incertaine confirmé, délai d'un e-mail (90 s) et de l'envoi groupé (proportionnel au nombre de clubs) ;   S — « Suivi des clubs » suit un changement de statut sans relecture ;
 *    A — clavier : zones de dépôt, badge « Écart », Échap / Entrée en édition, focus rendu après reconstruction ;
 *    F — « Rafraîchir » relit clubs et configuration sans écraser un brouillon ; navigation sans appel inutile ;
 *    N — « Ajouter les équipes au tournoi » sur un club du jeu : les 21 noms restent exacts ;
 *    H — club déjà au carnet : contact conservé et différence dite.
 *  3ᵉ passage : J — « Nouveau lien » (classeur non migré) : le jeton renouvelé d'un club du jeu garde « demo-racing- », celui
 *    d'un club réel reste ordinaire ; contact modifié puis réinitialisation : tout le club fictif part, le club réel reste ;
 *    double déclenchement ignoré, réponse perdue / muette / réseau coupé, anciennes versions et caches mêlés.
 *  4ᵉ passage : Q — les gestes de la liste des clubs (ajouter, coordonnées, retrait, équipes, envoi groupé) appliquent la liste
 *    relue que porte la réponse : une requête (retrait : aperçu + retrait), plus de relecture, navigation suivante sans appel ;
 *    réponse sans ces listes (backend d'avant) : relecture comme avant, même état final ; R.2–R.5 — réinitialisation bornée
 *    (180 s), jamais renvoyée, écran relu et message honnête après une issue inconnue ; refus lisible inchangé.
 *    (« Une frappe locale = zéro appel », exhaustif : tests/ecran-invitation-zero-appel.test.js.)
 *  5ᵉ passage : Y — e-mails hors verrou : chaque geste d'e-mail porte un identifiant (`id_envoi`), repris tel quel après une
 *    issue incertaine (réponse perdue APRÈS l'envoi → « déjà partie, rien n'a été renvoyé » ; AVANT → envoyé une fois) ; refus
 *    « déjà partie » d'un autre écran → confirmation explicite puis UN renvoi, ou rien ; envoi en cours ailleurs → refus sans
 *    proposition ; envoi groupé partiel → chaque club non servi nommé ; ancien backend, ancien frontend, caches mêlés.
 *  Contre-épreuve : `--frontend avant --backend avant` (références FIGÉES a8d549424f6161962b35a476946d09e81b5c988b /
 *  0fcf9f1367719ff8074f722f41fabe0e09e9fbf0, jamais HEAD) doit faire tomber I.1, D, P, K, B et X.
 *  ⛔ Aucun réseau, aucun service Google réel ; tournoi fictif.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const B = require('./banc-ecran-invitation');
const BC = require('./banc-ecran-categories');
const ATTENDU = B.MI.ATTENDU;

const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
const LIRE = arg('frontend') === 'avant' ? B.LECTEUR_AVANT : arg('frontend') ? B.lecteur(path.resolve(arg('frontend'))) : B.lecteur();
const CODE = arg('backend') === 'avant' ? B.BACKEND_AVANT() : arg('backend') ? fs.readFileSync(path.resolve(arg('backend')), 'utf8')
  : fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');
const t = BC.compteur();
const banc = (o) => B.banc(Object.assign({ lire: LIRE, backend: CODE }, o || {}));
const essai = async (code, fn) => { try { await fn(); } catch (e) { t.vrai(false, code + ' (exception) ' + String(e && e.message || e).slice(0, 240)); } };
const json = JSON.stringify;
const actions = (r) => r.requetes.map((q) => q.action);
const demoCree = (m) => m.postMesure({ action: 'creerJeuDemoRacing', cle: B.MI.CLE_ADMIN }).reponse;

/* Inventaire DÉCLARÉ des contrôles statiques de l'écran (trois onglets). ⛔ Toute évolution d'une carte se déclare ICI. */
const INVENTAIRE = {
  'bloc-modalites': ['form:form-modalites:', 'input:tarif_engagement_oui:checkbox', 'input:tarif_engagement_montant:text',
    'select:tarif_engagement_mode:select-one', 'textarea:tarif_engagement_modalites:', 'input:date_limite_confirmation:date',
    'button:bouton-enregistrer-modalites:button'],
  'bloc-reponse': ['form:form-reponse:', 'input:date_limite_reponse:date', 'input:contact_reponse_nom:text', 'input:contact_reponse_tel:tel',
    'input:contact_reponse_email:email', 'input:email_expediteur:email', 'button:bouton-enregistrer-reponse:button'],
  'bloc-contacts-securite': ['form:form-contacts-securite:', 'input:referent_nom:text', 'input:referent_tel:tel',
    'input:securite_secours_oui:checkbox', 'input:securite_secours_precisions:text', 'input:securite_referent_identique:checkbox',
    'input:securite_referent_nom:text', 'input:securite_referent_tel:tel', 'button:bouton-enregistrer-contacts:button'],
  'bloc-surplace': ['form:form-surplace:', 'input:buvette_disponible:checkbox', 'input:espace_sandwich_disponible:checkbox',
    'input:boutique_disponible:checkbox', 'input:repas_sur_place_oui:checkbox', 'input:repas_sur_place_mode:radio',
    'input:repas_sur_place_montant:number', 'input:repas_sur_place_mode:radio', 'input:repas_sur_place_mode:radio',
    'input:gouter_fin_tournoi_oui:checkbox', 'input:gouter_fin_tournoi_mode:radio', 'input:gouter_fin_tournoi_montant:number',
    'input:gouter_fin_tournoi_mode:radio', 'input:gouter_fin_tournoi_mode:radio', 'button:bouton-enregistrer-surplace:button'],
  'bloc-apercu-invitation': ['input:apercu-invitation-objet:text', 'textarea:apercu-invitation-intro:', 'iframe:apercu-invitation-rendu:',
    'button:bouton-regenerer-invitation:button', 'button:bouton-envoyer-invitations:button'],
  'bloc-pieces-jointes-invitation': ['input:pieces-jointes-invitation:file', 'button:bouton-vider-pieces-invitation:button'],
  'bloc-parking': ['form:form-parking:', 'input:parking_texte:text', 'input:parking_photo:file', 'button:bouton-retirer-parking:button',
    'button:bouton-enregistrer-parking:button'],
  'bloc-encadrement': ['form:form-encadrement:', 'input:encadrement_ratio:text', 'input:encadrement_diplomes:text',
    'input:assurance_attestation_requise:checkbox', 'button:bouton-enregistrer-encadrement:button'],
  'bloc-pieces-jointes-dossier': ['input:pieces-jointes-dossier:file', 'button:bouton-vider-pieces-dossier:button'],
  'bloc-dossier': [],
  'bloc-apercu-dossier-email': ['select:apercu-dossier-email-club:select-one', 'input:apercu-dossier-email-objet:text',
    'textarea:apercu-dossier-email-intro:', 'iframe:apercu-dossier-email-rendu:'],
  'bloc-clubs-invites': ['form:form-club-invite:', 'input:champ-club-nom:text', 'input:champ-club-contact:text',
    'input:champ-club-prenom:text', 'input:champ-club-email:email', 'button:bouton-ajouter-club:submit',
    'details:chargement-equipes-demo:', 'summary:DémonstrationCréer les clubs, leur suivi:', 'button:bouton-charger-equipes-demo:button']
};
const releverStatique = (doc, bloc) => doc.getElementById(bloc).querySelectorAll('form, input, select, textarea, button, details, summary, iframe, a')
  .map((e) => [e.tag, e.id || e.name || e.textContent.trim().slice(0, 40), e.tag === 'input' || e.tag === 'button' ? e.type : (e.tag === 'select' ? 'select-one' : '')].join(':'));
/* Contrôles créés par le rendu d'une ligne de club (Accepté : panneau d'ajout des équipes ; en attente : ligne seule). */
const LIGNE_ACCEPTE = ['button:bouton-inviter-club', 'button:bouton-editer-club', 'select:statut-club', 'button:bouton-suppr-club',
  'input:club-cat-case', 'input:club-cat-case', 'input:club-cat-case', 'input:club-cat-case', 'input:club-cat-case', 'input:club-prenom-input',
  'button:bouton-cats-club'];
const LIGNE_ATTENTE = ['button:bouton-inviter-club', 'button:bouton-editer-club', 'select:statut-club', 'button:bouton-suppr-club'];
const releverLigne = (ligne) => ligne.querySelectorAll('input, select, button, textarea').map((e) => e.tag + ':' + (e.getAttribute('class') || '').split(' ').filter((c) => /^(bouton-|statut-|club-)/.test(c)).pop());

/* Ce que montrent les trois écrans (le DOM, pas la mémoire). */
function ecrans(b) {
  const clubs = b.doc.querySelectorAll('#liste-clubs-invites .club-invite-item').map((l) => ({ nom: l.getAttribute('data-club'),
    contact: (l.querySelector('.club-contact') || { textContent: '' }).textContent, etat: (l.querySelector('.club-etat-badge') || { textContent: '' }).textContent,
    reponse: (l.querySelector('.club-reponse') || { textContent: '' }).textContent }));
  const suivi = b.doc.querySelectorAll('#liste-suivi-clubs .suivi-club-ligne').map((l) => l.getAttribute('data-club'));
  const equipes = b.doc.querySelectorAll('#liste-equipes .equipe-item').map((l) => {
    const c = l.querySelectorAll('[role="cell"]');
    const nom = c[0].querySelector('.nom') ? c[0].querySelector('.nom').texte : c[0].textContent;
    return { nom: String(c[0].textContent).replace(/déclarés par le club$/, ''), club: c[1].textContent, categorie: c[2].textContent,
      joueurs: c[3].textContent, educateurs: c[4].textContent, _: nom };
  });
  return { clubs, suivi, equipes, resume: (b.doc.getElementById('suivi-clubs-resume') || { textContent: '' }).textContent };
}
const ATTENDUES_ECRAN = ATTENDU.EQUIPES.map((e) => [e.nom_equipe, e.club, e.categorie, String(e.joueurs), String(e.educateurs)]).map(json).sort();
const CLUBS_JEU = ATTENDU.CLUBS_AVEC_EQUIPES.concat(['RC PUTEAUX', 'RC BOULOGNE', 'RC SAINT-CLOUD']).sort();

(async () => {
  /* ============================== I — inventaire ============================== */
  console.log('\nI — inventaire des contrôles');
  await essai('I', async () => {
    const b = await banc();
    const bouton = b.boutonDemo();
    t.vrai(!!bouton && b.sectionDe(bouton) === 'bloc-clubs-invites' && !b.doc.getElementById('bloc-equipes').querySelector('#bouton-charger-equipes-demo') &&
      !!b.doc.getElementById('message-jeu-demo') && b.doc.getElementById('message-jeu-demo').getAttribute('aria-live') === 'polite',
      'I.1 le bouton du jeu vit dans « Inviter un club » (carte Clubs invités), avec son message annoncé ; plus rien dans « Équipes »', b.sectionDe(bouton));
    const ecransJs = LIRE('js/ecrans.js');
    t.vrai(!/\['chargement-equipes-demo'/.test(ecransJs) && /blocs:\['bloc-clubs-invites'\]/.test(ecransJs.replace(/\s/g, '')),
      'I.2 le mode écrans ne déplace plus le jeu vers « Équipes » ; « Clubs invités » reste l\'onglet de la carte', '');
    const releve = {};
    Object.keys(INVENTAIRE).forEach((bloc) => { releve[bloc] = releverStatique(b.doc, bloc); });
    t.vrai(json(releve) === json(INVENTAIRE), 'I.3 inventaire exhaustif des contrôles statiques des trois onglets : aucun contrôle nouveau ou disparu',
      Object.keys(INVENTAIRE).filter((k) => json(releve[k]) !== json(INVENTAIRE[k])).map((k) => [k, releve[k]]));
    t.vrai(!b.erreurBranchement, 'I.4 tous les écouteurs de la page se branchent (aucun nom manquant)', b.erreurBranchement);
    await b.demo();
    const accepte = B.clubLigne(b, 'CLAMART');
    const attente = B.clubLigne(b, 'RC BOULOGNE');
    t.vrai(json(releverLigne(accepte)) === json(LIGNE_ACCEPTE) && json(releverLigne(attente)) === json(LIGNE_ATTENTE),
      'I.5 contrôles créés par le rendu : ligne « Accepté » (envoyer, crayon, statut, retirer, 5 catégories, prénom, ajouter les équipes) et ligne en attente',
      [releverLigne(accepte), releverLigne(attente)]);
  });

  /* ============================== L — gestes locaux ============================== */
  console.log('\nL — gestes locaux : zéro appel');
  await essai('L', async () => {
    const b = await banc({ monde: B.MI.amorcerClubs });
    const pas = async (code, libelle, geste) => { const r = await b.jouer(geste); t.vrai(r.requetes.length === 0, code + ' ' + libelle + ' : aucun appel', r.resume); };
    await pas('L.1', 'crayon (coordonnées en édition)', () => B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-editer-club')));
    await pas('L.2', 'annuler l\'édition', () => B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.btn-annuler-edition')));
    const panneau = B.clubLigne(b, 'CLUB FICTIF B').querySelector('.club-panneau');
    await pas('L.3', 'décocher une catégorie engagée', () => { const c = panneau.querySelector('.club-cat-case'); c.checked = false; return b.declencher(c, 'change'); });
    await pas('L.4', 'saisir le prénom du panneau', () => { const c = panneau.querySelector('.club-prenom-input'); c.value = 'B2'; return b.declencher(c, 'change'); });
    await pas('L.5', '« Régénérer » l\'aperçu de l\'e-mail', () => b.cliquer(b.id('bouton-regenerer-invitation')));
    await pas('L.6', 'modifier l\'intro de l\'aperçu (aperçu en direct)', () => { b.id('apercu-invitation-intro').value = 'Bonjour à tous'; return b.declencher(b.id('apercu-invitation-intro'), 'input'); });
    await pas('L.7', 'Entrée dans un formulaire de carte (soumission bloquée)', () => b.declencher(b.id('form-modalites'), 'submit'));
    await pas('L.8', 'choisir le club de l\'aperçu du dossier final', () => b.declencher(b.id('apercu-dossier-email-club'), 'change'));
    await pas('L.9', 'annuler la confirmation du jeu de démonstration', async () => { b.ctx.dialogConfirmer = async () => false; await b.cliquerDemo(); });
    t.vrai(!b.boutonDemo().disabled && b.srv.equipes().length === 0, 'L.10 après une annulation : bouton disponible, rien créé', '');
  });

  /* ============================== G — chaque geste serveur ============================== */
  console.log('\nG — gestes serveur de l\'écran : séquences réelles');
  await essai('G', async () => {
    const lignes = await B.gestesEcran({ lire: LIRE, backend: CODE });
    const SEQ = {
      A1: 'listerClubsInvites', A2: 'enregistrerInvitation', A3: 'enregistrerReponseInvitation', A4: 'enregistrerContactsSecurite',
      A5: 'enregistrerSurPlace', A6: 'envoyerInvitationsGroupe', B1: 'enregistrerInvitation',
      B2: 'enregistrerInvitation,enregistrerPhotoParking', B3: 'supprimerPhotoParking', B4: 'enregistrerInvitation',
      // ⭐ 4ᵉ passage : la réponse porte la liste relue sous le verrou — plus de relecture après un succès.
      C1: 'ajouterClubInvite', C2: 'modifierStatutClubInvite', C3: 'envoyerInvitationClub',
      C4: 'modifierClubInvite', C5: 'supprimerClubInvite,supprimerClubInvite',
      C6: 'enregistrerCategoriesEngagees' };
    lignes.resultats.forEach((x) => {
      t.vrai(actions(x.r).join() === SEQ[x.code] && !x.r.requetes.some((q) => q.reponse && q.reponse.error) && (x.code === 'A1' || /✅|🗑️/.test(x.message)),
        'G.' + x.code + ' ' + x.nom.replace(/^[A-Z]\d\. /, '') + ' : ' + SEQ[x.code].split(',').join(' → '), [actions(x.r), x.message.slice(0, 120)]);
    });
    const ecritures = [].concat.apply([], lignes.resultats.map((x) => x.r.ecritures.map((q) => [x.code, q.action, q.delaiMs])));
    // Délai attendu : 30 s (cartes, clubs) ; 90 s (un e-mail) ; envoi groupé : 90 s + 30 s par club visé (ici 1 éligible).
    const DELAI = { envoyerInvitationClub: 90000, envoyerInvitationsGroupe: 120000 };
    const horsDelai = ecritures.filter((e) => e[2] !== (DELAI[e[1]] || 30000));
    t.vrai(ecritures.length >= 14 && !horsDelai.length && ecritures.some((e) => e[1] === 'envoyerInvitationsGroupe') && ecritures.some((e) => e[1] === 'envoyerInvitationClub'),
      'G.T chaque écriture de l\'écran part avec un délai client BORNÉ (30 s ; e-mail 90 s ; envoi groupé 90 s + 30 s par club) — aucune ne peut pendre indéfiniment', horsDelai);
    const sourceInv = LIRE('js/admin-invitations.js').replace(/\/\*[\s\S]*?\*\//g, '');
    const nues = (sourceInv.match(/ecrireAdmin\('([A-Za-z]+)'/g) || []).map((s) => s.slice(13, -1)).filter((a) => ['creerJeuDemoRacing', 'listerClubsInvites'].indexOf(a) === -1);
    t.vrai(nues.length === 0, 'G.U toutes les écritures de admin-invitations.js passent par l\'écriture bornée (ecrireInvitation) — seul le jeu garde la sienne', nues);
  });

  /* ============================== D — le jeu de démonstration ============================== */
  console.log('\nD — le jeu de démonstration');
  await essai('D', async () => {
    const b = await banc();
    let pendantEnvoi = null;
    const r = await b.demo(async (n) => {
      if (n !== 0) return;
      const bouton = b.boutonDemo();
      pendantEnvoi = { desactive: bouton.disabled, occupe: bouton.getAttribute('aria-busy'), texte: bouton.textContent };
      await b.cliquerDemo();                                    // clic ou Entrée PENDANT l'envoi
      await b.global('onCreerJeuDemo')();                        // appel direct (Entrée sur un bouton resté actif)
    });
    t.vrai(actions(r).join() === 'creerJeuDemoRacing' && r.attendues.length === 1 && r.fond.length === 0 && r.requetes[0].delaiMs === 30000,
      'D.1 un clic sur un tournoi vide : UNE requête (creerJeuDemoRacing), bloquante, délai 30 s, aucune relecture', r.resume);
    t.vrai(pendantEnvoi && pendantEnvoi.desactive && pendantEnvoi.occupe === 'true' && /Création/.test(pendantEnvoi.texte),
      'D.2 pendant l\'envoi : bouton désactivé, occupé, libellé « Création… » ; clic et Entrée n\'envoient rien de plus', pendantEnvoi);
    const msg = b.texte('message-jeu-demo');
    t.vrai(/✅ Jeu de démonstration créé/.test(msg) && msg.indexOf('U10 : 10 équipes, 118 joueurs, 14 éducateurs · U12 : 11 équipes, 209 joueurs, 20 éducateurs — total : 21 équipes, 327 joueurs, 34 éducateurs') !== -1,
      'D.3 message : totaux RELUS par le serveur — U10 10/118/14, U12 11/209/20, total 21/327/34', msg);
    const v = ecrans(b);
    t.vrai(json(v.clubs.map((c) => c.nom).sort()) === json(CLUBS_JEU) && !v.clubs.some((c) => /RACING|CHATENAY/.test(c.nom)),
      'D.4 « Clubs invités » : les 12 clubs du jeu, ni RACING 92 (organisateur) ni CHATENAY-MALABRY', v.clubs.map((c) => c.nom));
    t.vrai(v.clubs.filter((c) => ATTENDU.CLUBS_AVEC_EQUIPES.indexOf(c.nom) !== -1).length === 9 &&
      v.clubs.filter((c) => ATTENDU.CLUBS_AVEC_EQUIPES.indexOf(c.nom) !== -1).every((c) => c.etat === 'Équipes ajoutées') &&
      v.clubs.every((c) => c.contact === 'Contact Démo – ' + c.nom + ' · ' + 'demo-' + c.nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '@example.invalid'),
      'D.5 chaque club accepté est « Équipes ajoutées » ; contacts fictifs « Contact Démo – CLUB · demo-club@example.invalid »', v.clubs.slice(0, 3));
    t.vrai(json(v.suivi.slice().sort()) === json(CLUBS_JEU) && /2\s*Réponses attendues\s*9\s*Participants\s*1\s*Ne participent pas/.test(v.resume),
      'D.6 « Suivi des clubs » : les mêmes 12 clubs — 2 réponses attendues, 9 participants, 1 refus', [v.suivi, v.resume]);
    t.vrai(json(v.equipes.map((e) => json([e.nom, e.club, e.categorie, e.joueurs, e.educateurs])).sort()) === json(ATTENDUES_ECRAN),
      'D.7 « Équipes » : les 21 lignes exactes — nom, club, catégorie, joueurs, éducateurs', v.equipes.map((e) => [e.nom, e.club, e.categorie, e.joueurs, e.educateurs]));
    // Concordance : ce que Clubs invités annonce pour chaque club = ce que l'écran Équipes lui rattache.
    const conc = ATTENDU.CLUBS_AVEC_EQUIPES.map((nom) => {
      const siennes = v.equipes.filter((e) => e.club === nom);
      const club = v.clubs.find((c) => c.nom === nom);
      const parCat = {};
      siennes.forEach((e) => { parCat[e.categorie] = (parCat[e.categorie] || 0) + 1; });
      const annonce = Object.keys(parCat).sort().map((c) => c + ' : ' + parCat[c] + ' équipe' + (parCat[c] > 1 ? 's' : '')).join(' · ');
      const joueurs = siennes.reduce((s, e) => s + Number(e.joueurs), 0), educ = siennes.reduce((s, e) => s + Number(e.educateurs), 0);
      return [nom, !!club && club.reponse.indexOf(annonce) !== -1 && club.reponse.indexOf(joueurs + ' joueurs attendus') !== -1 &&
        club.reponse.indexOf(educ + ' éducateur') !== -1];
    });
    t.vrai(conc.every((c) => c[1]), 'D.8 concordance : pour chaque club, catégories, nombre d\'équipes, joueurs et éducateurs identiques entre « Clubs invités » et « Équipes »',
      conc.filter((c) => !c[1]));
    t.vrai(b.srv.equipes().length === 21 && json(b.global('clubsInvitesCourants')) === json(b.srv.clubs()) &&
      json(b.global('equipesCourantes')) === json(b.srv.equipes()),
      'D.9 la mémoire de l\'écran EST l\'état du serveur (clubs et équipes), sans relecture', '');
    const nav = await b.jouer(async () => { await b.global('ouvrirEtapeAdmin')('invitation'); await b.global('ouvrirEtapeAdmin')('suivi-clubs'); });
    t.vrai(nav.requetes.length === 0, 'D.10 aller sur « Inviter » puis « Suivi » après le jeu : aucune relecture (ressource posée depuis la réponse)', nav.resume);
    t.vrai(!b.boutonDemo().disabled && b.boutonDemo().getAttribute('aria-busy') === null && b.boutonDemo().textContent === 'Démo — Créer le jeu de démonstration',
      'D.11 bouton rendu, libellé d\'origine', b.boutonDemo().textContent);
    t.vrai(/21/.test(b.texte('tb-equipes') || ''), 'D.12 tableau de bord à jour (21 équipes)', b.texte('tb-equipes'));
    const rev = b.global('autorisationRevision');
    const r2 = await b.demo();
    t.vrai(actions(r2).join() === 'creerJeuDemoRacing' && json(r2.requetes[0].reponse.modifies) === '[]' && /déjà en place/.test(b.texte('message-jeu-demo')) &&
      json(ecrans(b).equipes) === json(v.equipes) && b.global('autorisationRevision') === rev,
      'D.13 second clic : une requête, rien écrit (modifies []), « déjà en place », écrans identiques, demande d\'autorisation non invalidée', [r2.resume, b.texte('message-jeu-demo')]);
    // Une lecture de la liste des clubs partie AVANT le jeu, et dont la réponse (ancienne) arrive APRÈS : la réponse du
    // jeu, plus récente, doit rester à l'écran (file du registre des ressources).
    const o = await banc({ panne: (e) => (e.action === 'listerClubsInvites' ? 'retarder' : null) });
    o.global("marquerRessourceAdmin('clubsInvites', false)");
    await o.jouer(async () => { const nav = o.global('ouvrirEtapeAdmin')('invitation'); await BC.tour(); await o.cliquerDemo(); await nav; });
    t.vrai(ecrans(o).clubs.length === 12 && json(o.global('clubsInvitesCourants')) === json(o.srv.clubs()),
      'D.16 lecture de navigation partie avant le jeu et arrivée après : l\'écran garde l\'état le plus récent (12 clubs), jamais l\'ancien', ecrans(o).clubs.length);
    const d = await banc();
    const dbl = await d.jouer(() => Promise.all([d.cliquerDemo(), d.cliquerDemo()]));
    t.vrai(actions(dbl).join() === 'creerJeuDemoRacing' && d.srv.equipes().length === 21, 'D.14 double clic rapide : une seule requête, aucun doublon', dbl.resume);
    t.vrai(d.global('autorisationRevision') > 0, 'D.15 la feuille d\'autorisation est déclarée périmée après une création réelle', d.global('autorisationRevision'));
  });

  /* ============================== P — pannes ============================== */
  console.log('\nP — pannes et délais');
  await essai('P', async () => {
    const cas = async (mode) => { const b = await banc({ panne: (e, j) => (e.action === 'creerJeuDemoRacing' && j.filter((x) => x.action === 'creerJeuDemoRacing').length === 1 ? mode : null) }); return { b, r: await b.demo() }; };
    const p1 = await cas('http404-apres');
    t.vrai(actions(p1.r).filter((a) => a === 'creerJeuDemoRacing').length === 1 && p1.r.fond.map((q) => q.action).sort().join() === 'getEquipes,listerClubsInvites' &&
      /^⚠️ Réponse du serveur non reçue.*pas confirmée/.test(p1.b.texte('message-jeu-demo')) && !/✅/.test(p1.b.texte('message-jeu-demo')) &&
      p1.b.id('message-jeu-demo').type !== 'ok' && !p1.b.boutonDemo().disabled,
      'P.1 réponse perdue (404 après écriture) : aucun renvoi automatique, relecture seule des deux listes en arrière-plan, « non confirmée », bouton rendu', [p1.r.resume, p1.b.texte('message-jeu-demo')]);
    t.vrai(ecrans(p1.b).equipes.length === 21 && ecrans(p1.b).clubs.length === 12, 'P.2 après la relecture, les écrans montrent ce que le serveur a réellement écrit', '');
    const p2 = await p1.b.demo();
    t.vrai(actions(p2).join() === 'creerJeuDemoRacing' && json(p2.requetes[0].reponse.modifies) === '[]' && p1.b.srv.equipes().length === 21 &&
      /déjà en place/.test(p1.b.texte('message-jeu-demo')), 'P.3 nouveau clic après la réponse perdue : rien réécrit, rien doublé, « déjà en place »', p2.resume);
    for (const [code, mode] of [['P.4', 'silence'], ['P.5', 'delai']]) {
      const x = await cas(mode);
      t.vrai(actions(x.r).filter((a) => a === 'creerJeuDemoRacing').length === 1 && x.r.retourMs === 30000 && /délai de 30 s dépassé/.test(x.b.texte('message-jeu-demo')) &&
        !x.b.boutonDemo().disabled && !x.r.bloque, code + ' réponse ' + (mode === 'silence' ? 'silencieuse' : 'trop lente') + ' : bouton libéré au bout de 30 s, « non confirmée », jamais renvoyée',
        [x.r.resume, x.r.retourMs, x.b.texte('message-jeu-demo')]);
    }
    for (const [code, mode, ecrit] of [['P.6', 'http400-avant', false], ['P.7', 'http409-avant', false], ['P.8', 'http500-avant', false], ['P.9', 'http500-apres', true], ['P.10', 'reseau-avant', false]]) {
      const x = await cas(mode);
      t.vrai(/non reçue/.test(x.b.texte('message-jeu-demo')) && x.b.srv.equipes().length === (ecrit ? 21 : 0) && ecrans(x.b).equipes.length === (ecrit ? 21 : 0) &&
        actions(x.r).filter((a) => a === 'creerJeuDemoRacing').length === 1,
        code + ' ' + mode + ' : issue signalée incertaine, jamais « réussi », les écrans relus montrent l\'état réel (' + (ecrit ? 'écrit' : 'rien écrit') + ')', [x.r.resume, x.b.texte('message-jeu-demo')]);
    }
    const v = await cas('verrou-occupe');
    t.vrai(/occupé/.test(v.b.texte('message-jeu-demo')) && v.b.srv.equipes().length === 0 && v.r.requetes.length === 1,
      'P.11 verrou déjà occupé : refus clair, rien écrit, aucune relecture inutile', [v.r.resume, v.b.texte('message-jeu-demo')]);
    for (const [code, mode] of [['P.12', 'partielle'], ['P.13', 'ancienne']]) {
      const x = await cas(mode);
      t.vrai(x.r.attendues.map((q) => q.action).sort().join() === 'creerJeuDemoRacing,getEquipes,listerClubsInvites' && ecrans(x.b).equipes.length === 21 &&
        /✅/.test(x.b.texte('message-jeu-demo')), code + ' réponse ' + mode + ' (sans état relu) : les deux listes sont relues avant de rendre la main', x.r.resume);
    }
  });

  /* ============================== K — données existantes ============================== */
  console.log('\nK — données existantes');
  await essai('K', async () => {
    const b = await banc({ monde: (m) => m.appeler('ajouterEquipe', m.classeur, 'MEUDON', 'U10', '12', '1') });
    const r = await b.demo();
    const msg = b.texte('message-jeu-demo');
    t.vrai(actions(r).join() === 'creerJeuDemoRacing' && /non créé/.test(msg) && /MEUDON \(U10\) existe déjà avec 12 joueur/.test(msg) && /Rien n’a été modifié/.test(msg) &&
      b.srv.equipes().length === 1 && ecrans(b).equipes.length === 1, 'K.1 équipe existante incompatible : refus, conflit précis à l\'écran, rien écrit, écrans relus', msg);
    const c = await banc({ monde: (m) => m.appeler('ajouterClubInvite', m.classeur, { club_nom: 'CLAMART', club_contact_nom: 'DUPONT', club_contact_email: 'secretariat@club-reel.example.org' }) });
    await c.demo();
    t.vrai(/non créé/.test(c.texte('message-jeu-demo')) && /CLAMART » existe déjà comme club réel/.test(c.texte('message-jeu-demo')) &&
      c.srv.equipes().length === 0 && /secretariat@club-reel\.example\.org/.test(ecrans(c).clubs.find((x) => x.nom === 'CLAMART').contact) &&
      ecrans(c).clubs.length === 1, 'K.2 club RÉEL homonyme : refus précis à l\'écran, rien écrit, le vrai contact n\'est jamais mêlé à des données fictives',
      c.texte('message-jeu-demo'));
    const h = await banc({ monde: (m) => ['STADE FRANÇAIS-1', 'STADE FRANÇAIS-2'].forEach((n) => m.appeler('ajouterEquipe', m.classeur, n, 'U10', '12', '1')) });
    await h.demo();
    t.vrai(/hors du jeu/.test(h.texte('message-jeu-demo')) && h.srv.equipes().length === 23 && ecrans(h).equipes.filter((e) => /STADE FRANÇAIS-/.test(e.nom)).length === 2,
      'K.3 équipes exclues saisies à la main : conservées, signalées, jamais créées ni supprimées par le bouton', h.texte('message-jeu-demo'));
  });

  /* ============================== C — écran concurrent ============================== */
  console.log('\nC — modification concurrente');
  await essai('C', async () => {
    let fait = false;
    const b = await banc({ avantServir: (e, srv) => {
      if (e.action === 'creerJeuDemoRacing' && !fait) { fait = true; srv.postMesure({ action: 'ajouterEquipe', cle: B.MI.CLE_ADMIN, nom_equipe: 'CLAMART-1', categorie: 'U10', nb_joueurs: '14', nb_educateurs: '1' }); }
    } });
    await b.demo();
    t.vrai(/CLAMART-1 \(U10\) existe déjà avec 14 joueur/.test(b.texte('message-jeu-demo')) && ecrans(b).equipes.length === 1 && ecrans(b).equipes[0].joueurs === '14',
      'C.1 une équipe saisie AILLEURS pendant l\'envoi (autre effectif) : refus, la saisie de l\'autre écran est conservée et affichée', b.texte('message-jeu-demo'));
    const r2 = await b.srv.postMesure({ action: 'supprimerEquipe', cle: B.MI.CLE_ADMIN, id_equipe: b.srv.equipes()[0].id_equipe });
    await b.demo();
    t.vrai(!r2.reponse.error && /✅/.test(b.texte('message-jeu-demo')) && ecrans(b).equipes.length === 21, 'C.2 une fois le conflit levé, un nouveau clic crée le jeu complet', b.texte('message-jeu-demo'));
  });

  /* ============================== B — brouillons ============================== */
  console.log('\nB — saisies en cours conservées');
  await essai('B', async () => {
    const b = await banc({ monde: B.MI.amorcerClubs });
    await B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-editer-club'));
    B.clubLigne(b, 'CLUB FICTIF A').querySelector('.club-edit-prenom').value = 'PRÉNOM EN COURS';
    const caseU12 = B.clubLigne(b, 'CLUB FICTIF B').querySelectorAll('.club-cat-case').find((c) => c.value === 'U12');
    caseU12.checked = false;
    await b.declencher(caseU12, 'change');
    await b.demo();
    const edition = B.clubLigne(b, 'CLUB FICTIF A').querySelector('.club-edit-prenom');
    const u12 = B.clubLigne(b, 'CLUB FICTIF B').querySelectorAll('.club-cat-case').find((c) => c.value === 'U12');
    t.vrai(!!edition && edition.value === 'PRÉNOM EN COURS' && u12 && u12.checked === false && ecrans(b).clubs.length === 15,
      'B.1 coordonnées en cours d\'édition et case décochée d\'un panneau : conservées quand le jeu redessine la liste', [edition && edition.value, u12 && u12.checked]);
    const e = await banc({ monde: (m) => m.appeler('ajouterEquipe', m.classeur, 'CLUB REEL', 'U8', '10', '1') });
    e.global('afficherEquipes(equipesCourantes)');
    await e.global('onModifierEquipe')(e.doc.querySelector('#liste-equipes .bouton-modif'));
    const champ = e.doc.querySelector('#liste-equipes .champ-edit-nom');
    if (champ) champ.value = 'NOM EN COURS';
    await e.demo();
    const apres = e.doc.querySelector('#liste-equipes .champ-edit-nom');
    t.vrai(!!apres && apres.value === 'NOM EN COURS' && e.global('equipesCourantes').length === 22,
      'B.2 une équipe en cours d\'édition n\'est pas refermée ; la mémoire suit le serveur (22 équipes)', [apres && apres.value, e.global('equipesCourantes').length]);
    // Enregistrer le parking (texte + photo) : les modalités et l'encadrement NON enregistrés restent tels quels.
    const p = await banc();
    B.remplir(p, 'form-modalites', { tarif_engagement_oui: 'oui', tarif_engagement_montant: '75', tarif_engagement_mode: 'par_equipe' });
    B.remplir(p, 'form-encadrement', { encadrement_ratio: '1 POUR 6' });
    B.remplir(p, 'form-parking', { parking_texte: 'PARKING ENREGISTRÉ' });
    p.global('parkingDataURI = ' + json(B.PNG));
    const rp = await p.jouer(() => p.global('onEnregistrerParking')());
    t.vrai(actions(rp).join() === 'enregistrerInvitation,enregistrerPhotoParking' && p.id('form-modalites').tarif_engagement_montant.value === '75' &&
      p.id('form-encadrement').encadrement_ratio.value === '1 POUR 6' && /✅/.test(p.texte('message-parking')) &&
      p.global('configCourante.global.parking_photo_id') !== '' && p.global("carteNonEnregistree('modalites')") === true,
      'B.3 enregistrer le parking (texte + photo) : modalités et encadrement non enregistrés CONSERVÉS, aucune relecture complète, photo prise de la réponse',
      [rp.resume, p.id('form-modalites').tarif_engagement_montant.value, p.id('form-encadrement').encadrement_ratio.value]);
    // Frappe commencée PENDANT l'envoi : elle reste une saisie en cours, et c'est dit (jamais marquée « enregistrée »).
    const q = await banc({ monde: B.MI.amorcerClubs });
    B.remplir(q, 'form-modalites', { tarif_engagement_oui: 'oui', tarif_engagement_montant: '75', tarif_engagement_mode: 'par_equipe' });
    await q.jouer(() => q.global('onEnregistrerModalites')(), async (n) => { if (n === 0) q.id('form-modalites').tarif_engagement_montant.value = '80'; });
    const refus = await q.jouer(() => B.clic(q, B.clubLigne(q, 'CLUB FICTIF A').querySelector('.bouton-inviter-club')));
    t.vrai(q.id('form-modalites').tarif_engagement_montant.value === '80' && /pendant l’envoi n’est pas encore enregistrée/.test(q.texte('message-modalites')) &&
      q.srv.config().global.tarif_engagement_montant === '75' && refus.requetes.length === 0,
      'B.4 frappe commencée pendant l\'envoi (75 → 80) : la saisie reste, « pas encore enregistrée » est dit, et aucun e-mail ne part avec 80',
      [q.id('form-modalites').tarif_engagement_montant.value, q.texte('message-modalites'), q.srv.config().global.tarif_engagement_montant]);
    // Focus : un champ qui a le focus n'est jamais réécrit par un redessin (« Rafraîchir » après un changement fait ailleurs).
    const fo = await banc();
    fo.srv.postMesure({ action: 'enregistrerInvitation', cle: B.MI.CLE_ADMIN, encadrement_ratio: 'AUTRE APPAREIL' });
    fo.id('form-encadrement').encadrement_ratio.focus();
    const valeurFocus = fo.id('form-encadrement').encadrement_ratio.value;
    await fo.jouer(() => fo.cliquer(fo.id('bouton-rafraichir-admin')));
    t.vrai(fo.doc.activeElement === fo.id('form-encadrement').encadrement_ratio && fo.id('form-encadrement').encadrement_ratio.value === valeurFocus &&
      valeurFocus !== 'AUTRE APPAREIL',
      'B.5 champ qui a le focus : ni réécrit ni quitté par le redessin (la valeur d\'ailleurs attendra la fin de la saisie)', fo.id('form-encadrement').encadrement_ratio.value);
    // Annuler une photo choisie : local, le texte en cours et les autres cartes restent.
    B.remplir(p, 'form-parking', { parking_texte: 'TEXTE EN COURS' });
    p.global('parkingDataURI = ' + json(B.PNG));
    const ra = await p.jouer(() => p.global('onRetirerPhotoParking')());
    t.vrai(ra.requetes.length === 0 && p.id('form-parking').parking_texte.value === 'TEXTE EN COURS' && p.id('form-modalites').tarif_engagement_montant.value === '75',
      'B.6 annuler une photo choisie : aucun appel, texte du parking et modalités en cours conservés', [ra.resume, p.id('form-parking').parking_texte.value]);
    // Carte en cours de saisie et réglage VOISIN changé ailleurs : mise à jour ciblée — le champ modifié reste, le voisin suit
    // le serveur, et l'enregistrement suivant ne renvoie pas l'ancienne valeur du voisin (aucun écrasement silencieux).
    const vo = await banc();
    B.remplir(vo, 'form-encadrement', { encadrement_ratio: 'RATIO EN COURS' });
    vo.srv.postMesure({ action: 'enregistrerInvitation', cle: B.MI.CLE_ADMIN, encadrement_diplomes: 'DIPLÔME CHANGÉ AILLEURS' });
    await vo.jouer(() => vo.cliquer(vo.id('bouton-rafraichir-admin')));
    const apresRafraichir = [vo.id('form-encadrement').encadrement_ratio.value, vo.id('form-encadrement').encadrement_diplomes.value];
    const envoi = await vo.jouer(() => vo.global('onEnregistrerEncadrement')());
    const corps = (envoi.requetes.find((q) => q.action === 'enregistrerInvitation') || {}).corps || {};
    t.vrai(json(apresRafraichir) === json(['RATIO EN COURS', 'DIPLÔME CHANGÉ AILLEURS']) && corps.encadrement_ratio === 'RATIO EN COURS' &&
      corps.encadrement_diplomes === 'DIPLÔME CHANGÉ AILLEURS' && vo.srv.config().global.encadrement_diplomes === 'DIPLÔME CHANGÉ AILLEURS',
      'B.7 carte en cours de saisie : le champ modifié reste, le champ voisin changé ailleurs suit le serveur — et n\'est pas écrasé au prochain enregistrement',
      [apresRafraichir, corps]);
  });

  /* ============================== X — versions mêlées ============================== */
  console.log('\nX — compatibilité entre versions');
  await essai('X', async () => {
    const a = await B.banc({ lire: LIRE, backend: B.BACKEND_AVANT() });
    const ra = await a.demo();
    t.vrai(actions(ra).join() === 'creerJeuDemoRacing' && /pas encore la version/.test(a.texte('message-jeu-demo')) && a.srv.equipes().length === 0 &&
      !a.boutonDemo().disabled, 'X.1 nouveau frontend + ANCIEN backend (0fcf9f1367719ff8074f722f41fabe0e09e9fbf0) : « serveur pas à jour », rien créé', a.texte('message-jeu-demo'));
    const v = await B.banc({ lire: B.LECTEUR_AVANT, backend: CODE, monde: (m) => B.MI.saisirEquipesAttendues(m) });
    const rv = await v.demo();
    t.vrai(actions(rv).join() === 'chargerClubsDemoRacing' && /Inviter un club/.test(v.texte('message-equipe')) && v.srv.clubs().length === 0 &&
      /Aucune équipe n’a été créée/.test(v.texte('message-equipe')), 'X.2 ANCIEN frontend (a8d549424f6161962b35a476946d09e81b5c988b) + nouveau backend : refus qui indique le nouveau bouton, rien écrit',
    [rv.resume, v.texte('message-equipe')]);
    const vide = await B.banc({ lire: B.LECTEUR_AVANT, backend: CODE });
    const rvide = await vide.demo();
    t.vrai(rvide.requetes.length === 0 && vide.srv.equipes().length === 0, 'X.3 ancien frontend, tournoi vide : refus local, aucune requête', rvide.resume);
    const MELANGES = [['X.4', ['js/admin.js']], ['X.5', ['js/admin-invitations.js']], ['X.6', ['js/admin-equipes.js']], ['X.7', ['admin.html']],
      ['X.8', ['js/admin.js', 'js/admin-equipes.js']], ['X.9', ['admin.html', 'js/admin.js']], ['X.10', ['js/admin-invitations.js', 'js/admin-equipes.js']],
      ['X.11', ['js/api.js', 'js/admin-autorisation.js']]];
    // Nouveaux chemins de ce passage, mêlés à des modules d'avant : l'écran reste utilisable (repli historique).
    const x12 = await B.banc({ lire: B.lecteurMele(['js/admin-invitations.js'], LIRE), backend: CODE });
    B.remplir(x12, 'form-contacts-securite', { referent_nom: 'RÉFÉRENT' });
    const r12 = await x12.jouer(() => x12.global('onEnregistrerContacts')());
    t.vrai(!x12.erreurBranchement && actions(r12).join() === 'enregistrerContactsSecurite' && /✅/.test(x12.texte('message-contacts-securite')),
      'X.12 cache mêlé — admin-invitations.js d\'avant, admin-infos-publication.js neuf : « Contacts & sécurité » s\'enregistre par le chemin historique', [r12.resume, x12.erreurBranchement]);
    const x13 = await B.banc({ lire: B.lecteurMele(['js/admin-infos-publication.js'], LIRE), backend: CODE });
    B.remplir(x13, 'form-surplace', { buvette_disponible: 'oui' });
    const r13 = await x13.jouer(() => x13.global('onEnregistrerSurPlace')());
    t.vrai(!x13.erreurBranchement && actions(r13).join() === 'enregistrerSurPlace' && /✅/.test(x13.texte('message-surplace')),
      'X.13 cache mêlé — admin-infos-publication.js d\'avant, admin-invitations.js neuf : « Sur place » s\'enregistre', [r13.resume, x13.erreurBranchement]);
    const x14 = await B.banc({ lire: B.lecteurMele(['js/admin.js'], LIRE), backend: CODE, monde: B.MI.amorcerClubs });
    const r14 = await x14.jouer(() => x14.cliquer(x14.id('bouton-rafraichir-admin')));
    t.vrai(!x14.erreurBranchement && actions(r14).indexOf('getAll') !== -1 && r14.ecritures.length === 0 && !r14.bloque,
      'X.14 cache mêlé — admin.js d\'avant : « Rafraîchir » fonctionne comme avant (sans relire les clubs), page branchée', [r14.resume, x14.erreurBranchement]);
    for (const [code, fichiers] of MELANGES) {
      const m = await B.banc({ lire: B.lecteurMele(fichiers, LIRE), backend: CODE });
      const r = await m.demo();
      const eq = m.srv.equipes().length;
      const message = (m.texte('message-jeu-demo') || '') + (m.texte('message-equipe') || '') + (m.texte('message-club-invite') || '');
      const creation = eq === 21 && /✅/.test(message) && ecrans(m).equipes.length === 21;
      const refusClair = eq === 0 && m.srv.clubs().length === 0 && /Inviter un club|Ajoute d’abord|pas encore|recharge-la/.test(message) && !/✅/.test(message);
      t.vrai(!m.erreurBranchement && (creation || refusClair) && actions(r).filter((x) => /Demo/.test(x)).length <= 1,
        code + ' cache mêlé — ' + fichiers.join(', ') + ' d\'avant : page branchée, et soit le jeu complet, soit un refus clair (jamais un faux succès ni un doublon)',
        [m.erreurBranchement, r.resume, eq, message.slice(0, 160)]);
    }
  });

  /* ============================== W — chaque écriture de l'écran : pannes ============================== */
  console.log('\nW — écritures de l\'écran : délai, issue incertaine, jamais de renvoi, saisies conservées');
  await essai('W', async () => {
    const clubs = (m) => B.MI.amorcerClubs(m);
    /* [code, geste, monde, préparer(b), déclencher(b), action écrite, zone du message, saisie conservée ?(b), relectures, bouton libéré ?(b)] */
    const ECRITURES = [
      ['A2', 'enregistrer les modalités', clubs, (b) => B.remplir(b, 'form-modalites', { tarif_engagement_oui: 'oui', tarif_engagement_montant: '75', tarif_engagement_mode: 'par_equipe' }),
        (b) => b.global('onEnregistrerModalites')(), 'enregistrerInvitation', 'message-modalites',
        (b) => b.id('form-modalites').tarif_engagement_montant.value === '75', ['getConfigAdmin'], (b) => !b.id('bouton-enregistrer-modalites').disabled],
      ['A3', 'enregistrer « Réponse »', null, (b) => B.remplir(b, 'form-reponse', { contact_reponse_nom: 'ACCUEIL EN COURS', contact_reponse_tel: '0600000000' }),
        (b) => b.global('onEnregistrerReponse')(), 'enregistrerReponseInvitation', 'message-reponse',
        (b) => b.id('form-reponse').contact_reponse_nom.value === 'ACCUEIL EN COURS', ['getConfigAdmin'], (b) => !b.id('bouton-enregistrer-reponse').disabled],
      ['A4', 'enregistrer contacts & sécurité', null, (b) => B.remplir(b, 'form-contacts-securite', { referent_nom: 'RÉFÉRENT EN COURS' }),
        (b) => b.global('onEnregistrerContacts')(), 'enregistrerContactsSecurite', 'message-contacts-securite',
        (b) => b.id('form-contacts-securite').referent_nom.value === 'RÉFÉRENT EN COURS', ['getConfigAdmin'], (b) => !b.id('bouton-enregistrer-contacts').disabled],
      ['A5', 'enregistrer « Sur place »', clubs, (b) => B.remplir(b, 'form-surplace', { buvette_disponible: 'oui', boutique_disponible: 'oui' }),
        (b) => b.global('onEnregistrerSurPlace')(), 'enregistrerSurPlace', 'message-surplace',
        (b) => b.id('form-surplace').boutique_disponible.checked === true, ['getConfigAdmin'], (b) => !b.id('bouton-enregistrer-surplace').disabled],
      ['B1', 'enregistrer parking & accès', null, (b) => B.remplir(b, 'form-parking', { parking_texte: 'PARKING EN COURS' }),
        (b) => b.global('onEnregistrerParking')(), 'enregistrerInvitation', 'message-parking',
        (b) => b.id('form-parking').parking_texte.value === 'PARKING EN COURS', ['getConfigAdmin'], (b) => !b.id('bouton-enregistrer-parking').disabled],
      ['B4', 'enregistrer encadrement & assurance', null, (b) => B.remplir(b, 'form-encadrement', { encadrement_ratio: '1 POUR 6' }),
        (b) => b.global('onEnregistrerEncadrement')(), 'enregistrerInvitation', 'message-encadrement',
        (b) => b.id('form-encadrement').encadrement_ratio.value === '1 POUR 6', ['getConfigAdmin'], (b) => !b.id('bouton-enregistrer-encadrement').disabled],
      ['A6', 'envoyer aux clubs non encore invités', clubs, () => {}, (b) => b.global('onEnvoyerInvitationsGroupe')(), 'envoyerInvitationsGroupe',
        'message-invitations', () => true, ['listerClubsInvites'], (b) => !b.id('bouton-envoyer-invitations').disabled],
      ['C1', 'ajouter un club', clubs, (b) => { b.id('champ-club-nom').value = 'club e'; b.id('champ-club-email').value = 'club-e@example.invalid'; },
        (b) => b.global('onAjouterClubInvite')({ preventDefault() {} }), 'ajouterClubInvite', 'message-club-invite',
        (b) => b.id('champ-club-nom').value === 'club e' || b.srv.clubs().some((c) => c.club_nom === 'CLUB E'), ['listerClubsInvites'], (b) => !b.id('bouton-ajouter-club').disabled],
      ['C2', 'changer le statut', clubs, (b) => { B.clubLigne(b, 'CLUB FICTIF A').querySelector('.statut-club').value = 'Décliné'; },
        (b) => b.global('onChangerStatutClub')({ target: B.clubLigne(b, 'CLUB FICTIF A').querySelector('.statut-club') }), 'modifierStatutClubInvite', 'message-club-invite',
        () => true, ['listerClubsInvites'], (b) => !B.clubLigne(b, 'CLUB FICTIF A').querySelector('.statut-club').disabled],
      ['C3', 'envoyer l\'invitation (ligne)', clubs, () => {}, (b) => B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club')),
        'envoyerInvitationClub', 'message-club-invite', () => true, ['listerClubsInvites'],
        (b) => { const x = B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club'); return x.getAttribute('aria-busy') === null; }],
      ['C4', 'modifier les coordonnées', clubs, async (b) => { await B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-editer-club'));
        B.clubLigne(b, 'CLUB FICTIF A').querySelector('.club-edit-prenom').value = 'PRÉNOM EN COURS'; },
        (b) => B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.btn-enregistrer-edition')), 'modifierClubInvite', 'message-club-invite',
        (b) => { const l = B.clubLigne(b, 'CLUB FICTIF A'); const e = l && l.querySelector('.club-edit-prenom');
          return (e && e.value === 'PRÉNOM EN COURS') || (b.srv.clubs().find((c) => c.club_nom === 'CLUB FICTIF A') || {}).club_contact_prenom === 'PRÉNOM EN COURS'; },
        ['listerClubsInvites'], (b) => { const e = b.doc.querySelector('.btn-enregistrer-edition'); return !e || !e.disabled; }],
      ['C5', 'retirer un club', clubs, () => {}, (b) => B.clic(b, B.clubLigne(b, 'CLUB FICTIF C').querySelector('.bouton-suppr-club')), 'supprimerClubInvite',
        'message-club-invite', () => true, ['listerClubsInvites'], (b) => { const l = B.clubLigne(b, 'CLUB FICTIF C'); return !l || !l.querySelector('.bouton-suppr-club').disabled; }],
      ['C6', 'ajouter les équipes au tournoi', clubs, () => {}, (b) => B.clic(b, B.clubLigne(b, 'CLUB FICTIF B').querySelector('.bouton-cats-club')),
        'enregistrerCategoriesEngagees', 'message-club-invite', () => true, ['listerClubsInvites', 'getEquipes'],
        (b) => { const x = B.clubLigne(b, 'CLUB FICTIF B').querySelector('.bouton-cats-club'); return x.getAttribute('aria-busy') === null; }]
    ];
    const ecrite = (action) => (q) => q.action === action && !(action === 'supprimerClubInvite' && q.corps.apercu === 'oui');
    const MODES_TOUS = ['http404-apres', 'reseau-avant', 'silence'];
    const MODES_REPRESENTATIFS = ['http400-avant', 'http409-avant', 'http500-avant', 'http500-apres', 'verrou-occupe'];
    for (const [code, nom, monde, preparer, geste, action, zone, saisie, relectures, libre] of ECRITURES) {
      const modes = MODES_TOUS.concat(['A2', 'C2', 'C3'].indexOf(code) !== -1 ? MODES_REPRESENTATIFS : []);
      for (const mode of modes) {
        let premiere = true;
        const b = await banc({ monde: monde || undefined,
          panne: (e) => (ecrite(action)(e) && premiere ? (premiere = false, mode) : null) });
        await preparer(b);
        const r = await b.jouer(() => geste(b));
        const emissions = r.requetes.filter(ecrite(action)).length;
        const message = b.texte(zone) || '';
        const occupe = mode === 'verrou-occupe';
        const relu = relectures.every((a) => r.requetes.some((q) => q.action === a));
        const ok = emissions === 1 && !r.bloque && libre(b) && saisie(b) &&
          (occupe ? /occup/i.test(message) && !/✅/.test(message)
            : /pas confirmé|non reçue|confirmé par la relecture|n’a pas eu lieu|n’a pas changé|n’ont pas été enregistrées|n’a pas été enregistré/.test(message) && relu) &&
          !(mode.indexOf('-avant') !== -1 && /✅/.test(message));
        t.vrai(ok, 'W.' + code + '.' + mode + ' ' + nom + ' : ' + (occupe ? 'refus « occupé » dit, rien de renvoyé'
          : 'issue incertaine dite, UNE émission, bouton libéré, relecture sûre (' + relectures.join(' + ') + '), saisie conservée'),
          [mode, emissions, r.resume, message.slice(0, 180), r.bloque, libre(b), saisie(b)]);
      }
    }
    // Carte de configuration : la relecture TRANCHE — écrite (404 après) → confirmée ; jamais partie (réseau avant) → dit « pas eu lieu ».
    for (const [mode, attendu] of [['http404-apres', /confirmé par la relecture/], ['reseau-avant', /n’a pas eu lieu.*saisies sont conservées/]]) {
      let premiere = true;
      const b = await banc({ panne: (e) => (e.action === 'enregistrerInvitation' && premiere ? (premiere = false, mode) : null) });
      B.remplir(b, 'form-modalites', { tarif_engagement_oui: 'oui', tarif_engagement_montant: '75', tarif_engagement_mode: 'par_equipe' });
      await b.jouer(() => b.global('onEnregistrerModalites')());
      t.vrai(attendu.test(b.texte('message-modalites')) && b.id('form-modalites').tarif_engagement_montant.value === '75',
        'W.V ' + mode + ' : la relecture de la configuration dit ce qui s\'est réellement passé, la saisie reste', b.texte('message-modalites'));
    }
  });

  /* ============================== E — e-mails ============================== */
  console.log('\nE — e-mails : valeurs enregistrées seulement, un envoi par action');
  await essai('E', async () => {
    const b = await banc({ monde: B.MI.amorcerClubs });
    B.remplir(b, 'form-modalites', { tarif_engagement_oui: 'oui', tarif_engagement_montant: '75', tarif_engagement_mode: 'par_equipe' });
    const r1 = await b.jouer(() => B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club')));
    t.vrai(r1.requetes.length === 0 && /Enregistre d’abord « Modalités d’inscription »/.test(b.texte('message-club-invite')) &&
      /Rien n’a été envoyé/.test(b.texte('message-club-invite')), 'E.1 invitation individuelle avec des modalités NON enregistrées : aucun envoi, et le message dit quoi enregistrer',
    [r1.resume, b.texte('message-club-invite')]);
    const r2 = await b.jouer(() => b.global('onEnvoyerInvitationsGroupe')());
    t.vrai(r2.requetes.length === 0 && /Enregistre d’abord « Modalités d’inscription »/.test(b.texte('message-invitations')),
      'E.2 envoi groupé : même refus, aucun e-mail', [r2.resume, b.texte('message-invitations')]);
    await b.jouer(() => b.global('onEnregistrerModalites')());
    let pendant = null;
    const r3 = await b.jouer(() => Promise.all([B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club')),
      B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club'))]), async (n) => {
      if (n !== 0) return;
      b.global('afficherClubsInvites()');                      // un redessin PENDANT l'envoi (relecture, autre geste)
      const x = B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club');
      pendant = { desactive: x.disabled, occupe: x.getAttribute('aria-busy'), texte: x.textContent };
      await B.clic(b, x);                                       // troisième clic, sur le bouton redessiné
    });
    t.vrai(r3.requetes.filter((q) => q.action === 'envoyerInvitationClub').length === 1 && pendant && pendant.desactive && pendant.occupe === 'true' &&
      /Envoi/.test(pendant.texte) && b.srv.courrielsEnvoyes() === 1,
      'E.3 une fois enregistrées : double clic + clic sur le bouton redessiné pendant l\'envoi = UN e-mail ; le bouton reste occupé au redessin', [r3.resume, pendant, b.srv.courrielsEnvoyes()]);
    // Issue incertaine (réseau coupé avant l'envoi) → relecture → nouveau clic : confirmation qui prévient.
    let premiere = true;
    const c = await banc({ monde: B.MI.amorcerClubs, panne: (e) => (e.action === 'envoyerInvitationClub' && premiere ? (premiere = false, 'reseau-avant') : null) });
    await c.jouer(() => B.clic(c, B.clubLigne(c, 'CLUB FICTIF A').querySelector('.bouton-inviter-club')));
    c.dialogues.length = 0;
    const r4 = await c.jouer(() => B.clic(c, B.clubLigne(c, 'CLUB FICTIF A').querySelector('.bouton-inviter-club')));
    t.vrai(c.dialogues.some((d) => /pas été confirmé.*peut-être déjà reçu/.test(d)) && r4.requetes.filter((q) => q.action === 'envoyerInvitationClub').length === 1,
      'E.4 nouvel envoi après une issue incertaine : la confirmation prévient que le club l\'a peut-être reçu', c.dialogues);
    // Relance depuis le Suivi (même e-mail, même garde) : double déclenchement = une relance.
    const d = await banc({ monde: (m) => { B.MI.amorcerClubs(m); m.appeler('ecrireEngagementClub', m.classeur, 'CLUB FICTIF A', { statut: 'Invité', invitation_envoyee: '2026-09-03' }, true); } });
    const r5 = await d.jouer(() => Promise.all([d.global('envoyerInvitationClubUI')('CLUB FICTIF A', { relance: true }),
      d.global('envoyerInvitationClubUI')('CLUB FICTIF A', { relance: true })]));
    t.vrai(r5.requetes.filter((q) => q.action === 'envoyerInvitationClub').length === 1 && d.srv.courrielsEnvoyes() === 1,
      'E.5 relance de la réponse (Suivi) déclenchée deux fois : UNE relance envoyée', r5.resume);
    // Dossier final : une carte du dossier non enregistrée bloque l'envoi AVANT tout renouvellement de lien.
    const f = await banc();
    await f.demo();
    B.remplir(f, 'form-parking', { parking_texte: 'PARKING NON ENREGISTRÉ' });
    const r6 = await f.jouer(() => f.global('genererDossierFinal')('ISSY-LES-MOULINEAUX'));
    t.vrai(r6.requetes.length === 0 && /Enregistre d’abord « Parking & accès »/.test(f.texte('message-suivi-clubs')) && !f.doc.querySelector('.eml-overlay'),
      'E.6 dossier final avec « Parking & accès » non enregistré : aucun envoi, aucun lien renouvelé, message précis', [r6.resume, f.texte('message-suivi-clubs')]);
    await f.jouer(() => f.global('onEnregistrerParking')());
    await f.jouer(() => f.global('genererDossierFinal')('ISSY-LES-MOULINEAUX'));
    const envoyer = f.doc.querySelector('.eml-overlay #eml-envoyer');
    const r7 = await f.jouer(() => Promise.all([f.cliquer(envoyer), f.cliquer(envoyer)]));
    t.vrai(!!envoyer && r7.requetes.filter((q) => q.action === 'envoyerDossierEmail').length === 1 && r7.requetes[0].delaiMs === 90000,
      'E.7 fenêtre du dossier final : double clic sur « Envoyer » = UN e-mail, délai borné (90 s, celui d\'un e-mail)', r7.resume);
    // Envoi groupé à 3 clubs : délai PROPORTIONNEL (90 s + 3 × 30 s), jamais les 30 s d'une carte (un envoi qui réussit
    // serait dit « non confirmé ») ; réponse muette : le message dit le délai réel, une seule émission.
    let muette = true;
    const g = await banc({ monde: (m) => { B.MI.amorcerClubs(m); ['D', 'E'].forEach((x) => m.appeler('ajouterClubInvite', m.classeur,
      { club_nom: 'CLUB FICTIF ' + x, club_contact_nom: 'CONTACT', club_contact_prenom: x, club_contact_email: 'club-' + x.toLowerCase() + '@example.invalid' })); },
    panne: (e) => (e.action === 'envoyerInvitationsGroupe' && muette ? (muette = false, 'silence') : null) });
    const r8 = await g.jouer(() => g.global('onEnvoyerInvitationsGroupe')());
    const groupe = r8.requetes.filter((q) => q.action === 'envoyerInvitationsGroupe');
    const delai = g.global('delaiEcritureInvitation');
    t.vrai(groupe.length === 1 && groupe[0].delaiMs === 180000 && /délai de 180 s dépassé/.test(g.texte('message-invitations')) &&
      !g.id('bouton-envoyer-invitations').disabled && g.srv.courrielsEnvoyes() <= 3 &&
      delai('envoyerInvitationsGroupe', 11) === 360000 && delai('envoyerInvitationsGroupe', 0) === 120000 && delai('enregistrerInvitation') === 30000,
      'E.8 envoi groupé à 3 clubs : délai proportionnel (180 s ; 11 clubs : plafond 6 min), réponse muette dite avec son délai réel, UNE émission, bouton libéré',
      [r8.resume, groupe.map((q) => q.delaiMs), g.texte('message-invitations').slice(0, 200), g.srv.courrielsEnvoyes()]);
  });

  /* ============================== S — Suivi des clubs ============================== */
  console.log('\nS — Suivi des clubs à jour sans rechargement');
  await essai('S', async () => {
    const b = await banc({ monde: B.MI.amorcerClubs });
    b.global('afficherSuiviClubs()');
    const avant = b.texte('suivi-clubs-resume');
    const select = B.clubLigne(b, 'CLUB FICTIF A').querySelector('.statut-club');
    select.value = 'Accepté';
    const r = await b.jouer(() => b.global('onChangerStatutClub')({ target: select }));
    const apres = b.texte('suivi-clubs-resume');
    const ligne = b.doc.querySelector('#liste-suivi-clubs .suivi-club-ligne[data-club="CLUB FICTIF A"]');
    t.vrai(actions(r).join() === 'modifierStatutClubInvite' && /2\s*Participants/.test(apres) && /1\s*Participants/.test(avant) &&
      !!ligne && /club-etat-a-enregistrer/.test(ligne.getAttribute('class')) && /Équipes à ajouter/.test(ligne.textContent),
      'S.1 statut changé dans « Clubs invités » : « Suivi des clubs » affiche le nouvel état IMMÉDIATEMENT, sans relecture',
    [avant, apres, r.resume, ligne && ligne.getAttribute('class')]);
  });

  /* ============================== A — clavier et focus ============================== */
  console.log('\nA — accessibilité clavier et focus');
  await essai('A', async () => {
    const b = await banc({ monde: (m) => { B.MI.amorcerClubs(m); m.appeler('ecrireEngagementClub', m.classeur, 'CLUB FICTIF B', { alerte_ecart: 'Écart fictif : une équipe en trop' }, false); } });
    for (const [id, libelle] of [['zone-depot-parking', 'photo du parking'], ['zone-depot-pieces-invitation', 'pièces jointes de l\'invitation'],
      ['zone-depot-pieces-dossier', 'pièces jointes du dossier final']]) {
      const zone = b.id(id);
      const champ = zone.querySelector('input');
      let ouvertures = 0;
      champ.click = () => { ouvertures++; };
      await b.declencher(zone, 'keydown', { key: 'Enter' });
      await b.declencher(zone, 'keydown', { key: ' ' });
      await b.declencher(zone, 'keydown', { key: 'a' });
      t.vrai(zone.getAttribute('tabindex') === '0' && zone.getAttribute('role') === 'button' && !!zone.getAttribute('aria-label') && ouvertures === 2,
        'A.1 zone de dépôt « ' + libelle + ' » : atteignable (Tab), nommée, Entrée et Espace ouvrent le choix du fichier', [zone.attrs, ouvertures]);
    }
    const badge = () => B.clubLigne(b, 'CLUB FICTIF B').querySelector('.club-alerte-ecart');
    b.dialogues.length = 0;
    await b.declencher(badge(), 'keydown', { key: 'Enter' });
    await b.declencher(badge(), 'keydown', { key: ' ' });
    t.vrai(badge().getAttribute('tabindex') === '0' && badge().getAttribute('role') === 'button' &&
      b.dialogues.filter((d) => /Écart fictif/.test(d)).length === 2 && b.doc.activeElement === badge(),
      'A.2 badge « ⚠️ Écart » : Entrée et Espace ouvrent le détail, le focus revient sur le badge', [b.dialogues, badge() && badge().attrs]);
    const prenom = B.clubLigne(b, 'CLUB FICTIF B').querySelector('.club-prenom-input');
    prenom.focus(); prenom.value = 'Cam'; prenom.setSelectionRange(2, 2);
    b.global('afficherClubsInvites()');                         // reconstruction de la liste (relecture, autre geste…)
    const neuf = B.clubLigne(b, 'CLUB FICTIF B').querySelector('.club-prenom-input');
    t.vrai(neuf !== prenom && b.doc.activeElement === neuf && neuf.value === 'Cam' && neuf.selectionStart === 2,
      'A.3 focus RENDU après reconstruction : même champ du même club, saisie et curseur conservés', [b.doc.activeElement && b.doc.activeElement.attrs, neuf.value, neuf.selectionStart]);
    await B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-editer-club'));
    t.vrai(b.doc.activeElement && b.doc.activeElement.classList.contains('club-edit-nom'), 'A.4 « Modifier les coordonnées » : le focus va au premier champ', b.doc.activeElement && b.doc.activeElement.attrs);
    await b.declencher(b.doc.activeElement, 'keydown', { key: 'Escape' });
    t.vrai(!b.doc.querySelector('.club-en-edition') && b.doc.activeElement && b.doc.activeElement.classList.contains('bouton-editer-club') &&
      b.doc.activeElement.getAttribute('data-club') === 'CLUB FICTIF A', 'A.5 Échap annule l\'édition et rend le focus au crayon du club', b.doc.activeElement && b.doc.activeElement.attrs);
    await B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-editer-club'));
    B.clubLigne(b, 'CLUB FICTIF A').querySelector('.club-edit-prenom').value = 'PAR ENTRÉE';
    const r = await b.jouer(() => b.declencher(B.clubLigne(b, 'CLUB FICTIF A').querySelector('.club-edit-prenom'), 'keydown', { key: 'Enter', target: B.clubLigne(b, 'CLUB FICTIF A').querySelector('.club-edit-prenom') }));
    t.vrai(r.requetes.filter((q) => q.action === 'modifierClubInvite').length === 1 && b.srv.clubs().find((c) => c.club_nom === 'CLUB FICTIF A').club_contact_prenom === 'PAR ENTRÉE',
      'A.6 Entrée dans un champ de la ligne en édition enregistre (une écriture)', r.resume);
  });

  /* ============================== F — Rafraîchir et navigation ============================== */
  console.log('\nF — « Rafraîchir », navigation, retour sur l\'écran');
  await essai('F', async () => {
    const b = await banc({ monde: B.MI.amorcerClubs });
    const retour = await b.jouer(async () => { await b.global('ouvrirEtapeAdmin')('suivi-clubs'); await b.global('ouvrirEtapeAdmin')('invitation'); });
    t.vrai(retour.requetes.length === 0, 'F.1 retour sur l\'écran (Inviter → Suivi → Inviter) : aucun appel, l\'état local est fiable', retour.resume);
    // Un autre appareil ajoute un club et change le parking ; ici, une saisie en cours dans les modalités.
    b.srv.postMesure({ action: 'ajouterClubInvite', cle: B.MI.CLE_ADMIN, club_nom: 'CLUB AUTRE APPAREIL', club_contact_email: 'autre@example.invalid' });
    b.srv.postMesure({ action: 'enregistrerInvitation', cle: B.MI.CLE_ADMIN, parking_texte: 'PARKING AUTRE APPAREIL' });
    B.remplir(b, 'form-modalites', { tarif_engagement_oui: 'oui', tarif_engagement_montant: '75', tarif_engagement_mode: 'par_equipe' });
    const r = await b.jouer(() => b.cliquer(b.id('bouton-rafraichir-admin')));
    t.vrai(['getAll', 'getConfigAdmin', 'listerClubsInvites'].every((a) => actions(r).indexOf(a) !== -1) && r.ecritures.length === 0 &&
      B.clubLigne(b, 'CLUB AUTRE APPAREIL') && b.id('form-parking').parking_texte.value === 'PARKING AUTRE APPAREIL' &&
      b.id('form-modalites').tarif_engagement_montant.value === '75',
      'F.2 « Rafraîchir » relit VRAIMENT les clubs (club ajouté ailleurs affiché) et la configuration (parking changé ailleurs), sans écraser la saisie en cours',
      [r.resume, b.id('form-parking').parking_texte.value, b.id('form-modalites').tarif_engagement_montant.value]);
    const v = await banc();
    v.global('delete adminEtatsRessources.clubsInvites');
    const rv = await v.jouer(() => v.cliquer(v.id('bouton-rafraichir-admin')));
    t.vrai(actions(rv).indexOf('listerClubsInvites') === -1, 'F.3 clubs jamais chargés (écran jamais ouvert) : « Rafraîchir » ne les lit pas — l\'arrivée sur l\'écran s\'en chargera', rv.resume);
  });

  /* ============================== N — noms exacts depuis l'écran ============================== */
  console.log('\nN — les 21 noms restent exacts');
  await essai('N', async () => {
    const b = await banc();
    await b.demo();
    const noms = () => b.srv.equipes().map((e) => e.categorie + ':' + e.nom_equipe).sort();
    const avant = noms();
    const panneau = B.clubLigne(b, 'CLAMART').querySelector('.club-panneau');
    const prenom = panneau.querySelector('.club-prenom-input');
    prenom.value = 'Contact2';
    await b.declencher(prenom, 'change');
    const bouton = B.clubLigne(b, 'CLAMART').querySelector('.bouton-cats-club');
    const r = await b.jouer(() => B.clic(b, bouton));
    t.vrai(!bouton.disabled || actions(r).indexOf('enregistrerCategoriesEngagees') !== -1, 'N.0 le bouton « Ajouter les équipes au tournoi » est réellement utilisable (prénom modifié)', r.resume);
    t.vrai(actions(r).indexOf('enregistrerCategoriesEngagees') !== -1 && json(noms()) === json(avant) &&
      json(ecrans(b).equipes.map((e) => e.categorie + ':' + e.nom).sort()) === json(avant) && noms().indexOf('U12:CLAMART') !== -1 && noms().indexOf('U12:CLAMART-1') === -1,
      'N.1 « Ajouter les équipes au tournoi » sur CLAMART (club du jeu) : aucun renommage — CLAMART (U12) reste CLAMART, les 21 noms sont exacts', [r.resume, noms()]);
  });

  /* ============================== H — club déjà au carnet ============================== */
  console.log('\nH — club déjà au carnet');
  await essai('H', async () => {
    const b = await banc({ monde: (m) => {
      m.appeler('ajouterClubInvite', m.classeur, { club_nom: 'CLUB CARNET', club_contact_prenom: 'ALEX', club_contact_nom: 'DUPONT', club_contact_email: 'alex@club-carnet.example.org' });
      m.postMesure({ action: 'reinitialiserTournoi', cle: B.MI.CLE_ADMIN });
      ['U10', 'U12'].forEach((categorie) => m.appeler('enregistrerCategorie', m.classeur, { categorie, presente: 'oui' }));
    } });
    b.id('champ-club-nom').value = 'club carnet'; b.id('champ-club-contact').value = 'martin'; b.id('champ-club-prenom').value = 'sam';
    b.id('champ-club-email').value = 'sam@club-carnet.example.org';
    const r = await b.jouer(() => b.global('onAjouterClubInvite')({ preventDefault() {} }));
    const msg = b.texte('message-club-invite');
    const ligne = B.clubLigne(b, 'CLUB CARNET');
    t.vrai(actions(r).join() === 'ajouterClubInvite' && /déjà au carnet/.test(msg) && /alex@club-carnet\.example\.org/.test(msg) &&
      /sam@club-carnet\.example\.org/.test(msg) && /Modifier les coordonnées/.test(msg) && !!ligne && /alex@club-carnet/.test(ligne.textContent) &&
      b.id('champ-club-email').value === '', 'H.1 club déjà au carnet avec un autre contact : ajouté avec son contact CONSERVÉ, la différence est dite (conservé / saisi), rien écrasé',
    [r.resume, msg]);
  });

  /* ============================== J — « Nouveau lien » : le jeton du jeu garde sa marque (classeur non migré) ============================== */
  console.log('\nJ — « Nouveau lien » : la marque d\'origine du jeu survit, un club réel n\'est jamais marqué');
  await essai('J', async () => {
    const CLE = B.MI.CLE_ADMIN;
    const reel = (m) => m.appeler('ajouterClubInvite', m.classeur, { club_nom: 'CLUB REEL', club_contact_nom: 'DUPONT', club_contact_email: 'contact@club-reel.example.org' });
    const ligne = (b, nom) => b.srv.appeler('lireOngletSimple', b.srv.classeur, 'ClubsInvites').find((c) => c.club_nom === nom) || {};
    // Monde prêt côté serveur (jeu créé, dossier de CLAMART déjà envoyé : le seul cas où l'écran propose un nouveau lien).
    const jeuServeur = (m) => { reel(m); m.postMesure({ action: 'creerJeuDemoRacing', cle: CLE });
      m.appeler('ecrireEngagementClub', m.classeur, 'CLAMART', { dossier_envoye: '2026-09-10' }, false); m.cache.delete('snapshot_json_v3'); };
    const dossierEnvoye = async (b, nom) => { b.srv.appeler('ecrireEngagementClub', b.srv.classeur, nom, { dossier_envoye: '2026-09-10' }, false);
      await b.jouer(() => b.global('rafraichirRessourceAdmin')('clubsInvites')); b.journal.length = 0; b.dialogues.length = 0; };
    // « Envoyer / Renvoyer le dossier final » (fiche du Suivi) appelle exactement genererDossierFinal(nom) — le banc n'a pas le panneau de la fiche.
    const dossier = (b, nom) => b.global('genererDossierFinal')(nom);
    const reinit = (b) => { b.doc.body.appendChild(Object.assign(b.doc.createElement('div'), { id: 'bloc-reinit' }));
      b.doc.getElementById('bloc-reinit').innerHTML = '<button id="bouton-reinitialiser"></button><div id="message-reinitialisation"></div><div id="arbitrages"></div>';
      return b.jouer(() => b.global('onReinitialiser')()); };

    // Le parcours demandé, tout depuis l'écran : jeu → « Nouveau lien » → contact et adresse modifiés → réinitialisation.
    const b = await banc({ modele: 'legacy', monde: reel });
    await b.demo();
    await dossierEnvoye(b, 'CLAMART');
    const ancien = ligne(b, 'CLAMART').club_token;
    const r1 = await b.jouer(() => dossier(b, 'CLAMART'));
    const neuf = ligne(b, 'CLAMART').club_token;
    const r1b = await b.jouer(() => b.cliquer(b.doc.querySelector('.eml-overlay #eml-envoyer')));
    const envoi = r1b.requetes.find((q) => q.action === 'envoyerDossierEmail');
    t.vrai(actions(r1).join() === 'regenererJetonClub' && r1.requetes[0].delaiMs === 30000 && /^demo-racing-/.test(ancien) && /^demo-racing-/.test(neuf) &&
      neuf !== ancien && b.dialogues.some((d) => /NOUVEAU lien/.test(d)) && !!envoi && envoi.corps.texte_modele.indexOf('token=' + neuf) !== -1 &&
      envoi.corps.texte_modele.indexOf(ancien) === -1,
    'J.1 classeur NON migré, club du jeu, depuis « Renvoyer le dossier final » : « Nouveau lien » = UNE requête (30 s) ; le jeton neuf garde « demo-racing- » et le dossier part avec lui',
    [r1.resume, r1b.resume, ancien, neuf]);
    const reelAvant = ligne(b, 'CLUB REEL').club_token;
    const rr = await b.jouer(() => b.global('renouvelerLienSiDemande')({ club_nom: 'CLUB REEL', dossier_envoye: '2026-09-10' }));
    const reelApres = ligne(b, 'CLUB REEL').club_token;
    t.vrai(actions(rr).join() === 'regenererJetonClub' && reelApres && reelApres !== reelAvant && !/demo-racing/.test(reelApres),
      'J.2 club RÉEL, même geste : jeton renouvelé ORDINAIRE — la marque ne fuit jamais vers un vrai club', [rr.resume, reelAvant, reelApres]);
    await b.jouer(() => B.clic(b, B.clubLigne(b, 'CLAMART').querySelector('.bouton-editer-club')));
    const edition = B.clubLigne(b, 'CLAMART');
    edition.querySelector('.club-edit-prenom').value = 'ALEX'; edition.querySelector('.club-edit-contact').value = 'DUPONT';
    edition.querySelector('.club-edit-email').value = 'secretariat@clamart-modifie.example.org';
    const r2 = await b.jouer(() => B.clic(b, B.clubLigne(b, 'CLAMART').querySelector('.btn-enregistrer-edition')));
    t.vrai(actions(r2)[0] === 'modifierClubInvite' && ligne(b, 'CLAMART').club_contact_email === 'secretariat@clamart-modifie.example.org' &&
      ligne(b, 'CLAMART').club_token === neuf, 'J.3 puis contact et adresse modifiés depuis l\'écran : plus d\'adresse réservée, seul le jeton renouvelé marque encore le club',
    [r2.resume, ligne(b, 'CLAMART')]);
    const r3 = await reinit(b);
    const classeur = json(['ClubsInvites', 'Equipes'].map((o) => b.srv.appeler('lireOngletSimple', b.srv.classeur, o)));
    t.vrai(r3.attendues[0].action === 'reinitialiserTournoi' && !ligne(b, 'CLAMART').club_nom && classeur.indexOf('demo-racing-') === -1 &&
      classeur.indexOf('example.invalid') === -1 && classeur.indexOf('modifie.example.org') === -1 && b.srv.equipes().length === 0 &&
      !ecrans(b).clubs.some((c) => c.nom === 'CLAMART') && ligne(b, 'CLUB REEL').club_contact_email === 'contact@club-reel.example.org',
    'J.4 réinitialisation depuis l\'écran : le club fictif et toutes ses données ont disparu ; le club réel reste, contact intact',
    [r3.resume, b.srv.appeler('lireOngletSimple', b.srv.classeur, 'ClubsInvites').map((c) => [c.club_nom, c.club_contact_email])]);

    // Double déclenchement de « Renvoyer le dossier final » : une question, UN jeton tiré, une fenêtre.
    const d = await banc({ modele: 'legacy', monde: jeuServeur });
    const rd = await d.jouer(() => Promise.all([dossier(d, 'CLAMART'), dossier(d, 'CLAMART')]));
    t.vrai(rd.requetes.filter((q) => q.action === 'regenererJetonClub').length === 1 && d.dialogues.filter((x) => /NOUVEAU lien/.test(x)).length === 1 &&
      d.doc.querySelectorAll('.eml-overlay').length === 1 && d.global('envoiEnCours')('lien', 'CLAMART') === false && /^demo-racing-/.test(ligne(d, 'CLAMART').club_token),
    'J.5 double clic pendant la question « Nouveau lien ? » : ignoré — UN jeton, UNE fenêtre ; la garde est rendue ensuite', [rd.resume, d.dialogues.length]);

    // Réponse perdue, silencieuse, ou réseau coupé : jamais renvoyée, aucune fenêtre avec un lien peut-être mort, liste relue.
    for (const mode of ['http404-apres', 'silence', 'reseau-avant']) {
      let premiere = true;
      const p = await banc({ modele: 'legacy', monde: jeuServeur, panne: (e) => (e.action === 'regenererJetonClub' && premiere ? (premiere = false, mode) : null) });
      const avant = ligne(p, 'CLAMART').club_token;
      const rp = await p.jouer(() => dossier(p, 'CLAMART'));
      const apres = ligne(p, 'CLAMART').club_token;
      const ecrit = mode !== 'reseau-avant';
      const affiche = (p.global('clubsInvitesCourants').find((c) => c.club_nom === 'CLAMART') || {}).club_token;
      const alerte = p.dialogues.filter((x) => /^ALERTE /.test(x)).join(' ');
      t.vrai(rp.requetes.filter((q) => q.action === 'regenererJetonClub').length === 1 && !rp.bloque && actions(rp).indexOf('listerClubsInvites') !== -1 &&
        /n’est pas confirmé/.test(alerte) && !p.doc.querySelector('.eml-overlay') && affiche === apres && p.global('envoiEnCours')('lien', 'CLAMART') === false &&
        (ecrit ? apres !== avant && /^demo-racing-/.test(apres) : apres === avant) && (mode !== 'silence' || /délai de 30 s dépassé/.test(alerte)),
      'J.6.' + mode + ' « Nouveau lien » ' + (mode === 'silence' ? 'sans réponse (30 s)' : mode === 'reseau-avant' ? 'réseau coupé' : 'réponse perdue') +
        ' : UNE émission, « non confirmé », aucune fenêtre, liste relue' + (ecrit ? ' — le jeton écrit garde sa marque' : ' — rien écrit'),
      [rp.resume, avant, apres, affiche, alerte.slice(0, 160)]);
      if (mode === 'http404-apres') {
        p.srv.postMesure({ action: 'modifierClubInvite', cle: CLE, club_nom_actuel: 'CLAMART', club_nom: 'CLAMART', club_contact_nom: 'DUPONT',
          club_contact_email: 'secretariat@clamart-modifie.example.org' });
        p.srv.postMesure({ action: 'reinitialiserTournoi', cle: CLE });
        t.vrai(!ligne(p, 'CLAMART').club_nom && json(p.srv.appeler('lireOngletSimple', p.srv.classeur, 'ClubsInvites')).indexOf('demo-racing-') === -1,
          'J.7 après une réponse perdue, adresse modifiée puis réinitialisation : le club fictif est purgé quand même', ligne(p, 'CLAMART'));
      }
    }

    // Versions mêlées.
    const v = await B.banc({ lire: B.LECTEUR_AVANT, backend: CODE, modele: 'legacy', monde: jeuServeur });
    const rv = await v.jouer(() => dossier(v, 'CLAMART'));
    t.vrai(!v.erreurBranchement && actions(rv).join() === 'regenererJetonClub' && /^demo-racing-/.test(ligne(v, 'CLAMART').club_token) && !!v.doc.querySelector('.eml-overlay'),
      'J.8 ANCIEN frontend (a8d549424f6161962b35a476946d09e81b5c988b) + nouveau backend : même requête, le jeton garde sa marque, la fenêtre s\'ouvre',
      [rv.resume, ligne(v, 'CLAMART').club_token, v.erreurBranchement]);
    const a = await B.banc({ lire: LIRE, backend: B.BACKEND_AVANT(), modele: 'legacy', monde: (m) => { reel(m); m.cache.delete('snapshot_json_v3'); } });
    const ra = await a.jouer(() => a.global('renouvelerLienSiDemande')({ club_nom: 'CLUB REEL', dossier_envoye: '2026-09-10' }));
    t.vrai(!a.erreurBranchement && actions(ra).join() === 'regenererJetonClub' && a.dialogues.some((x) => /Nouveau lien créé/.test(x)) &&
      !!ligne(a, 'CLUB REEL').club_token, 'J.9 nouveau frontend + ANCIEN backend (0fcf9f1367719ff8074f722f41fabe0e09e9fbf0) : « Nouveau lien » fonctionne comme avant (la marque du jeu exige le nouveau backend, publié en premier)',
    [ra.resume, a.dialogues]);
    for (const [code, fichiers] of [['J.10', ['js/admin-invitations.js']], ['J.11', ['js/admin-suivi-clubs.js']], ['J.12', ['js/admin.js', 'admin.html']]]) {
      const x = await B.banc({ lire: B.lecteurMele(fichiers, LIRE), backend: CODE, modele: 'legacy', monde: jeuServeur });
      const rx = await x.jouer(() => dossier(x, 'CLAMART'));
      t.vrai(!x.erreurBranchement && rx.requetes.filter((q) => q.action === 'regenererJetonClub').length === 1 && /^demo-racing-/.test(ligne(x, 'CLAMART').club_token) &&
        !!x.doc.querySelector('.eml-overlay'), code + ' cache mêlé — ' + fichiers.join(', ') + ' d\'avant : « Nouveau lien » = une requête, jeton marqué, fenêtre ouverte',
      [rx.resume, x.erreurBranchement]);
    }
  });

  /* ============================== R — réinitialisation ============================== */
  console.log('\nR — réinitialisation');
  await essai('R', async () => {
    const b = await banc();
    await b.demo();
    const avantReset = ecrans(b);
    b.doc.body.appendChild(Object.assign(b.doc.createElement('div'), { id: 'bloc-reinit' }));
    b.doc.getElementById('bloc-reinit').innerHTML = '<button id="bouton-reinitialiser"></button><div id="message-reinitialisation"></div><div id="arbitrages"></div>';
    const r = await b.jouer(() => b.global('onReinitialiser')());
    const v = ecrans(b);
    const fictifs = (json(['Clubs', 'Participations', 'Equipes'].map((o) => b.srv.appeler('lireOngletSimple', b.srv.classeur, o))).match(/example\.invalid/g) || []).length;
    t.vrai(avantReset.equipes.length === 21 && avantReset.clubs.length === 12 && r.attendues[0].action === 'reinitialiserTournoi' && v.clubs.length === 0 && v.suivi.length === 0 && v.equipes.length === 0 &&
      b.srv.equipes().length === 0 && fictifs === 0, 'R.1 réinitialiser depuis l\'écran : Clubs invités, Suivi, Équipes vides ; plus aucune donnée fictive du jeu dans le classeur',
    [r.resume, v.clubs.length, v.equipes.length, fictifs]);
    // ⭐ 4ᵉ passage : réinitialisation BORNÉE (3 min), jamais renvoyée ; issue inconnue → relecture complète, message honnête.
    const resetAvecPanne = async (mode) => {
      let premiere = true;
      const x = await banc({ panne: (e) => (e.action === 'reinitialiserTournoi' && premiere ? (premiere = false, mode) : null) });
      await x.demo();
      x.doc.body.appendChild(Object.assign(x.doc.createElement('div'), { id: 'bloc-reinit' }));
      x.doc.getElementById('bloc-reinit').innerHTML = '<button id="bouton-reinitialiser"></button><div id="message-reinitialisation"></div><div id="arbitrages"></div>';
      const rr = await x.jouer(() => x.global('onReinitialiser')());
      return { x, rr, e: ecrans(x), msg: x.texte('message-reinitialisation'), emissions: rr.requetes.filter((q) => q.action === 'reinitialiserTournoi') };
    };
    for (const [code, mode, faite] of [['R.2', 'silence', true], ['R.3', 'http404-apres', true], ['R.4', 'reseau-avant', false]]) {
      const z = await resetAvecPanne(mode);
      t.vrai(!z.rr.bloque && z.emissions.length === 1 && z.emissions[0].delaiMs === 180000 && actions(z.rr).indexOf('getAll') !== -1 &&
        /n’est pas confirmée/.test(z.msg) && /Rien n’est renvoyé/.test(z.msg) && !z.x.id('bouton-reinitialiser').disabled &&
        (faite ? z.x.srv.equipes().length === 0 && z.e.equipes.length === 0 && z.e.clubs.length === 0 && /elle a bien eu lieu/.test(z.msg)
          : z.x.srv.equipes().length === 21 && z.e.equipes.length === 21 && /n’a pas eu lieu/.test(z.msg)),
      code + ' réinitialisation, ' + ({ silence: 'réponse muette', 'http404-apres': 'réponse perdue (404 après exécution)', 'reseau-avant': 'réseau coupé avant le serveur' })[mode] +
        ' : bornée à 180 s, UNE émission, bouton rendu, écran RELU depuis le serveur, message « non confirmée » qui dit ce que la relecture a trouvé',
      [z.rr.resume, z.emissions.map((q) => q.delaiMs), z.msg, z.x.srv.equipes().length, z.e.equipes.length]);
    }
    const occupe = await resetAvecPanne('verrou-occupe');
    t.vrai(actions(occupe.rr).join() === 'reinitialiserTournoi' && /occupé/.test(occupe.msg) && occupe.x.srv.equipes().length === 21 && occupe.e.equipes.length === 21,
      'R.5 refus lisible (verrou occupé) : rien effacé, message du serveur tel quel, aucune relecture', [occupe.rr.resume, occupe.msg]);
  });

  /* ============================== Q — la réponse porte ce que l'écran relisait (4ᵉ passage) ============================== */
  console.log('\nQ — gestes de la liste des clubs : l\'état relu vient de la réponse, plus d\'une seconde requête');
  await essai('Q', async () => {
    const panneUne = (action, mode, rang) => { let n = 0; return (e) => (e.action === action && ++n === (rang || 1) ? mode : null); };
    const etatEcran = (b) => json([b.global('clubsInvitesCourants'), b.global('equipesCourantes')]);
    const etatServeur = (b) => json([b.srv.clubs(), b.srv.equipes()]);
    const avecEquipesB = (m) => { B.MI.amorcerClubs(m); m.postMesure({ action: 'enregistrerCategoriesEngagees', cle: B.MI.CLE_ADMIN, club_nom: 'CLUB FICTIF B', categories_engagees: 'U10,U12' }); };
    const GESTES = [
      ['Q.1', 'ajouter un club', 'ajouterClubInvite', B.MI.amorcerClubs, (b) => { b.id('champ-club-nom').value = 'club fictif d'; b.id('champ-club-email').value = 'club-d@example.invalid';
        return b.global('onAjouterClubInvite')({ preventDefault() {} }); }, 'listerClubsInvites', (b) => !!B.clubLigne(b, 'CLUB FICTIF D')],
      ['Q.2', 'modifier les coordonnées', 'modifierClubInvite', B.MI.amorcerClubs, async (b) => {
        await B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-editer-club'));
        B.clubLigne(b, 'CLUB FICTIF A').querySelector('.club-edit-email').value = 'club-a2@example.invalid';
        return B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.btn-enregistrer-edition')); }, 'listerClubsInvites',
      (b) => /club-a2@example\.invalid/.test(B.clubLigne(b, 'CLUB FICTIF A').textContent)],
      ['Q.3', 'retirer un club sans équipe (aperçu + retrait)', 'supprimerClubInvite', B.MI.amorcerClubs,
        (b) => B.clic(b, B.clubLigne(b, 'CLUB FICTIF C').querySelector('.bouton-suppr-club')), 'listerClubsInvites', (b) => !B.clubLigne(b, 'CLUB FICTIF C')],
      ['Q.4', 'retirer un club AVEC équipes (clubs et équipes suivent)', 'supprimerClubInvite', avecEquipesB,
        (b) => B.clic(b, B.clubLigne(b, 'CLUB FICTIF B').querySelector('.bouton-suppr-club')), 'listerClubsInvites,getEquipes',
        (b) => !B.clubLigne(b, 'CLUB FICTIF B') && b.equipesAffichees().length === 0],
      ['Q.5', 'ajouter les équipes au tournoi (catégories engagées)', 'enregistrerCategoriesEngagees', B.MI.amorcerClubs,
        (b) => B.clic(b, B.clubLigne(b, 'CLUB FICTIF B').querySelector('.bouton-cats-club')), 'getEquipes', (b) => b.equipesAffichees().length === 2],
      ['Q.6', 'envoyer aux clubs non encore invités (envoi groupé)', 'envoyerInvitationsGroupe', B.MI.amorcerClubs,
        (b) => b.global('onEnvoyerInvitationsGroupe')(), 'listerClubsInvites',
        (b) => !!String((b.global('clubsInvitesCourants').find((c) => c.club_nom === 'CLUB FICTIF A') || {}).invitation_envoyee || '')]
    ];
    for (const [code, libelle, action, monde, geste, relecture, visible] of GESTES) {
      const b = await banc({ monde });
      const r = await b.jouer(() => geste(b));
      const principales = actions(r).filter((a) => a === action).length;
      const nav = await b.jouer(async () => { await b.global('ouvrirEtapeAdmin')('suivi-clubs'); await b.global('ouvrirEtapeAdmin')('equipes');
        await b.global('ouvrirEtapeAdmin')('invitation'); });
      t.vrai(actions(r).every((a) => a === action) && principales === (action === 'supprimerClubInvite' ? 2 : 1) && visible(b) &&
        etatEcran(b) === etatServeur(b) && r.requetes.every((q) => q.corps.renvoyer_etat === 'oui') && nav.requetes.length === 0,
      code + ' ' + libelle + ' : ' + (action === 'supprimerClubInvite' ? 'aperçu + retrait' : 'UNE requête') + ', aucune relecture ; les écrans montrent l\'état RELU par le serveur, ' +
        'et la navigation qui suit ne relit rien', [r.resume, nav.resume, etatEcran(b) === etatServeur(b)]);
      // Backend d'avant (réponse sans les listes) : la relecture d'avant, et le même état final.
      const c = await banc({ monde, panne: panneUne(action, 'sans-etat', action === 'supprimerClubInvite' ? 2 : 1) });   // le retrait, pas l'aperçu
      const rc = await c.jouer(() => geste(c));
      t.vrai(actions(rc).filter((a) => a !== action).join() === relecture && visible(c) && etatEcran(c) === etatServeur(c),
        code + '.R même geste, réponse SANS les listes (backend d\'avant) : relecture comme avant (' + relecture.split(',').join(' + ') + '), même état final', rc.resume);
    }
    // Réinitialisation : hors du mécanisme (le verrou d'une réinitialisation n'est pas allongé) — sa relecture ne change pas.
    const reset = async (panne) => {
      const b = await banc({ panne });
      await b.demo();
      b.doc.body.appendChild(Object.assign(b.doc.createElement('div'), { id: 'bloc-reinit' }));
      b.doc.getElementById('bloc-reinit').innerHTML = '<button id="bouton-reinitialiser"></button><div id="message-reinitialisation"></div><div id="arbitrages"></div>';
      const r = await b.jouer(() => b.global('onReinitialiser')());
      return { b, r };
    };
    const z = await reset();
    t.vrai(actions(z.r)[0] === 'reinitialiserTournoi' && z.r.requetes[0].corps.renvoyer_etat === undefined &&
      actions(z.r).filter((a) => a === 'listerClubsInvites').length === 1 && z.b.clubsAffiches().length === 0 &&
      json(z.b.global('clubsInvitesCourants')) === json(z.b.srv.clubs()),
    'Q.7 réinitialiser : inchangé (la demande n\'est pas envoyée, la liste des clubs est relue comme avant)', z.r.resume);
  });

  /* ============================== Y — e-mails hors verrou (5ᵉ passage) ============================== */
  console.log('\nY — e-mails : un identifiant par geste, reprise sans double envoi, renvoi seulement confirmé');
  await essai('Y', async () => {
    const CLE_REGISTRE = (type, nom) => 'ENVOI_EMAIL|' + type + '|' + nom.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    const avecMontantB = (m) => {
      B.MI.amorcerClubs(m);
      m.appeler('ecrireEngagementClub', m.classeur, 'CLUB FICTIF B', { detail_effectifs: JSON.stringify({ U10: [{ j: 12, e: 1 }],
        U12: [{ j: 13, e: 2 }], _restauration: { total: '120' } }) }, false);
    };
    const avecRelanceA = (m) => { avecMontantB(m); m.appeler('ecrireEngagementClub', m.classeur, 'CLUB FICTIF A', { statut: 'Invité', invitation_envoyee: '2026-09-03' }, true); };
    const premiere = (action, mode) => { let n = 0; return (e) => (e.action === action && ++n === 1 ? mode : null); };
    const de = (r, action) => r.requetes.filter((q) => q.action === action);
    const idOk = (q) => typeof q.corps.id_envoi === 'string' && q.corps.id_envoi.length >= 8;
    // Y.1 — chaque geste d'e-mail : UNE requête, un identifiant de geste, aucune relecture après le succès.
    const gestes = [
      ['invitation', 'envoyerInvitationClub', B.MI.amorcerClubs, (b) => B.clic(b, B.clubLigne(b, 'CLUB FICTIF A').querySelector('.bouton-inviter-club'))],
      ['relance de la réponse', 'envoyerInvitationClub', avecRelanceA, (b) => b.global('envoyerInvitationClubUI')('CLUB FICTIF A', { relance: true })],
      ['envoi groupé', 'envoyerInvitationsGroupe', B.MI.amorcerClubs, (b) => b.global('onEnvoyerInvitationsGroupe')()],
      ['relance de paiement', 'relancerPaiementClub', avecMontantB, (b) => b.global('suiviRelancerPaiement')('CLUB FICTIF B')],
      ['renvoi de la confirmation', 'renvoyerConfirmationReponseClub', avecMontantB, (b) => b.global('suiviRenvoyerConfirmation')('CLUB FICTIF B')]
    ];
    const lignes = [];
    for (const [nom, action, monde, geste] of gestes) {
      const b = await banc({ monde });
      const r = await b.jouer(() => geste(b));
      const q = de(r, action);
      lignes.push([nom, r.requetes.length === 1 && q.length === 1 && idOk(q[0]) && q[0].corps.confirmer_renvoi === 'non' && !q[0].reponse.error &&
        b.srv.courrielsEnvoyes() >= 1, r.resume, q[0] && q[0].corps.id_envoi]);
    }
    t.vrai(lignes.every((l) => l[1]), 'Y.1 invitation, relance, envoi groupé, relance de paiement, confirmation : UNE requête portant l\'identifiant du geste, aucune relecture après le succès',
      lignes.filter((l) => !l[1]));
    // Y.2 — réponse perdue APRÈS l'envoi, puis nouveau clic : même identifiant, le serveur répond « déjà envoyé ».
    const b2 = await banc({ monde: avecMontantB, panne: premiere('relancerPaiementClub', 'http404-apres') });
    const p1 = await b2.jouer(() => b2.global('suiviRelancerPaiement')('CLUB FICTIF B'));
    b2.dialogues.length = 0;
    const p2 = await b2.jouer(() => b2.global('suiviRelancerPaiement')('CLUB FICTIF B'));
    const q1 = de(p1, 'relancerPaiementClub')[0], q2 = de(p2, 'relancerPaiementClub')[0];
    t.vrai(/non reçue/.test(b2.texte('message-suivi-clubs') || '') === false && q1 && q2 && q2.corps.id_envoi === q1.corps.id_envoi &&
      q2.corps.confirmer_renvoi === 'oui' && q2.reponse.rejeu === true && b2.srv.courrielsEnvoyes() === 1 &&
      b2.dialogues.some((d) => /pas été confirmé/.test(d)) && /déjà partie/.test(b2.texte('message-suivi-clubs')) && /rien n’a été renvoyé/.test(b2.texte('message-suivi-clubs')),
    'Y.2 réponse perdue APRÈS l\'envoi, nouveau clic confirmé : même geste (même identifiant) → « déjà partie, rien n\'a été renvoyé » ; UN seul e-mail',
    [p1.resume, p2.resume, b2.texte('message-suivi-clubs'), b2.srv.courrielsEnvoyes()]);
    // Y.3 — réponse perdue AVANT l'envoi (réseau coupé) : le nouveau clic envoie, une fois.
    const b3 = await banc({ monde: avecRelanceA, panne: premiere('envoyerInvitationClub', 'reseau-avant') });
    const r31 = await b3.jouer(() => b3.global('envoyerInvitationClubUI')('CLUB FICTIF A', { relance: true }));
    const r32 = await b3.jouer(() => b3.global('envoyerInvitationClubUI')('CLUB FICTIF A', { relance: true }));
    const a31 = de(r31, 'envoyerInvitationClub')[0], a32 = de(r32, 'envoyerInvitationClub')[0];
    t.vrai(a31 && a32 && a32.corps.id_envoi === a31.corps.id_envoi && !a32.reponse.rejeu && a32.reponse.ok && b3.srv.courrielsEnvoyes() === 1 &&
      /Relance envoyée/.test(b3.texte('message-suivi-clubs') || b3.texte('message-club-invite') || ''),
    'Y.3 réponse perdue AVANT l\'envoi (réseau coupé), nouveau clic : la relance part UNE fois', [r31.resume, r32.resume, b3.srv.courrielsEnvoyes()]);
    // Y.4 — un autre écran vient d'envoyer : refus « déjà partie », confirmation explicite, puis un seul renvoi (ou rien).
    for (const [code, reponse, attendus, courriels] of [['Y.4', true, 2, 2], ['Y.4b', false, 1, 1]]) {
      const b = await banc({ monde: avecMontantB, dialogues: [true, reponse] });
      b.srv.postMesure({ action: 'relancerPaiementClub', cle: B.MI.CLE_ADMIN, club_nom: 'CLUB FICTIF B', id_envoi: 'autre-ecran' });
      const r = await b.jouer(() => b.global('suiviRelancerPaiement')('CLUB FICTIF B'));
      const q = de(r, 'relancerPaiementClub');
      t.vrai(q.length === attendus && q[0].reponse.code === 'envoi_recent' && b.dialogues.some((d) => /déjà partie.*Envoyer quand même/s.test(d)) &&
        (reponse ? q[1].corps.confirmer_renvoi === 'oui' && q[1].corps.id_envoi === q[0].corps.id_envoi && q[1].reponse.ok
          : /Renvoi annulé : rien n’a été envoyé/.test(b.texte('message-suivi-clubs'))) && b.srv.courrielsEnvoyes() === courriels,
      code + (reponse ? ' e-mail parti depuis un autre écran : refus « déjà partie », renvoi CONFIRMÉ → une seconde requête, un e-mail de plus (voulu)'
        : ' même refus, renvoi REFUSÉ → aucune autre requête, « Renvoi annulé : rien n\'a été envoyé »'), [r.resume, b.dialogues, b.texte('message-suivi-clubs')]);
    }
    // Y.5 — un autre écran est EN TRAIN d'envoyer : refus lisible, aucune confirmation proposée, aucun e-mail.
    const b5 = await banc({ monde: avecMontantB, avantServir: (e, srv) => {
      if (e.action === 'relancerPaiementClub') srv.proprietes.set(CLE_REGISTRE('relance_paiement', 'CLUB FICTIF B'), JSON.stringify({ e: 'envoi', id: 'autre', r: Date.now(), t: Date.now() }));
    } });
    const r5 = await b5.jouer(() => b5.global('suiviRelancerPaiement')('CLUB FICTIF B'));
    t.vrai(de(r5, 'relancerPaiementClub').length === 1 && /déjà en cours/.test(b5.texte('message-suivi-clubs')) && !b5.dialogues.some((d) => /Envoyer quand même/.test(d)) &&
      b5.srv.courrielsEnvoyes() === 0, 'Y.5 deux écrans : l\'autre envoie en ce moment → « déjà en cours », aucune proposition de renvoi, aucun e-mail', [r5.resume, b5.texte('message-suivi-clubs')]);
    // Y.6 — envoi groupé partiellement servi : chaque club non servi est nommé avec sa raison ; la liste vient de la réponse.
    const b6 = await banc({ monde: (m) => { B.MI.amorcerClubs(m); ['D', 'E'].forEach((x) => m.appeler('ajouterClubInvite', m.classeur, { club_nom: 'CLUB FICTIF ' + x,
      club_contact_nom: 'CONTACT', club_contact_prenom: x, club_contact_email: 'club-' + x.toLowerCase() + '@example.invalid' }));
      const envoi = m.contexte.__banc_courriel;
      m.contexte.__banc_courriel = (d, s) => { if (d === 'club-d@example.invalid') throw new Error('boîte pleine (fictif)'); return envoi(d, s); };
      m.proprietes.set(CLE_REGISTRE('invitation', 'CLUB FICTIF E'), JSON.stringify({ e: 'envoi', id: 'autre', r: Date.now(), t: Date.now() })); } });
    const r6 = await b6.jouer(() => b6.global('onEnvoyerInvitationsGroupe')());
    const texte6 = b6.texte('message-invitations');
    t.vrai(r6.requetes.length === 1 && /✅ 1 invitation/.test(texte6) && /1 échec\(s\) : CLUB FICTIF D/.test(texte6) && /déjà en cours d’envoi \(autre écran\) : CLUB FICTIF E/.test(texte6) &&
      b6.srv.courrielsEnvoyes() === 1 && String((b6.global('clubsInvitesCourants').find((c) => c.club_nom === 'CLUB FICTIF A') || {}).invitation_envoyee) !== '' &&
      !String((b6.global('clubsInvitesCourants').find((c) => c.club_nom === 'CLUB FICTIF D') || {}).invitation_envoyee || ''),
    'Y.6 envoi groupé partiel : 1 envoyée, l\'échec NOMMÉ, le club « en cours ailleurs » NOMMÉ ; liste appliquée depuis la réponse (A invité, D non), UNE requête', [r6.resume, texte6]);
    // Y.7 — nouveau frontend, ANCIEN backend (0fcf9f1367719ff8074f722f41fabe0e09e9fbf0) : les champs sont ignorés, tout marche comme avant.
    const anciens = [];
    for (const [nom, action, monde, geste] of gestes) {
      const b = await banc({ monde, backend: B.BACKEND_AVANT() });
      const r = await b.jouer(() => geste(b));
      anciens.push([nom, de(r, action).length === 1 && !de(r, action)[0].reponse.error && b.srv.courrielsEnvoyes() >= 1, r.resume]);
    }
    t.vrai(anciens.every((l) => l[1]), 'Y.7 nouveau frontend + ANCIEN backend : chaque e-mail part une fois, comme avant (identifiant ignoré)', anciens.filter((l) => !l[1]));
    // Y.8 — ANCIEN frontend (a8d549424f6161962b35a476946d09e81b5c988b) + nouveau backend : deux relances coup sur coup = un e-mail.
    const b8 = await banc({ monde: avecMontantB, lire: B.LECTEUR_AVANT });
    const r81 = await b8.jouer(() => b8.global('suiviRelancerPaiement')('CLUB FICTIF B'));
    const r82 = await b8.jouer(() => b8.global('suiviRelancerPaiement')('CLUB FICTIF B'));
    t.vrai(de(r81, 'relancerPaiementClub')[0].reponse.ok && de(r82, 'relancerPaiementClub')[0].reponse.code === 'envoi_recent' &&
      /déjà partie/.test(b8.texte('message-suivi-clubs')) && b8.srv.courrielsEnvoyes() === 1,
    'Y.8 ANCIEN frontend + nouveau backend : la seconde relance est refusée par le serveur et le message le dit ; UN e-mail', [r81.resume, r82.resume, b8.texte('message-suivi-clubs')]);
    // Y.9 — caches mêlés : un seul des deux modules est d'avant ; aucune erreur, un e-mail par geste.
    const meles = [];
    for (const avant of [['js/admin-suivi-clubs.js'], ['js/admin-invitations.js']]) {
      const b = await banc({ monde: avecMontantB, lire: B.lecteurMele(avant, LIRE) });
      const r = await b.jouer(() => b.global('suiviRelancerPaiement')('CLUB FICTIF B'));
      const q = de(r, 'relancerPaiementClub');
      meles.push([avant[0], q.length === 1 && q[0].reponse.ok && b.srv.courrielsEnvoyes() === 1 && /envoyée/.test(b.texte('message-suivi-clubs')), r.resume]);
    }
    t.vrai(meles.every((l) => l[1]), 'Y.9 caches mêlés (Suivi d\'avant + invitations d\'après, et l\'inverse) : la relance part une fois, message juste', meles.filter((l) => !l[1]));
  });

  console.log('\n' + (process.exitCode ? 'ÉCHEC' : 'OK — ' + t.n + ' contrôles de l\'écran « Inviter un club » passés.'));
})().catch((e) => { console.error(e); process.exitCode = 1; });
