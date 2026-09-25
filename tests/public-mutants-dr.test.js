#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  MUTANTS — LES PAGES PUBLIQUES DU TOURNOI, CÔTÉ NAVIGATEUR
 * ============================================================================
 *  ▶ node tests/public-mutants-dr.test.js
 *
 *  ⭐ CHAQUE MUTANT EST UNE PAIRE, et le verdict n'est « tué » que si les deux moitiés tiennent :
 *    · TÉMOIN SAIN — sur le code réel, le contrôle passe ;
 *    · FAUTE INJECTÉE — sur le code muté, le MÊME contrôle échoue.
 *  ⛔ Un mutant dont l'ancre n'est pas trouvée est déclaré RATÉ, jamais compté pour bon.
 *  ⛔ Aucun fichier n'est modifié sur disque : la mutation vit en mémoire.
 *  ⛔ Aucun réseau, aucun service Google réel.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const B = require('./banc-ecran-public');

const lire = (f) => fs.readFileSync(path.join(B.RACINE, f), 'utf8');

/** Un lecteur qui sert les fichiers de l'arbre, une mutation appliquée à l'un d'eux. */
function lecteurMute(fichier, paires) {
  return (f) => {
    let src = lire(f);
    if (f !== fichier) return src;
    for (const [avant, apres] of paires) {
      const parts = src.split(avant);
      if (parts.length !== 2) throw new Error('ancre absente ou non unique dans ' + f + ' : ' + avant.slice(0, 60));
      src = parts[0] + apres + parts[1];
    }
    return src;
  };
}

/** Un corps public utilisable comme réponse fabriquée. */
function corpsPublic(etat) {
  return JSON.parse(B.serveur(null, { etat: etat || 'oui' }).appeler('reponseEtatPublic_'));
}

const MUTANTS = [

/* ── ancien contenu présenté comme actuel ────────────────────────────────── */
{ cle: 'N1', libelle: 'un contenu ancien n’est plus marqué comme tel (il passe pour courant)',
  fichier: 'js/tournoi.js',
  paires: [['    etatPublic.ancien = true;      // ⛔ le contenu reste, sa fraîcheur non',
            '    etatPublic.ancien = false;']],
  tueur: async (js) => {
    const b = await B.banc({ etat: 'oui', js });
    b.ctx.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    await b.rafraichir();
    const ok = b.etat().ancien === true && /non actualisé/.test(b.texte('etat-public'));
    b.fermer();
    return ok;
  } },

/* ── erreur de rafraîchissement masquée ──────────────────────────────────── */
{ cle: 'N2', libelle: 'le bouton « Rafraîchir » reprend son libellé même après un échec',
  fichier: 'js/tournoi.js',
  paires: [["    btn.textContent = etatPublic.ancien || etatPublic.phase === 'erreur' ||\n                      etatPublic.phase === 'incompatible' ? '⚠️ Réessayer' : texte;",
            '    btn.textContent = texte;']],
  tueur: async (js) => {
    const b = await B.banc({ etat: 'oui', js });
    b.ctx.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    await b.rafraichir();
    const ok = String(b.texte('btn-refresh')) === '⚠️ Réessayer';
    b.fermer();
    return ok;
  } },

/* ── erreur réseau traitée comme un état vide ────────────────────────────── */
{ cle: 'N3', libelle: 'une réponse illisible est traitée comme un tournoi vide',
  fichier: 'js/tournoi.js',
  paires: [['  const d = lu.data;\n  if (!estEtatPublicValide(d)) {',
            '  const d = lu.data;\n  if (false) {']],
  /* ⭐ LE CORPS QUI PIÈGE VRAIMENT : un JSON PARFAITEMENT VALIDE, mais qui n'est pas un état public
     — la charge de l'ancien `getAll`. ⛔ Un JSON illisible, lui, lève dès `response.json()` et
     n'atteint jamais cette branche : le mutant aurait survécu pour une mauvaise raison.
     🔬 Sans la garde, ce corps traverse : `d.public` vaut `undefined`, donc la page conclut
     « tournoi non publié » et affiche « Le tournoi arrive bientôt » — un mensonge tranquille. */
  tueur: async (js) => {
    const b = await B.banc({ etat: 'oui', js, ouvrir: false });
    const ancienCorps = JSON.parse(JSON.stringify(
      B.serveur(null, { etat: 'oui' }).getMesure({ action: 'getAll' }).reponse));
    b.ctx.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ancienCorps });
    await b.ouvrir();
    const ok = b.etat().phase === 'erreur' && b.cache('tournoi-avenir') === true;
    b.fermer();
    return ok;
  } },

