/**
 * ============================================================================
 *  SAISIE DES SCORES — page dédiée (tables de marque, usage téléphone)
 * ============================================================================
 *
 *  Charge tous les matchs, affiche pour chacun deux champs de score + un bouton
 *  « Valider ». Valider envoie le score au backend (action enregistrerScore) et
 *  passe le match en « terminé ». Un match déjà terminé reste modifiable.
 *
 *  Nécessite (chargés AVANT ce fichier) : config.js puis api.js.
 * ============================================================================
 */

let equipes = [];
let nomParEquipe = {};          // index id_equipe → nom (reconstruit à chaque chargement)
let matchs = [];
let grandsTerrains = {};        // composition des grands terrains { nom: [numéros de mini-terrains] }
let capacitesCat = {};          // { catégorie: { tir_au_but: bool } } — servi par getCapacitesCategories
let categoriesSaisie = [];      // config.categories (contexte_tournoi/scf_phase) — vocabulaire Super Challenge
let categorieActiveSaisie = '';
let terrainActifSaisie = '';    // nom du grand terrain filtré ('' = tous les terrains)
const CLE_CAT_SAISIE = 'r92_saisie_cat';
const CLE_TERRAIN_SAISIE = 'r92_saisie_terrain';

/* Points FFR du score détaillé (jeu à XV) — MIROIR de backend/Code.gs (POINTS_*), à garder synchrone :
   essai 5, transformation 2, pénalité 3, drop 3. Le backend reste la source de vérité (il recalcule). */
const PTS_ESSAI = 5, PTS_TRANSFO = 2, PTS_PENALITE = 3, PTS_DROP = 3;

/** La catégorie tire-t-elle au but ? Réponse DONNÉE (getCapacitesCategories, issue de RefFFR_Regles.tir_au_but),
 *  jamais déduite du nom. Défaut prudent : inconnue ⇒ false ⇒ saisie simple (comportement historique). */
function tireAuBut(cat) {
  const c = capacitesCat && capacitesCat[cat];
  return !!(c && c.tir_au_but === true);
}

/** Capacité « tir au but » en TROIS états : true / false / null (INCONNUE — catégorie absente des
 *  capacités, p.ex. backend pas encore redéployé). L'inconnu est distinct du « non » : on ne sait
 *  alors PAS si un score est en essais ou en points, donc l'alerte 5 essais doit se taire. */
function capaciteTirAuBut(cat) {
  const c = capacitesCat && capacitesCat[cat];
  return (c && typeof c.tir_au_but === 'boolean') ? c.tir_au_but : null;
}

/** Point d'entrée : on va chercher les données puis on affiche. */
async function initSaisie() {
  const zone = document.getElementById('liste-matchs');

  // Changement de catégorie (le <select> est statique dans le HTML, on l'écoute une fois).
  const sel = document.getElementById('select-cat-saisie');
  if (sel) sel.addEventListener('change', function (e) {
    categorieActiveSaisie = e.target.value;
    localStorage.setItem(CLE_CAT_SAISIE, categorieActiveSaisie);
    afficherMatchs();
  });

  // Changement de grand terrain (même principe que le filtre catégorie).
  const selTerrain = document.getElementById('select-terrain-saisie');
  if (selTerrain) selTerrain.addEventListener('change', function (e) {
    terrainActifSaisie = e.target.value;
    localStorage.setItem(CLE_TERRAIN_SAISIE, terrainActifSaisie);
    afficherMatchs();
  });

  // Bouton « Rafraîchir » : recharge les saisies faites sur les autres appareils.
  const btnMaj = document.getElementById('bouton-rafraichir-saisie');
  if (btnMaj) btnMaj.addEventListener('click', rafraichirSaisie);

  try {
    // ⚡ getAll (matchs) et getCapacitesCategories (tir au but) partent EN MÊME TEMPS. Les capacités
    // sont tolérantes à l'échec (backend pas encore redéployé) : la saisie reste alors en mode simple.
    const [data, caps] = await Promise.all([
      apiGet('getAll'),
      apiGet('getCapacitesCategories').catch(function () { return { categories: {} }; })
    ]);
    equipes = data.equipes || [];
    nomParEquipe = indexerNoms(equipes); // index id → nom (O(1))
    matchs = data.matchs || [];
    grandsTerrains = lireGrandsTerrains(data.config);
    categoriesSaisie = (data.config && data.config.categories) || [];
    capacitesCat = (caps && caps.categories) || {};
    afficherMatchs();
    majHeureSaisie();
  } catch (err) {
    zone.innerHTML = '<p class="vide">Erreur de chargement : ' + echapper(err.message) + '</p>';
  }
  // « Connexion » : on demande la clé scores une fois à l'ouverture (puis mémorisée).
  await connexion('scores', 'de saisie des scores');
}

