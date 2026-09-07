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

/** Pré-remplit le formulaire des infos du tournoi avec ce qui est déjà enregistré. */
function majInfosTournoi() {
  const form = document.getElementById('form-infos-tournoi');
  if (!form) return;
  const g = configCourante.global || {};
  form.tournoi_nom.value = g.tournoi_nom || '';
  form.tournoi_lieu.value = g.tournoi_lieu || '';
  form.tournoi_adresse.value = g.tournoi_adresse || '';
  form.tournoi_description.value = g.tournoi_description || '';

  // Date + zone de vacances : elles vivent dans la carte « Date & conformité FFR »
  // (#form-cadre-tournoi), pas ici. On les (re)remplit là-bas et on marque ce formulaire propre.
  const cadre = document.getElementById('form-cadre-tournoi');
  if (cadre) {
    if (cadre.tournoi_date)  cadre.tournoi_date.value = g.tournoi_date || '';
    if (cadre.zone_vacances) cadre.zone_vacances.value = g.zone_vacances || 'C'; // défaut 'C' (migration douce)
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(cadre);
  }

  // Aperçu de l'affiche déjà enregistrée (image Drive publique).
  afficheDataURI = '';
  const bloc = document.getElementById('apercu-affiche');
  const img = document.getElementById('apercu-affiche-img');
  if (g.tournoi_affiche_id) {
    img.src = urlAffiche(g.tournoi_affiche_id, 600);
    bloc.hidden = false;
  } else {
    img.removeAttribute('src');
    bloc.hidden = true;
  }

  // Formulaire (re)rempli avec l'état ENREGISTRÉ → nouvelle référence pour le
  // détecteur de « modifications non enregistrées » de l'assistant.
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);

  // Conformité FFR : (re)vérifie dès que les infos (dont la date) sont (re)chargées.
  if (typeof majConformiteFFR === 'function') majConformiteFFR();
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

  // Cas 1 : choix non enregistré → on annule simplement la sélection.
  if (afficheDataURI) {
    afficheDataURI = '';
    form.tournoi_affiche.value = '';
    majInfosTournoi(); // ré-affiche l'affiche enregistrée, ou masque l'aperçu si aucune
    afficherMessage(message, "Choix d'affiche annulé.", 'ok');
    return;
  }

  // Cas 2 : affiche enregistrée → confirmation puis suppression backend.
  if (!(configCourante.global && configCourante.global.tournoi_affiche_id)) return;
  if (!await dialogConfirmer("Retirer l'affiche du tournoi ?", { ok: 'Retirer', danger: true })) return;

  const bouton = document.getElementById('bouton-retirer-affiche');
  bouton.disabled = true;
  try {
    await ecrireAdmin('supprimerAffiche', {});
    configCourante = await lireConfigAdmin();
    majInfosTournoi();
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
    await ecrireAdmin('enregistrerInfosTournoi', lireCadreTournoi());
    // On recharge la config pour refléter l'état réel, puis on rafraîchit ce qui dépend de la date.
    configCourante = await lireConfigAdmin();
    majInfosTournoi(); // remet date/zone à l'état enregistré (+ marque les formulaires propres)
    majDossier();      // le dossier club montre la date
    afficherMessage(message, '✅ Date & zone enregistrées.', 'ok');
  });
}

/**
 * Enregistre les infos du tournoi (nom/date/lieu/description + affiche éventuelle),
 * indépendamment de la publication. Utilisable à tout moment, même après publication
 * (pour corriger une faute de frappe sans avoir à dépublier).
 */
async function onEnregistrerInfos() {
  const message = document.getElementById('message-infos-tournoi');
  const bouton = document.getElementById('bouton-enregistrer-infos');
  await avecBoutonOccupe(bouton, message, async function () {
    afficherMessage(message, 'Enregistrement des infos…', 'ok');
    await ecrireAdmin('enregistrerInfosTournoi', lireInfosTournoi());
    if (afficheDataURI) {
      afficherMessage(message, "Envoi de l'affiche…", 'ok');
      await ecrireAdmin('enregistrerAffiche', { affiche: afficheDataURI });
    }
    // On recharge la config pour refléter ce qui est réellement enregistré (dont l'affiche).
    configCourante = await lireConfigAdmin();
    majInfosTournoi();
    majDossier(); // le dossier club reflète les nouvelles infos
    document.getElementById('form-infos-tournoi').tournoi_affiche.value = ''; // vide le champ fichier
    afficherMessage(message, '✅ Infos enregistrées.', 'ok');
  });
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

  await avecBoutonOccupe(bouton, message, async function () {
    await ecrireAdmin('enregistrerContactsSecurite', data);
    configCourante.global = Object.assign({}, configCourante.global, data);
    majContactsSecurite(); // ré-affiche les numéros normalisés + reprend la photo « propre »
    majDossier();          // les sections Sécurité / Contact du dossier suivent
    afficherMessage(message, '✅ Contacts & sécurité enregistrés.', 'ok');
  });
}

/* --------------------------------------------------------------------------
   PHASE 1 — carte « Sur place » (buvette / sandwich / boutique)
   et carte « Réponse à l'invitation » (date limite + contact référent).
   -------------------------------------------------------------------------- */

/** Pré-remplit la carte « Sur place » avec l'état enregistré. */
function majSurPlace() {
  const form = document.getElementById('form-surplace');
  if (!form) return;
  const g = configCourante.global || {};
  form.buvette_disponible.checked = estOui(g.buvette_disponible);
  form.espace_sandwich_disponible.checked = estOui(g.espace_sandwich_disponible);
  form.boutique_disponible.checked = estOui(g.boutique_disponible);
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
}

