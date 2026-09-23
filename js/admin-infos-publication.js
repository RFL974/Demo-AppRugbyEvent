/**
 * ============================================================================
 *  ADMIN — INFOS DU TOURNOI, CONTACTS & PUBLICATION (extrait de admin.js)
 * ============================================================================
 *  Cartes de contenu du tournoi et publication, sorties du monolithe admin.js
 *  SANS changement de comportement :
 *   - Infos du tournoi (nom/date/lieu/description) + affiche ;
 *   - Contacts & sécurité, « Sur place », « Réponse à l'invitation » ;
 *   - État des sections du dossier club ; publication / masquage du tournoi.
 *
 *  Porte aussi quelques HELPERS partagés utilisés par d'autres modules (restent
 *  globaux, résolus au moment de l'appel) : urlAffiche, redimensionnerImage,
 *  brancherZoneImage (zones d'image affiche/parking), normaliserTelephone, estPublie.
 *
 *  Dépend de globaux d'admin.js (configCourante, ecrireAdmin, apiGet, majDossier,
 *  majApercuInvitation, rechargerEtRendre, dialog*…) accédés au moment de l'appel.
 *  Chargé après admin.js dans admin.html.
 * ============================================================================
 */

/* --------------------------------------------------------------------------
   INFOS DU TOURNOI (nom / date / lieu / description)
   Le NOM alimente la page publique du tournoi ; nom, date, lieu, description et
   affiche alimentent les invitations et le dossier transmis aux clubs.
   ⛔ Aucun site tiers ne les lit (découplage M1-PUB / PUB-4, doctrine D-048).
   -------------------------------------------------------------------------- */

/* ==========================================================================================
 *  LA BASE DE FUSION — ce que le serveur portait quand ce formulaire a été peint
 * ------------------------------------------------------------------------------------------
 *  🔬 LE DÉFAUT FERMÉ (contre-épreuve du lot « Publication »). « Publier » enregistre les infos au
 *  passage. Un onglet resté ouvert depuis le matin renvoyait donc les valeurs du matin, et
 *  écrasait en silence ce qu'un second onglet avait corrigé l'après-midi. ⚠️ « Rafraîchir » ne
 *  resynchronise volontairement PAS ce formulaire (il détruirait une saisie en cours) : la fenêtre
 *  restait ouverte toute la session.
 *
 *  ⭐ CE QUE CETTE MÉMOIRE EST, ET CE QU'ELLE N'EST PAS.
 *   · C'est la valeur BRUTE reçue du serveur, telle que `configCourante.global` la porte — ⛔ JAMAIS
 *     la valeur affichée ni la valeur normalisée par le formulaire (`.value.trim()`). Un espace de
 *     fin ferait sinon passer un champ jamais touché pour une modification, et il écraserait.
 *   · Elle n'est RENOUVELÉE que depuis un état serveur CONFIRMÉ : le chargement de l'écran, ou la
 *     configuration relue sous le verrou et jointe à une réponse d'écriture. ⛔ Jamais depuis le
 *     formulaire, ⛔ jamais avant que le serveur ait confirmé.
 *   · Elle est envoyée telle quelle (`base_infos`) et c'est le SERVEUR qui arbitre, sous le verrou.
 *
 *  ⛔ SANS BACKEND QUI LA COMPREND, IL N'Y A PAS DE PROTECTION, et l'écran ne prétend pas le
 *  contraire : un backend d'avant ignore `base_infos` et reprend son comportement historique. La
 *  suite `ecran-publication-surface` le caractérise explicitement (section K).
 * ========================================================================================== */

/** Les champs que les formulaires de l'administration envoient à `enregistrerInfosTournoi`. */
const CHAMPS_BASE_INFOS = ['tournoi_nom', 'tournoi_lieu', 'tournoi_adresse', 'tournoi_description',
                           'tournoi_date', 'zone_vacances'];

/** La base brute, champ par champ. ⛔ `undefined` pour un champ jamais chargé : le serveur
 *  applique alors son comportement historique sur CE champ, et le dit. */
let baseInfosTournoi = {};

/**
 * Mémorise la base de CES champs depuis `configCourante` — donc depuis un état serveur.
 * ⛔ Appelée UNIQUEMENT là où le formulaire est (re)peint depuis une configuration confirmée.
 * @param {Array<string>} champs
 */
function memoriserBaseInfos(champs) {
  const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
  (champs || []).forEach(function (champ) {
    baseInfosTournoi[champ] = g[champ] === undefined ? '' : g[champ];
  });
}

/** La base à joindre à un envoi : les champs de CET envoi dont on connaît la base, et eux seuls.
 *  ⛔ Un champ sans base n'entre pas : mieux vaut le comportement historique, annoncé, qu'une
 *    base inventée qui déciderait à tort qu'un champ n'a pas bougé. */
function baseInfosPour(envoi) {
  const base = {};
  Object.keys(envoi || {}).forEach(function (champ) {
    if (CHAMPS_BASE_INFOS.indexOf(champ) !== -1 && baseInfosTournoi[champ] !== undefined) {
      base[champ] = baseInfosTournoi[champ];
    }
  });
  return base;
}

/** L'envoi, augmenté de sa base de fusion. ⛔ Rien d'ajouté si aucune base n'est connue : la
 *  demande reste alors exactement celle d'avant ce lot. */
function avecBaseInfos(envoi) {
  const base = baseInfosPour(envoi);
  return Object.keys(base).length ? Object.assign({}, envoi, { base_infos: base }) : envoi;
}

/** Pré-remplit le formulaire des infos du tournoi avec ce qui est déjà enregistré.
 *  @param {Object} [opt] `controleFFR: false` — ne pas relancer le contrôle FFR : l'appelant sait
 *    que ses entrées (date, zone, catégories) n'ont pas bougé. Sans option : comportement historique. */
function majInfosTournoi(opt) {
  if (typeof majChoixCategoriesTournoi === 'function') majChoixCategoriesTournoi();
  const form = document.getElementById('form-infos-tournoi');
  if (!form) return;
  const g = configCourante.global || {};
  form.tournoi_nom.value = g.tournoi_nom || '';
  form.tournoi_lieu.value = g.tournoi_lieu || '';
  form.tournoi_adresse.value = g.tournoi_adresse || '';
  form.tournoi_description.value = g.tournoi_description || '';
  /* ⭐ LA BASE EST PRISE ICI, au moment MÊME où le formulaire est peint, et depuis `g` — la valeur
     BRUTE du serveur, ⛔ pas celle qu'on vient de poser dans le champ (`|| ''` la normalise déjà).
     Les deux doivent rester distinctes : c'est tout le sens de la fusion. */
  memoriserBaseInfos(['tournoi_nom', 'tournoi_lieu', 'tournoi_adresse', 'tournoi_description']);

  // Date + zone de vacances : elles vivent dans la carte « Date & conformité FFR »
  // (#form-cadre-tournoi), pas ici. On les (re)remplit là-bas et on marque ce formulaire propre.
  majCadreTournoi();

  // Aperçu de l'affiche déjà enregistrée (image Drive publique).
  afficheDataURI = '';
  majApercuAfficheEnregistree();

  // Formulaire (re)rempli avec l'état ENREGISTRÉ → nouvelle référence pour le
  // détecteur de « modifications non enregistrées » de l'assistant.
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);

  // Conformité FFR : (re)vérifie dès que les infos (dont la date) sont (re)chargées.
  if (opt && opt.controleFFR === false) return;
  if (typeof majConformiteFFR === 'function') majConformiteFFR();
}

/** Carte « Date & vérification » remise à l'état ENREGISTRÉ (date, zone) — et elle seule : les
 *  infos générales, l'affiche et les cases en cours de saisie n'y sont pas touchées. */
function majCadreTournoi() {
  const cadre = document.getElementById('form-cadre-tournoi');
  if (!cadre) return;
  const g = configCourante.global || {};
  if (cadre.tournoi_date)  cadre.tournoi_date.value = g.tournoi_date || '';
  if (cadre.zone_vacances) cadre.zone_vacances.value = g.zone_vacances || 'C'; // défaut 'C' (migration douce)
  // ⭐ MÊME RÈGLE que pour les infos : la base vient de `g`, pas du champ qu'on vient de remplir.
  memoriserBaseInfos(['tournoi_date', 'zone_vacances']);
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(cadre);
}

/** Aperçu de l'affiche ENREGISTRÉE, ou rien — local : ni relecture, ni contrôle FFR, ni autre champ. */
function majApercuAfficheEnregistree() {
  const g = configCourante.global || {};
  const bloc = document.getElementById('apercu-affiche');
  const img = document.getElementById('apercu-affiche-img');
  if (!bloc || !img) return;
  if (g.tournoi_affiche_id) {
    img.src = urlAffiche(g.tournoi_affiche_id, 600);
    bloc.hidden = false;
  } else {
    img.removeAttribute('src');
    bloc.hidden = true;
  }
}

/** Zone d'affiche atteignable au clavier : Tab s'y arrête, Entrée ou Espace ouvre le choix du
 *  fichier (le champ fichier, masqué, ne l'était pas). Le clic et le glisser-déposer ne changent pas. */
function rendreZoneAfficheAccessible() {
  const zone = document.getElementById('zone-depot-affiche');
  const champ = zone && zone.querySelector('input[type="file"]');
  if (!zone || !champ || zone.getAttribute('tabindex') !== null) return;
  zone.setAttribute('tabindex', '0');
  zone.setAttribute('role', 'button');
  zone.setAttribute('aria-label', 'Choisir l’affiche du tournoi (image)');
  zone.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    champ.click();
  });
}

/* --------------------------------------------------------------------------
   CONTRAT D'ÉCRITURE « une écriture, une réponse exploitable » (backend `ecriture-v1`)
   ⭐ La réponse d'`enregistrerInfosTournoi` porte la configuration RELUE sous le verrou
   serveur : l'écran se met à jour depuis elle, sans relecture `getConfigAdmin` (une exécution
   Apps Script entière, ~2,5 s, économisée à chaque clic). Elle dit aussi quels champs ont
   RÉELLEMENT changé ; le contrôle FFR, lui, n'est relancé que si le verdict affiché ne porte
   pas déjà sur la date, la zone et les catégories enregistrées.
   ⛔ REPLI : un backend d'avant le contrat répond { ok: true } seul — on relit alors comme
   avant. Le frontend peut donc être publié avant, après ou sans le backend.
   -------------------------------------------------------------------------- */
const CONTRAT_ECRITURE = 'ecriture-v1';

/** La réponse suit-elle le contrat, avec une configuration complète ? */
function reponseEcritureExploitable(res) {
  const cfg = res && res.contrat === CONTRAT_ECRITURE ? res.config : null;
  return !!(cfg && cfg.global && typeof cfg.global === 'object' && Array.isArray(cfg.categories));
}

/** Met `configCourante` à l'état enregistré : depuis la réponse si elle est exploitable, sinon par
 *  une relecture (repli). */
async function appliquerConfigEnregistree(res) {
  configCourante = reponseEcritureExploitable(res) ? res.config : await lireConfigAdmin();
}

/** Faut-il relancer le contrôle FFR ? Non si le verdict affiché porte DÉJÀ sur la date, la zone et
 *  les catégories courantes — le cas ordinaire : la saisie d'une date le relance aussitôt, et ces
 *  infos ne touchent aucune autre entrée du contrôle (équipes, matchs, réglages des catégories).
 *  ⛔ Backend d'avant le contrat, ou verdict absent / périmé : oui, comme avant. */
function controleFFRARelancer(res) {
  if (!res || res.contrat !== CONTRAT_ECRITURE) return true;
  return !(typeof verdictFFRAJour === 'function' && verdictFFRAJour());
}

/** Message de fin d'enregistrement : succès, « rien à changer », avertissements du serveur. */
function messageEcritureInfos(res, texteSucces) {
  const avertissements = (res && Array.isArray(res.avertissements)) ? res.avertissements : [];
  const inchange = res && res.contrat === CONTRAT_ECRITURE && Array.isArray(res.modifies) && res.modifies.length === 0;
  let texte = inchange ? '✅ Déjà à jour : rien n’a changé depuis le dernier enregistrement.' : texteSucces;
  if (avertissements.length) {
    texte += '\n' + avertissements.map(function (a) { return '⚠️ ' + String(a && a.message || ''); }).join('\n');
  }
  // Une affiche refusée est une partie de la demande qui n'a pas abouti : elle se lit en rouge.
  const partielle = avertissements.some(function (a) { return /^affiche/.test(String(a && a.code || '')); });
  return { texte: texte, type: partielle ? 'ko' : 'ok' };
}

/* urlAffiche(), brancherZoneImage() et redimensionnerImage() — helpers partagés — sont
   désormais dans admin.js (noyau), utilisés aussi par admin-invitations.js (parking). */

/* --------------------------------------------------------------------------
   FORMATAGE DE DATE PARTAGÉ (admin)
   ⚡ Cette section portait « APERÇU DE PUBLICATION — réplique EXACTE de la carte
   d'actualité du site vitrine ». Cet aperçu a été SUPPRIMÉ (M1-PUB / PUB-5, M9,
   2026-08-26) : il décrivait des pages qui n'existent plus depuis le découplage.
   ⭐ Le principe retenu : on OUVRE la vraie page publique, on ne la copie pas —
   une réplique affirme sa propre fidélité, et finit par dériver.
   Seul survit le formateur de date ci-dessous, utilisé par les invitations et
   par le contrôle de conformité FFR.
   -------------------------------------------------------------------------- */

/** Date « 22 juillet 2026 ». Utilisée par les invitations (admin-invitations.js) et par
 *  le contrôle de conformité FFR (admin-conformite-ffr.js).
 *  ⚠️ Passe par `dateLocaleDepuisISO` (commun.js) : une date de tournoi est une date
 *  CIVILE. `new Date('AAAA-MM-JJ')` vaudrait minuit UTC et reculerait d'un jour sur tout
 *  appareil en retard sur UTC — y compris dans les emails DÉJÀ ENVOYÉS aux clubs. */
