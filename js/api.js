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

/* ============================================================================
 *  REJEU UNIQUE D'UNE LECTURE APRÈS UN 404 (CORR-RETRY-LECTURES-404-DR-6F, R1, R3)
 *  Google répond parfois 404 au second saut de la Web App (script.google.com → 302 →
 *  script.googleusercontent.com), alors que l'exécution Apps Script est « Terminée ».
 *  ⚠️ Mitigation seulement : la cause, côté Google, n'est pas corrigée ici.
 *  ⭐ Une action d'une des deux LISTES FERMÉES ci-dessous qui reçoit un 404 est réémise au plus UNE fois.
 *  ⛔ Toute autre action — notamment toute écriture NON déclarée idempotente, action inconnue,
 *     future, vide ou ressemblante — ne l'est JAMAIS : elle a pu produire un effet avant que
 *     Google livre le 404. L'unique exception est isolée dans
 *     `ACTIONS_POST_ECRITURES_IDEMPOTENTES` et garantie côté serveur.
 *  ⛔ La rejouabilité ne se déduit jamais du nom de l'action ni de la méthode HTTP.
 * ========================================================================== */

/** Pause fixe avant l'unique réémission (500 ms au plus). */
const DELAI_REJEU_404_MS = 300;

/** GET rejouables après un 404 : LISTE FERMÉE (6F-R3). Aucune n'écrit dans le classeur, Drive ou
 *  une propriété persistante ; `getAll` et `getRefFFR` peuvent reconstruire leur cache technique,
 *  dérivé et idempotent — effet accepté.
 *  ⛔ `getHistorique` en est EXCLUE : doGet → lireHistorique → assurerOngletHistorique →
 *     creerOngletAvecEntetes peut créer l'onglet (en-têtes, style, première ligne figée).
 *  ⛔ `getPoules`, `getClassement` et toute action absente restent à UNE émission. */
const ACTIONS_GET_REJOUABLES = Object.freeze([
  'getAll', 'getRefFFR', 'getConfig', 'getEquipes', 'getMatchs', 'getConformiteFFR',
  'datesCompatiblesFFR', 'getCapacitesCategories', 'getConfigClub', 'getClubDossier', 'getReponseInvitation'
]);

/** POST rejouables après un 404 : LISTE FERMÉE. Leur corps métier n'écrit ni dans le classeur, ni
 *  dans Drive, ni dans une propriété persistante.
 *  ⚠️ Réserve : l'enveloppe d'authentification de doPost lit les propriétés et met à jour le cache
 *     anti-force-brute — un refus de clé rejoué peut y être compté deux fois.
 *  ⛔ `listerSponsors` en est EXCLUE : elle appelle `assurerOngletSponsors`, qui peut créer
 *     l'onglet, ajouter des colonnes et réécrire les en-têtes. */
const ACTIONS_POST_REJOUABLES = Object.freeze([
  'getConfigAdmin', 'getDossierAutorisation', 'lireMesuresSponsors',
  'listerClubsInvites', 'getAccesScoresAdmin', 'getMatchsLitige', 'getSaisieScores'
]);

/** Écritures dont le BACKEND garantit l'idempotence avant tout rejeu.
 *
 * `ajouterEquipe` est la seule action admise : sous le verrou serveur, un second appel portant
 * le même nom et la même catégorie retrouve et renvoie la ligne déjà créée au lieu d'en ajouter
 * une autre. Cette propriété rend sûr un unique nouvel essai quand Google perd la réponse de la
 * Web App. ⛔ Ne jamais ajouter une action ici sans la preuve serveur équivalente et ses tests. */
const ACTIONS_POST_ECRITURES_IDEMPOTENTES = Object.freeze(['ajouterEquipe']);

