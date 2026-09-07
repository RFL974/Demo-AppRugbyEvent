/**
 * ============================================================================
 *  ADMIN — INVITATION & CLUBS INVITÉS (extrait de admin.js)
 * ============================================================================
 *  Sous-système « invitation » de la page admin, sorti du monolithe admin.js
 *  SANS changement de comportement :
 *   - Invitation Phase 1 : aperçu live de l'email + envoi individuel / groupé ;
 *   - Dossier d'invitation : modalités d'inscription, parking & accès, encadrement ;
 *   - Clubs invités : liste, édition inline des coordonnées, panneau « Accepté ».
 *
 *  Dépend de globaux définis ailleurs, accédés uniquement au moment de l'appel
 *  (handlers post-chargement) — l'ordre des <script> importe peu ; chargé après
 *  admin.js dans admin.html :
 *   - commun.js : echapper, svgIcone, comparerCategorie, afficherMessage, avecBoutonOccupe…
 *   - api.js    : apiGet, apiPost, ecrireAdmin (défini dans admin.js)
 *   - admin.js  : configCourante, clubsInvitesCourants, majDossier,
 *                 rechargerEtRendre, dialog*, redimensionnerImage, brancherZoneImage…
 * ============================================================================
 */

/* --------------------------------------------------------------------------
   INVITATION PHASE 1 — aperçu de l'email (live) + envoi individuel / groupé.
   L'aperçu suit le MÊME principe que celui de la carte « Infos du tournoi » :
   mise à jour EN DIRECT à partir des données du tournoi et des valeurs LIVE des
   cartes « Sur place » / « Réponse à l'invitation ». Le contenu ENVOYÉ (objet +
   corps après salutation) est construit par les mêmes fonctions → l'email reçu
   correspond exactement à l'aperçu, seule la salutation variant par club.
   -------------------------------------------------------------------------- */

/** URL absolue de la page d'invitation publique (Phase 1), pour le lien de l'email.
 *  C'est la BASE : le backend y ajoute club + jeton par destinataire ({{LIEN_INVITATION}}),
 *  la page reconnaît alors le club et affiche son bouton « Répondre à l'invitation ». */
function lienInvitationPublique() {
  return new URL('invitation-club.html', window.location.href).toString();
}

/** URL absolue du blason en PNG (les clients mail n'affichent pas le SVG). */
function urlBlasonEmail() {
  return new URL('assets/logo-tournoi.png', window.location.href).toString();
}

/** URL absolue d'une icône de lien (img/icone-instagram.png, img/icone-site.png). */
function urlIconeEmail(nom) {
  return new URL('img/icone-' + nom + '.png', window.location.href).toString();
}

/** Barre des liens officiels (LIENS_ASSOCIATION, commun.js) : une ICÔNE cliquable + son
 *  libellé sous chacune — jamais de lien brut (décision Romain). Centrée dans le pied.
 *  Liste vide (cas actuel) ⇒ chaîne vide : aucun tableau, aucune marge résiduelle. */
function barreLiensEmail(A) {
  if (!LIENS_ASSOCIATION.length) return '';
  const cellules = LIENS_ASSOCIATION.map(function (l) {
    return '<td align="center" style="padding:0 12px;">'
      + '<a href="' + echapper(l.url) + '" style="text-decoration:none;">'
      + '<img src="' + echapper(urlIconeEmail(l.icone)) + '" alt="' + echapper(l.libelle) + '" width="26" height="26" '
      + 'style="display:block;width:26px;height:26px;margin:0 auto 3px;">'
      + '<span style="' + A + 'font-size:10px;color:' + EMAIL_GRIS + ';">' + echapper(l.libelle) + '</span>'
      + '</a></td>';
  }).join('');
  return '<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:16px auto 0;">'
    + '<tr>' + cellules + '</tr></table>';
}

/** Lien d'invitation d'EXEMPLE pour l'aperçu (le vrai lien, avec jeton, est construit par club). */
function lienInvitationApercu() {
  return lienInvitationPublique() + '?club=EXEMPLE&token=EXEMPLE';
}

/** État « global » pour l'invitation : config enregistrée + valeurs LIVE des cartes
 *  Sur place / Réponse (pour un aperçu qui suit la frappe, comme l'aperçu des Infos). */
function globalInvitation() {
  const g = Object.assign({}, configCourante.global || {});
  const fs = document.getElementById('form-surplace');
  if (fs) {
    g.buvette_disponible = fs.buvette_disponible.checked ? 'oui' : 'non';
    g.espace_sandwich_disponible = fs.espace_sandwich_disponible.checked ? 'oui' : 'non';
    g.boutique_disponible = fs.boutique_disponible.checked ? 'oui' : 'non';
  }
  const fr = document.getElementById('form-reponse');
  if (fr) g.date_limite_reponse = fr.date_limite_reponse.value;
  return g;
}

/** Objet de l'email d'invitation. */
function sujetInvitation(g) {
  return 'Invitation — ' + (String(g.tournoi_nom || '').trim() || 'Le tournoi');
}

/** Phrase d'INTRODUCTION courte (après la salutation), éditable. Réactive au nom du tournoi. */
function introInvitationDefaut(g) {
  const nom = String(g.tournoi_nom || '').trim() || 'notre tournoi';
  return 'Nous avons le plaisir de vous inviter au ' + nom + '. Voici l\'essentiel de la journée.';
}

/** Prénom d'exemple pour l'aperçu : premier club avec un prénom, sinon « Prénom ». */
function exemplePrenomInvitation() {
  const c = (clubsInvitesCourants || []).find(function (x) { return String(x.club_contact_prenom || '').trim(); });
  return c ? String(c.club_contact_prenom).trim() : 'Prénom';
}

/** Catégories présentes du tournoi, triées (ordre naturel U8 < U10 < …). */
function catsInvitationTriees() {
  return (configCourante.categories || []).filter(estPresente)
    .slice().sort(function (a, b) { return comparerCategorie(a.categorie, b.categorie); });
}

/* Charte R92 pour l'email (styles EN LIGNE uniquement — pas de CSS externe/flex/grid,
   pour la compatibilité des clients mail). */
const EMAIL_NAVY = '#0C1C2E', EMAIL_BLEU = '#2E8FE0', EMAIL_TXT = '#1a1f26', EMAIL_GRIS = '#5b6570', EMAIL_FILET = '#dbe3ec';

/** Échappe un texte libre PUIS convertit ses sauts de ligne en <br> (pour l'insérer dans le
 *  HTML de l'email en préservant les retours à la ligne saisis par l'admin). */
function nl2brEmail(s) {
  return echapper(String(s == null ? '' : s)).replace(/\r?\n/g, '<br>');
}

/** Titre de section de l'email (barre bleue de la charte). */
function emailTitreSection(t) {
  return '<h2 style="margin:20px 0 8px;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;'
    + 'letter-spacing:.5px;font-size:15px;color:' + EMAIL_BLEU + ';border-bottom:1px solid ' + EMAIL_FILET + ';padding-bottom:4px;">'
    + echapper(t) + '</h2>';
}

/* --- Résumés sportifs de l'email (miroirs légers de la vitrine ; suffixe Email comme
       heureFinCommuniqueeAdmin — admin.html ne charge pas commun-dossier.js) --- */

/** Ajoute `minutes` à une heure « HH:MM » (bornée à 23:59). '' si l'heure est illisible. */
function heurePlusMinutesEmail(hhmm, minutes) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return '';
  const total = Math.min(23 * 60 + 59, parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + minutes);
  return ('0' + Math.floor(total / 60)).slice(-2) + ':' + ('0' + (total % 60)).slice(-2);
}

/** Forme de jeu d'une catégorie : Super Challenge prioritaire, sinon Config.forme_jeu, sinon ''. */
function formeJeuEmailTxt(c) {
  if (ctxScf(c).estScf) return 'Jeu à XV · Super Challenge de France';
  return String(c.forme_jeu || '').trim();
}

/** « 2 × 10 min (pause 2 min) » — temps SCF imposés par la phase (P2 = 2×15 ; P3 = 2×11,
 *  miroir de dureeMatchScf côté backend). '' si la durée est inconnue. */
function tempsJeuEmailTxt(c) {
  const scf = ctxScf(c);
  const nb = scf.estScf ? 2 : (parseInt(String(c.format_mi_temps || '').trim(), 10) || 2);
  const duree = scf.estScf ? (scf.phase === 'P3' ? 11 : 15) : parseInt(String(c.duree_mi_temps_min || '').trim(), 10);
  if (!isFinite(duree) || duree <= 0) return '';
  let s = nb + ' × ' + duree + ' min';
  const pause = parseInt(String(c.pause_mi_temps_min || '').trim(), 10);
  if (nb === 2 && isFinite(pause) && pause > 0) s += ' (pause ' + pause + ' min)';
  return s;
}

/** « 8 à 12 joueurs » / « 8 joueurs min » / « 12 joueurs max » / ''. */
function effectifEmailTxt(c) {
  const min = String(c.effectif_min || '').trim(), max = String(c.effectif_max || '').trim();
  if (min && max) return (min === max) ? min + ' joueurs' : min + ' à ' + max + ' joueurs';
  if (min) return min + ' joueurs min';
  if (max) return max + ' joueurs max';
  return '';
}

/** Étapes de la journée (miroir de friseJournee sur la vitrine) : accueil, coup d'envoi,
 *  pause méridienne, reprise, fin envisagée — chacune seulement si son heure est connue.
 *  Les notes « matin : poules » / « après-midi » sont omises pour un tournoi 100 % SCF. */
function etapesJourneeEmail(g, cats) {
  const tousScf = !!(cats && cats.length) && cats.every(function (c) { return ctxScf(c).estScf; });
  const etapes = [];
  if (String(g.heure_rdv || '').trim()) {
    etapes.push({ h: String(g.heure_rdv).trim(), t: 'Accueil des équipes', n: '' });
  }
  if (String(g.heure_debut || '').trim()) {
    etapes.push({ h: String(g.heure_debut).trim(), t: 'Coup d\'envoi', n: tousScf ? '' : 'Matin : matchs de poules' });
  }
  const pauseDebut = String(g.pause_dejeuner_debut || '').trim();
  const pauseDuree = parseInt(String(g.pause_dejeuner_duree_min || '').trim(), 10);
  if (pauseDebut) {
    etapes.push({ h: pauseDebut, t: 'Pause méridienne',
      n: (isFinite(pauseDuree) && pauseDuree > 0) ? pauseDuree + ' min' : '' });
    const reprise = (isFinite(pauseDuree) && pauseDuree > 0) ? heurePlusMinutesEmail(pauseDebut, pauseDuree) : '';
    if (reprise) {
      etapes.push({ h: reprise, t: 'Reprise', n: tousScf ? '' : 'Après-midi : selon la catégorie' });
    }
  }
  const fin = heureFinCommuniqueeAdmin(g);
  if (fin) etapes.push({ h: fin, t: 'Fin envisagée', n: '' });
  return etapes;
}

/**
 * FRISE horaire de l'email (miroir visuel de la frise de la vitrine, en HTML email-safe :
 * pas de flexbox ni de pseudo-éléments — un rail de cellules, des points ronds, puis trois
 * rangées heures / étapes / notes). Outlook dégrade les points en carrés : acceptable.
 */
function friseJourneeEmail(g, cats, A) {
  const etapes = etapesJourneeEmail(g, cats);
  if (!etapes.length) return '';
  const n = etapes.length;
  const larg = Math.floor(100 / n) + '%';

  // Rangée 1 — le RAIL : pour chaque étape, [segment gauche · point · segment droit] ;
  // le premier segment gauche et le dernier segment droit sont invisibles (bouts de ligne).
  const segment = function (visible) {
    return '<td style="width:50%;padding:0;vertical-align:middle;">'
      + (visible ? '<div style="height:2px;background:' + EMAIL_FILET + ';font-size:0;line-height:0;">&nbsp;</div>' : '&nbsp;')
      + '</td>';
  };
  const rail = etapes.map(function (e, i) {
    return '<td width="' + larg + '" style="padding:0;">'
      + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">'
      + '<tr>' + segment(i > 0)
      + '<td style="width:12px;padding:0;"><div style="width:12px;height:12px;border-radius:6px;background:'
      + EMAIL_BLEU + ';font-size:0;line-height:0;">&nbsp;</div></td>'
      + segment(i < n - 1) + '</tr></table></td>';
  }).join('');

  // Rangées 2-4 : heures en grand, étapes en gras, notes discrètes.
  const heures = etapes.map(function (e) {
    return '<td align="center" style="padding:6px 2px 0;' + A + 'font-size:20px;font-weight:bold;color:' + EMAIL_NAVY + ';">'
      + echapper(e.h) + '</td>';
  }).join('');
  const titres = etapes.map(function (e) {
    return '<td align="center" style="padding:2px 4px 0;' + A + 'font-size:12px;font-weight:bold;color:' + EMAIL_TXT + ';">'
      + echapper(e.t) + '</td>';
  }).join('');
  const notes = etapes.some(function (e) { return e.n; })
    ? '<tr>' + etapes.map(function (e) {
        return '<td align="center" style="padding:1px 4px 0;' + A + 'font-size:11px;color:' + EMAIL_GRIS + ';">'
          + (e.n ? echapper(e.n) : '&nbsp;') + '</td>';
      }).join('') + '</tr>'
    : '';

  return '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;margin:4px 0 0;">'
    + '<tr>' + rail + '</tr>'
    + '<tr>' + heures + '</tr>'
    + '<tr>' + titres + '</tr>'
    + notes
    + '</table>';
}

/** Phrase d'introduction des cartes (miroir de cartesCategories sur la vitrine) : matin en
 *  poules pour les catégories ordinaires ; le Super Challenge suit sa formule propre. */