function formaterDateFr(dateISO) {
  const d = dateLocaleDepuisISO(dateISO);
  if (!d || isNaN(d)) return String(dateISO == null ? '' : dateISO);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Traite un fichier d'affiche (choisi OU déposé) : redimensionne, aperçu immédiat. */
async function traiterFichierAffiche(fichier) {
  const message = document.getElementById('message-infos-tournoi');
  if (!fichier) { afficheDataURI = ''; return; }
  try {
    afficheDataURI = await redimensionnerImage(fichier, 1000, 0.82);
    const bloc = document.getElementById('apercu-affiche');
    document.getElementById('apercu-affiche-img').src = afficheDataURI;
    bloc.hidden = false;
  } catch (e) {
    afficheDataURI = '';
    // L'aperçu ne montre plus une image qui ne partira pas : il revient à l'affiche enregistrée.
    const form = document.getElementById('form-infos-tournoi');
    if (form && form.tournoi_affiche) form.tournoi_affiche.value = '';
    majApercuAfficheEnregistree();
    afficherMessage(message, "⚠️ Image illisible. Choisis un fichier image (JPG, PNG…).", 'ko');
  }
}

/**
 * Retire l'affiche. Deux cas :
 *   1) une image vient d'être choisie mais pas encore enregistrée → on annule le choix (local) ;
 *   2) une affiche est déjà enregistrée → suppression backend (fichier Drive + Config).
 */
async function onRetirerAffiche() {
  const message = document.getElementById('message-infos-tournoi');
  const form = document.getElementById('form-infos-tournoi');

  // Cas 1 : choix non enregistré → on annule simplement la sélection. ⭐ Geste LOCAL : aucun appel,
  //   et les autres champs de l'écran (saisies en cours comprises) ne sont pas réécrits.
  if (afficheDataURI) {
    afficheDataURI = '';
    form.tournoi_affiche.value = '';
    majApercuAfficheEnregistree(); // ré-affiche l'affiche enregistrée, ou masque l'aperçu si aucune
    afficherMessage(message, "Choix d'affiche annulé.", 'ok');
    return;
  }

  // Cas 2 : affiche enregistrée → confirmation puis suppression backend.
  if (!(configCourante.global && configCourante.global.tournoi_affiche_id)) return;
  if (!await dialogConfirmer("Retirer l'affiche du tournoi ?", { ok: 'Retirer', danger: true })) return;

  const bouton = document.getElementById('bouton-retirer-affiche');
  bouton.disabled = true;
  try {
    // ⭐ UNE requête : `supprimerAffiche` n'efface que `tournoi_affiche_id` (et met le fichier Drive à la
    //   corbeille) ; sa réussite suffit à le reporter ici — ni relecture de toute la configuration, ni
    //   contrôle FFR (l'affiche n'y entre pas), ni réécriture des champs en cours de saisie.
    await ecrireAdmin('supprimerAffiche', {});
    configCourante.global = Object.assign({}, configCourante.global, { tournoi_affiche_id: '' });
    majApercuAfficheEnregistree();
    majDossier();
    afficherMessage(message, '🗑️ Affiche retirée.', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
  }
}

/** Lit les infos SITE saisies (nom / lieu / adresse / description).
 *  La date et la zone (contrôle FFR) ont leur propre carte et leur propre enregistrement
 *  (lireCadreTournoi / onEnregistrerCadre) — enregistrement partiel, elles ne sont PAS ici. */
function lireInfosTournoi() {
  const form = document.getElementById('form-infos-tournoi');
  return {
    tournoi_nom: form.tournoi_nom.value.trim(),
    tournoi_lieu: form.tournoi_lieu.value.trim(),
    tournoi_adresse: form.tournoi_adresse.value.trim(),
    tournoi_description: form.tournoi_description.value.trim()
  };
}

/** Lit la date + la zone de vacances de la carte « Date & conformité FFR ». */
function lireCadreTournoi() {
  const form = document.getElementById('form-cadre-tournoi');
  return {
    tournoi_date: (form && form.tournoi_date) ? form.tournoi_date.value : '',
    zone_vacances: (form && form.zone_vacances && form.zone_vacances.value) ? form.zone_vacances.value : 'C'
  };
}

/**
 * Enregistre UNIQUEMENT la date prévue + la zone de vacances (carte « Date & conformité FFR »).
 * Sauvegarde PARTIELLE : le backend n'écrit que les champs envoyés (ecrireChampsConfig), donc les
 * infos du site (nom/lieu/…) ne sont pas touchées.
 */
async function onEnregistrerCadre() {
  const message = document.getElementById('message-cadre-tournoi');
  const bouton = document.getElementById('bouton-enregistrer-cadre');
  await avecBoutonOccupe(bouton, message, async function () {
    afficherMessage(message, 'Enregistrement de la date…', 'ok');
    const res = await ecrireAdmin('enregistrerInfosTournoi', avecBaseInfos(lireCadreTournoi()));
    // L'état réel vient de la réponse (contrat d'écriture) ou, à défaut, d'une relecture.
    await appliquerConfigEnregistree(res);
    // ⭐ Seule la carte enregistrée revient à l'état du serveur : le nom, la description, l'affiche ou
    //   les cases encore en cours de saisie ailleurs dans l'écran ne sont PAS écrasés.
    majCadreTournoi();
    if (controleFFRARelancer(res) && typeof majConformiteFFR === 'function') majConformiteFFR();
    majDossier();      // le dossier club montre la date
    majTableauBord();  // l'en-tête de l'écran aussi (actualiserCadreCiel)
    const fin = messageEcritureInfos(res, '✅ Date & zone enregistrées.');
    afficherMessage(message, fin.texte, fin.type);
  });
}

/** Une écriture des infos. Si elle porte le choix des catégories, les lectures de catégories en vol
 *  sont invalidées au départ et au retour, comme pour toute écriture de catégorie (ecrireAdmin). */
async function envoyerInfosTournoi(envoi) {
  const invalider = function () {
    if (envoi.categories_choisies && typeof invaliderLecturesCategories === 'function') invaliderLecturesCategories();
  };
  invalider();
  try { return await ecrireAdmin('enregistrerInfosTournoi', avecBaseInfos(envoi)); } finally { invalider(); }
}

/** Le serveur a-t-il PU écrire malgré l'erreur ? Non pour un refus au contrat (il déclare `modifies`
 *  vide) ni pour une clé non saisie (rien n'est parti). Oui pour tout le reste (réponse perdue…). */
function ecritureInfosIncertaine(err) {
  const r = err && err.reponse;
  if (r && r.contrat === CONTRAT_ECRITURE && Array.isArray(r.modifies) && r.modifies.length === 0) return false;
  return String((err && err.message) || '') !== 'Action annulée.';
}

/** Échec de l'envoi : l'erreur remonte au bouton. Si le choix des catégories était parti et que le
 *  serveur a pu écrire, les catégories sont RELUES — jamais renvoyées automatiquement. */
async function echecEnregistrementInfos(err, choix) {
  if (choix && ecritureInfosIncertaine(err)) {
    const etat = await reconcilierChoixCategoriesApresEchec(choix.selection);
    err.message = String(err.message || 'Réponse du serveur indisponible.') + (etat === 'confirme'
      ? ' Les catégories sont confirmées par relecture ; enregistre à nouveau pour confirmer les informations (sans risque de doublon).'
      : ' Rien n’a été renvoyé automatiquement : enregistre à nouveau (sans risque de doublon).');
  }
  throw err;
}

/**
 * Enregistre les infos du tournoi (nom/date/lieu/description + affiche éventuelle),
 * indépendamment de la publication. Utilisable à tout moment, même après publication
 * (pour corriger une faute de frappe sans avoir à dépublier).
 * ⭐ Contrat d'écriture : UNE requête pour tout le geste — infos, date, zone, affiche et choix des
 *   catégories —, après la confirmation destructrice éventuelle. Le serveur revérifie les
 *   suppressions ; s'il en refuse une, on redemande UNE fois avec ses chiffres, puis on renvoie.
 */
async function onEnregistrerInfos() {
  const message = document.getElementById('message-infos-tournoi');
  const bouton = document.getElementById('bouton-enregistrer-infos');
  await avecBoutonOccupe(bouton, message, async function () {
    const informations = Object.assign({}, lireInfosTournoi(), lireCadreTournoi());
    let choix = null;
    if (typeof choixCategoriesAValider === 'function' && choixCategoriesAValider() &&
        typeof preparerEnvoiChoixCategories !== 'function') {
      // Module des catégories d'avant le contrat (cache du navigateur mêlant deux versions des scripts) :
      // parcours historique — valider les catégories d'abord, n'envoyer les infos que si c'est confirmé.
      await onValiderChoixCategories({ preventDefault: function () {} });
      if (choixCategoriesAValider()) {
        afficherMessage(message, 'Les catégories restent à valider. Consulte le message sous leur sélection ; les informations n’ont pas été envoyées.', 'ko');
        return;
      }
    } else if (typeof choixCategoriesAValider === 'function' && choixCategoriesAValider()) {
      choix = await preparerEnvoiChoixCategories();
      if (choix.statut !== 'pret') {
        afficherMessage(message, choix.statut === 'annule'
          ? 'Enregistrement annulé : aucune information envoyée ; le choix des catégories reste à enregistrer.'
          : 'Les catégories restent à valider. Consulte le message sous leur sélection ; les informations n’ont pas été envoyées.', 'ko');
        return;
      }
    }
    try {
      await enregistrerInfosEtChoix(message, informations, choix);
    } finally {
      if (choix) libererChoixCategories();
    }
  });
}

async function enregistrerInfosEtChoix(message, informations, choixInitial) {
  let choix = choixInitial;
  const affiche = afficheDataURI;
  afficherMessage(message, 'Enregistrement des infos' + (affiche && choix ? ', de l’affiche' : affiche ? ' et de l’affiche' : '') +
    (choix ? ' et des catégories…' : '…'), 'ok');
  const base = affiche ? Object.assign({}, informations, { affiche: affiche }) : informations;
  let res;
  try {
    res = await envoyerInfosTournoi(choix ? Object.assign({}, base, choix.envoi) : base);
  } catch (err) {
    const refus = choix && refusSuppressionCategories(err);
    if (!refus) return echecEnregistrementInfos(err, choix);
    // ⛔ Le serveur a refusé TOUTE la demande (rien n'est écrit) : une suppression réelle dépassait ce
    //   qui avait été confirmé. Son état relu remplace l'affichage ; on redemande UNE fois.
    appliquerRefusChoixCategories(refus);
    const reprise = await preparerEnvoiChoixCategories(refus.a_confirmer, choix.confirmees);
    if (reprise.statut !== 'pret') {
      afficherMessage(message, '⚠️ ' + refus.error + ' Ton choix des catégories reste à enregistrer.', 'ko');
      return;
    }
    choix = reprise;
    try {
      res = await envoyerInfosTournoi(Object.assign({}, base, choix.envoi));
    } catch (err2) {
      const refus2 = refusSuppressionCategories(err2);
      if (!refus2) return echecEnregistrementInfos(err2, choix);
      appliquerRefusChoixCategories(refus2);
      afficherMessage(message, '⚠️ ' + refus2.error + ' Vérifie les catégories puis enregistre à nouveau.', 'ko');
      return;
    }
  }
  if (affiche && !reponseEcritureExploitable(res)) {
    // Backend d'avant le contrat : il a ignoré l'affiche — elle part par son action historique.
    afficherMessage(message, "Envoi de l'affiche…", 'ok');
    await ecrireAdmin('enregistrerAffiche', { affiche: affiche });
  }
  let categoriesEnAttente = false;
  let dejaRelue = false;
  if (choix && reponseCategoriesExploitable(res)) {
    categoriesEnAttente = !appliquerChoixCategoriesEnregistre(res, choix.selection);
  } else if (choix && res && res.contrat === CONTRAT_ECRITURE) {
    // Réponse au contrat mais incomplète : le serveur a PU appliquer le choix — relecture seule, qui
    // sert aussi aux infos (configCourante vient d'être relue).
    const etat = await reconcilierChoixCategoriesApresEchec(choix.selection);
    categoriesEnAttente = etat !== 'confirme';
    dejaRelue = etat !== 'inconnu';
  } else if (choix) {
    // Backend d'avant le contrat : il a ignoré le choix. Parcours historique, sans redemander ce
    // qui vient d'être confirmé (il relit l'état et confirme de nouveau si celui-ci a changé).
    libererChoixCategories();
    afficherMessage(message, 'Enregistrement des catégories…', 'ok');
    await onValiderChoixCategories({ preventDefault: function () {} },
      { dejaConfirmees: choix.confirmees.map(function (c) { return c.categorie; }) });
    categoriesEnAttente = choixCategoriesAValider();
  }
  // L'état enregistré (affiche comprise) vient de la réponse ; relu seulement en repli.
  if (!dejaRelue) await appliquerConfigEnregistree(res);
  majInfosTournoi({ controleFFR: controleFFRARelancer(res) });
  majDossier(); // le dossier club reflète les nouvelles infos
  majTableauBord();
  const fin = messageEcritureInfos(res, choix && !categoriesEnAttente ? '✅ Infos et catégories enregistrées.' : '✅ Infos enregistrées.');
  const form = document.getElementById('form-infos-tournoi');
  if (affiche && fin.type === 'ko') {
    // Affiche refusée par Drive : l'image choisie reste prête, un nouveau clic la renverra.
    afficheDataURI = affiche;
    document.getElementById('apercu-affiche-img').src = affiche;
    document.getElementById('apercu-affiche').hidden = false;
  } else {
    form.tournoi_affiche.value = ''; // vide le champ fichier
  }
  if (categoriesEnAttente) {
    fin.texte += '\n⚠️ Les catégories restent à valider : consulte le message sous leur sélection.';
    fin.type = 'ko';
  }
  afficherMessage(message, fin.texte, fin.type);
}

/* --------------------------------------------------------------------------
   CONTACTS & SÉCURITÉ (référent tournoi, poste de secours, référent sécurité)
   — paramètres globaux de Config destinés au futur dossier club.
   -------------------------------------------------------------------------- */

/**
 * Normalise un numéro de téléphone : espaces, points et tirets retirés.
 * Renvoie les 10 chiffres, ou '' si le résultat n'est pas un numéro à 10 chiffres.
 * (Même règle que le backend, pour refuser AVANT l'envoi et guider la correction.)
 */
function normaliserTelephone(valeur) {
  const chiffres = String(valeur || '').replace(/[\s.\-]/g, '');
  return /^\d{10}$/.test(chiffres) ? chiffres : '';
}

/** Pré-remplit le formulaire Contacts & sécurité avec ce qui est déjà enregistré. */
function majContactsSecurite() {
  const form = document.getElementById('form-contacts-securite');
  if (!form) return;
  // ⭐ Sans perte de saisie (lot « Inviter un club », 2ᵉ passage) : un brouillon ou le focus ne sont pas écrasés.
  if (typeof remplirCarteSansBrouillon === 'function' && !remplirCarteSansBrouillon('contacts', function () {})) return;
  const g = configCourante.global || {};
  form.referent_nom.value = g.referent_nom || '';
  form.referent_tel.value = g.referent_tel || '';
  form.securite_secours_oui.checked = String(g.securite_secours_oui).toLowerCase() === 'oui';
  form.securite_secours_precisions.value = g.securite_secours_precisions || '';
  // Référent sécurité identique au référent tournoi PAR DÉFAUT : seul 'non' décoche.
  form.securite_referent_identique.checked =
    String(g.securite_referent_identique || 'oui').toLowerCase() !== 'non';
  form.securite_referent_nom.value = g.securite_referent_nom || '';
  form.securite_referent_tel.value = g.securite_referent_tel || '';
  majAffichageContacts(form);
  // Formulaire (re)rempli avec l'état ENREGISTRÉ → référence pour le détecteur
  // de « modifications non enregistrées » de l'assistant.
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
  if (typeof noterBaseCarte === 'function') noterBaseCarte('contacts');
}

/** Révèle / masque les champs conditionnels selon les cases à cocher. */
function majAffichageContacts(form) {
  document.getElementById('ligne-secours-precisions').hidden = !form.securite_secours_oui.checked;
  document.getElementById('lignes-referent-securite').hidden = form.securite_referent_identique.checked;
}

/** Cases à cocher du formulaire Contacts & sécurité : met à jour l'affichage conditionnel. */
function onContactsChange(evenement) {
  const nom = evenement.target.name;
  if (nom === 'securite_secours_oui' || nom === 'securite_referent_identique') {
    majAffichageContacts(document.getElementById('form-contacts-securite'));
  }
}

/** Lit les valeurs du formulaire Contacts & sécurité (booléens rangés en 'oui'/'non'). */
function lireContactsSecurite() {
  const form = document.getElementById('form-contacts-securite');
  return {
    referent_nom:                form.referent_nom.value.trim(),
    referent_tel:                form.referent_tel.value.trim(),
    securite_secours_oui:        form.securite_secours_oui.checked ? 'oui' : 'non',
    securite_secours_precisions: form.securite_secours_precisions.value.trim(),
    securite_referent_identique: form.securite_referent_identique.checked ? 'oui' : 'non',
    securite_referent_nom:       form.securite_referent_nom.value.trim(),
    securite_referent_tel:       form.securite_referent_tel.value.trim()
  };
}

/** Enregistre les contacts & sécurité (avec validation des téléphones : 10 chiffres). */
async function onEnregistrerContacts() {
  const message = document.getElementById('message-contacts-securite');
  const bouton = document.getElementById('bouton-enregistrer-contacts');
  const data = lireContactsSecurite();

  // Téléphones : espaces, points et tirets acceptés à la saisie, retirés à l'enregistrement.
  const tels = [['referent_tel', 'Référent tournoi'], ['securite_referent_tel', 'Référent sécurité']];
  for (let i = 0; i < tels.length; i++) {
    const cle = tels[i][0];
    if (!data[cle]) continue; // champ vide = optionnel, accepté
    const norme = normaliserTelephone(data[cle]);
    if (!norme) {
      afficherMessage(message, '⚠️ Téléphone « ' + tels[i][1] + ' » invalide : 10 chiffres attendus.', 'ko');
      return;
    }
    data[cle] = norme;
  }

  if (typeof enregistrerCarteConfig === 'function') {
    return enregistrerCarteConfig({ cle: 'contacts', action: 'enregistrerContactsSecurite', data: data, bouton: bouton,
      message: message, texteOk: '✅ Contacts & sécurité enregistrés.', apres: function () {
        majContactsSecurite(); // numéros normalisés ré-affichés — sauf frappe faite pendant l'envoi, qui reste un brouillon
        majDossier();          // les sections Sécurité / Contact du dossier suivent
      } });
  }
  await avecBoutonOccupe(bouton, message, async function () {
    await ecrireAdmin('enregistrerContactsSecurite', data);
    configCourante.global = Object.assign({}, configCourante.global, data);
    majContactsSecurite(); // ré-affiche les numéros normalisés + reprend la photo « propre »
    majDossier();          // les sections Sécurité / Contact du dossier suivent
    afficherMessage(message, '✅ Contacts & sécurité enregistrés.', 'ok');
  });
}

/* --------------------------------------------------------------------------
   PHASE 1 — carte « Sur place » (buvette / sandwich / boutique / repas / goûter)
   et carte « Réponse à l'invitation » (date limite + contact référent).
   -------------------------------------------------------------------------- */

/** Pré-remplit la carte « Sur place » avec l'état enregistré. */
function majSurPlace() {
  const form = document.getElementById('form-surplace');
  if (!form) return;
  if (typeof remplirCarteSansBrouillon === 'function' && !remplirCarteSansBrouillon('surplace', function () {})) return;
  const g = configCourante.global || {};
  form.buvette_disponible.checked = estOui(g.buvette_disponible);
  form.espace_sandwich_disponible.checked = estOui(g.espace_sandwich_disponible);
  form.boutique_disponible.checked = estOui(g.boutique_disponible);
  form.repas_sur_place_oui.checked = estOui(g.repas_sur_place_oui);
  Array.from(form.querySelectorAll('[name="repas_sur_place_mode"]')).forEach(function (radio) {
    radio.checked = radio.value === String(g.repas_sur_place_mode || '');
  });
  form.repas_sur_place_montant.value = g.repas_sur_place_montant || '';
  form.gouter_fin_tournoi_oui.checked = estOui(g.gouter_fin_tournoi_oui);
  Array.from(form.querySelectorAll('[name="gouter_fin_tournoi_mode"]')).forEach(function (radio) {
    radio.checked = radio.value === String(g.gouter_fin_tournoi_mode || '');
  });
  form.gouter_fin_tournoi_montant.value = g.gouter_fin_tournoi_montant || '';
  majAffichageOptionsSurPlace();
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
  if (typeof noterBaseCarte === 'function') noterBaseCarte('surplace');
}

/** Affiche les options des repas/goûters, puis le montant uniquement pour le tarif par personne. */
function majAffichageOptionsSurPlace() {
  const form = document.getElementById('form-surplace');
  if (!form) return;
  [
    ['repas_sur_place', 'options-repas-sur-place', 'champ-repas-sur-place-montant'],
    ['gouter_fin_tournoi', 'options-gouter-fin-tournoi', 'champ-gouter-fin-tournoi-montant']
  ].forEach(function (definition) {
    const prefixe = definition[0];
    const actif = form[prefixe + '_oui'].checked;
    const options = document.getElementById(definition[1]);
    const montant = document.getElementById(definition[2]);
    const mode = String(form[prefixe + '_mode'].value || '');
    if (options) options.hidden = !actif;
    if (montant) montant.hidden = !actif || mode !== 'prix_personne';
  });
}

/** Lit et valide une prestation tarifée de la carte « Sur place ». */
function lirePrestationSurPlace(form, prefixe, libelle) {
  const actif = form[prefixe + '_oui'].checked;
  const mode = actif ? String(form[prefixe + '_mode'].value || '') : '';
  const modes = ['prix_personne', 'compris_inscription', 'offert_organisateur'];
  if (actif && modes.indexOf(mode) === -1) {
    return { erreur: '⚠️ Choisis la modalité ' + libelle + '.' };
  }
  const montantBrut = String(form[prefixe + '_montant'].value || '').trim().replace(',', '.');
  const montant = mode === 'prix_personne' ? montantBrut : '';
  if (mode === 'prix_personne' && (!/^\d+(?:\.\d{1,2})?$/.test(montant) || Number(montant) <= 0)) {
    return { erreur: '⚠️ Indique un montant par personne supérieur à 0 pour ' + libelle + '.' };
  }
  return { actif: actif, mode: mode, montant: montant };
}

/** Enregistre la carte « Sur place ». Un repas ou goûter actif exige une modalité complète et cohérente. */
async function onEnregistrerSurPlace() {
  const message = document.getElementById('message-surplace');
  const bouton = document.getElementById('bouton-enregistrer-surplace');
  const form = document.getElementById('form-surplace');
  const repas = lirePrestationSurPlace(form, 'repas_sur_place', 'du repas');
  if (repas.erreur) { afficherMessage(message, repas.erreur, 'ko'); return; }
  const gouter = lirePrestationSurPlace(form, 'gouter_fin_tournoi', 'du goûter de fin de tournoi');
  if (gouter.erreur) { afficherMessage(message, gouter.erreur, 'ko'); return; }
  const data = {
    buvette_disponible:         form.buvette_disponible.checked ? 'oui' : 'non',
    espace_sandwich_disponible: form.espace_sandwich_disponible.checked ? 'oui' : 'non',
    boutique_disponible:        form.boutique_disponible.checked ? 'oui' : 'non',
    repas_sur_place_oui:        repas.actif ? 'oui' : 'non',
    repas_sur_place_mode:       repas.mode,
    repas_sur_place_montant:    repas.montant,
    gouter_fin_tournoi_oui:     gouter.actif ? 'oui' : 'non',
    gouter_fin_tournoi_mode:    gouter.mode,
    gouter_fin_tournoi_montant: gouter.montant
  };
  if (typeof enregistrerCarteConfig === 'function') {
    return enregistrerCarteConfig({ cle: 'surplace', action: 'enregistrerSurPlace', data: data, bouton: bouton, message: message,
      texteOk: '✅ « Sur place » enregistré. Le suivi de démonstration suit les tarifs sauvegardés.', apres: function (resultat) {
        majApercuInvitation(); // l'aperçu de l'email suit (ligne « Sur place »)
        appliquerSuiviTarifsEnregistres(resultat);
      } });
  }
  await avecBoutonOccupe(bouton, message, async function () {
    const resultat = await ecrireAdmin('enregistrerSurPlace', data);
    configCourante.global = Object.assign({}, configCourante.global, data);
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
    majApercuInvitation(); // l'aperçu de l'email suit (ligne « Sur place »)
    appliquerSuiviTarifsEnregistres(resultat);
    afficherMessage(message, '✅ « Sur place » enregistré. Le suivi de démonstration suit les tarifs sauvegardés.', 'ok');
  });
}

/** Pré-remplit la carte « Réponse à l'invitation » avec l'état enregistré. */
function majReponse() {
  const form = document.getElementById('form-reponse');
  if (!form) return;
  if (typeof remplirCarteSansBrouillon === 'function' && !remplirCarteSansBrouillon('reponse', function () {})) return;
  const g = configCourante.global || {};
  form.date_limite_reponse.value = g.date_limite_reponse || '';
  form.contact_reponse_nom.value = g.contact_reponse_nom || '';
  form.contact_reponse_tel.value = g.contact_reponse_tel || '';
  form.contact_reponse_email.value = g.contact_reponse_email || '';
  form.email_expediteur.value = g.email_expediteur || '';
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
  if (typeof noterBaseCarte === 'function') noterBaseCarte('reponse');
}

/** Rappel visuel « au moins un des deux » (tél / email) au blur des champs de contact. */
function onReponseBlur(evenement) {
  const nom = evenement.target && evenement.target.name;
  if (nom !== 'contact_reponse_tel' && nom !== 'contact_reponse_email') return;
  const form = document.getElementById('form-reponse');
  const message = document.getElementById('message-reponse');
  const tel = form.contact_reponse_tel.value.trim();
  const email = form.contact_reponse_email.value.trim();
  if (!tel && !email) {
    afficherMessage(message, 'ℹ️ Renseigne au moins un contact : téléphone ou email.', 'ko');
  } else if (message.textContent.indexOf('au moins un contact') !== -1) {
    afficherMessage(message, '', 'ok'); // efface le rappel une fois un contact saisi
  }
}

/**
 * Enregistre la carte « Réponse à l'invitation ». Validation côté client (miroir du backend) :
 * date AAAA-MM-JJ, téléphone 10 chiffres, emails valides, et AU MOINS un contact (tél OU email).
 */
async function onEnregistrerReponse() {
  const message = document.getElementById('message-reponse');
  const bouton = document.getElementById('bouton-enregistrer-reponse');
  const form = document.getElementById('form-reponse');
  const data = {
    date_limite_reponse:   form.date_limite_reponse.value,
    contact_reponse_nom:   form.contact_reponse_nom.value.trim(),
    contact_reponse_tel:   form.contact_reponse_tel.value.trim(),
    contact_reponse_email: form.contact_reponse_email.value.trim(),
    email_expediteur:      form.email_expediteur.value.trim()
  };

  // Validation « au moins un des deux » AVANT l'envoi (message immédiat, pas d'aller-retour).
  if (!data.contact_reponse_tel && !data.contact_reponse_email) {
    afficherMessage(message, '⚠️ Renseigne au moins un contact de réponse : téléphone OU email.', 'ko');
    return;
  }
  if (data.contact_reponse_tel) {
    const norme = normaliserTelephone(data.contact_reponse_tel);
    if (!norme) {
      afficherMessage(message, '⚠️ Téléphone du contact invalide : 10 chiffres attendus.', 'ko');
      return;
    }
    data.contact_reponse_tel = norme;
  }
  const emailInvalide = function (v) { return v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); };
  if (emailInvalide(data.contact_reponse_email)) {
    afficherMessage(message, '⚠️ Email du contact invalide.', 'ko');
    return;
  }
  if (emailInvalide(data.email_expediteur)) {
    afficherMessage(message, '⚠️ Email expéditeur invalide.', 'ko');
    return;
  }

  if (typeof enregistrerCarteConfig === 'function') {
    return enregistrerCarteConfig({ cle: 'reponse', action: 'enregistrerReponseInvitation', data: data, bouton: bouton,
      message: message, texteOk: '✅ « Réponse à l\'invitation » enregistrée.', apres: function () {
        majReponse();          // numéro normalisé ré-affiché — sauf frappe faite pendant l'envoi
        majApercuInvitation(); // l'aperçu de l'email suit (date limite de réponse)
      } });
  }
  await avecBoutonOccupe(bouton, message, async function () {
    await ecrireAdmin('enregistrerReponseInvitation', data);
    configCourante.global = Object.assign({}, configCourante.global, data);
    majReponse(); // ré-affiche le numéro normalisé
    majApercuInvitation(); // l'aperçu de l'email suit (date limite de réponse)
    afficherMessage(message, '✅ « Réponse à l\'invitation » enregistrée.', 'ok');
  });
}

/* Le sous-système « Invitation & clubs invités » (aperçu email + envoi, dossier d'invitation,
   liste/édition des clubs invités) est désormais dans admin-invitations.js — chargé après
   admin.js dans admin.html. Extrait tel quel, sans changement de comportement. */

/* --------------------------------------------------------------------------
   DOSSIER CLUB — état des sections du dossier (page dossier-club.html)
   -------------------------------------------------------------------------- */

/**
 * Affiche, dans la carte « Dossier club », quelles sections du dossier apparaîtront
 * avec les données actuelles (les sections vides sont masquées à la génération).
 * Pur affichage informatif : rien n'est bloquant, le dossier se génère toujours.
 */
function majDossier() {
  const zone = document.getElementById('etat-dossier');
  if (!zone) return;
  const g = configCourante.global || {};
  const cats = (configCourante.categories || []).filter(estPresente);
  const oui = function (v) { return String(v || '').toLowerCase() === 'oui'; };

  const sections = [
    ['Présentation', !!(g.tournoi_nom || g.tournoi_description)],
    ['Infos pratiques (lieu, adresse)', !!(g.tournoi_lieu || g.tournoi_adresse)],
    ['Programme (RDV, coup d\'envoi, pause, fin)', !!(g.heure_rdv || g.heure_debut || g.pause_dejeuner_debut || g.heure_fin_communiquee)],
    ['Format sportif (' + cats.length + ' catégorie' + (cats.length > 1 ? 's' : '') + ')', cats.length > 0],
    ['Modalités d\'inscription (date limite de paiement, tarif)', !!(g.date_limite_confirmation || oui(g.tarif_engagement_oui))],
    ['Parking & accès (texte, photo)', !!(g.parking_texte || g.parking_photo_id)],
    ['Encadrement & assurance', !!(g.encadrement_ratio || g.encadrement_diplomes || oui(g.assurance_attestation_requise))],
    ['Sécurité (poste de secours, référent)', oui(g.securite_secours_oui) || !!(g.referent_nom || g.securite_referent_nom)],
    ['Contact (référent tournoi)', !!(g.referent_nom || g.referent_tel)],
    ['Agenda .ics / itinéraire', !!(g.tournoi_date && (g.tournoi_adresse || g.tournoi_lieu))]
  ];

  zone.innerHTML = '<ul class="dossier-etat">' + sections.map(function (s) {
    return '<li class="' + (s[1] ? 'est-ok' : 'est-vide') + '">' +
      (s[1] ? '✅ ' : '⚪️ ') + echapper(s[0]) +
      (s[1] ? '' : ' <span class="dossier-etat-note">(sera masqué)</span>') + '</li>';
  }).join('') + '</ul>';

  majApercuDossier();
  if (typeof majApercuDossierEmail === 'function') majApercuDossierEmail();
}

/**
 * Aperçu du dossier : le CHOIX D'UN CLUB, puis « Ouvrir l'aperçu ».
 *
 * Il y avait avant un lien fixe vers `dossier-club.html?admin=1`, sans club ni jeton. Il a cessé
 * de fonctionner le jour où le dossier est passé SOUS JETON (les contacts jour J, le parking et
 * les secours ne sortent plus sans lien personnel) : la page répondait « Ce lien de dossier n'est
 * plus valide ou incomplet », ce qui ressemble à une panne alors que c'est la sécurité qui parle.
 * Un aperçu « générique » ne peut donc PAS exister — et tant mieux : ce que tu veux relire avant
 * d'envoyer, c'est le dossier tel que le club le recevra, avec son nom et ses catégories.
 *
 * Sans aucun club invité, on ne propose pas un bouton mort : on dit quoi faire.
 */
function majApercuDossier() {
  const zone = document.getElementById('ligne-apercu-dossier');
  if (!zone) return;

  // Un club n'est prévisualisable que s'il a un JETON (colonne club_token) : c'est lui qui ouvre
  // les sections protégées. Les clubs acceptés d'abord — ce sont eux qui reçoivent un dossier.
  const clubs = (typeof clubsInvitesCourants !== 'undefined' ? (clubsInvitesCourants || []) : [])
    .filter(function (c) { return String(c.club_nom || '').trim() && String(c.club_token || '').trim(); })
    .slice()
    .sort(function (a, b) {
      const aa = estAccepte(a.statut) ? 0 : 1, bb = estAccepte(b.statut) ? 0 : 1;
      return (aa - bb) || String(a.club_nom).localeCompare(String(b.club_nom), 'fr');
    });

  if (!clubs.length) {
    zone.innerHTML = '<p class="note-generation">👉 L\'aperçu ouvre le dossier <strong>d\'un club</strong> ' +
      '(son nom, ses catégories, ses contacts jour J) : ajoute d\'abord un club dans ' +
      '<strong>« Clubs invités »</strong>. Il n\'existe pas d\'aperçu sans club — le dossier est ' +
      'protégé par le <strong>lien personnel</strong> de chacun.</p>';
    return;
  }

  zone.innerHTML =
    '<label class="dossier-apercu-lib" for="dossier-apercu-club">Aperçu du dossier de</label>' +
    '<select class="r-input" id="dossier-apercu-club">' +
      clubs.map(function (c) {
        const nom = String(c.club_nom).trim();
        return '<option value="' + echapper(nom) + '">' + echapper(nom) +
          (estAccepte(c.statut) ? '' : ' (' + echapper(String(c.statut || 'invité')) + ')') + '</option>';
      }).join('') +
    '</select>' +
    '<button type="button" class="bouton" id="bouton-ouvrir-dossier" data-ic="dossier">Ouvrir l\'aperçu</button>';
}

/** Clic dans la carte « Dossier » : ouvre le dossier du club choisi, en mode admin (?admin=1
 *  révèle le bandeau « aperçu avant envoi » et le retour à l'administration). */
function onClicApercuDossier(evenement) {
  if (!evenement.target || evenement.target.id !== 'bouton-ouvrir-dossier') return;
  const select = document.getElementById('dossier-apercu-club');
  const nom = select ? select.value : '';
  const club = (clubsInvitesCourants || []).find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;
  const url = new URL(lienDossierClub(String(club.club_nom || ''), String(club.club_token || '')));
  url.searchParams.set('admin', '1');
  window.open(url.toString(), '_blank', 'noopener');
}

/* --------------------------------------------------------------------------
   PUBLICATION (rendre le tournoi visible ou non sur la page publique)
   -------------------------------------------------------------------------- */

/* ⏱️ LES DÉLAIS DE CET ÉCRAN — et pourquoi il en manquait.
 *
 * 🔬 LE DÉFAUT FERMÉ (lot « Publication »). Tous les autres écrans de l'administration bornent leurs
 * appels (`DELAI_ECRITURE_HORAIRES_MS`, `DELAI_ECRITURE_TERRAINS_MS`, `DELAI_LECTURE_CLUBS_MS`…).
 * Celui-ci, non : `onPublier` et les gestes de la table de marque appelaient `ecrireAdmin` SANS
 * options, et `chargerAccesScores` appelait `apiPostProtege` de même. Un serveur muet laissait donc
 * le bouton « Publier » grisé sur « Publication… » INDÉFINIMENT, et la carte de la table de marque
 * vide, sans message — constaté au banc : après l'équivalent de 400 s, rien ne se dénouait.
 *
 * ⚠️ DEUX NOMBRES QUI NE DISENT PAS LA MÊME CHOSE, même règle qu'à la « Demande d'autorisation » :
 * `delaiMs` borne UNE TENTATIVE, `budgetMs` borne l'ATTENTE TOTALE. `getAccesScoresAdmin` est une
 * LECTURE rejouable (liste fermée d'api.js) : sans budget, deux tentatives de 20 s auraient fait
 * patienter 40 s pour un écran qui en annonce 20. Les ÉCRITURES, elles, ne sont jamais rejouées —
 * un seul nombre leur suffit.
 * ⛔ Un délai côté navigateur n'ANNULE PAS l'exécution Apps Script : elle se poursuit chez Google.
 * C'est exactement pourquoi un délai dépassé sur une ÉCRITURE est traité comme un résultat
 * INCONNU — jamais comme un échec certain (voir `messageInconnuPublication`).
 */
const DELAI_ECRITURE_PUBLICATION_MS = 30000;
const DELAI_LECTURE_ACCES_SCORES_MS = 20000;
const BUDGET_LECTURE_ACCES_SCORES_MS = 20000;

/**
 * ⭐ L'ISSUE EST-ELLE INCONNUE ? Vrai pour un délai dépassé, une panne réseau ou une erreur HTTP :
 * la requête a pu aboutir CHEZ GOOGLE sans que sa réponse revienne. Faux pour un refus LISIBLE du
 * serveur (`{ error }`, que `apiPost` attache à l'erreur) : là, le serveur a parlé, et il a dit non.
 * ⛔ La distinction n'est pas cosmétique : une réponse perdue annoncée « ⚠️ échec » pousse
 *   l'organisateur à recliquer, donc à réécrire. Même doctrine que `issueIncertaine`
 *   (admin-invitations.js) ; ⛔ pas la même fonction, parce que celle-là nomme le délai des
 *   invitations dans son message — un partage aurait fait mentir l'un des deux écrans.
 */
function issueInconnuePublication(erreur) {
  return !(erreur && erreur.reponse && typeof erreur.reponse === 'object');
}

/** La cause lisible d'une issue inconnue. */
function causeInconnuePublication(erreur, delaiMs) {
  if (erreur && erreur.name === 'AbortError') {
    return 'délai de ' + Math.round((erreur.delaiMs || delaiMs || DELAI_ECRITURE_PUBLICATION_MS) / 1000) + ' s dépassé';
  }
  return String((erreur && erreur.message) || 'erreur réseau').replace(/\.$/, '');
}

/** « ⚠️ Réponse du serveur non reçue (cause) : <quoi>. Rien n'est réémis automatiquement ; <suite>. » */
function messageInconnuPublication(quoi, erreur, suite) {
  return '⚠️ Réponse du serveur non reçue (' + causeInconnuePublication(erreur) + ') : ' + quoi +
    '. Rien n’est réémis automatiquement' + (suite ? ' ; ' + suite : '') + '.';
}

/** Vrai si le tournoi est actuellement publié (visible du public). */
function estPublie() {
  return String(configCourante.global && configCourante.global.tournoi_publie).toLowerCase() === 'oui';
}

/**
 * Peint l'ÉTAT de publication — la pastille de la tête de carte, ou la phrase complète.
 * ⭐ Séparée de `majPublication()` parce que l'écran refondu la repeint APRÈS avoir déplacé
 *    les blocs : à ce moment-là, relancer `majPublication()` entière relancerait aussi la
 *    lecture de l'accès scores, donc un appel réseau de plus à chaque ouverture.
 * ⛔ Aucune lecture, aucune écriture : cette fonction ne fait que dire ce qui est déjà su.
 */
function majEtatPublicationAffiche() {
  const etat = document.getElementById('etat-publication');
  if (!etat) return;
  const publie = estPublie();
  // Le MÊME <strong> sert les deux mises en page : pastille courte quand l'écran l'a posé dans
  // une tête de carte, phrase complète dans le repli sans JavaScript, qui n'a pas de carte
  // pour porter le contexte.
  if (etat.classList.contains('cv-pastille')) {
    etat.textContent = publie ? '✓ Publié' : 'Non publié';
    etat.className = 'cv-pastille ' + (publie ? 'cv-succes' : 'cv-neutre');
  } else {
    etat.textContent = publie ? '🟢 Publié (visible du public)'
                              : '⚪️ Non publié (les visiteurs voient « à venir »)';
  }
  const intro = document.getElementById('cv-pub-intro');
  if (intro) {
    intro.textContent = publie
      ? 'La page publique est en ligne. Vous pouvez la partager avec les clubs, les parents et le public.'
      : 'La page publique existe déjà à cette adresse : les visiteurs y voient l’écran « à venir » '
        + 'tant que le tournoi n’est pas publié. Vous pouvez la communiquer dès maintenant.';
  }
}

/**
 * Met à jour l'état affiché et le libellé du bouton selon la publication en cours.
 *
 * ⛔ AUCUNE LECTURE, AUCUNE ÉCRITURE : cette fonction PEINT ce que la page sait déjà.
 *
 * 🔬 CE QUI A CHANGÉ, ET POURQUOI C'EST LE CŒUR DU LOT « PUBLICATION ». Elle appelait
 * `chargerAccesScores()` — donc une requête `getAccesScoresAdmin` (8 lectures, 4 047 cellules).
 * Or elle est appelée à l'OUVERTURE de l'administration (`chargerAdmin`), à chaque « Rafraîchir »
 * (`rechargerEtRendre`) et après CHAQUE publication ou masquage (`onPublier`) — alors que publier
 * ne change strictement RIEN à l'accès de la table de marque. Une lecture accrochée à un repeint
 * part autant de fois qu'on repeint.
 * ⭐ Cette lecture est devenue une RESSOURCE D'ÉCRAN (`ADMIN_RESSOURCES.accesScores`, admin.js) :
 * elle part à l'ARRIVÉE sur l'écran, une seule fois, et le retour ne coûte rien.
 * ⛔ NE JAMAIS LA REMETTRE ICI : ce serait rendre à `majPublication()` le pouvoir d'émettre des
 * requêtes, et le compte de l'écran redeviendrait imprévisible.
 */
function majPublication() {
  const etat = document.getElementById('etat-publication');
  const bouton = document.getElementById('bouton-publier');
  if (!etat || !bouton) return;
  majEtatPublicationAffiche();
  bouton.innerHTML = svgIcone('monde') + (estPublie() ? 'Masquer le tournoi' : 'Publier le tournoi');
  majAccesPublic();   // l'adresse, elle, ne dépend pas de l'état : seule la NOTE change
  majVerrouPublier(); // le GESTE, lui, reste soumis aux prérequis — mais lui SEUL
  /* ⭐ REPLI DE CACHE MÊLÉ, ET RIEN D'AUTRE — la SEULE requête que cette fonction puisse encore
     faire partir. Un navigateur peut servir un `js/admin.js` d'avant ce lot avec ce module-ci :
     ils portent la MÊME version d'URL (⛔ ce lot ne change pas la version de cache), donc leurs
     deux entrées de cache expirent indépendamment. Cet `admin.js`-là ne connaît pas l'étape
     « publication » : personne ne lirait l'état de l'accès, et la carte de la table de marque
     resterait sur « Connecte-toi à l'administration » — le jour du tournoi.
     ⛔ AVEC UN `admin.js` À JOUR, CETTE LIGNE NE PART JAMAIS : l'étape existe, et c'est elle qui
     lit, une seule fois, à l'arrivée sur l'écran. Le contrôle I9 de
     `tests/ecran-publication-surface.test.js` éprouve les deux cas, avec un lecteur mêlé. */
  if (!etapePublicationConnue()) chargerAccesScores();
}

/** L'`admin.js` chargé connaît-il l'étape « publication » (donc la ressource et son registre) ? */
function etapePublicationConnue() {
  return typeof ADMIN_ETAPES === 'object' && !!ADMIN_ETAPES && !!ADMIN_ETAPES.publication &&
         typeof assurerRessourceAdmin === 'function';
}

/**
 * 🔒 LE GARDE-FOU DU GESTE « PUBLIER » — et de lui seul.
 *
 * ⭐ POURQUOI CE VERROU VIT SUR LE BOUTON, ET PLUS SUR L'ÉCRAN QUI LE CONTIENT.
 * Jusqu'à PUB-2, l'écran « Publication » ne portait qu'un geste : publier. Le verrouiller
 * entier tant que la préparation n'était pas finie était donc cohérent (ecrans.js).
 * ⚠️ PUB-2 a mis dans cette MÊME carte trois choses qui ne dépendent d'aucune préparation :
 * l'ADRESSE de la page publique, « Copier » et « Ouvrir ». Le verrou d'écran les a emportées
 * avec lui — et la carte s'est mise à promettre « tu peux la communiquer dès maintenant »
 * depuis un endroit inatteignable « maintenant ». ⭐ Ce n'était pas une régression : le verrou
 * préexistait. C'était un défaut de PLACEMENT, constaté en réel le 2026-08-24.
 *
 * ⭐ CE VERROU-CI PROTÈGE MIEUX QUE CELUI QU'IL REMPLACE. Le verrou d'écran ne s'appliquait
 * qu'aux modes guidés : hors d'eux, la carte revenait dans la page longue et laissait publier
 * un tournoi vide sans rien pour le retenir. Porté par le bouton, le garde-fou suit partout —
 * barre latérale, assistant mobile, et jusqu'au repli HTML si le JavaScript ne démarre pas.
 *
 * ⛔ UNE SEULE DÉFINITION DES PRÉREQUIS. On relit `calculerEtatsEtapes()` — le « cerveau »
 * qui alimente déjà le fil « Où en suis-je ? » — avec EXACTEMENT son filtre du verdict
 * « prêt à publier » (`admin-tableau-bord.js`, majEtatAvancement) : tout ce qui n'est pas ✅,
 * sauf l'après-midi qui se génère plus tard. ⛔ Ne jamais recopier ici la liste Horaires /
 * Catégories / Équipes / Terrains / Poules : elle se déduit, elle ne se grave pas.
 *
 * ⚠️ INVARIANT, ET IL EST PLUS IMPORTANT QUE LE VERROU LUI-MÊME :
 * ⭐ **MASQUER N'EST JAMAIS GRISÉ.** Un tournoi publié dont une donnée redevient incomplète
 * (une catégorie supprimée, un planning à regénérer) verrait sinon son bouton se bloquer sur
 * « Masquer » — l'organisateur ne pourrait PLUS retirer son tournoi du public, alors même que
 * c'est le geste d'urgence. Le garde-fou porte sur PUBLIER, jamais sur le retrait.
 */
function majVerrouPublier() {
  const bouton = document.getElementById('bouton-publier');
  const zone = document.getElementById('message-verrou-publier');
  if (!bouton) return;

  // ⭐ INVARIANT : déjà publié → le bouton dit « Masquer » → TOUJOURS actif. Voir ci-dessus.
  // ⚠️ Ce test vient en PREMIER, avant toute lecture des prérequis : aucun état du tournoi ne
  // doit pouvoir emprisonner une publication en ligne.
  if (estPublie()) {
    bouton.disabled = false;
    if (zone) afficherMessage(zone, '', 'ok');
    return;
  }

  // ⚠️ Repli OUVERT (et non fermé) si le cerveau n'est pas chargé : on préfère un bouton
  // actif sans son garde-fou à un organisateur qui ne peut plus publier du tout le jour du
  // tournoi. Le fil « Où en suis-je ? » avertit de toute façon, et le geste reste confirmé
  // par un dialogue. Même précaution que `assistantMajVerrou` (assistant.js).
  const restants = (typeof calculerEtatsEtapes === 'function')
    ? calculerEtatsEtapes().filter(function (e) { return e.cle !== 'apresmidi' && e.statut !== 'fait'; })
    : [];

  bouton.disabled = restants.length > 0;
  if (zone) {
    // ⭐ La MÊME phrase que le fil d'avancement (« Avant de publier, il reste : ») : deux
    // formulations différentes pour un seul et même blocage feraient croire à deux causes.
    afficherMessage(zone, restants.length
      ? '🔒 Avant de publier, il reste : ' +
        restants.map(function (e) { return e.titre; }).join(' · ')
      : '', restants.length ? 'ko' : 'ok');
  }
}

/**
 * Affiche l'ADRESSE de la page publique, et la note qui explique ce qu'on y verra.
 *
 * ⭐ L'adresse est la MÊME dans les deux états, et les deux boutons restent ACTIFS dans les
 * deux états. Ce n'est pas une tolérance, c'est la doctrine : une adresse n'est pas une
 * autorisation. La page existe avant la publication et après le masquage — elle affiche
 * alors son écran « à venir » (frontend/js/tournoi.js, appliquerPublication).
 * ⛔ Griser les boutons quand le tournoi n'est pas publié ferait croire l'inverse.
 *
 * ⚠️ C'est EXACTEMENT l'adresse que les clubs reçoivent dans leur dossier (lien
 * « Scores en direct » + QR code) : la règle est écrite une seule fois, dans
 * `urlPagePublique` (commun.js). Deux règles auraient fini par diverger.
 */
function majAccesPublic() {
  const lien = document.getElementById('acces-public-lien');
  const note = document.getElementById('acces-public-note');
  if (!lien) return;
  const url = urlPagePublique(configCourante.global || {});
  lien.href = url;
  lien.textContent = url;
  dessinerQrPublic(url);
  if (note) {
    // ⚠️ La note dit ce que PUB-2 GARANTIT — « publier ou masquer ne touche pas à cette
    // adresse » — et RIEN de plus. ⛔ Ne pas écrire qu'elle « ne change jamais » : le
    // paramètre `url_tournoi_public` peut être modifié, et un même club organisera un jour
    // plusieurs tournois, donc plusieurs adresses. La garantie porte sur le BOUTON, pas sur
    // l'éternité de l'URL.
    note.textContent = estPublie()
      ? 'Publier ou masquer le tournoi ne change pas cette adresse. Le tournoi étant publié, ' +
        'les visiteurs y voient le tournoi en direct.'
      : 'Publier ou masquer le tournoi ne change pas cette adresse. Tu peux la communiquer dès ' +
        'maintenant. Tant que le tournoi n\'est pas publié, les visiteurs y voient l\'écran « à venir ».';
  }
  const msg = document.getElementById('message-acces-public');
  if (msg) afficherMessage(msg, '', 'ok'); // efface un « adresse copiée » devenu obsolète
  majApercuPublication();
}

/**
 * Repeint la petite carte du tournoi (affiche, nom, date, lieu, catégories).
 * ⛔ Sans effet quand la place n'existe pas — repli sans JavaScript, assistant mobile, ou
 *    appelant qui ne fournit qu'un document réduit. Même prudence que partout dans ce fichier.
 */
function majApercuPublication() {
  if (!document.querySelector) return;
  const place = document.querySelector('[data-role="apercu-publication"]');
  if (place) place.innerHTML = apercuPublicationHTML();
}

/**
 * « Copier l'adresse ». Presse-papiers du navigateur, avec le repli déjà éprouvé ailleurs
 * dans l'app (admin-invitations.js) : une petite fenêtre affiche l'adresse à copier à la main.
 * Le presse-papiers échoue légitimement (page non sécurisée, permission refusée, vieux
 * navigateur) — ce n'est pas une panne, et l'organisateur ne doit jamais rester bloqué.
 *
 * ⛔ AUCUNE écriture serveur, AUCUN appel réseau, AUCUN effet sur l'état de publication —
 * ni dans le cas qui marche, ni dans le repli.
 */
async function onCopierAdressePublique() {
  const message = document.getElementById('message-acces-public');
  const url = urlPagePublique(configCourante.global || {});
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('presse-papiers indisponible');
    await navigator.clipboard.writeText(url);
    afficherMessage(message, '✅ Adresse copiée — tu peux la coller où tu veux.', 'ok');
  } catch (e) {
    afficherMessage(message, '', 'ok'); // pas d'échec affiché : on propose la copie manuelle
    await dialogDemander('Copie automatique impossible sur cet appareil.\nSélectionne l\'adresse ci-dessous et copie-la :',
      url, { ok: 'Fermer' });
  }
}

