#!/usr/bin/env node
/**
 * Non-régression — écran « Infos du tournoi » unifié.
 *
 *  1) Assemblage (ecrans.js) : les catégories, la description et l'affiche rejoignent la carte
 *     « Informations générales » ; la carte de droite devient « Date & vérification ». Les nœuds
 *     sont DÉPLACÉS (aucun formulaire recréé) et les identifiants du HTML restent intacts.
 *  2) Verdict FFR (admin-conformite-ffr.js) : une ligne verte quand tout va bien, un <details>
 *     dépliable dès qu'il y a une alerte, et les prescriptions repliées sous leur propre panneau.
 *
 *  Aucune donnée métier, aucun appel réseau : modules réels, DOM simulé.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let controles = 0;
function ok(v, m) { controles++; if (!v) throw new Error('ÉCHEC ' + controles + ' — ' + m); }

const racine = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');

/* ---------------------------------------------------------------- assemblage */
const ecrans = lire('js/ecrans.js');
ok(/function regrouperInfosGenerales\(/.test(ecrans), 'ecrans.js regroupe les infos générales');
ok(/function preparerDateVerification\(/.test(ecrans), 'ecrans.js prépare la carte de vérification');
ok(ecrans.includes("regrouperInfosGenerales(form)") && ecrans.includes('preparerDateVerification()'),
  'les deux assemblages sont appelés à la construction de l’écran');
ok(ecrans.includes("champ.appendChild(formCategories)"),
  'le formulaire des catégories est DÉPLACÉ (pas recréé) : ses écouteurs survivent');
ok(ecrans.includes("description.setAttribute('form','form-infos-tournoi')"),
  'la description sortie du <form> lui reste rattachée par l’attribut form');
ok(ecrans.includes("affiche.className='cv-champ-affiche'") && !ecrans.includes("affiche.className='carte'"),
  'l’affiche n’est plus une carte séparée');
ok(ecrans.includes("carte.querySelector('h2').textContent='Date & vérification'"),
  'la carte de droite s’appelle « Date & vérification »');

/* ------------------------------------------------- identifiants du HTML intacts */
const html = lire('admin.html');
['bloc-choix-categories', 'form-choix-categories', 'choix-categories-champs', 'bouton-valider-categories',
 'conservation-choix-categories', 'message-choix-categories', 'bloc-cadre-tournoi', 'form-cadre-tournoi',
 'bloc-conformite-ffr', 'bloc-infos-tournoi', 'form-infos-tournoi', 'apercu-affiche'
].forEach(function (id) { ok(html.includes('id="' + id + '"'), 'admin.html conserve #' + id); });

/* ------------------------------------------------------------------ verdict FFR */
const ctx = vm.createContext({
  console,
  echapper: (v) => String(v),
  window: { CSS: { escape: (v) => v } },
  document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null }
});
vm.runInContext(lire('js/admin-conformite-ffr.js'), ctx, { filename: 'js/admin-conformite-ffr.js' });
ctx.refFFRCache = { millesime: '2026-2027', formes: [1], dates: [1] };
ctx.configCourante = { global: {}, categories: [{ categorie: 'U10', presente: 'oui' }] };

const base = {
  refDisponible: true, couverture: { couverte: true }, bloquants: [], avertissements: [],
  regles: { U10: [{ terrain_longueur_m: 60, terrain_largeur_m: 40, effectif_max_feuille: 13 }] },
  temps: {}
};
const rendre = (res) => ctx.rendreConformiteFFR(res);

const vert = rendre(base);
ok(vert.includes('Calendrier vérifié'), 'sans alerte : « Calendrier vérifié »');
ok(vert.includes('Aucun conflit détecté avec le calendrier FFR 2026-2027.'), 'le millésime est annoncé');
ok(!/<details class="ffr-statut/.test(vert), 'un verdict vert n’a rien à déplier');

const vigilance = rendre(Object.assign({}, base, {
  avertissements: [{ date: '2027-05-15', libelle: 'Vacances de printemps', motif: 'effectifs réduits' }]
}));
ok(/<details class="ffr-statut ffr-statut-depliable ffr-orange"/.test(vigilance),
  'un point de vigilance devient un encart orange dépliable');
ok(vigilance.includes('1 point(s) de vigilance'), 'l’en-tête annonce le nombre d’alertes');
ok(vigilance.includes('Vacances de printemps') && vigilance.includes('effectifs réduits'),
  'le détail de l’alerte est disponible au dépliage');
ok(!/ffr-sous-titre/.test(vigilance), 'une seule nature d’alerte : pas d’intertitre redondant');

const conflit = rendre(Object.assign({}, base, {
  bloquants: [{ date: '2027-05-15', libelle: 'Journée fermée' }],
  avertissements: [{ date: '2027-05-15', libelle: 'Vacances de printemps' }]
}));
ok(/<details class="ffr-statut ffr-statut-depliable ffr-rouge"/.test(conflit), 'un conflit passe au rouge');
ok((conflit.match(/ffr-sous-titre/g) || []).length === 2,
  'deux natures d’alerte : un intertitre pour chacune');

ok(/<details class="ffr-panneau"><summary>/.test(vert) && vert.includes('Consulter les prescriptions FFR'),
  'les prescriptions vivent dans leur propre panneau replié');

// Garde-fou d'implémentation : un <summary> mis en display:flex cesse d'ouvrir son <details> sur
// WebKit. La mise en page vit donc dans .ffr-tete, à l'intérieur du <summary>.
[vigilance, vert].forEach(function (h) {
  ok(/<summary><span class="ffr-tete">/.test(h), 'le contenu du <summary> est enveloppé dans .ffr-tete');
});
const css = lire('css/theme-r92.css');
ok(!/summary[^{]*\{[^}]*display:flex/.test(css), 'aucun <summary> mis en display:flex dans le thème');

// Les messages neutres empruntent le même gabarit (et gardent la reprise après panne).
ok(ctx.messageRepriseFFR('Panne.').includes('Réessayer le contrôle FFR'), 'la reprise reste offerte');
ok(ctx.messageRepriseFFR('Panne.').includes('ffr-statut'), 'les messages neutres suivent le même gabarit');

console.log(`OK — ${controles} contrôles « Infos du tournoi unifiées ».`);