/* ── première erreur : un onglet reste en chargement permanent ───────────── */
{ cle: 'N4', libelle: 'la première charge en panne laisse la page en « chargement », sans rien dire',
  fichier: 'js/tournoi.js',
  paires: [["  etatPublic.phase = ferme ? 'incompatible' : 'erreur';",
            "  etatPublic.phase = 'chargement';"]],
  tueur: async (js) => {
    const b = await B.banc({ etat: 'oui', js, pannes: { getPublic: 'reseau' } });
    const ok = b.cache('tournoi-indispo') === false && /⛔/.test(b.texte('etat-public'));
    b.fermer();
    return ok;
  } },

/* ── interface non effacée après masquage ────────────────────────────────── */
{ cle: 'N5', libelle: 'le masquage n’efface pas les données déjà en mémoire',
  fichier: 'js/tournoi.js',
  paires: [['    equipes = []; matchs = []; sponsors = []; sponsorFil = null;',
            '    sponsorFil = null;']],
  tueur: async (js) => {
    const b = await B.banc({ etat: 'oui', js });
    // Le tournoi est publié, puis MASQUÉ entre deux lectures.
    const ferme = corpsPublic('masque');
    ferme.genere_le = new Date(Date.parse(b.etat().genereLe) + 60000).toISOString();
    ferme.servi_le = ferme.genere_le;
    b.ctx.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ferme });
    await b.rafraichir();
    const reste = b.lireVm('matchs.length + equipes.length + sponsors.length');
    const ok = b.etat().phase === 'non_publie' && reste === 0;
    b.fermer();
    return ok;
  } },

/* ── réponse ancienne remplaçant une récente ─────────────────────────────── */
{ cle: 'N6', libelle: 'la monotonie disparaît : une réponse ANCIENNE écrase une plus récente',
  fichier: 'js/tournoi.js',
  paires: [['  const requete = ++derniereRequetePublique;',
            '  const requete = derniereRequetePublique;']],
  tueur: async (js) => {
    const b = await B.banc({ etat: 'oui', js });
    const t = new Date(Date.parse(b.etat().genereLe) + 1000).toISOString();
    const publie = Object.assign({}, corpsPublic('oui'), {
      version: 'publie-ancien', genere_le: t, servi_le: t
    });
    const masque = Object.assign({}, corpsPublic('masque'), {
      version: 'masque-recent', genere_le: t, servi_le: t
    });
    const attente = [];
    b.ctx.fetch = () => new Promise((resolve) => attente.push(resolve));
    const ancienne = vm.runInContext('charger(false)', b.ctx);
    const recente = vm.runInContext('charger(false)', b.ctx);
    await b.tour();
    attente[1]({ ok: true, status: 200, json: async () => masque }); await recente;
    attente[0]({ ok: true, status: 200, json: async () => publie }); await ancienne;
    const ok = b.etat().phase === 'non_publie' && b.lireVm('equipes.length + matchs.length') === 0;
    b.fermer();
    return ok;
  } },

/* ── relais ancien préféré à une source récente ──────────────────────────── */
{ cle: 'N7', libelle: 'le relais est cru sur parole, même quand il est plus ANCIEN que l’écran',
  fichier: 'js/tournoi.js',
  paires: [['      if (ms >= 0 && ms < derniereGenereMs) { relaisEcarte = \'ancien\'; return null; }',
            '      if (false) { relaisEcarte = \'ancien\'; return null; }']],
  tueur: async (js) => {
    const URL = 'https://relais.exemple.invalid/instantane';
    const base = corpsPublic('oui');
    const relais = { url: URL, corps: Object.assign({}, base) };
    const b = await B.banc({ etat: 'oui', js, relais });
    const t = Date.parse(b.etat().genereLe);
    relais.corps = Object.assign({}, base, { version: 'v-relais-ancienne',
      genere_le: new Date(t - 120000).toISOString() });
    const avant = b.requetes().length;
    await b.rafraichir();
    const ok = b.requetes().slice(avant).indexOf('getPublic') !== -1 &&
               b.etat().version !== 'v-relais-ancienne';
    b.fermer();
    return ok;
  } },

