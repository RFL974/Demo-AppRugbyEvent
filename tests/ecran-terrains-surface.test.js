#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ÉCRAN « TERRAINS » — SURFACE COMPLÈTE (lot « Terrains »)
 * ============================================================================
 *  ▶ node tests/ecran-terrains-surface.test.js [--frontend avant|<racine>] [--backend avant|<Code.gs>]
 *
 *  Vrais modules (api.js, admin.js, admin-terrains.js, admin-reglages.js, assistant.js…) et vraies cartes
 *  d'admin.html, contre le vrai Code.gs (banc-ecran-terrains.js). La carte « Terrains & répartition » est
 *  construite par le VRAI `injecterTerrains()`, avec SES écouteurs délégués.
 *
 *    L — gestes LOCAUX : déclarer un terrain, régler couloir et cotes, « Répartir », mettre un mini-terrain
 *        de côté, pivoter, « Valider le placement ». Aucun n'émet la moindre requête, aucun ne perd le focus ;
 *    A — AJOUT et RETRAIT d'une fiche : la nouvelle fiche s'ouvre et prend le focus ; le retrait DEMANDE
 *        confirmation et, refusé, ne retire rien ;
 *    S — « Enregistrer les terrains » : UNE requête, l'écran suit la réponse relue, le plan enregistré ;
 *    D — le DÉPLACEMENT d'un terrain sur le plan est une modification VISIBLE : l'assistant la voit, et la
 *        position se règle aussi au clavier (champs X / Y de la fiche) ;
 *    C — « Appliquer aux catégories » : n'écrase JAMAIS un réglage changé ailleurs, et le dit ;
 *    N — DOUBLE CLIC : un seul envoi, jamais deux (ni pour « Enregistrer », ni pour « Appliquer ») ;
 *    P — PANNES : réponse perdue, silence, erreur serveur, verrou occupé — le bouton est rendu, le message dit
 *        que l'enregistrement n'est pas confirmé, et rien n'est rejoué tout seul ;
 *    R — REPRISE : une série d'« Appliquer » interrompue dit ce qui est acquis, et le second clic la termine
 *        sans rien écrire deux fois ;
 *    V — VERSIONS MÊLÉES : ancien frontend avec nouveau backend, et l'inverse — tout marche.
 *  ⛔ Aucun réseau, aucun service Google réel ; tournoi fictif.
 *  ⚠️ Ce que le mini-DOM ne peut pas prouver (géométrie SVG, pointeur, accordéon exclusif des fiches) est
 *     vérifié à part dans un vrai Chromium — voir le rapport du lot.
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
const banc = (o) => B.banc(Object.assign({ lire: LIRE, backend: CODE }, o || {}));

