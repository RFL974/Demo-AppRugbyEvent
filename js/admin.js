/**
 * ============================================================================
 *  ADMIN — logique de la page d'administration
 * ============================================================================
 *  - Affiche et modifie les réglages (horaires globaux + catégories).
 *  - Saisie des équipes (ajout / suppression).
 *  - Génération des poules et du planning, avec affichage du résultat.
 *  - Assistant d'arbitrage : si l'heure de fin manuelle est dépassée, propose
 *    des ajustements cliquables pour tenir le créneau.
 *  Tout passe par le backend (voir api.js) qui lit/écrit dans le Google Sheet.
 * ============================================================================
 */

/* Champs modifiables d'une catégorie : clé (dans le Sheet), libellé, type de champ.
   NB : `terrains` n'est plus ici — il a son propre bloc (Auto / Manuel), voir blocTerrains(). */
const CHAMPS_CATEGORIE = [
  { cle: 'nb_poules',              label: 'Nombre de poules',          type: 'text', placeholder: 'Auto' },
  // Option vide « — » en tête : une catégorie neuve est VIERGE (aucune valeur devinée). Sans elle,
  // un select vide retomberait sur « 1 ». champCategorie affiche l'option vide comme « — ».
  // Vocabulaire FFR « période » (ex-« mi-temps ») : la clé Sheet reste `*_mi_temps*` (inchangée).
  { cle: 'format_mi_temps',        label: 'Nombre de période',         type: 'select', options: ['', '1', '2'] },
  { cle: 'duree_mi_temps_min',     label: 'Durée de la période (min)', type: 'number' },
  { cle: 'pause_mi_temps_min',     label: 'Pause entre deux périodes (min)', type: 'number' },
  { cle: 'recup_entre_matchs_min', label: 'Récup. entre matchs (min)', type: 'number' },
  // Champs « dossier club » (facultatifs). `arbitrage_organisation` : qui arbitre — nom volontairement
  // distinct de l'« arbitrage » de l'assistant horaires (deux concepts différents). Le champ
  // `reglement` a été retiré de la carte (sa valeur stockée est PRÉSERVÉE à l'enregistrement).
  { cle: 'effectif_min',           label: 'Effectif min (joueurs)',    type: 'number' },
  { cle: 'effectif_max',           label: 'Effectif max (joueurs)',    type: 'number' },
  { cle: 'arbitrage_organisation', label: 'Arbitrage (qui arbitre ?)', type: 'text', placeholder: 'Ex : éducateurs des clubs' },
  // Phase 1 (invitation) : nombre max d'équipes par club dans cette catégorie. Vide = illimité
  // (affiché « Plusieurs équipes possibles par catégorie » sur l'invitation, jamais « 0 »).
  { cle: 'max_equipes_par_club',   label: 'Max équipes par club',      type: 'number', placeholder: 'Vide = illimité' }
];

/* Formats d'après-midi proposés (choisis AU PARAMÉTRAGE, avant le jour J), avec une
   explication concrète visible au moment du choix — jamais un simple menu déroulant. */
const FORMATS_APRESMIDI = [
  {
    cle: 'POULES_NIVEAU', titre: 'Poules de niveau (haute / basse)',
    desc: "Le classement de midi est découpé en poules de niveau de 4-5 équipes (poule haute = les "
        + "meilleurs, puis niveau 2, etc.), chacune jouée en round-robin COMPLET : 3 matchs chacune "
        + "dans une poule de 4. Le 1ᵉʳ de la poule haute remporte le tournoi — sans finale, conforme "
        + "EDR. Recommandé à 2-3 poules le matin (le croisé classique n'y donne que 1-2 matchs)."
  },
  {
    cle: 'CROISE', titre: 'Classement croisé',
    desc: "Les équipes sont reclassées par niveau après les poules du matin (les 1ᵉʳˢ de chaque "
        + "poule ensemble = Niveau 1, etc.), puis s'affrontent en round-robin dans leur niveau. "
        + "Un classement général et un podium sont désignés : le vainqueur du Niveau 1 remporte le tournoi."
  },
  {
    cle: 'CROISE_DIAGONAL', titre: 'Classement croisé diagonal',
    desc: "Les équipes s'affrontent entre poules par rangs CROISÉS : le 1ᵉʳ d'une poule affronte le "
        + "2ᵉ d'une AUTRE poule (au lieu du 1ᵉʳ contre le 1ᵉʳ du croisé classique). Des matchs plus "
        + "imprévisibles. Pas de vainqueur désigné par élimination : résultats cumulés au classement général."
  },
  {
    cle: 'LIBRE', titre: 'Matchs libres',
    desc: "Pas de classement l'après-midi : les équipes jouent simplement plusieurs matchs amicaux "
        + "supplémentaires, sans enjeu ni hiérarchie (pas de podium). Recommandé pour les plus jeunes (M6–M8)."
  },
  /* Format PROPOSÉ, mais SIGNALÉ : il comporte des phases finales, qui ne sont pas conformes au
   * cadre des rencontres École de Rugby (Formulaire de demande d'autorisation FFR, grille
   * 2026-2027, « Rappel des principes généraux » : « Les phases finales (1/4, demi finale et
   * finale) sont interdites sur les tournois ou plateaux Ecoles de Rugby »).
   *
   * On ne le RETIRE pas : un organisateur dont l'événement relève d'un autre règlement doit
   * pouvoir le choisir. Mais on ne le laisse pas non plus choisir SANS SAVOIR — d'où le drapeau
   * `horsCadreEdr`, qui déclenche à la fois le marquage visuel de la carte et la confirmation
   * (voir CONFIRMATION_HORS_CADRE_EDR et onReglagesChange). L'app INFORME, elle ne tranche pas :
   * quel règlement s'applique à l'événement n'appartient pas au logiciel. */
  {
    cle: 'COUPE_PLATEAU', titre: '⚠️ Coupe + Plateau — hors cadre École de Rugby',
    horsCadreEdr: true,
    desc: "Les premiers de chaque poule s'affrontent en élimination directe jusqu'à une finale "
        + "(un vainqueur du tournoi est désigné). Les autres équipes jouent un plateau, sans élimination. "
        + "⚠️ Ce format comporte des PHASES FINALES (quarts, demies, finale) : elles ne sont pas conformes "
        + "au cadre des rencontres École de Rugby. À réserver aux événements dont le règlement les "
        + "autorise. Il demande aussi une saisie de score plus rigoureuse côté bénévoles."
  }
];

/* Texte de la confirmation demandée AVANT d'appliquer un format marqué `horsCadreEdr`.
 * Il SIGNALE une règle et invite à vérifier ; il ne déclare pas le choix interdit, et il ne
 * prétend pas dire quel règlement s'applique — c'est à l'organisateur de le savoir. */
const CONFIRMATION_HORS_CADRE_EDR =
  'Vous choisissez un format comportant des phases finales (quarts, demies, finale).\n\n' +
  'Ces phases finales ne sont pas conformes au cadre des rencontres École de Rugby. ' +
  'Vérifiez qu\'elles correspondent bien au règlement applicable à votre événement.';

/** Définition d'un format d'après-midi, par sa clé (ou null si la clé est inconnue). */
function definitionFormatApresMidi(cle) {
  return FORMATS_APRESMIDI.find(function (f) { return f.cle === cle; }) || null;
}

/** Un format demande-t-il l'avertissement « hors cadre École de Rugby » ? (défaut : non) */
function formatHorsCadreEdr(cle) {
  const def = definitionFormatApresMidi(cle);
  return !!(def && def.horsCadreEdr);
}

/** Format d'après-midi retenu pour une catégorie (défaut = CROISE, comportement historique). */
function formatApresMidiDe(cat) {
  const f = (cat && cat.format_apresmidi != null) ? String(cat.format_apresmidi).trim().toUpperCase() : '';
  return (f === 'LIBRE' || f === 'COUPE_PLATEAU' || f === 'CROISE_DIAGONAL' || f === 'POULES_NIVEAU') ? f : 'CROISE';
}

