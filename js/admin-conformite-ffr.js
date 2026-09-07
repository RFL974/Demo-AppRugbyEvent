/**
 * ============================================================================
 *  ADMIN — CONFORMITÉ FFR (référentiel RefFFR)
 * ============================================================================
 *  Deux restitutions, toutes deux INFORMATIVES (n'empêchent jamais de sauvegarder) :
 *   1) un bloc « Conformité FFR » sous la date du tournoi : résultat de
 *      verifierConformiteFFR (backend) — vert / orange / rouge ;
 *   2) la « Forme FFR attendue » (forme de jeu + effectif) dans chaque carte de
 *      réglage de catégorie, pour le mois du tournoi, avec un avertissement inline
 *      si l'effectif saisi est incohérent avec l'effectif FFR.
 *
 *  MIGRATION DOUCE : si le référentiel FFR est absent, un bandeau gris neutre est
 *  affiché et aucun contrôle n'est appliqué (l'app fonctionne comme avant).
 *
 *  Dépend de globaux définis ailleurs, accédés à l'appel :
 *   - commun.js : echapper
 *   - api.js    : apiGet
 *   - admin.js  : configCourante
 *  Chargé après admin.js et admin-reglages.js dans admin.html.
 * ============================================================================
 */

/* Référentiel FFR mémorisé (une seule requête par session, réutilisée par les cartes). */
var refFFRCache = null;

/* Dernier verdict de conformité (regles/temps) — mémorisé pour construire l'aperçu du bouton
   « Appliquer les valeurs FFR » au clic, sans nouvel appel réseau. */
var dernierResConformite = null;

/** Charge (et mémorise) le référentiel FFR. Migration douce : listes vides si indisponible. */
async function chargerRefFFR() {
  if (refFFRCache) return refFFRCache;
  try { refFFRCache = await apiGet('getRefFFR'); }
  catch (e) { refFFRCache = { formes: [], dates: [], regles: [], temps: [], millesime: null }; }
  return refFFRCache;
}

/* --------------------------------------------------------------------------
   VALEURS COURANTES (formulaire d'abord, sinon état enregistré)
   -------------------------------------------------------------------------- */

/** Date du tournoi actuellement saisie (ISO 'AAAA-MM-JJ'), sinon celle enregistrée, sinon ''.
 *  Lu par NOM (le champ vit dans la carte « Date & conformité FFR », #form-cadre-tournoi). */
function dateTournoiCourante() {
  const champ = document.querySelector('[name="tournoi_date"]');
  const v = champ ? champ.value : '';
  if (v) return v;
  const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
  return g.tournoi_date || '';
}

/** Zone de vacances courante (select de la carte cadre, sinon Config, défaut 'C'). Lu par NOM. */
function zoneVacancesCourante() {
  const champ = document.querySelector('[name="zone_vacances"]');
  const v = champ ? champ.value : '';
  if (v) return v;
  const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
  return g.zone_vacances || 'C';
}

/** Noms des catégories présentes (presente = 'oui'). */
function categoriesPresentesNoms() {
  const cats = (typeof configCourante !== 'undefined' && configCourante && configCourante.categories) || [];
  return cats.filter(function (c) { return String(c.presente).toLowerCase() === 'oui'; })
             .map(function (c) { return String(c.categorie || '').trim(); })
             .filter(Boolean);
}

/* --------------------------------------------------------------------------
   BLOC « CONFORMITÉ FFR » (sous la date du tournoi)
   -------------------------------------------------------------------------- */

/**
 * ⭐ M1-B2 / B2-0.3 — OUBLIER le verdict de conformité affiché.
 *
 * 🔬 Ce bloc se calcule à partir de la DATE du tournoi et des CATÉGORIES — deux choses qu'une
 * réinitialisation efface. Comme la feuille FFR, il n'est recalculé qu'à des moments précis :
 * laissé tel quel, il continuerait d'afficher le verdict de l'édition close.
 *
 * ⚠️ Et il ne suffit PAS d'oublier `configCourante` pour l'assainir : `dateTournoiCourante()` lit
 * D'ABORD le champ `tournoi_date` DANS LA PAGE. Si le ré-affichage échoue, ce champ porte encore
 * l'ancienne date, et un recalcul produirait un verdict faux — sur une date qui n'existe plus.
 * ⭐ D'où la règle appliquée par `onReinitialiser` : on efface toujours, et on ne recalcule QUE si
 * la relecture du serveur a réussi. Sinon la zone reste neutre — on montre moins, jamais du faux.
 */
function invaliderConformiteFFRAffichee() {
  const zone = document.getElementById('bloc-conformite-ffr');
  if (zone) {
    zone.innerHTML = '<div class="ffr-bloc ffr-neutre">Conformité FFR à recalculer — ' +
      'renseigne la date et les catégories du nouveau tournoi.</div>';
  }
}

/** (Re)calcule et affiche le bloc « Conformité FFR », puis rafraîchit les formes des cartes. */
async function majConformiteFFR() {
  const zone = document.getElementById('bloc-conformite-ffr');
  if (!zone) return;
  // Écouteur délégué posé UNE fois sur le conteneur (son innerHTML est remplacé à chaque calcul,
  // mais l'élément persiste) : gère les clics sur les boutons « Appliquer les valeurs FFR ».
  if (!zone._ffrAppliquerWired) { zone.addEventListener('click', onClicAppliquerFFR); zone._ffrAppliquerWired = true; }

  await chargerRefFFR(); // dispo du référentiel + formes pour les cartes

  const refVide = !refFFRCache ||
    ((refFFRCache.formes || []).length === 0 && (refFFRCache.dates || []).length === 0);
  if (refVide) {
    zone.innerHTML = '<div class="ffr-bloc ffr-neutre">Référentiel FFR non chargé — ' +
      'aucun contrôle de conformité n\'est appliqué.</div>';
    majFormesCategories();
    return;
  }

  const dateISO = dateTournoiCourante();
  if (!dateISO) {
    zone.innerHTML = '<div class="ffr-bloc ffr-neutre">Renseigne la date du tournoi pour ' +
      'vérifier la conformité avec le calendrier FFR.</div>';
    majFormesCategories();
    return;
  }

  zone.innerHTML = '<div class="ffr-bloc ffr-neutre">Vérification de la conformité FFR…</div>';
  let res;
  try {
    res = await apiGet('getConformiteFFR', {
      date: dateISO,
      categories: categoriesPresentesNoms().join(','),
      zone: zoneVacancesCourante()
    });
  } catch (e) {
    zone.innerHTML = '<div class="ffr-bloc ffr-neutre">Contrôle FFR indisponible pour le moment.</div>';
    return;
  }
  dernierResConformite = res; // mémorisé pour l'aperçu du bouton d'application
  zone.innerHTML = rendreConformiteFFR(res);
  majFormesCategories();
}

