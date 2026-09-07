/**
 * ============================================================================
 *  ADMIN — TABLEAU DE BORD & « OÙ EN SUIS-JE ? » (extrait de admin.js)
 * ============================================================================
 *  Récapitulatif d'état en haut de page, fil d'avancement « Où en suis-je ? »
 *  (étapes + verrou), et SIGNATURES de génération / structure (« cerveau des
 *  dépendances »). Sorti du monolithe admin.js SANS changement de comportement.
 *
 *  ⚠️ signatureGeneration() / signatureStructure() sont des fonctions MIROIR du
 *  backend (backend/Code.gs) : garder les deux implémentations synchronisées.
 *
 *  Dépend de globaux définis ailleurs, accédés au moment de l'appel (handlers
 *  post-chargement) — l'ordre des <script> importe peu ; chargé après admin.js :
 *   - commun.js : echapper, svgIcone, comparerCategorie…
 *   - admin.js  : configCourante, equipesCourantes, matchsCourants, estPresente,
 *                 estPublie, assistant* (via typeof)…
 * ============================================================================
 */

/* --------------------------------------------------------------------------
   TABLEAU DE BORD (récap de l'état du tournoi, en haut de page)
   -------------------------------------------------------------------------- */

/** Icône SVG filaire pour la tuile « Planning matin » du tableau de bord :
 *  ✓ (vert) quand le planning est généré, horloge (grise) en attente. */
function svgEtatTuile(etat) {
  const dessin = etat === 'valide'
    ? '<circle cx="12" cy="12" r="9"></circle><path d="M8.3 12.6l2.5 2.5 4.9-5.6"></path>'
    : '<circle cx="12" cy="12" r="9"></circle><path d="M12 7.5V12l3 2"></path>';
  return '<svg class="tb-ic ' + (etat === 'valide' ? 'est-valide' : 'est-attente') + '" viewBox="0 0 24 24" ' +
         'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
         'aria-hidden="true">' + dessin + '</svg>';
}

/**
 * Met à jour le tableau de bord : catégories, équipes, planning, publication.
 * Lit l'état gardé en mémoire (configCourante / equipesCourantes / matchsCourants).
 */
function majTableauBord() {
  const elCat = document.getElementById('tb-categories');
  const elEq  = document.getElementById('tb-equipes');
  const elPl  = document.getElementById('tb-planning');
  const elPub = document.getElementById('tb-publication');
  if (!elCat || !elEq || !elPl || !elPub) return;

  // Catégories (toute catégorie existante est active).
  const cats = configCourante.categories || [];
  elCat.textContent = String(cats.length);

  // Équipes.
  elEq.textContent = (equipesCourantes || []).length;

  // Planning matin : « Validé » dès qu'il est généré, sinon « En attente »
  // (icône SVG filaire : ✓ vert ou horloge — l'après-midi a sa propre étape
  // dans la barre latérale, la tuile reste donc simple et lisible).
  const matin = (matchsCourants || []).filter(function (m) { return String(m.phase) !== 'classement'; });
  if (matin.length === 0) elPl.innerHTML = svgEtatTuile('attente') + '<span class="tb-val-texte">En attente</span>';
  else                    elPl.innerHTML = svgEtatTuile('valide') + '<span class="tb-val-texte">Validé</span>';

  // Publication : même système que « Planning matin » (icône SVG + texte).
  if (estPublie()) elPub.innerHTML = svgEtatTuile('valide') + '<span class="tb-val-texte">Publié</span>';
  else             elPub.innerHTML = svgEtatTuile('attente') + '<span class="tb-val-texte">En attente</span>';

  // Fil d'avancement « Où en suis-je ? » (recalculé à chaque mise à jour du tableau de bord).
  majEtatAvancement();
  // Bouton « Recalculer les horaires » : visible seulement quand c'est utile ET légitime.
  majBoutonRecalculer();
}

