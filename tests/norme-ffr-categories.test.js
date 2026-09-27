#!/usr/bin/env node
/**
 * Non-régression ciblée — bouton « Appliquer la recommandation » des cartes Catégories, et la carte
 * « Référence FFR » qui montre AVANT le clic exactement ce que le clic posera.
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
  CSS: { escape: v => v },
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

function formulaire(cat, variante) {
  const champs = { nb_poules: { value: '3' } };
  nomsNorme.forEach(n => { champs[n] = { value: 'ANCIEN-' + n }; });
  champs.forme_jeu = {
    value: '',
    options: [{ value: '' }, { value: 'RE — 7x7' }, { value: 'RE — 10x10' }]
  };
  // Comme le vrai formulaire (CHAMPS_CATEGORIE) : « Nombre de périodes » est une liste '' / 1 / 2.
  champs.format_mi_temps.options = [{ value: '' }, { value: '1' }, { value: '2' }];
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
    getAttribute(n) { return n === 'data-variante' ? (variante || '') : (n === 'data-cat' ? 'U12' : ''); },
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

/* ---- Carte « Référence FFR » : ce qu'elle montre AVANT le clic est ce que le clic pose ---- */
/** Lignes affichées par la carte, en { 'Section / Libellé': valeur }. */
function lignesAffichees(cat) {
  const out = {};
  ctx.sectionsReferenceFFRCarte(ctx.regleReferenceFFRCarte(cat), ctx.recommandationsFFRCarte(cat))
    .forEach(s => s.lignes.forEach(l => { out[s.titre + ' / ' + l[0]] = String(l[1]); }));
  return out;
}
/** Traduit les lignes d'une section de temps (+ effectifs, organisation) en champs du formulaire. */
function champsAffiches(aff, titreTemps) {
  const min = v => String(v).replace(/ min$/, '');
  return {
    format_mi_temps: aff[titreTemps + ' / Nombre de périodes'],
    duree_mi_temps_min: min(aff[titreTemps + ' / Durée d’une période']),
    pause_mi_temps_min: min(aff[titreTemps + ' / Pause entre deux périodes']),
    recup_entre_matchs_min: min(aff[titreTemps + ' / Récupération entre matchs']),
    effectif_min: aff['Effectifs / Effectif minimum (sur le terrain)'],
    effectif_max: aff['Effectifs / Effectif maximum (sur la feuille)'],
    arbitrage_organisation: aff['Organisation / Arbitrage'],
    max_equipes_par_club: aff['Organisation / Max équipes par club']
  };
}
const posesSansForme = b => { const v = valeurs(b); delete v.forme_jeu; return v; };
/** Rend la carte par le vrai majReferencesFFRCategories, sur un DOM réduit à cette carte. */
function rendreCarte(cat) {
  const el = { innerHTML: '', getAttribute: n => (n === 'data-cat' ? cat : null) };
  const sous = { textContent: '' };
  const doc = ctx.document;
  ctx.document = { querySelectorAll: s => (s === '.cv-cat-reference-table[data-cat]' ? [el] : []),
    querySelector: () => sous, getElementById: () => null };
  try { ctx.majReferencesFFRCategories(); } finally { ctx.document = doc; }
  return { html: el.innerHTML, sous: sous.textContent };
}

for (const [b, cat] of [[u10, 'U10'], [u12, 'U12']]) {
  egal(champsAffiches(lignesAffichees(cat), 'Temps de jeu'), posesSansForme(b),
    cat + ' : temps de jeu, effectifs et organisation affichés = valeurs posées par le clic');
  const carte = rendreCarte(cat);
  egal(carte.sous, cat + ' · ' + b.champs.forme_jeu.value, cat + ' : la forme affichée est la forme posée');
  ['<caption>Temps de jeu</caption>', '<caption>Effectifs</caption>', '<caption>Organisation</caption>'].forEach(c =>
    ok(carte.html.includes(c), cat + ' : la carte rend la section ' + c));
  ok(!/Ballon|ballon/.test(carte.html), cat + ' : aucune taille de ballon sur la carte');
  ok(!carte.html.includes('cv-cat-ref-note'), cat + ' : recommandation complète ⇒ aucune note d’absence');
  const bouton = ctx.boutonNormeFFRCarte(cat);
  ok(bouton.includes('>Appliquer la recommandation</button>') && !bouton.includes('norme FFR'),
    cat + ' : le bouton s’appelle exactement « Appliquer la recommandation »');
}

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
// La carte ne montre ni temps ni organisation qu'elle n'appliquerait pas, et dit pourquoi AVANT le clic.
egal(lignesAffichees('U99'), { 'Effectifs / Effectif minimum (sur le terrain)': '8', 'Effectifs / Effectif maximum (sur la feuille)': '14' },
  'référence incomplète : seuls les effectifs publiés sont affichés, aucun temps ni organisation inventés');
