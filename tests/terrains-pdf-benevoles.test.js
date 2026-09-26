#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const PDFLib = require('../js/vendor/pdf-lib.min.js');
const modulePdf = require('../js/admin-terrains-pdf.js');

const racine = path.join(__dirname, '..');

function fixture() {
  const couleurs = { U8: '#2e8fe0', U10: '#27ae60' };
  const fieldsPlan = Array.from({ length: 4 }, function (_, i) {
    return {
      code: 'RUG' + (i + 1), mode: 'solo',
      field: { nom: 'Grand terrain ' + (i + 1), code: 'RUG' + (i + 1), type: 'rugby',
        nature: 'Gazon', L: 110, W: 70, x: i * 120, y: 0, rot: i * 15 },
      zones: [{ cat: i % 2 ? 'U10' : 'U8', tiles: [
        { id: 'RUG' + (i + 1) + '-1', x: 2, y: 2, w: 34, h: 24, eb: 2, ebAxe: 'x' },
        { id: 'RUG' + (i + 1) + '-2', x: 41, y: 2, w: 34, h: 24, eb: 2, ebAxe: 'x' },
        { id: 'RUG' + (i + 1) + '-3', x: 2, y: 31, w: 34, h: 24, eb: 2, ebAxe: 'x' }
      ] }],
      table: { x: 80, y: 30, w: 4, h: 4 }
    };
  });
  return { fieldsPlan, couleur: couleurs, ctxManuel: { m: 5, tmL: 4, tmW: 4 },
    misDeCote: [], tablesPosees: true };
}

const meta = { nom: 'Tournoi du Racing', date: '2026-10-03', lieu: 'Stade de démonstration',
  couleurs: { U8: '#2e8fe0', U10: '#27ae60' } };

test('l’empreinte change dès qu’une cote ou une position change', function () {
  const plan = fixture();
  const avant = modulePdf.empreintePackTerrains(plan);
  plan.fieldsPlan[0].zones[0].tiles[0].x += 1;
  assert.notEqual(modulePdf.empreintePackTerrains(plan), avant);
  assert.equal(modulePdf.planTerrainsValide(plan, avant), false);
});

test('la position libre d’une table est reprise par l’empreinte et le PDF', async function () {
  const plan = fixture();
  const avant = modulePdf.empreintePackTerrains(plan);
  plan.fieldsPlan[0].table.x = 12;
  assert.notEqual(modulePdf.empreintePackTerrains(plan), avant);
  const bytes = await modulePdf.genererPackTerrainsPdf(plan, { PDFLib, meta, contenu: 'plans', terrain: '1' });
  assert.equal((await PDFLib.PDFDocument.load(bytes)).getPageCount(), 1);
});

test('les actions ne sont actives que pour le placement validé exact', function () {
  const plan = fixture();
  const empreinte = modulePdf.empreintePackTerrains(plan);
  const pret = modulePdf.htmlSortiesTerrains(plan, empreinte);
  assert.match(pret, /Plan validé · prêt à produire/);
  assert.doesNotMatch(pret, /id="bouton-telecharger-pdf-terrains" disabled/);
  plan.fieldsPlan[0].field.W = 69;
  const perime = modulePdf.htmlSortiesTerrains(plan, empreinte);
  assert.match(perime, /Valide le placement/);
  assert.match(perime, /id="bouton-telecharger-pdf-terrains" disabled/);
});

test('le pack complet contient couverture, plans cotés et affiches A4', async function () {
  const bytes = await modulePdf.genererPackTerrainsPdf(fixture(), { PDFLib, meta, contenu: 'complet', terrain: 'tous' });
  const pdf = await PDFLib.PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 9);
  assert.ok(bytes.length > 10000);
  assert.ok(bytes.length < 2000000);
});

test('les variantes limitent réellement les pages et le terrain', async function () {
  const plans = await modulePdf.genererPackTerrainsPdf(fixture(), { PDFLib, meta, contenu: 'plans', terrain: 'tous' });
  const affiche = await modulePdf.genererPackTerrainsPdf(fixture(), { PDFLib, meta, contenu: 'affiches', terrain: '2' });
  assert.equal((await PDFLib.PDFDocument.load(plans)).getPageCount(), 4);
  assert.equal((await PDFLib.PDFDocument.load(affiche)).getPageCount(), 1);
});

test('le module de sortie n’a aucune primitive de lecture ou écriture distante', function () {
  const source = fs.readFileSync(path.join(racine, 'js/admin-terrains-pdf.js'), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|apiGet|apiPost|ecrireAdmin)\s*\(/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.match(source, /cachePdfTerrains\[cle\]/);
});

test('un plan réinitialisé ne peut pas régénérer les anciens petits terrains', function () {
  const plan = fixture();
  plan.fieldsPlan.forEach(function (fp) { fp.zones = []; fp.table = null; });
  plan.parCategorie = {};
  plan.tablesPosees = false;
  const sourcePdf = modulePdf.empreintePackTerrains(plan);
  const dossier = modulePdf.planTerrainsPourDossier(plan);
  assert.doesNotMatch(sourcePdf, /RUG\d-\d|U8|U10/);
  assert.ok(dossier.fields.every(function (fp) { return fp.zones.length === 0; }));
  assert.match(modulePdf.htmlSortiesTerrains(plan, ''), /id="bouton-telecharger-pdf-terrains" disabled/);
});

test('le raccordement invalide les sorties après chaque changement de plan', function () {
  const source = fs.readFileSync(path.join(racine, 'js/admin-terrains.js'), 'utf8');
  assert.match(source, /onZoneTerrainsInput\(evenement\)[\s\S]{0,180}closest\('#terrains-sorties'\)[\s\S]{0,180}invaliderPackTerrains/);
  assert.match(source, /onZoneTerrainsChange\(evenement\)[\s\S]{0,180}closest\('#terrains-sorties'\)[\s\S]{0,300}invaliderPackTerrains/);
  assert.match(source, /onZoneTerrainsInput[\s\S]{0,180}invaliderPackTerrains/);
  assert.match(source, /demarrerDeplacementTerrain[\s\S]{0,450}invaliderPackTerrains/);
  assert.match(source, /demarrerRotationTerrain[\s\S]{0,350}invaliderPackTerrains/);
  assert.match(source, /onValiderPlacement[\s\S]{0,500}empreintePackTerrains/);
});

test('la grille Terrains peut rétrécir à 390 px sans pousser la page', function () {
  const css = fs.readFileSync(path.join(racine, 'css/theme-r92.css'), 'utf8');
  assert.match(css, /\.cv-terrains\s*>\s*\*\s*\{[^}]*min-width\s*:\s*0/);
});

test('le HTML charge le générateur après pdf-lib avec une URL propre', function () {
  const html = fs.readFileSync(path.join(racine, 'admin.html'), 'utf8');
  const vendor = html.indexOf('js/vendor/pdf-lib.min.js');
  const module = html.indexOf('js/admin-terrains-pdf.js?v=refonte-ciel-verre-20260925-terrain-orientation1');
  assert.ok(vendor !== -1 && module > vendor);
});
