#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  PAGES PUBLIQUES DU TOURNOI — SURFACE, ÉTATS, FRAÎCHEUR, ACCESSIBILITÉ
 * ============================================================================
 *  ▶ node tests/ecran-public-surface.test.js
 *
 *  ⭐ CE QUE CETTE SUITE DÉFEND :
 *   A · l'INVENTAIRE des surfaces publiques réellement servies (⛔ pas des noms supposés) ;
 *   B · la PUBLICATION décidée par le SERVEUR — jamais par le navigateur ;
 *   C · les ÉTATS HONNÊTES : une erreur n'est pas un état vide, un contenu ancien le dit ;
 *   D · la FRAÎCHEUR et la CONVERGENCE : version, édition, âge, monotonie, relais ;
 *   E · l'ACCESSIBILITÉ du modèle d'onglets, et le rendu mobile ;
 *   F · les RESSOURCES MÊLÉES, et la compatibilité ancien/nouveau dans les deux sens.
 *
 *  ⛔ Aucun réseau, aucun service Google réel, aucun navigateur réel.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('./banc-ecran-public');

const c = B.compteur();
const vrai = (v, m, p) => c.vrai(v, m, p);
const lire = (f) => fs.readFileSync(path.join(B.RACINE, f), 'utf8');

(async () => {

/* ══════════════════════════════════════════════════════════════════════════
   A — INVENTAIRE DES SURFACES PUBLIQUES RÉELLEMENT SERVIES
   ══════════════════════════════════════════════════════════════════════════ */
{
  const pages = fs.readdirSync(B.RACINE).filter((f) => f.endsWith('.html')).sort();
  vrai(JSON.stringify(pages) === JSON.stringify(['admin.html', 'dossier-club.html', 'index.html',
    'invitation-club.html', 'perfs.html', 'reponse-invitation.html', 'saisie.html', 'tournoi.html']),
    'A.1 ⭐⭐ inventaire FIGÉ des pages servies à la racine — une page nouvelle doit être instruite', pages);

  /* `index.html` : la ROUTE HISTORIQUE. Elle ne doit ni charger de script, ni lire de données —
     seulement rediriger. ⛔ Une redirection qui lirait le tournoi serait une porte de plus. */
  const index = lire('index.html');
  vrai(/<meta http-equiv="refresh" content="0; url=tournoi\.html">/.test(index) &&
       /<link rel="canonical" href="tournoi\.html">/.test(index),
    'A.2 ⭐ `index.html` redirige vers `tournoi.html`, et l’annonce comme canonique');
  vrai(index.indexOf('<script') === -1 && index.indexOf('js/') === -1,
    'A.3 ⭐⭐ `index.html` ne charge AUCUN script : la route historique ne lit rien');

  /* Les DEUX pages publiques lisent le contrat public, et rien d'autre. */
  ['js/tournoi.js', 'js/perfs.js'].forEach((f) => {
    const src = lire(f);
    vrai(src.indexOf("apiGet('getPublic'") !== -1,
      'A.4 ⭐⭐ ' + f + ' lit `getPublic` (l’état public autoritaire)');
    const sansCom = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    vrai(sansCom.indexOf("apiGet('getAll'") === -1,
      'A.5 ⭐⭐ ' + f + ' n’appelle PLUS `getAll` — ⛔ pas même en repli : ce serait rouvrir la fuite');
  });
  const invitation = lire('js/invitation.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  vrai(invitation.indexOf("apiGet('getConfig', { club: club, token: token })") !== -1 &&
       invitation.indexOf("if (!club || !token)") !== -1,
    'A.6 ⭐⭐ la vitrine d’invitation ne lit `getConfig` qu’avec le club et son jeton personnel');
}

/* ══════════════════════════════════════════════════════════════════════════
   B — LA PUBLICATION EST DÉCIDÉE PAR LE SERVEUR
   ══════════════════════════════════════════════════════════════════════════ */
for (const etat of ['non', 'masque']) {
  const b = await B.banc({ etat });
  const rep = b.srv.instrument.requetes[0];
  const corps = JSON.parse(b.srv.appeler('reponseEtatPublic_'));
  vrai(corps.public === false && corps.equipes.length === 0 && corps.matchs.length === 0 &&
       corps.sponsors.length === 0 && (corps.config.categories || []).length === 0,
    'B.1 (' + etat + ') ⭐⭐ la RÉPONSE elle-même ne porte aucune équipe, aucun match, aucun partenaire',
    { equipes: corps.equipes.length, matchs: corps.matchs.length, sponsors: corps.sponsors.length });
  vrai(JSON.stringify(corps.config.global) === '{"tournoi_publie":"non"}',
    'B.2 (' + etat + ') ⭐⭐ la config servie se réduit au témoin — ⛔ même pas le nom du tournoi',
    corps.config.global);
  vrai(corps.edition === '',
    'B.3 (' + etat + ') ⭐ aucune édition annoncée : rien à rattacher à une édition qu’on ne montre pas');
  vrai(b.etat().phase === 'non_publie' && !b.cache('tournoi-avenir') && b.cache('vues'),
    'B.4 (' + etat + ') ⭐ l’écran « à venir » est montré, les vues sont effacées', b.etat());
  b.fermer();
}
{
  /* LE TÉMOIN QUI FAIT MORDRE B.1 : le backend FIGÉ livrait tout, sur le MÊME jeu de données. */
  const srv = B.serveur(B.BACKEND_AVANT(), { etat: 'masque' });
  const avant = srv.getMesure({ action: 'getAll' }).reponse;
  vrai(avant.equipes.length > 0 && avant.matchs.length > 0 &&
       avant.matchs.some((m) => m.score_A !== '' && m.score_A != null),
    'B.5 ⭐⭐ TÉMOIN — backend figé `' + B.BACKEND_AVANT_REV.slice(0, 7) + '`, tournoi MASQUÉ : `getAll` livrait ' +
    avant.equipes.length + ' équipes et ' + avant.matchs.length + ' matchs AVEC leurs scores');

  /* Et les lectures historiques du tournoi sont fermées elles aussi. */
  const apres = B.serveur(null, { etat: 'masque' });
  ['getPoules', 'getMatchs', 'getClassement'].forEach((a) => {
    const r = apres.getMesure({ action: a }).reponse;
    vrai(r && r.error && r.public === false && r.motif === 'non_publie' &&
         !Array.isArray(r) && !r.equipes && !r.matchs && !r.classement,
      'B.6 ⭐⭐ ' + a + ' (lecture historique) : refus NEUTRE, aucune donnée, aucun compte', r);
  });
  /* ⭐ CE CONTRÔLE A CHANGÉ DE CAMP, et c'est l'objet de la contre-épreuve du 24/09/2026. Il
     CONSIGNAIT une dette — « `getEquipes` reste ouverte » — au motif que l'écran « Équipes » de
     l'administration la consommait avant publication. ⛔ Ce raisonnement était faux : un écran
     autorisé qui appelle une porte ANONYME ne rend pas cette porte autorisée. L'écran lit désormais
     `getInstantaneAdmin`, sous clé, et les deux portes anonymes sont fermées. */
  /* ⭐ RÉPONSE VIDE MAIS BIEN FORMÉE (et non un `{error}`) : le contrat demandait « neutre,
     EXPLICITE et COMPATIBLE ». ⛔ Aucune équipe, aucune poule, aucun match, aucun partenaire,
     aucune catégorie, et une config réduite au seul témoin — pas même le nom du tournoi. */
  {
    const r = apres.getMesure({ action: 'getAll' }).reponse;
    vrai(r.public === false && r.motif === 'non_publie' && r.equipes.length === 0 &&
         r.matchs.length === 0 && r.poules.length === 0 && r.sponsors.length === 0 &&
         JSON.stringify(r.config.global) === '{"tournoi_publie":"non"}',
      'B.7 ⭐⭐ `getAll` anonyme, tournoi masqué : état VIDE — la porte est FERMÉE', r);
    const e = apres.getMesure({ action: 'getEquipes' }).reponse;
    vrai(Array.isArray(e) && e.length === 0,
      'B.7 bis ⭐⭐ `getEquipes` anonyme, tournoi masqué : tableau VIDE', e);
  }
}
{
  /* `getHistorique` : l'édition COURANTE ne sort pas tant qu'elle n'est pas publiée. */
  const srv = B.serveur(null, { etat: 'masque', historique: { courant: 4, passe: 3 } });
  const masque = srv.getMesure({ action: 'getHistorique' }).reponse;
  vrai(Array.isArray(masque) && masque.length === 3 &&
       masque.every((l) => String(l.tournoi_id) === 'edition-passee-fictive'),
    'B.8 ⭐⭐ tournoi masqué : le journal de saison ne rend QUE les éditions passées (3/7)',
    { rendu: masque.length });
  const srv2 = B.serveur(null, { etat: 'oui', historique: { courant: 4, passe: 3 } });
  vrai(srv2.getMesure({ action: 'getHistorique' }).reponse.length === 7,
    'B.9 ⭐ tournoi publié : le journal complet ressort (7/7)');
  const avant = B.serveur(B.BACKEND_AVANT(), { etat: 'masque', historique: { courant: 4, passe: 3 } });
  vrai(avant.getMesure({ action: 'getHistorique' }).reponse.length === 7,
    'B.10 ⭐⭐ TÉMOIN — le backend figé livrait les 7 lignes, édition masquée comprise');
}

/* ══════════════════════════════════════════════════════════════════════════
   C — DES ÉTATS HONNÊTES : une erreur n'est pas un état vide
   ══════════════════════════════════════════════════════════════════════════ */
{
  // C.1 — première charge en erreur réseau
  const b = await B.banc({ etat: 'oui', pannes: { getPublic: 'reseau' } });
  vrai(b.etat().phase === 'erreur' && !b.cache('tournoi-indispo') && b.cache('tournoi-avenir'),
    'C.1 ⭐⭐ première charge en panne réseau : écran d’INDISPONIBILITÉ, ⛔ jamais l’écran « à venir »',
    { phase: b.etat().phase, avenirVisible: !b.cache('tournoi-avenir') });
  vrai(b.cache('vues') !== false || b.texte('etat-public').indexOf('⛔') === 0,
    'C.2 ⭐ le bandeau d’état porte un refus explicite', b.texte('etat-public'));
  vrai(String(b.texte('maj')) === '',
    'C.3 ⭐⭐ l’horodatage est VIDE : rien n’a été reçu, donc rien n’est daté');
  b.fermer();
}
{
  // C.4 — JSON illisible / tronqué : ce n'est pas un tournoi vide
  for (const panne of ['json', 'tronque']) {
    const b = await B.banc({ etat: 'oui', pannes: { getPublic: panne } });
    vrai(b.etat().phase === 'erreur' && b.cache('tournoi-avenir'),
      'C.4 (' + panne + ') ⭐⭐ réponse illisible ⇒ ERREUR, ⛔ ni « à venir », ni planning vide',
      b.etat().phase);
    b.fermer();
  }
}
{
  // C.5 — rafraîchissement (manuel et automatique) en erreur : le contenu reste, ANNONCÉ ancien
  const b = await B.banc({ etat: 'oui' });
  const version = b.etat().version;
  b.ctx.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  await b.rafraichir();
  const e = b.etat();
  vrai(e.ancien === true && e.phase === 'publie' && e.version === version,
    'C.5 ⭐⭐ rafraîchissement MANUEL en panne : le contenu reste, marqué ANCIEN, la version ne bouge pas', e);
  vrai(b.texte('etat-public').indexOf('⚠️') === 0 && /non actualisé/.test(b.texte('etat-public')),
    'C.6 ⭐⭐ et le bandeau le DIT — ⛔ un contenu ancien n’est jamais présenté comme courant',
    b.texte('etat-public'));
  vrai(String(b.texte('btn-refresh')) === '⚠️ Réessayer',
    'C.7 ⭐⭐ le bouton n’annonce plus « tout va bien » après un échec', b.texte('btn-refresh'));
  vrai(/^Dernières données reçues à \d\d:\d\d$/.test(String(b.texte('maj'))),
    'C.8 ⭐ l’horodatage dit « dernières données reçues », pas « mis à jour »', b.texte('maj'));
  await b.tourAutomatique();
  vrai(b.etat().ancien === true,
    'C.9 ⭐ un rafraîchissement AUTOMATIQUE en panne laisse le même aveu — il n’est pas silencieux');
  b.fermer();
}
{
  // C.10 — retour en ligne : l'aveu disparaît, et seulement alors
  const b = await B.banc({ etat: 'oui' });
  const vraiFetch = b.ctx.fetch;
  b.ctx.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  await b.rafraichir();
  vrai(b.etat().ancien === true, 'C.10 ⭐ (préalable) l’affichage est marqué ancien');
  b.ctx.fetch = vraiFetch;
  await b.signauxSimultanes(['online']);
  vrai(b.etat().ancien === false && b.etat().phase === 'publie',
    'C.11 ⭐⭐ retour en ligne : l’avertissement disparaît parce que les données sont à nouveau fraîches',
    b.etat());
  vrai(String(b.texte('btn-refresh')) === '🔄 Rafraîchir' || b.cache('etat-public') === true,
    'C.12 ⭐ et le bandeau se tait');
  b.fermer();
}
{
  // C.13 — hors ligne déclaré par le navigateur
  const b = await B.banc({ etat: 'oui' });
  await b.signauxSimultanes(['offline']);
  vrai(b.etat().ancien === true && /Hors ligne/.test(b.texte('etat-public')),
    'C.13 ⭐⭐ `offline` : le contenu déjà obtenu est ANNONCÉ comme non actualisé', b.texte('etat-public'));
  b.fermer();
}
{
  // C.14 — backend trop ancien : échec FERMÉ, jamais de repli
  const b = await B.banc({ etat: 'oui', backend: B.BACKEND_AVANT() });
  vrai(b.etat().phase === 'incompatible' && !b.cache('tournoi-indispo'),
    'C.14 ⭐⭐ backend figé (sans `getPublic`) : ÉCHEC FERMÉ, explicite', b.etat());
  vrai(b.requetes().every((a) => a === 'getPublic'),
    'C.15 ⭐⭐ ⛔ AUCUN repli sur `getAll` — la page préfère ne rien montrer plutôt que de rouvrir la fuite',
    b.requetes());
  vrai(/serveur trop ancien/i.test(b.texte('etat-public')),
    'C.16 ⭐ et la raison est dite en clair', b.texte('etat-public'));
  b.fermer();
}
{
  // C.17 — les DEUX onglets reflètent le même état
  const b = await B.banc({ etat: 'non' });
  await b.onglet('classements');
  vrai(b.cache('vues') === true && !b.cache('tournoi-avenir'),
    'C.17 ⭐⭐ tournoi non publié : basculer d’onglet ne fait apparaître AUCUN contenu');
  b.fermer();
}

/* ══════════════════════════════════════════════════════════════════════════
   D — FRAÎCHEUR, MONOTONIE, ÉDITION, RELAIS
   ══════════════════════════════════════════════════════════════════════════ */
{
  const srv = B.serveur(null, { etat: 'oui' });
  const r = JSON.parse(srv.appeler('reponseEtatPublic_'));
  ['ok', 'contrat', 'public', 'motif', 'edition', 'version', 'genere_le', 'servi_le', 'cache']
    .forEach((k) => vrai(Object.prototype.hasOwnProperty.call(r, k),
      'D.1 ⭐ le contrat public porte `' + k + '`'));
  vrai(r.contrat === 'public-1', 'D.2 ⭐⭐ le contrat est NOMMÉ : son absence est un échec fermé');
  vrai(Date.parse(r.servi_le) >= Date.parse(r.genere_le),
    'D.3 ⭐⭐ `servi_le` ≥ `genere_le` : l’âge se mesure avec UNE seule horloge, celle du serveur');
}
{
  // D.4 — un SCORE change la version, PAS l'édition
  const srv = B.serveur(null, { etat: 'oui' });
  const a = JSON.parse(srv.appeler('construireEtatPublicJson_').json);
  const onglet = srv.classeur.getSheetByName('Matchs');
  const vals = onglet.getDataRange().getValues();
  const iS = vals[0].indexOf('score_A');
  vals[1][iS] = Number(vals[1][iS]) + 7;
  onglet.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
  srv.cache.clear();
  const b2 = JSON.parse(srv.appeler('construireEtatPublicJson_').json);
  vrai(b2.version !== a.version, 'D.4 ⭐⭐ un score modifié CHANGE la version du contenu');
  vrai(b2.edition === a.edition, 'D.5 ⭐⭐ … mais PAS l’édition : la page ne se croit pas repartie à zéro',
    { avant: a.edition, apres: b2.edition });
}
{
  // D.6 — la structure change ⇒ l'édition change
  const srv = B.serveur(null, { etat: 'oui' });
  const a = JSON.parse(srv.appeler('construireEtatPublicJson_').json);
  const onglet = srv.classeur.getSheetByName('Matchs');
  const vals = onglet.getDataRange().getValues();
  const iId = vals[0].indexOf('id_match');
  vals[1][iId] = 'M999-NOUVELLE-EDITION';
  onglet.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
  srv.cache.clear();   // ⛔ sans ça, l'instantané resterait celui d'avant : on mesurerait le cache
  const b2 = JSON.parse(srv.appeler('construireEtatPublicJson_').json);
  vrai(b2.edition !== a.edition && b2.edition !== '',
    'D.6 ⭐⭐ des identifiants de matchs neufs ⇒ édition neuve (réinitialisation, régénération)');
}
{
  // D.7 — MONOTONIE : une réponse ancienne arrivée APRÈS une récente est ÉCARTÉE
  const b = await B.banc({ etat: 'oui', manuel: true, ouvrir: false });
  await b.ouvrir();                 // la première requête est retenue
  await b.livrer(0);                // elle est livrée : l'écran est peuplé
  const versionInitiale = b.etat().version;
  const genereInitial = b.etat().genereLe;

  // On fabrique DEUX réponses : une récente, puis une ANCIENNE, et on les livre à l'envers.
  const corpsRecent = JSON.parse(b.srv.appeler('reponseEtatPublic_'));
  corpsRecent.genere_le = new Date(Date.parse(genereInitial) + 60000).toISOString();
  corpsRecent.servi_le = corpsRecent.genere_le;
  corpsRecent.version = 'version-recente';
  const corpsAncien = JSON.parse(JSON.stringify(corpsRecent));
  corpsAncien.genere_le = new Date(Date.parse(genereInitial) - 60000).toISOString();
  corpsAncien.version = 'version-ancienne';

  let suite = [corpsRecent, corpsAncien];
  b.ctx.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => suite.shift() });
  await b.rafraichir();             // applique la RÉCENTE
  vrai(b.etat().version === 'version-recente', 'D.7 ⭐ la réponse récente est appliquée', b.etat().version);
  await b.rafraichir();             // l'ANCIENNE arrive ensuite
  vrai(b.etat().version === 'version-recente',
    'D.8 ⭐⭐ la réponse ANCIENNE, arrivée après, est ÉCARTÉE — elle n’écrase pas la récente', b.etat().version);
  vrai(b.etat().ancien === true && /écartée/.test(b.etat().detail),
    'D.9 ⭐⭐ … et l’écart est AVOUÉ, pas silencieux', b.etat().detail);
  vrai(versionInitiale !== 'version-recente', 'D.10 ⭐ (le banc a bien changé d’état entre-temps)');
  b.fermer();
}
{
  const b = await B.banc({ etat: 'oui', manuel: true, ouvrir: false });
  await b.ouvrir();
  await b.livrer(0);

  const ancienne = vm.runInContext('charger(false)', b.ctx);
  await b.tour();
  b.srv.postMesure({ action: 'publierTournoi', cle: B.MPub.CLE_ADMIN, publie: 'non' });
  const recente = vm.runInContext('charger(false)', b.ctx);
  await b.tour();

  await b.livrer(1);
  await recente;
  vrai(b.etat().phase === 'non_publie' && b.lireVm('equipes.length + matchs.length') === 0,
    'D.10 bis ⭐⭐ course réelle : le masquage parti en second est appliqué et efface la mémoire');
  await b.livrer(0);
  await ancienne;
  vrai(b.etat().phase === 'non_publie' && b.lireVm('equipes.length + matchs.length') === 0,
    'D.10 ter ⭐⭐ la réponse publiée partie avant mais arrivée après ne peut pas ressusciter l’écran');
  b.fermer();
}
{
  const b = await B.banc({ etat: 'oui' });
  const version = b.etat().version;
  const invalide = JSON.parse(b.srv.appeler('reponseEtatPublic_'));
  invalide.genere_le = 'horodatage-invalide';
  b.ctx.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => invalide });
  await b.rafraichir();
  vrai(b.etat().version === version && b.etat().ancien === true,
    'D.10 quater ⭐⭐ un état sans horodatage serveur exploitable est refusé, jamais présenté comme frais');
  b.fermer();
}
{
  const elements = {
    'vue-tournoi': { innerHTML: '' }, 'vue-saison': { innerHTML: '' },
    'maj-perfs': { textContent: '' }
  };
  const attentes = [];
  const ctx = vm.createContext({
    document: { getElementById: (id) => elements[id] || null, addEventListener() {}, hidden: false },
    apiGet: (action) => new Promise((resolve, reject) => attentes.push({ action, resolve, reject })),
    setTimeout: () => 1, clearTimeout() {}, Promise, Date, JSON, String, Number, Object, Array,
    Math, RegExp, Error, isFinite, parseInt, parseFloat, Intl, console,
    echapper: (v) => String(v), indexerNoms: () => ({})
  });
  vm.runInContext(lire('js/perfs.js'), ctx, { filename: 'js/perfs.js' });
  const ancienne = vm.runInContext('charger(false)', ctx);
  const recente = vm.runInContext('charger(false)', ctx);
  const base = JSON.parse(B.serveur(null, { etat: 'oui' }).appeler('reponseEtatPublic_'));
  const masque = Object.assign({}, base, {
    public: false, motif: 'non_publie', edition: '', equipes: [], matchs: [], sponsors: [],
    config: { global: { tournoi_publie: 'non' }, categories: [] }, version: 'masque-recent',
    genere_le: new Date(Date.parse(base.genere_le) + 1000).toISOString(),
    servi_le: new Date(Date.parse(base.genere_le) + 1000).toISOString()
  });
  attentes[2].resolve(masque); attentes[3].resolve([]);
  await recente;
  attentes[0].resolve(base); attentes[1].resolve([]);
  await ancienne;
  vrai(/n’est pas publié/.test(elements['vue-tournoi'].innerHTML) &&
       /n’est pas publié/.test(elements['vue-saison'].innerHTML),
    'D.10 quinquies ⭐⭐ Perfs : une ancienne réponse publiée arrivée après le masquage ne gagne pas la course');
}
{
  // D.11 — le relais, éprouvé par des DOUBLES (⛔ jamais un relais réel)
  const base = JSON.parse(B.serveur(null, { etat: 'oui' }).appeler('reponseEtatPublic_'));
  const URL_RELAIS = 'https://relais.exemple.invalid/instantane';
  /* ⭐ PREMIÈRE OUVERTURE — le serveur établit l'édition autoritaire. Le relais ne devient
     admissible qu'au rafraîchissement suivant, quand la page sait ce qu'elle regarde. */
  {
    const relais = { url: URL_RELAIS, corps: Object.assign({}, base) };
    const b = await B.banc({ etat: 'oui', relais });
    vrai(b.requetes().indexOf('getPublic') !== -1 && b.requetes().indexOf('RELAIS') === -1,
      'D.11 (première charge) ⭐⭐ le serveur établit l’édition — un relais étranger ne peut pas gagner', b.requetes());
    const maintenant = Date.parse(b.etat().genereLe);
    relais.corps.genere_le = new Date(maintenant + 1000).toISOString();
    relais.corps.servi_le = relais.corps.genere_le;
    await b.rafraichir();
    vrai(b.requetes().indexOf('RELAIS') !== -1,
      'D.12 (édition établie) ⭐ le relais conforme peut ensuite être employé', b.requetes());
    vrai(b.etat().source === 'relais', 'D.12 bis ⭐ la page SAIT d’où vient ce qu’elle montre', b.etat().source);
    b.fermer();
  }

  const genere = Date.parse(base.genere_le);
  const cas = [
    ['ancien', Object.assign({}, base, { version: 'v-relais-ancienne',
      genere_le: new Date(genere - 120000).toISOString() })],
    ['d’une autre édition', Object.assign({}, base, { edition: 'autre-edition-fictive' })],
    ['hors contrat', Object.assign({}, base, { contrat: 'autre-contrat' })],
    ['indisponible', null]
  ];
  for (const [libelle, corpsSuivant] of cas) {
    const relais = { url: URL_RELAIS, corps: Object.assign({}, base) };
    const b = await B.banc({ etat: 'oui', relais });
    const editionInitiale = b.etat().edition;
    relais.corps = corpsSuivant;          // ⭐ le relais DÉRAILLE entre deux lectures
    const avant = b.requetes().length;
    await b.rafraichir();
    const aEmisVersServeur = b.requetes().slice(avant).indexOf('getPublic') !== -1;
    vrai(aEmisVersServeur,
      'D.13 (' + libelle + ') ⭐⭐ relais ÉCARTÉ, lecture directe du serveur', b.requetes().slice(avant));
    if (corpsSuivant !== null) {
      vrai(/relais/i.test(b.etat().detail || ''),
        'D.14 (' + libelle + ') ⭐⭐ ⛔ le repli n’est JAMAIS silencieux : il est nommé', b.etat().detail);
    }
    vrai(b.etat().phase === 'publie' && b.etat().edition === editionInitiale,
      'D.15 (' + libelle + ') ⭐⭐ la page reste servie, et sur la MÊME édition — ⛔ jamais une autre',
      b.etat());
    b.fermer();
  }
}
{
  // D.16 — cache : froid, chaud, et au-delà de la borne de 95 000 octets
  for (const volume of ['courant', 'haut']) {
    const srv = B.serveur(null, { etat: 'oui', volume });
    const froid = JSON.parse(srv.appeler('reponseEtatPublic_'));
    const chaud = JSON.parse(srv.appeler('reponseEtatPublic_'));
    const octets = Buffer.byteLength(JSON.stringify(froid));
    vrai(froid.cache === 'neuf' && chaud.cache === 'chaud',
      'D.16 (' + volume + ', ' + octets + ' o) ⭐⭐ cache froid puis CHAUD — même au-delà de la borne',
      { froid: froid.cache, chaud: chaud.cache });
    const a = JSON.parse(srv.appeler('reponseEtatPublic_'));
    delete a.servi_le; delete chaud.servi_le;
    vrai(JSON.stringify(a) === JSON.stringify(chaud),
      'D.17 (' + volume + ') ⭐⭐ ce qui ressort du cache est EXACTEMENT ce qui y est entré (recollage fidèle)');
    vrai(a.version === froid.version,
      'D.18 (' + volume + ') ⭐⭐ ⛔ une seule version sort du cache — jamais un assemblage de deux');
  }
  // Le TÉMOIN : au volume haut, le backend figé ne mettait RIEN en cache.
  const avant = B.serveur(B.BACKEND_AVANT(), { etat: 'oui', volume: 'haut' });
  const { resumer } = require(path.join(B.BACKEND, 'tests', 'banc-cout', 'instrumentation'));
  avant.getMesure({ action: 'getAll' });
  const s2 = resumer(avant.getMesure({ action: 'getAll' }).mesure);
  vrai(s2.ouvertures === 1 && s2.lectures > 0,
    'D.19 ⭐⭐ TÉMOIN — volume haut, backend figé : le second appel RELISAIT le classeur (' +
    s2.ouvertures + ' ouverture, ' + s2.lectures + ' lectures). Le cache était perdu au pire moment.');
}

