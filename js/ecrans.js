/**
 * ============================================================================
 *  MODE « ÉCRANS » — barre latérale + onglets pour la page admin (grand écran)
 * ============================================================================
 *  Sur ordinateur (≥ 1024px), la longue page qui déroule devient une interface
 *  à BARRE LATÉRALE : un écran PAR ÉTAPE de la préparation (les mêmes étapes
 *  que le fil « Où en suis-je ? », qui vit désormais dans la barre latérale).
 *  Sur mobile, l'assistant à cartes reste le mode guidé — c'est assistant.js qui
 *  choisit au chargement.
 *
 *  MODE DÉMO : tous les onglets de la barre latérale sont directement accessibles,
 *  quel que soit l'avancement. Les pastilles continuent d'indiquer « fait / à faire /
 *  à refaire », mais ne deviennent plus des cadenas. Cette liberté de navigation
 *  ne retire aucune protection métier portée par les actions elles-mêmes.
 *
 *  Même technique éprouvée que l'assistant : on DÉPLACE les blocs existants
 *  (déplacer un nœud DOM conserve ses écouteurs) → admin.js continue de
 *  fonctionner SANS AUCUNE modification.
 *
 *  ⛔ PLUS DE « VUE CLASSIQUE » (CORR-UX-PERF-DR-3B). Le mode guidé est le SEUL
 *  mode : barre latérale ici, cartes sur mobile. La page longue du HTML reste le
 *  REPLI NATUREL si JavaScript ne démarre pas — ce n'est plus un mode qu'on
 *  choisit, c'est ce que le navigateur affiche faute de mieux.
 *  ⭐ Et c'est cette suppression qui rend possible le chargement différé : un seul
 *  écran étant visible à la fois, plus rien n'oblige à remplir les autres d'avance
 *  (voir `ouvrirEtapeAdmin`, admin.js).
 * ============================================================================
 */

/* Les écrans : un par étape du fil « Où en suis-je ? » (mêmes clés que le
   « cerveau » calculerEtatsEtapes d'admin.js), plus les Infos en tête et la
   Publication en queue. `blocs` = quels blocs EXISTANTS l'écran regroupe
   (par leur id) ; `cles` = quelles étapes du cerveau disent s'il est ✅ fait.
   zone-horaires / zone-categories vivent dans la section #reglages : on les
   déplace individuellement. */
const ECRANS_DEF = [
  { id: 'infos',       titre: 'Infos du tournoi',  icone: 'info',     blocs: ['bloc-choix-categories', 'bloc-cadre-tournoi', 'bloc-infos-tournoi'], cles: [] },
  { id: 'horaires',    titre: 'Horaires',          icone: 'horloge',  blocs: ['zone-horaires'],           cles: ['horaires'] },
  { id: 'categories',  titre: 'Catégories',        icone: 'etiquette', blocs: ['zone-categories'],        cles: ['categories'] },
  /* « Inviter un club » regroupe désormais tout le parcours : les clubs invités restent visibles
     en tête, puis deux dépliants portent l'invitation initiale et le dossier final. Libre : cette
     préparation reste accessible très tôt, avant les Équipes. */
  { id: 'invitation',  titre: 'Inviter un club',   icone: 'courrier', blocs: ['bloc-clubs-invites', 'bloc-invitation-initiale', 'bloc-dossier-final'], cles: [], libre: true },
  { id: 'suivi-clubs', titre: 'Suivi des clubs',   icone: 'suivi',    blocs: ['bloc-suivi-clubs'], cles: [], libre: true },
  { id: 'equipes',     titre: 'Équipes',           icone: 'equipe',   blocs: ['bloc-equipes'],            cles: ['equipes'] },
  { id: 'terrains',    titre: 'Terrains',          icone: 'terrain',  blocs: ['bloc-terrains'],           cles: ['terrains'] },
  { id: 'poules',      titre: 'Poules & planning', icone: 'poules',   blocs: ['bloc-generation'],         cles: ['poules'] },
  /* Demande d'autorisation (feuille de report du formulaire FFR) : APRÈS Poules & planning —
     elle exploite le planning généré (phases, terrains, prédictions de phase 2) — et AVANT la
     Publication (on dépose la demande avant d'annoncer). Libre : jamais verrouillée. */
  { id: 'autorisation', titre: 'Demande d\'autorisation', icone: 'dossier', blocs: ['bloc-autorisation'], cles: [], libre: true },
  /* Partenaires (sponsors de la page publique) : réglages d'affichage, fiches, puis fiche de
     visibilité à renvoyer. Placé AVANT la Publication — on prépare l'habillage de la page
     avant de la mettre en ligne. Libre : jamais verrouillé, on prépare les partenaires quand
     on veut, et l'interrupteur général reste sur « non » tant qu'on ne les publie pas. */
  { id: 'sponsors',    titre: 'Partenaires',       icone: 'sponsor',  blocs: ['bloc-sponsors-accueil', 'bloc-sponsors-reglages', 'bloc-sponsors-liste', 'bloc-sponsors-bilan'], cles: [], libre: true },
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
     d'affichage — barre latérale, assistant mobile, et jusqu'au repli sans JavaScript, qui
     échappait complètement au verrou d'écran.
     🔬 `cles: []` : cet écran n'a jamais rien exigé par lui-même — il HÉRITAIT du blocage
     accumulé en amont. `libre` ne change donc la séquence d'AUCUN autre écran. */
  { id: 'publication', titre: 'Publication',       icone: 'monde',    blocs: ['bloc-publication'],        cles: [], libre: true },
  { id: 'apresmidi',   titre: 'Après-midi',        icone: 'ballon',   blocs: ['bloc-apresmidi'],          cles: ['apresmidi'] },
  /* Feuille de fin de journée : bilan des matchs joués. Jamais verrouillée (`libre`) — on peut la
     consulter à tout moment de la journée, même si tout n'est pas encore terminé. */
  { id: 'feuillejour', titre: 'Feuille de journée', icone: 'dossier', blocs: ['bloc-feuille-jour'],       cles: [], libre: true },
  /* Zone de danger, toujours accessible (libre) : on doit pouvoir remettre à
     zéro un tournoi même à moitié préparé — le verrou ne s'applique pas. */
  { id: 'reinitialisation', titre: 'Réinitialiser', icone: 'balai',   blocs: ['bloc-reinitialisation'],   cles: [], danger: true, libre: true }
];

/* Ordre métier des cartes de la première invitation. Elles restent les blocs d'origine : ce
   regroupement ne recrée aucun formulaire et conserve donc tous leurs écouteurs. */
const INVITATION_INITIALE_BLOCS = [
  'bloc-modalites',
  'bloc-reponse',
  'bloc-contacts-securite',
  'bloc-pieces-jointes-invitation',
  'bloc-surplace',
  'bloc-apercu-invitation'
];

const DOSSIER_FINAL_BLOCS = [
  'bloc-parking',
  'bloc-encadrement',
  'bloc-pieces-jointes-dossier',
  'bloc-dossier',
  'bloc-apercu-dossier-email'
];

/** Regroupe les cartes de la première invitation dans un dépliant natif, fermé par défaut. */
function preparerInvitationInitiale() {
  const clubs = document.getElementById('bloc-clubs-invites');
  let groupe = document.getElementById('bloc-invitation-initiale');

  if (!groupe) {
    if (!clubs || !clubs.parentNode) return null;
    groupe = document.createElement('details');
    groupe.id = 'bloc-invitation-initiale';
    groupe.className = 'carte invitation-initiale';
    const titre = document.createElement('summary');
    titre.textContent = 'Invitation initiale';
    groupe.appendChild(titre);
    clubs.parentNode.insertBefore(groupe, clubs.nextSibling);
  }

  INVITATION_INITIALE_BLOCS.forEach(function (id) {
    const bloc = document.getElementById(id);
    if (bloc) groupe.appendChild(bloc);
  });
  return groupe;
}

