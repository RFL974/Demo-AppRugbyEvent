/**
 * ============================================================================
 *  DOSSIER CLUB (Phase 2) — le dossier envoyé au club APRÈS son acceptation
 * ============================================================================
 *  Construit la page personnelle d'un club (?club=…&token=…) à partir des données
 *  du tournoi (Config Zone A + Zone B), via le MÊME backend que les autres pages.
 *
 *  MÊME DOCUMENT QUE L'INVITATION, À UN AUTRE MOMENT. Le dossier reprend, dans le
 *  même ordre, les blocs de la page d'invitation (`commun-dossier.js`) :
 *    1. blason centré, affiche en héros, descriptif complet ;
 *    2. l'accueil personnalisé du club ;
 *    3. la journée en un coup d'œil (frise horaire) ;
 *    4. UNE CARTE PAR CATÉGORIE — limitée aux catégories ENGAGÉES par le club ;
 *  puis ce qui n'existe qu'ici, une fois le club engagé : infos pratiques,
 *  modalités, parking, encadrement, suivi & QR, sécurité, contact, actions.
 *
 *  Règle d'or : toute section dont TOUS les champs sont vides est masquée
 *  entièrement (titre compris). Jamais de « non communiqué ».
 *
 *  PAGE VIVANTE : le club garde son lien ; à chaque ouverture la page se
 *  reconstruit avec les données du moment. Ce qui n'existe pas encore au moment
 *  de l'envoi (planning, poules…) apparaîtra tout seul, sans rien renvoyer.
 *
 *  L'export PDF passe par l'impression du navigateur (CSS print dans
 *  css/dossier.css) — aucune librairie PDF. Le QR code est généré en local
 *  par js/vendor/qrcode.js (MIT) — aucun appel externe.
 * ============================================================================
 */

/* Les blocs de page communs aux deux documents (heroDocument, friseJournee,
   cartesCategories, piedDocument), les résumés sportifs (resumeMiTemps,
   resumeEffectif, resumeReglement, tempsDeJeuDe…) et les libellés de formats
   (DOSSIER_FORMATS…) vivent dans commun-dossier.js / commun.js. */

// Le déclencheur d'impression [#bouton-imprimer] et revelerOutilsAdmin() sont désormais
// dans commun-dossier.js (partagés avec invitation-club.html).
document.addEventListener('DOMContentLoaded', initDossier);

async function initDossier() {
  const zone = document.getElementById('dossier');
  revelerOutilsAdmin();

  // Le dossier (contacts jour J, logistique, secours, tarifs) est PROTÉGÉ PAR JETON : chaque club
  // reçoit un lien personnel (?club=…&token=…). Toute la config du dossier vient de getConfigClub
  // (vue `club`, filtrée + jeton) ; getClubDossier fournit le prénom pour l'accueil personnalisé.
  const params = new URLSearchParams(window.location.search);
  const clubParam = txt(params.get('club'));
  // Le jeton vient de l'adresse OU de l'onglet : il en est retiré après le chargement
  // (masquerJetonDeLUrl ci-dessous) pour ne plus s'imprimer en pied de feuille.
  const token = jetonCourant('dossier:' + clubParam, params);

  // Lien incomplet (ancien lien sans jeton, ou accès direct) → message courtois, aucune donnée.
  if (!clubParam || !token) { await afficherLienDossierExpire(zone); return; }

  try {
    // getAll est l'instantané PUBLIC (équipes, poules, matchs) : c'est lui qui porte le planning.
    // Il n'expose aucune donnée personnelle et sert déjà la page des scores — on ne crée donc pas
    // un deuxième chemin de lecture pour la même information. Son échec n'est PAS bloquant : sans
    // lui, le dossier s'affiche comme avant, sans les sections « jour J ».
    const [cfgClub, r, data] = await Promise.all([
      apiGet('getConfigClub', { club: clubParam, token: token }),
      apiGet('getClubDossier', { club: clubParam, token: token }),
      apiGet('getAll').catch(function () { return null; })
    ]);
    const config = (cfgClub && cfgClub.config) || { global: {}, categories: [] };
    const club = (r && r.club) || null;
    const ctx = {
      equipes:        (r && r.equipes) || [],       // MES équipes (backend, protégé par jeton)
      equipesTournoi: (data && data.equipes) || [], // toutes les équipes : pour nommer l'adversaire
      matchs:         (data && data.matchs) || [],
      gelees:         !!(r && r.reponses_gelees),
      contactEmail:   (r && r.contact_email) || '',
      club:           clubParam,
      token:          token,
      // VERROU : poules et matchs ne s'affichent que si l'organisateur les a publiés. Tout ce qui
      // n'est pas un « oui » explicite vaut non — témoin absent (tournoi d'avant la fonction),
      // vide, ou config partielle. Le défaut est FERMÉ, comme les listes blanches du backend.
      planningVisible: String((config.global || {}).planning_visible_clubs || '').toLowerCase() === 'oui',
      // L'instantané public complet : il porte AUSSI les partenaires et leurs réglages
      // d'affichage. On le garde tel quel plutôt que d'en extraire des morceaux — le
      // bandeau partenaires a besoin de `config.global` autant que de `sponsors`.
      donneesPubliques: data
    };
    zone.innerHTML = construireDossier(config.global || {}, config.categories || [], club, ctx);
    // Le bandeau partenaires du dossier compte comme n'importe quel emplacement : son temps
    // d'exposition et ses clics rejoignent la fiche de visibilité du partenaire.
    if (typeof sponsorsBrancherMesure === 'function' && zone.querySelector('[data-sponsor]')) {
      sponsorsBrancherMesure(zone);
      sponsorsArmerEnvoi();
    }
    dessinerQR();      // le QR se dessine après coup (il vise un conteneur du HTML rendu)
    brancherPartage(); // « Partager le dossier à mes équipes » (une seule fois)
    // Données en main : le jeton n'a plus rien à faire dans l'adresse (ni à l'écran, ni au
    // pied de page imprimé). L'onglet le garde, un rechargement fonctionne toujours.
    masquerJetonDeLUrl('dossier:' + clubParam, token);
  } catch (erreur) {
    // Jeton invalide/expiré (le backend renvoie « Lien invalide ou expiré. ») → message courtois.
    await afficherLienDossierExpire(zone);
  }
}