/** Mode d'attribution des terrains d'une catégorie : true = Auto (onglet Terrains), false = Manuel.
 *  Défaut = Auto (colonne vide ou absente → auto). Seul 'non' bascule en manuel. */
function terrainsAutoDe(cat) {
  const v = (cat && cat.terrains_auto != null) ? String(cat.terrains_auto).trim().toLowerCase() : '';
  return v !== 'non';
}

/** Nombre de qualifiés en Coupe lu dans param_format (JSON), défaut 2. */
function nbQualifiesCoupeDe(cat) {
  try {
    const o = JSON.parse((cat && cat.param_format) ? String(cat.param_format) : '{}');
    const n = parseInt(o && o.nbQualifiesCoupe, 10);
    return (isFinite(n) && n >= 1) ? n : 2;
  } catch (e) { return 2; }
}

/* Contexte Super Challenge de France — session 13 (déclaratif). Ces trois helpers sont le MIROIR
   exact de contexteScfCategorie() (backend Code.gs) : même règle prudente par construction. */

/** Vrai si la catégorie relève du Super Challenge = catégorie FFR M14 (U14 dans l'app).
 *  Mirror de normaliserCategorie (backend) restreint à '14' : « U14 »/« M14 » → true, sinon false. */
function categorieSuperChallenge(nom) {
  return String(nom == null ? '' : nom).trim().toUpperCase().replace(/^[MU](?=\d)/, '') === '14';
}

/** Contexte de jeu d'une catégorie : 'SCF' (Super Challenge) ou 'LAMBDA' (défaut historique).
 *  Prudent : 'SCF' seulement si la catégorie est U14 ET contexte_tournoi vaut exactement 'SCF' ;
 *  tout le reste (vide, 'LAMBDA', inconnu, catégorie ≠ U14) → 'LAMBDA' (comportement inchangé). */
function contexteTournoiDe(cat) {
  const u14 = cat && categorieSuperChallenge(cat.categorie);
  const v = (cat && cat.contexte_tournoi != null) ? String(cat.contexte_tournoi).trim().toUpperCase() : '';
  return (u14 && v === 'SCF') ? 'SCF' : 'LAMBDA';
}

/** Phase Super Challenge retenue : 'P3' seulement si scf_phase vaut exactement 'P3', sinon 'P2'. */
function scfPhaseDe(cat) {
  const v = (cat && cat.scf_phase != null) ? String(cat.scf_phase).trim().toUpperCase() : '';
  return (v === 'P3') ? 'P3' : 'P2';
}

/* On garde en mémoire la config, les équipes et les matchs chargés (pour l'affichage). */
let configCourante = { global: {}, categories: [] };
let equipesCourantes = [];
let matchsCourants = [];
/* Modèle de travail pendant la modification manuelle des poules (null = pas en édition). */
let editionPoules = null;
/* Affiche du tournoi choisie mais pas encore enregistrée (Data URI redimensionné). */
let afficheDataURI = '';
/* Photo du parking choisie mais pas encore enregistrée (même mécanisme que l'affiche). */
let parkingDataURI = '';
/* Liste des clubs invités (chargée avec la clé admin — jamais dans les données publiques). */
let clubsInvitesCourants = [];

/* Point de passage COMMUN de la majorité des écritures de l'admin : exige la clé ADMIN
 * (voir api.js).
 * ⚠️ « Commun », et non « unique » — la nuance a de l'importance depuis que B2-0.5 s'appuie
 * dessus : l'inventaire du 2026-08-25 a trouvé CINQ écritures historiques qui la contournent
 * (partenaires, feuille de journée). Aucune ne touche la « Demande d'autorisation », ce qui
 * rend l'architecture valide — mais elle l'était par chance, pas par contrat. Les exceptions
 * sont désormais inventoriées et verrouillées par le contrôle G-J
 * (tests/frontend-autorisation-sync.test.js) : toute NOUVELLE écriture doit passer par ici. */
async function ecrireAdmin(action, data) {
  const res = await apiPostProtege(action, data, 'admin', 'admin');
  // ⭐ M1-B2 / B2-0.5 — l'écriture a RÉUSSI (apiPost LÈVE sur {error}, voir api.js:100) : si elle
  //   touche une donnée que lit la « Demande d'autorisation », la feuille affichée devient fausse
  //   à CET INSTANT. On l'efface tout de suite — local, certain, gratuit — et on la relira quand
  //   on la regardera. La classification des actions vit dans admin-autorisation.js.
  //
  // ⛔ DEUX GARDE-FOUS, et ils ne sont pas décoratifs :
  //   ① tout est enfermé dans un try/catch qui ne peut JAMAIS changer ce que cette fonction
  //     renvoie ni ce qu'elle lève — une panne d'affichage ne doit pas faire croire à un
  //     enregistrement raté ;
  //   ② la relecture n'est PAS attendue. `ecrireAdmin` porte 46 des 51 écritures de l'admin :
  //     lui ajouter la latence d'un aller-retour FFR ralentirait tous les enregistrements pour
  //     une zone d'affichage. Le succès d'une écriture métier ne dépend pas d'un rafraîchissement.
  try {
    if (typeof ecritureImpacteAutorisation === 'function' &&
        ecritureImpacteAutorisation(action, data, res)) {
      signalerAutorisationObsolete();
      // Vue classique (page longue) : personne ne « naviguera » vers la feuille, elle est déjà
      // sous les yeux — on lance la relecture EN ARRIÈRE-PLAN. En mode écrans / assistant, elle
      // attend l'ouverture de l'étape (voir ecrans.js et assistant.js).
      if (autorisationEstAffichee()) {
        majAutorisationSiObsolete().catch(function () { /* la feuille garde son message */ });
      }
    }
  } catch (e) { /* l'écran peut échouer, l'enregistrement reste acquis */ }
  return res;
}

/**
 * Lit la config COMPLÈTE (zone A + zone B, champs personnels inclus) via l'action doPost
 * `getConfigAdmin`, protégée par la clé admin. À utiliser PARTOUT où l'admin a besoin de la
 * config pour l'affichage/édition : getAll et getConfig sont désormais filtrés par liste blanche
 * (vues live / invitation) et ne renvoient plus les contacts. Lecture seule côté serveur : ne
 * prend pas le verrou d'écriture.
 */
async function lireConfigAdmin() {
  const r = await apiPostProtege('getConfigAdmin', {}, 'admin', 'admin');
  return (r && r.config) || { global: {}, categories: [] };
}

/**
 * Vrai si une catégorie est marquée présente ("oui", quelle que soit la casse).
 */
function estPresente(cat) {
  return String(cat.presente).toLowerCase() === 'oui';
}

/* --------------------------------------------------------------------------
   HELPERS PARTAGÉS entre plusieurs modules admin (image / affiche). Placés dans le
   NOYAU (chargé en premier) car appelés par admin-infos-publication.js (affiche),
   admin-invitations.js (parking) et initAdmin (câblage des zones de dépôt).
   -------------------------------------------------------------------------- */

/** URL d'affichage d'une affiche stockée dans Drive (CDN lh3, largeur maxi w).
 *  lh3.googleusercontent.com (et non drive.google.com/thumbnail, qui bloque le hotlinking). */
function urlAffiche(id, largeur) {
  return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id) + '=w' + (largeur || 1000);
}

/**
 * Câble une zone d'image (affiche du tournoi / photo de parking) : sélecteur de fichier
 * (change) + glisser-déposer (dragover/dragleave/drop), avec aperçu immédiat via `traiter`.
 * Le CLIC d'ouverture reste natif (zone dans un <label>).
 * @param {Object} cfg { champFichier: sélecteur CSS de l'<input file>, zoneDepot: id de la zone,
 *                        traiter: fonction(fichier) }
 */
