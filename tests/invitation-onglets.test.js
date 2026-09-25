#!/usr/bin/env node
/**
 * Non-régression — écran « Inviter un club » en onglets, et code couleur des clubs.
 *
 *  ⭐ SUITE DE RATTRAPAGE du commit a382c10, livré sans la sienne. Elle garde donc un lot
 *  DÉJÀ EN PLACE : chaque contrôle décrit ce qui était vrai à la clôture de ce lot, et sert
 *  d'alarme si un lot suivant le défait par inadvertance.
 *
 *  1) `construireOngletsEcran` — l'assembleur générique. Éprouvé sur un DOM simulé plutôt que
 *     par lecture du source : ce qui compte est que les blocs soient DÉPLACÉS (mêmes nœuds,
 *     donc écouteurs délégués et contenus intacts), pas qu'une ligne de code y ressemble.
 *  2) `fusionnerPiecesJointes` et `grouperCartesPanneau` — mêmes exigences de déplacement.
 *  3) `preparerOngletsInvitation` — trois onglets, et les deux dépliants d'origine conservés
 *     mais vidés et masqués (l'assistant mobile et le repli sans JavaScript s'y accrochent).
 *  4) Le code couleur : un état = UNE famille de couleur, sur deux supports, identique sur
 *     « Inviter un club » et sur « Suivi des clubs », et jamais la couleur seule.
 *
 *  DOM simulé, aucun réseau, aucune donnée métier.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let controles = 0;
function ok(v, m) { controles++; if (!v) throw new Error('ÉCHEC ' + controles + ' — ' + m); }
function egal(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' — reçu ' + JSON.stringify(a)); }

const racine = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');

/* ==========================================================================
   Un DOM simulé, réduit à ce que l'assembleur utilise réellement.
   ⭐ Il conserve l'IDENTITÉ des nœuds : c'est ce qui permet de prouver qu'un bloc a été
      déplacé et non recréé — la garantie sur laquelle repose toute la refonte.
   ========================================================================== */
function corresponds(el, sel) {
  return sel.charAt(0) === '.' ? (' ' + el.className + ' ').indexOf(' ' + sel.slice(1) + ' ') >= 0
       : el.tagName === sel.toUpperCase();
}
function chercher(el, sel) {
  if (sel.indexOf(':scope > ') === 0) {
    const s = sel.slice(9);
    return el.enfants.filter(function (e) { return corresponds(e, s); })[0] || null;
  }
  for (let i = 0; i < el.enfants.length; i++) {
    const e = el.enfants[i];
    if (corresponds(e, sel)) return e;
    const p = chercher(e, sel);
    if (p) return p;
  }
  return null;
}
const registre = {};
function noeud(tag, id) {
  const n = {
    tagName: String(tag).toUpperCase(), className: '', id: id || '', textContent: '',
    hidden: false, tabIndex: 0, enfants: [], parent: null, attrs: {}, ecouteurs: {}, focus_: 0,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    detacher(e) { const i = this.enfants.indexOf(e); if (i >= 0) this.enfants.splice(i, 1); },
    appendChild(e) { if (e.parent) e.parent.detacher(e); e.parent = this; this.enfants.push(e); return e; },
    insertBefore(e, ref) {
      if (e.parent) e.parent.detacher(e);
      e.parent = this;
      const i = ref ? this.enfants.indexOf(ref) : -1;
      if (i < 0) this.enfants.push(e); else this.enfants.splice(i, 0, e);
      return e;
    },
    replaceWith(e) { const p = this.parent; if (!p) return; const i = p.enfants.indexOf(this);
      if (e.parent) e.parent.detacher(e); e.parent = p; p.enfants.splice(i, 1, e); this.parent = null; },
    addEventListener(t, f) { (this.ecouteurs[t] = this.ecouteurs[t] || []).push(f); },
    declencher(t, ev) { (this.ecouteurs[t] || []).forEach(function (f) { f(ev); }); },
    focus() { this.focus_++; },
    querySelector(sel) { return chercher(this, sel); },
    closest(sel) { let e = this; while (e) { if (corresponds(e, sel)) return e; e = e.parent; } return null; },
    get firstChild() { return this.enfants[0] || null; },
    get parentNode() { return this.parent; }
  };
  n.classList = {
    contains(c) { return (' ' + n.className + ' ').indexOf(' ' + c + ' ') >= 0; },
    toggle(c, on) {
      const l = n.className.split(/\s+/).filter(Boolean);
      const i = l.indexOf(c);
      const veut = on === undefined ? i < 0 : !!on;
      if (veut && i < 0) l.push(c);
      if (!veut && i >= 0) l.splice(i, 1);
      n.className = l.join(' ');
    },
    add(c) { this.toggle(c, true); }, remove(c) { this.toggle(c, false); }
  };
  if (id) registre[id] = n;
  return n;
}

