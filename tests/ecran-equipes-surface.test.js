#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « ÉQUIPES » — SURFACE COMPLÈTE (lot « Équipes »)
 * ============================================================================
 *  ▶ node tests/ecran-equipes-surface.test.js [--frontend avant|<racine>] [--backend avant|<Code.gs>]
 *
 *  Vrais modules (api.js, admin.js, admin-equipes.js, ecrans.js…) et vraies cartes d'admin.html, contre le vrai
 *  Code.gs (banc-ecran-equipes.js). L'écran est construit par le VRAI `preparerOutilsCiel()` : la barre d'onglets,
 *  le filtre par club, la recherche et le dépliant d'ajout sont ceux de l'application, avec LEURS écouteurs.
 *  Le tournoi part vide et reçoit le jeu de démonstration par sa porte serveur — d'où 21 équipes réelles.
 *
 *    L — gestes LOCAUX : onglets (souris ET clavier), filtre par club, recherche, saisie, crayon, annulation.
 *        Aucun n'émet la moindre requête, et aucun ne perd le focus ni la saisie ;
 *    M — MUTATIONS : ajouter, modifier, supprimer, vider une catégorie ⇒ UNE SEULE requête chacune, parce que la
 *        réponse porte la liste relue. ⛔ La seconde requête (relecture) a disparu ;
 *    N — DOUBLE CLIC et concurrence : un seul envoi, jamais deux ; une confirmation annulée ne verrouille rien ;
 *    P — PANNES : réponse perdue, silence, erreur serveur — l'acquis est dit, la reprise est offerte, le geste
 *        reste fermé, et rien n'est jamais rejoué tout seul (sauf l'ajout, idempotent par contrat) ;
 *    Q — COHÉRENCE du jeu de démonstration : 21 équipes, 327 joueurs, 34 éducateurs, dont les quatre du RACING 92 ;
 *    V — VERSIONS MÊLÉES : ancien frontend avec nouveau backend, et l'inverse — tout marche, sans le gain.
 *  ⛔ Aucun réseau, aucun service Google réel, aucun e-mail ; tournoi fictif.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const B = require('./banc-ecran-equipes');
const BC = require('./banc-ecran-categories');

const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
const LIRE = arg('frontend') === 'avant' ? B.LECTEUR_AVANT : arg('frontend') ? B.lecteur(path.resolve(arg('frontend'))) : B.lecteur();
const CODE = arg('backend') === 'avant' ? B.BACKEND_AVANT() : arg('backend') ? fs.readFileSync(path.resolve(arg('backend')), 'utf8')
  : fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');

const t = BC.compteur();
const json = JSON.stringify;
const essai = async (code, fn) => { try { await fn(); } catch (e) { t.vrai(false, code + ' (exception) ' + String((e && e.message) || e).slice(0, 300)); } };
const banc = (o) => B.banc(Object.assign({ lire: LIRE, backend: CODE }, o || {}));

