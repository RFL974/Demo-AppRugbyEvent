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
  document.getElementById('zone-categories').innerHTML = afficherCategories(categories);
  // Affiche d'emblée les conseils des catégories déjà en mode Manuel (sans attendre une frappe).
  document.querySelectorAll('.bloc-terrains[data-terrains="manuel"]').forEach(verifierTerrainsBloc);
  // Remplit la « Forme FFR attendue » des cartes si le référentiel est déjà chargé (sinon
  // c'est majConformiteFFR qui déclenchera le remplissage une fois le référentiel disponible).
  if (typeof majFormesCategories === 'function') majFormesCategories();
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
  return '<details class="cv-options cv-cat-apercu"><summary>Vue d’ensemble<span>Comparer les réglages enregistrés de toutes les catégories</span></summary>' +
    '<div class="table-scroll"><table class="cv-categories-comparaison">' +
    '<thead><tr><th>Catégorie</th><th>Effectif</th><th>Durée d’une période</th><th>Récupération</th><th>Terrains</th></tr></thead><tbody>' +
    cats.map(function (cat) {
      return '<tr><th>' + echapper(cat.categorie) + '</th><td>' + echapper(String(cat.effectif_min || '—')) +
        ' à ' + echapper(String(cat.effectif_max || '—')) + '</td><td>' +
        echapper(String(cat.duree_mi_temps_min || '—')) + ' min</td><td>' +
        echapper(String(cat.recup_entre_matchs_min || '—')) + ' min</td><td>' +
        echapper(String(cat.terrains || 'Automatique')) + '</td></tr>';
    }).join('') + '</tbody></table></div></details>';
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
    '<form class="carte cv-cat-carte categorie form-categorie" data-cat="' + echapper(nom) + '"' +
        ' data-contexte="' + contexteTournoiDe(cat) + '">' +
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
    controle = '<select class="r-input" name="' + champ.cle + '">' + options + '</select>';
  } else {
    const attrs = (champ.type === 'number') ? ' min="0"' : '';
    const ph = champ.placeholder ? ' placeholder="' + echapper(champ.placeholder) + '"' : '';
    controle = '<input class="r-input" type="' + champ.type + '"' + attrs + ph +
               ' name="' + champ.cle + '" value="' + echapper(valeur) + '">';
  }
  return '<label class="reglage"><span class="r-libelle">' + champ.label + '</span>' + controle + '</label>';
}

/**
 * Enregistre les modifications d'une catégorie.
 */