/**
 * Message affiché quand le lien du dossier est absent, incomplet ou expiré. Donne une porte de
 * sortie par EMAIL (contact_reponse_email, lu dans la vue invitation PUBLIQUE) : un club bloqué
 * le samedi matin doit pouvoir joindre l'organisateur. JAMAIS de téléphone — cette page s'affiche
 * sans jeton, donc elle est publique.
 */
async function afficherLienDossierExpire(zone) {
  let email = '';
  try {
    const cfg = await apiGet('getConfig'); // vue invitation (publique) : contient contact_reponse_email
    email = txt(cfg && cfg.global && cfg.global.contact_reponse_email);
  } catch (e) { /* contact indisponible : on reste sur un message générique */ }
  const sortie = email
    ? 'Pour recevoir votre lien personnel, écrivez à <a href="mailto:' + echapper(email) + '">'
      + echapper(email) + '</a>.'
    : 'Contactez l\'organisateur du tournoi pour recevoir votre lien personnel.';
  zone.innerHTML =
    '<div class="message-chargement">Ce lien de dossier n\'est plus valide ou incomplet.<br>'
    + 'Chaque club reçoit un lien personnel unique.<br>' + sortie + '</div>';
}

/**
 * Catégories engagées d'un club → tableau de noms normalisés (MAJUSCULES sans espaces
 * superflus). Accepte le format texte « U8,U10 » ou un tableau JSON ["U8","U10"].
 * Renvoie [] si rien n'est renseigné (le dossier reste alors non filtré).
 */
function categoriesEngageesListe(club) {
  return parseCategoriesEngagees(club ? club.categories_engagees : ''); // parseur commun (commun-dossier.js)
}

/**
 * Paragraphe d'accueil personnalisé (inséré avant la Présentation) quand le club est connu.
 * « Bonjour {prénom}, … {nom du tournoi} … les joueuses et joueurs de {nom du club} … ».
 * Si le prénom manque, on garde « Bonjour, » (jamais de « Bonjour undefined »).
 */
function accueilPersonnalise(g, club) {
  if (!club) return '';
  const prenom = txt(club.club_contact_prenom);
  const nomClub = txt(club.club_nom);
  const nomTournoi = txt(g.tournoi_nom) || 'Le tournoi';
  const bonjour = prenom ? 'Bonjour ' + echapper(prenom) + ',' : 'Bonjour,';
  return '<p class="d-accueil">' + bonjour +
    ' nous avons bien reçu votre retour concernant votre souhait de participer au '
    + echapper(nomTournoi) + '. Nous sommes heureux de compter parmi nous les joueuses et joueurs'
    + (nomClub ? ' de ' + echapper(nomClub) : '')
    + '. Voici les informations détaillées de cette journée.</p>';
}

/* Les petits helpers de mise en forme (txt, dateLongueFr, heurePlusMinutes,
   heureFinCommuniquee, telephoneLisible, jsonSur, urlAffiche, ligne, section, listeOuVide,
   catPresente…) sont désormais dans commun-dossier.js (partagés avec invitation/reponse). */

/* --------------------------------------------------------------------------
   LOGIQUES DE RÉSUMÉ (terrains, sécurité)
   -------------------------------------------------------------------------- */

/**
 * Transforme les JSON de terrains en UNE phrase lisible — jamais de JSON brut.
 *  - Source principale : `repartition_grands_terrains` {"Rugby 1":["1","2"],…}
 *    → nb de terrains de jeu, nb de grands terrains, complets vs réduits
 *    (un grand terrain à 1 seul terrain de jeu = joué en terrain complet).
 *  - Repli : les numéros de la colonne `terrains` des catégories présentes.
 *  Renvoie '' si on ne sait rien (la ligne est alors masquée).
 */
function resumeTerrains(global, categories) {
  const repartition = jsonSur(global.repartition_grands_terrains, {});
  const grands = Object.keys(repartition).filter(function (k) {
    return Array.isArray(repartition[k]) && repartition[k].length > 0;
  });
  let nbJeu = 0, complets = 0;
  grands.forEach(function (k) {
    nbJeu += repartition[k].length;
    if (repartition[k].length === 1) complets++;
  });

  if (nbJeu > 0) {
    const reduits = nbJeu - complets;
    let phrase = nbJeu + ' terrain' + (nbJeu > 1 ? 's' : '') + ' de jeu';
    const details = [];
    if (complets > 0) details.push(complets + ' grand' + (complets > 1 ? 's' : '') + ' complet' + (complets > 1 ? 's' : ''));
    if (reduits > 0) details.push(reduits + ' réduit' + (reduits > 1 ? 's' : ''));
    if (details.length > 1) phrase += ' : ' + details.join(', ');
    phrase += ', sur ' + grands.length + ' grand' + (grands.length > 1 ? 's' : '') + ' terrain' + (grands.length > 1 ? 's' : '')
            + ' (' + grands.join(', ') + ')';
    return phrase;
  }

  // Repli : numéros de terrains déclarés par catégorie (avant toute répartition appliquée).
  const numeros = new Set();
  (categories || []).filter(catPresente).forEach(function (c) {
    txt(c.terrains).split(',').forEach(function (n) { if (n.trim()) numeros.add(n.trim()); });
  });
  if (numeros.size > 0) return numeros.size + ' terrain' + (numeros.size > 1 ? 's' : '') + ' de jeu';
  return '';
}

/* resumeMiTemps, resumeEffectif, resumeReglement, resumeApresMidi et tempsDeJeuDe
   sont désormais dans commun-dossier.js (partagés avec invitation.js). */

/**
 * Résout le référent SÉCURITÉ : identique au référent tournoi (défaut, y compris
 * champ vide) → on réutilise referent_nom / referent_tel ; sinon les champs dédiés.
 * Renvoie { nom, tel } (chaînes éventuellement vides).
 */