(async () => {

/* ============================ Q — cohérence du jeu de démonstration ============================ */
await essai('Q', async () => {
  const b = await banc();
  const s = b.totauxServeur();
  t.vrai(s.total.equipes === 21 && s.total.joueurs === 327 && s.total.educateurs === 34,
    'Q.1 le serveur détient 21 équipes, 327 joueurs et 34 éducateurs', s.total);
  t.vrai(s.U10.equipes === 10 && s.U10.joueurs === 118 && s.U10.educateurs === 14, 'Q.2 U10 : 10 équipes, 118 joueurs, 14 éducateurs', s.U10);
  t.vrai(s.U12.equipes === 11 && s.U12.joueurs === 209 && s.U12.educateurs === 20, 'Q.3 U12 : 11 équipes, 209 joueurs, 20 éducateurs', s.U12);
  t.vrai(b.lignes().length === 21, 'Q.4 les 21 équipes sont TOUTES affichées, sans doublon', b.lignes().length);
  const racing = b.nomsAffiches().filter((n) => /^RACING 92/.test(n));
  t.vrai(racing.length === 4, 'Q.5 ⭐ les quatre équipes du RACING 92 sont là, bien que l\'organisateur ne soit pas un club invité', racing);
  t.vrai(b.clubsProposes().indexOf('RACING 92') !== -1,
    'Q.6 RACING 92 figure au filtre par club, déduit du nom de ses équipes', b.clubsProposes());
  const onglets = b.onglets().map((o) => o.cle);
  t.vrai(onglets.indexOf('U10') !== -1 && onglets.indexOf('U12') !== -1 && onglets[0] === 'toutes',
    'Q.7 un onglet par catégorie présente, « Toutes » en tête', onglets);
});

/* ============================ L — gestes locaux : zéro requête, focus gardé ============================ */
await essai('L', async () => {
  const zero = async (b, code, libelle, geste) => {
    b.journal.length = 0;
    const r = await geste();
    t.vrai(r.requetes.length === 0 && !r.bloque, code + ' ' + libelle + ' : 0 requête', r.resume || b.journal.map((q) => q.action));
  };
  let b = await banc();
  await zero(b, 'L.1', 'changer d\'onglet à la souris', () => b.clicOnglet('U10'));
  t.vrai(b.ongletActif() === 'U10', 'L.2 l\'onglet demandé devient l\'onglet actif', b.ongletActif());
  t.vrai(b.visibles().length === 10 && b.nomsAffiches().length === 10,
    'L.3 l\'onglet U10 ne montre que les 10 équipes U10 — calculé en mémoire', b.nomsAffiches().length);

  b = await banc();
  b.doc.querySelector('#cv-equipes-onglets [data-cat-equipes="U10"]').focus();
  await b.clicOnglet('U10');
  t.vrai(b.focus() === 'U10',
    'L.4 ⭐ LE FOCUS SUIT L\'ONGLET CHOISI : la barre est repeinte, le point de focus est reposé sur l\'onglet actif ' +
    '(sans quoi Entrée ou Espace au clavier le perdait entièrement)', b.focus());

  b = await banc();
  const ailleurs = b.id('champ-nom'); ailleurs.focus();
  await b.clicOnglet('U10');
  t.vrai(b.focus() === 'champ-nom',
    'L.5 ⛔ mais un clic sur un onglet ne VOLE pas le curseur d\'un champ qu\'on était en train de remplir', b.focus());

  b = await banc();
  b.doc.querySelector('#cv-equipes-onglets [data-cat-equipes="toutes"]').focus();
  await zero(b, 'L.6', 'flèche droite dans la barre d\'onglets', () => b.toucheOnglet('toutes', 'ArrowRight'));
  t.vrai(b.focus() === b.ongletActif() && b.ongletActif() !== 'toutes',
    'L.7 la flèche change d\'onglet ET garde le focus dessus', { focus: b.focus(), actif: b.ongletActif() });
  await zero(b, 'L.8', 'touche Fin dans la barre d\'onglets', () => b.toucheOnglet(b.ongletActif(), 'End'));
  const cles = b.onglets().map((o) => o.cle);
  t.vrai(b.ongletActif() === cles[cles.length - 1], 'L.9 « Fin » ouvre le dernier onglet', b.ongletActif());

  b = await banc();
  await zero(b, 'L.10', 'filtrer par club', () => b.filtrerClub('CLAMART'));
  t.vrai(b.nomsAffiches().length === 3 && b.nomsAffiches().every((n) => /^CLAMART/.test(n)),
    'L.11 le filtre par club se calcule en mémoire, à partir du NOM des équipes', b.nomsAffiches());
  await zero(b, 'L.12', 'revenir à « Tous les clubs »', () => b.filtrerClub(''));
  t.vrai(b.nomsAffiches().length === 21, 'L.13 et il se lève sans rien relire', b.nomsAffiches().length);

  b = await banc();
  b.recherche().focus();
  await zero(b, 'L.14', 'frapper dans la recherche', () => b.chercher('meud'));
  t.vrai(b.visibles().length === 2 && b.focus() === 'cv-recherche-liste-equipes',
    'L.15 la recherche filtre l\'affichage, garde le focus et annonce son résultat',
    { visibles: b.visibles().length, focus: b.focus(), dit: b.resultatRecherche() });
  t.vrai(b.resultatRecherche() === '2 résultats', 'L.16 le nombre de résultats est annoncé à voix haute (role=status)', b.resultatRecherche());

  b = await banc();
  await zero(b, 'L.17', 'saisir dans le formulaire d\'ajout', () => b.saisir({ 'champ-nom': 'ESSAI', 'champ-joueurs': '12' }));
  t.vrai(b.id('champ-nom').value === 'ESSAI', 'L.18 la saisie reste dans le champ', b.id('champ-nom').value);

  b = await banc();
  await zero(b, 'L.19', 'ouvrir le crayon d\'une équipe', () => b.ouvrirEdition('MEUDON'));
  t.vrai(!!b.champEdition('champ-edit-nom') && b.focus() === 'champ-edit-nom',
    'L.20 l\'édition s\'ouvre et le curseur se pose dans le nom', b.focus());
  b.champEdition('champ-edit-nom').value = 'BROUILLON';
  await zero(b, 'L.21', 'annuler l\'édition', () => b.annulerEdition());
  t.vrai(!b.doc.querySelector('#liste-equipes .en-edition') && b.nomsAffiches().indexOf('MEUDON') !== -1,
    'L.22 annuler referme l\'édition et rend la ligne d\'origine', b.nomsAffiches().indexOf('MEUDON'));

  b = await banc();
  await b.clicOnglet('U10');
  await b.filtrerClub('CLAMART');
  await zero(b, 'L.23', 'onglet ET filtre club combinés', () => b.chercher(''));
  t.vrai(b.nomsAffiches().length === 2 && b.ongletActif() === 'U10',
    'L.24 les deux filtres se croisent, toujours sans requête', b.nomsAffiches());
});

/* ============================ M — mutations : UNE seule requête ============================ */
await essai('M', async () => {
  const nouveau = arg('backend') !== 'avant';
  const attendu = nouveau ? 1 : 2;
  let b = await banc();
  const rA = await b.ajouter({ nom: 'BANC-A', categorie: 'U10', joueurs: 12, educateurs: 2 });
  t.vrai(rA.requetes.length === attendu && rA.attendues.length === 1,
    'M.1 ⭐ ajouter : ' + attendu + ' requête(s) en tout — la liste relue vient avec la réponse',
    rA.resume);
  t.vrai(b.nomsAffiches().indexOf('BANC-A') !== -1 && b.srv.equipes().filter((e) => e.nom_equipe === 'BANC-A').length === 1,
    'M.2 l\'équipe est écrite UNE fois et apparaît aussitôt', b.srv.equipes().filter((e) => e.nom_equipe === 'BANC-A').length);
  t.vrai(b.totauxServeur().total.equipes === 22, 'M.3 les compteurs suivent : 22 équipes', b.totauxServeur().total);

  b = await banc();
  const rM = await b.modifier('MEUDON', { nom: 'MEUDON-A', joueurs: 11, educateurs: 3 });
  const ligne = b.srv.equipes().filter((e) => e.nom_equipe === 'MEUDON-A')[0];
  t.vrai(rM.requetes.length === attendu, 'M.4 ⭐ modifier : ' + attendu + ' requête(s) en tout', rM.resume);
  t.vrai(!b.doc.querySelector('#liste-equipes .en-edition'), 'M.5 l\'édition se referme une fois enregistrée', null);
  t.vrai(b.nomsAffiches().indexOf('MEUDON-A') !== -1 && String(ligne.nb_joueurs) === '11' && String(ligne.nb_educateurs) === '3',
    'M.6 le nom ET les deux effectifs sont enregistrés et affichés', ligne);

  b = await banc();
  const avantS = b.srv.equipes().length;
  const rS = await b.supprimer('ANTONY');
  t.vrai(rS.requetes.length === attendu, 'M.7 ⭐ supprimer : ' + attendu + ' requête(s) en tout', rS.resume);
  t.vrai(b.srv.equipes().length === avantS - 1 && b.lignes().length === avantS - 1,
    'M.8 exactement une équipe en moins, au serveur comme à l\'écran', { serveur: b.srv.equipes().length, ecran: b.lignes().length });

  b = await banc();
  await b.clicOnglet('U10');
  const rV = await b.viderCategorie();
  t.vrai(rV.requetes.length === attendu, 'M.9 ⭐ vider une catégorie : ' + attendu + ' requête(s) en tout', rV.resume);
  t.vrai(b.srv.equipes().filter((e) => e.categorie === 'U10').length === 0 && b.srv.equipes().length === 11,
    'M.10 les 10 U10 sont parties, les 11 U12 sont intactes', b.totauxServeur());
  t.vrai(b.totauxServeur().U12.joueurs === 209 && b.totauxServeur().U12.educateurs === 20,
    'M.11 et les effectifs U12 n\'ont pas bougé', b.totauxServeur().U12);

  b = await banc();
  const rR = await b.ajouter({ nom: 'RACING 92-3', categorie: 'U10', joueurs: 12, educateurs: 1 });
  t.vrai(b.clubsProposes().filter((c) => c === 'RACING 92').length === 1,
    'M.12 une équipe de plus pour un club déjà là ne crée PAS un second club au filtre', b.clubsProposes());
  t.vrai(rR.requetes.length === attendu, 'M.13 et cet ajout coûte le même nombre de requêtes', rR.resume);
});

/* ============================ N — double clic, annulation, concurrence ============================ */
await essai('N', async () => {
  let b = await banc();
  const rA = await b.ajouterDeuxFois({ nom: 'DOUBLE', categorie: 'U10', joueurs: 11, educateurs: 1 });
  t.vrai(rA.requetes.filter((r) => r.action === 'ajouterEquipe').length === 1 &&
    b.srv.equipes().filter((e) => e.nom_equipe === 'DOUBLE').length === 1,
    'N.1 double soumission de l\'ajout : UN seul envoi, UNE seule ligne', rA.resume);

  b = await banc();
  const rS = await b.supprimerDeuxFois('ANTONY');
  t.vrai(rS.requetes.filter((r) => r.action === 'supprimerEquipe').length === 1,
    'N.2 ⭐ DOUBLE CLIC SUR « SUPPRIMER » : un seul envoi — l\'opération couvre la fenêtre de confirmation', rS.resume);
  t.vrai(b.global('listeEquipesIncertaine()') === false && b.boutonAjouter().disabled === false,
    'N.3 ⭐ et l\'écran reste FIABLE : plus de « liste peut-être périmée » après une suppression parfaitement réussie',
    { douteux: b.global('listeEquipesIncertaine()'), ajoutFerme: b.boutonAjouter().disabled });

  b = await banc();
  await b.clicOnglet('U10');
  const rV = await b.jouer(() => {
    const bt = b.doc.querySelector('#liste-equipes .bouton-suppr-tout');
    return Promise.all([b.cliquer(bt), b.cliquer(bt)]);
  });
  t.vrai(rV.requetes.filter((r) => r.action === 'supprimerEquipesCategorie').length === 1 &&
    b.global('listeEquipesIncertaine()') === false,
    'N.4 ⭐ double clic sur « Supprimer les N équipes » : un seul envoi, écran fiable', rV.resume);

  b = await banc({ dialogues: [false] });
  const rN = await b.supprimer('ANTONY');
  t.vrai(rN.requetes.length === 0 && b.srv.equipes().length === 21,
    'N.5 confirmation ANNULÉE : rien ne part, rien n\'est supprimé', rN.resume);
  t.vrai(b.global('operationEquipesEnCours()') === false && b.boutonAjouter().disabled === false,
    'N.6 ⭐ et l\'opération se referme : l\'ajout reste possible (une annulation ne verrouille pas l\'écran)',
    { enCours: b.global('operationEquipesEnCours()'), ajoutFerme: b.boutonAjouter().disabled });

  b = await banc();
  await b.ajouter({ nom: 'IDEM', categorie: 'U10', joueurs: 12, educateurs: 2 });
  const rI = await b.ajouter({ nom: 'IDEM', categorie: 'U10', joueurs: 12, educateurs: 2 });
  t.vrai(rI.requetes.length === 0 && b.srv.equipes().filter((e) => e.nom_equipe === 'IDEM').length === 1,
    'N.7 le même nom dans la même catégorie est refusé à l\'écran, sans requête', rI.resume);
  t.vrai(/existe déjà/.test(b.messageEquipe() || ''), 'N.8 et le refus est dit', (b.messageEquipe() || '').slice(0, 60));

  b = await banc();
  const rC = await b.jouer(() => Promise.all([
    b.ajouter({ nom: 'CONCUR', categorie: 'U10', joueurs: 10, educateurs: 1 }),
    b.supprimer('ANTONY')
  ]));
  t.vrai(rC.requetes.filter((r) => /^(ajouter|supprimer)Equipe/.test(r.action)).length === 1,
    'N.9 deux gestes lancés ensemble : UNE seule écriture part, la seconde est refusée par la garde', rC.resume);
  t.vrai(b.srv.equipes().filter((e) => e.nom_equipe === 'CONCUR').length === 1,
    'N.10 et l\'écriture partie est bien la bonne', b.srv.equipes().length);
});

/* ============================ P — pannes ============================ */
await essai('P', async () => {
  let b = await banc({ panne: (e) => (e.action === 'ajouterEquipe' && e.attendue ? 'reseau-apres' : null) });
  await b.ajouter({ nom: 'PERDUE', categorie: 'U10', joueurs: 10, educateurs: 1 });
  t.vrai(b.srv.equipes().filter((e) => e.nom_equipe === 'PERDUE').length === 1 && b.repriseVisible() &&
    b.boutonAjouter().disabled === true,
    'P.1 réponse perdue APRÈS l\'écriture : l\'ajout reste FERMÉ et la reprise est offerte — pas d\'invitation au doublon', null);
  t.vrai(/Impossible de savoir/.test(b.messageEquipe() || ''),
    'P.2 le message ne dit NI « échoué » NI « enregistré » : il dit qu\'on ne sait pas', (b.messageEquipe() || '').slice(0, 70));
  await b.actualiser();
  t.vrai(b.nomsAffiches().indexOf('PERDUE') !== -1 && b.srv.equipes().filter((e) => e.nom_equipe === 'PERDUE').length === 1,
    'P.3 « Actualiser la liste » montre ce que le serveur a retenu, sans créer de second exemplaire', null);

  b = await banc({ panne: (e) => (e.action === 'supprimerEquipe' ? 'reseau-apres' : null) });
  await b.supprimer('ANTONY');
  t.vrai(b.srv.equipes().filter((e) => e.nom_equipe === 'ANTONY').length === 1 && b.repriseVisible() &&
    b.boutonAjouter().disabled === true,
    'P.4 suppression dont la réponse se perd : l\'écran se déclare périmé et ferme les gestes', null);

  b = await banc({ panne: (e) => (e.action === 'ajouterEquipe' ? 'silence' : null) });
  const rSil = await b.ajouter({ nom: 'SILENCE', categorie: 'U10', joueurs: 10, educateurs: 1 });
  t.vrai(!rSil.bloque, 'P.5 SILENCE du serveur : le geste rend la main — le bouton n\'est jamais mort', rSil.resume);
  t.vrai(b.srv.equipes().filter((e) => e.nom_equipe === 'SILENCE').length === 1,
    'P.6 ⭐ et le second essai de l\'ajout (idempotent par contrat) ne crée AUCUN doublon', rSil.resume);

  b = await banc({ panne: (e) => (e.action === 'modifierEquipe' ? 'http500-apres' : null) });
  await b.modifier('MEUDON', { nom: 'MEUDON-B', joueurs: 11, educateurs: 3 });
  t.vrai(b.repriseVisible() && b.boutonAjouter().disabled === true,
    'P.7 erreur serveur sur une modification : issue incertaine, reprise offerte, gestes fermés', null);

  b = await banc();
  await b.ouvrirEdition('MEUDON');
  b.champEdition('champ-edit-nom').value = 'BROUILLON EN COURS';
  await b.jouer(() => b.global('verifierEquipesEnArrierePlan()'));
  const champ = b.champEdition('champ-edit-nom');
  t.vrai(!!champ && champ.value === 'BROUILLON EN COURS',
    'P.8 ⭐ une relecture d\'arrière-plan NE FERME PAS une édition ouverte et ne perd pas la saisie', champ && champ.value);

  b = await banc({ panne: (e, j) => (e.action === 'getEquipes' && j.filter((x) => x.action === 'getEquipes').length === 1 ? 'retarder' : null) });
  await b.ajouter({ nom: 'FRAICHE', categorie: 'U10', joueurs: 10, educateurs: 1 });
  await b.actualiser();
  t.vrai(b.nomsAffiches().indexOf('FRAICHE') !== -1,
    'P.9 une réponse ANCIENNE qui arrive en retard n\'efface pas un état plus récent', b.nomsAffiches().length);
});

/* ============================ V — versions mêlées ============================ */
await essai('V', async () => {
  const combinaisons = [
    ['V.1', 'ancien frontend + NOUVEAU backend', { lire: B.LECTEUR_AVANT, backend: CODE }],
    ['V.2', 'NOUVEAU frontend + ancien backend', { lire: LIRE, backend: B.BACKEND_AVANT() }]
  ];
  for (const [code, libelle, options] of combinaisons) {
    const backendNeuf = options.backend === CODE;
    const b = await B.banc(options);
    const s = b.totauxServeur();
    t.vrai(s.total.equipes === 21 && s.total.joueurs === 327 && s.total.educateurs === 34,
      code + 'a ' + libelle + ' : le jeu de démonstration reste exact', s.total);
    const rA = await b.ajouter({ nom: 'MIX', categorie: 'U10', joueurs: 12, educateurs: 2 });
    t.vrai(!rA.bloque && b.srv.equipes().filter((e) => e.nom_equipe === 'MIX').length === 1 &&
      b.nomsAffiches().indexOf('MIX') !== -1,
      code + 'b ' + libelle + ' : ajouter marche, une seule ligne écrite, affichée', rA.resume);
    const rM = await b.modifier('MEUDON', { nom: 'MEUDON-V', joueurs: 11, educateurs: 3 });
    const rS = await b.supprimer('ANTONY');
    /* ⭐ CE QUI VAUT DANS LES DEUX SENS : ce que le serveur a écrit, il l'a écrit JUSTE. */
    t.vrai(b.srv.equipes().filter((e) => e.nom_equipe === 'MEUDON-V').length === 1,
      code + 'c ' + libelle + ' : modifier est APPLIQUÉ côté serveur, une seule fois', rM.resume);

    if (backendNeuf) {
      t.vrai(b.srv.equipes().filter((e) => e.nom_equipe === 'ANTONY').length === 1,
        code + 'd ' + libelle + ' : supprimer est APPLIQUÉ côté serveur', rS.resume);
    } else {
      /* ⚠️ BACKEND D'AVANT : la suppression a besoin de la liste RELUE pour désigner sa ligne, et
         cette relecture passe par `getInstantaneAdmin`, que ce backend ne connaît pas. Le geste
         n'est donc pas émis. ⭐ CE QUI COMPTE, ET QUI EST VÉRIFIÉ ICI : rien n'a été supprimé À
         L'AVEUGLE. ⛔ Le pire ne serait pas de ne pas supprimer, ce serait de supprimer la
         mauvaise ligne à partir d'une liste qu'on n'a pas pu relire. */
      t.vrai(b.srv.equipes().filter((e) => e.nom_equipe === 'ANTONY').length === 2,
        code + 'd ' + libelle + ' : la suppression n’est pas émise — ⛔ aucune ligne effacée à ' +
        'l’aveugle faute de liste relue', rS.resume);
    }

    if (backendNeuf) {
      /* ⭐ BACKEND COURANT : la relecture sous clé admin passe, l'écran se referme et se rafraîchit. */
      t.vrai(!rM.bloque && !b.doc.querySelector('#liste-equipes .en-edition') &&
        b.nomsAffiches().indexOf('MEUDON-V') !== -1,
        code + 'e ' + libelle + ' : l\'écran se rafraîchit et referme l\'édition', rM.resume);
    } else {
      /* ⚠️ BACKEND D'AVANT + FRONTEND NEUF : la relecture passe par `getInstantaneAdmin`, que ce
         backend ne connaît pas. ⛔ ELLE ÉCHOUE FERMÉ, et c'est VOULU : le contrat de ce lot exige
         qu'une action absente d'un ancien backend fasse échouer, plutôt que de retomber sur
         `getAll` — qui livrerait, lui, le tournoi non publié qu'on vient de fermer.
         ⭐ CE QUE L'ÉCRAN NE FAIT SURTOUT PAS : prétendre que tout va bien. Il ne montre pas un
         état périmé comme s'il était frais.
         ⚠️ CONSÉQUENCE DE DÉPLOIEMENT, dite plutôt que tue : le backend se déploie AVANT le
         frontend. C'est la seule contrainte que la fermeture introduit. */
      const silencieux = !rM.bloque && b.nomsAffiches().indexOf('MEUDON-V') !== -1;
      t.vrai(!silencieux,
        code + 'e ' + libelle + ' : la relecture échoue FERMÉ — ⛔ jamais un état périmé présenté ' +
        'comme frais, ⛔ jamais de repli sur la porte anonyme', rM.resume);
    }
  }
});

console.log('\n' + '─'.repeat(70) + '\nOK — ' + t.n + ' contrôles passés.');
})();