function introCartesEmail(cats) {
  const nonScf = cats.filter(function (c) { return !ctxScf(c).estScf; });
  const aScf = nonScf.length < cats.length;
  if (!nonScf.length) return 'Le Super Challenge de France suit la formule de son règlement, détaillée ci-dessous.';
  let intro = 'Le matin, les catégories jouent en poules : chaque équipe rencontre toutes celles '
    + 'de sa poule. L\'après-midi suit le format propre à chaque catégorie, détaillé ci-dessous.';
  if (aScf) intro += ' Le Super Challenge de France (U14) suit la formule de son règlement, détaillée sur sa carte.';
  return intro;
}

/**
 * UNE carte de catégorie (miroir email-safe des cartes de la vitrine) : bandeau navy
 * (catégorie + forme de jeu), lignes libellé/valeur, format d'après-midi expliqué.
 */
function carteCategorieEmail(c, A) {
  const scf = ctxScf(c);
  const badge = scf.estScf ? 'Super Challenge de France' : String(c.forme_jeu || '').trim();

  const tdLib = 'style="' + A + 'font-size:12px;color:' + EMAIL_GRIS + ';padding:4px 10px 4px 12px;width:110px;vertical-align:top;"';
  const tdVal = 'style="' + A + 'font-size:13px;color:' + EMAIL_TXT + ';font-weight:bold;padding:4px 12px 4px 0;"';
  const lignes = [];
  const L = function (lib, valHtml) {
    if (!valHtml) return;
    lignes.push('<tr><td ' + tdLib + '>' + echapper(lib) + '</td><td ' + tdVal + '>' + valHtml + '</td></tr>');
  };

  if (scf.estScf) {
    // Temps imposés par le règlement SCF (P2 = 2×15 ; P3 = 2×11) ; la formule dit tout.
    L('Forme de jeu', echapper('Jeu à XV (15 contre 15)'));
    L('Temps de jeu', echapper(tempsJeuEmailTxt(c)));
    L('Formule', echapper(scf.phase === 'P3'
      ? 'Samedi : triangulaires · Dimanche : brassage par niveau'
      : 'Plateau en triangulaires / quadrangulaires'));
  } else {
    if (String(c.forme_jeu || '').trim()) L('Forme de jeu', echapper(String(c.forme_jeu).trim()));
    const temps = tempsJeuEmailTxt(c);
    if (temps) {
      const nb = parseInt(String(c.format_mi_temps || '').trim(), 10) || 2;
      const duree = parseInt(String(c.duree_mi_temps_min || '').trim(), 10);
      const total = (isFinite(duree) && duree > 0) ? ' — ' + (nb * duree) + ' min par match' : '';
      L('Temps de jeu', echapper(temps + total));
    }
  }
  const recup = String(c.recup_entre_matchs_min || '').trim();
  if (recup) L('Récupération', echapper(recup + ' min minimum entre deux matchs'));
  const effectif = effectifEmailTxt(c);
  if (effectif) L('Effectif', echapper(effectif + ' par équipe'));
  const max = parseInt(String(c.max_equipes_par_club || '').trim(), 10);
  L('Équipes par club', echapper((isFinite(max) && max >= 1)
    ? 'Jusqu\'à ' + max + ' équipe' + (max > 1 ? 's' : '') : 'Plusieurs équipes possibles'));
  if (String(c.arbitrage_organisation || '').trim()) L('Arbitrage', echapper(String(c.arbitrage_organisation).trim()));
  const regl = String(c.reglement || '').trim().match(/https?:\/\/\S+/i);
  if (regl) L('Règlement', '<a href="' + echapper(regl[0]) + '" style="color:' + EMAIL_BLEU + ';">Consulter le règlement</a>');

  // Format d'après-midi expliqué — pas pour le SCF (pas de phase d'après-midi, cf. Formule).
  let apresMidi = '';
  if (!scf.estScf) {
    const cle = cleFormatApresMidi(c);
    apresMidi = '<tr><td colspan="2" style="' + A + 'font-size:12px;color:#274a68;background:#f5f8fc;'
      + 'padding:8px 12px;border-top:1px solid ' + EMAIL_FILET + ';line-height:1.5;">'
      + '<strong>Après-midi — ' + echapper(DOSSIER_FORMATS[cle]) + '</strong> : '
      + echapper(DOSSIER_FORMATS_DESC[cle]) + '</td></tr>';
  }

  return '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" '
    + 'style="border-collapse:separate;width:100%;border:1px solid ' + EMAIL_FILET + ';border-radius:8px;margin:0 0 10px;">'
    + '<tr><td style="background:' + EMAIL_NAVY + ';padding:7px 12px;border-radius:7px 0 0 0;' + A
    + 'font-size:16px;font-weight:bold;color:#ffffff;">' + echapper(String(c.categorie || '')) + '</td>'
    + '<td style="background:' + EMAIL_NAVY + ';padding:7px 12px;border-radius:0 7px 0 0;text-align:right;">'
    + (badge ? '<span style="display:inline-block;background:' + EMAIL_BLEU + ';color:#ffffff;border-radius:12px;'
      + 'padding:3px 10px;' + A + 'font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">'
      + echapper(badge) + '</span>' : '&nbsp;') + '</td></tr>'
    + '<tr><td colspan="2" style="padding:4px 0;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;">'
    + lignes.join('') + '</table></td></tr>'
    + apresMidi
    + '</table>';
}

/** Repères FFR sous les cartes (mêmes textes et mêmes conditions que la vitrine :
 *  FFR_RAPPEL_EFFECTIF / FFR_POURQUOI_FORMAT, commun.js). */
function reperesFFREmail(cats, A) {
  let html = '';
  const aEffectifMin = cats.some(function (c) {
    const n = parseInt(String(c.effectif_min || '').trim(), 10);
    return isFinite(n) && n >= 1;
  });
  if (aEffectifMin) {
    html += '<p style="margin:10px 0 0;padding:8px 12px;background:#fdf4e3;border-left:3px solid #e5a33c;'
      + A + 'font-size:12px;color:#8a5a0c;line-height:1.5;">⚠️ <strong>Rappel sécurité FFR</strong> — '
      + echapper(FFR_RAPPEL_EFFECTIF) + '</p>';
  }
  const aPoules = cats.some(function (c) {
    return String(c.format_apresmidi || '').trim().toUpperCase() === 'POULES_NIVEAU';
  });
  if (aPoules) {
    html += '<p style="margin:10px 0 0;padding:8px 12px;background:#eef5fc;border-left:3px solid ' + EMAIL_BLEU + ';'
      + A + 'font-size:12px;color:#274a68;line-height:1.5;">💡 <strong>Pourquoi ce format ?</strong> '
      + echapper(FFR_POURQUOI_FORMAT) + '</p>';
  }
  return html;
}

/**
 * Corps HTML de l'email d'invitation (compatible clients mail : tableaux + styles en ligne).
 * L'email EST l'invitation COMPLÈTE (décision Romain) : même contenu que la page vitrine —
 * blason centré, surtitre « a le plaisir de vous inviter », grand titre, date · lieu, affiche
 * centrée, descriptif complet, journée en un coup d'œil, UNE CARTE DÉTAILLÉE PAR CATÉGORIE
 * (forme de jeu, temps de jeu, récupération, effectifs, arbitrage, règlement, après-midi
 * expliqué) et les repères FFR. `salutationHtml` est inséré TEL QUEL (jeton « {{SALUTATION}} »
 * pour l'envoi, ou « Bonjour {exemple}, » pour l'aperçu) ; `imgSrc` = l'affiche (URL Drive en
 * aperçu, « cid:affiche » pour l'envoi ; vide = pas d'image) ; `lienInvitation` = lien vers la
 * page vitrine (jeton « {{LIEN_INVITATION}} » à l'envoi → personnalisé par club).
 */
