/**
 * ============================================================================
 *  ADMIN — écran « Partenaires »
 * ============================================================================
 *
 *  Trois tâches, présentées une par une :
 *   1. Fiches partenaires    — création / modification / suppression, logo sur Drive ;
 *   2. Aperçu & publication  — interrupteur général et options d'affichage ;
 *   3. Bilan après tournoi   — ce qu'on renvoie au partenaire après l'événement.
 *
 *  MESURE CONSOLIDÉE ENTRE TOUS LES APPAREILS. Chaque navigateur qui affiche des
 *  partenaires remonte ses compteurs (voir sponsors.js) ; la carte « fiche de visibilité »
 *  les additionne ici et annonce la portée réelle (« mesuré sur N appareils »). Si aucun
 *  relevé n'est encore arrivé, elle retombe sur les compteurs de l'appareil courant — et
 *  le dit, plutôt que de laisser croire à une audience non mesurée.
 *
 *  Nécessite (chargés AVANT) : commun.js, api.js, admin.js (redimensionnerImage,
 *  brancherZoneImage, urlAffiche), sponsors.js.
 * ============================================================================
 */

let sponsorsAdmin = [];          // fiches telles que renvoyées par le backend
let sponsorsConsolide = null;    // relevés de TOUS les appareils, consolidés (null = pas encore lu)

/* ⛔ PAS DE MÉMOIRE ICI (R1, resserré en R2). Une première version tenait deux drapeaux
   `sponsorsFichesLues` / `sponsorsRelevesLus` dans ce fichier, EN PLUS du registre d'admin.js ;
   deux mémoires pour un seul fait divergent forcément. Les lectures ont ensuite inscrit
   elles-mêmes leur résultat — puis R2 le leur a retiré aussi : ⛔ une lecture ANCIENNE
   terminant après une écriture aurait pu remettre la ressource « chargée » toute seule.
   ⭐ Les deux fonctions ci-dessous sont des lectures BRUTES : elles lisent, remplissent l'état
   et posent leur message d'erreur. C'est le REGISTRE (`lancerLectureAdmin`, admin.js) qui
   décide seul de ce que la mémoire retient — et qui sérialise les lectures d'une ressource.
   ⛔ Ne les appelle jamais directement : passe par `assurerRessourceAdmin` (navigation) ou
   `rafraichirRessourceAdmin` (après écriture). */
let sponsorLogoDataURI = null;   // logo choisi mais pas encore enregistré
let sponsorLogoRetirer = false;  // l'utilisateur a demandé à retirer le logo existant

/* ==========================================================================
   ÉTAT DE LA FUSION À TROIS VOIES ET DE L'IDEMPOTENCE
   --------------------------------------------------------------------------
   ⭐ `sponsorsBaseFiche` — les valeurs BRUTES telles que le SERVEUR les a renvoyées pour la fiche
   en cours de modification. ⛔ JAMAIS celles du formulaire : celui-ci NORMALISE à l'affichage
   (couleur vide → « #0c1c2e », poids vide → « 1 », ordre vide → « 100 », emplacements réordonnés,
   JSON réécrit). Comparer l'affiché à la base produirait un conflit sur presque toutes les fiches
   anciennes — un conflit FAUX, que l'utilisateur ne pourrait ni comprendre ni résoudre.

   ⭐ `sponsorsChampsTouches` — ce que l'utilisateur a RÉELLEMENT modifié. Un champ absent de cette
   liste n'entre pas dans l'intention : le serveur conserve alors sa valeur actuelle telle quelle,
   y compris des emplacements hérités qu'il ne sait plus interpréter.

   ⭐ `sponsorsRequeteId` — l'intention de CRÉATION. Il naît avec le formulaire vide, SURVIT à un
   silence, un délai dépassé, une réponse perdue ou un état incertain, et n'est renouvelé qu'après
   un succès confirmé ou une nouvelle intention explicite. C'est lui qui empêche qu'un second clic
   après une réponse perdue ne crée une seconde fiche.
   ========================================================================== */
let sponsorsBaseFiche = null;        // { champ: valeur brute } — null en création
let sponsorsChampsTouches = {};      // { champ: true }
let sponsorsRequeteId = '';          // intention de création en cours
let sponsorsDerniereIntention = null;// saisie conservée pour « réessayer » après un conflit

/** Identifiant d'intention : aléatoire, sans dépendance à `crypto` (vieux navigateurs compris). */
function sponsorsNouvelleIntention() {
  return 'sp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ⭐ Le backend en service connaît-il le chargement groupé ? `null` = pas encore su.
   ⛔ Le repli n'est décidé QUE sur la réponse « Action inconnue » : une panne réseau, un 500 ou un
   délai dépassé ne doivent JAMAIS être pris pour un backend ancien — on retenterait alors le
   chemin long à chaque visite, en masquant la vraie panne. */
let sponsorsBackendGroupe = null;
/** Journée affichée par le bilan (vide = journée en cours). */
let sponsorsJourBilan = '';
/** Journées pour lesquelles des relevés existent : { 'AAAA-MM-JJ': nb }. */
let sponsorsJoursDisponibles = {};
/** Avertissements d'intégrité renvoyés par la lecture (identifiants inexploitables…). */
let sponsorsAvertissements = [];
/** Vrai quand la dernière lecture des relevés a ÉCHOUÉ (à distinguer d'un bilan réellement vide). */
let sponsorsRelevesEnPanne = false;

// Un seul geste métier à la fois. Les écritures ne sont jamais rejouées après une panne.
let sponsorsOperationEnCours = false;
const DELAI_SPONSORS_MS = 20000;

function messageErreurSponsors(err, ecriture) {
  const texte = String(err && err.message || '');
  if (/annulée|incorrecte|non configur|authentification/i.test(texte)) {
    return 'Connexion administrateur requise. Tes saisies sont conservées.';
  }
  if (/nom du partenaire est obligatoire/i.test(texte)) return 'Le nom du partenaire est obligatoire.';
  if (/introuvable|déjà|doublon|conflit/i.test(texte)) {
    return 'Cette fiche a changé ou existe déjà. Actualise la liste avant de continuer.';
  }
  let message = 'Le serveur ne peut pas répondre pour le moment.';
  if (err && err.name === 'AbortError') message = 'Le délai de réponse est dépassé.';
  else if (typeof navigator !== 'undefined' && navigator.onLine === false) message = 'La connexion Internet est interrompue.';
  else if (err && err.name === 'TypeError') message = 'La connexion au serveur a été interrompue.';
  else if (err && err.name === 'SyntaxError') message = 'La réponse du serveur est illisible.';
  return message + (ecriture
    ? ' Résultat non confirmé : actualise la liste avant toute nouvelle tentative. Tes saisies sont conservées.'
    : ' Réessaie dans un instant.');
}

function verifierReponseSponsors(r) {
  if (r && r.error) throw new Error(r.error);
  if (!r || r.ok !== true) throw new SyntaxError('Réponse invalide');
  return r;
}

async function avecActionSponsors(bouton, message, action, libelle) {
  if (sponsorsOperationEnCours) return;
  sponsorsOperationEnCours = true;
  const controles = Array.from(document.querySelectorAll(
    '#form-sponsor input, #form-sponsor select, #form-sponsor button, ' +
    '#form-sponsors-reglages input, #form-sponsors-reglages button, ' +
    '#liste-sponsors button, #bouton-ajouter-sponsor, #bouton-actualiser-sponsors, #bouton-vider-bilan'
  )).map(function (element) { return { element: element, disabled: element.disabled }; });
  const texte = bouton.textContent;
  controles.forEach(function (c) { c.element.disabled = true; });
  bouton.disabled = true;
  bouton.textContent = libelle || 'Enregistrement…';
  afficherMessage(message, bouton.textContent, 'ok');
  try { await action(); }
  catch (err) { afficherMessage(message, '⚠️ ' + messageErreurSponsors(err, true), 'ko'); }
  finally {
    controles.forEach(function (c) { c.element.disabled = c.disabled; });
    bouton.disabled = false;
    bouton.textContent = texte;
    sponsorsOperationEnCours = false;
  }
}

// La confirmation d'écriture suffit pour rendre la main ; la liste se relit ensuite.
function actualiserSponsorsApresEcriture() {
  chargerSponsors().catch(function () {
    afficherMessage(document.getElementById('message-sponsors-liste'),
      'La modification est enregistrée. Actualise la liste pour revoir les partenaires.', 'ko');
  });
}

/* ==========================================================================
   DÉMARRAGE
   ========================================================================== */

function initAdminSponsors() {
  if (!document.getElementById('bloc-sponsors-liste')) return;

  document.querySelectorAll('[data-vue-sponsors]').forEach(function (bouton) {
    bouton.addEventListener('click', function () {
      choisirVueSponsors(bouton.getAttribute('data-vue-sponsors'));
    });
  });
  document.getElementById('bouton-ajouter-sponsor').addEventListener('click', onAjouterSponsor);
  document.getElementById('bouton-actualiser-sponsors').addEventListener('click', chargerSponsors);

  document.getElementById('form-sponsors-reglages')
    .addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('form-sponsor')
    .addEventListener('submit', function (e) { e.preventDefault(); });

  document.getElementById('bouton-enregistrer-sponsors-reglages')
    .addEventListener('click', onEnregistrerReglagesSponsors);
  document.getElementById('bouton-tester-interstitiel')
    .addEventListener('click', onTesterInterstitiel);
  document.querySelector('[name="sponsor_interstitiel_actif"]')
    .addEventListener('change', majLignesInterstitiel);

  construireEmplacements();
  document.querySelectorAll('[name="visibilite_preset"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (radio.checked) appliquerPresetVisibilite(radio.value);
    });
  });
  // Le nom, l'accroche, la couleur et la taille générale vivent HORS du panneau des
  // emplacements mais alimentent chaque aperçu : on écoute donc tout le formulaire.
  document.getElementById('form-sponsor').addEventListener('input', rafraichirApercusEmplacements);
  document.getElementById('bouton-enregistrer-sponsor').addEventListener('click', onEnregistrerSponsor);
  document.getElementById('bouton-annuler-sponsor').addEventListener('click', reinitialiserFormSponsor);
  document.getElementById('liste-sponsors').addEventListener('click', onClicListeSponsors);

  brancherZoneImage({
    champFichier: '#form-sponsor [name="sponsor_logo"]',
    zoneDepot: 'zone-depot-sponsor-logo',
    traiter: traiterFichierLogoSponsor
  });
  document.getElementById('zone-depot-sponsor-logo').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    document.querySelector('#form-sponsor [name="sponsor_logo"]').click();
  });
  document.getElementById('bouton-retirer-sponsor-logo').addEventListener('click', onRetirerLogoSponsor);

  document.getElementById('bouton-rafraichir-bilan').addEventListener('click', chargerMesuresSponsors);
  const selJour = document.getElementById('bilan-journee');
  if (selJour) selJour.addEventListener('change', onChoisirJourBilan);
  document.getElementById('bouton-imprimer-bilan').addEventListener('click', function () { window.print(); });
  document.getElementById('bouton-exporter-bilan').addEventListener('click', onExporterBilanCsv);
  document.getElementById('bouton-vider-bilan').addEventListener('click', onViderBilan);
  document.getElementById('bouton-tester-remontee').addEventListener('click', onTesterRemontee);
  document.getElementById('bouton-verifier-public').addEventListener('click', onVerifierPublic);
  document.getElementById('projection-appareils').addEventListener('input', afficherBilanSponsors);

  choisirVueSponsors('gestion');
}

/** Une seule tâche est affichée à la fois : gérer, publier ou produire le bilan. */
function choisirVueSponsors(vue) {
  const blocs = {
    gestion: 'bloc-sponsors-liste',
    publication: 'bloc-sponsors-reglages',
    bilan: 'bloc-sponsors-bilan'
  };
  if (!blocs[vue]) vue = 'gestion';

  Object.keys(blocs).forEach(function (cle) {
    const bloc = document.getElementById(blocs[cle]);
    if (bloc) bloc.hidden = cle !== vue;
  });
  document.querySelectorAll('[data-vue-sponsors]').forEach(function (bouton) {
    const actif = bouton.getAttribute('data-vue-sponsors') === vue;
    bouton.classList.toggle('est-actif', actif);
    bouton.setAttribute('aria-pressed', actif ? 'true' : 'false');
  });
}

/** Résume l'état utile sans exposer les multiples interrupteurs techniques. */
function mettreAJourResumeSponsors() {
  const statut = document.getElementById('sponsors-statut-publication');
  if (!statut) return;
  const global = (typeof configCourante !== 'undefined' && configCourante.global) || {};
  const publie = String(global.sponsors_actifs || '').toLowerCase() === 'oui';
  const actifs = sponsorsAdmin.filter(function (s) {
    return String(s.actif || '').toLowerCase() === 'oui';
  }).length;

  statut.classList.toggle('est-en-ligne', publie && actifs > 0);
  statut.classList.toggle('est-attention', publie && actifs === 0);
  if (publie && actifs) statut.textContent = 'En ligne — ' + actifs + ' partenaire' + (actifs > 1 ? 's' : '');
  else if (publie) statut.textContent = 'Publication active — aucun partenaire';
  else if (actifs) statut.textContent = 'Prêts à publier — ' + actifs + ' partenaire' + (actifs > 1 ? 's' : '');
  else statut.textContent = 'Partenaires masqués';
}

