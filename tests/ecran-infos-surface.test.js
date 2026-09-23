#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  AUDIT — TOUTE LA SURFACE DE L'ÉCRAN « INFOS DU TOURNOI »
 * ============================================================================
 *  ▶ node tests/ecran-infos-surface.test.js [--frontend <dossier js/>] [--backend <Code.gs>]
 *
 *  ⭐ Chaque contrôle de l'écran, joué avec les VRAIS modules du frontend contre le VRAI Code.gs
 *  (banc partagé : tests/banc-ecran-infos.js), requête par requête :
 *    I — l'inventaire : aucun contrôle de l'écran n'échappe à cette suite ;
 *    L — les gestes LOCAUX ne font AUCUN appel (saisie, cases, Entrée, panneau, affiche…) ;
 *    R — les LECTURES du contrôle FFR : une seule par saisie finie, jamais attendue par une écriture ;
 *    W — les ÉCRITURES : une seule requête attendue, sans relecture complète, sans rien écraser ;
 *    C — compatibilité avec le backend d'avant (3f26c3c) et le frontend d'avant (HEAD).
 *  Chaque geste imprime une ligne « MATRICE » (requêtes attendues + arrière-plan, attente ESTIMÉE par
 *  le modèle de coût du banc — pas une mesure chez Google) : la même suite, lancée contre une autre
 *  version (--frontend / --backend), donne la colonne « avant » de la matrice de l'audit.
 *  L'écriture principale (« Enregistrer les informations ») a sa propre suite :
 *  tests/contrat-ecriture-categories.test.js et tests/contrat-ecriture-infos.test.js.
 *  ⛔ Aucun réseau, aucun service Google réel ; données fictives.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const outils = require('./banc-ecran-infos');
const { extrait } = outils;

const args = process.argv.slice(2);
const option = (nom) => { const i = args.indexOf('--' + nom); return i === -1 ? null : args[i + 1]; };
const DOSSIER_JS = option('frontend') ? path.resolve(option('frontend')) : path.join(outils.RACINE, 'js');
const SOURCE_BACKEND = fs.readFileSync(option('backend') ? path.resolve(option('backend')) : path.join(outils.BACKEND, 'Code.gs'), 'utf8');
const JS = outils.lecteurJs(DOSSIER_JS);
const lire = (f) => fs.readFileSync(path.join(outils.RACINE, f), 'utf8');

const { vrai } = (() => { const c = outils.compteur(); module.exports.c = c; return c; })();
const banc = (o) => outils.banc(Object.assign({ backend: SOURCE_BACKEND, js: JS, horlogeFactice: true }, o || {}));
const s = (ms) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';
function matrice(geste, x) {
  console.log('    MATRICE | ' + geste + ' | ' + x.attendues.length + ' + ' + x.fond.length + ' | ' +
    (x.resume || '—') + ' | attente ' + s(x.attenteMs) + ' | verrou ' + s(x.verrouMs));
}
/** Un événement minimal dont `target.closest(sel)` rend `cible` pour le sélecteur voulu. */
const clic = (selecteur, cible) => ({ target: { closest: (sel) => (sel === selecteur ? cible : null) }, preventDefault() {} });
const bouton = (attributs) => ({ disabled: false, getAttribute: (a) => (attributs[a] == null ? null : attributs[a]) });

