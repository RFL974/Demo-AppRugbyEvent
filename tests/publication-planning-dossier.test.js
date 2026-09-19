/* Publication unique : publier le tournoi rend automatiquement le planning visible dans le dossier. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function vrai(v, m) { assert.ok(v, m); controles++; }
function faux(v, m) { assert.ok(!v, m); controles++; }

const contexte = vm.createContext({
  console, URL, URLSearchParams,
  window: { location: { search: '' } },
  document: { addEventListener() {}, getElementById() { return null; } },
  txt: valeur => String(valeur == null ? '' : valeur).trim(),
  echapper: valeur => String(valeur),
  section: (titre, contenu) => contenu ? '<section><h2>' + titre + '</h2>' + contenu + '</section>' : '',
  comparerCategorie: (a, b) => String(a).localeCompare(String(b), 'fr'),
  ctxScf: () => ({ estScf: false }),
  tableauPlanning: matchs => '<table data-matchs="' + matchs.length + '"></table>'
});
vm.runInContext(lire('js/dossier.js'), contexte, { filename: 'js/dossier.js' });

vrai(contexte.dossierTournoiPublie({ config: { global: { tournoi_publie: 'oui' } } }),
  'un tournoi publié ouvre automatiquement le planning du dossier');
vrai(contexte.dossierTournoiPublie({ config: { global: { tournoi_publie: 'OUI' } } }),
  'la valeur de publication reste tolérante à la casse');
faux(contexte.dossierTournoiPublie({ config: { global: { tournoi_publie: 'non', planning_visible_clubs: 'oui' } } }),
  'un tournoi masqué garde le planning caché même si l’ancien drapeau vaut oui');
vrai(contexte.dossierTournoiPublie({ config: { global: { tournoi_publie: 'oui', planning_visible_clubs: 'non' } } }),
  'un tournoi publié montre le planning même si l’ancien drapeau vaut non');
faux(contexte.dossierTournoiPublie(null),
  'une réponse publique absente ne fabrique jamais un état publié');

const equipe = { id_equipe: 'E1', nom_equipe: 'Racing U8', categorie: 'U8', poule: 'A', nb_joueurs: 9 };
const adversaire = { id_equipe: 'E2', nom_equipe: 'Massy U8', categorie: 'U8', poule: 'A' };
const match = { categorie: 'U8', phase: 'poule', heure_debut: '10:00', equipe_A: 'E1', equipe_B: 'E2' };
const base = { equipes: [equipe], equipesTournoi: [equipe, adversaire], matchs: [match] };
const masque = Object.assign({ tournoiPublie: false }, base);
const publie = Object.assign({ tournoiPublie: true }, base);

faux(contexte.sectionMesEquipes(masque).includes('Poule A'),
  'avant publication, le dossier ne révèle pas la poule');
vrai(contexte.sectionMesEquipes(publie).includes('Poule A') && contexte.sectionMesEquipes(publie).includes('Massy U8'),
  'après publication, la poule complète apparaît dans le dossier');
faux(contexte.sectionMonPlanning(masque, []).includes('<table'),
  'avant publication, aucun tableau de planning n’est rendu');
vrai(contexte.sectionMonPlanning(publie, []).includes('class="d-planning"') &&
  contexte.sectionMonPlanning(publie, []).includes('Massy U8'),
  'après publication, les matchs du club apparaissent automatiquement');

const adminHtml = lire('admin.html');
const adminJs = lire('js/admin.js');
const generation = lire('js/admin-generation.js');
const dossier = lire('js/dossier.js');
const styles = lire('css/styles.css') + lire('css/theme-r92.css');
faux(adminHtml.includes('publication-planning') || adminHtml.includes('Rendre le planning visible par les clubs'),
  'le bouton et son emplacement ont disparu de l’administration');
vrai(adminHtml.includes('le planning apparaît aussi automatiquement') && adminHtml.includes('dossier des clubs'),
  'la carte Publication explique clairement le nouveau comportement automatique');
faux(adminJs.includes('onPublierPlanning') || generation.includes('publierPlanningClubs'),
  'le frontend ne branche ni n’appelle plus l’ancienne action dédiée');
faux(dossier.includes('ctx.planningVisible') || dossier.includes('(config.global || {}).planning_visible_clubs'),
  'le dossier ne dépend plus de l’ancien drapeau');
faux(styles.includes('.publi-planning'),
  'les styles devenus inutiles ont été retirés');

console.log('OK — ' + controles + ' contrôles passés.');
