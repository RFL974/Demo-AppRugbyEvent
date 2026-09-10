/**
 * ============================================================================
 *  GARDE-FOU FRONTEND — les clés se saisissent à l'abri des regards
 *  Chantier SEC-DIALOG-CLES-DR-4E
 * ============================================================================
 *
 *  ▶ Pour lancer :  node tests/sec-dialog-cles-dr-4e.test.js
 *    (aucune dépendance, aucun navigateur, aucun réseau — Node seul)
 *
 *  CE QU'IL PROTÈGE — quatre promesses :
 *
 *   ① une clé se tape dans un champ MASQUÉ (`type="password"`), sans correction ni
 *      majuscule automatique, et sans que le navigateur propose de l'enregistrer ;
 *   ② un dialogue ORDINAIRE (copier une adresse, un lien de dossier) reste en clair —
 *      masquer un texte qu'il faut justement lire et recopier le rendrait inutile ;
 *   ③ la valeur saisie ne se retrouve JAMAIS dans le HTML produit, ni dans un attribut,
 *      ni dans un journal, ni dans un message ;
 *   ④ Valider et Annuler se comportent exactement comme avant.
 *
 *  ⭐ IL EXÉCUTE LE CODE RÉEL de `js/dialog.js`, joué dans un contexte Node sur un DOM
 *  doublé. ⛔ Rien n'est recopié.
 *
 *  ⭐ ET IL SE PROUVE LUI-MÊME (§ 5) : le code d'AVANT est reconstruit et rejoué. S'il ne
 *  reproduit PAS le défaut (champ en clair), ce fichier ÉCHOUE.
 *
 *  ⚠️ LA « CLÉ » UTILISÉE ICI EST ENTIÈREMENT FACTICE. Elle est inventée pour ce fichier,
 *  n'ouvre rien, et n'a jamais été une vraie clé.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

/** ⚠️ Valeur FACTICE — inventée pour ce test, elle n'ouvre rien. */
const CLE_FACTICE = 'CLE-FACTICE-4E-jamais-reelle';

/* ========================================================================== */
/*  DOUBLURE DE DOM — assez fidèle pour que le test prouve quelque chose.      */
/* ========================================================================== */

/**
 * Fabrique un DOM minimal.
 *
 * ⭐ FIDÉLITÉ QUI COMPTE : `element.value = x` est une PROPRIÉTÉ et n'apparaît pas dans
 * `outerHTML`, alors que `setAttribute('value', x)` l'y ferait apparaître. C'est exactement
 * la distinction que le § 3 surveille — si `dialog.js` passait un jour par `setAttribute`,
 * le contrôle le verrait.
 */
function fabriquerDom() {
  const crees = [];
  const journalClavier = [];

  function creer(tag) {
    const attributs = {};
    const ecouteurs = {};
    const enfants = [];
    const el = {
      tagName: String(tag).toUpperCase(),
      enfants, attributs, ecouteurs,
      className: '', id: '', textContent: '', value: '', placeholder: '',
      type: '', autocomplete: '', spellcheck: undefined,
      focus() { el.aEuLeFocus = true; },
      select() { el.aEteSelectionne = true; },
      remove() { el.retire = true; },
      setAttribute(n, v) { attributs[n] = String(v); },
      getAttribute(n) { return Object.prototype.hasOwnProperty.call(attributs, n) ? attributs[n] : null; },
      appendChild(e) { enfants.push(e); return e; },
      addEventListener(t, fn) { (ecouteurs[t] = ecouteurs[t] || []).push(fn); },
      removeEventListener(t, fn) {
        if (!ecouteurs[t]) return;
        ecouteurs[t] = ecouteurs[t].filter((f) => f !== fn);
      },
      declencher(t, ev) { (ecouteurs[t] || []).forEach((fn) => fn(ev || {})); },
      // `onKey` (touche Entrée) appelle `btnOk.click()` : la doublure doit le savoir faire.
      click() { el.declencher('click'); },
      // Sérialisation : les ATTRIBUTS seulement — jamais les propriétés. Comme un vrai DOM.
      get outerHTML() {
        const refl = [];
        if (el.className) refl.push('class="' + el.className + '"');
        if (el.id) refl.push('id="' + el.id + '"');
        if (el.type) refl.push('type="' + el.type + '"');
        if (el.autocomplete) refl.push('autocomplete="' + el.autocomplete + '"');
        if (el.placeholder) refl.push('placeholder="' + el.placeholder + '"');
        if (el.spellcheck === false) refl.push('spellcheck="false"');
        Object.keys(attributs).forEach((n) => refl.push(n + '="' + attributs[n] + '"'));
        const dedans = enfants.map((e) => e.outerHTML).join('') + (el.textContent || '');
        return '<' + tag + (refl.length ? ' ' + refl.join(' ') : '') + '>' + dedans + '</' + tag + '>';
      }
    };
    crees.push(el);
    return el;
  }

  const head = creer('head');
  const body = creer('body');
  const doc = {
    head, body, documentElement: creer('html'),
    getElementById(id) { return crees.find((e) => e.id === id) || null; },
    createElement: creer,
    addEventListener(t, fn) { journalClavier.push({ t, fn }); },
    removeEventListener(t, fn) {
      const i = journalClavier.findIndex((x) => x.fn === fn);
      if (i !== -1) journalClavier.splice(i, 1);
    }
  };
  return { document: doc, crees, journalClavier, body };
}

