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
   ÉCRITURES DE L'ÉCRAN « INVITER UN CLUB » — une règle pour toutes (lot « Inviter un club », 2ᵉ passage)
   ⭐ Délai client BORNÉ pour chaque écriture de l'écran : 30 s (cartes, clubs), 90 s (un e-mail), 90 s + 30 s par club
      pour l'envoi groupé (plafond 6 min) — voir delaiEcritureInvitation.
   ⛔ Issue INCERTAINE (délai dépassé, réseau coupé, statut HTTP d'erreur ou réponse illisible) : l'écriture a pu avoir
      lieu. Rien n'est renvoyé automatiquement (le délai n'élargit jamais les listes fermées de js/api.js) ; le bouton
      est libéré, le message dit « non confirmé », une relecture SÛRE est lancée et les saisies restent à l'écran.
   ⭐ REFUS du serveur (réponse lisible `{ error }`, verrou occupé compris) : rien n'a été écrit, c'est dit tel quel.
   ⭐ Un envoi d'e-mail = une action utilisateur = au plus un e-mail : bouton occupé, second clic ignoré, et un nouvel
      envoi après une issue incertaine demande confirmation (le club l'a peut-être déjà reçu).
   -------------------------------------------------------------------------- */
const DELAI_ECRITURE_INVITATION_MS = 30000;
/* ⭐ Un e-mail coûte bien plus qu'une carte (modèle de coût, estimations et non mesures Google : invitation 11,9 s, haute
 *   26,8 s ; envoi groupé ≈ 7,6 s de plus par club, haute ≈ 19 s — 11 clubs : 88 s, haute 218 s). Un délai unique de 30 s
 *   dirait « non confirmé » un envoi groupé qui réussit : délai propre aux e-mails, proportionnel au nombre de clubs pour
 *   l'envoi groupé, plafonné à la limite d'exécution d'Apps Script (6 min). */
const DELAI_ENVOI_EMAIL_MS = 90000;
const DELAI_ENVOI_PAR_CLUB_MS = 30000;
const DELAI_ENVOI_MAX_MS = 360000;
const ACTIONS_EMAIL_INVITATION = ['envoyerInvitationClub', 'envoyerDossierEmail', 'relancerPaiementClub', 'renvoyerConfirmationReponseClub'];

/** Le délai client d'une écriture de l'écran. `nbClubs` : clubs visés par l'envoi groupé. PUR. */
function delaiEcritureInvitation(action, nbClubs) {
  if (action === 'envoyerInvitationsGroupe') {
    return Math.min(DELAI_ENVOI_MAX_MS, DELAI_ENVOI_EMAIL_MS + DELAI_ENVOI_PAR_CLUB_MS * Math.max(1, Number(nbClubs) || 0));
  }
  return ACTIONS_EMAIL_INVITATION.indexOf(action) !== -1 ? DELAI_ENVOI_EMAIL_MS : DELAI_ECRITURE_INVITATION_MS;
}

/** Écriture de l'écran, bornée. ⛔ Jamais de renvoi : `delaiMs` ne rend aucune écriture rejouable (js/api.js).
 *  L'erreur porte le délai appliqué (`delaiMs`) pour que le message le dise exactement. */
function ecrireInvitation(action, data, nbClubs) {
  const delaiMs = delaiEcritureInvitation(action, nbClubs);
  return ecrireAdmin(action, data, { delaiMs: delaiMs }).catch(function (erreur) {
    if (erreur && typeof erreur === 'object' && erreur.delaiMs == null) { try { erreur.delaiMs = delaiMs; } catch (e) { /* objet figé */ } }
    throw erreur;
  });
}

/** Vrai si l'erreur laisse l'issue INCONNUE (délai, réseau, HTTP) — faux pour un refus lisible du serveur ou une
 *  saisie de clé annulée (rien n'est parti). */
function issueIncertaine(erreur) {
  if (erreur && erreur.reponse && typeof erreur.reponse === 'object') return false;
  return !/^Action annulée/.test(String((erreur && erreur.message) || ''));
}

/** La cause lisible d'une issue incertaine, pour le message. */
function causeIncertaine(erreur) {
  if (erreur && erreur.name === 'AbortError') return 'délai de ' + Math.round((erreur.delaiMs || DELAI_ECRITURE_INVITATION_MS) / 1000) + ' s dépassé';
  return String((erreur && erreur.message) || 'erreur réseau').replace(/\.$/, '');
}

/** « ⚠️ Réponse du serveur non reçue (cause) : <quoi> non confirmé(e). Rien n'est renvoyé automatiquement ; <suite>. » */
function messageIncertain(quoi, erreur, suite) {
  return '⚠️ Réponse du serveur non reçue (' + causeIncertaine(erreur) + ') : ' + quoi + '. Rien n’est renvoyé ' +
    'automatiquement' + (suite ? ' ; ' + suite : '') + '.';
}

/* Envois d'e-mails en cours ou à l'issue incertaine, par geste et par club : 'invitation|clamart', 'dossier|clamart'… */
const envoisEnCours = new Set();
const envoisIncertains = new Set();
function cleEnvoi(type, nom) {
  return type + '|' + String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}
function envoiEnCours(type, nom) { return envoisEnCours.has(cleEnvoi(type, nom)); }

/* ⭐ E-MAILS HORS VERROU (lot « Inviter un club », 5ᵉ passage) — chaque geste d'envoi porte un identifiant (`id_envoi`) :
   repris TEL QUEL au clic qui suit une issue incertaine, il permet au serveur de répondre « déjà envoyé » (`rejeu`) au lieu
   d'écrire une seconde fois au club. Un refus « parti il y a moins de 5 min » ou « envoi interrompu, non confirmé » demande
   une confirmation explicite, puis UN renvoi (`confirmer_renvoi`). ⛔ Jamais de renvoi automatique. Backend d'avant : ces
   champs sont ignorés, tout se passe comme avant. */
const idsEnvois = new Map();
function idEnvoiPour(cle, incertain) {
  if (!incertain || !idsEnvois.has(cle)) {
    const alea = (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    idsEnvois.set(cle, alea);
  }
  return idsEnvois.get(cle);
}
function oublierIdEnvoi(cle) { idsEnvois.delete(cle); }
const REFUS_ENVOI_A_CONFIRMER = ['envoi_recent', 'envoi_non_confirme'];
/** Écriture d'un e-mail : identifiant du geste, confirmation explicite d'un renvoi que le serveur a retenu. */
async function ecrireEnvoiEmail(action, data, options) {
  const o = options || {};
  const donnees = Object.assign({}, data, { id_envoi: idEnvoiPour(o.cle, o.incertain), confirmer_renvoi: o.incertain ? 'oui' : 'non' });
  try {
    return await ecrireInvitation(action, donnees, o.nbClubs);
  } catch (erreur) {
    const rep = erreur && erreur.reponse;
    if (!rep || REFUS_ENVOI_A_CONFIRMER.indexOf(rep.code) === -1) throw erreur;
    if (!await dialogConfirmer(rep.error + '\n\nEnvoyer quand même ?', { ok: 'Envoyer quand même' })) {
      const annule = new Error('Renvoi annulé : rien n’a été envoyé.');
      annule.reponse = { error: annule.message, code: 'renvoi_annule' };
      throw annule;
    }
    return ecrireInvitation(action, Object.assign({}, donnees, { confirmer_renvoi: 'oui' }), o.nbClubs);
  }
}

/** Boutons d'un envoi (liste des clubs, suivi, fiche) : état occupé posé ou retiré, sans redessiner la liste. */
function marquerBoutonsEnvoi(selecteur, occupe, texteOccupe) {
  if (typeof document.querySelectorAll !== 'function') return;
  Array.prototype.forEach.call(document.querySelectorAll(selecteur), function (bouton) {
    if (typeof bouton.setAttribute !== 'function') return;
    if (occupe) {
      if (!bouton.hasAttribute('data-texte-libre')) bouton.setAttribute('data-texte-libre', bouton.textContent);
      bouton.disabled = true; bouton.setAttribute('aria-busy', 'true'); bouton.textContent = texteOccupe || 'Envoi…';
    } else if (bouton.getAttribute('aria-busy') === 'true') {
      bouton.removeAttribute('aria-busy');
      if (bouton.hasAttribute('data-texte-libre')) { bouton.textContent = bouton.getAttribute('data-texte-libre'); bouton.removeAttribute('data-texte-libre'); }
      bouton.disabled = false;
    }
  });
}

/* ⭐ CARTES DE CONFIGURATION DE L'ÉCRAN — ce qu'elles affichent, au format enregistré (Config). Sert à trois choses :
   · savoir si une carte porte une saisie NON ENREGISTRÉE (aucun e-mail ne part avec des valeurs que le serveur n'a pas) ;
   · redessiner une carte sans écraser un brouillon ni le champ qui a le focus (enregistrer le parking, relire la
     configuration, « Rafraîchir ») ;
   · repérer une frappe faite PENDANT l'envoi (elle reste un brouillon, et c'est dit). */
function valeurCaseCarte(f, nom) { return f[nom] && f[nom].checked ? 'oui' : 'non'; }
function valeurRadioCarte(f, nom) {
  if (f[nom] && f[nom].value !== undefined) return String(f[nom].value || '');     // RadioNodeList : valeur cochée
  const coche = typeof f.querySelector === 'function' ? f.querySelector('[name="' + nom + '"]:checked') : null;
  return coche ? String(coche.value || '') : '';
}

/** État « occupé » d'un bouton (désactivé, aria-busy, libellé) — et son retour. Tolère un élément minimal. */
function occuperBouton(bouton, texte) {
  if (!bouton) return;
  bouton.disabled = true;
  if (typeof bouton.setAttribute === 'function') bouton.setAttribute('aria-busy', 'true');
  if (texte) bouton.textContent = texte;
}
function libererBouton(bouton, texte) {
  if (!bouton) return;
  bouton.disabled = false;
  if (typeof bouton.removeAttribute === 'function') bouton.removeAttribute('aria-busy');
  if (texte !== undefined) bouton.textContent = texte;
}
const CARTES_INVITATION = {
  modalites: { form: 'form-modalites', titre: 'Modalités d’inscription', onglet: 'Invitation initiale',
    lire: function (f) {
      return { date_limite_confirmation: f.date_limite_confirmation.value, tarif_engagement_oui: valeurCaseCarte(f, 'tarif_engagement_oui'),
        tarif_engagement_montant: f.tarif_engagement_montant.value.trim(), tarif_engagement_mode: f.tarif_engagement_mode.value,
        tarif_engagement_modalites: f.tarif_engagement_modalites.value.trim() };
    },
    enregistre: function (g) {
      return { date_limite_confirmation: g.date_limite_confirmation, tarif_engagement_oui: estOui(g.tarif_engagement_oui) ? 'oui' : 'non',
        tarif_engagement_montant: g.tarif_engagement_montant, tarif_engagement_mode: modeTarifEngagement(g),
        tarif_engagement_modalites: g.tarif_engagement_modalites };
    } },
  reponse: { form: 'form-reponse', titre: 'Réponse à l’invitation', onglet: 'Invitation initiale',
    lire: function (f) {
      return { date_limite_reponse: f.date_limite_reponse.value, contact_reponse_nom: f.contact_reponse_nom.value.trim(),
        contact_reponse_tel: f.contact_reponse_tel.value.replace(/\D/g, ''), contact_reponse_email: f.contact_reponse_email.value.trim(),
        email_expediteur: f.email_expediteur.value.trim() };
    },
    enregistre: function (g) {
      return { date_limite_reponse: g.date_limite_reponse, contact_reponse_nom: g.contact_reponse_nom,
        contact_reponse_tel: String(g.contact_reponse_tel || '').replace(/\D/g, ''), contact_reponse_email: g.contact_reponse_email,
        email_expediteur: g.email_expediteur };
    } },
  contacts: { form: 'form-contacts-securite', titre: 'Contacts & sécurité', onglet: 'Invitation initiale',
    lire: function (f) {
      return { referent_nom: f.referent_nom.value.trim(), referent_tel: f.referent_tel.value.replace(/\D/g, ''),
        securite_secours_oui: valeurCaseCarte(f, 'securite_secours_oui'), securite_secours_precisions: f.securite_secours_precisions.value.trim(),
        securite_referent_identique: valeurCaseCarte(f, 'securite_referent_identique'),
        securite_referent_nom: f.securite_referent_nom.value.trim(), securite_referent_tel: f.securite_referent_tel.value.replace(/\D/g, '') };
    },
    enregistre: function (g) {
      return { referent_nom: g.referent_nom, referent_tel: String(g.referent_tel || '').replace(/\D/g, ''),
        securite_secours_oui: estOui(g.securite_secours_oui) ? 'oui' : 'non', securite_secours_precisions: g.securite_secours_precisions,
        securite_referent_identique: String(g.securite_referent_identique || 'oui').toLowerCase() !== 'non' ? 'oui' : 'non',
        securite_referent_nom: g.securite_referent_nom, securite_referent_tel: String(g.securite_referent_tel || '').replace(/\D/g, '') };
    } },
  surplace: { form: 'form-surplace', titre: 'Sur place', onglet: 'Invitation initiale',
    lire: function (f) {
      const v = {};
      ['buvette_disponible', 'espace_sandwich_disponible', 'boutique_disponible'].forEach(function (n) { v[n] = valeurCaseCarte(f, n); });
      ['repas_sur_place', 'gouter_fin_tournoi'].forEach(function (p) {
        const actif = valeurCaseCarte(f, p + '_oui');
        const mode = actif === 'oui' ? valeurRadioCarte(f, p + '_mode') : '';
        v[p + '_oui'] = actif; v[p + '_mode'] = mode;
        v[p + '_montant'] = mode === 'prix_personne' ? String(f[p + '_montant'].value || '').trim().replace(',', '.') : '';
      });
      return v;
    },
    enregistre: function (g) {
      const v = {};
      ['buvette_disponible', 'espace_sandwich_disponible', 'boutique_disponible'].forEach(function (n) { v[n] = estOui(g[n]) ? 'oui' : 'non'; });
      ['repas_sur_place', 'gouter_fin_tournoi'].forEach(function (p) {
        const actif = estOui(g[p + '_oui']) ? 'oui' : 'non';
        const mode = actif === 'oui' ? String(g[p + '_mode'] || '') : '';
        v[p + '_oui'] = actif; v[p + '_mode'] = mode;
        v[p + '_montant'] = mode === 'prix_personne' ? String(g[p + '_montant'] || '').trim().replace(',', '.') : '';
      });
      return v;
    } },
  parking: { form: 'form-parking', titre: 'Parking & accès', onglet: 'Dossier final',
    lire: function (f) { return { parking_texte: f.parking_texte.value.trim(), parking_photo: parkingDataURI ? 'nouvelle' : '' }; },
    enregistre: function (g) { return { parking_texte: g.parking_texte, parking_photo: '' }; } },
  encadrement: { form: 'form-encadrement', titre: 'Encadrement & assurance', onglet: 'Dossier final',
    lire: function (f) {
      return { encadrement_ratio: f.encadrement_ratio.value.trim(), encadrement_diplomes: f.encadrement_diplomes.value.trim(),
        assurance_attestation_requise: valeurCaseCarte(f, 'assurance_attestation_requise') };
    },
    enregistre: function (g) {
      return { encadrement_ratio: g.encadrement_ratio, encadrement_diplomes: g.encadrement_diplomes,
        assurance_attestation_requise: estOui(g.assurance_attestation_requise) ? 'oui' : 'non' };
    } }
};
/* Ce que chaque carte montrait à son dernier remplissage (ou après son dernier enregistrement), champ par champ : la
   référence des brouillons. */
const basesCartesInvitation = {};

function valeurCarteNette(v) { return String(v == null ? '' : v).trim(); }
function formeValeursCarte(v) {
  const o = {};
  Object.keys(v || {}).sort().forEach(function (k) { o[k] = valeurCarteNette(v[k]); });
  return JSON.stringify(o);
}
/* Affichages conditionnels à recalculer après une mise à jour ciblée d'une carte. */
const APRES_REMPLISSAGE_CARTE = {
  modalites: function (f) { majAffichageTarif(f); },
  surplace: function () { if (typeof majAffichageOptionsSurPlace === 'function') majAffichageOptionsSurPlace(); },
  contacts: function (f) { if (typeof majAffichageContacts === 'function') majAffichageContacts(f); }
};
/** Écrit UN champ d'une carte (case, groupe radio, liste ou texte) avec sa valeur au format enregistré. */
function ecrireChampCarte(f, nom, valeur) {
  const champ = f[nom];
  if (!champ) return;
  if (champ.length !== undefined && champ[0] && champ[0].type === 'radio') {
    Array.prototype.forEach.call(champ, function (r) { r.checked = r.value === valeur; });
  } else if (champ.type === 'checkbox') champ.checked = valeur === 'oui';
  else champ.value = valeur;
}
function champCarteAFocus(f, nom) {
  const actif = document.activeElement;
  return !!actif && actif.name === nom && typeof f.contains === 'function' && f.contains(actif);
}
function valeursCarte(cle) {
  const carte = CARTES_INVITATION[cle];
  const f = carte && document.getElementById(carte.form);
  return f ? carte.lire(f) : null;
}
/** La carte montre-t-elle autre chose que ce que le serveur a enregistré (tel que connu) ? */
function carteNonEnregistree(cle) {
  const v = valeursCarte(cle);
  if (!v) return false;
  return formeValeursCarte(v) !== formeValeursCarte(CARTES_INVITATION[cle].enregistre((configCourante && configCourante.global) || {}));
}
/** L'organisateur a-t-il modifié la carte depuis son dernier remplissage, ou y a-t-il le focus ? */
function carteEnCoursDeSaisie(cle) {
  const carte = CARTES_INVITATION[cle];
  const f = carte && document.getElementById(carte.form);
  if (!f) return false;
  const actif = document.activeElement;
  if (actif && actif !== document.body && typeof f.contains === 'function' && f.contains(actif) &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(String(actif.tagName || actif.tag || '').toUpperCase())) return true;
  const base = basesCartesInvitation[cle];
  return base !== undefined && formeValeursCarte(base) !== formeValeursCarte(carte.lire(f));
}
/** Prend la carte telle qu'elle est comme référence (après un remplissage, ou avec les valeurs qui viennent d'être enregistrées). */
function noterBaseCarte(cle, valeurs) {
  const v = valeurs || valeursCarte(cle);
  if (!v) return;
  const base = {};
  Object.keys(v).forEach(function (k) { base[k] = valeurCarteNette(v[k]); });
  basesCartesInvitation[cle] = base;
}
/**
 * Remplit une carte depuis la configuration. Sans saisie en cours : remplissage complet. ⭐ Carte en cours de saisie :
 * mise à jour CIBLÉE — un champ modifié par l'organisateur, ou qui a le focus, reste tel quel ; les autres suivent le
 * serveur (un réglage changé ailleurs apparaît, et ne sera pas renvoyé avec son ancienne valeur). @return {boolean} complet
 */
function remplirCarteSansBrouillon(cle, remplir) {
  if (!carteEnCoursDeSaisie(cle)) {
    remplir();
    noterBaseCarte(cle);
    return true;
  }
  const carte = CARTES_INVITATION[cle];
  const f = document.getElementById(carte.form);
  const base = basesCartesInvitation[cle] || {};
  const actuel = carte.lire(f);
  const serveur = carte.enregistre((configCourante && configCourante.global) || {});
  Object.keys(serveur).forEach(function (k) {
    if (k === 'parking_photo') return;                           // photo choisie : jamais touchée par un redessin
    const v = valeurCarteNette(serveur[k]);
    if (valeurCarteNette(actuel[k]) !== valeurCarteNette(base[k]) || champCarteAFocus(f, k)) return;   // saisie en cours
    if (valeurCarteNette(actuel[k]) !== v) ecrireChampCarte(f, k, v);
    base[k] = v;
  });
  basesCartesInvitation[cle] = base;
  if (APRES_REMPLISSAGE_CARTE[cle]) APRES_REMPLISSAGE_CARTE[cle](f);
  return false;
}
/** Titres des cartes d'une liste qui ne sont pas enregistrées. */
function cartesNonEnregistrees(cles) {
  return cles.filter(carteNonEnregistree).map(function (cle) { return '« ' + CARTES_INVITATION[cle].titre + ' »'; });
}
/** ⛔ Un e-mail ne part pas avec des valeurs affichées que le serveur n'a pas : il faut d'abord enregistrer. */
function refusEmailSaisiesNonEnregistrees(cles) {
  const cartes = cartesNonEnregistrees(cles);
  if (!cartes.length) return '';
  return '⚠️ Enregistre d’abord ' + cartes.join(', ') + ' : l’e-mail reprend ces cartes, et il ne partira pas avec des ' +
    'valeurs que le serveur n’a pas. Rien n’a été envoyé.';
}
const CARTES_EMAIL_INVITATION = ['modalites', 'reponse', 'contacts', 'surplace'];
const CARTES_EMAIL_DOSSIER = ['modalites', 'contacts', 'parking', 'encadrement'];

/** Après une issue incertaine sur une carte : relecture de la configuration (sans toucher aux saisies), puis verdict. */
async function verifierCarteApresIncertitude(cle, envoye, message, texteOk) {
  let cfg;
  try { cfg = await lireConfigAdmin(undefined, { delaiMs: DELAI_ECRITURE_INVITATION_MS }); }
  catch (e) { return false; }                                   // le message « non confirmé » reste affiché
  configCourante = cfg;
  const carte = CARTES_INVITATION[cle];
  const enregistre = carte.enregistre(cfg.global || {});
  const confirme = Object.keys(envoye).every(function (k) {
    return !(k in enregistre) || String(enregistre[k] == null ? '' : enregistre[k]).trim() === String(envoye[k] == null ? '' : envoye[k]).trim();
  });
  if (confirme) {
    noterBaseCarte(cle, Object.assign(valeursCarte(cle) || {}, envoye));
    afficherMessage(message, texteOk + ' (confirmé par la relecture du serveur)', 'ok');
  } else {
    afficherMessage(message, '⚠️ Relecture faite : l’enregistrement n’a pas eu lieu. Tes saisies sont conservées : clique de ' +
      'nouveau pour enregistrer.', 'ko');
  }
  return confirme;
}

/* --------------------------------------------------------------------------
   INVITATION PHASE 1 — aperçu de l'email (live) + envoi individuel / groupé.
   L'aperçu suit le MÊME principe que celui de la carte « Infos du tournoi » :
   mise à jour EN DIRECT à partir des données du tournoi et des valeurs LIVE de
   toutes les cartes du menu « Invitation initiale ». Le contenu ENVOYÉ (objet +
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
  return '<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:24px auto 0;">'
    + '<tr>' + cellules + '</tr></table>';
}

/** Lien d'invitation d'EXEMPLE pour l'aperçu (le vrai lien, avec jeton, est construit par club). */
function lienInvitationApercu() {
  return lienInvitationPublique() + '?club=EXEMPLE&token=EXEMPLE';
}

/** État « global » pour l'invitation : config enregistrée + valeurs LIVE de toutes les cartes
 *  du menu « Invitation initiale » (pour un aperçu qui suit la frappe). */
function globalInvitation() {
  const g = Object.assign({}, configCourante.global || {});
  const fm = document.getElementById('form-modalites');
  if (fm) {
    g.date_limite_confirmation = fm.date_limite_confirmation.value;
    g.tarif_engagement_oui = fm.tarif_engagement_oui.checked ? 'oui' : 'non';
    g.tarif_engagement_montant = fm.tarif_engagement_montant.value;
    g.tarif_engagement_mode = fm.tarif_engagement_mode.value;
    g.tarif_engagement_modalites = fm.tarif_engagement_modalites.value;
  }
  const fr = document.getElementById('form-reponse');
  if (fr) {
    g.date_limite_reponse = fr.date_limite_reponse.value;
    g.contact_reponse_nom = fr.contact_reponse_nom.value;
    g.contact_reponse_tel = fr.contact_reponse_tel.value;
    g.contact_reponse_email = fr.contact_reponse_email.value;
  }
  const fc = document.getElementById('form-contacts-securite');
  if (fc) {
    g.referent_nom = fc.referent_nom.value;
    g.referent_tel = fc.referent_tel.value;
    g.securite_secours_oui = fc.securite_secours_oui.checked ? 'oui' : 'non';
    g.securite_secours_precisions = fc.securite_secours_precisions.value;
    g.securite_referent_identique = fc.securite_referent_identique.checked ? 'oui' : 'non';
    g.securite_referent_nom = fc.securite_referent_nom.value;
    g.securite_referent_tel = fc.securite_referent_tel.value;
  }
  const fs = document.getElementById('form-surplace');
  if (fs) {
    g.buvette_disponible = fs.buvette_disponible.checked ? 'oui' : 'non';
    g.espace_sandwich_disponible = fs.espace_sandwich_disponible.checked ? 'oui' : 'non';
    g.boutique_disponible = fs.boutique_disponible.checked ? 'oui' : 'non';
    g.repas_sur_place_oui = fs.repas_sur_place_oui.checked ? 'oui' : 'non';
    g.repas_sur_place_mode = fs.repas_sur_place_oui.checked
      ? String(fs.repas_sur_place_mode.value || '') : '';
    g.repas_sur_place_montant = g.repas_sur_place_mode === 'prix_personne'
      ? fs.repas_sur_place_montant.value : '';
    g.gouter_fin_tournoi_oui = fs.gouter_fin_tournoi_oui.checked ? 'oui' : 'non';
    g.gouter_fin_tournoi_mode = fs.gouter_fin_tournoi_oui.checked
      ? String(fs.gouter_fin_tournoi_mode.value || '') : '';
    g.gouter_fin_tournoi_montant = g.gouter_fin_tournoi_mode === 'prix_personne'
      ? fs.gouter_fin_tournoi_montant.value : '';
  }
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
const EMAIL_FOND = '#f3f6fa', EMAIL_PANNEAU = '#f8fafc';
const EMAIL_TABLEAU_INFOS = 'border-collapse:separate;width:100%;background:' + EMAIL_PANNEAU
  + ';border:1px solid ' + EMAIL_FILET + ';border-radius:12px;';

/** Échappe un texte libre PUIS convertit ses sauts de ligne en <br> (pour l'insérer dans le
 *  HTML de l'email en préservant les retours à la ligne saisis par l'admin). */
function nl2brEmail(s) {
  return echapper(String(s == null ? '' : s)).replace(/\r?\n/g, '<br>');
}

/** Titre de section de l'email (barre bleue de la charte). */
function emailTitreSection(t) {
  return '<h2 style="margin:32px 0 14px;padding:0 0 10px 12px;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;'
    + 'letter-spacing:.8px;font-size:16px;line-height:1.35;color:' + EMAIL_NAVY + ';border-left:4px solid ' + EMAIL_BLEU
    + ';border-bottom:1px solid ' + EMAIL_FILET + ';">'
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
    return '<td align="center" style="padding:10px 3px 0;' + A + 'font-size:21px;line-height:1.25;font-weight:bold;color:' + EMAIL_NAVY + ';">'
      + echapper(e.h) + '</td>';
  }).join('');
  const titres = etapes.map(function (e) {
    return '<td align="center" style="padding:4px 6px 0;' + A + 'font-size:12px;line-height:1.35;font-weight:bold;color:' + EMAIL_TXT + ';">'
      + echapper(e.t) + '</td>';
  }).join('');
  const notes = etapes.some(function (e) { return e.n; })
    ? '<tr>' + etapes.map(function (e) {
        return '<td align="center" style="padding:4px 6px 0;' + A + 'font-size:11px;line-height:1.4;color:' + EMAIL_GRIS + ';">'
          + (e.n ? echapper(e.n) : '&nbsp;') + '</td>';
      }).join('') + '</tr>'
    : '';

  return '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;width:100%;'
    + 'background:' + EMAIL_PANNEAU + ';border:1px solid ' + EMAIL_FILET + ';border-radius:12px;">'
    + '<tr><td style="padding:20px 12px 18px;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;">'
    + '<tr>' + rail + '</tr><tr>' + heures + '</tr><tr>' + titres + '</tr>' + notes
    + '</table></td></tr></table>';
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

  const tdLib = 'style="' + A + 'font-size:12px;line-height:1.45;color:' + EMAIL_GRIS + ';padding:7px 12px 7px 16px;width:120px;vertical-align:top;"';
  const tdVal = 'style="' + A + 'font-size:13px;line-height:1.45;color:' + EMAIL_TXT + ';font-weight:bold;padding:7px 16px 7px 0;"';
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
    apresMidi = '<tr><td colspan="2" style="' + A + 'font-size:12px;color:#274a68;background:#eef6fd;'
      + 'padding:12px 16px;border-top:1px solid ' + EMAIL_FILET + ';line-height:1.6;">'
      + '<strong>Après-midi — ' + echapper(DOSSIER_FORMATS[cle]) + '</strong> : '
      + echapper(DOSSIER_FORMATS_DESC[cle]) + '</td></tr>';
  }

  return '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" '
    + 'style="border-collapse:separate;width:100%;border:1px solid ' + EMAIL_FILET + ';border-radius:12px;margin:0 0 16px;'
    + 'box-shadow:0 3px 10px rgba(12,28,46,.06);">'
    + '<tr><td style="background:' + EMAIL_NAVY + ';padding:11px 16px;border-radius:11px 0 0 0;' + A
    + 'font-size:18px;line-height:1.3;font-weight:bold;color:#ffffff;">' + echapper(String(c.categorie || '')) + '</td>'
    + '<td style="background:' + EMAIL_NAVY + ';padding:11px 16px;border-radius:0 11px 0 0;text-align:right;">'
    + (badge ? '<span style="display:inline-block;background:' + EMAIL_BLEU + ';color:#ffffff;border-radius:12px;'
      + 'padding:3px 10px;' + A + 'font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">'
      + echapper(badge) + '</span>' : '&nbsp;') + '</td></tr>'
    + '<tr><td colspan="2" style="padding:8px 0;">'
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
    html += '<p style="margin:16px 0 0;padding:12px 16px;background:#fdf4e3;border-left:4px solid #e5a33c;border-radius:8px;'
      + A + 'font-size:12px;color:#8a5a0c;line-height:1.6;">⚠️ <strong>Rappel important</strong> — '
      + echapper(FFR_RAPPEL_EFFECTIF) + '</p>';
  }
  const aPoules = cats.some(function (c) {
    return String(c.format_apresmidi || '').trim().toUpperCase() === 'POULES_NIVEAU';
  });
  if (aPoules) {
    html += '<p style="margin:16px 0 0;padding:12px 16px;background:#eef5fc;border-left:4px solid ' + EMAIL_BLEU + ';border-radius:8px;'
      + A + 'font-size:12px;color:#274a68;line-height:1.6;">💡 <strong>Pourquoi ce format ?</strong> '
      + echapper(FFR_POURQUOI_FORMAT) + '</p>';
  }
  return html;
}

