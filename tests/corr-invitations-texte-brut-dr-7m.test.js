/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — la version TEXTE de l'invitation dit tout l'essentiel
 *  Chantier CORR-INVITATIONS-TEXTE-BRUT-DR-7M
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/corr-invitations-texte-brut-dr-7m.test.js
 *    (Node seul — aucun navigateur, aucun réseau, aucun stockage, AUCUN fichier écrit)
 *
 *  CE QU'IL PROTÈGE — l'invitation Phase 1 part en HTML AVEC une version texte de repli
 *  (clients sans HTML, filtres anti-spam). L'audit DR-7L a prouvé que ce texte arrive TEL QUEL
 *  au transport (seuls les trois jetons sont remplacés), mais qu'il perdait ce que l'email HTML
 *  et la vitrine donnent :
 *
 *   ① I — l'identité du tournoi : nom, date, lieu (le nom ne passait que par l'intro éditable) ;
 *   ② R — les liens de règlement ;
 *   ③ A — l'explication du format d'après-midi (seul son libellé restait) ;
 *   ④ P — la durée de la pause méridienne, l'heure de reprise et les notes de la frise ;
 *   et tout le reste du texte ne doit pas bouger : J (journée), S (Super Challenge), N (le reste).
 *
 *  ⭐ CODE RÉEL : js/commun.js, js/admin.js, js/admin-infos-publication.js et
 *  js/admin-invitations.js sont chargés entiers dans un bac Node isolé. ⛔ Rien n'est recopié.
 *
 *  ⚠️ La PERSONNALISATION (les trois jetons remplacés par destinataire) est faite par le backend
 *  (`personnaliserInvitation`, mode texte), hors de ce dépôt. Ce banc applique son contrat — trois
 *  remplacements littéraux, rien d'autre — pour vérifier qu'aucun jeton ne peut subsister.
 *
 *  ⭐ AUTO-PREUVE (§ M) : quatre mutants retirent CHACUN une des corrections. Chacun doit faire
 *  échouer la famille qui la protège, et elle seule — sans quoi ce fichier ÉCHOUE.
 *
 *  ⚠️ Toutes les données (tournoi, clubs, contacts, liens) sont FICTIVES.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const SOURCE_INVITATIONS = lire('js/admin-invitations.js');

let reussis = 0;
const echecs = [];
function verifier(condition, libelle) {
  if (condition) { reussis++; console.log('  ✓ ' + libelle); }
  else { echecs.push(libelle); console.log('  ✗ ' + libelle); }
}

/** Charge les vraies sources de l'admin dans un bac isolé : DOM minimal, ni réseau ni stockage. */
function charger(sourceInvitations) {
  const dom = {};
  const bac = vm.createContext({
    console, URL, URLSearchParams,
    window: { location: { href: 'https://organisateur.exemple.invalid/demo/admin.html', search: '' }, addEventListener() {} },
    document: {
      getElementById: (id) => dom[id] || null, addEventListener() {},
      querySelector: () => null, querySelectorAll: () => []
    }
  });
  vm.runInContext(lire('js/commun.js'), bac, { filename: 'js/commun.js' });
  vm.runInContext(lire('js/admin.js'), bac, { filename: 'js/admin.js' });
  vm.runInContext(lire('js/admin-infos-publication.js'), bac, { filename: 'js/admin-infos-publication.js' });
  vm.runInContext(sourceInvitations, bac, { filename: 'js/admin-invitations.js' });
  return { bac, dom };
}