/** Place les cartes de la phase 2 dans un second dépliant, sous l'invitation initiale. */
function preparerDossierFinal() {
  const invitationInitiale = preparerInvitationInitiale();
  let groupe = document.getElementById('bloc-dossier-final');

  if (!groupe) {
    if (!invitationInitiale || !invitationInitiale.parentNode) return null;
    groupe = document.createElement('details');
    groupe.id = 'bloc-dossier-final';
    groupe.className = 'carte dossier-final';
    const titre = document.createElement('summary');
    titre.textContent = 'Dossier final';
    groupe.appendChild(titre);
    invitationInitiale.parentNode.insertBefore(groupe, invitationInitiale.nextSibling);
  }

  DOSSIER_FINAL_BLOCS.forEach(function (id) {
    const bloc = document.getElementById(id);
    if (bloc) groupe.appendChild(bloc);
  });
  return groupe;
}

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
  suivi:     '<path d="M5 4h14v16H5zM8 8l1.5 1.5L12 7M8 14l1.5 1.5L12 13M14 9h3M14 15h3"></path>',
  balai:     '<path d="M14 4l6 6M13 5l-7 7 5 5 7-7M6 12l-2 6 6-2"></path>'
};

/** Fabrique le <svg> d'une icône de la barre latérale. */
function svgEcr(nom) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
         (ECRANS_ICONES[nom] || '') + '</svg>';
}

/** Vrai si l'écran est assez grand pour la barre latérale (sinon : assistant). */
function ecransSontAdaptes() {
  return !!window.matchMedia;
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

  preparerInvitationInitiale();
  preparerDossierFinal();

  document.body.classList.add('avec-ecrans');

  // --- La barre latérale (navigation = les étapes de la préparation) -------
  const nav = document.createElement('nav');
  nav.id = 'ecr-nav';
  nav.setAttribute('aria-label', "Étapes de l'administration");
  let h = '<div class="ecr-marque">' +
            '<img class="ecr-logo" src="assets/logo-tournoi.svg" alt="" onerror="this.style.display=\'none\'">' +
            '<span class="ecr-marque-titre">MaxiLou</span>' +
            '<span class="ecr-marque-sous">Démo Racing</span>' +
          '</div>' +
          '<ul class="ecr-liste">';
  const groupes = { infos: 'Préparer', terrains: 'Organiser', sponsors: 'Diffuser', apresmidi: 'Jour J' };
  ECRANS_DEF.forEach(function (e) {
    if (groupes[e.id]) h += '<li class="ecr-groupe">' + groupes[e.id] + '</li>';
    h += '<li><button type="button" class="ecr-onglet' + (e.danger ? ' est-danger' : '') +
         '" data-ecran="' + e.id + '">' +
           '<span class="ecr-icone">' + svgEcr(e.icone) + '</span>' +
           '<span class="ecr-libelle">' + echapper(e.titre) + '</span>' +
           '<span class="ecr-pastille" id="ecr-pastille-' + e.id + '" hidden></span>' +
         '</button></li>';
  });
  h += '</ul>';
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
  construireCadreCiel(main, zone);

  // --- Écouteurs -----------------------------------------------------------
  nav.querySelector('.ecr-liste').addEventListener('click', function (evenement) {
    const btn = evenement.target.closest('.ecr-onglet');
    if (btn) ecransActiver(btn.getAttribute('data-ecran'));
  });

  zone.addEventListener('click', function (evenement) {
    if(evenement.target.closest('[data-cv-categories]')){ecransActiver('categories');return;}
    // « Voir les matchs à compléter » : ouvre le planning SUR la catégorie concernée.
    const versMatchs=evenement.target.closest('[data-cv-matchs]');
    if(versMatchs){
      if(typeof activerCategoriePlanning==='function')activerCategoriePlanning(versMatchs.getAttribute('data-cv-matchs'));
      if(typeof activerPhasePlanning==='function')activerPhasePlanning('matin');
      ecransActiver('poules');
      if(typeof rafraichirPlanning==='function')rafraichirPlanning();
      return;
    }
    // ⛔ Le lien de la table de marque porte un jeton : on n'en recopie pas un second ici. On
    //    conduit à l'écran Publication, qui pilote cet accès et reste la seule source du lien.
    if(evenement.target.closest('[data-cv-publication]')){ecransActiver('publication');return;}
    const bouton = evenement.target.closest('.cv-fermer-club');
    if (!bouton) return;
    const detail = bouton.closest('details');
    detail.open = false;
    detail.querySelector('summary').focus();
  });

  // Toute saisie ou clic dans un écran peut changer son état (champ modifié,
  // répartition calculée, enregistrement réussi…) : on réévalue les pastilles
  // juste après, une fois les écouteurs métier d'admin.js passés.
  if (typeof assistantMajVerrouDiffere === 'function') {
    zone.addEventListener('input', assistantMajVerrouDiffere);
    zone.addEventListener('change', assistantMajVerrouDiffere);
    zone.addEventListener('click', assistantMajVerrouDiffere);
  }
  // Photo d'un formulaire jamais vu AVANT la première frappe (référence = état enregistré).
  if (typeof assistantNoterZoneInconnue === 'function') {
    zone.addEventListener('focusin', assistantNoterZoneInconnue);
  }

  ecransActiver(ecransEcranDeDepart(), { sansScroll: true });
}

/**
 * ⭐ L'ÉCRAN D'OUVERTURE — toujours « Infos », et c'est une GARANTIE, pas une préférence.
 *
 * ⛔ CE QUI A ÉTÉ RETIRÉ, ET POURQUOI (R1). Cette fonction restaurait le dernier écran ouvert
 * (`r92_ecran_admin`), et à défaut ouvrait « l'écran du moment » — la première étape pas encore
 * faite. Les deux pouvaient désigner Inviter, Dossier, Autorisation ou Partenaires : l'ouverture
 * déclenchait alors leurs lectures différées AVANT toute action de l'organisateur, et la page
 * partait à 4 ou 5 appels au lieu de 3. ⚠️ Le défaut ne se voyait pas sur un navigateur neuf —
 * il n'apparaissait qu'à la DEUXIÈME visite, celle de tous les jours.
 *
 * ⭐ Ouvrir sur « Infos » rend la garantie DÉTERMINISTE : cet écran ne réclame aucune lecture
 * (il est absent d'`ADMIN_ETAPES`), donc l'ouverture coûte exactement `getAll`,
 * `getConfigAdmin` et `getRefFFR`, quel que soit l'état du navigateur ou du tournoi.
 * ⛔ Les lectures différées ne partent QUE sur une navigation explicite.
 * ⚠️ Si un écran de départ mémorisé revenait un jour, il faudrait le restreindre aux écrans
 * SANS ressource — sans quoi ce plafond de trois appels retomberait.
 */
function ecransEcranDeDepart() {
  return 'infos';
}