function referentSecurite(g) {
  const identique = String(txt(g.securite_referent_identique) || 'oui').toLowerCase() !== 'non';
  return identique
    ? { nom: txt(g.referent_nom), tel: txt(g.referent_tel) }
    : { nom: txt(g.securite_referent_nom), tel: txt(g.securite_referent_tel) };
}

/* --------------------------------------------------------------------------
   LIENS UTILES (.ics, itinéraires, page de suivi)
   -------------------------------------------------------------------------- */

/** URL de la page publique de suivi : paramètre `url_tournoi_public` si présent
 *  dans Config, sinon la page tournoi.html qui vit à côté de ce dossier.
 *
 *  ⭐ La RÈGLE elle-même vit désormais dans `commun.js` (`urlPagePublique`), parce que
 *  l'administration présente EXACTEMENT la même adresse à l'organisateur (carte
 *  « Publier le tournoi »). Ce dossier reste le premier usage, et le plus ancien :
 *  c'est cette adresse-là que les clubs reçoivent, en lien et en QR code. Le
 *  comportement est INCHANGÉ — seule l'adresse de la règle a bougé. */
function urlSuiviPublic(g) {
  return urlPagePublique(g);
}

/** Adresse à utiliser pour l'itinéraire et l'agenda (repli : lieu). */
function adresseItineraire(g) {
  return txt(g.tournoi_adresse) || txt(g.tournoi_lieu);
}

