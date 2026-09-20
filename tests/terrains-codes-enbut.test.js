#!/usr/bin/env node
/**
 * Non-régression — Terrains : code court du terrain, et en-but par catégorie.
 *
 *  1) Code court (admin-terrains.js) : le mini-terrain porte le nom de SA fiche. L'ancien
 *     `prefixeTerrain` (première lettre + chiffre final) donnait T1, T2, T3, T4 dès que les
 *     terrains étaient nommés pour de vrai — le nom de la fiche disparaissait.
 *  2) Gabarit au sol : les cotes d'une catégorie sont celles de la SURFACE DE JEU, sans en-but.
 *     L'en-but s'ajoute derrière CHAQUE ligne de but, sur l'axe de la longueur, et c'est ce
 *     gabarit que le packing manipule — donc la capacité annoncée baisse, et c'est la correction.
 *  3) Identifiants : CODE-rang, le rang repartant de 1 sur chaque grand terrain.
 *  4) En-but d'un GRAND terrain : déduit des mini-terrains posés dessus, plus saisi dans la fiche.
 *
 *  Modules réels, DOM simulé ; aucune donnée métier lue ni écrite, aucun appel réseau.
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

const source = lire('js/admin-terrains.js');
const ctx = vm.createContext({
  console,
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  echapper: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
  svgIcone: () => '<svg></svg>',
  estPresente: (c) => String((c || {}).presente || '').toLowerCase() === 'oui',
  afficherMessage() {}, majEtatAvancement() {},
  configCourante: { global: {}, categories: [] },
  equipesCourantes: []
});
vm.runInContext(source, ctx, { filename: 'js/admin-terrains.js' });

/* ------------------------------------------------------ 1) le code court vient de la fiche */
const auto = (nom, i) => vm.runInContext('codeTerrainAuto(' + JSON.stringify(nom) + ',' + (i || 0) + ')', ctx);
egal(auto('Terrain Municipal'), 'MUN', '« Terrain » n’est pas distinctif : c’est « Municipal » qui nomme');
egal(auto('Terrain du Racing'), 'RAC', 'les articles sont écartés');
egal(auto('Terrain piste d’atlantisme'), 'ATL', 'le dernier mot distinctif l’emporte, apostrophe comprise');
egal(auto('Terrain de foot de l’entrée'), 'ENT', 'accents retirés, dernier mot retenu');
egal(auto('Rugby 1'), 'RUG1', 'un chiffre final distingue deux terrains de même nom');
egal(auto('Foot 2'), 'FOO2', 'idem pour le football');
egal(auto('Stade'), 'T1', '⛔ un nom sans mot distinctif ne fabrique pas un code trompeur');
egal(auto('', 3), 'T4', 'un terrain sans nom reste identifiable par son rang');
/* ⛔ Le défaut d'origine, gardé explicitement : ces quatre noms donnaient tous « T » + rang. */
const quatre = ['Terrain Municipal', 'Terrain du Racing', 'Terrain piste d’atlantisme', 'Terrain de foot de l’entrée'];
egal(quatre.map((n, i) => auto(n, i)), ['MUN', 'RAC', 'ATL', 'ENT'],
  '⭐ quatre terrains nommés pour de vrai donnent quatre codes distincts');
ok(!source.includes('function prefixeTerrain('), 'l’ancien schéma de préfixe a disparu du module');

ctx.fiches = [{ nom: 'Terrain Municipal' }, { nom: 'Municipalité' }, { nom: 'Terrain du Racing', code: 'racing' }];
egal(vm.runInContext('construireCodes(fiches)', ctx), ['MUN', 'MUN2', 'RACING'],
  'le code saisi dans la fiche l’emporte, et deux codes identiques sont séparés');

/* ------------------------------------------------- 2) le gabarit au sol inclut l'en-but */
const gab = (d) => vm.runInContext('gabaritCategorie(' + JSON.stringify(d) + ')', ctx);
egal(gab({ l: 40, w: 30, enBut: 5 }), { l: 50, w: 30, lJeu: 40, eb: 5 },
  '⭐ l’en-but s’ajoute DES DEUX CÔTÉS, et seulement sur la longueur');