/** Construit le HTML du bloc à partir du résultat de verifierConformiteFFR. */
function rendreConformiteFFR(res) {
  if (!res || res.refDisponible === false) {
    return '<div class="ffr-bloc ffr-neutre">Référentiel FFR non chargé — ' +
      'aucun contrôle de conformité n\'est appliqué.</div>';
  }
  const mill = (refFFRCache && refFFRCache.millesime) ? refFFRCache.millesime : '2026-2027';
  let html = '';

  // COUVERTURE — si la date du tournoi est hors de la saison couverte par le référentiel, on
  // affiche un bandeau ORANGE explicite AVANT tout le reste. Rien n'a pu être comparé : le vert
  // « aucun conflit » est alors formellement interdit (voir la garde plus bas).
  const horsCouverture = !!(res.couverture && res.couverture.couverte === false);
  if (horsCouverture) {
    html += '<div class="ffr-bloc ffr-orange"><strong>⚠️ ' +
      echapper(messageCouvertureFFR(res)) + '</strong></div>';
  }

  if (res.bloquants && res.bloquants.length) {
    html += '<div class="ffr-bloc ffr-rouge"><strong>⛔ ' + res.bloquants.length +
      ' conflit(s) avec le calendrier FFR ' + echapper(mill) + '</strong><ul>' +
      res.bloquants.map(ligneConflitFFR).join('') + '</ul></div>';
  }
  // Points de vigilance métier — on EXCLUT l'avertissement de couverture (déjà affiché en bandeau
  // ci-dessus) pour ne pas le montrer deux fois.
  const averts = (res.avertissements || []).filter(function (a) { return !(a && a.couverture); });
  if (averts.length) {
    html += '<div class="ffr-bloc ffr-orange"><strong>⚠️ ' + averts.length +
      ' point(s) de vigilance</strong><ul>' +
      averts.map(ligneConflitFFR).join('') + '</ul></div>';
  }
  // GARDE : le bandeau vert ne peut apparaître QUE si la couverture est confirmée. On ne se
  // repose pas sur « la liste d'avertissements est vide » : on teste explicitement horsCouverture.
  if (!html && !horsCouverture) {
    html = '<div class="ffr-bloc ffr-vert">✅ Aucun conflit détecté avec le calendrier FFR ' +
      echapper(mill) + '.</div>';
  }
  // Prescriptions FFR par catégorie (terrain / effectif / temps / ballon / carton), sous le verdict.
  html += rendreDetailFFR(res);

  html += '<p class="ffr-note">Contrôle informatif : l\'organisateur reste décideur — ' +
    'la date peut être enregistrée malgré une alerte. Les valeurs FFR sont PROPOSÉES ; un ' +
    'signalement orange marque un réglage hors du cadre, il ne l\'interdit pas.</p>';
  return html;
}

/* --------------------------------------------------------------------------
   PRESCRIPTIONS FFR PAR CATÉGORIE (terrain / effectif / temps / ballon / carton)
   Doctrine « proposer, laisser la main, alerter » : on affiche la valeur FFR ;
   si le réglage de Config diverge, un badge orange le signale — jamais bloquant.
   -------------------------------------------------------------------------- */

/** dimensions_categories (zone A, JSON clé par catégorie de l'app) → objet, {} si absent/illisible. */
function dimensionsCategoriesFFR() {
  const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
  try { return g.dimensions_categories ? JSON.parse(g.dimensions_categories) : {}; }
  catch (e) { return {}; }
}

/** Objet catégorie de Config par nom (ex. 'U10'), ou {} si absent. */
function categorieConfigFFR(cat) {
  const cats = (typeof configCourante !== 'undefined' && configCourante && configCourante.categories) || [];
  return cats.filter(function (c) { return String(c.categorie || '').trim() === cat; })[0] || {};
}

/** Vrai si le réglage Config (non vide) diffère de la valeur FFR (comparaison numérique si possible). */
function ecartFFR(cfgVal, ffrVal) {
  const a = String(cfgVal == null ? '' : cfgVal).trim();
  const b = String(ffrVal == null ? '' : ffrVal).trim();
  if (a === '' || b === '') return false; // rien de saisi côté Config ⇒ pas de divergence signalée
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  if (isFinite(na) && isFinite(nb)) return na !== nb;
  return a !== b;
}

/** Badge orange « réglage actuel hors cadre » (valeur Config + rappel FFR). */
function badgeEcartFFR(cfgVal) {
  return ' <span class="ffr-attendu">⚠️ réglage actuel : ' + echapper(String(cfgVal)) + ' — hors cadre FFR</span>';
}

/** Une ligne « Label : valeur FFR » + badge d'écart éventuel. */
function ligneDetailFFR(label, valeurFFR, cfgVal, diverge) {
  if (valeurFFR === '' || valeurFFR == null) return '';
  return '<div class="ffr-ligne"><span class="ffr-ligne-label">' + echapper(label) + '</span> ' +
    '<span class="ffr-ligne-val">' + echapper(String(valeurFFR)) + '</span>' +
    (diverge ? badgeEcartFFR(cfgVal) : '') + '</div>';
}

/** Restitution complète : une carte par catégorie présente ayant des prescriptions. */
function rendreDetailFFR(res) {
  const regles = (res && res.regles) || {};
  const temps = (res && res.temps) || {};
  const cats = categoriesPresentesNoms().filter(function (c) { return regles[c] || temps[c]; });
  if (!cats.length) return '';
  const dims = dimensionsCategoriesFFR();
  let html = '<div class="ffr-bloc ffr-neutre ffr-detail"><strong>📋 Prescriptions FFR par catégorie</strong>';
  cats.forEach(function (cat) {
    const cfg = categorieConfigFFR(cat);
    html += '<div class="ffr-detail-cat"><span class="ffr-detail-titre">' + echapper(cat) + '</span>' +
      detailReglesFFR(regles[cat] || [], cfg, dims[cat]) +
      detailTempsFFR(temps[cat], cfg) +
      boutonsAppliquerFFR(cat, regles[cat] || [], temps[cat], cfg, dims[cat]) +
      '</div>';
  });
  return html + '</div>';
}

