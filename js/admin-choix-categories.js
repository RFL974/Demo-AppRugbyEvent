/* Choix des cinq catégories : retrait confirmé de la ligne Config uniquement.
 * Une validation relit le serveur avant toute écriture. Après une réponse perdue,
 * le prochain clic relit donc aussi les catégories éventuellement déjà créées. */
const CHOIX_CATEGORIES_TOURNOI = Object.freeze(['U6', 'U8', 'U10', 'U12', 'U14']);
let choixCategoriesEnCours = false;
let choixCategoriesModifie = false;
let revisionCategories = 0;
let verificationCategoriesEnCours = 0;

function versionCategoriesCourante() { return revisionCategories; }
function invaliderLecturesCategories() { revisionCategories++; }

function expliquerErreurCategories(err) {
  return err && err.name === 'AbortError'
    ? 'Le serveur n’a pas répondu dans le délai prévu.'
    : ((err && err.message) || 'Réponse du serveur indisponible.');
}

function afficherMessageChoixCategories(element, texte, type) {
  element.textContent = texte;
  // Le helper historique traite tout type autre que « ok » comme une erreur.
  // Ici l'attente et les instructions restent réellement neutres.
  element.className = 'message-form' + (type ? ' ' + type : '');
}

function cleCategorieChoix(nom) {
  // M10 et U10 désignent la même tranche dans le référentiel : garder le nom stocké.
  return normaliserNomCategorie(nom).replace(/^m(6|8|10|12|14)$/, 'u$1');
}

function choixCategoriesAValider() {
  return choixCategoriesEnCours || choixCategoriesModifie;
}

function majChoixCategoriesTournoi() {
  // Une autre sauvegarde ne doit pas effacer les cases que l'utilisateur prépare.
  if (choixCategoriesAValider()) return;
  const form = document.getElementById('form-choix-categories');
  if (!form) return;
  const presentes = (configCourante.categories || []).filter(estPresente)
    .map(function (c) { return cleCategorieChoix(c.categorie); });
  form.querySelectorAll('input[name="categories"]').forEach(function (c) {
    c.checked = presentes.indexOf(cleCategorieChoix(c.value)) !== -1;
  });
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(form);
}

function onChangerChoixCategories() {
  // Une vérification de fond plus ancienne ne doit jamais écraser ce nouveau brouillon.
  invaliderLecturesCategories();
  choixCategoriesModifie = true;
  if (typeof invaliderConformiteFFRAffichee === 'function') invaliderConformiteFFRAffichee();
  const retirees = categoriesRetireesChoix(configCourante, selectionChoixCategories());
  // Le geste qui applique le choix est « Enregistrer les informations » : c'est lui qu'on nomme
  // (le bouton « Valider » ne reste visible que dans le repli sans JavaScript).
  afficherMessageChoixCategories(document.getElementById('message-choix-categories'), retirees.length
    ? 'À l’enregistrement, ' + retirees.map(function (c) { return c.categorie; }).join(', ') +
      ' et leurs réglages seront supprimés après confirmation. Les équipes et les matchs seront conservés.'
    : 'Enregistre les informations pour appliquer ce choix et relancer le contrôle de date.', '');
}

function selectionChoixCategories() {
  return Array.from(document.getElementById('form-choix-categories').querySelectorAll('input[name="categories"]'))
    .filter(function (c) { return c.checked && CHOIX_CATEGORIES_TOURNOI.indexOf(c.value) !== -1; })
    .map(function (c) { return c.value; });
}

function categoriesRetireesChoix(cfg, selection) {
  const gerees = CHOIX_CATEGORIES_TOURNOI.map(cleCategorieChoix);
  const gardees = selection.map(cleCategorieChoix);
  return (cfg.categories || []).filter(function (c) {
    const cle = cleCategorieChoix(c.categorie);
    return gerees.indexOf(cle) !== -1 && gardees.indexOf(cle) === -1;
  });
}

