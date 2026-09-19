'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const racine = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const html = lire('admin.html');
const source = lire('js/admin-infos-publication.js');
const admin = lire('js/admin.js');

let reussis = 0;
const echecs = [];
function verifier(libelle, condition) {
  if (condition) reussis++;
  else echecs.push(libelle);
}

const blocScores = html.slice(html.indexOf('id="acces-saisie"'), html.indexOf('id="message-acces-saisie"'));
const iGestes = blocScores.indexOf('id="acces-saisie-actions"');
const iOuvrir = blocScores.indexOf('id="acces-saisie-lien"');
const iSuite = blocScores.indexOf('id="acces-saisie-actions-suite"');
const iCloture = blocScores.indexOf('id="acces-saisie-cloture"');
const iQrScores = blocScores.indexOf('id="acces-saisie-qr"');

verifier('ouvrir est placé entre les gestes principaux et le renouvellement',
  iGestes !== -1 && iGestes < iOuvrir && iOuvrir < iSuite);
verifier('clôturer prend la place basse avant le QR de la table de marque',
  iCloture !== -1 && iCloture < iQrScores);
verifier('le rendu envoie ROTATION après le bouton d’accès et CLOTURER dans son bouton dédié',
  /g\.action === 'ROTATION' \? gestesSuite : gestes/.test(source) &&
  /g\.action === 'CLOTURER'[\s\S]*cloture\.hidden = false/.test(source));
verifier('les deux boutons de copie QR sont présents',
  /id="bouton-copier-qr-public"/.test(html) && /id="bouton-copier-qr-saisie"/.test(html));
verifier('le QR public est branché au chargement de l’administration',
  /ecouter\('bouton-copier-qr-public', 'click', onCopierQrPublic\)/.test(admin));
verifier('le bouton de copie du QR scores reste hors de tout aria-hidden',
  !/id="acces-saisie-qr"[^>]*aria-hidden/.test(blocScores));

function element(id) {
  const attributs = {};
  const enfants = [];
  return {
    id, hidden: false, href: '', textContent: '', className: '', enfants,
    setAttribute(n, v) { attributs[n] = String(v); },
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(attributs, n) ? attributs[n] : null; },
    removeAttribute(n) { delete attributs[n]; },
    querySelector(sel) { return sel === 'svg' ? (enfants.find((e) => e.tag === 'svg') || null) : null; },
    insertAdjacentHTML(position, valeur) {
      if (position !== 'afterbegin') throw new Error('position inattendue');
      const svg = { tag: 'svg', html: String(valeur), remove() { const i = enfants.indexOf(svg); if (i >= 0) enfants.splice(i, 1); } };
      enfants.unshift(svg);
    }
  };
}

const elements = {};
['acces-public-lien', 'acces-public-note', 'acces-public-qr', 'message-acces-public',
  'acces-saisie-qr', 'message-acces-saisie'].forEach((id) => { elements[id] = element(id); });

const rectangles = [];
const typesBlob = [];
const ecrituresPressePapier = [];
const messages = [];
const donneesQr = [];
const document = {
  getElementById(id) { return elements[id] || null; },
  createElement(tag) {
    if (tag !== 'canvas') return element('cree-' + tag);
    return {
      width: 0, height: 0,
      getContext() { return { fillStyle: '', fillRect(x, y, w, h) { rectangles.push([x, y, w, h]); } }; },
      toBlob(rappel, type) { typesBlob.push(type); rappel({ type: 'image/png', size: 4096 }); }
    };
  }
};

function ClipboardItem(contenu) { this.contenu = contenu; }
const contexte = {
  console,
  document,
  navigator: { clipboard: { write(items) { ecrituresPressePapier.push(items); return Promise.resolve(); } } },
  ClipboardItem,
  configCourante: { global: { tournoi_publie: 'non' } },
  urlPagePublique() { return 'http://127.0.0.1:8766/tournoi.html'; },
  afficherMessage(zone, texte, type) { if (zone) zone.textContent = texte; messages.push({ texte, type }); },
  window: { open() {} },
  dialogDemander() { return Promise.resolve(null); }
};
contexte.globalThis = contexte;
vm.createContext(contexte);
vm.runInContext(lire('js/vendor/qrcode.js'), contexte, { filename: 'js/vendor/qrcode.js' });
vm.runInContext('var __qrReel = qrcode; qrcode = function (t, n) { var q = __qrReel(t, n); var a = q.addData; ' +
  'q.addData = function (v) { __noterQr(String(v)); return a.apply(q, arguments); }; return q; };', contexte);
contexte.__noterQr = (v) => donneesQr.push(v);
vm.runInContext(source, contexte, { filename: 'js/admin-infos-publication.js' });

(async function () {
  contexte.majAccesPublic();
  const urlPublique = 'http://127.0.0.1:8766/tournoi.html';
  const urlScores = 'https://exemple.invalid/saisie?jeton=' + 'a'.repeat(64);
  elements['acces-saisie-qr'].setAttribute('data-url', urlScores);
  contexte.dessinerQrSaisie();

  verifier('le QR public encode exactement la page publique',
    elements['acces-public-qr'].getAttribute('data-url') === urlPublique && donneesQr.includes(urlPublique));
  verifier('le QR scores encode exactement le lien temporaire rendu',
    elements['acces-saisie-qr'].getAttribute('data-qr') === urlScores && donneesQr.includes(urlScores));
  verifier('les deux SVG sont décoratifs mais leurs boutons ne le sont pas',
    elements['acces-public-qr'].enfants[0].html.includes('aria-hidden="true"') &&
    elements['acces-saisie-qr'].enfants[0].html.includes('aria-hidden="true"'));

  await contexte.onCopierQrPublic();
  await contexte.onCopierQrSaisie();
  verifier('chaque bouton effectue exactement une copie presse-papiers', ecrituresPressePapier.length === 2);
  verifier('les deux copies sont de vraies images PNG',
    typesBlob.length === 2 && typesBlob.every((t) => t === 'image/png') &&
    ecrituresPressePapier.every((lot) => lot[0].contenu['image/png'].type === 'image/png'));
  verifier('la matrice du QR est réellement dessinée dans le PNG', rectangles.length > 100);
  verifier('un message de réussite explique que l’image peut être collée dans un document',
    messages.filter((m) => /image PNG/.test(m.texte) && /document/.test(m.texte) && m.type === 'ok').length === 2);
  verifier('la copie ne dépend d’aucun appel réseau ou serveur',
    !/fetch\s*\(|apiPost|ecrireAdmin/.test(source.slice(source.indexOf('function creerBlobQrPng'), source.indexOf('function onCopierQrSaisie') + 300)));

  if (echecs.length) {
    console.error('ÉCHEC — ' + echecs.length + ' contrôle(s) :\n- ' + echecs.join('\n- '));
    process.exit(1);
  }
  console.log('OK — ' + reussis + '/' + reussis + ' contrôles passés.');
})().catch((e) => { console.error(e); process.exit(1); });
