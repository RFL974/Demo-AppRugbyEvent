'use strict';

/**
 * ============================================================================
 *  BANC DE L'ÉCRAN « ÉQUIPES » — vrais modules du frontend contre le vrai Code.gs
 * ============================================================================
 *  Outil partagé (pas une suite : son nom ne finit pas par .test.js) par tests/ecran-equipes-surface.test.js
 *  et tests/ecran-equipes-zero-appel.test.js.
 *  ▶ node tests/banc-ecran-equipes.js --mesurer [--frontend avant|<dossier>] [--backend avant|<Code.gs>]
 *    imprime, geste par geste, les requêtes RÉELLES du vrai frontend (bloquantes, arrière-plan, total, retour,
 *    fin du réseau, appels et durée sous verrou).
 *
 *  ⭐ Références « avant » FIGÉES — celles qui closent « Suivi des clubs », lues dans git, ⛔ jamais `HEAD` :
 *       frontend 8febd6a43a04cd28b9e9be5584c7c864cbba3430 · backend f6bba7f6e7fc39bf62227e5008606bc8d425291d.
 *  ⭐ Serveur : le VRAI Code.gs dans les doublures du banc de coût. Le tournoi part VIDE puis reçoit le JEU DE
 *     DÉMONSTRATION par son unique porte serveur (`creerJeuDemoRacing`) — d'où 21 équipes, 327 joueurs et
 *     34 éducateurs réellement écrits, et non recopiés dans le banc.
 *  ⭐ Navigateur : les VRAIS modules (api.js, admin.js, admin-equipes.js, admin-invitations.js, admin-suivi-clubs.js,
 *     admin-tableau-bord.js, admin-autorisation.js, admin-infos-publication.js, ecrans.js, commun.js) et les VRAIES
 *     cartes de admin.html. L'écran est construit par le VRAI `preparerOutilsCiel()` d'ecrans.js : la barre d'onglets,
 *     le filtre par club, la recherche et le dépliant d'ajout sont ceux de l'application, avec LEURS écouteurs.
 *  ⭐ Les durées rapportées viennent du modèle de coût — ⚠️ ESTIMÉES, jamais mesurées chez Google.
 *  ⛔ Aucun réseau, aucun service Google réel, aucun e-mail.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BI = require('./banc-ecran-invitation');
const BC = require('./banc-ecran-categories');

const RACINE = BI.RACINE;
const BACKEND = BI.BACKEND;
const { fourchette } = require(path.join(BACKEND, 'tests', 'banc-cout', 'modele-cout'));

/* ⛔ Références FIGÉES (hashes complets) du lot précédent — jamais HEAD, jamais un hash abrégé. */
const FRONTEND_AVANT_REV = '8febd6a43a04cd28b9e9be5584c7c864cbba3430';
const BACKEND_AVANT_REV = 'f6bba7f6e7fc39bf62227e5008606bc8d425291d';
const git = BI.git;
const BACKEND_AVANT = () => git(BACKEND, BACKEND_AVANT_REV, 'Code.gs');
const LECTEUR_AVANT = (f) => git(RACINE, FRONTEND_AVANT_REV, f);
const lecteur = (dossier) => (f) => fs.readFileSync(path.join(dossier || RACINE, f), 'utf8');
/** Cache du navigateur mêlant deux versions : `avant` = fichiers servis dans leur version figée d'avant. */
const lecteurMele = (avant, base) => (f) => (avant.indexOf(f) !== -1 ? LECTEUR_AVANT(f) : (base || lecteur())(f));

/**
 * Un banc prêt : le serveur porte le jeu de démonstration, l'écran « Équipes » est construit et peint.
 * @param {object} [options] { backend, lire, panne, avantServir, dialogues, documentReel, sansDemo }
 */
