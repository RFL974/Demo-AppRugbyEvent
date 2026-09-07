/**
 * ============================================================================
 *  ASSISTANT À CARTES — présentation guidée de la page admin (étape 4a)
 * ============================================================================
 *  Objectif : montrer les sections existantes UNE PAR UNE, sous forme de cartes
 *  qui glissent, sans rien réécrire. On DÉPLACE simplement les blocs existants
 *  dans un carrousel (déplacer un nœud DOM conserve ses écouteurs), donc toute
 *  la logique déjà en place (formulaires, boutons, cerveau) continue de marcher.
 *
 *  Une échappatoire « Vue classique » remet les blocs à leur place d'origine :
 *  la page telle qu'elle existait reste accessible en un clic (filet de sécurité).
 *  Le choix (assistant / classique) est mémorisé dans le navigateur.
 *
 *  VERROU « SUIVANT » : pendant la préparation, on ne passe à la carte suivante
 *  que si l'étape en cours est COMPLÈTE (enregistrée / générée / répartie, d'après
 *  le « cerveau » calculerEtatsEtapes d'admin.js) ET sans modification en attente
 *  (formulaire modifié depuis le dernier enregistrement, répartition calculée mais
 *  pas appliquée, édition de poules en cours). Modifier après avoir enregistré
 *  referme le verrou : il faut ré-enregistrer / régénérer / ré-appliquer.
 * ============================================================================
 */

/* Ordre des cartes = ordre logique de préparation (le même que le « cerveau »).
   Chaque carte réutilise un ou plusieurs blocs EXISTANTS (par leur id). */
const ASSISTANT_ETAPES = [
  { id: 'infos',     titre: 'Infos',        icone: '📝', blocs: ['bloc-cadre-tournoi', 'bloc-infos-tournoi'] },
  { id: 'reglages',  titre: 'Réglages',     icone: '⏱️', blocs: ['reglages'] },
  /* « Inviter un club » (Phase 1) puis le Dossier complet (Phase 2) viennent AVANT les Équipes :
     les clubs qui acceptent génèrent leurs équipes automatiquement à l'envoi du dossier final
     (même ordre que la barre latérale desktop). Cartes libres : jamais verrouillées. */
  { id: 'invitation', titre: 'Inviter',     icone: '✉️', blocs: ['bloc-modalites', 'bloc-clubs-invites', 'bloc-apercu-invitation', 'bloc-surplace', 'bloc-reponse'] },
  { id: 'dossier',   titre: 'Dossier',      icone: '📄', blocs: ['bloc-parking', 'bloc-encadrement', 'bloc-contacts-securite', 'bloc-dossier'] },
  { id: 'equipes',   titre: 'Équipes',      icone: '👥', blocs: ['bloc-equipes'] },
  { id: 'terrains',  titre: 'Terrains',     icone: '🗺️', blocs: ['bloc-terrains'] },
  { id: 'poules',    titre: 'Poules',       icone: '🎲', blocs: ['bloc-generation'] },
  { id: 'autorisation', titre: 'Autorisation', icone: '🏛️', blocs: ['bloc-autorisation'] },
  /* 🌐 PUBLICATION — carte DÉDIÉE et `libre` depuis PUB-2 (R-098).
     ⚠️ Elle vivait DANS la carte « Résumé », et ce n'était pas une erreur d'origine : en août
     2026 `bloc-publication` ne portait qu'un état et un bouton, sa place était donc bien dans
     la carte du bilan, celle où l'on arrive quand tout est prêt.
     ⭐ PUB-2 a changé la NATURE de ce bloc sans changer sa place : il porte désormais aussi
     l'ADRESSE de la page publique, « Copier » et « Ouvrir » — qu'il faut pouvoir lire AU TOUT
     DÉBUT (imprimer une affiche, remplir l'email d'invitation). Une adresse n'est pas une
     autorisation (doctrine D-048).
     ⛔ On ne libère PAS « Résumé » pour autant : il garde le tableau de bord, le fil
     d'avancement et surtout `bloc-reinitialisation`, qui ne doit PAS devenir accessible plus
     tôt par effet collatéral. Seul `bloc-publication` en sort.
     ⭐ Placée ici, APRÈS « Autorisation », comme sur grand écran (ecrans.js) : les deux
     parcours racontent la même histoire. Son rang ne change RIEN pour les autres étapes —
     c'est `libre` qui la rend joignable, pas sa position.
     ⛔ Le garde-fou métier n'est pas perdu : il vit sur le BOUTON « Publier »
     (`majVerrouPublier`, admin-infos-publication.js), donc dans TOUS les modes d'affichage. */
  { id: 'publication', titre: 'Publication', icone: '🌐', blocs: ['bloc-publication'], libre: true },
  { id: 'apresmidi', titre: 'Après-midi',   icone: '🏉', blocs: ['bloc-apresmidi'] },
  { id: 'feuillejour', titre: 'Feuille de journée', icone: '📋', blocs: ['bloc-feuille-jour'] },
  /* Partenaires (sponsors de la page publique) : réglages, fiches, fiche de visibilité.
     Juste avant le résumé — on habille la page une fois le tournoi prêt. */
  { id: 'sponsors',  titre: 'Partenaires',  icone: '🤝', blocs: ['bloc-sponsors-reglages', 'bloc-sponsors-liste', 'bloc-sponsors-bilan'] },
  /* ⛔ « Résumé » N'EST PAS `libre`, et ne doit pas le devenir : il porte
     `bloc-reinitialisation` (l'effacement du tournoi). ⚠️ `bloc-publication` en a été retiré
     par PUB-2 — voir la carte « Publication » ci-dessus. */
  { id: 'resume',    titre: 'Résumé',       icone: '📋', blocs: ['tableau-bord', 'etat-avancement', 'bloc-reinitialisation'] }
];