const ctx = vm.createContext({
  console,
  document: {
    createElement: (t) => noeud(t),
    getElementById: (id) => registre[id] || null,
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}
  },
  echapper: (v) => String(v == null ? '' : v),
  svgIcone: () => '', afficherMessage() {}, majEtatAvancement() {},
  configCourante: { global: {}, categories: [] }, equipesCourantes: [], adminConnecte: false
});
vm.runInContext(lire('js/ecrans.js'), ctx, { filename: 'js/ecrans.js' });

/* ---------------------------------------------- 1) l'assembleur générique */
const ecran = noeud('section', 'ecran-test');
const premier = noeud('div', 'bloc-a');
const second = noeud('div', 'bloc-b');
const troisieme = noeud('div', 'bloc-c');
premier.textContent = 'contenu A';
[premier, second, troisieme].forEach(function (b) { ecran.appendChild(b); });
ctx.ecranTest = ecran;
ctx.groupesTest = [
  { cle: 'un', titre: 'Premier onglet', blocs: ['bloc-a', 'bloc-b'], classe: 'ma-classe' },
  { cle: 'deux', titre: 'Second onglet', blocs: ['bloc-c'] },
  { cle: 'trois', titre: 'Troisième', blocs: ['bloc-absent'] }
];
const barre = vm.runInContext('construireOngletsEcran(ecranTest, groupesTest)', ctx);
ok(barre && barre.className === 'cv-onglets', 'une barre d’onglets est créée');
egal(barre.getAttribute('role'), 'tablist', 'elle s’annonce comme une barre d’onglets');
ok(ecran.firstChild === barre, 'la barre est posée EN TÊTE de l’écran');

const onglets = barre.enfants;
egal(onglets.length, 3, 'un onglet par groupe');
egal(onglets.map(function (o) { return o.textContent; }), ['Premier onglet', 'Second onglet', 'Troisième'],
  'chaque onglet porte son titre');
const panneaux = ecran.enfants.filter(function (e) { return (e.className || '').indexOf('cv-panneau') === 0; });
egal(panneaux.length, 3, 'un panneau par groupe');
egal(panneaux.map(function (p) { return p.id; }),
  ['ecran-test-p-un', 'ecran-test-p-deux', 'ecran-test-p-trois'],
  'les panneaux portent un identifiant dérivé de l’écran et de la clé');
ok(panneaux[0].className.indexOf('ma-classe') >= 0, 'la classe du groupe est reportée sur son panneau');
egal(panneaux.map(function (p) { return p.hidden; }), [false, true, true], 'seul le premier panneau est visible');
egal(onglets.map(function (o) { return o.getAttribute('aria-selected'); }), ['true', 'false', 'false'],
  'un seul onglet sélectionné');
egal(onglets.map(function (o) { return o.tabIndex; }), [0, -1, -1],
  'la tabulation n’entre qu’une fois dans la barre (tabindex roving)');
egal(onglets.map(function (o) { return o.getAttribute('aria-controls'); }),
  ['ecran-test-p-un', 'ecran-test-p-deux', 'ecran-test-p-trois'], 'chaque onglet désigne son panneau');

/* ⭐ LE POINT CENTRAL DE LA DOCTRINE : les blocs sont DÉPLACÉS, pas recréés. On compare les
   nœuds eux-mêmes — un bloc recopié aurait le même contenu mais perdrait ses écouteurs. */
