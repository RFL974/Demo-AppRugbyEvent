/**
 * ============================================================================
 *  ADMIN — GÉNÉRATION (poules + planning) (extrait de admin.js)
 * ============================================================================
 *  Génération des poules et du planning, assistant d'arbitrage (heure de fin
 *  dépassée / forçage du nombre de poules), phase après-midi, édition manuelle
 *  des poules et recalcul des horaires. Sorti du monolithe admin.js SANS
 *  changement de comportement.
 *
 *  Dépend de globaux définis ailleurs, accédés au moment de l'appel (handlers
 *  post-chargement) — l'ordre des <script> importe peu ; chargé après admin.js :
 *   - commun.js : echapper, svgIcone, comparerCategorie, afficherMessage…
 *   - admin.js  : configCourante, equipesCourantes, matchsCourants, ecrireAdmin,
 *                 apiGet, rechargerEtRendre, majTableauBord, dialog*, editionPoules…
 * ============================================================================
 */

/* --------------------------------------------------------------------------
   GÉNÉRATION (poules + planning)
   -------------------------------------------------------------------------- */

/**
 * Lance la génération des poules et du planning, puis affiche le résultat.
 * GARDE-FOU : si des scores sont DÉJÀ saisis (matin ou après-midi), régénérer les effacerait
 * TOUS. On vérifie sur des données FRAÎCHES (les scores viennent des téléphones), on prévient
 * du nombre exact, et on exige une confirmation forte par la clé admin. Sans score saisi, on
 * garde la confirmation simple (phase de préparation).
 */
async function onGenerer() {
  // Compte les scores déjà saisis, sur des données à jour (pas la copie en mémoire).
  let matchsFrais = matchsCourants || [];
  try { matchsFrais = (await apiGet('getMatchs')) || matchsFrais; } catch (e) { /* repli mémoire */ }
  const nbScores = matchsFrais.filter(function (m) { return estTermine(m.statut); }).length;

  if (nbScores > 0) {
    // Des scores existent → avertissement renforcé + double verrou (clé admin).
    if (!await dialogConfirmer(
        '⚠️ ATTENTION : ' + nbScores + ' match(s) ont déjà un score saisi.\n\n' +
        'Régénérer va EFFACER DÉFINITIVEMENT toutes les poules, tous les matchs et TOUS ces scores.\n\n' +
        'Veux-tu vraiment tout regénérer ?',
        { ok: 'Continuer', danger: true })) return;
    const cle = await demanderCleValide('admin',
        'Confirmation forte : ' + nbScores + ' score(s) seront effacés.\n\nEntre la clé admin pour confirmer :');
    if (cle == null) return; // annulé → rien n'est effacé
  } else {
    // Aucun score saisi (préparation) : confirmation simple.
    if (!await dialogConfirmer('Générer les poules et le planning ?\n\n' +
               'Cela efface les poules et le planning précédents.', { ok: 'Générer' })) return;
  }
  await genererMaintenant();
}

/** Fait réellement la génération (sans reconfirmation) puis rafraîchit tout. */
async function genererMaintenant() {
  const bouton  = document.getElementById('bouton-generer');
  const message = document.getElementById('message-generation');
  const texteBouton = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Génération…';
  afficherMessage(message, 'Génération en cours…', 'ok');

  try {
    const res = await ecrireAdmin('genererPoulesEtPlanning', {});
    const nbP = (res && res.nb_poules != null) ? res.nb_poules : '?';
    const nbM = (res && res.nb_matchs != null) ? res.nb_matchs : '?';
    const enRetard = res && res.avertissements && res.avertissements.length;
    let texte = '✅ ' + nbP + ' poule(s) et ' + nbM + ' match(s) du matin générés.';
    if (res.heure_fin_matin) texte += '\n🌅 Fin du matin : ' + res.heure_fin_matin + '.';
    if (res.pause_echelonnee_fin) texte += '\n🍽️ Pause échelonnée : la dernière équipe finit sa pause à ' + res.pause_echelonnee_fin + '.';
    if (res.heure_fin_projetee) texte += '\n🏁 Fin estimée du tournoi (après-midi inclus) : ' + res.heure_fin_projetee + '.';
    if (enRetard) texte += '\n⚠️ ' + res.avertissements.join('\n⚠️ ');
    afficherMessage(message, texte, enRetard ? 'ko' : 'ok');

    afficherArbitrages(res); // pistes d'ajustement si dépassement (heure de fin manuelle)

    // On recharge tout : planning + réglages (l'heure de fin auto a pu changer).
    await rechargerEtRendre({ reglages: true, selectCats: true });
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteBouton;
  }
}

/**
 * ÉTAPE 3 — bouton « Recalculer les horaires » (régénération NON destructive).
 * Recalcule seulement les heures en gardant poules ET scores. On ne l'affiche QUE quand
 * c'est à la fois utile (des réglages ont changé depuis la génération) et légitime :
 * un planning existe, l'après-midi n'est pas encore généré, et la COMPOSITION n'a pas
 * bougé (sinon un vrai tirage est nécessaire → on l'affiche désactivé avec l'explication).
 */
function majBoutonRecalculer() {
  const btn = document.getElementById('bouton-recalculer-horaires');
  const aide = document.getElementById('aide-recalculer');
  if (!btn || !aide) return;

  const g = configCourante.global || {};
  const matin = (matchsCourants || []).filter(function (m) { return String(m.phase) !== 'classement'; });
  const aprem = (matchsCourants || []).filter(function (m) { return String(m.phase) === 'classement'; });

  function cacher() { btn.hidden = true; aide.hidden = true; }

  // Pas de planning, ou après-midi déjà générée → option non applicable.
  if (matin.length === 0 || aprem.length > 0) { cacher(); return; }

  // Y a-t-il quelque chose à recalculer ? (réglages modifiés depuis la génération)
  const sigStockee = g.signature_generation || '';
  const reglagesModifies = sigStockee &&
    signatureGeneration(g, configCourante.categories, equipesCourantes) !== sigStockee;
  if (!reglagesModifies) { cacher(); return; }

  // La composition a-t-elle changé ? (nouveau tirage nécessaire dans ce cas)
  const catsPresentes = (configCourante.categories || []).filter(estPresente)
    .map(function (c) { return String(c.categorie); });
  const nonPlacee = (equipesCourantes || []).some(function (e) {
    return catsPresentes.indexOf(String(e.categorie)) >= 0 && !String(e.poule || '').trim();
  });
  const sigStructStockee = g.signature_structure || '';
  const structureChangee = nonPlacee ||
    (sigStructStockee && signatureStructure(configCourante.categories, equipesCourantes) !== sigStructStockee);

  btn.hidden = false;
  aide.hidden = false;
  if (structureChangee) {
    btn.disabled = true;
    aide.innerHTML = '⚠️ La <strong>composition a changé</strong> (équipe ajoutée/retirée ou nombre de poules) : ' +
      'un nouveau tirage est nécessaire → utilise <strong>🎲 Générer</strong> (⚠️ efface les scores).';
  } else {
    btn.disabled = false;
    aide.innerHTML = '💡 Recalcule seulement les <strong>heures</strong> avec tes réglages actuels, ' +
      'en gardant les poules <strong>et les scores</strong> déjà saisis.';
  }
}