/* ⭐ ORDRE CANONIQUE DES BLOCS DANS <main> — la « Vue classique » restitue CET ordre-là.
 *
 * ⚠️ POURQUOI CETTE LISTE EXISTE, et c'est une leçon à part entière. Cet ordre était jusqu'ici
 * DÉDUIT de `ASSISTANT_ETAPES` (une simple concaténation de leurs `blocs`). Deux conséquences,
 * toutes deux mauvaises :
 *   ① la page longue sortait de l'assistant dans l'ordre du PARCOURS GUIDÉ, pas dans le sien —
 *      `tableau-bord` et `etat-avancement`, qui ouvrent la page dans `admin.html`, se
 *      retrouvaient rejetés À LA FIN, parce qu'ils vivent dans la carte « Résumé » ;
 *   ② et surtout : ⛔ **déplacer un bloc d'une carte à une autre changeait silencieusement
 *      l'ordre de la page longue.** Un découpage d'écrans n'a rien à faire dans la définition
 *      d'un ordre de page — c'est exactement ce qui a rendu PUB-2 risqué à corriger.
 *
 * ⭐ La liste est donc LITTÉRALE et figée, comme `ECRANS_ORDRE_ORIGINE` le fait déjà côté
 * grand écran. Elle reprend l'ordre RÉEL des enfants de `<main>` dans `admin.html`.
 * ⛔ `barre-connexion` n'y figure pas : l'assistant ne le déplace jamais, il reste en tête.
 * ⚠️ Tout bloc AJOUTÉ à `admin.html` doit être ajouté ici à sa place — sinon il finira
 * en tête de page au retour en « Vue classique ». */
const ASSISTANT_ORDRE_ORIGINE = [
  'tableau-bord', 'etat-avancement',
  'bloc-cadre-tournoi', 'bloc-infos-tournoi', 'bloc-contacts-securite',
  'bloc-sponsors-reglages', 'bloc-sponsors-liste', 'bloc-sponsors-bilan',
  'reglages', 'bloc-equipes', 'bloc-terrains', 'bloc-generation', 'bloc-apresmidi',
  'bloc-feuille-jour',
  'bloc-clubs-invites', 'bloc-apercu-invitation', 'bloc-surplace', 'bloc-reponse',
  'bloc-modalites', 'bloc-parking', 'bloc-encadrement', 'bloc-dossier',
  'bloc-autorisation', 'bloc-publication', 'bloc-reinitialisation'
];

const ASSISTANT_CLE_PREF = 'r92_mode_admin'; // 'assistant' (défaut) | 'classique'

let assistantIndex = 0;

/**
 * ⭐ LA PROGRESSION RÉELLEMENT ATTEINTE — ⛔ à ne JAMAIS confondre avec `assistantIndex`.
 *
 * Ces deux repères ont longtemps eu la même valeur, et c'est ce qui a produit le défaut.
 *
 *   · `assistantIndex`   = la carte AFFICHÉE (animation, hauteur, Précédent / Suivant) ;
 *   · `assistantAtteint` = jusqu'où l'organisateur est LÉGITIMEMENT arrivé, c'est-à-dire
 *                          en franchissant les prérequis de chaque étape (c'est LUI que le
 *                          verrou interroge).
 *
 * ⚠️ Jusqu'à PUB-2, `assistantIndex` PROUVAIT la progression : on ne pouvait jamais dépasser
 * une étape bloquée, donc s'y tenir signifiait avoir franchi tout ce qui précède. ⭐ La carte
 * `libre` (R-098) a ouvert une porte latérale et cassé cette preuve — mais `assistantIndex`
 * continuait d'être avancé en y entrant. ⛔ Le carnet de route recevait le tampon du poste 8
 * pour quelqu'un passé par le portillon.
 *
 * 🔬 CONSTATÉ EN RÉEL le 2026-08-26, sur téléphone, site publié (contrôle B5) : un clic sur
 * « 🌐 Publication », depuis un classeur vide, DÉVERROUILLAIT Inviter, Dossier, Équipes,
 * Terrains, Poules et Autorisation — et peignait « ⏱️ Réglages » EN VERT, c'est-à-dire
 * « faite », alors que c'est précisément l'étape qui bloque tout le reste.
 *
 * ⭐ MONOTONE PAR CONTRAT : il n'avance que par `Math.max`, et ⛔ ne recule JAMAIS — revenir
 * en arrière pour relire une carte ne fait pas perdre une progression déjà acquise.
 * ⛔ Il n'est PAS avancé en atterrissant sur une carte `libre` : y entrer ne prouve rien.
 */
let assistantAtteint = 0;

let assistantOrdreOrigine = null; // ids des blocs dans leur ordre DOM d'origine (pour restaurer)
let assistantObserver = null;