egal(panneaux[0].enfants.length, 2, 'le premier panneau reçoit ses deux blocs');
ok(panneaux[0].enfants[0] === premier && panneaux[0].enfants[1] === second,
  '⭐ ce sont les MÊMES nœuds : les écouteurs délégués et les contenus survivent');
ok(panneaux[1].enfants[0] === troisieme, 'idem pour le second panneau');
egal(premier.textContent, 'contenu A', 'le contenu du bloc déplacé est intact');
egal(panneaux[2].enfants.length, 0, '⛔ un bloc absent du DOM ne fait pas échouer l’assemblage');

/* Navigation au clic, puis aux flèches, Début et Fin. */
function cliquer(onglet) { barre.declencher('click', { target: onglet }); }
function touche(onglet, key) {
  barre.declencher('keydown', { target: onglet, key: key, preventDefault: function () {} });
}
cliquer(onglets[1]);
egal(panneaux.map(function (p) { return p.hidden; }), [true, false, true], 'le clic ouvre le panneau visé');
egal(onglets.map(function (o) { return o.getAttribute('aria-selected'); }), ['false', 'true', 'false'],
  'et la sélection suit');
egal(onglets.map(function (o) { return o.tabIndex; }), [-1, 0, -1], 'la tabulation suit aussi');
touche(onglets[1], 'ArrowRight');
egal(panneaux[2].hidden, false, 'flèche droite passe au suivant');
ok(onglets[2].focus_ > 0, 'et le focus l’accompagne');
touche(onglets[2], 'ArrowRight');
egal(panneaux[0].hidden, false, 'la navigation boucle après le dernier');
touche(onglets[0], 'ArrowLeft');
egal(panneaux[2].hidden, false, 'et boucle aussi vers l’arrière');
touche(onglets[2], 'Home');
egal(panneaux[0].hidden, false, 'Début revient au premier');
touche(onglets[0], 'End');
egal(panneaux[2].hidden, false, 'Fin va au dernier');
touche(onglets[2], 'a');
egal(panneaux[2].hidden, false, '⛔ une touche quelconque ne change pas d’onglet');

/* Idempotence : un second assemblage ne doit rien refaire. */
const avant = ecran.enfants.length;
egal(vm.runInContext('construireOngletsEcran(ecranTest, groupesTest)', ctx), null,
  'un écran déjà en onglets n’est pas réassemblé');
egal(ecran.enfants.length, avant, 'et sa structure ne bouge pas');
egal(vm.runInContext('construireOngletsEcran(null, [])', ctx), null, '⛔ un écran absent ne fait rien planter');

/* ------------------------------ 2) fusion des pièces jointes et regroupement des cartes */
const apercu = noeud('section', 'ap-test');
const action = noeud('div'); action.className = 'ligne-action';
const avantAction = noeud('p'); avantAction.textContent = 'note';
const corpsApercu = noeud('div');
const intro = noeud('textarea', 'intro-test');
const rendu = noeud('iframe', 'rendu-test');
corpsApercu.appendChild(intro); corpsApercu.appendChild(rendu);
apercu.appendChild(avantAction); apercu.appendChild(corpsApercu); apercu.appendChild(action);
const pieces = noeud('section', 'pj-test');
pieces.className = 'carte';
const h2 = noeud('h2'); h2.textContent = 'Pièces jointes';
const champ = noeud('input');
pieces.appendChild(h2); pieces.appendChild(champ);
vm.runInContext('fusionnerPiecesJointes("ap-test", "pj-test", "rendu-test")', ctx);
ok(corpsApercu.enfants.indexOf(pieces) >= 0, 'la section des pièces jointes rejoint l’aperçu');
ok(corpsApercu.enfants.indexOf(pieces) === corpsApercu.enfants.indexOf(intro) + 1 &&
   corpsApercu.enfants.indexOf(pieces) === corpsApercu.enfants.indexOf(rendu) - 1,
  '⭐ le dépôt se pose entre la phrase d’introduction et l’aperçu réel');
ok(pieces.enfants.indexOf(champ) >= 0, 'ses champs sont toujours là — la section est déplacée, pas recréée');
ok(pieces.querySelector('h2') === null, 'son titre de carte est rétrogradé');
ok(pieces.querySelector('h3') && pieces.querySelector('h3').textContent === 'Pièces jointes',
  'en sous-titre, avec le même libellé');