/** « Ouvrir la page » : nouvel onglet, sans lien de contexte avec l'admin (noopener).
 *  ⛔ AUCUNE écriture serveur, AUCUN effet sur l'état de publication. */
function onOuvrirPagePublique() {
  window.open(urlPagePublique(configCourante.global || {}), '_blank', 'noopener');
}

/* ==========================================================================
   L'AFFICHE PUBLIQUE — l'aperçu de la carte, et sa vue agrandie imprimable
   --------------------------------------------------------------------------
   ⭐ CE QUE CETTE VUE SERT À FAIRE, ET C'EST UN GESTE DE TERRAIN : imprimer une
   feuille à coller à l'entrée du stade, pour que le public scanne et suive les
   scores sur son téléphone. Tout ici va dans ce sens — rien n'est décoratif.
   ⛔ AUCUNE écriture serveur, AUCUN appel réseau : la vue relit ce que la page
   connaît déjà, et le QR est dessiné en local (js/vendor/qrcode.js).
   ========================================================================== */

/* Deux pictogrammes propres à cet écran, dessinés ici comme ECRANS_ICONES le fait pour la
   barre latérale : pas de dépendance nouvelle, et ils suivent la couleur du texte. */
const PUB_ICONES = {
  calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
  lieu: '<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"></path><circle cx="12" cy="10" r="2.6"></circle>'
};
function svgPub(nom) {
  return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (PUB_ICONES[nom] || '') + '</svg>';
}