/** Point d'entrée : appelé à la fin de initAdmin(). Respecte la préférence mémorisée. */
function initAssistant() {
  // Ordre d'origine des blocs (pour la « vue classique ») : ⭐ l'ordre CANONIQUE de la page,
  // et non plus celui du parcours guidé — voir ASSISTANT_ORDRE_ORIGINE et le pourquoi.
  if (!assistantOrdreOrigine) {
    assistantOrdreOrigine = ASSISTANT_ORDRE_ORIGINE
      .filter(function (id) { return document.getElementById(id); });
  }
  const pref = (function () { try { return localStorage.getItem(ASSISTANT_CLE_PREF); } catch (e) { return null; } })();
  if (pref === 'classique') afficherBoutonReprise();
  // Mode guidé : sur GRAND écran, barre latérale + onglets (ecrans.js) ;
  // sur mobile, l'assistant à cartes (avec son verrou « Suivant »).
  else if (typeof ecransSontAdaptes === 'function' && ecransSontAdaptes()) construireEcrans();
  else construireAssistant();
}

/** Construit le carrousel et y déplace les blocs existants. */
function construireAssistant() {
  const main = document.querySelector('main');
  if (!main || document.getElementById('assistant')) return;
  retirerBoutonReprise();

  const asst = document.createElement('div');
  asst.id = 'assistant';
  asst.innerHTML =
    '<header class="asst-tete">' +
      '<ol class="asst-stepper" id="asst-stepper"></ol>' +
      '<button type="button" class="bouton-lien asst-classique" id="asst-vue-classique">Vue classique ✕</button>' +
    '</header>' +
    '<div class="asst-barre"><span class="asst-barre-jauge" id="asst-barre-jauge"></span></div>' +
    '<div class="asst-viewport"><div class="asst-track" id="asst-track"></div></div>' +
    '<div class="asst-verrou" id="asst-verrou" hidden></div>' +
    '<footer class="asst-pied">' +
      '<button type="button" class="bouton asst-nav asst-prec" id="asst-prec">◀ Précédent</button>' +
      '<span class="asst-compteur" id="asst-compteur"></span>' +
      '<button type="button" class="bouton asst-nav asst-suiv" id="asst-suiv">Suivant ▶</button>' +
    '</footer>';

  const track = asst.querySelector('#asst-track');
  ASSISTANT_ETAPES.forEach(function (et, i) {
    const slide = document.createElement('section');
    slide.className = 'asst-slide';
    slide.setAttribute('data-index', i);
    et.blocs.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) slide.appendChild(el); // DÉPLACE le bloc (écouteurs conservés)
    });
    track.appendChild(slide);
  });
  main.appendChild(asst);

  // Fil d'étapes (cliquable pour sauter directement).
  const stepper = asst.querySelector('#asst-stepper');
  ASSISTANT_ETAPES.forEach(function (et, i) {
    const li = document.createElement('li');
    li.className = 'asst-step';
    li.setAttribute('data-index', i);
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.innerHTML = '<span class="asst-step-num">' + et.icone + '</span>' +
                   '<span class="asst-step-nom">' + echapper(et.titre) + '</span>';
    stepper.appendChild(li);
  });

  // Écouteurs (délégués, robustes au re-rendu).
  stepper.addEventListener('click', onStepperClic);
  stepper.addEventListener('keydown', onStepperClic);
  asst.querySelector('#asst-prec').addEventListener('click', function () { allerA(assistantIndex - 1, -1); });
  asst.querySelector('#asst-suiv').addEventListener('click', function () { allerA(assistantIndex + 1, 1); });
  asst.querySelector('#asst-vue-classique').addEventListener('click', quitterAssistant);

  // Navigation au clavier (flèches ← →), sauf quand on saisit dans un champ.
  document.removeEventListener('keydown', onClavierAssistant);
  document.addEventListener('keydown', onClavierAssistant);

  // Verrou « Suivant » : toute saisie ou clic dans une carte peut changer l'état
  // (champ modifié, répartition calculée, édition de poules ouverte…) → on réévalue
  // juste après (les écouteurs métier d'admin.js s'exécutent d'abord).
  track.addEventListener('input', assistantMajVerrouDiffere);
  track.addEventListener('change', assistantMajVerrouDiffere);
  track.addEventListener('click', assistantMajVerrouDiffere);
  // Photo d'un formulaire jamais vu AVANT la première frappe (référence = état enregistré).
  track.addEventListener('focusin', assistantNoterZoneInconnue);

  // Recalage de hauteur quand le contenu d'une carte change (ajout de catégorie, etc.).
  if (window.ResizeObserver) {
    assistantObserver = new ResizeObserver(function () { ajusterHauteur(); });
    track.querySelectorAll('.asst-slide').forEach(function (s) { assistantObserver.observe(s); });
  }
  window.addEventListener('resize', ajusterHauteur);

  assistantIndex = 0;
  assistantAtteint = 0;
  allerA(0, 0);
}

