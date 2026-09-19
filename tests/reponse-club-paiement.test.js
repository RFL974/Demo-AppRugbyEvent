#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function vrai(condition, message) { assert.ok(condition, message); controles++; }
function egal(reel, attendu, message) { assert.equal(reel, attendu, message); controles++; }

const source = lire('js/reponse.js');
const css = lire('css/dossier.css');
const backend = lire('../backend/Code.gs');
const bac = vm.createContext({
  console, URLSearchParams,
  document: { addEventListener() {} },
  txt: v => String(v == null ? '' : v).trim(),
  echapper: v => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;'),
  dateLongueFr: v => 'DATE(' + v + ')',
  jsonSur: (v, repli) => { try { return JSON.parse(v); } catch (_) { return repli; } },
  parseCategoriesEngagees: () => []
});
vm.runInContext(source, bac, { filename: 'js/reponse.js' });

egal(bac.prixEnCentimes('8,50'), 850, 'le prix français est converti sans flottant');
egal(bac.prixEnCentimes('prix libre'), 0, 'un prix inconnu ne devient jamais un montant');
egal(bac.eurosDepuisCentimes(45375), '453,75 €', 'le total est affiché en euros français');
egal(bac.quantiteCommande('1.5').valide, false, 'une quantité décimale n’est pas tronquée silencieusement');
egal(bac.quantiteCommande('12').valeur, 12, 'une quantité entière reste exploitable');

const calcul = bac.calculerPaiementReponse(3, { joueurs: 27, educateurs: 5 }, {
  repas_joueurs: 27, repas_educateurs: 3, gouter_joueurs: 10, gouter_educateurs: 5
}, {
  frais_inscription_prix: '50', repas_prix_personne: '8.50', gouter_prix_personne: '3.25'
});
egal(calcul.inscription, 15000, 'les frais sont calculés par équipe');
egal(calcul.repas, 25500, 'les repas joueurs + éducateurs sont calculés');
egal(calcul.gouter, 4875, 'les goûters joueurs + éducateurs sont calculés');
egal(calcul.total, 45375, 'le total additionne inscription, repas et goûters');

const rappel = bac.blocModalitesPaiement({ paiement: {
  frais_inscription_oui: 'oui', frais_inscription_prix: '50', date_limite_paiement: '2027-03-01'
} });
vrai(rappel.includes('50 € par équipe') && rappel.includes('DATE(2027-03-01)'),
  'la page rappelle les frais et la date limite de paiement');

vrai(bac.blocCommandePrestation('repas', 'Repas', '8.50').includes('Repas pour tous les joueurs'),
  'un repas payant propose « tous les joueurs »');
vrai(bac.blocCommandePrestation('repas', 'Repas', '8.50').includes('Repas pour tous les éducateurs'),
  'un repas payant propose « tous les éducateurs »');
vrai(bac.blocCommandePrestation('repas', 'Repas', '8.50').includes('nombre de repas à réserver'),
  'le libellé des repas reste grammaticalement correct');
egal(bac.blocCommandePrestation('repas', 'Repas', ''), '',
  'aucun bloc de commande si le club ne paie pas en supplément');
const blocGouter = bac.blocCommandePrestation('gouter', 'Goûter', '3.25');
vrai(source.includes("blocCommandePrestation('gouter', 'Goûter'") &&
  blocGouter.includes('Goûter pour tous les joueurs') && blocGouter.includes('Goûter pour tous les éducateurs'),
  'le goûter suit exactement la même logique joueurs/éducateurs');

vrai(!String(bac.onConfirmerPresence).includes("apiPost('repondreInvitation'"),
  'le premier clic affiche le récapitulatif sans écrire');
vrai(String(bac.envoyerPresenceConfirmee).includes("apiPost('repondreInvitation'") &&
  String(bac.envoyerPresenceConfirmee).includes('commande_restauration'),
  'seul le second clic envoie la confirmation et la commande');
vrai(source.includes('Vérifiez votre confirmation') && source.includes('Valider la confirmation'),
  'le message final permet de relire puis valider explicitement');
vrai(bac.texteSuiviConfirmation({ confirmation_email_envoye: true }, true).includes('récapitulatif vient'),
  'une participation confirmée annonce clairement l’e-mail envoyé');
vrai(bac.texteSuiviConfirmation({ confirmation_email_envoye: true }, false).includes('confirmation vient'),
  'un refus confirmé annonce clairement l’e-mail envoyé');
vrai(bac.texteSuiviConfirmation({ confirmation_email_envoye: false }, true).includes('réponse est bien enregistrée'),
  'une panne d’e-mail ne fait jamais passer la réponse enregistrée pour un échec');
vrai(String(bac.envoyerDecline).includes('texteSuiviConfirmation') &&
  String(bac.envoyerPresenceConfirmee).includes('texteSuiviConfirmation'),
  'les deux réponses affichent le résultat réel de l’envoi automatique');
vrai(css.includes('.rep-total-du') && css.includes('.rep-recap') && css.includes('.rep-prestation-public'),
  'les nouveaux blocs ont une présentation claire et responsive');

vrai(backend.includes('function validerCommandeRestauration(') &&
  backend.includes("vd.detail._restauration = commandeCalculee.commande"),
  'le serveur recalcule puis conserve la commande dans la réponse existante');
vrai(backend.includes("Aucune commande payante de ") && backend.includes('qJ > totalJoueurs'),
  'le serveur refuse une prestation inventée et une quantité supérieure aux effectifs');
vrai(backend.includes('paiement: paiement.tarifs'),
  'la page reçoit les tarifs validés depuis Config, jamais depuis le lien');

console.log('OK — ' + controles + ' contrôles passés.');
