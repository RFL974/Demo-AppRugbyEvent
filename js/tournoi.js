/**
 * ============================================================================
 *  LE TOURNOI — page publique unique (lecture seule)
 * ============================================================================
 *
 *  Regroupe en 2 onglets ce qui était auparavant 3 pages séparées :
 *   • 📋 Mon équipe  — sélection d'une équipe → ses matchs + ses classements (onglet par défaut)
 *   • 🏆 Classements — derniers scores du tournoi, puis poules (matin) + niveaux croisés (après-midi)
 *
 *  Un SEUL appel réseau et un SEUL rafraîchissement auto (~15 s) alimentent les 2 vues.
 *  Barème partout identique au backend : V=3 / N=2 / D=1, départage par la différence
 *  (BP − BC) puis les points marqués ; seuls les matchs « terminé » comptent.
 *
 *  ⭐ LA LECTURE PASSE PAR `getPublic`, L'ÉTAT PUBLIC AUTORITAIRE — jamais par `getAll`.
 *
 *  🔬 CE QUE CETTE PAGE FAISAIT AVANT, et pourquoi c'était faux. Elle lisait `getAll`, qui livre
 *  le tournoi ENTIER quel que soit son état, et c'est `appliquerPublication()` — ICI, dans le
 *  navigateur — qui masquait l'écran quand `tournoi_publie` valait autre chose que « oui ».
 *  Mesuré sur le backend figé `e1c96067`, tournoi NON PUBLIÉ : 21 équipes, 8 poules, 34 matchs
 *  AVEC LEURS 34 SCORES, 3 partenaires, livrés à qui demandait. ⛔ Masquer n'est pas protéger :
 *  l'adresse du backend est dans `js/config.js`, que n'importe qui peut lire.
 *
 *  ⭐ CE QUE `getPublic` CHANGE ICI, en quatre points :
 *   ① L'ÉTAT EST DÉCIDÉ PAR LE SERVEUR. Tournoi non publié ⇒ la réponse ne PORTE rien. Il n'y a
 *      plus rien à masquer, donc plus rien à oublier de masquer.
 *   ② LA RÉPONSE SE DÉCRIT (contrat, version, édition, `genere_le`, `servi_le`) : la page sait
 *      l'ÂGE de ce qu'elle montre, et le dit quand il n'est plus frais.
 *   ③ LE RAFRAÎCHISSEMENT EST MONOTONE : une réponse plus ANCIENNE que celle déjà appliquée est
 *      ÉCARTÉE — c'est la course que deux requêtes concurrentes créent sur un réseau mobile.
 *   ④ L'ÉCHEC EST FERMÉ : un backend trop ancien ne connaît pas `getPublic` et répond « action
 *      inconnue ». La page le DIT et n'affiche rien. ⛔ Elle ne retombe JAMAIS sur `getAll`, qui
 *      livrerait précisément ce que le contrat vient de fermer.
 *
 *  ⛔ AUCUNE ÉCRITURE. Cette page ne déclenche ni écriture Sheets, ni écriture Drive, ni propriété,
 *  ni télémétrie persistante. Le relevé de visibilité des partenaires (`mesureSponsors`) N'EST
 *  PLUS ARMÉ ici, et la porte est fermée côté serveur (voir `doPost`).
 *
 *  Nécessite (chargés AVANT ce fichier) : config.js puis api.js.
 * ============================================================================
 */

let equipes = [];
let matchs = [];
let config = { global: {} };
let sponsors = [];                  // partenaires actifs (servis par l'instantané)
let sponsorsReg = null;             // réglages d'affichage normalisés
let sponsorFil = null;              // partenaire de l'encart au fil — FIGÉ pour la session
let sponsorFilCompte = false;       // son affichage n'est compté qu'une fois
let sponsorsSignature = '';         // évite de redessiner (et de relancer la rotation) pour rien
let sponsorPleinFait = false;       // l'interstitiel ne se joue qu'au chargement, jamais sur un refresh
let nomParEquipe = {};       // index id_equipe → nom (reconstruit à chaque chargement)
let derniereSignature = '';
let categorieActive = '';
let minuteurRafraichissement = null; // minuteur du prochain rafraîchissement (null = en pause)
const CLE_EQUIPE = 'r92_mon_equipe';
const CLE_CATEGORIE = 'r92_ma_categorie';
const INTERVALLE_MS = 15000; // rafraîchissement auto ~15 s (marge sous le plafond Apps Script)
const JITTER_MS = 4000;      // étalement aléatoire : évite que tous les spectateurs appellent en même temps
const DELAI_REQUETE_MS = 12000; // délai max d'une requête : au-delà on abandonne (réseau mobile qui « pend »)

/* ==========================================================================
   L'ÉTAT PUBLIC AUTORITAIRE — une seule vérité pour les DEUX onglets et TOUTES les commandes
   ========================================================================== */

/** Le nom du contrat servi par `getPublic`. ⛔ Une réponse qui ne le porte pas est REFUSÉE. */
const CONTRAT_PUBLIC = 'public-1';

/** Au-delà de cet âge, le contenu affiché est annoncé comme ANCIEN plutôt que présenté comme frais. */
const AGE_ANCIEN_S = 90;

/**
 * L'état courant, en une seule structure — parce que « les deux onglets et toutes les commandes
 * doivent refléter le même état ». ⛔ Aucune vue ne décide plus seule de ce qu'elle montre.
 *   phase   : 'chargement' | 'publie' | 'non_publie' | 'erreur' | 'incompatible'
 *   ancien  : le contenu à l'écran vient d'une réponse ANTÉRIEURE (hors ligne, échec de
 *             rafraîchissement, réponse écartée) — il n'est PAS présenté comme courant.
 */
let etatPublic = { phase: 'chargement', motif: '', source: '', version: '', edition: '',
                   genereLe: '', ageS: null, ancien: false, detail: '' };

/** L'instant de génération DÉJÀ APPLIQUÉ, en millisecondes. ⛔ Le rafraîchissement est MONOTONE :
 *  une réponse plus ancienne que celle-ci n'écrase jamais ce qui est à l'écran. */
let derniereGenereMs = -1;
let derniereRequetePublique = 0;

/** Vrai dès qu'un contenu honnête a été rendu au moins une fois (sert à distinguer
 *  « rien n'a jamais marché » de « ça marchait, et le réseau vient de tomber »). */
let contenuRendu = false;

/* ==========================================================================
   DÉMARRAGE / NAVIGATION
   ========================================================================== */

async function initTournoi() {
  const onglets = Array.prototype.slice.call(document.querySelectorAll('.onglet[data-onglet]'));
  onglets.forEach(function (b, i) {
    b.addEventListener('click', function () { basculer(b.getAttribute('data-onglet')); });
    /* ⭐ NAVIGATION AU CLAVIER DU MODÈLE `tablist` (pratique ARIA) : ← → circulent d'un onglet à
       l'autre en BOUCLE, Début et Fin vont aux extrémités. ⛔ Le déplacement ACTIVE l'onglet et
       lui donne le focus : c'est la variante « sélection automatique », cohérente avec deux
       onglets dont le contenu est déjà chargé — rien n'est téléchargé par un coup de flèche. */
    b.addEventListener('keydown', function (e) {
      let cible = -1;
      if (e.key === 'ArrowRight') cible = (i + 1) % onglets.length;
      else if (e.key === 'ArrowLeft') cible = (i - 1 + onglets.length) % onglets.length;
      else if (e.key === 'Home') cible = 0;
      else if (e.key === 'End') cible = onglets.length - 1;
      if (cible === -1) return;
      e.preventDefault();
      basculer(onglets[cible].getAttribute('data-onglet'));
      onglets[cible].focus();
    });
  });
  document.getElementById('btn-refresh').addEventListener('click', onRafraichir);
  const reessayer = document.getElementById('btn-reessayer');
  if (reessayer) reessayer.addEventListener('click', reprendreMaintenant);

  /* ⭐ RETOUR EN LIGNE : le navigateur le dit, on reprend TOUT DE SUITE plutôt que d'attendre le
     prochain tour de boucle. ⛔ Par `reprendreMaintenant`, qui COALESCE : voir sa raison d'être. */
  window.addEventListener('online', reprendreMaintenant);
  window.addEventListener('offline', function () {
    if (!contenuRendu) return;
    etatPublic.ancien = true;
    etatPublic.detail = 'Appareil hors ligne.';
    rendreEtat();
  });

  const sel = document.getElementById('select-equipe');
  sel.addEventListener('change', function () {
    localStorage.setItem(CLE_EQUIPE, sel.value);
    afficherEquipe();
  });

  // Filtre catégorie global : repeuple les équipes et réaffiche les deux onglets.
  document.getElementById('select-categorie').addEventListener('change', function (e) {
    categorieActive = e.target.value;
    localStorage.setItem(CLE_CATEGORIE, categorieActive);
    peuplerSelect();   // limite les équipes à la catégorie choisie
    afficherTout();
  });

  // ⚡ Onglet remis au premier plan (téléphone déverrouillé, retour depuis une autre
  // appli) : on recharge TOUT DE SUITE (données fraîches sans attendre jusqu'à ~19 s)
  // et on relance le rafraîchissement automatique s'il s'était mis en pause.
  // Le garde-fou « minuteur déjà en place » empêche de lancer deux boucles en parallèle.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    reprendreMaintenant();
  });

  await charger(true);
  planifierProchainChargement();
}

/**
 * ⭐ REPRENDRE MAINTENANT — le point d'entrée UNIQUE des reprises immédiates (retour au premier
 * plan, retour en ligne, bouton « Réessayer »).
 *
 * 🔬 LE DÉFAUT FERMÉ. Chacun de ces trois signaux appelait directement `planifierProchainChargement(0)`.
 * Or ils arrivent VOLONTIERS ENSEMBLE : déverrouiller un téléphone dans le tunnel qui sort, c'est
 * `visibilitychange` PUIS `online` à quelques millisecondes d'intervalle, et un lecteur impatient y
 * ajoute son clic. Mesuré au banc : trois signaux d'affilée = TROIS requêtes, pour un seul besoin.
 * ⭐ La reprise est donc COALESCÉE : tant qu'une reprise immédiate est armée ou qu'un chargement est
 * en vol, un signal de plus ne fait RIEN. ⛔ Ce n'est pas un anti-rebond par minuterie : il n'y a
 * aucun délai à choisir, donc aucun délai à se tromper.
 */
let repriseArmee = false;
let chargementEnCours = false;
function reprendreMaintenant() {
  if (repriseArmee || chargementEnCours) return;
  repriseArmee = true;
  planifierProchainChargement(0);
}

