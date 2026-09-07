/**
 * ============================================================================
 *  ADMIN — TERRAINS PHYSIQUES & RÉPARTITION (extrait de admin.js)
 * ============================================================================
 *  Moteur de découpage géométrique des grands terrains en mini-terrains
 *  (packing « guillotine »), allocation aux catégories et carte visuelle (SVG).
 *  Sorti de admin.js (monolithe) pour l'alléger, SANS changement de comportement.
 *
 *  Dépend de globaux définis ailleurs, accédés uniquement au moment de l'appel
 *  (handlers déclenchés après le chargement) — donc l'ordre des <script> importe
 *  peu ; chargé APRÈS admin.js dans admin.html :
 *   - commun.js : echapper, svgIcone, comparerCategorie, afficherMessage…
 *   - admin.js  : configCourante, equipesCourantes, ecrireAdmin, apiGet,
 *                 majEtatAvancement, dialogAlerter/Confirmer, estPresente…
 *  Expose (globaux, utilisés par admin.js) : injecterTerrains, recalculerCapacite,
 *  onZoneTerrains*, ajouterTerrainPhysique, onRepartir, onAppliquerRepartition,
 *  repartitionCalculee, allouerTerrains, dessinerCarte…
 * ============================================================================
 */

/* ==========================================================================
   TERRAINS PHYSIQUES & RÉPARTITION — étape 1 : déclaration + capacité
   --------------------------------------------------------------------------
   On déclare les GRANDS terrains réels (2 rugby + 2 foot) et la TAILLE de terrain
   de chaque catégorie, puis on calcule combien de mini-terrains y tiennent (avec
   un couloir de circulation entre eux). Tout est mémorisé dans Config (globaux).
   L'étape 2 (bouton « Répartir ») utilisera ces mêmes données.
   ========================================================================== */

/* Grands terrains réels par défaut (mesurés sur la vue satellite — modifiables).
   pos = emplacement sur le plan du site (grille 3×3), pour dessiner la carte « comme sur le site ».
   enBut = profondeur de l'EN-BUT derrière CHAQUE ligne de but (m) : la longueur L est mesurée
   d'une ligne de poteaux à l'autre, l'en-but s'ajoute de part et d'autre. 0 = non déclaré. */
const TERRAINS_PHYSIQUES_DEFAUT = [
  { nom: 'Rugby 1', type: 'rugby', L: 115, W: 70, pos: 'CG', enBut: 0 },
  { nom: 'Rugby 2', type: 'rugby', L: 110, W: 68, pos: 'BG', enBut: 0 },
  { nom: 'Foot 1',  type: 'foot',  L: 105, W: 68, pos: 'HC', enBut: 0 },
  { nom: 'Foot 2',  type: 'foot',  L: 100, W: 65, pos: 'CD', enBut: 0 }
];

/* Natures de terrain (surface de jeu). Mêmes libellés que la case « Type de terrain » du
   formulaire officiel d'autorisation : la nature déclarée ici est reprise AUTOMATIQUEMENT
   dans la demande d'autorisation (feuille de report + PDF pré-rempli). */
const NATURES_TERRAIN = ['Synthétique', 'Gazon', 'Neige', 'Argile', 'Sable'];

/* Emplacements possibles sur le plan du site (grille 3×3). */
const EMPLACEMENTS = [
  { v: '',   l: 'Auto' },
  { v: 'HG', l: '↖ Haut-gauche' },   { v: 'HC', l: '↑ Haut-centre' },  { v: 'HD', l: '↗ Haut-droite' },
  { v: 'CG', l: '← Centre-gauche' },  { v: 'CC', l: '• Centre' },       { v: 'CD', l: '→ Centre-droite' },
  { v: 'BG', l: '↙ Bas-gauche' },     { v: 'BC', l: '↓ Bas-centre' },   { v: 'BD', l: '↘ Bas-droite' }
];

/* Taille de terrain par défaut selon la catégorie (m).
   plein:true = un match occupe un GRAND terrain entier (cas U14). */
const DIMENSIONS_CATEGORIE_DEFAUT = {
  U8:  { l: 30, w: 20 },
  U10: { l: 40, w: 30 },
  U12: { l: 56, w: 45 },
  U14: { plein: true }
};

const COULOIR_DEFAUT = 5;   // couloir de circulation entre mini-terrains (m)
const TM_L_DEFAUT = 4;      // table des marques : longueur par défaut (m)
const TM_W_DEFAUT = 4;      // table des marques : largeur par défaut (m)

/**
 * Packing GUILLOTINE à orientations MIXTES : place le maximum de mini-terrains (l×w)
 * dans un rectangle, en autorisant des terrains dans un sens ET dans l'autre pour
 * remplir les bandes restantes. Renvoie la liste des mini-terrains {x,y,w,h}.
 * Heuristique : on remplit un bloc régulier (dans la meilleure orientation), puis on
 * remplit récursivement la bande de DROITE (pleine hauteur) et la bande du BAS (sous le
 * bloc) ; on teste les 2 orientations du bloc et on garde le total le plus élevé.
 */
function packerRect(x0, y0, L, W, tl, tw, m) {
  if (L <= 0 || W <= 0 || tl <= 0 || tw <= 0) return [];
  let best = [];
  [[tl, tw], [tw, tl]].forEach(function (o) {
    const a = o[0], b = o[1];
    const cols = Math.floor((L + m) / (a + m));
    const rows = Math.floor((W + m) / (b + m));
    if (cols < 1 || rows < 1) return;
    let tuiles = [];
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++)
        tuiles.push({ x: x0 + i * (a + m), y: y0 + j * (b + m), w: a, h: b });
    const usedW = cols * (a + m) - m, usedH = rows * (b + m) - m;
    const bandeDroite = L - usedW - m;                    // bande à droite du bloc (pleine hauteur)
    const bandeBas    = W - usedH - m;                    // bande sous le bloc (largeur du bloc)
    if (bandeDroite > 0) tuiles = tuiles.concat(packerRect(x0 + usedW + m, y0, bandeDroite, W, tl, tw, m));
    if (bandeBas > 0)    tuiles = tuiles.concat(packerRect(x0, y0 + usedH + m, usedW, bandeBas, tl, tw, m));
    if (tuiles.length > best.length) best = tuiles;
  });
  return best;
}

/** Liste des mini-terrains d'une catégorie sur une zone (origine ox,oy). plein = zone entière. */
function packerZone(ox, oy, L, W, tile, m) {
  if (!tile) return [];
  if (tile.plein) return [{ x: ox, y: oy, w: L, h: W }];
  return packerRect(ox, oy, L, W, tile.l, tile.w, m);
}

/** Capacité d'un grand terrain pour une catégorie (packing à orientations mixtes). */
function capaciteTerrain(field, tile, m) {
  if (!tile) return 0;
  if (tile.plein) return 1;                              // un match = tout le grand terrain
  return packerZone(0, 0, field.L, field.W, tile, m).length;
}

/**
 * Pose jusqu'à `maxN` mini-terrains d'une taille donnée dans l'ESPACE LIBRE d'un grand
 * terrain (fL×fW), en évitant les zones déjà occupées `occupees` avec un couloir de m.
 * Heuristique bas-gauche : à chaque tuile, on prend le 1er emplacement libre (y puis x le
 * plus petit), en testant les 2 orientations. Sert au « mixage » de catégories en secours.
 */
function placerDansLibre(fL, fW, occupees, tl, tw, m, maxN) {
  if (tl <= 0 || tw <= 0) return [];
  const obst = occupees.slice();
  const place = [];
  function libre(x, y, w, h) {
    if (x < -0.001 || y < -0.001 || x + w > fL + 0.001 || y + h > fW + 0.001) return false;
    for (let k = 0; k < obst.length; k++) {
      const o = obst[k];
      if (x < o.x + o.w + m - 0.001 && x + w + m - 0.001 > o.x &&
          y < o.y + o.h + m - 0.001 && y + h + m - 0.001 > o.y) return false; // trop près (< couloir)
    }
    return true;
  }
  let garde = 0;
  while (place.length < maxN && garde++ < 300) {
    const xs = [0], ys = [0];
    obst.forEach(function (o) { xs.push(o.x + o.w + m); ys.push(o.y + o.h + m); });
    xs.sort(function (a, b) { return a - b; }); ys.sort(function (a, b) { return a - b; });
    let trouve = null;
    for (let yi = 0; yi < ys.length && !trouve; yi++) {
      for (let xi = 0; xi < xs.length && !trouve; xi++) {
        if (libre(xs[xi], ys[yi], tl, tw)) trouve = { x: xs[xi], y: ys[yi], w: tl, h: tw };
        else if (libre(xs[xi], ys[yi], tw, tl)) trouve = { x: xs[xi], y: ys[yi], w: tw, h: tl };
      }
    }
    if (!trouve) break;
    place.push(trouve); obst.push(trouve);
  }
  return place;
}

/** Plan des terrains actuellement enregistré (repli sur les valeurs par défaut). */
function planTerrainsActuel() {
  const g = configCourante.global || {};
  let terrains = TERRAINS_PHYSIQUES_DEFAUT;
  try { if (g.terrains_physiques) terrains = JSON.parse(g.terrains_physiques); } catch (e) {}
  // Complète l'emplacement (pos) manquant depuis les valeurs par défaut connues (par nom) :
  // les terrains enregistrés avant l'ajout des emplacements retrouvent ainsi leur position.
  terrains = terrains.map(function (t) {
    if (t.pos) return t;
    const d = TERRAINS_PHYSIQUES_DEFAUT.find(function (x) { return x.nom.toLowerCase() === String(t.nom || '').toLowerCase(); });
    return d ? Object.assign({}, t, { pos: d.pos }) : t;
  });
  let dims = {};
  try { if (g.dimensions_categories) dims = JSON.parse(g.dimensions_categories); } catch (e) {}
  const couloir = (g.couloir_terrain_m != null && g.couloir_terrain_m !== '')
    ? (parseFloat(g.couloir_terrain_m) || 0) : COULOIR_DEFAUT;
  const tmL = (g.tm_longueur_m != null && g.tm_longueur_m !== '') ? (parseFloat(g.tm_longueur_m) || 0) : TM_L_DEFAUT;
  const tmW = (g.tm_largeur_m  != null && g.tm_largeur_m  !== '') ? (parseFloat(g.tm_largeur_m)  || 0) : TM_W_DEFAUT;
  return { terrains: terrains, dims: dims, couloir: couloir, tmL: tmL, tmW: tmW };
}

/** Noms des catégories présentes (celles qu'on dimensionne). */
function categoriesPresentes() {
  return (configCourante.categories || []).filter(estPresente)
    .map(function (c) { return String(c.categorie); });
}

/** Taille retenue pour une catégorie : enregistrée, sinon défaut connu, sinon vide. */
function dimensionCategorie(dims, nom) {
  if (dims && dims[nom]) return dims[nom];
  if (DIMENSIONS_CATEGORIE_DEFAUT[nom]) return DIMENSIONS_CATEGORIE_DEFAUT[nom];
  return { l: '', w: '' };
}

