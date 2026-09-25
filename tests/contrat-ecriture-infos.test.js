#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  GARDE-FOU — « Enregistrer les informations » au contrat d'écriture `ecriture-v1`
 * ============================================================================
 *  ▶ node tests/contrat-ecriture-infos.test.js
 *
 *  ⭐ Exécute le code RÉEL (js/admin-infos-publication.js, js/admin-conformite-ffr.js,
 *  js/admin-autorisation.js) dans un contexte Node, avec des doublures de l'API et du DOM.
 *  Ce qu'il prouve :
 *    A — une réponse au contrat met l'écran à jour SANS relecture : un seul appel serveur ;
 *    B — un backend d'avant le contrat garde exactement l'ancien chemin (relecture, affiche à part) ;
 *    C — l'affiche voyage dans la même requête ; refusée, elle reste prête pour un nouvel essai ;
 *    D — le contrôle FFR n'est relancé que si le verdict affiché ne porte pas sur les valeurs courantes ;
 *    E — la feuille d'autorisation n'est déclarée périmée que si un champ lu par elle a CHANGÉ.
 *  Aucun réseau, aucun navigateur.
 * ============================================================================
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
let n = 0;
function vrai(v, m) { assert.ok(v, m); n++; console.log('  ✓ ' + m); }

const CFG_SERVEUR = { global: { tournoi_nom: 'Nom enregistré', tournoi_date: '2027-05-15', zone_vacances: 'C',
  tournoi_affiche_id: 'fichier-1' }, categories: [{ categorie: 'U10', presente: 'oui' }] };
const contrat = (extra) => Object.assign({ ok: true, contrat: 'ecriture-v1', action: 'enregistrerInfosTournoi',
  modifies: ['tournoi_nom'], enregistre: {}, config: JSON.parse(JSON.stringify(CFG_SERVEUR)),
  compteurs: {}, avertissements: [] }, extra || {});

/** Joue onEnregistrerInfos avec une réponse serveur donnée. */
async function sauvegarder(options) {
  const o = options || {};
  const appels = [];
  const messages = [];
  const majInfos = [];
  const champ = (v) => ({ value: v });
  const infos = { tournoi_nom: champ('Nom saisi'), tournoi_lieu: champ('Stade'), tournoi_adresse: champ('Adresse'),
    tournoi_description: champ('Texte'), tournoi_affiche: champ(o.affiche ? 'C:\\fakepath\\affiche.png' : '') };
  const cadre = { tournoi_date: champ('2027-05-15'), zone_vacances: champ('C') };
  const elements = { 'form-infos-tournoi': infos, 'form-cadre-tournoi': cadre,
    'apercu-affiche-img': { src: '' }, 'apercu-affiche': { hidden: true } };
  const ctx = vm.createContext({
    document: { getElementById: (id) => elements[id] || {} },
    configCourante: { global: { tournoi_nom: 'Ancien nom' }, categories: [] },
    afficheDataURI: o.affiche || '',
    avecBoutonOccupe: async (b, m, fn) => fn(),
    choixCategoriesAValider: () => false,
    ecrireAdmin: async (action, data) => {
      appels.push({ action, data });
      if (action === 'enregistrerAffiche') return { ok: true, id: 'fichier-2' };
      return typeof o.reponse === 'function' ? o.reponse(data) : o.reponse;
    },
    lireConfigAdmin: async () => { appels.push({ action: 'getConfigAdmin' }); return { global: { tournoi_nom: 'Relu' }, categories: [] }; },
    afficherMessage: (el, texte, type) => messages.push({ texte, type }),
    majDossier() {}, majTableauBord() {},
    verdictFFRAJour: () => o.verdictAJour !== false
  });
  vm.runInContext(lire('admin-infos-publication.js'), ctx);
  ctx.majInfosTournoi = (opt) => { majInfos.push(opt); ctx.afficheDataURI = ''; };
  ctx.majDossier = () => {};   // déclarée par le fichier lui-même : remplacée après chargement
  await ctx.onEnregistrerInfos();
  return { appels, messages, majInfos, ctx, elements, dernier: messages[messages.length - 1] };
}

