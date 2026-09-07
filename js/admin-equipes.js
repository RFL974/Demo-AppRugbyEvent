/**
 * ============================================================================
 *  ADMIN — ÉQUIPES (extrait de admin.js)
 * ============================================================================
 *  CRUD des équipes : liste par catégorie, ajout, suppression (unitaire ou par
 *  catégorie), renommage inline. Sorti du monolithe admin.js SANS changement
 *  de comportement.
 *
 *  Dépend de globaux définis ailleurs, accédés au moment de l'appel (handlers
 *  post-chargement) — l'ordre des <script> importe peu ; chargé après admin.js :
 *   - commun.js : echapper, svgIcone, comparerCategorie, afficherMessage…
 *   - admin.js  : configCourante, equipesCourantes, ecrireAdmin, apiGet,
 *                 majTableauBord, dialog*, estPresente…
 * ============================================================================
 */

/* --------------------------------------------------------------------------
   ÉQUIPES
   -------------------------------------------------------------------------- */

/**
 * Remplit la liste déroulante avec les catégories PRÉSENTES.
 * Guidage : s'il n'y a AUCUNE catégorie, on ne peut pas saisir d'équipe → on affiche une aide
 * et on désactive le formulaire d'ajout (sinon l'utilisateur reste bloqué sans explication).
 */
function remplirSelectCategories(categories) {
  const select = document.getElementById('champ-categorie');
  // On garde la 1re option "Catégorie…" et on ajoute les catégories présentes.
  select.innerHTML = '<option value="">Catégorie…</option>';
  const presentes = (categories || []).filter(estPresente);
  presentes.forEach(function (cat) {
    const opt = document.createElement('option');
    opt.value = cat.categorie;
    opt.textContent = cat.categorie;
    select.appendChild(opt);
  });

  // Aide + activation/désactivation du formulaire selon qu'il existe au moins une catégorie.
  const aucune = presentes.length === 0;
  const aide = document.getElementById('aide-categories');
  const champNom = document.getElementById('champ-nom');
  const boutonAj = document.getElementById('bouton-ajouter');
  if (aide) aide.hidden = !aucune;
  if (select) select.disabled = aucune;
  if (champNom) champNom.disabled = aucune;
  if (boutonAj) boutonAj.disabled = aucune;
  ['champ-joueurs', 'champ-educateurs'].forEach(function (id) {
    const c = document.getElementById(id);
    if (c) c.disabled = aucune;
  });
}

/** Effectif déclaré lu d'un champ : entier ≥ 0, ou '' si vide/illisible — miroir de
 *  effectifDeclare (backend). « Vide » et « zéro » sont deux réponses différentes : on ne
 *  transforme JAMAIS un champ vide en 0 (ce serait déclarer « aucun joueur »). */
function effectifSaisi(valeur) {
  const s = String(valeur == null ? '' : valeur).trim();
  if (s === '') return '';
  const n = parseInt(s, 10);
  return (isFinite(n) && n >= 0) ? String(n) : '';
}

/** Équipe créée par une réponse d'invitation : ses effectifs viennent du club, pas d'ici. */
function estEquipeAuto(eq) {
  return String((eq && eq.source) || '').trim().toLowerCase() === 'auto';
}

/**
 * Une équipe est-elle en cours d'édition AVEC des valeurs réellement différentes de l'enregistré ?
 * Utilisée par l'assistant / la barre latérale pour décider s'il y a « une modification en attente ».
 * OUVRIR le crayon ne doit RIEN verrouiller : tant que rien n'a bougé, il n'y a rien à perdre —
 * on compare donc les VALEURS, jamais la simple présence des champs d'édition à l'écran.
 * Le nom est comparé en MAJUSCULES car c'est ainsi qu'il est enregistré (onEnregistrerNom).
 */
function equipeEditionModifiee() {
  const item = document.querySelector('#liste-equipes .equipe-item.en-edition');
  if (!item) return false;
  const id = item.getAttribute('data-id');
  const eq = (typeof equipesCourantes !== 'undefined' && equipesCourantes || [])
    .find(function (e) { return e.id_equipe === id; }) || {};
  const champ = function (sel) { return item.querySelector(sel); };

  const cNom = champ('.champ-edit-nom');
  if (cNom && cNom.value.trim().toUpperCase() !== String(eq.nom_equipe || '').trim().toUpperCase()) return true;
  const cJ = champ('.champ-edit-joueurs');
  if (cJ && effectifSaisi(cJ.value) !== effectifSaisi(eq.nb_joueurs)) return true;
  const cE = champ('.champ-edit-educateurs');
  if (cE && effectifSaisi(cE.value) !== effectifSaisi(eq.nb_educateurs)) return true;
  return false;
}