function emailHtmlInvitation(g, cats, imgSrc, salutationHtml, intro, lienReponse, lienInvitation) {
  const A = 'font-family:Arial,Helvetica,sans-serif;';
  const nom = echapper(String(g.tournoi_nom || '').trim() || 'Le tournoi');
  const date = String(g.tournoi_date || '').trim() ? echapper(formaterDateFr(g.tournoi_date)) : '';
  const lieu = echapper(String(g.tournoi_lieu || '').trim());
  const lienInv = lienInvitation ? echapper(lienInvitation) : echapper(lienInvitationPublique());

  // En-tête VITRINE : blason centré, surtitre, grand titre, date · lieu, filet d'accent.
  let entete = '<div style="text-align:center;">'
    + '<img src="' + echapper(urlBlasonEmail()) + '" alt="" width="72" '
    + 'style="display:block;width:72px;height:auto;margin:0 auto 10px;">'
    + '<p style="margin:0;' + A + 'text-transform:uppercase;letter-spacing:2px;font-size:12px;line-height:1.5;color:' + EMAIL_BLEU + ';">'
    + 'Vous êtes invités</p>'
    + '<h1 style="margin:8px 0 2px;' + A + 'font-size:27px;line-height:1.1;color:' + EMAIL_NAVY + ';">' + nom + '</h1>'
    + ((date || lieu) ? '<p style="margin:4px 0 0;' + A + 'font-weight:bold;font-size:15px;color:' + EMAIL_NAVY + ';">'
      + [date, lieu].filter(Boolean).join('<span style="color:' + EMAIL_BLEU + ';"> · </span>') + '</p>' : '')
    + '<div style="width:90px;height:4px;background:' + EMAIL_BLEU + ';margin:14px auto 0;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>'
    + '</div>';

  // L'affiche du tournoi, centrée et plus grande (l'email reste léger : 340 px maxi).
  const blocAffiche = imgSrc
    ? '<img src="' + echapper(imgSrc) + '" alt="Affiche — ' + nom + '" '
      + 'style="display:block;width:100%;max-width:340px;height:auto;border-radius:8px;margin:16px auto 0;">'
    : '';

  // Le descriptif COMPLET du tournoi (même contenu que la page vitrine — l'email EST
  // l'invitation complète, pas un teaser). Un paragraphe par ligne saisie.
  const blocDescription = String(g.tournoi_description || '').trim()
    ? '<p style="margin:16px 0 0;' + A + 'font-size:14px;color:' + EMAIL_TXT + ';text-align:justify;line-height:1.55;">'
      + nl2brEmail(String(g.tournoi_description).trim()) + '</p>'
    : '';

  // Salutation + intro.
  // La phrase d'intro est du texte LIBRE (multi-lignes) : sauts de ligne → <br> + texte justifié.
  const bloc_salut = '<p style="margin:18px 0 4px;' + A + 'font-size:15px;color:' + EMAIL_TXT + ';">' + salutationHtml + '</p>'
    + (String(intro || '').trim() ? '<p style="margin:0;' + A + 'font-size:14px;color:' + EMAIL_TXT + ';text-align:justify;">' + nl2brEmail(intro) + '</p>' : '');

  // Bouton d'ACTION principal : « Répondre à l'invitation » (lien personnel avec jeton).
  // Pas de lien « voir l'invitation complète » : l'email EST l'invitation complète — seul
  // le pied garde un discret « voir la version en ligne » (lienInv, personnalisé par club).
  const boutonReponse = lienReponse
    ? '<p style="margin:18px 0 4px;text-align:center;"><a href="' + echapper(lienReponse) + '" '
      + 'style="display:inline-block;background:' + EMAIL_BLEU + ';color:#ffffff;text-decoration:none;'
      + 'border-radius:999px;padding:13px 28px;' + A + 'font-size:15px;font-weight:bold;">Répondre à l\'invitation</a></p>'
      + '<p style="margin:0 0 4px;text-align:center;' + A + 'font-size:12px;color:' + EMAIL_GRIS + ';">'
      + '(présence, équipes engagées, joueurs et éducateurs par équipe)</p>'
    : '';

  // « La journée en un coup d'œil » : la FRISE horaire (même visuel que la page vitrine —
  // décision Romain, plus parlant que des lignes de tableau). Pas de ligne d'arbitrage ici :
  // l'information figure déjà sur la carte de chaque catégorie.
  const ligneJ = function (lib, val) {
    if (!val) return '';
    return '<tr><td style="' + A + 'font-size:13px;color:' + EMAIL_GRIS + ';padding:3px 10px 3px 0;">' + echapper(lib) + '</td>'
      + '<td style="' + A + 'font-size:13px;color:' + EMAIL_TXT + ';font-weight:bold;padding:3px 0;">' + echapper(val) + '</td></tr>';
  };
  const frise = friseJourneeEmail(g, cats, A);
  const blocJourJ = frise ? (emailTitreSection('La journée en un coup d\'œil') + frise) : '';

  // « Vous êtes invités » : l'invitation COMPLÈTE — une carte détaillée par catégorie
  // (miroir des cartes de la page vitrine, en HTML email-safe : tableaux empilés),
  // précédée de la même phrase d'introduction, suivie des mêmes repères FFR.
  let tblInvites = '';
  if (cats.length) {
    tblInvites = emailTitreSection('Vous êtes invités')
      + '<p style="margin:0 0 10px;' + A + 'font-size:13px;color:' + EMAIL_TXT + ';">' + echapper(introCartesEmail(cats)) + '</p>'
      + cats.map(function (c) { return carteCategorieEmail(c, A); }).join('')
      + reperesFFREmail(cats, A);
  }

  // « Sur place » : pastilles (seulement si cochées) + tarif si demandé.
  const pastilles = [];
  if (estOui(g.buvette_disponible)) pastilles.push('🥤 Buvette');
  if (estOui(g.espace_sandwich_disponible)) pastilles.push('🥪 Espace sandwich');
  if (estOui(g.boutique_disponible)) pastilles.push('🛍️ Boutique');
  let surPlace = '';
  if (pastilles.length || (estOui(g.tarif_engagement_oui) && String(g.tarif_engagement_montant || '').trim())) {
    surPlace = emailTitreSection('Sur place');
    if (pastilles.length) {
      surPlace += '<p style="margin:0 0 6px;">' + pastilles.map(function (p) {
        return '<span style="display:inline-block;background:' + EMAIL_NAVY + ';color:#fff;border-radius:14px;'
          + 'padding:5px 12px;' + A + 'font-size:13px;margin:0 6px 6px 0;">' + echapper(p) + '</span>';
      }).join('') + '</p>';
    }
    if (estOui(g.tarif_engagement_oui) && String(g.tarif_engagement_montant || '').trim()) {
      surPlace += '<p style="margin:0;' + A + 'font-size:13px;color:' + EMAIL_TXT + ';"><strong>Tarif d\'engagement :</strong> '
        + nl2brEmail(String(g.tarif_engagement_montant).trim()) + '</p>';
    }
  }

  // « Réponse attendue » : date limite + contact.
  const contact = [];
  if (String(g.contact_reponse_nom || '').trim()) contact.push(echapper(String(g.contact_reponse_nom).trim()));
  if (String(g.contact_reponse_tel || '').trim()) contact.push(echapper(telephoneLisibleAdmin(g.contact_reponse_tel)));
  if (String(g.contact_reponse_email || '').trim()) contact.push(echapper(String(g.contact_reponse_email).trim()));
  // Date limite de CONFIRMATION (carte Modalités) : ajoutée seulement si renseignée ET
  // différente de la date de réponse (pas de doublon de date dans l'email).
  const dateConfirm = String(g.date_limite_confirmation || '').trim();
  const dateRep = String(g.date_limite_reponse || '').trim();
  const confirmDiff = dateConfirm && dateConfirm !== dateRep;
  const reponse = ligneJ('Réponse souhaitée avant le', dateRep ? formaterDateFr(dateRep) : '')
    + ligneJ('Confirmation des effectifs avant le', confirmDiff ? formaterDateFr(dateConfirm) : '')
    + ligneJ('Votre contact', contact.join(' · '));
  const blocReponse = reponse ? (emailTitreSection('Réponse attendue')
    + '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + reponse + '</table>') : '';

  // Bouton RÉPÉTÉ en bas : après avoir tout lu, le club n'a pas à remonter pour répondre.
  const boutonBas = lienReponse
    ? '<p style="margin:16px 0 0;text-align:center;"><a href="' + echapper(lienReponse) + '" '
      + 'style="display:inline-block;background:' + EMAIL_BLEU + ';color:#ffffff;text-decoration:none;'
      + 'border-radius:999px;padding:13px 28px;' + A + 'font-size:15px;font-weight:bold;">Répondre à l\'invitation</a></p>'
    : '';

  // Pied : barre des liens officiels EN ICÔNES (Instagram / sites — décision Romain), puis
  // mention (même entité que la vitrine) + lien de secours vers la page en ligne.
  const pied = barreLiensEmail(A)
    + '<p style="margin:14px 0 0;padding-top:12px;border-top:1px solid ' + EMAIL_FILET + ';' + A + 'font-size:12px;color:' + EMAIL_GRIS + ';text-align:center;">'
    + 'L\'organisation du tournoi<br>'
    + '<a href="' + lienInv + '" style="color:' + EMAIL_BLEU + ';">Voir la version en ligne</a></p>';

  // Ordre VITRINE : en-tête, affiche, salutation, bouton, descriptif complet, journée,
  // cartes par catégorie + repères FFR, sur place, réponse (+ bouton répété).
  return '<div style="background:#eef2f7;padding:16px;' + A + '">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-collapse:collapse;">'
    + '<tr><td style="padding:22px 24px;">'
    + '<div style="border-bottom:3px solid ' + EMAIL_NAVY + ';padding-bottom:14px;">' + entete + '</div>'
    + blocAffiche + bloc_salut + boutonReponse + blocDescription + blocJourJ + tblInvites + surPlace
    + blocReponse + boutonBas + pied
    + '</td></tr></table></div>';
}

/** Version TEXTE brut (fallback anti-spam / clients sans HTML). `salutationTexte` et les liens
 *  sont des jetons à l'envoi ({{SALUTATION}}, {{LIEN_REPONSE}}, {{LIEN_INVITATION}}) ou des
 *  exemples pour l'aperçu. */
function emailTexteInvitation(g, cats, salutationTexte, intro, lienReponse, lienInvitation) {
  const nom = String(g.tournoi_nom || '').trim() || 'Le tournoi';
  const L = [];
  L.push(salutationTexte);
  L.push('');
  if (String(intro || '').trim()) { L.push(String(intro).trim()); L.push(''); }
  if (lienReponse) { L.push('▶ Répondre à l\'invitation : ' + lienReponse); L.push(''); }
  // Pas de second lien ici : l'email EST l'invitation complète (la version en ligne est en pied).
  // L'email est l'invitation COMPLÈTE : le descriptif du tournoi y figure en entier.
  if (String(g.tournoi_description || '').trim()) { L.push(String(g.tournoi_description).trim()); L.push(''); }
  if (cats.length) {
    L.push('VOUS ÊTES INVITÉS');
    L.push(introCartesEmail(cats));
    cats.forEach(function (c) {
      const scf = ctxScf(c);
      const max = parseInt(String(c.max_equipes_par_club || '').trim(), 10);
      const eq = (isFinite(max) && max >= 1) ? ('jusqu\'à ' + max + ' équipe(s)/club') : 'plusieurs équipes possibles';
      const seg = [eq];
      const forme = formeJeuEmailTxt(c);
      if (forme) seg.unshift(forme);
      const temps = tempsJeuEmailTxt(c);
      if (temps) seg.push(temps);
      const recup = String(c.recup_entre_matchs_min || '').trim();
      if (recup) seg.push('récup ' + recup + ' min');
      const eff = effectifEmailTxt(c);
      if (eff) seg.push(eff);
      if (String(c.arbitrage_organisation || '').trim()) seg.push('arbitrage : ' + String(c.arbitrage_organisation).trim());
      if (scf.estScf) {
        seg.push(scf.phase === 'P3' ? 'samedi triangulaires · dimanche brassage par niveau'
          : 'plateau en triangulaires / quadrangulaires');
      } else {
        seg.push('après-midi : ' + DOSSIER_FORMATS[cleFormatApresMidi(c)]);
      }
      L.push('- ' + String(c.categorie || '') + ' : ' + seg.join(' · '));
    });
    L.push('');
    // Repères FFR (mêmes conditions que la vitrine et que l'email HTML).
    if (cats.some(function (c) { const n = parseInt(String(c.effectif_min || '').trim(), 10); return isFinite(n) && n >= 1; })) {
      L.push('RAPPEL SÉCURITÉ FFR — ' + FFR_RAPPEL_EFFECTIF);
      L.push('');
    }
    if (cats.some(function (c) { return String(c.format_apresmidi || '').trim().toUpperCase() === 'POULES_NIVEAU'; })) {
      L.push('POURQUOI CE FORMAT ? ' + FFR_POURQUOI_FORMAT);
      L.push('');
    }
  }
  const jour = [];
  if (String(g.heure_rdv || '').trim()) jour.push('Accueil : ' + String(g.heure_rdv).trim());
  if (String(g.heure_debut || '').trim()) jour.push('Coup d\'envoi : ' + String(g.heure_debut).trim());
  if (String(g.pause_dejeuner_debut || '').trim()) jour.push('Pause méridienne : ' + String(g.pause_dejeuner_debut).trim());
  if (heureFinCommuniqueeAdmin(g)) jour.push('Fin envisagée : ' + heureFinCommuniqueeAdmin(g));
  const arb = [];
  cats.forEach(function (c) { const v = String(c.arbitrage_organisation || '').trim(); if (v && arb.indexOf(v) === -1) arb.push(v); });
  if (arb.length) jour.push('Arbitrage : ' + arb.join(' · '));
  if (jour.length) { L.push('LA JOURNÉE : ' + jour.join(' · ')); L.push(''); }
  const services = [];
  if (estOui(g.buvette_disponible)) services.push('buvette');
  if (estOui(g.espace_sandwich_disponible)) services.push('espace sandwich');
  if (estOui(g.boutique_disponible)) services.push('boutique');
  if (services.length) L.push('Sur place : ' + services.join(', ') + '.');
  if (estOui(g.tarif_engagement_oui) && String(g.tarif_engagement_montant || '').trim()) {
    L.push('Tarif d\'engagement : ' + String(g.tarif_engagement_montant).trim());
  }
  if (services.length || (estOui(g.tarif_engagement_oui) && String(g.tarif_engagement_montant || '').trim())) L.push('');
  if (String(g.date_limite_reponse || '').trim()) L.push('Réponse souhaitée avant le ' + formaterDateFr(g.date_limite_reponse) + '.');
  const dConf = String(g.date_limite_confirmation || '').trim();
  if (dConf && dConf !== String(g.date_limite_reponse || '').trim()) L.push('Confirmation des effectifs avant le ' + formaterDateFr(dConf) + '.');
  const c2 = [];
  if (String(g.contact_reponse_nom || '').trim()) c2.push(String(g.contact_reponse_nom).trim());
  if (String(g.contact_reponse_tel || '').trim()) c2.push(telephoneLisibleAdmin(g.contact_reponse_tel));
  if (String(g.contact_reponse_email || '').trim()) c2.push(String(g.contact_reponse_email).trim());
  if (c2.length) L.push('Contact : ' + c2.join(' · '));
  L.push('');
  L.push('Voir la version en ligne : ' + (lienInvitation || lienInvitationPublique()));
  // Liens officiels (icônes dans l'email HTML ; en texte, l'URL est le seul véhicule possible).
  // Liste vide (cas actuel) ⇒ aucun bloc, et pas de ligne vide en trop.
  if (LIENS_ASSOCIATION.length) {
    L.push('');
    LIENS_ASSOCIATION.forEach(function (l) {
      L.push((l.icone === 'instagram' ? 'Instagram ' : '') + l.libelle + ' : ' + l.url);
    });
  }
  L.push('');
  L.push('Au plaisir de vous accueillir,');
  L.push('L\'organisation du tournoi');
  return L.join('\n');
}

/** Heure de fin communiquée aux clubs (manuelle si saisie, sinon fin du dernier match + marge). */
function heureFinCommuniqueeAdmin(g) {
  const manuelle = String(g.heure_fin_communiquee || '').trim();
  if (manuelle) return manuelle;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(g.heure_fin || '').trim());
  if (!m) return '';
  const marge = parseInt(String(g.marge_fin_communiquee_min || '').trim(), 10);
  const total = Math.min(23 * 60 + 59, parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (isFinite(marge) && marge >= 0 ? marge : 75));
  return ('0' + Math.floor(total / 60)).slice(-2) + ':' + ('0' + (total % 60)).slice(-2);
}

/** « 0612345678 » → « 06 12 34 56 78 » (affichage). */
function telephoneLisibleAdmin(v) {
  const c = String(v || '').replace(/\D/g, '');
  return /^\d{10}$/.test(c) ? c.replace(/(\d{2})(?=\d)/g, '$1 ').trim() : String(v || '');
}

/* Dernières valeurs AUTO-générées (objet + intro) : savoir si Romain a édité à la main. */
let invApercuGenere = { sujet: null, intro: null };

/**
 * (Re)dessine l'aperçu HTML de l'email d'invitation dans l'iframe. L'objet et la phrase d'intro
 * sont ÉDITABLES : mis à jour automatiquement (au fil des cartes Sur place / Réponse) tant que
 * Romain ne les a pas modifiés à la main. Le rendu utilise l'affiche via son URL Drive et une
 * salutation d'exemple (le premier prénom de la liste).
 */
function majApercuInvitation() {
  const objet = document.getElementById('apercu-invitation-objet');
  const intro = document.getElementById('apercu-invitation-intro');
  const rendu = document.getElementById('apercu-invitation-rendu');
  if (!objet || !intro || !rendu) return;
  const g = globalInvitation();
  const gen = { sujet: sujetInvitation(g), intro: introInvitationDefaut(g) };
  if (objet.value === '' || objet.value === invApercuGenere.sujet) objet.value = gen.sujet;
  if (intro.value === '' || intro.value === invApercuGenere.intro) intro.value = gen.intro;
  invApercuGenere = gen;
  const cats = catsInvitationTriees();
  const imgSrc = String(g.tournoi_affiche_id || '').trim() ? urlAffiche(g.tournoi_affiche_id, 800) : '';
  const salut = 'Bonjour ' + echapper(exemplePrenomInvitation()) + ',';
  // Aperçu : liens d'EXEMPLE (les vrais liens, avec jeton, sont construits par club à l'envoi).
  rendu.srcdoc = emailHtmlInvitation(g, cats, imgSrc, salut, intro.value, lienReponseApercu(), lienInvitationApercu());
}

/** URL absolue de la page de réponse (base, sans club/token — le backend les ajoute par club). */
function baseReponseInvitation() {
  const url = new URL('reponse-invitation.html', window.location.href);
  const tn = (configCourante.global && configCourante.global.tournoi_nom) || '';
  if (tn) url.searchParams.set('tournoi', tn);
  return url.toString();
}

/** Lien de réponse d'EXEMPLE pour l'aperçu (jeton fictif, juste pour montrer le bouton). */
function lienReponseApercu() {
  return baseReponseInvitation() + '&club=EXEMPLE&token=EXEMPLE';
}

/** « Régénérer » : réécrit objet + intro depuis les infos du tournoi (écrase les retouches). */
function onRegenererInvitation() {
  const objet = document.getElementById('apercu-invitation-objet');
  const intro = document.getElementById('apercu-invitation-intro');
  if (!objet || !intro) return;
  const g = globalInvitation();
  objet.value = sujetInvitation(g);
  intro.value = introInvitationDefaut(g);
  invApercuGenere = { sujet: objet.value, intro: intro.value };
  majApercuInvitation();
}

/** Objet COURANT de l'aperçu (éventuellement édité), ou le défaut. */
function sujetInvitationCourant() {
  const el = document.getElementById('apercu-invitation-objet');
  const v = el ? el.value.trim() : '';
  return v || sujetInvitation(globalInvitation());
}

/** Phrase d'intro COURANTE (éventuellement éditée), ou le défaut. */
function introInvitationCourant() {
  const el = document.getElementById('apercu-invitation-intro');
  return el ? el.value : introInvitationDefaut(globalInvitation());
}

