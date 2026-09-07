/**
 * ============================================================================
 *  ADMIN — DEMANDE D'AUTORISATION DE TOURNOI (feuille de report FFR, session 7)
 * ============================================================================
 *  Deux parties dans la section #bloc-autorisation :
 *   1) les CHAMPS À SAISIR (zone A de Config), groupés comme le formulaire ;
 *   2) la FEUILLE DE REPORT, dans l'ordre du document officiel, avec l'état de
 *      chaque champ (calculé / saisi / manquant) et le compteur de manquants.
 *
 *  On ne réplique JAMAIS le PDF officiel et on n'invente aucune valeur. La feuille
 *  s'imprime seule (@media print). Les champs contiennent des données personnelles :
 *  lus/écrits via des actions doPost protégées par la clé admin, jamais en public.
 *
 *  Dépend de : api.js (apiPostProtege), commun.js (echapper), admin.js (configCourante,
 *  ecrireAdmin, lireConfigAdmin). Chargé après admin.js dans admin.html.
 * ============================================================================
 */

/* Groupes de champs À SAISIR (zone A). Les champs « calculés » n'apparaissent QUE sur la feuille. */
var AUTORISATION_SAISIE = [
  { titre: 'A.1 — Organisateur', champs: [
    { p: 'org_club_nom', l: 'Nom du club organisateur', t: 'text' },
    { p: 'org_code_club', l: 'Code club', t: 'text' },
    { p: 'org_representant_nom', l: 'Représentant (M./Mme)', t: 'text' },
    { p: 'org_representant_tel', l: 'Tél. représentant', t: 'tel' },
    { p: 'org_representant_mail', l: 'Mail représentant', t: 'email' },
    { p: 'org_president_nom', l: 'Président du club (M.)', t: 'text' },
    { p: 'org_president_tel', l: 'Tél. président', t: 'tel' },
    { p: 'org_president_mail', l: 'Mail président', t: 'email' },
    { p: 'org_label_edr', l: 'École de rugby labellisée', t: 'select', o: ['oui', 'non'] },
    // `dep` : ce champ est GRISÉ (désactivé) tant que la question Oui/Non `dep` vaut « non ».
    { p: 'org_label_date', l: 'Date du dernier label', t: 'text', ph: 'JJ/MM/AAAA', dep: 'org_label_edr' }
  ] },
  { titre: 'A.2 — Tournoi', champs: [
    { p: 'org_niveau_tournoi', l: 'Niveau du tournoi', t: 'select', o: ['International', 'National', 'Territorial', 'Départemental'] }
  ] },
  { titre: 'A.4 — Participants', champs: [
    { p: 'org_nb_participants', l: 'Nombre de participants (si les équipes sont saisies à la main)', t: 'number',
      ph: 'ex. 240 — laisser vide si les clubs ont déclaré leurs effectifs' },
    { p: 'org_equipes_etrangeres', l: 'Équipes étrangères', t: 'select', o: ['non', 'oui'] },
    { p: 'org_equipes_etrangeres_liste', l: 'Liste des équipes étrangères', t: 'textarea', dep: 'org_equipes_etrangeres' }
  ] },
  { titre: 'B.1 — Installations', champs: [
    { p: 'org_type_terrain', l: 'Type de terrain', t: 'select', o: ['Gazon', 'Synthétique', 'Sable', 'Neige', 'Argile'] },
    { p: 'org_nb_vestiaires', l: 'Nombre de vestiaires', t: 'number' }
  ] },
  { titre: 'B.3 — Arbitrage', champs: [
    { p: 'org_nb_arbitres', l: 'Nombre d\'arbitres', t: 'number' },
    // Les éducateurs du club ORGANISATEUR ne sont dans aucune réponse d'invitation (le club ne
    // s'invite pas) : ils s'AJOUTENT à la somme déclarée par les clubs pour faire le total B.3.
    { p: 'org_nb_educateurs_club', l: 'Éducateurs du club organisateur (s\'ajoutent aux éducateurs déclarés par les clubs)', t: 'number' },
    { p: 'org_nb_educateurs', l: 'Nombre d\'éducateurs (total, si les clubs n\'ont rien déclaré)', t: 'number' },
    { p: 'org_nb_doublettes', l: 'Nombre de doublettes', t: 'number' }
  ] },
  { titre: 'B.4 — Sécurité', champs: [
    { p: 'org_medecin_oui', l: 'Médecin présent', t: 'select', o: ['non', 'oui'] },
    { p: 'org_medecin_nom', l: 'Médecin — nom', t: 'text', dep: 'org_medecin_oui' },
    { p: 'org_medecin_tel', l: 'Médecin — tél.', t: 'tel', dep: 'org_medecin_oui' },
    { p: 'org_secours_nom', l: 'Antenne de secours — nom', t: 'text' },
    { p: 'org_secours_tel', l: 'Antenne de secours — tél.', t: 'tel' },
    { p: 'org_ambulance', l: 'Ambulance', t: 'select', o: ['non', 'oui'] }
  ] },
  { titre: 'B.5 — Logistique', champs: [
    // `prefill` : si VIDE, ces champs reprennent le tarif d'engagement saisi dans « Modalités
    // d'inscription » (jamais d'écrasement d'une valeur déjà saisie) — voir prefillAutorisation.
    { p: 'org_droits_oui', l: 'Droits d\'inscription', t: 'select', o: ['non', 'oui'], prefill: true },
    { p: 'org_droits_montant', l: 'Montant / équipe', t: 'number', dep: 'org_droits_oui', prefill: true },
    { p: 'org_hebergement_oui', l: 'Hébergement', t: 'select', o: ['non', 'oui'] },
    { p: 'org_hebergement_structure', l: 'Hébergement — structure', t: 'text', dep: 'org_hebergement_oui' },
    { p: 'org_repas_oui', l: 'Repas', t: 'select', o: ['non', 'oui'] },
    { p: 'org_repas_fournisseur', l: 'Repas — fournisseur', t: 'text', dep: 'org_repas_oui' },
    { p: 'org_repas_prix', l: 'Repas — prix / pers.', t: 'number', dep: 'org_repas_oui' },
    { p: 'org_gouters_oui', l: 'Goûters', t: 'select', o: ['non', 'oui'] },
    { p: 'org_gouters_fournisseur', l: 'Goûters — fournisseur', t: 'text', dep: 'org_gouters_oui' },
    { p: 'org_gouters_prix', l: 'Goûters — prix / pers.', t: 'number', dep: 'org_gouters_oui' }
  ] }
];

/** Valeur courante d'un paramètre global (Config), ou ''. */
function valAutorisation(param) {
  const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
  return g[param] != null ? String(g[param]) : '';
}

/** Valeur de PRÉ-REMPLISSAGE d'un champ (repris d'une info déjà saisie ailleurs), ou '' si aucune.
 *  Aujourd'hui : les « Droits d'inscription » (B.5) reprennent le TARIF D'ENGAGEMENT des modalités
 *  d'inscription. Le montant côté modalités est du texte libre → on n'en garde que le 1er nombre
 *  (le champ autorisation est numérique). N'écrase JAMAIS : n'est utilisé que si le champ est vide. */
function prefillAutorisation(param) {
  const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
  if (param === 'org_droits_oui') {
    const t = String(g.tarif_engagement_oui == null ? '' : g.tarif_engagement_oui).trim().toLowerCase();
    return (t === 'oui' || t === 'non') ? t : '';
  }
  if (param === 'org_droits_montant') {
    const m = String(g.tarif_engagement_montant == null ? '' : g.tarif_engagement_montant).match(/\d+(?:[.,]\d+)?/);
    return m ? m[0].replace(',', '.') : '';
  }
  return '';
}

/** Valeur EFFECTIVE d'une question contrôleur (grisage) : la valeur stockée, ou à défaut son
 *  pré-remplissage. Ainsi un champ lié est grisé de façon cohérente même quand la question qui le
 *  pilote est encore vide mais pré-remplie à « non ». */
function valControleurEffectiveAutorisation(param) {
  const stored = valAutorisation(param);
  return stored !== '' ? stored : prefillAutorisation(param);
}

/** Catégories présentes (pour les récompenses par catégorie + le mémo arbitrage). */
function catsPresentesAutorisation() {
  const cats = (typeof configCourante !== 'undefined' && configCourante && configCourante.categories) || [];
  return cats.filter(function (c) { return String(c.presente).toLowerCase() === 'oui'; });
}

/** Un champ de saisie (input / select / textarea).
 *  Si `c.dep` est défini, le champ est GRISÉ (désactivé) quand la question Oui/Non `c.dep` vaut
 *  « non » : le champ ouvert lié n'a alors pas de sens. La valeur stockée est conservée (juste
 *  non modifiable) ; l'état est rebasculé en direct par onChangeAutorisation. */
function champSaisieAutorisation(c) {
  const stored = valAutorisation(c.p);
  // Pré-remplissage : SEULEMENT si le champ est vide (jamais d'écrasement d'une saisie).
  const prefill = (stored === '' && c.prefill) ? prefillAutorisation(c.p) : '';
  const estPrefill = (stored === '' && prefill !== '');
  const v = stored !== '' ? stored : prefill;
  // Grisage : sur la valeur EFFECTIVE de la question contrôleur (stockée ou pré-remplie).
  const grise = !!(c.dep && valControleurEffectiveAutorisation(c.dep) === 'non');
  const dis = grise ? ' disabled' : '';
  let controle;
  if (c.t === 'select') {
    controle = '<select class="r-input" name="' + c.p + '"' + dis + '><option value="">—</option>' +
      c.o.map(function (opt) {
        return '<option value="' + echapper(opt) + '"' + (v === opt ? ' selected' : '') + '>' + echapper(opt) + '</option>';
      }).join('') + '</select>';
  } else if (c.t === 'textarea') {
    controle = '<textarea class="r-input" name="' + c.p + '" rows="2"' + dis + '>' + echapper(v) + '</textarea>';
  } else {
    const ph = c.ph ? ' placeholder="' + echapper(c.ph) + '"' : '';
    controle = '<input class="r-input" type="' + c.t + '" name="' + c.p + '" value="' + echapper(v) + '"' + ph + dis + '>';
  }
  // data-dep porte la question CONTRÔLEUR : onChangeAutorisation retrouve les champs à (dé)griser.
  const attrDep = c.dep ? ' data-dep="' + echapper(c.dep) + '"' : '';
  const note = estPrefill
    ? '<span class="autorisation-prefill-note">↩ repris des modalités d\'inscription — vérifie puis enregistre</span>'
    : '';
  return '<label class="reglage' + (grise ? ' est-grise' : '') + (estPrefill ? ' est-prefill' : '') + '"' + attrDep + '>' +
    '<span class="r-libelle">' + echapper(c.l) + '</span>' + controle + note + '</label>';
}

/** Questions dont le LOGICIEL connaît déjà la réponse (session 22) : on ne les pose plus dans la
 *  carte, pour ne pas surcharger le document — la feuille de report montre la valeur reprise et
 *  son origine. Garde-fou : une valeur DÉJÀ SAISIE reste toujours affichée (jamais masquer une
 *  saisie existante). `dossier` = feuille assemblée par le backend (null si indisponible). */
