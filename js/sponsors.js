/**
 * ============================================================================
 *  PARTENAIRES — moteur d'affichage et de mesure des sponsors
 * ============================================================================
 *
 *  Fichier PARTAGÉ entre la page publique (tournoi.html) et l'écran d'administration
 *  (admin.html, pour l'aperçu et la fiche de visibilité). Il ne touche jamais au DOM
 *  de lui-même : il FABRIQUE du balisage et EXPOSE des fonctions, l'appelant décide où.
 *
 *  Cinq emplacements, repris tels quels du document de conception :
 *    A « bandeau » — bandeau partenaire principal, permanent, sous le titre
 *    B « rail »    — rail à droite (ordinateur) / barre basse (téléphone), rotatif
 *    C « fil »     — encart intégré au fil des scores, figé pour la session
 *    D « plein »   — interstitiel d'accueil, quelques secondes, passable
 *    E « mur »     — mur des partenaires, tous les logos, en bas de page
 *  Et, hors page des scores :
 *    F « dossier » — bandeau permanent en tête du DOSSIER CLUB (dossier-club.html),
 *                    imprimé avec lui. JAMAIS de plein écran là-bas : un club qui ouvre
 *                    son dossier cherche une information et ne doit pas attendre.
 *
 *  MESURE — comptée en local, consolidée entre tous les appareils.
 *  Les compteurs (temps d'exposition, affichages, clics) sont calculés dans le navigateur,
 *  puis remontés quelques fois par visite pour que la fiche partenaire porte sur TOUS les
 *  spectateurs. Aucun cookie, aucun traceur tiers, aucune donnée personnelle : seulement
 *  deux identifiants ALÉATOIRES tirés sur l'appareil et remis à zéro chaque jour, qui ne
 *  permettent d'identifier personne ni de suivre qui que ce soit d'un site à l'autre.
 *
 *  Nécessite (chargé AVANT) : commun.js (echapper).
 * ============================================================================
 */

/* ==========================================================================
   RÉGLAGES ET CONSTANTES
   ========================================================================== */

/** Les emplacements, dans l'ordre de la conception. Les cinq premiers sont sur la page
 *  publique des scores ; le sixième est le bandeau du DOSSIER CLUB. */
var SPONSORS_EMPLACEMENTS = ['bandeau', 'rail', 'fil', 'plein', 'mur', 'dossier'];

/** Libellés lisibles (fiche de visibilité, aperçu admin). */
var SPONSORS_LIBELLES = {
  bandeau: 'A · Bandeau titre',
  rail:    'B · Rail / barre',
  fil:     'C · Encart au fil',
  plein:   'D · Plein écran',
  mur:     'E · Mur partenaires',
  dossier: 'F · Dossier club'
};

/* Clés de stockage local. Préfixe r92_ comme le reste du frontend. */
var SPONSORS_CLE_ROUES   = 'r92_sponsors_roues';    // ordre de rotation mémorisé, par emplacement
var SPONSORS_CLE_PLEIN   = 'r92_sponsors_plein';    // dernier interstitiel vu (horodatage)
var SPONSORS_CLE_MESURE  = 'r92_sponsors_mesure';   // compteurs d'exposition / clics
var SPONSORS_CLE_VISITES = 'r92_sponsors_visites';  // nb de chargements de la page dans la journée

/** Valeurs par défaut — identiques aux bornes du backend (SPONSOR_REGLAGES_*). */
var SPONSORS_DEFAUTS = {
  actifs: false,
  mur: true,
  barreMobile: true,
  rotationS: 8,
  pleinActif: false,
  pleinDureeS: 5,
  pleinSkipS: 2,
  pleinReposMin: 30,
  pleinPremiereVisite: false
};

/* ==========================================================================
   MODE DÉMO — ?demo=sponsors
   --------------------------------------------------------------------------
   Sert à MONTRER le dispositif sans attendre : sponsors forcés visibles même si
   l'interrupteur général est sur « non », interstitiel rejouable à volonté (pas de
   période de repos), rotation accélérée. Il n'altère RIEN côté serveur : c'est un
   simple paramètre d'URL, donc la page publique reste intacte pour les spectateurs.
   ========================================================================== */

/** Vrai si l'URL courante demande le mode démo. */
function sponsorsModeDemo() {
  try {
    return new URLSearchParams(window.location.search).get('demo') === 'sponsors';
  } catch (e) { return false; }
}

/**
 * Partenaires d'exemple, utilisés UNIQUEMENT en mode démo et UNIQUEMENT si aucun
 * partenaire réel n'est enregistré. Permet de faire la démonstration complète avant
 * même d'avoir saisi le premier vrai sponsor dans l'admin.
 */
var SPONSORS_EXEMPLES = [
  { id_sponsor: 'DEMO1', nom: 'Décathlon Le Plessis', accroche: "Tout l'équipement rugby des U6 aux U14.",
    emplacements: 'bandeau,mur', poids: '3', couleur: '#0A5AA8', url: '', logo_id: '', visuel_id: '', ordre: '1' },
  { id_sponsor: 'DEMO2', nom: 'BNP Paribas', accroche: 'Fier de soutenir le rugby des jeunes.',
    emplacements: 'rail,fil,plein,mur', poids: '2', couleur: '#14795B', url: '', logo_id: '', visuel_id: '', ordre: '2' },
  { id_sponsor: 'DEMO3', nom: 'Intersport', accroche: "L'équipementier officiel du tournoi.",
    emplacements: 'rail,fil,plein,mur', poids: '2', couleur: '#8C3A2E', url: '', logo_id: '', visuel_id: '', ordre: '3' },
  { id_sponsor: 'DEMO4', nom: 'La Poste', accroche: 'Partenaire des associations du 92.',
    emplacements: 'rail,plein,mur', poids: '1', couleur: '#4A3A82', url: '', logo_id: '', visuel_id: '', ordre: '4' },
  { id_sponsor: 'DEMO5', nom: 'Boulangerie Martin', accroche: '',
    emplacements: 'mur', poids: '1', couleur: '#8A6D1F', url: '', logo_id: '', visuel_id: '', ordre: '5' }
];

/* ==========================================================================
   LECTURE DES RÉGLAGES
   ========================================================================== */

/** Lit un réglage oui/non de la config publique. */
function sponsorsOui(global, cle, defaut) {
  var v = String((global || {})[cle] || '').toLowerCase();
  if (v === 'oui') return true;
  if (v === 'non') return false;
  return defaut;
}

/** Lit un réglage numérique borné de la config publique. */
function sponsorsNombre(global, cle, defaut, min, max) {
  var n = parseInt((global || {})[cle], 10);
  if (!isFinite(n)) return defaut;
  return Math.max(min, Math.min(max, n));
}

/**
 * Réglages normalisés à partir de `config.global` (vue publique « live »).
 * En mode démo, les verrous qui empêchent de MONTRER le dispositif sont levés :
 * tout est allumé, l'interstitiel n'a plus de période de repos et tourne plus vite.
 */
