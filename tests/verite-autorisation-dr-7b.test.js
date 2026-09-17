/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — la demande d'autorisation dit la vérité
 *  Chantier CORR-VERITE-AUTORISATION-DR-7B
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/verite-autorisation-dr-7b.test.js
 *    (Node seul — aucun navigateur, aucun réseau, AUCUN fichier écrit : le PDF est produit
 *     puis relu EN MÉMOIRE)
 *
 *  CE QU'IL PROTÈGE — quatre promesses :
 *
 *   ① le label EDR ne se PRÉSUME jamais : vide ⇒ ni « oui » ni « non » coché dans le PDF,
 *      les deux cases restent des champs éditables ; « oui » / « non » saisis ⇒ inchangés ;
 *   ② aucune note interne (« audit Q2 ») n'est montrée à l'utilisateur ;
 *   ③ la carte ne confond plus les deux sorties : feuille de report = aide interne ; PDF =
 *      formulaire officiel FFR aux valeurs préremplies FIGÉES et aux champs vides MODIFIABLES ;
 *      vérification avant transmission ; autorisation = Comité départemental ou Ligue ;
 *   ④ rien d'autre ne bouge dans le plan de remplissage (non-régression).
 *
 *  ⭐ CODE RÉEL : `js/admin-autorisation.js` est chargé entier dans un contexte Node ;
 *  `js/vendor/pdf-lib.min.js` et `modeles/demande-autorisation-ffr.pdf` sont ceux du dépôt.
 *  ⛔ Rien n'est recopié.
 *
 *  ⭐ AUTO-PREUVE (§ 3) : le code d'AVANT (repli `|| 'oui'`) est reconstruit et rejoué. S'il ne
 *  reproduit PAS le défaut (case « oui » cochée sur label vide), ce fichier ÉCHOUE.
 *
 *  ⚠️ Toutes les données (club, personnes, téléphones) sont FICTIVES.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

const SOURCE = lire('js/admin-autorisation.js');
const HTML = lire('admin.html');
const CASE_OUI = 'Case à cocher62';
const CASE_NON = 'Case à cocher63';
const APPEL_ACTUEL = "ouinon(v('org_label_edr'), 'Case à cocher62', 'Case à cocher63');";
const APPEL_AVANT = "ouinon(v('org_label_edr') || 'oui', 'Case à cocher62', 'Case à cocher63');";

let reussis = 0;
const echecs = [];
function verifier(condition, libelle) {
  if (condition) { reussis++; console.log('  ✓ ' + libelle); }
  else { echecs.push(libelle); console.log('  ✗ ' + libelle); }
}

/** Charge une source d'admin-autorisation.js dans un bac isolé (DOM minimal, jamais utilisé). */
function charger(source) {
  const bac = vm.createContext({
    console,
    window: {},
    document: {
      addEventListener() {}, getElementById() { return null; },
      querySelector() { return null; }, querySelectorAll() { return []; }
    },
    echapper: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    configCourante: { global: {}, categories: [] }
  });
  vm.runInContext(source, bac, { filename: 'admin-autorisation.js' });
  return bac;
}

/* Configuration FICTIVE riche : tous les autres champs du plan sont exercés. */
const G_BASE = {
  org_club_nom: 'AS Fictive', org_code_club: 'C0000', org_representant_nom: 'Personne Fictive',
  org_representant_tel: '0600000000', org_representant_mail: 'fictif@exemple.invalid',
  org_president_nom: 'Président Fictif', org_president_tel: '0600000001', org_president_mail: 'pres@exemple.invalid',
  org_label_date: '01/06/2025', org_niveau_tournoi: 'Départemental', org_equipes_etrangeres: 'non',
  org_type_terrain: 'Gazon', org_nb_vestiaires: '4', org_nb_arbitres: '6', org_nb_doublettes: '2',
  org_medecin_oui: 'oui', org_medecin_nom: 'Médecin Fictif', org_medecin_tel: '0600000002',
  org_secours_nom: 'Secours Fictif', org_secours_tel: '0600000003', org_ambulance: 'non',
  org_droits_oui: 'oui', org_droits_montant: '10', org_hebergement_oui: 'non', org_repas_oui: 'oui',
  org_repas_fournisseur: 'Traiteur Fictif', org_repas_prix: '8', org_gouters_oui: 'non',
  org_recompenses_U10: 'oui', org_recompenses_U12: 'non',
  tournoi_nom: 'Tournoi Fictif', tournoi_adresse: 'Stade Fictif, 00000 Nulle-Part', tournoi_date: '2027-05-15',
  heure_debut: '09:00', heure_fin: '17:00', referent_nom: 'Référent Fictif', referent_tel: '0600000004'
};
const CATS = [
  { categorie: 'U10', presente: 'oui', forme_jeu: 'RE — 7x7', format_mi_temps: '2', duree_mi_temps_min: '10', format_apresmidi: 'CROISE' },
  { categorie: 'U12', presente: 'oui', forme_jeu: 'RE — 10x10', format_mi_temps: '2', duree_mi_temps_min: '15', format_apresmidi: 'LIBRE' }
];
const avecLabel = (label) => {
  const g = Object.assign({}, G_BASE);
  if (label !== undefined) g.org_label_edr = label;
  return g;
};
const plan = (bac, g) => bac.planRemplissageAutorisation(g, 6, 12, CATS, {}, 120, 24);
const normal = (p) => JSON.stringify({ textes: p.textes, cases: p.cases.slice().sort() });

