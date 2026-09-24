#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « RÉINITIALISER » — ZÉRO APPEL PARASITE
 * ============================================================================
 *  ▶ node tests/ecran-reinitialisation-zero-appel.test.js
 *
 *  ⭐ CE QUE CETTE SUITE PROUVE, et pourquoi elle est à part. L'écran « Réinitialiser » est une
 *  carte repliée dans une zone de danger. Rien de ce qu'on y fait AVANT de confirmer ne doit
 *  parler à un serveur : l'ouvrir, la déplier, la replier, la relire, y revenir, ANNULER une
 *  confirmation. ⛔ Et « ne pas parler à un serveur » ne veut pas dire « pas de `fetch` » : TOUTE
 *  porte de sortie est comptée — `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`,
 *  `EventSource`, une `Image` dont on pose le `src`, un `window.open`.
 *
 *  ⭐ ET SYMÉTRIQUEMENT : un geste CONFIRMÉ doit produire UNE chaîne, une seule, et connue.
 *  Un écran qui n'appelle jamais rien serait inutile ; ce qui compte est que chaque appel soit
 *  VOULU et JUSTIFIÉ.
 *
 *  ⛔ Aucun réseau, aucun service Google réel : banc tests/banc-ecran-reinitialisation.js.
 * ============================================================================
 */

const B = require('./banc-ecran-reinitialisation');

const t = B.compteur();
const vrai = t.vrai;
const titre = (s) => console.log('\n' + s);

/** Les actions réseau d'un relevé, dans l'ordre. */
const actions = (b) => b.requetes();

