/**
 * ============================================================================
 *  MODE « ÉCRANS » — barre latérale + onglets pour la page admin (grand écran)
 * ============================================================================
 *  Sur ordinateur (≥ 1024px), la longue page qui déroule devient une interface
 *  à BARRE LATÉRALE : un écran PAR ÉTAPE de la préparation (les mêmes étapes
 *  que le fil « Où en suis-je ? », qui vit désormais dans la barre latérale).
 *  Sur mobile, l'assistant à cartes reste le mode guidé (avec son verrou
 *  « Suivant ») — c'est assistant.js qui choisit au chargement.
 *
 *  VERROU (même logique que l'assistant) : un item de la barre latérale reste
 *  🔒 verrouillé tant qu'une étape PRÉCÉDENTE n'est pas ✅ complète (enregistrée /
 *  générée / répartie, d'après le « cerveau » calculerEtatsEtapes d'admin.js)
 *  ou qu'elle a des modifications non enregistrées. Une étape complète reçoit
 *  une coche ✓ bleu ciel sur fond blanc. L'après-midi ne bloque pas la
 *  Publication (elle se génère plus tard, une fois les scores du matin saisis
 *  — même règle que le verdict « prêt à publier » du cerveau).
 *
 *  Même technique éprouvée que l'assistant : on DÉPLACE les blocs existants
 *  (déplacer un nœud DOM conserve ses écouteurs) → admin.js continue de
 *  fonctionner SANS AUCUNE modification.
 *
 *  Réversible : « Vue classique » (bas de la barre latérale) remet la page
 *  longue ; sans JavaScript, la page longue s'affiche telle quelle.
 * ============================================================================
 */

/* Les écrans : un par étape du fil « Où en suis-je ? » (mêmes clés que le
   « cerveau » calculerEtatsEtapes d'admin.js), plus les Infos en tête et la
   Publication en queue. `blocs` = quels blocs EXISTANTS l'écran regroupe
   (par leur id) ; `cles` = quelles étapes du cerveau disent s'il est ✅ fait.
   zone-horaires / zone-categories vivent dans la section #reglages : on les
   déplace individuellement (et on les y remettra en « Vue classique »). */