/** Terrain / effectif / ballon / carton, à partir des règles jointes (souvent une seule). */
function detailReglesFFR(regles, cfg, dim) {
  if (!regles.length) return '';
  let html = '';
  regles.forEach(function (r) {
    // Terrain : dimensions chiffrées, sinon libellé (« terrain normal » EST la donnée FFR).
    if (r.terrain_longueur_m && r.terrain_largeur_m) {
      const ffrDim = r.terrain_longueur_m + ' × ' + r.terrain_largeur_m + ' m';
      const diverge = dim && (ecartFFR(dim.l, r.terrain_longueur_m) || ecartFFR(dim.w, r.terrain_largeur_m));
      const cfgDim = dim ? ((dim.l || '?') + ' × ' + (dim.w || '?') + ' m') : '';
      html += ligneDetailFFR('Terrain', ffrDim, cfgDim, diverge);
    } else if (r.terrain_libelle) {
      html += ligneDetailFFR('Terrain', r.terrain_libelle, '', false);
    }
    // Effectifs : sur le terrain + maximum sur la feuille (comparé à effectif_max de Config).
    const eff = [r.effectif_terrain ? r.effectif_terrain + ' sur le terrain' : '',
                 r.effectif_max_feuille ? r.effectif_max_feuille + ' max sur la feuille' : '']
                .filter(Boolean).join(' · ');
    html += ligneDetailFFR('Effectif', eff, cfg.effectif_max, ecartFFR(cfg.effectif_max, r.effectif_max_feuille));
    html += ligneDetailFFR('Ballon', r.ballon, '', false);
    html += ligneDetailFFR('Carton jaune', r.carton_jaune_min ? r.carton_jaune_min + ' min' : '', '', false);
  });
  return html;
}

/**
 * Temps de jeu MAXIMUM par joueur (borne haute : si un joueur joue l'intégralité des matchs).
 * Le libellé DOIT le dire : l'app connaît les matchs par équipe, pas par joueur (session 8, §4.5).
 * Sous le plafond → neutre + marge ; au-dessus → orange + dépassement ; matchs inconnus → muet.
 */
function lignePrevisionnelFFR(p) {
  if (!p) return ''; // planning non généré : aucun calcul, aucune alerte
  const label = '🧒 Temps de jeu max / joueur <span class="ffr-note-inline">(si un joueur joue l\'intégralité des matchs)</span>';

  // Portée du total : NE JAMAIS présenter un prédit comme un constaté.
  let portee = '';
  if (p.nature === 'predit') {
    portee = '<span class="ffr-note-inline"> — journée entière (prévu) : ' + (p.matinMatchs + p.apremMatchs) +
      ' matchs/équipe (' + p.matinMatchs + ' constatés le matin + ' + p.apremMatchs + ' prévus l\'après-midi)</span>';
  } else if (p.nature === 'constate') {
    portee = '<span class="ffr-note-inline"> — journée entière (constaté)</span>';
  } else if (p.nature === 'minimum') {
    portee = '<span class="ffr-note-inline"> — minimum connu : ' + p.matinMatchs + ' le matin + au moins ' +
      p.apremMatchs + ' l\'après-midi (non encore planifié)</span>';
  } else if (p.nature === 'partiel') {
    // Format sans formule déclarée (inconnu, vide, COUPE_PLATEAU) : après-midi non prédit — chemin prudent.
    portee = '<span class="ffr-note-inline"> — matin seul : ' + p.matinMatchs +
      ' matchs/équipe ; après-midi non prédit (format sans formule)</span>';
  }

  const ouvre = function (cls) { return '<div class="ffr-ligne' + (cls ? ' ' + cls : '') +
    '"><span class="ffr-ligne-label">' + label + '</span> <span class="ffr-ligne-val">'; };
  const ferme = '</span></div>';

  // Dépassement : concluable dans TOUS les cas (un total partiel qui dépasse déjà le restera).
  if (p.plafond != null && p.depasse) {
    const q = p.complet ? (p.nature === 'predit' ? 'total prévu' : 'total constaté') : 'minimum déjà atteint';
    return ouvre('ffr-orange') + '<strong>' + p.minutes + ' min</strong> — dépasse le plafond de ' +
      p.plafond + ' min de <strong>' + p.depassement + ' min</strong> ⚠️ (' + q + ')' + portee + ferme;
  }

  // Total PARTIEL / borne basse sous le plafond : ne conclut PAS (mieux vaut ne rien conclure).
  if (!p.complet) {
    return ouvre('') + '<strong>' + p.minutes + ' min</strong> sur la phase connue — l\'après-midi n\'est pas ' +
      'encore planifié, le total de la journée sera supérieur.' +
      (p.plafond != null ? ' Plafond de sécurité : ' + p.plafond + ' min.' : '') + portee + ferme;
  }

  // Total COMPLET (constaté ou prédit par formule exacte) sous le plafond : conclusion + marge.
  if (p.plafond != null) {
    let s = '<strong>' + p.minutes + ' min</strong> — sous le plafond de ' + p.plafond + ' min (marge ' + p.marge + ' min)';
    if (p.margeFaible) s += ' ⚠️ marge faible — tout match supplémentaire fait dépasser';
    return ouvre('') + s + portee + ferme;
  }
  return ouvre('') + '<strong>' + p.minutes + ' min</strong> (aucun plafond FFR publié)' + portee + ferme;
}

/** Temps : plafond (sécurité) + variantes de découpage, avec écarts vs Config sur l'union des valeurs. */
function detailTempsFFR(t, cfg) {
  if (!t) return '';
  let html = '';
  // Plafond de temps de jeu par joueur — contrainte de SÉCURITÉ, toujours en tête.
  if (t.plafond_joueur_min) {
    html += '<div class="ffr-ligne"><span class="ffr-ligne-label">⏱ Plafond de temps de jeu / joueur</span> ' +
      '<span class="ffr-ligne-val"><strong>' + echapper(t.plafond_joueur_min) + ' min</strong> (sécurité)</span></div>';
  }
  // Temps de jeu PRÉVISIONNEL — borne haute (si un joueur joue TOUT). Contrôle de sécurité AVANT le
  // tournoi (session 8). Muet si le planning n'est pas généré (matchs/équipe inconnus).
  html += lignePrevisionnelFFR(t.previsionnel);
  const grilles = t.grilles || [];
  if (!grilles.length) {
    html += '<div class="ffr-ligne"><span class="ffr-ligne-val">La FFR ne publie pas de grille de temps ' +
      'au-delà de 6 équipes — seul le plafond de sécurité s\'applique.</span></div>';
    return html;
  }
  // Chaque variante (A/B) : découpage également valide — on affiche les deux, on ne choisit pas.
  grilles.forEach(function (g) {
    const v = g.variante ? 'Variante ' + g.variante + ' : ' : '';
    const bits = [];
    if (g.nb_periodes && g.duree_periode_min) bits.push(g.nb_periodes + ' × ' + g.duree_periode_min + ' min');
    if (g.pause_periodes_min) bits.push('pause ' + g.pause_periodes_min + ' min');
    if (g.arret_entre_matchs_min) bits.push('arrêt ' + g.arret_entre_matchs_min + ' min entre matchs');
    if (g.rencontres_par_equipe) bits.push(g.rencontres_par_equipe + ' rencontres/équipe');
    html += '<div class="ffr-ligne"><span class="ffr-ligne-label">Temps</span> ' +
      '<span class="ffr-ligne-val">' + echapper(v + bits.join(' · ')) + '</span></div>';
  });
  // Écarts Config vs UNION des valeurs FFR (le réglage doit correspondre à AU MOINS une variante).
  html += ecartTempsFFR('Nb de périodes', cfg.format_mi_temps, grilles, 'nb_periodes');
  html += ecartTempsFFR('Durée de période', cfg.duree_mi_temps_min, grilles, 'duree_periode_min');
  html += ecartTempsFFR('Pause entre périodes', cfg.pause_mi_temps_min, grilles, 'pause_periodes_min');
  html += ecartTempsFFR('Arrêt entre matchs', cfg.recup_entre_matchs_min, grilles, 'arret_entre_matchs_min');
  return html;
}

