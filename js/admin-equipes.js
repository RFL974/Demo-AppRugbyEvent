/**
 * ============================================================================
 *  ADMIN — ÉQUIPES (extrait de admin.js)
 * ============================================================================
 *  CRUD des équipes : liste par catégorie, ajout, suppression (unitaire ou par
 *  catégorie), renommage inline. Sorti du monolithe admin.js SANS changement
 *  de comportement.
 *
 *  Dépend de globaux définis ailleurs, accédés au moment de l'appel (handlers
 *  post-chargement) — l'ordre des <script> importe peu ; chargé après admin.js :
 *   - commun.js : echapper, svgIcone, comparerCategorie, afficherMessage…
 *   - admin.js  : configCourante, equipesCourantes, ecrireAdmin, apiGet,
 *                 majTableauBord, dialog*, estPresente…
 * ============================================================================
 */

/* --------------------------------------------------------------------------
   ÉQUIPES
   -------------------------------------------------------------------------- */

/** La liste affichée est la seule sélection de démonstration. Aucun nom ni effectif
 * n'est ajouté : le serveur relit cette même liste avant de préparer les clubs. */
function preparerAjoutEquipesDemo() {
  const equipes = (typeof equipesCourantes !== 'undefined' && equipesCourantes || []).map(function (e) {
    const copie = {};
    ['id_equipe', 'nom_equipe', 'categorie', 'nb_joueurs', 'nb_educateurs'].forEach(function (cle) {
      copie[cle] = String(e[cle] == null ? '' : e[cle]).trim();
    });
    return copie;
  });
  return { equipes: equipes };
}

/**
 * Remplit la liste déroulante avec les catégories PRÉSENTES.
 * Guidage : s'il n'y a AUCUNE catégorie, on ne peut pas saisir d'équipe → on affiche une aide
 * et on désactive le formulaire d'ajout (sinon l'utilisateur reste bloqué sans explication).
 */
function remplirSelectCategories(categories) {
  const select = document.getElementById('champ-categorie');
  // On garde la 1re option "Catégorie…" et on ajoute les catégories présentes.
  select.innerHTML = '<option value="">Catégorie…</option>';
  const presentes = (categories || []).filter(estPresente);
  presentes.forEach(function (cat) {
    const opt = document.createElement('option');
    opt.value = cat.categorie;
    opt.textContent = cat.categorie;
    select.appendChild(opt);
  });

  // Aide + activation/désactivation du formulaire selon qu'il existe au moins une catégorie.
  const aucune = presentes.length === 0;
  const aide = document.getElementById('aide-categories');
  const champNom = document.getElementById('champ-nom');
  if (aide) aide.hidden = !aucune;
  if (select) select.disabled = aucune;
  if (champNom) champNom.disabled = aucune;
  // ⛔ R1 — le bouton d'ajout N'EST PLUS rouvert ici. Ce rendu ne connaît que les catégories ;
  //    il ignorait l'état de fraîcheur de la LISTE et levait donc le verrou posé après une
  //    actualisation ratée — l'ajout redevenait possible sur des données périmées, ce qui est
  //    exactement la porte au doublon qu'on cherche à fermer. La décision passe par le point
  //    unique `majDisponibiliteAjout()`, qui croise les deux conditions.
  majDisponibiliteAjout();
  ['champ-joueurs', 'champ-educateurs'].forEach(function (id) {
    const c = document.getElementById(id);
    if (c) c.disabled = aucune;
  });
}

/** Effectif déclaré lu d'un champ : entier ≥ 0, ou '' si vide/illisible — miroir de
 *  effectifDeclare (backend). « Vide » et « zéro » sont deux réponses différentes : on ne
 *  transforme JAMAIS un champ vide en 0 (ce serait déclarer « aucun joueur »). */
function effectifSaisi(valeur) {
  const s = String(valeur == null ? '' : valeur).trim();
  if (s === '') return '';
  const n = parseInt(s, 10);
  return (isFinite(n) && n >= 0) ? String(n) : '';
}

/** Équipe créée par une réponse d'invitation : ses effectifs viennent du club, pas d'ici. */
function estEquipeAuto(eq) {
  return String((eq && eq.source) || '').trim().toLowerCase() === 'auto';
}

/**
 * Une équipe est-elle en cours d'édition AVEC des valeurs réellement différentes de l'enregistré ?
 * Utilisée par l'assistant / la barre latérale pour décider s'il y a « une modification en attente ».
 * OUVRIR le crayon ne doit RIEN verrouiller : tant que rien n'a bougé, il n'y a rien à perdre —
 * on compare donc les VALEURS, jamais la simple présence des champs d'édition à l'écran.
 * Le nom est comparé en MAJUSCULES car c'est ainsi qu'il est enregistré (onEnregistrerNom).
 */
function equipeEditionModifiee() {
  const item = document.querySelector('#liste-equipes .equipe-item.en-edition');
  if (!item) return false;
  const id = item.getAttribute('data-id');
  const eq = (typeof equipesCourantes !== 'undefined' && equipesCourantes || [])
    .find(function (e) { return e.id_equipe === id; }) || {};
  const champ = function (sel) { return item.querySelector(sel); };

  const cNom = champ('.champ-edit-nom');
  if (cNom && cNom.value.trim().toUpperCase() !== String(eq.nom_equipe || '').trim().toUpperCase()) return true;
  const cJ = champ('.champ-edit-joueurs');
  if (cJ && effectifSaisi(cJ.value) !== effectifSaisi(eq.nb_joueurs)) return true;
  const cE = champ('.champ-edit-educateurs');
  if (cE && effectifSaisi(cE.value) !== effectifSaisi(eq.nb_educateurs)) return true;
  return false;
}

/** Petit résumé « 12 joueurs · 2 éducs » d'une équipe, ou '' si rien n'est déclaré. */
function resumeEffectifs(eq) {
  const j = effectifSaisi(eq && eq.nb_joueurs);
  const e = effectifSaisi(eq && eq.nb_educateurs);
  const bouts = [];
  if (j !== '') bouts.push(j + ' joueur' + (Number(j) > 1 ? 's' : ''));
  if (e !== '') bouts.push(e + ' éduc' + (Number(e) > 1 ? 's' : ''));
  return bouts.join(' · ');
}

/**
 * Affiche la liste des équipes, regroupées par catégorie.
 * @param {Object[]} equipes
 */
