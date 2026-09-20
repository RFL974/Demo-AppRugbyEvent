/* Suivi des clubs : états, restauration, paiements et relances, sans réseau réel. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function vrai(v, m) { assert.ok(v, m); controles++; }
function egal(a, b, m) { assert.equal(a, b, m); controles++; }
function noeud() {
  return { innerHTML: '', textContent: '', closest() { return null; },
    classList: { toggle() {}, add() {}, remove() {} },
    querySelector() { return null; }, querySelectorAll() { return []; } };
}

async function principal() {
  const dom = {
    'suivi-clubs-resume': noeud(), 'suivi-clubs-filtres': noeud(),
    'liste-suivi-clubs': noeud(), 'message-suivi-clubs': noeud(), 'message-club-invite': noeud(),
    'cv-fiche-club': noeud()
  };
  const posts = [], confirmations = [];
  const contexte = vm.createContext({
    console, setTimeout,
    document: { getElementById: id => dom[id] || null, addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [] },
    configCourante: { global: {
      repas_sur_place_oui: 'oui', repas_sur_place_mode: 'prix_personne',
      gouter_fin_tournoi_oui: 'oui', gouter_fin_tournoi_mode: 'prix_personne'
    } },
    clubsInvitesCourants: [],
    echapper: s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
    estOui: v => String(v).toLowerCase() === 'oui',
    memeTexteSouple: (a, b) => String(a || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
      String(b || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    estAccepte: v => ['accepte', 'confirme'].includes(String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()),
    afficherMessage: (el, texte, type) => { el.textContent = texte; el.type = type; },
    dialogConfirmer: async texte => { confirmations.push(texte); return true; },
    ecrireAdmin: async (action, data) => {
      posts.push({ action, data });
      if (action === 'enregistrerPaiementClub') return data.statut === 'paye'
        ? { paiement_statut: 'Payé', date_paiement: '2026-09-19' }
        : { paiement_statut: '', date_paiement: '' };
      if (action === 'relancerPaiementClub') return { derniere_relance_paiement: '2026-09-19' };
      if (action === 'renvoyerConfirmationReponseClub') return {
        confirmation_reponse_envoyee: '2026-09-19 18:22:00', confirmation_reponse_erreur: ''
      };
      return {};
    },
    envoyerInvitationClubUI: async () => {}
  });
  vm.runInContext(lire('js/vendor/pdf-lib.min.js'), contexte, { filename: 'js/vendor/pdf-lib.min.js' });
  vm.runInContext(lire('js/admin-invitations.js'), contexte, { filename: 'js/admin-invitations.js' });
  vm.runInContext(lire('js/admin-suivi-clubs.js'), contexte, { filename: 'js/admin-suivi-clubs.js' });

  const commande = { inscription: { sous_total: '40' },
    repas: { joueurs: 12, educateurs: 3, sous_total: '120' },
    gouter: { joueurs: 8, educateurs: 2, sous_total: '25' }, total: '185' };
  const clubs = [
    { club_nom: 'Sans réponse', club_contact_email: 'attente@test.fr', statut: 'Invité', invitation_envoyee: '2026-09-10' },
    { club_nom: 'Accepté impayé', club_contact_email: 'du@test.fr', statut: 'Accepté', date_reponse: '2026-09-12',
      nb_joueurs_total: '12', nb_educateurs_total: '3',
      confirmation_reponse_erreur: 'panne transport',
      detail_effectifs: JSON.stringify({ U8: [{ j: 12, e: 3 }], _restauration: commande }) },
    { club_nom: 'Accepté payé', club_contact_email: 'paye@test.fr', statut: 'Accepté', date_reponse: '2026-09-13',
      nb_joueurs_total: '10', nb_educateurs_total: '2',
      confirmation_reponse_envoyee: '2026-09-19 18:22:00', paiement_statut: 'Payé', date_paiement: '2026-09-18',
      detail_effectifs: JSON.stringify({ _restauration: commande }) },
    { club_nom: 'Décliné', club_contact_email: 'non@test.fr', statut: 'Décliné', date_reponse: '2026-09-11',
      confirmation_reponse_envoyee: '2026-09-19 18:23:00' }
  ];
  contexte.clubsInvitesCourants = clubs;
  vm.runInContext('clubsInvitesCourants = globalThis.clubsInvitesCourants;', contexte);

  const lu = contexte.suiviClubCommande(clubs[1]);
  egal(lu.repas.joueurs + lu.repas.educateurs, 15, 'les repas commandés sont lus dans la réponse figée');
  egal(lu.gouter.joueurs + lu.gouter.educateurs, 10, 'les goûters commandés sont lus dans la réponse figée');
  egal(lu.total, 185, 'le total dû vient de la réponse et non des tarifs courants');
  vrai(contexte.suiviClubEtat(clubs[0]).attente, 'un club invité sans réponse est à relancer');
  vrai(contexte.suiviClubEtat(clubs[1]).paiementAttendu, 'un club accepté avec total est à payer');
  vrai(contexte.suiviClubEtat(clubs[2]).paye, 'la marque Payé est reconnue');
  vrai(contexte.suiviClubEtat(clubs[3]).decline, 'une réponse non est distinguée');
  vrai(contexte.suiviClubEtat(clubs[1]).confirmationAttendue && !contexte.suiviClubEtat(clubs[2]).confirmationAttendue,
    'une confirmation manquante est distinguée d’un envoi tracé');

  let donnees = contexte.suiviDonneesRestauration(clubs, contexte.configCourante.global);
  egal(donnees.lignes.length, 2, 'le PDF ne compte que les clubs qui participent');
  egal(donnees.totaux.repas.total, 30, 'les repas payants reprennent les quantités explicitement commandées');
  egal(donnees.totaux.gouter.total, 20, 'les goûters payants reprennent les quantités explicitement commandées');
  contexte.configCourante.global.repas_sur_place_mode = 'compris_inscription';
  contexte.configCourante.global.gouter_fin_tournoi_mode = 'offert_organisateur';
  donnees = contexte.suiviDonneesRestauration(clubs, contexte.configCourante.global);
  egal(donnees.totaux.repas.total, 27, 'les repas compris sont calculés sur les effectifs joueurs et éducateurs présents');
  egal(donnees.totaux.gouter.total, 27, 'les goûters offerts sont calculés sur les effectifs joueurs et éducateurs présents');
  egal(donnees.totaux.repas.joueurs, 22, 'le total joueurs reste distinct dans le PDF');
  egal(donnees.totaux.repas.educateurs, 5, 'le total éducateurs reste distinct dans le PDF');
  const pdf = await contexte.creerPdfSuiviRestauration(donnees, Object.assign({
    tournoi_nom: 'Démo Racing', tournoi_date: '2026-10-03'
  }, contexte.configCourante.global));
  vrai(pdf.length > 1000 && String.fromCharCode.apply(null, Array.from(pdf.slice(0, 4))) === '%PDF',
    'le document généré est un vrai PDF non vide');
  egal(posts.length, 0, 'générer le PDF ne déclenche aucune écriture réseau');
  const ancienClub = { club_nom: 'Ancien', statut: 'Accepté',
    detail_effectifs: JSON.stringify({ U8: [{ j: 8, e: 2 }, { j: 9, e: 1 }] }) };
  const ancien = contexte.suiviDonneesRestauration([ancienClub], contexte.configCourante.global);
  egal(ancien.totaux.repas.total, 20, 'le détail par équipe sert de repli aux anciennes réponses');
  const aucun = contexte.suiviDonneesRestauration([clubs[0], clubs[3]], contexte.configCourante.global);
  egal(aucun.lignes.length, 0, 'un club en attente ou absent ne gonfle jamais les quantités à préparer');
  contexte.configCourante.global.repas_sur_place_mode = 'prix_personne';
  contexte.configCourante.global.gouter_fin_tournoi_mode = 'prix_personne';

  contexte.afficherSuiviClubs();
  vrai(dom['suivi-clubs-resume'].innerHTML.includes('Réponses attendues') &&
    dom['suivi-clubs-resume'].innerHTML.includes('Paiements attendus'), 'le résumé expose les deux actions prioritaires');
  vrai(dom['liste-suivi-clubs'].innerHTML.indexOf('Sans réponse') < dom['liste-suivi-clubs'].innerHTML.indexOf('Accepté impayé'),
    'les réponses manquantes apparaissent avant les paiements manquants');
  // Le TABLEAU porte des valeurs comparables : une quantité par prestation, le montant, l'état.
  ['Club', 'Réponse', 'Repas', 'Goûters', 'Montant', 'Paiement', 'Action'].forEach(function (c) {
    vrai(dom['liste-suivi-clubs'].innerHTML.includes('<span role="columnheader">' + c + '</span>'),
      'le tableau garde sa colonne « ' + c + ' »');
  });
  vrai(dom['liste-suivi-clubs'].innerHTML.includes('data-label="Repas" title="15 repas">15<') &&
    dom['liste-suivi-clubs'].innerHTML.includes('data-label="Goûters" title="10 goûters">10<'),
    'les quantités commandées sont lisibles dans la ligne, le libellé long restant au survol');
  vrai(dom['liste-suivi-clubs'].innerHTML.includes('data-label="Montant">185 €<'),
    'le montant dû a sa propre colonne');
  vrai(dom['liste-suivi-clubs'].innerHTML.includes('data-label="Paiement"><span class="suivi-badge est-du">En attente'),
    'l’état de paiement est dit dans la ligne');
  vrai(dom['liste-suivi-clubs'].innerHTML.includes('data-action="ouvrir-fiche" data-club="Accepté impayé"'),
    'chaque ligne ouvre la fiche de SON club');
  // ⛔ Aucune couleur seule : le liseré d'état de la ligne est doublé de sa pastille écrite.
  vrai(dom['liste-suivi-clubs'].innerHTML.includes('class="suivi-badge etat-a-enregistrer">Équipes à ajouter'),
    'l’état d’inscription reste écrit dans la ligne, pas seulement coloré');

  // La FICHE d'un club : le détail chiffré et toutes les actions, sans aucune lecture réseau.
  const avant = posts.length;
  contexte.suiviSelectionnerClub('Accepté impayé');
  egal(posts.length, avant, 'ouvrir la fiche d’un club ne déclenche aucune lecture réseau');
  const fiche = dom['cv-fiche-club'].innerHTML;
  vrai(fiche.includes('Accepté impayé') && fiche.includes('12 joueurs · 3 éducateurs'),
    'la fiche nomme le club et ses effectifs annoncés');
  vrai(fiche.includes('Frais d’inscription') && fiche.includes('Repas') && fiche.includes('Goûters'),
    'la fiche détaille la commande, frais d’inscription compris');
  vrai(fiche.includes('<dt>Total</dt><dd>185 €</dd>'), 'le total de la fiche est celui de la réponse figée');
  vrai(fiche.includes('Aucune preuve de paiement enregistrée.'), 'la fiche dit l’absence de preuve de paiement');
  vrai(fiche.includes('data-action="marquer-paye"') && fiche.includes('data-action="relance-paiement"'),
    'les deux gestes de paiement sont proposés dès l’ouverture de la fiche');
  vrai(fiche.includes('Confirmation à renvoyer'),
    'la fiche expose la panne de confirmation');
  vrai(fiche.includes('data-action="renvoyer-confirmation"'),
    'une confirmation absente propose une action de rattrapage explicite');
  vrai(fiche.includes('Ouvrir la fiche complète') && fiche.includes('id="cv-fiche-reste" hidden'),
    'le reste des actions attend un clic, et n’est donc pas dans la première lecture');
  contexte.suiviSelectionnerClub('Accepté payé');
  vrai(dom['cv-fiche-club'].innerHTML.includes('Confirmation envoyée le 19/09/2026 à 18:22'),
    'la preuve horodatée d’un envoi réussi est lisible dans la fiche');
  contexte.suiviSelectionnerClub('Accepté impayé');

  await contexte.suiviMarquerPaiement('Accepté impayé', true);
  egal(posts[0].action, 'enregistrerPaiementClub', 'marquer payé appelle uniquement l’action dédiée');
  egal(clubs[1].paiement_statut, 'Payé', 'le succès met immédiatement la ligne à jour');
  clubs[2].paiement_statut = '';
  await contexte.suiviRelancerPaiement('Accepté payé');
  egal(posts[1].action, 'relancerPaiementClub', 'la relance de paiement appelle uniquement l’action dédiée');
  await contexte.suiviRenvoyerConfirmation('Accepté impayé');
  egal(posts[2].action, 'renvoyerConfirmationReponseClub', 'le rattrapage appelle uniquement l’action dédiée');
  egal(clubs[1].confirmation_reponse_envoyee, '2026-09-19 18:22:00', 'le succès met la preuve d’envoi à jour');
  vrai(confirmations[0].includes('réception du paiement') && confirmations[1].includes('185') &&
    confirmations[2].includes('Renvoyer l’e-mail de confirmation'),
    'chaque écriture est précédée d’une confirmation explicite');

  const html = lire('admin.html');
  vrai(html.includes('id="bloc-suivi-clubs"') && html.includes('js/admin-suivi-clubs.js'),
    'le nouvel onglet et son module sont chargés par la page admin');
  vrai(html.includes('id="bouton-pdf-suivi-restauration"'),
    'le suivi propose le téléchargement du récapitulatif restauration');
  const ecrans = lire('js/ecrans.js');
  vrai(ecrans.includes("id: 'suivi-clubs'") && ecrans.indexOf("id: 'invitation'") < ecrans.indexOf("id: 'suivi-clubs'"),
    'Suivi des clubs est placé juste après Inviter un club');

  console.log('OK — ' + controles + ' contrôles passés.');
}

principal().catch(err => { console.error(err); process.exitCode = 1; });
