#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const racine = path.resolve(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(racine, rel), 'utf8');
const html = lire('admin.html');
const invitations = lire('js/admin-invitations.js');
const admin = lire('js/admin.js');
const ecrans = lire('js/ecrans.js');
const styles = lire('css/styles.css');

let total = 0;
let echecs = 0;
function verifier(libelle, condition) {
  total++;
  if (condition) console.log('  ✓ ' + libelle);
  else { echecs++; console.log('  ✗ ' + libelle); }
}

console.log('\nPièces jointes du dossier final');

const ordreInitial = ['bloc-contacts-securite', 'bloc-pieces-jointes-invitation', 'bloc-surplace']
  .map((id) => ecrans.indexOf("'" + id + "'"));
verifier('le module initial est placé juste avant « Sur place »', ordreInitial.every((p, i) => p !== -1 && (!i || p > ordreInitial[i - 1])));
verifier('les deux sélections de fichiers sont indépendantes', /let piecesJointesDossier = \[\];\s*let piecesJointesInvitation = \[\];/.test(invitations));
const ordre = ['bloc-encadrement', 'bloc-pieces-jointes-dossier', 'bloc-dossier']
  .map((id) => html.indexOf('id="' + id + '"'));
verifier('le bloc est placé juste avant « Dossier complet »', ordre.every((p, i) => p !== -1 && (!i || p > ordre[i - 1])));
verifier('le sélecteur accepte plusieurs documents', /id="pieces-jointes-dossier"[\s\S]*?multiple/.test(html));
verifier('les formats usuels sont annoncés sans exécutable', /accept="[^"]*\.pdf[^"]*\.docx[^"]*\.xlsx[^"]*\.png/.test(html) && !/accept="[^"]*\.exe/.test(html));
verifier('l’absence de stockage Sheet/Drive est expliquée', /sans être enregistrés dans le Google Sheet ni dans Drive/.test(html));
verifier('le menu Dossier final conserve l’ordre demandé', /'bloc-encadrement',\s*'bloc-pieces-jointes-dossier',\s*'bloc-dossier'/.test(ecrans));
verifier('l’initialisation branche la zone de fichiers', /brancherPiecesJointesDossier\(\)/.test(admin));
verifier('les limites client sont présentes', /DOSSIER_PJ_MAX_FICHIERS = 5/.test(invitations) && /DOSSIER_PJ_MAX_OCTETS_TOTAL = 10 \* 1024 \* 1024/.test(invitations));
verifier('le contenu est réellement lu avant envoi', /new FileReader\(\)/.test(invitations) && /readAsDataURL\(fichier\)/.test(invitations));
verifier('le glisser-déposer et le retrait individuel sont gérés', /addEventListener\('drop'/.test(invitations) && /piece-jointe-retirer/.test(invitations));
verifier('la sélection seule ne déclenche aucun POST', !/async function ajouterPiecesJointesDossier[\s\S]*?ecrireAdmin\(/.test(
  invitations.slice(invitations.indexOf('async function ajouterPiecesJointesDossier'), invitations.indexOf('function piecesJointesDossierPourEnvoi'))
));
verifier('la fenêtre d’envoi récapitule les fichiers', /const resumePieces = piecesAEnvoyer\.length/.test(invitations));
verifier('les pièces sont transmises uniquement avec envoyerDossierEmail', /ecrireAdmin\('envoyerDossierEmail',[\s\S]*?pieces_jointes: piecesAEnvoyer/.test(invitations));
verifier('l’envoi individuel transmet les pièces de l’invitation', /ecrireAdmin\('envoyerInvitationClub',[\s\S]*?pieces_jointes: piecesAEnvoyer/.test(invitations));
verifier('l’envoi groupé transmet la même sélection', /ecrireAdmin\('envoyerInvitationsGroupe',[\s\S]*?pieces_jointes: piecesAEnvoyer/.test(invitations));
verifier('la présentation de la liste et du récapitulatif existe', /\.piece-jointe-dossier/.test(styles) && /\.eml-pieces-jointes/.test(styles));

if (echecs) {
  console.error('\nÉCHEC — ' + echecs + ' contrôle(s) en défaut sur ' + total + '.');
  process.exit(1);
}
console.log('\nOK — ' + total + ' contrôles passés.');