function sponsorsReglages(config) {
  var g = (config && config.global) || {};
  var d = SPONSORS_DEFAUTS;
  var r = {
    actifs:      sponsorsOui(g, 'sponsors_actifs', d.actifs),
    mur:         sponsorsOui(g, 'sponsors_mur_actif', d.mur),
    barreMobile: sponsorsOui(g, 'sponsor_barre_mobile', d.barreMobile),
    rotationS:   sponsorsNombre(g, 'sponsor_rotation_s', d.rotationS, 0, 60),
    pleinActif:  sponsorsOui(g, 'sponsor_interstitiel_actif', d.pleinActif),
    pleinDureeS: sponsorsNombre(g, 'sponsor_interstitiel_duree_s', d.pleinDureeS, 3, 10),
    pleinSkipS:  sponsorsNombre(g, 'sponsor_interstitiel_skip_s', d.pleinSkipS, 0, 10),
    pleinReposMin: sponsorsNombre(g, 'sponsor_interstitiel_repos_min', d.pleinReposMin, 1, 240),
    pleinPremiereVisite: sponsorsOui(g, 'sponsor_interstitiel_premiere_visite', d.pleinPremiereVisite),
    demo: false
  };
  // Garde-fou identique au backend : « Passer » ne peut pas arriver après la fermeture.
  if (r.pleinSkipS > r.pleinDureeS) r.pleinSkipS = r.pleinDureeS;

  if (sponsorsModeDemo()) {
    r.demo = true;
    r.actifs = true;
    r.mur = true;
    r.pleinActif = true;
    r.pleinReposMin = 0;          // rejouable immédiatement
    r.pleinPremiereVisite = true; // visible dès la première arrivée
    r.rotationS = Math.min(r.rotationS || 8, 4);
  }
  return r;
}

/* ==========================================================================
   SÉLECTION DES PARTENAIRES
   ========================================================================== */

/** Liste normalisée des partenaires, avec repli sur les exemples en mode démo. */
function sponsorsListe(donnees, reglages) {
  var liste = (donnees && donnees.sponsors) || [];
  if (!liste.length && reglages && reglages.demo) liste = SPONSORS_EXEMPLES;
  return liste.filter(function (s) { return s && s.id_sponsor && s.nom; });
}

/** Partenaires déclarés sur un emplacement donné. */
function sponsorsPourEmplacement(liste, emplacement) {
  return liste.filter(function (s) {
    return String(s.emplacements || '').toLowerCase().split(',')
      .map(function (x) { return x.trim(); })
      .indexOf(emplacement) >= 0;
  });
}

/** Poids d'un partenaire, borné 1–5 (comme le backend). */
function sponsorsPoids(s) {
  var p = parseInt(s.poids, 10);
  if (!isFinite(p)) p = 1;
  return Math.max(1, Math.min(5, p));
}

/* --- Stockage local, tolérant aux navigateurs qui le refusent (mode privé) --- */
function sponsorsLire(cle, defaut) {
  try {
    var brut = localStorage.getItem(cle);
    return brut ? JSON.parse(brut) : defaut;
  } catch (e) { return defaut; }
}
function sponsorsEcrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) { /* stockage indisponible */ }
}

/**
 * LA ROUE ÉQUITABLE.
 *
 * Le tirage au hasard ne convient pas : sur dix chargements il donnerait trois fois le gros
 * partenaire et zéro fois le petit — indéfendable en fin de saison. On construit donc, une
 * fois par appareil, une liste où chaque partenaire figure `poids` fois, on la mélange, et
 * on avance d'un cran à chaque affichage. Conséquence : TOUT LE MONDE EST VU UNE FOIS AVANT
 * QUE QUICONQUE SOIT VU DEUX FOIS, et deux spectateurs n'ont pas la même séquence.
 *
 * L'ordre est mémorisé par emplacement : le partenaire de l'interstitiel n'est donc jamais
 * celui de l'encart au même instant. La roue se reconstruit toute seule si la composition
 * change (ajout d'un partenaire, poids modifié) — la signature ci-dessous le détecte.
 *
 * @param {string} emplacement  bandeau | rail | fil | plein | mur
 * @param {Array}  candidats    partenaires éligibles à cet emplacement
 * @param {boolean} avancer     vrai = consommer un tour (l'affichage a réellement eu lieu)
 * @returns {Object|null} le partenaire tiré, ou null s'il n'y a aucun candidat
 */
function sponsorsTirer(emplacement, candidats, avancer) {
  if (!candidats.length) return null;

  var signature = candidats.map(function (s) { return s.id_sponsor + ':' + sponsorsPoids(s); }).join('|');
  var roues = sponsorsLire(SPONSORS_CLE_ROUES, {}) || {};
  var roue = roues[emplacement];

  if (!roue || roue.signature !== signature || !roue.ordre || !roue.ordre.length) {
    var expansee = [];
    candidats.forEach(function (s) {
      var n = sponsorsPoids(s);
      for (var i = 0; i < n; i++) expansee.push(s.id_sponsor);
    });
    // Mélange de Fisher-Yates : un ordre propre à cet appareil, figé ensuite.
    for (var k = expansee.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var t = expansee[k]; expansee[k] = expansee[j]; expansee[j] = t;
    }
    roue = { signature: signature, ordre: expansee, curseur: 0 };
  }

  var id = roue.ordre[roue.curseur % roue.ordre.length];
  if (avancer) {
    roue.curseur = (roue.curseur + 1) % roue.ordre.length;
    roues[emplacement] = roue;
    sponsorsEcrire(SPONSORS_CLE_ROUES, roues);
  } else if (!roues[emplacement]) {
    roues[emplacement] = roue;
    sponsorsEcrire(SPONSORS_CLE_ROUES, roues);
  }

  var trouve = candidats.filter(function (s) { return s.id_sponsor === id; })[0];
  return trouve || candidats[0];
}

/** Ordre complet de la roue d'un emplacement (sert au rail, qui les fait défiler tous). */
function sponsorsOrdreRoue(emplacement, candidats) {
  if (!candidats.length) return [];
  sponsorsTirer(emplacement, candidats, false); // construit la roue si besoin
  var roue = (sponsorsLire(SPONSORS_CLE_ROUES, {}) || {})[emplacement];
  if (!roue) return candidats;
  // On déplie la roue en retirant les répétitions consécutives : le rail ne doit pas
  // afficher deux fois de suite le même logo, même si le partenaire a un poids élevé.
  var vus = {}, ordre = [];
  roue.ordre.forEach(function (id) {
    if (vus[id]) return;
    vus[id] = true;
    var s = candidats.filter(function (c) { return c.id_sponsor === id; })[0];
    if (s) ordre.push(s);
  });
  return ordre.length ? ordre : candidats;
}

/* ==========================================================================
   RÉGLAGES PAR EMPLACEMENT — adapter un partenaire à chaque encart
   --------------------------------------------------------------------------
   Un même logo ne se comporte pas pareil dans un bandeau large, dans une barre
   basse de téléphone et sur une feuille imprimée. Chaque couple
   (partenaire × emplacement) a donc ses propres réglages : le TEXTE qui
   l'accompagne, la TAILLE du logo, et sa DISPOSITION dans l'encart.

   Trois niveaux de repli, du plus précis au plus général :
     1. le réglage saisi pour CET emplacement (colonne reglages_emplacements) ;
     2. à défaut, le réglage général du partenaire (accroche, logo_zoom) ;
     3. à défaut, le défaut de l'emplacement (ci-dessous).
   Ne rien saisir donne donc exactement le comportement d'avant.
   ========================================================================== */

