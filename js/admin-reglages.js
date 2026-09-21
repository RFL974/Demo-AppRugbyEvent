/**
 * ============================================================================
 *  ADMIN — RÉGLAGES (horaires + catégories) (extrait de admin.js)
 * ============================================================================
 *  Affichage et enregistrement des réglages du tournoi : horaires globaux
 *  (début/fin, battement, pause déjeuner, RDV, marge de fin communiquée) et
 *  catégories (présence, terrains, nombre de poules Auto/forcé, format
 *  d'après-midi, durées…), avec ajout / suppression. Sorti du monolithe
 *  admin.js SANS changement de comportement.
 *
 *  Dépend de globaux définis ailleurs, accédés au moment de l'appel (handlers
 *  post-chargement) — l'ordre des <script> importe peu ; chargé après admin.js :
 *   - commun.js : echapper, svgIcone, comparerCategorie, afficherMessage, avecBoutonOccupe…
 *   - admin.js  : configCourante, ecrireAdmin, apiGet, majTableauBord,
 *                 majEtatAvancement, majDossier, remplirSelectCategories, dialog*…
 * ============================================================================
 */

/* --------------------------------------------------------------------------
   AFFICHAGE DES RÉGLAGES
   -------------------------------------------------------------------------- */

/**
 * Injecte les réglages dans leurs deux zones distinctes (horaires / catégories),
 * pour permettre une mise en page côte à côte sur grand écran. Les écouteurs délégués
 * sont posés sur le DOCUMENT (voir initAdmin) : ils continuent de fonctionner même
 * quand le mode écrans déplace les deux zones hors de #reglages.
 */
function injecterReglages(global, categories) {
  injecterHoraires(global);
  // Cartes des catégories : rendu SANS perte de saisie (conseils des terrains manuels et « Forme FFR attendue »
  // compris) — voir injecterCategories.
  injecterCategories(categories);
}

/**
 * Carte "Horaires de la journée" sous forme de FORMULAIRE modifiable.
 * Les heures utilisent le champ natif <input type="time"> (rouleau sur mobile).
 */
function afficherHoraires(global) {
  function val(cle, def) {return (global && global[cle] != null && global[cle] !== '') ? echapper(String(global[cle])) : (def || '');}
  const auto=String((global && global.heure_fin_auto) || 'oui').toLowerCase() !== 'non';
  // `novalidate` : les contrôles sont ceux de controlerSaisieHoraires, qui les MONTRENT. Le contrôle natif bloquait
  // l'envoi sans un mot quand le champ fautif dormait dans un panneau fermé, et son pas de 5 min refusait le
  // battement de 2 ou 3 min que le serveur accepte (et que l'arbitrage du planning propose).
  return '<div class="cv-horaires"><section class="carte"><h2>Horaires principaux</h2>' +
    '<form id="form-horaires" class="form-reglages" novalidate>' +
    champHeure('heure_rdv','Accueil des équipes',val('heure_rdv')) +
    champHeure('heure_debut','Début des matchs',val('heure_debut')) +
    blocPauseDejeuner(global,val) +
    champNombre('marge_fin_communiquee_min','Clôture après le dernier match (min)',val('marge_fin_communiquee_min','75'),'Retour aux vestiaires et remise des trophées.') +
    '<details class="cv-options"><summary>Options avancées<span>Battement, fin des matchs et horaire communiqué</span></summary>' +
    champNombre('battement_terrain_min','Battement entre deux matchs sur un terrain (min)',val('battement_terrain_min','5')) +
    '<div class="champ-reglage"><label for="h-heure_fin">Fin des matchs</label><span class="fin-groupe">' +
    '<label class="mini-toggle"><input type="checkbox" id="h-heure_fin_auto" name="heure_fin_auto"'+(auto?' checked':'')+'> Calcul automatique</label>' +
    '<input type="time" id="h-heure_fin" name="heure_fin" value="'+val('heure_fin')+'"'+(auto?' disabled':'')+'></span></div>' +
    champHeure('heure_fin_communiquee','Fin de journée communiquée aux clubs',val('heure_fin_communiquee'),'Laisser vide pour suivre la fin du dernier match, avec la durée de clôture.') +
    '</details></form></section><aside class="carte cv-horaires-resume"><h2>Aperçu de la journée</h2>' +
    '<p class="note-generation">Les temps forts calculés depuis vos horaires et le planning enregistré.</p>' +
    '<div id="cv-frise-horaires">'+friseHorairesCiel(global,typeof matchsCourants==='undefined'?[]:matchsCourants)+'</div></aside>' +
    '<div class="cv-actions-enregistrer cv-verre"><span id="message-horaires" class="message-form" role="status"></span><button type="submit" form="form-horaires" class="bouton">Enregistrer les horaires</button></div></div>';
}

/** Projection de lecture : aucune modification des heures du générateur. */
function reperesHorairesCiel(g,matchs) {
  g=g||{};
  const echelonnee=String(g.pause_echelonnee).toLowerCase()==='oui';
  const fins=(matchs||[]).map(m=>String(m.heure_fin||'')).filter(h=>/^\d{2}:\d{2}$/.test(h)).sort();
  const dernierPlanifie=fins.length?fins[fins.length-1]:'';
  const fin=g.heure_fin||'';
  const ajouter=heurePlusMinutesEmail;
  const reprise=echelonnee?g.pause_echelonnee_fin:(Number(g.pause_dejeuner_duree_min)>0?ajouter(g.pause_dejeuner_debut,Number(g.pause_dejeuner_duree_min)):'');
  return {etapes:[['Accueil des équipes',g.heure_rdv],['Premiers matchs',g.heure_debut],
    [echelonnee?'Pause échelonnée à partir de':'Pause déjeuner',g.pause_dejeuner_debut],
    [echelonnee?'Dernier retour de pause':'Reprise',reprise],['Fin des matchs prévue',fin]],
    finCommuniquee:heureFinCommuniqueeAdmin(g),echelonnee,fin,dernierPlanifie};
}
function friseHorairesCiel(g,matchs) {
  const r=reperesHorairesCiel(g,matchs);
  // Les heures absentes restent explicites. La frise est une suite de repères, pas un axe à l’échelle.
  return '<ol class="cv-frise">'+r.etapes.slice().sort((a,b)=>(a[1]||'99:99').localeCompare(b[1]||'99:99')).map(e=>'<li><strong>'+echapper(e[1]||'—')+'</strong><span>'+e[0]+'</span></li>').join('')+'</ol>' +
    '<div class="cv-fin-journee"><span>Fin de journée annoncée aux clubs</span><strong>'+echapper(r.finCommuniquee||'—')+'</strong></div>' +
    '<div class="cv-information"><strong>Horaires calculés depuis le planning</strong>'+ (r.fin?'La fin prévue suit les réglages du tournoi. La fin annoncée reprend le calcul utilisé dans les invitations et dossiers clubs.':'Générez le planning pour connaître la fin des matchs et la fin de journée.') +
    (r.dernierPlanifie && r.dernierPlanifie!==r.fin?' Dernier match actuellement planifié : '+echapper(r.dernierPlanifie)+'.':'')+(r.echelonnee?' Les équipes prennent leur pause à tour de rôle.':'')+'</div>';
}
function actualiserFriseHorairesCiel() {
 const el=document.getElementById('cv-frise-horaires');if(el)el.innerHTML=friseHorairesCiel(configCourante.global,matchsCourants);
}

/**
 * Bloc « Pause déjeuner » de la carte Horaires, avec l'option GLOBALE « Pause méridienne échelonnée »
 * juste au-dessus. Quand elle est cochée : la pause déjeuner devient « à partir de » (heure de départ
 * de la pause échelonnée), le champ « durée » est masqué (chaque équipe a 60 min garanti), et l'heure
 * de fin de pause de la DERNIÈRE équipe est mentionnée (calculée à la génération, Config.pause_echelonnee_fin).
 * L'affichage conditionnel est piloté par data-ech (voir onReglagesChange) — pas de :has(), tous téléphones.
 */
function blocPauseDejeuner(global, val) {
  var ech = String((global && global.pause_echelonnee) == null ? '' : global.pause_echelonnee).trim().toLowerCase() === 'oui';
  var finEch = val('pause_echelonnee_fin');
  return (
    '<div class="bloc-pause-dej" data-ech="' + (ech ? 'oui' : 'non') + '">' +
      '<details class="cv-options"><summary>Options de pause<span>Pause méridienne échelonnée</span></summary><div class="champ-reglage">' +
        '<label class="ech-toggle"><input type="checkbox" id="h-pause_echelonnee" name="pause_echelonnee"' +
          (ech ? ' checked' : '') + '> Pause méridienne échelonnée (repos ≥ 60 min garanti)</label>' +
        '<span class="f-aide">Quand les <b>terrains sont peu nombreux</b> : chaque catégorie (≥ 4 équipes) ' +
          'joue en un round-robin et les équipes se <b>relaient</b> pour la pause déjeuner (jamais une équipe ' +
          'reposée contre une équipe épuisée). Remplace la pause déjeuner unique et le format d\'après-midi.</span>' +
      '</div></details>' +
      // Pause déjeuner début (label dynamique « — début » / « à partir de »).
      '<div class="champ-reglage">' +
        '<label for="h-pause_dejeuner_debut"><span class="lbl-pause-dej-fixe">Pause déjeuner — début</span>' +
          '<span class="lbl-pause-dej-ech">Pause déjeuner à partir de</span></label>' +
        '<input type="time" id="h-pause_dejeuner_debut" name="pause_dejeuner_debut" value="' + val('pause_dejeuner_debut') + '">' +
      '</div>' +
      // Durée : masquée en échelonné (60 min garanti par équipe).
      '<div class="champ-reglage champ-pause-duree">' +
        '<label for="h-pause_dejeuner_duree_min">Pause déjeuner — durée (min)</label>' +
        '<input type="number" id="h-pause_dejeuner_duree_min" name="pause_dejeuner_duree_min" min="0" step="5" value="' +
          val('pause_dejeuner_duree_min') + '">' +
      '</div>' +
      // Fin de pause de la dernière équipe (échelonné) : calculée à la génération.
      '<div class="champ-reglage champ-pause-fin">' +
        '<span class="f-aide">🍽️ <b>Pause échelonnée</b> : la dernière équipe finit sa pause à ' +
          '<strong id="val-pause-fin">' + (finEch ? echapper(finEch) : '—') + '</strong> ' +
          '<span class="f-aide-mini">(calculé à la génération des poules)</span>.</span>' +
      '</div>' +
    '</div>'
  );
}

/** Retire `minutes` à une heure « HH:MM ». Renvoie « HH:MM », ou '' si l'heure est illisible. */
function heureMoinsMinutes(hhmm, minutes) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return '';
  let total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) - minutes;
  while (total < 0) total += 24 * 60; // reste sur la même journée (pas d'heure négative)
  return ('0' + Math.floor(total / 60)).slice(-2) + ':' + ('0' + (total % 60)).slice(-2);
}

/* Un champ "heure" (rouleau natif sur mobile), avec une ligne d'aide optionnelle. */
function champHeure(nom, label, valeur, aide) {
  return '<div class="champ-reglage">' +
           '<label for="h-' + nom + '">' + label + '</label>' +
           '<input type="time" id="h-' + nom + '" name="' + nom + '" value="' + valeur + '">' +
           (aide ? '<span class="f-aide">' + aide + '</span>' : '') +
         '</div>';
}

/* Un champ "nombre" (ex : durée en minutes), avec une ligne d'aide optionnelle. */
function champNombre(nom, label, valeur, aide) {
  return '<div class="champ-reglage">' +
           '<label for="h-' + nom + '">' + label + '</label>' +
           '<input type="number" id="h-' + nom + '" name="' + nom + '" min="0" step="5" value="' + valeur + '">' +
           (aide ? '<span class="f-aide">' + aide + '</span>' : '') +
         '</div>';
}

/* --------------------------------------------------------------------------
   ÉCRAN « HORAIRES » — saisie en cours, contrôle et enregistrement (contrat d'écriture)
   --------------------------------------------------------------------------
   ⭐ UNE action = UNE requête (`enregistrerHoraires`), qui porte l'état FINAL du formulaire ; l'écran se met à
     jour depuis la RÉPONSE, sans relecture. Tout le reste (panneaux, cases, flèches, pré-remplissage de
     l'accueil) reste local : zéro appel.
   ⛔ Une saisie non enregistrée n'est plus écrasée par une relecture lancée ailleurs (catégorie ajoutée, planning
     généré, terrains appliqués…) : voir injecterHoraires.
   -------------------------------------------------------------------------- */

/* Champs du formulaire, dans l'ordre de l'envoi d'avant ce lot. */
const CHAMPS_FORMULAIRE_HORAIRES = ['heure_debut', 'heure_rdv', 'heure_fin', 'heure_fin_auto', 'heure_fin_communiquee',
  'marge_fin_communiquee_min', 'battement_terrain_min', 'pause_dejeuner_debut', 'pause_dejeuner_duree_min', 'pause_echelonnee'];

/* Libellés de l'écran : un refus dit QUEL champ corriger. */
const LIBELLES_HORAIRES = { heure_rdv: 'Accueil des équipes', heure_debut: 'Début des matchs',
  pause_dejeuner_debut: 'Pause déjeuner — début', pause_dejeuner_duree_min: 'Pause déjeuner — durée',
  marge_fin_communiquee_min: 'Clôture après le dernier match', battement_terrain_min: 'Battement entre deux matchs',
  heure_fin: 'Fin des matchs', heure_fin_communiquee: 'Fin de journée communiquée aux clubs',
  heure_fin_auto: 'Calcul automatique', pause_echelonnee: 'Pause méridienne échelonnée' };

/* Borne TECHNIQUE des durées (une journée), la même que le serveur (HORAIRES_DUREE_MAX_MIN). */
const DUREE_MAX_HORAIRES_MIN = 1440;

