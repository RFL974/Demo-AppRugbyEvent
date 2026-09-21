#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  RACCORDEMENT — « Enregistrer les informations » avec le choix des catégories
 * ============================================================================
 *  ▶ node tests/contrat-ecriture-categories.test.js
 *    [--frontend <dossier js/>] [--backend <Code.gs>]   (contre-épreuves : autres versions)
 *
 *  ⭐ Le VRAI frontend (modules de js/, chargés tels quels) contre le VRAI backend (Code.gs du dépôt
 *  voisin, exécuté dans les doublures Google du banc de coût), requête par requête. Le transport est
 *  simulé : chaque requête attend que le banc la serve, ce qui distingue celles que le bouton ATTEND
 *  de celles qui partent en arrière-plan. On compte ce qui part réellement vers le serveur.
 *    A — un seul appel d'écriture par clic, pour chaque usage valide du bouton ;
 *    B — le serveur reste l'autorité : suppression refusée, redemandée UNE fois chiffres réels à l'appui ;
 *    C — rejeu, réponse perdue, réponse partielle, refus : jamais de renvoi automatique ni de faux succès ;
 *    D — compatibilité : nouveau frontend + ancien backend (3f26c3c), ancien frontend (HEAD) + nouveau backend ;
 *    F — un navigateur qui mêle des scripts des deux versions (cache) ne casse pas le bouton.
 *  ⛔ Aucun réseau, aucun service Google réel ; données fictives du banc (backend/tests/banc-cout).
 *  Le banc lui-même vit dans tests/banc-ecran-infos.js (partagé avec tests/ecran-infos-surface.test.js).
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const outils = require('./banc-ecran-infos');
const { extrait, CHOIX, PNG } = outils;

const args = process.argv.slice(2);
const option = (nom) => { const i = args.indexOf('--' + nom); return i === -1 ? null : args[i + 1]; };
const DOSSIER_JS = option('frontend') ? path.resolve(option('frontend')) : path.join(outils.RACINE, 'js');
const SOURCE_BACKEND = fs.readFileSync(option('backend') ? path.resolve(option('backend')) : path.join(outils.BACKEND, 'Code.gs'), 'utf8');
const BACKEND_AVANT = outils.BACKEND_AVANT();
const JS_AVANT = outils.JS_AVANT;
const JS_ACTUEL = outils.lecteurJs(DOSSIER_JS);

let n = 0;
function vrai(v, m, preuve) {
  if (!v) { console.error('ÉCHEC — ' + m + (preuve === undefined ? '' : '\n  ' + String(JSON.stringify(preuve)).slice(0, 900))); process.exitCode = 1; return; }
  n++; console.log('  ✓ ' + m);
}
/** Banc de l'écran (tests/banc-ecran-infos.js) : par défaut la version testée des deux côtés. */
const banc = (o) => outils.banc(Object.assign({ backend: SOURCE_BACKEND, js: JS_ACTUEL }, o || {}));