egal(gab({ l: 40, w: 30 }), { l: 40, w: 30, lJeu: 40, eb: 0 },
  'sans en-but déclaré, le gabarit est la surface de jeu — rien n’est deviné');
egal(gab({ l: 40, w: 30, enBut: 0 }), { l: 40, w: 30, lJeu: 40, eb: 0 }, 'un en-but à 0 vaut « aucun »');
egal(gab({ plein: true }), { plein: true }, 'une catégorie « terrain entier » n’a pas de gabarit à calculer');
egal(gab(null), null, 'aucune dimension : aucun gabarit');
egal(vm.runInContext('enButCategorie({enBut:"7"})', ctx), 7, 'un en-but saisi en texte est lu');
egal(vm.runInContext('enButCategorie({enBut:-3})', ctx), 0, '⛔ un en-but négatif ne rétrécit jamais un terrain');

/* L'axe de l'en-but suit l'orientation RÉELLE de la tuile posée par le packing. */
const g1 = { l: 50, w: 30, lJeu: 40, eb: 5 };
ctx.g1 = g1;
egal(vm.runInContext('marquerEnBut({w:50,h:30}, g1)', ctx), { w: 50, h: 30, eb: 5, ebAxe: 'x' },
  'tuile posée dans le sens de la longueur : en-but sur x');
egal(vm.runInContext('marquerEnBut({w:30,h:50}, g1)', ctx), { w: 30, h: 50, eb: 5, ebAxe: 'y' },
  '⭐ tuile PIVOTÉE par le packing : l’en-but bascule sur y, il ne reste pas du mauvais côté');
egal(vm.runInContext('marquerEnBut({w:40,h:30}, {l:40,w:30,lJeu:40,eb:0})', ctx),
  { w: 40, h: 30, eb: 0, ebAxe: '' }, 'sans en-but, aucun axe à marquer');

/* ------------------------------------------- la capacité annoncée tient compte de l'en-but */
const cap = (L, W, d, m) => vm.runInContext(
  'capaciteTerrain({L:' + L + ',W:' + W + '}, gabaritCategorie(' + JSON.stringify(d) + '), ' + m + ')', ctx);
egal(cap(100, 65, { l: 40, w: 30 }, 5), 4, 'sans en-but, quatre U10 tiennent sur 100 × 65');
egal(cap(100, 65, { l: 40, w: 30, enBut: 5 }, 5), 3,
  '⭐ avec 5 m d’en-but le quatrième ne tient plus : c’est la correction, pas une régression');
egal(cap(100, 65, { plein: true }, 5), 1, 'une catégorie « terrain entier » occupe le grand terrain');

/* ------------------------------------------------ 3) les identifiants portent le code */
ctx.res = {
  parCategorie: { U10: [], U12: [] },
  fieldsPlan: [
    { field: { nom: 'Terrain Municipal' }, code: 'MUN', mode: 'solo',
      zones: [{ cat: 'U10', tiles: [{ id: '1', eb: 5 }, { id: '2', eb: 5 }, { id: '3', eb: 5 }] }] },
    { field: { nom: 'Terrain du Racing' }, code: 'RAC', mode: 'solo',
      zones: [{ cat: 'U12', tiles: [{ id: '4', eb: 6 }, { id: '5', eb: 6 }] }] },
    { field: { nom: 'Petit' }, code: 'PET', mode: 'plein',
      zones: [{ cat: 'U14', tiles: [{ id: '6' }] }] }
  ]
};
vm.runInContext('renumeroterRepartition(res)', ctx);
egal(vm.runInContext('res.fieldsPlan.map(function(f){return f.zones[0].tiles.map(function(t){return t.id;});})', ctx),
  [['MUN-1', 'MUN-2', 'MUN-3'], ['RAC-1', 'RAC-2'], ['PET-1']],
  '⭐ chaque mini-terrain porte le code de SON grand terrain, et le rang repart de 1 dessus');
