/* Goûter de fin de tournoi : formulaire, email et cascade B.5, sans réseau ni écriture réelle. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function egal(reel, attendu, message) { assert.deepEqual(reel, attendu, message); controles++; }
function vrai(condition, message) { assert.ok(condition, message); controles++; }

function formulaireSurPlace() {
  function groupeModes() {
    const radios = [
      { value: 'prix_personne', checked: false },
      { value: 'compris_inscription', checked: false },
      { value: 'offert_organisateur', checked: false }
    ];
    const mode = {};
    Object.defineProperty(mode, 'value', {
      get() { return (radios.find(r => r.checked) || {}).value || ''; },
      set(v) { radios.forEach(r => { r.checked = r.value === v; }); }
    });
    return { radios, mode };
  }
  const repas = groupeModes();
  const gouter = groupeModes();
  return {
    buvette_disponible: { checked: false },
    espace_sandwich_disponible: { checked: false },
    boutique_disponible: { checked: false },
    repas_sur_place_oui: { checked: false },
    repas_sur_place_mode: repas.mode,
    repas_sur_place_montant: { value: '' },
    gouter_fin_tournoi_oui: { checked: false },
    gouter_fin_tournoi_mode: gouter.mode,
    gouter_fin_tournoi_montant: { value: '' },
    querySelectorAll(sel) {
      if (sel === '[name="repas_sur_place_mode"]') return repas.radios;
      return sel === '[name="gouter_fin_tournoi_mode"]' ? gouter.radios : [];
    }
  };
}

async function principal() {
  const form = formulaireSurPlace();
  const dom = {
    'form-surplace': form,
    'options-repas-sur-place': { hidden: true },
    'champ-repas-sur-place-montant': { hidden: true },
    'options-gouter-fin-tournoi': { hidden: true },
    'champ-gouter-fin-tournoi-montant': { hidden: true },
    'message-surplace': {},
    'bouton-enregistrer-surplace': {}
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
  bac.__config = { global: {
    repas_sur_place_oui: 'non', repas_sur_place_mode: '', repas_sur_place_montant: '',
    gouter_fin_tournoi_oui: 'oui', gouter_fin_tournoi_mode: 'prix_personne',
    gouter_fin_tournoi_montant: '3.50'
  }, categories: [] };
  vm.runInContext('configCourante = __config; clubsInvitesCourants = []; assistantMarquerPropre = function () {};', bac);

  bac.majSurPlace();
  vrai(form.gouter_fin_tournoi_oui.checked, 'la carte relit le goûter activé');
  egal(form.gouter_fin_tournoi_mode.value, 'prix_personne', 'la carte relit la modalité');
  egal(form.gouter_fin_tournoi_montant.value, '3.50', 'la carte relit le montant');
  vrai(!dom['options-gouter-fin-tournoi'].hidden && !dom['champ-gouter-fin-tournoi-montant'].hidden,
    'les sous-options et le montant apparaissent pour le prix par personne');

  form.buvette_disponible.checked = true;
  const g = bac.globalInvitation();
  egal(g.gouter_fin_tournoi_oui, 'oui', 'l’aperçu lit le goûter en direct');
  egal(g.gouter_fin_tournoi_mode, 'prix_personne', 'l’aperçu lit la modalité en direct');
  egal(g.gouter_fin_tournoi_montant, '3.50', 'l’aperçu lit le montant en direct');

  const htmlPrix = bac.emailHtmlInvitation(g, [], '', 'Bonjour,', 'Invitation.', '', 'https://exemple.invalid');
  const textePrix = bac.emailTexteInvitation(g, [], 'Bonjour,', 'Invitation.', '', 'https://exemple.invalid');
  vrai(htmlPrix.includes('Goûter de fin de tournoi') && htmlPrix.includes('3.50 € par personne'),
    'le mail HTML mentionne le goûter et son prix');
  vrai(textePrix.includes('goûter de fin de tournoi — 3.50 € par personne'),
    'le mail texte mentionne le goûter et son prix');

  g.gouter_fin_tournoi_mode = 'compris_inscription';
  g.gouter_fin_tournoi_montant = '';
  vrai(bac.emailHtmlInvitation(g, [], '', 'Bonjour,', 'Invitation.', '', '').includes("Compris dans les frais d&#39;inscription"),
    'le mail mentionne un goûter compris dans les frais d’inscription');
  g.gouter_fin_tournoi_mode = 'offert_organisateur';
  vrai(bac.emailTexteInvitation(g, [], 'Bonjour,', 'Invitation.', '', '').includes("offert par l'organisateur du tournoi"),
    'le mail texte mentionne un goûter offert');

  form.gouter_fin_tournoi_mode.value = '';
  const ecritures = [];
  const messages = [];
  bac.__ecritures = ecritures;
  bac.__messages = messages;
  vm.runInContext(`
    ecrireAdmin = async function (action, data) { __ecritures.push({ action: action, data: data }); return { ok: true }; };
    avecBoutonOccupe = async function (_b, _m, fn) { return fn(); };
    afficherMessage = function (_m, texte) { __messages.push(texte); };
    majApercuInvitation = function () {};
  `, bac);
  await bac.onEnregistrerSurPlace();
  egal(ecritures.length, 0, 'aucune écriture si le goûter actif n’a pas de modalité');
  vrai(messages.at(-1).includes('Choisis la modalité'), 'un message explique la modalité manquante');

  form.gouter_fin_tournoi_mode.value = 'prix_personne';
  form.gouter_fin_tournoi_montant.value = '4,25';
  await bac.onEnregistrerSurPlace();
  egal(ecritures.length, 1, 'une seule écriture groupée pour une configuration valide');
  egal(JSON.parse(JSON.stringify(ecritures[0])), { action: 'enregistrerSurPlace', data: {
    buvette_disponible: 'oui', espace_sandwich_disponible: 'non', boutique_disponible: 'non',
    repas_sur_place_oui: 'non', repas_sur_place_mode: '', repas_sur_place_montant: '',
    gouter_fin_tournoi_oui: 'oui', gouter_fin_tournoi_mode: 'prix_personne',
    gouter_fin_tournoi_montant: '4.25'
  } }, 'l’écriture contient un état cohérent et un montant normalisé');

  bac.__config.global = {
    gouter_fin_tournoi_oui: 'oui', gouter_fin_tournoi_mode: 'prix_personne',
    gouter_fin_tournoi_montant: '4,25', org_gouters_oui: 'non', org_gouters_prix: '99'
  };
  egal(bac.prefillAutorisation('org_gouters_oui'), 'oui', 'B.5 passe automatiquement Goûters à oui');
  egal(bac.prefillAutorisation('org_gouters_prix'), '4.25', 'B.5 reprend le prix par personne');
  egal(bac.valControleurEffectiveAutorisation('org_gouters_oui'), 'oui',
    'la cascade du goûter est prioritaire sur une ancienne saisie B.5');
  vrai(bac.rendreSaisieAutorisation({}).includes('repris automatiquement de la carte « Sur place »'),
    'la saisie B.5 indique clairement l’origine du goûter prérempli');
  vrai(bac.ecritureImpacteAutorisation('enregistrerSurPlace', {
    gouter_fin_tournoi_oui: 'oui', gouter_fin_tournoi_mode: 'prix_personne', gouter_fin_tournoi_montant: '4.25'
  }, { ok: true }), 'l’enregistrement du goûter invalide la feuille d’autorisation');
  vrai(!bac.ecritureImpacteAutorisation('enregistrerSurPlace', { buvette_disponible: 'oui' }, { ok: true }),
    'une modification de buvette seule ne recalcule pas la demande d’autorisation');

  const backend = lire('../backend/Code.gs');
  vrai(backend.includes("'gouter_fin_tournoi_oui', 'gouter_fin_tournoi_mode', 'gouter_fin_tournoi_montant'"),
    'le backend autorise les trois paramètres dans l’écriture Sur place');
  vrai(backend.includes("repris de la carte « Sur place » (goûter de fin de tournoi)"),
    'la feuille serveur porte explicitement l’origine de la cascade');
  vrai(backend.includes("data.gouter_fin_tournoi_mode = mode") &&
    backend.includes("data.gouter_fin_tournoi_montant = montant"),
    'le backend normalise la modalité et le montant avant l’écriture groupée');

  console.log('OK — ' + controles + ' contrôles passés.');
}

principal().catch(err => { console.error(err); process.exitCode = 1; });