/**
 * Corps HTML de l'email d'invitation (compatible clients mail : tableaux + styles en ligne).
 * L'email EST l'invitation COMPLÈTE (décision Romain) : même contenu que la page vitrine —
 * blason centré, surtitre « a le plaisir de vous inviter », grand titre, date · lieu, affiche
 * centrée, descriptif complet, UNE CARTE DÉTAILLÉE PAR CATÉGORIE
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
  let entete = '<div style="text-align:center;background:#f7fbff;border:1px solid #e2edf7;border-radius:14px;padding:26px 20px 24px;">'
    + '<img src="' + echapper(urlBlasonEmail()) + '" alt="" width="80" '
    + 'style="display:block;width:80px;height:auto;margin:0 auto 14px;">'
    + '<p style="margin:0;' + A + 'text-transform:uppercase;letter-spacing:2.5px;font-size:12px;line-height:1.5;color:' + EMAIL_BLEU + ';font-weight:bold;">'
    + 'Vous êtes invités</p>'
    + '<h1 style="margin:10px 0 4px;' + A + 'font-size:30px;line-height:1.18;color:' + EMAIL_NAVY + ';">' + nom + '</h1>'
    + ((date || lieu) ? '<p style="margin:8px 0 0;' + A + 'font-weight:bold;font-size:15px;line-height:1.5;color:' + EMAIL_NAVY + ';">'
      + [date, lieu].filter(Boolean).join('<span style="color:' + EMAIL_BLEU + ';"> · </span>') + '</p>' : '')
    + '<div style="width:96px;height:4px;background:' + EMAIL_BLEU + ';margin:18px auto 0;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>'
    + '</div>';

  // L'affiche du tournoi, centrée et plus grande (l'email reste léger : 340 px maxi).
  const blocAffiche = imgSrc
    ? '<img src="' + echapper(imgSrc) + '" alt="Affiche — ' + nom + '" '
      + 'style="display:block;width:100%;max-width:360px;height:auto;border-radius:12px;margin:26px auto 0;box-shadow:0 5px 18px rgba(12,28,46,.12);">'
    : '';

  // Le descriptif COMPLET du tournoi (même contenu que la page vitrine — l'email EST
  // l'invitation complète, pas un teaser). Un paragraphe par ligne saisie.
  const blocDescription = String(g.tournoi_description || '').trim()
    ? '<p style="margin:22px 0 0;padding:18px 20px;background:' + EMAIL_PANNEAU + ';border:1px solid ' + EMAIL_FILET
      + ';border-radius:12px;' + A + 'font-size:14px;color:' + EMAIL_TXT + ';text-align:left;line-height:1.7;">'
      + nl2brEmail(String(g.tournoi_description).trim()) + '</p>'
    : '';

  // Salutation + intro.
  // La phrase d'intro est du texte LIBRE (multi-lignes) : sauts de ligne → <br> + texte justifié.
  const bloc_salut = '<p style="margin:28px 0 8px;' + A + 'font-size:16px;line-height:1.5;font-weight:bold;color:' + EMAIL_NAVY + ';">' + salutationHtml + '</p>'
    + (String(intro || '').trim() ? '<p style="margin:0;' + A + 'font-size:14px;color:' + EMAIL_TXT + ';text-align:left;line-height:1.7;">' + nl2brEmail(intro) + '</p>' : '');

  // Informations pratiques de l'invitation initiale, sans la frise de la journée.
  const ligneJ = function (lib, val) {
    if (!val) return '';
    return '<tr><td style="' + A + 'font-size:14px;line-height:1.5;color:' + EMAIL_GRIS + ';padding:10px 10px 10px 12px;width:34%;vertical-align:top;">' + echapper(lib) + '</td>'
      + '<td style="' + A + 'font-size:14px;line-height:1.5;color:' + EMAIL_TXT + ';font-weight:bold;padding:10px 12px 10px 0;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">' + echapper(val) + '</td></tr>';
  };

  // « Vous êtes invités » : l'invitation COMPLÈTE — une carte détaillée par catégorie
  // (miroir des cartes de la page vitrine, en HTML email-safe : tableaux empilés),
  // précédée de la même phrase d'introduction, suivie des mêmes repères FFR.
  let tblInvites = '';
  if (cats.length) {
    tblInvites = emailTitreSection('Vous êtes invités')
      + '<p style="margin:0 0 16px;' + A + 'font-size:13px;line-height:1.65;color:' + EMAIL_TXT + ';">' + echapper(introCartesEmail(cats)) + '</p>'
      + cats.map(function (c) { return carteCategorieEmail(c, A); }).join('')
      + reperesFFREmail(cats, A);
  }

  // Les quatre sections suivent l'ordre du menu « Invitation initiale ».
  const tarifOui = estOui(g.tarif_engagement_oui);
  const modalites = ligneJ('Date limite de paiement', String(g.date_limite_confirmation || '').trim()
      ? formaterDateFr(g.date_limite_confirmation) : '')
    + ligneJ('Tarif d\'engagement', tarifOui ? libelleTarifEngagement(g) : '')
    + ligneJ('Modalités de paiement', tarifOui ? String(g.tarif_engagement_modalites || '').trim() : '');
  const blocModalites = modalites ? (emailTitreSection('Modalités d\'inscription')
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="' + EMAIL_TABLEAU_INFOS + '">' + modalites + '</table>') : '';

  const contactReponse = [];
  if (String(g.contact_reponse_nom || '').trim()) contactReponse.push(echapper(String(g.contact_reponse_nom).trim()));
  if (String(g.contact_reponse_tel || '').trim()) contactReponse.push(echapper(telephoneLisibleAdmin(g.contact_reponse_tel)));
  if (String(g.contact_reponse_email || '').trim()) contactReponse.push(echapper(String(g.contact_reponse_email).trim()));
  const reponse = ligneJ('Réponse souhaitée avant le', String(g.date_limite_reponse || '').trim()
      ? formaterDateFr(g.date_limite_reponse) : '')
    + ligneJ('Votre contact', contactReponse.join(' · '));
  const blocReponse = reponse ? (emailTitreSection('Réponse à l\'invitation')
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="' + EMAIL_TABLEAU_INFOS + '">' + reponse + '</table>') : '';

  const referent = [];
  if (String(g.referent_nom || '').trim()) referent.push(String(g.referent_nom).trim());
  if (String(g.referent_tel || '').trim()) referent.push(telephoneLisibleAdmin(g.referent_tel));
  const secoursOui = estOui(g.securite_secours_oui);
  const secuIdentique = String(g.securite_referent_identique || 'oui').toLowerCase() !== 'non';
  const secuNom = secuIdentique ? String(g.referent_nom || '').trim() : String(g.securite_referent_nom || '').trim();
  const secuTel = secuIdentique ? String(g.referent_tel || '').trim() : String(g.securite_referent_tel || '').trim();
  const contacts = ligneJ('Référent tournoi', referent.join(' · '))
    + ligneJ('Poste de secours', secoursOui
      ? ('Sur place' + (String(g.securite_secours_precisions || '').trim() ? ' — ' + String(g.securite_secours_precisions).trim() : '')) : '')
    + ligneJ('Référent sécurité', [secuNom, secuTel ? telephoneLisibleAdmin(secuTel) : ''].filter(Boolean).join(' · '));
  const blocContacts = contacts ? (emailTitreSection('Contacts & sécurité')
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="' + EMAIL_TABLEAU_INFOS + '">' + contacts + '</table>') : '';

  // « Sur place » : les services cochés, sans y mélanger les modalités d'inscription.
  const pastilles = [];
  if (estOui(g.buvette_disponible)) pastilles.push('🥤 Buvette');
  if (estOui(g.espace_sandwich_disponible)) pastilles.push('🥪 Espace sandwich');
  if (estOui(g.boutique_disponible)) pastilles.push('🛍️ Boutique');
  const repasOui = estOui(g.repas_sur_place_oui);
  if (repasOui) pastilles.push('🍽️ Précommande de repas');
  let detailRepas = '';
  if (repasOui && g.repas_sur_place_mode === 'prix_personne' && String(g.repas_sur_place_montant || '').trim()) {
    detailRepas = String(g.repas_sur_place_montant).trim() + ' € par personne';
  } else if (repasOui && g.repas_sur_place_mode === 'compris_inscription') {
    detailRepas = 'Compris dans les frais d\'inscription';
  } else if (repasOui && g.repas_sur_place_mode === 'offert_organisateur') {
    detailRepas = 'Offert par l\'organisateur du tournoi';
  }
  const gouterOui = estOui(g.gouter_fin_tournoi_oui);
  if (gouterOui) pastilles.push('🍪 Goûter de fin de tournoi');
  let detailGouter = '';
  if (gouterOui && g.gouter_fin_tournoi_mode === 'prix_personne' && String(g.gouter_fin_tournoi_montant || '').trim()) {
    detailGouter = String(g.gouter_fin_tournoi_montant).trim() + ' € par personne';
  } else if (gouterOui && g.gouter_fin_tournoi_mode === 'compris_inscription') {
    detailGouter = 'Compris dans les frais d\'inscription';
  } else if (gouterOui && g.gouter_fin_tournoi_mode === 'offert_organisateur') {
    detailGouter = 'Offert par l\'organisateur du tournoi';
  }
  let surPlace = '';
  if (pastilles.length) {
    surPlace = emailTitreSection('Sur place');
    surPlace += '<p style="margin:0 0 8px;">' + pastilles.map(function (p) {
      return '<span style="display:inline-block;background:' + EMAIL_NAVY + ';color:#fff;border-radius:14px;'
        + 'padding:7px 14px;' + A + 'font-size:13px;margin:0 8px 8px 0;">' + echapper(p) + '</span>';
    }).join('') + '</p>';
    if (detailRepas) {
      surPlace += '<p style="margin:2px 0 0;' + A + 'font-size:14px;color:' + EMAIL_TXT + ';"><strong>Précommande de repas :</strong> '
        + echapper(detailRepas) + '</p>';
    }
    if (detailGouter) {
      surPlace += '<p style="margin:2px 0 0;' + A + 'font-size:14px;color:' + EMAIL_TXT + ';"><strong>Goûter :</strong> '
        + echapper(detailGouter) + '</p>';
    }
  }

  // Bouton d'action unique, placé en bas après lecture complète de l'invitation.
  const boutonBas = lienReponse
    ? '<p style="margin:30px 0 4px;text-align:center;"><a href="' + echapper(lienReponse) + '" '
      + 'style="display:inline-block;background:' + EMAIL_BLEU + ';color:#ffffff;text-decoration:none;'
      + 'border-radius:8px;padding:15px 32px;' + A + 'font-size:15px;font-weight:bold;box-shadow:0 4px 12px rgba(46,143,224,.24);">Répondre à l\'invitation</a></p>'
    : '';

  // Pied : barre des liens officiels EN ICÔNES (Instagram / sites — décision Romain), puis
  // mention (même entité que la vitrine) + lien de secours vers la page en ligne.
  const pied = barreLiensEmail(A)
    + '<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ' + EMAIL_FILET + ';' + A + 'font-size:12px;line-height:1.6;color:' + EMAIL_GRIS + ';text-align:center;">'
    + 'L\'organisation du tournoi<br>'
    + '<a href="' + lienInv + '" style="color:' + EMAIL_BLEU + ';">Voir la version en ligne</a></p>';

  // Après le contenu général, les cartes reprennent exactement l'ordre du menu initial.
  return '<div style="background:' + EMAIL_FOND + ';padding:16px 8px;' + A + '">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:720px;width:100%;margin:0 auto;background:#ffffff;border-collapse:separate;border-radius:18px;box-shadow:0 8px 28px rgba(12,28,46,.10);">'
    + '<tr><td style="padding:24px 16px;">'
    + entete
    + blocAffiche + bloc_salut + blocDescription + tblInvites
    + blocModalites + blocReponse + blocContacts + surPlace + boutonBas + pied
    + '</td></tr></table></div>';
}

/** Version TEXTE brut (fallback anti-spam / clients sans HTML). `salutationTexte` et les liens
 *  sont des jetons à l'envoi ({{SALUTATION}}, {{LIEN_REPONSE}}, {{LIEN_INVITATION}}) ou des
 *  exemples pour l'aperçu. */