/* ⛔ `majSponsors()` A ÉTÉ RETIRÉ (R1). Il orchestrait « lire les deux, puis rendre » et portait
 * sa propre mémoire. Cette orchestration vit désormais dans `ADMIN_ETAPES.sponsors` (admin.js) :
 * `avant` injecte les réglages, les deux ressources `fichesSponsors` et `relevesSponsors`
 * partent ENSEMBLE par le registre commun, `apres` rend une fois les deux retombées.
 *
 * ⚡ Les deux lectures restent parallèles : `listerSponsors` et `lireMesuresSponsors` sont deux
 * appels Apps Script indépendants, et chaque démarrage Apps Script coûte une à plusieurs
 * secondes — c'est le poste le plus cher de cet écran.
 * ⚠️ Ce qui n'est PAS parallélisable, c'est le RENDU : `afficherBilanSponsors()` lit les fiches
 * via `sponsorsActifsAdmin()` ; rendu trop tôt, il verrait `sponsorsAdmin` encore vide et
 * afficherait « aucun relevé » — un faux état vide que rien ne corrigerait. D'où la séparation
 * lecture / rendu, conservée telle quelle dans `ADMIN_ETAPES.sponsors`. */

/**
 * Récupère les relevés déposés par les navigateurs des spectateurs et les consolide.
 * En cas d'échec (backend pas encore redéployé, réseau), on retombe sur les compteurs
 * de CET appareil : la fiche reste affichable, et elle le dit.
 *
 * ⛔ NE REND RIEN — le rendu appartient à l'appelant (`ADMIN_ETAPES.sponsors.apres`). C'est ce
 * qui permet de lancer cette lecture en même temps que celle des fiches sans risquer d'afficher
 * le bilan avant que `sponsorsAdmin` soit rempli. Ne jamais rejeter : l'échec est déjà traduit en
 * `sponsorsConsolide = null`, que `afficherBilanSponsors` sait interpréter (repli appareil).
 */
/** Range dans l'état de l'écran les relevés d'une réponse (groupée ou non). */
function appliquerRelevesSponsors(r) {
  sponsorsConsolide = sponsorsConsolider(r.releves);
  sponsorsConsolide.jour = r.jour;
  sponsorsConsolide.totalToutesJournees = r.total || 0;
  sponsorsConsolide.jours = r.jours || {};
  sponsorsJoursDisponibles = r.jours || {};
  sponsorsRelevesEnPanne = false;
}

async function lireRelevesSponsors(opt) {
  const zone = document.getElementById('bilan-sponsors');
  if (zone) zone.innerHTML = '<div class="message">Lecture des relevés…</div>';
  const demande = {};
  const jour = (opt && opt.jour !== undefined) ? opt.jour : sponsorsJourBilan;
  if (jour) demande.jour = jour;
  try {
    const r = verifierReponseSponsors(await apiPostProtege('lireMesuresSponsors', demande, 'admin', 'admin', { delaiMs: DELAI_SPONSORS_MS }));
    if (!Array.isArray(r.releves)) throw new SyntaxError('Réponse invalide');
    appliquerRelevesSponsors(r);
    return true;
  } catch (err) {
    sponsorsConsolide = null;
    // ⛔ Le repli « compteurs de cet appareil » n'est PAS une lecture réussie : le registre
    //   en fera une ressource « à relire », pour qu'une visite ultérieure retente vraiment.
    //   ⭐ Et l'écran doit pouvoir dire « illisible » plutôt que « vide » — deux faits différents.
    sponsorsRelevesEnPanne = true;
    return false;
  }
}

/** Le serveur en service ne connaît-il PAS cette action ? ⛔ Rien d'autre ne vaut « backend ancien » :
 *  une panne réseau, un 500 ou un délai dépassé sont des pannes, et doivent le rester. */
function estActionInconnue(err) {
  return /Action inconnue/i.test(String((err && err.message) || ''));
}

/* ⭐ LA REQUÊTE GROUPÉE EN COURS, partagée par les deux ressources du registre.
   ⛔ Elle n'est PAS une troisième ressource : le registre continue de mémoriser `fichesSponsors` et
   `relevesSponsors` séparément, pour qu'« Actualiser la liste » et « Rafraîchir les chiffres »
   relisent chacun sa part et qu'un échec partiel ne fasse relire que ce qui a échoué. */
let sponsorsGroupePromesse = null;
/** Ce qui reste à servir par la requête groupée en cours. ⭐ Une ressource ne la consomme QU'UNE
 *  fois : un rafraîchissement ultérieur (« Actualiser la liste », « Rafraîchir les chiffres ») doit
 *  émettre sa propre lecture, sinon il resservirait un état ANTÉRIEUR à l'écriture qui l'a demandé. */
let sponsorsGroupeRestant = {};

/**
 * La requête groupée encore disponible pour cette ressource, ou `null`.
 * ⛔ Un appel la CONSOMME : `assurerRessourceAdmin` s'y raccroche une fois, jamais deux.
 */
function sponsorsGroupeEnVol(id) {
  if (!sponsorsGroupePromesse) return null;
  const cle = id || 'fichesSponsors';
  if (!sponsorsGroupeRestant[cle]) return null;
  sponsorsGroupeRestant[cle] = false;
  return sponsorsGroupePromesse;
}

/**
 * Lance LA requête groupée de l'arrivée sur l'écran. Appelée par `ADMIN_ETAPES.sponsors.avant`,
 * donc de façon SYNCHRONE, avant que les deux ressources ne partent : c'est ce qui leur permet
 * toutes deux de s'y raccrocher au lieu d'émettre chacune la sienne.
 */
function demarrerChargementGroupeSponsors(opt) {
  sponsorsGroupeRestant = { fichesSponsors: true, relevesSponsors: true };
  sponsorsGroupePromesse = Promise.resolve(chargerEcranPartenairesFrontend(opt))
    .catch(function () { return { sponsors_ok: false, releves_ok: false }; });
  return sponsorsGroupePromesse;
}

/**
 * ⭐ CHARGEMENT GROUPÉ DE L'ÉCRAN — une exécution Apps Script au lieu de deux.
 *
 * ⛔ CE QU'IL NE FAIT PAS : promettre un gain d'attente. Les deux lectures historiques partaient
 * DÉJÀ en parallèle ; ce qui se gagne, c'est une exécution — son démarrage, son ouverture de
 * classeur, et sa place sous le plafond d'exécutions simultanées, partagé le jour du tournoi avec
 * la saisie des scores.
 *
 * ⭐ REPLI SUR L'ANCIEN BACKEND, mémorisé pour la session : le premier appel sonde, et si le
 * serveur répond « Action inconnue », on repasse définitivement aux deux lectures historiques.
 * ⛔ Une panne quelconque n'entraîne JAMAIS ce repli : elle masquerait la vraie cause et ferait
 * payer le chemin long à chaque visite.
 * @return {Promise<{sponsors_ok: boolean, releves_ok: boolean}>}
 */
async function chargerEcranPartenairesFrontend(opt) {
  const zoneListe = document.getElementById('liste-sponsors');
  const zoneBilan = document.getElementById('bilan-sponsors');
  if (zoneListe) zoneListe.innerHTML = '<p class="vide">Chargement des partenaires…</p>';
  if (zoneBilan) zoneBilan.innerHTML = '<div class="message">Lecture des relevés…</div>';

  const jour = (opt && opt.jour !== undefined) ? opt.jour : sponsorsJourBilan;

  if (sponsorsBackendGroupe !== false) {
    const demande = {};
    if (jour) demande.jour = jour;
    try {
      const r = verifierReponseSponsors(await apiPostProtege('chargerEcranPartenaires', demande,
        'admin', 'admin', { delaiMs: DELAI_SPONSORS_MS }));
      if (!Array.isArray(r.sponsors)) throw new SyntaxError('Réponse invalide');
      sponsorsBackendGroupe = true;
      sponsorsAdmin = r.sponsors;
      sponsorsAvertissements = r.avertissements || [];
      if (r.releves_ok && Array.isArray(r.releves)) {
        appliquerRelevesSponsors(r);
      } else {
        sponsorsConsolide = null;
        sponsorsRelevesEnPanne = true;    // ⭐ succès PARTIEL, annoncé comme tel
      }
      return { sponsors_ok: true, releves_ok: !!r.releves_ok };
    } catch (err) {
      if (!estActionInconnue(err)) {
        // Panne réelle : on NE replie PAS, et l'écran le dit.
        if (zoneListe) {
          zoneListe.innerHTML = '<p class="vide">Erreur de chargement des partenaires : ' +
            echapper(messageErreurSponsors(err, false)) + '</p>';
        }
        sponsorsConsolide = null;
        sponsorsRelevesEnPanne = true;
        return { sponsors_ok: false, releves_ok: false };
      }
      sponsorsBackendGroupe = false;      // backend d'avant ce lot : repli, une fois pour la session
    }
  }

  // ⭐ CHEMIN HISTORIQUE, inchangé : les deux lectures, en parallèle.
  const [fiches, releves] = await Promise.all([lireFichesSponsors(), lireRelevesSponsors({ jour: jour })]);
  return { sponsors_ok: !!fiches, releves_ok: !!releves };
}

/**
 * Lecture + rendu du bilan, en un geste. Point d'entrée des usages ISOLÉS : bouton
 * « Rafraîchir » et fin de `onViderBilan`, où les fiches sont déjà à l'écran. Comportement
 * inchangé. (Branchée directement comme écouteur de clic : elle ne prend aucun argument.)
 */
async function chargerMesuresSponsors() {
  // ⭐ R2 — même règle : « Rafraîchir le bilan » et la fin de `onViderBilan` suivent une
  //   action, la relecture passe donc par le registre (et s'y regroupe si on insiste).
  if (typeof rafraichirRessourceAdmin === 'function') await rafraichirRessourceAdmin('relevesSponsors', { jour: sponsorsJourBilan });
  else await lireRelevesSponsors({ jour: sponsorsJourBilan });
  afficherBilanSponsors();
}

/** Change la journée affichée par le bilan, puis relit CETTE journée. Le backend renvoie déjà la
 *  liste des journées disponibles : l'écran n'a rien à deviner. */
async function onChoisirJourBilan() {
  const select = document.getElementById('bilan-journee');
  if (!select) return;
  sponsorsJourBilan = select.value || '';
  await chargerMesuresSponsors();
}

/* ==========================================================================
   1. RÉGLAGES D'AFFICHAGE
   ========================================================================== */

/** Les cases à cocher de la carte réglages, avec leur défaut (miroir du backend). */
const SPONSORS_CASES = {
  sponsors_actifs: false,
  sponsors_mur_actif: true,
  sponsor_barre_mobile: true,
  sponsor_interstitiel_actif: false,
  sponsor_interstitiel_premiere_visite: false
};
/** Les champs numériques, avec leur défaut. */
const SPONSORS_NOMBRES = {
  sponsor_rotation_s: 8,
  sponsor_interstitiel_duree_s: 5,
  sponsor_interstitiel_skip_s: 2,
  sponsor_interstitiel_repos_min: 30
};

function injecterReglagesSponsors(global) {
  const form = document.getElementById('form-sponsors-reglages');
  Object.keys(SPONSORS_CASES).forEach(function (cle) {
    const v = String(global[cle] || '').toLowerCase();
    form[cle].checked = v ? (v === 'oui') : SPONSORS_CASES[cle];
  });
  Object.keys(SPONSORS_NOMBRES).forEach(function (cle) {
    const n = parseInt(global[cle], 10);
    form[cle].value = isFinite(n) ? n : SPONSORS_NOMBRES[cle];
  });
  majLignesInterstitiel();
  mettreAJourResumeSponsors();
}

/** Les réglages de durée n'ont de sens que si le plein écran est activé. */
function majLignesInterstitiel() {
  const actif = document.querySelector('[name="sponsor_interstitiel_actif"]').checked;
  document.getElementById('lignes-interstitiel').hidden = !actif;
}

