#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  HORAIRE-01 — « Début des matchs » avant « Accueil des équipes » dans « Horaires principaux »
 * ============================================================================
 *  ▶ node tests/horaire-01.test.js
 *
 *  Le lot ne change QUE l'ordre de saisie du formulaire (afficherHoraires). Tout le reste est tenu ici :
 *    O — ordre du formulaire : les deux champs permutés, les autres dans leur ordre relatif d'avant ;
 *    C — champs : identifiants, noms, types, libellés et valeurs affichées inchangés ;
 *    S — sauvegarde : même contrat (UNE requête `enregistrerHoraires`, mêmes clés, même ordre d'envoi), et
 *        après rechargement chaque valeur revient dans SON champ (vrais modules contre le vrai Code.gs) ;
 *    F — frises : l'aperçu de l'admin, la frise des pages club (invitation, dossier) et celle du mail/dossier
 *        final gardent EXACTEMENT leur ordre — elles lisent leurs propres repères, pas le formulaire.
 *  ⛔ Aucun réseau, aucun service Google réel ; tournoi fictif.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('./banc-ecran-horaires');

const t = B.compteur();
const lire = (rel) => fs.readFileSync(path.join(B.RACINE, rel), 'utf8');

/* Ordre du formulaire AVANT ce lot (ce07699), relevé dans Chromium et dans le rendu. */
const ORDRE_AVANT = ['heure_rdv', 'heure_debut', 'pause_echelonnee', 'pause_dejeuner_debut', 'pause_dejeuner_duree_min',
  'marge_fin_communiquee_min', 'battement_terrain_min', 'heure_fin_auto', 'heure_fin', 'heure_fin_communiquee'];
/* Ordre d'ENVOI (CHAMPS_FORMULAIRE_HORAIRES) : il ne dépend pas de l'ordre d'affichage et ne bouge pas. */
const ENVOI = ['heure_debut', 'heure_rdv', 'heure_fin', 'heure_fin_auto', 'heure_fin_communiquee', 'marge_fin_communiquee_min',
  'battement_terrain_min', 'pause_dejeuner_debut', 'pause_dejeuner_duree_min', 'pause_echelonnee'];
const sansLesDeux = (l) => l.filter((n) => n !== 'heure_debut' && n !== 'heure_rdv');

/** Bac isolé chargeant les vraies sources, DOM réduit au strict nécessaire (les frises ne touchent pas au DOM). */
function bac(fichiers) {
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {}, info() {} }, URL, URLSearchParams, setTimeout, clearTimeout,
    window: { location: { href: 'https://organisateur.exemple.invalid/admin.html', search: '', hostname: 'organisateur.exemple.invalid' }, addEventListener() {} },
    location: { href: 'https://organisateur.exemple.invalid/admin.html', search: '', hostname: 'organisateur.exemple.invalid' },
    document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  });
  fichiers.forEach((f) => vm.runInContext(lire(f), ctx, { filename: f }));
  return ctx;
}