function afficherEquipes(equipes) {
  const zone = document.getElementById('liste-equipes');

  if (!equipes || equipes.length === 0) {
    zone.innerHTML = '<p class="vide">Aucune équipe saisie pour le moment.</p>';
    return;
  }

  // On regroupe les équipes par catégorie.
  const parCategorie = {};
  equipes.forEach(function (eq) {
    const cat = eq.categorie || '(sans catégorie)';
    if (!parCategorie[cat]) parCategorie[cat] = [];
    parCategorie[cat].push(eq);
  });

  // On affiche dans l'ordre des catégories de la config, puis les éventuelles autres.
  const ordre = configCourante.categories.map(function (c) { return c.categorie; });
  Object.keys(parCategorie).forEach(function (c) {
    if (ordre.indexOf(c) === -1) ordre.push(c);
  });

  let html = '';
  ordre.forEach(function (cat) {
    const liste = parCategorie[cat];
    if (!liste) return;

    let items = '';
    liste.forEach(function (eq) {
      // Effectifs déclarés : affichés à côté du nom. Une équipe créée par une réponse
      // d'invitation ('auto') tient les siens du club — on le dit plutôt que d'afficher un vide.
      const resume = resumeEffectifs(eq);
      let badge = '';
      if (resume) badge = '<span class="equipe-effectifs">' + echapper(resume) + '</span>';
      else if (estEquipeAuto(eq)) badge = '<span class="equipe-effectifs est-auto" ' +
        'title="Effectifs déclarés par le club dans sa réponse à l\'invitation">déclarés par le club</span>';
      items +=
        '<div class="equipe-item" data-id="' + eq.id_equipe + '">' +
          '<span class="nom">' + echapper(eq.nom_equipe) + '</span>' + badge +
          '<div class="equipe-actions">' +
            '<button class="bouton-modif bouton-icone" title="Modifier" aria-label="Modifier" ' +
                    'data-id="' + eq.id_equipe + '" data-nom="' + echapper(eq.nom_equipe) + '">' + svgIcone('crayon') + '</button>' +
            '<button class="bouton-suppr bouton-icone" title="Supprimer" aria-label="Supprimer" ' +
                    'data-id="' + eq.id_equipe + '" data-nom="' + echapper(eq.nom_equipe) + '">' + svgIcone('corbeille') + '</button>' +
          '</div>' +
        '</div>';
    });

    html +=
      '<div class="groupe-categorie">' +
        '<h3>' + echapper(cat) + ' <span class="cat-mini">(' + liste.length + ')</span>' +
          '<button class="bouton-suppr bouton-suppr-tout" data-cat="' + echapper(cat) + '">' +
            'Tout supprimer</button>' +
        '</h3>' +
        items +
      '</div>';
  });

  zone.innerHTML = html;
}

/* ==========================================================================
   ÉCRITURE CONFIRMÉE ≠ ÉCRAN À JOUR — CORR-BLOCAGE-LECTURES-ADMIN-DR
   ==========================================================================
   LE DÉFAUT CORRIGÉ. `onAjouterEquipe` annonçait « ✅ ajoutée », puis attendait
   `rechargerEquipes()` — une lecture SANS budget — et ne rendait le bouton qu'au `finally`.
   Quand cette lecture pendait, l'organisateur voyait le succès mais gardait un bouton mort et
   une liste d'hier, sans rien pour s'en sortir qu'un rechargement complet de la page. Et si la
   lecture ÉCHOUAIT, son message partait dans le même `catch` que l'écriture : un échec de
   LECTURE s'affichait comme un échec d'ÉCRITURE, invitant à recréer une équipe déjà enregistrée.

   LA RÈGLE POSÉE ICI — trois états, jamais confondus :
     ① « enregistrement en cours »                    : l'écriture est partie, on ne sait rien ;
     ② « enregistré, actualisation en cours »          : le serveur a confirmé l'écriture ;
     ③ « enregistré, mais actualisation échouée »      : l'acquis est dit, la liste est déclarée
        périmée, et l'ajout RESTE fermé — rouvrir sur une liste obsolète, c'est offrir le doublon.

   ⛔ CE QUI N'EST PAS RÉSOLU ICI. Les HTTP 404 observés sur ce parcours gardent une cause NON
      ÉTABLIE : rien dans ce lot ne l'identifie ni ne la corrige. Borner une lecture ne la fait pas
      réussir — ça la fait échouer plus vite, et de façon récupérable. C'est tout ce qui est promis.
   ⛔ Aucune écriture n'est jamais rejouée automatiquement, quelle que soit la panne.
   ========================================================================== */

/** Budget NOMINAL d'une lecture de la liste des équipes, en millisecondes.
 *
 *  ⭐ D'OÙ VIENT CE CHIFFRE. Les durées mesurées sur ce parcours — 2,3 s à 5,6 s — sont celles de
 *  l'EXÉCUTION Apps Script seule. ⚠️ Elles ne bornent PAS le temps réseau total : redirection,
 *  établissement de connexion, transfert et lecture du corps s'y ajoutent, et n'ont pas été
 *  mesurés. Le rejeu 404 peut encore ajouter une pause de 300 ms et une seconde émission. 20 s
 *  laissent une marge confortable sur ce qui a été observé, tout en bornant l'attente à quelque
 *  chose qu'un humain accepte devant un écran — mais ce chiffre reste à VALIDER en conditions
 *  réelles ; il n'est pas dérivé d'une campagne de mesure.
 *  ⚠️ NOMINAL, pas mural : onglet en arrière-plan, tâche longue ou veille peuvent retarder le
 *  dénouement au-delà de l'échéance (limite de minuterie navigateur déjà documentée dans
 *  `envoyerAvecRejeu404`, api.js). Aucune borne absolue n'est promise. */
const DELAI_LECTURE_EQUIPES_MS = 20000;

/** Numéro de la lecture la PLUS RÉCENTE. Toute réponse qui ne le porte plus est TARDIVE : elle
 *  est jetée sans toucher à l'écran — sans quoi un vieux résultat écraserait un état plus neuf.
 *  ⭐ R1 : ce numéro est PARTAGÉ. `rechargerEtRendre` (admin.js) le prend aussi, car il écrit la
 *  même mémoire (`equipesCourantes`) depuis un `getAll` global. Sans ce partage, un rafraîchissement
 *  commencé avant un ajout et terminé après sa relecture ramenait la liste à son état d'avant. */
let lectureEquipesJeton = 0;

/** PROPRIÉTAIRE de la lecture ciblée en vol (`null` = aucune). Empêche des clics répétés d'en
 *  lancer plusieurs en parallèle.
 *
 *  ⛔ CE QUI EST CORRIGÉ EN R2 — POSSESSION ≠ FRAÎCHEUR. Ce verrou était un simple booléen relâché
 *  « si mon jeton est encore le plus récent ». Or un rafraîchissement GLOBAL prend un jeton dans le
 *  même registre sans jamais posséder ce verrou : dès qu'il s'intercalait, la lecture ciblée en vol
 *  perdait la fraîcheur, ne se reconnaissait plus le droit de relâcher, et le verrou restait pris
 *  POUR TOUJOURS. « Actualiser la liste » restait visible et cliquable, mais sa garde sortait
 *  aussitôt : plus aucune lecture ne partait, et seul un rechargement de page en sortait.
 *  ⭐ Désormais chaque lecture ciblée pose une identité qui n'appartient qu'à elle, et ne relâche
 *  que si elle est encore le propriétaire. Une lecture plus récente a déjà pris la place — c'est
 *  ELLE qui relâchera. Le jeton, lui, ne sert plus qu'à décider quel RÉSULTAT s'affiche. */