/**
 * Recharge les matchs depuis le backend et réaffiche la table de marque.
 * ⚠️ Réaffiche la liste : un score en cours de frappe (non validé) serait perdu — c'est
 * pourquoi c'est un bouton manuel (on rafraîchit quand on ne saisit rien).
 */
async function rafraichirSaisie() {
  const bouton = document.getElementById('bouton-rafraichir-saisie');
  const texte = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = '⏳ …';
  try {
    const [data, caps] = await Promise.all([
      apiGet('getAll'),
      apiGet('getCapacitesCategories').catch(function () { return { categories: capacitesCat }; })
    ]);
    equipes = data.equipes || [];
    nomParEquipe = indexerNoms(equipes); // index id → nom (O(1))
    matchs = data.matchs || [];
    grandsTerrains = lireGrandsTerrains(data.config);
    categoriesSaisie = (data.config && data.config.categories) || [];
    capacitesCat = (caps && caps.categories) || {};
    afficherMatchs();
    majHeureSaisie();
  } catch (err) {
    // On garde l'affichage actuel en cas d'erreur réseau.
  } finally {
    bouton.disabled = false;
    bouton.textContent = texte;
  }
}

/** Affiche l'heure de la dernière mise à jour des données. */
function majHeureSaisie() {
  const el = document.getElementById('maj-saisie');
  if (el) el.textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR');
}

/* comparerCategorie() est désormais dans commun.js (partagé avec tournoi.js). */

/**
 * Remplit le menu déroulant des catégories et fixe la catégorie active (mémorisée si
 * toujours présente, sinon la première). Le menu se masque s'il n'y a qu'une catégorie.
 */
function peuplerFiltreCat() {
  const bloc = document.getElementById('filtre-cat-saisie');
  const sel = document.getElementById('select-cat-saisie');
  const cats = [];
  matchs.forEach(function (m) { if (cats.indexOf(m.categorie) < 0) cats.push(m.categorie); });
  cats.sort(comparerCategorie);

  const memo = localStorage.getItem(CLE_CAT_SAISIE) || '';
  categorieActiveSaisie = (cats.indexOf(memo) >= 0) ? memo : (cats[0] || '');

  sel.innerHTML = cats.map(function (c) {
    return '<option value="' + echapper(c) + '"' + (c === categorieActiveSaisie ? ' selected' : '') + '>' +
      echapper(c) + '</option>';
  }).join('');
  bloc.hidden = (cats.length <= 1);
}

/**
 * Composition des grands terrains depuis la Config : { "Rugby 1": ["1","2","3"], … }.
 * Écrite par l'admin quand la répartition automatique est APPLIQUÉE aux catégories.
 * Absente (ancienne config, ou terrains saisis à la main) → {} : le filtre reste masqué.
 */
function lireGrandsTerrains(config) {
  try {
    const brut = config && config.global && config.global.repartition_grands_terrains;
    const map = brut ? JSON.parse(brut) : {};
    return (map && typeof map === 'object') ? map : {};
  } catch (e) { return {}; }
}

/**
 * Remplit le menu déroulant des grands terrains (option « Tous » + un par grand terrain,
 * avec ses numéros de mini-terrains en rappel). Ne propose que les grands terrains dont au
 * moins un mini-terrain a des matchs. Masqué s'il y a moins de deux grands terrains à choisir.
 */
function peuplerFiltreTerrain() {
  const bloc = document.getElementById('filtre-terrain-saisie');
  const sel = document.getElementById('select-terrain-saisie');
  if (!bloc || !sel) return;

  const utilises = {};
  matchs.forEach(function (m) { utilises[String(m.terrain)] = true; });
  const noms = Object.keys(grandsTerrains).filter(function (n) {
    return (grandsTerrains[n] || []).some(function (t) { return utilises[String(t)]; });
  });

  bloc.hidden = (noms.length < 2);
  if (bloc.hidden) { terrainActifSaisie = ''; return; }

  const memo = localStorage.getItem(CLE_TERRAIN_SAISIE) || '';
  terrainActifSaisie = (noms.indexOf(memo) >= 0) ? memo : '';

  sel.innerHTML = '<option value="">Tous les terrains</option>' + noms.map(function (n) {
    const minis = (grandsTerrains[n] || []).join(', ');
    return '<option value="' + echapper(n) + '"' + (n === terrainActifSaisie ? ' selected' : '') + '>' +
      echapper(n) + ' (terrains ' + echapper(minis) + ')</option>';
  }).join('');
}

/** Applique le filtre « grand terrain » à une liste de matchs (liste inchangée si « Tous »). */
function filtrerParTerrain(liste) {
  if (!terrainActifSaisie || !grandsTerrains[terrainActifSaisie]) return liste;
  const ok = {};
  grandsTerrains[terrainActifSaisie].forEach(function (t) { ok[String(t)] = true; });
  return liste.filter(function (m) { return ok[String(m.terrain)]; });
}