/** Disposition par défaut de chaque emplacement, choisie pour sa forme. */
var SPONSORS_DISPO_DEFAUT = {
  bandeau: 'gauche',  // large : logo à gauche, texte à droite
  rail:    'haut',    // colonne étroite : logo au-dessus, texte dessous
  fil:     'gauche',  // au gabarit d'une carte de match
  plein:   'haut',    // visuel vertical
  mur:     'seul',    // grille de logos : le texte alourdirait
  dossier: 'seul'     // document d'organisation : les logos suffisent
};

/** Dispositions reconnues (miroir de SPONSOR_DISPOSITIONS_OK côté backend). */
var SPONSORS_DISPOSITIONS = ['gauche', 'droite', 'haut', 'seul'];

/** Réglages par emplacement d'un partenaire, décodés une fois. */
function sponsorsReglagesBruts(s) {
  if (s && s.__reglages) return s.__reglages;
  var r = {};
  try {
    var brut = (s && s.reglages_emplacements) || '';
    if (brut) r = (typeof brut === 'string') ? JSON.parse(brut) : brut;
  } catch (e) { r = {}; }
  if (s) { try { s.__reglages = r; } catch (e) {} }
  return r || {};
}

/**
 * Réglages effectifs d'un partenaire POUR UN EMPLACEMENT donné.
 *
 * Chaque valeur dit AUSSI d'où elle vient (`origine`) : `encart` si elle a été saisie pour
 * cet emplacement, `general` si elle vient du réglage global du partenaire, `defaut` si
 * personne n'a rien dit. C'est ce qui permet à l'admin de répondre « j'ai réglé et rien ne
 * change » par un constat plutôt que par une supposition.
 *
 * @returns {{texte: string, zoom: number, dispo: string, origine: Object}}
 */
function sponsorsReglageEmplacement(s, emplacement) {
  var r = (sponsorsReglagesBruts(s) || {})[emplacement] || {};
  var origine = {};

  var zoom = parseInt(r.zoom, 10);
  origine.zoom = 'encart';
  if (!isFinite(zoom)) { zoom = parseInt(s.logo_zoom, 10); origine.zoom = 'general'; }
  if (!isFinite(zoom)) { zoom = 100; origine.zoom = 'defaut'; }
  zoom = Math.max(50, Math.min(200, zoom)) / 100;

  var dispo = String(r.dispo || '').toLowerCase();
  origine.dispo = 'encart';
  if (SPONSORS_DISPOSITIONS.indexOf(dispo) < 0) {
    dispo = SPONSORS_DISPO_DEFAUT[emplacement] || 'gauche';
    origine.dispo = 'defaut';
  }

  // Texte : celui de l'emplacement, sinon l'accroche générale du partenaire.
  var texte = String(r.texte == null ? '' : r.texte).trim();
  origine.texte = 'encart';
  if (!texte) { texte = String(s.accroche || '').trim(); origine.texte = texte ? 'general' : 'aucun'; }

  return { texte: texte, zoom: zoom, dispo: dispo, origine: origine };
}

/* ==========================================================================
   IMAGES
   ========================================================================== */

/**
 * URL publique d'une image Drive. On passe par lh3.googleusercontent.com (et non
 * drive.google.com/thumbnail, qui bloque le hotlinking) — même mécanisme que l'affiche
 * du tournoi, déjà éprouvé sur le site vitrine.
 */
function sponsorsUrlImage(id, largeur) {
  return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id) + '=w' + (largeur || 400);
}