(async () => {
  /* ======================================================= A — un clic, une écriture */
  console.log('A — un seul appel d\'écriture par clic (vrai frontend, vrai Code.gs)');
  let b = await banc();
  let x = await b.cliquer();
  vrai(x.requetes.length === 1 && x.ecritures[0].action === 'enregistrerInfosTournoi' && /Déjà à jour/.test(b.message()),
    'A.1 aucune modification : 1 requête, « Déjà à jour »', x.resume);

  b = await banc();
  b.saisir({ tournoi_nom: 'Nom modifié' });
  x = await b.cliquer();
  vrai(x.requetes.length === 1 && b.srv.global().tournoi_nom === 'Nom modifié' && /✅ Infos enregistrées/.test(b.message()),
    'A.2 informations générales seules : 1 requête', x.resume);

  b = await banc({ monde: { sans: ['U14'] } });
  b.cocher(CHOIX);
  x = await b.cliquer();
  vrai(x.attendues.length === 1 && x.ecritures.length === 1 && x.ecritures[0].corps.categories_choisies.join() === CHOIX.join() &&
       b.srv.categories().includes('U14:oui') && b.dialogues.length === 0 && !b.ctx.choixCategoriesAValider(),
    'A.3 ⭐ ajout d\'une catégorie : UNE requête attendue (avant : relecture + écriture + contrôles + infos + relecture)', x.resume);
  vrai(x.fond.map((r) => r.action).join() === 'getConformiteFFR' && x.fond[0].corps.categories.includes('U14'),
    'A.4 le contrôle FFR, seule dépendance réelle des catégories, part en ARRIÈRE-PLAN avec la nouvelle liste', x.resume);
  vrai(/Infos et catégories enregistrées/.test(b.message()) && /✅ Catégories enregistrées/.test(b.messageChoix()) &&
       b.cases[4].checked && b.ctx.configCourante.categories.some((c) => c.categorie === 'U14'),
    'A.5 l\'écran prend l\'état RELU : cases, catégories et messages à jour sans relecture');

  b = await banc({ monde: { vides: ['U14'] } });
  b.cocher(['U6', 'U8', 'U10', 'U12']);
  x = await b.cliquer();
  vrai(x.attendues.length === 1 && b.dialogues.length === 1 && /U14 \(vide\)/.test(b.dialogues[0].texte) &&
       b.dialogues[0].opts.danger === true && !b.srv.categories().includes('U14') &&
       JSON.stringify(x.ecritures[0].corps.suppressions_confirmees) === '[{"categorie":"U14","equipes":0,"matchs":0}]',
    'A.6 ⭐ suppression d\'une catégorie vide : confirmation, puis UNE requête qui porte la confirmation', x.resume);

  b = await banc();
  b.cocher(['U6', 'U8', 'U10', 'U12']);
  x = await b.cliquer();
  vrai(x.attendues.length === 1 && /U14 \(4 équipes, 6 matchs\)/.test(b.dialogues[0].texte) && !b.srv.categories().includes('U14') &&
       b.srv.lignes('Equipes').filter((e) => e.categorie === 'U14').length === 4 && /réaffecter/.test(b.message()),
    'A.7 ⭐ catégorie encore utilisée : la confirmation montre équipes et matchs ; une requête ; équipes conservées, avertissement', x.resume);

  b = await banc({ monde: { sans: ['U6', 'U8'], vides: ['U12'] } });
  b.cocher(['U6', 'U8', 'U10']);
  b.saisir({ tournoi_nom: 'Plusieurs changements' });
  x = await b.cliquer();
  vrai(x.attendues.length === 1 && b.dialogues.length === 1 && b.srv.categories() === 'U10:oui U6:oui U8:oui' &&
       b.srv.global().tournoi_nom === 'Plusieurs changements',
    'A.8 ⭐ deux ajouts, deux suppressions et les infos : UNE confirmation, UNE requête', x.resume);

  b = await banc({ monde: { sans: ['U14'] } });
  b.cocher(CHOIX);
  b.saisir({ tournoi_nom: 'Tout en un', tournoi_date: '2027-05-22' });
  b.ctx.afficheDataURI = PNG;
  x = await b.cliquer();
  vrai(x.attendues.length === 1 && x.ecritures[0].corps.affiche === PNG && b.srv.global().tournoi_affiche_id === 'fichier-fictif-1' &&
       b.srv.global().tournoi_date === '2027-05-22' && b.srv.categories().includes('U14:oui') &&
       b.el('form-infos-tournoi').tournoi_affiche.value === '',
    'A.9 ⭐ infos, date, catégories ET affiche : UNE requête', x.resume);

  /* ======================================================= B — le serveur reste l'autorité */
  console.log('B — confirmation destructrice : le serveur revérifie');
  b = await banc({ equipesInconnues: true });                      // l'écran ne connaît pas les équipes
  b.cocher(['U6', 'U8', 'U10', 'U12']);
  x = await b.cliquer();
  vrai(x.ecritures.length === 2 && x.ecritures[0].reponse.code === 'suppression_a_confirmer' && b.dialogues.length === 2 &&
       /U14 \(vide\)/.test(b.dialogues[0].texte) && /Le serveur a trouvé à supprimer : U14 \(4 équipes, 6 matchs\)/.test(b.dialogues[1].texte) &&
       !b.srv.categories().includes('U14') && JSON.stringify(x.ecritures[1].corps.suppressions_confirmees) === '[{"categorie":"U14","equipes":4,"matchs":6}]',
    'B.1 ⭐ confirmation périmée : le serveur REFUSE tout, on redemande avec ses chiffres, la 2ᵉ écriture suit la 2ᵉ confirmation', x.resume);

  b = await banc({ equipesInconnues: true, dialogues: [true, false] });
  const nomAvant = b.srv.global().tournoi_nom;
  b.cocher(['U6', 'U8', 'U10', 'U12']);
  b.saisir({ tournoi_nom: 'NE DOIT PAS ÊTRE ÉCRIT' });
  x = await b.cliquer();
  vrai(x.ecritures.length === 1 && b.srv.categories().includes('U14:oui') && b.srv.global().tournoi_nom === nomAvant &&
       /Rien n'a été enregistré/.test(b.message()) && b.ctx.choixCategoriesAValider() && !b.cases[4].checked &&
       !b.el('choix-categories-champs').disabled && !b.el('bouton-enregistrer-infos').disabled,
    'B.2 ⭐ la nouvelle confirmation refusée : rien d\'écrit (infos comprises), le brouillon reste, tout est libéré', x.resume);

  b = await banc({ dialogues: [false] });
  b.cocher(['U6', 'U8', 'U10', 'U12']);
  x = await b.cliquer();
  vrai(x.requetes.length === 0 && /aucune information envoyée/.test(b.message()) && b.ctx.choixCategoriesAValider() &&
       !b.el('choix-categories-champs').disabled,
    'B.3 confirmation annulée : AUCUNE requête, le choix reste à enregistrer', x.resume);

  b = await banc({ dialogues: ['panne'] });
  b.cocher(['U6', 'U8', 'U10', 'U12']);
  x = await b.cliquer();
  vrai(x.requetes.length === 0 && !b.el('choix-categories-champs').disabled && !b.el('bouton-enregistrer-infos').disabled &&
       b.ctx.choixCategoriesAValider() && /indisponible/.test(b.message()),
    'B.4 boîte de confirmation en panne : aucune requête, cases et bouton libérés, erreur affichée', x.resume);

  /* ======================================================= C — rejeu, pannes, refus */
  console.log('C — rejeu, réponse perdue, réponse partielle, refus');
  b = await banc({ monde: { sans: ['U14'] } });
  b.cocher(CHOIX);
  const premier = b.cliquer();
  const second = b.cliquer();                                      // double clic : bouton déjà occupé
  const [x1, x2] = await Promise.all([premier, second]);
  const x3 = await b.cliquer();
  vrai(b.journal.filter((r) => r.action === 'enregistrerInfosTournoi').length === 2 && x3.requetes.length === 1 &&
       /Déjà à jour/.test(b.message()) && b.srv.categories().split('U14').length === 2 && !x3.ecritures[0].corps.categories_choisies,
    'C.1 ⭐ double clic : une seule émission ; nouveau clic ensuite : « Déjà à jour », aucune catégorie recréée', [x1.resume, x2.resume, x3.resume]);

  b = await banc({ monde: { sans: ['U14'] }, panne: (r) => (r.action === 'enregistrerInfosTournoi' ? 'perdue-apres' : null) });
  b.cocher(CHOIX);
  x = await b.cliquer();
  vrai(x.ecritures.length === 1 && x.requetes.map((r) => r.action).join() === 'enregistrerInfosTournoi,getConfigAdmin' &&
       b.srv.categories().includes('U14:oui') && !b.ctx.choixCategoriesAValider() && /confirmées par relecture/.test(b.message()) &&
       /⚠️/.test(b.message()),
    'C.2 ⭐ réponse perdue APRÈS écriture : relecture seule, catégories confirmées, JAMAIS de renvoi, pas de faux succès des infos', x.resume);

  b = await banc({ monde: { sans: ['U14'] }, panne: (r) => (r.action === 'enregistrerInfosTournoi' ? 'perdue-avant' : null) });
  b.cocher(CHOIX);
  x = await b.cliquer();
  vrai(x.ecritures.length === 1 && !b.srv.categories().includes('U14') && b.ctx.choixCategoriesAValider() &&
       b.cases[4].checked && /Rien n’a été renvoyé automatiquement/.test(b.message()),
    'C.3 réponse perdue AVANT écriture : relecture, le choix reste à enregistrer, rien de renvoyé', x.resume);

  b = await banc({ monde: { sans: ['U14'] }, panne: (r) => (r.action === 'enregistrerInfosTournoi' ? 'partielle' : null) });
  b.cocher(CHOIX);
  x = await b.cliquer();
  vrai(x.ecritures.length === 1 && x.attendues.map((r) => r.action).join() === 'enregistrerInfosTournoi,getConfigAdmin' &&
       !b.ctx.choixCategoriesAValider() && b.ctx.configCourante.categories.some((c) => c.categorie === 'U14'),
    'C.4 réponse au contrat mais PARTIELLE : UNE relecture seule (catégories et infos), aucune écriture de plus', x.resume);

  b = await banc();
  b.cocher(['U10']);
  b.ctx.selectionChoixCategories = () => ['U10', 'U16'];           // demande invalide (navigateur altéré)
  x = await b.cliquer();
  vrai(x.requetes.length === 1 && /hors du choix proposé/.test(b.message()) && b.ctx.choixCategoriesAValider() &&
       b.srv.categories() === 'U6:oui U8:oui U10:oui U12:oui U14:oui',
    'C.5 refus de validation du serveur (marqué « rien d\'écrit ») : message, aucune relecture, rien de changé', x.resume);

  /* ======================================================= D — compatibilité */
  console.log('D — compatibilité entre versions');
  b = await banc({ backend: BACKEND_AVANT, monde: { vides: ['U14'] } });
  b.cocher(['U6', 'U8', 'U10', 'U12']);
  b.saisir({ tournoi_nom: 'Nouveau front, ancien back' });
  x = await b.cliquer();
  vrai(b.srv.categories() === 'U6:oui U8:oui U10:oui U12:oui' && b.srv.global().tournoi_nom === 'Nouveau front, ancien back' &&
       b.dialogues.length === 1 && x.ecritures.map((r) => r.action).join() === 'enregistrerInfosTournoi,supprimerCategorie' &&
       !b.ctx.choixCategoriesAValider() && /✅ Infos et catégories enregistrées/.test(b.message()),
    'D.1 ⭐ nouveau frontend + ANCIEN backend : repli historique, rien de perdu, UNE seule confirmation, succès exact', x.resume);

  b = await banc({ backend: BACKEND_AVANT, monde: { sans: ['U14'] } });
  b.cocher(CHOIX);
  b.ctx.afficheDataURI = PNG;
  x = await b.cliquer();
  vrai(b.srv.categories().includes('U14:oui') && b.srv.global().tournoi_affiche_id === 'fichier-fictif-1' &&
       x.ecritures.map((r) => r.action).join() === 'enregistrerInfosTournoi,enregistrerAffiche,enregistrerCategorie',
    'D.2 nouveau frontend + ancien backend, affiche et catégorie : chacune par son action historique', x.resume);

  b = await banc({ js: JS_AVANT, monde: { sans: ['U14'] } });
  b.cocher(CHOIX);
  b.saisir({ tournoi_nom: 'Ancien front, nouveau back' });
  x = await b.cliquer();
  vrai(b.srv.categories().includes('U14:oui') && b.srv.global().tournoi_nom === 'Ancien front, nouveau back' &&
       x.ecritures.map((r) => r.action).join() === 'enregistrerCategorie,enregistrerInfosTournoi' && /✅ Infos enregistrées/.test(b.message()),
    'D.3 ⭐ ANCIEN frontend + nouveau backend : son parcours historique fonctionne à l\'identique', x.resume);

  b = await banc({ js: JS_AVANT, monde: { vides: ['U14'] } });
  b.cocher(['U6', 'U8', 'U10', 'U12']);
  x = await b.cliquer();
  vrai(!b.srv.categories().includes('U14') && x.ecritures.map((r) => r.action).join() === 'supprimerCategorie,enregistrerInfosTournoi',
    'D.4 ancien frontend + nouveau backend, suppression : inchangée', x.resume);

  /* ======================================================= F — cache du navigateur mêlant deux versions */
  console.log('F — scripts de deux versions dans le même navigateur (cache, version de livraison inchangée)');
  const melange = (anciens) => (f) => (anciens.includes(f) ? JS_AVANT(f) : JS_ACTUEL(f));
  b = await banc({ js: melange(['admin-choix-categories.js']), monde: { sans: ['U14'] } });
  b.cocher(CHOIX);
  b.saisir({ tournoi_nom: 'Cache mêlé' });
  x = await b.cliquer();
  vrai(b.srv.categories().includes('U14:oui') && b.srv.global().tournoi_nom === 'Cache mêlé' &&
       x.ecritures.map((r) => r.action).join() === 'enregistrerCategorie,enregistrerInfosTournoi' && /✅ Infos enregistrées/.test(b.message()),
    'F.1 ⭐ nouveau bouton + ANCIEN module des catégories : parcours historique, aucune erreur, rien de perdu', x.resume);
  b = await banc({ js: melange(['admin-infos-publication.js']), monde: { vides: ['U14'] } });
  b.cocher(['U6', 'U8', 'U10', 'U12']);
  x = await b.cliquer();
  vrai(!b.srv.categories().includes('U14') && b.dialogues.length === 1 &&
       x.ecritures.map((r) => r.action).join() === 'supprimerCategorie,enregistrerInfosTournoi',
    'F.2 ANCIEN bouton + nouveau module des catégories : « Valider » historique inchangé (une confirmation)', x.resume);

  /* ======================================================= E — ce que l'écran et le serveur partagent */
  const backend = vm.createContext({});
  vm.runInContext(SOURCE_BACKEND, backend);
  const defauts = vm.runInContext('CATEGORIE_CHOISIE_DEFAUTS', backend);
  const choixServeur = vm.runInContext('CATEGORIES_CHOIX_TOURNOI', backend);
  const front = vm.createContext({});
  vm.runInContext(extrait(JS_ACTUEL('admin-choix-categories.js'), 'nouvelleCategorieChoisie'), front);
  const cree = vm.runInContext('nouvelleCategorieChoisie("U8")', front);
  const nonVides = Object.keys(cree).filter((k) => k !== 'categorie' && cree[k] !== '').sort();
  vrai(JSON.stringify(nonVides.map((k) => [k, cree[k]])) ===
       JSON.stringify(Object.keys(defauts).sort().map((k) => [k, defauts[k]])) &&
       JSON.stringify(Array.from(choixServeur)) === JSON.stringify(CHOIX) &&
       JS_ACTUEL('admin-choix-categories.js').includes("Object.freeze(['U6', 'U8', 'U10', 'U12', 'U14'])"),
    'E.1 une catégorie créée par le serveur reçoit exactement les valeurs de nouvelleCategorieChoisie ; même liste de cinq');

  console.log(process.exitCode ? '\nÉCHEC' : '\nOK — ' + n + ' contrôles du raccordement « Enregistrer les informations » + catégories.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