/** Nom lisible d'une équipe à partir de son identifiant (lecture O(1) dans l'index). */
function nomEquipe(id) {
  return Object.prototype.hasOwnProperty.call(nomParEquipe, id) ? nomParEquipe[id] : id;
}

/* libelleTourFr() est désormais dans commun.js (partagé avec tournoi.js). */

/** Vrai si le match est un match de Coupe (élimination directe). */
function estMatchCoupe(m) {
  return String(m.sous_tableau || '').toUpperCase() === 'COUPE';
}

/** Vrai si un match de Coupe est « en attente » : une des deux équipes n'est pas encore connue. */
function estEnAttente(m) {
  return estMatchCoupe(m) && (!m.equipe_A || !m.equipe_B);
}

/**
 * Titre lisible d'un match, affiché au bénévole pour qu'il comprenne l'enjeu :
 *  Coupe → « 🏆 Demi-finale — Coupe U12 » ; Plateau → « Plateau — U12 » ;
 *  Libre → « Match amical » ; Croisé → « Niveau 3 » ; Matin → « Poule A ».
 */
function contexteMatch(m) {
  if (estMatchCoupe(m)) return '🏆 ' + (libelleTourFr(m.tour) || 'Coupe') + ' — Coupe ' + m.categorie;
  if (String(m.sous_tableau || '').toUpperCase() === 'PLATEAU') return 'Plateau — ' + m.categorie;
  if (String(m.format || '').toUpperCase() === 'LIBRE') return 'Match amical';
  // Vocabulaire Super Challenge (Triangulaire/Quadrangulaire, Poule E/F/G) si la catégorie est en SCF.
  const catObj = categoriesSaisie.find(function (c) { return c.categorie === m.categorie; });
  const estClt = String(m.phase) === 'classement';
  const gl = groupeLabelScf(catObj, m.poule, tailleGroupeScf(matchs, m.categorie, m.poule), estClt);
  if (gl) return gl;
  // Vocabulaire « Poule haute / basse » si la catégorie est en POULES_NIVEAU (repli : Niveau N1).
  const pn = estClt ? libellePouleNiveau(catObj, m.poule, nbPoulesNiveauCat(matchs, m.categorie)) : null;
  if (pn) return pn;
  if (estClt) return 'Niveau ' + String(m.poule);
  return 'Poule ' + String(m.poule);
}

/** Rend les cartes d'une liste de matchs, triées par heure. */
function cartesMatchs(liste) {
  return liste.slice()
    .sort(function (a, b) { return String(a.heure_debut).localeCompare(String(b.heure_debut)); })
    .map(carteMatch).join('');
}

/** Rend une phase (matin ou après-midi) dans un accordéon. `replie` = fermé par défaut. */
function phaseAccordeon(titre, liste, replie, resume) {
  return '<details class="phase-accordeon"' + (replie ? '' : ' open') + '>' +
    '<summary class="planning-phase phase-sommaire">' + titre +
      ' <span class="phase-resume">(' + resume + ')</span></summary>' +
    '<div class="phase-contenu">' + cartesMatchs(liste) + '</div>' +
  '</details>';
}

/** Résumé affiché à côté du titre d'une phase (nombre restant / tout saisi). */
function resumePhase(restants, total) {
  return (restants === 0)
    ? 'tous saisis ✓ — cliquer pour voir / corriger'
    : restants + ' à saisir sur ' + total;
}

/**
 * Après une validation/correction, met à jour EN DIRECT l'accordéon de la phase du match :
 *   - décrémente le compteur « X à saisir » ;
 *   - replie la phase dès que son dernier score est saisi (après-midi → toujours ;
 *     matin → uniquement si l'après-midi est déjà généré).
 * Chirurgical : on ne réaffiche pas toute la liste (aucune saisie en cours n'est perdue).
 */
function majAccordeonPhase(carte) {
  const det = carte.closest('details.phase-accordeon');
  if (!det) return;
  const m = matchs.find(function (x) { return x.id_match === carte.getAttribute('data-id'); });
  if (!m) return;

  const estClassement = String(m.phase) === 'classement';
  // Même périmètre que l'affichage : catégorie active + filtre grand terrain éventuel.
  const memePhase = filtrerParTerrain(matchs.filter(function (x) {
    return x.categorie === categorieActiveSaisie && (String(x.phase) === 'classement') === estClassement;
  }));
  const restants = memePhase.filter(function (x) { return !estTermine(x.statut); }).length;
  const apremGenere = matchs.some(function (x) {
    return x.categorie === categorieActiveSaisie && String(x.phase) === 'classement';
  });

  // Compteur à jour (mêmes libellés que l'affichage initial).
  let resume;
  if (restants > 0) {
    resume = restants + ' à saisir sur ' + memePhase.length;
  } else if (estClassement) {
    resume = 'tous saisis ✓ — cliquer pour voir / corriger';
  } else {
    resume = 'tous saisis ✓' + (apremGenere ? ' — cliquer pour voir / corriger' : '');
  }
  const span = det.querySelector('.phase-resume');
  if (span) span.textContent = '(' + resume + ')';

  // Repli automatique quand la phase est bouclée.
  const replie = (restants === 0) && (estClassement || apremGenere);
  if (replie) det.open = false;
}

