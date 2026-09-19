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
  afficherMessageChoixCategories(document.getElementById('message-choix-categories'), retirees.length
    ? 'À la validation, ' + retirees.map(function (c) { return c.categorie; }).join(', ') +
      ' et leurs réglages seront supprimés après confirmation. Les équipes et les matchs seront conservés.'
    : 'Valide ce choix pour actualiser les catégories et le contrôle de date.', '');
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

async function onValiderChoixCategories(e) {
  e.preventDefault();
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
    if (retirees.length) {
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
