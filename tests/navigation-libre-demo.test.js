#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
const source = lire('js/ecrans.js');
const styles = lire('css/ecrans.css');
const html = lire('admin.html');
let controles = 0;
function vrai(valeur, message) { assert.ok(valeur, message); controles++; }
function egal(recu, attendu, message) {
  const normalise = valeur => (valeur && typeof valeur === 'object')
    ? JSON.parse(JSON.stringify(valeur)) : valeur;
  assert.deepStrictEqual(normalise(recu), normalise(attendu), message);
  controles++;
}

function classes() {
  const valeurs = new Set();
  return {
    add(nom) { valeurs.add(nom); },
    remove(...noms) { noms.forEach(nom => valeurs.delete(nom)); },
    toggle(nom, force) {
      if (force === undefined ? !valeurs.has(nom) : force) valeurs.add(nom);
      else valeurs.delete(nom);
    },
    contains(nom) { return valeurs.has(nom); }
  };
}

const ids = vm.runInNewContext(
  source.slice(source.indexOf('const ECRANS_DEF'), source.indexOf('];', source.indexOf('const ECRANS_DEF')) + 2) +
  '\nECRANS_DEF.map(function (e) { return e.id; });'
);
const ecrans = {};
const boutons = {};
const pastilles = {};
ids.forEach(function (id) {
  ecrans[id] = { hidden: true };
  boutons[id] = {
    attributs: { 'data-ecran': id }, classList: classes(), title: '',
    getAttribute(nom) { return this.attributs[nom]; },
    setAttribute(nom, valeur) { this.attributs[nom] = String(valeur); },
    removeAttribute(nom) { delete this.attributs[nom]; },
    scrollIntoView() {}
  };
  pastilles[id] = { hidden: true, textContent: '', innerHTML: '', classList: classes() };
});

const ouvertures = [];
const documentFaux = {
  body: { classList: classes() },
  getElementById(id) {
    if (id === 'ecrans') return {};
    if (id.startsWith('ecran-')) return ecrans[id.slice(6)] || null;
    if (id.startsWith('ecr-pastille-')) return pastilles[id.slice(13)] || null;
    return null;
  },
  querySelectorAll(selecteur) {
    return selecteur === '.ecr-onglet' ? Object.values(boutons) : [];
  },
  querySelector(selecteur) {
    const match = /^\.ecr-onglet\[data-ecran="([^"]+)"\]$/.exec(selecteur);
    return match ? boutons[match[1]] || null : null;
  }
};
const etats = [
  'horaires', 'categories', 'equipes', 'terrains', 'poules', 'apresmidi'
].map(cle => ({ cle, titre: cle, detail: 'à faire', statut: 'afaire' }));
const contexte = vm.createContext({
  console,
  document: documentFaux,
  window: { scrollTo() {}, matchMedia: () => ({ matches: true }) },
  calculerEtatsEtapes: () => etats,
  ouvrirEtapeAdmin: id => ouvertures.push(id),
  echapper: valeur => String(valeur)
});
vm.runInContext(source, contexte, { filename: 'js/ecrans.js' });

console.log('\nNavigation libre de la barre latérale pour la démo');
egal(ids.length, 16, 'les 16 onglets actuels, dont le DPS et la demande municipale, sont couverts');
ids.forEach(function (id) {
  contexte.ecransActiver(id, { sansScroll: true });
  vrai(ecrans[id].hidden === false, '« ' + id + ' » s’ouvre même lorsque tout reste à faire');
  vrai(boutons[id].classList.contains('est-actif'), '« ' + id + ' » devient l’onglet actif');
  vrai(!boutons[id].classList.contains('est-verrouille'), '« ' + id + ' » n’est jamais marqué verrouillé');
  vrai(!Object.prototype.hasOwnProperty.call(boutons[id].attributs, 'aria-disabled'),
    '« ' + id + ' » reste accessible aux technologies d’assistance');
});
egal(ouvertures, ids, 'chaque navigation conserve son chargement différé habituel');
vrai(Object.values(pastilles).every(p => !p.classList.contains('est-verrou') && !String(p.innerHTML).includes('🔒')),
  'aucune pastille ne devient un cadenas');
vrai(!source.includes("svgIcone('verrou')") && !source.includes('ecr-verrou-msg'),
  'le rendu de la sidebar ne contient plus de cadenas ni de message de verrou');
vrai(!styles.includes('.ecr-onglet.est-verrouille') && !styles.includes('.ecr-pastille.est-verrou'),
  'les styles de verrou devenus inutiles ont disparu');
vrai(html.includes('js/ecrans.js?v=refonte-ciel-verre-20260920') &&
  html.includes('css/ecrans.css?v=refonte-ciel-verre-20260920'),
  'le navigateur recharge bien la nouvelle navigation et ses styles');
vrai(source.includes('majVerrouPublier') && source.includes('Le garde-fou métier n\'est PAS supprimé'),
  'la liberté de navigation ne prétend pas retirer le verrou métier de publication');

console.log('OK — ' + controles + '/' + controles + ' contrôles passés.');
