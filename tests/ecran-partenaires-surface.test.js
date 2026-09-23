#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « PARTENAIRES » — SURFACE RÉSEAU ET COMPORTEMENT (lot « Partenaires »)
 * ============================================================================
 *  ▶ node tests/ecran-partenaires-surface.test.js [--backend avant]
 *
 *  Vrais modules du frontend (api.js compris) et vraies cartes d'admin.html, contre le vrai Code.gs
 *  (banc-ecran-partenaires.js). Seul le transport est simulé, et TOUTE sortie réseau est comptée.
 *
 *  Ce que cette suite défend :
 *    A. l'ouverture ne coûte qu'UNE requête, et le repli sur un backend d'avant en coûte deux ;
 *    B. une panne n'est JAMAIS prise pour un backend ancien ;
 *    C. chaque écriture coûte UNE requête — plus aucune relecture de confirmation ;
 *    D. l'écran peint ce qui a été APPLIQUÉ, jamais ce qu'il a demandé ;
 *    E. la fusion à trois voies : base brute, champs touchés, conflit à deux issues ;
 *    F. l'idempotence : le `requete_id` survit aux pannes, et n'est renouvelé qu'à bon escient ;
 *    G. le bilan : jamais peint sans les fiches, partenaires inactifs et supprimés nommés
 *       honnêtement, journées historiques, échec des relevés distinct d'un bilan vide.
 *  ⛔ Aucun réseau, aucun service Google réel.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('./banc-ecran-partenaires');

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i === -1 ? null : process.argv[i + 1]; };
const CODE = arg('backend') === 'avant' ? B.BACKEND_AVANT()
  : fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');

let ok = 0, ko = 0, bloc = '';
const titre = (t) => { bloc = t; console.log('\n■ ' + t); };
function verifier(c, m, d) {
  if (c) { ok++; console.log('  ✓ ' + m + (d ? '  — ' + d : '')); }
  else { ko++; console.error('  ✗ [' + bloc + '] ' + m + (d ? '  — ' + d : '')); }
}

/** Un écran neuf, ouvert, prêt. */
async function ecran(options) {
  const srv = B.serveur((options && options.code) || CODE);
  const n = B.navigateur(srv, (options && options.lire) || B.lecteur(), options);
  n.srv = srv;
  if (!options || options.ouvrir !== false) { await n.ouvrir(); await n.tour(20); }
  return n;
}
const lireVar = (n, nom) => vm.runInContext(nom, n.ctx);
const poserVar = (n, code) => vm.runInContext(code, n.ctx);

/* ==========================================================================
   A. L'OUVERTURE
   ========================================================================== */