async function onEnregistrerReglagesSponsors() {
  if (sponsorsOperationEnCours) return;
  const form = document.getElementById('form-sponsors-reglages');
  const message = document.getElementById('message-sponsors-reglages');
  const data = {};
  Object.keys(SPONSORS_CASES).forEach(function (cle) { data[cle] = form[cle].checked ? 'oui' : 'non'; });
  Object.keys(SPONSORS_NOMBRES).forEach(function (cle) { data[cle] = form[cle].value; });

  // Garde-fou côté écran (le backend le refait) : « Passer » ne peut pas arriver après la
  // fermeture automatique, sinon le message serait impossible à écourter.
  if (Number(data.sponsor_interstitiel_skip_s) > Number(data.sponsor_interstitiel_duree_s)) {
    data.sponsor_interstitiel_skip_s = data.sponsor_interstitiel_duree_s;
    form.sponsor_interstitiel_skip_s.value = data.sponsor_interstitiel_duree_s;
  }

  await avecActionSponsors(document.getElementById('bouton-enregistrer-sponsors-reglages'), message, async function () {
    const r = verifierReponseSponsors(await apiPostProtege('enregistrerReglagesSponsors', data, 'admin', 'admin', { delaiMs: DELAI_SPONSORS_MS }));

    /* ⭐ ON PEINT CE QUI A ÉTÉ APPLIQUÉ, JAMAIS CE QU'ON A DEMANDÉ.
       Le serveur BORNE (durée 3–10 s, « Passer » 0–10 s, repos 1–240 min, rotation 0–60 s) et RABOTE
       « Passer » sous la durée de fermeture. L'écran recopiait sa propre saisie : il annonçait donc
       un succès à « 500 s » pendant que le classeur retenait 10, et le formulaire continuait
       d'afficher une valeur qui n'existait nulle part.
       ⛔ Repli sur la demande UNIQUEMENT si le backend est d'avant ce lot (pas de `reglages`). */
    const appliques = (r && r.reglages) ? r.reglages : data;
    Object.keys(appliques).forEach(function (cle) { configCourante.global[cle] = appliques[cle]; });
    injecterReglagesSponsors(configCourante.global);
    mettreAJourResumeSponsors();

    const corriges = [].concat((r && r.bornes) || [], (r && r.rabote) || []);
    const actifs = sponsorsAdmin.filter(function (s) { return String(s.actif || '').toLowerCase() === 'oui'; }).length;
    let texte;
    if (r && Array.isArray(r.modifies) && !r.modifies.length) {
      texte = '✅ Rien à enregistrer — les réglages étaient déjà ceux-là.';
    } else if (String(appliques.sponsors_actifs) === 'oui') {
      texte = actifs
        ? '✅ Publication enregistrée — les partenaires sont visibles sur la page publique.'
        : '⚠️ Publication activée, mais aucun partenaire actif n’est encore visible.';
    } else {
      texte = '✅ Réglages enregistrés — les partenaires restent masqués (interrupteur général sur « non »).';
    }
    if (corriges.length) {
      // Dire CE QUI a été corrigé, pas seulement QU'il y a eu correction : sans les valeurs, la
      // phrase laisserait chercher laquelle des neuf a bougé.
      texte += ' ⚠️ Valeur(s) ramenée(s) dans les limites : ' +
        corriges.map(function (cle) { return LIBELLES_REGLAGES_SPONSORS[cle] || cle; }).join(', ') +
        ' (retenu : ' + corriges.map(function (cle) { return appliques[cle]; }).join(', ') + ').';
    }
    afficherMessage(message, texte, 'ok');
  });
}

/** Noms lisibles des réglages, pour annoncer une valeur ramenée dans ses limites. */
const LIBELLES_REGLAGES_SPONSORS = {
  sponsor_rotation_s: 'durée de rotation',
  sponsor_interstitiel_duree_s: 'durée du message plein écran',
  sponsor_interstitiel_skip_s: 'délai avant « Passer »',
  sponsor_interstitiel_repos_min: 'période de repos'
};

/**
 * Aperçu du message plein écran, avec les réglages COURANTS du formulaire (même ceux qui ne
 * sont pas encore enregistrés) : on voit ce qu'on s'apprête à publier avant de le publier.
 */
function onTesterInterstitiel() {
  const form = document.getElementById('form-sponsors-reglages');
  const message = document.getElementById('message-sponsors-reglages');
  const candidats = sponsorsPourEmplacement(sponsorsActifsAdmin(), 'plein');
  if (!candidats.length) {
    afficherMessage(message,
      '⚠️ Aucun partenaire n\'est coché sur l\'emplacement « Message plein écran ».', 'ko');
    return;
  }
  const reglages = {
    pleinDureeS: Math.max(3, Math.min(10, Number(form.sponsor_interstitiel_duree_s.value) || 5)),
    pleinSkipS: Math.max(0, Math.min(10, Number(form.sponsor_interstitiel_skip_s.value) || 0))
  };
  if (reglages.pleinSkipS > reglages.pleinDureeS) reglages.pleinSkipS = reglages.pleinDureeS;
  sponsorsAfficherPlein(sponsorsTirer('plein', candidats, true), reglages);
}


/* ==========================================================================
   EMPLACEMENTS ET LEURS RÉGLAGES
   --------------------------------------------------------------------------
   Un même logo ne se comporte pas pareil dans un bandeau large, dans une barre
   basse de téléphone et sur une feuille imprimée. Chaque emplacement coché ouvre
   donc SES propres réglages : le texte qui accompagne le logo, sa taille, et sa
   disposition dans l'encart. Laisser un champ vide reprend le réglage général du
   partenaire, puis le défaut de l'emplacement — ne rien saisir marche donc aussi.
   ========================================================================== */

/** Ce que chaque emplacement est, en une phrase — pour choisir sans deviner. */
const SPONSORS_EMPLACEMENT_AIDE = {
  bandeau: 'Page des scores — bandeau permanent en haut de page.',
  rail:    'Page des scores — colonne de droite sur ordinateur, barre basse sur téléphone. Rotatif.',
  fil:     'Page des scores — encart glissé dans le fil des résultats.',
  plein:   'Page des scores — message plein écran à l\'arrivée.',
  mur:     'Page des scores — grille de tous les logos, en bas de page.',
  dossier: 'Dossier club — bandeau permanent en tête, imprimé avec le PDF.'
};

/** Dispositions proposées, dans l'ordre où on les essaie en pratique. */
const SPONSORS_DISPO_LIBELLES = [
  ['gauche', 'Logo à gauche du texte'],
  ['droite', 'Logo à droite du texte'],
  ['haut',   'Logo au-dessus du texte'],
  ['seul',   'Logo seul, sans texte']
];

/** Forme courte : la liste déroulante est étroite, un libellé long y serait tronqué. */
const SPONSORS_DISPO_COURT = {
  gauche: 'logo à gauche', droite: 'logo à droite',
  haut: 'logo au-dessus', seul: 'logo seul'
};

/**
 * Taille de référence du logo à L'APERÇU, en pixels — les mêmes valeurs que les feuilles
 * de style publiques (`--sp-ref`), version grand écran. L'aperçu montre donc la taille
 * RÉELLE du logo dans son encart, pas une vignette décorative.
 */
const SPONSORS_APERCU_REF = { bandeau: 84, rail: 56, fil: 50, plein: 84, mur: 62, dossier: 52 };

/**
 * Largeur RÉELLE de chaque encart, en pixels — la place dont le partenaire dispose là-bas.
 *
 * Sans elle, l'aperçu s'étalait sur toute la largeur de la carte d'admin et montrait une
 * accroche bien à plat, là où le vrai encart, plus étroit, la coupait en morceaux. Un aperçu
 * plus large que la réalité est pire que pas d'aperçu : il rassure à tort.
 */
const SPONSORS_APERCU_LARGEUR = {
  bandeau: 780,   // carte de la page publique
  rail:    230,   // colonne de droite (260 px moins ses marges)
  fil:     560,   // encart au gabarit d'une carte de match
  plein:   380,   // carte du message plein écran
  mur:     150,   // tuile de la grille de logos
  dossier: 640    // largeur utile du bandeau, marges de la feuille déduites
};

/** Construit le panneau : une case par emplacement, chacune dépliant ses réglages. */
function construireEmplacements() {
  const zone = document.getElementById('sponsor-emplacements');
  if (!zone) return;
  zone.innerHTML = SPONSORS_EMPLACEMENTS.map(function (e, i) {
    const lettre = String.fromCharCode(65 + i);
    // Le défaut de l'emplacement est ANNONCÉ : « Défaut » tout court laissait croire que
    // le texte saisi s'afficherait, alors que le dossier club, par exemple, part sur
    // « logo seul » — donc sans aucun texte. Ne rien choisir doit rester prévisible.
    const defaut = SPONSORS_DISPO_DEFAUT[e] || 'gauche';
    return '<div class="sp-emp" data-emplacement="' + e + '">' +
      '<label class="mini-toggle sp-emp-tete">' +
        '<input type="checkbox" name="emp_' + e + '"' + (e === 'mur' ? ' checked' : '') + '> ' +
        '<b>' + lettre + '</b> ' + echapper(SPONSORS_LIBELLES[e].replace(/^[A-F] · /, '')) +
      '</label>' +
      '<p class="sp-emp-aide">' + echapper(SPONSORS_EMPLACEMENT_AIDE[e] || '') + '</p>' +
      '<div class="sp-emp-reglages" hidden>' +
        '<label class="reglage"><span class="r-libelle">Texte affiché ici</span>' +
          '<input class="r-input" type="text" name="txt_' + e + '" maxlength="80" ' +
            'placeholder="Vide = l\'accroche du partenaire"></label>' +
        '<p class="sp-emp-muet" hidden>Disposition « logo seul » : ce texte ne sera pas affiché ' +
          'dans cet encart. Choisis une autre disposition pour le faire apparaître.</p>' +
        '<label class="reglage"><span class="r-libelle">Taille du logo (%)</span>' +
          '<input class="r-input" type="number" name="zoom_' + e + '" min="50" max="200" step="10" ' +
            'placeholder="Vide = taille du partenaire"></label>' +
        '<label class="reglage"><span class="r-libelle">Disposition</span>' +
          '<select class="r-input" name="dispo_' + e + '">' +
            '<option value="">Défaut : ' + echapper(SPONSORS_DISPO_COURT[defaut] || defaut) + '</option>' +
            SPONSORS_DISPO_LIBELLES.map(function (d) {
              return '<option value="' + d[0] + '">' + echapper(d[1]) + '</option>';
            }).join('') +
          '</select></label>' +
        '<div class="sp-emp-apercu">' +
          '<span class="sp-emp-apercu-titre">Aperçu de cet encart</span>' +
          '<div class="sp-emp-rendu"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  /* Les réglages d'un emplacement n'ont de sens que s'il est coché ; et tout changement se voit
     tout de suite dans l'aperçu — c'est lui qui répond à « pourquoi mon texte n'apparaît pas ? »
     sans avoir à enregistrer puis recharger le dossier.
     ⛔ CET ÉCOUTEUR NE RAFRAÎCHIT PLUS L'APERÇU, et la zone n'écoute plus `input` : les deux
     faisaient DOUBLE EMPLOI avec l'écouteur `input` posé sur le formulaire entier (la zone est à
     l'intérieur, l'événement y remonte). Chaque frappe et chaque case redessinait donc les six
     aperçus DEUX fois. Ici on ne fait plus que déplier ou replier le bloc. */
  zone.addEventListener('change', function (e) {
    if (e.target && /^emp_/.test(e.target.name || '')) majReglagesEmplacement(e.target);
  });
}

/* ==========================================================================
   AVERTISSEMENTS : EMPLACEMENTS HÉRITÉS ET IDENTIFIANTS INEXPLOITABLES
   ========================================================================== */

/** Prévient AVANT la perte : cette fiche porte des emplacements que le code ne connaît plus, et ils
 *  disparaîtront si — et seulement si — l'utilisateur touche à ce champ. */
function avertirEmplacementsHistoriques(s) {
  const zone = document.getElementById('avertissement-emplacements');
  if (!zone) return;
  const connus = SPONSORS_EMPLACEMENTS;
  const inconnus = String((s && s.emplacements) || '').split(',')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x && connus.indexOf(x.toLowerCase()) === -1; });
  if (!inconnus.length) { masquerAvertissementEmplacements(); return; }
  zone.hidden = false;
  zone.textContent = '⚠️ Cette fiche porte des emplacements inconnus (' + inconnus.join(', ') +
    ') qui ne correspondent à aucun encart : ce partenaire n\'apparaît nulle part. ' +
    'Ils seront supprimés si tu modifies les emplacements ci-dessous ; tant que tu n\'y touches pas, ' +
    'ils sont conservés tels quels.';
}

function masquerAvertissementEmplacements() {
  const zone = document.getElementById('avertissement-emplacements');
  if (zone) { zone.hidden = true; zone.textContent = ''; }
}

/** Les avertissements d'intégrité renvoyés par la lecture (identifiant trop court pour être mesuré). */
function afficherAvertissementsSponsors() {
  const zone = document.getElementById('avertissements-sponsors');
  if (!zone) return;
  if (!sponsorsAvertissements.length) { zone.hidden = true; zone.innerHTML = ''; return; }
  zone.hidden = false;
  zone.innerHTML = '<ul>' + sponsorsAvertissements.map(function (a) {
    return '<li>' + echapper(a.message || a.code) + '</li>';
  }).join('') + '</ul>';
}

