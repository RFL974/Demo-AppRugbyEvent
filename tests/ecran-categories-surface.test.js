#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « CATÉGORIES » — surface complète, vrais modules contre le vrai Code.gs
 * ============================================================================
 *  ▶ node tests/ecran-categories-surface.test.js [--frontend avant|<dossier js>] [--backend avant|<Code.gs>]
 *
 *  Principe : un geste local ne fait AUCUN appel ; « Enregistrer », « Ajouter » et « Supprimer » font UNE requête
 *  attendue chacun, et l'écran se met à jour depuis la réponse ; une réponse perdue n'est jamais renvoyée seule ; une
 *  saisie non enregistrée n'est jamais écrasée par un rendu lancé ailleurs ; le serveur reste l'autorité (création qui
 *  n'écrase rien, suppression recomptée).
 *    I — inventaire : tout contrôle de l'écran est connu (un contrôle nouveau fait tomber I.3) ;
 *    L — gestes locaux : zéro appel ;         V — contrôle de saisie visible, sans appel ;
 *    E — « Enregistrer » ;   J — « Ajouter » ;   K — « Supprimer » ;
 *    R — rendus lancés ailleurs pendant une saisie ;   F — décisions tirées du vrai Code.gs ;
 *    C — deux écrans sur la même catégorie (réglages différents, même réglage, suppression, réponse perdue puis renvoi) ;
 *    P — pause méridienne échelonnée gardée ;   N — contrôle FFR d'arrière-plan en panne (échec, délai, silence) ;
 *    M — requêtes RÉELLES par geste : bloquantes, arrière-plan, total, retour utilisateur, fin de l'activité réseau ;
 *    X — compatibilité entre versions (backend d'avant, frontend d'avant, scripts mêlés).
 *  Contre-épreuve : `--frontend avant --backend avant` (références FIGÉES a8bb9fbed29e718a084015c11aa7c888ca7bad35 /
 *  96dada20276efbf007ec829d37cbbcb13a6d49ca, jamais HEAD).
 *  ⛔ Aucun réseau, aucun service Google réel ; tournoi fictif.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('./banc-ecran-categories');

const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
const JS = arg('frontend') === 'avant' ? B.JS_AVANT : arg('frontend') ? B.lecteurJs(path.resolve(arg('frontend'))) : B.lecteurJs();
const CODE = arg('backend') === 'avant' ? B.BACKEND_AVANT() : arg('backend') ? fs.readFileSync(path.resolve(arg('backend')), 'utf8')
  : fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');
const t = B.compteur();
const banc = (o) => B.banc(Object.assign({ js: JS, backend: CODE }, o || {}));
const s = (ms) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';
const essai = async (code, fn) => { try { await fn(); } catch (e) { t.vrai(false, code + ' (exception) ' + String(e && e.message || e).slice(0, 200)); } };

/* Inventaire d'une carte : [balise, nom ou libellé, type]. ⛔ Toute évolution de la carte se déclare ICI. La forme de jeu
   (référentiel FFR du mois), le contexte U14 et le bouton « Appliquer la norme FFR » (profil FFR) sont conditionnels. */
const CARTE = (cat) => [['form', 'form-categorie ' + cat, '']]
  .concat(['U10', 'U12'].indexOf(cat) !== -1 ? [['select', 'forme_jeu', 'select-one']] : [])
  .concat([['select', 'format_mi_temps', 'select-one'], ['input', 'duree_mi_temps_min', 'number'], ['input', 'pause_mi_temps_min', 'number'],
    ['input', 'recup_entre_matchs_min', 'number'], ['input', 'effectif_min', 'number'], ['input', 'effectif_max', 'number'],
    ['input', 'nb_poules', 'text'], ['input', 'arbitrage_organisation', 'text'], ['input', 'max_equipes_par_club', 'number'],
    ['input', 'terrains_auto', 'radio'], ['input', 'terrains_auto', 'radio'], ['input', 'terrains', 'text'], ['div', 'terr-conseils', '']])
  .concat(cat === 'U14' ? [['input', 'contexte_tournoi', 'radio'], ['input', 'contexte_tournoi', 'radio'], ['input', 'scf_phase', 'radio'],
    ['input', 'scf_phase', 'radio']] : [])
  .concat([['select', 'format_apresmidi', 'select-one'], ['input', 'nbQualifiesCoupe', 'number'], ['button', 'Enregistrer', 'submit'],
    ['button', 'Supprimer', 'button'], ['span', 'msg-cat', '']])
  .concat(['U10', 'U12'].indexOf(cat) !== -1 ? [['button', 'Appliquer la norme FFR', 'button']] : []);
const CATEGORIES = ['U6', 'U8', 'U10', 'U12', 'U14'];
const INVENTAIRE = [['div', 'tablist', '']].concat(CATEGORIES.concat(['']).map((c) => ['button', 'onglet ' + c, 'button']))
  .concat([].concat.apply([], CATEGORIES.map(CARTE)))
  .concat([['form', 'form-ajout-categorie', ''], ['input', 'categorie', 'text'], ['button', 'Ajouter', 'submit'], ['div', 'msg-ajout-cat', ''],
    ['details', 'Vue d’ensemble', ''], ['summary', 'Vue d’ensemble', '']]);

function releverControles(doc) {
  return doc.getElementById('ecran-categories').querySelectorAll('form, input, select, textarea, button, details, summary, a, div, span')
    .filter((e) => /^(form|input|select|textarea|button|details|summary|a)$/.test(e.tag) || e.getAttribute('role') === 'tablist' ||
      e.hasAttribute('contenteditable') || e.hasAttribute('data-role'))
    .map((e) => {
      if (e.getAttribute('role') === 'tablist') return ['div', 'tablist', ''];
      if (e.hasAttribute('data-role')) return [e.tag, e.getAttribute('data-role'), ''];
      if (e.tag === 'form') return ['form', e.id || 'form-categorie ' + e.getAttribute('data-cat'), ''];
      if (e.tag === 'button' && e.hasAttribute('data-cat-onglet')) return ['button', 'onglet ' + e.getAttribute('data-cat-onglet'), e.type];
      if (e.tag === 'button') return ['button', e.textContent.trim(), e.type];
      if (e.tag === 'details' || e.tag === 'summary') return [e.tag, 'Vue d’ensemble', ''];
      return [e.tag, e.name || e.id, e.type];
    });
}

(async () => {
  /* ============================== I — inventaire ============================== */
  console.log('\nI — inventaire des contrôles');
  await essai('I', async () => {
    const html = fs.readFileSync(path.join(B.RACINE, 'admin.html'), 'utf8');
    t.vrai(/<div id="zone-categories"><\/div>/.test(html), 'I.1 admin.html : la zone Catégories ne porte aucun contrôle statique (tout est créé par afficherCategories)');
    const ecrans = JS('ecrans.js');
    t.vrai(/\{ id: 'categories',[^}]*blocs: \['zone-categories'\]/.test(ecrans), 'I.2 l\'écran « Catégories » ne regroupe que la zone Catégories');
    const b = await banc();
    const releve = releverControles(b.doc);
    t.vrai(JSON.stringify(releve) === JSON.stringify(INVENTAIRE),
      'I.3 ⭐ les ' + INVENTAIRE.length + ' contrôles rendus sont EXACTEMENT ceux de l\'inventaire (un contrôle nouveau fait tomber ce test)',
      releve.filter((x, i) => JSON.stringify(x) !== JSON.stringify(INVENTAIRE[i])).slice(0, 5));
    const etapes = /const ADMIN_ETAPES = \{([\s\S]*?)\n\};/.exec(JS('admin.js'));
    t.vrai(etapes && !/\bcategories\b/.test(etapes[1]), 'I.4 l\'arrivée sur l\'écran ne réclame aucune lecture (ADMIN_ETAPES)');
    t.vrai(b.journal.length === 0, 'I.5 rendu des cartes, des parties FFR et du tableau de bord : 0 requête');
    const formes = b.doc.querySelectorAll('form.form-categorie');
    t.vrai(formes.length === 5 && formes.every((f) => f.hasAttribute('novalidate')),
      'I.6 ⭐ le contrôle natif est remplacé par un contrôle qui se MONTRE (novalidate) : un champ masqué ne bloque plus l\'envoi en silence');
    t.vrai(b.bouton('U10').type === 'submit' && b.doc.getElementById('form-ajout-categorie').querySelector('button').type === 'submit',
      'I.7 « Enregistrer » et « Ajouter » soumettent leur formulaire (Entrée dans un champ aussi) ; « Supprimer » n\'en soumet aucun');
  });

  /* ============================== L — gestes locaux : zéro appel ============================== */
  console.log('\nL — gestes locaux');
  await essai('L', async () => {
    const b = await banc({ dialogues: [false, true] });
    b.onglet('U10');
    t.vrai(b.actif() === 'U10' && !b.form('U10').closest('[data-cat-panneau]').hidden && b.form('U6').closest('[data-cat-panneau]').hidden,
      'L.1 clic sur un onglet : son panneau s\'ouvre, les autres se ferment');
    const cle = (k) => { const o = b.doc.querySelector('.cv-cat-onglet.est-actif'); o.focus(); b.global('onClavierOngletsCategories')({ key: k, target: o, preventDefault() {} }); return b.actif(); };
    const trace = [cle('ArrowRight'), cle('ArrowLeft'), cle('End'), cle('Home'), cle('ArrowLeft')];
    t.vrai(JSON.stringify(trace) === '["U12","U10","","U6",""]' && b.doc.activeElement.getAttribute('data-cat-onglet') === '',
      'L.2 flèches, Début, Fin (avec retour circulaire) : l\'onglet suit, le focus aussi', trace);
    b.onglet('U10');
    b.saisir('U10', { format_mi_temps: '1', duree_mi_temps_min: '14', pause_mi_temps_min: '3', recup_entre_matchs_min: '20', effectif_min: '8',
      effectif_max: '12', nb_poules: '3', arbitrage_organisation: 'Parents', max_equipes_par_club: '3', forme_jeu: 'RE — 7x7' });
    const alerte = b.doc.querySelector('.ffr-alerte-temps[data-cat="U10"]');
    t.vrai(alerte && !alerte.hidden && /hors cadre FFR/.test(alerte.textContent), 'L.3 champs de temps : alerte « hors cadre FFR » en direct (local)');
    b.saisir('U10', { terrains_auto: 'non' });
    b.saisir('U10', { terrains: '3, x, 3, 99' });
    const bloc = b.form('U10').querySelector('.bloc-terrains');
    t.vrai(bloc.getAttribute('data-terrains') === 'manuel' && /n'est pas un numéro/.test(bloc.textContent) && /indiqué deux fois/.test(bloc.textContent),
      'L.4 terrains en Manuel : champ révélé, conseils en direct (local)');
    b.saisir('U10', { format_apresmidi: 'COUPE_PLATEAU' });
    await B.tour();
    const apresRefus = b.form('U10').querySelector('.bloc-format').getAttribute('data-format');
    b.saisir('U10', { format_apresmidi: 'COUPE_PLATEAU' });
    await B.tour();
    t.vrai(apresRefus === 'CROISE' && b.form('U10').querySelector('.bloc-format').getAttribute('data-format') === 'COUPE_PLATEAU' &&
      b.dialogues.length === 2 && /phases finales/.test(b.dialogues[0]),
      'L.5 format « Coupe + Plateau » : confirmation (refusée → format rétabli ; acceptée → qualifiés révélés), sans appel', b.dialogues);
    b.onglet('U14');
    b.saisir('U14', { contexte_tournoi: 'SCF' });
    b.saisir('U14', { scf_phase: 'P3' });
    t.vrai(b.form('U14').getAttribute('data-contexte') === 'SCF' && b.form('U14').querySelector('.bloc-scf').getAttribute('data-phase') === 'P3',
      'L.6 contexte U14 « Super Challenge » et phase : panneau et récapitulatif suivent (local)');
    b.onglet('U12');
    b.clic(b.doc.querySelector('#zone-categories .ffr-appliquer[data-cat="U12"]'));
    t.vrai(/référence FFR|Référence FFR|Norme FFR/i.test(b.message('U12')), 'L.7 « Appliquer la norme FFR » : remplit la carte ou dit pourquoi, sans rien enregistrer', b.message('U12'));
    const apercu = b.doc.querySelector('.cv-cat-apercu');
    apercu.open = true; apercu.open = false;
    t.vrai(b.journal.length === 0, 'L.8 ⭐ onglets, clavier, douze champs, formats, terrains, contexte U14, norme FFR, vue d\'ensemble : 0 requête',
      b.journal.map((j) => j.action));
  });

  /* ============================== V — contrôle de saisie ============================== */
  console.log('\nV — contrôle de saisie (sans appel, visible)');
  const cas = [
    ['V.1', 'durée négative', { duree_mi_temps_min: '-5' }, 'duree_mi_temps_min', 'Durée d’une période'],
    ['V.2', 'durée décimale', { pause_mi_temps_min: '7.5' }, 'pause_mi_temps_min', 'Pause entre deux périodes'],
    ['V.3', 'durée en notation scientifique (acceptée par le navigateur)', { recup_entre_matchs_min: '1e3' }, 'recup_entre_matchs_min', 'Récupération'],
    ['V.4', 'durée au-delà d\'une journée', { duree_mi_temps_min: '99999' }, 'duree_mi_temps_min', 'entre 0 et 1440'],
    ['V.5', 'effectif min > max (message historique)', { effectif_min: '14', effectif_max: '9' }, 'effectif_max', 'Effectif min (14) supérieur'],
    ['V.6', 'max équipes négatif', { max_equipes_par_club: '-1' }, 'max_equipes_par_club', 'Max équipes par club'],
    ['V.7', 'nombre de poules illisible', { nb_poules: 'abc' }, 'nb_poules', 'Nombre de poules'],
    ['V.8', 'qualifiés en Coupe à 0 (format visible)', { format_apresmidi: 'COUPE_PLATEAU', nbQualifiesCoupe: '0' }, 'nbQualifiesCoupe', 'Qualifiés en Coupe']
  ];
  for (const [code, libelle, champs, champ, texte] of cas) {
    await essai(code, async () => {
      const b = await banc();
      b.onglet('U10');
      b.saisir('U10', champs);
      await B.tour();
      const g = await b.enregistrer('U10');
      t.vrai(g.requetes.length === 0 && (b.message('U10') || '').indexOf(texte) !== -1 && b.doc.activeElement === b.champ('U10', champ),
        code + ' ' + libelle + ' : 0 requête, message qui nomme le champ, focus sur le champ', { r: g.resume, m: b.message('U10') });
    });
  }
  await essai('V.9', async () => {
    const b = await banc();
    b.onglet('U10');
    b.illisible('U10', 'effectif_min');
    const g = await b.enregistrer('U10');
    t.vrai(g.requetes.length === 0 && /illisible/.test(b.message('U10')), 'V.9 nombre illisible (« e ») : 0 requête, message', b.message('U10'));
    const c = await banc();
    c.onglet('U12');
    c.saisir('U12', { format_apresmidi: 'COUPE_PLATEAU' });
    await B.tour();
    c.saisir('U12', { nbQualifiesCoupe: '0' });
    c.saisir('U12', { format_apresmidi: 'CROISE' });
    const h = await c.enregistrer('U12');
    t.vrai(h.requetes.length === 1 && c.srv.cat('U12').format_apresmidi === 'CROISE' && /✅/.test(c.message('U12')),
      'V.10 ⭐ « Qualifiés » invalide mais MASQUÉ (format abandonné) : n\'empêche plus l\'envoi (il bloquait sans un mot)', { r: h.resume, m: c.message('U12') });
  });

  /* ============================== E — « Enregistrer » ============================== */
  console.log('\nE — « Enregistrer »');
  await essai('E.1', async () => {
    const b = await banc();
    b.onglet('U10');
    b.saisir('U10', { effectif_min: '8', arbitrage_organisation: 'Parents' });
    const rev = b.global('autorisationRevision');
    const g = await b.enregistrer('U10');
    const envoi = g.requetes[0];
    t.vrai(g.requetes.length === 1 && g.attendues.length === 1 && envoi.action === 'enregistrerCategorie',
      'E.1 ⭐ un clic = UNE requête attendue, aucune en arrière-plan quand le verdict FFR n\'en dépend pas (' + g.resume + ')', g.resume);
    t.vrai(envoi.corps.mode === 'modifier' && envoi.corps.effectif_min === '8' && envoi.corps.presente === 'oui' && envoi.corps.reglement === '' &&
      envoi.delaiMs === 30000, 'E.2 la requête porte la ligne ENTIÈRE (valeurs préservées comprises), `mode: modifier`, et elle est bornée (30 s)', envoi.corps);
    const u10 = b.config().categories.find((c) => c.categorie === 'U10');
    t.vrai(b.message('U10') === '✅ Enregistré.' && u10.effectif_min === '8' && !b.bouton('U10').disabled && b.propre('U10'),
      'E.3 message, configuration à jour depuis la réponse, bouton libéré, carte « propre » pour la barre latérale', b.message('U10'));
    t.vrai(b.global('autorisationRevision') > rev && b.appels.remplirSelectCategories.length === 0 && b.appels.injecterTerrains === 0,
      'E.4 feuille d\'autorisation déclarée périmée ; menu des équipes et écran Terrains NON reconstruits (rien n\'y a changé)', b.appels);
    const d = await b.enregistrer('U10');
    t.vrai(d.requetes.length === 1 && /^✅ Déjà à jour/.test(b.message('U10')) && d.requetes[0].reponse.modifies.length === 0,
      'E.5 second clic sans changement : 1 requête, « Déjà à jour », rien d\'écrit', { r: d.resume, m: b.message('U10') });
    b.saisir('U10', { effectif_min: '10' });
    const f2 = await b.enregistrer('U10');
    t.vrai(f2.attendues.length === 1 && b.srv.cat('U10').effectif_min === '10' && /^✅ Enregistré/.test(b.message('U10')) &&
      f2.requetes[0].corps.base && f2.requetes[0].corps.base.effectif_min === '8',
      'E.6 même réglage modifié de nouveau depuis la même carte : l\'envoi part de l\'état ENREGISTRÉ (8), aucun conflit avec soi-même', b.message('U10'));
    console.log('    (attente estimée par le modèle : ' + s(g.attenteMs) + ', verrou ' + s(g.verrouMs) + ')');
  });
  await essai('E.7', async () => {
    const b = await banc();
    b.onglet('U10');
    b.saisir('U10', { duree_mi_temps_min: '10' });
    const g = await b.enregistrer('U10');
    const etats = b.global('calculerEtatsEtapes()');
    t.vrai(g.attendues.length === 1 && g.fond.length === 1 && g.fond[0].action === 'getConformiteFFR',
      'E.7 durée changée (entrée du verdict FFR) : 1 requête attendue + le contrôle FFR en ARRIÈRE-PLAN (le bouton ne l\'attend pas)', g.resume);
    t.vrai((etats.find((e) => e.cle === 'poules') || {}).statut === 'arefaire' && /10 min/.test(b.doc.querySelector('.cv-cat-apercu').textContent),
      'E.8 fil « Où en suis-je ? » : le planning est « à refaire » aussitôt ; la vue d\'ensemble montre la durée enregistrée', etats.map((e) => e.cle + ':' + e.statut));
  });
  await essai('E.9', async () => {
    const b = await banc();
    b.onglet('U10');
    b.saisir('U10', { effectif_min: '9' });
    const g = await b.jouer(() => { b.soumettre(b.form('U10')); b.soumettre(b.form('U10')); if (!b.bouton('U10').disabled) b.soumettre(b.form('U10')); });
    t.vrai(g.requetes.length === 1, 'E.9 double clic / Entrée répétée : une seule requête', g.resume);
    const e = await b.jouer(() => b.soumettre(b.form('U10')), async () => { b.soumettre(b.form('U10')); });
    t.vrai(e.requetes.length === 1, 'E.10 Entrée pendant l\'envoi : ignorée', e.resume);
  });
  await essai('E.11', async () => {
    const b = await banc();
    b.onglet('U10');
    b.saisir('U10', { effectif_min: '9' });
    await b.jouer(() => b.soumettre(b.form('U10')), async () => { b.saisir('U10', { effectif_max: '15' }); });
    t.vrai(b.srv.cat('U10').effectif_max === '13' && b.champ('U10', 'effectif_max').value === '15' && /pas encore enregistré : Effectif maximum/.test(b.message('U10')) &&
      !b.propre('U10'), 'E.11 ⭐ modifié PENDANT l\'envoi : reste une saisie en cours, le message le dit, jamais marqué « enregistré »', b.message('U10'));
    b.global('injecterReglages(configCourante.global, configCourante.categories)');
    t.vrai(b.champ('U10', 'effectif_max').value === '15', 'E.11 bis … et un rendu ultérieur ne l\'efface pas', b.champ('U10', 'effectif_max').value);
  });
  for (const [code, panne, libelle] of [['E.12', '404', '404 de Google après exécution'], ['E.13', 'delai', 'délai dépassé'], ['E.14', 'reseau-apres', 'connexion coupée après exécution']]) {
    await essai(code, async () => {
      let n = 0;
      const b = await banc({ panne: (e) => (e.action === 'enregistrerCategorie' && ++n === 1 ? panne : null) });
      b.onglet('U10');
      b.saisir('U10', { effectif_min: '9' });
      const rev = b.global('autorisationRevision');
      const g = await b.enregistrer('U10');
      t.vrai(g.requetes.length === 1 && b.srv.cat('U10').effectif_min === '9' && /^⚠️ Enregistrement non confirmé/.test(b.message('U10')) &&
        b.champ('U10', 'effectif_min').value === '9' && b.config().categories.find((c) => c.categorie === 'U10').effectif_min === '7' &&
        b.global('autorisationRevision') > rev,
      code + ' ⭐ réponse perdue (' + libelle + ') : AUCUN renvoi, « non confirmé », saisie gardée, autorisation tenue pour périmée', { r: g.resume, m: b.message('U10') });
      const h = await b.enregistrer('U10');
      t.vrai(h.requetes.length === 1 && h.requetes[0].reponse.modifies.length === 0 && /^✅ Enregistré\./.test(b.message('U10')) && b.propre('U10'),
        code + ' bis nouveau clic : rien de réécrit, l\'écran se recale et dit « Enregistré » — pas « rien n\'a changé »', b.message('U10'));
    });
  }
  await essai('E.15', async () => {
    const b = await banc();
    const lock = b.srv.contexte.LockService.getScriptLock;
    b.srv.contexte.LockService.getScriptLock = () => Object.assign({}, lock(), { tryLock: () => false });
    b.onglet('U10');
    b.saisir('U10', { effectif_min: '9' });
    const g = await b.enregistrer('U10');
    b.srv.contexte.LockService.getScriptLock = lock;
    t.vrai(g.requetes.length === 1 && /occupé/.test(b.message('U10')) && b.champ('U10', 'effectif_min').value === '9' && b.srv.cat('U10').effectif_min === '7',
      'E.15 refus du serveur (verrou occupé) : son message, saisie gardée, rien d\'écrit', b.message('U10'));
    const p = await banc({ panne: (e) => (e.action === 'enregistrerCategorie' ? 'partielle' : null) });
    p.onglet('U10');
    p.saisir('U10', { effectif_min: '9' });
    const h = await p.enregistrer('U10');
    t.vrai(h.requetes.length === 1 && p.message('U10') === '✅ Enregistré.' && p.config().categories.find((c) => c.categorie === 'U10').effectif_min === '9',
      'E.16 réponse au contrat mais incomplète : valeurs envoyées appliquées, aucune relecture', h.resume);
    const r = await banc();
    r.onglet('U12');
    r.srv.appeler('supprimerCategorie', r.srv.classeur, 'U12');            // supprimée depuis un autre appareil
    r.saisir('U12', { effectif_min: '9' });
    const i = await r.enregistrer('U12');
    t.vrai(i.requetes.length === 1 && /recréée/.test(r.message('U12')) && r.srv.cat('U12').effectif_min === '9',
      'E.17 catégorie supprimée ailleurs puis enregistrée : recréée (comportement historique), et c\'est DIT', r.message('U12'));
  });

  /* ============================== J — « Ajouter » ============================== */
  console.log('\nJ — « Ajouter une catégorie »');
  await essai('J.1', async () => {
    const b = await banc();
    const g = await b.ajouter('U16');
    t.vrai(g.attendues.length === 1 && g.attendues[0].corps.mode === 'creer' && g.fond.length === 1 && g.fond[0].action === 'getConformiteFFR',
      'J.1 ⭐ UNE requête attendue (plus de relecture complète ni d\'attente du contrôle FFR, relancé en arrière-plan)', g.resume);
    t.vrai(b.actif() === 'U16' && b.onglets().indexOf('U16') !== -1 && /ajoutée/.test(b.message('U16')) &&
      b.config().categories.some((c) => c.categorie === 'U16') && b.doc.getElementById('tb-categories').textContent === '6',
      'J.2 l\'onglet de la nouvelle catégorie s\'ouvre, message, configuration et tableau de bord à jour', { onglets: b.onglets(), m: b.message('U16') });
    t.vrai(b.appels.remplirSelectCategories.slice(-1)[0] === 'U6,U8,U10,U12,U14,U16' && b.appels.injecterTerrains >= 1,
      'J.3 menu des équipes et écran Terrains suivent la nouvelle liste', b.appels);
    console.log('    (attente estimée par le modèle : ' + s(g.attenteMs) + ', verrou ' + s(g.verrouMs) + ')');
  });
  await essai('J.4', async () => {
    const b = await banc();
    const g = await b.ajouter(' u10 ');
    const doublon = b.messageAjout();
    const v = await b.ajouter('   ');
    t.vrai(g.requetes.length === 0 && /existe déjà/.test(doublon) && v.requetes.length === 0 && b.messageAjout() === 'Indique un nom.',
      'J.4 doublon (casse, accents, espaces) ou nom vide : 0 requête, message', [doublon, b.messageAjout()]);
    const d = await banc();
    d.onglet('');
    d.doc.querySelector('#form-ajout-categorie input[name="categorie"]').value = 'U16';
    const h = await d.jouer(() => { d.soumettre(d.doc.getElementById('form-ajout-categorie')); d.soumettre(d.doc.getElementById('form-ajout-categorie')); });
    t.vrai(h.ecritures.length === 1 && d.srv.categories().filter((c) => c.categorie === 'U16').length === 1, 'J.5 double clic / Entrée répétée : une seule création', h.resume);
  });
  await essai('J.6', async () => {
    const b = await banc();
    b.srv.poserCategorie({ categorie: 'U16', presente: 'oui', duree_mi_temps_min: '12', effectif_min: '9', format_apresmidi: 'LIBRE' });
    const g = await b.ajouter('U16');
    t.vrai(g.attendues.length === 1 && b.srv.cat('U16').duree_mi_temps_min === '12' && b.srv.cat('U16').effectif_min === '9' &&
      b.actif() === 'U16' && b.champ('U16', 'duree_mi_temps_min').value === '12' && /existe déjà/.test(b.message('U16')),
      'J.6 ⭐ catégorie créée entre-temps ailleurs : RIEN n\'est écrasé, sa carte s\'ouvre avec ses réglages et le message le dit', { m: b.message('U16'), r: g.resume });
  });
  await essai('J.7', async () => {
    let n = 0;
    const b = await banc({ panne: (e) => (e.action === 'enregistrerCategorie' && ++n === 1 ? '404' : null) });
    const g = await b.ajouter('U16');
    t.vrai(g.ecritures.length === 1 && g.attendues.map((r) => r.action).join() === 'enregistrerCategorie,getConfigAdmin' && b.actif() === 'U16' &&
      /confirmé par relecture/.test(b.message('U16')), 'J.7 ⭐ réponse perdue : relecture SEULE (jamais de renvoi), la catégorie créée s\'ouvre', { r: g.resume, m: b.message('U16') });
    let k = 0;
    const c = await banc({ panne: (e) => (e.action === 'enregistrerCategorie' && ++k === 1 ? 'reseau-avant' : null) });
    const h = await c.ajouter('U16');
    t.vrai(h.ecritures.length === 1 && !c.srv.cat('U16') && /n’a pas été créée/.test(c.messageAjout()) &&
      c.doc.querySelector('#form-ajout-categorie input[name="categorie"]').value === 'U16',
      'J.8 échec avant exécution : relecture, « pas créée », le nom reste dans le champ', { m: c.messageAjout() });
    const x = await banc();
    const i = await x.ajouter('U'.repeat(50001));
    t.vrai(i.requetes.length === 1 && /Texte trop long/.test(x.messageAjout()), 'J.9 refus du serveur : son message, aucune relecture', x.messageAjout());
  });

  /* ============================== K — « Supprimer » ============================== */
  console.log('\nK — « Supprimer »');
  await essai('K.1', async () => {
    const b = await banc();
    b.onglet('U14');
    const g = await b.supprimer('U14');
    t.vrai(/4 équipes et 6 matchs/.test(b.dialogues[0] || '') && g.attendues.length === 1 && g.attendues[0].corps.confirmation &&
      g.attendues[0].corps.confirmation.equipes === 4 && g.attendues[0].corps.confirmation.matchs === 6,
      'K.1 ⭐ la confirmation MONTRE ce que la catégorie porte (4 équipes, 6 matchs) et la requête dit ce qui a été confirmé', { d: b.dialogues, r: g.resume });
    t.vrai(g.attendues.length === 1 && g.fond.map((r) => r.action).join() === 'getConformiteFFR' && b.onglets().indexOf('U14') === -1 &&
      !b.config().categories.some((c) => c.categorie === 'U14') && b.srv.appeler('lireOngletSimple', b.srv.classeur, 'Equipes').filter((e) => e.categorie === 'U14').length === 4,
      'K.2 UNE requête attendue (plus de relecture), onglet retiré, équipes conservées ; contrôle FFR en arrière-plan', g.resume);
    t.vrai(/supprimée/.test(b.message(b.actif()) || '') && /conservés/.test(b.message(b.actif()) || '') &&
      !b.doc.querySelector('#form-choix-categories input[value="U14"]').checked,
      'K.3 message dans l\'onglet qui s\'ouvre (usage rappelé) ; la case U14 de l\'écran Infos suit', b.message(b.actif()));
  });
  await essai('K.4', async () => {
    const b = await banc({ dialogues: [false] });
    const g = await b.supprimer('U14');
    t.vrai(g.requetes.length === 0 && b.srv.cat('U14') && !b.boutonSuppr('U14').disabled, 'K.4 annulée : 0 requête, bouton libéré', g.resume);
    const c = await banc();
    c.srv.ajouterEquipe('Club fictif A', 'U14');
    c.srv.ajouterEquipe('Club fictif B', 'U14');
    const h = await c.supprimer('U14');
    t.vrai(h.ecritures.length === 2 && h.requetes[0].reponse.code === 'suppression_a_confirmer' && /6 équipes/.test(c.dialogues[1] || '') &&
      !c.srv.cat('U14'), 'K.5 ⭐ équipes inscrites entre-temps : le serveur refuse (rien d\'écrit), la confirmation est redemandée UNE fois avec SES chiffres', { d: c.dialogues, r: h.resume });
    const d = await banc({ dialogues: [true, false] });
    d.srv.ajouterEquipe('Club fictif A', 'U14');
    const i = await d.supprimer('U14');
    t.vrai(i.ecritures.length === 1 && d.srv.cat('U14') && /annulée/.test(d.message('U14')), 'K.6 seconde confirmation refusée : rien n\'est supprimé, c\'est dit', d.message('U14'));
  });
  await essai('K.7', async () => {
    let n = 0;
    const b = await banc({ panne: (e) => (e.action === 'supprimerCategorie' && ++n === 1 ? '404' : null) });
    const g = await b.supprimer('U14');
    t.vrai(g.ecritures.length === 1 && g.attendues.map((r) => r.action).join() === 'supprimerCategorie,getConfigAdmin' && !b.srv.cat('U14') &&
      b.onglets().indexOf('U14') === -1 && b.dialogues.length === 1, 'K.7 ⭐ réponse perdue : relecture SEULE qui prouve l\'absence, jamais de renvoi', g.resume);
    const c = await banc();
    const lock = c.srv.contexte.LockService.getScriptLock;
    c.srv.contexte.LockService.getScriptLock = () => Object.assign({}, lock(), { tryLock: () => false });
    const h = await c.supprimer('U14');
    c.srv.contexte.LockService.getScriptLock = lock;
    t.vrai(h.requetes.length === 1 && c.srv.cat('U14') && /occupé/.test(c.dialogues.slice(-1)[0]), 'K.8 refus lu (verrou occupé) : rien supprimé, alerte, aucune relecture', c.dialogues);
    const d = await banc();
    const bouton = d.boutonSuppr('U14');
    const k = await d.jouer(() => { d.clic(bouton); d.clic(bouton); });
    t.vrai(k.ecritures.length === 1 && d.dialogues.length === 1, 'K.9 le clic délégué route vers la suppression ; second clic pendant la confirmation : ignoré', k.resume);
  });

  /* ============================== R — rendus lancés ailleurs pendant une saisie ============================== */
  console.log('\nR — rendus lancés ailleurs pendant une saisie');
  await essai('R.1', async () => {
    const b = await banc();
    const f0 = b.form('U10');
    b.global('injecterReglages(configCourante.global, configCourante.categories)');
    t.vrai(b.form('U10') !== f0 && b.champ('U10', 'duree_mi_temps_min').value === '8', 'R.1 sans saisie en cours : rendu complet, comme avant');
    b.saisir('U10', { duree_mi_temps_min: '19', format_apresmidi: 'LIBRE', terrains_auto: 'non' });
    b.saisir('U12', { effectif_max: '14' });
    await b.ajouter('U16');
    t.vrai(b.champ('U10', 'duree_mi_temps_min').value === '19' && b.champ('U10', 'format_apresmidi').value === 'LIBRE' &&
      b.form('U10').querySelector('.bloc-terrains').getAttribute('data-terrains') === 'manuel' && b.champ('U12', 'effectif_max').value === '14' &&
      /Saisie non enregistrée conservée/.test(b.message('U10')) && !b.propre('U10'),
      'R.2 ⭐ catégorie AJOUTÉE : les saisies en cours des autres cartes survivent (valeurs, format, terrains), c\'est dit, elles restent à enregistrer',
      { u10: b.champ('U10', 'duree_mi_temps_min').value, m: b.message('U10') });
    await b.supprimer('U14');
    t.vrai(b.champ('U10', 'duree_mi_temps_min').value === '19' && b.champ('U12', 'effectif_max').value === '14', 'R.3 catégorie SUPPRIMÉE : saisies gardées');
    const e = await b.enregistrer('U10');
    t.vrai(e.attendues.length === 1 && b.srv.cat('U10').duree_mi_temps_min === '19' && b.srv.cat('U10').format_apresmidi === 'LIBRE',
      'R.4 puis « Enregistrer » : la saisie gardée part, entière', b.srv.cat('U10'));
  });
  await essai('R.5', async () => {
    const b = await banc();
    b.onglet('U10');
    b.saisir('U10', { duree_mi_temps_min: '19' });
    const champ = b.champ('U10', 'arbitrage_organisation');
    champ.focus(); champ.value = 'XY Éducateurs'; champ.setSelectionRange(2, 2);
    b.srv.poserCategorie({ categorie: 'U10', effectif_min: '9', arbitrage_organisation: 'Autre' });   // changé ailleurs
    const g = await b.jouer(() => b.global('rechargerEtRendre({ reglages: true })'));
    const nouveau = b.champ('U10', 'arbitrage_organisation');
    t.vrai(g.requetes.map((r) => r.action).join() === 'getInstantaneAdmin,getConfigAdmin' && b.champ('U10', 'duree_mi_temps_min').value === '19' &&
      b.champ('U10', 'effectif_min').value === '9' && nouveau.value === 'XY Éducateurs' && b.doc.activeElement === nouveau &&
      nouveau.selectionStart === 2 && /Saisie non enregistrée conservée/.test(b.message('U10')),
      'R.5 ⭐ relecture des réglages (génération, terrains, arbitrage…) : saisie GARDÉE, champ non touché rafraîchi, le champ ACTIF garde focus et curseur même si le serveur l\'a changé',
      { v: [b.champ('U10', 'duree_mi_temps_min').value, b.champ('U10', 'effectif_min').value, nouveau.value], m: b.message('U10') });
    b.saisir('U10', { effectif_max: '15' });
    b.doc.activeElement = null;
    b.srv.poserCategorie({ categorie: 'U10', effectif_max: '16' });
    await b.jouer(() => b.global('rechargerEtRendre({ reglages: true })'));
    t.vrai(b.champ('U10', 'effectif_max').value === '16' && /reprise pour : Effectif maximum/.test(b.message('U10')),
      'R.6 le serveur a changé CE champ entre-temps (hors focus) : sa valeur l\'emporte, et c\'est dit', b.message('U10'));
  });
  await essai('R.7', async () => {
    const b = await banc();
    b.onglet('U10');
    b.saisir('U10', { effectif_min: '9' });
    const bouton = b.bouton('U10');
    let pendant = null;
    const g = await b.jouer(() => b.soumettre(b.form('U10')), async () => {
      b.global('injecterReglages(configCourante.global, configCourante.categories)');
      pendant = { meme: b.bouton('U10') === bouton, occupe: b.bouton('U10').disabled };
    });
    t.vrai(pendant && pendant.meme && pendant.occupe && g.ecritures.length === 1 && !b.bouton('U10').disabled && /✅/.test(b.message('U10')),
      'R.7 rendu demandé PENDANT l\'envoi : différé (bouton toujours occupé, pas de second envoi), fait à la fin', pendant);
    b.saisir('U10', { duree_mi_temps_min: '19' });
    b.global('rendreCategoriesChoix(configCourante)');
    t.vrai(b.champ('U10', 'duree_mi_temps_min').value === '19', 'R.8 rendu par l\'écran Infos (choix des catégories) : saisie gardée');
    b.saisir('U10', { forme_jeu: '' });
    b.global('configCourante.categories.find(function (c) { return c.categorie === "U10"; }).forme_jeu = "RE — 7x7"');
    b.global('injecterReglages(configCourante.global, configCourante.categories)');
    b.saisir('U10', { forme_jeu: '' });
    await b.jouer(() => b.global('majConformiteFFR()'));
    t.vrai(b.champ('U10', 'forme_jeu').value === '', 'R.9 forme de jeu choisie : un contrôle FFR relancé ailleurs ne la ramène plus à la valeur stockée',
      b.champ('U10', 'forme_jeu').value);
    b.onglet('U12');
    b.saisir('U12', { effectif_min: '11' });
    b.srv.appeler('supprimerCategorie', b.srv.classeur, 'U12');
    await b.jouer(() => b.global('rechargerEtRendre({ reglages: true })'));
    t.vrai(b.onglets().indexOf('U12') === -1 && /Supprimée entre-temps : U12/.test(b.messageAjout()), 'R.10 catégorie supprimée ailleurs pendant sa saisie : la perte est DITE', b.messageAjout());
    b.onglet('');
    b.doc.querySelector('#form-ajout-categorie input[name="categorie"]').value = 'U18';
    b.global('injecterReglages(configCourante.global, configCourante.categories)');
    t.vrai(b.doc.querySelector('#form-ajout-categorie input[name="categorie"]').value === 'U18', 'R.11 nom en cours dans « Ajouter » : gardé');
  });

  /* ============================== F — décisions tirées du vrai Code.gs ============================== */
  console.log('\nF — décisions tirées du vrai Code.gs');
  await essai('F.1', async () => {
    const b = await banc();
    const colonnes = b.global('typeof COLONNES_CATEGORIE_VERDICT_FFR === "undefined" ? [] : COLONNES_CATEGORIE_VERDICT_FFR');
    const srv = b.srv;
    const lireConfig = vm.runInContext('lireConfig', srv.ctx);
    const vues = new Set();
    srv.ctx.lireConfig = (cl) => { const c = lireConfig(cl); c.categories = c.categories.map((x) => new Proxy(x, { get(o, k) { if (typeof k === 'string') vues.add(k); return o[k]; } })); return c; };
    vm.runInContext('getConformiteFFR', srv.ctx)(srv.classeur, { date: '2027-05-15', categories: 'U6,U8,U10,U12,U14', zone: 'C' });
    srv.ctx.lireConfig = lireConfig;
    t.vrai(vues.size > 0 && [...vues].every((k) => colonnes.indexOf(k) !== -1),
      'F.1 ⭐ traçage : le contrôle FFR du serveur ne lit, des catégories, QUE les colonnes qui le font relancer (aucun verdict faux laissé à l\'écran)',
      { lues: [...vues], declarees: colonnes });
    const c = await banc({ monde: (m) => m.poserCategorie({ categorie: 'U8', format_mi_temps: '3' }) });
    c.onglet('U8');
    const g = await c.enregistrer('U8');
    t.vrai(c.champ('U8', 'format_mi_temps').value === '3' && c.srv.cat('U8').format_mi_temps === '3' && g.ecritures.length === 1,
      'F.2 nombre de périodes enregistré hors de la liste (3) : gardé et renvoyé tel quel (il était effacé en silence)', c.srv.cat('U8').format_mi_temps);
    const back = fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');
    const modele = /var CATEGORIE_MODELE_CREATION = (\{[\s\S]*?\});/.exec(back);
    const ajout = /const data = \{\n    categorie: nom, presente: 'oui', ([\s\S]*?)mode: 'creer'\n  \};/.exec(JS('admin-reglages.js')) ||
      /const data = \{\n    categorie: nom, presente: 'oui', ([\s\S]*?)\n  \};/.exec(JS('admin-reglages.js'));
    const cles = (txt) => (txt.match(/\b(\w+):/g) || []).map((x) => x.slice(0, -1)).filter((k) => k !== 'mode' && k !== 'categorie').sort().join();
    t.vrai(modele && ajout && cles(modele[1]) === cles('presente: 1, ' + ajout[1]),
      'F.3 la ligne vierge d\'« Ajouter » est EXACTEMENT le modèle de création que le serveur protège (CATEGORIE_MODELE_CREATION)', { serveur: modele && cles(modele[1]), ecran: ajout && cles('presente: 1, ' + ajout[1]) });
  });

  /* ============================== C — deux écrans sur la même catégorie ============================== */
  console.log('\nC — deux écrans sur la même catégorie (même serveur, deux navigateurs)');
  const deuxEcrans = async (oa, ob) => {
    const srv = B.serveur(CODE);
    const a = B.navigateur(srv, JS, oa); await a.charger();
    const b = B.navigateur(srv, (ob && ob.js) || JS, ob); await b.charger();
    [a, b].forEach((x) => x.onglet('U10'));
    return { srv, a, b };
  };
  const u10 = (x) => x.config().categories.find((c) => c.categorie === 'U10');
  await essai('C.1', async () => {
    const { srv, a, b } = await deuxEcrans();
    a.saisir('U10', { duree_mi_temps_min: '10' });
    b.saisir('U10', { effectif_min: '9' });
    await a.enregistrer('U10');
    const g = await b.enregistrer('U10');
    t.vrai(g.attendues.length === 1 && g.fond.map((r) => r.action).join() === 'getConformiteFFR' && srv.cat('U10').duree_mi_temps_min === '10' &&
      srv.cat('U10').effectif_min === '9',
      'C.1 ⭐ deux écrans, deux réglages DIFFÉRENTS enregistrés l\'un après l\'autre : les deux restent (le second écrasait le premier)',
      { srv: srv.cat('U10'), r: g.resume });
    t.vrai(b.champ('U10', 'duree_mi_temps_min').value === '10' && u10(b).duree_mi_temps_min === '10' && /autre écran/.test(b.message('U10') || '') &&
      /Durée d’une période|Durée d'une période/.test(b.message('U10') || '') && b.propre('U10'),
      'C.2 le second écran MONTRE la durée enregistrée par le premier, et le dit', b.message('U10'));
    const h = await b.enregistrer('U10');
    t.vrai(h.requetes.length === 1 && srv.cat('U10').duree_mi_temps_min === '10' && /^✅ Déjà à jour/.test(b.message('U10')),
      'C.2 bis un nouveau clic du second écran ne ramène pas l\'ancienne durée', b.message('U10'));
  });
  await essai('C.3', async () => {
    const { srv, a, b } = await deuxEcrans();
    a.saisir('U10', { duree_mi_temps_min: '10' });
    b.saisir('U10', { duree_mi_temps_min: '12', effectif_min: '9' });
    await a.enregistrer('U10');
    const g = await b.enregistrer('U10');
    t.vrai(g.attendues.length === 1 && g.requetes[0].reponse.code === 'modification_concurrente' && srv.cat('U10').duree_mi_temps_min === '10' &&
      srv.cat('U10').effectif_min === '7' && b.champ('U10', 'duree_mi_temps_min').value === '12' && b.champ('U10', 'effectif_min').value === '9' &&
      /enregistré : 10 ; ta saisie : 12/.test(b.message('U10') || '') && !b.propre('U10') && !b.bouton('U10').disabled,
      'C.3 ⭐ même réglage changé AUTREMENT : le second écran est REFUSÉ (rien d\'écrit), sa saisie reste à l\'écran, le message montre les deux valeurs',
      { m: b.message('U10'), srv: [srv.cat('U10').duree_mi_temps_min, srv.cat('U10').effectif_min] });
    const h = await b.enregistrer('U10');
    t.vrai(h.attendues.length === 1 && srv.cat('U10').duree_mi_temps_min === '12' && srv.cat('U10').effectif_min === '9' && /^✅ Enregistré/.test(b.message('U10')),
      'C.4 nouveau clic, en connaissance de cause : la saisie est enregistrée', b.message('U10'));
  });
  await essai('C.5', async () => {
    const { srv, a, b } = await deuxEcrans();
    b.onglet('U12');
    b.saisir('U12', { effectif_min: '11' });
    await a.supprimer('U12');
    const g = await b.enregistrer('U12');
    t.vrai(!a.onglets().includes('U12') && g.requetes.length === 1 && srv.cat('U12') && srv.cat('U12').effectif_min === '11' && /recréée/.test(b.message('U12') || ''),
      'C.5 supprimée sur un écran pendant que l\'autre la modifie, puis enregistrée : RECRÉÉE (décision produit), et c\'est DIT', b.message('U12'));
  });
  await essai('C.6', async () => {
    let n = 0;
    const srv = B.serveur(CODE);
    const a = B.navigateur(srv, JS, { panne: (e) => (e.action === 'enregistrerCategorie' && ++n === 1 ? '404' : null) });
    await a.charger();
    a.onglet('U10');
    a.saisir('U10', { effectif_min: '9' });
    await a.enregistrer('U10');                                           // exécuté, réponse PERDUE
    const b = B.navigateur(srv, JS); await b.charger();                   // chargé APRÈS : état plus récent
    b.onglet('U10');
    b.saisir('U10', { duree_mi_temps_min: '14' });
    await b.enregistrer('U10');
    const g = await a.enregistrer('U10');                                 // nouveau clic du premier écran
    t.vrai(g.attendues.length === 1 && g.requetes[0].reponse.modifies.length === 0 && srv.cat('U10').duree_mi_temps_min === '14' &&
      srv.cat('U10').effectif_min === '9' && a.champ('U10', 'duree_mi_temps_min').value === '14' && /autre écran/.test(a.message('U10') || ''),
      'C.6 ⭐ réponse perdue, puis nouveau clic APRÈS une modification plus récente ailleurs : la plus récente reste, l\'écran la montre et le dit',
      { m: a.message('U10'), srv: srv.cat('U10').duree_mi_temps_min });
    const c = B.navigateur(srv, JS); await c.charger();
    c.onglet('U10');
    c.saisir('U10', { effectif_min: '11' });
    await c.enregistrer('U10');                                           // un autre écran change LE MÊME réglage
    let k = 0;
    const d = B.navigateur(srv, JS, { panne: (e) => (e.action === 'enregistrerCategorie' && ++k === 1 ? '404' : null) });
    await d.charger();
    d.onglet('U10');
    d.saisir('U10', { effectif_min: '12' });
    await d.enregistrer('U10');                                           // réponse perdue
    const e = B.navigateur(srv, JS); await e.charger(); e.onglet('U10');
    e.saisir('U10', { effectif_min: '13' }); await e.enregistrer('U10');   // plus récent, même réglage
    const h = await d.enregistrer('U10');
    t.vrai(h.requetes[0].reponse.code === 'modification_concurrente' && srv.cat('U10').effectif_min === '13' && d.champ('U10', 'effectif_min').value === '12',
      'C.7 même cas sur LE MÊME réglage : le nouveau clic est refusé, la valeur la plus récente reste, la saisie aussi (à l\'écran)', d.message('U10'));
  });
  await essai('C.8', async () => {
    const b = await banc();
    b.onglet('U10');
    const champ = b.champ('U10', 'arbitrage_organisation');
    champ.focus(); champ.value = 'XY Éducateurs';
    b.srv.poserCategorie({ categorie: 'U10', arbitrage_organisation: 'Autre' });                  // changé ailleurs
    await b.jouer(() => b.global('rechargerEtRendre({ reglages: true })'));
    const avertie = /autre écran/.test(b.message('U10') || '');
    const g = await b.enregistrer('U10');
    t.vrai(avertie && g.requetes[0].reponse.code === 'modification_concurrente' && b.srv.cat('U10').arbitrage_organisation === 'Autre' &&
      b.champ('U10', 'arbitrage_organisation').value === 'XY Éducateurs',
      'C.8 saisie ACTIVE gardée par un rendu alors que ce champ a changé ailleurs : c\'est dit, et l\'envoi suivant est refusé au lieu d\'écraser', b.message('U10'));
  });
  await essai('C.9', async () => {
    const { srv, a, b } = await deuxEcrans({}, { js: B.JS_AVANT });
    a.saisir('U10', { duree_mi_temps_min: '10' });
    await a.enregistrer('U10');
    b.saisir('U10', { effectif_min: '9' });
    await b.enregistrer('U10');
    t.vrai(srv.cat('U10').duree_mi_temps_min === '8' && srv.cat('U10').effectif_min === '9',
      'C.9 ⛔ LIMITE : un écran resté sur l\'ANCIEN frontend (sans `base`) écrase encore la durée de l\'autre — rien ne peut le détecter', srv.cat('U10'));
  });

  /* ============================== P — pause méridienne échelonnée ============================== */
  console.log('\nP — pause méridienne échelonnée (aucun contrôle dans la carte)');
  await essai('P.1', async () => {
    const pause = (m) => m.poserCategorie({ categorie: 'U10', pause_echelonnee: 'oui' });
    const b = await banc({ monde: pause });
    b.onglet('U10');
    b.saisir('U10', { effectif_min: '9' });
    const g = await b.enregistrer('U10');
    t.vrai(g.requetes[0].corps.pause_echelonnee === 'oui' && b.srv.cat('U10').pause_echelonnee === 'oui' && b.srv.cat('U10').effectif_min === '9',
      'P.1 ⭐ « Enregistrer » garde la pause échelonnée « oui » (elle était vidée en silence) : l\'envoi la porte, le serveur la garde', b.srv.cat('U10'));
    const c = await banc({ monde: pause, backend: B.BACKEND_AVANT() });
    c.onglet('U10');
    c.saisir('U10', { effectif_min: '9' });
    await c.enregistrer('U10');
    t.vrai(c.srv.cat('U10').pause_echelonnee === 'oui', 'P.2 nouveau frontend + backend d\'avant (96dada20276efbf007ec829d37cbbcb13a6d49ca) : gardée aussi', c.srv.cat('U10'));
  });

  /* ============================== N — contrôle FFR d'arrière-plan en panne ============================== */
  // Panne sur la PREMIÈRE émission FFR d'arrière-plan (pas celle du chargement de l'écran, qui est attendue), ou sur toutes.
  const premierFFR = (mode) => () => { let n = 0; return (e) => (!e.attendue && ++n === 1 ? mode : null); };
  const chaqueFFR = (mode) => () => () => mode;
  console.log('\nN — contrôle FFR d\'arrière-plan en panne : l\'écriture reste réussie, aucune saisie effacée');
  // [code, panne, libellé, émissions FFR réelles, attente réseau après le retour (ms, hors durée d'exécution), bloc FFR final]
  // ⭐ Les contrôles FFR protégés passent en POST : le transport ne les rejoue jamais automatiquement.
  //   Après une réponse perdue, l'écran échoue fermé et propose une reprise explicite.
  const PANNES_FFR = [
    ['N.1', chaqueFFR('http500-avant'), 'échec (500)', 1, 0, /indisponible/],
    ['N.2', chaqueFFR('delai'), 'délai dépassé, sans rejeu', 1, 30000, /indisponible/],
    ['N.3', chaqueFFR('silence'), 'réponse silencieuse, sans rejeu', 1, 30000, /indisponible/],
    ['N.5', premierFFR('silence'), 'réponse silencieuse, sans rejeu', 1, 30000, /indisponible/],
    ['N.6', premierFFR('404'), '404 de Google, sans rejeu', 1, null, /indisponible/]
  ];
  for (const [code, panneFFR, libelle, emissions, attenteMs, bloc] of PANNES_FFR) {
    await essai(code, async () => {
      const panne = panneFFR();
      const b = await banc({ panne: (e) => (e.action === 'getConformiteFFR' ? panne(e) : null) });
      b.onglet('U10');
      b.saisir('U12', { effectif_max: '14' });                           // saisie en cours sur une AUTRE carte
      b.saisir('U10', { duree_mi_temps_min: '10' });                     // entrée du verdict : contrôle FFR relancé
      const g = await b.jouer(() => b.soumettre(b.form('U10')), async () => { b.saisir('U10', { effectif_min: '9' }); },
        async (x) => ({ enAttente: x.enAttente, message: b.message('U10'), libre: !b.bouton('U10').disabled }));
      const zone = b.doc.getElementById('bloc-conformite-ffr').textContent;
      t.vrai(g.attendues.length === 1 && g.fond.length === emissions && g.fond.every((r) => r.action === 'getConformiteFFR') && g.auRetour.libre &&
        g.auRetour.enAttente.indexOf('getConformiteFFR') !== -1 && /^✅ Enregistré\./.test(g.auRetour.message || ''),
        code + ' contrôle FFR — ' + libelle + ' : bouton rendu avec « Enregistré » AVANT la réponse du contrôle ; ' + emissions +
        ' émission(s) FFR réelle(s) en arrière-plan', { auRetour: g.auRetour, r: g.resume });
      t.vrai(/^✅ Enregistré\./.test(b.message('U10') || '') && b.srv.cat('U10').duree_mi_temps_min === '10' && u10(b).duree_mi_temps_min === '10' &&
        b.champ('U10', 'effectif_min').value === '9' && b.champ('U12', 'effectif_max').value === '14' && bloc.test(zone),
        code + ' bis ⭐ après coup : écriture toujours « Enregistré », saisie faite pendant l\'envoi et saisie d\'une autre carte intactes, ' +
        'bloc FFR juste (' + String(bloc).slice(1, 30) + ')', { m: b.message('U10'), zone: zone.slice(0, 80) });
      if (attenteMs !== null) {
        const execFFR = g.fond.filter((r) => r.panne == null).reduce((x, r) => x + (r.estimeMs || 0), 0);
        t.vrai(g.finReseauMs - g.retourMs === attenteMs + execFFR, code + ' ter fin de l\'activité réseau = retour + ' + (attenteMs / 1000) +
          ' s de délai(s) du contrôle' + (execFFR ? ' + sa relance' : ''), [g.retourMs, g.finReseauMs]);
      }
    });
  }
  await essai('N.4', async () => {
    const b = await banc({ panne: (e) => (e.action === 'getConformiteFFR' ? 'silence' : null) });
    b.saisir('U10', { duree_mi_temps_min: '19' });
    const g = await b.ajouter('U16');
    const s = await b.supprimer('U14');
    t.vrai(g.attendues.length === 1 && s.attendues.length === 1 && b.srv.cat('U16') && !b.srv.cat('U14') && b.onglets().indexOf('U16') !== -1 &&
      b.champ('U10', 'duree_mi_temps_min').value === '19' && /supprimée/.test(b.message(b.actif()) || ''),
      'N.4 « Ajouter » puis « Supprimer » avec un contrôle FFR muet : écritures réussies et dites, saisie d\'une autre carte intacte', [g.resume, s.resume]);
  });

  /* ============================== M — requêtes réelles par geste ============================== */
  console.log('\nM — requêtes RÉELLES par geste (vrais modules, vrai Code.gs ; durées ESTIMÉES par le modèle de coût)');
  const premier = (action, panne) => { let n = 0; return (e) => (e.action === action && ++n === 1 ? panne : null); };
  const premierFond = (action, panne) => { let n = 0; return (e) => (e.action === action && !e.attendue && ++n === 1 ? panne : null); };
  const toujours = (action, panne) => (e) => (e.action === action ? panne : null);
  const duree = (b) => { b.saisir('U10', { duree_mi_temps_min: '10' }); return b.enregistrer('U10'); };
  const GESTES = [
    ['Enregistrer — un réglage (effectif)', {}, (b) => { b.saisir('U10', { effectif_min: '8' }); return b.enregistrer('U10'); }, [1, 0]],
    ['Enregistrer — aucune modification', {}, (b) => b.enregistrer('U10'), [1, 0]],
    ['Enregistrer — durée (entrée du verdict FFR)', {}, duree, [1, 1]],
    ['Ajouter', {}, (b) => b.ajouter('U16'), [1, 1]],
    ['Ajouter — déjà créée ailleurs', {}, (b) => { b.srv.poserCategorie({ categorie: 'U16', presente: 'oui', duree_mi_temps_min: '12' }); return b.ajouter('U16'); }, [1, 1]],
    ['Supprimer — catégorie utilisée', {}, (b) => b.supprimer('U14'), [1, 1]],
    ['Supprimer — équipes inscrites entre-temps (2ᵉ confirmation)', {}, (b) => { b.srv.ajouterEquipe('Club fictif A', 'U14'); b.srv.ajouterEquipe('Club fictif B', 'U14'); return b.supprimer('U14'); }, [2, 1]],
    ['Enregistrer — réponse perdue (404), puis nouveau clic', { panne: premier('enregistrerCategorie', '404') },
      async (b) => { b.saisir('U10', { effectif_min: '9' }); return [await b.enregistrer('U10'), await b.enregistrer('U10')]; }, [2, 0]],
    ['Ajouter — réponse perdue (404)', { panne: premier('enregistrerCategorie', '404') }, (b) => b.ajouter('U16'), [2, 1]],
    ['Enregistrer — même réglage changé ailleurs (refus)', {}, (b) => { b.srv.poserCategorie({ categorie: 'U10', duree_mi_temps_min: '10' }); b.saisir('U10', { duree_mi_temps_min: '12' }); return b.enregistrer('U10'); }, [1, 1]],
    ['Enregistrer durée — contrôle FFR en échec (500)', { panne: toujours('getConformiteFFR', 'http500-avant') }, duree, [1, 1]],
    ['Enregistrer durée — contrôle FFR hors délai, sans rejeu', { panne: toujours('getConformiteFFR', 'delai') }, duree, [1, 1]],
    ['Enregistrer durée — contrôle FFR silencieux, sans rejeu', { panne: toujours('getConformiteFFR', 'silence') }, duree, [1, 1]],
    ['Enregistrer durée — premier contrôle FFR silencieux', { panne: premierFond('getConformiteFFR', 'silence') }, duree, [1, 1]],
    ['Enregistrer durée — premier contrôle FFR en 404', { panne: premierFond('getConformiteFFR', '404') }, duree, [1, 1]]
  ];
  console.log('    | Geste | bloquantes | arrière-plan | total | retour utilisateur | fin de l\'activité réseau | requêtes |');
  console.log('    |---|---|---|---|---|---|---|');
  for (const [libelle, options, geste, attendu] of GESTES) {
    await essai('M ' + libelle, async () => {
      const b = await banc(options);
      b.onglet('U10');
      const gs = [].concat(await geste(b));
      const l = gs.reduce((x, g) => ({ bloquantes: x.bloquantes + g.attendues.length, fond: x.fond + g.fond.length, total: x.total + g.requetes.length,
        retourMs: x.retourMs + g.retourMs, finReseauMs: x.finReseauMs + g.finReseauMs, resume: x.resume.concat(g.resume) }),
      { bloquantes: 0, fond: 0, total: 0, retourMs: 0, finReseauMs: 0, resume: [] });
      console.log('    | ' + libelle + ' | ' + l.bloquantes + ' | ' + l.fond + ' | ' + l.total + ' | ' + s(l.retourMs) + ' | ' + s(l.finReseauMs) +
        ' | ' + l.resume.join(' ; ') + ' |');
      t.vrai(l.bloquantes === attendu[0] && l.fond === attendu[1] && l.total === attendu[0] + attendu[1],
        'M ' + libelle + ' : ' + attendu[0] + ' bloquante(s) + ' + attendu[1] + ' en arrière-plan = ' + (attendu[0] + attendu[1]) + ' requête(s) réelle(s)', l);
    });
  }

  /* ============================== X — compatibilité ============================== */
  console.log('\nX — compatibilité entre versions');
  const parcours = async (o) => {
    const b = await banc(o);
    b.onglet('U10');
    b.saisir('U10', { effectif_min: '9' });
    const e = await b.enregistrer('U10');
    const messageEnregistrer = b.message('U10') || '';
    const a = await b.ajouter('U16');
    const d = await b.supprimer('U14');
    return { b, e, a, d, ok: /✅/.test(messageEnregistrer) && b.srv.cat('U10').effectif_min === '9' && !!b.srv.cat('U16') && !b.srv.cat('U14') &&
      b.onglets().indexOf('U16') !== -1 && b.onglets().indexOf('U14') === -1 && b.config().categories.find((c) => c.categorie === 'U10').effectif_min === '9' };
  };
  await essai('X', async () => {
    const a = await parcours({ backend: B.BACKEND_AVANT() });
    t.vrai(a.ok && a.e.ecritures.length === 1 && a.a.attendues.map((r) => r.action).join() === 'enregistrerCategorie,getConfigAdmin' &&
      a.d.attendues.map((r) => r.action).join() === 'supprimerCategorie,getConfigAdmin',
      'X.1 nouveau frontend + ANCIEN backend (96dada20276efbf007ec829d37cbbcb13a6d49ca) : enregistrer (valeurs envoyées), ajouter et supprimer par relecture — état exact', [a.e.resume, a.a.resume, a.d.resume]);
    const c = await parcours({ js: B.JS_AVANT });
    t.vrai(c.ok && c.e.requetes[0].reponse.contrat === 'ecriture-v1', 'X.2 ANCIEN frontend (a8bb9fbed29e718a084015c11aa7c888ca7bad35) + nouveau backend : parcours historique, état exact', [c.e.resume, c.a.resume, c.d.resume]);
    for (const [code, fichiers] of [['X.3', ['admin-reglages.js']], ['X.4', ['admin-choix-categories.js']], ['X.5', ['admin-conformite-ffr.js']],
      ['X.6', ['admin.js']], ['X.7', ['admin-choix-categories.js', 'admin-conformite-ffr.js', 'admin.js']]]) {
      const m = await parcours({ js: B.lecteurMele(fichiers) });
      t.vrai(m.ok, code + ' cache mêlé — ' + fichiers.join(', ') + ' d\'avant, le reste d\'après : enregistrer, ajouter, supprimer, état exact', [m.e.resume, m.a.resume, m.d.resume]);
    }
    const r = await banc({ panne: (e) => (e.action === 'enregistrerCategorie' ? 'ancienne' : null) });
    r.onglet('U10');
    const e = await r.enregistrer('U10');
    t.vrai(e.requetes.length === 1 && r.message('U10') === '✅ Enregistré.', 'X.8 réponse sans contrat : succès, jamais « Déjà à jour » sans preuve', r.message('U10'));
  });

  console.log('\n' + (process.exitCode ? 'ÉCHEC' : 'OK — ' + t.n + ' contrôles de l\'écran « Catégories » passés.'));
})().catch((e) => { console.error(e); process.exitCode = 1; });
