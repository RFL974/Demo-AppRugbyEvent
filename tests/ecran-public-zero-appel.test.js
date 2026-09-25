#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  PAGES PUBLIQUES DU TOURNOI — ZÉRO ÉCRITURE, ZÉRO APPEL PARASITE
 * ============================================================================
 *  ▶ node tests/ecran-public-zero-appel.test.js
 *
 *  ⭐ LA GARANTIE DU LOT, ÉPROUVÉE PLUTÔT QU'ANNONCÉE. Un parcours public complet — ouverture,
 *  bascule d'onglets, filtres, rafraîchissement manuel, tour automatique, mise en arrière-plan,
 *  retour au premier plan, fermeture — ne doit produire :
 *    · AUCUNE écriture de classeur, AUCUNE opération Drive, AUCUNE propriété écrite ;
 *    · AUCUNE requête dupliquée ;
 *    · AUCUN appel à une adresse extérieure ;
 *    · AUCUNE action backend autre que la lecture publique.
 *
 *  🔬 CE QUI ÉTAIT VRAI AVANT CE LOT, et qui est rejoué ici contre le backend FIGÉ :
 *    · `tournoi.js` armait `mesureSponsors` — un POST SANS CLÉ qui créait l'onglet `Mesures` et y
 *      ajoutait une ligne. Une page publique MUTAIT le classeur de production, à chaque visite ;
 *    · `getHistorique` (ouvert par `perfs.html`) créait l'onglet `Historique` : six écritures.
 *
 *  ⛔ Aucun réseau, aucun service Google réel. Le banc ferme le monde extérieur et COMPTE toute
 *     tentative de sortie.
 * ============================================================================
 */

const path = require('node:path');
const B = require('./banc-ecran-public');
const { chargerBanc, resumer } = require(path.join(B.BACKEND, 'tests', 'banc-cout', 'instrumentation'));

const c = B.compteur();
const vrai = (v, m, p) => c.vrai(v, m, p);

/** Les écritures et opérations coûteuses d'une série de requêtes serveur. */
function bilan(srv) {
  const total = { ecritures: 0, structures: 0, verrous: 0, proprietesEcrites: 0, ouvertures: 0, actions: [] };
  srv.instrument.requetes.forEach((r) => {
    const s = resumer(r);
    total.ecritures += s.ecritures;
    total.structures += s.structures;
    total.verrous += s.verrous;
    total.ouvertures += s.ouvertures;
    total.actions.push(r.libelle);
    r.appels.forEach((a) => {
      if (a.service === 'PropertiesService' && (a.op === 'setProperty' || a.op === 'setProperties')) total.proprietesEcrites++;
      if (a.service === 'DriveApp') total.proprietesEcrites++;   // toute opération Drive compte comme un effet
    });
  });
  return total;
}

