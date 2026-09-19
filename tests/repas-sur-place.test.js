/* Repas sur place : sous-menu, email et cascade B.5, sans réseau ni écriture réelle. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function vrai(condition, message) { assert.ok(condition, message); controles++; }
function egal(reel, attendu, message) { assert.equal(reel, attendu, message); controles++; }

function groupeModes() {
  const radios = ['prix_personne', 'compris_inscription', 'offert_organisateur']
    .map(value => ({ value, checked: false }));
  const mode = {};
  Object.defineProperty(mode, 'value', {
    get() { return (radios.find(r => r.checked) || {}).value || ''; },
    set(v) { radios.forEach(r => { r.checked = r.value === v; }); }
  });
  return { radios, mode };
}

async function principal() {
  const repas = groupeModes();
  const gouter = groupeModes();
  const form = {
    buvette_disponible: { checked: false }, espace_sandwich_disponible: { checked: false },
    boutique_disponible: { checked: false },
    repas_sur_place_oui: { checked: false }, repas_sur_place_mode: repas.mode,
    repas_sur_place_montant: { value: '' },
    gouter_fin_tournoi_oui: { checked: false }, gouter_fin_tournoi_mode: gouter.mode,
    gouter_fin_tournoi_montant: { value: '' },
    querySelectorAll(sel) {
      if (sel === '[name="repas_sur_place_mode"]') return repas.radios;
      if (sel === '[name="gouter_fin_tournoi_mode"]') return gouter.radios;
      return [];
    }
  };
  const dom = {
    'form-surplace': form,
    'options-repas-sur-place': { hidden: true },
    'champ-repas-sur-place-montant': { hidden: true },
    'options-gouter-fin-tournoi': { hidden: true },
    'champ-gouter-fin-tournoi-montant': { hidden: true },
    'message-surplace': {}, 'bouton-enregistrer-surplace': {}
  };
  const bac = vm.createContext({
    console, URL, URLSearchParams,
    window: { location: { href: 'https://exemple.invalid/admin.html', search: '' }, addEventListener() {} },
    document: {
      getElementById: id => dom[id] || null,
      addEventListener() {}, querySelector: () => null, querySelectorAll: () => []
    }
  });
  ['js/commun.js', 'js/admin.js', 'js/admin-infos-publication.js', 'js/admin-invitations.js',
   'js/admin-autorisation.js'].forEach(rel => vm.runInContext(lire(rel), bac, { filename: rel }));

  const html = lire('admin.html');
  vrai(html.indexOf('name="repas_sur_place_oui"') < html.indexOf('name="gouter_fin_tournoi_oui"'),
    'Repas est placé juste avant le goûter dans la carte Sur place');
  egal((html.match(/name="repas_sur_place_mode"/g) || []).length, 3,
    'le repas propose exactement trois modalités exclusives');

  bac.__config = { global: {
    repas_sur_place_oui: 'oui', repas_sur_place_mode: 'prix_personne', repas_sur_place_montant: '8.50',
    gouter_fin_tournoi_oui: 'non', gouter_fin_tournoi_mode: '', gouter_fin_tournoi_montant: ''
  }, categories: [] };
  vm.runInContext('configCourante = __config; clubsInvitesCourants = []; assistantMarquerPropre = function () {};', bac);
  bac.majSurPlace();
  vrai(form.repas_sur_place_oui.checked, 'la carte relit le repas activé');
  egal(form.repas_sur_place_mode.value, 'prix_personne', 'la carte relit la modalité du repas');
  egal(form.repas_sur_place_montant.value, '8.50', 'la carte relit le montant du repas');
  vrai(!dom['options-repas-sur-place'].hidden && !dom['champ-repas-sur-place-montant'].hidden,
    'le sous-menu et le montant apparaissent pour le prix par personne');

  const g = bac.globalInvitation();
  egal(g.repas_sur_place_oui, 'oui', 'l’aperçu lit le repas en direct');
  egal(g.repas_sur_place_mode, 'prix_personne', 'l’aperçu lit la modalité en direct');
  egal(g.repas_sur_place_montant, '8.50', 'l’aperçu lit le montant en direct');
  vrai(bac.emailHtmlInvitation(g, [], '', 'Bonjour,', 'Invitation.', '', '').includes('8.50 € par personne'),
    'le mail HTML mentionne le prix du repas');
  vrai(bac.emailTexteInvitation(g, [], 'Bonjour,', 'Invitation.', '', '').includes('repas — 8.50 € par personne'),
    'le mail texte mentionne le prix du repas');

  g.repas_sur_place_mode = 'compris_inscription';
  g.repas_sur_place_montant = '';
  vrai(bac.emailHtmlInvitation(g, [], '', 'Bonjour,', 'Invitation.', '', '').includes("Compris dans les frais d&#39;inscription"),
    'le mail mentionne un repas compris dans les frais d’inscription');
  g.repas_sur_place_mode = 'offert_organisateur';
  vrai(bac.emailTexteInvitation(g, [], 'Bonjour,', 'Invitation.', '', '').includes("repas — offert par l'organisateur du tournoi"),
    'le mail texte mentionne un repas offert');

  form.repas_sur_place_mode.value = '';
  const ecritures = [], messages = [];
  bac.__ecritures = ecritures; bac.__messages = messages;
  vm.runInContext(`
    ecrireAdmin = async function (action, data) { __ecritures.push({ action: action, data: data }); return { ok: true }; };
    avecBoutonOccupe = async function (_b, _m, fn) { return fn(); };
    afficherMessage = function (_m, texte) { __messages.push(texte); };
    majApercuInvitation = function () {};
  `, bac);
  await bac.onEnregistrerSurPlace();
  egal(ecritures.length, 0, 'aucune écriture si le repas actif n’a pas de modalité');
  vrai(messages.at(-1).includes('modalité du repas'), 'un message explique la modalité manquante');

  form.repas_sur_place_mode.value = 'prix_personne';
  form.repas_sur_place_montant.value = '9,75';
  await bac.onEnregistrerSurPlace();
  egal(ecritures.length, 1, 'une configuration valide produit une seule écriture groupée');
  egal(ecritures[0].data.repas_sur_place_montant, '9.75', 'le montant écrit est normalisé');

  bac.__config.global = {
    repas_sur_place_oui: 'oui', repas_sur_place_mode: 'prix_personne', repas_sur_place_montant: '9,75',
    org_repas_oui: 'non', org_repas_prix: '99'
  };
  egal(bac.prefillAutorisation('org_repas_oui'), 'oui', 'B.5 passe automatiquement Repas à oui');
  egal(bac.prefillAutorisation('org_repas_prix'), '9.75', 'B.5 reprend le prix du repas');
  egal(bac.valControleurEffectiveAutorisation('org_repas_oui'), 'oui',
    'la cascade du repas est prioritaire sur une ancienne saisie B.5');
  vrai(bac.rendreSaisieAutorisation({}).includes('repris automatiquement de la carte « Sur place »'),
    'la saisie B.5 indique clairement l’origine du repas prérempli');

  const backend = lire('../backend/Code.gs');
  vrai(backend.includes("'repas_sur_place_oui', 'repas_sur_place_mode', 'repas_sur_place_montant'"),
    'le backend autorise les trois paramètres du repas');
  vrai(backend.includes('repris de la carte « Sur place » (repas)'),
    'la feuille serveur porte l’origine de la cascade repas');

  console.log('OK — ' + controles + ' contrôles passés.');
}

principal().catch(err => { console.error(err); process.exitCode = 1; });
