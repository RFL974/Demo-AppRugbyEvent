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
  if (typeof majChoixCategoriesTournoi === 'function') majChoixCategoriesTournoi();
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
   PHASE 1 — carte « Sur place » (buvette / sandwich / boutique / repas / goûter)
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
  // ⭐ 5R — l'accès de la table de marque, relu APRÈS la connexion admin (cette fonction n'est
  //   appelée qu'une fois connecté). ⛔ Lecture seule, sans verrou ; aucun changement d'état ici.
  chargerAccesScores();
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
 * Lit l'état de l'accès (clé admin). ⭐ Appelée après la connexion (`majPublication`) et après chaque
 * geste. ⛔ Sans clé admin rangée, elle ne fait RIEN : elle n'ouvre jamais de fenêtre de clé.
 */
async function chargerAccesScores() {
  if (!document.getElementById('acces-saisie')) return false;
  let cle = '';
  try { cle = lireCleLocale('admin'); } catch (e) { cle = ''; }
  if (!cle) { masquerAccesScores(); return false; }
  const numero = ++accesScoresSequence;
  try {
    const etat = await apiPostProtege('getAccesScoresAdmin', {}, 'admin', 'admin');
    if (numero !== accesScoresSequence) return false;
    accesScoresCourant = etat;
    rendreAccesScores(etat);
    return true;
  } catch (err) {
    if (numero !== accesScoresSequence) return false;
    const message = document.getElementById('message-acces-saisie');
    if (message) afficherMessage(message, '⚠️ État de l\'accès indisponible : ' + err.message, 'ko');
    return false;
  }
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
  if (!etat) { libelle.textContent = 'Connecte-toi à l\'administration pour voir l\'accès.'; return; }
  if (etat.disponible === false) { libelle.textContent = etat.message || 'Accès indisponible.'; return; }
  if (etat.anomalie) { libelle.textContent = '⚠️ ' + (etat.message || 'Ligne d\'accès illisible.'); return; }

  const fermeAuto = etat.fermee_automatiquement === true;
  libelle.textContent = fermeAuto ? ACCES_SCORES_LIBELLE_FERME_AUTO
    : (ACCES_SCORES_LIBELLES_ETAT[etat.etat] || ('État inconnu : ' + etat.etat));
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
      bouton.className = 'bouton' + (g.danger ? ' bouton-danger' : '');
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
    { transition: transition, version_lue: versionLue, requete_id: nouvelIdRequeteAdmin() });
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
  const versionLue = String(etat.version);
  const donnees = { transition: action, version_lue: versionLue, requete_id: nouvelIdRequeteAdmin() };
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
      catch (err) { if (message) afficherMessage(message, '⚠️ ' + err.message, 'ko'); await chargerAccesScores(); return false; }
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
      catch (err) { if (message) afficherMessage(message, '⚠️ ' + err.message, 'ko'); await chargerAccesScores(); return false; }
    }
    donnees.confirme = true;
  }

  const zone = document.getElementById('acces-saisie');
  if (zone) zone.querySelectorAll('[data-geste-acces]').forEach(function (b) { b.disabled = true; });
  let applique = false;
  try {
    const res = await ecrireAdmin('changerAccesScores', donnees);
    applique = true;
    if (message) afficherMessage(message, '✅ ' + (ACCES_SCORES_LIBELLES_ETAT[res.etat] || 'Accès mis à jour.'), 'ok');
  } catch (err) {
    if (message) afficherMessage(message, '⚠️ ' + err.message, 'ko');
  }
  await chargerAccesScores();   // ⭐ l'écran suit le serveur, jamais l'inverse
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
 */
async function onPublier() {
  const message = document.getElementById('message-publication');
  const bouton = document.getElementById('bouton-publier');
  const publier = !estPublie(); // on bascule vers l'état inverse
  const question = publier
    ? 'Publier le tournoi ?\n\nLe tournoi deviendra visible du public et le planning apparaîtra automatiquement dans les dossiers des clubs. Les infos saisies (nom, date, lieu, description, affiche) seront aussi enregistrées.'
    : 'Masquer le tournoi ? Les visiteurs reverront l\'écran « à venir » et le planning sera masqué dans les dossiers des clubs.';
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
    afficherMessage(message, publier
      ? '✅ Tournoi publié. Le planning est maintenant visible dans les dossiers des clubs.'
      : '✅ Tournoi masqué. Le planning est retiré des dossiers des clubs.', 'ok');
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