/** Échappe une valeur texte ICS (RFC 5545 : virgules, points-virgules, retours ligne). */
function icsEchapper(v) {
  return String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** « 2026-11-11 » + « 07:45 » → « 20261111T074500 » (heure locale flottante). */
function icsDateHeure(dateISO, hhmm) {
  const d = txt(dateISO).replace(/-/g, '');
  const h = txt(hhmm).replace(':', '');
  return (/^\d{8}$/.test(d) && /^\d{4}$/.test(h)) ? d + 'T' + h + '00' : '';
}

/**
 * Construit le contenu du fichier .ics : UN SEUL événement, de l'heure de RDV à
 * l'heure de fin annoncée aux clubs (manuelle, sinon fin du dernier match + 1 h 15 ;
 * replis : heure_debut au départ, RDV + 8 h à l'arrivée). Renvoie null si la date
 * ou l'heure de départ manquent.
 */
function construireICS(g) {
  const date = txt(g.tournoi_date);
  const debut = txt(g.heure_rdv) || txt(g.heure_debut);
  if (!date || !debut) return null;

  let fin = heureFinCommuniquee(g);
  if (!fin) fin = heurePlusMinutes(debut, 8 * 60);
  const dtStart = icsDateHeure(date, debut);
  const dtEnd = icsDateHeure(date, fin);
  if (!dtStart || !dtEnd) return null;

  // DESCRIPTION = résumé du programme (uniquement les horaires renseignés).
  const prog = [];
  if (txt(g.heure_rdv)) prog.push('RDV des équipes : ' + txt(g.heure_rdv));
  if (txt(g.heure_debut)) prog.push('Coup d\'envoi : ' + txt(g.heure_debut));
  if (txt(g.pause_dejeuner_debut)) {
    prog.push('Pause déjeuner : ' + txt(g.pause_dejeuner_debut)
      + (txt(g.pause_dejeuner_duree_min) ? ' (' + txt(g.pause_dejeuner_duree_min) + ' min)' : ''));
  }
  if (heureFinCommuniquee(g)) {
    prog.push('Fin de l\'événement (après la remise des trophées) : ' + heureFinCommuniquee(g));
  }

  const horodatage = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return ['BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Tournoi//Calendrier//FR',
          'BEGIN:VEVENT',
          'UID:tournoi-' + date + '@tournoi.local',
          'DTSTAMP:' + horodatage,
          'DTSTART:' + dtStart,
          'DTEND:' + dtEnd,
          'SUMMARY:' + icsEchapper(txt(g.tournoi_nom) || 'Le tournoi'),
          'LOCATION:' + icsEchapper(adresseItineraire(g)),
          'DESCRIPTION:' + icsEchapper(prog.join(' · ')),
          'END:VEVENT',
          'END:VCALENDAR'].join('\r\n');
}

/** Déclenche le téléchargement du .ics (généré côté client, aucune dépendance serveur). */
function telechargerICS(g) {
  const contenu = construireICS(g);
  if (!contenu) return;
  const blob = new Blob([contenu], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tournoi-' + (txt(g.tournoi_date) || 'agenda') + '.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* --------------------------------------------------------------------------
   CONSTRUCTION DU DOSSIER (le HTML complet, section par section)
   -------------------------------------------------------------------------- */

function construireDossier(g, categories, club, ctx) {
  const cats = (categories || []).filter(catPresente);
  ctx = ctx || {};   // sans contexte (aperçu, ancien appel) : les sections « jour J » se masquent

  // Filtrage Phase 2 : si le club a des catégories engagées, les CARTES ne montrent que
  // celles-là (les autres sections restent inchangées). Repli sur toutes les catégories si la
  // sélection ne correspond à aucune (donnée incohérente) — jamais de section vide. Sans club
  // / sans sélection : `catsFormat` = toutes les catégories.
  const engagees = categoriesEngageesListe(club);
  let catsFormat = cats;
  let filtreApplique = false;
  if (engagees.length) {
    const filtre = cats.filter(function (c) {
      return engagees.indexOf(txt(c.categorie).toUpperCase()) !== -1;
    });
    if (filtre.length) { catsFormat = filtre; filtreApplique = true; }
  }

  // L'ORDRE DIT LE RÔLE DU DOCUMENT. L'invitation VEND : affiche en héros, cadre sportif haut,
  // « votre réponse » en bas. Le dossier ORGANISE : le club l'ouvre pour savoir où se garer, à
  // quelle heure être là et qui appeler — donc le JOUR J d'abord, et le cadre sportif (qu'il a
  // déjà lu à l'invitation, deux mois plus tôt) en RAPPEL plus bas. Même charte, autre rôle.
  return [
    enteteDossier(g, club, filtreApplique ? catsFormat : []),   //  1. qui reçoit, quoi, quand — et pour QUI
    bandeauPartenaires(ctx),                                    //  1 bis. qui soutient le tournoi
    accueilPersonnalise(g, club),                               //  2. le mot d'accueil
    barrePartage(g, ctx),                                       //  2 bis. partager à ses éducateurs
    sectionJournee(g, catsFormat),                              //  3. LE JOUR J : la journée en un coup d'œil
    sectionMesEquipes(ctx),                                     //  3 bis. … avec QUI (équipes, poules)
    sectionMonPlanning(ctx, catsFormat),                        //  3 ter. … et QUAND (matchs du club)
    sectionInfosPratiques(g),                                   //  4.   … où, et ce qu'on y trouve
    sectionParking(g),                                          //  5.   … comment y accéder
    sectionContact(g),                                          //  6.   … qui appeler (remonté : c'était en bas)
    sectionSecurite(g),                                         //  7.   … et en cas de pépin
    sectionSuivi(g, cats),                                      //  8.   … suivre les scores sur place
    sectionCategories(catsFormat, filtreApplique),              //  9. RAPPEL SPORTIF (déjà lu à l'invitation)
    sectionEncadrement(g),                                      // 10. ce qu'on attend du club
    sectionMonEngagement(g, club, ctx),                         // 10 bis. ce que le club a déclaré
    sectionModalites(g),                                        // 11. l'administratif
    bandeauActions(g),                                          // 12. agenda, itinéraires, liens
    mentionGeneration(),                                        // 13. daté (le PDF fige, pas la page)
    piedDocument(g, false)                                      // 14. pied (sans liens : le bandeau les porte)
  ].join('');
}

/**
 * 1) EN-TÊTE : le même bloc vitrine que l'invitation, à quatre nuances près — le surtitre dit
 * « votre dossier », l'affiche est RÉDUITE (le club l'a déjà vue en grand), le descriptif du
 * tournoi n'est PAS répété (il a été lu à l'invitation) et le nom du club s'affiche sous la
 * date : ce document est le sien, il doit le voir en une seconde.
 * `catsEngagees` (vide si on ne sait pas) ajoute le rappel de son engagement.
 */
/**
 * Bandeau des partenaires (emplacement F) — permanent, imprimé avec le dossier.
 *
 * DEUX VERROUS, et ils comptent :
 *  • l'interrupteur général `sponsors_actifs` doit être sur « oui » — le même qui commande
 *    la page des scores : on n'allume pas les partenaires à moitié ;
 *  • seuls les partenaires COCHÉS pour le dossier apparaissent. Un sponsor de la page des
 *    scores n'atterrit pas ici sans décision explicite.
 *
 * Et une absence assumée : JAMAIS de message plein écran sur le dossier. Un club l'ouvre
 * pour trouver un horaire, un parking, un contact — il ne doit pas attendre.
 *
 * Les données viennent de `getAll`, déjà chargé pour le planning : aucun appel réseau de
 * plus. Si `getAll` a échoué (il n'est pas bloquant), le bandeau se tait, comme le reste
 * des sections « jour J ».
 */
function bandeauPartenaires(ctx) {
  const donnees = (ctx && ctx.donneesPubliques) || null;
  if (!donnees) return '';
  const reglages = sponsorsReglages(donnees.config || {});
  if (!reglages.actifs) return '';
  return sponsorsRendreDossier(sponsorsListe(donnees, reglages));
}

function enteteDossier(g, club, catsEngagees) {
  const nomClub = txt(club && club.club_nom);
  const noms = (catsEngagees || []).map(function (c) { return txt(c.categorie); }).filter(Boolean);
  let mention = '';
  if (nomClub) {
    // « Dossier — {club} » et pas « Dossier de {club} » : l'élision dépend du nom du club
    // (« de l'AS Massy », « du PUC », « de Suresnes ») et aucune règle ne la devine à coup sûr.
    mention = '<p class="inv-hero-club">Dossier — ' + echapper(nomClub) + '</p>';
    if (noms.length) {
      mention += '<p class="inv-hero-engagement">Engagé en ' +
        noms.map(echapper).join('<span class="inv-quand-sep"> · </span>') + '</p>';
    }
  }
  return heroDocument(g, {
    surtitre: 'Votre dossier pour la journée',
    mention: mention,
    afficheCompacte: true,
    sansPresentation: true   // le descriptif du tournoi a été lu à l'invitation (décision Romain)
  });
}

/* --------------------------------------------------------------------------
   2 bis) PARTAGER LE DOSSIER À SES ÉQUIPES
   --------------------------------------------------------------------------
   Le dossier arrive chez UNE personne — le président, ou le contact qui a répondu
   à l'invitation. Mais le jour J, ce sont les éducateurs qui ont besoin des
   horaires, de l'accès et du planning. Ce bouton leur transmet le dossier.

   POURQUOI UN BOUTON, ET PAS « copier l'adresse » : le jeton a été retiré de la
   barre d'adresse (il s'imprimait et s'affichait sur les captures). L'adresse
   visible ne suffit donc plus à ouvrir le dossier — seul ce bouton sait
   reconstruire le lien COMPLET, jeton compris, pour qu'il reste valable une fois
   partagé.
   -------------------------------------------------------------------------- */

/** Lien COMPLET du dossier (jeton compris), tel qu'il doit voyager. Sans `admin` : le
 *  destinataire est un éducateur, pas l'organisateur. */
function lienPartageDossier(g, ctx) {
  const url = new URL('dossier-club.html', window.location.href);
  if (txt(g.tournoi_nom)) url.searchParams.set('tournoi', txt(g.tournoi_nom));
  url.searchParams.set('club', ctx.club);
  url.searchParams.set('token', ctx.token);
  return url.toString();
}

function barrePartage(g, ctx) {
  if (!ctx.club || !ctx.token) return '';
  const lien = lienPartageDossier(g, ctx);
  const nom = txt(g.tournoi_nom) || 'Le tournoi';
  const quand = txt(g.tournoi_date) ? ' du ' + dateLongueFr(g.tournoi_date) : '';
  const texte = 'Dossier du ' + nom + quand + ' : horaires, accès, contacts et planning de nos ' +
    'équipes.\n' + lien;

  // Les liens mailto: et WhatsApp sont construits ici (le clic doit partir immédiatement) ;
  // le bouton principal, lui, tente d'abord le partage NATIF du téléphone.
  const mail = 'mailto:?subject=' + encodeURIComponent('Dossier — ' + nom) +
               '&body=' + encodeURIComponent(texte);
  const whatsapp = 'https://wa.me/?text=' + encodeURIComponent(texte);

  return '<div class="d-partage no-print">' +
    '<p class="d-partage-titre">Vos éducateurs seront sur le terrain, pas devant leur boîte mail.</p>' +
    '<div class="d-partage-actions">' +
      '<button type="button" class="d-action" id="bouton-partager" ' +
        'data-url="' + echapper(lien) + '" data-texte="' + echapper(texte) + '" ' +
        'data-titre="' + echapper('Dossier — ' + nom) + '">📤 Partager le dossier à mes équipes</button>' +
      '<span class="d-partage-choix" id="d-partage-choix" hidden>' +
        '<a class="d-action" href="' + echapper(mail) + '">✉️ Par email</a>' +
        '<a class="d-action" href="' + echapper(whatsapp) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' +
        '<button type="button" class="d-action" id="bouton-copier-lien">🔗 Copier le lien</button>' +
      '</span>' +
    '</div>' +
    '<p class="d-partage-note">Ils ouvriront <strong>ce dossier</strong>, à jour au moment où ils ' +
      'le consultent. Le lien vaut accès : partagez-le à votre encadrement, pas au-delà.</p>' +
    '<span class="message-form" id="d-partage-msg"></span>' +
  '</div>';
}

/** Branche le partage UNE seule fois (les données voyagent dans les attributs du bouton :
 *  aucun état à garder, et le HTML peut être reconstruit sans empiler les écouteurs). */
function brancherPartage() {
  if (brancherPartage.fait) return;
  brancherPartage.fait = true;
  document.addEventListener('click', function (e) {
    const cible = e.target;
    if (!cible || !cible.id) return;
    const message = document.getElementById('d-partage-msg');

    if (cible.id === 'bouton-partager') {
      const donnees = { title: cible.getAttribute('data-titre'),
                        text: cible.getAttribute('data-texte'),
                        url: cible.getAttribute('data-url') };
      // Téléphone : le partage natif ouvre WhatsApp, Messages, Mail… en une fois. Ordinateur (ou
      // refus) : on révèle les trois options explicites. Une annulation n'est PAS un échec.
      if (navigator.share) {
        navigator.share(donnees).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          revelerChoixPartage();
        });
      } else {
        revelerChoixPartage();
      }
      return;
    }

    if (cible.id === 'bouton-copier-lien') {
      const lien = (document.getElementById('bouton-partager') || {}).getAttribute
        ? document.getElementById('bouton-partager').getAttribute('data-url') : '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(lien).then(function () {
          if (message) { message.textContent = '✅ Lien copié — collez-le où vous voulez.'; message.className = 'message-form ok'; }
        }).catch(function () { afficherLienAcopier(lien, message); });
      } else {
        afficherLienAcopier(lien, message);
      }
    }
  });
}

