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

function blocsEtape(source, id) {
  const ligne = source.split('\n').find(l => l.includes("id: '" + id + "'"));
  assert.ok(ligne, 'étape ' + id + ' introuvable');
  const liste = ligne.match(/blocs:\s*\[([^\]]+)\]/);
  assert.ok(liste, 'liste de blocs ' + id + ' introuvable');
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
const ordreEcran = ['bloc-clubs-invites', 'bloc-invitation-initiale', 'bloc-dossier-final'];
const ordreInterieur = [
  'bloc-modalites',
  'bloc-reponse',
  'bloc-contacts-securite',
  'bloc-pieces-jointes-invitation',
  'bloc-surplace',
  'bloc-apercu-invitation'
];
const ordreDossier = ['bloc-parking', 'bloc-encadrement', 'bloc-pieces-jointes-dossier', 'bloc-dossier', 'bloc-apercu-dossier-email'];

egal(blocsEtape(ecrans, 'invitation'), ordreEcran, 'ordinateur : Clubs invités précède le dépliant');
egal(blocsEtape(assistant, 'invitation'), ordreEcran, 'mobile : Clubs invités précède le dépliant');
vrai(!/\{ id: 'dossier'[,}]/.test(ecrans), 'ordinateur : l’item Dossier a quitté la barre latérale');
vrai(!/\{ id: 'dossier'[,}]/.test(assistant), 'mobile : l’étape Dossier a quitté le parcours');

const page = noeud('page', 'main');
['bloc-contacts-securite', 'bloc-modalites', 'bloc-clubs-invites', 'bloc-apercu-invitation',
  'bloc-surplace', 'bloc-reponse', 'bloc-pieces-jointes-invitation', 'bloc-parking', 'bloc-encadrement', 'bloc-pieces-jointes-dossier', 'bloc-dossier',
  'bloc-apercu-dossier-email']
  .forEach(id => page.appendChild(noeud(id)));
const contexte = vm.createContext({
  document: {
    getElementById: id => trouver(page, id),
    createElement: balise => noeud('', balise)
  }
});
const sourceGroupe = blocEquilibre(ecrans, 'const INVITATION_INITIALE_BLOCS', '[', ']') + '\n' +
  blocEquilibre(ecrans, 'const DOSSIER_FINAL_BLOCS', '[', ']') + '\n' +
  blocEquilibre(ecrans, 'function preparerInvitationInitiale(', '{', '}') + '\n' +
  blocEquilibre(ecrans, 'function preparerDossierFinal(', '{', '}');
vm.runInContext(sourceGroupe, contexte);
const groupe = contexte.preparerInvitationInitiale();
const dossier = contexte.preparerDossierFinal();

egal(page.children.map(n => n.id), ordreEcran,
  'la page montre Clubs invités puis les deux dépliants');
egal(groupe.tagName, 'DETAILS', 'le menu emploie le composant dépliant natif');
vrai(!Object.prototype.hasOwnProperty.call(groupe, 'open'), 'le dépliant est fermé par défaut');
egal(groupe.children[0].tagName, 'SUMMARY', 'le dépliant possède un intitulé accessible');
egal(groupe.children[0].textContent, 'Invitation initiale', 'l’intitulé demandé est présent');
egal(groupe.children.slice(1).map(n => n.id), ordreInterieur,
  'les cartes suivent exactement l’ordre demandé');
egal(dossier.tagName, 'DETAILS', 'le dossier final emploie le composant dépliant natif');
vrai(!Object.prototype.hasOwnProperty.call(dossier, 'open'), 'le dossier final est fermé par défaut');
egal(dossier.children[0].textContent, 'Dossier final', 'le second dépliant porte le titre demandé');
egal(dossier.children.slice(1).map(n => n.id), ordreDossier,
  'le dossier final place l’aperçu après ses trois cartes de contenu');

const memeGroupe = contexte.preparerInvitationInitiale();
const memeDossier = contexte.preparerDossierFinal();
vrai(memeGroupe === groupe, 'une seconde préparation réutilise le même dépliant');
vrai(memeDossier === dossier, 'une seconde préparation réutilise le même dossier final');
egal(groupe.children.slice(1).map(n => n.id), ordreInterieur,
  'une seconde préparation ne duplique ni ne désordonne les cartes');
egal(dossier.children.slice(1).map(n => n.id), ordreDossier,
  'une seconde préparation ne duplique ni ne désordonne le dossier final');

const construireEcrans = blocEquilibre(ecrans, 'function construireEcrans(', '{', '}');
const construireAssistant = blocEquilibre(assistant, 'function construireAssistant(', '{', '}');
vrai(construireEcrans.indexOf('preparerInvitationInitiale();') < construireEcrans.indexOf('ECRANS_DEF.forEach(function (e)'),
  'ordinateur : le dépliant est préparé avant le déplacement des blocs');
vrai(construireEcrans.indexOf('preparerDossierFinal();') < construireEcrans.indexOf('ECRANS_DEF.forEach(function (e)'),
  'ordinateur : le dossier final est préparé avant le déplacement des blocs');
vrai(construireAssistant.indexOf("typeof preparerInvitationInitiale === 'function'") <
  construireAssistant.indexOf('ASSISTANT_ETAPES.forEach(function (et, i)'),
  'mobile : le dépliant est préparé avant le déplacement des blocs');
vrai(construireAssistant.indexOf("typeof preparerDossierFinal === 'function'") <
  construireAssistant.indexOf('ASSISTANT_ETAPES.forEach(function (et, i)'),
  'mobile : le dossier final est préparé avant le déplacement des blocs');
vrai(html.includes('toutes les cartes du menu « Invitation initiale »'),
  'le texte de l’aperçu décrit sa nouvelle source complète');
vrai(html.includes('id="bloc-apercu-dossier-email"') && html.includes("n'envoie et n'enregistre rien</strong>"),
  'le menu Dossier final contient son aperçu permanent et non destructif');

console.log('OK — ' + controles + ' contrôles passés.');
