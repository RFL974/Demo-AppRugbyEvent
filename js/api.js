/**
 * ============================================================================
 *  API — la "boîte à outils" pour parler au backend (Apps Script)
 * ============================================================================
 *
 *  Ce fichier fournit des fonctions simples que les pages utilisent pour
 *  récupérer les données, sans avoir à répéter le code technique partout.
 *
 *  Il a besoin de la variable API_URL, définie dans config.js.
 *  => Dans chaque page HTML, on charge config.js AVANT api.js.
 * ============================================================================
 */

/**
 * Va chercher une donnée auprès du backend (requête de LECTURE).
 * @param {string} action  ex : 'getConfig', 'getEquipes', 'getAll'
 * @param {Object} [params] paramètres supplémentaires éventuels (optionnel)
 * @param {Object} [options] { delaiMs } : délai maximum en millisecondes — au-delà,
 *   la requête est ABANDONNÉE et une erreur est levée. Utilisé par le rafraîchissement
 *   automatique de la page publique : sans ça, une connexion mobile qui « pend »
 *   indéfiniment gèlerait la boucle (elle n'enchaîne qu'après la fin de la requête).
 * @return {Promise<Object>} la réponse du backend, déjà transformée en objet
 *
 * Exemple d'utilisation :
 *   const config = await apiGet('getConfig');
 *   const tout   = await apiGet('getAll', null, { delaiMs: 12000 });
 */
async function apiGet(action, params, options) {
  // On construit l'URL complète : .../exec?action=getConfig&...
  const url = new URL(API_URL);
  url.searchParams.set('action', action);

  // On ajoute les éventuels paramètres supplémentaires.
  if (params) {
    for (const cle in params) {
      url.searchParams.set(cle, params[cle]);
    }
  }

  // Anti-cache : sans ça, le navigateur (surtout sur mobile) peut resservir une
  // réponse en cache pour cette même URL → le bouton « Rafraîchir » semblerait
  // ne rien faire (scores non mis à jour). Un paramètre unique force une vraie requête.
  url.searchParams.set('_', String(Date.now()));

  // Délai maximum optionnel : un minuteur "abandonne" la requête s'il expire.
  const delaiMs = options && options.delaiMs;
  const controleur = delaiMs ? new AbortController() : null;
  const minuteur = controleur ? setTimeout(function () { controleur.abort(); }, delaiMs) : null;

  try {
    // fetch() envoie la requête et attend la réponse. `cache: 'no-store'` désactive
    // en plus le cache HTTP du navigateur pour cette lecture.
    const reglages = { cache: 'no-store' };
    if (controleur) reglages.signal = controleur.signal;
    const reponse = await fetch(url.toString(), reglages);
    if (!reponse.ok) {
      throw new Error('Le serveur a répondu avec une erreur (' + reponse.status + ').');
    }

    // On transforme la réponse (du texte JSON) en objet JavaScript utilisable.
    const donnees = await reponse.json();

    // Si le backend a renvoyé un champ "error", on le signale.
    if (donnees && donnees.error) {
      throw new Error(donnees.error);
    }

    return donnees;
  } finally {
    if (minuteur) clearTimeout(minuteur); // toujours nettoyer le minuteur
  }
}

/**
 * Envoie une demande d'ÉCRITURE au backend (ajouter/supprimer…).
 * @param {string} action  ex : 'ajouterEquipe', 'supprimerEquipe'
 * @param {Object} [data]  les données à envoyer (ex : { nom_equipe, categorie })
 * @return {Promise<Object>} la réponse du backend
 *
 * Exemple :
 *   await apiPost('ajouterEquipe', { nom_equipe: 'Suresnes 1', categorie: 'U8' });
 */
async function apiPost(action, data) {
  // On regroupe l'action et les données dans un seul paquet.
  const corps = Object.assign({ action: action }, data || {});

  const reponse = await fetch(API_URL, {
    method: 'POST',
    // On envoie en "text/plain" volontairement : ça évite une vérification
    // préalable du navigateur (le "preflight" CORS) que Apps Script ne sait pas gérer.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(corps)
  });

  if (!reponse.ok) {
    throw new Error('Le serveur a répondu avec une erreur (' + reponse.status + ').');
  }

  const donnees = await reponse.json();
  if (donnees && donnees.error) {
    // On attache la réponse complète à l'erreur : certaines actions renvoient des
    // drapeaux utiles avec le message (ex : departage_requis, cascade_requise, match_suivant).
    const e = new Error(donnees.error);
    e.reponse = donnees;
    throw e;
  }

  return donnees;
}

