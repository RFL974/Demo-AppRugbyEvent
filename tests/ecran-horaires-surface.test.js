#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « HORAIRES » — surface complète, vrais modules contre le vrai Code.gs
 * ============================================================================
 *  ▶ node tests/ecran-horaires-surface.test.js [--frontend avant|<dossier js>] [--backend avant|<Code.gs>]
 *
 *  Principe : un geste local ne fait AUCUN appel ; « Enregistrer les horaires » fait UNE requête, qui porte l'état
 *  final, et l'écran se met à jour depuis sa réponse ; une réponse perdue n'est jamais renvoyée seule ; une saisie
 *  non enregistrée n'est jamais écrasée par une relecture lancée ailleurs.
 *    I — inventaire : tout contrôle de l'écran est connu (un contrôle nouveau fait tomber I.2) ;
 *    L — gestes locaux : zéro appel ;         V — contrôle de saisie visible, sans appel ;
 *    E — enregistrement, pannes et réponses ;  R — relectures lancées ailleurs (saisie en cours) ;
 *    X — compatibilité entre versions (backend d'avant, frontend d'avant, scripts mêlés).
 *  Contre-épreuve : `--frontend avant --backend avant` (références FIGÉES 1201fcb / 5fee619, jamais HEAD).
 *  ⛔ Aucun réseau, aucun service Google réel ; tournoi fictif.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const B = require('./banc-ecran-horaires');

const arg = (nom) => { const i = process.argv.indexOf('--' + nom); return i === -1 ? null : process.argv[i + 1]; };
const JS = arg('frontend') === 'avant' ? B.JS_AVANT : arg('frontend') ? B.lecteurJs(path.resolve(arg('frontend'))) : B.lecteurJs();
const CODE = arg('backend') === 'avant' ? B.BACKEND_AVANT() : arg('backend') ? fs.readFileSync(path.resolve(arg('backend')), 'utf8')
  : fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');
const t = B.compteur();
const banc = (o) => B.banc(Object.assign({ js: JS, backend: CODE }, o || {}));
const s = (ms) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';

/* Inventaire de l'écran : [balise, identifiant ou nom, type]. ⛔ Toute évolution de la carte se déclare ICI. */
const INVENTAIRE = [
  ['form', 'form-horaires', ''],
  ['input', 'heure_rdv', 'time'],
  ['input', 'heure_debut', 'time'],
  ['details', 'Options de pause', ''],
  ['summary', 'Options de pause', ''],
  ['input', 'pause_echelonnee', 'checkbox'],
  ['input', 'pause_dejeuner_debut', 'time'],
  ['input', 'pause_dejeuner_duree_min', 'number'],
  ['strong', 'val-pause-fin', ''],
  ['input', 'marge_fin_communiquee_min', 'number'],
  ['details', 'Options avancées', ''],
  ['summary', 'Options avancées', ''],
  ['input', 'battement_terrain_min', 'number'],
  ['input', 'heure_fin_auto', 'checkbox'],
  ['input', 'heure_fin', 'time'],
  ['input', 'heure_fin_communiquee', 'time'],
  ['div', 'cv-frise-horaires', ''],
  ['span', 'message-horaires', ''],
  ['button', 'Enregistrer les horaires', 'submit']
];
const CHAMPS = ['heure_debut', 'heure_rdv', 'heure_fin', 'heure_fin_auto', 'heure_fin_communiquee', 'marge_fin_communiquee_min',
  'battement_terrain_min', 'pause_dejeuner_debut', 'pause_dejeuner_duree_min', 'pause_echelonnee'];

