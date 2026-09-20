#!/usr/bin/env node
/**
 * Non-régression — la table de marque (page de saisie des scores), d'après la maquette.
 *
 *  1) Les matchs passent en TABLEAU. ⛔ Le contrat de validation ne change pas : une ligne
 *     porte `.match[data-id]`, deux `input.score` dans l'ordre A puis B, `.bouton-valider` et
 *     `.message-form` — exactement ce que cherche le gestionnaire de clic. C'est ce qui permet
 *     de refaire la mise en page sans toucher à l'envoi des scores.
 *  2) La saisie DÉTAILLÉE (essais, transformations…) ne tient pas dans une ligne : ces
 *     catégories restent en cartes. On ne perd pas une fonction métier pour une mise en page.
 *  3) Le filtre « terrain » COÏNCIDE avec la répartition : il ne propose que les terrains où
 *     la catégorie affichée joue vraiment, et il ne disparaît plus faute de répartition
 *     enregistrée — il se rabat alors sur les terrains de jeu numérotés.
 *  4) Le filtre de statut (« À saisir », « Terminés », « Tous ») porte ses compteurs, et un
 *     match en attente n'est jamais « à saisir ».
 *
 *  Modules réels, DOM simulé ; aucune donnée métier lue ni écrite, aucun appel réseau.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let controles = 0;
function ok(v, m) { controles++; if (!v) throw new Error('ÉCHEC ' + controles + ' — ' + m); }

const racine = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');

const elements = {};
function faireElement(id) {
  return { id: id || '', innerHTML: '', textContent: '', hidden: false, value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, appendChild() {}, insertBefore() {},
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
}
['liste-matchs', 'filtre-cat-saisie', 'select-cat-saisie', 'filtre-terrain-saisie',
 'select-terrain-saisie', 'select-statut-saisie', 'compteur-saisie', 'maj-saisie']
  .forEach(function (id) { elements[id] = faireElement(id); });

const stockage = {};
const contexte = {
  document: { getElementById: (id) => elements[id] || null, querySelector: () => null,
              querySelectorAll: () => [], addEventListener() {}, createElement: faireElement },
  window: { addEventListener() {} },
  localStorage: { getItem: (k) => (k in stockage ? stockage[k] : null),
                  setItem: (k, v) => { stockage[k] = String(v); } },
  echapper: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
  estTermine: (s) => String(s) === 'terminé',
  comparerCategorie: (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true }),
  libelleArbitreScf: () => '', phaseLabelScf: () => '', indexerNoms: () => ({}),
  // Briques de commun.js employées par le rendu des cartes (vocabulaire Super Challenge).
  groupeLabelScf: () => null, tailleGroupeScf: () => 0, ctxScf: () => ({ estScf: false }),
  pouleEFG: (p) => p, libellePouleNiveau: () => null,
  afficherMessage() {}, apiGet: () => Promise.reject(new Error('aucun réseau')),
  console, setTimeout, clearTimeout
};
const ctx = vm.createContext(contexte);
vm.runInContext(lire('js/saisie.js'), ctx, { filename: 'js/saisie.js' });

/* Un tournoi minimal : U10 sur les terrains 1 et 2, U12 sur 3 et 4. */
vm.runInContext(`
  equipes = [];
  nomParEquipe = { a1:'CLAMART', a2:'VÉLIZY', b1:'RUEIL', b2:'ANTONY' };
  matchs = [
    {id_match:'m1', categorie:'U10', terrain:'1', poule:'A', heure_debut:'10:00', phase:'poule',
     equipe_A:'a1', equipe_B:'a2', statut:'à venir', score_A:'', score_B:''},
    {id_match:'m2', categorie:'U10', terrain:'2', poule:'B', heure_debut:'10:00', phase:'poule',
     equipe_A:'b1', equipe_B:'b2', statut:'terminé', score_A:12, score_B:7},
    {id_match:'m3', categorie:'U12', terrain:'3', poule:'A', heure_debut:'10:00', phase:'poule',
     equipe_A:'a1', equipe_B:'b1', statut:'à venir', score_A:'', score_B:''},
    {id_match:'m4', categorie:'U12', terrain:'4', poule:'B', heure_debut:'10:37', phase:'poule',
     equipe_A:'a2', equipe_B:'b2', statut:'à venir', score_A:'', score_B:''},
    // Un match de Coupe dont l'adversaire n'est pas encore connu : il n'est PAS saisissable.
    {id_match:'m5', categorie:'U12', terrain:'3', poule:'', heure_debut:'14:00', phase:'classement',
     sous_tableau:'COUPE', tour:'DEMI_FINALE', equipe_A:'a1', equipe_B:'', statut:'à venir',
     score_A:'', score_B:''}
  ];
  capacitesCat = {};
  categorieActiveSaisie = 'U10';
  grandsTerrains = {};
  matchsSaisissables = matchs.filter(function (m) { return m.id_match !== 'm5'; });
`, ctx);

