/* Réorganisation de l'écran « Inviter un club » : ordre et dépliant partagés desktop/mobile.
 * Aucun navigateur, aucun réseau : node tests/reorganisation-invitation.test.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;

function egal(reel, attendu, message) {
  assert.deepEqual(reel, attendu, message);
  controles++;
}

function vrai(condition, message) {
  assert.ok(condition, message);
  controles++;
}

function blocEquilibre(source, debut, ouvrant, fermant) {
  const position = source.indexOf(debut);
  assert.notEqual(position, -1, 'déclaration introuvable : ' + debut);
  const ouverture = source.indexOf(ouvrant, position);
  let profondeur = 0;
  for (let i = ouverture; i < source.length; i++) {
    if (source[i] === ouvrant) profondeur++;
    if (source[i] === fermant && --profondeur === 0) return source.slice(position, i + 1) + ';';
  }
  throw new Error('bloc non fermé : ' + debut);
}

function blocsInvitation(source) {
  const ligne = source.split('\n').find(l => l.includes("id: 'invitation'"));
  assert.ok(ligne, 'étape invitation introuvable');
  const liste = ligne.match(/blocs:\s*\[([^\]]+)\]/);
  assert.ok(liste, 'liste de blocs invitation introuvable');
  return [...liste[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

function noeud(id, balise) {
  const n = {
    id: id || '',
    tagName: (balise || 'section').toUpperCase(),
    className: '',
    textContent: '',
    parentNode: null,
    children: [],
    appendChild(enfant) {
      if (enfant.parentNode) enfant.parentNode.removeChild(enfant);
      this.children.push(enfant);
      enfant.parentNode = this;
      return enfant;
    },
    removeChild(enfant) {
      const i = this.children.indexOf(enfant);
      if (i !== -1) this.children.splice(i, 1);
      enfant.parentNode = null;
      return enfant;
    },
    insertBefore(enfant, reference) {
      if (enfant.parentNode) enfant.parentNode.removeChild(enfant);
      const i = reference ? this.children.indexOf(reference) : -1;
      this.children.splice(i === -1 ? this.children.length : i, 0, enfant);
      enfant.parentNode = this;
      return enfant;
    }
  };
  Object.defineProperty(n, 'nextSibling', {
    get() {
      if (!this.parentNode) return null;
      return this.parentNode.children[this.parentNode.children.indexOf(this) + 1] || null;
    }
  });
  return n;
}

function trouver(racineDom, id) {
  if (racineDom.id === id) return racineDom;
  for (const enfant of racineDom.children) {
    const resultat = trouver(enfant, id);
    if (resultat) return resultat;
  }
  return null;
}

const ecrans = lire('js/ecrans.js');
const assistant = lire('js/assistant.js');
const html = lire('admin.html');
const ordreEcran = ['bloc-clubs-invites', 'bloc-invitation-initiale'];
const ordreInterieur = [
  'bloc-modalites',
  'bloc-reponse',
  'bloc-surplace',
  'bloc-apercu-invitation'
];

egal(blocsInvitation(ecrans), ordreEcran, 'ordinateur : Clubs invités précède le dépliant');
egal(blocsInvitation(assistant), ordreEcran, 'mobile : Clubs invités précède le dépliant');

const page = noeud('page', 'main');
['bloc-modalites', 'bloc-clubs-invites', 'bloc-apercu-invitation', 'bloc-surplace', 'bloc-reponse']
  .forEach(id => page.appendChild(noeud(id)));
const contexte = vm.createContext({
  document: {
    getElementById: id => trouver(page, id),
    createElement: balise => noeud('', balise)
  }
});
const sourceGroupe = blocEquilibre(ecrans, 'const INVITATION_INITIALE_BLOCS', '[', ']') + '\n' +
  blocEquilibre(ecrans, 'function preparerInvitationInitiale(', '{', '}');
vm.runInContext(sourceGroupe, contexte);
const groupe = contexte.preparerInvitationInitiale();

egal(page.children.map(n => n.id), ['bloc-clubs-invites', 'bloc-invitation-initiale'],
  'la page montre Clubs invités puis le dépliant');
egal(groupe.tagName, 'DETAILS', 'le menu emploie le composant dépliant natif');
vrai(!Object.prototype.hasOwnProperty.call(groupe, 'open'), 'le dépliant est fermé par défaut');
egal(groupe.children[0].tagName, 'SUMMARY', 'le dépliant possède un intitulé accessible');
egal(groupe.children[0].textContent, 'Invitation initiale', 'l’intitulé demandé est présent');
egal(groupe.children.slice(1).map(n => n.id), ordreInterieur,
  'les quatre cartes suivent exactement l’ordre demandé');

const memeGroupe = contexte.preparerInvitationInitiale();
vrai(memeGroupe === groupe, 'une seconde préparation réutilise le même dépliant');
egal(groupe.children.slice(1).map(n => n.id), ordreInterieur,
  'une seconde préparation ne duplique ni ne désordonne les cartes');

vrai(ecrans.indexOf('preparerInvitationInitiale();') < ecrans.indexOf('ECRANS_DEF.forEach(function (e)'),
  'ordinateur : le dépliant est préparé avant le déplacement des blocs');
vrai(assistant.indexOf("typeof preparerInvitationInitiale === 'function'") <
  assistant.indexOf('ASSISTANT_ETAPES.forEach(function (et, i)'),
  'mobile : le dépliant est préparé avant le déplacement des blocs');
vrai(html.includes("« Réponse à l'invitation »</strong>\n          de ce menu"),
  'le texte de l’aperçu décrit correctement la nouvelle position des cartes');

console.log('OK — ' + controles + ' contrôles passés.');
