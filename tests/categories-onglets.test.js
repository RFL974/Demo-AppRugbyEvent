#!/usr/bin/env node
/**
 * Non-régression — écran « Catégories » en onglets.
 *
 *  1) Rendu (admin-reglages.js sur les modules réels) : un onglet par catégorie plus l'onglet de
 *     création, un panneau par onglet, les paramètres rangés en sections, le format d'après-midi
 *     en liste déroulante, et la carte « Référence FFR » à côté de chaque formulaire.
 *  2) Mémoire de l'onglet ouvert : un rendu transitoire sans catégorie ne la fait pas perdre.
 *  3) Référence FFR (admin-conformite-ffr.js) : les lignes naissent des valeurs RÉELLEMENT
 *     publiées par le référentiel — jamais d'un défaut, jamais d'une valeur inventée.
 *
 *  DOM, référentiel et réseau simulés ; aucune donnée métier lue ni écrite.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let controles = 0;
function ok(v, m) { controles++; if (!v) throw new Error('ÉCHEC ' + controles + ' — ' + m); }
function egal(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' — reçu ' + JSON.stringify(a)); }

const racine = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');

/* ------------------------------------------------------------------ 1) rendu */
const ctx = vm.createContext({
  console, window: {}, navigator: {}, localStorage: { getItem: () => null, setItem() {} },
  location: { href: '', hostname: '127.0.0.1', protocol: 'http:' },
  setInterval() {}, setTimeout() {},
  document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null }
});
['js/commun.js', 'js/admin.js', 'js/admin-reglages.js'].forEach(function (f) {
  vm.runInContext(lire(f), ctx, { filename: f });
});

ctx.cats = [
  { categorie: 'U10', effectif_min: '7', effectif_max: '13', duree_mi_temps_min: '10',
    format_mi_temps: '2', format_apresmidi: 'CROISE_DIAGONAL', terrains: '1,2', terrains_auto: 'non' },
  { categorie: 'U12', format_apresmidi: 'CROISE' }
];
const html = vm.runInContext('afficherCategories(cats)', ctx);

// Un onglet par catégorie + l'onglet de création, et un seul onglet actif.
ok(/data-cat-onglet="U10"/.test(html) && /data-cat-onglet="U12"/.test(html), 'un onglet par catégorie');
ok(/cv-cat-onglet-ajout[^>]*data-cat-onglet=""/.test(html), 'un onglet « Ajouter une catégorie »');
ok(html.includes('Ajouter une catégorie'), 'l’onglet de création porte son libellé');
egal((html.match(/aria-selected="true"/g) || []).length, 1, 'un seul onglet sélectionné');
ok(/data-cat-onglet="U10"[^>]*aria-selected="true"/.test(html), 'la première catégorie est ouverte');

// Un panneau par onglet ; seul celui de l'onglet ouvert est visible.
egal((html.match(/class="cv-cat-panneau"/g) || []).length, 3, 'trois panneaux (U10, U12, création)');
egal((html.match(/data-cat-panneau="U12" hidden/g) || []).length, 1, 'le panneau non ouvert est masqué');
ok(!/data-cat-panneau="U10" hidden/.test(html), 'le panneau ouvert n’est pas masqué');

// Les paramètres, rangés en sections.
['Temps de jeu', 'Effectifs', 'Organisation', 'Format après-midi'].forEach(function (titre) {
  ok(html.includes('<h4>' + titre + '</h4>'), 'section « ' + titre + ' »');
});
ok(html.includes('Paramètres de la catégorie U10'), 'la carte nomme sa catégorie');

// Le format d'après-midi est une liste déroulante (et plus des cartes-radio).
ok(/<select class="r-input" name="format_apresmidi">/.test(html), 'format d’après-midi en liste déroulante');
ok(!/type="radio" name="format_apresmidi"/.test(html), 'plus aucun bouton radio de format');
ok(/<option value="CROISE_DIAGONAL" selected>/.test(html), 'le format enregistré est présélectionné');
const formats = vm.runInContext('FORMATS_APRESMIDI.map(function (f) { return f.cle; })', ctx);
formats.forEach(function (cle) {
  ok(html.includes('<option value="' + cle + '"'), 'le format ' + cle + ' reste proposé');
  ok(html.includes('format-desc d-' + cle), 'l’explication du format ' + cle + ' reste disponible');
});

// Les champs et repères que le reste de l'application lit doivent survivre au remaniement.
vm.runInContext('CHAMPS_CATEGORIE', ctx).forEach(function (champ) {
  ok(html.includes('name="' + champ.cle + '"'), 'champ conservé : ' + champ.cle);
});
['terrains', 'terrains_auto', 'nbQualifiesCoupe'].forEach(function (nom) {
  ok(html.includes('name="' + nom + '"'), 'champ conservé : ' + nom);
});
ok(html.includes('id="form-ajout-categorie"'), 'le formulaire de création garde son identifiant');
// afficherMessage réécrit className : le repère du message de carte doit être un data-role.
ok(/data-role="msg-cat"/.test(html), 'le message de carte a un repère qui survit à afficherMessage');

