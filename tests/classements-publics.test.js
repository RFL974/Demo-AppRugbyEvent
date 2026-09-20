#!/usr/bin/env node
/**
 * Non-régression — la vue « Classements » de la page publique, d'après la maquette.
 *
 *  1) Une barre de trois filtres : catégorie, créneau, poule. « Toutes les poules » est la
 *     première option et le choix par défaut — un spectateur qui ne connaît pas sa poule ne
 *     doit pas se retrouver devant un tableau qui n'est pas le sien.
 *  2) Le choix vit dans le MODULE. La page se relit toute seule pendant le tournoi : un état
 *     laissé dans le DOM serait effacé au milieu d'un match, sous les yeux du spectateur.
 *  3) La catégorie n'a PAS de variable propre : c'est `categorieActive`, la même que le filtre
 *     du haut de page et que « Mon équipe », avec la même mémorisation. Deux sources auraient
 *     divergé. Le filtre du haut s'efface sur cet onglet pour ne pas faire doublon.
 *  4) Les derniers scores gardent leur portée TOURNOI ENTIER — toutes catégories, toutes
 *     poules — et passent à DROITE du classement, écrits après lui dans le DOM.
 *  5) Un créneau qui n'existe plus (catégorie sans après-midi) retombe sur le matin.
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

/* Un DOM réduit à ce que la vue touche réellement. */
function faireElement(id) {
  const el = { id: id || '', innerHTML: '', textContent: '', hidden: false, dataset: {},
    value: '', options: [], selectedIndex: 0,
    addEventListener(type, fn) { (this._e = this._e || {})[type] = fn; },
    querySelector: () => null, querySelectorAll: () => [] };
  return el;
}
const elements = {};
function elem(id) { if (!elements[id]) elements[id] = faireElement(id); return elements[id]; }
['vue-classements', 'vue-equipe', 'filtre-categorie', 'select-categorie', 'cv-public-titre'].forEach(elem);

const stockage = {};
const contexte = {
  document: {
    getElementById: (id) => elements[id] || null,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {}, title: ''
  },
  window: { addEventListener() {}, location: { href: 'https://exemple.invalid/tournoi.html' },
            matchMedia: () => ({ matches: false, addEventListener() {} }) },
  localStorage: { getItem: (k) => (k in stockage ? stockage[k] : null),
                  setItem: (k, v) => { stockage[k] = String(v); },
                  removeItem: (k) => { delete stockage[k]; } },
  navigator: { onLine: true },
  echapper: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
  estTermine: (s) => String(s) === 'terminé',
  // Briques de commun.js dont la vue se sert, fournies telles quelles.
  comparerCategorie: (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true }),
  formatApresMidiCat: () => 'CROISE',
  urlPagePublique: () => 'https://exemple.invalid/tournoi.html',
  groupeLabelScf: () => null, phaseLabelScf: () => null, pouleEFG: (p) => p,
  ctxScf: () => ({ estScf: false }), tailleGroupeScf: () => 0,
  sponsorsBrancherMesure() {}, sponsorsEncartFil: () => '',
  setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, fetch: () => Promise.reject(new Error('aucun réseau')),
  console
};
const ctx = vm.createContext(contexte);
vm.runInContext(lire('js/tournoi.js'), ctx, { filename: 'js/tournoi.js' });

/* Un tournoi minimal : deux catégories, deux poules chacune, un après-midi pour U10 seulement. */
vm.runInContext(`
  equipes = [
    {id_equipe:'a1', nom_equipe:'CLAMART', categorie:'U10', poule:'A'},
    {id_equipe:'a2', nom_equipe:'VÉLIZY',  categorie:'U10', poule:'A'},
    {id_equipe:'b1', nom_equipe:'RUEIL',   categorie:'U10', poule:'B'},
    {id_equipe:'b2', nom_equipe:'ANTONY',  categorie:'U10', poule:'B'},
    {id_equipe:'c1', nom_equipe:'MEUDON',  categorie:'U12', poule:'A'},
    {id_equipe:'c2', nom_equipe:'SÈVRES',  categorie:'U12', poule:'A'}
  ];
  matchs = [
    {id_match:'m1', categorie:'U10', poule:'A', phase:'poule', equipe_A:'a1', equipe_B:'a2',
     statut:'terminé', score_A:12, score_B:7, heure_fin:'10:22'},
    {id_match:'m2', categorie:'U10', poule:'B', phase:'poule', equipe_A:'b1', equipe_B:'b2',
     statut:'à venir', score_A:'', score_B:''},
    {id_match:'m3', categorie:'U12', poule:'A', phase:'poule', equipe_A:'c1', equipe_B:'c2',
     statut:'terminé', score_A:5, score_B:5, heure_fin:'10:25'},
    {id_match:'m4', categorie:'U10', poule:'N1', phase:'classement', equipe_A:'a1', equipe_B:'b1',
     statut:'à venir', score_A:'', score_B:''}
  ];
  config = { global:{}, categories:[{categorie:'U10',presente:'oui'},{categorie:'U12',presente:'oui'}] };
  categorieActive = 'U10';
  // La table des noms est normalement remplie au chargement des données : on la pose ici.
  nomParEquipe = {}; equipes.forEach(function (e) { nomParEquipe[e.id_equipe] = e.nom_equipe; });
`, ctx);

const zone = elements['vue-classements'];
const rendre = () => vm.runInContext('afficherClassements()', ctx);

/* --------------------------------------------------- 1) la barre de filtres */
rendre();
ok(/id="cv-pub-categorie"/.test(zone.innerHTML) && /id="cv-pub-creneau"/.test(zone.innerHTML) &&
   /id="cv-pub-poule"/.test(zone.innerHTML), 'la barre porte les trois filtres');
