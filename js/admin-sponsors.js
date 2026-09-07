/**
 * ============================================================================
 *  ADMIN — écran « Partenaires »
 * ============================================================================
 *
 *  Trois cartes, dans l'ordre où on s'en sert :
 *   1. Réglages d'affichage  — interrupteur général, durées, fréquence de l'interstitiel ;
 *   2. Fiches partenaires    — création / modification / suppression, logo sur Drive ;
 *   3. Fiche de visibilité   — ce qu'on renvoie au partenaire après l'événement.
 *
 *  MESURE CONSOLIDÉE ENTRE TOUS LES APPAREILS. Chaque navigateur qui affiche des
 *  partenaires remonte ses compteurs (voir sponsors.js) ; la carte « fiche de visibilité »
 *  les additionne ici et annonce la portée réelle (« mesuré sur N appareils »). Si aucun
 *  relevé n'est encore arrivé, elle retombe sur les compteurs de l'appareil courant — et
 *  le dit, plutôt que de laisser croire à une audience non mesurée.
 *
 *  Nécessite (chargés AVANT) : commun.js, api.js, admin.js (redimensionnerImage,
 *  brancherZoneImage, urlAffiche), sponsors.js.
 * ============================================================================
 */

let sponsorsAdmin = [];          // fiches telles que renvoyées par le backend
let sponsorsConsolide = null;    // relevés de TOUS les appareils, consolidés (null = pas encore lu)
let sponsorLogoDataURI = null;   // logo choisi mais pas encore enregistré
let sponsorLogoRetirer = false;  // l'utilisateur a demandé à retirer le logo existant

/* ==========================================================================
   DÉMARRAGE
   ========================================================================== */

function initAdminSponsors() {
  if (!document.getElementById('bloc-sponsors-liste')) return;

  document.getElementById('form-sponsors-reglages')
    .addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('form-sponsor')
    .addEventListener('submit', function (e) { e.preventDefault(); });

  document.getElementById('bouton-enregistrer-sponsors-reglages')
    .addEventListener('click', onEnregistrerReglagesSponsors);
  document.getElementById('bouton-tester-interstitiel')
    .addEventListener('click', onTesterInterstitiel);
  document.querySelector('[name="sponsor_interstitiel_actif"]')
    .addEventListener('change', majLignesInterstitiel);

  construireEmplacements();
  // Le nom, l'accroche, la couleur et la taille générale vivent HORS du panneau des
  // emplacements mais alimentent chaque aperçu : on écoute donc tout le formulaire.
  document.getElementById('form-sponsor').addEventListener('input', rafraichirApercusEmplacements);
  document.getElementById('bouton-enregistrer-sponsor').addEventListener('click', onEnregistrerSponsor);
  document.getElementById('bouton-annuler-sponsor').addEventListener('click', reinitialiserFormSponsor);
  document.getElementById('liste-sponsors').addEventListener('click', onClicListeSponsors);

  brancherZoneImage({
    champFichier: '#form-sponsor [name="sponsor_logo"]',
    zoneDepot: 'zone-depot-sponsor-logo',
    traiter: traiterFichierLogoSponsor
  });
  document.getElementById('bouton-retirer-sponsor-logo').addEventListener('click', onRetirerLogoSponsor);

  document.getElementById('bouton-rafraichir-bilan').addEventListener('click', chargerMesuresSponsors);
  document.getElementById('bouton-imprimer-bilan').addEventListener('click', function () { window.print(); });
  document.getElementById('bouton-exporter-bilan').addEventListener('click', onExporterBilanCsv);
  document.getElementById('bouton-vider-bilan').addEventListener('click', onViderBilan);
  document.getElementById('bouton-tester-remontee').addEventListener('click', onTesterRemontee);
  document.getElementById('bouton-verifier-public').addEventListener('click', onVerifierPublic);
  document.getElementById('projection-appareils').addEventListener('input', afficherBilanSponsors);
}

/** Appelé par admin.js une fois la config chargée : remplit les réglages puis la liste. */
async function majSponsors() {
  if (!document.getElementById('bloc-sponsors-liste')) return;
  injecterReglagesSponsors(configCourante.global || {});
  await chargerSponsors();
  await chargerMesuresSponsors();
}

/**
 * Récupère les relevés déposés par les navigateurs des spectateurs et les consolide.
 * En cas d'échec (backend pas encore redéployé, réseau), on retombe sur les compteurs
 * de CET appareil : la fiche reste affichable, et elle le dit.
 */
async function chargerMesuresSponsors() {
  const zone = document.getElementById('bilan-sponsors');
  if (zone) zone.innerHTML = '<div class="message">Lecture des relevés…</div>';
  try {
    const r = await apiPostProtege('lireMesuresSponsors', {}, 'admin', 'admin');
    if (r && r.releves) {
      sponsorsConsolide = sponsorsConsolider(r.releves);
      sponsorsConsolide.jour = r.jour;
      sponsorsConsolide.totalToutesJournees = r.total || 0;
      sponsorsConsolide.jours = r.jours || {};
    } else {
      sponsorsConsolide = null;
    }
  } catch (err) {
    sponsorsConsolide = null;
  }
  afficherBilanSponsors();
}

/* ==========================================================================
   1. RÉGLAGES D'AFFICHAGE
   ========================================================================== */

/** Les cases à cocher de la carte réglages, avec leur défaut (miroir du backend). */
const SPONSORS_CASES = {
  sponsors_actifs: false,
  sponsors_mur_actif: true,
  sponsor_barre_mobile: true,
  sponsor_interstitiel_actif: false,
  sponsor_interstitiel_premiere_visite: false
};
/** Les champs numériques, avec leur défaut. */
const SPONSORS_NOMBRES = {
  sponsor_rotation_s: 8,
  sponsor_interstitiel_duree_s: 5,
  sponsor_interstitiel_skip_s: 2,
  sponsor_interstitiel_repos_min: 30
};

function injecterReglagesSponsors(global) {
  const form = document.getElementById('form-sponsors-reglages');
  Object.keys(SPONSORS_CASES).forEach(function (cle) {
    const v = String(global[cle] || '').toLowerCase();
    form[cle].checked = v ? (v === 'oui') : SPONSORS_CASES[cle];
  });
  Object.keys(SPONSORS_NOMBRES).forEach(function (cle) {
    const n = parseInt(global[cle], 10);
    form[cle].value = isFinite(n) ? n : SPONSORS_NOMBRES[cle];
  });
  majLignesInterstitiel();
}

/** Les réglages de durée n'ont de sens que si le plein écran est activé. */
function majLignesInterstitiel() {
  const actif = document.querySelector('[name="sponsor_interstitiel_actif"]').checked;
  document.getElementById('lignes-interstitiel').hidden = !actif;
}

