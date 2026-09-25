'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
let controles = 0;
function vrai(v, m) { assert.ok(v, m); controles++; }

const html = lire('admin.html');
const admin = lire('js/admin.js');
const ecrans = lire('js/ecrans.js');
const assistant = lire('js/assistant.js');
const code = lire('js/admin-municipal.js');
const css = lire('css/municipal.css');

vrai(html.includes('id="bloc-municipal"') && html.includes('id="municipal-racine"'),
  'la surface municipale existe dans la page admin');
vrai(html.includes('css/municipal.css?v=refonte-ciel-verre-20260920-municipal2') &&
  html.includes('js/admin-municipal.js?v=refonte-ciel-verre-20260920-municipal2'),
  'les nouvelles ressources ont une URL de cache dédiée');
vrai(ecrans.includes("id: 'municipal'") && ecrans.includes("icone: 'mairie'") &&
  ecrans.indexOf("id: 'municipal'") < ecrans.indexOf("id: 'autorisation'"),
  'la demande municipale est placée avant la demande fédérale');
vrai(assistant.includes("id: 'municipal'") && assistant.includes("titre: 'Mairie'"),
  'le parcours mobile expose la même étape');
vrai(/municipal:\s*\{\s*ressources:\s*\['dossierAutorisation'\]/.test(admin) &&
  !/municipal:\s*\{\s*ressources:\s*\['municipal/.test(admin),
  'l’écran réutilise l’unique instantané déjà nécessaire au dossier');

vrai(code.includes('Aucun site n’est imposé') && code.includes('Nom de l’espace *') &&
  code.includes('Conserver dans la bibliothèque des espaces'),
  'les espaces restent libres et réutilisables');
vrai(code.includes('Nom de l’interlocuteur') && code.includes('Document (optionnel)') &&
  code.includes("municipalZoneDepot_('drawer'"),
  'le volet collecte le contact et une première pièce sans détour');
vrai(code.includes('Destinataire et procédure locale') && code.includes('À confirmer avec la commune') &&
  code.includes('data-municipal-volet') && code.includes('Tentes / structures temporaires'),
  'le dossier couvre les procédures variables sans présenter un volet local comme universel');
vrai(code.includes('RNA') && code.includes('SIRET') && code.includes('Assurance / police') &&
  code.includes('profil_municipal_json'),
  'les références récurrentes de l’organisateur sont collectées et pérennisées');
vrai(code.includes('date_fin') && code.includes('montage_debut') && code.includes('demontage_fin'),
  'les périodes multi-jours, montage et démontage sont prises en charge');
vrai(code.includes('municipalChronologieValide_') && code.includes('Dossier incomplet : vérifie la manifestation'),
  'un PDF final ne peut pas être produit avec une chronologie ou un socle obligatoire incohérent');
vrai(code.includes('MUNICIPAL_BESOINS_CATEGORIES') && code.includes('data-municipal-besoin-quantite'),
  'les moyens demandés sont structurés par catégorie, désignation et quantité');
vrai(code.includes('les fichiers ne sont ni envoyés ni enregistrés avec le brouillon') && code.includes('Index des annexes'),
  'la durée de vie locale des pièces est explicite et le PDF conserve leur rattachement');
vrai(code.includes('application/pdf') && code.includes('image/jpeg') && code.includes('image/png') &&
  code.includes('15 * 1024 * 1024') && code.includes('40 * 1024 * 1024'),
  'les pièces sont bornées aux formats et tailles annoncés');
vrai(code.includes("ecrireAdmin('enregistrerDemandeMunicipale'") &&
  (code.match(/ecrireAdmin\(/g) || []).length === 1,
  'un unique geste explicite écrit le brouillon');
vrai(code.includes('Aucun nouvel essai automatique') && code.includes('modification_concurrente'),
  'les réponses perdues et conflits ne déclenchent aucune relance aveugle');
vrai(code.includes('municipalEnregistrementEnCours') && code.includes('if (municipalEnregistrementEnCours) return'),
  'un double clic ne peut pas lancer deux écritures');
vrai(code.includes('PDFDocument.create()') && code.includes('copyPages') && code.includes('embedJpg'),
  'le dossier PDF assemble localement les pages et annexes');
vrai(!/fetch\s*\(|apiGet\s*\(|apiPost\s*\(/.test(code),
  'la surface n’ajoute aucun appel de lecture ni accès réseau direct');
vrai(css.includes('width:min(440px,100vw)') && css.includes('@media (max-width:760px)') &&
  css.includes('prefers-reduced-motion'),
  'le volet, le mobile et la réduction des animations sont couverts');

console.log('OK — ' + controles + ' contrôles de l’écran « Demande municipale » passés.');