/** Injecte la carte « Terrains & répartition » dans #zone-terrains. */
function injecterTerrains() {
  const zone = document.getElementById('zone-terrains');
  if (!zone) return;
  const plan = planTerrainsActuel();
  const cats = categoriesPresentes();

  let h = '<h2>🗺️ Terrains &amp; répartition</h2>';
  h += '<p class="note-generation">Déclare tes <strong>grands terrains</strong> réels et la ' +
       '<strong>taille de chaque catégorie</strong>. L\'appli calcule combien de mini-terrains ' +
       'y tiennent (couloirs de circulation compris).</p>';

  h += '<h3 class="terr-titre">Grands terrains disponibles</h3>';
  h += '<div id="liste-terrains-physiques">';
  plan.terrains.forEach(function (t, i) { h += ligneTerrainPhysique(t, i); });
  h += '</div>';
  h += '<button type="button" class="bouton-lien" id="bouton-ajouter-terrain">+ Ajouter un grand terrain</button>';
  h += '<p class="note-generation">📏 La <strong>longueur</strong> se mesure d\'une <strong>ligne de ' +
       'poteaux à l\'autre</strong> : l\'<strong>en-but</strong> ne compte pas dedans. Indique sa ' +
       '<strong>profondeur derrière chaque ligne de but</strong> (colonne « en-but ») : les ' +
       'mini-terrains restent entre les deux lignes, mais la <strong>table de marque</strong> peut ' +
       's\'y installer quand la surface de jeu est pleine. Laisse <strong>0</strong> si le terrain ' +
       'n\'a pas d\'en-but utilisable.</p>';

  h += '<div class="champ-reglage" style="margin-top:14px">' +
         '<label for="couloir-terrain">Couloir de circulation entre les terrains (m)</label>' +
         '<input type="number" id="couloir-terrain" min="0" step="1" value="' + echapper(String(plan.couloir)) + '">' +
       '</div>';

  h += '<div class="champ-reglage">' +
         '<label for="tm-l">Table des marques (m)</label>' +
         '<span class="tm-taille">' +
           '<input type="number" id="tm-l" min="0" step="1" value="' + echapper(String(plan.tmL)) + '" aria-label="Longueur table des marques (m)">' +
           '<span class="terr-x">×</span>' +
           '<input type="number" id="tm-w" min="0" step="1" value="' + echapper(String(plan.tmW)) + '" aria-label="Largeur table des marques (m)">' +
           '<span class="terr-unite">m</span>' +
         '</span>' +
       '</div>';

  h += '<h3 class="terr-titre">Taille de terrain par catégorie</h3>';
  if (cats.length === 0) {
    h += '<p class="vide">Aucune catégorie présente : ajoute des catégories plus haut.</p>';
  } else {
    h += '<div id="liste-dimensions-categories">';
    cats.forEach(function (nom) { h += ligneDimensionCategorie(nom, dimensionCategorie(plan.dims, nom)); });
    h += '</div>';
  }

  h += '<h3 class="terr-titre">Capacité : mini-terrains par grand terrain</h3>';
  h += '<div id="tableau-capacite">' + tableauCapaciteHTML(plan.terrains, plan.dims, plan.couloir, cats) + '</div>';

  h += '<div class="ligne-action" style="margin-top:14px">' +
         '<button type="button" class="bouton" id="bouton-enregistrer-terrains">Enregistrer les terrains</button>' +
         '<span id="message-terrains" class="message-form"></span>' +
       '</div>';

  // Répartition automatique (étape 2)
  h += '<h3 class="terr-titre">Répartition automatique</h3>';
  h += '<p class="note-generation">Répartit les mini-terrains entre catégories <strong>selon le nombre ' +
       'd\'équipes</strong>, en gardant chaque catégorie groupée et en réservant la table des marques. ' +
       'Prévisualise la carte, puis applique.</p>';
  h += '<button type="button" class="bouton" id="bouton-repartir">' + svgIcone('terrain') + 'Répartir les terrains</button>';
  h += '<div id="repartition-resultat"></div>';

  zone.innerHTML = h;

  // Zone (re)construite depuis l'état ENREGISTRÉ → nouvelle référence pour le
  // détecteur de « modifications non enregistrées » de l'assistant.
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(zone);
}

/** Une ligne « grand terrain » (nom, type, longueur × largeur, supprimer). */
function ligneTerrainPhysique(t, i) {
  const type = (t.type === 'foot') ? 'foot' : 'rugby';
  const opt = function (v, lib, sel) { return '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' + lib + '</option>'; };
  const nature = String(t.nature || '');
  return '<div class="terrain-ligne" data-i="' + i + '">' +
    '<input class="tp-nom" type="text" value="' + echapper(String(t.nom || '')) + '" placeholder="Nom" aria-label="Nom du terrain">' +
    '<select class="tp-nature" aria-label="Nature du terrain (surface de jeu)">' +
      opt('', '— Nature —', nature === '') +
      NATURES_TERRAIN.map(function (n) { return opt(echapper(n), echapper(n), nature === n); }).join('') +
    '</select>' +
    '<select class="tp-type" aria-label="Type de terrain">' +
      opt('rugby', '🏉 Rugby', type === 'rugby') + opt('foot', '⚽ Foot', type === 'foot') +
    '</select>' +
    '<input class="tp-l" type="number" min="0" step="1" value="' + echapper(String(t.L || '')) + '" aria-label="Longueur (m)">' +
    '<span class="terr-x">×</span>' +
    '<input class="tp-w" type="number" min="0" step="1" value="' + echapper(String(t.W || '')) + '" aria-label="Largeur (m)">' +
    '<span class="terr-unite">m</span>' +
    '<span class="terr-enbut-lib">en-but</span>' +
    '<input class="tp-enbut" type="number" min="0" step="1" placeholder="0" value="' + echapper(String(t.enBut || '')) +
      '" aria-label="Profondeur de l\'en-but derrière chaque ligne de but (m)" ' +
      'title="Profondeur de l\'en-but derrière CHAQUE ligne de but (m) — la longueur est mesurée d\'une ligne de poteaux à l\'autre">' +
    '<span class="terr-unite">m</span>' +
    '<select class="tp-pos" aria-label="Emplacement sur le plan">' +
      EMPLACEMENTS.map(function (e) {
        return '<option value="' + e.v + '"' + ((t.pos || '') === e.v ? ' selected' : '') + '>' + e.l + '</option>';
      }).join('') +
    '</select>' +
    '<button type="button" class="terr-suppr" aria-label="Supprimer ce terrain">✕</button>' +
    '</div>';
}

/** Une ligne « taille de catégorie » (nom, terrain entier ?, longueur × largeur). */
function ligneDimensionCategorie(nom, d) {
  const plein = !!d.plein;
  return '<div class="dim-ligne" data-cat="' + echapper(nom) + '">' +
    '<span class="dim-nom">' + echapper(nom) + '</span>' +
    '<label class="mini-toggle"><input type="checkbox" class="dim-plein"' + (plein ? ' checked' : '') + '> terrain entier</label>' +
    '<span class="dim-taille"' + (plein ? ' hidden' : '') + '>' +
      '<input class="dim-l" type="number" min="0" step="1" value="' + echapper(String(plein ? '' : (d.l || ''))) + '" aria-label="Longueur (m)">' +
      '<span class="terr-x">×</span>' +
      '<input class="dim-w" type="number" min="0" step="1" value="' + echapper(String(plein ? '' : (d.w || ''))) + '" aria-label="Largeur (m)">' +
      '<span class="terr-unite">m</span>' +
    '</span>' +
    '</div>';
}

/** Tableau de capacité : une ligne par grand terrain, une colonne par catégorie. */
function tableauCapaciteHTML(terrains, dims, couloir, cats) {
  if (!cats || cats.length === 0) return '<p class="vide">Ajoute des catégories pour voir la capacité.</p>';
  let head = '<tr><th>Grand terrain</th>';
  cats.forEach(function (c) { head += '<th>' + echapper(c) + '</th>'; });
  head += '</tr>';
  let body = '';
  terrains.forEach(function (t) {
    body += '<tr><td class="cap-nom">' + echapper(String(t.nom || '?')) +
            ' <span class="cap-dim">' + (t.L || '?') + '×' + (t.W || '?') + '</span></td>';
    cats.forEach(function (c) {
      const d = dimensionCategorie(dims, c);
      const dimOk = d && (d.plein || (d.l > 0 && d.w > 0));
      const cap = dimOk ? capaciteTerrain({ L: +t.L, W: +t.W }, d, couloir) : '—';
      body += '<td>' + cap + (d && d.plein ? ' <span class="cap-plein">(entier)</span>' : '') + '</td>';
    });
    body += '</tr>';
  });
  return '<div class="tab-capacite-wrap"><table class="tab-capacite">' +
         '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
}

/* --- Lecture des saisies en cours (depuis le formulaire affiché) --- */
function lireTerrainsDuFormulaire() {
  const out = [];
  document.querySelectorAll('#liste-terrains-physiques .terrain-ligne').forEach(function (row) {
    out.push({
      nom:  row.querySelector('.tp-nom').value.trim(),
      nature: (row.querySelector('.tp-nature') || {}).value || '',
      type: row.querySelector('.tp-type').value,
      L:    parseFloat(row.querySelector('.tp-l').value) || 0,
      W:    parseFloat(row.querySelector('.tp-w').value) || 0,
      // Profondeur de l'en-but derrière CHAQUE ligne de but : espace réel du grand terrain qui
      // n'est PAS compté dans L (mesurée d'une ligne de poteaux à l'autre). 0 = non déclaré.
      enBut: parseFloat((row.querySelector('.tp-enbut') || {}).value) || 0,
      pos:  (row.querySelector('.tp-pos') || {}).value || ''
    });
  });
  return out;
}
function lireDimensionsDuFormulaire() {
  const out = {};
  document.querySelectorAll('#liste-dimensions-categories .dim-ligne').forEach(function (row) {
    const cat = row.getAttribute('data-cat');
    if (row.querySelector('.dim-plein').checked) { out[cat] = { plein: true }; }
    else {
      out[cat] = {
        l: parseFloat(row.querySelector('.dim-l').value) || 0,
        w: parseFloat(row.querySelector('.dim-w').value) || 0
      };
    }
  });
  return out;
}
function lireCouloir() {
  const el = document.getElementById('couloir-terrain');
  return el ? (parseFloat(el.value) || 0) : COULOIR_DEFAUT;
}
function lireTailleTM() {
  const l = parseFloat((document.getElementById('tm-l') || {}).value);
  const w = parseFloat((document.getElementById('tm-w') || {}).value);
  return { l: (l > 0 ? l : TM_L_DEFAUT), w: (w > 0 ? w : TM_W_DEFAUT) };
}

/** Recalcule et réaffiche le tableau de capacité à partir des saisies en cours. */
function recalculerCapacite() {
  const cible = document.getElementById('tableau-capacite');
  if (!cible) return;
  cible.innerHTML = tableauCapaciteHTML(
    lireTerrainsDuFormulaire(), lireDimensionsDuFormulaire(), lireCouloir(), categoriesPresentes());
}

/* --- Écouteurs délégués posés sur #zone-terrains (voir initAdmin) --- */
function onZoneTerrainsInput() { recalculerCapacite(); }

function onZoneTerrainsChange(evenement) {
  if (evenement.target.classList.contains('dim-plein')) {
    const taille = evenement.target.closest('.dim-ligne').querySelector('.dim-taille');
    if (taille) taille.hidden = evenement.target.checked; // masque L×W si « terrain entier »
  }
  recalculerCapacite();
}

function onZoneTerrainsClick(evenement) {
  // Carte de répartition : clic sur un mini-terrain = le mettre de côté (ajustement manuel).
  const tuileG = evenement.target.closest && evenement.target.closest('g[data-tuile]');
  if (tuileG) {
    retirerMiniTerrain(parseInt(tuileG.getAttribute('data-field'), 10), tuileG.getAttribute('data-tuile'));
    return;
  }
  // Carte de répartition : bouton ⟳ d'une pastille = pivoter le mini-terrain mis de côté.
  const pivot = evenement.target.closest && evenement.target.closest('.repart-chip-pivot');
  if (pivot) { pivoterChip(parseInt(pivot.getAttribute('data-pivot'), 10)); return; }
  if (evenement.target.id === 'bouton-valider-placement') { onValiderPlacement(); return; }
  if (evenement.target.id === 'bouton-ajouter-terrain') { ajouterTerrainPhysique(); return; }
  const suppr = evenement.target.closest('.terr-suppr');
  if (suppr) { suppr.closest('.terrain-ligne').remove(); recalculerCapacite(); return; }
  if (evenement.target.id === 'bouton-enregistrer-terrains') { onEnregistrerPlanTerrains(); return; }
  if (evenement.target.id === 'bouton-repartir') { onRepartir(); return; }
  if (evenement.target.id === 'bouton-appliquer-repartition') { onAppliquerRepartition(); return; }
}