function questionsDejaRepondues(dossier) {
  const masque = {};
  // Droits d'inscription : répondus par les MODALITÉS D'INSCRIPTION (tarif d'engagement).
  if (valAutorisation('org_droits_oui') === '' && prefillAutorisation('org_droits_oui') !== '') {
    masque.org_droits_oui = true;
    if (valAutorisation('org_droits_montant') === '') masque.org_droits_montant = true;
  }
  // Nombre de participants (repli manuel) : répondu par la cascade des clubs (effectifs déclarés).
  // Nombre d'éducateurs (B.3) : répondu par les éducateurs DÉCLARÉS à la réponse d'invitation.
  if (dossier && dossier.sections) {
    let part = null, educ = null;
    dossier.sections.forEach(function (s) { s.champs.forEach(function (c) {
      if (!part && c.libelle === 'Nombre de participants') part = c;
      if (!educ && c.libelle === 'Nombre d\'éducateurs') educ = c;
    }); });
    if (part && part.etat === 'calcule' && valAutorisation('org_nb_participants') === '') masque.org_nb_participants = true;
    if (educ && educ.etat === 'calcule' && valAutorisation('org_nb_educateurs') === '') masque.org_nb_educateurs = true;
  }
  // Type de terrain (repli manuel) : répondu par la NATURE des grands terrains déclarés (carte
  // Terrains). L'état 'calcule' de ce champ ne peut venir que de cette cascade (pas de défaut app).
  if (valAutorisation('org_type_terrain') === '' && dossier && dossier.sections) {
    let typeT = null;
    dossier.sections.forEach(function (s) { s.champs.forEach(function (c) {
      if (!typeT && c.libelle === 'Type de terrain') typeT = c;
    }); });
    if (typeT && typeT.etat === 'calcule') masque.org_type_terrain = true;
  }
  return masque;
}

/** Rend la partie SAISIE (formulaire) + le mémo arbitrage + le rappel « antenne de secours ».
 *  `masque` (questionsDejaRepondues) : champs à NE PAS afficher, déjà répondus par l'app. */
