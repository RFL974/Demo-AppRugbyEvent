#!/usr/bin/env node
/**
 * Non-régression — écrans « Poules & planning » et « Après-midi », d'après les maquettes.
 *
 *  1) Le planning est filtré par ONGLETS : une barre pour la catégorie, une pour le moment de
 *     la journée. Les deux choix, et le match ouvert, vivent dans le MODULE — la zone est
 *     réécrite à chaque rendu, un repère laissé dans le DOM disparaîtrait au premier
 *     rafraîchissement (rechargement des matchs, scores de démonstration, édition des poules).
 *  2) La fiche « Détail du match » est en LECTURE SEULE : elle montre le score enregistré, elle
 *     n'ouvre aucun champ. La table de marque reste le seul chemin d'écriture des scores.
 *  3) L'ordre de lecture suit l'ordre du DOM : la composition des poules est ÉCRITE après la
 *     grille, elle n'y est plus ramenée par un `order` en CSS (WCAG 2.4.3).
 *  4) Le sous-titre d'une colonne (« Municipal » sous « Terrain 1 ») vient de la répartition
 *     ENREGISTRÉE. Sans elle, la colonne ne porte que son numéro — jamais un nom deviné.
 *  5) Écran Après-midi : le bandeau dit ce qui manque et porte sa jauge ; chaque catégorie
 *     incomplète offre un raccourci vers SES matchs ; aucun lien à jeton n'est recopié ici,
 *     le bouton conduit à l'écran Publication qui pilote cet accès.
 *  6) ecrans.js : « Générer les poules automatiquement » reste HORS du dépliant d'options, et
 *     le bouton de démonstration descend dans un pied d'écran.
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

/* ==========================================================================
   Un DOM réduit à ce que les deux écrans utilisent réellement.
   ========================================================================== */
function faireElement(id) {
  const lot = new Set();
  return {
    id: id || '', textContent: '', innerHTML: '', hidden: false, disabled: false,
    classList: {
      add() { Array.prototype.forEach.call(arguments, function (c) { lot.add(c); }); },
      remove() { Array.prototype.forEach.call(arguments, function (c) { lot.delete(c); }); },
      toggle(c, v) { if (v) lot.add(c); else lot.delete(c); },
      contains(c) { return lot.has(c); }
    },
    querySelector: () => null, querySelectorAll: () => [],
    appendChild() {}, setAttribute() {}, getAttribute: () => null
  };
}

/* --------------------------------------------------- 1) Le planning et ses onglets */
const zone = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [], appendChild() {} };
const contexte = {
  document: { getElementById: (id) => (id === 'affichage-planning' ? zone : faireElement(id)) },
  equipesCourantes: [
    { id_equipe: 'A1', nom_equipe: 'CLAMART', categorie: 'U10', poule: 'A' },
    { id_equipe: 'A2', nom_equipe: 'VÉLIZY', categorie: 'U10', poule: 'A' },
    { id_equipe: 'B1', nom_equipe: 'MEUDON', categorie: 'U12', poule: 'A' },
    { id_equipe: 'B2', nom_equipe: 'SÈVRES', categorie: 'U12', poule: 'A' }
  ],
  configCourante: { categories: [], global: {} },
  editionPoules: false,
  echapper: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
  libelleArbitreScf: () => '', ctxScf: () => ({ estScf: false }), phaseLabelScf: () => '',
  groupeLabelScf: () => '', pouleEFG: (p) => p, formatApresMidiDe: () => '',
  nbPoulesNiveauCat: () => 0, definitionFormatApresMidi: () => ({ titre: 'Croisé', desc: 'Résumé' }),
  estTermine: (s) => s === 'terminé',
  majBoutonsScoresDemo() {}, majDimancheScf() {}
};
const ctx = vm.createContext(contexte);
vm.runInContext(lire('js/admin-generation.js'), ctx, { filename: 'js/admin-generation.js' });

const POULES = [{ categorie: 'U10', nom_poule: 'A' }, { categorie: 'U12', nom_poule: 'A' }];
const MATCHS = [
  { id_match: 'M1', categorie: 'U10', terrain: '1', heure_debut: '10:00', heure_fin: '10:22',
    equipe_A: 'A1', equipe_B: 'A2', phase: 'poule', poule: 'A', statut: 'terminé', score_A: 12, score_B: 7 },
  { id_match: 'M2', categorie: 'U12', terrain: '2', heure_debut: '10:00',
    equipe_A: 'B1', equipe_B: 'B2', phase: 'poule', poule: 'A', statut: 'à venir' },
  { id_match: 'M3', categorie: 'U10', terrain: '1', heure_debut: '14:00',
    equipe_A: 'A1', equipe_B: 'A2', phase: 'classement', poule: '1', statut: 'à venir' }
];
const peindre = () => vm.runInContext('afficherPlanning(POULES, MATCHS)',
  Object.assign(ctx, { POULES: POULES, MATCHS: MATCHS }));

