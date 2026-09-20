#!/usr/bin/env node
/**
 * Non-régression — écran « Suivi des clubs » : tableau à sept colonnes + fiche latérale.
 *
 *  1) Assemblage (ecrans.js) : le résumé, les filtres et la liste sont DÉPLACÉS dans une barre
 *     d'outils et gardent leurs identifiants ; le PDF reste au niveau de l'ÉCRAN (il couvre tous
 *     les clubs participants, pas celui de la fiche) ; le panneau latéral est le seul nœud créé.
 *  2) Tableau (admin-suivi-clubs.js) : sept colonnes dont « Montant », des valeurs comparables,
 *     et l'état d'inscription ÉCRIT à côté du liseré coloré — jamais la couleur seule.
 *  3) Fiche : la commande détaillée ligne à ligne, frais d'inscription COMPRIS, dont la somme
 *     fait exactement le total annoncé. Un club qui n'a pas accepté n'a pas de commande, ni dans
 *     la ligne ni dans la fiche — les deux ne doivent jamais se contredire.
 *  4) Sélection : portée par le module, elle survit aux rendus ; un club sorti du filtre ferme
 *     la fiche ; ouvrir une fiche ne déclenche AUCUNE lecture réseau.
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
ok(/function preparerSuiviClubs\(/.test(ecrans), 'ecrans.js prépare l’écran Suivi');
ok(ecrans.includes(' preparerSuiviClubs();'), 'preparerSuiviClubs est appelé à la construction de l’écran');
ok(ecrans.includes("barre.appendChild(document.getElementById('suivi-clubs-filtres'))"),
  'la barre de filtres est DÉPLACÉE, pas recréée : ses boutons gardent leur contrat data-filtre');
ok(ecrans.includes("fiche.id='cv-fiche-club'") && ecrans.includes("ecran.appendChild(fiche)"),
  'le panneau latéral est posé au niveau de l’ÉCRAN, à côté du bloc');
ok(ecrans.includes("droite.appendChild(pdf)"),
  'le PDF reste dans la barre d’outils de l’écran — il couvre TOUS les clubs participants');
ok(ecrans.includes("petit.className='cv-sr'") && ecrans.includes("bouton.setAttribute('aria-describedby','aide-pdf-suivi')"),
  'la portée du PDF reste annoncée aux lecteurs d’écran quand le libellé raccourcit');

const html = lire('admin.html');
['bloc-suivi-clubs', 'suivi-clubs-resume', 'suivi-clubs-filtres', 'liste-suivi-clubs',
 'message-suivi-clubs', 'bouton-pdf-suivi-restauration'
].forEach(function (id) { ok(html.includes('id="' + id + '"'), 'admin.html conserve #' + id); });

/* ------------------------------------------------------------- 2) 3) et 4) */
function noeud() {
  return { innerHTML: '', textContent: '', closest: () => null,
    classList: { toggle() {}, add() {}, remove() {} },
    querySelector: () => null, querySelectorAll: () => [] };
}
const dom = {
  'suivi-clubs-resume': noeud(), 'suivi-clubs-filtres': noeud(), 'liste-suivi-clubs': noeud(),
  'message-suivi-clubs': noeud(), 'cv-fiche-club': noeud()
};
const lectures = [];
const ctx = vm.createContext({
  console, setTimeout,
  document: { getElementById: (id) => dom[id] || null, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [] },
  configCourante: { global: {
    repas_sur_place_oui: 'oui', repas_sur_place_mode: 'prix_personne',
    gouter_fin_tournoi_oui: 'oui', gouter_fin_tournoi_mode: 'prix_personne'
  } },
  clubsInvitesCourants: [],
  equipesCourantes: [],
  echapper: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
  estOui: (v) => String(v).toLowerCase() === 'oui',
  memeTexteSouple: (a, b) => String(a || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() ===
    String(b || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(),
  estAccepte: (v) => ['accepte', 'confirme'].includes(String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()),
  afficherMessage() {},
  ecrireAdmin: async (action) => { lectures.push(action); return {}; },
  etatClubInvite: (club) => {
    if (String(club.statut || '').toLowerCase().startsWith('décl')) return 'decline';
    if (['accepte', 'confirme'].includes(String(club.statut || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())) {
      return club.equipes_ajoutees ? 'equipes-ajoutees' : 'a-enregistrer';
    }
    return 'attente';
  },
  dossierFinalDisponible: (club) => !!club.equipes_ajoutees,
  LIBELLES_ETAT_CLUB: { 'a-enregistrer': 'Équipes à ajouter', 'attente': 'En attente de réponse',
    'equipes-ajoutees': 'Équipes ajoutées', 'decline': 'Déclinée' }
});
vm.runInContext(lire('js/vendor/pdf-lib.min.js'), ctx, { filename: 'js/vendor/pdf-lib.min.js' });
vm.runInContext(lire('js/admin-suivi-clubs.js'), ctx, { filename: 'js/admin-suivi-clubs.js' });

/* Une commande figée COMPLÈTE, telle que le backend l'écrit : prix unitaires compris. */
const commande = {
  inscription: { mode: 'par_equipe', nb_equipes: 2, prix_unitaire: '95.00', sous_total: '190.00' },
  repas: { joueurs: 22, educateurs: 4, prix_unitaire: '5.00', sous_total: '130.00' },
  gouter: { joueurs: 18, educateurs: 0, prix_unitaire: '5.00', sous_total: '90.00' },
  total: '410.00'
};
const clubs = [
  { club_nom: 'RC BOULOGNE', club_contact_email: 'rc@test.invalid', statut: 'Invité',
    invitation_envoyee: '2026-09-01' },
  { club_nom: 'VÉLIZY', club_contact_email: 've@test.invalid', statut: 'Accepté',
    date_reponse: '2026-09-08 10:15', equipes_ajoutees: true,
    nb_joueurs_total: '13', nb_educateurs_total: '2',
    confirmation_reponse_envoyee: '2026-09-08 10:20',
    detail_effectifs: JSON.stringify({ _restauration: commande }) },
  { club_nom: 'CLAMART', club_contact_email: 'cl@test.invalid', statut: 'Accepté',
    date_reponse: '2026-09-09', equipes_ajoutees: true, paiement_statut: 'Payé', date_paiement: '2026-09-15',
    confirmation_reponse_envoyee: '2026-09-09 09:00',
    detail_effectifs: JSON.stringify({ _restauration: commande }) }
];
ctx.clubsInvitesCourants = clubs;
vm.runInContext('clubsInvitesCourants = globalThis.clubsInvitesCourants;', ctx);
vm.runInContext('afficherSuiviClubs()', ctx);
const table = dom['liste-suivi-clubs'].innerHTML;

/* --- Les sept colonnes de la maquette, et « Montant » qui n'existait pas. */
egal(['Club', 'Réponse', 'Repas', 'Goûters', 'Montant', 'Paiement', 'Action']
  .filter((c) => table.includes('<span role="columnheader">' + c + '</span>')).length, 7,
  'les sept colonnes de la maquette sont là');
ok(table.includes('data-label="Montant">410 €<'), 'le montant dû a sa propre colonne');
ok(table.includes('data-label="Repas" title="26 repas">26<') &&
  table.includes('data-label="Goûters" title="18 goûters">18<'),
  'les quantités sont des nombres, le libellé long restant au survol');

/* --- Un club qui n'a pas accepté ne porte aucun chiffre, et le DIT. */
const ligneRC = table.slice(table.indexOf('data-club="RC BOULOGNE"'), table.indexOf('data-club="VÉLIZY"'));
ok(ligneRC.includes('data-label="Montant">—<') && ligneRC.includes('data-label="Repas" title="Le club n’a pas encore accepté">—<'),
  '⛔ aucun montant ni quantité pour un club sans réponse');
ok(ligneRC.includes('<span class="suivi-badge est-neutre">Non concerné</span>'),
  'son paiement est « Non concerné », pas « À payer »');

/* --- Jamais la couleur seule : le liseré d'état est doublé de sa pastille écrite. */
ok(table.includes('class="suivi-club-ligne club-etat-attente" data-club="RC BOULOGNE"'),
  'la ligne porte sa classe d’état, immédiatement suivie de son club');
ok(table.includes('<span class="suivi-badge etat-attente">En attente de réponse</span>'),
  'et l’état est ÉCRIT dans la cellule du club');
ok(table.includes('<span class="suivi-avatar" aria-hidden="true">RC</span>'),
  'la vignette reprend le début du nom, et reste hors du texte lu');

/* --- Chaque ligne ouvre SA fiche, par le contrat délégué data-action / data-club. */
egal((table.match(/data-action="ouvrir-fiche" data-club="/g) || []).length, 3,
  'un bouton « Ouvrir » par club');

/* --- Résumé et filtres : quatre compteurs, cinq filtres, chacun avec son compte. */
const resume = dom['suivi-clubs-resume'].innerHTML;
['Réponses attendues', 'Participants', 'Ne participent pas', 'Paiements attendus'].forEach(function (l) {
  ok(resume.includes('<span>' + l + '</span>'), 'compteur « ' + l + ' »');
});
const filtres = dom['suivi-clubs-filtres'].innerHTML;
egal((filtres.match(/class="suivi-filtre /g) || []).length, 5,
  'les cinq filtres sont conservés — « Oui » et « Non » n’ont pas disparu');
ok(filtres.includes('>Tous<span class="suivi-filtre-compte">3</span>'),
  'chaque filtre porte son compte : on sait avant de cliquer');
/* ⚠️ Le compte est COLLÉ au libellé dans le HTML : sans aria-label, le nom accessible d'un
   filtre serait « Tous3 » et celui d'un compteur « 1Réponses attendues ». */
ok(filtres.includes('aria-label="Tous — 3 clubs"') && filtres.includes('aria-label="Non — 0 club"'),
  'chaque filtre porte un nom accessible où le compte est séparé du libellé');
ok(resume.includes('aria-label="1 réponses attendues"'),
  'et chaque compteur aussi');
ok(table.includes('aria-label="Ouvrir la fiche de RC BOULOGNE"'),
  'les cinq boutons « Ouvrir » se distinguent par leur club');
ok(filtres.includes('data-filtre="paiement"') && filtres.includes('>Paiements<span class="suivi-filtre-compte">1</span>'),
  'un seul paiement est attendu (VÉLIZY), CLAMART étant payé');

/* --- La fiche : la commande ligne à ligne, et sa somme FAIT le total. */
vm.runInContext('suiviSelectionnerClub("VÉLIZY")', ctx);
egal(lectures, [], '⛔ ouvrir une fiche ne déclenche AUCUNE écriture ni lecture réseau');
const fiche = dom['cv-fiche-club'].innerHTML;
ok(fiche.includes('<span class="cv-fiche-avatar" aria-hidden="true">VÉ</span>'), 'la fiche porte la vignette du club');
ok(fiche.includes('>VÉLIZY</h3>') && fiche.includes('13 joueurs · 2 éducateurs'),
  'elle nomme le club et ses effectifs annoncés');
ok(fiche.includes('Confirmée le 08/09/2026 à 10:15'), 'la date de réponse est lisible et française');
const lignes = vm.runInContext('suiviLignesCommande(suiviClubEtat(clubsInvitesCourants[1]))', ctx);
egal(lignes.map((l) => l.libelle),
  ['Frais d’inscription', 'Repas joueurs', 'Repas éducateurs', 'Goûters'],
  'les frais d’inscription sont une ligne, et les repas se séparent quand les deux côtés commandent');
egal(lignes.map((l) => l.montant), [190, 110, 20, 90], 'chaque ligne porte son propre montant');
egal(lignes.reduce((s, l) => s + l.montant, 0),
  vm.runInContext('suiviClubCommande(clubsInvitesCourants[1]).total', ctx),
  '⭐ la somme des lignes FAIT le total annoncé — sans les frais d’inscription, la fiche se contredirait');
ok(fiche.includes('(22 × 5 €)') && fiche.includes('(2 équipes × 95 €)'),
  'le détail « quantité × prix unitaire » reprend les valeurs FIGÉES de la réponse');
ok(fiche.includes('<dt>Total</dt><dd>410 €</dd>'), 'le total est celui de la réponse, pas un recalcul');
ok(fiche.includes('Aucune preuve de paiement enregistrée.'), 'l’absence de preuve de paiement est dite');
ok(fiche.includes('data-action="marquer-paye"') && fiche.includes('data-action="relance-paiement"'),
  'les deux gestes de paiement sont là dès l’ouverture');
ok(fiche.includes('Ouvrir la fiche complète') && fiche.includes('id="cv-fiche-reste" hidden'),
  'le reste des actions attend un clic');

/* --- Ancienne réponse sans prix unitaire : une seule ligne, aucun prix inventé. */
const ancien = { club_nom: 'ANCIEN', statut: 'Accepté', equipes_ajoutees: true,
  detail_effectifs: JSON.stringify({ _restauration: {
    repas: { joueurs: 12, educateurs: 3, sous_total: '120' }, total: '120' } }) };
ctx.ancien = ancien;
const lignesAncien = vm.runInContext('suiviLignesCommande(suiviClubEtat(ancien))', ctx);
egal(lignesAncien.map((l) => [l.libelle, l.quantite, l.prix, l.montant]), [['Repas', 15, 0, 120]],
  '⛔ sans prix unitaire figé, une seule ligne et aucun « × 0 € » inventé');
ok(!vm.runInContext('suiviHtmlLignesCommande(suiviClubEtat(ancien))', ctx).includes('×'),
  'et le rendu n’affiche aucune multiplication');

/* --- La fiche suit la MÊME règle que la ligne : pas de commande sans acceptation. */
const ficheRC = vm.runInContext('suiviHtmlFiche(clubsInvitesCourants[0])', ctx);
ok(ficheRC.includes('Aucune commande : le club n’a pas encore répondu.'),
  '⛔ la fiche ne chiffre pas ce que la ligne d’à côté déclare absent');
ok(!ficheRC.includes('410 €'), 'aucun total pour un club sans réponse');

/* --- Un club DÉCLINÉ a répondu : on ne lui colle pas « n'a pas encore accepté ». */
const decline = { club_nom: 'PARTI', statut: 'Décliné', date_reponse: '2026-09-10' };
ctx.decline = decline;
egal(vm.runInContext('suiviQuantitePrestation("repas", suiviClubEtat(decline)).titre', ctx),
  'Le club ne participe pas', '⛔ un refus n’est pas une absence de réponse');
ok(vm.runInContext('suiviHtmlFiche(decline)', ctx).includes('Aucune commande : le club ne participe pas.'),
  'et sa fiche le dit dans les mêmes termes');

/* --- Le rappel du dossier bloqué est visible SANS second clic : c'est un blocage. */
const bloque = { club_nom: 'BLOQUÉ', statut: 'Accepté', equipes_ajoutees: false };
ctx.bloque = bloque;
const ficheBloque = vm.runInContext('suiviHtmlFiche(bloque)', ctx);
ok(ficheBloque.indexOf('suivi-rappel-equipes') < ficheBloque.indexOf('id="cv-fiche-reste"'),
  'le rappel « équipes à ajouter » est AVANT le dépliant, donc lu tout de suite');
ok(!vm.runInContext('suiviHtmlFiche(clubsInvitesCourants[1])', ctx).includes('suivi-rappel-equipes'),
  'et il ne s’affiche pas quand le dossier est débloqué');

/* --- La fiche complète ne répète pas la paire de paiement déjà montrée en tête. */
const reste = vm.runInContext('suiviActionsHtml(clubsInvitesCourants[1], suiviClubEtat(clubsInvitesCourants[1]), { sansPaiement: true })', ctx);
ok(!reste.includes('data-action="marquer-paye"'), '⛔ « Marquer payé » n’est pas proposé deux fois');
ok(vm.runInContext('suiviActionsHtml(clubsInvitesCourants[1], suiviClubEtat(clubsInvitesCourants[1]))', ctx)
  .includes('data-action="marquer-paye"'), 'mais il reste disponible hors de la fiche');

/* --- Sélection : portée par le module, elle survit au rendu. */
vm.runInContext('afficherSuiviClubs()', ctx);
ok(dom['cv-fiche-club'].innerHTML.includes('>VÉLIZY</h3>'),
  'un rendu complet ne referme pas la fiche ouverte');
ok(dom['liste-suivi-clubs'].innerHTML.includes('club-etat-equipes-ajoutees est-selectionne" data-club="VÉLIZY"'),
  'et la ligne choisie reste marquée');
/* --- Un club sorti du filtre ne peut pas rester ouvert à côté d'un tableau qui l'ignore. */
vm.runInContext('suiviClubsFiltre = "attente"; afficherSuiviClubs()', ctx);
ok(dom['cv-fiche-club'].innerHTML.includes('Choisissez un club'),
  'le club filtré referme la fiche, qui explique quoi faire');
ok(!dom['liste-suivi-clubs'].innerHTML.includes('est-selectionne'), 'et plus aucune ligne n’est marquée');
vm.runInContext('suiviClubsFiltre = "tous"; afficherSuiviClubs()', ctx);
ok(dom['cv-fiche-club'].innerHTML.includes('Choisissez un club'),
  '⛔ et revenir au filtre complet ne ressuscite pas une sélection abandonnée');

console.log('OK — ' + controles + ' contrôles passés.');