/* --------------------------------------------------------------------------
   « OÙ EN SUIS-JE ? » — fil d'avancement + thermomètre de la journée
   --------------------------------------------------------------------------
   ÉTAPE 1 du « cerveau des dépendances » : purement AFFICHAGE. On ne modifie
   AUCUNE logique existante — on lit l'état déjà présent dans les données
   (configCourante / equipesCourantes / matchsCourants) et on le montre d'un
   coup d'œil, avec une pastille par étape :
     ✅ fait · ⚪️ à faire · 🟠 à refaire (incohérence détectée) · ⏳ en attente.
   La détection fine « à recalculer » quand on change un horaire/réglage
   viendra à l'ÉTAPE 2 (signatures de génération).
   -------------------------------------------------------------------------- */

/** Nombre d'équipes par catégorie (clé = nom de catégorie). */
function nbEquipesParCategorie() {
  const compte = {};
  (equipesCourantes || []).forEach(function (e) {
    const c = String(e.categorie || '');
    if (c) compte[c] = (compte[c] || 0) + 1;
  });
  return compte;
}

/**
 * SIGNATURE DE GÉNÉRATION (« cerveau des dépendances », étape 2).
 * ⚠️ DOIT rester STRICTEMENT identique à signatureGeneration() du backend (Code.gs) :
 * même champs, même tri, même hachage — sinon la comparaison est faussée. On résume les
 * réglages qui décalent réellement les horaires des matchs ; on EXCLUT heure_fin /
 * heure_fin_auto (simple cible d'arrivée, réécrite par la génération en mode auto).
 */
function hachageChaine(s) {
  let h = 5381;
  s = String(s);
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 + s.charCodeAt(i)) % 2147483647;
  }
  return h.toString(36);
}

function signatureGeneration(global, categories, equipes) {
  global = global || {};
  const parts = [];
  parts.push('hd=' + (global.heure_debut || ''));
  parts.push('bt=' + (global.battement_terrain_min || ''));
  parts.push('pd=' + (global.pause_dejeuner_debut || ''));
  parts.push('pdd=' + (global.pause_dejeuner_duree_min || ''));

  const nbCat = {};
  (equipes || []).forEach(function (e) {
    const c = String(e.categorie || '');
    if (c) nbCat[c] = (nbCat[c] || 0) + 1;
  });

  const cats = (categories || []).filter(function (c) {
    return String(c.presente).toLowerCase() === 'oui';
  }).slice().sort(function (a, b) {
    const x = String(a.categorie), y = String(b.categorie);
    return x < y ? -1 : (x > y ? 1 : 0);
  });

  cats.forEach(function (c) {
    parts.push('cat=' + c.categorie
      + '|t=' + (c.terrains || '')
      + '|np=' + (c.nb_poules || '')
      + '|fmt=' + (c.format_mi_temps || '')
      + '|dm=' + (c.duree_mi_temps_min || '')
      + '|pm=' + (c.pause_mi_temps_min || '')
      + '|rc=' + (c.recup_entre_matchs_min || '')
      + '|n=' + (nbCat[String(c.categorie)] || 0));
  });

  return hachageChaine(parts.join(';'));
}

/**
 * SIGNATURE DE STRUCTURE (étape 3). ⚠️ Identique à signatureStructure() du backend.
 * Résume la COMPOSITION des poules (nb de poules + ids d'équipes par catégorie) : si elle
 * est INCHANGÉE, un simple recalcul des horaires (scores gardés) suffit ; sinon il faut un
 * vrai tirage.
 */
