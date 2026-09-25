/**
 * ÉCRAN « DEMANDE MUNICIPALE »
 *
 * Un assembleur local : il réutilise la configuration déjà chargée et l'unique ressource
 * `dossierAutorisation`. Ajouter un espace, saisir un besoin, déposer une pièce et produire le
 * PDF ne font aucun appel. Une seule action explicite persiste le dossier et sa bibliothèque.
 */

var MUNICIPAL_TYPES = ['Terrain sportif', 'Stade / complexe', 'Salle', 'Parking', 'Voirie',
  'Espace public', 'Autre'];
var MUNICIPAL_USAGES = [
  ['sport', 'Matchs / pratique sportive'], ['echauffement', 'Échauffement'], ['public', 'Accueil du public'],
  ['secours', 'Secours'], ['restauration', 'Restauration'], ['stationnement', 'Stationnement'],
  ['stockage', 'Stockage'], ['circulation', 'Circulation'], ['logistique', 'Logistique'], ['autre', 'Autre']
];
var MUNICIPAL_STATUTS = [
  ['a_demander', 'À demander'], ['en_preparation', 'En préparation'], ['envoye', 'Demande envoyée'],
  ['accord', 'Accord obtenu'], ['refus', 'Refusé']
];
var MUNICIPAL_CANAUX = [
  ['a_confirmer', 'À confirmer avec la commune'], ['portail', 'Portail en ligne'],
  ['email', 'Courriel'], ['courrier', 'Courrier'], ['depot', 'Dépôt auprès du service']
];
var MUNICIPAL_VOLETS = [
  ['occupation', 'Occupation / réservation du site'], ['materiel', 'Matériel municipal'],
  ['circulation', 'Circulation / stationnement'], ['eau_energie', 'Eau / électricité'],
  ['securite', 'Sécurité / secours'], ['structures', 'Tentes / structures temporaires'],
  ['restauration', 'Restauration / débit de boissons'], ['sonorisation', 'Sonorisation / bruit'],
  ['accessibilite', 'Accessibilité / sanitaires'], ['proprete', 'Propreté / déchets'],
  ['communication', 'Communication / signalétique'], ['autre', 'Autre demande']
];
var MUNICIPAL_BESOINS_CATEGORIES = ['Matériel', 'Accès / clés', 'Eau / électricité',
  'Circulation / stationnement', 'Sécurité / secours', 'Propreté / déchets',
  'Communication / signalétique', 'Autre'];
var MUNICIPAL_FICHIERS_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
var MUNICIPAL_TAILLE_FICHIER_MAX = 15 * 1024 * 1024;
var MUNICIPAL_TAILLE_TOTALE_MAX = 40 * 1024 * 1024;

var municipalEtat = {
  demande: { version: 2, espaces: [], destinataire: {}, organisateur: {}, volets: {}, notes: '', suivi: { statut: 'brouillon', date_envoi: '', reference: '', retour: '' } },
  bibliotheque: [], profil: { version: 1, destinataire: {}, organisateur: {} }, revision: 0
};
var municipalEtape = 2;
var municipalInitialise = false;
var municipalSale = false;
var municipalFichiersCommuns = [];
var municipalFichiersEspaces = Object.create(null);
var municipalFichiersDrawer = [];
var municipalDernierFocus = null;
var municipalDossier = null;
var municipalEstimation = null;
var municipalErreurSource = '';
var municipalEnregistrementEnCours = false;