peindre();
ok(/data-plan-cat="U10"/.test(zone.innerHTML) && /data-plan-cat="U12"/.test(zone.innerHTML),
  'une barre porte un onglet par catégorie');
ok(/data-plan-phase="matin"/.test(zone.innerHTML) && /data-plan-phase="aprem"/.test(zone.innerHTML),
  'une seconde barre porte le moment de la journée');
ok(/role="tablist"/.test(zone.innerHTML) && /aria-selected="true"/.test(zone.innerHTML),
  'les onglets sont annoncés comme tels, et l’actif est désigné');
// La grille seule : le dépliant « Voir toutes les équipes » montre volontairement le reste.
const grilleSeule = () => zone.innerHTML.slice(0, zone.innerHTML.indexOf('cv-poules-section'));
ok(grilleSeule().indexOf('CLAMART') >= 0 && grilleSeule().indexOf('MEUDON') < 0,
  'la catégorie choisie filtre les matchs affichés');
ok(/1 match · 1 score saisi/.test(zone.innerHTML), 'le compteur suit la vue affichée, pas le tournoi entier');
ok(/cv-planning-compte est-complet/.test(zone.innerHTML), 'un moment entièrement saisi se voit');

/* ⛔ LE POINT QUI COMPTE : l'état vit dans le module. Une réécriture de la zone (rechargement
   des matchs, scores de démonstration…) ne doit pas rendre l'organisateur à la case départ. */
ok(vm.runInContext('planningCategorie', ctx) === 'U10' && vm.runInContext('planningPhase', ctx) === 'matin',
  'la catégorie et le moment sont portés par le module');
vm.runInContext('activerCategoriePlanning("U12")', ctx);
peindre();
ok(/aria-selected="true" tabindex="0" data-plan-cat="U12"/.test(zone.innerHTML) && grilleSeule().indexOf('MEUDON') >= 0,
  'le choix mémorisé est reproduit par le rendu suivant');
ok(zone.innerHTML.indexOf('data-plan-phase="aprem"') < 0,
  '⛔ une catégorie sans match d’après-midi n’affiche pas cet onglet');

vm.runInContext('activerCategoriePlanning("U10")', ctx);
peindre();

/* --------------------------------------------------- 2) La fiche de match, en lecture seule */
ok(zone.innerHTML.indexOf('cv-fiche-match est-vide') >= 0, 'sans match choisi, la fiche invite à en choisir un');
ok(!/<input|<textarea|contenteditable/.test(zone.innerHTML),
  '⛔ AUCUN champ de saisie dans le planning : les scores s’enregistrent à la table de marque');
const clic = (id) => zone.onclick({ target: { closest: (sel) => (sel.indexOf('data-match') >= 0
  ? { getAttribute: () => id } : null) } });
clic('M1');
ok(/Détail du match/.test(zone.innerHTML) && /cv-ecusson/.test(zone.innerHTML),
  'choisir un match ouvre sa fiche, écussons compris');
ok(/cv-score-valeur">12</.test(zone.innerHTML) && /cv-score-valeur">7</.test(zone.innerHTML),
  'le score DÉJÀ enregistré est montré tel quel');
ok(/Les scores se saisissent à la table de marque/.test(zone.innerHTML),
  'et la fiche dit où il se saisit, plutôt que d’ouvrir un second chemin');
ok(vm.runInContext('planningMatch', ctx) === 'M1', 'le match ouvert est porté par le module');
clic('M1');
ok(vm.runInContext('planningMatch', ctx) === '' && /cv-fiche-match est-vide/.test(zone.innerHTML),
  'un second clic sur le même match referme sa fiche');
clic('M2');
ok(vm.runInContext('planningMatch', ctx) === '' ,
  '⛔ un match absent de la vue ne peut pas être ouvert : la fiche ne montre jamais un match masqué');

/* --------------------------------------------------- 3) L'ordre de lecture suit le DOM */
clic('M1');
ok(zone.innerHTML.indexOf('cv-planning-grille') < zone.innerHTML.indexOf('Composition des poules'),
  '⛔ la composition des poules est ÉCRITE après la grille (WCAG 2.4.3)');
const css = lire('css/theme-r92.css');
ok(!/\.cv-compositions-poules\s*\{[^}]*order\s*:/.test(css),
  '⛔ et elle n’y est plus ramenée par un `order` en CSS');
ok(/Pas encore saisi|Détail du match/.test(zone.innerHTML), 'la fiche reste rendue après le repeint');

/* --------------------------------------------------- 4) Le nom du grand terrain, jamais deviné */
ok(/Terrain 1/.test(zone.innerHTML) && !/cv-col-grand/.test(zone.innerHTML),
  '⛔ sans répartition enregistrée, la colonne ne porte que son numéro');
contexte.configCourante.global.repartition_grands_terrains =
  JSON.stringify({ 'Terrain Municipal': ['1', '2'] });
