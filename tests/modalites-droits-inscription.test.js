#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const racine = path.resolve(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(racine, rel), 'utf8');
const html = lire('admin.html');
const source = lire('js/admin-autorisation.js');
const invitations = lire('js/admin-invitations.js');
const dossier = lire('js/dossier.js');

let total = 0;
let echecs = 0;
function verifier(libelle, condition) {
  total++;
  if (condition) console.log('  ✓ ' + libelle);
  else { echecs++; console.log('  ✗ ' + libelle); }
}

function echapper(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

const bac = vm.createContext({
  console, echapper,
  document: { addEventListener() {} },
  configCourante: { global: {}, categories: [] }
});
vm.runInContext(source, bac, { filename: 'js/admin-autorisation.js' });

console.log('\nModalités d’inscription → B.5 droits d’inscription');

const bloc = html.slice(html.indexOf('<form id="form-modalites">'), html.indexOf('</form>', html.indexOf('<form id="form-modalites">')));
const posTarif = bloc.indexOf('Un tarif d\'engagement est demandé');
const posDate = bloc.indexOf('Date limite de paiement');
verifier('la case tarif est placée avant la date limite', posTarif !== -1 && posDate > posTarif);
verifier('l’ancien libellé de confirmation a disparu de la carte', bloc.indexOf('Date limite de confirmation') === -1);
verifier('la carte Réponse distingue maintenant réponse et paiement',
  html.includes('distincte de la date limite de\n          <em>paiement</em>') && !html.includes('confirmation des effectifs'));
verifier('le nom de champ historique est conservé pour la compatibilité des données', /name="date_limite_confirmation"/.test(bloc));

bac.configCourante.global = {
  tarif_engagement_oui: 'oui', tarif_engagement_montant: '50 € par équipe',
  org_droits_oui: 'non', org_droits_montant: '99'
};
let saisie = bac.rendreSaisieAutorisation(bac.questionsDejaRepondues({ sections: [] }));
verifier('B.5 Droits d’inscription reste visible dans les éléments de saisie', /name="org_droits_oui"/.test(saisie));
verifier('le tarif coché impose automatiquement Droits d’inscription = oui',
  /name="org_droits_oui"[\s\S]*?<option value="oui" selected>oui<\/option>/.test(saisie));
verifier('le montant des modalités remplace une ancienne valeur B.5',
  /name="org_droits_montant" value="50"/.test(saisie) && !/name="org_droits_montant" value="99"/.test(saisie));
verifier('l’origine automatique est expliquée dans la saisie', saisie.includes('repris automatiquement des modalités d\'inscription'));

bac.configCourante.global = { tarif_engagement_oui: 'non', tarif_engagement_montant: '50 €' };
saisie = bac.rendreSaisieAutorisation(bac.questionsDejaRepondues({ sections: [] }));
verifier('sans tarif, Droits d’inscription passe à non et Montant / équipe est désactivé',
  /name="org_droits_oui"[\s\S]*?<option value="non" selected>non<\/option>/.test(saisie) &&
  /name="org_droits_montant"[^>]* disabled/.test(saisie));

verifier('les emails initial et final parlent désormais de date limite de paiement',
  /ligneJ\([^\n]*'Date limite de paiement'/.test(invitations) &&
  /ligne\([^\n]*'Date limite de paiement'/.test(invitations) &&
  invitations.includes("Date limite de paiement : ") &&
  !invitations.includes('Confirmation des effectifs avant le') &&
  !invitations.includes('Confirmation attendue avant le'));
verifier('le dossier club regroupe la date limite avec le paiement sans carte redondante',
  dossier.includes("rappelPaiement.push('À régler avant le '") &&
  dossier.includes('g.date_limite_confirmation') &&
  !dossier.includes('sectionModalites(g)') &&
  !dossier.includes('Confirmation attendue avant le'));
verifier('le PDF donne la priorité au tarif courant pour B.5',
  source.includes("var droitsOuiEff = tarifOuiP || v('org_droits_oui');") &&
  source.includes("tarifOuiP === 'oui' && mTarifP"));

if (echecs) {
  console.error('\nÉCHEC — ' + echecs + ' contrôle(s) en défaut sur ' + total + '.');
  process.exit(1);
}
console.log('\nOK — ' + total + '/' + total + ' contrôles passés.');
