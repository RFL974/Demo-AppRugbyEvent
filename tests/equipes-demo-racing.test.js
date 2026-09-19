#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function egal(recu, attendu, message) {
  const normalise = valeur => (valeur && typeof valeur === 'object')
    ? JSON.parse(JSON.stringify(valeur)) : valeur;
  assert.deepStrictEqual(normalise(recu), normalise(attendu), message);
  controles++;
}
function vrai(valeur, message) { assert.ok(valeur, message); controles++; }

const elements = {
  'bouton-charger-equipes-demo': { disabled: false, textContent: '' },
  'bouton-ajouter': { disabled: false, textContent: '' },
  'message-equipe': { textContent: '', type: '' },
  'reprise-equipes': { hidden: true },
  'liste-equipes': { innerHTML: '' }
};
let appels = [];
let confirmations = [];
let confirmation = true;
let rafraichissementsClubs = 0;
let ecrireImpl = async function (action, payload) {
  return { ok: true, equipe: Object.assign({ id_equipe: 'E' + appels.length, source: 'manuel' }, payload) };
};

const contexte = vm.createContext({
  console,
  document: {
    getElementById(id) { return elements[id] || null; },
    querySelector() { return null; }
  },
  configCourante: {
    categories: [{ categorie: 'U10', presente: 'oui' }, { categorie: 'U12', presente: 'oui' }]
  },
  equipesCourantes: [],
  estPresente: cat => String(cat && cat.presente || 'oui').toLowerCase() !== 'non',
  echapper: valeur => String(valeur == null ? '' : valeur),
  svgIcone: () => '',
  comparerCategorie: (a, b) => String(a).localeCompare(String(b), 'fr'),
  afficherMessage: (zone, texte, type) => { zone.textContent = texte; zone.type = type; },
  majTableauBord() {},
  async apiGet() { return contexte.equipesCourantes.slice(); },
  async dialogConfirmer(texte, options) {
    confirmations.push({ texte, options });
    return confirmation;
  },
  async ecrireAdmin(action, payload, options) {
    appels.push({ action, payload: Object.assign({}, payload), options });
    return ecrireImpl(action, payload, options);
  },
  async rafraichirRessourceAdmin(ressource) {
    if (ressource === 'clubsInvites') rafraichissementsClubs++;
    return true;
  },
  estRefusCle: () => false
});
vm.runInContext(lire('js/admin-equipes.js'), contexte, { filename: 'js/admin-equipes.js' });

const equipes = vm.runInContext('EQUIPES_DEMO_RACING.map(function (e) { return Object.assign({}, e); })', contexte);
const attendues = [
  ['U10', 'RACING 92-1', '13', '1'], ['U10', 'RACING 92-2', '13', '1'],
  ['U10', 'CLAMART-1', '10', '1'], ['U10', 'CLAMART-2', '11', '1'],
  ['U10', 'ISSY-LES-MOULINEAUX', '13', '2'], ['U10', 'MEUDON', '9', '2'],
  ['U10', 'VÉLIZY', '13', '2'], ['U10', 'ANTONY', '10', '2'],
  ['U10', 'SÈVRES', '13', '1'], ['U10', 'RUEIL', '13', '1'],
  ['U12', 'RACING 92-1', '20', '2'], ['U12', 'RACING 92-2', '19', '2'],
  ['U12', 'STADE FRANÇAIS', '20', '2'], ['U12', 'CLAMART', '19', '1'],
  ['U12', 'ISSY-LES-MOULINEAUX', '18', '2'], ['U12', 'MEUDON', '20', '2'],
  ['U12', 'VÉLIZY', '19', '2'], ['U12', 'ANTONY', '17', '1'],
  ['U12', 'SÈVRES', '19', '2'], ['U12', 'RUEIL', '20', '2'],
  ['U12', 'VERSAILLES', '18', '2']
];

console.log('\nChargement des équipes de démonstration');
egal(equipes.length, 21, 'le lot contient exactement les 21 équipes hors parcours d’invitation');
egal(equipes.filter(e => e.categorie === 'U10').length, 10, 'le lot contient 10 équipes U10');
egal(equipes.filter(e => e.categorie === 'U12').length, 11, 'le lot contient 11 équipes U12');
egal(equipes.map(e => [e.categorie, e.nom_equipe, e.nb_joueurs, e.nb_educateurs]), attendues,
  'les noms et effectifs correspondent exactement à la liste de démonstration');
const cles = equipes.map(e => e.categorie + '|' + e.nom_equipe);
vrai(!cles.includes('U10|STADE FRANÇAIS-1') && !cles.includes('U10|STADE FRANÇAIS-2') &&
  !cles.includes('U12|CHATENAY-MALABRY'),
  'les trois équipes réservées au circuit d’invitation sont absentes');

const html = lire('admin.html');
const admin = lire('js/admin.js');
vrai(html.includes('id="bouton-charger-equipes-demo"') && html.includes('Ajouter les 21 équipes préparées'),
  'le bouton Démo est présent dans la carte Équipes');
vrai(html.includes('<strong>Clubs invités</strong>') && html.includes('<strong>Suivi des clubs</strong>'),
  'l’aide annonce les deux vues alimentées par le même jeu fictif');
vrai(html.indexOf('id="bouton-charger-equipes-demo"') < html.indexOf('id="liste-equipes"'),
  'le bouton Démo est placé avant la liste des équipes');