let lectureEquipesProprietaire = null;

/** Une lecture ciblée est-elle en vol ? */
function lectureEquipesEnCours() { return lectureEquipesProprietaire !== null; }

/** Nombre de mutations d'équipe en cours, RÉCONCILIATION COMPRISE (0 = aucune).
 *
 *  ⛔ CE QUI EST CORRIGÉ EN R2. Rien ne marquait « opération en cours » : pendant l'écriture, puis
 *  pendant la relecture qui suit un succès, l'écran se croyait fiable (`equipesListeIncertaine`
 *  valant `false`, et `masquerRepriseEquipes()` le remettant à `false` au début de la relecture).
 *  Un simple rendu des catégories rouvrait alors le bouton, et une seconde soumission du MÊME nom
 *  partait — le contrôle de doublon s'appuyant sur la liste d'avant. Deux `ajouterEquipe` émis.
 *  ⭐ Une opération couvre tout l'intervalle « je ne sais pas encore ce que le serveur a retenu » :
 *  de l'envoi jusqu'à la fin de la réconciliation, sur TOUS les chemins de sortie. */
let equipesOperationsEnCours = 0;

/** Une mutation est-elle en cours, ou sa réconciliation ? */
function operationEquipesEnCours() { return equipesOperationsEnCours > 0; }

/** Ouvre une opération et referme aussitôt les gestes incompatibles. */
function debuterOperationEquipes() {
  equipesOperationsEnCours++;
  majDisponibiliteAjout();
}

/** Ferme une opération et RÉÉVALUE la disponibilité — jamais un simple « rouvrir ». */
function terminerOperationEquipes() {
  if (equipesOperationsEnCours > 0) equipesOperationsEnCours--;
  majDisponibiliteAjout();
}

/** Ce que l'écriture a ACQUIS alors que l'écran ne le reflète pas encore ('' si rien en suspens). */
let equipesAcquisNonReflete = '';

/** ⭐ R1 — L'ÉCRAN DES ÉQUIPES EST-IL DOUTEUX ? Vrai dès qu'une actualisation a échoué ou qu'une
 *  issue d'écriture est restée inconnue. C'est le SEUL état qui gouverne la disponibilité des
 *  mutations : un `disabled` de bouton ne suffit pas, n'importe quel rendu pouvant le lever. */
let equipesListeIncertaine = false;

/** Prend un numéro de lecture : tout écrivain de `equipesCourantes` DOIT passer par ici. */
function prendreJetonEquipes() { return ++lectureEquipesJeton; }

/** Ce numéro est-il encore le plus récent ? Faux ⇒ le résultat est périmé et doit être jeté. */
function jetonEquipesValide(jeton) { return jeton === lectureEquipesJeton; }

/** L'écran des équipes est-il en retard ou incertain ? */
function listeEquipesIncertaine() { return equipesListeIncertaine === true; }

/** L'ajout est-il possible du point de vue des catégories ? (même source que remplirSelectCategories) */
function ajoutPossibleEquipes() {
  const cats = (typeof configCourante !== 'undefined' && configCourante && configCourante.categories) || [];
  return cats.filter(estPresente).length > 0;
}

/**
 * Point UNIQUE de décision pour le bouton « Ajouter ».
 * ⛔ TROIS conditions, toutes nécessaires : au moins une catégorie présente, un écran fiable, ET
 *    aucune opération en cours. Proposer d'ajouter sur une liste périmée, c'est inviter à recréer
 *    une équipe qu'on ne voit pas ; le proposer pendant qu'une écriture est en vol ou en cours de
 *    réconciliation, c'est la même chose — on ne sait pas encore ce que le serveur a retenu.
 */
function majDisponibiliteAjout() {
  const indisponible = operationEquipesEnCours() || listeEquipesIncertaine() || !ajoutPossibleEquipes();
  ['bouton-ajouter', 'bouton-charger-equipes-demo'].forEach(function (id) {
    const bouton = document.getElementById(id);
    if (bouton) bouton.disabled = indisponible;
  });
}

/** Montre la reprise ciblée et marque l'écran DOUTEUX. `acquis` = ce qui est enregistré et doit rester dit. */
function afficherRepriseEquipes(acquis) {
  equipesAcquisNonReflete = acquis || '';
  equipesListeIncertaine = true;
  const zone = document.getElementById('reprise-equipes');
  if (zone) zone.hidden = false;
  majDisponibiliteAjout();
}

/** Retire la reprise ciblée : l'écran redevient fiable, plus rien n'est en suspens. */
function masquerRepriseEquipes() {
  equipesAcquisNonReflete = '';
  equipesListeIncertaine = false;
  const zone = document.getElementById('reprise-equipes');
  if (zone) zone.hidden = true;
}

/**
 * L'ABSENCE D'EFFET de l'écriture est-elle ÉTABLIE ? (⛔ et non « l'erreur est-elle connue »)
 *
 * ⛔ CE QUI EST CORRIGÉ EN R1. Cette fonction rendait `true` pour TOUTE erreur portant une réponse
 *    JSON. Or `backend/Code.gs` renvoie aussi `{ error: "Erreur serveur pendant l'écriture." }`
 *    depuis son `catch` d'exceptions inattendues — une réponse structurellement identique à un
 *    refus de validation, mais qui peut SUIVRE une écriture partielle (`modifierEquipe` écrit en
 *    plusieurs fois). La présence d'une réponse ne prouvait donc rien, et l'écran rouvrait la
 *    mutation sur une issue en réalité incertaine.
 *
 * ⭐ NE SONT RETENUS QUE LES DEUX CAS où le contrat existant établit qu'AUCUNE écriture n'a eu lieu :
 *    ① l'authentification est refusée — la clé est vérifiée AVANT le corps métier (drapeau
 *       `acces_refuse`, ou repli textuel pour les déploiements anciens) ;
 *    ② l'action a été annulée devant la fenêtre de clé — rien n'est parti avec cette clé-là.
 * ⛔ TOUT LE RESTE — erreur métier, erreur serveur générique, statut HTTP, panne réseau, JSON
 *    illisible, abandon — laisse l'issue INCERTAINE. On ne dit alors ni « échoué », ni « enregistré ».
 */