function revelerChoixPartage() {
  const choix = document.getElementById('d-partage-choix');
  if (choix) choix.hidden = false;
}

/** Presse-papiers refusé (Safari ancien, permission) : on affiche le lien, à copier à la main —
 *  jamais d'échec muet. */
function afficherLienAcopier(lien, message) {
  if (!message) return;
  message.innerHTML = 'Copiez ce lien : <span class="d-partage-lien">' + echapper(lien) + '</span>';
  message.className = 'message-form';
}

/** 3) LA JOURNÉE EN UN COUP D'ŒIL : la frise horaire, suivie de la note « horaires indicatifs »
 *  propre au dossier. La note ne s'affiche JAMAIS seule : sans heures, pas de section. */
function sectionJournee(g, cats) {
  const frise = friseJournee(g, cats);
  return section('La journée en un coup d\'œil', frise && (frise +
    '<p class="d-note">Après le dernier match : retour aux vestiaires puis cérémonie de remise ' +
    'des trophées — l\'événement se termine à l\'issue de la remise. Horaires indicatifs — ' +
    'le planning détaillé fera foi le jour du tournoi.</p>'), 'inv-journee');
}

/**
 * 3 bis) VOS ÉQUIPES : les équipes du club telles qu'elles existent dans le tournoi, avec leur
 * poule dès qu'elle est tirée. Rien tant qu'aucune équipe n'est créée — la section se masque et
 * apparaîtra d'elle-même : la page se reconstruit à chaque ouverture du lien.
 */
function sectionMesEquipes(ctx) {
  const liste = (ctx.equipes || []).filter(function (e) { return txt(e.nom_equipe); });
  if (!liste.length) return '';
  const publie = ctx.planningVisible;   // poules et planning : montrés seulement une fois validés

  const lignes = liste.map(function (e) {
    const detail = [];
    if (publie && txt(e.poule)) detail.push('poule ' + echapper(txt(e.poule)));
    const j = parseInt(txt(e.nb_joueurs), 10);
    if (isFinite(j) && j > 0) detail.push(j + ' joueur' + (j > 1 ? 's' : ''));
    const ed = parseInt(txt(e.nb_educateurs), 10);
    if (isFinite(ed) && ed > 0) detail.push(ed + ' éducateur' + (ed > 1 ? 's' : ''));
    // La POULE COMPLÈTE : un club veut savoir qui il rencontre, pas seulement dans quelle lettre
    // il est tombé. Ses adversaires viennent de l'instantané public (même catégorie, même poule).
    const adversaires = publie ? poulePleine(ctx.equipesTournoi, e) : [];
    return '<li>' +
      '<span class="d-eq-nom">' + echapper(txt(e.nom_equipe)) + '</span>' +
      '<span class="d-eq-cat">' + echapper(txt(e.categorie)) + '</span>' +
      (detail.length ? '<span class="d-eq-detail">' + detail.join(' · ') + '</span>' : '') +
      (adversaires.length
        ? '<span class="d-eq-poule">Poule ' + echapper(txt(e.poule)) + ' : ' +
          adversaires.map(function (n) {
            return (n === txt(e.nom_equipe))
              ? '<strong>' + echapper(n) + '</strong>' : echapper(n);
          }).join(' · ') + '</span>'
        : '') +
    '</li>';
  }).join('');

  const attendu = !publie || liste.some(function (e) { return !txt(e.poule); });
  return section('Vos équipes', '<ul class="d-equipes">' + lignes + '</ul>' +
    (attendu ? '<p class="d-note">Les poules et le planning s\'afficheront ici dès qu\'ils seront ' +
      'arrêtés par l\'organisation.</p>' : ''));
}