async function onEnregistrerReglagesSponsors() {
  const form = document.getElementById('form-sponsors-reglages');
  const message = document.getElementById('message-sponsors-reglages');
  const data = {};
  Object.keys(SPONSORS_CASES).forEach(function (cle) { data[cle] = form[cle].checked ? 'oui' : 'non'; });
  Object.keys(SPONSORS_NOMBRES).forEach(function (cle) { data[cle] = form[cle].value; });

  // Garde-fou côté écran (le backend le refait) : « Passer » ne peut pas arriver après la
  // fermeture automatique, sinon le message serait impossible à écourter.
  if (Number(data.sponsor_interstitiel_skip_s) > Number(data.sponsor_interstitiel_duree_s)) {
    data.sponsor_interstitiel_skip_s = data.sponsor_interstitiel_duree_s;
    form.sponsor_interstitiel_skip_s.value = data.sponsor_interstitiel_duree_s;
  }

  await avecBoutonOccupe(document.getElementById('bouton-enregistrer-sponsors-reglages'), message, async function () {
    const r = await apiPostProtege('enregistrerReglagesSponsors', data, 'admin', 'admin');
    if (r.error) { afficherMessage(message, '⚠️ ' + r.error, 'ko'); return; }
    Object.keys(data).forEach(function (cle) { configCourante.global[cle] = data[cle]; });
    afficherMessage(message, data.sponsors_actifs === 'oui'
      ? '✅ Réglages enregistrés — les partenaires sont visibles sur la page publique.'
      : '✅ Réglages enregistrés — les partenaires restent masqués (interrupteur général sur « non »).', 'ok');
  });
}

/**
 * Aperçu du message plein écran, avec les réglages COURANTS du formulaire (même ceux qui ne
 * sont pas encore enregistrés) : on voit ce qu'on s'apprête à publier avant de le publier.
 */
function onTesterInterstitiel() {
  const form = document.getElementById('form-sponsors-reglages');
  const message = document.getElementById('message-sponsors-reglages');
  const candidats = sponsorsPourEmplacement(sponsorsActifsAdmin(), 'plein');
  if (!candidats.length) {
    afficherMessage(message,
      '⚠️ Aucun partenaire n\'est coché sur l\'emplacement « Message plein écran ».', 'ko');
    return;
  }
  const reglages = {
    pleinDureeS: Math.max(3, Math.min(10, Number(form.sponsor_interstitiel_duree_s.value) || 5)),
    pleinSkipS: Math.max(0, Math.min(10, Number(form.sponsor_interstitiel_skip_s.value) || 0))
  };
  if (reglages.pleinSkipS > reglages.pleinDureeS) reglages.pleinSkipS = reglages.pleinDureeS;
  sponsorsAfficherPlein(sponsorsTirer('plein', candidats, true), reglages);
}


/* ==========================================================================
   EMPLACEMENTS ET LEURS RÉGLAGES
   --------------------------------------------------------------------------
   Un même logo ne se comporte pas pareil dans un bandeau large, dans une barre
   basse de téléphone et sur une feuille imprimée. Chaque emplacement coché ouvre
   donc SES propres réglages : le texte qui accompagne le logo, sa taille, et sa
   disposition dans l'encart. Laisser un champ vide reprend le réglage général du
   partenaire, puis le défaut de l'emplacement — ne rien saisir marche donc aussi.
   ========================================================================== */

/** Ce que chaque emplacement est, en une phrase — pour choisir sans deviner. */
const SPONSORS_EMPLACEMENT_AIDE = {
  bandeau: 'Page des scores — bandeau permanent en haut de page.',
  rail:    'Page des scores — colonne de droite sur ordinateur, barre basse sur téléphone. Rotatif.',
  fil:     'Page des scores — encart glissé dans le fil des résultats.',
  plein:   'Page des scores — message plein écran à l\'arrivée.',
  mur:     'Page des scores — grille de tous les logos, en bas de page.',
  dossier: 'Dossier club — bandeau permanent en tête, imprimé avec le PDF.'
};

/** Dispositions proposées, dans l'ordre où on les essaie en pratique. */
const SPONSORS_DISPO_LIBELLES = [
  ['gauche', 'Logo à gauche du texte'],
  ['droite', 'Logo à droite du texte'],
  ['haut',   'Logo au-dessus du texte'],
  ['seul',   'Logo seul, sans texte']
];

/** Forme courte : la liste déroulante est étroite, un libellé long y serait tronqué. */
const SPONSORS_DISPO_COURT = {
  gauche: 'logo à gauche', droite: 'logo à droite',
  haut: 'logo au-dessus', seul: 'logo seul'
};

/**
 * Taille de référence du logo à L'APERÇU, en pixels — les mêmes valeurs que les feuilles
 * de style publiques (`--sp-ref`), version grand écran. L'aperçu montre donc la taille
 * RÉELLE du logo dans son encart, pas une vignette décorative.
 */
const SPONSORS_APERCU_REF = { bandeau: 84, rail: 56, fil: 50, plein: 84, mur: 62, dossier: 52 };

/**
 * Largeur RÉELLE de chaque encart, en pixels — la place dont le partenaire dispose là-bas.
 *
 * Sans elle, l'aperçu s'étalait sur toute la largeur de la carte d'admin et montrait une
 * accroche bien à plat, là où le vrai encart, plus étroit, la coupait en morceaux. Un aperçu
 * plus large que la réalité est pire que pas d'aperçu : il rassure à tort.
 */
const SPONSORS_APERCU_LARGEUR = {
  bandeau: 780,   // carte de la page publique
  rail:    230,   // colonne de droite (260 px moins ses marges)
  fil:     560,   // encart au gabarit d'une carte de match
  plein:   380,   // carte du message plein écran
  mur:     150,   // tuile de la grille de logos
  dossier: 640    // largeur utile du bandeau, marges de la feuille déduites
};

/** Construit le panneau : une case par emplacement, chacune dépliant ses réglages. */
function construireEmplacements() {
  const zone = document.getElementById('sponsor-emplacements');
  if (!zone) return;
  zone.innerHTML = SPONSORS_EMPLACEMENTS.map(function (e, i) {
    const lettre = String.fromCharCode(65 + i);
    // Le défaut de l'emplacement est ANNONCÉ : « Défaut » tout court laissait croire que
    // le texte saisi s'afficherait, alors que le dossier club, par exemple, part sur
    // « logo seul » — donc sans aucun texte. Ne rien choisir doit rester prévisible.
    const defaut = SPONSORS_DISPO_DEFAUT[e] || 'gauche';
    return '<div class="sp-emp" data-emplacement="' + e + '">' +
      '<label class="mini-toggle sp-emp-tete">' +
        '<input type="checkbox" name="emp_' + e + '"' + (e === 'mur' ? ' checked' : '') + '> ' +
        '<b>' + lettre + '</b> ' + echapper(SPONSORS_LIBELLES[e].replace(/^[A-F] · /, '')) +
      '</label>' +
      '<p class="sp-emp-aide">' + echapper(SPONSORS_EMPLACEMENT_AIDE[e] || '') + '</p>' +
      '<div class="sp-emp-reglages" hidden>' +
        '<label class="reglage"><span class="r-libelle">Texte affiché ici</span>' +
          '<input class="r-input" type="text" name="txt_' + e + '" maxlength="80" ' +
            'placeholder="Vide = l\'accroche du partenaire"></label>' +
        '<p class="sp-emp-muet" hidden>Disposition « logo seul » : ce texte ne sera pas affiché ' +
          'dans cet encart. Choisis une autre disposition pour le faire apparaître.</p>' +
        '<label class="reglage"><span class="r-libelle">Taille du logo (%)</span>' +
          '<input class="r-input" type="number" name="zoom_' + e + '" min="50" max="200" step="10" ' +
            'placeholder="Vide = taille du partenaire"></label>' +
        '<label class="reglage"><span class="r-libelle">Disposition</span>' +
          '<select class="r-input" name="dispo_' + e + '">' +
            '<option value="">Défaut : ' + echapper(SPONSORS_DISPO_COURT[defaut] || defaut) + '</option>' +
            SPONSORS_DISPO_LIBELLES.map(function (d) {
              return '<option value="' + d[0] + '">' + echapper(d[1]) + '</option>';
            }).join('') +
          '</select></label>' +
        '<div class="sp-emp-apercu">' +
          '<span class="sp-emp-apercu-titre">Aperçu de cet encart</span>' +
          '<div class="sp-emp-rendu"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  // Les réglages d'un emplacement n'ont de sens que s'il est coché ; et tout changement
  // se voit tout de suite dans l'aperçu — c'est lui qui répond à « pourquoi mon texte
  // n'apparaît pas ? » sans avoir à enregistrer puis recharger le dossier.
  zone.addEventListener('change', function (e) {
    if (e.target && /^emp_/.test(e.target.name || '')) majReglagesEmplacement(e.target);
    rafraichirApercusEmplacements();
  });
  zone.addEventListener('input', rafraichirApercusEmplacements);
}

/** Déplie ou replie les réglages d'un emplacement selon sa case. */
function majReglagesEmplacement(caseACocher) {
  const bloc = caseACocher.closest('.sp-emp');
  if (!bloc) return;
  bloc.classList.toggle('est-actif', caseACocher.checked);
  bloc.querySelector('.sp-emp-reglages').hidden = !caseACocher.checked;
}

/** Applique l'état déplié/replié à tous les emplacements (après remplissage du formulaire). */
function majTousReglagesEmplacements() {
  const form = document.getElementById('form-sponsor');
  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    if (form['emp_' + e]) majReglagesEmplacement(form['emp_' + e]);
  });
  rafraichirApercusEmplacements();
}