(async () => {
  /* ============================== O — ordre du formulaire ============================== */
  console.log('\nO — ordre du formulaire « Horaires principaux »');
  const b = await B.banc();
  const form = b.form();
  const noms = form.querySelectorAll('input').map((c) => c.name);
  t.vrai(noms.indexOf('heure_debut') !== -1 && noms.indexOf('heure_debut') < noms.indexOf('heure_rdv'),
    'O.1 ⭐ « Début des matchs » est AVANT « Accueil des équipes » dans le DOM', noms);
  t.vrai(noms.indexOf('heure_debut') === 0 && noms.indexOf('heure_rdv') === 1, 'O.2 ils ouvrent le formulaire, côte à côte (début, puis accueil)', noms);
  t.vrai(JSON.stringify(sansLesDeux(noms)) === JSON.stringify(sansLesDeux(ORDRE_AVANT)),
    'O.3 les huit autres champs gardent leur ordre relatif d\'avant', noms);
  const libelles = form.querySelectorAll('label').map((l) => l.getAttribute('for')).filter(Boolean);
  t.vrai(libelles.indexOf('h-heure_debut') < libelles.indexOf('h-heure_rdv'), 'O.4 les libellés suivent le même ordre', libelles);
  const html = b.ctx.afficherHoraires(b.ctx.configCourante.global);
  t.vrai(html.indexOf('name="heure_debut"') < html.indexOf('name="heure_rdv"') &&
    html.indexOf('name="heure_rdv"') < html.indexOf('name="pause_echelonnee"'), 'O.5 le balisage rendu porte le nouvel ordre (aucun CSS ne réordonne)');

  /* ============================== C — champs inchangés ============================== */
  console.log('\nC — identifiants, noms, libellés, valeurs');
  for (const [nom, libelle] of [['heure_debut', 'Début des matchs'], ['heure_rdv', 'Accueil des équipes']]) {
    const c = b.champ(nom);
    const l = form.querySelectorAll('label').find((x) => x.getAttribute('for') === 'h-' + nom);
    t.vrai(c && c.id === 'h-' + nom && c.name === nom && c.type === 'time' && l && l.textContent.trim() === libelle,
      'C.1 ' + nom + ' : id « h-' + nom + ' », name « ' + nom + ' », type time, libellé « ' + libelle + ' »', c && { id: c.id, name: c.name, type: c.type });
  }
  const g0 = b.srv.global();
  t.vrai(b.champ('heure_debut').value === String(g0.heure_debut) && b.champ('heure_rdv').value === String(g0.heure_rdv) &&
    g0.heure_debut !== g0.heure_rdv, 'C.2 chaque valeur enregistrée est affichée dans SON champ', { debut: b.champ('heure_debut').value, rdv: b.champ('heure_rdv').value, g0: [g0.heure_debut, g0.heure_rdv] });
  t.vrai(JSON.stringify(vm.runInContext('CHAMPS_FORMULAIRE_HORAIRES', b.ctx)) === JSON.stringify(ENVOI),
    'C.3 l\'ordre d\'ENVOI (CHAMPS_FORMULAIRE_HORAIRES) est inchangé');
  const lib = vm.runInContext('LIBELLES_HORAIRES', b.ctx);
  t.vrai(lib.heure_debut === 'Début des matchs' && lib.heure_rdv === 'Accueil des équipes', 'C.4 libellés des messages inchangés');
  b.champ('heure_rdv').value = '';
  b.saisir({ heure_debut: '09:00' });
  t.vrai(b.champ('heure_rdv').value === '07:45', 'C.5 pré-remplissage conservé : accueil vide ⇒ début − 1 h 15', b.champ('heure_rdv').value);
  b.champ('heure_debut').value = '';
  const v = await b.cliquer();
  t.vrai(v.requetes.length === 0 && /Renseigne l'heure de début/.test(b.message()) && b.doc.activeElement === b.champ('heure_debut'),
    'C.6 validation conservée : début vidé ⇒ 0 requête, message, focus sur « Début des matchs »', b.message());

  /* ============================== S — sauvegarde et rechargement ============================== */
  console.log('\nS — contrat de sauvegarde et rechargement');
  for (const [code, champs] of [['S.1', { heure_debut: '09:40' }], ['S.2', { heure_rdv: '08:05' }], ['S.3', { heure_debut: '10:20', heure_rdv: '09:10' }]]) {
    const s = await B.banc();
    const avant = s.srv.global();
    s.saisir(champs);
    const g = await s.cliquer();
    const req = g.requetes[0];
    const corps = req && req.corps;
    const attendu = Object.assign({ heure_debut: String(avant.heure_debut), heure_rdv: String(avant.heure_rdv) }, champs);
    t.vrai(g.requetes.length === 1 && req.action === 'enregistrerHoraires' &&
      JSON.stringify(Object.keys(corps).filter((k) => k !== 'action' && k !== 'cle')) === JSON.stringify(ENVOI) &&
      corps.heure_debut === attendu.heure_debut && corps.heure_rdv === attendu.heure_rdv && /^✅ Horaires enregistrés/.test(s.message()),
      code + ' ' + Object.keys(champs).join(' + ') + ' : UNE requête enregistrerHoraires, mêmes clés dans le même ordre, valeur sous SA clé', { resume: g.resume, corps });
    const apres = s.srv.global();
    t.vrai(String(apres.heure_debut) === attendu.heure_debut && String(apres.heure_rdv) === attendu.heure_rdv,
      code + ' serveur : heure_debut = ' + attendu.heure_debut + ', heure_rdv = ' + attendu.heure_rdv, [apres.heure_debut, apres.heure_rdv]);
    // Rechargement : un NOUVEL onglet sur le même classeur relit la configuration et rend la carte.
    const r = B.navigateur(s.srv, B.lecteurJs(), {});
    await r.charger();
    t.vrai(r.champ('heure_debut').value === attendu.heure_debut && r.champ('heure_rdv').value === attendu.heure_rdv,
      code + ' après rechargement : chaque valeur revient dans SON champ', { debut: r.champ('heure_debut').value, rdv: r.champ('heure_rdv').value });
  }

  /* ============================== F — frises ============================== */
  console.log('\nF — frises (ordre strictement inchangé)');
  const titres = (html, re) => { const o = []; let m; while ((m = re.exec(html)) !== null) o.push(m[1] + ' ' + m[2]); return o; };
  const FRISE_ADMIN = /<li><strong>([^<]*)<\/strong><span>([^<]*)<\/span><\/li>/g;
  const friseAdmin = b.ctx.friseHorairesCiel(g0, b.ctx.matchsCourants);
  t.vrai(JSON.stringify(titres(friseAdmin, FRISE_ADMIN)) ===
    JSON.stringify(['08:45 Accueil des équipes', '10:00 Premiers matchs', '12:15 Pause déjeuner', '13:45 Reprise', '16:12 Fin des matchs prévue']) &&
    b.doc.getElementById('cv-frise-horaires').textContent === friseAdmin.replace(/<[^>]+>/g, ''),
    'F.1 ⭐ aperçu de l\'admin (monde fictif, carte rendue) : Accueil, Premiers matchs, Pause, Reprise, Fin — ordre d\'avant',
    titres(friseAdmin, FRISE_ADMIN));
  const G = { heure_rdv: '08:45', heure_debut: '10:00', heure_fin: '16:12', heure_fin_auto: 'oui', pause_dejeuner_debut: '12:15',
    pause_dejeuner_duree_min: '90', heure_fin_communiquee: '', marge_fin_communiquee_min: '45', pause_echelonnee: 'non' };
  t.vrai(JSON.stringify(b.ctx.reperesHorairesCiel(G, []).etapes.map((e) => e[0])) ===
    JSON.stringify(['Accueil des équipes', 'Premiers matchs', 'Pause déjeuner', 'Reprise', 'Fin des matchs prévue']),
    'F.2 repères de l\'aperçu (reperesHorairesCiel) : ordre d\'avant');
  t.vrai(JSON.stringify(titres(b.ctx.friseHorairesCiel(Object.assign({}, G, { heure_rdv: '10:30' }), []), FRISE_ADMIN)) ===
    JSON.stringify(['10:00 Premiers matchs', '10:30 Accueil des équipes', '12:15 Pause déjeuner', '13:45 Reprise', '16:12 Fin des matchs prévue']),
    'F.3 l\'aperçu reste trié par HEURE (accueil après le début : rangé après, comme avant)');
  const admin = bac(['js/commun.js', 'js/admin.js', 'js/admin-infos-publication.js', 'js/admin-invitations.js']);
  const club = bac(['js/commun.js', 'js/commun-dossier.js']);
  const CATS = [{ categorie: 'U10', presente: 'oui' }, { categorie: 'U12', presente: 'oui' }];
  const FRISE_CLUB = /<span class="inv-frise-heure">([^<]*)<\/span><span class="inv-frise-titre">([^<]*)<\/span>/g;
  const ORDRE_CLUB = ['08:45 Accueil des équipes', '10:00 Coup d&#39;envoi', '12:15 Pause méridienne', '13:45 Reprise', '16:57 Fin envisagée'];
  t.vrai(JSON.stringify(titres(club.friseJournee(G, CATS), FRISE_CLUB)) === JSON.stringify(ORDRE_CLUB),
    'F.4 ⭐ frise des pages club (friseJournee : invitation, dossier club) : ordre d\'avant', titres(club.friseJournee(G, CATS), FRISE_CLUB));
  t.vrai(JSON.stringify(admin.etapesJourneeEmail(G, CATS).map((e) => e.h + ' ' + e.t)) ===
    JSON.stringify(['08:45 Accueil des équipes', '10:00 Coup d\'envoi', '12:15 Pause méridienne', '13:45 Reprise', '16:57 Fin envisagée']),
    'F.5 ⭐ frise du mail / dossier final (etapesJourneeEmail) : ordre d\'avant');
  const inverse = Object.assign({}, G, { heure_rdv: '10:30' });
  t.vrai(titres(club.friseJournee(inverse, CATS), FRISE_CLUB)[0] === '10:30 Accueil des équipes' &&
    admin.etapesJourneeEmail(inverse, CATS)[0].t === 'Accueil des équipes',
    'F.6 frises club et mail : ordre FIXE des étapes (non trié), accueil toujours en tête, comme avant');
  t.vrai(['js/commun-dossier.js', 'js/admin-invitations.js', 'js/invitation.js', 'js/dossier.js'].every((f) =>
    !/afficherHoraires|form-horaires|CHAMPS_FORMULAIRE_HORAIRES/.test(lire(f))),
    'F.7 aucune frise ne lit le formulaire des horaires : leur ordre ne peut pas suivre celui de la saisie');

  console.log('\n' + (process.exitCode ? 'ÉCHEC' : 'OK — ' + t.n + ' contrôles HORAIRE-01 passés.'));
})().catch((e) => { console.error(e); process.exitCode = 1; });