/** Toutes les équipes de la poule d'une équipe donnée (même catégorie, même poule), triées.
 *  [] si la poule n'est pas encore tirée — on ne montre jamais une poule d'une seule équipe. */
function poulePleine(equipesTournoi, equipe) {
  const poule = txt(equipe.poule), cat = txt(equipe.categorie);
  if (!poule) return [];
  const membres = (equipesTournoi || []).filter(function (x) {
    return txt(x.poule) === poule && txt(x.categorie) === cat && txt(x.nom_equipe);
  }).map(function (x) { return txt(x.nom_equipe); });
  membres.sort(function (a, b) { return a.localeCompare(b, 'fr'); });
  return membres.length > 1 ? membres : [];
}

/** Nom lisible d'une équipe à partir de son identifiant (matchs → équipes de l'instantané public). */
function nomEquipeParId(equipesTournoi, id) {
  const cible = txt(id);
  if (!cible) return '';
  const e = (equipesTournoi || []).find(function (x) { return txt(x.id_equipe) === cible; });
  return e ? txt(e.nom_equipe) : '';
}

/**
 * 3 ter) VOTRE PLANNING — les matchs du club, croisés entre SES équipes (backend, protégé par
 * jeton) et les matchs de l'instantané PUBLIC. Deux blocs :
 *  - le MATIN (phase « poule »), connu dès la génération du planning ;
 *  - l'APRÈS-MIDI, qui n'existe qu'une fois les matchs du matin joués — les poules de niveau se
 *    composent de leur classement. Tant qu'il n'existe pas, on ne montre pas un tableau vide :
 *    on dit qu'il arrivera, et il apparaîtra tout seul (la page se reconstruit à chaque ouverture).
 * Aucun match connu du tout ⇒ section entièrement masquée.
 */
function sectionMonPlanning(ctx, catsFormat) {
  if (!ctx.planningVisible) return '';            // pas encore validé par l'organisation
  const mesIds = (ctx.equipes || []).map(function (e) { return txt(e.id_equipe); }).filter(Boolean);
  if (!mesIds.length) return '';

  const miens = (ctx.matchs || []).filter(function (m) {
    return mesIds.indexOf(txt(m.equipe_A)) !== -1 || mesIds.indexOf(txt(m.equipe_B)) !== -1;
  }).slice().sort(function (a, b) { return txt(a.heure_debut).localeCompare(txt(b.heure_debut)); });
  if (!miens.length) return '';

  const estMatin = function (m) { return txt(m.phase).toLowerCase() !== 'classement'; };

  // UN BLOC PAR CATÉGORIE. Un club engagé en U8 et en U10 a deux groupes d'enfants, deux
  // éducateurs, deux journées parallèles : mélanger leurs matchs dans un seul tableau trié à
  // l'heure oblige chacun à faire le tri à l'œil. Les catégories sont dans l'ordre du tournoi.
  const cats = [];
  miens.forEach(function (m) {
    const c = txt(m.categorie);
    if (cats.indexOf(c) === -1) cats.push(c);
  });
  cats.sort(comparerCategorie);

  // Un tournoi 100 % Super Challenge n'a pas de phase d'après-midi : on ne promet pas ce qui
  // n'existera jamais (même règle que la frise et les cartes).
  const tousScf = !!(catsFormat && catsFormat.length) &&
                  catsFormat.every(function (c) { return ctxScf(c).estScf; });
  const blocs = cats.map(function (c) {
    const deCat = miens.filter(function (m) { return txt(m.categorie) === c; });
    const matin = deCat.filter(estMatin);
    const aprem = deCat.filter(function (m) { return !estMatin(m); });
    // L'attente de l'après-midi est dite DANS la catégorie concernée : une note globale
    // affirmerait « l'après-midi n'est pas établi » alors qu'une autre catégorie a déjà le sien.
    const attend = matin.length && !aprem.length && !tousScf;

    return '<div class="d-pl-bloc">' +
      (cats.length > 1 ? '<h3 class="d-planning-titre">' + echapper(c) + '</h3>' : '') +
      tableauPlanning(matin.length ? matin : deCat, mesIds, ctx.equipesTournoi) +
      (aprem.length
        ? '<p class="d-pl-phase">Après-midi</p>' + tableauPlanning(aprem, mesIds, ctx.equipesTournoi)
        : '') +
      (attend
        ? '<p class="d-note">L\'après-midi se compose à partir du classement du matin : il n\'est ' +
          'établi qu\'en cours de journée. Rouvrez ce lien, il s\'affichera ici.</p>'
        : '') +
    '</div>';
  }).join('');

  return section('Votre planning', blocs, 'd-planning-section');
}

/** Un tableau de matchs : heure, votre équipe, adversaire, terrain. La catégorie n'y figure
 *  plus — elle titre le bloc (sauf si le club n'en a qu'une : la colonne serait du bruit). */