async function banc(options) {
  const o = Object.assign({ documentReel: true }, options || {});
  const b = await BI.banc(o);
  if (!o.sansDemo) {
    // Le jeu passe par sa VRAIE porte serveur, hors mesure : c'est l'état de départ de l'écran.
    const r = b.srv.postMesure({ action: 'creerJeuDemoRacing', cle: BI.MI.CLE_ADMIN }).reponse;
    if (r.error) throw new Error('jeu de démonstration refusé : ' + r.error);
    b.global('equipesCourantes = ' + JSON.stringify(b.srv.equipes()));
    b.global('clubsInvitesCourants = ' + JSON.stringify(b.srv.clubs()));
  }
  completerDom(b.doc);
  // L'écran « Équipes » tel que l'application le construit : barre d'onglets, filtre club, recherche, dépliant d'ajout.
  vm.runInContext((o.lire || lecteur())('js/ecrans.js'), b.ctx, { filename: 'js/ecrans.js' });
  b.global('preparerOutilsCiel()');
  b.global('afficherEquipes(equipesCourantes)');
  b.journal.length = 0; b.dialogues.length = 0;

  /* ---------------------------------------------------------------- lecture de l'écran */
  b.onglets = () => b.doc.querySelectorAll('#cv-equipes-onglets [data-cat-equipes]').map((e) => ({
    cle: e.getAttribute('data-cat-equipes'), actif: e.getAttribute('aria-selected') === 'true',
    tabindex: e.getAttribute('tabindex'), libelle: e.textContent }));
  b.ongletActif = () => (b.onglets().filter((x) => x.actif)[0] || {}).cle || null;
  b.lignes = () => b.doc.querySelectorAll('#liste-equipes .equipe-item');
  b.visibles = () => b.lignes().filter((e) => !e.hidden);
  b.nomsAffiches = () => b.visibles().map((e) => {
    const n = e.querySelector('.nom'); return n ? n.textContent.replace(/déclarés par le club/, '').trim() : '';
  });
  b.clubsProposes = () => b.doc.querySelectorAll('#cv-equipes-club option').map((o) => o.value);
  b.recherche = () => b.id('cv-recherche-liste-equipes');
  b.resultatRecherche = () => { const e = b.doc.querySelector('.cv-recherche [role=status]'); return e ? e.textContent : null; };
  b.messageEquipe = () => b.texte('message-equipe');
  b.boutonAjouter = () => b.id('bouton-ajouter');
  b.repriseVisible = () => { const z = b.id('reprise-equipes'); return !!z && !z.hidden; };
  b.focus = () => { const a = b.doc.activeElement; return a ? (a.id || a.getAttribute('data-cat-equipes') || a.className) : null; };
  /** Ce que le SERVEUR détient réellement (l'oracle des compteurs), catégorie par catégorie. */
  b.totauxServeur = () => {
    const t = { total: { equipes: 0, joueurs: 0, educateurs: 0 } };
    b.srv.equipes().forEach((e) => {
      const c = String(e.categorie || '');
      const l = t[c] || (t[c] = { equipes: 0, joueurs: 0, educateurs: 0 });
      [l, t.total].forEach((x) => { x.equipes++; x.joueurs += Number(e.nb_joueurs || 0); x.educateurs += Number(e.nb_educateurs || 0); });
    });
    return t;
  };

  /* ---------------------------------------------------------------- gestes LOCAUX (aucune requête attendue) */
  b.clicOnglet = (cle) => b.jouer(() => b.cliquer(b.doc.querySelector('#cv-equipes-onglets [data-cat-equipes="' + cle + '"]')));
  b.toucheOnglet = (cle, key) => b.jouer(() => b.declencher(
    b.doc.querySelector('#cv-equipes-onglets [data-cat-equipes="' + cle + '"]'), 'keydown', { key }));
  b.filtrerClub = (nom) => b.jouer(() => { const s = b.id('cv-equipes-club'); s.value = nom; return b.declencher(s, 'change'); });
  b.chercher = (texte) => b.jouer(() => { const c = b.recherche(); c.value = texte; return b.declencher(c, 'input'); });
  b.saisir = (champs) => b.jouer(() => { Object.keys(champs).forEach((id) => { b.id(id).value = champs[id]; }); });
  b.ouvrirEdition = (nom) => b.jouer(() => {
    const bouton = b.doc.querySelectorAll('#liste-equipes .bouton-modif').filter((x) => x.getAttribute('data-nom') === nom)[0];
    return bouton ? b.cliquer(bouton) : null;
  });
  b.annulerEdition = () => b.jouer(() => b.cliquer(b.doc.querySelector('#liste-equipes .bouton-edit-annuler')));
  b.champEdition = (classe) => b.doc.querySelector('#liste-equipes .en-edition .' + classe);

  /* ---------------------------------------------------------------- MUTATIONS */
  b.ajouter = (e, pendant, auRetour) => b.jouer(() => {
    b.id('champ-nom').value = e.nom; b.id('champ-categorie').value = e.categorie;
    b.id('champ-joueurs').value = e.joueurs == null ? '' : String(e.joueurs);
    b.id('champ-educateurs').value = e.educateurs == null ? '' : String(e.educateurs);
    return b.declencher(b.id('form-equipe'), 'submit', { preventDefault() {} });
  }, pendant, auRetour);
  /** Deux soumissions coup sur coup, sans attendre la première — le double clic d'un organisateur pressé. */
  b.ajouterDeuxFois = (e) => b.jouer(() => {
    const poser = () => { b.id('champ-nom').value = e.nom; b.id('champ-categorie').value = e.categorie;
      b.id('champ-joueurs').value = String(e.joueurs); b.id('champ-educateurs').value = String(e.educateurs); };
    poser();
    const p1 = b.declencher(b.id('form-equipe'), 'submit', { preventDefault() {} });
    poser();
    const p2 = b.declencher(b.id('form-equipe'), 'submit', { preventDefault() {} });
    return Promise.all([p1, p2]);
  });
  b.ligneDe = (nom) => b.lignes().filter((e) => { const n = e.querySelector('.nom'); return n && n.textContent.indexOf(nom) === 0; })[0] || null;
  b.supprimer = (nom, pendant, auRetour) => b.jouer(() => {
    const ligne = b.ligneDe(nom);
    const bouton = ligne && ligne.querySelector('.bouton-suppr');
    return bouton ? b.cliquer(bouton) : null;
  }, pendant, auRetour);
  b.supprimerDeuxFois = (nom) => b.jouer(() => {
    const bouton = b.ligneDe(nom).querySelector('.bouton-suppr');
    return Promise.all([b.cliquer(bouton), b.cliquer(bouton)]);
  });
  b.viderCategorie = (pendant, auRetour) => b.jouer(() =>
    b.cliquer(b.doc.querySelector('#liste-equipes .bouton-suppr-tout')), pendant, auRetour);
  b.modifier = (nom, valeurs, pendant, auRetour) => b.jouer(async () => {
    const bouton = b.doc.querySelectorAll('#liste-equipes .bouton-modif').filter((x) => x.getAttribute('data-nom') === nom)[0];
    await b.cliquer(bouton);
    const item = b.doc.querySelector('#liste-equipes .en-edition');
    if (valeurs.nom !== undefined) item.querySelector('.champ-edit-nom').value = valeurs.nom;
    if (valeurs.joueurs !== undefined) item.querySelector('.champ-edit-joueurs').value = String(valeurs.joueurs);
    if (valeurs.educateurs !== undefined) item.querySelector('.champ-edit-educateurs').value = String(valeurs.educateurs);
    return b.cliquer(item.querySelector('.bouton-edit-ok'));
  }, pendant, auRetour);
  b.motCle = (valeur) => b.jouer(() => {
    b.id('form-perfs-club').perfs_mot_cle_club.value = valeur;
    return b.cliquer(b.id('bouton-enregistrer-perfs-club'));
  });
  b.actualiser = (pendant, auRetour) => b.jouer(() => b.cliquer(b.id('bouton-reprise-equipes')), pendant, auRetour);
  return b;
}