/** Recalcule les horaires sans nouveau tirage (garde poules + scores). */
async function onRecalculerHoraires() {
  if (!await dialogConfirmer(
      "Recalculer les horaires du matin ?\n\nMêmes poules, mêmes affrontements : seules les heures " +
      "(et terrains) changent. Les scores déjà saisis sont conservés.", { ok: 'Recalculer' })) return;

  const bouton = document.getElementById('bouton-recalculer-horaires');
  const message = document.getElementById('message-generation');
  const texteBouton = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Recalcul…';
  afficherMessage(message, 'Recalcul des horaires…', 'ok');

  try {
    const res = await ecrireAdmin('recalculerHoraires', {});
    const avert = res && res.avertissements && res.avertissements.length;
    let texte = '✅ Horaires recalculés (' + (res.nb_matchs != null ? res.nb_matchs : '?') + ' match(s)).';
    if (res.scores_conserves) texte += '\n💾 ' + res.scores_conserves + ' score(s) conservé(s).';
    if (res.heure_fin_matin) texte += '\n🌅 Fin du matin : ' + res.heure_fin_matin + '.';
    if (res.heure_fin_journee) texte += '\n🏁 Fin de la journée : ' + res.heure_fin_journee + '.';
    if (avert) texte += '\n⚠️ ' + res.avertissements.join('\n⚠️ ');
    afficherMessage(message, texte, avert ? 'ko' : 'ok');

    // On recharge tout (comme après une génération), sans toucher aux formulaires en cours.
    await rechargerEtRendre({ reglages: true, selectCats: true });
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteBouton;
    majBoutonRecalculer();
  }
}

/**
 * Les boutons de simulation ne s'activent que pour le scénario exact de la démo :
 * 24 équipes (12 U10 + 12 U12), 36 matchs le matin, puis 18 en CROISE l'après-midi.
 * Le serveur répète tous ces contrôles avant d'écrire.
 */
function majBoutonsScoresDemo() {
  const cleCat = function (v) { return String(v == null ? '' : v).trim().toUpperCase().replace(/^[MU](?=\d)/, ''); };
  const matin = (matchsCourants || []).filter(function (m) { return String(m.phase) !== 'classement'; });
  const aprem = (matchsCourants || []).filter(function (m) { return String(m.phase) === 'classement'; });
  const equipesU10 = (equipesCourantes || []).filter(function (e) { return cleCat(e.categorie) === '10'; });
  const equipesU12 = (equipesCourantes || []).filter(function (e) { return cleCat(e.categorie) === '12'; });
  const structureEquipes = equipesU10.length === 12 && equipesU12.length === 12 && equipesCourantes.length === 24;
  const boutonMatin = document.getElementById('bouton-simuler-scores-matin');
  const boutonAprem = document.getElementById('bouton-simuler-scores-apresmidi');
  if (boutonMatin) {
    boutonMatin.disabled = !(structureEquipes && matin.length === 36);
    boutonMatin.title = boutonMatin.disabled
      ? 'Disponible avec 12 équipes U10, 12 équipes U12 et les 36 matchs du matin.' : '';
  }
  if (boutonAprem) {
    boutonAprem.disabled = !(structureEquipes && aprem.length > 0);
    boutonAprem.title = boutonAprem.disabled
      ? 'Disponible avec 12 équipes U10, 12 équipes U12 et un classement croisé ou croisé diagonal généré.' : '';
  }
}

function libelleMatchManuelDemo(m) {
  function nom(id) {
    const e = (equipesCourantes || []).find(function (x) { return String(x.id_equipe) === String(id); });
    return e ? e.nom_equipe : id;
  }
  return m.categorie + ' — ' + nom(m.equipe_A) + ' ' + m.score_A + '–' + m.score_B + ' ' + nom(m.equipe_B);
}

async function onSimulerScoresDemo(phase) {
  const matin = phase === 'MATIN';
  const bouton = document.getElementById(matin ? 'bouton-simuler-scores-matin' : 'bouton-simuler-scores-apresmidi');
  const message = document.getElementById(matin ? 'message-simulation-matin' : 'message-simulation-apresmidi');
  const libelle = matin ? 'du matin' : 'de l’après-midi';
  if (!bouton || !await dialogConfirmer('Appliquer les scores de démonstration ' + libelle + ' ?\n\n' +
      'Les matchs prévus pour la saisie en direct resteront vides. Tous les scores simulés resteront corrigeables.',
      { ok: 'Appliquer' })) return;

  const texteBouton = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Application…';
  afficherMessage(message, 'Application du scénario de démonstration…', 'ok');
  try {
    const res = await ecrireAdmin('simulerScoresDemo', { phase: phase });
    const manuels = (res.matchs_manuels || []).map(libelleMatchManuelDemo);
    let texte = res.deja_applique
      ? '✅ Les scores automatiques étaient déjà en place.'
      : '✅ ' + res.nb_scores_appliques + ' score(s) appliqué(s).';
    if (manuels.length) texte += '\n🎯 À saisir pendant la démo :\n• ' + manuels.join('\n• ');
    texte += '\n✏️ Les scores enregistrés restent corrigeables depuis la table de marque.';
    afficherMessage(message, texte, 'ok');
    await rechargerEtRendre({ reglages: true });
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.textContent = texteBouton;
    majBoutonsScoresDemo();
  }
}

function onSimulerScoresMatin() { return onSimulerScoresDemo('MATIN'); }
function onSimulerScoresApresMidi() { return onSimulerScoresDemo('APRES_MIDI'); }

/**
 * Met à jour l'état de préparation de la phase après-midi et l'activation du bouton.
 * Le bouton n'est actif que si TOUS les scores du matin sont saisis (sinon la
 * génération échouerait côté serveur : on l'indique à l'avance plutôt qu'en erreur).
 */