/* ── relais d'une autre édition accepté ──────────────────────────────────── */
{ cle: 'N8', libelle: 'un relais d’une AUTRE édition est accepté comme la source courante',
  fichier: 'js/tournoi.js',
  paires: [["      if (etatPublic.edition && d.edition && d.edition !== etatPublic.edition) {\n        relaisEcarte = 'edition'; return null;\n      }",
            '      if (false) { return null; }']],
  tueur: async (js) => {
    const URL = 'https://relais.exemple.invalid/instantane';
    const base = corpsPublic('oui');
    const relais = { url: URL, corps: Object.assign({}, base) };
    const b = await B.banc({ etat: 'oui', js, relais });
    const edition = b.etat().edition;
    const t = Date.parse(b.etat().genereLe) + 1000;
    relais.corps = Object.assign({}, base, { edition: 'autre-edition-fictive',
      genere_le: new Date(t).toISOString(), servi_le: new Date(t).toISOString() });
    await b.rafraichir();
    const ok = b.etat().edition === edition;
    b.fermer();
    return ok;
  } },

/* ── requête dupliquée / tempête de rafraîchissement ─────────────────────── */
{ cle: 'N9', libelle: 'requête DUPLIQUÉE : le minuteur en cours n’est plus annulé (tempête)',
  fichier: 'js/tournoi.js',
  /* ⛔ LES DEUX DÉFENSES SONT RETIRÉES, et c'est délibéré : l'annulation du minuteur SUFFIT à elle
     seule à tenir la promesse, si bien que muter la seule coalescence ne fabriquerait aucun défaut.
     Un mutant qui ne casse rien n'est pas un mutant, c'est une illusion de couverture. */
  paires: [['  if (repriseArmee || chargementEnCours) return;',
            '  if (false) return;'],
           ['  if (minuteurRafraichissement != null) clearTimeout(minuteurRafraichissement);\n  minuteurRafraichissement = setTimeout(function () {',
            '  minuteurRafraichissement = setTimeout(function () {']],
  tueur: async (js) => {
    const b = await B.banc({ etat: 'oui', js });
    const avant = b.requetes().length;
    await b.signauxSimultanes(['visibilitychange', 'online', 'online']);
    const ok = b.requetes().length - avant === 1;
    b.fermer();
    return ok;
  } },

/* ── boucle de rafraîchissement : minuteurs empilés ──────────────────────── */
{ cle: 'N10', libelle: 'la boucle continue de battre alors que l’onglet est en arrière-plan',
  fichier: 'js/tournoi.js',
  /* ⭐ L'ÉCHAFAUDAGE EST APPLIQUÉ AUX DEUX CÔTÉS : sans intervalle court, aucune boucle ne bat
     pendant un test, et le mutant serait invisible faute de temps — pas faute de défaut.
     ⛔ Il ne masque rien : témoin et mutant reçoivent EXACTEMENT le même raccourcissement. */
  echafaudage: [['const INTERVALLE_MS = 15000;', 'const INTERVALLE_MS = 20;'],
                ['const JITTER_MS = 4000;', 'const JITTER_MS = 0;']],
  paires: [["    if (document.hidden) { minuteurRafraichissement = null; return; } // pause (reprise au retour)",
            '    if (false) { minuteurRafraichissement = null; return; }']],
  tueur: async (js) => {
    const b = await B.banc({ etat: 'oui', js, boucle: true });
    b.doc.hidden = true;                       // l'onglet part en arrière-plan
    const avant = b.requetes().length;
    await new Promise((r) => setTimeout(r, 150));   // largement plus que 20 ms
    const ok = b.requetes().length === avant;  // ⛔ personne ne regarde : rien ne doit partir
    b.fermer();
    return ok;
  } },

/* ── le repli silencieux (le relais écarté sans le dire) ─────────────────── */
{ cle: 'N11', libelle: 'le repli sur le serveur devient SILENCIEUX (plus aucun motif affiché)',
  fichier: 'js/tournoi.js',
  paires: [["    detail: relaisEcarte ? motifRelais(relaisEcarte) : ''",
            "    detail: ''"]],
  tueur: async (js) => {
    const URL = 'https://relais.exemple.invalid/instantane';
    const base = corpsPublic('oui');
    const relais = { url: URL, corps: Object.assign({}, base) };
    const b = await B.banc({ etat: 'oui', js, relais });
    relais.corps = Object.assign({}, base, { contrat: 'autre-contrat' });
    await b.rafraichir();
    const ok = /relais/i.test(b.etat().detail || '');
    b.fermer();
    return ok;
  } },