/**
 * Affiche la table de marque de LA catégorie active : matin (dans un accordéon) puis
 * après-midi. Le matin est replié par défaut uniquement quand il est ENTIÈREMENT saisi
 * ET que l'après-midi est généré (on le range pour se concentrer sur l'après-midi), mais
 * il reste ré-ouvrable d'un clic et ses scores restent corrigeables.
 */
function afficherMatchs() {
  const zone = document.getElementById('liste-matchs');
  if (!matchs.length) {
    document.getElementById('filtre-cat-saisie').hidden = true;
    zone.innerHTML = '<p class="vide">Aucun match. Génère d\'abord le planning dans l\'admin.</p>';
    return;
  }

  peuplerFiltreCat();     // remplit le menu + fixe categorieActiveSaisie
  peuplerFiltreTerrain(); // remplit le menu + fixe terrainActifSaisie

  const ms = filtrerParTerrain(
    matchs.filter(function (m) { return m.categorie === categorieActiveSaisie; }));
  const matin = ms.filter(function (m) { return String(m.phase) !== 'classement'; });
  const aprem = ms.filter(function (m) { return String(m.phase) === 'classement'; });

  const restantsMatin = matin.filter(function (m) { return !estTermine(m.statut); }).length;
  const restantsAprem = aprem.filter(function (m) { return !estTermine(m.statut); }).length;
  const apremGenere = aprem.length > 0;

  let html = '';
  // Objet catégorie (vocabulaire Super Challenge : Samedi/Dimanche au lieu de Matin/Après-midi).
  const catObjSaisie = categoriesSaisie.find(function (c) { return c.categorie === categorieActiveSaisie; });

  if (matin.length) {
    // Le matin se replie une fois entièrement saisi ET l'après-midi généré.
    const replie = (restantsMatin === 0) && apremGenere;
    const resume = (restantsMatin === 0)
      ? 'tous saisis ✓' + (apremGenere ? ' — cliquer pour voir / corriger' : '')
      : restantsMatin + ' à saisir sur ' + matin.length;
    html += phaseAccordeon(phaseLabelScf(catObjSaisie, false) || '🌅 Matin — poules', matin, replie, resume);
  }

  if (aprem.length) {
    // L'après-midi se replie quand tous ses matchs sont terminés (journée bouclée).
    const replie = (restantsAprem === 0);
    html += phaseAccordeon(phaseLabelScf(catObjSaisie, true) || titreApresMidi(aprem), aprem, replie,
      resumePhase(restantsAprem, aprem.length));
  }

  if (!matin.length && !aprem.length) {
    html = terrainActifSaisie
      ? '<p class="vide">Aucun match pour cette catégorie sur « ' + echapper(terrainActifSaisie) +
        ' ». Choisis « Tous les terrains » ou une autre catégorie.</p>'
      : '<p class="vide">Aucun match pour cette catégorie.</p>';
  }

  zone.innerHTML = html;
  initialiserDetailEtEcarts(); // totaux en points + alertes « 5 essais d'écart » des cartes rendues
}

/** Titre de l'accordéon après-midi, selon le format des matchs de la catégorie affichée. */
function titreApresMidi(aprem) {
  const formats = {};
  aprem.forEach(function (m) { formats[String(m.format || '').toUpperCase()] = true; });
  if (formats.COUPE_PLATEAU) return '🏉 Après-midi — Coupe & Plateau';
  if (formats.LIBRE) return '🏉 Après-midi — matchs amicaux';
  if (formats.POULES_NIVEAU) return '🏉 Après-midi — poules de niveau';
  if (formats.CROISE_DIAGONAL) return '🏉 Après-midi — classement croisé diagonal';
  return '🏉 Après-midi — classement croisé';
}