/**
 * Partenaire FICTIF construit à partir de l'état courant du formulaire — y compris ce qui
 * n'est pas encore enregistré. C'est ce que le moteur d'affichage (sponsors.js) recevrait
 * si on publiait maintenant : l'aperçu passe donc par exactement le même code que la page
 * publique et le dossier club, et ne peut pas mentir sur le résultat.
 */
function sponsorDepuisFormulaire() {
  const form = document.getElementById('form-sponsor');
  if (!form) return null;
  return {
    id_sponsor: form.id_sponsor.value || '__apercu__',
    nom: form.nom.value.trim() || 'Nom du partenaire',
    accroche: form.accroche.value.trim(),
    couleur: form.couleur.value,
    // Logo pas encore téléversé : on met un identifiant factice pour que le moteur produise
    // bien une <img> (dont on remplacera la source par l'image locale) plutôt que la
    // pastille de repli — sinon l'aperçu montrerait autre chose que le résultat final.
    logo_id: sponsorLogoDataURI ? '__local__'
           : (sponsorLogoRetirer ? '' : (fichePartenaireCourante('logo_id') || '')),
    logo_zoom: form.logo_zoom.value,
    // Un objet neuf à chaque appel : sponsorsReglagesBruts met son résultat en cache sur
    // la fiche (`__reglages`), un objet réutilisé figerait l'aperçu au premier rendu.
    reglages_emplacements: JSON.stringify(lireReglagesEmplacements())
  };
}

/** Valeur d'un champ de la fiche en cours de modification (vide en création). */
function fichePartenaireCourante(champ) {
  const id = document.getElementById('form-sponsor').id_sponsor.value;
  if (!id) return '';
  const s = sponsorsAdmin.filter(function (x) { return String(x.id_sponsor) === String(id); })[0];
  return s ? String(s[champ] || '') : '';
}

/** Redessine l'aperçu de chaque emplacement coché, avec les réglages courants du formulaire. */
function rafraichirApercusEmplacements() {
  const zone = document.getElementById('sponsor-emplacements');
  const fiche = sponsorDepuisFormulaire();
  if (!zone || !fiche) return;

  const form = document.getElementById('form-sponsor');

  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    const bloc = zone.querySelector('.sp-emp[data-emplacement="' + e + '"]');
    if (!bloc) return;
    const rendu = bloc.querySelector('.sp-emp-rendu');
    const muet = bloc.querySelector('.sp-emp-muet');
    if (!rendu) return;

    // Emplacement décoché : ses réglages sont repliés, inutile d'aller chercher le logo
    // pour un aperçu que personne ne voit.
    if (!form['emp_' + e] || !form['emp_' + e].checked) {
      rendu.innerHTML = '';
      if (muet) muet.hidden = true;
      return;
    }

    const reg = sponsorsReglageEmplacement(fiche, e);
    if (muet) muet.hidden = (reg.dispo !== 'seul');

    rendu.className = 'sp-emp-rendu sp-dispo-' + reg.dispo;
    rendu.style.setProperty('--sp-ref', (SPONSORS_APERCU_REF[e] || 52) + 'px');
    // L'aperçu occupe la largeur du VRAI encart, pas celle de la carte d'admin : c'est cette
    // contrainte-là qui décide si l'accroche tient sur une ligne ou se casse en morceaux.
    rendu.style.setProperty('--sp-largeur', (SPONSORS_APERCU_LARGEUR[e] || 400) + 'px');
    rendu.innerHTML = sponsorsCorps(fiche, e, '');

    // Logo choisi mais pas encore téléversé : il n'a pas d'identifiant Drive, on branche
    // directement l'image locale pour que l'aperçu soit juste dès le glisser-déposer.
    if (sponsorLogoDataURI) {
      const img = rendu.querySelector('.sp-logo-img');
      if (img) img.src = sponsorLogoDataURI;
    }
  });
}

/** Lit les réglages par emplacement saisis dans le formulaire. */
function lireReglagesEmplacements() {
  const form = document.getElementById('form-sponsor');
  const out = {};
  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    if (!form['emp_' + e] || !form['emp_' + e].checked) return;   // décoché ⇒ rien à retenir
    const bloc = {};
    const texte = (form['txt_' + e].value || '').trim();
    const zoom = parseInt(form['zoom_' + e].value, 10);
    const dispo = form['dispo_' + e].value;
    if (texte) bloc.texte = texte;
    if (isFinite(zoom)) bloc.zoom = zoom;
    if (dispo) bloc.dispo = dispo;
    if (Object.keys(bloc).length) out[e] = bloc;
  });
  return out;
}

/** Remplit les réglages par emplacement depuis une fiche existante. */
function injecterReglagesEmplacements(s) {
  const form = document.getElementById('form-sponsor');
  const reglages = sponsorsReglagesBruts(s) || {};
  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    const r = reglages[e] || {};
    form['txt_' + e].value = r.texte || '';
    form['zoom_' + e].value = isFinite(parseInt(r.zoom, 10)) ? parseInt(r.zoom, 10) : '';
    form['dispo_' + e].value = r.dispo || '';
  });
}

/* ==========================================================================
   2. FICHES PARTENAIRES
   ========================================================================== */

/** Fiches actives, au format attendu par le moteur d'affichage (sponsors.js). */
function sponsorsActifsAdmin() {
  return sponsorsAdmin
    .filter(function (s) { return String(s.actif || '').toLowerCase() === 'oui'; })
    .map(function (s) {
      const c = {};
      Object.keys(s).forEach(function (k) { c[k] = (s[k] === null || s[k] === undefined) ? '' : String(s[k]); });
      return c;
    });
}

