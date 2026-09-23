'use strict';

/**
 * ============================================================================
 *  ÉCRAN « DEMANDE D'AUTORISATION » — ZÉRO APPEL PENDANT LES GESTES LOCAUX
 * ============================================================================
 *  ▶ node --test tests/ecran-autorisation-zero-appel.test.js
 *
 *  ⭐ CE QUE CETTE SUITE PROUVE, et pourquoi elle est séparée : la règle « aucune requête pendant une
 *  frappe ou une interaction purement locale » ne se vérifie pas en lisant le code — un écouteur
 *  ajouté ailleurs, une dépendance d'effet, un rafraîchissement « au cas où » la casseraient en
 *  silence. On COMPTE donc ce qui part réellement vers le serveur, geste par geste, avec le vrai
 *  api.js et le vrai transport.
 *
 *  ⛔ Chaque geste part d'un écran DÉJÀ ouvert (la lecture d'ouverture est faite et sortie du
 *  journal) : ce qui est compté ici n'est QUE l'effet du geste.
 * ============================================================================
 */

const { test } = require('node:test');
const B = require('./banc-ecran-autorisation');

test('écran « Demande d’autorisation » — aucun appel serveur sur les gestes locaux', async () => {
  const v = B.compteur();

  /** Un écran ouvert, prêt, journal vidé. */
  async function ouvert(options) {
    const b = await B.banc(options || {});
    await b.ouvrir();
    b.journal.length = 0;
    return b;
  }

  console.log('\nA — LA FRAPPE ET LES CONTRÔLES DU FORMULAIRE');

  {
    const b = await ouvert();
    const champs = ['org_code_club', 'org_representant_nom', 'org_representant_tel',
      'org_representant_mail', 'org_nb_vestiaires', 'org_nb_arbitres', 'org_secours_nom'];
    let total = 0;
    for (const nom of champs) {
      const r = await b.jouer(async () => {
        const c = b.champ(nom);
        c.focus();
        // Frappe caractère par caractère : `input` à chaque touche, `change` en sortie de champ.
        for (const lettre of 'Test 1234') { c.value = String(c.value) + lettre; await b.declencher(c, 'input'); }
        return b.declencher(c, 'change');
      });
      total += r.requetes.length;
    }
    v.vrai(total === 0,
      'A.1 ⭐⭐ frappe complète dans 7 champs (input + change) : ZÉRO requête — ' + total + ' observée(s)');
  }

  {
    const b = await ouvert();
    const r1 = await b.jouer(() => b.saisir('org_medecin_oui', 'non'));
    const r2 = await b.jouer(() => b.saisir('org_medecin_oui', 'oui'));
    const r3 = await b.jouer(() => b.saisir('org_droits_oui', 'non'));
    const r4 = await b.jouer(() => b.saisir('org_hebergement_oui', 'oui'));
    const total = r1.requetes.length + r2.requetes.length + r3.requetes.length + r4.requetes.length;
    v.vrai(total === 0,
      'A.2 ⭐ les questions Oui/Non qui GRISENT leurs champs liés : ZÉRO requête — ' + total);
    v.vrai(b.champ('org_hebergement_structure').disabled === false,
      'A.3 et le grisage a bien été appliqué localement (témoin : « Hébergement : oui » dégrise)');
  }

  {
    const b = await ouvert();
    const r = await b.jouer(() => b.saisir('org_niveau_tournoi', 'Départemental'));
    v.vrai(r.requetes.length === 0,
      'A.4 changer une liste déroulante sans champ lié : ZÉRO requête — ' + r.requetes.length);
  }

  {
    const b = await ouvert();
    const recompense = b.champs().filter((n) => n.indexOf('org_recompenses_') === 0)[0];
    v.vrai(!!recompense, 'A.5 les récompenses par catégorie sont bien dans le formulaire (' + recompense + ')');
    const r = await b.jouer(() => b.saisir(recompense, 'oui'));
    v.vrai(r.requetes.length === 0, 'A.6 régler une récompense par catégorie : ZÉRO requête');
  }

  console.log('\nB — LES BOUTONS ET LES DÉPLIANTS QUI NE PARLENT À PERSONNE');

  {
    const b = await ouvert();
    const r = await b.imprimer();
    v.vrai(r.requetes.length === 0 && b.imprimes() === 1,
      'B.1 ⭐ « Imprimer la feuille » : ZÉRO requête, et l’impression est bien déclenchée');
  }

  {
    const b = await ouvert();
    const r = await b.telechargerPdf();
    v.vrai(r.requetes.length === 0,
      'B.2 ⭐⭐ « Télécharger le formulaire pré-rempli (PDF) » : ZÉRO requête — ' + (r.resume || '(rien)'));
    v.vrai(/PDF téléchargé/.test(b.message() || ''),
      'B.3 et le PDF a bien été produit (entièrement dans le navigateur)', b.message());
  }

  {
    const b = await ouvert();
    const sections = b.doc.querySelectorAll('#autorisation-saisie details');
    v.vrai(sections.length >= 5, 'B.4 le formulaire est rangé en dépliants (' + sections.length + ')');
    const r = await b.jouer(async () => {
      for (const d of sections) { d.open = !d.open; await b.declencher(d, 'toggle'); }
    });
    v.vrai(r.requetes.length === 0, 'B.5 ouvrir et fermer tous les dépliants : ZÉRO requête');
  }

  console.log('\nC — LA NAVIGATION ET LE FOCUS');

  {
    const b = await ouvert();
    let total = 0;
    for (let i = 0; i < 3; i++) { const r = await b.revenir(); total += r.requetes.length; }
    v.vrai(total === 0,
      'C.1 ⭐ trois allers-retours sur l’écran : ZÉRO requête (la mémoire du registre tient) — ' + total);
  }

  {
    const b = await ouvert();
    const r = await b.jouer(async () => {
      b.champ('org_code_club').focus();
      b.champ('org_secours_tel').focus();
      b.boutonPdf().focus();
    });
    v.vrai(r.requetes.length === 0, 'C.2 déplacer le focus d’un champ à l’autre : ZÉRO requête');
  }

  console.log('\nD — LE MÊME CONTRÔLE AVEC UN BACKEND D’AVANT');

  {
    /* ⛔ Le repli ne doit pas transformer un geste local en requête : avec un backend d'avant, la
       seule requête tolérée est celle du PDF (qui va chercher la liste des clubs, faute de comptes). */
    const b = await ouvert({ backend: B.BACKEND_AVANT() });
    const frappe = await b.jouer(async () => {
      const c = b.champ('org_code_club'); c.focus(); c.value = '9212345';
      await b.declencher(c, 'input'); return b.declencher(c, 'change');
    });
    const impression = await b.imprimer();
    v.vrai(frappe.requetes.length === 0 && impression.requetes.length === 0,
      'D.1 ⭐ backend d’avant : la frappe et l’impression restent à ZÉRO requête');
    const pdf = await b.telechargerPdf();
    v.vrai(pdf.requetes.every((x) => x.action === 'listerClubsInvites'),
      'D.2 ⭐ backend d’avant : le PDF n’émet QUE la lecture des clubs dont il a besoin — ' + pdf.resume,
      pdf.resume);
    const pdf2 = await b.telechargerPdf();
    v.vrai(pdf2.requetes.length === 0,
      'D.3 ⭐ et une seconde fois : ZÉRO requête (la liste est en mémoire) — ' + (pdf2.resume || '(rien)'));
  }

  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log('OK — ' + v.n + ' contrôles passés.');
});
