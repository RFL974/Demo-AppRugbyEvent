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
const echapper = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const reponse = vm.createContext({ console, URLSearchParams,
  document: { addEventListener() {} }, txt: v => String(v == null ? '' : v).trim(), echapper,
  dateLongueFr: String, jsonSur: (v, d) => { try { return JSON.parse(v); } catch (_) { return d; } },
  parseCategoriesEngagees: () => ['U10'] });
vm.runInContext(lire('js/reponse.js'), reponse, { filename: 'js/reponse.js' });
const html = reponse.formulairePresence({ club: {
  categories_engagees: 'U10', nb_equipes_par_categorie: '{"U10":1}',
  detail_effectifs: '{"U10":[{"j":12,"e":1,"educateurs":[{"prenom":"Léa","nom":"Martin"}]}]}',
  mode_deplacement: 'mixte', nb_equipes_groupees: '1'
}, categories: [{ categorie: 'U10', effectif_min: '10', max_equipes_par_club: '2' }], paiement: {} });
vrai(html.includes('Informations pratiques') && html.includes('poste de secours et le parking'),
  'le déplacement est demandé avec sa finalité concrète');
vrai(html.includes('value="mixte" checked') && html.includes('id="rep-equipes-groupees"'),
  'une réponse existante restaure le mode mixte et son détail facultatif');
vrai(String(reponse.envoyerPresenceConfirmee).includes('mode_deplacement') &&
  String(reponse.envoyerPresenceConfirmee).includes('nb_equipes_groupees'),
  'le second clic transmet les deux données de déplacement');
vrai(String(reponse.onConfirmerPresence).includes('lireNomsEducateursEquipe') &&
  String(reponse.onConfirmerPresence).includes('educateurs: educateurs'),
  'chaque équipe transmet ses éducateurs nommés');
vrai(String(reponse.onConfirmerPresence).includes('prénom et le nom de chaque éducateur'),
  'une identité incomplète est expliquée avant l’envoi');

const suivi = vm.createContext({ console, document: { addEventListener() {} }, echapper,
  estOui: v => v === 'oui', estAccepte: v => /accept/i.test(v), memeTexteSouple: (a, b) => a === b,
  clubsInvitesCourants: [], configCourante: { global: {} }, estimationPublicCourante: null });
vm.runInContext(lire('js/admin-suivi-clubs.js'), suivi, { filename: 'js/admin-suivi-clubs.js' });
const club = { club_nom: 'CLAMART', statut: 'Accepté', mode_deplacement: 'mixte', nb_equipes_groupees: '1',
  detail_effectifs: JSON.stringify({ U10: [{ j: 12, e: 2, educateurs: [
    { prenom: 'Léa', nom: 'Martin' }, { prenom: 'Noé', nom: 'Durand' }
  ] }] }) };
egal(suivi.suiviLibelleDeplacement(club), 'Un peu des deux · environ 1 équipe(s) en groupe',
  'la fiche organisateur restitue le déplacement');
const educateurs = suivi.suiviHtmlEducateurs(club);
vrai(educateurs.includes('U10 · équipe 1') && educateurs.includes('Léa Martin') && educateurs.includes('Noé Durand'),
  'la fiche rattache chaque éducateur à son équipe');
const dps = suivi.suiviHtmlDonneesDps({ contrat: 'estimation-public-1', participants: 4, renseignes: 3, sans_mode: 1 });
vrai(dps.includes('3 clubs participants sur 4') && dps.includes('À compléter : 1 club'),
  'le suivi montre la complétude sans dupliquer la vue détaillée du futur onglet DPS');
vrai(!dps.includes('Hypothèse') && !dps.includes('centrale'),
  'les chiffres détaillés restent hors du suivi des clubs');

const page = lire('reponse-invitation.html');
const admin = lire('admin.html');
vrai(page.includes('participants2-reponse1') && admin.includes('participants3'),
  'les ressources modifiées ont une URL neuve sans changer la version globale');
vrai(admin.includes('id="bloc-dps"') && admin.includes('id="autorisation-public-attendu"') &&
  admin.indexOf('id="bloc-dps"') < admin.indexOf('id="bloc-autorisation"'),
  'la vue détaillée vit dans son écran DPS, distinct de la demande d’autorisation FFR');
const ecrans = lire('js/ecrans.js');
vrai(ecrans.includes("id: 'dps', titre: 'Demande de DPS', icone: 'secours'") &&
  ecrans.includes("secours:   '<path"),
  'la barre latérale porte une entrée Demande de DPS et un pictogramme secours propre');
vrai(lire('js/assistant.js').includes("id: 'dps'") && lire('js/admin.js').includes("dps: { ressources: ['dossierAutorisation'] }"),
  'le parcours mobile ouvre le même écran avec la même lecture mémorisée');
const autorisation = lire('js/admin-autorisation.js');
vrai(autorisation.includes('Comprendre le barème et la méthode de calcul') &&
  autorisation.includes('0,25 · 0,40 · 0,60') && autorisation.includes('0,60 · 1,10 · 1,80'),
  'le menu dépliant expose le barème groupé et familles');
vrai(autorisation.includes('U6 et U8') && autorisation.includes('U12') &&
  autorisation.includes('combinés statistiquement'),
  'la méthode explique les modulations et l’agrégation de la fourchette');
const rendu = autorisation.slice(autorisation.indexOf('function rendreEstimationPublicAutorisation'),
  autorisation.indexOf('function afficherEstimationPublicAutorisation'));
vrai(!/api(?:Get|Post|PostProtege)|ecrireAdmin|fetch\s*\(/.test(rendu),
  'ouvrir ou repeindre le menu n’émet aucun appel serveur');
vrai(String(autorisation.match(/estimationPublicCourante = \(rep && rep\.estimation_public\) \|\| null/g) || '').length > 0,
  'la vue exploite l’estimation jointe à la lecture déjà nécessaire');
vrai(lire('css/dossier.css').includes('.rep-educateur') && lire('css/theme-r92.css').includes('.suivi-dps-etat') &&
  lire('css/theme-r92.css').includes('.autorisation-public-methode'),
  'le formulaire et le suivi ont leurs styles responsive dédiés');

console.log('OK — ' + controles + ' contrôles passés.');