(async () => {
  /* ============================== I — inventaire ============================== */
  console.log('\nI — inventaire des contrôles');
  {
    const html = fs.readFileSync(path.join(B.RACINE, 'admin.html'), 'utf8');
    const zone = /<div id="zone-horaires">([\s\S]*?)<\/div>\s*<\/div>/.exec(html);
    t.vrai(zone && !/<(input|select|textarea|button|details|summary|form)\b/.test(zone[1]),
      'I.1 admin.html : la zone Horaires ne porte aucun contrôle statique (tout est créé par afficherHoraires)', zone && zone[1]);
    const ecrans = JS('ecrans.js');
    t.vrai(/\{ id: 'horaires',[^}]*blocs: \['zone-horaires'\]/.test(ecrans), 'I.1 bis l\'écran « Horaires » ne regroupe que la zone Horaires');
    const b = await banc();
    const doc = b.doc;
    const releve = doc.getElementById('ecran-horaires').querySelectorAll('form, input, select, textarea, button, details, summary, output, a, [tabindex], [contenteditable], strong, div, span')
      .filter((e) => /^(form|input|select|textarea|button|details|summary|output|a)$/.test(e.tag) || e.hasAttribute('tabindex') ||
        e.hasAttribute('contenteditable') || ['val-pause-fin', 'cv-frise-horaires', 'message-horaires'].indexOf(e.id) !== -1)
      .map((e) => [e.tag, e.tag === 'details' || e.tag === 'summary' ? (e.tag === 'details' ? e.querySelector('summary') : e).textContent.replace(/(Pause méridienne échelonnée|Battement,.*)$/, '').trim()
        : e.tag === 'button' ? e.textContent.trim() : (e.name || e.id), e.tag === 'input' || e.tag === 'button' ? e.type : '']);
    t.vrai(JSON.stringify(releve) === JSON.stringify(INVENTAIRE),
      'I.2 ⭐ les ' + INVENTAIRE.length + ' contrôles rendus sont EXACTEMENT ceux de l\'inventaire (un contrôle nouveau fait tomber ce test)', releve);
    const nommes = doc.getElementById('form-horaires').querySelectorAll('input').map((c) => c.name).sort();
    t.vrai(JSON.stringify(nommes) === JSON.stringify(CHAMPS.slice().sort()), 'I.3 chaque champ nommé part au serveur, et rien d\'autre', nommes);
    const libelles = doc.getElementById('form-horaires').querySelectorAll('label').map((l) => l.getAttribute('for')).filter(Boolean);
    t.vrai(['heure_rdv', 'heure_debut', 'pause_dejeuner_debut', 'pause_dejeuner_duree_min', 'marge_fin_communiquee_min', 'battement_terrain_min',
      'heure_fin', 'heure_fin_communiquee'].every((n) => libelles.indexOf('h-' + n) !== -1), 'I.4 chaque champ heure ou durée a son libellé associé', libelles);
    t.vrai(b.form().hasAttribute('novalidate'), 'I.5 ⭐ le contrôle natif est remplacé par un contrôle qui se MONTRE (novalidate)', b.form().attrs);
    t.vrai(b.bouton().getAttribute('form') === 'form-horaires' && b.bouton().type === 'submit', 'I.6 le bouton soumet le formulaire (Entrée dans un champ aussi)');
    const admin = JS('admin.js');
    const etapes = /const ADMIN_ETAPES = \{([\s\S]*?)\n\};/.exec(admin);
    t.vrai(etapes && !/\bhoraires\b/.test(etapes[1]), 'I.7 l\'arrivée sur l\'écran ne réclame aucune lecture (ADMIN_ETAPES)');
    t.vrai(b.journal.length === 0, 'I.8 rendu de la carte et du tableau de bord : 0 requête');
  }

  /* ============================== L — gestes locaux : zéro appel ============================== */
  console.log('\nL — gestes locaux');
  {
    const b = await banc();
    const frise0 = b.doc.getElementById('cv-frise-horaires').textContent;
    b.saisir({ heure_debut: '11:30' });
    b.saisir({ heure_rdv: '09:00' });
    b.saisir({ pause_dejeuner_debut: '12:45' });
    b.saisir({ pause_dejeuner_duree_min: '75' });
    b.saisir({ marge_fin_communiquee_min: '60' });
    b.saisir({ battement_terrain_min: '4' });
    b.saisir({ heure_fin_communiquee: '18:30' });
    b.saisir({ heure_fin_auto: false });
    t.vrai(!b.champ('heure_fin').disabled, 'L.1 décocher « Calcul automatique » dégrise la fin (local)');
    b.saisir({ heure_fin: '17:30', heure_fin_auto: true });
    t.vrai(b.champ('heure_fin').disabled, 'L.2 recocher la regrise (local)');
    b.saisir({ pause_echelonnee: true });
    t.vrai(b.doc.querySelector('.bloc-pause-dej').getAttribute('data-ech') === 'oui', 'L.3 « Pause échelonnée » bascule le bloc (libellés, durée masquée)');
    b.saisir({ pause_echelonnee: false });
    b.champ('heure_rdv').value = '';
    b.saisir({ heure_debut: '09:00' });
    t.vrai(b.champ('heure_rdv').value === '07:45', 'L.4 accueil vide : pré-rempli à début − 1 h 15 (local)', b.champ('heure_rdv').value);
    b.doc.querySelectorAll('#zone-horaires details').forEach((d) => { d.open = true; d.open = false; });
    t.vrai(b.journal.length === 0, 'L.5 ⭐ dix champs, deux cases, deux panneaux, pré-remplissage : 0 requête', b.journal.map((j) => j.action));
    t.vrai(b.doc.getElementById('cv-frise-horaires').textContent === frise0,
      'L.6 l\'aperçu montre l\'état ENREGISTRÉ pendant la saisie (comportement conservé, décision produit ouverte)');
  }

  /* ============================== V — contrôle de saisie ============================== */
  console.log('\nV — contrôle de saisie (sans appel, visible)');
  {
    const cas = [
      ['V.1', 'durée illisible dans un panneau fermé', (b) => b.illisible('battement_terrain_min'), 'battement_terrain_min', 'Battement entre deux matchs'],
      ['V.2', 'heure incomplète', (b) => b.illisible('heure_fin_communiquee'), 'heure_fin_communiquee', 'Fin de journée communiquée'],
      ['V.3', 'heure de début vidée', (b) => { b.champ('heure_debut').value = ''; }, 'heure_debut', 'Renseigne l\'heure de début'],
      ['V.4', 'fin vidée en mode manuel', (b) => { b.saisir({ heure_fin_auto: false }); b.champ('heure_fin').value = ''; }, 'heure_fin', 'Renseigne l\'heure de fin'],
      ['V.5', 'durée négative', (b) => { b.champ('pause_dejeuner_duree_min').value = '-5'; }, 'pause_dejeuner_duree_min', 'Pause déjeuner — durée'],
      ['V.6', 'durée au-delà d\'une journée', (b) => { b.champ('marge_fin_communiquee_min').value = '1441'; }, 'marge_fin_communiquee_min', 'Clôture'],
      ['V.7', 'durée non entière', (b) => { b.champ('battement_terrain_min').value = '7.5'; }, 'battement_terrain_min', 'Battement']
    ];
    for (const [code, libelle, faire, champ, texte] of cas) {
      const b = await banc();
      faire(b);
      const g = await b.cliquer();
      const c = b.champ(champ);
      const panneau = c.closest('details');
      t.vrai(g.requetes.length === 0 && b.message().indexOf(texte) !== -1 && b.doc.activeElement === c && (!panneau || panneau.open),
        code + ' ' + libelle + ' : 0 requête, message qui nomme le champ, panneau ouvert, focus sur le champ',
        { req: g.resume, msg: b.message(), focus: b.doc.activeElement && b.doc.activeElement.name });
    }
    const b = await banc();
    b.champ('battement_terrain_min').value = '-5';
    await b.cliquer();
    b.champ('battement_terrain_min').value = '2';
    const g = await b.cliquer();
    t.vrai(g.requetes.length === 1 && b.srv.global().battement_terrain_min === '2',
      'V.8 ⭐ correction puis enregistrement : 2 min (valeur que l\'arbitrage propose) est acceptée', { r: g.resume, v: b.srv.global().battement_terrain_min });
  }

  /* ============================== E — enregistrement ============================== */
  console.log('\nE — enregistrement');
  {
    const b = await banc();
    b.saisir({ heure_debut: '10:30' });
    const revision = b.ctx.autorisationRevision;
    const g = await b.cliquer();
    const envoi = g.requetes[0];
    t.vrai(g.requetes.length === 1 && g.attendues.length === 1 && g.fond.length === 0 && envoi.action === 'enregistrerHoraires',
      'E.1 ⭐ un clic = UNE requête attendue, aucune en arrière-plan (' + g.resume + ')', g.resume);
    t.vrai(JSON.stringify(Object.keys(envoi.corps).filter((k) => k !== 'action' && k !== 'cle')) === JSON.stringify(CHAMPS),
      'E.1 bis la requête porte l\'état FINAL des dix champs, dans l\'ordre d\'avant', Object.keys(envoi.corps));
    t.vrai(envoi.delaiMs === 30000, 'E.1 ter l\'écriture est bornée (30 s) : le bouton ne peut plus rester occupé indéfiniment', envoi.delaiMs);
    t.vrai(b.message() === '✅ Horaires enregistrés.' && b.ctx.configCourante.global.heure_debut === '10:30' && !b.bouton().disabled,
      'E.2 message de succès, configuration en mémoire à jour depuis la réponse, bouton libéré', b.message());
    t.vrai(/10:30/.test(b.doc.getElementById('cv-frise-horaires').textContent), 'E.3 l\'aperçu suit la valeur enregistrée');
    t.vrai(!b.doc.getElementById('bouton-recalculer-horaires').hidden,
      'E.4 ⭐ le bouton « Recalculer les horaires » apparaît aussitôt (il attendait le rechargement de la page)');
    t.vrai(b.ctx.autorisationRevision > revision, 'E.5 heure de début changée : la feuille d\'autorisation (qui la lit) est déclarée périmée');
    t.vrai(b.ctx.__propres >= 1, 'E.6 valeurs enregistrées : l\'assistant reprend sa photo (plus de saisie en attente)');
    console.log('    (attente estimée par le modèle : ' + s(g.attenteMs) + ', verrou ' + s(g.verrouMs) + ')');

    const r2 = b.ctx.autorisationRevision;
    const d = await b.cliquer();
    t.vrai(d.requetes.length === 1 && /^✅ Déjà à jour/.test(b.message()) && b.ctx.autorisationRevision === r2,
      'E.7 ⭐ second clic sans changement : 1 requête, « Déjà à jour », rien de déclaré périmé', { r: d.resume, m: b.message() });
    b.saisir({ pause_dejeuner_duree_min: '75' });
    const r3 = b.ctx.autorisationRevision;
    await b.cliquer();
    t.vrai(b.ctx.autorisationRevision === r3, 'E.8 seule la durée de pause change : la feuille d\'autorisation (qui ne la lit pas) reste valide');
  }
  {
    const b = await banc();
    b.saisir({ heure_rdv: '08:30' });
    const g = await b.jouer(() => { b.soumettre(); b.soumettre(); if (!b.bouton().disabled) b.soumettre(); });
    t.vrai(g.requetes.length === 1, 'E.9 double clic / Entrée répétée : une seule requête', g.resume);
    const e = await b.jouer(() => b.soumettre(), async () => { b.soumettre(); });
    t.vrai(e.requetes.length === 1, 'E.10 Entrée pendant l\'envoi : ignorée', e.resume);
  }
  {
    const b = await banc();
    b.saisir({ heure_debut: '10:45' });
    const g = await b.jouer(() => b.soumettre(), async () => { b.saisir({ battement_terrain_min: '8' }); });
    t.vrai(g.requetes.length === 1 && b.srv.global().battement_terrain_min === '3' && b.champ('battement_terrain_min').value === '8' &&
      /pas encore enregistré : Battement/.test(b.message()) && !b.ctx.__propres,
      'E.11 ⭐ modifié PENDANT l\'envoi : reste une saisie en cours, le message le dit, jamais marqué « enregistré »', { m: b.message(), p: b.ctx.__propres });
    b.ctx.injecterReglages(b.ctx.configCourante.global, []);
    t.vrai(b.champ('battement_terrain_min').value === '8', 'E.11 bis … et une relecture ultérieure ne l\'efface pas', b.champ('battement_terrain_min').value);
  }
  for (const [code, panne, libelle] of [['E.12', '404', '404 de Google après exécution'], ['E.13', 'delai', 'délai dépassé'], ['E.14', 'reseau-apres', 'connexion coupée après exécution']]) {
    let n = 0;
    const b = await banc({ panne: (e) => (e.action === 'enregistrerHoraires' && ++n === 1 ? panne : null) });
    b.saisir({ heure_debut: '11:15' });
    const rev = b.ctx.autorisationRevision;
    const g = await b.cliquer();
    t.vrai(g.requetes.length === 1 && b.srv.global().heure_debut === '11:15' && /^⚠️ Enregistrement non confirmé/.test(b.message()) &&
      b.champ('heure_debut').value === '11:15' && b.ctx.configCourante.global.heure_debut === '10:00' && b.ctx.autorisationRevision > rev,
      code + ' ⭐ réponse perdue (' + libelle + ') : AUCUN renvoi, « non confirmé », saisie gardée, feuille d\'autorisation tenue pour périmée',
      { r: g.resume, m: b.message(), cfg: b.ctx.configCourante.global.heure_debut });
    const h = await b.cliquer();
    t.vrai(h.requetes.length === 1 && Array.isArray(h.requetes[0].reponse.modifies) && h.requetes[0].reponse.modifies.length === 0 &&
      b.message() === '✅ Horaires enregistrés.' &&
      b.ctx.configCourante.global.heure_debut === '11:15',
      code + ' bis nouveau clic : le serveur ne réécrit rien (écriture déjà faite), l\'écran se recale et dit « enregistrés » — pas « rien n\'a changé »',
      { m: b.message(), r: h.requetes.map((q) => q.reponse && q.reponse.modifies) });
  }
  {
    let n = 0;
    const b = await banc({ panne: (e) => (e.action === 'enregistrerHoraires' && ++n === 1 ? 'reseau-avant' : null) });
    b.saisir({ heure_debut: '11:20' });
    const g = await b.cliquer();
    t.vrai(g.requetes.length === 1 && b.srv.global().heure_debut === '10:00' && /^⚠️ Enregistrement non confirmé/.test(b.message()),
      'E.15 erreur réseau avant exécution : rien d\'écrit, aucun renvoi, le message le dit', b.message());
  }
  {
    const b = await banc();
    const lock = b.srv.contexte.LockService.getScriptLock;
    b.srv.contexte.LockService.getScriptLock = () => Object.assign({}, lock(), { tryLock: () => false });
    b.saisir({ heure_debut: '11:25' });
    const g = await b.cliquer();
    b.srv.contexte.LockService.getScriptLock = lock;
    t.vrai(g.requetes.length === 1 && /occupé/.test(b.message()) && b.champ('heure_debut').value === '11:25' && b.srv.global().heure_debut === '10:00',
      'E.16 refus du serveur (verrou occupé) : message du serveur, saisie gardée, rien d\'écrit', b.message());
  }
  {
    const b = await banc({ panne: (e) => (e.action === 'enregistrerHoraires' ? 'partielle' : null) });
    b.saisir({ heure_debut: '11:40' });
    const g = await b.cliquer();
    t.vrai(g.requetes.length === 1 && b.message() === '✅ Horaires enregistrés.' && b.ctx.configCourante.global.heure_debut === '11:40',
      'E.17 réponse au contrat mais incomplète : valeurs envoyées appliquées, aucune relecture', { r: g.resume, m: b.message() });
  }
  {
    const code = fs.readFileSync(path.join(B.BACKEND, 'Code.gs'), 'utf8');
    const corps = B.extrait(code, 'getDossierAutorisation') + B.extrait(code, 'assemblerDossierAutorisation');
    const sansImpact = JS('admin-autorisation.js').match(/enregistrerHoraires:\s*\[([^\]]*)\]/);
    const liste = sansImpact ? sansImpact[1].match(/'[\w]+'/g).map((x) => x.slice(1, -1)) : [];
    t.vrai(liste.length === 8 && liste.every((c) => corps.indexOf(c) === -1) && /heure_debut/.test(corps),
      'E.18 garde : aucun champ déclaré « sans impact » n\'est lu par la feuille d\'autorisation (vrai Code.gs)', liste);
  }

  /* ============================== R — relectures lancées ailleurs ============================== */
  console.log('\nR — relectures lancées ailleurs pendant une saisie');
  {
    const b = await banc();
    const f0 = b.form();
    b.ctx.injecterReglages(b.ctx.configCourante.global, []);
    t.vrai(b.form() !== f0 && b.form().heure_debut.value === '10:00', 'R.1 sans saisie en cours : rendu complet, comme avant');
    b.doc.querySelectorAll('#zone-horaires details')[1].open = true;
    b.ctx.injecterReglages(b.ctx.configCourante.global, []);
    t.vrai(b.doc.querySelectorAll('#zone-horaires details')[1].open, 'R.2 un panneau ouvert le reste après le rendu');
  }
  {
    const b = await banc();
    const f0 = b.form();
    b.saisir({ heure_debut: '11:00', heure_fin_communiquee: '18:30' });
    b.srv.poser('pause_dejeuner_debut', '12:40');             // changement fait ailleurs (autre étape, autre appareil)
    const g = await b.jouer(() => b.ctx.rechargerEtRendre({ reglages: true }));
    t.vrai(g.requetes.map((r) => r.action).join() === 'getAll,getConfigAdmin' && b.form() === f0 &&
      b.champ('heure_debut').value === '11:00' && b.champ('heure_fin_communiquee').value === '18:30' && b.champ('pause_dejeuner_debut').value === '12:40' &&
      /Saisie non enregistrée conservée/.test(b.message()),
      'R.3 ⭐ relecture des réglages (génération, terrains, catégorie ajoutée…) : saisie GARDÉE, champs non touchés rafraîchis, message',
      { r: g.resume, v: [b.champ('heure_debut').value, b.champ('heure_fin_communiquee').value, b.champ('pause_dejeuner_debut').value], m: b.message() });
    const e = await b.cliquer();
    t.vrai(e.requetes.length === 1 && b.srv.global().heure_debut === '11:00' && b.srv.global().pause_dejeuner_debut === '12:40',
      'R.4 puis « Enregistrer » : la saisie ET la valeur relue partent ensemble (rien de l\'autre étape n\'est défait)', b.srv.global());
  }
  {
    const b = await banc();
    b.saisir({ heure_debut: '11:05' });
    const g = b.ctx.configCourante.global;
    b.ctx.injecterReglages(Object.assign({}, g, { heure_debut: '', battement_terrain_min: '' }), []);   // ex. réinitialisation
    t.vrai(b.champ('heure_debut').value === '' && /Valeur enregistrée entre-temps reprise pour : Début des matchs/.test(b.message()),
      'R.5 le serveur a changé CE champ entre-temps (réinitialisation, arbitrage) : sa valeur l\'emporte, et c\'est dit', b.message());
  }
  {
    const b = await banc();
    const champ = b.champ('heure_debut');
    champ.focus();
    b.illisible('heure_debut');                                  // « 1 1 : _ _ » en cours de frappe
    b.ctx.injecterReglages(Object.assign({}, b.ctx.configCourante.global, { heure_debut: '09:00' }), []);
    t.vrai(b.champ('heure_debut') === champ && champ.validity.badInput && b.doc.activeElement === champ,
      'R.6 ⭐ frappe en cours : le champ qui a le focus n\'est JAMAIS touché (ni valeur, ni focus)');
  }
  {
    const b = await banc();
    b.saisir({ heure_debut: '11:50' });
    const bouton = b.bouton();
    let pendant = null;
    const g = await b.jouer(() => b.soumettre(), async () => {
      b.ctx.injecterReglages(b.ctx.configCourante.global, []);
      pendant = { meme: b.bouton() === bouton, occupe: b.bouton().disabled };
    });
    t.vrai(pendant && pendant.meme && pendant.occupe && g.requetes.length === 1 && !b.bouton().disabled && b.message() === '✅ Horaires enregistrés.',
      'R.7 relecture PENDANT l\'envoi : carte non reconstruite, bouton toujours occupé (pas de second envoi possible)', pendant);
  }

  /* ============================== X — compatibilité ============================== */
  console.log('\nX — compatibilité entre versions');
  const scenario = async (o) => {
    const b = await banc(o);
    b.saisir({ heure_debut: '10:35' });
    const g = await b.cliquer();
    return { b, g, ok: g.requetes.length === 1 && /^✅ Horaires enregistrés/.test(b.message()) && b.srv.global().heure_debut === '10:35' &&
      b.ctx.configCourante.global.heure_debut === '10:35' };
  };
  {
    const a = await scenario({ backend: B.BACKEND_AVANT() });
    t.vrai(a.ok && !a.g.requetes[0].reponse.contrat, 'X.1 nouveau frontend + ANCIEN backend (5fee619) : 1 requête, valeurs envoyées appliquées', a.g.resume);
    const c = await scenario({ js: B.JS_AVANT });
    t.vrai(c.ok && c.g.requetes[0].reponse.contrat === 'ecriture-v1', 'X.2 ANCIEN frontend (1201fcb) + nouveau backend : parcours historique, 1 requête', c.g.resume);
    for (const [code, fichiers] of [['X.3', ['admin.js']], ['X.4', ['admin-autorisation.js']], ['X.5', ['admin-tableau-bord.js', 'admin-generation.js']],
      ['X.6', ['admin-reglages.js']]]) {
      const m = await scenario({ js: B.lecteurMele(fichiers) });
      t.vrai(m.ok, code + ' cache mêlé — ' + fichiers.join(', ') + ' d\'avant, le reste d\'après : 1 requête, succès', m.g.resume);
    }
    const r = await scenario({ panne: (e) => (e.action === 'enregistrerHoraires' ? 'ancienne' : null) });
    t.vrai(r.ok && !/Déjà à jour/.test(r.b.message()), 'X.7 réponse sans contrat (backend d\'avant) : succès, jamais « Déjà à jour » sans preuve', r.b.message());
  }

  console.log('\n' + (process.exitCode ? 'ÉCHEC' : 'OK — ' + t.n + ' contrôles de l\'écran « Horaires » passés.'));
})().catch((e) => { console.error(e); process.exitCode = 1; });
