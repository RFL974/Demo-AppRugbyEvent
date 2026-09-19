/**
 * Garde-fou frontend — simplification du parcours Partenaires.
 * Lance : node tests/simplification-partenaires.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(racine, 'admin.html'), 'utf8');
const admin = fs.readFileSync(path.join(racine, 'js/admin-sponsors.js'), 'utf8');
const ecrans = fs.readFileSync(path.join(racine, 'js/ecrans.js'), 'utf8');
const assistant = fs.readFileSync(path.join(racine, 'js/assistant.js'), 'utf8');

let echecs = 0;
function verifier(condition, message) {
  if (condition) console.log('✓ ' + message);
  else { console.error('✗ ' + message); echecs++; }
}

verifier(/id="bloc-sponsors-accueil"/.test(html), 'un accueil oriente le parcours');
verifier((html.match(/data-vue-sponsors=/g) || []).length === 3,
  'les trois tâches sont explicites et séparées');
verifier(/id="bloc-sponsors-reglages" hidden/.test(html) && /id="bloc-sponsors-bilan" hidden/.test(html),
  'la gestion est la seule vue détaillée ouverte par défaut');
verifier(/value="essentiel" checked/.test(html) && /value="renforce"/.test(html) && /value="personnalise"/.test(html),
  'les trois niveaux de visibilité sont proposés');
verifier(/essentiel: \['mur', 'dossier'\]/.test(admin),
  'Essentiel alimente le mur et le dossier club');
verifier(/renforce: \['rail', 'mur', 'dossier'\]/.test(admin),
  'Renforcé ajoute la barre rotative mobile');
verifier(/id="sponsor-emplacements-personnalises" hidden/.test(html),
  'les six emplacements techniques sont masqués hors mode personnalisé');
verifier(/Options avancées du partenaire/.test(html) && /Options avancées d'affichage/.test(html),
  'les réglages fins restent disponibles dans des dépliants');
verifier(/Simulation commerciale — données fictives/.test(html) && /Dépannage et remise à zéro/.test(html),
  'la simulation et les outils techniques sont isolés du bilan réel');
verifier(/class="bouton-lien danger" id="bouton-vider-bilan">Effacer tous les relevés/.test(html),
  'la remise à zéro annonce clairement son effet destructif');
verifier(/apiPostProtege\('enregistrerSponsor', data, 'admin', 'admin'\)/.test(admin) &&
  /apiPostProtege\('enregistrerReglagesSponsors', data, 'admin', 'admin'\)/.test(admin),
  'les contrats backend d’enregistrement restent inchangés');
verifier(/'bloc-sponsors-accueil', 'bloc-sponsors-reglages', 'bloc-sponsors-liste', 'bloc-sponsors-bilan'/.test(ecrans) &&
  /'bloc-sponsors-accueil', 'bloc-sponsors-reglages', 'bloc-sponsors-liste', 'bloc-sponsors-bilan'/.test(assistant),
  'ordinateur et mobile déplacent les quatre blocs du nouveau parcours');

if (echecs) {
  console.error('\n' + echecs + ' contrôle(s) en échec.');
  process.exit(1);
}
console.log('\n12 contrôles réussis.');
