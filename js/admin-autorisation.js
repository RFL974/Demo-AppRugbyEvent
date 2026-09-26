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
    // `prefill` : ces champs reprennent automatiquement le tarif d'engagement saisi dans
    // « Modalités d'inscription », qui est leur source de vérité — voir prefillAutorisation.
    { p: 'org_droits_oui', l: 'Droits d\'inscription', t: 'select', o: ['non', 'oui'], prefill: true },
    { p: 'org_droits_montant', l: 'Montant / équipe', t: 'number', dep: 'org_droits_oui', prefill: true },
    { p: 'org_hebergement_oui', l: 'Hébergement', t: 'select', o: ['non', 'oui'] },
    { p: 'org_hebergement_structure', l: 'Hébergement — structure', t: 'text', dep: 'org_hebergement_oui' },
    { p: 'org_repas_oui', l: 'Repas', t: 'select', o: ['non', 'oui'], prefill: true },
    { p: 'org_repas_fournisseur', l: 'Repas — fournisseur', t: 'text', dep: 'org_repas_oui' },
    { p: 'org_repas_prix', l: 'Repas — prix / pers.', t: 'number', dep: 'org_repas_oui', prefill: true },
    { p: 'org_gouters_oui', l: 'Goûters', t: 'select', o: ['non', 'oui'], prefill: true },
    { p: 'org_gouters_fournisseur', l: 'Goûters — fournisseur', t: 'text', dep: 'org_gouters_oui' },
    { p: 'org_gouters_prix', l: 'Goûters — prix / pers.', t: 'number', dep: 'org_gouters_oui', prefill: true }
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
 *  (le champ autorisation est numérique). Pour B.5, cette source est prioritaire afin qu'une
 *  ancienne saisie ne contredise jamais les modalités actuellement affichées aux clubs. */
function prefillAutorisation(param) {
  const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
  if (param === 'org_droits_oui') {
    const t = String(g.tarif_engagement_oui == null ? '' : g.tarif_engagement_oui).trim().toLowerCase();
    return (t === 'oui' || t === 'non') ? t : '';
  }
  if (param === 'org_droits_montant') {
    const t = String(g.tarif_engagement_oui == null ? '' : g.tarif_engagement_oui).trim().toLowerCase();
    if (t !== 'oui') return '';
    const m = String(g.tarif_engagement_montant == null ? '' : g.tarif_engagement_montant).match(/\d+(?:[.,]\d+)?/);
    return m ? m[0].replace(',', '.') : '';
  }
  const repasPrix = String(g.repas_sur_place_oui || '').toLowerCase() === 'oui' &&
    g.repas_sur_place_mode === 'prix_personne';
  if (param === 'org_repas_oui') return repasPrix ? 'oui' : '';
  if (param === 'org_repas_prix' && repasPrix) {
    const m = String(g.repas_sur_place_montant == null ? '' : g.repas_sur_place_montant)
      .match(/\d+(?:[.,]\d+)?/);
    return m ? m[0].replace(',', '.') : '';
  }
  const gouterPrix = String(g.gouter_fin_tournoi_oui || '').toLowerCase() === 'oui' &&
    g.gouter_fin_tournoi_mode === 'prix_personne';
  if (param === 'org_gouters_oui') return gouterPrix ? 'oui' : '';
  if (param === 'org_gouters_prix' && gouterPrix) {
    const m = String(g.gouter_fin_tournoi_montant == null ? '' : g.gouter_fin_tournoi_montant)
      .match(/\d+(?:[.,]\d+)?/);
    return m ? m[0].replace(',', '.') : '';
  }
  return '';
}

/** Valeur EFFECTIVE d'une question contrôleur (grisage) : pour B.5, les modalités sont
 *  prioritaires ; ailleurs, la valeur stockée reste prioritaire. */
function valControleurEffectiveAutorisation(param) {
  const stored = valAutorisation(param);
  const prefill = prefillAutorisation(param);
  if ((param === 'org_droits_oui' || param === 'org_repas_oui' || param === 'org_gouters_oui') && prefill !== '') return prefill;
  return stored !== '' ? stored : prefill;
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
  const prefill = c.prefill ? prefillAutorisation(c.p) : '';
  // Les deux champs B.5 sont le reflet direct des modalités : une valeur enregistrée plus
  // ancienne ne doit jamais contredire le tarif actuellement demandé.
  const modalitesPrioritaires = c.prefill && prefill !== '';
  const estPrefill = prefill !== '' && (stored === '' || modalitesPrioritaires);
  const v = modalitesPrioritaires ? prefill : (stored !== '' ? stored : prefill);
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
  const sourcePrefill = (c.p.indexOf('org_repas_') === 0 || c.p.indexOf('org_gouters_') === 0)
    ? 'de la carte « Sur place »' : 'des modalités d\'inscription';
  const note = estPrefill
    ? '<span class="autorisation-prefill-note">↩ repris automatiquement ' + sourcePrefill + '</span>'
    : '';
  return '<label class="reglage' + (grise ? ' est-grise' : '') + (estPrefill ? ' est-prefill' : '') + '"' + attrDep + '>' +
    '<span class="r-libelle">' + echapper(c.l) + '</span>' + controle + note + '</label>';
}

/** Questions dont le LOGICIEL connaît déjà la réponse : on masque les replis inutiles, sauf B.5
 *  qui reste volontairement visible avec ses valeurs reprises des modalités d'inscription.
 *  `dossier` = feuille assemblée par le backend (null si indisponible). */