const ECRANS_DEF = [
  { id: 'infos',       titre: 'Infos du tournoi',  icone: 'info',     blocs: ['bloc-cadre-tournoi', 'bloc-infos-tournoi'], cles: [] },
  { id: 'horaires',    titre: 'Horaires',          icone: 'horloge',  blocs: ['zone-horaires'],           cles: ['horaires'] },
  { id: 'categories',  titre: 'Catégories',        icone: 'etiquette', blocs: ['zone-categories'],        cles: ['categories'] },
  /* Phase 1 — « Inviter un club » : page unique regroupant la LISTE des clubs invités (+ ajout,
     statut, envoi individuel), l'aperçu de l'email d'invitation (+ envoi groupé), puis sa config
     (Sur place + Réponse à l'invitation). Libre : préparable très tôt. Placé AVANT les Équipes :
     les clubs qui acceptent génèrent leurs équipes automatiquement à l'envoi du dossier final. */
  { id: 'invitation',  titre: 'Inviter un club',   icone: 'courrier', blocs: ['bloc-modalites', 'bloc-clubs-invites', 'bloc-apercu-invitation', 'bloc-surplace', 'bloc-reponse'], cles: [], libre: true },
  /* Le dossier COMPLET (Phase 2), envoyé aux clubs qui ont accepté : se génère à tout moment
     (sections vides masquées), jamais verrouillé. L'écran regroupe aussi les cartes du dossier
     (modalités, parking, encadrement) : on complète, puis on génère. */
  { id: 'dossier',     titre: 'Dossier complet (accepté)', icone: 'dossier', blocs: ['bloc-parking', 'bloc-encadrement', 'bloc-contacts-securite', 'bloc-dossier'], cles: [], libre: true },
  { id: 'equipes',     titre: 'Équipes',           icone: 'equipe',   blocs: ['bloc-equipes'],            cles: ['equipes'] },
  { id: 'terrains',    titre: 'Terrains',          icone: 'terrain',  blocs: ['bloc-terrains'],           cles: ['terrains'] },
  { id: 'poules',      titre: 'Poules & planning', icone: 'poules',   blocs: ['bloc-generation'],         cles: ['poules'] },
  /* Demande d'autorisation (feuille de report du formulaire FFR) : APRÈS Poules & planning —
     elle exploite le planning généré (phases, terrains, prédictions de phase 2) — et AVANT la
     Publication (on dépose la demande avant d'annoncer). Libre : jamais verrouillée. */
  { id: 'autorisation', titre: 'Demande d\'autorisation', icone: 'dossier', blocs: ['bloc-autorisation'], cles: [], libre: true },
  /* La Publication vient AVANT l'après-midi : elle n'en dépend pas (on publie
     le matin ; l'après-midi se génère plus tard, une fois les scores saisis).

     ⭐ `libre` DEPUIS PUB-2, et ce n'est pas un assouplissement du garde-fou — c'est son
     DÉPLACEMENT au bon niveau. Cet écran ne contient plus seulement le GESTE « publier » :
     depuis PUB-2 il porte aussi l'ADRESSE de la page publique, « Copier » et « Ouvrir ».
     Or une adresse n'est pas une autorisation (doctrine D-048) : elle doit pouvoir être lue
     et communiquée TRÈS TÔT — c'est même le seul moment où cela sert (l'imprimer sur une
     affiche, la glisser dans l'email d'invitation). Verrouiller l'écran entier rendait la
     carte inatteignable exactement quand elle est utile, et lui faisait afficher une phrase
     qu'elle démentait : « tu peux la communiquer dès maintenant ».
     ⛔ Le garde-fou métier n'est PAS supprimé : il vit désormais sur le BOUTON lui-même
     (`majVerrouPublier`, admin-infos-publication.js), qui reste grisé tant que Horaires,
     Catégories, Équipes, Terrains et Poules ne sont pas ✅ — d'après le MÊME cerveau
     (`calculerEtatsEtapes`), sans seconde liste de prérequis.
     ⭐ Et il protège MIEUX qu'avant : porté par le bouton, il suit dans TOUS les modes
     d'affichage — barre latérale, assistant mobile et « Vue classique », qui échappait
     complètement au verrou d'écran.
     🔬 `cles: []` : cet écran n'a jamais rien exigé par lui-même — il HÉRITAIT du blocage
     accumulé en amont. `libre` ne change donc la séquence d'AUCUN autre écran. */
  { id: 'publication', titre: 'Publication',       icone: 'monde',    blocs: ['bloc-publication'],        cles: [], libre: true },
  /* Partenaires (sponsors de la page publique) : réglages d'affichage, fiches, puis fiche de
     visibilité à renvoyer. Placé APRÈS la Publication — on habille la page une fois qu'elle
     est en ligne. Libre : jamais verrouillé, on prépare les partenaires quand on veut, et
     l'interrupteur général reste sur « non » tant qu'on n'a pas décidé de les montrer. */
  { id: 'sponsors',    titre: 'Partenaires',       icone: 'sponsor',  blocs: ['bloc-sponsors-reglages', 'bloc-sponsors-liste', 'bloc-sponsors-bilan'], cles: [], libre: true },
  { id: 'apresmidi',   titre: 'Après-midi',        icone: 'ballon',   blocs: ['bloc-apresmidi'],          cles: ['apresmidi'] },
  /* Feuille de fin de journée : bilan des matchs joués. Jamais verrouillée (`libre`) — on peut la
     consulter à tout moment de la journée, même si tout n'est pas encore terminé. */
  { id: 'feuillejour', titre: 'Feuille de journée', icone: 'dossier', blocs: ['bloc-feuille-jour'],       cles: [], libre: true },
  /* Zone de danger, toujours accessible (libre) : on doit pouvoir remettre à
     zéro un tournoi même à moitié préparé — le verrou ne s'applique pas. */
  { id: 'reinitialisation', titre: 'Réinitialiser', icone: 'balai',   blocs: ['bloc-reinitialisation'],   cles: [], danger: true, libre: true }
];

/* Icônes filaires (SVG, trait fin arrondi, couleur = celle du texte de l'onglet).
   Dessinées dans un carré 24×24 ; chaque entrée = l'INTÉRIEUR du <svg>. */
