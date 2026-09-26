#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
const { planTerrainsPourDossier, synchroniserPlanTerrainsDossier } = require('../js/admin-terrains-pdf.js');
const { lirePlanTerrainsDossier, htmlPlansTerrainsDossier } = require('../js/terrains-dossier.js');

let controles = 0;
function vrai(v, m) { assert.ok(v, m); controles++; }

const planEditeur = {
  fieldsPlan: [{
    code: 'RUG1', mode: 'solo',
    field: { nom: 'Rugby 1', code: 'RUG1', type: 'rugby', nature: 'Gazon',
      L: 115, W: 70, x: 12, y: 18, rot: 12 },
    zones: [{ cat: 'U10', color: '#1676d2', tiles: [
      { id: 'RUG1-1', x: 3, y: 4, w: 40, h: 30, eb: 5, ebAxe: 'x' },
      { id: 'RUG1-2', x: 49, y: 4, w: 40, h: 30, eb: 5, ebAxe: 'x' }
    ] }],
    table: { x: 45, y: 37, w: 2, h: 1 },
    poignées: 'ne doit pas sortir'
  }, {
    code: 'FOO1', field: { nom: 'Foot 1', code: 'FOO1', type: 'football', nature: 'Synthétique',
      L: 105, W: 68, x: 145, y: 33, rot: 0 },
    zones: [{ cat: 'U12', color: '#15865d', tiles: [
      { id: 'FOO1-1', x: 5, y: 7, w: 56, h: 40, eb: 0, ebAxe: '' }
    ] }], table: null
  }, {
    code: 'FOO2', field: { nom: 'Foot 2', code: 'FOO2', type: 'football', nature: 'Gazon',
      L: 100, W: 65, x: 260, y: 170, rot: 0 }, zones: [], table: null
  }],
  ctxManuel: { m: 3, tmL: 2, tmW: 1, cats: ['état éditeur'] },
  misDeCote: [{ cat: 'U14' }], tablesPosees: true
};

const publie = planTerrainsPourDossier(planEditeur);
vrai(publie && publie.version === 1 && publie.fields.length === 3,
  'la projection conserve aussi les grands terrains sans mini-terrain');
vrai(publie.fields[0].field.x === 12 && publie.fields[0].field.y === 18 && publie.fields[0].field.rot === 12,
  'la vue globale conserve position et rotation');
vrai(publie.fields[0].zones[0].tiles[0].eb === 5 && !('table' in publie.fields[0]),
  'le grand plan conserve mini-terrains et en-buts sans exposer la table de marque');
vrai(!('misDeCote' in publie) && !('ctxManuel' in publie) && !('poignées' in publie.fields[0]),
  'aucun état interne de l’éditeur ne sort dans le dossier');

const synchronise = synchroniserPlanTerrainsDossier(JSON.stringify(publie), [
  { nom: 'Rugby 1', code: 'RUG1', type: 'rugby', nature: 'Gazon', L: 115, W: 70, x: 44, y: 51, rot: 97 },
  { nom: 'Foot 1', code: 'FOO1', type: 'football', nature: 'Synthétique', L: 105, W: 68, x: 180, y: 80, rot: 15 }
], { couloir: 4, tmL: 3, tmW: 2 });
vrai(synchronise.fields.length === 2 && synchronise.fields[0].field.x === 44 &&
  synchronise.fields[0].field.y === 51 && synchronise.fields[0].field.rot === 97,
  'enregistrer les grands terrains réaligne position, orientation, ajout et retrait dans le dossier');
vrai(synchronise.fields[0].zones[0].tiles[0].id === 'RUG1-1' &&
  synchronise.fields[0].zones[0].tiles[0].w === 40 && synchronise.fields[0].zones[0].tiles[0].h === 30,
  'la synchronisation conserve les mini-terrains dans le repère local de leur grand terrain');
vrai(synchronise.couloir === 4 && synchronise.tableL === 3 && synchronise.tableW === 2,
  'le plan partagé conserve aussi les réglages nécessaires à sa restauration dans Terrains');
vrai(synchroniserPlanTerrainsDossier('', [{ nom: 'Rugby 1', code: 'RUG1', L: 115, W: 70 }], {}) === null,
  'enregistrer les grands terrains ne publie pas de plan vide avant la première répartition appliquée');

const relu = lirePlanTerrainsDossier(JSON.stringify(publie));
vrai(relu && relu.fields.length === 3 && relu.fields[2].field.nom === 'Foot 2',
  'le dossier relit la projection enregistrée');