/**
 * Complète le mini-DOM des bancs avec les déplacements de nœuds qu'`ecrans.js` utilise pour
 * construire l'écran : `before`, `after`, `remove`, `insertBefore`, `prepend`, `append`, et les
 * parcours de fratrie. ⛔ Rien de spécifique à « Équipes » : ce sont les primitives d'un navigateur,
 * écrites une fois ici parce que le banc partagé ne les avait pas encore.
 */
function completerDom(doc) {
  const P = doc.Element.prototype;
  if (P.__completeEquipes) return;
  P.__completeEquipes = true;
  const detacher = (e) => { if (e.parentNode) { const f = e.parentNode.enfants; const i = f.indexOf(e); if (i !== -1) f.splice(i, 1); e.parentNode = null; } };
  const inserer = (parent, noeud, index) => { detacher(noeud); noeud.parentNode = parent; parent.enfants.splice(index, 0, noeud); return noeud; };
  P.remove = function () { detacher(this); };
  P.before = function (...n) { const p = this.parentNode; n.forEach((x) => inserer(p, x, p.enfants.indexOf(this))); };
  P.after = function (...n) { const p = this.parentNode; n.slice().reverse().forEach((x) => inserer(p, x, p.enfants.indexOf(this) + 1)); };
  P.prepend = function (...n) { n.slice().reverse().forEach((x) => inserer(this, x, 0)); };
  P.append = function (...n) { n.forEach((x) => inserer(this, x, this.enfants.length)); };
  P.insertBefore = function (noeud, repere) {
    const i = repere ? this.enfants.indexOf(repere) : this.enfants.length;
    return inserer(this, noeud, i === -1 ? this.enfants.length : i);
  };
  P.appendChild = function (e) { return inserer(this, e, this.enfants.length); };
  P.removeChild = function (e) { detacher(e); return e; };
  Object.defineProperty(P, 'firstChild', { configurable: true, get() { return this.enfants[0] || null; } });
  Object.defineProperty(P, 'children', { configurable: true, get() { return this.enfants.filter((e) => e.tag); } });
  Object.defineProperty(P, 'nextElementSibling', { configurable: true, get() {
    if (!this.parentNode) return null;
    const f = this.parentNode.children;
    return f[f.indexOf(this) + 1] || null;
  } });
  Object.defineProperty(P, 'previousElementSibling', { configurable: true, get() {
    if (!this.parentNode) return null;
    const f = this.parentNode.children;
    return f[f.indexOf(this) - 1] || null;
  } });
  /** `dataset` reflète les attributs `data-*`, comme dans un navigateur (recherche contextuelle d'ecrans.js). */
  Object.defineProperty(P, 'dataset', { configurable: true, set() { /* le constructeur pose {} : ignoré */ }, get() {
    const e = this;
    return new Proxy({}, { get(_, cle) {
      const attr = 'data-' + String(cle).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
      return e.hasAttribute(attr) ? e.getAttribute(attr) : undefined;
    }, set(_, cle, v) { e.setAttribute('data-' + String(cle).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), v); return true; } });
  } });
  P.insertAdjacentHTML = function (ou, html) {
    const porteur = doc.createElement('span');
    porteur.innerHTML = html;
    const noeuds = porteur.enfants.slice();
    if (ou === 'afterend') this.after(...noeuds);
    else if (ou === 'beforebegin') this.before(...noeuds);
    else if (ou === 'afterbegin') this.prepend(...noeuds);
    else this.append(...noeuds);
  };
}