/* ── repli sur `getAll` : la fuite rouverte par le navigateur ────────────── */
{ cle: 'N12', libelle: 'la page retombe sur `getAll` quand `getPublic` échoue (fuite rouverte)',
  fichier: 'js/tournoi.js',
  paires: [["  const d = await apiGet('getPublic', null, { delaiMs: DELAI_REQUETE_MS });\n  return { data: d, source: 'serveur' };",
            "  try {\n    const d = await apiGet('getPublic', null, { delaiMs: DELAI_REQUETE_MS });\n    return { data: d, source: 'serveur' };\n  } catch (e) {\n    const v = await apiGet('getAll', null, { delaiMs: DELAI_REQUETE_MS });\n    return { data: Object.assign({ contrat: 'public-1', public: true, version: 'repli', motif: 'publie', edition: '', genere_le: new Date().toISOString(), servi_le: new Date().toISOString() }, v), source: 'serveur' };\n  }"]],
  tueur: async (js) => {
    const b = await B.banc({ etat: 'masque', js, backend: B.BACKEND_AVANT() });
    const ok = b.requetes().every((a) => a === 'getPublic') && b.etat().phase === 'incompatible';
    b.fermer();
    return ok;
  } },

/* ── `api.js` ancienne acceptée sans que l'adresse change ────────────────── */
{ cle: 'N13', libelle: '`tournoi.html` redemande `js/api.js` SANS version (cache chaud mêlé)',
  fichier: null,   // mutation sur le HTML, éprouvée par le garde-fou de cache
  html: [['src="js/api.js?v=refonte-ciel-verre-20260920-api2"', 'src="js/api.js"']],
  tueurStatique: (html) => {
    /* ⭐ LE CONTRÔLE QUI DOIT MORDRE : chaque ressource des pages publiques est servie à SON
       adresse épinglée. Une `api.js` sans version rompt l'épinglage. */
    const motif = /(?:href|src)="((?:css|js)\/[^"?]+\.(?:css|js))((?:\?[^"]*)?)"/g;
    let m;
    while ((m = motif.exec(html)) !== null) {
      if (m[1] === 'js/api.js') return m[2] === '?v=refonte-ciel-verre-20260920-api2';
    }
    return false;
  } },

/* ── garde-fou de cache aveugle à une ressource modifiée ─────────────────── */
{ cle: 'N14', libelle: 'le garde-fou de cache ne surveille plus le CONTENU d’une ressource modifiée',
  fichier: null,
  garde: true,
  tueurGarde: () => {
    /* ⭐ ON MODIFIE RÉELLEMENT UN OCTET — en mémoire — et on rejoue la section d'épinglage :
       le garde-fou DOIT échouer. ⛔ Sans quoi il rassurerait à tort, exactement comme il l'a fait
       pour `js/api.js`. */
    const crypto = require('node:crypto');
    const test = lire('tests/cache-busting-refonte.test.js');
    const bloc = test.slice(test.indexOf('const EPINGLES = ['), test.indexOf('];', test.indexOf('const EPINGLES = [')));
    const epingle = /\['js\/tournoi\.js', '\?v=refonte-ciel-verre-20260920',\s*'([0-9a-f]{64})'\]/.exec(bloc);
    if (!epingle) return false;
    const reel = crypto.createHash('sha256').update(lire('js/tournoi.js')).digest('hex');
    const mute = crypto.createHash('sha256').update(lire('js/tournoi.js') + '\n// octet de plus\n').digest('hex');
    return reel === epingle[1] && mute !== epingle[1];
  } },

/* ── ancien frontend autorisé par une EXCEPTION GÉNÉRALE (repli sur getAll) ── */
{ cle: 'N16', libelle: 'l’administration retombe sur `getAll` quand la lecture protégée échoue',
  fichier: 'js/api.js',
  paires: [['    throw err;\n  }\n  if (!r || !r.instantane ||',
            '    return { instantane: await apiGet(\'getAll\', null, options) };\n  }\n  if (!r || !r.instantane ||']],
  /* ⛔ CE QUE LE REPLI COÛTERAIT : sur un backend d'avant, `getAll` est GRAND OUVERT. Un frontend
     neuf paierait alors sa compatibilité en lisant ANONYMEMENT un tournoi masqué — exactement ce
     que le contrat interdit : « plutôt qu'un appel à un ancien endpoint qui livrerait déjà les
     données ». ⭐ Le contrôle exige donc qu'AUCUNE requête `getAll` ne parte de l'administration. */
  tueur: async (js) => {
    const b = await B.banc({ etat: 'masque', js, backend: B.BACKEND_AVANT(), ouvrir: false });
    const vu = [];
    const reel = b.ctx.fetch;
    b.ctx.fetch = (u, r) => {
      try {
        vu.push(r && r.body ? JSON.parse(r.body).action
          : new URL(String(u), 'http://127.0.0.1').searchParams.get('action'));
      } catch (e) {}
      return reel(u, r);
    };
    try { await b.ctx.lireInstantaneAdmin(null, {}); } catch (e) { /* échec attendu */ }
    await b.tour();
    b.fermer();
    return vu.indexOf('getAll') === -1;
  } },

/* ── masquage FRONTEND à la place de la fermeture SERVEUR ────────────── */
{ cle: 'N17', libelle: 'le masquage redevient un filtre de navigateur (le serveur livre, la page cache)',
  fichier: null,
  garde: true,
  tueurGarde: () => {
    /* ⭐ CONTRÔLE STRUCTUREL : la décision de publication se lit dans ce que le BACKEND répond.
       ⛔ Un filtre de navigateur, si bien écrit soit-il, ne changerait rien à cette réponse. */
    const srv = B.serveur(null, { etat: 'masque' });
    const brut = srv.getMesure({ action: 'getAll' }).reponse;
    const pub = srv.getMesure({ action: 'getPublic' }).reponse;
    const eq = srv.getMesure({ action: 'getEquipes' }).reponse;
    const serveurFerme = brut.public === false && (brut.matchs || []).length === 0 &&
      pub.public === false && pub.matchs.length === 0 && Array.isArray(eq) && eq.length === 0;
    /* ⛔ Et la page publique ne DÉCIDE plus rien : elle relit le verdict du serveur. */
    const src = lire('js/tournoi.js');
    const decideEnLocal = /function estPublie\(\)[\s\S]{0,200}config\.global[\s\S]{0,60}tournoi_publie/.test(src);
    return serveurFerme && !decideEnLocal;
  } },

/* ── dépendance à la « Feuille de journée », strictement exclue du lot ───── */
{ cle: 'N15', libelle: 'une page publique se met à dépendre de la « Feuille de journée »',
  fichier: null,
  garde: true,
  tueurGarde: () => {
    const sources = ['js/tournoi.js', 'js/perfs.js', 'tournoi.html', 'perfs.html', 'index.html'].map(lire).join('\n');
    const interdits = ['feuille-jour', 'feuilleJour', 'admin-feuille-jour', 'envoyerFeuilleJour', 'FeuilleJour'];
    return interdits.every((mot) => sources.indexOf(mot) === -1);
  } }
];