/* ============================================================================
 *  CLÉS D'ÉCRITURE (admin / scores)
 *  Les actions d'écriture sont protégées côté backend par une clé. Ici on gère
 *  la clé côté navigateur : on la stocke sur l'appareil (localStorage) et on
 *  l'ajoute à chaque requête. `role` vaut 'admin' ou 'scores'.
 * ========================================================================== */

/** Lit la clé mémorisée pour un rôle ('admin' ou 'scores') — pour LA SESSION en cours.
 *  On utilise sessionStorage (et non localStorage) : la clé est oubliée quand l'onglet
 *  est fermé, donc elle est redemandée à chaque nouvelle « connexion » à la page. */
function lireCleLocale(role) {
  return sessionStorage.getItem('r92_cle_' + role) || '';
}

/** Mémorise la clé d'un rôle pour la session en cours. */
function definirCleLocale(role, cle) {
  sessionStorage.setItem('r92_cle_' + role, cle || '');
}

/** Demande la clé à l'utilisateur (pré-remplie avec la mémorisée). Renvoie null si annulé. */
async function demanderCle(role, message) {
  const saisie = await dialogDemander(message, lireCleLocale(role), { ok: 'Valider' });
  if (saisie == null) return null;
  const propre = saisie.trim();
  definirCleLocale(role, propre);
  return propre;
}

/**
 * Comme apiPost, mais ajoute la clé du rôle et la redemande une fois si elle est refusée.
 * @param {string} action
 * @param {Object} data
 * @param {string} role     'admin' ou 'scores'
 * @param {string} libelle  texte affiché à l'utilisateur (ex : "admin", "de saisie des scores")
 */
async function apiPostProtege(action, data, role, libelle) {
  let cle = lireCleLocale(role);
  if (!cle) cle = await demanderCle(role, 'Entre la clé ' + libelle + ' :');
  if (cle == null) throw new Error('Action annulée.');
  try {
    return await apiPost(action, Object.assign({}, data, { cle: cle }));
  } catch (err) {
    // Clé absente/incorrecte côté serveur → on la redemande une fois.
    if (estRefusCle(err.message)) {
      const nouvelle = await demanderCle(role, 'Clé ' + libelle + ' incorrecte. Réessaie :');
      if (nouvelle == null) throw new Error('Action annulée.');
      return await apiPost(action, Object.assign({}, data, { cle: nouvelle }));
    }
    throw err;
  }
}

/** Erreur signalant une clé absente/refusée par le serveur.
 *  On matche des mots ASCII ("incorrecte", "non configur") car l'« é » revient
 *  parfois mal encodé ("Cl√© incorrecte") dans le message renvoyé. */
function estRefusCle(message) {
  return /incorrecte|non\s*configur/i.test(String(message));
}

/* Identifiant SENTINELLE de la sonde de validation : il n'existe dans AUCUN classeur, donc
   la seule réponse honnête du serveur est « introuvable ». */
const CLE_SONDE_ID = '__verif_cle__';

/* Préfixe des messages d'ÉCHEC TECHNIQUE de la vérification. ⚠️ Volontairement distinct de
   « Clé incorrecte » : confondre les deux est exactement le défaut que ce lot corrige. */
const MESSAGE_VERIF_IMPOSSIBLE = 'Vérification de la clé impossible (problème technique, la clé n\'a pas été mémorisée).\n\nDétail : ';

/** Texte réduit : sans accents, sans casse. Le backend renvoie « Équipe » tantôt composé,
 *  tantôt décomposé (piège NFC/NFD du Sheet, déjà connu de memeTexteSouple). */