/** Petit résumé « 12 joueurs · 2 éducs » d'une équipe, ou '' si rien n'est déclaré. */
function resumeEffectifs(eq) {
  const j = effectifSaisi(eq && eq.nb_joueurs);
  const e = effectifSaisi(eq && eq.nb_educateurs);
  const bouts = [];
  if (j !== '') bouts.push(j + ' joueur' + (Number(j) > 1 ? 's' : ''));
  if (e !== '') bouts.push(e + ' éduc' + (Number(e) > 1 ? 's' : ''));
  return bouts.join(' · ');
}

/**
 * Affiche la liste des équipes, regroupées par catégorie.
 * @param {Object[]} equipes
 */
function afficherEquipes(equipes) {
  const zone = document.getElementById('liste-equipes');

  if (!equipes || equipes.length === 0) {
    zone.innerHTML = '<p class="vide">Aucune équipe saisie pour le moment.</p>';
    return;
  }

  // On regroupe les équipes par catégorie.
  const parCategorie = {};
  equipes.forEach(function (eq) {
    const cat = eq.categorie || '(sans catégorie)';
    if (!parCategorie[cat]) parCategorie[cat] = [];
    parCategorie[cat].push(eq);
  });

  // On affiche dans l'ordre des catégories de la config, puis les éventuelles autres.
  const ordre = configCourante.categories.map(function (c) { return c.categorie; });
  Object.keys(parCategorie).forEach(function (c) {
    if (ordre.indexOf(c) === -1) ordre.push(c);
  });

  let html = '';
  ordre.forEach(function (cat) {
    const liste = parCategorie[cat];
    if (!liste) return;

    let items = '';
    liste.forEach(function (eq) {
      // Effectifs déclarés : affichés à côté du nom. Une équipe créée par une réponse
      // d'invitation ('auto') tient les siens du club — on le dit plutôt que d'afficher un vide.
      const resume = resumeEffectifs(eq);
      let badge = '';
      if (resume) badge = '<span class="equipe-effectifs">' + echapper(resume) + '</span>';
      else if (estEquipeAuto(eq)) badge = '<span class="equipe-effectifs est-auto" ' +
        'title="Effectifs déclarés par le club dans sa réponse à l\'invitation">déclarés par le club</span>';
      items +=
        '<div class="equipe-item" data-id="' + eq.id_equipe + '">' +
          '<span class="nom">' + echapper(eq.nom_equipe) + '</span>' + badge +
          '<div class="equipe-actions">' +
            '<button class="bouton-modif bouton-icone" title="Modifier" aria-label="Modifier" ' +
                    'data-id="' + eq.id_equipe + '" data-nom="' + echapper(eq.nom_equipe) + '">' + svgIcone('crayon') + '</button>' +
            '<button class="bouton-suppr bouton-icone" title="Supprimer" aria-label="Supprimer" ' +
                    'data-id="' + eq.id_equipe + '" data-nom="' + echapper(eq.nom_equipe) + '">' + svgIcone('corbeille') + '</button>' +
          '</div>' +
        '</div>';
    });

    html +=
      '<div class="groupe-categorie">' +
        '<h3>' + echapper(cat) + ' <span class="cat-mini">(' + liste.length + ')</span>' +
          '<button class="bouton-suppr bouton-suppr-tout" data-cat="' + echapper(cat) + '">' +
            'Tout supprimer</button>' +
        '</h3>' +
        items +
      '</div>';
  });

  zone.innerHTML = html;
}

/**
 * Quand on soumet le formulaire d'ajout d'équipe.
 */