/** Remplit la liste des journées à partir de ce que le serveur a DÉJÀ renvoyé — l'écran ne devine
 *  rien et ne va rien chercher de plus. */
function majSelecteurJourBilan() {
  const select = document.getElementById('bilan-journee');
  if (!select) return;
  const jours = Object.keys(sponsorsJoursDisponibles || {}).sort().reverse();
  const courant = sponsorsJourBilan || (sponsorsConsolide && sponsorsConsolide.jour) || '';
  let html = '<option value="">Journée en cours</option>';
  jours.forEach(function (j) {
    html += '<option value="' + echapper(j) + '"' + (j === sponsorsJourBilan ? ' selected' : '') + '>' +
      echapper(j) + ' (' + sponsorsJoursDisponibles[j] + ' relevé' +
      (sponsorsJoursDisponibles[j] > 1 ? 's' : '') + ')</option>';
  });
  select.innerHTML = html;
  select.value = sponsorsJourBilan || '';
  const bloc = document.getElementById('bilan-journee-bloc');
  // Un seul jour connu : le sélecteur n'apprend rien, on ne l'impose pas.
  if (bloc) bloc.hidden = jours.length < 2 && !sponsorsJourBilan;
  if (courant && select.options.length) select.title = 'Journée affichée : ' + (sponsorsJourBilan || courant);
}

/** Déplie ou replie les réglages d'un emplacement selon sa case. */
function majReglagesEmplacement(caseACocher) {
  const bloc = caseACocher.closest('.sp-emp');
  if (!bloc) return;
  bloc.classList.toggle('est-actif', caseACocher.checked);
  bloc.querySelector('.sp-emp-reglages').hidden = !caseACocher.checked;
}

/** Applique l'état déplié/replié à tous les emplacements (après remplissage du formulaire). */
function majTousReglagesEmplacements() {
  const form = document.getElementById('form-sponsor');
  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    if (form['emp_' + e]) majReglagesEmplacement(form['emp_' + e]);
  });
  rafraichirApercusEmplacements();
}

/**
 * Partenaire FICTIF construit à partir de l'état courant du formulaire — y compris ce qui
 * n'est pas encore enregistré. C'est ce que le moteur d'affichage (sponsors.js) recevrait
 * si on publiait maintenant : l'aperçu passe donc par exactement le même code que la page
 * publique et le dossier club, et ne peut pas mentir sur le résultat.
 */
function sponsorDepuisFormulaire() {
  const form = document.getElementById('form-sponsor');
  if (!form) return null;
  return {
    id_sponsor: form.id_sponsor.value || '__apercu__',
    nom: form.nom.value.trim() || 'Nom du partenaire',
    accroche: form.accroche.value.trim(),
    couleur: form.couleur.value,
    // Logo pas encore téléversé : on met un identifiant factice pour que le moteur produise
    // bien une <img> (dont on remplacera la source par l'image locale) plutôt que la
    // pastille de repli — sinon l'aperçu montrerait autre chose que le résultat final.
    logo_id: sponsorLogoDataURI ? '__local__'
           : (sponsorLogoRetirer ? '' : (fichePartenaireCourante('logo_id') || '')),
    logo_zoom: form.logo_zoom.value,
    // Un objet neuf à chaque appel : sponsorsReglagesBruts met son résultat en cache sur
    // la fiche (`__reglages`), un objet réutilisé figerait l'aperçu au premier rendu.
    reglages_emplacements: JSON.stringify(lireReglagesEmplacements())
  };
}

/** Valeur d'un champ de la fiche en cours de modification (vide en création). */
function fichePartenaireCourante(champ) {
  const id = document.getElementById('form-sponsor').id_sponsor.value;
  if (!id) return '';
  const s = sponsorsAdmin.filter(function (x) { return String(x.id_sponsor) === String(id); })[0];
  return s ? String(s[champ] || '') : '';
}

/** Redessine l'aperçu de chaque emplacement coché, avec les réglages courants du formulaire. */
function rafraichirApercusEmplacements() {
  const zone = document.getElementById('sponsor-emplacements');
  const fiche = sponsorDepuisFormulaire();
  if (!zone || !fiche) return;

  const form = document.getElementById('form-sponsor');

  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    const bloc = zone.querySelector('.sp-emp[data-emplacement="' + e + '"]');
    if (!bloc) return;
    const rendu = bloc.querySelector('.sp-emp-rendu');
    const muet = bloc.querySelector('.sp-emp-muet');
    if (!rendu) return;

    // Emplacement décoché : ses réglages sont repliés, inutile d'aller chercher le logo
    // pour un aperçu que personne ne voit.
    if (!form['emp_' + e] || !form['emp_' + e].checked) {
      rendu.innerHTML = '';
      if (muet) muet.hidden = true;
      return;
    }

    const reg = sponsorsReglageEmplacement(fiche, e);
    if (muet) muet.hidden = (reg.dispo !== 'seul');

    rendu.className = 'sp-emp-rendu sp-dispo-' + reg.dispo;
    rendu.style.setProperty('--sp-ref', (SPONSORS_APERCU_REF[e] || 52) + 'px');
    // L'aperçu occupe la largeur du VRAI encart, pas celle de la carte d'admin : c'est cette
    // contrainte-là qui décide si l'accroche tient sur une ligne ou se casse en morceaux.
    rendu.style.setProperty('--sp-largeur', (SPONSORS_APERCU_LARGEUR[e] || 400) + 'px');
    rendu.innerHTML = sponsorsCorps(fiche, e, '');

    // Logo choisi mais pas encore téléversé : il n'a pas d'identifiant Drive, on branche
    // directement l'image locale pour que l'aperçu soit juste dès le glisser-déposer.
    if (sponsorLogoDataURI) {
      const img = rendu.querySelector('.sp-logo-img');
      if (img) img.src = sponsorLogoDataURI;
    }
  });
}

/** Lit les réglages par emplacement saisis dans le formulaire. */
function lireReglagesEmplacements() {
  const form = document.getElementById('form-sponsor');
  const out = {};
  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    if (!form['emp_' + e] || !form['emp_' + e].checked) return;   // décoché ⇒ rien à retenir
    const bloc = {};
    const texte = (form['txt_' + e].value || '').trim();
    const zoom = parseInt(form['zoom_' + e].value, 10);
    const dispo = form['dispo_' + e].value;
    if (texte) bloc.texte = texte;
    if (isFinite(zoom)) bloc.zoom = zoom;
    if (dispo) bloc.dispo = dispo;
    if (Object.keys(bloc).length) out[e] = bloc;
  });
  return out;
}

/** Remplit les réglages par emplacement depuis une fiche existante. */
function injecterReglagesEmplacements(s) {
  const form = document.getElementById('form-sponsor');
  const reglages = sponsorsReglagesBruts(s) || {};
  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    const r = reglages[e] || {};
    form['txt_' + e].value = r.texte || '';
    form['zoom_' + e].value = isFinite(parseInt(r.zoom, 10)) ? parseInt(r.zoom, 10) : '';
    form['dispo_' + e].value = r.dispo || '';
  });
}

/* ==========================================================================
   2. FICHES PARTENAIRES
   ========================================================================== */

/** Normalise une fiche au format attendu par le moteur d'affichage (sponsors.js). */
function normaliserFicheSponsor(s) {
  const c = {};
  Object.keys(s).forEach(function (k) { c[k] = (s[k] === null || s[k] === undefined) ? '' : String(s[k]); });
  return c;
}

/** Fiches ACTIVES — ce que la page publique sert. ⭐ À conserver pour les APERÇUS et le contrôle
 *  « ce que reçoit le public » : là, seuls les partenaires réellement publiés ont un sens. */
function sponsorsActifsAdmin() {
  return sponsorsAdmin
    .filter(function (s) { return String(s.actif || '').toLowerCase() === 'oui'; })
    .map(normaliserFicheSponsor);
}

/**
 * TOUTES les fiches — c'est ce qu'il faut au BILAN, et la distinction n'est pas cosmétique.
 *
 * 🔬 Le bilan ne filtrait pas : il itère sur les RELEVÉS et ne se sert de la liste que pour
 * retrouver les noms. En ne lui passant que les fiches actives, un partenaire désactivé après le
 * tournoi — le geste que la confirmation de suppression recommande justement — perdait son nom et
 * n'apparaissait plus que sous son identifiant technique, dans le document envoyé au partenaire.
 */
function sponsorsToutesAdmin() {
  return sponsorsAdmin.map(normaliserFicheSponsor);
}

/** Comment nommer un partenaire dans le bilan, selon ce qu'il est devenu depuis la mesure. */
function etatPartenaireBilan(id) {
  const fiche = sponsorsAdmin.filter(function (s) { return String(s.id_sponsor) === String(id); })[0];
  if (!fiche) {
    // ⛔ AUCUN NOM INVENTÉ. La fiche a disparu : son nom n'existe plus nulle part, et le dire est la
    //   seule chose honnête. L'identifiant est conservé — c'est lui qui relie au relevé.
    return { libelle: 'Partenaire supprimé (' + String(id) + ')', mention: 'fiche supprimée', supprime: true };
  }
  const actif = String(fiche.actif || '').toLowerCase() === 'oui';
  return { libelle: String(fiche.nom || id), mention: actif ? '' : 'masqué aujourd’hui', supprime: false };
}

/**
 * Lit les fiches partenaires. ⛔ NE REND RIEN — comme `lireRelevesSponsors`, pour que les deux
 * lectures puissent partir ensemble depuis le registre (`ADMIN_ETAPES.sponsors`).
 * ⚠️ En cas d'échec, le message d'erreur est posé ICI et `false` est renvoyé : l'appelant ne
 * doit alors PAS appeler `afficherListeSponsors()`, qui écraserait ce message par un
 * « Aucun partenaire pour l'instant » mensonger — une panne de lecture n'est pas une absence.
 * @return {Promise<boolean>} true si les fiches ont été lues, false si la lecture a échoué.
 */
async function lireFichesSponsors() {
  const zone = document.getElementById('liste-sponsors');
  zone.innerHTML = '<p class="vide">Chargement des partenaires…</p>';
  try {
    const r = verifierReponseSponsors(await apiPostProtege('listerSponsors', {}, 'admin', 'admin', { delaiMs: DELAI_SPONSORS_MS }));
    if (!Array.isArray(r.sponsors)) throw new SyntaxError('Réponse invalide');
    sponsorsAdmin = r.sponsors;
    sponsorsAvertissements = r.avertissements || [];   // ⭐ absent d'un backend d'avant : tableau vide
    return true;
  } catch (err) {
    zone.innerHTML = '<p class="vide">Erreur de chargement des partenaires : ' + echapper(messageErreurSponsors(err, false)) + '</p>';
    return false;
  }
}

/**
 * Lecture + rendu des fiches, en un geste. Point d'entrée des usages ISOLÉS : après
 * enregistrement ou suppression d'un partenaire. Comportement inchangé.
 */
async function chargerSponsors() {
  const bouton = document.getElementById('bouton-actualiser-sponsors');
  if (bouton) { bouton.disabled = true; bouton.textContent = 'Actualisation…'; }
  try {
    // ⭐ R2 — rafraîchissement FORCÉ : cette fonction suit un enregistrement ou une suppression,
    //   la relecture doit donc être postérieure à cette écriture. Le registre l'garantit et
    //   empêche qu'une lecture de navigation commencée avant ne soit resservie.
    const ok = (typeof rafraichirRessourceAdmin === 'function')
      ? await rafraichirRessourceAdmin('fichesSponsors')
      : await lireFichesSponsors();
    if (ok) afficherListeSponsors();
    return ok;
  } finally {
    if (bouton) { bouton.disabled = false; bouton.textContent = 'Actualiser la liste'; }
  }
}

