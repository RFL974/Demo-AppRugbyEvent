#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « INVITER UN CLUB » — UNE FRAPPE LOCALE = ZÉRO APPEL (lot « Inviter un club », 4ᵉ passage)
 * ============================================================================
 *  ▶ node tests/ecran-invitation-zero-appel.test.js [--frontend avant|<racine>] [--backend avant|<Code.gs>]
 *
 *  Vrais modules (api.js compris) et vraies cartes d'admin.html, contre le vrai Code.gs (banc-ecran-invitation.js), avec les
 *  écouteurs posés sur `document` (option `documentReel` du banc : admin.js et admin-suivi-clubs.js en posent). Seul le
 *  transport est simulé. Le compte se fait AU PLUS BAS, à l'invocation : fetch, XMLHttpRequest, navigator.sendBeacon,
 *  WebSocket, EventSource, window.open, et toute image créée vers une adresse réseau — un appel indirect ne peut pas
 *  échapper. Chaque geste est aussi joué par le banc, qui sépare requêtes bloquantes et d'arrière-plan, puis les minuteries
 *  sont laissées courir (×1/1000 : plusieurs minutes simulées) pour attraper un appel différé.
 *    Z.0  inventaire : CHAQUE contrôle interactif des treize cartes de l'écran et du Suivi est classé — geste local, ou
 *         action explicite (hors de cette suite : ecran-invitation-surface.test.js, séries G, W, E, J, Q) ; aucun non classé ;
 *    Z.<champ>  chaque champ texte : clic, chaque frappe, collage, suppressions, curseur et sélection, Entrée quand elle ne
 *         valide rien, Tabulation ; cases, boutons radio, menus locaux, fichiers choisis, glisser-déposer, zones de dépôt au
 *         clavier, boutons locaux, badge « Écart », filtres et fiches du Suivi : 0 bloquante, 0 d'arrière-plan, 0 appel ;
 *    Z.E  édition des coordonnées d'un club (crayon, saisie, Échap, Annuler) ; Z.K panneau d'un club accepté ;
 *    Z.P  aperçus de l'e-mail : une frappe repeint le MÊME document, garde ses images (rien n'est rechargé) ;
 *    Z.W  frappe pendant une écriture en cours : une seule requête, l'écriture ;
 *    Z.N  navigation entre écrans déjà chargés ; Z.A confirmations annulées : 0 ;
 *    Z.T  témoin : le compteur voit bien l'appel d'une action explicite (la suite n'est pas aveugle).
 *  Complément navigateur (hors dépôt, rapport du lot) : la même campagne dans Chromium, page entière, requêtes relevées
 *  par la page ET par le serveur — onglets internes, fiche latérale, recherche du Suivi compris.
 *  ⛔ Aucun réseau, aucun service Google réel ; tournoi fictif.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const B = require('./banc-ecran-invitation');
const BC = require('./banc-ecran-categories');

const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
const LIRE = arg('frontend') === 'avant' ? B.LECTEUR_AVANT : arg('frontend') ? B.lecteur(path.resolve(arg('frontend'))) : B.lecteur();
const CODE = arg('backend') === 'avant' ? B.BACKEND_AVANT() : arg('backend') ? fs.readFileSync(path.resolve(arg('backend')), 'utf8')
  : fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');
const t = BC.compteur();
const json = JSON.stringify;
const essai = async (code, fn) => { try { await fn(); } catch (e) { t.vrai(false, code + ' (exception) ' + String(e && e.message || e).slice(0, 240)); } };
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* Les cartes de l'écran (trois onglets) et le Suivi des clubs. */
const BLOCS = ['bloc-clubs-invites', 'bloc-modalites', 'bloc-reponse', 'bloc-contacts-securite', 'bloc-surplace', 'bloc-apercu-invitation',
  'bloc-pieces-jointes-invitation', 'bloc-parking', 'bloc-encadrement', 'bloc-pieces-jointes-dossier', 'bloc-dossier',
  'bloc-apercu-dossier-email', 'bloc-suivi-clubs'];
const SELECTEUR = 'input, textarea, select, button, summary, details, [tabindex], [role="button"], a, iframe';

/** La nature d'un contrôle : son identifiant, son nom de champ, son action, ou la classe qui le désigne. */
function nature(e) {
  if (e.id) return '#' + e.id;
  if (e.getAttribute('name')) return e.tag + '[name=' + e.getAttribute('name') + ']';
  if (e.getAttribute('data-action')) return 'suivi:' + e.getAttribute('data-action');
  if (e.getAttribute('data-filtre') !== null) return 'filtre:' + ((e.getAttribute('class') || '').match(/suivi-(filtre|indicateur)/) || [''])[0];
  const c = ((e.getAttribute('class') || '').match(/\b(bouton-(?:cats|editer|inviter|suppr)-club|statut-club|club-cat-case|club-prenom-input|club-alerte-ecart|club-edit-\w+|btn-(?:enregistrer|annuler)-edition|piece-jointe-retirer)\b/) || [])[1];
  if (c) return '.' + c;
  if (e.tag === 'summary') return 'summary';
  return e.tag + '?';
}

/* ⭐ LE CLASSEMENT — tout contrôle de l'écran y figure. `local` : aucun appel attendu, joué ici. `action` : un geste explicite
   (enregistrer, envoyer, créer, retirer…), ses appels sont comptés et justifiés ailleurs. ⛔ Un contrôle nouveau ou disparu
   fait tomber Z.0 : il doit être classé, et s'il est local, joué ici. */
const TEXTE = 'texte', COCHE = 'coche', RADIO = 'radio', MENU = 'menu', FICHIER = 'fichier', ZONE = 'zone', BOUTON = 'bouton', AFFICHAGE = 'affichage';
const CLASSEMENT = {
  // Modalités, réponse, contacts & sécurité, sur place
  'input[name=tarif_engagement_oui]': [COCHE], 'input[name=tarif_engagement_montant]': [TEXTE], 'select[name=tarif_engagement_mode]': [MENU],
  'textarea[name=tarif_engagement_modalites]': [TEXTE, 'ligne'], 'input[name=date_limite_confirmation]': [TEXTE],
  'input[name=date_limite_reponse]': [TEXTE], 'input[name=contact_reponse_nom]': [TEXTE], 'input[name=contact_reponse_tel]': [TEXTE],
  'input[name=contact_reponse_email]': [TEXTE], 'input[name=email_expediteur]': [TEXTE],
  'input[name=referent_nom]': [TEXTE], 'input[name=referent_tel]': [TEXTE], 'input[name=securite_secours_oui]': [COCHE],
  'input[name=securite_secours_precisions]': [TEXTE], 'input[name=securite_referent_identique]': [COCHE],
  'input[name=securite_referent_nom]': [TEXTE], 'input[name=securite_referent_tel]': [TEXTE],
  'input[name=buvette_disponible]': [COCHE], 'input[name=espace_sandwich_disponible]': [COCHE], 'input[name=boutique_disponible]': [COCHE],
  'input[name=repas_sur_place_oui]': [COCHE], 'input[name=repas_sur_place_mode]': [RADIO], 'input[name=repas_sur_place_montant]': [TEXTE],
  'input[name=gouter_fin_tournoi_oui]': [COCHE], 'input[name=gouter_fin_tournoi_mode]': [RADIO], 'input[name=gouter_fin_tournoi_montant]': [TEXTE],
  // Aperçu de l'invitation, pièces jointes
  '#apercu-invitation-objet': [TEXTE], '#apercu-invitation-intro': [TEXTE, 'ligne'], '#apercu-invitation-rendu': [AFFICHAGE],
  '#bouton-regenerer-invitation': [BOUTON], '#pieces-jointes-invitation': [FICHIER], '#zone-depot-pieces-invitation': [ZONE],
  '#bouton-vider-pieces-invitation': [BOUTON], '#pieces-jointes-dossier': [FICHIER], '#zone-depot-pieces-dossier': [ZONE],
  '#bouton-vider-pieces-dossier': [BOUTON], '.piece-jointe-retirer': [BOUTON],
  // Dossier final : parking, encadrement, aperçus
  'input[name=parking_texte]': [TEXTE], 'input[name=parking_photo]': [FICHIER, 'image'], '#zone-depot-parking': [ZONE, 'image'],
  'input[name=encadrement_ratio]': [TEXTE], 'input[name=encadrement_diplomes]': [TEXTE], 'input[name=assurance_attestation_requise]': [COCHE],
  '#dossier-apercu-club': [MENU], '#apercu-dossier-email-club': [MENU], '#apercu-dossier-email-objet': [TEXTE],
  '#apercu-dossier-email-intro': [TEXTE, 'ligne'], '#apercu-dossier-email-rendu': [AFFICHAGE],
  // Clubs invités : saisie d'un club (Entrée = « Ajouter » : action), dépliant, lignes
  '#champ-club-nom': [TEXTE, 'valide'], '#champ-club-contact': [TEXTE, 'valide'], '#champ-club-prenom': [TEXTE, 'valide'],
  '#champ-club-email': [TEXTE, 'valide'], '#chargement-equipes-demo': [AFFICHAGE], summary: [BOUTON],
  '.club-cat-case': [COCHE], '.club-prenom-input': [TEXTE], '.club-alerte-ecart': [BOUTON, 'dialogue'], '.bouton-editer-club': [BOUTON],
  // Suivi des clubs
  'suivi:ouvrir-fiche': [BOUTON], 'filtre:suivi-filtre': [BOUTON], 'filtre:suivi-indicateur': [BOUTON], '#bouton-pdf-suivi-restauration': [BOUTON, 'pdf'],
  // ⭐ Actions explicites (hors de cette suite ; leurs appels : ecran-invitation-surface.test.js)
  '#bouton-enregistrer-modalites': ['action', 'enregistrer la carte'], '#bouton-enregistrer-reponse': ['action', 'enregistrer la carte'],
  '#bouton-enregistrer-contacts': ['action', 'enregistrer la carte'], '#bouton-enregistrer-surplace': ['action', 'enregistrer la carte'],
  '#bouton-enregistrer-parking': ['action', 'enregistrer la carte (+ la photo choisie)'], '#bouton-retirer-parking': ['action', 'retirer la photo enregistrée (local : annuler un choix)'],
  '#bouton-enregistrer-encadrement': ['action', 'enregistrer la carte'], '#bouton-envoyer-invitations': ['action', 'envoi groupé'],
  '#bouton-ajouter-club': ['action', 'ajouter un club'], '#bouton-charger-equipes-demo': ['action', 'créer le jeu de démonstration'],
  '#bouton-ouvrir-dossier': ['action', 'ouvrir le dossier du club (nouvelle page)'],
  '.bouton-inviter-club': ['action', 'invitation individuelle'], '.bouton-cats-club': ['action', 'ajouter les équipes au tournoi'],
  '.bouton-suppr-club': ['action', 'retirer un club'], '.statut-club': ['action', 'changer le statut (enregistrement immédiat) — focus et Tab : Z.S']
};

/** Un banc prêt : jeu de démonstration, photo du parking enregistrée, écart sur CLAMART, écran et Suivi rendus. */
async function preparer(o) {
  const b = await B.banc(Object.assign({ lire: LIRE, backend: CODE, documentReel: true, monde: (m) => {
    m.postMesure({ action: 'creerJeuDemoRacing', cle: B.MI.CLE_ADMIN });
    // Fixtures propres à ce banc d'interactions : ces clubs sans équipe ne font plus partie du jeu produit.
    const ajouterScenario = (club, reponse) => {
      m.appeler('ajouterClubInvite', m.classeur, { club_nom: club, club_contact_prenom: 'Contact', club_contact_nom: 'Démo – ' + club,
        club_contact_email: 'demo-' + club.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '@example.invalid' });
      m.appeler('ecrireEngagementClub', m.classeur, club, reponse, true);
    };
    ajouterScenario('RC PUTEAUX', { statut: 'Décliné', invitation_envoyee: '2026-09-03', date_reponse: '2026-09-07', confirmation_reponse_envoyee: '2026-09-07 18:40:00' });
    ajouterScenario('RC BOULOGNE', { statut: 'Invité', invitation_envoyee: '2026-09-03', derniere_relance_reponse: '2026-09-15' });
    ajouterScenario('RC SAINT-CLOUD', { statut: 'Invité' });
    m.appeler('ecrireParamGlobal', m.feuilles.get('Config'), 'parking_photo_id', 'fichier-fictif-parking');
    m.appeler('ecrireEngagementClub', m.classeur, 'CLAMART', { alerte_ecart: 'Écart fictif : une équipe de plus' }, false);
  } }, o || {}));
  b.global('configCourante = ' + json(b.srv.config()));
  await b.jouer(() => b.global('chargerClubsInvites')());
  b.global('majInvitation(); majApercuDossierEmail(); afficherSuiviClubs();');
  // ⭐ Le compte au plus bas : chaque primitive réseau du navigateur est comptée à l'INVOCATION.
  const n = { fetch: 0, xhr: 0, beacon: 0, websocket: 0, eventsource: 0, fenetre: 0, image: 0 };
  const fetchBanc = b.ctx.fetch;
  b.ctx.fetch = function () { n.fetch++; return fetchBanc.apply(this, arguments); };
  b.ctx.XMLHttpRequest = function () { n.xhr++; this.open = () => {}; this.send = () => {}; this.setRequestHeader = () => {}; };
  b.ctx.navigator.sendBeacon = () => { n.beacon++; return true; };
  b.ctx.WebSocket = function () { n.websocket++; };
  b.ctx.EventSource = function () { n.eventsource++; };
  b.ctx.window.open = () => { n.fenetre++; return null; };
  // Fichiers et images : doublures LOCALES (lecture en data:, redimensionnement), une image vers le réseau serait comptée.
  b.ctx.FileReader = function () { const l = this; l.readAsDataURL = (f) => setTimeout(() => l.onload && l.onload({ target: { result: 'data:' + (f.type || 'application/octet-stream') + ';base64,QUJD' } }), 0); };
  b.ctx.Image = function () { const img = this; let s = ''; img.width = 30; img.height = 20;
    Object.defineProperty(img, 'src', { get: () => s, set: (v) => { s = String(v); if (!/^(data|blob):/.test(s)) n.image++; setTimeout(() => img.onload && img.onload(), 0); } }); };
  const creer = b.doc.createElement;
  b.doc.createElement = (tag) => { const e = creer(tag); if (tag === 'canvas') { e.getContext = () => ({ fillRect() {}, drawImage() {} }); e.toDataURL = () => 'data:image/jpeg;base64,QUJD'; } return e; };
  if (!b.doc.Element.prototype.remove) {                       // fenêtre du dossier final : fermée par remove(), comme un navigateur
    b.doc.Element.prototype.remove = function () { if (this.parentNode) { const e = this.parentNode.enfants; e.splice(e.indexOf(this), 1); this.parentNode = null; } };
  }
  b.reseau = n;
  b.totalReseau = () => Object.values(n).reduce((x, y) => x + y, 0);
  b.journal.length = 0;
  return b;
}

/** Joue un geste et exige ZÉRO : bloquantes, arrière-plan (minuteries laissées courir), invocations réseau. */
async function zero(b, code, libelle, geste) {
  const avant = json(b.reseau);
  const r = await b.jouer(geste);
  await attendre(120);                                    // ×1/1000 : deux minutes simulées pour un appel différé
  const differes = b.journal.length;
  const apres = json(b.reseau);
  t.vrai(r.requetes.length === 0 && differes === 0 && apres === avant && !r.bloque,
    code + ' ' + libelle + ' : 0 bloquante, 0 d\'arrière-plan, 0 appel réseau', [r.resume, b.journal.map((q) => q.action), avant, apres]);
  b.journal.length = 0;
}

/* Les événements d'une vraie saisie, dans l'ordre d'un navigateur. */
const clavier = (b, el, key, extra) => Promise.all([b.declencher(el, 'keydown', Object.assign({ key }, extra)), b.declencher(el, 'keyup', Object.assign({ key }, extra))]);
async function frappe(b, el, c) {
  await b.declencher(el, 'keydown', { key: c }); await b.declencher(el, 'keypress', { key: c });
  await b.declencher(el, 'beforeinput', { data: c, inputType: 'insertText' });
  el.value = String(el.value || '') + c;
  await b.declencher(el, 'input', { data: c, inputType: 'insertText' }); await b.declencher(el, 'keyup', { key: c });
}
async function champ(b, code, el, options) {
  const o = options || [];
  const nom = nature(el);
  const texte = el.type === 'number' ? '12' : el.type === 'date' ? '2027' : el.type === 'email' ? 'a@b.fr' : 'Ab é1';
  await zero(b, code + '.a', nom + ' — clic, focus', async () => { b.doc.activeElement = el; await b.declencher(el, 'focus'); await b.declencher(el, 'focusin'); await b.cliquer(el); });
  await zero(b, code + '.f', nom + ' — ' + texte.length + ' frappes, une par une', async () => { for (const c of texte) await frappe(b, el, c); });
  await zero(b, code + '.c', nom + ' — collage', async () => {
    await b.declencher(el, 'paste', { clipboardData: { getData: () => 'Collé' } }); el.value = String(el.value) + 'Collé';
    await b.declencher(el, 'input', { inputType: 'insertFromPaste', data: 'Collé' }); });
  await zero(b, code + '.s', nom + ' — suppression d\'un caractère (Retour arrière, Suppr)', async () => {
    for (const k of ['Backspace', 'Delete']) {
      await b.declencher(el, 'keydown', { key: k }); await b.declencher(el, 'beforeinput', { inputType: k === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward' });
      el.value = String(el.value).slice(0, -1); await b.declencher(el, 'input', { inputType: 'deleteContentBackward' }); await b.declencher(el, 'keyup', { key: k });
    } });
  await zero(b, code + '.d', nom + ' — curseur et sélection (flèches, Début, Fin, Maj+flèche)', async () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowUp', 'ArrowDown']) await clavier(b, el, k);
    await clavier(b, el, 'ArrowLeft', { shiftKey: true }); await b.declencher(el, 'select'); await b.declencher(b.doc.body, 'selectionchange'); });
  if (o[0] !== 'valide') {
    await zero(b, code + '.e', nom + ' — Entrée (' + (o[0] === 'ligne' ? 'nouvelle ligne' : 'ne valide rien : soumission de la carte bloquée') + ')', async () => {
      await b.declencher(el, 'keydown', { key: 'Enter' });
      if (o[0] === 'ligne') { el.value = String(el.value) + '\n'; await b.declencher(el, 'input', { inputType: 'insertLineBreak' }); }
      else { const f = el.closest('form'); if (f) await b.declencher(f, 'submit'); }
      await b.declencher(el, 'keyup', { key: 'Enter' }); });
  }
  await zero(b, code + '.t', nom + ' — Tabulation (sortie du champ : change, blur)', async () => {
    await b.declencher(el, 'keydown', { key: 'Tab' }); await b.declencher(el, 'change'); await b.declencher(el, 'blur'); await b.declencher(el, 'focusout');
    b.doc.activeElement = null; });
}
async function coche(b, code, el) {
  await zero(b, code + '.c', nature(el) + ' — clic (cocher / décocher)', async () => { el.checked = !el.checked; await b.cliquer(el); await b.declencher(el, 'input'); await b.declencher(el, 'change'); });
  await zero(b, code + '.e', nature(el) + ' — Espace au clavier', async () => {
    await b.declencher(el, 'keydown', { key: ' ' }); el.checked = !el.checked; await b.cliquer(el); await b.declencher(el, 'input'); await b.declencher(el, 'change'); await b.declencher(el, 'keyup', { key: ' ' }); });
}
async function radio(b, code, els) {
  for (let i = 0; i < els.length; i++) {
    await zero(b, code + '.' + (i + 1), nature(els[i]) + ' — bouton n° ' + (i + 1) + ' (clic, flèche)', async () => {
      await b.declencher(els[i], 'keydown', { key: 'ArrowDown' }); els[i].checked = true; await b.cliquer(els[i]); await b.declencher(els[i], 'input'); await b.declencher(els[i], 'change'); });
  }
}
async function menu(b, code, el) {
  const valeurs = el.options.map((x) => x.value).filter((v) => v !== el.value);
  await zero(b, code, nature(el) + ' — focus, flèche, choix d\'une autre valeur, sortie', async () => {
    await b.declencher(el, 'focus'); await clavier(b, el, 'ArrowDown');
    if (valeurs.length) { el.value = valeurs[0]; await b.declencher(el, 'input'); await b.declencher(el, 'change'); }
    await b.declencher(el, 'blur'); });
}
const fichierFictif = (image) => ({ name: image ? 'plan-fictif.png' : 'reglement-fictif.pdf', type: image ? 'image/png' : 'application/pdf', size: 2048 });

(async () => {
  const b = await preparer();

  /* ============================== Z.0 — inventaire exhaustif ============================== */
  console.log('\nZ.0 — inventaire : chaque contrôle de l\'écran est classé');
  const controles = [];
  BLOCS.forEach((bl) => b.id(bl).querySelectorAll(SELECTEUR).forEach((e) => controles.push({ bl, e, n: nature(e) })));
  const nonClasses = [...new Set(controles.filter((c) => !CLASSEMENT[c.n]).map((c) => c.bl + ' ' + c.n))];
  const locaux = controles.filter((c) => CLASSEMENT[c.n] && CLASSEMENT[c.n][0] !== 'action');
  const actions = controles.filter((c) => CLASSEMENT[c.n] && CLASSEMENT[c.n][0] === 'action');
  t.vrai(nonClasses.length === 0 && controles.length >= 150,
    'Z.0 inventaire : ' + controles.length + ' contrôles (' + new Set(controles.map((c) => c.n)).size + ' sortes) dans les treize cartes et le Suivi — tous classés : ' +
    locaux.length + ' locaux, ' + actions.length + ' actions explicites', nonClasses);

  /* ============================== Z.<champ> — chaque contrôle local ============================== */
  console.log('\nZ — chaque contrôle local : zéro appel');
  await essai('Z', async () => {
    const faits = new Set();
    let i = 0;
    for (const c of locaux) {
      const [genre, option] = CLASSEMENT[c.n];
      const cle = c.n + (genre === RADIO ? '' : '#' + (c.e.getAttribute('data-club') || c.e.closest('[data-club]') && c.e.closest('[data-club]').getAttribute('data-club') || ''));
      // Contrôles répétés par club : trois lignes suffisent (acceptée avec panneau, en attente, déclinée) — même code, même rendu.
      if (faits.has(cle) || (c.e.closest('[data-club]') && [...faits].filter((f) => f.indexOf(c.n + '#') === 0).length >= 3)) continue;
      faits.add(cle);
      const code = 'Z.' + (++i);
      if (genre === TEXTE) await champ(b, code, c.e, [option]);
      else if (genre === COCHE) await coche(b, code, c.e);
      else if (genre === RADIO) { if (!faits.has('radio:' + c.n)) { faits.add('radio:' + c.n); await radio(b, code, b.doc.querySelectorAll('[name="' + c.e.getAttribute('name') + '"]')); } }
      else if (genre === MENU) await menu(b, code, c.e);
      else if (genre === FICHIER) {
        await zero(b, code, c.n + ' — choix local d\'un fichier (' + (option === 'image' ? 'photo : aperçu' : 'pièce jointe : liste') + '), rien envoyé', async () => {
          c.e.files = [fichierFictif(option === 'image')]; await b.declencher(c.e, 'change'); });
      } else if (genre === ZONE) {
        await zero(b, code + '.d', c.n + ' — glisser-déposer (entrée, survol, sortie, dépôt)', async () => {
          const dt = { files: [fichierFictif(option === 'image')], types: ['Files'] };
          for (const ty of ['dragenter', 'dragover', 'dragleave', 'dragover', 'drop']) await b.declencher(c.e, ty, { dataTransfer: dt });
          await attendre(5); });
        await zero(b, code + '.k', c.n + ' — Entrée puis Espace au clavier (ouvre le sélecteur de fichiers)', async () => {
          await b.declencher(c.e, 'keydown', { key: 'Enter' }); await b.declencher(c.e, 'keydown', { key: ' ' }); });
      } else if (genre === BOUTON) {
        await zero(b, code, c.n + ' — clic' + (option === 'dialogue' ? ', puis fermeture du détail' : '') + ', puis Entrée et Espace au clavier', async () => {
          await b.cliquer(c.e);
          if (option !== 'pdf') { await b.declencher(c.e, 'keydown', { key: 'Enter' }); await b.declencher(c.e, 'keydown', { key: ' ' }); }
          if (c.n === '.bouton-editer-club') { b.global('clubEnEdition = null; afficherClubsInvites();'); }
          if (c.n === 'suivi:ouvrir-fiche') b.global('suiviSelectionnerClub("")');
        });
      }
    }
    t.vrai(i >= 60, 'Z.# ' + i + ' contrôles locaux joués (chaque sorte, trois lignes de club pour les contrôles répétés)', i);
  });

  /* ============================== Z.E / Z.K / Z.S — lignes de club ============================== */
  console.log('\nZ.E — édition des coordonnées, panneau, statut');
  await essai('Z.E', async () => {
    const ligne = (club) => B.clubLigne(b, club);
    for (const club of ['CLAMART', 'RC BOULOGNE']) {
      await zero(b, 'Z.E.' + club + '.1', club + ' — crayon : édition ouverte', () => B.clic(b, ligne(club).querySelector('.bouton-editer-club')));
      for (const cl of ['club-edit-nom', 'club-edit-prenom', 'club-edit-contact', 'club-edit-email']) {
        await champ(b, 'Z.E.' + club + '.' + cl, b.doc.querySelector('#liste-clubs-invites .club-en-edition .' + cl), ['valide']);   // Entrée = Enregistrer : action
      }
      await zero(b, 'Z.E.' + club + '.echap', club + ' — Échap dans la ligne : édition annulée', () => b.declencher(b.doc.querySelector('#liste-clubs-invites .club-en-edition .club-edit-prenom'), 'keydown', { key: 'Escape' }));
      await zero(b, 'Z.E.' + club + '.annuler', club + ' — crayon puis « Annuler »', async () => {
        await B.clic(b, ligne(club).querySelector('.bouton-editer-club')); await B.clic(b, b.doc.querySelector('#liste-clubs-invites .club-en-edition .btn-annuler-edition')); });
    }
    await zero(b, 'Z.S', 'menu « Statut » — focus, Tab, blur (aucun changement)', async () => {
      const s = ligne('CLAMART').querySelector('.statut-club'); await b.declencher(s, 'focus'); await clavier(b, s, 'Tab'); await b.declencher(s, 'blur'); });
    await zero(b, 'Z.K', 'badge « Écart » : Entrée puis Espace (détail ouvert au clavier)', async () => {
      const x = ligne('CLAMART').querySelector('.club-alerte-ecart'); await b.declencher(x, 'keydown', { key: 'Enter' }); await b.declencher(x, 'keydown', { key: ' ' }); });
  });

  /* ============================== Z.P — aperçus de l'e-mail : même document, mêmes images ============================== */
  console.log('\nZ.P — aperçus de l\'e-mail : une frappe ne recharge rien');
  await essai('Z.P', async () => {
    // Document de l'iframe (doublure du navigateur) et analyseur HTML inerte, sur le petit DOM du banc.
    const mini = () => {
      const d = BC.creerDocument();
      d.Element.prototype.replaceChild = function (n, o) { const k = this.enfants.indexOf(o); this.enfants[k] = n; n.parentNode = this; o.parentNode = null; return o; };
      Object.defineProperty(d.Element.prototype, 'attributes', { get() { return Object.keys(this.attrs).map((k) => ({ name: k, value: this.getAttribute(k) })); } });
      return d;
    };
    b.ctx.DOMParser = function () {};
    b.ctx.DOMParser.prototype.parseFromString = function (html) {
      // Comme le vrai DOMParser : un fragment est enveloppé dans <head></head><body>…</body>.
      const d = mini(); const head = d.createElement('head'); const body = d.createElement('body'); body.innerHTML = html;
      return { head, body, get images() { return this.body.querySelectorAll('img'); }, createElement: d.createElement };
    };
    const verifier = async (code, idIframe, declencher) => {
      const iframe = b.id(idIframe);
      const d = mini();
      let pret = false;
      const F = { get readyState() { return pret ? 'complete' : 'loading'; }, documentElement: null,
        get head() { return pret ? d.racine.enfants.find((x) => x.tag === 'head') : null; },
        get body() { return pret ? d.racine.enfants.find((x) => x.tag === 'body') : null; },
        get images() { return F.body ? F.body.querySelectorAll('img') : []; }, importNode: (n) => n };
      Object.defineProperty(iframe, 'contentDocument', { configurable: true, get: () => F });
      const charger = () => {                                     // le navigateur charge `srcdoc` dans l'iframe
        const p = new b.ctx.DOMParser().parseFromString(iframe.srcdoc);
        d.racine.enfants = []; d.racine.appendChild(p.head); d.racine.appendChild(p.body);
        F.documentElement = d.racine; pret = true;
        return b.declencher(iframe, 'load');
      };
      iframe.__apercuPose = false;
      await declencher('X'); await charger();                     // première pose : srcdoc, puis chargement
      const srcdoc = iframe.srcdoc;
      const images = F.images.slice();
      const avant = json(b.reseau);
      await declencher('Frappe');
      t.vrai(images.length >= 1 && iframe.srcdoc === srcdoc && F.images.length === images.length && F.images.every((img, k) => img === images[k]) &&
        /Frappe/.test(F.body.textContent) && json(b.reseau) === avant,
      code + ' ' + idIframe + ' : la frappe repeint le MÊME document (srcdoc inchangé, rien rechargé), ses ' + images.length + ' image(s) sont les mêmes nœuds, le texte suit',
      [iframe.srcdoc === srcdoc, images.length, F.images.length, /Frappe/.test(F.body ? F.body.textContent : '')]);
      delete iframe.contentDocument;
    };
    await verifier('Z.P.1', 'apercu-invitation-rendu', async (texte) => {
      const el = b.doc.querySelector('#form-modalites [name="tarif_engagement_modalites"]'); el.value = 'Modalités ' + texte; await b.declencher(el, 'input'); });
    await verifier('Z.P.2', 'apercu-dossier-email-rendu', async (texte) => {
      b.global('configCourante.global.parking_texte = ' + json('Parking ' + texte)); b.global('majApercuDossierEmail()'); });
    // Fenêtre du dossier final : ouverte (sans nouveau lien), saisie dans son intro, fermée — rien n'est appelé. Banc neuf :
    // les frappes ci-dessus ont laissé des cartes non enregistrées, et la fenêtre refuse alors de s'ouvrir (voulu, série E).
    const f = await preparer();
    f.ctx.dialogConfirmer = async () => false;
    await zero(f, 'Z.P.3', 'fenêtre du dossier final : ouverture (« Nouveau lien ? » → non), saisie de l\'objet et de l\'intro, « Annuler »', async () => {
      await f.global('genererDossierFinal')('CLAMART');
      const o = f.doc.querySelector('.eml-overlay');
      if (!o) throw new Error('fenêtre du dossier final non ouverte : ' + f.texte('message-suivi-clubs'));
      for (const id of ['eml-sujet', 'eml-intro']) { const el = o.querySelector('#' + id); for (const c of 'Bon') await frappe(f, el, c); }
      await f.cliquer(o.querySelector('#eml-annuler'));
    });
  });

  /* ============================== Z.W — frappe pendant une écriture ============================== */
  console.log('\nZ.W — frappe pendant une écriture en cours');
  await essai('Z.W', async () => {
    const w = await preparer();
    const zone = w.doc.querySelector('#form-modalites [name="tarif_engagement_modalites"]');
    zone.value = 'Virement fictif'; await w.declencher(zone, 'input');
    const avant = w.reseau.fetch;
    const r = await w.jouer(() => w.global('onEnregistrerModalites')(), async (n) => {
      if (n !== 0) return;                                        // la requête d'écriture est partie, sa réponse n'est pas servie
      for (const [sel, txt] of [['#form-modalites [name="tarif_engagement_modalites"]', ' puis'], ['#form-reponse [name="contact_reponse_nom"]', 'Pendant'],
        ['#form-parking [name="parking_texte"]', ' en cours'], ['#apercu-invitation-intro', ' !']]) {
        const el = w.doc.querySelector(sel); for (const c of txt) await frappe(w, el, c); await w.declencher(el, 'change');
      }
    });
    await attendre(120);
    t.vrai(r.requetes.map((q) => q.action).join() === 'enregistrerInvitation' && w.reseau.fetch - avant === 1 && w.totalReseau() === 1 && w.journal.length === 1,
      'Z.W frappes dans quatre champs PENDANT l\'enregistrement des modalités : une seule requête, l\'écriture', [r.resume, w.reseau]);
  });

  /* ============================== Z.N / Z.A — navigation et confirmations annulées ============================== */
  console.log('\nZ.N — navigation entre écrans déjà chargés ; Z.A — confirmations annulées');
  await essai('Z.N', async () => {
    for (const e of ['suivi-clubs', 'equipes', 'invitation', 'suivi-clubs', 'invitation']) {
      await zero(b, 'Z.N.' + e, 'navigation vers « ' + e + ' » (données déjà chargées)', () => b.global('ouvrirEtapeAdmin')(e));
    }
    b.ctx.dialogConfirmer = async () => false;
    const annuler = [
      ['Z.A.1', 'jeu de démonstration', () => b.cliquerDemo()],
      ['Z.A.2', 'envoi groupé', () => b.global('onEnvoyerInvitationsGroupe')()],
      ['Z.A.3', 'invitation individuelle (RC SAINT-CLOUD)', () => B.clic(b, B.clubLigne(b, 'RC SAINT-CLOUD').querySelector('.bouton-inviter-club'))],
      ['Z.A.4', 'retirer la photo ENREGISTRÉE du parking', () => b.global('onRetirerPhotoParking')()],
      ['Z.A.5', 'relance de la réponse (Suivi)', () => b.global('envoyerInvitationClubUI')('RC BOULOGNE', { relance: true })],
      ['Z.A.6', 'marquer payé (Suivi)', () => b.global('suiviMarquerPaiement')('ISSY-LES-MOULINEAUX', true)],
      ['Z.A.7', 'corriger le paiement (Suivi)', () => b.global('suiviMarquerPaiement')('CLAMART', false)],
      ['Z.A.8', 'relancer le paiement (Suivi)', () => b.global('suiviRelancerPaiement')('ISSY-LES-MOULINEAUX')],
      ['Z.A.9', 'renvoyer la confirmation (Suivi)', () => b.global('suiviRenvoyerConfirmation')('RC PUTEAUX')]
    ];
    for (const [code, libelle, geste] of annuler) await zero(b, code, libelle + ' : confirmation ANNULÉE', geste);
  });

  /* ============================== Z.T — témoin : le compteur n'est pas aveugle ============================== */
  await essai('Z.T', async () => {
    const avant = b.reseau.fetch;
    const r = await b.jouer(() => b.global('onEnregistrerEncadrement')());
    t.vrai(r.requetes.length === 1 && b.reseau.fetch - avant === 1, 'Z.T témoin : « Enregistrer » une carte = UNE requête, vue par le compteur (la suite voit les appels)', [r.resume, b.reseau]);
  });

  console.log('\n' + (process.exitCode ? 'ÉCHEC' : 'OK — ' + t.n + ' contrôles « une frappe locale = zéro appel » passés.'));
})().catch((e) => { console.error(e); process.exitCode = 1; });