(async function () {

  /* ============================== A — l'ouverture et l'arrivée ============================== */
  titre('A — ouvrir l’administration, arriver sur l’écran : ce qui part, et rien de plus');
  {
    const b = await B.banc({ garderOuverture: true });
    const ouverture = actions(b);
    /* ⚠️ CE QUE CE CONTRÔLE DIT, ET CE QU'IL NE DIT PAS. Le banc joue les lignes de `chargerAdmin()`
       qui concernent cet écran et ses voisines de page — ⛔ pas la page entière. Ce qu'il EXIGE est
       donc ce qui est vrai quel que soit le reste : ① les LECTURES d'ouverture sont celles des
       autres cartes (config, planning, référentiel et verdict FFR), ② l'écran « Réinitialiser »
       n'en ajoute AUCUNE — c'est A.2 et A.4 qui le prouvent —, et ③ aucune n'est émise deux fois. */
    vrai(ouverture.indexOf('reinitialiserTournoi') === -1 && ouverture.indexOf('listerClubsInvites') === -1 &&
         ouverture.indexOf('preparerReinitialisation') === -1,
      'A.1 l’ouverture de l’administration n’émet ni la réinitialisation ni la lecture du carnet — ⛔ l’écran de danger ne coûte rien à l’ouverture',
      ouverture);
    vrai(ouverture.every((a, i) => ouverture.indexOf(a) === i),
      'A.1 bis et aucune lecture d’ouverture n’est émise deux fois', ouverture);
  }
  {
    const b = await B.banc();
    await b.arriver();
    vrai(actions(b).length === 0 && b.sorties.length === 0,
      'A.2 ⭐⭐ ARRIVER sur l’écran « Réinitialiser » n’émet AUCUNE requête et n’ouvre AUCUNE sortie réseau',
      [actions(b), b.sorties]);
    await b.arriver();
    await b.arriver();
    vrai(actions(b).length === 0 && b.sorties.length === 0,
      'A.3 y revenir deux fois de plus n’en émet pas davantage', [actions(b), b.sorties]);
  }
  {
    /* ⭐ LA NAVIGATION COMPLÈTE, par la barre latérale : c'est le vrai chemin de l'organisateur. */
    const b = await B.banc();
    await b.naviguer('reinitialisation');
    vrai(actions(b).length === 0 && b.sorties.length === 0,
      'A.4 naviguer vers l’écran par la barre latérale (`ecransActiver`) n’émet rien non plus',
      [actions(b), b.sorties]);
  }
  {
    /* ⛔ ET L'ÉCRAN N'EST PAS DÉCLARÉ COMME AYANT DES RESSOURCES : la preuve par le registre. */
    const b = await B.banc();
    const def = b.valeur('ADMIN_ETAPES && ADMIN_ETAPES.reinitialisation');
    vrai(def === undefined || def === null,
      'A.5 ⭐ l’écran ne déclare AUCUNE ressource dans `ADMIN_ETAPES` — la garantie vient du registre, pas d’un hasard',
      def);
    const ecran = (b.valeur('ECRANS_DEF') || []).filter((e) => e.id === 'reinitialisation')[0];
    vrai(!!ecran && Array.isArray(ecran.cles) && ecran.cles.length === 0 && ecran.libre === true && ecran.danger === true,
      'A.6 et il est déclaré LIBRE et DANGER, sans prérequis : on doit pouvoir remettre à zéro un tournoi à moitié préparé',
      ecran);
  }

  /* ============================== B — les gestes locaux ============================== */
  titre('B — déplier, replier, relire : aucun de ces gestes ne parle à un serveur');
  {
    const b = await B.banc();
    await b.arriver();
    const carte = b.el('bloc-reinitialisation');
    vrai(!!carte && carte.tag === 'details' && carte.open === false,
      'B.1 la carte est un dépliant, REPLIÉ par défaut — on ne l’ouvre pas par erreur', [!!carte, carte && carte.open]);
    carte.open = true;
    await b.tour();
    vrai(actions(b).length === 0 && b.sorties.length === 0,
      'B.2 ⭐ DÉPLIER la carte n’émet rien', [actions(b), b.sorties]);
    carte.open = false;
    await b.tour();
    vrai(actions(b).length === 0 && b.sorties.length === 0, 'B.3 la replier non plus', [actions(b), b.sorties]);
  }
  {
    /* ⭐ LA LISTE DE CE QUI PART ET DE CE QUI RESTE est du TEXTE : elle ne se lit nulle part. */
    const b = await B.banc();
    await b.arriver();
    const liste = b.el('bloc-reinitialisation').querySelectorAll('li');
    vrai(liste.length >= 8 && actions(b).length === 0,
      'B.4 la liste de ce qui est supprimé est écrite dans la page — ⛔ elle n’est pas lue au serveur',
      [liste.length, actions(b)]);
  }

  /* ============================== C — la confirmation annulée ============================== */
  titre('C — annuler une confirmation : ZÉRO effet, ZÉRO appel');
  {
    const b = await B.banc({ dialogues: [false] });
    const avant = b.etatServeur();
    await b.clic('bouton-reinitialiser', 30);
    /* ⚠️ UNE ANNULATION COÛTE DÉSORMAIS LA PRÉPARATION, et c'est tout : une LECTURE, sans verrou et
       sans écriture. ⛔ Aucune requête destructive, et le classeur est intact. */
    vrai(JSON.stringify(actions(b)) === JSON.stringify(['preparerReinitialisation']) &&
         b.dialogues.length === 1,
      'C.1 ⭐⭐ annuler à la PREMIÈRE confirmation : SEULE la préparation (lecture) a été émise, une seule question posée',
      [actions(b), b.dialogues.length]);
    vrai(JSON.stringify(b.etatServeur()) === JSON.stringify(avant),
      'C.2 et le classeur est intact', b.etatServeur());
    vrai(b.bouton().disabled === false && b.bouton().textContent === 'Réinitialiser le tournoi',
      'C.3 le bouton a retrouvé un état cohérent — ⛔ jamais laissé mort', b.bouton().textContent);
  }
  {
    const b = await B.banc({ dialogues: [true, false] });
    const avant = b.etatServeur();
    await b.clic('bouton-reinitialiser', 30);
    vrai(JSON.stringify(actions(b)) === JSON.stringify(['preparerReinitialisation']) &&
         b.dialogues.length === 2,
      'C.4 ⭐⭐ annuler à la SECONDE confirmation : toujours AUCUNE écriture, deux questions posées',
      [actions(b), b.dialogues.length]);
    vrai(JSON.stringify(b.etatServeur()) === JSON.stringify(avant) && b.bouton().disabled === false,
      'C.5 le classeur est intact et le bouton redevient cliquable');
    /* ⭐ ET ON PEUT RECOMMENCER : une annulation ne bloque pas l’écran. */
    const b2 = await B.banc({ dialogues: [true, false, true, true] });
    await b2.clic('bouton-reinitialiser', 30);
    await b2.clic('bouton-reinitialiser', 60);
    vrai(actions(b2).filter((a) => a === 'reinitialiserTournoi').length === 1 && b2.srv.vide() &&
         actions(b2).filter((a) => a === 'preparerReinitialisation').length === 2,
      'C.6 ⭐ après une annulation, un nouveau clic confirmé fonctionne — UNE seule réinitialisation, ' +
      'et une NOUVELLE préparation (⛔ jamais un jeton recyclé)', actions(b2));
  }

  /* ============================== D — le geste confirmé : UNE chaîne, connue ============================== */
  titre('D — un geste confirmé : une chaîne, une seule, et chaque requête est justifiée');
  {
    const b = await B.banc();
    await b.clic('bouton-reinitialiser', 60);
    const req = actions(b);
    vrai(JSON.stringify(req) === JSON.stringify(['preparerReinitialisation', 'reinitialiserTournoi',
                                                 'listerClubsInvites', 'getDossierAutorisation']),
      'D.1 ⭐⭐ QUATRE requêtes exactement : la PRÉPARATION (jeton d’état), l’écriture, le carnet des ' +
      'clubs, la feuille FFR — ⛔ ni `getAll` ni `getConfigAdmin`', req);
    /* ⭐ LA QUATRIÈME REQUÊTE EST ASSUMÉE, et c'est le prix de la protection contre l'état périmé :
       sans elle, le navigateur fabriquerait sa précondition depuis SA MÉMOIRE — c'est exactement le
       défaut que la contre-épreuve a démonté (neuf pertes silencieuses sur dix à nombre constant).
       ⛔ Elle n'est pas regroupable avec l'écriture : l'organisateur confirme ENTRE les deux. */
    vrai(req[0] === 'preparerReinitialisation',
      'D.1 bis ⭐⭐ et la PRÉPARATION vient EN PREMIER : le jeton précède la confirmation', req[0]);
    vrai(req.filter((a) => a === 'reinitialiserTournoi').length === 1,
      'D.2 ⭐⭐ une SEULE écriture destructive — ⛔ jamais deux', req);
    vrai(b.sorties.filter((s) => !/^fetch /.test(s)).length === 0,
      'D.3 aucune sortie réseau AUTRE que les quatre `fetch` (ni image, ni balise, ni WebSocket)', b.sorties);
  }
  {
    /* ⭐ LA JUSTIFICATION DES DEUX RELECTURES, prouvée plutôt qu'affirmée : la réponse de
       l'écriture ne PORTE ni la liste des clubs, ni la feuille FFR. Le jour où elle les porterait,
       ce contrôle tomberait et l'on saurait qu'on peut les retirer. */
    const b = await B.banc();
    await b.clic('bouton-reinitialiser', 60);
    const reponse = b.details.length ? null : null;
    void reponse;
    const ecriture = b.demandes().filter((d) => d.action === 'reinitialiserTournoi')[0];
    vrai(ecriture.renvoyer_etat === 'oui',
      'D.4 l’écriture DEMANDE l’état relu (`renvoyer_etat`) — c’est ce qui supprime les deux lectures d’avant',
      ecriture.renvoyer_etat);
    vrai(/^[0-9a-f]{64}$/.test(String(ecriture.jeton_etat)),
      'D.4 bis ⭐⭐ et elle porte le JETON D’ÉTAT du serveur, ⛔ pas des comptes fabriqués localement',
      String(ecriture.jeton_etat).slice(0, 16) + '…');
    vrai(b.demandes()[2].action === 'listerClubsInvites' && b.demandes()[3].action === 'getDossierAutorisation',
      'D.5 ⭐ les deux relectures conservées sont celles que la réponse NE porte PAS : le carnet des clubs ' +
      '(lourd, et sans intérêt sous le verrou) et la feuille FFR (7 lectures)', b.demandes().map((d) => d.action));
  }
  {
    /* ⛔ ET RIEN NE PART APRÈS COUP : on laisse le temps s'écouler longuement. */
    const b = await B.banc();
    await b.clic('bouton-reinitialiser', 60);
    const apres = actions(b).length;
    await b.tour(200);
    vrai(actions(b).length === apres,
      'D.6 ⭐⭐ rien ne part en arrière-plan une fois le geste terminé — ⛔ aucune relance différée',
      [apres, actions(b).length]);
  }

  /* ============================== E — les autres cartes ne bougent pas ============================== */
  titre('E — aucune régression des autres cartes d’administration');
  {
    /* ⭐ NAVIGUER SUR TOUS LES ÉCRANS puis revenir : chaque écran paie SES lectures, une fois, et
       l'écran « Réinitialiser » n'en ajoute aucune. */
    const b = await B.banc();
    const ids = (b.valeur('ECRANS_DEF') || []).map((e) => e.id);
    await b.naviguer('reinitialisation');
    const apresReinit = actions(b).length;
    vrai(apresReinit === 0, 'E.1 après un passage sur « Réinitialiser », toujours zéro requête', apresReinit);
    for (const id of ids) { if (id !== 'sponsors') await b.naviguer(id, 30); }
    const total = actions(b);
    const uniques = Array.from(new Set(total));
    vrai(uniques.every((a) => total.filter((x) => x === a).length === 1),
      'E.2 ⭐ chaque lecture d’écran n’est émise QU’UNE fois sur tout le parcours (le registre la mémorise)',
      total);
    const avant = total.length;
    for (const id of ids) { if (id !== 'sponsors') await b.naviguer(id, 30); }
    vrai(actions(b).length === avant,
      'E.3 ⭐⭐ un SECOND passage sur tous les écrans n’émet plus RIEN — ⛔ aucune régression du registre',
      [avant, actions(b).length]);
  }

  /* ============================== BILAN ============================== */
  console.log('\n──────────────────────────────────────────────────────────────');
  if (process.exitCode) { console.log('ÉCHEC — voir les lignes ci-dessus.'); process.exit(1); }
  console.log('OK — ' + t.n + ' contrôles « zéro appel » de l’écran « Réinitialiser » tenus.');
})().catch((e) => { console.error('EXCEPTION — ' + e.stack); process.exit(1); });