/** Enregistre la carte « Sur place » (3 booléens rangés en 'oui'/'non'). */
async function onEnregistrerSurPlace() {
  const message = document.getElementById('message-surplace');
  const bouton = document.getElementById('bouton-enregistrer-surplace');
  const form = document.getElementById('form-surplace');
  const data = {
    buvette_disponible:         form.buvette_disponible.checked ? 'oui' : 'non',
    espace_sandwich_disponible: form.espace_sandwich_disponible.checked ? 'oui' : 'non',
    boutique_disponible:        form.boutique_disponible.checked ? 'oui' : 'non'
  };
  await avecBoutonOccupe(bouton, message, async function () {
    await ecrireAdmin('enregistrerSurPlace', data);
    configCourante.global = Object.assign({}, configCourante.global, data);
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
    majApercuInvitation(); // l'aperçu de l'email suit (ligne « Sur place »)
    afficherMessage(message, '✅ « Sur place » enregistré.', 'ok');
  });
}

/** Pré-remplit la carte « Réponse à l'invitation » avec l'état enregistré. */
function majReponse() {
  const form = document.getElementById('form-reponse');
  if (!form) return;
  const g = configCourante.global || {};
  form.date_limite_reponse.value = g.date_limite_reponse || '';
  form.contact_reponse_nom.value = g.contact_reponse_nom || '';
  form.contact_reponse_tel.value = g.contact_reponse_tel || '';
  form.contact_reponse_email.value = g.contact_reponse_email || '';
  form.email_expediteur.value = g.email_expediteur || '';
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
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
    ['Modalités d\'inscription (date limite, tarif)', !!(g.date_limite_confirmation || oui(g.tarif_engagement_oui))],
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

/** Vrai si le tournoi est actuellement publié (visible du public). */
function estPublie() {
  return String(configCourante.global && configCourante.global.tournoi_publie).toLowerCase() === 'oui';
}

/** Met à jour l'état affiché et le libellé du bouton selon la publication en cours. */
function majPublication() {
  const etat = document.getElementById('etat-publication');
  const bouton = document.getElementById('bouton-publier');
  if (!etat || !bouton) return;
  if (estPublie()) {
    etat.textContent = '🟢 Publié (visible du public)';
    bouton.innerHTML = svgIcone('monde') + 'Masquer le tournoi';
  } else {
    etat.textContent = '⚪️ Non publié (les visiteurs voient « à venir »)';
    bouton.innerHTML = svgIcone('monde') + 'Publier le tournoi';
  }
  majAccesPublic();   // l'adresse, elle, ne dépend pas de l'état : seule la NOTE change
  majVerrouPublier(); // le GESTE, lui, reste soumis aux prérequis — mais lui SEUL
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
 * qu'aux modes guidés : le bouton « Vue classique » remettait la carte dans la page longue
 * et laissait publier un tournoi vide sans rien pour le retenir. Porté par le bouton, le
 * garde-fou suit partout — barre latérale, assistant mobile, vue classique.
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

/**
 * « Publier le tournoi » OU « Masquer ». À la publication, on enregistre d'abord
 * les infos saisies (nom/date/lieu/description) + l'affiche éventuelle, PUIS on publie.
 * Le masquage, lui, ne fait que dépublier.
 */
async function onPublier() {
  const message = document.getElementById('message-publication');
  const bouton = document.getElementById('bouton-publier');
  const publier = !estPublie(); // on bascule vers l'état inverse
  const question = publier
    ? 'Publier le tournoi ?\n\nLe tournoi deviendra visible du public. Les infos saisies (nom, date, lieu, description, affiche) seront aussi enregistrées.'
    : 'Masquer le tournoi ? Les visiteurs reverront l\'écran « à venir ».';
  if (!await dialogConfirmer(question, { ok: publier ? 'Publier' : 'Masquer' })) return;

  bouton.disabled = true;
  try {
    if (publier) {
      afficherMessage(message, 'Enregistrement des infos…', 'ok');
      // Filet « par sécurité » à la publication : on enregistre les infos SITE + la date/zone de la
      // carte cadre (payload fusionné ; le backend n'écrit que les champs présents).
      await ecrireAdmin('enregistrerInfosTournoi', Object.assign({}, lireInfosTournoi(), lireCadreTournoi()));
      if (afficheDataURI) {
        afficherMessage(message, 'Envoi de l\'affiche…', 'ok');
        await ecrireAdmin('enregistrerAffiche', { affiche: afficheDataURI });
      }
      afficherMessage(message, 'Publication…', 'ok');
      await ecrireAdmin('publierTournoi', { publie: 'oui' });
    } else {
      afficherMessage(message, 'Masquage…', 'ok');
      await ecrireAdmin('publierTournoi', { publie: 'non' });
    }
    // On recharge la config pour refléter le nouvel état.
    configCourante = await lireConfigAdmin();
    majInfosTournoi();
    document.getElementById('form-infos-tournoi').tournoi_affiche.value = ''; // vide le champ fichier
    majPublication();
    majTableauBord();
    afficherMessage(message, publier ? '✅ Tournoi publié.' : '✅ Tournoi masqué.', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
    // ⚠️ …puis on lui rend son état JUSTE, et cette ligne n'est pas décorative.
    // `majPublication()` (donc le garde-fou) s'exécute plus haut, DANS le `try` : sans ce
    // rappel, la réactivation ci-dessus l'écraserait systématiquement. Le cas concret :
    // on masque un tournoi dont la préparation est incomplète → le bouton redevient
    // « Publier le tournoi », et il resterait CLIQUABLE alors qu'il doit être grisé.
    // ⛔ Aucune règle métier n'est touchée : on ne fait que recalculer un état VISUEL.
    majVerrouPublier();
  }
}