function majApresMidi() {
  const etat = document.getElementById('etat-scores-matin');
  const bouton = document.getElementById('bouton-apresmidi');
  if (!etat || !bouton) return;

  // Matchs du matin = tout ce qui n'est pas la phase de classement (après-midi).
  const matin = (matchsCourants || []).filter(function (m) { return String(m.phase) !== 'classement'; });
  const total = matin.length;
  const saisis = matin.filter(function (m) { return estTermine(m.statut); }).length;
  if(etat.parentElement && etat.parentElement.classList){
    etat.parentElement.classList.toggle('cv-attention',total===0 || saisis<total);
    etat.parentElement.classList.toggle('cv-validation',total>0 && saisis===total);
  }

  // Le bandeau dit d'abord CE QUI MANQUE, puis pourquoi, puis où on en est.
  const sous = document.getElementById('cv-apresmidi-sous');
  const jauge = document.getElementById('cv-apresmidi-jauge');
  const icone = etat.parentElement && etat.parentElement.querySelector('.cv-bandeau-icone');
  const reste = total - saisis;
  if (total === 0) {
    etat.textContent = 'Le planning du matin n’est pas encore généré';
    if (sous) sous.textContent = 'Générez les poules et les horaires du matin avant de préparer l’après-midi.';
    if (jauge) jauge.innerHTML = '';
    if (icone) icone.textContent = '!';
    bouton.disabled = true;
  } else if (saisis === total) {
    etat.textContent = 'Tous les scores du matin sont saisis';
    if (sous) sous.textContent = 'Le planning de l’après-midi peut être généré.';
    if (icone) icone.textContent = '✓';
    bouton.disabled = false;
  } else {
    etat.textContent = reste + ' score' + (reste > 1 ? 's' : '') + ' du matin reste' + (reste > 1 ? 'nt' : '') + ' à saisir';
    if (sous) sous.textContent = 'La génération du planning de l’après-midi sera disponible lorsque tous les ' +
      'scores du matin auront été saisis.';
    if (icone) icone.textContent = '!';
    bouton.disabled = true;
  }
  if (jauge && total > 0) {
    const pct = Math.round(saisis / total * 100);
    jauge.innerHTML = '<span class="cv-bandeau-compte">' + saisis + ' / ' + total + '</span>' +
      jaugeHTML(saisis, total, pct, 'Scores du matin saisis : ' + saisis + ' sur ' + total);
  }
  majBoutonsScoresDemo();
  majDimancheScf(); // le bouton « dimanche » (Super Challenge Phase 3) suit le même cycle de vie
  const apercu=document.getElementById('cv-apresmidi-apercu');
  if(apercu){
    apercu.innerHTML=apercuApresMidiCiel(matin,configCourante.categories||[]);
    // ⭐ Le bouton de génération REJOINT la carte du format, sous la description de ce qu'il
    //    produit. C'est le nœud d'origine qu'on déplace : son écouteur et son état désactivé
    //    le suivent. La réécriture ci-dessus l'a détaché, la référence l'a gardé vivant.
    const place=apercu.querySelector('[data-role="place-bouton-apresmidi"]');
    if(place)place.appendChild(bouton);
  }
}

/**
 * UNE jauge, une seule définition : la barre et son pourcentage, côte à côte.
 * ⭐ Le pourcentage est ÉCRIT à côté de la barre — une barre seule ne se lit qu'à l'œil, et à
 *    8 px de haut sur un fond clair elle ne dit rien de précis. Le nom accessible porte le
 *    compte réel (« 3 sur 12 »), pas le seul pourcentage.
 */
function jaugeHTML(valeur, total, pct, etiquette) {
  return '<span class="cv-jauge">' +
    '<progress max="' + total + '" value="' + valeur + '" aria-label="' + echapper(etiquette) + '"></progress>' +
    '<span class="cv-jauge-pct">' + pct + ' %</span></span>';
}

/**
 * Lecture des scores et formats existants, sans nouvelle règle de génération.
 * ⛔ Cet aperçu ne calcule RIEN : il lit les scores déjà enregistrés et les formats déjà réglés.
 * Le raccourci « Voir les matchs à compléter » ouvre le planning SUR la catégorie concernée ;
 * « Ouvrir la table de marque » conduit à l'écran Publication, seule source du lien à jeton.
 */
function apercuApresMidiCiel(matin,categories) {
  const noms=Array.from(new Set(matin.map(m=>m.categorie)));
  const scores=noms.map(nom=>{
    const matches=matin.filter(m=>m.categorie===nom),faits=matches.filter(m=>estTermine(m.statut)).length;
    const complet=matches.length>0&&faits===matches.length;
    const pct=matches.length?Math.round(faits/matches.length*100):0;
    return '<div class="cv-score-categorie'+(complet?' est-complet':'')+'"><strong>'+echapper(nom)+'</strong>'+
      '<span class="cv-score-compte">'+faits+' / '+matches.length+'</span>'+
      (complet?'<span class="cv-score-fait">Complet</span>'
              :'<button type="button" class="bouton-lien cv-score-lien" data-cv-matchs="'+echapper(nom)+'">'+
               'Voir les matchs à compléter <span aria-hidden="true">→</span></button>')+
      jaugeHTML(faits,matches.length,pct,'Scores saisis '+nom+' : '+faits+' sur '+matches.length)+
      '</div>';
  }).join('');
  const formats=categories.filter(c=>noms.includes(c.categorie)).map(c=>{
    const f=definitionFormatApresMidi(formatApresMidiDe(c));
    return '<div class="cv-format-resume"><span class="cv-pastille cv-neutre">'+echapper(c.categorie)+'</span><h3>'+echapper(f?f.titre:'Format à définir')+'</h3><p>'+echapper(f?f.desc:'Consultez les réglages de cette catégorie.')+'</p></div>';
  }).join('');
  return '<section><h2>Scores par catégorie</h2>'+
    (scores||'<p class="vide">Le planning du matin n’est pas encore généré.</p>')+
    '</section><section><h2>Format prévu</h2>'+
    (formats||'<p class="vide">Aucune catégorie au planning du matin.</p>')+
    '<div class="cv-apresmidi-actions" data-role="place-bouton-apresmidi">'+
      '<button type="button" class="bouton" data-cv-publication>Ouvrir la table de marque</button>'+
    '</div>'+
    '<p class="cv-apresmidi-note">Tous les scores du matin doivent être saisis pour générer le planning de l’après-midi.</p>'+
    '<button type="button" class="bouton-lien" data-cv-categories>Modifier les formats dans Catégories</button></section>';
}

/**
 * Super Challenge Phase 3 — révèle et pilote le bouton « Générer le dimanche (brassage) ».
 * Le bloc reste MASQUÉ tant qu'aucune catégorie U14 n'est en contexte Super Challenge Phase 3
 * (il n'a de sens que là). Quand il l'est, le bouton n'est actif que si TOUS les scores du samedi
 * (matchs de poule de ces catégories) sont saisis — sinon la génération échouerait côté serveur.
 */
function majDimancheScf() {
  const bloc = document.getElementById('bloc-dimanche-scf');
  const bouton = document.getElementById('bouton-dimanche-scf');
  const etat = document.getElementById('etat-samedi-scf');
  if (!bloc || !bouton) return;

  // Catégories U14 en Super Challenge Phase 3 (helpers définis dans admin.js).
  const cats = (configCourante.categories || []).filter(function (c) {
    return contexteTournoiDe(c) === 'SCF' && scfPhaseDe(c) === 'P3';
  }).map(function (c) { return c.categorie; });

  if (!cats.length) { bloc.hidden = true; return; } // pas de Phase 3 → bloc caché
  bloc.hidden = false;

  // Samedi = matchs de poule (triangulaires) de ces catégories.
  const samedi = (matchsCourants || []).filter(function (m) {
    return cats.indexOf(m.categorie) >= 0 && String(m.phase) !== 'classement';
  });
  const total = samedi.length;
  const saisis = samedi.filter(function (m) { return estTermine(m.statut); }).length;

  if (total === 0) {
    if (etat) etat.textContent = '⚪️ Génère d\'abord les poules (samedi) via « Générer les poules ».';
    bouton.disabled = true;
  } else if (saisis === total) {
    if (etat) etat.textContent = '✅ ' + saisis + '/' + total + ' saisis — prêt à générer le dimanche.';
    bouton.disabled = false;
  } else {
    if (etat) etat.textContent = '⏳ ' + saisis + '/' + total +
      ' saisis — complète tous les scores du samedi (page Saisie) avant de générer.';
    bouton.disabled = true;
  }
}