/** Signale un écart si le réglage Config ne correspond à AUCUNE des variantes FFR pour ce champ. */
function ecartTempsFFR(label, cfgVal, grilles, champ) {
  const cfg = String(cfgVal == null ? '' : cfgVal).trim();
  if (cfg === '') return '';
  const valeurs = grilles.map(function (g) { return String(g[champ] || '').trim(); })
                         .filter(Boolean)
                         .filter(function (v, i, a) { return a.indexOf(v) === i; });
  if (!valeurs.length) return '';
  const dansLeCadre = valeurs.some(function (v) { return !ecartFFR(cfg, v); });
  if (dansLeCadre) return '';
  return '<div class="ffr-ligne"><span class="ffr-attendu">⚠️ ' + echapper(label) + ' : réglage ' +
    echapper(cfg) + ' hors cadre FFR (attendu ' + echapper(valeurs.join(' ou ')) + ')</span></div>';
}

/**
 * Message du bandeau de couverture. On réutilise en priorité le libellé de l'avertissement
 * poussé par le backend (source unique, déjà formaté) ; à défaut on le reconstruit à partir des
 * bornes de `res.couverture` et de la date du tournoi courante.
 */
function messageCouvertureFFR(res) {
  const a = (res.avertissements || []).filter(function (x) { return x && x.couverture; })[0];
  if (a && a.libelle) return a.libelle;
  const c = res.couverture || {};
  const d = c.debut ? dateCourteFrFFR(c.debut) : '?';
  const f = c.fin ? dateCourteFrFFR(c.fin) : '?';
  const dj = dateCourteFrFFR(dateTournoiCourante());
  return 'La date du tournoi (' + dj + ') est en dehors de la période couverte par le ' +
    'référentiel FFR chargé (du ' + d + ' au ' + f + '). Aucun contrôle de date n\'a pu être effectué.';
}

/** Une ligne de conflit (date + libellé + motif). */
function ligneConflitFFR(item) {
  const d = item.date ? echapper(dateCourteFrFFR(item.date)) + ' — ' : '';
  const lib = item.libelle ? '<strong>' + echapper(item.libelle) + '</strong>' : '';
  const motif = item.motif ? ' <span class="ffr-motif">' + echapper(item.motif) + '</span>' : '';
  return '<li>' + d + lib + motif + '</li>';
}

/** 'AAAA-MM-JJ' → 'JJ/MM/AAAA' (sans dépendre du fuseau). */
function dateCourteFrFFR(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : String(iso);
}

/* --------------------------------------------------------------------------
   « FORME FFR ATTENDUE » dans les cartes de réglage par catégorie
   -------------------------------------------------------------------------- */

/**
 * Clé de catégorie canonique (miroir du backend normaliserCategorie) : apparie M↔U.
 *   M8/U8 → '8' · M10/U10 → '10' · M15F/U15F → '15F'. Le référentiel FFR reste en M…,
 *   l'app en U… : on n'apparie jamais par égalité exacte.
 */
function normaliserCategorieFFR(valeur) {
  const s = String(valeur == null ? '' : valeur).trim().toUpperCase();
  if (s === '') return '';
  return s.replace(/^[MU](?=\d)/, '');
}

/** Ligne de forme FFR pour une catégorie au mois de la date du tournoi, ou null. */
function formeAttendueFFR(categorie, dateISO) {
  if (!refFFRCache || !dateISO) return null;
  const mois = String(dateISO).slice(0, 7);
  const cle = normaliserCategorieFFR(categorie);
  const formes = refFFRCache.formes || [];
  for (let i = 0; i < formes.length; i++) {
    const f = formes[i];
    let fmois = String(f.mois || '').trim();
    if (fmois.length > 7) fmois = fmois.slice(0, 7); // tolère une date complète
    if (normaliserCategorieFFR(f.categorie) === cle && fmois === mois) return f;
  }
  return null;
}

/**
 * Remplit la zone « Forme FFR attendue » de chaque carte catégorie (placeholder
 * .ffr-forme[data-cat] posé par formulaireCategorie), avec l'avertissement d'effectif.
 */
function majFormesCategories() {
  const dateISO = dateTournoiCourante();
  // Ce rendu INJECTE des contrôles dans les cartes catégorie (le select « Forme de jeu retenue »),
  // et il arrive APRÈS le chargement du référentiel FFR — donc après que l'assistant a pris sa
  // photo de référence. Sans précaution, la carte paraît « modifiée » alors que personne n'y a
  // touché : la barre latérale verrouillait Équipes, Terrains, Poules… et il fallait
  // ré-enregistrer les catégories pour s'en sortir. On note donc quelles cartes étaient PROPRES
  // AVANT l'injection, pour ne re-photographier que celles-là — une vraie saisie en cours garde
  // son avertissement.
  const propresAvant = [];
  document.querySelectorAll('form.form-categorie').forEach(function (f) {
    if (typeof assistantEstPropre !== 'function' || assistantEstPropre(f)) propresAvant.push(f);
  });

  document.querySelectorAll('.ffr-forme[data-cat]').forEach(function (el) {
    const cat = el.getAttribute('data-cat');
    const f = formeAttendueFFR(cat, dateISO);
    if (!f) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    const forme = String(f.forme_jeu || '').trim();
    const eff = String(f.effectif || '').trim();
    const libelle = [forme, eff].filter(Boolean).join(' — ') || '—';
    const autor = String(f.tournoi_autorise || '').trim().toUpperCase();
    let badge = '';
    if (autor === 'NON') badge = ' <span class="ffr-tag ffr-tag-rouge">tournoi non autorisé</span>';
    else if (autor === 'LIMITE') badge = ' <span class="ffr-tag ffr-tag-orange">format limité</span>';
    el.innerHTML =
      '<span class="ffr-forme-libelle">Forme FFR attendue : <strong>' + echapper(libelle) + '</strong></span>' +
      badge + alerteEffectifFFR(cat, eff);
  });
  majFormeChoixCategories(dateISO);
  majBoutonNormeCategories();

  // Les contrôles injectés font désormais partie de l'état ENREGISTRÉ des cartes qui étaient
  // propres : on reprend leur photo (sans recalculer le verrou à chaque carte), puis on
  // rafraîchit la barre latérale une seule fois.
  if (typeof assistantRephotographier === 'function') {
    propresAvant.forEach(function (f) {
      if (f.isConnected) assistantRephotographier(f);
    });
    if (typeof assistantMajVerrou === 'function') assistantMajVerrou();
  }
}