const ECRANS_ICONES = {
  info:      '<rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M4 9h16M9 9v11"></path>',
  horloge:   '<circle cx="12" cy="12" r="8"></circle><path d="M12 7.5V12l3 2"></path>',
  etiquette: '<path d="M4 4h7.6L20 12.4a2 2 0 0 1 0 2.8l-4.8 4.8a2 2 0 0 1-2.8 0L4 11.6V4z"></path><circle cx="8.3" cy="8.3" r="1.7" fill="currentColor" stroke="none"></circle>',
  equipe:    '<circle cx="9" cy="8" r="3"></circle><circle cx="17" cy="10" r="2.3"></circle><path d="M4 19c0-2.8 2.2-5 5-5s5 2.2 5 5M15.5 15c2 .3 3.5 1.9 3.5 4"></path>',
  terrain:   '<rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M12 6v12M3 12h4M17 12h4"></path>',
  poules:    '<path d="M4 6h16M4 12h16M4 18h10"></path><circle cx="18" cy="18" r="2.4"></circle>',
  ballon:    '<ellipse cx="12" cy="12" rx="5" ry="8" transform="rotate(45 12 12)"></ellipse><path d="M9 9l6 6M10.5 7.5l6 6M7.5 10.5l6 6"></path>',
  monde:     '<circle cx="12" cy="12" r="8"></circle><path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16"></path>',
  dossier:   '<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4M9 12h6M9 16h4"></path>',
  /* Partenaires : une poignée de main stylisée (deux mains qui se rejoignent). */
  sponsor:   '<path d="M3 10.5l3-3 3.5 3.5 2.5-1 2.5 1L18 7.5l3 3"></path><path d="M3 10.5v4l4.5 4 2-2 2 2 2-2 2 2 4.5-4v-4"></path>',
  courrier:  '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3.5 7l8.5 6 8.5-6"></path>',
  balai:     '<path d="M14 4l6 6M13 5l-7 7 5 5 7-7M6 12l-2 6 6-2"></path>'
};

/** Fabrique le <svg> d'une icône de la barre latérale. */
function svgEcr(nom) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
         (ECRANS_ICONES[nom] || '') + '</svg>';
}

/* Ordre d'origine des blocs dans <main>, pour restaurer la page longue
   (« Vue classique »). #reglages reste dans <main> : on y remet ses 2 zones. */
const ECRANS_ORDRE_ORIGINE = [
  'bloc-cadre-tournoi', 'bloc-infos-tournoi', 'bloc-contacts-securite', 'reglages',
  'bloc-equipes', 'bloc-terrains', 'bloc-generation', 'bloc-apresmidi',
  'bloc-clubs-invites', 'bloc-apercu-invitation', 'bloc-surplace', 'bloc-reponse',
  'bloc-modalites', 'bloc-parking', 'bloc-encadrement', 'bloc-dossier',
  'bloc-autorisation', 'bloc-publication',
  'bloc-sponsors-reglages', 'bloc-sponsors-liste', 'bloc-sponsors-bilan',
  'bloc-reinitialisation'
];

const ECRANS_CLE_ACTIF = 'r92_ecran_admin'; // dernier écran ouvert (mémorisé)

/** Vrai si l'écran est assez grand pour la barre latérale (sinon : assistant). */
function ecransSontAdaptes() {
  return window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
}

/** Vrai si le mode écrans est actuellement affiché (utilisé par assistant.js). */
function ecransEstActif() {
  return !!document.getElementById('ecrans');
}