/** Va à l'étape i (avec direction pour l'animation : -1 arrière, +1 avant, 0 aucune). */
function allerA(i, direction) {
  const track = document.getElementById('asst-track');
  if (!track) return;
  i = Math.max(0, Math.min(ASSISTANT_ETAPES.length - 1, i));

  // VERROU : impossible d'aller AU-DELÀ d'une étape incomplète ou qui a des
  // modifications non enregistrées. Revenir en arrière reste toujours possible,
  // et atterrir SUR l'étape à corriger aussi (pour la finir).
  //
  // ⭐ EXCEPTION `libre` (PUB-2 / R-098) : une carte marquée `libre` est joignable
  // DIRECTEMENT, sans avoir à franchir les étapes bloquantes qui la précèdent. C'est le même
  // mot et la même idée que `libre` dans `ECRANS_DEF` (ecrans.js), pour que les deux parcours
  // se lisent pareil — l'écart entre ces deux fichiers est précisément ce qui a produit R-098.
  // ⚠️ Ce n'est PAS un assouplissement du verrou : on ne fait que se RENDRE sur cette carte.
  // ⛔ Les étapes suivantes gardent tous leurs prérequis (on repartira d'ici en les
  // franchissant normalement), aucune n'est libérée, et leur ordre ne change pas.
  // ⚠️ LE TEST PORTE SUR `assistantAtteint`, ⛔ PAS SUR `assistantIndex` — c'est LE point du
  // correctif. Avec `assistantIndex`, se tenir sur la carte `libre` « Publication » (rang 8)
  // rendait vraie l'inégalité `i > assistantIndex` pour AUCUNE des étapes 1 à 7 : le contrôle
  // était sauté, et six étapes jamais franchies devenaient joignables. Constaté en réel
  // le 2026-08-26 (contrôle B5) — voir le commentaire de `assistantAtteint`.
  if (i > assistantAtteint && !(ASSISTANT_ETAPES[i] || {}).libre) {
    const etats = (typeof calculerEtatsEtapes === 'function') ? calculerEtatsEtapes() : [];
    // ⚠️ LE BALAYAGE PART DE 0, ET NON DE L'ÉTAPE COURANTE — c'est indispensable depuis
    // l'exception `libre` ci-dessus, et l'oublier ouvre un trou réel (constaté en test) :
    // ⭐ jusqu'ici, `assistantIndex` PROUVAIT que tout ce qui précède était franchi, puisqu'on
    // ne pouvait jamais dépasser un blocage. Une carte `libre` casse cette preuve — on peut
    // désormais se tenir sur « Publication » (rang 8) sans avoir rempli les Réglages (rang 1).
    // ⛔ Repartir de là ferait de la carte Publication un TREMPLIN : deux clics suffiraient à
    // atteindre « Résumé », donc `bloc-reinitialisation`, en sautant tous les prérequis.
    // ⭐ `Math.max(s, assistantIndex)` : on ne RECULE jamais l'utilisateur — soit on l'amène à
    // l'étape qu'il doit finir, soit on refuse et on reste sur place (comportement d'origine).
    for (let s = 0; s < i; s++) {
      if (assistantRaisonsEtape(s, etats).length) { i = Math.max(s, assistantIndex); break; }
    }
    if (i === assistantIndex) assistantSecouerVerrou(); // refusé : on attire l'œil sur l'explication
  }
  assistantIndex = i;

  // ⭐ LA PROGRESSION ACQUISE — ⛔ et ce n'est PAS « la carte affichée ».
  // ⭐ MONOTONE : `Math.max` et lui seul. Revenir en arrière relire une carte ne fait jamais
  // perdre une progression déjà acquise (exigence posée par Romain le 2026-08-26).
  if (!(ASSISTANT_ETAPES[i] || {}).libre) {
    // Carte ORDINAIRE : y atterrir PROUVE que tout ce qui précède est franchi — soit
    // l'inégalité ci-dessus l'avait déjà établi, soit le balayage vient de le vérifier.
    assistantAtteint = Math.max(assistantAtteint, i);
  } else if (i > assistantAtteint) {
    // Carte `libre` : on y est entré PAR LE CÔTÉ, cela ne prouve rien — c'est exactement ce
    // que l'ancien code supposait à tort. ⭐ On ne CONSTATE donc que ce qui était de toute
    // façon atteignable : le premier blocage rencontré depuis 0.
    // ⛔ AUCUNE étape ne devient joignable pour autant, et c'est démontrable : cette valeur est
    // précisément celle que le balayage ci-dessus aurait déjà acceptée depuis n'importe quelle
    // autre carte. C'est un CONSTAT de ce qui est ouvert, ⛔ jamais l'octroi d'un droit neuf.
    // ⭐ Sans cette branche, franchir les étapes UNE À UNE jusqu'à Publication ferait perdre
    // sa marque « faite » à l'étape précédente — une régression du parcours ordinaire.
    const etatsAcquis = (typeof calculerEtatsEtapes === 'function') ? calculerEtatsEtapes() : [];
    let acquis = i;
    for (let s = 0; s < i; s++) {
      if (assistantRaisonsEtape(s, etatsAcquis).length) { acquis = s; break; }
    }
    assistantAtteint = Math.max(assistantAtteint, acquis);
  }

  track.style.transform = 'translateX(' + (-i * 100) + '%)';

  // ⭐ B2-0.5 — JUMEAU du crochet de `ecransActiver` (ecrans.js) : on arrive sur la feuille FFR,
  //   on la relit si des écritures l'ont rendue fausse depuis. ⚠️ Le parcours mobile doit faire
  //   EXACTEMENT ce que fait le parcours ordinateur — l'écart entre ces deux fichiers est
  //   précisément ce qui avait produit R-098. Ils se modifient ENSEMBLE.
  if ((ASSISTANT_ETAPES[i] || {}).id === 'autorisation' &&
      typeof majAutorisationSiObsolete === 'function') {
    majAutorisationSiObsolete().catch(function () { /* la feuille garde son message */ });
  }

  // Fil d'étapes : marque l'active + les précédentes comme « faites ».
  // ⚠️ « FAITE » EST UNE AFFIRMATION, PAS UNE POSITION — et elle s'affiche EN VERT
  // (`styles.css`, `.asst-step.est-faite`). ⛔ `k < i` disait « tout ce qui est avant la carte
  // affichée est fait » : vrai tant qu'on ne pouvait y arriver qu'en le faisant, FAUX depuis la
  // carte `libre`. Entrer sur « Publication » peignait alors « Réglages » en vert sans que rien
  // n'ait été rempli — 🔬 constaté en réel le 2026-08-26.
  // ⭐ `Math.min` : dans un parcours ordinaire, `assistantAtteint` vaut exactement `i` sur une
  // carte non `libre`, donc cette ligne se comporte À L'IDENTIQUE de `k < i`. Elle ne diffère
  // que là où l'ancienne mentait.
  const steps = document.querySelectorAll('.asst-step');
  steps.forEach(function (li, k) {
    li.classList.toggle('est-active', k === i);
    li.classList.toggle('est-faite', k < Math.min(i, assistantAtteint));
  });

  // Compteur + boutons Précédent/Suivant.
  const compteur = document.getElementById('asst-compteur');
  if (compteur) compteur.textContent = 'Étape ' + (i + 1) + ' / ' + ASSISTANT_ETAPES.length + ' — ' + ASSISTANT_ETAPES[i].titre;
  const prec = document.getElementById('asst-prec');
  const suiv = document.getElementById('asst-suiv');
  if (prec) prec.style.visibility = (i === 0) ? 'hidden' : 'visible';
  if (suiv) suiv.style.visibility = (i === ASSISTANT_ETAPES.length - 1) ? 'hidden' : 'visible';

  // Barre de progression.
  const jauge = document.getElementById('asst-barre-jauge');
  if (jauge) jauge.style.width = ((i + 1) / ASSISTANT_ETAPES.length * 100) + '%';

  // Centre l'étape active dans le fil (surtout utile sur mobile, où il défile).
  // Calcul manuel de scrollLeft : plus fiable que scrollIntoView sur un conteneur overflow-x.
  const stepper = document.getElementById('asst-stepper');
  const chip = steps[i];
  if (stepper && chip) {
    const decalage = chip.getBoundingClientRect().left - stepper.getBoundingClientRect().left;
    const cible = stepper.scrollLeft + decalage - (stepper.clientWidth - chip.offsetWidth) / 2;
    stepper.scrollLeft = Math.max(0, cible);
  }

  ajusterHauteur();
  assistantMajVerrou(); // le bouton « Suivant » suit l'état de la nouvelle carte
  // Remonte en haut de la carte (confort mobile).
  const asst = document.getElementById('assistant');
  if (asst && direction !== 0 && asst.scrollIntoView) asst.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Ajuste la hauteur du viewport à la carte active (les autres sont hors écran). */
function ajusterHauteur() {
  const vp = document.querySelector('.asst-viewport');
  const slides = document.querySelectorAll('.asst-slide');
  if (!vp || !slides[assistantIndex]) return;
  vp.style.height = slides[assistantIndex].offsetHeight + 'px';
}

/** Flèches ← → pour naviguer entre les cartes (ignorées si on saisit dans un champ). */
function onClavierAssistant(evenement) {
  if (!assistantEstActif()) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  if (evenement.key === 'ArrowRight') { evenement.preventDefault(); allerA(assistantIndex + 1, 1); }
  else if (evenement.key === 'ArrowLeft') { evenement.preventDefault(); allerA(assistantIndex - 1, -1); }
}

function onStepperClic(evenement) {
  if (evenement.type === 'keydown' && evenement.key !== 'Enter' && evenement.key !== ' ') return;
  const li = evenement.target.closest('.asst-step');
  if (!li) return;
  evenement.preventDefault();
  const i = parseInt(li.getAttribute('data-index'), 10);
  allerA(i, i < assistantIndex ? -1 : 1);
}

/* ==========================================================================
   VERROU « SUIVANT » — on ne quitte une carte vers la suivante que si :
     1) le « cerveau » (calculerEtatsEtapes, admin.js) dit que ses étapes sont ✅ fait
        (infos générées / enregistrées / terrains répartis…) ;
     2) rien n'est « en attente » sur la carte : formulaire modifié depuis le dernier
        enregistrement, répartition calculée mais pas appliquée, édition de poules
        ouverte, équipe saisie mais pas ajoutée…
   Modifier APRÈS avoir enregistré referme donc le verrou automatiquement.
   ========================================================================== */

/* Étapes du cerveau qui doivent être ✅ « fait » pour quitter chaque carte.
   (L'après-midi ne bloque pas : elle se génère plus tard, une fois les scores du
   matin saisis — même logique que le verdict « prêt à publier » du cerveau.) */
const ASSISTANT_CLES_CERVEAU = {
  reglages: ['horaires', 'categories'],
  equipes:  ['equipes'],
  terrains: ['terrains'],
  poules:   ['poules']
};

/* « Photos » des formulaires à leur dernier état ENREGISTRÉ (clé = élément DOM).
   Valeurs actuelles ≠ photo → modifications non enregistrées. Les photos sont
   (re)prises au premier affichage d'un formulaire, et quand admin.js signale un
   enregistrement réussi ou un re-rendu depuis l'état enregistré (assistantMarquerPropre). */
const assistantPhotos = new WeakMap();

let assistantVerrouTimer = null;

/** Valeurs actuelles des champs d'une zone, sous forme de texte comparable. */
function assistantSerialiser(zone) {
  const parts = [];
  zone.querySelectorAll('input, select, textarea').forEach(function (c) {
    const type = String(c.type || '').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'file' || type === 'hidden') return;
    const val = (type === 'checkbox' || type === 'radio') ? (c.checked ? '1' : '0') : String(c.value);
    parts.push((c.name || c.id || c.className || '') + '=' + val);
  });
  return parts.join('\n');
}