/** Modèle HTML envoyé au backend : jetons {{SALUTATION}} / {{LIEN_REPONSE}} / {{LIEN_INVITATION}}
 *  + affiche en cid:affiche (si présente). */
function htmlModeleInvitation() {
  const g = globalInvitation();
  const imgSrc = String(g.tournoi_affiche_id || '').trim() ? 'cid:affiche' : '';
  return emailHtmlInvitation(g, catsInvitationTriees(), imgSrc, '{{SALUTATION}}', introInvitationCourant(), '{{LIEN_REPONSE}}', '{{LIEN_INVITATION}}');
}

/** Modèle TEXTE envoyé au backend (fallback), avec les trois mêmes jetons. */
function texteModeleInvitation() {
  return emailTexteInvitation(globalInvitation(), catsInvitationTriees(), '{{SALUTATION}}', introInvitationCourant(), '{{LIEN_REPONSE}}', '{{LIEN_INVITATION}}');
}

/** Vrai si un club est ENCORE invitable (ni Accepté, ni Décliné). */
function estInvitable(statut) {
  return !estAccepte(statut) && !memeTexteSouple(statut, 'Décliné');
}

/** Envoi INDIVIDUEL de l'invitation à un club (même contenu que l'aperçu). */
async function envoyerInvitationClubUI(nom) {
  const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;
  const message = document.getElementById('message-club-invite');
  const email = String(club.club_contact_email || '').trim();
  if (!email) { await dialogAlerter('« ' + nom + ' » n\'a pas d\'email de contact : à inviter manuellement.'); return; }
  const sujet = sujetInvitationCourant();
  if (!sujet) { afficherMessage(message, '⚠️ L\'objet de l\'aperçu ne peut pas être vide.', 'ko'); return; }
  if (!await dialogConfirmer('Envoyer l\'invitation à « ' + nom + ' » (' + email + ') ?', { ok: 'Envoyer' })) return;
  try {
    const res = await ecrireAdmin('envoyerInvitationClub', {
      club_nom: nom, sujet: sujet, html_modele: htmlModeleInvitation(), texte_modele: texteModeleInvitation(),
      base_reponse: baseReponseInvitation(), base_invitation: lienInvitationPublique()
    });
    if (res && res.invitation_envoyee) club.invitation_envoyee = res.invitation_envoyee;
    afficherClubsInvites();
    afficherMessage(message, '✅ Invitation envoyée à ' + email + '.', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  }
}

/**
 * Envoi GROUPÉ des invitations : résumé AVANT confirmation (éligibles / sans email / déjà
 * invités), case « Renvoyer aussi » optionnelle, puis envoi tolérant aux pannes côté backend
 * et résumé final (« N envoyées, M échecs : … »).
 */
async function onEnvoyerInvitationsGroupe() {
  const message = document.getElementById('message-invitations');
  const bouton = document.getElementById('bouton-envoyer-invitations');
  const renvoyer = document.getElementById('inv-renvoyer').checked;
  const sujet = sujetInvitationCourant();
  if (!sujet) { afficherMessage(message, '⚠️ L\'objet de l\'aperçu ne peut pas être vide.', 'ko'); return; }

  // Résumé calculé depuis la liste en mémoire (mêmes règles que le backend).
  const invitables = clubsInvitesCourants.filter(function (c) { return estInvitable(c.statut); });
  const avecEmail = invitables.filter(function (c) { return String(c.club_contact_email || '').trim(); });
  const sansEmail = invitables.filter(function (c) { return !String(c.club_contact_email || '').trim(); });
  const deja = avecEmail.filter(function (c) { return String(c.invitation_envoyee || '').trim(); });
  const eligibles = avecEmail.filter(function (c) { return renvoyer || !String(c.invitation_envoyee || '').trim(); });

  if (!eligibles.length) {
    await dialogAlerter('Aucun club à inviter pour le moment.\n\n'
      + sansEmail.length + ' club(s) sans email (à inviter manuellement).\n'
      + deja.length + ' club(s) déjà invité(s)'
      + (renvoyer ? '.' : ' — coche « Renvoyer aussi » pour les relancer.'));
    return;
  }
  const resume = 'Envoyer l\'invitation à ' + eligibles.length + ' club(s) ?\n\n'
    + '• ' + eligibles.length + ' recevront l\'invitation\n'
    + '• ' + sansEmail.length + ' sans email (à inviter manuellement)\n'
    + '• ' + deja.length + ' déjà invité(s) ' + (renvoyer ? '(seront renvoyés)' : '(exclus)');
  if (!await dialogConfirmer(resume, { ok: 'Confirmer l\'envoi' })) return;

  bouton.disabled = true;
  const texte = bouton.textContent;
  bouton.textContent = 'Envoi…';
  afficherMessage(message, 'Envoi en cours…', 'ok');
  try {
    const res = await ecrireAdmin('envoyerInvitationsGroupe', {
      sujet: sujet, html_modele: htmlModeleInvitation(), texte_modele: texteModeleInvitation(),
      base_reponse: baseReponseInvitation(), base_invitation: lienInvitationPublique(),
      renvoyer: renvoyer ? 'oui' : 'non'
    });
    await chargerClubsInvites(); // rafraîchit invitation_envoyee + l'aperçu (exemple prénom)
    const nbOk = (res.envoyes || []).length;
    const ech = res.echecs || [];
    let msg = '✅ ' + nbOk + ' invitation(s) envoyée(s).';
    if (ech.length) msg += ' ⚠️ ' + ech.length + ' échec(s) : ' + ech.map(function (e) { return e.club; }).join(', ') + '.';
    afficherMessage(message, msg, ech.length ? 'ko' : 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
    bouton.textContent = texte;
  }
}

/* --------------------------------------------------------------------------
   DOSSIER D'INVITATION — modalités d'inscription, parking & accès,
   encadrement & assurance (paramètres globaux de Config, tous optionnels).
   Chaque carte s'enregistre indépendamment via l'action enregistrerInvitation
   (le backend n'écrit que les champs présents dans la requête).
   -------------------------------------------------------------------------- */

/** Vrai si un paramètre 'oui'/'non' de Config vaut 'oui'. */
function estOui(valeur) {
  return String(valeur || '').toLowerCase() === 'oui';
}

/** Pré-remplit les TROIS cartes du dossier d'invitation avec l'état enregistré. */
function majInvitation() {
  const g = configCourante.global || {};

  // 1) Modalités d'inscription.
  const fm = document.getElementById('form-modalites');
  if (fm) {
    fm.date_limite_confirmation.value = g.date_limite_confirmation || '';
    fm.tarif_engagement_oui.checked = estOui(g.tarif_engagement_oui);
    fm.tarif_engagement_montant.value = g.tarif_engagement_montant || '';
    fm.tarif_engagement_modalites.value = g.tarif_engagement_modalites || '';
    majAffichageTarif(fm);
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(fm);
  }

  // 2) Parking & accès (texte + aperçu de la photo déjà enregistrée sur Drive).
  const fp = document.getElementById('form-parking');
  if (fp) {
    fp.parking_texte.value = g.parking_texte || '';
    parkingDataURI = '';
    const bloc = document.getElementById('apercu-parking');
    const img = document.getElementById('apercu-parking-img');
    if (g.parking_photo_id) {
      img.src = urlAffiche(g.parking_photo_id, 600);
      bloc.hidden = false;
    } else {
      img.removeAttribute('src');
      bloc.hidden = true;
    }
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(fp);
  }

  // 3) Encadrement & assurance.
  const fe = document.getElementById('form-encadrement');
  if (fe) {
    fe.encadrement_ratio.value = g.encadrement_ratio || '';
    fe.encadrement_diplomes.value = g.encadrement_diplomes || '';
    fe.assurance_attestation_requise.checked = estOui(g.assurance_attestation_requise);
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(fe);
  }
}

/** Révèle / masque les champs du tarif selon la case « Tarif d'engagement ». */
function majAffichageTarif(form) {
  document.getElementById('lignes-tarif-engagement').hidden = !form.tarif_engagement_oui.checked;
}

/** Case à cocher de la carte Modalités : met à jour l'affichage conditionnel. */
function onModalitesChange(evenement) {
  if (evenement.target.name === 'tarif_engagement_oui') {
    majAffichageTarif(document.getElementById('form-modalites'));
  }
}

/**
 * Enregistrement générique d'une carte du dossier d'invitation : envoie `data`
 * à enregistrerInvitation, met à jour la config en mémoire, reprend la photo
 * « propre » du formulaire et rafraîchit l'état du dossier.
 */
async function enregistrerCarteInvitation(data, form, bouton, message, texteOk) {
  await avecBoutonOccupe(bouton, message, async function () {
    await ecrireAdmin('enregistrerInvitation', data);
    configCourante.global = Object.assign({}, configCourante.global, data);
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
    majDossier(); // les sections du dossier suivent
    afficherMessage(message, texteOk, 'ok');
  });
}

/** Enregistre la carte « Modalités d'inscription ». */
function onEnregistrerModalites() {
  const form = document.getElementById('form-modalites');
  const data = {
    date_limite_confirmation:   form.date_limite_confirmation.value,
    tarif_engagement_oui:       form.tarif_engagement_oui.checked ? 'oui' : 'non',
    tarif_engagement_montant:   form.tarif_engagement_montant.value.trim(),
    tarif_engagement_modalites: form.tarif_engagement_modalites.value.trim()
  };
  return enregistrerCarteInvitation(data, form,
    document.getElementById('bouton-enregistrer-modalites'),
    document.getElementById('message-modalites'),
    '✅ Modalités enregistrées.');
}

/** Enregistre la carte « Encadrement & assurance ». */
function onEnregistrerEncadrement() {
  const form = document.getElementById('form-encadrement');
  const data = {
    encadrement_ratio:             form.encadrement_ratio.value.trim(),
    encadrement_diplomes:          form.encadrement_diplomes.value.trim(),
    assurance_attestation_requise: form.assurance_attestation_requise.checked ? 'oui' : 'non'
  };
  return enregistrerCarteInvitation(data, form,
    document.getElementById('bouton-enregistrer-encadrement'),
    document.getElementById('message-encadrement'),
    '✅ Encadrement & assurance enregistrés.');
}

/** Enregistre la carte « Parking & accès » : le texte, puis la photo si une nouvelle
 *  a été choisie (même enchaînement que les infos du tournoi + l'affiche). */
async function onEnregistrerParking() {
  const form = document.getElementById('form-parking');
  const bouton = document.getElementById('bouton-enregistrer-parking');
  const message = document.getElementById('message-parking');
  const texteBouton = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Enregistrement…';
  try {
    await ecrireAdmin('enregistrerInvitation', { parking_texte: form.parking_texte.value.trim() });
    if (parkingDataURI) {
      afficherMessage(message, 'Envoi de la photo…', 'ok');
      await ecrireAdmin('enregistrerPhotoParking', { photo: parkingDataURI });
    }
    // On recharge la config pour refléter ce qui est réellement enregistré (dont la photo).
    configCourante = await lireConfigAdmin();
    majInvitation();
    majDossier();
    form.parking_photo.value = ''; // vide le champ fichier
    afficherMessage(message, '✅ Parking & accès enregistrés.', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteBouton;
  }
}

/** Traite une photo de parking (choisie OU déposée) : redimensionne, aperçu immédiat. */
async function traiterFichierParking(fichier) {
  const message = document.getElementById('message-parking');
  if (!fichier) { parkingDataURI = ''; return; }
  try {
    parkingDataURI = await redimensionnerImage(fichier, 1000, 0.82);
    document.getElementById('apercu-parking-img').src = parkingDataURI;
    document.getElementById('apercu-parking').hidden = false;
  } catch (e) {
    parkingDataURI = '';
    afficherMessage(message, "⚠️ Image illisible. Choisis un fichier image (JPG, PNG…).", 'ko');
  }
}

/**
 * Retire la photo du parking. Deux cas (mêmes règles que l'affiche) :
 *   1) une image vient d'être choisie mais pas encore enregistrée → on annule le choix ;
 *   2) une photo est déjà enregistrée → suppression backend (fichier Drive + Config).
 */
async function onRetirerPhotoParking() {
  const message = document.getElementById('message-parking');
  const form = document.getElementById('form-parking');

  // Cas 1 : choix non enregistré → on annule simplement la sélection.
  if (parkingDataURI) {
    parkingDataURI = '';
    form.parking_photo.value = '';
    majInvitation(); // ré-affiche la photo enregistrée, ou masque l'aperçu si aucune
    afficherMessage(message, 'Choix de photo annulé.', 'ok');
    return;
  }

  // Cas 2 : photo enregistrée → confirmation puis suppression backend.
  if (!(configCourante.global && configCourante.global.parking_photo_id)) return;
  if (!await dialogConfirmer('Retirer la photo du parking ?', { ok: 'Retirer', danger: true })) return;

  const bouton = document.getElementById('bouton-retirer-parking');
  bouton.disabled = true;
  try {
    await ecrireAdmin('supprimerPhotoParking', {});
    configCourante = await lireConfigAdmin();
    majInvitation();
    majDossier();
    afficherMessage(message, '🗑️ Photo du parking retirée.', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
  }
}

/* --------------------------------------------------------------------------
   CLUBS INVITÉS — liste des clubs à qui on envoie le dossier d'invitation.
   ⚠️ L'onglet contient des EMAILS : il se lit via l'action listerClubsInvites,
   protégée par la clé admin (jamais dans le snapshot public getAll / CDN).
   -------------------------------------------------------------------------- */

/* Statuts admis (mêmes formes canoniques que le backend). « Confirmé » = ancien libellé
   d'« Accepté » (reconnu par memeTexteSouple pour les données déjà en Sheet). */
const STATUTS_CLUB_INVITE = ['Invité', 'Accepté', 'Décliné'];

/* Nom du club actuellement en ÉDITION inline des coordonnées (Sprint 6, point 6e), ou null. */
let clubEnEdition = null;

/** Vrai si le statut d'un club vaut « Accepté » (ou l'ancien « Confirmé »). */
function estAccepte(statut) {
  return memeTexteSouple(statut, 'Accepté') || memeTexteSouple(statut, 'Confirmé');
}

/** Compare deux textes sans accents ni casse (piège NFC/NFD du Sheet : « Invité »
 *  peut revenir avec un é décomposé — même précaution que estTermine). */
function memeTexteSouple(a, b) {
  function plat(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }
  return plat(a) === plat(b);
}

/**
 * Charge la liste des clubs invités depuis le backend (clé admin) et l'affiche.
 *
 * ⭐ RENVOIE si la relecture a RÉUSSI (M1-B2 / B2-0). L'erreur reste absorbée ici — c'est
 * délibéré : sur les quatre autres appels (après un ajout, un envoi, une synchronisation), une
 * coupure réseau passagère ne doit pas interrompre le geste en cours. ⛔ Mais un appelant qui a
 * BESOIN de savoir doit pouvoir le savoir : `onReinitialiser` s'en sert pour prévenir que
 * l'écran n'a pas pu être rafraîchi. Les autres appelants ignorent simplement cette valeur.
 * @return {Promise<boolean>} true si `clubsInvitesCourants` porte bien l'état du serveur
 */
async function chargerClubsInvites() {
  const zone = document.getElementById('liste-clubs-invites');
  if (!zone) return false; // carte absente de cette page : rien n'a été relu
  try {
    const res = await ecrireAdmin('listerClubsInvites', {});
    clubsInvitesCourants = (res && res.clubs) || [];
    afficherClubsInvites();
    // L'aperçu du dossier ouvre le dossier D'UN CLUB : sa liste de choix suit les clubs chargés
    // (elle est vide au premier rendu de la carte, avant cet appel).
    if (typeof majApercuDossier === 'function') majApercuDossier();
    return true;
  } catch (erreur) {
    zone.innerHTML = '<p class="vide">⚠️ Impossible de charger les clubs invités : '
      + echapper(erreur.message) + '</p>';
    return false;
  }
}

/**
 * ÉTAT d'une carte club — pilote le liseré, le badge et le tri en pile (décisions Romain) :
 *  - 'a-enregistrer' (orange) : Accepté, sélection PAS (ou PLUS) enregistrée — le club a répondu
 *    ou modifié sa réponse (repondreInvitation efface la marque), action requise ;
 *  - 'attente'       (violet) : pas encore de réponse (Invité) ;
 *  - 'a-envoyer'     (bleu)   : Accepté, sélection enregistrée, DOSSIER PAS ENCORE ENVOYÉ —
 *    le club n'a toujours rien reçu, c'est la dernière action qui lui manque ;
 *  - 'complet'       (vert)   : sélection enregistrée ET dossier envoyé — rien à faire ;
 *  - 'decline'       (rouge)  : invitation déclinée.
 * Colonne selection_enregistree absente (vieux Sheet) ⇒ orange : défaut PRUDENT, la carte
 * réclame une relecture plutôt que de se dire à jour.
 */
function etatClubInvite(club) {
  if (memeTexteSouple(club.statut, 'Décliné')) return 'decline';
  if (estAccepte(club.statut)) {
    if (!String(club.selection_enregistree || '').trim()) return 'a-enregistrer';
    // Sélection enregistrée : il RESTE à envoyer le dossier. Tant qu'il ne l'est pas, la carte
    // le dit — c'est une action à faire, pas un état terminé. Le club, lui, n'a encore rien reçu.
    return String(club.dossier_envoye || '').trim() ? 'complet' : 'a-envoyer';
  }
  return 'attente';
}

/** Libellés humains des états (badge de la carte — jamais la couleur seule). */
const LIBELLES_ETAT_CLUB = {
  'a-enregistrer': 'À enregistrer',
  'attente': 'En attente de réponse',
  'a-envoyer': 'Dossier à envoyer',
  'complet': 'Dossier envoyé',
  'decline': 'Déclinée'
};

/** Catégories engagées (texte « U8,U10 » ou JSON) → tableau de noms normalisés (MAJ). */
function parseCatsEngagees(brut) {
  const t = String(brut || '').trim();
  if (!t) return [];
  let liste = null;
  try { const o = JSON.parse(t); if (Array.isArray(o)) liste = o; } catch (e) { /* pas du JSON */ }
  if (!liste) liste = t.split(',');
  return liste.map(function (s) { return String(s).trim().toUpperCase(); }).filter(Boolean);
}

/**
 * Panneau « Accepté » d'un club : cases à cocher des catégories du tournoi (pré-cochées sur
 * toutes par défaut, ou sur categories_engagees si déjà renseigné), champ prénom du contact,
 * bouton d'enregistrement de la sélection, puis — une fois categories_engagees renseigné —
 * bouton « Générer le dossier final ».
 */
function panneauAccepteClub(club, nom) {
  const cats = (configCourante.categories || []).filter(estPresente)
    .slice().sort(function (a, b) { return comparerCategorie(a.categorie, b.categorie); });
  const engBrut = String(club.categories_engagees || '').trim();
  const eng = parseCatsEngagees(engBrut);
  const toutParDefaut = eng.length === 0; // rien encore enregistré → tout coché
  const cases = cats.map(function (c) {
    const val = String(c.categorie || '');
    const coche = toutParDefaut || eng.indexOf(val.toUpperCase()) !== -1;
    return '<label><input type="checkbox" class="club-cat-case" value="' + echapper(val) + '"' +
      (coche ? ' checked' : '') + '> ' + echapper(val) + '</label>';
  }).join('');

  const boutonGenerer = engBrut
    ? '<button class="bouton bouton-generer-dossier" data-club="' + echapper(nom) + '">' + svgIcone('dossier') + 'Générer le dossier final</button>'
    : '';

  return '<div class="club-panneau" data-club="' + echapper(nom) + '">' +
    resumeReponseClub(club) +
    '<p class="club-panneau-titre">Catégories engagées par le club</p>' +
    (cats.length
      ? '<div class="club-cats">' + cases + '</div>'
      : '<p class="vide">Ajoute d\'abord des catégories au tournoi.</p>') +
    '<label class="club-prenom-champ">Prénom du contact (pour la politesse du dossier)' +
      '<input type="text" class="club-prenom-input" value="' + echapper(String(club.club_contact_prenom || '')) + '" ' +
             'placeholder="Ex : Camille" autocomplete="off"></label>' +
    '<div class="club-panneau-actions">' +
      '<button class="bouton bouton-cats-club" data-club="' + echapper(nom) + '">' + svgIcone('enregistrer') + 'Enregistrer la sélection</button>' +
      boutonGenerer +
    '</div>' +
  '</div>';
}

/**
 * Résumé (lecture seule) de la RÉPONSE remontée par le club en libre-service : catégories +
 * nombre d'équipes par catégorie, nombre de joueurs total, date de réponse. '' si rien.
 */
function resumeReponseClub(club) {
  const nbCat = parseCatsEnginesNb(club.nb_equipes_par_categorie);
  const cles = Object.keys(nbCat);
  const joueurs = String(club.nb_joueurs_total || '').trim();
  const dateRep = String(club.date_reponse || '').trim();
  if (!cles.length && !joueurs && !dateRep) return '';

  let lignes = '';
  if (cles.length) {
    const detail = cles.map(function (c) {
      const n = parseInt(nbCat[c], 10);
      return echapper(c) + ' : ' + (isFinite(n) ? n : nbCat[c]) + ' équipe' + (n > 1 ? 's' : '');
    }).join(' · ');
    lignes += '<div class="club-rep-ligne">🏉 ' + detail + '</div>';
  }
  // Éducateurs déclarés (détail par équipe, session 23) — affiché seulement si le club a répondu
  // avec le nouveau formulaire (colonne vide pour les anciennes réponses).
  const educateurs = String(club.nb_educateurs_total || '').trim();
  if (joueurs) {
    lignes += '<div class="club-rep-ligne">👥 ' + echapper(joueurs) + ' joueurs attendus au total' +
      (educateurs ? ' · 🎓 ' + echapper(educateurs) + ' éducateur' + (parseInt(educateurs, 10) > 1 ? 's' : '') : '') +
      '</div>';
  }
  return '<div class="club-reponse">' +
    '<p class="club-reponse-titre">Réponse du club' + (dateRep ? ' (le ' + echapper(dateRep) + ')' : '') + '</p>' +
    lignes + '</div>';
}

/** JSON {"U8":2,…} → objet ; {} si illisible. */
function parseCatsEnginesNb(brut) {
  try { const o = JSON.parse(String(brut || '').trim() || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; }
  catch (e) { return {}; }
}

/**
 * Ordre de tri de la PILE (décisions Romain, session liserés) — suit l'état de la carte :
 *   0 = orange « À enregistrer » (action requise, en haut)
 *   1 = violet « En attente de réponse » (rien à faire, milieu)
 *   2 = vert « Sélection enregistrée » (à jour, en bas)
 *   3 = rouge « Déclinée » (cartes mortes, tout en bas)
 */
function bucketClub(club) {
  // Ordre de la pile : ce qui demande une action d'abord (enregistrer, puis envoyer), l'attente
  // ensuite, et tout en bas ce qui est terminé ou décliné.
  return { 'a-enregistrer': 0, 'a-envoyer': 1, 'attente': 2, 'complet': 3, 'decline': 4 }[etatClubInvite(club)];
}

/** Affiche la liste des clubs invités (triée), avec statut, réponse remontée, panneau, envoi. */
function afficherClubsInvites() {
  const zone = document.getElementById('liste-clubs-invites');
  if (!zone) return;

  if (!clubsInvitesCourants.length) {
    zone.innerHTML = '<p class="vide">Aucun club invité pour le moment. Ajoute le premier ci-dessus.</p>';
    return;
  }

  // Tri : action requise en haut, déjà traités en bas ; à bucket égal, ordre alphabétique.
  const tries = clubsInvitesCourants.slice().sort(function (a, b) {
    const ba = bucketClub(a), bb = bucketClub(b);
    if (ba !== bb) return ba - bb;
    return String(a.club_nom || '').localeCompare(String(b.club_nom || ''), 'fr');
  });

  let html = '';
  tries.forEach(function (club) {
    const nom = String(club.club_nom || '');
    // Ligne en mode ÉDITION inline des coordonnées (Sprint 6, point 6e).
    if (clubEnEdition && memeTexteSouple(nom, clubEnEdition)) { html += htmlClubEdition(club, nom); return; }
    // Contact : « Prénom Nom · email » (les bouts vides sont omis).
    const identite = [club.club_contact_prenom, club.club_contact_nom].filter(Boolean).join(' ');
    const contact = [identite, club.club_contact_email].filter(Boolean).join(' · ');
    const options = STATUTS_CLUB_INVITE.map(function (s) {
      return '<option value="' + echapper(s) + '"' +
        (memeTexteSouple(club.statut, s) || (estAccepte(club.statut) && s === 'Accepté') ? ' selected' : '') +
        '>' + echapper(s) + '</option>';
    }).join('');
    const aEmail = !!String(club.club_contact_email || '').trim();
    const invite = String(club.invitation_envoyee || '').trim();
    const envoye = String(club.dossier_envoye || '').trim();
    const alerte = String(club.alerte_ecart || '').trim();
    const etat = etatClubInvite(club);
    // Badges : ÉTAT de la carte (même info que le liseré — jamais la couleur seule), puis
    // invitation (Phase 1), dossier (Phase 2), et alerte d'écart d'engagement.
    const badges =
      '<span class="club-etat-badge etat-' + etat + '">' + LIBELLES_ETAT_CLUB[etat] + '</span>' +
      (invite ? '<span class="club-envoye club-badge-invite" title="Invitation envoyée">✉️ Invité le ' + echapper(invite) + '</span>' : '') +
      (envoye ? '<span class="club-envoye" title="Dossier envoyé">le ' + echapper(envoye) + '</span>' : '') +
      (alerte ? '<span class="club-alerte-ecart" tabindex="0" role="button" title="' + echapper(alerte) + '" data-club="' + echapper(nom) + '">⚠️ Écart</span>' : '');
    // Bouton d'envoi INDIVIDUEL de l'invitation (désactivé si le club n'a pas d'email).
    const boutonInviter = aEmail
      ? '<button class="bouton-icone bouton-inviter-club" title="Envoyer l\'invitation" aria-label="Envoyer l\'invitation à ' + echapper(nom) + '" data-club="' + echapper(nom) + '">' + svgIcone('email') + '</button>'
      : '<button class="bouton-icone bouton-inviter-club" title="Pas d\'email : à inviter manuellement" aria-label="Pas d\'email" disabled>' + svgIcone('email') + '</button>';

    html +=
      '<div class="equipe-item club-invite-item club-etat-' + etat + '" data-club="' + echapper(nom) + '">' +
        '<span class="nom">' + echapper(nom) +
          (contact ? '<span class="club-contact">' + echapper(contact) + '</span>' : '') +
        '</span>' +
        '<div class="equipe-actions">' +
          badges +
          boutonInviter +
          '<button class="bouton-icone bouton-editer-club" title="Modifier les coordonnées" aria-label="Modifier les coordonnées de ' + echapper(nom) + '" data-club="' + echapper(nom) + '">' + svgIcone('crayon') + '</button>' +
          '<select class="statut-club" data-club="' + echapper(nom) + '" ' +
                  'aria-label="Statut de ' + echapper(nom) + '">' + options + '</select>' +
          '<button class="bouton-suppr bouton-icone bouton-suppr-club" title="Retirer" aria-label="Retirer" ' +
                  'data-club="' + echapper(nom) + '">' + svgIcone('corbeille') + '</button>' +
        '</div>' +
        // Panneau de sélection des catégories + génération, visible seulement si Accepté.
        (estAccepte(club.statut) ? panneauAccepteClub(club, nom) : '') +
      '</div>';
  });
  zone.innerHTML = html;
  majApercuInvitation(); // l'exemple de prénom de l'aperçu suit la liste
}

/** Ligne d'un club en mode ÉDITION inline des coordonnées (nom + contact). */
function htmlClubEdition(club, nom) {
  const dejaRepondu = String(club.date_reponse || '').trim() !== '';
  const avert = dejaRepondu
    ? '<p class="club-edit-avert">Ce club a déjà répondu à cette adresse : la modifier n\'affecte pas sa réponse déjà enregistrée.</p>'
    : '';
  return '<div class="equipe-item club-invite-item club-en-edition" data-club="' + echapper(nom) + '">' +
      '<div class="club-edit-champs">' +
        '<input class="club-edit-nom" type="text" value="' + echapper(club.club_nom || '') + '" placeholder="Nom du club" aria-label="Nom du club">' +
        '<input class="club-edit-prenom" type="text" value="' + echapper(club.club_contact_prenom || '') + '" placeholder="Prénom du contact" aria-label="Prénom du contact">' +
        '<input class="club-edit-contact" type="text" value="' + echapper(club.club_contact_nom || '') + '" placeholder="Nom du contact" aria-label="Nom du contact">' +
        '<input class="club-edit-email" type="email" value="' + echapper(club.club_contact_email || '') + '" placeholder="Email du contact" aria-label="Email du contact">' +
        avert +
      '</div>' +
      '<div class="equipe-actions">' +
        '<button class="bouton btn-enregistrer-edition" data-club="' + echapper(nom) + '">Enregistrer</button>' +
        '<button class="bouton bouton-discret btn-annuler-edition" data-club="' + echapper(nom) + '">Annuler</button>' +
      '</div>' +
    '</div>';
}

/** Ajoute un club invité (statut initial « Invité », date d'ajout posée par le backend). */
async function onAjouterClubInvite(evenement) {
  evenement.preventDefault();
  const champNom = document.getElementById('champ-club-nom');
  const champContact = document.getElementById('champ-club-contact');
  const champPrenom = document.getElementById('champ-club-prenom');
  const champEmail = document.getElementById('champ-club-email');
  const bouton = document.getElementById('bouton-ajouter-club');
  const message = document.getElementById('message-club-invite');

  // Casse normalisée : MAJUSCULES pour le club + le contact, minuscules pour l'email.
  // (Le nom du club sert à nommer les équipes auto : elles reprennent cette casse exacte.)
  const nom = champNom.value.trim().toUpperCase();
  if (!nom) { afficherMessage(message, 'Indique le nom du club.', 'ko'); return; }

  const doublon = clubsInvitesCourants.some(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (doublon) {
    afficherMessage(message, '⚠️ « ' + nom + ' » est déjà dans la liste.', 'ko');
    return;
  }

  bouton.disabled = true;
  bouton.textContent = 'Ajout…';
  try {
    await ecrireAdmin('ajouterClubInvite', {
      club_nom: nom,
      club_contact_nom: champContact.value.trim().toUpperCase(),
      club_contact_prenom: champPrenom.value.trim().toUpperCase(),
      club_contact_email: champEmail.value.trim().toLowerCase()
    });
    champNom.value = ''; champContact.value = ''; champPrenom.value = ''; champEmail.value = '';
    champNom.focus();
    afficherMessage(message, '✅ « ' + nom + ' » ajouté (statut : Invité).', 'ok');
    await chargerClubsInvites();
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Ajouter';
  }
}

/** Changement de statut via le menu déroulant d'un club (enregistrement immédiat).
 *  Passer à « Accepté » fait apparaître le panneau de sélection des catégories (pré-cochées
 *  sur toutes par défaut). Revenir à « Invité »/« Décliné » CONSERVE categories_engagees. */
async function onChangerStatutClub(evenement) {
  const select = evenement.target.closest('.statut-club');
  if (!select) return;
  const nom = select.getAttribute('data-club');
  const message = document.getElementById('message-club-invite');
  select.disabled = true;
  try {
    await ecrireAdmin('modifierStatutClubInvite', { club_nom: nom, statut: select.value });
    const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, nom); });
    if (club) club.statut = select.value;
    afficherClubsInvites(); // pastille + panneau « Accepté » suivent le nouveau statut
    afficherMessage(message, '✅ « ' + nom + ' » → ' + select.value + '.', 'ok');
  } catch (erreur) {
    afficherClubsInvites(); // revient à l'état connu si l'enregistrement a échoué
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  }
}

/** Clic dans la liste des clubs : suppression, envoi d'invitation, catégories, ou génération. */
async function onClicClubsInvites(evenement) {
  const btnSuppr = evenement.target.closest('.bouton-suppr-club');
  if (btnSuppr) return supprimerClubInviteUI(btnSuppr);
  const btnInviter = evenement.target.closest('.bouton-inviter-club');
  if (btnInviter && !btnInviter.disabled) return envoyerInvitationClubUI(btnInviter.getAttribute('data-club'));
  const btnCats = evenement.target.closest('.bouton-cats-club');
  if (btnCats) return enregistrerCatsClub(btnCats);
  const btnGen = evenement.target.closest('.bouton-generer-dossier');
  if (btnGen) return genererDossierFinal(btnGen.getAttribute('data-club'));
  // Édition inline des coordonnées (Sprint 6, point 6e).
  const btnEdit = evenement.target.closest('.bouton-editer-club');
  if (btnEdit) { clubEnEdition = btnEdit.getAttribute('data-club'); afficherClubsInvites(); return; }
  const btnAnnul = evenement.target.closest('.btn-annuler-edition');
  if (btnAnnul) { clubEnEdition = null; afficherClubsInvites(); return; }
  const btnSave = evenement.target.closest('.btn-enregistrer-edition');
  if (btnSave) return enregistrerEditionClub(btnSave.getAttribute('data-club'));
  // Badge d'alerte : afficher le détail complet.
  const badgeAlerte = evenement.target.closest('.club-alerte-ecart');
  if (badgeAlerte) {
    const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, badgeAlerte.getAttribute('data-club')); });
    if (club) await dialogAlerter(String(club.alerte_ecart || ''));
    return;
  }
}