function signatureStructure(categories, equipes) {
  const parCat = {};
  (equipes || []).forEach(function (e) {
    const c = String(e.categorie || '');
    if (c) (parCat[c] = parCat[c] || []).push(String(e.id_equipe));
  });
  const cats = (categories || []).filter(function (c) {
    return String(c.presente).toLowerCase() === 'oui';
  }).slice().sort(function (a, b) {
    const x = String(a.categorie), y = String(b.categorie);
    return x < y ? -1 : (x > y ? 1 : 0);
  });
  const parts = [];
  cats.forEach(function (c) {
    const ids = (parCat[String(c.categorie)] || []).slice().sort();
    parts.push('cat=' + c.categorie + '|np=' + (c.nb_poules || '') + '|ids=' + ids.join(','));
  });
  return hachageChaine(parts.join(';'));
}

/**
 * Calcule l'état de chaque étape de préparation, dans l'ordre logique de la journée.
 * Renvoie un tableau d'objets { cle, titre, ancre, statut, detail }.
 * statut ∈ 'fait' | 'afaire' | 'arefaire' | 'attente'.
 */
function calculerEtatsEtapes() {
  const g = configCourante.global || {};
  const catsPresentes = (configCourante.categories || []).filter(estPresente);
  const equipes = equipesCourantes || [];
  const nbParCat = nbEquipesParCategorie();
  const matchs = matchsCourants || [];
  const matin = matchs.filter(function (m) { return String(m.phase) !== 'classement'; });
  const aprem = matchs.filter(function (m) { return String(m.phase) === 'classement'; });

  const etapes = [];

  // 1) Horaires de la journée
  if (!g.heure_debut) {
    etapes.push({ cle: 'horaires', titre: 'Horaires', ancre: 'zone-horaires', statut: 'afaire', detail: 'À renseigner' });
  } else {
    etapes.push({ cle: 'horaires', titre: 'Horaires', ancre: 'zone-horaires', statut: 'fait', detail: 'Début ' + g.heure_debut });
  }

  // 2) Catégories
  if (catsPresentes.length === 0) {
    etapes.push({ cle: 'categories', titre: 'Catégories', ancre: 'zone-categories', statut: 'afaire', detail: 'Aucune' });
  } else {
    etapes.push({ cle: 'categories', titre: 'Catégories', ancre: 'zone-categories', statut: 'fait', detail: catsPresentes.length + ' catégorie(s)' });
  }

  // 3) Équipes (à refaire si une catégorie présente n'a aucune équipe)
  if (equipes.length === 0) {
    etapes.push({ cle: 'equipes', titre: 'Équipes', ancre: 'bloc-equipes', statut: 'afaire', detail: 'Aucune' });
  } else {
    const vides = catsPresentes
      .filter(function (c) { return !nbParCat[String(c.categorie)]; })
      .map(function (c) { return String(c.categorie); });
    if (vides.length) {
      etapes.push({ cle: 'equipes', titre: 'Équipes', ancre: 'bloc-equipes', statut: 'arefaire', detail: 'Sans équipe : ' + vides.join(', ') });
    } else {
      etapes.push({ cle: 'equipes', titre: 'Équipes', ancre: 'bloc-equipes', statut: 'fait', detail: equipes.length + ' équipe(s)' });
    }
  }

  // 4) Répartition des terrains (à refaire si une catégorie avec équipes n'a pas de terrain)
  if (catsPresentes.length === 0 || equipes.length === 0) {
    etapes.push({ cle: 'terrains', titre: 'Terrains', ancre: 'bloc-terrains', statut: 'afaire', detail: 'En attente des catégories / équipes' });
  } else {
    const sansTerrain = catsPresentes
      .filter(function (c) { return nbParCat[String(c.categorie)] && !String(c.terrains || '').trim(); })
      .map(function (c) { return String(c.categorie); });
    if (sansTerrain.length) {
      etapes.push({ cle: 'terrains', titre: 'Terrains', ancre: 'bloc-terrains', statut: 'arefaire', detail: 'Sans terrain : ' + sansTerrain.join(', ') });
    } else {
      etapes.push({ cle: 'terrains', titre: 'Terrains', ancre: 'bloc-terrains', statut: 'fait', detail: 'Répartis' });
    }
  }

  // 5) Poules & planning
  //    À refaire si : une catégorie « jouable » est absente du planning (cas structurel),
  //    OU si un réglage a changé depuis la dernière génération (signature ≠ celle stockée).
  if (matin.length === 0) {
    etapes.push({ cle: 'poules', titre: 'Poules & planning', ancre: 'bloc-generation', statut: 'afaire', detail: 'À générer' });
  } else {
    const catsDansPlanning = {};
    matin.forEach(function (m) { catsDansPlanning[String(m.categorie)] = true; });
    const manquantes = catsPresentes
      .filter(function (c) { return nbParCat[String(c.categorie)] >= 2 && !catsDansPlanning[String(c.categorie)]; })
      .map(function (c) { return String(c.categorie); });

    // Signature enregistrée à la dernière génération vs signature des réglages actuels.
    const sigStockee = g.signature_generation || '';
    const sigActuelle = signatureGeneration(g, configCourante.categories, equipesCourantes);
    const reglagesModifies = sigStockee && sigActuelle !== sigStockee;

    if (manquantes.length) {
      etapes.push({ cle: 'poules', titre: 'Poules & planning', ancre: 'bloc-generation', statut: 'arefaire', detail: 'Absentes du planning : ' + manquantes.join(', ') });
    } else if (reglagesModifies) {
      etapes.push({ cle: 'poules', titre: 'Poules & planning', ancre: 'bloc-generation', statut: 'arefaire', detail: 'Réglages modifiés depuis la génération' });
    } else {
      etapes.push({ cle: 'poules', titre: 'Poules & planning', ancre: 'bloc-generation', statut: 'fait', detail: matin.length + ' match(s) le matin' });
    }
  }

  // 6) Phase après-midi
  if (matin.length === 0) {
    etapes.push({ cle: 'apresmidi', titre: 'Après-midi', ancre: 'bloc-apresmidi', statut: 'afaire', detail: 'En attente du matin' });
  } else if (aprem.length > 0) {
    etapes.push({ cle: 'apresmidi', titre: 'Après-midi', ancre: 'bloc-apresmidi', statut: 'fait', detail: 'Générée' });
  } else {
    const saisis = matin.filter(function (m) { return estTermine(m.statut); }).length;
    if (saisis === matin.length) {
      etapes.push({ cle: 'apresmidi', titre: 'Après-midi', ancre: 'bloc-apresmidi', statut: 'afaire', detail: 'Prêt à générer' });
    } else {
      etapes.push({ cle: 'apresmidi', titre: 'Après-midi', ancre: 'bloc-apresmidi', statut: 'attente', detail: saisis + '/' + matin.length + ' scores du matin' });
    }
  }

  return etapes;
}