function emailTexteInvitation(g, cats, salutationTexte, intro, lienReponse, lienInvitation) {
  const nom = String(g.tournoi_nom || '').trim() || 'Le tournoi';
  const L = [];
  // Identité du tournoi en tête (même en-tête que le texte du dossier, lieu en plus), hors de
  // l'intro éditable : la retoucher ne fait plus disparaître le nom, la date ni le lieu.
  const quand = [];
  if (String(g.tournoi_date || '').trim()) quand.push(formaterDateFr(g.tournoi_date));
  if (String(g.tournoi_lieu || '').trim()) quand.push(String(g.tournoi_lieu).trim());
  L.push(nom.toUpperCase() + (quand.length ? ' — ' + quand.join(' · ') : ''));
  L.push('');
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
      // Règlement : même extraction que la carte HTML — seule une URL est reprise, rien n'est inventé.
      const regl = String(c.reglement || '').trim().match(/https?:\/\/\S+/i);
      if (regl) seg.push('règlement : ' + regl[0]);
      if (scf.estScf) {
        seg.push(scf.phase === 'P3' ? 'samedi triangulaires · dimanche brassage par niveau'
          : 'plateau en triangulaires / quadrangulaires');
      } else {
        seg.push('après-midi : ' + DOSSIER_FORMATS[cleFormatApresMidi(c)]);
      }
      L.push('- ' + String(c.categorie || '') + ' : ' + seg.join(' · '));
      // Format d'après-midi expliqué (mêmes textes que la carte HTML) — jamais pour le SCF.
      if (!scf.estScf) {
        const cle = cleFormatApresMidi(c);
        L.push('  Après-midi — ' + DOSSIER_FORMATS[cle] + ' : ' + DOSSIER_FORMATS_DESC[cle]);
      }
    });
    L.push('');
    // Repères FFR (mêmes conditions que la vitrine et que l'email HTML).
    if (cats.some(function (c) { const n = parseInt(String(c.effectif_min || '').trim(), 10); return isFinite(n) && n >= 1; })) {
      L.push('RAPPEL IMPORTANT — ' + FFR_RAPPEL_EFFECTIF);
      L.push('');
    }
    if (cats.some(function (c) { return String(c.format_apresmidi || '').trim().toUpperCase() === 'POULES_NIVEAU'; })) {
      L.push('POURQUOI CE FORMAT ? ' + FFR_POURQUOI_FORMAT);
      L.push('');
    }
  }
  // Sections du menu « Invitation initiale », dans le même ordre.
  const modalites = [];
  if (String(g.date_limite_confirmation || '').trim()) modalites.push('Date limite de paiement : ' + formaterDateFr(g.date_limite_confirmation) + '.');
  if (estOui(g.tarif_engagement_oui) && String(g.tarif_engagement_montant || '').trim()) modalites.push('Tarif d\'engagement : ' + libelleTarifEngagement(g));
  if (estOui(g.tarif_engagement_oui) && String(g.tarif_engagement_modalites || '').trim()) modalites.push('Modalités de paiement : ' + String(g.tarif_engagement_modalites).trim());
  if (modalites.length) { L.push('MODALITÉS D\'INSCRIPTION'); modalites.forEach(function (x) { L.push(x); }); L.push(''); }

  const reponse = [];
  if (String(g.date_limite_reponse || '').trim()) reponse.push('Réponse souhaitée avant le ' + formaterDateFr(g.date_limite_reponse) + '.');
  const c2 = [];
  if (String(g.contact_reponse_nom || '').trim()) c2.push(String(g.contact_reponse_nom).trim());
  if (String(g.contact_reponse_tel || '').trim()) c2.push(telephoneLisibleAdmin(g.contact_reponse_tel));
  if (String(g.contact_reponse_email || '').trim()) c2.push(String(g.contact_reponse_email).trim());
  if (c2.length) reponse.push('Contact : ' + c2.join(' · '));
  if (reponse.length) { L.push('RÉPONSE À L\'INVITATION'); reponse.forEach(function (x) { L.push(x); }); L.push(''); }

  const contacts = [];
  const referent = [];
  if (String(g.referent_nom || '').trim()) referent.push(String(g.referent_nom).trim());
  if (String(g.referent_tel || '').trim()) referent.push(telephoneLisibleAdmin(g.referent_tel));
  if (referent.length) contacts.push('Référent tournoi : ' + referent.join(' · '));
  if (estOui(g.securite_secours_oui)) contacts.push('Poste de secours : sur place' +
    (String(g.securite_secours_precisions || '').trim() ? ' — ' + String(g.securite_secours_precisions).trim() : ''));
  const identique = String(g.securite_referent_identique || 'oui').toLowerCase() !== 'non';
  const srNom = identique ? String(g.referent_nom || '').trim() : String(g.securite_referent_nom || '').trim();
  const srTel = identique ? String(g.referent_tel || '').trim() : String(g.securite_referent_tel || '').trim();
  if (srNom || srTel) contacts.push('Référent sécurité : ' + [srNom, srTel ? telephoneLisibleAdmin(srTel) : ''].filter(Boolean).join(' · '));
  if (contacts.length) { L.push('CONTACTS & SÉCURITÉ'); contacts.forEach(function (x) { L.push(x); }); L.push(''); }

  const services = [];
  if (estOui(g.buvette_disponible)) services.push('buvette');
  if (estOui(g.espace_sandwich_disponible)) services.push('espace sandwich');
  if (estOui(g.boutique_disponible)) services.push('boutique');
  if (estOui(g.repas_sur_place_oui)) {
    let repas = 'précommande de repas';
    if (g.repas_sur_place_mode === 'prix_personne' && String(g.repas_sur_place_montant || '').trim()) {
      repas += ' — ' + String(g.repas_sur_place_montant).trim() + ' € par personne';
    } else if (g.repas_sur_place_mode === 'compris_inscription') {
      repas += ' — compris dans les frais d\'inscription';
    } else if (g.repas_sur_place_mode === 'offert_organisateur') {
      repas += ' — offert par l\'organisateur du tournoi';
    }
    services.push(repas);
  }
  if (estOui(g.gouter_fin_tournoi_oui)) {
    let gouter = 'goûter de fin de tournoi';
    if (g.gouter_fin_tournoi_mode === 'prix_personne' && String(g.gouter_fin_tournoi_montant || '').trim()) {
      gouter += ' — ' + String(g.gouter_fin_tournoi_montant).trim() + ' € par personne';
    } else if (g.gouter_fin_tournoi_mode === 'compris_inscription') {
      gouter += ' — compris dans les frais d\'inscription';
    } else if (g.gouter_fin_tournoi_mode === 'offert_organisateur') {
      gouter += ' — offert par l\'organisateur du tournoi';
    }
    services.push(gouter);
  }
  if (services.length) { L.push('SUR PLACE'); L.push('Sur place : ' + services.join(', ') + '.'); L.push(''); }

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
 * sont ÉDITABLES : mis à jour automatiquement au fil des cartes du menu initial tant que
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
  peindreApercuEmail(rendu, emailHtmlInvitation(g, cats, imgSrc, salut, intro.value, lienReponseApercu(), lienInvitationApercu()));
}

/**
 * ⭐ Aperçu d'un e-mail SANS rechargement (lot « Inviter un club », 4ᵉ passage). Réécrire `srcdoc` à chaque frappe créait un
 * nouveau document : blason, icônes et affiche étaient redemandés au réseau à chaque touche (constaté dans Chromium : 6
 * touches, 6 GET de logo-tournoi.png ; une affiche enregistrée aurait ajouté un GET vers lh3.googleusercontent.com par touche).
 * La première pose passe par `srcdoc` ; ensuite la tête et le corps sont remplacés DANS le même document, dont les images
 * déjà chargées sont réutilisées : une frappe ne fait plus aucune requête. Iframe rechargée (déplacée dans la page) : elle
 * reprend le DERNIER aperçu. Pas de document accessible (hors navigateur, chargement en cours) : `srcdoc`, comme avant.
 */