/* --------------------------------------------------------------------------
   BOUTON « APPLIQUER LA NORME FFR » dans la carte de réglage (session 16)
   Même flux backend que l'écran Conformité (appliquerValeursFFR — source unique),
   mais AMENÉ DANS LA CARTE et affiché dès qu'un champ est VIDE ou divergent (pas
   seulement divergent), pour couvrir une catégorie neuve créée vierge.
   -------------------------------------------------------------------------- */

/** Vrai si le champ doit être (re)rempli : valeur FFR connue ET réglage vide OU divergent. */
function champVideOuEcartFFR(cfgVal, ffrVal) {
  const b = String(ffrVal == null ? '' : ffrVal).trim();
  if (b === '') return false;                 // pas de valeur FFR pour ce champ ⇒ rien à proposer
  const a = String(cfgVal == null ? '' : cfgVal).trim();
  if (a === '') return true;                  // champ vide + valeur FFR dispo ⇒ à remplir
  return ecartFFR(a, b);                      // sinon : signalé seulement s'il diverge
}

/** Variante « temps » : les grilles peuvent offrir plusieurs valeurs acceptables (variantes A/B). */
function champTempsVideOuEcartFFR(cfgVal, grilles, champ) {
  const valeurs = (grilles || []).map(function (g) { return String(g[champ] || '').trim(); })
    .filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
  if (!valeurs.length) return false;
  const cfg = String(cfgVal == null ? '' : cfgVal).trim();
  if (cfg === '') return true;                 // vide + grille dispo ⇒ à remplir
  return !valeurs.some(function (v) { return !ecartFFR(cfg, v); }); // dans aucune valeur ⇒ hors cadre
}

/** Y a-t-il au moins un champ temps/effectif à remplir ou à corriger pour cette catégorie ? */
function categorieAAppliquerFFR(r, temps, cfg, dim) {
  if (r) {
    const effTerrain = String(r.effectif_terrain == null ? '' : r.effectif_terrain).match(/^\d+/);
    if (effTerrain && champVideOuEcartFFR(cfg.effectif_min, effTerrain[0])) return true;
    if (champVideOuEcartFFR(cfg.effectif_max, r.effectif_max_feuille)) return true;
    if (!(dim && dim.plein === true) && r.terrain_longueur_m && r.terrain_largeur_m &&
        (champVideOuEcartFFR(dim && dim.l, r.terrain_longueur_m) ||
         champVideOuEcartFFR(dim && dim.w, r.terrain_largeur_m))) return true;
  }
  const grilles = (temps && temps.grilles) || [];
  if (grilles.length) {
    if (champTempsVideOuEcartFFR(cfg.format_mi_temps, grilles, 'nb_periodes')) return true;
    if (champTempsVideOuEcartFFR(cfg.duree_mi_temps_min, grilles, 'duree_periode_min')) return true;
    if (champTempsVideOuEcartFFR(cfg.pause_mi_temps_min, grilles, 'pause_periodes_min')) return true;
    if (champTempsVideOuEcartFFR(cfg.recup_entre_matchs_min, grilles, 'arret_entre_matchs_min')) return true;
  }
  return false;
}

/** Bouton(s) « Appliquer la norme FFR » d'une carte, ou '' si rien à proposer. */
function boutonNormeFFRCarte(cat) {
  const res = dernierResConformite;
  if (!res) return '';                         // conformité pas encore calculée ⇒ pas de bouton
  const regles = (res.regles || {})[cat] || [];
  const temps = (res.temps || {})[cat] || null;
  if (!regles.length && !temps) return '';     // rien de FFR pour cette catégorie ce mois-ci
  // Ambiguïté réglementaire non levée (ex. U14 10x10|15x15, aucune forme retenue) : on ne tranche
  // jamais par défaut (doctrine §1.12) — on renvoie vers le choix de la forme retenue.
  if (regles.length > 1) {
    return '<p class="ffr-attendu">Plusieurs formes de jeu ce mois-ci — choisis la <strong>forme de jeu ' +
      'retenue</strong> ci-dessus puis enregistre pour appliquer la norme FFR.</p>';
  }
  const r = regles[0] || null;
  const cfg = categorieConfigFFR(cat);
  const dim = dimensionsCategoriesFFR()[cat];
  if (!categorieAAppliquerFFR(r, temps, cfg, dim)) return ''; // déjà aligné ⇒ rien à faire
  const grilles = (temps && temps.grilles) || [];
  const catAttr = echapper(cat);
  const aide = '<p class="ffr-appliquer-aide">Remplit les effectifs (et, si 3 à 6 équipes sont ' +
    'engagées, les durées de jeu) avec la norme FFR du mois. Modifiable ensuite.</p>';
  if (grilles.length > 1) {
    // Variantes A/B : un bouton par découpage, jamais de choix par défaut.
    return aide + grilles.map(function (g) {
      const lib = (g.nb_periodes && g.duree_periode_min)
        ? (g.nb_periodes + ' × ' + g.duree_periode_min + ' min') : ('variante ' + g.variante);
      return '<button type="button" class="ffr-appliquer" data-cat="' + catAttr + '" data-variante="' +
        echapper(g.variante || '') + '">Appliquer la norme FFR — ' + echapper(lib) + '</button>';
    }).join('');
  }
  const v = grilles.length ? (grilles[0].variante || '') : '';
  return aide + '<button type="button" class="ffr-appliquer" data-cat="' + catAttr + '" data-variante="' +
    echapper(v) + '">Appliquer la norme FFR</button>';
}

/** Remplit le placeholder .ffr-appliquer-carte de chaque carte catégorie. */
function majBoutonNormeCategories() {
  document.querySelectorAll('.ffr-appliquer-carte[data-cat]').forEach(function (el) {
    const html = boutonNormeFFRCarte(el.getAttribute('data-cat'));
    el.innerHTML = html;
    el.hidden = !html;
  });
  majAlertesTempsCategories();
}

/* --------------------------------------------------------------------------
   ALERTE « HORS CADRE FFR » EN DIRECT sur les champs de temps d'une carte.
   Non bloquante : purement informative, à la frappe. Lit la valeur SAISIE dans
   le formulaire (pas le réglage enregistré), pour signaler dès qu'on sort du cadre.
   -------------------------------------------------------------------------- */