egal(vm.runInContext('res.parCategorie', ctx),
  { U10: ['MUN-1', 'MUN-2', 'MUN-3'], U12: ['RAC-1', 'RAC-2'], U14: ['PET-1'] },
  'la liste écrite dans le champ « Terrains » des catégories suit les mêmes identifiants');
egal(vm.runInContext('res.fieldsPlan[2].zones[0].tiles[0].label', ctx), 'U14 · PET-1',
  'un terrain occupé en entier reste étiqueté avec sa catégorie');
const avant = vm.runInContext('JSON.stringify(res)', ctx);
vm.runInContext('renumeroterRepartition(res)', ctx);
egal(vm.runInContext('JSON.stringify(res)', ctx), avant, 'la renumérotation est idempotente');

/* --------------------------------- 4) l'en-but d'un grand terrain se DÉDUIT de ses tuiles */
egal(vm.runInContext('profondeurEnBut(res.fieldsPlan[0])', ctx), 5, 'l’en-but du terrain suit ses mini-terrains');
egal(vm.runInContext('profondeurEnBut(res.fieldsPlan[1])', ctx), 6, 'et vaut le plus grand de ceux qui y sont posés');
egal(vm.runInContext('profondeurEnBut(res.fieldsPlan[2])', ctx), 0, 'aucun en-but sur un terrain occupé en entier');
egal(vm.runInContext('profondeurEnBut(null)', ctx), 0, '⛔ un terrain inconnu ne fabrique pas d’espace');
ok(!/parseFloat\(\(field \|\| \{\}\)\.enBut\)/.test(source), 'le champ en-but du grand terrain n’est plus lu');
ok(!source.includes("tp-enbut"), 'et il a quitté la fiche du grand terrain');
ok(source.includes('dim-enbut'), 'l’en-but se saisit désormais sur la ligne de la catégorie');
ok(source.includes("h += '<h3 class=\"terr-titre\">Taille de terrain par catégorie</h3>'"),
  'cette ligne vit dans « Options avancées », comme demandé');

/* ------------------------------------------------- bout en bout : calcul complet */
ctx.fields = [{ nom: 'Terrain Municipal', code: 'MUN', L: 115, W: 70 },
              { nom: 'Terrain du Racing', code: 'RAC', L: 68, W: 110 }];
ctx.cats = [{ name: 'U10', teams: 6, tile: gab({ l: 40, w: 30, enBut: 5 }) },
            { name: 'U12', teams: 6, tile: gab({ l: 56, w: 45, enBut: 5 }) }];
vm.runInContext('plan = allouerTerrains(fields, cats, 5, 4, 4); renumeroterRepartition(plan);', ctx);
const ids = vm.runInContext(
  'plan.fieldsPlan.map(function(fp){return fp.zones.map(function(z){return z.tiles.map(function(t){return t.id;});});})', ctx);
ok(JSON.stringify(ids).indexOf('MUN-1') !== -1 && JSON.stringify(ids).indexOf('RAC-1') !== -1,
  'un calcul complet produit bien des identifiants codés');
ok(!/"\d+"/.test(JSON.stringify(ids)), '⛔ plus aucun identifiant purement numérique ne subsiste');
const ebs = vm.runInContext(
  'plan.fieldsPlan.map(function(fp){return fp.zones.map(function(z){return z.tiles.map(function(t){return [t.eb,t.ebAxe];});});})', ctx);
ok(JSON.stringify(ebs).indexOf('5') !== -1, 'les tuiles issues du calcul portent leur en-but');
ok(/"x"|"y"/.test(JSON.stringify(ebs)), 'et l’axe sur lequel le dessiner');