function tableauPlanning(matchs, mesIds, equipesTournoi) {
  if (!matchs.length) return '';
  const lignes = matchs.map(function (m) {
    const aEstMoi = mesIds.indexOf(txt(m.equipe_A)) !== -1;
    // Un match du club CONTRE lui-même (deux de ses équipes) : on garde l'ordre du planning.
    const moi = nomEquipeParId(equipesTournoi, aEstMoi ? m.equipe_A : m.equipe_B);
    const adverse = nomEquipeParId(equipesTournoi, aEstMoi ? m.equipe_B : m.equipe_A);
    return '<tr>' +
      '<td class="d-pl-heure">' + echapper(txt(m.heure_debut)) + '</td>' +
      '<td>' + echapper(moi) + '</td>' +
      '<td>' + (adverse ? echapper(adverse) : '—') + '</td>' +
      '<td class="d-pl-terrain">' + echapper(txt(m.terrain)) + '</td>' +
    '</tr>';
  }).join('');
  return '<table class="d-planning"><thead><tr>' +
    '<th>Heure</th><th>Votre équipe</th><th>Adversaire</th><th>Terrain</th>' +
    '</tr></thead><tbody>' + lignes + '</tbody></table>';
}

/**
 * 10 bis) VOTRE ENGAGEMENT : ce que le club a DÉCLARÉ en répondant — jamais recalculé, c'est sa
 * parole. Tant que les réponses ne sont pas gelées (J-16), un bouton le renvoie à son formulaire
 * pour corriger ; après le gel, on dit clairement que c'est figé et à qui écrire.
 */
function sectionMonEngagement(g, club, ctx) {
  if (!club) return '';
  const parCat = jsonSur(club.nb_equipes_par_categorie, null);
  const detail = [];
  if (parCat && typeof parCat === 'object') {
    Object.keys(parCat).sort(comparerCategorie).forEach(function (c) {
      const n = parseInt(parCat[c], 10);
      if (isFinite(n) && n > 0) detail.push(echapper(c) + ' : ' + n + ' équipe' + (n > 1 ? 's' : ''));
    });
  }
  const lignes = listeOuVide([
    ligne('Équipes engagées', detail.join('<span class="inv-quand-sep"> · </span>')),
    ligne('Joueurs annoncés', echapper(txt(club.nb_joueurs_total))),
    ligne('Éducateurs annoncés', echapper(txt(club.nb_educateurs_total)))
  ]);
  if (!lignes) return '';

  // Lien personnel vers le formulaire de réponse (le jeton n'est plus dans l'adresse de la page :
  // il vient du contexte, qui l'a lu avant qu'on l'en retire).
  let action = '';
  if (ctx.gelees) {
    action = '<p class="d-note">Ces chiffres sont <strong>figés</strong> : la demande ' +
      'd\'autorisation du tournoi part sur cette base. Une correction reste possible — ' +
      (ctx.contactEmail
        ? 'écrivez à <a href="mailto:' + echapper(ctx.contactEmail) + '">' + echapper(ctx.contactEmail) + '</a>.'
        : 'contactez l\'organisateur.') + '</p>';
  } else if (ctx.club && ctx.token) {
    const url = new URL('reponse-invitation.html', window.location.href);
    if (txt(g.tournoi_nom)) url.searchParams.set('tournoi', txt(g.tournoi_nom));
    url.searchParams.set('club', ctx.club);
    url.searchParams.set('token', ctx.token);
    action = '<p class="d-engagement-action"><a class="d-action" href="' + echapper(url.toString()) +
      '">✏️ Modifier ma réponse</a></p>';
  }
  return section('Votre engagement', lignes + action);
}

/** 4) INFOS PRATIQUES : lieu + adresse, puis la logistique si elle est renseignée
 *  (paramètres optionnels de la Zone A : logistique_parking / _buvette / _vestiaires). */
function sectionInfosPratiques(g) {
  return section('Infos pratiques', listeOuVide([
    ligne('Lieu', echapper(txt(g.tournoi_lieu))),
    ligne('Adresse', echapper(txt(g.tournoi_adresse))),
    ligne('Parking', echapper(txt(g.logistique_parking))),
    ligne('Buvette / restauration', echapper(txt(g.logistique_buvette))),
    ligne('Vestiaires', echapper(txt(g.logistique_vestiaires)))
  ]));
}

/** 5) PARKING & ACCÈS : texte + photo (plan du parking) en pleine largeur. */
function sectionParking(g) {
  return section('Parking & accès',
    (txt(g.parking_texte) ? '<p class="d-parking-texte">' + echapper(txt(g.parking_texte)) + '</p>' : '') +
    (txt(g.parking_photo_id)
      ? '<img class="d-parking-photo" src="' + echapper(urlAffiche(g.parking_photo_id, 1000)) + '" ' +
        'alt="Plan du parking et des accès">'
      : ''));
}

/** 6) VOTRE CONTACT : le référent du tournoi, en évidence — c'est le numéro qu'on cherche
 *  quand on est en retard sur l'autoroute, pas en dernière page. */
function sectionContact(g) {
  if (!txt(g.referent_nom) && !txt(g.referent_tel)) return '';
  return '<section class="d-section d-contact">' +
    '<h2>Votre contact</h2>' +
    '<p class="d-contact-ligne">' +
      (txt(g.referent_nom) ? '<strong>' + echapper(txt(g.referent_nom)) + '</strong>' : '') +
      (txt(g.referent_tel)
        ? (txt(g.referent_nom) ? ' · ' : '') + '<a href="tel:' + echapper(txt(g.referent_tel)) + '">'
          + echapper(telephoneLisible(g.referent_tel)) + '</a>'
        : '') +
    '</p></section>';
}

/** 7) SÉCURITÉ : poste de secours (si coché) + référent sécurité résolu. */
function sectionSecurite(g) {
  const secours = String(txt(g.securite_secours_oui)).toLowerCase() === 'oui';
  const refSecu = referentSecurite(g);
  const contactSecu = [refSecu.nom ? echapper(refSecu.nom) : '', refSecu.tel ? echapper(telephoneLisible(refSecu.tel)) : '']
    .filter(Boolean).join(' — ');
  return section('Sécurité', listeOuVide([
    ligne('Poste de secours', secours
      ? 'Sur place' + (txt(g.securite_secours_precisions) ? ' — ' + echapper(txt(g.securite_secours_precisions)) : '')
      : ''),
    ligne('Référent sécurité', contactSecu)
  ]));
}

