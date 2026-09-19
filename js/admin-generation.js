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

  if (total === 0) {
    etat.textContent = '⚪️ Génère d\'abord les poules et le planning du matin.';
    bouton.disabled = true;
  } else if (saisis === total) {
    etat.textContent = '✅ ' + saisis + '/' + total + ' saisis — prêt à générer.';
    bouton.disabled = false;
  } else {
    etat.textContent = '⏳ ' + saisis + '/' + total +
      ' saisis — complète tous les scores du matin (page Saisie) avant de générer.';
    bouton.disabled = true;
  }
  majDimancheScf(); // le bouton « dimanche » (Super Challenge Phase 3) suit le même cycle de vie
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

/**
 * Affiche les poules (composition) et le planning des matchs, par catégorie.
 */
function afficherPlanning(poules, matchs) {
  const zone = document.getElementById('affichage-planning');
  poules = poules || [];
  matchs = matchs || [];

  // Bouton « Modifier les poules » : visible dès qu'il y a des poules du matin (sauf en édition).
  const btnMod = document.getElementById('bouton-modifier-poules');
  if (btnMod && !editionPoules) btnMod.hidden = poules.length === 0;

  if (poules.length === 0 && matchs.length === 0) {
    zone.innerHTML = '<p class="vide">Pas encore de planning. Clique sur « Générer ».</p>';
    return;
  }

  // Nom d'une équipe à partir de son identifiant.
  function nom(id) {
    const e = equipesCourantes.find(function (x) { return x.id_equipe === id; });
    return e ? e.nom_equipe : id;
  }

  // Rend un tableau de matchs (triés par heure). enteteCol = intitulé de la 3e colonne.
  // mapPoule = fonction optionnelle (m) → texte de la cellule « poule » (défaut : m.poule).
  // Renvoie '' si la liste est vide.
  function tableMatchs(liste, enteteCol, mapPoule) {
    if (!liste.length) return '';
    liste = liste.slice().sort(function (a, b) {
      return String(a.heure_debut).localeCompare(String(b.heure_debut));
    });
    let h = '<div class="table-scroll"><table class="table-planning">' +
            '<thead><tr><th>Heure</th><th>Ter.</th><th>' + enteteCol + '</th><th>Match</th></tr></thead><tbody>';
    liste.forEach(function (m) {
      const arb = libelleArbitreScf(m, nom);
      const arbHtml = arb ? ' <span class="arbitre-tag">🧑‍⚖️ ' + echapper(arb) + '</span>' : '';
      h += '<tr>' +
             '<td>' + echapper(m.heure_debut) + '</td>' +
             '<td>' + echapper(String(m.terrain)) + '</td>' +
             '<td>' + echapper(mapPoule ? mapPoule(m) : String(m.poule)) + '</td>' +
             '<td>' + echapper(nom(m.equipe_A)) + ' <span class="vs">vs</span> ' + echapper(nom(m.equipe_B)) + arbHtml + '</td>' +
           '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  // Liste ordonnée des catégories concernées.
  const cats = [];
  poules.forEach(function (p) { if (cats.indexOf(p.categorie) < 0) cats.push(p.categorie); });
  matchs.forEach(function (m) { if (cats.indexOf(m.categorie) < 0) cats.push(m.categorie); });

  let html = '';
  cats.forEach(function (cat) {
    // Matchs de la catégorie, séparés matin (poules) / après-midi (classement croisé).
    const ms = matchs.filter(function (m) { return m.categorie === cat; });
    const matin = ms.filter(function (m) { return String(m.phase) !== 'classement'; });
    const aprem = ms.filter(function (m) { return String(m.phase) === 'classement'; });

    // Avancement : nombre de matchs dont le score est saisi (statut « terminé »).
    const saisisTotal = ms.filter(function (m) { return estTermine(m.statut); }).length;
    const saisisMatin = matin.filter(function (m) { return estTermine(m.statut); }).length;
    const saisisAprem = aprem.filter(function (m) { return estTermine(m.statut); }).length;

    html += '<h3 style="color:var(--bleu-ciel);margin:20px 0 8px;">' + echapper(cat) +
            badgeAvancement(saisisTotal, ms.length) + '</h3>';

    // Objet catégorie (pour le vocabulaire Super Challenge) ; null si introuvable → libellés par défaut.
    const catObj = (configCourante.categories || []).find(function (c) { return c.categorie === cat; });
    const estScfCat = ctxScf(catObj).estScf;

    // Composition des poules de la catégorie (« Triangulaire/Quadrangulaire A » en SCF, sinon « Poule A »).
    poules.filter(function (p) { return p.categorie === cat; }).forEach(function (p) {
      const membres = equipesCourantes
        .filter(function (e) { return e.categorie === cat && e.poule === p.nom_poule; })
        .map(function (e) { return echapper(e.nom_equipe); });
      const gl = groupeLabelScf(catObj, p.nom_poule, membres.length, false);
      const titrePoule = gl ? echapper(gl) : ('Poule ' + echapper(p.nom_poule));
      html += '<div class="poule-compo"><strong>' + titrePoule + '</strong> : ' +
              (membres.join(', ') || '—') + '</div>';
    });

    if (matin.length) {
      html += '<div class="planning-phase">' + (phaseLabelScf(catObj, false) || '🌅 Matin — poules') +
              badgeAvancement(saisisMatin, matin.length) + '</div>';
      html += tableMatchs(matin, estScfCat ? 'Groupe' : 'Poule');
    }
    if (aprem.length) {
      // Vocabulaire « Poule haute / basse » si la catégorie est en POULES_NIVEAU (repli : Niveau N1).
      const estPn = !estScfCat && catObj && formatApresMidiDe(catObj) === 'POULES_NIVEAU';
      const nbNiv = estPn ? nbPoulesNiveauCat(aprem, cat) : 0;
      html += '<div class="planning-phase">' + (phaseLabelScf(catObj, true) ||
              (estPn ? '🏉 Après-midi — poules de niveau' : '🏉 Après-midi — classement croisé')) +
              badgeAvancement(saisisAprem, aprem.length) + '</div>';
      html += tableMatchs(aprem, estScfCat ? 'Poule' : (estPn ? 'Poule' : 'Niveau'),
                          estScfCat ? function (m) { return pouleEFG(m.poule); }
                          : (estPn ? function (m) { return libellePouleNiveau(catObj, m.poule, nbNiv) || m.poule; } : null));
    }
  });

  zone.innerHTML = html;
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