/* ------------------------------- 5) le CONTRAT DE DESSIN dont dépend le glisser-déposer */
ctx.plan2 = {
  fieldsPlan: [
    { field: { nom: 'Terrain Municipal', type: 'rugby', L: 115, W: 70, pos: 'CG' }, code: 'MUN', mode: 'solo',
      zones: [{ cat: 'U10', color: '#2E8FE0',
        tiles: [{ id: 'MUN-1', x: 0, y: 0, w: 50, h: 30, label: 'MUN-1', eb: 5, ebAxe: 'x' }] }],
      table: { x: 60, y: 40, w: 4, h: 4 } },
    { field: { nom: 'Piste', type: 'foot', L: 68, W: 105, pos: 'HC' }, code: 'ATL', mode: 'solo',
      zones: [{ cat: 'U12', color: '#27ae60',
        tiles: [{ id: 'ATL-1', x: 0, y: 0, w: 45, h: 66, label: 'ATL-1', eb: 5, ebAxe: 'y' }] }] }
  ]
};
const carte = vm.runInContext('dessinerCarte(plan2)', ctx);
/* ⛔ Ces trois repères sont tout ce dont `onChipPointerDown` a besoin. Un redessin peut tout
   changer d'autre, mais s'il perd l'un d'eux, le placement manuel meurt en silence. */