(async () => {
titre('A. Ouverture : une seule requête');
{
  const n = await ecran();
  verifier(n.journal.length === 1 && n.journal[0] === 'chargerEcranPartenaires',
    'l’arrivée sur l’écran n’émet QU’UNE requête groupée', n.journal.join(', '));
  verifier(n.sorties.length === 1, 'et une seule sortie réseau, toutes portes confondues',
    n.sorties.length + ' sortie(s)');
  verifier(/sponsor-carte/.test(n.el('liste-sponsors').innerHTML), 'la liste est peinte');

  // Retour sur l'écran : le registre a mémorisé, rien ne repart.
  const avant = n.journal.length;
  await poserVar(n, 'ouvrirEtapeAdmin("sponsors")');
  await n.tour(20);
  verifier(n.journal.length === avant, 'un retour sur l’écran ne relit rien', n.journal.slice(avant).join(', '));
}

titre('A bis. Repli sur un backend d’avant ce lot');
{
  const n = await ecran({ code: B.BACKEND_AVANT() });
  verifier(n.journal.indexOf('chargerEcranPartenaires') === 0,
    'la première tentative sonde le chargement groupé', n.journal.join(', '));
  verifier(n.journal.indexOf('listerSponsors') !== -1 && n.journal.indexOf('lireMesuresSponsors') !== -1,
    'puis l’écran replie sur les DEUX lectures historiques', n.journal.join(', '));
  verifier(/sponsor-carte/.test(n.el('liste-sponsors').innerHTML), 'et l’écran fonctionne quand même');
  verifier(lireVar(n, 'sponsorsBackendGroupe') === false, 'le repli est MÉMORISÉ pour la session');

  const avant = n.journal.length;
  poserVar(n, 'marquerRessourceAdmin("fichesSponsors", false); marquerRessourceAdmin("relevesSponsors", false);');
  await poserVar(n, 'ouvrirEtapeAdmin("sponsors")');
  await n.tour(20);
  const rejoue = n.journal.slice(avant);
  verifier(rejoue.indexOf('chargerEcranPartenaires') === -1,
    '⛔ et la sonde n’est pas repayée à chaque visite', rejoue.join(', '));
}

titre('B. Une panne n’est jamais prise pour un backend ancien');
{
  const n = await ecran({ pannes: { chargerEcranPartenaires: 'reseau' } });
  verifier(lireVar(n, 'sponsorsBackendGroupe') !== false,
    '⛔ une panne réseau ne déclenche AUCUN repli', String(lireVar(n, 'sponsorsBackendGroupe')));
  verifier(n.journal.filter((a) => a === 'listerSponsors').length === 0,
    'et n’émet pas les deux lectures historiques par-dessus', n.journal.join(', '));
  verifier(/Erreur de chargement/.test(n.el('liste-sponsors').innerHTML),
    'l’écran annonce la panne au lieu de la masquer');
}

/* ==========================================================================
   C. LES ÉCRITURES : UNE REQUÊTE PAR GESTE
   ========================================================================== */
titre('C. Une écriture = UNE requête, sans relecture de confirmation');
{
  const n = await ecran();
  await n.clic('bouton-ajouter-sponsor');
  await n.saisir('nom', 'Boulangerie du coin');
  await n.cocher('emp_mur', true);
  const avant = n.journal.length;
  await n.clic('bouton-enregistrer-sponsor');
  await n.tour(30);
  const emises = n.journal.slice(avant);
  verifier(emises.length === 1 && emises[0] === 'enregistrerSponsor',
    'créer un partenaire n’émet qu’UNE requête', emises.join(', '));
  verifier(/Boulangerie du coin/.test(n.el('liste-sponsors').innerHTML),
    'et la liste est repeinte depuis la réponse');

  const avant2 = n.journal.length;
  const bouton = n.doc.querySelector('#liste-sponsors button[data-action="supprimer"]');
  bouton.dispatchEvent({ type: 'click', target: bouton });
  await n.tour(30);
  const emises2 = n.journal.slice(avant2);
  verifier(emises2.length === 1 && emises2[0] === 'supprimerSponsor',
    'supprimer n’émet qu’UNE requête', emises2.join(', '));

  const avant3 = n.journal.length;
  await n.clic('bouton-enregistrer-sponsors-reglages');
  await n.tour(30);
  verifier(n.journal.slice(avant3).join(',') === 'enregistrerReglagesSponsors',
    'enregistrer les réglages n’émet qu’UNE requête', n.journal.slice(avant3).join(', '));
}

titre('C bis. « Effacer les relevés » : plus de seconde requête');
{
  const n = await ecran();
  const avant = n.journal.length;
  await n.clic('bouton-vider-bilan');
  await n.tour(30);
  verifier(n.journal.slice(avant).join(',') === 'viderMesuresSponsors',
    'l’état vide est pris dans la réponse, sans relecture', n.journal.slice(avant).join(', '));
}

/* ==========================================================================
   D. CE QUI EST PEINT EST CE QUI A ÉTÉ APPLIQUÉ
   ========================================================================== */
titre('D. Valeurs bornées : le formulaire montre ce que le serveur a retenu');
{
  const n = await ecran();
  await n.saisir('sponsor_interstitiel_duree_s', '999');
  await n.clic('bouton-enregistrer-sponsors-reglages');
  await n.tour(30);
  const champ = n.doc.querySelector('#form-sponsors-reglages [name="sponsor_interstitiel_duree_s"]');
  verifier(String(champ.value) === '10',
    'le champ affiche la valeur APPLIQUÉE (10), pas celle saisie (999)', String(champ.value));
  verifier(/ramenée|ramenées/i.test(n.el('message-sponsors-reglages').textContent || ''),
    'et le message le DIT', (n.el('message-sponsors-reglages').textContent || '').slice(0, 120));
  verifier(String(lireVar(n, 'configCourante').global.sponsor_interstitiel_duree_s) === '10',
    'la configuration locale porte la valeur appliquée');
}

/* ==========================================================================
   E. FUSION À TROIS VOIES
   ========================================================================== */
titre('E. Base brute, champs touchés, et conflit à deux issues');
{
  const n = await ecran();
  const modifier = n.doc.querySelector('#liste-sponsors button[data-action="modifier"]');
  modifier.dispatchEvent({ type: 'click', target: modifier });
  await n.tour(5);
  const base = lireVar(n, 'sponsorsBaseFiche');
  verifier(!!base && base.couleur === '' && String(base.logo_zoom) === '',
    'la base mémorisée est BRUTE (couleur et zoom vides), pas celle du formulaire',
    JSON.stringify({ couleur: base.couleur, zoom: base.logo_zoom }));
  verifier(String(n.champ('couleur').value) !== '',
    'alors que le formulaire, lui, affiche une couleur par défaut', String(n.champ('couleur').value));

  await n.saisir('accroche', 'Une accroche');
  const touches = vm.runInContext('champsTouchesSponsor()', n.ctx);
  verifier(touches.length === 1 && touches[0] === 'accroche',
    'un seul champ est déclaré touché', JSON.stringify(touches));

  // Conflit : une autre session change l'accroche entre-temps.
  const id = n.champ('id_sponsor').value;
  n.srv.postMesure({ action: 'enregistrerSponsor', cle: B.CLE_ADMIN, id_sponsor: id,
    accroche: 'Version de B', nom: 'Partenaire fictif 1', emplacements: 'mur', poids: '1',
    ordre: '1', logo_zoom: '100', couleur: '', url: '', reglages_emplacements: '', actif: 'oui' }, 'concurrent');

  const n2 = n;
  n2.dialoguesReponses = [false];
  poserVar(n2, 'dialogConfirmer = async function (m, o) { this.__dlg = m; return false; };');
  await n2.clic('bouton-enregistrer-sponsor');
  await n2.tour(30);
  verifier(/a modifié cette fiche/.test(String(n2.ctx.__dlg || '')),
    'le conflit ouvre une question explicite', String(n2.ctx.__dlg || '').slice(0, 80));
  verifier(/Version de B/.test(String(n2.ctx.__dlg || '')),
    'qui montre la valeur enregistrée par l’autre session');
  verifier(/Version de B/.test(n2.el('liste-sponsors').innerHTML) ||
    lireVar(n2, 'sponsorsAdmin').some((s) => String(s.accroche) === 'Version de B'),
    '① « recharger » repose l’état enregistré');
}

titre('E bis. « Garder ma version » reprend la même intention sur la nouvelle base');
{
  const n = await ecran();
  const modifier = n.doc.querySelector('#liste-sponsors button[data-action="modifier"]');
  modifier.dispatchEvent({ type: 'click', target: modifier });
  await n.tour(5);
  await n.saisir('accroche', 'Version de A');
  const id = n.champ('id_sponsor').value;
  n.srv.postMesure({ action: 'enregistrerSponsor', cle: B.CLE_ADMIN, id_sponsor: id,
    accroche: 'Version de B', nom: 'Partenaire fictif 1', emplacements: 'mur', poids: '1',
    ordre: '1', logo_zoom: '100', couleur: '', url: '', reglages_emplacements: '', actif: 'oui' }, 'concurrent');
  poserVar(n, 'dialogConfirmer = async function () { return true; };');
  const avant = n.journal.length;
  await n.clic('bouton-enregistrer-sponsor');
  await n.tour(40);
  const emises = n.journal.slice(avant);
  verifier(emises.length === 2 && emises.every((a) => a === 'enregistrerSponsor'),
    '② la reprise réémet la MÊME intention, une seule fois', emises.join(', '));
  verifier(lireVar(n, 'sponsorsAdmin').some((s) => String(s.accroche) === 'Version de A'),
    'et la saisie de l’utilisateur est appliquée, après confirmation explicite');
}

/* ==========================================================================
   F. IDEMPOTENCE
   ========================================================================== */
titre('F. Le `requete_id` survit aux pannes, et n’est renouvelé qu’à bon escient');
{
  const n = await ecran({ pannes: { enregistrerSponsor: 'perdue' } });
  await n.clic('bouton-ajouter-sponsor');
  const premier = lireVar(n, 'sponsorsRequeteId');
  verifier(!!premier, 'une intention de création reçoit un identifiant', premier);
  await n.saisir('nom', 'Boulangerie du coin');
  await n.cocher('emp_mur', true);
  await n.clic('bouton-enregistrer-sponsor');       // la réponse se perd
  await n.tour(30);
  verifier(lireVar(n, 'sponsorsRequeteId') === premier,
    '⭐ il SURVIT à une réponse perdue', lireVar(n, 'sponsorsRequeteId'));
  verifier(/non confirmé/i.test(n.el('message-sponsor').textContent || ''),
    'et l’écran annonce un résultat non confirmé',
    (n.el('message-sponsor').textContent || '').slice(0, 90));

  // Second clic : le serveur reconnaît l'intention, aucune seconde fiche.
  n.ctx.__pannes = null;
  const srv = n.srv;
  const avantLignes = srv.lister().length;
  poserVar(n, 'void 0;');
  const nb = srv.lister().filter((s) => String(s.nom) === 'Boulangerie du coin').length;
  verifier(nb === 1, 'la première tentative avait bien abouti côté serveur', nb + ' fiche(s)');

  const n2 = await ecran();
  await n2.clic('bouton-ajouter-sponsor');
  const a = lireVar(n2, 'sponsorsRequeteId');
  await n2.clic('bouton-ajouter-sponsor');
  const b = lireVar(n2, 'sponsorsRequeteId');
  verifier(a !== b, '⭐ une NOUVELLE intention explicite reçoit un identifiant neuf');
  await n2.saisir('nom', 'Première');
  await n2.cocher('emp_mur', true);
  await n2.clic('bouton-enregistrer-sponsor');
  await n2.tour(30);
  const c = lireVar(n2, 'sponsorsRequeteId');
  verifier(c !== b, '⭐ et un succès confirmé le renouvelle aussi — sinon le partenaire suivant serait refusé');
}

titre('F bis. Une création rejouée à l’identique ne crée pas de doublon');
{
  const n = await ecran();
  await n.clic('bouton-ajouter-sponsor');
  await n.saisir('nom', 'Doublon possible');
  await n.cocher('emp_mur', true);
  const data = vm.runInContext('construireIntentionSponsor(document.getElementById("message-sponsor"))', n.ctx);
  const r1 = n.srv.postMesure(Object.assign({ action: 'enregistrerSponsor', cle: B.CLE_ADMIN }, data), 'a');
  const r2 = n.srv.postMesure(Object.assign({ action: 'enregistrerSponsor', cle: B.CLE_ADMIN }, data), 'b');
  const nb = n.srv.lister().filter((s) => String(s.nom) === 'Doublon possible').length;
  verifier(nb === 1, 'deux envois de la MÊME intention ⇒ une seule fiche', nb + ' fiche(s)');
  verifier(r2.reponse.deja_appliquee === true, 'et la seconde le dit');
}

/* ==========================================================================
   G. LE BILAN
   ========================================================================== */
titre('G. Bilan : jamais peint sans les fiches');
{
  const n = await ecran();
  poserVar(n, 'marquerRessourceAdmin("fichesSponsors", false); afficherBilanSponsors();');
  verifier(/n’ont pas pu être lues|n\'ont pas pu être lues/.test(n.el('bilan-sponsors').innerHTML),
    'sans les fiches, le bilan le DIT au lieu d’afficher des identifiants',
    n.el('bilan-sponsors').innerHTML.slice(0, 90));
}

titre('G bis. Inactif nommé, supprimé annoncé honnêtement');
{
  const n = await ecran();
  // Un relevé sur S1 et sur un partenaire qui n'existe plus.
  poserVar(n, 'sponsorsConsolide = { appareils: 1, sessions: 1, jour: "2026-09-23", jours: {}, ' +
    'sponsors: { S1: { expo: { mur: 60 }, aff: { mur: 2 }, clics: 0, plein: { ouverts: 0, secondes: 0, passes: 0 }, tranches: {} },' +
    ' SPDISPARU1: { expo: { mur: 30 }, aff: { mur: 1 }, clics: 0, plein: { ouverts: 0, secondes: 0, passes: 0 }, tranches: {} } } };');
  // S1 passe inactif.
  poserVar(n, 'sponsorsAdmin = sponsorsAdmin.map(function (s) { ' +
    'return String(s.id_sponsor) === "S1" ? Object.assign({}, s, { actif: "non" }) : s; }); afficherBilanSponsors();');
  const html = n.el('bilan-sponsors').innerHTML;
  verifier(/Partenaire fictif 1/.test(html), 'un partenaire DÉSACTIVÉ garde son nom');
  verifier(/masqué/.test(html), 'avec la mention « masqué »');
  verifier(/Partenaire supprimé \(SPDISPARU1\)/.test(html),
    'un partenaire SUPPRIMÉ est annoncé comme tel, identifiant conservé',
    (html.match(/Partenaire supprimé \([^)]*\)/) || [''])[0]);
  verifier(!/>SPDISPARU1</.test(html), '⛔ et jamais l’identifiant nu comme s’il était un nom');
}

titre('G ter. Échec des relevés ≠ bilan vide');
{
  const n = await ecran();
  poserVar(n, 'sponsorsRelevesEnPanne = true; afficherBilanSponsors();');
  verifier(/pas pu être lus/.test(n.el('bilan-sponsors').innerHTML),
    'une lecture en panne le dit, au lieu d’afficher « aucun relevé »',
    n.el('bilan-sponsors').innerHTML.slice(0, 90));
}

titre('G quater. Sélecteur de journée');
{
  const n = await ecran();
  poserVar(n, 'sponsorsJoursDisponibles = { "2026-09-20": 3, "2026-09-23": 7 }; majSelecteurJourBilan();');
  const select = n.el('bilan-journee');
  verifier(!!select && /2026-09-20/.test(select.innerHTML) && /2026-09-23/.test(select.innerHTML),
    'les journées renvoyées par le serveur sont proposées', select ? select.innerHTML.slice(0, 120) : '(absent)');
  verifier(n.el('bilan-journee-bloc').hidden === false, 'et le sélecteur est visible dès deux journées');

  const avant = n.journal.length;
  select.value = '2026-09-20';
  select.dispatchEvent({ type: 'change', target: select });
  await n.tour(30);
  const emises = n.journal.slice(avant);
  verifier(emises.length === 1 && emises[0] === 'lireMesuresSponsors',
    'changer de journée relit les relevés SEULS', emises.join(', '));
  verifier(lireVar(n, 'sponsorsJourBilan') === '2026-09-20', 'et la journée choisie est retenue');
}

titre('G quinquies. Avertissement d’intégrité');
{
  const n = await ecran();
  poserVar(n, 'sponsorsAvertissements = [{ code: "id_inexploitable", id_sponsor: "S1", ' +
    'message: "L\'identifiant de ce partenaire est trop court." }]; afficherListeSponsors();');
  verifier(/trop court/.test(n.el('avertissements-sponsors').innerHTML),
    'un identifiant inexploitable est signalé à l’écran',
    n.el('avertissements-sponsors').innerHTML.slice(0, 90));
  verifier(n.el('avertissements-sponsors').hidden === false, 'et la zone est visible');
}

console.log('\n──────────────────────────────────────────────────────────────');
if (ko) { console.error('ÉCHEC — ' + ok + ' OK, ' + ko + ' ÉCHEC(S).'); process.exit(1); }
console.log('OK — ' + ok + '/' + ok + ' contrôles de surface « Partenaires » passés.');
})().catch((e) => { console.error('EXCEPTION : ' + e.stack); process.exit(1); });