async function controles() {
  /* ======================================================================== */
  console.log('\n§ 1 — Sources : repli supprimé, note interne retirée, carte véridique');
  /* ======================================================================== */
  verifier(SOURCE.indexOf("|| 'oui'") === -1 && !/org_label_edr'\)\s*\|\|/.test(SOURCE),
    "1.1 admin-autorisation.js : aucun repli `|| 'oui'` (en particulier sur org_label_edr)");
  verifier(SOURCE.split(APPEL_ACTUEL).length === 2,
    '1.2 le label EDR est transmis TEL QUEL à ouinon (une seule occurrence)');
  const fichiersVisibles = ['admin.html'].concat(fs.readdirSync(path.join(RACINE, 'js'))
    .filter((f) => f.endsWith('.js')).map((f) => 'js/' + f));
  const avecAudit = fichiersVisibles.filter((f) => /audit Q\d/.test(lire(f)));
  verifier(avecAudit.length === 0, '1.3 aucune mention « audit Q… » dans admin.html ni dans js/*.js (trouvé : ' +
    (avecAudit.join(', ') || 'aucun') + ')');

  const debut = HTML.indexOf('<section class="carte" id="bloc-autorisation">');
  const fin = HTML.indexOf('</section>', debut);
  verifier(debut !== -1 && fin > debut, '1.4 la carte #bloc-autorisation est trouvée dans admin.html');
  const carte = HTML.slice(debut, fin).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  [
    [/aide de préparation interne à Maxilou/, 'la feuille de report est une aide de préparation interne'],
    [/n'est pas un document fédéral/, 'la feuille n\'est pas présentée comme un document fédéral'],
    [/PDF téléchargé utilise le formulaire officiel FFR/, 'le PDF utilise le formulaire officiel FFR'],
    [/préremplies et figées/, 'les informations connues sont préremplies et figées'],
    [/ne sont plus modifiables dans le PDF produit/, 'les valeurs préremplies ne sont plus modifiables dans le PDF'],
    [/vides restent modifiables et doivent être complétés/, 'les champs vides restent modifiables et doivent être complétés'],
    [/Vérifie toutes les informations avant transmission/, 'vérification de toutes les informations avant transmission'],
    [/Comité départemental ou de la Ligue compétente/, 'l\'autorisation relève du Comité départemental ou de la Ligue']
  ].forEach(([motif, libelle], i) => verifier(motif.test(carte), '1.5.' + (i + 1) + ' carte : ' + libelle));
  [
    [/Aucun champ n'est deviné/, '« Aucun champ n\'est deviné » (affirmation absolue non garantie)'],
    [/Il reste modifiable/, '« Il reste modifiable » (faux pour les champs remplis)'],
    [/Ce n'est pas le formulaire officiel/, '« Ce n\'est pas le formulaire officiel » (confusion des deux sorties)'],
    [/complète le format sportif/, '« complète le format sportif » (déjà rempli par l\'app)'],
    [/audit/i, 'toute mention « audit »'],
    [/ne connaît pas reste/, '« ce que l\'app ne connaît pas reste vide » (faux : un défaut documenté subsiste)']
  ].forEach(([motif, libelle], i) => verifier(!motif.test(carte), '1.6.' + (i + 1) + ' carte : absence de ' + libelle));
  verifier(SOURCE.indexOf('complète le format sportif') === -1 && /valeurs préremplies y sont figées/.test(SOURCE),
    '1.7 message après téléchargement : valeurs figées, sans « complète le format sportif »');

  /* ======================================================================== */
  console.log('\n§ 2 — Plan de remplissage (code réel) : vide / oui / non');
  /* ======================================================================== */
  const bac = charger(SOURCE);
  const cas = (label) => plan(bac, avecLabel(label)).cases;
  [[undefined, 'absent'], ['', 'vide'], ['   ', 'espaces'], ['peut-être', 'valeur inconnue']].forEach(([l, nom]) => {
    const c = cas(l);
    verifier(c.indexOf(CASE_OUI) === -1 && c.indexOf(CASE_NON) === -1,
      '2.1 label ' + nom + ' : ni « oui » (' + CASE_OUI + ') ni « non » (' + CASE_NON + ') coché');
  });
  [['oui', 'oui'], ['OUI', 'OUI (casse)']].forEach(([l, nom]) => {
    const c = cas(l);
    verifier(c.indexOf(CASE_OUI) !== -1 && c.indexOf(CASE_NON) === -1, '2.2 label ' + nom + ' : « oui » coché, « non » absent');
  });
  [['non', 'non'], [' Non ', 'Non (casse, espaces)']].forEach(([l, nom]) => {
    const c = cas(l);
    verifier(c.indexOf(CASE_NON) !== -1 && c.indexOf(CASE_OUI) === -1, '2.3 label ' + nom + ' : « non » coché, « oui » absent');
  });
  verifier(plan(bac, avecLabel('')).textes.Texte8 === '01/06/2025',
    '2.4 la date du dernier label reste reportée telle quelle (Texte8)');

  /* ======================================================================== */
  console.log('\n§ 3 — Auto-preuve et non-régression : code d\'AVANT contre code ACTUEL');
  /* ======================================================================== */
  verifier(SOURCE.split(APPEL_ACTUEL).length === 2, '3.1 reconstruction possible du code d\'avant');
  const bacAvant = charger(SOURCE.split(APPEL_ACTUEL).join(APPEL_AVANT));
  const avantVide = plan(bacAvant, avecLabel(''));
  verifier(avantVide.cases.indexOf(CASE_OUI) !== -1,
    '3.2 ⭐ AUTO-PREUVE : le code d\'avant coche bien « oui » sur un label vide (défaut reproduit)');
  const actuelVide = plan(bac, avecLabel(''));
  const avantSansOui = { textes: avantVide.textes, cases: avantVide.cases.filter((n) => n !== CASE_OUI) };
  verifier(normal(avantSansOui) === normal(actuelVide),
    '3.3 label vide : la SEULE différence avec le code d\'avant est la case « oui » non cochée');
  ['oui', 'non'].forEach((l) => {
    verifier(normal(plan(bacAvant, avecLabel(l))) === normal(plan(bac, avecLabel(l))),
      '3.4 label « ' + l + ' » : plan STRICTEMENT identique au code d\'avant (textes et cases)');
  });
  const variantes = [
    Object.assign(avecLabel('oui'), { org_niveau_tournoi: 'National', org_droits_oui: '', tarif_engagement_oui: 'oui', tarif_engagement_montant: '12 €' }),
    Object.assign(avecLabel('non'), { org_medecin_oui: 'non', org_ambulance: 'oui', tournoi_adresse: '', tournoi_lieu: 'Stade Fictif' }),
    {}
  ];
  variantes.forEach((g, i) => {
    const a = plan(bacAvant, g);
    const n = plan(bac, g);
    // Label vide ou absent : on retire la SEULE case que le code d'avant présumait, puis on compare tout.
    const labelVide = String(g.org_label_edr == null ? '' : g.org_label_edr).trim() === '';
    const aComparable = labelVide ? { textes: a.textes, cases: a.cases.filter((x) => x !== CASE_OUI) } : a;
    verifier(normal(aComparable) === normal(n),
      '3.5.' + (i + 1) + ' variante de configuration ' + (i + 1) + ' : aucun autre champ du plan ne change');
  });

  /* ======================================================================== */
  console.log('\n§ 4 — Feuille de report : note neutre à la place de la note interne');
  /* ======================================================================== */
  const feuille = bac.rendreFeuilleAutorisation({ nbManquants: 1, sections: [{ titre: 'A.1 — Organisateur', champs: [
    { libelle: 'École de rugby labellisée', valeur: '', etat: 'manquant', origine: 'Config:org_label_edr' }] }] });
  verifier(feuille.indexOf('à confirmer auprès du Comité départemental ou de la Ligue') !== -1,
    '4.1 pied de feuille : modalités de dépôt « à confirmer auprès du Comité départemental ou de la Ligue »');
  verifier(!/audit/i.test(feuille), '4.2 pied de feuille : aucune mention « audit »');
  verifier(feuille.indexOf('<em>manquant</em>') !== -1, '4.3 label vide affiché « manquant » sur la feuille');

  /* ======================================================================== */
  console.log('\n§ 5 — PDF produit EN MÉMOIRE (pdf-lib du dépôt, gabarit officiel du dépôt)');
  /* ======================================================================== */
  const PDFLib = require(path.join(RACINE, 'js/vendor/pdf-lib.min.js'));
  const gabarit = fs.readFileSync(path.join(RACINE, 'modeles/demande-autorisation-ffr.pdf'));
  const gabDoc = await PDFLib.PDFDocument.load(gabarit);
  const tousChamps = gabDoc.getForm().getFields().map((f) => f.getName());
  verifier(tousChamps.length === 139 && tousChamps.indexOf(CASE_OUI) !== -1 && tousChamps.indexOf(CASE_NON) !== -1,
    '5.0 gabarit : 139 champs, dont les deux cases du label EDR');

  async function produire(g) {
    const p = plan(bac, g);
    const octets = await bac.appliquerPlanPdfAutorisation(PDFLib, gabarit, p);
    const doc = await PDFLib.PDFDocument.load(octets);
    const form = doc.getForm();
    const noms = form.getFields().map((f) => f.getName());
    return { p, form, noms };
  }
  const coche = (form, nom) => { try { return form.getCheckBox(nom).isChecked(); } catch (e) { return null; } };

  const vide = await produire(avecLabel(''));
  verifier(vide.noms.indexOf(CASE_OUI) !== -1 && vide.noms.indexOf(CASE_NON) !== -1,
    '5.1 label vide : les deux cases du label restent des CHAMPS ÉDITABLES du PDF');
  verifier(coche(vide.form, CASE_OUI) === false && coche(vide.form, CASE_NON) === false,
    '5.2 label vide : aucune des deux cases n\'est cochée dans le PDF');
  const oui = await produire(avecLabel('oui'));
  verifier(oui.noms.indexOf(CASE_OUI) === -1 && oui.noms.indexOf(CASE_NON) !== -1 && coche(oui.form, CASE_NON) === false,
    '5.3 label oui : « oui » gravé (retiré du formulaire), « non » reste éditable et non coché');
  const non = await produire(avecLabel('non'));
  verifier(non.noms.indexOf(CASE_NON) === -1 && non.noms.indexOf(CASE_OUI) !== -1 && coche(non.form, CASE_OUI) === false,
    '5.4 label non : « non » gravé (retiré du formulaire), « oui » reste éditable et non coché');

  const remplis = Object.keys(vide.p.textes).concat(vide.p.cases).filter((n) => tousChamps.indexOf(n) !== -1);
  verifier(remplis.length > 20 && remplis.every((n) => vide.noms.indexOf(n) === -1),
    '5.5 ⭐ valeurs préremplies FIGÉES : les ' + remplis.length + ' champs remplis ne sont plus des champs du PDF');
  const restes = tousChamps.filter((n) => remplis.indexOf(n) === -1);
  verifier(restes.length === vide.noms.length && restes.every((n) => vide.noms.indexOf(n) !== -1),
    '5.6 ⭐ champs vides MODIFIABLES : les ' + restes.length + ' champs non remplis restent tous dans le formulaire');
  const sansClub = await produire(Object.assign(avecLabel(''), { org_club_nom: '' }));
  verifier(sansClub.noms.indexOf('Texte1') !== -1 && vide.noms.indexOf('Texte1') === -1,
    '5.7 exemple : nom du club vide ⇒ Texte1 éditable ; nom saisi ⇒ Texte1 figé');
}

/* ========================================================================== */

/* ⛔ GARDE-FOU : on part en ÉCHEC, et on ne repasse au vert qu'à la toute fin du bilan. */
process.exitCode = 1;

controles().then(function () {
  console.log('\n' + '─'.repeat(70));
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + ' contrôle(s) en défaut sur ' +
      (reussis + echecs.length) + ' :');
    echecs.forEach(function (e) { console.log('   · ' + e); });
    process.exit(1);
  }
  console.log('OK — ' + reussis + ' contrôles passés.');
  process.exitCode = 0;                       // ⭐ le seul endroit qui lève le garde-fou
}).catch(function (e) {
  console.error('\nERREUR DU HARNAIS : ' + (e && e.stack || e));
  process.exit(1);
});