/** Sélecteur CSS échappé pour un nom de catégorie (ex. « U15F »). */
function selCategorieFFR(cat) { return (window.CSS && CSS.escape) ? CSS.escape(cat) : cat; }

/** Recalcule l'alerte temps d'UNE carte à partir des valeurs actuellement saisies. */
function majAlerteTempsCategorie(cat) {
  const el = document.querySelector('.ffr-alerte-temps[data-cat="' + selCategorieFFR(cat) + '"]');
  if (!el) return;
  const temps = dernierResConformite && (dernierResConformite.temps || {})[cat];
  const grilles = (temps && temps.grilles) || [];
  const form = document.querySelector('form.form-categorie[data-cat="' + selCategorieFFR(cat) + '"]');
  if (!grilles.length || !form) { el.innerHTML = ''; el.hidden = true; return; }
  function val(name) { const c = form.querySelector('[name="' + name + '"]'); return c ? c.value : ''; }
  const html =
    ecartTempsFFR('Nombre de période', val('format_mi_temps'), grilles, 'nb_periodes') +
    ecartTempsFFR('Durée de la période', val('duree_mi_temps_min'), grilles, 'duree_periode_min') +
    ecartTempsFFR('Pause entre deux périodes', val('pause_mi_temps_min'), grilles, 'pause_periodes_min') +
    ecartTempsFFR('Récup. entre matchs', val('recup_entre_matchs_min'), grilles, 'arret_entre_matchs_min');
  el.innerHTML = html;
  el.hidden = !html;
}

/** Recalcule l'alerte temps de TOUTES les cartes (après (re)rendu ou calcul de conformité). */
function majAlertesTempsCategories() {
  document.querySelectorAll('.ffr-alerte-temps[data-cat]').forEach(function (el) {
    majAlerteTempsCategorie(el.getAttribute('data-cat'));
  });
}

/**
 * Éclate la ligne de forme du mois (RefFFR_Formes) en formes distinctes { forme_jeu, effectif,
 * libelle }. Miroir front de eclaterFormesFFR (backend) : `forme_jeu` et `effectif` peuvent porter
 * plusieurs valeurs séparées par « | » (produit cartésien). Le libellé « forme_jeu — effectif » est
 * la clé partagée avec le backend (libelleFormeFFR) — même identité des deux côtés.
 */
function formesDuMoisFFR(f) {
  if (!f) return [];
  function valeurs(v) {
    return String(v == null ? '' : v).split('|').map(function (x) { return x.trim(); })
      .filter(function (x) { return x !== ''; });
  }
  let formes = valeurs(f.forme_jeu); if (!formes.length) formes = [''];
  let effs = valeurs(f.effectif); if (!effs.length) effs = [''];
  const out = [], vus = {};
  formes.forEach(function (fo) {
    effs.forEach(function (ef) {
      const libelle = [fo, ef].filter(Boolean).join(' — ');
      if (libelle && !vus[libelle]) { vus[libelle] = true; out.push({ forme_jeu: fo, effectif: ef, libelle: libelle }); }
    });
  });
  return out;
}

/**
 * Remplit le select « Forme de jeu retenue » de chaque carte catégorie (placeholder
 * .ffr-forme-choix[data-cat], data-value = valeur stockée). Options = formes du mois pour la
 * catégorie + option vide « non précisée ». Doctrine §1.12 : JAMAIS bloquant — si la valeur stockée
 * ne correspond à aucune forme du mois, elle est conservée comme option et SIGNALÉE en orange.
 */
function majFormeChoixCategories(dateISO) {
  document.querySelectorAll('.ffr-forme-choix[data-cat]').forEach(function (el) {
    const cat = el.getAttribute('data-cat');
    const stocke = String(el.getAttribute('data-value') || '').trim();
    const formes = formesDuMoisFFR(formeAttendueFFR(cat, dateISO));
    if (!formes.length) { el.innerHTML = ''; el.hidden = true; return; } // migration douce : rien à proposer
    el.hidden = false;

    const connues = formes.map(function (x) { return x.libelle; });
    const horsMois = stocke !== '' && connues.indexOf(stocke) === -1;

    let options = '<option value="">— non précisée —</option>';
    formes.forEach(function (x) {
      options += '<option value="' + echapper(x.libelle) + '"' +
        (x.libelle === stocke ? ' selected' : '') + '>' + echapper(x.libelle) + '</option>';
    });
    // Valeur stockée hors du mois : on la GARDE en option (sélectionnée) pour ne jamais l'effacer
    // silencieusement à l'enregistrement — le signalement orange suffit (jamais un blocage).
    if (horsMois) {
      options += '<option value="' + echapper(stocke) + '" selected>' + echapper(stocke) + ' (hors du mois)</option>';
    }

    el.innerHTML =
      '<label class="reglage"><span class="r-libelle">Forme de jeu retenue (FFR)</span>' +
        '<select class="r-input" name="forme_jeu">' + options + '</select>' +
      '</label>' +
      (horsMois
        ? '<span class="ffr-attendu">⚠️ La forme retenue « ' + echapper(stocke) + ' » ne correspond à ' +
          'aucune forme FFR de ce mois pour ' + echapper(cat) + '. Vérifie (choix conservé, non bloquant).</span>'
        : '');
  });
}

/** Avertissement inline si l'effectif min/max saisi ne couvre pas l'effectif FFR (ex. 7 pour '7x7'). */
function alerteEffectifFFR(cat, effFFR) {
  const n = parseInt(String(effFFR).replace(/[^\d].*$/, ''), 10); // '7x7' → 7
  if (!isFinite(n) || n <= 0) return '';
  const sel = (window.CSS && CSS.escape) ? CSS.escape(cat) : cat;
  const form = document.querySelector('form.form-categorie[data-cat="' + sel + '"]');
  if (!form) return '';
  const champMin = form.querySelector('[name="effectif_min"]');
  const champMax = form.querySelector('[name="effectif_max"]');
  const min = parseInt(champMin ? champMin.value : '', 10);
  const max = parseInt(champMax ? champMax.value : '', 10);
  const incoherent = (isFinite(min) && min > n) || (isFinite(max) && max < n);
  if (!incoherent) return '';
  return ' <span class="ffr-alerte-eff">⚠️ Effectif FFR attendu : ' + n +
    ' joueurs (' + echapper(String(effFFR)) + ')</span>';
}

/* --------------------------------------------------------------------------
   BOUTON « APPLIQUER LES VALEURS FFR » (session 6)
   Une catégorie à la fois, jamais automatique, jamais un choix par défaut
   devant une ambiguïté (doctrine §1.12). Le clic passe par une confirmation
   champ par champ, puis l'action backend appliquerValeursFFR (qui redérive
   les valeurs elle-même — le front n'envoie que catégorie + date + variante).
   -------------------------------------------------------------------------- */