async function onAjouterEquipe(evenement) {
  evenement.preventDefault(); // empêche le rechargement de la page

  const champNom = document.getElementById('champ-nom');
  const champCat = document.getElementById('champ-categorie');
  const champJ   = document.getElementById('champ-joueurs');
  const champE   = document.getElementById('champ-educateurs');
  const bouton   = document.getElementById('bouton-ajouter');
  const message  = document.getElementById('message-equipe');

  // Nom du club toujours en MAJUSCULES (uniformité d'affichage sur toutes les pages).
  const nom = champNom.value.trim().toUpperCase();
  const categorie = champCat.value;
  const nbJoueurs = effectifSaisi(champJ ? champJ.value : '');
  const nbEducateurs = effectifSaisi(champE ? champE.value : '');

  if (!nom || !categorie) {
    afficherMessage(message, 'Indique un nom ET une catégorie.', 'ko');
    return;
  }

  // Refuse un doublon : même nom dans la même catégorie (les noms sont en MAJUSCULES).
  const doublon = equipesCourantes.some(function (e) {
    return (e.categorie || '') === categorie &&
           String(e.nom_equipe).trim().toUpperCase() === nom;
  });
  if (doublon) {
    afficherMessage(message, '⚠️ « ' + nom + ' » existe déjà dans ' + categorie + '.', 'ko');
    return;
  }

  // On désactive le bouton le temps de l'envoi (évite les doubles clics).
  bouton.disabled = true;
  bouton.textContent = 'Ajout…';

  try {
    await ecrireAdmin('ajouterEquipe', { nom_equipe: nom, categorie: categorie,
                                        nb_joueurs: nbJoueurs, nb_educateurs: nbEducateurs });

    // Succès : on vide les champs saisis, on recharge la liste.
    champNom.value = '';
    if (champJ) champJ.value = '';
    if (champE) champE.value = '';
    champNom.focus();
    afficherMessage(message, '✅ « ' + nom +' » ajoutée.', 'ok');
    await rechargerEquipes();

  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Ajouter';
  }
}

/**
 * Clic dans la liste : on aiguille vers Modifier, Supprimer, Tout supprimer,
 * ou les boutons du mini-formulaire d'édition (Enregistrer / Annuler).
 */
async function onClicListe(evenement) {
  const cible = evenement.target;

  // ⚠️ Les boutons d'édition (Enregistrer/Annuler) réutilisent les classes
  // .bouton-modif/.bouton-suppr pour le style : on les teste EN PREMIER.
  if (cible.closest('.bouton-edit-ok'))     return onEnregistrerNom(cible.closest('.bouton-edit-ok'));
  if (cible.closest('.bouton-edit-annuler')) return afficherEquipes(equipesCourantes);
  if (cible.closest('.bouton-modif'))       return onModifierEquipe(cible.closest('.bouton-modif'));
  if (cible.closest('.bouton-suppr-tout'))  return onSupprimerCategorieEquipes(cible.closest('.bouton-suppr-tout'));
  if (cible.closest('.bouton-suppr'))       return onSupprimerEquipe(cible.closest('.bouton-suppr'));
}

/**
 * Supprime une seule équipe.
 */
async function onSupprimerEquipe(bouton) {
  const id = bouton.getAttribute('data-id');
  const nom = bouton.getAttribute('data-nom');
  const message = document.getElementById('message-equipe');

  if (!await dialogConfirmer('Supprimer l\'équipe « ' + nom + ' » ?', { ok: 'Supprimer', danger: true })) return;

  bouton.disabled = true;
  try {
    await ecrireAdmin('supprimerEquipe', { id_equipe: id });
    afficherMessage(message, '🗑️ « ' + nom + ' » supprimée.', 'ok');
    await rechargerEquipes();
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    bouton.disabled = false;
  }
}

/**
 * Supprime TOUTES les équipes d'une catégorie d'un seul coup.
 */
async function onSupprimerCategorieEquipes(bouton) {
  const cat = bouton.getAttribute('data-cat');
  const message = document.getElementById('message-equipe');
  const combien = equipesCourantes.filter(function (eq) {
    return (eq.categorie || '(sans catégorie)') === cat;
  }).length;

  if (!await dialogConfirmer('Supprimer TOUTES les ' + combien + ' équipe(s) de la catégorie « ' + cat + ' » ?\n\n' +
               'Cette action est irréversible.', { ok: 'Tout supprimer', danger: true })) return;

  bouton.disabled = true;
  bouton.textContent = 'Suppression…';
  try {
    const res = await ecrireAdmin('supprimerEquipesCategorie', { categorie: cat });
    const n = (res && res.nb_supprimees != null) ? res.nb_supprimees : combien;
    afficherMessage(message, '🗑️ ' + n + ' équipe(s) de « ' + cat + ' » supprimée(s).', 'ok');
    await rechargerEquipes();
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    bouton.disabled = false;
    bouton.textContent = 'Tout supprimer';
  }
}

/**
 * Passe une équipe en mode édition : le nom devient un champ modifiable
 * avec les boutons Enregistrer / Annuler.
 */