/** HTML d'une carte de match (contexte + saisie des 2 scores + départage + bouton). */
function carteMatch(m) {
  const contexte = contexteMatch(m);
  const coupe = estMatchCoupe(m);
  const libre = String(m.format || '').toUpperCase() === 'LIBRE';

  // Match de Coupe « en attente » : les 2 équipes ne sont pas encore connues → non saisissable.
  if (estEnAttente(m)) {
    return '' +
      '<div class="match match-attente" data-id="' + echapper(m.id_match) + '">' +
        '<div class="match-meta">' + echapper(m.heure_debut) + ' · Terrain ' + echapper(String(m.terrain)) +
          ' · ' + echapper(contexte) + '</div>' +
        '<div class="bandeau-attente">⏳ <strong>En attente</strong> : les deux équipes ne sont pas encore ' +
          'connues. Ce match se débloquera dès que les matchs précédents seront saisis.</div>' +
      '</div>';
  }

  const termine = estTermine(m.statut);
  const detail = tireAuBut(m.categorie); // saisie détaillée pilotée par la DONNÉE (tir au but), jamais le nom

  // Bandeau contextuel : amical (LIBRE) ou avertissement élimination directe (COUPE).
  let bandeau = '';
  if (libre) bandeau = '<div class="bandeau-amical">🎈 Match amical — sans classement (juste du temps de jeu)</div>';
  else if (coupe) bandeau = '<div class="bandeau-coupe">⚔️ Élimination directe : un vainqueur est obligatoire.</div>';

  // Départage (COUPE) : radios pour désigner le vainqueur en cas d'égalité au score.
  let departage = '';
  if (coupe) {
    const grp = 'vainqueur-' + echapper(m.id_match);
    const vA = (String(m.vainqueur) === String(m.equipe_A)) ? ' checked' : '';
    const vB = (String(m.vainqueur) === String(m.equipe_B)) ? ' checked' : '';
    const dis = termine ? ' disabled' : '';
    departage =
      '<div class="departage">' +
        '<span class="departage-lib">En cas d\'égalité, vainqueur :</span>' +
        '<label class="departage-opt"><input type="radio" name="' + grp + '" value="A"' + vA + dis + '> ' +
          echapper(nomEquipe(m.equipe_A)) + '</label>' +
        '<label class="departage-opt"><input type="radio" name="' + grp + '" value="B"' + vB + dis + '> ' +
          echapper(nomEquipe(m.equipe_B)) + '</label>' +
      '</div>';
  }

  const saisie = detail ? blocSaisieDetail(m, termine) : blocSaisieSimple(m, termine);

  return '' +
    '<div class="match' + (termine ? ' match-termine' : '') + (coupe ? ' match-coupe' : '') +
        (detail ? ' match-detail' : '') + '" data-id="' + echapper(m.id_match) + '">' +
      '<div class="match-meta">' + echapper(m.heure_debut) + ' · Terrain ' + echapper(String(m.terrain)) +
        ' · ' + echapper(contexte) +
        (libelleArbitreScf(m, nomEquipe) ? ' · <span class="arbitre-tag">🧑‍⚖️ ' + echapper(libelleArbitreScf(m, nomEquipe)) + '</span>' : '') +
        (termine ? ' · <span class="badge-ok">✓ terminé</span>' : '') + '</div>' +
      bandeau +
      '<div class="match-saisie">' +
        saisie +
        departage +
        '<div class="ecart-essais" hidden></div>' +
        '<button class="bouton bouton-valider" type="button">' + (termine ? 'Corriger' : 'Valider') + '</button>' +
      '</div>' +
      '<div class="message-form"></div>' +
    '</div>';
}

/** Saisie SIMPLE (historique) : un champ de score par équipe. Inchangée. */
function blocSaisieSimple(m, termine) {
  const sa = (m.score_A === '' || m.score_A == null) ? '' : m.score_A;
  const sb = (m.score_B === '' || m.score_B == null) ? '' : m.score_B;
  const champ = function (eqId, valeur) {
    return '<div class="eq-ligne">' +
      '<span class="eq">' + echapper(nomEquipe(eqId)) + '</span>' +
      '<input class="r-input score" type="number" min="0" inputmode="numeric" value="' +
        echapper(String(valeur)) + '"' + (termine ? ' disabled' : '') + '></div>';
  };
  return champ(m.equipe_A, sa) + champ(m.equipe_B, sb);
}

/** Un compteur « − valeur + » (gros boutons, usage debout au bord du terrain). */
function stepperDetail(nom, valeur, libelle, termine) {
  const dis = termine ? ' disabled' : '';
  return '<div class="det-champ">' +
    '<span class="det-lib">' + libelle + '</span>' +
    '<div class="det-pas-groupe">' +
      '<button type="button" class="det-pas" data-op="-1" data-cible="' + nom + '" aria-label="moins"' + dis + '>−</button>' +
      '<input class="det-input" name="' + nom + '" type="number" min="0" inputmode="numeric" value="' +
        echapper(String(valeur)) + '"' + dis + '>' +
      '<button type="button" class="det-pas" data-op="1" data-cible="' + nom + '" aria-label="plus"' + dis + '>+</button>' +
    '</div>' +
  '</div>';
}