/* --------------------------------------------------- 1) le contrat de validation */
const ligne = vm.runInContext('ligneMatchTableau(matchs[0])', ctx);
ok(/<tr class="match[^"]*" data-id="m1">/.test(ligne),
  '⛔ une ligne porte `.match[data-id]` — ce que le gestionnaire de validation remonte chercher');
ok((ligne.match(/class="r-input score"/g) || []).length === 2,
  '⛔ deux champs de score, pas un de plus : le gestionnaire les lit par position (A puis B)');
ok(ligne.indexOf('CLAMART') < ligne.indexOf('VÉLIZY'),
  'et dans l’ordre des équipes A puis B');
ok(/class="bouton bouton-valider"/.test(ligne) && /class="message-form"/.test(ligne),
  'le bouton et la zone de message sont dans la ligne');
ok(/aria-label="Score de CLAMART"/.test(ligne) && /aria-label="Score de VÉLIZY"/.test(ligne),
  '⛔ chaque champ dit de QUELLE équipe il porte le score : deux cases nues ne se distinguent pas');
const ligneFinie = vm.runInContext('ligneMatchTableau(matchs[1])', ctx);
ok(/match-termine/.test(ligneFinie) && /disabled/.test(ligneFinie) && /Corriger/.test(ligneFinie),
  'un match terminé est verrouillé et propose « Corriger »');
ok(/data-libelle="Heure"/.test(ligne) && /data-libelle="Action"/.test(ligne),
  'chaque cellule porte son libellé — c’est lui qui sert de titre quand la ligne devient une carte');

/* --------------------------------------------------- 2) la saisie détaillée reste en cartes */
ok(vm.runInContext('listeTableauPossible(matchsSaisissables)', ctx) === true,
  'sans tir au but, une liste de matchs saisissables passe en tableau');
ok(vm.runInContext('listeTableauPossible(matchs)', ctx) === false,
  '⛔ un match en attente d’adversaire renvoie aussi la liste aux cartes : il n’a pas de champ ' +
  'à remplir, et sa ligne serait une case vide sans explication');
vm.runInContext("capacitesCat = { U10: { tir_au_but: true } };", ctx);
ok(vm.runInContext('listeTableauPossible(matchsSaisissables)', ctx) === false,
  '⛔ une catégorie en saisie détaillée renvoie la liste aux cartes : la ligne ne peut pas ' +
  'porter les huit compteurs, et on ne supprime pas la fonction pour la mise en page');
ok(vm.runInContext('rendreMatchs(matchsSaisissables).indexOf("<table") < 0', ctx),
  'et le rendu choisit bien les cartes dans ce cas');
vm.runInContext('capacitesCat = {};', ctx);
ok(vm.runInContext('rendreMatchs(matchsSaisissables).indexOf("table-saisie") >= 0', ctx),
  'sinon il choisit le tableau');

/* --------------------------------------------------- 3) le filtre terrain */
let props = vm.runInContext('JSON.stringify(terrainsProposesSaisie())', ctx);
ok(props.indexOf('Terrain 1') >= 0 && props.indexOf('Terrain 2') >= 0,
  'sans répartition enregistrée, le filtre se rabat sur les terrains de jeu…');
ok(props.indexOf('Terrain 3') < 0 && props.indexOf('Terrain 4') < 0,
  '⛔ …et ne propose QUE ceux où la catégorie affichée joue');
vm.runInContext("categorieActiveSaisie = 'U12';", ctx);
props = vm.runInContext('JSON.stringify(terrainsProposesSaisie())', ctx);
ok(props.indexOf('Terrain 3') >= 0 && props.indexOf('Terrain 1') < 0,
  'changer de catégorie change les terrains proposés');

vm.runInContext("categorieActiveSaisie = 'U10'; grandsTerrains = { 'Terrain Municipal':['1','2','3'], 'Terrain du Racing':['4'] };", ctx);
props = vm.runInContext('JSON.stringify(terrainsProposesSaisie())', ctx);
ok(props.indexOf('Terrain Municipal (terrains 1, 2)') >= 0,
  'avec une répartition, le grand terrain est nommé et porte ses mini-terrains');
ok(props.indexOf('3') < 0,
  '⛔ et seulement ceux que la catégorie EMPLOIE : annoncer le terrain 3 à U10 ferait attendre ' +
  'des matchs qui ne viendront pas');
ok(props.indexOf('Racing') < 0,
  '⛔ un grand terrain où la catégorie ne joue pas n’est pas proposé');

// Dans l'app, `filtrerParTerrain` reçoit une liste DÉJÀ restreinte à la catégorie : on la
// lui donne dans le même état, sinon le contrôle ne dirait rien de l'usage réel.
vm.runInContext("matchsU10 = matchs.filter(function(m){return m.categorie==='U10';});", ctx);
vm.runInContext("terrainActifSaisie = 'Terrain Municipal';", ctx);
ok(vm.runInContext('filtrerParTerrain(matchsU10).map(function(m){return m.id_match;}).join()', ctx) === 'm1,m2',
  'le filtre par grand terrain garde les matchs de ses mini-terrains');