function choixCategoriesConfirme(cfg, selection) {
  return selection.every(function (nom) {
    return (cfg.categories || []).some(function (c) {
      return cleCategorieChoix(c.categorie) === cleCategorieChoix(nom) && estPresente(c);
    });
  }) && categoriesRetireesChoix(cfg, selection).length === 0;
}

function rendreCategoriesChoix(cfg) {
  configCourante = cfg;
  // Préserver les brouillons de date/horaires, les équipes et les matchs.
  document.getElementById('zone-categories').innerHTML = afficherCategories(cfg.categories || []);
  remplirSelectCategories(cfg.categories || []);
  injecterTerrains();
  majTableauBord();
  majDossier();
}

function masquerCategoriesChoixIncertaines() {
  // Ne pas détruire les ancres du tableau de bord, nécessaires à la reprise.
  ['zone-categories', 'zone-terrains', 'etat-dossier', 'ligne-apercu-dossier'].forEach(function (id) {
    const zone = document.getElementById(id);
    if (zone) zone.textContent = 'Catégories à vérifier : clique sur Valider pour relire le serveur.';
  });
  remplirSelectCategories([]);
  const compteur = document.getElementById('tb-categories');
  if (compteur) compteur.textContent = 'À vérifier';
  const avancement = document.getElementById('etat-avancement');
  if (avancement) avancement.textContent = 'Validation des catégories non confirmée.';
}

function nouvelleCategorieChoisie(nom) {
  return {
    categorie: nom, presente: 'oui', terrains: '', terrains_auto: 'oui', nb_poules: '',
    format_mi_temps: '', duree_mi_temps_min: '', pause_mi_temps_min: '',
    recup_entre_matchs_min: '', format_apresmidi: 'CROISE', param_format: '',
    reglement: '', effectif_min: '', effectif_max: '', arbitrage_organisation: ''
  };
}

async function verifierChoixCategoriesEnArrierePlan(proprietaire, selection, message) {
  let relue;
  try {
    relue = await lireConfigAdmin(undefined, { delaiMs: 30000 });
  } catch (premiereErreur) {
    // Une deuxième lecture est permise : elle ne réémet aucune mutation et évite
    // de rendre la vue incertaine sur une panne de lecture isolée.
    if (proprietaire !== versionCategoriesCourante()) return false;
    try {
      relue = await lireConfigAdmin(undefined, { delaiMs: 30000 });
    } catch (_) {
      if (proprietaire !== versionCategoriesCourante()) return false;
      choixCategoriesModifie = true;
      masquerCategoriesChoixIncertaines();
      if (typeof invaliderConformiteFFRAffichee === 'function') invaliderConformiteFFRAffichee();
      afficherMessageChoixCategories(message,
        '⚠️ Les modifications ont été acceptées, mais leur vérification de fond est indisponible. ' +
        'Les vues concernées sont à vérifier avant une nouvelle modification. ' + expliquerErreurCategories(premiereErreur), 'ko');
      if (typeof majConformiteFFR === 'function') await majConformiteFFR();
      return false;
    }
  }
  if (proprietaire !== versionCategoriesCourante()) return false;
  rendreCategoriesChoix(relue);
  if (!choixCategoriesConfirme(relue, selection)) {
    choixCategoriesModifie = true;
    if (typeof invaliderConformiteFFRAffichee === 'function') invaliderConformiteFFRAffichee();
    afficherMessageChoixCategories(message,
      '⚠️ Validation non confirmée : le serveur ne confirme pas encore exactement le choix affiché. ' +
      'Son état actuel a été réconcilié ; vérifie les cases puis valide à nouveau sans recréer à l’aveugle.', 'ko');
    if (typeof majConformiteFFR === 'function') await majConformiteFFR();
    return false;
  }
  choixCategoriesModifie = false;
  majChoixCategoriesTournoi();
  return true;
}