(async () => {
  /* ================================================================ I — inventaire exhaustif */
  console.log('I — inventaire des contrôles de l\'écran');
  const html = lire('admin.html');
  const debut = html.indexOf('<section class="carte" id="bloc-choix-categories">');
  const fin = html.indexOf('<section class="carte" id="bloc-contacts-securite">');
  const zone = html.slice(debut, fin).replace(/<!--[\s\S]*?-->/g, '');   // un <select> cité en commentaire n'est pas un contrôle
  const trouves = [];
  zone.replace(/<(input|select|textarea|button)\b[^>]*>/g, (balise, nom) => {
    const id = (balise.match(/\bid="([^"]+)"/) || [])[1];
    const n = (balise.match(/\bname="([^"]+)"/) || [])[1];
    const v = (balise.match(/\bvalue="([^"]+)"/) || [])[1];
    trouves.push(id || (n + (v && nom === 'input' && /checkbox/.test(balise) ? ':' + v : '')));
  });
  const INVENTAIRE = {
    'categories:U6': 'L.2 L.3', 'categories:U8': 'L.2', 'categories:U10': 'L.2', 'categories:U12': 'L.2', 'categories:U14': 'L.2 L.3',
    'bouton-valider-categories': 'L.3 (masqué en mode écrans ; repli historique)',
    tournoi_date: 'R.1 R.3 R.4 W.1', zone_vacances: 'R.2', 'bouton-trouver-date': 'L.4', 'finder-mois': 'L.4 R.5',
    'bouton-chercher-dates': 'R.5', 'bouton-enregistrer-cadre': 'W.1 (masqué ; flux de « Appliquer » un jour)',
    tournoi_nom: 'L.1 W.1 W.4', tournoi_lieu: 'L.1', tournoi_adresse: 'L.1', tournoi_description: 'L.1 W.1',
    tournoi_affiche: 'L.5 L.6 L.8', 'bouton-retirer-affiche': 'L.7 W.4 W.5 W.6',
    'bouton-enregistrer-infos': 'suites contrat-ecriture-*'
  };
  vrai(JSON.stringify(trouves.slice().sort()) === JSON.stringify(Object.keys(INVENTAIRE).sort()),
    'I.1 ⭐ admin.html : les 20 contrôles statiques de l\'écran sont exactement ceux de l\'inventaire audité', trouves);
  const dynamiques = [['js/admin-conformite-ffr.js', 'class="df-appliquer"', 'W.1 W.2 (« Appliquer » un jour proposé)'],
    ['js/admin-conformite-ffr.js', 'class="ffr-appliquer"', 'W.7 W.8 W.9 (« Appliquer les valeurs FFR »)'],
    ['js/admin-conformite-ffr.js', 'data-action="reessayer-ffr"', 'R.6 (« Réessayer le contrôle FFR »)'],
    ['js/admin-conformite-ffr.js', '<details class="ffr-panneau">', 'L.9 (prescriptions dépliables, local)'],
    ['js/ecrans.js', "affiche.id='cv-affiche-carte'", 'L.5 (zone d\'affiche déplacée dans la carte)']];
  vrai(dynamiques.every(([f, motif]) => lire(f).includes(motif)),
    'I.2 contrôles créés par le JavaScript (jours proposés, valeurs FFR, reprise, prescriptions) : tous inventoriés');

  /* ================================================================ L — gestes locaux : zéro appel */
  console.log('L — gestes locaux');
  let b = await banc();
  let x = await b.jouer(() => { b.saisir({ tournoi_nom: 'Nom en cours', tournoi_lieu: 'Lieu', tournoi_adresse: 'Adresse', tournoi_description: 'Texte' }); });
  const admin = JS('admin.js');
  vrai(x.requetes.length === 0 && admin.includes("ecouter('form-infos-tournoi', 'submit', function (e) { e.preventDefault(); })") &&
       admin.includes("ecouter('form-cadre-tournoi', 'submit', function (e) { e.preventDefault(); })"),
    'L.1 saisie des champs et touche Entrée dans les formulaires : aucun appel (soumission empêchée)');
  matrice('Saisie nom / lieu / adresse / description, Entrée', x);

  x = await b.jouer(() => b.cocher(['U6', 'U8', 'U10', 'U12']));
  vrai(x.requetes.length === 0 && /U14/.test(b.messageChoix()) && /Catégories à valider|à recalculer/.test(b.el('bloc-conformite-ffr').innerHTML) &&
       b.ctx.dernierResConformite === null,
    'L.2 ⭐ cocher / décocher une catégorie : aucun appel ; le verdict FFR affiché est oublié ; le retrait est annoncé', x.resume);
  matrice('Cocher / décocher une catégorie', x);

  x = await b.jouer(() => b.ctx.onValiderChoixCategories({ type: 'submit', preventDefault() {} }));
  vrai(x.requetes.length === 0 && b.ctx.choixCategoriesAValider() && !b.cases[4].checked,
    'L.3 ⭐ Entrée sur une case (soumission, « Valider » masqué) : AUCUN appel, le brouillon reste — plus d\'ancien parcours', x.resume);
  matrice('Entrée sur une case de catégorie', x);
  b.el('bouton-valider-categories').hidden = false;                  // repli sans mode écrans : bouton visible
  b.reponsesDialogue.push(false);
  x = await b.jouer(() => b.ctx.onValiderChoixCategories({ type: 'submit', preventDefault() {} }));
  vrai(x.requetes.map((r) => r.action).join() === 'getConfigAdmin' && b.dialogues.length === 1,
    'L.3 bis « Valider » visible (repli historique) : son parcours est inchangé (relecture, confirmation)', x.resume);

  b = await banc();
  x = await b.jouer(() => b.ctx.onToggleTrouverDate());
  vrai(x.requetes.length === 0 && b.el('panneau-trouver-date').hidden === false && b.el('finder-mois').value === '2027-05' &&
       b.el('bouton-trouver-date').getAttribute('aria-expanded') === 'true',
    'L.4 « Trouver une date compatible » : panneau ouvert, mois prérempli, aucun appel', x.resume);
  matrice('Ouvrir / fermer « Trouver une date compatible »', x);

  const fichier = (nom, illisible) => ({ nom, illisible });
  b.ctx.document.querySelector = ((q) => (s) => (s.includes('tournoi_affiche') ? b.el('form-infos-tournoi').tournoi_affiche : q(s)))(b.ctx.document.querySelector);
  vm.runInContext(extrait(admin, 'brancherZoneImage'), b.ctx);
  b.ctx.brancherZoneImage({ champFichier: '#form-infos-tournoi [name="tournoi_affiche"]', zoneDepot: 'zone-depot-affiche', traiter: b.ctx.traiterFichierAffiche });
  b.saisir({ tournoi_nom: 'Nom non enregistré' });
  x = await b.jouer(() => b.ctx.traiterFichierAffiche(fichier('affiche-1.png')));
  const apresChoix = { src: b.el('apercu-affiche-img').src, visible: !b.el('apercu-affiche').hidden, brouillon: b.ctx.afficheDataURI };
  const x2 = await b.jouer(() => b.el('zone-depot-affiche').declencher('drop', { preventDefault() {}, dataTransfer: { files: [fichier('affiche-2.png')] } }));
  vrai(x.requetes.length === 0 && x2.requetes.length === 0 && /IMAGE-affiche-1/.test(apresChoix.src) && apresChoix.visible &&
       /IMAGE-affiche-2/.test(b.ctx.afficheDataURI) && /IMAGE-affiche-2/.test(b.el('apercu-affiche-img').src),
    'L.5 choisir une affiche, puis la remplacer par glisser-déposer : aperçu immédiat, aucun appel', [x.resume, x2.resume]);
  matrice('Choisir, glisser-déposer ou remplacer l\'affiche', x2);

  x = await b.jouer(() => b.ctx.traiterFichierAffiche(fichier('pas-une-image.png', true)));
  vrai(x.requetes.length === 0 && b.ctx.afficheDataURI === '' && b.el('apercu-affiche').hidden === true &&
       /Image illisible/.test(b.message()) && b.el('form-infos-tournoi').tournoi_nom.value === 'Nom non enregistré',
    'L.6 ⭐ fichier illisible : aucun appel, message, et l\'aperçu ne montre plus une image qui ne partira pas', x.resume);
  matrice('Fichier d\'affiche illisible', x);

  await b.jouer(() => b.ctx.traiterFichierAffiche(fichier('affiche-3.png')));
  b.saisir({ tournoi_description: 'Description en cours' });
  x = await b.jouer(() => b.ctx.onRetirerAffiche());
  vrai(x.requetes.length === 0 && b.ctx.afficheDataURI === '' && b.el('apercu-affiche').hidden === true &&
       /annulé/.test(b.message()) && b.el('form-infos-tournoi').tournoi_nom.value === 'Nom non enregistré' &&
       b.el('form-infos-tournoi').tournoi_description.value === 'Description en cours',
    'L.7 ⭐ « Retirer l\'affiche » sur un choix NON enregistré : geste local — aucun appel, aucune saisie écrasée', x.resume);
  matrice('Retirer une affiche choisie mais pas enregistrée', x);

  b.ctx.rendreZoneAfficheAccessible && b.ctx.rendreZoneAfficheAccessible();
  const depot = b.el('zone-depot-affiche');
  const champFichier = b.el('form-infos-tournoi').tournoi_affiche;
  const clics0 = champFichier.clics;
  let empeche = 0;
  ['Enter', ' ', 'Tab', 'a'].forEach((key) => depot.declencher('keydown', { key, preventDefault() { empeche++; } }));
  vrai(depot.getAttribute('tabindex') === '0' && depot.getAttribute('role') === 'button' && /affiche/i.test(depot.getAttribute('aria-label') || '') &&
       champFichier.clics - clics0 === 2 && empeche === 2 && /rendreZoneAfficheAccessible\(\)/.test(admin),
    'L.8 ⭐ clavier : la zone d\'affiche est atteignable par Tab ; Entrée et Espace ouvrent le choix du fichier (et seulement eux)');

  vrai(/<details class="ffr-panneau"><summary>/.test(JS('admin-conformite-ffr.js')),
    'L.9 prescriptions FFR et détail du verdict : <details> natifs (clavier compris), aucun appel au dépliage');

  /* ================================================================ R — lectures du contrôle FFR */
  console.log('R — contrôle FFR');
  b = await banc();
  const saisieDate = async () => {
    // 22052027 tapé au clavier : « change » à chaque touche qui forme une date (relevé navigateur) ;
    // entre deux touches, le navigateur a le temps de faire partir ce qui a été lancé.
    for (const v of ['0002-05-22', '0020-05-22', '0202-05-22', '2027-05-22', '2027-05-22', '2027-05-22', '2027-05-22', '2027-05-22']) {
      b.saisir({ tournoi_date: v });
      (b.ctx.planifierConformiteFFR || b.ctx.majConformiteFFR)();
      await outils.tour();
    }
  };
  x = await b.jouer(saisieDate);
  const pendant = { requetes: x.requetes.length, verdict: b.el('bloc-conformite-ffr').innerHTML };
  const y = await b.avancer();
  const toutes = x.requetes.concat(y.requetes).filter((r) => r.action === 'getConformiteFFR');
  vrai(pendant.requetes === 0 && /Vérification en cours/.test(pendant.verdict) && toutes.length === 1 &&
       toutes[0].corps.date === '2027-05-22' && /ffr-/.test(b.el('bloc-conformite-ffr').innerHTML) && b.ctx.dernierResConformite,
    'R.1 ⭐ date tapée au clavier (8 « change ») : UN seul contrôle FFR, pour la date finale ; « Vérification en cours » aussitôt',
    { pendant: pendant.requetes, apres: toutes.length });
  matrice('Saisir la date au clavier (8 touches)', { attendues: [], fond: toutes, resume: toutes.length + ' × ↪getConformiteFFR',
    attenteMs: 0, verrouMs: 0 });
  vrai(/planifierConformiteFFR\(\)/.test(admin.slice(admin.indexOf("ecouter('form-cadre-tournoi', 'change'"), admin.indexOf("ecouter('form-cadre-tournoi', 'change'") + 400)),
    'R.1 bis l\'écouteur « change » de la carte date & zone passe par planifierConformiteFFR');

  x = await b.jouer(() => { b.saisir({ zone_vacances: 'B' }); (b.ctx.planifierConformiteFFR || b.ctx.majConformiteFFR)(); });
  const yz = await b.avancer();
  const zoneReq = x.requetes.concat(yz.requetes);
  vrai(zoneReq.length === 1 && zoneReq[0].action === 'getConformiteFFR' && zoneReq[0].corps.zone === 'B',
    'R.2 changer la zone de vacances : un contrôle FFR (lecture), avec la nouvelle zone', zoneReq.map((r) => r.action));
  matrice('Changer la zone de vacances', { attendues: [], fond: zoneReq, resume: zoneReq.map((r) => '↪' + r.action).join(' → '), attenteMs: 0, verrouMs: 0 });

  b.cocher(['U6', 'U8', 'U10']);
  x = await b.jouer(() => { b.saisir({ tournoi_date: '2027-05-29' }); (b.ctx.planifierConformiteFFR || b.ctx.majConformiteFFR)(); });
  const y3 = await b.avancer();
  vrai(x.requetes.length + y3.requetes.length === 0 && /Catégories à valider/.test(b.el('bloc-conformite-ffr').innerHTML),
    'R.3 date changée pendant un choix de catégories en cours : aucun appel, l\'état neutre s\'affiche tout de suite');

  b = await banc();
  x = await b.jouer(() => { b.saisir({ tournoi_date: '2027-05-29' }); (b.ctx.planifierConformiteFFR || b.ctx.majConformiteFFR)(); });
  const z = await b.cliquer();
  const z2 = await b.avancer();
  const ffr = x.requetes.concat(z.requetes, z2.requetes).filter((r) => r.action === 'getConformiteFFR');
  vrai(ffr.length === 1 && b.minuteriesActives() === 0 && z.attendues.map((r) => r.action).join() === 'enregistrerInfosTournoi',
    'R.4 enregistrer pendant l\'attente de fin de saisie : un seul contrôle FFR (celui de l\'enregistrement), pas de doublon',
    { ffr: ffr.length, clic: z.resume });

  b = await banc();
  b.ctx.onToggleTrouverDate();
  x = await b.jouer(() => Promise.all([b.ctx.onChercherDatesCompatibles(), b.el('bouton-chercher-dates').disabled ? null : b.ctx.onChercherDatesCompatibles()]));
  vrai(x.requetes.map((r) => r.action).join() === 'datesCompatiblesFFR' && /df-appliquer/.test(b.el('finder-resultats').innerHTML) &&
       !b.el('bouton-chercher-dates').disabled,
    'R.5 « Chercher les jours compatibles » (double clic compris) : UNE lecture, résultats affichés, bouton libéré', x.resume);
  matrice('Chercher les jours compatibles', x);
  b.el('finder-mois').value = '';
  x = await b.jouer(() => b.ctx.onChercherDatesCompatibles());
  b.cocher(['U6']);
  const xb = await b.jouer(() => { b.el('finder-mois').value = '2027-05'; return b.ctx.onChercherDatesCompatibles(); });
  vrai(x.requetes.length === 0 && xb.requetes.length === 0 && /Valide les catégories/.test(b.el('finder-resultats').innerHTML),
    'R.5 bis sans mois, ou avec un choix de catégories en cours : aucun appel, consigne affichée');

  b = await banc();
  const reprise = { disabled: false };
  x = await b.jouer(() => b.ctx.onReessayerControleFFR(clic('[data-action="reessayer-ffr"]', reprise)));
  vrai(x.requetes.length >= 1 && x.requetes.every((r) => r.methode === 'GET') && reprise.disabled === true,
    'R.6 « Réessayer le contrôle FFR » : lectures seules, bouton désactivé pendant la reprise', x.resume);
  matrice('Réessayer le contrôle FFR', x);

  /* ================================================================ W — écritures */
  console.log('W — écritures de l\'écran (hors « Enregistrer les informations »)');
  b = await banc();
  b.ctx.onToggleTrouverDate();
  await b.jouer(() => b.ctx.onChercherDatesCompatibles());
  b.saisir({ tournoi_nom: 'Nom tapé, pas encore enregistré', tournoi_description: 'Texte en cours' });
  await b.jouer(() => b.ctx.traiterFichierAffiche(fichier('affiche-en-attente.png')));
  const jour = bouton({ 'data-date': '2027-05-22' });
  b.el('finder-resultats').querySelectorAll = () => [jour];
  x = await b.jouer(() => Promise.all([b.ctx.onClicResultatDate(clic('.df-appliquer', jour)), b.ctx.onClicResultatDate(clic('.df-appliquer', jour))]));
  const envoi = x.ecritures[0] && x.ecritures[0].corps;
  /* ⭐ Lot « Publication » — L'ENVOI PORTE EN PLUS SA BASE DE FUSION (`base_infos`), et c'est
     EXIGÉ ici, pas toléré : « Appliquer » un jour proposé passe par `onEnregistrerCadre`, donc par
     la même écriture que la carte « Date & conformité FFR ». Sans la base, un second onglet qui
     aurait changé la date entre-temps se ferait écraser en silence — exactement le défaut que la
     contre-épreuve du lot avait reproduit sur « Publier ».
     ⛔ Le contrôle est RENFORCÉ, pas assoupli : on exige que la base porte EXACTEMENT les deux
     champs envoyés — ni un de plus (elle ne doit pas parler du nom ou de la description, que
     cette écriture n'envoie pas), ni un de moins. */
  const baseEnvoyee = Object.keys((envoi && envoi.base_infos) || {}).sort().join();
  vrai(x.ecritures.length === 1 && x.attendues.map((r) => r.action).join() === 'enregistrerInfosTournoi' &&
       Object.keys(envoi).filter((k) => !['action', 'cle'].includes(k)).sort().join() === 'base_infos,tournoi_date,zone_vacances' &&
       baseEnvoyee === 'tournoi_date,zone_vacances' &&
       b.srv.global().tournoi_date === '2027-05-22' && b.srv.global().tournoi_nom !== 'Nom tapé, pas encore enregistré',
    'W.1 ⭐ « Appliquer » un jour proposé : UNE écriture attendue (date + zone seulement, plus leur ' +
    'base de fusion), double clic compris', x.resume + ' | base : ' + baseEnvoyee);
  vrai(b.el('form-infos-tournoi').tournoi_nom.value === 'Nom tapé, pas encore enregistré' &&
       b.el('form-infos-tournoi').tournoi_description.value === 'Texte en cours' && /affiche-en-attente/.test(b.ctx.afficheDataURI) &&
       b.el('form-cadre-tournoi').tournoi_date.value === '2027-05-22' && b.el('panneau-trouver-date').hidden === true &&
       /enregistrées/.test(b.messageCadre()) && !/Déjà à jour/.test(b.messageCadre()),
    'W.2 ⭐ … sans écraser le nom, la description ni l\'affiche en cours de saisie ; message juste ; panneau refermé', b.messageCadre());
  vrai(x.fond.map((r) => r.action).join() === 'getConformiteFFR',
    'W.3 le verdict de la nouvelle date est recalculé en ARRIÈRE-PLAN (une lecture, non attendue)', x.resume);
  matrice('« Appliquer » un jour proposé (double clic)', x);

  b = await banc();
  await b.jouer(() => b.ctx.traiterFichierAffiche(fichier('affiche-a-garder.png')));
  await b.cliquer();
  b.saisir({ tournoi_nom: 'Autre nom non enregistré' });
  b.reponsesDialogue.push(false);
  x = await b.jouer(() => b.ctx.onRetirerAffiche());
  vrai(x.requetes.length === 0 && b.dialogues.length === 1 && b.srv.global().tournoi_affiche_id === 'fichier-fictif-1',
    'W.5 retirer l\'affiche enregistrée, confirmation annulée : aucun appel', x.resume);
  const rendusDossier = b.el('etat-dossier').rendus || 0;
  x = await b.jouer(() => b.ctx.onRetirerAffiche());
  vrai(x.requetes.map((r) => r.action).join() === 'supprimerAffiche' && b.srv.global().tournoi_affiche_id === '' &&
       b.ctx.configCourante.global.tournoi_affiche_id === '' && b.el('apercu-affiche').hidden === true &&
       b.el('form-infos-tournoi').tournoi_nom.value === 'Autre nom non enregistré' && (b.el('etat-dossier').rendus || 0) > rendusDossier &&
       /Affiche retirée/.test(b.message()),
    'W.4 ⭐ retirer l\'affiche enregistrée : UNE écriture — ni relecture de la configuration, ni contrôle FFR, aucune saisie écrasée', x.resume);
  matrice('Retirer l\'affiche enregistrée', x);

  b = await banc({ panne: (r) => (r.action === 'supprimerAffiche' ? 'perdue-apres' : null) });
  await b.jouer(() => b.ctx.traiterFichierAffiche(fichier('affiche.png')));
  await b.cliquer();
  x = await b.jouer(() => b.ctx.onRetirerAffiche());
  vrai(x.requetes.length === 1 && /⚠️/.test(b.message()) && !b.el('bouton-retirer-affiche').disabled,
    'W.6 retrait dont la réponse se perd : message d\'erreur, pas de renvoi automatique, bouton libéré (nouvel essai sans risque)', x.resume);

  b = await banc({ monde: { ffrRiche: true } });
  const verdict = b.el('bloc-conformite-ffr').innerHTML;
  const valeurs = bouton({ 'data-cat': 'U10', 'data-variante': '' });
  b.reponsesDialogue.push(false);
  x = await b.jouer(() => b.ctx.onClicAppliquerFFR(clic('.ffr-appliquer', valeurs)));
  vrai(/class="ffr-appliquer" data-cat="U10"/.test(verdict) && x.requetes.length === 0 && /Appliquer les valeurs FFR à U10/.test(b.dialogues[0].texte),
    'W.8 « Appliquer les valeurs FFR » (bouton du verdict) : aperçu confirmé ou annulé — annulé, aucun appel', x.resume);
  b.saisir({ tournoi_nom: 'Nom pendant l\'application FFR' });
  x = await b.jouer(() => b.ctx.onClicAppliquerFFR(clic('.ffr-appliquer', valeurs)));
  const u10 = b.ctx.configCourante.categories.find((c) => c.categorie === 'U10');
  vrai(x.attendues.map((r) => r.action).join() === 'appliquerValeursFFR' && x.fond.map((r) => r.action).join() === 'getConformiteFFR' &&
       u10.duree_mi_temps_min === '10' && b.srv.categorie('U10').duree_mi_temps_min === '10' &&
       (b.el('zone-categories').dernier || []).find((c) => c.categorie === 'U10').duree_mi_temps_min === '10' &&
       b.alertes.some((a) => /Valeurs FFR appliquées à U10/.test(a)) && !valeurs.disabled &&
       b.el('form-infos-tournoi').tournoi_nom.value === 'Nom pendant l\'application FFR',
    'W.7 ⭐ appliquer : UNE écriture attendue ; réglages rendus depuis la réponse ; verdict recalculé en ARRIÈRE-PLAN', x.resume);
  matrice('Appliquer les valeurs FFR', x);

  /* ================================================================ C — compatibilité */
  console.log('C — versions mêlées');
  b = await banc({ backend: outils.BACKEND_AVANT(), monde: { ffrRiche: true } });
  x = await b.jouer(() => b.ctx.onClicAppliquerFFR(clic('.ffr-appliquer', bouton({ 'data-cat': 'U10', 'data-variante': '' }))));
  vrai(x.attendues.map((r) => r.action).join() === 'appliquerValeursFFR,getConfigAdmin,getConformiteFFR' &&
       b.srv.categorie('U10').duree_mi_temps_min === '10' && b.ctx.configCourante.categories.find((c) => c.categorie === 'U10').duree_mi_temps_min === '10',
    'C.1 nouveau frontend + ANCIEN backend, valeurs FFR : repli historique (relecture + contrôle attendus), valeurs justes', x.resume);
  b = await banc({ backend: outils.BACKEND_AVANT() });
  b.ctx.onToggleTrouverDate();
  await b.jouer(() => b.ctx.onChercherDatesCompatibles());
  b.saisir({ tournoi_nom: 'Nom en cours (ancien backend)' });
  const j2 = bouton({ 'data-date': '2027-05-29' });
  x = await b.jouer(() => b.ctx.onClicResultatDate(clic('.df-appliquer', j2)));
  vrai(x.attendues.map((r) => r.action).join() === 'enregistrerInfosTournoi,getConfigAdmin' && b.srv.global().tournoi_date === '2027-05-29' &&
       b.el('form-infos-tournoi').tournoi_nom.value === 'Nom en cours (ancien backend)',
    'C.2 nouveau frontend + ANCIEN backend, « Appliquer » un jour : repli (relecture), date enregistrée, saisie conservée', x.resume);
  await b.jouer(() => b.ctx.traiterFichierAffiche(fichier('ancien.png')));
  await b.cliquer();
  x = await b.jouer(() => b.ctx.onRetirerAffiche());
  vrai(x.requetes.map((r) => r.action).join() === 'supprimerAffiche' && b.srv.global().tournoi_affiche_id === '',
    'C.3 nouveau frontend + ancien backend, retrait de l\'affiche : même action historique, une requête', x.resume);
  b = await banc({ js: outils.JS_AVANT, monde: { ffrRiche: true } });
  x = await b.jouer(() => b.ctx.onClicAppliquerFFR(clic('.ffr-appliquer', bouton({ 'data-cat': 'U10', 'data-variante': '' }))));
  vrai(x.attendues.map((r) => r.action).join() === 'appliquerValeursFFR,getConfigAdmin,getConformiteFFR' && b.srv.categorie('U10').duree_mi_temps_min === '10',
    'C.4 ANCIEN frontend + nouveau backend, valeurs FFR : son parcours historique fonctionne (réponse au contrat = sur-ensemble)', x.resume);

  const c = module.exports.c;
  console.log(process.exitCode ? '\nÉCHEC' : '\nOK — ' + c.n + ' contrôles de la surface de l\'écran « Infos du tournoi ».');
})().catch((e) => { console.error(e); process.exitCode = 1; });