/**
 * Saisie DÉTAILLÉE (tir au but) : par équipe, essais + transformations bien visibles (steppers),
 * pénalités et drops repliés derrière « Autres », et le TOTAL en points affiché en grand (calculé,
 * jamais saisi). Le backend recalcule score_A/score_B depuis ce détail (source de vérité).
 */
function blocSaisieDetail(m, termine) {
  const v = function (cle) { const x = m[cle]; return (x === '' || x == null) ? 0 : x; };
  const tete = function (suf, eqId) {
    return '<div class="det-equipe" data-eq="' + suf + '">' +
      '<div class="det-equipe-tete">' +
        '<span class="eq">' + echapper(nomEquipe(eqId)) + '</span>' +
        '<span class="det-total" data-eq="' + suf + '">0 pts</span>' +
      '</div>' +
      stepperDetail('essais_' + suf, v('essais_' + suf), '🏉 Essais', termine) +
      stepperDetail('transfo_' + suf, v('transfo_' + suf), '➕ Transf.', termine) +
    '</div>';
  };
  const autresEquipe = function (suf, eqId) {
    return '<div class="det-autres-eq">' +
      '<span class="det-autres-nom">' + echapper(nomEquipe(eqId)) + '</span>' +
      stepperDetail('pen_' + suf, v('pen_' + suf), '🎯 Pénalités', termine) +
      stepperDetail('drop_' + suf, v('drop_' + suf), '🦶 Drops', termine) +
    '</div>';
  };
  return '<div class="det-grille">' + tete('A', m.equipe_A) + tete('B', m.equipe_B) + '</div>' +
    '<details class="det-autres">' +
      '<summary>Autres (pénalités, drops)</summary>' +
      '<div class="det-autres-corps">' + autresEquipe('A', m.equipe_A) + autresEquipe('B', m.equipe_B) + '</div>' +
    '</details>';
}

/* ==========================================================================
   SCORE DÉTAILLÉ — calcul du total, alerte « 5 essais d'écart », steppers
   ========================================================================== */

/** Entier ≥ 0 d'une valeur, sinon null (vide / non entier / négatif). */
function entierPos(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return (isFinite(n) && n >= 0 && Math.floor(n) === n) ? n : null;
}

/** Valeur courante d'un compteur détail nommé dans une carte (0 si absent/vide). */
function valDetail(carte, nom) {
  const el = carte.querySelector('.det-input[name="' + nom + '"]');
  const n = el ? entierPos(el.value) : null;
  return (n == null) ? 0 : n;
}

/** Total EN POINTS d'une équipe (suffixe A/B) d'une carte détail — miroir du calcul backend. */
function totalDetailEquipe(carte, suf) {
  return valDetail(carte, 'essais_' + suf) * PTS_ESSAI +
         valDetail(carte, 'transfo_' + suf) * PTS_TRANSFO +
         valDetail(carte, 'pen_' + suf) * PTS_PENALITE +
         valDetail(carte, 'drop_' + suf) * PTS_DROP;
}

/** Rafraîchit les deux totaux en points (affichés en grand) d'une carte détail. */
function majTotauxDetail(carte) {
  ['A', 'B'].forEach(function (suf) {
    const el = carte.querySelector('.det-total[data-eq="' + suf + '"]');
    if (el) el.textContent = totalDetailEquipe(carte, suf) + ' pts';
  });
}

/**
 * Nombre d'ESSAIS connu d'une équipe pour l'alerte « 5 essais d'écart », ou null (alerte muette).
 * MIROIR de backend/Code.gs `essaisConnusEquipe` (garder synchrone). JAMAIS de faux positif :
 *  - détail rempli ⇒ essais ;
 *  - sinon, SEULEMENT si la catégorie est CONNUE pour NE PAS tirer au but (tirAuBut === false),
 *    le score EST le nombre d'essais (1 essai = 1 point) ;
 *  - sinon (tir au but, OU capacité INCONNUE) ⇒ rien : on ne devine jamais des essais depuis un
 *    total qui pourrait être en points.
 */
function essaisConnus(essaisVal, scoreVal, tirAuBut) {
  const e = entierPos(essaisVal);
  if (e !== null) return e;
  if (tirAuBut === false) { const s = entierPos(scoreVal); if (s !== null) return s; }
  return null;
}