async function chargerSponsors() {
  const zone = document.getElementById('liste-sponsors');
  try {
    const r = await apiPostProtege('listerSponsors', {}, 'admin', 'admin');
    sponsorsAdmin = (r && r.sponsors) || [];
  } catch (err) {
    zone.innerHTML = '<p class="vide">Erreur de chargement des partenaires : ' + echapper(err.message) + '</p>';
    return;
  }
  afficherListeSponsors();
}

function afficherListeSponsors() {
  const zone = document.getElementById('liste-sponsors');
  if (!sponsorsAdmin.length) {
    zone.innerHTML = '<p class="vide">Aucun partenaire pour l\'instant. Ajoute le premier ci-dessous.</p>';
    return;
  }
  let html = '<div class="sponsor-cartes">';
  sponsorsAdmin.forEach(function (s) {
    const actif = String(s.actif || '').toLowerCase() === 'oui';
    const emplacements = String(s.emplacements || '').split(',')
      .map(function (x) { return x.trim(); })
      .filter(Boolean)
      .map(function (x) { return '<span class="sp-tag">' + echapper(etiquetteEmplacement(x)) + '</span>'; })
      .join('');
    html +=
      '<div class="sponsor-carte' + (actif ? '' : ' est-inactif') + '">' +
        '<div class="sponsor-carte-logo">' +
          (s.logo_id
            ? '<img src="' + echapper(urlAffiche(s.logo_id, 240)) + '" alt="' + echapper(s.nom) +
              '" style="--sp-zoom:' + sponsorsReglageEmplacement(s, 'bandeau').zoom + '">'
            : '<span class="sponsor-pastille" style="background:' + echapper(couleurSponsor(s)) + '">' +
              echapper(s.nom) + '</span>') +
        '</div>' +
        '<div class="sponsor-carte-corps">' +
          '<strong>' + echapper(s.nom) + '</strong>' +
          (s.accroche ? '<span class="sponsor-accroche">' + echapper(s.accroche) + '</span>' : '') +
          '<div class="sponsor-tags">' + emplacements +
            '<span class="sp-tag sp-tag-poids">poids ' + echapper(String(s.poids || 1)) + '</span>' +
            (actif ? '' : '<span class="sp-tag sp-tag-off">masqué</span>') +
          '</div>' +
        '</div>' +
        '<div class="sponsor-carte-actions">' +
          '<button type="button" class="bouton-lien" data-action="modifier" data-id="' + echapper(s.id_sponsor) + '">Modifier</button>' +
          '<button type="button" class="bouton-lien danger" data-action="supprimer" data-id="' + echapper(s.id_sponsor) + '">Supprimer</button>' +
        '</div>' +
      '</div>';
  });
  zone.innerHTML = html + '</div>';
}

function etiquetteEmplacement(cle) {
  return (SPONSORS_LIBELLES[cle] || cle).replace(' · ', ' ');
}

function couleurSponsor(s) {
  const c = String(s.couleur || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0C1C2E';
}

function onClicListeSponsors(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  if (btn.getAttribute('data-action') === 'modifier') remplirFormSponsor(id);
  else onSupprimerSponsor(id);
}

function remplirFormSponsor(id) {
  const s = sponsorsAdmin.filter(function (x) { return String(x.id_sponsor) === String(id); })[0];
  if (!s) return;
  const form = document.getElementById('form-sponsor');

  form.id_sponsor.value = s.id_sponsor;
  form.nom.value = s.nom || '';
  form.accroche.value = s.accroche || '';
  form.url.value = s.url || '';
  form.couleur.value = couleurSponsor(s).toLowerCase();
  form.poids.value = s.poids || 1;
  form.ordre.value = s.ordre || 100;
  form.logo_zoom.value = parseInt(s.logo_zoom, 10) || 100;
  form.actif.checked = String(s.actif || '').toLowerCase() === 'oui';

  const emplacements = String(s.emplacements || '').split(',').map(function (x) { return x.trim(); });
  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    form['emp_' + e].checked = emplacements.indexOf(e) >= 0;
  });
  injecterReglagesEmplacements(s);
  majTousReglagesEmplacements();

  sponsorLogoDataURI = null;
  sponsorLogoRetirer = false;
  majApercuLogoSponsor(s.logo_id ? urlAffiche(s.logo_id, 320) : '');

  document.getElementById('titre-form-sponsor').textContent = 'Modifier « ' + s.nom + ' »';
  document.getElementById('bouton-annuler-sponsor').hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function reinitialiserFormSponsor() {
  const form = document.getElementById('form-sponsor');
  form.reset();
  form.id_sponsor.value = '';
  form.couleur.value = '#0c1c2e';
  form.poids.value = 1;
  form.ordre.value = 100;
  form.logo_zoom.value = 100;
  form.actif.checked = true;
  SPONSORS_EMPLACEMENTS.forEach(function (e) {
    form['emp_' + e].checked = (e === 'mur');
    form['txt_' + e].value = '';
    form['zoom_' + e].value = '';
    form['dispo_' + e].value = '';
  });
  majTousReglagesEmplacements();

  sponsorLogoDataURI = null;
  sponsorLogoRetirer = false;
  majApercuLogoSponsor('');

  document.getElementById('titre-form-sponsor').textContent = 'Ajouter un partenaire';
  document.getElementById('bouton-annuler-sponsor').hidden = true;
  afficherMessage(document.getElementById('message-sponsor'), '', 'ok');
}

/** Aperçu du logo (choisi ou déjà enregistré). Vide = zone masquée. */
function majApercuLogoSponsor(src) {
  const bloc = document.getElementById('apercu-sponsor-logo');
  const img = document.getElementById('apercu-sponsor-logo-img');
  if (!src) { bloc.hidden = true; img.removeAttribute('src'); }
  else { img.src = src; bloc.hidden = false; }
  rafraichirApercusEmplacements();  // les aperçus par emplacement montrent le même logo
}

/**
 * Un logo est une petite image : 600 px de côté suffisent largement, et allègent l'envoi.
 *
 * ⚠️ FOND BLANC PEINT, ET SORTIE EN PNG. Un logo de partenaire est presque toujours un PNG
 * détouré. Tout maillon qui aplatit la transparence — encodage JPEG, mais aussi le proxy
 * d'images qui sert les fichiers Drive — le fait ressortir sur un carré NOIR, parce qu'un
 * canevas vierge est transparent-noir. Plutôt que de parier sur le bon comportement de
 * chaque maillon, on peint un fond blanc : il n'y a plus de transparence à rater, et le
 * résultat est le même partout. Les tuiles qui accueillent les logos sont blanches, le fond
 * peint est donc invisible.
 */
async function traiterFichierLogoSponsor(fichier) {
  const message = document.getElementById('message-sponsor');
  if (!fichier) return;
  if (!/^image\//.test(fichier.type)) {
    afficherMessage(message, '⚠️ Choisis une image (PNG, JPEG ou WebP).', 'ko');
    return;
  }
  try {
    sponsorLogoDataURI = await redimensionnerImage(fichier, 600, 0.92, 'image/png', '#FFFFFF');
    sponsorLogoRetirer = false;
    majApercuLogoSponsor(sponsorLogoDataURI);
    afficherMessage(message, 'Logo prêt — clique « Enregistrer le partenaire » pour le sauvegarder.', 'ok');
  } catch (e) {
    afficherMessage(message, '⚠️ Image illisible.', 'ko');
  }
}