/**
 * Planifie le prochain rafraîchissement automatique avec un ÉTALEMENT aléatoire (jitter) :
 * chaque spectateur poll à un instant légèrement différent, ce qui évite les pics où les
 * 1300 appellent le serveur à la même seconde. On enchaîne APRÈS la fin du chargement
 * précédent (pas de setInterval) pour ne jamais empiler les requêtes.
 *
 * ⚡ PAUSE EN ARRIÈRE-PLAN : si l'onglet est caché au moment de recharger (téléphone
 * verrouillé, autre appli ouverte), on NE recharge PAS et on arrête la boucle — personne
 * ne regarde, autant épargner le serveur (des centaines de téléphones « en poche » qui
 * appelleraient pour rien) et la batterie. Le retour au premier plan relance immédiatement
 * (écouteur visibilitychange posé dans initTournoi).
 *
 * @param {number} [delaiMs] délai imposé (ex : 0 pour une reprise immédiate) ;
 *                           sans argument → intervalle normal + étalement aléatoire.
 */
function planifierProchainChargement(delaiMs) {
  const delai = (delaiMs != null) ? delaiMs : INTERVALLE_MS + Math.floor(Math.random() * JITTER_MS);
  /* ⛔ ANTI-TEMPÊTE : un minuteur déjà posé est ANNULÉ avant d'en poser un autre. Sans cette
     ligne, « retour au premier plan » + « retour en ligne » + « Réessayer » en quelques secondes
     laisseraient tourner trois boucles en parallèle, chacune rappelant la suivante. */
  if (minuteurRafraichissement != null) clearTimeout(minuteurRafraichissement);
  minuteurRafraichissement = setTimeout(function () {
    repriseArmee = false;
    if (document.hidden) { minuteurRafraichissement = null; return; } // pause (reprise au retour)
    chargementEnCours = true;
    Promise.resolve(charger(false)).finally(function () {
      chargementEnCours = false;
      planifierProchainChargement();
    });
  }, delai);
}

/** Bascule d'onglet : montre une vue, cache l'autre, et tient le modèle ARIA à jour. */
function basculer(cible) {
  document.querySelectorAll('.onglet[data-onglet]').forEach(function (b) {
    const actif = b.getAttribute('data-onglet') === cible;
    b.classList.toggle('actif', actif);
    b.setAttribute('aria-selected', actif ? 'true' : 'false');
    /* ⛔ UN SEUL ARRÊT DE TABULATION dans le groupe d'onglets : la tabulation entre DANS le
       groupe puis en SORT vers le panneau, au lieu de traverser chaque onglet un par un. */
    b.setAttribute('tabindex', actif ? '0' : '-1');
  });
  const titreVue = document.getElementById('cv-public-titre');
  if (titreVue) titreVue.textContent = cible === 'classements' ? 'Classements' : 'Mon équipe';
  document.getElementById('vue-equipe').hidden = (cible !== 'equipe');
  const choix = document.getElementById('cv-choix-equipe');
  if (choix) choix.hidden = (cible !== 'equipe');
  document.getElementById('vue-classements').hidden = (cible !== 'classements');
  // ⛔ Le filtre de catégorie du haut de page ferait DOUBLON avec celui de la barre des
  //    classements — même variable derrière les deux. Il s'efface ici et reste sur « Mon
  //    équipe », où rien d'autre ne le porte. Une seule catégorie → masqué dans les deux cas.
  const filtreCat = document.getElementById('filtre-categorie');
  if (filtreCat) filtreCat.hidden = (cible === 'classements') || categoriesPresentes().length <= 1;
}

/**
 * Une réponse porte-t-elle bien le CONTRAT PUBLIC ? ⛔ Contrôle de FORME, jamais de confiance :
 * un corps qui n'a pas le bon contrat, pas de version, ou pas ses deux tableaux, n'est pas un état
 * public — il est REFUSÉ, qu'il vienne du serveur, du relais ou d'un JSON tronqué à mi-chemin.
 */
function estEtatPublicValide(d) {
  const genere = horodatageMs(d && d.genere_le);
  const servi = horodatageMs(d && d.servi_le);
  return !!d && typeof d === 'object' && d.contrat === CONTRAT_PUBLIC &&
         typeof d.public === 'boolean' && typeof d.version === 'string' && d.version !== '' &&
         Array.isArray(d.equipes) && Array.isArray(d.matchs) && !!d.config &&
         genere >= 0 && servi >= genere;
}

/** Un horodatage ISO en millisecondes, ou -1 s'il est absent ou illisible. ⛔ Jamais 0 : `Date.parse`
 *  rend NaN sur une chaîne vide, et NaN comparé à n'importe quoi est toujours faux. */
function horodatageMs(iso) {
  const t = Date.parse(String(iso || ''));
  return isFinite(t) ? t : -1;
}

/**
 * L'ÂGE d'une réponse, en secondes, MESURÉ PAR LE SERVEUR : `servi_le` − `genere_le`, deux instants
 * de la MÊME horloge. ⛔ On ne compare jamais l'horloge du téléphone à celle du serveur : un
 * appareil déréglé de vingt minutes ferait déclarer « ancien » un contenu parfaitement frais.
 */
function ageReponseS(d) {
  const g = horodatageMs(d && d.genere_le), v = horodatageMs(d && d.servi_le);
  return (g >= 0 && v >= 0) ? Math.max(0, Math.round((v - g) / 1000)) : null;
}

/** Pourquoi le relais a été écarté lors de la dernière lecture ('' = il ne l'a pas été). */
let relaisEcarte = '';

/**
 * Le relais CDN, SI et SEULEMENT SI il est utilisable. ⛔ Il n'est plus « cru sur parole » :
 * 🔬 LE DÉFAUT FERMÉ. L'ancienne lecture acceptait le relais dès qu'il rendait un corps avec un
 * champ `matchs`. Un relais périmé, ou servant une AUTRE ÉDITION, passait donc pour la source
 * courante — silencieusement, et de préférence au serveur, qui était plus récent.
 * ⭐ Quatre refus, et chacun est NOMMÉ (le repli n'est jamais muet) :
 *   · `contrat`     — le corps ne porte pas le contrat public ;
 *   · `ancien`      — sa génération est ANTÉRIEURE à ce qui est déjà à l'écran ;
 *   · `edition`     — il décrit une AUTRE édition que celle en cours ;
 *   · `injoignable` — rejet réseau, statut non-2xx, JSON illisible, ou trop lent.
 * ⚠️ Le relais est DÉSACTIVÉ dans la configuration Démo Racing (`SNAPSHOT_URL` vide) : ce chemin
 * n'y est jamais emprunté. Il reste éprouvé par des doubles, jamais contre un relais réel.
 */
async function lireRelais() {
  try {
    const controleur = new AbortController();
    const minuteur = setTimeout(function () { controleur.abort(); }, DELAI_REQUETE_MS);
    try {
      const r = await fetch(SNAPSHOT_URL, { signal: controleur.signal });
      if (!r.ok) { relaisEcarte = 'injoignable'; return null; }
      const d = await r.json();
      if (!estEtatPublicValide(d)) { relaisEcarte = 'contrat'; return null; }
      const ms = horodatageMs(d.genere_le);
      if (ms >= 0 && ms < derniereGenereMs) { relaisEcarte = 'ancien'; return null; }
      if (etatPublic.edition && d.edition && d.edition !== etatPublic.edition) {
        relaisEcarte = 'edition'; return null;
      }
      return { data: d, source: 'relais' };
    } finally { clearTimeout(minuteur); }
  } catch (e) { relaisEcarte = 'injoignable'; return null; }
}

/**
 * Lit l'ÉTAT PUBLIC AUTORITAIRE : le relais s'il est utilisable, sinon le serveur.
 *
 * ⛔ IL N'Y A PAS DE REPLI SUR `getAll`, et c'est le cœur de ce lot : un backend trop ancien ne
 * connaît pas `getPublic` et répond « Action inconnue » — la page ÉCHOUE ALORS, FERMÉE. Retomber
 * sur `getAll` livrerait exactement le tournoi non publié que le contrat vient de fermer.
 *
 * ⚡ Chaque requête a un DÉLAI MAXIMUM (DELAI_REQUETE_MS) : au-delà, elle est abandonnée. Sans ça,
 * une connexion mobile qui « pend » gèlerait la boucle (elle n'enchaîne qu'après la précédente).
 */
async function lireEtatPublic() {
  relaisEcarte = '';
  if (typeof SNAPSHOT_URL === 'string' && SNAPSHOT_URL && etatPublic.edition) {
    const viaRelais = await lireRelais();
    if (viaRelais) return viaRelais;
  }
  const d = await apiGet('getPublic', null, { delaiMs: DELAI_REQUETE_MS });
  return { data: d, source: 'serveur' };
}

/**
 * (Re)charge l'état public. ⭐ TOUTE issue passe par ici, et AUCUNE ne se tait :
 *   · réponse valide PLUS RÉCENTE  → elle est appliquée (publiée ou non publiée) ;
 *   · réponse valide PLUS ANCIENNE → ÉCARTÉE ; l'écran garde ce qu'il montrait, ANNONCÉ comme tel ;
 *   · réponse invalide / tronquée  → échec, jamais confondu avec un tournoi vide ;
 *   · action inconnue du serveur   → échec FERMÉ, explicite (backend trop ancien) ;
 *   · réseau perdu                 → échec ; le contenu déjà obtenu reste, ANNONCÉ comme ancien.
 * ⛔ Ne ré-affiche que si le contenu a changé (évite le clignotement toutes les ~15 s).
 */
async function charger(premier) {
  const requete = ++derniereRequetePublique;
  let lu;
  try {
    lu = await lireEtatPublic();
  } catch (err) {
    if (requete !== derniereRequetePublique) return;
    return echecChargement(err, premier);
  }

  if (requete !== derniereRequetePublique) return;

  const d = lu.data;
  if (!estEtatPublicValide(d)) {
    /* ⛔ UNE RÉPONSE ILLISIBLE N'EST PAS UN TOURNOI VIDE. Un `{error}` du serveur, un JSON tronqué
       par une coupure, un corps d'une autre forme : tous arrivent ici, et tous DISENT ce qu'ils
       sont. Sans ce chemin, `d.equipes || []` aurait affiché « aucun match » — un mensonge. */
    return echecChargement(Object.assign(
      new Error(String((d && d.error) || 'Réponse illisible du serveur.')),
      { reponse: d }), premier);
  }

  /* ⛔ MONOTONIE — la course que deux requêtes concurrentes créent sur un réseau mobile : la
     seconde part avant que la première soit revenue, et la PREMIÈRE arrive en dernier. Sans cette
     garde, un état plus ANCIEN écraserait un état plus récent déjà à l'écran. */
  const ms = horodatageMs(d.genere_le);
  if (derniereGenereMs >= 0 &&
      (ms < derniereGenereMs ||
       (ms === derniereGenereMs && d.version !== etatPublic.version && lu.source !== 'serveur'))) {
    etatPublic.ancien = true;
    etatPublic.detail = 'Une réponse plus ancienne que l’affichage a été écartée.';
    rendreEtat();
    return;
  }

  /* ⭐ CHANGEMENT D'ÉDITION : rien de l'édition précédente ne survit — ni l'équipe choisie, ni la
     catégorie, ni le partenaire de l'encart au fil, ni la signature qui évite les redessins. */
  if (etatPublic.edition && d.edition && d.edition !== etatPublic.edition) reprendreEdition();

  if (ms >= 0) derniereGenereMs = ms;
  appliquerEtatPublic(d, lu.source, premier);
}