peindre();
ok(/cv-col-grand">Municipal</.test(zone.innerHTML),
  'la répartition enregistrée nomme la colonne, sans répéter le mot « Terrain »');
contexte.configCourante.global.repartition_grands_terrains = '{ceci n’est pas du JSON';
peindre();
ok(/Terrain 1/.test(zone.innerHTML) && !/cv-col-grand/.test(zone.innerHTML),
  'une répartition illisible ne fait pas tomber le planning');
contexte.configCourante.global.repartition_grands_terrains = '';

/* --------------------------------------------------- 5) L'écran Après-midi */
const apercu = vm.runInContext('apercuApresMidiCiel(MATIN, CATS)', Object.assign(ctx, {
  MATIN: [MATCHS[0], MATCHS[1]],
  CATS: [{ categorie: 'U10' }, { categorie: 'U12' }]
}));
ok(/data-cv-matchs="U12"/.test(apercu),
  'une catégorie incomplète offre un raccourci vers SES matchs');
ok(!/data-cv-matchs="U10"/.test(apercu) && /cv-score-fait/.test(apercu),
  '⛔ une catégorie complète n’offre pas de raccourci : elle est annoncée faite');
ok(/data-cv-publication/.test(apercu) && !/jeton|token/i.test(apercu),
  '⛔ aucun lien à jeton recopié ici : le bouton conduit à l’écran qui pilote cet accès');
ok(/data-role="place-bouton-apresmidi"/.test(apercu),
  'la carte du format réserve la place du bouton de génération (déplacé, pas recréé)');

/* Les jauges, d'après la maquette : une barre ET son pourcentage écrit, la même partout. */
const jauge = vm.runInContext('jaugeHTML(3, 12, 25, "Scores saisis U10 : 3 sur 12")', ctx);
ok(/<progress max="12" value="3"/.test(jauge) && /cv-jauge-pct">25 %/.test(jauge),
  '⛔ une jauge n’est jamais une barre seule : le pourcentage est ÉCRIT à côté');
ok(/aria-label="Scores saisis U10 : 3 sur 12"/.test(jauge),
  '⛔ et le nom accessible porte le COMPTE réel, pas le seul pourcentage');
/* ⛔ Contrôlé sur le HTML RÉELLEMENT produit, pas seulement sur la fabrique appelée à la main :
   c'est l'appelant qui choisit l'étiquette, et c'est là qu'elle peut se dégrader. */
ok(/aria-label="Scores saisis U10 : \d+ sur \d+"/.test(apercu),
  'chaque catégorie annonce son compte, catégorie nommée');
ok(/cv-jauge">/.test(apercu) && /cv-jauge-pct/.test(apercu),
  'les catégories emploient cette même jauge');
ok(/cv-score-compte">0 \/ 1</.test(apercu) && !/scores saisis<\/span>/.test(apercu),
  'le compte de la maquette est court : « 0 / 1 », le libellé est porté par le titre de section');
ok(!/<progress(?![^>]*aria-label)/.test(apercu),
  'aucune barre de progression sans nom accessible');
/* ⛔ Le rendu natif de <progress> diffère d'un moteur à l'autre (coins carrés, piste invisible
   sur fond coloré) : sans `appearance:none`, les pseudo-éléments qui le remplacent sont ignorés. */
ok(/\.cv-jauge progress\s*\{[^}]*appearance:\s*none/.test(css) &&
   /-webkit-appearance:\s*none/.test(css),
  '⛔ la jauge neutralise le rendu natif avant de le redessiner');
ok(/::-webkit-progress-value/.test(css) && /::-moz-progress-bar/.test(css),
  'et redessine le remplissage pour les deux familles de moteurs');
ok(/\.cv-information \.cv-jauge progress::-webkit-progress-value\s*\{[^}]*currentColor/.test(css),
  'sur le bandeau, le remplissage prend la couleur du message plutôt qu’un bleu illisible');

/* --------------------------------------------------- 6) ecrans.js : ce qui reste dehors */
const ecrans = lire('js/ecrans.js');
ok(/gardes\s*=\s*\[[^\]]*'bouton-generer'/.test(ecrans),
  '⛔ « Générer les poules » n’est pas enfermé dans le dépliant d’options : la barre le porte');
ok(/gardes\s*=\s*\[[^\]]*'message-generation'/.test(ecrans),
  'son message d’erreur reste visible avec lui');
ok(/cv-demo-pied/.test(ecrans) && /bouton-simuler-scores-matin/.test(ecrans),
  'le bouton de démonstration descend dans un pied d’écran');
ok(/data-cv-matchs/.test(ecrans) && /data-cv-publication/.test(ecrans),
  'les deux raccourcis de l’après-midi sont traités par le routeur d’écrans');
ok(/rafraichirPlanning/.test(ecrans),
  'le raccourci repeint le planning plutôt que de laisser l’écran sur sa vue précédente');

console.log('OK — ' + controles + ' contrôles des écrans Poules & planning et Après-midi.');