/** (Re)prend la photo d'une zone : ses valeurs ACTUELLES deviennent la référence
 *  « enregistrée ». Appelée par admin.js après chaque enregistrement réussi. */
function assistantMarquerPropre(zone) {
  if (zone && zone.nodeType === 1) assistantPhotos.set(zone, assistantSerialiser(zone));
  assistantMajVerrou();
}

/** La zone est-elle CONFORME à sa photo (aucune modification en attente) ?
 *  Une zone jamais photographiée est considérée propre : rien n'a encore été comparé. */
function assistantEstPropre(zone) {
  if (!zone || zone.nodeType !== 1) return true;
  const photo = assistantPhotos.get(zone);
  return photo == null || photo === assistantSerialiser(zone);
}

/**
 * Reprend la photo d'une zone SANS recalculer le verrou (contrairement à assistantMarquerPropre).
 * Sert aux rendus DIFFÉRÉS de l'application : quand du code injecte des contrôles dans un
 * formulaire APRÈS que la photo a été prise (ex. le select « forme de jeu » rempli une fois le
 * référentiel FFR chargé), la zone paraîtrait « modifiée » alors que l'utilisateur n'a rien
 * touché — et la barre latérale se verrouillait toute seule. À n'utiliser que sur une zone
 * PROPRE (voir assistantEstPropre) : une vraie saisie en cours doit garder son avertissement.
 */