function texteNuCle(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Le serveur a-t-il EXPLICITEMENT refusé la clé ? Le drapeau structuré d'abord, le texte
 *  ensuite (les anciens déploiements ne renvoient que le message). */
function estRefusCleExplicite(err) {
  const rep = (err && err.reponse) || {};
  if (rep.acces_refuse === true) return true;
  return estRefusCle((err && err.message) || '');
}

/**
 * La réponse est-elle EXACTEMENT celle attendue de la sonde sentinelle ?
 *
 * DEUX conditions, toutes deux OBLIGATOIRES :
 *   ① le libellé PROPRE AU RÔLE — « Équipe introuvable » pour admin, « Match introuvable » pour
 *      scores. Une erreur métier inattendue (quota, classeur verrouillé, onglet manquant) ne
 *      vaut jamais validation, et le libellé de l'AUTRE rôle non plus ;
 *   ② le jeton `__verif_cle__`, dans le message OU dans le champ structuré PROPRE AU RÔLE.
 *
 * ⛔ LE REPLI « AUCUN JETON ⇒ VRAI » A ÉTÉ SUPPRIMÉ (R1). Il raisonnait ainsi : la sonde ne
 * portant qu'un identifiant, un « introuvable » ne pouvait concerner que lui. Le raisonnement
 * est juste — mais c'est une DÉDUCTION, pas une preuve, et elle ouvrait la seule porte qui
 * restait : n'importe quel « Équipe introuvable » sans jeton (message tronqué, reformulé,
 * traduit, produit par une autre couche) validait la clé. ⭐ Le backend renvoie le jeton
 * (`Équipe introuvable : <id>`) : rien ne justifie d'accepter une réponse qui ne le porte pas.
 * ⛔ Dans le doute, on refuse — et l'appelant lève. C'est le sens sûr de l'erreur.
 *
 * ⛔ ET LE CHAMP STRUCTURÉ EST LIÉ AU RÔLE (R2). La corroboration acceptait auparavant
 * `id_match || id_equipe || id`, quel que soit le rôle : une réponse « Équipe introuvable »
 * accompagnée d'un `id_match` validait la clé ADMIN, et réciproquement. Les deux rôles ouvrent
 * des pouvoirs différents — la clé de saisie des scores n'administre pas le tournoi : croiser
 * leurs preuves était le dernier endroit où l'un pouvait se faire passer pour l'autre.
 * ⛔ Le champ générique `id` a été retiré : il ne figure dans AUCUNE réponse du backend
 * (`backend/Code.gs` renvoie `{ error: 'Équipe introuvable : ' + id }`, sans champ d'identifiant).
 * ⚠️ `id_equipe` / `id_match` non plus, aujourd'hui : la preuve réelle est celle du MESSAGE. Ils
 * sont conservés — liés au rôle — pour qu'une réponse structurée ne soit pas rejetée si le
 * backend en ajoute un ; ⛔ jamais pour élargir ce qui est accepté.
 */
function estReponseSentinelleCle(role, err) {
  const scores = (role === 'scores');
  const attendu = scores ? 'match introuvable' : 'equipe introuvable';
  const brut = String((err && err.message) || '');
  if (texteNuCle(brut).indexOf(attendu) === -1) return false;   // ① libellé du rôle
  if (brut.indexOf(CLE_SONDE_ID) !== -1) return true;           // ② jeton dans le message
  const rep = (err && err.reponse) || {};
  const echo = scores ? rep.id_match : rep.id_equipe;           // ② champ DU RÔLE, et lui seul
  return String(echo || '') === CLE_SONDE_ID;
}

/**
 * Vérifie une clé SANS rien modifier : on envoie une action d'écriture avec l'identifiant
 * SENTINELLE `__verif_cle__`, qui n'existe pas. Trois issues, et TROIS SEULEMENT :
 *   · refus explicite de la clé            → `false` ;
 *   · réponse sentinelle du bon rôle       → `true` ;
 *   · tout le reste (panne réseau, HTTP, JSON invalide, délai, erreur métier inattendue,
 *     et même un succès inexplicable)      → l'erreur est LEVÉE.
 *
 * ⛔ CE QUI EST CORRIGÉ ICI. Cette fonction concluait `return !estRefusCle(err.message)` :
 * toute erreur qui n'était pas TEXTUELLEMENT « clé incorrecte » valait donc validation. Une
 * simple coupure réseau (« Failed to fetch ») suffisait à déclarer la connexion réussie SANS
 * qu'aucune clé n'ait jamais été vérifiée — et la mémorisait. Le sens de l'erreur était
 * inversé : l'incertitude ouvrait la porte au lieu de la fermer.
 * ⚠️ Une clé n'est désormais mémorisée que sur une preuve POSITIVE de son acceptation.
 *
 * @throws {Error} dès que la réponse n'est ni un refus reconnu ni la sentinelle attendue.
 */
async function cleValide(role, cle) {
  const sonde = (role === 'scores')
    ? { action: 'enregistrerScore', id_match: CLE_SONDE_ID, score_A: 0, score_B: 0 }
    : { action: 'supprimerEquipe', id_equipe: CLE_SONDE_ID };
  try {
    await apiPost(sonde.action, Object.assign(sonde, { cle: cle }));
  } catch (err) {
    if (estRefusCleExplicite(err)) return false;
    if (estReponseSentinelleCle(role, err)) return true;
    throw err; // ⛔ inconnu : on ne devine pas, on remonte
  }
  // ⛔ SUCCÈS NU. L'identifiant sentinelle n'existe pas : le serveur ne peut pas honnêtement
  //    répondre « c'est fait ». Ne pas comprendre une réponse n'autorise pas à s'y fier.
  throw new Error('Réponse inattendue du serveur à la vérification de la clé.');
}

/**
 * « Connexion » d'une page protégée : garantit qu'une clé VALIDE est mémorisée pour
 * le rôle. Si une clé mémorisée est déjà valide → rien à demander (silencieux).
 * Sinon, demande la clé (en boucle jusqu'à la bonne) et la mémorise.
 * @return {Promise<boolean>} true si connecté, false si l'utilisateur annule.
 */
async function connexion(role, libelle) {
  const memo = lireCleLocale(role);
  if (memo) {
    let memoOk;
    try { memoOk = await cleValide(role, memo); }
    catch (err) { await dialogAlerter(MESSAGE_VERIF_IMPOSSIBLE + err.message); return false; }
    if (memoOk) return true;
    definirCleLocale(role, ''); // ⛔ clé de session REFUSÉE : on l'oublie au lieu de la garder
  }
  while (true) {
    const saisie = await dialogDemander('🔒 Accès ' + libelle + '\n\nEntre la clé :', '', { ok: 'Se connecter' });
    if (saisie == null) return false; // annulé
    const cle = saisie.trim();
    if (!cle) { await dialogAlerter('Clé incorrecte. Réessaie.'); continue; }
    let ok;
    try {
      ok = await cleValide(role, cle);
    } catch (err) {
      // ⛔ PANNE, PAS REFUS. On ne dit pas « clé incorrecte » — ce serait accuser l'utilisateur
      //    d'une erreur qu'il n'a pas commise et l'enfermer dans une boucle de saisie inutile.
      //    ⚠️ Et on ne mémorise RIEN : une clé non vérifiée n'est pas une clé acceptée.
      await dialogAlerter(MESSAGE_VERIF_IMPOSSIBLE + err.message);
      return false;
    }
    if (ok) { definirCleLocale(role, cle); return true; }
    await dialogAlerter('Clé incorrecte. Réessaie.');
  }
}

/**
 * Redemande explicitement la clé d'un rôle et la valide (confirmation forte, ex :
 * corriger un score définitif). Mémorise la clé pour la session. Renvoie la clé ou
 * null si annulé.
 */
async function demanderCleValide(role, message) {
  while (true) {
    const saisie = await dialogDemander(message, '', { ok: 'Valider' });
    if (saisie == null) return null; // annulé
    const cle = saisie.trim();
    if (cle) {
      let ok;
      try {
        ok = await cleValide(role, cle);
      } catch (err) {
        // ⛔ Même règle que `connexion` : une panne n'est pas un refus, et une clé non
        //    vérifiée n'est jamais mémorisée.
        await dialogAlerter(MESSAGE_VERIF_IMPOSSIBLE + err.message);
        return null;
      }
      if (ok) { definirCleLocale(role, cle); return cle; }
    }
    await dialogAlerter('Clé incorrecte.');
  }
}
