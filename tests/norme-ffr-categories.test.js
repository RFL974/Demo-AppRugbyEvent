#!/usr/bin/env node
/**
 * Non-régression ciblée — bouton « Appliquer la norme FFR » des cartes Catégories.
 * Charge le module frontend réel. Référentiel, DOM et appels réseau sont simulés ; aucune donnée
 * métier n'est lue ni écrite. Le cas U10 contient volontairement l'ancienne ligne 5x5 / 5–9.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let controles = 0;
function ok(v, m) { controles++; if (!v) throw new Error('ÉCHEC ' + controles + ' — ' + m); }
function egal(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' — reçu ' + JSON.stringify(a)); }

const racine = path.join(__dirname, '..');
let posts = 0;
const ctx = vm.createContext({
  console,
  afficherMessage(zone, texte, type) { zone.textContent = texte; zone.type = type; },
  ecrireAdmin() { posts++; throw new Error('POST interdit'); },
  apiPost() { posts++; throw new Error('POST interdit'); },
  apiPostProtege() { posts++; throw new Error('POST interdit'); },
  majAlerteTempsCategorie() {},
  echapper(v) { return String(v); },
  window: { CSS: { escape: v => v } },
  document: { querySelectorAll() { return []; }, querySelector() { return null; }, getElementById() { return null; } }
});
vm.runInContext(fs.readFileSync(path.join(racine, 'js/admin-conformite-ffr.js'), 'utf8'), ctx,
  { filename: 'js/admin-conformite-ffr.js' });
ctx.majAlerteTempsCategorie = function () {};

ctx.refFFRCache = {
  regles: [
    { categorie: 'M10', forme_jeu: 'JCO', effectif: '5x5', effectif_terrain: '5',
      effectif_max_feuille: '9', joint_refffr_formes: 'OUI' },
    { categorie: 'M10', forme_jeu: 'RE', effectif: '7x7', effectif_terrain: '7',
      effectif_max_feuille: '13', joint_refffr_formes: 'OUI' },
    { categorie: 'M12', forme_jeu: 'RE', effectif: '10x10', effectif_terrain: '10',
      effectif_max_feuille: '20', joint_refffr_formes: 'OUI' }
  ],
  temps: [
    { categorie: 'M10', effectif: '5x5', nb_demi_journees: '2', nb_equipes: '6',
      nb_periodes: '2', duree_periode_min: '7', pause_periodes_min: '1' },
    { categorie: 'M10', effectif: '7x7', nb_demi_journees: '2', nb_equipes: '6',
      nb_periodes: '2', duree_periode_min: '10', pause_periodes_min: '2' },
    { categorie: 'M12', effectif: '10x10', nb_demi_journees: '2', nb_equipes: '6',
      nb_periodes: '2', duree_periode_min: '11', pause_periodes_min: '2' }
  ]
};
ctx.dernierResConformite = { refDisponible: true, regles: {}, temps: {} };

const nomsNorme = ['format_mi_temps', 'duree_mi_temps_min', 'pause_mi_temps_min',
  'recup_entre_matchs_min', 'effectif_min', 'effectif_max', 'arbitrage_organisation',
  'max_equipes_par_club'];

function formulaire(cat) {
  const champs = { nb_poules: { value: '3' } };
  nomsNorme.forEach(n => { champs[n] = { value: 'ANCIEN-' + n }; });
  champs.forme_jeu = {
    value: '',
    options: [{ value: '' }, { value: 'RE — 7x7' }, { value: 'RE — 10x10' }]
  };
  const message = { textContent: '', type: '' };
  const form = {
    getAttribute(n) { return n === 'data-cat' ? cat : ''; },
    querySelector(sel) {
      if (sel === '.message-cat') return message;
      const m = sel.match(/^\[name="(.+)"\]$/);
      return m ? (champs[m[1]] || null) : null;
    }
  };
  const bouton = {
    getAttribute(n) { return n === 'data-variante' ? '' : (n === 'data-cat' ? 'U12' : ''); },
    closest(sel) { return sel === 'form.form-categorie' ? form : (sel === '.ffr-appliquer' ? bouton : null); }
  };
  return { champs, message, form, bouton };
}

function cliquer(b) { ctx.onClicAppliquerNormeFFRCarte({ target: b.bouton }); }
function valeurs(b) {
  const out = {};
  ['forme_jeu'].concat(nomsNorme).forEach(n => { out[n] = b.champs[n].value; });
  return out;
}

const attenduU10 = {
  forme_jeu: 'RE — 7x7', format_mi_temps: '2', duree_mi_temps_min: '10',
  pause_mi_temps_min: '2', recup_entre_matchs_min: '15', effectif_min: '7', effectif_max: '13',
  arbitrage_organisation: 'Éducateurs', max_equipes_par_club: '2'
};
const attenduU12 = {
  forme_jeu: 'RE — 10x10', format_mi_temps: '2', duree_mi_temps_min: '11',
  pause_mi_temps_min: '2', recup_entre_matchs_min: '15', effectif_min: '10', effectif_max: '20',
  arbitrage_organisation: 'Éducateurs', max_equipes_par_club: '2'
};

const u10 = formulaire('U10'); cliquer(u10);
egal(valeurs(u10), attenduU10, 'U10 remplit exactement tous les champs réglementaires');
egal(u10.champs.nb_poules.value, '3', 'U10 ne touche pas au nombre de poules');
ok(u10.message.textContent.includes('Rien n’est enregistré') && u10.message.textContent.includes('Enregistrer'),
  'U10 rappelle que la sauvegarde reste explicite');
ok(!Object.values(valeurs(u10)).includes('5x5'), 'U10 ne produit jamais 5x5');
ok(u10.champs.effectif_min.value !== '5' && u10.champs.effectif_max.value !== '9', 'U10 ne produit jamais 5–9');

const u12 = formulaire('U12'); cliquer(u12);
egal(valeurs(u12), attenduU12, 'U12 remplit exactement tous les champs réglementaires');
ok(u10.champs.duree_mi_temps_min.value !== u12.champs.duree_mi_temps_min.value,
  'les durées diffèrent réellement selon la catégorie');
ok(u10.champs.effectif_min.value !== u12.champs.effectif_min.value &&
   u10.champs.effectif_max.value !== u12.champs.effectif_max.value,
  'les effectifs diffèrent réellement selon la catégorie');
for (const b of [u10, u12]) {
  egal(b.champs.recup_entre_matchs_min.value, '15', 'défaut récupération 15 minutes');
  egal(b.champs.arbitrage_organisation.value, 'Éducateurs', 'défaut arbitrage Éducateurs');
  egal(b.champs.max_equipes_par_club.value, '2', 'défaut maximum 2 équipes');
}
egal(posts, 0, 'aucun POST ni enregistrement pour U10/U12');

// La catégorie courante vient du formulaire, pas de l'ancien data-cat volontairement faux du bouton.
egal(u10.champs.forme_jeu.value, 'RE — 7x7', 'la carte U10 gagne contre le data-cat U12 du bouton');

// Référence inconnue/incomplète : aucun des champs ne bouge, message compréhensible.
ctx.dernierResConformite = {
  refDisponible: true,
  regles: { U99: [{ forme_jeu: 'RE', effectif: '8x8', effectif_terrain: '8', effectif_max_feuille: '14' }] },
  temps: {}
};
const inconnu = formulaire('U99');
const avant = valeurs(inconnu); cliquer(inconnu);
egal(valeurs(inconnu), avant, 'référence incomplète : aucun remplissage partiel');
ok(inconnu.message.textContent.includes('Aucune grille de temps FFR complète'), 'message actionnable pour référence incomplète');
egal(posts, 0, 'référence inconnue : toujours aucun POST');

console.log('OK — ' + controles + ' contrôles passés (module réel, référentiel et DOM simulés).');