function afficherListeSponsors() {
  const zone = document.getElementById('liste-sponsors');
  mettreAJourResumeSponsors();
  afficherAvertissementsSponsors();
  if (!sponsorsAdmin.length) {
    zone.innerHTML = '<p class="vide">Aucun partenaire pour l\'instant. Utilise « Ajouter un partenaire » pour commencer.</p>';
    return;
  }
  let html = '<div class="sponsor-cartes">';
  sponsorsAdmin.forEach(function (s) {
    const actif = String(s.actif || '').toLowerCase() === 'oui';
    const emplacements = String(s.emplacements || '').split(',')
      .map(function (x) { return x.trim(); })
      .filter(Boolean)
      .map(function (x) { return '<span class="sp-tag">' + echapper(etiquetteEmplacement(x)) + '</span>'; })
      .join('');
    html +=
      '<div class="sponsor-carte' + (actif ? '' : ' est-inactif') + '">' +
        '<div class="sponsor-carte-logo">' +
          (s.logo_id
            ? '<img src="' + echapper(urlAffiche(s.logo_id, 240)) + '" alt="' + echapper(s.nom) +
              '" style="--sp-zoom:' + sponsorsReglageEmplacement(s, 'bandeau').zoom + '">'
            : '<span class="sponsor-pastille" style="background:' + echapper(couleurSponsor(s)) + '">' +
              echapper(s.nom) + '</span>') +
        '</div>' +
        '<div class="sponsor-carte-corps">' +
          '<strong>' + echapper(s.nom) + '</strong>' +
          (s.accroche ? '<span class="sponsor-accroche">' + echapper(s.accroche) + '</span>' : '') +
          '<div class="sponsor-tags">' + emplacements +
            '<span class="sp-tag sp-tag-poids">poids ' + echapper(String(s.poids || 1)) + '</span>' +
            (actif ? '' : '<span class="sp-tag sp-tag-off">masqué</span>') +
          '</div>' +
        '</div>' +
        '<div class="sponsor-carte-actions">' +
          '<button type="button" class="bouton-lien" data-action="modifier" data-id="' + echapper(s.id_sponsor) + '">Modifier</button>' +
          '<button type="button" class="bouton-lien danger" data-action="supprimer" data-id="' + echapper(s.id_sponsor) + '">Supprimer</button>' +
        '</div>' +
      '</div>';
  });
  zone.innerHTML = html + '</div>';
}

function etiquetteEmplacement(cle) {
  return (SPONSORS_LIBELLES[cle] || cle).replace(' · ', ' ');
}

function couleurSponsor(s) {
  const c = String(s.couleur || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0C1C2E';
}

function onClicListeSponsors(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn || sponsorsOperationEnCours) return;
  const id = btn.getAttribute('data-id');
  if (btn.getAttribute('data-action') === 'modifier') remplirFormSponsor(id);
  else onSupprimerSponsor(id, btn);
}

function onAjouterSponsor() {
  if (sponsorsOperationEnCours) return;
  choisirVueSponsors('gestion');
  reinitialiserFormSponsor();
  afficherMessage(document.getElementById('message-sponsors-liste'), '', 'ok');
  const form = document.getElementById('form-sponsor');
  form.hidden = false;
  document.getElementById('bouton-annuler-sponsor').hidden = false;
  form.nom.focus();
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const SPONSORS_PRESETS_VISIBILITE = {
  essentiel: ['mur', 'dossier'],
  renforce: ['rail', 'mur', 'dossier']
};

/** Applique un niveau lisible aux cases techniques existantes, sans changer le format stocké. */
function appliquerPresetVisibilite(preset) {
  const form = document.getElementById('form-sponsor');
  const personnalises = document.getElementById('sponsor-emplacements-personnalises');
  if (!form || !personnalises) return;

  personnalises.hidden = preset !== 'personnalise';
  const emplacements = SPONSORS_PRESETS_VISIBILITE[preset];
  if (emplacements) {
    SPONSORS_EMPLACEMENTS.forEach(function (e) {
      form['emp_' + e].checked = emplacements.indexOf(e) >= 0;
    });
  }
  majTousReglagesEmplacements();
}

/** Reconnaît les deux niveaux simples ; toute autre combinaison reste personnalisée. */
function synchroniserPresetVisibilite() {
  const form = document.getElementById('form-sponsor');
  const actifs = SPONSORS_EMPLACEMENTS.filter(function (e) {
    return form['emp_' + e].checked;
  });
  let preset = 'personnalise';
  Object.keys(SPONSORS_PRESETS_VISIBILITE).some(function (cle) {
    const attendu = SPONSORS_PRESETS_VISIBILITE[cle];
    const identique = actifs.length === attendu.length && attendu.every(function (e) {
      return actifs.indexOf(e) >= 0;
    });
    if (identique) preset = cle;
    return identique;
  });
  const radio = form.querySelector('[name="visibilite_preset"][value="' + preset + '"]');
  if (radio) radio.checked = true;
  document.getElementById('sponsor-emplacements-personnalises').hidden = preset !== 'personnalise';
}

/** Les 10 champs métier du formulaire, dans la forme où ils partent au serveur. Sert DEUX fois :
 *  pour l'instantané pris juste après le remplissage, et à l'enregistrement. ⭐ La même fonction des
 *  deux côtés : c'est ce qui rend le « champ touché » fiable, sans écouteur ni drapeau à tenir. */
function lireFormulaireSponsor() {
  const form = document.getElementById('form-sponsor');
  return {
    nom: form.nom.value.trim(),
    accroche: form.accroche.value.trim(),
    url: form.url.value.trim(),
    couleur: form.couleur.value,
    emplacements: SPONSORS_EMPLACEMENTS.filter(function (e) { return form['emp_' + e].checked; }).join(','),
    poids: form.poids.value,
    ordre: form.ordre.value,
    logo_zoom: form.logo_zoom.value,
    reglages_emplacements: JSON.stringify(lireReglagesEmplacements()),
    actif: form.actif.checked ? 'oui' : 'non'
  };
}

/** L'état du formulaire tel qu'il vient d'être rempli. Tout écart avec lui est une modification
 *  VOULUE ; tout le reste n'entre pas dans l'intention envoyée au serveur. */
let sponsorsFormInitial = null;

/** Les champs que l'utilisateur a réellement modifiés depuis le remplissage. */
function champsTouchesSponsor() {
  const courant = lireFormulaireSponsor();
  if (!sponsorsFormInitial) return Object.keys(courant);     // création : tout est intentionnel
  return Object.keys(courant).filter(function (c) { return courant[c] !== sponsorsFormInitial[c]; });
}

function remplirFormSponsor(id) {
  if (sponsorsOperationEnCours) return;
  const s = sponsorsAdmin.filter(function (x) { return String(x.id_sponsor) === String(id); })[0];
  if (!s) return;
  const form = document.getElementById('form-sponsor');

  form.id_sponsor.value = s.id_sponsor;
  form.nom.value = s.nom || '';
  form.accroche.value = s.accroche || '';
  form.url.value = s.url || '';
  form.couleur.value = couleurSponsor(s).toLowerCase();
  form.poids.value = s.poids || 1;
  form.ordre.value = s.ordre || 100;
  form.logo_zoom.value = parseInt(s.logo_zoom, 10) || 100;
  form.actif.checked = String(s.actif || '').toLowerCase() === 'oui';

  const emplacements = String(s.emplacements || '').split(',').map(function (x) { return x.trim(); });
  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    form['emp_' + e].checked = emplacements.indexOf(e) >= 0;
  });
  injecterReglagesEmplacements(s);
  synchroniserPresetVisibilite();
  majTousReglagesEmplacements();

  sponsorLogoDataURI = null;
  sponsorLogoRetirer = false;
  majApercuLogoSponsor(s.logo_id ? urlAffiche(s.logo_id, 320) : '');

  /* ⭐ LA BASE EST BRUTE, prise sur la fiche du SERVEUR — jamais sur le formulaire, qui vient de
     normaliser la couleur, le poids, l'ordre, le zoom et l'ordre des emplacements. */
  sponsorsBaseFiche = {};
  Object.keys(s).forEach(function (c) {
    sponsorsBaseFiche[c] = (s[c] === null || s[c] === undefined) ? '' : String(s[c]);
  });
  sponsorsFormInitial = lireFormulaireSponsor();
  sponsorsRequeteId = '';                     // ⛔ une modification n'est pas une création
  avertirEmplacementsHistoriques(s);

  document.getElementById('titre-form-sponsor').textContent = 'Modifier « ' + s.nom + ' »';
  document.getElementById('bouton-annuler-sponsor').hidden = false;
  choisirVueSponsors('gestion');
  form.hidden = false;
  form.nom.focus();
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function reinitialiserFormSponsor() {
  const form = document.getElementById('form-sponsor');
  form.reset();
  form.id_sponsor.value = '';
  form.couleur.value = '#0c1c2e';
  form.poids.value = 1;
  form.ordre.value = 100;
  form.logo_zoom.value = 100;
  form.actif.checked = true;
  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    form['emp_' + e].checked = (e === 'mur' || e === 'dossier');
    form['txt_' + e].value = '';
    form['zoom_' + e].value = '';
    form['dispo_' + e].value = '';
  });
  synchroniserPresetVisibilite();
  majTousReglagesEmplacements();

  sponsorLogoDataURI = null;
  sponsorLogoRetirer = false;
  majApercuLogoSponsor('');

  /* ⭐ NOUVELLE INTENTION DE CRÉATION — et donc un `requete_id` NEUF.
     ⛔ Il ne doit surtout pas être renouvelé ailleurs : c'est son maintien à travers un silence, un
     délai dépassé ou une réponse perdue qui empêche qu'un second clic ne crée une seconde fiche.
     ⚠️ Et il DOIT l'être ici : sans cela, le partenaire suivant serait pris pour un rejeu du
     précédent, et refusé. */
  sponsorsBaseFiche = null;
  sponsorsFormInitial = null;
  sponsorsRequeteId = sponsorsNouvelleIntention();
  sponsorsDerniereIntention = null;
  masquerAvertissementEmplacements();

  document.getElementById('titre-form-sponsor').textContent = 'Ajouter un partenaire';
  document.getElementById('bouton-annuler-sponsor').hidden = true;
  document.querySelectorAll('.sponsors-options-partenaire').forEach(function (details) { details.open = false; });
  afficherMessage(document.getElementById('message-sponsor'), '', 'ok');
  form.hidden = true;
}

/** Aperçu du logo (choisi ou déjà enregistré). Vide = zone masquée. */
function majApercuLogoSponsor(src) {
  const bloc = document.getElementById('apercu-sponsor-logo');
  const img = document.getElementById('apercu-sponsor-logo-img');
  if (!src) { bloc.hidden = true; img.removeAttribute('src'); }
  else { img.src = src; bloc.hidden = false; }
  rafraichirApercusEmplacements();  // les aperçus par emplacement montrent le même logo
}

/**
 * Un logo est une petite image : 600 px de côté suffisent largement, et allègent l'envoi.
 *
 * ⚠️ FOND BLANC PEINT, ET SORTIE EN PNG. Un logo de partenaire est presque toujours un PNG
 * détouré. Tout maillon qui aplatit la transparence — encodage JPEG, mais aussi le proxy
 * d'images qui sert les fichiers Drive — le fait ressortir sur un carré NOIR, parce qu'un
 * canevas vierge est transparent-noir. Plutôt que de parier sur le bon comportement de
 * chaque maillon, on peint un fond blanc : il n'y a plus de transparence à rater, et le
 * résultat est le même partout. Les tuiles qui accueillent les logos sont blanches, le fond
 * peint est donc invisible.
 */
async function traiterFichierLogoSponsor(fichier) {
  const message = document.getElementById('message-sponsor');
  if (!fichier) return;
  if (!/^image\//.test(fichier.type)) {
    afficherMessage(message, '⚠️ Choisis une image (PNG, JPEG ou WebP).', 'ko');
    return;
  }
  try {
    sponsorLogoDataURI = await redimensionnerImage(fichier, 600, 0.92, 'image/png', '#FFFFFF');
    sponsorLogoRetirer = false;
    majApercuLogoSponsor(sponsorLogoDataURI);
    afficherMessage(message, 'Logo prêt — clique « Enregistrer le partenaire » pour le sauvegarder.', 'ok');
  } catch (e) {
    afficherMessage(message, '⚠️ Image illisible.', 'ko');
  }
}

function onRetirerLogoSponsor() {
  sponsorLogoDataURI = null;
  sponsorLogoRetirer = true;   // sera transmis au backend à l'enregistrement
  majApercuLogoSponsor('');
  afficherMessage(document.getElementById('message-sponsor'),
    'Logo retiré — clique « Enregistrer le partenaire » pour confirmer.', 'ok');
}

/** Le corps de la requête d'enregistrement, avec ses trois voies. `null` si la saisie est refusée
 *  ici (le message est alors déjà posé). */