/** Vrai si au moins un champ (dimensions, effectif feuille, ou temps) diverge de la valeur FFR. */
function categorieAUnEcartFFR(r, temps, cfg, dim) {
  if (r) {
    if (r.terrain_longueur_m && r.terrain_largeur_m && dim && !(dim.plein === true) &&
        (ecartFFR(dim.l, r.terrain_longueur_m) || ecartFFR(dim.w, r.terrain_largeur_m))) return true;
    const effTerrain = String(r.effectif_terrain == null ? '' : r.effectif_terrain).match(/^\d+/);
    if (effTerrain && ecartFFR(cfg.effectif_min, effTerrain[0])) return true;
    if (ecartFFR(cfg.effectif_max, r.effectif_max_feuille)) return true;
  }
  const grilles = (temps && temps.grilles) || [];
  if (grilles.length) {
    if (ecartTempsFFR('', cfg.format_mi_temps, grilles, 'nb_periodes')) return true;
    if (ecartTempsFFR('', cfg.duree_mi_temps_min, grilles, 'duree_periode_min')) return true;
    if (ecartTempsFFR('', cfg.pause_mi_temps_min, grilles, 'pause_periodes_min')) return true;
    if (ecartTempsFFR('', cfg.recup_entre_matchs_min, grilles, 'arret_entre_matchs_min')) return true;
  }
  return false;
}

/** Bouton(s) « Appliquer les valeurs FFR » pour une catégorie — seulement s'il y a un écart. */
function boutonsAppliquerFFR(cat, regles, temps, cfg, dim) {
  if (!regles.length && !temps) return '';
  // Ambiguïté réglementaire NON LEVÉE : plusieurs formes distinctes ce mois (ex. U14 10x10|15x15) et
  // aucune forme retenue. Le backend (session 12) filtre déjà par Config.forme_jeu → ce message ne
  // s'affiche donc QUE tant que le select « Forme de jeu retenue » n'a pas été renseigné.
  if (regles.length > 1) {
    return '<p class="ffr-attendu">Plusieurs formes de jeu ce mois-ci — choisis la <strong>forme de jeu ' +
      'retenue</strong> ci-dessus puis enregistre pour pouvoir appliquer les valeurs FFR.</p>';
  }
  const r = regles[0] || null;
  if (!categorieAUnEcartFFR(r, temps, cfg, dim)) return ''; // aucun écart ⇒ rien à appliquer
  const grilles = (temps && temps.grilles) || [];
  const catAttr = echapper(cat);
  if (grilles.length > 1) {
    // Variantes A/B : un bouton par découpage, jamais de choix par défaut (piège 3).
    return grilles.map(function (g) {
      const lib = (g.nb_periodes && g.duree_periode_min)
        ? (g.nb_periodes + ' × ' + g.duree_periode_min + ' min') : ('variante ' + g.variante);
      return '<button type="button" class="ffr-appliquer" data-cat="' + catAttr + '" data-variante="' +
        echapper(g.variante || '') + '">Appliquer les valeurs FFR — ' + echapper(lib) + '</button>';
    }).join('');
  }
  const v = grilles.length ? (grilles[0].variante || '') : '';
  return '<button type="button" class="ffr-appliquer" data-cat="' + catAttr + '" data-variante="' +
    echapper(v) + '">Appliquer les valeurs FFR</button>';
}

/** Aperçu « valeur actuelle → valeur FFR », champ par champ, pour la confirmation. */
function apercuAppliquerFFR(cat, variante) {
  const res = dernierResConformite;
  if (!res) return '';
  const r = ((res.regles || {})[cat] || [])[0] || null;
  const temps = (res.temps || {})[cat] || null;
  const cfg = categorieConfigFFR(cat);
  const dim = dimensionsCategoriesFFR()[cat];
  const lignes = [];
  if (r) {
    if (dim && dim.plein === true) {
      lignes.push('Terrain : conservé (plein terrain)');
    } else if (r.terrain_longueur_m && r.terrain_largeur_m) {
      const actuel = dim ? ((dim.l != null ? dim.l : '?') + ' × ' + (dim.w != null ? dim.w : '?') + ' m') : '(non défini)';
      lignes.push('Terrain : ' + actuel + ' → ' + r.terrain_longueur_m + ' × ' + r.terrain_largeur_m + ' m');
    } else if (r.terrain_libelle) {
      lignes.push('Terrain : non modifié (' + r.terrain_libelle + ')');
    }
    const effTerrain = String(r.effectif_terrain == null ? '' : r.effectif_terrain).match(/^\d+/);
    if (effTerrain) {
      lignes.push('Effectif min (sur le terrain) : ' + (cfg.effectif_min || '(vide)') + ' → ' + effTerrain[0]);
    }
    if (r.effectif_max_feuille) {
      lignes.push('Effectif max (feuille) : ' + (cfg.effectif_max || '(vide)') + ' → ' + r.effectif_max_feuille);
    }
  }
  const grilles = (temps && temps.grilles) || [];
  let g = null;
  if (grilles.length === 1) g = grilles[0];
  else if (grilles.length > 1) {
    g = grilles.filter(function (x) {
      return String(x.variante || '').toUpperCase() === String(variante || '').toUpperCase();
    })[0] || null;
  }
  if (g) {
    if (g.nb_periodes) lignes.push('Nb de périodes : ' + (cfg.format_mi_temps || '(vide)') + ' → ' + g.nb_periodes);
    if (g.duree_periode_min) lignes.push('Durée de période : ' + (cfg.duree_mi_temps_min || '(vide)') + ' → ' + g.duree_periode_min + ' min');
    if (g.pause_periodes_min) lignes.push('Pause : ' + (cfg.pause_mi_temps_min || '(vide)') + ' → ' + g.pause_periodes_min + ' min');
    if (g.arret_entre_matchs_min) lignes.push('Arrêt entre matchs : ' + (cfg.recup_entre_matchs_min || '(vide)') + ' → ' + g.arret_entre_matchs_min + ' min');
  }
  const tete = 'Appliquer les valeurs FFR à ' + cat + ' ?';
  if (!lignes.length) return tete;
  return tete + '\n\n' + lignes.join('\n') +
    '\n\nCes valeurs seront écrites dans les réglages. Tu pourras les remodifier ensuite.';
}

