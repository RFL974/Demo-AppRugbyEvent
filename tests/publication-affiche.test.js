#!/usr/bin/env node
/**
 * Non-régression — écran « Publication », d'après la maquette.
 *
 *  1) La carte du tournoi est un BOUTON qui ouvre l'affiche. Son nom accessible dit ce qu'il
 *     FAIT (« Ouvrir l'affiche … pour l'imprimer »), pas seulement ce qu'il contient.
 *  2) L'affiche agrandie porte le QR dans un bandeau AJOUTÉ SOUS elle, jamais par-dessus :
 *     on ne sait pas ce que l'organisateur a mis en bas de son visuel, et le recouvrir
 *     l'abîmerait sans le dire. Sans affiche chargée, une affiche sobre est COMPOSÉE.
 *  3) L'état de publication se dit en pastille dans la carte, et en phrase complète dans le
 *     repli sans JavaScript — même nœud, deux mises en page.
 *  4) La table de marque : pastille et encart traduisent l'état RENDU PAR LE SERVEUR ; aucune
 *     règle nouvelle n'est inventée ici.
 *  5) Le bandeau de clôture SUIT le bouton que le serveur révèle — il ne le devine pas, et il
 *     est calculé APRÈS la boucle des gestes.
 *  6) ecrans.js déplace les nœuds sans les recréer, en gardant leur référence AVANT le
 *     déplacement (un conteneur pas encore rattaché sort ses enfants du document).
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

/* Un élément simulé, réduit à ce que ces fonctions touchent. */
function faireElement(id) {
  const lot = new Set();
  const el = {
    id: id || '', textContent: '', innerHTML: '', hidden: false,
    classList: {
      add() { Array.prototype.forEach.call(arguments, function (c) { lot.add(c); }); },
      remove() { Array.prototype.forEach.call(arguments, function (c) { lot.delete(c); }); },
      toggle(c, v) { if (v) lot.add(c); else lot.delete(c); },
      contains(c) { return lot.has(c); }
    },
    querySelector: () => null, querySelectorAll: () => [], appendChild() {}, setAttribute() {}
  };
  Object.defineProperty(el, 'className', {
    get() { return Array.from(lot).join(' '); },
    set(v) { lot.clear(); String(v).split(/\s+/).filter(Boolean).forEach(function (c) { lot.add(c); }); }
  });
  return el;
}

const elements = {};
function elem(id) { if (!elements[id]) elements[id] = faireElement(id); return elements[id]; }

const contexte = {
  document: { getElementById: (id) => elements[id] || null, querySelector: () => null,
              addEventListener() {} },
  window: { addEventListener() {}, print() {} },
  configCourante: { global: {}, categories: [] },
  estPresente: (c) => String((c || {}).presente || '').toLowerCase() === 'oui',
  echapper: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
  svgIcone: () => '<svg></svg>',
  urlAffiche: (id) => 'affiches/' + id + '.jpg',
  urlPagePublique: () => 'https://tournoi.exemple.invalid/tournoi.html',
  // `formaterDateFr` vit dans le module testé : c'est sa dépendance de commun.js qu'on fournit.
  dateLocaleDepuisISO: () => new Date(Date.UTC(2027, 4, 15)),
  afficherMessage() {}, qrcode: null
};
const ctx = vm.createContext(contexte);
vm.runInContext(lire('js/admin-infos-publication.js'), ctx, { filename: 'js/admin-infos-publication.js' });

/* --------------------------------------------------- 1) la carte du tournoi */
contexte.configCourante.global = { tournoi_nom: 'Tournoi des petits champions',
  tournoi_date: '2027-05-15', tournoi_lieu: 'Stade Paul Langevin', tournoi_adresse: 'Le Plessis-Robinson' };
contexte.configCourante.categories = [{ categorie: 'U10', presente: 'oui' }, { categorie: 'U12', presente: 'oui' },
  { categorie: 'U14', presente: 'non' }];
let apercu = vm.runInContext('apercuPublicationHTML()', ctx);
ok(/<button[^>]*data-ouvrir-affiche/.test(apercu), 'la carte du tournoi est un bouton — donc atteignable au clavier');
ok(/aria-label="Ouvrir l’affiche de Tournoi des petits champions[^"]*imprimer"/.test(apercu),
  '⛔ son nom accessible dit ce qu’elle FAIT, pas seulement ce qu’elle montre');