/** Enregistre les coordonnées éditées d'un club (nom non vide + email valide). Clé = ancien nom. */
async function enregistrerEditionClub(nomActuel) {
  const message = document.getElementById('message-club-invite');
  const ligne = document.querySelector('.club-en-edition[data-club="' + (window.CSS && CSS.escape ? CSS.escape(nomActuel) : nomActuel) + '"]');
  if (!ligne) return;
  // Même casse qu'à l'ajout : MAJUSCULES pour le club + le contact, minuscules pour l'email.
  const nom = ligne.querySelector('.club-edit-nom').value.trim().toUpperCase();
  const prenom = ligne.querySelector('.club-edit-prenom').value.trim().toUpperCase();
  const contact = ligne.querySelector('.club-edit-contact').value.trim().toUpperCase();
  const email = ligne.querySelector('.club-edit-email').value.trim().toLowerCase();
  if (!nom) { afficherMessage(message, 'Le nom du club ne peut pas être vide.', 'ko'); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    afficherMessage(message, 'Email du contact invalide.', 'ko'); return;
  }
  const btn = ligne.querySelector('.btn-enregistrer-edition');
  btn.disabled = true; btn.textContent = 'Enregistrement…';
  try {
    await ecrireAdmin('modifierClubInvite', {
      club_nom_actuel: nomActuel, club_nom: nom,
      club_contact_prenom: prenom, club_contact_nom: contact, club_contact_email: email
    });
    clubEnEdition = null;
    afficherMessage(message, '✅ Coordonnées mises à jour.', 'ok');
    await chargerClubsInvites();
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    btn.disabled = false; btn.textContent = 'Enregistrer';
  }
}