function construireIntentionSponsor(message) {
  const form = document.getElementById('form-sponsor');
  const valeurs = lireFormulaireSponsor();
  const touches = champsTouchesSponsor();
  const creation = !form.id_sponsor.value;

  if (creation && !valeurs.nom) { afficherMessage(message, '⚠️ Le nom du partenaire est obligatoire.', 'ko'); return null; }
  if (!creation && touches.indexOf('nom') !== -1 && !valeurs.nom) {
    afficherMessage(message, '⚠️ Le nom du partenaire est obligatoire.', 'ko'); return null;
  }
  if (valeurs.url && !/^https?:\/\/[^\s]+$/i.test(valeurs.url)) {
    afficherMessage(message, '⚠️ Indique une adresse de site commençant par https:// ou http://.', 'ko');
    form.url.focus();
    return null;
  }
  /* ⭐ LE GARDE-FOU « coche au moins un emplacement » NE S'APPLIQUE PLUS QU'À UNE INTENTION RÉELLE.
     ⛔ Il bloquait AUSSI une fiche ancienne dont les emplacements portent des jetons que le code ne
     connaît plus : pour corriger une simple accroche, l'organisateur était CONTRAINT de cocher une
     case — et perdait ses jetons historiques sans l'avoir voulu. Champ non touché ⇒ pas d'intention
     ⇒ le serveur conserve la valeur brute telle quelle. */
  const emplacementsTouches = touches.indexOf('emplacements') !== -1;
  if ((creation || emplacementsTouches) && !valeurs.emplacements) {
    afficherMessage(message, '⚠️ Coche au moins un emplacement.', 'ko');
    return null;
  }

  const data = { id_sponsor: form.id_sponsor.value };
  if (creation) {
    Object.keys(valeurs).forEach(function (c) { data[c] = valeurs[c]; });
    // ⭐ L'INTENTION DE CRÉATION, stable à travers les pannes : c'est elle qui rend un second clic
    //   inoffensif après une réponse perdue.
    data.requete_id = sponsorsRequeteId || (sponsorsRequeteId = sponsorsNouvelleIntention());
  } else {
    // ⭐ Les trois voies : la base BRUTE reçue du serveur, l'intention nommée, les valeurs voulues.
    touches.forEach(function (c) { data[c] = valeurs[c]; });
    if (sponsorsBaseFiche) {
      data.base = JSON.stringify(sponsorsBaseFiche);
      data.champs_touches = JSON.stringify(touches);
    }
  }
  if (sponsorLogoDataURI) data.logo = sponsorLogoDataURI;
  if (sponsorLogoRetirer) data.logo_retirer = 'oui';
  return data;
}

/** Applique à l'écran la liste renvoyée par une écriture. ⭐ Plus aucune seconde requête : la liste
 *  a été relue SOUS LE VERROU, elle est donc postérieure à l'écriture par construction.
 *  ⛔ Repli sur une relecture si le backend est d'avant ce lot (pas de champ `sponsors`). */
function appliquerListeSponsors(r) {
  if (!r || !Array.isArray(r.sponsors)) { actualiserSponsorsApresEcriture(); return; }
  if (typeof appliquerRessourceAdmin === 'function') {
    appliquerRessourceAdmin('fichesSponsors', function () {
      sponsorsAdmin = r.sponsors;
      afficherListeSponsors();
    });
  } else {
    sponsorsAdmin = r.sponsors;
    afficherListeSponsors();
  }
}

/** Ce que le serveur a corrigé ou conservé, dit en clair — jamais en silence. */
function messageSuitesSponsor(r) {
  let suite = '';
  if (r && (r.conserves || []).length) {
    suite += ' Une autre session avait modifié ' + (r.conserves.length > 1 ? 'des champs' : 'un champ') +
      ' que tu n\'avais pas touché' + (r.conserves.length > 1 ? 's' : '') + ' : sa version a été conservée.';
  }
  if (r && (r.emplacements_abandonnes || []).length) {
    suite += ' ⚠️ Emplacement(s) hérité(s) supprimé(s) : ' +
      r.emplacements_abandonnes.join(', ') + ' — ils ne correspondaient à aucun encart.';
  }
  return suite;
}

/**
 * Envoie l'intention, et traite le CONFLIT autrement que par un message d'erreur.
 * ⭐ Deux choix explicites, jamais d'écrasement automatique :
 *   ① recharger la version actuelle — la saisie est abandonnée, sciemment ;
 *   ② réessayer avec sa saisie — l'état actuel devient la NOUVELLE base, et la même intention
 *      repart. Si une troisième session intervient entre-temps, un nouveau conflit est produit :
 *      la protection ne se désarme pas après une confirmation.
 */
async function envoyerIntentionSponsor(data, message) {
  let r;
  try {
    r = verifierReponseSponsors(await apiPostProtege('enregistrerSponsor', data, 'admin', 'admin', { delaiMs: DELAI_SPONSORS_MS }));
  } catch (err) {
    const rep = (err && err.reponse) || {};
    if (rep.code === 'conflit_fiche') return traiterConflitSponsor(rep, data, message);
    if (rep.code === 'fiche_supprimee') {
      afficherMessage(message, '⚠️ Cette fiche a été supprimée pendant ta saisie. Tes valeurs sont ' +
        'conservées à l\'écran : utilise « Ajouter un partenaire » pour la recréer.', 'ko');
      return false;
    }
    throw err;
  }
  if (!r.id_sponsor) throw new SyntaxError('Réponse invalide');

  const liste = document.getElementById('message-sponsors-liste');
  const rejeu = r.deja_appliquee === true;
  reinitialiserFormSponsor();
  afficherMessage(liste, (rejeu
    ? '✅ Partenaire déjà enregistré — ta demande précédente avait bien abouti, aucune fiche en double.'
    : '✅ Partenaire enregistré.') + messageSuitesSponsor(r), 'ok');
  liste.focus();
  appliquerListeSponsors(r);
  return true;
}

/** Le conflit, présenté champ par champ, avec les deux issues possibles. */
async function traiterConflitSponsor(rep, data, message) {
  const champs = (rep.champs_en_conflit || []).map(function (c) { return LIBELLES_CHAMPS_SPONSOR[c] || c; });
  const detail = (rep.conflits || []).map(function (c) {
    return '· ' + (LIBELLES_CHAMPS_SPONSOR[c.champ] || c.champ) +
      ' — la tienne : « ' + c.souhaite +' », celle enregistrée : « ' + c.actuel + ' »';
  }).join('\n');
  const reprendre = await dialogConfirmer(
    'Une autre session a modifié cette fiche pendant ta saisie.\n\n' +
    (detail || champs.join(', ')) + '\n\n' +
    'Que veux-tu faire ? Tes saisies sont conservées dans les deux cas.',
    { ok: 'Garder ma version', annuler: 'Recharger la version enregistrée' });

  if (!reprendre) {
    // ① On recharge l'état actuel : la fiche est repeinte depuis ce que le serveur a joint au refus.
    if (rep.actuel && rep.actuel.id_sponsor) {
      const i = sponsorsAdmin.findIndex(function (s) { return String(s.id_sponsor) === String(rep.actuel.id_sponsor); });
      if (i >= 0) sponsorsAdmin[i] = rep.actuel;
      afficherListeSponsors();
      remplirFormSponsor(rep.actuel.id_sponsor);
    }
    afficherMessage(message, 'Version enregistrée rechargée. Reprends ta modification si besoin.', 'ok');
    return false;
  }
  // ② L'état actuel devient la NOUVELLE base, la même intention repart. ⛔ Si une autre session
  //    intervient encore, un nouveau conflit sera produit — aucun écrasement automatique.
  sponsorsBaseFiche = {};
  Object.keys(rep.actuel || {}).forEach(function (c) {
    sponsorsBaseFiche[c] = (rep.actuel[c] === null || rep.actuel[c] === undefined) ? '' : String(rep.actuel[c]);
  });
  const reprise = Object.assign({}, data, { base: JSON.stringify(sponsorsBaseFiche) });
  return envoyerIntentionSponsor(reprise, message);
}

/** Noms lisibles des champs d'une fiche, pour un message de conflit compréhensible. */
const LIBELLES_CHAMPS_SPONSOR = {
  nom: 'nom', accroche: 'accroche', url: 'adresse du site', couleur: 'couleur',
  emplacements: 'emplacements', poids: 'poids', ordre: 'ordre d\'affichage',
  logo_zoom: 'taille du logo', reglages_emplacements: 'réglages par emplacement',
  actif: 'partenaire visible', logo_id: 'logo', visuel_id: 'visuel'
};

async function onEnregistrerSponsor() {
  if (sponsorsOperationEnCours) return;
  const message = document.getElementById('message-sponsor');
  const data = construireIntentionSponsor(message);
  if (!data) return;
  sponsorsDerniereIntention = data;

  await avecActionSponsors(document.getElementById('bouton-enregistrer-sponsor'), message, async function () {
    await envoyerIntentionSponsor(data, message);
  });
}

async function onSupprimerSponsor(id, bouton) {
  if (sponsorsOperationEnCours) return;
  const s = sponsorsAdmin.filter(function (x) { return String(x.id_sponsor) === String(id); })[0];
  if (!s || !bouton) return;
  const message = document.getElementById('message-sponsors-liste');
  await avecActionSponsors(bouton, message, async function () {
    const ok = await dialogConfirmer('Supprimer « ' + s.nom + ' » ?\n\n' +
      'Sa fiche et son logo seront supprimés.\n\n' +
      // ⭐ Dire la conséquence QUI SE VOIT PLUS TARD : les relevés de visibilité déjà mesurés
      //   survivent à la fiche, mais plus son NOM — le bilan d'après tournoi n'afficherait alors
      //   qu'un identifiant technique. La désactivation, elle, garde tout.
      '⚠️ Son nom disparaîtra aussi des bilans de visibilité déjà mesurés : ils ne pourront plus ' +
      'l\'afficher que sous son identifiant.\n\n' +
      'Pour conserver sa fiche ET cet historique, décoche plutôt « Partenaire actif ».',
      { ok: 'Supprimer', danger: true });
    if (!ok) { afficherMessage(message, 'Suppression annulée.', 'ok'); return; }
    const r = verifierReponseSponsors(await apiPostProtege('supprimerSponsor', { id_sponsor: id }, 'admin', 'admin', { delaiMs: DELAI_SPONSORS_MS }));
    // ⭐ `deja_absent` : la fiche n'était plus là — demande rejouée, ou supprimée par une autre
    //   session. L'état visé EST atteint : ce n'est pas une erreur, et on ne le présente pas comme telle.
    afficherMessage(message, r.deja_absent
      ? '✅ Ce partenaire était déjà supprimé.'
      : '✅ Partenaire supprimé.', 'ok');
    appliquerListeSponsors(r);
  }, 'Suppression…');
}

/* ==========================================================================
   3. FICHE DE VISIBILITÉ
   ========================================================================== */

/* ==========================================================================
   AUTODIAGNOSTIC DE LA REMONTÉE
   --------------------------------------------------------------------------
   « J'ai déployé, et pourtant la fiche dit qu'aucun relevé n'arrive. » Impossible à
   trancher depuis un écran : la chaîne compte plusieurs maillons (déploiement du
   backend, écriture, relecture). Ce bouton les teste UN PAR UN et nomme celui qui
   casse, au lieu de laisser deviner.

   Le relevé de test porte l'identifiant réservé `__test__`, ignoré par la
   consolidation : il ne pollue jamais la fiche d'un partenaire.
   ========================================================================== */

/** Identifiant réservé au relevé d'autodiagnostic (filtré de toute consolidation). */
var SPONSOR_ID_TEST = '__test__';