ok(apercu.indexOf('Tournoi des petits champions') >= 0 && apercu.indexOf('15 mai 2027') >= 0 &&
   apercu.indexOf('Stade Paul Langevin') >= 0 && apercu.indexOf('Le Plessis-Robinson') >= 0,
  'elle reprend le nom, la date et les deux lignes du lieu');
ok(apercu.indexOf('>U10<') >= 0 && apercu.indexOf('>U12<') >= 0 && apercu.indexOf('>U14<') < 0,
  '⛔ seules les catégories PRÉSENTES sont montrées');
ok(/cv-pub-carte-image est-vide/.test(apercu) && /Aucune affiche/.test(apercu),
  'sans affiche chargée, la place est annoncée vide plutôt que laissée en blanc');
contexte.configCourante.global.tournoi_affiche_id = 'aff-1';
apercu = vm.runInContext('apercuPublicationHTML()', ctx);
ok(/<img src="affiches\/aff-1\.jpg"/.test(apercu), 'l’affiche chargée vient du serveur, jamais d’une copie locale');

/* --------------------------------------------------- 2) l'affiche agrandie */
let affiche = vm.runInContext('affichePubliqueHTML()', ctx);
const posImage = affiche.indexOf('cv-affiche-image');
const posBandeau = affiche.indexOf('cv-affiche-bandeau');
ok(posImage >= 0 && posBandeau > posImage,
  '⛔ le bandeau du QR vient APRÈS l’affiche : il s’ajoute dessous, il ne la recouvre pas');
ok(/Scannez pour suivre le tournoi en direct/.test(affiche) &&
   affiche.indexOf('https://tournoi.exemple.invalid/tournoi.html') >= 0,
  'le bandeau porte la consigne et l’adresse en clair');
ok(!/cv-affiche-composee/.test(affiche), 'avec une affiche, rien n’est composé');
delete contexte.configCourante.global.tournoi_affiche_id;
affiche = vm.runInContext('affichePubliqueHTML()', ctx);
ok(/cv-affiche-composee/.test(affiche) && affiche.indexOf('Tournoi des petits champions') >= 0,
  'sans affiche, une affiche sobre est COMPOSÉE — imprimable telle quelle');
ok(/cv-affiche-bandeau/.test(affiche), 'et elle porte le même bandeau de QR');
/* Sans la brique qrcode (ici absente), l'affiche se rend quand même : le QR seul manque. */
ok(/cv-affiche-qr-absent/.test(affiche), '⛔ une brique QR indisponible ne fait pas tomber l’affiche');

/* --------------------------------------------------- 3) l'état de publication */
elements['etat-publication'] = faireElement('etat-publication');
elements['cv-pub-intro'] = faireElement('cv-pub-intro');
contexte.configCourante.global.tournoi_publie = 'oui';
vm.runInContext('majEtatPublicationAffiche()', ctx);
ok(elements['etat-publication'].textContent === '🟢 Publié (visible du public)',
  '⛔ hors carte (repli sans JavaScript), l’état reste une phrase qui se suffit à elle-même');
elements['etat-publication'].className = 'cv-pastille';
vm.runInContext('majEtatPublicationAffiche()', ctx);
ok(elements['etat-publication'].textContent === '✓ Publié' &&
   elements['etat-publication'].className.indexOf('cv-succes') >= 0,
  'dans la tête de carte, le MÊME nœud devient une pastille courte');
ok(elements['cv-pub-intro'].textContent.indexOf('en ligne') >= 0, 'et l’introduction suit l’état');
contexte.configCourante.global.tournoi_publie = 'non';
vm.runInContext('majEtatPublicationAffiche()', ctx);
ok(elements['etat-publication'].textContent === 'Non publié' &&
   elements['cv-pub-intro'].textContent.indexOf('à venir') >= 0,
  'non publié : la pastille et l’introduction le disent sans ambiguïté');

/* --------------------------------------------------- 4) la table de marque */
elements['cv-marque-pastille'] = faireElement('cv-marque-pastille');
elements['cv-marque-encart'] = faireElement('cv-marque-encart');
vm.runInContext('majResumeAccesScores({etat:"OUVERT"}, false)', ctx);
ok(elements['cv-marque-pastille'].textContent === '✓ Saisie ouverte' &&
   elements['cv-marque-encart'].innerHTML.indexOf('Saisie des résultats en cours') >= 0,
  'un accès ouvert est annoncé comme tel, pastille et encart');