ok(pieces.classList.contains('cv-sous-carte'), 'et elle perd son habillage de carte');
const structure = apercu.enfants.slice();
vm.runInContext('fusionnerPiecesJointes("ap-test", "pj-test", "rendu-test")', ctx);
ok(apercu.enfants.length === structure.length && apercu.enfants.every(function (e, i) { return e === structure[i]; }),
  'une seconde fusion ne refait rien');

const panneau = noeud('div', 'pan-test');
const existant = noeud('div'); panneau.appendChild(existant);
const carteA = noeud('section', 'c-a'), carteB = noeud('section', 'c-b');
vm.runInContext('grouperCartesPanneau("pan-test", "mon-groupe", ["c-a", "c-b", "c-absente"])', ctx);
const groupe = panneau.firstChild;
egal(groupe.className, 'mon-groupe', 'le groupe de cartes est posé en tête du panneau');
ok(groupe.enfants[0] === carteA && groupe.enfants[1] === carteB,
  'il reçoit les MÊMES cartes, dans l’ordre demandé');
egal(groupe.enfants.length, 2, '⛔ une carte absente est ignorée sans erreur');
ok(panneau.enfants[1] === existant, 'ce qui était déjà dans le panneau reste après');

/* ------------------------------------------- 3) l'écran « Inviter un club » lui-même */
const ecrans = lire('js/ecrans.js');
ok(/function preparerOngletsInvitation\(/.test(ecrans), 'l’écran a son assembleur');
ok(ecrans.includes(' preparerOngletsInvitation();'), 'appelé à la construction des écrans');
[['initiale', 'Invitation initiale'], ['final', 'Dossier final'], ['clubs', 'Clubs invités']].forEach(function (o) {
  ok(ecrans.indexOf("cle:'" + o[0] + "',titre:'" + o[1] + "'") >= 0, 'onglet « ' + o[1] + ' »');
});
ok(ecrans.includes("fusionnerPiecesJointes('bloc-apercu-invitation','bloc-pieces-jointes-invitation','apercu-invitation-rendu')") &&
   ecrans.includes("fusionnerPiecesJointes('bloc-apercu-dossier-email','bloc-pieces-jointes-dossier')"),
  'chaque lot de pièces jointes rejoint l’aperçu de SON email');
/* ⛔ Les deux dépliants d'origine restent CONSTRUITS : l'assistant mobile, le repli sans
   JavaScript et le test `reorganisation-invitation` s'y accrochent encore. */
ok(ecrans.includes("['bloc-invitation-initiale','bloc-dossier-final'].forEach"),
  'les deux dépliants d’origine sont conservés');
ok(/if\(groupe\)groupe\.hidden=true;/.test(ecrans), 'vidés de leurs cartes, ils sont seulement masqués');
ok(ecrans.indexOf('INVITATION_INITIALE_BLOCS') >= 0 && ecrans.indexOf('DOSSIER_FINAL_BLOCS') >= 0,
  'et leur composition d’origine reste définie');

/* admin.html n'est pas modifié : ce sont ses identifiants que tout vise. */
const html = lire('admin.html');
['bloc-clubs-invites', 'bloc-modalites', 'bloc-reponse', 'bloc-contacts-securite', 'bloc-surplace',
 'bloc-apercu-invitation', 'bloc-pieces-jointes-invitation', 'bloc-parking', 'bloc-encadrement',
 'bloc-apercu-dossier-email', 'bloc-pieces-jointes-dossier', 'bloc-dossier'
].forEach(function (id) { ok(html.includes('id="' + id + '"'), 'admin.html conserve #' + id); });
/* ⛔ Les deux dépliants, eux, n'ont JAMAIS existé dans le HTML : ils sont créés par
   `preparerInvitationInitiale` / `preparerDossierFinal`. Les chercher dans admin.html serait
   une fausse garantie — c'est leur construction en JavaScript qu'il faut garder. */
ok(!html.includes('id="bloc-invitation-initiale"') && !html.includes('id="bloc-dossier-final"'),
  'les deux dépliants ne viennent pas du HTML');
ok(/groupe\.id = 'bloc-invitation-initiale';/.test(ecrans) && /groupe\.id = 'bloc-dossier-final';/.test(ecrans),
  'ils sont créés par ecrans.js, et c'+"'"+'est là que leur existence se garde');

/* ------------------------------------------------- 4) le code couleur des clubs */
const invitations = lire('js/admin-invitations.js');
const ETATS = ['a-enregistrer', 'attente', 'equipes-ajoutees', 'decline'];
const libelles = vm.runInContext('(' + (invitations.match(/const LIBELLES_ETAT_CLUB = \{[\s\S]*?\};/) || [])[0]
  .replace('const LIBELLES_ETAT_CLUB = ', '').replace(/;$/, '') + ')', vm.createContext({}));
ETATS.forEach(function (e) {
  ok(typeof libelles[e] === 'string' && libelles[e].length > 3,
    '⛔ l’état « ' + e +' » a un libellé ÉCRIT : jamais la couleur seule');
});
/* L'ordre de tri et l'ordre des couleurs doivent raconter la même chose. */
const buckets = (invitations.match(/\{ 'a-enregistrer': (\d), 'attente': (\d), 'equipes-ajoutees': (\d), 'decline': (\d) \}/) || []);
egal(buckets.slice(1, 5), ['0', '1', '2', '3'],
  '⭐ le tri met l’action requise en premier, les cartes traitées ensuite');

const css = lire('css/theme-r92.css');
ok(/\.cv-invitation-initiale\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/.test(css),
  'l’aperçu ordinateur occupe une ligne pleine largeur sous les quatre cartes');
/* Un état = UNE règle qui nomme LES DEUX écrans : c'est ce qui garantit qu'ils ne divergeront pas. */
ETATS.forEach(function (e) {
  const liseré = new RegExp('\\.club-invite-item\\.club-etat-' + e + ',\\s*\\n?\\s*\\.theme-clair \\.suivi-club-ligne\\.club-etat-' + e + ' \\{[^}]*border-left-color');
  ok(liseré.test(css), 'le liseré de « ' + e + ' » est défini une fois pour « Inviter » ET « Suivi »');
  const pastille = new RegExp('\\.club-etat-badge\\.etat-' + e + ',\\s*\\n?\\s*\\.theme-clair \\.suivi-badge\\.etat-' + e + ' \\{');
  ok(pastille.test(css), 'et sa pastille aussi');
});
/* La couleur doit SUIVRE la priorité du tri : ambre = à faire, vert = traité. */
ok(/club-etat-a-enregistrer \{ border-left-color:#d09a2a; \}/.test(css),
  '⭐ « Équipes à ajouter » (bucket 0) est en ambre : une action est attendue');
ok(/club-etat-equipes-ajoutees \{ border-left-color:#3a9d70; \}/.test(css),
  '⭐ « Équipes ajoutées » (bucket 2) est en vert : c’est fait');
ok(/\.club-etat-badge\.etat-a-enregistrer,[\s\S]{0,80}color:var\(--cv-attention\)/.test(css),
  'la pastille reprend la même famille que son liseré');
ok(/\.club-etat-badge\.etat-equipes-ajoutees,[\s\S]{0,80}color:var\(--cv-succes\)/.test(css), 'idem pour le vert');

/* ⛔ AUCUN `order` sur les cartes clubs : il décalerait l'ordre visuel de l'ordre du DOM, donc
   de l'ordre de tabulation et de lecture (WCAG 2.4.3). Défaut introduit puis retiré en a382c10. */
const blocClubs = css.slice(css.indexOf('#liste-clubs-invites'));
const finBloc = blocClubs.indexOf('@media (max-width:767px) { .theme-clair #liste-clubs-invites');
ok(finBloc > 0, 'le bloc de style des cartes clubs est repérable');
ok(!/[^-a-z]order\s*:/.test(blocClubs.slice(0, finBloc)),
  '⛔ aucune propriété `order` sur les cartes clubs : l’ordre visuel reste celui du DOM');

console.log('OK — ' + controles + ' contrôles passés.');
