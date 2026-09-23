#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  SURFACE DE L'ÉCRAN « PUBLICATION » — ce que l'organisateur obtient réellement
 * ============================================================================
 *  ▶ node tests/ecran-publication-surface.test.js
 *
 *  ⭐ CONTRÔLES DYNAMIQUES, PAS TEXTUELS. Chaque propriété est éprouvée en JOUANT le geste :
 *  vrais modules du frontend, vrais écouteurs, vrai `api.js`, vraie carte d'admin.html, vrai
 *  `Code.gs` dans les doublures du banc de coût. Les requêtes sont comptées au niveau du
 *  TRANSPORT — pas déduites du code.
 *  ⛔ Les deux seuls contrôles textuels de cette suite (A1, A2) ne portent pas sur un
 *    comportement : ils vérifient que le BANC n'a pas dérivé de la page réelle.
 *
 *  ⚠️ CE QUE CETTE SUITE NE PROUVE PAS. Le temps du banc est COMPRIMÉ (une milliseconde du
 *  frontend vaut une microseconde), alors que `performance.now()` mesure le temps réel : les
 *  contrôles de délai prouvent donc que l'attente SE DÉNOUE et que la cause est NOMMÉE, ⛔ pas
 *  qu'elle se dénoue à la seconde annoncée. Et aucune durée rapportée ici n'est une mesure Google :
 *  les durées du lot sont ESTIMÉES par `backend/tests/banc-cout/modele-cout.js`.
 *
 *  ⛔ Aucun réseau, aucun service Google réel, aucune donnée réelle : tournoi fictif.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const B = require('./banc-ecran-publication');

let n = 0;
const echecs = [];
function ok(v, m, preuve) {
  n++;
  if (!v) echecs.push(n + ' — ' + m + (preuve === undefined ? '' : ' :: ' + JSON.stringify(preuve)));
  console.log('  ' + (v ? '✓' : '✗') + ' ' + n + ' ' + m);
}
function titre(t) { console.log('\n-- ' + t + ' --'); }

const RACINE = B.RACINE;
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

/** Un écran ouvert ET visité (le trajet réel : ouverture, puis arrivée sur l'écran). */
async function ecran(opt) {
  const b = await B.banc(opt || {});
  await b.arriver();
  b.remettre();
  return b;
}