function assistantRephotographier(zone) {
  if (zone && zone.nodeType === 1) assistantPhotos.set(zone, assistantSerialiser(zone));
}

/** Photo d'une zone jamais vue, prise AVANT la première frappe (délégué focusin). */
function assistantNoterZoneInconnue(evenement) {
  const zone = evenement.target.closest('form') || evenement.target.closest('#zone-terrains');
  if (zone && !assistantPhotos.has(zone)) assistantPhotos.set(zone, assistantSerialiser(zone));
}

/** Zones surveillées : les formulaires des cartes + la zone terrains (champs sans <form>).
 *  #form-equipe et #form-club-invite sont exclus : règle dédiée (formulaires d'ajout
 *  immédiat, pas d'état « enregistré » à comparer). */
function assistantZonesSurveillees() {
  const track = document.getElementById('asst-track');
  if (!track) return [];
  const zones = [];
  track.querySelectorAll('form').forEach(function (f) {
    if (f.id === 'form-equipe' || f.id === 'form-club-invite') return;
    zones.push(f);
  });
  const zt = document.getElementById('zone-terrains');
  if (zt && track.contains(zt)) zones.push(zt);
  return zones;
}

/** Libellé humain d'une zone modifiée : dit QUOI enregistrer pour rouvrir le verrou. */
function assistantNomZone(zone) {
  if (zone.id === 'form-cadre-tournoi')   return 'date/zone modifiées → « Enregistrer la date »';
  if (zone.id === 'form-infos-tournoi')   return 'infos modifiées → « 💾 Enregistrer les infos »';
  if (zone.id === 'form-contacts-securite') return 'contacts & sécurité modifiés → « Enregistrer contacts & sécurité »';
  if (zone.id === 'form-horaires')        return 'horaires modifiés → « Enregistrer les horaires »';
  if (zone.id === 'form-ajout-categorie') return 'nouvelle catégorie saisie → « Ajouter » (ou vide le champ)';
  if (zone.id === 'form-modalites')       return 'modalités d\'inscription modifiées → « Enregistrer les modalités »';
  if (zone.id === 'form-parking')         return 'parking & accès modifiés → « Enregistrer parking & accès »';
  if (zone.id === 'form-encadrement')     return 'encadrement & assurance modifiés → « Enregistrer encadrement & assurance »';
  if (zone.id === 'zone-terrains')        return 'plan des terrains modifié → « Enregistrer les terrains »';
  const cat = zone.getAttribute && zone.getAttribute('data-cat');
  if (cat) return 'catégorie « ' + cat + ' » modifiée → « Enregistrer »';
  return 'modifications non enregistrées';
}

/**
 * Modifications « en attente » dans un CONTENEUR d'étape (raisons humaines, ou
 * liste vide). PARTAGÉE entre l'assistant à cartes (le conteneur est une
 * .asst-slide) et le mode écrans (le conteneur est un .ecran, via ecrans.js).
 * @param {string}    etapeId    id logique de l'étape ('infos', 'equipes', 'terrains', 'poules', …)
 * @param {Element}   conteneur  le bloc DOM qui contient l'étape
 * @param {Element[]} zones      les zones surveillées (formulaires + zone terrains)
 */