/* ========================================================================== */

(async () => {
  let tues = 0, rates = 0;
  console.log('\n═══ MUTANTS — pages publiques (navigateur) ═══\n');
  for (const mut of MUTANTS) {
    let temoin = false, apresMutation = true, rate = '';
    try {
      if (mut.garde) {
        temoin = mut.tueurGarde() === true;
        apresMutation = false;    // ⭐ la mutation est INTÉGRÉE au contrôle lui-même (voir son corps)
      } else if (mut.html) {
        const html = lire('tournoi.html');
        let mutee = html;
        for (const [a, b2] of mut.html) {
          const p = mutee.split(a);
          if (p.length !== 2) throw new Error('ancre HTML absente : ' + a);
          mutee = p[0] + b2 + p[1];
        }
        temoin = mut.tueurStatique(html) === true;
        apresMutation = mut.tueurStatique(mutee) === true;
      } else {
        const socle = mut.echafaudage ? lecteurMute(mut.fichier, mut.echafaudage) : B.lecteur();
        const avecFaute = lecteurMute(mut.fichier, (mut.echafaudage || []).concat(mut.paires));
        temoin = (await mut.tueur(socle)) === true;
        apresMutation = (await mut.tueur(avecFaute)) === true;
      }
    } catch (e) { rate = e.message; }

    if (rate) {
      console.error('  ✗ ' + mut.cle + ' RATÉ — ' + mut.libelle + ' (' + rate + ')');
      rates++; process.exitCode = 1;
    } else if (temoin && !apresMutation) {
      console.log('  ✓ ' + mut.cle + ' TUÉ — ' + mut.libelle);
      tues++;
    } else {
      console.error('  ✗ ' + mut.cle + ' SURVIVANT — ' + mut.libelle +
        ' (témoin sain : ' + (temoin ? 'OK' : '⛔ ÉCHOUE DÉJÀ') +
        ' · muté : ' + (apresMutation ? 'passe encore' : 'échoue') + ')');
      rates++; process.exitCode = 1;
    }
  }
  console.log('\n──────────────────────────────────────────────');
  console.log((process.exitCode ? 'ÉCHEC' : 'OK') + ' — ' + tues + '/' + MUTANTS.length +
    ' mutants navigateur tués' + (rates ? ', ' + rates + ' survivant(s) ou raté(s)' : ''));
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