/** Construit la barre latérale + les écrans et y déplace les blocs existants. */
function construireEcrans() {
  const main = document.querySelector('main');
  const conteneur = document.querySelector('.conteneur');
  if (!main || !conteneur || ecransEstActif()) return;
  if (typeof retirerBoutonReprise === 'function') retirerBoutonReprise();

  document.body.classList.add('avec-ecrans');

  // --- La barre latérale (navigation = les étapes de la préparation) -------
  const nav = document.createElement('nav');
  nav.id = 'ecr-nav';
  nav.setAttribute('aria-label', "Étapes de l'administration");
  let h = '<div class="ecr-marque">' +
            '<img class="ecr-logo" src="assets/logo-tournoi.svg" alt="" onerror="this.style.display=\'none\'">' +
            '<span class="ecr-marque-titre">Administration</span>' +
            '<span class="ecr-marque-sous">Le tournoi</span>' +
          '</div>' +
          // Pourquoi une étape est inaccessible : affiché NOIR SUR BLANC au clic sur un onglet
          // grisé, EN HAUT de la barre pour rester visible quelle que soit sa longueur. Avant,
          // l'onglet se contentait de trembler — on restait bloqué sans savoir quoi enregistrer.
          '<div id="ecr-verrou-msg" class="ecr-verrou-msg" role="status" hidden></div>' +
          '<ul class="ecr-liste">';
  ECRANS_DEF.forEach(function (e) {
    h += '<li><button type="button" class="ecr-onglet' + (e.danger ? ' est-danger' : '') +
         '" data-ecran="' + e.id + '">' +
           '<span class="ecr-icone">' + svgEcr(e.icone) + '</span>' +
           '<span class="ecr-libelle">' + echapper(e.titre) + '</span>' +
           '<span class="ecr-pastille" id="ecr-pastille-' + e.id + '" hidden></span>' +
         '</button></li>';
  });
  h += '</ul>' +
       '<div class="ecr-pied">' +
         '<button type="button" class="bouton-lien ecr-classique" id="ecr-vue-classique">Vue classique ✕</button>' +
       '</div>';
  nav.innerHTML = h;
  conteneur.insertBefore(nav, conteneur.firstChild);

  // --- Les écrans (on y DÉPLACE les blocs existants : écouteurs conservés) --
  const zone = document.createElement('div');
  zone.id = 'ecrans';
  ECRANS_DEF.forEach(function (e) {
    const ecran = document.createElement('section');
    ecran.className = 'ecran';
    ecran.id = 'ecran-' + e.id;
    ecran.hidden = true;
    e.blocs.forEach(function (id) {
      const bloc = document.getElementById(id);
      if (bloc) ecran.appendChild(bloc);
    });
    zone.appendChild(ecran);
  });
  main.appendChild(zone);

  // --- Écouteurs -----------------------------------------------------------
  nav.querySelector('.ecr-liste').addEventListener('click', function (evenement) {
    const btn = evenement.target.closest('.ecr-onglet');
    if (btn) ecransActiver(btn.getAttribute('data-ecran'));
  });
  nav.querySelector('#ecr-vue-classique').addEventListener('click', quitterEcrans);

  // Verrou : toute saisie ou clic dans un écran peut changer l'état (champ
  // modifié, répartition calculée, enregistrement réussi…) → on réévalue les
  // pastilles/verrous juste après (les écouteurs métier d'admin.js d'abord).
  if (typeof assistantMajVerrouDiffere === 'function') {
    zone.addEventListener('input', assistantMajVerrouDiffere);
    zone.addEventListener('change', assistantMajVerrouDiffere);
    zone.addEventListener('click', assistantMajVerrouDiffere);
  }
  // Photo d'un formulaire jamais vu AVANT la première frappe (référence = état enregistré).
  if (typeof assistantNoterZoneInconnue === 'function') {
    zone.addEventListener('focusin', assistantNoterZoneInconnue);
  }

  // Écran de départ : le dernier ouvert s'il est accessible, sinon l'écran
  // « du moment » (la première étape pas encore ✅ faite).
  const etats = ecransEtats();
  const verrous = ecransCalculerVerrous(etats);
  let depart = null;
  try { depart = localStorage.getItem(ECRANS_CLE_ACTIF); } catch (e) { /* stockage indisponible */ }
  const iDepart = ECRANS_DEF.findIndex(function (e) { return e.id === depart; });
  if (iDepart === -1 || verrous[iDepart]) depart = ecransEcranCourant(etats);
  ecransActiver(depart, { sansScroll: true });
}

/** Les états des étapes calculés par le « cerveau » (null si pas encore prêts). */
function ecransEtats() {
  if (typeof calculerEtatsEtapes !== 'function') return null;
  try { return calculerEtatsEtapes(); } catch (e) { return null; }
}

