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
 categories:'Comparez les catégories et adaptez leurs réglages de jeu.',
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

/** Déplace les contrôles d’origine : les événements et identifiants restent identiques. */
function preparerOutilsCiel() {
 [['liste-equipes','.equipe-item','Rechercher une équipe'],['liste-suivi-clubs','.suivi-club-ligne','Rechercher un club']].forEach(function(def){
   const liste=document.getElementById(def[0]);if(!liste||document.getElementById('cv-recherche-'+def[0]))return;
   const barre=document.createElement('div');barre.className='cv-recherche';
   barre.innerHTML='<label>'+def[2]+'<input class="r-input" type="search" id="cv-recherche-'+def[0]+'" data-liste="'+def[0]+'" data-lignes="'+def[1]+'" placeholder="Nom…"></label><span role="status" class="cv-recherche-resultat"></span>';
   liste.before(barre);barre.querySelector('input').addEventListener('input',actualiserRecherchesCiel);
 });
 const apresmidi=document.getElementById('bloc-apresmidi');
 if(apresmidi && !document.getElementById('cv-apresmidi-apercu')){
   const apercu=document.createElement('div');apercu.id='cv-apresmidi-apercu';apercu.className='cv-apresmidi-grid';
   const etat=apresmidi.querySelector('.apresmidi-etat');etat.classList.add('cv-information');etat.after(apercu);
   const aide=apresmidi.querySelector('.note-generation');
   aide.textContent='Les rencontres de l’après-midi sont calculées à partir des résultats du matin, selon le format de chaque catégorie. Tous les scores du matin sont nécessaires. Les rencontres du matin sont conservées.';
   const details=document.createElement('details');details.className='cv-options';details.innerHTML='<summary>Options de démonstration<span>Remplir les scores fictifs de l’après-midi</span></summary>';
   const sim=document.getElementById('bouton-simuler-scores-apresmidi');const note=sim.nextElementSibling;
   details.appendChild(sim);if(note)details.appendChild(note);details.appendChild(document.getElementById('message-simulation-apresmidi'));apresmidi.appendChild(details);
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
 const generation=document.getElementById('bloc-generation');
 if(generation && !document.getElementById('cv-outils-planning')){
   const outils=document.createElement('details');outils.id='cv-outils-planning';outils.className='cv-options';
   outils.innerHTML='<summary>Génération et options avancées<span>Recalculer les horaires, régénérer les poules, scores de démonstration</span></summary>';
   const planning=document.getElementById('affichage-planning');
   Array.from(generation.children).forEach(el=>{if(el!==planning && el.id!=='bouton-modifier-poules' && el.id!=='edition-poules')outils.appendChild(el);});
   generation.appendChild(outils);
 }
 const bloc=document.getElementById('bloc-equipes');
 if(bloc && !document.getElementById('cv-outils-equipes')){
   const outils=document.createElement('details');outils.id='cv-outils-equipes';outils.className='cv-options';
   outils.innerHTML='<summary>Outils et paramètres des équipes<span>Jeu de démonstration et identification de votre club</span></summary>';
   ['chargement-equipes-demo','form-perfs-club'].forEach(id=>{const el=document.getElementById(id);if(el)outils.appendChild(el);});
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