/* Délai NOMINAL de l'écriture. Sans lui, une réponse qui ne vient jamais laissait le bouton sur
   « Enregistrement… » pour toujours. À échéance : le bouton se libère et le message dit que l'enregistrement
   n'est pas confirmé. ⛔ Aucun renvoi automatique (api.js ne rejoue pas cette écriture). */
const DELAI_ECRITURE_HORAIRES_MS = 30000;

/* Valeurs ENREGISTRÉES que montre le formulaire : lues au dernier rendu depuis l'état enregistré, ou reprises du
   dernier enregistrement réussi. Un champ qui en diffère est une SAISIE EN COURS. null = carte pas encore rendue. */
let horairesEnregistres = null;
/* Vrai pendant l'envoi : une relecture qui aboutit à ce moment ne reconstruit pas le formulaire. */
let horairesEnvoiEnCours = false;

/** Valeurs du formulaire telles qu'elles partent au serveur (mêmes règles qu'avant ce lot). */
function lireFormulaireHoraires(form) {
  const data = {};
  CHAMPS_FORMULAIRE_HORAIRES.forEach(function (champ) {
    const c = form[champ];
    if (champ === 'heure_fin_auto' || champ === 'pause_echelonnee') data[champ] = (c && c.checked) ? 'oui' : 'non';
    else data[champ] = c ? c.value : '';
  });
  return data;
}

/** Champs dont la valeur à l'écran diffère de la valeur enregistrée : la saisie en cours. */
function champsHorairesEnCours(form) {
  if (!horairesEnregistres) return [];
  const actuel = lireFormulaireHoraires(form);
  return CHAMPS_FORMULAIRE_HORAIRES.filter(function (c) { return actuel[c] !== horairesEnregistres[c]; });
}

/** Pose une valeur ENREGISTRÉE dans un champ (le marqueur « accueil pré-rempli » n'a plus lieu d'être). */
function ecrireChampHoraire(champ, valeur) {
  if (champ.type === 'checkbox') champ.checked = (valeur === 'oui');
  else champ.value = valeur;
  if (champ.dataset) delete champ.dataset.autoRdv;
}

/** Ce qui dépend des cases, comme onReglagesChange le fait à la main : fin grisée en automatique, bloc
 *  « pause échelonnée » (libellés, durée masquée). */
function synchroniserDependancesHoraires(form) {
  if (form.heure_fin && form.heure_fin_auto) form.heure_fin.disabled = !!form.heure_fin_auto.checked;
  const bloc = form.querySelector && form.querySelector('.bloc-pause-dej');
  if (bloc && form.pause_echelonnee) bloc.setAttribute('data-ech', form.pause_echelonnee.checked ? 'oui' : 'non');
}

/**
 * Rend la carte « Horaires » depuis l'état ENREGISTRÉ `global`.
 * ⭐ Sans saisie en cours, sans envoi en vol et sans focus dans le formulaire : rendu complet, comme avant (les
 *   panneaux ouverts le restent).
 * ⭐ Sinon — une relecture lancée par une autre étape (catégorie ajoutée, planning généré, terrains appliqués…)
 *   aboutit pendant qu'on tape, ou alors qu'une saisie attend d'être enregistrée — le formulaire N'EST PAS
 *   reconstruit : focus, curseur et panneaux restent en place. Un champ non modifié prend la valeur relue ; une
 *   saisie en cours est gardée, sauf si le serveur a changé CE champ entre-temps (réinitialisation, arbitrage…) :
 *   la valeur enregistrée l'emporte alors — jamais pour le champ qui a le focus —, et le message le dit.
 */
function injecterHoraires(global) {
  const zone = document.getElementById('zone-horaires');
  if (!zone) return;
  const form = document.getElementById('form-horaires');
  const actif = document.activeElement;
  const enCours = form ? champsHorairesEnCours(form) : [];
  const focusDedans = !!(form && actif && form.contains && form.contains(actif));
  if (!form || !horairesEnregistres || (!enCours.length && !horairesEnvoiEnCours && !focusDedans)) {
    const ouverts = form ? Array.from(zone.querySelectorAll('details')).map(function (d) { return d.open; }) : [];
    zone.innerHTML = afficherHoraires(global);
    Array.from(zone.querySelectorAll('details')).forEach(function (d, i) { if (ouverts[i]) d.open = true; });
    const neuf = document.getElementById('form-horaires');
    horairesEnregistres = neuf ? lireFormulaireHoraires(neuf) : null;
    return;
  }
  const modele = document.createElement('div');
  modele.innerHTML = afficherHoraires(global);
  const releves = lireFormulaireHoraires(modele.querySelector('form'));
  const gardes = [], remplaces = [];
  CHAMPS_FORMULAIRE_HORAIRES.forEach(function (c) {
    const champ = form[c];
    if (!champ) return;
    const affiche = lireFormulaireHoraires(form)[c];
    if (enCours.indexOf(c) !== -1) {
      if (releves[c] === horairesEnregistres[c] || champ === actif) {
        if (affiche !== releves[c]) gardes.push(c);
        return;
      }
      if (affiche !== releves[c]) remplaces.push(c);
    }
    if (affiche !== releves[c]) ecrireChampHoraire(champ, releves[c]);
  });
  synchroniserDependancesHoraires(form);
  const finPause = zone.querySelector('#val-pause-fin');
  if (finPause) finPause.textContent = (global && global.pause_echelonnee_fin) ? String(global.pause_echelonnee_fin) : '—';
  const frise = zone.querySelector('#cv-frise-horaires');
  if (frise) frise.innerHTML = friseHorairesCiel(global, typeof matchsCourants === 'undefined' ? [] : matchsCourants);
  horairesEnregistres = releves;
  if (!gardes.length && typeof assistantRephotographier === 'function') assistantRephotographier(form);
  const message = document.getElementById('message-horaires');
  if (horairesEnvoiEnCours || !message || (!gardes.length && !remplaces.length)) return;
  const noms = function (liste) { return liste.map(function (c) { return LIBELLES_HORAIRES[c]; }).join(', '); };
  afficherMessage(message, (gardes.length ? '✏️ Saisie non enregistrée conservée : ' + noms(gardes) + '. ' : '') +
    (remplaces.length ? '↻ Valeur enregistrée entre-temps reprise pour : ' + noms(remplaces) + '.' : ''), 'ko');
}

/** Premier défaut de saisie, ou null : { champ, message }. Les règles du serveur (validerHoraires_), plus ce que
 *  seul le navigateur voit : une heure incomplète ou un nombre illisible (le champ vaut alors ''). */
function controlerSaisieHoraires(form, data) {
  for (let i = 0; i < CHAMPS_FORMULAIRE_HORAIRES.length; i++) {
    const c = form[CHAMPS_FORMULAIRE_HORAIRES[i]];
    if (c && !c.disabled && c.validity && c.validity.badInput) {
      return { champ: CHAMPS_FORMULAIRE_HORAIRES[i],
        message: '« ' + LIBELLES_HORAIRES[CHAMPS_FORMULAIRE_HORAIRES[i]] + ' » est incomplet ou illisible : corrige-le ou vide-le.' };
    }
  }
  if (!data.heure_debut) return { champ: 'heure_debut', message: "Renseigne l'heure de début." };
  if (data.heure_fin_auto === 'non' && !data.heure_fin) {
    return { champ: 'heure_fin', message: "Renseigne l'heure de fin (ou coche « auto »)." };
  }
  const durees = ['pause_dejeuner_duree_min', 'marge_fin_communiquee_min', 'battement_terrain_min'];
  for (let j = 0; j < durees.length; j++) {
    const v = String(data[durees[j]]).trim();
    if (v && (!/^\d{1,4}$/.test(v) || Number(v) > DUREE_MAX_HORAIRES_MIN)) {
      return { champ: durees[j], message: '« ' + LIBELLES_HORAIRES[durees[j]] + ' » : un nombre entier de minutes entre 0 et ' +
        DUREE_MAX_HORAIRES_MIN + ' est attendu.' };
    }
  }
  return null;
}

/** Montre le défaut : message, panneau ouvert s'il cachait le champ, focus sur le champ. */
function signalerDefautHoraires(form, defaut, message) {
  afficherMessage(message, defaut.message, 'ko');
  const c = form[defaut.champ];
  if (!c) return;
  const panneau = c.closest && c.closest('details');
  if (panneau && !panneau.open) panneau.open = true;
  if (c.focus && !c.disabled) c.focus();
}

/**
 * Échec de l'écriture. Un refus du SERVEUR (réponse lue) reste tel quel : rien n'a été écrit.
 * ⛔ Une réponse PERDUE (délai, connexion coupée, 404 de Google au second saut, page illisible) peut cacher une
 *   écriture réussie : jamais de renvoi automatique ; le message le dit, la saisie reste à l'écran, et la feuille
 *   d'autorisation est tenue pour périmée (prudence gratuite : elle ne sera relue qu'à la prochaine visite).
 */
function erreurEnregistrementHoraires(erreur, data) {
  const perdue = erreur && !erreur.reponse && (erreur.name === 'AbortError' || erreur.name === 'TypeError' ||
    erreur.name === 'SyntaxError' || /erreur \(\d{3}\)/.test(String(erreur.message || '')));
  if (!perdue) return erreur;
  try {
    if (typeof ecritureImpacteAutorisation === 'function' && typeof signalerAutorisationObsolete === 'function' &&
        ecritureImpacteAutorisation('enregistrerHoraires', data, null)) signalerAutorisationObsolete();
  } catch (e) { /* la feuille garde son état ; le message ci-dessous reste juste */ }
  const cause = erreur.name === 'AbortError' ? 'aucune réponse du serveur dans le délai'
    : erreur.name === 'TypeError' ? 'connexion interrompue' : String(erreur.message || 'réponse illisible').replace(/\.$/, '');
  return new Error('Enregistrement non confirmé (' + cause + '). Tes horaires restent à l’écran : ' +
    'un nouveau clic les enregistre, sans risque de doublon.');
}

/**
 * Succès : l'écran se met à jour DEPUIS LA RÉPONSE — valeurs relues par le serveur (contrat `ecriture-v1`) ou, avec
 * un backend d'avant le contrat ou une réponse incomplète, les valeurs envoyées (comportement d'avant). Jamais de
 * relecture. Puis ce qui en dépend, en local : frise, fil « Où en suis-je ? », pastilles, bouton « Recalculer les
 * horaires » (il ne suivait qu'au rechargement), état du dossier club.
 * ⛔ Une modification faite PENDANT l'envoi n'est pas enregistrée : elle reste une saisie en cours et le message le dit.
 */