/** Les états des étapes calculés par le « cerveau » (null si pas encore prêts). */
function ecransEtats() {
  if (typeof calculerEtatsEtapes !== 'function') return null;
  try { return calculerEtatsEtapes(); } catch (e) { return null; }
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
 * Affiche l'écran demandé (et masque les autres). En mode démo, chaque onglet
 * est joignable directement, même si les étapes précédentes restent à faire.
 * @param {string}  id                 id logique ('infos', 'horaires', …)
 * @param {Object}  [opt]
 * @param {boolean} [opt.sansScroll]   ne pas remonter en haut (1er affichage, fil d'étapes)
 */
function ecransActiver(id, opt) {
  opt = opt || {};
  const idx = ECRANS_DEF.findIndex(function (e) { return e.id === id; });
  if (idx === -1) return;

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
  const titreCiel = document.getElementById('cv-titre-page');
  if (titreCiel) titreCiel.textContent = ECRANS_DEF[idx].titre;
  const description=document.getElementById('cv-description-page');
  if(description) description.textContent=DESCRIPTIONS_CIEL[id] || '';
  const menuEtaitOuvert = document.body.classList.contains("cv-menu-ouvert");
  fermerMenuCiel();
  if (menuEtaitOuvert && titreCiel) titreCiel.focus();
  ecransMajPastilles();
  // ⭐ ARRIVÉE SUR UNE ÉTAPE — point de passage UNIQUE, partagé avec `allerA` (assistant.js) :
  //   il porte À LA FOIS le chargement différé des lectures de l'écran et le rattrapage
  //   d'obsolescence de la feuille FFR (B2-0.5). ⚠️ Les deux parcours appellent la MÊME
  //   fonction : c'est l'écart entre ces deux fichiers qui avait produit R-098, il n'y a
  //   désormais plus rien à tenir en double.
  if (typeof ouvrirEtapeAdmin === 'function') ouvrirEtapeAdmin(id);
  if (!opt.sansScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Ouvre l'écran qui contient le bloc demandé, puis défile jusqu'à lui.
 *  Appelé (via assistant.js) quand on clique un lien du verdict « prêt à
 *  publier ». */
function ecransAllerVersBloc(blocId) {
  const bloc = document.getElementById(blocId);
  const ecran = bloc && bloc.closest('.ecran');
  if (!ecran) return;
  const def = ECRANS_DEF.find(function (e) { return 'ecran-' + e.id === ecran.id; });
  if (!def) return;
  ecransActiver(def.id, { sansScroll: true });
  if (bloc.scrollIntoView) bloc.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Pastilles d'état de la barre latérale, nourries par le « cerveau » :
 *   ✓ fait (coche ciel sur fond blanc) · ⚪️ à faire · 🟠 « ! » à refaire.
 *  Appelée après chaque majEtatAvancement() via assistantMajVerrou (assistant.js).
 */
function ecransMajPastilles() {
  if (!ecransEstActif()) return;
  const etats = ecransEtats();
  if (!etats) return; // données pas encore chargées
  ECRANS_DEF.forEach(function (def) {
    const btn = document.querySelector('.ecr-onglet[data-ecran="' + def.id + '"]');
    const pastille = document.getElementById('ecr-pastille-' + def.id);
    if (!btn || !pastille) return;

    // Nettoyage explicite pour une page qui aurait chargé une ancienne version du script :
    // aucun onglet de la démo ne doit conserver un état visuel ou ARIA verrouillé.
    btn.classList.remove('est-verrouille');
    btn.removeAttribute('aria-disabled');
    pastille.classList.remove('est-fait', 'est-afaire', 'est-arefaire', 'est-verrou');
    const concernes = etats.filter(function (e) { return def.cles.indexOf(e.cle) !== -1; });
    btn.title = concernes.map(function (e) { return e.titre + ' : ' + e.detail; }).join(' · ');
    if (!concernes.length) { pastille.hidden = true; return; }
    pastille.hidden = false;
    const arefaire = concernes.some(function (e) { return e.statut === 'arefaire'; });
    const pasFait  = concernes.some(function (e) { return e.statut !== 'fait'; });
    if (arefaire)     { pastille.classList.add('est-arefaire'); pastille.textContent = '!'; }
    else if (pasFait) { pastille.classList.add('est-afaire');   pastille.textContent = '';  }
    else              { pastille.classList.add('est-fait');     pastille.textContent = '✓'; }
  });

}

/** Cadre commun, sans clone de formulaire ni nouvel appel API. */
function construireCadreCiel(main, zone) {
  const entete = document.createElement('header');
  entete.className = 'cv-entete cv-verre';
  entete.innerHTML = '<button type="button" class="cv-menu bouton-lien" aria-controls="ecr-nav" aria-expanded="false">Menu</button>' +
    '<div class="cv-identite"><div class="cv-identite-ligne"><strong id="cv-nom-tournoi"></strong><span id="cv-publication-statut" class="cv-pastille"></span></div><span id="cv-meta-tournoi">Administration du tournoi</span></div>' +
    '<a class="cv-public" href="tournoi.html" target="_blank" rel="noopener">Voir le tournoi ↗</a>' +
    '<details class="cv-session"><summary><span class="cv-avatar" aria-hidden="true">DR</span><span id="cv-session-libelle">Session</span></summary></details>';
  const connexion = document.getElementById('barre-connexion');
  if (connexion) entete.querySelector('details').appendChild(connexion);
  main.insertBefore(entete, main.firstChild);
  const titre = document.createElement('h1'); titre.id='cv-titre-page'; titre.className='cv-titre-page'; titre.tabIndex=-1;
  main.insertBefore(titre, zone);
  const description=document.createElement('p'); description.id='cv-description-page';description.className='cv-description-page';main.insertBefore(description,zone);
  const synthese = document.createElement('details'); synthese.className='cv-synthese';
  synthese.innerHTML='<summary>État du tournoi et avancement</summary>';
  ['tableau-bord','etat-avancement'].forEach(id=>{const el=document.getElementById(id);if(el)synthese.appendChild(el);});
  synthese.classList.add('cv-verre');
  main.appendChild(synthese);
  const menu=entete.querySelector('.cv-menu');
  menu.addEventListener('click',()=>{const ouvert=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(ouvert));document.body.classList.toggle('cv-menu-ouvert',ouvert);if(ouvert)document.querySelector('.ecr-onglet.est-actif').focus();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('cv-menu-ouvert')){fermerMenuCiel();menu.focus();}});
  document.addEventListener('click',e=>{if(!e.target.closest('#ecr-nav,.cv-menu'))fermerMenuCiel();});
  const infos=document.getElementById('ecran-infos'); if(infos){infos.classList.add('cv-infos');infos.prepend(document.getElementById('bloc-infos-tournoi'));}
  preparerOutilsCiel();
  actualiserCadreCiel();
}
function fermerMenuCiel() {
  document.body.classList.remove('cv-menu-ouvert');
  const menu=document.querySelector('.cv-menu');if(menu)menu.setAttribute('aria-expanded','false');
}
function actualiserCadreCiel() {
  const nom=document.getElementById('cv-nom-tournoi');
  const g=configCourante.global || {};
  if(nom)nom.textContent=g.tournoi_nom||'Démo Racing';
  const meta=document.getElementById('cv-meta-tournoi');
  if(meta)meta.textContent=[g.tournoi_date ? formaterDateFr(g.tournoi_date) : '',g.tournoi_lieu].filter(Boolean).join(' · ') || 'Administration du tournoi';
  const statut=document.getElementById('cv-publication-statut');
  if(statut){statut.textContent=estPublie()?'✓ Publié':'Non publié';statut.className='cv-pastille '+(estPublie()?'cv-succes':'cv-neutre');statut.hidden=!adminConnecte;}
  const session=document.querySelector('.cv-session');
  if(session){session.open=!adminConnecte;document.getElementById('cv-session-libelle').textContent=adminConnecte?'Démo Racing':'Se connecter';}
  document.body.classList.toggle('cv-sans-session',!adminConnecte);

}

const DESCRIPTIONS_CIEL = {
 infos:'Renseignez les informations générales de votre tournoi.',
 horaires:'Définissez les temps forts de la journée et visualisez leur enchaînement.',
 categories:'Définissez les formats de jeu et paramètres pour chaque catégorie.',
 invitation:'Retrouvez vos contacts et préparez les invitations aux clubs.',
 'suivi-clubs':'Une vue claire des réponses, des commandes et des paiements.',
 equipes:'Gérez les équipes participantes et leurs effectifs.',
 terrains:'Déclarez les grands terrains et prévisualisez la répartition des mini-terrains.',
 poules:'Consultez les rencontres par horaire et par terrain.',
 autorisation:'Préparez les informations et les documents nécessaires à votre demande.',
 sponsors:'Gérez les partenaires, leurs emplacements et leurs résultats.',
 publication:'Pilotez la visibilité du tournoi et l’accès à la table de marque.',
 apresmidi:'Vérifiez les scores du matin avant de générer les rencontres de l’après-midi.',
 feuillejour:'Retrouvez les matchs et les résultats de la journée.',
 reinitialisation:'Préparez une nouvelle édition en conservant les données permanentes du club.'
};
/**
 * UNE SEULE carte « Informations générales » : l'identité du tournoi PUIS les catégories
 * accueillies. Le formulaire des catégories est DÉPLACÉ tel quel (ses écouteurs de soumission
 * et de changement, posés sur le <form> lui-même par admin.js, sont donc conservés), et la
 * description le suit : rattachée à #form-infos-tournoi par l'attribut `form`, exactement comme
 * le champ de l'affiche ci-dessus, elle reste lue par lireInfosTournoi().
 */
function regrouperInfosGenerales(form) {
 const carte=document.getElementById('bloc-infos-tournoi');
 const bloc=document.getElementById('bloc-choix-categories');
 const formCategories=document.getElementById('form-choix-categories');
 const description=form.querySelector('[name="tournoi_description"]');
 if(!carte||!bloc||!formCategories||!description)return;
 const champ=document.createElement('div');champ.className='cv-champ-categories';
 champ.innerHTML='<span class="r-libelle" id="cv-libelle-categories">Catégories proposées</span>';
 formCategories.setAttribute('aria-labelledby','cv-libelle-categories');
 champ.appendChild(formCategories);
 carte.appendChild(champ);
 description.setAttribute('form','form-infos-tournoi');
 const ligne=description.closest('label');
 ligne.querySelector('.r-libelle').textContent='Description (optionnelle)';
 carte.appendChild(ligne);
 bloc.hidden=true; // vidé de son formulaire : on garde la section (et ses ancres) hors de l'œil
 const note=carte.querySelector('.note-generation');if(note)note.remove(); // les libellés des champs suffisent
}

/**
 * Carte « Date & vérification » : la date et la zone, puis le verdict FFR. L'encart « À savoir »
 * est STATIQUE (il explique le contrôle, il ne le rend pas) : il vit donc dans la carte, pas dans
 * #bloc-conformite-ffr dont le contenu est réécrit à chaque vérification.
 */
function preparerDateVerification() {
 const carte=document.getElementById('bloc-cadre-tournoi');
 if(!carte||carte.querySelector('.cv-ffr-asavoir'))return;
 carte.querySelector('h2').textContent='Date & vérification';
 const note=carte.querySelector('.note-generation');if(note)note.remove();
 const date=carte.querySelector('[name="tournoi_date"]');
 const libelle=date&&date.closest('label').querySelector('.r-libelle');
 if(libelle)libelle.textContent='Date du tournoi';
 const asavoir=document.createElement('div');
 asavoir.className='cv-information cv-ffr-asavoir';
 asavoir.innerHTML='<span class="ffr-statut-pastille" aria-hidden="true">'+svgIcone('info')+'</span>'+
   '<span class="cv-information-texte"><strong>À savoir</strong>Les dates sont vérifiées automatiquement avec le '+
   'calendrier FFR (zones de vacances, jours de vigilance, prescriptions par catégorie). Le contrôle reste '+
   'informatif : la date peut être enregistrée malgré une alerte.</span>';
 const zone=document.getElementById('bloc-conformite-ffr');
 if(zone)zone.after(asavoir);else carte.appendChild(asavoir);
}

/**
 * Transforme un écran en ONGLETS : une barre, puis un panneau par groupe. Les blocs sont
 * DÉPLACÉS dans leur panneau — identifiants, contenus et écouteurs délégués intacts, rien
 * n'est recréé. Le premier groupe est ouvert. La barre n'étant jamais re-rendue, ses écouteurs
 * vivent sur elle plutôt que sur le document.
 *
 * `groupes` : [{ cle, titre, blocs:[id…], classe }].
 */
function construireOngletsEcran(ecran, groupes) {
 if(!ecran||ecran.querySelector('.cv-onglets'))return null;
 const barre=document.createElement('div');
 barre.className='cv-onglets';barre.setAttribute('role','tablist');
 const paires=[];
 groupes.forEach(function(groupe,i){
   const panneau=document.createElement('div');
   panneau.className='cv-panneau'+(groupe.classe?' '+groupe.classe:'');
   panneau.id=ecran.id+'-p-'+groupe.cle;
   panneau.setAttribute('role','tabpanel');
   panneau.hidden=i!==0;
   groupe.blocs.forEach(function(id){const bloc=document.getElementById(id);if(bloc)panneau.appendChild(bloc);});
   const onglet=document.createElement('button');
   onglet.type='button';onglet.className='cv-onglet'+(i?'':' est-actif');
   onglet.setAttribute('role','tab');onglet.setAttribute('aria-controls',panneau.id);
   onglet.setAttribute('aria-selected',i?'false':'true');onglet.tabIndex=i?-1:0;
   onglet.textContent=groupe.titre;
   barre.appendChild(onglet);paires.push([onglet,panneau]);
 });
 function activer(onglet){
   paires.forEach(function(paire){
     const actif=paire[0]===onglet;
     paire[0].classList.toggle('est-actif',actif);
     paire[0].setAttribute('aria-selected',actif?'true':'false');
     paire[0].tabIndex=actif?0:-1;
     paire[1].hidden=!actif;
   });
 }
 barre.addEventListener('click',function(e){
   const onglet=e.target.closest('.cv-onglet');if(onglet)activer(onglet);
 });
 barre.addEventListener('keydown',function(e){
   const onglet=e.target.closest('.cv-onglet');
   const pas={ArrowRight:1,ArrowLeft:-1,Home:'debut',End:'fin'}[e.key];
   if(!onglet||pas===undefined)return;
   const liste=paires.map(function(paire){return paire[0];});
   const i=liste.indexOf(onglet);
   const cible=pas==='debut'?liste[0]:pas==='fin'?liste[liste.length-1]:liste[(i+pas+liste.length)%liste.length];
   e.preventDefault();activer(cible);cible.focus();
 });
 ecran.insertBefore(barre,ecran.firstChild);
 paires.forEach(function(paire){ecran.appendChild(paire[1]);});
 return barre;
}

/**
 * Les pièces jointes rejoignent leur aperçu : on ne prépare pas un email d'un côté et ses
 * documents de l'autre. La SECTION d'origine est déplacée telle quelle (mêmes champs, même zone
 * de dépôt, mêmes identifiants) juste avant le bouton d'envoi, et perd son habillage de carte.
 */
function fusionnerPiecesJointes(idApercu, idPieces) {
 const apercu=document.getElementById(idApercu);
 const pieces=document.getElementById(idPieces);
 if(!apercu||!pieces||pieces.classList.contains('cv-sous-carte'))return;
 const titre=pieces.querySelector('h2');
 if(titre){const h3=document.createElement('h3');h3.textContent=titre.textContent;titre.replaceWith(h3);}
 pieces.classList.add('cv-sous-carte');
 const envoi=apercu.querySelector(':scope > .ligne-action');
 if(envoi)apercu.insertBefore(pieces,envoi);else apercu.appendChild(pieces);
}

/** Range des cartes déjà posées dans un panneau sous un conteneur commun, en tête du panneau. */
function grouperCartesPanneau(idPanneau, classe, ids) {
 const panneau=document.getElementById(idPanneau);
 if(!panneau)return;
 const groupe=document.createElement('div');groupe.className=classe;
 ids.forEach(function(id){const bloc=document.getElementById(id);if(bloc)groupe.appendChild(bloc);});
 panneau.insertBefore(groupe,panneau.firstChild);
}

/**
 * Écran « Inviter un club » en onglets. Les deux dépliants d'origine restent construits (le repli
 * sans JavaScript et l'assistant mobile s'appuient dessus) mais ne servent plus de contenant ici :
 * vidés de leurs cartes, ils sont masqués.
 */
function preparerOngletsInvitation() {
 const ecran=document.getElementById('ecran-invitation');
 if(!ecran||ecran.querySelector('.cv-onglets'))return;
 const modalites=document.getElementById('bloc-modalites');
 if(modalites)modalites.querySelector('h2').textContent='Modalités d’inscription au tournoi';
 fusionnerPiecesJointes('bloc-apercu-invitation','bloc-pieces-jointes-invitation');
 fusionnerPiecesJointes('bloc-apercu-dossier-email','bloc-pieces-jointes-dossier');
 const CARTES_INITIALE=['bloc-modalites','bloc-reponse','bloc-contacts-securite','bloc-surplace'];
 const CARTES_FINAL=['bloc-parking','bloc-encadrement'];
 construireOngletsEcran(ecran,[
   {cle:'initiale',titre:'Invitation initiale',classe:'cv-invitation-initiale',
    blocs:CARTES_INITIALE.concat(['bloc-apercu-invitation'])},
   {cle:'final',titre:'Dossier final',classe:'cv-dossier-final',
    blocs:CARTES_FINAL.concat(['bloc-apercu-dossier-email','bloc-dossier'])},
   {cle:'clubs',titre:'Clubs invités',blocs:['bloc-clubs-invites']}
 ]);
 // Les cartes de préparation forment un bloc à elles seules : leur hauteur ne doit pas suivre
 // celle de l'aperçu, bien plus haut, sinon un trou s'ouvre entre les rangées.
 grouperCartesPanneau(ecran.id+'-p-initiale','cv-invitation-cartes',CARTES_INITIALE);
 grouperCartesPanneau(ecran.id+'-p-final','cv-dossier-cartes',CARTES_FINAL);
 // Les dépliants sont désormais vides : on les garde dans le DOM (ils restent les points
 // d'accroche des autres modes d'affichage) et on les retire de l'œil.
 ['bloc-invitation-initiale','bloc-dossier-final'].forEach(function(id){
   const groupe=document.getElementById(id);if(groupe)groupe.hidden=true;
 });
}

/**
 * Écran « Suivi des clubs » : un tableau à gauche, la fiche du club choisi à droite.
 *
 * Les trois zones du HTML (résumé, filtres, liste) sont DÉPLACÉES dans une barre d'outils et
 * gardent leurs identifiants : `afficherSuiviClubs()` continue de peindre exactement les mêmes
 * conteneurs. Le panneau latéral est le seul nœud créé ici — il est vide jusqu'à ce qu'un club
 * soit choisi, et c'est admin-suivi-clubs.js qui le remplit, sans aucune lecture réseau.
 */
function preparerSuiviClubs() {
 const ecran=document.getElementById('ecran-suivi-clubs');
 const bloc=document.getElementById('bloc-suivi-clubs');
 const liste=document.getElementById('liste-suivi-clubs');
 if(!ecran||!bloc||!liste||document.getElementById('cv-fiche-club'))return;
 const titre=bloc.querySelector('h2');if(titre)titre.remove(); // le titre d'écran le dit déjà
 // La longue note disait trois choses que l'écran montre maintenant tout seul ; seule la règle
 // de tri n'est pas déductible du rendu, on la garde.
 const note=bloc.querySelector('.note-generation');
 if(note){note.className='cv-note-tri';note.textContent='Les clubs qui demandent une action apparaissent en premier.';}
 const barre=document.createElement('div');barre.className='cv-barre-outils';
 barre.appendChild(document.getElementById('suivi-clubs-filtres'));
 const droite=document.createElement('div');droite.className='cv-barre-droite';
 const recherche=document.getElementById('cv-recherche-liste-suivi-clubs');
 if(recherche)droite.appendChild(recherche.closest('.cv-recherche'));
 // Le PDF couvre TOUS les clubs participants : il reste dans la barre d'outils de l'écran, pas
 // dans la fiche d'un club — l'y mettre ferait croire à un document par club.
 const pdf=bloc.querySelector('.suivi-pdf-actions');
 if(pdf){
   const bouton=document.getElementById('bouton-pdf-suivi-restauration');
   const petit=pdf.querySelector('small');
   if(bouton&&petit){
     petit.id='aide-pdf-suivi';petit.className='cv-sr'; // gardé pour les lecteurs d'écran
     bouton.setAttribute('aria-describedby','aide-pdf-suivi');
     bouton.setAttribute('title',petit.textContent);
     bouton.classList.add('bouton-doux');
     bouton.textContent='Récapitulatif (PDF)';
     bouton.setAttribute('aria-label','Télécharger le récapitulatif des repas et goûters (PDF)');
   }
   droite.appendChild(pdf);
 }
 barre.appendChild(droite);
 bloc.insertBefore(barre,liste);
 if(note)bloc.insertBefore(note,liste);
 const fiche=document.createElement('aside');
 fiche.id='cv-fiche-club';fiche.className='carte cv-fiche-club est-vide';
 fiche.setAttribute('aria-label','Fiche du club sélectionné');
 ecran.classList.add('cv-suivi');ecran.appendChild(fiche);
 if(typeof afficherFicheClub==='function')afficherFicheClub();
}

/**
 * Écran « Équipes » : onglets par catégorie, recherche, filtre par club, et l'ajout en dépliant.
 *
 * Le formulaire d'ajout est DÉPLACÉ dans un dépliant (ses écouteurs de soumission, posés par
 * admin.js sur le <form>, sont donc conservés) ; la barre d'onglets et le filtre par club sont
 * créés vides ici, avec leurs écouteurs POSÉS SUR EUX — `afficherEquipes()` réécrit leur
 * contenu à chaque rendu, jamais le conteneur, donc les écouteurs survivent.
 */
function preparerEquipes() {
 const bloc=document.getElementById('bloc-equipes');
 const liste=document.getElementById('liste-equipes');
 const form=document.getElementById('form-equipe');
 if(!bloc||!liste||!form||document.getElementById('cv-equipes-onglets'))return;
 const titre=bloc.querySelector('h2');if(titre)titre.remove(); // le titre d'écran le dit déjà
 const barre=document.createElement('div');barre.className='cv-barre-outils';
 const onglets=document.createElement('div');
 onglets.id='cv-equipes-onglets';onglets.className='cv-onglets';onglets.setAttribute('role','tablist');
 onglets.setAttribute('aria-label','Filtrer les équipes par catégorie');
 barre.appendChild(onglets);
 const droite=document.createElement('div');droite.className='cv-barre-droite';
 const recherche=document.getElementById('cv-recherche-liste-equipes');
 if(recherche)droite.appendChild(recherche.closest('.cv-recherche'));
 const filtreClub=document.createElement('label');filtreClub.className='cv-filtre-club';
 filtreClub.innerHTML='<span class="cv-sr">Filtrer par club</span>'+
   '<select class="r-input" id="cv-equipes-club"><option value="">Tous les clubs</option></select>';
 droite.appendChild(filtreClub);
 // L'ajout n'occupe plus le haut de l'écran en permanence : un bouton l'ouvre, le formulaire
 // d'origine vit dedans, inchangé.
 const ajout=document.createElement('details');ajout.id='cv-ajout-equipe';ajout.className='cv-ajout';
 ajout.innerHTML='<summary><span aria-hidden="true">+</span> Ajouter une équipe</summary>';
 const aide=form.nextElementSibling; // la note « Joueurs et Éducs sont facultatifs »
 ajout.appendChild(form);
 if(aide&&aide.classList&&aide.classList.contains('note-generation'))ajout.appendChild(aide);
 droite.appendChild(ajout);
 barre.appendChild(droite);
 // La barre passe EN TÊTE de la carte, pas juste au-dessus du tableau : #message-equipe et
 // #reprise-equipes vivent entre les deux dans le HTML, et une barre insérée sous eux aurait
 // relégué le « ✅ ajoutée » au-dessus des onglets, loin du geste qui l'a produit.
 bloc.insertBefore(barre,bloc.firstChild);
 onglets.addEventListener('click',function(e){
   const onglet=e.target.closest('[data-cat-equipes]');if(!onglet)return;
   activerOngletEquipes(onglet.getAttribute('data-cat-equipes'));
   afficherEquipes(equipesCourantes);
 });
 onglets.addEventListener('keydown',function(e){
   const onglet=e.target.closest('[data-cat-equipes]');
   const pas={ArrowRight:1,ArrowLeft:-1,Home:'debut',End:'fin'}[e.key];
   if(!onglet||pas===undefined)return;
   const liste2=Array.from(onglets.querySelectorAll('[data-cat-equipes]'));
   const i=liste2.indexOf(onglet);
   const cible=pas==='debut'?liste2[0]:pas==='fin'?liste2[liste2.length-1]:liste2[(i+pas+liste2.length)%liste2.length];
   e.preventDefault();cible.click();
   const apres=onglets.querySelector('[data-cat-equipes="'+cible.getAttribute('data-cat-equipes')+'"]');
   if(apres)apres.focus();
 });
 filtreClub.querySelector('select').addEventListener('change',function(e){
   activerFiltreClubEquipes(e.target.value);
   afficherEquipes(equipesCourantes);
 });
 // La barre d'onglets et la liste des clubs naissent VIDES : c'est `afficherEquipes()` qui les
 // remplit, et elle a déjà tourné une fois avant la construction de cet écran. On repeint donc
 // tout de suite, sinon les onglets n'apparaîtraient qu'au premier ajout d'équipe.
 if(typeof afficherEquipes==='function'&&typeof equipesCourantes!=='undefined')afficherEquipes(equipesCourantes);
}

/**
 * Écran « Publication » : deux cartes côte à côte — la page du tournoi, la table de marque —
 * et un bandeau de clôture en pied.
 *
 * ⛔ RIEN N'EST RECRÉÉ. Les boutons, les messages, le QR, le formulaire de litige sont les
 * nœuds du HTML, DÉPLACÉS : leurs écouteurs (posés par admin-infos-publication.js avant que
 * le mode guidé ne construise les écrans) et leurs identifiants survivent. Seuls les
 * conteneurs, les deux pastilles d'état et l'encart d'explication sont neufs — et ce sont
 * `majPublication()` et `rendreAccesScores()` qui les remplissent, pas cette fonction.
 */
function preparerPublication() {
 const bloc=document.getElementById('bloc-publication');
 if(!bloc||document.getElementById('cv-pub-page'))return;
 const prendre=id=>document.getElementById(id);
 bloc.classList.add('cv-pub-bloc');
 // Les intitulés de l'ancienne mise en page font double emploi avec les têtes de cartes : le
 // titre de la section, et les deux « L'adresse de… » qui introduisaient chaque zone.
 const titreBloc=bloc.querySelector('h2');if(titreBloc)titreBloc.remove();
 Array.from(bloc.querySelectorAll('.publication-acces-lib')).forEach(el=>el.remove());
 const grille=document.createElement('div');grille.className='cv-pub-grille';

 /* ---------------------------------------------------------- Page du tournoi */
 const page=document.createElement('section');page.id='cv-pub-page';page.className='carte cv-pub-page';
 page.innerHTML='<div class="cv-pub-tete"><h2>Page du tournoi</h2></div>'+
   '<p class="cv-pub-intro" id="cv-pub-intro"></p>'+
   '<div class="cv-pub-apercu"><div class="cv-pub-carte-place" data-role="apercu-publication"></div>'+
   '<div class="cv-pub-qr-place"></div></div>'+
   '<div class="cv-pub-adresse"><span class="cv-pub-adresse-lib" id="cv-pub-adresse-lib">Adresse publique</span>'+
   '<div class="cv-pub-adresse-champ"></div></div>'+
   '<div class="cv-pub-actions"></div>';
 // La pastille d'état REPREND le <strong id="etat-publication"> du HTML : c'est lui que
 // majPublication() écrit depuis toujours, on ne crée pas un second porteur d'état.
 const etatPub=prendre('etat-publication');
 if(etatPub){etatPub.className='cv-pastille';page.querySelector('.cv-pub-tete').appendChild(etatPub);}
 // Le « État : » qui introduisait ce <strong> n'a plus de sens une fois la pastille en tête.
 const ligneEtat=bloc.querySelector('.publication-etat');
 if(ligneEtat)ligneEtat.remove();
 // L'adresse : le <a> d'origine, posé dans un champ qui se lit comme tel.
 const champ=page.querySelector('.cv-pub-adresse-champ');
 const lien=prendre('acces-public-lien');
 if(lien&&champ)champ.appendChild(lien);
 const copier=prendre('bouton-copier-adresse-publique');
 const ouvrir=prendre('bouton-ouvrir-page-publique');
 const actions=page.querySelector('.cv-pub-actions');
 if(ouvrir){ouvrir.classList.remove('bouton-doux');ouvrir.textContent='Voir la page';actions.appendChild(ouvrir);}
 if(copier){copier.classList.add('bouton-doux');copier.textContent='Copier le lien';actions.appendChild(copier);}
 const qrPublic=prendre('acces-public-qr');
 if(qrPublic)page.querySelector('.cv-pub-qr-place').appendChild(qrPublic);
 // Le geste « publier / masquer » reste DANS la carte qu'il concerne, sous ses deux actions
 // de partage, avec son garde-fou et son message inchangés.
 ['bouton-publier','message-verrou-publier','message-publication','message-acces-public']
   .forEach(id=>{const el=prendre(id);if(el)page.appendChild(el);});
 // Les trois notes longues (ce que publier fait, ce qu'il ne fait pas, ce que devient
 // l'adresse) descendent dans un dépliant : elles restent lisibles en entier, sans occuper
 // le haut de la carte à chaque visite.
 const detailPub=document.createElement('details');detailPub.className='cv-options cv-pub-aide';
 detailPub.innerHTML='<summary>Ce que publier fait, et ne fait pas<span>Visibilité, dossier des clubs, adresse</span></summary>';
 Array.from(bloc.querySelectorAll('.note-generation')).forEach(n=>detailPub.appendChild(n));
 const notePub=prendre('acces-public-note');if(notePub)detailPub.appendChild(notePub);
 page.appendChild(detailPub);
 grille.appendChild(page);

 /* -------------------------------------------------------- Table de marque */
 const marque=document.createElement('section');marque.id='cv-pub-marque';marque.className='carte cv-pub-marque';
 marque.innerHTML='<div class="cv-pub-tete"><h2>Table de marque</h2>'+
   '<span class="cv-pastille" id="cv-marque-pastille"></span></div>'+
   '<p class="cv-pub-intro">La table de marque sert à saisir les résultats pendant le tournoi. '+
   'Seuls les organisateurs y accèdent : la page demande la clé scores, que le lien ne contient pas.</p>'+
   '<div class="cv-marque-encart" id="cv-marque-encart"></div>';
 const saisie=document.getElementById('acces-saisie');
 if(saisie){
   // L'avertissement du serveur (échéance, fermeture automatique) garde son id : c'est
   // afficherMessage() qui l'écrit, et il en réécrit la classe — le style passe par l'id.
   // ⚠️ PIÈGE : `marque` n'est pas encore rattaché au document. Un nœud qu'on y déplace en
   //    SORT donc, et `getElementById` ne le retrouve plus — il faut garder sa référence au
   //    moment du déplacement. (Défaut constaté : le bouton d'ouverture gardait sa largeur de
   //    bouton ordinaire parce que sa classe était posée sur un `null` silencieux.)
   const deplaces={};
   ['acces-saisie-avertissement','acces-saisie-lien','acces-saisie-actions','acces-saisie-actions-suite']
     .forEach(id=>{const el=prendre(id);if(el){deplaces[id]=el;marque.appendChild(el);}});
   if(deplaces['acces-saisie-lien'])deplaces['acces-saisie-lien'].classList.add('cv-marque-ouvrir');
   // QR, notes et correction de litige : utiles, mais pas à chaque visite.
   const detailMarque=document.createElement('details');detailMarque.className='cv-options cv-marque-aide';
   detailMarque.innerHTML='<summary>QR code, renouvellement et correction d’un score<span>Ce que contient le lien, et comment corriger un litige</span></summary>';
   // La phrase d'état longue (« Ouvert — la table de marque peut saisir… ») reste écrite par
   // rendreAccesScores() : elle descend dans le dépliant, sous la pastille qui la résume.
   const ligneEtatSaisie=saisie.querySelector('.acces-saisie-etat');
   if(ligneEtatSaisie)detailMarque.appendChild(ligneEtatSaisie);
   const corps=prendre('acces-saisie-corps');if(corps)detailMarque.appendChild(corps);
   Array.from(saisie.querySelectorAll('.publication-acces-note, .acces-saisie-quoi')).forEach(n=>detailMarque.appendChild(n));
   const litige=prendre('acces-saisie-litige');if(litige)detailMarque.appendChild(litige);
   const msgSaisie=prendre('message-acces-saisie');if(msgSaisie)marque.appendChild(msgSaisie);
   marque.appendChild(detailMarque);
 }
 grille.appendChild(marque);
 bloc.appendChild(grille);

 /* ------------------------------------------------------ Clôturer définitivement */
 // ⛔ Le bandeau n'invente aucun geste : il ACCUEILLE le bouton du HTML, que le serveur
 //    seul révèle (rendreAccesScores le laisse masqué tant que CLOTURER n'est pas permis).
 const cloture=prendre('acces-saisie-cloture');
 if(cloture){
   const bandeau=document.createElement('div');bandeau.id='cv-pub-cloture';bandeau.className='cv-pub-cloture';
   bandeau.innerHTML='<span class="cv-pub-cloture-icone" aria-hidden="true">'+svgIcone('corbeille')+'</span>'+
     '<span class="cv-pub-cloture-texte"><strong>Clôturer définitivement</strong>'+
     '<span>Cette action est irréversible. Elle masquera la page publique et fermera la table de marque.</span></span>';
   cloture.textContent='Clôturer le tournoi';
   bandeau.appendChild(cloture);
   bloc.appendChild(bandeau);
 }
 // ⭐ L'état et l'aperçu sont repeints ICI, après le déplacement : majPublication() a pu
 //    tourner avant que la pastille existe, et sa phrase longue y serait restée figée.
 //    ⛔ On ne rappelle PAS majPublication() : elle relancerait la lecture de l'accès scores.
 // Les deux conteneurs d'origine sont vidés : on les GARDE dans le DOM (l'assistant mobile et
 // le repli sans JavaScript s'y accrochent) et on les retire de l'œil, comme les dépliants
 // d'invitation. ⛔ Jamais supprimés : d'autres modes d'affichage les cherchent encore.
 // Un conteneur qui ne porte plus ni contrôle ni texte n'a plus rien à montrer : il ne laisse
 // qu'un cadre vide en haut de l'écran. ⛔ On le MASQUE sans le supprimer — l'assistant mobile
 // et le repli sans JavaScript s'accrochent encore à ces nœuds.
 const videMaintenant=el=>el&&!el.querySelector('button,input,select,textarea,a')&&!el.textContent.trim();
 [prendre('acces-saisie'),bloc.querySelector('.cv-publication')].forEach(el=>{
   if(videMaintenant(el))el.hidden=true;
 });
 if(typeof majEtatPublicationAffiche==='function')majEtatPublicationAffiche();
 if(typeof majApercuPublication==='function')majApercuPublication();
 if(typeof majResumeAccesScores==='function'&&typeof accesScoresCourant!=='undefined'){
   majResumeAccesScores(accesScoresCourant,!!(accesScoresCourant&&accesScoresCourant.fermee_automatiquement));
 }
 if(typeof majBandeauCloture==='function')majBandeauCloture();
 // La carte du tournoi et la vue agrandie : un seul écouteur délégué, posé sur le bloc, qui
 // survit aux repeints de l'aperçu.
 bloc.addEventListener('click',function(e){
   const ouvre=e.target.closest&&e.target.closest('[data-ouvrir-affiche]');
   if(ouvre&&typeof ouvrirAffichePublique==='function'){ouvrirAffichePublique(ouvre);return;}
 });
}

/** Déplace les contrôles d’origine : les événements et identifiants restent identiques. */
function preparerOutilsCiel() {
 [['liste-equipes','.equipe-item','Rechercher une équipe'],['liste-suivi-clubs','.suivi-club-ligne','Rechercher un club']].forEach(function(def){
   const liste=document.getElementById(def[0]);if(!liste||document.getElementById('cv-recherche-'+def[0]))return;
   const barre=document.createElement('div');barre.className='cv-recherche';
   barre.innerHTML='<label><span class="cv-recherche-libelle">'+def[2]+'</span><input class="r-input" type="search" id="cv-recherche-'+def[0]+'" data-liste="'+def[0]+'" data-lignes="'+def[1]+'" placeholder="'+def[2]+'…"></label><span role="status" class="cv-recherche-resultat"></span>';
   liste.before(barre);barre.querySelector('input').addEventListener('input',actualiserRecherchesCiel);
 });
 const apresmidi=document.getElementById('bloc-apresmidi');
 if(apresmidi && !document.getElementById('cv-apresmidi-apercu')){
   // Le titre de la carte répète celui de l'écran, comme ailleurs.
   const titreAm=apresmidi.querySelector('h2');if(titreAm)titreAm.remove();
   const apercu=document.createElement('div');apercu.id='cv-apresmidi-apercu';apercu.className='cv-apresmidi-grid';
   // ⭐ LE BANDEAU D'ÉTAT. Le <p> d'origine portait « Scores du matin : 0/27 saisis » sur une seule
   //    ligne. Il devient un bandeau à trois parties — pictogramme, phrase, jauge — SANS changer de
   //    nœud : #etat-scores-matin reste le même <strong>, c'est lui que majApresMidi() écrit.
   const etat=apresmidi.querySelector('.apresmidi-etat');
   const porteur=document.getElementById('etat-scores-matin');
   etat.classList.add('cv-information','cv-bandeau-apresmidi');
   etat.textContent='';
   const icone=document.createElement('span');icone.className='cv-bandeau-icone';icone.setAttribute('aria-hidden','true');icone.textContent='!';
   const texte=document.createElement('span');texte.className='cv-bandeau-texte';
   texte.appendChild(porteur);
   const sous=document.createElement('span');sous.className='cv-bandeau-sous';sous.id='cv-apresmidi-sous';
   texte.appendChild(sous);
   const jauge=document.createElement('span');jauge.className='cv-bandeau-jauge';jauge.id='cv-apresmidi-jauge';
   etat.append(icone,texte,jauge);
   etat.after(apercu);
   const aide=apresmidi.querySelector('.note-generation');
   // La longue explication devient un dépliant « Comment ça marche ? » en pied d'écran : elle
   // reste lisible en entier, sans occuper le haut de la page à chaque visite.
   const commentca=document.createElement('details');commentca.id='cv-apresmidi-aide';commentca.className='cv-options cv-aide-repliee';
   commentca.innerHTML='<summary>Comment ça marche ?<span>Ce que la génération calcule, et ce qu’elle conserve</span></summary>';
   aide.innerHTML='Les rencontres de l’après-midi sont calculées à partir des <strong>résultats du matin</strong>, '+
     'selon le format de chaque catégorie. <strong>Tous les scores du matin</strong> sont nécessaires. '+
     'Les rencontres du matin sont <strong>conservées</strong> : rien n’est effacé.<br>'+
     'Si vous <strong>corrigez un score du matin</strong> après avoir généré l’après-midi, relancez la '+
     'génération pour remettre les niveaux à jour.';
   commentca.appendChild(aide);
   const details=document.createElement('details');details.className='cv-options';details.innerHTML='<summary>Options de démonstration<span>Remplir les scores fictifs de l’après-midi</span></summary>';
   const sim=document.getElementById('bouton-simuler-scores-apresmidi');const note=sim.nextElementSibling;
   details.appendChild(sim);if(note)details.appendChild(note);details.appendChild(document.getElementById('message-simulation-apresmidi'));
   apresmidi.append(commentca,details);
   if(adminConnecte)majApresMidi();
 }
 const infos=document.getElementById('ecran-infos');
 const form=document.getElementById('form-infos-tournoi');
 if(infos && form && !document.getElementById('cv-affiche-carte')){
   // L'affiche n'est pas une carte à part : c'est un champ de l'identité du tournoi. On la
   // prépare ici, on la pose dans la carte APRÈS la description (voir regrouperInfosGenerales).
   const fichier=form.querySelector('input[type=file]');
   fichier.setAttribute('form','form-infos-tournoi');
   const affiche=document.createElement('div');affiche.id='cv-affiche-carte';affiche.className='cv-champ-affiche';
   const ligneAffiche=fichier.closest('label');
   const libelleAffiche=ligneAffiche.querySelector('.r-libelle');
   libelleAffiche.textContent='Affiche du tournoi';
   libelleAffiche.insertAdjacentHTML('afterend','<span class="cv-aide-champ">L’image utilisée dans les invitations et les dossiers clubs.</span>');
   affiche.appendChild(ligneAffiche);
   affiche.appendChild(document.getElementById('apercu-affiche'));
   const actions=form.querySelector('.ligne-action');actions.className='cv-actions-enregistrer cv-verre';infos.appendChild(actions);
   document.getElementById('bouton-enregistrer-infos').textContent='Enregistrer les informations';
   document.getElementById('bouton-enregistrer-cadre').hidden=true;
   document.getElementById('bouton-valider-categories').hidden=true;
   regrouperInfosGenerales(form);
   document.getElementById('bloc-infos-tournoi').appendChild(affiche);
   preparerDateVerification();
 }
 preparerOngletsInvitation();
 preparerSuiviClubs();
 preparerEquipes();
 preparerPublication();
 const generation=document.getElementById('bloc-generation');
 if(generation && !document.getElementById('cv-outils-planning')){
   // Le titre de la carte répète celui de l'écran : il s'en va, comme sur Suivi des clubs et Équipes.
   const titreGen=generation.querySelector('h2');if(titreGen)titreGen.remove();
   // L'avertissement « cela efface les poules précédentes » ne disparaît pas : il devient la
   // description du bouton qui le porte. La confirmation du geste le répète de toute façon.
   const avertGen=generation.querySelector('.note-generation');
   const boutonGen=document.getElementById('bouton-generer');
   if(avertGen&&boutonGen){
     avertGen.id='aide-generer-poules';avertGen.className='cv-sr';
     boutonGen.setAttribute('aria-describedby','aide-generer-poules');
     boutonGen.setAttribute('title',avertGen.textContent.replace(/\s+/g,' ').trim());
   }
   // ⭐ LE PIED DE DÉMONSTRATION. Le bouton des scores fictifs quittait le haut de l'écran, entre
   //    la génération et le planning : il descend en bas de page avec sa note et son message. Ce
   //    sont les BLOCS D'ORIGINE qu'on déplace — écouteurs et identifiants conservés.
   const demo=document.createElement('div');demo.className='cv-demo-pied';
   demo.innerHTML='<span class="cv-demo-titre">Démonstration</span>';
   const boutonDemo=document.getElementById('bouton-simuler-scores-matin');
   const noteDemo=boutonDemo&&boutonDemo.nextElementSibling;
   if(boutonDemo){
     demo.appendChild(boutonDemo);
     if(noteDemo&&noteDemo.classList&&noteDemo.classList.contains('note-generation'))demo.appendChild(noteDemo);
     const msgDemo=document.getElementById('message-simulation-matin');if(msgDemo)demo.appendChild(msgDemo);
   }
   const outils=document.createElement('details');outils.id='cv-outils-planning';outils.className='cv-options';
   outils.innerHTML='<summary>Options avancées<span>Recalculer les horaires, arbitrages de la génération</span></summary>';
   // ⛔ `bouton-generer` et `message-generation` restent DEHORS : afficherPlanning() pose le bouton
   //    dans la barre d'actions, à côté de « Modifier les poules à la main ». L'enfermer ici le
   //    rendrait introuvable, et son message d'erreur avec lui.
   const gardes=['affichage-planning','bouton-modifier-poules','edition-poules','bouton-generer','message-generation'];
   Array.from(generation.children).forEach(el=>{if(gardes.indexOf(el.id)<0 && el!==demo)outils.appendChild(el);});
   generation.appendChild(outils);
   if(boutonDemo)generation.appendChild(demo);
 }
 const bloc=document.getElementById('bloc-equipes');
 if(bloc && !document.getElementById('cv-outils-equipes')){
   const outils=document.createElement('details');outils.id='cv-outils-equipes';outils.className='cv-options';
   outils.innerHTML='<summary>Outils et paramètres des équipes<span>Identification de votre club (page Perfs)</span></summary>';
   // ⭐ Le jeu de démonstration n'est plus ici : il vit dans « Inviter un club », onglet « Clubs invités ».
   ['form-perfs-club'].forEach(id=>{const el=document.getElementById(id);if(el)outils.appendChild(el);});
   bloc.appendChild(outils);
 }
 actualiserRecherchesCiel();
}

/** Filtrage de présentation uniquement : aucun changement des listes métier ou des exports. */
function actualiserRecherchesCiel(){
 document.querySelectorAll('.cv-recherche input').forEach(champ=>{
   const normaliser=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
   const q=normaliser(champ.value.trim()),liste=document.getElementById(champ.dataset.liste);
   let visibles=0;
   liste.querySelectorAll(champ.dataset.lignes).forEach(ligne=>{ligne.hidden=!!q&&!normaliser(ligne.textContent).includes(q);if(!ligne.hidden)visibles++;});
   champ.closest('.cv-recherche').querySelector('[role=status]').textContent=q?(visibles?visibles+' résultat'+(visibles>1?'s':''):'Aucun résultat'):'';
 });
}