/* Configuration FICTIVE : U10 et U12 ordinaires, U14 Super Challenge P3, U16 non présente. */
const CONFIG = {
  global: {
    tournoi_nom: 'Tournoi Démo 7M', tournoi_date: '2027-03-13', tournoi_lieu: 'Stade Démo, Villeneuve-Test',
    tournoi_description: 'Première ligne du descriptif fictif.\nSeconde ligne : remise des trophées.',
    tournoi_affiche_id: '',
    heure_rdv: '08:30', heure_debut: '09:15', pause_dejeuner_debut: '12:00', pause_dejeuner_duree_min: '60',
    heure_fin: '16:30', heure_fin_communiquee: '', marge_fin_communiquee_min: '75',
    buvette_disponible: 'oui', espace_sandwich_disponible: 'oui', boutique_disponible: 'non',
    tarif_engagement_oui: 'oui', tarif_engagement_montant: '20 € par équipe',
    date_limite_reponse: '2027-02-15', date_limite_confirmation: '2027-03-01',
    contact_reponse_nom: 'Alex Démo', contact_reponse_tel: '0600000000', contact_reponse_email: 'contact@exemple.invalid'
  },
  categories: [
    { categorie: 'U12', presente: 'oui', forme_jeu: 'RE — 10x10', format_mi_temps: '2', duree_mi_temps_min: '12',
      pause_mi_temps_min: '2', recup_entre_matchs_min: '8', effectif_min: '10', effectif_max: '14',
      max_equipes_par_club: '1', arbitrage_organisation: 'Arbitres fédéraux', reglement: 'Règlement EDR FFR 2026-2027',
      format_apresmidi: 'CROISE', contexte_tournoi: '', scf_phase: '' },
    { categorie: 'U10', presente: 'oui', forme_jeu: 'RE — 7x7', format_mi_temps: '2', duree_mi_temps_min: '10',
      pause_mi_temps_min: '2', recup_entre_matchs_min: '10', effectif_min: '7', effectif_max: '10',
      max_equipes_par_club: '2', arbitrage_organisation: 'Éducateurs des clubs',
      reglement: 'https://reglement.exemple.invalid/u10.pdf', format_apresmidi: 'POULES_NIVEAU', contexte_tournoi: '', scf_phase: '' },
    { categorie: 'U14', presente: 'oui', forme_jeu: 'Jeu à XV — 15x15', format_mi_temps: '2', duree_mi_temps_min: '12',
      pause_mi_temps_min: '3', recup_entre_matchs_min: '15', effectif_min: '18', effectif_max: '23',
      max_equipes_par_club: '1', arbitrage_organisation: 'Arbitres de ligue',
      reglement: 'https://reglement.exemple.invalid/scf.pdf', format_apresmidi: 'CROISE', contexte_tournoi: 'SCF', scf_phase: 'P3' },
    { categorie: 'U16', presente: 'non', forme_jeu: 'NE DOIT PAS SORTIR', duree_mi_temps_min: '15' }
  ]
};
const INTRO = 'Intro neutre fixe.';
const URL_U10 = 'https://reglement.exemple.invalid/u10.pdf';
const URL_SCF = 'https://reglement.exemple.invalid/scf.pdf';

/* Lignes sportives d'AVANT la correction (sans URL de règlement) : elles ne doivent pas bouger. */
const LIGNE_U10 = '- U10 : RE — 7x7 · jusqu\'à 2 équipe(s)/club · 2 × 10 min (pause 2 min) · récup 10 min · ' +
  '7 à 10 joueurs · arbitrage : Éducateurs des clubs · après-midi : Poules de niveau';
const LIGNE_U12 = '- U12 : RE — 10x10 · jusqu\'à 1 équipe(s)/club · 2 × 12 min (pause 2 min) · récup 8 min · ' +
  '10 à 14 joueurs · arbitrage : Arbitres fédéraux · après-midi : Classement croisé';
const LIGNE_U14_P3 = '- U14 : Jeu à XV · Super Challenge de France · jusqu\'à 1 équipe(s)/club · 2 × 11 min (pause 3 min) · ' +
  'récup 15 min · 18 à 23 joueurs · arbitrage : Arbitres de ligue · samedi triangulaires · dimanche brassage par niveau';
const LIGNE_U14_P2 = '- U14 : Jeu à XV · Super Challenge de France · jusqu\'à 1 équipe(s)/club · 2 × 15 min (pause 3 min) · ' +
  'récup 15 min · 18 à 23 joueurs · arbitrage : Arbitres de ligue · plateau en triangulaires / quadrangulaires';

/* ---- outils ---------------------------------------------------------------- */

const copie = (o) => JSON.parse(JSON.stringify(o));
function avec(modif, depart) { const c = copie(depart || CONFIG); modif(c); return c; }
const SANS_URL = avec((c) => { c.categories.forEach((x) => { if (/https?:/.test(x.reglement || '')) x.reglement = ''; }); });

/** Pose l'état de l'admin (config + intro de l'aperçu), comme le fait la page. */
function etat(b, cfg, intro) {
  b.bac.__cfg = copie(cfg);
  vm.runInContext('configCourante = __cfg;', b.bac);
  b.dom['apercu-invitation-intro'] = { value: intro == null ? INTRO : intro };
}
/** Le modèle TEXTE réellement envoyé au backend (texteModeleInvitation), jetons compris. */
function texte(b, cfg, intro) { etat(b, cfg, intro); return b.bac.texteModeleInvitation(); }
/** Le modèle HTML réellement envoyé au backend (htmlModeleInvitation). */
function html(b, cfg, intro) { etat(b, cfg, intro); return b.bac.htmlModeleInvitation(); }