/** Génère le brassage du dimanche (Super Challenge Phase 3) à partir du classement du samedi. */
async function onGenererDimancheScf() {
  if (!await dialogConfirmer('Générer le brassage du dimanche (Super Challenge Phase 3) ?\n\n' +
               'Basé sur le classement du samedi. N\'efface PAS les triangulaires du samedi.', { ok: 'Générer' })) return;

  const bouton  = document.getElementById('bouton-dimanche-scf');
  const message = document.getElementById('message-dimanche-scf');
  const texteBouton = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Génération…';
  afficherMessage(message, 'Génération du dimanche…', 'ok');

  try {
    const res = await ecrireAdmin('genererDimancheScf', {});
    const nbM = (res && res.nb_matchs_dimanche != null) ? res.nb_matchs_dimanche : '?';
    const avert = res && res.avertissements && res.avertissements.length;
    let texte = '✅ ' + nbM + ' match(s) du dimanche générés.' +
                (res.heure_fin_dimanche ? ' Fin : ' + res.heure_fin_dimanche + '.' : '');
    if (avert) texte += '\n⚠️ ' + res.avertissements.join('\n⚠️ ');
    afficherMessage(message, texte, avert ? 'ko' : 'ok');
    await rechargerEtRendre({ reglages: true });
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteBouton;
  }
}

/** Génère la phase après-midi (classement croisé) à partir du classement du matin. */
async function onGenererApresMidi() {
  if (!await dialogConfirmer("Générer les matchs de l'après-midi (classement croisé) ?\n\n" +
               "Basé sur le classement du matin. N'efface PAS les matchs du matin.", { ok: 'Générer' })) return;

  const bouton  = document.getElementById('bouton-apresmidi');
  const message = document.getElementById('message-apresmidi');
  const texteBouton = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Génération…';
  afficherMessage(message, "Génération de l'après-midi…", 'ok');

  try {
    const res = await ecrireAdmin('genererApresMidi', {});
    const nbM = (res && res.nb_matchs_aprem != null) ? res.nb_matchs_aprem : '?';
    const avert = res && res.avertissements && res.avertissements.length;
    let texte = '✅ ' + nbM + " match(s) d'après-midi générés." +
                (res.heure_fin_aprem ? ' Fin : ' + res.heure_fin_aprem + '.' : '');
    if (res.heure_fin_journee) texte += '\n🏁 Fin de la journée : ' + res.heure_fin_journee + '.';
    if (avert) texte += '\n⚠️ ' + res.avertissements.join('\n⚠️ ');
    afficherMessage(message, texte, avert ? 'ko' : 'ok');

    // On recharge le planning (matin + après-midi) ET les réglages (l'heure de fin auto a changé).
    await rechargerEtRendre({ reglages: true });
  } catch (erreur) {
    // Les garde-fous backend (scores du matin incomplets…) arrivent ici.
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteBouton;
  }
}

/**
 * Affiche les pistes d'ajustement (arbitrages) quand le planning dépasse l'heure de fin manuelle.
 * Chaque piste est un bouton : un clic applique le réglage et régénère.
 */
function afficherArbitrages(res) {
  const zone = document.getElementById('arbitrages');
  if (!res || !res.suggestions || !res.suggestions.length) { zone.innerHTML = ''; return; }

  // L'intro diffère selon la cause :
  //   'matin'   → le matin déborde sur la pause déjeuner (contrainte dure) ;
  //   'forcage' → un forçage du nombre de poules rallonge la journée (heure de fin auto) ;
  //   'fin'     → l'heure de fin manuelle est dépassée.
  let intro;
  if (res.arbitrage_cause === 'matin') {
    intro = 'Le matin (poules) finit à <strong>' + echapper(res.heure_fin_matin) +
      '</strong>, après le début de la pause déjeuner (' + echapper(res.pause_debut) + ').<br>' +
      'Pistes pour finir le matin avant la pause <span class="arb-note">— clique pour appliquer</span> :';
  } else if (res.heure_fin_auto) {
    intro = 'Le planning finit à <strong>' + echapper(res.heure_fin_projetee) +
      '</strong> — un forçage du nombre de poules rallonge la journée.<br>' +
      'Pistes pour raccourcir <span class="arb-note">— clique pour appliquer</span> :';
  } else {
    intro = 'Le planning finit à <strong>' + echapper(res.heure_fin_projetee) +
      '</strong>, après ton heure de fin (' + echapper(res.heure_fin) + ').<br>' +
      'Pistes pour tenir le créneau <span class="arb-note">— clique pour appliquer</span> :';
  }

  let html = '<div class="arbitrages">' +
    '<p class="arb-titre">' + intro + '</p>' +
    '<ul class="arb-liste">';

  res.suggestions.forEach(function (s) {
    const m = s.modif || {};
    html += '<li>' +
      '<button type="button" class="arb-item' + (s.tient ? ' tient' : '') + '"' +
        ' data-type="' + echapper(m.type || '') + '"' +
        ' data-categorie="' + echapper(m.categorie || '') + '"' +
        ' data-champ="' + echapper(m.champ || '') + '"' +
        ' data-valeur="' + echapper(m.valeur || '') + '">' +
        echapper(s.piste) +
        ' <span class="arb-fin">→ ' + echapper(s.heure_fin) + ' (−' + s.gain_min + ' min)' +
        (s.tient ? ' ✅' : '') + '</span>' +
      '</button></li>';
  });
  html += '</ul></div>';
  zone.innerHTML = html;

}

/** Clic sur une piste d'arbitrage : applique le réglage puis régénère. */
async function onClicArbitrage(evenement) {
  const bouton = evenement.target.closest('.arb-item');
  if (!bouton) return;

  const type = bouton.getAttribute('data-type');
  const champ = bouton.getAttribute('data-champ');
  const valeur = bouton.getAttribute('data-valeur');
  const categorie = bouton.getAttribute('data-categorie');
  const message = document.getElementById('message-generation');

  if (!await dialogConfirmer('Appliquer cet ajustement puis régénérer le planning ?', { ok: 'Appliquer' })) return;

  bouton.disabled = true;
  try {
    if (type === 'global') {
      const data = {};
      data[champ] = valeur;
      await ecrireAdmin('enregistrerHoraires', data);
    } else if (type === 'categorie') {
      const cat = configCourante.categories.find(function (c) { return c.categorie === categorie; });
      const maj = Object.assign({}, cat);
      maj[champ] = valeur;
      await ecrireAdmin('enregistrerCategorie', maj);
    }
    await genererMaintenant(); // régénère avec le nouveau réglage
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    bouton.disabled = false;
  }
}

/* ⭐ L'ÉTAT DE L'ÉCRAN « Poules & planning » VIT DANS LE MODULE, jamais dans le DOM.
   `afficherPlanning()` réécrit sa zone en entier à chaque rendu — rechargement des matchs,
   enregistrement des poules, scores de démonstration. Un onglet actif ou une fiche ouverte
   repérés dans le DOM disparaîtraient au premier de ces rafraîchissements, sous les doigts
   de l'organisateur. Ils vivent donc ici, et le rendu les REPRODUIT. */
let planningCategorie = '';        // catégorie affichée ('' = la première de la liste)
let planningPhase = 'matin';       // 'matin' (poules) | 'aprem' (classement)
let planningMatch = '';            // id_match dont la fiche est ouverte ('' = aucune)
/* Les dernières données peintes. ⛔ Les écouteurs de la zone ne les capturent PAS dans une
   fermeture : un clic sur un onglet rejouerait alors le rendu avec les poules d'il y a dix
   minutes. Ils relisent ces deux variables, que seul `afficherPlanning()` écrit. */
