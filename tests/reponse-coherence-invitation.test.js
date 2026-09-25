const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function vrai(valeur, message) { assert.ok(valeur, message); controles++; }

const page = lire('reponse-invitation.html');
const js = lire('js/reponse.js');
const css = lire('css/dossier.css');

vrai(page.includes('class="page-reponse"') && page.includes('class="rep-navigation-etapes"'),
  'la réponse utilise la surface et la navigation communes au parcours club');
vrai(page.includes('Invitation</a>') && page.includes('Votre réponse') && page.includes('Votre dossier'),
  'les trois étapes principales restent visibles dans le bandeau');
vrai(js.includes("'Participation', 'Équipes', 'Repas', 'Récapitulatif'"),
  'le parcours de saisie annonce ses quatre étapes');
vrai(js.includes("assets/affiche-tournoi-des-petits-champions-2027.png") &&
  js.includes('/tournoi des petits champions/i.test'),
  'l’affiche locale est un rappel strictement limité au tournoi de démonstration');
vrai(js.includes("assets/email-icons/") && js.includes("iconeReponse('calendar')") &&
  js.includes("iconeReponse('pin')") && js.includes("iconeReponse('equipes'"),
  'la réponse réemploie les pictogrammes locaux de l’invitation');
vrai(js.includes('Inscription des équipes') && js.includes('Informations pratiques') &&
  js.includes('Repas et goûter') && js.includes('Récapitulatif de votre inscription'),
  'toutes les informations du formulaire existant restent présentes');
vrai(js.includes('Vérifier ma réponse') && js.includes('Vérifiez votre confirmation') &&
  js.indexOf("afficherRecapitulatifConfirmation(confirmationEnAttente)") < js.indexOf("apiPost('repondreInvitation'"),
  'la relecture précède toujours explicitement l’unique écriture');
vrai(!js.includes('Rappel sécurité FFR') && !js.includes('règle FFR'),
  'aucune affiliation ni exigence FFR n’est affichée');
vrai(css.includes('.page-reponse .rep-form') && css.includes('.cv-reponse-recap { position: sticky') &&
  css.includes('@media screen and (max-width: 430px)'),
  'la composition desktop et son adaptation mobile sont couvertes');
vrai(css.includes('.page-reponse .rep-equipe .rep-educateur label') &&
  css.includes('grid-template-columns: minmax(0, 1fr);') &&
  css.includes('.page-reponse .rep-educateur input[type="text"]'),
  'les champs nom et prénom occupent leur colonne au lieu d’être réduits à une case numérique');
vrai(js.includes('function boutonRepliReponse') && js.includes('function definirEtatRepli') &&
  js.includes('aria-expanded="true"') && js.includes('aria-controls='),
  'les chevrons de repli exposent leur état et la section contrôlée aux technologies d’assistance');
vrai(js.includes("boutonRepliReponse('rep-contenu-equipes'") &&
  js.includes("boutonRepliReponse('rep-contenu-deplacement'") &&
  js.includes("boutonRepliReponse('rep-contenu-commandes'"),
  'les équipes, les informations pratiques et les repas sont repliables indépendamment');
vrai(js.includes("'rep-detail-categorie-' + index") &&
  js.includes("boutonRepliReponse(detailId, 'la catégorie ' + nomCat"),
  'chaque catégorie engagée peut elle aussi être repliée sans masquer les autres');
vrai(css.includes('.rep-repli[hidden] { display: none; }') &&
  css.includes('.page-reponse .rep-deplacement-contenu { display: grid; gap: 10px; }'),
  'les contrôles cachés le restent et la mise en page interne est préservée');
vrai(page.includes('participants2-reponse1'),
  'les ressources modifiées portent une adresse neuve sans toucher à la version globale');

console.log('OK — ' + controles + ' contrôles de cohérence invitation/réponse.');
