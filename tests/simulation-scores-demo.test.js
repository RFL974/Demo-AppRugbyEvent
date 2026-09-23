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
/* ⭐ PRÉMISSE ADAPTÉE (lot « Poules & planning ») — l'appel porte désormais un DÉLAI borné en
   troisième argument (`{ delaiMs: DELAI_ECRITURE_POULES_MS }`), sans quoi un serveur muet laissait
   le bouton figé pour toujours. L'invariant protégé — « les boutons passent par l'écriture
   administrateur protégée » — est INCHANGÉ, et on le renforce : l'appel doit être borné. */
vrai(/ecrireAdmin\('simulerScoresDemo', \{ phase: phase \}/.test(generation),
  'les boutons passent par l’écriture administrateur protégée');
vrai(/ecrireAdmin\('simulerScoresDemo', \{ phase: phase \}, \{ delaiMs: DELAI_ECRITURE_POULES_MS \}\)/.test(generation),
  '⭐ et cette écriture est BORNÉE : un serveur muet ne fige plus le bouton');
vrai(generation.includes('Les scores enregistrés restent corrigeables'),
  'l’interface rappelle explicitement que Romain garde la main pour corriger');
vrai(css.includes('.match-demo') && css.includes('.bandeau-demo'),
  'le repère de démonstration possède ses styles dédiés');

const boutons = { 'bouton-simuler-scores-matin': {}, 'bouton-simuler-scores-apresmidi': {} };
const ctxBoutons = vm.createContext({ document: { getElementById: id => boutons[id] },
  equipesCourantes: [], matchsCourants: [] });
vm.runInContext(generation, ctxBoutons);
// ⭐ Lot « Inviter un club » (2ᵉ passage) : le jeu RÉEL — 10 U10 + 11 U12, RACING 92-1 dans chacune — plus 12 + 12.
const jeu = [['U10', 10], ['U12', 11]].flatMap(([categorie, n]) => Array.from({ length: n }, (_, i) =>
  ({ categorie, nom_equipe: i === 0 ? 'RACING 92-1' : categorie + ' ÉQUIPE ' + i })));
const m45 = Array.from({ length: 45 }, () => ({ phase: 'poule' }));
ctxBoutons.equipesCourantes = jeu; ctxBoutons.matchsCourants = [];
ctxBoutons.majBoutonsScoresDemo();
vrai(boutons['bouton-simuler-scores-matin'].disabled, 'jeu de démonstration sans planning : le matin attend la génération');
ctxBoutons.matchsCourants = m45; ctxBoutons.majBoutonsScoresDemo();
vrai(!boutons['bouton-simuler-scores-matin'].disabled, '10 + 11 équipes et les 45 matchs générés : bouton matin accessible');
vrai(boutons['bouton-simuler-scores-apresmidi'].disabled, 'sans planning après-midi : bouton désactivé');
for (const nb of [5, 10, 45]) {
  ctxBoutons.matchsCourants = m45.concat(Array.from({ length: nb }, () => ({ phase: 'classement' })));
  ctxBoutons.majBoutonsScoresDemo();
  vrai(!boutons['bouton-simuler-scores-apresmidi'].disabled, nb + ' matchs de classement générés : bouton accessible');
}
ctxBoutons.equipesCourantes = jeu.filter(e => !(e.categorie === 'U12' && e.nom_equipe === 'RACING 92-1')); ctxBoutons.majBoutonsScoresDemo();
vrai(boutons['bouton-simuler-scores-matin'].disabled && boutons['bouton-simuler-scores-apresmidi'].disabled,
  'sans RACING 92-1 en U12 : aucune simulation (l’équipe cible manque)');
ctxBoutons.equipesCourantes = jeu.concat([{ categorie: 'U8', nom_equipe: 'AUTRE' }]); ctxBoutons.majBoutonsScoresDemo();
vrai(boutons['bouton-simuler-scores-matin'].disabled, 'une équipe d’une autre catégorie : simulation indisponible');
vrai(!/=== 12|length === 24|12 équipes U10, 12 équipes U12/.test(generation), 'plus aucune exigence 12 + 12 dans le frontend');

console.log('OK — ' + controles + '/' + controles + ' contrôles passés.');