/** (Re)calcule l'alerte « ≥ 5 essais d'écart » d'une carte. Informative, JAMAIS bloquante (§1.12). */
function majAlerteEcart(carte) {
  const zone = carte.querySelector('.ecart-essais');
  if (!zone) return;
  const id = carte.getAttribute('data-id');
  const m = matchs.find(function (x) { return x.id_match === id; });
  if (!m) { zone.hidden = true; zone.innerHTML = ''; return; }
  let ea, eb;
  if (carte.classList.contains('match-detail')) {
    ea = essaisConnus(valDetail(carte, 'essais_A'), null, true);
    eb = essaisConnus(valDetail(carte, 'essais_B'), null, true);
  } else {
    // Carte simple : le score ne vaut des essais QUE si la catégorie est CONNUE non-tir-au-but.
    // Capacité inconnue (backend pas encore redéployé) ⇒ tir = null ⇒ alerte muette (pas de faux positif).
    const tir = capaciteTirAuBut(m.categorie);
    const sc = carte.querySelectorAll('.score');
    ea = essaisConnus(null, sc[0] ? sc[0].value : '', tir);
    eb = essaisConnus(null, sc[1] ? sc[1].value : '', tir);
  }
  if (ea == null || eb == null) { zone.hidden = true; zone.innerHTML = ''; return; }
  const ecart = Math.abs(ea - eb);
  if (ecart >= 5) {
    zone.hidden = false;
    zone.innerHTML = '⚠️ <strong>' + ecart + ' essais d\'écart</strong> — pense au rééquilibrage (règle des 5 essais).';
  } else {
    zone.hidden = true; zone.innerHTML = '';
  }
}

/** Initialise totaux détail + alertes d'écart après un (ré)affichage de la liste. */
function initialiserDetailEtEcarts() {
  document.querySelectorAll('#liste-matchs .match').forEach(function (carte) {
    if (carte.classList.contains('match-detail')) majTotauxDetail(carte);
    majAlerteEcart(carte);
  });
}

/* Steppers − / + : borne à 0, recalcule total & alerte (délégation). */
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.det-pas');
  if (!btn || btn.disabled) return;
  const carte = btn.closest('.match');
  const input = carte.querySelector('.det-input[name="' + btn.getAttribute('data-cible') + '"]');
  if (!input || input.disabled) return;
  const cur = entierPos(input.value);
  let val = (cur == null ? 0 : cur) + (parseInt(btn.getAttribute('data-op'), 10) || 0);
  if (val < 0) val = 0;
  input.value = String(val);
  majTotauxDetail(carte);
  majAlerteEcart(carte);
});

/* Frappe directe (compteur détail OU score simple) : recalcule ce qui doit l'être. */
document.addEventListener('input', function (e) {
  const carte = e.target.closest('.match');
  if (!carte) return;
  if (e.target.classList.contains('det-input')) { majTotauxDetail(carte); majAlerteEcart(carte); }
  else if (e.target.classList.contains('score')) { majAlerteEcart(carte); }
});