/* ============================================================== mesure (campagne) */
const s = (ms) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';

/** Les gestes de l'écran, joués dans l'ordre sur un banc neuf. Chaque entrée : [nom, fonction]. */
const GESTES = [
  ['changer d\'onglet (U10)', (b) => b.clicOnglet('U10')],
  ['naviguer aux flèches (→)', (b) => b.toucheOnglet('toutes', 'ArrowRight')],
  ['filtrer par club (CLAMART)', (b) => b.filtrerClub('CLAMART')],
  ['rechercher « meud »', (b) => b.chercher('meud')],
  ['saisir dans le formulaire d\'ajout', (b) => b.saisir({ 'champ-nom': 'ESSAI LOCAL', 'champ-joueurs': '12' })],
  ['ouvrir le crayon d\'une équipe', (b) => b.ouvrirEdition('MEUDON')],
  ['annuler l\'édition', async (b) => { await b.ouvrirEdition('MEUDON'); return b.annulerEdition(); }],
  ['ajouter une équipe', (b) => b.ajouter({ nom: 'BANC-1', categorie: 'U10', joueurs: 12, educateurs: 2 })],
  ['modifier une équipe (nom + effectifs)', (b) => b.modifier('MEUDON', { nom: 'MEUDON-A', joueurs: 11, educateurs: 3 })],
  ['supprimer une équipe', (b) => b.supprimer('ANTONY')],
  // ⚠️ Le jeu de démonstration crée les équipes CLUB PAR CLUB : les U10 y sont donc dispersées parmi les U12.
  //    Ce geste vide 10 équipes réparties en 8 blocs — le cas RÉEL de la démo, et presque le pire agencement.
  //    Les deux agencements purs (1 bloc, 5 blocs) sont mesurés côté serveur : backend/tests/banc-cout/mesurer-equipes.js.
  ['vider une catégorie (U10 : 10 équipes en 8 blocs)', async (b) => { await b.clicOnglet('U10'); return b.viderCategorie(); }],
  ['enregistrer le mot-clé Perfs', (b) => b.motCle('racing')],
  ['« Actualiser la liste »', async (b) => { b.global('afficherRepriseEquipes("")'); return b.actualiser(); }]
];