function raisonsModifsDans(etapeId, conteneur, zones) {
  const raisons = [];

  // 1) Formulaires dont les valeurs diffèrent de leur photo « enregistrée ».
  zones.forEach(function (zone) {
    if (!conteneur.contains(zone)) return;
    const photo = assistantPhotos.get(zone);
    if (photo == null) { assistantPhotos.set(zone, assistantSerialiser(zone)); return; }
    if (photo !== assistantSerialiser(zone)) raisons.push(assistantNomZone(zone));
  });

  // 2) États « en attente » hors formulaires (variables d'admin.js).
  if (etapeId === 'infos' && typeof afficheDataURI !== 'undefined' && afficheDataURI) {
    raisons.push('affiche choisie → « 💾 Enregistrer les infos » (ou « Retirer l\'affiche »)');
  }
  if (etapeId === 'dossier' && typeof parkingDataURI !== 'undefined' && parkingDataURI) {
    raisons.push('photo du parking choisie → « Enregistrer parking & accès » (ou « Retirer la photo »)');
  }
  if (etapeId === 'equipes') {
    const nom = document.getElementById('champ-nom');
    if (nom && nom.value.trim()) raisons.push('équipe saisie → « Ajouter » (ou vide le champ)');
    // Édition d'une équipe (crayon) : on ne bloque QUE si des valeurs ont réellement changé.
    // Ouvrir le crayon pour regarder, puis passer à autre chose, ne fait rien perdre — verrouiller
    // la barre latérale dans ce cas était un faux positif. Repli prudent (fonction absente) : on
    // conserve l'ancienne détection par présence, pour ne jamais perdre une saisie en cours.
    const editionModifiee = (typeof equipeEditionModifiee === 'function')
      ? equipeEditionModifiee()
      : !!document.querySelector('#liste-equipes .champ-edit-nom');
    if (editionModifiee) {
      raisons.push('modification d\'équipe en cours → « Enregistrer » ou « Annuler »');
    }
  }
  if (etapeId === 'terrains' && typeof repartitionCalculee !== 'undefined' && repartitionCalculee) {
    const resu = document.getElementById('repartition-resultat');
    if (resu && resu.innerHTML.trim()) {
      raisons.push('répartition calculée → « ✅ Appliquer aux catégories » (ou recalcule-la)');
    }
  }
  if (etapeId === 'poules' && typeof editionPoules !== 'undefined' && editionPoules) {
    raisons.push('édition des poules en cours → « 💾 Enregistrer et recalculer » ou « Annuler »');
  }
  return raisons;
}

/** Modifications « en attente » sur la carte i de l'assistant. */
function assistantRaisonsModifs(i) {
  const et = ASSISTANT_ETAPES[i];
  const slide = document.querySelector('.asst-slide[data-index="' + i + '"]');
  if (!et || !slide) return [];
  return raisonsModifsDans(et.id, slide, assistantZonesSurveillees());
}

/** Tout ce qui empêche de QUITTER la carte i vers la suivante (liste vide = libre). */
function assistantRaisonsEtape(i, etatsCerveau) {
  const et = ASSISTANT_ETAPES[i];
  if (!et) return [];
  const raisons = [];
  const cles = ASSISTANT_CLES_CERVEAU[et.id];
  if (cles && typeof calculerEtatsEtapes === 'function') {
    const etats = etatsCerveau || calculerEtatsEtapes();
    cles.forEach(function (cle) {
      const e = etats.find(function (x) { return x.cle === cle; });
      if (e && e.statut !== 'fait') raisons.push(e.titre + ' — ' + e.detail);
    });
  }
  return raisons.concat(assistantRaisonsModifs(i));
}

/** Grise/active « Suivant », affiche l'explication, grise le fil hors de portée.
 *  En mode écrans (barre latérale), ce sont les pastilles d'état qui suivent. */
function assistantMajVerrou() {
  if (typeof ecransEstActif === 'function' && ecransEstActif()) {
    ecransMajPastilles();
    return;
  }
  const suiv = document.getElementById('asst-suiv');
  const zone = document.getElementById('asst-verrou');
  if (!suiv || !zone) return; // assistant non affiché (vue classique)

  const etats = (typeof calculerEtatsEtapes === 'function') ? calculerEtatsEtapes() : [];
  const derniere = ASSISTANT_ETAPES.length - 1;
  // ⭐ Ce qui empêche d'AVANCER d'ici : la première étape non franchie dans [0 … étape courante].
  // ⚠️ Même raison que dans `allerA` : arrivé sur une carte `libre`, on peut se tenir APRÈS une
  // étape qu'on n'a pas faite. Ne regarder que l'étape courante annoncerait « Suivant » libre
  // alors que `allerA` refusera — l'écran mentirait sur ce que le clic va faire.
  // ⛔ Comportement INCHANGÉ dans le parcours normal : quand l'étape courante a été atteinte pas
  // à pas, la seule bloquante possible de cet intervalle est l'étape courante elle-même.
  let bloquante = -1;
  for (let s = 0; s <= assistantIndex && s < derniere; s++) {
    if (assistantRaisonsEtape(s, etats).length) { bloquante = s; break; }
  }
  const raisons = (assistantIndex < derniere && bloquante >= 0)
    ? assistantRaisonsEtape(bloquante, etats) : [];

  suiv.disabled = raisons.length > 0;
  if (raisons.length) {
    zone.hidden = false;
    zone.innerHTML = '🔒 <strong>Pour continuer&nbsp;:</strong> ' +
      raisons.map(echapper).join('<span class="asst-verrou-sep"> · </span>');
  } else {
    zone.hidden = true;
    zone.innerHTML = '';
  }

  // Fil d'étapes : grise ce qui est hors de portée (au-delà de la 1re étape bloquée).
  // ⭐ Balayage depuis 0 et plancher à l'étape courante — exactement la règle de `allerA`,
  // pour que ce qui est grisé soit précisément ce que `allerA` refusera. ⛔ On ne grise jamais
  // l'étape où l'on se tient (`Math.max`), ni une carte `libre` (voir plus bas).
  // ⚠️ Le plancher est `assistantAtteint`, ⛔ PAS `assistantIndex` — même raison qu'en tête de
  // `allerA` : depuis la carte `libre`, `assistantIndex` valait 8 et repoussait la limite du
  // grisage à 8, si bien que six étapes hors de portée s'affichaient comme atteignables.
  // ⭐ L'étape où l'on se tient n'est toujours jamais grisée : sur une carte NON `libre`,
  // `assistantAtteint` vaut au moins `assistantIndex` ; sur une carte `libre`, c'est
  // l'exemption `!libre` ci-dessous qui s'en charge.
  let limite = derniere;
  for (let s = 0; s < derniere; s++) {
    if (assistantRaisonsEtape(s, etats).length) { limite = Math.max(s, assistantAtteint); break; }
  }
  document.querySelectorAll('.asst-step').forEach(function (li, k) {
    // ⭐ Une carte `libre` n'est JAMAIS grisée : elle est joignable directement (voir `allerA`).
    // ⚠️ La griser tout en la laissant cliquable serait pire que le défaut d'origine —
    // l'écran dirait « fermé » sur une porte ouverte, et personne n'essaierait de la pousser.
    const libre = (ASSISTANT_ETAPES[k] || {}).libre;
    li.classList.toggle('est-verrouillee', !libre && k > limite);
  });
}