function onModifierEquipe(bouton) {
  const id = bouton.getAttribute('data-id');
  const nom = bouton.getAttribute('data-nom');
  const item = document.querySelector('.equipe-item[data-id="' + id + '"]');
  if (!item) return;
  const eq = (equipesCourantes || []).find(function (e) { return e.id_equipe === id; }) || {};
  const auto = estEquipeAuto(eq);

  // Édition : nom + effectifs déclarés (joueurs / éducateurs). Vide = « non déclaré », jamais 0.
  item.classList.add('en-edition');
  item.innerHTML =
    '<input class="champ-edit-nom" type="text" value="' + echapper(nom) + '" autocomplete="off" ' +
           'aria-label="Nom de l\'équipe">' +
    '<input class="champ-edit-joueurs champ-effectif" type="number" min="0" step="1" placeholder="Joueurs" ' +
           'value="' + echapper(effectifSaisi(eq.nb_joueurs)) + '" aria-label="Nombre de joueurs (facultatif)">' +
    '<input class="champ-edit-educateurs champ-effectif" type="number" min="0" step="1" placeholder="Éducs" ' +
           'value="' + echapper(effectifSaisi(eq.nb_educateurs)) + '" aria-label="Nombre d\'éducateurs (facultatif)">' +
    '<div class="equipe-actions">' +
      '<button class="bouton-modif bouton-edit-ok" data-id="' + id + '">Enregistrer</button>' +
      '<button class="bouton-suppr bouton-edit-annuler">Annuler</button>' +
    '</div>' +
    (auto ? '<span class="equipe-note-edition">⚠️ Équipe créée par la réponse du club : ses effectifs ' +
            'sont déjà comptés depuis l\'invitation. Ce que tu saisis ici ne sera pas ajouté au total ' +
            '(pour éviter de compter deux fois).</span>' : '');

  const champ = item.querySelector('.champ-edit-nom');
  champ.focus();
  champ.select();
  // Entrée = enregistrer, Échap = annuler — sur les trois champs.
  item.querySelectorAll('input').forEach(function (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); item.querySelector('.bouton-edit-ok').click(); }
      if (e.key === 'Escape') { e.preventDefault(); afficherEquipes(equipesCourantes); }
    });
  });
}

/**
 * Enregistre le nouveau nom d'une équipe éditée.
 */
async function onEnregistrerNom(bouton) {
  const id = bouton.getAttribute('data-id');
  const item = document.querySelector('.equipe-item[data-id="' + id + '"]');
  const message = document.getElementById('message-equipe');
  const champ = item ? item.querySelector('.champ-edit-nom') : null;
  if (!champ) return;

  // Nom du club toujours en MAJUSCULES (cohérence avec l'ajout d'équipe).
  const nouveauNom = champ.value.trim().toUpperCase();
  if (!nouveauNom) {
    afficherMessage(message, "Le nom de l'équipe ne peut pas être vide.", 'ko');
    return;
  }

  // Refuse un doublon dans la même catégorie (hors l'équipe qu'on renomme elle-même).
  const equipe = equipesCourantes.find(function (e) { return e.id_equipe === id; });
  const cat = equipe ? (equipe.categorie || '') : '';
  const doublon = equipesCourantes.some(function (e) {
    return e.id_equipe !== id && (e.categorie || '') === cat &&
           String(e.nom_equipe).trim().toUpperCase() === nouveauNom;
  });
  if (doublon) {
    afficherMessage(message, '⚠️ « ' + nouveauNom + ' » existe déjà dans ' + cat + '.', 'ko');
    return;
  }

  // Effectifs déclarés : envoyés SYSTÉMATIQUEMENT (même vides) — un champ vidé à l'écran doit
  // effacer la valeur enregistrée, sinon on ne pourrait jamais revenir à « non déclaré ».
  const champJ = item.querySelector('.champ-edit-joueurs');
  const champE = item.querySelector('.champ-edit-educateurs');
  const nbJoueurs = effectifSaisi(champJ ? champJ.value : '');
  const nbEducateurs = effectifSaisi(champE ? champE.value : '');

  bouton.disabled = true;
  bouton.textContent = 'Enregistrement…';
  try {
    await ecrireAdmin('modifierEquipe', { id_equipe: id, nom_equipe: nouveauNom,
                                          nb_joueurs: nbJoueurs, nb_educateurs: nbEducateurs });
    const resume = resumeEffectifs({ nb_joueurs: nbJoueurs, nb_educateurs: nbEducateurs });
    afficherMessage(message, '✏️ « ' + nouveauNom + ' » enregistrée' + (resume ? ' — ' + resume : '') + '.', 'ok');
    await rechargerEquipes();
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    bouton.disabled = false;
    bouton.textContent = 'Enregistrer';
  }
}

