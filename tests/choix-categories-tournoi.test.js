/* Parcours catégories : vrai module et vraie conformité, DOM/serveur simulés.
 * Aucun accès réseau. Les dates ci-dessous sont des réponses fictives, pas un audit FFR.
 * node tests/choix-categories-tournoi.test.js
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const lire = p => fs.readFileSync(path.join(root, p), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
let controles = 0;
function ok(x, m) { assert.ok(x, m); controles++; }
function egal(a, b, m) { assert.deepEqual(clone(a), clone(b), m); controles++; }
function extrait(p, nom) {
  const s = lire(p); const debut = s.indexOf('function ' + nom + '(');
  assert.notEqual(debut, -1, nom);
  const fin = s.indexOf('\n}', debut); assert.notEqual(fin, -1, nom);
  return s.slice(debut, fin + 2);
}
function suspendre() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const tour = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function bac(categories = []) {
  const elements = {};
  const element = id => elements[id] || (elements[id] = {
    innerHTML: '', textContent: '', value: '', disabled: false,
    addEventListener() {}, querySelectorAll() { return []; }
  });
  const cases = ['U6', 'U8', 'U10', 'U12', 'U14'].map(value => ({ value, checked: false }));
  element('form-choix-categories').querySelectorAll = () => cases;
  element('date').value = '2027-05-15'; element('zone').value = 'C';
  element('finder-mois').value = '2027-05';
  const serveur = { global: { tournoi_nom: 'Brouillon', heure_debut: '10:00' }, categories: clone(categories) };
  const equipes = [{ id: 'E1', categorie: 'U12', joueurs: 21 }];
  const matchs = [{ id: 'M1', categorie: 'U12', equipe_a: 'E1' }];
  const appels = { lectures: 0, ecritures: [], confirmations: [], api: [], propres: 0, rendus: 0 };
  const hooks = {};
  const ctx = vm.createContext({
    console, configCourante: clone(serveur),
    document: {
      getElementById: element,
      querySelector: s => s.includes('tournoi_date') ? element('date') : element('zone'),
      querySelectorAll: () => []
    },
    afficherMessage: (el, texte, type) => { el.textContent = texte; el.type = type; },
    afficherCategories: cats => { appels.rendus++; return cats.map(c => c.categorie).join(','); },
    remplirSelectCategories: cats => { appels.menu = clone(cats); },
    injecterTerrains() { appels.terrains = clone(ctx.configCourante.categories); },
    majTableauBord() { appels.navigation = clone(ctx.configCourante.categories); },
    majDossier() { appels.dossier = clone(ctx.configCourante.categories); },
    dialogConfirmer: async (texte, options) => {
      appels.confirmations.push({ texte, options });
      return hooks.confirmer ? hooks.confirmer() : true;
    },
    assistantMarquerPropre() { appels.propres++; },
    echapper: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    lireConfigAdmin: async (_, opt) => {
      appels.lectures++; appels.budget = opt;
      if (hooks.lire) await hooks.lire(appels.lectures);
      return clone(serveur);
    },
    ecrireAdmin: async (action, data) => {
      appels.ecritures.push({ action, data: clone(data) });
      if (hooks.avantEcrire) await hooks.avantEcrire(data);
      const i = serveur.categories.findIndex(c => c.categorie === data.categorie);
      if (action === 'supprimerCategorie') {
        if (i < 0) throw Error('Catégorie introuvable');
        serveur.categories.splice(i, 1);
      } else if (i < 0) serveur.categories.push(clone(data)); else serveur.categories[i] = clone(data);
      if (hooks.apresEcrire) await hooks.apresEcrire(data);
      return { ok: true };
    },
    apiGet: async (action, params) => {
      appels.api.push({ action, params });
      if (hooks.api) return hooks.api(action, params);
      if (action === 'datesCompatiblesFFR') return { jours: [{ date: '2027-05-15', dow: 6, applicable: true, statut: 'compatible' }] };
      return { refDisponible: true, bloquants: params.date === '2026-10-17'
        ? [{ libelle: 'CONFLIT SIMULÉ', categories: ['U10', 'U12'] }] : [], avertissements: [], regles: [], temps: [] };
    }
  });
  vm.runInContext(extrait('js/admin-reglages.js', 'normaliserNomCategorie') + '\n' +
    extrait('js/admin.js', 'estPresente') + '\n' + lire('js/admin-choix-categories.js') + '\n' +
    lire('js/admin-conformite-ffr.js'), ctx);
  ctx.refFFRCache = { dates: [{}], formes: [], regles: [], temps: [], millesime: 'SIMULATION' };
  // Uniquement le rendu des cartes de formes ; conformité et recherche sont les vraies fonctions.
  ctx.majFormesCategories = () => {};
  const choisir = noms => { cases.forEach(c => { c.checked = noms.includes(c.value); }); ctx.onChangerChoixCategories(); };
  const valider = () => ctx.onValiderChoixCategories({ preventDefault() {} });
  return { ctx, serveur, equipes, matchs, appels, hooks, cases, element, choisir, valider };
}
async function main() {
  // Le transport réel n'ajoute pas de rejeu technique caché sous le nouveau handler.
  for (const panne of ['404', 'json', 'reseau']) {
    let emissions = 0;
    const transport = vm.createContext({
      API_URL: 'https://fixture.invalid/exec', URL, AbortController, setTimeout, clearTimeout,
      sessionStorage: { getItem: () => 'CLE-FICTIVE', setItem() {} },
      fetch: async () => {
        emissions++;
        if (panne === 'reseau') throw Error('Réponse perdue');
        return { ok: panne !== '404', status: panne === '404' ? 404 : 200,
          json: async () => ({ error: 'Erreur serveur pendant l’écriture.' }) };
      }
    });
    vm.runInContext(lire('js/api.js') + '\nasync ' + extrait('js/admin.js', 'ecrireAdmin'), transport);
    await assert.rejects(transport.ecrireAdmin('enregistrerCategorie', { categorie: 'U10', presente: 'oui' })); controles++;
    egal(emissions, 1, 'transport réel : une seule émission catégorie malgré ' + panne);
    await assert.rejects(transport.ecrireAdmin('supprimerCategorie', { categorie: 'U10' })); controles++;
    egal(emissions, 2, 'transport réel : une seule émission suppression malgré ' + panne);
  }
  const html = lire('admin.html');
  ok(html.indexOf('id="bloc-choix-categories"') < html.indexOf('id="bloc-cadre-tournoi"'), 'catégories avant date');
  egal([...html.matchAll(/name="categories" value="(U\d+)"/g)].map(m => m[1]), ['U6', 'U8', 'U10', 'U12', 'U14']);
  for (const f of ['js/ecrans.js', 'js/assistant.js']) ok(lire(f).includes("['bloc-choix-categories', 'bloc-cadre-tournoi', 'bloc-infos-tournoi']"), f);
  ok(html.indexOf('js/admin-choix-categories.js') < html.indexOf('js/admin-conformite-ffr.js'), 'ordre des modules');
  ok(lire('js/admin.js').includes("ecouter('form-choix-categories', 'submit', onValiderChoixCategories)"), 'submit branché');
  ok(/\.asst-viewport\s*\{[^}]*overflow:\s*clip/.test(lire('css/styles.css')), 'carrousel non défilable par le focus natif');
  {
    const b = bac(); await b.ctx.majConformiteFFR(); await b.ctx.onChercherDatesCompatibles();
    egal(b.appels.api.length, 0, 'aucun appel FFR sans catégories');
    ok(b.element('bloc-conformite-ffr').innerHTML.includes('Choisis et valide'), 'neutralité');
    b.choisir(['U6', 'U8', 'U10', 'U12', 'U14']); await b.ctx.majConformiteFFR();
    egal(b.element('message-choix-categories').className, 'message-form', 'instruction neutre, pas une erreur');
    egal(b.appels.api.length, 0, 'aucun appel avant validation');
    await b.valider(); egal(b.serveur.categories.length, 5, 'cinq créations');
    egal(b.element('message-choix-categories').className, 'message-form ok');
    egal(b.appels.ecritures.map(a => a.action), Array(5).fill('enregistrerCategorie'));
    egal(b.appels.api.at(-1).params.categories, 'U6,U8,U10,U12,U14', 'recalcul après validation');
    ok(b.element('bloc-conformite-ffr').innerHTML.includes('ffr-vert'));
    egal(b.appels.menu.length, 5); egal(b.element('zone-categories').innerHTML, 'U6,U8,U10,U12,U14');
    egal(b.element('date').value, '2027-05-15', 'saisie date préservée');
    egal(b.serveur.global, { tournoi_nom: 'Brouillon', heure_debut: '10:00' }, 'infos et horaires intacts');
    egal(b.appels.budget.delaiMs, 30000);
    await b.valider(); egal(b.appels.ecritures.length, 5, 'validation répétée idempotente');
    b.element('date').value = '2026-10-17'; await b.ctx.majConformiteFFR();
    ok(b.element('bloc-conformite-ffr').innerHTML.includes('ffr-rouge'), 'conflit simulé rendu');
    b.element('date').value = ''; await b.ctx.majConformiteFFR();
    ok(b.element('bloc-conformite-ffr').innerHTML.includes('Renseigne la date'));
    b.choisir([]); await b.valider(); egal(b.serveur.categories.length, 0, 'décocher retire les cinq catégories');
    egal(b.appels.ecritures.length, 10); ok(b.cases.every(c => !c.checked), 'cases reflètent les suppressions');
    egal(b.appels.ecritures.slice(5).map(a => a.action), Array(5).fill('supprimerCategorie'));
    await b.valider(); egal(b.appels.ecritures.length, 10, 'revalidation vide sans rejeu');
    const appelsAvant = b.appels.api.length;
    await b.ctx.onChercherDatesCompatibles(); egal(b.appels.api.length, appelsAvant, 'aucun appel sans catégories après suppression');
    ok(b.element('bloc-conformite-ffr').innerHTML.includes('Choisis et valide'), 'aucun verdict vert après retrait total');
  }
  {
    const original = { categorie: ' m10 ', presente: 'oui', nb_poules: '3', reglement: 'Conservé', extension_future: 'X' };
    const inactive = { categorie: 'U12', presente: 'non', terrains: 'B', effectif_min: '17', format_apresmidi: 'LIBRE', extension_future: 'Y' };
    const b = bac([original, inactive]); b.choisir(['U10', 'U12']); await b.valider();
    egal(b.appels.ecritures.length, 1, 'alias existant non recréé'); egal(b.serveur.categories[0], original);
    egal(b.serveur.categories[1], { ...inactive, presente: 'oui' }, 'réactivation conserve TOUS les champs');
    b.choisir(['U10']); b.ctx.majChoixCategoriesTournoi(); ok(!b.cases[3].checked, 'choix préparé non écrasé');
    await b.valider(); egal(b.appels.ecritures.length, 2, 'catégorie décochée supprimée');
    egal(b.appels.ecritures[1], { action: 'supprimerCategorie', data: { categorie: 'U12' } });
    egal(b.serveur.categories, [original], 'catégorie cochée et réglages inchangés');
  }
  {
    const gardee = { categorie: 'U10', presente: 'oui', terrains: 'A', reglement: 'Original' };
    const horsChoix = { categorie: 'U16', presente: 'oui', extension: 'Ne pas toucher' };
    const b = bac([gardee, { categorie: 'U12', presente: 'oui', terrains: 'B' }, horsChoix]);
    const equipes = clone(b.equipes), matchs = clone(b.matchs);
    await b.ctx.onChercherDatesCompatibles();
    b.choisir(['U10']);
    ok(b.element('message-choix-categories').textContent.includes('U12'), 'avertissement ciblé avant validation');
    ok(b.element('message-choix-categories').textContent.includes('réglages seront supprimés'));
    egal(b.element('finder-resultats').innerHTML, '', 'dates invalidées dès le retrait préparé');
    await b.valider();
    egal(b.serveur.categories, [gardee, horsChoix], 'hors des cinq choix préservé');
    egal(b.equipes, equipes, 'équipes conservées'); egal(b.matchs, matchs, 'matchs conservés');
    egal(b.appels.confirmations.length, 1);
    ok(b.appels.confirmations[0].texte.includes('U12 et tous leurs réglages'));
    ok(b.appels.confirmations[0].texte.includes('équipes et les matchs seront conservés'));
    egal(b.appels.confirmations[0].options, { ok: 'Supprimer et valider', danger: true });
    for (const zone of ['menu', 'terrains', 'navigation', 'dossier']) egal(b.appels[zone], [gardee, horsChoix], zone + ' actualisé');
    egal(b.appels.api.at(-1).params.categories, 'U10,U16', 'FFR sans la catégorie retirée');
  }
  {
    const b = bac([{ categorie: 'U12', presente: 'oui' }]);
    b.choisir(['U10']); b.hooks.confirmer = () => false; await b.valider();
    egal(b.appels.ecritures, [], 'annulation avant toute suppression ET création');
    ok(b.ctx.choixCategoriesAValider() && b.cases[2].checked && !b.cases[3].checked);
    ok(!b.element('bouton-valider-categories').disabled, 'annulation libère le verrou');
  }
  {
    const b = bac([{ categorie: 'U12', presente: 'oui' }]); const dialogue = suspendre();
    b.choisir([]); b.hooks.confirmer = () => dialogue.promise;
    const p = b.valider(); await tour(); await b.valider();
    egal(b.appels.confirmations.length, 1, 'doubleclic protégé pendant confirmation');
    egal(b.appels.ecritures.length, 0); dialogue.resolve(true); await p;
    egal(b.appels.ecritures.length, 1, 'une suppression après confirmation');
  }
  for (const texte of ['HTTP 404', 'Réponse JSON illisible', 'Réponse perdue']) {
    const b = bac([{ categorie: 'U12', presente: 'oui' }]); b.choisir([]);
    b.hooks.apresEcrire = () => { throw Error(texte); }; await b.valider();
    egal(b.appels.ecritures.length, 1, 'suppression non rejouée : ' + texte);
    egal(b.appels.lectures, 2, 'prélecture et réconciliation seule');
    egal(b.appels.menu, [], 'retrait confirmé par la relecture');
    ok(b.ctx.choixCategoriesAValider(), 'validation explicite encore nécessaire');
    b.hooks.apresEcrire = null; await b.valider();
    egal(b.appels.ecritures.length, 1, 'reprise sans suppression doublonnée');
    egal(b.appels.confirmations.length, 1, 'pas de confirmation superflue après retrait constaté');
    ok(!b.ctx.choixCategoriesAValider());
  }
  {
    const b = bac([{ categorie: 'U10', presente: 'oui' }, { categorie: 'U12', presente: 'oui' }]);
    b.choisir([]); b.hooks.apresEcrire = () => { throw Error('Réponse perdue'); }; await b.valider();
    egal(b.serveur.categories.map(c => c.categorie), ['U12'], 'lot partiel relu');
    b.hooks.apresEcrire = null; await b.valider();
    egal(b.appels.ecritures.map(a => a.data.categorie), ['U10', 'U12'], 'seul retrait restant émis');
  }
  {
    const b = bac([{ categorie: 'U12', presente: 'oui' }]); b.choisir([]);
    b.hooks.lire = n => { if (n > 1) throw Error('Serveur indisponible'); };
    await b.valider();
    egal(b.appels.ecritures.length, 1, 'pas de rejeu si toutes les relectures échouent');
    for (const id of ['zone-categories', 'zone-terrains', 'etat-dossier', 'ligne-apercu-dossier']) {
      ok(b.element(id).textContent.includes('à vérifier'), id + ' ne présente pas un état périmé');
    }
    egal(b.appels.menu, []); egal(b.element('tb-categories').textContent, 'À vérifier');
    ok(b.ctx.choixCategoriesAValider()); ok(b.cases.every(c => !c.checked));
    b.hooks.lire = null; await b.valider();
    egal(b.appels.ecritures.length, 1); egal(b.appels.dossier, [], 'vues restaurées après reprise');
  }
  {
    const categorie = { categorie: 'U12', presente: 'oui' };
    const b = bac([categorie]); b.choisir([]);
    b.hooks.apresEcrire = () => { b.serveur.categories = [clone(categorie)]; };
    await b.valider(); ok(b.ctx.choixCategoriesAValider(), 'un acquittement sans disparition ne suffit pas');
    egal(b.appels.api.length, 0, 'aucun verdict FFR sur retrait non confirmé');
  }
  {
    const b = bac(); const lecture = suspendre(); b.hooks.lire = () => lecture.promise;
    b.choisir(['U10']); const p = b.valider(); await tour(); await b.valider();
    egal(b.appels.lectures, 1, 'double soumission gardée avant lecture');
    ok(b.element('bouton-valider-categories').disabled && b.element('choix-categories-champs').disabled);
    b.hooks.lire = null; lecture.resolve(); await p; egal(b.appels.ecritures.length, 1);
    ok(!b.element('bouton-valider-categories').disabled);
  }
  {
    const b = bac(); const post = suspendre(); b.hooks.avantEcrire = () => post.promise;
    b.choisir(['U10']); const p = b.valider(); await tour(); await b.valider();
    egal(b.appels.ecritures.length, 1, 'double soumission pendant POST'); post.resolve(); await p;
    egal(b.serveur.categories.length, 1);
  }
  for (const texte of ['HTTP 404', 'Erreur serveur pendant l’écriture.', 'Réponse JSON illisible']) {
    const b = bac(); b.choisir(['U10', 'U12']);
    b.hooks.apresEcrire = () => { throw Error(texte); }; await b.valider();
    egal(b.appels.ecritures.length, 1, 'pas de réémission automatique : ' + texte);
    egal(b.serveur.categories.map(c => c.categorie), ['U10'], 'écriture persistée');
    ok(b.element('message-choix-categories').textContent.includes('Validation non confirmée'));
    egal(b.element('message-choix-categories').className, 'message-form ko');
    ok(b.ctx.choixCategoriesAValider()); egal(b.appels.api.length, 0);
    b.hooks.apresEcrire = null; await b.valider();
    egal(b.appels.ecritures.map(a => a.data.categorie), ['U10', 'U12'], 'reprise relit sans recréer U10');
    egal(b.serveur.categories.length, 2); ok(!b.ctx.choixCategoriesAValider());
  }
  for (const echec of [1, 2]) {
    const b = bac(); b.choisir(['U10']);
    b.hooks.lire = n => { if (n === echec) throw Error('Lecture interrompue'); };
    await b.valider(); egal(b.appels.ecritures.length, echec === 1 ? 0 : 1, 'échec prélecture/relecture');
    ok(b.ctx.choixCategoriesAValider()); ok(b.cases[2].checked, 'sélection gardée');
    ok(!b.element('bouton-valider-categories').disabled, 'reprise disponible');
    egal(b.appels.api.length, 0, 'pas de verdict après échec');
    b.hooks.lire = null; await b.valider(); egal(b.appels.ecritures.length, 1, 'reprise sûre');
  }
  {
    const b = bac(); b.choisir(['U10']); b.hooks.apresEcrire = () => { b.serveur.categories = []; };
    await b.valider(); ok(b.ctx.choixCategoriesAValider(), 'relecture doit confirmer la présence');
    ok(b.element('message-choix-categories').textContent.includes('non confirmée'));
  }
  for (const rejeter of [false, true]) {
    const b = bac([{ categorie: 'U10', presente: 'oui' }]); const retard = suspendre();
    b.hooks.api = () => retard.promise; const p = b.ctx.majConformiteFFR(); await tour();
    b.choisir(['U10', 'U12']); const neutre = b.element('bloc-conformite-ffr').innerHTML;
    if (rejeter) retard.reject(Error('ancien échec')); else retard.resolve({ refDisponible: true });
    await p; egal(b.element('bloc-conformite-ffr').innerHTML, neutre, 'réponse FFR périmée ignorée');
    egal(b.ctx.dernierResConformite, null);
  }
  {
    const b = bac([{ categorie: 'U10', presente: 'oui' }]); const ancien = suspendre();
    b.hooks.api = (_, p) => p.date === '2027-05-15' ? ancien.promise : { refDisponible: true, bloquants: [{ libelle: 'NOUVEAU' }] };
    const p = b.ctx.majConformiteFFR(); await tour(); b.element('date').value = '2026-10-17';
    await b.ctx.majConformiteFFR(); const nouveau = b.element('bloc-conformite-ffr').innerHTML;
    ancien.resolve({ refDisponible: true }); await p;
    egal(b.element('bloc-conformite-ffr').innerHTML, nouveau, 'dernière date gagne');
  }
  for (const rejeter of [false, true]) {
    const b = bac([{ categorie: 'U10', presente: 'oui' }]); const retard = suspendre();
    b.hooks.api = () => retard.promise; const p = b.ctx.onChercherDatesCompatibles(); await tour();
    b.choisir(['U12']); egal(b.element('finder-resultats').innerHTML, '', 'suggestions effacées immédiatement');
    ok(!b.element('bouton-chercher-dates').disabled, 'ancienne recherche invalidée ne bloque pas la suivante');
    if (rejeter) retard.reject(Error('ancien échec')); else retard.resolve({ jours: [{ applicable: true, date: '2027-05-15' }] });
    await p; egal(b.element('finder-resultats').innerHTML, '', 'ancienne recherche ignorée');
    ok(!b.element('bouton-chercher-dates').disabled);
  }
  {
    const b = bac([{ categorie: 'U10', presente: 'oui' }]);
    const ancienne = suspendre(), recente = suspendre(); let n = 0;
    b.hooks.api = () => ++n === 1 ? ancienne.promise : recente.promise;
    const p1 = b.ctx.onChercherDatesCompatibles(); await tour();
    b.ctx.invaliderDatesCompatiblesFFR();
    const p2 = b.ctx.onChercherDatesCompatibles(); await tour();
    ancienne.resolve({ jours: [] }); await p1;
    ok(b.element('bouton-chercher-dates').disabled, 'ancien finally ne déverrouille pas la nouvelle recherche');
    recente.resolve({ jours: [] }); await p2;
    ok(!b.element('bouton-chercher-dates').disabled, 'le propriétaire libère le bouton');
  }
  {
    const b = bac([{ categorie: 'U10', presente: 'oui' }]);
    await b.ctx.onChercherDatesCompatibles(); ok(b.element('finder-resultats').innerHTML.includes('2027-05-15'));
    b.choisir(['U10', 'U12']); await b.valider();
    egal(b.appels.api.at(-1).params.categories, 'U10,U12', 'FFR recalculée avec choix validé');
    egal(b.element('finder-resultats').innerHTML, '', 'suggestions antérieures invalidées');
    egal(b.ctx.dernierResConformite.refDisponible, true);
  }
  console.log('OK — ' + controles + ' contrôles passés (modules réels, serveur et DOM simulés).');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