vm.runInContext('majResumeAccesScores({etat:"OUVERT"}, true)', ctx);
ok(elements['cv-marque-pastille'].textContent === 'Fermée' &&
   elements['cv-marque-encart'].className.indexOf('cv-attention') >= 0,
  '⛔ une fermeture automatique prime sur l’état enregistré : le serveur fait foi');
vm.runInContext('majResumeAccesScores({etat:"FIGE"}, false)', ctx);
ok(elements['cv-marque-pastille'].textContent === 'En pause', 'la pause se lit en un mot');
vm.runInContext('majResumeAccesScores(null, false)', ctx);
ok(elements['cv-marque-pastille'].hidden === true && elements['cv-marque-encart'].hidden === true,
  'sans état connu, rien n’est affirmé');

/* --------------------------------------------------- 5) le bandeau de clôture */
elements['cv-pub-cloture'] = faireElement('cv-pub-cloture');
elements['acces-saisie-cloture'] = faireElement('acces-saisie-cloture');
elements['acces-saisie-cloture'].hidden = true;
vm.runInContext('majBandeauCloture()', ctx);
ok(elements['cv-pub-cloture'].hidden === true,
  '⛔ tant que le serveur ne permet pas de clôturer, le bandeau n’existe pas à l’écran');
elements['acces-saisie-cloture'].hidden = false;
vm.runInContext('majBandeauCloture()', ctx);
ok(elements['cv-pub-cloture'].hidden === false, 'et il apparaît dès que le bouton est permis');
const srcPub = lire('js/admin-infos-publication.js');
ok(/afficherLienAccesScores\(etat\.lien \|\| ''\);\s*\n\s*majBandeauCloture\(\)/.test(srcPub),
  '⛔ il est calculé APRÈS la boucle des gestes, qui seule démasque le bouton');
ok(/bouton\.className = 'bouton' \+ \(g\.danger \? ' bouton-danger' : ' bouton-doux'\)/.test(srcPub),
  'les transitions restent secondaires à côté d’« Ouvrir la table de marque »');

/* --------------------------------------------------- 6) ecrans.js : déplacer, pas recréer */
const srcEcrans = lire('js/ecrans.js');
ok(/function preparerPublication\(\)/.test(srcEcrans), 'l’écran est assemblé par sa propre fonction');
ok(/const deplaces=\{\};[\s\S]{0,320}deplaces\['acces-saisie-lien'\]\.classList\.add/.test(srcEcrans),
  '⛔ la référence est gardée AVANT le déplacement : un conteneur pas encore rattaché sort ses ' +
  'enfants du document, et getElementById ne les retrouve plus');
ok(!/removeChild|\.remove\(\)\s*;?\s*\}?\s*\)\s*;?\s*\/\/\s*acces-saisie/.test(srcEcrans) &&
   /el\.hidden=true/.test(srcEcrans),
  '⛔ les conteneurs vidés sont MASQUÉS, jamais supprimés : d’autres modes d’affichage s’y accrochent');
/* Les commentaires CITENT majPublication() pour expliquer pourquoi on ne l'appelle pas :
   on les retire avant de chercher un APPEL, sinon le contrôle se trompe de cible. */
const ecransSansCommentaires = srcEcrans.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
ok(/majEtatPublicationAffiche/.test(srcEcrans) && !/majPublication\(\)/.test(ecransSansCommentaires),
  '⛔ l’écran repeint l’état sans rappeler majPublication(), qui relancerait une lecture réseau');

/* --------------------------------------------------- 7) ce qui part à l'imprimante */
const css = lire('css/theme-r92.css');
ok(/@media print[\s\S]{0,400}body\.cv-impression-affiche > \*:not\(\.cv-affiche-vue\)[\s\S]{0,60}display:none/.test(css),
  '⛔ l’impression ne garde QUE l’affiche : pas de fenêtre séparée, qu’un bloqueur supprimerait');
ok(/body\.cv-impression-affiche \.cv-affiche-barre \{ display:none/.test(css),
  'et les boutons de la vue ne s’impriment pas');
ok(/minmax\(min\(380px,100%\),1fr\)/.test(css),
  '⛔ la grille se réduit sous 380px au lieu de déborder la page');

console.log('OK — ' + controles + ' contrôles de l’écran Publication.');