/**
 * Recharge uniquement la liste des équipes depuis le backend.
 */
async function rechargerEquipes() {
  const equipes = await apiGet('getEquipes');
  equipesCourantes = equipes;
  afficherEquipes(equipes);
  majTableauBord(); // le nombre d'équipes a changé
}

/* --------------------------------------------------------------------------
   RÉGLAGE « Identifier mes équipes dans Perfs » (paramètre `perfs_mot_cle_club`)

   Il vit dans la carte ÉQUIPES parce que la valeur attendue est un morceau du
   NOM des équipes — l'organisateur les a sous les yeux au moment de le choisir.
   Écriture : action existante `enregistrerInfosTournoi`, en envoi PARTIEL (le
   backend n'écrit que les champs reçus) ⇒ aucune action serveur nouvelle, et la
   ligne de Config est créée automatiquement si elle n'existe pas encore.
   -------------------------------------------------------------------------- */

/** Longueur MINIMALE du mot-clé, une fois normalisé (voir perfs.js). */
const MOT_CLE_LONGUEUR_MIN = 3;

/** Normalisation IDENTIQUE à celle de perfs.js — les deux doivent juger pareil. */
function normaliserMotCleClub(valeur) {
  return String(valeur == null ? '' : valeur).trim().toLowerCase();
}

/** (Re)remplit le champ depuis la configuration chargée. */
function majPerfsMotCleClub() {
  const form = document.getElementById('form-perfs-club');
  if (!form || !form.perfs_mot_cle_club) return;
  form.perfs_mot_cle_club.value = (configCourante.global || {}).perfs_mot_cle_club || '';
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
}

/**
 * Enregistre le mot-clé. Trois issues, et elles sont distinctes :
 *   • vide            ⇒ accepté — c'est la désactivation volontaire de la page Perfs ;
 *   • 1 ou 2 signes   ⇒ REFUSÉ — trop court pour distinguer un club d'un autre ;
 *   • 3 signes ou +   ⇒ enregistré (en minuscules, sans espaces de bord).
 */
async function onEnregistrerPerfsMotCle() {
  const form = document.getElementById('form-perfs-club');
  const message = document.getElementById('message-perfs-club');
  const bouton = document.getElementById('bouton-enregistrer-perfs-club');
  const valeur = normaliserMotCleClub(form.perfs_mot_cle_club.value);

  if (valeur !== '' && valeur.length < MOT_CLE_LONGUEUR_MIN) {
    afficherMessage(message, '⚠️ Trop court : il faut au moins ' + MOT_CLE_LONGUEUR_MIN +
      ' caractères. Avec moins, des équipes adverses risqueraient d\'être comptées comme les tiennes. ' +
      'Laisse vide si tu préfères ne pas utiliser la page Perfs.', 'ko');
    return;
  }

  await avecBoutonOccupe(bouton, message, async function () {
    afficherMessage(message, 'Enregistrement…', 'ok');
    await ecrireAdmin('enregistrerInfosTournoi', { perfs_mot_cle_club: valeur });
    configCourante = await lireConfigAdmin();
    majPerfsMotCleClub();

    // ⚠️ On RELIT avant d'annoncer le succès. Sans cette comparaison, un serveur pas encore
    // redéployé (qui ignore ce paramètre) produirait une écriture sans effet — et un message
    // vert affirmant le contraire. On ne dit « enregistré » que si le classeur le confirme.
    const relu = normaliserMotCleClub((configCourante.global || {}).perfs_mot_cle_club);
    if (relu !== valeur) {
      afficherMessage(message, '⚠️ La valeur n\'a pas été enregistrée : le serveur a répondu « ' +
        (relu || '(vide)') +' ». Si le serveur vient d\'être modifié, il n\'a peut-être pas encore ' +
        'été redéployé — voir docs/deploiement.md.', 'ko');
      return;
    }
    afficherMessage(message, valeur === ''
      ? '✅ Réglage effacé : la page Perfs n\'affichera aucun bilan.'
      : '✅ Enregistré : les équipes dont le nom contient « ' + valeur + ' » sont les tiennes.', 'ok');
  });
}
