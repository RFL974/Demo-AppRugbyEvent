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

const selection = [
  { id_equipe: 'E1', nom_equipe: 'CLUB CHOISI-1', categorie: 'U8', nb_joueurs: '8', nb_educateurs: '2' },
  { id_equipe: 'E2', nom_equipe: 'CLUB CHOISI-2', categorie: 'U8', nb_joueurs: '9', nb_educateurs: '1' }
];
const html = lire('admin.html');
vrai(!lire('js/admin-equipes.js').includes('EQUIPES_DEMO_RACING'), 'aucun lot fixe d’équipes dans le bouton');
vrai(html.includes('Démo — Préparer le suivi des équipes présentes'), 'le libellé annonce la source réelle');
vrai(!html.includes('Ajouter les 21 équipes préparées'), 'aucune promesse de créer un lot fixe');

(async function () {
  contexte.equipesCourantes = selection.map(e => ({...e}));
  contexte.configCourante.categories = [{categorie:'U8', presente:'oui'}];
  ecrireImpl = async (action, payload) => ({ok:true, equipes:payload.equipes.length, clubs:4});
  const avant = JSON.stringify(contexte.equipesCourantes);
  await contexte.onAjouterEquipesDemo();
  egal(appels.length, 1, 'un seul appel prépare les clubs');
  egal(appels[0].action, 'chargerClubsDemoRacing', 'aucun appel ajouterEquipe');
  egal(appels[0].payload.equipes, selection, 'la liste affichée exacte est transmise au serveur');
  egal(JSON.stringify(contexte.equipesCourantes), avant, 'la liste des équipes est inchangée');
  egal(appels[0].options.delaiMs, 45000, 'l’appel reste borné');
  vrai(confirmations[0].texte.includes('2 équipe(s)') && confirmations[0].texte.includes('Aucune équipe'),
    'la confirmation donne le nombre réellement choisi');
  vrai(elements['message-equipe'].textContent.includes('2 équipe(s) présentes'), 'le résultat est dynamique');
  egal(rafraichissementsClubs, 1, 'les deux écrans sont relus');
  appels = [];
  await contexte.onAjouterEquipesDemo();
  egal(appels.length, 1, 'un second clic ne crée aucune équipe');
  contexte.equipesCourantes = [selection[1]];
  appels = [];
  await contexte.onAjouterEquipesDemo();
  egal(appels[0].payload.equipes, [selection[1]], 'une équipe retirée de la liste ne réapparaît pas dans le lot');
  contexte.equipesCourantes.push({id_equipe:'E3',nom_equipe:'AUTRE CLUB',categorie:'U14',nb_joueurs:'',nb_educateurs:''});
  appels = [];
  await contexte.onAjouterEquipesDemo();
  egal(appels[0].payload.equipes.length, 2, 'une nouvelle équipe affichée est prise en compte sans liste prédéfinie');
  egal(appels[0].payload.equipes[1].nb_joueurs, '', 'un effectif inconnu n’est pas inventé');
  contexte.equipesCourantes = [];
  appels = [];
  await contexte.onAjouterEquipesDemo();
  egal(appels.length, 0, 'une liste vide ne génère ni équipes ni clubs');
  contexte.equipesCourantes = selection;
  confirmation = false;
  await contexte.onAjouterEquipesDemo();
  egal(appels.length, 0, 'annuler ne déclenche aucune écriture');
  confirmation = true;
  contexte.rafraichirRessourceAdmin = async () => false;
  await contexte.onAjouterEquipesDemo();
  vrai(elements['message-equipe'].type === 'ko' && elements['message-equipe'].textContent.includes('actualisée'),
    'une relecture échouée ne produit pas de faux succès');
  contexte.rafraichirRessourceAdmin = async () => true;
  ecrireImpl = async () => { throw new Error('La liste des équipes a changé.'); };
  await contexte.onAjouterEquipesDemo();
  vrai(elements['message-equipe'].type === 'ko' && elements['message-equipe'].textContent.includes('a changé'),
    'un écran périmé signalé par le serveur reste une erreur visible');
  ecrireImpl = async () => ({ok:true, equipes:99});
  await contexte.onAjouterEquipesDemo();
  vrai(elements['message-equipe'].type === 'ko', 'un nombre non confirmé ne produit pas de succès');
  egal(elements['bouton-charger-equipes-demo'].textContent, 'Démo — Préparer le suivi des équipes présentes',
    'le bouton redevient disponible avec le bon libellé');
  console.log('OK — ' + controles + ' contrôles passés.');
})().catch(err => { console.error(err); process.exit(1); });