const lignes = (t) => String(t).split('\n');
const ligneCat = (t, cat) => lignes(t).find((l) => l.indexOf('- ' + cat + ' : ') === 0) || '';
function ligneApres(t, l0) {
  if (!l0) return null;
  const ls = lignes(t), i = ls.indexOf(l0);
  return i === -1 ? null : ls[i + 1];
}
/** Le bloc « LA JOURNÉE » : de son titre jusqu'à la première ligne vide. */
function bloc(t) {
  const ls = lignes(t), i = ls.findIndex((l) => l.indexOf('LA JOURNÉE') === 0);
  if (i === -1) return [];
  const j = ls.indexOf('', i);
  return ls.slice(i, j === -1 ? ls.length : j);
}
const ligneAvec = (t, ...morceaux) => bloc(t).some((l) => morceaux.every((m) => l.indexOf(m) !== -1));
const sansOrphelin = (t) => !lignes(t).some((l) => /^\s*[·—]|[·—]\s*$/.test(l)) && t.indexOf('· ·') === -1 && t.indexOf('— ·') === -1;
const lisible = (h) => String(h).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#39;/g, '\'')
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#96;/g, '`').replace(/&amp;/g, '&');
const JETON = /\{\{[A-Z_]+\}\}/;

/** Contrat du backend (Code.gs, personnaliserInvitation en mode texte) : trois remplacements littéraux. */
function personnaliserCommeLeBackend(modele, prenom, lienReponse, lienInvitation) {
  const p = String(prenom || '').trim();
  return String(modele).split('{{SALUTATION}}').join(p ? 'Bonjour ' + p + ',' : 'Bonjour,')
    .split('{{LIEN_REPONSE}}').join(lienReponse)
    .split('{{LIEN_INVITATION}}').join(lienInvitation);
}

/* ========================================================================== */
/*  LES CRITÈRES — évalués sur le code réel, puis sur chaque mutant (§ M)      */
/* ========================================================================== */