async function onTesterRemontee() {
  const zone = document.getElementById('diagnostic-remontee');
  const bouton = document.getElementById('bouton-tester-remontee');
  zone.hidden = false;
  zone.className = 'diagnostic-remontee';
  zone.innerHTML = '<p>⏳ Test en cours…</p>';
  bouton.disabled = true;

  const lignes = [];
  let verdict = '';
  let classe = 'diag-ok';

  try {
    // ÉTAPE 1 — l'écriture publique. C'est elle qui dira si le backend en service
    // connaît la nouvelle action, donc si le redéploiement a réellement pris.
    const marque = 'diag' + Math.random().toString(36).slice(2, 10);
    const releve = {
      appareil: marque,
      session: marque,
      sponsors: {}
    };
    releve.sponsors[SPONSOR_ID_TEST] = {
      expo: { mur: 1 }, aff: { mur: 1 }, clics: 0,
      plein: { ouverts: 0, secondes: 0, passes: 0 }, tranches: {}
    };

    let ecritureOk = false;
    try {
      const r = await apiPost('mesureSponsors', releve, { delaiMs: DELAI_SPONSORS_MS });
      // `ignore` = le backend a répondu OK mais n'a VOLONTAIREMENT rien écrit (un plafond de
      // l'écriture publique est atteint). Sans ce cas, le diagnostic annoncerait une écriture
      // réussie puis une relecture introuvable, et enverrait chercher une panne inexistante.
      if (r && r.ok && r.ignore) {
        ecritureOk = false;
        lignes.push('⚠️ <strong>Écriture</strong> — le backend a répondu, mais n\'a rien enregistré : ' +
          'un <strong>plafond de sécurité</strong> est atteint (<code>' + echapper(r.ignore) + '</code>).');
        verdict = (r.ignore === 'plafond_lignes')
          ? '<strong>L\'onglet des relevés est plein.</strong> C\'est un garde-fou volontaire : ' +
            'au-delà d\'une certaine taille, plus rien n\'est enregistré, pour qu\'un afflux de ' +
            'relevés ne puisse jamais empêcher la saisie des scores. Clique ' +
            '« Vider les relevés » pour repartir, après avoir noté les chiffres qui t\'intéressent.'
          : '<strong>Le débit maximal de relevés est atteint</strong> pour le moment. C\'est un ' +
            'garde-fou volontaire, et il se relâche tout seul : réessaie dans un moment. ' +
            'Si cela se reproduit sans raison, signale-le — les plafonds sont peut-être trop bas.';
        classe = 'diag-ko';
      } else {
        ecritureOk = !!(r && r.ok);
        lignes.push(ecritureOk
          ? '✅ <strong>Écriture</strong> — le backend a accepté un relevé de test.'
          : '⚠️ <strong>Écriture</strong> — réponse inattendue du backend.');
      }
    } catch (err) {
      const msg = String(err.message || '');
      if (/Action inconnue/i.test(msg)) {
        lignes.push('❌ <strong>Écriture</strong> — le backend en service <strong>ne connaît pas</strong> ' +
          'l\'action <code>mesureSponsors</code>.');
        verdict =
          '<strong>Le déploiement n\'a pas pris.</strong> C\'est presque toujours la même cause : ' +
          'avoir utilisé <em>« Nouveau déploiement »</em>, qui crée une <strong>autre URL</strong> — ' +
          'la page continue alors d\'appeler l\'ancienne, avec l\'ancien code.<br><br>' +
          'Refais-le ainsi : <strong>Déployer → Gérer les déploiements → ✏️ (crayon) → ' +
          'Version : « Nouvelle version » → Déployer.</strong><br>' +
          'Vérifie aussi que le contenu de <code>backend/Code.gs</code> a bien été collé <em>en entier</em> ' +
          '(l\'ancien remplacé, pas ajouté à la suite).';
        classe = 'diag-ko';
      } else {
        lignes.push('❌ <strong>Écriture</strong> — ' + echapper(messageErreurSponsors(err, true)));
        verdict = 'Le relevé n\'a pas pu être enregistré. Message du serveur ci-dessus.';
        classe = 'diag-ko';
      }
    }

    // ÉTAPE 2 — la relecture. Elle n'a de sens que si l'écriture est passée.
    if (ecritureOk) {
      try {
        const lu = await apiPostProtege('lireMesuresSponsors', {}, 'admin', 'admin', { delaiMs: DELAI_SPONSORS_MS });
        const trouve = (lu.releves || []).some(function (x) { return x.session === marque; });
        if (trouve) {
          lignes.push('✅ <strong>Relecture</strong> — le relevé de test a bien été retrouvé.');
          const vrais = (lu.releves || []).filter(function (x) { return x.session !== marque; });
          if (vrais.length) {
            lignes.push('✅ <strong>Relevés réels</strong> — ' + vrais.length + ' déjà remonté(s) des spectateurs.');
            verdict = '<strong>La chaîne fonctionne de bout en bout.</strong> Clique ' +
              '« Rafraîchir les chiffres » pour les voir apparaître.';
          } else if (lu.total > 1) {
            // > 1 car le relevé de test qu'on vient d'écrire compte lui aussi.
            lignes.push('ℹ️ <strong>Relevés réels</strong> — aucun <em>pour la journée en cours</em>, ' +
              'mais ' + (lu.total - 1) + ' au total sur d\'autres journées.');
            verdict = '<strong>La chaîne fonctionne.</strong> Les relevés déjà remontés datent ' +
              'd\'un autre jour : la fiche ne montre que la journée en cours. Refais une visite ' +
              'sur la page publique aujourd\'hui pour voir les chiffres apparaître.';
          } else {
            lignes.push('ℹ️ <strong>Relevés réels</strong> — aucun pour l\'instant.');
            verdict = '<strong>La chaîne fonctionne</strong> — il ne manque que des visiteurs. ' +
              'Ouvre la page publique des scores <em>avec les partenaires activés</em> et ' +
              'laisse-la au premier plan <strong>au moins 20 secondes</strong> : c\'est le délai ' +
              'du premier relevé. Reviens ensuite ici et rafraîchis.';
          }
        } else {
          lignes.push('❌ <strong>Relecture</strong> — le relevé de test n\'a pas été retrouvé.');
          verdict = 'L\'écriture passe mais la relecture ne voit rien. Regarde l\'onglet ' +
            '<code>Mesures</code> du Sheet : si la ligne y est, c\'est la date qui ne correspond pas ' +
            '(la relecture ne montre que la journée en cours).';
          classe = 'diag-ko';
        }
      } catch (err) {
        lignes.push('❌ <strong>Relecture</strong> — ' + echapper(messageErreurSponsors(err, false)));
        verdict = 'L\'écriture fonctionne mais la relecture échoue.';
        classe = 'diag-ko';
      }
    }
  } finally {
    bouton.disabled = false;
  }

  zone.className = 'diagnostic-remontee ' + classe;
  zone.innerHTML = '<ul>' + lignes.map(function (l) { return '<li>' + l + '</li>'; }).join('') +
    '</ul>' + (verdict ? '<p class="diag-verdict">' + verdict + '</p>' : '');
}

/* ==========================================================================
   3 bis. CONTRÔLE « CE QUE REÇOIT LE PUBLIC »
   --------------------------------------------------------------------------
   L'admin montre ce qu'on a SAISI. Cette carte montre ce qui est SERVI — en relisant
   l'instantané public (`getAll`), exactement celui que reçoivent la page des scores et
   le dossier club. Entre les deux, il y a un enregistrement, un Sheet et un cache : le
   jour où « j'ai réglé et rien ne change », c'est ici qu'on voit lequel des trois n'a
   pas suivi, au lieu de le supposer.
   ========================================================================== */

/** D'où vient une valeur, en clair. */
const SPONSORS_ORIGINES = {
  encart:  { texte: 'réglé ici',            classe: 'sp-src-encart' },
  general: { texte: 'réglage du partenaire', classe: 'sp-src-general' },
  defaut:  { texte: 'défaut',                classe: 'sp-src-defaut' },
  aucun:   { texte: 'rien',                  classe: 'sp-src-defaut' }
};

function pastilleOrigine(origine) {
  const o = SPONSORS_ORIGINES[origine] || SPONSORS_ORIGINES.defaut;
  return '<span class="sp-src ' + o.classe + '">' + echapper(o.texte) + '</span>';
}

async function onVerifierPublic() {
  const zone = document.getElementById('verif-public');
  const bouton = document.getElementById('bouton-verifier-public');
  zone.hidden = false;
  zone.className = 'diagnostic-remontee';
  zone.innerHTML = '<p>⏳ Lecture de l\'instantané public…</p>';
  bouton.disabled = true;

  let data = null;
  let erreur = '';
  try {
    data = await apiGet('getAll', null, { delaiMs: DELAI_SPONSORS_MS });
  } catch (err) {
    erreur = messageErreurSponsors(err, false);
  } finally {
    bouton.disabled = false;
  }

  if (!data) {
    zone.className = 'diagnostic-remontee diag-ko';
    zone.innerHTML = '<p>❌ <strong>L\'instantané public n\'a pas pu être lu.</strong> ' +
      echapper(erreur) + '</p><p class="diag-verdict">Sans lui, ni la page des scores ni le ' +
      'dossier club ne peuvent afficher de partenaire.</p>';
    return;
  }

  const reglages = sponsorsReglages(data.config || {});
  const liste = sponsorsListe(data, reglages);
  let h = '';

  // 1. L'interrupteur général. S'il est éteint, rien d'autre ne compte.
  if (!reglages.actifs) {
    h += '<p>⛔ <strong>« Afficher les partenaires » est sur « non ».</strong> Aucun partenaire ' +
      'n\'apparaît, ni sur la page des scores, ni sur le dossier club — quels que soient les ' +
      'réglages ci-dessous.</p>';
  } else {
    h += '<p>✅ <strong>« Afficher les partenaires » est actif</strong>, et l\'instantané public ' +
      'porte <strong>' + liste.length + ' partenaire(s)</strong>.</p>';
  }

  if (!liste.length) {
    h += '<p class="diag-verdict">Aucun partenaire <em>actif</em> n\'est servi. Vérifie que la ' +
      'fiche est bien enregistrée et que sa case « visible » est cochée.</p>';
    zone.className = 'diagnostic-remontee ' + (reglages.actifs ? 'diag-ko' : '');
    zone.innerHTML = h;
    return;
  }

  // 2. Partenaire par partenaire, emplacement par emplacement : la valeur SERVIE et son origine.
  h += '<table class="sp-verif"><thead><tr><th>Partenaire</th><th>Emplacement</th>' +
       '<th>Texte affiché</th><th>Taille</th><th>Disposition</th></tr></thead><tbody>';
  liste.forEach(function (s) {
    const emplacements = SPONSORS_EMPLACEMENTS.filter(function (e) {
      return sponsorsPourEmplacement([s], e).length;
    });
    if (!emplacements.length) return;
    emplacements.forEach(function (e, i) {
      const r = sponsorsReglageEmplacement(s, e);
      const muet = (r.dispo === 'seul');
      h += '<tr>' +
        (i === 0 ? '<th rowspan="' + emplacements.length + '">' + echapper(s.nom) + '</th>' : '') +
        '<td>' + echapper(SPONSORS_LIBELLES[e] || e) + '</td>' +
        '<td>' + (muet
          ? '<em>aucun — disposition « logo seul »</em>'
          : (r.texte ? echapper(r.texte) + ' ' + pastilleOrigine(r.origine.texte) : '<em>aucun</em>')) + '</td>' +
        '<td>' + Math.round(r.zoom * 100) + ' % ' + pastilleOrigine(r.origine.zoom) + '</td>' +
        '<td>' + echapper(SPONSORS_DISPO_COURT[r.dispo] || r.dispo) + ' ' +
                 pastilleOrigine(r.origine.dispo) + '</td>' +
      '</tr>';
    });
  });
  h += '</tbody></table>';

  // 3. Le bandeau du dossier club, rendu tel quel. C'est la pièce à conviction : ce bloc-ci
  //    est EXACTEMENT celui que le club voit en haut de son dossier.
  const bandeau = reglages.actifs ? sponsorsRendreDossier(liste) : '';
  h += '<p class="sp-verif-titre">En tête du dossier club, le club voit ceci :</p>';
  h += bandeau
    ? '<div class="sp-verif-dossier">' + bandeau + '</div>'
    : '<p><em>Rien — aucun partenaire n\'est coché sur l\'emplacement « F · Dossier club »' +
      (reglages.actifs ? '' : ', et l\'interrupteur général est éteint') + '.</em></p>';

  h += '<p class="diag-verdict">Ce tableau vient de l\'instantané <strong>public</strong>, pas du ' +
    'formulaire. Si une valeur que tu viens de saisir n\'apparaît pas ici, c\'est qu\'elle n\'a pas ' +
    'été enregistrée — pas que la page l\'ignore. Une valeur marquée ' +
    pastilleOrigine('defaut') + ' n\'a été saisie nulle part.</p>';

  zone.className = 'diagnostic-remontee';
  zone.innerHTML = h;
}

/**
 * Facteur de projection : « et si N personnes avaient consulté la page ? ». Les compteurs
 * mesurés portent sur UN appareil ; multiplier par N donne un ordre de grandeur.
 * Retourne 1 (aucune projection) si le champ est vide ou absurde.
 */
function facteurProjection() {
  const n = parseInt(document.getElementById('projection-appareils').value, 10);
  return (isFinite(n) && n > 1) ? n : 1;
}