function ecritureSansEffetEtabli(err) {
  if (String((err && err.message) || '') === 'Action annulée.') return true;
  const rep = (err && err.reponse) || null;
  if (rep && typeof rep === 'object' && 'acces_refuse' in rep) return rep.acces_refuse === true;
  return !!(rep && typeof estRefusCle === 'function' && estRefusCle(err.message));
}

/**
 * Refuse une mutation tant que le parcours n'est pas dans un état sûr.
 * ⭐ R1 — GARDE À L'ENTRÉE des handlers, et non simple `disabled` de bouton : un rendu de
 *    catégories, un raccourci clavier ou un appel programmatique contournent un attribut ;
 *    ils ne contournent pas ce test.
 * ⭐ R2 — DEUX CAUSES, et deux messages distincts : une opération EN COURS (l'attente est normale,
 *    elle finira) n'est pas un écran PÉRIMÉ (il faut agir). ⛔ Une attente ne marque donc jamais la
 *    liste comme douteuse : ce serait transformer une seconde de patience en verrou durable.
 * @return {boolean} true si la mutation doit être ABANDONNÉE
 */
function refuserMutationSiIncertain(message, quoi) {
  if (operationEquipesEnCours()) {
    afficherMessage(message, '⏳ ' + quoi + ' : une opération est déjà en cours. Attends son ' +
      'résultat — relancer maintenant risquerait de créer un doublon, puisque la liste affichée ' +
      'ne reflète pas encore ce que le serveur a retenu.', 'ko');
    return true;
  }
  if (!listeEquipesIncertaine()) return false;
  const acquis = equipesAcquisNonReflete;
  afficherMessage(message, (acquis ? acquis + '\n' : '') +
    '⛔ ' + quoi + ' est suspendu : la liste affichée peut être en retard sur le serveur. ' +
    'Actualise-la d\'abord — agir sur des données anciennes risquerait de créer un doublon ou de ' +
    'supprimer la mauvaise équipe.', 'ko');
  afficherRepriseEquipes(acquis);
  return true;
}

/**
 * Actualise la liste APRÈS une écriture confirmée par le serveur.
 * @param {Object} message  la zone de message de la carte Équipes
 * @param {string} acquis   ce qui est ENREGISTRÉ, en une phrase — répété dans tous les cas
 * @return {Promise<boolean>} true si l'écran est à jour, false s'il est resté périmé
 */
async function actualiserApresEcriture(message, acquis) {
  masquerRepriseEquipes();
  // ② l'écriture est acquise ; l'écran, pas encore. On le dit AVANT d'attendre la lecture.
  afficherMessage(message, acquis + ' Actualisation de la liste…', 'ok');
  try {
    const aJour = await rechargerEquipes();
    // Une lecture PLUS RÉCENTE a pris la main : c'est elle qui conclut, pas cette réponse tardive.
    if (!aJour) return true;
    afficherMessage(message, acquis, 'ok');
    majDisponibiliteAjout();
    return true;
  } catch (err) {
    // ③ enregistré MAIS écran périmé. ⛔ Jamais présenté comme un échec d'écriture.
    afficherMessage(message, acquis + '\n⚠️ La liste ci-dessous n\'a PAS pu être actualisée : ' +
      err.message + '\n⛔ Ne recrée rien : ce qui est écrit ci-dessus est enregistré. ' +
      'Ce que la liste montre peut être ancien — utilise « Actualiser la liste ».', 'ko');
    afficherRepriseEquipes(acquis);
    return false;
  }
}

/**
 * Intègre immédiatement l'équipe RENVOYÉE par l'écriture confirmée.
 *
 * Le serveur est la source de cette ligne : identifiant, nom normalisé, catégorie, source et
 * effectifs viennent de `ajouterEquipe`, après l'écriture dans le Sheet. On peut donc rendre la
 * liste sans attendre un second aller-retour Apps Script. Toute lecture déjà en vol est invalidée
 * avant le rendu afin qu'une réponse ancienne ne puisse pas effacer cette équipe.
 *
 * @return {boolean} true si la réponse était assez complète pour être intégrée ; false déclenche
 *                   le parcours historique, compatible avec un ancien backend.
 */
function integrerEquipeAjoutee(equipe) {
  if (!equipe || typeof equipe !== 'object') return false;
  const id = String(equipe.id_equipe || '').trim();
  const nom = String(equipe.nom_equipe || '').trim();
  const categorie = String(equipe.categorie || '').trim();
  if (!id || !nom || !categorie) return false;

  // Une écriture confirmée est plus récente que toute lecture partie avant sa réponse.
  prendreJetonEquipes();
  equipesCourantes = (equipesCourantes || []).filter(function (existante) {
    return String((existante && existante.id_equipe) || '') !== id;
  });
  equipesCourantes.push(equipe);
  afficherEquipes(equipesCourantes);
  if (typeof actualiserEtatClubsDepuisEquipes === 'function') actualiserEtatClubsDepuisEquipes();
  majTableauBord();
  masquerRepriseEquipes();
  return true;
}

/**
 * Contrôle de cohérence APRÈS le rendu immédiat. Il ne bloque ni le bouton ni le message de
 * succès : la ligne affichée vient déjà de la réponse d'écriture du serveur. Un échec réseau ne
 * renie donc jamais l'acquis et ne transforme pas une vérification facultative en nouveau gel.
 */
function verifierEquipesEnArrierePlan() {
  return rechargerEquipes({ preserverEdition: true }).catch(function (err) {
    try { console.warn('Vérification différée des équipes impossible :', err.message); }
    catch (e) { /* console indisponible : aucune incidence métier */ }
    return false;
  });
}

/** Budget de CHAQUE tentative d'ajout. Le backend rend cette seule écriture idempotente : si
 * Google perd la première réponse, le second envoi retrouve la ligne existante sous verrou et la
 * renvoie, sans doublon. Deux tentatives au plus, chacune avec son propre délai. */
const DELAI_AJOUT_EQUIPE_MS = 9000;

/**
 * Reprise CIBLÉE : relit la seule liste des équipes, sans recharger la page, sans réémettre
 * la moindre écriture, et SANS toucher aux champs du formulaire — la saisie suivante déjà
 * préparée à l'écran doit survivre à la reprise.
 */
async function onRepriseEquipes() {
  const bouton = document.getElementById('bouton-reprise-equipes');
  const message = document.getElementById('message-equipe');
  if (lectureEquipesEnCours()) return;          // ⛔ un second clic ne lance pas une seconde lecture
  const acquis = equipesAcquisNonReflete;
  if (bouton) { bouton.disabled = true; bouton.textContent = 'Actualisation…'; }
  try {
    const aJour = await rechargerEquipes();
    if (!aJour) return;                         // réponse tardive : une lecture plus récente conclut
    masquerRepriseEquipes();
    afficherMessage(message, (acquis ? acquis + ' ' : '') + '✅ Liste à jour.', 'ok');
    majDisponibiliteAjout();
  } catch (err) {
    afficherMessage(message, (acquis ? acquis + '\n' : '') +
      '⚠️ La liste n\'a toujours pas pu être actualisée : ' + err.message +
      '\n⛔ Ce qui est enregistré le reste ; ce que la liste montre peut être ancien.', 'ko');
  } finally {
    if (bouton) { bouton.disabled = false; bouton.textContent = 'Actualiser la liste'; }
  }
}