function criteres(b) {
  const res = [];
  const C = (famille, id, libelle, fn) => {
    let ok = false, detail = '';
    try { ok = fn() === true; } catch (e) { detail = ' — exception : ' + (e && e.message); }
    res.push({ famille, id, libelle: id + ' ' + libelle + detail, ok });
  };
  const F = b.bac.formaterDateFr;
  const DATE = F('2027-03-13'), LIEU = 'Stade Démo, Villeneuve-Test';
  const base = texte(b, CONFIG);
  const constante = (nom) => vm.runInContext(nom, b.bac);

  /* ---- I — identité du tournoi : en tête, comme le texte du dossier (« NOM — date · lieu ») ---- */
  const NOM = 'TOURNOI DÉMO 7M';
  const enTete = (t, attendu) => { const ls = lignes(t); return ls[0] === attendu && ls[1] === ''; };
  C('I', 'I1', 'intro neutre : « NOM — date · lieu » en tête, avant la salutation', () =>
    enTete(base, NOM + ' — ' + DATE + ' · ' + LIEU) && lignes(base).indexOf('{{SALUTATION}}') === 2);
  C('I', 'I2', 'intro RETOUCHÉE sans le nom : nom, date et lieu restent présents', () => {
    const t = texte(b, CONFIG, 'Voici notre invitation pour la saison.');
    return lignes(t).indexOf('Voici notre invitation pour la saison.') !== -1 && enTete(t, NOM + ' — ' + DATE + ' · ' + LIEU);
  });
  C('I', 'I3', 'intro VIDE : l\'identité est toujours là', () =>
    enTete(texte(b, CONFIG, ''), NOM + ' — ' + DATE + ' · ' + LIEU));
  C('I', 'I4', 'date seule : « NOM — date », sans séparateur orphelin', () => {
    const t = texte(b, avec((c) => { c.global.tournoi_lieu = ''; }));
    return enTete(t, NOM + ' — ' + DATE) && sansOrphelin(t);
  });
  C('I', 'I5', 'lieu seul : « NOM — lieu », sans séparateur orphelin', () => {
    const t = texte(b, avec((c) => { c.global.tournoi_date = ''; }));
    return enTete(t, NOM + ' — ' + LIEU) && sansOrphelin(t);
  });
  C('I', 'I6', 'ni date ni lieu : le nom seul, sans tiret ni point orphelin', () => {
    const t = texte(b, avec((c) => { c.global.tournoi_date = ''; c.global.tournoi_lieu = '  '; }));
    return enTete(t, NOM) && sansOrphelin(t);
  });
  C('I', 'I7', 'nom absent : repli « LE TOURNOI » (comme l\'en-tête HTML), date · lieu conservés', () =>
    enTete(texte(b, avec((c) => { c.global.tournoi_nom = ''; })), 'LE TOURNOI — ' + DATE + ' · ' + LIEU));

  /* ---- R — règlements ---- */
  C('R', 'R1', 'U10 : l\'URL de son règlement figure dans le texte de la catégorie', () =>
    ligneCat(base, 'U10').indexOf('règlement : ' + URL_U10) !== -1);
  C('R', 'R2', 'U14 Super Challenge : son URL de règlement figure aussi', () =>
    ligneCat(base, 'U14').indexOf('règlement : ' + URL_SCF) !== -1);
  C('R', 'R3', 'URL noyée dans un préfixe : seule l\'URL http(s) est reprise (même règle que l\'HTML)', () => {
    const t = texte(b, avec((c) => { c.categories[1].reglement = 'chrome-extension://abcdef/https://api.exemple.invalid/doc/reglement.pdf'; }));
    return ligneCat(t, 'U10').indexOf('règlement : https://api.exemple.invalid/doc/reglement.pdf') !== -1 &&
      t.indexOf('chrome-extension') === -1;
  });
  C('R', 'R4', 'cohérence : les URL du texte sont EXACTEMENT celles des liens « Consulter le règlement » de l\'HTML', () => {
    const h = html(b, CONFIG);
    const hrefs = [...h.matchAll(/<a href="([^"]*)"[^>]*>Consulter le règlement<\/a>/g)].map((m) => lisible(m[1])).sort();
    const urls = [...base.matchAll(/règlement : (\S+)/g)].map((m) => m[1]).sort();
    return hrefs.length === 2 && JSON.stringify(hrefs) === JSON.stringify(urls);
  });
  C('R', 'R5', 'libellé SANS URL (U12) : rien n\'est inventé — ni le libellé, ni une mention « règlement »', () =>
    base.indexOf('Règlement EDR FFR 2026-2027') === -1 && ligneCat(base, 'U12') !== '' &&
    ligneCat(base, 'U12').indexOf('règlement') === -1);
  C('R', 'R6', 'U10 : hors le segment règlement, sa ligne sportive est inchangée', () =>
    ligneCat(base, 'U10').replace(' · règlement : ' + URL_U10, '') === LIGNE_U10);

  /* ---- A — format d'après-midi expliqué ---- */
  const FORMATS = constante('DOSSIER_FORMATS'), DESC = constante('DOSSIER_FORMATS_DESC');
  Object.keys(FORMATS).forEach((cle, k) => {
    C('A', 'A' + (k + 1), 'format ' + cle + ' : libellé ET explication sous la catégorie, mot pour mot comme l\'HTML', () => {
      const cfg = avec((c) => { c.categories[1].format_apresmidi = cle; });
      const t = texte(b, cfg), l = ligneCat(t, 'U10');
      const attendu = '  Après-midi — ' + FORMATS[cle] + ' : ' + DESC[cle];
      return String(DESC[cle]).length > 40 && l.indexOf('après-midi : ' + FORMATS[cle]) !== -1 &&
        ligneApres(t, l) === attendu && lisible(html(b, cfg)).indexOf(attendu.trim()) !== -1;
    });
  });
  const nbFormats = Object.keys(FORMATS).length;
  C('A', 'A' + (nbFormats + 1), 'format inconnu : repli « Classement croisé » expliqué (comme l\'HTML)', () => {
    const t = texte(b, avec((c) => { c.categories[1].format_apresmidi = 'FORMAT_INCONNU'; }));
    return ligneApres(t, ligneCat(t, 'U10')) === '  Après-midi — ' + FORMATS.CROISE + ' : ' + DESC.CROISE;
  });
  C('A', 'A' + (nbFormats + 2), 'une explication par catégorie ordinaire, juste sous sa ligne (U10, U12)', () =>
    lignes(base).filter((l) => l.indexOf('  Après-midi — ') === 0).length === 2 &&
    (ligneApres(base, ligneCat(base, 'U10')) || '').indexOf('  Après-midi — ' + FORMATS.POULES_NIVEAU + ' : ') === 0 &&
    (ligneApres(base, ligneCat(base, 'U12')) || '').indexOf('  Après-midi — ' + FORMATS.CROISE + ' : ') === 0);

  /* ---- P — pause, reprise et notes de la frise ---- */
  C('P', 'P1', 'pause méridienne : son heure ET sa durée (12:00, 60 min)', () => ligneAvec(base, '12:00', 'Pause méridienne', '60 min'));
  C('P', 'P2', 'reprise calculée : 12:00 + 60 min ⇒ 13:00', () => ligneAvec(base, '13:00', 'Reprise'));
  C('P', 'P3', 'autre calcul : 12:20 + 95 min ⇒ reprise 13:55', () => {
    const t = texte(b, avec((c) => { c.global.pause_dejeuner_debut = '12:20'; c.global.pause_dejeuner_duree_min = '95'; }));
    return ligneAvec(t, '12:20', 'Pause méridienne', '95 min') && ligneAvec(t, '13:55', 'Reprise');
  });
  C('P', 'P4', 'notes de la frise : « Matin : matchs de poules » au coup d\'envoi, « Après-midi : selon la catégorie » à la reprise', () =>
    ligneAvec(base, '09:15', 'Coup d\'envoi', 'Matin : matchs de poules') &&
    ligneAvec(base, '13:00', 'Reprise', 'Après-midi : selon la catégorie'));
  C('P', 'P5', 'chaque étape d\'etapesJourneeEmail (heure, étape, note) a SA ligne dans « LA JOURNÉE », dans l\'ordre', () => {
    etat(b, CONFIG);
    const e = b.bac.etapesJourneeEmail(b.bac.globalInvitation(), b.bac.catsInvitationTriees()), bl = bloc(base);
    let pos = 0;
    return e.length === 5 && e.every((x) => {
      const k = bl.findIndex((l, i) => i >= pos && l.indexOf(x.h) !== -1 && l.indexOf(x.t) !== -1 && (!x.n || l.indexOf(x.n) !== -1));
      if (k === -1) return false;
      pos = k + 1;
      return true;
    });
  });

  /* ---- J — le reste de la journée ne bouge pas ---- */
  C('J', 'J1', 'accueil : 08:30', () => ligneAvec(base, '08:30', 'Accueil'));
  C('J', 'J2', 'coup d\'envoi : 09:15', () => ligneAvec(base, '09:15', 'Coup d\'envoi'));
  C('J', 'J3', 'fin envisagée automatique : 16:30 + 75 min ⇒ 17:45', () => ligneAvec(base, '17:45', 'Fin envisagée'));
  C('J', 'J4', 'fin envisagée manuelle prioritaire (18:10)', () => {
    const t = texte(b, avec((c) => { c.global.heure_fin_communiquee = '18:10'; }));
    return ligneAvec(t, '18:10', 'Fin envisagée') && t.indexOf('17:45') === -1;
  });
  C('J', 'J5', 'arbitrage conservé dans « LA JOURNÉE », dans l\'ordre des catégories et sans doublon', () => {
    const t = texte(b, avec((c) => { c.categories[0].arbitrage_organisation = 'Éducateurs des clubs'; }));
    return bloc(base).some((l) => l.indexOf('Arbitrage : Éducateurs des clubs · Arbitres fédéraux · Arbitres de ligue') !== -1) &&
      bloc(t).some((l) => l.indexOf('Arbitrage : Éducateurs des clubs · Arbitres de ligue') !== -1);
  });
  C('J', 'J6', 'durée de pause vide, invalide, nulle ou négative : ni durée ni reprise inventées', () =>
    ['', 'abc', '0', '-15'].every((d) => {
      const t = texte(b, avec((c) => { c.global.pause_dejeuner_duree_min = d; }));
      return ligneAvec(t, '12:00', 'Pause méridienne') && t.indexOf('Reprise') === -1 &&
        !bloc(t).some((l) => l.indexOf('Pause méridienne') !== -1 && /\d\s*min/.test(l.slice(l.indexOf('Pause méridienne'))));
    }));
  C('J', 'J7', 'pas de pause saisie : ni pause ni reprise', () => {
    const t = texte(b, avec((c) => { c.global.pause_dejeuner_debut = ''; }));
    return t.indexOf('Pause méridienne') === -1 && t.indexOf('Reprise') === -1 && ligneAvec(t, '08:30', 'Accueil');
  });
  C('J', 'J8', 'arbitrage seul (aucune heure) : il reste dans « LA JOURNÉE »', () => {
    const t = texte(b, avec((c) => {
      ['heure_rdv', 'heure_debut', 'pause_dejeuner_debut', 'heure_fin', 'heure_fin_communiquee'].forEach((k) => { c.global[k] = ''; });
    }));
    return bloc(t).some((l) => l.indexOf('Arbitrage : Éducateurs des clubs') !== -1) && t.indexOf('Accueil') === -1;
  });
  C('J', 'J9', 'ni heure ni arbitrage : aucun bloc « LA JOURNÉE »', () => {
    const t = texte(b, avec((c) => {
      ['heure_rdv', 'heure_debut', 'pause_dejeuner_debut', 'heure_fin', 'heure_fin_communiquee'].forEach((k) => { c.global[k] = ''; });
      c.categories.forEach((x) => { x.arbitrage_organisation = ''; });
    }));
    return t.indexOf('LA JOURNÉE') === -1;
  });

  /* ---- S — Super Challenge de France inchangé ---- */
  C('S', 'S1', 'SCF P3 : ligne inchangée (2 × 11 min, samedi / dimanche)', () => ligneCat(texte(b, SANS_URL), 'U14') === LIGNE_U14_P3);
  C('S', 'S2', 'SCF P2 : ligne inchangée (2 × 15 min, plateau)', () =>
    ligneCat(texte(b, avec((c) => { c.categories[2].scf_phase = 'P2'; }, SANS_URL)), 'U14') === LIGNE_U14_P2);
  C('S', 'S3', 'SCF phase vide : repli P2 inchangé', () =>
    ligneCat(texte(b, avec((c) => { c.categories[2].scf_phase = ''; }, SANS_URL)), 'U14') === LIGNE_U14_P2);
  C('S', 'S4', 'SCF : aucune phase d\'après-midi — ni segment, ni ligne d\'explication', () => {
    const l = ligneCat(base, 'U14');
    return l !== '' && !/après-midi/i.test(l) && !/^\s+Après-midi/.test(ligneApres(base, l) || '');
  });
  C('S', 'S5', 'tournoi 100 % SCF : phrase dédiée, aucune explication d\'après-midi, aucune note matin / après-midi', () => {
    const t = texte(b, avec((c) => { c.categories = [c.categories[2]]; }));
    return t.indexOf('Le Super Challenge de France suit la formule de son règlement, détaillée ci-dessous.') !== -1 &&
      t.indexOf('Après-midi —') === -1 && t.indexOf('Matin : matchs de poules') === -1 &&
      t.indexOf('Après-midi : selon la catégorie') === -1 && ligneAvec(t, '13:00', 'Reprise') === ligneAvec(base, '13:00', 'Reprise');
  });

  /* ---- N — tout le reste du texte ---- */
  const ls = lignes(base);
  const iSalut = ls.indexOf('{{SALUTATION}}');
  C('N', 'N1', 'modèle : les trois jetons, chacun exactement une fois', () =>
    ['{{SALUTATION}}', '{{LIEN_REPONSE}}', '{{LIEN_INVITATION}}'].every((j) => base.split(j).length === 2));
  C('N', 'N2', 'salutation (jeton) sur sa ligne, isolée par des lignes vides, avant tout le corps', () =>
    iSalut !== -1 && iSalut <= 2 && ls[iSalut + 1] === '' && (iSalut === 0 || ls[iSalut - 1] === ''));
  C('N', 'N3', 'intro éditable reprise telle quelle juste après la salutation, neutre comme retouchée', () => {
    const r = lignes(texte(b, CONFIG, 'Intro retouchée par l\'organisation.'));
    return ls[iSalut + 2] === INTRO && r[r.indexOf('{{SALUTATION}}') + 2] === 'Intro retouchée par l\'organisation.';
  });
  C('N', 'N4', 'liens : bouton de réponse et version en ligne (jetons)', () =>
    ls.indexOf('▶ Répondre à l\'invitation : {{LIEN_REPONSE}}') !== -1 && ls.indexOf('Voir la version en ligne : {{LIEN_INVITATION}}') !== -1);
  C('N', 'N5', 'descriptif complet (deux lignes)', () => base.indexOf(CONFIG.global.tournoi_description) !== -1);
  C('N', 'N6', 'catégories présentes seulement, dans l\'ordre naturel U10 < U12 < U14', () => {
    const i10 = base.indexOf('- U10 : '), i12 = base.indexOf('- U12 : '), i14 = base.indexOf('- U14 : ');
    return i10 !== -1 && i10 < i12 && i12 < i14 && base.indexOf('U16') === -1 && base.indexOf('NE DOIT PAS SORTIR') === -1;
  });
  C('N', 'N7', 'données sportives inchangées : lignes exactes U10, U12, U14 (sans URL de règlement)', () => {
    const t = texte(b, SANS_URL);
    return ligneCat(t, 'U10') === LIGNE_U10 && ligneCat(t, 'U12') === LIGNE_U12 && ligneCat(t, 'U14') === LIGNE_U14_P3;
  });
  C('N', 'N8', '« VOUS ÊTES INVITÉS » puis la phrase d\'introduction des cartes', () => {
    etat(b, CONFIG);
    const i = ls.indexOf('VOUS ÊTES INVITÉS');
    return i !== -1 && ls[i + 1] === b.bac.introCartesEmail(b.bac.catsInvitationTriees());
  });
  C('N', 'N9', 'repères FFR : effectif minimum et « pourquoi ce format »', () =>
    ls.indexOf('RAPPEL IMPORTANT — ' + constante('FFR_RAPPEL_EFFECTIF')) !== -1 &&
    ls.indexOf('POURQUOI CE FORMAT ? ' + constante('FFR_POURQUOI_FORMAT')) !== -1);
  C('N', 'N10', 'services et tarif', () =>
    ls.indexOf('Sur place : buvette, espace sandwich.') !== -1 && ls.indexOf('Tarif d\'engagement : 20 € par équipe engagée') !== -1);
  C('N', 'N11', 'échéances de réponse et de paiement, contact', () =>
    ls.indexOf('Réponse souhaitée avant le ' + F('2027-02-15') + '.') !== -1 &&
    ls.indexOf('Date limite de paiement : ' + F('2027-03-01') + '.') !== -1 &&
    ls.indexOf('Contact : Alex Démo · 06 00 00 00 00 · contact@exemple.invalid') !== -1);
  C('N', 'N12', 'signature en fin de texte', () => ls.slice(-3).join('|') === '|Au plaisir de vous accueillir,|L\'organisation du tournoi');
  C('N', 'N13', 'ordre des blocs aligné sur le menu « Invitation initiale »', () => {
    const reperes = ['{{SALUTATION}}', INTRO, '▶ Répondre à l\'invitation : {{LIEN_REPONSE}}', 'Première ligne du descriptif fictif.',
      'VOUS ÊTES INVITÉS', '- U10 : ', 'RAPPEL IMPORTANT', 'LA JOURNÉE', 'MODALITÉS D\'INSCRIPTION',
      'Date limite de paiement', 'RÉPONSE À L\'INVITATION', 'Réponse souhaitée avant le',
      'Contact : ', 'SUR PLACE', 'Sur place : ', 'Voir la version en ligne : ', 'Au plaisir de vous accueillir,'];
    let pos = -1;
    return reperes.every((r) => { const i = ls.findIndex((l, k) => k > pos && l.indexOf(r) === 0); if (i === -1) return false; pos = i; return true; });
  });
  C('N', 'N14', 'personnalisation (contrat du backend) : aucun jeton résiduel, salutation et liens personnels en place', () => {
    const lr = 'https://organisateur.exemple.invalid/demo/reponse-invitation.html?tournoi=T&club=RC%20Fictif&token=JETON-FICTIF';
    const li = 'https://organisateur.exemple.invalid/demo/invitation-club.html?club=RC%20Fictif&token=JETON-FICTIF';
    const p = personnaliserCommeLeBackend(base, 'Camille', lr, li), s = personnaliserCommeLeBackend(base, '', lr, li);
    return !JETON.test(p) && !JETON.test(s) && lignes(p)[iSalut] === 'Bonjour Camille,' && lignes(s)[iSalut] === 'Bonjour,' &&
      lignes(p).indexOf('▶ Répondre à l\'invitation : ' + lr) !== -1 && lignes(p).indexOf('Voir la version en ligne : ' + li) !== -1;
  });

  return res;
}