ok(/Catégorie/.test(zone.innerHTML) && /Créneau/.test(zone.innerHTML) && /Poule/.test(zone.innerHTML),
  'chaque liste dit ce qu’elle filtre');
const posToutes = zone.innerHTML.indexOf('Toutes les poules');
const posPouleA = zone.innerHTML.indexOf('>Poule A<');
ok(posToutes >= 0 && posToutes < posPouleA,
  '⛔ « Toutes les poules » est la PREMIÈRE option — pas un repli caché en fin de liste');
ok(/value=""\s+selected>Toutes les poules/.test(zone.innerHTML),
  'et le choix par défaut : la vue d’ensemble reste la page d’arrivée');
ok(zone.innerHTML.indexOf('Poule A') >= 0 && zone.innerHTML.indexOf('Poule B') >= 0,
  'sans filtre, toutes les poules de la catégorie sont affichées');

/* --------------------------------------------------- 2) l'état vit dans le module */
vm.runInContext('pubPoule = "Poule B"', ctx);
rendre();
ok(/value="Poule B" selected/.test(zone.innerHTML), 'le choix mémorisé est reproduit par le rendu');
ok(zone.innerHTML.indexOf('>Poule B</div>') >= 0 && !/live-poule">Poule A</.test(zone.innerHTML),
  'et il isole la poule choisie');
rendre();  // un rafraîchissement automatique de plus
ok(vm.runInContext('pubPoule', ctx) === 'Poule B',
  '⛔ un repeint n’efface pas le choix : la page se relit toute seule pendant le tournoi');

/* --------------------------------------------------- 3) une seule source pour la catégorie */
const src = lire('js/tournoi.js');
ok(!/let\s+pubCategorie|var\s+pubCategorie/.test(src),
  '⛔ aucune variable de catégorie propre à la vue : c’est `categorieActive` qui fait foi');
ok(/categorieActive = cible\.value/.test(src) && /localStorage\.setItem\(CLE_CATEGORIE/.test(src),
  'changer la catégorie dans la barre écrit la variable partagée et sa mémorisation');
ok(/getElementById\('select-categorie'\)[\s\S]{0,80}\.value = categorieActive/.test(src),
  'et remet le filtre du haut de page en accord');
ok(/filtreCat\.hidden = \(cible === 'classements'\) \|\| categoriesPresentes\(\)\.length <= 1/.test(src),
  '⛔ le filtre du haut s’efface sur cet onglet (doublon) et reste sur « Mon équipe »');

/* --------------------------------------------------- 4) les derniers scores */
vm.runInContext('pubPoule = ""', ctx);
rendre();
const posPrincipal = zone.innerHTML.indexOf('cv-pub-principal');
const posDerniers = zone.innerHTML.indexOf('cv-pub-derniers');
ok(posPrincipal >= 0 && posDerniers > posPrincipal,
  '⛔ les derniers scores sont ÉCRITS après le classement : l’ordre de lecture suit le DOM');
ok(/<aside class="cv-pub-derniers">/.test(zone.innerHTML), 'et ils forment une carte à part');
ok(zone.innerHTML.indexOf('SÈVRES') >= 0,
  '⛔ leur portée reste le TOURNOI ENTIER : un score U12 s’y affiche alors que U10 est filtré');
vm.runInContext('pubPoule = "Poule A"', ctx);
rendre();
ok(zone.innerHTML.indexOf('SÈVRES') >= 0,
  '⛔ et filtrer une poule ne les réduit pas non plus');
ok(!/id="cv-pub-derniers-poule"|cv-pub-derniers[\s\S]{0,400}<select/.test(zone.innerHTML),
  'la carte n’a pas de sélecteur propre : elle montre tout le tournoi');

/* --------------------------------------------------- 5) les créneaux */
vm.runInContext('pubPoule = ""', ctx);
rendre();
ok(/value="aprem"/.test(zone.innerHTML), 'U10 a un après-midi : le créneau est proposé');
vm.runInContext('pubCreneau = "aprem"; categorieActive = "U12"', ctx);
rendre();
ok(vm.runInContext('pubCreneau', ctx) === 'matin',
  '⛔ une catégorie sans après-midi fait retomber le créneau sur le matin plutôt que d’afficher le vide');
ok(!/value="aprem"/.test(zone.innerHTML), 'et le créneau absent n’est pas proposé');
vm.runInContext('categorieActive = "U10"', ctx);
rendre();
// Le panneau principal seul : les derniers scores couvrent volontairement tout le tournoi.
const principalSeul = () => zone.innerHTML.slice(0, zone.innerHTML.indexOf('cv-pub-derniers'));
ok(principalSeul().indexOf('MEUDON') < 0 && principalSeul().indexOf('CLAMART') >= 0,
  'le classement, lui, ne montre que la catégorie choisie');

/* --------------------------------------------------- 6) la largeur des tableaux */
const css = lire('css/tournoi-public.css');
ok(/\.cv-pub-colonnes \{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(280px,340px\)/.test(css),
  'le classement occupe la colonne large, les derniers scores la colonne de droite');
ok(/\.cv-pub-principal \.cv-classements-grid \{ grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,540px\),1fr\)\)/.test(css),
  '⛔ une piste de 540px : mesuré, le tableau complet en réclame 516, et deux poules côte à ' +
  'côte dans la colonne réduite coupaient la colonne « Pts »');
ok(/@media \(max-width:900px\)[\s\S]{0,200}\.cv-pub-colonnes \{ grid-template-columns:1fr/.test(css),
  'sous 900px, les derniers scores passent sous le classement');

console.log('OK — ' + controles + ' contrôles des classements publics.');
