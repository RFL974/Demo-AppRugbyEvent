#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const saisie = fs.readFileSync(path.join(racine, 'js', 'saisie.js'), 'utf8');
const generation = fs.readFileSync(path.join(racine, 'js', 'admin-generation.js'), 'utf8');
const admin = fs.readFileSync(path.join(racine, 'js', 'admin.js'), 'utf8');
const html = fs.readFileSync(path.join(racine, 'admin.html'), 'utf8');
const css = fs.readFileSync(path.join(racine, 'css', 'styles.css'), 'utf8');

let controles = 0;
function vrai(v, message) { assert.ok(v, message); controles++; }
function egal(a, b, message) { assert.equal(a, b, message); controles++; }

const contexte = vm.createContext({
  console,
  document: { addEventListener() {}, getElementById() { return null; } },
  localStorage: { getItem() { return ''; }, setItem() {} },
  echapper: s => String(s),
  estTermine: s => /^\s*termin/i.test(String(s)),
  comparerCategorie: (a, b) => String(a).localeCompare(String(b)),
  libelleTourFr: s => String(s || ''),
  libelleArbitreScf: () => '',
  groupeLabelScf: () => '',
  tailleGroupeScf: () => 0,
  libellePouleNiveau: () => '',
  nbPoulesNiveauCat: () => 0,
  phaseLabelScf: () => '',
  afficherMessage() {},
  dialogAlerter: async () => {}
});
vm.runInContext(saisie, contexte, { filename: 'saisie.js' });

vm.runInContext('this.carteMatchOriginale = carteMatch;', contexte);
vm.runInContext('carteMatch = function (m) { return m.id_match + ","; };', contexte);
const ordre = vm.runInContext(`cartesMatchs([
  { id_match:'M2', heure_debut:'09:00' },
  { id_match:'M3', heure_debut:'11:00', demo_a_saisir:true },
  { id_match:'M1', heure_debut:'08:00' }
])`, contexte);
egal(ordre, 'M3,M1,M2,', 'le match manuel de démo reste en tête avant l’ordre chronologique');

vm.runInContext(`
  nomParEquipe = { E1:'RACING 92-1', E2:'CLAMART' };
  capacitesCat = {}; categoriesSaisie = []; matchs = [];
  carteMatch = carteMatchOriginale;
`, contexte);
const carte = vm.runInContext(`carteMatch({
  id_match:'M9', categorie:'U10', poule:'A', heure_debut:'10:00', terrain:'1',
  equipe_A:'E1', equipe_B:'E2', score_A:'', score_B:'', statut:'à venir', phase:'poule',
  demo_a_saisir:true, demo_score_A:20, demo_score_B:5
})`, contexte);
vrai(carte.includes('match-demo') && carte.includes('À saisir pendant la démo'),
  'la carte prioritaire reçoit un repère visuel explicite');
vrai(carte.includes('RACING 92-1 20–5 CLAMART'), 'le score à jouer est rappelé avec les deux équipes');
vrai(carte.includes('>Valider<'), 'le match manuel reste saisissable normalement');
const corrigeable = vm.runInContext(`carteMatch({
  id_match:'M8', categorie:'U10', poule:'A', heure_debut:'09:30', terrain:'1',
  equipe_A:'E1', equipe_B:'E2', score_A:15, score_B:5, statut:'terminé', phase:'poule'
})`, contexte);
vrai(corrigeable.includes('>Corriger<') && corrigeable.includes('match-termine'),
  'un score simulé terminé conserve le parcours normal de correction');

vrai(html.includes('id="bouton-simuler-scores-matin"') &&
  html.includes('id="bouton-simuler-scores-apresmidi"'), 'les deux boutons sont présents dans les bonnes cartes');
vrai(admin.includes("ecouter('bouton-simuler-scores-matin'") &&
  admin.includes("ecouter('bouton-simuler-scores-apresmidi'"), 'les deux boutons sont branchés une seule fois');
vrai(generation.includes("ecrireAdmin('simulerScoresDemo', { phase: phase })"),
  'les boutons passent par l’écriture administrateur protégée');
vrai(generation.includes('Les scores enregistrés restent corrigeables'),
  'l’interface rappelle explicitement que Romain garde la main pour corriger');
vrai(css.includes('.match-demo') && css.includes('.bandeau-demo'),
  'le repère de démonstration possède ses styles dédiés');

const boutons = { 'bouton-simuler-scores-matin': {}, 'bouton-simuler-scores-apresmidi': {} };
const ctxBoutons = vm.createContext({ document: { getElementById: id => boutons[id] },
  equipesCourantes: [], matchsCourants: [] });
vm.runInContext(generation, ctxBoutons);
const eq24 = ['U10', 'U12'].flatMap(categorie => Array.from({ length: 12 }, () => ({ categorie })));
const m36 = Array.from({ length: 36 }, () => ({ phase: 'poule' }));
ctxBoutons.equipesCourantes = eq24.slice(0, 21); ctxBoutons.matchsCourants = m36;
ctxBoutons.majBoutonsScoresDemo();
vrai(boutons['bouton-simuler-scores-matin'].disabled, '21 équipes : le matin attend les trois inscriptions');
ctxBoutons.equipesCourantes = eq24; ctxBoutons.majBoutonsScoresDemo();
vrai(!boutons['bouton-simuler-scores-matin'].disabled, '24 équipes et 36 matchs : bouton matin accessible');
vrai(boutons['bouton-simuler-scores-apresmidi'].disabled, 'sans planning après-midi : bouton désactivé');
for (const nb of [12, 18, 24]) {
  ctxBoutons.matchsCourants = m36.concat(Array.from({ length: nb }, () => ({ phase: 'classement' })));
  ctxBoutons.majBoutonsScoresDemo();
  vrai(!boutons['bouton-simuler-scores-apresmidi'].disabled, nb + ' matchs de classement : bouton accessible');
}
ctxBoutons.equipesCourantes = eq24.slice(0, 21); ctxBoutons.majBoutonsScoresDemo();
vrai(boutons['bouton-simuler-scores-apresmidi'].disabled, '21 équipes : après-midi attend les inscriptions');

console.log('OK — ' + controles + '/' + controles + ' contrôles passés.');