/** Réévalue le verrou juste APRÈS l'action en cours (laisse admin.js réagir d'abord). */
function assistantMajVerrouDiffere() {
  if (assistantVerrouTimer) return;
  assistantVerrouTimer = setTimeout(function () {
    assistantVerrouTimer = null;
    assistantMajVerrou();
  }, 0);
}

/** Petit tremblement de l'explication quand on insiste sur un passage refusé. */
function assistantSecouerVerrou() {
  const zone = document.getElementById('asst-verrou');
  if (!zone || zone.hidden) return;
  zone.classList.remove('est-secoue');
  void zone.offsetWidth; // relance l'animation CSS
  zone.classList.add('est-secoue');
}

/** Quitte l'assistant : remet les blocs à leur place d'origine + mémorise le choix. */
function quitterAssistant() {
  const asst = document.getElementById('assistant');
  const main = document.querySelector('main');
  if (!asst || !main) return;
  if (assistantObserver) { assistantObserver.disconnect(); assistantObserver = null; }
  window.removeEventListener('resize', ajusterHauteur);

  // Remet chaque bloc dans <main>, dans l'ordre d'origine.
  (assistantOrdreOrigine || []).forEach(function (id) {
    const el = document.getElementById(id);
    if (el) main.appendChild(el);
  });
  asst.remove();

  try { localStorage.setItem(ASSISTANT_CLE_PREF, 'classique'); } catch (e) {}
  afficherBoutonReprise();
}

/** En vue classique : petit bouton flottant pour revenir au mode guidé
 *  (écrans à barre latérale sur grand écran, assistant à cartes sur mobile). */
function afficherBoutonReprise() {
  if (document.getElementById('asst-reprise')) return;
  const main = document.querySelector('main');
  if (!main) return;
  const surEcrans = (typeof ecransSontAdaptes === 'function' && ecransSontAdaptes());
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'asst-reprise';
  btn.className = 'bouton asst-reprise';
  btn.textContent = surEcrans ? '🗂️ Mode écrans' : '🎴 Mode assistant';
  btn.addEventListener('click', function () {
    try { localStorage.setItem(ASSISTANT_CLE_PREF, 'assistant'); } catch (e) {}
    // On re-teste la largeur AU CLIC (la fenêtre a pu être redimensionnée entre-temps).
    if (typeof ecransSontAdaptes === 'function' && ecransSontAdaptes()) construireEcrans();
    else construireAssistant();
  });
  // Placé juste après la barre de connexion (en haut).
  const ref = document.getElementById('barre-connexion');
  if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref.nextSibling);
  else main.insertBefore(btn, main.firstChild);
}

function retirerBoutonReprise() {
  const b = document.getElementById('asst-reprise');
  if (b) b.remove();
}

/** Vrai si un mode guidé est affiché : assistant à cartes OU écrans à barre
 *  latérale (utilisé par admin.js pour la navigation du fil « Où en suis-je ? »). */
function assistantEstActif() {
  return !!document.getElementById('assistant') ||
         (typeof ecransEstActif === 'function' && ecransEstActif());
}

/** Va à l'étape (carte) — ou à l'écran (mode écrans) — qui contient le bloc
 *  d'id donné. Utilisé par le cerveau. */
function assistantAllerVersBloc(blocId) {
  if (typeof ecransEstActif === 'function' && ecransEstActif()) {
    ecransAllerVersBloc(blocId);
    return;
  }
  const el = document.getElementById(blocId);
  const slide = el && el.closest('.asst-slide');
  if (!slide) return;
  const i = parseInt(slide.getAttribute('data-index'), 10);
  if (!isNaN(i)) allerA(i, i < assistantIndex ? -1 : 1);
}

