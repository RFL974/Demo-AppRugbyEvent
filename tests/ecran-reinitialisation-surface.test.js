#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « RÉINITIALISER » — SURFACE COMPLÈTE
 * ============================================================================
 *  ▶ node tests/ecran-reinitialisation-surface.test.js
 *
 *  Le seul geste du produit qui DÉTRUIT. Cette suite l'éprouve de bout en bout : vrais modules du
 *  frontend, vraie page `admin.html`, vrai `js/api.js`, vrai `Code.gs` dans les doublures Google,
 *  sur un tournoi fictif PLEIN.
 *
 *   C — la CONFIRMATION : ce qu'elle nomme, ce qu'elle annonce, et son LIEN avec ce qui s'exécute ;
 *   G — le GESTE confirmé : une chaîne, un rendu depuis le SERVEUR, ⛔ aucune reconstruction locale ;
 *   D — le DOUBLE CLIC et l'arbitrage des commandes ;
 *   P — l'état PÉRIMÉ : deux onglets concurrents, refus honnête, reprise sûre ;
 *   I — l'IDEMPOTENCE vue de l'écran : un second geste sur un classeur déjà vide ;
 *   U — l'issue INCONNUE : réponse perdue, réseau coupé, délai dépassé — ⛔ jamais de rejeu ;
 *   X — les CACHES MÊLÉS : ancien frontend × nouveau backend, et l'inverse ;
 *   L — les LIAISONS : le banc joue EXACTEMENT ce que la page branche ;
 *   Z — les MUTANTS : chaque propriété corrigée, réintroduite comme défaut, DOIT être tuée.
 *
 *  ⛔ Aucun réseau, aucun service Google réel, aucune donnée réelle.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('./banc-ecran-reinitialisation');

const t = B.compteur();
const vrai = t.vrai;
const titre = (s) => console.log('\n' + s);
const actions = (b) => b.requetes();
const SRC_ADMIN = () => fs.readFileSync(path.join(B.RACINE, 'js', 'admin.js'), 'utf8');
/** La demande d'ÉCRITURE de la chaîne (la préparation la précède désormais). */
const ecriture = (b) => b.demandes().filter((d) => d.action === 'reinitialiserTournoi')[0] || {};
const prepa = (b) => b.demandes().filter((d) => d.action === 'preparerReinitialisation')[0] || {};