function afficherBilanSponsors() {
  const zone = document.getElementById('bilan-sponsors');
  if (!zone) return;

  /* ⛔ NE JAMAIS PEINDRE LE BILAN SANS LES FICHES. Il itère sur les relevés et ne lit la liste que
     pour retrouver les noms : peint trop tôt, il affichait des identifiants techniques à la place
     des partenaires — en donnant à croire que c'est ce que le classeur contient. */
  if (typeof ressourceAdminChargee === 'function' && !ressourceAdminChargee('fichesSponsors')) {
    zone.innerHTML = '<p class="vide">Les fiches partenaires n\'ont pas pu être lues : le bilan ne ' +
      'peut pas nommer les partenaires. Utilise « Actualiser la liste » avant de revenir ici.</p>';
    return;
  }
  majSelecteurJourBilan();

  /* ⭐ « ILLISIBLE » N'EST PAS « VIDE ». Une lecture en panne et une journée sans aucun relevé
     produisent le même tableau vide ; seule la première demande de réessayer. */
  if (sponsorsRelevesEnPanne) {
    zone.innerHTML = '<p class="vide">Les relevés de visibilité n\'ont pas pu être lus. Les fiches, ' +
      'elles, sont à jour. Clique « Rafraîchir les chiffres » pour réessayer.</p>';
    return;
  }

  // Consolidé si des relevés sont remontés, sinon les compteurs du seul appareil courant.
  const consolide = !!(sponsorsConsolide && sponsorsConsolide.sessions);
  const bilan = sponsorsBilan(sponsorsToutesAdmin(), consolide ? sponsorsConsolide : null);
  const facteur = facteurProjection();
  const projection = facteur > 1;

  if (!bilan.sponsors.length) {
    zone.innerHTML =
      '<p class="vide">Aucun relevé pour l\'instant. Ouvre la page publique des scores ' +
      '(avec les partenaires activés, ou en ajoutant <code>?demo=sponsors</code> à son ' +
      'adresse) et laisse-la tourner quelques minutes. Les appareils des spectateurs ' +
      'remontent leur relevé <strong>toutes les 10 minutes</strong> et à la fermeture de ' +
      'la page — le premier chiffre met donc un moment à apparaître.</p>';
    return;
  }

  let html = '';
  if (projection) {
    html += '<p class="bilan-avertissement bilan-projection">⚠️ <strong>Projection — données simulées.</strong> ' +
      'Chiffres mesurés sur 1 appareil, multipliés par ' + facteur + '. À utiliser pour ' +
      'expliquer le dispositif, <strong>jamais</strong> comme un bilan réel envoyé à un partenaire.</p>';
  } else if (consolide) {
    html += '<p class="bilan-avertissement bilan-consolide">📡 <strong>Mesuré sur ' +
      sponsorsConsolide.appareils + ' appareil(s)</strong>, ' + sponsorsConsolide.sessions +
      ' visite(s) — relevés remontés par les navigateurs des spectateurs et consolidés ici. ' +
      'Un appareil équipé d\'un bloqueur ou fermé brutalement peut manquer à l\'appel : ' +
      'ces chiffres sont un <strong>plancher mesuré</strong>, jamais une estimation.</p>';
  } else {
    // Des relevés existent, mais pour d'AUTRES journées : le dire, plutôt que de laisser
    // croire que rien n'arrive jamais. C'est le cas typique du lendemain de tournoi.
    const autresJours = (sponsorsConsolide && sponsorsConsolide.totalToutesJournees) || 0;
    html += '<p class="bilan-avertissement">📏 <strong>Mesuré sur cet appareil seulement</strong> — ' +
      (autresJours
        ? autresJours + ' relevé(s) existent, mais <strong>aucun pour la journée en cours</strong> ' +
          '(' + echapper(String((sponsorsConsolide && sponsorsConsolide.jour) || '')) + ').'
        : 'aucun relevé n\'est encore remonté des spectateurs.') +
      ' Clique <strong>« Tester la remontée »</strong> ci-dessus : il dira en une seconde ' +
      'quel maillon de la chaîne ne répond pas.</p>';
  }

  bilan.sponsors.forEach(function (s) {
    html += ficheSponsor(s, facteur, projection, bilan.totalExpo);
  });
  zone.innerHTML = html;
}

/** Une fiche partenaire : 4 chiffres clés, la courbe horaire, la répartition par emplacement. */
function ficheSponsor(s, facteur, projection, totalExpo) {
  const expo = s.expo * facteur;
  const nomTournoi = (configCourante.global && configCourante.global.tournoi_nom) || 'Tournoi';
  const consolide = !!(sponsorsConsolide && sponsorsConsolide.sessions);
  const portee = consolide
    ? sponsorsConsolide.appareils + ' appareil(s), ' + sponsorsConsolide.sessions + ' visite(s)'
    : 'mesure sur 1 appareil';

  // ⭐ Le nom vient de l'ÉTAT COURANT de la fiche, pas du relevé : un partenaire désactivé garde son
  //   nom (plus une mention), un partenaire supprimé est annoncé comme tel — jamais un nom inventé.
  const etat = etatPartenaireBilan(s.id);

  let h = '<article class="fiche-sponsor' + (etat.supprime ? ' est-supprime' : '') + '">' +
    '<header class="fs-tete">' +
      '<span class="fs-marque">' + echapper(etat.libelle) +
        (etat.mention ? ' <span class="sp-tag sp-tag-off">' + echapper(etat.mention) + '</span>' : '') +
      '</span>' +
      '<span class="fs-qui"><b>' + echapper(nomTournoi) + '</b>' +
        '<span>Fiche de visibilité — ' + echapper(projection ? 'projection' : portee) + '</span></span>' +
    '</header>' +
    '<div class="fs-tuiles">' +
      tuileBilan(sponsorsDuree(expo), 'Exposition cumulée') +
      tuileBilan(String(Math.round(s.affichages * facteur)), 'Affichages') +
      tuileBilan(String(Math.round(s.clics * facteur)), 'Clics vers le site') +
      tuileBilan(s.partDeVoix + ' %', 'Part de voix') +
    '</div>';

  h += courbeVisibilite(s, facteur);

  // Répartition par emplacement (barres classées, une seule teinte : la longueur porte
  // la grandeur, la couleur ne code rien).
  const lignes = Object.keys(s.parEmplacement)
    .map(function (k) { return { cle: k, v: s.parEmplacement[k] }; })
    .filter(function (l) { return l.v > 0; })
    .sort(function (a, b) { return b.v - a.v; });
  if (lignes.length) {
    const maxi = lignes[0].v;
    h += '<div class="fs-fig"><span class="fs-fig-titre">D\'où vient cette exposition</span><div class="fs-rang">';
    lignes.forEach(function (l) {
      h += '<div class="fs-rang-l">' +
        '<span class="n">' + echapper(SPONSORS_LIBELLES[l.cle] || l.cle) + '</span>' +
        '<span class="p"><i style="width:' + Math.round(l.v / maxi * 100) + '%"></i></span>' +
        '<span class="v">' + echapper(sponsorsDuree(l.v * facteur)) + '</span>' +
      '</div>';
    });
    h += '</div></div>';
  }

  // Interstitiel : la durée réellement regardée et le taux de passage anticipé. Chiffre
  // inconfortable, mais c'est lui qui rend les autres crédibles.
  if (s.plein && s.plein.ouverts) {
    const moyenne = Math.round(s.plein.secondes / s.plein.ouverts * 10) / 10;
    const tauxPasse = Math.round(s.plein.passes / s.plein.ouverts * 100);
    h += '<p class="fs-note">Message plein écran : ' + s.plein.ouverts + ' affichage(s), ' +
      moyenne + ' s regardées en moyenne, ' + tauxPasse + ' % passés avant la fin.</p>';
  }

  h += '<p class="fs-methode"><strong>Méthode.</strong> Exposition mesurée côté navigateur : ' +
    'logo présent à plus de 50 % dans l\'écran, onglet actif. Les compteurs restent sur ' +
    'l\'appareil puis sont consolidés par le serveur, sans cookie ni traceur tiers. ' +
    (projection
      ? '<strong>Ces chiffres sont une PROJECTION</strong> (mesure multipliée par ' + facteur +
        '), pas un relevé d\'audience.'
      : consolide
        ? 'Relevés remontés par <strong>' + sponsorsConsolide.appareils + ' appareil(s)</strong> ' +
          'sur ' + sponsorsConsolide.sessions + ' visite(s), consolidés. Un appareil équipé d\'un ' +
          'bloqueur ou fermé brutalement peut manquer à l\'appel : <strong>ces chiffres sont un ' +
          'plancher mesuré</strong>, jamais une estimation.'
        : '<strong>Les chiffres portent sur le seul appareil qui a affiché la page</strong> : ' +
          'aucun relevé n\'est encore remonté des spectateurs.') +
    '</p></article>';
  return h;
}

function tuileBilan(valeur, libelle) {
  return '<div class="fs-tuile"><span class="v">' + echapper(valeur) + '</span>' +
    '<span class="k">' + echapper(libelle) + '</span></div>';
}

/**
 * Courbe de visibilité : minutes d'exposition par tranche de 30 minutes.
 * Série UNIQUE → teinte unique, la hauteur porte la grandeur. Étiquette directe sur le seul
 * sommet (jamais un nombre sur chaque barre), et un tableau dépliable pour l'accessibilité.
 */
function courbeVisibilite(s, facteur) {
  const cles = Object.keys(s.tranches).sort();
  if (!cles.length) return '';

  const valeurs = cles.map(function (k) { return Math.round(s.tranches[k] * facteur / 60 * 10) / 10; });
  const maxi = Math.max.apply(null, valeurs);
  if (!maxi) return '';

  let barres = '', axe = '', table = '';
  cles.forEach(function (k, i) {
    const v = valeurs[i];
    const pic = (v === maxi);
    barres += '<div class="fs-barre' + (pic ? ' pic' : '') + '" style="height:' +
      Math.max(2, Math.round(v / maxi * 100)) + '%" title="' + echapper(k + ' — ' + v + ' min') + '">' +
      (pic ? '<span class="fs-etiq">' + v + '</span>' : '') + '</div>';
    axe += '<span' + (i % 2 ? ' class="creux"' : '') + '>' + echapper(k) + '</span>';
    table += '<tr><td>' + echapper(k) + '</td><td>' + v + '</td></tr>';
  });

  return '<div class="fs-fig">' +
    '<span class="fs-fig-titre">Visibilité au fil de la journée</span>' +
    '<span class="fs-fig-sous">Minutes d\'exposition, par tranche de 30 minutes</span>' +
    '<div class="fs-histo" role="img" aria-label="Exposition par tranche de 30 minutes, de ' +
      echapper(cles[0]) + ' à ' + echapper(cles[cles.length - 1]) + ', maximum ' + maxi + ' minutes.">' +
      barres + '</div>' +
    '<div class="fs-axe">' + axe + '</div>' +
    '<details class="fs-table"><summary>Voir les données en tableau</summary>' +
      '<table class="table-planning"><thead><tr><th>Tranche</th><th>Minutes</th></tr></thead>' +
      '<tbody>' + table + '</tbody></table></details>' +
  '</div>';
}

/** Export CSV : le tableur du partenaire, ou le tien pour comparer les éditions. */
function onExporterBilanCsv() {
  const consolide = !!(sponsorsConsolide && sponsorsConsolide.sessions);
  // ⭐ TOUTES les fiches, comme à l'écran : un partenaire désactivé garde son nom dans le tableur.
  const bilan = sponsorsBilan(sponsorsToutesAdmin(), consolide ? sponsorsConsolide : null);
  const facteur = facteurProjection();
  const lignes = [['partenaire', 'etat_fiche', 'exposition_secondes', 'affichages', 'clics', 'part_de_voix_pct',
                   'plein_ouverts', 'plein_secondes', 'plein_passes', 'mesure']];
  bilan.sponsors.forEach(function (s) {
    const etat = etatPartenaireBilan(s.id);
    lignes.push([
      etat.libelle,
      etat.supprime ? 'supprimee' : (etat.mention ? 'masquee' : 'active'),
      Math.round(s.expo * facteur),
      Math.round(s.affichages * facteur),
      Math.round(s.clics * facteur),
      s.partDeVoix,
      s.plein.ouverts, s.plein.secondes, s.plein.passes,
      facteur > 1 ? ('projection x' + facteur)
        : (consolide ? (sponsorsConsolide.appareils + ' appareils') : '1 appareil')
    ]);
  });
  const csv = lignes.map(function (l) {
    return l.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';');
  }).join('\n');

  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  lien.download = 'visibilite-partenaires-' + bilan.jour + '.csv';
  lien.click();
  URL.revokeObjectURL(lien.href);
}

async function onViderBilan() {
  const message = document.getElementById('message-sponsors-bilan');
  await avecActionSponsors(document.getElementById('bouton-vider-bilan'), message, async function () {
    const ok = await dialogConfirmer('Effacer TOUS les relevés de visibilité ?\n\n' +
      'Cette action est définitive. Les fiches partenaires sont conservées.', { ok: 'Effacer', danger: true });
    if (!ok) { afficherMessage(message, 'Effacement annulé.', 'ok'); return; }
    const r = verifierReponseSponsors(await apiPostProtege('viderMesuresSponsors', {}, 'admin', 'admin', { delaiMs: DELAI_SPONSORS_MS }));
    sponsorsRemettreAZero();
    afficherMessage(message, '✅ Relevés effacés' + (r.effaces ? ' (' + r.effaces + ').' : '.'), 'ok');
    /* ⭐ PLUS DE SECONDE REQUÊTE. L'état vide est PROUVÉ par le serveur sous le verrou et joint à la
       réponse ; l'écran le pose directement. ⛔ Repli sur une relecture si le backend est d'avant ce
       lot (réponse sans `releves`). */
    if (Array.isArray(r.releves)) {
      appliquerRelevesSponsors(r);
      sponsorsJourBilan = '';
      majSelecteurJourBilan();
      if (typeof marquerRessourceAdmin === 'function') marquerRessourceAdmin('relevesSponsors', true);
      afficherBilanSponsors();
    } else {
      chargerMesuresSponsors().catch(function () {
        afficherMessage(message, 'Relevés effacés. Actualise les chiffres pour vérifier le bilan.', 'ko');
      });
    }
  }, 'Effacement…');
}

document.addEventListener('DOMContentLoaded', initAdminSponsors);
