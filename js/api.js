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

/**
 * Vérifie une clé SANS rien modifier : on envoie une action d'écriture avec un
 * identifiant bidon. Si la clé est bonne, le serveur répond « introuvable » (donc
 * une erreur qui n'est PAS un refus de clé) ; si elle est mauvaise, « Clé incorrecte ».
 */
async function cleValide(role, cle) {
  const sonde = (role === 'scores')
    ? { action: 'enregistrerScore', id_match: '__verif_cle__', score_A: 0, score_B: 0 }
    : { action: 'supprimerEquipe', id_equipe: '__verif_cle__' };
  try {
    await apiPost(sonde.action, Object.assign(sonde, { cle: cle }));
    return true; // improbable (id bidon), mais si ça passe la clé est valide
  } catch (err) {
    return !estRefusCle(err.message);
  }
}

/**
 * « Connexion » d'une page protégée : garantit qu'une clé VALIDE est mémorisée pour
 * le rôle. Si une clé mémorisée est déjà valide → rien à demander (silencieux).
 * Sinon, demande la clé (en boucle jusqu'à la bonne) et la mémorise.
 * @return {Promise<boolean>} true si connecté, false si l'utilisateur annule.
 */
async function connexion(role, libelle) {
  const memo = lireCleLocale(role);
  if (memo && await cleValide(role, memo)) return true;
  while (true) {
    const saisie = await dialogDemander('🔒 Accès ' + libelle + '\n\nEntre la clé :', '', { ok: 'Se connecter' });
    if (saisie == null) return false; // annulé
    const cle = saisie.trim();
    if (cle && await cleValide(role, cle)) { definirCleLocale(role, cle); return true; }
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
    if (cle && await cleValide(role, cle)) { definirCleLocale(role, cle); return cle; }
    await dialogAlerter('Clé incorrecte.');
  }
}
