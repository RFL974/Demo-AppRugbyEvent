'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function vrai(valeur, message) { assert.ok(valeur, message); controles++; }

const page = lire('dossier-club.html');
const js = lire('js/dossier.js');
const commun = lire('js/commun-dossier.js');
const email = lire('js/admin-invitations.js');
const css = lire('css/dossier.css');
const theme = lire('css/theme-r92.css');

vrai(page.includes('class="page-dossier"') && page.includes('class="rep-navigation-etapes"'),
  'le dossier en ligne utilise la même navigation de parcours que la réponse');
vrai(page.includes('Invitation</a>') && page.includes('Votre réponse</a>') && page.includes('Votre dossier'),
  'les trois étapes du parcours restent visibles');
vrai(page.includes('assets/email-icons/enregistrer.svg') && !page.includes('🖨️'),
  'l’export réemploie un pictogramme local sans emoji système');
vrai(js.includes("assets/affiche-tournoi-des-petits-champions-2027.png") &&
  js.includes("toLowerCase() === 'tournoi des petits champions'"),
  'l’affiche locale de démonstration est limitée au tournoi correspondant');
vrai(js.includes('function sectionDossier') && js.includes('function iconeSectionDossier'),
  'les sections du dossier réemploient une famille cohérente de pictogrammes');
vrai(js.includes('function sectionCommandeClub') && js.includes('paiement_statut') &&
  js.includes('Paiement reçu') && js.includes('Paiement en attente'),
  'inscription, options et paiement sont rendus depuis la réponse réelle du club');
vrai(js.includes("rappelPaiement.push('À régler avant le '") && js.includes("rappelPaiement.push('Paiement : '") &&
  !js.includes('sectionModalites(g)'),
  'les modalités utiles remontent dans la commande sans carte redondante en bas de page');
vrai(js.indexOf('sectionInfosPratiques(g)') < js.indexOf('sectionCommandeClub(club, g)') &&
  js.indexOf('sectionCommandeClub(club, g)') < js.indexOf('sectionJournee(g, catsFormat)') &&
  js.indexOf('sectionJournee(g, catsFormat)') < js.indexOf('sectionMonPlanning(ctx, catsFormat)'),
  'le dossier suit l’ordre validé : pratique, commande, journée, planning');
vrai(js.includes("iconeDossier('calendar')") && js.includes("iconeDossier('pin')") &&
  js.includes("return 'securite'") && js.includes("iconeDossier('equipes'"),
  'date, lieu, sécurité et équipes utilisent les icônes déjà présentes dans l’invitation');
vrai(!js.includes('Licence FFR') && !js.includes('FDM EDR') && !js.includes('Rappel sécurité FFR'),
  'le dossier en ligne n’ajoute aucune exigence fédérale non configurée');
vrai(!js.includes("ligne('Table de marque'") && !lire('js/terrains-dossier.js').includes('Table de marque'),
  'la table de marque est absente de toute la vue dossier club');
vrai(commun.includes("ligneCarte('Équipes par catégories'") &&
  commun.includes('<strong>Rappel sécurité</strong>') && !commun.includes('<strong>Rappel sécurité FFR</strong>'),
  'le vocabulaire validé est repris dans les cartes sportives');
vrai(email.includes('Votre dossier pour la journée') && email.includes('cv-email-navigation') &&
  email.includes('tableauCategoriesEmail(cats, A)'),
  'l’email final reprend le bandeau et le tableau de l’invitation');
vrai(email.includes("assets/affiche-tournoi-des-petits-champions-2027.png") &&
  !email.includes("ligneJ('Licences', 'Licence FFR"),
  'l’aperçu email contient l’affiche sans réintroduire les anciennes mentions FFR');
vrai(css.includes('DOSSIER FINAL — continuité directe Invitation / Votre réponse') &&
  css.includes('@media screen and (max-width: 430px)') && css.includes('.page-dossier .dossier-hero-grille'),
  'la continuité visuelle et le petit écran sont explicitement couverts');
vrai(css.includes('.page-dossier .d-dossier-fin-grid') && css.includes('repeat(auto-fit, minmax(260px, 1fr))'),
  'les cartes de fin de dossier se répartissent équitablement selon leur nombre');
vrai(theme.includes('#bloc-apercu-dossier-email { grid-column:1/-1; }'),
  'l’aperçu de l’email final dispose de la largeur ordinateur réelle');

console.log('OK — ' + controles + ' contrôles de cohérence du dossier final.');