/** Clic sur « Appliquer les valeurs FFR » : confirmation, écriture backend, rechargement + recalcul. */
async function onClicAppliquerFFR(e) {
  const btn = e.target.closest('.ffr-appliquer');
  if (!btn) return;
  const cat = btn.getAttribute('data-cat');
  const variante = btn.getAttribute('data-variante') || '';
  const dateISO = dateTournoiCourante();
  if (!cat || !dateISO) return;

  const ok = await dialogConfirmer(apercuAppliquerFFR(cat, variante), { ok: 'Appliquer', annuler: 'Annuler' });
  if (!ok) return;

  btn.disabled = true;
  try {
    const res = await ecrireAdmin('appliquerValeursFFR', { categorie: cat, date: dateISO, variante: variante });
    // Les champs de Config ont changé : on recharge les réglages (qui RECALCULE déjà la conformité —
    // badges orange appliqués effacés, ignorés conservés). En absence de rechargerReglages (écran
    // Conformité seul), on recalcule directement.
    if (typeof rechargerReglages === 'function') await rechargerReglages();
    else await majConformiteFFR();
    let msg = '✅ Valeurs FFR appliquées à ' + cat + '.';
    if (res && res.ignores && res.ignores.length) {
      msg += '\n\nNon appliqué :\n' + res.ignores.map(function (i) { return '• ' + i.raison; }).join('\n');
    }
    await dialogAlerter(msg);
  } catch (err) {
    await dialogAlerter('⚠️ ' + (err && err.message ? err.message : 'Échec de l\'application des valeurs FFR.'));
  } finally {
    btn.disabled = false;
  }
}

/* --------------------------------------------------------------------------
   « TROUVER UNE DATE COMPATIBLE » (session 17)
   On choisit un mois → le backend (datesCompatiblesFFR) renvoie les jours
   jouables (dim/mer/sam) avec leur statut FFR. Un clic applique la date au
   tournoi (pose la date dans la carte + enregistre + recalcule la conformité).
   -------------------------------------------------------------------------- */

/** Nom du jour de semaine à partir du code dow (0=dim … 6=sam) ; '' hors dim/mer/sam. */
function nomJourFinder(dow) {
  return { 0: 'dimanche', 3: 'mercredi', 6: 'samedi' }[dow] || '';
}

/** Ouvre/ferme le panneau ; à l'ouverture, préremplit le mois depuis la date du tournoi. */
function onToggleTrouverDate() {
  const bouton = document.getElementById('bouton-trouver-date');
  const panneau = document.getElementById('panneau-trouver-date');
  if (!panneau) return;
  const ouvrir = panneau.hidden;
  panneau.hidden = !ouvrir;
  if (bouton) bouton.setAttribute('aria-expanded', ouvrir ? 'true' : 'false');
  if (ouvrir) {
    const champMois = document.getElementById('finder-mois');
    if (champMois && !champMois.value) {
      const d = dateTournoiCourante();
      champMois.value = d ? String(d).slice(0, 7) : '';
    }
    if (champMois) champMois.focus();
  }
}

/** Lance la recherche des jours compatibles pour le mois choisi (via le backend). */
async function onChercherDatesCompatibles() {
  const champMois = document.getElementById('finder-mois');
  const zone = document.getElementById('finder-resultats');
  if (!champMois || !zone) return;
  const mois = champMois.value;
  if (!mois) { zone.innerHTML = '<p class="date-finder-vide">Choisis d\'abord un mois.</p>'; return; }
  const bouton = document.getElementById('bouton-chercher-dates');
  if (bouton) bouton.disabled = true;
  zone.innerHTML = '<p class="date-finder-vide">Recherche des jours compatibles…</p>';
  try {
    const res = await apiGet('datesCompatiblesFFR', {
      mois: mois,
      categories: categoriesPresentesNoms().join(','),
      zone: zoneVacancesCourante()
    });
    zone.innerHTML = rendreDatesCompatibles(res);
  } catch (e) {
    zone.innerHTML = '<p class="date-finder-vide">Recherche indisponible pour le moment.</p>';
  } finally {
    if (bouton) bouton.disabled = false;
  }
}

/** Construit la liste des jours applicables (chips) + le rappel des jours écartés. */
function rendreDatesCompatibles(res) {
  if (!res || res.error) {
    return '<p class="date-finder-vide">' + echapper((res && res.error) || 'Recherche impossible.') + '</p>';
  }
  if (res.refDisponible === false) {
    return '<p class="date-finder-vide">Référentiel FFR non chargé — impossible de vérifier les dates.</p>';
  }
  const jours = res.jours || [];
  const applicables = jours.filter(function (j) { return j.applicable; });
  if (!applicables.length) {
    return '<p class="date-finder-vide">Aucun jour compatible ce mois-ci (samedis, dimanches et ' +
      'mercredis testés). Essaie un autre mois.</p>';
  }
  const libStatut = { compatible: '✅ compatible', vigilance: '⚠️ vigilance' };
  let html = '<ul class="date-finder-liste">';
  applicables.forEach(function (j) {
    const jour = nomJourFinder(j.dow);
    const libelle = (jour ? jour + ' ' : '') +
      (typeof formaterDateFr === 'function' ? formaterDateFr(j.date) : dateCourteFrFFR(j.date));
    const raison = (j.statut === 'vigilance' && j.raisons && j.raisons.length)
      ? '<span class="df-raison">' + echapper(j.raisons[0]) + '</span>' : '';
    html += '<li class="df-jour df-' + j.statut + '">' +
      '<span class="df-date">' + echapper(libelle) + '</span>' +
      '<span class="df-tag">' + (libStatut[j.statut] || '') + '</span>' +
      raison +
      '<button type="button" class="df-appliquer" data-date="' + echapper(j.date) + '">Appliquer</button>' +
      '</li>';
  });
  html += '</ul>';
  const conflits = jours.filter(function (j) { return j.statut === 'conflit'; });
  if (conflits.length) {
    html += '<p class="date-finder-conflits">Écartés (conflit FFR) : ' +
      conflits.map(function (j) { return echapper(dateCourteFrFFR(j.date)); }).join(', ') + '.</p>';
  }
  return html;
}

/** Clic « Appliquer » d'un jour : pose la date dans la carte, enregistre, ferme le panneau. */
async function onClicResultatDate(e) {
  const btn = e.target.closest('.df-appliquer');
  if (!btn) return;
  const date = btn.getAttribute('data-date');
  if (!date) return;
  const champ = document.querySelector('[name="tournoi_date"]');
  if (champ) champ.value = date;
  // Enregistre la date (+ zone) via le flux de la carte, qui recharge la conformité FFR.
  if (typeof onEnregistrerCadre === 'function') await onEnregistrerCadre();
  else if (typeof majConformiteFFR === 'function') await majConformiteFFR();
  const panneau = document.getElementById('panneau-trouver-date');
  if (panneau) panneau.hidden = true;
  const bouton = document.getElementById('bouton-trouver-date');
  if (bouton) bouton.setAttribute('aria-expanded', 'false');
}