/**
 * Détecteur commun du 404 rejouable. Le compteur partagé avec `executerAvecRejeuAbandon` garantit
 * DEUX émissions au plus par invocation, tous motifs confondus. Cette fonction demande le second
 * essai à l'orchestrateur : il recevra ainsi, lui aussi, un AbortController et un délai neufs.
 * ⛔ Rejet de fetch, autre statut, JSON illisible, `{ error }` : aucune demande de rejeu ici.
 *
 * ⏱️ CONTRAT TEMPOREL, pour UNE tentative bornée :
 *   · un seul minuteur et un seul signal ; le second essai éventuel en créera de nouveaux ;
 *   · si la pause ne tient pas avant l'échéance nominale, elle est omise et le second essai démarre
 *     immédiatement avec son délai neuf ;
 *   · si le rappel d'abandon s'exécute pendant la pause, il la RÉVEILLE : l'appel n'attend pas le
 *     minuteur de pause ;
 *   · après la pause (normale ou réveillée par l'abandon), la décision de rejeu est transmise à
 *     l'orchestrateur, qui jette l'ancien signal et crée la nouvelle tentative ;
 *   · si l'abandon survient pendant une émission ou la lecture de son corps : AbortError ; pendant
 *     la pause : le 404 déjà reçu déclenche directement le second essai ;
 *   · ⚠️ LIMITE DU NAVIGATEUR : si les minuteries ou le thread principal sont retardés (onglet en
 *     arrière-plan, tâche longue, veille), l'appel peut se dénouer APRÈS t0 + delaiMs, dès que la
 *     première tâche utile (réponse réseau, réveil de la pause ou rappel d'abandon) s'exécute enfin.
 *     Aucune limite murale absolue n'est garantie.
 * @param {function(): Promise<Response>} emettre  envoie la MÊME requête à chaque appel
 * @param {boolean} rejouable  true seulement pour une action d'une liste fermée
 * @param {{signal: AbortSignal, echeance: number, reveiller: ?function}} [abandon] délai de la tentative
 * @param {{emissions: number}} suivi  compteur partagé entre rejeu 404 et rejeu après abandon
 * @return {Promise<Response>} la réponse reçue, sauf demande interne de second essai après 404
 */
async function envoyerAvecRejeu404(emettre, rejouable, abandon, suivi) {
  async function emettreUneFois() {
    suivi.emissions++;
    return emettre();
  }

  const reponse = await emettreUneFois();
  if (!rejouable || reponse.status !== 404 || suivi.emissions >= 2) return reponse;
  if (abandon && performance.now() + DELAI_REJEU_404_MS >= abandon.echeance) {
    const erreur = new Error('Rejeu interne après 404.');
    erreur.rejeuLecture404 = true;
    throw erreur;                                          // délai neuf, sans pause devenue inutile
  }
  let pause = null;
  await new Promise(function (reprendre) {
    pause = setTimeout(reprendre, DELAI_REJEU_404_MS);
    if (abandon) abandon.reveiller = reprendre;            // le rappel d'abandon peut écourter la pause
  });
  clearTimeout(pause);
  if (abandon) {
    abandon.reveiller = null;
  }
  const erreur = new Error('Rejeu interne après 404.');
  erreur.rejeuLecture404 = true;
  throw erreur;                                            // l'orchestrateur crée la seconde tentative
}

/**
 * Exécute une lecture éventuellement bornée, avec au plus un second essai après l'expiration du
 * délai INTERNE. Le second essai reçoit son propre AbortController et un délai complet neuf.
 *
 * Le rejeu est refusé si l'action n'appartient pas à une liste fermée, si l'erreur n'est pas
 * l'AbortError produit par NOTRE minuteur, ou si deux émissions ont déjà eu lieu (par exemple
 * après un 404 rejoué). La fermeture `executer` doit inclure la lecture du corps JSON : le délai
 * couvre ainsi fetch ET `response.json()`.
 *
 * @param {function(?AbortController, ?Object, Object): Promise<*>} executer
 * @param {boolean} rejouable  vrai seulement pour une action explicitement autorisée
 * @param {number} [delaiMs] délai nominal de CHAQUE tentative
 * @return {Promise<*>}
 */