/* ══════════════════════════════════════════════════════════════════════════
   E — ACCESSIBILITÉ ET MOBILE
   ══════════════════════════════════════════════════════════════════════════ */
{
  const html = lire('tournoi.html');
  const b = await B.banc({ etat: 'oui' });

  const onglets = b.doc.querySelectorAll('.onglet[data-onglet]');
  vrai(onglets.length === 2 && onglets.every((o) => o.getAttribute('id')),
    'E.1 ⭐⭐ chaque onglet porte un IDENTIFIANT stable', onglets.map((o) => o.getAttribute('id')));
  vrai(onglets.every((o) => b.doc.getElementById(o.getAttribute('aria-controls'))),
    'E.2 ⭐⭐ `aria-controls` de chaque onglet désigne un panneau qui EXISTE');
  vrai(['vue-equipe', 'vue-classements'].every((id) => {
    const p = b.doc.getElementById(id);
    return p.getAttribute('role') === 'tabpanel' &&
           b.doc.getElementById(p.getAttribute('aria-labelledby')) &&
           p.getAttribute('tabindex') === '0';
  }), 'E.3 ⭐⭐ chaque panneau est un `tabpanel`, ÉTIQUETÉ par son onglet, et FOCALISABLE');

  const tabindex = () => onglets.map((o) => o.getAttribute('tabindex')).join(',');
  vrai(tabindex() === '0,-1', 'E.4 ⭐⭐ un SEUL arrêt de tabulation dans le groupe', tabindex());
  await b.touche('onglet-equipe', 'ArrowRight');
  vrai(tabindex() === '-1,0' && b.doc.getElementById('onglet-classements').getAttribute('aria-selected') === 'true',
    'E.5 ⭐⭐ « → » sélectionne l’onglet suivant, et le focus le suit', tabindex());
  vrai(b.doc.activeElement && b.doc.activeElement.getAttribute('id') === 'onglet-classements',
    'E.6 ⭐⭐ le FOCUS est bien porté sur l’onglet activé');
  await b.touche('onglet-classements', 'ArrowRight');
  vrai(b.doc.getElementById('onglet-equipe').getAttribute('aria-selected') === 'true',
    'E.7 ⭐ la navigation BOUCLE (dernier → premier)');
  await b.touche('onglet-equipe', 'End');
  vrai(b.doc.getElementById('onglet-classements').getAttribute('aria-selected') === 'true',
    'E.8 ⭐ « Fin » va au dernier onglet');
  await b.touche('onglet-classements', 'Home');
  vrai(b.doc.getElementById('onglet-equipe').getAttribute('aria-selected') === 'true',
    'E.9 ⭐ « Début » va au premier');

  const zone = b.doc.getElementById('etat-public');
  vrai(zone.getAttribute('role') === 'status' && zone.getAttribute('aria-live') === 'polite',
    'E.10 ⭐⭐ le bandeau d’état est une RÉGION DE STATUT annoncée sans voler le focus');
  vrai(/<a class="lien-evitement" href="#contenu">/.test(html) && /id="contenu"/.test(html),
    'E.11 ⭐ le lien d’évitement mène à une cible qui existe');
  b.fermer();
}
{
  /* RENDU MOBILE — analyse STATIQUE de la feuille publique. ⚠️ Annoncée comme telle : elle ne
     remplace pas un navigateur, mais elle mord sur ce qui casse réellement à 320 px. */
  const css = lire('css/tournoi-public.css');
  const html = lire('tournoi.html');
  vrai(/<meta name="viewport" content="width=device-width, initial-scale=1\.0">/.test(html),
    'E.12 ⭐⭐ la page déclare le viewport mobile — sans lui, 320 px n’existe pas');
  vrai(!/initial-scale=1[^"]*(maximum-scale|user-scalable\s*=\s*no)/.test(html),
    'E.13 ⭐⭐ le ZOOM n’est jamais bloqué');
  const largeursFixes = (css.match(/(?:^|[^-\w])width\s*:\s*(\d{3,})px/g) || [])
    .filter((m) => parseInt(m.replace(/\D/g, ''), 10) > 320);
  vrai(largeursFixes.length === 0,
    'E.14 ⭐⭐ aucune largeur FIXE supérieure à 320 px : pas de débordement horizontal', largeursFixes);
  [320, 375, 768].forEach((l) => {
    const regles = (css.match(/@media\s*\(max-width\s*:\s*(\d+)px\)/g) || [])
      .map((m) => parseInt(m.replace(/\D/g, ''), 10)).filter((n) => n >= l);
    vrai(regles.length > 0, 'E.15 (' + l + ' px) ⭐ une règle adaptative couvre cette largeur', regles);
  });
  vrai(/min-height:\s*44px/.test(css),
    'E.16 ⭐ au moins une cible tactile est portée à 44 px (bouton « Réessayer »)');
  vrai(/prefers-reduced-motion/.test(css),
    'E.17 ⭐ `prefers-reduced-motion` est honoré');
  vrai(/etat-alerte/.test(css) && /⚠️|⛔/.test(lire('js/tournoi.js')),
    'E.18 ⭐⭐ l’alerte ne repose PAS sur la seule couleur : un pictogramme la double');
  vrai(/overflow-wrap:\s*anywhere/.test(css),
    'E.19 ⭐ le bandeau d’état coupe ses mots plutôt que d’élargir la page');
}
{
  /* PARTENAIRES ET IMAGES DISTANTES — disponible, absente, sans dimensions, sans alternative. */
  const sponsors = lire('js/sponsors.js');
  vrai(/lh3\.googleusercontent\.com/.test(sponsors),
    'E.20 ⭐ (constat) les logos partenaires viennent bien d’une adresse distante');
  vrai(/class="sp-logo-img"[^>]*alt=|alt="/.test(sponsors),
    'E.21 ⭐ les images partenaires portent un texte alternatif');
  const b = await B.banc({ etat: 'oui' });
  vrai(b.externes.length === 0,
    'E.22 ⭐⭐ à l’ouverture, AUCUNE adresse extérieure n’est appelée par le banc — une image absente, ' +
    'lente ou en erreur ne peut donc pas bloquer le rendu : rien ne l’attend', b.externes);
  vrai(b.etat().phase === 'publie',
    'E.23 ⭐⭐ … et la page est servie complètement malgré cela : le rendu ne DÉPEND pas des logos');
  b.fermer();
}

/* ══════════════════════════════════════════════════════════════════════════
   F — RESSOURCES MÊLÉES ET COMPATIBILITÉ CROISÉE
   ══════════════════════════════════════════════════════════════════════════ */
{
  /* F.1 — ANCIEN frontend / NOUVEAU backend : l'ancienne page lisait `getAll`, qui existe
     toujours. ⛔ Elle continue donc de fonctionner — et de masquer côté navigateur. Ce contrôle
     le CONSTATE plutôt que de le promettre : c'est la raison pour laquelle la version de
     `js/tournoi.js` a changé, et pourquoi le déploiement doit suivre. */
  const srv = B.serveur(null, { etat: 'masque' });
  const parAncien = srv.getMesure({ action: 'getAll' }).reponse;
  vrai(parAncien.public === false && parAncien.matchs.length === 0 && parAncien.equipes.length === 0,
    'F.1 ⭐⭐ ANCIEN frontend public / NOUVEAU backend : une page en cache qui appelle encore ' +
    '`getAll` sur un tournoi masqué reçoit un état VIDE. ⛔ Elle n’obtient AUCUNE donnée non ' +
    'publiée ; elle affiche « rien à montrer » au lieu de tomber.', parAncien);
  const srvPublie = B.serveur(null, { etat: 'oui' });
  const parAncienPublie = srvPublie.getMesure({ action: 'getAll' }).reponse;
  vrai(Array.isArray(parAncienPublie.matchs) && parAncienPublie.matchs.length > 0,
    'F.1 bis ⭐ … et la MÊME page en cache continue de fonctionner quand le tournoi EST publié : ' +
    'la fermeture ne casse que ce qu’elle doit casser');

  /* F.2 — NOUVEAU frontend / ANCIEN backend : échec FERMÉ, déjà éprouvé en C.14/C.15. */
  const b = await B.banc({ etat: 'oui', backend: B.BACKEND_AVANT() });
  vrai(b.etat().phase === 'incompatible',
    'F.2 ⭐⭐ NOUVEAU frontend / ANCIEN backend : échec FERMÉ — ⛔ jamais une réponse ancienne ' +
    'présentée comme fraîche');
  b.fermer();
}
{
  /* F.3 — RESSOURCES MÊLÉES : `js/api.js` dans sa version d'AVANT, avec le `tournoi.js` de
     MAINTENANT. ⭐ C'est exactement ce qu'un navigateur au cache chaud servirait si l'adresse
     d'`api.js` n'avait pas changé. */
  const b = await B.banc({ etat: 'oui', js: B.lecteurMele(['js/api.js']) });
  vrai(b.etat().phase === 'publie' && b.requetes().length === 1,
    'F.3 ⭐ avec l’`api.js` FIGÉ, la page fonctionne encore (le changement est additif)…', b.etat().phase);
  const html = lire('tournoi.html');
  vrai(/src="js\/api\.js\?v=refonte-ciel-verre-20260920-api2"/.test(html),
    'F.4 ⭐⭐ … mais `tournoi.html` demande désormais une ADRESSE DISTINCTE pour `js/api.js` : ' +
    'un cache chaud ne peut plus mêler deux versions de ce fichier');
  vrai(/src="js\/api\.js\?v=refonte-ciel-verre-20260920-api2"/.test(lire('perfs.html')),
    'F.5 ⭐ `perfs.html` fait de même');
  vrai(html.indexOf('?v=refonte-ciel-verre-20260920"') !== -1,
    'F.6 ⭐⭐ ⛔ la version GLOBALE de la livraison reste `refonte-ciel-verre-20260920`, intacte');
  b.fermer();
}

console.log('\n──────────────────────────────────────────────');
if (process.exitCode) console.log('ÉCHEC — voir ci-dessus.');
else console.log('OK — ' + c.n + ' contrôles de surface des pages publiques.');
process.exit(process.exitCode || 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
