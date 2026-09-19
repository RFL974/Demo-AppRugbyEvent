/* Alignement des deux emails sur les menus « Invitation initiale » et « Dossier final ».
 * Code réel, DOM simulé, aucun réseau ni écriture : node tests/reorganisation-emails-invitation.test.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;

function vrai(condition, message) {
  assert.ok(condition, message);
  controles++;
}

function egal(reel, attendu, message) {
  assert.deepEqual(reel, attendu, message);
  controles++;
}

function dansOrdre(texte, reperes, message) {
  let position = -1;
  const ok = reperes.every(rep => {
    const suivante = texte.indexOf(rep, position + 1);
    if (suivante === -1) return false;
    position = suivante;
    return true;
  });
  vrai(ok, message + ' — ' + reperes.join(' → '));
}

function occurrences(texte, morceau) {
  return String(texte).split(morceau).length - 1;
}

const dom = {};
const bac = vm.createContext({
  console, URL, URLSearchParams,
  window: {
    location: { href: 'https://organisateur.exemple.invalid/demo/admin.html', search: '' },
    addEventListener() {}
  },
  document: {
    getElementById: id => dom[id] || null,
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => []
  }
});
vm.runInContext(lire('js/commun.js'), bac, { filename: 'js/commun.js' });
vm.runInContext(lire('js/admin.js'), bac, { filename: 'js/admin.js' });
vm.runInContext(lire('js/admin-infos-publication.js'), bac, { filename: 'js/admin-infos-publication.js' });
vm.runInContext(lire('js/admin-invitations.js'), bac, { filename: 'js/admin-invitations.js' });

const config = {
  global: {
    tournoi_nom: 'Tournoi Test', tournoi_date: '2027-05-15', tournoi_lieu: 'Stade Test',
    tournoi_adresse: '1 rue du Stade', tournoi_description: 'Une journée de rugby.',
    heure_rdv: '08:30', heure_debut: '09:30', heure_fin: '16:00',
    date_limite_confirmation: 'ANCIENNE', tarif_engagement_oui: 'non',
    date_limite_reponse: 'ANCIENNE', contact_reponse_nom: 'Ancien contact',
    referent_nom: 'Ancien référent', buvette_disponible: 'non',
    parking_texte: 'Parking P3, entrée nord',
    encadrement_ratio: '1 éducateur pour 8 joueurs',
    encadrement_diplomes: 'Brevet fédéral EDR', assurance_attestation_requise: 'oui',
    logistique_vestiaires: 'Vestiaires 1 et 2'
  },
  categories: [{
    categorie: 'U10', presente: 'oui', forme_jeu: 'RE — 7x7', format_mi_temps: '2',
    duree_mi_temps_min: '10', pause_mi_temps_min: '2', recup_entre_matchs_min: '15',
    effectif_min: '7', effectif_max: '13', max_equipes_par_club: '2',
    arbitrage_organisation: 'Éducateurs', format_apresmidi: 'CROISE'
  }]
};
bac.__config = JSON.parse(JSON.stringify(config));
vm.runInContext('configCourante = __config; clubsInvitesCourants = [];', bac);

// Les valeurs LIVE diffèrent volontairement de la config enregistrée : l'aperçu doit les suivre.
dom['form-modalites'] = {
  date_limite_confirmation: { value: '2027-04-20' },
  tarif_engagement_oui: { checked: true },
  tarif_engagement_montant: { value: '35 € par équipe' },
  tarif_engagement_modalites: { value: 'Virement avant le tournoi' }
};
dom['form-reponse'] = {
  date_limite_reponse: { value: '2027-04-10' },
  contact_reponse_nom: { value: 'Camille Réponse' },
  contact_reponse_tel: { value: '0611223344' },
  contact_reponse_email: { value: 'reponse@exemple.invalid' }
};
dom['form-contacts-securite'] = {
  referent_nom: { value: 'Alex Terrain' }, referent_tel: { value: '0677889900' },
  securite_secours_oui: { checked: true },
  securite_secours_precisions: { value: 'Local près du club-house' },
  securite_referent_identique: { checked: false },
  securite_referent_nom: { value: 'Sam Sécurité' }, securite_referent_tel: { value: '0601020304' }
};
dom['form-surplace'] = {
  buvette_disponible: { checked: true },
  espace_sandwich_disponible: { checked: true },
  boutique_disponible: { checked: false },
  gouter_fin_tournoi_oui: { checked: true },
  gouter_fin_tournoi_mode: { value: 'offert_organisateur' },
  gouter_fin_tournoi_montant: { value: '' }
};
dom['form-parking'] = { parking_texte: { value: 'Parking LIVE, entrée ouest' } };
dom['form-encadrement'] = {
  encadrement_ratio: { value: '1 éducateur pour 6 joueurs' },
  encadrement_diplomes: { value: 'Diplôme LIVE' },
  assurance_attestation_requise: { checked: false }
};

const g = bac.globalInvitation();
egal(g.date_limite_confirmation, '2027-04-20', 'l’aperçu lit les modalités en direct');
egal(g.contact_reponse_nom, 'Camille Réponse', 'l’aperçu lit la réponse en direct');
egal(g.referent_nom, 'Alex Terrain', 'l’aperçu lit Contacts & sécurité en direct');
egal(g.buvette_disponible, 'oui', 'l’aperçu lit Sur place en direct');
egal(g.gouter_fin_tournoi_mode, 'offert_organisateur', 'l’aperçu lit la modalité du goûter en direct');

const cats = bac.catsInvitationTriees();
const htmlInitial = bac.emailHtmlInvitation(g, cats, '', 'Bonjour Camille,', 'Introduction.',
  'https://exemple.invalid/reponse', 'https://exemple.invalid/invitation');
const texteInitial = bac.emailTexteInvitation(g, cats, 'Bonjour Camille,', 'Introduction.',
  'https://exemple.invalid/reponse', 'https://exemple.invalid/invitation');
const titresInitiaux = [
  bac.emailTitreSection("Modalités d'inscription"),
  bac.emailTitreSection("Réponse à l'invitation"),
  bac.emailTitreSection('Contacts & sécurité'),
  bac.emailTitreSection('Sur place')
];
dansOrdre(htmlInitial, titresInitiaux, 'HTML initial : ordre identique au menu');
dansOrdre(texteInitial, ["MODALITÉS D'INSCRIPTION", "RÉPONSE À L'INVITATION", 'CONTACTS & SÉCURITÉ', 'SUR PLACE'],
  'texte initial : ordre identique au menu');
vrai(htmlInitial.includes('Virement avant le tournoi'), 'HTML initial : modalités de paiement présentes');
vrai(texteInitial.includes('Modalités de paiement : Virement avant le tournoi'), 'texte initial : modalités de paiement présentes');
vrai(htmlInitial.includes('Sam Sécurité') && htmlInitial.includes('Local près du club-house'),
  'HTML initial : référent sécurité et secours présents');
vrai(texteInitial.includes('Sam Sécurité') && texteInitial.includes('Local près du club-house'),
  'texte initial : référent sécurité et secours présents');
egal(occurrences(htmlInitial, '35 € par équipe'), 1, 'le tarif n’est plus dupliqué dans Sur place');
egal(occurrences(htmlInitial, "Répondre à l'invitation"), 1,
  'HTML initial : un seul bouton de réponse, conservé en bas du message');
vrai(htmlInitial.indexOf("Répondre à l'invitation") > htmlInitial.indexOf(titresInitiaux[3]),
  'HTML initial : le bouton unique se trouve après la dernière section du menu');
vrai(htmlInitial.includes('Goûter de fin de tournoi') && htmlInitial.includes('Offert par l&#39;organisateur du tournoi'),
  'HTML initial : le goûter offert est annoncé sans ambiguïté');

const club = { club_nom: 'RC Test', categories_engagees: '["U10"]' };
const htmlFinal = bac.emailHtmlDossier(config.global, club, '', 'Bonjour,', 'Votre dossier.',
  'https://exemple.invalid/dossier');
const texteFinal = bac.emailTexteDossier(config.global, club, 'Bonjour,', 'Votre dossier.',
  'https://exemple.invalid/dossier');
dansOrdre(htmlFinal, [bac.emailTitreSection('Parking & accès'), bac.emailTitreSection('Encadrement & assurance'),
  bac.emailTitreSection('Dossier complet')], 'HTML final : ordre identique au menu');
dansOrdre(texteFinal, ['PARKING & ACCÈS', 'ENCADREMENT & ASSURANCE', 'DOSSIER COMPLET'],
  'texte final : ordre identique au menu');
vrai(htmlFinal.includes('Parking P3, entrée nord') && htmlFinal.includes('1 éducateur pour 8 joueurs'),
  'HTML final : les deux cartes de saisie alimentent le message');
vrai(texteFinal.includes('Parking P3, entrée nord') && texteFinal.includes('1 éducateur pour 8 joueurs'),
  'texte final : les deux cartes de saisie alimentent le message');
vrai(htmlFinal.indexOf(bac.emailTitreSection('Dossier complet')) < htmlFinal.indexOf(bac.emailTitreSection("La journée en un coup d'œil")),
  'HTML final : le contenu assemblé vient sous Dossier complet');
vrai(texteFinal.indexOf('DOSSIER COMPLET') < texteFinal.indexOf('LA JOURNÉE'),
  'texte final : le contenu assemblé vient sous Dossier complet');

// Aperçu permanent du menu : personnalisation par club, valeurs enregistrées et aucune écriture.
dom['apercu-dossier-email-club'] = { value: 'RC Test', innerHTML: '', disabled: false };
dom['apercu-dossier-email-objet'] = { value: '' };
dom['apercu-dossier-email-intro'] = { value: '' };
dom['apercu-dossier-email-rendu'] = { srcdoc: '' };
bac.__clubs = [
  { club_nom: 'Club Invité', statut: 'Invité', club_contact_prenom: 'Luc' },
  { club_nom: 'RC Test', statut: 'Accepté', club_contact_prenom: 'Camille',
    club_token: 'jeton-test', categories_engagees: '["U10"]' }
];
vm.runInContext('clubsInvitesCourants = __clubs;', bac);
bac.majApercuDossierEmail();
vrai(dom['apercu-dossier-email-club'].innerHTML.indexOf('RC Test') <
  dom['apercu-dossier-email-club'].innerHTML.indexOf('Club Invité'),
  'aperçu final : les clubs acceptés sont proposés en premier');
egal(dom['apercu-dossier-email-club'].value, 'RC Test',
  'aperçu final : le club sélectionné est conservé');
egal(dom['apercu-dossier-email-objet'].value, 'Votre dossier complet — Tournoi Test',
  'aperçu final : l’objet proposé est visible');
egal(dom['apercu-dossier-email-objet'].defaultValue, 'Votre dossier complet — Tournoi Test',
  'aperçu final : le navigateur ne peut pas restaurer un objet vide');
vrai(dom['apercu-dossier-email-intro'].value.includes('pour RC Test'),
  'aperçu final : l’introduction est personnalisée');
vrai(dom['apercu-dossier-email-rendu'].srcdoc.includes('Bonjour Camille,'),
  'aperçu final : la salutation est personnalisée');
vrai(dom['apercu-dossier-email-rendu'].srcdoc.includes('Parking P3, entrée nord') &&
  dom['apercu-dossier-email-rendu'].srcdoc.includes('1 éducateur pour 8 joueurs'),
  'aperçu final : Parking et Encadrement utilisent les valeurs réellement enregistrées');
vrai(!dom['apercu-dossier-email-rendu'].srcdoc.includes('Parking LIVE, entrée ouest') &&
  !dom['apercu-dossier-email-rendu'].srcdoc.includes('1 éducateur pour 6 joueurs'),
  'aperçu final : une saisie non enregistrée n’est pas présentée comme prête à envoyer');
vrai(dom['apercu-dossier-email-rendu'].srcdoc.includes('club=RC+Test') &&
  dom['apercu-dossier-email-rendu'].srcdoc.includes('token=jeton-test'),
  'aperçu final : le lien existant du club est représenté sans le renouveler');

const invitations = lire('js/admin-invitations.js');
const debutApercuFinal = invitations.indexOf('function majApercuDossierEmail()');
const finApercuFinal = invitations.indexOf('/**\n * Corps HTML de l\'email de dossier final', debutApercuFinal);
const sourceApercuFinal = invitations.slice(debutApercuFinal, finApercuFinal);
vrai(debutApercuFinal >= 0 && finApercuFinal > debutApercuFinal,
  'la fonction d’aperçu final est isolée dans le code réel');
vrai(!/(ecrireAdmin|fetch\s*\(|apiPost|envoyerDossierEmail|regenererJetonClub)/.test(sourceApercuFinal),
  'l’aperçu permanent ne contient aucun chemin d’écriture, d’envoi ou de renouvellement');

const admin = lire('js/admin.js');
vrai(admin.includes("ecouter('form-modalites', 'input', majApercuInvitation)"),
  'les modalités rafraîchissent immédiatement l’aperçu');
vrai(admin.includes("ecouter('form-contacts-securite', 'input', majApercuInvitation)"),
  'Contacts & sécurité rafraîchit immédiatement l’aperçu');
vrai(admin.includes("ecouter('apercu-dossier-email-club', 'change', majApercuDossierEmail)"),
  'le choix du club rafraîchit immédiatement l’aperçu final');
vrai(!admin.includes("ecouter('form-parking', 'input', majApercuDossierEmail)") &&
  !admin.includes("ecouter('form-encadrement', 'input', majApercuDossierEmail)"),
  'les saisies non enregistrées ne modifient pas le rendu annoncé comme envoyable');

console.log('OK — ' + controles + ' contrôles passés.');
