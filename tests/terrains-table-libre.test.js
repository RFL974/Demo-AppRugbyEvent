#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const racine = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(racine, 'js/admin-terrains.js'), 'utf8');
const ctx = vm.createContext({
  console,
  document: { getElementById: function () { return null; }, querySelector: function () { return null; },
    querySelectorAll: function () { return []; } },
  window: {},
  echapper: function (v) { return String(v == null ? '' : v); },
  svgIcone: function () { return ''; },
  estPresente: function () { return true; },
  afficherMessage: function () {},
  majEtatAvancement: function () {},
  configCourante: { global: {}, categories: [] },
  equipesCourantes: []
});
vm.runInContext(source, ctx, { filename: 'js/admin-terrains.js' });

function evaluer(expression, valeurs) {
  Object.keys(valeurs || {}).forEach(function (cle) { ctx[cle] = valeurs[cle]; });
  return vm.runInContext(expression, ctx);
}

test('une table libre est créée au centre de chaque grand terrain sans valider le plan', function () {
  const plan = {
    fieldsPlan: [
      { field: { nom: 'A', L: 100, W: 60 }, zones: [{ tiles: [{ x: 0, y: 0, w: 50, h: 30 }], table: { x: 1 } }] },
      { field: { nom: 'B', L: 70, W: 50 }, zones: [] }
    ],
    ctxManuel: { tmL: 4, tmW: 6 }
  };
  evaluer('initialiserTablesMarquesLibres(plan)', { plan });
  assert.deepEqual(JSON.parse(JSON.stringify(plan.fieldsPlan.map(function (fp) { return fp.table; }))), [
    { x: 48, y: 27, w: 4, h: 6 },
    { x: 33, y: 22, w: 4, h: 6 }
  ]);
  assert.equal(plan.tablesPosees, false);
  assert.equal(plan.fieldsPlan[0].zones[0].table, null);
});

test('la table ne réserve aucune place dans le packing des mini-terrains', function () {
  const fp = { field: { L: 100, W: 60 }, table: { x: 0, y: 0, w: 100, h: 60 },
    zones: [{ tiles: [{ x: 2, y: 3, w: 10, h: 12 }], table: null }] };
  const obstacles = evaluer('obstaclesDuTerrain(fp)', { fp });
  assert.equal(obstacles.length, 1);
  assert.equal(obstacles[0], fp.zones[0].tiles[0]);
});

test('la taille de la table ne change plus le résultat du calcul automatique', function () {
  const fields = [{ nom: 'Terrain A', code: 'A', L: 110, W: 70 }];
  const cats = [{ name: 'U10', teams: 8, tile: { l: 50, w: 30, lJeu: 40, eb: 5 } }];
  const petit = evaluer('allouerTerrains(fields, cats, 5, 4, 4)', { fields, cats });
  const grand = evaluer('allouerTerrains(fields, cats, 5, 90, 60)', { fields, cats });
  const geometrie = function (plan) { return plan.fieldsPlan.map(function (fp) {
    return fp.zones.map(function (z) { return z.tiles.map(function (t) {
      return { x: t.x, y: t.y, w: t.w, h: t.h };
    }); });
  }); };
  assert.deepEqual(JSON.parse(JSON.stringify(geometrie(petit))), JSON.parse(JSON.stringify(geometrie(grand))));
});

test('le déplacement est libre de collisions mais reste dans les limites du grand terrain', function () {
  const fp = { field: { L: 100, W: 60 }, table: { x: 10, y: 10, w: 4, h: 6 } };
  assert.deepEqual(JSON.parse(JSON.stringify(evaluer('bornerPositionTable(fp, 40, 20)', { fp }))), { x: 40, y: 20 });
  assert.deepEqual(JSON.parse(JSON.stringify(evaluer('bornerPositionTable(fp, -8, 90)', { fp }))), { x: 0, y: 54 });
});

test('la carte expose la table à la souris et au clavier, sans repli vers l’en-but', function () {
  assert.match(source, /data-table-field=/);
  assert.match(source, /data-table-field[^>]+role="button" tabindex="0"/);
  assert.match(source, /demarrerDeplacementTable\(ev/);
  assert.match(source, /deplacerTableClavier\(/);
  assert.doesNotMatch(source, /function\s+(?:positionTableMarques|profondeurEnBut|placerDansEnBut|poserTablesMarques)\s*\(/);
  assert.doesNotMatch(source, /fp\.table\.(?:enBut|horsTerrain)/);
});