/** Couleur de marque d'un partenaire (repli : le navy de la charte). */
function sponsorsCouleur(s) {
  var c = String(s.couleur || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0C1C2E';
}

/**
 * Logo d'un partenaire, dimensionné POUR UN EMPLACEMENT. Sans fichier téléversé, on compose
 * une pastille au nom du partenaire sur sa couleur de marque : un commerçant qui n'a pas de
 * logo exploitable reste affichable, et la démo fonctionne avant le premier téléversement.
 *
 * ⚠️ La taille n'est pas fixée ici mais ALIMENTÉE : on pose la variable CSS `--sp-zoom`, que
 * la feuille de style multiplie par la taille de référence de l'emplacement. Une taille en
 * ligne, elle, écraserait ces règles et interdirait toute adaptation à l'écran — c'est
 * exactement ce qui rendait autrefois le logo minuscule sur grand écran.
 */
function sponsorsLogo(s, emplacement) {
  var nom = echapper(s.nom);
  var zoom = sponsorsReglageEmplacement(s, emplacement || 'bandeau').zoom;
  if (s.logo_id) {
    return '<img class="sp-logo-img" src="' + echapper(sponsorsUrlImage(s.logo_id, 600)) +
      '" alt="' + nom + '" loading="lazy" decoding="async" style="--sp-zoom:' + zoom + '">';
  }
  return '<span class="sp-logo-texte" style="--sp-zoom:' + zoom +
    ';background:' + echapper(sponsorsCouleur(s)) + '">' + nom + '</span>';
}

/** Ouvre-t-on un lien ? (partenaire sans site : on rend un bloc non cliquable). */
function sponsorsOuvrir(s, contenu, classe, emplacement) {
  var url = String(s.url || '').trim();
  var dispo = sponsorsReglageEmplacement(s, emplacement).dispo;
  var attrs = ' class="' + classe + ' sp-dispo-' + dispo + '" data-sponsor="' +
              echapper(s.id_sponsor) + '" data-emplacement="' + echapper(emplacement) + '"';
  if (!/^https?:\/\//i.test(url)) return '<div' + attrs + '>' + contenu + '</div>';
  return '<a' + attrs + ' href="' + echapper(url) + '" target="_blank" rel="noopener sponsored">' +
    contenu + '</a>';
}

/* ==========================================================================
   RENDU DES EMPLACEMENTS
   ========================================================================== */

/**
 * Corps commun d'un encart partenaire : le logo, puis le bloc de texte. La DISPOSITION
 * (logo à gauche / à droite / au-dessus / seul) est portée par une classe sur le conteneur,
 * donc gérée entièrement en CSS — le balisage, lui, ne change pas.
 *
 * @param {string} mention petite étiquette au-dessus du nom ('' pour aucune)
 */
function sponsorsCorps(s, emplacement, mention) {
  var reg = sponsorsReglageEmplacement(s, emplacement);
  if (reg.dispo === 'seul') {
    // Logo seul : ni mention, ni nom, ni texte. C'est le mode des grilles de logos.
    return '<span class="sp-bloc-logo">' + sponsorsLogo(s, emplacement) + '</span>';
  }
  return '<span class="sp-bloc-logo">' + sponsorsLogo(s, emplacement) + '</span>' +
    '<span class="sp-bloc-texte">' +
      (mention ? '<span class="sp-mention">' + echapper(mention) + '</span>' : '') +
      // Le nom n'est écrit que si le partenaire a un VRAI logo : sinon la pastille de repli
      // le porte déjà, et l'afficher deux fois côte à côte mange la moitié d'un bandeau.
      (s.logo_id ? '<strong>' + echapper(s.nom) + '</strong>' : '') +
      (reg.texte ? '<span class="sp-accroche">' + echapper(reg.texte) + '</span>' : '') +
    '</span>';
}

/** A — bandeau partenaire principal (un seul partenaire, permanent sur la journée). */
function sponsorsRendreBandeau(liste) {
  var candidats = sponsorsPourEmplacement(liste, 'bandeau');
  var s = sponsorsTirer('bandeau', candidats, true);
  if (!s) return '';
  return sponsorsOuvrir(s, sponsorsCorps(s, 'bandeau', 'Partenaire du tournoi'),
                        'sp-bandeau', 'bandeau');
}

/** B — rail (ordinateur) / barre basse (téléphone). Contient TOUS les partenaires du rail,
 *  un seul visible à la fois : la rotation est faite en CSS/JS par sponsorsDemarrerRotation. */
function sponsorsRendreRail(liste) {
  var ordre = sponsorsOrdreRoue('rail', sponsorsPourEmplacement(liste, 'rail'));
  if (!ordre.length) return '';
  var vues = ordre.map(function (s, i) {
    return '<div class="sp-rail-vue' + (i === 0 ? ' active' : '') + '" data-index="' + i + '"' +
      (i === 0 ? '' : ' aria-hidden="true"') + '>' +
      sponsorsOuvrir(s, sponsorsCorps(s, 'rail', ''), 'sp-rail-lien', 'rail') + '</div>';
  }).join('');
  var points = ordre.length > 1
    ? '<span class="sp-points" aria-hidden="true">' + ordre.map(function (s, i) {
        return '<i class="' + (i === 0 ? 'on' : '') + '"></i>';
      }).join('') + '</span>'
    : '';
  return '<span class="sp-mention sp-rail-mention">Nos partenaires</span>' +
    '<div class="sp-rail-vues">' + vues + '</div>' + points;
}

/** C — encart intégré au fil des scores. */
function sponsorsRendreFil(s) {
  if (!s) return '';
  return sponsorsOuvrir(s, sponsorsCorps(s, 'fil', 'Partenaire'), 'sp-fil', 'fil');
}

/** E — mur des partenaires : tous les logos, sans hiérarchie, en bas de page. */
function sponsorsRendreMur(liste) {
  var candidats = sponsorsPourEmplacement(liste, 'mur');
  if (!candidats.length) return '';
  var cases = candidats.map(function (s) {
    return sponsorsOuvrir(s, sponsorsCorps(s, 'mur', ''), 'sp-mur-case', 'mur');
  }).join('');
  return '<div class="sp-mur">' +
      '<div class="sp-mur-titre">Ils rendent le tournoi possible</div>' +
      '<div class="sp-mur-grille">' + cases + '</div>' +
    '</div>';
}

/**
 * F — bandeau permanent du DOSSIER CLUB.
 *
 * Trois différences volontaires avec le bandeau de la page des scores :
 *  • TOUS les partenaires cochés y figurent, côte à côte — il n'y a pas de rotation. Le
 *    dossier est un document qu'on imprime : ce qui tourne n'existe pas sur le papier, et
 *    un club qui garde son PDF doit y retrouver exactement ce qu'il a vu à l'écran.
 *  • Disposition « logo seul » par défaut — mais réglable comme partout ailleurs si on veut
 *    y accompagner un logo d'une ligne de texte.
 *  • Aucun plein écran, jamais — c'est la règle même de cet emplacement.
 *
 * @param {Array} liste partenaires actifs
 * @returns {string} balisage, ou '' si aucun partenaire n'est coché pour le dossier
 */
function sponsorsRendreDossier(liste) {
  var candidats = sponsorsPourEmplacement(liste, 'dossier');
  if (!candidats.length) return '';

  var logos = candidats.map(function (s) {
    return sponsorsOuvrir(s, sponsorsCorps(s, 'dossier', ''), 'sp-dossier-case', 'dossier');
  }).join('');

  return '<section class="sp-dossier">' +
      '<p class="sp-dossier-titre">' +
        (candidats.length > 1 ? 'Nos partenaires' : 'Notre partenaire') +
      '</p>' +
      '<div class="sp-dossier-logos">' + logos + '</div>' +
    '</section>';
}

/* ==========================================================================
   ROTATION DU RAIL (emplacement B)
   ========================================================================== */

var sponsorsMinuteurRotation = null;

/**
 * Fait défiler les vues du rail toutes les `rotationS` secondes.
 *
 * Le rail est rendu DEUX FOIS (colonne de droite sur ordinateur, barre basse sur téléphone) :
 * une seule est visible à la fois, selon la largeur d'écran. On fait donc tourner les deux en
 * même temps — sinon la bascule d'orientation d'une tablette figerait celle qui s'affiche.
 * L'affichage n'est compté que pour le rendu RÉELLEMENT visible, pour ne pas doubler le chiffre.
 *
 * Une seule boucle à la fois (la précédente est arrêtée), et rien du tout s'il n'y a qu'un
 * partenaire ou si la rotation est réglée à 0.
 *
 * @param {Array|Element} racines une zone ou plusieurs
 * @param {number} rotationS secondes entre deux partenaires (0 = pas de rotation)
 */
function sponsorsDemarrerRotation(racines, rotationS) {
  if (sponsorsMinuteurRotation) { clearInterval(sponsorsMinuteurRotation); sponsorsMinuteurRotation = null; }
  if (!racines || !rotationS) return;

  var zones = (racines.length === undefined) ? [racines] : Array.prototype.slice.call(racines);
  zones = zones.filter(function (z) { return z && z.querySelectorAll('.sp-rail-vue').length > 1; });
  if (!zones.length) return;

  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var index = 0;

  sponsorsMinuteurRotation = setInterval(function () {
    if (document.hidden) return; // onglet en arrière-plan : inutile de tourner dans le vide
    index++;
    zones.forEach(function (zone) {
      var vues = zone.querySelectorAll('.sp-rail-vue');
      var points = zone.querySelectorAll('.sp-points i');
      var courant = index % vues.length;
      for (var i = 0; i < vues.length; i++) {
        var actif = (i === courant);
        vues[i].classList.toggle('active', actif);
        if (reduit) vues[i].style.transition = 'none';
        if (actif) { vues[i].removeAttribute('aria-hidden'); } else { vues[i].setAttribute('aria-hidden', 'true'); }
        if (points[i]) points[i].classList.toggle('on', actif);
      }
      // offsetParent nul = zone masquée par une règle CSS (l'autre rendu est à l'écran).
      if (zone.offsetParent === null) return;
      var lien = vues[courant].querySelector('[data-sponsor]');
      if (lien) sponsorsCompterAffichage(lien.getAttribute('data-sponsor'), 'rail');
    });
  }, rotationS * 1000);
}

/* ==========================================================================
   D — INTERSTITIEL D'ACCUEIL
   ========================================================================== */

/** Nombre de chargements de la page aujourd'hui (sert à sauter la toute première visite). */
function sponsorsCompterVisite() {
  var v = sponsorsLire(SPONSORS_CLE_VISITES, null);
  var jour = new Date().toISOString().slice(0, 10);
  if (!v || v.jour !== jour) v = { jour: jour, n: 0 };
  v.n++;
  sponsorsEcrire(SPONSORS_CLE_VISITES, v);
  return v.n;
}

/**
 * Décide si l'interstitiel doit s'afficher MAINTENANT. Quatre verrous, dans cet ordre :
 *  1. l'emplacement est allumé et au moins un partenaire y est déclaré ;
 *  2. ce n'est pas la toute première arrivée de la journée (réglable) — c'est le cas que
 *     les moteurs de recherche pénalisent et celui qui agace le plus un parent pressé ;
 *  3. la période de repos depuis le dernier affichage est écoulée ;
 *  4. le tournoi est publié (sinon la page ne montre qu'un écran « à venir » : un message
 *     plein écran par-dessus n'aurait aucun sens).
 */
function sponsorsPeutAfficherPlein(reglages, candidats, nbVisites, publie) {
  if (!reglages.pleinActif || !candidats.length) return false;
  if (!publie) return false;
  if (!reglages.pleinPremiereVisite && nbVisites <= 1) return false;
  var dernier = sponsorsLire(SPONSORS_CLE_PLEIN, null);
  if (dernier && dernier.t) {
    var ecoule = (Date.now() - dernier.t) / 60000;
    if (ecoule < reglages.pleinReposMin) return false;
  }
  return true;
}

/**
 * Affiche l'interstitiel. Vraie boîte de dialogue : focus capturé à l'intérieur, Échap qui
 * ferme, bouton « Passer » d'au moins 44 px, focus rendu à son point de départ à la fermeture.
 *
 * @param {Object} s        partenaire à afficher
 * @param {Object} reglages durées
 * @param {Function} [surFermeture] rappel optionnel
 */
function sponsorsAfficherPlein(s, reglages, surFermeture) {
  if (!s) return;

  var debut = Date.now();
  var minuteurs = [];
  var focusDepart = document.activeElement;

  var fond = document.createElement('div');
  fond.className = 'sp-plein';
  fond.setAttribute('role', 'dialog');
  fond.setAttribute('aria-modal', 'true');
  fond.setAttribute('aria-label', 'Message d\'un partenaire du tournoi');
  // Le conteneur est focalisable au programme (jamais au Tab) : c'est LUI qui reçoit le focus
  // à l'ouverture. Le bouton « Passer » ne peut pas jouer ce rôle — il est désactivé pendant
  // le décompte, et un élément désactivé refuse le focus : le clavier resterait derrière la boîte.
  fond.setAttribute('tabindex', '-1');

  // Visuel fourni par le partenaire, sinon composition automatique logo + accroche + couleur.
  var visuel = s.visuel_id
    ? '<img class="sp-plein-image" src="' + echapper(sponsorsUrlImage(s.visuel_id, 900)) +
      '" alt="' + echapper(s.nom) + '" decoding="async">'
    : '<div class="sp-plein-compose" style="background:' + echapper(sponsorsCouleur(s)) + '">' +
        '<span class="sp-plein-marque">' + echapper(s.nom) + '</span>' +
        (s.accroche ? '<span class="sp-plein-accroche">' + echapper(s.accroche) + '</span>' : '') +
        (String(s.url || '').trim() ? '<span class="sp-plein-cta">Découvrir →</span>' : '') +
      '</div>';

  fond.innerHTML =
    '<div class="sp-plein-boite">' +
      sponsorsOuvrir(s, visuel, 'sp-plein-visuel', 'plein') +
      '<span class="sp-plein-mention">Partenaire du tournoi</span>' +
      '<div class="sp-plein-jauge" aria-hidden="true"><i></i></div>' +
      '<button type="button" class="sp-plein-passer">Passer</button>' +
    '</div>';

  var bouton = fond.querySelector('.sp-plein-passer');
  var jauge = fond.querySelector('.sp-plein-jauge i');

  function fermer(raison) {
    minuteurs.forEach(clearTimeout);
    if (!fond.parentNode) return;
    document.removeEventListener('keydown', surTouche, true);
    fond.parentNode.removeChild(fond);
    document.body.classList.remove('sp-plein-ouvert');
    sponsorsCompterPlein(s.id_sponsor, Math.round((Date.now() - debut) / 1000), raison === 'passer');
    if (focusDepart && focusDepart.focus) { try { focusDepart.focus(); } catch (e) {} }
    if (typeof surFermeture === 'function') surFermeture();
  }

  function surTouche(e) {
    if (e.key === 'Escape') { e.preventDefault(); fermer('passer'); return; }
    if (e.key !== 'Tab') return;
    // Piège à focus : on ne sort pas de la boîte au clavier tant qu'elle est ouverte.
    var focusables = fond.querySelectorAll('a[href], button:not([disabled])');
    if (!focusables.length) { e.preventDefault(); return; }
    var premier = focusables[0], dernier = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  }

  bouton.addEventListener('click', function () { fermer('passer'); });
  fond.addEventListener('click', function (e) { if (e.target === fond) fermer('passer'); });
  document.addEventListener('keydown', surTouche, true);

  document.body.appendChild(fond);
  document.body.classList.add('sp-plein-ouvert');
  fond.focus();

  // Le bouton existe dès le départ (jamais de croix cachée) mais n'agit qu'après le délai :
  // il affiche le décompte pour que l'attente soit lisible plutôt que subie.
  var restant = reglages.pleinSkipS;
  if (restant > 0) {
    bouton.disabled = true;
    bouton.textContent = 'Passer dans ' + restant + ' s';
    var tic = setInterval(function () {
      restant--;
      if (restant > 0) { bouton.textContent = 'Passer dans ' + restant + ' s'; return; }
      clearInterval(tic);
      bouton.disabled = false;
      bouton.textContent = 'Passer';
      bouton.focus(); // dès qu'il devient actionnable, le clavier tombe dessus
    }, 1000);
    minuteurs.push(tic);
  } else {
    bouton.focus();
  }

  if (jauge) {
    jauge.style.transition = 'width ' + reglages.pleinDureeS + 's linear';
    // Un souffle avant de lancer la transition, sinon le navigateur applique la largeur finale
    // directement et la jauge paraît figée.
    requestAnimationFrame(function () { requestAnimationFrame(function () { jauge.style.width = '100%'; }); });
  }
  minuteurs.push(setTimeout(function () { fermer('fin'); }, reglages.pleinDureeS * 1000));

  sponsorsEcrire(SPONSORS_CLE_PLEIN, { t: Date.now(), id: s.id_sponsor });
}

/* ==========================================================================
   MESURE — 100 % LOCALE
   --------------------------------------------------------------------------
   Trois compteurs par partenaire :
     • temps d'exposition réel, par emplacement — le logo présent à plus de 50 % dans
       l'écran ET l'onglet au premier plan. C'est le seul indicateur qu'un partenaire
       peut comparer à un panneau au bord du terrain ;
     • nombre d'affichages, par emplacement ;
     • clics, plus le détail de l'interstitiel (durée regardée, passages anticipés).
   Plus une répartition par tranche de 30 minutes : la « visibilité tout au long de
   l'événement » que la fiche restitue en courbe.
   ========================================================================== */

/** Structure vide d'un partenaire dans les compteurs. */
function sponsorsMesureVide() {
  return { expo: {}, aff: {}, clics: 0, plein: { ouverts: 0, secondes: 0, passes: 0 }, tranches: {} };
}

/** Compteurs du jour (remis à zéro au changement de date : un tournoi tient sur une journée). */
function sponsorsMesure() {
  var jour = new Date().toISOString().slice(0, 10);
  var m = sponsorsLire(SPONSORS_CLE_MESURE, null);
  if (!m || m.jour !== jour) m = { jour: jour, debut: Date.now(), sponsors: {} };
  if (!m.sponsors) m.sponsors = {};
  return m;
}

var sponsorsMesureEnCours = null;   // copie de travail, écrite par à-coups
var sponsorsMesureSale = false;

function sponsorsMesureCharger() {
  if (!sponsorsMesureEnCours) sponsorsMesureEnCours = sponsorsMesure();
  return sponsorsMesureEnCours;
}
function sponsorsMesureFiche(id) {
  var m = sponsorsMesureCharger();
  if (!m.sponsors[id]) m.sponsors[id] = sponsorsMesureVide();
  return m.sponsors[id];
}
/** Écriture différée : on ne martèle pas le stockage local à chaque seconde comptée. */
function sponsorsMesureEnregistrer(tout_de_suite) {
  sponsorsMesureSale = true;
  if (!tout_de_suite) return;
  sponsorsEcrire(SPONSORS_CLE_MESURE, sponsorsMesureCharger());
  sponsorsMesureSale = false;
}

/** Tranche de 30 minutes courante, au format HH:MM (clé de la courbe de visibilité). */
function sponsorsTranche() {
  var d = new Date();
  var h = String(d.getHours()).padStart(2, '0');
  var m = (d.getMinutes() < 30) ? '00' : '30';
  return h + ':' + m;
}

function sponsorsCompterAffichage(id, emplacement) {
  if (!id) return;
  var f = sponsorsMesureFiche(id);
  f.aff[emplacement] = (f.aff[emplacement] || 0) + 1;
  sponsorsMesureEnregistrer(false);
}

function sponsorsCompterClic(id, emplacement) {
  if (!id) return;
  var f = sponsorsMesureFiche(id);
  f.clics = (f.clics || 0) + 1;
  f.aff['clic_' + emplacement] = (f.aff['clic_' + emplacement] || 0) + 1;
  sponsorsMesureEnregistrer(true); // un clic précède souvent une navigation : on écrit tout de suite

  // ET ON REMONTE IMMÉDIATEMENT. Le clic est l'événement le plus précieux de la fiche
  // partenaire — celui qu'un sponsor regarde en premier — et c'est aussi le plus fragile :
  // le lien s'ouvre dans un NOUVEL onglet, donc la page d'origine n'est jamais déchargée.
  // Ni `pagehide` ni `visibilitychange` ne sont garantis dans ce cas (le comportement dépend
  // du navigateur et de la façon dont l'onglet est ouvert), et attendre le relevé périodique
  // ferait patienter jusqu'à 10 minutes. On n'attend donc pas.
  sponsorsEnvoyerRelevePourClic();
}

/* Un clic déclenche un relevé, mais pas dix relevés pour dix clics : au-delà d'un envoi
   toutes les 3 s, les clics suivants sont simplement comptés et partiront avec le prochain
   relevé (les compteurs étant cumulatifs, rien n'est perdu). */
var SPONSORS_CLIC_ANTI_RAFALE_MS = 3000;

function sponsorsEnvoyerRelevePourClic() {
  if (Date.now() - sponsorsDernierEnvoi < SPONSORS_CLIC_ANTI_RAFALE_MS) return;
  sponsorsEnvoyerReleve(true); // keepalive : la requête survit même si la page est quittée
}

function sponsorsCompterPlein(id, secondes, passe) {
  if (!id) return;
  var f = sponsorsMesureFiche(id);
  f.plein.ouverts += 1;
  f.plein.secondes += Math.max(0, secondes || 0);
  if (passe) f.plein.passes += 1;
  f.aff.plein = (f.aff.plein || 0) + 1;
  sponsorsMesureEnregistrer(true);
}

/* --- Chronomètre d'exposition --- */

var sponsorsObserves = [];      // { element, id, emplacement, visible }
var sponsorsObservateur = null;
var sponsorsTicker = null;

/**
 * Met un élément sous surveillance : tant qu'il est visible à plus de 50 % ET que l'onglet est
 * au premier plan, une seconde d'exposition est créditée à son partenaire, chaque seconde.
 */
function sponsorsSurveiller(element, id, emplacement) {
  if (!element || !id || typeof IntersectionObserver === 'undefined') return;

  if (!sponsorsObservateur) {
    sponsorsObservateur = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        for (var i = 0; i < sponsorsObserves.length; i++) {
          if (sponsorsObserves[i].element === e.target) {
            sponsorsObserves[i].visible = (e.intersectionRatio >= 0.5);
            break;
          }
        }
      });
    }, { threshold: [0, 0.5, 1] });
  }

  sponsorsObserves.push({ element: element, id: id, emplacement: emplacement, visible: false });
  sponsorsObservateur.observe(element);
  sponsorsDemarrerChrono();
}

