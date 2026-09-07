/**
 * ============================================================================
 *  INVITATION CLUB (Phase 1) — invitation légère envoyée AVANT la réponse du club
 * ============================================================================
 *  Construit une page « document » à partir des données du tournoi (Config Zone A +
 *  Zone B), via le MÊME backend que les autres pages (apiGet). Page GÉNÉRIQUE : même
 *  contenu pour tous les clubs invités — aucune personnalisation à ce stade (la
 *  personnalisation par club et le dossier complet sont réservés à la Phase 2).
 *
 *  REFONTE VITRINE : l'invitation est le premier contact des clubs avec le tournoi.
 *  Elle se lit de haut en bas comme un carton d'invitation :
 *    1. blason du club en grand, centré — c'est l'organisation du tournoi qui invite ;
 *    2. l'affiche du tournoi en héros ;
 *    3. le descriptif complet ;
 *    4. la journée en un coup d'œil (frise horaire) ;
 *    5. UNE CARTE PAR CATÉGORIE : forme de jeu FFR, temps de jeu, pauses,
 *       récupération, effectifs, équipes par club, arbitrage, règlement,
 *       format d'après-midi expliqué — plus les repères FFR (sécurité, doctrine) ;
 *    6. sur place, réponse attendue, pied de page.
 *
 *  Règle d'or (identique au dossier Phase 2) : toute section dont TOUS les champs sont
 *  vides est masquée entièrement (titre compris). Jamais de « non communiqué ».
 *
 *  Pas de bandeau d'actions (ICS / Maps / QR / autorisation) : réservé à la Phase 2.
 * ============================================================================
 */

// Le déclencheur d'impression [#bouton-imprimer] et revelerOutilsAdmin() sont désormais
// dans commun-dossier.js (partagés avec dossier-club.html).
document.addEventListener('DOMContentLoaded', initInvitation);

async function initInvitation() {
  const zone = document.getElementById('invitation');
  revelerOutilsAdmin();
  try {
    const config = await apiGet('getConfig'); // { global, categories }
    zone.innerHTML = construireInvitation((config && config.global) || {}, (config && config.categories) || []);
    // Page rendue (le bouton « Répondre » porte déjà son lien) : le jeton sort de l'adresse —
    // il s'imprimait en pied de feuille et s'affichait sur la moindre capture d'écran.
    const p = new URLSearchParams(window.location.search);
    masquerJetonDeLUrl('invitation:' + txt(p.get('club')), jetonCourant('invitation:' + txt(p.get('club')), p));
  } catch (erreur) {
    zone.innerHTML = '<div class="message-chargement erreur">Impossible de charger les données du tournoi.<br>'
      + 'Détail : ' + echapper(erreur.message) + '</div>';
  }
}

/* Les petits helpers (txt, oui, catPresente, dateLongueFr, heurePlusMinutes,
   heureFinCommuniquee, urlAffiche, ligne, listeOuVide, section) et les résumés
   sportifs (resumeMiTemps, resumeEffectif, resumeReglement, resumeApresMidi,
   tempsDeJeuDe, cleFormatApresMidi, DOSSIER_FORMATS…) sont dans commun-dossier.js
   (partagés avec dossier.js) ; ctxScf est dans commun.js.

   Les BLOCS DE PAGE eux-mêmes (heroDocument, friseJournee, cartesCategories,
   piedDocument) y sont aussi : le dossier Phase 2 affiche EXACTEMENT les mêmes,
   pour que les deux documents se ressemblent et disent la même chose. Ne restent
   ici que les blocs propres à l'invitation : « Sur place » et « Votre réponse ». */

/* --------------------------------------------------------------------------
   CONSTRUCTION DE L'INVITATION (Phase 1)
   -------------------------------------------------------------------------- */

function construireInvitation(g, categories) {
  const cats = (categories || []).filter(catPresente)
    .slice().sort(function (a, b) { return comparerCategorie(a.categorie, b.categorie); });
  let html = '';

  // 1-3) EN-TÊTE VITRINE : blason centré en grand, titre, date · lieu, affiche en héros,
  //      puis le descriptif COMPLET du tournoi (plus de troncature : c'est la vitrine).
  html += heroDocument(g, {
    surtitre: 'Vous êtes invités',
    presentationDefaut: 'Nous serions ravis de vous compter parmi les clubs invités de cette journée.'
  });

  // 4) LA JOURNÉE EN UN COUP D'ŒIL : frise horaire (accueil → coup d'envoi → pause
  //    méridienne → reprise → fin envisagée). Chaque étape sans heure est omise.
  html += section('La journée en un coup d\'œil', friseJournee(g, cats), 'inv-journee');

  // 5) VOUS ÊTES INVITÉS : une carte détaillée par catégorie (cadre sportif complet)
  //    + les repères FFR (rappel sécurité effectif minimum, doctrine du format).
  html += section('Vous êtes invités', cartesCategories(cats), 'inv-categories');

  // 6) SUR PLACE : pastilles seulement si cochées + tarif d'engagement si demandé.
  html += section('Sur place', blocSurPlace(g));

  // 7) VOTRE RÉPONSE : encart mis en avant — date limite + contact référent.
  html += section('Votre réponse', blocReponse(g), 'inv-reponse');

  // 8) PIED DE PAGE : logo + liens de l'association (Instagram, site). L'invitation n'a pas
  //    de bandeau d'actions : ses liens vivent dans le pied.
  html += piedDocument(g, true);

  return html;
}

