#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 *  ZÉRO APPEL — l’inventaire des gestes LOCAUX de l’écran « Publication »
 * ============================================================================
 *  ▶ node tests/ecran-publication-zero-appel.test.js
 *
 *  ⭐ CE QUE CETTE SUITE PROUVE, ET POURQUOI ELLE EXISTE À PART. La carte « Publication » est la
 *  seule de l’administration à mêler, au même endroit, DEUX écritures serveur (publier / masquer,
 *  et les transitions de l’accès à la table de marque) et SIX gestes purement locaux — copier
 *  l’adresse, ouvrir la page, copier ou agrandir le QR, ouvrir les dépliants d’aide. Un geste
 *  local qui se mettrait à parler au serveur passerait inaperçu : il « marcherait ». Cette suite
 *  les JOUE tous et exige ZÉRO requête métier, ZÉRO écriture, ZÉRO octet de cache touché.
 *
 *  ⭐ MESURE AU PLUS BAS NIVEAU. Le banc compte TOUTE sortie du navigateur : `fetch`,
 *  `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `window.open`, `Image.src` et le
 *  presse-papiers. ⛔ Le presse-papiers et `window.open` sont des sorties LÉGITIMES de ces gestes :
 *  la suite les distingue explicitement d’un appel réseau, au lieu de les interdire en bloc.
 *
 *  ⛔ Aucun réseau, aucun service Google réel, aucune donnée réelle : tournoi fictif.
 * ============================================================================
 */

const B = require('./banc-ecran-publication');

let n = 0;
const echecs = [];
function ok(v, m, preuve) {
  n++;
  if (!v) echecs.push(n + ' — ' + m + (preuve === undefined ? '' : ' :: ' + JSON.stringify(preuve)));
  console.log('  ' + (v ? '✓' : '✗') + ' ' + n + ' ' + m);
}
function titre(t) { console.log('\n-- ' + t + ' --'); }

/** Les sorties RÉSEAU d'un banc — ⛔ le presse-papiers et `window.open` n'en sont pas. */
const RESEAU = /^(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|Image) /;
const sortiesReseau = (b) => b.sorties.filter((s) => RESEAU.test(s) || s === 'XMLHttpRequest');

/** Un écran ouvert, visité, accès PRÉPARÉ et OUVERT : tous les gestes locaux sont atteignables. */
async function ecranComplet(opt) {
  const b = await B.banc(Object.assign({ monde: { publie: 'oui' } }, opt || {}));
  await b.arriver();
  await b.clicGeste('PREPARER', 40);
  await b.clicGeste('OUVRIR', 40);
  b.remettre();
  return b;
}

(async function () {

  titre('A — l’inventaire est complet');
  {
    const b = await ecranComplet();
    const manquants = B.GESTES_LOCAUX.filter((id) => !b.el(id));
    ok(manquants.length === 0,
      'A1 ⭐ les ' + B.GESTES_LOCAUX.length + ' boutons locaux inventoriés existent tous dans l’écran',
      manquants);
    /* ⭐ L'INVENTAIRE EST FERMÉ : tout bouton de la carte est soit un geste métier connu, soit un
       geste local inventorié. ⛔ Un bouton neuf ne peut pas se glisser hors de cette suite. */
    const METIER = ['bouton-publier', 'bouton-litige-charger', 'bouton-litige-corriger',
                    'acces-saisie-cloture'];
    /* ⛔ `bloc-publication` SEULEMENT : les cartes « Infos du tournoi » et « Date & conformité FFR »
       sont dans le banc parce que « Publier » en dépend, mais leurs boutons appartiennent à
       D'AUTRES écrans — les inventorier ici reviendrait à surveiller un périmètre qu'on ne traite pas. */
    const boutons = b.el('bloc-publication').querySelectorAll('button')
      .map((e) => e.id || (e.getAttribute('data-geste-acces') ? 'geste:' + e.getAttribute('data-geste-acces')
           : e.hasAttribute('data-ouvrir-affiche') ? 'affiche' : '(sans id)'))
      .filter((id) => id !== '(sans id)');
    const inconnus = boutons.filter((id) => B.GESTES_LOCAUX.indexOf(id) === -1 &&
      METIER.indexOf(id) === -1 && id.indexOf('geste:') !== 0 && id !== 'affiche');
    ok(inconnus.length === 0,
      'A2 ⭐⭐ aucun bouton de la carte n’échappe à l’inventaire (local, métier ou geste d’accès)',
      inconnus);
  }

  titre('B — copier l’adresse publique');
  {
    const b = await ecranComplet();
    await b.clic('bouton-copier-adresse-publique', 20);
    ok(sortiesReseau(b).length === 0 && b.requetes().length === 0,
      'B1 ⭐⭐ ZÉRO appel réseau, ZÉRO requête métier', [sortiesReseau(b), b.requetes()]);
    ok(b.cumul().ecritureValeurs.cellules === 0 && b.cumul().cache.ecritures === 0,
      'B2 ⭐⭐ ZÉRO cellule écrite, ZÉRO octet remis en cache', b.cumul().ecritureValeurs.cellules);
    ok(b.presse.length === 1 && /^https:\/\//.test(b.presse[0]),
      'B3 l’adresse est bien passée dans le presse-papiers', b.presse);
    ok(b.presse[0] === b.el('acces-public-lien').getAttribute('href'),
      'B4 ⭐ c’est EXACTEMENT l’adresse affichée — pas une seconde règle de calcul', b.presse[0]);
    ok(b.presse[0].indexOf(B.CLE_ADMIN) === -1 && b.presse[0].indexOf(B.MP.CLE_SCORES) === -1,
      'B5 ⭐⭐ ⛔ aucune clé dans ce qui est copié');
    ok(b.texte('message-acces-public').indexOf('copiée') !== -1,
      'B6 l’écran confirme la copie', b.texte('message-acces-public'));
  }
  {
    /* ⭐ PRESSE-PAPIERS REFUSÉ : le repli propose la copie à la main — ⛔ toujours sans réseau. */
    const b = await ecranComplet({ presse: 'ko' });
    await b.clic('bouton-copier-adresse-publique', 20);
    ok(sortiesReseau(b).length === 0 && b.requetes().length === 0,
      'B7 ⭐⭐ presse-papiers indisponible : TOUJOURS zéro appel', [sortiesReseau(b), b.requetes()]);
    ok(b.dialogues.length === 1 && b.dialogues[0].valeur &&
       /^https:\/\//.test(b.dialogues[0].valeur),
      'B8 ⭐ le repli montre l’adresse à copier à la main — ⛔ ce n’est pas présenté comme une panne',
      b.dialogues);
    ok(b.texte('message-acces-public') === '',
      'B9 ⛔ aucun message d’échec affiché : ce n’en est pas un', b.texte('message-acces-public'));
  }

  titre('C — ouvrir la page publique');
  {
    const b = await ecranComplet();
    await b.clic('bouton-ouvrir-page-publique', 20);
    ok(sortiesReseau(b).length === 0 && b.requetes().length === 0,
      'C1 ⭐⭐ ZÉRO appel réseau, ZÉRO requête métier', [sortiesReseau(b), b.requetes()]);
    const ouvertures = b.sorties.filter((s) => s.indexOf('window.open ') === 0);
    ok(ouvertures.length === 1 &&
       ouvertures[0] === 'window.open ' + b.el('acces-public-lien').getAttribute('href'),
      'C2 un SEUL onglet ouvert, sur l’adresse affichée', ouvertures);
    ok(b.cumul().ecritureValeurs.cellules === 0,
      'C3 ⭐⭐ ⛔ aucune écriture : ouvrir la page ne publie rien');
    ok(b.srv.publie() === 'oui' && b.texte('bouton-publier').indexOf('Masquer') !== -1,
      'C4 l’état de publication est inchangé');
  }

  titre('D — le QR de la page publique');
  {
    const b = await ecranComplet();
    const avant = b.el('acces-public-qr').getAttribute('data-qr');
    await b.clic('bouton-copier-qr-public', 30);
    ok(sortiesReseau(b).length === 0 && b.requetes().length === 0,
      'D1 ⭐⭐ ZÉRO appel réseau : le QR est dessiné EN LOCAL (js/vendor/qrcode.js du dépôt)',
      [sortiesReseau(b), b.requetes()]);
    ok(b.presse.length === 1 && b.presse[0] === '[image]',
      'D2 le QR part dans le presse-papiers comme image', b.presse);
    ok(b.el('acces-public-qr').getAttribute('data-qr') === avant,
      'D3 ⭐ le QR déjà dessiné n’est pas redessiné pour la même adresse', avant);
    ok(String(avant).indexOf(B.MP.CLE_SCORES) === -1 && String(avant).indexOf(B.CLE_ADMIN) === -1,
      'D4 ⭐⭐ ⛔ le QR public n’encode aucune clé');
  }
  {
    /* ⭐ L'AFFICHE AGRANDIE — le geste de terrain : imprimer une feuille pour l'entrée du stade. */
    const b = await ecranComplet();
    const carte = b.doc.querySelector('[data-ouvrir-affiche]');
    ok(!!carte, 'D5 la petite carte du tournoi est un BOUTON (ouvrable au clavier comme à la souris)');
    if (carte) {
      carte.dispatchEvent({ type: 'click', target: carte });
      await b.tour(20);
      ok(sortiesReseau(b).length === 0 && b.requetes().length === 0,
        'D6 ⭐⭐ ouvrir l’affiche en grand : ZÉRO appel', [sortiesReseau(b), b.requetes()]);
      const papier = b.doc.querySelector('[data-role="affiche-papier"]');
      ok(!!papier, 'D7 l’affiche imprimable est bien construite');
      const qr = papier && papier.querySelector('svg');
      ok(!!qr, 'D8 ⭐ son bandeau porte un QR dessiné EN LOCAL, pas une image distante');
      ok(b.sorties.filter((s) => s.indexOf('Image ') === 0).length === 0,
        'D9 ⭐⭐ ⛔ aucune image chargée depuis l’extérieur (le tournoi fictif n’a pas d’affiche)',
        b.sorties);
    }
  }

  titre('E — le QR de la table de marque');
  {
    const b = await ecranComplet();
    ok(/^https:\/\//.test(b.el('acces-saisie-qr').getAttribute('data-url') || ''),
      'E1 prémisse : le serveur a rendu un lien, et le QR le porte');
    await b.clic('bouton-copier-qr-saisie', 30);
    ok(sortiesReseau(b).length === 0 && b.requetes().length === 0,
      'E2 ⭐⭐ ZÉRO appel réseau, ZÉRO requête métier', [sortiesReseau(b), b.requetes()]);
    ok(b.cumul().ecritureValeurs.cellules === 0,
      'E3 ⭐⭐ ⛔ copier le QR ne change AUCUN état de l’accès');
    ok(Number((b.srv.acces() || {}).version) === 2,
      'E4 ⭐ la version de l’accès n’a pas bougé (PREPARER puis OUVRIR, et rien de plus)',
      (b.srv.acces() || {}).version);
    ok(b.presse.length === 1 && b.presse[0] === '[image]', 'E5 le QR est copié comme image');
  }

  titre('F — naviguer dans la carte, ouvrir les aides');
  {
    const b = await ecranComplet();
    const depliants = b.doc.querySelectorAll('details');
    ok(depliants.length >= 2,
      'F1 la carte porte bien ses dépliants d’aide (ce que publier fait, QR et litige)',
      depliants.length);
    depliants.forEach(function (d) { d.open = true; d.dispatchEvent({ type: 'toggle', target: d }); });
    await b.tour(20);
    ok(sortiesReseau(b).length === 0 && b.requetes().length === 0,
      'F2 ⭐⭐ ouvrir TOUS les dépliants : ZÉRO appel', [sortiesReseau(b), b.requetes()]);
    depliants.forEach(function (d) { d.open = false; d.dispatchEvent({ type: 'toggle', target: d }); });
    await b.tour(20);
    ok(sortiesReseau(b).length === 0 && b.requetes().length === 0,
      'F3 ⭐⭐ …et les refermer non plus', [sortiesReseau(b), b.requetes()]);
  }
  {
    /* ⭐ TOUS LES GESTES LOCAUX À LA SUITE, deux fois : le compte total doit rester à zéro. */
    const b = await ecranComplet();
    for (let tour = 0; tour < 2; tour++) {
      for (const id of B.GESTES_LOCAUX) await b.clic(id, 20);
    }
    ok(sortiesReseau(b).length === 0 && b.requetes().length === 0,
      'F4 ⭐⭐ les ' + B.GESTES_LOCAUX.length + ' gestes locaux joués DEUX fois : ZÉRO requête au total',
      [sortiesReseau(b), b.requetes()]);
    ok(b.cumul().ecritureValeurs.cellules === 0 && b.cumul().instantane.reconstruit === 0 &&
       b.cumul().instantane.invalide === 0 && b.cumul().cache.ecritures === 0,
      'F5 ⭐⭐ ZÉRO cellule, ZÉRO instantané touché, ZÉRO octet de cache', b.cumul());
    ok(b.srv.publie() === 'oui' && Number((b.srv.acces() || {}).version) === 2,
      'F6 ⭐⭐ le classeur est exactement dans l’état où les gestes métier l’avaient laissé',
      [b.srv.publie(), (b.srv.acces() || {}).version]);
  }

  titre('G — un tournoi MASQUÉ ne ferme aucun geste local');
  {
    const b = await B.banc({ monde: { publie: 'non' } });
    await b.arriver();
    b.remettre();
    const fermes = B.GESTES_LOCAUX.filter((id) => (b.el(id) || {}).disabled === true &&
      id !== 'bouton-copier-qr-saisie');   // celui-là n'existe qu'avec un accès préparé
    ok(fermes.length === 0,
      'G1 ⭐⭐ tournoi non publié : « Copier », « Ouvrir » et le QR public restent ACTIFS — ' +
      'une adresse n’est pas une autorisation', fermes);
    await b.clic('bouton-copier-adresse-publique', 20);
    await b.clic('bouton-ouvrir-page-publique', 20);
    await b.clic('bouton-copier-qr-public', 30);
    ok(sortiesReseau(b).length === 0 && b.requetes().length === 0,
      'G2 ⭐⭐ …et ils ne publient rien : ZÉRO requête', [sortiesReseau(b), b.requetes()]);
    ok(b.srv.publie() === 'non',
      'G3 ⭐⭐ le tournoi est TOUJOURS masqué après les trois gestes');
  }

  console.log('\n==================================================');
  if (echecs.length) {
    console.log('ÉCHEC — ' + echecs.length + '/' + n + ' contrôle(s) :');
    echecs.forEach((e) => console.log('  ✗ ' + e));
    process.exit(1);
  }
  console.log('OK — ' + n + '/' + n + ' contrôles « zéro appel » de l’écran « Publication ».');
})().catch((e) => { console.error('ERREUR — ' + e.stack); process.exit(1); });