(async () => {

/* ============================ L — gestes LOCAUX : zéro requête, focus gardé ============================ */
await essai('L', async () => {
  const gestes = [
    ['frapper le nom d\'un grand terrain', (b) => b.frapper(0, 'tp-nom', 'Terrain Municipal'), 'tp-nom'],
    ['frapper la longueur', (b) => b.frapper(0, 'tp-l', '110'), 'tp-l'],
    ['frapper le code court', (b) => b.frapper(0, 'tp-code', 'MUN'), 'tp-code'],
    ['frapper l\'orientation', (b) => b.frapper(0, 'tp-rot', '35'), 'tp-rot'],
    ['changer le sport', (b) => b.choisir(0, 'tp-type', 'foot'), 'tp-type'],
    ['changer la surface', (b) => b.choisir(0, 'tp-nature', 'Synthétique'), 'tp-nature'],
    ['régler le couloir', (b) => b.reglerCouloir(5), 'couloir-terrain'],
    ['régler une cote U10', (b) => b.reglerDimension('U10', 'dim-l', 45), 'dim-l'],
    ['régler l\'en-but U10', (b) => b.reglerDimension('U10', 'dim-enbut', 5), 'dim-enbut'],
    ['cocher « terrain entier » U14', (b) => b.cocherPlein('U14'), 'dim-plein'],
    ['« Répartir les terrains »', (b) => b.repartir(), null],
    ['mettre un mini-terrain de côté', async (b) => { await b.repartir(); return b.retirerTuile(b.tuileNonPleine()); }, null],
    ['pivoter une pastille', async (b) => { await b.repartir(); await b.retirerTuile(b.tuileNonPleine()); return b.pivoterPastille(0); }, null],
    ['« Valider le placement »', async (b) => { await b.repartir(); return b.valider(); }, null]
  ];
  for (const [nom, geste, focus] of gestes) {
    const b = await banc();
    const r = await geste(b);
    t.vrai(r.requetes.length === 0, 'L — ' + nom + ' : AUCUNE requête (ni bloquante, ni en arrière-plan)', r.resume);
    if (focus) t.vrai(String(b.focus()).indexOf(focus) !== -1, 'L — ' + nom + ' : le focus reste sur le champ saisi', b.focus());
  }
  // La frappe met bien à jour ce qui en dépend, sans rien perdre.
  const b = await banc();
  await b.frapper(0, 'tp-nom', 'Terrain Municipal');
  t.vrai(b.fiche(0).querySelector('.tp-nom').value === 'Terrain Municipal', 'L — la saisie n\'est jamais écrasée par le rendu');
  await b.reglerDimension('U10', 'dim-enbut', 5);
  t.vrai(/au sol : 50 × 30 m/.test(b.auSol('U10') || ''), 'L — le gabarit au sol suit la frappe, sans requête', b.auSol('U10'));
});

/* ============================ A — ajout et retrait d'une fiche ============================ */
await essai('A', async () => {
  const b = await banc();
  const avant = b.fiches().length;
  const r = await b.ajouterTerrain();
  t.vrai(r.requetes.length === 0 && b.fiches().length === avant + 1, 'A.1 — « + Ajouter un grand terrain » : une fiche de plus, zéro requête');
  t.vrai(String(b.focus()).indexOf('tp-nom') !== -1,
    'A.2 — ⭐ le focus se pose sur le champ « Nom du terrain » de la nouvelle fiche', b.focus());

  const refus = await B.banc({ lire: LIRE, backend: CODE, dialogues: [false] });
  const n = refus.fiches().length;
  const r2 = await refus.supprimerTerrain(1);
  t.vrai(refus.dialogues.length === 1, 'A.3 — ⭐ « Supprimer ce terrain » DEMANDE confirmation', refus.dialogues);
  t.vrai(refus.fiches().length === n && r2.requetes.length === 0,
    'A.4 — ⭐ confirmation refusée : la fiche et sa saisie restent, et rien n\'est parti', refus.fiches().length);

  const accepte = await banc();
  await accepte.supprimerTerrain(1);
  t.vrai(accepte.fiches().length === n - 1, 'A.5 — confirmation acceptée : la fiche est retirée', accepte.fiches().length);
});

/* ============================ S — « Enregistrer les terrains » ============================ */
await essai('S', async () => {
  const b = await banc();
  await b.reglerCouloir(7);
  const r = await b.enregistrer();
  t.vrai(r.requetes.length === 1 && r.requetes[0].action === 'enregistrerPlanTerrains',
    'S.1 — UNE seule requête, et c\'est bien l\'écriture du plan', r.resume);
  t.vrai(b.planServeur().couloir_terrain_m === '7', 'S.2 — le couloir est enregistré', b.planServeur().couloir_terrain_m);
  t.vrai(/Terrains enregistrés/.test(b.messageTerrains() || ''), 'S.3 — l\'écran le dit', b.messageTerrains());
  t.vrai(b.propre(), 'S.4 — l\'assistant reprend sa photo : plus rien « à enregistrer »');
  const r2 = await b.enregistrer();
  const rep = r2.requetes[0].reponse;
  t.vrai(r2.requetes.length === 1 && (!rep.contrat || (rep.modifies && rep.modifies.length === 0)),
    'S.5 — un second clic sans modification : une requête, et le serveur n\'écrit rien', rep.modifies);
});

/* ============================ D — le déplacement sur le plan est VISIBLE ============================ */
await essai('D', async () => {
  const b = await banc();
  const champsXY = b.doc.querySelectorAll('#liste-terrains-physiques .tp-x, #liste-terrains-physiques .tp-y').length;
  t.vrai(champsXY === b.fiches().length * 2,
    'D.1 — ⭐ chaque fiche porte ses champs de POSITION X / Y (le plan est réglable au clavier)', champsXY);

  await b.repartir();
  b.global('assistantMarquerPropre(document.getElementById("zone-terrains"))');
  t.vrai(b.propre(), 'D.2 — état de départ : rien « à enregistrer »');
  // Exactement ce que fait `bouger()` du glisser de la plaque de nom (le pointeur est vérifié dans Chromium).
  b.global('positionsTerrains["RUG1"] = { x: 250, y: 120 }; ecrirePositionDansFiche(0, 250, 120);');
  t.vrai(!b.propre(), 'D.3 — ⭐ après un déplacement, l\'assistant voit une modification NON ENREGISTRÉE');
  const lu = JSON.parse(b.global('JSON.stringify(lireTerrainsDuFormulaire()[0])'));
  t.vrai(lu.x === 250 && lu.y === 120, 'D.4 — la position part bien avec le plan', lu);
  await b.enregistrer();
  const enregistre = JSON.parse(b.planServeur().terrains_physiques)[0];
  t.vrai(enregistre.x === 250 && enregistre.y === 120, 'D.5 — elle est enregistrée', enregistre);

  // Réglée au CLAVIER (sans aucun glisser), elle est prise en compte de la même façon.
  const c = await banc();
  const cx = c.fiche(0).querySelector('.tp-x'), cy = c.fiche(0).querySelector('.tp-y');
  cx.value = '80'; cy.value = '40';
  await c.declencher(cx, 'input');
  await c.enregistrer();
  const clavier = JSON.parse(c.planServeur().terrains_physiques)[0];
  t.vrai(clavier.x === 80 && clavier.y === 40, 'D.6 — ⭐ une position TAPÉE au clavier est retenue', clavier);

  // Un champ laissé VIDE reste « pas de position » : le placement automatique s'applique, comme avant.
  const v = await banc();
  t.vrai(v.fiche(0).querySelector('.tp-x').value === '', 'D.7 — un plan sans position affiche des champs vides');
  const rv = await v.repartir();
  t.vrai(rv.requetes.length === 0 && v.tuiles().length > 0, 'D.8 — « Répartir » place quand même les terrains', v.tuiles().length);
});

/* ============================ C — « Appliquer » n'écrase pas un état plus récent ============================ */
await essai('C', async () => {
  const b = await banc();
  await b.parcoursRepartition();
  // Pendant que l'écran est ouvert, quelqu'un d'autre change deux réglages de U10.
  b.srv.appeler('enregistrerCategorie', b.srv.classeur,
    Object.assign({}, b.srv.cat('U10'), { nb_poules: '4', duree_mi_temps_min: '10' }));
  const r = await b.appliquer();
  const u10 = b.srv.cat('U10');
  t.vrai(u10.nb_poules === '4' && u10.duree_mi_temps_min === '10',
    'C.1 — ⭐ les réglages changés ailleurs sont CONSERVÉS (ils étaient ramenés en arrière, en silence)',
    { nb_poules: u10.nb_poules, duree: u10.duree_mi_temps_min });
  t.vrai(/RUG2-/.test(String(u10.terrains)), 'C.2 — et les terrains sont bien appliqués', u10.terrains);
  t.vrai(b.dialogues.some((d) => /Modifié entre-temps/.test(d)),
    'C.3 — ⭐ l\'organisateur en est AVERTI', b.dialogues.slice(-1));
  const envoi = r.requetes[0].corps;
  const demandes = JSON.parse(envoi.categories);
  t.vrai(demandes.every((d) => d.mode === 'modifier' && d.base && typeof d.base === 'object'),
    'C.4 — chaque catégorie de l\'envoi porte `mode: modifier` et sa `base` (fusion à trois voies)',
    demandes.map((d) => ({ c: d.categorie, mode: d.mode, base: !!d.base })));
  t.vrai(r.requetes.length === 1, 'C.5 — ⭐ UNE SEULE requête (il y en avait 4)', r.resume);
  // ⭐ L'écran doit suivre la ligne RELUE, pas sa copie envoyée : sinon il afficherait un état que le
  //   classeur n'a pas, et la prochaine écriture repartirait d'une `base` fausse.
  const localU10 = JSON.parse(b.global(
    'JSON.stringify((configCourante.categories.filter(function(c){return c.categorie==="U10";})[0]||{}))'));
  t.vrai(String(localU10.nb_poules) === String(b.srv.cat('U10').nb_poules) &&
    String(localU10.terrains) === String(b.srv.cat('U10').terrains),
    'C.6 — ⭐ l\'écran porte EXACTEMENT ce que le classeur porte (ligne relue, pas copie envoyée)',
    { ecran: { p: localU10.nb_poules, t: localU10.terrains },
      serveur: { p: b.srv.cat('U10').nb_poules, t: b.srv.cat('U10').terrains } });
});

/* ============================ G — l'écriture GROUPÉE ============================ */
await essai('G', async () => {
  const b = await banc();
  await b.parcoursRepartition();
  const r = await b.appliquer();
  const req = r.requetes[0];
  t.vrai(r.requetes.length === 1 && req.action === 'appliquerRepartitionTerrains',
    'G.1 — ⭐ « Appliquer » = UNE requête, UNE exécution serveur, UN verrou', r.resume);
  t.vrai(req.reponse.contrat === 'ecriture-v1' && Array.isArray(req.reponse.modifies) &&
    Array.isArray(req.reponse.categories) && req.reponse.config,
    'G.2 — la réponse est au contrat et porte l\'état final RELU', Object.keys(req.reponse));
  t.vrai(Object.keys(b.terrainsCategories()).length >= 3 && /RUG/.test(String(b.srv.cat('U10').terrains)),
    'G.3 — les catégories et la composition sont écrites', b.terrainsCategories());
  t.vrai(!!b.planServeur().repartition_grands_terrains,
    'G.4 — la composition des grands terrains part dans la MÊME requête', b.planServeur().repartition_grands_terrains);

  // Rejeu à l'identique : rien n'est réécrit, et l'écran le DIT.
  const rj = await banc();
  await rj.parcoursRepartition();
  await rj.appliquer();
  await rj.repartir(); await rj.valider();
  const r2 = await rj.appliquer();
  t.vrai(r2.requetes.length === 1 && JSON.stringify(r2.requetes[0].reponse.modifies) === '[]',
    'G.5 — ⭐ rejeu du MÊME geste : une requête, rien d\'écrit', r2.requetes[0].reponse.modifies);
  t.vrai(rj.dialogues.some((d) => /Déjà appliqué/.test(d)),
    'G.6 — et l\'écran distingue « déjà appliqué » de « appliqué »', rj.dialogues.slice(-1));

  // Conflit sur le champ CONCERNÉ : le serveur écarte TOUT, aucune catégorie n'est touchée.
  const c = await banc();
  await c.parcoursRepartition();
  const avant = c.terrainsCategories();
  c.srv.appeler('enregistrerCategorie', c.srv.classeur, Object.assign({}, c.srv.cat('U10'), { terrains: 'AUTRE-9' }));
  const rc = await c.appliquer();
  t.vrai(rc.requetes[0].reponse.code === 'modification_concurrente' &&
    JSON.stringify(rc.requetes[0].reponse.modifies) === '[]',
    'G.7 — ⭐ conflit : le serveur refuse et déclare n\'avoir rien écrit', rc.requetes[0].reponse.code);
  const apres = c.terrainsCategories();
  t.vrai(Object.keys(avant).every((k) => k === 'U10' || apres[k] === avant[k]) && apres.U10 === 'AUTRE-9',
    'G.8 — ⭐ TOUT OU RIEN : aucune AUTRE catégorie n\'a été modifiée', { avant, apres });
  t.vrai(/Recharge l’écran/.test(c.messageRepartition() || ''),
    'G.9 — le message dit qu\'il faut DÉCIDER, pas réessayer', c.messageRepartition());

  // ⭐ PANNE AU MILIEU DES ÉCRITURES — l'écran ne doit JAMAIS annoncer un succès.
  //   ⛔ L'exécution n'est PAS transactionnelle : le serveur relit et dit ce qui est appliqué.
  const pa = await B.banc({ lire: LIRE, backend: CODE, avantServir: (entree, srv) => {
    if (entree.action !== 'appliquerRepartitionTerrains' || srv.__panneFaite) return;
    srv.__panneFaite = true;
    const plage = Object.getPrototypeOf(srv.feuilles.get('Config').getRange(1, 1));
    const origine = plage.setValues;
    let vues = 0;
    plage.setValues = function () {
      if (vues++ === 1) { plage.setValues = origine; throw new Error('Service Sheets indisponible (panne injectée)'); }
      return origine.apply(this, arguments);
    };
  } });
  await pa.parcoursRepartition();
  const rpa = await pa.appliquer();
  const rep = rpa.requetes[0].reponse;
  t.vrai(rep.code === 'application_partielle' && rep.etabli === true && !rep.ok,
    'G.13 — ⭐ panne au milieu : le serveur répond `application_partielle`, JAMAIS un succès', rep.code);
  t.vrai(/Application PARTIELLE/.test(pa.messageRepartition() || '') &&
    /Déjà enregistrées/.test(pa.messageRepartition() || '') && /Restent à appliquer/.test(pa.messageRepartition() || ''),
    'G.14 — ⭐ l\'écran dit « application PARTIELLE », ce qui est acquis et ce qui reste', pa.messageRepartition());
  t.vrai(!pa.dialogues.some((d) => /^ALERTE ✅/.test(d)),
    'G.15 — ⛔ aucun message de succès n\'est affiché', pa.dialogues.slice(-1));
  t.vrai(pa.boutonAppliquer() && !pa.boutonAppliquer().disabled, 'G.16 — le bouton reste utilisable');
  // La reprise complète ce qui manque, puis un rejeu final n'écrit rien.
  const r2pa = await pa.appliquer();
  t.vrai(r2pa.requetes.length === 1 && r2pa.requetes[0].reponse.ok === true,
    'G.17 — ⭐ la reprise du MÊME geste aboutit, en une requête', r2pa.resume);
  t.vrai(/RUG/.test(String(pa.srv.cat('U10').terrains)) && !!pa.planServeur().repartition_grands_terrains,
    'G.18 — état final complet : catégories ET composition', pa.terrainsCategories());
  await pa.repartir(); await pa.valider();
  const r3pa = await pa.appliquer();
  t.vrai(JSON.stringify(r3pa.requetes[0].reponse.modifies) === '[]',
    'G.19 — ⭐ un rejeu après achèvement n\'écrit RIEN', r3pa.requetes[0].reponse.modifies);

  // Demande invalide : refusée AVANT le verrou, zéro écriture.
  const inv = await banc();
  const vide = inv.srv.postMesure({ action: 'appliquerRepartitionTerrains', cle: B.MD.CLE_ADMIN, categories: '[]' });
  t.vrai(vide.reponse.code === 'demande_invalide' &&
    vide.mesure.appels.filter((a) => a.op === 'tryLock' || a.op === 'openById').length === 0,
    'G.10 — ⭐ demande invalide : refus AVANT le verrou ET avant le classeur', vide.reponse);
  const illisible = inv.srv.postMesure({ action: 'appliquerRepartitionTerrains', cle: B.MD.CLE_ADMIN, categories: '[{' });
  t.vrai(illisible.reponse.code === 'demande_invalide' &&
    illisible.mesure.appels.filter((a) => a.op === 'tryLock').length === 0,
    'G.11 — charge illisible : même refus, aucun verrou', illisible.reponse.error);

  // Verrou occupé : rien écrit.
  const occ = await B.banc({ lire: LIRE, backend: CODE,
    panne: (e) => (e.action === 'appliquerRepartitionTerrains' ? 'verrou-occupe' : null) });
  await occ.parcoursRepartition();
  const avantOcc = JSON.stringify(occ.terrainsCategories());
  await occ.appliquer();
  t.vrai(JSON.stringify(occ.terrainsCategories()) === avantOcc,
    'G.12 — verrou occupé : aucune catégorie modifiée', occ.terrainsCategories());
});

/* ============================ N — double clic ============================ */
await essai('N', async () => {
  const b = await banc();
  const r = await b.enregistrerDeuxFois();
  t.vrai(r.requetes.length === 1, 'N.1 — double clic sur « Enregistrer les terrains » : UNE écriture', r.resume);

  const a = await banc();
  await a.parcoursRepartition();
  const r2 = await a.appliquerDeuxFois();
  const fenetres = a.dialogues.filter((d) => !/^ALERTE/.test(d)).length;
  t.vrai(fenetres === 1, 'N.2 — ⭐ double clic sur « Appliquer » : UNE SEULE fenêtre de confirmation', fenetres);
  t.vrai(r2.requetes.length === 1, 'N.3 — ⭐ et UNE SEULE écriture (il y en avait huit)', r2.resume);

  // Une confirmation ANNULÉE rend tout : le geste suivant n'est pas verrouillé.
  const n = await B.banc({ lire: LIRE, backend: CODE, dialogues: [false] });
  await n.parcoursRepartition();
  const rn = await n.appliquer();
  t.vrai(rn.requetes.length === 0, 'N.4 — confirmation annulée : rien n\'est parti', rn.resume);
  const rn2 = await n.appliquer();
  t.vrai(rn2.requetes.length === 1, 'N.5 — et le geste reste possible ensuite (l\'opération a bien été rendue)', rn2.resume);
});

/* ============================ P — pannes ============================ */
await essai('P', async () => {
  const cas = [
    ['reseau-apres', 'connexion coupée après l\'envoi', /non confirmé/],
    ['silence', 'serveur muet', /non confirmé/],
    ['http500-apres', 'erreur serveur', /non confirmé/],
    ['verrou-occupe', 'verrou occupé', /momentanément occupé/]
  ];
  for (const [panne, libelle, attendu] of cas) {
    const b = await B.banc({ lire: LIRE, backend: CODE, panne: (e) => (e.action === 'enregistrerPlanTerrains' ? panne : null) });
    await b.reglerCouloir(7);
    const r = await b.enregistrer();
    const bouton = b.boutonEnregistrer();
    t.vrai(r.requetes.length === 1, 'P — ' + libelle + ' : une seule émission, rien n\'est rejoué tout seul', r.resume);
    t.vrai(bouton && !bouton.disabled && bouton.textContent === 'Enregistrer les terrains',
      'P — ' + libelle + ' : ⭐ le bouton est RENDU (il restait sur « Enregistrement… » pour toujours)',
      bouton && bouton.textContent);
    t.vrai(attendu.test(b.messageTerrains() || ''), 'P — ' + libelle + ' : le message dit quoi faire', b.messageTerrains());
    t.vrai(b.id('couloir-terrain').value === '7', 'P — ' + libelle + ' : la saisie reste à l\'écran');
  }
});

/* ============================ R — reprise, réponse perdue, application partielle ============================ */
await essai('R', async () => {
  // ① ÉCRITURE GROUPÉE — réponse perdue APRÈS une application complète : l'écran ne peut pas savoir,
  //    il le DIT, et le second clic ne réécrit rien (le serveur compare et ne trouve rien à changer).
  const b = await B.banc({ lire: LIRE, backend: CODE,
    panne: (e, journal) => (e.action === 'appliquerRepartitionTerrains' && journal.filter(
      (x) => x.action === 'appliquerRepartitionTerrains').length === 1 ? 'reseau-apres' : null) });
  await b.parcoursRepartition();
  await b.appliquer();
  const msg = b.messageRepartition() || '';
  t.vrai(/NON CONFIRMÉE/.test(msg) && /Reclique/.test(msg),
    'R.1 — ⭐ réponse perdue : « application NON CONFIRMÉE », et l\'écran invite à recliquer', msg);
  t.vrai(b.boutonAppliquer() && !b.boutonAppliquer().disabled, 'R.2 — le bouton reste cliquable');
  t.vrai(/RUG/.test(String(b.srv.cat('U10').terrains)),
    'R.3 — le serveur avait bel et bien écrit (c\'est la réponse qui s\'est perdue)', b.terrainsCategories());
  const r2 = await b.appliquer();
  t.vrai(r2.requetes.length === 1 && JSON.stringify(r2.requetes[0].reponse.modifies) === '[]',
    'R.4 — ⭐ reprise IDEMPOTENTE : une requête, et rien n\'est réécrit', r2.requetes[0].reponse.modifies);
  t.vrai(b.dialogues.some((d) => /Déjà appliqué/.test(d)),
    'R.5 — et l\'écran dit « déjà appliqué », pas « appliqué »', b.dialogues.slice(-1));

  // ② REPLI (backend d'avant) — la série peut, elle, s'arrêter au milieu : on dit ce qui est acquis.
  let k = 0;
  const v = await B.banc({ lire: LIRE, backend: B.BACKEND_AVANT(),
    panne: (e) => (e.action === 'enregistrerCategorie' && ++k === 2 ? 'reseau-apres' : null) });
  await v.parcoursRepartition();
  await v.appliquer();
  const msgV = v.messageRepartition() || '';
  t.vrai(/Déjà enregistrées/.test(msgV) && /Restent à appliquer/.test(msgV),
    'R.6 — ⭐ repli interrompu : l\'écran DIT ce qui est acquis et ce qui reste', msgV);
  const r3 = await v.appliquer();
  t.vrai(r3.requetes.length === 4, 'R.7 — la reprise du repli rejoue la série (sans redemander la capacité)', r3.resume);
  const apres = v.terrainsCategories();
  t.vrai(Object.keys(apres).every((c) => /RUG|^\d+$/.test(String(apres[c]))),
    'R.8 — l\'état final est complet et cohérent', apres);
  t.vrai(Object.keys(JSON.parse(v.planServeur().repartition_grands_terrains || '{}')).length > 0,
    'R.9 — la composition des grands terrains finit par être mémorisée', v.planServeur().repartition_grands_terrains);
});

/* ============================ K — LE PLAN AU CLAVIER ============================ */
await essai('K', async () => {
  const b = await banc();
  await b.repartir();
  const tuiles = b.doc.querySelectorAll('#repartition-carte g[data-tuile]');
  t.vrai(tuiles.length > 0 && tuiles.every((g) => g.getAttribute('tabindex') === '0' && g.getAttribute('role') === 'button'),
    'K.1 — ⭐ CHAQUE mini-terrain posé est atteignable au clavier (il n\'y en avait AUCUN)',
    tuiles.map((g) => g.getAttribute('tabindex')));
  const nom = b.nomTuile(tuiles[0].getAttribute('data-tuile'));
  t.vrai(/·/.test(nom) && /posé sur/.test(nom),
    'K.2 — ⭐ son NOM ACCESSIBLE dit sa catégorie, son identifiant, et qu\'il est POSÉ (et où)', nom);
  t.vrai(!!b.id('repart-annonce') && b.id('repart-annonce').getAttribute('aria-live') === 'polite',
    'K.3 — une zone d\'annonce `aria-live` existe, HORS du panneau réécrit');

  // Mettre de côté au clavier.
  const id = b.tuileNonPleine();
  const rc = await b.touche(b.tuileEl(id), 'Enter');
  t.vrai(rc.requetes.length === 0, 'K.4 — mettre de côté au clavier : AUCUNE requête', rc.resume);
  t.vrai(b.chips().length === 1, 'K.5 — le mini-terrain est bien mis de côté', b.chips().length);
  t.vrai(/mis de côté/.test(b.annonce() || ''), 'K.6 — l\'action est ANNONCÉE', b.annonce());
  t.vrai(String(b.focus()).indexOf('repart-chip') !== -1,
    'K.7 — ⭐ le focus suit le mini-terrain jusque dans sa pastille, après repeint', b.focus());
  t.vrai(/mis de côté/.test(b.nomChip(0) || ''),
    'K.8 — ⭐ la pastille dit, elle aussi, qu\'elle est MISE DE CÔTÉ', b.nomChip(0));

  // Pivoter la pastille, changer de terrain visé, la reposer.
  const rp = await b.touche(b.chipEl(0), 'r');
  t.vrai(rp.requetes.length === 0 && /pivoté/.test(b.annonce() || ''),
    'K.9 — R pivote la pastille, sans requête, et l\'annonce', b.annonce());
  const rt = await b.touche(b.chipEl(0), 't');
  t.vrai(rt.requetes.length === 0 && /Grand terrain d’accueil/.test(b.annonce() || ''),
    'K.10 — T change de grand terrain d\'accueil et le nomme', b.annonce());
  await b.touche(b.chipEl(0), 'r');                   // remise dans le sens d'origine
  const avantPose = b.tuiles().length;
  const rpose = await b.touche(b.chipEl(0), 'Enter');
  t.vrai(rpose.requetes.length === 0, 'K.11 — poser au clavier : AUCUNE requête', rpose.resume);
  t.vrai(b.tuiles().length === avantPose + 1 && b.chips().length === 0,
    'K.12 — ⭐ le mini-terrain est REPOSÉ sans le moindre glisser-déposer', { posees: b.tuiles().length });
  t.vrai(/posé sur/.test(b.annonce() || ''), 'K.13 — l\'emplacement retenu est ANNONCÉ', b.annonce());
  t.vrai(String(b.focus()).indexOf('carte-tuile-g') !== -1,
    'K.14 — et le focus suit le mini-terrain posé', b.focus());

  // Déplacer au clavier : un pas, un pas long, et un refus MOTIVÉ qui ne bouge rien.
  const d = await banc();
  await d.repartir();
  const idd = d.tuileNonPleine();
  const av = d.tuilePlan(idd);
  await d.touche(d.tuileEl(idd), 'ArrowDown');
  const ap = d.tuilePlan(idd);
  t.vrai(ap.y === av.y + 1 || /ne peut pas aller là/.test(d.annonce() || ''),
    'K.15 — une flèche déplace d\'un mètre, ou refuse en le disant', { av: av.y, ap: ap.y, a: d.annonce() });
  const avL = d.tuilePlan(idd);
  await d.touche(d.tuileEl(idd), 'ArrowDown', { shiftKey: true });
  const apL = d.tuilePlan(idd);
  t.vrai(apL.y === avL.y + 5 || /ne peut pas aller là/.test(d.annonce() || ''),
    'K.16 — Maj + flèche déplace de cinq mètres', { av: avL.y, ap: apL.y });
  let refus = null, fige = null;
  for (let i = 0; i < 300 && !refus; i++) {
    fige = d.tuilePlan(idd);
    await d.touche(d.tuileEl(idd), 'ArrowUp', { shiftKey: true });
    if (/ne peut pas aller là/.test(d.annonce() || '')) refus = d.annonce();
  }
  t.vrai(!!refus && /couloir|sortirait/.test(refus),
    'K.17 — ⭐ un placement REFUSÉ est annoncé AVEC SA RAISON', refus);
  t.vrai(JSON.stringify(d.tuilePlan(idd)) === JSON.stringify(fige),
    'K.18 — ⭐ et le mini-terrain n\'a PAS bougé', { fige, apres: d.tuilePlan(idd) });
  t.vrai(String(d.focus()).indexOf('carte-tuile-g') !== -1, 'K.19 — le focus reste sur le mini-terrain', d.focus());

  // Annuler.
  const a = await banc();
  await a.repartir();
  const avantTout = json(a.tuiles().slice().sort());
  const ida = a.tuileNonPleine();
  await a.touche(a.tuileEl(ida), 'Enter');
  const ra = await a.touche(a.chipEl(0), 'Escape');
  t.vrai(ra.requetes.length === 0, 'K.20 — annuler : AUCUNE requête', ra.resume);
  t.vrai(json(a.tuiles().slice().sort()) === avantTout && a.chips().length === 0,
    'K.21 — ⭐ Échap rend EXACTEMENT l\'état d\'avant le geste', { avant: avantTout, apres: a.tuiles().slice().sort() });
  t.vrai(/annulé/.test(a.annonce() || ''), 'K.22 — l\'annulation est annoncée', a.annonce());
  await a.touche(a.tuileEl(ida), 'Escape');
  t.vrai(/Rien à annuler/.test(a.annonce() || ''),
    'K.23 — une seconde annulation ne défait rien de plus, et le dit', a.annonce());

  // Le parcours clavier COMPLET n'émet rien.
  const z = await banc();
  await z.repartir();
  let total = 0;
  const idz = z.tuileNonPleine();
  for (const [cible, touche, extra] of [
    [() => z.tuileEl(idz), 'ArrowRight', null], [() => z.tuileEl(idz), 'ArrowLeft', { shiftKey: true }],
    [() => z.tuileEl(idz), 'r', null], [() => z.tuileEl(idz), 'Enter', null],
    [() => z.chipEl(0), 't', null], [() => z.chipEl(0), 'r', null], [() => z.chipEl(0), 'Enter', null],
    [() => z.tuileEl(z.tuiles()[0]), 'Escape', null]]) {
    const el = cible();
    if (!el) continue;
    total += (await z.touche(el, touche, extra)).requetes.length;
  }
  t.vrai(total === 0, 'K.24 — ⭐ le parcours clavier ENTIER : zéro appel réseau', total);
});

/* ============================ V — versions mêlées ============================ */
await essai('V', async () => {
  const combinaisons = [
    ['V.1', 'ancien frontend + NOUVEAU backend', { lire: B.LECTEUR_AVANT, backend: CODE }],
    ['V.2', 'NOUVEAU frontend + ancien backend', { lire: LIRE, backend: B.BACKEND_AVANT() }],
    ['V.3', 'ancien frontend + ancien backend', { lire: B.LECTEUR_AVANT, backend: B.BACKEND_AVANT() }]
  ];
  for (const [code, libelle, options] of combinaisons) {
    const b = await B.banc(options);
    await b.reglerCouloir(7);
    const r = await b.enregistrer();
    t.vrai(r.requetes.length === 1 && b.planServeur().couloir_terrain_m === '7',
      code + 'a ' + libelle + ' : « Enregistrer les terrains » marche, une requête', r.resume);
    const c = await B.banc(options);
    await c.parcoursRepartition();
    const r2 = await c.appliquer();
    // ⭐ Nouveau frontend + ancien backend : 1 requête de DÉTECTION explicitement refusée, puis les 4
    //   écritures historiques. Les autres combinaisons gardent leur compte propre.
    const attendu = (code === 'V.2') ? 5 : (options.lire === B.LECTEUR_AVANT ? 4 : 1);
    t.vrai(r2.requetes.length === attendu && /RUG/.test(String(c.srv.cat('U10').terrains)),
      code + 'b ' + libelle + ' : « Appliquer » marche (' + r2.requetes.length + ' requête(s))', r2.resume);
  }
  // Une position écrite par le NOUVEAU frontend survit à un réenregistrement par l'ANCIEN.
  const neuf = await banc();
  neuf.global('positionsTerrains["RUG1"] = { x: 250, y: 120 }; ecrirePositionDansFiche(0, 250, 120);');
  await neuf.enregistrer();
  const planNeuf = neuf.planServeur().terrains_physiques;
  const vieux = await B.banc({ lire: B.LECTEUR_AVANT, backend: CODE });
  vieux.global('configCourante.global.terrains_physiques = ' + json(planNeuf));
  vieux.global('injecterTerrains()');
  await vieux.enregistrer();
  const relu = JSON.parse(vieux.planServeur().terrains_physiques)[0];
  t.vrai(relu.x === 250 && relu.y === 120,
    'V.4 — ⭐ la position enregistrée par le nouveau frontend survit à un réenregistrement par l\'ancien', relu);
});

console.log('\n' + '─'.repeat(70) + '\nOK — ' + t.n + ' contrôles passés.');
})();
