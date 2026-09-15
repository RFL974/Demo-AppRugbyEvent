/**
 * ============================================================================
 *  SAISIE PROTÉGÉE — la table de marque derrière la passerelle Apps Script
 *  IMPL-RACCORDEMENT-ACCES-SCORES-DR-5R · passerelle séparée : CORR-SURFACE-HTML-ACCES-SCORES-DR-5S
 * ============================================================================
 *
 *  Chargé UNIQUEMENT par la page que sert la PASSERELLE Apps Script séparée
 *  (`gateway-acces-scores/SaisieProtegee.html`, dépôt backend privé), APRÈS js/saisie.js. ⛔ Le backend
 *  monolithique ne sert plus aucune page : il ne répond qu'aux requêtes JSON (`API_URL`).
 *  Les crochets posés dans saisie.js (ouverture, « Rafraîchir », « Corriger », envoi d'un score) lui
 *  passent la main dès que ces fonctions existent.
 *  ⛔ La page publique `saisie.html` ne charge plus ni saisie.js ni ce fichier.
 *
 *  ⭐ CE QU'IL GARANTIT :
 *    · aucune donnée du tournoi n'est demandée avant le jeton ET la clé scores ;
 *    · `getAll` et `getCapacitesCategories` ne sont plus appelés : une seule lecture protégée,
 *      `getSaisieScores`, qui exige les deux ;
 *    · le jeton vit en MÉMOIRE seulement — ⛔ ni localStorage, ni sessionStorage, et il est retiré
 *      du document dès sa lecture ;
 *    · la clé scores suit le mécanisme 5A/5B : rangée seulement après une réponse POSITIVE, effacée
 *      si le serveur la refuse, jamais rangée sur une panne, réessai EXPLICITE sans ressaisie ;
 *    · chaque enregistrement porte un `requete_id` neuf et la `version_lue` du match ;
 *      ⛔ aucun enregistrement n'est jamais renvoyé automatiquement ;
 *    · SCORE_MODIFIE → message clair et rechargement AVANT toute nouvelle saisie ;
 *    · accès fermé (gel, clôture, rotation) → contexte vidé, interface fermée.
 * ============================================================================
 */

let saisieJeton = '';            // ⛔ mémoire vive seulement
let saisieAccesFerme = false;
let saisieCleRepli = '';         // seulement si le stockage de session est indisponible

const SAISIE_MOTIF_JETON = /^[0-9a-f]{64}$/;
const SAISIE_MESSAGE_FERME = '🔒 Accès fermé ou invalide. La saisie n\'est plus possible avec ce lien. ' +
  'Demande un lien à jour à l\'organisateur.';
const SAISIE_MESSAGE_MODIFIE = '⚠️ Ce match vient d\'être modifié depuis un autre appareil. ' +
  'Le score à jour est affiché : vérifie-le avant toute nouvelle saisie.';

/** La clé scores, par le mécanisme de session d'api.js (repli en mémoire si le stockage est bloqué). */
function lireCleTable() {
  try { return lireCleLocale('scores'); } catch (e) { return saisieCleRepli; }
}
function definirCleTable(valeur) {
  try { definirCleLocale('scores', valeur || ''); } catch (e) { saisieCleRepli = valeur || ''; }
}

/** Lit le jeton transmis par le serveur, puis le RETIRE du document. */
function lireJetonSaisieProtegee() {
  const el = document.getElementById('contexte-saisie');
  if (!el) return '';
  const jeton = String(el.getAttribute('data-jeton') || '');
  el.removeAttribute('data-jeton');
  return jeton;
}

/** Retire au mieux le jeton de la barre d'adresse. La passerelle n'attend aucun autre paramètre :
 *  l'adresse est donc remplacée SANS paramètre (5S). ⛔ La sécurité n'en dépend pas. */
function retirerJetonAdresse() {
  try {
    if (typeof google !== 'undefined' && google.script && google.script.history) {
      google.script.history.replace(null, {}, '');
    }
  } catch (e) { /* hors Apps Script : rien à retirer */ }
}