/** Repart d'une page vierge : appelé quand le serveur annonce une AUTRE édition. */
function reprendreEdition() {
  derniereSignature = '';
  sponsorFil = null;
  sponsorsSignature = '';
  categorieActive = '';
  pubCreneau = 'matin';
  pubPoule = '';
}

/**
 * Applique un état public VALIDE et AU MOINS AUSSI RÉCENT que l'affichage courant.
 * ⛔ Quand le serveur annonce « non publié » (jamais publié, ou MASQUÉ après l'avoir été),
 * l'interface est EFFACÉE : listes vidées, partenaires éteints, filtres remis à zéro. Il ne reste
 * rien d'une édition visible cinq secondes plus tôt.
 */
function appliquerEtatPublic(d, source, premier) {
  etatPublic = {
    phase: d.public ? 'publie' : 'non_publie',
    motif: String(d.motif || ''), source: source, version: String(d.version || ''),
    edition: String(d.edition || ''), genereLe: String(d.genere_le || ''),
    ageS: ageReponseS(d), ancien: false,
    detail: relaisEcarte ? motifRelais(relaisEcarte) : ''
  };

  if (!d.public) {
    /* EFFACEMENT. ⛔ On ne se contente pas de masquer : les données sortent de la mémoire de la
       page, pour qu'aucun rendu ultérieur ne puisse les faire revenir. */
    equipes = []; matchs = []; sponsors = []; sponsorFil = null;
    config = d.config || { global: {} };
    nomParEquipe = {};
    derniereSignature = '';
    sponsorsReg = sponsorsReglages(config);
    peuplerCategorie();
    peuplerSelect();
    afficherTout();
    appliquerPublication();
    appliquerSponsors(premier);
    rendreEtat();
    contenuRendu = true;
    return;
  }

  const signature = JSON.stringify(d.matchs) + '|' + JSON.stringify(d.equipes);
  equipes = d.equipes;
  matchs = d.matchs;
  config = d.config || { global: {} };
  nomParEquipe = indexerNoms(equipes); // index id → nom (O(1)), reconstruit à chaque chargement
  majTitre(); // le bandeau prend le nom de l'événement s'il est renseigné

  // Partenaires : réglages + liste, AVANT l'affichage (l'encart au fil s'insère dans les vues).
  sponsorsReg = sponsorsReglages(config);
  sponsors = sponsorsReg.actifs ? sponsorsListe(d, sponsorsReg) : [];
  // L'encart au fil est tiré UNE FOIS pour toute la session : il ne doit pas changer sous les
  // yeux du lecteur à chaque rafraîchissement automatique (toutes les ~15 s).
  if (sponsors.length && !sponsorFil) {
    sponsorFil = sponsorsTirer('fil', sponsorsPourEmplacement(sponsors, 'fil'), true);
  }
  if (!sponsors.length) sponsorFil = null;

  if (premier || signature !== derniereSignature) {
    derniereSignature = signature;
    peuplerCategorie();
    peuplerSelect();
    afficherTout();
  }
  appliquerPublication();
  appliquerSponsors(premier);
  rendreEtat();
  contenuRendu = true;
}

/** Le motif, en clair, pour lequel le relais a été écarté au profit du serveur. */
function motifRelais(code) {
  if (code === 'ancien') return 'Le relais servait une version plus ancienne : lecture directe du serveur.';
  if (code === 'edition') return 'Le relais servait une autre édition : lecture directe du serveur.';
  if (code === 'contrat') return 'Le relais ne sert pas le contrat attendu : lecture directe du serveur.';
  if (code === 'injoignable') return 'Relais injoignable : lecture directe du serveur.';
  return '';
}

/**
 * Une lecture a échoué. ⭐ DEUX SITUATIONS, qu'il serait malhonnête de confondre :
 *  · rien n'a JAMAIS été affiché → écran d'indisponibilité explicite, avec un bouton « Réessayer » ;
 *  · un contenu EST à l'écran    → il reste, mais il est ANNONCÉ comme non actualisé, avec son
 *    heure. ⛔ Jamais présenté comme courant, et l'horodatage n'avance pas.
 */
function echecChargement(err, premier) {
  const message = String((err && err.message) || 'Erreur inconnue.');
  const ferme = /action inconnue/i.test(message);
  etatPublic.detail = ferme
    ? 'Le serveur ne connaît pas encore l’affichage public de ce tournoi (version trop ancienne).'
    : message;
  if (contenuRendu && !premier) {
    etatPublic.ancien = true;      // ⛔ le contenu reste, sa fraîcheur non
    rendreEtat();
    return;
  }
  etatPublic.phase = ferme ? 'incompatible' : 'erreur';
  etatPublic.ancien = false;
  appliquerPublication();
  rendreEtat();
}

/** Réaffiche les deux vues d'un coup (+ le podium, commun aux deux onglets). */
function afficherTout() {
  afficherPodium();
  afficherEquipe();
  afficherClassements();
}

/**
 * Affiche le podium dans l'encadré commun (visible sur les deux onglets), pour la
 * catégorie active — mais UNIQUEMENT s'il est mathématiquement certain (cf. podiumCertain).
 */
function afficherPodium() {
  const zone = document.getElementById('podium');
  if (!zone) return;
  const top = estPublie() ? podiumCertain(categorieActive) : null;
  if (!top) { zone.hidden = true; zone.innerHTML = ''; return; }

  const medailles = ['🥇', '🥈', '🥉'];
  let html = '<div class="podium-titre">🏆 Podium' +
    (categorieActive ? ' <span class="podium-cat">' + echapper(categorieActive) + '</span>' : '') + '</div>';
  top.forEach(function (t, i) {
    html += '<div class="podium-ligne podium-' + (i + 1) + '">' +
      '<span class="podium-rang">' + medailles[i] + '</span>' +
      '<span class="podium-nom">' + echapper(t.nom) + '</span>' +
    '</div>';
  });
  zone.innerHTML = html;
  zone.hidden = false;
}

/** Vrai si le tournoi est publié (rendu visible depuis l'admin). */
/**
 * Le tournoi est-il publié ? ⭐ LA RÉPONSE VIENT DE L'ÉTAT AUTORITAIRE, plus de la charge.
 * ⛔ Avant, cette fonction lisait `config.global.tournoi_publie` — un champ que le serveur
 * envoyait AVEC toutes les données. Le décider ici revenait à demander au renard s'il était
 * dans le poulailler. Désormais le serveur ne livre rien à masquer, et cette fonction ne fait
 * que relire ce qu'il a DÉCIDÉ.
 */
function estPublie() {
  return etatPublic.phase === 'publie';
}

/**
 * Accorde TOUTE l'interface sur l'état autoritaire — les deux onglets, la barre, les filtres, le
 * podium, l'écran « à venir » et l'écran d'indisponibilité. ⛔ Un seul endroit décide : il ne peut
 * donc plus y avoir un onglet qui montre un tournoi et un autre qui montre autre chose.
 */
function appliquerPublication() {
  const phase = etatPublic.phase;
  const pub = phase === 'publie';
  const enPanne = (phase === 'erreur' || phase === 'incompatible');

  const indispo = document.getElementById('tournoi-indispo');
  if (indispo) {
    indispo.hidden = !enPanne;
    const texte = document.getElementById('indispo-texte');
    if (texte) {
      texte.textContent = phase === 'incompatible'
        ? 'Le serveur du tournoi est dans une version trop ancienne pour cette page. ' +
          'Rien ne peut être affiché — et surtout pas un tournoi qui n’est peut-être pas publié.'
        : 'Les données du tournoi n’ont pas pu être chargées. Vérifie ta connexion, puis réessaie. ' +
          'Détail : ' + (etatPublic.detail || 'erreur inconnue');
    }
  }

  /* ⛔ « À venir » NE S'AFFICHE QUE SUR UN VERDICT DU SERVEUR — jamais sur une panne. Une erreur
     qui ressemblerait à « le tournoi arrive bientôt » serait un mensonge de plus. */
  document.getElementById('tournoi-avenir').hidden = (phase !== 'non_publie');

  document.querySelector('.live-barre').hidden = !pub;
  document.querySelector('.onglets').hidden = !pub;
  document.getElementById('vues').hidden = !pub;
  const choix = document.getElementById('cv-choix-equipe');
  if (choix) choix.hidden = !pub || document.getElementById('vue-equipe').hidden;
  // Le podium : masqué hors publication ; sinon c'est afficherPodium qui décide (certitude).
  if (!pub) { const pod = document.getElementById('podium'); if (pod) pod.hidden = true; }
  // Le filtre catégorie : masqué hors publication ; sinon c'est peuplerCategorie qui décide.
  if (!pub) document.getElementById('filtre-categorie').hidden = true;
}

/**
 * Écrit le bandeau d'état — la SEULE phrase qui dise au lecteur ce qu'il regarde vraiment.
 * ⭐ Il est dans une région `role="status" aria-live="polite"` : un lecteur d'écran l'annonce
 * sans voler le focus, ce qui couvre « chargement », « erreur », « ancienneté » et « masquage ».
 */
function rendreEtat() {
  const zone = document.getElementById('etat-public');
  if (!zone) return;
  const parts = [];

  if (etatPublic.phase === 'erreur' || etatPublic.phase === 'incompatible') {
    parts.push(etatPublic.phase === 'incompatible'
      ? '⛔ Affichage public indisponible : serveur trop ancien.'
      : '⛔ Chargement impossible.');
  } else if (etatPublic.ancien) {
    /* ⭐ L'AVERTISSEMENT EXPLICITE. Un contenu obtenu plus tôt et affiché hors ligne DOIT être
       annoncé comme tel : c'est la différence entre « voici le score » et « voici le score
       d'il y a dix minutes ». */
    parts.push('⚠️ Hors ligne ou serveur injoignable — affichage non actualisé' +
      (etatPublic.genereLe ? ' (données de ' + heureCourte(etatPublic.genereLe) + ')' : '') + '.');
    if (etatPublic.detail) parts.push(etatPublic.detail);
  } else if (etatPublic.phase === 'non_publie') {
    parts.push('Le tournoi n’est pas publié : aucune donnée n’est disponible.');
  } else if (etatPublic.phase === 'publie') {
    if (etatPublic.ageS != null && etatPublic.ageS > AGE_ANCIEN_S) {
      parts.push('⚠️ Données servies par un cache : ' + etatPublic.ageS + ' s d’ancienneté.');
    }
    if (etatPublic.detail) parts.push(etatPublic.detail);
  }

  zone.textContent = parts.join(' ');
  zone.hidden = parts.length === 0;
  zone.classList.toggle('etat-alerte',
    etatPublic.ancien || etatPublic.phase === 'erreur' || etatPublic.phase === 'incompatible');
  majHeure();
}