(async () => {
  /* ==================================================================
     1 — LE PARCOURS PUBLIC COMPLET N'ÉCRIT RIEN
     ================================================================== */
  {
    const b = await B.banc({ etat: 'oui' });
    await b.onglet('classements');
    await b.onglet('equipe');
    await b.rafraichir();
    await b.tourAutomatique();
    await b.fenetre('offline');
    await b.fenetre('online');
    await b.tour();
    const t = bilan(b.srv);
    vrai(t.ecritures === 0 && t.structures === 0,
      '1.1 ⭐⭐ parcours public complet : ZÉRO écriture de classeur', t);
    vrai(t.verrous === 0, '1.2 ⭐ aucun verrou pris — la saisie des scores n’attend jamais la page publique', t);
    vrai(t.proprietesEcrites === 0, '1.3 ⭐⭐ aucune propriété écrite, aucune opération Drive', t);
    vrai(t.actions.every((a) => a === 'getPublic'),
      '1.4 ⭐⭐ une seule action backend de tout le parcours : `getPublic`', t.actions);
    vrai(b.externes.length === 0,
      '1.5 ⭐ aucune adresse extérieure appelée (ni relais, ni image distante) — sorties : ' + b.sorties.length,
      b.externes);
    vrai(b.sorties.every((s) => s.indexOf('fetch ') === 0),
      '1.6 ⭐ la seule porte de sortie employée est `fetch` — ni balise, ni sendBeacon, ni WebSocket',
      b.sorties.filter((s) => s.indexOf('fetch ') !== 0));
    b.fermer();
  }

  /* ==================================================================
     2 — ZÉRO REQUÊTE DUPLIQUÉE
     ================================================================== */
  {
    const b = await B.banc({ etat: 'oui' });
    vrai(b.requetes().length === 1, '2.1 ⭐⭐ ouverture : UNE seule requête réseau', b.requetes());
    const avant = b.requetes().length;
    await b.onglet('classements'); await b.onglet('equipe'); await b.onglet('classements');
    vrai(b.requetes().length === avant,
      '2.2 ⭐⭐ basculer d’onglet n’émet RIEN — les deux vues sortent de la même lecture', b.requetes());
    // Les filtres de la barre des classements, s'ils existent dans cette configuration.
    const sel = b.el('cv-pub-creneau') || b.el('cv-pub-poule');
    if (sel) {
      sel.dispatchEvent({ type: 'change', target: sel });
      await b.tour();
      vrai(b.requetes().length === avant, '2.3 ⭐ un filtre n’émet RIEN non plus', b.requetes());
    } else {
      vrai(true, '2.3 ⭐ (pas de filtre dans cette configuration : rien à éprouver)');
    }
    await b.rafraichir();
    vrai(b.requetes().length === avant + 1, '2.4 ⭐⭐ un clic « Rafraîchir » = UNE requête, jamais deux', b.requetes());
    b.fermer();
  }

  /* ==================================================================
     3 — PAS DE TEMPÊTE : trois relances rapprochées ne posent qu'UN minuteur
     ================================================================== */
  {
    const b = await B.banc({ etat: 'oui' });
    const avant = b.requetes().length;
    await b.signauxSimultanes(['visibilitychange', 'online', 'online']);
    vrai(b.requetes().length - avant === 1,
      '3.1 ⭐⭐ retour au premier plan + deux « retour en ligne » dans le MÊME tour = UNE seule reprise',
      { avant, apres: b.requetes().length });
    const avant2 = b.requetes().length;
    await b.signauxSimultanes(['online']);
    vrai(b.requetes().length - avant2 === 1,
      '3.2 ⭐ un signal plus tard reprend bien : la coalescence ne BLOQUE pas la reprise suivante',
      { avant2, apres: b.requetes().length });
    b.fermer();
  }

  /* ==================================================================
     4 — LA PORTE D'ÉCRITURE PUBLIQUE DU BACKEND EST FERMÉE
     ================================================================== */
  {
    const fs = require('node:fs');
    const MPub = B.MPub;
    const releve = { action: 'mesureSponsors', appareil: 'ab12cd34ef56', session: 'zz99yy88',
      sponsors: { SPON0001: { expo: { rail: 12 }, aff: { rail: 4 }, clics: 2,
        plein: { ouverts: 1, secondes: 6, passes: 0 }, tranches: { '10:30': 30 } } } };

    const apres = chargerBanc(fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8'),
      (m) => MPub.peuplerPublic(m, { etat: 'oui' }));
    const r = apres.postMesure(releve);
    const s = resumer(r.mesure);
    vrai(r.reponse.ok === true && r.reponse.ignore === 'desactive' && s.ecritures === 0 && s.ouvertures === 0,
      '4.1 ⭐⭐ `mesureSponsors` sans clé : refus ANNONCÉ, zéro écriture, classeur même pas ouvert',
      { reponse: r.reponse, ecritures: s.ecritures, ouvertures: s.ouvertures });

    // Le TÉMOIN : le même relevé, sur le backend FIGÉ d'avant le lot, écrivait bel et bien.
    const avant = chargerBanc(B.BACKEND_AVANT(), (m) => MPub.peuplerPublic(m, { etat: 'oui' }));
    const ra = avant.postMesure(releve);
    const sa = resumer(ra.mesure);
    vrai(sa.ecritures > 0,
      '4.2 ⭐⭐ TÉMOIN — sur le backend figé `' + B.BACKEND_AVANT_REV.slice(0, 7) + '`, le même relevé écrivait : ' +
      sa.ecritures + ' écriture(s). Le contrôle 4.1 mord donc vraiment.', { ecritures: sa.ecritures });

    // `getHistorique` : la lecture publique ne crée plus l'onglet.
    const h = chargerBanc(fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8'),
      (m) => MPub.peuplerPublic(m, { etat: 'oui' }));
    h.feuilles.delete('Historique');
    const rh = h.getMesure({ action: 'getHistorique' });
    const sh = resumer(rh.mesure);
    vrai(sh.ecritures === 0 && !h.classeur.getSheetByName('Historique'),
      '4.3 ⭐⭐ `getHistorique` sur un classeur sans onglet : ZÉRO écriture, aucun onglet créé',
      { ecritures: sh.ecritures });

    const ha = chargerBanc(B.BACKEND_AVANT(), (m) => MPub.peuplerPublic(m, { etat: 'oui' }));
    ha.feuilles.delete('Historique');
    const sha = resumer(ha.getMesure({ action: 'getHistorique' }).mesure);
    vrai(sha.ecritures > 0,
      '4.4 ⭐⭐ TÉMOIN — sur le backend figé, la même lecture écrivait ' + sha.ecritures + ' fois',
      { ecritures: sha.ecritures });
  }

  /* ==================================================================
     5 — LE RELEVÉ N'EST MÊME PLUS ARMÉ PAR LA PAGE
     ================================================================== */
  {
    const source = require('node:fs').readFileSync(path.join(B.RACINE, 'js/tournoi.js'), 'utf8');
    const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    vrai(sansCommentaires.indexOf('sponsorsArmerEnvoi') === -1,
      '5.1 ⭐⭐ `js/tournoi.js` n’appelle plus `sponsorsArmerEnvoi()` (hors commentaires)');
    const avant = B.AVANT('js/tournoi.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    vrai(avant.indexOf('sponsorsArmerEnvoi') !== -1,
      '5.2 ⭐ TÉMOIN — la version figée `' + B.FRONTEND_AVANT_REV.slice(0, 7) + '` l’appelait bien');
  }

  console.log('\n──────────────────────────────────────────────');
  if (process.exitCode) console.log('ÉCHEC — voir ci-dessus.');
  else console.log('OK — ' + c.n + ' contrôles « zéro écriture / zéro appel parasite ».');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