function appliquerHorairesEnregistres(form, envoye, res, message) {
  const recu = (res && res.contrat === 'ecriture-v1' && Array.isArray(res.modifies) && res.enregistre &&
    typeof res.enregistre === 'object') ? res.enregistre : null;
  const complet = !!recu && Object.keys(envoye).every(function (c) { return Object.prototype.hasOwnProperty.call(recu, c); });
  const enregistre = {};
  Object.keys(envoye).forEach(function (c) { enregistre[c] = complet ? String(recu[c] == null ? '' : recu[c]) : envoye[c]; });
  // « Déjà à jour » exige DEUX preuves : le serveur n'a rien écrit ET le formulaire était déjà l'état enregistré connu.
  // Après une réponse perdue (ou un renvoi fait par le navigateur lui-même), le serveur ne réécrit rien, mais la
  // modification de l'organisateur est bel et bien enregistrée : c'est « Horaires enregistrés » qu'il doit lire.
  const connu = horairesEnregistres;
  const dejaAJour = complet && res.modifies.length === 0 && !!connu &&
    Object.keys(envoye).every(function (c) { return connu[c] === envoye[c]; });
  configCourante.global = Object.assign({}, configCourante.global, enregistre);
  horairesEnregistres = Object.assign({}, enregistre);
  const actuel = lireFormulaireHoraires(form);
  const pendant = CHAMPS_FORMULAIRE_HORAIRES.filter(function (c) { return actuel[c] !== envoye[c]; });
  CHAMPS_FORMULAIRE_HORAIRES.forEach(function (c) {
    if (pendant.indexOf(c) === -1 && actuel[c] !== enregistre[c] && form[c]) ecrireChampHoraire(form[c], enregistre[c]);
  });
  synchroniserDependancesHoraires(form);
  // Valeurs désormais ENREGISTRÉES → l'assistant reprend sa photo de référence (sauf saisie faite pendant l'envoi).
  if (!pendant.length && typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
  majTableauBord();    // frise, fil « Où en suis-je ? », pastilles et bouton « Recalculer les horaires »
  majDossier();        // la section Programme du dossier club suit
  let texte = dejaAJour ? '✅ Déjà à jour : rien n’a changé depuis le dernier enregistrement.' : '✅ Horaires enregistrés.';
  if (pendant.length) {
    texte += ' ✏️ Modifié pendant l’envoi, pas encore enregistré : ' +
      pendant.map(function (c) { return LIBELLES_HORAIRES[c]; }).join(', ') + '.';
  }
  ((res && res.avertissements) || []).forEach(function (a) { if (a && a.message) texte += ' ⚠️ ' + a.message; });
  afficherMessage(message, texte, 'ok');
}

/**
 * Enregistre les horaires quand on soumet le formulaire (bouton, ou Entrée dans un champ).
 */
async function onEnregistrerHoraires(evenement) {
  evenement.preventDefault();
  const form = evenement.target;
  const message = document.getElementById('message-horaires');
  // ⛔ Une écriture à la fois : Entrée dans un champ pendant l'envoi ne relance rien.
  if (horairesEnvoiEnCours) return;

  const data = lireFormulaireHoraires(form);
  const defaut = controlerSaisieHoraires(form, data);
  if (defaut) { signalerDefautHoraires(form, defaut, message); return; }

  const bouton = document.querySelector('[form="form-horaires"]') || form.querySelector('button');
  horairesEnvoiEnCours = true;
  try {
    await avecBoutonOccupe(bouton, message, async function () {
      let res;
      try { res = await ecrireAdmin('enregistrerHoraires', data, { delaiMs: DELAI_ECRITURE_HORAIRES_MS }); }
      catch (erreur) { throw erreurEnregistrementHoraires(erreur, data); }
      appliquerHorairesEnregistres(form, data, res, message);
    });
  } finally {
    horairesEnvoiEnCours = false;
  }
}

/* Onglet de catégorie affiché. Mémorisé ENTRE deux rendus : la zone est réécrite en entier à
   chaque relecture de la configuration, et retomber sur la première catégorie ferait perdre sa
   place à l'organisateur au milieu d'un réglage. '' désigne l'onglet « Ajouter une catégorie ». */
let ongletCategorieActif = null;

/**
 * Onglet à afficher pour ce rendu. Il garde celui d'avant tant qu'il existe encore.
 *
 * ⚠️ Un rendu TRANSITOIRE sans catégorie (relecture en cours, validation des catégories non
 * confirmée) ne doit RIEN oublier : on renvoie l'onglet de création pour ce rendu-là sans
 * toucher à la mémoire, sinon le rendu suivant retomberait sur la première catégorie et
 * l'organisateur perdrait sa place au milieu d'un réglage.
 */
function choisirOngletCategorie(noms) {
  if (ongletCategorieActif === '') return '';   // onglet de création : un choix explicite
  if (!noms.length) return '';                  // rendu transitoire : on n'oublie pas pour autant
  if (noms.indexOf(ongletCategorieActif) === -1) ongletCategorieActif = noms[0];
  return ongletCategorieActif;
}

/** Un onglet de la barre. `nom` vide = l'onglet de création. */
function ongletCategorie(nom, idPanneau, actif, libelle, classe) {
  return '<button type="button" role="tab" class="cv-cat-onglet' + (classe ? ' ' + classe : '') +
    (actif ? ' est-actif' : '') + '" data-cat-onglet="' + echapper(nom) + '"' +
    ' aria-selected="' + (actif ? 'true' : 'false') + '" tabindex="' + (actif ? '0' : '-1') + '"' +
    ' aria-controls="' + idPanneau + '">' + libelle + '</button>';
}

/**
 * Affiche les catégories en ONGLETS : un onglet par catégorie, plus un onglet de création.
 * L'onglet ouvert montre les paramètres de SA catégorie à gauche et sa référence FFR à droite.
 * Les formulaires sont ceux d'avant (mêmes noms de champs, mêmes écouteurs délégués) : seule
 * leur présentation change.
 */
function afficherCategories(categories) {
  const cats = categories || [];
  const noms = cats.map(function (c) { return String(c.categorie); });
  const ouvert = choisirOngletCategorie(noms);

  let onglets = '';
  noms.forEach(function (nom, i) {
    onglets += ongletCategorie(nom, 'cv-cat-panneau-' + i, nom === ouvert, echapper(nom));
  });
  onglets += ongletCategorie('', 'cv-cat-panneau-ajout', ouvert === '',
    '<span aria-hidden="true">+</span> Ajouter une catégorie', 'cv-cat-onglet-ajout');

  let panneaux = '';
  cats.forEach(function (cat, i) {
    const nom = String(cat.categorie);
    panneaux += '<div class="cv-cat-panneau" id="cv-cat-panneau-' + i + '" role="tabpanel"' +
      ' data-cat-panneau="' + echapper(nom) + '"' + (nom === ouvert ? '' : ' hidden') + '>' +
        formulaireCategorie(cat) + carteReferenceFFR(cat) +
      '</div>';
  });
  panneaux += '<div class="cv-cat-panneau" id="cv-cat-panneau-ajout" role="tabpanel"' +
    ' data-cat-panneau=""' + (ouvert === '' ? '' : ' hidden') + '>' + formulaireAjoutCategorie() + '</div>';

  return '<div class="cv-cat-onglets" role="tablist" aria-label="Catégories du tournoi">' + onglets + '</div>' +
    panneaux + apercuCategories(cats);
}

/** Formulaire de création, dans son propre onglet (identifiants et champs inchangés). */
function formulaireAjoutCategorie() {
  return (
    '<form id="form-ajout-categorie" class="carte cv-cat-carte">' +
      '<h3 class="cv-cat-titre">Ajouter une catégorie</h3>' +
      '<p class="note-generation">Les réglages sportifs naissent VIERGES : rien n’est deviné. ' +
      'La référence FFR de la nouvelle catégorie s’affiche ensuite à côté de ses paramètres.</p>' +
      '<div class="form-equipe">' +
        '<input type="text" name="categorie" placeholder="Nom (ex : U16)" autocomplete="off" required>' +
        '<button type="submit" class="bouton">Ajouter</button>' +
      '</div>' +
      '<div class="message-form" data-role="msg-ajout-cat"></div>' +
    '</form>'
  );
}

/** Vue d'ensemble des réglages enregistrés — repliée : les onglets montrent une catégorie à la fois. */
function apercuCategories(cats) {
  if (!cats.length) return '';
  return '<details class="cv-options cv-cat-apercu">' + contenuApercuCategories(cats) + '</details>';
}

/** Intérieur de la vue d'ensemble : rafraîchi seul après un enregistrement (voir rafraichirApercuCategories). */
function contenuApercuCategories(cats) {
  return '<summary>Vue d’ensemble<span>Comparer les réglages enregistrés de toutes les catégories</span></summary>' +
    '<div class="table-scroll"><table class="cv-categories-comparaison">' +
    '<thead><tr><th>Catégorie</th><th>Effectif</th><th>Durée d’une période</th><th>Récupération</th><th>Terrains</th></tr></thead><tbody>' +
    cats.map(function (cat) {
      return '<tr><th>' + echapper(cat.categorie) + '</th><td>' + echapper(String(cat.effectif_min || '—')) +
        ' à ' + echapper(String(cat.effectif_max || '—')) + '</td><td>' +
        echapper(String(cat.duree_mi_temps_min || '—')) + ' min</td><td>' +
        echapper(String(cat.recup_entre_matchs_min || '—')) + ' min</td><td>' +
        echapper(String(cat.terrains || 'Automatique')) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

/** Ouvre un onglet de catégorie ('' = onglet de création) sans rien re-rendre. */
function activerOngletCategorie(nom) {
  ongletCategorieActif = nom;   // la mémoire d'abord : c'est elle qui survit au prochain rendu
  const zone = document.getElementById('zone-categories');
  if (!zone) return;
  zone.querySelectorAll('.cv-cat-onglet').forEach(function (b) {
    const actif = b.getAttribute('data-cat-onglet') === nom;
    b.classList.toggle('est-actif', actif);
    b.setAttribute('aria-selected', actif ? 'true' : 'false');
    b.tabIndex = actif ? 0 : -1;
  });
  zone.querySelectorAll('.cv-cat-panneau').forEach(function (p) {
    p.hidden = p.getAttribute('data-cat-panneau') !== nom;
  });
}

/** Flèches / Début / Fin dans la barre d'onglets : navigation attendue d'un groupe d'onglets. */
function onClavierOngletsCategories(evenement) {
  const onglet = evenement.target.closest && evenement.target.closest('.cv-cat-onglet');
  if (!onglet) return;
  const pas = { ArrowRight: 1, ArrowLeft: -1, Home: 'debut', End: 'fin' }[evenement.key];
  if (pas === undefined) return;
  const onglets = Array.from(onglet.parentNode.querySelectorAll('.cv-cat-onglet'));
  const i = onglets.indexOf(onglet);
  const cible = pas === 'debut' ? onglets[0]
              : pas === 'fin'   ? onglets[onglets.length - 1]
              : onglets[(i + pas + onglets.length) % onglets.length];
  evenement.preventDefault();
  activerOngletCategorie(cible.getAttribute('data-cat-onglet'));
  cible.focus();
}

/**
 * Construit le formulaire modifiable d'une catégorie, rangé en sections.
 */
function formulaireCategorie(cat) {
  const nom = cat.categorie || '?';

  // Les champs, rangés par section (CHAMPS_CATEGORIE.groupe). Une section sans champ disparaît.
  let sections = '';
  SECTIONS_CATEGORIE.forEach(function (section) {
    const champs = CHAMPS_CATEGORIE.filter(function (c) { return c.groupe === section.cle; })
      .map(function (champ) {
        return champCategorie(champ, (cat[champ.cle] != null) ? String(cat[champ.cle]) : '');
      }).join('');
    if (!champs) return;
    let apres = '';
    // L'alerte « hors cadre FFR » suit les champs de temps qu'elle commente.
    if (section.cle === 'temps') apres = '<div class="ffr-alerte-temps" data-cat="' + echapper(nom) + '" hidden></div>';
    // Les terrains sont un réglage d'organisation, avec leur propre bloc Auto / Manuel.
    if (section.cle === 'organisation') apres = blocTerrains(cat);
    sections += '<section class="cv-cat-section"><h4>' + echapper(section.titre) + '</h4>' +
      '<div class="grille-reglages">' + champs + '</div>' + apres + '</section>';
  });

  return (
    // data-contexte pilote l'affichage U14 (Lambda ↔ Super Challenge) : voir blocContexteU14 et le
    // gestionnaire onReglagesChange. Pour les catégories non-U14, il vaut toujours 'LAMBDA' (sans effet).
    // `novalidate` : les contrôles sont ceux de controlerSaisieCategorie, qui les MONTRENT. Le contrôle natif bloquait
    // l'envoi sans un mot quand le champ fautif était masqué (« Qualifiés en Coupe » d'un format abandonné).
    '<form class="carte cv-cat-carte categorie form-categorie" data-cat="' + echapper(nom) + '"' +
        ' data-contexte="' + contexteTournoiDe(cat) + '" novalidate>' +
      '<h3 class="cv-cat-titre">Paramètres de la catégorie ' + echapper(nom) + '</h3>' +
      // Forme de jeu RETENUE par l'organisateur : select rempli dynamiquement (majFormesCategories)
      // avec les formes du mois. data-value = valeur stockée (Config.forme_jeu), pour la présélection
      // et le signalement orange « hors du mois ». Masqué tant qu'aucune forme n'est disponible.
      // ⚠️ Il doit rester DANS le formulaire : onEnregistrerCategorie lit form.forme_jeu.
      '<div class="ffr-forme-choix" data-cat="' + echapper(nom) + '" data-value="' +
        echapper(String(cat.forme_jeu == null ? '' : cat.forme_jeu)) + '" hidden></div>' +
      sections +
      '<section class="cv-cat-section"><h4>Format après-midi</h4>' +
        // Contexte U14 (Super Challenge de France) : rendu SEULEMENT pour l'U14 ; chaîne vide sinon.
        // En SCF, le CSS (form[data-contexte="SCF"]) masque le bloc format d'après-midi ci-dessous.
        blocContexteU14(cat) +
        blocFormatApresMidi(cat) +
      '</section>' +
      '<div class="ligne-action">' +
        '<button type="submit" class="bouton">Enregistrer</button>' +
        '<button type="button" class="bouton-suppr bouton-suppr-cat" data-cat="' + echapper(nom) + '">Supprimer</button>' +
        // data-role, pas seulement la classe : afficherMessage réécrit className, et le repère
        // « message-cat » disparaîtrait dès le premier message affiché.
        '<span class="message-form message-cat" data-role="msg-cat"></span>' +
      '</div>' +
    '</form>'
  );
}

/**
 * Carte « Référence FFR » posée à côté des paramètres de la catégorie.
 *
 * Elle n'affiche RIEN d'inventé : son tableau, la forme attendue et le bouton « Appliquer la
 * norme FFR » sont remplis par admin-conformite-ffr.js à partir du référentiel réellement chargé
 * (majReferencesFFRCategories / majFormesCategories / majBoutonNormeCategories). Tant que le
 * référentiel est absent, la carte le dit au lieu de proposer des valeurs.
 */
function carteReferenceFFR(cat) {
  const nom = echapper(String(cat.categorie || ''));
  const icone = (typeof svgIcone === 'function') ? svgIcone('info') : '';
  return (
    '<aside class="carte cv-cat-carte cv-cat-reference" data-cat="' + nom + '">' +
      '<h3 class="cv-cat-titre">Référence FFR <span class="cv-cat-titre-note">(à titre indicatif)</span></h3>' +
      '<p class="cv-cat-reference-sous" data-cat="' + nom + '">' + nom + '</p>' +
      '<div class="cv-cat-reference-table" data-cat="' + nom + '"></div>' +
      // Forme FFR attendue du mois + badges (tournoi non autorisé / format limité) et alerte d'effectif.
      '<div class="ffr-forme" data-cat="' + nom + '" hidden></div>' +
      // Bouton « Appliquer la norme FFR » : rempli par admin-conformite-ffr.js (majBoutonNormeCategories)
      // quand le référentiel expose des valeurs. Il remplit le formulaire voisin, il n'enregistre rien.
      '<div class="ffr-appliquer-carte" data-cat="' + nom + '" hidden></div>' +
      '<div class="cv-information cv-attention cv-cat-avertissement">' +
        '<span class="ffr-statut-pastille" aria-hidden="true">' + icone + '</span>' +
        '<span class="cv-information-texte"><strong>Vérifiez avant d’enregistrer</strong>' +
        'Ces valeurs sont données à titre indicatif d’après les prescriptions FFR. ' +
        'Adaptez-les selon l’organisation de votre tournoi.</span>' +
      '</div>' +
    '</aside>'
  );
}

/**
 * Bloc « Terrains » d'une catégorie : choix Auto / Manuel.
 *  - Auto (défaut) : les terrains sont attribués par l'onglet « Terrains & répartition ».
 *    Le champ de saisie est masqué ; on affiche juste les terrains actuels à titre indicatif.
 *  - Manuel : l'organisateur saisit lui-même les numéros, et une vérification en direct
 *    (doublons entre catégories, terrain inexistant, catégorie sans terrain) le conseille.
 * L'affichage conditionnel est piloté par l'attribut data-terrains (voir onReglagesChange),
 * comme pour le format d'après-midi : pas de :has(), compatible tous téléphones.
 */
function blocTerrains(cat) {
  const auto = terrainsAutoDe(cat);
  const val = (cat && cat.terrains != null) ? String(cat.terrains) : '';
  const infoActuel = val.trim()
    ? '. Actuellement : <strong>' + echapper(val) + '</strong>'
    : ' (pas encore répartis).';
  return (
    '<div class="bloc-terrains" data-terrains="' + (auto ? 'auto' : 'manuel') + '">' +
      '<span class="format-libelle">Terrains</span>' +
      '<div class="terr-mode">' +
        '<label class="terr-choix"><input type="radio" name="terrains_auto" value="oui"' + (auto ? ' checked' : '') + '> Auto</label>' +
        '<label class="terr-choix"><input type="radio" name="terrains_auto" value="non"' + (!auto ? ' checked' : '') + '> Manuel</label>' +
      '</div>' +
      // Champ manuel (toujours présent dans le DOM pour conserver la valeur ; masqué en mode Auto).
      '<label class="terr-manuel reglage">' +
        '<input class="r-input" type="text" name="terrains" value="' + echapper(val) + '" placeholder="ex : 1, 2">' +
        '<span class="f-aide">Numéros des terrains dédiés à cette catégorie, séparés par des virgules.</span>' +
      '</label>' +
      // Info mode Auto.
      '<p class="terr-auto-info">✅ Attribués automatiquement via l\'onglet « Terrains &amp; répartition »' + infoActuel + '</p>' +
      // Zone de conseils (mode Manuel), remplie par verifierTerrainsBloc().
      '<div class="terr-conseils" data-role="terr-conseils"></div>' +
    '</div>'
  );
}

/** Ensemble des numéros de mini-terrains QUI EXISTENT (pour la vérification d'existence).
 *  Source : la répartition calculée dans cette session si dispo, sinon les terrains déjà
 *  attribués aux catégories (dernière répartition appliquée). Vide = on ne peut pas vérifier. */
function ensembleTerrainsExistants() {
  const set = new Set();
  if (repartitionCalculee && repartitionCalculee.parCategorie) {
    Object.keys(repartitionCalculee.parCategorie).forEach(function (k) {
      (repartitionCalculee.parCategorie[k] || []).forEach(function (id) {
        const n = Number(id); if (!isNaN(n)) set.add(n);
      });
    });
  }
  (configCourante.categories || []).forEach(function (c) {
    String(c.terrains || '').split(',').map(function (s) { return s.trim(); })
      .forEach(function (t) { if (/^\d+$/.test(t)) set.add(Number(t)); });
  });
  return set;
}

/** Numéros de terrains utilisés par les AUTRES catégories → { numéro: [noms de catégories] }. */
function terrainsParAutreCategorie(nom) {
  const map = {};
  (configCourante.categories || []).forEach(function (c) {
    if (String(c.categorie) === String(nom) || !estPresente(c)) return;
    String(c.terrains || '').split(',').map(function (s) { return s.trim(); })
      .forEach(function (t) {
        if (!/^\d+$/.test(t)) return;
        const n = Number(t);
        (map[n] = map[n] || []).push(String(c.categorie));
      });
  });
  return map;
}

/**
 * Analyse une saisie manuelle de terrains et renvoie la liste des conseils.
 * @return {Array<{niveau:'ko'|'warn', texte:string}>}
 */
function analyserTerrainsManuels(nom, brut) {
  const conseils = [];
  const tokens = String(brut || '').split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; });

  // 1) Jetons non numériques.
  tokens.filter(function (t) { return !/^\d+$/.test(t); }).forEach(function (t) {
    conseils.push({ niveau: 'ko', texte: '« ' + t + ' » n\'est pas un numéro de terrain.' });
  });

  const nums = tokens.filter(function (t) { return /^\d+$/.test(t); }).map(Number);

  // 2) Aucun terrain alors qu'il y a des équipes.
  if (nums.length === 0) {
    const nbEq = (equipesParCategorie()[nom] || 0);
    if (nbEq > 0) conseils.push({ niveau: 'ko', texte: 'Cette catégorie a ' + nbEq + ' équipe(s) mais aucun terrain.' });
    return conseils;
  }

  // 3) Doublons dans la saisie elle-même.
  const vus = {};
  nums.forEach(function (n) {
    if (vus[n]) conseils.push({ niveau: 'warn', texte: 'Le terrain ' + n + ' est indiqué deux fois.' });
    vus[n] = true;
  });
  const uniques = Object.keys(vus).map(Number);

  // 4) Terrain aussi utilisé par une autre catégorie.
  const parAutre = terrainsParAutreCategorie(nom);
  uniques.forEach(function (n) {
    if (parAutre[n] && parAutre[n].length) {
      conseils.push({ niveau: 'warn', texte: 'Le terrain ' + n + ' est aussi utilisé par ' + parAutre[n].join(', ') + '.' });
    }
  });

  // 5) Terrain inexistant dans la répartition (si on connaît la liste des terrains existants).
  const existants = ensembleTerrainsExistants();
  if (existants.size) {
    const max = Math.max.apply(null, Array.from(existants));
    uniques.forEach(function (n) {
      if (!existants.has(n)) {
        conseils.push({ niveau: 'ko', texte: 'Le terrain ' + n + ' n\'existe pas dans ta répartition (les terrains vont de 1 à ' + max + ').' });
      }
    });
  }

  return conseils;
}

/** (Re)calcule et affiche les conseils d'un bloc Terrains (uniquement en mode Manuel). */
function verifierTerrainsBloc(bloc) {
  if (!bloc) return;
  const zone = bloc.querySelector('[data-role="terr-conseils"]');
  if (!zone) return;
  if (bloc.getAttribute('data-terrains') !== 'manuel') { zone.innerHTML = ''; return; }

  const form = bloc.closest('form.form-categorie');
  const nom = form ? form.getAttribute('data-cat') : '';
  const input = bloc.querySelector('input[name="terrains"]');
  const brut = input ? input.value : '';

  const conseils = analyserTerrainsManuels(nom, brut);
  if (!conseils.length) {
    zone.innerHTML = brut.trim()
      ? '<p class="terr-conseil ok">✅ Terrains valides.</p>'
      : '';
    return;
  }
  zone.innerHTML = conseils.map(function (c) {
    return '<p class="terr-conseil ' + c.niveau + '">⚠️ ' + echapper(c.texte) + '</p>';
  }).join('');
}

/**
 * Bloc « Format de l'après-midi » d'une catégorie : cartes cliquables (radio) avec explication
 * visible, champ « qualifiés en Coupe » (affiché seulement pour COUPE_PLATEAU) et récapitulatif.
 * L'affichage conditionnel est piloté par l'attribut data-format du bloc (voir onReglagesChange) :
 * pas besoin de :has(), ça marche sur tous les téléphones.
 *
 * Les CINQ formats sont proposés. Celui qui porte `horsCadreEdr` (COUPE_PLATEAU) est simplement
 * SIGNALÉ — carte marquée, encart de rappel tant qu'il est retenu, et confirmation à la sélection
 * (onReglagesChange). Il n'est ni masqué, ni désactivé : le règlement applicable à l'événement
 * appartient à l'organisateur, pas au logiciel.
 */
function blocFormatApresMidi(cat) {
  const fmt = formatApresMidiDe(cat);
  const nbQ = nbQualifiesCoupeDe(cat);
  // Format retenu HORS CADRE École de Rugby (aujourd'hui : COUPE_PLATEAU) : il est bel et bien
  // PROPOSABLE, mais on rappelle la règle tant qu'il est retenu — l'organisateur voit donc
  // l'information à chaque ouverture de la fiche, et pas seulement au moment de son choix.
  // L'encart INFORME : il ne réclame pas de changer de format, et rien n'est réécrit ici.
  const dejaHorsCadre = formatHorsCadreEdr(fmt);
  const encartInterdit = dejaHorsCadre
    ? '<p class="format-interdit-edr">⚠️ <b>Format hors cadre École de Rugby</b> — ce format ' +
      'comporte des phases finales (quart, demi, finale), qui ne sont pas conformes au cadre des ' +
      'rencontres École de Rugby. Vérifie qu\'elles correspondent au règlement applicable à ton ' +
      'événement.</p>'
    : '';

  // Session 10 : format_apresmidi VIDE. La génération applique CROISE par défaut (historique) — on le
  // DIT au lieu de le taire. Enregistrer la catégorie rend la valeur explicite (onEnregistrerCategorie
  // écrit CROISE). Le comportement de génération n'est PAS modifié.
  const formatVide = String((cat && cat.format_apresmidi) || '').trim() === '';
  const encartDefaut = formatVide
    ? '<p class="format-defaut-histo ffr-orange">⚠️ <b>CROISE (défaut historique — à confirmer)</b> — ' +
      'aucun format d\'après-midi n\'a été choisi pour cette catégorie ; CROISE serait appliqué à la ' +
      'génération. Sélectionne un format ci-dessous puis enregistre pour rendre ce choix explicite.</p>'
    : '';

  // Menu déroulant : le nom des formats suffit à choisir, l'explication complète du format RETENU
  // est révélée juste en dessous (voir .format-desc et data-format). Le format signalé
  // `horsCadreEdr` reste proposé — c'est la confirmation (onReglagesChange) qui sécurise le choix.
  const options = FORMATS_APRESMIDI.map(function (f) {
    return '<option value="' + f.cle + '"' + (f.cle === fmt ? ' selected' : '') + '>' +
      echapper(f.titre) + '</option>';
  }).join('');
  const explications = FORMATS_APRESMIDI.map(function (f) {
    return '<span class="format-desc d-' + f.cle + '">' + echapper(f.desc) + '</span>';
  }).join('');

  return (
    '<div class="bloc-format" data-format="' + fmt + '">' +
      encartInterdit +
      encartDefaut +
      '<label class="reglage format-choix">' +
        '<span class="r-libelle">Format retenu</span>' +
        '<select class="r-input" name="format_apresmidi">' + options + '</select>' +
        '<span class="f-aide">Définit le format de la phase finale de l\'après-midi.</span>' +
      '</label>' +
      '<div class="format-desc-zone">' + explications + '</div>' +
      '<label class="format-coupe-param reglage">' +
        '<span class="r-libelle">Qualifiés en Coupe (par poule)</span>' +
        '<input class="r-input" type="number" min="1" name="nbQualifiesCoupe" value="' + echapper(String(nbQ)) + '">' +
        '<span class="f-aide">Les premiers de chaque poule partent en Coupe ; les autres vont automatiquement en Plateau.</span>' +
      '</label>' +
    '</div>'
  );
}

/**
 * Bloc « Contexte du tournoi (U14) » — introduit en session 13, BRANCHÉ depuis la session 14. Rendu
 * UNIQUEMENT pour la catégorie U14 (au sens FFR M14) ; chaîne vide pour toutes les autres, qui
 * restent strictement inchangées.
 *
 * Deux cartes-radio : « Tournoi ordinaire » (LAMBDA, défaut historique) ou « Super Challenge de
 * France » (SCF). En SCF, un panneau révèle la forme (Jeu à XV 15×15, figée) et le choix de la
 * phase (2 ou 3) avec un récapitulatif des temps ; le CSS masque alors les cartes « format
 * d'après-midi » (sans objet dans ce contexte). L'affichage conditionnel est piloté par
 * data-contexte (sur le formulaire) et data-phase (sur le panneau) — voir onReglagesChange —,
 * sans :has(), pour rester compatible tous téléphones.
 *
 * IMPORTANT (honnêteté) : ce que ce bloc enregistre est RÉELLEMENT CONSOMMÉ par la génération. Le
 * serveur regroupe en triangulaires/quadrangulaires et IMPOSE la durée de match — 2×15 en P2, 2×11
 * en P3 (dureeMatchScf) — donc le récapitulatif des temps décrit ce qui sera JOUÉ, pas une simple
 * intention. Prudent par construction : vide/Lambda ⇒ comportement d'aujourd'hui.
 */
function blocContexteU14(cat) {
  const nom = (cat && cat.categorie != null) ? cat.categorie : '';
  if (!categorieSuperChallenge(nom)) return ''; // le contexte SCF ne concerne que l'U14 (M14)
  const ctx = contexteTournoiDe(cat);   // 'LAMBDA' | 'SCF'
  const phase = scfPhaseDe(cat);        // 'P2' | 'P3'

  // Une carte-radio de contexte (mise en avant si choisie, comme les cartes de format d'après-midi).
  function carte(val, titre, desc) {
    return '<label class="ctx-carte c-' + val + (ctx === val ? ' est-choisi' : '') + '">' +
             '<input type="radio" name="contexte_tournoi" value="' + val + '"' + (ctx === val ? ' checked' : '') + '>' +
             '<span class="f-corps">' +
               '<span class="f-titre">' + echapper(titre) + '</span>' +
               '<span class="f-desc">' + echapper(desc) + '</span>' +
             '</span>' +
           '</label>';
  }

  // Un choix de phase (radio simple).
  function phaseRadio(val, lib) {
    return '<label class="scf-phase-choix">' +
             '<input type="radio" name="scf_phase" value="' + val + '"' + (phase === val ? ' checked' : '') + '> ' +
             echapper(lib) +
           '</label>';
  }

  const cartes =
    carte('LAMBDA', 'Tournoi ordinaire',
          'Tournoi club habituel : matin en poules, après-midi selon le format choisi ci-dessous (croisé, diagonal ou libre).') +
    carte('SCF', 'Super Challenge de France',
          'Plateau officiel U14 en Jeu à XV (15×15). Les formats d\'après-midi ci-dessous ne s\'appliquent pas : la structure suit le règlement du Super Challenge.');

  // Panneau SCF, révélé par le CSS quand le formulaire porte data-contexte="SCF".
  const panneau =
    '<div class="bloc-scf" data-phase="' + phase + '">' +
      '<p class="scf-forme">Forme de jeu : <b>Jeu à XV (15×15)</b> — effectif 23 joueurs, minimum 19 · ' +
        'barème Victoire 3 / Nul 2 / Défaite 1.</p>' +
      '<div class="scf-phases">' +
        '<span class="format-libelle">Phase du Super Challenge</span>' +
        phaseRadio('P2', 'Phase 2 (janv.–févr.)') +
        phaseRadio('P3', 'Phase 3 & clôture (avr.–juin)') +
      '</div>' +
      '<span class="scf-recap r-P2">Phase 2 — <b>1 journée</b> · triangulaire ou quadrangulaire · ' +
        '2 rencontres · temps de jeu <b>2 × 15 min</b>.</span>' +
      '<span class="scf-recap r-P3">Phase 3 &amp; clôture — <b>2 journées</b> · triangulaire · ' +
        'samedi 2 matchs / dimanche 3 · temps de jeu <b>2 × 11 min</b>.</span>' +
      // Note phase-dépendante (honnête sur ce qui est réellement généré aujourd'hui).
      '<p class="scf-note n-P2">✅ La <b>Phase 2</b> est générée automatiquement : « Générer les poules » ' +
        'produit les triangulaires/quadrangulaires en <b>2 × 15 min</b> (pas d\'après-midi séparé).</p>' +
      '<p class="scf-note n-P3">ℹ️ <b>Phase 3 sur 2 journées.</b> « Générer les poules » crée le ' +
        '<b>samedi</b> (triangulaires, 2×11). Une fois les scores du samedi saisis, le bouton ' +
        '<b>« Générer le dimanche (brassage) »</b> (page Poules &amp; planning) crée la 2ᵉ journée ' +
        'par niveau — les 1ᵉʳˢ ensemble, les 2ᵉˢ ensemble, les 3ᵉˢ ensemble.</p>' +
    '</div>';

  return (
    '<div class="bloc-contexte">' +
      '<span class="format-libelle">Contexte du tournoi (U14)</span>' +
      '<div class="ctx-cartes">' + cartes + '</div>' +
      panneau +
    '</div>'
  );
}

/**
 * Un champ modifiable d'une catégorie (input texte/nombre ou menu déroulant).
 * On enveloppe le champ dans un <label> (pas d'id, pour éviter les doublons).
 */
function champCategorie(champ, valeur) {
  let controle;
  if (champ.type === 'select') {
    let options = '';
    champ.options.forEach(function (opt) {
      // Une option vide s'affiche « — » (non précisé), jamais une ligne blanche muette.
      const libelle = (opt === '') ? '—' : opt;
      options += '<option value="' + opt + '"' + (String(valeur) === opt ? ' selected' : '') + '>' + libelle + '</option>';
    });
    // Valeur enregistrée hors de la liste (ex. 3 périodes écrites par « Appliquer les valeurs FFR ») : gardée et
    // sélectionnée. Sans elle, le navigateur retombait sur « — » et « Enregistrer » l'effaçait en silence.
    if (String(valeur) !== '' && champ.options.indexOf(String(valeur)) === -1) {
      options += '<option value="' + echapper(valeur) + '" selected>' + echapper(valeur) + ' (valeur enregistrée)</option>';
    }
    controle = '<select class="r-input" name="' + champ.cle + '">' + options + '</select>';
  } else {
    const attrs = (champ.type === 'number') ? ' min="0"' : '';
    const ph = champ.placeholder ? ' placeholder="' + echapper(champ.placeholder) + '"' : '';
    controle = '<input class="r-input" type="' + champ.type + '"' + attrs + ph +
               ' name="' + champ.cle + '" value="' + echapper(valeur) + '">';
  }
  return '<label class="reglage"><span class="r-libelle">' + champ.label + '</span>' + controle + '</label>';
}

/* ==========================================================================
   ÉCRAN « CATÉGORIES » — rendu sans perte de saisie, contrôle et écritures (contrat d'écriture)
   --------------------------------------------------------------------------
   ⭐ « Enregistrer », « Ajouter » et « Supprimer » : UNE requête chacun, bornée ; l'écran se met à jour depuis la
     RÉPONSE (configuration relue sous le verrou), sans relecture. Le contrôle FFR de l'écran Infos ne repart, en
     arrière-plan, que si l'une de ses entrées a changé. Onglets, champs, formats, terrains, norme FFR : zéro appel.
   ⛔ Une saisie non enregistrée n'est plus écrasée par un rendu lancé ailleurs (catégorie ajoutée ou supprimée, choix
     des catégories, génération, terrains…) : voir injecterCategories.
   ⛔ Le serveur reste l'autorité : une création ne réécrit jamais une catégorie existante, une suppression est
     recomptée (équipes, matchs) sous son verrou et refusée si la réalité dépasse ce qui a été confirmé.
   ========================================================================== */

/* Délai NOMINAL des trois écritures. Sans lui, une réponse qui ne vient jamais laissait « Enregistrer » et « Ajouter »
   occupés pour toujours. ⛔ Aucun renvoi automatique : api.js ne rejoue pas ces écritures. */
const DELAI_ECRITURE_CATEGORIES_MS = 30000;

/* Colonnes que lit le contrôle FFR du serveur (getConformiteFFR : présence, forme retenue, temps prévisionnel). Le
   verdict n'est redemandé que si l'une d'elles change. Garde : tests/ecran-categories-surface.test.js (traçage du vrai
   Code.gs). */
const COLONNES_CATEGORIE_VERDICT_FFR = ['categorie', 'presente', 'forme_jeu', 'format_apresmidi', 'format_mi_temps',
  'duree_mi_temps_min'];

/* Libellés des contrôles de la carte qui n'appartiennent pas à CHAMPS_CATEGORIE : un refus dit QUEL champ corriger. */
const LIBELLES_CATEGORIE = { terrains: 'Terrains', terrains_auto: 'Terrains (Auto / Manuel)', format_apresmidi: 'Format retenu',
  nbQualifiesCoupe: 'Qualifiés en Coupe (par poule)', forme_jeu: 'Forme de jeu retenue (FFR)',
  contexte_tournoi: 'Contexte du tournoi (U14)', scf_phase: 'Phase du Super Challenge' };

/* État AFFICHÉ de chaque carte à sa naissance (valeurs enregistrées) : une différence est une SAISIE EN COURS. */
const categoriesAffichees = new WeakMap();
/* Ligne ENREGISTRÉE (brute, telle que getConfigAdmin l'a donnée) sur laquelle la carte a été chargée : partie avec
   chaque « Enregistrer » (`base`), elle permet au serveur de ne pas écraser ce qu'un autre écran a changé entre-temps. */
const categoriesChargees = new WeakMap();
/* Cartes dont l'enregistrement est en vol (une écriture à la fois par carte). */
const cartesCategoriesEnEnvoi = new WeakSet();
/* Écritures en vol sur l'écran : pendant ce temps, la zone n'est jamais reconstruite (un bouton occupé le reste). */
let categoriesEcrituresEnVol = 0;
let categoriesRenduEnAttente = false;
/* Messages destinés à une carte pas encore rendue (rendu différé) : repris au prochain rendu. '' = « Ajouter ». */
const messagesCategoriesEnAttente = {};
let ajoutCategorieEnCours = false;

function libelleChampCategorie(nom) {
  const c = CHAMPS_CATEGORIE.filter(function (x) { return x.cle === nom; })[0];
  return c ? c.label : (LIBELLES_CATEGORIE[nom] || nom);
}

/** Sélecteur CSS d'un nom de catégorie (valeur d'attribut entre guillemets). */
function selecteurCategorie(nom) {
  return (typeof window !== 'undefined' && window.CSS && CSS.escape) ? CSS.escape(String(nom))
    : String(nom).replace(/["\\]/g, '\\$&');
}

function carteCategorie(nom) {
  const zone = document.getElementById('zone-categories');
  return zone ? zone.querySelector('form.form-categorie[data-cat="' + selecteurCategorie(nom) + '"]') : null;
}

/** Valeurs des contrôles nommés d'un formulaire : { nom: valeur } (groupe radio : la valeur cochée, '' sinon). */
function lireControlesCategorie(form) {
  const o = {};
  Array.from(form.querySelectorAll('input, select, textarea')).forEach(function (c) {
    if (!c.name) return;
    if (c.type === 'radio') { if (!Object.prototype.hasOwnProperty.call(o, c.name)) o[c.name] = ''; if (c.checked) o[c.name] = c.value; }
    else if (c.type === 'checkbox') o[c.name] = c.checked ? 'oui' : 'non';
    else o[c.name] = String(c.value);
  });
  return o;
}

/** Écrit une valeur dans un contrôle nommé de la carte (groupe radio : coche le bouton qui porte cette valeur). */
function ecrireControleCategorie(form, nom, valeur) {
  Array.from(form.querySelectorAll('[name="' + nom + '"]')).forEach(function (c) {
    if (c.type === 'radio') c.checked = (c.value === valeur);
    else if (c.type === 'checkbox') c.checked = (valeur === 'oui');
    else c.value = valeur;
  });
}

/** État affiché à la naissance de la carte. Carte rendue par un module d'avant ce lot (cache du navigateur) : celui
 *  qu'aurait donné l'état enregistré connu. */
function baseCategorie(form) {
  let base = categoriesAffichees.get(form);
  if (base) return base;
  const nom = form.getAttribute('data-cat');
  const cat = ((typeof configCourante !== 'undefined' && configCourante.categories) || [])
    .filter(function (c) { return String(c.categorie) === nom; })[0];
  if (!cat) return null;
  const modele = document.createElement('div');
  modele.innerHTML = formulaireCategorie(cat);
  base = lireControlesCategorie(modele.querySelector('form'));
  categoriesAffichees.set(form, base);
  return base;
}

/** Ligne enregistrée sur laquelle la carte a été chargée ; carte rendue par un module d'avant ce lot : l'état connu. */
function ligneChargeeCategorie(form) {
  let ligne = categoriesChargees.get(form);
  if (ligne) return ligne;
  const nom = form.getAttribute('data-cat');
  const cat = ((typeof configCourante !== 'undefined' && configCourante.categories) || [])
    .filter(function (c) { return String(c.categorie) === nom; })[0];
  if (!cat) return null;
  ligne = Object.assign({}, cat);
  categoriesChargees.set(form, ligne);
  return ligne;
}

/** `base` d'un envoi : pour chaque colonne envoyée, sa valeur dans la ligne chargée (le serveur compare, voir
 *  fusionnerLigneCategorie_). null : ligne inconnue — l'envoi part alors sans cette protection, comme avant. */
function etatChargeCategorie(form, data) {
  const ligne = ligneChargeeCategorie(form);
  if (!ligne) return null;
  const base = {};
  Object.keys(data).forEach(function (k) {
    if (k === 'mode' || k === 'base') return;
    const v = ligne[k];
    base[k] = (v == null) ? '' : (typeof v === 'object' ? String(v) : v);
  });
  return base;
}

/** Colonne enregistrée que porte un contrôle de la carte (« Qualifiés en Coupe » vit dans `param_format`). */
function colonneDuControleCategorie(nom) {
  return nom === 'nbQualifiesCoupe' ? 'param_format' : nom;
}

/** Valeur ENREGISTRÉE d'un contrôle ; la forme de jeu (injectée après coup par admin-conformite-ffr.js) porte la
 *  sienne dans data-value. `undefined` = inconnue. */
function valeurEnregistreeCategorie(form, nom) {
  if (nom === 'forme_jeu') {
    const zone = form.querySelector('.ffr-forme-choix');
    return zone ? String(zone.getAttribute('data-value') || '') : undefined;
  }
  const base = baseCategorie(form);
  return (base && Object.prototype.hasOwnProperty.call(base, nom)) ? base[nom] : undefined;
}

/** Contrôles dont la valeur à l'écran diffère de la valeur enregistrée : la saisie en cours de la carte. */
function champsCategorieEnCours(form) {
  const actuel = lireControlesCategorie(form);
  return Object.keys(actuel).filter(function (n) {
    const v = valeurEnregistreeCategorie(form, n);
    return v !== undefined && v !== actuel[n];
  });
}

/** Ce qui dépend des choix de la carte, comme onReglagesChange le fait à la main : format (explication, qualifiés),
 *  terrains (Auto / Manuel, conseils), contexte U14 et phase, alerte « hors cadre FFR ». */
function synchroniserDependancesCategorie(form) {
  const v = lireControlesCategorie(form);
  const format = form.querySelector('.bloc-format');
  if (format && v.format_apresmidi) format.setAttribute('data-format', v.format_apresmidi);
  const terrains = form.querySelector('.bloc-terrains');
  if (terrains) {
    terrains.setAttribute('data-terrains', v.terrains_auto === 'non' ? 'manuel' : 'auto');
    verifierTerrainsBloc(terrains);
  }
  if (v.contexte_tournoi) form.setAttribute('data-contexte', v.contexte_tournoi);
  const scf = form.querySelector('.bloc-scf');
  if (scf && v.scf_phase) scf.setAttribute('data-phase', v.scf_phase);
  if (typeof majAlerteTempsCategorie === 'function') majAlerteTempsCategorie(form.getAttribute('data-cat'));
}

/** Message d'une carte (nom '' : « Ajouter une catégorie ») ; gardé pour le prochain rendu si elle n'existe pas encore. */
function annoncerCategorie(nom, texte, type) {
  const zone = document.getElementById('zone-categories');
  const form = nom === '' ? (zone && zone.querySelector('#form-ajout-categorie')) : carteCategorie(nom);
  const el = form && (form.querySelector(nom === '' ? '[data-role="msg-ajout-cat"]' : '[data-role="msg-cat"]') ||
    form.querySelector('.message-cat'));
  if (el) { afficherMessage(el, texte, type); delete messagesCategoriesEnAttente[nom]; return; }
  messagesCategoriesEnAttente[nom] = { texte: texte, type: type };
}

function selectionChamp(e, cle) {
  try { return typeof e[cle] === 'number' ? e[cle] : null; } catch (x) { return null; }
}

/** Le champ qui avait le focus avant un rendu le retrouve (curseur compris) dans la carte reconstruite. */
function restaurerFocusCategories(zone, f) {
  let cible = null;
  if (f.onglet !== null) cible = zone.querySelector('.cv-cat-onglet[data-cat-onglet="' + selecteurCategorie(f.onglet) + '"]');
  else {
    const form = f.ajout ? zone.querySelector('#form-ajout-categorie') : (f.cat != null ? carteCategorie(f.cat) : null);
    if (form && f.bouton) cible = form.querySelector(f.bouton);
    else if (form && f.nom) cible = form.querySelector('[name="' + f.nom + '"]' + (f.valeur !== null ? '[value="' + selecteurCategorie(f.valeur) + '"]' : ''));
  }
  if (!cible || typeof cible.focus !== 'function') return;
  cible.focus();
  if (f.debut !== null && typeof cible.setSelectionRange === 'function') {
    try { cible.setSelectionRange(f.debut, f.fin); } catch (e) { /* champ sans curseur (nombre) */ }
  }
}

/**
 * Rend la zone « Catégories » (onglets, cartes, vue d'ensemble) depuis l'état ENREGISTRÉ `categories` : point de passage
 * de ce rendu (réglages relus, choix des catégories, ajout, suppression, relecture lancée par une autre étape).
 * ⭐ Une saisie non enregistrée SURVIT au rendu : chaque champ modifié garde sa valeur, sauf si le serveur a changé CE
 *   champ entre-temps — la valeur enregistrée l'emporte alors (jamais pour le champ qui a le focus) et c'est dit. Le
 *   champ actif garde le focus et son curseur ; le nom en cours dans « Ajouter », les messages des cartes et la vue
 *   d'ensemble ouverte sont gardés. Sans saisie en cours : rendu complet, comme avant.
 * ⛔ Pendant une écriture de l'écran, rien n'est reconstruit (un bouton occupé le reste, pas de second envoi possible) :
 *   le rendu est fait à la fin de l'écriture, depuis l'état le plus récent.
 */
function injecterCategories(categories) {
  const zone = document.getElementById('zone-categories');
  if (!zone) return;
  if (categoriesEcrituresEnVol > 0) { categoriesRenduEnAttente = true; return; }
  categoriesRenduEnAttente = false;
  // 1) Ce que la zone porte avant le rendu.
  const brouillons = {}, messages = {};
  Array.from(zone.querySelectorAll('form.form-categorie')).forEach(function (f) {
    const nom = f.getAttribute('data-cat');
    const m = f.querySelector('[data-role="msg-cat"]');
    if (m && m.textContent) messages[nom] = { texte: m.textContent, classe: m.className };
    const enCours = champsCategorieEnCours(f);
    if (!enCours.length) return;
    brouillons[nom] = { champs: enCours, valeurs: lireControlesCategorie(f), chargee: ligneChargeeCategorie(f),
      avant: enCours.reduce(function (o, c) { o[c] = valeurEnregistreeCategorie(f, c); return o; }, {}) };
  });
  const mAjout = zone.querySelector('[data-role="msg-ajout-cat"]');
  if (mAjout && mAjout.textContent) messages[''] = { texte: mAjout.textContent, classe: mAjout.className };
  const actif = document.activeElement;
  let focus = null;
  if (actif && actif !== zone && zone.contains(actif)) {
    const f = actif.closest && actif.closest('form');
    const estBouton = actif.tagName === 'BUTTON';
    focus = { onglet: actif.getAttribute('data-cat-onglet'), cat: f ? f.getAttribute('data-cat') : null,
      ajout: !!(f && f.id === 'form-ajout-categorie'), nom: estBouton ? '' : (actif.name || ''),
      valeur: actif.type === 'radio' ? actif.value : null,
      bouton: estBouton && f ? (actif.type === 'submit' ? 'button[type="submit"]' : '.bouton-suppr-cat') : null,
      debut: selectionChamp(actif, 'selectionStart'), fin: selectionChamp(actif, 'selectionEnd') };
  }
  const champAjout = zone.querySelector('#form-ajout-categorie input[name="categorie"]');
  const nomAjout = champAjout ? champAjout.value : '';
  const apercu = zone.querySelector('.cv-cat-apercu');
  const apercuOuvert = !!(apercu && apercu.open);

  // 2) Le rendu, depuis l'état enregistré (conseils des terrains manuels et parties FFR compris : local).
  zone.innerHTML = afficherCategories(categories || []);
  const cartes = Array.from(zone.querySelectorAll('form.form-categorie'));
  cartes.forEach(function (f) {
    categoriesAffichees.set(f, lireControlesCategorie(f));
    const ligne = (categories || []).filter(function (c) { return String(c.categorie) === f.getAttribute('data-cat'); })[0];
    if (ligne) categoriesChargees.set(f, Object.assign({}, ligne));
  });
  zone.querySelectorAll('.bloc-terrains[data-terrains="manuel"]').forEach(verifierTerrainsBloc);
  if (typeof majFormesCategories === 'function') majFormesCategories();
  // La photo de l'assistant (barre latérale) décrit l'état ENREGISTRÉ de chaque carte, avant toute saisie reprise.
  if (typeof assistantRephotographier === 'function') cartes.forEach(assistantRephotographier);

  // 3) Les saisies en cours reprennent leur place.
  const perdues = [];
  Object.keys(brouillons).forEach(function (nom) {
    const b = brouillons[nom];
    const f = carteCategorie(nom);
    if (!f) { perdues.push(nom); return; }
    const gardes = [], repris = [], concurrents = [];
    const chargee = categoriesChargees.get(f);
    b.champs.forEach(function (champ) {
      const maintenant = valeurEnregistreeCategorie(f, champ);
      const aLeFocus = !!(focus && focus.cat === nom && focus.nom === champ);
      const changeAilleurs = maintenant !== undefined && maintenant !== b.avant[champ];
      if (changeAilleurs && !aLeFocus) { repris.push(libelleChampCategorie(champ)); return; }
      ecrireControleCategorie(f, champ, b.valeurs[champ]);
      gardes.push(libelleChampCategorie(champ));
      if (changeAilleurs) concurrents.push(libelleChampCategorie(champ) + ' (enregistré entre-temps : ' + (maintenant || 'vide') + ')');
      // ⛔ Une saisie gardée reste fondée sur ce qu'elle a modifié : sa colonne garde la valeur CHARGÉE d'avant le rendu.
      // Si un autre écran l'a changée entre-temps, le serveur le verra et refusera au lieu d'écraser en silence.
      const col = colonneDuControleCategorie(champ);
      if (chargee && b.chargee && Object.prototype.hasOwnProperty.call(b.chargee, col)) chargee[col] = b.chargee[col];
    });
    synchroniserDependancesCategorie(f);
    b.message = (gardes.length ? '✏️ Saisie non enregistrée conservée : ' + gardes.join(', ') + '. ' : '') +
      (repris.length ? '↻ Valeur enregistrée entre-temps reprise pour : ' + repris.join(', ') + '.' : '') +
      (concurrents.length ? ' ⚠️ Modifié aussi sur un autre écran : ' + concurrents.join(', ') + '.' : '');
  });

  // 4) Focus, nom à ajouter, vue d'ensemble, messages.
  const nouveauChamp = zone.querySelector('#form-ajout-categorie input[name="categorie"]');
  if (nouveauChamp && typeof assistantRephotographier === 'function') assistantRephotographier(nouveauChamp.closest('form'));
  if (nouveauChamp && nomAjout) nouveauChamp.value = nomAjout;
  const nouvelApercu = zone.querySelector('.cv-cat-apercu');
  if (nouvelApercu && apercuOuvert) nouvelApercu.open = true;
  if (perdues.length) {
    messages[''] = { texte: '⚠️ Supprimée entre-temps : ' + perdues.join(', ') + ' — sa saisie non enregistrée n’a pas pu être gardée.',
      classe: 'message-form ko' };
  }
  Object.keys(messagesCategoriesEnAttente).forEach(function (nom) {
    const m = messagesCategoriesEnAttente[nom];
    messages[nom] = { texte: m.texte, classe: 'message-form ' + (m.type === 'ok' ? 'ok' : 'ko') };
    delete messagesCategoriesEnAttente[nom];
  });
  Object.keys(brouillons).forEach(function (nom) {
    if (brouillons[nom].message) messages[nom] = { texte: brouillons[nom].message, classe: 'message-form ko' };
  });
  Object.keys(messages).forEach(function (nom) {
    const form = nom === '' ? zone.querySelector('#form-ajout-categorie') : carteCategorie(nom);
    const el = form && form.querySelector(nom === '' ? '[data-role="msg-ajout-cat"]' : '[data-role="msg-cat"]');
    if (el) { el.textContent = messages[nom].texte; el.className = messages[nom].classe; }
  });
  if (focus) restaurerFocusCategories(zone, focus);
  if (typeof assistantMajVerrou === 'function' && Object.keys(brouillons).length) assistantMajVerrou();
}

/** Seule la vue d'ensemble suit un enregistrement (le reste de la zone n'a pas à être reconstruit). */
function rafraichirApercuCategories() {
  const apercu = document.querySelector('#zone-categories .cv-cat-apercu');
  if (apercu) apercu.innerHTML = contenuApercuCategories((configCourante.categories || []));
}

/** Fin d'une écriture de l'écran : le rendu demandé entre-temps est fait maintenant, depuis l'état le plus récent. */
function debuterEcritureCategories() { categoriesEcrituresEnVol++; }
function finirEcritureCategories() {
  categoriesEcrituresEnVol = Math.max(0, categoriesEcrituresEnVol - 1);
  if (!categoriesEcrituresEnVol && categoriesRenduEnAttente) injecterCategories(configCourante.categories || []);
}

/** Valeurs d'une catégorie telles qu'elles partent au serveur (mêmes règles qu'avant ce lot : ligne entière, valeurs
 *  sans contrôle dans la carte PRÉSERVÉES depuis l'état enregistré). */
function lireFormulaireCategorie(form) {
  const nom = form.getAttribute('data-cat');
  // Toute catégorie existante est active (le réglage « Présente » a été retiré) → on envoie toujours 'oui'.
  const data = { categorie: nom, presente: 'oui' };
  CHAMPS_CATEGORIE.forEach(function (champ) {
    data[champ.cle] = form[champ.cle].value;
  });
  // Terrains : bloc dédié (Auto / Manuel). Le champ texte garde sa valeur même masqué en Auto.
  data.terrains = form.terrains ? String(form.terrains.value).trim() : '';
  data.terrains_auto = (form.terrains_auto && form.terrains_auto.value === 'non') ? 'non' : 'oui';
  // Format d'après-midi + son paramètre JSON (nbQualifiesCoupe seulement pour COUPE_PLATEAU). Sans bouton coché
  // (fiche rendue sans les cartes), la valeur stockée COUPE_PLATEAU est PRÉSERVÉE au lieu du défaut CROISE.
  const choisi = (form.format_apresmidi && form.format_apresmidi.value) ? form.format_apresmidi.value : '';
  const catStockee = configCourante.categories.find(function (c) { return c.categorie === nom; });
  const fmtStocke = catStockee ? formatApresMidiDe(catStockee) : 'CROISE';
  const fmt = (!choisi && fmtStocke === 'COUPE_PLATEAU') ? 'COUPE_PLATEAU' : (choisi || 'CROISE');
  data.format_apresmidi = fmt;
  if (fmt === 'COUPE_PLATEAU') {
    let nbQ = parseInt(form.nbQualifiesCoupe && form.nbQualifiesCoupe.value, 10);
    if (!isFinite(nbQ) || nbQ < 1) nbQ = 2;
    data.param_format = JSON.stringify({ nbQualifiesCoupe: nbQ });
  } else {
    data.param_format = '';
  }
  // Forme de jeu, contexte U14 et règlement : contrôles absents ⇒ valeur stockée PRÉSERVÉE (enregistrerCategorie
  // réécrit la LIGNE ENTIÈRE, un champ omis serait effacé — leçon session 3).
  data.forme_jeu = form.forme_jeu
    ? String(form.forme_jeu.value || '')
    : ((catStockee && catStockee.forme_jeu != null) ? String(catStockee.forme_jeu) : '');
  data.contexte_tournoi = form.contexte_tournoi
    ? String(form.contexte_tournoi.value || '')
    : ((catStockee && catStockee.contexte_tournoi != null) ? String(catStockee.contexte_tournoi) : '');
  data.scf_phase = form.scf_phase
    ? String(form.scf_phase.value || '')
    : ((catStockee && catStockee.scf_phase != null) ? String(catStockee.scf_phase) : '');
  data.reglement = (catStockee && catStockee.reglement != null) ? String(catStockee.reglement) : '';
  // Pause méridienne échelonnée : aucun contrôle dans la carte ⇒ valeur stockée PRÉSERVÉE (elle était vidée à chaque
  // « Enregistrer »). Le serveur au contrat la garde aussi quand elle manque ; l'envoyer protège avec un backend d'avant.
  if (catStockee && catStockee.pause_echelonnee != null) data.pause_echelonnee = String(catStockee.pause_echelonnee);
  return data;
}

/** Premier défaut de saisie de la carte, ou null : { champ, message }. Les règles du serveur (validerCategorie_), plus
 *  ce que seul le navigateur voit : un nombre illisible (le champ vaut alors ''). */
function controlerSaisieCategorie(form, data) {
  const nombres = ['duree_mi_temps_min', 'pause_mi_temps_min', 'recup_entre_matchs_min', 'effectif_min', 'effectif_max',
    'max_equipes_par_club'];
  const coupe = data.format_apresmidi === 'COUPE_PLATEAU';
  const illisibles = nombres.concat(coupe ? ['nbQualifiesCoupe'] : []);
  for (let i = 0; i < illisibles.length; i++) {
    const c = form[illisibles[i]];
    if (c && c.validity && c.validity.badInput) {
      return { champ: illisibles[i], message: '« ' + libelleChampCategorie(illisibles[i]) + ' » est illisible : corrige-le ou vide-le.' };
    }
  }
  const texte = function (v) { return String(v == null ? '' : v).trim(); };
  const durees = ['duree_mi_temps_min', 'pause_mi_temps_min', 'recup_entre_matchs_min'];
  for (let j = 0; j < durees.length; j++) {
    const v = texte(data[durees[j]]);
    if (v && (!/^\d{1,4}$/.test(v) || Number(v) > 1440)) {
      return { champ: durees[j], message: '« ' + libelleChampCategorie(durees[j]) + ' » : un nombre entier de minutes entre 0 et 1440 est attendu.' };
    }
  }
  const entiers = ['effectif_min', 'effectif_max', 'max_equipes_par_club'];
  for (let k = 0; k < entiers.length; k++) {
    const v = texte(data[entiers[k]]);
    if (v && !/^\d{1,4}$/.test(v)) {
      return { champ: entiers[k], message: '« ' + libelleChampCategorie(entiers[k]) + ' » : un nombre entier de 0 à 9999 est attendu.' };
    }
  }
  // Effectifs par équipe (dossier club) : optionnels, mais si les deux sont saisis, min ≤ max (message d'avant ce lot).
  const effMin = parseInt(data.effectif_min, 10);
  const effMax = parseInt(data.effectif_max, 10);
  if (isFinite(effMin) && isFinite(effMax) && effMin > effMax) {
    return { champ: 'effectif_max', message: 'Effectif min (' + effMin + ') supérieur à l\'effectif max (' + effMax + ').' };
  }
  if (texte(data.format_mi_temps) && !/^[1-9]$/.test(texte(data.format_mi_temps))) {
    return { champ: 'format_mi_temps', message: '« Nombre de périodes » : de 1 à 9, ou « — ».' };
  }
  const poules = texte(data.nb_poules);
  if (poules && !/^auto$/i.test(poules) && !/^\d{1,3}$/.test(poules)) {
    return { champ: 'nb_poules', message: '« Nombre de poules » : laisse vide (automatique) ou indique un nombre entier.' };
  }
  const q = coupe && form.nbQualifiesCoupe ? texte(form.nbQualifiesCoupe.value) : '';
  if (q && (!/^\d{1,3}$/.test(q) || Number(q) < 1)) {
    return { champ: 'nbQualifiesCoupe', message: '« Qualifiés en Coupe (par poule) » : un nombre entier d’au moins 1 est attendu.' };
  }
  return null;
}

/** Montre le défaut : message dans la carte, focus sur le champ. */
function signalerDefautCategorie(form, defaut, message) {
  afficherMessage(message, '⚠️ ' + defaut.message, 'ko');
  const c = form[defaut.champ];
  if (c && typeof c.focus === 'function' && !c.disabled) c.focus();
}

/** Une réponse PERDUE (délai, connexion coupée, 404 de Google au second saut, page illisible) peut cacher une écriture
 *  réussie ; une réponse LUE (refus du serveur) dit ce qui s'est passé. */
function reponseCategoriesPerdue(erreur) {
  return !!(erreur && !erreur.reponse && (erreur.name === 'AbortError' || erreur.name === 'TypeError' ||
    erreur.name === 'SyntaxError' || /erreur \(\d{3}\)/.test(String(erreur.message || ''))));
}

function causeReponsePerdue(erreur) {
  return erreur.name === 'AbortError' ? 'aucune réponse du serveur dans le délai'
    : erreur.name === 'TypeError' ? 'connexion interrompue' : String(erreur.message || 'réponse illisible').replace(/\.$/, '');
}

/** La réponse porte-t-elle la configuration relue (contrat d'écriture) ? Sinon : backend d'avant ou réponse incomplète. */
function reponseCategoriesComplete(res) {
  return !!(res && res.contrat === 'ecriture-v1' && Array.isArray(res.modifies) && res.config && res.config.global &&
    Array.isArray(res.config.categories));
}

/** Projection des colonnes que lit le contrôle FFR : le verdict est-il devenu faux ? */
function verdictFFRImpacte(avant, apres) {
  const projeter = function (cfg) {
    const o = {};
    ((cfg && cfg.categories) || []).forEach(function (c) {
      o[String(c.categorie)] = COLONNES_CATEGORIE_VERDICT_FFR.map(function (k) { return String(c[k] == null ? '' : c[k]); }).join('|');
    });
    return JSON.stringify(Object.keys(o).sort().map(function (k) { return [k, o[k]]; }));
  };
  return projeter(avant) !== projeter(apres);
}

function nomsCategories(cfg, presentesSeulement) {
  return ((cfg && cfg.categories) || []).filter(function (c) { return !presentesSeulement || estPresente(c); })
    .map(function (c) { return String(c.categorie); });
}

/**
 * La configuration RELUE par le serveur devient celle de l'écran, et ce qui en dépend suit, en local : cartes (sans perte
 * de saisie), menus des équipes, terrains et cases de l'écran Infos si la liste des catégories a changé, fil « Où en
 * suis-je ? », pastilles, dossier club. Le contrôle FFR repart en arrière-plan seulement si ses entrées ont changé.
 * @param {string} [nomEnregistre] catégorie qui vient d'être enregistrée depuis sa carte : sa carte n'est pas
 *   reconstruite (elle est déjà à jour) tant que rien d'autre n'a changé.
 */
function appliquerConfigCategories(cfg, nomEnregistre) {
  const avant = configCourante;
  const structure = JSON.stringify(nomsCategories(avant)) !== JSON.stringify(nomsCategories(cfg));
  const presences = JSON.stringify(nomsCategories(avant, true)) !== JSON.stringify(nomsCategories(cfg, true));
  const autres = function (c) { return JSON.stringify((c.categories || []).filter(function (x) { return String(x.categorie) !== nomEnregistre; })); };
  if (structure || presences || nomEnregistre == null) {
    if (typeof rendreCategoriesChoix === 'function') rendreCategoriesChoix(cfg);
    else {
      configCourante = cfg;
      injecterCategories(cfg.categories);
      remplirSelectCategories(cfg.categories);
      injecterTerrains();
      majTableauBord();
      majDossier();
    }
    if (typeof majChoixCategoriesTournoi === 'function') majChoixCategoriesTournoi();
  } else {
    configCourante = cfg;
    if (autres(avant) !== autres(cfg)) injecterCategories(cfg.categories);   // changé ailleurs entre-temps
    else rafraichirApercuCategories();
    majTableauBord();   // fil « Où en suis-je ? », pastilles (planning à refaire), bouton « Recalculer »
    majDossier();       // le cadre sportif du dossier club suit
  }
  if (verdictFFRImpacte(avant, cfg) && typeof majConformiteFFR === 'function') majConformiteFFR().catch(function () {});
}

/**
 * Enregistre une carte (bouton, ou Entrée dans un champ) : UNE requête, qui porte la ligne entière ; l'écran applique
 * la configuration relue par le serveur.
 * ⛔ Une modification faite PENDANT l'envoi n'est pas enregistrée : elle reste une saisie en cours, et c'est dit.
 * ⛔ Réponse perdue : « non confirmé », aucun renvoi ; un nouveau clic réécrit la même ligne (sans doublon).
 * ⭐ Deux écrans sur la même catégorie : l'envoi porte `base` (la ligne chargée). Le serveur garde ce qu'un autre écran
 *   a changé entre-temps et que cette carte n'a pas touché (et le dit) ; même réglage changé autrement : refus, rien
 *   d'écrit, la saisie reste à l'écran fondée sur l'état relu — un nouveau clic la confirme en connaissance de cause.
 */
async function onEnregistrerCategorie(evenement) {
  evenement.preventDefault();
  const form = evenement.target;
  const message = form.querySelector('[data-role="msg-cat"]') || form.querySelector('.message-cat');
  const nom = form.getAttribute('data-cat');
  const bouton = form.querySelector('button[type="submit"]');
  // ⛔ Une écriture à la fois par carte : Entrée dans un champ pendant l'envoi ne relance rien.
  if (cartesCategoriesEnEnvoi.has(form)) return;

  const data = lireFormulaireCategorie(form);
  const defaut = controlerSaisieCategorie(form, data);
  if (defaut) { signalerDefautCategorie(form, defaut, message); return; }
  data.mode = 'modifier';
  const base = etatChargeCategorie(form, data);
  if (base) data.base = base;
  const envoyes = lireControlesCategorie(form);
  const dejaEnregistree = champsCategorieEnCours(form).length === 0;

  cartesCategoriesEnEnvoi.add(form);
  debuterEcritureCategories();
  let res = null, conflit = null;
  try {
    await avecBoutonOccupe(bouton, message, async function () {
      try {
        res = await ecrireAdmin('enregistrerCategorie', data, { delaiMs: DELAI_ECRITURE_CATEGORIES_MS });
      } catch (erreur) {
        if (erreur && erreur.reponse && erreur.reponse.code === 'modification_concurrente') conflit = erreur.reponse;
        if (!reponseCategoriesPerdue(erreur)) throw erreur;
        // Réponse perdue : l'écriture a pu aboutir — la feuille d'autorisation (qui lit les catégories) est tenue
        // pour périmée, par prudence (elle ne sera relue qu'à la prochaine visite).
        try {
          if (typeof ecritureImpacteAutorisation === 'function' && typeof signalerAutorisationObsolete === 'function' &&
              ecritureImpacteAutorisation('enregistrerCategorie', data, null)) signalerAutorisationObsolete();
        } catch (e) { /* le message reste juste */ }
        throw new Error('Enregistrement non confirmé (' + causeReponsePerdue(erreur) + '). Tes réglages restent à l’écran : ' +
          'un nouveau clic les enregistre, sans risque de doublon.');
      }
    });
  } finally {
    cartesCategoriesEnEnvoi.delete(form);
  }
  try {
    if (res) appliquerCategorieEnregistree(form, nom, data, envoyes, dejaEnregistree, res);
  } finally {
    finirEcritureCategories();          // le rendu différé pendant l'envoi est fait maintenant
  }
  if (conflit && reponseCategoriesComplete(conflit)) appliquerConflitCategorie(form, nom, conflit);
}

/**
 * Refus `modification_concurrente` : rien n'a été écrit. La carte est désormais fondée sur l'état RELU (ce que l'autre
 * écran a enregistré) ; la saisie reste à l'écran (réglages en conflit compris), et le message montre les deux valeurs.
 * Un nouveau clic enregistre alors la saisie en connaissance de cause (elle part avec la nouvelle `base`).
 */
function appliquerConflitCategorie(form, nom, refus) {
  const relue = refus.config.categories.filter(function (c) { return String(c.categorie) === nom; })[0];
  if (relue) {
    categoriesChargees.set(form, Object.assign({}, relue));
    const modele = document.createElement('div');
    modele.innerHTML = formulaireCategorie(relue);
    const neuve = modele.querySelector('form');
    if (neuve) categoriesAffichees.set(form, lireControlesCategorie(neuve));
    const zoneForme = form.querySelector('.ffr-forme-choix');
    if (zoneForme) zoneForme.setAttribute('data-value', String(relue.forme_jeu == null ? '' : relue.forme_jeu));
  }
  appliquerConfigCategories(refus.config);    // rendu SANS perte de saisie (injecterCategories)
  const details = (refus.conflits || []).map(function (x) {
    return '« ' + (x.libelle || x.colonne) + ' » (enregistré : ' + (x.enregistree || 'vide') + ' ; ta saisie : ' + (x.envoyee || 'vide') + ')';
  });
  annoncerCategorie(nom, '⚠️ Modifié entre-temps sur un autre écran : ' + details.join(', ') + '. Rien n’a été enregistré. ' +
    'Ta saisie est gardée à l’écran : « Enregistrer » à nouveau la confirme (elle remplacera la valeur enregistrée), ou corrige-la.', 'ko');
}

/**
 * Succès d'une carte : l'écran se met à jour depuis la RÉPONSE — configuration relue (contrat `ecriture-v1`) ou, avec un
 * backend d'avant le contrat ou une réponse incomplète, les valeurs envoyées (comportement d'avant). Jamais de relecture.
 * « Déjà à jour » exige DEUX preuves : le serveur n'a rien écrit ET la carte montrait déjà l'état enregistré.
 */
function appliquerCategorieEnregistree(form, nom, data, envoyes, dejaEnregistree, res) {
  const complet = reponseCategoriesComplete(res) &&
    res.config.categories.some(function (c) { return String(c.categorie) === nom; });
  let cfg;
  if (complet) cfg = res.config;
  else {
    const envoye = Object.assign({}, data);
    delete envoye.mode;
    delete envoye.base;
    cfg = JSON.parse(JSON.stringify(configCourante));
    const idx = cfg.categories.findIndex(function (c) { return c.categorie === nom; });
    if (idx >= 0) cfg.categories[idx] = Object.assign({}, cfg.categories[idx], envoye);
    else cfg.categories.push(envoye);
  }
  // La carte enregistrée : l'état envoyé devient l'état enregistré — sauf ce qui a été modifié PENDANT l'envoi.
  const actuel = lireControlesCategorie(form);
  const pendant = Object.keys(actuel).filter(function (n) { return actuel[n] !== envoyes[n]; });
  categoriesAffichees.set(form, Object.assign({}, envoyes));
  const zoneForme = form.querySelector('.ffr-forme-choix');
  if (zoneForme) zoneForme.setAttribute('data-value', String(data.forme_jeu || ''));
  if (!pendant.length && typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
  // Le prochain envoi part de la ligne ENREGISTRÉE (relue). Si le serveur y a gardé ce qu'un autre écran a changé
  // entre-temps, la carte ne le montre pas encore : elle est reconstruite (saisie faite pendant l'envoi gardée).
  const relue = cfg.categories.filter(function (c) { return String(c.categorie) === nom; })[0];
  if (relue) categoriesChargees.set(form, Object.assign({}, relue));
  const ecart = !!relue && Object.keys(data).some(function (k) {
    return k !== 'mode' && k !== 'base' && String(relue[k] == null ? '' : relue[k]) !== String(data[k]);
  });
  appliquerConfigCategories(cfg, ecart ? undefined : nom);
  let texte = (complet && res.modifies.length === 0 && dejaEnregistree)
    ? '✅ Déjà à jour : rien n’a changé depuis le dernier enregistrement.' : '✅ Enregistré.';
  if (pendant.length) {
    texte += ' ✏️ Modifié pendant l’envoi, pas encore enregistré : ' + pendant.map(libelleChampCategorie).join(', ') + '.';
  }
  ((res && res.avertissements) || []).forEach(function (a) { if (a && a.message) texte += ' ⚠️ ' + a.message; });
  annoncerCategorie(nom, texte, 'ok');
}

/**
 * Ajoute une nouvelle catégorie (avec des valeurs de départ modifiables ensuite).
 */
/** Nom de catégorie « normalisé » pour comparer sans piège : minuscules, sans
 *  accents (é → e), espaces réduits. Détecte les doublons du type «  u10 » / « U10 ». */
function normaliserNomCategorie(nom) {
  return String(nom || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents (é → e + accent séparé)
    .replace(/\s+/g, ' ')                             // espaces multiples → un seul
    .trim()
    .toLowerCase();
}

/**
 * « Ajouter » : UNE requête (`mode: 'creer'`) ; la nouvelle carte s'ouvre depuis la configuration relue par le serveur,
 * sans relecture ni attente du contrôle FFR (relancé en arrière-plan : la liste des catégories a changé).
 * ⛔ Le serveur ne réécrit jamais une catégorie existante : créée entre-temps ailleurs, elle est montrée telle qu'elle
 *   est, rien n'est écrasé. Réponse perdue : relecture seule, jamais de renvoi.
 */
async function onAjouterCategorie(evenement) {
  evenement.preventDefault();
  const form = evenement.target;
  const message = form.querySelector('[data-role="msg-ajout-cat"]');
  if (ajoutCategorieEnCours) return;
  const nom = form.categorie.value.trim();

  if (!nom) { afficherMessage(message, 'Indique un nom.', 'ko'); return; }

  // On refuse un doublon (sinon on écraserait la catégorie existante).
  // Comparaison SOUPLE : casse, accents et espaces ignorés («  u10 » = « U10 »). Le serveur refait ce contrôle.
  const doublon = (configCourante.categories || []).find(function (c) {
    return normaliserNomCategorie(c.categorie) === normaliserNomCategorie(nom);
  });
  if (doublon) {
    afficherMessage(message, '⚠️ La catégorie « ' + doublon.categorie + ' » existe déjà.', 'ko');
    return;
  }

  // Réglages sportifs (temps + effectifs) VIERGES à la création : on ne devine aucune valeur.
  // L'organisateur clique « Appliquer la norme FFR » sur la carte (référentiel = source unique) ou
  // saisit lui-même. Un garde-fou à la génération bloque tant que la durée de mi-temps reste vide,
  // pour ne jamais produire de matchs de 0 min.
  const data = {
    categorie: nom, presente: 'oui', terrains: '', terrains_auto: 'oui', nb_poules: '',
    format_mi_temps: '', duree_mi_temps_min: '', pause_mi_temps_min: '',
    recup_entre_matchs_min: '', format_apresmidi: 'CROISE', param_format: '',
    reglement: '', effectif_min: '', effectif_max: '', arbitrage_organisation: '', mode: 'creer'
  };

  const bouton = form.querySelector('button');
  const texteBouton = bouton.textContent;
  ajoutCategorieEnCours = true;
  bouton.disabled = true;
  bouton.textContent = 'Ajout…';
  debuterEcritureCategories();
  let res = null, erreur = null;
  try {
    res = await ecrireAdmin('enregistrerCategorie', data, { delaiMs: DELAI_ECRITURE_CATEGORIES_MS });
  } catch (e) {
    erreur = e;
  } finally {
    ajoutCategorieEnCours = false;
    bouton.disabled = false;
    bouton.textContent = texteBouton;
    finirEcritureCategories();
  }
  {
    const refus = erreur && erreur.reponse;
    if (!erreur && reponseCategoriesComplete(res)) {
      ongletCategorieActif = nom;          // on ouvre l'onglet de la catégorie qui vient de naître
      form.categorie.value = '';
      appliquerConfigCategories(res.config);
      annoncerCategorie(nom, '✅ Catégorie « ' + nom + ' » ajoutée' + (res.nouvelle === false ? ' (par ton envoi précédent)' : '') +
        '. Ses réglages sont vierges : complète-les (ou « Appliquer la norme FFR »), puis « Enregistrer ».', 'ok');
      return;
    }
    if (refus && refus.code === 'categorie_existante' && reponseCategoriesComplete(refus)) {
      // Créée entre-temps (autre appareil, ou envoi précédent dont la réponse s'est perdue) : rien n'est écrasé,
      // elle est montrée telle qu'elle est enregistrée.
      ongletCategorieActif = String(refus.categorie || nom);
      form.categorie.value = '';
      appliquerConfigCategories(refus.config);
      annoncerCategorie(ongletCategorieActif, '⚠️ ' + refus.error + ' Voici ses réglages enregistrés.', 'ko');
      return;
    }
    if (erreur && !reponseCategoriesPerdue(erreur)) {           // refus lu : rien n'a été créé
      afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
      return;
    }
    // Réponse perdue, ou backend d'avant le contrat ({ ok } seul) : relecture SEULE, jamais de renvoi.
    let cfg;
    try {
      cfg = await lireConfigAdmin(undefined, { delaiMs: DELAI_ECRITURE_CATEGORIES_MS });
    } catch (e) {
      afficherMessage(message, '⚠️ Ajout non confirmé' + (erreur ? ' (' + causeReponsePerdue(erreur) + ')' : '') +
        ' et relecture indisponible. Un nouveau clic sur « Ajouter » ne crée pas de doublon.', 'ko');
      return;
    }
    if (cfg.categories.some(function (c) { return String(c.categorie) === nom; })) {
      ongletCategorieActif = nom;
      form.categorie.value = '';
      appliquerConfigCategories(cfg);
      annoncerCategorie(nom, '✅ Catégorie « ' + nom + ' » ajoutée' + (erreur ? ' (confirmé par relecture du serveur, ' +
        'aucune écriture répétée)' : '') + '.', 'ok');
      return;
    }
    appliquerConfigCategories(cfg);
    annoncerCategorie('', '⚠️ La catégorie « ' + nom + ' » n’a pas été créée' + (erreur ? ' (' + causeReponsePerdue(erreur) + ')' : '') +
      '. Clique à nouveau sur « Ajouter ».', 'ko');
  }
}

/** Actualise les cartes uniquement si aucune saisie ni écriture n'est en cours. */
function actualiserCartesCategoriesSansBrouillon() {
  const zone = document.getElementById('zone-categories');
  if (!zone || typeof assistantEstPropre !== 'function') return false;
  if ((typeof choixCategoriesAValider === 'function' && choixCategoriesAValider()) ||
      Array.from(zone.querySelectorAll('form')).some(function (f) { return !assistantEstPropre(f); }) ||
      zone.querySelector('button:disabled')) return false;
  zone.innerHTML = afficherCategories(configCourante.categories || []);
  remplirSelectCategories(configCourante.categories || []);
  if (typeof majChoixCategoriesTournoi === 'function') majChoixCategoriesTournoi();
  if (typeof majFormesCategories === 'function') majFormesCategories();
  if (typeof majConformiteFFR === 'function') majConformiteFFR().catch(function () {});
  return true;
}

/** Équipes et matchs rattachés à une catégorie, d'après les listes chargées dans l'écran — même clé que le serveur
 *  (cleCategorieChoix_). ⚠️ Une indication pour la confirmation, pas une preuve : le serveur recompte. */
function usageCategorieEcran(nom) {
  const cle = function (x) { return normaliserNomCategorie(x).replace(/^m(6|8|10|12|14)$/, 'u$1'); };
  const c = cle(nom);
  const compter = function (liste) {
    return (liste || []).filter(function (x) { return x && cle(x.categorie) === c; }).length;
  };
  return { categorie: nom, equipes: compter(typeof equipesCourantes !== 'undefined' ? equipesCourantes : []),
    matchs: compter(typeof matchsCourants !== 'undefined' ? matchsCourants : []) };
}

/** « 4 équipes et 6 matchs », ou '' si la catégorie est vide. */
function libelleUsageEcran(u) {
  const parts = [];
  if (u.equipes) parts.push(u.equipes + ' équipe' + (u.equipes > 1 ? 's' : ''));
  if (u.matchs) parts.push(u.matchs + ' match' + (u.matchs > 1 ? 's' : ''));
  return parts.join(' et ');
}

function texteSuppressionCategorie(nom, u, duServeur) {
  const usage = u ? libelleUsageEcran(u) : '';
  return (duServeur ? 'Le serveur a trouvé à supprimer : « ' + nom + ' »' : 'Supprimer la catégorie « ' + nom + ' » ?') +
    (usage ? '\nElle a ' + usage + ' : ' + (u.equipes && u.matchs ? 'ils sont conservés' : (u.equipes ? 'elles sont conservées' : 'ils sont conservés')) +
      ', leur catégorie sera à réaffecter.' : '\n(Les équipes de cette catégorie ne sont pas supprimées.)') +
    (duServeur ? '\nSupprimer quand même ?' : '');
}

/**
 * « Supprimer » : confirmation qui montre ce que la catégorie porte (équipes, matchs), puis UNE requête qui dit ce qui a
 * été confirmé. Le serveur recompte sous son verrou : s'il trouve plus, il refuse sans rien écrire et la confirmation
 * est redemandée UNE fois avec ses chiffres. La configuration relue remplace l'écran.
 * ⛔ Réponse perdue, ou backend d'avant le contrat : relecture SEULE pour prouver l'absence — jamais de renvoi.
 */
async function onSupprimerCategorie(bouton) {
  if (bouton.disabled) return;
  const nom = bouton.getAttribute('data-cat');
  bouton.disabled = true;
  try {
    let usage = typeof usageCategorieEcran === 'function' ? usageCategorieEcran(nom) : null;
    if (!await dialogConfirmer(typeof texteSuppressionCategorie === 'function' ? texteSuppressionCategorie(nom, usage, false)
      : 'Supprimer la catégorie « ' + nom + ' » ?\n(Les équipes de cette catégorie ne sont pas supprimées.)',
    { ok: 'Supprimer', danger: true })) return;
    let res = null, erreurEcriture = null;
    const enVol = typeof debuterEcritureCategories === 'function';
    const envoyer = async function (u) {
      res = null; erreurEcriture = null;
      const envoi = { categorie: nom };
      if (u) envoi.confirmation = { equipes: u.equipes || 0, matchs: u.matchs || 0 };
      if (enVol) debuterEcritureCategories();          // aucun rendu de la zone pendant la requête
      try {
        res = await ecrireAdmin('supprimerCategorie', envoi, { delaiMs: 30000 });
      } catch (err) {
        // Une réponse perdue peut cacher une suppression réussie. Ne JAMAIS rejouer.
        erreurEcriture = err;
      } finally {
        if (enVol) finirEcritureCategories();
      }
    };
    await envoyer(usage);
    const refus = erreurEcriture && erreurEcriture.reponse;
    if (refus && refus.code === 'suppression_a_confirmer' && Array.isArray(refus.a_confirmer) && refus.a_confirmer[0]) {
      // Le serveur a trouvé plus que ce qui a été confirmé (équipes inscrites entre-temps) : rien n'a été supprimé.
      if (reponseCategoriesComplete(refus)) appliquerConfigCategories(refus.config);
      usage = refus.a_confirmer[0];
      if (!await dialogConfirmer(texteSuppressionCategorie(nom, usage, true), { ok: 'Supprimer', danger: true })) {
        annoncerCategorie(nom, 'Suppression annulée : rien n’a été supprimé.', 'ok');
        return;
      }
      await envoyer(usage);
    }
    if (!erreurEcriture && typeof reponseCategoriesComplete === 'function' && reponseCategoriesComplete(res)) {
      appliquerConfigCategories(res.config);
      const ouverte = (typeof ongletCategorieActif === 'string' && ongletCategorieActif) ? ongletCategorieActif : '';
      let texte = res.deja_absente ? '✅ « ' + nom + ' » était déjà supprimée : rien d’autre n’a changé.' : '✅ Catégorie « ' + nom + ' » supprimée.';
      (res.avertissements || []).forEach(function (a) { if (a && a.message) texte += ' ⚠️ ' + a.message; });
      annoncerCategorie(ouverte, texte, 'ok');
      return;
    }
    if (erreurEcriture && erreurEcriture.reponse && !(typeof reponseCategoriesPerdue === 'function' && reponseCategoriesPerdue(erreurEcriture))) {
      throw erreurEcriture;                                   // refus lu (serveur occupé…) : rien n'a été supprimé
    }
    const cfg = await lireConfigAdmin(undefined, { delaiMs: 30000 });
    if (cfg.categories.some(function (c) { return c.categorie === nom; })) {
      throw erreurEcriture || new Error('La catégorie est encore présente dans la configuration relue.');
    }
    rendreCategoriesChoix(cfg);
    majChoixCategoriesTournoi();
    // L'absence est vérifiée : la relecture FFR ne retient pas le bouton.
    if (typeof majConformiteFFR === 'function') majConformiteFFR().catch(function () {});
  } catch (erreur) {
    await dialogAlerter('Suppression non confirmée. Actualise les catégories avant un nouvel essai. ' +
      expliquerErreurCategories(erreur));
  } finally {
    bouton.disabled = false;
  }
}