/**
 * Verrous de la barre latérale : renvoie un tableau aligné sur ECRANS_DEF —
 * null si l'écran est accessible, sinon la RAISON humaine du blocage.
 * Un écran est verrouillé si, sur un écran PRÉCÉDENT :
 *   1) une étape du cerveau n'est pas ✅ « fait » (à faire / à refaire) ; ou
 *   2) des modifications ne sont pas enregistrées (même règle que l'assistant).
 * Exceptions : l'étape « après-midi » ne verrouille jamais la suite (elle se
 * génère plus tard, une fois les scores du matin saisis), et un écran marqué
 * `libre` (Réinitialiser) n'est JAMAIS verrouillé.
 */
function ecransCalculerVerrous(etats) {
  const verrous = [];
  let blocage = null; // première raison rencontrée en remontant les écrans
  ECRANS_DEF.forEach(function (def) {
    verrous.push(def.libre ? null : blocage);
    if (blocage) return; // déjà bloqué en amont : inutile de chercher plus loin
    // Un écran LIBRE est une voie PARALLÈLE et facultative (inviter un club, dossier, demande
    // d'autorisation, feuille de journée, réinitialisation) : il n'est jamais verrouillé, et il ne
    // doit pas davantage verrouiller la SUITE. Sans ce retour, une simple retouche non enregistrée
    // dans « Inviter un club » gelait Équipes, Terrains, Poules, Publication et Après-midi — le
    // chemin principal était bloqué par une étape explicitement déclarée optionnelle.
    if (def.libre) return;
    (def.cles || []).forEach(function (cle) {
      if (cle === 'apresmidi') return; // ne bloque jamais la suite
      const e = (etats || []).find(function (x) { return x.cle === cle; });
      if (!blocage && e && e.statut !== 'fait') blocage = e.titre + ' — ' + e.detail;
    });
    if (!blocage) {
      const modifs = ecransRaisonsModifs(def);
      if (modifs.length) blocage = modifs[0];
    }
  });
  return verrous;
}

/** Modifications non enregistrées sur un écran (réutilise la détection de
 *  l'assistant : formulaires ≠ dernière « photo » enregistrée + états en attente). */
function ecransRaisonsModifs(def) {
  const ecran = document.getElementById('ecran-' + def.id);
  if (!ecran || typeof raisonsModifsDans !== 'function') return [];
  return raisonsModifsDans(def.id, ecran, ecransZonesSurveillees());
}

/** Zones surveillées : les formulaires des écrans + la zone terrains (champs
 *  sans <form>). #form-equipe et #form-club-invite sont exclus : règle dédiée
 *  (formulaires d'ajout immédiat, pas d'état « enregistré » à comparer). */
function ecransZonesSurveillees() {
  const zone = document.getElementById('ecrans');
  if (!zone) return [];
  const zones = [];
  zone.querySelectorAll('form').forEach(function (f) {
    if (f.id === 'form-equipe' || f.id === 'form-club-invite') return;
    zones.push(f);
  });
  const zt = document.getElementById('zone-terrains');
  if (zt && zone.contains(zt)) zones.push(zt);
  return zones;
}

/** L'écran « du moment » : le premier dont une étape n'est pas encore ✅ faite
 *  (c'est là que le travail continue). Tout est fait → Publication. */
function ecransEcranCourant(etats) {
  for (let i = 0; i < ECRANS_DEF.length; i++) {
    const def = ECRANS_DEF[i];
    for (let k = 0; k < def.cles.length; k++) {
      const e = (etats || []).find(function (x) { return x.cle === def.cles[k]; });
      if (e && e.statut !== 'fait') return def.id;
    }
  }
  return 'publication';
}

/**
 * Affiche l'écran demandé (et masque les autres). Refuse si l'écran est
 * 🔒 verrouillé (une étape précédente n'est pas complète) : l'onglet tremble
 * et son infobulle explique quoi terminer d'abord.
 * @param {string}  id                 id logique ('infos', 'horaires', …)
 * @param {Object}  [opt]
 * @param {boolean} [opt.sansScroll]   ne pas remonter en haut (1er affichage, fil d'étapes)
 */