async function executerAvecRejeuAbandon(executer, rejouable, delaiMs) {
  const suivi = { emissions: 0 };

  async function tenter() {
    const controleur = delaiMs ? new AbortController() : null;
    const abandon = controleur
      ? { signal: controleur.signal, echeance: performance.now() + delaiMs, reveiller: null,
          expirationInterne: false }
      : null;
    const minuteur = controleur ? setTimeout(function () {
      abandon.expirationInterne = true;
      controleur.abort();
      if (abandon.reveiller) abandon.reveiller();
    }, delaiMs) : null;

    try {
      return await executer(controleur, abandon, suivi);
    } catch (err) {
      const rejeu404 = rejouable && err && err.rejeuLecture404 === true && suivi.emissions < 2;
      const expirationRejouable = rejouable && abandon && abandon.expirationInterne &&
        err && err.name === 'AbortError' && suivi.emissions < 2;
      if (!rejeu404 && !expirationRejouable) throw err;
    } finally {
      if (minuteur) clearTimeout(minuteur);
    }

    return tenter();                                        // contrôleur et délai neufs
  }

  return tenter();
}

/**
 * Va chercher une donnée auprès du backend (requête de LECTURE).
 * @param {string} action  ex : 'getConfig', 'getEquipes', 'getAll'
 * @param {Object} [params] paramètres supplémentaires éventuels (optionnel)
 * @param {Object} [options] { delaiMs } : délai NOMINAL en millisecondes PAR TENTATIVE — à son
 *   expiration, l'émission est abandonnée ; une lecture de la liste fermée reçoit au plus un
 *   second essai avec un délai neuf, puis l'AbortError remonte si celui-ci expire aussi
 *   (⚠️ sans garantie murale absolue : voir le contrat temporel d'`envoyerAvecRejeu404`). Utilisé par le rafraîchissement
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

  // ⛔ Classement sur l'action RÉELLEMENT envoyée (paramètres compris), par la liste fermée seule.
  const rejouable = ACTIONS_GET_REJOUABLES.indexOf(url.searchParams.get('action')) !== -1;

  // Délai NOMINAL optionnel, appliqué séparément à chaque tentative autorisée.
  const delaiMs = options && options.delaiMs;
  const adresse = url.toString();

  return executerAvecRejeuAbandon(async function (controleur, abandon, suivi) {
    // fetch() envoie la requête et attend la réponse. `cache: 'no-store'` désactive
    // en plus le cache HTTP du navigateur pour cette lecture.
    const reglages = { cache: 'no-store' };
    if (controleur) reglages.signal = controleur.signal;
    // ⭐ Rejeu 404 éventuel : même adresse, mêmes réglages et même signal au sein de cette tentative.
    const reponse = await envoyerAvecRejeu404(function () { return fetch(adresse, reglages); },
      rejouable, abandon, suivi);
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
  }, rejouable, delaiMs);
}

/**
 * Envoie une demande d'ÉCRITURE au backend (ajouter/supprimer…).
 * @param {string} action  ex : 'ajouterEquipe', 'supprimerEquipe'
 * @param {Object} [data]  les données à envoyer (ex : { nom_equipe, categorie })
 * @param {Object} [options] { delaiMs } : délai NOMINAL PAR TENTATIVE, MÊME contrat que `apiGet`
 *   (voir le contrat temporel d'`envoyerAvecRejeu404`, limites de minuterie comprises). Il couvre
 *   l'émission ET la lecture du corps de la réponse : le signal d'abandon interrompt les deux.
 *
 *   ⭐ POURQUOI SUR UN POST (CORR-BLOCAGE-LECTURES-ADMIN-DR). Les LECTURES protégées par la clé
 *      admin passent par doPost (`getConfigAdmin` et les autres de la liste fermée ci-dessus) :
 *      sans option, elles ne pouvaient pas être bornées, et une lecture d'ouverture qui « pend »
 *      laissait la page sur son écran d'attente, sans bouton « Réessayer ».
 *   ⛔ CE QUE CETTE OPTION NE FAIT PAS. Elle n'élargit RIEN : `rejouable` reste décidé par les
 *      listes fermées, sur l'action réellement envoyée. Une écriture ordinaire bornée ne devient
 *      jamais rejouable. Seul `ajouterEquipe` passe un délai, parce que le backend garantit sous
 *      verrou qu'un rejeu du même nom et de la même catégorie renvoie la ligne déjà créée.
 *   ⛔ Sans `options` (tous les appels historiques), comportement strictement inchangé : aucun
 *      contrôleur, aucun minuteur, aucun signal.
 * @return {Promise<Object>} la réponse du backend
 *
 * Exemple :
 *   await apiPost('ajouterEquipe', { nom_equipe: 'Suresnes 1', categorie: 'U8' });
 */
