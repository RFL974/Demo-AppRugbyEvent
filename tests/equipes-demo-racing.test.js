#!/usr/bin/env node
'use strict';

/* ============================================================================
 *  ÉCRAN « ÉQUIPES » ET JEU DE DÉMONSTRATION (lot « Inviter un club », 21 septembre 2026)
 * ============================================================================
 *  Le jeu de démonstration a quitté l'écran « Équipes » : il se crée depuis « Inviter un club » (onglet « Clubs
 *  invités ») et le serveur en est la seule source (JEU_DEMO_RACING). Ce que ce fichier garde :
 *    · l'écran « Équipes » n'a plus AUCUNE implémentation du jeu (ni données, ni appel serveur) ;
 *    · l'ancien nom `onAjouterEquipesDemo` (qu'un admin.js resté en cache branche encore) DÉLÈGUE au nouveau bouton,
 *      ou le dit quand la page est incomplète — sans rien envoyer ;
 *    · `appliquerEquipesRelues` applique la liste relue par le serveur comme une lecture ciblée réussie (même registre
 *      de fraîcheur), sans refermer une édition en cours.
 *  Le parcours complet (vrais modules contre le vrai Code.gs) : tests/ecran-invitation-surface.test.js.
 * ============================================================================ */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function egal(recu, attendu, message) { assert.deepStrictEqual(recu, attendu, message); controles++; }
function vrai(valeur, message) { assert.ok(valeur, message); controles++; }

const src = lire('js/admin-equipes.js');
const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
vrai(!/ecrireAdmin\('(chargerClubsDemoRacing|creerJeuDemoRacing)'/.test(src), 'l’écran Équipes n’appelle plus le serveur pour la démonstration');
vrai(!/EQUIPES_DEMO_RACING|preparerAjoutEquipesDemo|CLAMART-2|VERSAILLES/.test(sansCommentaires), 'aucune donnée du jeu dans l’écran Équipes');

const html = lire('admin.html');
const blocEquipes = html.slice(html.indexOf('id="bloc-equipes"'), html.indexOf('</section>', html.indexOf('id="bloc-equipes"')));
const blocClubs = html.slice(html.indexOf('id="bloc-clubs-invites"'), html.indexOf('</section>', html.indexOf('id="bloc-clubs-invites"')));
vrai(blocEquipes.indexOf('bouton-charger-equipes-demo') === -1 && blocClubs.indexOf('id="bouton-charger-equipes-demo"') !== -1,
  'le bouton du jeu est dans « Clubs invités », plus dans « Équipes »');
vrai(blocClubs.indexOf('Démo — Créer le jeu de démonstration') !== -1 && html.indexOf('Préparer le suivi des équipes présentes') === -1,
  'le libellé annonce la création du jeu, l’ancien libellé a disparu');

const elements = {
  'bouton-ajouter': { disabled: false },
  'message-equipe': { textContent: '', type: '' },
  'message-jeu-demo': { textContent: '', type: '' },
  'reprise-equipes': { hidden: true },
  'liste-equipes': { innerHTML: '' }
};
let editionOuverte = null;
let rendus = 0, tableaux = 0, etatsClubs = 0;
const contexte = vm.createContext({
  console,
  document: {
    getElementById(id) { return elements[id] || null; },
    querySelector(sel) { return sel === '#liste-equipes .equipe-item.en-edition' ? editionOuverte : null; }
  },
  configCourante: { categories: [{ categorie: 'U10', presente: 'oui' }] },
  equipesCourantes: [],
  estPresente: () => true,
  echapper: v => String(v == null ? '' : v),
  svgIcone: () => '',
  afficherMessage: (zone, texte, type) => { zone.textContent = texte; zone.type = type; },
  majTableauBord() { tableaux++; },
  actualiserEtatClubsDepuisEquipes() { etatsClubs++; }
});
vm.runInContext(src, contexte, { filename: 'js/admin-equipes.js' });
contexte.afficherEquipes = function () { rendus++; };
vm.runInContext('afficherEquipes = globalThis.afficherEquipes;', contexte);

(async function () {
  // Délégation : l'ancien nom déclenche le nouveau bouton, rien d'autre.
  let delegations = 0;
  contexte.onCreerJeuDemo = async () => { delegations++; return 'nouveau'; };
  egal(await contexte.onAjouterEquipesDemo(), 'nouveau', 'l’ancien nom délègue au bouton de « Inviter un club »');
  egal(delegations, 1, 'une seule délégation');
  delete contexte.onCreerJeuDemo;
  vm.runInContext('delete globalThis.onCreerJeuDemo;', contexte);
  await contexte.onAjouterEquipesDemo();
  vrai(elements['message-jeu-demo'].type === 'ko' && /recharge-la/.test(elements['message-jeu-demo'].textContent) &&
    /Rien n’a été envoyé/.test(elements['message-jeu-demo'].textContent), 'page incomplète (cache mêlé) : c’est dit, rien n’est envoyé');

  // Disponibilité : seul le bouton « Ajouter » de l'écran dépend de l'état des équipes.
  contexte.majDisponibiliteAjout();
  egal(elements['bouton-ajouter'].disabled, false, 'le bouton Ajouter reste gouverné par l’écran');

  // Liste relue par le serveur : appliquée comme une lecture ciblée réussie.
  const jetonAvant = vm.runInContext('lectureEquipesJeton', contexte);
  const liste = [{ id_equipe: 'E01', nom_equipe: 'CLAMART-1', categorie: 'U10', nb_joueurs: '10', nb_educateurs: '1', source: 'auto' }];
  vrai(contexte.appliquerEquipesRelues(liste) === true, 'liste relue appliquée et affichée');
  egal(vm.runInContext('lectureEquipesJeton', contexte), jetonAvant + 1, 'un jeton neuf : toute lecture encore en vol sera jetée');
  egal(vm.runInContext('equipesCourantes', contexte), liste, 'la mémoire de l’écran est la liste du serveur');
  vrai(rendus === 1 && tableaux === 1 && etatsClubs === 1, 'liste, tableau de bord et états des clubs repeints une fois');
  editionOuverte = { getAttribute: () => 'E01' };
  vrai(contexte.appliquerEquipesRelues(liste.concat([{ id_equipe: 'E02', nom_equipe: 'MEUDON', categorie: 'U10' }])) === false,
    'une édition ouverte n’est pas refermée : la liste attendra le prochain rendu');
  egal(rendus, 1, 'aucun rendu pendant l’édition');
  egal(vm.runInContext('equipesCourantes.length', contexte), 2, 'la mémoire suit quand même le serveur');
  console.log('OK — ' + controles + ' contrôles passés.');
})().catch(err => { console.error(err); process.exit(1); });