/** Une seule horloge pour tout le monde : elle crédite chaque élément réellement exposé. */
function sponsorsDemarrerChrono() {
  if (sponsorsTicker) return;
  sponsorsTicker = setInterval(function () {
    if (document.hidden) return; // téléphone verrouillé, autre appli : on ne compte pas
    var tranche = sponsorsTranche();
    var creditees = {};
    sponsorsObserves.forEach(function (o) {
      if (!o.visible || !o.element.isConnected) return;
      var f = sponsorsMesureFiche(o.id);
      f.expo[o.emplacement] = (f.expo[o.emplacement] || 0) + 1;
      // La courbe horaire compte une seconde par partenaire, pas par emplacement : un même
      // logo présent deux fois à l'écran ne doit pas doubler artificiellement sa visibilité.
      if (!creditees[o.id]) {
        creditees[o.id] = true;
        f.tranches[tranche] = (f.tranches[tranche] || 0) + 1;
      }
    });
    sponsorsMesureEnregistrer(false);
  }, 1000);

  // Filet : on écrit vraiment toutes les 5 s, et systématiquement quand la page disparaît
  // (pagehide couvre la fermeture d'onglet, visibilitychange le passage en arrière-plan sur
  // téléphone — où pagehide n'est pas garanti). Un onglet fermé brutalement perd au pire
  // les 5 dernières secondes : acceptable pour une mesure de visibilité.
  setInterval(function () { if (sponsorsMesureSale) sponsorsMesureEnregistrer(true); }, 5000);
  window.addEventListener('pagehide', function () { sponsorsMesureEnregistrer(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) sponsorsMesureEnregistrer(true);
  });
}