async function apiPost(action, data, options) {
  // On regroupe l'action et les données dans un seul paquet.
  const corps = Object.assign({ action: action }, data || {});
  const texte = JSON.stringify(corps);   // figé : une réémission envoie exactement le même corps

  // ⛔ Classement sur l'action RÉELLEMENT envoyée (`corps.action`), par la liste fermée seule.
  const rejouable = ACTIONS_POST_REJOUABLES.indexOf(corps.action) !== -1 ||
    ACTIONS_POST_ECRITURES_IDEMPOTENTES.indexOf(corps.action) !== -1;

  // Délai NOMINAL optionnel, appliqué séparément à chaque tentative autorisée.
  const delaiMs = options && options.delaiMs;

  return executerAvecRejeuAbandon(async function (controleur, abandon, suivi) {
    const reglages = {
      method: 'POST',
      // Les lectures protégées passent aussi par POST puis une redirection GET.
      // Comme pour apiGet, ne pas réutiliser une réponse HTTP mise en cache.
      // Précaution de fraîcheur, pas une preuve de résolution des 404 Google.
      cache: 'no-store',
      // On envoie en "text/plain" volontairement : ça évite une vérification
      // préalable du navigateur (le "preflight" CORS) que Apps Script ne sait pas gérer.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: texte
    };
    // ⭐ Détection 404 : mêmes réglages, même corps et même signal au sein de cette tentative.
    if (controleur) reglages.signal = controleur.signal;
    const reponse = await envoyerAvecRejeu404(function () {
      return fetch(API_URL, reglages);
    }, rejouable, abandon, suivi);

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
  }, rejouable, delaiMs);
}

/* ============================================================================
 *  CLÉS D'ÉCRITURE (admin / scores)
 *  Les actions d'écriture sont protégées côté backend par une clé. Ici on gère
 *  la clé côté navigateur : on la stocke sur l'appareil (sessionStorage) et on
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

/** Demande la clé à l'utilisateur. Renvoie la valeur saisie (nettoyée), ou null si annulé.
 *  ⛔ NE MÉMORISE RIEN (SEC-CLE-STOCKAGE-DR-5B). Elle rangeait la clé dès la frappe, AVANT toute
 *     réponse du serveur : une clé jamais confirmée — voire refusée — restait alors en session.
 *     C'est `apiPostProtege` qui la range, et seulement après la réussite confirmée de l'action.
 *  ⚠️ Le pré-remplissage lit la clé rangée : dans `apiPostProtege`, elle est toujours vide à cet
 *     instant (absente, ou effacée juste avant après un refus) — le champ s'ouvre donc vide. */
async function demanderCle(role, message) {
  const saisie = await dialogDemander(message, lireCleLocale(role), { ok: 'Valider', secret: true });
  if (saisie == null) return null;
  return saisie.trim();
}

/**
 * Comme apiPost, mais ajoute la clé du rôle et la redemande une fois si elle est refusée.
 * ⭐ SEC-CLE-STOCKAGE-DR-5B — une clé NOUVELLE (tapée ici) n'est rangée qu'après la réussite
 *    confirmée de l'action ; une clé refusée est effacée AVANT la redemande ; une panne ou une
 *    réponse ambiguë ne range rien, n'efface pas une clé déjà rangée, et ne rejoue rien.
 * @param {string} action
 * @param {Object} data
 * @param {string} role     'admin' ou 'scores'
 * @param {string} libelle  texte affiché à l'utilisateur (ex : "admin", "de saisie des scores")
 * @param {Object} [options] transmis TEL QUEL à `apiPost` (ex : { delaiMs }) — réservé aux lectures
 *   protégées et à l'unique écriture idempotente explicitement autorisée. ⚠️ Le budget vaut PAR
 *   ÉMISSION MÉTIER : la saisie de clé se fait entre les deux et
 *   n'est pas comptée ; le rejeu après refus repart donc avec un budget neuf. C'est voulu — on ne
 *   veut pas qu'une réflexion de l'organisateur devant la fenêtre de clé fasse expirer sa lecture.
 *   ⛔ Sans `options`, comportement strictement inchangé.
 */