// La carte « Référence FFR », à côté de chaque formulaire, avec ses points d'accroche.
egal((html.match(/class="carte cv-cat-carte cv-cat-reference"/g) || []).length, 2, 'une carte de référence par catégorie');
ok(html.includes('Référence FFR'), 'la carte de référence porte son titre');
ok(html.includes('(à titre indicatif)'), 'la carte de référence annonce sa portée');
ok(html.includes('Vérifiez avant d’enregistrer'), 'l’avertissement accompagne les valeurs FFR');
['cv-cat-reference-table', 'ffr-forme', 'ffr-appliquer-carte'].forEach(function (c) {
  ok(html.includes('class="' + c + '" data-cat="U10"'), 'accroche ' + c + ' branchée sur la catégorie');
});
// Le select de la forme de jeu retenue est LU par form.forme_jeu : il reste dans le formulaire.
const formU10 = html.slice(html.indexOf('data-cat="U10"'), html.indexOf('class="carte cv-cat-carte cv-cat-reference"'));
ok(formU10.includes('ffr-forme-choix'), 'la forme de jeu retenue reste dans le formulaire');

/* --------------------------------------------- 2) mémoire de l'onglet ouvert */
vm.runInContext('activerOngletCategorie("U12")', ctx); // pas de DOM : seule la mémoire change
egal(vm.runInContext('choisirOngletCategorie(["U10","U12"])', ctx), 'U12', 'l’onglet ouvert est mémorisé');
egal(vm.runInContext('choisirOngletCategorie([])', ctx), '',
  'un rendu transitoire sans catégorie montre l’onglet de création');
egal(vm.runInContext('choisirOngletCategorie(["U10","U12"])', ctx), 'U12',
  'et ne fait PAS oublier la catégorie ouverte');
egal(vm.runInContext('choisirOngletCategorie(["U10"])', ctx), 'U10',
  'catégorie supprimée : on retombe sur la première');

/* ------------------------------------------------------- 3) référence FFR */
const ffr = vm.createContext({
  console, echapper: (v) => String(v), window: { CSS: { escape: (v) => v } },
  document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null }
});
vm.runInContext(lire('js/admin-conformite-ffr.js'), ffr, { filename: 'js/admin-conformite-ffr.js' });
ffr.refFFRCache = {
  regles: [{ categorie: 'M10', forme_jeu: 'RE', effectif: '7x7', joint_refffr_formes: 'OUI',
    effectif_terrain: '7', effectif_max_feuille: '13', terrain_longueur_m: '40',
    terrain_largeur_m: '30', ballon: 'T3', carton_jaune_min: '2', tir_au_but: false }],
  temps: []
};
const regle = ffr.regleReferenceFFRCarte('U10');
ok(regle && regle.effectif_terrain === '7', 'la règle FFR de la catégorie est retrouvée');
egal(ffr.lignesReferenceFFRCarte(regle), [
  ['Dimension terrain', '40 × 30 m'], ['Ballon', 'T3'], ['Effectif sur le terrain', '7'],
  ['Effectif max sur la feuille', '13'], ['Carton jaune', '2 min']
], 'les lignes reprennent exactement les valeurs publiées');
ok(!JSON.stringify(ffr.lignesReferenceFFRCarte(regle)).includes('Tir au but'),
  'tir_au_but non explicitement autorisé ⇒ ligne absente (on n’affirme pas une interdiction)');
ok(JSON.stringify(ffr.lignesReferenceFFRCarte(Object.assign({}, regle, { tir_au_but: true })))
  .includes('Tir au but'), 'tir_au_but autorisé ⇒ la ligne apparaît');
egal(ffr.lignesReferenceFFRCarte({ terrain_libelle: 'terrain normal' }),
  [['Dimension terrain', 'terrain normal']], 'sans dimensions chiffrées, le libellé FFR suffit');
egal(ffr.lignesReferenceFFRCarte({}), [], 'aucune valeur publiée ⇒ aucune ligne inventée');

// Ambiguïté non levée : plusieurs formes possibles ⇒ on ne choisit pas à la place de l'organisateur.
ffr.refFFRCache = { regles: [], temps: [] };
ffr.dernierResConformite = { regles: { U16: [{ effectif_terrain: '10' }, { effectif_terrain: '12' }] } };
egal(ffr.regleReferenceFFRCarte('U16'), null, 'plusieurs formes possibles ⇒ aucune référence affichée');
ffr.dernierResConformite = { regles: { U16: [{ effectif_terrain: '10' }] } };
ok(ffr.regleReferenceFFRCarte('U16'), 'une seule forme possible ⇒ la référence est affichée');

console.log(`OK — ${controles} contrôles « Catégories en onglets ».`);