/** Tout ce que l'affiche et son aperçu montrent, lu une seule fois. */
function infosAffichePublique() {
  const g = configCourante.global || {};
  return {
    nom: String(g.tournoi_nom || '').trim() || 'Tournoi',
    date: g.tournoi_date ? formaterDateFr(g.tournoi_date) : '',
    lieu: [g.tournoi_lieu, g.tournoi_adresse].map(function (v) { return String(v == null ? '' : v).trim(); })
      .filter(Boolean),
    // ⛔ L'affiche vient du SERVEUR (`tournoi_affiche_id`) : on ne recompose jamais une image
    //    locale périmée. Vide = aucune affiche chargée dans « Infos du tournoi ».
    affiche: g.tournoi_affiche_id ? urlAffiche(g.tournoi_affiche_id, 1200) : '',
    categories: (configCourante.categories || []).filter(estPresente)
      .map(function (c) { return String(c.categorie); }),
    url: urlPagePublique(g)
  };
}

/** Le QR de la page publique, en SVG local, à la taille demandée. '' si la brique manque. */
function qrPublicSvg(url, cellule) {
  if (typeof qrcode !== 'function' || !/^https?:\/\//.test(String(url || ''))) return '';
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: cellule || 4, margin: 2 })
      .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
  } catch (e) { return ''; }
}