function brancherZoneImage(cfg) {
  const input = document.querySelector(cfg.champFichier);
  if (input) input.addEventListener('change', function (e) {
    cfg.traiter(e.target.files && e.target.files[0]);
  });
  const zone = document.getElementById(cfg.zoneDepot);
  if (!zone) return;
  zone.addEventListener('dragover', function (e) {
    e.preventDefault(); // sinon le navigateur OUVRE le fichier au lieu de le déposer
    zone.classList.add('est-survolee');
  });
  zone.addEventListener('dragleave', function () { zone.classList.remove('est-survolee'); });
  zone.addEventListener('drop', function (e) {
    e.preventDefault();
    zone.classList.remove('est-survolee');
    cfg.traiter(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });
}

/**
 * Redimensionne une image (fichier) à `maxDim` px max sur le plus grand côté et renvoie
 * un Data URI (qualité 0..1). Allège fortement le poids avant l'envoi au backend.
 *
 * @param {string} [typeSortie]  'image/jpeg' par défaut (photos : bien plus léger).
 * @param {string} [fondCouleur] couleur peinte SOUS l'image avant l'encodage.
 *
 * ⚠️ POURQUOI PEINDRE UN FOND — le piège du logo sur fond noir.
 * Un canevas vierge est transparent-NOIR (rgba(0,0,0,0)). Tout maillon de la chaîne qui
 * aplatit la transparence — un encodage JPEG, mais aussi le proxy d'images de Google qui
 * sert les fichiers Drive — révèle donc ce noir, et un logo PNG détouré (le cas de presque
 * tous les logos de marque) ressort sur un carré noir.
 * Peindre un fond BLANC avant de dessiner rend le résultat déterministe : plus aucune
 * transparence à aplatir, donc plus aucun maillon capable de la rater. Les tuiles qui
 * accueillent les logos sont blanches elles aussi, le fond peint est donc invisible.
 */
function redimensionnerImage(fichier, maxDim, qualite, typeSortie, fondCouleur) {
  return new Promise(function (resoudre, rejeter) {
    const img = new Image();
    img.onload = function () {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (fondCouleur) { ctx.fillStyle = fondCouleur; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      resoudre(canvas.toDataURL(typeSortie || 'image/jpeg', qualite));
    };
    img.onerror = rejeter;
    const lecteur = new FileReader();
    lecteur.onload = function (e) { img.src = e.target.result; };
    lecteur.onerror = rejeter;
    lecteur.readAsDataURL(fichier);
  });
}

/**
 * Au chargement de la page : on récupère tout (config + équipes) en un appel,
 * puis on remplit la page.
 */
async function initAdmin() {
  const zoneReglages = document.getElementById('reglages');
  if (typeof injecterIcones === 'function') injecterIcones(); // icônes SVG des boutons statiques

  // La page d'administration édite des données PERSONNELLES (contacts, sécurité, réponse). Elle
  // exige donc la clé admin AVANT de charger la config : sans clé, aucune donnée sensible n'est
  // servie. La config COMPLÈTE se lit via getConfigAdmin (clé admin) ; getAll ne fournit plus que
  // les données live (équipes/planning + config filtrée), sans les contacts.
  const connecte = await connexion('admin', "à l'administration");
  majBarreConnexion(connecte);

  if (connecte) {
    try {
      // getAll : équipes / poules / matchs (sa config est la vue LIVE, on ne s'en sert pas pour
      // l'édition). getConfigAdmin : la config complète. Les deux en parallèle.
      const [data, cfg] = await Promise.all([apiGet('getAll'), lireConfigAdmin()]);
      configCourante = cfg;
      equipesCourantes = data.equipes;
      matchsCourants = data.matchs || [];

      // 1) Réglages (horaires + catégories) — depuis la config complète.
      injecterReglages(cfg.global, cfg.categories);
      injecterTerrains();
      remplirSelectCategories(cfg.categories);

      // 2) Équipes + 3) poules & planning déjà générés.
      afficherEquipes(data.equipes);
      afficherPlanning(data.poules, data.matchs);
      majApresMidi();
      majFeuilleJour();

      // 4) Infos du tournoi + contacts & sécurité + dossier + publication.
      majInfosTournoi();
      majContactsSecurite();
      majInvitation();
      majPerfsMotCleClub();
      majSurPlace();
      majReponse();
      majApercuInvitation();
      majPublication();
      majDossier();
      majPublicationPlanning(); // verrou « planning visible par les clubs »
      // 5) Partenaires (sponsors de la page publique) : réglages + fiches + fiche de visibilité.
      if (typeof majSponsors === 'function') majSponsors();
      if (typeof majAutorisation === 'function') majAutorisation(); // feuille de report FFR (session 7)

      // 5) Tableau de bord + horodatage.
      majTableauBord();
      majHeureAdmin();
    } catch (erreur) {
      zoneReglages.innerHTML =
        '<div class="message erreur">Impossible de charger les réglages.<br>' +
        'Détail : ' + erreur.message + '</div>';
    }
  } else {
    zoneReglages.innerHTML =
      '<div class="message">🔒 Connecte-toi avec la clé admin pour accéder aux réglages du tournoi.</div>';
  }

  // Barre de connexion : boutons « Se connecter » / « Changer de clé » (délégué).
  document.getElementById('barre-connexion').addEventListener('click', onClicConnexion);

  // Bouton « Rafraîchir » : recharge scores/planning depuis le backend (utile le jour J).
  document.getElementById('bouton-rafraichir-admin').addEventListener('click', rafraichirAdmin);

  // Fil d'avancement « Où en suis-je ? » : clic/clavier sur une étape → défile jusqu'à sa section
  // (délégué sur le conteneur, valable même après re-rendu du fil).
  const zoneEtat = document.getElementById('etat-avancement');
  zoneEtat.addEventListener('click', onClicEtatAvancement);
  zoneEtat.addEventListener('keydown', onClicEtatAvancement);

  // On branche le formulaire d'ajout et les boutons de suppression (équipes).
  document.getElementById('form-equipe').addEventListener('submit', onAjouterEquipe);
  document.getElementById('liste-equipes').addEventListener('click', onClicListe);
  // Réglage « Identifier mes équipes dans Perfs » (même carte : la valeur est un bout de nom d'équipe).
  document.getElementById('bouton-enregistrer-perfs-club')
    .addEventListener('click', onEnregistrerPerfsMotCle);
  // ⚠️ Garde OBLIGATOIRE, comme les 10 autres formulaires de cette page. Un formulaire à champ
  // unique se soumet TOUT SEUL sur la touche Entrée, même sans bouton `submit` : sans cette
  // ligne, la page se rechargerait et la saisie serait perdue SANS message — au pire, un champ
  // vidé pour désactiver Perfs réafficherait l'ancienne valeur, laissant croire à une
  // désactivation qui n'a pas eu lieu. Ici, Entrée enregistre, comme le bouton.
  document.getElementById('form-perfs-club').addEventListener('submit', function (e) {
    e.preventDefault();
    onEnregistrerPerfsMotCle();
  });

  // Réglages (horaires + catégories) : écouteurs "délégués" posés sur le DOCUMENT
  // (et non sur #reglages) : le mode écrans DÉPLACE zone-horaires/zone-categories
  // hors de #reglages, et les événements doivent continuer à être captés. Chaque
  // gestionnaire filtre par id/classe/nom → aucun risque pour les autres formulaires.
  document.addEventListener('submit', onReglagesSubmit);
  document.addEventListener('click', onReglagesClick);
  document.addEventListener('change', onReglagesChange);
  document.addEventListener('input', onReglagesInput); // vérif. terrains manuels en direct

  // Zone terrains : écouteurs délégués (recalcul de capacité en direct + boutons).
  const zoneTerrains = document.getElementById('zone-terrains');
  zoneTerrains.addEventListener('input', onZoneTerrainsInput);
  zoneTerrains.addEventListener('change', onZoneTerrainsChange);
  zoneTerrains.addEventListener('click', onZoneTerrainsClick);

  // Bouton de génération des poules et du planning.
  document.getElementById('bouton-generer').addEventListener('click', onGenerer);

  // Bouton « Recalculer les horaires » (régénération non destructive, garde les scores).
  document.getElementById('bouton-recalculer-horaires').addEventListener('click', onRecalculerHoraires);

  // Modification manuelle des poules du matin : bouton d'entrée + clics dans l'éditeur (délégués).
  document.getElementById('bouton-modifier-poules').addEventListener('click', onModifierPoules);
  document.getElementById('edition-poules').addEventListener('click', onClicEditionPoules);

  // Clic sur une piste d'arbitrage (délégué, car le contenu est régénéré).
  document.getElementById('arbitrages').addEventListener('click', onClicArbitrage);

  // Bouton de génération de la phase après-midi (classement croisé).
  document.getElementById('bouton-apresmidi').addEventListener('click', onGenererApresMidi);
  // Bouton du brassage du dimanche (Super Challenge Phase 3) — bloc révélé par majDimancheScf().
  document.getElementById('bouton-dimanche-scf').addEventListener('click', onGenererDimancheScf);

  // Carte « Dossier » : le bouton d'aperçu est RECONSTRUIT à chaque majApercuDossier() (la liste
  // des clubs change) — écouteur DÉLÉGUÉ sur la carte, jamais sur le bouton lui-même.
  document.getElementById('bloc-dossier').addEventListener('click', onClicApercuDossier);

  // Verrou « planning visible par les clubs » : bouton reconstruit à chaque état → délégué.
  document.getElementById('publication-planning').addEventListener('click', onPublierPlanning);

  // Bouton publier / masquer le tournoi.
  document.getElementById('bouton-publier').addEventListener('click', onPublier);

  // Accès à la page publique : deux boutons STATIQUES (jamais reconstruits) → écouteurs directs,
  // comme le bouton ci-dessus. ⛔ Ni l'un ni l'autre ne publie, ne masque, ni n'écrit sur le serveur.
  document.getElementById('bouton-copier-adresse-publique').addEventListener('click', onCopierAdressePublique);
  document.getElementById('bouton-ouvrir-page-publique').addEventListener('click', onOuvrirPagePublique);

  // Bouton de réinitialisation complète du tournoi (zone de danger).
  document.getElementById('bouton-reinitialiser').addEventListener('click', onReinitialiser);

  // Carte « Date & conformité FFR » (date + zone + contrôle FFR) : formulaire dédié, bouton dédié.
  document.getElementById('form-cadre-tournoi').addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('bouton-enregistrer-cadre').addEventListener('click', onEnregistrerCadre);
  // « Trouver une date compatible » : ouvre le panneau, lance la recherche, applique un jour cliqué.
  document.getElementById('bouton-trouver-date').addEventListener('click', onToggleTrouverDate);
  document.getElementById('bouton-chercher-dates').addEventListener('click', onChercherDatesCompatibles);
  document.getElementById('finder-resultats').addEventListener('click', onClicResultatDate);

  // Les infos du tournoi se sauvegardent via leur bouton « Enregistrer les infos »
  // (onEnregistrerInfos) — et aussi lors de la publication (onPublier), par sécurité.
  // On empêche juste la soumission du formulaire (touche Entrée) qui rechargerait la page.
  document.getElementById('form-infos-tournoi').addEventListener('submit', function (e) { e.preventDefault(); });
  // Bouton dédié : enregistre les infos (nom/date/lieu/description + affiche) à tout moment,
  // indépendamment de la publication.
  document.getElementById('bouton-enregistrer-infos').addEventListener('click', onEnregistrerInfos);
  // Zone d'affiche : sélecteur de fichier + glisser-déposer, aperçu immédiat (helper commun).
  brancherZoneImage({
    champFichier: '#form-infos-tournoi [name="tournoi_affiche"]',
    zoneDepot: 'zone-depot-affiche',
    traiter: traiterFichierAffiche
  });
  // Bouton « Retirer l'affiche » (annule un choix non enregistré, ou supprime l'affiche enregistrée).
  document.getElementById('bouton-retirer-affiche').addEventListener('click', onRetirerAffiche);

  // Contacts & sécurité : enregistrement via son bouton dédié + champs conditionnels
  // (précisions du poste de secours, référent sécurité distinct) pilotés par les cases.
  document.getElementById('form-contacts-securite').addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('form-contacts-securite').addEventListener('change', onContactsChange);
  document.getElementById('bouton-enregistrer-contacts').addEventListener('click', onEnregistrerContacts);

  // Dossier d'invitation — carte « Modalités d'inscription » : bouton dédié + champs
  // du tarif révélés par la case à cocher.
  document.getElementById('form-modalites').addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('form-modalites').addEventListener('change', onModalitesChange);
  document.getElementById('bouton-enregistrer-modalites').addEventListener('click', onEnregistrerModalites);

  // Carte « Parking & accès » : texte + photo (même mécanisme que l'affiche du tournoi :
  // clic OU glisser-déposer, aperçu immédiat, upload Drive à l'enregistrement).
  document.getElementById('form-parking').addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('bouton-enregistrer-parking').addEventListener('click', onEnregistrerParking);
  // Zone photo parking : même mécanique que l'affiche (helper commun).
  brancherZoneImage({
    champFichier: '#form-parking [name="parking_photo"]',
    zoneDepot: 'zone-depot-parking',
    traiter: traiterFichierParking
  });
  document.getElementById('bouton-retirer-parking').addEventListener('click', onRetirerPhotoParking);

  // Carte « Encadrement & assurance » : bouton dédié.
  document.getElementById('form-encadrement').addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('bouton-enregistrer-encadrement').addEventListener('click', onEnregistrerEncadrement);

  // Phase 1 — carte « Sur place » (3 cases à cocher) : bouton dédié.
  document.getElementById('form-surplace').addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('bouton-enregistrer-surplace').addEventListener('click', onEnregistrerSurPlace);

  // Phase 1 — carte « Réponse à l'invitation » : bouton dédié + validation « au moins un
  // des deux » (tél / email) au blur des champs de contact.
  document.getElementById('form-reponse').addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('bouton-enregistrer-reponse').addEventListener('click', onEnregistrerReponse);
  document.getElementById('form-reponse').addEventListener('blur', onReponseBlur, true);

  // Phase 1 — aperçu de l'email d'invitation : mise à jour EN DIRECT quand on modifie les
  // cartes « Sur place » / « Réponse » (comme l'aperçu des Infos), + bouton d'envoi groupé.
  document.getElementById('form-surplace').addEventListener('change', majApercuInvitation);
  document.getElementById('form-reponse').addEventListener('input', majApercuInvitation);
  document.getElementById('form-reponse').addEventListener('change', majApercuInvitation);
  document.getElementById('apercu-invitation-intro').addEventListener('input', majApercuInvitation);
  document.getElementById('bouton-regenerer-invitation').addEventListener('click', onRegenererInvitation);
  document.getElementById('bouton-envoyer-invitations').addEventListener('click', onEnvoyerInvitationsGroupe);

  // Clubs invités : ajout via le formulaire, statut/suppression/actions délégués sur la liste.
  document.getElementById('form-club-invite').addEventListener('submit', onAjouterClubInvite);
  document.getElementById('liste-clubs-invites').addEventListener('change', onChangerStatutClub);
  document.getElementById('liste-clubs-invites').addEventListener('click', onClicClubsInvites);

  // Champ date : ouvre le calendrier dès qu'on clique n'importe où sur la barre
  // (par défaut, seul le clic sur la petite icône l'ouvre). showPicker() peut ne pas
  // exister sur de vieux navigateurs → on ignore l'erreur, l'icône reste utilisable.
  document.querySelector('#form-cadre-tournoi [name="tournoi_date"]')
    .addEventListener('click', function () {
      try { this.showPicker(); } catch (e) { /* navigateur non compatible : comportement normal */ }
    });

  // Conformité FFR : re-vérifie dès que la date OU la zone de vacances change (carte cadre).
  document.getElementById('form-cadre-tournoi').addEventListener('change', function (e) {
    const n = e.target && e.target.name;
    if ((n === 'tournoi_date' || n === 'zone_vacances') && typeof majConformiteFFR === 'function') {
      majConformiteFFR();
    }
  });
  // « Forme FFR attendue » des cartes : rafraîchit l'avertissement d'effectif à la saisie.
  document.getElementById('zone-categories').addEventListener('input', function (e) {
    const n = e.target && e.target.name;
    if ((n === 'effectif_min' || n === 'effectif_max') && typeof majFormesCategories === 'function') {
      majFormesCategories();
    }
  });

  // Assistant à cartes (surcouche de présentation) : une fois tout rendu et branché, on
  // laisse assistant.js réorganiser la page en cartes (ou non, selon la préférence mémorisée).
  if (typeof initAssistant === 'function') initAssistant();

  // Clubs invités : la liste contient des emails → elle ne se charge qu'une fois connecté
  // (clé admin déjà obtenue en tête de fonction). Sans clé : rien à charger.
  if (connecte) chargerClubsInvites();
}

/* Les INFOS DU TOURNOI (+ affiche + aperçu publication), CONTACTS & SÉCURITÉ, « Sur place »,
   « Réponse », l'état du DOSSIER CLUB et la PUBLICATION sont désormais dans
   admin-infos-publication.js (avec les helpers partagés urlAffiche/redimensionnerImage/
   brancherZoneImage/normaliserTelephone/estPublie). Chargé après admin.js dans admin.html. */

/* Le TABLEAU DE BORD, le fil « Où en suis-je ? » et les SIGNATURES (miroir backend) sont
   désormais dans admin-tableau-bord.js — chargé après admin.js dans admin.html. */

/**
 * Recharge tout l'état du tournoi depuis le backend (getAll) et ré-affiche les vues « live »
 * TOUJOURS communes : planning, préparation de l'après-midi, tableau de bord. Selon les options,
 * ré-affiche AUSSI les zones qui ont pu changer selon l'action déclencheuse.
 *
 * Point de passage UNIQUE : avant, ce bloc « recharger getAll + réassigner l'état + re-rendre »
 * était recopié à l'identique dans chaque handler (rafraîchir / générer / recalculer / après-midi
 * / réinitialiser / éditer les poules). Un seul endroit à faire évoluer désormais.
 *
 * @param {Object} [opt]
 * @param {boolean} [opt.reglages]    ré-injecter les formulaires de réglages (horaires + catégories)
 * @param {boolean} [opt.selectCats]  re-remplir la liste déroulante des catégories (ajout d'équipe)
 * @param {boolean} [opt.terrains]    ré-injecter la zone terrains physiques / répartition
 * @param {boolean} [opt.equipes]     ré-afficher la liste des équipes
 * @param {boolean} [opt.infos]       ré-afficher les infos du tournoi (nom/date/affiche)
 * @param {boolean} [opt.publication] ré-afficher l'état de publication
 * @param {boolean} [opt.heure]       mettre à jour l'horodatage « Mis à jour à … »
 */
async function rechargerEtRendre(opt) {
  opt = opt || {};
  const data = await apiGet('getAll'); // équipes / poules / matchs (config = vue live, ignorée ici)
  equipesCourantes = data.equipes;
  matchsCourants = data.matchs || [];

  // La config COMPLÈTE vient de getConfigAdmin (clé admin), JAMAIS de la vue live de getAll (qui
  // écraserait les contacts). On ne la recharge que si un rendu qui en dépend est demandé — sinon
  // on garde la configCourante déjà chargée (ex. rafraîchissement des seuls scores).
  if (opt.reglages || opt.selectCats || opt.terrains || opt.infos || opt.publication) {
    configCourante = await lireConfigAdmin();
  }

  if (opt.reglages)   injecterReglages(configCourante.global, configCourante.categories);
  if (opt.terrains)   injecterTerrains();
  if (opt.selectCats) remplirSelectCategories(configCourante.categories);
  if (opt.equipes)    afficherEquipes(data.equipes);

  afficherPlanning(data.poules, data.matchs);
  majApresMidi();
  majFeuilleJour();
  majPublicationPlanning(); // le verrou « visible par les clubs » suit chaque génération

  if (opt.infos)       { majInfosTournoi(); majContactsSecurite(); majInvitation(); majPerfsMotCleClub(); }
  if (opt.publication) majPublication();
  majDossier(); // la config vient d'être rechargée : l'état du dossier suit
  majTableauBord();
  if (opt.heure)       majHeureAdmin();
}

/**
 * Rafraîchit les données du tournoi (scores saisis sur les téléphones, etc.) et met à jour
 * les vues « live » : tableau de bord, planning, équipes, état de préparation de l'après-midi.
 * On NE re-rend PAS les formulaires de réglages ni le formulaire d'infos, pour ne pas écraser
 * une saisie en cours (ces réglages ne changent pas depuis un autre appareil pendant la journée).
 */
async function rafraichirAdmin() {
  const bouton = document.getElementById('bouton-rafraichir-admin');
  const texte = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = '⏳ …';
  try {
    await rechargerEtRendre({ equipes: true, publication: true, heure: true });
  } catch (err) {
    // On garde l'affichage actuel en cas d'erreur réseau.
  } finally {
    bouton.disabled = false;
    bouton.textContent = texte;
  }
}

/** Affiche l'heure de la dernière mise à jour des données. */
function majHeureAdmin() {
  const el = document.getElementById('maj-admin');
  if (el) el.textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR');
}

/* --------------------------------------------------------------------------
   BARRE DE CONNEXION (repère visuel de la clé admin)
   -------------------------------------------------------------------------- */

/** Affiche l'état de connexion (clé admin active ou non) + le bon bouton. */
function majBarreConnexion(connecte) {
  const barre = document.getElementById('barre-connexion');
  if (!barre) return;
  barre.hidden = false;
  if (connecte) {
    barre.className = 'barre-connexion connecte';
    barre.innerHTML =
      '<span>' + svgIcone('verrou_ouvert') + 'Connecté à l\'administration</span>' +
      '<span class="barre-actions">' +
        '<button type="button" class="bouton-lien" id="bouton-changer-cle">Changer de clé</button>' +
        '<button type="button" class="bouton-lien" id="bouton-verrouiller">' + svgIcone('verrou') + 'Verrouiller</button>' +
      '</span>';
  } else {
    barre.className = 'barre-connexion deconnecte';
    barre.innerHTML =
      '<span>' + svgIcone('verrou') + 'Non connecté — les enregistrements seront refusés</span>' +
      '<button type="button" class="bouton" id="bouton-se-connecter">Se connecter</button>';
  }
}

/** Clic dans la barre : « Se connecter » (si déconnecté) ou « Changer de clé ». */
async function onClicConnexion(evenement) {
  // Changer de clé : par sécurité (page laissée ouverte), on exige d'abord la clé
  // ACTUELLE, PUIS on demande la nouvelle (validée côté serveur).
  if (evenement.target.closest('#bouton-changer-cle')) {
    const actuelle = await dialogDemander(
      'Sécurité : entre d\'abord la clé ACTUELLE pour pouvoir la changer :', '', { ok: 'Continuer' });
    if (actuelle == null) return; // annulé
    if (actuelle.trim() !== lireCleLocale('admin')) {
      await dialogAlerter('Clé actuelle incorrecte. Changement refusé.');
      return;
    }
    await demanderCleValide('admin', 'Clé actuelle confirmée.\n\nEntre la NOUVELLE clé :');
    majBarreConnexion(true); // on n'arrive ici que si on était déjà connecté
    return;
  }
  // Verrouiller : efface la clé mémorisée → la page repasse en « Non connecté »
  // et toute écriture redemandera la clé (utile si l'ordinateur est laissé ouvert).
  if (evenement.target.closest('#bouton-verrouiller')) {
    definirCleLocale('admin', '');
    majBarreConnexion(false);
    return;
  }
  // Se connecter : demande la clé en boucle jusqu'à la bonne (ou annulation).
  if (evenement.target.closest('#bouton-se-connecter')) {
    const ok = await connexion('admin', "à l'administration");
    majBarreConnexion(ok);
    // Connexion réussie depuis l'état verrouillé (aucune config chargée) : on recharge la page
    // pour charger la config admin et rendre les réglages. initAdmin retrouvera la clé en session.
    if (ok) location.reload();
  }
}

/* --------------------------------------------------------------------------
   RÉINITIALISATION (remise à zéro complète du tournoi)
   -------------------------------------------------------------------------- */

/**
 * Réinitialise entièrement le tournoi (catégories, équipes, poules, matchs, infos)
 * après une double confirmation. Remet aussi les horaires de la journée à zéro et efface les
 * données de la demande d'autorisation PROPRES À L'ÉDITION (D-043) ; conserve l'historique de
 * saison et les informations permanentes du club. Recharge toute la page ensuite.
 */
/**
 * ⭐ M1-B2 / B2-0.4 — Recharge la page. Une ligne, isolée pour UNE raison : la rendre
 * substituable par le garde-fou de `tests/`, qui n'a pas de navigateur.
 * ⛔ Ce n'est pas une couche d'abstraction : c'est le strict nécessaire pour que le filet de
 * secours du reset soit ÉPROUVÉ plutôt que supposé.
 */
function rechargerLaPage() {
  if (typeof location !== 'undefined' && location && typeof location.reload === 'function') {
    location.reload();
  }
}

async function onReinitialiser() {
  const message = document.getElementById('message-reinitialisation');
  const bouton = document.getElementById('bouton-reinitialiser');

  // Double confirmation : l'action est irréversible.
  // ⚠️ Le texte ANNONCE ce qui part. Depuis M1-B (D-043), la réinitialisation efface aussi les
  // données de la demande d'autorisation propres à l'édition : les taire rendrait la perte
  // invisible. L'ancienne phrase « Seul l'historique de saison est conservé » a été retirée : elle
  // était fausse (le carnet des clubs et les partenaires survivent, comme les 10 champs permanents
  // du club). ⛔ On n'annonce donc PAS une liste exhaustive des conservations — d'où « notamment ».
  // ⚠️ La ligne « clubs invités » suit reinitialiserPhase2Clubs À LA LETTRE. Depuis M1-B2 / B2-0,
  // sur les 17 colonnes de ClubsInvites, 12 sont remises à zéro (tout l'ENGAGEMENT : statut,
  // categories_engagees, dossier_envoye, invitation_envoyee, club_token, date_reponse,
  // nb_equipes_par_categorie, nb_joueurs_total, alerte_ecart, detail_effectifs,
  // nb_educateurs_total, selection_enregistree) et 5 sont conservées (le CONTACT).
  // ⚠️ Ce commentaire annonçait « 8 remises à zéro, 9 conservées » et disait que `statut`,
  // `detail_effectifs` et `nb_educateurs_total` SURVIVENT : vrai jusqu'à B2-0, faux depuis.
  // ⭐ Le texte ci-dessous a suivi : il annonce désormais que la RÉPONSE du club est effacée —
  // taire une perte la rendrait invisible, c'est la même règle que pour D-043.
  if (!await dialogConfirmer('Réinitialiser le tournoi ?\n\n' +
               'CE QUI EST SUPPRIMÉ — des données de CETTE ÉDITION, notamment :\n' +
               '• les catégories, les équipes, les poules, les matchs (planning et scores) ;\n' +
               '• les infos du tournoi (affiche comprise) et les horaires de la journée ;\n' +
               '• côté clubs invités : leur RÉPONSE à cette édition (accepté / décliné), ce ' +
               'qu\'ils ont engagé (catégories, équipes, joueurs, éducateurs), les marques ' +
               'd\'envoi et de suivi, les alertes, et leurs liens d\'accès ;\n' +
               '• dans la demande d\'autorisation : médecin, secours, arbitrage, terrain et ' +
               'vestiaires utilisés, hébergement, repas, goûters, récompenses…\n\n' +
               'CE QUI EST CONSERVÉ, notamment :\n' +
               '• les informations PERMANENTES de votre club dans la demande d\'autorisation ' +
               '(nom et code du club, label, président, représentant) ;\n' +
               '• l\'historique de saison (page Perfs) ;\n' +
               '• le carnet d\'adresses des clubs invités — noms, contacts, emails — et vos ' +
               'partenaires. Les clubs restent dans la liste : ils redeviennent invitables.',
               { ok: 'Continuer', danger: true })) return;
  if (!await dialogConfirmer('Confirmer la remise à zéro ? Cette action est IRRÉVERSIBLE.',
               { ok: 'Oui, tout effacer', danger: true })) return;

  const texteBouton = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Réinitialisation…';
  afficherMessage(message, 'Réinitialisation en cours…', 'ok');

  try {
    const res = await ecrireAdmin('reinitialiserTournoi', {});

    // ⭐ M1-B2 / B2-0 — LES CLUBS INVITÉS D'ABORD, et EN OUBLIANT AVANT DE RELIRE.
    //
    // ① `rechargerEtRendre` s'appuie sur `getAll`, qui ne contient PAS les clubs invités (ils
    //    portent des emails : leur seule lecture est `listerClubsInvites`, protégée par la clé
    //    admin). Sans relecture, `clubsInvitesCourants` garderait l'engagement de l'édition
    //    EFFACÉE : cartes « Accepté », anciens effectifs, anciens liserés — et surtout l'export
    //    PDF de la demande d'autorisation, qui lit cette même liste EN MÉMOIRE, partirait à la
    //    Ligue avec les clubs et les effectifs de l'an dernier.
    // ② L'oubli vient AVANT la relecture, et c'est le point de sûreté : `chargerClubsInvites`
    //    ABSORBE ses erreurs (à raison — voir sa doc). Sans cet oubli, une coupure réseau à cet
    //    instant précis laisserait l'ancienne liste intacte en mémoire ALORS QUE le serveur a
    //    déjà tout effacé — exactement l'état incohérent que ce lot supprime. ⭐ Vider d'abord
    //    rend le pire cas SÛR : on affiche moins, jamais du faux. Le serveur a raison, pas nous.
    // ③ Le tout vient AVANT `rechargerEtRendre`, qui recalcule ensuite `majDossier` et
    //    `majTableauBord` : ces deux-là lisent cette liste, une relecture après arriverait trop tard.
    // ⛔ AUCUNE règle du backend n'est recopiée ici : on OUBLIE, puis on RELIT le serveur.
    //
    // ⭐ B2-0.4 — L'OUBLI DE CE QUI EST DANGEREUX, PUIS UN FILET DE SECOURS.
    //
    // ⚠️ Constaté EN RÉEL le 2026-08-25 : l'écran « Demande d'autorisation » montrait encore le
    // tournoi précédent (3 clubs, 12 équipes, 117 participants, 38 éducateurs) sur un classeur
    // pourtant vidé — parce que `majAutorisation` n'est appelée qu'au chargement de la page.
    // ⛔ C'est le document destiné à la LIGUE : il ne doit jamais afficher une édition close.
    //
    // ⛔ CE QU'ON NE FAIT SURTOUT PAS : vider `configCourante` puis repeindre les formulaires
    //    avec. Ce serait ouvrir un trou plus grave que celui qu'on ferme — le formulaire
    //    « Réponse » afficherait `email_expediteur` VIDE, alors que le reset le CONSERVE. Il
    //    suffirait ensuite que l'organisateur saisisse un contact pour que la validation passe
    //    et que l'enregistrement écrase ce réglage permanent par une chaîne vide.
    //    🔬 Vérifié de bout en bout : `onEnregistrerReponse` envoie `email_expediteur` tel quel,
    //    `enregistrerReponseInvitation` ne contrôle son format QUE s'il est non vide, et
    //    `ecrireChampsConfig` écrit les valeurs vides. La perte serait donc réelle et silencieuse.
    clubsInvitesCourants = [];
    if (typeof invaliderAutorisationAffichee === 'function') invaliderAutorisationAffichee();
    if (typeof invaliderConformiteFFRAffichee === 'function') invaliderConformiteFFRAffichee();

    const clubsRelus = (typeof chargerClubsInvites === 'function') && await chargerClubsInvites();

    // ⭐ LE FILET DE SECOURS, et c'est la garantie de fond de ce lot.
    //
    // `rechargerEtRendre` commence par `apiGet('getAll')` puis `lireConfigAdmin()`. Une coupure
    // réseau à cet instant laisse une page ENTIÈRE peinte avec l'édition que le serveur vient
    // d'effacer : catégories, équipes, poules, planning, infos du tournoi, dossier, tableau de
    // bord, formes FFR des cartes. ⛔ Aucun rattrapage partiel ne peut couvrir tout cela.
    //
    // ⭐ Alors on ne rattrape pas : ON RECHARGE LA PAGE. Le navigateur repart du serveur, et
    //    `initAdmin` affiche soit l'état réel, soit sa propre erreur — jamais l'ancienne édition.
    // ⛔ PAS DE BOUCLE POSSIBLE : ce chemin ne s'atteint que par un clic sur « Réinitialiser » ;
    //    une page rechargée ne réinitialise rien toute seule.
    // ⭐ Et l'on SORT immédiatement : ⛔ aucun rendu n'est tenté depuis une config vide.
    try {
      await rechargerEtRendre({ reglages: true, terrains: true, selectCats: true,
                                equipes: true, infos: true, publication: true });
    } catch (erreurRendu) {
      rechargerLaPage();
      return;
    }

    // ── À PARTIR D'ICI, LA RELECTURE A RÉUSSI : `configCourante` est celle du serveur. ──
    //
    // ⚠️ LE PIÈGE À CONNAÎTRE : `rechargerEtRendre` ne ré-affiche qu'un SOUS-ENSEMBLE de ce que
    // `initAdmin` construit au chargement. Le delta a été établi FONCTION PAR FONCTION — il en
    // compte DIX, dont CINQ portent des données d'édition et sont donc rappelées ici :
    //   · majAutorisation      → la feuille FFR — celle prise en défaut en réel ;
    //   · majSurPlace          → buvette / sandwicherie / boutique (CHAMPS_SURPLACE, effacés) ;
    //   · majReponse           → date limite et contact de réponse (effacés) ;
    //   · majApercuInvitation  → l'aperçu de l'email, construit depuis la config d'invitation ;
    //   · majConformiteFFR     → le verdict de conformité, calculé sur la date et les catégories.
    // ⛔ Les CINQ autres n'ont rien à voir avec l'édition : `chargerClubsInvites` (déjà relue plus
    //    haut), `injecterIcones` (décoration), `majBarreConnexion` (état de connexion),
    //    `majFormesCategories` (rappelée par `majConformiteFFR`, et ses cartes viennent d'être
    //    reconstruites) et `majSponsors` — les partenaires SURVIVENT délibérément au reset.
    // ⛔ Aucune règle du backend n'est recopiée ici : on relit, on repeint.
    let ecranComplet = true;
    try {
      if (typeof majAutorisation === 'function') await majAutorisation();
      if (typeof majSurPlace === 'function') majSurPlace();
      if (typeof majReponse === 'function') majReponse();
      if (typeof majApercuInvitation === 'function') majApercuInvitation();
      if (typeof majConformiteFFR === 'function') await majConformiteFFR();
    } catch (erreurEcrans) {
      ecranComplet = false;
    }
    // Après le rechargement (comme avant le refactor) : en cas d'erreur réseau,
    // l'affichage — pistes d'arbitrage comprises — reste intact.
    document.getElementById('arbitrages').innerHTML = '';

    const nbC = (res && res.nb_categories != null) ? res.nb_categories : '?';
    const nbE = (res && res.nb_equipes != null) ? res.nb_equipes : '?';
    const nbP = (res && res.nb_poules != null) ? res.nb_poules : '?';
    const nbM = (res && res.nb_matchs != null) ? res.nb_matchs : '?';
    // ⚠️ Si une relecture a échoué, la réinitialisation a bel et bien eu lieu côté serveur : on le
    // dit, et on dit aussi que l'écran, lui, est incomplet — jamais l'inverse.
    const toutRelu = clubsRelus && ecranComplet;
    afficherMessage(message,
      '✅ Tournoi réinitialisé. Supprimés : ' + nbC + ' catégorie(s), ' + nbE +
      ' équipe(s), ' + nbP + ' poule(s), ' + nbM + ' match(s). Tournoi masqué.' +
      (toutRelu ? '' : ' ⚠️ L\'écran n\'a pas pu être entièrement rafraîchi (réseau) : ' +
       'recharge la page pour le voir à jour.'), toutRelu ? 'ok' : 'ko');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteBouton;
  }
}

/**
 * Applique un format d'après-midi DANS L'INTERFACE d'un bloc `.bloc-format` : `data-format` (qui
 * révèle en CSS le champ « qualifiés en Coupe » et le bon récapitulatif), le bouton radio coché,
 * et la mise en avant de la carte. N'écrit RIEN dans le classeur — l'enregistrement reste le
 * travail du bouton « Enregistrer » de la catégorie.
 *
 * Sert aussi de RETOUR EN ARRIÈRE : appelée avec le format précédent, elle décoche le format
 * refusé et remet l'interface exactement dans son état d'avant le clic.
 *
 * La portée est le bloc, jamais la page : chaque catégorie a son propre formulaire, donc son
 * propre groupe de boutons `format_apresmidi`.
 */
function appliquerFormatApresMidi(bloc, cle) {
  bloc.setAttribute('data-format', cle);
  bloc.querySelectorAll('.format-carte').forEach(function (carte) {
    const radio = carte.querySelector('input[name="format_apresmidi"]');
    if (!radio) return;
    radio.checked = (radio.value === cle);
    carte.classList.toggle('est-choisi', radio.value === cle);
  });
}

/**
 * Réagit aux changements dans la zone réglages (case « heure de fin auto »).
 */
function onReglagesChange(evenement) {
  if (evenement.target.id === 'h-heure_fin_auto') {
    const champFin = document.getElementById('h-heure_fin');
    if (champFin) champFin.disabled = evenement.target.checked; // grisé quand auto
  }
  // Pause méridienne échelonnée (global) : révèle « à partir de » + fin de pause, masque la durée.
  if (evenement.target.id === 'h-pause_echelonnee') {
    const bloc = evenement.target.closest('.bloc-pause-dej');
    if (bloc) bloc.setAttribute('data-ech', evenement.target.checked ? 'oui' : 'non');
  }
  // Heure de début saisie/modifiée → pré-remplit l'heure de RDV à début − 1h15. On n'écrase
  // JAMAIS une valeur personnalisée : seul un champ vide, ou déjà rempli par ce pré-remplissage
  // (marqueur data-auto-rdv), suit l'heure de début. Une saisie manuelle retire le marqueur.
  if (evenement.target.id === 'h-heure_debut') {
    const champRdv = document.getElementById('h-heure_rdv');
    if (champRdv && (champRdv.value === '' || champRdv.dataset.autoRdv === '1')) {
      const rdv = heureMoinsMinutes(evenement.target.value, 75);
      if (rdv) { champRdv.value = rdv; champRdv.dataset.autoRdv = '1'; }
    }
  }
  if (evenement.target.id === 'h-heure_rdv') {
    delete evenement.target.dataset.autoRdv; // valeur choisie à la main → on ne l'écrase plus
  }
  // Choix d'un format d'après-midi : on pilote l'affichage conditionnel via data-format
  // (carte sélectionnée mise en avant, champ « qualifiés » et bon récap révélés en CSS).
  //
  // Cas particulier des formats marqués `horsCadreEdr` : le navigateur a DÉJÀ coché le bouton
  // quand cet événement arrive, mais le choix n'est pas encore APPLIQUÉ (data-format porte encore
  // le format précédent, et rien n'est enregistré). On demande donc la confirmation ici — bien
  // avant le bouton « Enregistrer » — et on remet l'ancien format si l'organisateur annule.
  if (evenement.target.name === 'format_apresmidi') {
    const bloc = evenement.target.closest('.bloc-format');
    if (bloc) {
      const precedent = bloc.getAttribute('data-format');
      const choisi = evenement.target.value;
      if (formatHorsCadreEdr(choisi) && choisi !== precedent) {
        dialogConfirmer(CONFIRMATION_HORS_CADRE_EDR, {
          ok: 'Continuer avec Coupe + Plateau', annuler: 'Annuler'
        }).then(function (accepte) {
          appliquerFormatApresMidi(bloc, accepte ? choisi : precedent);
        });
      } else {
        appliquerFormatApresMidi(bloc, choisi);
      }
    }
  }
  // Bascule Auto / Manuel des terrains : on révèle le champ de saisie (Manuel) ou l'info (Auto),
  // et on (re)lance la vérification des conseils en mode Manuel.
  if (evenement.target.name === 'terrains_auto') {
    const bloc = evenement.target.closest('.bloc-terrains');
    if (bloc) {
      bloc.setAttribute('data-terrains', evenement.target.value === 'non' ? 'manuel' : 'auto');
      verifierTerrainsBloc(bloc);
    }
  }
  // Contexte U14 (Lambda / Super Challenge) : on pilote l'affichage via data-contexte posé sur le
  // FORMULAIRE de la catégorie. En SCF, le CSS masque les cartes « format d'après-midi » (sans objet)
  // et révèle le panneau SCF ; en Lambda, l'inverse. Aucune donnée n'est réécrite ici (juste l'UI).
  if (evenement.target.name === 'contexte_tournoi') {
    const form = evenement.target.closest('form.form-categorie');
    if (form) form.setAttribute('data-contexte', evenement.target.value);
  }
  // Choix de la phase Super Challenge : révèle le bon récapitulatif (data-phase sur le panneau SCF).
  if (evenement.target.name === 'scf_phase') {
    const panneau = evenement.target.closest('.bloc-scf');
    if (panneau) panneau.setAttribute('data-phase', evenement.target.value);
  }
  // Nb mi-temps (select) modifié → alerte « hors cadre FFR » en direct (non bloquante).
  if (evenement.target.name === 'format_mi_temps') rafraichirAlerteTempsFFR(evenement.target);
}

/** Rafraîchit l'alerte « hors cadre FFR » des champs de temps de la carte contenant `champ`. */
function rafraichirAlerteTempsFFR(champ) {
  const form = champ.closest && champ.closest('form.form-categorie');
  const cat = form && form.getAttribute('data-cat');
  if (cat && typeof majAlerteTempsCategorie === 'function') majAlerteTempsCategorie(cat);
}

/**
 * Vérifie les terrains saisis à la volée (mode Manuel), au fil de la frappe.
 */
function onReglagesInput(evenement) {
  if (evenement.target.name === 'terrains') {
    verifierTerrainsBloc(evenement.target.closest('.bloc-terrains'));
  }
  // Champs de temps numériques : alerte « hors cadre FFR » en direct (non bloquante).
  if (['duree_mi_temps_min', 'pause_mi_temps_min', 'recup_entre_matchs_min'].indexOf(evenement.target.name) !== -1) {
    rafraichirAlerteTempsFFR(evenement.target);
  }
}

/**
 * Aiguille les envois de formulaire de la zone réglages vers la bonne fonction.
 */
function onReglagesSubmit(evenement) {
  const form = evenement.target;
  if (form.id === 'form-horaires')          return onEnregistrerHoraires(evenement);
  if (form.id === 'form-ajout-categorie')   return onAjouterCategorie(evenement);
  if (form.classList.contains('form-categorie')) return onEnregistrerCategorie(evenement);
}

/**
 * Aiguille les clics de la zone réglages (boutons "Supprimer" de catégorie).
 */
function onReglagesClick(evenement) {
  const bouton = evenement.target.closest('.bouton-suppr-cat');
  if (bouton) { onSupprimerCategorie(bouton); return; }
  // Bouton « Appliquer la norme FFR » d'une CARTE catégorie : on réutilise le flux backend testé
  // (onClicAppliquerFFR). Scopé à .form-categorie pour ne pas doubler le bouton identique de l'écran
  // Conformité, qui a son propre écouteur délégué sur #bloc-conformite-ffr.
  if (evenement.target.closest('.form-categorie') && evenement.target.closest('.ffr-appliquer') &&
      typeof onClicAppliquerFFR === 'function') {
    onClicAppliquerFFR(evenement);
  }
}

/**
 * Recharge la config depuis le backend et re-affiche toute la zone réglages
 * (utilisé après ajout/suppression de catégorie).
 */
async function rechargerReglages() {
  const cfg = await lireConfigAdmin(); // config complète (clé admin), pas la vue publique getConfig
  configCourante = cfg;
  injecterReglages(cfg.global, cfg.categories);
  injecterTerrains();                        // les catégories présentes ont pu changer
  remplirSelectCategories(cfg.categories); // le menu des équipes suit les catégories présentes
  majTableauBord(); // le nombre de catégories a pu changer
  // Conformité FFR : la liste des catégories a pu changer (ajout/suppression) → on RECALCULE pour
  // que dernierResConformite couvre les NOUVELLES catégories. Sans ça, une catégorie fraîchement
  // ajoutée n'a pas de données FFR mémorisées et son bouton « Appliquer la norme FFR » reste caché.
  if (typeof majConformiteFFR === 'function') await majConformiteFFR();
}

/* ────────────────────────────────────────────────────────────────────────────
   MODULES EXTRAITS de ce fichier (chargés APRÈS admin.js dans admin.html, dans
   cet ordre). Tous sortis tels quels du monolithe, sans changement de comportement :
     · admin-invitations.js — invitation email + dossier d'invitation + clubs invités
     · admin-reglages.js    — réglages (horaires + catégories)
     · admin-equipes.js     — CRUD des équipes
     · admin-generation.js  — génération poules/planning, arbitrages, après-midi, poules
     · admin-terrains.js    — terrains physiques & répartition (packing, carte SVG)
     · admin-tableau-bord.js— tableau de bord + « Où en suis-je ? » + signatures (miroir backend)
     · admin-infos-publication.js — infos tournoi + affiche/aperçu, contacts, dossier, publication
   admin.js conserve le NOYAU : constantes catégories/formats, état global partagé, ecrireAdmin,
   estPresente, initAdmin, rechargerEtRendre, rafraichirAdmin, barre de connexion, réinitialisation,
   routeurs d'événements délégués (onReglages*).
   ──────────────────────────────────────────────────────────────────────────── */

/* afficherMessage(), estTermine() et echapper() sont désormais dans commun.js. */

/* On lance tout une fois la page prête. */
document.addEventListener('DOMContentLoaded', initAdmin);