/**
 * Quand on soumet le formulaire d'ajout d'équipe.
 */
async function onAjouterEquipe(evenement) {
  evenement.preventDefault(); // empêche le rechargement de la page

  const champNom = document.getElementById('champ-nom');
  const champCat = document.getElementById('champ-categorie');
  const champJ   = document.getElementById('champ-joueurs');
  const champE   = document.getElementById('champ-educateurs');
  const bouton   = document.getElementById('bouton-ajouter');
  const message  = document.getElementById('message-equipe');

  // ⛔ R1 — GARDE À L'ENTRÉE : tant que l'écran est douteux, aucune équipe n'est ajoutée. Le
  //    contrôle du doublon plus bas s'appuie sur `equipesCourantes` ; s'appuyer sur une liste
  //    périmée reviendrait à croire qu'une équipe n'existe pas parce qu'on ne la voit pas encore.
  if (refuserMutationSiIncertain(message, 'L\'ajout d\'équipe')) return;

  // Nom du club toujours en MAJUSCULES (uniformité d'affichage sur toutes les pages).
  const nom = champNom.value.trim().toUpperCase();
  const categorie = champCat.value;
  const nbJoueurs = effectifSaisi(champJ ? champJ.value : '');
  const nbEducateurs = effectifSaisi(champE ? champE.value : '');

  if (!nom || !categorie) {
    afficherMessage(message, 'Indique un nom ET une catégorie.', 'ko');
    return;
  }

  // Refuse un doublon : même nom dans la même catégorie (les noms sont en MAJUSCULES).
  const doublon = equipesCourantes.some(function (e) {
    return (e.categorie || '') === categorie &&
           String(e.nom_equipe).trim().toUpperCase() === nom;
  });
  if (doublon) {
    afficherMessage(message, '⚠️ « ' + nom + ' » existe déjà dans ' + categorie + '.', 'ko');
    return;
  }

  // ① ÉCRITURE EN COURS. On désactive le bouton le temps de l'envoi (évite les doubles clics),
  //    et on le DIT : sans ça, les secondes qui suivent ressemblent à une page figée.
  //    ⭐ Exception étroite : CET ajout porte un budget, car le backend le rend idempotent sous
  //       verrou (même nom + même catégorie ⇒ la ligne existante est renvoyée). Une réponse
  //       perdue peut donc recevoir un unique second essai sans créer de doublon. Toutes les
  //       autres mutations gardent le contrat historique : aucun rejeu automatique.
  // ⭐ R2 — L'OPÉRATION S'OUVRE ICI et ne se referme qu'à la toute fin, réconciliation comprise :
  //    c'est l'intervalle pendant lequel on ignore ce que le serveur a retenu. Tant qu'elle dure,
  //    `majDisponibiliteAjout()` garde le bouton fermé — y compris si un rendu des catégories
  //    passe par là — et la garde d'entrée refuse une seconde soumission.
  debuterOperationEquipes();
  bouton.textContent = 'Ajout…';
  masquerRepriseEquipes();
  afficherMessage(message, '⏳ Enregistrement de « ' + nom + ' »…', 'ok');

  let verifierEnArrierePlan = false;
  try {
    let ecrite = false;
    let reponseEcriture = null;
    try {
      reponseEcriture = await ecrireAdmin('ajouterEquipe', {
        nom_equipe: nom, categorie: categorie,
        nb_joueurs: nbJoueurs, nb_educateurs: nbEducateurs
      }, { delaiMs: DELAI_AJOUT_EQUIPE_MS });
      ecrite = true;
    } catch (erreur) {
      if (ecritureSansEffetEtabli(erreur)) {
        // Absence d'effet ÉTABLIE (clé refusée, ou annulation avant émission) : on peut recommencer.
        afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
      } else {
        // ⛔ ISSUE INCERTAINE. Surtout ne pas dire « échec », surtout ne pas inviter à recréer.
        //    ⚠️ Y COMPRIS pour une erreur métier ou une « erreur serveur » : le backend renvoie le
        //    même genre de réponse pour un refus de validation et pour une exception survenue APRÈS
        //    un début d'écriture. Seule une relecture peut trancher.
        afficherMessage(message, '⚠️ Impossible de savoir si « ' + nom + ' » a été enregistrée : ' +
          erreur.message + '\n⛔ Ne la recrée pas. Actualise d\'abord la liste pour voir ce que le ' +
          'serveur a retenu.', 'ko');
        afficherRepriseEquipes('');
      }
    } finally {
      bouton.textContent = 'Ajouter';   // ⛔ l'ouverture du bouton se décide par état, pas ici
    }
    if (!ecrite) return;

    // ÉCRITURE CONFIRMÉE : on libère les champs pour la saisie suivante, puis on actualise. Le
    // succès est déjà acquis à cet instant — plus rien de ce qui suit ne peut le remettre en cause.
    champNom.value = '';
    if (champJ) champJ.value = '';
    if (champE) champE.value = '';
    champNom.focus();

    const acquis = '✅ « ' + nom + ' » ajoutée.';
    let integree = false;
    try { integree = integrerEquipeAjoutee(reponseEcriture && reponseEcriture.equipe); }
    catch (err) {
      // Une panne de rendu ne remet pas l'écriture en cause : le parcours historique relit la
      // liste et sait présenter séparément un éventuel échec d'affichage.
      try { console.warn('Affichage immédiat de l’équipe impossible :', err.message); }
      catch (e) { /* console indisponible : aucune incidence métier */ }
    }
    if (integree) {
      // Parcours rapide : la réponse de l'écriture contient la ligne réellement enregistrée.
      afficherMessage(message, acquis, 'ok');
      verifierEnArrierePlan = true;
    } else {
      // Compatibilité avec un déploiement serveur ancien ou une réponse incomplète.
      await actualiserApresEcriture(message, acquis);
    }
  } finally {
    // ⛔ R2 — FERMETURE SUR TOUS LES CHEMINS : confirmation, refus sans effet, issue incertaine,
    //    réconciliation réussie ou ratée. L'état repart ensuite de la disponibilité réelle.
    terminerOperationEquipes();
  }
  if (verifierEnArrierePlan) verifierEquipesEnArrierePlan();
}