function onRetirerLogoSponsor() {
  sponsorLogoDataURI = null;
  sponsorLogoRetirer = true;   // sera transmis au backend à l'enregistrement
  majApercuLogoSponsor('');
  afficherMessage(document.getElementById('message-sponsor'),
    'Logo retiré — clique « Enregistrer le partenaire » pour confirmer.', 'ok');
}

async function onEnregistrerSponsor() {
  const form = document.getElementById('form-sponsor');
  const message = document.getElementById('message-sponsor');

  const nom = form.nom.value.trim();
  if (!nom) { afficherMessage(message, '⚠️ Le nom du partenaire est obligatoire.', 'ko'); return; }

  const emplacements = SPONSORS_EMPLACEMENTS.filter(function (e) { return form['emp_' + e].checked; });
  if (!emplacements.length) {
    afficherMessage(message, '⚠️ Coche au moins un emplacement.', 'ko');
    return;
  }

  const data = {
    id_sponsor: form.id_sponsor.value,
    nom: nom,
    accroche: form.accroche.value.trim(),
    url: form.url.value.trim(),
    couleur: form.couleur.value,
    emplacements: emplacements.join(','),
    poids: form.poids.value,
    ordre: form.ordre.value,
    logo_zoom: form.logo_zoom.value,
    reglages_emplacements: JSON.stringify(lireReglagesEmplacements()),
    actif: form.actif.checked ? 'oui' : 'non'
  };
  if (sponsorLogoDataURI) data.logo = sponsorLogoDataURI;
  if (sponsorLogoRetirer) data.logo_retirer = 'oui';

  await avecBoutonOccupe(document.getElementById('bouton-enregistrer-sponsor'), message, async function () {
    const r = await apiPostProtege('enregistrerSponsor', data, 'admin', 'admin');
    if (r.error) { afficherMessage(message, '⚠️ ' + r.error, 'ko'); return; }
    await chargerSponsors();
    reinitialiserFormSponsor();
    afficherMessage(message, '✅ Partenaire enregistré.', 'ok');
  });
}

async function onSupprimerSponsor(id) {
  const s = sponsorsAdmin.filter(function (x) { return String(x.id_sponsor) === String(id); })[0];
  if (!s) return;
  const message = document.getElementById('message-sponsor');
  const ok = await dialogConfirmer('Supprimer « ' + s.nom + ' » ?\n\n' +
    'Sa fiche et son logo seront supprimés. Pour le retirer de la page SANS perdre sa fiche, ' +
    'décoche plutôt « Partenaire actif ».', { ok: 'Supprimer', danger: true });
  if (!ok) return;
  try {
    const r = await apiPostProtege('supprimerSponsor', { id_sponsor: id }, 'admin', 'admin');
    if (r.error) { afficherMessage(message, '⚠️ ' + r.error, 'ko'); return; }
    await chargerSponsors();
    afficherMessage(message, '✅ Partenaire supprimé.', 'ok');
  } catch (err) {
    afficherMessage(message, '⚠️ ' + err.message, 'ko');
  }
}

/* ==========================================================================
   3. FICHE DE VISIBILITÉ
   ========================================================================== */

/* ==========================================================================
   AUTODIAGNOSTIC DE LA REMONTÉE
   --------------------------------------------------------------------------
   « J'ai déployé, et pourtant la fiche dit qu'aucun relevé n'arrive. » Impossible à
   trancher depuis un écran : la chaîne compte plusieurs maillons (déploiement du
   backend, écriture, relecture). Ce bouton les teste UN PAR UN et nomme celui qui
   casse, au lieu de laisser deviner.

   Le relevé de test porte l'identifiant réservé `__test__`, ignoré par la
   consolidation : il ne pollue jamais la fiche d'un partenaire.
   ========================================================================== */

/** Identifiant réservé au relevé d'autodiagnostic (filtré de toute consolidation). */
var SPONSOR_ID_TEST = '__test__';