/* ========================================================================== */

const FAMILLES = [
  ['I', '① I — Identité du tournoi (nom, date, lieu)'],
  ['R', '② R — Règlements'],
  ['A', '③ A — Format d\'après-midi expliqué'],
  ['P', '④ P — Pause, reprise et notes de la frise'],
  ['J', '⑤ J — Le reste de la journée ne bouge pas'],
  ['S', '⑥ S — Super Challenge de France inchangé'],
  ['N', '⑦ N — Tout le reste du texte, jetons et personnalisation']
];

/* Chaque mutant retire UNE correction. `de` doit apparaître exactement une fois dans la source. */
const MUTANTS = [
  { famille: 'I', nom: 'M1 — sans l\'identité du tournoi',
    de: '  L.push(nom.toUpperCase() + (quand.length ? \' — \' + quand.join(\' · \') : \'\'));\n  L.push(\'\');\n', vers: '' },
  { famille: 'R', nom: 'M2 — sans le règlement',
    de: '      if (regl) seg.push(\'règlement : \' + regl[0]);\n', vers: '' },
  { famille: 'P', nom: 'M3 — sans la durée de pause ni la reprise',
    de: '  const etapes = etapesJourneeEmail(g, cats);\n  const arb = [];\n',
    vers: '  const etapes = etapesJourneeEmail(g, cats).filter(function (e) { return e.t !== \'Reprise\'; })\n' +
      '    .map(function (e) { return e.t === \'Pause méridienne\' ? { h: e.h, t: e.t, n: \'\' } : e; });\n  const arb = [];\n' },
  { famille: 'A', nom: 'M4 — sans l\'explication de l\'après-midi',
    de: '      if (!scf.estScf) {\n        const cle = cleFormatApresMidi(c);\n' +
      '        L.push(\'  Après-midi — \' + DOSSIER_FORMATS[cle] + \' : \' + DOSSIER_FORMATS_DESC[cle]);\n      }\n', vers: '' }
];

