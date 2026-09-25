/**
 * ÉCRAN « DEMANDE DE DPS »
 *
 * L'écran ne possède aucune lecture : il transforme l'instantané déjà chargé pour la demande
 * d'autorisation (`getDossierAutorisation`). Changer de format, ouvrir un détail ou copier du
 * texte reste local. Les seules navigations externes sont des liens explicitement cliqués.
 */

var DPS_FOURNISSEURS = [
  { nom: 'Protection Civile', action: 'Demander un devis',
    note: 'Formulaire national de demande de DPS',
    url: 'https://secours.protection-civile.org/aid-station' },
  { nom: 'Croix-Rouge française', action: 'Ouvrir la demande',
    note: 'Formulaire de demande de dispositif de secours',
    url: 'https://www.croix-rouge.fr/demande-poste-secours' },
  { nom: 'Croix Blanche', action: 'Demander un devis',
    note: 'Demande de DPS en deux étapes',
    url: 'https://www.croixblanche.org/demande-poste-de-secours/' },
  { nom: 'UNASS', action: 'Sécuriser l’événement',
    note: 'Estimation du RIS puis demande de devis',
    url: 'https://www.unass.fr/securiser-un-evenement' },
  { nom: 'FFSS', action: 'Trouver une association',
    note: 'Annuaire territorial pour identifier l’interlocuteur',
    url: 'https://www.ffss.fr/annuaire/' }
];

var dpsInstantaneCourant = null;
var dpsModeCourant = 'complet';
var dpsDemandeOuverte = false;

function dpsTexte_(valeur) {
  return String(valeur == null ? '' : valeur).trim();
}