/** 8) SUIVI & ORGANISATION : lien live + QR, table de marque, résumé des terrains. */
function sectionSuivi(g, cats) {
  const urlLive = urlSuiviPublic(g);
  const terrains = resumeTerrains(g, cats);
  return section('Suivi des scores & organisation',
    '<div class="d-suivi">' +
      '<div class="d-suivi-texte">' + listeOuVide([
        ligne('Scores en direct', '<a href="' + echapper(urlLive) + '" target="_blank" rel="noopener">' + echapper(urlLive) + '</a>'),
        ligne('Table de marque', echapper(txt(g.table_marque_organisation))),
        ligne('Terrains', echapper(terrains))
      ]) + '</div>' +
      '<div class="d-qr" id="d-qr" data-url="' + echapper(urlLive) + '"><span class="d-qr-legende">Scores en direct</span></div>' +
    '</div>');
}

/** 9) RAPPEL SPORTIF : les mêmes cartes que l'invitation, limitées aux catégories ENGAGÉES
 *  par le club quand on les connaît. En RAPPEL (plus bas) : le club a choisi son engagement
 *  sur ces informations-là, il ne les redécouvre pas ici. */
function sectionCategories(cats, filtreApplique) {
  return section(filtreApplique ? 'Rappel — vos catégories engagées' : 'Rappel — les catégories du tournoi',
    cartesCategories(cats), 'inv-categories');
}

/** 10) ENCADREMENT & ASSURANCE : ratio, diplômes, attestation si requise, mentions FFR. */
function sectionEncadrement(g) {
  const attestation = String(txt(g.assurance_attestation_requise)).toLowerCase() === 'oui';
  return section('Encadrement & assurance', listeOuVide([
    ligne('Encadrement', echapper(txt(g.encadrement_ratio))),
    ligne('Diplômes exigés', echapper(txt(g.encadrement_diplomes))),
    ligne('Assurance', attestation ? 'Attestation d\'assurance du club à fournir' : ''),
    // Mentions réglementaires FFR (toujours affichées) : licence obligatoire + FDM EDR.
    ligne('Licences', 'Tous les joueurs participant au tournoi doivent être titulaires d\'une licence FFR validée.'),
    ligne('Feuille de match', 'La feuille de match dématérialisée des Écoles de Rugby (FDM EDR) est utilisée pour l\'ensemble des rencontres du tournoi. Elle remplace la composition d\'équipe, la feuille de régulation et la feuille de score papier.')
  ]));
}

/** 11) MODALITÉS D'INSCRIPTION : date limite de confirmation, tarif d'engagement
 *  (montant + modalités) SEULEMENT si un tarif est demandé. */
function sectionModalites(g) {
  const tarifOui = String(txt(g.tarif_engagement_oui)).toLowerCase() === 'oui';
  return section('Modalités d\'inscription', listeOuVide([
    ligne('Confirmation attendue avant le',
      txt(g.date_limite_confirmation) ? echapper(dateLongueFr(g.date_limite_confirmation)) : ''),
    ligne('Tarif d\'engagement', tarifOui ? echapper(txt(g.tarif_engagement_montant)) : ''),
    ligne('Modalités de paiement', tarifOui ? echapper(txt(g.tarif_engagement_modalites)) : '')
  ]));
}

/** 13) DATE DE GÉNÉRATION : utile sur le PAPIER (un dossier imprimé fige la version du jour),
 *  avec le rappel que le lien personnel, lui, montre toujours l'état à jour. */
function mentionGeneration() {
  const genereLe = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    + ' à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return '<p class="d-genere">Document généré le ' + echapper(genereLe) +
    ' — votre lien personnel affiche toujours la version à jour.</p>';
}

/** Bandeau d'actions : chaque bouton n'apparaît que si son lien est constructible. */
function bandeauActions(g) {
  const adresse = adresseItineraire(g);
  const boutons = [];

  if (construireICS(g)) {
    boutons.push('<button type="button" class="d-action" id="bouton-ics">📅 Ajouter à mon agenda</button>');
  }
  if (adresse) {
    const q = encodeURIComponent(adresse);
    boutons.push('<a class="d-action" href="https://www.google.com/maps/search/?api=1&query=' + q + '" target="_blank" rel="noopener">🗺️ Itinéraire (Google Maps)</a>');
    boutons.push('<a class="d-action" href="https://waze.com/ul?q=' + q + '&navigate=yes" target="_blank" rel="noopener">🚗 Itinéraire (Waze)</a>');
  }
  if (txt(g.url_site_association)) {
    boutons.push('<a class="d-action" href="' + echapper(txt(g.url_site_association)) + '" target="_blank" rel="noopener">🌐 Site de l\'association</a>');
  }
  // « Relayer sur les réseaux » pointe vers le compte configuré dans `url_instagram`.
  if (txt(g.url_instagram)) {
    boutons.push('<a class="d-action" href="' + echapper(txt(g.url_instagram)) + '" target="_blank" rel="noopener">📣 Relayer sur les réseaux</a>');
  }
  if (!boutons.length) return '';

  // Le bouton .ics a besoin des données du tournoi : branché après le rendu (délégué).
  document.addEventListener('click', function brancherActions(e) {
    if (e.target && e.target.id === 'bouton-ics') telechargerICS(g);
  });

  return '<div class="d-actions">' + boutons.join('') + '</div>';
}

/* --------------------------------------------------------------------------
   QR CODE (page de suivi en direct) — généré en local, pointe vers l'URL live
   -------------------------------------------------------------------------- */

function dessinerQR() {
  const conteneur = document.getElementById('d-qr');
  if (!conteneur || typeof qrcode !== 'function') return;
  try {
    const qr = qrcode(0, 'M'); // version auto, correction M
    qr.addData(conteneur.getAttribute('data-url'));
    qr.make();
    // SVG : net à l'écran comme à l'impression (cellSize 4 ≈ 3 cm imprimé).
    conteneur.insertAdjacentHTML('afterbegin', qr.createSvgTag({ cellSize: 4, margin: 8 }));
  } catch (e) {
    conteneur.hidden = true; // URL trop longue ou lib absente : on masque, sans casser la page
  }
}