/** « 14:32 » à partir d'un horodatage ISO ; '' s'il est illisible. */
function heureCourte(iso) {
  const ms = horodatageMs(iso);
  if (ms < 0) return '';
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* ==========================================================================
   PARTENAIRES (sponsors) — emplacements A, B, D, E
   --------------------------------------------------------------------------
   L'emplacement C (encart au fil) est inséré directement dans les vues, par
   afficherEquipe et afficherClassements. Tout le moteur est dans sponsors.js.
   ========================================================================== */

/**
 * Dessine (ou efface) les emplacements partenaires. Les zones A, B et E ne sont redessinées
 * QUE si la composition change : sinon chaque rafraîchissement automatique relancerait la
 * rotation du rail depuis le début et regonflerait le compteur d'affichages.
 *
 * Tout est conditionné à la publication du tournoi : sur l'écran « à venir », la page reste
 * exactement celle d'aujourd'hui.
 *
 * @param {boolean} premier vrai au tout premier chargement (autorise l'interstitiel)
 */
function appliquerSponsors(premier) {
  const zoneBandeau = document.getElementById('sp-bandeau');
  const zoneRail = document.getElementById('sp-rail');
  const zoneBarre = document.getElementById('sp-barre');
  const zoneMur = document.getElementById('sp-mur');
  if (!zoneBandeau) return;

  const montrer = !!(sponsorsReg && sponsorsReg.actifs && sponsors.length && estPublie());
  if (!montrer) {
    [zoneBandeau, zoneRail, zoneBarre, zoneMur].forEach(function (z) {
      if (z) { z.hidden = true; z.innerHTML = ''; }
    });
    document.body.classList.remove('sp-barre-active');
    sponsorsSignature = '';
    return;
  }

  const signature = sponsors.map(function (s) {
    return s.id_sponsor + ':' + s.emplacements + ':' + s.poids;
  }).join('|') + '#' + sponsorsReg.rotationS + '#' + sponsorsReg.mur + '#' + sponsorsReg.barreMobile;

  if (signature !== sponsorsSignature) {
    sponsorsSignature = signature;

    // A — bandeau principal.
    const htmlBandeau = sponsorsRendreBandeau(sponsors);
    zoneBandeau.innerHTML = htmlBandeau;
    zoneBandeau.hidden = !htmlBandeau;

    // B — rail (ordinateur) et barre basse (téléphone) : même contenu, deux rendus.
    const htmlRail = sponsorsRendreRail(sponsors);
    if (zoneRail) { zoneRail.innerHTML = htmlRail; zoneRail.hidden = !htmlRail; }
    if (zoneBarre) {
      const avecBarre = !!htmlRail && sponsorsReg.barreMobile;
      zoneBarre.innerHTML = avecBarre ? htmlRail : '';
      zoneBarre.hidden = !avecBarre;
      // Le corps de page réserve la hauteur de la barre : elle ne recouvre jamais un score.
      document.body.classList.toggle('sp-barre-active', avecBarre);
    }

    // E — mur des partenaires.
    const htmlMur = sponsorsReg.mur ? sponsorsRendreMur(sponsors) : '';
    if (zoneMur) { zoneMur.innerHTML = htmlMur; zoneMur.hidden = !htmlMur; }

    [zoneBandeau, zoneRail, zoneBarre, zoneMur].forEach(function (z) {
      if (z && !z.hidden) sponsorsBrancherMesure(z);
    });
    /* ⛔ LA REMONTÉE DES RELEVÉS N'EST PLUS ARMÉE — garantie « zéro écriture » de ce lot.
       🔬 CE QUE CETTE LIGNE FAISAIT : `sponsorsArmerEnvoi()` postait `mesureSponsors` au backend
       20 s après l'ouverture, puis toutes les 10 min, puis une dernière fois à la fermeture de
       l'onglet. Côté serveur, ce POST SANS CLÉ créait l'onglet `Mesures` et y ajoutait une ligne :
       une page PUBLIQUE mutait donc le classeur de production, à chaque visite de chaque
       spectateur. ⛔ La garantie de ce lot l'interdit sans réserve.
       ⭐ LES COMPTEURS LOCAUX RESTENT : `sponsorsBrancherMesure` ci-dessus continue de compter
       expositions et clics DANS le navigateur (localStorage), ce qui n'est pas de la télémétrie
       PERSISTANTE — rien ne quitte l'appareil. ⛔ `js/sponsors.js` n'est pas touché : la porte
       est fermée ICI (le seul appelant) et côté serveur (`doPost`), pas en modifiant un fichier
       du lot « Partenaires » dont aucune autre page ne doit changer de comportement. */
    // La rotation pilote les DEUX rendus du rail (colonne et barre) : une seule est visible
    // à la fois selon la largeur d'écran, mais toutes deux doivent rester synchronisées.
    sponsorsDemarrerRotation([zoneRail, zoneBarre], sponsorsReg.rotationS);
  }

  // D — interstitiel : au chargement seulement, jamais sur un rafraîchissement automatique.
  if (premier && !sponsorPleinFait) {
    sponsorPleinFait = true;
    const candidats = sponsorsPourEmplacement(sponsors, 'plein');
    const visites = sponsorsCompterVisite();
    if (sponsorsPeutAfficherPlein(sponsorsReg, candidats, visites, estPublie())) {
      sponsorsAfficherPlein(sponsorsTirer('plein', candidats, true), sponsorsReg);
    }
  }

  if (sponsorsReg.demo) afficherBandeauDemo();
}

/**
 * Encart partenaire (emplacement C) prêt à insérer dans une vue. Son affichage n'est compté
 * qu'une seule fois : la vue est reconstruite à chaque rafraîchissement, mais c'est le même
 * encart, sous les mêmes yeux.
 */
function encartFil() {
  if (!sponsorsReg || !sponsorsReg.actifs || !sponsorFil || !estPublie()) return '';
  return sponsorsRendreFil(sponsorFil);
}

/** Rebranche la mesure sur les encarts au fil après un rendu de vue. */
function brancherEncartsFil() {
  const zones = [document.getElementById('mon-planning'), document.getElementById('vue-classements')];
  zones.forEach(function (z) {
    if (z) sponsorsBrancherMesure(z, { sansAffichage: sponsorFilCompte });
  });
  if (sponsorFil) sponsorFilCompte = true;
}

/**
 * Barre flottante du MODE DÉMO (?demo=sponsors) : rejouer l'interstitiel à volonté et
 * repérer les emplacements. Absente de la page publique normale.
 */
function afficherBandeauDemo() {
  if (document.getElementById('sp-demo')) return;
  const barre = document.createElement('div');
  barre.id = 'sp-demo';
  barre.className = 'sp-demo';
  barre.innerHTML =
    '<span class="sp-demo-titre">Mode démo</span>' +
    '<button type="button" id="sp-demo-plein">Rejouer le plein écran</button>' +
    '<button type="button" id="sp-demo-reperes">Repérer les emplacements</button>';
  document.body.appendChild(barre);

  document.getElementById('sp-demo-plein').addEventListener('click', function () {
    const candidats = sponsorsPourEmplacement(sponsors, 'plein');
    if (candidats.length) sponsorsAfficherPlein(sponsorsTirer('plein', candidats, true), sponsorsReg);
  });
  document.getElementById('sp-demo-reperes').addEventListener('click', function () {
    document.body.classList.toggle('sp-reperes');
  });
}

/**
 * L'horodatage affiché. ⭐ IL DÉCRIT LES DONNÉES, PAS LA TENTATIVE.
 * 🔬 LE DÉFAUT FERMÉ : l'ancienne version posait l'heure du TÉLÉPHONE à chaque chargement réussi.
 * Un rafraîchissement qui échouait n'y touchait pas — c'est bien —, mais un rafraîchissement
 * RÉUSSI servi par un cache de dix minutes affichait l'heure COURANTE sur des données anciennes.
 * ⭐ Désormais l'heure est celle de la GÉNÉRATION de l'état, telle que le serveur l'a datée ; et
 * quand l'affichage n'est plus actualisé, la ligne le dit au lieu de faire semblant.
 */
function majHeure() {
  const zone = document.getElementById('maj');
  if (!zone) return;
  if (etatPublic.phase === 'erreur' || etatPublic.phase === 'incompatible') { zone.textContent = ''; return; }
  const h = heureCourte(etatPublic.genereLe);
  if (!h) { zone.textContent = ''; return; }
  zone.textContent = (etatPublic.ancien ? 'Dernières données reçues à ' : 'Données du ') + h;
}

/**
 * Bouton « Rafraîchir » : recharge les données avec un retour visible (bouton désactivé
 * le temps de la requête), puis remet le libellé.
 */
async function onRafraichir() {
  const btn = document.getElementById('btn-refresh');
  const texte = '🔄 Rafraîchir';
  btn.disabled = true;
  btn.textContent = '⏳ Rafraîchissement…';
  chargementEnCours = true;
  try {
    await charger(false);
  } finally {
    chargementEnCours = false;
    btn.disabled = false;
    /* ⛔ LE LIBELLÉ DIT L'ISSUE. 🔬 Avant, le bouton reprenait son texte quoi qu'il arrive : un
       rafraîchissement manuel qui échouait était INDISCERNABLE d'un rafraîchissement réussi. Le
       bandeau d'état porte le détail ; le bouton, lui, ne prétend plus que tout va bien. */
    btn.textContent = etatPublic.ancien || etatPublic.phase === 'erreur' ||
                      etatPublic.phase === 'incompatible' ? '⚠️ Réessayer' : texte;
  }
}

/**
 * Met le titre de la page (bandeau + onglet du navigateur) au nom de l'événement
 * saisi dans l'admin (config.global.tournoi_nom), sinon garde « Le tournoi ».
 */
function majTitre() {
  const nom = (config.global && config.global.tournoi_nom || '').toString().trim();
  const h1 = document.getElementById('titre-tournoi');
  if (h1) h1.textContent = nom || 'Le tournoi';
  document.title = nom || 'Le tournoi';
}

/* ==========================================================================
   DERNIERS SCORES — fil des résultats récents du tournoi (en haut de Classements)
   ========================================================================== */

function sectionDerniersScores() {
  const finis = matchs.filter(function (m) {
    return estTermine(m.statut) && String(m.score_A) !== '' && String(m.score_B) !== '';
  });
  let h = '<h2 class="live-titre">📣 Derniers scores</h2>';
  if (!finis.length) return h + '<p class="vide">Aucun score pour l\'instant.</p>';

  const tri = finis.slice()
    .sort(function (a, b) { return String(b.heure_fin).localeCompare(String(a.heure_fin)); })
    .slice(0, 8);
  tri.forEach(function (m) { h += ligneScore(m); });
  return h;
}

function ligneScore(m) {
  const a = Number(m.score_A), b = Number(m.score_B);
  const libelle = libelleMatch(m);
  return '<div class="score-ligne">' +
    '<span class="score-meta">' + echapper(m.categorie) + ' · ' + echapper(libelle) + ' · ' + echapper(m.heure_fin) + '</span>' +
    '<div class="score-corps">' +
      '<span class="' + (a > b ? 'gagnant' : '') + '">' + echapper(nomEquipe(m.equipe_A)) + '</span>' +
      '<span class="score-chiffres">' + a + ' - ' + b + '</span>' +
      '<span class="' + (b > a ? 'gagnant' : '') + '">' + echapper(nomEquipe(m.equipe_B)) + '</span>' +
    '</div></div>';
}

/* ==========================================================================
   📋 MON ÉQUIPE — sélection + matchs + classements de l'équipe
   ========================================================================== */

/**
 * Remplit le menu déroulant des CATÉGORIES (filtre global des deux onglets).
 * Se masque tout seul s'il n'y a qu'une seule catégorie (menu inutile). Fixe `categorieActive`
 * (catégorie mémorisée si toujours présente, sinon la première par ordre alphabétique).
 */
function peuplerCategorie() {
  const bloc = document.getElementById('filtre-categorie');
  const sel = document.getElementById('select-categorie');

  const cats = categoriesPresentes();
  const memo = localStorage.getItem(CLE_CATEGORIE) || '';
  categorieActive = (cats.indexOf(memo) >= 0) ? memo : (cats[0] || '');

  sel.innerHTML = cats.map(function (c) {
    return '<option value="' + echapper(c) + '"' + (c === categorieActive ? ' selected' : '') + '>' +
      echapper(c) + '</option>';
  }).join('');

  bloc.hidden = (cats.length <= 1); // une seule catégorie → menu masqué
}

/** Catégories présentes (celles qui ont au moins une équipe), triées par ordre NUMÉRIQUE
 *  (U8 avant U10 avant U12 — un tri alphabétique classerait « U10 » avant « U8 »). */
function categoriesPresentes() {
  const cats = [];
  equipes.forEach(function (e) { if (e.categorie && cats.indexOf(e.categorie) < 0) cats.push(e.categorie); });
  return cats.sort(comparerCategorie);
}

/* comparerCategorie() est désormais dans commun.js (partagé avec saisie.js). */

/** Remplit le menu déroulant des équipes DE LA CATÉGORIE ACTIVE, en préservant le choix. */
function peuplerSelect() {
  const sel = document.getElementById('select-equipe');
  const choix = sel.value || localStorage.getItem(CLE_EQUIPE) || '';
  const membres = equipes.filter(function (e) { return e.categorie === categorieActive; })
    .slice().sort(function (a, b) { return String(a.nom_equipe).localeCompare(String(b.nom_equipe)); });

  let html = '<option value="">— Choisis ton équipe —</option>';
  membres.forEach(function (e) {
    html += '<option value="' + echapper(e.id_equipe) + '">' + echapper(e.nom_equipe) + '</option>';
  });
  sel.innerHTML = html;
  // On ne re-sélectionne le choix mémorisé que s'il appartient à la catégorie active.
  if (choix && membres.some(function (e) { return e.id_equipe === choix; })) sel.value = choix;
}

function afficherEquipe() {
  const zone = document.getElementById('mon-planning');
  const id = document.getElementById('select-equipe').value;

  if (!id) {
    zone.innerHTML = '<p class="vide">Sélectionne ton équipe pour voir tes matchs.</p>';
    return;
  }
  const mes = matchs.filter(function (m) { return m.equipe_A === id || m.equipe_B === id; });
  if (!mes.length) {
    zone.innerHTML = '<p class="vide">Aucun match pour cette équipe (planning pas encore généré ?).</p>';
    return;
  }

  const matin = mes.filter(function (m) { return String(m.phase) !== 'classement'; });
  const aprem = mes.filter(function (m) { return String(m.phase) === 'classement'; });

  const prochain = mes.filter(function (m) { return !estTermine(m.statut); }).slice().sort(function (a,b) { return String(a.heure_debut).localeCompare(String(b.heure_debut)); })[0];
  let html = '<div class="cv-equipe-grid"><section class="cv-programme">';
  if (prochain) html += '<section class="cv-prochain"><h2>Prochain match</h2>' + carteMatch(prochain, id) + '</section>';
  // Objet catégorie (vocabulaire Super Challenge : Samedi/Dimanche au lieu de Matin/Après-midi).
  const catObjP = (config.categories || []).find(function (c) { return c.categorie === (mes[0] && mes[0].categorie); });
  if (matin.length) html += '<div class="planning-phase">' + (phaseLabelScf(catObjP, false) || '🌅 Matin — poules') + '</div>' + cartes(matin, id);
  if (aprem.length) {
    const fmt = formatApresMidiCat(matchs.find(function (m) { return m.equipe_A === id || m.equipe_B === id; }).categorie);
    const titreAprem = phaseLabelScf(catObjP, true) || ((fmt === 'COUPE_PLATEAU') ? '🏉 Après-midi — Coupe &amp; Plateau'
      : (fmt === 'LIBRE') ? '🏉 Après-midi — matchs amicaux'
      : (fmt === 'POULES_NIVEAU') ? '🏉 Après-midi — poules de niveau'
      : '🏉 Après-midi — classement croisé');
    html += '<div class="planning-phase">' + titreAprem + '</div>' + cartes(aprem, id);
  }

  // Encart partenaire (C) : entre les matchs et les classements — une respiration naturelle
  // du fil, jamais au milieu d'un tableau.
  html += encartFil();

  const eq = equipes.find(function (x) { return x.id_equipe === id; });
  html += '</section><aside class="cv-rangs">';
  if (eq) html += sectionClassementsEquipe(eq);
  html += '</aside></div>';
  zone.innerHTML = html;
  brancherEncartsFil();
}

/** Cartes de matchs (triées par heure) du point de vue de l'équipe id. */
function cartes(liste, id) {
  return liste.slice()
    .sort(function (a, b) { return String(a.heure_debut).localeCompare(String(b.heure_debut)); })
    .map(function (m) { return carteMatch(m, id); }).join('');
}

function carteMatch(m, id) {
  const estA = m.equipe_A === id;
  const adversaire = nomEquipe(estA ? m.equipe_B : m.equipe_A);
  const monScore = estA ? m.score_A : m.score_B;
  const scoreAdv = estA ? m.score_B : m.score_A;
  const termine = estTermine(m.statut);
  const libelle = libelleMatch(m);

  let resultat;
  if (termine && String(monScore) !== '' && String(scoreAdv) !== '') {
    const a = Number(monScore), b = Number(scoreAdv);
    const issue = a > b ? 'gagne' : (a < b ? 'perd' : 'nul');
    const etiquette = a > b ? 'Victoire' : (a < b ? 'Défaite' : 'Nul');
    resultat = '<span class="mp-resultat ' + issue + '">' + a + ' - ' + b + ' · ' + etiquette + '</span>';
  } else {
    resultat = '<span class="mp-avenir">à venir</span>';
  }
  return '<div class="match' + (termine ? ' match-termine' : '') + '">' +
    '<div class="match-meta">' + echapper(m.heure_debut) + ' · Terrain ' + echapper(String(m.terrain)) +
      ' · ' + echapper(libelle) +
      (libelleArbitreScf(m, nomEquipe) ? ' · <span class="arbitre-tag">🧑‍⚖️ ' + echapper(libelleArbitreScf(m, nomEquipe)) + '</span>' : '') + '</div>' +
    '<div class="mp-ligne"><span class="mp-adv">vs ' + echapper(adversaire) + '</span>' +
      resultat + '</div>' +
  '</div>';
}

/** Les 3 classements affichés sous les matchs de l'équipe : sa poule, son niveau, le général. */
function sectionClassementsEquipe(eq) {
  let html = '';
  // Objet catégorie (vocabulaire Super Challenge : Triangulaire/Quadrangulaire, Poule E/F/G).
  const catObjE = (config.categories || []).find(function (c) { return c.categorie === eq.categorie; });

  // 1) Sa poule du matin.
  const membresPoule = equipes.filter(function (e) { return e.categorie === eq.categorie && e.poule === eq.poule; });
  const matchsMatin = matchs.filter(function (m) { return m.categorie === eq.categorie && String(m.phase) !== 'classement'; });
  html += '<div class="planning-phase">📊 Classement de ta poule (matin)</div>';
  const glP = groupeLabelScf(catObjE, eq.poule, membresPoule.length, false);
  html += tableCompacte(glP ? echapper(glP) : ('Poule ' + echapper(String(eq.poule))),
                        classementGroupe(matchsMatin, membresPoule), eq.id_equipe);

  // 2) & 3) Après-midi : dépend du format de la catégorie.
  const aApresMidi = matchs.some(function (m) {
    return m.categorie === eq.categorie && String(m.phase) === 'classement';
  });
  if (!aApresMidi) return html;
  const fmt = formatApresMidiCat(eq.categorie);

  if (fmt === 'COUPE_PLATEAU') {
    // Arbre de la Coupe + liste du Plateau (le classement croisé n'a pas de sens ici).
    html += sectionBracket(eq.categorie) + sectionPlateau(eq.categorie);
    return html;
  }
  if (fmt === 'LIBRE') {
    // Matchs amicaux : pas de classement l'après-midi.
    return html;
  }

  // CROISE : niveau d'après-midi + classement général du tournoi (comportement historique).
  const matchNiv = matchs.find(function (m) {
    return String(m.phase) === 'classement' && (m.equipe_A === eq.id_equipe || m.equipe_B === eq.id_equipe);
  });
  if (matchNiv) {
    const niv = matchNiv.poule;
    const matchsNiv = matchs.filter(function (m) {
      return m.categorie === eq.categorie && String(m.phase) === 'classement' && m.poule === niv;
    });
    const idsNiv = {};
    matchsNiv.forEach(function (m) { idsNiv[m.equipe_A] = 1; idsNiv[m.equipe_B] = 1; });
    const membresNiv = Object.keys(idsNiv).map(function (x) { return { id_equipe: x, nom_equipe: nomEquipe(x) }; });
    html += '<div class="planning-phase">📊 Classement de ton niveau (après-midi)</div>';
    const glN = groupeLabelScf(catObjE, niv, 0, true)
      || libellePouleNiveau(catObjE, niv, nbPoulesNiveauCat(matchs, eq.categorie));
    html += tableCompacte(glN ? echapper(glN) : ('Niveau ' + echapper(String(niv))),
                          classementGroupe(matchsNiv, membresNiv), eq.id_equipe);
  }

  html += '<div class="planning-phase">🏆 Classement général du tournoi</div>';
  html += tableGeneral(classementGeneral(eq.categorie), eq.id_equipe, !!podiumCertain(eq.categorie));
  return html;
}

/* ==========================================================================
   🏆 CLASSEMENTS — poules (matin) + niveaux croisés (après-midi), tableaux complets
   ========================================================================== */

/* ==========================================================================
   FILTRES DES CLASSEMENTS — catégorie, créneau, poule
   --------------------------------------------------------------------------
   ⭐ L'ÉTAT VIT DANS LE MODULE. `afficherClassements()` réécrit sa vue en entier à
   chaque rafraîchissement (la page se relit toute seule pendant le tournoi) : un
   choix laissé dans le DOM serait effacé sous les yeux du spectateur, au beau milieu
   d'un match. Les trois listes sont donc REPEINTES depuis ces variables.
   ⛔ La catégorie, elle, n'a pas de variable propre : c'est `categorieActive`, la MÊME
   que le filtre du haut de page et que « Mon équipe ». Deux sources auraient divergé.
   ========================================================================== */

let pubCreneau = 'matin';   // 'matin' | 'aprem'
let pubPoule = '';          // '' = toutes les poules

/** Les créneaux réellement disponibles pour la catégorie affichée. Le matin existe toujours. */
function creneauxPublics() {
  const out = [{ cle: 'matin', libelle: 'Matin — poules' }];
  const aprem = matchs.filter(function (m) {
    return m.categorie === categorieActive && String(m.phase) === 'classement';
  });
  if (aprem.length) {
    const fmt = formatApresMidiCat(categorieActive);
    out.push({ cle: 'aprem', libelle: 'Après-midi — ' + (
      fmt === 'COUPE_PLATEAU' ? 'Coupe & Plateau' :
      fmt === 'LIBRE' ? 'matchs amicaux' :
      fmt === 'POULES_NIVEAU' ? 'poules de niveau' : 'classement croisé') });
  }
  return out;
}

/** Les groupes du créneau affiché (poules le matin, niveaux l'après-midi). */
function groupesDuCreneau() {
  const par = classementParGroupe(pubCreneau === 'aprem' ? 'aprem' : 'matin');
  const cat = par.find(function (c) { return c.categorie === categorieActive; }) || par[0];
  return cat ? cat.groupes : [];
}

/** Ne garde que le groupe choisi. '' = tous. */
function filtrerGroupes(groupes) {
  if (!pubPoule) return groupes;
  return groupes.filter(function (g) { return g.titre === pubPoule; });
}

/** Une liste déroulante de la barre de filtres. */
function selectPublic(id, libelle, options, valeur) {
  return '<label class="cv-pub-filtre"><span class="cv-pub-filtre-lib">' + echapper(libelle) + '</span>' +
    '<select class="r-input" id="' + id + '">' + options.map(function (o) {
      return '<option value="' + echapper(o.cle) + '"' + (o.cle === valeur ? ' selected' : '') + '>' +
        echapper(o.libelle) + '</option>';
    }).join('') + '</select></label>';
}

/** La barre : catégorie, créneau, poule. Les listes vides ou à une seule entrée restent
 *  affichées — le spectateur doit voir SUR QUOI il lit, même quand il n'y a pas le choix. */
function barreFiltresClassements(creneaux, groupes) {
  const cats = categoriesPresentes().map(function (c) { return { cle: c, libelle: c }; });
  const poules = [{ cle: '', libelle: 'Toutes les poules' }].concat(
    groupes.map(function (g) { return { cle: g.titre, libelle: g.titre }; }));
  return '<div class="cv-pub-filtres">' +
    selectPublic('cv-pub-categorie', 'Catégorie', cats, categorieActive) +
    selectPublic('cv-pub-creneau', 'Créneau', creneaux, pubCreneau) +
    selectPublic('cv-pub-poule', 'Poule', poules, pubPoule) +
    '</div>';
}

/**
 * Un seul écouteur, DÉLÉGUÉ sur la vue : les trois listes sont recréées à chaque rendu, un
 * écouteur posé sur elles serait perdu au premier rafraîchissement automatique.
 */
function brancherFiltresClassements() {
  const zone = document.getElementById('vue-classements');
  if (!zone || zone.dataset.filtresBranches) return;
  zone.dataset.filtresBranches = '1';
  zone.addEventListener('change', function (e) {
    const cible = e.target;
    if (!cible || !cible.id) return;
    if (cible.id === 'cv-pub-categorie') {
      // ⛔ La MÊME variable que le filtre du haut de page, et la même mémorisation : on ne
      //    tient pas un second état de catégorie qui finirait par diverger.
      categorieActive = cible.value;
      try { localStorage.setItem(CLE_CATEGORIE, categorieActive); } catch (err) {}
      const global = document.getElementById('select-categorie');
      if (global) global.value = categorieActive;
      pubCreneau = 'matin'; pubPoule = '';   // la catégorie change : ses créneaux et poules aussi
    } else if (cible.id === 'cv-pub-creneau') {
      pubCreneau = cible.value; pubPoule = '';
    } else if (cible.id === 'cv-pub-poule') {
      pubPoule = cible.value;
    } else return;
    afficherClassements();
  });
}

/**
 * La vue Classements : la barre de filtres, puis le classement à gauche et les derniers
 * scores à droite.
 * ⭐ Les derniers scores gardent leur portée « TOURNOI ENTIER » — toutes catégories, toutes
 *    poules. C'est ce qu'un spectateur vient chercher en premier, et le filtrer par poule
 *    l'aurait réduit à ce qu'il regarde déjà dans la colonne de gauche.
 */
function afficherClassements() {
  const zone = document.getElementById('vue-classements');
  const creneaux = creneauxPublics();
  // Un créneau mémorisé qui n'existe plus (catégorie sans après-midi) retombe sur le matin.
  if (!creneaux.some(function (c) { return c.cle === pubCreneau; })) pubCreneau = creneaux[0].cle;
  const groupes = groupesDuCreneau();
  if (pubPoule && !groupes.some(function (g) { return g.titre === pubPoule; })) pubPoule = '';

  let principal = '';
  if (pubCreneau === 'aprem') {
    principal = sectionApresMidiClassements(categorieActive);
  } else if (!groupes.length) {
    principal = '<p class="vide">Aucune poule pour le moment.</p>';
  } else {
    principal = '<div class="planning-phase">🌅 Poules (matin)</div>' +
      '<div class="cv-classements-grid">' +
      filtrerGroupes(groupes).map(function (g) {
        return '<section>' + tableComplete(g.titre, g.classement) + '</section>';
      }).join('') + '</div>';
  }

  zone.innerHTML = barreFiltresClassements(creneaux, groupes) +
    '<div class="cv-pub-colonnes">' +
      '<div class="cv-pub-principal">' + principal + '</div>' +
      '<aside class="cv-pub-derniers">' + sectionDerniersScores() + encartFil() + '</aside>' +
    '</div>';
  brancherFiltresClassements();
  brancherEncartsFil();
}

/**
 * Classement complet par groupe, pour la vue Classements. FILTRÉ sur la catégorie active.
 * @param phase 'matin' → équipes groupées par leur poule, ne compte que les matchs de poule.
 *              'aprem' → équipes groupées par niveau (poule du match = N1/N2…), ne compte que le classement.
 */
function classementParGroupe(phase) {
  const stats = {}, infos = {};
  if (phase === 'matin') {
    equipes.forEach(function (e) {
      if (!e.poule || e.categorie !== categorieActive) return;
      stats[e.id_equipe] = nouveauStats(e.id_equipe, e.nom_equipe);
      infos[e.id_equipe] = { categorie: e.categorie, cle: e.poule };
    });
    matchs.forEach(function (m) {
      if (m.categorie === categorieActive && String(m.phase) !== 'classement') compterMatch(stats, m);
    });
    return regrouper(stats, infos, 'Poule ');
  }
  const ms = matchs.filter(function (m) {
    return m.categorie === categorieActive && String(m.phase) === 'classement';
  });
  ms.forEach(function (m) {
    [m.equipe_A, m.equipe_B].forEach(function (id) {
      if (!stats[id]) { stats[id] = nouveauStats(id); infos[id] = { categorie: m.categorie, cle: m.poule }; }
    });
  });
  ms.forEach(function (m) { compterMatch(stats, m); });
  const res = regrouper(stats, infos, 'Niveau ');
  // Vocabulaire « Poule haute / basse » quand la catégorie est en POULES_NIVEAU (repli : Niveau N1).
  const catObjG = (config.categories || []).find(function (c) { return c.categorie === categorieActive; });
  const nbNiv = nbPoulesNiveauCat(matchs, categorieActive);
  res.forEach(function (cat) {
    cat.groupes.forEach(function (g) {
      const pn = libellePouleNiveau(catObjG, String(g.titre).replace(/^Niveau /, ''), nbNiv);
      if (pn) g.titre = pn;
    });
  });
  return res;
}

/** Regroupe les stats par catégorie puis par clé (poule ou niveau), trie chaque groupe. */
function regrouper(stats, infos, prefixeTitre) {
  const parCat = {};
  Object.keys(stats).forEach(function (id) {
    const info = infos[id];
    const cat = (parCat[info.categorie] = parCat[info.categorie] || {});
    (cat[info.cle] = cat[info.cle] || []).push(stats[id]);
  });
  const res = [];
  Object.keys(parCat).sort().forEach(function (cat) {
    const groupes = [];
    Object.keys(parCat[cat]).sort().forEach(function (cle) {
      groupes.push({ titre: prefixeTitre + cle, classement: parCat[cat][cle].sort(comparer) });
    });
    res.push({ categorie: cat, groupes: groupes });
  });
  return res;
}

/** Tableau complet : #, Équipe, J, V, N, D, BP, BC, Diff, Pts. */
function tableComplete(titre, liste) {
  let h = '<div class="live-poule">' + echapper(titre) + '</div>';
  h += '<div class="table-scroll"><table class="table-planning table-classement cl-full">' +
    '<thead><tr><th>#</th><th>Équipe</th><th>J</th><th>V</th><th>N</th><th>D</th>' +
    '<th>BP</th><th>BC</th><th>Diff</th><th>Pts</th></tr></thead><tbody>';
  liste.forEach(function (t, i) {
    const diff = (t.diff > 0 ? '+' : '') + t.diff;
    h += '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td class="col-equipe">' + echapper(t.nom_equipe) + '</td>' +
      '<td>' + t.j + '</td><td>' + t.v + '</td><td>' + t.n + '</td><td>' + t.d + '</td>' +
      '<td>' + t.bp + '</td><td>' + t.bc + '</td><td>' + echapper(diff) + '</td>' +
      '<td class="col-pts">' + t.pts + '</td>' +
    '</tr>';
  });
  return h + '</tbody></table></div>';
}

/* ==========================================================================
   CALCULS DE CLASSEMENT (barème commun) + tableaux compacts
   ========================================================================== */

/* ⚠️ BARÈME DE CLASSEMENT — CONTRAT PARTAGÉ AVEC LE BACKEND ⚠️
   Ce barème (points + départage) est RÉIMPLÉMENTÉ à l'identique côté serveur
   (backend/Code.gs : enregistrerResultat + comparerClassement), car Apps Script et le
   navigateur ne peuvent pas partager un même fichier .js. TOUTE modification ici DOIT être
   répercutée là-bas (et inversement) : sinon le classement affiché au public divergerait de
   celui qui sert à générer la phase après-midi (tirage croisé). Spécification unique et
   règles de départage : docs/regles-classement.md */
const POINTS_VICTOIRE = 3;
const POINTS_NUL = 2;
const POINTS_DEFAITE = 1;

function nouveauStats(id, nom) {
  return { id_equipe: id, nom_equipe: nom || nomEquipe(id), j: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0, diff: 0, pts: 0 };
}
function appliquer(s, pour, contre) {
  s.j++; s.bp += pour; s.bc += contre; s.diff = s.bp - s.bc;
  if (pour > contre) { s.v++; s.pts += POINTS_VICTOIRE; }
  else if (pour === contre) { s.n++; s.pts += POINTS_NUL; }
  else { s.d++; s.pts += POINTS_DEFAITE; }
}
// Départage : points, puis différence de points (BP−BC), puis points marqués (BP) — décroissant.
function comparer(a, b) {
  if (b.pts !== a.pts) return b.pts - a.pts;
  if (b.diff !== a.diff) return b.diff - a.diff;
  return b.bp - a.bp;
}
function compterMatch(stats, m) {
  if (!estTermine(m.statut)) return;
  const a = stats[m.equipe_A], b = stats[m.equipe_B];
  if (!a || !b) return;
  const sa = Number(m.score_A), sb = Number(m.score_B);
  if (!isFinite(sa) || !isFinite(sb)) return;
  appliquer(a, sa, sb); appliquer(b, sb, sa);
}

/** Classement d'un groupe défini par ses membres (pour la vue « Mon équipe »). */
function classementGroupe(matchsGroupe, membres) {
  const stats = {};
  membres.forEach(function (e) { stats[e.id_equipe] = nouveauStats(e.id_equipe, e.nom_equipe); });
  matchsGroupe.forEach(function (m) { compterMatch(stats, m); });
  return Object.keys(stats).map(function (k) { return stats[k]; }).sort(comparer);
}

/** Numéro de niveau (N1 -> 1) ; 999 si pas de niveau (passe en fin de classement). */
function niveauNum(n) { const m = String(n).match(/(\d+)/); return m ? parseInt(m[1], 10) : 999; }

/**
 * Classement général (croisé final) d'une catégorie : ordonné par NIVEAU (N1 avant N2…),
 * puis par les résultats de l'après-midi, puis (départage) par ceux du matin.
 */
function classementGeneral(categorie) {
  const membres = equipes.filter(function (e) { return e.categorie === categorie && e.poule; });
  const sM = {}, sA = {}, niveau = {};
  membres.forEach(function (e) {
    sM[e.id_equipe] = nouveauStats(e.id_equipe, e.nom_equipe);
    sA[e.id_equipe] = nouveauStats(e.id_equipe, e.nom_equipe);
  });
  matchs.filter(function (m) { return m.categorie === categorie && String(m.phase) !== 'classement'; })
    .forEach(function (m) { compterMatch(sM, m); });
  const matchsAprem = matchs.filter(function (m) { return m.categorie === categorie && String(m.phase) === 'classement'; });
  matchsAprem.forEach(function (m) { compterMatch(sA, m); });
  matchsAprem.forEach(function (m) { niveau[m.equipe_A] = m.poule; niveau[m.equipe_B] = m.poule; });

  return membres.map(function (e) {
    return { id: e.id_equipe, nom: e.nom_equipe, niveau: niveau[e.id_equipe] || '', m: sM[e.id_equipe], a: sA[e.id_equipe] };
  }).sort(function (x, y) {
    const nx = niveauNum(x.niveau), ny = niveauNum(y.niveau);
    if (nx !== ny) return nx - ny;
    return comparer(x.a, y.a) || comparer(x.m, y.m);
  });
}

/* ==========================================================================
   PODIUM CERTAIN — top 3 du classement général, affiché UNIQUEMENT quand il
   est mathématiquement verrouillé (aucun résultat restant ne peut le changer).
   --------------------------------------------------------------------------
   Rappels qui fondent le calcul :
   • Le classement général trie par NIVEAU (figé dès l'après-midi généré),
     puis résultats de l'après-midi, puis (départage) du matin.
   • Barème V=3 / N=2 / D=1 : un match rapporte TOUJOURS entre 1 et 3 points.
   • Les scores sont libres → le goal-average (diff) et les points marqués (bp)
     peuvent basculer avec un gros score. Donc, tant que deux équipes PEUVENT
     encore se rejoindre AUX POINTS, leur ordre n'est pas garanti (un large
     succès pourrait inverser la diff). La certitude n'existe donc que si
     l'écart de points est INATTEIGNABLE, ou si tout est joué.
   ========================================================================== */

/** Nombre de matchs NON terminés d'une équipe, pour une phase donnée. */
function matchsRestants(id, estClassement) {
  return matchs.filter(function (m) {
    const cl = (String(m.phase) === 'classement');
    return cl === estClassement && (m.equipe_A === id || m.equipe_B === id) && !estTermine(m.statut);
  }).length;
}

/**
 * Départage GARANTI sur une clé (après-midi OU matin) entre deux équipes X et Y.
 * sX/sY = stats de la phase ; remX/remY = matchs restants de cette phase.
 * Retourne : 'X' (X devant, certain), 'Y' (Y devant, certain),
 *            'egal' (phase entièrement jouée et strictement à égalité → départage à la clé suivante),
 *            'incertain' (les fourchettes de points se chevauchent et il reste des matchs).
 */
function departageGaranti(sX, sY, remX, remY) {
  const xMin = sX.pts + remX,     xMax = sX.pts + 3 * remX;
  const yMin = sY.pts + remY,     yMax = sY.pts + 3 * remY;
  if (xMin > yMax) return 'X';           // X ne peut plus être rejoint aux points
  if (xMax < yMin) return 'Y';           // Y ne peut plus être rejoint aux points
  // Les fourchettes de points se chevauchent : ordre garanti seulement si TOUT est joué.
  if (remX === 0 && remY === 0) {
    const c = comparer(sX, sY);          // <0 => X devant ; >0 => Y devant ; 0 => égalité stricte
    if (c < 0) return 'X';
    if (c > 0) return 'Y';
    return 'egal';
  }
  return 'incertain';
}

/**
 * Vrai si l'équipe X est GARANTIE devant l'équipe Y dans le classement général,
 * quels que soient les résultats des matchs restants (X, Y = entrées de classementGeneral).
 */
function garantiDevant(X, Y) {
  const nx = niveauNum(X.niveau), ny = niveauNum(Y.niveau);
  if (nx < ny) return true;              // niveau figé : N1 toujours devant N2…
  if (nx > ny) return false;
  // Même niveau → départage après-midi, puis (si égalité stricte) matin.
  const dA = departageGaranti(X.a, Y.a, matchsRestants(X.id, true), matchsRestants(Y.id, true));
  if (dA === 'X') return true;
  if (dA === 'Y' || dA === 'incertain') return false;
  // dA === 'egal' : après-midi joué et à égalité → on départage au matin.
  const dM = departageGaranti(X.m, Y.m, matchsRestants(X.id, false), matchsRestants(Y.id, false));
  return dM === 'X';
}

/**
 * Renvoie le podium (top 3 du classement général) SI et seulement s'il est certain :
 *   - l'après-midi (classement croisé) est généré pour la catégorie ;
 *   - l'ordre interne du trio est garanti ;
 *   - le 3e est garanti devant TOUTES les équipes suivantes (frontière verrouillée).
 * Sinon renvoie null (rien à afficher).
 */
function podiumCertain(categorie) {
  if (!categorie) return null;
  // Pas d'après-midi généré → pas encore de podium.
  const aApresMidi = matchs.some(function (m) {
    return m.categorie === categorie && String(m.phase) === 'classement';
  });
  if (!aApresMidi) return null;
  // Podium en croisé et en coupe (il ne s'affiche que lorsqu'il est réellement DÉCIDÉ).
  // LIBRE = pas de podium (format amical, sans classement, pour les plus jeunes).
  const fmt = formatApresMidiCat(categorie);
  if (fmt === 'LIBRE') return null;
  if (fmt === 'COUPE_PLATEAU') return podiumCoupe(categorie);
  return podiumCroise(categorie);
}

/** Podium du classement croisé : top 3 du classement général, UNIQUEMENT quand il est verrouillé. */
function podiumCroise(categorie) {
  const G = classementGeneral(categorie);
  if (G.length < 3) return null;                 // pas de podium à 3 sans au moins 3 équipes
  const top = G.slice(0, 3);
  // Ordre interne garanti (1er devant 2e, 2e devant 3e) + frontière (3e devant tous les suivants).
  if (!garantiDevant(top[0], top[1])) return null;
  if (!garantiDevant(top[1], top[2])) return null;
  for (let k = 3; k < G.length; k++) {
    if (!garantiDevant(top[2], G[k])) return null;
  }
  return top.map(function (t) { return { nom: t.nom }; });
}

/** Podium Coupe : 🥇 vainqueur de la finale, 🥈 finaliste, 🥉 vainqueur de la petite finale. */
function podiumCoupe(categorie) {
  const coupe = matchs.filter(function (m) {
    return m.categorie === categorie && String(m.sous_tableau).toUpperCase() === 'COUPE';
  });
  const finale = coupe.find(function (m) { return String(m.tour) === 'FINALE'; });
  if (!finale || !estTermine(finale.statut)) return null; // podium pas encore décidé
  const vF = vainqueurAff(finale);
  if (vF !== 'A' && vF !== 'B') return null;               // finale à égalité non départagée
  const orId = (vF === 'A') ? finale.equipe_A : finale.equipe_B;
  const arId = (vF === 'A') ? finale.equipe_B : finale.equipe_A;
  const top = [{ nom: nomEquipe(orId) }, { nom: nomEquipe(arId) }];
  const petite = coupe.find(function (m) { return String(m.tour) === 'PETITE_FINALE'; });
  if (petite && estTermine(petite.statut)) {
    const vP = vainqueurAff(petite);
    if (vP === 'A' || vP === 'B') {
      top.push({ nom: nomEquipe((vP === 'A') ? petite.equipe_A : petite.equipe_B) });
    }
  }
  return top;
}

/** Tableau compact d'un classement de groupe (poule ou niveau). idSel = équipe surlignée. */
function tableCompacte(titre, liste, idSel) {
  let h = '<div class="live-poule">' + titre + '</div>';
  h += '<div class="table-scroll"><table class="table-planning table-classement">' +
    '<thead><tr><th>#</th><th>Équipe</th><th>J</th><th>Diff</th><th>Pts</th></tr></thead><tbody>';
  liste.forEach(function (t, i) {
    const diff = (t.diff > 0 ? '+' : '') + t.diff;
    h += '<tr' + (t.id_equipe === idSel ? ' class="fav-ligne"' : '') + '>' +
      '<td>' + (i + 1) + '</td><td class="col-equipe">' + echapper(t.nom_equipe) + '</td>' +
      '<td>' + t.j + '</td><td>' + echapper(diff) + '</td><td class="col-pts">' + t.pts + '</td></tr>';
  });
  return h + '</tbody></table></div>';
}

/**
 * Tableau du classement général (place, équipe, niveau, points/diff de l'après-midi).
 * @param idSel équipe à surligner (vue « Mon équipe »), '' sinon.
 * @param marquerVainqueur si vrai, la 1ʳᵉ place reçoit un 🏆 (vainqueur certain).
 */
function tableGeneral(liste, idSel, marquerVainqueur) {
  let h = '<div class="table-scroll"><table class="table-planning table-classement">' +
    '<thead><tr><th>#</th><th>Équipe</th><th>Niveau</th><th>Pts</th><th>Diff</th></tr></thead><tbody>';
  liste.forEach(function (t, i) {
    const diff = (t.a.diff > 0 ? '+' : '') + t.a.diff;
    const vainqueur = marquerVainqueur && i === 0;
    const classes = (t.id === idSel ? 'fav-ligne ' : '') + (vainqueur ? 'cl-vainqueur' : '');
    h += '<tr' + (classes.trim() ? ' class="' + classes.trim() + '"' : '') + '>' +
      '<td>' + (vainqueur ? '🏆' : (i + 1)) + '</td><td class="col-equipe">' + echapper(t.nom) + '</td>' +
      '<td>' + echapper(t.niveau || '—') + '</td><td class="col-pts">' + t.a.pts + '</td><td>' + echapper(diff) + '</td></tr>';
  });
  return h + '</tbody></table></div>';
}

/* ==========================================================================
   APRÈS-MIDI MULTI-FORMATS (Coupe & Plateau / Libre / Croisé)
   ========================================================================== */

/* libelleTourFr() est désormais dans commun.js (partagé avec saisie.js). */

/** Libellé court d'un match (utilisé dans « Mon équipe » et « Derniers scores »). */
function libelleMatch(m) {
  const st = String(m.sous_tableau || '').toUpperCase();
  if (st === 'COUPE') return libelleTourFr(m.tour) + ' · Coupe';
  if (st === 'PLATEAU') return 'Plateau';
  if (String(m.format || '').toUpperCase() === 'LIBRE') return 'Match amical';
  // Vocabulaire Super Challenge (Triangulaire/Quadrangulaire, Poule E/F/G) si la catégorie est en SCF.
  const catObj = (config.categories || []).find(function (c) { return c.categorie === m.categorie; });
  const estClt = String(m.phase) === 'classement';
  const gl = groupeLabelScf(catObj, m.poule, tailleGroupeScf(matchs, m.categorie, m.poule), estClt);
  if (gl) return gl;
  // Vocabulaire « Poule haute / basse » si la catégorie est en POULES_NIVEAU (repli : Niveau N1).
  const pn = estClt ? libellePouleNiveau(catObj, m.poule, nbPoulesNiveauCat(matchs, m.categorie)) : null;
  if (pn) return pn;
  if (estClt) return 'Niveau ' + String(m.poule);
  return 'Poule ' + String(m.poule);
}

/**
 * Format d'après-midi d'une catégorie, déduit des matchs (défaut CROISE).
 * CROISE_DIAGONAL s'affiche EXACTEMENT comme CROISE (mêmes niveaux, même classement général,
 * même podium) : on le mappe donc sur 'CROISE' pour réutiliser toute la logique d'affichage.
 */
function formatApresMidiCat(categorie) {
  const ms = matchs.filter(function (m) { return m.categorie === categorie && String(m.phase) === 'classement'; });
  for (let i = 0; i < ms.length; i++) {
    const f = String(ms[i].format || '').toUpperCase();
    if (f === 'COUPE_PLATEAU' || f === 'LIBRE' || f === 'CROISE' || f === 'POULES_NIVEAU') return f;
    if (f === 'CROISE_DIAGONAL') return 'CROISE';
  }
  return 'CROISE';
}

/** Vainqueur d'un match de Coupe terminé, pour l'affichage : 'A' / 'B' / '' (indéterminé). */
function vainqueurAff(m) {
  if (!estTermine(m.statut)) return '';
  const a = Number(m.score_A), b = Number(m.score_B);
  if (isFinite(a) && isFinite(b)) { if (a > b) return 'A'; if (b > a) return 'B'; }
  if (m.vainqueur) {
    if (String(m.vainqueur) === String(m.equipe_A)) return 'A';
    if (String(m.vainqueur) === String(m.equipe_B)) return 'B';
  }
  return '';
}

/**
 * Section après-midi de la vue Classements, adaptée au format de la catégorie :
 *  COUPE_PLATEAU → arbre de la Coupe + liste du Plateau ; LIBRE → liste de matchs amicaux ;
 *  CROISE → tableaux de niveaux (comportement historique).
 */
function sectionApresMidiClassements(categorie) {
  const apremMs = matchs.filter(function (m) { return m.categorie === categorie && String(m.phase) === 'classement'; });
  if (!apremMs.length) return '';
  const fmt = formatApresMidiCat(categorie);

  if (fmt === 'COUPE_PLATEAU') {
    return '<div class="planning-phase">🏉 Après-midi — Coupe &amp; Plateau</div>' +
      sectionBracket(categorie) + sectionPlateau(categorie);
  }
  if (fmt === 'LIBRE') {
    return '<div class="planning-phase">🏉 Après-midi — matchs amicaux</div>' +
      '<p class="note-amical">🎈 Matchs amicaux supplémentaires — sans classement ni enjeu.</p>' +
      listeResultats(apremMs);
  }
  // CROISE / POULES_NIVEAU (défaut) : tableaux par niveau, PUIS le classement général.
  let html = '<div class="planning-phase">' + ((fmt === 'POULES_NIVEAU')
    ? '🏉 Après-midi — poules de niveau' : '🏉 Après-midi — classement croisé par niveau') + '</div>';
  classementParGroupe('aprem').forEach(function (cat) {
    html += '<div class="cv-classements-grid">';
    // Le filtre « Poule » de la barre agit ici sur les NIVEAUX — les groupes de l'après-midi.
    // ⛔ Il ne touche ni l'arbre de Coupe, ni le plateau, ni le classement général : ceux-là
    //    n'ont pas de groupe, les filtrer n'aurait aucun sens.
    filtrerGroupes(cat.groupes).forEach(function (g) { html += '<section>' + tableComplete(g.titre, g.classement) + '</section>'; });
    html += '</div>';
  });

  const gen = classementGeneral(categorie);
  if (gen.length) {
    const vainqueurCertain = !!podiumCertain(categorie); // top verrouillé (aucun match ne peut le changer)
    html += '<div class="planning-phase">🏆 Classement général du tournoi</div>';
    html += vainqueurCertain
      ? '<p class="note-vainqueur">🏆 Vainqueur du tournoi : <b>' + echapper(gen[0].nom) + '</b></p>'
      : '<p class="note-vainqueur note-provisoire">En tête pour l\'instant : <b>' + echapper(gen[0].nom) + '</b> (provisoire — l\'après-midi n\'est pas fini)</p>';
    html += tableGeneral(gen, '', vainqueurCertain);
  }
  return html;
}

/** Arbre d'élimination de la Coupe (colonnes par tour + petite finale à part). */
function sectionBracket(categorie) {
  const coupe = matchs.filter(function (m) {
    return m.categorie === categorie && String(m.sous_tableau).toUpperCase() === 'COUPE';
  });
  if (!coupe.length) return '';
  const petite = coupe.filter(function (m) { return String(m.tour) === 'PETITE_FINALE'; });
  const principaux = coupe.filter(function (m) { return String(m.tour) !== 'PETITE_FINALE'; });
  const ordreTours = ['SEIZIEME_DE_FINALE', 'HUITIEME_DE_FINALE', 'QUART_DE_FINALE', 'DEMI_FINALE', 'FINALE'];

  let html = '<div class="bracket-titre">🏆 Tableau Coupe</div><div class="bracket-scroll"><div class="bracket">';
  ordreTours.forEach(function (tour) {
    const ms = principaux.filter(function (m) { return String(m.tour) === tour; })
      .sort(function (a, b) { return String(a.id_match).localeCompare(String(b.id_match)); });
    if (!ms.length) return;
    html += '<div class="bracket-col"><div class="bracket-col-titre">' + libelleTourFr(tour) + '</div>';
    ms.forEach(function (m) { html += carteBracket(m); });
    html += '</div>';
  });
  html += '</div></div>';

  if (petite.length) {
    html += '<div class="bracket-petite"><div class="bracket-col-titre">Petite finale (3ᵉ place)</div>';
    petite.forEach(function (m) { html += carteBracket(m); });
    html += '</div>';
  }
  return html;
}

/** Carte d'un match de bracket (2 équipes + scores ; gagnant mis en avant). */
function carteBracket(m) {
  const v = vainqueurAff(m);
  const enAttente = (!m.equipe_A || !m.equipe_B);
  const sa = (String(m.score_A) !== '' && m.score_A != null) ? echapper(String(m.score_A)) : '';
  const sb = (String(m.score_B) !== '' && m.score_B != null) ? echapper(String(m.score_B)) : '';
  const nomA = m.equipe_A ? echapper(nomEquipe(m.equipe_A)) : '<span class="bracket-attente">en attente</span>';
  const nomB = m.equipe_B ? echapper(nomEquipe(m.equipe_B)) : '<span class="bracket-attente">en attente</span>';
  const clsA = (v === 'A') ? ' bracket-gagnant' : (v === 'B' ? ' bracket-perdant' : '');
  const clsB = (v === 'B') ? ' bracket-gagnant' : (v === 'A' ? ' bracket-perdant' : '');
  return '<div class="bracket-match' + (enAttente ? ' bracket-match-attente' : '') + '">' +
      '<div class="bracket-eq' + clsA + '"><span class="bracket-nom">' + nomA + '</span><span class="bracket-score">' + sa + '</span></div>' +
      '<div class="bracket-eq' + clsB + '"><span class="bracket-nom">' + nomB + '</span><span class="bracket-score">' + sb + '</span></div>' +
    '</div>';
}

/** Liste des matchs du Plateau (résultats simples, sans classement). */
function sectionPlateau(categorie) {
  const plateau = matchs.filter(function (m) {
    return m.categorie === categorie && String(m.sous_tableau).toUpperCase() === 'PLATEAU';
  });
  if (!plateau.length) return '';
  return '<div class="bracket-titre">🛡️ Tableau Plateau</div>' + listeResultats(plateau);
}

/** Liste de résultats simples (score ou « à venir »), triée par heure. Sert Plateau et Libre. */
function listeResultats(liste) {
  return liste.slice()
    .sort(function (a, b) { return String(a.heure_debut).localeCompare(String(b.heure_debut)); })
    .map(function (m) {
      const fini = estTermine(m.statut) && String(m.score_A) !== '' && String(m.score_B) !== '';
      const a = Number(m.score_A), b = Number(m.score_B);
      const score = fini ? (a + ' - ' + b) : 'à venir';
      return '<div class="score-ligne">' +
        '<span class="score-meta">' + echapper(m.heure_debut) + ' · Terrain ' + echapper(String(m.terrain)) + '</span>' +
        '<div class="score-corps">' +
          '<span class="' + (fini && a > b ? 'gagnant' : '') + '">' + echapper(nomEquipe(m.equipe_A)) + '</span>' +
          '<span class="score-chiffres">' + echapper(score) + '</span>' +
          '<span class="' + (fini && b > a ? 'gagnant' : '') + '">' + echapper(nomEquipe(m.equipe_B)) + '</span>' +
        '</div></div>';
    }).join('');
}

/* ==========================================================================
   OUTILS
   ========================================================================== */

/** Nom lisible d'une équipe (lecture directe dans l'index construit à chaque chargement). */
function nomEquipe(id) {
  return Object.prototype.hasOwnProperty.call(nomParEquipe, id) ? nomParEquipe[id] : id;
}

/* estTermine() et echapper() sont désormais dans commun.js. */

document.addEventListener('DOMContentLoaded', initTournoi);