/** Affiche le fil d'avancement + le thermomètre de la journée dans #etat-avancement. */
function majEtatAvancement() {
  const zone = document.getElementById('etat-avancement');
  if (!zone) return;

  const etapes = calculerEtatsEtapes();
  const ICONES = { fait: '✅', afaire: '⚪️', arefaire: '🟠', attente: '⏳' };

  let h = '<div class="ea-entete"><span class="ea-titre">Où en suis-je&nbsp;?</span>' +
          '<span class="ea-legende">Clique une étape pour t\'y rendre</span></div>';

  // Verdict « prêt à publier ? » : synthèse de ce qui bloque encore (hors après-midi, qui
  // peut se générer plus tard). Chaque item restant est cliquable → mène à son étape.
  const bloquants = etapes.filter(function (e) { return e.cle !== 'apresmidi' && e.statut !== 'fait'; });
  if (bloquants.length === 0) {
    h += '<div class="ea-verdict ea-verdict-ok"><span class="ea-coche" aria-hidden="true">' +
         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
         'stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12.6l3.4 3.4 7.6-8.4"></path></svg>' +
         '</span><span><strong>Tout est prêt</strong> — tu peux publier le tournoi.</span></div>';
  } else {
    h += '<div class="ea-verdict ea-verdict-ko">⚠️ <strong>Avant de publier, il reste&nbsp;:</strong> ' +
      bloquants.map(function (e) {
        return '<button type="button" class="ea-lien-etape" data-ancre="' + echapper(e.ancre) + '">' +
               echapper(e.titre) + '</button>';
      }).join(' ') + '</div>';
  }

  h += '<ol class="ea-fil">';
  etapes.forEach(function (e) {
    h += '<li class="ea-etape ea-' + e.statut + '" role="button" tabindex="0" ' +
           'data-ancre="' + echapper(e.ancre) + '" title="' + echapper(e.detail) + '">' +
           '<span class="ea-pastille">' + ICONES[e.statut] + '</span>' +
           '<span class="ea-nom">' + echapper(e.titre) + '</span>' +
           '<span class="ea-detail">' + echapper(e.detail) + '</span>' +
         '</li>';
  });
  h += '</ol>';

  // Thermomètre de la journée : début → pause → heure de fin prévue.
  const g = configCourante.global || {};
  const poules = etapes.find(function (e) { return e.cle === 'poules'; });
  const debut = g.heure_debut ? echapper(g.heure_debut) : '—';
  const pauseTxt = g.pause_dejeuner_debut
    ? echapper(g.pause_dejeuner_debut) +
      (g.pause_dejeuner_duree_min ? ' (' + echapper(String(g.pause_dejeuner_duree_min)) + ' min)' : '')
    : '—';
  const finVal = g.heure_fin_projetee || g.heure_fin_matin || g.heure_fin || '';
  let finTxt;
  if (!poules || poules.statut === 'afaire') {
    finTxt = '<span class="ea-therm-warn">à générer</span>';
  } else if (poules.statut !== 'fait') {
    finTxt = (finVal ? echapper(finVal) + ' ' : '') + '<span class="ea-therm-warn">⚠️ à recalculer</span>';
  } else {
    finTxt = echapper(finVal || '—');
  }

  h += '<div class="ea-thermo">' +
         '<span class="ea-t"><b>🕘 Début</b> ' + debut + '</span>' +
         '<span class="ea-t"><b>🍽️ Pause déj.</b> ' + pauseTxt + '</span>' +
         '<span class="ea-t"><b>🏁 Fin prévue</b> ' + finTxt + '</span>' +
       '</div>';

  zone.innerHTML = h;

  // Assistant à cartes : l'état des étapes vient (peut-être) de changer → le verrou
  // du bouton « Suivant » doit suivre (grisé tant que l'étape n'est pas complète).
  if (typeof assistantMajVerrou === 'function') assistantMajVerrou();
  // Même raison, même endroit, pour le bouton « Publier le tournoi » : ses prérequis
  // sont ces MÊMES étapes, il doit donc se griser (ou se libérer) au même instant —
  // sinon il resterait figé sur l'état du dernier rechargement complet de la page.
  if (typeof majVerrouPublier === 'function') majVerrouPublier();
}

/**
 * Clic (ou touche Entrée/Espace) sur une étape du fil OU un lien du verdict.
 * En mode assistant, on va à l'ÉTAPE correspondante (sinon la cible serait masquée) ;
 * en vue classique, on défile jusqu'à la section.
 */
function onClicEtatAvancement(evenement) {
  if (evenement.type === 'keydown' && evenement.key !== 'Enter' && evenement.key !== ' ') return;
  const li = evenement.target.closest('[data-ancre]');
  if (!li) return;
  evenement.preventDefault();
  const ancre = li.getAttribute('data-ancre');
  if (typeof assistantEstActif === 'function' && assistantEstActif()) {
    assistantAllerVersBloc(ancre);
  } else {
    const cible = document.getElementById(ancre);
    if (cible && cible.scrollIntoView) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
