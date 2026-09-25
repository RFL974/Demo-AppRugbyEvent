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

const contexte = vm.createContext({
  console,
  document: { addEventListener() {} },
  navigator: {},
  echapper: v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
});
const code = lire('js/admin-dps.js');
vm.runInContext(code, contexte, { filename: 'js/admin-dps.js' });

const dossier = { sections: [{ titre: 'Organisateur', champs: [
  { libelle: 'Nom du club ou de la structure organisatrice', valeur: 'Démo Racing' },
  { libelle: 'Représenté par (M./Mme)', valeur: 'Camille Martin' },
  { libelle: 'Téléphone du représentant', valeur: '01 23 45 67 89' },
  { libelle: 'Mail du représentant', valeur: 'camille@example.invalid' }
] }] };
const config = { global: {
  tournoi_nom: 'Tournoi des petits champions', tournoi_date: '2027-05-15',
  tournoi_lieu: 'Stade Paul Langevin', tournoi_adresse: '10 rue du Stade, 92140 Clamart',
  tournoi_description: 'Tournoi amical des écoles de rugby.', heure_debut: '09:00', heure_fin: '17:00',
  securite_referent_identique: 'oui', referent_nom: 'Morgan Dupont', referent_tel: '06 00 00 00 00'
}, categories: [{ categorie: 'U8', presente: 'oui' }, { categorie: 'U10', presente: 'oui' }] };
const estimation = { contrat: 'estimation-public-1', centrale: 400, basse: 320, haute: 490,
  renseignes: 4, participants: 6 };

const complet = contexte.dpsConstruireChamps(dossier, config, estimation, 'complet');
egal(complet.length, 7, 'la version complète expose sept blocs copiables');
vrai(complet.some(c => c.libelle === 'Fréquentation estimée' && /400/.test(c.valeur) && /320 à 490/.test(c.valeur)),
  'la fréquentation reprend l’estimation jointe sans nouveau calcul');
vrai(complet.some(c => c.libelle === 'Manifestation' && /U8, U10/.test(c.valeur)),
  'la manifestation reprend les catégories présentes');
vrai(complet.every(c => !/À compléter/.test(c.valeur)),
  'le témoin complet ne fabrique aucun manque');

const court = contexte.dpsConstruireChamps(dossier, config, estimation, 'court');
egal(court.length, 1, 'la version courte produit un seul résumé');
vrai(/400 spectateurs/.test(court[0].valeur) && /15 mai 2027/.test(court[0].valeur),
  'le résumé conserve la date et le public attendus');
const texteComplet = contexte.dpsAssemblerTexte_(complet, false);
vrai(texteComplet.startsWith('ORGANISATEUR\n') && /\n\nMANIFESTATION\n/.test(texteComplet),
  'la copie complète utilise des titres explicites et séparés');
const texteLigne = contexte.dpsAssemblerTexte_(complet, true);
vrai(!/[\r\n]/.test(texteLigne) && texteLigne.includes('ORGANISATEUR '),
  'la variante sur une ligne est réellement dépourvue de retour à la ligne');

const sansAutoritePublic = contexte.dpsConstruireChamps(dossier, config, {}, 'complet');
vrai(sansAutoritePublic.find(c => c.id === 'public').valeur.includes('À compléter'),
  'un contrat d’estimation absent n’est jamais présenté comme un chiffre actuel');
const incomplet = contexte.dpsConstruireChamps({ sections: [] }, { global: {}, categories: [] }, null, 'complet');
vrai(incomplet.some(c => /À compléter/.test(c.valeur)),
  'les données absentes restent honnêtement signalées');

egal(contexte.DPS_FOURNISSEURS.length, 5, 'les cinq acteurs demandés sont proposés');
vrai(contexte.DPS_FOURNISSEURS.some(f => f.nom === 'FFSS' && f.url === 'https://www.ffss.fr/annuaire/' && /Trouver/.test(f.action)),
  'le lien FFSS corrigé est présenté comme un annuaire, pas comme un faux formulaire');
vrai(contexte.DPS_FOURNISSEURS.every(f => /^https:\/\//.test(f.url)),
  'chaque destination est explicitement sécurisée');

const surfacePure = code.slice(code.indexOf('function dpsConstruireChamps'), code.indexOf('document.addEventListener'));
vrai(!/api(?:Get|Post|PostProtege)|ecrireAdmin|fetch\s*\(/.test(surfacePure),
  'rendu, formats et copies ne contiennent aucun appel serveur');
vrai(/continuer\.disabled = true/.test(code) && /voirCopie\.disabled = true/.test(code),
  'une lecture absente désactive la préparation et la copie');
vrai(/Actualisation impossible : dernière lecture connue affichée/.test(code) &&
  /Source : dernière lecture connue \(actualisation impossible\)/.test(code),
  'une actualisation ratée nomme explicitement la dernière lecture connue');

const admin = lire('admin.html');
vrai(admin.includes('id="dps-demande-prete"') && admin.includes('id="dps-champs-copie"') &&
  admin.includes('id="dps-fournisseurs"'), 'l’étape Demande prête possède ses trois zones');
vrai(admin.includes('js/admin-dps.js?v=refonte-ciel-verre-20260920-dps2') &&
  admin.includes('admin-autorisation.js?v=refonte-ciel-verre-20260920-participants3-dps1'),
  'les deux ressources modifiées ont une URL neuve sans changer la version globale');
vrai(admin.includes('Version courte') && admin.includes('Version complète') &&
  admin.includes('Copier en une ligne') && admin.includes('Tout copier'),
  'les quatre commandes de copie sont visibles dans le HTML initial');
vrai(admin.includes('id="dps-compteur"') && !code.includes('role="table"'),
  'le compteur est annoncé sans détourner un rôle de tableau pour des boutons');
vrai(code.includes("'Copier le brouillon'") && code.includes('Sortie de travail uniquement'),
  'une sortie incomplète est explicitement présentée comme un brouillon interne');

const autorisation = lire('js/admin-autorisation.js');
vrai(autorisation.includes('autorisationDossierCourant = dossier') &&
  autorisation.includes('afficherDpsDepuisAutorisation(autorisationDossierCourant'),
  'le DPS reçoit le même instantané que la demande d’autorisation');
vrai(lire('js/admin.js').includes("dps: { ressources: ['dossierAutorisation'] }"),
  'l’ouverture du DPS conserve une seule ressource authentifiée');

const css = lire('css/theme-r92.css');
vrai(css.includes('.dps-tableau') && css.includes('.dps-champs-copie') && css.includes('.dps-fournisseurs'),
  'les vues principale, copie et fournisseurs ont leurs styles dédiés');
vrai(css.includes('@media (max-width:760px)') && css.includes('.dps-champs-copie,.theme-clair .dps-fournisseurs'),
  'la demande prête repasse en une colonne sur mobile');

console.log('OK — ' + controles + ' contrôles passés.');