const carteU99 = rendreCarte('U99');
ok(carteU99.html.includes('cv-cat-ref-note') && carteU99.html.includes('rien à appliquer') &&
   carteU99.html.includes('Aucune grille de temps FFR complète'), 'référence incomplète : la carte annonce le motif du refus');

// Variantes A/B (catégorie sans profil) : une section de temps par bouton, chacune = ce que SON bouton pose.
ctx.dernierResConformite = {
  refDisponible: true,
  regles: { U14: [{ forme_jeu: 'RE', effectif: '10x10', effectif_terrain: '10', effectif_max_feuille: '15',
    terrain_longueur_m: '60', terrain_largeur_m: '45', ballon: 'T4', carton_jaune_min: '5' }] },
  temps: { U14: { grilles: [
    { variante: 'A', nb_periodes: '2', duree_periode_min: '12', pause_periodes_min: '2' },
    { variante: 'B', nb_periodes: '3', duree_periode_min: '8', pause_periodes_min: '1' }] } }
};
const affU14 = lignesAffichees('U14');
const u14A = formulaire('U14', 'A'); cliquer(u14A);
egal(champsAffiches(affU14, 'Temps de jeu — variante A'), posesSansForme(u14A),
  'U14 variante A : la section affichée = valeurs posées par son bouton');
// Variante B en 3 périodes : la liste du formulaire s'arrête à 2. Avant correction, le clic la VIDAIT
// sans un mot (« appliquée ») et « Enregistrer » stockait une durée sans nombre de périodes.
egal(affU14['Temps de jeu — variante B / Nombre de périodes'], '3', 'U14 variante B : la carte montre la grille publiée (3 périodes)');
const u14B = formulaire('U14', 'B');
const avantB = valeurs(u14B); cliquer(u14B);
egal(valeurs(u14B), avantB, 'U14 variante B : valeur absente de la liste ⇒ refus, AUCUN champ modifié');
ok(/« 3 » n’est pas proposée/.test(u14B.message.textContent) && u14B.message.type === 'ko',
  'U14 variante B : le refus dit quelle valeur manque', u14B.message.textContent);
egal(affU14['Terrain et règles / Dimension terrain'], '60 × 45 m', 'U14 : dimensions du terrain affichées');
egal(affU14['Terrain et règles / Carton jaune'], '5 min', 'U14 : carton jaune publié ⇒ affiché');
ok(!JSON.stringify(affU14).includes('T4'), 'U14 : la taille du ballon publiée n’est pas affichée');
const boutonsU14 = ctx.boutonNormeFFRCarte('U14');
ok(boutonsU14.includes('>Appliquer la recommandation — 2 × 12 min</button>') &&
   boutonsU14.includes('>Appliquer la recommandation — 3 × 8 min</button>'), 'U14 : un bouton « Appliquer la recommandation » par variante');
// Plusieurs formes possibles ce mois-ci : pas de bouton (on renvoie au choix de la forme)… donc
// aucune recommandation affichée non plus, même pour une catégorie à profil (U10).
ctx.dernierResConformite = { refDisponible: true, temps: {},
  regles: { U10: [{ forme_jeu: 'RE', effectif: '7x7' }, { forme_jeu: 'JCO', effectif: '5x5' }] } };
ok(!ctx.boutonNormeFFRCarte('U10').includes('<button'), 'U10 ambigu : aucun bouton d’application');
egal(ctx.recommandationsFFRCarte('U10'), [], 'U10 ambigu : aucune recommandation calculée pour la carte');
ok(!Object.keys(lignesAffichees('U10')).some(k => /^Temps de jeu|^Organisation/.test(k)),
  'U10 ambigu : la carte ne montre ni temps de jeu ni organisation sans bouton pour les appliquer');
egal(posts, 0, 'carte et variantes : toujours aucun POST');

console.log('OK — ' + controles + ' contrôles passés (module réel, référentiel et DOM simulés).');