function municipalTexte_(valeur) { return String(valeur == null ? '' : valeur).trim(); }
function municipalEchapper_(valeur) {
  if (typeof echapper === 'function') return echapper(String(valeur == null ? '' : valeur));
  return String(valeur == null ? '' : valeur).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function municipalId_() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'esp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}
function municipalObjet_(texte, repli) {
  try {
    var resultat = JSON.parse(texte || '');
    return resultat && typeof resultat === 'object' ? resultat : repli;
  } catch (e) { return repli; }
}
function municipalCopie_(objet) { return JSON.parse(JSON.stringify(objet)); }
function municipalTaille_(octets) {
  if (octets < 1024) return octets + ' o';
  if (octets < 1024 * 1024) return Math.round(octets / 1024) + ' Ko';
  return (octets / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';
}

function municipalNormaliserBesoin_(besoin) {
  if (typeof besoin === 'string') return { id: municipalId_(), categorie: 'Autre', intitule: municipalTexte_(besoin), quantite: '', details: '' };
  besoin = besoin && typeof besoin === 'object' ? besoin : {};
  return { id: municipalTexte_(besoin.id) || municipalId_(), categorie: municipalTexte_(besoin.categorie) || 'Autre',
    intitule: municipalTexte_(besoin.intitule), quantite: municipalTexte_(besoin.quantite), details: municipalTexte_(besoin.details) };
}
function municipalNormaliserEspace_(espace) {
  espace = espace && typeof espace === 'object' ? espace : {};
  var usages = espace.usages && typeof espace.usages === 'object' ? espace.usages : {};
  return {
    id: municipalTexte_(espace.id) || municipalId_(), nom: municipalTexte_(espace.nom),
    type: municipalTexte_(espace.type) || 'Terrain sportif', adresse: municipalTexte_(espace.adresse),
    gestionnaire_nom: municipalTexte_(espace.gestionnaire_nom),
    interlocuteur_nom: municipalTexte_(espace.interlocuteur_nom),
    gestionnaire_tel: municipalTexte_(espace.gestionnaire_tel),
    gestionnaire_mail: municipalTexte_(espace.gestionnaire_mail),
    usages: usages, statut: municipalTexte_(espace.statut) || 'a_demander',
    date: municipalTexte_(espace.date), date_fin: municipalTexte_(espace.date_fin),
    debut: municipalTexte_(espace.debut), fin: municipalTexte_(espace.fin),
    montage_debut: municipalTexte_(espace.montage_debut), demontage_fin: municipalTexte_(espace.demontage_fin),
    besoins: Array.isArray(espace.besoins) ? espace.besoins.map(municipalNormaliserBesoin_).filter(function (b) { return b.intitule; }) : [],
    notes: municipalTexte_(espace.notes), conserver: espace.conserver !== false
  };
}

function municipalNormaliserDemande_(brute) {
  brute = brute && typeof brute === 'object' && !Array.isArray(brute) ? brute : {};
  return {
    version: 2,
    espaces: (Array.isArray(brute.espaces) ? brute.espaces : []).map(municipalNormaliserEspace_),
    destinataire: Object.assign({ commune: '', service: '', interlocuteur: '', email: '', telephone: '', canal: 'a_confirmer', date_limite: '' }, brute.destinataire || {}),
    organisateur: Object.assign({ adresse: '', rna: '', siret: '', code_ape: '', assurance: '' }, brute.organisateur || {}),
    volets: Object.assign({}, brute.volets || {}), notes: municipalTexte_(brute.notes),
    suivi: Object.assign({ statut: 'brouillon', date_envoi: '', reference: '', retour: '' }, brute.suivi || {})
  };
}

function municipalInitialiserDepuisConfig_(config, forcer) {
  var g = (config && config.global) || {};
  var revision = parseInt(g.demande_municipale_revision, 10) || 0;
  if (municipalInitialise && !forcer) return;
  var brute = municipalObjet_(g.demande_municipale_json, null);
  var bibliotheque = municipalObjet_(g.bibliotheque_espaces_json, []);
  var profil = municipalObjet_(g.profil_municipal_json, {});
  municipalEtat.demande = municipalNormaliserDemande_(brute);
  municipalEtat.profil = { version: 1, destinataire: Object.assign({}, profil.destinataire || {}), organisateur: Object.assign({}, profil.organisateur || {}) };
  Object.keys(municipalEtat.demande.destinataire).forEach(function (cle) {
    if (!municipalTexte_(municipalEtat.demande.destinataire[cle]) || municipalEtat.demande.destinataire[cle] === 'a_confirmer') {
      if (municipalTexte_(municipalEtat.profil.destinataire[cle])) municipalEtat.demande.destinataire[cle] = municipalEtat.profil.destinataire[cle];
    }
  });
  Object.keys(municipalEtat.demande.organisateur).forEach(function (cle) {
    if (!municipalTexte_(municipalEtat.demande.organisateur[cle]) && municipalTexte_(municipalEtat.profil.organisateur[cle])) {
      municipalEtat.demande.organisateur[cle] = municipalEtat.profil.organisateur[cle];
    }
  });
  municipalEtat.bibliotheque = (Array.isArray(bibliotheque) ? bibliotheque : []).map(municipalNormaliserEspace_);
  municipalEtat.revision = revision;
  municipalInitialise = true;
  municipalSale = false;
}

function municipalChampDossier_(libelle) {
  if (typeof dpsChampDossier_ === 'function') return dpsChampDossier_(municipalDossier, libelle);
  return '';
}
function municipalDateLisible_(iso) {
  if (typeof dpsDateLisible_ === 'function') return dpsDateLisible_(iso);
  return iso || '';
}
function municipalCategories_() {
  if (typeof dpsCategories_ === 'function') return dpsCategories_(configCourante || {});
  return [];
}
function municipalSourceValeur_(valeur, vide) { return municipalTexte_(valeur) || (vide || 'À compléter'); }

function municipalEntete_() {
  return '<div class="municipal-entete"><div><h2>Préparer le dossier</h2>' +
    '<p>Rassemble les sites, les besoins et les justificatifs de l’édition en cours. ' +
    'Aucun site n’est imposé : ajoute uniquement les espaces concernés par cette demande.</p></div>' +
    '<span class="municipal-performance">Saisie locale · 1 appel à l’enregistrement</span></div>';
}
function municipalEtapes_() {
  var defs = [
    ['Données reprises', 'Vérifier les informations'], ['Besoins & autorisations', 'Composer la demande'],
    ['Pièces & vérification', 'Finaliser le dossier'], ['Dossier PDF & suivi', 'Produire et tracer']
  ];
  return '<ol class="municipal-etapes" aria-label="Étapes de la demande municipale">' + defs.map(function (d, i) {
    var n = i + 1;
    return '<li><button type="button" data-municipal-etape="' + n + '" data-numero="' + n + '"' +
      (municipalEtape === n ? ' class="est-actif" aria-current="step"' : '') + '><strong>' + d[0] +
      '</strong><small>' + d[1] + '</small></button></li>';
  }).join('') + '</ol>';
}

function municipalRendreSources_() {
  var g = (configCourante && configCourante.global) || {};
  var d = municipalEtat.demande.destinataire, o = municipalEtat.demande.organisateur;
  var organisateur = municipalChampDossier_('Nom du club ou de la structure organisatrice') || g.org_club_nom;
  var contact = municipalChampDossier_('Représenté par (M./Mme)') || g.org_representant_nom || g.referent_nom;
  var publicTexte = municipalEstimation && municipalEstimation.contrat === 'estimation-public-1'
    ? Number(municipalEstimation.centrale || 0) + ' spectateurs (estimation centrale)'
    : 'Estimation à compléter';
  var sources = [
    ['Manifestation', municipalSourceValeur_(g.tournoi_nom), [municipalDateLisible_(g.tournoi_date), g.tournoi_lieu].filter(Boolean).join(' · ')],
    ['Horaires', municipalSourceValeur_(g.heure_debut) + ' – ' + municipalSourceValeur_(g.heure_fin_projetee || g.heure_fin_matin || g.heure_fin), 'Repris de l’écran Horaires'],
    ['Organisateur', municipalSourceValeur_(organisateur), municipalSourceValeur_(contact, 'Contact à compléter')],
    ['Public attendu', publicTexte, 'Même estimation que le DPS'],
    ['Catégories', municipalCategories_().join(', ') || 'À compléter', 'Reprises de l’édition active'],
    ['Site & sécurité', g.tournoi_adresse || 'Adresse à compléter', g.securite_secours_precisions || 'Dispositif à préciser']
  ];
  return '<div class="municipal-panneau"><div class="municipal-barre"><div><h3>Informations déjà disponibles</h3>' +
    '<p>Ces données restent liées à leur écran d’origine : ici, on les contrôle sans les recopier.</p></div>' +
    '<button type="button" class="bouton" data-municipal-etape="2">Continuer</button></div>' +
    (municipalErreurSource ? '<p class="municipal-alerte">Actualisation impossible : dernière lecture connue affichée. ' + municipalEchapper_(municipalErreurSource) + '</p>' : '') +
    '<div class="municipal-sources">' + sources.map(function (s) { return '<article class="municipal-source"><span>' +
      municipalEchapper_(s[0]) + '</span><strong>' + municipalEchapper_(s[1]) + '</strong><small>' +
      municipalEchapper_(s[2]) + '</small></article>'; }).join('') + '</div>' +
    '<section class="municipal-section"><h4>Destinataire et procédure locale</h4><p class="municipal-aide">À confirmer auprès de la commune : le service, le canal et les délais varient selon le territoire et le type d’événement.</p>' +
    '<div class="municipal-grille">' +
    '<label class="municipal-champ">Commune<input data-municipal-dossier="destinataire.commune" value="' + municipalEchapper_(d.commune) + '"></label>' +
    '<label class="municipal-champ">Service destinataire<input data-municipal-dossier="destinataire.service" value="' + municipalEchapper_(d.service) + '" placeholder="Sports, événementiel, espace public…"></label>' +
    '<label class="municipal-champ">Interlocuteur<input data-municipal-dossier="destinataire.interlocuteur" value="' + municipalEchapper_(d.interlocuteur) + '"></label>' +
    '<label class="municipal-champ">Canal attendu<select data-municipal-dossier="destinataire.canal">' + municipalOptions_(MUNICIPAL_CANAUX, d.canal) + '</select></label>' +
    '<label class="municipal-champ">Courriel<input type="email" data-municipal-dossier="destinataire.email" value="' + municipalEchapper_(d.email) + '"></label>' +
    '<label class="municipal-champ">Téléphone<input type="tel" data-municipal-dossier="destinataire.telephone" value="' + municipalEchapper_(d.telephone) + '"></label>' +
    '<label class="municipal-champ">Date limite locale<input type="date" data-municipal-dossier="destinataire.date_limite" value="' + municipalEchapper_(d.date_limite) + '"></label></div></section>' +
    '<section class="municipal-section"><h4>Identité de l’organisateur</h4><p class="municipal-aide">Complète uniquement les références demandées par la mairie ; les champs vides restent signalés comme à confirmer.</p>' +
    '<div class="municipal-grille"><label class="municipal-champ est-large">Adresse<input data-municipal-dossier="organisateur.adresse" value="' + municipalEchapper_(o.adresse) + '"></label>' +
    '<label class="municipal-champ">RNA<input data-municipal-dossier="organisateur.rna" value="' + municipalEchapper_(o.rna) + '"></label>' +
    '<label class="municipal-champ">SIRET<input data-municipal-dossier="organisateur.siret" value="' + municipalEchapper_(o.siret) + '"></label>' +
    '<label class="municipal-champ">Code APE<input data-municipal-dossier="organisateur.code_ape" value="' + municipalEchapper_(o.code_ape) + '"></label>' +
    '<label class="municipal-champ">Assurance / police<input data-municipal-dossier="organisateur.assurance" value="' + municipalEchapper_(o.assurance) + '"></label></div></section>' +
    '<section class="municipal-section"><h4>Volets à inclure ou à vérifier</h4><p class="municipal-aide">Cette sélection prépare le dossier ; elle ne prétend pas rendre chaque volet obligatoire dans toutes les communes.</p><div class="municipal-cases">' +
    MUNICIPAL_VOLETS.map(function (v) { return '<label class="municipal-case"><input type="checkbox" data-municipal-volet="' + v[0] + '"' + (municipalEtat.demande.volets[v[0]] ? ' checked' : '') + '> ' + municipalEchapper_(v[1]) + '</label>'; }).join('') +
    '</div></section>' + municipalPied_('Les exigences locales restent à confirmer avant l’envoi.', 2) + '</div>';
}

function municipalOptions_(liste, valeur) {
  return liste.map(function (o) {
    var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
    return '<option value="' + municipalEchapper_(v) + '"' + (v === valeur ? ' selected' : '') + '>' + municipalEchapper_(l) + '</option>';
  }).join('');
}
function municipalBadge_(statut) {
  var trouve = MUNICIPAL_STATUTS.find(function (s) { return s[0] === statut; });
  var classe = statut === 'accord' ? ' est-accord' : (statut === 'envoye' || statut === 'en_preparation' ? ' est-attente' : '');
  return '<span class="municipal-badge' + classe + '">' + municipalEchapper_(trouve ? trouve[1] : 'À demander') + '</span>';
}
function municipalFichiersPour_(id) { return municipalFichiersEspaces[id] || []; }
function municipalRendreFichiers_(fichiers, cible) {
  if (!fichiers.length) return '';
  return '<div class="municipal-fichiers">' + fichiers.map(function (f, i) {
    return '<div class="municipal-fichier"><strong>' + municipalEchapper_(f.name) + '</strong><small>' +
      municipalTaille_(f.size) + '</small><button type="button" aria-label="Retirer ' + municipalEchapper_(f.name) +
      '" data-municipal-retirer-fichier="' + i + '" data-fichier-cible="' + municipalEchapper_(cible) + '">×</button></div>';
  }).join('') + '</div>';
}
function municipalZoneDepot_(cible, fichiers) {
  return '<div class="municipal-depot" data-municipal-depot="' + municipalEchapper_(cible) + '">' +
    '<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" aria-label="Ajouter des documents PDF ou images">' +
    '<span><strong>Dépose tes documents ici</strong><br>PDF, JPG ou PNG · intégrés au dossier final</span></div>' +
    '<div data-municipal-fichiers-cible="' + municipalEchapper_(cible) + '">' + municipalRendreFichiers_(fichiers, cible) + '</div>';
}

function municipalLibelleBesoin_(besoin) {
  return [besoin.categorie, besoin.intitule, besoin.quantite ? 'Qté ' + besoin.quantite : '', besoin.details].filter(Boolean).join(' · ');
}

function municipalRendreEspace_(espace, index) {
  var usages = MUNICIPAL_USAGES.map(function (u) {
    return '<label class="municipal-case"><input type="checkbox" data-municipal-champ="usage:' + u[0] + '"' +
      (espace.usages[u[0]] ? ' checked' : '') + '> ' + municipalEchapper_(u[1]) + '</label>';
  }).join('');
  var besoins = espace.besoins.map(function (b, i) { var libelle = municipalLibelleBesoin_(b); return '<span class="municipal-besoin">' + municipalEchapper_(libelle) +
    '<button type="button" aria-label="Retirer ' + municipalEchapper_(libelle) + '" data-municipal-retirer-besoin="' + i + '">×</button></span>'; }).join('');
  var sousTitre = [espace.type, espace.adresse].filter(Boolean).join(' · ') || 'Informations à compléter';
  return '<details class="municipal-espace" data-space-id="' + municipalEchapper_(espace.id) + '"' + (index === 0 ? ' open' : '') + '>' +
    '<summary><span class="municipal-espace-titre"><strong>' + municipalEchapper_(espace.nom || 'Espace sans nom') +
    '</strong><small>' + municipalEchapper_(sousTitre) + '</small></span>' + municipalBadge_(espace.statut) + '</summary>' +
    '<div class="municipal-espace-corps"><div class="municipal-grille">' +
    '<label class="municipal-champ">Nom de l’espace<input data-municipal-champ="nom" value="' + municipalEchapper_(espace.nom) + '"></label>' +
    '<label class="municipal-champ">Type<select data-municipal-champ="type">' + municipalOptions_(MUNICIPAL_TYPES, espace.type) + '</select></label>' +
    '<label class="municipal-champ est-large">Adresse ou précision d’accès<input data-municipal-champ="adresse" value="' + municipalEchapper_(espace.adresse) + '"></label>' +
    '<label class="municipal-champ">Propriétaire / gestionnaire<input data-municipal-champ="gestionnaire_nom" value="' + municipalEchapper_(espace.gestionnaire_nom) + '"></label>' +
    '<label class="municipal-champ">Interlocuteur<input data-municipal-champ="interlocuteur_nom" value="' + municipalEchapper_(espace.interlocuteur_nom) + '"></label>' +
    '<label class="municipal-champ">Téléphone<input type="tel" data-municipal-champ="gestionnaire_tel" value="' + municipalEchapper_(espace.gestionnaire_tel) + '"></label>' +
    '<label class="municipal-champ est-large">Courriel<input type="email" data-municipal-champ="gestionnaire_mail" value="' + municipalEchapper_(espace.gestionnaire_mail) + '"></label></div>' +
    '<section class="municipal-section"><h4>Usage demandé</h4><div class="municipal-cases">' + usages + '</div></section>' +
    '<section class="municipal-section"><h4>Créneau et état de l’autorisation</h4><div class="municipal-grille">' +
    '<label class="municipal-champ">Statut<select data-municipal-champ="statut">' + municipalOptions_(MUNICIPAL_STATUTS, espace.statut) + '</select></label>' +
    '<label class="municipal-champ">Date de début<input type="date" data-municipal-champ="date" value="' + municipalEchapper_(espace.date) + '"></label>' +
    '<label class="municipal-champ">Date de fin<input type="date" data-municipal-champ="date_fin" value="' + municipalEchapper_(espace.date_fin) + '"></label>' +
    '<label class="municipal-champ">Heure de début<input type="time" data-municipal-champ="debut" value="' + municipalEchapper_(espace.debut) + '"></label>' +
    '<label class="municipal-champ">Heure de fin<input type="time" data-municipal-champ="fin" value="' + municipalEchapper_(espace.fin) + '"></label>' +
    '<label class="municipal-champ">Début du montage<input type="datetime-local" data-municipal-champ="montage_debut" value="' + municipalEchapper_(espace.montage_debut) + '"></label>' +
    '<label class="municipal-champ">Fin du démontage<input type="datetime-local" data-municipal-champ="demontage_fin" value="' + municipalEchapper_(espace.demontage_fin) + '"></label></div></section>' +
    '<section class="municipal-section"><h4>Besoins à transmettre</h4><div class="municipal-besoins">' + besoins + '</div>' +
    '<div class="municipal-ajout-besoin"><select aria-label="Catégorie du besoin" data-municipal-besoin-categorie>' + municipalOptions_(MUNICIPAL_BESOINS_CATEGORIES, 'Matériel') + '</select>' +
    '<input placeholder="Besoin précis" aria-label="Besoin précis" data-municipal-nouveau-besoin><input class="municipal-quantite" placeholder="Qté" aria-label="Quantité" data-municipal-besoin-quantite>' +
    '<input placeholder="Détails utiles" aria-label="Détails du besoin" data-municipal-besoin-details>' +
    '<button type="button" class="bouton bouton-secondaire" data-municipal-ajouter-besoin>Ajouter</button></div></section>' +
    '<section class="municipal-section"><h4>Précisions</h4><label class="municipal-champ"><textarea data-municipal-champ="notes" placeholder="Contraintes, installation, remise des clés…">' + municipalEchapper_(espace.notes) + '</textarea></label></section>' +
    '<section class="municipal-section"><h4>Documents propres à cet espace</h4>' + municipalZoneDepot_('espace:' + espace.id, municipalFichiersPour_(espace.id)) + '</section>' +
    '<div class="municipal-espace-actions"><button type="button" class="bouton bouton-secondaire" data-municipal-supprimer-espace>Retirer de la demande</button></div>' +
    '</div></details>';
}

function municipalRendreComposition_() {
  var espaces = municipalEtat.demande.espaces;
  var pieces = municipalFichiersCommuns.length + Object.keys(municipalFichiersEspaces).reduce(function (n, id) { return n + municipalFichiersPour_(id).length; }, 0);
  var besoins = espaces.reduce(function (n, e) { return n + e.besoins.length; }, 0);
  return '<div class="municipal-panneau"><div class="municipal-barre"><div><h3>Sites concernés</h3>' +
    '<p>Ajoute un espace, puis décris uniquement l’usage et les moyens réellement demandés.</p></div>' +
    '<div class="municipal-barre-actions"><button type="button" class="bouton bouton-secondaire" data-municipal-importer-terrains>Reprendre depuis Terrains</button>' +
    '<button type="button" class="bouton" data-municipal-ouvrir-drawer>+ Ajouter un espace</button></div></div>' +
    (espaces.length ? '<div class="municipal-espaces">' + espaces.map(municipalRendreEspace_).join('') + '</div>' :
      '<div class="municipal-vide"><strong>Aucun espace ajouté</strong><span>Commence par ajouter le premier site concerné. Son nom, son gestionnaire et son usage restent entièrement libres.</span>' +
      '<button type="button" class="bouton" data-municipal-ouvrir-drawer>+ Ajouter un espace</button></div>') +
    '<div class="municipal-recap"><div><span>Espaces</span><strong>' + espaces.length + '</strong></div>' +
    '<div><span>Besoins</span><strong>' + besoins + '</strong></div><div><span>Pièces locales</span><strong>' + pieces + '</strong></div>' +
    '<div><span>Accords obtenus</span><strong>' + espaces.filter(function (e) { return e.statut === 'accord'; }).length + '/' + espaces.length + '</strong></div></div>' +
    municipalPied_('Vérifie ensuite les pièces et les éléments manquants.', 3) + '</div>';
}

function municipalChronologieValide_(e) {
  var finDate = e.date_fin || e.date;
  if (e.date && finDate && finDate < e.date) return false;
  if (e.date && finDate === e.date && e.debut && e.fin && e.fin <= e.debut) return false;
  if (e.montage_debut && e.demontage_fin && e.demontage_fin < e.montage_debut) return false;
  return true;
}

function municipalChecklist_() {
  var g = (configCourante && configCourante.global) || {};
  var espaces = municipalEtat.demande.espaces;
  var d = municipalEtat.demande.destinataire;
  var aPieces = municipalFichiersCommuns.length > 0 || Object.keys(municipalFichiersEspaces).some(function (id) { return municipalFichiersPour_(id).length; });
  return [
    [!!municipalTexte_(g.tournoi_nom), 'Manifestation identifiée', 'Nom repris de l’écran Infos'],
    [!!municipalTexte_(g.tournoi_date), 'Date renseignée', municipalDateLisible_(g.tournoi_date) || 'Date manquante'],
    [espaces.length > 0, 'Au moins un espace concerné', espaces.length + ' espace(s)'],
    [!!municipalTexte_(d.commune), 'Commune destinataire identifiée', d.commune || 'À compléter'],
    [d.canal !== 'a_confirmer', 'Canal de dépôt confirmé', d.canal === 'a_confirmer' ? 'À vérifier auprès de la commune' : 'Renseigné'],
    [espaces.every(function (e) { return e.nom && e.type; }), 'Chaque espace est nommé et qualifié', 'Nom et type obligatoires'],
    [espaces.every(function (e) { return e.date && e.debut && e.fin; }), 'Créneaux renseignés', 'Début et fin par espace'],
    [espaces.every(municipalChronologieValide_), 'Chronologie cohérente', 'Fin postérieure au début, montage et démontage compris'],
    [aPieces, 'Pièces ajoutées si la commune les exige', aPieces ? 'Pièces présentes dans cet onglet' : 'Aucune pièce — vérifier la procédure locale']
  ];
}
function municipalRendrePieces_() {
  var checks = municipalChecklist_();
  return '<div class="municipal-panneau"><div class="municipal-barre"><div><h3>Pièces & vérification</h3>' +
    '<p>Les PDF et images sont conservés dans cet onglet, puis intégrés au dossier produit.</p></div></div>' +
    '<p class="municipal-alerte">Confidentialité : les fichiers ne sont ni envoyés ni enregistrés avec le brouillon. Garde cet onglet ouvert jusqu’à la génération du PDF.</p>' +
    '<section class="municipal-section" style="margin-top:0;padding-top:0;border-top:0"><h4>Pièces communes au dossier</h4>' +
    municipalZoneDepot_('communs', municipalFichiersCommuns) + '</section>' +
    '<section class="municipal-section"><h4>Contrôles avant génération</h4><div class="municipal-checklist">' + checks.map(function (c) {
      return '<div class="municipal-check' + (c[0] ? ' est-ok' : '') + '"><b>' + (c[0] ? '✓' : '!') + '</b><span>' +
        municipalEchapper_(c[1]) + '</span><small>' + municipalEchapper_(c[2]) + '</small></div>'; }).join('') + '</div></section>' +
    municipalPied_('Les documents Office ne sont pas acceptés : convertis-les en PDF pour garantir leur présence dans le dossier.', 4) + '</div>';
}

function municipalPied_(texte, suivante) {
  return '<div class="municipal-pied"><small>' + municipalEchapper_(texte) + '</small><div class="municipal-pied-actions">' +
    '<button type="button" class="bouton bouton-secondaire" data-municipal-enregistrer>Enregistrer le brouillon</button>' +
    (suivante ? '<button type="button" class="bouton" data-municipal-etape="' + suivante + '">Continuer</button>' : '') +
    '</div></div><div class="municipal-toast" data-municipal-message role="status" aria-live="polite"></div>';
}

function municipalRendrePdfSuivi_() {
  var s = municipalEtat.demande.suivi || {};
  return '<div class="municipal-panneau"><div class="municipal-barre"><div><h3>Dossier PDF & suivi</h3>' +
    '<p>Le document est assemblé localement : synthèse, détail des espaces, puis pièces PDF et images.</p></div>' +
    '<div class="municipal-barre-actions"><button type="button" class="bouton bouton-secondaire" data-municipal-pdf="apercu">Prévisualiser le PDF</button>' +
    '<button type="button" class="bouton" data-municipal-pdf="telecharger">Télécharger le dossier PDF</button></div></div>' +
    '<div class="municipal-suivi"><label class="municipal-champ">État du dossier<select data-municipal-suivi="statut">' +
    municipalOptions_([['brouillon','Brouillon'],['pret','Prêt à envoyer'],['envoye','Envoyé'],['retour','Retour reçu'],['clos','Clos']], s.statut || 'brouillon') + '</select></label>' +
    '<label class="municipal-champ">Date d’envoi<input type="date" data-municipal-suivi="date_envoi" value="' + municipalEchapper_(s.date_envoi || '') + '"></label>' +
    '<label class="municipal-champ">Référence municipale<input data-municipal-suivi="reference" value="' + municipalEchapper_(s.reference || '') + '" placeholder="Numéro ou référence de dossier"></label>' +
    '<label class="municipal-champ">Retour / décision<textarea data-municipal-suivi="retour" placeholder="Accord, réserves, pièces complémentaires…">' + municipalEchapper_(s.retour || '') + '</textarea></label></div>' +
    '<section class="municipal-section"><h4>Note générale au dossier</h4><label class="municipal-champ"><textarea data-municipal-notes placeholder="Message d’accompagnement, contraintes transversales…">' + municipalEchapper_(municipalEtat.demande.notes) + '</textarea></label></section>' +
    municipalPied_('La génération et la prévisualisation du PDF ne déclenchent aucun appel serveur.', null) + '</div>';
}

function municipalRendre_() {
  var racine = document.getElementById('municipal-racine');
  if (!racine) return;
  var panneau = municipalEtape === 1 ? municipalRendreSources_() : municipalEtape === 2 ? municipalRendreComposition_() :
    municipalEtape === 3 ? municipalRendrePieces_() : municipalRendrePdfSuivi_();
  racine.innerHTML = '<div class="municipal">' + municipalEntete_() + municipalEtapes_() + panneau + '</div>';
}

function afficherMunicipalDepuisAutorisation(dossier, config, estimation, erreur) {
  municipalDossier = dossier || municipalDossier;
  municipalEstimation = estimation || municipalEstimation;
  municipalErreurSource = erreur || '';
  municipalInitialiserDepuisConfig_(config || configCourante, false);
  municipalRendre_();
}

function municipalEspaceElement_(cible) {
  var details = cible && cible.closest ? cible.closest('[data-space-id]') : null;
  if (!details) return null;
  return municipalEtat.demande.espaces.find(function (e) { return e.id === details.getAttribute('data-space-id'); }) || null;
}
function municipalMarquerSale_() { municipalSale = true; }
function municipalMessage_(texte, type) {
  var zone = document.querySelector('#municipal-racine [data-municipal-message]');
  if (!zone) return;
  zone.textContent = texte || '';
  zone.className = 'municipal-toast' + (type ? ' est-' + type : '');
}

function municipalOuvrirDrawer_(declencheur) {
  if (document.getElementById('municipal-drawer')) return;
  municipalDernierFocus = declencheur || document.activeElement;
  var bibli = municipalEtat.bibliotheque;
  var fond = document.createElement('div');
  fond.className = 'municipal-drawer-fond'; fond.setAttribute('data-municipal-fermer-drawer', '');
  var drawer = document.createElement('aside');
  drawer.id = 'municipal-drawer'; drawer.className = 'municipal-drawer';
  drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); drawer.setAttribute('aria-labelledby', 'municipal-drawer-titre');
  drawer.innerHTML = '<div class="municipal-drawer-entete"><div><h3 id="municipal-drawer-titre">Ajouter un espace</h3>' +
    '<p>Décris librement le site concerné. Rien n’est prérempli au nom de la mairie.</p></div>' +
    '<button type="button" class="municipal-drawer-fermer" data-municipal-fermer-drawer aria-label="Fermer">×</button></div>' +
    '<div class="municipal-drawer-corps"><form id="municipal-form-espace"><div class="municipal-grille">' +
    (bibli.length ? '<label class="municipal-champ est-large">Reprendre un espace de la bibliothèque<select data-municipal-bibliotheque><option value="">— Nouvel espace —</option>' +
      bibli.map(function (e) { return '<option value="' + municipalEchapper_(e.id) + '">' + municipalEchapper_(e.nom || 'Espace sans nom') + '</option>'; }).join('') + '</select></label>' : '') +
    '<label class="municipal-champ est-large">Nom de l’espace *<input name="nom" required autocomplete="off" placeholder="Nom utilisé dans la demande"></label>' +
    '<label class="municipal-champ">Type<select name="type">' + municipalOptions_(MUNICIPAL_TYPES, 'Terrain sportif') + '</select></label>' +
    '<label class="municipal-champ">Statut<select name="statut">' + municipalOptions_(MUNICIPAL_STATUTS, 'a_demander') + '</select></label>' +
    '<label class="municipal-champ est-large">Adresse ou accès<input name="adresse" autocomplete="street-address"></label>' +
    '<label class="municipal-champ est-large">Propriétaire / gestionnaire<input name="gestionnaire_nom"></label>' +
    '<label class="municipal-champ est-large">Nom de l’interlocuteur<input name="interlocuteur_nom" autocomplete="name"></label>' +
    '<label class="municipal-champ">Téléphone<input type="tel" name="gestionnaire_tel" autocomplete="tel"></label>' +
    '<label class="municipal-champ">Courriel<input type="email" name="gestionnaire_mail" autocomplete="email"></label>' +
    '<label class="municipal-champ">Date de début<input type="date" name="date"></label>' +
    '<label class="municipal-champ">Date de fin<input type="date" name="date_fin"></label>' +
    '<label class="municipal-champ">Horaires<div style="display:flex;gap:7px"><input type="time" name="debut" aria-label="Début"><input type="time" name="fin" aria-label="Fin"></div></label>' +
    '<label class="municipal-champ">Montage / démontage<div style="display:flex;gap:7px"><input type="datetime-local" name="montage_debut" aria-label="Début du montage"><input type="datetime-local" name="demontage_fin" aria-label="Fin du démontage"></div></label></div>' +
    '<section class="municipal-section"><h4>Usage prévu pour cet événement</h4><div class="municipal-cases">' + MUNICIPAL_USAGES.map(function (u) {
      return '<label class="municipal-case"><input type="checkbox" name="usage_' + u[0] + '"> ' + municipalEchapper_(u[1]) + '</label>'; }).join('') + '</div></section>' +
    '<section class="municipal-section"><h4>Document (optionnel)</h4>' + municipalZoneDepot_('drawer', municipalFichiersDrawer) + '</section>' +
    '<section class="municipal-section"><label class="municipal-case"><input type="checkbox" name="conserver" checked> Conserver dans la bibliothèque des espaces</label></section>' +
    '<div class="municipal-toast" data-municipal-drawer-message role="alert"></div></form></div>' +
    '<div class="municipal-drawer-pied"><button type="button" class="bouton bouton-secondaire" data-municipal-fermer-drawer>Annuler</button>' +
    '<button type="submit" form="municipal-form-espace" class="bouton">Ajouter à la demande</button></div>';
  document.body.appendChild(fond); document.body.appendChild(drawer);
  document.body.classList.add('municipal-dialogue-ouvert');
  setTimeout(function () { var premier = drawer.querySelector('[name="nom"]'); if (premier) premier.focus(); }, 0);
}
function municipalFermerDrawer_() {
  var drawer = document.getElementById('municipal-drawer');
  var fond = document.querySelector('.municipal-drawer-fond');
  if (drawer) drawer.remove(); if (fond) fond.remove();
  municipalFichiersDrawer = [];
  document.body.classList.remove('municipal-dialogue-ouvert');
  if (municipalDernierFocus && municipalDernierFocus.focus) municipalDernierFocus.focus();
}
function municipalRemplirDrawerBibliotheque_(id) {
  var e = municipalEtat.bibliotheque.find(function (x) { return x.id === id; });
  var form = document.getElementById('municipal-form-espace');
  if (!e || !form) return;
  ['nom','type','statut','adresse','gestionnaire_nom','interlocuteur_nom','gestionnaire_tel','gestionnaire_mail','date','date_fin','debut','fin','montage_debut','demontage_fin'].forEach(function (champ) {
    if (form.elements[champ]) form.elements[champ].value = e[champ] || '';
  });
  MUNICIPAL_USAGES.forEach(function (u) { if (form.elements['usage_' + u[0]]) form.elements['usage_' + u[0]].checked = !!e.usages[u[0]]; });
}
function municipalAjouterDepuisDrawer_(form) {
  if (!form.reportValidity()) return;
  var usages = {};
  MUNICIPAL_USAGES.forEach(function (u) { usages[u[0]] = !!form.elements['usage_' + u[0]].checked; });
  var espace = municipalNormaliserEspace_({
    nom: form.elements.nom.value, type: form.elements.type.value, statut: form.elements.statut.value,
    adresse: form.elements.adresse.value, gestionnaire_nom: form.elements.gestionnaire_nom.value,
    interlocuteur_nom: form.elements.interlocuteur_nom.value,
    gestionnaire_tel: form.elements.gestionnaire_tel.value, gestionnaire_mail: form.elements.gestionnaire_mail.value,
    date: form.elements.date.value, date_fin: form.elements.date_fin.value, debut: form.elements.debut.value, fin: form.elements.fin.value,
    montage_debut: form.elements.montage_debut.value, demontage_fin: form.elements.demontage_fin.value,
    usages: usages, conserver: form.elements.conserver.checked
  });
  municipalEtat.demande.espaces.push(espace);
  if (municipalFichiersDrawer.length) municipalFichiersEspaces[espace.id] = municipalFichiersDrawer.slice();
  if (espace.conserver) {
    var meme = municipalEtat.bibliotheque.findIndex(function (x) { return x.nom.toLowerCase() === espace.nom.toLowerCase(); });
    if (meme === -1) municipalEtat.bibliotheque.push(municipalCopie_(espace));
    else municipalEtat.bibliotheque[meme] = municipalCopie_(espace);
  }
  municipalMarquerSale_(); municipalFermerDrawer_(); municipalRendre_();
}

function municipalImporterTerrains_() {
  var terrains = [];
  /* ⛔ Pas de repli sur les terrains de démonstration du module Terrains : seuls les espaces
     réellement enregistrés par l'organisateur peuvent entrer dans une demande municipale. */
  try {
    var brut = configCourante && configCourante.global && configCourante.global.terrains_physiques;
    terrains = brut ? JSON.parse(brut) : [];
    if (!Array.isArray(terrains)) terrains = [];
  } catch (e) { terrains = []; }
  var existants = municipalEtat.demande.espaces.map(function (e) { return e.nom.toLowerCase(); });
  var ajoutes = 0;
  (terrains || []).forEach(function (t) {
    var nom = municipalTexte_(t.nom);
    if (!nom || existants.indexOf(nom.toLowerCase()) !== -1) return;
    municipalEtat.demande.espaces.push(municipalNormaliserEspace_({ nom: nom, type: 'Terrain sportif', conserver: true }));
    existants.push(nom.toLowerCase()); ajoutes++;
  });
  if (ajoutes) { municipalMarquerSale_(); municipalRendre_(); municipalMessage_(ajoutes + ' espace(s) repris depuis Terrains.', 'ok'); }
  else municipalMessage_('Aucun nouvel espace à reprendre depuis Terrains.', 'ko');
}

function municipalFichiersTotal_() {
  return municipalFichiersCommuns.concat(municipalFichiersDrawer, Object.keys(municipalFichiersEspaces).reduce(function (liste, id) {
    return liste.concat(municipalFichiersPour_(id));
  }, []));
}
function municipalAnnexes_() {
  var annexes = municipalFichiersCommuns.map(function (f) { return { fichier: f, rattachement: 'Dossier commun' }; });
  municipalEtat.demande.espaces.forEach(function (e) {
    municipalFichiersPour_(e.id).forEach(function (f) { annexes.push({ fichier: f, rattachement: e.nom || 'Espace sans nom' }); });
  });
  return annexes;
}
function municipalAjouterFichiers_(liste, cible) {
  var fichiers = Array.prototype.slice.call(liste || []);
  var destination;
  if (cible === 'communs') destination = municipalFichiersCommuns;
  else if (cible === 'drawer') destination = municipalFichiersDrawer;
  else {
    var id = cible.replace(/^espace:/, '');
    destination = municipalFichiersEspaces[id] = municipalFichiersEspaces[id] || [];
  }
  var total = municipalFichiersTotal_().reduce(function (n, f) { return n + f.size; }, 0);
  var erreur = '';
  fichiers.forEach(function (f) {
    var extensionOk = /\.(pdf|jpe?g|png)$/i.test(f.name || '');
    if (MUNICIPAL_FICHIERS_TYPES.indexOf(f.type) === -1 && !extensionOk) { erreur = 'Seuls les PDF, JPG et PNG peuvent être intégrés au dossier.'; return; }
    if (f.size > MUNICIPAL_TAILLE_FICHIER_MAX) { erreur = f.name + ' dépasse 15 Mo.'; return; }
    if (total + f.size > MUNICIPAL_TAILLE_TOTALE_MAX) { erreur = 'La sélection dépasse 40 Mo au total.'; return; }
    destination.push(f); total += f.size;
  });
  if (cible === 'drawer') {
    var zone = document.querySelector('[data-municipal-fichiers-cible="drawer"]');
    if (zone) zone.innerHTML = municipalRendreFichiers_(municipalFichiersDrawer, 'drawer');
  } else municipalRendre_();
  if (erreur) {
    var messageDrawer = document.querySelector('[data-municipal-drawer-message]');
    if (cible === 'drawer' && messageDrawer) { messageDrawer.textContent = erreur; messageDrawer.className = 'municipal-toast est-ko'; }
    else municipalMessage_(erreur, 'ko');
  }
}

function municipalDemandeSerializable_() {
  return municipalCopie_(municipalEtat.demande);
}
function municipalBibliothequeSerializable_() {
  var parNom = {};
  municipalEtat.bibliotheque.forEach(function (e) { if (e.conserver && e.nom) parNom[e.nom.toLowerCase()] = municipalCopie_(e); });
  municipalEtat.demande.espaces.forEach(function (e) { if (e.conserver && e.nom) parNom[e.nom.toLowerCase()] = municipalCopie_(e); });
  return Object.keys(parNom).map(function (k) { return parNom[k]; });
}
function municipalProfilSerializable_() {
  return { version: 1, destinataire: municipalCopie_(municipalEtat.demande.destinataire),
    organisateur: municipalCopie_(municipalEtat.demande.organisateur) };
}
async function municipalEnregistrer_(bouton) {
  if (municipalEnregistrementEnCours) return;
  if (!municipalEtat.demande.espaces.length) { municipalMessage_('Ajoute au moins un espace avant d’enregistrer.', 'ko'); return; }
  municipalEnregistrementEnCours = true;
  var demande = municipalDemandeSerializable_();
  var bibliotheque = municipalBibliothequeSerializable_();
  var profil = municipalProfilSerializable_();
  bouton = bouton || document.querySelector('[data-municipal-enregistrer]');
  if (bouton) bouton.disabled = true;
  municipalMessage_('Enregistrement en cours…');
  try {
    var res = await ecrireAdmin('enregistrerDemandeMunicipale', {
      demande_municipale_json: JSON.stringify(demande),
      bibliotheque_espaces_json: JSON.stringify(bibliotheque),
      profil_municipal_json: JSON.stringify(profil),
      base_revision: municipalEtat.revision
    }, { delaiMs: 25000 });
    if (res && res.config) configCourante = res.config;
    municipalEtat.demande = municipalNormaliserDemande_(res && res.demande ? res.demande : demande);
    municipalEtat.bibliotheque = (res && res.bibliotheque ? res.bibliotheque : bibliotheque).map(municipalNormaliserEspace_);
    municipalEtat.profil = res && res.profil ? res.profil : profil;
    municipalEtat.revision = Number(res && res.revision) || municipalEtat.revision;
    municipalSale = false;
    municipalRendre_(); municipalMessage_('Brouillon enregistré. Aucun rechargement supplémentaire.', 'ok');
  } catch (e) {
    var r = e && e.reponse;
    if (r && r.code === 'modification_concurrente') {
      var localDemande = JSON.stringify(demande), localBibli = JSON.stringify(bibliotheque), localProfil = JSON.stringify(profil);
      if (JSON.stringify(r.demande || {}) === localDemande && JSON.stringify(r.bibliotheque || []) === localBibli &&
          JSON.stringify(r.profil || {}) === localProfil) {
        municipalEtat.revision = Number(r.revision) || municipalEtat.revision; municipalSale = false;
        municipalMessage_('Le même brouillon était déjà enregistré.', 'ok');
      } else {
        municipalMessage_('Rien n’a été écrasé : ce dossier a été modifié ailleurs. Ta saisie locale est conservée ; recharge la page pour comparer.', 'ko');
      }
    } else {
      municipalMessage_('État incertain : la réponse n’est pas revenue. Aucun nouvel essai automatique n’a été lancé.', 'ko');
    }
  } finally { municipalEnregistrementEnCours = false; if (bouton) bouton.disabled = false; }
}

function municipalPdfTexte_(texte) {
  return String(texte == null ? '' : texte).replace(/[\u2010-\u2015]/g, '-').replace(/\u2022/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}
function municipalPdfLignes_(texte, police, taille, largeur) {
  var mots = municipalPdfTexte_(texte).split(/\s+/), lignes = [], ligne = '';
  mots.forEach(function (mot) {
    var essai = ligne ? ligne + ' ' + mot : mot;
    if (police.widthOfTextAtSize(essai, taille) <= largeur || !ligne) ligne = essai;
    else { lignes.push(ligne); ligne = mot; }
  });
  if (ligne) lignes.push(ligne);
  return lignes.length ? lignes : [''];
}
async function municipalConstruirePdf_() {
  if (!window.PDFLib) throw new Error('Bibliothèque PDF indisponible.');
  var PDFDocument = PDFLib.PDFDocument, StandardFonts = PDFLib.StandardFonts, rgb = PDFLib.rgb;
  var pdf = await PDFDocument.create();
  var regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  var page, y;
  function nouvellePage(titre) {
    page = pdf.addPage([595.28, 841.89]); y = 790;
    page.drawText(municipalPdfTexte_(titre), { x: 45, y:y, size:20, font:bold, color:rgb(.07,.38,.62) }); y -= 34;
  }
  function ligne(libelle, valeur) {
    if (y < 90) nouvellePage('Demande municipale - suite');
    if (libelle) { page.drawText(municipalPdfTexte_(libelle), { x:45, y:y, size:9, font:bold, color:rgb(.18,.29,.39) }); y -= 14; }
    municipalPdfLignes_(valeur || 'A completer', regular, 10, 505).forEach(function (l) { page.drawText(l, { x:45, y:y, size:10, font:regular, color:rgb(.15,.22,.29) }); y -= 14; });
    y -= 8;
  }
  var g = (configCourante && configCourante.global) || {};
  var d = municipalEtat.demande.destinataire, o = municipalEtat.demande.organisateur;
  nouvellePage('Dossier de demande municipale');
  ligne('Destinataire', [d.commune, d.service, d.interlocuteur, d.email, d.telephone].filter(Boolean).join(' - ') || 'A confirmer avec la commune');
  ligne('Canal et echeance', [(MUNICIPAL_CANAUX.find(function (c) { return c[0] === d.canal; }) || ['', 'A confirmer'])[1], municipalDateLisible_(d.date_limite)].filter(Boolean).join(' - '));
  ligne('Manifestation', g.tournoi_nom || 'A completer');
  ligne('Date et lieu', [municipalDateLisible_(g.tournoi_date), g.tournoi_lieu, g.tournoi_adresse].filter(Boolean).join(' - '));
  ligne('Description', g.tournoi_description || 'A completer');
  ligne('Organisateur', municipalChampDossier_('Nom du club ou de la structure organisatrice') || g.org_club_nom || 'A completer');
  ligne('Contact', [municipalChampDossier_('Représenté par (M./Mme)') || g.org_representant_nom || g.referent_nom,
    g.org_representant_tel || g.referent_tel, g.org_representant_mail || g.referent_mail].filter(Boolean).join(' - ') || 'A completer');
  ligne('Identifiants organisateur', [o.adresse, o.rna && 'RNA ' + o.rna, o.siret && 'SIRET ' + o.siret,
    o.code_ape && 'APE ' + o.code_ape, o.assurance && 'Assurance ' + o.assurance].filter(Boolean).join(' - ') || 'A confirmer selon la procedure locale');
  ligne('Public attendu', municipalEstimation && municipalEstimation.contrat === 'estimation-public-1' ?
    Number(municipalEstimation.centrale || 0) + ' spectateurs, hors joueurs et educateurs' : 'A completer');
  ligne('Categories', municipalCategories_().join(', ') || 'A completer');
  ligne('Volets du dossier', MUNICIPAL_VOLETS.filter(function (v) { return municipalEtat.demande.volets[v[0]]; }).map(function (v) { return v[1]; }).join(', ') || 'A confirmer avec la commune');
  ligne('Objet du dossier', municipalEtat.demande.notes || 'Mise a disposition des espaces et moyens decrits dans les pages suivantes.');
  municipalEtat.demande.espaces.forEach(function (e, i) {
    nouvellePage('Espace ' + (i + 1) + ' - ' + (e.nom || 'Sans nom'));
    ligne('Type et adresse', [e.type, e.adresse].filter(Boolean).join(' - '));
    ligne('Proprietaire, gestionnaire et interlocuteur', [e.gestionnaire_nom, e.interlocuteur_nom, e.gestionnaire_tel, e.gestionnaire_mail].filter(Boolean).join(' - '));
    ligne('Creneau demande', [[municipalDateLisible_(e.date), municipalDateLisible_(e.date_fin)].filter(Boolean).join(' au '), e.debut && e.fin ? e.debut + ' - ' + e.fin : ''].filter(Boolean).join(' - '));
    ligne('Montage et demontage', [e.montage_debut, e.demontage_fin].filter(Boolean).join(' - ') || 'Sans creneau distinct renseigne');
    ligne('Usages', MUNICIPAL_USAGES.filter(function (u) { return e.usages[u[0]]; }).map(function (u) { return u[1]; }).join(', ') || 'A completer');
    ligne('Besoins', e.besoins.map(municipalLibelleBesoin_).join('; ') || 'Aucun besoin specifique renseigne');
    ligne('Etat de la demande', (MUNICIPAL_STATUTS.find(function (s) { return s[0] === e.statut; }) || ['', 'A demander'])[1]);
    if (e.notes) ligne('Precisions', e.notes);
  });
  var annexes = municipalAnnexes_();
  if (annexes.length) {
    nouvellePage('Index des annexes');
    annexes.forEach(function (a, index) { ligne('Annexe ' + (index + 1), a.fichier.name + ' - ' + a.rattachement); });
  }
  for (var i = 0; i < annexes.length; i++) {
    var fichier = annexes[i].fichier, octets = await fichier.arrayBuffer(), nom = (fichier.name || '').toLowerCase();
    if (fichier.type === 'application/pdf' || /\.pdf$/.test(nom)) {
      nouvellePage('Annexe ' + (i + 1) + ' - ' + annexes[i].rattachement);
      ligne('Fichier', fichier.name);
      var annexe = await PDFDocument.load(octets); var pages = await pdf.copyPages(annexe, annexe.getPageIndices());
      pages.forEach(function (p) { pdf.addPage(p); });
    } else {
      var image = (fichier.type === 'image/png' || /\.png$/.test(nom)) ? await pdf.embedPng(octets) : await pdf.embedJpg(octets);
      var p = pdf.addPage([595.28, 841.89]); var scale = Math.min(505 / image.width, 741 / image.height, 1);
      p.drawText(municipalPdfTexte_('Annexe ' + (i + 1) + ' - ' + annexes[i].rattachement + ' - ' + fichier.name), { x:45, y:805, size:10, font:bold, color:rgb(.18,.29,.39) });
      p.drawImage(image, { x:(595.28-image.width*scale)/2, y:35, width:image.width*scale, height:image.height*scale });
    }
  }
  return pdf.save();
}
async function municipalProduirePdf_(mode, bouton) {
  if (!municipalEtat.demande.espaces.length) { municipalMessage_('Ajoute au moins un espace avant de produire le dossier.', 'ko'); return; }
  var g = (configCourante && configCourante.global) || {}, espaces = municipalEtat.demande.espaces;
  if (!municipalTexte_(g.tournoi_nom) || !municipalTexte_(g.tournoi_date) ||
      !municipalTexte_(municipalEtat.demande.destinataire.commune) ||
      !espaces.every(function (e) { return e.nom && e.type && e.date && e.debut && e.fin && municipalChronologieValide_(e); })) {
    municipalMessage_('Dossier incomplet : vérifie la manifestation, la commune, les espaces et leurs créneaux avant de produire le PDF.', 'ko');
    return;
  }
  if (bouton) bouton.disabled = true;
  municipalMessage_('Assemblage local du dossier…');
  try {
    var octets = await municipalConstruirePdf_();
    var blob = new Blob([octets], { type:'application/pdf' }), url = URL.createObjectURL(blob);
    if (mode === 'apercu') window.open(url, '_blank', 'noopener');
    else {
      var a = document.createElement('a'); a.href = url;
      a.download = 'demande-municipale-' + (((configCourante.global || {}).tournoi_nom || 'tournoi').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tournoi') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    municipalMessage_('Dossier PDF généré dans ce navigateur.', 'ok');
  } catch (e) { municipalMessage_('PDF non généré : ' + String(e && e.message || e), 'ko'); }
  finally { if (bouton) bouton.disabled = false; }
}

function municipalSurClic_(evt) {
  var cible = evt.target;
  var etape = cible.closest('[data-municipal-etape]');
  if (etape) { municipalEtape = Number(etape.getAttribute('data-municipal-etape')) || 1; municipalRendre_(); return; }
  var ouvrir = cible.closest('[data-municipal-ouvrir-drawer]');
  if (ouvrir) { municipalOuvrirDrawer_(ouvrir); return; }
  if (cible.closest('[data-municipal-fermer-drawer]')) { municipalFermerDrawer_(); return; }
  if (cible.closest('[data-municipal-importer-terrains]')) { municipalImporterTerrains_(); return; }
  var retirerEspace = cible.closest('[data-municipal-supprimer-espace]');
  if (retirerEspace) {
    var e = municipalEspaceElement_(retirerEspace);
    if (e && window.confirm('Retirer « ' + (e.nom || 'cet espace') + ' » de la demande ?')) {
      municipalEtat.demande.espaces = municipalEtat.demande.espaces.filter(function (x) { return x.id !== e.id; });
      delete municipalFichiersEspaces[e.id]; municipalMarquerSale_(); municipalRendre_();
    } return;
  }
  var ajouterBesoin = cible.closest('[data-municipal-ajouter-besoin]');
  if (ajouterBesoin) {
    var espace = municipalEspaceElement_(ajouterBesoin), ligneBesoin = ajouterBesoin.parentNode;
    var input = ligneBesoin.querySelector('[data-municipal-nouveau-besoin]');
    var valeur = municipalTexte_(input && input.value);
    if (espace && valeur) {
      espace.besoins.push(municipalNormaliserBesoin_({ categorie: ligneBesoin.querySelector('[data-municipal-besoin-categorie]').value,
        intitule: valeur, quantite: ligneBesoin.querySelector('[data-municipal-besoin-quantite]').value,
        details: ligneBesoin.querySelector('[data-municipal-besoin-details]').value }));
      municipalMarquerSale_(); municipalRendre_();
    }
    return;
  }
  var retirerBesoin = cible.closest('[data-municipal-retirer-besoin]');
  if (retirerBesoin) {
    var esp = municipalEspaceElement_(retirerBesoin); if (esp) { esp.besoins.splice(Number(retirerBesoin.getAttribute('data-municipal-retirer-besoin')), 1); municipalMarquerSale_(); municipalRendre_(); } return;
  }
  var retirerFichier = cible.closest('[data-municipal-retirer-fichier]');
  if (retirerFichier) {
    var ct = retirerFichier.getAttribute('data-fichier-cible');
    var liste = ct === 'communs' ? municipalFichiersCommuns : (ct === 'drawer' ? municipalFichiersDrawer : municipalFichiersPour_(ct.replace(/^espace:/, '')));
    liste.splice(Number(retirerFichier.getAttribute('data-municipal-retirer-fichier')), 1);
    if (ct === 'drawer') {
      var zoneDrawer = document.querySelector('[data-municipal-fichiers-cible="drawer"]');
      if (zoneDrawer) zoneDrawer.innerHTML = municipalRendreFichiers_(municipalFichiersDrawer, 'drawer');
    } else municipalRendre_();
    return;
  }
  var enregistrer = cible.closest('[data-municipal-enregistrer]');
  if (enregistrer) { municipalEnregistrer_(enregistrer); return; }
  var pdf = cible.closest('[data-municipal-pdf]');
  if (pdf) municipalProduirePdf_(pdf.getAttribute('data-municipal-pdf'), pdf);
}
function municipalSurInput_(evt) {
  var cible = evt.target;
  var champ = cible.getAttribute && cible.getAttribute('data-municipal-champ');
  if (champ) {
    var espace = municipalEspaceElement_(cible); if (!espace) return;
    if (champ.indexOf('usage:') === 0) espace.usages[champ.slice(6)] = cible.checked;
    else espace[champ] = cible.value;
    municipalMarquerSale_(); return;
  }
  var suivi = cible.getAttribute && cible.getAttribute('data-municipal-suivi');
  if (suivi) { municipalEtat.demande.suivi[suivi] = cible.value; municipalMarquerSale_(); return; }
  var dossier = cible.getAttribute && cible.getAttribute('data-municipal-dossier');
  if (dossier) {
    var chemin = dossier.split('.'); municipalEtat.demande[chemin[0]][chemin[1]] = cible.value;
    municipalMarquerSale_(); return;
  }
  var volet = cible.getAttribute && cible.getAttribute('data-municipal-volet');
  if (volet) { municipalEtat.demande.volets[volet] = cible.checked; municipalMarquerSale_(); return; }
  if (cible.matches && cible.matches('[data-municipal-notes]')) { municipalEtat.demande.notes = cible.value; municipalMarquerSale_(); }
}
function municipalSurChange_(evt) {
  var input = evt.target;
  if (input.matches && input.matches('.municipal-depot input[type="file"]')) {
    municipalAjouterFichiers_(input.files, input.closest('[data-municipal-depot]').getAttribute('data-municipal-depot')); return;
  }
  if (input.matches && input.matches('[data-municipal-bibliotheque]')) municipalRemplirDrawerBibliotheque_(input.value);
}
function municipalSurSubmit_(evt) {
  if (evt.target && evt.target.id === 'municipal-form-espace') { evt.preventDefault(); municipalAjouterDepuisDrawer_(evt.target); }
}
function municipalSurClavier_(evt) {
  if (evt.key === 'Escape' && document.getElementById('municipal-drawer')) { evt.preventDefault(); municipalFermerDrawer_(); return; }
  var drawer = document.getElementById('municipal-drawer');
  if (!drawer || evt.key !== 'Tab') return;
  var focusables = Array.prototype.slice.call(drawer.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(function (e) { return !e.disabled; });
  if (!focusables.length) return;
  var premier = focusables[0], dernier = focusables[focusables.length - 1];
  if (evt.shiftKey && document.activeElement === premier) { evt.preventDefault(); dernier.focus(); }
  else if (!evt.shiftKey && document.activeElement === dernier) { evt.preventDefault(); premier.focus(); }
}
function municipalSurDrag_(evt) {
  var zone = evt.target.closest && evt.target.closest('[data-municipal-depot]'); if (!zone) return;
  evt.preventDefault();
  if (evt.type === 'dragover' || evt.type === 'dragenter') zone.classList.add('est-survol');
  else zone.classList.remove('est-survol');
  if (evt.type === 'drop') municipalAjouterFichiers_(evt.dataTransfer.files, zone.getAttribute('data-municipal-depot'));
}

document.addEventListener('click', municipalSurClic_);
document.addEventListener('input', municipalSurInput_);
document.addEventListener('change', municipalSurChange_);
document.addEventListener('submit', municipalSurSubmit_);
document.addEventListener('keydown', municipalSurClavier_);
['dragenter','dragover','dragleave','drop'].forEach(function (nom) { document.addEventListener(nom, municipalSurDrag_); });
window.addEventListener('beforeunload', function (evt) { if (!municipalSale) return; evt.preventDefault(); evt.returnValue = ''; });