/** Prépare uniquement le suivi des équipes déjà affichées. La liste transmise sert de
 * garde contre un écran périmé ; seuls les enregistrements relus par le serveur font foi. */
async function onAjouterEquipesDemo() {
  const bouton = document.getElementById('bouton-charger-equipes-demo');
  const message = document.getElementById('message-equipe');
  if (refuserMutationSiIncertain(message, 'La préparation de la démonstration')) return;
  const plan = preparerAjoutEquipesDemo();
  if (!plan.equipes.length) {
    afficherMessage(message, 'Ajoute d’abord les équipes souhaitées dans « Équipes ». La démo ne crée aucune équipe automatiquement.', 'ko');
    return;
  }
  const confirme = await dialogConfirmer(
    'Préparer le suivi des ' + plan.equipes.length + ' équipe(s) actuellement affichée(s) ?' +
    '\nAucune équipe ne sera ajoutée, supprimée ou remplacée.' +
    '\nLes commandes de démonstration seront recalculées avec les tarifs enregistrés. Les refus et réponses en attente restent conservés.',
    { ok: 'Préparer le suivi' }
  );
  if (!confirme) return;
  debuterOperationEquipes();
  try {
    if (bouton) bouton.textContent = 'Préparation du suivi des clubs…';
    afficherMessage(message, '⏳ Vérification des équipes présentes et préparation du suivi…', 'ok');
    const res = await ecrireAdmin('chargerClubsDemoRacing', { equipes: plan.equipes }, { delaiMs: 45000 });
    if (!res || Number(res.equipes) !== plan.equipes.length) {
      afficherMessage(message, '⚠️ La préparation n’a pas confirmé la liste des équipes. Actualise les données avant de poursuivre.', 'ko');
      return;
    }
    if (typeof rafraichirRessourceAdmin === 'function') {
      const relu = await rafraichirRessourceAdmin('clubsInvites');
      if (relu === false) {
        afficherMessage(message, '⚠️ Les clubs ont été préparés, mais leur liste n’a pas pu être actualisée. Recharge la page pour voir le suivi à jour.', 'ko');
        return;
      }
    }
    afficherMessage(message, '✅ Suivi préparé pour les ' + res.equipes + ' équipe(s) présentes. Aucune équipe créée. Les réponses et paiements existants sont conservés.', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message + '\nAucune équipe n’a été créée par ce bouton.', 'ko');
  } finally {
    if (bouton) bouton.textContent = 'Démo — Préparer le suivi des équipes présentes';
    terminerOperationEquipes();
  }
}

/**
 * Clic dans la liste : on aiguille vers Modifier, Supprimer, Tout supprimer,
 * ou les boutons du mini-formulaire d'édition (Enregistrer / Annuler).
 */
async function onClicListe(evenement) {
  const cible = evenement.target;

  // ⚠️ Les boutons d'édition (Enregistrer/Annuler) réutilisent les classes
  // .bouton-modif/.bouton-suppr pour le style : on les teste EN PREMIER.
  if (cible.closest('.bouton-edit-ok'))     return onEnregistrerNom(cible.closest('.bouton-edit-ok'));
  if (cible.closest('.bouton-edit-annuler')) return afficherEquipes(equipesCourantes);
  if (cible.closest('.bouton-modif'))       return onModifierEquipe(cible.closest('.bouton-modif'));
  if (cible.closest('.bouton-suppr-tout'))  return onSupprimerCategorieEquipes(cible.closest('.bouton-suppr-tout'));
  if (cible.closest('.bouton-suppr'))       return onSupprimerEquipe(cible.closest('.bouton-suppr'));
}

/**
 * Supprime une seule équipe.
 */
async function onSupprimerEquipe(bouton) {
  const id = bouton.getAttribute('data-id');
  const nom = bouton.getAttribute('data-nom');
  const message = document.getElementById('message-equipe');

  // ⛔ R1 — garde à l'entrée : `id` vient d'une liste qui peut être périmée.
  if (refuserMutationSiIncertain(message, 'La suppression d\'équipe')) return;

  if (!await dialogConfirmer('Supprimer l\'équipe « ' + nom + ' » ?', { ok: 'Supprimer', danger: true })) return;

  debuterOperationEquipes();   // ⭐ R2 — couvre l'écriture ET sa réconciliation
  bouton.disabled = true;
  try {
    await ecrireAdmin('supprimerEquipe', { id_equipe: id });
    // ⭐ Même règle que l'ajout : la suppression est acquise ; l'écran, lui, peut rester en retard.
    await actualiserApresEcriture(message, '🗑️ « ' + nom + ' » supprimée.');
  } catch (erreur) {
    if (ecritureSansEffetEtabli(erreur)) {
      afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
      bouton.disabled = false;
    } else {
      // ⛔ R1 — issue incertaine : la reprise est réellement OFFERTE, et le geste reste fermé.
      afficherMessage(message, '⚠️ Impossible de savoir si « ' + nom + ' » a été supprimée : ' +
        erreur.message + '\n⛔ Ne recommence pas. Actualise la liste pour voir ce que le serveur ' +
        'a retenu.', 'ko');
      afficherRepriseEquipes('');
    }
  } finally {
    terminerOperationEquipes();
  }
}

/**
 * Supprime TOUTES les équipes d'une catégorie d'un seul coup.
 */
async function onSupprimerCategorieEquipes(bouton) {
  const cat = bouton.getAttribute('data-cat');
  const message = document.getElementById('message-equipe');
  // ⛔ R1 — garde à l'entrée : le DÉCOMPTE annoncé ci-dessous vient de la liste affichée.
  if (refuserMutationSiIncertain(message, 'La suppression par catégorie')) return;

  const combien = equipesCourantes.filter(function (eq) {
    return (eq.categorie || '(sans catégorie)') === cat;
  }).length;

  if (!await dialogConfirmer('Supprimer TOUTES les ' + combien + ' équipe(s) de la catégorie « ' + cat + ' » ?\n\n' +
               'Cette action est irréversible.', { ok: 'Tout supprimer', danger: true })) return;

  debuterOperationEquipes();   // ⭐ R2 — couvre l'écriture ET sa réconciliation
  bouton.disabled = true;
  bouton.textContent = 'Suppression…';
  try {
    const res = await ecrireAdmin('supprimerEquipesCategorie', { categorie: cat });
    const n = (res && res.nb_supprimees != null) ? res.nb_supprimees : combien;
    await actualiserApresEcriture(message, '🗑️ ' + n + ' équipe(s) de « ' + cat + ' » supprimée(s).');
  } catch (erreur) {
    bouton.textContent = 'Tout supprimer';
    if (ecritureSansEffetEtabli(erreur)) {
      afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
      bouton.disabled = false;
    } else {
      // ⛔ R1 — une suppression en lot peut avoir supprimé une PARTIE avant l'exception.
      afficherMessage(message, '⚠️ Impossible de savoir ce qui a été supprimé dans « ' + cat +
        ' » : ' + erreur.message + '\n⛔ Ne recommence pas : une partie a pu être supprimée. ' +
        'Actualise la liste pour voir ce qu\'il reste.', 'ko');
      afficherRepriseEquipes('');
    }
  } finally {
    terminerOperationEquipes();
  }
}