function peindreApercuEmail(iframe, html) {
  if (!iframe) return;
  let doc = null;
  try { doc = iframe.contentDocument || null; } catch (e) { doc = null; }
  const enPlace = !!doc && iframe.__apercuPose === true && doc.readyState === 'complete' && !!doc.head && !!doc.body &&
    typeof DOMParser === 'function';
  if (enPlace && iframe.__apercuHtml === html) return;         // rien n'a changé : rien à repeindre
  iframe.__apercuHtml = html;
  if (!enPlace) {
    if (!iframe.__apercuEcoute && typeof iframe.addEventListener === 'function') {
      iframe.__apercuEcoute = true;
      iframe.addEventListener('load', function () {
        iframe.__apercuPose = true;
        if (iframe.__apercuHtml !== iframe.srcdoc) peindreApercuEmail(iframe, iframe.__apercuHtml);
      });
    }
    iframe.__apercuPose = false;
    iframe.srcdoc = html;
    return;
  }
  const neuf = new DOMParser().parseFromString(html, 'text/html');       // document inerte : rien n'y est chargé
  // Les images que le document affiche déjà sont GARDÉES — le même nœud, image déjà chargée : recréer un <img>, même à la
  // même adresse, peut relancer sa requête. Seule une image nouvelle (affiche ajoutée…) est chargée.
  const gardees = Array.prototype.slice.call(doc.images);
  const places = [];
  Array.prototype.slice.call(neuf.images).forEach(function (img) {
    const i = gardees.findIndex(function (g) { return g.getAttribute('src') === img.getAttribute('src'); });
    if (i === -1) return;
    const marque = neuf.createElement('span');
    marque.setAttribute('data-apercu-image', String(places.length));
    img.parentNode.replaceChild(marque, img);
    places.push({ garde: gardees.splice(i, 1)[0], modele: img });
  });
  doc.documentElement.replaceChild(doc.importNode(neuf.head, true), doc.head);
  doc.documentElement.replaceChild(doc.importNode(neuf.body, true), doc.body);
  places.forEach(function (p, k) {
    const marque = doc.body.querySelector('[data-apercu-image="' + k + '"]');
    if (!marque) return;
    Array.prototype.slice.call(p.modele.attributes).forEach(function (a) {   // alt, style… ; `src` identique : jamais réécrit
      if (a.name !== 'src' && p.garde.getAttribute(a.name) !== a.value) p.garde.setAttribute(a.name, a.value);
    });
    Array.prototype.slice.call(p.garde.attributes).forEach(function (a) {
      if (!p.modele.hasAttribute(a.name)) p.garde.removeAttribute(a.name);
    });
    marque.parentNode.replaceChild(p.garde, marque);
  });
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

/** Sélecteur des boutons qui déclenchent l'envoi d'invitation d'un club (liste « Clubs invités », suivi, fiche). */
function selecteurBoutonsInvitation(nom) {
  const n = (window.CSS && CSS.escape) ? CSS.escape(nom) : String(nom).replace(/"/g, '\\"');
  return '#liste-clubs-invites .bouton-inviter-club[data-club="' + n + '"], [data-action="relance-reponse"][data-club="' + n + '"]';
}

/* Nature (relance ou première invitation) d'un envoi individuel à l'issue incertaine, par clé d'envoi : textes de la reprise.
   Vit exactement comme sa marque dans `envoisIncertains` (posée à l'issue incertaine, retirée au succès). */
const naturesEnvoisIncertains = new Map();

/** Envoi INDIVIDUEL de l'invitation à un club (même contenu que l'aperçu). Une action = au plus un e-mail. */
async function envoyerInvitationClubUI(nom, options) {
  const opt = options || {};
  const estRelance = opt.relance === true;
  const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;
  const cle = cleEnvoi('invitation', nom);
  if (envoisEnCours.has(cle)) return;                                   // ⛔ double clic, Entrée : rien de plus
  envoisEnCours.add(cle);                                                // posé AVANT la confirmation
  const message = (estRelance && document.getElementById('message-suivi-clubs')) ||
    document.getElementById('message-club-invite');
  try {
    if (!estRelance && String(club.invitation_envoyee || '').trim()) {
      afficherMessage(message, 'Invitation déjà envoyée. Pour une relance, utilise « Suivi des clubs ».', 'ok');
      return;
    }
    const email = String(club.club_contact_email || '').trim();
    if (!email) { await dialogAlerter('« ' + nom + ' » n\'a pas d\'email de contact : à inviter manuellement.'); return; }
    const sujet = sujetInvitationCourant();
    if (!sujet) { afficherMessage(message, '⚠️ L\'objet de l\'aperçu ne peut pas être vide.', 'ko'); return; }
    const refus = refusEmailSaisiesNonEnregistrees(CARTES_EMAIL_INVITATION);
    if (refus) { afficherMessage(message, refus, 'ko'); return; }
    const piecesAEnvoyer = piecesJointesDossierPourEnvoi('invitation');
    const mentionPieces = piecesAEnvoyer.length
      ? '\n\n📎 ' + piecesAEnvoyer.length + ' pièce(s) jointe(s) : ' + piecesAEnvoyer.map(function (p) { return p.nom; }).join(', ')
      : '\n\nAucune pièce jointe.';
    const incertain = envoisIncertains.has(cle)
      ? '\n\n⚠️ L’envoi précédent n’a pas été confirmé : le club l’a peut-être déjà reçu.' : '';
    // Lot « Suivi des clubs » — UNE PREMIÈRE INVITATION EST UNE INVITATION, d'où qu'elle parte. Le Suivi emprunte la voie « relance »
    // (son message, ses boutons) même pour un club jamais invité : les mots ET la demande suivent donc ce que le club a reçu.
    // ⛔ `relance: 'oui'` faisait noter au serveur une « dernière relance » à la date de la PREMIÈRE invitation, et ses refus
    // parlaient de « la relance » (marque `rel` du registre). Une première invitation envoie désormais exactement la même demande
    // que depuis « Inviter un club » (`relance: 'non'`) ; une vraie relance garde `relance: 'oui'` et son comportement historique.
    // ⛔ Rien d'autre ne bouge : même identifiant d'envoi, même registre, même anti-doublon, même envoi hors verrou.
    // Reprise d'un geste à l'issue incertaine : c'est le MÊME geste (même identifiant) — il garde sa nature, donc la même demande,
    // même si la relecture montre entre-temps le club « invité » par ce premier envoi.
    const vraieRelance = envoisIncertains.has(cle) && naturesEnvoisIncertains.has(cle) ? naturesEnvoisIncertains.get(cle)
      : estRelance && !!String(club.invitation_envoyee || '').trim();
    const question = vraieRelance ? 'Relancer « ' + nom + ' » sur sa réponse (' + email + ') ?'
      : 'Envoyer l\'invitation à « ' + nom + ' » (' + email + ') ?';
    if (!await dialogConfirmer(question + mentionPieces + incertain,
      { ok: vraieRelance ? 'Relancer' : 'Envoyer' })) return;
    marquerBoutonsEnvoi(selecteurBoutonsInvitation(nom), true);
    afficherMessage(message, '⏳ Envoi à ' + email + '…', 'ok');
    let res;
    try {
      res = await ecrireEnvoiEmail('envoyerInvitationClub', {
        club_nom: nom, sujet: sujet, html_modele: htmlModeleInvitation(), texte_modele: texteModeleInvitation(),
        base_reponse: baseReponseInvitation(), base_invitation: lienInvitationPublique(),
        pieces_jointes: piecesAEnvoyer, relance: vraieRelance ? 'oui' : 'non'
      }, { cle: cle, incertain: envoisIncertains.has(cle) });
    } catch (erreur) {
      if (!issueIncertaine(erreur)) { oublierIdEnvoi(cle); afficherMessage(message, '⚠️ ' + erreur.message, 'ko'); return; }
      envoisIncertains.add(cle);                                          // l'identifiant du geste est gardé pour la reprise
      naturesEnvoisIncertains.set(cle, vraieRelance);                      // … et sa nature (invitation ou relance), pour les textes
      afficherMessage(message, messageIncertain('l’envoi à ' + email + ' n’est pas confirmé — le club l’a peut-être reçu',
        erreur, 'la liste est relue : « Invité le … » dira s’il est parti'), 'ko');
      if (typeof rafraichirRessourceAdmin === 'function') rafraichirRessourceAdmin('clubsInvites');
      return;
    }
    envoisIncertains.delete(cle);
    naturesEnvoisIncertains.delete(cle);
    oublierIdEnvoi(cle);
    // Lot « Suivi des clubs » : le résultat va AUSSI au club de la liste courante (remplacée pendant l'envoi, elle aurait
    // gardé « invitation non envoyée » — et un second clic aurait mené à « Envoyer quand même ? »).
    const envoi = {};
    if (res && res.invitation_envoyee) envoi.invitation_envoyee = res.invitation_envoyee;
    if (res && res.derniere_relance_reponse) envoi.derniere_relance_reponse = res.derniere_relance_reponse;
    Object.assign(club, envoi);
    appliquerAuClubInvite(nom, envoi, function () {
      afficherClubsInvites();
      if (typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
    });
    afficherMessage(message, res && res.rejeu
      ? '✅ ' + (vraieRelance ? 'Relance' : 'Invitation') + ' déjà partie vers ' + email + ' (la réponse précédente s’était perdue) : rien n’a été renvoyé.'
      : vraieRelance ? '✅ Relance envoyée à ' + email + '.' : '✅ Invitation envoyée à ' + email +
      (piecesAEnvoyer.length ? ' avec ' + piecesAEnvoyer.length + ' pièce(s) jointe(s).' : '.'), 'ok');
  } finally {
    envoisEnCours.delete(cle);
    afficherClubsInvites();
    if (typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
  }
}

/** Les destinataires d'un envoi groupé que le serveur n'a PAS servis, nommés avec leur raison (5ᵉ passage). PUR. */
function messageEnvoisNonServis(res) {
  const r = res || {};
  const parties = [
    ['non_envoyes', 'non envoyée(s) — délai du serveur atteint, un nouvel envoi les fera partir'],
    ['en_cours', 'déjà en cours d’envoi (autre écran)'],
    ['non_confirmes', 'dont l’envoi précédent a été interrompu sans confirmation — à inviter un par un depuis la liste'],
    ['recents', 'invitée(s) il y a moins de 5 min']
  ].filter(function (p) { return Array.isArray(r[p[0]]) && r[p[0]].length; })
    .map(function (p) { return ' ⚠️ ' + r[p[0]].length + ' ' + p[1] + ' : ' + r[p[0]].join(', ') + '.'; });
  if (r.suivi_a_jour === false) parties.push(' ⚠️ ' + (r.avertissements || []).join(' '));
  return parties.join('');
}

/**
 * Envoi GROUPÉ des invitations : résumé AVANT confirmation (éligibles / sans email / déjà
 * invités exclus), puis envoi tolérant aux pannes côté backend
 * et résumé final (« N envoyées, M échecs : … »).
 */
async function onEnvoyerInvitationsGroupe() {
  const message = document.getElementById('message-invitations');
  const bouton = document.getElementById('bouton-envoyer-invitations');
  const cle = cleEnvoi('groupe', 'invitations');
  if (envoisEnCours.has(cle) || (bouton && bouton.disabled)) return;   // ⛔ double clic, Entrée : rien de plus
  envoisEnCours.add(cle);
  const texte = bouton ? bouton.textContent : '';
  try {
    const sujet = sujetInvitationCourant();
    const piecesAEnvoyer = piecesJointesDossierPourEnvoi('invitation');
    if (!sujet) { afficherMessage(message, '⚠️ L\'objet de l\'aperçu ne peut pas être vide.', 'ko'); return; }
    const refus = refusEmailSaisiesNonEnregistrees(CARTES_EMAIL_INVITATION);
    if (refus) { afficherMessage(message, refus, 'ko'); return; }

    // Résumé calculé depuis la liste en mémoire (mêmes règles que le backend).
    const invitables = clubsInvitesCourants.filter(function (c) { return estInvitable(c.statut); });
    const avecEmail = invitables.filter(function (c) { return String(c.club_contact_email || '').trim(); });
    const sansEmail = invitables.filter(function (c) { return !String(c.club_contact_email || '').trim(); });
    const deja = avecEmail.filter(function (c) { return String(c.invitation_envoyee || '').trim(); });
    const eligibles = avecEmail.filter(function (c) { return !String(c.invitation_envoyee || '').trim(); });

    if (!eligibles.length) {
      await dialogAlerter('Aucun club à inviter pour le moment.\n\n'
        + sansEmail.length + ' club(s) sans email (à inviter manuellement).\n'
        + deja.length + ' club(s) déjà invité(s)'
        + ' — les relances se font dans « Suivi des clubs ».');
      return;
    }
    const resume = 'Envoyer l\'invitation à ' + eligibles.length + ' club(s) ?\n\n'
      + '• ' + eligibles.length + ' recevront l\'invitation\n'
      + '• ' + sansEmail.length + ' sans email (à inviter manuellement)\n'
      + '• ' + deja.length + ' déjà invité(s) (exclus)\n'
      + '• ' + (piecesAEnvoyer.length
        ? piecesAEnvoyer.length + ' pièce(s) jointe(s) : ' + piecesAEnvoyer.map(function (p) { return p.nom; }).join(', ')
        : 'aucune pièce jointe')
      + (envoisIncertains.has(cle) ? '\n\n⚠️ L’envoi précédent n’a pas été confirmé : la liste relue ne montre « Invité » '
        + 'que pour les clubs déjà servis ; les autres seront invités maintenant.' : '');
    if (!await dialogConfirmer(resume, { ok: 'Confirmer l\'envoi' })) return;

    occuperBouton(bouton, 'Envoi…');
    afficherMessage(message, 'Envoi en cours…', 'ok');
    let res;
    try {
      res = await ecrireEnvoiEmail('envoyerInvitationsGroupe', Object.assign({
        sujet: sujet, html_modele: htmlModeleInvitation(), texte_modele: texteModeleInvitation(),
        base_reponse: baseReponseInvitation(), base_invitation: lienInvitationPublique(),
        renvoyer: 'non', pieces_jointes: piecesAEnvoyer
      }, ETAT_DANS_LA_REPONSE), { cle: cle, incertain: envoisIncertains.has(cle), nbClubs: eligibles.length });
    } catch (erreur) {
      if (!issueIncertaine(erreur)) { oublierIdEnvoi(cle); afficherMessage(message, '⚠️ ' + erreur.message, 'ko'); return; }
      envoisIncertains.add(cle);
      afficherMessage(message, messageIncertain('les envois ne sont pas confirmés — certains clubs ont peut-être reçu l’invitation',
        erreur, 'la liste est relue : « Invité le … » montre qui l’a reçue, et un nouvel envoi n’écrit qu’aux autres'), 'ko');
      if (typeof rafraichirRessourceAdmin === 'function') rafraichirRessourceAdmin('clubsInvites');
      return;
    }
    envoisIncertains.delete(cle);
    oublierIdEnvoi(cle);
    // ⭐ R2 — l'état appliqué doit être postérieur à l'envoi qu'on vient de faire : la liste relue sous le verrou par
    //   le serveur (4ᵉ passage), posée par le registre — aucune lecture commencée AVANT ne sera resservie. Backend
    //   d'avant, ou issue que le serveur n'a pas pu noter tout de suite : relecture, comme avant.
    await appliquerOuRelireEtat(res, { clubs: true });
    const nbOk = (res.envoyes || []).length;
    const ech = res.echecs || [];
    let msg = '✅ ' + nbOk + ' invitation(s) envoyée(s).';
    if (ech.length) msg += ' ⚠️ ' + ech.length + ' échec(s) : ' + ech.map(function (e) { return e.club; }).join(', ') + '.';
    // ⭐ 5ᵉ passage — chaque destinataire NON servi est nommé, avec la raison ; « un nouvel envoi » n'écrit qu'à eux.
    const restes = messageEnvoisNonServis(res);
    afficherMessage(message, msg + restes, ech.length || restes ? 'ko' : 'ok');
  } finally {
    envoisEnCours.delete(cle);
    libererBouton(bouton, texte);
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

/* Pièces jointes du dossier final. Elles vivent uniquement dans cet onglet et ne passent au
   serveur qu'au clic sur « Envoyer ». Le backend refait les mêmes contrôles : les limites côté
   navigateur améliorent le retour utilisateur, elles ne constituent jamais la sécurité. */
const DOSSIER_PJ_MAX_FICHIERS = 5;
const DOSSIER_PJ_MAX_OCTETS_FICHIER = 5 * 1024 * 1024;
const DOSSIER_PJ_MAX_OCTETS_TOTAL = 10 * 1024 * 1024;
const DOSSIER_PJ_TYPES = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  txt: 'text/plain',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png'
});
let piecesJointesDossier = [];
let piecesJointesInvitation = [];

function contextePiecesJointes(contexte) {
  const invitation = contexte === 'invitation';
  return {
    nom: invitation ? 'invitation' : 'dossier',
    pieces: invitation ? piecesJointesInvitation : piecesJointesDossier,
    champ: 'pieces-jointes-' + (invitation ? 'invitation' : 'dossier'),
    zone: 'zone-depot-pieces-' + (invitation ? 'invitation' : 'dossier'),
    liste: 'liste-pieces-jointes-' + (invitation ? 'invitation' : 'dossier'),
    vider: 'bouton-vider-pieces-' + (invitation ? 'invitation' : 'dossier'),
    message: 'message-pieces-' + (invitation ? 'invitation' : 'dossier')
  };
}

function extensionPieceJointe(nom) {
  const m = String(nom || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function typePieceJointeDossier(fichier) {
  return DOSSIER_PJ_TYPES[extensionPieceJointe(fichier && fichier.name)] || '';
}

function formatTaillePieceJointe(octets) {
  if (octets < 1024 * 1024) return Math.max(1, Math.round(octets / 1024)) + ' Ko';
  return (octets / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
}

function lirePieceJointeDossier(fichier) {
  return new Promise(function (resoudre, rejeter) {
    const lecteur = new FileReader();
    lecteur.onload = function () {
      const valeur = String(lecteur.result || '');
      const virgule = valeur.indexOf(',');
      if (virgule === -1) { rejeter(new Error('lecture impossible')); return; }
      resoudre(valeur.slice(virgule + 1));
    };
    lecteur.onerror = function () { rejeter(new Error('lecture impossible')); };
    lecteur.readAsDataURL(fichier);
  });
}

function rendrePiecesJointesDossier(contexte) {
  const ctx = contextePiecesJointes(contexte);
  const liste = document.getElementById(ctx.liste);
  const vider = document.getElementById(ctx.vider);
  if (!liste || !vider) return;
  if (!ctx.pieces.length) {
    liste.innerHTML = '<p class="pieces-jointes-vide">Aucun document sélectionné.</p>';
    vider.hidden = true;
    return;
  }
  liste.innerHTML = ctx.pieces.map(function (piece, index) {
    return '<div class="piece-jointe-dossier">' +
      '<span class="piece-jointe-icone" aria-hidden="true">📎</span>' +
      '<span class="piece-jointe-infos"><span class="piece-jointe-nom">' + echapper(piece.nom) + '</span>' +
      '<span class="piece-jointe-taille">' + formatTaillePieceJointe(piece.taille) + '</span></span>' +
      '<button type="button" class="piece-jointe-retirer" data-index="' + index + '" ' +
      'aria-label="Retirer ' + echapper(piece.nom) + '">Retirer</button></div>';
  }).join('');
  vider.hidden = false;
}

async function ajouterPiecesJointesDossier(fichiers, contexte) {
  const ctx = contextePiecesJointes(contexte);
  const message = document.getElementById(ctx.message);
  const erreurs = [];
  const choix = Array.from(fichiers || []);
  for (let i = 0; i < choix.length; i++) {
    const fichier = choix[i];
    const nom = String(fichier.name || '').trim();
    const type = typePieceJointeDossier(fichier);
    const taille = Number(fichier.size) || 0;
    if (ctx.pieces.length >= DOSSIER_PJ_MAX_FICHIERS) {
      erreurs.push('5 fichiers maximum');
      break;
    }
    if (!type) { erreurs.push(nom + ' : format non pris en charge'); continue; }
    if (!taille) { erreurs.push(nom + ' : fichier vide'); continue; }
    if (taille > DOSSIER_PJ_MAX_OCTETS_FICHIER) {
      erreurs.push(nom + ' : plus de 5 Mo');
      continue;
    }
    const total = ctx.pieces.reduce(function (s, p) { return s + p.taille; }, 0);
    if (total + taille > DOSSIER_PJ_MAX_OCTETS_TOTAL) {
      erreurs.push(nom + ' : la sélection dépasserait 10 Mo');
      continue;
    }
    const doublon = ctx.pieces.some(function (p) {
      return p.nom === nom && p.taille === taille && p.type === type;
    });
    if (doublon) { erreurs.push(nom + ' : déjà sélectionné'); continue; }
    try {
      const contenu = await lirePieceJointeDossier(fichier);
      ctx.pieces.push({ nom: nom, type: type, taille: taille, contenu_base64: contenu });
    } catch (e) {
      erreurs.push(nom + ' : lecture impossible');
    }
  }
  rendrePiecesJointesDossier(contexte);
  if (message) {
    if (erreurs.length) afficherMessage(message, '⚠️ ' + erreurs.join(' · '), 'ko');
    else if (choix.length) afficherMessage(message,
      '✅ ' + ctx.pieces.length + ' document(s) prêt(s) à être joint(s).', 'ok');
  }
}

function piecesJointesDossierPourEnvoi(contexte) {
  return contextePiecesJointes(contexte).pieces.map(function (piece) {
    return { nom: piece.nom, type: piece.type, taille: piece.taille, contenu_base64: piece.contenu_base64 };
  });
}

function brancherPiecesJointesDossier(contexte) {
  const ctx = contextePiecesJointes(contexte);
  const champ = document.getElementById(ctx.champ);
  const zone = document.getElementById(ctx.zone);
  const liste = document.getElementById(ctx.liste);
  const vider = document.getElementById(ctx.vider);
  if (!champ || !zone || !liste || !vider || zone.dataset.branche === 'oui') return;
  zone.dataset.branche = 'oui';
  champ.addEventListener('change', function () {
    ajouterPiecesJointesDossier(champ.files, contexte).finally(function () { champ.value = ''; });
  });
  ['dragenter', 'dragover'].forEach(function (nom) {
    zone.addEventListener(nom, function (e) { e.preventDefault(); zone.classList.add('est-survolee'); });
  });
  ['dragleave', 'drop'].forEach(function (nom) {
    zone.addEventListener(nom, function (e) { e.preventDefault(); zone.classList.remove('est-survolee'); });
  });
  zone.addEventListener('drop', function (e) { ajouterPiecesJointesDossier(e.dataTransfer.files, contexte); });
  liste.addEventListener('click', function (e) {
    const bouton = e.target.closest('.piece-jointe-retirer');
    if (!bouton) return;
    ctx.pieces.splice(Number(bouton.dataset.index), 1);
    rendrePiecesJointesDossier(contexte);
    afficherMessage(document.getElementById(ctx.message), 'Document retiré.', 'ok');
  });
  vider.addEventListener('click', function () {
    ctx.pieces.splice(0, ctx.pieces.length);
    rendrePiecesJointesDossier(contexte);
    afficherMessage(document.getElementById(ctx.message), 'Tous les documents ont été retirés.', 'ok');
  });
  rendreZoneDepotAccessible(ctx.zone, ctx.nom === 'invitation' ? 'Choisir les documents joints à l’invitation'
    : 'Choisir les documents joints au dossier final');
  rendrePiecesJointesDossier(contexte);
}

function brancherPiecesJointesInvitation() {
  brancherPiecesJointesDossier('invitation');
}

/** ⭐ Zone de dépôt atteignable au CLAVIER (2ᵉ passage — même règle que la zone de l'affiche) : Tab s'y arrête, Entrée
 *  ou Espace ouvre le choix du fichier ; le clic et le glisser-déposer ne changent pas. Posée une seule fois. */
function rendreZoneDepotAccessible(idZone, libelle) {
  const zone = document.getElementById(idZone);
  const champ = zone && zone.querySelector('input[type="file"]');
  if (!zone || !champ || zone.getAttribute('tabindex') !== null) return;
  zone.setAttribute('tabindex', '0');
  zone.setAttribute('role', 'button');
  zone.setAttribute('aria-label', libelle);
  zone.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    champ.click();
  });
}

/** Pré-remplit les TROIS cartes du dossier d'invitation avec l'état enregistré.
 *  ⭐ Sans perte de saisie (2ᵉ passage) : une carte qui porte un brouillon — ou le focus — n'est pas réécrite ; les
 *  autres suivent la configuration. Enregistrer le parking ne réécrit donc plus les modalités ni l'encadrement. */
function majInvitation() {
  const g = configCourante.global || {};

  // 1) Modalités d'inscription.
  const fm = document.getElementById('form-modalites');
  if (fm) remplirCarteSansBrouillon('modalites', function () {
    fm.date_limite_confirmation.value = g.date_limite_confirmation || '';
    fm.tarif_engagement_oui.checked = estOui(g.tarif_engagement_oui);
    fm.tarif_engagement_montant.value = g.tarif_engagement_montant || '';
    fm.tarif_engagement_mode.value = modeTarifEngagement(g);
    fm.tarif_engagement_modalites.value = g.tarif_engagement_modalites || '';
    majAffichageTarif(fm);
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(fm);
  });

  // 2) Parking & accès (texte + aperçu de la photo déjà enregistrée sur Drive).
  majParkingInvitation();

  // 3) Encadrement & assurance.
  const fe = document.getElementById('form-encadrement');
  if (fe) remplirCarteSansBrouillon('encadrement', function () {
    fe.encadrement_ratio.value = g.encadrement_ratio || '';
    fe.encadrement_diplomes.value = g.encadrement_diplomes || '';
    fe.assurance_attestation_requise.checked = estOui(g.assurance_attestation_requise);
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(fe);
  });

  if (typeof majApercuDossierEmail === 'function') majApercuDossierEmail();
}

/** Carte « Parking & accès » seule : texte et aperçu de la photo enregistrée (sauf brouillon ou photo choisie). */
function majParkingInvitation() {
  const g = configCourante.global || {};
  const fp = document.getElementById('form-parking');
  if (!fp) return;
  remplirCarteSansBrouillon('parking', function () {
    fp.parking_texte.value = g.parking_texte || '';
    parkingDataURI = '';
    majApercuPhotoParkingEnregistree();
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(fp);
  });
}

/** Aperçu de la photo du parking ENREGISTRÉE (ou rien). */
function majApercuPhotoParkingEnregistree() {
  const g = configCourante.global || {};
  const bloc = document.getElementById('apercu-parking');
  const img = document.getElementById('apercu-parking-img');
  if (!bloc || !img) return;
  if (g.parking_photo_id) {
    img.src = urlAffiche(g.parking_photo_id, 600);
    bloc.hidden = false;
  } else {
    img.removeAttribute('src');
    bloc.hidden = true;
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
/** Le serveur renvoie le suivi recalculé avec les tarifs effectivement enregistrés. */
function appliquerSuiviTarifsEnregistres(resultat) {
  if (!resultat || !Array.isArray(resultat.clubs)) return;
  clubsInvitesCourants = resultat.clubs;
  if (resultat.estimation_public) estimationPublicCourante = resultat.estimation_public;
  if (typeof afficherEstimationPublicAutorisation === 'function') afficherEstimationPublicAutorisation();
  afficherClubsInvites();
  if (typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
}

/** Suffixe du message quand la carte a changé PENDANT l'envoi : cette frappe-là n'est pas enregistrée. */
function suffixeSaisiePendantEnvoi(cle, envoye) {
  const v = valeursCarte(cle);
  if (!v) return '';
  const change = Object.keys(envoye).some(function (k) {
    return (k in v) && String(v[k] == null ? '' : v[k]).trim() !== String(envoye[k] == null ? '' : envoye[k]).trim();
  });
  return change ? ' ⚠️ Une modification faite pendant l’envoi n’est pas encore enregistrée : clique de nouveau pour l’enregistrer.' : '';
}

/**
 * ⭐ Une carte de configuration de l'écran : UNE écriture bornée ; succès → mémoire et référence de la carte à jour
 * (une frappe faite pendant l'envoi reste un brouillon, et c'est dit) ; refus → rien d'écrit ; issue incertaine →
 * « non confirmé », aucune réécriture, relecture de la configuration qui tranche, saisies conservées.
 * @param {Object} o { cle, action, data, bouton, message, texteOk, apres(resultat) }
 */
async function enregistrerCarteConfig(o) {
  const bouton = o.bouton;
  if (bouton && bouton.disabled) return;
  const texteBouton = bouton ? bouton.textContent : '';
  occuperBouton(bouton, 'Enregistrement…');
  let resultat, incertain = null;
  try {
    resultat = await ecrireInvitation(o.action, o.data);
  } catch (erreur) {
    if (!issueIncertaine(erreur)) {
      afficherMessage(o.message, '⚠️ ' + erreur.message, 'ko');
      resultat = null;
    } else incertain = erreur;
  } finally {
    libererBouton(bouton, texteBouton);
  }
  if (incertain) {
    afficherMessage(o.message, messageIncertain('l’enregistrement n’est pas confirmé', incertain,
      'la configuration est relue pour le vérifier, tes saisies restent à l’écran'), 'ko');
    await verifierCarteApresIncertitude(o.cle, o.data, o.message, o.texteOk);
    return;
  }
  if (!resultat) return;
  configCourante.global = Object.assign({}, configCourante.global, o.data);
  const suffixe = suffixeSaisiePendantEnvoi(o.cle, o.data);
  noterBaseCarte(o.cle, Object.assign(valeursCarte(o.cle) || {}, o.data));
  const form = document.getElementById(CARTES_INVITATION[o.cle].form);
  if (!suffixe && form && typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
  if (typeof o.apres === 'function') o.apres(resultat);
  afficherMessage(o.message, o.texteOk + suffixe, suffixe ? 'ko' : 'ok');
}

async function enregistrerCarteInvitation(data, form, bouton, message, texteOk) {
  const cle = form && form.id === 'form-encadrement' ? 'encadrement' : 'modalites';
  return enregistrerCarteConfig({ cle: cle, action: 'enregistrerInvitation', data: data, bouton: bouton, message: message,
    texteOk: texteOk, apres: function (resultat) {
      majDossier(); // les sections du dossier suivent
      appliquerSuiviTarifsEnregistres(resultat);
    } });
}

/** Enregistre la carte « Modalités d'inscription ». */
function onEnregistrerModalites() {
  const form = document.getElementById('form-modalites');
  const data = CARTES_INVITATION.modalites.lire(form);
  return enregistrerCarteInvitation(data, form,
    document.getElementById('bouton-enregistrer-modalites'),
    document.getElementById('message-modalites'),
    '✅ Modalités enregistrées.');
}

/** Enregistre la carte « Encadrement & assurance ». */
function onEnregistrerEncadrement() {
  const form = document.getElementById('form-encadrement');
  const data = CARTES_INVITATION.encadrement.lire(form);
  return enregistrerCarteInvitation(data, form,
    document.getElementById('bouton-enregistrer-encadrement'),
    document.getElementById('message-encadrement'),
    '✅ Encadrement & assurance enregistrés.');
}

/** Enregistre la carte « Parking & accès » : le texte, puis la photo si une nouvelle a été choisie.
 *  ⭐ 2ᵉ passage : la configuration n'est plus relue en entier après coup — la réponse de la photo porte son
 *  identifiant — et seule cette carte est redessinée (les modalités et l'encadrement en cours restent tels quels). */
async function onEnregistrerParking() {
  const form = document.getElementById('form-parking');
  const bouton = document.getElementById('bouton-enregistrer-parking');
  const message = document.getElementById('message-parking');
  if (bouton.disabled) return;
  const texteBouton = bouton.textContent;
  const data = { parking_texte: form.parking_texte.value.trim() };
  const photo = parkingDataURI;
  occuperBouton(bouton, 'Enregistrement…');
  let etape = 'le texte';
  try {
    const resultat = await ecrireInvitation('enregistrerInvitation', data);
    configCourante.global = Object.assign({}, configCourante.global, data);
    appliquerSuiviTarifsEnregistres(resultat);
    if (photo) {
      etape = 'la photo';
      afficherMessage(message, 'Envoi de la photo…', 'ok');
      const res = await ecrireInvitation('enregistrerPhotoParking', { photo: photo });
      if (res && res.id) configCourante.global = Object.assign({}, configCourante.global, { parking_photo_id: res.id });
      if (parkingDataURI === photo) { parkingDataURI = ''; form.parking_photo.value = ''; }
    }
    const suffixe = suffixeSaisiePendantEnvoi('parking', data);
    noterBaseCarte('parking', { parking_texte: data.parking_texte, parking_photo: parkingDataURI ? 'nouvelle' : '' });
    if (!parkingDataURI) majApercuPhotoParkingEnregistree();
    majDossier();
    afficherMessage(message, '✅ Parking & accès enregistrés.' + suffixe, suffixe ? 'ko' : 'ok');
  } catch (erreur) {
    if (!issueIncertaine(erreur)) { afficherMessage(message, '⚠️ ' + erreur.message, 'ko'); return; }
    afficherMessage(message, messageIncertain('l’enregistrement de ' + etape + ' n’est pas confirmé', erreur,
      'la configuration est relue pour le vérifier, ta saisie et ta photo restent à l’écran'), 'ko');
    try {
      configCourante = await lireConfigAdmin(undefined, { delaiMs: DELAI_ECRITURE_INVITATION_MS });
      majDossier();
      afficherMessage(message, (String(configCourante.global.parking_texte || '').trim() === data.parking_texte && !photo
        ? '✅ Parking & accès enregistrés (confirmé par la relecture du serveur).'
        : '⚠️ Relecture faite : vérifie la carte — ' + (photo ? 'renvoie la photo si elle n’apparaît pas dans le dossier.' :
          'le texte n’a pas été enregistré, clique de nouveau.')), photo ? 'ko' : 'ok');
    } catch (e2) { /* le message « non confirmé » reste affiché */ }
  } finally {
    libererBouton(bouton, texteBouton);
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
 *   1) une image vient d'être choisie mais pas encore enregistrée → on annule le choix (local, rien d'autre ne bouge) ;
 *   2) une photo est déjà enregistrée → suppression backend (fichier Drive + Config), sans relecture complète.
 */
async function onRetirerPhotoParking() {
  const message = document.getElementById('message-parking');
  const form = document.getElementById('form-parking');

  // Cas 1 : choix non enregistré → on annule simplement la sélection (le texte en cours reste tel quel).
  if (parkingDataURI) {
    parkingDataURI = '';
    form.parking_photo.value = '';
    majApercuPhotoParkingEnregistree(); // ré-affiche la photo enregistrée, ou masque l'aperçu si aucune
    afficherMessage(message, 'Choix de photo annulé.', 'ok');
    return;
  }

  // Cas 2 : photo enregistrée → confirmation puis suppression backend.
  if (!(configCourante.global && configCourante.global.parking_photo_id)) return;
  const bouton = document.getElementById('bouton-retirer-parking');
  if (bouton.disabled) return;
  if (!await dialogConfirmer('Retirer la photo du parking ?', { ok: 'Retirer', danger: true })) return;

  bouton.disabled = true;
  try {
    await ecrireInvitation('supprimerPhotoParking', {});
    configCourante.global = Object.assign({}, configCourante.global, { parking_photo_id: '' });
    majApercuPhotoParkingEnregistree();
    majDossier();
    afficherMessage(message, '🗑️ Photo du parking retirée.', 'ok');
  } catch (erreur) {
    if (!issueIncertaine(erreur)) { afficherMessage(message, '⚠️ ' + erreur.message, 'ko'); return; }
    afficherMessage(message, messageIncertain('le retrait de la photo n’est pas confirmé', erreur, 'la configuration est relue'), 'ko');
    try {
      configCourante = await lireConfigAdmin(undefined, { delaiMs: DELAI_ECRITURE_INVITATION_MS });
      majApercuPhotoParkingEnregistree();
      majDossier();
      afficherMessage(message, configCourante.global.parking_photo_id ? '⚠️ Relecture faite : la photo est toujours enregistrée.'
        : '🗑️ Photo du parking retirée (confirmé par la relecture du serveur).', configCourante.global.parking_photo_id ? 'ko' : 'ok');
    } catch (e2) { /* le message « non confirmé » reste affiché */ }
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

/* ⭐ Lot « Suivi des clubs » — LA LECTURE EST BORNÉE. Sans délai client, une réponse muette laissait la liste en attente
 *   pour toujours : « Suivi des clubs » affichait « Connecte-toi pour charger le suivi. » à un organisateur connecté, et
 *   revenir sur l'écran ne relançait rien (la lecture pendue était partagée). 30 s par tentative ; `js/api.js` relance UNE
 *   fois cette lecture de sa liste fermée après un délai dépassé ou un 404 : au pire ≈ 60 s, puis l'erreur est dite. */
const DELAI_LECTURE_CLUBS_MS = 30000;
/* L'état de la lecture, pour les écrans qui montrent la liste sans la lire eux-mêmes (« Suivi des clubs ») : `lue` — au moins
 *   une lecture a réussi ; `enCours` — une lecture court ; `erreur` — message de la dernière lecture en échec, '' après un succès. */
const etatLectureClubs = { lue: false, enCours: false, erreur: '' };

/**
 * Charge la liste des clubs invités depuis le backend (clé admin) et l'affiche.
 *
 * ⛔ LECTURE BRUTE — RÉSERVÉE AU REGISTRE (R2). Ne l'appelle JAMAIS directement : passe par
 * `assurerRessourceAdmin('clubsInvites')` pour une lecture de navigation, ou par
 * `rafraichirRessourceAdmin('clubsInvites')` après une écriture. L'appel direct court-circuite
 * la file de la ressource : deux lectures pourraient voler ensemble, et la plus ANCIENNE
 * repeindre l'écran en dernier.
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
  etatLectureClubs.enCours = true;
  // Liste jamais lue : le Suivi dit « Chargement… » pendant la lecture (il affichait « Connecte-toi… » à un organisateur connecté).
  if (!etatLectureClubs.lue && typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
  try {
    const res = await ecrireAdmin('listerClubsInvites', {}, { delaiMs: DELAI_LECTURE_CLUBS_MS });
    clubsInvitesCourants = (res && res.clubs) || [];
    estimationPublicCourante = (res && res.estimation_public) || null;
    if (typeof afficherEstimationPublicAutorisation === 'function') afficherEstimationPublicAutorisation();
    etatLectureClubs.lue = true;
    etatLectureClubs.enCours = false;
    etatLectureClubs.erreur = '';
    afficherClubsInvites();
    if (typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
    // L'aperçu du dossier ouvre le dossier D'UN CLUB : sa liste de choix suit les clubs chargés
    // (elle est vide au premier rendu de la carte, avant cet appel).
    if (typeof majApercuDossier === 'function') majApercuDossier();
    return true;
  } catch (erreur) {
    etatLectureClubs.enCours = false;
    etatLectureClubs.erreur = String((erreur && erreur.name === 'AbortError')
      ? 'délai de ' + Math.round(DELAI_LECTURE_CLUBS_MS / 1000) + ' s dépassé' : ((erreur && erreur.message) || 'erreur réseau')).replace(/\.\s*$/, '');
    zone.innerHTML = '<p class="vide">⚠️ Impossible de charger les clubs invités : '
      + echapper(erreur.message) + '</p>';
    // Le Suivi montre la même liste : il dit l'échec au lieu d'un faux « aucun club ».
    if (typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
    return false;
  }
}

/**
 * ⭐ Lot « Suivi des clubs » — LE RÉSULTAT D'UN GESTE VA À LA LISTE COURANTE. Un geste qui écrit sur un club (paiement,
 * relance, confirmation, invitation) garde le club trouvé AVANT l'envoi ; si la liste a été remplacée pendant l'envoi
 * (réponse d'un autre geste, « Rafraîchir »…), ce club n'est plus affiché et le résultat s'y perdait : l'écran montrait
 * encore l'état d'avant (« En attente », « invitation non envoyée ») et reproposait le geste. Les champs relus sont donc
 * posés sur le club de la liste COURANTE (l'appelant repeint, comme avant) ; et si une relecture est encore en vol —
 * partie avant l'écriture, elle peut décrire l'état d'avant —, ils sont reposés APRÈS elle, dans la file de la
 * ressource, puis `repeindre` est appelé. Aucune requête.
 * @param {string} nom
 * @param {Object} champs   champs relus dans la réponse du serveur
 * @param {function(): void} [repeindre]  après la pose différée seulement
 */
function appliquerAuClubInvite(nom, champs, repeindre) {
  const poser = function () {
    (clubsInvitesCourants || []).forEach(function (c) { if (memeTexteSouple(c.club_nom, nom)) Object.assign(c, champs); });
  };
  poser();
  const etat = typeof etatRessourceAdmin === 'function' ? etatRessourceAdmin('clubsInvites') : null;
  if (etat && etat.enVol && typeof enfilerLectureAdmin === 'function') {
    enfilerLectureAdmin('clubsInvites', function () { poser(); if (typeof repeindre === 'function') repeindre(); });
  }
}

/** Équipes réellement présentes dans le tournoi, y compris les ajouts manuels/anciens.
 * Noms attendus : « CLUB » ou « CLUB-N ». Le nom exact d'un autre club est prioritaire.
 */
function equipesDuClubInvite(club) {
  const nom = String((club && club.club_nom) || '').trim();
  if (!nom) return [];
  function normaliser(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }
  const cle = normaliser(nom);
  const autres = (typeof clubsInvitesCourants !== 'undefined' ? clubsInvitesCourants : [])
    .map(function (c) { return normaliser(c.club_nom); }).filter(function (n) { return n !== cle; });
  return (typeof equipesCourantes !== 'undefined' ? equipesCourantes || [] : []).filter(function (e) {
    const ne = normaliser(e.nom_equipe);
    if (autres.indexOf(ne) !== -1) return false;
    return ne === cle || (ne.indexOf(cle + '-') === 0 && /^\d+$/.test(ne.slice(cle.length + 1)));
  });
}

/** État commun aux invitations et au suivi : la liste Équipes fait foi, pas une date historique. */
function etatClubInvite(club) {
  if (equipesDuClubInvite(club).length) return 'equipes-ajoutees';
  if (memeTexteSouple(club.statut, 'Décliné')) return 'decline';
  return estAccepte(club.statut) ? 'a-enregistrer' : 'attente';
}

function dossierFinalDisponible(club) {
  return etatClubInvite(club) === 'equipes-ajoutees';
}

/** Catégories enregistrées, ou celles des équipes présentes pour les anciens ajouts manuels. */
function categoriesDuClubInvite(club) {
  const enregistrees = parseCatsEngagees(club && club.categories_engagees);
  if (enregistrees.length) return enregistrees;
  return Array.from(new Set(equipesDuClubInvite(club).map(function (e) {
    return String(e.categorie || '').trim().toUpperCase();
  }).filter(Boolean)));
}

/** Actualise les états après ajout/retrait/renommage, sans effacer les champs en cours de saisie. */
function actualiserEtatClubsDepuisEquipes() {
  const cartes = document.querySelectorAll('#liste-clubs-invites .club-invite-item[data-club]');
  Array.prototype.forEach.call(cartes, function (carte) {
    const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, carte.getAttribute('data-club')); });
    if (!club) return;
    const etat = etatClubInvite(club);
    Object.keys(LIBELLES_ETAT_CLUB).forEach(function (cle) { carte.classList.toggle('club-etat-' + cle, cle === etat); });
    const badge = carte.querySelector('.club-etat-badge');
    if (badge) { badge.className = 'club-etat-badge etat-' + etat; badge.textContent = LIBELLES_ETAT_CLUB[etat]; }
    actualiserBoutonEquipesClub(carte.querySelector('.club-panneau'));
  });
  if (typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
}

/** Libellés humains des états (badge de la carte — jamais la couleur seule). */
const LIBELLES_ETAT_CLUB = {
  'a-enregistrer': 'Équipes à ajouter',
  'attente': 'En attente de réponse',
  'equipes-ajoutees': 'Équipes ajoutées',
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
 * bouton d'ajout des équipes. L'envoi du dossier final se fait dans le suivi des clubs.
 */
function panneauAccepteClub(club, nom) {
  const cats = (configCourante.categories || []).filter(estPresente)
    .slice().sort(function (a, b) { return comparerCategorie(a.categorie, b.categorie); });
  const eng = categoriesDuClubInvite(club);
  const toutParDefaut = eng.length === 0; // rien encore enregistré → tout coché
  const ajoutees = dossierFinalDisponible(club);
  const cases = cats.map(function (c) {
    const val = String(c.categorie || '');
    const coche = toutParDefaut || eng.indexOf(val.toUpperCase()) !== -1;
    return '<label><input type="checkbox" class="club-cat-case" value="' + echapper(val) + '"' +
      (coche ? ' checked' : '') + '> ' + echapper(val) + '</label>';
  }).join('');

  const initiales = cats.filter(function (c) { return toutParDefaut || eng.indexOf(String(c.categorie).toUpperCase()) !== -1; })
    .map(function (c) { return c.categorie; }).join(',');
  return '<div class="club-panneau" data-club="' + echapper(nom) + '" data-categories-initiales="' + echapper(initiales) +
    '" data-prenom-initial="' + echapper(String(club.club_contact_prenom || '')) + '">' +
    resumeReponseClub(club) +
    '<p class="club-panneau-titre">Catégories engagées par le club</p>' +
    (cats.length
      ? '<div class="club-cats">' + cases + '</div>'
      : '<p class="vide">Ajoute d\'abord des catégories au tournoi.</p>') +
    '<label class="club-prenom-champ">Prénom du contact (pour la politesse du dossier)' +
      '<input type="text" class="club-prenom-input" value="' + echapper(String(club.club_contact_prenom || '')) + '" ' +
             'placeholder="Ex : Camille" autocomplete="off"></label>' +
    '<div class="club-panneau-actions">' +
      '<button type="button" class="bouton bouton-cats-club" data-club="' + echapper(nom) + '"' +
        (ajoutees ? ' disabled title="Les équipes ont déjà été ajoutées au tournoi"' : '') + '>' +
        svgIcone('enregistrer') + 'Ajouter les équipes au tournoi</button>' +
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
 *   0 = orange « Équipes à ajouter » (action requise, en haut)
 *   1 = violet « En attente de réponse » (rien à faire, milieu)
 *   2 = bleu « Équipes ajoutées » (à jour, en bas)
 *   3 = rouge « Déclinée » (cartes mortes, tout en bas)
 */
function bucketClub(club) {
  return { 'a-enregistrer': 0, 'attente': 1, 'equipes-ajoutees': 2, 'decline': 3 }[etatClubInvite(club)];
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
      (envoye ? '<span class="club-envoye" title="Dossier envoyé">Dossier envoyé le ' + echapper(envoye) + '</span>' : '') +
      (alerte ? '<span class="club-alerte-ecart" tabindex="0" role="button" title="' + echapper(alerte) + '" data-club="' + echapper(nom) + '">⚠️ Écart</span>' : '');
    // Invitation initiale uniquement ; les relances restent dans le suivi des clubs.
    const motifInvitation = invite ? 'Invitation déjà envoyée — relances dans Suivi des clubs'
      : (!aEmail ? 'Ajoute une adresse email pour envoyer l’invitation' : 'Envoyer l’invitation à ' + nom);
    const envoi = envoiEnCours('invitation', nom);                 // un envoi en vol survit au redessin de la liste
    const boutonInviter = '<button type="button" class="bouton bouton-inviter-club" title="' + echapper(motifInvitation) +
      '" aria-label="' + echapper(motifInvitation) + '" data-club="' + echapper(nom) + '"' +
      (envoi ? ' disabled aria-busy="true" data-texte-libre="Envoyer l’invitation">Envoi…</button>'
        : (invite || !aEmail ? ' disabled' : '') + '>Envoyer l’invitation</button>');

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
        // Panneau d'ajout des équipes, visible seulement si Accepté.
        (estAccepte(club.statut) ? panneauAccepteClub(club, nom) : '') +
      '</div>';
  });
  const brouillons = releverBrouillonsClubs(zone);
  zone.innerHTML = html;
  reposerBrouillonsClubs(zone, brouillons);
  majApercuInvitation(); // l'exemple de prénom de l'aperçu suit la liste
  majApercuDossierEmail(); // le choix du club et le rendu final suivent la même liste
}

/* ⭐ RENDU SANS PERTE DE SAISIE (lot « Inviter un club »). La liste est entièrement redessinée à chaque
   écriture ou relecture — y compris quand le jeu de démonstration y ajoute des clubs. Ce qu'un organisateur
   a commencé à saisir et n'a pas encore enregistré (coordonnées en cours d'édition, cases et prénom d'un
   panneau « Accepté ») est relevé AVANT le rendu et reposé APRÈS, pour le même club — seulement si la valeur
   enregistrée n'a pas changé entre-temps (sinon la valeur du serveur l'emporte, comme sur les autres écrans). */
/* Classes des contrôles d'une carte de club que le focus peut retrouver après un redessin. */
const CONTROLES_CLUB_FOCUS = ['club-edit-nom', 'club-edit-prenom', 'club-edit-contact', 'club-edit-email', 'btn-enregistrer-edition',
  'btn-annuler-edition', 'club-cat-case', 'club-prenom-input', 'bouton-cats-club', 'bouton-inviter-club', 'bouton-editer-club',
  'statut-club', 'bouton-suppr-club', 'club-alerte-ecart'];
function releverFocusClubs(zone) {
  const actif = document.activeElement;
  if (!actif || actif === document.body || typeof zone.contains !== 'function' || !zone.contains(actif)) return null;
  const carte = actif.closest ? actif.closest('[data-club]') : null;
  const classe = CONTROLES_CLUB_FOCUS.filter(function (c) { return actif.classList && actif.classList.contains(c); })[0];
  if (!carte || !classe) return null;
  return { club: carte.getAttribute('data-club'), classe: classe, valeur: classe === 'club-cat-case' ? actif.value : null,
    debut: typeof actif.selectionStart === 'number' ? actif.selectionStart : null,
    fin: typeof actif.selectionEnd === 'number' ? actif.selectionEnd : null };
}
function reposerFocusClubs(zone, f) {
  if (!f) return;
  const n = (window.CSS && CSS.escape) ? CSS.escape(f.club) : String(f.club).replace(/"/g, '\\"');
  const candidats = zone.querySelectorAll('[data-club="' + n + '"] .' + f.classe + ', .' + f.classe + '[data-club="' + n + '"]');
  const cible = Array.prototype.filter.call(candidats, function (c) { return f.valeur === null || c.value === f.valeur; })[0];
  if (!cible || typeof cible.focus !== 'function') return;
  cible.focus();
  if (f.debut !== null && typeof cible.setSelectionRange === 'function') {
    try { cible.setSelectionRange(f.debut, f.fin === null ? f.debut : f.fin); } catch (e) { /* champ sans curseur */ }
  }
}

function releverBrouillonsClubs(zone) {
  if (!zone || typeof zone.querySelector !== 'function') return null;
  const brouillons = { edition: null, panneaux: {}, focus: releverFocusClubs(zone) };
  const edition = zone.querySelector('.club-en-edition');
  if (edition) {
    const champs = {};
    ['club-edit-nom', 'club-edit-prenom', 'club-edit-contact', 'club-edit-email'].forEach(function (c) {
      const champ = edition.querySelector('.' + c);
      if (champ) champs[c] = { base: champ.getAttribute('value') || '', valeur: champ.value };
    });
    brouillons.edition = { club: edition.getAttribute('data-club'), champs: champs };
  }
  Array.prototype.forEach.call(zone.querySelectorAll('.club-panneau'), function (panneau) {
    const cochees = Array.prototype.slice.call(panneau.querySelectorAll('.club-cat-case:checked'))
      .map(function (c) { return c.value; }).sort().join(',');
    const initiales = String(panneau.getAttribute('data-categories-initiales') || '').split(',').filter(Boolean).sort().join(',');
    const prenom = panneau.querySelector('.club-prenom-input');
    const prenomInitial = panneau.getAttribute('data-prenom-initial') || '';
    if (cochees === initiales && (!prenom || prenom.value === prenomInitial)) return;   // rien de modifié
    brouillons.panneaux[panneau.getAttribute('data-club')] = { cochees: cochees, initiales: initiales,
      prenom: prenom ? prenom.value : null, prenomInitial: prenomInitial };
  });
  return brouillons;
}

function reposerBrouillonsClubs(zone, brouillons) {
  if (!brouillons || typeof zone.querySelector !== 'function') return;
  const focus = brouillons.focus;
  const e = brouillons.edition;
  if (e) {
    const ligne = zone.querySelector('.club-en-edition');
    if (ligne && ligne.getAttribute('data-club') === e.club) {
      Object.keys(e.champs).forEach(function (c) {
        const champ = ligne.querySelector('.' + c);
        if (champ && (champ.getAttribute('value') || '') === e.champs[c].base) champ.value = e.champs[c].valeur;
      });
    }
  }
  Array.prototype.forEach.call(zone.querySelectorAll('.club-panneau'), function (panneau) {
    const b = brouillons.panneaux[panneau.getAttribute('data-club')];
    if (!b) return;
    const initiales = String(panneau.getAttribute('data-categories-initiales') || '').split(',').filter(Boolean).sort().join(',');
    if (initiales !== b.initiales || (panneau.getAttribute('data-prenom-initial') || '') !== b.prenomInitial) return;
    const voulues = b.cochees ? b.cochees.split(',') : [];
    Array.prototype.forEach.call(panneau.querySelectorAll('.club-cat-case'), function (c) { c.checked = voulues.indexOf(c.value) !== -1; });
    const prenom = panneau.querySelector('.club-prenom-input');
    if (prenom && b.prenom !== null) prenom.value = b.prenom;
    actualiserBoutonEquipesClub(panneau);
  });
  reposerFocusClubs(zone, focus);
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
  if (bouton.disabled) return;                                   // ⛔ Entrée pendant l'envoi : rien de plus

  // Casse normalisée : MAJUSCULES pour le club + le contact, minuscules pour l'email.
  // (Le nom du club sert à nommer les équipes auto : elles reprennent cette casse exacte.)
  const nom = champNom.value.trim().toUpperCase();
  if (!nom) { afficherMessage(message, 'Indique le nom du club.', 'ko'); return; }

  const doublon = clubsInvitesCourants.some(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (doublon) {
    afficherMessage(message, '⚠️ « ' + nom + ' » est déjà dans la liste.', 'ko');
    return;
  }

  occuperBouton(bouton, 'Ajout…');
  try {
    const res = await ecrireInvitation('ajouterClubInvite', Object.assign({
      club_nom: nom,
      club_contact_nom: champContact.value.trim().toUpperCase(),
      club_contact_prenom: champPrenom.value.trim().toUpperCase(),
      club_contact_email: champEmail.value.trim().toLowerCase()
    }, ETAT_DANS_LA_REPONSE));
    // ⭐ Club déjà au carnet avec un autre contact : le contact CONSERVÉ et la saisie écartée sont montrés tous les deux,
    //   champ par champ (le message les cite) — rien n'est écrasé ni perdu en silence.
    const conserve = res && Array.isArray(res.contact_conserve) && res.contact_conserve.length;
    champNom.value = ''; champContact.value = ''; champPrenom.value = ''; champEmail.value = '';
    if (conserve) afficherMessage(message, '⚠️ ' + ((res.avertissements || [])[0] || {}).message, 'ko');
    else afficherMessage(message, '✅ « ' + nom + ' » ajouté (statut : Invité).', 'ok');
    champNom.focus();
    await appliquerOuRelireEtat(res, { clubs: true });
  } catch (erreur) {
    if (!issueIncertaine(erreur)) { afficherMessage(message, '⚠️ ' + erreur.message, 'ko'); return; }
    afficherMessage(message, messageIncertain('l’ajout de « ' + nom + ' » n’est pas confirmé', erreur,
      'la liste est relue, ta saisie reste dans le formulaire'), 'ko');
    if (typeof rafraichirRessourceAdmin === 'function') {
      const relue = await rafraichirRessourceAdmin('clubsInvites');
      if (relue && clubsInvitesCourants.some(function (c) { return memeTexteSouple(c.club_nom, nom); })) {
        afficherMessage(message, '✅ « ' + nom + ' » ajouté (confirmé par la relecture du serveur).', 'ok');
      }
    }
  } finally {
    libererBouton(bouton, 'Ajouter');
  }
}

/** Changement de statut via le menu déroulant d'un club (enregistrement immédiat).
 *  Passer à « Accepté » fait apparaître le panneau de sélection des catégories (pré-cochées
 *  sur toutes par défaut). Revenir à « Invité »/« Décliné » CONSERVE categories_engagees.
 *  ⭐ « Suivi des clubs » suit IMMÉDIATEMENT (même mémoire, repeinte ici). */
async function onChangerStatutClub(evenement) {
  if (evenement.target.closest('.club-cat-case, .club-prenom-input')) {
    actualiserBoutonEquipesClub(evenement.target.closest('.club-panneau'));
    return;
  }
  const select = evenement.target.closest('.statut-club');
  if (!select) return;
  const nom = select.getAttribute('data-club');
  const statut = select.value;
  const message = document.getElementById('message-club-invite');
  occuperBouton(select);
  try {
    await ecrireInvitation('modifierStatutClubInvite', { club_nom: nom, statut: statut });
    const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, nom); });
    if (club) club.statut = statut;
    afficherClubsInvites(); // pastille + panneau « Accepté » suivent le nouveau statut
    if (typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
    afficherMessage(message, '✅ « ' + nom + ' » → ' + statut + '.', 'ok');
  } catch (erreur) {
    if (!issueIncertaine(erreur)) {
      afficherClubsInvites(); // revient à l'état connu si l'enregistrement a échoué
      afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
      return;
    }
    afficherMessage(message, messageIncertain('le statut de « ' + nom + ' » n’est pas confirmé', erreur, 'la liste est relue'), 'ko');
    if (typeof rafraichirRessourceAdmin === 'function') {
      const relue = await rafraichirRessourceAdmin('clubsInvites');
      const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, nom); });
      if (relue && club && memeTexteSouple(club.statut, statut)) {
        afficherMessage(message, '✅ « ' + nom + ' » → ' + statut + ' (confirmé par la relecture du serveur).', 'ok');
      } else if (relue) afficherMessage(message, '⚠️ Relecture faite : le statut de « ' + nom + ' » n’a pas changé.', 'ko');
    } else afficherClubsInvites();
  }
}

/** Le contrôle d'une carte de club, pour y remettre le focus après un redessin volontaire. */
function focusControleClub(nom, classe) {
  const n = (window.CSS && CSS.escape) ? CSS.escape(nom) : String(nom).replace(/"/g, '\\"');
  const el = document.querySelector('#liste-clubs-invites [data-club="' + n + '"] .' + classe + ', #liste-clubs-invites .' + classe + '[data-club="' + n + '"]');
  if (el && typeof el.focus === 'function') el.focus();
}

/** Détail de l'alerte d'écart d'un club (badge « ⚠️ Écart », clic ou clavier). */
async function ouvrirAlerteEcart(badgeAlerte) {
  const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, badgeAlerte.getAttribute('data-club')); });
  if (club) await dialogAlerter(String(club.alerte_ecart || ''));
  if (typeof badgeAlerte.focus === 'function') badgeAlerte.focus();
}

/** Clic dans la liste des clubs : suppression, invitation initiale, catégories, coordonnées. */
async function onClicClubsInvites(evenement) {
  const btnSuppr = evenement.target.closest('.bouton-suppr-club');
  if (btnSuppr) return supprimerClubInviteUI(btnSuppr);
  const btnInviter = evenement.target.closest('.bouton-inviter-club');
  if (btnInviter && !btnInviter.disabled) return envoyerInvitationClubUI(btnInviter.getAttribute('data-club'));
  const btnCats = evenement.target.closest('.bouton-cats-club');
  if (btnCats && !btnCats.disabled) return enregistrerCatsClub(btnCats);
  // Édition inline des coordonnées (Sprint 6, point 6e). ⭐ Le focus suit : premier champ, puis retour au crayon.
  const btnEdit = evenement.target.closest('.bouton-editer-club');
  if (btnEdit) {
    const nomEdit = btnEdit.getAttribute('data-club');
    clubEnEdition = nomEdit; afficherClubsInvites(); focusControleClub(nomEdit, 'club-edit-nom'); return;
  }
  const btnAnnul = evenement.target.closest('.btn-annuler-edition');
  if (btnAnnul) {
    const nomAnnul = btnAnnul.getAttribute('data-club');
    clubEnEdition = null; afficherClubsInvites(); focusControleClub(nomAnnul, 'bouton-editer-club'); return;
  }
  const btnSave = evenement.target.closest('.btn-enregistrer-edition');
  if (btnSave) return enregistrerEditionClub(btnSave.getAttribute('data-club'));
  // Badge d'alerte : afficher le détail complet.
  const badgeAlerte = evenement.target.closest('.club-alerte-ecart');
  if (badgeAlerte) return ouvrirAlerteEcart(badgeAlerte);
}

/** Clavier dans la liste des clubs : Entrée ou Espace sur le badge « ⚠️ Écart » (role=button) ouvre son détail ;
 *  Échap dans une ligne en édition l'annule. Les vrais boutons et menus gardent leur clavier natif. */
function onClavierClubsInvites(evenement) {
  const badge = evenement.target.closest && evenement.target.closest('.club-alerte-ecart');
  if (badge && (evenement.key === 'Enter' || evenement.key === ' ')) {
    evenement.preventDefault();
    return ouvrirAlerteEcart(badge);
  }
  const edition = evenement.target.closest && evenement.target.closest('.club-en-edition');
  if (edition && evenement.key === 'Escape') {
    evenement.preventDefault();
    const nom = edition.getAttribute('data-club');
    clubEnEdition = null; afficherClubsInvites(); focusControleClub(nom, 'bouton-editer-club');
  }
  if (edition && evenement.key === 'Enter' && String(evenement.target.tagName || '').toUpperCase() === 'INPUT') {
    evenement.preventDefault();
    return enregistrerEditionClub(edition.getAttribute('data-club'));
  }
  return undefined;
}

/** Enregistre les coordonnées éditées d'un club (nom non vide + email valide). Clé = ancien nom. */
async function enregistrerEditionClub(nomActuel) {
  const message = document.getElementById('message-club-invite');
  const ligne = document.querySelector('.club-en-edition[data-club="' + (window.CSS && CSS.escape ? CSS.escape(nomActuel) : nomActuel) + '"]');
  if (!ligne) return;
  const btn = ligne.querySelector('.btn-enregistrer-edition');
  if (btn.disabled) return;                                       // ⛔ double clic, Entrée : rien de plus
  // Même casse qu'à l'ajout : MAJUSCULES pour le club + le contact, minuscules pour l'email.
  const nom = ligne.querySelector('.club-edit-nom').value.trim().toUpperCase();
  const prenom = ligne.querySelector('.club-edit-prenom').value.trim().toUpperCase();
  const contact = ligne.querySelector('.club-edit-contact').value.trim().toUpperCase();
  const email = ligne.querySelector('.club-edit-email').value.trim().toLowerCase();
  if (!nom) { afficherMessage(message, 'Le nom du club ne peut pas être vide.', 'ko'); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    afficherMessage(message, 'Email du contact invalide.', 'ko'); return;
  }
  occuperBouton(btn, 'Enregistrement…');
  const envoye = { club_nom: nom, club_contact_prenom: prenom, club_contact_nom: contact, club_contact_email: email };
  try {
    const res = await ecrireInvitation('modifierClubInvite', Object.assign({ club_nom_actuel: nomActuel }, envoye, ETAT_DANS_LA_REPONSE));
    clubEnEdition = null;
    afficherMessage(message, '✅ Coordonnées mises à jour.', 'ok');
    await appliquerOuRelireEtat(res, { clubs: true });
    focusControleClub(nom, 'bouton-editer-club');
  } catch (erreur) {
    const libre = function () {
      const b = document.querySelector('.club-en-edition .btn-enregistrer-edition');
      if (b) libererBouton(b, 'Enregistrer');
    };
    if (!issueIncertaine(erreur)) { afficherMessage(message, '⚠️ ' + erreur.message, 'ko'); libre(); return; }
    afficherMessage(message, messageIncertain('la modification des coordonnées n’est pas confirmée', erreur,
      'la liste est relue, ta saisie reste dans la ligne'), 'ko');
    libre();
    if (typeof rafraichirRessourceAdmin !== 'function') return;
    // La relecture tranche : les coordonnées envoyées sont-elles celles du serveur ?
    clubEnEdition = null;
    const relue = await rafraichirRessourceAdmin('clubsInvites');
    const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, nom); });
    const confirme = relue && club && ['club_contact_prenom', 'club_contact_nom', 'club_contact_email'].every(function (k) {
      return String(club[k] || '').trim() === String(envoye[k] || '').trim();
    });
    if (confirme) {
      afficherMessage(message, '✅ Coordonnées mises à jour (confirmé par la relecture du serveur).', 'ok');
    } else {
      clubEnEdition = nomActuel;                                 // la ligne revient en édition avec la saisie
      afficherClubsInvites();
      const l = document.querySelector('.club-en-edition');
      if (l) {
        l.querySelector('.club-edit-nom').value = nom; l.querySelector('.club-edit-prenom').value = prenom;
        l.querySelector('.club-edit-contact').value = contact; l.querySelector('.club-edit-email').value = email;
      }
      if (relue) afficherMessage(message, '⚠️ Relecture faite : les coordonnées n’ont pas été enregistrées. Ta saisie est ' +
        'toujours dans la ligne : clique de nouveau sur « Enregistrer ».', 'ko');
    }
  }
}