/** Oublie les éléments retirés du DOM (la page se redessine à chaque rafraîchissement). */
function sponsorsOublierDetaches() {
  sponsorsObserves = sponsorsObserves.filter(function (o) {
    if (o.element.isConnected) return true;
    if (sponsorsObservateur) sponsorsObservateur.unobserve(o.element);
    return false;
  });
}

/**
 * Branche la mesure sur une zone fraîchement rendue : compte un affichage pour chaque bloc
 * partenaire, met les logos sous chronomètre, et enregistre les clics.
 */
function sponsorsBrancherMesure(racine, options) {
  if (!racine) return;
  sponsorsOublierDetaches();
  var compterAffichage = !(options && options.sansAffichage);

  racine.querySelectorAll('[data-sponsor]').forEach(function (el) {
    var id = el.getAttribute('data-sponsor');
    var emplacement = el.getAttribute('data-emplacement') || '';
    if (el.getAttribute('data-mesure') === 'oui') return; // déjà branché
    el.setAttribute('data-mesure', 'oui');

    if (compterAffichage) sponsorsCompterAffichage(id, emplacement);
    sponsorsSurveiller(el, id, emplacement);
    el.addEventListener('click', function () { sponsorsCompterClic(id, emplacement); });
  });
}

/* ==========================================================================
   BILAN — ce que lit la fiche de visibilité de l'admin
   ========================================================================== */