/**
 * La petite carte du tournoi : l'affiche chargée, puis le nom, la date, le lieu et les
 * catégories. C'est un BOUTON — on l'ouvre au clavier comme à la souris — et son nom
 * accessible dit ce qu'il fait, pas seulement ce qu'il contient.
 */
function apercuPublicationHTML() {
  const i = infosAffichePublique();
  let h = '<button type="button" class="cv-pub-carte" data-ouvrir-affiche ' +
          'aria-label="Ouvrir l’affiche de ' + echapper(i.nom) + ' en grand, pour l’imprimer">';
  h += i.affiche
    ? '<span class="cv-pub-carte-image"><img src="' + echapper(i.affiche) + '" alt=""></span>'
    : '<span class="cv-pub-carte-image est-vide"><span>Aucune affiche chargée</span></span>';
  h += '<span class="cv-pub-carte-corps"><strong class="cv-pub-carte-nom">' + echapper(i.nom) + '</strong>';
  if (i.date) h += '<span class="cv-pub-carte-ligne">' + svgPub('calendrier') + '<span>' + echapper(i.date) + '</span></span>';
  if (i.lieu.length) {
    h += '<span class="cv-pub-carte-ligne">' + svgPub('lieu') + '<span>' +
         i.lieu.map(function (l) { return echapper(l); }).join('<br>') + '</span></span>';
  }
  if (i.categories.length) {
    h += '<span class="cv-pub-carte-cats">' + i.categories.map(function (c) {
      return '<span class="cv-pastille cv-neutre">' + echapper(c) + '</span>';
    }).join('') + '</span>';
  }
  return h + '</span></button>';
}

/**
 * L'affiche telle qu'elle s'imprime : le visuel, puis un BANDEAU AJOUTÉ DESSOUS qui porte le
 * QR code et l'adresse.
 * ⭐ Le bandeau est ajouté SOUS l'affiche, jamais par-dessus : on ne sait pas ce que
 *    l'organisateur a mis en bas à droite de son visuel, et le recouvrir serait abîmer son
 *    travail sans le lui dire.
 * ⭐ Sans affiche chargée, on en COMPOSE une sobre avec ce que le tournoi sait déjà — elle
 *    s'imprime telle quelle, plutôt que de renvoyer l'organisateur en arrière.
 */
function affichePubliqueHTML() {
  const i = infosAffichePublique();
  let h = '<div class="cv-affiche-papier" data-role="affiche-papier">';
  if (i.affiche) {
    h += '<img class="cv-affiche-image" src="' + echapper(i.affiche) + '" alt="Affiche de ' + echapper(i.nom) + '">';
  } else {
    h += '<div class="cv-affiche-composee"><strong>' + echapper(i.nom) + '</strong>';
    if (i.date) h += '<span class="cv-affiche-date">' + echapper(i.date) + '</span>';
    if (i.lieu.length) h += '<span class="cv-affiche-lieu">' + i.lieu.map(function (l) { return echapper(l); }).join('<br>') + '</span>';
    if (i.categories.length) {
      h += '<span class="cv-affiche-cats">' + i.categories.map(function (c) {
        return '<span>' + echapper(c) + '</span>';
      }).join('') + '</span>';
    }
    h += '</div>';
  }
  const qr = qrPublicSvg(i.url, 6);
  h += '<div class="cv-affiche-bandeau">' +
       '<div class="cv-affiche-qr">' + (qr || '<span class="cv-affiche-qr-absent">QR indisponible</span>') + '</div>' +
       '<div class="cv-affiche-mots"><strong>Scannez pour suivre le tournoi en direct</strong>' +
       '<span>Planning, résultats et classements, mis à jour pendant la journée.</span>' +
       '<code>' + echapper(i.url) + '</code></div></div>';
  return h + '</div>';
}

/* La vue agrandie vit directement dans <body> : l'impression n'a ainsi qu'un seul élément à
   garder, sans dépendre de l'endroit où le mode guidé a déplacé la carte. */
let afficheVueDeclencheur = null;

/* Échap referme la vue. ⛔ POSÉ À L'OUVERTURE, jamais au chargement du module : un
   `document.addEventListener` à la racine s'exécute dès que le fichier est lu, et impose
   à tout appelant — y compris aux suites de tests, qui simulent un DOM réduit — d'avoir
   un document complet. Trois suites sont tombées là-dessus avant cette correction. */
function afficheEchap(e) {
  if (e.key === 'Escape') fermerAffichePublique();
}

/** Ouvre l'affiche en grand, par-dessus l'écran. Échap, la croix ou le fond la referment. */
function ouvrirAffichePublique(declencheur) {
  fermerAffichePublique();
  afficheVueDeclencheur = declencheur || null;
  const vue = document.createElement('div');
  vue.id = 'cv-affiche-vue';
  vue.className = 'cv-affiche-vue';
  vue.setAttribute('role', 'dialog');
  vue.setAttribute('aria-modal', 'true');
  vue.setAttribute('aria-label', 'Affiche du tournoi');
  vue.innerHTML = '<div class="cv-affiche-barre">' +
      '<button type="button" class="bouton" data-imprimer-affiche>' + svgIcone('imprimante') + 'Imprimer l’affiche</button>' +
      '<button type="button" class="bouton bouton-doux" data-fermer-affiche>Fermer</button>' +
    '</div>' + affichePubliqueHTML();
  vue.addEventListener('click', function (e) {
    if (e.target.closest('[data-imprimer-affiche]')) { imprimerAffichePublique(); return; }
    // Le fond referme, comme partout : le « papier » lui-même ne referme pas sous le doigt.
    if (e.target.closest('[data-fermer-affiche]') || e.target === vue) fermerAffichePublique();
  });
  document.addEventListener('keydown', afficheEchap);
  document.body.appendChild(vue);
  document.body.classList.add('cv-affiche-ouverte');
  const premier = vue.querySelector('[data-imprimer-affiche]');
  if (premier && premier.focus) premier.focus();
}


/** Referme la vue et rend le focus au bouton qui l'avait ouverte. */
function fermerAffichePublique() {
  const vue = document.getElementById('cv-affiche-vue');
  if (document.removeEventListener) document.removeEventListener('keydown', afficheEchap);
  if (vue) vue.remove();
  document.body.classList.remove('cv-affiche-ouverte');
  if (afficheVueDeclencheur && afficheVueDeclencheur.focus) afficheVueDeclencheur.focus();
  afficheVueDeclencheur = null;
}

/**
 * Envoie l'affiche à l'impression. ⭐ Pas de fenêtre séparée : les bloqueurs de fenêtres la
 * suppriment sans rien dire. On marque le <body>, la feuille d'impression ne garde que
 * l'affiche, et on retire la marque une fois l'impression rendue ou annulée.
 */
function imprimerAffichePublique() {
  if (!document.getElementById('cv-affiche-vue')) return;
  document.body.classList.add('cv-impression-affiche');
  const nettoyer = function () {
    document.body.classList.remove('cv-impression-affiche');
    window.removeEventListener('afterprint', nettoyer);
  };
  window.addEventListener('afterprint', nettoyer);
  try { window.print(); } catch (e) { /* impression indisponible : la vue reste ouverte */ }
  // Repli : certains navigateurs n'émettent pas `afterprint`.
  setTimeout(nettoyer, 1500);
}

/** Dessine localement le QR de la page publique, sans service ni requête distante. */
function dessinerQrPublic(url) {
  const conteneur = document.getElementById('acces-public-qr');
  if (!conteneur || typeof qrcode !== 'function' || !/^https?:\/\//.test(String(url || ''))) return;
  conteneur.hidden = false;
  conteneur.setAttribute('data-url', url);
  const ancien = conteneur.querySelector('svg');
  if (ancien && conteneur.getAttribute('data-qr') === url) return;
  if (ancien) ancien.remove();
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 4, margin: 8 })
      .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
    conteneur.insertAdjacentHTML('afterbegin', svg);
    conteneur.setAttribute('data-qr', url);
  } catch (e) {
    conteneur.hidden = true;
  }
}

/** Fabrique un PNG net du QR directement dans un canvas local. */
function creerBlobQrPng(url) {
  return new Promise(function (resoudre, rejeter) {
    try {
      if (typeof qrcode !== 'function') throw new Error('générateur QR indisponible');
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const modules = qr.getModuleCount();
      const marge = 4;
      const echelle = Math.max(8, Math.floor(640 / (modules + marge * 2)));
      const taille = (modules + marge * 2) * echelle;
      const canvas = document.createElement('canvas');
      canvas.width = taille;
      canvas.height = taille;
      const dessin = canvas.getContext('2d');
      if (!dessin || typeof canvas.toBlob !== 'function') throw new Error('conversion PNG indisponible');
      dessin.fillStyle = '#ffffff';
      dessin.fillRect(0, 0, taille, taille);
      dessin.fillStyle = '#000000';
      for (let ligne = 0; ligne < modules; ligne++) {
        for (let colonne = 0; colonne < modules; colonne++) {
          if (qr.isDark(ligne, colonne)) {
            dessin.fillRect((colonne + marge) * echelle, (ligne + marge) * echelle, echelle, echelle);
          }
        }
      }
      canvas.toBlob(function (blob) {
        if (blob) resoudre(blob);
        else rejeter(new Error('création PNG impossible'));
      }, 'image/png');
    } catch (erreur) {
      rejeter(erreur);
    }
  });
}

/** Copie un QR comme véritable image PNG pour le coller dans un document. */
async function copierQrImage(url, message) {
  try {
    if (!url) throw new Error('QR code indisponible');
    if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' ||
        typeof ClipboardItem === 'undefined') throw new Error('copie d’image indisponible');
    const png = await creerBlobQrPng(url);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    afficherMessage(message, '✅ QR code copié comme image PNG — tu peux le coller dans un document.', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ Impossible de copier le QR code comme image sur ce navigateur.', 'ko');
  }
}

function onCopierQrPublic() {
  const qr = document.getElementById('acces-public-qr');
  return copierQrImage(qr ? qr.getAttribute('data-url') : '', document.getElementById('message-acces-public'));
}

function onCopierQrSaisie() {
  const qr = document.getElementById('acces-saisie-qr');
  return copierQrImage(qr ? qr.getAttribute('data-url') : '', document.getElementById('message-acces-saisie'));
}

/* --------------------------------------------------------------------------
   L'ACCÈS À LA TABLE DE MARQUE (UX-ACCES-SCORES-DR-5E, raccordé par IMPL-RACCORDEMENT-ACCES-SCORES-DR-5R)

   ⭐ CE QUI A CHANGÉ AVEC 5R. Le lot 5E fabriquait ici une adresse GÉNÉRIQUE (`saisie.html`), la
   même pour tous les tournois et valable pour toujours. ⛔ Elle n'existe plus. Le lien vient du
   SERVEUR (`getAccesScoresAdmin`), propre à l'édition, et seulement quand un accès est préparé ;
   le QR code est dessiné en local à partir de ce seul lien.

   ⛔ CE QUE CE CODE NE FAIT PAS, et chaque ligne y veille :
     · aucun changement d'état décidé par le navigateur : chaque geste part d'un clic, et la rotation, la
       pause et la clôture passent par une confirmation explicite. ⭐ CORR-ACCES-45MIN-DEMO : la fermeture
       automatique (45 min après la fin prévue, ou après une reprise) est calculée par le SERVEUR ; l'écran
       ne fait qu'afficher son échéance, ou dire qu'elle n'est pas calculable — ⛔ jamais la recalculer ;
     · aucune clé dans le lien ou le QR (la page de saisie demande la clé scores pour elle-même) ;
     · aucune lecture avant la connexion admin, et jamais de fenêtre de clé ouverte spontanément ;
     · aucun réessai automatique d'une écriture : une panne se montre, l'organisateur décide.
   -------------------------------------------------------------------------- */

const ACCES_SCORES_LIBELLES_ETAT = {
  ABSENT: 'Aucun accès — le lien n\'existe pas encore',
  PREPARE: 'Préparé — le lien existe, mais la saisie est fermée',
  OUVERT: 'Ouvert — la table de marque peut saisir les scores',
  FIGE: 'En pause — la saisie est fermée ; le même lien pourra reprendre',
  CLOTURE: 'Clôturé — le lien est définitivement inutilisable'
};
/* ⭐ CORR-ACCES-45MIN-DEMO — l'accès est encore enregistré ouvert, mais le serveur le déclare échu. */
const ACCES_SCORES_LIBELLE_FERME_AUTO = 'Fermé automatiquement — la table de marque ne peut plus saisir ; « Reprendre la saisie » rouvre 45 minutes avec le même lien, « Mettre en pause » la garde fermée';

/* L'ordre d'affichage des gestes. ⛔ Seuls ceux que le SERVEUR déclare possibles sont montrés. */
const ACCES_SCORES_GESTES = [
  { action: 'PREPARER', libelle: 'Préparer le lien' },
  { action: 'OUVRIR', libelle: 'Ouvrir la saisie' },
  { action: 'FIGER', libelle: 'Mettre en pause' },
  { action: 'REPRENDRE', libelle: 'Reprendre la saisie' },
  { action: 'ROTATION', libelle: 'Renouveler le lien' },
  { action: 'CLOTURER', libelle: 'Clôturer définitivement', danger: true }
];

let accesScoresCourant = null;     // le dernier état RENDU PAR LE SERVEUR (jamais deviné ici)
let accesScoresSequence = 0;       // une réponse plus ancienne ne remplace jamais une plus récente
let accesScoresEcouteursPoses = false;
let matchsLitige = [];