(async function () {

  titre('A — le banc ne dérive pas de la page réelle');
  {
    const admin = lire('js/admin.js');
    const manquantes = B.LIAISONS_ECRAN.filter((l) => admin.indexOf('  ' + l) === -1);
    ok(manquantes.length === 0,
      'A1 ⭐⭐ les ' + B.LIAISONS_ECRAN.length + ' liaisons jouées par le banc sont MOT POUR MOT ' +
      'celles de `brancherEcouteursAdmin`', manquantes);
    const html = lire('admin.html');
    const absents = B.BLOCS.filter((id) => html.indexOf('id="' + id + '"') === -1);
    ok(absents.length === 0, 'A2 les ' + B.BLOCS.length + ' cartes du banc existent dans admin.html', absents);
  }

  titre('B — le trajet de l’écran : combien de requêtes, et où');
  {
    const b = await B.banc({ garderOuverture: true });
    ok(b.requetes().length === 2 &&
       JSON.stringify(b.requetes()) === JSON.stringify(['getAll', 'getConfigAdmin']),
      'B1 ⭐⭐ l’OUVERTURE de l’administration émet EXACTEMENT 2 requêtes — ⛔ plus celle de l’accès ' +
      'aux scores, que `majPublication()` déclenchait même sans jamais venir sur cet écran',
      b.requetes());
    b.remettre();
    await b.arriver();
    ok(b.requetes().length === 1 && b.requetes()[0] === 'getAccesScoresAdmin',
      'B2 ⭐ l’ARRIVÉE sur l’écran émet EXACTEMENT 1 requête : l’état de l’accès, différé jusqu’ici',
      b.requetes());
    b.remettre();
    await b.arriver();
    await b.arriver();
    await b.arriver();
    ok(b.requetes().length === 0,
      'B3 ⭐⭐ TROIS retours sur l’écran déjà visité émettent ZÉRO requête — la ressource est ' +
      'mémorisée par le registre', b.requetes());
  }
  {
    /* ⭐ DEUX ARRIVÉES QUI SE CROISENT : la seconde ne doit pas doubler la lecture. */
    const b = await B.banc();
    b.remettre();
    const a = b.arriver();
    const c = b.arriver();
    await a; await c; await b.tour(20);
    ok(b.requetes().length === 1,
      'B4 ⭐ deux arrivées SIMULTANÉES partagent la lecture en vol : 1 requête, pas 2', b.requetes());
  }

  titre('C — publier et masquer');
  {
    const b = await ecran({ monde: { publie: 'non' } });
    await b.clic('bouton-publier', 40);
    ok(JSON.stringify(b.requetes()) === JSON.stringify(['enregistrerInfosTournoi', 'publierTournoi']),
      'C1 ⭐⭐ PUBLIER émet EXACTEMENT 2 requêtes — ⛔ plus le `getConfigAdmin` de relecture, ' +
      'plus la relecture de l’accès aux scores', b.requetes());
    ok(b.srv.publie() === 'oui', 'C2 le classeur porte bien « oui »');
    ok(b.texte('etat-publication').indexOf('Publié') !== -1 &&
       b.texte('bouton-publier').indexOf('Masquer') !== -1,
      'C3 l’écran peint l’état enregistré et propose désormais « Masquer »',
      [b.texte('etat-publication'), b.texte('bouton-publier')]);
    const cumul = b.cumul();
    ok(cumul.ecritureValeurs.cellules === 1,
      'C4 ⭐ UNE seule cellule écrite pour toute la publication (les infos inchangées n’en coûtent aucune)',
      cumul.ecritureValeurs.cellules);
    ok(cumul.instantane.reconstruit === 0 && cumul.instantane.invalide === 1,
      'C5 ⭐⭐ l’instantané public est INVALIDÉ, ⛔ jamais RECONSTRUIT sous le verrou',
      cumul.instantane);
    b.remettre();
    await b.clic('bouton-publier', 40);
    ok(JSON.stringify(b.requetes()) === JSON.stringify(['publierTournoi']),
      'C6 ⭐⭐ MASQUER émet EXACTEMENT 1 requête', b.requetes());
    ok(b.srv.publie() === 'non' && b.texte('etat-publication').indexOf('Non publié') !== -1,
      'C7 le classeur et l’écran disent tous deux « non publié »');
  }
  {
    /* ⭐ L'ADRESSE SURVIT AU MASQUAGE — la publication ne commande pas l'existence de la page. */
    const b = await ecran({ monde: { publie: 'oui' } });
    const avant = b.el('acces-public-lien').getAttribute('href');
    await b.clic('bouton-publier', 40);
    ok(b.el('acces-public-lien').getAttribute('href') === avant && /^https:\/\//.test(avant),
      'C8 ⭐⭐ MASQUER ne change PAS l’adresse publique, et ne prétend pas que la page n’existe plus',
      [avant, b.el('acces-public-lien').getAttribute('href')]);
    ok(b.el('bouton-copier-adresse-publique').disabled === false &&
       b.el('bouton-ouvrir-page-publique').disabled === false,
      'C9 « Copier » et « Ouvrir » restent ACTIFS une fois le tournoi masqué');
    ok(b.el('acces-public-qr').getAttribute('data-url') === avant,
      'C10 le QR public porte encore la même adresse');
  }

  titre('D — l’état demandé est DÉJÀ enregistré : rien ne doit être écrit');
  {
    const b = await ecran({ monde: { publie: 'non' } });
    B.MP.poserParam(b.srv, 'tournoi_publie', 'oui');   // un autre onglet a publié entre-temps
    await b.clic('bouton-publier', 40);
    const cumul = b.cumul();
    ok(cumul.ecritureValeurs.cellules === 0,
      'D1 ⭐⭐ publier un tournoi DÉJÀ publié n’écrit AUCUNE cellule (écriture différentielle)',
      cumul.ecritureValeurs.cellules);
    ok(cumul.instantane.reconstruit === 0 && cumul.instantane.invalide === 0,
      'D2 ⭐⭐ …et n’invalide ni ne reconstruit l’instantané public', cumul.instantane);
    ok(b.texte('message-publication').indexOf('Déjà publié') !== -1,
      'D3 ⭐ l’écran l’AVOUE — ⛔ jamais « Tournoi publié », qui laisserait croire à une écriture : « ' +
      b.texte('message-publication').slice(0, 60) + ' »');
    ok(b.srv.publie() === 'oui', 'D4 le drapeau reste « oui »');
  }
  {
    const b = await ecran({ monde: { publie: 'oui' } });
    B.MP.poserParam(b.srv, 'tournoi_publie', 'non');
    await b.clic('bouton-publier', 40);
    ok(b.cumul().ecritureValeurs.cellules === 0 && b.cumul().instantane.invalide === 0,
      'D5 ⭐ masquer un tournoi DÉJÀ masqué n’écrit rien non plus', b.cumul().ecritureValeurs.cellules);
    ok(b.texte('message-publication').indexOf('Déjà masqué') !== -1,
      'D6 ⭐ et l’écran le dit', b.texte('message-publication').slice(0, 60));
  }

  titre('E — un double clic ne publie pas deux fois');
  {
    const b = await ecran({ monde: { publie: 'non' } });
    b.clicSansAttendre('bouton-publier');
    b.clicSansAttendre('bouton-publier');
    await b.tour(80);
    ok(b.dialogues.length === 1,
      'E1 ⭐⭐ UNE seule question posée — le garde est pris AVANT le dialogue', b.dialogues.length);
    ok(JSON.stringify(b.requetes()) === JSON.stringify(['enregistrerInfosTournoi', 'publierTournoi']),
      'E2 ⭐⭐ DEUX requêtes au total, pas quatre', b.requetes());
    ok(b.cumul().instantane.invalide === 1 && b.cumul().instantane.reconstruit === 0,
      'E3 ⭐ l’instantané n’est touché qu’UNE fois', b.cumul().instantane);
    /* ⭐ Le garde est RELÂCHÉ : un second clic délibéré, après coup, fonctionne. */
    b.remettre();
    await b.clic('bouton-publier', 40);
    ok(b.requetes().length === 1 && b.srv.publie() === 'non',
      'E4 ⛔ le garde ne reste pas fermé : le clic suivant masque normalement', b.requetes());
  }
  {
    /* ⭐ Contre-épreuve sur le frontend FIGÉ : le défaut était bien là. */
    const b = await B.banc({ js: B.LECTEUR_AVANT, monde: { publie: 'non' } });
    b.remettre();
    b.clicSansAttendre('bouton-publier');
    b.clicSansAttendre('bouton-publier');
    await b.tour(80);
    ok(b.dialogues.length === 2 && b.requetes().length === 8,
      'E5 ⭐⭐ contre-épreuve — le frontend figé posait DEUX questions et émettait HUIT requêtes',
      [b.dialogues.length, b.requetes()]);
  }
  {
    const b = await ecran({ monde: { publie: 'oui' } });
    await b.clicGeste('PREPARER', 40);
    b.remettre();
    b.clicGesteSansAttendre('ROTATION');
    b.clicGesteSansAttendre('ROTATION');
    await b.tour(80);
    ok(b.dialogues.length === 1 && b.requetes().length === 1,
      'E6 ⭐⭐ double clic sur « Renouveler le lien » : UNE question, UNE requête',
      [b.dialogues.length, b.requetes()]);
    ok(Number((b.srv.acces() || {}).rotations) === 1,
      'E7 ⭐⭐ UNE seule rotation enregistrée', (b.srv.acces() || {}).rotations);
  }

  titre('F — les commandes de la table de marque : une requête chacune');
  {
    const b = await ecran({ monde: { publie: 'oui' } });
    const attendu = { PREPARER: 1, OUVRIR: 1, FIGER: 2, REPRENDRE: 1, ROTATION: 1, CLOTURER: 2 };
    const observe = {};
    const etats = {};
    for (const geste of ['PREPARER', 'OUVRIR', 'FIGER', 'REPRENDRE', 'ROTATION', 'CLOTURER']) {
      b.remettre();
      await b.clicGeste(geste, 40);
      observe[geste] = b.requetes().length;
      etats[geste] = (b.etatEcran() || {}).etat;
      /* ⭐ Aucune de ces écritures ne touche l'instantané public : ⛔ une transition d'accès
         n'est pas une écriture métier. */
      const c = b.cumul();
      if (c.instantane.reconstruit || c.instantane.invalide) observe[geste + ':instantane'] = c.instantane;
    }
    ok(JSON.stringify(observe) === JSON.stringify(attendu),
      'F1 ⭐⭐ chaque commande émet UNE requête — deux seulement quand le serveur exige une ' +
      'confirmation renforcée (pause, clôture) : ⛔ plus de relecture après l’écriture', observe);
    ok(JSON.stringify(etats) === JSON.stringify({ PREPARER: 'PREPARE', OUVRIR: 'OUVERT',
      FIGER: 'FIGE', REPRENDRE: 'OUVERT', ROTATION: 'OUVERT', CLOTURER: 'CLOTURE' }),
      'F2 ⭐⭐ l’écran peint à chaque fois l’état RELU PAR LE SERVEUR, pas un état deviné', etats);
    ok(b.gestesOfferts().length === 0,
      'F3 une fois clôturé, l’écran ne propose plus AUCUN geste', b.gestesOfferts());
  }
  {
    /* ⭐ La demande porte bien le drapeau, et LUI SEUL a changé dans le corps envoyé. */
    const b = await ecran({ monde: { publie: 'oui' } });
    await b.clicGeste('PREPARER', 40);
    const d = b.demandes()[0];
    ok(d && d.action === 'changerAccesScores' && d.renvoyer_etat === 'oui' &&
       d.transition === 'PREPARER' && d.version_lue === '0' && /^adm-/.test(String(d.requete_id)),
      'F4 ⭐ la demande porte `renvoyer_etat: "oui"`, la version lue et un identifiant de demande NEUF',
      d);
    ok(b.el('acces-saisie-lien').getAttribute('href').indexOf('https://') === 0 &&
       b.el('acces-saisie-qr').getAttribute('data-url') ===
         b.el('acces-saisie-lien').getAttribute('href'),
      'F5 ⭐ le lien rendu par le serveur est affiché tel quel, et le QR encode CE lien',
      b.el('acces-saisie-lien').getAttribute('href'));
  }

  titre('G — aucune clé, aucun jeton ne traverse l’écran');
  {
    const b = await ecran({ monde: { publie: 'oui' } });
    await b.clicGeste('PREPARER', 40);
    await b.clicGeste('OUVRIR', 40);
    const lien = b.el('acces-saisie-lien').getAttribute('href');
    const jeton = (/[?&]jeton=([0-9a-f]{64})/.exec(lien) || [])[1] || null;
    ok(jeton !== null, 'G1 le lien porte bien un jeton de 64 hexadécimaux (rendu par le serveur)');
    ok(lien.indexOf(B.CLE_ADMIN) === -1 && lien.indexOf(B.MP.CLE_SCORES) === -1,
      'G2 ⭐⭐ ⛔ NI la clé admin NI la clé scores dans le lien de la table de marque');
    const public_ = b.el('acces-public-lien').getAttribute('href');
    ok(public_.indexOf(B.CLE_ADMIN) === -1 && public_.indexOf(B.MP.CLE_SCORES) === -1 &&
       public_.indexOf(jeton) === -1,
      'G3 ⭐⭐ ⛔ ni clé ni jeton dans l’adresse PUBLIQUE ni dans son QR');
    /* ⭐ L'instantané public, celui que la page des scores lit, ne doit rien porter non plus. */
    const instantane = JSON.stringify(b.srv.getMesure({ action: 'getAll' }, 'sonde').reponse);
    ok(instantane.indexOf(B.CLE_ADMIN) === -1 && instantane.indexOf(B.MP.CLE_SCORES) === -1 &&
       instantane.indexOf(jeton) === -1,
      'G4 ⭐⭐ la vue PUBLIQUE du tournoi ne porte ni clé, ni jeton, ni lien protégé');
    /* ⛔ Et rien de tout cela ne doit être parti dans une URL : le transport est un POST. */
    const enClair = b.sorties.filter((s) => s.indexOf(B.CLE_ADMIN) !== -1 ||
      s.indexOf(B.MP.CLE_SCORES) !== -1 || (jeton && s.indexOf(jeton) !== -1));
    ok(enClair.length === 0,
      'G5 ⭐⭐ aucune clé ni jeton dans une URL émise par le navigateur', enClair);
  }

  titre('H — réponse perdue, panne, serveur muet');
  {
    /* ⭐ LE SERVEUR A ÉCRIT, LA RÉPONSE EST PERDUE. */
    const b = await ecran({ monde: { publie: 'non' }, pannes: { publierTournoi: 'perdue' } });
    await b.clic('bouton-publier', 80);
    ok(b.srv.publie() === 'oui', 'H1 prémisse : le serveur a bien écrit « oui »');
    ok(b.texte('etat-publication').indexOf('Publié') !== -1 &&
       b.texte('bouton-publier').indexOf('Masquer') !== -1,
      'H2 ⭐⭐ l’écran peint l’état RÉELLEMENT relu — ⛔ jamais l’état d’avant',
      [b.texte('etat-publication'), b.texte('bouton-publier')]);
    const msg = b.texte('message-publication');
    ok(msg.indexOf('non reçue') !== -1 && msg.indexOf('n’est pas confirmé') !== -1,
      'H3 ⭐⭐ ⛔ ce n’est PAS annoncé comme un échec certain : « ' + msg.slice(0, 80) + ' »');
    ok(msg.indexOf('Rien n’est réémis automatiquement') !== -1,
      'H4 ⭐ et l’écran dit qu’il n’a rien réémis tout seul');
    ok(JSON.stringify(b.requetes()) ===
       JSON.stringify(['enregistrerInfosTournoi', 'publierTournoi', 'getConfigAdmin']),
      'H5 ⭐ la 3ᵉ requête est une LECTURE de la configuration — ⛔ jamais un rejeu de l’écriture',
      b.requetes());
    ok(b.cumul().ecritureValeurs.cellules === 1,
      'H6 ⭐⭐ UNE seule cellule écrite en tout : l’écriture n’a pas été rejouée',
      b.cumul().ecritureValeurs.cellules);
  }
  {
    /* ⭐ PANNE FRANCHE : rien n'est parti, l'écran doit rester exact. */
    const b = await ecran({ monde: { publie: 'non' }, pannes: { publierTournoi: 'reseau' } });
    await b.clic('bouton-publier', 80);
    ok(b.srv.publie() === 'non' && b.texte('etat-publication').indexOf('Non publié') !== -1,
      'H7 rien n’a été écrit, et l’écran dit « Non publié »');
    ok(b.texte('message-publication').indexOf('non reçue') !== -1,
      'H8 ⭐ une panne réseau reste une issue INCONNUE : l’écran ne tranche pas à la place du serveur');
  }
  {
    /* ⭐ SERVEUR MUET : l'attente se dénoue, la cause est nommée, le bouton revient. */
    const b = await ecran({ monde: { publie: 'non' }, pannes: { publierTournoi: 'silence' } });
    b.clicSansAttendre('bouton-publier');
    await b.tour(400);
    ok(b.el('bouton-publier').disabled === false,
      'H9 ⭐⭐ le bouton n’est PAS resté grisé indéfiniment — l’attente est bornée');
    ok(b.texte('message-publication').indexOf('délai de 30 s dépassé') !== -1,
      'H10 ⭐ la cause est NOMMÉE : « ' + b.texte('message-publication').slice(0, 70) + ' »');
  }
  {
    /* ⭐ Contre-épreuve : le frontend FIGÉ restait pendu. */
    const b = await B.banc({ js: B.LECTEUR_AVANT, monde: { publie: 'non' },
                             pannes: { publierTournoi: 'silence' } });
    b.remettre();
    b.clicSansAttendre('bouton-publier');
    await b.tour(400);
    ok(b.el('bouton-publier').disabled === true &&
       b.texte('message-publication').indexOf('Publication…') !== -1,
      'H11 ⭐⭐ contre-épreuve — le frontend figé restait figé sur « Publication… », bouton grisé',
      [b.el('bouton-publier').disabled, b.texte('message-publication')]);
  }
  {
    /* ⭐ LECTURE MUETTE À L'ARRIVÉE : la carte de la table de marque ne reste pas vide et sans mot. */
    const b = await B.banc({ monde: { publie: 'oui' }, pannes: { getAccesScoresAdmin: 'silence' } });
    b.remettre();
    b.arriver();
    await b.tour(400);
    ok(b.texte('message-acces-saisie').indexOf('indisponible') !== -1 &&
       b.texte('message-acces-saisie').indexOf('délai') !== -1,
      'H12 ⭐⭐ une lecture d’accès muette finit par DIRE qu’elle a échoué, et pourquoi : « ' +
      b.texte('message-acces-saisie').slice(0, 70) + ' »');
    const bAvant = await B.banc({ js: B.LECTEUR_AVANT, monde: { publie: 'oui' },
                                  pannes: { getAccesScoresAdmin: 'silence' } });
    await bAvant.tour(400);
    ok(bAvant.texte('message-acces-saisie') === '',
      'H13 ⭐⭐ contre-épreuve — le frontend figé laissait la carte MUETTE, sans délai ni message',
      bAvant.texte('message-acces-saisie'));
  }
  {
    /* ⭐ RÉPONSE PERDUE SUR UNE TRANSITION D'ACCÈS : l'écran relit et n'accuse rien. */
    const b = await ecran({ monde: { publie: 'oui' }, pannes: { changerAccesScores: 'perdue' } });
    await b.clicGeste('PREPARER', 80);
    ok(Number((b.srv.acces() || {}).version) === 1,
      'H14 prémisse : le serveur a bien appliqué la transition');
    ok((b.etatEcran() || {}).etat === 'PREPARE',
      'H15 ⭐⭐ l’écran peint l’état relu (PREPARE), pas l’état d’avant', (b.etatEcran() || {}).etat);
    ok(b.texte('message-acces-saisie').indexOf('non reçue') !== -1,
      'H16 ⭐ et l’issue est dite INCONNUE, pas « échec »',
      b.texte('message-acces-saisie').slice(0, 80));
    ok(b.requetes().filter((a) => a === 'changerAccesScores').length === 1,
      'H17 ⭐⭐ ⛔ l’écriture n’a PAS été réémise', b.requetes());
  }
  {
    /* ⭐ REFUS LISIBLE DU SERVEUR : lui, se dit tel quel, et n'écrit rien de métier. */
    const b = await ecran({ monde: { publie: 'oui' } });
    await b.clicGeste('PREPARER', 40);
    /* L'écran est PÉRIMÉ : une autre session a fait avancer la version. */
    b.srv.amenerAcces(['OUVRIR']);
    b.remettre();
    await b.clicGeste('ROTATION', 60);
    ok(b.texte('message-acces-saisie').indexOf('a changé depuis') !== -1,
      'H18 ⭐ un écran périmé est REFUSÉ par le serveur, avec son message : « ' +
      b.texte('message-acces-saisie').slice(0, 70) + ' »');
    ok(Number((b.srv.acces() || {}).rotations) === 0,
      'H19 ⭐⭐ ⛔ un refus ne renouvelle RIEN', (b.srv.acces() || {}).rotations);
    ok((b.etatEcran() || {}).etat === 'OUVERT' && Number((b.etatEcran() || {}).version) === 2,
      'H20 ⭐ et l’écran se remet à jour sur l’état réel du serveur', b.etatEcran());
  }

  titre('I — compatibilité : ancien frontend, ancien backend');
  {
    const b = await B.banc({ backend: B.BACKEND_AVANT(), monde: { publie: 'non' } });
    await b.arriver();
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(b.srv.publie() === 'oui' && b.texte('etat-publication').indexOf('Publié') !== -1,
      'I1 ⭐⭐ NOUVEAU frontend × ANCIEN backend : publier fonctionne et l’écran est juste');
    ok(JSON.stringify(b.requetes()) ===
       JSON.stringify(['enregistrerInfosTournoi', 'publierTournoi', 'getConfigAdmin']),
      'I2 ⭐ …par le REPLI : sans configuration jointe, l’écran relit — exactement comme avant',
      b.requetes());
    b.remettre();
    await b.clicGeste('PREPARER', 60);
    ok(JSON.stringify(b.requetes()) === JSON.stringify(['changerAccesScores', 'getAccesScoresAdmin']),
      'I3 ⭐ …et sans état joint, il relit l’accès — le repli est complet', b.requetes());
    ok((b.etatEcran() || {}).etat === 'PREPARE' && !!(b.etatEcran() || {}).lien,
      'I4 ⭐⭐ l’écran affiche le bon état ET le lien, servi par un backend qui ne connaît pas ce lot');
  }
  {
    const b = await B.banc({ js: B.LECTEUR_AVANT, monde: { publie: 'non' } });
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(b.srv.publie() === 'oui' && b.texte('etat-publication').indexOf('Publié') !== -1,
      'I5 ⭐⭐ ANCIEN frontend × NOUVEAU backend : publier fonctionne, sans rien remarquer');
    const sansDrapeau = b.demandes().every((d) => d.renvoyer_etat === undefined);
    ok(sansDrapeau,
      'I6 ⭐ l’ancien frontend ne demande pas l’état joint — la réponse reste celle d’avant',
      b.demandes().map((d) => [d.action, d.renvoyer_etat]));
    b.remettre();
    await b.clicGeste('PREPARER', 60);
    ok(JSON.stringify(b.requetes()) === JSON.stringify(['changerAccesScores', 'getAccesScoresAdmin']) &&
       (b.etatEcran() || {}).etat === 'PREPARE',
      'I7 ⭐⭐ …et ses deux requêtes par geste continuent de marcher à l’identique', b.requetes());
  }
  {
    /* ⭐ CACHE MÊLÉ : un navigateur peut servir l'ANCIEN admin.js avec le NOUVEAU module de
       publication (et l'inverse). ⛔ Aucune des deux combinaisons ne doit casser l'écran. */
    const b1 = await B.banc({ js: B.lecteurMele(['js/admin.js']), monde: { publie: 'non' } });
    await b1.arriver();
    b1.remettre();
    await b1.clic('bouton-publier', 60);
    ok(b1.srv.publie() === 'oui',
      'I8 ⭐ ancien `admin.js` (sans la ressource d’écran) + nouveau module : publier marche encore');
    b1.remettre();
    await b1.clicGeste('PREPARER', 60);
    ok((b1.etatEcran() || {}).etat === 'PREPARE',
      'I9 ⭐⭐ …et le geste peint l’état joint sans le registre (garde `typeof`)',
      (b1.etatEcran() || {}).etat);
    const b2 = await B.banc({ js: B.lecteurMele(['js/admin-infos-publication.js']),
                              monde: { publie: 'non' } });
    b2.remettre();
    await b2.clic('bouton-publier', 60);
    ok(b2.srv.publie() === 'oui',
      'I10 ⭐ nouveau `admin.js` + ancien module de publication : publier marche aussi');
  }

  titre('J — la carte est peinte par le serveur, jamais devinée');
  {
    /* ⭐ Passerelle absente : le serveur ne rend AUCUN lien. L'écran ne doit pas en inventer. */
    const b = await ecran({ monde: { publie: 'oui', sansPasserelle: true } });
    await b.clicGeste('PREPARER', 40);
    ok(b.el('acces-saisie-lien').hidden === true &&
       b.el('acces-saisie-qr').getAttribute('data-url') === null,
      'J1 ⭐⭐ sans lien rendu par le serveur : ⛔ ni bouton d’accès, ni QR — rien n’est fabriqué ici',
      [b.el('acces-saisie-lien').hidden, b.el('acces-saisie-qr').getAttribute('data-url')]);
    ok(b.gestesOfferts().indexOf('CLOTURER') !== -1,
      'J2 la clôture reste offerte : l’accès existe, c’est sa page qui n’est pas configurée',
      b.gestesOfferts());
  }
  {
    /* ⛔ Le garde-fou de « Publier » : il grise PUBLIER, jamais MASQUER. */
    const b = await ecran({ monde: { publie: 'non', matinIncomplet: true } });
    ok(b.el('bouton-publier').disabled === false,
      'J3 un matin incomplet ne bloque pas « Publier » (les étapes de préparation, elles, sont faites)');
    const b2 = await ecran({ monde: { publie: 'oui' } });
    B.MP.poserParam(b2.srv, 'tournoi_publie', 'oui');
    ok(b2.el('bouton-publier').disabled === false &&
       b2.texte('bouton-publier').indexOf('Masquer') !== -1,
      'J4 ⭐⭐ INVARIANT : « Masquer » n’est JAMAIS grisé — le retrait est le geste d’urgence');
  }

  titre('K — fusion à trois voies : le scénario à DEUX ONGLETS ne peut plus perdre d’information');

  /** Les quatre champs d’information, lus DANS LE CLASSEUR. */
  const CHAMPS_INFOS = ['tournoi_nom', 'tournoi_lieu', 'tournoi_adresse', 'tournoi_description'];
  const infosDe = (srv) => CHAMPS_INFOS.reduce(function (o, c) { o[c] = B.MP.lireParamConfig(srv, c); return o; }, {});
  /** Le détail serveur des requêtes d’une action donnée. */
  const detailDe = (b, action) => B.cumulerDetails(b.details.filter((d, i) => b.requetes()[i] === action));
  /** Un lecteur de frontend MUTÉ : un seul fichier, une seule substitution. */
  const jsMute = (fichier, avant, apres) => (f) => {
    const src = B.lecteur()(f);
    if (f !== fichier) return src;
    const parts = src.split(avant);
    if (parts.length !== 2) throw new Error('mutant frontend : motif vu ' + (parts.length - 1) + ' fois');
    return parts.join(apres);
  };
  /** Un backend MUTÉ, une seule substitution. */
  const backMute = (avant, apres) => {
    const src = B.BACKEND_COURANT();
    const parts = src.split(avant);
    if (parts.length !== 2) throw new Error('mutant backend : motif vu ' + (parts.length - 1) + ' fois');
    return parts.join(apres);
  };

  {
    /* ⭐⭐ LE SCÉNARIO EXACT QUI AVAIT BLOQUÉ LE LOT.
       ① cet écran charge les infos ; ② un AUTRE onglet corrige le nom et le lieu ;
       ③ cet écran, resté ouvert, clique « Publier » ; ④ les corrections doivent SURVIVRE. */
    const b = await ecran({ monde: { publie: 'non' } });
    b.srv.postMesure({ action: 'enregistrerInfosTournoi', cle: B.CLE_ADMIN,
      tournoi_nom: 'Nom corrigé par l’AUTRE onglet',
      tournoi_lieu: 'Stade corrigé par l’AUTRE onglet' }, 'autre');
    const attendu = infosDe(b.srv);
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(b.srv.publie() === 'oui', 'K1 la publication a bien lieu');
    ok(infosDe(b.srv).tournoi_nom === attendu.tournoi_nom &&
       infosDe(b.srv).tournoi_lieu === attendu.tournoi_lieu,
      'K2 ⭐⭐ LES CORRECTIONS DE L’AUTRE ONGLET SURVIVENT — l’écrasement silencieux est fermé',
      infosDe(b.srv));
    ok(detailDe(b, 'enregistrerInfosTournoi').ecritureValeurs.cellules === 0,
      'K3 ⭐⭐ et ZÉRO cellule d’information n’a été écrite',
      detailDe(b, 'enregistrerInfosTournoi').ecritureValeurs.cellules);
    ok(JSON.stringify(b.requetes()) === JSON.stringify(['enregistrerInfosTournoi', 'publierTournoi']),
      'K4 ⭐ le parcours reste à DEUX requêtes — la correction n’en ajoute aucune', b.requetes());
    const envoi = b.demandes().filter((d) => d.action === 'enregistrerInfosTournoi')[0];
    ok(!!envoi.base_infos && envoi.base_infos.tournoi_nom !== attendu.tournoi_nom,
      'K5 ⭐ la base envoyée est celle du CHARGEMENT, ⛔ jamais la valeur distante', envoi.base_infos);
    ok(b.el('form-infos-tournoi').tournoi_nom.value === attendu.tournoi_nom &&
       b.valeur('baseInfosTournoi').tournoi_nom === attendu.tournoi_nom,
      'K6 ⭐ après une publication CONFIRMÉE, formulaire et base suivent le serveur',
      [b.el('form-infos-tournoi').tournoi_nom.value, b.valeur('baseInfosTournoi').tournoi_nom]);
  }
  {
    /* ⭐ CONTRE-ÉPREUVE sur le frontend FIGÉ : le défaut était bien là, et il perdait des données. */
    const b = await B.banc({ js: B.LECTEUR_AVANT, monde: { publie: 'non' } });
    b.srv.postMesure({ action: 'enregistrerInfosTournoi', cle: B.CLE_ADMIN,
      tournoi_nom: 'Nom corrigé par l’AUTRE onglet' }, 'autre');
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(infosDe(b.srv).tournoi_nom !== 'Nom corrigé par l’AUTRE onglet',
      'K7 ⭐⭐ contre-épreuve — le frontend figé ÉCRASAIT la correction distante',
      infosDe(b.srv).tournoi_nom);
  }
  {
    /* ⭐ UN CHAMP LOCAL + UN CHAMP DISTANT : les deux survivent, et une seule cellule bouge. */
    const b = await ecran({ monde: { publie: 'non' } });
    b.srv.postMesure({ action: 'enregistrerInfosTournoi', cle: B.CLE_ADMIN,
      tournoi_lieu: 'LIEU DISTANT' }, 'autre');
    b.el('form-infos-tournoi').tournoi_description.value = 'DESCRIPTION LOCALE';
    b.remettre();
    await b.clic('bouton-publier', 60);
    const apres = infosDe(b.srv);
    ok(b.srv.publie() === 'oui' && apres.tournoi_lieu === 'LIEU DISTANT' &&
       apres.tournoi_description === 'DESCRIPTION LOCALE',
      'K8 ⭐⭐ les DEUX changements survivent — aucune valeur perdue', apres);
    ok(detailDe(b, 'enregistrerInfosTournoi').ecritureValeurs.cellules === 1,
      'K9 ⭐ UNE seule cellule écrite', detailDe(b, 'enregistrerInfosTournoi').ecritureValeurs.cellules);
  }
  {
    /* ⭐⭐ CONFLIT RÉEL : le même champ changé différemment des deux côtés. */
    const b = await ecran({ monde: { publie: 'non' } });
    b.srv.postMesure({ action: 'enregistrerInfosTournoi', cle: B.CLE_ADMIN,
      tournoi_nom: 'Nom DISTANT' }, 'autre');
    const avant = infosDe(b.srv);
    const baseAvant = JSON.stringify(b.valeur('baseInfosTournoi'));
    b.el('form-infos-tournoi').tournoi_nom.value = 'Nom LOCAL';
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(b.requetes().indexOf('publierTournoi') === -1 && b.srv.publie() === 'non',
      'K10 ⭐⭐ AUCUNE publication derrière un conflit', b.requetes());
    ok(JSON.stringify(infosDe(b.srv)) === JSON.stringify(avant),
      'K11 ⭐⭐ ZÉRO écriture d’information', infosDe(b.srv));
    const msg = b.texte('message-publication');
    ok(msg.indexOf('le nom du tournoi') !== -1,
      'K12 ⭐ le champ est NOMMÉ avec son libellé humain : « ' + msg.slice(0, 80) + ' »');
    ok(msg.indexOf('Nom LOCAL') !== -1 && msg.indexOf('Nom DISTANT') !== -1,
      'K13 ⭐ les DEUX versions sont montrées, pour décider');
    ok(msg.indexOf('n’a PAS été publié') !== -1 && msg.indexOf('Ta saisie est conservée') !== -1,
      'K14 ⭐ l’écran dit qu’il n’a rien publié et que la saisie est gardée');
    ok(b.el('form-infos-tournoi').tournoi_nom.value === 'Nom LOCAL',
      'K15 ⭐⭐ LA SAISIE LOCALE EST CONSERVÉE — ⛔ le formulaire n’est pas repeint par-dessus',
      b.el('form-infos-tournoi').tournoi_nom.value);
    ok(JSON.stringify(b.valeur('baseInfosTournoi')) === baseAvant,
      'K16 ⭐⭐ la base n’est PAS renouvelée : rien n’a été confirmé par le serveur');
    ok(b.el('bouton-publier').disabled === false, 'K17 le bouton redevient utilisable');
    ok(b.requetes().filter((a) => a === 'enregistrerInfosTournoi').length === 1,
      'K18 ⭐⭐ ⛔ aucune réémission automatique de l’écriture', b.requetes());
    /* ⭐ Et un SECOND clic, sans rien changer, reconflitue : la protection ne s’érode pas. */
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(b.srv.publie() === 'non' && infosDe(b.srv).tournoi_nom === 'Nom DISTANT',
      'K19 ⭐⭐ un second clic conflictue ENCORE : la valeur distante tient', infosDe(b.srv).tournoi_nom);
  }
  {
    /* ⭐ PLUSIEURS champs en conflit : tous nommés, aucune écriture partielle. */
    const b = await ecran({ monde: { publie: 'non' } });
    b.srv.postMesure({ action: 'enregistrerInfosTournoi', cle: B.CLE_ADMIN,
      tournoi_nom: 'N-D', tournoi_lieu: 'L-D' }, 'autre');
    const avant = infosDe(b.srv);
    b.el('form-infos-tournoi').tournoi_nom.value = 'N-L';
    b.el('form-infos-tournoi').tournoi_lieu.value = 'L-L';
    b.el('form-infos-tournoi').tournoi_description.value = 'D-L';
    b.remettre();
    await b.clic('bouton-publier', 60);
    const msg = b.texte('message-publication');
    ok(msg.indexOf('le nom du tournoi') !== -1 && msg.indexOf('le lieu') !== -1,
      'K20 ⭐⭐ les DEUX champs en conflit sont nommés', msg.slice(0, 120));
    ok(JSON.stringify(infosDe(b.srv)) === JSON.stringify(avant),
      'K21 ⭐⭐ ⛔ AUCUNE écriture partielle : la description, non conflictuelle, n’est pas passée',
      infosDe(b.srv).tournoi_description);
    ok(b.el('form-infos-tournoi').tournoi_description.value === 'D-L',
      'K22 ⭐ et les trois saisies locales sont conservées');
  }
  {
    /* ⭐ SECOND CLIC APRÈS SUCCÈS : la base vient du serveur, donc zéro écriture inutile. */
    const b = await ecran({ monde: { publie: 'non' } });
    b.el('form-infos-tournoi').tournoi_nom.value = 'PREMIER NOM';
    await b.clic('bouton-publier', 60);
    ok(infosDe(b.srv).tournoi_nom === 'PREMIER NOM' &&
       b.valeur('baseInfosTournoi').tournoi_nom === 'PREMIER NOM',
      'K23 premier clic : écrit, puis la base est renouvelée depuis la réponse');
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(JSON.stringify(b.requetes()) === JSON.stringify(['publierTournoi']),
      'K24 ⭐ masquer reste à UNE requête', b.requetes());
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(detailDe(b, 'enregistrerInfosTournoi').ecritureValeurs.cellules === 0,
      'K25 ⭐⭐ republier ensuite : ZÉRO écriture inutile',
      detailDe(b, 'enregistrerInfosTournoi').ecritureValeurs.cellules);
  }
  {
    /* ⭐ UN CHAMP DU DOM MANQUE : refus AVANT publication, aucune chaîne vide enregistrée. */
    const b = await ecran({ monde: { publie: 'non' } });
    const avant = infosDe(b.srv);
    const champ = b.el('form-infos-tournoi').querySelectorAll('textarea')
      .filter((e) => e.name === 'tournoi_description')[0];
    champ.remove();
    b.doc.nommer();
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(b.requetes().indexOf('publierTournoi') === -1 && b.srv.publie() === 'non',
      'K26 ⭐ champ absent : la publication ne part pas', b.requetes());
    ok(JSON.stringify(infosDe(b.srv)) === JSON.stringify(avant),
      'K27 ⭐⭐ ⛔ aucune chaîne vide enregistrée', infosDe(b.srv));
  }
  {
    /* ⭐ ENREGISTREMENT PRÉALABLE EN PANNE / RÉPONSE PERDUE : jamais de publication derrière. */
    const b = await ecran({ monde: { publie: 'non' }, pannes: { enregistrerInfosTournoi: 'reseau' } });
    await b.clic('bouton-publier', 80);
    ok(b.requetes().indexOf('publierTournoi') === -1 && b.srv.publie() === 'non',
      'K28 ⭐ panne de l’enregistrement : aucune publication', b.requetes());
    const c = await ecran({ monde: { publie: 'non' }, pannes: { enregistrerInfosTournoi: 'perdue' } });
    c.el('form-infos-tournoi').tournoi_nom.value = 'NOM LOCAL PERDU';
    await c.clic('bouton-publier', 80);
    ok(c.requetes().indexOf('publierTournoi') === -1 && c.srv.publie() === 'non',
      'K29 ⭐⭐ réponse PERDUE après l’enregistrement : ⛔ AUCUNE publication derrière un résultat inconnu',
      c.requetes());
    ok(c.requetes().filter((a) => a === 'enregistrerInfosTournoi').length === 1,
      'K30 ⭐⭐ ⛔ et aucune réémission aveugle de l’écriture', c.requetes());
    ok(c.el('form-infos-tournoi').tournoi_nom.value === 'NOM LOCAL PERDU',
      'K31 ⭐ la saisie locale survit à l’issue inconnue',
      c.el('form-infos-tournoi').tournoi_nom.value);
  }
  {
    /* ⭐⭐ NOUVEAU FRONTEND × ANCIEN BACKEND : la protection N’EXISTE PAS, et on le CARACTÉRISE. */
    const b = await B.banc({ backend: B.BACKEND_AVANT(), monde: { publie: 'non' } });
    await b.arriver();
    b.srv.postMesure({ action: 'enregistrerInfosTournoi', cle: B.CLE_ADMIN,
      tournoi_nom: 'Nom DISTANT' }, 'autre');
    b.remettre();
    await b.clic('bouton-publier', 60);
    const envoi = b.demandes().filter((d) => d.action === 'enregistrerInfosTournoi')[0];
    ok(!!envoi.base_infos, 'K32 le nouveau frontend ENVOIE bien la base');
    ok(infosDe(b.srv).tournoi_nom !== 'Nom DISTANT',
      'K33 ⭐⭐ un backend d’AVANT ignore la base : la protection est INDISPONIBLE — caractérisé ici, ' +
      'pas promis ailleurs', infosDe(b.srv).tournoi_nom);
    ok(b.srv.publie() === 'oui', 'K34 le parcours fonctionne quand même (repli)');
  }
  {
    /* ⭐ ANCIEN FRONTEND : aucune base, comportement historique. */
    const b = await B.banc({ js: B.LECTEUR_AVANT, monde: { publie: 'non' } });
    b.remettre();
    await b.clic('bouton-publier', 60);
    const envoi = b.demandes().filter((d) => d.action === 'enregistrerInfosTournoi')[0];
    ok(envoi.base_infos === undefined, 'K35 ⭐ l’ancien frontend n’envoie aucune base', Object.keys(envoi));
    ok(b.srv.publie() === 'oui', 'K36 et il publie, comme avant');
  }
  {
    /* ⭐ CACHE MÊLÉ : un `admin-infos-publication.js` d’avant n’envoie pas de base ; l’écran marche. */
    const b = await B.banc({ js: B.lecteurMele(['js/admin-infos-publication.js']),
                             monde: { publie: 'non' } });
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(b.srv.publie() === 'oui', 'K37 ⭐ module d’avant + `admin.js` à jour : publier fonctionne');
    const b2 = await B.banc({ js: B.lecteurMele(['js/admin.js']), monde: { publie: 'non' } });
    await b2.arriver();
    b2.remettre();
    await b2.clic('bouton-publier', 60);
    ok(b2.srv.publie() === 'oui', 'K38 ⭐ `admin.js` d’avant + module à jour : publier fonctionne');
    const envoi2 = b2.demandes().filter((d) => d.action === 'enregistrerInfosTournoi')[0];
    ok(!!envoi2.base_infos, 'K39 ⭐ et la base part quand même — elle ne dépend pas d’`admin.js`');
  }

  titre('L — mutants de l’écran : la protection ne tient pas par accident');
  {
    /* MF1 — le refus de conflit devient un SUCCÈS : l’écran publierait derrière. */
    const mute = backMute(
      "    error: 'Ces informations ont changé ailleurs depuis que cet écran les a chargées : ' +",
      "    ok: true, message_conflit: 'Ces informations ont changé ailleurs : ' +");
    const b = await B.banc({ backend: mute, monde: { publie: 'non' } });
    await b.arriver();
    b.srv.postMesure({ action: 'enregistrerInfosTournoi', cle: B.CLE_ADMIN, tournoi_nom: 'N-D' }, 'autre');
    b.el('form-infos-tournoi').tournoi_nom.value = 'N-L';
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(b.srv.publie() === 'oui',
      'L1 ⭐⭐ MUTANT MF1 détectable : un conflit rendu en SUCCÈS fait publier — c’est bien le ' +
      '`error` qui arrête l’écran', b.srv.publie());
  }
  {
    /* MF2 — la base devient la valeur NORMALISÉE du formulaire : une saisie locale serait perdue. */
    const b = await B.banc({ monde: { publie: 'non' },
      js: jsMute('js/admin-infos-publication.js',
        '  const base = baseInfosPour(envoi);',
        '  const base = {}; Object.keys(envoi || {}).forEach(function (c) {\n' +
        '    if (CHAMPS_BASE_INFOS.indexOf(c) !== -1) base[c] = envoi[c]; });') });
    await b.arriver();
    b.el('form-infos-tournoi').tournoi_nom.value = 'SAISIE LOCALE';
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(infosDe(b.srv).tournoi_nom !== 'SAISIE LOCALE',
      'L2 ⭐⭐ MUTANT MF2 détectable : une base prise sur le formulaire PERD la saisie locale',
      infosDe(b.srv).tournoi_nom);
    /* Témoin : sur la source intacte, la saisie locale est bien écrite. */
    const sain = await ecran({ monde: { publie: 'non' } });
    sain.el('form-infos-tournoi').tournoi_nom.value = 'SAISIE LOCALE';
    await sain.clic('bouton-publier', 60);
    ok(infosDe(sain.srv).tournoi_nom === 'SAISIE LOCALE',
      'L3 ⭐ témoin : sur la source intacte, la saisie locale est enregistrée',
      infosDe(sain.srv).tournoi_nom);
  }
  {
    /* MF3 — la base est renouvelée AVANT confirmation : le second clic écraserait le distant. */
    const b = await B.banc({ monde: { publie: 'non' },
      js: jsMute('js/admin-infos-publication.js',
        "  /* ⛔ L'état de publication, lui, n'a pas bougé",
        "  refus.conflits.forEach(function (c) { baseInfosTournoi[c.champ] = c.serveur; });\n" +
        "  /* ⛔ L'état de publication, lui, n'a pas bougé") });
    await b.arriver();
    b.srv.postMesure({ action: 'enregistrerInfosTournoi', cle: B.CLE_ADMIN, tournoi_nom: 'N-D' }, 'autre');
    b.el('form-infos-tournoi').tournoi_nom.value = 'N-L';
    await b.clic('bouton-publier', 60);          // 1er clic : conflit
    b.remettre();
    await b.clic('bouton-publier', 60);          // 2e clic : la base mutée autorise l’écrasement
    ok(infosDe(b.srv).tournoi_nom === 'N-L',
      'L4 ⭐⭐ MUTANT MF3 détectable : une base renouvelée avant confirmation laisse ÉCRASER au ' +
      'second clic', infosDe(b.srv).tournoi_nom);
  }
  {
    /* MF4 — le rendu du conflit repeint le formulaire : la saisie locale est effacée. */
    const b = await B.banc({ monde: { publie: 'non' },
      js: jsMute('js/admin-infos-publication.js',
        '  const conflit = conflitInfosTournoi(erreur);\n  if (conflit) { rendreConflitInfosTournoi(message, conflit); return; }',
        '  const conflit = conflitInfosTournoi(erreur);\n  if (conflit) { rendreConflitInfosTournoi(message, conflit); repeindreApresPublication(); return; }') });
    await b.arriver();
    b.srv.postMesure({ action: 'enregistrerInfosTournoi', cle: B.CLE_ADMIN, tournoi_nom: 'N-D' }, 'autre');
    b.el('form-infos-tournoi').tournoi_nom.value = 'N-L';
    b.remettre();
    await b.clic('bouton-publier', 60);
    ok(b.el('form-infos-tournoi').tournoi_nom.value !== 'N-L',
      'L5 ⭐⭐ MUTANT MF4 détectable : repeindre au rendu du conflit EFFACE la saisie locale',
      b.el('form-infos-tournoi').tournoi_nom.value);
  }

  console.log('\n==================================================');
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + '/' + n + ' contrôle(s) :');
    echecs.forEach((e) => console.log('  ✗ ' + e));
    process.exit(1);
  }
  console.log('OK — ' + n + '/' + n + ' contrôles de la surface de l’écran « Publication ».');
})().catch((e) => { console.error('ERREUR — ' + e.stack); process.exit(1); });