async function apiPostProtege(action, data, role, libelle, options) {
  let cle = lireCleLocale(role);
  const neuve = !cle;   // tapée maintenant : le serveur ne l'a pas encore acceptée
  if (neuve) cle = await demanderCle(role, 'Entre la clé ' + libelle + ' :');
  if (cle == null) throw new Error('Action annulée.');
  try {
    const res = await apiPost(action, Object.assign({}, data, { cle: cle }), options);
    if (neuve) definirCleLocale(role, cle);      // ⭐ rangée APRÈS la réussite confirmée, pas avant
    return res;
  } catch (err) {
    // Clé absente/incorrecte côté serveur → on l'efface, puis on la redemande une fois.
    if (estRefusCle(err.message)) {
      definirCleLocale(role, '');                // ⛔ refusée : effacée AVANT la redemande (champ vide, rien si on annule)
      const nouvelle = await demanderCle(role, 'Clé ' + libelle + ' incorrecte. Réessaie :');
      if (nouvelle == null) throw new Error('Action annulée.');
      const res = await apiPost(action, Object.assign({}, data, { cle: nouvelle }), options);
      definirCleLocale(role, nouvelle);          // ⭐ rangée après la réussite du rejeu, pas avant
      return res;
    }
    throw err;   // ⛔ panne, réponse ambiguë, erreur métier : rien n'est rangé, rien n'est rejoué
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
    const saisie = await dialogDemander('🔒 Accès ' + libelle + '\n\nEntre la clé :', '',
      { ok: 'Se connecter', secret: true });
    if (saisie == null) return false; // annulé
    const cle = saisie.trim();
    if (!cle) { await dialogAlerter('Clé incorrecte. Réessaie.'); continue; }
    let ok;
    while (ok === undefined) {
      try {
        ok = await cleValide(role, cle);
      } catch (err) {
        // ⛔ PANNE, PAS REFUS. On ne dit pas « clé incorrecte » — ce serait accuser l'utilisateur
        //    d'une erreur qu'il n'a pas commise et l'enfermer dans une boucle de saisie inutile.
        //    ⚠️ Et on ne mémorise RIEN : une clé non vérifiée n'est pas une clé acceptée.
        // ⭐ RÉESSAI EXPLICITE (UX-CLE-SCORES-RETRY-DR-5A) — clé SCORES seulement. La clé tapée
        //    reste dans `cle`, en mémoire vive, le temps de CET appel : jamais rangée, jamais
        //    affichée. « Réessayer » relance la même vérification, sans ressaisie ; rien ne
        //    repart tout seul. « Annuler » (ou Échap) abandonne, et `cle` disparaît avec l'appel.
        //    ⚠️ Clé admin : comportement inchangé (alerte, abandon).
        if (role !== 'scores') { await dialogAlerter(MESSAGE_VERIF_IMPOSSIBLE + err.message); return false; }
        if (!await dialogConfirmer(MESSAGE_VERIF_IMPOSSIBLE + err.message,
            { ok: 'Réessayer', annuler: 'Annuler' })) return false;
      }
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
    const saisie = await dialogDemander(message, '', { ok: 'Valider', secret: true });
    if (saisie == null) return null; // annulé
    const cle = saisie.trim();
    if (cle) {
      let ok;
      while (ok === undefined) {
        try {
          ok = await cleValide(role, cle);
        } catch (err) {
          // ⛔ Même règle que `connexion` : une panne n'est pas un refus, et une clé non
          //    vérifiée n'est jamais mémorisée.
          // ⭐ Et même réessai explicite, clé SCORES seulement (UX-CLE-SCORES-RETRY-DR-5A) :
          //    « Réessayer » revérifie la même clé ; « Annuler » abandonne — l'appelant ne reçoit
          //    rien, donc rien n'est déverrouillé. Clé admin : alerte et abandon, comme avant.
          if (role !== 'scores') { await dialogAlerter(MESSAGE_VERIF_IMPOSSIBLE + err.message); return null; }
          if (!await dialogConfirmer(MESSAGE_VERIF_IMPOSSIBLE + err.message,
              { ok: 'Réessayer', annuler: 'Annuler' })) return null;
        }
      }
      if (ok) { definirCleLocale(role, cle); return cle; }
    }
    await dialogAlerter('Clé incorrecte.');
  }
}