/** Un identifiant de demande NEUF par geste (il n'est pas secret : il doit être unique). */
function nouvelIdRequeteAdmin() {
  const c = (typeof crypto !== 'undefined') ? crypto : null;
  if (c && typeof c.randomUUID === 'function') return 'adm-' + c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const octets = new Uint8Array(16);
    c.getRandomValues(octets);
    return 'adm-' + Array.from(octets, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  return 'adm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2);
}

/**
 * Appelée UNE fois à l'ouverture (`initAdmin`), avant que le mode guidé ne déplace les blocs :
 * branche les gestes du bloc et affiche son état « non chargé ». ⛔ Aucun appel réseau.
 */
function majAccesSaisie() {
  if (!document.getElementById('acces-saisie')) return;   // bloc absent : on ne casse rien
  if (!accesScoresEcouteursPoses) {
    const brancher = function (id, type, fn) {
      const el = document.getElementById(id);
      if (el) el.addEventListener(type, fn);
    };
    brancher('acces-saisie-actions', 'click', onClicGesteAccesScores);
    brancher('acces-saisie-actions-suite', 'click', onClicGesteAccesScores);
    brancher('acces-saisie-cloture', 'click', onClicGesteAccesScores);
    brancher('bouton-copier-qr-saisie', 'click', onCopierQrSaisie);
    brancher('bouton-litige-charger', 'click', function () { chargerMatchsLitige(false); });
    brancher('bouton-litige-corriger', 'click', onCorrigerScoreLitige);
    brancher('litige-match', 'change', majFormulaireLitige);
    accesScoresEcouteursPoses = true;
  }
  if (!accesScoresCourant) rendreAccesScores(null);
}

/** « Verrouiller » : le lien porte un jeton, il quitte l'écran avec la session. */
function masquerAccesScores() {
  accesScoresSequence++;
  accesScoresCourant = null;
  matchsLitige = [];
  rendreAccesScores(null);
  const formulaire = document.getElementById('litige-formulaire');
  if (formulaire) formulaire.hidden = true;
}

/**
 * Lit l'état de l'accès (clé admin).
 *
 * ⭐ ELLE N'EST PLUS APPELÉE QUE PAR LE REGISTRE (`ADMIN_RESSOURCES.accesScores`, admin.js) : à
 * l'arrivée sur l'écran, au rafraîchissement explicite, et en repli quand un backend d'avant ne
 * joint pas l'état à sa réponse d'écriture. ⛔ Plus par `majPublication()` — voir son bandeau.
 * ⛔ Sans clé admin rangée, elle ne fait RIEN : elle n'ouvre jamais de fenêtre de clé.
 * ⛔ Elle n'inscrit rien dans le registre : elle LIT, peint et pose son message. Le registre est
 *   le seul écrivain de l'état des ressources (doctrine R2, admin.js).
 * ⏱️ Bornée : `delaiMs` par tentative, `budgetMs` pour le total (cette lecture est rejouable après
 *   un 404 de la Web App, liste fermée d'api.js).
 */
async function chargerAccesScores() {
  if (!document.getElementById('acces-saisie')) return false;
  let cle = '';
  try { cle = lireCleLocale('admin'); } catch (e) { cle = ''; }
  if (!cle) { masquerAccesScores(); return false; }
  const numero = ++accesScoresSequence;
  try {
    const etat = await apiPostProtege('getAccesScoresAdmin', {}, 'admin', 'admin',
      { delaiMs: DELAI_LECTURE_ACCES_SCORES_MS, budgetMs: BUDGET_LECTURE_ACCES_SCORES_MS });
    if (numero !== accesScoresSequence) return false;
    accesScoresCourant = etat;
    rendreAccesScores(etat);
    return true;
  } catch (err) {
    if (numero !== accesScoresSequence) return false;
    const message = document.getElementById('message-acces-saisie');
    if (message) {
      afficherMessage(message, '⚠️ État de l\'accès indisponible (' +
        causeInconnuePublication(err, DELAI_LECTURE_ACCES_SCORES_MS) + '). Utilise « Rafraîchir » pour réessayer.', 'ko');
    }
    return false;
  }
}

/**
 * ⭐ L'ÉTAT JOINT À UNE RÉPONSE D'ÉCRITURE, PEINT À LA PLACE D'UNE RELECTURE (contrat ⑰ du backend :
 * `changerAccesScores` + `renvoyer_etat: 'oui'` renvoie `acces`, EXACTEMENT ce que
 * `getAccesScoresAdmin` renverrait, relu SOUS LE VERROU après l'écriture).
 *
 * ⛔ CE QUI EST PRÉSERVÉ MOT POUR MOT : l'écran peint un état RELU PAR LE SERVEUR, jamais un état
 *   deviné ici. Aucune transition, aucune version, aucun lien n'est calculé dans le navigateur.
 * ⭐ Elle passe par la FILE de la ressource (`appliquerRessourceAdmin`) : une lecture partie AVANT
 *   l'écriture se termine d'abord, puis cet état — plus récent — la recouvre. ⛔ Sans la file, une
 *   lecture de navigation en vol aurait pu repeindre l'état d'AVANT le geste, par-dessus.
 * ⛔ Le compteur de séquence est incrémenté : une réponse de lecture encore en vol, plus ANCIENNE,
 *   ne peut plus rien peindre.
 * @return {Promise<boolean>} true si l'état a été appliqué (⛔ false s'il n'y en avait pas)
 */
function appliquerAccesScores(etat) {
  if (!etat || typeof etat !== 'object') return Promise.resolve(false);
  if (!document.getElementById('acces-saisie')) return Promise.resolve(false);
  const poser = function () {
    accesScoresSequence++;
    accesScoresCourant = etat;
    rendreAccesScores(etat);
  };
  if (typeof appliquerRessourceAdmin !== 'function') { poser(); return Promise.resolve(true); }
  return appliquerRessourceAdmin('accesScores', poser).then(function () { return true; });
}

/** Relit l'état de l'accès APRÈS une écriture — par le registre, jamais par un appel direct :
 *  ⛔ une lecture commencée avant l'écriture décrirait l'état d'avant. */
function relireAccesScores() {
  if (typeof rafraichirRessourceAdmin === 'function') return rafraichirRessourceAdmin('accesScores');
  return Promise.resolve(chargerAccesScores());
}

/** Le texte d'avertissement du calcul de fin. ⛔ Il n'empêche jamais la pause manuelle. */
function avertissementFinAcces(etat) {
  const fin = etat && etat.fin;
  if (!fin) return null;
  const cats = (fin.en_cause || []).join(', ');
  if (fin.suggestion === 'GEL_POSSIBLE') {
    return { texte: '✅ Tous les matchs prévus sont terminés : tu peux mettre la saisie en pause.', type: 'ok' };
  }
  if (fin.suggestion === 'GENERER_SUITE') {
    return { texte: 'ℹ️ Une phase suivante est attendue' + (cats ? ' (' + cats + ')' : '') +
      '. La pause reste possible, avec une confirmation.', type: 'ko' };
  }
  if (fin.motif === 'categories_incompletes') {
    return { texte: '⚠️ Des matchs ne sont pas terminés' + (cats ? ' (' + cats + ')' : '') +
      '. La pause reste possible, avec une confirmation renforcée.', type: 'ko' };
  }
  return { texte: '⚠️ La fin du tournoi ne peut pas être confirmée' + (cats ? ' (' + cats + ')' : '') +
    '. La pause reste possible, avec une confirmation renforcée.', type: 'ko' };
}

/** « le 10/10 à 17:35 » — ⭐ la DATE est toujours écrite : une date de tournoi erronée se voit à l'écran. */
function momentEcheanceAcces(instant) {
  const texte = String(instant || '');
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(texte);
  return m ? 'le ' + m[3] + '/' + m[2] + ' à ' + m[4] + ':' + m[5] : texte;
}

/**
 * ⭐ CORR-ACCES-45MIN-DEMO — la fermeture automatique, telle que le SERVEUR l'a calculée (`echeance_auto`).
 * ⛔ Aucune heure n'est calculée ici, et une échéance non calculable n'est JAMAIS présentée comme une protection.
 */
function texteEcheanceAcces(etat) {
  const e = etat && etat.echeance_auto;
  if (!e) return null;
  const fermee = etat.fermee_automatiquement === true;
  const ouvert = etat.etat === 'OUVERT';
  const nature = e.nature || (e.calculable === true ? 'PLANNING' : 'PLANNING_INCOMPLET');
  const quand = momentEcheanceAcces(e.echeance);
  const correction = ' Tu peux toujours corriger un score depuis l\'administration.';
  const repriseIllisible = e.reprise_illisible === true
    ? ' ⚠️ La date de la dernière reprise est illisible : elle ne prolonge rien.' : '';
  const motif = e.message || 'échéance non calculable.';

  /* ⭐ CORR-MAINTIEN-FERMETURE-45MIN — le planning a cessé de donner une échéance APRÈS la fermeture
     automatique : l'accès reste fermé QUOI QUE le planning redevienne. ⛔ Ce cas passe AVANT tous les autres,
     sans quoi un planning redevenu incomplet s'afficherait comme une attente normale (« la saisie reste
     ouverte »), et un planning restauré annoncerait une échéance à venir alors que la saisie est fermée.
     ⭐ En pause ou préparé, la phrase le dit autrement : ce n'est pas CE maintien qui ferme la saisie. */
  const maintien = '⛔ La fermeture automatique est MAINTENUE : le planning a changé après elle (après-midi retirée, ' +
    'catégorie retirée, ajoutée ou devenue incomplète). Le remettre en état ne rouvre pas la saisie — seul ' +
    '« Reprendre la saisie » la rend, pour 45 minutes, avec le lien affiché ci-dessous.';
  if (e.maintenue === true) {
    /* ⭐ Le motif du serveur reste DIT : sans lui, une heure ou une date illisible resterait invisible, et la
       reprise ne durerait que 45 minutes sans que l'organisateur sache quoi corriger. */
    const aussi = e.calculable === true ? '' : ' Par ailleurs, le planning n\'est pas lisible : ' + motif;
    return { texte: (ouvert ? '⛔ Saisie fermée, et maintenue fermée. ' : '') + maintien + aussi + correction + repriseIllisible,
      type: 'ko' };
  }

  /* ⛔ DONNÉES INVALIDES : aucune échéance fiable — la saisie n'est ouverte que pendant une fenêtre de reprise. */
  if (nature === 'DONNEES_INVALIDES') {
    const cause = 'données du planning invalides — ' + motif;
    if (fermee && e.source === 'reprise') {
      return { texte: '⛔ Saisie fermée ' + quand + ' (45 minutes après la reprise) : ' + cause +
        ' Corrige ces données, ou « Reprendre la saisie » pour 45 minutes.' + correction + repriseIllisible, type: 'ko' };
    }
    if (fermee) {
      return { texte: '⛔ Saisie fermée : ' + cause + ' Aucune échéance fiable : corrige ces données, ou « Reprendre la saisie » pour 45 minutes.' +
        correction + repriseIllisible, type: 'ko' };
    }
    if (ouvert && e.source === 'reprise') {
      return { texte: '⚠️ Fermeture automatique prévue ' + quand + ' (45 minutes après la reprise) : ' + cause + repriseIllisible, type: 'ko' };
    }
    /* ⛔ Sans donnée fiable, une saisie OUVERTE maintenant serait fermée aussitôt — et non « pour 45 minutes ». */
    const suite = etat.etat === 'PREPARE'
      ? 'une saisie ouverte maintenant serait aussitôt fermée ; « Reprendre la saisie » la rouvrirait ensuite pour 45 minutes.'
      : '« Reprendre la saisie » ne rouvrira la saisie que pour 45 minutes.';
    return { texte: '⚠️ Données du planning invalides — ' + motif + ' ' + suite + repriseIllisible, type: 'ko' };
  }

  /* ⚠️ PLANNING INCOMPLET (attente normale) ou NON PRIS EN CHARGE : aucune échéance tirée du planning. */
  if (nature !== 'PLANNING') {
    if (ouvert && e.source === 'reprise') {
      return { texte: '⏱️ ' + (fermee ? 'Saisie fermée automatiquement ' : 'Fermeture automatique prévue ') + quand +
        ' (45 minutes après la reprise). Planning incomplet : ' + motif + (fermee ? correction : ''), type: 'ko' };
    }
    return { texte: '⚠️ Fermeture automatique NON programmée : ' + motif +
      (ouvert ? ' La saisie reste ouverte tant que tu ne la mets pas en pause.' : '') + repriseIllisible, type: 'ko' };
  }

  const pourquoi = e.source === 'reprise'
    ? '45 minutes après la reprise'
    : '45 minutes après la fin prévue du dernier match, ' + momentEcheanceAcces(e.fin_prevue);
  if (fermee) {
    return { texte: '⏱️ Saisie fermée automatiquement ' + quand + ' (' + pourquoi + ').' + correction + repriseIllisible, type: 'ko' };
  }
  if (e.atteinte === true) {
    const suite = etat.etat === 'PREPARE'
      ? 'une saisie ouverte maintenant serait aussitôt fermée ; « Reprendre la saisie » la rouvrirait ensuite pour 45 minutes.'
      : '« Reprendre la saisie » ne rouvrira la saisie que pour 45 minutes.';
    return { texte: '⏱️ Échéance de fermeture automatique dépassée (' + quand + ') : ' + suite + repriseIllisible, type: 'ko' };
  }
  return { texte: '⏱️ Fermeture automatique prévue ' + quand + ' (' + pourquoi + ').' + repriseIllisible, type: repriseIllisible ? 'ko' : 'ok' };
}

/** Rend l'état, les gestes possibles, l'avertissement et — seulement s'il est rendu — le lien. */
/* Ce que la pastille et l'encart disent de chaque état. ⛔ Aucune règle nouvelle : on ne fait
   que traduire l'état RENDU PAR LE SERVEUR — la liste des gestes possibles reste la sienne. */
const ACCES_SCORES_RESUME = {
  ABSENT:  { pastille: 'Non préparée', ton: 'cv-neutre', titre: 'Accès pas encore préparé',
             texte: 'Préparez le lien pour que la table de marque puisse saisir les scores le jour du tournoi.' },
  PREPARE: { pastille: 'Lien prêt', ton: 'cv-neutre', titre: 'Lien prêt, saisie fermée',
             texte: 'Le lien existe et peut être transmis. Ouvrez la saisie le jour du tournoi pour que les scores soient enregistrés.' },
  OUVERT:  { pastille: '✓ Saisie ouverte', ton: 'cv-succes', titre: 'Saisie des résultats en cours',
             texte: 'Les résultats saisis sont automatiquement pris en compte dans la page publique (avec un léger délai).' },
  FIGE:    { pastille: 'En pause', ton: 'cv-attention', titre: 'Saisie en pause',
             texte: 'La table de marque ne peut plus saisir. Le même lien reprendra là où il s’est arrêté.' },
  CLOTURE: { pastille: 'Clôturée', ton: 'cv-neutre', titre: 'Accès clôturé',
             texte: 'Le lien est définitivement inutilisable. Les résultats déjà enregistrés sont conservés.' }
};
const ACCES_SCORES_RESUME_FERME_AUTO = { pastille: 'Fermée', ton: 'cv-attention',
  titre: 'Saisie fermée automatiquement',
  texte: 'La durée d’ouverture est écoulée. « Reprendre la saisie » rouvre le même lien pour 45 minutes.' };

/**
 * La pastille de la tête de carte et l'encart qui explique l'état, sur l'écran refondu.
 * ⛔ Sans effet quand ces deux éléments n'existent pas : le repli sans JavaScript et
 *    l'assistant mobile gardent la phrase complète de `#acces-saisie-etat`.
 */
function majResumeAccesScores(etat, fermeAuto) {
  const pastille = document.getElementById('cv-marque-pastille');
  const encart = document.getElementById('cv-marque-encart');
  if (!pastille && !encart) return;
  const resume = !etat ? null
    : (fermeAuto ? ACCES_SCORES_RESUME_FERME_AUTO : ACCES_SCORES_RESUME[etat.etat]);
  if (!resume) {
    if (pastille) { pastille.textContent = ''; pastille.className = 'cv-pastille'; pastille.hidden = true; }
    if (encart) { encart.innerHTML = ''; encart.hidden = true; }
    return;
  }
  if (pastille) {
    pastille.hidden = false;
    pastille.textContent = resume.pastille;
    pastille.className = 'cv-pastille ' + resume.ton;
  }
  if (encart) {
    encart.hidden = false;
    encart.className = 'cv-marque-encart ' + resume.ton;
    encart.innerHTML = '<span class="cv-marque-encart-icone" aria-hidden="true">' + svgIcone('dossier') + '</span>' +
      '<strong>' + echapper(resume.titre) + '</strong><span>' + echapper(resume.texte) + '</span>';
  }
}

/**
 * Le bandeau rouge SUIT le bouton de clôture, il ne le devine pas.
 * ⛔ Appelé APRÈS la boucle des gestes : le serveur seul décide si CLOTURER est possible, et
 *    c'est cette boucle qui démasque le bouton. Calculé avant, le bandeau restait caché sur un
 *    accès pourtant clôturable — défaut constaté à l'écran avant d'être corrigé ici.
 */
function majBandeauCloture() {
  const bandeau = document.getElementById('cv-pub-cloture');
  const cloture = document.getElementById('acces-saisie-cloture');
  if (bandeau) bandeau.hidden = !cloture || cloture.hidden;
}

function rendreAccesScores(etat) {
  const libelle = document.getElementById('acces-saisie-etat');
  const gestes = document.getElementById('acces-saisie-actions');
  const gestesSuite = document.getElementById('acces-saisie-actions-suite');
  const cloture = document.getElementById('acces-saisie-cloture');
  const avert = document.getElementById('acces-saisie-avertissement');
  if (!libelle) return;
  if (gestes) gestes.innerHTML = '';
  if (gestesSuite) gestesSuite.innerHTML = '';
  if (cloture) {
    cloture.hidden = true;
    cloture.disabled = false;
  }
  if (avert) afficherMessage(avert, '', 'ok');
  afficherLienAccesScores('');
  majResumeAccesScores(null, false);
  majBandeauCloture();
  if (!etat) { libelle.textContent = 'Connecte-toi à l\'administration pour voir l\'accès.'; return; }
  if (etat.disponible === false) { libelle.textContent = etat.message || 'Accès indisponible.'; return; }
  if (etat.anomalie) { libelle.textContent = '⚠️ ' + (etat.message || 'Ligne d\'accès illisible.'); return; }

  const fermeAuto = etat.fermee_automatiquement === true;
  libelle.textContent = fermeAuto ? ACCES_SCORES_LIBELLE_FERME_AUTO
    : (ACCES_SCORES_LIBELLES_ETAT[etat.etat] || ('État inconnu : ' + etat.etat));
  majResumeAccesScores(etat, fermeAuto);
  const possibles = etat.actions_possibles || [];
  if (gestes || gestesSuite) {
    ACCES_SCORES_GESTES.forEach(function (g) {
      if (possibles.indexOf(g.action) === -1) return;
      if (g.action === 'CLOTURER') {
        if (cloture) cloture.hidden = false;
        return;
      }
      const conteneur = g.action === 'ROTATION' ? gestesSuite : gestes;
      if (!conteneur) return;
      const bouton = document.createElement('button');
      bouton.type = 'button';
      // Le geste principal de cette carte est « Ouvrir la table de marque » : les transitions
      // (pause, reprise, renouvellement) restent secondaires à côté de lui.
      bouton.className = 'bouton' + (g.danger ? ' bouton-danger' : ' bouton-doux');
      bouton.textContent = g.libelle;
      bouton.setAttribute('data-geste-acces', g.action);
      conteneur.appendChild(bouton);
    });
  }
  const aviso = (etat.etat === 'OUVERT' || etat.etat === 'FIGE') ? avertissementFinAcces(etat) : null;
  const echeance = texteEcheanceAcces(etat);
  let indispo = '';
  if (etat.lien_indisponible) {
    /* ⭐ CORR-SURFACE-HTML-ACCES-SCORES-DR-5S — l'adresse de la passerelle de saisie n'est pas réglée sur
       le serveur : renouveler le lien ne servirait à rien. ⛔ Aucun lien n'est fabriqué ici pour autant. */
    indispo = (etat.lien_motif === 'PASSERELLE_NON_CONFIGUREE')
      ? '⚠️ La page de saisie des scores n\'est pas encore configurée sur le serveur : aucun lien ni QR code ne peut être affiché pour l\'instant. Renouveler le lien n\'y changera rien — ce réglage doit d\'abord être fait.'
      : '⚠️ Le lien de ce tournoi ne peut pas être réaffiché. Renouvelle-le pour en obtenir un nouveau (l\'ancien ne fonctionnera plus).';
  }
  if (avert && (echeance || aviso || indispo)) {
    afficherMessage(avert, [echeance ? echeance.texte : '', aviso ? aviso.texte : '', indispo].filter(Boolean).join('\n'),
      (indispo || (aviso && aviso.type === 'ko') || (echeance && echeance.type === 'ko')) ? 'ko' : 'ok');
  }
  afficherLienAccesScores(etat.lien || '');
  majBandeauCloture();   // ⭐ APRÈS la boucle des gestes, qui seule démasque le bouton
}

/** Le bouton et le QR : ⛔ affichés seulement pour une adresse https rendue par le serveur. */
function afficherLienAccesScores(url) {
  const valide = /^https:\/\//.test(String(url || ''));
  const corps = document.getElementById('acces-saisie-corps');
  const lien = document.getElementById('acces-saisie-lien');
  const cloture = document.getElementById('acces-saisie-cloture');
  const qr = document.getElementById('acces-saisie-qr');
  if (corps) corps.hidden = !valide && (!cloture || cloture.hidden);
  if (lien) {
    lien.href = valide ? url : '#';
    lien.hidden = !valide;
  }
  if (!qr) return;
  if (valide) {
    qr.hidden = false;
    qr.setAttribute('data-url', url);                  // ⭐ UNE seule source pour le lien et le QR
    dessinerQrSaisie();
  } else {
    qr.removeAttribute('data-url');
    qr.removeAttribute('data-qr');
    qr.hidden = true;
    const ancien = qr.querySelector('svg');
    if (ancien) ancien.remove();
  }
}

async function onClicGesteAccesScores(evenement) {
  const cible = evenement && evenement.target;
  const bouton = (cible && cible.closest) ? cible.closest('[data-geste-acces]') : null;
  if (!bouton || bouton.disabled) return;
  await executerGesteAccesScores(bouton.getAttribute('data-geste-acces'));
}

async function creerConfirmationGeste(transition, versionLue) {
  return ecrireAdmin('creerConfirmationAccesScores',
    { transition: transition, version_lue: versionLue, requete_id: nouvelIdRequeteAdmin() },
    { delaiMs: DELAI_ECRITURE_PUBLICATION_MS });
}

/* ⭐ LE GARDE D'OPÉRATION DE LA CARTE — un seul geste de publication ou d'accès à la fois.
 *
 * 🔬 LE DÉFAUT FERMÉ (lot « Publication »). Les deux gestes de cette carte ouvrent un dialogue de
 * confirmation AVANT de griser quoi que ce soit — et un `await` rend la main au navigateur. Deux
 * clics rapides ouvraient donc DEUX dialogues, et deux « Oui » lançaient DEUX séquences complètes :
 * mesuré au banc, un double clic sur « Publier » émettait HUIT requêtes (deux enregistrements
 * d'infos, deux publications, deux relectures de config, deux relectures d'accès) et reconstruisait
 * deux fois l'instantané public. Sur un geste d'accès, la seconde demande était bien REFUSÉE par la
 * version optimiste du serveur — la machine d'état tenait —, mais elle coûtait quand même une
 * exécution, une ligne de registre d'idempotence et une ligne de journal, pour rien.
 *
 * ⛔ CE QUE CE GARDE N'EST PAS : un verrou de concurrence. Il ne remplace ni la version optimiste,
 *   ni le registre d'idempotence, ni le verrou serveur — qui restent la seule vérité, et qui
 *   protègent aussi de DEUX ONGLETS, que rien ici ne peut voir. Il évite un doublon né d'UN SEUL
 *   clic de trop, dans UN SEUL onglet, et rien d'autre.
 * ⛔ Il est relâché dans un `finally` : une panne ne doit jamais laisser la carte muette.
 */
let publicationGesteEnCours = '';

/** Prend le garde pour ce geste, ou dit pourquoi il est refusé. */
function prendreGestePublication(nom) {
  if (publicationGesteEnCours) return false;
  publicationGesteEnCours = String(nom);
  return true;
}

function relacherGestePublication() {
  publicationGesteEnCours = '';
}

/**
 * ⭐ UN GESTE D'ORGANISATEUR. La version lue part avec la demande : un écran périmé est refusé par le
 * serveur (jamais appliqué). Rotation, pause et clôture exigent une confirmation explicite ; quand le
 * calcul de fin ne conclut pas, une confirmation renforcée est créée CÔTÉ SERVEUR, puis consommée.
 * ⛔ Aucun réessai automatique : une panne se montre, et l'écran est relu dans tous les cas.
 */
async function executerGesteAccesScores(action) {
  const etat = accesScoresCourant;
  const message = document.getElementById('message-acces-saisie');
  if (!etat || etat.disponible === false || (etat.actions_possibles || []).indexOf(action) === -1) return false;
  /* ⭐ UN SEUL GESTE À LA FOIS — pris AVANT le premier dialogue, seul endroit où il protège : c'est
     l'`await` du dialogue qui laissait passer le second clic. Voir `publicationGesteEnCours`. */
  if (!prendreGestePublication('acces:' + action)) return false;
  try {
    return await executerGesteAccesScoresGarde(action, etat, message);
  } finally {
    relacherGestePublication();
  }
}

/**
 * ⭐ UN GESTE D'ORGANISATEUR. La version lue part avec la demande : un écran périmé est refusé par le
 * serveur (jamais appliqué). Rotation, pause et clôture exigent une confirmation explicite ; quand le
 * calcul de fin ne conclut pas, une confirmation renforcée est créée CÔTÉ SERVEUR, puis consommée.
 * ⛔ Aucun réessai automatique : une panne se montre, et l'écran est relu dans tous les cas.
 *
 * ⭐ CE QUE CE LOT A CHANGÉ, ET SEULEMENT CELA :
 *   · la demande porte `renvoyer_etat: 'oui'` ; la réponse rapporte alors `acces`, l'état RELU SOUS
 *     LE VERROU par le serveur. L'écran le peint au lieu d'émettre une seconde requête — six gestes,
 *     six relectures épargnées. ⛔ Sans `acces` (backend d'avant), on relit exactement comme avant ;
 *   · l'attente est BORNÉE ;
 *   · une issue INCONNUE (délai, réseau) n'est plus annoncée comme un échec certain.
 * ⛔ CE QUI N'A PAS BOUGÉ D'UN CARACTÈRE : la machine d'état, la version optimiste, l'identifiant
 *   d'idempotence, les confirmations, et la réconciliation prudente de la rotation.
 */
async function executerGesteAccesScoresGarde(action, etat, message) {
  const versionLue = String(etat.version);
  /* ⭐ `renvoyer_etat` — la DEMANDE explicite de l'état relu. ⛔ Elle ne change ni la transition, ni
     la version envoyée, ni l'identifiant de demande : l'empreinte d'idempotence du serveur porte sur
     la transition et la version, pas sur ce drapeau d'affichage. */
  const donnees = { transition: action, version_lue: versionLue, requete_id: nouvelIdRequeteAdmin(),
                    renvoyer_etat: 'oui' };
  const aviso = avertissementFinAcces(etat);
  const texteAviso = aviso ? aviso.texte : '';

  if (action === 'ROTATION' && !await dialogConfirmer('Renouveler le lien de la table de marque ?\n\n' +
      'L\'ancien lien et l\'ancien QR code ne fonctionneront PLUS : il faudra distribuer le nouveau.',
      { ok: 'Renouveler', danger: true })) return false;

  if (action === 'FIGER') {
    const renforcee = !!(etat.gel && etat.gel.decision === 'CONFIRMATION_REQUISE');
    /* ⭐ CORR-ACCES-45MIN-DEMO — déjà fermé automatiquement, la pause rend la fermeture PERSISTANTE. */
    const dejaFermee = etat.fermee_automatiquement === true
      ? '\n\nLa saisie est déjà fermée automatiquement : la pause la gardera fermée, même si le planning change.' : '';
    const question = renforcee
      ? '⚠️ Le calcul ne confirme pas la fin du tournoi.\n\n' + texteAviso +
        '\n\nMettre la saisie en pause quand même ? Le même lien pourra reprendre.' + dejaFermee
      : 'Mettre la saisie en pause ?\n\nLa table de marque ne pourra plus saisir. Le même lien pourra reprendre.' + dejaFermee;
    if (!await dialogConfirmer(question, { ok: 'Mettre en pause', danger: renforcee })) return false;
    if (renforcee) {
      try { donnees.confirmation_id = (await creerConfirmationGeste('FIGER', versionLue)).confirmation_id; }
      catch (err) { if (message) afficherMessage(message, messageEchecGesteAcces(err), 'ko'); await relireAccesScores(); return false; }
    }
  }

  if (action === 'CLOTURER') {
    if (!await dialogConfirmer('Clôturer DÉFINITIVEMENT l\'accès de la table de marque ?\n\n' +
        'Le lien et le QR code seront morts pour toujours, sans reprise possible. ' +
        'Tu pourras encore corriger un score depuis l\'administration.',
        { ok: 'Clôturer', danger: true })) return false;
    if (etat.cloture && etat.cloture.decision === 'CONFIRMATION_RENFORCEE') {
      if (!await dialogConfirmer('⚠️ Le calcul ne confirme pas la fin du tournoi.\n\n' + texteAviso +
          '\n\nClôturer quand même un tournoi peut-être seulement interrompu ?',
          { ok: 'Oui, clôturer', danger: true })) return false;
      try { donnees.confirmation_id = (await creerConfirmationGeste('CLOTURER', versionLue)).confirmation_id; }
      catch (err) { if (message) afficherMessage(message, messageEchecGesteAcces(err), 'ko'); await relireAccesScores(); return false; }
    }
    donnees.confirme = true;
  }

  const zone = document.getElementById('acces-saisie');
  if (zone) zone.querySelectorAll('[data-geste-acces]').forEach(function (b) { b.disabled = true; });
  let applique = false;
  let inconnue = false;
  try {
    const res = await ecrireAdmin('changerAccesScores', donnees, { delaiMs: DELAI_ECRITURE_PUBLICATION_MS });
    applique = true;
    if (message) afficherMessage(message, '✅ ' + (ACCES_SCORES_LIBELLES_ETAT[res.etat] || 'Accès mis à jour.'), 'ok');
    /* ⭐ L'ÉTAT RELU PAR LE SERVEUR, s'il l'a joint : ⛔ une requête de moins, et pas un état deviné. */
    if (!await appliquerAccesScores(res.acces)) await relireAccesScores();
  } catch (err) {
    inconnue = issueInconnuePublication(err);
    if (message) afficherMessage(message, messageEchecGesteAcces(err), 'ko');
    /* ⛔ ON RELIT DANS TOUS LES CAS, et c'est une LECTURE, pas un rejeu : elle seule peut dire si
       l'écriture a abouti sans que sa réponse revienne. La carte peint alors la vérité du serveur. */
    await relireAccesScores();
  }
  /* Google peut appliquer la rotation puis perdre sa réponse au second saut de la Web App (404).
     ⛔ On ne réémet jamais cette écriture. La réussite n'est réconciliée qu'après relecture, si le
     serveur montre EXACTEMENT l'incrément attendu et un nouveau lien pour la même édition. */
  if (!applique && action === 'ROTATION' && accesScoresCourant &&
      String(accesScoresCourant.edition_id || '') === String(etat.edition_id || '') &&
      Number(accesScoresCourant.version) === Number(versionLue) + 1 &&
      Number(accesScoresCourant.rotations) === Number(etat.rotations) + 1 &&
      String(accesScoresCourant.lien || '') !== '' &&
      String(accesScoresCourant.lien) !== String(etat.lien || '')) {
    applique = true;
    if (message) afficherMessage(message, '✅ Lien et QR code renouvelés.', 'ok');
  }
  /* ⭐ ISSUE INCONNUE NON RÉCONCILIÉE — ⛔ ne jamais la présenter comme un refus. L'état affiché
     au-dessus vient d'être RELU : on renvoie l'organisateur à lui, sans rien réémettre. */
  if (!applique && inconnue && message) {
    afficherMessage(message, messageInconnuPublication('le geste « ' + libelleGesteAcces(action) +
      ' » n’est pas confirmé', undefined, 'l’état affiché ci-dessus vient d’être relu sur le serveur'), 'ko');
  }
  /* ⭐ CORR-ACCES-45MIN-DEMO — un accès OUVERT ou REPRIS alors que la saisie est déjà échue est aussitôt refermé
     par le serveur : le « ✅ Ouvert » ne doit pas rester affiché. ⛔ Les autres gestes (pause, renouvellement,
     clôture) ne « referment » rien : leur message reste celui du serveur. */
  if (applique && message && (action === 'OUVRIR' || action === 'REPRENDRE') &&
      accesScoresCourant && accesScoresCourant.fermee_automatiquement === true) {
    afficherMessage(message, '⚠️ Saisie aussitôt fermée automatiquement (voir la raison ci-dessus). ' +
      '« Reprendre la saisie » la rouvre pour 45 minutes.', 'ko');
  }
  return true;
}

/** Le libellé de bouton d'un geste, pour en parler dans un message. */
function libelleGesteAcces(action) {
  const trouve = ACCES_SCORES_GESTES.filter(function (g) { return g.action === action; })[0];
  return trouve ? trouve.libelle : String(action);
}

/** Le message d'un geste qui n'a pas abouti : ⛔ un refus LISIBLE se dit tel quel, une issue
 *  INCONNUE ne se dit jamais « échec ». */
function messageEchecGesteAcces(err) {
  if (!issueInconnuePublication(err)) return '⚠️ ' + err.message;
  return messageInconnuPublication('le geste n’est pas confirmé', err,
    'l’état de l’accès est relu à l’instant');
}

/* ---- Correction d'un score suite à un litige (organisateur seulement) ---- */

function matchLitigeChoisi() {
  const select = document.getElementById('litige-match');
  const id = select ? String(select.value) : '';
  return matchsLitige.find(function (m) { return String(m.id_match) === id; }) || null;
}

function majFormulaireLitige() {
  const m = matchLitigeChoisi();
  if (!m) return;
  const libA = document.getElementById('litige-lib-a');
  const libB = document.getElementById('litige-lib-b');
  const a = document.getElementById('litige-score-a');
  const b = document.getElementById('litige-score-b');
  if (libA) libA.textContent = 'Score ' + String(m.nom_A || 'équipe A');
  if (libB) libB.textContent = 'Score ' + String(m.nom_B || 'équipe B');
  if (a) a.value = (m.score_A === '' || m.score_A == null) ? '' : String(m.score_A);
  if (b) b.value = (m.score_B === '' || m.score_B == null) ? '' : String(m.score_B);
}

/** Relit les matchs ET leur version (clé admin). */
async function chargerMatchsLitige(conserverMessage) {
  const message = document.getElementById('message-litige');
  try {
    const res = await apiPostProtege('getMatchsLitige', {}, 'admin', 'admin');
    const select = document.getElementById('litige-match');
    const avant = select ? String(select.value) : '';
    matchsLitige = res.matchs || [];
    if (select) {
      select.innerHTML = '';
      matchsLitige.forEach(function (m) {
        const option = document.createElement('option');
        option.value = String(m.id_match);
        const score = (m.score_A === '' || m.score_A == null) ? 'à jouer' : m.score_A + ' – ' + m.score_B;
        option.textContent = String(m.categorie) + ' · ' + String(m.nom_A) + ' – ' + String(m.nom_B) + ' (' + score + ')';
        select.appendChild(option);
      });
      if (avant && matchsLitige.some(function (m) { return String(m.id_match) === avant; })) select.value = avant;
    }
    const formulaire = document.getElementById('litige-formulaire');
    if (formulaire) formulaire.hidden = matchsLitige.length === 0;
    majFormulaireLitige();
    if (message && !conserverMessage) {
      afficherMessage(message, matchsLitige.length ? '' : 'Aucun match à corriger.', matchsLitige.length ? 'ok' : 'ko');
    }
  } catch (err) {
    if (message) afficherMessage(message, '⚠️ ' + err.message, 'ko');
  }
}

/**
 * ⭐ LA CORRECTION DE LITIGE : motif obligatoire, confirmation explicite, version lue, `requete_id`.
 * ⛔ Elle ne touche jamais à l'accès de la table de marque. Une cascade de Coupe exige une seconde
 * décision explicite ; ⛔ rien n'est régénéré en silence.
 */
async function onCorrigerScoreLitige() {
  const message = document.getElementById('message-litige');
  const m = matchLitigeChoisi();
  if (!m) { afficherMessage(message, 'Choisis un match.', 'ko'); return; }
  const a = String(document.getElementById('litige-score-a').value || '').trim();
  const b = String(document.getElementById('litige-score-b').value || '').trim();
  const motif = String(document.getElementById('litige-motif').value || '').trim();
  if (a === '' || b === '') { afficherMessage(message, 'Entre les deux scores.', 'ko'); return; }
  if (!motif) { afficherMessage(message, 'Le motif du litige est obligatoire.', 'ko'); return; }
  const avant = (m.score_A === '' || m.score_A == null) ? 'aucun score' : m.score_A + ' – ' + m.score_B;
  if (!await dialogConfirmer('Corriger le score de ' + m.nom_A + ' – ' + m.nom_B + ' ?\n\n' +
      'Avant : ' + avant + '\nAprès : ' + a + ' – ' + b + '\nMotif : ' + motif + '\n\n' +
      'La correction est tracée et ne rouvre pas la saisie de la table de marque.',
      { ok: 'Corriger', danger: true })) return;

  const donnees = { id_match: m.id_match, score_A: a, score_B: b, motif: motif, confirme: true,
                    version_lue: m.version_lue, requete_id: nouvelIdRequeteAdmin() };
  const bouton = document.getElementById('bouton-litige-corriger');
  if (bouton) bouton.disabled = true;
  try {
    let res;
    try {
      res = await ecrireAdmin('corrigerScoreLitige', donnees);
    } catch (err) {
      const rep = err.reponse || {};
      if (!rep.cascade_requise) throw err;
      if (!await dialogConfirmer('⚠️ ' + err.message + '\n\nConfirmer la correction en cascade ?',
          { ok: 'Corriger quand même', danger: true })) {
        afficherMessage(message, 'Correction annulée.', 'ko');
        return;
      }
      res = await ecrireAdmin('corrigerScoreLitige',
        Object.assign({}, donnees, { forcerCascade: true, requete_id: nouvelIdRequeteAdmin() }));
    }
    afficherMessage(message, '✅ Score corrigé et tracé.' + (res && res.avertissement_phase_suivante
      ? ' ⚠️ La phase suivante de cette catégorie est déjà générée : elle n\'a PAS été régénérée.' : ''), 'ok');
  } catch (err) {
    afficherMessage(message, '⚠️ ' + err.message, 'ko');
  } finally {
    if (bouton) bouton.disabled = false;
  }
  await chargerMatchsLitige(true);   // ⭐ versions relues : un second envoi partirait d'un état à jour
}

/**
 * Dessine le QR code de la table de marque, en local, dans `#acces-saisie-qr`.
 *
 * ⭐ Même bibliothèque et mêmes réglages que le QR du dossier club (js/dossier.js, `dessinerQR`) :
 * `qrcode(0, 'M')` = version automatique, correction moyenne, rendu SVG net à l'écran comme à
 * l'impression. ⛔ Aucun service en ligne : la bibliothèque calcule la matrice ici.
 *
 * ⚠️ La valeur encodée est lue sur `data-url`, que seule `afficherLienAccesScores()` écrit, avec le
 * lien RENDU PAR LE SERVEUR — c'est ce qui garantit que le QR et le lien disent la MÊME chose.
 * ⛔ Ne jamais encoder autre chose ici.
 *
 * Échec possible et assumé : bibliothèque absente (script non chargé) ou adresse trop longue.
 * On masque alors le QR — le lien, lui, reste là. ⛔ Jamais d'erreur qui casserait la page.
 */
function dessinerQrSaisie() {
  const conteneur = document.getElementById('acces-saisie-qr');
  if (!conteneur || typeof qrcode !== 'function') return;
  const url = conteneur.getAttribute('data-url');
  if (!url) return;
  const ancien = conteneur.querySelector('svg');
  if (ancien && conteneur.getAttribute('data-qr') === url) return; // déjà dessiné POUR CETTE adresse
  if (ancien) ancien.remove();                                     // adresse changée : on redessine
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 4, margin: 8 })
      .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
    conteneur.insertAdjacentHTML('afterbegin', svg);
    conteneur.setAttribute('data-qr', url);
  } catch (e) {
    conteneur.hidden = true;
  }
}

