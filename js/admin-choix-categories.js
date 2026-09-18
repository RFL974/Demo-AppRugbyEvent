/* Choix des cinq catégories : retrait confirmé de la ligne Config uniquement.
 * Une validation relit le serveur avant toute écriture. Après une réponse perdue,
 * le prochain clic relit donc aussi les catégories éventuellement déjà créées. */
const CHOIX_CATEGORIES_TOURNOI = Object.freeze(['U6', 'U8', 'U10', 'U12', 'U14']);
let choixCategoriesEnCours = false;
let choixCategoriesModifie = false;

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

async function onValiderChoixCategories(e) {
  e.preventDefault();
  if (choixCategoriesEnCours) return;
  const message = document.getElementById('message-choix-categories');
  const bouton = document.getElementById('bouton-valider-categories');
  const champs = document.getElementById('choix-categories-champs');
  const selection = selectionChoixCategories();
  choixCategoriesEnCours = true;
  choixCategoriesModifie = true;
  bouton.disabled = true;
  champs.disabled = true;
  bouton.textContent = 'Validation…';
  if (typeof invaliderConformiteFFRAffichee === 'function') invaliderConformiteFFRAffichee();
  afficherMessageChoixCategories(message, 'Lecture des catégories enregistrées…', '');
  let ecritureTentee = false;
  let valide = false;
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
      await ecrireAdmin('supprimerCategorie', { categorie: categorie.categorie });
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
      await ecrireAdmin('enregistrerCategorie', data);
      if (!existante) (cfg.categories || (cfg.categories = [])).push(data);
      else Object.assign(existante, data);
    }
    // Un acquittement seul ne prouve pas la suppression : vérifier l'absence aussi.
    const relue = ecritureTentee ? await lireConfigAdmin(undefined, { delaiMs: 30000 }) : cfg;
    if (!selection.every(function (nom) {
      return (relue.categories || []).some(function (c) {
        return cleCategorieChoix(c.categorie) === cleCategorieChoix(nom) && estPresente(c);
      });
    }) || categoriesRetireesChoix(relue, selection).length) {
      throw new Error('La présence des catégories choisies ou le retrait des catégories décochées reste à confirmer.');
    }
    rendreCategoriesChoix(relue);
    choixCategoriesModifie = false;
    valide = true;
    const presentes = (relue.categories || []).some(estPresente);
    afficherMessageChoixCategories(message, presentes
      ? '✅ Catégories validées. Les réglages des catégories cochées, les équipes et les matchs sont conservés. Tu peux choisir la date.'
      : 'Choisis au moins une catégorie pour pouvoir vérifier la date.', presentes ? 'ok' : '');
  } catch (err) {
    let reconciliation = '';
    if (ecritureTentee) {
      // Réconciliation en lecture seule : aucun rejeu automatique, même après 404.
      try {
        rendreCategoriesChoix(await lireConfigAdmin(undefined, { delaiMs: 30000 }));
        reconciliation = 'L’état actuel a été relu ; ton choix reste à valider. ';
      } catch (_) {
        masquerCategoriesChoixIncertaines();
        reconciliation = 'La relecture est indisponible ; les vues concernées sont à vérifier. ';
      }
    }
    afficherMessageChoixCategories(message, (ecritureTentee
      ? '⚠️ Validation non confirmée : certaines modifications peuvent déjà être enregistrées. '
      : '⚠️ Lecture impossible ; aucune catégorie envoyée. ') +
      reconciliation + 'Clique à nouveau sur Valider pour relire le serveur avant toute modification. ' + err.message, 'ko');
  } finally {
    choixCategoriesEnCours = false;
    bouton.disabled = false;
    champs.disabled = false;
    bouton.textContent = 'Valider';
  }
  if (valide) {
    majChoixCategoriesTournoi();
    if (typeof majConformiteFFR === 'function') await majConformiteFFR();
  }
}