(async function () {

  /* ============================== C — la confirmation ============================== */
  titre('C — la confirmation : ce qu’elle nomme, et ce à quoi elle est LIÉE');
  {
    const b = await B.banc();
    await b.clic('bouton-reinitialiser', 60);
    const d1 = b.dialogues[0].message, d2 = b.dialogues[1].message;
    vrai(b.dialogues.length === 2 && b.dialogues[0].opts.danger === true && b.dialogues[1].opts.danger === true,
      'C.1 DEUX confirmations, toutes deux marquées « danger »', b.dialogues.map((d) => d.opts));
    [['catégories', /catégories/], ['équipes', /équipes/], ['poules', /poules/], ['matchs', /matchs/],
     ['infos du tournoi', /infos du tournoi/], ['horaires', /horaires/],
     ['réponse des clubs', /RÉPONSE à cette édition/], ['demande d’autorisation', /demande d'autorisation/]]
      .forEach(([quoi, motif]) => vrai(motif.test(d1),
        'C.2 la 1re confirmation NOMME ce qui est détruit — ' + quoi));
    [['champs permanents du club', /PERMANENTES de votre club/], ['historique de saison', /historique de saison/],
     ['carnet d’adresses', /carnet d'adresses/], ['partenaires', /partenaires/]]
      .forEach(([quoi, motif]) => vrai(motif.test(d1),
        'C.3 elle NOMME aussi ce qui est conservé — ' + quoi));
    vrai(/IRRÉVERSIBLE/.test(d2), 'C.4 la 2de confirmation dit l’IRRÉVERSIBILITÉ', d2.slice(0, 60));
    vrai(/masqué/.test(d2) && /table de marque/.test(d2) && /ancien cessera de fonctionner/.test(d2),
      'C.5 ⭐ et les conséquences RÉELLES : publication retirée, lien d’accès de la table de marque caduc', d2);
    vrai(/5 catégorie\(s\), 21 équipe\(s\), 8 poule\(s\) et 34 match\(s\)/.test(d2),
      'C.6 ⭐⭐ elle CHIFFRE ce qui part, tel que l’écran le voit à l’instant', d2);
  }
  {
    /* ⭐⭐ LE LIEN PASSE PAR LE SERVEUR, et c'est la correction de fond. Les chiffres annoncés
       viennent de la PRÉPARATION, et le jeton qui les accompagne est celui que l'écriture emporte.
       ⛔ Le navigateur ne fabrique plus rien depuis sa mémoire : une égalité de comptes ne prouvait
       pas une égalité d'état, et neuf changements de contenu sur dix passaient inaperçus. */
    const b = await B.banc();
    await b.clic('bouton-reinitialiser', 90);
    const annonce = /• (\d+) catégorie\(s\), (\d+) équipe\(s\), (\d+) poule\(s\) et (\d+) match\(s\)/.exec(b.dialogues[1].message);
    vrai(!!annonce && Number(annonce[1]) === 5 && Number(annonce[2]) === 21 &&
         Number(annonce[3]) === 8 && Number(annonce[4]) === 34,
      'C.7 ⭐⭐ les chiffres de la confirmation sont ceux du SERVEUR (préparation), pas de la mémoire de l’écran',
      annonce && annonce.slice(1));
    vrai(/tels que le SERVEUR les voit/.test(b.dialogues[1].message),
      'C.7 bis ⭐ et le texte le DIT : « tels que le SERVEUR les voit »');
    vrai(/^[0-9a-f]{64}$/.test(String(ecriture(b).jeton_etat)),
      'C.8 ⭐⭐ l’écriture emporte le JETON D’ÉTAT du serveur, ⛔ jamais des comptes locaux',
      String(ecriture(b).jeton_etat).slice(0, 16) + '…');
    vrai(ecriture(b).etat_vu === undefined,
      'C.8 bis ⛔ et plus aucune précondition cardinale n’est envoyée', Object.keys(ecriture(b)));
  }
  {
    /* ⛔ LE CLIENT NE DÉCRIT AUCUN PÉRIMÈTRE : la demande ne porte QUE l’action, le jeton, la
       demande d’état relu et la clé. ⭐ Aucune feuille, aucune plage, aucun champ, aucune ressource. */
    const b = await B.banc();
    await b.clic('bouton-reinitialiser', 90);
    const cles = Object.keys(ecriture(b)).sort();
    vrai(JSON.stringify(cles) === JSON.stringify(['action', 'cle', 'jeton_etat', 'renvoyer_etat']),
      'C.9 ⭐⭐ la demande ne porte QUE action + jeton_etat + renvoyer_etat + clé — ⛔ le navigateur ne nomme AUCUN périmètre',
      cles);
    vrai(JSON.stringify(Object.keys(prepa(b)).sort()) === JSON.stringify(['action', 'cle']),
      'C.9 bis ⛔ et la PRÉPARATION ne porte rien d’autre que l’action et la clé', Object.keys(prepa(b)));
  }
  {
    /* ⭐⭐ LE JETON EST RENVOYÉ TEL QUEL — ⛔ ni recalculé, ni tronqué, ni complété. On lit celui que
       le serveur a produit et celui que l'écran a renvoyé, et on exige l'égalité STRICTE. */
    const srv = B.serveur(B.BACKEND_COURANT());
    const b = B.navigateur(srv, B.lecteur(), {});
    await b.ouvrir();
    b.remettre();
    let jetonServeur = null;
    const vraiPost = srv.postMesure;
    srv.postMesure = function (corps, libelle) {
      const r = vraiPost.call(srv, corps, libelle);
      if (corps.action === 'preparerReinitialisation' && r.reponse) jetonServeur = r.reponse.jeton_etat;
      return r;
    };
    await b.clic('bouton-reinitialiser', 90);
    srv.postMesure = vraiPost;
    vrai(!!jetonServeur && ecriture(b).jeton_etat === jetonServeur,
      'C.10 ⭐⭐ le jeton du serveur est renvoyé au CARACTÈRE PRÈS', [String(jetonServeur).slice(0, 12), String(ecriture(b).jeton_etat).slice(0, 12)]);
  }
  {
    /* ⛔ SANS JETON, LA PROMESSE N'EST PAS ÉCRITE — c'est le point de véracité de la correction.
       🔬 Le premier passage promettait un refus SANS RÉSERVE, alors que la protection ne couvrait que
       les cardinalités. Ici : avec jeton, la promesse est faite ET tenue ; sans jeton, elle laisse la
       place à un avertissement explicite d'ABSENCE de protection. */
    const b = await B.banc({ backend: B.BACKEND_AVANT() });
    await b.clic('bouton-reinitialiser', 150);
    const d2 = b.dialogues[1].message;
    vrai(!/sera REFUSÉE/.test(d2),
      'C.11 ⭐⭐ backend d’avant : la promesse de refus n’est PAS affichée', d2.slice(0, 120));
    vrai(/ne sait pas encore vérifier/.test(d2) && /SANS avertissement/.test(d2),
      'C.12 ⭐⭐ et l’absence de protection est DITE, en toutes lettres', d2);
    vrai(!/Seront supprimés/.test(d2),
      'C.13 ⛔ aucun chiffre « serveur » n’est annoncé quand le serveur n’en a pas donné', d2);
    const c = await B.banc();
    vrai(/sera REFUSÉE/.test((await (async () => { await c.clic('bouton-reinitialiser', 90); return c; })()).dialogues[1].message),
      'C.14 ⭐ avec jeton, la promesse EST faite (et le serveur la tient — voir P)');
    vrai(/même sans changer le NOMBRE/.test(c.dialogues[1].message),
      'C.15 ⭐⭐ et elle précise qu’un changement à NOMBRE CONSTANT est aussi détecté', c.dialogues[1].message);
  }
  {
    /* ⭐ LES CORRECTIONS DE VÉRACITÉ DU TEXTE (contre-épreuve). */
    const b = await B.banc();
    await b.clic('bouton-reinitialiser', 90);
    const d1 = b.dialogues[0].message;
    vrai(/clubs issus du JEU DE DÉMONSTRATION sont, eux, RETIRÉS du carnet/.test(d1),
      'C.16 ⭐⭐ le texte ne prétend plus que TOUT le carnet est conservé : les identités de démonstration en partent', d1);
    vrai(/le MODE de calcul de l'heure de fin et l'option de pause échelonnée, eux, sont conservés/.test(d1),
      'C.17 ⭐⭐ il ne prétend plus effacer TOUS les réglages horaires', d1);
    vrai(/l'AFFICHE du tournoi et la PHOTO du parking sont mises à la corbeille/.test(d1),
      'C.18 ⭐⭐ et les deux fichiers Drive sont NOMMÉS', d1);
    vrai(/2 fichier\(s\) actuellement/.test(d1) && /2 actuellement/.test(d1),
      'C.19 ⭐ avec leurs NOMBRES, tenus du serveur', d1.slice(-260));
  }

  /* ============================== G — le geste confirmé ============================== */
  titre('G — le geste confirmé : rendu depuis le SERVEUR, jamais reconstruit');
  {
    const b = await B.banc();
    await b.clic('bouton-reinitialiser', 60);
    vrai(b.srv.vide(), 'G.1 le classeur est réellement vide côté serveur', b.etatServeur());
    vrai(JSON.stringify(b.etatEcran()) === JSON.stringify(b.etatServeur()),
      'G.2 ⭐⭐ l’écran montre EXACTEMENT ce que le serveur contient', [b.etatEcran(), b.etatServeur()]);
    vrai(/✅ Tournoi réinitialisé/.test(b.message()) && /5 catégorie\(s\), 21 équipe\(s\), 8 poule\(s\), 34 match\(s\)/.test(b.message()),
      'G.3 le message annonce ce qui a été supprimé, avec les comptes du SERVEUR', b.message());
    vrai(b.clubsEcran() === 0, 'G.4 la liste des clubs en mémoire a été OUBLIÉE puis relue', b.clubsEcran());
    vrai(b.bouton().disabled === false && b.bouton().textContent === 'Réinitialiser le tournoi',
      'G.5 le bouton retrouve son état — ⛔ jamais laissé sur « Réinitialisation… »', b.bouton().textContent);
    vrai(b.rechargements() === 0, 'G.6 aucun rechargement de page n’a été nécessaire', b.rechargements());
  }
  {
    /* ⭐⭐ AUCUNE RECONSTRUCTION OPTIMISTE : on fait répondre au serveur un état QUI N’EST PAS VIDE
       (impossible en vrai, mais c’est justement le point) et l’on exige que l’écran peigne CELUI-LÀ.
       ⛔ Un écran qui « saurait » qu’après un reset tout est vide afficherait 0 et passerait à côté. */
    const srv = B.serveur(B.BACKEND_COURANT());
    const b = B.navigateur(srv, B.lecteur(), {});
    await b.ouvrir();
    b.remettre();
    const vraiPost = srv.postMesure;
    srv.postMesure = function (corps, libelle) {
      const s = vraiPost.call(srv, corps, libelle);
      if (corps.action === 'reinitialiserTournoi' && s.reponse && s.reponse.etat) {
        s.reponse.etat.equipes = [{ id_equipe: 'E-TEMOIN', nom_equipe: 'TÉMOIN DU SERVEUR', categorie: 'U10' }];
      }
      return s;
    };
    await b.clic('bouton-reinitialiser', 60);
    srv.postMesure = vraiPost;
    vrai(b.etatEcran().equipes === 1,
      'G.7 ⭐⭐ l’écran peint ce que le SERVEUR a répondu — ⛔ il ne reconstruit pas « tout est vide » de lui-même',
      b.etatEcran());
  }
  {
    /* ⭐ L’AUTORITÉ VA JUSQU’AUX CHAMPS CONSERVÉS : `email_expediteur` survit au reset, et l’écran
       le tient du serveur. ⛔ Vider `configCourante` localement l’aurait effacé à l’écran, et le
       prochain enregistrement l’aurait écrasé par une chaîne vide. */
    const b = await B.banc();
    await b.clic('bouton-reinitialiser', 60);
    const cfg = b.valeur('configCourante');
    vrai(cfg && cfg.global && cfg.global.email_expediteur === B.MR.REMPLISSAGE.email_expediteur,
      'G.8 ⭐⭐ `email_expediteur` est toujours à l’écran après le reset — il est CONSERVÉ par le serveur',
      cfg && cfg.global && cfg.global.email_expediteur);
    vrai(cfg.global.org_club_nom === B.MR.REMPLISSAGE.org_club_nom && cfg.global.tournoi_nom === '',
      'G.9 et la partition se voit à l’écran : le club permanent reste, le nom du tournoi part',
      [cfg.global.org_club_nom, cfg.global.tournoi_nom]);
  }

  /* ============================== D — double clic et arbitrage ============================== */
  titre('D — double clic : une seule chaîne métier');
  {
    const b = await B.banc();
    await b.doubleClic('bouton-reinitialiser', 80);
    vrai(actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1,
      'D.1 ⭐⭐ DEUX clics rapprochés : UNE seule réinitialisation émise', actions(b));
    vrai(b.dialogues.length === 2,
      'D.2 ⭐⭐ et DEUX questions posées en tout — ⛔ pas deux chaînes de confirmation en parallèle',
      b.dialogues.length);
    vrai(b.srv.editions().length === 2,
      'D.3 côté serveur, une seule bascule d’édition', b.srv.editions().length);
  }
  {
    /* ⭐ LA GARDE TIENT PENDANT LES CONFIRMATIONS, pas seulement pendant la requête : on clique une
       seconde fois alors que la PREMIÈRE question est encore à l’écran. */
    let repondre1 = null;
    const b = await B.banc({ dialogues: [() => new Promise((r) => { repondre1 = r; }), true, true, true] });
    b.clicSansAttendre('bouton-reinitialiser');
    await b.tour(3);
    vrai(b.bouton().disabled === true,
      'D.4 ⭐⭐ le bouton est DÉSACTIVÉ dès le premier clic, avant même la première réponse', b.bouton().disabled);
    b.clicSansAttendre('bouton-reinitialiser');
    await b.tour(3);
    vrai(b.dialogues.length === 1,
      'D.5 ⭐⭐ le second clic n’ouvre PAS une seconde chaîne de confirmations', b.dialogues.length);
    repondre1(true);
    await b.tour(80);
    vrai(actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1 && b.srv.vide(),
      'D.6 et la chaîne unique va jusqu’au bout', actions(b));
    vrai(b.bouton().disabled === false, 'D.7 le bouton est rendu à la fin', b.bouton().disabled);
  }
  {
    /* ⭐ PENDANT L’ÉCRITURE, le bouton reste inactif et dit ce qu’il fait. */
    const b = await B.banc({ pannes: { reinitialiserTournoi: 'silence' } });
    b.clicSansAttendre('bouton-reinitialiser');
    await b.tour(10);
    vrai(b.bouton().disabled === true && b.bouton().textContent === 'Réinitialisation…',
      'D.8 pendant l’écriture, le bouton est inactif et annonce « Réinitialisation… »',
      [b.bouton().disabled, b.bouton().textContent]);
    await b.clic('bouton-reinitialiser', 5);
    vrai(actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1,
      'D.9 ⭐⭐ un clic PENDANT l’écriture n’en émet pas une seconde', actions(b));
  }
  {
    /* ⛔ ET L’ÉCRAN N’OFFRE QU’UN SEUL GESTE DESTRUCTIF : il n’y a pas deux périmètres à arbitrer.
       ⭐ Ce n’est pas une excuse, c’est un fait qu’on VÉRIFIE — le jour où un second bouton
       apparaîtrait, ce contrôle tomberait et réclamerait son arbitrage. */
    const b = await B.banc();
    await b.arriver();
    const boutons = b.el('bloc-reinitialisation').querySelectorAll('button');
    vrai(boutons.length === 1 && boutons[0].id === 'bouton-reinitialiser',
      'D.10 ⭐⭐ l’écran n’expose QU’UN geste destructif : un seul niveau de réinitialisation, donc un seul contrat',
      boutons.map((x) => x.id));
  }

  /* ============================== P — l'état périmé, deux onglets ============================== */
  titre('P — deux onglets concurrents : l’onglet A ne détruit pas le travail de l’onglet B');

  /** Un parcours où B agit à un instant PRÉCIS de la chaîne, par une route RÉELLE. */
  async function concurrence(quand, agirB) {
    let b = null;
    const dialogues = quand === 'entre'
      ? [() => { agirB(b.srv); return true; }, true]     // B agit APRÈS la 1re réponse
      : [true, () => { agirB(b.srv); return true; }];    // B agit APRÈS la 2de réponse
    b = await B.banc({ dialogues });
    await b.clic('bouton-reinitialiser', 120);
    return b;
  }

  /* ⭐ LES DIX MODIFICATIONS DE LA CONTRE-ÉPREUVE, à CARDINALITÉ ÉGALE. ⛔ Aucune ne change les
     quatre comptes : c'est exactement ce que la précondition cardinale ne voyait pas. */
  const MODIFS = [
    ['nom d’une équipe (route modifierEquipe)', (srv) => {
      const e = srv.equipes()[0];
      srv.autreOnglet({ action: 'modifierEquipe', id_equipe: e.id_equipe,
        nom_equipe: 'RENOMMÉE PAR B', categorie: e.categorie });
      return () => srv.equipes().some((x) => String(x.nom_equipe) === 'RENOMMÉE PAR B');
    }],
    ['équipe REMPLACÉE, total identique', (srv) => {
      const e = srv.equipes()[0];
      srv.autreOnglet({ action: 'supprimerEquipe', id_equipe: e.id_equipe });
      srv.autreOnglet({ action: 'ajouterEquipe', nom_equipe: 'NEUVE DE B', categorie: e.categorie });
      return () => srv.equipes().some((x) => String(x.nom_equipe) === 'NEUVE DE B');
    }],
    ['SCORE d’un match saisi', (srv) => {
      const f = srv.classeur.getSheetByName('Matchs');
      const d = f.getDataRange().getValues();
      d[1][d[0].indexOf('score_A')] = '17';
      f.getRange(1, 1, d.length, d[0].length).setValues(d);
      return () => srv.matchs().some((x) => String(x.score_A) === '17');
    }],
    ['COMPOSITION d’une poule', (srv) => {
      const f = srv.classeur.getSheetByName('Equipes');
      const d = f.getDataRange().getValues();
      const i = d[0].indexOf('poule');
      const avant = String(d[1][i]);
      d[1][i] = avant === 'A' ? 'B' : 'A';
      f.getRange(1, 1, d.length, d[0].length).setValues(d);
      return () => String(srv.equipes()[0].poule) !== avant;
    }],
    ['une CATÉGORIE modifiée', (srv) => {
      const c = srv.config().categories[0];
      srv.autreOnglet(Object.assign({ action: 'enregistrerCategorie', mode: 'modifier', base: c }, c,
        { duree_mi_temps_min: '11' }));
      return () => (srv.config().categories || []).some((x) => String(x.duree_mi_temps_min) === '11');
    }],
    ['un champ Config du périmètre', (srv) => {
      srv.autreOnglet({ action: 'enregistrerDossierAutorisation', org_medecin_nom: 'Dr POSÉ PAR B' });
      return () => String(srv.zoneA().org_medecin_nom) === 'Dr POSÉ PAR B';
    }],
    ['un CONTACT DE SÉCURITÉ', (srv) => {
      srv.autreOnglet({ action: 'enregistrerContactsSecurite', referent_nom: 'RÉFÉRENT DE B', referent_tel: '0611111111' });
      return () => String(srv.zoneA().referent_nom) === 'RÉFÉRENT DE B';
    }],
    ['AFFICHE remplacée par un autre fichier', (srv) => {
      B.MR.poserParam(srv, 'tournoi_affiche_id', 'drive-affiche-DE-B');
      return () => String(srv.zoneA().tournoi_affiche_id) === 'drive-affiche-DE-B';
    }],
    ['une PARTICIPATION modifiée', (srv) => {
      const f = srv.classeur.getSheetByName('Participations');
      const d = f.getDataRange().getValues();
      d[1][d[0].indexOf('statut')] = 'Décliné';
      f.getRange(1, 1, d.length, d[0].length).setValues(d);
      return () => srv.appeler('lireOngletSimple', srv.classeur, 'Participations')
        .some((p) => String(p.statut) === 'Décliné');
    }],
    ['un ajout COMPENSÉ par une suppression', (srv) => {
      const e = srv.equipes();
      srv.autreOnglet({ action: 'ajouterEquipe', nom_equipe: 'COMPENSÉE DE B', categorie: e[0].categorie });
      srv.autreOnglet({ action: 'supprimerEquipe', id_equipe: e[1].id_equipe });
      return () => srv.equipes().some((x) => String(x.nom_equipe) === 'COMPENSÉE DE B');
    }]
  ];

  for (const fenetre of ['entre', 'apres']) {
    const libelle = fenetre === 'entre' ? 'ENTRE les deux confirmations' : 'APRÈS la dernière confirmation';
    let pertes = 0, refus = 0;
    for (const [quoi, agir] of MODIFS) {
      let survit = null;
      const b = await concurrence(fenetre, (srv) => { survit = agir(srv); });
      const aRefuse = /Rien n’a été effacé|a changé depuis ta confirmation/.test(b.message());
      const intact = !b.srv.vide() && (!survit || survit());
      if (aRefuse) refus++;
      if (!aRefuse && !intact) pertes++;
      vrai(aRefuse && intact,
        'P — ' + libelle + ', cardinalité ÉGALE (' + quoi + ') : REFUS, et le travail de B est intact',
        [aRefuse, intact, b.message().replace(/\s+/g, ' ').slice(0, 90)]);
    }
    vrai(pertes === 0 && refus === MODIFS.length,
      'P ⭐⭐ ' + libelle + ' : ' + refus + '/' + MODIFS.length + ' refus, ⛔ ZÉRO perte silencieuse à cardinalité égale',
      [refus, pertes]);
  }
  {
    /* ⭐ LE REFUS EST HONNÊTE, ET LA REPRISE EST SÛRE. */
    let survit = null;
    const b = await concurrence('apres', (srv) => { survit = MODIFS[2][1](srv); });
    vrai(/RIEN n'a été effacé/.test(b.message()) && /contient maintenant/.test(b.message()),
      'P.1 ⭐⭐ le message dit que RIEN n’a été effacé, et ce que le classeur contient', b.message().replace(/\s+/g, ' ').slice(0, 150));
    vrai(!/forc|écras|quand même/i.test(b.message()),
      'P.2 ⭐⭐ ⛔ AUCUN écrasement automatique n’est proposé', b.message());
    vrai(actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1,
      'P.3 ⛔ la demande refusée n’est PAS réémise', actions(b));
    vrai(/relu/.test(b.message()) && b.bouton().disabled === false,
      'P.4 ⭐ l’écran annonce sa relecture et reste utilisable', b.bouton().disabled);
    vrai(survit(), 'P.5 le travail de B est bel et bien là');
    /* ⭐ LA REPRISE : un nouveau clic REDEMANDE un jeton, et aboutit. */
    b.remettre();
    await b.clic('bouton-reinitialiser', 120);
    vrai(actions(b).filter((a) => a === 'preparerReinitialisation').length === 1 && b.srv.vide(),
      'P.6 ⭐⭐ la reprise passe par une NOUVELLE préparation — ⛔ jamais par le jeton périmé — et aboutit',
      actions(b));
  }
  {
    /* ⛔ ET UN CHANGEMENT DE CARDINALITÉ est toujours détecté, comme avant. */
    const b = await concurrence('apres', (srv) => {
      srv.autreOnglet({ action: 'ajouterEquipe', nom_equipe: 'ÉQUIPE DE B', categorie: 'U10' });
    });
    vrai(!b.srv.vide() && /a changé depuis ta confirmation/.test(b.message()),
      'P.7 un changement de NOMBRE est refusé lui aussi', b.message().replace(/\s+/g, ' ').slice(0, 110));
  }

  /* ============================== I — l’idempotence vue de l’écran ============================== */
  titre('I — un second geste sur un classeur déjà vide');
  {
    const b = await B.banc();
    await b.clic('bouton-reinitialiser', 60);
    const editions = b.srv.editions().length;
    b.remettre();
    await b.clic('bouton-reinitialiser', 60);
    vrai(/déjà réinitialisé/.test(b.message()) && !/✅ Tournoi réinitialisé/.test(b.message()),
      'I.1 ⭐⭐ l’écran DIT « déjà réinitialisé » — ⛔ il n’annonce pas un second effacement qui n’a pas eu lieu',
      b.message());
    vrai(b.srv.editions().length === editions,
      'I.2 ⭐⭐ aucune édition de plus au registre', [editions, b.srv.editions().length]);
    vrai(/0 catégorie/.test(b.message()) === false,
      'I.3 ⛔ et le message ne dit pas « Supprimés : 0 catégorie(s)… », qui laisserait croire à un effacement',
      b.message());
    vrai(b.bouton().disabled === false, 'I.4 le bouton reste utilisable', b.bouton().disabled);
  }

  /* ============================== U — l’issue inconnue ============================== */
  titre('U — réponse perdue, réseau coupé, délai dépassé : jamais de certitude fausse, jamais de rejeu');
  {
    /* ⭐ LA RÉPONSE EST PERDUE APRÈS QUE LE SERVEUR A TERMINÉ. */
    const b = await B.banc({ pannes: (d) => (d.action === 'reinitialiserTournoi' ? 'perdue' : null) });
    await b.clic('bouton-reinitialiser', 90);
    vrai(b.srv.vide(), 'U.1 le serveur, lui, a bien réinitialisé', b.etatServeur());
    vrai(actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1,
      'U.2 ⭐⭐ ⛔ AUCUN rejeu automatique de l’action destructive', actions(b));
    vrai(/n’est pas confirmée/.test(b.message()) && /Rien n’est renvoyé automatiquement/.test(b.message()),
      'U.3 ⭐⭐ le message dit que RIEN n’est confirmé et que rien n’est renvoyé', b.message());
    vrai(/elle a bien eu lieu/.test(b.message()),
      'U.4 ⭐ puis il dit ce que la RELECTURE a trouvé : le tournoi est vide, elle a eu lieu', b.message());
    vrai(!/^✅/.test(b.message()) && !/⚠️ Erreur|échec/i.test(b.message()),
      'U.5 ⭐⭐ ⛔ ni succès certain, ni échec certain', b.message());
    vrai(b.bouton().disabled === false, 'U.6 l’écran reste utilisable', b.bouton().disabled);
    vrai(JSON.stringify(b.etatEcran()) === JSON.stringify(b.etatServeur()),
      'U.7 et l’écran montre l’état RÉEL, relu', [b.etatEcran(), b.etatServeur()]);
  }
  {
    /* ⭐ LE RÉSEAU EST COUPÉ AVANT LE SERVEUR : rien n’a eu lieu, et l’écran le dit. */
    let premier = true;
    const b = await B.banc({ pannes: (d) => {
      if (d.action !== 'reinitialiserTournoi') return null;
      if (premier) { premier = false; return 'reseau'; }
      return null;
    } });
    await b.clic('bouton-reinitialiser', 90);
    vrai(!b.srv.vide(), 'U.8 le serveur n’a rien fait', b.etatServeur());
    vrai(/n’est pas confirmée/.test(b.message()) && /n’a pas eu lieu/.test(b.message()) && /recommencer/.test(b.message()),
      'U.9 ⭐⭐ l’écran dit l’incertitude, puis que la relecture montre un tournoi INTACT, et invite à recommencer',
      b.message());
    vrai(actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1,
      'U.10 ⛔ toujours aucun rejeu automatique', actions(b));
    /* ⭐ ET LA REPRISE APRÈS RELECTURE FONCTIONNE. */
    b.remettre();
    await b.clic('bouton-reinitialiser', 60);
    vrai(b.srv.vide() && /✅ Tournoi réinitialisé/.test(b.message()),
      'U.11 ⭐⭐ un nouveau clic, après la relecture, réussit', b.message().slice(0, 80));
  }
  {
    /* ⭐ LE DÉLAI EST DÉPASSÉ : le serveur ne répond jamais. */
    const b = await B.banc({ pannes: { reinitialiserTournoi: 'silence' } });
    await b.clic('bouton-reinitialiser', 1400);
    vrai(/délai de 180 s dépassé/.test(b.message()),
      'U.12 ⭐⭐ l’attente est BORNÉE et la cause est NOMMÉE (180 s)', b.message());
    vrai(actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1,
      'U.13 ⛔ un délai dépassé ne réémet JAMAIS une action destructive', actions(b));
    vrai(b.bouton().disabled === false && b.bouton().textContent === 'Réinitialiser le tournoi',
      'U.14 ⭐ et le bouton est rendu — ⛔ l’écran ne reste pas figé sur « Réinitialisation… »',
      [b.bouton().disabled, b.bouton().textContent]);
  }
  {
    /* ⭐ L’ERREUR STRUCTURÉE AVANT TOUT TRAITEMENT : registre en anomalie. */
    const b = await B.banc({ avant: (srv) => {
      srv.feuilles.get('Editions').cellules.push(['edition-fictive-seconde', 'active', '2026-09-01 08:00:00', '']);
    } });
    const avant = b.etatServeur();
    await b.clic('bouton-reinitialiser', 60);
    vrai(/Registre des éditions incohérent/.test(b.message()),
      'U.15 refus lisible du serveur : le message le reprend tel quel', b.message().slice(0, 100));
    vrai(JSON.stringify(b.etatServeur()) === JSON.stringify(avant),
      'U.16 ⭐⭐ et RIEN n’a été effacé', b.etatServeur());
    vrai(b.bouton().disabled === false, 'U.17 le bouton est rendu', b.bouton().disabled);
  }
  {
    /* ⭐ LE FILET DE SECOURS : la relecture échoue → la page est RECHARGÉE, ⛔ jamais repeinte. */
    const b = await B.banc({ pannes: (d) => (d.action === 'getDossierAutorisation' ? 'reseau' : null) });
    await b.clic('bouton-reinitialiser', 120);
    vrai(b.srv.vide() && /n'a pas pu être entièrement rafraîchi/.test(b.message()),
      'U.18 ⭐⭐ relecture d’écran en échec : l’acquis est DIT, et l’écran incomplet aussi — jamais l’inverse',
      b.message());
    vrai(/✅ Tournoi réinitialisé/.test(b.message()),
      'U.19 ⛔ l’écriture ACQUISE n’est jamais reniée pour une panne d’affichage', b.message().slice(0, 60));
  }

  /* ============================== R — la propagation publique ============================== */
  titre('R — la page publique : ce que l’écran promet, et ce qu’il refuse de promettre');
  {
    /* ① RELAIS CONFIGURÉ ET CALME : la propagation est confirmée, l'écran n'avertit de rien. */
    const b = await B.banc({ avant: (srv) => {
      srv.proprietes.set('RELAIS_URL', 'https://relais-fictif.invalid/instantane');
      srv.proprietes.set('RELAIS_CLE', 'CLE-FICTIVE-RELAIS');
      srv.contexte.UrlFetchApp = { fetch() { return { getResponseCode: () => 200, getContentText: () => '{}' }; } };
    } });
    await b.clic('bouton-reinitialiser', 150);
    vrai(/✅ Tournoi réinitialisé/.test(b.message()) && !/différé/.test(b.message()),
      'R.1 relais joignable et calme : ⛔ aucun avertissement de propagation inventé', b.message().slice(0, 90));
  }
  {
    /* ② ⭐ ACTIVITÉ CONTINUE : la génération de l'état public change À CHAQUE lecture — le serveur ne
       peut donc JAMAIS prouver que sa poussée est encore courante. ⛔ Il refuse de dire « réussi »,
       et l'écran doit REPRENDRE cet aveu au lieu d'annoncer une page publique à jour.
       ⭐ La simulation est déterministe et BLANCHE : on rend la génération toujours différente d'une
       lecture à l'autre, ce qu'une écriture concurrente permanente produirait. */
    const b = await B.banc({ avant: (srv) => {
      srv.proprietes.set('RELAIS_URL', 'https://relais-fictif.invalid/instantane');
      srv.proprietes.set('RELAIS_CLE', 'CLE-FICTIVE-RELAIS');
      srv.contexte.UrlFetchApp = { fetch() { return { getResponseCode: () => 200, getContentText: () => '{}' }; } };
      /* ⭐ ACTIVITÉ CONTINUE, simulée de façon DÉTERMINISTE : le descripteur DURABLE de l'état
         public change à CHAQUE lecture — exactement ce qu'une écriture permanente produirait. Le
         serveur ne peut alors JAMAIS prouver que sa poussée est encore courante. */
      const base = srv.contexte.PropertiesService.getScriptProperties;
      let n = 0;
      srv.contexte.PropertiesService.getScriptProperties = function () {
        const p = base.call(this);
        return {
          getProperty(k) {
            return k === 'INSTANTANE_DESCRIPTEUR'
              ? JSON.stringify({ v: 'version-fictive-' + (++n), h: '' }) : p.getProperty(k);
          },
          setProperty(k, v) { return p.setProperty(k, v); },
          deleteProperty(k) { return p.deleteProperty(k); },
          setProperties(o) { return p.setProperties(o); },
          getProperties() { return p.getProperties(); }
        };
      };
    } });
    await b.clic('bouton-reinitialiser', 150);
    vrai(/différé/.test(b.message()),
      'R.2 ⭐⭐ propagation NON CONFIRMÉE : l’écran le DIT — ⛔ il n’annonce pas une page publique à jour',
      b.message().slice(0, 200));
    vrai(/SONT effacées/.test(b.message()),
      'R.3 … et il dit aussi ce qui EST acquis : les données, elles, sont bien effacées',
      b.message().slice(0, 200));
    vrai(b.srv.vide(), 'R.4 ⛔ le classeur EST réinitialisé : une propagation incertaine n’annule rien',
      b.etatServeur());
    vrai(actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1,
      'R.5 ⛔ AUCUNE RÉÉMISSION : une seule écriture destructive, malgré l’issue partielle', actions(b));
  }

  /* ============================== X — les caches mêlés ============================== */
  titre('X — versions mêlées : ancien frontend × nouveau backend, et l’inverse');
  {
    /* ① NOUVEAU FRONTEND × ANCIEN BACKEND — la réponse ne porte ni état, ni `deja_reinitialise`. */
    const b = await B.banc({ backend: B.BACKEND_AVANT() });
    await b.clic('bouton-reinitialiser', 90);
    vrai(b.srv.vide(), 'X.1 la réinitialisation aboutit quand même', b.etatServeur());
    vrai(actions(b).indexOf('getAll') !== -1 && actions(b).indexOf('getConfigAdmin') !== -1,
      'X.2 ⭐⭐ sans état joint, l’écran RETOMBE sur ses deux lectures d’avant — ⛔ il ne devine rien',
      actions(b));
    vrai(JSON.stringify(b.etatEcran()) === JSON.stringify(b.etatServeur()),
      'X.3 ⭐ et l’écran finit exact', [b.etatEcran(), b.etatServeur()]);
    vrai(/✅ Tournoi réinitialisé/.test(b.message()),
      'X.4 le message reste celui du succès', b.message().slice(0, 60));
    vrai(actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1,
      'X.5 ⛔ une seule écriture destructive', actions(b));
    /* ⛔ ET LA PROTECTION DE CONCURRENCE N’EXISTE PAS DE CE CÔTÉ — on le DIT, on ne le maquille pas. */
    const b2 = await B.banc({ backend: B.BACKEND_AVANT() });
    await b2.arriver();
    b2.remettre();
    b2.srv.autreOnglet({ action: 'ajouterEquipe', nom_equipe: 'ÉQUIPE FICTIVE DE B', categorie: 'U10' });
    await b2.clic('bouton-reinitialiser', 90);
    vrai(b2.srv.vide(),
      'X.6 ⚠️ ancien backend : la précondition est IGNORÉE et le travail concurrent est détruit — ' +
      'c’est le défaut que ce lot ferme CÔTÉ SERVEUR, et ⛔ aucune combinaison ancienne n’est présentée comme protégée',
      b2.etatServeur());
  }
  {
    /* ② ANCIEN FRONTEND × NOUVEAU BACKEND — le module d’écran d’avant, sur le serveur d’aujourd’hui. */
    const b = await B.banc({ js: B.lecteurMele(['js/admin.js']) });
    await b.clic('bouton-reinitialiser', 90);
    vrai(b.srv.vide(), 'X.7 ⭐⭐ la réinitialisation fonctionne — ⛔ ni erreur JavaScript, ni écran vide', b.etatServeur());
    vrai(actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1,
      'X.8 ⛔ une seule écriture — pas de double exécution', actions(b));
    vrai(b.demandes()[0].etat_vu === undefined && b.demandes()[0].renvoyer_etat === undefined,
      'X.9 ⭐ l’ancien module n’envoie ni précondition ni demande d’état', Object.keys(b.demandes()[0]));
    vrai(actions(b).indexOf('getAll') !== -1,
      'X.10 ⭐ il relit donc `getAll` comme avant, et le serveur le sert', actions(b));
    vrai(JSON.stringify(b.etatEcran()) === JSON.stringify(b.etatServeur()) && /✅/.test(b.message()),
      'X.11 ⭐ l’écran finit exact, et le message est celui du succès', [b.etatEcran(), b.message().slice(0, 40)]);
  }
  {
    /* ③ MODULE D’ÉCRAN NOUVEAU × RÉPONSE D’AVANT (backend redéployé à l’ancien entre deux clics). */
    const b = await B.banc({ pannes: { reinitialiserTournoi: 'ancienne' } });
    await b.clic('bouton-reinitialiser', 90);
    vrai(b.srv.vide() && /✅ Tournoi réinitialisé/.test(b.message()),
      'X.12 ⭐⭐ réponse AMPUTÉE de l’état joint : l’écran retombe sur ses lectures et réussit', b.message().slice(0, 60));
    vrai(actions(b).indexOf('getAll') !== -1 && actions(b).indexOf('getConfigAdmin') !== -1,
      'X.13 ⭐ exactement le repli annoncé', actions(b));
    vrai(!/déjà réinitialisé/.test(b.message()),
      'X.14 ⛔ et il n’invente pas un « déjà réinitialisé » que la réponse ne dit pas', b.message());
  }

  /* ============================== L — les liaisons ============================== */
  titre('L — le banc joue EXACTEMENT ce que la page branche');
  {
    const src = SRC_ADMIN();
    vrai(src.indexOf(B.LIAISON_ECRAN) !== -1,
      'L.1 ⭐⭐ la liaison jouée par le banc est MOT POUR MOT celle de `brancherEcouteursAdmin`', B.LIAISON_ECRAN);
    const html = fs.readFileSync(path.join(B.RACINE, 'admin.html'), 'utf8');
    vrai(/id="bouton-reinitialiser"/.test(html) && /id="message-reinitialisation"/.test(html) &&
         /id="bloc-reinitialisation"/.test(html),
      'L.2 les trois identifiants de l’écran existent bien dans `admin.html`');
    vrai((src.match(/ecouter\('bouton-reinitialiser'/g) || []).length === 1,
      'L.3 ⛔ le bouton n’est branché QU’UNE fois — un double branchement émettrait deux chaînes', src.match(/ecouter\('bouton-reinitialiser'/g));
  }

  /* ============================== Z — les mutants ============================== */
  titre('Z — mutants : chaque propriété corrigée est protégée');

  function substituer(source, avant, apres, nom) {
    const parts = source.split(avant);
    if (parts.length !== 2) throw new Error(nom + ' — le motif apparaît ' + (parts.length - 1) + ' fois, attendu 1');
    return parts.join(apres);
  }
  /** Un lecteur qui sert `js/admin.js` MUTÉ, et tout le reste tel quel. */
  const lecteurMute = (avant, apres, nom) => (f) =>
    (f === 'js/admin.js' ? substituer(SRC_ADMIN(), avant, apres, nom) : B.lecteur()(f));

  const MUTANTS = [
    { nom: 'confirmation CONTOURNÉE : la seconde question n’est plus posée',
      avant: "    if (!await dialogConfirmer(lignes.join('\\n'), { ok: 'Oui, tout effacer', danger: true })) return;",
      apres: "    if (false && !await dialogConfirmer(lignes.join('\\n'), { ok: 'Oui, tout effacer', danger: true })) return;",
      essai: async (js) => {
        const b = await B.banc({ js, dialogues: [true, false] });
        await b.clic('bouton-reinitialiser', 120);
        return !b.srv.vide() && b.dialogues.length === 2;
      } },
    { nom: 'DEUXIÈME APPEL sur double clic : la garde d’opération est retirée',
      avant: '  if (reinitialisationEnCours) return;\n  reinitialisationEnCours = true;',
      apres: '  reinitialisationEnCours = true;',
      essai: async (js) => {
        const b = await B.banc({ js });
        await b.doubleClic('bouton-reinitialiser', 150);
        return actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1 &&
               actions(b).filter((a) => a === 'preparerReinitialisation').length === 1 &&
               b.dialogues.length === 2;
      } },
    { nom: 'SUCCÈS AFFICHÉ AVANT RÉPONSE : le message de succès est posé tout de suite',
      avant: "    afficherMessage(message, 'Réinitialisation en cours…', 'ok');",
      apres: "    afficherMessage(message, '✅ Tournoi réinitialisé. Supprimés : 0 catégorie(s).', 'ok');",
      essai: async (js) => {
        const b = await B.banc({ js, pannes: { reinitialiserTournoi: 'silence' } });
        b.clicSansAttendre('bouton-reinitialiser');
        await b.tour(40);
        return !/✅ Tournoi réinitialisé/.test(b.message());
      } },
    { nom: 'RÉÉMISSION APRÈS DÉLAI : l’issue incertaine est renvoyée au lieu d’être relue',
      avant: '      if (!reinitialisationIncertaine(erreur)) throw erreur;      // refus lisible : rien n\'a été effacé\n      incertaine = erreur;',
      apres: '      if (!reinitialisationIncertaine(erreur)) throw erreur;\n      res = await ecrireAdmin(\'reinitialiserTournoi\', { renvoyer_etat: \'oui\' },\n                              { delaiMs: DELAI_REINITIALISATION_MS });\n      incertaine = null;',
      essai: async (js) => {
        let premier = true;
        const b = await B.banc({ js, pannes: (d) => {
          if (d.action !== 'reinitialiserTournoi') return null;
          if (premier) { premier = false; return 'perdue'; }
          return null;
        } });
        await b.clic('bouton-reinitialiser', 150);
        return actions(b).filter((a) => a === 'reinitialiserTournoi').length === 1;
      } },
    { nom: 'BOUTON JAMAIS RÉACTIVÉ : le `finally` ne rend plus la commande',
      avant: '    bouton.disabled = false;\n    bouton.textContent = texteBouton;\n    reinitialisationEnCours = false;',
      apres: '    void texteBouton;',
      essai: async (js) => {
        const b = await B.banc({ js });
        await b.clic('bouton-reinitialiser', 120);
        return b.bouton().disabled === false && b.bouton().textContent === 'Réinitialiser le tournoi';
      } },
    /* ───────────── LES MUTANTS DE LA CORRECTION ───────────── */
    { nom: 'JETON RECONSTRUIT PAR LE NAVIGATEUR : il fabrique une empreinte au lieu de renvoyer la sienne',
      avant: "      if (protege) demande.jeton_etat = prep.jeton;",
      apres: "      if (protege) demande.jeton_etat = 'f'.repeat(64);",
      essai: async (js) => {
        const b = await B.banc({ js });
        await b.clic('bouton-reinitialiser', 120);
        return b.srv.vide() && /✅ Tournoi réinitialisé/.test(b.message());
      } },
    { nom: 'JETON TRONQUÉ : le navigateur le raccourcit avant de l’envoyer',
      avant: "      if (protege) demande.jeton_etat = prep.jeton;",
      apres: "      if (protege) demande.jeton_etat = String(prep.jeton).slice(0, 32);",
      essai: async (js) => {
        const b = await B.banc({ js });
        await b.clic('bouton-reinitialiser', 120);
        return b.srv.vide() && /✅ Tournoi réinitialisé/.test(b.message());
      } },
    { nom: 'PROMESSE AFFICHÉE SANS JETON : le texte protégé est écrit même sans préparation',
      avant: "    lignes.push(protege\n      ? 'Si le tournoi a changé depuis cette lecture",
      apres: "    lignes.push(true\n      ? 'Si le tournoi a changé depuis cette lecture",
      essai: async (js) => {
        const b = await B.banc({ js, backend: B.BACKEND_AVANT() });
        await b.clic('bouton-reinitialiser', 150);
        return !/sera REFUSÉE/.test(b.dialogues[1].message);
      } },
    { nom: 'PRÉPARATION RENOUVELÉE AVANT L’ENVOI : le jeton est redemandé après la confirmation',
      avant: "      const demande = { renvoyer_etat: 'oui' };\n      if (protege) demande.jeton_etat = prep.jeton;",
      apres: "      const demande = { renvoyer_etat: 'oui' };\n      const frais = await preparerReinitialisation();\n      if (protege) demande.jeton_etat = frais.jeton || prep.jeton;",
      essai: async (js) => {
        /* ⭐ B agit APRÈS la dernière confirmation : un jeton redemandé juste avant l'envoi serait
           FRAIS, et la protection s'évaporerait sans que rien ne le dise. */
        let b = null;
        b = await B.banc({ js, dialogues: [true, () => {
          const e = b.srv.equipes()[0];
          b.srv.autreOnglet({ action: 'modifierEquipe', id_equipe: e.id_equipe,
            nom_equipe: 'RENOMMÉE PAR B', categorie: e.categorie });
          return true;
        }] });
        await b.clic('bouton-reinitialiser', 150);
        return !b.srv.vide();
      } },
    { nom: 'PRÉPARATION EN PANNE : on confirme quand même, sans jeton',
      avant: "    if (prep.panne) {",
      apres: "    if (false) {",
      essai: async (js) => {
        const b = await B.banc({ js, pannes: (d) => (d.action === 'preparerReinitialisation' ? 'reseau' : null) });
        await b.clic('bouton-reinitialiser', 150);
        return b.dialogues.length === 0 && !b.srv.vide();
      } },
    { nom: 'AVERTISSEMENT DRIVE IGNORÉ : l’échec de la corbeille n’est pas affiché',
      avant: "  if (res.avertissement_drive) liste.push(res.avertissement_drive);",
      apres: "  void res;",
      essai: async (js) => {
        const b = await B.banc({ js, avant: (srv) => {
          srv.contexte.DriveApp.getFileById = function () { throw new Error('Drive indisponible'); };
        } });
        await b.clic('bouton-reinitialiser', 120);
        return /n'ont pas pu être mis à la corbeille/.test(b.message());
      } },
    /* ───────── LE PROTOCOLE EN TROIS PHASES (seconde contre-épreuve) ───────── */
    { nom: '⭐ AVERTISSEMENT DE RÉCONCILIATION IGNORÉ : un fichier jeté dont la référence survit passe pour un ménage complet',
      avant: "  if (res.avertissement_reconciliation) liste.push('⚠️ ' + res.avertissement_reconciliation);",
      apres: "  void res;",
      essai: async (js) => {
        /* ⭐ LE VERROU DE RÉCONCILIATION EST RENDU INDISPONIBLE de façon déterministe : la première
           prise réussit (phase A), la seconde échoue (phase C). Les fichiers SONT à la corbeille,
           le classeur les désigne encore — et l'écran doit le DIRE. */
        const b = await B.banc({ js, avant: (srv) => {
          const base = srv.contexte.LockService.getScriptLock;
          let prises = 0;
          srv.contexte.LockService.getScriptLock = function () {
            const v = base.call(this);
            return { tryLock(ms) { return (++prises === 1) ? v.tryLock(ms) : false; },
                     releaseLock() { return v.releaseLock(); }, hasLock() { return false; } };
          };
        } });
        await b.clic('bouton-reinitialiser', 150);
        return /le classeur les désigne encore/.test(b.message());
      } },
    /* ───────── LA PROPAGATION DIFFÉRÉE (troisième contre-épreuve) ───────── */
    { nom: '⭐ PROPAGATION DIFFÉRÉE TUE : l’écran annonce une page publique à jour qu’il ne peut pas garantir',
      avant: "  if (res.avertissement_relais) liste.push('⚠️ ' + res.avertissement_relais);",
      apres: "  if (res.relais === 'echec') liste.push('⚠️ ' + res.avertissement_relais);",
      essai: async (js) => {
        const b = await B.banc({ js, avant: (srv) => {
          srv.proprietes.set('RELAIS_URL', 'https://relais-fictif.invalid/instantane');
          srv.contexte.UrlFetchApp = { fetch() { return { getResponseCode: () => 200, getContentText: () => '{}' }; } };
          /* ⭐ ACTIVITÉ CONTINUE, simulée de façon DÉTERMINISTE : le descripteur DURABLE de l'état
             public change à CHAQUE lecture — exactement ce qu'une écriture permanente produirait. Le
             serveur ne peut alors JAMAIS prouver que sa poussée est encore courante. */
          const base = srv.contexte.PropertiesService.getScriptProperties;
          let n = 0;
          srv.contexte.PropertiesService.getScriptProperties = function () {
            const p = base.call(this);
            return {
              getProperty(k) {
                return k === 'INSTANTANE_DESCRIPTEUR'
                  ? JSON.stringify({ v: 'version-fictive-' + (++n), h: '' }) : p.getProperty(k);
              },
              setProperty(k, v) { return p.setProperty(k, v); },
              deleteProperty(k) { return p.deleteProperty(k); },
              setProperties(o) { return p.setProperties(o); },
              getProperties() { return p.getProperties(); }
            };
          };
        } });
        await b.clic('bouton-reinitialiser', 150);
        return /différé/.test(b.message());
      } },
    { nom: '⭐ AVERTISSEMENT DE RELAIS IGNORÉ : la page publique reste périmée sans que personne le sache',
      avant: "  if (res.avertissement_relais) liste.push('⚠️ ' + res.avertissement_relais);",
      apres: "  void res;",
      essai: async (js) => {
        const b = await B.banc({ js, avant: (srv) => {
          srv.proprietes.set('RELAIS_URL', 'https://relais-fictif.invalid/instantane');
          srv.contexte.UrlFetchApp = { fetch() { throw new Error('relais indisponible'); } };
        } });
        await b.clic('bouton-reinitialiser', 150);
        return /relais indisponible|ancien tournoi pendant quelques minutes/.test(b.message());
      } },
    { nom: 'AVERTISSEMENT D’ÉDITION IGNORÉ : une bascule impossible passe pour un succès total',
      avant: "  if (res.avertissement_edition) {",
      apres: "  if (false) {",
      essai: async (js) => {
        /* ⭐ LA BASCULE EST RENDUE IMPOSSIBLE de façon déterministe : tout nouvel identifiant d'édition
           est celui qui existe DÉJÀ, donc `planifierBasculeEdition` refuse. ⛔ Le classeur est bien
           vidé, mais l'édition n'a pas tourné : l'ancien lien peut encore être valable, et l'écran
           doit le DIRE. */
        const b = await B.banc({ js, avant: (srv) => {
          const existant = srv.appeler('editionActive', srv.classeur).edition.edition_id;
          srv.contexte.Utilities.getUuid = function () { return existant; };
        } });
        await b.clic('bouton-reinitialiser', 150);
        return /ancien lien d.accès à la table de marque peut donc être ENCORE VALABLE/.test(b.message());
      } },
    { nom: 'ÉTAT LOCAL RECONSTRUIT SANS AUTORITÉ SERVEUR : l’écran repeint « tout est vide » de lui-même',
      avant: "                                etat: (res && res.etat) || null });",
      apres: "                                etat: { config: { global: {}, categories: [] },\n" +
             "                                        equipes: [], poules: [], matchs: [] } });",
      essai: async (js) => {
        const srv = B.serveur(B.BACKEND_COURANT());
        const b = B.navigateur(srv, js, {});
        await b.ouvrir();
        b.remettre();
        const vraiPost = srv.postMesure;
        srv.postMesure = function (corps, libelle) {
          const s = vraiPost.call(srv, corps, libelle);
          if (corps.action === 'reinitialiserTournoi' && s.reponse && s.reponse.etat) {
            s.reponse.etat.equipes = [{ id_equipe: 'E-TEMOIN', nom_equipe: 'TÉMOIN DU SERVEUR', categorie: 'U10' }];
          }
          return s;
        };
        await b.clic('bouton-reinitialiser', 120);
        srv.postMesure = vraiPost;
        return b.etatEcran().equipes === 1;
      } },
    { nom: 'RÉSULTAT INCONNU PRÉSENTÉ COMME UN ÉCHEC CERTAIN',
      avant: "      if (!reinitialisationIncertaine(erreur)) throw erreur;      // refus lisible : rien n'a été effacé",
      apres: "      throw erreur;",
      essai: async (js) => {
        const b = await B.banc({ js, pannes: (d) => (d.action === 'reinitialiserTournoi' ? 'perdue' : null) });
        await b.clic('bouton-reinitialiser', 150);
        return /n’est pas confirmée/.test(b.message());
      } },
    { nom: 'RÉSULTAT INCONNU PRÉSENTÉ COMME UN SUCCÈS CERTAIN',
      avant: '    if (incertaine) {',
      apres: '    if (false && incertaine) {',
      essai: async (js) => {
        const b = await B.banc({ js, pannes: (d) => (d.action === 'reinitialiserTournoi' ? 'perdue' : null) });
        await b.clic('bouton-reinitialiser', 150);
        return /n’est pas confirmée/.test(b.message());
      } },
    { nom: 'CONFIRMATION MUETTE : les chiffres du serveur disparaissent de la seconde question',
      avant: "      lignes.push('Seront supprimés, tels que le SERVEUR les voit à l\\'instant :',\n        '• ' + resumeComptesReinitialisation(comptes) + '.', '');",
      apres: "      lignes.push('');",
      essai: async (js) => {
        const b = await B.banc({ js });
        await b.clic('bouton-reinitialiser', 120);
        return /catégorie\(s\), .* équipe\(s\)/.test(b.dialogues[1].message);
      } },
    { nom: 'REFUS D’ÉTAT PÉRIMÉ TRAITÉ COMME UNE PANNE ANONYME',
      avant: "    if (refus && refus.code === 'etat_perime') {",
      apres: "    if (false && refus && refus.code === 'etat_perime') {",
      essai: async (js) => {
        let b = null;
        b = await B.banc({ js, dialogues: [true, () => {
          const e = b.srv.equipes()[0];
          b.srv.autreOnglet({ action: 'modifierEquipe', id_equipe: e.id_equipe,
            nom_equipe: 'RENOMMÉE PAR B', categorie: e.categorie });
          return true;
        }] });
        await b.clic('bouton-reinitialiser', 150);
        return /RIEN n'a été effacé/.test(b.message()) && /relu/.test(b.message());
      } },
    { nom: 'ÉTAT PARTIEL PRÉSENTÉ COMME UNE ERREUR CERTAINE : `etat_incertain` est ignoré',
      avant: "    if (refus && refus.etat_incertain === true) {",
      apres: "    if (false && refus && refus.etat_incertain === true) {",
      essai: async (js) => {
        /* ⭐ On casse une écriture EN COURS d'effacement : le serveur avoue `etat_incertain`, et
           l'écran doit le répéter au lieu de laisser croire que rien n'a bougé.
           ⚠️ La frontière est posée SUR LA REQUÊTE : le compteur d'écritures du monde a déjà servi
           pendant le peuplement, et la préparation, elle, n'écrit rien. */
        const b = await B.banc({ js });
        b.srv.panneA = b.srv.compteurEcritures + 12;
        await b.clic('bouton-reinitialiser', 150);
        b.srv.panneA = 0;
        if (!/⚠️/.test(b.message())) return false;          // aucune erreur : la panne a été ratée
        return /peut-être PARTIEL/.test(b.message());
      } }
  ];
  let tues = 0;
  for (const mu of MUTANTS) {
    let survitLeMutant = null;
    try {
      let js = lecteurMute(mu.avant, mu.apres, mu.nom);
      if (mu.apresBis) {
        const base = substituer(SRC_ADMIN(), mu.avant, mu.apres, mu.nom);
        const mute = substituer(base, mu.apresBis[0], mu.apresBis[1], mu.nom + ' (bis)');
        js = (f) => (f === 'js/admin.js' ? mute : B.lecteur()(f));
      }
      survitLeMutant = await mu.essai(js);
    } catch (e) { survitLeMutant = false; }   // une exception TUE aussi le mutant : l'écran ne marche plus
    if (!survitLeMutant) tues++;
    vrai(survitLeMutant === false, 'Z — mutant « ' + mu.nom + ' » : TUÉ', survitLeMutant);
  }
  /* ⛔ ET LE CODE RÉEL, LUI, PASSE : sans cela, un « mutant tué » ne prouverait rien. */
  let reelOk = true;
  for (const mu of MUTANTS) {
    let r = null;
    try { r = await mu.essai(B.lecteur()); } catch (e) { r = 'EXCEPTION ' + e.message; }
    if (r !== true) { reelOk = false; console.log('     ⚠️ épreuve en défaut sur le code RÉEL : ' + mu.nom + ' → ' + r); }
  }
  vrai(reelOk, 'Z.0 ⭐⭐ le code RÉEL passe les ' + MUTANTS.length + ' épreuves qui tuent les mutants');
  console.log('     ' + tues + '/' + MUTANTS.length + ' mutants tués.');

  /* ============================== BILAN ============================== */
  console.log('\n──────────────────────────────────────────────────────────────');
  if (process.exitCode) { console.log('ÉCHEC — voir les lignes ci-dessus.'); process.exit(1); }
  console.log('OK — ' + t.n + ' contrôles de surface de l’écran « Réinitialiser » tenus.');
})().catch((e) => { console.error('EXCEPTION — ' + e.stack); process.exit(1); });