async function onTesterRemontee() {
  const zone = document.getElementById('diagnostic-remontee');
  const bouton = document.getElementById('bouton-tester-remontee');
  zone.hidden = false;
  zone.className = 'diagnostic-remontee';
  zone.innerHTML = '<p>⏳ Test en cours…</p>';
  bouton.disabled = true;

  const lignes = [];
  let verdict = '';
  let classe = 'diag-ok';

  try {
    // ÉTAPE 1 — l'écriture publique. C'est elle qui dira si le backend en service
    // connaît la nouvelle action, donc si le redéploiement a réellement pris.
    const marque = 'diag' + Math.random().toString(36).slice(2, 10);
    const releve = {
      appareil: marque,
      session: marque,
      sponsors: {}
    };
    releve.sponsors[SPONSOR_ID_TEST] = {
      expo: { mur: 1 }, aff: { mur: 1 }, clics: 0,
      plein: { ouverts: 0, secondes: 0, passes: 0 }, tranches: {}
    };

    let ecritureOk = false;
    try {
      const r = await apiPost('mesureSponsors', releve);
      // `ignore` = le backend a répondu OK mais n'a VOLONTAIREMENT rien écrit (un plafond de
      // l'écriture publique est atteint). Sans ce cas, le diagnostic annoncerait une écriture
      // réussie puis une relecture introuvable, et enverrait chercher une panne inexistante.
      if (r && r.ok && r.ignore) {
        ecritureOk = false;
        lignes.push('⚠️ <strong>Écriture</strong> — le backend a répondu, mais n\'a rien enregistré : ' +
          'un <strong>plafond de sécurité</strong> est atteint (<code>' + echapper(r.ignore) + '</code>).');
        verdict = (r.ignore === 'plafond_lignes')
          ? '<strong>L\'onglet des relevés est plein.</strong> C\'est un garde-fou volontaire : ' +
            'au-delà d\'une certaine taille, plus rien n\'est enregistré, pour qu\'un afflux de ' +
            'relevés ne puisse jamais empêcher la saisie des scores. Clique ' +
            '« Vider les relevés » pour repartir, après avoir noté les chiffres qui t\'intéressent.'
          : '<strong>Le débit maximal de relevés est atteint</strong> pour le moment. C\'est un ' +
            'garde-fou volontaire, et il se relâche tout seul : réessaie dans un moment. ' +
            'Si cela se reproduit sans raison, signale-le — les plafonds sont peut-être trop bas.';
        classe = 'diag-ko';
      } else {
        ecritureOk = !!(r && r.ok);
        lignes.push(ecritureOk
          ? '✅ <strong>Écriture</strong> — le backend a accepté un relevé de test.'
          : '⚠️ <strong>Écriture</strong> — réponse inattendue du backend.');
      }
    } catch (err) {
      const msg = String(err.message || '');
      if (/Action inconnue/i.test(msg)) {
        lignes.push('❌ <strong>Écriture</strong> — le backend en service <strong>ne connaît pas</strong> ' +
          'l\'action <code>mesureSponsors</code>.');
        verdict =
          '<strong>Le déploiement n\'a pas pris.</strong> C\'est presque toujours la même cause : ' +
          'avoir utilisé <em>« Nouveau déploiement »</em>, qui crée une <strong>autre URL</strong> — ' +
          'la page continue alors d\'appeler l\'ancienne, avec l\'ancien code.<br><br>' +
          'Refais-le ainsi : <strong>Déployer → Gérer les déploiements → ✏️ (crayon) → ' +
          'Version : « Nouvelle version » → Déployer.</strong><br>' +
          'Vérifie aussi que le contenu de <code>backend/Code.gs</code> a bien été collé <em>en entier</em> ' +
          '(l\'ancien remplacé, pas ajouté à la suite).';
        classe = 'diag-ko';
      } else {
        lignes.push('❌ <strong>Écriture</strong> — ' + echapper(msg));
        verdict = 'Le relevé n\'a pas pu être enregistré. Message du serveur ci-dessus.';
        classe = 'diag-ko';
      }
    }

    // ÉTAPE 2 — la relecture. Elle n'a de sens que si l'écriture est passée.
    if (ecritureOk) {
      try {
        const lu = await apiPostProtege('lireMesuresSponsors', {}, 'admin', 'admin');
        const trouve = (lu.releves || []).some(function (x) { return x.session === marque; });
        if (trouve) {
          lignes.push('✅ <strong>Relecture</strong> — le relevé de test a bien été retrouvé.');
          const vrais = (lu.releves || []).filter(function (x) { return x.session !== marque; });
          if (vrais.length) {
            lignes.push('✅ <strong>Relevés réels</strong> — ' + vrais.length + ' déjà remonté(s) des spectateurs.');
            verdict = '<strong>La chaîne fonctionne de bout en bout.</strong> Clique ' +
              '« Rafraîchir les chiffres » pour les voir apparaître.';
          } else if (lu.total > 1) {
            // > 1 car le relevé de test qu'on vient d'écrire compte lui aussi.
            lignes.push('ℹ️ <strong>Relevés réels</strong> — aucun <em>pour la journée en cours</em>, ' +
              'mais ' + (lu.total - 1) + ' au total sur d\'autres journées.');
            verdict = '<strong>La chaîne fonctionne.</strong> Les relevés déjà remontés datent ' +
              'd\'un autre jour : la fiche ne montre que la journée en cours. Refais une visite ' +
              'sur la page publique aujourd\'hui pour voir les chiffres apparaître.';
          } else {
            lignes.push('ℹ️ <strong>Relevés réels</strong> — aucun pour l\'instant.');
            verdict = '<strong>La chaîne fonctionne</strong> — il ne manque que des visiteurs. ' +
              'Ouvre la page publique des scores <em>avec les partenaires activés</em> et ' +
              'laisse-la au premier plan <strong>au moins 20 secondes</strong> : c\'est le délai ' +
              'du premier relevé. Reviens ensuite ici et rafraîchis.';
          }
        } else {
          lignes.push('❌ <strong>Relecture</strong> — le relevé de test n\'a pas été retrouvé.');
          verdict = 'L\'écriture passe mais la relecture ne voit rien. Regarde l\'onglet ' +
            '<code>Mesures</code> du Sheet : si la ligne y est, c\'est la date qui ne correspond pas ' +
            '(la relecture ne montre que la journée en cours).';
          classe = 'diag-ko';
        }
      } catch (err) {
        lignes.push('❌ <strong>Relecture</strong> — ' + echapper(String(err.message || '')));
        verdict = 'L\'écriture fonctionne mais la relecture échoue.';
        classe = 'diag-ko';
      }
    }
  } finally {
    bouton.disabled = false;
  }

  zone.className = 'diagnostic-remontee ' + classe;
  zone.innerHTML = '<ul>' + lignes.map(function (l) { return '<li>' + l + '</li>'; }).join('') +
    '</ul>' + (verdict ? '<p class="diag-verdict">' + verdict + '</p>' : '');
}

/* ==========================================================================
   3 bis. CONTRÔLE « CE QUE REÇOIT LE PUBLIC »
   --------------------------------------------------------------------------
   L'admin montre ce qu'on a SAISI. Cette carte montre ce qui est SERVI — en relisant
   l'instantané public (`getAll`), exactement celui que reçoivent la page des scores et
   le dossier club. Entre les deux, il y a un enregistrement, un Sheet et un cache : le
   jour où « j'ai réglé et rien ne change », c'est ici qu'on voit lequel des trois n'a
   pas suivi, au lieu de le supposer.
   ========================================================================== */

/** D'où vient une valeur, en clair. */
const SPONSORS_ORIGINES = {
  encart:  { texte: 'réglé ici',            classe: 'sp-src-encart' },
  general: { texte: 'réglage du partenaire', classe: 'sp-src-general' },
  defaut:  { texte: 'défaut',                classe: 'sp-src-defaut' },
  aucun:   { texte: 'rien',                  classe: 'sp-src-defaut' }
};

function pastilleOrigine(origine) {
  const o = SPONSORS_ORIGINES[origine] || SPONSORS_ORIGINES.defaut;
  return '<span class="sp-src ' + o.classe + '">' + echapper(o.texte) + '</span>';
}