function questionsDejaRepondues(dossier) {
  const masque = {};
  // Droits d'inscription : ils restent visibles dans B.5 pour que l'organisateur voie
  // immédiatement le « oui » et le montant repris des modalités d'inscription.
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
  AUTORISATION_SAISIE.forEach(function (grp, index) {
    const champs = grp.champs.filter(function (c) {
      if (masque[c.p]) { nbMasquees++; return false; }
      return true;
    });
    if (!champs.length) return;
    html += '<details class="cv-options cv-autorisation-section"' + (index === 0 ? ' open' : '') + '><summary>' + echapper(grp.titre) + '</summary><fieldset class="autorisation-groupe"><legend>' + echapper(grp.titre) + '</legend>';
    html += champs.map(champSaisieAutorisation).join('');
    html += '</fieldset></details>';
  });

  // B.2 — Récompenses par catégorie présente.
  const cats = catsPresentesAutorisation();
  if (cats.length) {
    html += '<details class="cv-options cv-autorisation-section"><summary>B.2 — Récompenses par catégorie</summary><fieldset class="autorisation-groupe"><legend>B.2 — Récompenses par catégorie</legend>';
    html += cats.map(function (c) {
      const nom = String(c.categorie || '').trim();
      const v = valAutorisation('org_recompenses_' + nom);
      return '<label class="reglage"><span class="r-libelle">' + echapper(nom) + ' — récompenses</span>' +
        '<select class="r-input" name="org_recompenses_' + echapper(nom) + '"><option value="">—</option>' +
        ['non', 'oui'].map(function (o) { return '<option value="' + o + '"' + (v === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
        '</select></label>';
    }).join('');
    html += '</fieldset></details>';
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
    'Adresse et modalités de dépôt : à confirmer auprès du Comité départemental ou de la Ligue. ' +
    'Avis et signatures : hors de cette feuille.</p>';
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
  autorisationComptes = null;                       // même raison qu'en B2-0.5 : ils décrivent la feuille effacée
  autorisationDossierCourant = null;
  estimationPublicCourante = null;
  autorisationEstimationErreur = '';
  afficherEstimationPublicAutorisation();
  afficherDpsAutorisation();
  if (typeof afficherMunicipalAutorisation === 'function') afficherMunicipalAutorisation();
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
  enregistrerInfosTournoi:       'A.2 nom/lieu/adresse/date — et A.3 (le mois choisit les formes ; catégories présentes, choix envoyé avec les infos)',
  enregistrerHoraires:           'A.2 heures de début et de fin',
  enregistrerCategorie:          'A.3 catégories présentes, B.2 format et durée de match',
  supprimerCategorie:            'A.3, B.2',
  appliquerValeursFFR:           'A.3, B.2 (durées et forme de jeu écrites dans la catégorie)',
  enregistrerPlanTerrains:       'B.1 nombre de terrains et nature de la surface',
  // Lot « Terrains » : l'écriture groupée d'« Appliquer aux catégories » touche les MÊMES données que
  // `enregistrerCategorie` et `enregistrerPlanTerrains` réunies. ⛔ Absente de cette liste, elle aurait
  // laissé la feuille FFR se croire à jour après avoir changé les catégories.
  appliquerRepartitionTerrains:  'A.3, B.1, B.2 (terrains des catégories + composition des grands terrains)',
  // ⭐ Lot « Poules & planning » : la piste d'arbitrage écrit soit un horaire global, soit une
  //   ligne de catégorie — deux familles que la feuille d'autorisation lit déjà.
  appliquerArbitrageEtRegenerer: 'A.3, B.1 (réglage d’horaires ou de catégorie appliqué par une piste d’arbitrage)',
  enregistrerContactsSecurite:   'B.4 responsable sécurité, antenne de secours',
  enregistrerInvitation:         'B.5 droits d\'inscription (tarif_engagement_*)',
  enregistrerSurPlace:           'B.5 goûter de fin de tournoi (prix par personne)',
  ajouterClubInvite:             'A.4 (le nom du club sert au rapprochement des équipes)',
  modifierStatutClubInvite:      'A.4 clubs et participants, B.3 éducateurs',
  modifierClubInvite:            'A.4',
  supprimerClubInvite:           'A.4, B.3',
  enregistrerCategoriesEngagees: 'A.4 équipes créées ou retirées',
  creerEquipesClub:              'A.4',
  creerJeuDemoRacing:            'A.4 clubs, équipes et participants, B.3 éducateurs (jeu de démonstration)',
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
  publierTournoi:           'drapeau de publication',
  enregistrerAffiche:       'image de l\'affiche',
  supprimerAffiche:         'image de l\'affiche',
  enregistrerPhotoParking:  'image du parking',
  supprimerPhotoParking:    'image du parking',
  envoyerInvitationClub:    'invitation_envoyee — non lue par la feuille',
  envoyerInvitationsGroupe: 'invitation_envoyee — non lue par la feuille',
  envoyerDossierEmail:      'dossier_envoye — non lue par la feuille',
  regenererJetonClub:       'club_token — non lu par la feuille',
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
  // `affiche` / `tournoi_affiche_id` : l'affiche voyage désormais avec les infos (contrat d'écriture) ;
  // elle reste sans impact, exactement comme `enregistrerAffiche` (liste C ci-dessus).
  enregistrerInfosTournoi: ['tournoi_description', 'zone_vacances', 'perfs_mot_cle_club',
                            'affiche', 'tournoi_affiche_id'],
  enregistrerInvitation:   ['date_limite_confirmation', 'tarif_engagement_modalites',
                            'parking_texte', 'encadrement_ratio', 'encadrement_diplomes',
                            'assurance_attestation_requise'],
  enregistrerSurPlace:     ['buvette_disponible', 'espace_sandwich_disponible', 'boutique_disponible'],
  // Horaires : la feuille ne lit que `heure_debut` et la fin (`heure_fin_projetee || heure_fin_matin || heure_fin`,
  // getDossierAutorisation) — contrôlé par tests/ecran-horaires-surface.test.js contre le vrai Code.gs.
  enregistrerHoraires:     ['heure_fin_auto', 'battement_terrain_min', 'pause_dejeuner_debut', 'pause_dejeuner_duree_min',
                            'heure_rdv', 'heure_fin_communiquee', 'marge_fin_communiquee_min', 'pause_echelonnee']
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

/* ⭐ BORNE DE LA LECTURE DE LA FEUILLE.
 *  🔬 LE DÉFAUT FERMÉ ICI : `getDossierAutorisation` était la DERNIÈRE lecture admin émise SANS
 *  aucun délai. Un serveur muet (Apps Script en file derrière une autre exécution, réseau qui ne
 *  rend jamais la main) laissait donc l'écran sur « Feuille de report en cours de rechargement… »
 *  INDÉFINIMENT : aucun message, aucun échec, aucun moyen de réessayer autrement qu'en rechargeant
 *  la page. ⭐ Avec la borne, api.js abandonne, retente UNE fois (l'action est dans sa liste fermée
 *  de lectures rejouables), puis l'échec est AFFICHÉ avec son bouton « Réessayer ».
 *  ⛔ Un délai côté client n'ANNULE PAS le backend : l'exécution Apps Script se poursuit chez
 *  Google. Comme cette action est une LECTURE (aucun verrou, aucune écriture), cette poursuite
 *  n'a aucun effet observable — c'est précisément ce qui rend l'abandon sûr ici.
 *  ⚠️ DEUX NOMBRES, ET ILS NE DISENT PAS LA MÊME CHOSE. `delaiMs` borne UNE TENTATIVE ; `budgetMs`
 *  borne l'ATTENTE TOTALE, rejeu compris. Sans budget, une lecture rejouable à 30 s par tentative
 *  pouvait faire patienter près de 60 s — le double de ce que l'écran annonçait. On borne donc le
 *  total à 30 s, en deux tentatives de 15 s : le message affiché dit le temps RÉELLEMENT attendu.
 *  ⛔ Ni l'un ni l'autre n'annule l'exécution Apps Script : elle se poursuit chez Google. */
var DELAI_LECTURE_AUTORISATION_MS = 15000;
var BUDGET_LECTURE_AUTORISATION_MS = 30000;

/* ⭐ LES COMPTES BRUTS renvoyés par le serveur avec la feuille (clubs, équipes, participants,
 *  éducateurs). Ils remplacent, pour le PDF officiel, un SECOND calcul fait dans le navigateur à
 *  partir de `clubsInvitesCourants` — donc aussi la lecture `listerClubsInvites` qui l'alimentait.
 *  ⛔ `null` = le serveur ne les a pas fournis (backend d'avant ce lot, ou lecture en échec) : le
 *  PDF reprend alors EXACTEMENT le chemin d'avant, liste des clubs comprise. */
var autorisationComptes = null;

/* ⭐ LE SERVEUR JOINT-IL LA CONFIG À LA FEUILLE ? Observé sur la dernière lecture RÉUSSIE ; `null`
 *  tant qu'aucune n'a abouti. Sert au seul rattrapage d'obsolescence, qui émettait un
 *  `getConfigAdmin` AVANT chaque relecture — une exécution Apps Script entière pour un onglet que
 *  la lecture suivante relisait de toute façon.
 *  ⛔ CE N'EST PAS UNE DEVINETTE DE VERSION : c'est le constat d'une réponse déjà reçue. Un backend
 *  d'avant laisse le drapeau à `false` et la relecture de config reste émise, exactement comme avant.
 *  ⚠️ SEULE FENÊTRE D'ERREUR : un backend REVENU EN ARRIÈRE pendant la session. Le premier rattrapage
 *  suivant sauterait la relecture, puis remettrait le drapeau à `false` — le suivant la ferait. La
 *  conséquence est bornée et ne touche AUCUNE valeur `org_*` : aucune action du crochet n'en écrit
 *  (voir B2-0.5 §3), seule la liste des catégories des récompenses pourrait être d'un tour en retard. */
var autorisationServeurPorteConfig = null;
var autorisationEstimationErreur = '';
/* Le DPS partage exactement le même instantané : jamais de seconde lecture pour le recomposer. */
var autorisationDossierCourant = null;
/* ⛔ Borne dure du rattrapage : on ne boucle jamais sans fin, même si une écriture arrive à
   chaque tour. Au-delà, la dette RESTE et sera reprise à la prochaine ouverture. */
var AUTORISATION_TOURS_MAX = 5;

function afficherDpsAutorisation() {
  if (typeof afficherDpsDepuisAutorisation !== 'function') return;
  afficherDpsDepuisAutorisation(autorisationDossierCourant,
    typeof configCourante === 'undefined' ? null : configCourante,
    typeof estimationPublicCourante === 'undefined' ? null : estimationPublicCourante,
    autorisationEstimationErreur);
}

function afficherMunicipalAutorisation() {
  if (typeof afficherMunicipalDepuisAutorisation !== 'function') return;
  afficherMunicipalDepuisAutorisation(autorisationDossierCourant,
    typeof configCourante === 'undefined' ? null : configCourante,
    typeof estimationPublicCourante === 'undefined' ? null : estimationPublicCourante,
    autorisationEstimationErreur);
}

function libelleDeplacementPublic(mode) {
  return { groupe: 'Transport groupé', libre: 'Familles autonomes', mixte: 'Déplacement mixte' }[mode] || 'Non renseigné';
}

function rendreEstimationPublicAutorisation(estimation, erreur) {
  if (!estimation || estimation.contrat !== 'estimation-public-1') {
    return '<div class="autorisation-public-etat"' + (erreur ? ' role="alert"' : '') + '>' +
      (erreur ? '⚠️ Estimation indisponible : ' + echapper(erreur) : 'Estimation en cours de chargement…') + '</div>';
  }
  var renseignes = Number(estimation.renseignes || 0);
  var participants = Number(estimation.participants || 0);
  var incomplets = Math.max(0, participants - renseignes);
  var avertissement = erreur
    ? '<div class="autorisation-public-alerte" role="alert">⚠️ Actualisation impossible : dernière estimation connue affichée.</div>'
    : (incomplets
      ? '<div class="autorisation-public-alerte"><strong>Estimation encore incomplète.</strong> ' + incomplets +
        ' club' + (incomplets > 1 ? 's participants n’ont' : ' participant n’a') +
        ' pas encore fourni un déplacement exploitable. ' + (incomplets > 1 ? 'Ils ne sont' : 'Il n’est') +
        ' pas ajouté' + (incomplets > 1 ? 's' : '') + ' au chiffre au hasard.</div>'
      : '');
  var cartes = '<div class="autorisation-public-cartes">' +
    '<div class="est-principale"><span>Estimation centrale</span><strong>' + Number(estimation.centrale || 0) +
      '</strong><small>spectateurs, hors joueurs et éducateurs</small></div>' +
    '<div><span>Hypothèse basse</span><strong>' + Number(estimation.basse || 0) + '</strong></div>' +
    '<div><span>Hypothèse haute</span><strong>' + Number(estimation.haute || 0) + '</strong></div>' +
    '<div><span>Couverture</span><strong>' + renseignes + '/' + participants + '</strong><small>clubs invités répondants</small></div>' +
    '</div>';
  var methode = '<details class="autorisation-public-methode"><summary>Comprendre le barème et la méthode de calcul</summary>' +
    '<div class="autorisation-public-methode-corps"><h4>Barème par joueur engagé</h4>' +
    '<div class="autorisation-public-bareme"><div><strong>Transport groupé</strong><span>0,25 · 0,40 · 0,60</span></div>' +
    '<div><strong>Familles autonomes</strong><span>0,60 · 1,10 · 1,80</span></div>' +
    '<div><strong>Déplacement mixte</strong><span>0,50 · 0,80 · 1,20</span></div></div>' +
    '<h4>Ajustements appliqués</h4><ul><li>U6 et U8 : coefficient majoré de 20 %.</li>' +
    '<li>U12 : coefficient réduit de 20 %.</li><li>Le nombre d’équipes groupées affine le mode mixte.</li>' +
    '<li>Les joueurs et les éducateurs ne sont pas comptés dans le public.</li></ul>' +
    '<h4>Construction de la fourchette</h4><p>Le calcul est fait club par club. Les estimations centrales sont additionnées ; ' +
    'les écarts bas et hauts sont combinés statistiquement, sans additionner mécaniquement tous les scénarios extrêmes.</p>' +
    '<p class="autorisation-public-note"><strong>Périmètre :</strong> clubs invités ayant répondu. Le public du club organisateur ' +
    'n’est pas encore inclus. Sans distance calculée, « familles autonomes » conserve volontairement une fourchette large.</p></div></details>';
  var contributions = Array.isArray(estimation.contributions) ? estimation.contributions : [];
  var tableau = '';
  if (contributions.length) {
    tableau = '<div class="autorisation-public-tableau"><h4>Contribution des réponses reçues</h4><div class="table-scroll"><table>' +
      '<thead><tr><th scope="col">Club</th><th scope="col">Déplacement</th><th scope="col">Joueurs</th>' +
      '<th scope="col">Centrale</th><th scope="col">Haute</th></tr></thead><tbody>' +
      contributions.map(function (c) { return '<tr><th scope="row">' + echapper(c.club || 'Club') + '</th><td>' +
        echapper(libelleDeplacementPublic(c.mode)) + '</td><td>' + Number(c.joueurs || 0) + '</td><td>' +
        Number(c.centrale || 0) + '</td><td><strong>' + Number(c.haute || 0) + '</strong></td></tr>'; }).join('') +
      '</tbody></table></div></div>';
  } else {
    tableau = '<p class="autorisation-public-vide">Aucune réponse exploitable pour calculer une estimation.</p>';
  }
  return avertissement + cartes + methode + tableau +
    '<p class="autorisation-public-limite">Estimation indicative : elle ne remplace pas le dimensionnement du dispositif de secours.</p>';
}

function afficherEstimationPublicAutorisation() {
  var zone = document.getElementById('autorisation-public-attendu');
  if (!zone) return;
  zone.innerHTML = rendreEstimationPublicAutorisation(
    typeof estimationPublicCourante === 'undefined' ? null : estimationPublicCourante,
    autorisationEstimationErreur);
}

/** Efface la FEUILLE affichée — ⛔ jamais le formulaire de saisie : aucune action du crochet
 *  n'écrit de champ `org_*`, et l'effacer perdrait une saisie en cours (voir B2-0.5 §3).
 *  ⚠️ À ne pas confondre avec `invaliderAutorisationAffichee` (B2-0.3), qui efface LES DEUX
 *  parce qu'une réinitialisation, elle, vide réellement 26 champs `org_*`. */
function invaliderFeuilleAutorisationAffichee() {
  // ⛔ Les COMPTES tombent avec la feuille : ils viennent du MÊME assemblage et décrivent le même
  //   instant. Les garder alimenterait le PDF avec des nombres que la feuille ne montre plus —
  //   exactement le mensonge silencieux que l'invalidation existe pour empêcher.
  autorisationComptes = null;
  autorisationDossierCourant = null;
  estimationPublicCourante = null;
  autorisationEstimationErreur = '';
  afficherEstimationPublicAutorisation();
  afficherDpsAutorisation();
  if (typeof afficherMunicipalAutorisation === 'function') afficherMunicipalAutorisation();
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
  autorisationPhotographierBase();
}

/* ⭐ L'ÉTAT DE DÉPART DU FORMULAIRE — le troisième terme de la fusion à trois voies du serveur.
 *
 * 🔬 LE DÉFAUT QU'IL FERME. Le formulaire poste ses 36 champs à chaque clic, y compris ceux que
 * l'organisateur n'a pas touchés. Deux sessions ouvertes sur le même tournoi : A change le code club
 * et enregistre ; B, qui avait ouvert son écran AVANT, change seulement le nombre d'arbitres et
 * enregistre ensuite. Sans état de départ, B repostait l'ANCIEN code club, et le serveur — qui
 * voyait simplement une valeur différente de celle enregistrée — l'écrivait. ⛔ Le travail de A
 * disparaissait SANS UN MOT.
 *
 * ⭐ Ce que l'on photographie, c'est ce que l'organisateur A SOUS LES YEUX : les valeurs telles que
 * le formulaire vient d'être rendu, lues dans le DOM — donc exactement ce que le submit enverra si
 * l'on ne touche à rien. ⛔ Pas `configCourante` : le formulaire affiche aussi des valeurs
 * PRÉ-REMPLIES depuis d'autres cartes (tarifs, repas, goûters), et la base doit décrire l'écran,
 * pas le classeur.
 * ⚠️ Les champs GRISÉS y figurent aussi : `form.elements` les envoie, ils doivent donc être protégés
 * comme les autres. */
/* Valeurs BRUTES `org_*` telles que `Config` les portait au moment du rendu. */
var autorisationBase = null;
/* Valeurs AFFICHÉES à l'organisateur au moment du rendu. */
var autorisationBaseAffichee = null;

/* ⛔ DEUX PHOTOS, ET NON UNE. Six champs de B.5 sont PRÉ-REMPLIS depuis une autre carte : l'écran
   affiche `60` là où `Config` peut ne rien porter, ou porter `50`. Une photo unique, prise dans le
   DOM, faisait donc comparer au serveur une valeur AFFICHÉE à une valeur ENREGISTRÉE : un
   préremplissage parfaitement normal passait pour une modification concurrente.
     · `autorisationBaseAffichee` — ce que l'organisateur A SOUS LES YEUX ⇒ « a-t-il touché ? » ;
     · `autorisationBase` — ce que `Config` PORTAIT ⇒ « quelqu'un d'autre l'a-t-il changé ? ». */
function autorisationPhotographierBase() {
  const form = document.getElementById('form-autorisation');
  if (!form) { autorisationBase = null; autorisationBaseAffichee = null; return; }
  const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
  const affichee = {}, brute = {};
  Array.prototype.forEach.call(form.elements, function (el) {
    if (!el.name || el.name.indexOf('org_') !== 0) return;
    affichee[el.name] = String(el.value == null ? '' : el.value).trim();
    // ⛔ La valeur BRUTE vient de la config qui a servi à rendre ce formulaire, jamais du DOM.
    brute[el.name] = String(g[el.name] == null ? '' : g[el.name]).trim();
  });
  autorisationBaseAffichee = affichee;
  autorisationBase = brute;
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

/** Le formulaire porte-t-il une saisie DÉMONTRÉE — et non « peut-être » ?
 *  ⭐ Le miroir STRICT d'`autorisationSaisieModifiee` : celle-ci répond « oui » dans le doute pour
 *  conserver ; celle-là n'affirme que sur preuve. ⛔ Les deux sont nécessaires, et pour des rôles
 *  opposés : la première PROTÈGE un chemin qui avait le droit de reconstruire, la seconde OUVRE une
 *  protection nouvelle sans modifier la conduite d'aucun chemin existant. */
function autorisationFrappeProuvee() {
  if (!document.getElementById('form-autorisation')) return false;
  if (typeof assistantSerialiser !== 'function') return false;
  if (autorisationSaisiePhoto == null) return false;
  return autorisationSaisieModifiee();
}

/** Remplace le formulaire en REPOSANT le focus et le curseur là où ils étaient.
 *  🔬 Sans cela, l'arrivée du dossier — jusqu'à 30 s après l'affichage du formulaire — arrachait le
 *  focus du champ en cours de lecture, au clavier comme au lecteur d'écran. ⛔ Le champ peut avoir
 *  DISPARU (c'est tout l'objet du masque) : on ne repose alors rien plutôt que de deviner. */
function remplacerSaisieAutorisation(zone, html) {
  const actif = document.activeElement;
  const dansForm = !!(actif && actif.name && actif.closest && actif.closest('#form-autorisation'));
  const nom = dansForm ? actif.name : null;
  let debut = null, fin = null;
  if (dansForm) { try { debut = actif.selectionStart; fin = actif.selectionEnd; } catch (e) { debut = null; } }
  zone.innerHTML = html;
  if (!nom) return;
  const sel = (window.CSS && CSS.escape) ? CSS.escape(nom) : nom;
  const cible = zone.querySelector('#form-autorisation [name="' + sel + '"]');
  if (!cible || cible.disabled) return;
  cible.focus();
  if (debut != null && typeof cible.setSelectionRange === 'function') {
    try { cible.setSelectionRange(debut, fin); } catch (e) { /* type sans sélection (select, number) */ }
  }
}

/** Les comptes du serveur, ou `null` s'ils ne sont pas EXPLOITABLES.
 *  ⛔ Un compte manquant ou non numérique rend l'objet ENTIER inutilisable : on ne mélange jamais
 *  une moitié de comptes serveur avec une moitié recalculée dans le navigateur — le PDF afficherait
 *  alors une addition qui n'a été faite nulle part. Tout ou rien, et le repli est complet. */
function comptesAutorisationValides(c) {
  if (!c || typeof c !== 'object') return null;
  const cles = ['nbClubsAcceptes', 'nbClubsEquipes', 'nbEquipes', 'nbParticipants', 'nbEducateurs'];
  for (let i = 0; i < cles.length; i++) {
    const v = c[cles[i]];
    if (typeof v !== 'number' || !isFinite(v) || v < 0) return null;
  }
  return c;
}

/** La feuille est-elle SOUS LES YEUX de l'organisateur en ce moment ?
 *  Deux modes guidés et un repli, trois réponses — l'écran « autorisation » ne contient QUE
 *  `bloc-autorisation`, donc en mode écrans/assistant nul ne peut enregistrer une autre
 *  carte tout en la regardant : la relecture y attend légitimement la navigation. */
function autorisationEstAffichee() {
  if (!document.getElementById('bloc-autorisation')) return false;
  const ecran = document.getElementById('ecran-autorisation');   // mode « écrans » (≥ 1024px)
  if (ecran) return !ecran.hidden;
  if (document.getElementById('asst-track')) return false;       // assistant : relu à l'arrivée
  return true;                                    // repli HTML sans mode guidé : page longue
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
  // ⭐ Contrat d'écriture (`ecriture-v1`) : le serveur dit quels champs ont RÉELLEMENT changé.
  //   Rien de changé : la feuille ne peut pas être devenue fausse. Sinon, seuls ces champs comptent —
  //   renvoyer un formulaire entier inchangé ne coûte plus une relecture de la feuille.
  //   ⛔ Sans cette preuve (backend d'avant le contrat), on juge sur les champs ENVOYÉS, comme avant.
  const modifies = (reponse && reponse.contrat === 'ecriture-v1' && Array.isArray(reponse.modifies))
    ? reponse.modifies : null;
  if (modifies && modifies.length === 0) return false;
  // ② Écriture partielle dont AUCUN champ n'est lu par la feuille (voir la liste ci-dessus).
  const sansImpact = CHAMPS_SANS_IMPACT_AUTORISATION[action];
  if (sansImpact && (modifies || data)) {
    const cles = modifies || Object.keys(data).filter(function (c) { return c !== 'cle'; });
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
  afficherEstimationPublicAutorisation();
  // ⭐ Une réponse est DÉPASSÉE si une écriture est arrivée depuis le départ de la requête.
  //   ⛔ Sans `revisionCible` (appels historiques : initAdmin, reset, enregistrement du
  //   dossier), ce contrôle est inactif — le comportement d'avant est intact.
  const depassee = function () {
    return opt.revisionCible != null && opt.revisionCible !== autorisationRevision;
  };
  /* ⭐ LE PREMIER AFFICHAGE UTILE PART AVANT LE RÉSEAU — et c'est le cœur de ce lot.
   *
   * 🔬 LE DÉFAUT MESURÉ. Le formulaire de saisie ne dépend QUE de `configCourante`, déjà chargée à
   * l'ouverture de l'administration. Il était pourtant rendu APRÈS la réponse de
   * `getDossierAutorisation` — parce que `questionsDejaRepondues` a besoin du dossier pour masquer
   * deux ou trois questions auxquelles l'app répond déjà. Résultat : en arrivant sur l'écran,
   * l'organisateur regardait une page VIDE (les deux zones sont vides dans le HTML) pendant tout
   * l'aller-retour serveur — une lecture qui relit Config, Equipes, Clubs, Participations, Matchs
   * et le référentiel. Toute la page attendait une donnée SECONDAIRE dont le seul effet est de
   * RETIRER des questions.
   *
   * ⭐ LA CORRECTION : on rend le formulaire TOUT DE SUITE, sans masque — c'est-à-dire COMPLET.
   * ⛔ Ce n'est pas un affichage « approximatif » corrigé après coup : c'est exactement ce que la
   * fonction affiche déjà quand le réseau échoue (« aucun masquage sans certitude »). Le pire cas
   * reste « on pose une question de plus », jamais « on affiche du faux ». Et la feuille, elle,
   * annonce honnêtement qu'elle charge au lieu de rester blanche.
   * ⚠️ DEUX CONDITIONS, et les deux comptent :
   *   · `afficherTot` — posé par le REGISTRE seul (`ADMIN_RESSOURCES.dossierAutorisation`, admin.js),
   *     c'est-à-dire par les deux chemins dont on SAIT que `configCourante` vient d'être rafraîchie :
   *     l'arrivée sur l'écran et le rafraîchissement forcé après une réinitialisation. ⛔ Sans lui,
   *     les autres chemins gardent leur comportement exact — on ne peindra jamais un formulaire
   *     depuis une config dont on ne peut pas affirmer qu'elle est à jour (défaut B2-0.3) ;
   *   · zone VIDE — on ne repeint jamais par-dessus un formulaire déjà là, ni une saisie en cours. */
  const saisieVide = !zoneSaisie.innerHTML;
  if (opt.afficherTot && saisieVide) {
    zoneSaisie.innerHTML = rendreSaisieAutorisation({});
    if (typeof autorisationPhotographierSaisie === 'function') autorisationPhotographierSaisie();
    if (!zoneFeuille.innerHTML) {
      zoneFeuille.innerHTML = '<div class="ffr-bloc ffr-neutre">Feuille de report en cours de ' +
        'chargement…</div>';
    }
  }
  let dossier = null;
  let reseauOk = true;
  let echec = null;
  try {
    const rep = await apiPostProtege('getDossierAutorisation', {}, 'admin', 'admin',
      { delaiMs: DELAI_LECTURE_AUTORISATION_MS, budgetMs: BUDGET_LECTURE_AUTORISATION_MS });
    if (depassee()) return { ok: false, motif: 'revision-depassee' };
    dossier = (rep && rep.dossier) || null;
    // ⭐ Les comptes du serveur : ils dispensent le PDF de la lecture `listerClubsInvites`.
    //   ⛔ Absents (backend d'avant), ils restent `null` — le PDF reprend le chemin d'avant.
    autorisationComptes = comptesAutorisationValides(rep && rep.comptes);
    estimationPublicCourante = (rep && rep.estimation_public) || null;
    autorisationEstimationErreur = '';
    afficherEstimationPublicAutorisation();
    // ⭐ La config voyage avec la feuille depuis ce lot : le rattrapage d'obsolescence n'a plus à
    //   émettre un `getConfigAdmin` séparé. ⛔ Absente (backend d'avant) : rien n'est touché, et
    //   l'appelant garde sa relecture — voir `majAutorisationSiObsolete`.
    const configFournie = !!(rep && rep.config && rep.config.global && Array.isArray(rep.config.categories));
    if (configFournie) configCourante = rep.config;
    autorisationServeurPorteConfig = configFournie;
    autorisationDossierCourant = dossier;
    afficherDpsAutorisation();
    if (typeof afficherMunicipalAutorisation === 'function') afficherMunicipalAutorisation();
    zoneFeuille.innerHTML = rendreFeuilleAutorisation(dossier);
  } catch (e) {
    if (depassee()) return { ok: false, motif: 'revision-depassee' };
    reseauOk = false;
    autorisationComptes = null;
    autorisationEstimationErreur = String((e && e.message) || 'erreur réseau').replace(/\.\s*$/, '');
    afficherEstimationPublicAutorisation();
    afficherDpsAutorisation();
    if (typeof afficherMunicipalAutorisation === 'function') afficherMunicipalAutorisation();
    // ⛔ On ne dit plus « connecte-toi avec la clé admin » quoi qu'il arrive : c'était la seule
    //   explication proposée, et elle était FAUSSE dans le cas le plus fréquent — un serveur lent
    //   ou muet. Le motif réel est nommé, et « Réessayer » relance la lecture sans recharger.
    // ⭐ On annonce le BUDGET TOTAL, pas le délai d'une tentative : c'est ce que l'organisateur
    //   a réellement attendu (deux tentatives de 15 s). ⛔ Annoncer « 15 s » après 30 s d'attente
    //   serait faux ; annoncer « 30 s » alors qu'on pouvait patienter 60 s l'était aussi.
    echec = (e && e.name === 'AbortError')
      ? 'aucune réponse en ' + Math.round(BUDGET_LECTURE_AUTORISATION_MS / 1000) + ' s (2 tentatives)'
      : String((e && e.message) || 'erreur réseau').replace(/\.\s*$/, '');
    zoneFeuille.innerHTML = '<div class="ffr-bloc ffr-orange">⚠️ Feuille de report indisponible : ' +
      echapper(echec) + '. <button type="button" class="bouton bouton-secondaire" ' +
      'id="bouton-reessayer-autorisation">Réessayer</button></div>';
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
  } else if (autorisationFrappeProuvee()) {
    /* ⭐ LA CONTREPARTIE OBLIGATOIRE DE L'AFFICHAGE PRÉCOCE. Le formulaire existant désormais AVANT
     *   la réponse du serveur, l'organisateur peut y taper pendant l'attente ; le reconstruire à
     *   l'arrivée du dossier effacerait ce qu'il vient d'écrire — une fenêtre de perte de saisie
     *   que l'ancien code n'avait pas, faute de formulaire à remplir.
     * ⛔ Ce contrôle-ci est STRICT, là où `autorisationSaisieModifiee` répond « oui » dans le doute :
     *   il exige une PREUVE (outil de photo présent, photo prise, contenu différent). Sans preuve,
     *   on retombe exactement sur la règle d'avant — aucun chemin existant ne change de conduite. */
    saisie = 'preservee-saisie-en-cours';
  } else {
    const voulu = rendreSaisieAutorisation(questionsDejaRepondues(dossier));
    if (voulu === zoneSaisie.innerHTML) {
      /* ⭐ RIEN À CHANGER, DONC ON NE TOUCHE PAS AU DOM. Le cas ORDINAIRE depuis l'affichage
       *   précoce : le dossier n'a aucune question à masquer, le formulaire rendu d'avance est
       *   déjà le bon. ⛔ Le réécrire à l'identique détruirait quand même le focus et la position
       *   du curseur — une régression clavier invisible à l'œil. */
      saisie = 'inchangee';
    } else {
      remplacerSaisieAutorisation(zoneSaisie, voulu);
      if (typeof autorisationPhotographierSaisie === 'function') autorisationPhotographierSaisie();
    }
  }
  // ⛔ AUCUNE INSCRIPTION ICI (R2). Cette fonction est une lecture BRUTE : c'est le registre
  //   qui retient, et lui seul — sinon une lecture ancienne pourrait remettre « chargée » une
  //   feuille qu'une écriture vient de périmer. ⚠️ Ne l'appelle pas directement : passe par
  //   `assurerRessourceAdmin` / `rafraichirRessourceAdmin`, ou par `enfilerLectureAdmin` si tu
  //   as besoin du verdict détaillé (c'est le cas du rattrapage d'obsolescence ci-dessous).
  if (!reseauOk) return { ok: false, motif: 'reseau', saisie: saisie };
  return { ok: true, feuille: 'relue', saisie: saisie };
}

/**
 * ⭐ LA SEULE PORTE DE RELECTURE DE LA FEUILLE (R2A) — enfilée, donc jamais concurrente.
 *
 * ⛔ POURQUOI ELLE EXISTE. `majAutorisation` est une lecture BRUTE, et TROIS chemins la
 * relisent : l'arrivée sur l'écran (par le registre), le rattrapage d'obsolescence, et
 * l'enregistrement des champs `org_*`. Les deux derniers ont besoin du VERDICT DÉTAILLÉ —
 * `revision-depassee` n'est PAS une panne — que le contrat booléen de
 * `rafraichirRessourceAdmin` ne rend pas. Chacun s'était donc arrangé de son côté, et
 * l'enregistrement appelait carrément `majAutorisation` EN DIRECT, hors de toute file : sa
 * relecture pouvait voler en même temps qu'une lecture différée ou qu'un rattrapage, et la
 * plus ANCIENNE des deux repeindre l'écran en dernier.
 *
 * ⭐ Une seule porte désormais, sur LA MÊME file et LA MÊME mémoire que toutes les autres
 * lectures de `dossierAutorisation` (`enfilerLectureAdmin` / `marquerRessourceAdmin`,
 * admin.js). ⛔ Aucune seconde file, aucune seconde mémoire.
 *
 * ⛔ `revision-depassee` NE TOUCHE PAS à la mémoire : rien n'a été peint, la dette est intacte,
 * et le rattrapage normal s'en chargera. Une panne, elle, remet la ressource « à relire ».
 *
 * @param  {Object} opt  options passées TELLES QUELLES à `majAutorisation`
 * @return {Promise<Object>} le bilan BRUT — { ok, motif, saisie, feuille }
 */
async function relireAutorisation(opt) {
  const relire = function () { return majAutorisation(opt); };
  const bilan = (typeof enfilerLectureAdmin === 'function')
    ? await enfilerLectureAdmin('dossierAutorisation', relire)
    : await relire();
  if (typeof marquerRessourceAdmin === 'function' && bilan && bilan.motif !== 'revision-depassee') {
    marquerRessourceAdmin('dossierAutorisation', !!bilan.ok);
  }
  return bilan;
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
      // ⭐ La config VOYAGE désormais avec la feuille : quand la dernière lecture réussie l'a
      //   apportée, ce `getConfigAdmin` est une requête pour rien — `majAutorisation` l'adopte
      //   elle-même, avant de rendre le formulaire. ⛔ Drapeau à `false` ou inconnu (backend
      //   d'avant, aucune lecture encore aboutie) : on relit, exactement comme avant.
      if (autorisationServeurPorteConfig !== true && typeof lireConfigAdmin === 'function') {
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
      // ⭐ R2A — le rattrapage passe par la PORTE UNIQUE : enfilé sur la file de la ressource,
      //   il ne peut croiser ni une lecture de navigation, ni un rafraîchissement forcé, ni la
      //   relecture qui suit un enregistrement de champs.
      const bilan = await relireAutorisation({ preserverSaisie: true, revisionCible: cible });
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

/* ⭐ BORNE DE L'ÉCRITURE — 30 s par tentative, comme les deux écritures de l'écran « Terrains ».
 *  ⛔ Une ÉCRITURE n'est JAMAIS rejouée par api.js (elle n'est dans aucune liste fermée) : la borne
 *  ne sert qu'à rendre la main à l'organisateur et à libérer le bouton. ⚠️ Elle n'ANNULE RIEN côté
 *  Google — l'exécution peut aboutir après l'abandon. C'est pourquoi le message ne dit jamais que
 *  rien n'a été écrit : il dit que l'issue est incertaine, et un nouveau clic est sans danger
 *  (rejouer le MÊME formulaire n'écrit rien de plus, `modifies: []`). */
var DELAI_ECRITURE_AUTORISATION_MS = 30000;

/** Applique la réponse d'une écriture AU CONTRAT : la config et la feuille relues par le serveur.
 *  @return {boolean} vrai si la réponse était exploitable et a été appliquée — faux sinon, et
 *    l'appelant reprend alors le chemin de relecture d'avant, sans rien avoir touché.
 *  ⛔ TOUT OU RIEN : on n'adopte la config que si la feuille suit, et inversement. Une réponse à
 *    moitié exploitable laisserait l'écran avec un formulaire d'aujourd'hui et une feuille d'hier. */
function appliquerEnregistrementAutorisation(res) {
  const contrat = (typeof CONTRAT_ECRITURE === 'string') ? CONTRAT_ECRITURE : 'ecriture-v1';
  if (!res || res.contrat !== contrat) return false;
  const cfg = res.config;
  const dossier = res.dossier;
  if (!cfg || !cfg.global || typeof cfg.global !== 'object' || !Array.isArray(cfg.categories)) return false;
  if (!dossier || !Array.isArray(dossier.sections)) return false;
  const zoneSaisie = document.getElementById('autorisation-saisie');
  const zoneFeuille = document.getElementById('autorisation-feuille');
  if (!zoneSaisie || !zoneFeuille) return false;
  configCourante = cfg;
  autorisationComptes = comptesAutorisationValides(res.comptes);
  autorisationServeurPorteConfig = true;
  zoneFeuille.innerHTML = rendreFeuilleAutorisation(dossier);
  // ⭐ Le formulaire est reconstruit sur la config RELUE — et seulement s'il change réellement,
  //   avec le focus reposé : après « Enregistrer », le focus est sur le bouton (hors formulaire),
  //   mais un organisateur au clavier peut l'avoir déjà ramené dans un champ.
  const voulu = rendreSaisieAutorisation(questionsDejaRepondues(dossier));
  if (voulu !== zoneSaisie.innerHTML) {
    remplacerSaisieAutorisation(zoneSaisie, voulu);
    if (typeof autorisationPhotographierSaisie === 'function') autorisationPhotographierSaisie();
  } else if (typeof autorisationPhotographierSaisie === 'function') {
    // ⛔ La photo doit suivre l'ENREGISTREMENT, même sans reconstruction : sans cela le formulaire
    //   resterait marqué « modifié » et le rattrapage suivant refuserait de le rafraîchir.
    autorisationPhotographierSaisie();
  }
  return true;
}

/** Applique le REFUS pour conflit de concurrence : la feuille passe à l'état relu, la base aussi,
 *  ⛔ et le formulaire n'est PAS touché — la saisie de l'organisateur lui appartient.
 *  @param {Object} r la réponse `modification_concurrente` du serveur (config, dossier, conflits) */
function appliquerConflitAutorisation(r, revisionAvant) {
  /* ⭐ CONTRÔLE DE FRAÎCHEUR — la MÊME discipline que pour une réponse de LECTURE.
   * 🔬 Le défaut fermé ici : ce chemin appliquait la réponse et soldait la dette sans regarder si
   * une AUTRE écriture était survenue pendant le trajet. Or un refus de concurrence décrit un état lu
   * à l'instant du refus ; si le classeur a changé depuis, cet état est déjà dépassé. Le peindre
   * remettrait à l'écran une valeur que le classeur n'a plus, et — bien pire — en faire la nouvelle
   * BASE armerait le prochain clic avec du passé.
   * ⛔ DÉPASSÉE ⇒ ON NE TOUCHE À RIEN : ni la feuille, ni la config, ni la base, ni la dette. Le
   * rattrapage normal passe par la file de la ressource — aucune requête concurrente, aucune boucle.
   * @return {boolean} vrai si la réponse était fraîche et a été appliquée */
  if (revisionAvant != null && autorisationRevision !== revisionAvant) {
    if (typeof majAutorisationSiObsolete === 'function') {
      majAutorisationSiObsolete().catch(function () { /* la feuille garde son message */ });
    }
    return false;
  }
  const zoneFeuille = document.getElementById('autorisation-feuille');
  if (r.config && r.config.global && Array.isArray(r.config.categories)) configCourante = r.config;
  autorisationComptes = comptesAutorisationValides(r.comptes);
  if (zoneFeuille && r.dossier && Array.isArray(r.dossier.sections)) {
    zoneFeuille.innerHTML = rendreFeuilleAutorisation(r.dossier);
  }
  /* ⭐ LA BASE BRUTE SUIT L'ÉTAT RELU — mais UNIQUEMENT pour les champs EN CONFLIT.
     ⛔ La rafraîchir partout armerait le second clic avec « plus personne n'a rien changé » sur des
     champs où une autre session vient justement d'écrire : un écrasement involontaire, offert par la
     correction elle-même. Les champs non conflictuels gardent donc leur base d'origine, et une
     modification concurrente y reste détectable au clic suivant.
     ⛔ `autorisationBaseAffichee` n'est PAS touchée : le DOM n'a pas changé, l'organisateur a toujours
     les mêmes valeurs sous les yeux. */
  if (autorisationBase && r.config && r.config.global) {
    const g = r.config.global;
    (r.conflits || []).forEach(function (c) {
      if (c && c.champ && Object.prototype.hasOwnProperty.call(autorisationBase, c.champ)) {
        autorisationBase[c.champ] = String(g[c.champ] == null ? '' : g[c.champ]).trim();
      }
    });
  }
  // ⛔ Le serveur n'a rien écrit, mais la feuille affichée vient d'être remplacée par l'état relu :
  //   la dette est donc soldée pour CETTE révision-là — celle d'avant l'envoi, pas une plus récente.
  autorisationRevisionLue = revisionAvant != null ? revisionAvant : autorisationRevision;
  return true;
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
  /* ⭐ L'ÉTAT DE DÉPART VOYAGE AVEC LA DEMANDE : c'est lui qui permet au serveur de distinguer
     « l'utilisateur a changé ce champ » de « il n'y a pas touché », et donc de ne pas écraser le
     travail d'une autre session. ⛔ Absent (premier rendu impossible à photographier), on n'invente
     rien : on n'envoie pas de base, et le serveur retombe sur le comportement historique. */
  if (autorisationBase) data.base = JSON.stringify(autorisationBase);
  if (autorisationBaseAffichee) data.base_affichee = JSON.stringify(autorisationBaseAffichee);
  const bouton = document.getElementById('bouton-enregistrer-autorisation');
  await avecBoutonOccupe(bouton, message, async function () {
    // ⭐ La révision D'AVANT L'ENVOI : elle sert à savoir si une AUTRE écriture est survenue
    //   pendant que celle-ci voyageait. C'est le même contrôle de fraîcheur que `revisionCible`,
    //   transposé à une réponse d'écriture — qui, elle, ne peut pas être « rejouée » plus tard.
    const revisionAvant = autorisationRevision;
    let res;
    try {
      res = await ecrireAdmin('enregistrerDossierAutorisation', data,
        { delaiMs: DELAI_ECRITURE_AUTORISATION_MS });
    } catch (erreur) {
      /* ⭐ CONFLIT DE CONCURRENCE — le seul refus que cet écran traite lui-même. Le serveur n'a RIEN
         écrit et nomme les champs que quelqu'un d'autre a changés entre-temps.
         ⛔ ON NE RECONSTRUIT PAS LE FORMULAIRE : la saisie de l'organisateur est préservée telle
         quelle — il doit pouvoir comparer, puis décider. On repeint la FEUILLE avec l'état relu, et
         l'on déplace la BASE sur cet état : un second clic, donné en connaissance de cause, imposera
         alors sa valeur. ⛔ Rien n'est jamais écrasé en silence — le premier clic a été refusé et
         les champs ont été nommés. */
      const r = erreur && erreur.reponse;
      if (!r || r.code !== 'modification_concurrente') throw erreur;
      if (!appliquerConflitAutorisation(r, revisionAvant)) {
        /* ⛔ Réponse de conflit DÉPASSÉE : on ne la présente pas comme l'état courant. L'écriture a
           bien été refusée (rien n'est écrit) et la saisie est conservée ; le rattrapage déjà lancé
           remettra la feuille à jour. */
        afficherMessage(message, '⚠️ Rien n\'a été enregistré : un autre enregistrement est passé ' +
          'entre-temps. Ta saisie est conservée ; la feuille se remet à jour, puis reclique ' +
          '« Enregistrer ».', 'ko');
        return;
      }
      afficherMessage(message, '⚠️ Modifié entre-temps ailleurs : ' +
        (r.conflits || []).map(function (c) { return c.libelle; }).join(', ') +
        '. ⛔ Rien n\'a été enregistré. La feuille ci-dessous montre les valeurs actuelles ; ' +
        'ta saisie est conservée. Recliquer « Enregistrer » imposera tes valeurs.', 'ko');
      return;
    }
    // ⭐ L'écriture a réussi : la feuille affichée est FAUSSE à cet instant. On l'efface et on
    //   note la dette AVANT de tenter le chemin propre — si celui-ci échoue, elle subsistera.
    signalerAutorisationObsolete();
    const cible = autorisationRevision;
    let relueOk = false, cibleDepassee = false;
    /* ⭐ CONTRAT D'ÉCRITURE — UN GESTE, UNE REQUÊTE. Le serveur a relu SOUS SON VERROU la config ET
     *   la feuille, et les a jointes à sa réponse : ce sont l'état RÉELLEMENT APPLIQUÉ, pas l'état
     *   demandé. Les deux lectures que ce chemin émettait ensuite (`getConfigAdmin` puis
     *   `getDossierAutorisation`, deux exécutions Apps Script) n'ont plus d'objet.
     * ⛔ UNE AUTRE ÉCRITURE EST SURVENUE PENDANT LE VOL : la réponse décrit un classeur que cette
     *   écriture-là a déjà changé. On l'AFFICHE quand même — elle est plus récente que l'écran —
     *   mais on ne solde PAS la dette : le rattrapage normal relira. ⛔ C'est exactement ce que
     *   `revisionCible` fait pour une lecture ; une réponse d'écriture ne peut pas être jetée,
     *   alors on la peint et on retient qu'il reste à lire.
     * ⛔ REPLI INTÉGRAL : un backend d'avant le contrat répond `{ ok: true }` seul — on relit alors
     *   exactement comme avant, dans le même ordre, avec le même contrôle de cible. */
    if (appliquerEnregistrementAutorisation(res)) {
      if (autorisationRevision === revisionAvant + 1) relueOk = true;   // rien d'autre n'est passé
      else cibleDepassee = true;
    } else try {
      // La config a changé : on la recharge (source de vérité pour la saisie), puis on ré-assemble.
      // ⭐ MÊME PRINCIPE DE CIBLE que dans `majAutorisationSiObsolete`, et pour la même raison :
      //   ce chemin attend lui aussi le réseau, donc une autre écriture peut le doubler.
      if (typeof lireConfigAdmin === 'function') {
        const instantaneConfig = await lireConfigAdmin();
        if (cible !== autorisationRevision) cibleDepassee = true;   // ⛔ instantané périmé
        else configCourante = instantaneConfig;
      }
      if (!cibleDepassee) {
        // ⭐ R2A — PAR LA PORTE UNIQUE, jamais `majAutorisation` en direct. C'était le dernier
        //   contournement de la file : cette relecture-ci suit une écriture, elle pouvait donc
        //   partir pendant qu'une lecture différée volait encore, et se faire doubler par elle.
        //   ⛔ La distinction réussite / panne / « dépassée » est conservée : la porte rend le
        //   bilan BRUT, elle ne le réduit pas à un booléen.
        const bilan = await relireAutorisation({ revisionCible: cible });
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
    /* ⭐ CE QUE LA FUSION A GARDÉ DE L'AUTRE SESSION EST DIT. Un champ que l'organisateur n'avait
       pas touché, mais que quelqu'un d'autre avait changé, a conservé la valeur concurrente : son
       formulaire ne portait plus la dernière valeur, et il doit le savoir. ⛔ Jamais en silence. */
    const gardes = ((res && res.avertissements) || [])
      .filter(function (a) { return a && a.code === 'modifiee_ailleurs'; })
      .map(function (a) { return a.message; }).join(' ');
    // ⛔ Dans TOUS ces cas l'écriture serveur est acquise : on ne laisse jamais croire l'inverse.
    afficherMessage(message, ((relueOk || cibleDepassee) ? '✅ Champs enregistrés.'
      : '✅ Champs enregistrés. ⚠️ La feuille n\'a pas pu être relue (réseau) : elle se remettra ' +
        'à jour toute seule à la prochaine ouverture de cet écran.') +
      (gardes ? ' ⚠️ ' + gardes : ''), 'ok');
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
function effectifsEquipesManuellesAut(equipes, couvertes) {
  var joueurs = null, educateurs = null;
  (equipes || []).forEach(function (e) {
    if (String((e && e.source) || '').trim().toLowerCase() === 'auto') return;
    if (couvertes && e && couvertes[String(e.id_equipe)] === true) return;   // déjà dans le total de son club
    var j = parseInt(String((e && e.nb_joueurs) == null ? '' : e.nb_joueurs).trim(), 10);
    var ed = parseInt(String((e && e.nb_educateurs) == null ? '' : e.nb_educateurs).trim(), 10);
    if (isFinite(j) && j >= 0) joueurs = (joueurs || 0) + j;
    if (isFinite(ed) && ed >= 0) educateurs = (educateurs || 0) + ed;
  });
  return { joueurs: joueurs, educateurs: educateurs };
}

/** ⭐ Une équipe logique, UN compte — miroir de equipesCouvertesParClubs (backend, lot « Inviter un club », 2ᵉ passage).
 *  Une équipe saisie à la main au nom d'un club ACCEPTÉ (« CLUB » / « CLUB-N », collisions exclues) dont le rang tient
 *  dans la déclaration du club pour sa catégorie est déjà comptée par le total de ce club. PUR.
 *  @return {Object} { id_equipe: true } */
function equipesCouvertesAut(clubs, equipes) {
  var couvertes = {};
  var plat = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); };
  var noms = (clubs || []).map(function (c) { return String((c && c.club_nom) || '').trim(); }).filter(Boolean);
  var entier = function (v) { var n = parseInt(String(v == null ? '' : v).trim(), 10); return isFinite(n) && n >= 0 ? n : null; };
  (clubs || []).forEach(function (c) {
    var accepte = c && (plat(c.statut) === 'accepte' || plat(c.statut) === 'confirme');
    if (!accepte || (entier(c.nb_joueurs_total) == null && entier(c.nb_educateurs_total) == null)) return;
    var nomClub = String(c.club_nom || '').trim();
    var autres = noms.filter(function (n) { return plat(n) !== plat(nomClub); });
    var places = {}, detail = null, nb = {};
    try { detail = JSON.parse(String(c.detail_effectifs || '')); } catch (e) { detail = null; }
    if (detail && typeof detail === 'object') {
      Object.keys(detail).forEach(function (cat) { if (Array.isArray(detail[cat])) places[cat] = detail[cat].length; });
    } else {
      try { nb = JSON.parse(String(c.nb_equipes_par_categorie || '{}')) || {}; } catch (e2) { nb = {}; }
      Object.keys(nb).forEach(function (cat) { var n = parseInt(nb[cat], 10); if (isFinite(n) && n > 0) places[cat] = n; });
    }
    var prises = {};
    (equipes || []).forEach(function (e) {
      if (!e || String(e.source || '').trim().toLowerCase() === 'auto') return;
      var ne = String(e.nom_equipe || '').trim();
      if (autres.some(function (a) { return plat(a) === plat(ne); })) return;
      var rang = ne === nomClub ? 0 : (ne.indexOf(nomClub + '-') === 0 && /^\d+$/.test(ne.slice(nomClub.length + 1))
        ? parseInt(ne.slice(nomClub.length + 1), 10) - 1 : null);
      var cat = String(e.categorie || '').trim();
      if (rang == null || rang < 0 || !(rang < (places[cat] || 0)) || prises[cat + '|' + rang]) return;
      prises[cat + '|' + rang] = true;
      couvertes[String(e.id_equipe)] = true;
    });
  });
  return couvertes;
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
 * catégorie (pour le format sportif). Applique la MÊME doctrine que la feuille de report backend
 * (étrangères, phases, cascades). ⛔ AUCUN nom de club n'est pré-rempli : non saisi ⇒ le champ
 * reste vide et ÉDITABLE dans le PDF fédéral. ⛔ Le label EDR n'est JAMAIS présumé (DR-7B) :
 * vide ⇒ ni « oui » ni « non » coché, les deux cases restent éditables.
 */
function planRemplissageAutorisation(g, nbClubs, nbEquipes, categories, matchsParCat, nbParticipants, nbEducateurs, nbTerrains) {
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
  ouinon(v('org_label_edr'), 'Case à cocher62', 'Case à cocher63');
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
  // Source prioritaire : valeur résolue par le backend dans la feuille de report. Elle reflète
  // la configuration réelle des terrains et évite de recompter différemment dans le navigateur.
  setT('Texte19', nbTerrains || v('org_nb_terrains'));
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
  var droitsOuiEff = tarifOuiP || v('org_droits_oui');
  ouinon(droitsOuiEff, 'Case à cocher105', 'Case à cocher106');
  var montantDroitsEff = droitsOuiEff === 'oui'
    ? ((tarifOuiP === 'oui' && mTarifP) ? mTarifP[0].replace(',', '.') : v('org_droits_montant'))
    : '';
  setT('Texte56', montantDroitsEff);
  ouinon(v('org_hebergement_oui'), 'Case à cocher107', 'Case à cocher108');
  setT('Texte57', v('org_hebergement_structure'));
  var repasPrixP = String(g.repas_sur_place_oui || '').toLowerCase() === 'oui' &&
    g.repas_sur_place_mode === 'prix_personne';
  var mRepasP = String(g.repas_sur_place_montant == null ? '' : g.repas_sur_place_montant).match(/\d+(?:[.,]\d+)?/);
  var repasOuiEff = repasPrixP ? 'oui' : v('org_repas_oui');
  ouinon(repasOuiEff, 'Case à cocher109', 'Case à cocher110');
  setT('Texte58', v('org_repas_fournisseur'));
  setT('Texte59', repasPrixP && mRepasP ? mRepasP[0].replace(',', '.') : v('org_repas_prix'));
  var gouterPrixP = String(g.gouter_fin_tournoi_oui || '').toLowerCase() === 'oui' &&
    g.gouter_fin_tournoi_mode === 'prix_personne';
  var mGouterP = String(g.gouter_fin_tournoi_montant == null ? '' : g.gouter_fin_tournoi_montant).match(/\d+(?:[.,]\d+)?/);
  var gouterOuiEff = gouterPrixP ? 'oui' : v('org_gouters_oui');
  ouinon(gouterOuiEff, 'Case à cocher111', 'Case à cocher112');
  setT('Texte60', v('org_gouters_fournisseur'));
  setT('Texte61', gouterPrixP && mGouterP ? mGouterP[0].replace(',', '.') : v('org_gouters_prix'));

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
    /* ⭐ LES COMPTES VIENNENT DU SERVEUR QUAND IL LES DONNE — et c'est une correction de fond, pas
     *   seulement une économie de requête. Le navigateur REFAISAIT ici la cascade §4.2 en parallèle
     *   du serveur ; deux calculs pour un seul fait, qui pouvaient DIVERGER : le serveur DÉDUIT les
     *   joueurs et éducateurs des équipes retirées après la réponse d'un club (`effectifsClubAjustes`),
     *   le navigateur non. La feuille de report affichée à l'écran et le PDF officiel téléchargé
     *   pouvaient donc annoncer deux nombres différents pour A.4 et B.3 — sur un document qu'on dépose.
     * ⛔ REPLI COMPLET (backend d'avant, ou feuille invalidée) : on s'assure d'abord que la liste des
     *   clubs est chargée, puis on refait le calcul d'avant, à l'identique. */
    if (!autorisationComptes && typeof assurerRessourceAdmin === 'function') {
      await assurerRessourceAdmin('clubsInvites');
    }
    // Comptes — CASCADE §4.2, miroir EXACT de la feuille de report backend :
    //   nb d'équipes     = équipes chargées ;
    //   nb de clubs      = clubs invités ACCEPTÉS s'il y en a (source 1, la plus fiable), sinon
    //     clubs DISTINCTS déduits des noms d'équipes (clubDeAut — équipes saisies à la main) ;
    //   nb participants  = somme des joueurs DÉCLARÉS par les clubs acceptés (nb_joueurs_total) ;
    //     0 ⇒ le plan retombe sur org_nb_participants (saisi).
    const eqs = (typeof equipesCourantes !== 'undefined' && equipesCourantes) ? equipesCourantes : [];
    let nbEquipes = eqs.length;
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
    const effEq = effectifsEquipesManuellesAut(eqs, equipesCouvertesAut(clubs, eqs));
    if (effEq.joueurs != null) nbParticipants += effEq.joueurs;
    if (effEq.educateurs != null) nbEducateurs += effEq.educateurs;
    const setClubs = {};
    eqs.forEach(function (e) { const c = clubDeAut(e.nom_equipe); if (c) setClubs[c] = true; });
    let nbClubs = nbClubsAcceptes > 0 ? nbClubsAcceptes : Object.keys(setClubs).length;
    if (autorisationComptes) {
      // ⭐ La MÊME règle de cascade que la feuille, mais décidée une seule fois — au serveur.
      nbClubs = autorisationComptes.nbClubsAcceptes > 0
        ? autorisationComptes.nbClubsAcceptes : autorisationComptes.nbClubsEquipes;
      nbEquipes = autorisationComptes.nbEquipes;
      nbParticipants = autorisationComptes.nbParticipants;
      nbEducateurs = autorisationComptes.nbEducateurs;
    }
    const cats = (typeof configCourante !== 'undefined' && configCourante && configCourante.categories) || [];
    // Matchs groupés par catégorie (pour le format sportif) — depuis le planning déjà chargé.
    const matchs = (typeof matchsCourants !== 'undefined' && matchsCourants) ? matchsCourants : [];
    const matchsParCat = {};
    matchs.forEach(function (m) {
      const cat = String(m.categorie == null ? '' : m.categorie).trim();
      if (cat) (matchsParCat[cat] = matchsParCat[cat] || []).push(m);
    });
    const nbTerrains = (function () {
      const sections = autorisationDossierCourant && Array.isArray(autorisationDossierCourant.sections)
        ? autorisationDossierCourant.sections : [];
      for (let i = 0; i < sections.length; i++) {
        const champs = Array.isArray(sections[i].champs) ? sections[i].champs : [];
        for (let j = 0; j < champs.length; j++) {
          if (champs[j].libelle === 'Nombre de terrains utilisés') {
            return String(champs[j].valeur == null ? '' : champs[j].valeur).trim();
          }
        }
      }
      return '';
    })();
    const plan = planRemplissageAutorisation(g, nbClubs, nbEquipes, cats, matchsParCat,
      nbParticipants, nbEducateurs, nbTerrains);
    const out = await appliquerPlanPdfAutorisation(PDFLib, bytes, plan);
    telechargerFichierAutorisation(out, 'demande-autorisation-' + (g.tournoi_date || 'tournoi') + '.pdf', 'application/pdf');
    afficherMessage(message, '✅ PDF téléchargé. Les valeurs préremplies y sont figées : vérifie-les, ' +
      'puis complète les champs restés vides avant transmission.', 'ok');
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
    // ⭐ « Réessayer » : la lecture de la feuille est bornée depuis ce lot, elle peut donc ÉCHOUER
    //   visiblement — il faut un moyen de la relancer sans recharger la page. Le rafraîchissement
    //   FORCÉ passe par le registre : il refuse de réutiliser une lecture commencée avant, et une
    //   seule part même si l'on clique plusieurs fois.
    else if (e.target.closest('#bouton-reessayer-autorisation')) {
      e.preventDefault();
      const zoneFeuille = document.getElementById('autorisation-feuille');
      if (zoneFeuille) {
        zoneFeuille.innerHTML = '<div class="ffr-bloc ffr-neutre">Feuille de report en cours de ' +
          'chargement…</div>';
      }
      if (typeof rafraichirRessourceAdmin === 'function') {
        rafraichirRessourceAdmin('dossierAutorisation').catch(function () { /* la feuille garde son message */ });
      }
    }
  });
  section.addEventListener('change', onChangeAutorisation);
});
