#!/usr/bin/env node
/**
 * Non-régression — écran « Équipes » en tableau à onglets.
 *
 *  1) Assemblage (ecrans.js) : la barre d'outils naît vide et ses écouteurs sont posés SUR ELLE ;
 *     le formulaire d'ajout est DÉPLACÉ dans un dépliant, pas recréé ; l'écran est repeint tout
 *     de suite après la construction, sinon les onglets resteraient vides.
 *  2) Club déduit du nom (admin-equipes.js) : « CLAMART-1 » → « CLAMART », sans aucune lecture
 *     réseau ; un nom à tirets qui n'est pas un suffixe d'équipe reste entier ; l'orthographe du
 *     club invité fait foi quand la liste est déjà chargée.
 *  3) Onglets, compteurs, filtre par club : cumul des deux filtres, et un rendu transitoire sans
 *     équipe ne fait PAS oublier l'onglet ouvert.
 *  4) Points d'accroche conservés : `.equipe-item[data-id]` (recherche et édition en ligne) et
 *     « Tout supprimer » rendu DANS #liste-equipes, où vit l'écouteur de la liste.
 *
 *  DOM et réseau simulés ; aucune donnée métier lue ni écrite.
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

/* ------------------------------------------------------------- 1) assemblage */
const ecrans = lire('js/ecrans.js');
ok(/function preparerEquipes\(/.test(ecrans), 'ecrans.js prépare l’écran Équipes');
ok(ecrans.includes(' preparerEquipes();'), 'preparerEquipes est appelé à la construction de l’écran');
ok(ecrans.includes("ajout.appendChild(form)"),
  'le formulaire d’ajout est DÉPLACÉ dans le dépliant : ses écouteurs de soumission survivent');
ok(!/id=.form-equipe/.test(ecrans), 'ecrans.js ne recrée jamais le formulaire d’ajout');
ok(ecrans.includes("onglets.addEventListener('click'"),
  'l’écouteur des onglets est posé sur la BARRE, que le rendu ne remplace jamais');
ok(ecrans.includes("if(typeof afficherEquipes==='function'&&typeof equipesCourantes!=='undefined')afficherEquipes(equipesCourantes);"),
  'l’écran est repeint après sa construction : les onglets ne restent pas vides');
ok(ecrans.includes("onglets.setAttribute('role','tablist')"), 'la barre d’onglets s’annonce comme telle');

/* admin.html reste intact : ce sont ses identifiants que le rendu et les écouteurs visent. */
const html = lire('admin.html');
['bloc-equipes', 'form-equipe', 'champ-nom', 'champ-categorie', 'champ-joueurs', 'champ-educateurs',
 'bouton-ajouter', 'liste-equipes', 'message-equipe', 'reprise-equipes', 'aide-categories',
 'chargement-equipes-demo', 'form-perfs-club'
].forEach(function (id) { ok(html.includes('id="' + id + '"'), 'admin.html conserve #' + id); });

/* ------------------------------------------------------------------ 2) et 3) */
const zone = { innerHTML: '' };
const barre = { innerHTML: '' };
const choixClub = { innerHTML: '' };
const elements = { 'liste-equipes': zone, 'cv-equipes-onglets': barre, 'cv-equipes-club': choixClub };
const ctx = vm.createContext({
  console,
  document: { getElementById: (id) => elements[id] || null, querySelector: () => null, querySelectorAll: () => [] },
  echapper: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
  svgIcone: () => '<svg></svg>',
  memeTexteSouple: (a, b) => String(a || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() ===
    String(b || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(),
  setTimeout, clearTimeout
});
vm.runInContext(lire('js/admin-equipes.js'), ctx, { filename: 'js/admin-equipes.js' });
ctx.configCourante = { categories: [{ categorie: 'U10' }, { categorie: 'U12' }] };
vm.runInContext('configCourante = globalThis.configCourante;', ctx);

/* Le club se déduit du NOM, avant toute lecture des clubs invités. */
vm.runInContext('clubsInvitesCourants = [];', ctx);
egal(vm.runInContext('clubDeEquipe("CLAMART-1")', ctx), 'CLAMART', 'le suffixe -1 est retiré');
egal(vm.runInContext('clubDeEquipe("CLAMART-12")', ctx), 'CLAMART', 'le suffixe -12 aussi');
egal(vm.runInContext('clubDeEquipe("ISSY-LES-MOULINEAUX")', ctx), 'ISSY-LES-MOULINEAUX',
  'un nom à tirets sans suffixe numérique reste ENTIER');
egal(vm.runInContext('clubDeEquipe("  antony-2 ")', ctx), 'antony',
  'sans liste chargée, le nom déduit suffit — on n’attend aucune lecture');
egal(vm.runInContext('clubDeEquipe("")', ctx), '', 'un nom vide ne fabrique pas de club');
/* Quand la liste EST déjà chargée, son orthographe fait foi (accents, casse). */
vm.runInContext('clubsInvitesCourants = [{ club_nom: "VÉLIZY" }, { club_nom: "Racing 92" }];', ctx);
egal(vm.runInContext('clubDeEquipe("VELIZY-2")', ctx), 'VÉLIZY',
  'le club invité impose son orthographe quand il est déjà en mémoire');
egal(vm.runInContext('clubDeEquipe("MEUDON-1")', ctx), 'MEUDON',
  'un club absent de la liste garde son nom déduit, sans erreur');

const equipes = [
  { id_equipe: 'E1', nom_equipe: 'VÉLIZY-1', categorie: 'U10', nb_joueurs: '13', nb_educateurs: '2' },
  { id_equipe: 'E2', nom_equipe: 'VÉLIZY-2', categorie: 'U10', nb_joueurs: '', nb_educateurs: '' },
  { id_equipe: 'E3', nom_equipe: 'MEUDON', categorie: 'U12', nb_joueurs: '11', nb_educateurs: '1' }
];
ctx.equipes = equipes;
vm.runInContext('afficherEquipes(equipes)', ctx);

/* Les colonnes de la maquette, et le club déduit affiché dans la sienne. */
['Équipe', 'Club', 'Catégorie', 'Joueurs', 'Éducateurs', 'Action'].forEach(function (c) {
  ok(zone.innerHTML.includes('<span role="columnheader">' + c + '</span>'), 'colonne « ' + c + ' »');
});
ok(zone.innerHTML.includes('data-label="Club" class="cv-table-doux">VÉLIZY<'),
  'le club déduit apparaît dans sa colonne');
ok(zone.innerHTML.includes('data-label="Joueurs" class="cv-table-nombre">13<'),
  'les effectifs déclarés sont dans leur colonne');
ok(zone.innerHTML.includes('data-label="Joueurs" class="cv-table-nombre"><span class="cv-table-vide" title="Non déclaré">—</span>'),
  '⛔ un effectif non déclaré affiche un tiret, jamais un 0 qui affirmerait « aucun joueur »');
/* Points d'accroche des autres modules : la recherche masque des .equipe-item, l'édition en
   ligne les retrouve par data-id, et la suppression lit data-id / data-nom. */
egal((zone.innerHTML.match(/class="equipe-item" role="row" data-id="/g) || []).length, 3,
  'chaque ligne reste un .equipe-item porteur de son data-id');
ok(zone.innerHTML.includes('class="bouton-modif"') && zone.innerHTML.includes('class="bouton-suppr bouton-icone"'),
  'modifier et supprimer restent proposés sur chaque ligne');
ok(zone.innerHTML.includes('data-nom="VÉLIZY-1"'), 'la suppression connaît le nom qu’elle annoncera');

/* Onglets : « Toutes » plus une catégorie chacun, avec son compte. */
ok(barre.innerHTML.includes('data-cat-equipes="toutes"') && barre.innerHTML.includes('>Toutes<span class="cv-onglet-compte">3</span>'),
  'l’onglet « Toutes » porte le total');
ok(barre.innerHTML.includes('data-cat-equipes="U10"') && barre.innerHTML.includes('>U10<span class="cv-onglet-compte">2</span>'),
  'chaque catégorie porte son compte');
egal((barre.innerHTML.match(/aria-selected="true"/g) || []).length, 1, 'un seul onglet sélectionné');
/* ⚠️ Le compte est COLLÉ au libellé : sans aria-label, l'onglet s'appellerait « U102 ». */
ok(barre.innerHTML.includes('aria-label="Toutes — 3 équipes"') &&
  barre.innerHTML.includes('aria-label="U12 — 1 équipe"'),
  'chaque onglet porte un nom accessible où le compte est séparé du libellé');
ok(/data-cat-equipes="toutes"[^>]*aria-selected="true"/.test(barre.innerHTML), '« Toutes » est ouvert au départ');
ok(choixClub.innerHTML.includes('<option value="">Tous les clubs</option>') &&
  choixClub.innerHTML.includes('>MEUDON<') && choixClub.innerHTML.includes('>VÉLIZY<'),
  'le filtre par club propose les clubs réellement présents');
ok(!zone.innerHTML.includes('bouton-suppr-tout'),
  '⛔ « Toutes » ne propose pas un geste qui viderait tout le tournoi d’un clic');

/* Onglet d'une catégorie : le vidage apparaît, DANS #liste-equipes où vit l'écouteur. */
vm.runInContext('activerOngletEquipes("U10"); afficherEquipes(equipes)', ctx);
egal((zone.innerHTML.match(/class="equipe-item" role="row" data-id="/g) || []).length, 2, 'l’onglet U10 ne montre que ses équipes');
ok(zone.innerHTML.includes('class="bouton-suppr bouton-suppr-tout" data-cat="U10">Supprimer les 2 équipes U10'),
  '« Tout supprimer » nomme sa catégorie et son décompte');
ok(zone.innerHTML.startsWith('<div class="cv-table-outils">'),
  'il est rendu DANS #liste-equipes, en tête — sinon onClicListe ne l’entendrait pas');

/* Cumul des deux filtres. */
vm.runInContext('activerFiltreClubEquipes("VÉLIZY"); afficherEquipes(equipes)', ctx);
egal((zone.innerHTML.match(/class="equipe-item" role="row" data-id="/g) || []).length, 2, 'U10 + VÉLIZY');
vm.runInContext('activerFiltreClubEquipes("MEUDON"); afficherEquipes(equipes)', ctx);
ok(zone.innerHTML.includes('Aucune équipe ne correspond à ce filtre'),
  'un croisement vide le DIT, au lieu d’un tableau muet');
ok(!zone.innerHTML.includes('Aucune équipe saisie pour le moment'),
  '⛔ et ne prétend pas que le tournoi n’a aucune équipe');

/* Mémoire des filtres : purs, ils ne réécrivent jamais la demande. */
egal(vm.runInContext('choisirOngletEquipes(["U10","U12"])', ctx), 'U10', 'l’onglet demandé est retrouvé');
egal(vm.runInContext('choisirOngletEquipes([])', ctx), 'toutes',
  'un rendu transitoire sans catégorie retombe sur « Toutes »');
egal(vm.runInContext('choisirOngletEquipes(["U10","U12"])', ctx), 'U10',
  'et ne fait PAS oublier l’onglet ouvert');
egal(vm.runInContext('choisirOngletEquipes(["U12"])', ctx), 'toutes',
  'une catégorie supprimée renvoie sur « Toutes »');
egal(vm.runInContext('choisirFiltreClubEquipes(["VÉLIZY"])', ctx), '',
  'un club absent de la liste n’est pas appliqué');
egal(vm.runInContext('choisirFiltreClubEquipes(["MEUDON"])', ctx), 'MEUDON',
  'et reste mémorisé pour quand il revient');

/* Un rendu transitoire complet ne laisse pas un faux état vide derrière lui. */
vm.runInContext('afficherEquipes([])', ctx);
ok(zone.innerHTML.includes('Aucune équipe saisie pour le moment'), 'liste vide : le message d’origine');
vm.runInContext('afficherEquipes(equipes)', ctx);
ok(zone.innerHTML.includes('Aucune équipe ne correspond à ce filtre'),
  'au retour des données, l’onglet U10 et le club MEUDON sont TOUJOURS appliqués');
vm.runInContext('activerFiltreClubEquipes(""); afficherEquipes(equipes)', ctx);
egal((zone.innerHTML.match(/class="equipe-item" role="row" data-id="/g) || []).length, 2,
  'et l’onglet U10 seul retrouve ses deux équipes');

console.log('OK — ' + controles + ' contrôles passés.');