/* --------------------------------------------------------------------------
   6-8) SUR PLACE · RÉPONSE · PIED DE PAGE
   -------------------------------------------------------------------------- */

/**
 * « Sur place » : pastilles affichées UNIQUEMENT si cochées (aucune ligne « non
 * disponible » si décoché) + tarif d'engagement si un tarif est demandé.
 */
function blocSurPlace(g) {
  const pastilles = [];
  if (oui(g.buvette_disponible)) pastilles.push('🥤 Buvette');
  if (oui(g.espace_sandwich_disponible)) pastilles.push('🥪 Espace sandwich');
  if (oui(g.boutique_disponible)) pastilles.push('🛍️ Boutique');

  let html = '';
  if (pastilles.length) {
    html += '<div class="inv-pastilles">' + pastilles.map(function (p) {
      return '<span class="inv-pastille">' + echapper(p) + '</span>';
    }).join('') + '</div>';
  }

  // Tarif d'engagement : seulement si un tarif est demandé (sinon rien).
  if (oui(g.tarif_engagement_oui) && txt(g.tarif_engagement_montant)) {
    html += '<ul class="d-liste"><li><span class="d-libelle">Tarif d\'engagement</span>' +
      '<span class="d-valeur">' + echapper(txt(g.tarif_engagement_montant)) + '</span></li></ul>';
  }
  return html;
}

/**
 * Lien de réponse PERSONNEL du club, si la page a été ouverte depuis l'email d'invitation
 * (lien {{LIEN_INVITATION}} : invitation-club.html?club=…&token=…). On ne fait que RELAYER
 * ces paramètres vers reponse-invitation.html — la validation du jeton reste côté backend.
 * '' pour un visiteur anonyme (la page reste générique).
 */
function lienReponsePersonnel(g) {
  try {
    const params = new URLSearchParams(window.location.search);
    const club = txt(params.get('club'));
    // Jeton de l'adresse OU de l'onglet : après un rechargement, l'adresse n'en a plus (il a été
    // masqué au premier affichage) et le bouton « Répondre » doit rester là.
    const token = jetonCourant('invitation:' + club, params);
    if (!club || !token) return '';
    const url = new URL('reponse-invitation.html', window.location.href);
    if (txt(g.tournoi_nom)) url.searchParams.set('tournoi', txt(g.tournoi_nom));
    url.searchParams.set('club', club);
    url.searchParams.set('token', token);
    return url.toString();
  } catch (e) { return ''; }
}

/** « Votre réponse » : encart mis en avant — date limite en grand + contact référent.
 *  Ouvert depuis l'email (club reconnu) → VRAI bouton « Répondre à l'invitation » ;
 *  visiteur anonyme → mention du lien personnel reçu par email (le bouton de réponse
 *  vit dans l'email de chaque club, avec son jeton).
 *  Le TÉLÉPHONE n'est volontairement PAS affiché : cette page vitrine est publique et mise en
 *  avant ; le portable d'un bénévole n'y figure pas (décision S3). La vue `invitation` du backend
 *  ne renvoie d'ailleurs plus `contact_reponse_tel`. Le numéro du jour J reste dans le dossier
 *  club, derrière le jeton. */
function blocReponse(g) {
  const dateLimite = txt(g.date_limite_reponse) ? dateLongueFr(g.date_limite_reponse) : '';
  const lienReponse = lienReponsePersonnel(g);
  const contact = [];
  if (txt(g.contact_reponse_nom)) contact.push('<strong>' + echapper(txt(g.contact_reponse_nom)) + '</strong>');
  if (txt(g.contact_reponse_email)) {
    contact.push('<a href="mailto:' + echapper(txt(g.contact_reponse_email)) + '">'
      + echapper(txt(g.contact_reponse_email)) + '</a>');
  }
  if (!dateLimite && !contact.length && !lienReponse) return '';

  const action = lienReponse
    ? '<p class="inv-cta-action"><a class="inv-cta-bouton" href="' + echapper(lienReponse) + '">✅ Répondre à l\'invitation</a></p>' +
      '<p class="inv-cta-note">Quelques clics suffisent : présence, équipes engagées, ' +
      'joueurs et éducateurs par équipe.</p>'
    : '<p class="inv-cta-note">Répondez en quelques clics depuis votre lien personnel, reçu par email ' +
      'avec cette invitation : équipes engagées, joueurs et éducateurs par équipe.</p>';

  return '<div class="inv-cta">' +
    '<p class="inv-cta-titre">Merci de confirmer votre participation</p>' +
    (dateLimite ? '<p class="inv-cta-date">avant le <strong>' + echapper(dateLimite) + '</strong></p>' : '') +
    action +
    (contact.length ? '<p class="inv-cta-contact">' + contact.join('<span class="inv-cta-sep"> · </span>') + '</p>' : '') +
  '</div>';
}