function dpsEchapper_(valeur) {
  if (typeof echapper === 'function') return echapper(valeur);
  return String(valeur == null ? '' : valeur).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function dpsDateLisible_(iso) {
  var m = dpsTexte_(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dpsTexte_(iso);
  var mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
    'septembre', 'octobre', 'novembre', 'décembre'];
  return Number(m[3]) + ' ' + mois[Number(m[2]) - 1] + ' ' + m[1];
}

function dpsChampDossier_(dossier, libelle) {
  var sections = dossier && Array.isArray(dossier.sections) ? dossier.sections : [];
  for (var i = 0; i < sections.length; i++) {
    var champs = Array.isArray(sections[i].champs) ? sections[i].champs : [];
    for (var j = 0; j < champs.length; j++) {
      if (champs[j].libelle === libelle) return dpsTexte_(champs[j].valeur);
    }
  }
  return '';
}

function dpsCategories_(config) {
  var categories = config && Array.isArray(config.categories) ? config.categories : [];
  return categories.filter(function (categorie) {
    return dpsTexte_(categorie.presente).toLowerCase() === 'oui';
  }).map(function (categorie) { return dpsTexte_(categorie.categorie); }).filter(Boolean);
}

function dpsManquant_(libelle) {
  return 'À compléter : ' + libelle;
}

function dpsAssemblerTexte_(champs, uneLigne) {
  var texte = champs.map(function (champ) {
    return champ.libelle.toUpperCase() + '\n' + champ.valeur;
  }).join('\n\n');
  return uneLigne ? texte.replace(/\s+/g, ' ').trim() : texte;
}

/** Construit les champs de copie sans lire ni écrire quoi que ce soit. */
function dpsConstruireChamps(dossier, config, estimation, mode) {
  var g = (config && config.global) || {};
  var organisateur = dpsChampDossier_(dossier, 'Nom du club ou de la structure organisatrice');
  var representant = dpsChampDossier_(dossier, 'Représenté par (M./Mme)');
  var telRepresentant = dpsChampDossier_(dossier, 'Téléphone du représentant');
  var mailRepresentant = dpsChampDossier_(dossier, 'Mail du représentant');
  var nom = dpsTexte_(g.tournoi_nom);
  var date = dpsDateLisible_(g.tournoi_date);
  var lieu = dpsTexte_(g.tournoi_lieu);
  var adresse = dpsTexte_(g.tournoi_adresse);
  var debut = dpsTexte_(g.heure_debut);
  var fin = dpsTexte_(g.heure_fin_projetee || g.heure_fin_matin || g.heure_fin);
  var description = dpsTexte_(g.tournoi_description);
  var categories = dpsCategories_(config);
  var secours = dpsTexte_(g.securite_secours_precisions || g.org_secours_nom);
  var referent = dpsTexte_(g.securite_referent_identique).toLowerCase() === 'non'
    ? dpsTexte_(g.securite_referent_nom) : dpsTexte_(g.referent_nom);
  var referentTel = dpsTexte_(g.securite_referent_identique).toLowerCase() === 'non'
    ? dpsTexte_(g.securite_referent_tel) : dpsTexte_(g.referent_tel);
  var publicValide = estimation && estimation.contrat === 'estimation-public-1';
  var centrale = publicValide ? Number(estimation.centrale || 0) : 0;
  var basse = publicValide ? Number(estimation.basse || 0) : 0;
  var haute = publicValide ? Number(estimation.haute || 0) : 0;
  var couverture = publicValide
    ? Number(estimation.renseignes || 0) + ' club(s) sur ' + Number(estimation.participants || 0)
    : '';

  var resume = [
    nom || dpsManquant_('nom de la manifestation'),
    date ? 'le ' + date : dpsManquant_('date'),
    lieu ? 'au ' + lieu : dpsManquant_('lieu'),
    publicValide ? centrale + ' spectateurs attendus hors joueurs et éducateurs' : dpsManquant_('public attendu')
  ].join(' - ') + '. Nous sollicitons une proposition de dispositif prévisionnel de secours et un devis adaptés à la manifestation.';
  if (mode === 'court') return [{ id: 'resume', libelle: 'Résumé à copier', valeur: resume }];

  var contact = representant || dpsManquant_('représentant');
  if (telRepresentant) contact += ', téléphone : ' + telRepresentant;
  if (mailRepresentant) contact += ', courriel : ' + mailRepresentant;
  var manifestation = (nom || dpsManquant_('nom de la manifestation')) + '. ' +
    (description || dpsManquant_('description de la manifestation')) +
    (categories.length ? ' Catégories accueillies : ' + categories.join(', ') + '.' : ' ' + dpsManquant_('catégories accueillies') + '.');
  var horaires = (date || dpsManquant_('date')) + ', début : ' + (debut || dpsManquant_('heure de début')) +
    ', fin : ' + (fin || dpsManquant_('heure de fin')) + '.';
  var emplacement = (lieu || dpsManquant_('lieu')) + ', ' + (adresse || dpsManquant_('adresse complète')) + '.';
  var frequentation = publicValide
    ? centrale + ' spectateurs attendus hors joueurs et éducateurs. Fourchette actuelle : ' + basse +
      ' à ' + haute + ' personnes, calculée à partir de ' + couverture + '.'
    : dpsManquant_('estimation du public attendu') + '.';
  var securite = (secours ? 'Dispositif ou antenne déjà identifié(e) : ' + secours + '. ' : '') +
    'Référent sécurité : ' + (referent || dpsManquant_('référent sécurité')) +
    (referentTel ? ', téléphone : ' + referentTel : '') + '.';

  return [
    { id: 'organisateur', libelle: 'Organisateur', valeur: (organisateur || dpsManquant_('organisateur')) + ', ' + contact + '.' },
    { id: 'manifestation', libelle: 'Manifestation', valeur: manifestation },
    { id: 'horaires', libelle: 'Date et horaires', valeur: horaires },
    { id: 'lieu', libelle: 'Lieu et accès', valeur: emplacement },
    { id: 'public', libelle: 'Fréquentation estimée', valeur: frequentation },
    { id: 'securite', libelle: 'Sécurité et contact sur place', valeur: securite },
    { id: 'objet', libelle: 'Objet de la demande', valeur: 'Nous souhaitons recevoir une proposition de dispositif prévisionnel de secours et un devis adaptés à cette manifestation.' }
  ];
}

function dpsSources_(dossier, config) {
  var g = (config && config.global) || {};
  var organismeManquants = [
    ['Nom de l’organisme', dpsChampDossier_(dossier, 'Nom du club ou de la structure organisatrice')],
    ['Représentant', dpsChampDossier_(dossier, 'Représenté par (M./Mme)')],
    ['Téléphone', dpsChampDossier_(dossier, 'Téléphone du représentant')],
    ['Adresse email', dpsChampDossier_(dossier, 'Mail du représentant')]
  ].filter(function (x) { return !x[1]; }).map(function (x) { return x[0]; });
  var siteManquants = [['Lieu', g.tournoi_lieu], ['Adresse', g.tournoi_adresse]]
    .filter(function (x) { return !dpsTexte_(x[1]); }).map(function (x) { return x[0]; });
  var editionManquants = [['Nom du tournoi', g.tournoi_nom], ['Date', g.tournoi_date],
    ['Heure de début', g.heure_debut], ['Heure de fin', g.heure_fin_projetee || g.heure_fin_matin || g.heure_fin]]
    .filter(function (x) { return !dpsTexte_(x[1]); }).map(function (x) { return x[0]; });
  return [
    { id: 'organisme', nom: 'Organisme', origine: 'Demande d’autorisation', ecran: 'autorisation', manquants: organismeManquants },
    { id: 'site', nom: 'Site', origine: 'Informations du tournoi', ecran: 'infos', manquants: siteManquants },
    { id: 'edition', nom: 'Édition', origine: 'Tournoi actuel', ecran: 'horaires', manquants: editionManquants }
  ];
}

function dpsNombreManquants_(sources) {
  return sources.reduce(function (total, source) { return total + source.manquants.length; }, 0);
}

function dpsRendreOriginesEtActions_() {
  var liste = document.getElementById('dps-origines-liste');
  var actions = document.getElementById('dps-actions-liste');
  var fraicheur = document.getElementById('dps-fraicheur');
  var continuer = document.getElementById('dps-continuer');
  var voirCopie = document.getElementById('dps-voir-copie');
  if (!liste || !actions || !fraicheur) return;
  var instantane = dpsInstantaneCourant;
  if (!instantane || !instantane.dossier) {
    var erreur = instantane && instantane.erreur;
    liste.innerHTML = '<p class="dps-etat-lecture"' + (erreur ? ' role="alert"' : '') + '>' +
      (erreur ? 'Actualisation impossible : ' + dpsEchapper_(erreur) + '.' : 'Informations en cours de chargement…') + '</p>';
    actions.innerHTML = erreur
      ? '<button type="button" class="dps-action-ligne" data-dps-reessayer><strong>Réessayer la lecture</strong><small>Aucune donnée ancienne n’est présentée comme actuelle.</small></button>'
      : '<p class="dps-etat-lecture">Vérification en cours…</p>';
    fraicheur.textContent = erreur ? 'Lecture indisponible' : 'Lecture authentifiée en cours';
    if (continuer) continuer.disabled = true;
    if (voirCopie) voirCopie.disabled = true;
    return;
  }
  var sources = dpsSources_(instantane.dossier, instantane.config);
  var nbManquants = dpsNombreManquants_(sources);
  liste.innerHTML = (instantane.erreur
    ? '<p class="dps-alerte" role="alert">Actualisation impossible : dernière lecture connue affichée.</p>'
    : '') + '<div class="dps-origines-table">' +
    sources.map(function (source) {
      var complet = source.manquants.length === 0;
      return '<button type="button" class="dps-origine" data-dps-ecran="' + source.ecran + '">' +
        '<span><strong>' + source.nom + '</strong><small>' + source.origine + '</small></span>' +
        '<em class="' + (complet ? 'est-complet' : 'est-incomplet') + '">' +
        (complet ? 'Complet' : source.manquants.length + ' à compléter') + '</em><b aria-hidden="true">›</b></button>';
    }).join('') + '</div>';
  var incompletes = sources.filter(function (source) { return source.manquants.length; });
  actions.innerHTML = incompletes.length ? incompletes.map(function (source) {
    return '<button type="button" class="dps-action-ligne" data-dps-ecran="' + source.ecran + '"><b>' +
      source.manquants.length + '</b><span><strong>Compléter ' + source.nom.toLowerCase() + '</strong><small>' +
      dpsEchapper_(source.manquants.join(', ')) + '</small></span><i aria-hidden="true">›</i></button>';
  }).join('') : '<div class="dps-action-ok"><strong>Dossier prêt à vérifier</strong><small>Toutes les informations indispensables sont présentes.</small></div>';
  fraicheur.textContent = instantane.erreur
    ? 'Source : dernière lecture connue (actualisation impossible)'
    : 'Source : instantané authentifié partagé';
  if (continuer) continuer.disabled = false;
  if (voirCopie) voirCopie.disabled = false;
  if (continuer) continuer.textContent = nbManquants ? 'Compléter ' + nbManquants + ' information' + (nbManquants > 1 ? 's' : '') : 'Vérifier la demande';
  dpsActiverEtape_(dpsDemandeOuverte ? 3 : (nbManquants ? 2 : 3));
}

function dpsRendreDemandePrete_() {
  var zone = document.getElementById('dps-demande-prete');
  var champsZone = document.getElementById('dps-champs-copie');
  var fournisseursZone = document.getElementById('dps-fournisseurs');
  var etat = document.getElementById('dps-etat-brouillon');
  var compteur = document.getElementById('dps-compteur');
  if (!zone || !champsZone || !fournisseursZone || !etat || !compteur) return;
  zone.hidden = !dpsDemandeOuverte;
  if (!dpsDemandeOuverte || !dpsInstantaneCourant || !dpsInstantaneCourant.dossier) return;
  var champs = dpsConstruireChamps(dpsInstantaneCourant.dossier, dpsInstantaneCourant.config,
    dpsInstantaneCourant.estimation, dpsModeCourant);
  var nbACompleter = champs.reduce(function (total, champ) {
    return total + (champ.valeur.indexOf('À compléter') !== -1 ? 1 : 0);
  }, 0);
  var texteComplet = dpsAssemblerTexte_(champs, false);
  etat.textContent = nbACompleter
    ? 'Sortie de travail uniquement · ' + nbACompleter + ' bloc' + (nbACompleter > 1 ? 's' : '') + ' à compléter avant envoi'
    : 'Demande prête à être copiée';
  compteur.textContent = texteComplet.length + ' caractères';
  champsZone.innerHTML = champs.map(function (champ, index) {
    return '<article class="dps-champ-copie"><div><strong>' + dpsEchapper_(champ.libelle) + '</strong>' +
      '<button type="button" data-dps-copier="' + index + '">Copier</button></div><textarea readonly rows="4" aria-label="' +
      dpsEchapper_(champ.libelle) + '">' + dpsEchapper_(champ.valeur) + '</textarea></article>';
  }).join('');
  fournisseursZone.innerHTML = DPS_FOURNISSEURS.map(function (fournisseur) {
    return '<a class="dps-fournisseur" href="' + fournisseur.url + '" target="_blank" rel="noopener noreferrer">' +
      '<span><strong>' + fournisseur.nom + '</strong><small>' + fournisseur.note + '</small></span>' +
      '<em>' + fournisseur.action + ' ↗</em></a>';
  }).join('');
  document.querySelectorAll('[data-dps-mode]').forEach(function (bouton) {
    bouton.classList.toggle('est-actif', bouton.getAttribute('data-dps-mode') === dpsModeCourant);
  });
  var boutonTout = zone.querySelector('[data-dps-copier="tout"]');
  if (boutonTout) boutonTout.textContent = nbACompleter ? 'Copier le brouillon' : 'Tout copier';
}

function dpsActiverEtape_(numero) {
  document.querySelectorAll('[data-dps-etape]').forEach(function (etape) {
    var n = Number(etape.getAttribute('data-dps-etape'));
    etape.classList.toggle('est-actif', n === numero);
    etape.classList.toggle('est-fait', n < numero);
  });
}

/** Point d'entrée appelé après la lecture partagée de la demande d'autorisation. */
function afficherDpsDepuisAutorisation(dossier, config, estimation, erreur) {
  dpsInstantaneCourant = { dossier: dossier || null, config: config || null,
    estimation: estimation || null, erreur: dpsTexte_(erreur) };
  dpsRendreOriginesEtActions_();
  dpsRendreDemandePrete_();
}

function dpsOuvrirDemande_() {
  var message = document.getElementById('dps-message-copie');
  if (!dpsInstantaneCourant || !dpsInstantaneCourant.dossier) {
    if (typeof afficherMessage === 'function') afficherMessage(message, 'Attends la fin du chargement avant de préparer la copie.', 'ko');
    return;
  }
  dpsDemandeOuverte = true;
  dpsActiverEtape_(3);
  dpsRendreDemandePrete_();
  var zone = document.getElementById('dps-demande-prete');
  if (zone && zone.scrollIntoView) zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function dpsFermerDemande_() {
  dpsDemandeOuverte = false;
  dpsRendreDemandePrete_();
  dpsRendreOriginesEtActions_();
}

function dpsNaviguerVersManquant_() {
  if (!dpsInstantaneCourant || !dpsInstantaneCourant.dossier) return;
  var sources = dpsSources_(dpsInstantaneCourant.dossier, dpsInstantaneCourant.config);
  var cible = sources.find(function (source) { return source.manquants.length; });
  if (!cible) { dpsOuvrirDemande_(); return; }
  if (typeof ecransActiver === 'function') ecransActiver(cible.ecran);
}

async function dpsCopierTexte_(texte, libelle) {
  var message = document.getElementById('dps-message-copie');
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('presse-papiers indisponible');
    await navigator.clipboard.writeText(texte);
    if (typeof afficherMessage === 'function') afficherMessage(message, '✅ ' + libelle + ' copié.', 'ok');
  } catch (e) {
    if (typeof afficherMessage === 'function') afficherMessage(message, '', 'ok');
    if (typeof dialogDemander === 'function') {
      await dialogDemander('Copie automatique impossible sur cet appareil. Sélectionne le texte ci-dessous et copie-le :',
        texte, { ok: 'Fermer' });
    }
  }
}

function dpsCopier_(cible) {
  if (!dpsInstantaneCourant || !dpsInstantaneCourant.dossier) return;
  var champs = dpsConstruireChamps(dpsInstantaneCourant.dossier, dpsInstantaneCourant.config,
    dpsInstantaneCourant.estimation, dpsModeCourant);
  if (cible === 'tout') {
    return dpsCopierTexte_(dpsAssemblerTexte_(champs, false),
      champs.some(function (champ) { return champ.valeur.indexOf('À compléter') !== -1; }) ? 'Brouillon' : 'Dossier complet');
  }
  if (cible === 'ligne') return dpsCopierTexte_(dpsAssemblerTexte_(champs, true), 'Version sur une ligne');
  var champ = champs[Number(cible)];
  if (champ) return dpsCopierTexte_(champ.valeur, champ.libelle);
}

document.addEventListener('DOMContentLoaded', function () {
  var section = document.getElementById('bloc-dps');
  if (!section) return;
  afficherDpsDepuisAutorisation(
    typeof autorisationDossierCourant === 'undefined' ? null : autorisationDossierCourant,
    typeof configCourante === 'undefined' ? null : configCourante,
    typeof estimationPublicCourante === 'undefined' ? null : estimationPublicCourante,
    typeof autorisationEstimationErreur === 'undefined' ? '' : autorisationEstimationErreur);
  section.addEventListener('click', function (e) {
    var bouton = e.target.closest('button, a');
    if (!bouton || bouton.tagName === 'A') return;
    if (bouton.id === 'dps-continuer') dpsNaviguerVersManquant_();
    else if (bouton.id === 'dps-voir-copie') dpsOuvrirDemande_();
    else if (bouton.hasAttribute('data-dps-fermer')) dpsFermerDemande_();
    else if (bouton.hasAttribute('data-dps-mode')) {
      dpsModeCourant = bouton.getAttribute('data-dps-mode') === 'court' ? 'court' : 'complet';
      dpsRendreDemandePrete_();
    } else if (bouton.hasAttribute('data-dps-copier')) {
      dpsCopier_(bouton.getAttribute('data-dps-copier'));
    } else if (bouton.hasAttribute('data-dps-ecran')) {
      if (typeof ecransActiver === 'function') ecransActiver(bouton.getAttribute('data-dps-ecran'));
    } else if (bouton.hasAttribute('data-dps-reessayer') && typeof rafraichirRessourceAdmin === 'function') {
      rafraichirRessourceAdmin('dossierAutorisation').catch(function () { /* l'écran reçoit l'erreur */ });
    }
  });
});