const ancienSansReglages = lirePlanTerrainsDossier(JSON.stringify({ version: 1, fields: publie.fields }));
vrai(ancienSansReglages.couloir === null && ancienSansReglages.tableL === null && ancienSansReglages.tableW === null,
  'un ancien instantané sans réglages reste identifiable afin que Terrains reprenne les valeurs courantes');
vrai(lirePlanTerrainsDossier('') === null && lirePlanTerrainsDossier('{') === null,
  'une donnée absente ou illisible ne fabrique aucun terrain par défaut');

const apresReset = JSON.parse(JSON.stringify(publie));
apresReset.fields.forEach(function (fp) { fp.zones = []; });
const reluApresReset = lirePlanTerrainsDossier(JSON.stringify(apresReset));
const htmlApresReset = htmlPlansTerrainsDossier(JSON.stringify(apresReset));
vrai(reluApresReset.fields[0].field.x === 12 && reluApresReset.fields[0].field.y === 18 &&
  reluApresReset.fields[0].field.rot === 12 && reluApresReset.fields.every(function (fp) { return fp.zones.length === 0; }),
  'après reset, le dossier conserve x/y/orientation des grands terrains et aucune zone');
vrai(!/RUG1-1|RUG1-2|FOO1-1|U10|U12/.test(htmlApresReset) &&
  htmlApresReset.includes('Aucun mini-terrain affecté') && htmlApresReset.includes('Disponible'),
  'après reset, aucun ancien petit terrain ni affectation ne réapparaît dans le dossier ou son PDF imprimé');

const html = htmlPlansTerrainsDossier(JSON.stringify(publie));
vrai(html.includes('Vue globale des terrains') && html.includes('data-plan-index="0"') && html.includes('data-plan-index="2"'),
  'la vue globale rend chaque grand terrain cliquable');
vrai(html.includes('data-plan-vue="detail"') && html.includes('data-plan-retour') && html.includes('RUG1-1'),
  'le clic remplace la vue globale par le grand plan détaillé et permet le retour');
vrai(!html.includes('Table de marque') && !html.includes('>TM<'),
  'aucune table de marque ne sort dans la vue club ni dans le PDF');
vrai(html.includes('115 × 70 m') && html.includes('40 × 30 m') && html.includes('preserveAspectRatio="xMidYMid meet"'),
  'les proportions physiques et les dimensions des mini-terrains restent explicites');
vrai(html.includes('class="d-plan-orientation"') && html.includes('rotate(12)') && html.includes('Orientation 12°'),
  'le grand plan détaillé et ses mini-terrains gardent l’orientation exacte de l’onglet Terrains');
vrai(!htmlPlansTerrainsDossier(''), 'aucune section visuelle sans placement enregistré');

const dossier = lire('js/dossier.js');
const adminTerrains = lire('js/admin-terrains.js');
const email = lire('js/admin-invitations.js');
const css = lire('css/dossier.css');
const page = lire('dossier-club.html');
const admin = lire('admin.html');
vrai(dossier.includes("sectionPlansTerrains(g)") && dossier.includes('brancherPlansTerrainsDossier(zone)'),
  'le dossier insère puis branche la vue globale');
vrai(adminTerrains.includes('plan_terrains_visuel: planDossierJson') &&
  (adminTerrains.match(/plan_terrains_visuel: planDossierJson/g) || []).length >= 2,
  'le même clic Appliquer enregistre composition et géométrie, y compris au repli explicite');
vrai(adminTerrains.includes('synchroniserPlanTerrainsDossier') &&
  /data\.plan_terrains_visuel\s*=\s*JSON\.stringify\(planDossier\)/.test(adminTerrains),
  'Enregistrer les terrains met à jour le même plan de dossier, sans requête supplémentaire');
vrai(adminTerrains.includes('restaurerRepartitionEnregistree();') &&
  adminTerrains.includes('Répartition enregistrée restaurée.') &&
  adminTerrains.includes('plan_terrains_visuel: planDossierJson'),
  'la répartition appliquée est enregistrée puis restaurée dans l’onglet Terrains');
vrai(email.includes('grands plans cotés') && email.includes('export PDF'),
  'l’e-mail annonce précisément où trouver les grands plans');
vrai(css.includes('.d-plan-site-terrain') && css.includes('.d-plan-vue-detail') &&
  /@media print[\s\S]*\.d-plans-impression[\s\S]*display:\s*block\s*!important/.test(css),
  'l’écran est interactif et le PDF développe chaque grand plan sans clic');
vrai(page.includes('js/terrains-dossier.js?v=') && admin.includes('js/terrains-dossier.js?v='),
  'le rendu partagé est chargé dans le dossier et dans l’aperçu e-mail admin');

console.log('OK — ' + controles + ' contrôles des plans de terrains du dossier final.');