/**
 * « Publier le tournoi » OU « Masquer ». À la publication, on enregistre d'abord
 * les infos saisies (nom/date/lieu/description) + l'affiche éventuelle, PUIS on publie.
 * Le masquage, lui, ne fait que dépublier.
 *
 * ⭐ CE QUE LE LOT « PUBLICATION » A CHANGÉ — et rien d'autre :
 *   ① UN SEUL GESTE À LA FOIS (`prendreGestePublication`). Le dialogue de confirmation rendait la
 *     main avant que le bouton soit grisé : deux clics rapides émettaient HUIT requêtes et
 *     reconstruisaient deux fois l'instantané public. Mesuré au banc.
 *   ② LA CONFIGURATION VIENT DE LA RÉPONSE. `publierTournoi` est passée au contrat d'écriture : sa
 *     réponse porte la config RELUE SOUS LE VERROU. ⛔ Le `getConfigAdmin` qui suivait disparaît —
 *     une exécution Apps Script entière par publication. Repli intact avec un backend d'avant.
 *   ③ PLUS DE RELECTURE DE L'ACCÈS AUX SCORES. `majPublication()` la déclenchait ; publier ne change
 *     RIEN à l'accès de la table de marque. ⛔ Ne jamais la réintroduire ici.
 *   ④ ATTENTE BORNÉE, et un résultat INCONNU dit comme tel — jamais comme un échec certain.
 *   ⑤ LE REPEINT EST SORTI DU `try` DE L'ÉCRITURE. Une panne d'affichage (un formulaire absent,
 *     par exemple) s'affichait « ⚠️ <message technique> » alors que la publication avait RÉUSSI :
 *     l'organisateur lisait un échec là où le classeur disait le contraire. Reproduit au banc.
 *
 * ⛔ CE QUI N'A PAS BOUGÉ : les deux questions posées, l'enregistrement préalable des infos (il est
 *   ANNONCÉ dans la question, et le serveur ne réécrit que ce qui change), et le fait que masquer
 *   ne touche NI l'adresse publique NI la page publique — seule la cellule `tournoi_publie` bouge.
 */