/* --------------------------------------------------------------------------
   CONTRAT D'ÉCRITURE — le choix voyage avec « Enregistrer les informations »
   ⭐ Plus de relecture avant écriture ni d'écriture par catégorie : la liste FINALE des cases
   cochées part dans la même requête que les infos (`categories_choisies`), avec les suppressions
   que l'organisateur vient de confirmer (`suppressions_confirmees` : catégorie, équipes et matchs
   qu'il a vus). ⛔ Le serveur reste l'autorité : il recompte sous son verrou et refuse TOUT si une
   suppression réelle dépasse ce qui a été confirmé — sa réponse porte l'état relu et ce qu'il
   faut confirmer (`a_confirmer`), que l'on redemande une fois, chiffres réels à l'appui.
   ⛔ Le bouton « Valider » (repli sans mode écrans) garde son parcours historique ci-dessous.
   -------------------------------------------------------------------------- */

/** Équipes et matchs rattachés à une catégorie, d'après les listes chargées dans l'écran.
 *  ⚠️ Une indication pour la confirmation, pas une preuve : le serveur recompte. */
function usageLocalCategorie(nom) {
  const cle = cleCategorieChoix(nom);
  const compter = function (liste) {
    return (liste || []).filter(function (x) { return x && cleCategorieChoix(x.categorie) === cle; }).length;
  };
  return { categorie: nom,
    equipes: compter(typeof equipesCourantes !== 'undefined' ? equipesCourantes : []),
    matchs: compter(typeof matchsCourants !== 'undefined' ? matchsCourants : []) };
}

/** « U12 (4 équipes, 6 matchs) » ou « U14 (vide) » — même libellé que le serveur. */
function libelleUsageChoix(u) {
  const parts = [];
  if (u.equipes) parts.push(u.equipes + ' équipe' + (u.equipes > 1 ? 's' : ''));
  if (u.matchs) parts.push(u.matchs + ' match' + (u.matchs > 1 ? 's' : ''));
  return u.categorie + ' (' + (parts.length ? parts.join(', ') : 'vide') + ')';
}

/** Cases et bouton « Valider » figés pendant la confirmation et l'envoi (aucun brouillon perdu). */
function figerChoixCategories(fige) {
  choixCategoriesEnCours = fige;
  const champs = document.getElementById('choix-categories-champs');
  if (champs) champs.disabled = fige;
  const bouton = document.getElementById('bouton-valider-categories');
  if (bouton) bouton.disabled = fige;
}

/**
 * Prépare l'envoi du choix avec les infos : sélection, suppressions à confirmer, confirmation.
 * Sans `aConfirmer`, les suppressions sont déduites de l'état AFFICHÉ (le serveur recompte) ; avec,
 * ce sont celles que le serveur vient de désigner, chiffres réels à l'appui — ajoutées à celles
 * `dejaConfirmees` au premier tour, qui ne sont pas redemandées.
 * ⭐ Fige les cases jusqu'à `libererChoixCategories` — une annulation les libère aussitôt.
 * @return {Promise<Object>} { statut: 'pret' | 'annule' | 'occupe', envoi, selection, confirmees }
 */
async function preparerEnvoiChoixCategories(aConfirmer, dejaConfirmees) {
  if (choixCategoriesEnCours && !aConfirmer) return { statut: 'occupe' };
  const selection = selectionChoixCategories();
  figerChoixCategories(true);
  const vues = {};
  const retirees = (aConfirmer || categoriesRetireesChoix(configCourante, selection).map(function (c) {
    return usageLocalCategorie(c.categorie);
  })).filter(function (u) {
    const cle = cleCategorieChoix(u.categorie);
    if (vues[cle]) return false;
    vues[cle] = true;
    return true;
  });
  if (retirees.length) {
    let confirme = false;
    try {
      confirme = await dialogConfirmer((aConfirmer
      ? 'Le serveur a trouvé à supprimer : ' : 'Supprimer les catégories ') +
      retirees.map(libelleUsageChoix).join(', ') +
      (aConfirmer ? '. Supprimer ces catégories' : '') +
      ' et tous leurs réglages ? Les équipes et les matchs seront conservés. ' +
      'Leurs catégories devront être réaffectées si nécessaire.',
      { ok: 'Supprimer et enregistrer', danger: true });
    } finally {
      if (!confirme) figerChoixCategories(false);   // annulée ou boîte en panne : rien n'est figé
    }
    if (!confirme) {
      afficherMessageChoixCategories(document.getElementById('message-choix-categories'),
        'Enregistrement annulé. Aucune modification envoyée ; ton choix reste à enregistrer.', '');
      return { statut: 'annule' };
    }
  }
  const confirmees = (dejaConfirmees || []).filter(function (c) {
    return !vues[cleCategorieChoix(c.categorie)];
  }).concat(retirees).map(function (u) {
    return { categorie: String(u.categorie), equipes: u.equipes || 0, matchs: u.matchs || 0 };
  });
  return { statut: 'pret', selection: selection, confirmees: confirmees,
    envoi: { categories_choisies: selection.slice(), suppressions_confirmees: confirmees } };
}