/** Charge le VRAI dialog.js dans un contexte neuf, et renvoie de quoi l'observer. */
function bancDialog(source) {
  const dom = fabriquerDom();
  const journaux = [];
  const tracer = (...a) => journaux.push(a.map(String).join(' '));
  const ctx = { document: dom.document, journaux };
  ctx.window = ctx;
  ctx.console = { log: tracer, info: tracer, warn: tracer, error: tracer, debug: tracer };
  vm.createContext(ctx);
  vm.runInContext(source || lire('js/dialog.js'), ctx);
  return { ctx, dom, journaux };
}

/** Le champ de saisie du dialogue actuellement ouvert. */
function champDe(dom) {
  return dom.crees.find((e) => e.className === 'dlg-input') || null;
}

/** Le bouton dont le libellé correspond. */
function boutonDe(dom, texte) {
  return dom.crees.find((e) => e.tagName === 'BUTTON' && e.textContent === texte) || null;
}

/* ========================================================================== */

let reussis = 0;
const echecs = [];

function verifier(numero, intitule, condition, detail) {
  if (condition) { reussis++; console.log('  ✓ [' + numero + '] ' + intitule); }
  else { echecs.push('[' + numero + '] ' + intitule + (detail ? ' — ' + detail : ''));
         console.log('  ✗ [' + numero + '] ' + intitule + (detail ? ' — ' + detail : '')); }
}