/** Un seul écouteur pour tous les boutons « Valider / Corriger » (délégation d'événement). */
document.addEventListener('click', async function (evenement) {
  const bouton = evenement.target.closest('.bouton-valider');
  if (!bouton) return;

  const carte = bouton.closest('.match');
  const msg = carte.querySelector('.message-form');
  const enEdition = carte.classList.contains('match-edition');
  const verrouille = carte.classList.contains('match-termine') && !enEdition;

  // 1) Score validé (définitif) et verrouillé → « Corriger » redemande la clé scores
  //    (confirmation forte), puis déverrouille les champs sans encore rien envoyer.
  if (verrouille) {
    const cle = await demanderCleValide('scores', '🔒 Corriger un score définitif\n\nEntre la clé scores :');
    if (cle == null) return; // annulé → le score reste verrouillé
    deverrouiller(carte);
    afficherMessage(msg, 'Corrige le score puis valide.', 'ok');
    return;
  }

  // 2) Validation d'un nouveau score OU d'une correction.
  const id = carte.getAttribute('data-id');
  const detail = carte.classList.contains('match-detail');

  // Champs de score envoyés au backend : détail (8 compteurs, le backend calcule le score) OU
  // score simple (2 champs). Le backend est PILOTÉ PAR LA DONNÉE (présence du détail).
  let champsScore;
  if (detail) {
    champsScore = {
      essais_A: String(valDetail(carte, 'essais_A')),   essais_B: String(valDetail(carte, 'essais_B')),
      transfo_A: String(valDetail(carte, 'transfo_A')), transfo_B: String(valDetail(carte, 'transfo_B')),
      pen_A: String(valDetail(carte, 'pen_A')),         pen_B: String(valDetail(carte, 'pen_B')),
      drop_A: String(valDetail(carte, 'drop_A')),       drop_B: String(valDetail(carte, 'drop_B'))
    };
  } else {
    const inputs = carte.querySelectorAll('.score');
    const scoreA = inputs[0].value.trim();
    const scoreB = inputs[1].value.trim();
    if (scoreA === '' || scoreB === '') {
      afficherMessage(msg, 'Entre les deux scores.', 'ko');
      return;
    }
    champsScore = { score_A: scoreA, score_B: scoreB };
  }

  const m = matchs.find(function (x) { return x.id_match === id; });
  const coupe = carte.classList.contains('match-coupe');

  // Départage (COUPE) : traduit le radio A/B coché en identifiant d'équipe désignée vainqueur.
  let vainqueur = '';
  if (coupe && m) {
    const r = carte.querySelector('input[name^="vainqueur-"]:checked');
    if (r) vainqueur = (r.value === 'B') ? m.equipe_B : m.equipe_A;
  }

  // Envoi (facteur commun) : une correction porte modification:true ; une cascade forcerCascade:true.
  async function envoyer(forcerCascade) {
    const data = Object.assign({ id_match: id, modification: enEdition }, champsScore);
    if (coupe && vainqueur) data.vainqueur = vainqueur;
    if (forcerCascade) data.forcerCascade = true;
    return apiPostProtege('enregistrerScore', data, 'scores', 'de saisie des scores');
  }

  bouton.disabled = true;
  try {
    let res;
    try {
      res = await envoyer(false);
    } catch (err) {
      const info = err.reponse || {};
      // Correction en cascade : le résultat était déjà propagé vers un match lui-même joué.
      if (info.cascade_requise) {
        const ok = await dialogConfirmer(
          '⚠️ ' + err.message + '\n\nConfirmer la modification en cascade ?',
          { ok: 'Modifier quand même', annuler: 'Annuler', danger: true });
        if (!ok) { afficherMessage(msg, 'Correction annulée.', 'ko'); bouton.disabled = false; return; }
        res = await envoyer(true); // on réapplique en forçant la cascade
      } else {
        throw err; // départage requis, clé, etc. → message affiché plus bas
      }
    }

    // Score enregistré. En COUPE, la propagation a modifié d'autres matchs → on recharge la
    // liste pour que l'équipe gagnante apparaisse tout de suite dans le match suivant.
    if (m) {
      m.score_A = res.match.score_A; m.score_B = res.match.score_B; m.statut = 'terminé';
      // Détail éventuel (mode tir au but) : mémorise les compteurs recalculés côté serveur.
      if (res.detail) {
        ['essais_A', 'essais_B', 'transfo_A', 'transfo_B', 'pen_A', 'pen_B', 'drop_A', 'drop_B']
          .forEach(function (k) { if (res.match[k] != null) m[k] = res.match[k]; });
      }
    }
    if (coupe) {
      verrouiller(carte);
      afficherMessage(msg, 'Score enregistré ✓ — vainqueur propagé.', 'ok');
      await rafraichirSaisie(); // met à jour les matchs suivants (finale, petite finale…)
      return;
    }

    verrouiller(carte);
    afficherMessage(msg, 'Score enregistré ✓', 'ok');
    majAccordeonPhase(carte); // compteur à jour + repli auto dès le dernier score de la phase

    // Cohérence après-midi : corriger un score du MATIN alors que l'après-midi est déjà généré
    // peut fausser les niveaux (calculés sur le classement du matin). On alerte pour que
    // l'organisateur régénère l'après-midi.
    const estMatin = m && String(m.phase) !== 'classement';
    const apremGenere = matchs.some(function (x) { return String(x.phase) === 'classement'; });
    if (enEdition && estMatin && apremGenere) {
      await dialogAlerter(
        '⚠️ Tu viens de CORRIGER un score du matin, mais l\'après-midi est déjà généré.\n\n' +
        'Le classement du matin a peut-être changé → les niveaux de l\'après-midi risquent d\'être faussés.\n\n' +
        'Préviens l\'organisateur : il doit RÉGÉNÉRER l\'après-midi (page admin) pour rétablir les bons niveaux.');
    }
  } catch (err) {
    afficherMessage(msg, err.message, 'ko');
  } finally {
    bouton.disabled = false;
  }
});

/** Passe une carte en mode correction : champs déverrouillés, bouton « Valider la correction ». */
function deverrouiller(carte) {
  carte.classList.add('match-edition');
  carte.querySelectorAll('.score, .det-input, .det-pas').forEach(function (i) { i.disabled = false; });
  carte.querySelector('.bouton-valider').textContent = 'Valider la correction';
}

/** Verrouille une carte (score définitif) : champs grisés, bouton « Corriger », badge terminé. */
function verrouiller(carte) {
  carte.classList.remove('match-edition');
  carte.classList.add('match-termine');
  carte.querySelectorAll('.score, .det-input, .det-pas').forEach(function (i) { i.disabled = true; });
  carte.querySelector('.bouton-valider').textContent = 'Corriger';
  // Ajoute le badge « ✓ terminé » s'il n'y est pas encore.
  const meta = carte.querySelector('.match-meta');
  if (meta && meta.querySelector('.badge-ok') == null) {
    meta.insertAdjacentHTML('beforeend', ' · <span class="badge-ok">✓ terminé</span>');
  }
}

/* afficherMessage(), estTermine() et echapper() sont désormais dans commun.js. */

/* On lance tout une fois la page prête. */
document.addEventListener('DOMContentLoaded', initSaisie);