let planningPoules = [];
let planningMatchs = [];

/** Repeint le planning avec les dernières données connues (après un changement d'onglet, un
 *  choix de match, ou une arrivée depuis un autre écran). */
function rafraichirPlanning() { afficherPlanning(planningPoules, planningMatchs); }

/** Choisit la catégorie affichée. Rendu par l'appelant : cette fonction ne peint rien. */
function activerCategoriePlanning(cat) { planningCategorie = String(cat || ''); planningMatch = ''; }
/** Choisit le moment de la journée. Change de vue → la fiche ouverte n'a plus lieu d'être. */
function activerPhasePlanning(phase) { planningPhase = phase === 'aprem' ? 'aprem' : 'matin'; planningMatch = ''; }

/**
 * Nom du GRAND terrain qui porte ce terrain de jeu, d'après `repartition_grands_terrains`
 * (écrit par l'application de la répartition, écran Terrains).
 * ⛔ Renvoie '' quand on ne sait pas : la colonne n'affiche alors que « Terrain 3 », jamais un
 *    nom deviné. Le mot « Terrain » du nom de fiche est retiré — il est déjà dans l'en-tête.
 */
function grandTerrainDe(terrain) {
  let rep = {};
  try { rep = JSON.parse((configCourante.global || {}).repartition_grands_terrains || '{}') || {}; }
  catch (e) { return ''; }
  const nom = Object.keys(rep).find(function (k) {
    return Array.isArray(rep[k]) && rep[k].some(function (id) { return String(id) === String(terrain); });
  });
  return nom ? String(nom).replace(/^terrains?\s+(de\s+|du\s+|des\s+|d’|d')?/i, '') : '';
}

/** Monogramme d'une équipe : les données ne portent AUCUN logo de club, l'écusson est une initiale. */
function monogrammeEquipe(nom) {
  const mots = String(nom || '').trim().split(/[\s\-–]+/).filter(Boolean);
  if (!mots.length) return '?';
  if (mots.length === 1) return mots[0].slice(0, 3).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

/** Nom d'une équipe à partir de son identifiant (repli : l'identifiant lui-même). */
function nomEquipePlanning(id) {
  const e = (equipesCourantes || []).find(function (x) { return x.id_equipe === id; });
  return e ? e.nom_equipe : id;
}

/** Libellé de poule d'un match, vocabulaire Super Challenge et poules de niveau compris. */
function libellePoulePlanning(m, catObj, aprem, nbNiv) {
  const estScfCat = ctxScf(catObj).estScf;
  if (estScfCat && aprem) return 'Poule ' + pouleEFG(m.poule);
  if (estScfCat) return groupeLabelScf(catObj, m.poule, 0, false) || ('Groupe ' + m.poule);
  if (aprem && catObj && formatApresMidiDe(catObj) === 'POULES_NIVEAU') {
    return libellePouleNiveau(catObj, m.poule, nbNiv) || ('Poule ' + m.poule);
  }
  if (aprem) return 'Niveau ' + m.poule;
  return 'Poule ' + m.poule;
}

/** Une barre d'onglets : [{cle, libelle, actif, attribut}] → boutons role=tab. */
function ongletsPlanning(items, attribut, etiquette) {
  return '<div class="cv-onglets cv-onglets-planning" role="tablist" aria-label="' + echapper(etiquette) + '">' +
    items.map(function (it) {
      return '<button type="button" class="cv-onglet' + (it.actif ? ' est-actif' : '') + '" role="tab"' +
        ' aria-selected="' + (it.actif ? 'true' : 'false') + '" tabindex="' + (it.actif ? '0' : '-1') + '"' +
        ' ' + attribut + '="' + echapper(it.cle) + '">' + echapper(it.libelle) + '</button>';
    }).join('') + '</div>';
}

/**
 * La grille du planning : une ligne par heure, une colonne par terrain, un bouton par match.
 * ⛔ AUCUN champ de saisie : les scores s'enregistrent à la table de marque, cet écran les LIT.
 */
function grillePlanning(liste, catObj, aprem, nbNiv) {
  if (!liste.length) return '';
  const terrains = Array.from(new Set(liste.map(function (m) { return String(m.terrain); })))
    .sort(function (a, b) { return a.localeCompare(b, 'fr', { numeric: true }); });
  const heures = Array.from(new Set(liste.map(function (m) { return String(m.heure_debut); }))).sort();
  let h = '<div class="table-scroll cv-planning-scroll"><table class="table-planning cv-planning-grille">' +
          '<thead><tr><th scope="col">Heure</th>';
  terrains.forEach(function (t) {
    const grand = grandTerrainDe(t);
    h += '<th scope="col"><span class="cv-col-terrain">Terrain ' + echapper(t) + '</span>' +
         (grand ? '<span class="cv-col-grand">' + echapper(grand) + '</span>' : '') + '</th>';
  });
  h += '</tr></thead><tbody>';
  heures.forEach(function (heure) {
    h += '<tr><th scope="row">' + echapper(heure) + '</th>';
    terrains.forEach(function (terrain) {
      const rencontres = liste.filter(function (m) {
        return String(m.heure_debut) === heure && String(m.terrain) === terrain;
      });
      h += '<td>' + rencontres.map(function (m) {
        const a = nomEquipePlanning(m.equipe_A), b = nomEquipePlanning(m.equipe_B);
        const arb = libelleArbitreScf(m, nomEquipePlanning);
        const ouvert = String(m.id_match) === String(planningMatch);
        // ⛔ Un nom accessible d'un seul tenant (« CLAMARTVÉLIZY ») ne se lit pas : on le pose.
        const lu = a + ' contre ' + b + ', ' + heure + ', terrain ' + terrain + ', ' +
                   libellePoulePlanning(m, catObj, aprem, nbNiv);
        return '<button type="button" class="cv-match' + (ouvert ? ' est-ouvert' : '') + '"' +
               ' data-match="' + echapper(String(m.id_match)) + '"' +
               ' aria-pressed="' + (ouvert ? 'true' : 'false') + '"' +
               ' aria-label="' + echapper(lu) + '">' +
               '<span class="cv-match-equipes"><strong>' + echapper(a) + '</strong>' +
               '<span class="cv-match-vs" aria-hidden="true">–</span>' +
               '<strong>' + echapper(b) + '</strong></span>' +
               (estTermine(m.statut) ? '<span class="cv-match-score">' + echapper(String(m.score_A)) + ' – ' +
                 echapper(String(m.score_B)) + '</span>' : '') +
               (arb ? '<small>Arbitre : ' + echapper(arb) + '</small>' : '') +
               '</button>';
      }).join('') + (rencontres.length ? '' : '<span class="cv-case-libre">—</span>') + '</td>';
    });
    h += '</tr>';
  });
  return h + '</tbody></table></div>';
}

/**
 * La fiche « Détail du match ». ⛔ LECTURE SEULE : le score s'y LIT, il ne s'y saisit pas — la
 * table de marque reste le seul chemin d'écriture, et cet écran le rappelle plutôt que d'ouvrir
 * un second chemin d'enregistrement.
 */
function ficheMatchPlanning(m, catObj, aprem, nbNiv) {
  if (!m) {
    return '<aside class="cv-fiche-match est-vide" data-role="fiche-match" aria-label="Détail du match">' +
           '<strong>Détail du match</strong><p>Choisissez un match dans le planning pour voir ses équipes, ' +
           'sa poule et son score.</p></aside>';
  }
  const a = nomEquipePlanning(m.equipe_A), b = nomEquipePlanning(m.equipe_B);
  const grand = grandTerrainDe(m.terrain);
  const termine = estTermine(m.statut);
  const ligne = function (cle, valeur) {
    return '<div class="cv-fiche-ligne"><span class="cv-fiche-cle">' + echapper(cle) + '</span>' +
           '<span class="cv-fiche-valeur">' + valeur + '</span></div>';
  };
  let h = '<aside class="cv-fiche-match" data-role="fiche-match" aria-label="Détail du match">' +
          '<div class="cv-fiche-tete"><strong>Détail du match</strong>' +
          '<button type="button" class="cv-fiche-fermer" data-fermer-match aria-label="Fermer le détail du match">×</button></div>';
  h += ligne('Heure', echapper(String(m.heure_debut || '—')) +
       (m.heure_fin ? ' <span class="cv-fiche-fin">→ ' + echapper(String(m.heure_fin)) + '</span>' : ''));
  h += ligne('Terrain', 'Terrain ' + echapper(String(m.terrain)) + (grand ? ' — ' + echapper(grand) : ''));
  h += ligne('Catégorie', echapper(String(m.categorie)));
  h += ligne('Phase', echapper((aprem ? 'Après-midi' : 'Matin') + ' · ' + libellePoulePlanning(m, catObj, aprem, nbNiv)));
  const arb = libelleArbitreScf(m, nomEquipePlanning);
  if (arb) h += ligne('Arbitre', echapper(arb));
  h += '<div class="cv-fiche-equipes"><div class="cv-fiche-equipe">' +
       '<span class="cv-ecusson" aria-hidden="true">' + echapper(monogrammeEquipe(a)) + '</span>' +
       '<span class="cv-fiche-nom">' + echapper(a) + '</span></div>' +
       '<span class="cv-fiche-vs">contre</span>' +
       '<div class="cv-fiche-equipe">' +
       '<span class="cv-ecusson" aria-hidden="true">' + echapper(monogrammeEquipe(b)) + '</span>' +
       '<span class="cv-fiche-nom">' + echapper(b) + '</span></div></div>';
  h += '<div class="cv-fiche-score' + (termine ? '' : ' est-attente') + '">' +
       '<span class="cv-fiche-cle">Score</span>' +
       (termine
         ? '<span class="cv-score-valeur">' + echapper(String(m.score_A)) + '</span>' +
           '<span class="cv-score-tiret" aria-hidden="true">–</span>' +
           '<span class="cv-score-valeur">' + echapper(String(m.score_B)) + '</span>'
         : '<span class="cv-score-attente">Pas encore saisi</span>') + '</div>';
  h += '<p class="cv-fiche-note">Les scores se saisissent à la table de marque.</p>';
  return h + '</aside>';
}

/** La composition des poules d'UNE catégorie, en cartes. */
function compositionsPoules(poules, cat, catObj) {
  const liste = poules.filter(function (p) { return p.categorie === cat; });
  if (!liste.length) return '<p class="vide">Pas encore de poules pour cette catégorie.</p>';
  return '<div class="cv-compositions-poules">' + liste.map(function (p) {
    const membres = (equipesCourantes || [])
      .filter(function (e) { return e.categorie === cat && e.poule === p.nom_poule; })
      .map(function (e) { return e.nom_equipe; });
    const gl = groupeLabelScf(catObj, p.nom_poule, membres.length, false);
    const titre = gl ? gl : ('Poule ' + p.nom_poule);
    return '<div class="poule-compo"><strong>' + echapper(titre) + '</strong>' +
      (membres.length
        ? '<ul>' + membres.map(function (n) { return '<li>' + echapper(n) + '</li>'; }).join('') + '</ul>'
        : '<p class="vide">Aucune équipe.</p>') + '</div>';
  }).join('') + '</div>';
}

/**
 * Affiche le planning : une barre d'onglets (catégorie, puis moment de la journée), la grille
 * du moment choisi, la fiche du match ouvert, et sous le tout la composition des poules.
 * ⭐ L'ordre du DOM est l'ordre de lecture : la composition est ÉCRITE après la grille, elle
 *    n'y est plus ramenée par un `order:2` en CSS (WCAG 2.4.3).
 */
function afficherPlanning(poules, matchs) {
  const zone = document.getElementById('affichage-planning');
  poules = poules || [];
  matchs = matchs || [];
  planningPoules = poules; planningMatchs = matchs;

  // Les deux boutons d'action vivent dans le HTML d'origine : on les DÉPLACE dans la barre à
  // chaque rendu (la zone est réécrite), jamais on ne les recrée — leurs écouteurs survivent.
  const btnMod = document.getElementById('bouton-modifier-poules');
  const btnGen = document.getElementById('bouton-generer');
  if (btnMod && !editionPoules) btnMod.hidden = poules.length === 0;

  if (poules.length === 0 && matchs.length === 0) {
    zone.innerHTML = '<div class="cv-planning-vide"><strong>Pas encore de planning</strong>' +
      '<p>Générez les poules et les horaires pour voir les rencontres du matin.</p></div>';
    if (btnGen && zone.appendChild) zone.appendChild(btnGen);
    return;
  }

  // Catégories concernées, dans l'ordre où elles apparaissent.
  const cats = [];
  poules.forEach(function (p) { if (cats.indexOf(p.categorie) < 0) cats.push(p.categorie); });
  matchs.forEach(function (m) { if (cats.indexOf(m.categorie) < 0) cats.push(m.categorie); });
  // L'onglet mémorisé n'existe plus (catégorie retirée) → on retombe sur la première.
  if (cats.indexOf(planningCategorie) < 0) planningCategorie = cats[0] || '';
  const cat = planningCategorie;

  const ms = matchs.filter(function (m) { return m.categorie === cat; });
  const matin = ms.filter(function (m) { return String(m.phase) !== 'classement'; });
  const aprem = ms.filter(function (m) { return String(m.phase) === 'classement'; });
  // Un moment sans aucun match ne peut pas être affiché : on revient au matin.
  if (planningPhase === 'aprem' && !aprem.length) planningPhase = 'matin';
  const estAprem = planningPhase === 'aprem';
  const liste = estAprem ? aprem : matin;

  const catObj = (configCourante.categories || []).find(function (c) { return c.categorie === cat; });
  const nbNiv = estAprem && catObj && formatApresMidiDe(catObj) === 'POULES_NIVEAU'
    ? nbPoulesNiveauCat(aprem, cat) : 0;
  const saisis = liste.filter(function (m) { return estTermine(m.statut); }).length;

  let html = '<div class="cv-planning-barre">' +
    ongletsPlanning(cats.map(function (c) {
      return { cle: c, libelle: c, actif: c === cat };
    }), 'data-plan-cat', 'Catégorie') +
    ongletsPlanning([{ cle: 'matin', libelle: 'Matin', actif: !estAprem }]
      .concat(aprem.length ? [{ cle: 'aprem', libelle: 'Après-midi', actif: estAprem }] : []),
      'data-plan-phase', 'Moment de la journée') +
    '<div class="cv-planning-actions"><span class="cv-planning-compte' +
      (liste.length && saisis === liste.length ? ' est-complet' : '') + '" data-role="compte-planning">' +
      liste.length + ' match' + (liste.length > 1 ? 's' : '') + ' · ' +
      saisis + ' score' + (saisis > 1 ? 's' : '') + ' saisi' + (saisis > 1 ? 's' : '') +
    '</span></div></div>';

  const titre = estAprem ? 'Planning de l’après-midi' : 'Planning du matin';
  html += '<div class="cv-planning-corps"><div class="cv-planning-principal">' +
          '<h3 class="cv-planning-titre">' + titre + '</h3>' +
          (liste.length ? grillePlanning(liste, catObj, estAprem, nbNiv)
                        : '<p class="vide">Aucun match sur ce moment de la journée.</p>') +
          '</div>';
  const ouvert = liste.find(function (m) { return String(m.id_match) === String(planningMatch); });
  if (!ouvert) planningMatch = '';
  html += ficheMatchPlanning(ouvert, catObj, estAprem, nbNiv) + '</div>';

  html += '<section class="cv-poules-section"><h3 class="cv-planning-titre">Composition des poules ' +
          echapper(cat) + '</h3>' + compositionsPoules(poules, cat, catObj);
  // Toutes les catégories d'un coup : le filtre n'en montre qu'une, ce dépliant montre le reste.
  if (cats.length > 1) {
    html += '<details class="cv-toutes-poules"><summary>Voir toutes les équipes et les poules</summary>' +
      cats.map(function (c) {
        const co = (configCourante.categories || []).find(function (x) { return x.categorie === c; });
        return '<h4>' + echapper(c) + '</h4>' + compositionsPoules(poules, c, co);
      }).join('') + '</details>';
  }
  html += '</section>';

  zone.innerHTML = html;

  // Les boutons d'origine rejoignent la barre (ils y ont été détruits par la réécriture ci-dessus,
  // mais le NŒUD tenu par `btnMod`/`btnGen` a survécu : on le rattache, écouteurs compris).
  const actions = zone.querySelector && zone.querySelector('.cv-planning-actions');
  if (actions) {
    if (btnMod) { btnMod.textContent = 'Modifier les poules à la main'; actions.appendChild(btnMod); }
    // ⛔ Ce bouton EFFACE poules, matchs et scores : il reste SECONDAIRE à côté de « Modifier les
    //    poules à la main », qui est le geste courant. Sa confirmation (et le second verrou par clé
    //    admin dès qu'un score existe) est portée par onGenerer(), elle n'est pas touchée ici.
    if (btnGen) {
      btnGen.textContent = 'Générer les poules automatiquement';
      btnGen.classList.add('bouton-doux');
      actions.appendChild(btnGen);
    }
  }

  // Écouteurs posés en PROPRIÉTÉ (pas addEventListener) : `afficherPlanning` est rappelée à
  // chaque rechargement, un ajout les empilerait.
  zone.onclick = function (e) {
    const onglet = e.target.closest && e.target.closest('[data-plan-cat],[data-plan-phase]');
    if (onglet) {
      if (onglet.hasAttribute('data-plan-cat')) activerCategoriePlanning(onglet.getAttribute('data-plan-cat'));
      else activerPhasePlanning(onglet.getAttribute('data-plan-phase'));
      rafraichirPlanning();
      const repeint = zone.querySelector('[aria-selected="true"][' +
        (onglet.hasAttribute('data-plan-cat') ? 'data-plan-cat' : 'data-plan-phase') + ']');
      if (repeint) repeint.focus();
      return;
    }
    if (e.target.closest && e.target.closest('[data-fermer-match]')) {
      planningMatch = ''; rafraichirPlanning(); return;
    }
    const match = e.target.closest && e.target.closest('[data-match]');
    if (match) {
      const id = match.getAttribute('data-match');
      planningMatch = String(planningMatch) === String(id) ? '' : id;   // second clic : on referme
      rafraichirPlanning();
    }
  };
  // Flèches, Début et Fin dans les barres d'onglets (WAI-ARIA « tabs »).
  zone.onkeydown = function (e) {
    const onglet = e.target.closest && e.target.closest('[data-plan-cat],[data-plan-phase]');
    const pas = { ArrowRight: 1, ArrowLeft: -1, Home: 'debut', End: 'fin' }[e.key];
    if (!onglet || pas === undefined) return;
    const freres = Array.from(onglet.parentNode.children);
    const i = freres.indexOf(onglet);
    const cible = pas === 'debut' ? freres[0] : pas === 'fin' ? freres[freres.length - 1]
                : freres[(i + pas + freres.length) % freres.length];
    e.preventDefault();
    cible.click();
  };
}

/** Petit badge « X/Y saisis » (vert si complet) pour le suivi de l'avancement des scores. */
function badgeAvancement(saisis, total) {
  if (!total) return '';
  const complet = saisis === total;
  return ' <span class="avancement ' + (complet ? 'avc-complet' : 'avc-partiel') + '">' +
         saisis + '/' + total + ' saisis' + (complet ? ' ✅' : '') + '</span>';
}

/* --------------------------------------------------------------------------
   MODIFICATION MANUELLE DES POULES DU MATIN
   (rééquilibrer les niveaux avant de jouer ; recalcule les matchs côté backend)
   -------------------------------------------------------------------------- */

/** Tri des catégories par nombre (U8 < U10 < U12), sinon alphabétique. */
/* comparerCat() est désormais comparerCategorie() dans commun.js. */

/** Nom lisible d'une équipe (pour l'éditeur de poules). */
function nomEquipeAdmin(id) {
  const e = equipesCourantes.find(function (x) { return x.id_equipe === id; });
  return e ? e.nom_equipe : id;
}

/** Construit le modèle d'édition à partir des poules actuelles (équipes groupées par cat./poule). */
function construireModelePoules() {
  const parCat = {};
  equipesCourantes.forEach(function (e) {
    if (!e.poule) return; // équipe non affectée (pas de planning) → ignorée
    const cat = e.categorie || '?';
    if (!parCat[cat]) parCat[cat] = { pools: {}, bench: [] };
    if (!parCat[cat].pools[e.poule]) parCat[cat].pools[e.poule] = [];
    parCat[cat].pools[e.poule].push(e.id_equipe);
  });
  return parCat;
}

/** Reconstruit la liste des poules (pour l'affichage) à partir des équipes en mémoire. */
function poulesDepuisEquipes() {
  const vues = {}, liste = [];
  equipesCourantes.forEach(function (e) {
    if (!e.poule) return;
    const cle = (e.categorie || '?') + '|' + e.poule;
    if (!vues[cle]) { vues[cle] = true; liste.push({ categorie: e.categorie, nom_poule: e.poule }); }
  });
  return liste;
}

/** Entre en mode « modifier les poules » (refusé si des scores du matin sont saisis). */
function onModifierPoules() {
  const message = document.getElementById('message-generation');
  const scoresMatin = (matchsCourants || []).filter(function (m) {
    return String(m.phase) !== 'classement' && estTermine(m.statut);
  }).length;
  if (scoresMatin > 0) {
    afficherMessage(message, '⚠️ Impossible : ' + scoresMatin + ' score(s) du matin déjà saisis. ' +
      'On ne peut plus réorganiser les poules une fois les matchs commencés.', 'ko');
    return;
  }
  editionPoules = construireModelePoules();
  document.getElementById('bouton-modifier-poules').hidden = true;
  document.getElementById('affichage-planning').innerHTML = ''; // remplacé par l'éditeur
  afficherEditionPoules();
}

/** Affiche l'éditeur de poules (cartes de poules + zone « à replacer » + équilibre). */
function afficherEditionPoules() {
  const zone = document.getElementById('edition-poules');
  let html = '<div class="edit-poules"><h3 class="edit-titre">✏️ Modifier les poules du matin</h3>' +
    '<p class="note-generation">Clique sur ✕ pour sortir une équipe, puis réaffecte-la à une poule. ' +
    'L\'équilibre du nombre d\'équipes par poule est indiqué. En validant, les matchs du matin sont recalculés.</p>';

  Object.keys(editionPoules).sort(comparerCategorie).forEach(function (cat) {
    const modele = editionPoules[cat];
    const noms = Object.keys(modele.pools).sort();
    const tailles = noms.map(function (n) { return modele.pools[n].length; });
    const min = tailles.length ? Math.min.apply(null, tailles) : 0;
    const max = tailles.length ? Math.max.apply(null, tailles) : 0;
    const desequilibre = (max - min) > 1;

    html += '<div class="edit-cat"><h4 class="edit-cat-titre">' + echapper(cat) +
      ' <span class="edit-equilibre ' + (desequilibre ? 'ko' : 'ok') + '">tailles : ' +
      tailles.join(' · ') + (desequilibre ? ' ⚠️ déséquilibré' : ' ✅') + '</span></h4>';

    html += '<div class="edit-poules-grille">';
    noms.forEach(function (nom) {
      html += '<div class="edit-poule"><div class="edit-poule-titre">Poule ' + echapper(nom) +
        ' (' + modele.pools[nom].length + ')</div>';
      modele.pools[nom].forEach(function (id) {
        html += '<div class="edit-equipe"><span>' + echapper(nomEquipeAdmin(id)) + '</span>' +
          '<button type="button" class="edit-x" data-action="retirer" data-cat="' + echapper(cat) +
          '" data-pool="' + echapper(nom) + '" data-id="' + echapper(id) + '" title="Sortir">✕</button></div>';
      });
      html += '</div>';
    });
    html += '</div>';

    if (modele.bench.length) {
      html += '<div class="edit-bench"><div class="edit-bench-titre">À replacer</div>';
      modele.bench.forEach(function (id) {
        html += '<div class="edit-equipe edit-equipe-bench"><span>' + echapper(nomEquipeAdmin(id)) +
          '</span><span class="edit-cibles">';
        noms.forEach(function (nom) {
          html += '<button type="button" class="edit-vers" data-action="affecter" data-cat="' + echapper(cat) +
            '" data-pool="' + echapper(nom) + '" data-id="' + echapper(id) + '">→ ' + echapper(nom) + '</button>';
        });
        html += '</span></div>';
      });
      html += '</div>';
    }
    html += '</div>'; // .edit-cat
  });

  html += '<div class="ligne-action">' +
    '<button type="button" class="bouton" data-action="enregistrer">' + svgIcone('enregistrer') + 'Enregistrer et recalculer</button>' +
    '<button type="button" class="bouton-suppr" data-action="annuler">Annuler</button>' +
    '<span class="message-form" id="message-edition-poules"></span>' +
    '</div></div>';

  zone.innerHTML = html;
}

/** Clics dans l'éditeur (délégués) : retirer / affecter / enregistrer / annuler. */
function onClicEditionPoules(evenement) {
  const bouton = evenement.target.closest('[data-action]');
  if (!bouton || !editionPoules) return;
  const action = bouton.getAttribute('data-action');
  if (action === 'annuler')     return onAnnulerEditionPoules();
  if (action === 'enregistrer') return onEnregistrerPoules();

  const cat = bouton.getAttribute('data-cat');
  const id  = bouton.getAttribute('data-id');
  const pool = bouton.getAttribute('data-pool');
  const modele = editionPoules[cat];
  if (!modele) return;

  if (action === 'retirer') {
    modele.pools[pool] = modele.pools[pool].filter(function (x) { return x !== id; });
    if (modele.bench.indexOf(id) < 0) modele.bench.push(id);
  } else if (action === 'affecter') {
    modele.bench = modele.bench.filter(function (x) { return x !== id; });
    if (modele.pools[pool].indexOf(id) < 0) modele.pools[pool].push(id);
  }
  afficherEditionPoules();
}

/** Annule l'édition et réaffiche le planning normal (matchs inchangés). */
function onAnnulerEditionPoules() {
  editionPoules = null;
  document.getElementById('edition-poules').innerHTML = '';
  afficherPlanning(poulesDepuisEquipes(), matchsCourants);
}

/** Valide la nouvelle répartition et demande au backend de recalculer les matchs du matin. */
async function onEnregistrerPoules() {
  const message = document.getElementById('message-edition-poules');

  // Toutes les équipes doivent être réaffectées (aucune « à replacer »).
  const restantes = Object.keys(editionPoules).reduce(function (n, cat) {
    return n + editionPoules[cat].bench.length;
  }, 0);
  if (restantes > 0) {
    afficherMessage(message, 'Réaffecte d\'abord les ' + restantes + ' équipe(s) « à replacer ».', 'ko');
    return;
  }

  // Construit l'assignation { id_equipe: nom_poule }.
  const assignation = {};
  Object.keys(editionPoules).forEach(function (cat) {
    const pools = editionPoules[cat].pools;
    Object.keys(pools).forEach(function (nom) {
      pools[nom].forEach(function (id) { assignation[id] = nom; });
    });
  });

  if (!await dialogConfirmer('Enregistrer cette répartition et recalculer les matchs du matin ?',
      { ok: 'Enregistrer' })) return;

  const bouton = document.querySelector('#edition-poules [data-action="enregistrer"]');
  if (bouton) { bouton.disabled = true; bouton.textContent = 'Recalcul…'; }
  afficherMessage(message, 'Recalcul des matchs…', 'ok');
  try {
    const res = await ecrireAdmin('reorganiserPoulesMatin', { assignation: JSON.stringify(assignation) });
    editionPoules = null;
    document.getElementById('edition-poules').innerHTML = '';
    await rechargerEtRendre({ reglages: true }); // l'heure de fin auto a changé
    const nbP = (res && res.nb_poules != null) ? res.nb_poules : '?';
    const nbM = (res && res.nb_matchs != null) ? res.nb_matchs : '?';
    const finTxt = (res && res.heure_fin_journee) ? ' Fin de la journée : ' + res.heure_fin_journee + '.' : '';
    afficherMessage(document.getElementById('message-generation'),
      '✅ Poules mises à jour : ' + nbP + ' poule(s), ' + nbM + ' match(s) recalculés.' + finTxt, 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    if (bouton) { bouton.disabled = false; bouton.innerHTML = svgIcone('enregistrer') + 'Enregistrer et recalculer'; }
  }
}