/** Fin de l'envoi, quelle qu'en soit l'issue : les cases redeviennent modifiables. */
function libererChoixCategories() {
  figerChoixCategories(false);
}

/** La réponse porte-t-elle le bilan des catégories (backend au contrat, choix appliqué) ? */
function reponseCategoriesExploitable(res) {
  return !!(res && res.contrat === 'ecriture-v1' && res.categories && Array.isArray(res.categories.presentes) &&
    res.config && res.config.global && Array.isArray(res.config.categories));
}

/** Refus structuré du serveur : une suppression réelle dépasse ce qui a été confirmé. */
function refusSuppressionCategories(err) {
  const r = err && err.reponse;
  return (r && r.code === 'suppression_a_confirmer' && Array.isArray(r.a_confirmer)) ? r : null;
}

/**
 * Applique la réponse du serveur : l'écran prend l'état RELU sous son verrou.
 * ⛔ Si cet état ne correspond pas EXACTEMENT au choix envoyé, le choix reste à enregistrer.
 * @return {boolean} vrai si le choix est confirmé
 */
function appliquerChoixCategoriesEnregistre(res, selection) {
  const message = document.getElementById('message-choix-categories');
  libererChoixCategories();
  rendreCategoriesChoix(res.config);
  if (!choixCategoriesConfirme(res.config, selection)) {
    choixCategoriesModifie = true;
    afficherMessageChoixCategories(message,
      '⚠️ Le serveur ne confirme pas exactement le choix affiché. Son état a été repris ; vérifie les cases puis enregistre à nouveau.', 'ko');
    return false;
  }
  choixCategoriesModifie = false;
  majChoixCategoriesTournoi();
  const presentes = (res.config.categories || []).some(estPresente);
  afficherMessageChoixCategories(message, presentes
    ? '✅ Catégories enregistrées. Les réglages des catégories cochées, les équipes et les matchs sont conservés.'
    : 'Choisis au moins une catégorie pour pouvoir vérifier la date.', presentes ? 'ok' : '');
  return true;
}

/** Refus du serveur : son état relu remplace l'affichage ; le choix de l'organisateur reste en brouillon. */
function appliquerRefusChoixCategories(refus) {
  const cfg = refus && refus.config;
  if (cfg && cfg.global && Array.isArray(cfg.categories)) rendreCategoriesChoix(cfg);
  choixCategoriesModifie = true;
}

/**
 * Réponse perdue ou erreur serveur APRÈS l'envoi : relecture SEULE, jamais de rejeu.
 * @return {Promise<string>} 'confirme' (le serveur a l'état voulu), 'a_valider' ou 'inconnu'
 */
async function reconcilierChoixCategoriesApresEchec(selection) {
  const message = document.getElementById('message-choix-categories');
  libererChoixCategories();
  let relue;
  try {
    relue = await lireConfigAdmin(undefined, { delaiMs: 30000 });
  } catch (_) {
    choixCategoriesModifie = true;
    masquerCategoriesChoixIncertaines();
    afficherMessageChoixCategories(message, '⚠️ Enregistrement non confirmé et relecture indisponible : les vues concernées sont à vérifier.', 'ko');
    return 'inconnu';
  }
  rendreCategoriesChoix(relue);
  if (choixCategoriesConfirme(relue, selection)) {
    choixCategoriesModifie = false;
    majChoixCategoriesTournoi();
    afficherMessageChoixCategories(message, '✅ Choix des catégories confirmé par relecture du serveur. Aucune écriture répétée.', 'ok');
    return 'confirme';
  }
  choixCategoriesModifie = true;
  afficherMessageChoixCategories(message,
    '⚠️ Choix non confirmé : l’état actuel a été relu ; ton choix reste à enregistrer.', 'ko');
  return 'a_valider';
}