/**
 * Consolide les compteurs de CET APPAREIL en un bilan par partenaire, prêt à afficher.
 * @param {Array} liste partenaires connus (pour retrouver les noms)
 * @returns {Object} { jour, total_expo, sponsors: [ { id, nom, expo, affichages, clics, … } ] }
 */
function sponsorsBilan(liste, compteurs) {
  // `compteurs` = compteurs consolidés de TOUS les appareils (voir sponsorsConsolider).
  // Absent, on retombe sur ceux de l'appareil courant — c'est le mode dégradé, utile quand
  // la remontée n'est pas encore déployée ou qu'aucun relevé n'est arrivé.
  var m = compteurs ? { jour: (compteurs.jour || ''), debut: 0, sponsors: compteurs.sponsors || compteurs }
                    : sponsorsMesure();
  var parId = {};
  (liste || []).forEach(function (s) { parId[s.id_sponsor] = s; });

  var lignes = [];
  var totalExpo = 0;

  Object.keys(m.sponsors).forEach(function (id) {
    var f = m.sponsors[id];
    var expo = 0, affichages = 0;
    Object.keys(f.expo || {}).forEach(function (k) { expo += f.expo[k]; });
    Object.keys(f.aff || {}).forEach(function (k) {
      if (k.indexOf('clic_') !== 0) affichages += f.aff[k];
    });
    totalExpo += expo;
    lignes.push({
      id: id,
      nom: (parId[id] && parId[id].nom) || id,
      expo: expo,
      parEmplacement: f.expo || {},
      affichages: affichages,
      clics: f.clics || 0,
      plein: f.plein || { ouverts: 0, secondes: 0, passes: 0 },
      tranches: f.tranches || {}
    });
  });

  lignes.forEach(function (l) {
    l.partDeVoix = totalExpo ? Math.round(l.expo / totalExpo * 100) : 0;
    l.tauxClic = l.affichages ? Math.round(l.clics / l.affichages * 1000) / 10 : 0;
  });
  lignes.sort(function (a, b) { return b.expo - a.expo; });

  return { jour: m.jour, debut: m.debut, totalExpo: totalExpo, sponsors: lignes };
}

/* ==========================================================================
   ENVOI DES RELEVÉS — consolidation entre appareils
   --------------------------------------------------------------------------
   Les compteurs restent calculés en local (rien ne change à la mesure elle-même) ;
   ce qui s'ajoute ici, c'est leur REMONTÉE, pour que la fiche partenaire porte sur
   tous les spectateurs et plus seulement sur l'appareil qui la consulte.

   Trois choix qui tiennent l'ensemble :
    • on envoie des CUMULS, jamais des écarts — un envoi perdu ne coûte que le temps
      écoulé depuis le précédent, jamais l'historique de la session ;
    • la consolidation prendra le MAXIMUM par session — un envoi arrivé deux fois ne
      compte donc pas double, ce qui autorise à écrire sans verrou ni relecture ;
    • on n'envoie qu'À INTERVALLES ESPACÉS (10 min) et à la fermeture, jamais à chaque
      seconde comptée : quelques relevés par visite, pas des milliers.

   VIE PRIVÉE — deux identifiants ALÉATOIRES tirés sur l'appareil, remis à zéro chaque
   jour. Ils ne portent aucune donnée personnelle, ne permettent d'identifier personne,
   et ne suivent personne d'un site à l'autre. Aucun cookie, aucun traceur tiers.
   ========================================================================== */

var SPONSORS_CLE_APPAREIL = 'r92_sponsors_appareil'; // identifiant d'appareil (portée)
/* Le PREMIER relevé part vite (20 s), les suivants s'espacent (10 min).
   Ce n'est pas un détail de réglage : la grande majorité des visites durent moins d'une
   minute. Si le seul relevé d'une visite courte était celui de la fermeture — le moment
   le moins fiable, où le navigateur peut couper la requête —, ces spectateurs
   n'apparaîtraient nulle part, et la PORTÉE annoncée au partenaire serait sous-estimée. */
var SPONSORS_PREMIER_ENVOI_MS = 20 * 1000;
var SPONSORS_ENVOI_MS = 10 * 60 * 1000;
var sponsorsSession = null;                          // identifiant de la visite en cours
var sponsorsDernierEnvoi = 0;                        // 0 = aucun relevé encore parti
var sponsorsDebutVisite = Date.now();
var sponsorsEnvoiArme = false;

/** Identifiant aléatoire court, sans dépendance à crypto (vieux navigateurs compris). */
function sponsorsIdAleatoire() {
  return (Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6))
    .replace(/[^a-z0-9]/g, '') || 'anonyme';
}

/** Identifiant de CET APPAREIL pour la journée. Sert à compter la portée (combien de monde). */
function sponsorsIdAppareil() {
  var jour = new Date().toISOString().slice(0, 10);
  var m = sponsorsLire(SPONSORS_CLE_APPAREIL, null);
  if (!m || m.jour !== jour || !m.id) {
    m = { jour: jour, id: sponsorsIdAleatoire() };
    sponsorsEcrire(SPONSORS_CLE_APPAREIL, m);
  }
  return m.id;
}

/** Identifiant de la VISITE en cours (jamais mémorisé : une nouvelle par ouverture de page). */
function sponsorsIdSession() {
  if (!sponsorsSession) sponsorsSession = sponsorsIdAleatoire();
  return sponsorsSession;
}

/**
 * Envoie le cumul courant. `definitif` = on quitte la page : on utilise alors `keepalive`,
 * qui laisse le navigateur terminer la requête après la fermeture de l'onglet.
 *
 * Ne renvoie rien et n'attend rien : un relevé perdu n'est qu'une mesure d'audience, il ne
 * doit JAMAIS retarder l'affichage d'un score ni faire échouer quoi que ce soit.
 */