/**
 * Passe une équipe en mode édition : le nom devient un champ modifiable
 * avec les boutons Enregistrer / Annuler.
 */
function onModifierEquipe(bouton) {
  const id = bouton.getAttribute('data-id');
  const nom = bouton.getAttribute('data-nom');
  const item = document.querySelector('.equipe-item[data-id="' + id + '"]');
  if (!item) return;
  const eq = (equipesCourantes || []).find(function (e) { return e.id_equipe === id; }) || {};
  const auto = estEquipeAuto(eq);

  // Édition : nom + effectifs déclarés (joueurs / éducateurs). Vide = « non déclaré », jamais 0.
  item.classList.add('en-edition');
  item.innerHTML =
    '<input class="champ-edit-nom" type="text" value="' + echapper(nom) + '" autocomplete="off" ' +
           'aria-label="Nom de l\'équipe">' +
    '<input class="champ-edit-joueurs champ-effectif" type="number" min="0" step="1" placeholder="Joueurs" ' +
           'value="' + echapper(effectifSaisi(eq.nb_joueurs)) + '" aria-label="Nombre de joueurs (facultatif)">' +
    '<input class="champ-edit-educateurs champ-effectif" type="number" min="0" step="1" placeholder="Éducs" ' +
           'value="' + echapper(effectifSaisi(eq.nb_educateurs)) + '" aria-label="Nombre d\'éducateurs (facultatif)">' +
    '<div class="equipe-actions">' +
      '<button class="bouton-modif bouton-edit-ok" data-id="' + id + '">Enregistrer</button>' +
      '<button class="bouton-suppr bouton-edit-annuler">Annuler</button>' +
    '</div>' +
    (auto ? '<span class="equipe-note-edition">⚠️ Équipe créée par la réponse du club : ses effectifs ' +
            'sont déjà comptés depuis l\'invitation. Ce que tu saisis ici ne sera pas ajouté au total ' +
            '(pour éviter de compter deux fois).</span>' : '');

  const champ = item.querySelector('.champ-edit-nom');
  champ.focus();
  champ.select();
  // Entrée = enregistrer, Échap = annuler — sur les trois champs.
  item.querySelectorAll('input').forEach(function (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); item.querySelector('.bouton-edit-ok').click(); }
      if (e.key === 'Escape') { e.preventDefault(); afficherEquipes(equipesCourantes); }
    });
  });
}

/**
 * Enregistre le nouveau nom d'une équipe éditée.
 */
async function onEnregistrerNom(bouton) {
  const id = bouton.getAttribute('data-id');
  const item = document.querySelector('.equipe-item[data-id="' + id + '"]');
  const message = document.getElementById('message-equipe');
  const champ = item ? item.querySelector('.champ-edit-nom') : null;
  if (!champ) return;

  // ⛔ R1 — garde à l'entrée : `id` et le contrôle de doublon viennent de la liste affichée.
  if (refuserMutationSiIncertain(message, 'La modification d\'équipe')) return;

  // Nom du club toujours en MAJUSCULES (cohérence avec l'ajout d'équipe).
  const nouveauNom = champ.value.trim().toUpperCase();
  if (!nouveauNom) {
    afficherMessage(message, "Le nom de l'équipe ne peut pas être vide.", 'ko');
    return;
  }

  // Refuse un doublon dans la même catégorie (hors l'équipe qu'on renomme elle-même).
  const equipe = equipesCourantes.find(function (e) { return e.id_equipe === id; });
  const cat = equipe ? (equipe.categorie || '') : '';
  const doublon = equipesCourantes.some(function (e) {
    return e.id_equipe !== id && (e.categorie || '') === cat &&
           String(e.nom_equipe).trim().toUpperCase() === nouveauNom;
  });
  if (doublon) {
    afficherMessage(message, '⚠️ « ' + nouveauNom + ' » existe déjà dans ' + cat + '.', 'ko');
    return;
  }

  // Effectifs déclarés : envoyés SYSTÉMATIQUEMENT (même vides) — un champ vidé à l'écran doit
  // effacer la valeur enregistrée, sinon on ne pourrait jamais revenir à « non déclaré ».
  const champJ = item.querySelector('.champ-edit-joueurs');
  const champE = item.querySelector('.champ-edit-educateurs');
  const nbJoueurs = effectifSaisi(champJ ? champJ.value : '');
  const nbEducateurs = effectifSaisi(champE ? champE.value : '');

  debuterOperationEquipes();   // ⭐ R2 — couvre l'écriture ET sa réconciliation
  bouton.disabled = true;
  bouton.textContent = 'Enregistrement…';
  try {
    await ecrireAdmin('modifierEquipe', { id_equipe: id, nom_equipe: nouveauNom,
                                          nb_joueurs: nbJoueurs, nb_educateurs: nbEducateurs });
    const resume = resumeEffectifs({ nb_joueurs: nbJoueurs, nb_educateurs: nbEducateurs });
    await actualiserApresEcriture(message,
      '✏️ « ' + nouveauNom + ' » enregistrée' + (resume ? ' — ' + resume : '') + '.');
  } catch (erreur) {
    bouton.textContent = 'Enregistrer';
    if (ecritureSansEffetEtabli(erreur)) {
      afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
      bouton.disabled = false;
    } else {
      // ⛔ R1 — `modifierEquipe` écrit le nom PUIS les effectifs : une exception au milieu laisse
      //    un enregistrement partiel, que seule une relecture peut révéler.
      afficherMessage(message, '⚠️ Impossible de savoir ce qui a été enregistré pour « ' +
        nouveauNom + ' » : ' + erreur.message + '\n⛔ Ne recommence pas. Actualise la liste pour ' +
        'voir ce que le serveur a retenu.', 'ko');
      afficherRepriseEquipes('');
    }
  } finally {
    terminerOperationEquipes();
  }
}

/**
 * Recharge uniquement la liste des équipes depuis le backend.
 *
 * ⭐ BORNÉE (CORR-BLOCAGE-LECTURES-ADMIN-DR) : sans budget, une lecture qui « pend » gelait tout
 *    le parcours d'ajout. Le budget couvre l'émission, l'éventuel rejeu 404 ET la lecture du corps.
 * ⭐ DATÉE : chaque appel prend un numéro. Une réponse qui ne porte plus le dernier numéro est
 *    TARDIVE — elle est jetée sans rien afficher, pour qu'un vieux résultat n'écrase jamais un
 *    état plus récent. Elle rend `false` : l'appelant sait qu'il n'a rien à conclure.
 * ⛔ Ne touche jamais aux champs du formulaire, et n'émet aucune écriture.
 *
 * @param {Object} [options] { delaiMs } pour déroger au budget par défaut
 * @return {Promise<boolean>} true si CET appel a mis l'écran à jour
 */