async function mesurer(options) {
  const o = options || {};
  const lignes = [];
  for (const [nom, geste] of GESTES) {
    const b = await banc({ backend: o.backend, lire: o.lire });
    const r = await geste(b);
    lignes.push([nom, r]);
  }
  return lignes;
}

if (require.main === module && process.argv.indexOf('--mesurer') !== -1) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf('--' + n); return i === -1 ? null : args[i + 1]; };
  const fRef = opt('frontend'), bRef = opt('backend');
  const lire = fRef === 'avant' ? LECTEUR_AVANT : fRef ? lecteur(path.resolve(fRef)) : lecteur();
  const backend = bRef === 'avant' ? BACKEND_AVANT() : bRef ? fs.readFileSync(path.resolve(bRef), 'utf8') : undefined;
  mesurer({ lire, backend }).then((lignes) => {
    console.log('Frontend : ' + (fRef || 'arbre de travail') + ' — Backend : ' + (bRef || 'arbre de travail') + '\n');
    console.log('| Geste | bloquantes | arrière-plan | total | retour | fin du réseau | appels sous verrou | verrou | suite |');
    console.log('|---|---|---|---|---|---|---|---|---|');
    lignes.forEach(([nom, r]) => {
      console.log('| ' + nom + ' | ' + r.attendues.length + ' | ' + r.fond.length + ' | ' + r.requetes.length + ' | ' +
        (r.bloque ? '⛔ jamais' : s(r.retourMs)) + ' | ' + (r.bloque ? '⛔ jamais' : s(r.finReseauMs)) + ' | ' +
        r.appelsVerrou + ' | ' + s(r.verrouMs) + ' | ' + (r.resume || '—') + ' |');
    });
  }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { banc, mesurer, GESTES, lecteur, lecteurMele, LECTEUR_AVANT, BACKEND_AVANT,
  FRONTEND_AVANT_REV, BACKEND_AVANT_REV, RACINE, BACKEND, git, fourchette, MI: BI.MI };