/** Retire un club de la liste — EN CASCADE avec ses équipes (décision Romain). L'APERÇU
 *  serveur liste d'abord ce qui sera retiré (la confirmation dit tout) ; une équipe bloquante
 *  (créée à la main, en poule, dans des matchs) refuse la suppression avec le motif. */
async function supprimerClubInviteUI(bouton) {
  const nom = bouton.getAttribute('data-club');
  const message = document.getElementById('message-club-invite');
  if (bouton.disabled) return;
  bouton.disabled = true;
  let etape = 'aperçu';
  try {
    // 1) Aperçu (ne supprime rien) : équipes supprimables + bloquantes, calculées par le serveur.
    const apercu = await ecrireInvitation('supprimerClubInvite', Object.assign({ club_nom: nom, apercu: 'oui' }, ETAT_DANS_LA_REPONSE));
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
    etape = 'retrait';
    const res = await ecrireInvitation('supprimerClubInvite', Object.assign({ club_nom: nom }, ETAT_DANS_LA_REPONSE));
    const retirees = (res && res.equipes_supprimees) || [];
    afficherMessage(message, '🗑️ « ' + nom + ' » retiré' +
      (retirees.length ? ' avec ' + retirees.length + ' équipe(s)' : '') + '.', 'ok');
    // Clubs, et l'écran Équipes + le tableau de bord quand des équipes sont parties, suivent immédiatement.
    await appliquerOuRelireEtat(res, { clubs: true, equipes: retirees.length > 0 });
  } catch (erreur) {
    bouton.disabled = false;
    if (!issueIncertaine(erreur)) { afficherMessage(message, '⚠️ ' + erreur.message, 'ko'); return; }
    if (etape === 'aperçu') {
      afficherMessage(message, messageIncertain('l’aperçu du retrait n’a pas été reçu — rien n’a été retiré', erreur,
        'clique de nouveau pour réessayer'), 'ko');
      return;
    }
    afficherMessage(message, messageIncertain('le retrait de « ' + nom + ' » n’est pas confirmé', erreur,
      'la liste des clubs et celle des équipes sont relues'), 'ko');
    if (typeof rafraichirRessourceAdmin === 'function') rafraichirRessourceAdmin('clubsInvites');
    if (typeof rechargerEquipes === 'function') rechargerEquipes({ preserverEdition: true }).catch(function () { return false; });
  }
}