vrai(admin.includes("ecouter('bouton-charger-equipes-demo', 'click', onAjouterEquipesDemo)"),
  'le bouton est branché une seule fois par le parcours d’initialisation');

(async function () {
  appels = [];
  confirmations = [];
  confirmation = true;
  contexte.equipesCourantes = [];
  await contexte.onAjouterEquipesDemo();
  egal(confirmations.length, 1, 'une confirmation précède le chargement');
  vrai(confirmations[0].texte.includes('Stade Français') && confirmations[0].texte.includes('Châtenay-Malabry'),
    'la confirmation rappelle les trois équipes volontairement exclues');
  egal(appels.length, 22, 'le premier chargement envoie 21 équipes puis un seul jeu de clubs');
  vrai(appels.slice(0, 21).every(a => a.action === 'ajouterEquipe'),
    'les 21 équipes réutilisent l’action d’ajout existante');
  egal(appels.slice(0, 21).map(a => [a.payload.categorie, a.payload.nom_equipe,
    a.payload.nb_joueurs, a.payload.nb_educateurs]), attendues,
  'chaque POST transporte la catégorie et les deux effectifs exacts');
  vrai(appels.slice(0, 21).every(a => a.options && a.options.delaiMs === 9000),
    'chaque ajout conserve le budget et l’idempotence du parcours existant');
  egal(appels[21].action, 'chargerClubsDemoRacing',
    'le registre commun aux invitations et au suivi est chargé après les équipes');
  egal(appels[21].options.delaiMs, 45000, 'le chargement groupé des clubs dispose du délai adapté');
  egal(rafraichissementsClubs, 1, 'les deux écrans relisent immédiatement leur source commune');
  egal(contexte.equipesCourantes.length, 21, 'les 21 réponses serveur sont intégrées à la liste locale');
  vrai(elements['message-equipe'].textContent.includes('21 équipes') &&
    elements['message-equipe'].textContent.includes('le refus et les réponses en attente'),
    'un succès complet est annoncé seulement après les équipes et le suivi');

  appels = [];
  confirmations = [];
  await contexte.onAjouterEquipesDemo();
  egal(appels.length, 1, 'une relance sur des équipes conformes ne rejoue que le lot idempotent de clubs');
  egal(appels[0].action, 'chargerClubsDemoRacing', 'la relance ne réécrit aucune équipe');
  egal(confirmations.length, 1, 'la mise à jour du jeu de suivi reste explicitement confirmée');

  const rafraichirNormal = contexte.rafraichirRessourceAdmin;
  contexte.rafraichirRessourceAdmin = async () => false;
  await contexte.onAjouterEquipesDemo();
  vrai(elements['message-equipe'].type === 'ko' &&
    elements['message-equipe'].textContent.includes('leur liste n’a pas pu être actualisée'),
    'une relecture échouée ne prétend pas que les écrans sont à jour');
  contexte.rafraichirRessourceAdmin = rafraichirNormal;

  contexte.configCourante.categories = [{ categorie: 'U10', presente: 'oui' }];
  contexte.equipesCourantes = [];
  appels = [];
  await contexte.onAjouterEquipesDemo();
  egal(appels.length, 0, 'une catégorie requise absente bloque le lot avant tout POST');
  vrai(elements['message-equipe'].textContent.includes('U12') &&
    elements['message-equipe'].textContent.includes('Aucune équipe'),
  'la catégorie manquante et l’absence d’écriture sont expliquées');

  contexte.configCourante.categories = [
    { categorie: 'U10', presente: 'oui' }, { categorie: 'U12', presente: 'oui' }
  ];
  contexte.equipesCourantes = [{
    id_equipe: 'CONFLIT', categorie: 'U10', nom_equipe: 'RACING 92-1',
    nb_joueurs: '12', nb_educateurs: '1'
  }];
  appels = [];
  await contexte.onAjouterEquipesDemo();
  egal(appels.length, 0, 'un effectif existant différent bloque le lot avant tout POST');
  vrai(elements['message-equipe'].textContent.includes('RACING 92-1') &&
    elements['message-equipe'].textContent.includes('Chargement annulé'),
  'le conflit est nommé sans écraser la saisie existante');

  contexte.equipesCourantes = [];
  appels = [];
  confirmation = false;
  await contexte.onAjouterEquipesDemo();
  egal(appels.length, 0, 'annuler la confirmation ne déclenche aucun POST');

  confirmation = true;
  appels = [];
  ecrireImpl = async function (action, payload) {
    if (appels.length === 2) throw new Error('Action annulée.');
    return { ok: true, equipe: Object.assign({ id_equipe: 'PARTIEL-1', source: 'manuel' }, payload) };
  };
  await contexte.onAjouterEquipesDemo();
  egal(appels.length, 2, 'une erreur arrête immédiatement les écritures suivantes');
  egal(contexte.equipesCourantes.length, 1, 'les lignes confirmées avant l’arrêt restent visibles');
  vrai(elements['message-equipe'].textContent.includes('1/21') &&
    elements['message-equipe'].textContent.includes('RACING 92-2'),
  'l’arrêt indique la progression exacte et l’équipe concernée');

  console.log('OK — ' + controles + '/' + controles + ' contrôles passés.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