(async () => {
  console.log('A — une écriture, une réponse exploitable');
  let x = await sauvegarder({ reponse: contrat() });
  vrai(x.appels.length === 1 && x.appels[0].action === 'enregistrerInfosTournoi',
    'A.1 ⭐ un seul appel serveur : ni relecture getConfigAdmin, ni second envoi');
  vrai(x.ctx.configCourante.global.tournoi_nom === 'Nom enregistré',
    'A.2 l\'écran prend l\'état RELU par le serveur (réponse), pas la saisie');
  vrai(x.appels[0].data.tournoi_nom === 'Nom saisi' && x.appels[0].data.tournoi_date === '2027-05-15' &&
       !('affiche' in x.appels[0].data), 'A.3 l\'envoi porte les deux cartes, sans affiche quand il n\'y en a pas');
  vrai(x.dernier.texte === '✅ Infos enregistrées.' && x.dernier.type === 'ok', 'A.4 message de succès');
  x = await sauvegarder({ reponse: contrat({ modifies: [] }) });
  vrai(/Déjà à jour/.test(x.dernier.texte) && x.appels.length === 1, 'A.5 rien de changé : on le dit, toujours en un appel');
  x = await sauvegarder({ reponse: contrat({ modifies: ['tournoi_date'], avertissements: [{ code: 'date_passee', message: 'La date est passée.' }] }) });
  vrai(/✅ Infos enregistrées\.\n⚠️ La date est passée\./.test(x.dernier.texte) && x.dernier.type === 'ok',
    'A.6 un avertissement du serveur s\'affiche sans faire croire à un échec');
  x = await sauvegarder({ reponse: contrat({ config: { global: {}, categories: 'pas une liste' } }) });
  vrai(x.appels.map((a) => a.action).join() === 'enregistrerInfosTournoi,getConfigAdmin',
    'A.7 ⛔ configuration incomplète dans la réponse : on relit plutôt que d\'afficher du faux');

  console.log('B — backend d\'avant le contrat');
  x = await sauvegarder({ reponse: { ok: true } });
  vrai(x.appels.map((a) => a.action).join() === 'enregistrerInfosTournoi,getConfigAdmin' &&
       x.ctx.configCourante.global.tournoi_nom === 'Relu', 'B.1 ⭐ réponse { ok: true } seule : relecture, comme avant');
  vrai(x.majInfos[0].controleFFR === true, 'B.2 et le contrôle FFR est relancé, comme avant');
  x = await sauvegarder({ reponse: { ok: true }, affiche: 'data:image/png;base64,AAAA' });
  vrai(x.appels.map((a) => a.action).join() === 'enregistrerInfosTournoi,enregistrerAffiche,getConfigAdmin' &&
       x.appels[1].data.affiche === 'data:image/png;base64,AAAA',
    'B.3 ⭐ affiche + ancien backend (qui l\'a ignorée) : elle part par son action historique');

  console.log('C — l\'affiche dans la même requête');
  x = await sauvegarder({ reponse: contrat({ modifies: ['tournoi_affiche_id'] }), affiche: 'data:image/png;base64,AAAA' });
  vrai(x.appels.length === 1 && x.appels[0].data.affiche === 'data:image/png;base64,AAAA',
    'C.1 ⭐ infos ET affiche en une requête, sans enregistrerAffiche ni relecture');
  vrai(x.elements['form-infos-tournoi'].tournoi_affiche.value === '', 'C.2 le champ fichier est vidé après succès');
  x = await sauvegarder({ reponse: contrat({ modifies: ['tournoi_nom'], avertissements: [{ code: 'affiche_non_enregistree', message: 'Drive indisponible.' }] }),
    affiche: 'data:image/png;base64,AAAA' });
  vrai(x.dernier.type === 'ko' && /Drive indisponible/.test(x.dernier.texte),
    'C.3 affiche refusée : le message le dit en rouge, les infos restent enregistrées');
  vrai(x.ctx.afficheDataURI === 'data:image/png;base64,AAAA' && x.elements['apercu-affiche'].hidden === false,
    'C.4 ⭐ l\'image choisie reste prête : un nouveau clic la renverra');

  console.log('D — contrôle FFR relancé seulement si nécessaire');
  x = await sauvegarder({ reponse: contrat(), verdictAJour: true });
  vrai(x.majInfos[0].controleFFR === false, 'D.1 ⭐ verdict déjà à jour : pas de nouvel appel getConformiteFFR');
  x = await sauvegarder({ reponse: contrat(), verdictAJour: false });
  vrai(x.majInfos[0].controleFFR === true, 'D.2 verdict absent ou périmé : contrôle relancé');

  // Le verdict et ses entrées, dans le vrai module de conformité.
  const zone = { innerHTML: '', addEventListener() {} };
  const champs = { tournoi_date: { value: '2027-05-15' }, zone_vacances: { value: 'C' } };
  const appelsFFR = [];
  const ffr = vm.createContext({
    document: { getElementById: (id) => (id === 'bloc-conformite-ffr' ? zone : null),
      querySelector: (sel) => champs[(sel.match(/name="([^"]+)"/) || [])[1]] || null },
    configCourante: { global: {}, categories: [{ categorie: 'U10', presente: 'oui' }] },
    choixCategoriesAValider: () => false,
    apiGet: async (action) => {
      appelsFFR.push(action);
      if (action === 'getRefFFR') return { formes: [{ categorie: 'M10' }], dates: [], regles: [], temps: [] };
      return { refDisponible: true, statut: 'OK', conflits: [], vigilances: [], formes: {}, regles: {}, temps: {} };
    },
    apiPostProtege: async (action) => {
      appelsFFR.push(action);
      return { refDisponible: true, statut: 'OK', conflits: [], vigilances: [], formes: {}, regles: {}, temps: {} };
    },
    echapper: (s) => String(s)
  });
  vm.runInContext(lire('admin-conformite-ffr.js'), ffr);
  ffr.rendreConformiteFFR = () => 'verdict';
  ffr.majFormesCategories = () => {};
  vrai(ffr.verdictFFRAJour() === false, 'D.3 aucun verdict affiché : pas « à jour »');
  await ffr.majConformiteFFR();
  vrai(appelsFFR.join() === 'getRefFFR,getConformiteFFR' && ffr.verdictFFRAJour() === true,
    'D.4 après un contrôle réussi, le verdict est à jour pour ces date, zone et catégories');
  champs.tournoi_date.value = '2027-05-22';
  vrai(ffr.verdictFFRAJour() === false, 'D.5 ⭐ date changée dans le formulaire : verdict périmé');
  champs.tournoi_date.value = '2027-05-15';
  ffr.configCourante.categories.push({ categorie: 'U12', presente: 'oui' });
  vrai(ffr.verdictFFRAJour() === false, 'D.6 catégorie ajoutée : verdict périmé');
  ffr.configCourante.categories.pop();
  vrai(ffr.verdictFFRAJour() === true, 'D.7 retour aux mêmes entrées : de nouveau à jour');
  ffr.invaliderConformiteFFRAffichee();
  vrai(ffr.verdictFFRAJour() === false, 'D.8 verdict effacé (réinitialisation) : plus jamais « à jour »');

  console.log('E — feuille d\'autorisation');
  const aut = vm.createContext({ document: { getElementById: () => null, addEventListener() {} } });
  vm.runInContext(lire('admin-autorisation.js'), aut);
  const tout = { tournoi_nom: 'N', tournoi_lieu: 'L', tournoi_adresse: 'A', tournoi_description: 'D', tournoi_date: '2027-05-15', zone_vacances: 'C' };
  const impact = (reponse, data) => aut.ecritureImpacteAutorisation('enregistrerInfosTournoi', data || tout, reponse);
  vrai(impact({ ok: true }) === true, 'E.1 backend d\'avant le contrat : jugé sur les champs envoyés, comme avant');
  vrai(impact(contrat({ modifies: [] })) === false, 'E.2 ⭐ rien de changé : la feuille reste valable, aucune relecture');
  vrai(impact(contrat({ modifies: ['tournoi_description', 'tournoi_affiche_id'] })) === false,
    'E.3 seuls des champs non lus par la feuille ont changé : aucune relecture');
  vrai(impact(contrat({ modifies: ['tournoi_nom'] })) === true, 'E.4 le nom a changé : la feuille est périmée (A.2)');
  vrai(impact({ ok: true }, { perfs_mot_cle_club: 'Racing' }) === false,
    'E.5 comportement historique conservé pour un envoi partiel sans impact');

  console.log('\nOK — ' + n + ' contrôles du contrat d\'écriture (frontend).');
})().catch((e) => { console.error(e); process.exitCode = 1; });
