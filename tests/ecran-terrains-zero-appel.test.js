#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « TERRAINS » — UNE FRAPPE LOCALE = ZÉRO APPEL (lot « Terrains »)
 * ============================================================================
 *  ▶ node tests/ecran-terrains-zero-appel.test.js [--frontend avant|<racine>] [--backend avant|<Code.gs>]
 *
 *  Vrais modules (api.js compris) et vraies cartes d'admin.html, contre le vrai Code.gs
 *  (banc-ecran-terrains.js). Seul le transport est simulé. Le compte se fait AU PLUS BAS, à
 *  l'invocation : `fetch`, XMLHttpRequest, sendBeacon, WebSocket, EventSource, window.open, et toute
 *  image créée vers une adresse réseau — un appel indirect ne peut pas échapper. Chaque geste est aussi
 *  joué par le banc, qui sépare requêtes bloquantes et d'arrière-plan, puis les minuteries sont laissées
 *  courir (×1/1000 : plusieurs minutes simulées) pour attraper un appel différé.
 *
 *    Z.0  INVENTAIRE : chaque contrôle interactif de l'écran est classé — geste LOCAL (joué ici, zéro
 *         appel attendu) ou ACTION explicite (ses appels sont comptés et justifiés dans
 *         tests/ecran-terrains-surface.test.js). ⛔ Aucun contrôle non classé ;
 *    Z.<champ>  chaque champ : clic, frappe caractère par caractère, collage, effacement, Tabulation ;
 *         cases, menus, boutons locaux, carte (zoom, mise de côté, pivot), validation du placement ;
 *    Z.T  TÉMOIN : le compteur voit bien l'appel d'une action explicite (la suite n'est pas aveugle).
 *  Complément navigateur (hors dépôt, rapport du lot) : la même campagne dans Chromium, page entière,
 *  requêtes relevées par la page ET par le serveur — glisser-déposer des mini-terrains compris.
 *  ⛔ Aucun réseau, aucun service Google réel ; tournoi fictif.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const B = require('./banc-ecran-terrains');
const BC = require('./banc-ecran-categories');

const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
const LIRE = arg('frontend') === 'avant' ? B.LECTEUR_AVANT : arg('frontend') ? B.lecteur(path.resolve(arg('frontend'))) : B.lecteur();
const CODE = arg('backend') === 'avant' ? B.BACKEND_AVANT() : arg('backend') ? fs.readFileSync(path.resolve(arg('backend')), 'utf8')
  : fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');

const t = BC.compteur();
const json = JSON.stringify;
const essai = async (code, fn) => { try { await fn(); } catch (e) { t.vrai(false, code + ' (exception) ' + String((e && e.message) || e).slice(0, 300)); } };

/** Un banc dont TOUTE porte de sortie réseau est comptée, au plus bas niveau. */
async function bancCompte(options) {
  const b = await B.banc(Object.assign({ lire: LIRE, backend: CODE }, options || {}));
  const sorties = [];
  const ctx = b.ctx;
  const fetchVrai = ctx.fetch;
  ctx.fetch = function (adresse, reglages) { sorties.push('fetch ' + String(adresse)); return fetchVrai.apply(this, arguments); };
  ctx.XMLHttpRequest = function () { sorties.push('XMLHttpRequest'); return { open() {}, send() {}, setRequestHeader() {} }; };
  ctx.WebSocket = function (u) { sorties.push('WebSocket ' + u); };
  ctx.EventSource = function (u) { sorties.push('EventSource ' + u); };
  ctx.navigator = { sendBeacon: function (u) { sorties.push('sendBeacon ' + u); return true; } };
  ctx.window.open = function (u) { sorties.push('window.open ' + u); };
  const creer = b.doc.createElement.bind(b.doc);
  b.doc.createElement = function (tag) {
    const e = creer(tag);
    if (String(tag).toLowerCase() === 'img') {
      Object.defineProperty(e, 'src', { configurable: true,
        set(v) { if (/^(https?:)?\/\//.test(String(v))) sorties.push('img ' + v); this._src = v; }, get() { return this._src; } });
    }
    return e;
  };
  b.sorties = sorties;
  return b;
}

/** Joue un geste et renvoie tout ce qui est sorti : requêtes du banc ET appels comptés au plus bas. */
async function zero(b, nom, geste) {
  b.sorties.length = 0;
  const r = await geste();
  // Les minuteries tournent ×1/1000 : on laisse passer l'équivalent de plusieurs minutes.
  await new Promise((res) => setTimeout(res, 40));
  t.vrai(r.requetes.length === 0 && b.sorties.length === 0,
    'Z — ' + nom + ' : 0 bloquante, 0 arrière-plan, 0 appel réseau',
    { requetes: r.resume, sorties: b.sorties.slice(0, 5) });
  return r;
}

/* ⭐ LE CLASSEMENT — tout contrôle de l'écran y figure. `local` : aucun appel attendu, joué ici.
   `action` : un geste explicite, ses appels sont comptés et justifiés dans la suite « surface ».
   ⛔ Un contrôle nouveau ou disparu fait tomber Z.0 : il doit être classé, et s'il est local, joué ici. */
const CLASSEMENT = {
  // Fiches des grands terrains
  '.tp-nom': 'local', '.tp-type': 'local', '.tp-nature': 'local', '.tp-l': 'local', '.tp-w': 'local',
  '.tp-code': 'local', '.tp-rot': 'local', '.tp-x': 'local', '.tp-y': 'local', '.tp-pos': 'local',
  '.terr-suppr': 'local', '#bouton-ajouter-terrain': 'local',
  // Options avancées
  'summary': 'local', '#couloir-terrain': 'local', '#tm-l': 'local', '#tm-w': 'local',
  '.dim-plein': 'local', '.dim-l': 'local', '.dim-w': 'local', '.dim-enbut': 'local',
  // Répartition et carte
  '#bouton-repartir': 'local', '#carte-zoom-moins': 'local', '#carte-zoom-plus': 'local',
  '#carte-zoom-ajuste': 'local', '#bouton-valider-placement': 'local', '.repart-chip-pivot': 'local',
  // Le plan AU CLAVIER (2ᵉ passage) : chaque mini-terrain, posé ou mis de côté, est un bouton.
  '.carte-tuile-g': 'local', '.carte-table-g': 'local', '.repart-chip': 'local',
  // Les DEUX seules actions serveur de l'écran
  '#bouton-enregistrer-terrains': 'action', '#bouton-appliquer-repartition': 'action'
};

/** La nature d'un contrôle : son identifiant, sinon la classe qui le désigne, sinon sa balise. */
function nature(e) {
  if (e.id) return '#' + e.id;
  const classes = (e.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const connue = classes.filter((c) => CLASSEMENT['.' + c])[0];
  if (connue) return '.' + connue;
  if (classes.length) return '.' + classes[0];
  return e.tag;
}

(async () => {

/* ============================ Z.0 — inventaire ============================ */
await essai('Z.0', async () => {
  const b = await bancCompte();
  await b.repartir();
  await b.retirerTuile(b.tuileNonPleine());          // fait apparaître la pastille et son bouton ⟳
  await b.valider();                                 // fait apparaître « Appliquer aux catégories »
  await b.repartir();                                // puis on revient à l'état « placement à valider »
  await b.retirerTuile(b.tuileNonPleine());
  const SELECTEUR = 'input, textarea, select, button, summary, details, [tabindex], a';
  const zone = b.id('zone-terrains');
  const trouves = zone.querySelectorAll(SELECTEUR)
    .filter((e) => e.tag !== 'details')              // le dépliant n'est pas un contrôle : son `summary` l'est
    .map(nature);
  const uniques = [...new Set(trouves)].sort();
  // « Appliquer aux catégories » ne paraît qu'après validation du placement : on l'ajoute à l'inventaire
  // depuis l'état où il existe (relevé juste avant de revenir au placement).
  const apresValidation = await bancCompte();
  await apresValidation.repartir(); await apresValidation.valider();
  apresValidation.id('zone-terrains').querySelectorAll(SELECTEUR)
    .filter((e) => e.tag !== 'details').map(nature).forEach((n) => { if (uniques.indexOf(n) === -1) uniques.push(n); });
  uniques.sort();
  const nonClasses = uniques.filter((n) => !CLASSEMENT[n]);
  t.vrai(nonClasses.length === 0, 'Z.0 — chaque contrôle de l\'écran est classé (local ou action)', nonClasses);
  const classesAbsentes = Object.keys(CLASSEMENT).filter((n) => uniques.indexOf(n) === -1);
  t.vrai(classesAbsentes.length === 0, 'Z.0 — et chaque contrôle classé existe bel et bien', classesAbsentes);
  const locaux = uniques.filter((n) => CLASSEMENT[n] === 'local');
  t.vrai(locaux.length >= 25, 'Z.0 — ' + locaux.length + ' contrôles LOCAUX, ' +
    uniques.filter((n) => CLASSEMENT[n] === 'action').length + ' actions serveur', uniques);
});

/* ============================ Z.champs — frappe, collage, effacement, tabulation ============================ */
await essai('Z.champs', async () => {
  const b = await bancCompte();
  const champs = [
    ['nom du terrain', () => b.fiche(0).querySelector('.tp-nom'), 'Terrain Municipal'],
    ['longueur', () => b.fiche(0).querySelector('.tp-l'), '110'],
    ['largeur', () => b.fiche(0).querySelector('.tp-w'), '68'],
    ['code court', () => b.fiche(0).querySelector('.tp-code'), 'MUN'],
    ['orientation', () => b.fiche(0).querySelector('.tp-rot'), '35'],
    ['position X', () => b.fiche(0).querySelector('.tp-x'), '120'],
    ['position Y', () => b.fiche(0).querySelector('.tp-y'), '80'],
    ['couloir de circulation', () => b.id('couloir-terrain'), '5'],
    ['table de marque — longueur', () => b.id('tm-l'), '4'],
    ['table de marque — largeur', () => b.id('tm-w'), '4'],
    ['cote U10 — longueur', () => b.doc.querySelector('.dim-ligne[data-cat="U10"] .dim-l'), '45'],
    ['cote U10 — largeur', () => b.doc.querySelector('.dim-ligne[data-cat="U10"] .dim-w'), '32'],
    ['en-but U10', () => b.doc.querySelector('.dim-ligne[data-cat="U10"] .dim-enbut'), '5']
  ];
  for (const [nom, trouver, texte] of champs) {
    // a) clic
    await zero(b, nom + ' — clic', () => b.jouer(() => { const c = trouver(); c.focus(); return b.declencher(c, 'click'); }));
    // b) frappe caractère par caractère
    await zero(b, nom + ' — frappe (' + texte.length + ' caractères)', () => b.jouer(async () => {
      const c = trouver(); c.focus(); c.value = '';
      for (const ch of texte) { c.value += ch; await b.declencher(c, 'input'); }
    }));
    // c) collage d'un coup
    await zero(b, nom + ' — collage', () => b.jouer(() => {
      const c = trouver(); c.focus(); c.value = texte;
      return Promise.all([b.declencher(c, 'paste'), b.declencher(c, 'input')]);
    }));
    // d) tout effacer
    await zero(b, nom + ' — effacement complet', () => b.jouer(() => {
      const c = trouver(); c.focus(); c.value = '';
      return Promise.all([b.declencher(c, 'keydown', { key: 'Backspace' }), b.declencher(c, 'input')]);
    }));
    // e) quitter le champ (change + blur)
    await zero(b, nom + ' — Tabulation (change puis blur)', () => b.jouer(() => {
      const c = trouver();
      return Promise.all([b.declencher(c, 'change'), b.declencher(c, 'blur'),
        b.declencher(c, 'keydown', { key: 'Tab' })]);
    }));
  }
});

/* ============================ Z.menus, cases et boutons locaux ============================ */
await essai('Z.locaux', async () => {
  const b = await bancCompte();
  await zero(b, 'menu « Sport »', () => b.choisir(0, 'tp-type', 'foot'));
  await zero(b, 'menu « Surface »', () => b.choisir(0, 'tp-nature', 'Synthétique'));
  await zero(b, 'case « terrain entier » (cocher)', () => b.cocherPlein('U12'));
  await zero(b, 'case « terrain entier » (décocher)', () => b.cocherPlein('U12'));
  const sommaire = (classe) => b.doc.querySelectorAll('summary').filter((e) => e.parentNode &&
    (e.parentNode.getAttribute('class') || '').indexOf(classe) !== -1)[0];
  await zero(b, 'ouvrir « Options avancées »', () => b.jouer(() => b.cliquer(sommaire('cv-options'))));
  await zero(b, 'ouvrir une fiche de terrain', () => b.jouer(() => b.cliquer(sommaire('cv-terrain-detail'))));
  await zero(b, '« + Ajouter un grand terrain »', () => b.ajouterTerrain());
  await zero(b, '« Supprimer ce terrain » (confirmé)', () => b.supprimerTerrain(b.fiches().length - 1));
});

/* ============================ Z.carte — répartition, mise de côté, pivot, zoom ============================ */
await essai('Z.carte', async () => {
  const b = await bancCompte();
  await zero(b, '« Répartir les terrains »', () => b.repartir());
  await zero(b, 'zoom −', () => b.jouer(() => b.cliquer(b.id('carte-zoom-moins'))));
  await zero(b, 'zoom +', () => b.jouer(() => b.cliquer(b.id('carte-zoom-plus'))));
  await zero(b, 'zoom « Ajuster »', () => b.jouer(() => b.cliquer(b.id('carte-zoom-ajuste'))));
  const id = b.tuileNonPleine();
  await zero(b, 'mettre un mini-terrain de côté', () => b.retirerTuile(id));
  await zero(b, 'pivoter la pastille (bouton ⟳)', () => b.pivoterPastille(0));
  await zero(b, '« Valider le placement »', () => b.valider());
  await zero(b, '« Répartir » à nouveau (recalcul complet)', () => b.repartir());
});

/* ============================ Z.clavier — le plan au clavier, touche par touche ============================ */
await essai('Z.clavier', async () => {
  const b = await bancCompte();
  await b.repartir();
  const id = b.tuileNonPleine();
  await zero(b, 'flèche droite sur une table de marque', () =>
    b.touche(b.doc.querySelector('#repartition-carte g[data-table-field]'), 'ArrowRight'));
  await zero(b, 'flèche droite sur un mini-terrain posé', () => b.touche(b.tuileEl(id), 'ArrowRight'));
  await zero(b, 'Maj + flèche bas', () => b.touche(b.tuileEl(id), 'ArrowDown', { shiftKey: true }));
  await zero(b, 'flèche gauche', () => b.touche(b.tuileEl(id), 'ArrowLeft'));
  await zero(b, 'flèche haut', () => b.touche(b.tuileEl(id), 'ArrowUp'));
  await zero(b, 'R (pivoter sur place)', () => b.touche(b.tuileEl(id), 'r'));
  await zero(b, 'Entrée (mettre de côté)', () => b.touche(b.tuileEl(id), 'Enter'));
  await zero(b, 'T (changer de grand terrain)', () => b.touche(b.chipEl(0), 't'));
  await zero(b, 'R (pivoter la pastille)', () => b.touche(b.chipEl(0), 'r'));
  await zero(b, 'Espace sur la pastille', () => b.touche(b.chipEl(0), ' '));
  await zero(b, 'Échap (annuler)', () => b.touche(b.chipEl(0) || b.tuileEl(b.tuiles()[0]), 'Escape'));
  await zero(b, 'Tabulation sur un mini-terrain', () => b.touche(b.tuileEl(b.tuiles()[0]), 'Tab'));
  await zero(b, 'touche sans effet (A)', () => b.touche(b.tuileEl(b.tuiles()[0]), 'a'));
});

/* ============================ Z.plan — déplacer un terrain ne parle à personne ============================ */
await essai('Z.plan', async () => {
  const b = await bancCompte();
  await b.repartir();
  await zero(b, 'déplacer un grand terrain sur le plan', () => b.jouer(() => {
    b.global('positionsTerrains["RUG1"] = { x: 250, y: 120 }; ecrirePositionDansFiche(0, 250, 120);');
  }));
  t.vrai(b.fiche(0).querySelector('.tp-x').value === '250',
    'Z.plan — le déplacement se voit dans la fiche (et nulle part sur le réseau)', b.fiche(0).querySelector('.tp-x').value);
});

/* ============================ Z.T — témoin : le compteur n'est pas aveugle ============================ */
await essai('Z.T', async () => {
  const b = await bancCompte();
  b.sorties.length = 0;
  const r = await b.enregistrer();
  t.vrai(r.requetes.length === 1 && b.sorties.length === 1 && /fetch /.test(b.sorties[0]),
    'Z.T — ⭐ témoin : « Enregistrer les terrains » EST vu par le compteur (la suite mord)',
    { requetes: r.resume, sorties: b.sorties });
});

console.log('\n' + '─'.repeat(70) + '\nOK — ' + t.n + ' contrôles passés.');
})();