async function onVerifierPublic() {
  const zone = document.getElementById('verif-public');
  const bouton = document.getElementById('bouton-verifier-public');
  zone.hidden = false;
  zone.className = 'diagnostic-remontee';
  zone.innerHTML = '<p>⏳ Lecture de l\'instantané public…</p>';
  bouton.disabled = true;

  let data = null;
  let erreur = '';
  try {
    data = await apiGet('getAll');
  } catch (err) {
    erreur = String(err.message || err);
  } finally {
    bouton.disabled = false;
  }

  if (!data) {
    zone.className = 'diagnostic-remontee diag-ko';
    zone.innerHTML = '<p>❌ <strong>L\'instantané public n\'a pas pu être lu.</strong> ' +
      echapper(erreur) + '</p><p class="diag-verdict">Sans lui, ni la page des scores ni le ' +
      'dossier club ne peuvent afficher de partenaire.</p>';
    return;
  }

  const reglages = sponsorsReglages(data.config || {});
  const liste = sponsorsListe(data, reglages);
  let h = '';

  // 1. L'interrupteur général. S'il est éteint, rien d'autre ne compte.
  if (!reglages.actifs) {
    h += '<p>⛔ <strong>« Afficher les partenaires » est sur « non ».</strong> Aucun partenaire ' +
      'n\'apparaît, ni sur la page des scores, ni sur le dossier club — quels que soient les ' +
      'réglages ci-dessous.</p>';
  } else {
    h += '<p>✅ <strong>« Afficher les partenaires » est actif</strong>, et l\'instantané public ' +
      'porte <strong>' + liste.length + ' partenaire(s)</strong>.</p>';
  }

  if (!liste.length) {
    h += '<p class="diag-verdict">Aucun partenaire <em>actif</em> n\'est servi. Vérifie que la ' +
      'fiche est bien enregistrée et que sa case « visible » est cochée.</p>';
    zone.className = 'diagnostic-remontee ' + (reglages.actifs ? 'diag-ko' : '');
    zone.innerHTML = h;
    return;
  }

  // 2. Partenaire par partenaire, emplacement par emplacement : la valeur SERVIE et son origine.
  h += '<table class="sp-verif"><thead><tr><th>Partenaire</th><th>Emplacement</th>' +
       '<th>Texte affiché</th><th>Taille</th><th>Disposition</th></tr></thead><tbody>';
  liste.forEach(function (s) {
    const emplacements = SPONSORS_EMPLACEMENTS.filter(function (e) {
      return sponsorsPourEmplacement([s], e).length;
    });
    if (!emplacements.length) return;
    emplacements.forEach(function (e, i) {
      const r = sponsorsReglageEmplacement(s, e);
      const muet = (r.dispo === 'seul');
      h += '<tr>' +
        (i === 0 ? '<th rowspan="' + emplacements.length + '">' + echapper(s.nom) + '</th>' : '') +
        '<td>' + echapper(SPONSORS_LIBELLES[e] || e) + '</td>' +
        '<td>' + (muet
          ? '<em>aucun — disposition « logo seul »</em>'
          : (r.texte ? echapper(r.texte) + ' ' + pastilleOrigine(r.origine.texte) : '<em>aucun</em>')) + '</td>' +
        '<td>' + Math.round(r.zoom * 100) + ' % ' + pastilleOrigine(r.origine.zoom) + '</td>' +
        '<td>' + echapper(SPONSORS_DISPO_COURT[r.dispo] || r.dispo) + ' ' +
                 pastilleOrigine(r.origine.dispo) + '</td>' +
      '</tr>';
    });
  });
  h += '</tbody></table>';

  // 3. Le bandeau du dossier club, rendu tel quel. C'est la pièce à conviction : ce bloc-ci
  //    est EXACTEMENT celui que le club voit en haut de son dossier.
  const bandeau = reglages.actifs ? sponsorsRendreDossier(liste) : '';
  h += '<p class="sp-verif-titre">En tête du dossier club, le club voit ceci :</p>';
  h += bandeau
    ? '<div class="sp-verif-dossier">' + bandeau + '</div>'
    : '<p><em>Rien — aucun partenaire n\'est coché sur l\'emplacement « F · Dossier club »' +
      (reglages.actifs ? '' : ', et l\'interrupteur général est éteint') + '.</em></p>';

  h += '<p class="diag-verdict">Ce tableau vient de l\'instantané <strong>public</strong>, pas du ' +
    'formulaire. Si une valeur que tu viens de saisir n\'apparaît pas ici, c\'est qu\'elle n\'a pas ' +
    'été enregistrée — pas que la page l\'ignore. Une valeur marquée ' +
    pastilleOrigine('defaut') + ' n\'a été saisie nulle part.</p>';

  zone.className = 'diagnostic-remontee';
  zone.innerHTML = h;
}

/**
 * Facteur de projection : « et si N personnes avaient consulté la page ? ». Les compteurs
 * mesurés portent sur UN appareil ; multiplier par N donne un ordre de grandeur.
 * Retourne 1 (aucune projection) si le champ est vide ou absurde.
 */
function facteurProjection() {
  const n = parseInt(document.getElementById('projection-appareils').value, 10);
  return (isFinite(n) && n > 1) ? n : 1;
}

function afficherBilanSponsors() {
  const zone = document.getElementById('bilan-sponsors');
  if (!zone) return;

  // Consolidé si des relevés sont remontés, sinon les compteurs du seul appareil courant.
  const consolide = !!(sponsorsConsolide && sponsorsConsolide.sessions);
  const bilan = sponsorsBilan(sponsorsActifsAdmin(), consolide ? sponsorsConsolide : null);
  const facteur = facteurProjection();
  const projection = facteur > 1;

  if (!bilan.sponsors.length) {
    zone.innerHTML =
      '<p class="vide">Aucun relevé pour l\'instant. Ouvre la page publique des scores ' +
      '(avec les partenaires activés, ou en ajoutant <code>?demo=sponsors</code> à son ' +
      'adresse) et laisse-la tourner quelques minutes. Les appareils des spectateurs ' +
      'remontent leur relevé <strong>toutes les 10 minutes</strong> et à la fermeture de ' +
      'la page — le premier chiffre met donc un moment à apparaître.</p>';
    return;
  }

  let html = '';
  if (projection) {
    html += '<p class="bilan-avertissement bilan-projection">⚠️ <strong>Projection — données simulées.</strong> ' +
      'Chiffres mesurés sur 1 appareil, multipliés par ' + facteur + '. À utiliser pour ' +
      'expliquer le dispositif, <strong>jamais</strong> comme un bilan réel envoyé à un partenaire.</p>';
  } else if (consolide) {
    html += '<p class="bilan-avertissement bilan-consolide">📡 <strong>Mesuré sur ' +
      sponsorsConsolide.appareils + ' appareil(s)</strong>, ' + sponsorsConsolide.sessions +
      ' visite(s) — relevés remontés par les navigateurs des spectateurs et consolidés ici. ' +
      'Un appareil équipé d\'un bloqueur ou fermé brutalement peut manquer à l\'appel : ' +
      'ces chiffres sont un <strong>plancher mesuré</strong>, jamais une estimation.</p>';
  } else {
    // Des relevés existent, mais pour d'AUTRES journées : le dire, plutôt que de laisser
    // croire que rien n'arrive jamais. C'est le cas typique du lendemain de tournoi.
    const autresJours = (sponsorsConsolide && sponsorsConsolide.totalToutesJournees) || 0;
    html += '<p class="bilan-avertissement">📏 <strong>Mesuré sur cet appareil seulement</strong> — ' +
      (autresJours
        ? autresJours + ' relevé(s) existent, mais <strong>aucun pour la journée en cours</strong> ' +
          '(' + echapper(String((sponsorsConsolide && sponsorsConsolide.jour) || '')) + ').'
        : 'aucun relevé n\'est encore remonté des spectateurs.') +
      ' Clique <strong>« Tester la remontée »</strong> ci-dessus : il dira en une seconde ' +
      'quel maillon de la chaîne ne répond pas.</p>';
  }

  bilan.sponsors.forEach(function (s) {
    html += ficheSponsor(s, facteur, projection, bilan.totalExpo);
  });
  zone.innerHTML = html;
}