/** Une modification du formulaire permet une nouvelle synchronisation, sans réactiver un ajout identique. */
function actualiserBoutonEquipesClub(panneau) {
  if (!panneau) return;
  const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, panneau.getAttribute('data-club')); });
  const bouton = panneau.querySelector('.bouton-cats-club');
  if (!club || !bouton || bouton.getAttribute('aria-busy') === 'true') return;
  const cochees = Array.prototype.slice.call(panneau.querySelectorAll('.club-cat-case:checked'))
    .map(function (c) { return String(c.value).trim().toUpperCase(); }).sort();
  const initiales = panneau.getAttribute('data-categories-initiales');
  const enregistrees = (initiales === null ? categoriesDuClubInvite(club) : parseCatsEngagees(initiales)).sort();
  const prenom = panneau.querySelector('.club-prenom-input');
  const prenomInitial = panneau.getAttribute('data-prenom-initial');
  const identique = JSON.stringify(cochees) === JSON.stringify(enregistrees) &&
    (!prenom || prenom.value.trim() === String(prenomInitial === null ? club.club_contact_prenom || '' : prenomInitial).trim());
  bouton.disabled = dossierFinalDisponible(club) && identique;
  bouton.title = bouton.disabled ? 'Les équipes ont déjà été ajoutées au tournoi' : '';
}