/** Retire un club de la liste — EN CASCADE avec ses équipes (décision Romain). L'APERÇU
 *  serveur liste d'abord ce qui sera retiré (la confirmation dit tout) ; une équipe bloquante
 *  (créée à la main, en poule, dans des matchs) refuse la suppression avec le motif. */
async function supprimerClubInviteUI(bouton) {
  const nom = bouton.getAttribute('data-club');
  const message = document.getElementById('message-club-invite');
  bouton.disabled = true;
  try {
    // 1) Aperçu (ne supprime rien) : équipes supprimables + bloquantes, calculées par le serveur.
    const apercu = await ecrireAdmin('supprimerClubInvite', { club_nom: nom, apercu: 'oui' });
    const bloquees = (apercu && apercu.equipes_bloquees) || [];
    if (bloquees.length) {
      await dialogAlerter('Impossible de retirer « ' + nom + ' » :\n\n' +
        bloquees.map(function (b) { return '• ' + b.nom + ' (' + b.categorie + ') — ' + b.motif; }).join('\n') +
        '\n\nRetire d\'abord ces équipes (onglet Équipes) ou régénère le planning.');
      bouton.disabled = false;
      return;
    }
    const supprimables = (apercu && apercu.equipes_supprimables) || [];
    const detail = supprimables.length
      ? '\n\nSes ' + supprimables.length + ' équipe(s) seront aussi retirées de l\'onglet Équipes : ' +
        supprimables.map(function (e) { return e.nom + ' (' + e.categorie + ')'; }).join(', ') + '.'
      : '';
    if (!await dialogConfirmer('Retirer le club « ' + nom + ' » de la liste des invités ?' + detail,
                 { ok: 'Retirer', danger: true })) { bouton.disabled = false; return; }

    // 2) Suppression réelle (le serveur recalcule le plan : un planning généré entre-temps re-bloque).
    const res = await ecrireAdmin('supprimerClubInvite', { club_nom: nom });
    const retirees = (res && res.equipes_supprimees) || [];
    afficherMessage(message, '🗑️ « ' + nom + ' » retiré' +
      (retirees.length ? ' avec ' + retirees.length + ' équipe(s)' : '') + '.', 'ok');
    await chargerClubsInvites();
    // L'écran Équipes + le tableau de bord suivent immédiatement (best-effort).
    if (retirees.length && typeof rechargerEquipes === 'function') {
      try { await rechargerEquipes(); } catch (e) { /* best-effort */ }
    }
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    bouton.disabled = false;
  }
}

/** Enregistre les catégories engagées cochées (+ le prénom du contact) d'un club Accepté. */
async function enregistrerCatsClub(bouton) {
  const nom = bouton.getAttribute('data-club');
  const message = document.getElementById('message-club-invite');
  const panneau = bouton.closest('.club-panneau');
  if (!panneau) return;
  const cochees = Array.prototype.slice.call(panneau.querySelectorAll('.club-cat-case:checked'))
    .map(function (c) { return c.value; });
  const prenomInput = panneau.querySelector('.club-prenom-input');
  const prenom = prenomInput ? prenomInput.value.trim() : '';
  const cats = cochees.join(',');

  bouton.disabled = true;
  const texte = bouton.textContent;
  bouton.textContent = 'Enregistrement…';
  try {
    // UN SEUL appel : le serveur enregistre la sélection, SYNCHRONISE les équipes (ajouts +
    // retraits prudents), puis ne pose la marque « sélection enregistrée » (liseré VERT) qu'en
    // cas de succès complet. Un échec laisse donc la carte ORANGE — l'état affiché est prouvé,
    // jamais deviné (correctif de revue : deux appels séparés pouvaient laisser une carte verte
    // alors que les équipes n'étaient pas synchronisées).
    let res = await ecrireAdmin('enregistrerCategoriesEngagees', {
      club_nom: nom, categories_engagees: cats, club_contact_prenom: prenom
    });
    // REPLI (backend pas encore redéployé) : l'ancienne action ne synchronise pas les équipes
    // — on rappelle alors creerEquipesClub, comme avant, pour ne pas perdre la création.
    if (!res || res.equipes_creees === undefined) {
      try {
        const sync = await ecrireAdmin('creerEquipesClub', { club_nom: nom });
        res = Object.assign({}, res, sync);
      } catch (e2) {
        res = Object.assign({}, res, { alerte: 'équipes non synchronisées : ' + e2.message });
      }
    }

    const creees = (res && res.equipes_creees) || [];
    const supprimees = (res && res.equipes_supprimees) || [];
    const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, nom); });
    if (club) {
      club.categories_engagees = cats;
      club.club_contact_prenom = prenom;
      club.alerte_ecart = (res && res.alerte) || '';
      // Marque telle que RENVOYÉE par le serveur (aucun repli optimiste : un backend qui ne la
      // renvoie pas laisse la carte orange plutôt que d'annoncer un vert non prouvé).
      club.selection_enregistree = (res && res.selection_enregistree) || '';
    }

    let txtEquipes = '';
    if (creees.length) txtEquipes += ' ' + creees.length + ' équipe(s) créée(s) : '
      + creees.map(function (e) { return e.nom; }).join(', ') + '.';
    if (supprimees.length) txtEquipes += ' ' + supprimees.length + ' équipe(s) retirée(s) : '
      + supprimees.map(function (e) { return e.nom; }).join(', ') + '.';
    if (res && res.alerte) txtEquipes += ' ⚠️ ' + res.alerte;
    // Recharge la liste des équipes + le tableau de bord (l'étape « Équipes » de la barre
    // latérale se met à jour tout de suite, sans rafraîchir la page).
    if ((creees.length || supprimees.length) && typeof rechargerEquipes === 'function') {
      try { await rechargerEquipes(); } catch (e) { /* best-effort */ }
    }

    afficherClubsInvites(); // liseré vert + « Générer le dossier final » + badge d'alerte éventuel
    afficherMessage(message, (cochees.length
      ? '✅ « ' + nom + ' » — catégories engagées : ' + cats + '.'
      : '✅ « ' + nom + ' » — sélection enregistrée (aucune catégorie cochée).') + txtEquipes, 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    bouton.disabled = false;
    bouton.textContent = texte;
  }
}

/** Lien ABSOLU du dossier Phase 2 personnalisé d'un club (dossier-club.html?tournoi=…&club=…&token=…).
 *  Le JETON (club_token) est désormais OBLIGATOIRE : sans lui, le dossier n'affiche plus les
 *  contacts/logistique (protégés côté backend). On le transmet comme le lien de réponse Phase 1. */