async function controles() {

  /* ---- ① le champ d'une CLÉ est masqué ---------------------------------- */
  console.log('\n① Une clé se tape dans un champ masqué');

  const b1 = bancDialog();
  const p1 = b1.ctx.dialogDemander('Entre la clé :', '', { ok: 'Se connecter', secret: true });
  const champ1 = champDe(b1.dom);

  verifier('1.1', 'le champ existe', champ1 !== null);
  verifier('1.2', 'il est de type « password »', champ1.type === 'password',
    'type obtenu : ' + (champ1 && champ1.type));
  verifier('1.3', 'la correction automatique est coupée',
    champ1.getAttribute('autocorrect') === 'off');
  verifier('1.4', 'les majuscules automatiques sont coupées',
    champ1.getAttribute('autocapitalize') === 'off');
  verifier('1.5', 'le correcteur orthographique est coupé', champ1.spellcheck === false);
  verifier('1.6', 'le navigateur est prié de ne pas l\'enregistrer (« new-password »)',
    champ1.autocomplete === 'new-password',
    'autocomplete obtenu : ' + champ1.autocomplete);
  verifier('1.7', 'le champ n\'a AUCUN nom (ni soumission, ni heuristique de trousseau)',
    champ1.getAttribute('name') === null && !champ1.name);

  /* ---- ② un dialogue ORDINAIRE reste en clair ---------------------------- */
  console.log('\n② Un dialogue ordinaire reste lisible');

  const b2 = bancDialog();
  b2.ctx.dialogDemander('Copie l\'adresse ci-dessous :', 'https://exemple.test/page', { ok: 'Fermer' });
  const champ2 = champDe(b2.dom);

  verifier('2.1', 'sans l\'option, le champ reste « text »', champ2.type === 'text',
    'type obtenu : ' + champ2.type);
  verifier('2.2', 'et garde son autocomplete d\'origine', champ2.autocomplete === 'off');
  verifier('2.3', 'la valeur à recopier reste bien lisible dans le champ',
    champ2.value === 'https://exemple.test/page');

  // ⛔ L'option est un OPT-IN STRICT : rien d'autre que `true` ne masque le champ.
  const b2b = bancDialog();
  b2b.ctx.dialogDemander('Ordinaire', '', { secret: 'oui' });   // valeur « vraie » mais pas `true`
  verifier('2.4', 'seul `secret: true` masque — une valeur approchante ne suffit pas',
    champDe(b2b.dom).type === 'text',
    'type obtenu : ' + champDe(b2b.dom).type);

  /* ---- ③ la valeur ne fuit nulle part ------------------------------------ */
  console.log('\n③ La valeur saisie ne fuit ni dans le HTML, ni dans les journaux');

  const b3 = bancDialog();
  const p3 = b3.ctx.dialogDemander('Entre la clé :', '', { ok: 'Valider', secret: true });
  const champ3 = champDe(b3.dom);
  champ3.value = CLE_FACTICE;                       // l'organisateur tape sa clé

  const overlay3 = b3.dom.crees.find((e) => e.className === 'dlg-overlay');
  const htmlDialogue = overlay3.outerHTML;

  verifier('3.1', 'la clé n\'est PAS dans le HTML du dialogue',
    htmlDialogue.indexOf(CLE_FACTICE) === -1);
  verifier('3.2', 'aucun attribut « value » n\'est posé sur le champ',
    champ3.getAttribute('value') === null);
  verifier('3.3', 'la clé n\'est pas dans le message affiché',
    b3.dom.crees.filter((e) => e.className === 'dlg-msg')
      .every((e) => e.textContent.indexOf(CLE_FACTICE) === -1));

  boutonDe(b3.dom, 'Valider').declencher('click');
  const rendu3 = await p3;

  verifier('3.4', 'la clé est bien rendue à l\'appelant (le dialogue reste utile)',
    rendu3 === CLE_FACTICE);
  verifier('3.5', 'rien n\'a été journalisé pendant toute l\'opération',
    b3.journaux.length === 0, JSON.stringify(b3.journaux).slice(0, 120));
  verifier('3.6', 'et la clé n\'apparaît dans AUCUN journal',
    b3.journaux.every((l) => l.indexOf(CLE_FACTICE) === -1));

  // Contrôle STATIQUE : la source elle-même ne peut pas exposer la valeur.
  const srcDialog = lire('js/dialog.js');
  verifier('3.7', 'le code ne pose jamais la valeur en ATTRIBUT (setAttribute("value"))',
    !/setAttribute\(\s*['"]value['"]/.test(srcDialog));
  verifier('3.8', 'le code ne journalise jamais rien',
    !/console\.(log|warn|error|info|debug)/.test(srcDialog));

  /* ---- ④ Valider et Annuler : comportement inchangé ---------------------- */
  console.log('\n④ Valider et Annuler se comportent comme avant');

  const b4 = bancDialog();
  const p4 = b4.ctx.dialogDemander('Entre la clé :', '', { ok: 'Se connecter', secret: true });
  champDe(b4.dom).value = CLE_FACTICE;
  boutonDe(b4.dom, 'Se connecter').declencher('click');
  verifier('4.1', 'Valider rend la valeur saisie', (await p4) === CLE_FACTICE);

  const b5 = bancDialog();
  const p5 = b5.ctx.dialogDemander('Entre la clé :', '', { ok: 'Se connecter', secret: true });
  champDe(b5.dom).value = CLE_FACTICE;
  boutonDe(b5.dom, 'Annuler').declencher('click');
  verifier('4.2', 'Annuler rend null, MÊME si quelque chose avait été tapé', (await p5) === null);

  const b6 = bancDialog();
  const p6 = b6.ctx.dialogDemander('Entre la clé :', '', { ok: 'Valider', secret: true });
  champDe(b6.dom).value = CLE_FACTICE;
  b6.dom.journalClavier.forEach((x) => x.fn({ key: 'Escape', preventDefault() {} }));
  verifier('4.3', 'Échap annule aussi, et rend null', (await p6) === null);

  const b7 = bancDialog();
  const p7 = b7.ctx.dialogDemander('Entre la clé :', '', { ok: 'Valider', secret: true });
  champDe(b7.dom).value = CLE_FACTICE;
  b7.dom.journalClavier.forEach((x) => x.fn({ key: 'Enter', preventDefault() {} }));
  verifier('4.4', 'Entrée valide, comme avant', (await p7) === CLE_FACTICE);

  const b8 = bancDialog();
  b8.ctx.dialogDemander('Entre la clé :', '', { ok: 'Valider', secret: true });
  verifier('4.5', 'le champ reçoit le focus à l\'ouverture', champDe(b8.dom).aEuLeFocus === true);

  // Le dialogue ① n'avait pas été refermé : on l'annule pour libérer sa promesse.
  // ⚠️ NE JAMAIS l'attendre sans le fermer d'abord : `await` sur une promesse qui ne se résout
  //    pas fige la suite EN SILENCE — le processus s'éteint alors avec un code 0 trompeur,
  //    sans bilan et sans avoir joué les sections suivantes. C'est arrivé en écrivant ce test.
  boutonDe(b1.dom, 'Annuler').declencher('click');
  verifier('4.6', 'le premier dialogue se referme proprement', (await p1) === null);

  /* ---- ⑤ chaque demande de CLÉ est bien marquée, et elle seule ----------- */
  console.log('\n⑤ Recensement : toutes les clés, et rien qu\'elles');

  // Chaque entrée : fichier, repère du site d'appel, et si `secret: true` est attendu.
  const SITES = [
    ['js/api.js',   'dialogDemander(message, lireCleLocale(role)',            true,  'redemande de clé (admin ou scores)'],
    ['js/api.js',   'dialogDemander(\'🔒 Accès \' + libelle',                  true,  'connexion admin OU scores'],
    ['js/api.js',   'const saisie = await dialogDemander(message, \'\'',        true,  'confirmation forte (score définitif, nouvelle clé)'],
    ['js/admin.js', 'administration\\n\\nEntre la clé',                            true,  'ouverture de l\'administration'],
    ['js/admin.js', 'abord la clé ACTUELLE',                          true,  'changement de clé'],
    ['js/admin-infos-publication.js', 'Copie automatique impossible',          false, 'adresse à recopier — ordinaire'],
    ['js/admin-invitations.js',       'Copie le lien du dossier',              false, 'lien de dossier — ordinaire']
  ];

  SITES.forEach(function (site, i) {
    const [fichier, repere, doitEtreSecret, quoi] = site;
    const src = lire(fichier);
    const pos = src.indexOf(repere);
    if (pos === -1) {
      verifier('5.' + (i + 1), quoi + ' — site introuvable', false,
        'repère « ' + repere + ' » absent de ' + fichier + ' : le code a changé, mets ce garde-fou à jour');
      return;
    }
    // On regarde l'appel jusqu'à sa parenthèse fermante de fin d'instruction.
    const fin = src.indexOf(');', pos);
    const appel = src.slice(Math.max(0, pos - 200), fin);
    const estSecret = /secret:\s*true/.test(appel);
    verifier('5.' + (i + 1),
      quoi + ' → ' + (doitEtreSecret ? 'MASQUÉ' : 'en clair'),
      estSecret === doitEtreSecret,
      estSecret ? 'marqué secret alors qu\'il ne devrait pas' : 'PAS marqué secret alors qu\'il le devrait');
  });

  // Filet : aucune demande de clé n'a pu échapper au recensement ci-dessus.
  const tousLesAppels = ['js/api.js', 'js/admin.js', 'js/saisie.js', 'js/admin-generation.js',
    'js/admin-infos-publication.js', 'js/admin-invitations.js']
    .reduce((n, f) => n + (lire(f).match(/dialogDemander\(/g) || []).length, 0);
  verifier('5.8', 'le recensement couvre TOUS les appels à dialogDemander (' + tousLesAppels + ')',
    tousLesAppels === SITES.length,
    tousLesAppels + ' appels dans le code pour ' + SITES.length + ' recensés — un site a été ajouté ailleurs');

  /* ---- ⑥ preuve du harnais : le code d'AVANT doit ÉCHOUER ---------------- */
  console.log('\n⑥ Preuve du harnais : le code d\'AVANT reproduit bien le défaut');

  const avant = srcDialog.replace(
    /if \(opts\.secret\) \{[\s\S]*?\} else \{\n\s*input\.type = 'text';\n\s*input\.autocomplete = 'off';\n\s*\}/,
    "input.type = 'text';\n        input.autocomplete = 'off';");
  if (avant === srcDialog) {
    verifier('6.1', 'Z1 — reconstruction du code d\'avant', false,
      'la substitution n\'a rien remplacé : mets ce garde-fou à jour');
  } else {
    const bZ = bancDialog(avant);
    bZ.ctx.dialogDemander('Entre la clé :', '', { ok: 'Valider', secret: true });
    verifier('6.1', 'Z1 — sans l\'option, la clé se tapait EN CLAIR (défaut reproduit)',
      champDe(bZ.dom).type === 'text',
      'la reconstruction n\'a pas reproduit le défaut : le § 1 ne prouve rien');
  }
}

/* ========================================================================== */

/* ⛔ GARDE-FOU : on part en ÉCHEC, et on ne repasse au vert qu'à la toute fin du bilan.
   Sans cela, une attente qui ne se dénoue jamais éteindrait le processus avec un code 0 —
   un test « vert » qui n'a en réalité rien joué. */
process.exitCode = 1;

controles().then(function () {
  console.log('\n' + '─'.repeat(70));
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + ' contrôle(s) en défaut sur ' +
      (reussis + echecs.length) + ' :');
    echecs.forEach(function (e) { console.log('   · ' + e); });
    process.exit(1);
  }
  console.log('OK — ' + reussis + ' contrôles passés.');
  process.exitCode = 0;                       // ⭐ le seul endroit qui lève le garde-fou
}).catch(function (e) {
  console.error('\nERREUR DU HARNAIS : ' + (e && e.stack || e));
  process.exit(1);
});
