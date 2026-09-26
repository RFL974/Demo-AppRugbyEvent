'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const racine = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(racine, rel), 'utf8');
const PDFLib = require(path.join(racine, 'js/vendor/pdf-lib.min.js'));
let controles = 0;
function vrai(v, m) { assert.ok(v, m); controles++; }

const socle = {
  console, PDFLib,
  document: { addEventListener() {}, getElementById() { return null; } },
  navigator: {}, setTimeout() {}, Blob,
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
  echapper: v => String(v == null ? '' : v)
};
socle.window = socle;
socle.addEventListener = function () {};
const contexte = vm.createContext(socle);
vm.runInContext(lire('js/pdf-ciel-verre.js'), contexte, { filename:'js/pdf-ciel-verre.js' });
vm.runInContext(lire('js/admin-dps.js'), contexte, { filename:'js/admin-dps.js' });

const dossier = { sections:[{ titre:'Organisateur', champs:[
  { libelle:'Nom du club ou de la structure organisatrice', valeur:'Démo Racing' },
  { libelle:'Représenté par (M./Mme)', valeur:'Camille Martin' },
  { libelle:'Téléphone du représentant', valeur:'01 23 45 67 89' },
  { libelle:'Mail du représentant', valeur:'camille@example.invalid' }
] }] };
const config = { global:{ tournoi_nom:'Tournoi des petits champions', tournoi_date:'2027-05-15',
  tournoi_lieu:'Stade Paul Langevin', tournoi_adresse:'10 rue du Stade, 92140 Clamart',
  tournoi_description:'Tournoi amical des écoles de rugby.', heure_debut:'09:00', heure_fin:'17:00',
  referent_nom:'Morgan Dupont', referent_tel:'06 00 00 00 00' },
  categories:[{ categorie:'U8', presente:'oui' }, { categorie:'U10', presente:'oui' }] };
const estimation = { contrat:'estimation-public-1', centrale:400, basse:320, haute:490, renseignes:4, participants:6 };

async function verifierPdfs() {
  contexte.dpsInstantaneCourant = { dossier, config, estimation, erreur:'' };
  const dpsBytes = await contexte.dpsConstruirePdf_();
  const dps = await PDFLib.PDFDocument.load(dpsBytes);
  vrai(dps.getPageCount() >= 3, 'le dossier DPS réel contient couverture, synthèse et organismes');
  vrai(dpsBytes.length > 5000, 'le dossier DPS réel contient une composition graphique substantielle');
  if (process.env.PDF_PREVIEW_DIR) fs.writeFileSync(path.join(process.env.PDF_PREVIEW_DIR, 'dossier-dps-preview.pdf'), dpsBytes);

  contexte.configCourante = config;
  vm.runInContext(lire('js/admin-municipal.js'), contexte, { filename:'js/admin-municipal.js' });
  contexte.municipalDossier = dossier;
  contexte.municipalEstimation = estimation;
  contexte.municipalEtat.demande = contexte.municipalNormaliserDemande_({
    destinataire:{ commune:'Clamart', service:'Service des sports', canal:'a_confirmer' },
    organisateur:{ adresse:'1 rue du Club', rna:'W000000001', assurance:'POLICE-TEST' },
    volets:{ occupation:true, materiel:true }, notes:'Mise à disposition du site.',
    espaces:[{ id:'stade', nom:'Stade Paul Langevin', type:'Stade / complexe',
      adresse:'10 rue du Stade, 92140 Clamart', date:'2027-05-15', debut:'08:00', fin:'18:00',
      statut:'en_preparation', usages:{ sport:true, public:true },
      besoins:[{ categorie:'Matériel', intitule:'Barrières', quantite:'20', details:'Pour le cheminement public' }] }]
  });
  const annexeDoc = await PDFLib.PDFDocument.create();
  const annexePage = annexeDoc.addPage(PDFLib.PageSizes.A4);
  annexePage.drawText('ANNEXE PDF FICTIVE', { x:72, y:760, size:18 });
  const annexePdf = await annexeDoc.save();
  const annexePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Z4k9WQAAAABJRU5ErkJggg==', 'base64');
  const enArrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  contexte.municipalFichiersCommuns = [
    { name:'plan-securite-fictif.pdf', type:'application/pdf', size:annexePdf.length,
      arrayBuffer:async () => enArrayBuffer(annexePdf) },
    { name:'photo-acces-fictive.png', type:'image/png', size:annexePng.length,
      arrayBuffer:async () => enArrayBuffer(annexePng) }
  ];
  const municipalBytes = await contexte.municipalConstruirePdf_();
  const municipal = await PDFLib.PDFDocument.load(municipalBytes);
  vrai(municipal.getPageCount() >= 7,
    'le dossier municipal réel contient couverture, synthèse, espace, index, PDF et image annexés');
  vrai(municipalBytes.length > 5000, 'le dossier municipal réel contient une composition graphique substantielle');
  if (process.env.PDF_PREVIEW_DIR) fs.writeFileSync(path.join(process.env.PDF_PREVIEW_DIR, 'dossier-municipal-preview.pdf'), municipalBytes);

  const source = lire('js/pdf-ciel-verre.js');
  ['#102A43', '#155B91', '#B8D8F8', '#68D9FF', '#F4F7FA'].forEach(couleur =>
    vrai(source.includes(couleur), 'la palette Ciel & Verre contient ' + couleur));
  vrai(!/fetch\s*\(|XMLHttpRequest|apiGet|apiPost/.test(source),
    'la signature PDF partagée ne contient aucun accès réseau');
}

verifierPdfs().then(function () {
  console.log('OK — ' + controles + ' contrôles PDF Ciel & Verre passés.');
}).catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});