async function onValiderChoixCategories(e, options) {
  e.preventDefault();
  // Écran « Infos du tournoi » : « Valider » y est masqué et c'est « Enregistrer les informations »
  // qui applique le choix (une requête). Entrée sur une case SOUMET pourtant ce formulaire : sans
  // cette garde, le clavier relançait l'ancien parcours (relecture + une écriture par catégorie).
  // ⛔ Bouton visible (repli sans mode écrans) ou appel du repli d'« Enregistrer » : rien ne change.
  const boutonValider = document.getElementById('bouton-valider-categories');
  if (e.type === 'submit' && boutonValider && boutonValider.hidden) return;
  if (choixCategoriesEnCours) return;
  if (verificationCategoriesEnCours && !choixCategoriesModifie) return;
  const message = document.getElementById('message-choix-categories');
  const bouton = document.getElementById('bouton-valider-categories');
  const champs = document.getElementById('choix-categories-champs');
  const selection = selectionChoixCategories();
  // Invalide une éventuelle vérification de fond appartenant au choix précédent.
  invaliderLecturesCategories();
  let proprietaire = versionCategoriesCourante();
  choixCategoriesEnCours = true;
  choixCategoriesModifie = true;
  bouton.disabled = true;
  champs.disabled = true;
  bouton.textContent = 'Validation…';
  if (typeof invaliderConformiteFFRAffichee === 'function') invaliderConformiteFFRAffichee();
  afficherMessageChoixCategories(message, 'Lecture des catégories enregistrées…', '');
  let ecritureTentee = false;
  let valide = false;
  let verifierEnArrierePlan = false;
  try {
    // État frais obligatoire, aussi lors d'une reprise après une réponse perdue.
    const cfg = await lireConfigAdmin(undefined, { delaiMs: 30000 });
    const retirees = categoriesRetireesChoix(cfg, selection);
    // Repli d'« Enregistrer les informations » face à un backend d'avant le contrat : ce qui vient
    // d'y être confirmé n'est pas redemandé. Sans option (bouton « Valider »), rien ne change.
    const dejaConfirmees = ((options && options.dejaConfirmees) || []).map(cleCategorieChoix);
    const aConfirmer = retirees.some(function (c) { return dejaConfirmees.indexOf(cleCategorieChoix(c.categorie)) === -1; });
    if (aConfirmer) {
      // Le verrou est déjà posé, y compris pendant cette confirmation asynchrone.
      const confirme = await dialogConfirmer('Supprimer les catégories ' +
        retirees.map(function (c) { return c.categorie; }).join(', ') +
        ' et tous leurs réglages ? Les équipes et les matchs seront conservés. ' +
        'Leurs catégories devront être réaffectées si nécessaire.',
      { ok: 'Supprimer et valider', danger: true });
      if (!confirme) {
        afficherMessageChoixCategories(message, 'Validation annulée. Aucune modification envoyée ; ton choix reste à valider.', '');
        return;
      }
    }
    for (const categorie of retirees) {
      afficherMessageChoixCategories(message, 'Suppression de ' + categorie.categorie + ' et de ses réglages…', '');
      ecritureTentee = true;
      await ecrireAdmin('supprimerCategorie', { categorie: categorie.categorie }, { delaiMs: 30000 });
      cfg.categories = (cfg.categories || []).filter(function (c) {
        return cleCategorieChoix(c.categorie) !== cleCategorieChoix(categorie.categorie);
      });
    }
    for (const nom of selection) {
      const existante = (cfg.categories || []).find(function (c) {
        return cleCategorieChoix(c.categorie) === cleCategorieChoix(nom);
      });
      if (existante && estPresente(existante)) continue;
      // Réactiver une catégorie existante conserve nom exact et TOUS ses réglages.
      const data = existante ? Object.assign({}, existante, { presente: 'oui' }) : nouvelleCategorieChoisie(nom);
      afficherMessageChoixCategories(message, 'Enregistrement de ' + nom + '…', '');
      ecritureTentee = true;
      await ecrireAdmin('enregistrerCategorie', data, { delaiMs: 30000 });
      if (!existante) (cfg.categories || (cfg.categories = [])).push(data);
      else Object.assign(existante, data);
    }
    // Chaque écriture de catégorie invalide les lectures avant et après son POST.
    // La vérification de fond doit donc posséder la révision obtenue APRÈS le lot,
    // sinon sa propre réponse serait systématiquement considérée comme ancienne.
    proprietaire = versionCategoriesCourante();
    // Une réponse explicite de succès permet d'afficher immédiatement l'état attendu.
    // La présence et l'absence sont ensuite contrôlées sans bloquer le formulaire.
    const relue = cfg;
    if (!choixCategoriesConfirme(relue, selection)) throw new Error('Le choix local confirmé est incohérent.');
    rendreCategoriesChoix(relue);
    choixCategoriesModifie = false;
    valide = true;
    verifierEnArrierePlan = ecritureTentee;
    if (verifierEnArrierePlan) verificationCategoriesEnCours = proprietaire;
    const presentes = (relue.categories || []).some(estPresente);
    afficherMessageChoixCategories(message, presentes
      ? '✅ Catégories validées. Les réglages des catégories cochées, les équipes et les matchs sont conservés. Tu peux choisir la date.'
      : 'Choisis au moins une catégorie pour pouvoir vérifier la date.', presentes ? 'ok' : '');
  } catch (err) {
    let reconciliation = '';
    if (ecritureTentee) {
      // Réconciliation en lecture seule : aucun rejeu automatique, même après 404.
      try {
        const relue = await lireConfigAdmin(undefined, { delaiMs: 30000 });
        rendreCategoriesChoix(relue);
        if (choixCategoriesConfirme(relue, selection)) {
          choixCategoriesModifie = false;
          valide = true;
        }
        reconciliation = 'L’état actuel a été relu ; ton choix reste à valider. ';
      } catch (_) {
        masquerCategoriesChoixIncertaines();
        reconciliation = 'La relecture est indisponible ; les vues concernées sont à vérifier. ';
      }
    }
    if (valide) {
      afficherMessageChoixCategories(message,
        '✅ Choix des catégories confirmé par relecture du serveur après une réponse interrompue. Aucune écriture répétée.', 'ok');
    } else afficherMessageChoixCategories(message, (ecritureTentee
      ? '⚠️ Validation non confirmée : certaines modifications peuvent déjà être enregistrées. '
      : '⚠️ Lecture impossible ; aucune catégorie envoyée. ') +
      reconciliation + 'Clique à nouveau sur Valider pour relire le serveur avant toute modification. ' + expliquerErreurCategories(err), 'ko');
  } finally {
    choixCategoriesEnCours = false;
    bouton.disabled = false;
    champs.disabled = false;
    bouton.textContent = 'Valider';
  }
  if (valide) {
    majChoixCategoriesTournoi();
    // Le contrôle FFR démarre dès que l'écriture est confirmée, sans attendre la
    // relecture de fond. L'appelant peut toutefois attendre la fin des deux tâches.
    const controleFFR = typeof majConformiteFFR === 'function' ? majConformiteFFR() : Promise.resolve();
    const verification = verifierEnArrierePlan
      ? verifierChoixCategoriesEnArrierePlan(proprietaire, selection, message)
      : Promise.resolve(true);
    await Promise.allSettled([controleFFR, verification]);
    if (verificationCategoriesEnCours === proprietaire) verificationCategoriesEnCours = 0;
  }
}