function ecransActiver(id, opt) {
  opt = opt || {};
  const idx = ECRANS_DEF.findIndex(function (e) { return e.id === id; });
  if (idx === -1) return;

  // VERROU : impossible d'ouvrir un écran tant qu'une étape précédente n'est
  // pas complète. (Revenir en arrière reste toujours possible : les écrans
  // déjà faits ne sont jamais verrouillés.)
  const verrous = ecransCalculerVerrous(ecransEtats());
  if (verrous[idx]) { ecransSecouerOnglet(id); ecransDireVerrou(verrous[idx]); return; }
  ecransDireVerrou(null); // écran ouvert : plus rien à expliquer

  ECRANS_DEF.forEach(function (e) {
    const ecran = document.getElementById('ecran-' + e.id);
    if (ecran) ecran.hidden = (e.id !== id);
  });
  document.querySelectorAll('.ecr-onglet').forEach(function (btn) {
    const actif = btn.getAttribute('data-ecran') === id;
    btn.classList.toggle('est-actif', actif);
    if (actif) {
      btn.setAttribute('aria-current', 'page');
      // Fenêtre étroite : la barre d'onglets défile → on garde l'actif visible.
      if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else {
      btn.removeAttribute('aria-current');
    }
  });
  try { localStorage.setItem(ECRANS_CLE_ACTIF, id); } catch (e) { /* stockage indisponible */ }
  ecransMajPastilles();
  // ⭐ B2-0.5 — on ARRIVE sur la feuille FFR : si des écritures l'ont rendue fausse depuis, on la
  //   relit MAINTENANT. Une seule route vers le serveur, quel que soit le nombre d'écritures —
  //   et zéro route si rien n'a changé. ⚠️ JUMEAU du crochet d'assistant.js : l'écart entre ces
  //   deux fichiers est exactement ce qui avait produit R-098, ils se modifient ENSEMBLE.
  if (id === 'autorisation' && typeof majAutorisationSiObsolete === 'function') {
    majAutorisationSiObsolete().catch(function () { /* la feuille garde son message */ });
  }
  if (!opt.sansScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Dit POURQUOI un écran est verrouillé (ou efface le message si `raison` est nulle).
 *  L'explication s'efface d'elle-même au bout de quelques secondes. */
let ecransVerrouTimer = null;
function ecransDireVerrou(raison) {
  const zone = document.getElementById('ecr-verrou-msg');
  if (!zone) return;
  if (ecransVerrouTimer) { clearTimeout(ecransVerrouTimer); ecransVerrouTimer = null; }
  if (!raison) { zone.hidden = true; zone.textContent = ''; return; }
  zone.hidden = false;
  zone.innerHTML = '🔒 <strong>Pour ouvrir cette étape, termine d\'abord&nbsp;:</strong><br>' + echapper(raison);
  ecransVerrouTimer = setTimeout(function () {
    zone.hidden = true; zone.textContent = ''; ecransVerrouTimer = null;
  }, 12000);
}

/** Petit tremblement de l'onglet quand on clique un écran verrouillé. */
function ecransSecouerOnglet(id) {
  const btn = document.querySelector('.ecr-onglet[data-ecran="' + id + '"]');
  if (!btn) return;
  btn.classList.remove('est-secoue');
  void btn.offsetWidth; // relance l'animation CSS
  btn.classList.add('est-secoue');
}

/** Ouvre l'écran qui contient le bloc demandé, puis défile jusqu'à lui.
 *  Appelé (via assistant.js) quand on clique un lien du verdict « prêt à
 *  publier ». Si l'écran visé est verrouillé, on ouvre l'écran « du moment ». */
function ecransAllerVersBloc(blocId) {
  const bloc = document.getElementById(blocId);
  const ecran = bloc && bloc.closest('.ecran');
  if (!ecran) return;
  const def = ECRANS_DEF.find(function (e) { return 'ecran-' + e.id === ecran.id; });
  if (!def) return;
  const etats = ecransEtats();
  const idx = ECRANS_DEF.indexOf(def);
  if (ecransCalculerVerrous(etats)[idx]) {
    ecransActiver(ecransEcranCourant(etats), { sansScroll: true });
    return;
  }
  ecransActiver(def.id, { sansScroll: true });
  if (bloc.scrollIntoView) bloc.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Pastilles + verrous de la barre latérale, nourris par le « cerveau » :
 *   ✓ fait (coche ciel sur fond blanc) · ⚪️ à faire · 🟠 « ! » à refaire ·
 *   🔒 verrouillé (une étape précédente n'est pas complète).
 *  Appelée après chaque majEtatAvancement() via assistantMajVerrou (assistant.js).
 *  Si l'écran AFFICHÉ vient d'être verrouillé (ex. réinitialisation), on
 *  bascule automatiquement sur l'écran « du moment ».
 */
function ecransMajPastilles() {
  if (!ecransEstActif()) return;
  const etats = ecransEtats();
  if (!etats) return; // données pas encore chargées
  const verrous = ecransCalculerVerrous(etats);

  ECRANS_DEF.forEach(function (def, i) {
    const btn = document.querySelector('.ecr-onglet[data-ecran="' + def.id + '"]');
    const pastille = document.getElementById('ecr-pastille-' + def.id);
    if (!btn || !pastille) return;

    const verrou = verrous[i];
    btn.classList.toggle('est-verrouille', !!verrou);
    btn.setAttribute('aria-disabled', verrou ? 'true' : 'false');

    pastille.classList.remove('est-fait', 'est-afaire', 'est-arefaire', 'est-verrou');
    const concernes = etats.filter(function (e) { return def.cles.indexOf(e.cle) !== -1; });

    if (verrou) {
      // Écran hors de portée : cadenas + explication en infobulle.
      pastille.hidden = false;
      pastille.classList.add('est-verrou');
      pastille.innerHTML = (typeof svgIcone === 'function') ? svgIcone('verrou') : '🔒';
      btn.title = 'Termine d\'abord : ' + verrou;
      return;
    }
    btn.title = concernes.map(function (e) { return e.titre + ' : ' + e.detail; }).join(' · ');
    if (!concernes.length) { pastille.hidden = true; return; }
    pastille.hidden = false;
    const arefaire = concernes.some(function (e) { return e.statut === 'arefaire'; });
    const pasFait  = concernes.some(function (e) { return e.statut !== 'fait'; });
    if (arefaire)     { pastille.classList.add('est-arefaire'); pastille.textContent = '!'; }
    else if (pasFait) { pastille.classList.add('est-afaire');   pastille.textContent = '';  }
    else              { pastille.classList.add('est-fait');     pastille.textContent = '✓'; }
  });

  // L'écran affiché vient d'être verrouillé (ex. tournoi réinitialisé depuis
  // la Publication) → on ramène l'utilisateur là où le travail reprend.
  const actif = document.querySelector('.ecr-onglet.est-actif');
  const idxActif = actif ? ECRANS_DEF.findIndex(function (e) { return e.id === actif.getAttribute('data-ecran'); }) : -1;
  if (idxActif !== -1 && verrous[idxActif]) {
    ecransActiver(ecransEcranCourant(etats), { sansScroll: true });
  }
}

/** Quitte le mode écrans : remet les blocs à leur place d'origine (page longue),
 *  mémorise le choix, et propose le bouton de retour au mode guidé. */
function quitterEcrans() {
  const main = document.querySelector('main');
  const zone = document.getElementById('ecrans');
  if (!main || !zone) return;

  // Les 2 zones de réglages retournent dans leur section #reglages…
  const reglages = document.getElementById('reglages');
  ['zone-horaires', 'zone-categories'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el && reglages) reglages.appendChild(el);
  });
  // …puis chaque bloc retrouve sa place dans <main>, dans l'ordre d'origine.
  ECRANS_ORDRE_ORIGINE.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) main.appendChild(el);
  });

  zone.remove();
  const nav = document.getElementById('ecr-nav');
  if (nav) nav.remove();
  document.body.classList.remove('avec-ecrans');

  try { localStorage.setItem(ASSISTANT_CLE_PREF, 'classique'); } catch (e) { /* stockage indisponible */ }
  if (typeof afficherBoutonReprise === 'function') afficherBoutonReprise();
}