egal((carte.match(/data-terrain="/g) || []).length, 2, 'un groupe data-terrain par grand terrain');
egal((carte.match(/class="carte-terrain"/g) || []).length, 2,
  '⭐ UN rect .carte-terrain par terrain : c’est lui qui convertit les pixels en mètres');
ok(/data-field="0" data-tuile="MUN-1"/.test(carte) && /data-field="1" data-tuile="ATL-1"/.test(carte),
  'chaque mini-terrain reste cliquable avec son terrain et son identifiant');
/* Le rect de référence est posé à l'ORIGINE du repère tourné et couvre tout le terrain : c'est
   sa matrice que la conversion écran → mètres inverse. Un décalage fausserait chaque dépôt. */
const ppmCarte = parseFloat((carte.match(/data-ppm="([\d.]+)"/) || [])[1]);
ok(ppmCarte > 0, 'la carte publie son échelle (data-ppm), dont dépend la conversion');
ok(carte.indexOf('<rect x="0" y="0" width="' + (115 * ppmCarte).toFixed(1) + '" height="' +
  (70 * ppmCarte).toFixed(1) + '" rx="3" class="carte-terrain"/>') !== -1,
  'il couvre le terrain entier (115 × 70 m à l’échelle), à l’origine du groupe');
/* Et la ROTATION porte sur le terrain, jamais sur sa plaque de nom : un nom à 35° ne se lit pas. */
ok((carte.match(/class="carte-pivot" transform="rotate\(/g) || []).length === 2,
  'chaque terrain a son groupe tourné');
ok(/data-terrain="0"><g class="carte-plaque"/.test(carte),
  '⭐ la plaque de nom est HORS du groupe tourné');
/* Le plan se lit : échelle, marquages propres au sport, plaque de nom et code. */
ok(carte.indexOf('carte-echelle') !== -1 && /50 m<\/text>/.test(carte), 'le plan porte sa règle graduée');
ok(carte.indexOf('carte-nomterrain') !== -1 && carte.indexOf('>MUN<') !== -1,
  'chaque terrain porte le nom de sa fiche et son code');
ok(carte.indexOf('<circle') !== -1, 'le terrain de football a son rond central');
ok(carte.indexOf('stroke-dasharray="5 4"') !== -1, 'le terrain de rugby a ses lignes de 22 m');
ok((carte.match(/class="carte-enbut"/g) || []).length === 4,
  'deux bandes d’en-but par mini-terrain, derrière chaque ligne de but');
/* Deux cellules de 330 px + les gouttières : 736. Avec les cellules de 165 px d'avant, la même
   scène tenait dans 406 — et un terrain de 115 m dans 161 px. */
ok(ppmCarte > 2.5, '⭐ le plan est dessiné à plus de 2,5 px/m, contre 1,4 auparavant');
/* Les trois poignées du plan libre, chacune avec son geste. */
ok(/data-plaque="0"/.test(carte) && /data-plaque="1"/.test(carte), 'chaque terrain se déplace par sa plaque');
ok(/data-rot="0"/.test(carte) && /data-rot="1"/.test(carte), 'chaque terrain a sa poignée d’orientation');
ok(/data-rot-field="0" data-rot-tuile="MUN-1"/.test(carte),
  'chaque mini-terrain a son badge de rotation sur place');
ok(carte.indexOf('data-rot-tuile') > carte.indexOf('data-tuile="MUN-1"'),
  '⛔ le badge ⟳ est HORS du groupe cliquable, sinon il mettrait le mini-terrain de côté');
/* Le mini-terrain est OPAQUE : il recouvre les marquages du grand terrain, comme sur le gazon. */
ok(carte.indexOf('fill-opacity="0.13"') === -1, '⛔ plus d’aplat translucide sur les mini-terrains');
ok((carte.match(/fill="#3f7a43"/g) || []).length === 2, 'chaque mini-terrain a son herbe opaque');
/* Et plus aucune marge extérieure d'en-but : il vit DANS les mini-terrains, plus en bandes
   collées de part et d'autre du grand terrain comme avant. */
const bandes = carte.match(/<rect x="(-?[\d.]+)"[^>]*class="carte-enbut"/g) || [];
egal(bandes.length, 4, 'les quatre bandes d’en-but sont bien des rects positionnés');
ok(!bandes.some(function (b) { return /x="-/.test(b); }),
  '⛔ aucune bande ne déborde hors du grand terrain');

const css = lire('css/styles.css');
ok(!/\.carte-svg\s*\{[^}]*max-width:\s*520px/.test(css),
  '⛔ le plafond de 520 px a sauté : il ramenait un plan de 2,9 px/m à 1,6');

/* ------------------------------------------ 6) le repère du SITE : position et angle libres */
egal(vm.runInContext('angleTerrain({rot:-90})', ctx), 270, 'un angle négatif est ramené dans [0,360[');
egal(vm.runInContext('angleTerrain({rot:"abc"})', ctx), 0, '⛔ un angle illisible vaut 0, pas NaN');
egal(vm.runInContext('angleTerrain({})', ctx), 0, 'sans angle déclaré, le terrain est horizontal');
/* Un quart de tour échange longueur et largeur dans la boîte englobante — c'est exactement ce
   que l'organisateur simulait à la main en inversant L et W faute de rotation. */
egal(vm.runInContext('boiteTerrain({x:0,y:0,L:100,W:60,rot:0})', ctx), { x0: 0, y0: 0, x1: 100, y1: 60 },
  'sans rotation, la boîte est le terrain lui-même');
const b90 = vm.runInContext('boiteTerrain({x:0,y:0,L:100,W:60,rot:90})', ctx);
ok(Math.abs((b90.x1 - b90.x0) - 60) < 0.001 && Math.abs((b90.y1 - b90.y0) - 100) < 0.001,
  '⭐ à 90°, la boîte mesure 60 × 100 : la rotation remplace l’inversion L/W');
const b45 = vm.runInContext('boiteTerrain({x:0,y:0,L:100,W:60,rot:45})', ctx);
ok(b45.x1 - b45.x0 > 110 && b45.y1 - b45.y0 > 110, 'à 45°, la boîte grandit sur les deux axes');

/* Reprise sans ressaisie : un terrain sans position hérite de son emplacement sur l'ancienne grille. */
vm.runInContext('positionsTerrains = {};', ctx);
ctx.anciens = [{ nom: 'A', code: 'A', L: 115, W: 70, pos: 'CG' }, { nom: 'B', code: 'B', L: 105, W: 68, pos: 'HC' }];
vm.runInContext('assurerPositionsTerrains(anciens)', ctx);
egal(vm.runInContext('anciens.map(function(f){return [f.x,f.y];})', ctx), [[0, 140], [140, 0]],
  '⭐ la grille 3×3 se convertit en mètres en gardant l’arrangement');
/* Une position déjà mémorisée l'emporte sur la grille : c'est le glisser qui fait foi. */
vm.runInContext('positionsTerrains = { A: { x: 12, y: 34 } };', ctx);
ctx.anciens2 = [{ nom: 'A', code: 'A', L: 115, W: 70, pos: 'CG' }];
vm.runInContext('assurerPositionsTerrains(anciens2)', ctx);
egal(vm.runInContext('[anciens2[0].x, anciens2[0].y]', ctx), [12, 34],
  'la position déplacée à la main l’emporte sur l’ancienne grille');
vm.runInContext('positionsTerrains = {};', ctx);

/* L'orientation est une SAISIE de la fiche : c'est elle qui part à l'enregistrement. */
ok(source.includes('class="tp-rot"'), 'la fiche porte le champ Orientation');
ok(source.includes("rot:  parseFloat((row.querySelector('.tp-rot') || {}).value) || 0"),
  'et le lecteur du formulaire le lit');
ok(source.includes("const champ = document.querySelectorAll('#liste-terrains-physiques .tp-rot')[iField];"),
  '⭐ la poignée ⟲ écrit DANS ce champ : une seule source, donc pas de valeur perdue à l’enregistrement');
ok(source.includes('type="hidden" class="tp-pos"'),
  '⛔ l’ancien emplacement est conservé en repli, plus proposé à la saisie');
ok(source.includes('return p ? Object.assign({}, t, { x: p.x, y: p.y }) : t;'),
  'les positions libres sont jointes aux terrains enregistrés');
/* ⭐ La conversion écran → mètres ne passe PLUS par la boîte alignée sur les axes. */
ok(source.includes('function pointLocalSvg('), 'la conversion passe par la matrice de l’élément');
ok(!/getBoundingClientRect\(\)[\s\S]{0,400}field\.L/.test(source),
  '⛔ plus aucune conversion en mètres depuis une boîte englobante, fausse sous rotation');

/* ---------------------- 7) la rotation sur place d'un mini-terrain reste DANS le terrain */
ctx.repartitionCalculee = {
  ctxManuel: { m: 5, cats: [], tmL: 4, tmW: 4 },
  fieldsPlan: [{ field: { nom: 'Piste', code: 'ATL', L: 105, W: 68 }, code: 'ATL', mode: 'solo',
    zones: [{ cat: 'U12', color: '#27ae60',
      tiles: [{ id: 'ATL-1', x: 0, y: 0, w: 45, h: 60, label: 'ATL-1', eb: 5, ebAxe: 'y' }] }], table: null }]
};
vm.runInContext('repartitionCalculee = globalThis.repartitionCalculee; afficherRepartition = function () {};', ctx);
vm.runInContext('pivoterMiniTerrain(0, "ATL-1")', ctx);
const pivote = vm.runInContext('repartitionCalculee.fieldsPlan[0].zones[0].tiles[0]', ctx);
egal([pivote.w, pivote.h], [60, 45], 'longueur et largeur s’échangent');
egal(pivote.ebAxe, 'x', '⭐ l’en-but bascule avec la tuile : il ne reste pas du mauvais côté');
ok(pivote.x >= 0 && pivote.y >= 0 && pivote.x + pivote.w <= 105 && pivote.y + pivote.h <= 68,
  '⛔ et l’emprise reste DANS le terrain — le pivot autour du centre la faisait sortir en x négatif');
/* La garde qui l'empêche vit dans refusPlacement : elle protège tous les appelants, pas ce seul geste. */
egal(vm.runInContext('refusPlacement({field:{nom:"T",L:100,W:60},zones:[]}, {x:-1,y:0,w:10,h:10}, 5)', ctx),
  'il sortirait du terrain', 'un emplacement hors du terrain est refusé, et le dit');
egal(vm.runInContext('refusPlacement({field:{nom:"T",L:100,W:60},zones:[]}, {x:95,y:0,w:10,h:10}, 5)', ctx),
  'il sortirait du terrain', 'y compris en débordant à droite');
egal(vm.runInContext('refusPlacement({field:{nom:"T",L:100,W:60},zones:[]}, {x:0,y:0,w:10,h:10}, 5)', ctx),
  null, 'un emplacement légitime passe toujours');

console.log('OK — ' + controles + ' contrôles passés.');