ok(vm.runInContext('filtrerParTerrain(matchs).length', ctx) === 4,
  'et sur une liste non restreinte, il garde bien les matchs des trois terrains du grand terrain');
vm.runInContext("terrainActifSaisie = 'terrain:2';", ctx);
ok(vm.runInContext('filtrerParTerrain(matchs).map(function(m){return m.id_match;}).join()', ctx) === 'm2',
  'le repli « terrain:N » filtre sur le terrain de jeu');
vm.runInContext("terrainActifSaisie = '';", ctx);
ok(vm.runInContext('filtrerParTerrain(matchs).length', ctx) === 5, '« Tous » ne filtre rien');

/* --------------------------------------------------- 4) le filtre de statut */
vm.runInContext("grandsTerrains = {}; statutSaisie = 'asaisir';", ctx);
ok(vm.runInContext('filtrerParStatut(matchs).map(function(m){return m.id_match;}).join()', ctx) === 'm1,m3,m4',
  '⛔ « À saisir » écarte les matchs terminés ET ceux qui attendent leur adversaire : proposer ' +
  'une ligne qu’on ne peut pas remplir serait une fausse tâche');
vm.runInContext("statutSaisie = 'termines';", ctx);
ok(vm.runInContext('filtrerParStatut(matchs).map(function(m){return m.id_match;}).join()', ctx) === 'm2',
  '« Terminés » ne garde qu’eux');
vm.runInContext("statutSaisie = 'tous';", ctx);
ok(vm.runInContext('filtrerParStatut(matchs).length', ctx) === 5, '« Tous » garde tout, match en attente compris');
vm.runInContext("statutSaisie = 'asaisir';", ctx);
vm.runInContext('peuplerFiltreStatut(matchs)', ctx);
ok(/À saisir \(3 matchs\)/.test(elements['select-statut-saisie'].innerHTML) &&
   /Terminés \(1 match\)/.test(elements['select-statut-saisie'].innerHTML),
  '⛔ chaque entrée porte son compte : on voit ce qui reste sans avoir à choisir pour le savoir');
ok(/3 match/.test(elements['compteur-saisie'].innerHTML) && /à compléter/.test(elements['compteur-saisie'].innerHTML),
  'et le compteur redit ce qui reste à faire');

/* --------------------------------------------------- 5) la page et sa feuille */
/* ⛔ LA PASSERELLE EST FIGÉE : `SaisieProtegee.html` est vérifié octet pour octet contre le
   déploiement validé (contrôle S.3 de `backend-corr-acces-45min-demo`). Le script doit donc
   compléter l'entête lui-même — et la suite garde que cette porte reste fermée. */
const htmlPasserelle = lire('../backend/gateway-acces-scores/SaisieProtegee.html');
ok(!/css\/saisie\.css/.test(htmlPasserelle) && !/name="viewport"/.test(htmlPasserelle),
  '⛔ le HTML de la passerelle n’est PAS modifié : y toucher imposerait un redéploiement Apps Script');
const sourceSaisie = lire('js/saisie.js');
ok(/meta\.name = 'viewport'/.test(sourceSaisie) && /width=device-width/.test(sourceSaisie),
  '⛔ le viewport est posé par le script : sans lui, un téléphone rend la page à 980 px, dézoomée, ' +
  'et aucune règle mobile ne se déclenche');
ok(/lien\.id = 'cv-feuille-saisie'/.test(sourceSaisie) && /saisie\.css/.test(sourceSaisie),
  'et la feuille propre à cette page est chargée de la même façon');
ok(!/localStorage/.test(sourceSaisie.slice(sourceSaisie.indexOf('let statutSaisie'),
     sourceSaisie.indexOf('let statutSaisie') + 400)),
  '⛔ le filtre de statut ne touche PAS localStorage : la page protégée l’interdit (G.4)');
const css = lire('css/saisie.css');
ok(/#liste-matchs \.phase-contenu\.est-tableau \{ display:block/.test(css),
  '⛔ la grille à deux colonnes des cartes est neutralisée pour le tableau, avec une ' +
  'spécificité au moins égale à `#liste-matchs .phase-contenu` — sinon le tableau reste ' +
  'enfermé dans une piste (mesuré : 663 px au lieu de 1 342)');
ok(/@media \(max-width:767px\)[\s\S]*\.table-saisie tr\.match \{[^}]*border/.test(css),
  'sous 768px, les lignes redeviennent des cartes');
ok(/\.table-saisie td::before \{ content:attr\(data-libelle\)/.test(css),
  'et chaque valeur retrouve son libellé');

console.log('OK — ' + controles + ' contrôles de la table de marque.');
