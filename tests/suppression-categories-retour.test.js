'use strict';
// Régressions du retour réseau : aucun accès Google, modules réels en VM.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const lire = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
function extrait(p, nom) {
  const s = lire(p), i = s.indexOf('function ' + nom + '('), j = s.indexOf('\n}', i);
  assert.ok(i >= 0 && j > i);
  return s.slice(i, j + 2);
}
let n = 0;
function ok(v, msg) { assert.ok(v, msg); n++; }
async function main() {
  for (const action of ['supprimerCategorie', 'enregistrerCategorie']) {
    let emissions = 0, options;
    const c = vm.createContext({ API_URL: 'https://fixture.invalid/exec', URL,
      AbortController, performance, setTimeout, clearTimeout,
      fetch: (_, o) => {
        emissions++; options = o;
        return new Promise((resolve, reject) => o.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' }))));
      }
    });
    vm.runInContext(lire('js/api.js'), c);
    await assert.rejects(c.apiPost(action, { categorie: 'U6' }, { delaiMs: 5 }), { name: 'AbortError' });
    ok(emissions === 1, action + ' : expiration sans rejeu');
    ok(options.cache === 'no-store', 'réponse POST non mise en cache');
    ok(options.headers['Content-Type'] === 'text/plain;charset=utf-8', 'pas de changement CORS');
  }
  // Une configuration tronquée ne doit pas se transformer en liste vide validée.
  for (const reponse of [null, {}, { config: {} }, { config: { global: {} } },
    { config: { global: {}, categories: {} } }, { config: { global: {}, categories: [] } }]) {
    const c = vm.createContext({ apiPostProtege: async () => reponse });
    vm.runInContext('async ' + extrait('js/admin.js', 'lireConfigAdmin'), c);
    if (reponse && reponse.config && Array.isArray(reponse.config.categories)) {
      ok((await c.lireConfigAdmin()).categories.length === 0, 'vrai tournoi vide accepté');
    } else {
      await assert.rejects(c.lireConfigAdmin(), /incomplète/); n++;
    }
  }
  for (const scenario of ['normal', 'reponse-perdue', 'encore-presente', 'lecture-perdue', 'annule']) {
    let ecritures = 0, lectures = 0, rendus = 0, alertes = [], budgetEcriture;
    let presentes = [{ categorie: 'U10', terrains: '1,2' }, { categorie: 'U6' }];
    const bouton = { disabled: false, getAttribute: () => 'U6' };
    const c = vm.createContext({
      dialogConfirmer: async () => scenario !== 'annule',
      dialogAlerter: async t => alertes.push(t),
      ecrireAdmin: async (action, data, opt) => {
        ecritures++; budgetEcriture = opt;
        assert.equal(action, 'supprimerCategorie'); assert.equal(data.categorie, 'U6');
        if (scenario !== 'encore-presente') presentes.pop();
        if (scenario === 'reponse-perdue') throw Object.assign(Error('aborted'), { name: 'AbortError' });
      },
      lireConfigAdmin: async (_, opt) => {
        lectures++; assert.equal(opt.delaiMs, 30000);
        if (scenario === 'lecture-perdue') throw Error('Lecture perdue');
        return { global: {}, categories: presentes };
      },
      rendreCategoriesChoix: cfg => { rendus++; assert.deepEqual(cfg.categories, [{ categorie: 'U10', terrains: '1,2' }]); },
      majChoixCategoriesTournoi() {},
      majConformiteFFR: () => new Promise(() => {}) // Ne doit pas bloquer la fin de suppression.
    });
    vm.runInContext(extrait('js/admin-choix-categories.js', 'expliquerErreurCategories') + '\nasync ' +
      extrait('js/admin-reglages.js', 'onSupprimerCategorie'), c);
    await c.onSupprimerCategorie(bouton);
    ok(!bouton.disabled, scenario + ' : bouton libéré');
    ok(ecritures === (scenario === 'annule' ? 0 : 1), scenario + ' : jamais de rejeu');
    ok(lectures === (scenario === 'annule' ? 0 : 1), scenario + ' : une réconciliation');
    if (ecritures) ok(budgetEcriture.delaiMs === 30000, 'écriture bornée');
    const confirme = ['normal', 'reponse-perdue'].includes(scenario);
    ok(rendus === (confirme ? 1 : 0), scenario + ' : rendu seulement après absence prouvée');
    ok(alertes.length === (['encore-presente', 'lecture-perdue'].includes(scenario) ? 1 : 0), 'incertitude explicite');
  }
  // Un second clic pendant la confirmation ne doit pas envoyer deux suppressions.
  {
    let fin, confirmations = 0;
    const bouton = { disabled: false, getAttribute: () => 'U6' };
    const c = vm.createContext({ dialogConfirmer: () => { confirmations++; return new Promise(r => { fin = r; }); } });
    vm.runInContext('async ' + extrait('js/admin-reglages.js', 'onSupprimerCategorie'), c);
    const p = c.onSupprimerCategorie(bouton); await c.onSupprimerCategorie(bouton);
    ok(confirmations === 1, 'confirmation verrouillée'); fin(false); await p;
    ok(!bouton.disabled, 'annulation libère le bouton');
  }
  for (const cause of ['propre', 'brouillon', 'validation', 'ecriture']) {
    let menu = null, choix = 0;
    const zone = { innerHTML: 'U10', querySelectorAll: () => [{}],
      querySelector: () => cause === 'ecriture' ? {} : null };
    const c = vm.createContext({ document: { getElementById: () => zone },
      configCourante: { categories: [{ categorie: 'U10' }, { categorie: 'U6' }] },
      assistantEstPropre: () => cause !== 'brouillon', choixCategoriesAValider: () => cause === 'validation',
      afficherCategories: cats => cats.map(x => x.categorie).join(','),
      remplirSelectCategories: cats => { menu = cats; }, majChoixCategoriesTournoi: () => choix++,
      majFormesCategories() {}
    });
    vm.runInContext(extrait('js/admin-reglages.js', 'actualiserCartesCategoriesSansBrouillon'), c);
    ok(c.actualiserCartesCategoriesSansBrouillon() === (cause === 'propre'), cause);
    ok(zone.innerHTML === (cause === 'propre' ? 'U10,U6' : 'U10'), 'cartes fraîches ou saisie préservée');
    ok((menu !== null) === (cause === 'propre'), 'menu synchronisé');
    ok(choix === (cause === 'propre' ? 1 : 0), 'cases synchronisées');
  }
  ok(lire('js/admin.js').includes('!actualiserCartesCategoriesSansBrouillon()'), 'rafraîchissement branché');
  // Un ancien rafraîchissement ne doit pas réintroduire une catégorie supprimée.
  {
    let finir, revision = 0;
    const initial = { global: {}, categories: [{ categorie: 'U10' }] };
    const c = vm.createContext({ DELAI_LECTURE_ADMIN_MS: 30000,
      configCourante: initial, equipesCourantes: ['actuelles'],
      versionCategoriesCourante: () => revision,
      /* ⚠️ La relecture de `rechargerEtRendre` passe par `lireInstantaneAdmin` (SOUS CLÉ ADMIN)
         depuis le lot « Pages publiques du tournoi » : `getAll` était une porte anonyme. La
         doublure change de nom, pas d'intention — elle pend jusqu'à ce que le test la dénoue. */
      lireInstantaneAdmin: () => new Promise(r => { finir = r; }),
      lireInstantaneAdminOuVide: () => new Promise(r => { finir = r; }),
      lireConfigAdmin: async () => ({ global: {}, categories: [{ categorie: 'U6' }] })
    });
    vm.runInContext('async ' + extrait('js/admin.js', 'rechargerEtRendre'), c);
    const p = c.rechargerEtRendre({ publication: true });
    revision++; finir({ equipes: ['anciennes'], matchs: [], poules: [] });
    await assert.rejects(p, /catégories ont changé/); n++;
    ok(c.configCourante === initial && c.equipesCourantes[0] === 'actuelles', 'état ancien entièrement ignoré');
  }
  {
    let revision = 0, finir;
    const c = vm.createContext({ invaliderLecturesCategories: () => revision++,
      apiPostProtege: () => new Promise((r, j) => { finir = j; }) });
    vm.runInContext('async ' + extrait('js/admin.js', 'ecrireAdmin'), c);
    const p = c.ecrireAdmin('supprimerCategorie', { categorie: 'U6' });
    ok(revision === 1, 'lecture invalidée au début de l’écriture');
    finir(Error('Retour perdu')); await assert.rejects(p); n++;
    ok(revision === 2, 'lecture invalidée aussi après réponse perdue');
  }
  function bacFFR(api) {
    const elements = {};
    const element = id => elements[id] || (elements[id] = { innerHTML: '', disabled: false,
      addEventListener() {}, value: id === 'finder-mois' ? '2027-05' : '' });
    const c = vm.createContext({ apiGet: api,
      apiPostProtege: (action, params, role, libelle, options) => api(action, params, options),
      configCourante: { global: { tournoi_date: '2027-05-15', zone_vacances: 'C' },
        categories: [{ categorie: 'U10', presente: 'oui' }] },
      document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [] },
      echapper: s => String(s)
    });
    vm.runInContext(lire('js/admin-conformite-ffr.js'), c);
    c.majFormesCategories = () => {};
    return { c, element };
  }
  {
    let lectures = 0, verdicts = 0;
    const { c, element } = bacFFR(async (action, params, opt) => {
      assert.equal(opt.delaiMs, 30000);
      if (action === 'getRefFFR') {
        if (++lectures === 1) throw Error('HTTP 404');
        return { formes: [], dates: [{}], millesime: 'SIMULATION' };
      }
      verdicts++; return { refDisponible: true, bloquants: [] };
    });
    await c.majConformiteFFR();
    ok(c.refFFRCache === null, 'erreur non mémorisée comme référentiel vide');
    ok(element('bloc-conformite-ffr').innerHTML.includes('Réessayer le contrôle FFR'), 'reprise visible');
    ok(!element('bloc-conformite-ffr').innerHTML.includes('ffr-vert'), 'pas de verdict sur erreur');
    const bouton = { disabled: false };
    await c.onReessayerControleFFR({ target: { closest: () => bouton } });
    ok(lectures === 2 && verdicts === 1, 'un clic de reprise effectue uniquement les lectures nécessaires');
    ok(element('bloc-conformite-ffr').innerHTML.includes('ffr-vert'), 'reprise sans rechargement');
    await c.majConformiteFFR(); ok(lectures === 2, 'seul le succès est mémorisé');
  }
  {
    let lectures = 0, finir;
    const { c } = bacFFR(() => { lectures++; return new Promise(r => { finir = r; }); });
    const p1 = c.chargerRefFFR(), p2 = c.chargerRefFFR();
    ok(lectures === 1, 'lectures simultanées mutualisées');
    finir({ formes: [], dates: [{}] }); await Promise.all([p1, p2]);
    ok(c.refFFREnCours === null && c.refFFRCache.dates.length === 1, 'vol libéré après succès');
  }
  for (const ref of [{}, { formes: [], dates: [] }]) {
    let lectures = 0;
    const { c, element } = bacFFR(async () => { lectures++; return ref; });
    await c.majConformiteFFR(); await c.majConformiteFFR();
    ok(lectures === 2 && c.refFFRCache === null, 'référentiel vide ou malformé réessayable');
    ok(!element('bloc-conformite-ffr').innerHTML.includes('ffr-vert'), 'absence de faux vert');
  }
  {
    const { c, element } = bacFFR(async (action, params, opt) => {
      assert.equal(opt.delaiMs, 30000);
      if (action === 'getRefFFR') return { formes: [], dates: [{}] };
      if (action === 'getConformiteFFR') return {};
      throw Object.assign(Error('Délai'), { name: 'AbortError' });
    });
    await c.majConformiteFFR();
    ok(c.dernierResConformite === null && !element('bloc-conformite-ffr').innerHTML.includes('ffr-vert'), 'réponse de conformité malformée non validée');
    await c.onChercherDatesCompatibles();
    ok(!element('bouton-chercher-dates').disabled, 'recherche bornée et libérée après échec');
  }
  console.log('OK — ' + n + ' contrôles de suppression et retour réseau.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