function lienDossierClub(nom, token) {
  const url = new URL('dossier-club.html', window.location.href);
  const tn = (configCourante.global && configCourante.global.tournoi_nom) || '';
  if (tn) url.searchParams.set('tournoi', tn);
  url.searchParams.set('club', nom);
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

/**
 * « Générer le dossier final » : construit le lien personnalisé, puis
 *  - si le club a un email → ouvre l'aperçu email avant tout envoi ;
 *  - sinon → bascule en mode « Copier le lien » (pas d'aperçu, pas d'envoi auto).
 * ⚠️ La création des ÉQUIPES ne se fait PAS ici : elle a lieu au clic sur « Enregistrer la
 *    sélection » (voir enregistrerCatsClub).
 */
async function genererDossierFinal(nom) {
  const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;

  // Dossier DÉJÀ envoyé : le lien précédent a circulé — le président a pu le partager à ses
  // éducateurs. On PROPOSE de le renouveler (l'ancien meurt, copies partagées comprises), sans
  // jamais l'imposer : un clic pour relire l'aperçu ne doit pas couper un lien en service la
  // veille du tournoi. Les deux réponses ouvrent le dossier — seule l'adresse change.
  const renouvele = await renouvelerLienSiDemande(club);
  if (renouvele === null) return;   // renouvellement en échec : on n'ouvre rien

  // APERÇU / ENVOI du dossier. Le lien porte le jeton personnel du club (accès aux sections
  // contacts/logistique du dossier, protégées par jeton côté backend).
  const email = String(club.club_contact_email || '').trim();
  const lien = lienDossierClub(String(club.club_nom || ''), String(club.club_token || ''));
  if (email) { ouvrirApercuEmail(club, lien, renouvele); return; }

  // Pas d'email : mode manuel. On copie le lien (best-effort) et on l'affiche pour copie.
  try { if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(lien); } catch (e) { /* copie indispo */ }
  await dialogDemander(
    'Ce club n\'a pas d\'email de contact.\nCopie le lien du dossier ci-dessous et envoie-le manuellement :',
    lien, { ok: 'Fermer' });
}

/**
 * Renouvellement du lien d'un club dont le dossier a DÉJÀ été envoyé.
 *
 * Pourquoi ici : « Générer le dossier final » est le geste qui PRODUIT le lien — c'est donc là
 * qu'il doit pouvoir se renouveler, pas dans un bouton séparé qu'on oublierait. Mais le
 * renouvellement est destructeur et invisible : il coupe le lien du président ET toutes les
 * copies qu'il a partagées à ses éducateurs. On demande donc, et on n'impose pas.
 *
 * @return {Promise<?boolean>} true = lien RENOUVELÉ, false = lien conservé (on continue dans les
 *   deux cas), null = le renouvellement a échoué → l'appelant n'ouvre rien.
 */
async function renouvelerLienSiDemande(club) {
  const envoye = String(club.dossier_envoye || '').trim();
  if (!envoye) return false;                      // jamais envoyé : aucun lien en circulation

  const neuf = await dialogConfirmer(
    'Ce club a déjà reçu son dossier le ' + formaterDateFr(envoye) + '.\n\n' +
    'Veux-tu lui donner un NOUVEAU lien ?\n' +
    'L\'ancien cessera aussitôt de fonctionner — y compris les copies que le club a pu partager ' +
    'à ses éducateurs. À utiliser si le lien a circulé trop largement.\n\n' +
    '« Garder l\'actuel » réutilise le même lien : ceux qui l\'ont continuent d\'y accéder.',
    { ok: 'Nouveau lien', annuler: 'Garder l\'actuel' });
  if (!neuf) return false;

  try {
    const res = await ecrireAdmin('regenererJetonClub', { club_nom: String(club.club_nom || '') });
    if (res && res.club_token) club.club_token = res.club_token;
    await dialogAlerter('🔑 Nouveau lien créé pour ' + String(club.club_nom || '') + '.\n' +
      'L\'ancien ne fonctionne plus : il faut maintenant ENVOYER celui-ci au club.');
    return true;
  } catch (erreur) {
    // Échec du renouvellement : on n'ouvre PAS l'aperçu. Sinon l'organisateur enverrait
    // l'ancien lien en croyant avoir renouvelé.
    await dialogAlerter('⚠️ Impossible de créer un nouveau lien : ' + erreur.message +
      '\nRien n\'a changé, l\'ancien lien fonctionne toujours.');
    return null;
  }
}

/* --------------------------------------------------------------------------
   DOSSIER FINAL (Phase 2) — email HTML (MÊME charte que l'invitation).
   Envoyé à UN club « Accepté » au clic sur « Générer le dossier final ». Recense,
   en condensé, l'essentiel du dossier (catégories engagées, modalités, jour J,
   parking, encadrement, contact) et met en avant le LIEN vers le dossier complet
   personnalisé du club. Comme l'invitation : aperçu HTML live (objet + phrase
   d'introduction éditables) puis envoi HTML + version texte de repli.
   -------------------------------------------------------------------------- */

/** Objet par défaut de l'email de dossier final. */
function sujetDossier(g) {
  return 'Votre dossier complet — ' + (String(g.tournoi_nom || '').trim() || 'Le tournoi');
}

/** Phrase d'introduction par défaut (après la salutation), éditable. */
function introDossierDefaut(g, club) {
  const nom = String(g.tournoi_nom || '').trim() || 'notre tournoi';
  const nomClub = String((club && club.club_nom) || '').trim();
  return 'Nous avons bien reçu votre engagement pour le ' + nom + '. '
    + 'Voici le dossier complet de la journée' + (nomClub ? ' pour ' + nomClub : '')
    + ' : infos pratiques, programme, format sportif, sécurité et contact.';
}

/**
 * Corps HTML de l'email de dossier final (compatible clients mail : tableaux + styles en ligne).
 * Reprend en condensé les sections du dossier club et met en avant le LIEN vers le dossier
 * complet. `salutationHtml` est inséré TEL QUEL ; `imgSrc` = l'affiche (URL Drive en aperçu,
 * « cid:affiche » à l'envoi ; vide = pas d'image). Le dossier étant envoyé à UN club connu, la
 * salutation est déjà personnalisée (pas de jeton, contrairement à l'invitation groupée).
 */
function emailHtmlDossier(g, club, imgSrc, salutationHtml, intro, lienDossier) {
  const A = 'font-family:Arial,Helvetica,sans-serif;';
  const nom = echapper(String(g.tournoi_nom || '').trim() || 'Le tournoi');
  const date = String(g.tournoi_date || '').trim() ? echapper(formaterDateFr(g.tournoi_date)) : '';
  const lieu = echapper(String(g.tournoi_lieu || '').trim());
  const nomClub = echapper(String((club && club.club_nom) || '').trim());
  const lien = lienDossier ? echapper(lienDossier) : '';

  // Les catégories du club : les mêmes cartes que l'invitation, limitées à ses ENGAGÉES.
  const engagees = parseCatsEngagees(club && club.categories_engagees);
  const toutes = catsInvitationTriees();
  const cats = engagees.length
    ? toutes.filter(function (c) { return engagees.indexOf(String(c.categorie).trim().toUpperCase()) !== -1; })
    : toutes;

  /* --- 1) EN-TÊTE : blason, « votre dossier », titre, date · lieu, NOM DU CLUB --- */
  let entete = '<div style="text-align:center;">'
    + '<img src="' + echapper(urlBlasonEmail()) + '" alt="" width="72" '
    + 'style="display:block;width:72px;height:auto;margin:0 auto 10px;">'
    + '<p style="margin:0;' + A + 'text-transform:uppercase;letter-spacing:2px;font-size:12px;line-height:1.5;color:' + EMAIL_BLEU + ';">'
    + 'Votre dossier pour la journée</p>'
    + '<h1 style="margin:8px 0 2px;' + A + 'font-size:27px;line-height:1.1;color:' + EMAIL_NAVY + ';">' + nom + '</h1>'
    + ((date || lieu) ? '<p style="margin:4px 0 0;' + A + 'font-weight:bold;font-size:15px;color:' + EMAIL_NAVY + ';">'
      + [date, lieu].filter(Boolean).join('<span style="color:' + EMAIL_BLEU + ';"> · </span>') + '</p>' : '')
    + (nomClub ? '<p style="margin:12px 0 0;"><span style="display:inline-block;background:' + EMAIL_NAVY + ';'
      + 'color:#ffffff;border-radius:999px;padding:5px 16px;' + A + 'font-size:13px;text-transform:uppercase;'
      + 'letter-spacing:1px;">Dossier — ' + nomClub + '</span></p>' : '')
    + (engagees.length ? '<p style="margin:6px 0 0;' + A + 'font-size:13px;color:' + EMAIL_GRIS + ';">Engagé en '
      + engagees.map(echapper).join(' · ') + '</p>' : '')
    + '<div style="width:90px;height:4px;background:' + EMAIL_BLEU + ';margin:14px auto 0;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>'
    + '</div>';

  // Affiche RÉDUITE : le club l'a déjà vue en grand à l'invitation.
  const blocAffiche = imgSrc
    ? '<img src="' + echapper(imgSrc) + '" alt="Affiche — ' + nom + '" '
      + 'style="display:block;width:100%;max-width:190px;height:auto;border-radius:8px;margin:16px auto 0;">'
    : '';

  const bloc_salut = '<p style="margin:18px 0 4px;' + A + 'font-size:15px;color:' + EMAIL_TXT + ';">' + salutationHtml + '</p>'
    + (String(intro || '').trim() ? '<p style="margin:0;' + A + 'font-size:14px;color:' + EMAIL_TXT + ';text-align:justify;line-height:1.55;">' + nl2brEmail(intro) + '</p>' : '');

  /* --- Petites briques de section « libellé / valeur » --- */
  const ligneJ = function (lib, val) {
    if (!val) return '';
    return '<tr><td style="' + A + 'font-size:13px;color:' + EMAIL_GRIS + ';padding:3px 10px 3px 0;vertical-align:top;">' + echapper(lib) + '</td>'
      + '<td style="' + A + 'font-size:13px;color:' + EMAIL_TXT + ';font-weight:bold;padding:3px 0;">' + echapper(val) + '</td></tr>';
  };
  const bloc = function (titre, lignesHtml) {
    return lignesHtml ? (emailTitreSection(titre)
      + '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + lignesHtml + '</table>') : '';
  };

  /* --- 2) LE JOUR J : la journée en un coup d'œil (même frise que l'invitation) --- */
  const frise = friseJourneeEmail(g, cats, A);
  const blocJournee = frise ? (emailTitreSection('La journée en un coup d\'œil') + frise) : '';

  /* --- 3) OÙ, COMMENT Y ACCÉDER, QUI APPELER — l'ordre du dossier : le jour J d'abord --- */
  const blocPratique = bloc('Infos pratiques',
    ligneJ('Lieu', String(g.tournoi_lieu || '').trim())
    + ligneJ('Adresse', String(g.tournoi_adresse || '').trim())
    + ligneJ('Parking', String(g.logistique_parking || '').trim())
    + ligneJ('Buvette / restauration', String(g.logistique_buvette || '').trim())
    + ligneJ('Vestiaires', String(g.logistique_vestiaires || '').trim()));

  const parkingTxt = String(g.parking_texte || '').trim();
  const blocParking = parkingTxt
    ? emailTitreSection('Parking & accès')
      + '<p style="margin:0;' + A + 'font-size:13px;color:' + EMAIL_TXT + ';text-align:justify;line-height:1.55;">' + nl2brEmail(parkingTxt) + '</p>'
    : '';

  const contactParts = [];
  if (String(g.referent_nom || '').trim()) contactParts.push(String(g.referent_nom).trim());
  if (String(g.referent_tel || '').trim()) contactParts.push(telephoneLisibleAdmin(g.referent_tel));
  const secoursOui = estOui(g.securite_secours_oui);
  const secuIdentique = String(g.securite_referent_identique || 'oui').toLowerCase() !== 'non';
  const secuNom = secuIdentique ? String(g.referent_nom || '').trim() : String(g.securite_referent_nom || '').trim();
  const secuTel = secuIdentique ? String(g.referent_tel || '').trim() : String(g.securite_referent_tel || '').trim();
  const blocContact = bloc('Votre contact le jour J',
    ligneJ('Référent tournoi', contactParts.join(' · '))
    + ligneJ('Poste de secours', secoursOui
        ? ('Sur place' + (String(g.securite_secours_precisions || '').trim() ? ' — ' + String(g.securite_secours_precisions).trim() : ''))
        : '')
    + ligneJ('Référent sécurité', [secuNom, secuTel ? telephoneLisibleAdmin(secuTel) : ''].filter(Boolean).join(' — ')));

  /* --- 4) RAPPEL SPORTIF : les cartes par catégorie engagée + les repères FFR --- */
  const blocCats = cats.length
    ? emailTitreSection(engagees.length ? 'Rappel — vos catégories engagées' : 'Rappel — les catégories du tournoi')
      + cats.map(function (c) { return carteCategorieEmail(c, A); }).join('')
      + reperesFFREmail(cats, A)
    : '';

  /* --- 5) CE QU'ON ATTEND DU CLUB, PUIS L'ADMINISTRATIF --- */
  const blocEncadrement = bloc('Encadrement & assurance',
    ligneJ('Encadrement', String(g.encadrement_ratio || '').trim())
    + ligneJ('Diplômes exigés', String(g.encadrement_diplomes || '').trim())
    + ligneJ('Assurance', estOui(g.assurance_attestation_requise) ? 'Attestation d\'assurance du club à fournir' : '')
    + ligneJ('Licences', 'Licence FFR validée obligatoire pour tous les joueurs')
    + ligneJ('Feuille de match', 'FDM dématérialisée (FDM EDR) pour toutes les rencontres'));

  const tarifOui = estOui(g.tarif_engagement_oui);
  const blocModalites = bloc('Modalités d\'inscription',
    ligneJ('Confirmation attendue avant le', String(g.date_limite_confirmation || '').trim() ? formaterDateFr(g.date_limite_confirmation) : '')
    + ligneJ('Tarif d\'engagement', tarifOui ? String(g.tarif_engagement_montant || '').trim() : '')
    + ligneJ('Modalités de paiement', tarifOui ? String(g.tarif_engagement_modalites || '').trim() : ''));

  /* --- 6) LE LIEN — non plus pour LIRE le dossier (il est ci-dessus), mais pour ce qui BOUGE :
         les poules et le planning une fois arrêtés, et le partage aux éducateurs. --- */
  const blocLien = lien
    ? emailTitreSection('Votre espace en ligne')
      + '<p style="margin:0 0 10px;' + A + 'font-size:13px;color:' + EMAIL_TXT + ';line-height:1.55;">'
      + 'Tout l\'essentiel est dans cet email. Votre lien personnel, lui, reste vivant : il affichera '
      + '<strong>vos poules et votre planning</strong> dès qu\'ils seront arrêtés, et il vous permet de '
      + '<strong>partager le dossier à vos éducateurs</strong> en un geste.</p>'
      + '<p style="margin:0;text-align:center;"><a href="' + lien + '" '
      + 'style="display:inline-block;background:' + EMAIL_BLEU + ';color:#ffffff;text-decoration:none;'
      + 'border-radius:999px;padding:13px 28px;' + A + 'font-size:15px;font-weight:bold;">Ouvrir mon espace</a></p>'
    : '';

  const pied = barreLiensEmail(A)
    + '<p style="margin:14px 0 0;padding-top:12px;border-top:1px solid ' + EMAIL_FILET + ';' + A + 'font-size:12px;color:' + EMAIL_GRIS + ';text-align:center;">'
    + 'L\'organisation du tournoi'
    + (lien ? '<br><a href="' + lien + '" style="color:' + EMAIL_BLEU + ';">Voir la version en ligne</a>' : '')
    + '</p>';

  // ORDRE DU DOSSIER : le jour J d'abord (journée, accès, contact), le sportif en rappel,
  // l'administratif ensuite, et le lien à la fin — il ne sert plus à LIRE, mais à SUIVRE.
  return '<div style="background:#eef2f7;padding:16px;' + A + '">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-collapse:collapse;">'
    + '<tr><td style="padding:22px 24px;">'
    + '<div style="border-bottom:3px solid ' + EMAIL_NAVY + ';padding-bottom:14px;">' + entete + '</div>'
    + blocAffiche + bloc_salut
    + blocJournee + blocPratique + blocParking + blocContact
    + blocCats + blocEncadrement + blocModalites + blocLien + pied
    + '</td></tr></table></div>';
}

/** Version TEXTE brut de l'email de dossier final (repli anti-spam / clients sans HTML).
 *  Même contenu, même ordre : le jour J, le rappel sportif, l'administratif, puis le lien. */
function emailTexteDossier(g, club, salutationTexte, intro, lienDossier) {
  const L = [];
  const nom = String(g.tournoi_nom || '').trim() || 'Le tournoi';
  const engagees = parseCatsEngagees(club && club.categories_engagees);
  const toutes = catsInvitationTriees();
  const cats = engagees.length
    ? toutes.filter(function (c) { return engagees.indexOf(String(c.categorie).trim().toUpperCase()) !== -1; })
    : toutes;

  L.push(nom.toUpperCase() + (String(g.tournoi_date || '').trim() ? ' — ' + formaterDateFr(g.tournoi_date) : ''));
  if (String((club && club.club_nom) || '').trim()) {
    L.push('Dossier de ' + String(club.club_nom).trim() +
      (engagees.length ? ' — engagé en ' + engagees.join(', ') : ''));
  }
  L.push('');
  L.push(salutationTexte);
  L.push('');
  if (String(intro || '').trim()) { L.push(String(intro).trim()); L.push(''); }

  const etapes = etapesJourneeEmail(g, cats);
  if (etapes.length) {
    L.push('LA JOURNÉE');
    etapes.forEach(function (e) { L.push('- ' + e.h + ' ' + e.t + (e.n ? ' (' + e.n + ')' : '')); });
    L.push('');
  }

  const prat = [];
  if (String(g.tournoi_lieu || '').trim()) prat.push('Lieu : ' + String(g.tournoi_lieu).trim());
  if (String(g.tournoi_adresse || '').trim()) prat.push('Adresse : ' + String(g.tournoi_adresse).trim());
  if (String(g.logistique_parking || '').trim()) prat.push('Parking : ' + String(g.logistique_parking).trim());
  if (String(g.logistique_buvette || '').trim()) prat.push('Buvette : ' + String(g.logistique_buvette).trim());
  if (String(g.logistique_vestiaires || '').trim()) prat.push('Vestiaires : ' + String(g.logistique_vestiaires).trim());
  if (String(g.parking_texte || '').trim()) prat.push('Accès : ' + String(g.parking_texte).trim());
  if (prat.length) { L.push('INFOS PRATIQUES'); prat.forEach(function (x) { L.push('- ' + x); }); L.push(''); }

  const contact = [];
  if (String(g.referent_nom || '').trim()) contact.push(String(g.referent_nom).trim());
  if (String(g.referent_tel || '').trim()) contact.push(telephoneLisibleAdmin(g.referent_tel));
  if (contact.length) { L.push('VOTRE CONTACT LE JOUR J : ' + contact.join(' · ')); }
  if (estOui(g.securite_secours_oui)) {
    L.push('Poste de secours sur place' +
      (String(g.securite_secours_precisions || '').trim() ? ' — ' + String(g.securite_secours_precisions).trim() : ''));
  }
  if (contact.length || estOui(g.securite_secours_oui)) L.push('');

  if (cats.length) {
    L.push(engagees.length ? 'VOS CATÉGORIES ENGAGÉES' : 'LES CATÉGORIES DU TOURNOI');
    cats.forEach(function (c) {
      const bouts = [formeJeuEmailTxt(c), tempsJeuEmailTxt(c), effectifEmailTxt(c)].filter(Boolean);
      L.push('- ' + String(c.categorie).trim() + (bouts.length ? ' : ' + bouts.join(' · ') : ''));
    });
    L.push('');
  }

  const enc = [];
  if (String(g.encadrement_ratio || '').trim()) enc.push('Encadrement : ' + String(g.encadrement_ratio).trim());
  if (String(g.encadrement_diplomes || '').trim()) enc.push('Diplômes exigés : ' + String(g.encadrement_diplomes).trim());
  if (estOui(g.assurance_attestation_requise)) enc.push('Attestation d\'assurance du club à fournir');
  enc.push('Licence FFR validée obligatoire pour tous les joueurs');
  enc.push('Feuille de match dématérialisée (FDM EDR) pour toutes les rencontres');
  L.push('ENCADREMENT & ASSURANCE');
  enc.forEach(function (x) { L.push('- ' + x); });
  L.push('');

  const mod = [];
  if (String(g.date_limite_confirmation || '').trim()) mod.push('Confirmation attendue avant le ' + formaterDateFr(g.date_limite_confirmation));
  if (estOui(g.tarif_engagement_oui) && String(g.tarif_engagement_montant || '').trim()) mod.push('Tarif d\'engagement : ' + String(g.tarif_engagement_montant).trim());
  if (estOui(g.tarif_engagement_oui) && String(g.tarif_engagement_modalites || '').trim()) mod.push('Modalités de paiement : ' + String(g.tarif_engagement_modalites).trim());
  if (mod.length) { L.push('MODALITÉS'); mod.forEach(function (x) { L.push('- ' + x); }); L.push(''); }

  if (lienDossier) {
    L.push('VOTRE ESPACE EN LIGNE');
    L.push('Tout l\'essentiel est dans ce message. Votre lien personnel affichera vos poules et');
    L.push('votre planning dès qu\'ils seront arrêtés, et permet de partager le dossier à vos éducateurs :');
    L.push(lienDossier);
    L.push('');
  }
  L.push('À très bientôt,');
  L.push('L\'organisation du tournoi');
  return L.join('\n');
}

/**
 * Fenêtre d'APERÇU de l'email de dossier final (Phase 2), AVANT tout envoi — MÊME principe que
 * l'aperçu de l'invitation (rendu HTML réel dans une iframe) :
 *  - Destinataire (lecture seule) = email de contact du club ;
 *  - Objet pré-rempli, modifiable ;
 *  - Phrase d'introduction pré-remplie, modifiable (le reste des sections est généré des infos) ;
 *  - Aperçu HTML LIVE qui suit la frappe.
 * « Envoyer » déclenche l'envoi réel HTML (envoyerDossierEmail avec html_modele + texte_modele) ;
 * dossier_envoye n'est posé qu'en cas de succès. « Annuler » ferme sans rien envoyer.
 */
function ouvrirApercuEmail(club, lien, lienRenouvele) {
  const nom = String(club.club_nom || '');
  const email = String(club.club_contact_email || '');
  const prenom = String(club.club_contact_prenom || '').trim();
  const g = configCourante.global || {};
  const salutHtml = prenom ? 'Bonjour ' + echapper(prenom) + ',' : 'Bonjour,';
  const salutTexte = prenom ? 'Bonjour ' + prenom + ',' : 'Bonjour,';
  const sujetDefaut = sujetDossier(g);
  const introDefaut = introDossierDefaut(g, club);
  // Affiche : URL Drive pour l'aperçu, « cid:affiche » (image inline) pour l'envoi.
  const imgApercu = String(g.tournoi_affiche_id || '').trim() ? urlAffiche(g.tournoi_affiche_id, 800) : '';
  const imgModele = String(g.tournoi_affiche_id || '').trim() ? 'cid:affiche' : '';

  const overlay = document.createElement('div');
  overlay.className = 'eml-overlay';
  overlay.innerHTML =
    '<div class="eml-carte eml-carte-large" role="dialog" aria-modal="true">' +
      '<h2 class="eml-titre">Aperçu de l\'email — ' + echapper(nom) + '</h2>' +
      '<p class="eml-msg" id="eml-msg"></p>' +
      '<label class="eml-champ">Destinataire' +
        '<input type="email" id="eml-dest" value="' + echapper(email) + '" readonly></label>' +
      '<label class="eml-champ">Objet' +
        '<input type="text" id="eml-sujet" value="' + echapper(sujetDefaut) + '"></label>' +
      '<label class="eml-champ">Phrase d\'introduction' +
        '<textarea id="eml-intro" rows="3">' + echapper(introDefaut) + '</textarea></label>' +
      '<p class="eml-apercu-label">Les sections ci-dessous (modalités, jour J, encadrement, contact) ' +
        'sont générées à partir des infos du tournoi. Aperçu du <strong>rendu réel</strong> :</p>' +
      '<iframe id="eml-apercu" class="eml-iframe" title="Aperçu du rendu de l\'email"></iframe>' +
      '<div class="eml-actions">' +
        '<button type="button" class="bouton bouton-doux" id="eml-annuler">Annuler</button>' +
        '<button type="button" class="bouton" id="eml-envoyer">' + svgIcone('email') + 'Envoyer</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  const iframe = overlay.querySelector('#eml-apercu');
  const champSujet = overlay.querySelector('#eml-sujet');
  const champIntro = overlay.querySelector('#eml-intro');
  const rafraichir = function () {
    iframe.srcdoc = emailHtmlDossier(g, club, imgApercu, salutHtml, champIntro.value, lien);
  };
  rafraichir();
  champIntro.addEventListener('input', rafraichir);

  // Fermer SANS avoir envoyé, alors qu'on vient de renouveler le lien : l'ancien est déjà mort
  // (le jeton a changé côté Sheet) et le club n'a rien reçu. Personne ne le verrait — on le dit.
  let envoye = false;
  const fermer = function () {
    overlay.remove();
    if (lienRenouvele && !envoye) {
      dialogAlerter('⚠️ Le lien de ' + String(club.club_nom || '') + ' a été renouvelé, mais ' +
        'RIEN n\'a été envoyé.\nSon ancien lien ne fonctionne plus : relance « Générer le dossier ' +
        'final » et clique « Envoyer » pour lui transmettre le nouveau.');
    }
  };
  overlay.addEventListener('click', function (e) { if (e.target === overlay) fermer(); });
  overlay.querySelector('#eml-annuler').addEventListener('click', fermer);

  overlay.querySelector('#eml-envoyer').addEventListener('click', async function () {
    const boutonEnvoi = overlay.querySelector('#eml-envoyer');
    const msg = overlay.querySelector('#eml-msg');
    const sujet = champSujet.value.trim();
    const intro = champIntro.value;
    msg.className = 'eml-msg';
    if (!sujet) { msg.className = 'eml-msg ko'; msg.textContent = '⚠️ L\'objet est vide.'; return; }

    boutonEnvoi.disabled = true;
    const texte = boutonEnvoi.textContent;
    boutonEnvoi.textContent = 'Envoi…';
    msg.className = 'eml-msg';
    msg.textContent = 'Envoi en cours…';
    try {
      const res = await ecrireAdmin('envoyerDossierEmail', {
        club_nom: nom, sujet: sujet,
        html_modele: emailHtmlDossier(g, club, imgModele, salutHtml, intro, lien),
        texte_modele: emailTexteDossier(g, club, salutTexte, intro, lien)
      });
      // Succès : dossier_envoye posé côté serveur (uniquement en cas de succès).
      envoye = true;   // le nouveau lien est parti : plus d'avertissement à la fermeture
      const c = clubsInvitesCourants.find(function (x) { return memeTexteSouple(x.club_nom, nom); });
      if (c && res && res.dossier_envoye) c.dossier_envoye = res.dossier_envoye;
      afficherClubsInvites();
      afficherMessage(document.getElementById('message-club-invite'),
        '✅ Dossier envoyé à ' + email + '.', 'ok');
      fermer();
    } catch (erreur) {
      // Échec : dossier_envoye NON posé → on garde la fenêtre pour relancer.
      msg.className = 'eml-msg ko';
      msg.textContent = '⚠️ ' + erreur.message;
      boutonEnvoi.disabled = false;
      boutonEnvoi.textContent = texte;
    }
  });
}