async function rechargerEquipes(options) {
  const jeton = prendreJetonEquipes();
  // ⭐ R2 — IDENTITÉ PROPRE À CET APPEL. Le verrou appartient à la lecture qui l'a pris, et à elle
  //    seule ; il ne dépend PAS de la fraîcheur, qu'un lecteur global peut lui retirer sans jamais
  //    posséder ce verrou. Une lecture ciblée plus récente écrase ce propriétaire : c'est alors
  //    elle qui relâchera. Dans tous les cas, quelqu'un relâche — plus d'orphelin possible.
  const proprietaire = {};
  lectureEquipesProprietaire = proprietaire;
  let equipes, echec = null;
  try {
    equipes = await apiGet('getEquipes', null,
      { delaiMs: (options && options.delaiMs) || DELAI_LECTURE_EQUIPES_MS });
  } catch (err) {
    // ⭐ R1 — L'ERREUR EST RETENUE, PAS RELANCÉE TOUT DE SUITE. Le jeton ne filtrait que les
    //    SUCCÈS : un rejet périmé sautait le test et remontait à l'appelant, dont le `catch`
    //    remplaçait alors un succès plus récent par un vieil échec (reprise rouverte, ajout refermé).
    echec = err;
  } finally {
    // ⛔ R2 — RELÂCHÉ PAR SON PROPRIÉTAIRE, jamais par la fraîcheur. Une lecture ciblée plus
    //    récente a déjà pris la place : elle relâchera à son tour. Une tardive ne rouvre donc pas
    //    la porte pendant que la nouvelle est en vol, et aucun verrou ne reste orphelin.
    if (lectureEquipesProprietaire === proprietaire) lectureEquipesProprietaire = null;
  }
  // réponse TARDIVE — succès OU erreur : un état plus récent existe, celle-ci n'a aucun effet
  if (!jetonEquipesValide(jeton)) return false;
  if (echec) throw echec;
  // Une vérification de fond ne doit jamais fermer ni écraser un formulaire d'édition que
  // l'organisateur a ouvert pendant son trajet réseau. Une actualisation demandée explicitement
  // conserve, elle, son comportement historique.
  if (options && options.preserverEdition &&
      document.querySelector('#liste-equipes .equipe-item.en-edition')) return false;
  equipesCourantes = equipes;
  afficherEquipes(equipes);
  if (typeof actualiserEtatClubsDepuisEquipes === 'function') actualiserEtatClubsDepuisEquipes();
  majTableauBord(); // le nombre d'équipes a changé
  return true;
}

/* --------------------------------------------------------------------------
   RÉGLAGE « Identifier mes équipes dans Perfs » (paramètre `perfs_mot_cle_club`)

   Il vit dans la carte ÉQUIPES parce que la valeur attendue est un morceau du
   NOM des équipes — l'organisateur les a sous les yeux au moment de le choisir.
   Écriture : action existante `enregistrerInfosTournoi`, en envoi PARTIEL (le
   backend n'écrit que les champs reçus) ⇒ aucune action serveur nouvelle, et la
   ligne de Config est créée automatiquement si elle n'existe pas encore.
   -------------------------------------------------------------------------- */

/** Longueur MINIMALE du mot-clé, une fois normalisé (voir perfs.js). */
const MOT_CLE_LONGUEUR_MIN = 3;

/** Normalisation IDENTIQUE à celle de perfs.js — les deux doivent juger pareil. */
function normaliserMotCleClub(valeur) {
  return String(valeur == null ? '' : valeur).trim().toLowerCase();
}

/** (Re)remplit le champ depuis la configuration chargée. */
function majPerfsMotCleClub() {
  const form = document.getElementById('form-perfs-club');
  if (!form || !form.perfs_mot_cle_club) return;
  form.perfs_mot_cle_club.value = (configCourante.global || {}).perfs_mot_cle_club || '';
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
}

/**
 * Enregistre le mot-clé. Trois issues, et elles sont distinctes :
 *   • vide            ⇒ accepté — c'est la désactivation volontaire de la page Perfs ;
 *   • 1 ou 2 signes   ⇒ REFUSÉ — trop court pour distinguer un club d'un autre ;
 *   • 3 signes ou +   ⇒ enregistré (en minuscules, sans espaces de bord).
 */
async function onEnregistrerPerfsMotCle() {
  const form = document.getElementById('form-perfs-club');
  const message = document.getElementById('message-perfs-club');
  const bouton = document.getElementById('bouton-enregistrer-perfs-club');
  const valeur = normaliserMotCleClub(form.perfs_mot_cle_club.value);

  if (valeur !== '' && valeur.length < MOT_CLE_LONGUEUR_MIN) {
    afficherMessage(message, '⚠️ Trop court : il faut au moins ' + MOT_CLE_LONGUEUR_MIN +
      ' caractères. Avec moins, des équipes adverses risqueraient d\'être comptées comme les tiennes. ' +
      'Laisse vide si tu préfères ne pas utiliser la page Perfs.', 'ko');
    return;
  }

  await avecBoutonOccupe(bouton, message, async function () {
    afficherMessage(message, 'Enregistrement…', 'ok');
    await ecrireAdmin('enregistrerInfosTournoi', { perfs_mot_cle_club: valeur });
    configCourante = await lireConfigAdmin();
    majPerfsMotCleClub();

    // ⚠️ On RELIT avant d'annoncer le succès. Sans cette comparaison, un serveur pas encore
    // redéployé (qui ignore ce paramètre) produirait une écriture sans effet — et un message
    // vert affirmant le contraire. On ne dit « enregistré » que si le classeur le confirme.
    const relu = normaliserMotCleClub((configCourante.global || {}).perfs_mot_cle_club);
    if (relu !== valeur) {
      afficherMessage(message, '⚠️ La valeur n\'a pas été enregistrée : le serveur a répondu « ' +
        (relu || '(vide)') +' ». Si le serveur vient d\'être modifié, il n\'a peut-être pas encore ' +
        'été redéployé — voir docs/deploiement.md.', 'ko');
      return;
    }
    afficherMessage(message, valeur === ''
      ? '✅ Réglage effacé : la page Perfs n\'affichera aucun bilan.'
      : '✅ Enregistré : les équipes dont le nom contient « ' + valeur + ' » sont les tiennes.', 'ok');
  });
}