function sponsorsEnvoyerReleve(definitif) {
  var m = sponsorsMesureCharger();
  if (!m || !m.sponsors || !Object.keys(m.sponsors).length) return;
  if (typeof API_URL !== 'string' || !API_URL) return;

  sponsorsDernierEnvoi = Date.now();
  var corps = JSON.stringify({
    action: 'mesureSponsors',
    appareil: sponsorsIdAppareil(),
    session: sponsorsIdSession(),
    sponsors: m.sponsors
  });

  try {
    // text/plain : évite la requête de contrôle CORS préalable, qu'Apps Script ne gère pas.
    fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: !!definitif,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: corps
    }).catch(function () { /* relevé perdu : sans conséquence */ });
  } catch (e) { /* idem */ }
}

/**
 * Arme la remontée : un relevé toutes les 10 minutes tant que la page vit, et un dernier
 * quand elle disparaît. Appelée une seule fois, quand des partenaires sont réellement à
 * l'écran (donc jamais si les sponsors sont éteints).
 */
function sponsorsArmerEnvoi() {
  if (sponsorsEnvoiArme) return;
  sponsorsEnvoiArme = true;

  setInterval(function () {
    if (document.hidden) return; // onglet en poche : rien de neuf à remonter
    var attente = sponsorsDernierEnvoi ? SPONSORS_ENVOI_MS : SPONSORS_PREMIER_ENVOI_MS;
    var depuis = Date.now() - (sponsorsDernierEnvoi || sponsorsDebutVisite);
    if (depuis < attente) return;
    sponsorsEnvoyerReleve(false);
  }, 5000);

  // La page disparaît : dernier relevé. `pagehide` couvre la fermeture d'onglet,
  // `visibilitychange` le passage en arrière-plan sur téléphone, où `pagehide` n'est
  // pas garanti. Les deux peuvent tirer : le doublon est absorbé par le MAX par session.
  window.addEventListener('pagehide', function () { sponsorsEnvoyerReleve(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) sponsorsEnvoyerReleve(true);
  });
}

/* ==========================================================================
   CONSOLIDATION — additionner tous les appareils
   ========================================================================== */

/**
 * Fusionne les relevés de TOUS les appareils en un jeu de compteurs unique, au format de
 * `sponsorsMesure()` — la fiche de visibilité n'a donc rien à savoir de leur provenance.
 *
 * Règle centrale : **MAXIMUM par session, puis somme des sessions**. Une session dépose
 * plusieurs relevés cumulatifs au fil de la visite ; les additionner compterait le même
 * temps autant de fois qu'il y a eu d'envois. Le maximum retient l'état final de chaque
 * session, et reste juste même si un relevé s'est perdu ou est arrivé en double.
 *
 * @param {Array} releves  [{ appareil, session, sponsors }]
 * @returns {Object} { sponsors, appareils, sessions }
 */
function sponsorsConsolider(releves) {
  var parSession = {};   // session → derniers compteurs connus (les plus élevés)
  var appareils = {};

  (releves || []).forEach(function (r) {
    if (!r || !r.sponsors) return;
    // Les relevés d'autodiagnostic de l'admin portent un identifiant réservé : ils ne
    // doivent compter ni dans la portée, ni dans les chiffres d'un partenaire.
    if (Object.keys(r.sponsors).every(function (id) { return id.indexOf('__') === 0; })) return;
    appareils[r.appareil] = 1;
    var courant = parSession[r.session];
    if (!courant) { parSession[r.session] = r.sponsors; return; }
    // Relevé plus récent de la même session : on garde, valeur par valeur, la plus grande.
    Object.keys(r.sponsors).forEach(function (id) {
      courant[id] = sponsorsMaxFiche(courant[id], r.sponsors[id]);
    });
  });

  var total = {};
  Object.keys(parSession).forEach(function (session) {
    var fiches = parSession[session];
    Object.keys(fiches).forEach(function (id) {
      if (id.indexOf('__') === 0) return;   // identifiant réservé (autodiagnostic)
      total[id] = sponsorsAdditionnerFiche(total[id], fiches[id]);
    });
  });

  return {
    sponsors: total,
    appareils: Object.keys(appareils).length,
    sessions: Object.keys(parSession).length
  };
}

/** Maximum champ à champ de deux relevés cumulatifs d'une MÊME session. */
function sponsorsMaxFiche(a, b) {
  if (!a) return b;
  if (!b) return a;
  var r = sponsorsMesureVide();
  ['expo', 'aff', 'tranches'].forEach(function (bloc) {
    Object.keys(a[bloc] || {}).forEach(function (k) { r[bloc][k] = a[bloc][k]; });
    Object.keys(b[bloc] || {}).forEach(function (k) {
      r[bloc][k] = Math.max(r[bloc][k] || 0, b[bloc][k]);
    });
  });
  r.clics = Math.max(a.clics || 0, b.clics || 0);
  r.plein = {
    ouverts:  Math.max((a.plein || {}).ouverts || 0,  (b.plein || {}).ouverts || 0),
    secondes: Math.max((a.plein || {}).secondes || 0, (b.plein || {}).secondes || 0),
    passes:   Math.max((a.plein || {}).passes || 0,   (b.plein || {}).passes || 0)
  };
  return r;
}

/** Somme champ à champ de deux relevés de sessions DIFFÉRENTES. */
function sponsorsAdditionnerFiche(a, b) {
  if (!a) return sponsorsMaxFiche(sponsorsMesureVide(), b);
  var r = sponsorsMesureVide();
  ['expo', 'aff', 'tranches'].forEach(function (bloc) {
    Object.keys(a[bloc] || {}).forEach(function (k) { r[bloc][k] = a[bloc][k]; });
    Object.keys((b || {})[bloc] || {}).forEach(function (k) {
      r[bloc][k] = (r[bloc][k] || 0) + b[bloc][k];
    });
  });
  r.clics = (a.clics || 0) + ((b || {}).clics || 0);
  r.plein = {
    ouverts:  ((a.plein || {}).ouverts || 0)  + (((b || {}).plein || {}).ouverts || 0),
    secondes: ((a.plein || {}).secondes || 0) + (((b || {}).plein || {}).secondes || 0),
    passes:   ((a.plein || {}).passes || 0)   + (((b || {}).plein || {}).passes || 0)
  };
  return r;
}

/** Efface les compteurs de l'appareil (bouton « repartir de zéro » de l'admin). */
function sponsorsRemettreAZero() {
  sponsorsMesureEnCours = null;
  sponsorsMesureSale = false;
  try {
    localStorage.removeItem(SPONSORS_CLE_MESURE);
    localStorage.removeItem(SPONSORS_CLE_ROUES);
    localStorage.removeItem(SPONSORS_CLE_PLEIN);
    localStorage.removeItem(SPONSORS_CLE_VISITES);
  } catch (e) { /* stockage indisponible */ }
}

/** Durée en secondes → « 4 h 37 » / « 58 min » / « 42 s ». */
function sponsorsDuree(secondes) {
  var s = Math.max(0, Math.round(secondes || 0));
  if (s < 60) return s + ' s';
  var min = Math.round(s / 60);
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0');
}