function rendreSaisieAutorisation(masque) {
  masque = masque || {};
  let nbMasquees = 0;
  let html = '<form id="form-autorisation" class="autorisation-saisie">';
  AUTORISATION_SAISIE.forEach(function (grp) {
    const champs = grp.champs.filter(function (c) {
      if (masque[c.p]) { nbMasquees++; return false; }
      return true;
    });
    if (!champs.length) return;
    html += '<fieldset class="autorisation-groupe"><legend>' + echapper(grp.titre) + '</legend>';
    html += champs.map(champSaisieAutorisation).join('');
    html += '</fieldset>';
  });

  // B.2 — Récompenses par catégorie présente.
  const cats = catsPresentesAutorisation();
  if (cats.length) {
    html += '<fieldset class="autorisation-groupe"><legend>B.2 — Récompenses par catégorie</legend>';
    html += cats.map(function (c) {
      const nom = String(c.categorie || '').trim();
      const v = valAutorisation('org_recompenses_' + nom);
      return '<label class="reglage"><span class="r-libelle">' + echapper(nom) + ' — récompenses</span>' +
        '<select class="r-input" name="org_recompenses_' + echapper(nom) + '"><option value="">—</option>' +
        ['non', 'oui'].map(function (o) { return '<option value="' + o + '"' + (v === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
        '</select></label>';
    }).join('');
    html += '</fieldset>';
  }
  html += '</form>';

  // Note discrète : des questions ont été retirées car l'app y répond déjà (source unique).
  if (nbMasquees) {
    html += '<p class="autorisation-rappel">💡 ' + nbMasquees + ' question(s) ne sont plus posées ici : ' +
      'le logiciel y répond déjà (effectifs déclarés par les clubs, tarif d\'engagement des ' +
      'modalités…). La feuille de report ci-dessous montre les valeurs reprises et leur origine.</p>';
  }

  // Rappel « antenne de secours » du dossier club (jamais parsé automatiquement).
  const secours = valAutorisation('securite_secours_precisions');
  if (secours.trim()) {
    html += '<p class="autorisation-rappel">💡 Déjà saisi dans le dossier club (antenne de secours) : <em>' +
      echapper(secours) + '</em> — recopie le nom et le téléphone dans les champs B.4 ci-dessus.</p>';
  }

  // Mémo arbitrage (par catégorie, dossier club) : hors feuille de report, ne correspond à aucune case.
  const memo = cats.filter(function (c) { return String(c.arbitrage_organisation || '').trim(); });
  if (memo.length) {
    html += '<div class="autorisation-memo"><strong>Pour mémoire — arbitrage par catégorie (dossier club)</strong>' +
      '<ul>' + memo.map(function (c) {
        return '<li>' + echapper(String(c.categorie).trim()) + ' : ' + echapper(String(c.arbitrage_organisation).trim()) + '</li>';
      }).join('') + '</ul>' +
      '<span class="autorisation-memo-note">Ne correspond à aucune case du formulaire (B.3 demande des nombres globaux).</span></div>';
  }
  return html;
}

/** Rend la FEUILLE DE REPORT à partir du dossier assemblé par le backend. */
function rendreFeuilleAutorisation(dossier) {
  if (!dossier || !dossier.sections) {
    return '<div class="ffr-bloc ffr-neutre">Feuille indisponible pour le moment.</div>';
  }
  const compteur = dossier.nbManquants === 0
    ? '<div class="ffr-bloc ffr-vert">✅ Tous les champs connus sont renseignés. Vérifie puis recopie sur le formulaire officiel.</div>'
    : '<div class="ffr-bloc ffr-orange"><strong>Il manque ' + dossier.nbManquants +
      ' champ(s) avant de pouvoir déposer.</strong></div>';

  let html = '<div id="feuille-report" class="autorisation-feuille-report">' +
    '<h3>Feuille de report — Demande d\'autorisation de tournoi École de Rugby</h3>' + compteur;

  dossier.sections.forEach(function (s) {
    html += '<div class="autorisation-section"><h4>' + echapper(s.titre) + '</h4>';
    if (s.note) html += '<p class="autorisation-section-note">' + echapper(s.note) + '</p>';
    html += '<table class="autorisation-table"><tbody>';
    s.champs.forEach(function (c) {
      // 'avert' = signalement INFORMATIF (incohérence, format hors périmètre) : orange, message affiché,
      // JAMAIS compté dans les manquants (session 8). 'manquant' = trou réel. 'saisi'/'calcule' = renseignés.
      const etatCls = (c.etat === 'manquant' || c.etat === 'avert') ? 'ffr-orange'
        : (c.etat === 'saisi' ? 'autorisation-saisi' : 'autorisation-calcule');
      const valeur = c.etat === 'manquant' ? '<em>manquant</em>' : echapper(String(c.valeur));
      html += '<tr class="' + etatCls + '"><th>' + echapper(c.libelle) + '</th><td>' + valeur +
        '</td><td class="autorisation-etat">' + echapper(c.etat) + '</td></tr>';
    });
    html += '</tbody></table></div>';
  });

  html += '<p class="autorisation-pied">Circuit de dépôt (à la charge du club organisateur) : ' +
    '<strong>Club demandeur → Comité Départemental → Ligue Régionale</strong>. ' +
    'Adresse et modalités de dépôt : à confirmer (audit Q2). Avis et signatures : hors de cette feuille.</p>';
  return html + '</div>';
}

/**
 * ⭐ M1-B2 / B2-0.3 — OUBLIER la feuille affichée, avant de la relire.
 *
 * ⚠️ Constaté EN RÉEL le 2026-08-25, juste après une réinitialisation réussie : en ouvrant
 * « Demande d'autorisation » SANS recharger la page, l'écran montrait encore le nom, la date et
 * le lieu de l'ancien tournoi, « 3 clubs », « 12 équipes », « 117 participants », « 38
 * éducateurs ». ⛔ Le classeur, lui, était bien vide — c'est l'ÉCRAN qui mentait.
 *
 * 🔬 La cause : `majAutorisation` n'est appelée QU'AU CHARGEMENT DE LA PAGE (`initAdmin`) et après
 * un enregistrement. ⛔ Ni la navigation vers l'écran, ni `rechargerEtRendre` ne la rappellent :
 * le HTML rendu au chargement restait donc en place, intact, pendant que les données changeaient.
 *
 * ⭐ Même doctrine que pour `clubsInvitesCourants` : on OUBLIE d'abord, on relit ensuite. L'oubli
 * est local et certain, la relecture est distante et faillible — l'oubli passe donc devant. Le
 * pire cas devient « on affiche moins », jamais « on affiche du faux ».
 * ⛔ Cette fonction n'invente aucune donnée et n'interroge personne : elle EFFACE, c'est tout.
 */
function invaliderAutorisationAffichee() {
  const zoneSaisie = document.getElementById('autorisation-saisie');
  const zoneFeuille = document.getElementById('autorisation-feuille');
  if (zoneFeuille) {
    zoneFeuille.innerHTML = '<div class="ffr-bloc ffr-neutre">Feuille de report en cours de ' +
      'rechargement…</div>';
  }
  if (zoneSaisie) zoneSaisie.innerHTML = '';
}

/* ==========================================================================
   ⭐ M1-B2 / B2-0.5 — GARDER LA FEUILLE FFR EN PHASE AVEC LE CLASSEUR
   --------------------------------------------------------------------------
   ⚠️ Constaté EN RÉEL le 2026-08-25 : « TOURNOI TEST RESET » enregistré dans la carte
   « Infos du tournoi », puis navigation vers « Demande d'autorisation » — l'ANCIEN nom y
   était TOUJOURS. Un simple rechargement du navigateur affichait le bon.

   🔬 MÊME CAUSE QUE B2-0.3, une porte plus loin. `majAutorisation` n'était appelée qu'à
   TROIS endroits : au chargement de la page (`initAdmin`), après une réinitialisation
   (B2-0.3), et après l'enregistrement de la feuille elle-même. ⛔ Les 28 AUTRES chemins
   d'enregistrement de l'administration ne la rappellent jamais — `rechargerEtRendre` non
   plus, et `ecransActiver` ne fait que montrer et cacher des blocs.

   ⭐ DOCTRINE : oublier tout de suite (local, certain, gratuit) ; relire quand on regarde
   (distant, faillible, payé une seule fois, quel que soit le nombre d'écritures).
   ========================================================================== */

/* A — IMPACTANTES, prises en charge par le crochet commun de `ecrireAdmin`.
   ⛔ LISTE EXPLICITE, jamais « tout sauf ». Chaque entrée dit QUELLE section du formulaire
   FFR elle alimente — vérifié dans `getDossierAutorisation` / `assemblerDossierAutorisation`
   (backend/Code.gs), pas déduit d'un nom d'action. */
var ACTIONS_AUTORISATION_CROCHET = {
  enregistrerInfosTournoi:       'A.2 nom/lieu/adresse/date — et A.3 (le mois choisit les formes)',
  enregistrerHoraires:           'A.2 heures de début et de fin',
  enregistrerCategorie:          'A.3 catégories présentes, B.2 format et durée de match',
  supprimerCategorie:            'A.3, B.2',
  appliquerValeursFFR:           'A.3, B.2 (durées et forme de jeu écrites dans la catégorie)',
  enregistrerPlanTerrains:       'B.1 nombre de terrains et nature de la surface',
  enregistrerContactsSecurite:   'B.4 responsable sécurité, antenne de secours',
  enregistrerInvitation:         'B.5 droits d\'inscription (tarif_engagement_*)',
  ajouterClubInvite:             'A.4 (le nom du club sert au rapprochement des équipes)',
  modifierStatutClubInvite:      'A.4 clubs et participants, B.3 éducateurs',
  modifierClubInvite:            'A.4',
  supprimerClubInvite:           'A.4, B.3',
  enregistrerCategoriesEngagees: 'A.4 équipes créées ou retirées',
  creerEquipesClub:              'A.4',
  ajouterEquipe:                 'A.4 nombre d\'équipes et participants, B.2',
  modifierEquipe:                'A.4',
  supprimerEquipe:               'A.4',
  supprimerEquipesCategorie:     'A.4',
  genererPoulesEtPlanning:       'B.1 terrains (planning), B.2 matchs par équipe',
  genererApresMidi:              'B.2',
  genererDimancheScf:            'B.2',
  recalculerHoraires:            'A.2, B.2',
  reorganiserPoulesMatin:        'B.1, B.2'
};

/* B — IMPACTANTES, mais DÉJÀ synchronisées par leur PROPRE chemin.
   ⛔ Ce ne sont PAS des actions « sans impact » : les ranger ainsi serait un mensonge, et
   masquerait la régression le jour où leur chemin propre disparaîtrait.
   ⚠️ Le crochet doit les IGNORER — sinon elles paieraient une seconde route pour rien. */
var ACTIONS_AUTORISATION_CHEMIN_PROPRE = {
  enregistrerDossierAutorisation: 'onEnregistrerAutorisation relit la config puis appelle majAutorisation',
  reinitialiserTournoi:           'onReinitialiser — correctif B2-0.3 / B2-0.4, validé en réel'
};

/* C — RÉELLEMENT sans impact : aucune des colonnes qu'elles écrivent n'est lue par
   `getDossierAutorisation` (contrôlé une par une le 2026-08-25). */
var ACTIONS_AUTORISATION_SANS_IMPACT = {
  listerClubsInvites:       'lecture seule',
  publierPlanningClubs:     'drapeau de visibilité du planning',
  publierTournoi:           'drapeau de publication',
  enregistrerAffiche:       'image de l\'affiche',
  supprimerAffiche:         'image de l\'affiche',
  enregistrerPhotoParking:  'image du parking',
  supprimerPhotoParking:    'image du parking',
  envoyerInvitationClub:    'invitation_envoyee — non lue par la feuille',
  envoyerInvitationsGroupe: 'invitation_envoyee — non lue par la feuille',
  envoyerDossierEmail:      'dossier_envoye — non lue par la feuille',
  regenererJetonClub:       'club_token — non lu par la feuille',
  enregistrerSurPlace:      'buvette / sandwich / boutique — non lues par la feuille',
  enregistrerReponseInvitation: 'contacts de réponse et email_expediteur — non lus par la feuille'
};

/* ⚠️ ÉCRITURES PARTIELLES — ces actions n'écrivent QUE les champs reçus (ecrireChampsConfig),
   et sont appelées avec des charges très différentes : « Modalités » envoie le tarif
   d'engagement, « Parking » n'envoie que son texte ; « Infos du tournoi » envoie le nom,
   « Équipes » n'envoie que son mot-clé de performance.

   ⛔ ON ÉNUMÈRE LES CHAMPS SANS IMPACT, JAMAIS L'INVERSE, et c'est la seule formulation sûre :
   lister « les champs qui impactent » serait une RECOPIE de ce que lit le backend (§8 quater) ;
   le jour où la feuille lirait un champ de plus, la copie deviendrait fausse EN SILENCE et
   l'écran redeviendrait périmé. Ici, un champ INCONNU provoque un recalcul.
   ⭐ L'oubli coûte une route réseau superflue — jamais un écran faux. Même doctrine que
   l'allowlist d'effacement D-043 : l'oubli doit CONSERVER, pas détruire. */
var CHAMPS_SANS_IMPACT_AUTORISATION = {
  enregistrerInfosTournoi: ['tournoi_description', 'zone_vacances', 'perfs_mot_cle_club'],
  enregistrerInvitation:   ['date_limite_confirmation', 'tarif_engagement_modalites',
                            'parking_texte', 'encadrement_ratio', 'encadrement_diplomes',
                            'assurance_attestation_requise']
};

/* ⭐ DES RÉVISIONS, PAS UN BOOLÉEN — et les deux scénarios qui l'imposent :
    · une relecture EN ÉCHEC ne doit pas effacer la dette (sinon plus aucun nouvel essai) ;
    · une écriture ARRIVÉE PENDANT la relecture ne doit pas être comptée comme lue.
   Un booléen ne sait faire ni l'un ni l'autre. Deux compteurs, comme le courrier reçu et le
   courrier lu : tant qu'ils diffèrent, il reste à lire. */
var autorisationRevision = 0;
var autorisationRevisionLue = 0;
var autorisationRelectureEnCours = null;
/* Photo du formulaire org_* tel qu'il a été RENDU (voir autorisationSaisieModifiee). */
var autorisationSaisiePhoto = null;
/* ⛔ Borne dure du rattrapage : on ne boucle jamais sans fin, même si une écriture arrive à
   chaque tour. Au-delà, la dette RESTE et sera reprise à la prochaine ouverture. */
var AUTORISATION_TOURS_MAX = 5;

/** Efface la FEUILLE affichée — ⛔ jamais le formulaire de saisie : aucune action du crochet
 *  n'écrit de champ `org_*`, et l'effacer perdrait une saisie en cours (voir B2-0.5 §3).
 *  ⚠️ À ne pas confondre avec `invaliderAutorisationAffichee` (B2-0.3), qui efface LES DEUX
 *  parce qu'une réinitialisation, elle, vide réellement 26 champs `org_*`. */
function invaliderFeuilleAutorisationAffichee() {
  const zoneFeuille = document.getElementById('autorisation-feuille');
  if (zoneFeuille) {
    zoneFeuille.innerHTML = '<div class="ffr-bloc ffr-neutre">Feuille de report en cours de ' +
      'rechargement…</div>';
  }
}

/** Photographie le formulaire org_* tel qu'il vient d'être rendu : c'est la référence
 *  « rien n'a été tapé depuis ». Réutilise l'outil du verrou d'étapes (assistant.js) plutôt
 *  que d'en écrire un second. */
function autorisationPhotographierSaisie() {
  const form = document.getElementById('form-autorisation');
  autorisationSaisiePhoto = (form && typeof assistantSerialiser === 'function')
    ? assistantSerialiser(form) : null;
}

/** Le formulaire org_* porte-t-il une saisie NON ENREGISTRÉE ?
 *  ⭐ Dans le doute — outil absent, photo absente — on répond OUI. L'incertitude CONSERVE la
 *  saisie ; elle ne la détruit jamais. C'est le sens sûr de l'erreur. */
function autorisationSaisieModifiee() {
  const form = document.getElementById('form-autorisation');
  if (!form) return false;                                    // rien à préserver
  if (typeof assistantSerialiser !== 'function') return true;  // ⛔ dans le doute, on garde
  if (autorisationSaisiePhoto == null) return true;            // ⛔ idem
  return assistantSerialiser(form) !== autorisationSaisiePhoto;
}

/** La feuille est-elle SOUS LES YEUX de l'organisateur en ce moment ?
 *  Trois modes d'affichage, trois réponses — l'écran « autorisation » ne contient QUE
 *  `bloc-autorisation`, donc en mode écrans/assistant nul ne peut enregistrer une autre
 *  carte tout en la regardant : la relecture y attend légitimement la navigation. */
function autorisationEstAffichee() {
  if (!document.getElementById('bloc-autorisation')) return false;
  const ecran = document.getElementById('ecran-autorisation');   // mode « écrans » (≥ 1024px)
  if (ecran) return !ecran.hidden;
  if (document.getElementById('asst-track')) return false;       // assistant : relu à l'arrivée
  return true;                                                   // vue classique : page longue
}

/** Une écriture vient de rendre la feuille fausse : on l'EFFACE tout de suite, on la relira. */
function signalerAutorisationObsolete() {
  autorisationRevision++;
  invaliderFeuilleAutorisationAffichee();
}

/**
 * Cette action, avec CETTE charge et CETTE réponse, touche-t-elle vraiment la feuille ?
 *
 * ⚠️ Les deux filtres de réponse sont SCOPÉS PAR ACTION, volontairement : un futur point
 * d'entrée qui emploierait par hasard un champ `apercu` ou `applique` pour tout autre chose
 * ne doit PAS pouvoir contourner le marquage.
 * ⭐ Ces deux filtres ne devinent rien : c'est le SERVEUR qui déclare n'avoir rien écrit.
 */
function ecritureImpacteAutorisation(action, data, reponse) {
  if (!ACTIONS_AUTORISATION_CROCHET[action]) return false;
  // ① Le serveur déclare lui-même la NON-ÉCRITURE (backend/Code.gs:5508 et :1915).
  if (action === 'supprimerClubInvite' && reponse && reponse.apercu === true) return false;
  if (action === 'appliquerValeursFFR' && reponse && reponse.applique === false) return false;
  // ② Écriture partielle dont AUCUN champ n'est lu par la feuille (voir la liste ci-dessus).
  const sansImpact = CHAMPS_SANS_IMPACT_AUTORISATION[action];
  if (sansImpact && data) {
    const cles = Object.keys(data).filter(function (c) { return c !== 'cle'; });
    if (cles.length && cles.every(function (c) { return sansImpact.indexOf(c) !== -1; })) return false;
  }
  return true;
}

/** (Re)charge et affiche la section « Demande d'autorisation ». Migration douce : silencieux si indisponible.
 *  La FEUILLE se charge d'abord : la SAISIE se rend ensuite, pour masquer les questions auxquelles
 *  l'app répond déjà (questionsDejaRepondues a besoin du dossier assemblé). Feuille indisponible
 *  ⇒ saisie complète (aucun masquage sans certitude).
 *
 *  ⭐ B2-0.5 — elle renvoie désormais un BILAN HONNÊTE : `{ ok, feuille, saisie }` ou
 *  `{ ok:false, motif }`. ⛔ Une panne ne doit jamais ressembler à un succès : sans ce retour,
 *  l'appelant marquerait la révision comme lue et ne retenterait plus jamais.
 *
 *  ⛔ `preserverSaisie` est OPT-IN — sans lui, le comportement est EXACTEMENT celui d'avant :
 *  c'est ce qui garantit que `initAdmin`, `onReinitialiser` (B2-0.3/0.4, validé en réel) et
 *  `onEnregistrerAutorisation` ne changent pas d'un iota.
 *
 *  ⭐ `revisionCible` — LE CONTRÔLE DE FRAÎCHEUR, et il ferme un trou TEMPOREL que l'état
 *  final ne montre pas : pendant qu'une lecture voyage sur le réseau, une écriture peut
 *  survenir. Quand la réponse arrive, elle décrit alors un état DÉJÀ DÉPASSÉ. La peindre —
 *  même une fraction de seconde, même si un second tour la corrige ensuite — remettrait à
 *  l'écran une valeur que le classeur n'a plus. ⛔ C'est exactement ce que le fail-closed
 *  interdit. On contrôle donc la fraîcheur APRÈS l'attente et AVANT tout rendu.
 *
 *  @param {Object} [opt] — `preserverSaisie` : ne pas reconstruire le formulaire `org_*` quand
 *    une saisie y est en cours, ni quand le réseau a échoué (synchronisation automatique).
 *    `revisionCible` : n'écrire à l'écran que si cette révision est toujours la plus récente. */
async function majAutorisation(opt) {
  opt = opt || {};
  const zoneSaisie = document.getElementById('autorisation-saisie');
  const zoneFeuille = document.getElementById('autorisation-feuille');
  if (!zoneSaisie || !zoneFeuille) return { ok: false, motif: 'zones-absentes' };
  // ⭐ Une réponse est DÉPASSÉE si une écriture est arrivée depuis le départ de la requête.
  //   ⛔ Sans `revisionCible` (appels historiques : initAdmin, reset, enregistrement du
  //   dossier), ce contrôle est inactif — le comportement d'avant est intact.
  const depassee = function () {
    return opt.revisionCible != null && opt.revisionCible !== autorisationRevision;
  };
  let dossier = null;
  let reseauOk = true;
  try {
    const rep = await apiPostProtege('getDossierAutorisation', {}, 'admin', 'admin');
    if (depassee()) return { ok: false, motif: 'revision-depassee' };
    dossier = (rep && rep.dossier) || null;
    zoneFeuille.innerHTML = rendreFeuilleAutorisation(dossier);
  } catch (e) {
    if (depassee()) return { ok: false, motif: 'revision-depassee' };
    reseauOk = false;
    zoneFeuille.innerHTML = '<div class="ffr-bloc ffr-neutre">Feuille de report indisponible ' +
      '(connecte-toi avec la clé admin).</div>';
  }
  // ⭐ SYNCHRONISATION AUTOMATIQUE (preserverSaisie) — deux cas où l'on NE reconstruit PAS :
  //   · une saisie org_* est en cours : la reconstruire l'effacerait ;
  //   · le réseau a échoué : sans dossier fiable, on ne sait pas honnêtement quelles questions
  //     doivent être masquées — on préfère laisser le formulaire tel quel que le repeindre au
  //     jugé. ⛔ Dans les DEUX cas, aucune valeur `org_*` fausse n'est affichée : ces valeurs
  //     n'ont pas changé (aucune action du crochet n'écrit de champ `org_*`).
  let saisie = 'reconstruite';
  if (opt.preserverSaisie && !reseauOk) {
    saisie = 'preservee-panne';
  } else if (opt.preserverSaisie && typeof autorisationSaisieModifiee === 'function' &&
             autorisationSaisieModifiee()) {
    saisie = 'preservee-saisie-en-cours';
  } else {
    zoneSaisie.innerHTML = rendreSaisieAutorisation(questionsDejaRepondues(dossier));
    if (typeof autorisationPhotographierSaisie === 'function') autorisationPhotographierSaisie();
  }
  if (!reseauOk) return { ok: false, motif: 'reseau', saisie: saisie };
  return { ok: true, feuille: 'relue', saisie: saisie };
}

/**
 * Relit la feuille — ⛔ SEULEMENT si elle est obsolète, et en RATTRAPANT ce qui arrive pendant.
 *
 * ⭐ La CIBLE est capturée AVANT toute attente. Après une relecture réussie on inscrit LA
 * CIBLE, jamais `autorisationRevision` : une écriture survenue pendant l'attente reste donc
 * non lue — et la boucle repart aussitôt pour elle. C'est le rattrapage automatique : on
 * n'attend aucune navigation hypothétique.
 *
 * ⛔ ON NE BOUCLE JAMAIS SUR UNE PANNE : le premier échec sort. `autorisationRevisionLue` ne
 * bouge pas, la dette est conservée, la prochaine ouverture retentera RÉELLEMENT.
 *
 * ⭐ Une seule chaîne active à la fois : un second appelant reçoit la promesse en cours, qui
 * ne se résout qu'une fois le rattrapage terminé — donc il n'a rien à relancer.
 */
async function majAutorisationSiObsolete() {
  if (autorisationRelectureEnCours) return autorisationRelectureEnCours;
  if (autorisationRevision === autorisationRevisionLue) return { relue: false, motif: 'a-jour' };
  autorisationRelectureEnCours = (async function () {
    let tours = 0, dernier = null;
    while (autorisationRevision !== autorisationRevisionLue && tours < AUTORISATION_TOURS_MAX) {
      tours++;
      const cible = autorisationRevision;              // ⭐ capturée AVANT toute attente
      if (typeof lireConfigAdmin === 'function') {
        // La config est relue ICI : `rendreSaisieAutorisation` lit `configCourante`, et
        // l'appelant ne l'a pas forcément encore rafraîchie.
        // ⭐ On la lit dans une VARIABLE LOCALE : un instantané pris pour une cible entre-temps
        //   dépassée ne doit JAMAIS écraser une config plus récente — l'écrire installerait
        //   silencieusement du passé dans l'état global, hors de toute zone d'affichage.
        let instantaneConfig;
        try { instantaneConfig = await lireConfigAdmin(); }
        catch (e) { return { relue: tours > 1, motif: 'config-indisponible', tours: tours }; }
        if (cible !== autorisationRevision) continue;  // ⛔ instantané périmé : on le jette
        configCourante = instantaneConfig;
      }
      const bilan = await majAutorisation({ preserverSaisie: true, revisionCible: cible });
      // ⛔ « Dépassée » n'est PAS une panne : rien n'a été peint, la dette est intacte, et on
      //   repart immédiatement sur la dernière révision connue.
      if (bilan.motif === 'revision-depassee') continue;
      if (!bilan.ok) return { relue: tours > 1, motif: bilan.motif, tours: tours };
      // ⛔ La CIBLE, jamais `autorisationRevision`. ⚠️ Depuis le contrôle de fraîcheur, cette
      //   ligne n'est atteinte QUE lorsque les deux valeurs sont égales — elles sont donc
      //   aujourd'hui interchangeables. On écrit `cible` parce qu'elle dit l'INTENTION, et
      //   qu'elle redeviendrait la seule correcte si le contrôle de fraîcheur était affaibli.
      autorisationRevisionLue = cible;
      dernier = { relue: true, revision: cible, saisie: bilan.saisie, tours: tours };
    }
    if (autorisationRevision !== autorisationRevisionLue) {
      return { relue: true, motif: 'trop-de-tours', tours: tours };
    }
    return dernier || { relue: false, motif: 'a-jour', tours: tours };
  })();
  try { return await autorisationRelectureEnCours; }
  finally { autorisationRelectureEnCours = null; }
}

/** Enregistre les champs saisis (org_*), puis recharge la config et la feuille.
 *
 *  ⚠️ C'est un CHEMIN PROPRE (catégorie B) : le crochet commun de `ecrireAdmin` ignore
 *  volontairement cette action, puisqu'elle se rafraîchit elle-même. Elle doit donc porter
 *  elle-même la DETTE, et honnêtement.
 *
 *  🔬 Le défaut corrigé ici : la dette était soldée INCONDITIONNELLEMENT, sans regarder le
 *  bilan de `majAutorisation`. Scénario réel : les champs `org_*` partent, le serveur les
 *  écrit, la feuille devient donc fausse — puis `getDossierAutorisation` échoue. La dette
 *  était pourtant marquée réglée : ⛔ plus aucun nouvel essai, jamais.
 *
 *  ⭐ Désormais : on note la dette AVANT de tenter, et on ne la solde QUE sur une relecture
 *  RÉELLEMENT réussie. En cas de panne, la feuille reste invalidée et la prochaine ouverture
 *  de l'écran retentera par le mécanisme normal de B2-0.5.
 *  ⛔ L'ENREGISTREMENT MÉTIER, LUI, RESTE RÉUSSI : un rafraîchissement raté n'est pas une
 *  écriture ratée, et le message le dit sans mentir dans un sens ni dans l'autre. */
async function onEnregistrerAutorisation() {
  const form = document.getElementById('form-autorisation');
  const message = document.getElementById('autorisation-message');
  if (!form) return;
  const data = {};
  Array.prototype.forEach.call(form.elements, function (el) {
    if (el.name && el.name.indexOf('org_') === 0) data[el.name] = String(el.value == null ? '' : el.value).trim();
  });
  const bouton = document.getElementById('bouton-enregistrer-autorisation');
  await avecBoutonOccupe(bouton, message, async function () {
    await ecrireAdmin('enregistrerDossierAutorisation', data);
    // ⭐ L'écriture a réussi : la feuille affichée est FAUSSE à cet instant. On l'efface et on
    //   note la dette AVANT de tenter le chemin propre — si celui-ci échoue, elle subsistera.
    signalerAutorisationObsolete();
    const cible = autorisationRevision;
    let relueOk = false, cibleDepassee = false;
    try {
      // La config a changé : on la recharge (source de vérité pour la saisie), puis on ré-assemble.
      // ⭐ MÊME PRINCIPE DE CIBLE que dans `majAutorisationSiObsolete`, et pour la même raison :
      //   ce chemin attend lui aussi le réseau, donc une autre écriture peut le doubler.
      if (typeof lireConfigAdmin === 'function') {
        const instantaneConfig = await lireConfigAdmin();
        if (cible !== autorisationRevision) cibleDepassee = true;   // ⛔ instantané périmé
        else configCourante = instantaneConfig;
      }
      if (!cibleDepassee) {
        const bilan = await majAutorisation({ revisionCible: cible });
        if (bilan && bilan.motif === 'revision-depassee') cibleDepassee = true;
        else relueOk = !!(bilan && bilan.ok);
      }
    } catch (e) { relueOk = false; }
    // ⛔ La dette n'est soldée QUE sur une relecture RÉELLEMENT réussie et NON dépassée.
    if (relueOk) autorisationRevisionLue = cible;
    // ⭐ « Dépassée » n'est PAS une panne : une écriture plus récente existe déjà. L'organisateur
    //   est sur cet écran — on rattrape TOUT DE SUITE avec le mécanisme normal, plutôt que
    //   d'attendre une navigation hypothétique.
    if (cibleDepassee && typeof majAutorisationSiObsolete === 'function') {
      majAutorisationSiObsolete().catch(function () { /* la feuille garde son message */ });
    }
    // ⛔ Dans TOUS ces cas l'écriture serveur est acquise : on ne laisse jamais croire l'inverse.
    afficherMessage(message, (relueOk || cibleDepassee) ? '✅ Champs enregistrés.'
      : '✅ Champs enregistrés. ⚠️ La feuille n\'a pas pu être relue (réseau) : elle se remettra ' +
        'à jour toute seule à la prochaine ouverture de cet écran.', 'ok');
  });
}

/* ==========================================================================
   PDF PRÉ-REMPLI — le formulaire officiel FFR (AcroForm) rempli avec nos données.
   Le remplissage est 100 % CÔTÉ NAVIGATEUR (pdf-lib), aucun backend. Les valeurs
   sont posées dans le PDF qui RESTE un formulaire à remplir : l'organisateur ouvre
   le PDF téléchargé et complète le reste (format sportif par catégorie, signatures).
   La correspondance champ PDF ↔ donnée a été vérifiée par la position de chaque
   champ face à son libellé dans le PDF officiel (millésime 2026-2027).
   ========================================================================== */

/* Tableau « Catégories et formes de jeu » (page 2) : par numéro de catégorie FFR, la liste des
   formes possibles avec leur case. `f` = code forme (T+2 / JCO / RE / SEVENS), `e` = effectif.
   Mapping VÉRIFIÉ par le libellé à droite de chaque case dans le PDF officiel. */
var PDF_FORMES_TABLE = {
  '6':  [{ plateau: true, c: 'Case à cocher69' }],
  '8':  [{ f: 'T+2', e: '5X5', c: 'Case à cocher70' }, { f: 'JCO', e: '5X5', c: 'Case à cocher71' }],
  '10': [{ f: 'T+2', e: '5X5', c: 'Case à cocher72' }, { f: 'JCO', e: '5X5', c: 'Case à cocher73' }, { f: 'RE', e: '7X7', c: 'Case à cocher74' }],
  '12': [{ f: 'T+2', e: '5X5', c: 'Case à cocher75' }, { f: 'JCO', e: '5X5', c: 'Case à cocher76' }, { f: 'RE', e: '10X10', c: 'Case à cocher77' }],
  '14': [{ f: 'T+2', e: '7X7', c: 'Case à cocher78' }, { f: 'JCO', e: '7X7', c: 'Case à cocher79' }, { f: 'RE', e: '10X10', c: 'Case à cocher80' }, { f: 'RE', e: '15X15', c: 'Case à cocher81' }, { f: 'SEVENS', e: '7X7', c: 'Case à cocher82' }],
  '15F':[{ f: 'T+2', e: '7X7', c: 'Case à cocher83' }, { f: 'JCO', e: '7X7', c: 'Case à cocher84' }, { f: 'RE', e: '10X10', c: 'Case à cocher85' }, { f: 'RE', e: '15X15', c: 'Case à cocher86' }, { f: 'SEVENS', e: '7X7', c: 'Case à cocher87' }]
};

/** Numéro de catégorie FFR à partir du nom d'app : U10→'10', U15F→'15F', M8→'8'. */
function numCategorieAut(nom) {
  return String(nom == null ? '' : nom).trim().toUpperCase().replace(/^[MU](?=\d)/, '');
}

/* Fond des lignes du tableau « Catégories et formes de jeu » (deux bleus alternés), MESURÉ sur le
 * rendu du gabarit (pixel de fond de cellule, x 550 pt). Sert à MASQUER proprement le petit cadre
 * ❑ imprimé des cellules cochées : un cache blanc ferait une tache sur le fond bleu. */
var COULEURS_FOND_FORMES = {
  '6': [180, 198, 231], '8': [217, 226, 243], '10': [180, 198, 231],
  '12': [217, 226, 243], '14': [180, 198, 231], '15F': [217, 226, 243]
};

/* Cases du tableau « Catégories et formes de jeu » (page 2) → couleur de fond de leur ligne.
 * Ces cellules-là ont un CADRE de case DÉJÀ IMPRIMÉ sur la page (glyphe ❑ du gabarit, petit et
 * décalé) : cocher dessus donnait soit un double encadrement, soit une minuscule case cochée à
 * côté des grands carrés vides. On MASQUE donc ce glyphe (cache aux couleurs de la ligne) et on
 * grave la GRANDE case standard + croix au rect du widget — même aspect que « Départemental ».
 * Dérivé de PDF_FORMES_TABLE (source unique). */
var CASES_CADRE_IMPRIME = (function () {
  var s = {};
  Object.keys(PDF_FORMES_TABLE).forEach(function (num) {
    PDF_FORMES_TABLE[num].forEach(function (opt) { s[opt.c] = COULEURS_FOND_FORMES[num] || [255, 255, 255]; });
  });
  return s;
})();

/* Géométrie du cadre ❑ imprimé, MESURÉE sur le rendu du gabarit (raster 300 dpi) : glyphe de
 * ~7,7 pt de côté, centre décalé du centre du widget de +4,2 pt en x et −0,9 pt en y (constant en
 * points ⇒ indépendant de la résolution ; identique sur toutes les cellules). */
var CADRE_IMPRIME_DX = 4.2;
var CADRE_IMPRIME_DY = -0.9;
var CADRE_IMPRIME_TAILLE = 7.7;

/* Ligne de base du LIBELLÉ de chaque ligne, MESURÉE sur le gabarit (raster 300 dpi, bloc de texte
 * le plus proche du centre vertical du champ) et exprimée en points AU-DESSUS du bas du champ
 * (rect.y + décalage = ligne de base). Le gabarit FFR place ses champs n'importe comment par
 * rapport à leurs libellés (de +1,1 à +13,6 pt !) : un décalage unique faisait « flotter » ou
 * « couler » les valeurs selon les lignes — la table par champ pose chaque valeur exactement SUR
 * la ligne de son libellé. Champ absent de la table → défaut 4,5 (la médiane mesurée). */
var DECALAGE_LIGNE_AUT = {
  'Texte1': 2.8, 'Texte2': 3.5, 'Texte3': 6.6, 'Texte5': 8.3, 'Texte6': 7, 'Texte10': 3.7,
  'Texte9': 3, 'Texte7': 5, 'Texte8': 13.6, 'Texte11': 1.6, 'Texte12': 2.6,
  'Date64_es_:signer:date': 2.3, 'Texte13': 7.2, 'Texte14': 8.2,
  'Texte15': 2.2, 'Texte16': 5.1, 'Texte17': 9.9, 'Texte20': 6.8,
  'Texte22': 2.1, 'Texte29': 4.5, 'Texte30': 3, 'Texte31': 6.4, 'Texte32': 5.4, 'Texte33': 8.3,
  'Texte23': 1.4, 'Texte24': 3.3, 'Texte25': 1.1, 'Texte26': 2.3, 'Texte27': 3.9, 'Texte28': 7.8,
  'Texte21': 6, 'Texte36': 5.5, 'Texte39': 1.6, 'Texte37': 7, 'Texte62': 10.5, 'Texte38': 7.8,
  'Texte121': 5.7, 'Texte125': 6.8, 'Texte123': 9.3, 'Texte126': 2.6, 'Texte124': 6.6, 'Texte127': 6.6,
  'Texte40': 4.6, 'Texte41': 6.6, 'Texte42': 2.3, 'Texte43': 4.2, 'Texte44': 7.2, 'Texte45': 10.1,
  'Texte46': 1.1, 'Texte47': 3.9, 'Texte48': 7.8,
  'Texte50': 9.5, 'Texte51': 13.4, 'Texte52': 7.1, 'Texte53': 11, 'Texte54': 5.5, 'Texte55': 9.3,
  'Texte56': 7.1, 'Texte57': 7.5, 'Texte58': 8, 'Texte59': 5.1, 'Texte60': 7.8, 'Texte61': 4.9,
  'Club demandeurRow1': 7
};

/* Retouches STATIQUES du gabarit — défaut structurel du PDF officiel : le libellé imprimé
 * « Niveau du tournoi : » est posé PAR-DESSUS la zone de saisie « Heure de début » (Texte13,
 * x 115..265 · y 415..437), d'où le chevauchement et le surlignage gris sur le libellé. On MASQUE
 * le libellé à son ancienne place (rectangle blanc calé sur sa boîte MESURÉE au raster 300 dpi :
 * x 119,3..203,8 · y 422,2..429,4) et on le REDESSINE aligné sous « Heure de début » (même bord
 * gauche, x 38,4), sur la ligne des cases International/National/… (texte de la ligne : y 400..409).
 * « Heure de début » récupère ainsi sa zone → remplie avec Config.heure_debut. `page` : index dans
 * doc.getPages() (0 = consignes, 1 = « A. Informations générales »). */
var RETOUCHES_GABARIT = [
  { page: 1,
    caches: [{ x: 117, y: 419.5, w: 89.5, h: 13 }],
    textes: [{ x: 38.4, y: 400.1, taille: 10, texte: 'Niveau du tournoi :' }] }
];

/** Coche, dans le tableau des formes (page 2), la forme de jeu retenue de chaque catégorie présente
 *  (Config.forme_jeu, ex. « JCO — 5x5 »). Ajoute les cases à `cases`. Rien si forme non renseignée. */
function cocherFormesCategories(categories, cases) {
  (categories || []).forEach(function (cat) {
    if (String(cat.presente).toLowerCase() !== 'oui') return;
    var num = numCategorieAut(cat.categorie);
    var table = PDF_FORMES_TABLE[num];
    if (!table) return;
    var fj = String(cat.forme_jeu == null ? '' : cat.forme_jeu).trim();
    // M6 : une seule case (plateau) — cochée dès que la catégorie est présente.
    if (num === '6') { cases.push(table[0].c); return; }
    if (!fj) return; // pas de forme retenue ⇒ on ne devine pas
    var parts = fj.split(/[—–-]/);
    var forme = String(parts[0] || '').trim().toUpperCase().replace(/\s+/g, '');   // « J CO » → « JCO »
    var eff = String(parts[1] || '').trim().toUpperCase().replace(/\s+/g, '');       // « 5x5 » → « 5X5 »
    for (var i = 0; i < table.length; i++) {
      var opt = table[i];
      if (opt.plateau) continue;
      if (String(opt.f).toUpperCase().replace(/\s+/g, '') === forme && String(opt.e).toUpperCase() === eff) {
        cases.push(opt.c); return;
      }
    }
  });
}

/* Récompenses par catégorie : numéro FFR → [caseOui, caseNon]. */
var PDF_RECOMPENSES_AUT = {
  '6':  ['Case à cocher95', 'Case à cocher96'],
  '8':  ['Case à cocher97', 'Case à cocher98'],
  '10': ['Case à cocher64', 'Case à cocher99'],
  '12': ['Case à cocher100', 'Case à cocher119'],
  '14': ['Case à cocher101', 'Case à cocher102']
};

/** 'AAAA-MM-JJ' → 'JJ/MM/AAAA' (sans dépendre du fuseau) ; renvoie tel quel sinon. */
function dateFrPdfAut(iso) {
  var m = String(iso == null ? '' : iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : String(iso == null ? '' : iso);
}

/* ── Section « 2. FORMAT SPORTIF » (pages 2-3 du formulaire). Par numéro de catégorie FFR, les
   champs texte de son bloc « Organisation sportive catégorie MX » :
     p1n/p1d : « Si en 1 phase »  → nombre de matchs/équipe · durée match
     f1n/f1d : « Phase 1 qualificative » → nombre de matchs/équipe · durée match
     f2n/f2d : « Phase 2 de niveau »     → nombre de matchs/équipes · durée match
   Mapping VÉRIFIÉ par la position de chaque champ face à son libellé (millésime 2026-2027). Le
   formulaire n'a de bloc que pour M6/M8/M10/M12/M14 (pas de M15F). */
var PDF_FORMAT_SPORTIF = {
  '6':  { p1n: 'Texte22',  p1d: 'Texte29',  f1n: 'Texte30',  f1d: 'Texte31',  f2n: 'Texte32',  f2d: 'Texte33' },
  '8':  { p1n: 'Texte23',  p1d: 'Texte24',  f1n: 'Texte25',  f1d: 'Texte26',  f2n: 'Texte27',  f2d: 'Texte28' },
  '10': { p1n: 'Texte21',  p1d: 'Texte36',  f1n: 'Texte39',  f1d: 'Texte37',  f2n: 'Texte62',  f2d: 'Texte38' },
  '12': { p1n: 'Texte121', p1d: 'Texte125', f1n: 'Texte123', f1d: 'Texte126', f2n: 'Texte124', f2d: 'Texte127' },
  '14': { p1n: 'Texte40',  p1d: 'Texte41',  f1n: 'Texte42',  f1d: 'Texte43',  f2n: 'Texte44',  f2d: 'Texte45' }
};

/** Effectifs déclarés sur les équipes SAISIES À LA MAIN — miroir de effectifsEquipesManuelles
 *  (backend, session 27). ANTI-DOUBLE-COMPTE : les équipes créées par une réponse d'invitation
 *  (`source` = 'auto') sont écartées, leurs effectifs étant déjà dans les totaux de leur club.
 *  Une équipe sans `source` est traitée comme manuelle (cas prudent : aucun club derrière elle). */
function effectifsEquipesManuellesAut(equipes) {
  var joueurs = null, educateurs = null;
  (equipes || []).forEach(function (e) {
    if (String((e && e.source) || '').trim().toLowerCase() === 'auto') return;
    var j = parseInt(String((e && e.nb_joueurs) == null ? '' : e.nb_joueurs).trim(), 10);
    var ed = parseInt(String((e && e.nb_educateurs) == null ? '' : e.nb_educateurs).trim(), 10);
    if (isFinite(j) && j >= 0) joueurs = (joueurs || 0) + j;
    if (isFinite(ed) && ed >= 0) educateurs = (educateurs || 0) + ed;
  });
  return { joueurs: joueurs, educateurs: educateurs };
}

/** Total des ÉDUCATEURS (B.3) — miroir de totalEducateursAutorisation (backend, session 26) :
 *  déclarés par les clubs acceptés + encadrants du club organisateur (org_nb_educateurs_club, qui
 *  ne figurent dans aucune réponse d'invitation) ; repli sur l'ancien total manuel si aucune des
 *  deux sources n'est connue. Renvoie '' si rien n'est connu (champ PDF laissé vide, jamais deviné). */
function totalEducateursAut(g, nbDeclare) {
  function entier(v) { var n = parseInt(String(v == null ? '' : v).trim(), 10); return isFinite(n) && n >= 0 ? n : null; }
  var declare = entier(nbDeclare) || 0;
  var club = entier((g || {}).org_nb_educateurs_club);
  if (declare > 0 || club != null) return String(declare + (club || 0));
  var manuel = String((g || {}).org_nb_educateurs == null ? '' : g.org_nb_educateurs).trim();
  return manuel;
}

/** Natures (surfaces) des grands terrains déclarés — miroir de naturesTerrainsAutorisation
 *  (backend) : natures distinctes lues dans Config.terrains_physiques (champ `nature` posé par la
 *  carte Terrains). PRUDENT : JSON absent/invalide ou aucune nature ⇒ [] (repli org_type_terrain). */
function naturesTerrainsAut(g) {
  var brut = String((g && g.terrains_physiques) == null ? '' : g.terrains_physiques).trim();
  if (!brut) return [];
  var terrains;
  try { terrains = JSON.parse(brut); } catch (e) { return []; }
  if (!terrains || !terrains.length) return [];
  var vus = {}, natures = [];
  terrains.forEach(function (t) {
    var n = String((t && t.nature) || '').trim();
    if (n && !vus[n]) { vus[n] = true; natures.push(n); }
  });
  return natures;
}

/** Nom de club déduit d'un nom d'équipe : « RCF-2 » → « RCF ». Miroir de clubDe (backend) — même
 *  convention « {club} » / « {club}-N » que la répartition des poules. Sert au comptage des clubs. */
function clubDeAut(nom) {
  return String(nom == null ? '' : nom).replace(/\s*[-–—/]\s*\d{1,3}\s*$/, '').trim().toUpperCase();
}

/** Nombre MAX de matchs joués par une même équipe (équipes vides ignorées). Miroir backend. */
function maxMatchsParEquipeAut(matchs) {
  var comptes = {};
  (matchs || []).forEach(function (m) {
    [m.equipe_A, m.equipe_B].forEach(function (e) {
      var id = String(e == null ? '' : e).trim();
      if (id) comptes[id] = (comptes[id] || 0) + 1;
    });
  });
  var max = 0;
  for (var k in comptes) { if (comptes[k] > max) max = comptes[k]; }
  return max;
}

/** Libellé de durée de match d'une catégorie (« format_mi_temps × durée min »). Miroir backend
 *  (dureeMatchLibelleAutorisation) : connu dès la config, AVANT toute génération. '' si incomplet. */
function dureeMatchLibelleAut(cfgCat) {
  var fmt = String((cfgCat && cfgCat.format_mi_temps) || '').trim();
  var dm = String((cfgCat && cfgCat.duree_mi_temps_min) || '').trim();
  if (!fmt || !dm) return '';
  return fmt + ' × ' + dm + ' min';
}

/** Structure des poules du matin, dérivée des matchs — miroir de structureMatinFFR (backend).
 *  → { nbPoules, poulesEgales, totalEquipes, matinMax }. Pur. */
function structureMatinAut(matin) {
  var equipesParPoule = {}, toutesEquipes = {};
  (matin || []).forEach(function (m) {
    var p = String(m.poule == null ? '' : m.poule).trim();
    if (!p) return;
    var set = equipesParPoule[p] || (equipesParPoule[p] = {});
    [m.equipe_A, m.equipe_B].forEach(function (e) {
      var id = String(e == null ? '' : e).trim();
      if (id) { set[id] = true; toutesEquipes[id] = true; }
    });
  });
  var labels = Object.keys(equipesParPoule);
  var tailles = labels.map(function (p) { return Object.keys(equipesParPoule[p]).length; });
  var egales = tailles.length > 0 && tailles.every(function (t) { return t === tailles[0]; });
  return { nbPoules: labels.length, poulesEgales: egales,
           totalEquipes: Object.keys(toutesEquipes).length, matinMax: maxMatchsParEquipeAut(matin) };
}

/* Formules de phase 2 — miroir de FORMULES_PHASE2 (backend, session 10) : un format n'accède à la
 * prédiction que si sa formule est ICI ; tout format absent tombe sur le chemin PRUDENT (rien
 * d'écrit). Sur le formulaire OFFICIEL on ne grave que les prédictions EXACTES (nature 'predit') —
 * jamais une borne basse ('minimum', cas du CROISE_DIAGONAL en poules inégales). */
var FORMULES_PHASE2_AUT = {
  CROISE: function (s) {
    return { valeur: s.nbPoules >= 2 ? s.nbPoules - 1 : 0, nature: 'predit' };
  },
  CROISE_DIAGONAL: function (s) {
    if (s.nbPoules < 2) return { valeur: 0, nature: 'predit' };
    return s.poulesEgales ? { valeur: 1, nature: 'predit' } : { valeur: 1, nature: 'minimum' };
  },
  LIBRE: function (s) {
    return { valeur: s.totalEquipes >= 2 ? s.totalEquipes - 1 : 0, nature: 'predit' };
  },
  // POULES_NIVEAU : tranches de 4-5 en round-robin complet ⇒ plus grande tranche − 1 (max exact).
  POULES_NIVEAU: function (s) {
    var tailles = taillesPoulesNiveauAut(s.totalEquipes);
    var max = 0;
    for (var i = 0; i < tailles.length; i++) { if (tailles[i] > max) max = tailles[i]; }
    return { valeur: max >= 2 ? max - 1 : 0, nature: 'predit' };
  }
};

/** Tailles des poules de niveau pour n équipes — miroir de taillesPoulesNiveau (backend) :
 *  poules de 4-5, « le BAS joue plus » (esprit EDR). 8→[4,4] · 9→[4,5] · 20→[5,5,5,5]. */
function taillesPoulesNiveauAut(n) {
  if (n < 2) return [];
  var nb = Math.ceil(n / 5);
  var base = Math.floor(n / nb), reste = n % nb;
  var tailles = [];
  for (var i = 0; i < nb; i++) tailles.push(base + (i >= nb - reste ? 1 : 0));
  return tailles;
}

/** Phase 2 PRÉDITE depuis la structure du matin, ou null si non prédictible exactement. */
function predirePhase2Aut(matin, fmt) {
  if (!matin || !matin.length) return null; // pas de matin ⇒ pas de structure ⇒ muet
  var st = structureMatinAut(matin);
  if (!st.nbPoules) return null; // aucune poule étiquetée ⇒ structure inconnue, on ne grave rien
  var formule = Object.prototype.hasOwnProperty.call(FORMULES_PHASE2_AUT, fmt) ? FORMULES_PHASE2_AUT[fmt] : null;
  if (!formule) return null;
  var p2 = formule(st);
  return p2.nature === 'predit' ? p2.valeur : null;
}

/**
 * Format sportif d'UNE catégorie — miroir FIDÈLE de formatSportifCategorie (backend), même doctrine :
 * le nombre de PHASES vient du format d'après-midi DÉCLARÉ (jamais de l'existence de matchs), et le
 * nombre de matchs/équipe se remplit phase par phase. Quand l'après-midi n'est PAS généré (cas normal
 * avant le jour J), la phase 2 est PRÉDITE par arithmétique de la structure des poules (sessions
 * 9-10 : planifierApresMidi ne tronque jamais par le temps — c'est une conséquence de la structure,
 * pas une estimation) ; seule une prédiction EXACTE est écrite.
 *   CROISE / CROISE_DIAGONAL → 2 phases · LIBRE → 1 phase (toute la journée, prédite si besoin) ·
 *   COUPE_PLATEAU / vide → pas de nombre écrit · SCF (U14 Super Challenge) → rien : structure et
 *   durées propres (triangulaires/quadrangulaires, 2×15 ou 2×11), l'organisateur complète à la main.
 */
function formatSportifCategorieAut(matchsCat, cfgCat) {
  // Garde SCF : hors doctrine standard (pas de « classement », durée forcée) — on n'écrit RIEN.
  if (typeof ctxScf === 'function' && ctxScf(cfgCat).estScf) {
    return { deuxPhases: false, duree: '', unePhase: null };
  }
  var liste = matchsCat || [];
  var matin = liste.filter(function (m) { return String(m.phase) !== 'classement'; });
  var aprem = liste.filter(function (m) { return String(m.phase) === 'classement'; });
  var fmt = String((cfgCat && cfgCat.format_apresmidi) || '').trim().toUpperCase();
  var duree = dureeMatchLibelleAut(cfgCat);
  function compter(sous) { return sous.length ? maxMatchsParEquipeAut(sous) : null; }
  if (fmt === 'CROISE' || fmt === 'CROISE_DIAGONAL' || fmt === 'POULES_NIVEAU') {
    // Phase 2 : constatée si générée, sinon prédite exactement depuis la structure du matin.
    var p2 = aprem.length ? compter(aprem) : predirePhase2Aut(matin, fmt);
    return { deuxPhases: true, duree: duree, phase1: compter(matin), phase2: p2 };
  }
  if (fmt === 'LIBRE') {
    // Une phase, toute la journée : constatée si l'après-midi existe, sinon matin + phase 2 prédite.
    var total = aprem.length ? compter(liste) : null;
    if (total == null && matin.length) {
      var pl = predirePhase2Aut(matin, 'LIBRE');
      if (pl != null) total = maxMatchsParEquipeAut(matin) + pl;
    }
    return { deuxPhases: false, duree: duree, unePhase: total };
  }
  // COUPE_PLATEAU / vide / inconnu : on n'écrit aucun nombre de matchs (comme la feuille de report),
  // mais la durée reste connue et remplissable.
  return { deuxPhases: false, duree: duree, unePhase: null };
}

/** Remplit les champs texte de la section « Format sportif » pour chaque catégorie présente.
 *  `matchsParCat` : matchs groupés par nom de catégorie d'app. `setT` : poseur de texte du plan. */
function remplirFormatSportifAut(categories, matchsParCat, setT) {
  (categories || []).forEach(function (cat) {
    if (String(cat.presente).toLowerCase() !== 'oui') return;
    var map = PDF_FORMAT_SPORTIF[numCategorieAut(cat.categorie)];
    if (!map) return; // catégorie sans bloc au formulaire (ex. M15F)
    var fs = formatSportifCategorieAut((matchsParCat && matchsParCat[cat.categorie]) || [], cat);
    if (fs.deuxPhases) {
      if (fs.phase1 != null) setT(map.f1n, String(fs.phase1));
      if (fs.phase2 != null) setT(map.f2n, String(fs.phase2));
      if (fs.duree) { setT(map.f1d, fs.duree); setT(map.f2d, fs.duree); }
    } else {
      if (fs.unePhase != null) setT(map.p1n, String(fs.unePhase));
      if (fs.duree) setT(map.p1d, fs.duree);
    }
  });
}

/**
 * Construit le PLAN de remplissage (résolu) : { textes:{champPDF:valeur}, cases:[champPDF] }.
 * PUR : ne lit ni DOM ni classeur. `g` = paramètres globaux (Config) ; nbClubs/nbEquipes/
 * nbParticipants = comptes (cascade calculée par l'appelant) ; `matchsParCat` = matchs groupés par
 * catégorie (pour le format sportif). Applique les MÊMES défauts et la MÊME doctrine que la
 * feuille de report backend (label, étrangères, phases, cascades). ⛔ AUCUN nom de club
 * n'est pré-rempli : non saisi ⇒ le champ reste vide et ÉDITABLE dans le PDF fédéral.
 */
function planRemplissageAutorisation(g, nbClubs, nbEquipes, categories, matchsParCat, nbParticipants, nbEducateurs) {
  g = g || {};
  function v(k) { return String(g[k] == null ? '' : g[k]).trim(); }
  var textes = {}, cases = [];
  function setT(champ, val) { val = String(val == null ? '' : val).trim(); if (val !== '') textes[champ] = val; }
  function ouinon(val, champOui, champNon) {
    var s = String(val == null ? '' : val).trim().toLowerCase();
    if (s === 'oui') cases.push(champOui); else if (s === 'non') cases.push(champNon);
  }
  function choix(val, map) { if (map[val]) cases.push(map[val]); }

  // A.1 Organisateur (défauts alignés sur la feuille de report backend : AUCUN nom de club
  // n'est inventé — vide ⇒ setT n'écrit rien ⇒ le champ reste ÉDITABLE dans le PDF).
  setT('Texte1', v('org_club_nom'));
  setT('Texte2', v('org_code_club'));
  setT('Texte3', v('org_representant_nom'));
  setT('Texte5', v('org_representant_tel'));
  setT('Texte6', v('org_representant_mail'));
  setT('Texte10', v('org_president_nom'));
  setT('Texte9', v('org_president_tel'));
  setT('Texte7', v('org_president_mail'));
  ouinon(v('org_label_edr') || 'oui', 'Case à cocher62', 'Case à cocher63');
  setT('Texte8', v('org_label_date'));

  // A.2 Tournoi.
  setT('Texte11', v('tournoi_nom'));
  setT('Texte12', v('tournoi_adresse') || v('tournoi_lieu'));
  setT('Date64_es_:signer:date', dateFrPdfAut(v('tournoi_date')));
  // « Heure de début » (Texte13) : sa zone chevauchait le libellé imprimé « Niveau du tournoi » —
  // libellé désormais MASQUÉ et redessiné plus bas (RETOUCHES_GABARIT) ⇒ la zone est libre, on la
  // remplit avec l'heure de début du tournoi. « Heure de fin » (Texte14) ne chevauche rien.
  setT('Texte13', v('heure_debut'));
  setT('Texte14', v('heure_fin_communiquee') || v('heure_fin'));
  choix(v('org_niveau_tournoi'), { 'International': 'Case à cocher65', 'National': 'Case à cocher66',
    'Territorial': 'Case à cocher67', 'Départemental': 'Case à cocher68' });

  // A.4 Participants — cascade §4.2, miroir de la feuille de report : la somme des joueurs
  // DÉCLARÉS par les clubs acceptés (nbParticipants, calculée par l'appelant) prime ; repli sur
  // org_nb_participants (saisi à la main quand les équipes ne passent pas par l'invitation).
  if (nbClubs) setT('Texte15', String(nbClubs));
  if (nbEquipes) setT('Texte16', String(nbEquipes));
  if (nbParticipants) setT('Texte17', String(nbParticipants));
  else setT('Texte17', v('org_nb_participants'));
  setT('Texte18', v('org_equipes_etrangeres_liste'));

  // B.1 Installations — type de terrain : CASCADE depuis la nature des grands terrains déclarés
  // (carte Terrains), miroir de la feuille de report. Plusieurs natures ⇒ plusieurs cases cochées
  // (le formulaire officiel le permet). Aucune nature déclarée ⇒ repli sur la saisie manuelle.
  var casesNature = { 'Gazon': 'Case à cocher91', 'Synthétique': 'Case à cocher92',
    'Neige': 'Case à cocher93', 'Argile': 'Case à cocher94', 'Sable': 'Case à cocher1' };
  var naturesTPdf = naturesTerrainsAut(g);
  if (naturesTPdf.length) naturesTPdf.forEach(function (n) { choix(n, casesNature); });
  else choix(v('org_type_terrain'), casesNature);
  setT('Texte20', v('org_nb_vestiaires'));

  // B.3 Arbitrage — éducateurs : cascade ADDITIVE (miroir de totalEducateursAutorisation, session
  // 26) : éducateurs déclarés par les clubs acceptés + encadrants du club organisateur (absents de
  // toute réponse d'invitation) ; repli sur l'ancien total manuel si aucune des deux sources.
  setT('Texte46', v('org_nb_arbitres'));
  setT('Texte47', totalEducateursAut(g, nbEducateurs));
  setT('Texte48', v('org_nb_doublettes'));

  // B.4 Sécurité — responsable = référent sécurité (si distinct), sinon référent tournoi (dossier club).
  var secDistinct = v('securite_referent_identique').toLowerCase() === 'non';
  setT('Texte50', secDistinct ? v('securite_referent_nom') : v('referent_nom'));
  setT('Texte51', secDistinct ? v('securite_referent_tel') : v('referent_tel'));
  ouinon(v('org_medecin_oui'), 'Case à cocher123', 'Case à cocher124');
  setT('Texte52', v('org_medecin_nom'));
  setT('Texte53', v('org_medecin_tel'));
  if (v('org_secours_nom') || v('org_secours_tel')) cases.push('Case à cocher125'); // antenne secours = oui
  setT('Texte54', v('org_secours_nom'));
  setT('Texte55', v('org_secours_tel'));
  ouinon(v('org_ambulance'), 'Case à cocher103', 'Case à cocher104');

  // B.5 Logistique — droits d'inscription : CASCADE depuis les modalités d'inscription (même
  // règle que la feuille de report) : org_* saisi prioritaire, sinon tarif d'engagement (dont on
  // extrait le 1er nombre — le champ des modalités est du texte libre).
  var tarifOuiP = String(g.tarif_engagement_oui == null ? '' : g.tarif_engagement_oui).trim().toLowerCase();
  if (tarifOuiP !== 'oui' && tarifOuiP !== 'non') tarifOuiP = '';
  var mTarifP = String(g.tarif_engagement_montant == null ? '' : g.tarif_engagement_montant).match(/\d+(?:[.,]\d+)?/);
  var droitsOuiEff = v('org_droits_oui') || tarifOuiP;
  ouinon(droitsOuiEff, 'Case à cocher105', 'Case à cocher106');
  setT('Texte56', v('org_droits_montant') || ((droitsOuiEff === 'oui' && mTarifP) ? mTarifP[0].replace(',', '.') : ''));
  ouinon(v('org_hebergement_oui'), 'Case à cocher107', 'Case à cocher108');
  setT('Texte57', v('org_hebergement_structure'));
  ouinon(v('org_repas_oui'), 'Case à cocher109', 'Case à cocher110');
  setT('Texte58', v('org_repas_fournisseur'));
  setT('Texte59', v('org_repas_prix'));
  ouinon(v('org_gouters_oui'), 'Case à cocher111', 'Case à cocher112');
  setT('Texte60', v('org_gouters_fournisseur'));
  setT('Texte61', v('org_gouters_prix'));

  // B.2 Récompenses par catégorie (org_recompenses_<cat> ; U10→'10', M8→'8', U15F→'15' ignoré).
  Object.keys(g).forEach(function (k) {
    var mm = k.match(/^org_recompenses_(.+)$/);
    if (!mm) return;
    var num = String(mm[1]).toUpperCase().replace(/^[MU]/, '').replace(/\D.*$/, '');
    var pair = PDF_RECOMPENSES_AUT[num];
    if (!pair) return;
    ouinon(g[k], pair[0], pair[1]);
  });

  // Section « 2. Format sportif » : nombre de matchs/équipe (par phase) + durée de match, par
  // catégorie. La durée vient de la config (connue avant génération) ; les nombres de matchs sont
  // comptés sur les matchs générés (null ⇒ champ laissé vide, jamais deviné).
  remplirFormatSportifAut(categories, matchsParCat, setT);

  // Page 2 — tableau « Catégories et formes de jeu » : coche la forme retenue de chaque catégorie.
  cocherFormesCategories(categories, cases);

  // Page signatures — club demandeur.
  setT('Club demandeurRow1', v('org_club_nom'));
  return { textes: textes, cases: cases };
}

/** Applique un plan de remplissage à un PDF (bytes) via pdf-lib — MODE HYBRIDE :
 *  les champs qu'on remplit sont GRAVÉS en texte/coche statique (sur la page) puis RETIRÉS du
 *  formulaire (plus de case bleue, plus de surbrillance, plus de chevauchement) ; les champs qu'on
 *  ne remplit pas restent des champs de formulaire ÉDITABLES. Renvoie les octets du PDF. */
async function appliquerPlanPdfAutorisation(PDFLib, bytes, plan) {
  const doc = await PDFLib.PDFDocument.load(bytes);
  const form = doc.getForm();
  const context = doc.context;
  const PDFName = PDFLib.PDFName;
  const helv = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const helvB = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const noir = PDFLib.rgb(0.08, 0.08, 0.10);
  const blanc = PDFLib.rgb(1, 1, 1);

  // Retouches statiques du gabarit (déplacement du libellé « Niveau du tournoi : ») — dessinées
  // AVANT la gravure des champs, pour que les valeurs gravées passent PAR-DESSUS les caches blancs.
  RETOUCHES_GABARIT.forEach(function (ret) {
    var page = doc.getPages()[ret.page];
    if (!page) return;
    (ret.caches || []).forEach(function (c) {
      try { page.drawRectangle({ x: c.x, y: c.y, width: c.w, height: c.h, color: blanc }); } catch (e) {}
    });
    (ret.textes || []).forEach(function (t) {
      try { page.drawText(t.texte, { x: t.x, y: t.y, size: t.taille, font: helv, color: noir }); } catch (e) {}
    });
  });
  const casesSet = {};
  (plan.cases || []).forEach(function (n) { casesSet[n] = true; });
  const nomsGraves = {}; // noms des champs gravés (à retirer aussi du formulaire)

  // Nom du champ porté par une annotation (sur elle-même, sinon sur son /Parent).
  function nomDeAnnot(dict) {
    var t = dict.get(PDFName.of('T'));
    if (t && t.decodeText) return t.decodeText();
    var par = dict.get(PDFName.of('Parent'));
    if (par) { try { var pd = context.lookup(par); var pt = pd.get(PDFName.of('T')); if (pt && pt.decodeText) return pt.decodeText(); } catch (e) {} }
    return null;
  }
  function rectDe(dict) {
    var r = dict.get(PDFName.of('Rect'));
    if (!r || !r.get) return null;
    var a = r.get(0).asNumber(), b = r.get(1).asNumber(), c = r.get(2).asNumber(), d = r.get(3).asNumber();
    return { x: Math.min(a, c), y: Math.min(b, d), w: Math.abs(c - a), h: Math.abs(d - b) };
  }

  // Parcours des annotations de CHAQUE page : on grave (texte/coche) puis on retire celles remplies.
  doc.getPages().forEach(function (page) {
    var an = page.node.Annots && page.node.Annots();
    if (!an || !an.asArray) return;
    var gardes = [];
    an.asArray().forEach(function (ref) {
      var dict;
      try { dict = context.lookup(ref); } catch (e) { gardes.push(ref); return; }
      if (!dict || !dict.get) { gardes.push(ref); return; }
      var nom = nomDeAnnot(dict);
      var r = nom ? rectDe(dict) : null;
      if (nom && r && plan.textes[nom] !== undefined) {
        var val = String(plan.textes[nom]).replace(/\s*\n\s*/g, ' / ');
        // Taille : Helvetica 10 = l'équivalent VISUEL des libellés du gabarit (Calibri 11, hauteur
        // de capitale mesurée ≈ 7,2 pt sur le raster 300 dpi) — cohérence libellés imprimés /
        // valeurs gravées. Champ étroit : la valeur RÉTRÉCIT (jamais sous 7 pt) plutôt que de
        // déborder ; les champs HAUTS (multi-lignes) gardent l'ancrage haut + retour à la ligne.
        var taille = 10;
        var multiligne = r.h > 24;
        if (!multiligne) {
          while (taille > 7 && helv.widthOfTextAtSize(val, taille) > r.w - 4) taille -= 0.5;
        }
        // Ligne de base : celle du libellé de la ligne, mesurée champ par champ sur le gabarit
        // (DECALAGE_LIGNE_AUT) — le centrage géométrique d'avant faisait « flotter » ou « couler »
        // la valeur selon les lignes, car le gabarit place ses champs de façon incohérente.
        var y = multiligne ? (r.y + r.h - 12)
                           : (r.y + (DECALAGE_LIGNE_AUT[nom] != null ? DECALAGE_LIGNE_AUT[nom] : 4.5));
        try {
          var opts = { x: r.x + 2, y: y, size: taille, font: helv, color: noir };
          if (multiligne) { opts.maxWidth = r.w - 4; opts.lineHeight = taille + 2; }
          page.drawText(val, opts);
        } catch (e) {}
        nomsGraves[nom] = true; return; // retirée (pas dans gardes)
      }
      if (nom && r && casesSet[nom]) {
        try {
          var fond = CASES_CADRE_IMPRIME[nom];
          if (fond) {
            // Cellule du tableau des formes : le petit cadre ❑ (≈ 7,7 pt) est DÉJÀ imprimé par le
            // gabarit, décalé du centre du widget. Cocher DESSUS donnait une minuscule case cochée à
            // côté des grands carrés vides (aspect incohérent). On le MASQUE d'abord (cache aux
            // couleurs de fond de la ligne), puis on grave la grande case standard ci-dessous.
            var cx = r.x + r.w / 2 + CADRE_IMPRIME_DX;
            var cy = r.y + r.h / 2 + CADRE_IMPRIME_DY;
            var demi = CADRE_IMPRIME_TAILLE / 2 + 2;
            page.drawRectangle({ x: cx - demi, y: cy - demi, width: demi * 2, height: demi * 2,
              color: PDFLib.rgb(fond[0] / 255, fond[1] / 255, fond[2] / 255) });
          }
          // Case cochée gravée : carré standard + croix au rect du widget — même aspect partout
          // (tableau des formes compris), identique aux cases Niveau/récompenses/….
          var bs = Math.min(r.w, r.h);
          var bx = r.x + (r.w - bs) / 2, by = r.y + (r.h - bs) / 2;
          page.drawRectangle({ x: bx, y: by, width: bs, height: bs, borderColor: noir, borderWidth: 1 });
          var xs = bs * 0.78;
          page.drawText('X', { x: bx + (bs - helvB.widthOfTextAtSize('X', xs)) / 2, y: by + (bs - xs) / 2 + xs * 0.16, size: xs, font: helvB, color: noir });
        } catch (e) {}
        nomsGraves[nom] = true; return;
      }
      gardes.push(ref);
    });
    page.node.set(PDFName.of('Annots'), context.obj(gardes));
  });

  // Retire aussi les champs gravés de l'AcroForm (/Fields), par nom, pour qu'ils ne restent pas
  // « fantômes » dans le formulaire.
  try {
    var fieldsArr = form.acroForm.dict.get(PDFName.of('Fields'));
    if (fieldsArr && fieldsArr.asArray) {
      var gardesF = fieldsArr.asArray().filter(function (ref) {
        try { var fd = context.lookup(ref); var t = fd.get(PDFName.of('T')); var nom = t && t.decodeText ? t.decodeText() : null; return !(nom && nomsGraves[nom]); }
        catch (e) { return true; }
      });
      form.acroForm.dict.set(PDFName.of('Fields'), context.obj(gardesF));
    }
  } catch (e) {}

  return doc.save();
}

/** Télécharge des octets comme fichier. */
function telechargerFichierAutorisation(bytes, nom, type) {
  const blob = new Blob([bytes], { type: type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

/** Génère et télécharge le PDF officiel FFR pré-rempli avec les données du tournoi. */
async function onTelechargerPdfAutorisation() {
  const message = document.getElementById('autorisation-message');
  const bouton = document.getElementById('bouton-pdf-autorisation');
  if (typeof PDFLib === 'undefined') {
    if (message) afficherMessage(message, '⚠️ Bibliothèque PDF non chargée — recharge la page.', 'ko');
    return;
  }
  await avecBoutonOccupe(bouton, message, async function () {
    afficherMessage(message, 'Génération du PDF pré-rempli…', 'ok');
    const resp = await fetch('modeles/demande-autorisation-ffr.pdf');
    if (!resp.ok) throw new Error('Modèle PDF introuvable (modeles/demande-autorisation-ffr.pdf).');
    const bytes = await resp.arrayBuffer();
    const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
    // Comptes — CASCADE §4.2, miroir EXACT de la feuille de report backend :
    //   nb d'équipes     = équipes chargées ;
    //   nb de clubs      = clubs invités ACCEPTÉS s'il y en a (source 1, la plus fiable), sinon
    //     clubs DISTINCTS déduits des noms d'équipes (clubDeAut — équipes saisies à la main) ;
    //   nb participants  = somme des joueurs DÉCLARÉS par les clubs acceptés (nb_joueurs_total) ;
    //     0 ⇒ le plan retombe sur org_nb_participants (saisi).
    const eqs = (typeof equipesCourantes !== 'undefined' && equipesCourantes) ? equipesCourantes : [];
    const nbEquipes = eqs.length;
    const clubs = (typeof clubsInvitesCourants !== 'undefined' && clubsInvitesCourants) ? clubsInvitesCourants : [];
    let nbClubsAcceptes = 0, nbParticipants = 0, nbEducateurs = 0;
    clubs.forEach(function (c) {
      const accepte = (typeof estAccepte === 'function')
        ? estAccepte(c.statut)
        : String(c.statut == null ? '' : c.statut).trim().toLowerCase() === 'accepté';
      if (!accepte) return;
      nbClubsAcceptes++;
      const n = parseInt(c.nb_joueurs_total, 10);
      if (isFinite(n)) nbParticipants += n;
      const ed = parseInt(c.nb_educateurs_total, 10);
      if (isFinite(ed)) nbEducateurs += ed;
    });
    // Effectifs déclarés ÉQUIPE PAR ÉQUIPE sur les équipes saisies à la main (session 27) —
    // miroir de effectifsEquipesManuelles (backend) : on écarte les équipes 'auto', déjà
    // couvertes par les totaux de leur club, sinon elles seraient comptées deux fois.
    const effEq = effectifsEquipesManuellesAut(eqs);
    if (effEq.joueurs != null) nbParticipants += effEq.joueurs;
    if (effEq.educateurs != null) nbEducateurs += effEq.educateurs;
    const setClubs = {};
    eqs.forEach(function (e) { const c = clubDeAut(e.nom_equipe); if (c) setClubs[c] = true; });
    const nbClubs = nbClubsAcceptes > 0 ? nbClubsAcceptes : Object.keys(setClubs).length;
    const cats = (typeof configCourante !== 'undefined' && configCourante && configCourante.categories) || [];
    // Matchs groupés par catégorie (pour le format sportif) — depuis le planning déjà chargé.
    const matchs = (typeof matchsCourants !== 'undefined' && matchsCourants) ? matchsCourants : [];
    const matchsParCat = {};
    matchs.forEach(function (m) {
      const cat = String(m.categorie == null ? '' : m.categorie).trim();
      if (cat) (matchsParCat[cat] = matchsParCat[cat] || []).push(m);
    });
    const plan = planRemplissageAutorisation(g, nbClubs, nbEquipes, cats, matchsParCat, nbParticipants, nbEducateurs);
    const out = await appliquerPlanPdfAutorisation(PDFLib, bytes, plan);
    telechargerFichierAutorisation(out, 'demande-autorisation-' + (g.tournoi_date || 'tournoi') + '.pdf', 'application/pdf');
    afficherMessage(message, '✅ PDF pré-rempli téléchargé. Ouvre-le et complète le format sportif ' +
      'par catégorie + les signatures.', 'ok');
  });
}

/** (Dé)grise les champs liés à une question Oui/Non `param` selon sa valeur (« non » ⇒ grisé). */
function majGrisageAutorisation(param, valeur) {
  const grise = String(valeur) === 'non';
  const sel = (window.CSS && CSS.escape) ? CSS.escape(param) : param;
  document.querySelectorAll('#form-autorisation label[data-dep="' + sel + '"]').forEach(function (lab) {
    lab.classList.toggle('est-grise', grise);
    const ctrl = lab.querySelector('.r-input');
    if (ctrl) ctrl.disabled = grise;
  });
}

/** Changement d'une question Oui/Non contrôleur ⇒ (dé)grise ses champs liés en direct. */
function onChangeAutorisation(e) {
  const el = e.target;
  if (!el || !el.name || el.name.indexOf('org_') !== 0) return;
  // On n'agit que si ce champ pilote au moins un champ lié (data-dep).
  const sel = (window.CSS && CSS.escape) ? CSS.escape(el.name) : el.name;
  if (document.querySelector('#form-autorisation label[data-dep="' + sel + '"]')) {
    majGrisageAutorisation(el.name, el.value);
  }
}

/* Câblage : boutons Enregistrer / Imprimer + grisage conditionnel. Posé une fois, en délégation. */
document.addEventListener('DOMContentLoaded', function () {
  const section = document.getElementById('bloc-autorisation');
  if (!section) return;
  section.addEventListener('click', function (e) {
    if (e.target.closest('#bouton-enregistrer-autorisation')) { e.preventDefault(); onEnregistrerAutorisation(); }
    else if (e.target.closest('#bouton-pdf-autorisation')) { e.preventDefault(); onTelechargerPdfAutorisation(); }
    else if (e.target.closest('#bouton-imprimer-autorisation')) { e.preventDefault(); window.print(); }
  });
  section.addEventListener('change', onChangeAutorisation);
});