/** Enregistre les catégories engagées cochées (+ le prénom du contact) d'un club Accepté. */
async function enregistrerCatsClub(bouton) {
  if (!bouton || bouton.disabled) return;
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
  bouton.setAttribute('aria-busy', 'true');
  const texte = bouton.textContent;
  bouton.textContent = 'Enregistrement…';
  try {
    // Le serveur enregistre la sélection et synchronise les équipes. La relecture de la liste
    // Équipes ci-dessous détermine ensuite l'état des deux cartes.
    let res = await ecrireInvitation('enregistrerCategoriesEngagees', Object.assign({
      club_nom: nom, categories_engagees: cats, club_contact_prenom: prenom
    }, ETAT_DANS_LA_REPONSE));
    // REPLI (backend pas encore redéployé) : l'ancienne action ne synchronise pas les équipes
    // — on rappelle alors creerEquipesClub, comme avant, pour ne pas perdre la création.
    if (!res || res.equipes_creees === undefined) {
      try {
        const sync = await ecrireInvitation('creerEquipesClub', { club_nom: nom });
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
      // Trace historique conservée ; elle ne détermine plus la couleur de la carte.
      club.selection_enregistree = (res && res.selection_enregistree) || '';
    }

    let txtEquipes = '';
    if (creees.length) txtEquipes += ' ' + creees.length + ' équipe(s) créée(s) : '
      + creees.map(function (e) { return e.nom; }).join(', ') + '.';
    if (supprimees.length) txtEquipes += ' ' + supprimees.length + ' équipe(s) retirée(s) : '
      + supprimees.map(function (e) { return e.nom; }).join(', ') + '.';
    if (res && res.alerte) txtEquipes += ' ⚠️ ' + res.alerte;
    // La liste des équipes + le tableau de bord (l'étape « Équipes » de la barre latérale se met à jour tout de suite,
    // sans rafraîchir la page) : depuis la réponse, ou relue avec un backend d'avant.
    await appliquerOuRelireEtat(res, { equipes: true });

    afficherClubsInvites();
    if (typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
    const confirme = !!club && dossierFinalDisponible(club);
    afficherMessage(message, (!confirme
      ? '⚠️ « ' + nom + ' » — ajout des équipes non confirmé. Réessaie ou recharge les clubs.'
      : cochees.length
      ? '✅ « ' + nom + ' » — catégories engagées : ' + cats + '.'
      : '✅ « ' + nom + ' » — sélection enregistrée (aucune catégorie cochée).') + txtEquipes, confirme ? 'ok' : 'ko');
  } catch (erreur) {
    bouton.disabled = false;
    bouton.textContent = texte;
    if (!issueIncertaine(erreur)) { afficherMessage(message, '⚠️ ' + erreur.message, 'ko'); return; }
    // ⛔ Issue inconnue : la sélection et les équipes ont pu être écrites. Aucun renvoi ; les deux listes sont relues
    //   (les cases cochées restent, le redessin garde les brouillons) et l'état de la carte dira ce qui a été fait.
    afficherMessage(message, messageIncertain('l’ajout des équipes de « ' + nom + ' » n’est pas confirmé', erreur,
      'les clubs et les équipes sont relus : « Équipes ajoutées » dira si c’est fait'), 'ko');
    if (typeof rafraichirRessourceAdmin === 'function') rafraichirRessourceAdmin('clubsInvites');
    if (typeof rechargerEquipes === 'function') rechargerEquipes({ preserverEdition: true }).catch(function () { return false; });
  } finally {
    bouton.removeAttribute('aria-busy');
  }
}

/* --------------------------------------------------------------------------
   JEU DE DÉMONSTRATION — SEUL point d'entrée (lot « Inviter un club »)
   ⭐ Le serveur porte le jeu (JEU_DEMO_RACING, backend/Code.gs) : ce module n'en connaît AUCUNE donnée —
   ni club, ni équipe, ni effectif. Il envoie `creerJeuDemoRacing`, puis applique la réponse (clubs et équipes
   relus sous le verrou) aux trois écrans — Clubs invités, Suivi des clubs, Équipes — SANS relecture.
   ⭐ Une écriture à la fois : double clic, Entrée ou clic pendant l'envoi ne relancent rien. Délai borné.
   ⛔ Réponse perdue, délai dépassé ou erreur HTTP : l'écriture a pu avoir lieu — rien n'est renvoyé
   automatiquement, les deux listes sont relues en arrière-plan, et un nouveau clic reprend le jeu là où il
   en est, sans doublon (l'action est rejouable par construction côté serveur).
   ⛔ Refus du serveur (données existantes incompatibles, catégories absentes) : rien n'a été écrit ; les
   conflits sont montrés un par un et l'état relu est appliqué.
   -------------------------------------------------------------------------- */
const DELAI_JEU_DEMO_MS = 30000;
const LIBELLE_BOUTON_JEU_DEMO = 'Démo — Créer le jeu de démonstration';
let jeuDemoEnCours = false;

function messageJeuDemo(texte, type) {
  const zone = document.getElementById('message-jeu-demo') || document.getElementById('message-club-invite');
  if (zone) afficherMessage(zone, texte, type);
}

/** « U10 : 10 équipes, 118 joueurs, 14 éducateurs · U12 : … — total : … » d'après le bilan RELU du serveur. */
function resumeJeuDemo(jeu) {
  const t = (jeu && jeu.totaux) || {};
  const ligne = function (x) {
    return x.equipes + ' équipe' + (x.equipes > 1 ? 's' : '') + ', ' + x.joueurs + ' joueurs, ' + x.educateurs + ' éducateurs';
  };
  const cats = Object.keys(t).filter(function (k) { return k !== 'total'; }).sort(comparerCategorie)
    .map(function (c) { return c + ' : ' + ligne(t[c]); });
  return cats.join(' · ') + (t.total ? ' — total : ' + ligne(t.total) : '');
}

/** Applique l'état relu par le serveur (succès OU refus au contrat) : équipes d'abord, puis clubs et suivi. */
async function appliquerEtatJeuDemo(res) {
  if (res && Array.isArray(res.equipes)) {
    if (typeof appliquerEquipesRelues === 'function') appliquerEquipesRelues(res.equipes);
    else {                                   // module Équipes d'une version précédente (cache mêlé) : même effet, sans relecture
      if (typeof prendreJetonEquipes === 'function') prendreJetonEquipes();
      equipesCourantes = res.equipes;
      if (typeof afficherEquipes === 'function') afficherEquipes(res.equipes);
      if (typeof majTableauBord === 'function') majTableauBord();
    }
  }
  if (!res || !Array.isArray(res.clubs)) return;
  const clubs = res.clubs;
  const appliquer = function () {
    clubsInvitesCourants = clubs;
    if (res.estimation_public) estimationPublicCourante = res.estimation_public;
    if (typeof afficherEstimationPublicAutorisation === 'function') afficherEstimationPublicAutorisation();
    afficherClubsInvites();
    if (typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
    if (typeof majApercuDossier === 'function') majApercuDossier();
  };
  if (typeof appliquerRessourceAdmin === 'function') await appliquerRessourceAdmin('clubsInvites', appliquer);
  else appliquer();
}

/* ⭐ 4ᵉ passage : les gestes de la liste des clubs (ajouter, coordonnées, retrait, catégories engagées, envoi groupé)
   demandent au serveur la liste RELUE sous le verrou dans leur réponse — et celle des équipes quand le
   geste y touche. Elle est appliquée comme celle du jeu, sans seconde requête ; ce que la réponse ne porte pas (backend
   d'avant) est relu comme avant. `relire` dit ce que le geste relisait. */
const ETAT_DANS_LA_REPONSE = Object.freeze({ renvoyer_etat: 'oui' });
/** @return {Promise<boolean>} vrai si la liste des clubs porte l'état du serveur */
async function appliquerOuRelireEtat(res, relire) {
  const o = relire || {};
  const clubs = !!res && Array.isArray(res.clubs);
  const equipes = !!res && Array.isArray(res.equipes);
  if (clubs || equipes) await appliquerEtatJeuDemo(res);
  let aJour = clubs;
  if (o.clubs && !clubs && typeof rafraichirRessourceAdmin === 'function') aJour = await rafraichirRessourceAdmin('clubsInvites');
  if (o.equipes && !equipes && typeof rechargerEquipes === 'function') {
    try { await rechargerEquipes(); } catch (e) { /* best-effort, comme avant */ }
  }
  return aJour;
}

/** Issue inconnue : relecture SEULE des deux listes, en arrière-plan — jamais de renvoi. */
function relireApresJeuDemo() {
  const lectures = [];
  if (typeof rafraichirRessourceAdmin === 'function') lectures.push(rafraichirRessourceAdmin('clubsInvites'));
  if (typeof rechargerEquipes === 'function') {
    lectures.push(rechargerEquipes({ preserverEdition: true }).catch(function () { return false; }));
  }
  return Promise.all(lectures);
}

/** Bouton « Démo — Créer le jeu de démonstration » (onglet « Clubs invités »). */
async function onCreerJeuDemo() {
  const bouton = document.getElementById('bouton-charger-equipes-demo');
  if (jeuDemoEnCours || (bouton && bouton.disabled)) return;          // ⛔ jamais deux envois
  jeuDemoEnCours = true;                                                // posé AVANT la confirmation
  try {
    if (!await dialogConfirmer('Créer le jeu de démonstration ?\n\n' +
      'Le serveur crée les clubs invités, leur suivi (réponses, commandes, paiements) et leurs équipes, ' +
      'celles du club organisateur comprises.\nRien n’est supprimé ni écrasé : une donnée existante ' +
      'incompatible est signalée et conservée. Un second clic ne crée aucun doublon.', { ok: 'Créer le jeu' })) return;
    if (bouton) { bouton.disabled = true; bouton.setAttribute('aria-busy', 'true'); bouton.textContent = 'Création du jeu de démonstration…'; }
    messageJeuDemo('⏳ Création du jeu de démonstration…', 'ok');
    let res;
    try {
      res = await ecrireAdmin('creerJeuDemoRacing', {}, { delaiMs: DELAI_JEU_DEMO_MS });
    } catch (erreur) {
      const rep = erreur && erreur.reponse;
      if (rep && typeof rep === 'object') {                              // REFUS du serveur : rien d'écrit
        if (rep.contrat === 'ecriture-v1') await appliquerEtatJeuDemo(rep);
        const conflits = Array.isArray(rep.conflits) ? rep.conflits : [];
        messageJeuDemo(/Action inconnue/.test(erreur.message)
          ? '⚠️ Le serveur n’a pas encore la version qui crée le jeu de démonstration (mise à jour du backend nécessaire). Rien n’a été créé.'
          : conflits.length
            ? '⚠️ Jeu de démonstration non créé : ' + conflits.length + ' donnée(s) existante(s) incompatible(s), conservée(s) ' +
              'telle(s) quelle(s). Rien n’a été modifié.\n• ' + conflits.map(function (c) { return c.message; }).join('\n• ')
            : '⚠️ ' + erreur.message, 'ko');
        return;
      }
      const cause = erreur && erreur.name === 'AbortError' ? 'délai de ' + Math.round(DELAI_JEU_DEMO_MS / 1000) + ' s dépassé'
        : String((erreur && erreur.message) || 'erreur réseau').replace(/\.$/, '');
      messageJeuDemo('⚠️ Réponse du serveur non reçue (' + cause + ') : la création n’est pas confirmée. Rien n’est renvoyé ' +
        'automatiquement ; les listes sont relues. Un nouveau clic reprend le jeu là où il en est, sans doublon.', 'ko');
      relireApresJeuDemo();
      return;
    }
    if (!res || res.contrat !== 'ecriture-v1' || !Array.isArray(res.clubs) || !Array.isArray(res.equipes) || !res.jeu) {
      await relireApresJeuDemo();                                        // réponse incomplète : on relit
      messageJeuDemo('✅ Le serveur a confirmé la création ; sa réponse était incomplète, les listes ont été relues.', 'ok');
      return;
    }
    await appliquerEtatJeuDemo(res);
    const crees = res.crees || {};
    const avert = (res.avertissements || []).map(function (a) { return '\nℹ️ ' + a.message; }).join('');
    const bilan = resumeJeuDemo(res.jeu);
    if (!res.jeu.complet) {
      messageJeuDemo('⚠️ Jeu de démonstration incomplet après écriture : ' + bilan + '. Un nouveau clic le complète.' + avert, 'ko');
    } else if (!(res.modifies || []).length) {
      messageJeuDemo('✅ Jeu de démonstration déjà en place : rien à créer. ' + bilan + '.' + avert, 'ok');
    } else {
      messageJeuDemo('✅ Jeu de démonstration créé : ' + (res.compteurs && res.compteurs.clubs) + ' clubs invités et leur suivi, ' +
        (crees.equipes || 0) + ' équipe(s) créée(s)' + ((res.deja_presents && res.deja_presents.equipes) ? ', ' + res.deja_presents.equipes +
        ' déjà présente(s)' : '') + ' — ' + bilan + '. Équipes de ' + res.jeu.organisateur + ' (club organisateur) comprises.' + avert, 'ok');
    }
  } finally {
    jeuDemoEnCours = false;
    if (bouton) { bouton.disabled = false; bouton.removeAttribute('aria-busy'); bouton.textContent = LIBELLE_BOUTON_JEU_DEMO; }
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
 * « Envoyer le dossier final » dans le suivi : construit le lien personnalisé, puis
 *  - si le club a un email → ouvre l'aperçu email avant tout envoi ;
 *  - sinon → bascule en mode « Copier le lien » (pas d'aperçu, pas d'envoi auto).
 * Les équipes sont ajoutées au clic sur « Ajouter les équipes au tournoi ».
 */
async function genererDossierFinal(nom) {
  const club = clubsInvitesCourants.find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;

  if (!dossierFinalDisponible(club)) {
    afficherMessage(document.getElementById('message-suivi-clubs'),
      'Ajoute d’abord les équipes au tournoi dans Clubs invités pour débloquer l’envoi du dossier final.', 'ko');
    return;
  }
  // ⛔ Le dossier reprend les cartes « Dossier final » et « Invitation initiale » : aucune n'y part non enregistrée
  //   (vérifié AVANT tout renouvellement de lien — rien n'a changé si l'on s'arrête ici).
  const refus = refusEmailSaisiesNonEnregistrees(CARTES_EMAIL_DOSSIER);
  if (refus) { afficherMessage(document.getElementById('message-suivi-clubs'), refus, 'ko'); return; }
  if (envoiEnCours('dossier', nom)) return;                      // la fenêtre d'envoi de ce club est déjà en vol
  // ⛔ Question « Nouveau lien ? » ou renouvellement en cours pour ce club : un second déclenchement est IGNORÉ (posé
  //   avant la question). Sinon deux jetons seraient tirés, et l'aperçu ouvert par le premier enverrait un lien déjà coupé.
  const cleLien = cleEnvoi('lien', nom);
  if (envoisEnCours.has(cleLien)) return;
  envoisEnCours.add(cleLien);

  // Dossier DÉJÀ envoyé : le lien précédent a circulé — le président a pu le partager à ses
  // éducateurs. On PROPOSE de le renouveler (l'ancien meurt, copies partagées comprises), sans
  // jamais l'imposer : un clic pour relire l'aperçu ne doit pas couper un lien en service la
  // veille du tournoi. Les deux réponses ouvrent le dossier — seule l'adresse change.
  let renouvele;
  try { renouvele = await renouvelerLienSiDemande(club); } finally { envoisEnCours.delete(cleLien); }
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
    const res = await ecrireInvitation('regenererJetonClub', { club_nom: String(club.club_nom || '') });
    if (res && res.club_token) club.club_token = res.club_token;
    await dialogAlerter('🔑 Nouveau lien créé pour ' + String(club.club_nom || '') + '.\n' +
      'L\'ancien ne fonctionne plus : il faut maintenant ENVOYER celui-ci au club.');
    return true;
  } catch (erreur) {
    // Échec du renouvellement : on n'ouvre PAS l'aperçu. Sinon l'organisateur enverrait
    // l'ancien lien en croyant avoir renouvelé.
    if (issueIncertaine(erreur)) {
      // ⛔ Issue inconnue : le jeton a PEUT-ÊTRE changé. Rien n'est renvoyé ; la liste est relue (le lien affiché suivra
      //   le jeton réellement enregistré) — on ne prétend pas que l'ancien lien fonctionne toujours.
      if (typeof rafraichirRessourceAdmin === 'function') rafraichirRessourceAdmin('clubsInvites');
      await dialogAlerter(messageIncertain('le renouvellement du lien de ' + String(club.club_nom || '') + ' n’est pas confirmé — ' +
        'l’ancien lien a peut-être cessé de fonctionner', erreur, 'la liste des clubs est relue : relance « Envoyer le dossier final » ' +
        'pour envoyer le lien en vigueur'));
      return null;
    }
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

/** Clubs proposés dans l'aperçu : acceptés d'abord, puis les autres par ordre alphabétique. */
function clubsApercuDossierEmail() {
  return (clubsInvitesCourants || []).filter(function (c) {
    return String(c.club_nom || '').trim();
  }).slice().sort(function (a, b) {
    const aa = estAccepte(a.statut) ? 0 : 1, bb = estAccepte(b.statut) ? 0 : 1;
    return (aa - bb) || String(a.club_nom).localeCompare(String(b.club_nom), 'fr');
  });
}

/** Aperçu permanent du mail final. Fonction purement visuelle : aucun appel réseau, aucune écriture. */
function majApercuDossierEmail() {
  const select = document.getElementById('apercu-dossier-email-club');
  const objet = document.getElementById('apercu-dossier-email-objet');
  const intro = document.getElementById('apercu-dossier-email-intro');
  const rendu = document.getElementById('apercu-dossier-email-rendu');
  if (!select || !objet || !intro || !rendu) return;

  const clubs = clubsApercuDossierEmail();
  const ancienNom = select.value;
  if (clubs.length) {
    select.innerHTML = clubs.map(function (c) {
      const nom = String(c.club_nom).trim();
      return '<option value="' + echapper(nom) + '">' + echapper(nom)
        + (estAccepte(c.statut) ? '' : ' (' + echapper(String(c.statut || 'invité')) + ')') + '</option>';
    }).join('');
    const conserve = clubs.some(function (c) { return memeTexteSouple(c.club_nom, ancienNom); });
    select.value = conserve ? ancienNom : String(clubs[0].club_nom || '');
    select.disabled = false;
  } else {
    select.innerHTML = '<option value="">Club exemple (aucun club chargé)</option>';
    select.value = '';
    select.disabled = true;
  }

  const club = clubs.find(function (c) { return memeTexteSouple(c.club_nom, select.value); }) || {
    club_nom: 'Club exemple', club_contact_prenom: '',
    categories_engagees: JSON.stringify(catsInvitationTriees().map(function (c) { return c.categorie; }))
  };
  // Même source que la vraie fenêtre d'envoi : uniquement la configuration enregistrée.
  const g = Object.assign({}, configCourante.global || {});
  const prenom = String(club.club_contact_prenom || '').trim();
  const salutation = prenom ? 'Bonjour ' + echapper(prenom) + ',' : 'Bonjour,';
  const img = String(g.tournoi_affiche_id || '').trim() ? urlAffiche(g.tournoi_affiche_id, 800) : '';
  const token = String(club.club_token || '').trim();
  const lien = token ? lienDossierClub(String(club.club_nom || ''), token) : '';
  const sujet = sujetDossier(g);
  objet.value = sujet;
  // Le champ est informatif : fixer aussi sa valeur par défaut évite qu'une restauration
  // automatique de formulaire du navigateur ne le remette à vide après le rendu.
  objet.defaultValue = sujet;
  intro.value = introDossierDefaut(g, club);
  peindreApercuEmail(rendu, emailHtmlDossier(g, club, img, salutation, intro.value, lien));
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
  const engagees = categoriesDuClubInvite(club);
  const toutes = catsInvitationTriees();
  const cats = engagees.length
    ? toutes.filter(function (c) { return engagees.indexOf(String(c.categorie).trim().toUpperCase()) !== -1; })
    : toutes;

  /* --- 1) EN-TÊTE : blason, « votre dossier », titre, date · lieu, NOM DU CLUB --- */
  let entete = '<div style="text-align:center;background:#f7fbff;border:1px solid #e2edf7;border-radius:14px;padding:26px 20px 24px;">'
    + '<img src="' + echapper(urlBlasonEmail()) + '" alt="" width="80" '
    + 'style="display:block;width:80px;height:auto;margin:0 auto 14px;">'
    + '<p style="margin:0;' + A + 'text-transform:uppercase;letter-spacing:2.5px;font-size:12px;line-height:1.5;color:' + EMAIL_BLEU + ';font-weight:bold;">'
    + 'Votre dossier pour la journée</p>'
    + '<h1 style="margin:10px 0 4px;' + A + 'font-size:30px;line-height:1.18;color:' + EMAIL_NAVY + ';">' + nom + '</h1>'
    + ((date || lieu) ? '<p style="margin:8px 0 0;' + A + 'font-weight:bold;font-size:15px;line-height:1.5;color:' + EMAIL_NAVY + ';">'
      + [date, lieu].filter(Boolean).join('<span style="color:' + EMAIL_BLEU + ';"> · </span>') + '</p>' : '')
    + (nomClub ? '<p style="margin:16px 0 0;"><span style="display:inline-block;background:' + EMAIL_NAVY + ';'
      + 'color:#ffffff;border-radius:999px;padding:7px 18px;' + A + 'font-size:13px;text-transform:uppercase;'
      + 'letter-spacing:1px;">Dossier — ' + nomClub + '</span></p>' : '')
    + (engagees.length ? '<p style="margin:9px 0 0;' + A + 'font-size:13px;line-height:1.5;color:' + EMAIL_GRIS + ';">Engagé en '
      + engagees.map(echapper).join(' · ') + '</p>' : '')
    + '<div style="width:96px;height:4px;background:' + EMAIL_BLEU + ';margin:18px auto 0;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>'
    + '</div>';

  // Affiche RÉDUITE : le club l'a déjà vue en grand à l'invitation.
  const blocAffiche = imgSrc
    ? '<img src="' + echapper(imgSrc) + '" alt="Affiche — ' + nom + '" '
      + 'style="display:block;width:100%;max-width:210px;height:auto;border-radius:12px;margin:26px auto 0;box-shadow:0 5px 18px rgba(12,28,46,.12);">'
    : '';

  const bloc_salut = '<p style="margin:28px 0 8px;' + A + 'font-size:16px;line-height:1.5;font-weight:bold;color:' + EMAIL_NAVY + ';">' + salutationHtml + '</p>'
    + (String(intro || '').trim() ? '<p style="margin:0;' + A + 'font-size:14px;color:' + EMAIL_TXT + ';text-align:left;line-height:1.7;">' + nl2brEmail(intro) + '</p>' : '');

  /* --- Petites briques de section « libellé / valeur » --- */
  const ligneJ = function (lib, val) {
    if (!val) return '';
    return '<tr><td style="' + A + 'font-size:13px;line-height:1.5;color:' + EMAIL_GRIS + ';padding:8px 12px 8px 16px;vertical-align:top;">' + echapper(lib) + '</td>'
      + '<td style="' + A + 'font-size:13px;line-height:1.5;color:' + EMAIL_TXT + ';font-weight:bold;padding:8px 16px 8px 0;vertical-align:top;">' + echapper(val) + '</td></tr>';
  };
  const bloc = function (titre, lignesHtml) {
    return lignesHtml ? (emailTitreSection(titre)
      + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="' + EMAIL_TABLEAU_INFOS + '">' + lignesHtml + '</table>') : '';
  };

  /* --- 2) LE JOUR J : la journée en un coup d'œil (réservée au dossier final) --- */
  const frise = friseJourneeEmail(g, cats, A);
  const blocJournee = frise ? (emailTitreSection('La journée en un coup d\'œil') + frise) : '';

  /* --- Contenu assemblé du dossier complet : journée, pratique, contacts et sportif. --- */
  const blocPratique = bloc('Infos pratiques',
    ligneJ('Lieu', String(g.tournoi_lieu || '').trim())
    + ligneJ('Adresse', String(g.tournoi_adresse || '').trim())
    + ligneJ('Parking', String(g.logistique_parking || '').trim())
    + ligneJ('Buvette / restauration', String(g.logistique_buvette || '').trim())
    + ligneJ('Vestiaires', String(g.logistique_vestiaires || '').trim()));

  const parkingTxt = String(g.parking_texte || '').trim();
  const blocParking = parkingTxt
    ? emailTitreSection('Parking & accès')
      + '<p style="margin:0;padding:16px 18px;background:' + EMAIL_PANNEAU + ';border:1px solid ' + EMAIL_FILET
      + ';border-radius:12px;' + A + 'font-size:13px;color:' + EMAIL_TXT + ';text-align:left;line-height:1.65;">' + nl2brEmail(parkingTxt) + '</p>'
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
    ligneJ('Date limite de paiement', String(g.date_limite_confirmation || '').trim() ? formaterDateFr(g.date_limite_confirmation) : '')
    + ligneJ('Tarif d\'engagement', tarifOui ? libelleTarifEngagement(g) : '')
    + ligneJ('Modalités de paiement', tarifOui ? String(g.tarif_engagement_modalites || '').trim() : ''));

  /* --- 6) LE LIEN — non plus pour LIRE le dossier (il est ci-dessus), mais pour ce qui BOUGE :
         les poules et le planning une fois arrêtés, et le partage aux éducateurs. --- */
  const blocLien = lien
    ? emailTitreSection('Votre espace en ligne')
      + '<div style="padding:18px 20px;background:#eef6fd;border:1px solid #cfe4f7;border-radius:12px;">'
      + '<p style="margin:0 0 16px;' + A + 'font-size:13px;color:' + EMAIL_TXT + ';line-height:1.65;">'
      + 'Tout l\'essentiel est dans cet email. Votre lien personnel, lui, reste vivant : il affichera '
      + '<strong>vos poules et votre planning</strong> dès qu\'ils seront arrêtés, et il vous permet de '
      + '<strong>partager le dossier à vos éducateurs</strong> en un geste.</p>'
      + '<p style="margin:0;text-align:center;"><a href="' + lien + '" '
      + 'style="display:inline-block;background:' + EMAIL_BLEU + ';color:#ffffff;text-decoration:none;'
      + 'border-radius:8px;padding:15px 32px;' + A + 'font-size:15px;font-weight:bold;box-shadow:0 4px 12px rgba(46,143,224,.24);">Ouvrir mon espace</a></p></div>'
    : '';

  const pied = barreLiensEmail(A)
    + '<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ' + EMAIL_FILET + ';' + A + 'font-size:12px;line-height:1.6;color:' + EMAIL_GRIS + ';text-align:center;">'
    + 'L\'organisation du tournoi'
    + (lien ? '<br><a href="' + lien + '" style="color:' + EMAIL_BLEU + ';">Voir la version en ligne</a>' : '')
    + '</p>';

  // Les deux cartes de saisie ouvrent l'email dans l'ordre du menu, puis vient le dossier
  // complet assemblé (journée, infos pratiques, contacts, sportif, modalités et lien vivant).
  return '<div style="background:' + EMAIL_FOND + ';padding:32px 14px;' + A + '">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%;margin:0 auto;background:#ffffff;border-collapse:separate;border-radius:18px;box-shadow:0 8px 28px rgba(12,28,46,.10);">'
    + '<tr><td style="padding:34px 38px 30px;">'
    + entete
    + blocAffiche + bloc_salut
    + blocParking + blocEncadrement + emailTitreSection('Dossier complet')
    + blocJournee + blocPratique + blocContact + blocCats + blocModalites + blocLien + pied
    + '</td></tr></table></div>';
}

/** Version TEXTE brut de l'email de dossier final (repli anti-spam / clients sans HTML).
 *  Même contenu et même ordre que les trois cartes du menu « Dossier final ». */
function emailTexteDossier(g, club, salutationTexte, intro, lienDossier) {
  const L = [];
  const nom = String(g.tournoi_nom || '').trim() || 'Le tournoi';
  const engagees = categoriesDuClubInvite(club);
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

  if (String(g.parking_texte || '').trim()) {
    L.push('PARKING & ACCÈS');
    L.push(String(g.parking_texte).trim());
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

  L.push('DOSSIER COMPLET');
  L.push('');

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

  const mod = [];
  if (String(g.date_limite_confirmation || '').trim()) mod.push('Date limite de paiement : ' + formaterDateFr(g.date_limite_confirmation));
  if (estOui(g.tarif_engagement_oui) && String(g.tarif_engagement_montant || '').trim()) mod.push('Tarif d\'engagement : ' + libelleTarifEngagement(g));
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
  const piecesAEnvoyer = piecesJointesDossierPourEnvoi();
  const resumePieces = piecesAEnvoyer.length
    ? '<div class="eml-pieces-jointes"><strong>📎 ' + piecesAEnvoyer.length + ' pièce(s) jointe(s)</strong><br>' +
      piecesAEnvoyer.map(function (p) { return echapper(p.nom); }).join(' · ') + '</div>'
    : '<div class="eml-pieces-jointes"><strong>Aucune pièce jointe</strong><br>' +
      'Tu peux fermer cette fenêtre et ajouter des documents dans la carte « Pièces jointes ».</div>';
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
      resumePieces +
      '<p class="eml-apercu-label">Les sections ci-dessous (parking &amp; accès, encadrement &amp; assurance, puis dossier complet) ' +
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
    peindreApercuEmail(iframe, emailHtmlDossier(g, club, imgApercu, salutHtml, champIntro.value, lien));
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
        'RIEN n\'a été envoyé.\nSon ancien lien ne fonctionne plus : relance « Envoyer le dossier ' +
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
    const cle = cleEnvoi('dossier', nom);
    if (boutonEnvoi.disabled || envoisEnCours.has(cle)) return;   // ⛔ double clic : un seul e-mail
    msg.className = 'eml-msg';
    if (!sujet) { msg.className = 'eml-msg ko'; msg.textContent = '⚠️ L\'objet est vide.'; return; }
    if (!dossierFinalDisponible(club)) {
      msg.className = 'eml-msg ko';
      msg.textContent = 'Ajoute d’abord les équipes au tournoi dans Clubs invités pour débloquer l’envoi du dossier final.';
      return;
    }
    envoisEnCours.add(cle);
    const texte = boutonEnvoi.textContent;
    occuperBouton(boutonEnvoi);
    const libre = function () { envoisEnCours.delete(cle); libererBouton(boutonEnvoi, texte); };
    if (envoisIncertains.has(cle) && !await dialogConfirmer('L’envoi précédent du dossier à ' + email + ' n’a pas été confirmé : ' +
        'le club l’a peut-être déjà reçu. Renvoyer quand même ?', { ok: 'Renvoyer' })) { libre(); return; }
    boutonEnvoi.textContent = 'Envoi…';
    msg.className = 'eml-msg';
    msg.textContent = 'Envoi en cours…';
    try {
      const res = await ecrireEnvoiEmail('envoyerDossierEmail', {
        club_nom: nom, sujet: sujet,
        html_modele: emailHtmlDossier(g, club, imgModele, salutHtml, intro, lien),
        texte_modele: emailTexteDossier(g, club, salutTexte, intro, lien),
        pieces_jointes: piecesAEnvoyer
      }, { cle: cle, incertain: envoisIncertains.has(cle) });
      envoisIncertains.delete(cle);
      envoisEnCours.delete(cle);
      oublierIdEnvoi(cle);
      // Succès : dossier_envoye posé côté serveur (uniquement en cas de succès).
      envoye = true;   // le nouveau lien est parti : plus d'avertissement à la fermeture
      const c = clubsInvitesCourants.find(function (x) { return memeTexteSouple(x.club_nom, nom); });
      if (c && res && res.dossier_envoye) c.dossier_envoye = res.dossier_envoye;
      afficherClubsInvites();
      if (typeof afficherSuiviClubs === 'function') afficherSuiviClubs();
      afficherMessage(document.getElementById('message-suivi-clubs'), res && res.rejeu
        ? '✅ Dossier déjà parti vers ' + email + ' (la réponse précédente s’était perdue) : rien n’a été renvoyé.'
        : '✅ Dossier envoyé à ' + email +
        (piecesAEnvoyer.length ? ' avec ' + piecesAEnvoyer.length + ' pièce(s) jointe(s).' : '.'), 'ok');
      fermer();
    } catch (erreur) {
      // Échec : dossier_envoye NON posé → on garde la fenêtre pour relancer.
      msg.className = 'eml-msg ko';
      if (issueIncertaine(erreur)) {
        // ⛔ Issue inconnue : l'e-mail est peut-être parti. Rien n'est renvoyé ; la liste est relue (« Dossier envoyé le … »)
        //   et un nouveau clic demandera confirmation.
        envoisIncertains.add(cle);
        msg.textContent = messageIncertain('l’envoi du dossier à ' + email + ' n’est pas confirmé — le club l’a peut-être reçu',
          erreur, 'le suivi est relu : « Dossier envoyé le … » dira s’il est parti');
        if (typeof rafraichirRessourceAdmin === 'function') rafraichirRessourceAdmin('clubsInvites');
      } else { oublierIdEnvoi(cle); msg.textContent = '⚠️ ' + erreur.message; }
      libre();
    }
  });
}