function ajouterTerrainPhysique() {
  const liste = document.getElementById('liste-terrains-physiques');
  if (!liste) return;
  const i = liste.querySelectorAll('.terrain-ligne').length;
  liste.insertAdjacentHTML('beforeend',
    ligneTerrainPhysique({ nom: 'Terrain ' + (i + 1), type: 'rugby', L: 100, W: 68, pos: '' }, i));
  recalculerCapacite();
}

/** Enregistre le plan des terrains (grands terrains + couloir + tailles de catégorie). */
async function onEnregistrerPlanTerrains() {
  const message = document.getElementById('message-terrains');
  const bouton = document.getElementById('bouton-enregistrer-terrains');
  const terrains = lireTerrainsDuFormulaire();
  const dims = lireDimensionsDuFormulaire();
  const couloir = lireCouloir();
  const tm = lireTailleTM();

  if (terrains.length === 0) { afficherMessage(message, 'Ajoute au moins un grand terrain.', 'ko'); return; }
  const invalide = terrains.some(function (t) { return !(t.L > 0 && t.W > 0); });
  if (invalide) { afficherMessage(message, 'Chaque grand terrain doit avoir une longueur et une largeur.', 'ko'); return; }

  const data = {
    terrains_physiques:     JSON.stringify(terrains),
    couloir_terrain_m:      String(couloir),
    dimensions_categories:  JSON.stringify(dims),
    tm_longueur_m:          String(tm.l),
    tm_largeur_m:           String(tm.w)
  };
  const texte = bouton.textContent;
  bouton.disabled = true; bouton.textContent = 'Enregistrement…';
  try {
    await ecrireAdmin('enregistrerPlanTerrains', data);
    configCourante.global = Object.assign({}, configCourante.global, data);
    // Plan ENREGISTRÉ → l'assistant reprend sa photo de référence de la zone terrains.
    if (typeof assistantMarquerPropre === 'function') {
      assistantMarquerPropre(document.getElementById('zone-terrains'));
    }
    majEtatAvancement(); // le fil « Où en suis-je ? » suit le plan des terrains
    afficherMessage(message, '✅ Terrains enregistrés.', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  } finally {
    bouton.disabled = false; bouton.textContent = texte;
  }
}

/* ==========================================================================
   TERRAINS — étape 2 : répartition automatique + carte visuelle
   --------------------------------------------------------------------------
   Répartit les mini-terrains entre catégories selon le NOMBRE D'ÉQUIPES, en
   gardant chaque catégorie groupée. Deux catégories peuvent partager un grand
   terrain (scindé en deux). Sur chaque grand terrain (ou demi-terrain), 1
   mini-terrain central est réservé à la TABLE DES MARQUES (« TM »). U14 (plein)
   occupe un grand terrain entier. Prévisualisation (carte) avant application.
   ========================================================================== */

/* Palette de couleurs par catégorie (pour la carte + les puces du résumé). */
const PALETTE_CAT = ['#2E8FE0', '#27ae60', '#e67e22', '#8e44ad', '#16a085', '#c0392b', '#2c3e50'];

/* Répartition calculée en attente d'application (null = rien de calculé). */
let repartitionCalculee = null;

/** Nombre d'équipes par catégorie (d'après les équipes saisies). */
function equipesParCategorie() {
  const map = {};
  (equipesCourantes || []).forEach(function (e) {
    const c = String(e.categorie);
    map[c] = (map[c] || 0) + 1;
  });
  return map;
}

/** Préfixe court et unique pour nommer les mini-terrains (« Rugby 1 » → « R1 »). */
function prefixeTerrain(nom, i) {
  const s = String(nom || '').trim();
  const lettre = (s.toUpperCase().match(/[A-Z]/) || ['T'])[0];
  const num = (s.match(/(\d+)\s*$/) || [])[1] || String(i + 1);
  return lettre + num;
}
function construirePrefixes(fields) {
  const vus = {};
  return fields.map(function (f, i) {
    let p = prefixeTerrain(f.nom, i);
    if (vus[p]) { let k = 2; while (vus[p + k]) k++; p = p + k; }
    vus[p] = true; return p;
  });
}

/** Meilleure grille de tuiles (l×w) dans un rectangle L×W (2 orientations testées). */
function grille(L, W, tile, m) {
  let best = { cols: 0, rows: 0, a: tile.l, b: tile.w, n: 0 };
  [[tile.l, tile.w], [tile.w, tile.l]].forEach(function (o) {
    const a = o[0], b = o[1];
    const cols = Math.max(0, Math.floor((L + m) / (a + m)));
    const rows = Math.max(0, Math.floor((W + m) / (b + m)));
    const n = cols * rows;
    if (n > best.n) best = { cols: cols, rows: rows, a: a, b: b, n: n };
  });
  return best;
}
/** Répartition entière proportionnelle aux poids (méthode du plus fort reste). */
function repartitionProportionnelle(total, poids) {
  const somme = poids.reduce(function (a, b) { return a + b; }, 0) || 1;
  const brut = poids.map(function (w) { return total * w / somme; });
  const base = brut.map(Math.floor);
  let reste = total - base.reduce(function (a, b) { return a + b; }, 0);
  const ordre = brut.map(function (r, i) { return { i: i, frac: r - Math.floor(r) }; })
                    .sort(function (a, b) { return b.frac - a.frac; });
  for (let k = 0; k < ordre.length && reste > 0; k++) { base[ordre[k].i]++; reste--; }
  return base;
}

/**
 * Position de la table des marques : petite zone (tmL×tmW) placée dans le COULOIR le plus
 * proche du point cible (tX,tY) — donc entre les mini-terrains, sans en supprimer aucun.
 * (ox,oy) = origine de la zone ; renvoie des coordonnées absolues. split = deux tables (partage).
 */
function positionTableMarques(g, m, zoneL, zoneW, tmL, tmW, ox, oy, tX, tY, split) {
  const cxs = []; for (let i = 0; i < g.cols - 1; i++) cxs.push(i * (g.a + m) + g.a + m / 2); // couloirs verticaux
  const cys = []; for (let j = 0; j < g.rows - 1; j++) cys.push(j * (g.b + m) + g.b + m / 2); // couloirs horizontaux
  const proche = function (arr, cible, defaut) {
    return arr.length ? arr.reduce(function (p, c) { return Math.abs(c - cible) < Math.abs(p - cible) ? c : p; }) : defaut;
  };
  const cx = proche(cxs, tX, zoneL / 2);
  const cy = proche(cys, tY, zoneW / 2);
  const x = Math.max(0, Math.min(cx - tmL / 2, zoneL - tmL)); // reste dans la zone
  const y = Math.max(0, Math.min(cy - tmW / 2, zoneW - tmW));
  return { x: ox + x, y: oy + y, w: tmL, h: tmW, split: !!split };
}

/** Profondeur DÉCLARÉE de l'en-but d'un grand terrain (m, derrière CHAQUE ligne de but).
 *  Rien de deviné : 0 tant que l'utilisateur ne l'a pas mesurée. */
function profondeurEnBut(field) {
  const v = parseFloat((field || {}).enBut);
  return v > 0 ? v : 0;
}

/**
 * Pose la table de marque dans l'EN-BUT, DERRIÈRE une ligne de but. Le grand terrain est déclaré
 * d'une ligne de poteaux à l'autre : il reste de la place de part et d'autre (bandes de
 * profondeur `enBut` sur toute la largeur), invisible pour le calcul tant qu'on ne regarde que
 * le rectangle de jeu — d'où le « pas de place » alors qu'il en reste dans la réalité.
 * L'en-but n'est pas un couloir de circulation mais de l'espace DÉDIÉ : le couloir des
 * mini-terrains ne s'y applique pas (ils sont tous devant la ligne de but). La table est posée
 * au fond de la bande (côté ligne de ballon mort), du côté le plus proche du point visé.
 * @return {?{x,y,w,h,enBut:boolean}} coordonnées dans le repère du terrain (x<0 ou x>L), ou null.
 */
function placerDansEnBut(field, tmL, tmW, cx, cy) {
  const e = profondeurEnBut(field);
  if (!(e > 0) || tmL <= 0 || tmW <= 0) return null;
  let best = null, bestD = Infinity;
  [[tmL, tmW], [tmW, tmL]].forEach(function (o) {
    const w = o[0], h = o[1];
    if (w > e + 0.001 || h > field.W + 0.001) return;        // ne tient pas dans la bande
    const y = Math.max(0, Math.min(cy - h / 2, field.W - h)); // au plus près, sans sortir en largeur
    [-e, field.L + e - w].forEach(function (x) {              // fond de l'en-but, à gauche puis à droite
      const d = Math.pow(x + w / 2 - cx, 2) + Math.pow(y + h / 2 - cy, 2);
      if (d < bestD) { bestD = d; best = { x: x, y: y, w: w, h: h, enBut: true }; }
    });
  });
  return best;
}

/* --------------------------------------------------------------------------
   Sous-étapes du calcul de répartition (voir l'orchestrateur allouerTerrains).
   Chaque étape est une fonction NOMMÉE ; celles qui posent des mini-terrains
   partagent un CONTEXTE explicite `ctx` = { m, tmL, tmW, numero, avert,
   parCategorie, couleur } — avant, tout vivait en variables de closure au fond
   d'une seule fonction de ~220 lignes, dur à suivre et à tester.
   -------------------------------------------------------------------------- */

/**
 * Étape 1 — Grands terrains ENTIERS pour les catégories « plein » (U14),
 * proportionnellement aux équipes (en laissant au moins 1 grand terrain aux autres,
 * et en rognant la catégorie la plus servie en cas de dépassement).
 * Pose `c._fields` sur chaque catégorie « plein » ; renvoie le nombre de terrains pris.
 */
function attribuerTerrainsEntiers(plein, normaux, F, totalTeams, budget) {
  let pleinFields = 0;
  if (plein.length) {
    const capP = F - (normaux.length ? 1 : 0);            // laisser au moins 1 grand terrain aux autres
    const teamsPlein = plein.reduce(function (s, c) { return s + Math.max(1, c.teams); }, 0);
    let cible = Math.round(F * teamsPlein / totalTeams);
    cible = Math.max(plein.length, Math.min(cible, Math.max(0, capP)));
    const per = repartitionProportionnelle(cible, plein.map(function (c) { return Math.max(1, c.teams); }));
    // Chaque terrain « plein » = 1 match → plafonné à floor(équipes / 2) (matchs simultanés max).
    plein.forEach(function (c, i) { c._fields = Math.min(Math.max(1, per[i]), budget[c.name]); });
    let somme = plein.reduce(function (s, c) { return s + c._fields; }, 0);
    while (somme > Math.max(0, capP)) {                   // rogner si dépassement
      const gros = plein.reduce(function (a, b) { return b._fields > a._fields ? b : a; });
      if (gros._fields <= 1) break;
      gros._fields--; somme--;
    }
    plein.forEach(function (c) { pleinFields += c._fields; });
  }
  return pleinFields;
}

/**
 * Étape 2 — Distribue les grands terrains restants aux catégories « normales »,
 * en raisonnant en DEMI-terrains (une catégorie peut prendre une moitié) et en
 * ÉQUILIBRANT LA CHARGE : à chaque demi-terrain libre, on sert la catégorie qui a
 * le plus d'équipes PAR terrain déjà reçu. Comme un terrain U10 (grand) contient
 * moins de mini-terrains qu'un U8 (petit), une catégorie à grands terrains reçoit
 * naturellement plus de moitiés → le nombre de terrains suit vraiment les équipes.
 * Pose `c._halves` sur chaque catégorie « normale ».
 */
function attribuerDemisTerrains(normaux, fieldsNormaux, fieldsRestants, m, avert, budget) {
  if (normaux.length && fieldsRestants > 0) {
    const creneaux = 2 * fieldsRestants;                  // nb de demi-terrains à distribuer
    // Estimation du nb de mini-terrains qu'une catégorie tient sur une MOITIÉ de grand terrain
    // (moyenne sur les grands terrains restants, table des marques déduite).
    function estimDemi(cat) {
      let s = 0;
      fieldsNormaux.forEach(function (f) {
        const horiz = f.L >= f.W;
        s += packerZone(0, 0, horiz ? (f.L - m) / 2 : f.L, horiz ? f.W : (f.W - m) / 2, cat.tile, m).length;
      });
      return Math.max(0.1, s / fieldsNormaux.length);
    }
    const est = {}, tiles = {};
    normaux.forEach(function (c) { c._halves = 0; tiles[c.name] = 0; est[c.name] = estimDemi(c); });
    let used = 0;
    normaux.forEach(function (c) {                          // 1 demi garanti à chaque catégorie
      if (used < creneaux) { c._halves = 1; tiles[c.name] = est[c.name]; used++; }
      else avert.push('Espace insuffisant : ' + c.name + ' n’a pas reçu de terrain (ajoute un grand terrain).');
    });
    while (used < creneaux) {                               // le reste va à la plus « sous pression »
      let best = null, bestP = -1;
      normaux.forEach(function (c) {
        if (tiles[c.name] >= budget[c.name]) return;        // plafond équipes atteint → on n'ajoute plus
        const p = Math.max(1, c.teams) / (tiles[c.name] + 1);
        if (p > bestP) { bestP = p; best = c; }
      });
      if (!best) break;                                     // toutes plafonnées → terrains restants inutiles
      best._halves++; tiles[best.name] += est[best.name]; used++;
    }
  } else if (normaux.length) {
    normaux.forEach(function (c) { avert.push(c.name + ' : aucun grand terrain disponible.'); });
  }
}

/**
 * Étape 3 — Files d'attribution à partir de `_fields` / `_halves` : terrains SOLO
 * (entiers) et paires de catégories à SCINDER (une moitié chacune). Une moitié
 * orpheline (nombre impair de demi-catégories) devient un terrain entier.
 * @return { soloQueue:[{cat,plein}], paires:[[catA,catB]] }
 */
function construireFilesAttribution(plein, normaux) {
  const soloQueue = [];
  plein.forEach(function (c) { for (let k = 0; k < (c._fields || 0); k++) soloQueue.push({ cat: c, plein: true }); });
  normaux.forEach(function (c) { const wf = Math.floor((c._halves || 0) / 2); for (let k = 0; k < wf; k++) soloQueue.push({ cat: c, plein: false }); });
  const demiFile = [];
  normaux.forEach(function (c) { if ((c._halves || 0) % 2 === 1) demiFile.push(c); });
  const paires = [];
  for (let k = 0; k + 1 < demiFile.length; k += 2) paires.push([demiFile[k], demiFile[k + 1]]);
  if (demiFile.length % 2 === 1) soloQueue.push({ cat: demiFile[demiFile.length - 1], plein: false }); // moitié orpheline → terrain entier
  return { soloQueue: soloQueue, paires: paires };
}

/** Pose une catégorie SEULE sur un grand terrain : packing des mini-terrains
 *  (numérotés via ctx.numero) + table des marques dans le couloir central. */
function poserTerrainSolo(ctx, f, prefix, cat, estPlein) {
  if (estPlein) {                                       // U14 : le match occupe tout le terrain
    ctx.numero++; const id = String(ctx.numero);
    ctx.parCategorie[cat.name].push(id);
    return { field: f, prefix: prefix, mode: 'plein', zones: [{ cat: cat.name, color: ctx.couleur[cat.name],
      tiles: [{ id: id, x: 0, y: 0, w: f.L, h: f.W, label: cat.name + ' · ' + id }],
      table: { x: Math.max(0, f.L / 2 - ctx.tmL / 2), y: Math.max(0, f.W - ctx.tmW), w: ctx.tmL, h: ctx.tmW, split: false } }] };
  }
  const rects = packerZone(0, 0, f.L, f.W, cat.tile, ctx.m); // packing à orientations mixtes
  if (rects.length === 0) ctx.avert.push(f.nom + ' : trop petit pour un terrain ' + cat.name + '.');
  const tiles = [];                                        // tous les mini-terrains sont jouables
  rects.forEach(function (r) {
    if (ctx.parCategorie[cat.name].length >= ctx.budget[cat.name]) return; // plafond équipes atteint
    ctx.numero++; const id = String(ctx.numero);
    tiles.push({ id: id, x: r.x, y: r.y, w: r.w, h: r.h, label: id });
    ctx.parCategorie[cat.name].push(id);
  });
  // Table des marques : petite zone posée dans le couloir central (grille de référence).
  const gRef = grille(f.L, f.W, cat.tile, ctx.m);
  const table = rects.length ? positionTableMarques(gRef, ctx.m, f.L, f.W, ctx.tmL, ctx.tmW, 0, 0, f.L / 2, f.W / 2, false) : null;
  return { field: f, prefix: prefix, mode: 'solo', zones: [{ cat: cat.name, color: ctx.couleur[cat.name],
    tiles: tiles, table: table }] };
}

/** Pose DEUX catégories sur un grand terrain SCINDÉ en deux moitiés (coupe
 *  gauche/droite si le terrain est large, haut/bas sinon) : packing par moitié
 *  + une table des marques par moitié, côté séparation centrale. */
function poserTerrainScinde(ctx, f, prefix, cA, cB) {
  const horizontal = f.L >= f.W;                        // terrain large → coupe gauche/droite
  const zones = [];
  function demi(cat, ox, oy, zL, zW, suff, cote) {
    const rects = packerZone(ox, oy, zL, zW, cat.tile, ctx.m); // packing à orientations mixtes
    if (rects.length === 0) ctx.avert.push(f.nom + ' (demi) : trop petit pour ' + cat.name + '.');
    const tiles = [];                                    // tous les mini-terrains sont jouables
    rects.forEach(function (r) {
      if (ctx.parCategorie[cat.name].length >= ctx.budget[cat.name]) return; // plafond équipes atteint
      ctx.numero++; const id = String(ctx.numero);
      tiles.push({ id: id, x: r.x, y: r.y, w: r.w, h: r.h, label: id });
      ctx.parCategorie[cat.name].push(id);
    });
    // Table des marques : petite zone posée côté séparation centrale (→ deux tables face à face).
    const gRef = grille(zL, zW, cat.tile, ctx.m);
    const tX = horizontal ? (cote === 'gauche' ? zL : 0) : zL / 2;
    const tY = horizontal ? zW / 2 : (cote === 'haut' ? zW : 0);
    const table = rects.length ? positionTableMarques(gRef, ctx.m, zL, zW, ctx.tmL, ctx.tmW, ox, oy, tX, tY, true) : null;
    zones.push({ cat: cat.name, color: ctx.couleur[cat.name], tiles: tiles, table: table });
  }
  if (horizontal) {
    const hL = (f.L - ctx.m) / 2;
    demi(cA, 0, 0, hL, f.W, 'G', 'gauche');
    demi(cB, hL + ctx.m, 0, hL, f.W, 'D', 'droite');
  } else {
    const hW = (f.W - ctx.m) / 2;
    demi(cA, 0, 0, f.L, hW, 'H', 'haut');
    demi(cB, 0, hW + ctx.m, f.L, hW, 'B', 'bas');
  }
  return { field: f, prefix: prefix, mode: 'split', zones: zones };
}

/**
 * Étape 4 — Attribution des files aux grands terrains PHYSIQUES (solo d'abord,
 * puis scindés). Les terrains solo sont attribués de façon à MAXIMISER le nombre
 * de mini-terrains : chaque catégorie reçoit les grands terrains où elle « rentre »
 * le mieux (une catégorie à petits terrains profite d'un grand terrain).
 * @return fieldsPlan  la liste des grands terrains posés (pour la carte)
 */
function attribuerGrandsTerrains(ctx, fields, prefixes, soloQueue, paires, F) {
  const fieldsPlan = [];
  const dispo = fields.map(function (f, i) { return i; }); // indices de grands terrains libres

  // Catégories « plein » (U14) : un terrain entier = 1 match quel que soit sa taille → n'importe quel terrain.
  soloQueue.filter(function (s) { return s.plein; }).forEach(function (s) {
    if (!dispo.length) return;
    const i = dispo.shift();
    fieldsPlan.push(poserTerrainSolo(ctx, fields[i], prefixes[i], s.cat, true));
  });

  // Catégories normales : combien de terrains solo chacune (besoin), puis attribution GLOUTONNE
  // du meilleur couple (catégorie, grand terrain) au sens du nombre de mini-terrains.
  const besoin = {}, catParNom = {};
  soloQueue.filter(function (s) { return !s.plein; }).forEach(function (s) {
    besoin[s.cat.name] = (besoin[s.cat.name] || 0) + 1; catParNom[s.cat.name] = s.cat;
  });
  const couples = [];
  Object.keys(besoin).forEach(function (nom) {
    dispo.forEach(function (i) { couples.push({ nom: nom, i: i, n: capaciteTerrain(fields[i], catParNom[nom].tile, ctx.m) }); });
  });
  couples.sort(function (a, b) { return b.n - a.n; });        // meilleurs remplissages d'abord
  const prise = {};
  couples.forEach(function (c) {
    if (besoin[c.nom] > 0 && !prise[c.i]) {
      prise[c.i] = true; besoin[c.nom]--;
      fieldsPlan.push(poserTerrainSolo(ctx, fields[c.i], prefixes[c.i], catParNom[c.nom], false));
    }
  });
  const restants = dispo.filter(function (i) { return !prise[i]; });

  // Terrains à SCINDER (deux catégories) : sur les grands terrains restants.
  let r = 0;
  paires.forEach(function (p) {
    if (r >= restants.length) return;
    const i = restants[r++];
    fieldsPlan.push(poserTerrainScinde(ctx, fields[i], prefixes[i], p[0], p[1]));
  });
  if (soloQueue.length + paires.length > F) {
    ctx.avert.push('Pas assez de grands terrains : certaines catégories n’ont pas pu être placées.');
  }
  return fieldsPlan;
}

/**
 * Étape 5 — MIXAGE EN SECOURS (seulement si l'espace manque) : tant qu'une catégorie
 * « normale » est nettement plus chargée que les autres (ou n'a aucun terrain), on lui
 * ajoute un mini-terrain dans l'ESPACE LIBRE d'un autre grand terrain. Reste inactif
 * si équilibré. Modifie `fieldsPlan` en place et signale le mixage dans ctx.avert.
 */
function mixerEnSecours(ctx, fieldsPlan, normaux) {
  function ratioCat(c) {
    const n = ctx.parCategorie[c.name].length;
    if (n >= ctx.budget[c.name]) return 0;                 // plafond équipes atteint → plus « sous pression »
    return n > 0 ? c.teams / n : Infinity;
  }
  let mixage = 0, aMixe = false;
  while (mixage++ < 60 && normaux.length > 1) {
    let pire = null, prMax = -1, prMin = Infinity;
    normaux.forEach(function (c) { const rr = ratioCat(c); if (rr > prMax) { prMax = rr; pire = c; } if (rr < prMin) prMin = rr; });
    const declenche = pire && (prMax === Infinity || prMax > 1.5 * prMin); // net déséquilibre / catégorie à 0
    if (!declenche) break;
    let posee = false;
    for (let fpi = 0; fpi < fieldsPlan.length && !posee; fpi++) {
      const fp = fieldsPlan[fpi];
      if (fp.mode === 'plein') continue;
      if (fp.zones.length === 1 && fp.zones[0].cat === pire.name) continue; // déjà rempli pour elle
      const occ = [];
      fp.zones.forEach(function (z) { z.tiles.forEach(function (t) { occ.push(t); }); if (z.table) occ.push(z.table); });
      const nouv = placerDansLibre(fp.field.L, fp.field.W, occ, pire.tile.l, pire.tile.w, ctx.m, 1);
      if (!nouv.length) continue;
      const r = nouv[0]; ctx.numero++; const id = String(ctx.numero);
      const tuile = { id: id, x: r.x, y: r.y, w: r.w, h: r.h, label: id };
      ctx.parCategorie[pire.name].push(id);
      let zone = fp.zones.find(function (z) { return z.cat === pire.name; });
      if (zone) { zone.tiles.push(tuile); }
      else {                                              // 2ᵉ catégorie sur ce terrain → sa propre table
        const tm = placerDansLibre(fp.field.L, fp.field.W, occ.concat([r]), ctx.tmL, ctx.tmW, ctx.m, 1);
        fp.zones.forEach(function (z) { if (z.table) z.table.split = true; });
        fp.zones.push({ cat: pire.name, color: ctx.couleur[pire.name], tiles: [tuile],
          table: tm.length ? { x: tm[0].x, y: tm[0].y, w: ctx.tmL, h: ctx.tmW, split: true } : null });
        fp.mode = 'split';
      }
      posee = true; aMixe = true;
    }
    if (!posee) break;                                     // plus aucune place → on arrête
  }
  if (aMixe) ctx.avert.push('Espace serré : quelques terrains ont été ajoutés en partageant un grand terrain (mixage de catégories).');
}

/**
 * Calcule la répartition complète : quelle catégorie sur quel grand terrain, avec
 * la position de chaque mini-terrain (pour la carte) et la table des marques.
 * ORCHESTRATEUR : enchaîne les 5 étapes ci-dessus autour d'un contexte partagé `ctx`.
 * @return { fieldsPlan, parCategorie:{cat:[ids]}, couleur:{cat:hex}, avert:[] }
 */
function allouerTerrains(fields, cats, m, tmL, tmW) {
  // Contexte partagé par les sous-étapes. `numero` = compteur GLOBAL : les mini-terrains
  // sont numérotés 1, 2, 3… en continu sur tout le tournoi (numéro unique = pas de
  // confusion à la table des marques).
  const ctx = {
    m: m,
    tmL: tmL > 0 ? tmL : TM_L_DEFAUT,
    tmW: tmW > 0 ? tmW : TM_W_DEFAUT,
    numero: 0,
    avert: [],
    parCategorie: {},
    couleur: {}
  };
  cats.forEach(function (c, i) { ctx.parCategorie[c.name] = []; ctx.couleur[c.name] = PALETTE_CAT[i % PALETTE_CAT.length]; });

  // Plafond de terrains par catégorie : on ne propose JAMAIS plus de terrains que de matchs
  // pouvant tourner EN MÊME TEMPS = floor(équipes / 2) (une équipe ne joue pas deux matchs à la
  // fois → au-delà de ce nombre, les terrains resteraient vides). Sans équipes connues (0), pas
  // de plafond : on retombe sur le remplissage géométrique d'avant.
  ctx.budget = {};
  cats.forEach(function (c) {
    ctx.budget[c.name] = c.teams > 0 ? Math.max(1, Math.floor(c.teams / 2)) : Infinity;
  });

  const prefixes = construirePrefixes(fields);
  const F = fields.length;
  const totalTeams = cats.reduce(function (s, c) { return s + Math.max(1, c.teams); }, 0);
  const plein = cats.filter(function (c) { return c.tile.plein; });
  const normaux = cats.filter(function (c) { return !c.tile.plein; });

  // 1) Grands terrains ENTIERS pour les catégories « plein » (U14), proportionnel aux équipes.
  const pleinFields = attribuerTerrainsEntiers(plein, normaux, F, totalTeams, ctx.budget);

  // 2) Le reste des grands terrains pour les catégories « normales » (en demi-terrains).
  attribuerDemisTerrains(normaux, fields.slice(pleinFields), F - pleinFields, ctx.m, ctx.avert, ctx.budget);

  // 3) Files : terrains SOLO (entiers) et paires à SCINDER (une moitié chacune).
  const files = construireFilesAttribution(plein, normaux);

  // 4) Attribution aux grands terrains physiques (SOLO d'abord, puis SCINDÉS).
  const fieldsPlan = attribuerGrandsTerrains(ctx, fields, prefixes, files.soloQueue, files.paires, F);

  // 5) Mixage en secours si une catégorie reste nettement plus chargée que les autres.
  mixerEnSecours(ctx, fieldsPlan, normaux);

  // 6) Nettoyage : le plafond « équipes » peut laisser une zone SANS mini-terrain (un grand terrain
  //    attribué à une catégorie qui avait déjà atteint son plafond ailleurs). On retire ces zones
  //    vides ; un grand terrain devenu entièrement vide n'est plus dessiné (terrain non utilisé).
  const fieldsPropres = [];
  fieldsPlan.forEach(function (fp) {
    fp.zones = fp.zones.filter(function (z) { return z.tiles.length; });
    if (fp.zones.length === 1 && fp.mode === 'split') { fp.mode = 'solo'; fp.zones[0].table && (fp.zones[0].table.split = false); }
    if (fp.zones.length) fieldsPropres.push(fp);
  });

  return { fieldsPlan: fieldsPropres, parCategorie: ctx.parCategorie, couleur: ctx.couleur, avert: ctx.avert };
}

/** Bouton « Répartir » : calcule la répartition à partir des saisies en cours, l'affiche. */
function onRepartir() {
  const cont = document.getElementById('repartition-resultat');
  const fields = lireTerrainsDuFormulaire().filter(function (t) { return t.L > 0 && t.W > 0; });
  const dims = lireDimensionsDuFormulaire();
  const m = lireCouloir();
  const teams = equipesParCategorie();
  const cats = categoriesPresentes().map(function (n) { return { name: n, teams: teams[n] || 0, tile: dims[n] }; })
    .filter(function (c) { return c.tile && (c.tile.plein || (c.tile.l > 0 && c.tile.w > 0)); });

  if (fields.length === 0) { cont.innerHTML = '<div class="repart-avert">⚠️ Déclare au moins un grand terrain valide.</div>'; return; }
  if (cats.length === 0) { cont.innerHTML = '<div class="repart-avert">⚠️ Aucune catégorie avec une taille de terrain valide.</div>'; return; }

  const tm = lireTailleTM();
  repartitionCalculee = allouerTerrains(fields, cats, m, tm.l, tm.w);
  // Grands terrains déclarés mais non retenus par l'attribution : dessinés VIDES sur la carte,
  // pour servir de cibles au glisser-déposer de l'ajustement manuel.
  const prefixes = construirePrefixes(fields);
  fields.forEach(function (f, i) {
    const deja = repartitionCalculee.fieldsPlan.some(function (fp) { return fp.field === f; });
    if (!deja) repartitionCalculee.fieldsPlan.push({ field: f, prefix: prefixes[i], mode: 'solo', zones: [] });
  });
  // Contexte de l'ajustement manuel (mêmes données que le calcul : dimensions, couloir, TM).
  repartitionCalculee.ctxManuel = { cats: cats, m: m, tmL: tm.l, tmW: tm.w };
  repartitionCalculee.misDeCote = [];
  // Les TABLES DES MARQUES ne sont posées qu'À LA FIN, une fois le placement validé : tant qu'on
  // déplace des mini-terrains, elles occuperaient de la place et empêcheraient des positions
  // pourtant légitimes (elles se recalculent de toute façon après chaque changement).
  retirerTablesMarques(repartitionCalculee);
  afficherRepartition(repartitionCalculee, cats);
}

/** Retire toutes les tables des marques du plan (elles seront posées à la validation).
 *  `z.table` est nettoyé aussi : le calcul automatique en pose encore, et la table appartient
 *  désormais au GRAND TERRAIN (`fp.table`), plus à une catégorie. */
function retirerTablesMarques(res) {
  (res.fieldsPlan || []).forEach(function (fp) {
    fp.table = null;
    (fp.zones || []).forEach(function (z) { z.table = null; });
  });
  res.tablesPosees = false;
}

/** Tout ce qui occupe déjà un grand terrain : les mini-terrains et sa table de marque.
 *  Point de passage unique — le placement manuel et la pose des tables voient la même chose. */
function obstaclesDuTerrain(fp) {
  const occ = [];
  (fp.zones || []).forEach(function (z) {
    z.tiles.forEach(function (t) { occ.push(t); });
    if (z.table) occ.push(z.table);   // héritage du calcul automatique
  });
  if (fp.table) occ.push(fp.table);
  return occ;
}

/**
 * Pose les TABLES DES MARQUES une fois le placement des mini-terrains validé : **UNE SEULE par
 * GRAND TERRAIN**, quel que soit le nombre de catégories qui s'y partagent la place. Une table par
 * catégorie était plus sûre contre les erreurs de saisie, mais demandait trop de bénévoles : un
 * grand terrain accueillant de l'U8 et de l'U10 mobilisait deux tables.
 * Elle se pose dans l'espace LIBRE le plus proche du barycentre de TOUS les mini-terrains du grand
 * terrain (couloir respecté), et à défaut dans l'EN-BUT déclaré (derrière une ligne de but) : la
 * surface de jeu peut être pleine alors qu'il reste de la place au-delà des poteaux.
 * Un terrain « plein » (U14) a la sienne sur la ligne de touche, mais À L'EXTÉRIEUR du terrain :
 * le match occupe TOUTE la surface de jeu, la table n'a rien à y faire.
 */
function poserTablesMarques(res) {
  const ctx = res.ctxManuel || {};
  const m = ctx.m || 0, tmL = ctx.tmL || TM_L_DEFAUT, tmW = ctx.tmW || TM_W_DEFAUT;
  const manquantes = [];
  const sansEnBut = [];   // terrains sans place ET sans en-but déclaré : le message dit quoi faire
  (res.fieldsPlan || []).forEach(function (fp) {
    fp.table = null;
    (fp.zones || []).forEach(function (z) { z.table = null; }); // une seule table, portée par le terrain
    const tuiles = [];
    (fp.zones || []).forEach(function (z) { z.tiles.forEach(function (t) { tuiles.push(t); }); });
    if (!tuiles.length) return;                                 // grand terrain non utilisé

    if (fp.mode === 'plein') {
      // Le match occupe le grand terrain ENTIER : la table se met le long de la ligne de touche,
      // mais DEHORS (y = W, donc au-delà de la touche) — à mi-longueur pour tout voir.
      fp.table = { x: Math.max(0, fp.field.L / 2 - tmL / 2), y: fp.field.W,
                   w: tmL, h: tmW, horsTerrain: true };
      return;
    }
    // Barycentre de TOUS les mini-terrains du grand terrain : la table est au centre de gravité
    // de ce qu'elle doit surveiller, toutes catégories confondues.
    let sx = 0, sy = 0;
    tuiles.forEach(function (t) { sx += t.x + t.w / 2; sy += t.y + t.h / 2; });
    const cx = sx / tuiles.length, cy = sy / tuiles.length;
    const place = placerPresDe(fp.field.L, fp.field.W, tuiles, tmL, tmW, m, cx, cy);
    if (place) { fp.table = { x: place.x, y: place.y, w: place.w, h: place.h }; return; }
    // Plus un mètre carré entre les deux lignes de but : on regarde DERRIÈRE, dans l'en-but.
    const dansEnBut = placerDansEnBut(fp.field, tmL, tmW, cx, cy);
    if (dansEnBut) { fp.table = dansEnBut; return; }
    manquantes.push(fp.field.nom);
    if (!profondeurEnBut(fp.field)) sansEnBut.push(fp.field.nom);
  });
  res.tablesPosees = true;
  res.tablesManquantes = manquantes;
  res.tablesSansEnBut = sansEnBut;
}

/** Affiche le résumé + la carte + le bouton « Appliquer ». */
function afficherRepartition(res, cats) {
  const teams = equipesParCategorie();
  let h = '<h3 class="terr-titre">Résultat de la répartition</h3>';

  h += '<ul class="repart-resume">';
  cats.forEach(function (c) {
    const ids = res.parCategorie[c.name] || [];
    const noms = [];
    res.fieldsPlan.forEach(function (fp) {
      if (fp.zones.some(function (z) { return z.cat === c.name && z.tiles.length; }))
        noms.push(fp.field.nom + (fp.mode === 'split' ? ' (½)' : ''));
    });
    h += '<li><span class="repart-puce" style="background:' + res.couleur[c.name] + '"></span>' +
         '<strong>' + echapper(c.name) + '</strong> — ' + ids.length + ' terrain' + (ids.length > 1 ? 's' : '') +
         ' <span class="repart-detail">(' + (teams[c.name] || 0) + ' équipes · ' + (echapper(noms.join(', ')) || '—') + ')</span></li>';
  });
  h += '</ul>';

  if (res.avert.length) {
    h += '<div class="repart-avert">' + res.avert.map(function (a) { return '⚠️ ' + echapper(a); }).join('<br>') + '</div>';
  }

  h += '<div class="repart-carte-wrap">' + dessinerCarte(res) + '</div>';

  // Ajustement MANUEL : mini-terrains mis de côté (cliqués sur la carte), à reposer par
  // glisser-déposer À L'ENDROIT EXACT voulu, dans l'orientation voulue.
  h += '<p class="note-generation">✋ <strong>Placement manuel :</strong> clique un mini-terrain sur la ' +
       'carte pour le <strong>mettre de côté</strong>, puis fais-le <strong>glisser</strong> où tu veux sur ' +
       'un grand terrain. Il se pose <strong>exactement là où tu le lâches</strong> : pendant le glisser, ' +
       'un aperçu à l\'échelle montre l\'emplacement en <strong>vert</strong> s\'il est tenable, en ' +
       '<strong>rouge</strong> s\'il sort du terrain ou ne respecte pas le couloir de circulation' +
       (res.ctxManuel ? ' (' + res.ctxManuel.m + ' m)' : '') + '. Pour le poser en largeur plutôt qu\'en ' +
       'longueur, utilise le bouton <strong>⟳</strong> de la pastille ou la touche <strong>R</strong> ' +
       'pendant le glisser. Les numéros se recalculent tout seuls. « Répartir les terrains » recalcule ' +
       'tout et annule les ajustements.</p>';
  if ((res.misDeCote || []).length) {
    h += '<p class="note-generation">💡 Un mini-terrain peut aussi rester de côté <strong>volontairement</strong> ' +
         '(terrain que tu ne veux pas utiliser) : tu peux valider et appliquer sans le reposer. ' +
         'Avec moins de terrains la journée s\'allonge — l\'<strong>arbitrage des horaires</strong> le ' +
         'vérifiera à la génération du planning et proposera des pistes si l\'heure de fin est dépassée.</p>';
    h += '<div id="repart-tray" class="repart-tray" aria-label="Mini-terrains mis de côté">' +
      res.misDeCote.map(function (c, i) {
        if (c.plein) {
          return '<span class="repart-chip" data-chip="' + i + '" style="border-color:' + c.color + '">' +
            '<span class="repart-puce" style="background:' + c.color + '"></span>' +
            echapper(c.cat) + ' · terrain entier</span>';
        }
        const d = dimensionsChip(c);
        return '<span class="repart-chip" data-chip="' + i + '" style="border-color:' + c.color + '">' +
          '<span class="repart-puce" style="background:' + c.color + '"></span>' +
          echapper(c.cat) + ' · ' + Math.round(d.w) + '×' + Math.round(d.h) + ' m' +
          '<button type="button" class="repart-chip-pivot" data-pivot="' + i + '" ' +
          'title="Pivoter (longueur ↔ largeur)" aria-label="Pivoter ce mini-terrain">⟳</button></span>';
      }).join('') + '</div>';
  }

  // ÉTAPE DE VALIDATION : les tables des marques ne sont posées qu'une fois le placement figé —
  // pendant les déplacements elles occuperaient de la place et bloqueraient des positions valides.
  h += '<div class="ligne-action">';
  if (!res.tablesPosees) {
    h += '<button type="button" class="bouton" id="bouton-valider-placement">📍 Valider le placement ' +
         '(pose les tables de marque)</button>';
  } else {
    h += '<button type="button" class="bouton" id="bouton-appliquer-repartition">✅ Appliquer aux catégories</button>';
  }
  h += '<span id="message-repartition" class="message-form"></span></div>';

  if (!res.tablesPosees) {
    h += '<p class="note-generation">Les <strong>tables de marque</strong> ne sont pas encore posées : ' +
         'place d\'abord tous les mini-terrains comme tu le souhaites, puis valide — il en sera posé ' +
         '<strong>une seule par grand terrain</strong>, au centre de ce qu\'elle surveille.</p>';
  } else {
    h += '<p class="note-generation">La zone grise <strong>« TM »</strong> = table de marque : ' +
         '<strong>une seule par grand terrain</strong>, même quand deux catégories s\'y partagent la ' +
         'place (une table par catégorie demandait trop de bénévoles). Elle est posée dans l\'espace ' +
         'libre le plus proche du centre des mini-terrains qu\'elle couvre, et à défaut ' +
         '<strong>dans l\'en-but</strong> (bande hachurée derrière la ligne de but) quand la surface ' +
         'de jeu est pleine. Sur un grand terrain occupé <strong>en entier</strong> (U14), elle se ' +
         'met <strong>sur la ligne de touche, à l\'extérieur du terrain</strong>. Déplace encore un ' +
         'terrain et elles seront recalculées.</p>';
    if ((res.tablesManquantes || []).length) {
      const sans = res.tablesSansEnBut || [];
      h += '<div class="repart-avert">⚠️ Pas de place pour la table de marque : ' +
           echapper(res.tablesManquantes.join(', ')) + '. ' +
           (sans.length
             ? 'Aucun <strong>en-but</strong> déclaré sur ' + echapper(sans.join(', ')) + ' : la ' +
               'longueur est mesurée d\'une ligne de poteaux à l\'autre, indique la profondeur de ' +
               'l\'en-but dans « Grands terrains disponibles » et la table s\'y posera. Sinon, libère '
             : 'Même l\'en-but est trop peu profond : agrandis-le s\'il est sous-estimé, libère ') +
           'un peu d\'espace ou réduis la taille de la table.</div>';
    }
  }

  document.getElementById('repartition-resultat').innerHTML = h;

  // Glisser-déposer des mini-terrains mis de côté (pointerdown : souris ET tactile).
  const tray = document.getElementById('repart-tray');
  if (tray) tray.addEventListener('pointerdown', onChipPointerDown);
}

/* ==========================================================================
   TERRAINS — ajustement MANUEL de la répartition (glisser-déposer)
   --------------------------------------------------------------------------
   Sur la carte de PRÉVISUALISATION (avant « Appliquer ») : un clic sur un
   mini-terrain le MET DE CÔTÉ (pastille sous la carte), puis on le fait
   GLISSER sur le grand terrain voulu. Le dépôt cherche une place libre au
   plus près du point lâché, en respectant les dimensions de la catégorie
   ET le couloir de circulation (mêmes règles que le calcul automatique).
   Après chaque geste, les numéros sont RECALCULÉS en séquence (1, 2, 3…)
   dans l'ordre des grands terrains : la numérotation reste cohérente.
   ========================================================================== */

/** Renumérote TOUS les mini-terrains en séquence (ordre des grands terrains du plan),
 *  met à jour les étiquettes et reconstruit parCategorie. Idempotent. */
function renumeroterRepartition(res) {
  let n = 0;
  const par = {};
  Object.keys(res.parCategorie || {}).forEach(function (c) { par[c] = []; });
  res.fieldsPlan.forEach(function (fp) {
    fp.zones.forEach(function (z) {
      z.tiles.forEach(function (t) {
        n++; t.id = String(n);
        t.label = (fp.mode === 'plein') ? (z.cat + ' · ' + t.id) : t.id;
        if (!par[z.cat]) par[z.cat] = [];
        par[z.cat].push(t.id);
      });
    });
  });
  res.parCategorie = par;
}

/** Taille de mini-terrain d'une catégorie du calcul en cours ({plein} ou {l,w}), ou null. */
function tuileCategorieManuel(res, nomCat) {
  const c = ((res.ctxManuel || {}).cats || []).find(function (x) { return x.name === nomCat; });
  return c ? c.tile : null;
}

/** Clic sur un mini-terrain de la carte : le retire du plan et le met de côté (pastille). */
function retirerMiniTerrain(iField, id) {
  const res = repartitionCalculee;
  if (!res || !res.ctxManuel) return;
  const fp = res.fieldsPlan[iField];
  if (!fp) return;
  for (let zi = 0; zi < fp.zones.length; zi++) {
    const z = fp.zones[zi];
    const ti = z.tiles.findIndex(function (t) { return String(t.id) === String(id); });
    if (ti < 0) continue;
    const tile = tuileCategorieManuel(res, z.cat);
    if (!tile) return; // catégorie inconnue du calcul : on ne touche à rien
    // L'orientation actuelle de la tuile est CONSERVÉE dans la pastille : on la repose telle
    // qu'elle était (pivotée ou non), sans avoir à la refaire pivoter à la main.
    const tuileRetiree = z.tiles[ti];
    const l = tile.plein ? 0 : (parseFloat(tile.l) || 0);
    const w = tile.plein ? 0 : (parseFloat(tile.w) || 0);
    z.tiles.splice(ti, 1);
    res.misDeCote.push({ cat: z.cat, color: z.color, plein: !!tile.plein, l: l, w: w,
      pivote: !tile.plein && Math.abs(tuileRetiree.w - w) < 0.001 && Math.abs(l - w) > 0.001 });
    if (!z.tiles.length) fp.zones.splice(zi, 1);
    if (!fp.zones.length && fp.mode === 'plein') fp.mode = 'solo'; // terrain redevenu libre
    if (fp.zones.length === 1 && fp.mode === 'split') fp.mode = 'solo'; // plus qu'une catégorie
    // Le plan a changé : les tables déjà posées ne valent plus rien (recalculées à la validation).
    if (res.tablesPosees) retirerTablesMarques(res);
    renumeroterRepartition(res);
    afficherRepartition(res, res.ctxManuel.cats);
    return;
  }
}

/**
 * Cherche une place libre pour un mini-terrain (tl×tw) sur un grand terrain (fL×fW), AU PLUS
 * PRÈS du point visé (cx,cy), couloir m respecté vis-à-vis des zones occupées. Candidats : le
 * point lâché lui-même (recalé dans le terrain) + les bords des zones occupées (comme
 * placerDansLibre), dans les 2 orientations. @return {x,y,w,h} ou null si aucune place.
 */
function placerPresDe(fL, fW, occupees, tl, tw, m, cx, cy) {
  if (tl <= 0 || tw <= 0) return null;
  function libre(x, y, w, h) {
    if (x < -0.001 || y < -0.001 || x + w > fL + 0.001 || y + h > fW + 0.001) return false;
    for (let k = 0; k < occupees.length; k++) {
      const o = occupees[k];
      if (x < o.x + o.w + m - 0.001 && x + w + m - 0.001 > o.x &&
          y < o.y + o.h + m - 0.001 && y + h + m - 0.001 > o.y) return false; // trop près (< couloir)
    }
    return true;
  }
  let best = null, bestD = Infinity;
  [[tl, tw], [tw, tl]].forEach(function (o) {
    const w = o[0], h = o[1];
    const xs = [0, Math.max(0, Math.min(cx - w / 2, fL - w))];
    const ys = [0, Math.max(0, Math.min(cy - h / 2, fW - h))];
    occupees.forEach(function (ob) { xs.push(ob.x + ob.w + m); ys.push(ob.y + ob.h + m); });
    ys.forEach(function (y) {
      xs.forEach(function (x) {
        if (!libre(x, y, w, h)) return;
        const d = Math.pow(x + w / 2 - cx, 2) + Math.pow(y + h / 2 - cy, 2);
        if (d < bestD) { bestD = d; best = { x: x, y: y, w: w, h: h }; }
      });
    });
  });
  return best;
}

/** Dimensions AU SOL d'une pastille selon son orientation choisie : `pivote` échange
 *  longueur et largeur. @return {{w:number, h:number}} en mètres (w = axe X, h = axe Y). */
function dimensionsChip(chip) {
  if (!chip || chip.plein) return { w: 0, h: 0 };
  return chip.pivote ? { w: chip.w, h: chip.l } : { w: chip.l, h: chip.w };
}

/**
 * Position EXACTE d'un mini-terrain lâché en (xm,ym) : la tuile est CENTRÉE sur le point lâché,
 * puis simplement ramenée à l'intérieur du grand terrain si elle dépasse. Aucune recherche de
 * « meilleure place » : c'est l'utilisateur qui décide où poser, pas l'application.
 */
function positionExacte(fp, chip, xm, ym) {
  const d = dimensionsChip(chip);
  const x = Math.max(0, Math.min(xm - d.w / 2, fp.field.L - d.w));
  const y = Math.max(0, Math.min(ym - d.h / 2, fp.field.W - d.h));
  return { x: x, y: y, w: d.w, h: d.h };
}

/**
 * Un emplacement est-il TENABLE ? Seules deux règles physiques s'appliquent : tenir dans le grand
 * terrain, et garder le couloir de circulation avec tout ce qui est déjà posé. Rien d'autre — on
 * ne déplace ni ne « corrige » le choix de l'utilisateur.
 * @return {?string} null si l'emplacement est bon, sinon la raison du refus (message humain).
 */
function refusPlacement(fp, spot, m) {
  if (spot.w <= 0 || spot.h <= 0) return 'dimensions de catégorie invalides';
  if (spot.w > fp.field.L + 0.001 || spot.h > fp.field.W + 0.001) {
    return 'le mini-terrain (' + Math.round(spot.w) + '×' + Math.round(spot.h) + ' m) ne tient pas sur ' +
           fp.field.nom + ' (' + fp.field.L + '×' + fp.field.W + ' m) — pivote-le ou change de terrain';
  }
  const occ = obstaclesDuTerrain(fp);
  for (let k = 0; k < occ.length; k++) {
    const o = occ[k];
    if (spot.x < o.x + o.w + m - 0.001 && spot.x + spot.w + m - 0.001 > o.x &&
        spot.y < o.y + o.h + m - 0.001 && spot.y + spot.h + m - 0.001 > o.y) {
      return 'trop près d\'un autre terrain — il faut ' + m + ' m de couloir';
    }
  }
  return null;
}

/** Dépose la pastille iChip sur le grand terrain iField, EXACTEMENT au point (xm,ym) (mètres).
 *  Refuse (message) si l'emplacement choisi n'est pas tenable — sans jamais le déplacer ailleurs. */
function poserMiniTerrainSur(iField, iChip, xm, ym) {
  const res = repartitionCalculee;
  if (!res || !res.ctxManuel) return false;
  const fp = res.fieldsPlan[iField];
  const chip = (res.misDeCote || [])[iChip];
  const message = document.getElementById('message-repartition');
  if (!fp || !chip) return false;
  const ctx = res.ctxManuel;
  const aTuiles = fp.zones.some(function (z) { return z.tiles.length; });

  if (chip.plein) {
    // Catégorie « terrain entier » (U14) : uniquement sur un grand terrain VIDE.
    if (aTuiles) {
      afficherMessage(message, '⚠️ ' + chip.cat + ' occupe un grand terrain ENTIER : dépose-le sur un terrain vide.', 'ko');
      return false;
    }
    fp.mode = 'plein';
    fp.zones = [{ cat: chip.cat, color: chip.color,
      tiles: [{ id: '0', x: 0, y: 0, w: fp.field.L, h: fp.field.W, label: '' }], table: null }];
  } else {
    if (fp.mode === 'plein' && aTuiles) {
      afficherMessage(message, '⚠️ ' + fp.field.nom + ' est occupé en entier par ' + fp.zones[0].cat + ' : mets d\'abord ce match de côté.', 'ko');
      return false;
    }
    // `refusPlacement` regarde déjà la table du terrain (obstaclesDuTerrain) : un mini-terrain
    // ne peut pas se poser dessus, même après validation.
    const spot = positionExacte(fp, chip, xm, ym);
    const refus = refusPlacement(fp, spot, ctx.m);
    if (refus) {
      afficherMessage(message, '⚠️ ' + chip.cat + ' sur ' + fp.field.nom + ' : ' + refus + '.', 'ko');
      return false;
    }
    const tuile = { id: '0', x: spot.x, y: spot.y, w: spot.w, h: spot.h, label: '' };
    const zone = fp.zones.find(function (z) { return z.cat === chip.cat; });
    if (zone) zone.tiles.push(tuile);
    else {
      fp.zones.push({ cat: chip.cat, color: chip.color, tiles: [tuile], table: null });
      if (fp.zones.length > 1) fp.mode = 'split';
    }
  }
  res.misDeCote.splice(iChip, 1);
  // Le plan a changé : d'éventuelles tables déjà posées ne valent plus rien, on repart d'un
  // placement à valider (elles seront recalculées d'un coup à la validation).
  if (res.tablesPosees) retirerTablesMarques(res);
  renumeroterRepartition(res);
  afficherRepartition(res, ctx.cats);
  return true;
}

/** « Valider le placement » : fige la disposition et pose les tables de marque d'un seul coup.
 *  Des mini-terrains laissés de côté ne bloquent PAS : c'est un choix légitime (terrain qu'on ne
 *  souhaite pas utiliser). On le rappelle simplement — la journée sera plus longue, et le système
 *  d'arbitrage le vérifiera à la génération du planning. */
function onValiderPlacement() {
  const res = repartitionCalculee;
  if (!res || !res.ctxManuel) return;
  const restants = (res.misDeCote || []).length;
  poserTablesMarques(res);
  afficherRepartition(res, res.ctxManuel.cats);
  afficherMessage(document.getElementById('message-repartition'),
    restants
      ? '✅ Placement validé — ' + restants + ' mini-terrain(s) laissé(s) de côté ne seront pas ' +
        'utilisés. Moins de terrains = journée plus longue : l\'arbitrage des horaires le vérifiera ' +
        'à la génération du planning.'
      : '✅ Placement validé, tables de marque posées.', 'ok');
}

/** Pivote une pastille mise de côté (longueur ↔ largeur) et réaffiche. */
function pivoterChip(iChip) {
  const res = repartitionCalculee;
  const chip = res && (res.misDeCote || [])[iChip];
  if (!chip || chip.plein) return;
  chip.pivote = !chip.pivote;
  afficherRepartition(res, res.ctxManuel.cats);
}

/**
 * Glisser d'une pastille « mise de côté ». Pendant le déplacement, un APERÇU à l'échelle montre
 * l'emplacement EXACT qu'occupera le mini-terrain, en vert s'il est tenable, en rouge sinon
 * (hors terrain ou couloir non respecté) — on voit donc le résultat AVANT de lâcher, au lieu de
 * subir un placement automatique. La touche R (ou le bouton ⟳ de la pastille) pivote la tuile.
 */
function onChipPointerDown(evenement) {
  if (evenement.target.closest('.repart-chip-pivot')) return; // le bouton ⟳ n'amorce pas un glisser
  const chip = evenement.target.closest('.repart-chip');
  if (!chip) return;
  evenement.preventDefault();
  const iChip = parseInt(chip.getAttribute('data-chip'), 10);
  const res = repartitionCalculee;
  const donnees = res && (res.misDeCote || [])[iChip];
  if (!donnees) return;

  const apercu = document.createElement('div');
  apercu.className = 'repart-apercu';
  document.body.appendChild(apercu);
  let dernierEv = evenement;

  function terrainSous(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    return (el && el.closest) ? el.closest('g[data-terrain]') : null;
  }
  function nettoyerCible() {
    document.querySelectorAll('.carte-terrain.est-cible').forEach(function (r) { r.classList.remove('est-cible'); });
  }
  /** Emplacement visé (en mètres) sous le pointeur, ou null si on n'est pas sur un terrain. */
  function vise(ev) {
    const g = terrainSous(ev);
    if (!g) return null;
    const iField = parseInt(g.getAttribute('data-terrain'), 10);
    const fp = res.fieldsPlan[iField];
    const rect = g.querySelector('.carte-terrain');
    if (!fp || !rect) return null;
    const r = rect.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const xm = (ev.clientX - r.left) / r.width * fp.field.L;
    const ym = (ev.clientY - r.top) / r.height * fp.field.W;
    return { g: g, iField: iField, fp: fp, r: r, xm: xm, ym: ym };
  }
  function dessinerApercu(ev) {
    dernierEv = ev;
    nettoyerCible();
    const v = vise(ev);
    if (!v || donnees.plein) {
      // Hors terrain (ou catégorie « terrain entier ») : simple étiquette suiveuse.
      apercu.className = 'repart-apercu est-libre';
      apercu.style.left = ev.clientX + 'px'; apercu.style.top = ev.clientY + 'px';
      apercu.style.width = ''; apercu.style.height = '';
      apercu.textContent = donnees.plein ? donnees.cat + ' · terrain entier' : donnees.cat;
      if (v && donnees.plein) { const rr = v.g.querySelector('.carte-terrain'); if (rr) rr.classList.add('est-cible'); }
      return;
    }
    const rr = v.g.querySelector('.carte-terrain');
    if (rr) rr.classList.add('est-cible');
    const spot = positionExacte(v.fp, donnees, v.xm, v.ym);
    const refus = refusPlacement(v.fp, spot, res.ctxManuel.m);
    // Mètres → pixels écran, dans le repère du grand terrain survolé.
    const px = v.r.width / v.fp.field.L, py = v.r.height / v.fp.field.W;
    apercu.className = 'repart-apercu ' + (refus ? 'est-refuse' : 'est-ok');
    apercu.style.left = (v.r.left + spot.x * px) + 'px';
    apercu.style.top = (v.r.top + spot.y * py) + 'px';
    apercu.style.width = Math.max(2, spot.w * px) + 'px';
    apercu.style.height = Math.max(2, spot.h * py) + 'px';
    apercu.textContent = Math.round(spot.w) + '×' + Math.round(spot.h);
    apercu.title = refus || '';
  }
  function surTouche(ev) {
    if (ev.key !== 'r' && ev.key !== 'R') return;
    ev.preventDefault();
    donnees.pivote = !donnees.pivote;
    dessinerApercu(dernierEv);
  }
  function nettoyer() {
    document.removeEventListener('pointermove', dessinerApercu);
    document.removeEventListener('pointerup', lache);
    document.removeEventListener('pointercancel', nettoyer);
    document.removeEventListener('keydown', surTouche);
    apercu.remove();
    nettoyerCible();
  }
  function lache(ev) {
    const v = vise(ev);
    nettoyer();
    if (!v) return; // lâché hors carte : la pastille reste de côté, rien n'est perdu
    poserMiniTerrainSur(v.iField, iChip, v.xm, v.ym);
  }
  dessinerApercu(evenement);
  document.addEventListener('pointermove', dessinerApercu);
  document.addEventListener('pointerup', lache);
  document.addEventListener('pointercancel', nettoyer);
  document.addEventListener('keydown', surTouche);
}

/* Cellule (colonne, ligne) de chaque emplacement sur la grille 3×3 du plan. */
const POS_GRILLE = { HG: [0, 0], HC: [1, 0], HD: [2, 0], CG: [0, 1], CC: [1, 1], CD: [2, 1], BG: [0, 2], BC: [1, 2], BD: [2, 2] };

/** Dessine UN grand terrain (cadre + mini-terrains numérotés + table des marques) à (ox,oy).
 *  `iField` = index dans fieldsPlan : porté par le groupe (data-terrain) et par chaque
 *  mini-terrain (data-tuile) pour l'ajustement manuel (clic = mettre de côté, dépôt = poser). */
function groupeTerrain(fp, ox, oy, ppm, iField) {
  const fw = fp.field.L * ppm, fh = fp.field.W * ppm;
  const catsF = fp.zones.map(function (z) { return z.cat; }).join(' / ');
  let g = '<g transform="translate(' + ox.toFixed(1) + ',' + oy.toFixed(1) + ')" data-terrain="' + iField + '">';
  g += '<text x="0" y="-7" class="carte-titre"><tspan class="carte-nomterrain">' + echapper(fp.field.nom) +
       '</tspan>' + (catsF ? ' · ' + echapper(catsF) : '') + '</text>';
  // En-but déclaré : bandes hachurées de part et d'autre du rectangle de jeu (elles ne reçoivent
  // aucun mini-terrain, seulement la table de marque quand la surface de jeu est pleine).
  const eb = profondeurEnBut(fp.field) * ppm;
  if (eb > 0) {
    ['-' + eb.toFixed(1), fw.toFixed(1)].forEach(function (x) {
      g += '<rect x="' + x + '" y="0" width="' + eb.toFixed(1) + '" height="' + fh.toFixed(1) +
           '" class="carte-enbut"><title>En-but (' + profondeurEnBut(fp.field) + ' m)</title></rect>';
    });
  }
  g += '<rect x="0" y="0" width="' + fw.toFixed(1) + '" height="' + fh.toFixed(1) + '" class="carte-terrain"/>';
  fp.zones.forEach(function (z) {
    z.tiles.forEach(function (t) {
      const x = t.x * ppm, yy = t.y * ppm, w = t.w * ppm, hh = t.h * ppm;
      g += '<g class="carte-tuile-g" data-field="' + iField + '" data-tuile="' + echapper(String(t.id)) + '">' +
           '<title>Cliquer pour mettre ce mini-terrain de côté</title>';
      g += '<rect x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hh.toFixed(1) +
           '" rx="2" fill="' + z.color + '" fill-opacity="0.22" stroke="' + z.color + '" stroke-width="1"/>';
      if (w > 18 && hh > 12)
        g += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (yy + hh / 2 + 3).toFixed(1) + '" class="carte-tuile" fill="' + z.color + '">' + echapper(t.label) + '</text>';
      g += '</g>';
    });
  });
  // UNE SEULE table de marque, portée par le GRAND TERRAIN (plus par catégorie) : elle couvre
  // tous les mini-terrains posés dessus, U8 et U10 mélangés.
  if (fp.table) {
    // taille minimale d'affichage (une TM de 4 m ≈ 6 px, sinon invisible) — centrée sur sa vraie position
    const cxT = (fp.table.x + fp.table.w / 2) * ppm, cyT = (fp.table.y + fp.table.h / 2) * ppm;
    const tw = Math.max(fp.table.w * ppm, 9), th = Math.max(fp.table.h * ppm, 9);
    const tx = cxT - tw / 2, ty = cyT - th / 2;
    g += '<rect x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" width="' + tw.toFixed(1) + '" height="' + th.toFixed(1) + '" class="carte-table"><title>Table de marque du terrain' +
         (fp.table.enBut ? ' (dans l\'en-but)' : '') +
         (fp.table.horsTerrain ? ' (sur la touche, hors du terrain)' : '') + '</title></rect>';
    if (tw > 18 && th > 11) g += '<text x="' + cxT.toFixed(1) + '" y="' + (cyT + 3).toFixed(1) + '" class="carte-tm">TM</text>';
  }
  g += '</g>';
  return { g: g, w: fw, h: fh };
}

/** Dessine la carte SVG. Si des emplacements sont définis → plan « comme sur le site »
 *  (grille 3×3) ; sinon → pile verticale simple. */
function dessinerCarte(res) {
  const fps = res.fieldsPlan;
  const pad = 10, titreH = 20;
  const aPos = fps.some(function (fp) { return fp.field.pos && POS_GRILLE[fp.field.pos]; });

  // Échelle : les bandes d'en-but débordent du rectangle de jeu (de part et d'autre) — elles
  // comptent dans l'encombrement dessiné, sinon elles sortiraient de la carte.
  const enButMax = Math.max.apply(null, fps.map(function (fp) { return profondeurEnBut(fp.field); }).concat([0]));
  // Idem sous la ligne de touche : la table d'un terrain « plein » (U14) est posée DEHORS.
  const debordBas = Math.max.apply(null, fps.map(function (fp) {
    return fp.table ? Math.max(0, fp.table.y + fp.table.h - fp.field.W) : 0;
  }).concat([0]));

  if (aPos) {
    const maxDim = Math.max.apply(null, fps.map(function (fp) {
      return Math.max(fp.field.L + 2 * profondeurEnBut(fp.field), fp.field.W);
    }).concat([1]));
    const cell = 165, gap = 14, ppm = (cell - 4) / maxDim;
    const marge = enButMax * ppm;                          // place réservée à gauche pour l'en-but
    const occ = {}; let maxCol = 0, maxRow = 0; const parts = [];
    fps.forEach(function (fp, iField) {
      const p = POS_GRILLE[fp.field.pos] || [1, 1];
      let col = p[0]; const row = p[1];
      let key = col + ',' + row;
      while (occ[key]) { col++; key = col + ',' + row; }    // décale à droite si la cellule est prise
      occ[key] = true;
      maxCol = Math.max(maxCol, col); maxRow = Math.max(maxRow, row);
      const ox = pad + marge + col * (cell + gap);
      const oy = pad + titreH + row * (cell + titreH + gap);
      parts.push(groupeTerrain(fp, ox, oy, ppm, iField).g);
    });
    const width = pad * 2 + 2 * marge + (maxCol + 1) * (cell + gap);
    const height = pad * 2 + (maxRow + 1) * (cell + titreH + gap) + Math.max(0, debordBas * ppm - gap);
    return '<svg viewBox="0 0 ' + width.toFixed(0) + ' ' + height.toFixed(0) + '" width="100%" class="carte-svg" ' +
           'role="img" aria-label="Plan de répartition des terrains">' + parts.join('') + '</svg>';
  }

  // Repli : pile verticale (aucun emplacement défini).
  const maxL = Math.max.apply(null, fps.map(function (fp) {
    return fp.field.L + 2 * profondeurEnBut(fp.field);
  }).concat([1]));
  const ppm = 460 / maxL;
  const marge = enButMax * ppm;
  let y0 = 0; const parts = [];
  fps.forEach(function (fp, iField) {
    const t = groupeTerrain(fp, pad + marge, y0 + titreH, ppm, iField);
    parts.push(t.g);
    // + le débord sous la touche (table d'un terrain « plein » posée dehors) : sans lui, la
    // table chevaucherait le titre du terrain suivant.
    y0 += titreH + t.h + 16 + debordBas * ppm;
  });
  return '<svg viewBox="0 0 ' + (460 + 2 * pad + 2 * marge).toFixed(0) + ' ' + (y0 + 6).toFixed(0) + '" width="100%" class="carte-svg" ' +
         'role="img" aria-label="Carte de répartition des terrains">' + parts.join('') + '</svg>';
}

/** Applique la répartition : écrit le champ « Terrains » de chaque catégorie. */
async function onAppliquerRepartition() {
  if (!repartitionCalculee) return;
  const message = document.getElementById('message-repartition');
  const par = repartitionCalculee.parCategorie;
  const avecTerrains = Object.keys(par).filter(function (n) { return par[n] && par[n].length; });

  // On ne touche QUE les catégories en mode Auto : celles en Manuel gardent les terrains saisis.
  const catAuto = function (n) {
    const c = (configCourante.categories || []).find(function (x) { return String(x.categorie) === n; });
    return c && terrainsAutoDe(c);
  };
  const noms = avecTerrains.filter(catAuto);
  const ignorees = avecTerrains.filter(function (n) { return !catAuto(n); });

  if (noms.length === 0) {
    afficherMessage(message, ignorees.length
      ? 'Aucune catégorie en mode Auto : ' + ignorees.join(', ') + ' sont en Manuel (laissées telles quelles).'
      : 'Rien à appliquer.', 'ko');
    return;
  }

  // Mini-terrains laissés de côté : un CHOIX possible (terrain qu'on ne veut pas utiliser), pas
  // une anomalie — on l'énonce sans alarme. Grands terrains sans aucun mini-terrain : idem.
  const enAttente = (repartitionCalculee.misDeCote || []).length;
  const inutilises = repartitionCalculee.fieldsPlan
    .filter(function (fp) { return !fp.zones.some(function (z) { return z.tiles.length; }); })
    .map(function (fp) { return fp.field.nom; });
  // Catégorie dont TOUS les mini-terrains ont été mis de côté : son réglage actuel reste en place
  // (on n'efface jamais un champ « Terrains » sans le dire).
  const sansAucunTerrain = Object.keys(par).filter(function (n) { return !par[n] || !par[n].length; });

  const ok = await dialogConfirmer(
    'Écrire ces terrains dans les catégories en mode Auto ?\n\n' +
    noms.map(function (n) { return n + ' → ' + par[n].join(', '); }).join('\n') +
    (ignorees.length ? '\n\nLaissées telles quelles (mode Manuel) : ' + ignorees.join(', ') + '.' : '') +
    (enAttente ? '\n\n' + enAttente + ' mini-terrain(s) laissé(s) de côté : ils ne seront pas utilisés.' : '') +
    (inutilises.length ? '\n\nGrand(s) terrain(s) non utilisé(s) : ' + inutilises.join(', ') + '.' : '') +
    (sansAucunTerrain.length ? '\n\n⚠️ Sans aucun terrain : ' + sansAucunTerrain.join(', ') +
      ' — leur réglage « Terrains » actuel est CONSERVÉ (rien n\'est effacé).' : '') +
    ((enAttente || inutilises.length)
      ? '\n\nMoins de terrains = journée plus longue : à la génération du planning, l\'arbitrage des ' +
        'horaires vérifiera l\'heure de fin et proposera des pistes si besoin.' : '') +
    '\n\nCela remplace le champ « Terrains » de ces catégories (pris en compte à la prochaine génération du planning).',
    { ok: 'Appliquer' });
  if (!ok) return;

  // Composition des GRANDS terrains (nom → numéros de mini-terrains), mémorisée en Config :
  // la page Saisie des scores s'en sert pour filtrer les matchs par grand terrain (table de marque).
  const composition = {};
  repartitionCalculee.fieldsPlan.forEach(function (fp) {
    const ids = [];
    (fp.zones || []).forEach(function (z) { (z.tiles || []).forEach(function (t) { ids.push(t.id); }); });
    if (ids.length) composition[String(fp.field.nom)] = ids;
  });

  const bouton = document.getElementById('bouton-appliquer-repartition');
  if (bouton) { bouton.disabled = true; bouton.textContent = 'Application…'; }
  try {
    for (let k = 0; k < noms.length; k++) {
      const nom = noms[k];
      const catObj = (configCourante.categories || []).find(function (c) { return String(c.categorie) === nom; });
      if (!catObj) continue;
      const data = Object.assign({}, catObj, { terrains: par[nom].join(',') });
      await ecrireAdmin('enregistrerCategorie', data);
      const idx = configCourante.categories.findIndex(function (c) { return String(c.categorie) === nom; });
      if (idx >= 0) configCourante.categories[idx] = data;
    }
    // Mémorise la composition des grands terrains (pour le filtre de la page Saisie).
    const compositionJson = JSON.stringify(composition);
    await ecrireAdmin('enregistrerPlanTerrains', { repartition_grands_terrains: compositionJson });
    configCourante.global = Object.assign({}, configCourante.global,
      { repartition_grands_terrains: compositionJson });
    injecterReglages(configCourante.global, configCourante.categories); // les cartes catégories montrent les nouveaux terrains
    // IMPORTANT : on efface l'état « répartition en attente » AVANT de rafraîchir
    // le fil — sinon le verrou de la barre latérale voit encore « répartition
    // calculée → Appliquer » et l'étape suivante reste fermée jusqu'au clic suivant.
    repartitionCalculee = null;
    document.getElementById('repartition-resultat').innerHTML = '';
    majEtatAvancement(); // le fil ET le verrou suivent immédiatement
    await dialogAlerter('✅ Terrains appliqués aux catégories en mode Auto (' + noms.join(', ') + ').' +
      (ignorees.length ? '\nLaissées en Manuel : ' + ignorees.join(', ') + '.' : '') +
      '\nIls seront utilisés à la prochaine génération du planning.');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
    if (bouton) { bouton.disabled = false; bouton.textContent = '✅ Appliquer aux catégories'; }
  }
}