async function onPublier() {
  const message = document.getElementById('message-publication');
  const bouton = document.getElementById('bouton-publier');
  const publier = !estPublie(); // on bascule vers l'état inverse
  const question = publier
    ? 'Publier le tournoi ?\n\nLe tournoi deviendra visible du public et le planning apparaîtra automatiquement dans les dossiers des clubs. Les infos saisies (nom, date, lieu, description, affiche) seront aussi enregistrées.'
    : 'Masquer le tournoi ? Les visiteurs reverront l\'écran « à venir » et le planning sera masqué dans les dossiers des clubs.';
  /* ⭐ LE GARDE EST PRIS AVANT LA QUESTION — c'est l'`await` de la question qui laissait passer le
     second clic. ⛔ Et il est relâché dans le `finally` le plus extérieur. */
  if (!prendreGestePublication(publier ? 'publier' : 'masquer')) return;
  try {
    if (!await dialogConfirmer(question, { ok: publier ? 'Publier' : 'Masquer' })) return;
    bouton.disabled = true;
    let reponse = null;
    try {
      if (publier) {
        afficherMessage(message, 'Enregistrement des infos…', 'ok');
        // Filet « par sécurité » à la publication : on enregistre les infos SITE + la date/zone de la
        // carte cadre (payload fusionné ; le backend n'écrit que les champs présents).
        /* ⭐ LA BASE DE FUSION PART AVEC LA DEMANDE. C'est elle qui rend cet enregistrement
           « au passage » inoffensif : un champ que l'organisateur n'a pas touché garde la valeur
           du SERVEUR, même si un autre onglet l'a changée entre-temps. ⛔ Et un champ changé des
           deux côtés différemment fait REFUSER l'ensemble — donc la publication aussi. */
        await ecrireAdmin('enregistrerInfosTournoi',
          avecBaseInfos(Object.assign({}, lireInfosTournoi(), lireCadreTournoi())),
          { delaiMs: DELAI_ECRITURE_PUBLICATION_MS });
        if (afficheDataURI) {
          afficherMessage(message, 'Envoi de l\'affiche…', 'ok');
          await ecrireAdmin('enregistrerAffiche', { affiche: afficheDataURI },
            { delaiMs: DELAI_ECRITURE_PUBLICATION_MS });
        }
        afficherMessage(message, 'Publication…', 'ok');
        reponse = await ecrireAdmin('publierTournoi', { publie: 'oui' },
          { delaiMs: DELAI_ECRITURE_PUBLICATION_MS });
      } else {
        afficherMessage(message, 'Masquage…', 'ok');
        reponse = await ecrireAdmin('publierTournoi', { publie: 'non' },
          { delaiMs: DELAI_ECRITURE_PUBLICATION_MS });
      }
    } catch (erreur) {
      /* ⛔ L'ÉCRITURE, ET ELLE SEULE, EST DANS CE `try`. Un refus lisible du serveur se dit tel
         quel ; une issue INCONNUE ne se dit jamais « échec » — on RELIT, et on peint la vérité. */
      await conclurePublicationRatee(message, publier, erreur);
      return;
    } finally {
      bouton.disabled = false;
    }
    // ⭐ L'état enregistré vient de la réponse (contrat d'écriture) ou, à défaut, d'une relecture.
    await appliquerConfigEnregistree(reponse);
    repeindreApresPublication();
    const inchange = reponse && reponse.contrat === CONTRAT_ECRITURE &&
      Array.isArray(reponse.modifies) && reponse.modifies.length === 0;
    /* ⭐ RIEN N'A CHANGÉ : l'état demandé était DÉJÀ celui du classeur (un autre onglet, un second
       clic). Le serveur n'a écrit aucune cellule ; le dire évite de laisser croire à une écriture. */
    afficherMessage(message, inchange
      ? (publier ? '✅ Déjà publié : rien n’a changé. Le planning est visible dans les dossiers des clubs.'
                 : '✅ Déjà masqué : rien n’a changé. Le planning est retiré des dossiers des clubs.')
      : (publier ? '✅ Tournoi publié. Le planning est maintenant visible dans les dossiers des clubs.'
                 : '✅ Tournoi masqué. Le planning est retiré des dossiers des clubs.'), 'ok');
  } finally {
    relacherGestePublication();
  }
}

/**
 * Le repeint qui suit une publication ou un masquage aboutis.
 * ⛔ HORS du `try` de l'écriture : une panne d'affichage ne doit PAS être annoncée comme une
 *   publication ratée. Chaque appel est donc isolé — l'écriture, elle, est acquise.
 * ⛔ AUCUNE requête : `majPublication` peint, `majTableauBord` peint, et l'accès à la table de
 *   marque n'est pas touché (publier ne le concerne pas).
 */
function repeindreApresPublication() {
  const essayer = function (faire) { try { faire(); } catch (e) { /* l'écriture reste acquise */ } };
  /* ⭐ LE FORMULAIRE D'INFOS N'EST REPEINT QU'ICI — après un enregistrement CONFIRMÉ, donc depuis
     une configuration relue sous le verrou. C'est aussi le moment où la base de fusion se
     renouvelle (`majInfosTournoi` → `memoriserBaseInfos`). ⛔ JAMAIS sur un chemin d'échec : voir
     `repeindreEtatPublication`. */
  essayer(function () { if (typeof majInfosTournoi === 'function') majInfosTournoi(); });
  essayer(function () {
    const form = document.getElementById('form-infos-tournoi');
    if (form && form.tournoi_affiche) form.tournoi_affiche.value = ''; // vide le champ fichier
  });
  repeindreEtatPublication();
}

/**
 * Le repeint de l'ÉTAT DE PUBLICATION seul — sans jamais toucher au formulaire d'infos.
 *
 * ⛔ POURQUOI CETTE SÉPARATION EXISTE. Sur un chemin d'échec (refus du serveur, conflit, réponse
 * perdue), repeindre le formulaire depuis `configCourante` DÉTRUIRAIT la saisie locale que
 * l'organisateur vient de faire — et il la détruirait au pire moment, celui où on lui demande de
 * décider quoi en faire. L'état de publication, lui, doit bien suivre le serveur.
 * ⛔ AUCUNE requête : tout ce qui est appelé ici ne fait que peindre.
 */
function repeindreEtatPublication() {
  const essayer = function (faire) { try { faire(); } catch (e) { /* l'écriture reste acquise */ } };
  essayer(majPublication);
  essayer(function () { if (typeof majTableauBord === 'function') majTableauBord(); });
  // ⚠️ …puis le bouton retrouve son état JUSTE, et cette ligne n'est pas décorative.
  // Le cas concret : on masque un tournoi dont la préparation est incomplète → le bouton redevient
  // « Publier le tournoi », et il resterait CLIQUABLE alors qu'il doit être grisé.
  // ⛔ Aucune règle métier n'est touchée : on ne fait que recalculer un état VISUEL.
  essayer(majVerrouPublier);
}

/**
 * Une publication ou un masquage qui n'a pas abouti.
 * ⛔ REFUS LISIBLE du serveur → son message, tel quel : rien n'a été écrit, l'écran n'a rien à relire.
 * ⭐ ISSUE INCONNUE (délai dépassé, réseau, HTTP) → l'exécution a pu aboutir CHEZ GOOGLE. On RELIT la
 *   configuration — une LECTURE, ⛔ jamais un rejeu de l'écriture — et on peint ce que le serveur a
 *   VRAIMENT. Puis on dit à l'organisateur que le résultat n'est pas confirmé, et que ce qu'il voit
 *   vient d'être relu. C'est la seule façon honnête de ne pas transformer une réponse perdue en
 *   échec certain — ni en succès.
 */
async function conclurePublicationRatee(message, publier, erreur) {
  /* ⭐ LE CONFLIT DE FUSION A SON PROPRE MESSAGE : c'est le seul refus où l'organisateur doit
     comparer deux versions, donc le seul qui mérite d'être détaillé champ par champ. */
  const conflit = conflitInfosTournoi(erreur);
  if (conflit) { rendreConflitInfosTournoi(message, conflit); return; }
  if (!issueInconnuePublication(erreur)) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    /* ⛔ PAS `repeindreApresPublication()` : un refus ne doit pas effacer la saisie locale. */
    repeindreEtatPublication();
    return;
  }
  let relu = false;
  try { configCourante = await lireConfigAdmin(undefined, { delaiMs: DELAI_ECRITURE_PUBLICATION_MS }); relu = true; }
  catch (e) { /* même la relecture est en panne : on ne prétendra rien de l'état */ }
  /* ⛔ MÊME RÈGLE ICI, et elle compte davantage : la configuration vient d'être RELUE, donc
     repeindre le formulaire remplacerait la saisie de l'organisateur par l'état distant, sans
     qu'il l'ait demandé. On ne repeint que l'état de publication. */
  repeindreEtatPublication();
  afficherMessage(message, messageInconnuPublication(
    (publier ? 'la publication' : 'le masquage') + ' n’est pas confirmé', erreur,
    relu ? 'l’état de publication affiché ci-dessus vient d’être relu sur le serveur ; ta saisie des ' +
           'infos est conservée telle quelle'
         : 'l’état affiché n’a PAS pu être relu — recharge la page avant de recliquer'), 'ko');
}

/** Le refus est-il un CONFLIT DE FUSION des infos ? ⛔ Reconnu par son CODE, pas par son texte. */
function conflitInfosTournoi(erreur) {
  const r = erreur && erreur.reponse;
  return (r && r.code === 'conflit_infos_tournoi' && Array.isArray(r.conflits) && r.conflits.length)
    ? r : null;
}

/**
 * Le rendu d'un conflit de fusion.
 *
 * ⭐ CE QU'IL FAIT : il NOMME les champs avec les libellés que le SERVEUR a fournis, montre côte à
 * côte ce que l'écran voulait écrire et ce que le serveur porte, et dit les deux seules suites
 * possibles — relire, ou reprendre sa saisie.
 * ⛔ CE QU'IL NE FAIT PAS, et chaque point est une exigence :
 *   · il ne repeint PAS le formulaire : la saisie locale est conservée, intacte ;
 *   · il ne RENOUVELLE PAS la base de fusion : rien n'a été confirmé par le serveur, la base doit
 *     donc rester celle du dernier état confirmé, sinon le prochain clic écraserait ;
 *   · il ne publie PAS, et il ne réémet RIEN automatiquement ;
 *   · il ne propose pas d'« écraser quand même » : ce serait redonner à l'aveugle ce que la fusion
 *     vient d'empêcher. Pour imposer sa version, l'organisateur ressaisit le champ en connaissant
 *     la valeur distante — qui est affichée ci-dessous.
 */
function rendreConflitInfosTournoi(message, refus) {
  const lignes = refus.conflits.map(function (c) {
    return '   • ' + (c.libelle || c.champ) + ' — sur cet écran : « ' + c.demande +
      ' » · sur le serveur : « ' + c.serveur + ' »';
  });
  afficherMessage(message,
    '⚠️ Ces informations ont changé ailleurs depuis que cet écran les a chargées :\n' +
    lignes.join('\n') +
    '\nRIEN n’a été enregistré et le tournoi n’a PAS été publié. Ta saisie est conservée.\n' +
    'Deux suites possibles : « Rafraîchir » puis recharger la page pour repartir des valeurs du ' +
    'serveur, ou reprendre ta saisie en tenant compte des valeurs ci-dessus, puis republier.', 'ko');
  /* ⛔ L'état de publication, lui, n'a pas bougé : on ne le repeint même pas — aucune écriture
     n'a eu lieu, et `majVerrouPublier` suffit à rendre le bouton à son état juste (le `finally`
     d'`onPublier` s'en charge déjà). */
}