/** Une fiche partenaire : 4 chiffres clés, la courbe horaire, la répartition par emplacement. */
function ficheSponsor(s, facteur, projection, totalExpo) {
  const expo = s.expo * facteur;
  const nomTournoi = (configCourante.global && configCourante.global.tournoi_nom) || 'Tournoi';
  const consolide = !!(sponsorsConsolide && sponsorsConsolide.sessions);
  const portee = consolide
    ? sponsorsConsolide.appareils + ' appareil(s), ' + sponsorsConsolide.sessions + ' visite(s)'
    : 'mesure sur 1 appareil';

  let h = '<article class="fiche-sponsor">' +
    '<header class="fs-tete">' +
      '<span class="fs-marque">' + echapper(s.nom) + '</span>' +
      '<span class="fs-qui"><b>' + echapper(nomTournoi) + '</b>' +
        '<span>Fiche de visibilité — ' + echapper(projection ? 'projection' : portee) + '</span></span>' +
    '</header>' +
    '<div class="fs-tuiles">' +
      tuileBilan(sponsorsDuree(expo), 'Exposition cumulée') +
      tuileBilan(String(Math.round(s.affichages * facteur)), 'Affichages') +
      tuileBilan(String(Math.round(s.clics * facteur)), 'Clics vers le site') +
      tuileBilan(s.partDeVoix + ' %', 'Part de voix') +
    '</div>';

  h += courbeVisibilite(s, facteur);

  // Répartition par emplacement (barres classées, une seule teinte : la longueur porte
  // la grandeur, la couleur ne code rien).
  const lignes = Object.keys(s.parEmplacement)
    .map(function (k) { return { cle: k, v: s.parEmplacement[k] }; })
    .filter(function (l) { return l.v > 0; })
    .sort(function (a, b) { return b.v - a.v; });
  if (lignes.length) {
    const maxi = lignes[0].v;
    h += '<div class="fs-fig"><span class="fs-fig-titre">D\'où vient cette exposition</span><div class="fs-rang">';
    lignes.forEach(function (l) {
      h += '<div class="fs-rang-l">' +
        '<span class="n">' + echapper(SPONSORS_LIBELLES[l.cle] || l.cle) + '</span>' +
        '<span class="p"><i style="width:' + Math.round(l.v / maxi * 100) + '%"></i></span>' +
        '<span class="v">' + echapper(sponsorsDuree(l.v * facteur)) + '</span>' +
      '</div>';
    });
    h += '</div></div>';
  }

  // Interstitiel : la durée réellement regardée et le taux de passage anticipé. Chiffre
  // inconfortable, mais c'est lui qui rend les autres crédibles.
  if (s.plein && s.plein.ouverts) {
    const moyenne = Math.round(s.plein.secondes / s.plein.ouverts * 10) / 10;
    const tauxPasse = Math.round(s.plein.passes / s.plein.ouverts * 100);
    h += '<p class="fs-note">Message plein écran : ' + s.plein.ouverts + ' affichage(s), ' +
      moyenne + ' s regardées en moyenne, ' + tauxPasse + ' % passés avant la fin.</p>';
  }

  h += '<p class="fs-methode"><strong>Méthode.</strong> Exposition mesurée côté navigateur : ' +
    'logo présent à plus de 50 % dans l\'écran, onglet actif. Les compteurs restent sur ' +
    'l\'appareil — aucun envoi, aucun cookie, aucun traceur tiers, aucune donnée personnelle. ' +
    (projection
      ? '<strong>Ces chiffres sont une PROJECTION</strong> (mesure multipliée par ' + facteur +
        '), pas un relevé d\'audience.'
      : consolide
        ? 'Relevés remontés par <strong>' + sponsorsConsolide.appareils + ' appareil(s)</strong> ' +
          'sur ' + sponsorsConsolide.sessions + ' visite(s), consolidés. Un appareil équipé d\'un ' +
          'bloqueur ou fermé brutalement peut manquer à l\'appel : <strong>ces chiffres sont un ' +
          'plancher mesuré</strong>, jamais une estimation.'
        : '<strong>Les chiffres portent sur le seul appareil qui a affiché la page</strong> : ' +
          'aucun relevé n\'est encore remonté des spectateurs.') +
    '</p></article>';
  return h;
}

function tuileBilan(valeur, libelle) {
  return '<div class="fs-tuile"><span class="v">' + echapper(valeur) + '</span>' +
    '<span class="k">' + echapper(libelle) + '</span></div>';
}

/**
 * Courbe de visibilité : minutes d'exposition par tranche de 30 minutes.
 * Série UNIQUE → teinte unique, la hauteur porte la grandeur. Étiquette directe sur le seul
 * sommet (jamais un nombre sur chaque barre), et un tableau dépliable pour l'accessibilité.
 */
function courbeVisibilite(s, facteur) {
  const cles = Object.keys(s.tranches).sort();
  if (!cles.length) return '';

  const valeurs = cles.map(function (k) { return Math.round(s.tranches[k] * facteur / 60 * 10) / 10; });
  const maxi = Math.max.apply(null, valeurs);
  if (!maxi) return '';

  let barres = '', axe = '', table = '';
  cles.forEach(function (k, i) {
    const v = valeurs[i];
    const pic = (v === maxi);
    barres += '<div class="fs-barre' + (pic ? ' pic' : '') + '" style="height:' +
      Math.max(2, Math.round(v / maxi * 100)) + '%" title="' + echapper(k + ' — ' + v + ' min') + '">' +
      (pic ? '<span class="fs-etiq">' + v + '</span>' : '') + '</div>';
    axe += '<span' + (i % 2 ? ' class="creux"' : '') + '>' + echapper(k) + '</span>';
    table += '<tr><td>' + echapper(k) + '</td><td>' + v + '</td></tr>';
  });

  return '<div class="fs-fig">' +
    '<span class="fs-fig-titre">Visibilité au fil de la journée</span>' +
    '<span class="fs-fig-sous">Minutes d\'exposition, par tranche de 30 minutes</span>' +
    '<div class="fs-histo" role="img" aria-label="Exposition par tranche de 30 minutes, de ' +
      echapper(cles[0]) + ' à ' + echapper(cles[cles.length - 1]) + ', maximum ' + maxi + ' minutes.">' +
      barres + '</div>' +
    '<div class="fs-axe">' + axe + '</div>' +
    '<details class="fs-table"><summary>Voir les données en tableau</summary>' +
      '<table class="table-planning"><thead><tr><th>Tranche</th><th>Minutes</th></tr></thead>' +
      '<tbody>' + table + '</tbody></table></details>' +
  '</div>';
}

/** Export CSV : le tableur du partenaire, ou le tien pour comparer les éditions. */
function onExporterBilanCsv() {
  const consolide = !!(sponsorsConsolide && sponsorsConsolide.sessions);
  const bilan = sponsorsBilan(sponsorsActifsAdmin(), consolide ? sponsorsConsolide : null);
  const facteur = facteurProjection();
  const lignes = [['partenaire', 'exposition_secondes', 'affichages', 'clics', 'part_de_voix_pct',
                   'plein_ouverts', 'plein_secondes', 'plein_passes', 'mesure']];
  bilan.sponsors.forEach(function (s) {
    lignes.push([
      s.nom,
      Math.round(s.expo * facteur),
      Math.round(s.affichages * facteur),
      Math.round(s.clics * facteur),
      s.partDeVoix,
      s.plein.ouverts, s.plein.secondes, s.plein.passes,
      facteur > 1 ? ('projection x' + facteur)
        : (consolide ? (sponsorsConsolide.appareils + ' appareils') : '1 appareil')
    ]);
  });
  const csv = lignes.map(function (l) {
    return l.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';');
  }).join('\n');

  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  lien.download = 'visibilite-partenaires-' + bilan.jour + '.csv';
  lien.click();
  URL.revokeObjectURL(lien.href);
}

async function onViderBilan() {
  const ok = await dialogConfirmer('Effacer TOUS les relevés de visibilité ?\n\n' +
    'Les compteurs repartent de zéro, sur cet appareil comme sur le serveur — les relevés ' +
    'déjà remontés par les spectateurs sont supprimés. Les fiches partenaires, elles, ne ' +
    'bougent pas.', { ok: 'Effacer', danger: true });
  if (!ok) return;
  sponsorsRemettreAZero();
  try {
    await apiPostProtege('viderMesuresSponsors', {}, 'admin', 'admin');
  } catch (err) { /* le local est déjà effacé : on n'échoue pas là-dessus */ }
  await chargerMesuresSponsors();
}

document.addEventListener('DOMContentLoaded', initAdminSponsors);