async function onEnregistrerCategorie(evenement) {
  evenement.preventDefault();
  const form = evenement.target;
  const message = form.querySelector('[data-role="msg-cat"]') || form.querySelector('.message-cat');
  const nom = form.getAttribute('data-cat');

  // On rassemble les valeurs du formulaire. Toute catégorie existante est active
  // (le réglage « Présente » a été retiré) → on envoie toujours 'oui'.
  const data = { categorie: nom, presente: 'oui' };
  CHAMPS_CATEGORIE.forEach(function (champ) {
    data[champ.cle] = form[champ.cle].value;
  });

  // Effectifs par équipe (dossier club) : optionnels, mais si les deux sont saisis, min ≤ max.
  const effMin = parseInt(data.effectif_min, 10);
  const effMax = parseInt(data.effectif_max, 10);
  if (isFinite(effMin) && isFinite(effMax) && effMin > effMax) {
    afficherMessage(message, "⚠️ Effectif min (" + effMin + ") supérieur à l'effectif max (" + effMax + ").", 'ko');
    return;
  }
  // Terrains : bloc dédié (Auto / Manuel). Le champ texte garde sa valeur même masqué en Auto.
  data.terrains = form.terrains ? String(form.terrains.value).trim() : '';
  data.terrains_auto = (form.terrains_auto && form.terrains_auto.value === 'non') ? 'non' : 'oui';

  // Format d'après-midi + son paramètre JSON (nbQualifiesCoupe seulement pour COUPE_PLATEAU).
  // COUPE_PLATEAU figure parmi les cartes : un choix explicite suffit donc à le retenir comme à
  // le quitter. Le repli ci-dessous reste un GARDE-FOU pour le cas où aucun bouton n'est coché
  // (groupe de radios absent du formulaire — par exemple une fiche rendue sans les cartes) : on
  // PRÉSERVE alors la valeur stockée au lieu de la remplacer par le défaut CROISE. On ne réécrit
  // jamais silencieusement la donnée d'un tournoi déjà configuré.
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

  // Forme de jeu FFR retenue : le select n'est rendu que si le référentiel FFR expose des formes
  // pour cette catégorie ce mois-ci. S'il est ABSENT, on PRÉSERVE la valeur déjà stockée —
  // enregistrerCategorie réécrit la LIGNE ENTIÈRE, un champ omis serait effacé (leçon session 3).
  data.forme_jeu = form.forme_jeu
    ? String(form.forme_jeu.value || '')
    : ((catStockee && catStockee.forme_jeu != null) ? String(catStockee.forme_jeu) : '');

  // Contexte U14 (Super Challenge) : les contrôles n'existent QUE pour l'U14 (blocContexteU14).
  // Absents (autre catégorie) ⇒ on PRÉSERVE la valeur stockée — enregistrerCategorie réécrit la
  // LIGNE ENTIÈRE, un champ omis serait effacé (leçon session 3). form.contexte_tournoi est une
  // RadioNodeList : .value renvoie l'option cochée.
  data.contexte_tournoi = form.contexte_tournoi
    ? String(form.contexte_tournoi.value || '')
    : ((catStockee && catStockee.contexte_tournoi != null) ? String(catStockee.contexte_tournoi) : '');
  data.scf_phase = form.scf_phase
    ? String(form.scf_phase.value || '')
    : ((catStockee && catStockee.scf_phase != null) ? String(catStockee.scf_phase) : '');

  // Règlement : champ RETIRÉ de la carte (plus d'input) → on PRÉSERVE la valeur stockée. Sans ça,
  // enregistrerCategorie réécrivant la ligne entière l'effacerait (leçon session 3). Le dossier club
  // continue d'afficher un règlement déjà saisi ; il n'est simplement plus éditable ici.
  data.reglement = (catStockee && catStockee.reglement != null) ? String(catStockee.reglement) : '';

  const bouton = form.querySelector('button[type="submit"]');
  await avecBoutonOccupe(bouton, message, async function () {
    await ecrireAdmin('enregistrerCategorie', data);
    // On met à jour la config en mémoire + le menu des équipes, sans tout re-rendre
    // (pour garder le message et l'endroit où on est).
    const idx = configCourante.categories.findIndex(function (c) { return c.categorie === nom; });
    if (idx >= 0) configCourante.categories[idx] = Object.assign({}, configCourante.categories[idx], data);
    // Catégorie ENREGISTRÉE → l'assistant reprend sa photo de référence.
    if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
    remplirSelectCategories(configCourante.categories);
    majTableauBord(); // le nombre de catégories « présentes » a pu changer
    majDossier();     // le cadre sportif du dossier club suit
    afficherMessage(message, '✅ Enregistré.', 'ok');
  });
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

async function onAjouterCategorie(evenement) {
  evenement.preventDefault();
  const form = evenement.target;
  const message = form.querySelector('[data-role="msg-ajout-cat"]');
  const nom = form.categorie.value.trim();

  if (!nom) { afficherMessage(message, 'Indique un nom.', 'ko'); return; }

  // On refuse un doublon (sinon on écraserait la catégorie existante).
  // Comparaison SOUPLE : casse, accents et espaces ignorés («  u10 » = « U10 »).
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
    reglement: '', effectif_min: '', effectif_max: '', arbitrage_organisation: ''
  };

  const bouton = form.querySelector('button');
  bouton.disabled = true;
  try {
    await ecrireAdmin('enregistrerCategorie', data);
    ongletCategorieActif = nom;  // on ouvre l'onglet de la catégorie qui vient de naître
    await rechargerReglages(); // la nouvelle carte apparaît
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    bouton.disabled = false;
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

/** Supprime une catégorie une seule fois, puis confirme son absence en lecture. */
async function onSupprimerCategorie(bouton) {
  if (bouton.disabled) return;
  const nom = bouton.getAttribute('data-cat');
  bouton.disabled = true;
  try {
    if (!await dialogConfirmer('Supprimer la catégorie « ' + nom + ' » ?\n' +
      '(Les équipes de cette catégorie ne sont pas supprimées.)',
      { ok: 'Supprimer', danger: true })) return;
    let erreurEcriture = null;
    try {
      await ecrireAdmin('supprimerCategorie', { categorie: nom }, { delaiMs: 30000 });
    } catch (err) {
      // Une réponse perdue peut cacher une suppression réussie. Ne JAMAIS rejouer.
      erreurEcriture = err;
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