/** Un identifiant de demande NEUF à chaque envoi (il n'est pas secret : il doit être unique). */
function nouvelIdRequete() {
  const c = (typeof crypto !== 'undefined') ? crypto : null;
  if (c && typeof c.randomUUID === 'function') return 'tbl-' + c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const octets = new Uint8Array(16);
    c.getRandomValues(octets);
    return 'tbl-' + Array.from(octets, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  return 'tbl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2);
}

function reponseDe(err) { return (err && err.reponse) || {}; }

/** ⛔ FERMETURE : jeton, clé et données oubliés ; plus rien n'est saisissable dans cet onglet. */
function fermerInterfaceSaisie() {
  saisieJeton = '';
  saisieAccesFerme = true;
  definirCleTable('');
  matchs = [];
  equipes = [];
  nomParEquipe = {};
  capacitesCat = {};
  categoriesSaisie = [];
  const zone = document.getElementById('liste-matchs');
  if (zone) zone.innerHTML = '<p class="vide">' + echapper(SAISIE_MESSAGE_FERME) + '</p>';
  ['filtre-cat-saisie', 'filtre-terrain-saisie', 'barre-saisie', 'note-saisie'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

/** Les données reçues de `getSaisieScores`, rangées dans les variables de saisie.js puis affichées. */
function appliquerDonneesSaisie(data) {
  equipes = data.equipes || [];
  nomParEquipe = indexerNoms(equipes);
  matchs = data.matchs || [];
  grandsTerrains = lireGrandsTerrains(data.config);
  categoriesSaisie = (data.config && data.config.categories) || [];
  capacitesCat = (data.capacites && data.capacites.categories) || {};
  afficherMatchs();
  majHeureSaisie();
}

function lireSaisieScores(cle) {
  return apiPost('getSaisieScores', { cle: cle, jeton: saisieJeton });
}

/**
 * ⭐ LA CONNEXION DE LA TABLE : clé scores + jeton, validés ENSEMBLE par la lecture protégée.
 * Trois issues : données (clé acceptée), `null` (annulation ou accès fermé), et jamais d'exception.
 */
async function connexionTable() {
  let cle = lireCleTable();
  while (true) {
    if (saisieAccesFerme || !saisieJeton) return null;
    if (!cle) {
      const saisie = await dialogDemander('🔒 Accès de saisie des scores\n\nEntre la clé :', '',
        { ok: 'Se connecter', secret: true });
      if (saisie == null) return null;
      cle = saisie.trim();
      if (!cle) { await dialogAlerter('Clé incorrecte. Réessaie.'); continue; }
    }
    let data;
    try {
      data = await lireSaisieScores(cle);
    } catch (err) {
      if (reponseDe(err).acces_ferme === true) { fermerInterfaceSaisie(); return null; }
      if (estRefusCleExplicite(err)) {
        definirCleTable('');                    // ⛔ refusée : oubliée avant la redemande
        cle = '';
        await dialogAlerter('Clé incorrecte. Réessaie.');
        continue;
      }
      // ⛔ PANNE, PAS REFUS : rien n'est rangé ; « Réessayer » revérifie la même clé, sans ressaisie.
      if (!await dialogConfirmer(MESSAGE_VERIF_IMPOSSIBLE + err.message,
          { ok: 'Réessayer', annuler: 'Annuler' })) return null;
      continue;
    }
    definirCleTable(cle);                        // ⭐ rangée APRÈS la réponse positive
    return data;
  }
}

/** Crochet de `initSaisie` (saisie.js) : ⛔ aucune lecture avant le jeton et la clé. */
async function initSaisieProtegee() {
  const jeton = lireJetonSaisieProtegee();
  retirerJetonAdresse();
  if (!SAISIE_MOTIF_JETON.test(jeton)) { fermerInterfaceSaisie(); return; }
  saisieJeton = jeton;
  const zone = document.getElementById('liste-matchs');
  if (zone) zone.innerHTML = '<div class="message">🔒 Entre la clé scores pour afficher les matchs.</div>';
  const data = await connexionTable();
  if (!data) {
    if (!saisieAccesFerme && zone) {
      zone.innerHTML = '<div class="message">Clé scores non saisie : clique « Rafraîchir » pour la saisir.</div>';
    }
    return;
  }
  appliquerDonneesSaisie(data);
}

/** Crochet de `rafraichirSaisie` (saisie.js). */
async function rafraichirSaisieProtegee() {
  if (saisieAccesFerme) return;
  const bouton = document.getElementById('bouton-rafraichir-saisie');
  const texte = bouton ? bouton.textContent : '';
  if (bouton) { bouton.disabled = true; bouton.textContent = '⏳ …'; }
  try {
    const data = await connexionTable();
    if (data) appliquerDonneesSaisie(data);
  } finally {
    if (bouton) { bouton.disabled = false; bouton.textContent = texte; }
  }
}

/** Écrit le message « match modifié » sur la carte (rendue à neuf) de ce match. */
function signalerMatchModifie(idMatch) {
  const cartes = document.querySelectorAll('#liste-matchs .match');
  for (let i = 0; i < cartes.length; i++) {
    if (cartes[i].getAttribute('data-id') === idMatch) {
      const msg = cartes[i].querySelector('.message-form');
      if (msg) afficherMessage(msg, SAISIE_MESSAGE_MODIFIE, 'ko');
    }
  }
}

/** Après SCORE_MODIFIE : on RELIT (lecture, jamais réécriture), on réaffiche, on prévient. */
async function rechargerApresConflit(idMatch) {
  try {
    appliquerDonneesSaisie(await lireSaisieScores(lireCleTable()));
    signalerMatchModifie(idMatch);
  } catch (err) {
    if (reponseDe(err).acces_ferme === true) { fermerInterfaceSaisie(); return; }
    // ⚠️ Relecture impossible : l'écran reste périmé, et un nouvel envoi serait refusé de même.
  }
  await dialogAlerter(SAISIE_MESSAGE_MODIFIE);
}

/**
 * Crochet de « Corriger » (saisie.js) : confirmation forte par la clé scores, validée avec le jeton.
 * ⭐ Si le match a changé ailleurs entre-temps, on RECHARGE et on ne déverrouille pas.
 * @return {Promise<string|null>} la clé acceptée, ou null (annulation, accès fermé, match modifié).
 */
async function confirmerCleCorrectionProtegee(idMatch) {
  while (true) {
    if (saisieAccesFerme) return null;
    const saisie = await dialogDemander('🔒 Corriger un score définitif\n\nEntre la clé scores :', '',
      { ok: 'Valider', secret: true });
    if (saisie == null) return null;
    const cle = saisie.trim();
    if (!cle) { await dialogAlerter('Clé incorrecte.'); continue; }
    let data;
    while (data === undefined) {
      try {
        data = await lireSaisieScores(cle);
      } catch (err) {
        if (reponseDe(err).acces_ferme === true) { fermerInterfaceSaisie(); return null; }
        if (estRefusCleExplicite(err)) { data = null; break; }
        if (!await dialogConfirmer(MESSAGE_VERIF_IMPOSSIBLE + err.message,
            { ok: 'Réessayer', annuler: 'Annuler' })) return null;
      }
    }
    if (!data) { definirCleTable(''); await dialogAlerter('Clé incorrecte.'); continue; }
    definirCleTable(cle);
    const local = matchs.find(function (x) { return x.id_match === idMatch; });
    const frais = (data.matchs || []).find(function (x) { return x.id_match === idMatch; });
    if (!local || !frais || local.version_lue !== frais.version_lue) {
      appliquerDonneesSaisie(data);
      signalerMatchModifie(idMatch);
      await dialogAlerter(SAISIE_MESSAGE_MODIFIE);
      return null;
    }
    return cle;
  }
}

/**
 * Crochet de l'envoi d'un score (saisie.js). ⭐ `requete_id` neuf + `version_lue` du match.
 * ⛔ UN SEUL envoi : ni réessai automatique après une panne, ni renvoi après un refus de clé.
 */
async function envoyerScoreProtege(data) {
  if (saisieAccesFerme || !saisieJeton) throw new Error(SAISIE_MESSAGE_FERME);
  const cle = lireCleTable();
  if (!cle) {
    const recharge = await connexionTable();
    if (!recharge) throw new Error('Action annulée.');
    appliquerDonneesSaisie(recharge);
    throw new Error('Clé scores vérifiée : les matchs ont été rechargés. Vérifie le score puis valide à nouveau.');
  }
  const m = matchs.find(function (x) { return x.id_match === data.id_match; });
  const corps = Object.assign({}, data, {
    cle: cle, jeton: saisieJeton, requete_id: nouvelIdRequete(), version_lue: (m && m.version_lue) || ''
  });
  try {
    return await apiPost('enregistrerScore', corps);
  } catch (err) {
    const rep = reponseDe(err);
    if (rep.acces_ferme === true) { fermerInterfaceSaisie(); throw new Error(SAISIE_MESSAGE_FERME); }
    if (rep.refus === 'SCORE_MODIFIE') {
      await rechargerApresConflit(data.id_match);
      throw new Error(SAISIE_MESSAGE_MODIFIE);
    }
    if (estRefusCleExplicite(err)) {
      definirCleTable('');
      throw new Error('Clé scores refusée : clique « Rafraîchir » pour la saisir de nouveau, puis valide à nouveau.');
    }
    throw err;
  }
}