function controles() {
  const b = charger(SOURCE_INVITATIONS);
  const resultats = criteres(b);
  FAMILLES.forEach(([f, titre]) => {
    console.log('\n' + titre);
    resultats.filter((r) => r.famille === f).forEach((r) => verifier(r.ok, r.libelle));
  });

  console.log('\n⑧ Z — Isolement du bac');
  const absents = ['fetch', 'XMLHttpRequest', 'require', 'process', 'sessionStorage', 'localStorage']
    .filter((n) => vm.runInContext('typeof ' + n, b.bac) === 'undefined');
  verifier(absents.length === 6, 'Z1 ni réseau, ni module, ni processus, ni stockage dans le bac (' + absents.join(', ') + ')');

  console.log('\n⑨ M — Auto-preuve : chaque correction retirée fait tomber SA famille, et elle seule');
  MUTANTS.forEach((m) => {
    const n = SOURCE_INVITATIONS.split(m.de).length - 1;
    if (n !== 1) {
      verifier(false, m.nom + ' — repère trouvé ' + n + ' fois au lieu d\'une : le code a changé, mets ce garde-fou à jour');
      verifier(false, m.nom + ' — mutant non construit');
      return;
    }
    const tombes = criteres(charger(SOURCE_INVITATIONS.split(m.de).join(m.vers))).filter((r) => !r.ok);
    const dansFamille = tombes.filter((r) => r.famille === m.famille).map((r) => r.id);
    const ailleurs = tombes.filter((r) => r.famille !== m.famille).map((r) => r.id);
    verifier(dansFamille.length > 0, m.nom + ' ⇒ la famille ' + m.famille + ' échoue (' + (dansFamille.join(', ') || 'aucun échec') + ')');
    verifier(ailleurs.length === 0, m.nom + ' ⇒ et aucune autre famille ne bouge' + (ailleurs.length ? ' (' + ailleurs.join(', ') + ')' : ''));
  });
}

/* ⛔ GARDE-FOU : on part en ÉCHEC, et on ne repasse au vert qu'à la toute fin du bilan. */
process.exitCode = 1;

try {
  controles();
  console.log('\n' + '─'.repeat(70));
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + ' contrôle(s) en défaut sur ' + (reussis + echecs.length) + ' :');
    echecs.forEach(function (e) { console.log('   · ' + e); });
    process.exit(1);
  }
  console.log('OK — ' + reussis + ' contrôles passés.');
  process.exitCode = 0;                       // ⭐ le seul endroit qui lève le garde-fou
} catch (e) {
  console.error('\nERREUR DU HARNAIS : ' + (e && e.stack || e));
  process.exit(1);
}
